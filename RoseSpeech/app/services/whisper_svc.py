import tempfile
import os

_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("base", device="cpu", compute_type="int8")
    return _model


def transcribe_bytes(audio_bytes: bytes, suffix: str = ".webm") -> str:
    model = _get_model()
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name
    try:
        segments, _ = model.transcribe(tmp_path, beam_size=5)
        return " ".join(seg.text.strip() for seg in segments).strip()
    finally:
        os.unlink(tmp_path)


def transcribe_file(path: str) -> str:
    model = _get_model()
    segments, _ = _get_model().transcribe(path, beam_size=5)
    return " ".join(seg.text.strip() for seg in segments).strip()
