"""
Speaker embedding using resemblyzer (fully local, no HuggingFace).
Converts audio bytes to a 256-dim speaker embedding via ffmpeg + GE2E model.
"""
import subprocess
import numpy as np

_encoder = None


def _get_encoder():
    global _encoder
    if _encoder is None:
        from resemblyzer import VoiceEncoder
        _encoder = VoiceEncoder()
    return _encoder


def bytes_to_pcm(audio_bytes: bytes) -> np.ndarray:
    """Convert any audio format to float32 PCM at 16 kHz mono via ffmpeg."""
    proc = subprocess.run(
        [
            "ffmpeg", "-i", "pipe:0",
            "-ar", "16000", "-ac", "1",
            "-f", "f32le", "-loglevel", "quiet",
            "pipe:1",
        ],
        input=audio_bytes,
        capture_output=True,
    )
    if proc.returncode != 0 or not proc.stdout:
        raise ValueError("ffmpeg conversion failed — audio may be too short or corrupt")
    return np.frombuffer(proc.stdout, dtype=np.float32)


def embed_audio_bytes(audio_bytes: bytes) -> np.ndarray:
    """Return a 256-dim speaker embedding for the given audio bytes."""
    wav = bytes_to_pcm(audio_bytes)
    from resemblyzer import preprocess_wav
    wav = preprocess_wav(wav, source_sr=16000)
    encoder = _get_encoder()
    return encoder.embed_utterance(wav)


def embed_audio_file(path: str) -> np.ndarray:
    with open(path, "rb") as f:
        return embed_audio_bytes(f.read())
