import asyncio
from fastapi import APIRouter, Depends, HTTPException

from app.models.database import get_db
from app.services.trainer import run_training_job

router = APIRouter(prefix="/train")

_jobs: dict[int, asyncio.Task] = {}


@router.post("", status_code=202)
async def start_training(conn=Depends(get_db)):
    row = await conn.fetchrow(
        "INSERT INTO rosespeech.training_jobs DEFAULT VALUES RETURNING id"
    )
    job_id = row["id"]

    task = asyncio.create_task(run_training_job(job_id))
    _jobs[job_id] = task
    task.add_done_callback(lambda t: _jobs.pop(job_id, None))

    return {"job_id": job_id}


@router.get("/status/{job_id}")
async def get_training_status(job_id: int, conn=Depends(get_db)):
    row = await conn.fetchrow(
        """
        SELECT id, status, accuracy, deployed, error, started_at, finished_at, created_at
        FROM rosespeech.training_jobs WHERE id=$1
        """,
        job_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return dict(row)


@router.get("/history")
async def training_history(conn=Depends(get_db)):
    rows = await conn.fetch(
        """
        SELECT id, accuracy, is_active, trained_at, sample_count, notes
        FROM rosespeech.model_versions
        ORDER BY trained_at DESC
        LIMIT 20
        """
    )
    return [dict(r) for r in rows]
