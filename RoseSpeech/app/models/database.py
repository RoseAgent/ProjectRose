import os
import re
import sqlite3
from contextlib import asynccontextmanager
from datetime import datetime

import aiosqlite

sqlite3.register_adapter(datetime, lambda d: d.isoformat())

DATA_DIR = os.environ.get(
    "ROSESPEECH_DATA_DIR",
    os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "..", "data")),
)
_DB_PATH = os.path.join(DATA_DIR, "rosespeech.db")

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS speakers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recordings (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    speaker_id       INTEGER REFERENCES speakers(id),
    audio_path       TEXT NOT NULL,
    duration_seconds REAL,
    source           TEXT NOT NULL CHECK (source IN ('wizard', 'chat', 'active_listening')),
    project_id       TEXT,
    created_at       TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    ended_at   TEXT
);

CREATE TABLE IF NOT EXISTS utterances (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id    INTEGER REFERENCES sessions(id),
    recording_id  INTEGER REFERENCES recordings(id),
    speaker_id    INTEGER REFERENCES speakers(id),
    text          TEXT NOT NULL,
    start_seconds REAL,
    end_seconds   REAL,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_versions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    accuracy        REAL,
    is_active       INTEGER DEFAULT 0,
    checkpoint_path TEXT,
    trained_at      TEXT DEFAULT (datetime('now')),
    sample_count    INTEGER,
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS training_jobs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    status      TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'complete', 'failed')),
    accuracy    REAL,
    deployed    INTEGER DEFAULT 0,
    error       TEXT,
    started_at  TEXT,
    finished_at TEXT,
    created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rs_recordings_speaker ON recordings(speaker_id);
CREATE INDEX IF NOT EXISTS idx_rs_utterances_session ON utterances(session_id);
CREATE INDEX IF NOT EXISTS idx_rs_utterances_speaker ON utterances(speaker_id);
"""

_PARAM_RE = re.compile(r'\$\d+')
_BOOL_COLS = {'deployed', 'is_active'}


def _q(sql: str) -> str:
    return _PARAM_RE.sub('?', sql).replace('rosespeech.', '')


def _row(cur: aiosqlite.Cursor, row: tuple) -> dict:
    cols = [d[0] for d in cur.description]
    d = dict(zip(cols, row))
    for col in _BOOL_COLS:
        if col in d and isinstance(d[col], int):
            d[col] = bool(d[col])
    return d


class _Conn:
    def __init__(self, conn: aiosqlite.Connection):
        self._c = conn

    async def fetch(self, sql: str, *args) -> list[dict]:
        async with self._c.execute(_q(sql), args) as cur:
            rows = await cur.fetchall()
            if not cur.description:
                return []
            return [_row(cur, r) for r in rows]

    async def fetchrow(self, sql: str, *args) -> dict | None:
        async with self._c.execute(_q(sql), args) as cur:
            r = await cur.fetchone()
            if r is None or not cur.description:
                return None
            await self._c.commit()
            return _row(cur, r)

    async def fetchval(self, sql: str, *args):
        async with self._c.execute(_q(sql), args) as cur:
            r = await cur.fetchone()
            await self._c.commit()
            return r[0] if r else None

    async def execute(self, sql: str, *args) -> None:
        await self._c.execute(_q(sql), args)
        await self._c.commit()


@asynccontextmanager
async def _open():
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    async with aiosqlite.connect(_DB_PATH) as conn:
        await conn.execute("PRAGMA journal_mode=WAL")
        yield _Conn(conn)


class _Pool:
    @asynccontextmanager
    async def acquire(self):
        async with _open() as conn:
            yield conn


_pool = _Pool()


def get_pool() -> _Pool:
    return _pool


async def create_pool() -> None:
    pass


async def close_pool() -> None:
    pass


async def get_db():
    async with _open() as conn:
        yield conn


async def init_schema() -> None:
    async with _open() as conn:
        await conn._c.executescript(SCHEMA_SQL)
        await conn._c.commit()
