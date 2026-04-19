import os
from fastapi import APIRouter, File, UploadFile

from app.services.whisper_svc import transcribe_bytes

router = APIRouter()


@router.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    suffix = os.path.splitext(file.filename or "audio.webm")[1] or ".webm"
    text = transcribe_bytes(audio_bytes, suffix)
    return {"text": text}
