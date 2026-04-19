"""
Speaker identification using resemblyzer embeddings (fully local).
Maintains a per-speaker mean embedding in memory and on disk.
"""
import json
import os
from typing import Optional

import numpy as np

from app.services.diarizer import embed_audio_bytes, embed_audio_file

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "models")
EMBEDDINGS_PATH = os.path.join(MODELS_DIR, "speaker_embeddings.json")
CONFIDENCE_THRESHOLD = 0.75

_speaker_embeddings: dict[int, np.ndarray] = {}


def load_embeddings():
    global _speaker_embeddings
    if not os.path.exists(EMBEDDINGS_PATH):
        _speaker_embeddings = {}
        return
    with open(EMBEDDINGS_PATH) as f:
        raw = json.load(f)
    _speaker_embeddings = {int(k): np.array(v) for k, v in raw.items()}


def save_embeddings():
    os.makedirs(MODELS_DIR, exist_ok=True)
    with open(EMBEDDINGS_PATH, "w") as f:
        json.dump({str(k): v.tolist() for k, v in _speaker_embeddings.items()}, f)


def add_recording_embedding(speaker_id: int, audio_path: str):
    embedding = embed_audio_file(audio_path)
    if speaker_id in _speaker_embeddings:
        _speaker_embeddings[speaker_id] = (_speaker_embeddings[speaker_id] + embedding) / 2
    else:
        _speaker_embeddings[speaker_id] = embedding
    save_embeddings()


def _cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


def identify_speaker(audio_bytes: bytes) -> Optional[int]:
    if not _speaker_embeddings:
        load_embeddings()
    if not _speaker_embeddings:
        return None

    try:
        query = embed_audio_bytes(audio_bytes)
    except Exception:
        return None

    best_id, best_score = None, -1.0
    for speaker_id, ref in _speaker_embeddings.items():
        score = _cosine(query, ref)
        if score > best_score:
            best_score, best_id = score, speaker_id

    return best_id if best_score >= CONFIDENCE_THRESHOLD else None


def compute_embedding(audio_path: str) -> np.ndarray:
    return embed_audio_file(audio_path)
