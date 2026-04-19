"""
WebSocket endpoint for Active Listening.

Each WebSocket message from the client is a complete, self-contained audio
recording (a full WebM blob from MediaRecorder). The client stop/restarts
its recorder every ~3 seconds to produce complete blobs.

Server response per message (JSON):
  {"type": "utterance", "utterance_id": int, "speaker_name": str|null, "text": str}
  {"type": "silence"}
  {"type": "error", "message": str}
"""
import asyncio
import json
import os
import uuid

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from app.models.database import get_pool
from app.services.whisper_svc import transcribe_bytes
from app.services.recognizer import identify_speaker

router = APIRouter()

RECORDINGS_DIR = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "recordings")
)
SILENCE_MIN_CHARS = 2


@router.websocket("/ws/live")
async def live_transcription(websocket: WebSocket, session_id: int = Query(...)):
    await websocket.accept()
    pool = get_pool()

    try:
        while True:
            try:
                audio_bytes = await websocket.receive_bytes()
            except WebSocketDisconnect:
                break

            asyncio.create_task(_process_chunk(websocket, pool, session_id, audio_bytes))

    finally:
        pass


async def _process_chunk(
    websocket: WebSocket,
    pool,
    session_id: int,
    audio_bytes: bytes,
):
    loop = asyncio.get_event_loop()

    try:
        text = await loop.run_in_executor(None, transcribe_bytes, audio_bytes, ".webm")
    except Exception as e:
        await _send(websocket, {"type": "error", "message": str(e)})
        return

    if not text or len(text.strip()) < SILENCE_MIN_CHARS:
        await _send(websocket, {"type": "silence"})
        return

    try:
        speaker_id = await loop.run_in_executor(None, identify_speaker, audio_bytes)
    except Exception:
        speaker_id = None

    async with pool.acquire() as conn:
        speaker_name = None
        if speaker_id is not None:
            row = await conn.fetchrow(
                "SELECT name FROM rosespeech.speakers WHERE id=$1", speaker_id
            )
            if row:
                speaker_name = row["name"]

        filename = f"{uuid.uuid4()}.webm"
        speaker_dir = os.path.join(RECORDINGS_DIR, str(speaker_id or "unknown"))
        os.makedirs(speaker_dir, exist_ok=True)
        audio_path = os.path.join(speaker_dir, filename)
        with open(audio_path, "wb") as f:
            f.write(audio_bytes)

        relative_path = os.path.join(
            "data", "recordings", str(speaker_id or "unknown"), filename
        )

        recording_id = await conn.fetchval(
            """
            INSERT INTO rosespeech.recordings (speaker_id, audio_path, source)
            VALUES ($1, $2, 'active_listening') RETURNING id
            """,
            speaker_id,
            relative_path,
        )

        utterance_id = await conn.fetchval(
            """
            INSERT INTO rosespeech.utterances (session_id, recording_id, speaker_id, text)
            VALUES ($1, $2, $3, $4) RETURNING id
            """,
            session_id,
            recording_id,
            speaker_id,
            text.strip(),
        )

    await _send(websocket, {
        "type": "utterance",
        "utterance_id": utterance_id,
        "speaker_name": speaker_name,
        "text": text.strip(),
    })


async def _send(ws: WebSocket, data: dict):
    if ws.client_state == WebSocketState.CONNECTED:
        try:
            await ws.send_text(json.dumps(data))
        except Exception:
            pass
