import asyncio
import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, Request
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse

from app.database import get_db, get_pool
from app.training.trainer import start_training, get_or_create_queue, clear_queue

router = APIRouter()
templates: Jinja2Templates | None = None
MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
PILE_DIR = Path(os.environ.get("PILE_DIR", "/app/pile"))


def set_templates(t: Jinja2Templates):
    global templates
    templates = t


@router.get("/models/{model_id}/stage/5")
async def stage5_page(request: Request, model_id: int, db=Depends(get_db)):
    model = await db.fetchrow("SELECT * FROM trainer_models WHERE id = $1", model_id)
    data_count = await db.fetchval(
        "SELECT COUNT(*) FROM training_data WHERE model_id = $1 AND deleted = FALSE", model_id
    )
    run = await db.fetchrow(
        "SELECT * FROM training_runs WHERE model_id = $1 AND stage = 5 ORDER BY created_at DESC LIMIT 1",
        model_id,
    )
    return templates.TemplateResponse(request, "stage5.html", {
        "model": dict(model),
        "data_count": data_count,
        "run": dict(run) if run else None,
    })


@router.post("/models/{model_id}/stage/5/train")
async def start_initial_training(model_id: int, db=Depends(get_db)):
    model_row = await db.fetchrow("SELECT * FROM trainer_models WHERE id = $1", model_id)
    version = "v0.001"
    output_dir = MODELS_DIR / model_row["name"] / version

    run_id = await db.fetchval(
        """
        INSERT INTO training_runs (model_id, stage, from_version, to_version, status)
        VALUES ($1, 5, NULL, $2, 'running')
        RETURNING id
        """,
        model_id, version,
    )
    await db.execute(
        "UPDATE training_runs SET started_at = now() WHERE id = $1", run_id
    )
    await db.execute(
        "UPDATE growth_stages SET status = 'in_progress' WHERE model_id = $1 AND stage = 5",
        model_id,
    )

    rows = await db.fetch(
        "SELECT input, thinking, output FROM training_data WHERE model_id = $1 AND deleted = FALSE",
        model_id,
    )
    data_rows = [dict(r) for r in rows]

    async def _on_done():
        queue = get_or_create_queue(model_id)
        async with get_pool().acquire() as conn:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=5.0)
                except asyncio.TimeoutError:
                    continue
                if event.get("type") == "loss":
                    loss_entry = {"step": event["step"], "loss": event["loss"], "lr": event["lr"]}
                    await conn.execute(
                        "UPDATE training_runs SET loss_data = loss_data || $1::jsonb WHERE id = $2",
                        json.dumps([loss_entry]), run_id,
                    )
                elif event.get("type") == "log":
                    await conn.execute(
                        "UPDATE training_runs SET log_text = log_text || $1 WHERE id = $2",
                        event["text"] + "\n", run_id,
                    )
                elif event.get("type") == "error":
                    await conn.execute(
                        "UPDATE training_runs SET status = 'failed', error = $1, finished_at = now() WHERE id = $2",
                        event.get("text", "Unknown error"), run_id,
                    )
                    await conn.execute(
                        "UPDATE growth_stages SET status = 'pending' WHERE model_id = $1 AND stage = 5",
                        model_id,
                    )
                    break
                elif event.get("type") == "done":
                    checkpoint = event.get("checkpoint", str(output_dir / "model.pt"))
                    tokenizer = event.get("tokenizer", str(output_dir / "tokenizer"))
                    await conn.execute(
                        """
                        INSERT INTO model_versions (model_id, version, checkpoint_path, tokenizer_path)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (model_id, version) DO NOTHING
                        """,
                        model_id, version, checkpoint, tokenizer,
                    )
                    await conn.execute(
                        "UPDATE trainer_models SET current_version = $1, updated_at = now() WHERE id = $2",
                        version, model_id,
                    )
                    await conn.execute(
                        "UPDATE training_runs SET status = 'complete', finished_at = now() WHERE id = $1", run_id
                    )
                    await conn.execute(
                        "UPDATE growth_stages SET status = 'complete', completed_at = now() WHERE model_id = $1 AND stage = 5",
                        model_id,
                    )
                    break

    pile_dir = PILE_DIR if model_row["use_pile"] else None
    asyncio.create_task(_on_done())
    await start_training(
        model_id=model_id,
        size=model_row["size"],
        data_rows=data_rows,
        checkpoint_from=None,
        tokenizer_path=None,
        output_dir=output_dir,
        run_id=run_id,
        pile_dir=pile_dir,
    )
    return RedirectResponse(f"/trainer/models/{model_id}/stage/5", status_code=303)


@router.get("/models/{model_id}/stage/5/stream")
async def training_stream(model_id: int, request: Request):
    queue = get_or_create_queue(model_id)

    async def generator():
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=1.0)
            except asyncio.TimeoutError:
                yield {"data": json.dumps({"type": "heartbeat"})}
                continue
            yield {"data": json.dumps(event)}
            if event.get("type") == "done":
                break

    return EventSourceResponse(generator())
