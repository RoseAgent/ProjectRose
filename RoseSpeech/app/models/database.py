import os
import asyncpg

_pool: asyncpg.Pool | None = None

SCHEMA_SQL = """
CREATE SCHEMA IF NOT EXISTS rosespeech;

CREATE TABLE IF NOT EXISTS rosespeech.speakers (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rosespeech.recordings (
    id               SERIAL PRIMARY KEY,
    speaker_id       INT REFERENCES rosespeech.speakers(id),
    audio_path       TEXT NOT NULL,
    duration_seconds FLOAT,
    source           TEXT NOT NULL CHECK (source IN ('wizard', 'chat', 'active_listening')),
    project_id       TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rosespeech.sessions (
    id         SERIAL PRIMARY KEY,
    project_id TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at   TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS rosespeech.utterances (
    id            SERIAL PRIMARY KEY,
    session_id    INT REFERENCES rosespeech.sessions(id),
    recording_id  INT REFERENCES rosespeech.recordings(id),
    speaker_id    INT REFERENCES rosespeech.speakers(id),
    text          TEXT NOT NULL,
    start_seconds FLOAT,
    end_seconds   FLOAT,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rosespeech.model_versions (
    id              SERIAL PRIMARY KEY,
    accuracy        FLOAT,
    is_active       BOOLEAN DEFAULT FALSE,
    checkpoint_path TEXT,
    trained_at      TIMESTAMPTZ DEFAULT NOW(),
    sample_count    INT,
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS rosespeech.training_jobs (
    id         SERIAL PRIMARY KEY,
    status     TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed')),
    accuracy   FLOAT,
    deployed   BOOLEAN DEFAULT FALSE,
    error      TEXT,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rs_recordings_speaker ON rosespeech.recordings(speaker_id);
CREATE INDEX IF NOT EXISTS idx_rs_utterances_session ON rosespeech.utterances(session_id);
CREATE INDEX IF NOT EXISTS idx_rs_utterances_speaker ON rosespeech.utterances(speaker_id);
"""


def get_pool() -> asyncpg.Pool:
    return _pool


async def create_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:5432/postgres"),
        min_size=2,
        max_size=10,
    )


async def close_pool():
    if _pool:
        await _pool.close()


async def get_db():
    async with _pool.acquire() as conn:
        yield conn


async def init_schema():
    async with _pool.acquire() as conn:
        await conn.execute(SCHEMA_SQL)
