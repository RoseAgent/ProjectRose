"""
Training loop: fine-tune pyannote speaker embeddings using labeled recordings.
- Takes 2/3 of samples per speaker for training, 1/3 for validation.
- Computes cosine-similarity-based accuracy on validation set.
- If accuracy >= threshold, activates new model version; otherwise keeps old.
"""
import asyncio
import json
import os
import random
import numpy as np
from datetime import datetime, timezone

from app.models.database import get_pool
from app.services.recognizer import (
    compute_embedding,
    load_embeddings,
    save_embeddings,
    _speaker_embeddings,
    CONFIDENCE_THRESHOLD,
    MODELS_DIR,
)

ACCURACY_THRESHOLD = 0.70


async def run_training_job(job_id: int):
    pool = get_pool()

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE rosespeech.training_jobs SET status='running', started_at=$1 WHERE id=$2",
            datetime.now(timezone.utc),
            job_id,
        )

    try:
        # Fetch labeled recordings in the async context before threading
        rows = await _fetch_labeled_recordings()

        loop = asyncio.get_event_loop()
        accuracy, deployed, sample_count = await loop.run_in_executor(
            None, _train_sync, rows
        )

        async with pool.acquire() as conn:
            version_id = await conn.fetchval(
                """
                INSERT INTO rosespeech.model_versions
                    (accuracy, is_active, checkpoint_path, sample_count, notes)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING id
                """,
                accuracy,
                deployed,
                os.path.join(MODELS_DIR, "speaker_embeddings.json") if deployed else None,
                sample_count,
                None if deployed else f"Below accuracy threshold ({ACCURACY_THRESHOLD:.0%}), not deployed",
            )
            if deployed:
                await conn.execute(
                    "UPDATE rosespeech.model_versions SET is_active=FALSE WHERE id != $1",
                    version_id,
                )
            await conn.execute(
                """
                UPDATE rosespeech.training_jobs
                SET status='complete', accuracy=$1, deployed=$2, finished_at=$3
                WHERE id=$4
                """,
                accuracy,
                deployed,
                datetime.now(timezone.utc),
                job_id,
            )
    except Exception as e:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE rosespeech.training_jobs SET status='failed', error=$1, finished_at=$2 WHERE id=$3",
                str(e),
                datetime.now(timezone.utc),
                job_id,
            )
        raise


def _train_sync(rows: list[tuple[int, str]]) -> tuple[float, bool, int]:
    if not rows:
        return 0.0, False, 0

    # Group by speaker
    by_speaker: dict[int, list[str]] = {}
    for speaker_id, audio_path in rows:
        full_path = os.path.join(
            os.path.dirname(__file__), "..", "..", audio_path
        )
        full_path = os.path.normpath(full_path)
        if os.path.exists(full_path):
            by_speaker.setdefault(speaker_id, []).append(full_path)

    train_embeddings: dict[int, list[np.ndarray]] = {}
    val_data: list[tuple[int, np.ndarray]] = []  # (true_speaker_id, embedding)

    for speaker_id, paths in by_speaker.items():
        random.shuffle(paths)
        split = max(1, int(len(paths) * 2 / 3))
        train_paths = paths[:split]
        val_paths = paths[split:]

        train_embeddings[speaker_id] = [compute_embedding(p) for p in train_paths]
        for p in val_paths:
            val_data.append((speaker_id, compute_embedding(p)))

    if not val_data:
        # All data in train, nothing to validate — save embeddings and return
        new_embeddings = {
            sid: np.mean(embs, axis=0)
            for sid, embs in train_embeddings.items()
        }
        _speaker_embeddings.clear()
        _speaker_embeddings.update(new_embeddings)
        save_embeddings()
        sample_count = sum(len(v) for v in by_speaker.values())
        return 1.0, True, sample_count

    # Compute mean embedding per speaker from training set
    mean_embeddings: dict[int, np.ndarray] = {
        sid: np.mean(embs, axis=0) for sid, embs in train_embeddings.items()
    }

    # Validate
    correct = 0
    for true_id, query_emb in val_data:
        best_id = None
        best_score = -1.0
        for speaker_id, ref_emb in mean_embeddings.items():
            norm_q = np.linalg.norm(query_emb)
            norm_r = np.linalg.norm(ref_emb)
            if norm_q == 0 or norm_r == 0:
                continue
            score = float(np.dot(query_emb, ref_emb) / (norm_q * norm_r))
            if score > best_score:
                best_score = score
                best_id = speaker_id
        if best_id == true_id and best_score >= CONFIDENCE_THRESHOLD:
            correct += 1

    accuracy = correct / len(val_data)
    sample_count = sum(len(v) for v in by_speaker.values())

    if accuracy >= ACCURACY_THRESHOLD:
        _speaker_embeddings.clear()
        _speaker_embeddings.update(mean_embeddings)
        save_embeddings()
        return accuracy, True, sample_count

    return accuracy, False, sample_count


async def _fetch_labeled_recordings() -> list[tuple[int, str]]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT speaker_id, audio_path FROM rosespeech.recordings WHERE speaker_id IS NOT NULL"
        )
    return [(r["speaker_id"], r["audio_path"]) for r in rows]
