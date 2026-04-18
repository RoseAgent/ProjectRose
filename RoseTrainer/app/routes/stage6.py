import asyncio
import json
import os
from pathlib import Path
from fastapi import APIRouter, Depends, Request, Form
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sse_starlette.sse import EventSourceResponse

from app.database import get_db, get_pool
from app.providers import complete_chat
from app.training.trainer import start_training, get_or_create_queue, clear_queue

router = APIRouter()
templates: Jinja2Templates | None = None
MODELS_DIR = Path(os.environ.get("MODELS_DIR", "/app/models"))
PILE_DIR = Path(os.environ.get("PILE_DIR", "/app/pile"))

_quiz_queues: dict[int, asyncio.Queue] = {}

QUIZ_TOOL = {
    "name": "create_quiz_question",
    "description": "Record one question-answer pair derived from the learning content.",
    "parameters": {
        "type": "object",
        "properties": {
            "input":    {"type": "string", "description": "The question text"},
            "thinking": {"type": "string", "description": "Step-by-step reasoning that produces the answer"},
            "output":   {"type": "string", "description": "The final answer"},
        },
        "required": ["input", "thinking", "output"],
    },
}


def set_templates(t: Jinja2Templates):
    global templates
    templates = t


def _next_version(current: str | None) -> str:
    if not current:
        return "v0.001"
    try:
        numeric = float(current.lstrip("v"))
        numeric += 0.001
        major = int(numeric)
        minor = round((numeric - major) * 1000)
        return f"v{major}.{minor:03d}"
    except Exception:
        return "v0.001"


@router.get("/models/{model_id}/stage/6")
async def stage6_page(request: Request, model_id: int, db=Depends(get_db)):
    model = await db.fetchrow("SELECT * FROM trainer_models WHERE id = $1", model_id)
    versions = await db.fetch(
        "SELECT * FROM model_versions WHERE model_id = $1 ORDER BY created_at DESC",
        model_id,
    )
    creds_rows = await db.fetch("SELECT * FROM provider_credentials ORDER BY provider")
    creds = []
    for r in creds_rows:
        c = dict(r)
        if isinstance(c.get("models_json"), str):
            c["models_json"] = json.loads(c["models_json"])
        creds.append(c)
    last_run = await db.fetchrow(
        "SELECT * FROM training_runs WHERE model_id = $1 AND stage = 6 ORDER BY created_at DESC LIMIT 1",
        model_id,
    )
    return templates.TemplateResponse(request, "stage6.html", {
        "model": dict(model),
        "versions": [dict(v) for v in versions],
        "creds": creds,
        "last_run": dict(last_run) if last_run else None,
    })


@router.post("/models/{model_id}/stage/6/generate-quiz")
async def generate_quiz(request: Request, model_id: int, db=Depends(get_db)):
    form = await request.form()
    content = form.get("content", "").strip()
    selected = form.getlist("models")

    model_row = await db.fetchrow("SELECT * FROM trainer_models WHERE id = $1", model_id)
    agents_md = model_row["agents_md"] or ""

    creds_rows = await db.fetch("SELECT * FROM provider_credentials")
    creds_map = {r["provider"]: dict(r) for r in creds_rows}

    queue: asyncio.Queue = asyncio.Queue()
    _quiz_queues[model_id] = queue

    async def _generate():
        total_expected = len(selected) * 10
        done = 0

        async with get_pool().acquire() as conn:
            for provider_model in selected:
                provider, model_name = provider_model.split(":", 1)
                cred = creds_map.get(provider, {})
                source = f"{provider}/{model_name}"

                user_prompt = (
                    f"{content}\n\n"
                    "You must call `create_quiz_question` exactly 10 times, each with a distinct question "
                    "derived from the provided content. For each call, provide the question as `input`, "
                    "your chain-of-thought reasoning in `thinking`, and the final answer as `output`."
                )

                messages = [{"role": "user", "content": user_prompt}]
                collected = 0

                while collected < 10:
                    try:
                        _, tool_calls = await complete_chat(
                            provider=provider,
                            model=model_name,
                            messages=messages,
                            api_key=cred.get("api_key"),
                            base_url=cred.get("base_url"),
                            tools=[QUIZ_TOOL],
                            system=agents_md or None,
                        )
                    except Exception as e:
                        await queue.put({"type": "error", "source": source, "error": str(e)})
                        break

                    if not tool_calls:
                        break

                    for tc in tool_calls:
                        if tc["name"] == "create_quiz_question":
                            args = tc["arguments"]
                            await conn.execute(
                                """
                                INSERT INTO training_data (model_id, stage, source, input, thinking, output)
                                VALUES ($1, 6, $2, $3, $4, $5)
                                """,
                                model_id, source,
                                args.get("input", ""),
                                args.get("thinking", ""),
                                args.get("output", ""),
                            )
                            collected += 1
                            done += 1
                            await queue.put({"type": "quiz_item", "done": done, "total": total_expected, "source": source})
                            if collected >= 10:
                                break

        await queue.put({"type": "done", "total": done})

    asyncio.create_task(_generate())
    return {"ok": True}


@router.get("/models/{model_id}/stage/6/stream")
async def quiz_stream(model_id: int, request: Request):
    queue = _quiz_queues.get(model_id) or get_or_create_queue(model_id)

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


@router.post("/models/{model_id}/stage/6/train")
async def start_continued_training(
    model_id: int,
    from_version: str = Form(...),
    db=Depends(get_db),
):
    model_row = await db.fetchrow("SELECT * FROM trainer_models WHERE id = $1", model_id)
    to_version = _next_version(from_version)

    from_ver_row = await db.fetchrow(
        "SELECT * FROM model_versions WHERE model_id = $1 AND version = $2",
        model_id, from_version,
    )
    checkpoint_from = from_ver_row["checkpoint_path"] if from_ver_row else None
    tokenizer_path = from_ver_row["tokenizer_path"] if from_ver_row else None

    output_dir = MODELS_DIR / model_row["name"] / to_version

    run_id = await db.fetchval(
        """
        INSERT INTO training_runs (model_id, stage, from_version, to_version, status, started_at)
        VALUES ($1, 6, $2, $3, 'running', now())
        RETURNING id
        """,
        model_id, from_version, to_version,
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
                        model_id, to_version, checkpoint, tokenizer,
                    )
                    await conn.execute(
                        "UPDATE trainer_models SET current_version = $1, updated_at = now() WHERE id = $2",
                        to_version, model_id,
                    )
                    await conn.execute(
                        "UPDATE training_runs SET status = 'complete', finished_at = now() WHERE id = $1", run_id
                    )
                    break

    pile_dir = PILE_DIR if model_row["use_pile"] else None
    asyncio.create_task(_on_done())
    clear_queue(model_id)
    await start_training(
        model_id=model_id,
        size=model_row["size"],
        data_rows=data_rows,
        checkpoint_from=checkpoint_from,
        tokenizer_path=tokenizer_path,
        output_dir=output_dir,
        run_id=run_id,
        pile_dir=pile_dir,
    )
    return RedirectResponse(f"/trainer/models/{model_id}/stage/6", status_code=303)
