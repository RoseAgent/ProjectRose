import os
from pathlib import Path
from huggingface_hub import snapshot_download

pile_dir = Path(os.environ.get("PILE_DIR", "/app/pile"))
pile_dir.mkdir(parents=True, exist_ok=True)

if any(pile_dir.rglob("*.parquet")):
    print(f"Common Pile already downloaded at {pile_dir}")
    print("Delete the directory to re-download.")
else:
    print("Downloading Common Pile dataset — this may take a very long time and use several hundred GB of disk space.")
    print(f"Destination: {pile_dir}")
    snapshot_download(
        repo_id="common-pile/comma_v0.1_training_dataset",
        repo_type="dataset",
        local_dir=str(pile_dir),
        ignore_patterns=["*.md", "*.txt", "*.json"],
    )
    parquet_count = len(list(pile_dir.rglob("*.parquet")))
    print(f"Done. {parquet_count} parquet shards saved to {pile_dir}")
