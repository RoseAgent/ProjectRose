import asyncio
import json
import math
import os
import time
from pathlib import Path
from typing import Any

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader

from .architecture import RoseGPT, ModelConfig
from .tokenizer import train_tokenizer, load_tokenizer

# Per-model training queues: model_id -> asyncio.Queue
_training_queues: dict[int, asyncio.Queue] = {}


def get_or_create_queue(model_id: int) -> asyncio.Queue:
    if model_id not in _training_queues:
        _training_queues[model_id] = asyncio.Queue()
    return _training_queues[model_id]


def clear_queue(model_id: int):
    if model_id in _training_queues:
        del _training_queues[model_id]


class TextDataset(Dataset):
    def __init__(self, token_ids: list[int], seq_len: int):
        self.data = torch.tensor(token_ids, dtype=torch.long)
        self.seq_len = seq_len

    def __len__(self):
        return max(0, len(self.data) - self.seq_len)

    def __getitem__(self, idx):
        x = self.data[idx : idx + self.seq_len]
        y = self.data[idx + 1 : idx + self.seq_len + 1]
        return x, y


def _format_row(row: dict) -> str:
    thinking = row.get("thinking", "")
    inp = row["input"]
    out = row["output"]
    if thinking:
        return f"<|thinking|>{thinking}<|/thinking|>{inp}\n{out}<|endoftext|>"
    return f"{inp}\n{out}<|endoftext|>"


def _run_sync(
    model_id: int,
    size: str,
    data_rows: list[dict],
    checkpoint_from: str | None,
    tokenizer_path: str | None,
    output_dir: Path,
    loop: asyncio.AbstractEventLoop,
    run_id: int,
    pile_dir: Path | None = None,
):
    queue = get_or_create_queue(model_id)

    def emit(event: dict):
        asyncio.run_coroutine_threadsafe(queue.put(event), loop)

    try:
        emit({"type": "log", "text": "Preparing training data..."})

        texts = [_format_row(r) for r in data_rows]
        output_dir.mkdir(parents=True, exist_ok=True)
        tok_dir = output_dir / "tokenizer"

        if tokenizer_path and Path(tokenizer_path).exists():
            emit({"type": "log", "text": f"Loading existing tokenizer from {tokenizer_path}"})
            tokenizer = load_tokenizer(tokenizer_path)
        else:
            emit({"type": "log", "text": f"Training new BPE tokenizer on {len(texts)} documents..."})
            tokenizer = train_tokenizer(texts, tok_dir)
            emit({"type": "log", "text": f"Tokenizer trained. Vocab size: {tokenizer.get_vocab_size()}"})

        all_tokens = []
        for text in texts:
            encoded = tokenizer.encode(text)
            all_tokens.extend(encoded.ids)

        emit({"type": "log", "text": f"Curated tokens: {len(all_tokens):,}"})

        if pile_dir is not None:
            from .pile import pile_available, sample_pile_texts
            if pile_available(pile_dir):
                max_pile = min(len(all_tokens) * 50, int(os.environ.get("PILE_MAX_TOKENS", "50000000")))
                emit({"type": "log", "text": f"Sampling Common Pile (target: {max_pile:,} tokens)..."})
                pile_texts = sample_pile_texts(pile_dir, max_pile)
                emit({"type": "log", "text": f"Sampled {len(pile_texts):,} pile documents. Tokenizing..."})
                pile_tokens: list[int] = []
                for text in pile_texts:
                    pile_tokens.extend(tokenizer.encode(text + "<|endoftext|>").ids)
                emit({"type": "log", "text": f"Pile tokens: {len(pile_tokens):,} | Curated tokens: {len(all_tokens):,}"})
                all_tokens = pile_tokens + all_tokens
            else:
                emit({"type": "log", "text": "WARNING: Common Pile enabled but directory not found. Training on curated data only."})

        emit({"type": "log", "text": f"Total tokens: {len(all_tokens):,}"})

        config = ModelConfig.from_size(size)
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        emit({"type": "log", "text": f"Device: {device} | Building {size} model..."})

        model = RoseGPT(config)
        if checkpoint_from and Path(checkpoint_from).exists():
            emit({"type": "log", "text": f"Loading checkpoint from {checkpoint_from}"})
            state = torch.load(checkpoint_from, map_location="cpu")
            model.load_state_dict(state)

        param_count = model.param_count()
        emit({"type": "log", "text": f"Parameters: {param_count:,} ({param_count/1e9:.2f}B)"})

        model = model.to(device)

        dataset = TextDataset(all_tokens, config.max_seq_len)
        if len(dataset) == 0:
            emit({"type": "log", "text": "WARNING: Not enough data for training sequences. Saving model anyway."})
            torch.save(model.state_dict(), output_dir / "model.pt")
            emit({"type": "done", "checkpoint": str(output_dir / "model.pt"), "tokenizer": str(tok_dir)})
            return

        batch_size = 2 if size == "1B" else 1
        dataloader = DataLoader(dataset, batch_size=batch_size, shuffle=True, pin_memory=(device.type == "cuda"))

        total_steps = len(dataloader)
        warmup_steps = max(1, total_steps // 10)
        max_lr = 3e-4
        min_lr = max_lr * 0.1

        use_amp = device.type == "cuda"
        scaler = torch.cuda.amp.GradScaler(enabled=use_amp)

        try:
            optimizer = torch.optim.AdamW(
                model.parameters(), lr=max_lr, betas=(0.9, 0.95), weight_decay=0.1, fused=True
            )
        except RuntimeError:
            optimizer = torch.optim.AdamW(
                model.parameters(), lr=max_lr, betas=(0.9, 0.95), weight_decay=0.1
            )

        def get_lr(step: int) -> float:
            if step < warmup_steps:
                return max_lr * (step + 1) / warmup_steps
            progress = (step - warmup_steps) / max(1, total_steps - warmup_steps)
            return min_lr + 0.5 * (max_lr - min_lr) * (1 + math.cos(math.pi * progress))

        emit({"type": "log", "text": f"Training for {total_steps} steps..."})
        model.train()

        for step, (x, y) in enumerate(dataloader):
            x, y = x.to(device), y.to(device)
            lr = get_lr(step)
            for pg in optimizer.param_groups:
                pg["lr"] = lr

            with torch.autocast(device_type=device.type, dtype=torch.bfloat16, enabled=use_amp):
                _, loss = model(x, targets=y)

            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            scaler.step(optimizer)
            scaler.update()
            optimizer.zero_grad(set_to_none=True)

            loss_val = loss.item()
            emit({"type": "loss", "step": step, "total_steps": total_steps, "loss": round(loss_val, 4), "lr": lr})

            if step % 10 == 0 or step == total_steps - 1:
                emit({"type": "log", "text": f"step {step}/{total_steps}: loss={loss_val:.4f} lr={lr:.2e}"})

        emit({"type": "log", "text": "Saving checkpoint..."})
        torch.save(model.state_dict(), output_dir / "model.pt")
        emit({"type": "log", "text": f"Checkpoint saved: {output_dir / 'model.pt'}"})
        emit({"type": "done", "checkpoint": str(output_dir / "model.pt"), "tokenizer": str(tok_dir)})

    except torch.cuda.OutOfMemoryError:
        vram_hint = {
            "1B": "~14 GB VRAM (e.g. RTX 3080 10GB with gradient checkpointing)",
            "7B": "~80 GB VRAM (e.g. 2× A100 80GB or 4× RTX 4090)",
            "30B": "~360 GB VRAM (e.g. 8× A100 80GB)",
            "400B": "~4.8 TB VRAM (e.g. 64× A100 80GB)",
        }.get(size, "more VRAM")
        msg = (
            f"Your GPU does not have enough VRAM to train the {size} model. "
            f"This size requires at least {vram_hint}. "
            "Try a smaller model size or use a GPU with more memory."
        )
        emit({"type": "error", "oom": True, "text": msg})
    except Exception as e:
        emit({"type": "error", "oom": False, "text": str(e)})


async def start_training(
    model_id: int,
    size: str,
    data_rows: list[dict],
    checkpoint_from: str | None,
    tokenizer_path: str | None,
    output_dir: Path,
    run_id: int,
    pile_dir: Path | None = None,
):
    clear_queue(model_id)
    loop = asyncio.get_event_loop()
    asyncio.get_event_loop().run_in_executor(
        None,
        _run_sync,
        model_id, size, data_rows, checkpoint_from, tokenizer_path, output_dir, loop, run_id, pile_dir,
    )
