import asyncpg
import json
import os

_pool: asyncpg.Pool | None = None


async def _init_connection(conn):
    await conn.set_type_codec(
        "jsonb",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )
    await conn.set_type_codec(
        "json",
        encoder=json.dumps,
        decoder=json.loads,
        schema="pg_catalog",
    )

SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS trainer_models (
    id              SERIAL PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    size            TEXT NOT NULL CHECK (size IN ('1B','7B','30B','400B')),
    current_version TEXT,
    agents_md       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS model_versions (
    id              SERIAL PRIMARY KEY,
    model_id        INTEGER NOT NULL REFERENCES trainer_models(id) ON DELETE CASCADE,
    version         TEXT NOT NULL,
    checkpoint_path TEXT NOT NULL,
    tokenizer_path  TEXT NOT NULL,
    is_deployed     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (model_id, version)
);

CREATE TABLE IF NOT EXISTS growth_stages (
    id           SERIAL PRIMARY KEY,
    model_id     INTEGER NOT NULL REFERENCES trainer_models(id) ON DELETE CASCADE,
    stage        INTEGER NOT NULL CHECK (stage BETWEEN 1 AND 7),
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','complete')),
    completed_at TIMESTAMPTZ,
    UNIQUE (model_id, stage)
);

CREATE TABLE IF NOT EXISTS questionnaire_responses (
    id          SERIAL PRIMARY KEY,
    model_id    INTEGER NOT NULL REFERENCES trainer_models(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (model_id, question_id)
);

CREATE TABLE IF NOT EXISTS training_data (
    id         BIGSERIAL PRIMARY KEY,
    model_id   INTEGER NOT NULL REFERENCES trainer_models(id) ON DELETE CASCADE,
    stage      INTEGER NOT NULL CHECK (stage IN (3, 6)),
    source     TEXT NOT NULL,
    input      TEXT NOT NULL,
    thinking   TEXT NOT NULL DEFAULT '',
    output     TEXT NOT NULL,
    reviewed   BOOLEAN NOT NULL DEFAULT FALSE,
    deleted    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_credentials (
    id          SERIAL PRIMARY KEY,
    provider    TEXT NOT NULL UNIQUE CHECK (provider IN ('openai','anthropic','groq','ollama')),
    api_key     TEXT,
    base_url    TEXT,
    models_json JSONB NOT NULL DEFAULT '[]',
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS training_runs (
    id           SERIAL PRIMARY KEY,
    model_id     INTEGER NOT NULL REFERENCES trainer_models(id) ON DELETE CASCADE,
    stage        INTEGER NOT NULL CHECK (stage IN (5, 6)),
    from_version TEXT,
    to_version   TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'queued'
                 CHECK (status IN ('queued','running','complete','failed')),
    loss_data    JSONB NOT NULL DEFAULT '[]',
    log_text     TEXT NOT NULL DEFAULT '',
    error        TEXT,
    started_at   TIMESTAMPTZ,
    finished_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_data_model  ON training_data(model_id) WHERE deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_training_runs_model  ON training_runs(model_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_model ON model_versions(model_id);
CREATE INDEX IF NOT EXISTS idx_growth_stages_model  ON growth_stages(model_id);

ALTER TABLE trainer_models ADD COLUMN IF NOT EXISTS use_pile BOOLEAN NOT NULL DEFAULT FALSE;
"""


def get_pool() -> asyncpg.Pool:
    return _pool


async def create_pool():
    global _pool
    _pool = await asyncpg.create_pool(
        os.environ["DATABASE_URL"], min_size=2, max_size=10, init=_init_connection
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
