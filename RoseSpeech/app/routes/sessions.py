import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.models.database import get_db
from app.services.recognizer import add_recording_embedding

router = APIRouter(prefix="/sessions")

RECORDINGS_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "recordings")
)


class SessionCreate(BaseModel):
    project_id: str | None = None


class SessionEnd(BaseModel):
    ended_at: datetime | None = None


class LabelSpeaker(BaseModel):
    speaker_id: int | None = None
    speaker_name: str | None = None


@router.post("", status_code=201)
async def create_session(body: SessionCreate, conn=Depends(get_db)):
    row = await conn.fetchrow(
        "INSERT INTO rosespeech.sessions (project_id) VALUES ($1) RETURNING id, project_id, started_at",
        body.project_id,
    )
    return dict(row)


@router.patch("/{session_id}/end")
async def end_session(session_id: int, body: SessionEnd, conn=Depends(get_db)):
    count = await conn.fetchval(
        "SELECT COUNT(*) FROM rosespeech.utterances WHERE session_id=$1", session_id
    )
    if count == 0:
        await conn.execute("DELETE FROM rosespeech.sessions WHERE id=$1", session_id)
        return {"ok": True, "deleted": True}

    ended = body.ended_at or datetime.now(timezone.utc)
    row = await conn.fetchrow(
        "UPDATE rosespeech.sessions SET ended_at=$1 WHERE id=$2 RETURNING id",
        ended,
        session_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"ok": True, "deleted": False}


@router.get("")
async def list_sessions(conn=Depends(get_db)):
    rows = await conn.fetch(
        "SELECT id, project_id, started_at, ended_at FROM rosespeech.sessions ORDER BY started_at DESC"
    )
    return [dict(r) for r in rows]


@router.get("/{session_id}/utterances")
async def get_utterances(session_id: int, conn=Depends(get_db)):
    rows = await conn.fetch(
        """
        SELECT u.id, u.text, u.start_seconds, u.end_seconds, u.created_at,
               s.name AS speaker_name, u.speaker_id
        FROM rosespeech.utterances u
        LEFT JOIN rosespeech.speakers s ON s.id = u.speaker_id
        WHERE u.session_id = $1
        ORDER BY u.start_seconds ASC
        """,
        session_id,
    )
    return [dict(r) for r in rows]


@router.put("/utterances/{utterance_id}/speaker")
async def label_utterance_speaker(
    utterance_id: int,
    body: LabelSpeaker,
    conn=Depends(get_db),
):
    speaker_id = body.speaker_id

    if speaker_id is None and body.speaker_name:
        existing = await conn.fetchrow(
            "SELECT id FROM rosespeech.speakers WHERE name=$1", body.speaker_name
        )
        if existing:
            speaker_id = existing["id"]
        else:
            row = await conn.fetchrow(
                "INSERT INTO rosespeech.speakers (name) VALUES ($1) RETURNING id",
                body.speaker_name,
            )
            speaker_id = row["id"]

    utterance = await conn.fetchrow(
        "SELECT recording_id FROM rosespeech.utterances WHERE id=$1", utterance_id
    )
    if not utterance:
        raise HTTPException(status_code=404, detail="Utterance not found")

    await conn.execute(
        "UPDATE rosespeech.utterances SET speaker_id=$1 WHERE id=$2",
        speaker_id,
        utterance_id,
    )

    if utterance["recording_id"] and speaker_id:
        rec = await conn.fetchrow(
            "SELECT audio_path FROM rosespeech.recordings WHERE id=$1",
            utterance["recording_id"],
        )
        if rec:
            await conn.execute(
                "UPDATE rosespeech.recordings SET speaker_id=$1 WHERE id=$2",
                speaker_id,
                utterance["recording_id"],
            )
            full_path = os.path.normpath(
                os.path.join(
                    os.path.dirname(__file__), "..", "..", rec["audio_path"]
                )
            )
            if os.path.exists(full_path):
                try:
                    add_recording_embedding(speaker_id, full_path)
                except Exception:
                    pass

    return {"ok": True, "speaker_id": speaker_id}
