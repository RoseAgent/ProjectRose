import os
import uuid
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from app.models.database import get_db, DATA_DIR
from app.services.recognizer import add_recording_embedding

router = APIRouter(prefix="/speakers")

RECORDINGS_DIR = os.path.join(DATA_DIR, "recordings")


class SpeakerCreate(BaseModel):
    name: str


class SpeakerUpdate(BaseModel):
    name: str


@router.get("")
async def list_speakers(conn=Depends(get_db)):
    rows = await conn.fetch("SELECT id, name, created_at FROM rosespeech.speakers ORDER BY name")
    return [dict(r) for r in rows]


@router.post("", status_code=201)
async def create_speaker(body: SpeakerCreate, conn=Depends(get_db)):
    try:
        row = await conn.fetchrow(
            "INSERT INTO rosespeech.speakers (name) VALUES ($1) RETURNING id, name, created_at",
            body.name,
        )
        return dict(row)
    except Exception:
        raise HTTPException(status_code=409, detail="Speaker name already exists")


@router.put("/{speaker_id}")
async def update_speaker(speaker_id: int, body: SpeakerUpdate, conn=Depends(get_db)):
    row = await conn.fetchrow(
        "UPDATE rosespeech.speakers SET name=$1 WHERE id=$2 RETURNING id, name, created_at",
        body.name,
        speaker_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Speaker not found")
    return dict(row)


@router.post("/{speaker_id}/samples", status_code=201)
async def add_sample(
    speaker_id: int,
    source: str = Form(...),
    project_id: str = Form(None),
    file: UploadFile = File(...),
    conn=Depends(get_db),
):
    speaker = await conn.fetchrow("SELECT id FROM rosespeech.speakers WHERE id=$1", speaker_id)
    if not speaker:
        raise HTTPException(status_code=404, detail="Speaker not found")

    audio_bytes = await file.read()
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    filename = f"{uuid.uuid4()}{suffix}"

    speaker_dir = os.path.join(RECORDINGS_DIR, str(speaker_id))
    os.makedirs(speaker_dir, exist_ok=True)
    audio_path = os.path.join(speaker_dir, filename)

    with open(audio_path, "wb") as f:
        f.write(audio_bytes)

    relative_path = os.path.join("data", "recordings", str(speaker_id), filename)

    row = await conn.fetchrow(
        """
        INSERT INTO rosespeech.recordings (speaker_id, audio_path, source, project_id)
        VALUES ($1, $2, $3, $4) RETURNING id
        """,
        speaker_id,
        relative_path,
        source,
        project_id,
    )

    try:
        add_recording_embedding(speaker_id, audio_path)
    except Exception:
        pass

    return {"id": row["id"], "audio_path": relative_path}
