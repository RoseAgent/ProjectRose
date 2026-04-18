import os
import random
from pathlib import Path

PILE_DIR = Path(os.environ.get("PILE_DIR", "/app/pile"))


def pile_available(pile_dir: Path = PILE_DIR) -> bool:
    return pile_dir.exists() and any(pile_dir.rglob("*.parquet"))


def sample_pile_texts(pile_dir: Path, max_tokens: int, seed: int = 42) -> list[str]:
    """
    Stream parquet shards in random order, collecting text rows until the estimated
    token count reaches max_tokens. Uses pyarrow.dataset for lazy reads — no full
    shard is loaded into memory at once.
    """
    import pyarrow.dataset as pad

    AVG_CHARS_PER_TOKEN = 4
    target_chars = max_tokens * AVG_CHARS_PER_TOKEN

    parquet_files = sorted(pile_dir.rglob("*.parquet"))
    rng = random.Random(seed)
    rng.shuffle(parquet_files)

    texts: list[str] = []
    total_chars = 0

    for pf in parquet_files:
        if total_chars >= target_chars:
            break
        try:
            ds = pad.dataset(str(pf), format="parquet")
            for batch in ds.to_batches(columns=["text"], batch_size=2000):
                for text in batch.column("text").to_pylist():
                    if text and isinstance(text, str):
                        texts.append(text)
                        total_chars += len(text)
                        if total_chars >= target_chars:
                            break
                if total_chars >= target_chars:
                    break
        except Exception:
            continue

    return texts
