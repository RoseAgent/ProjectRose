import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const openDbs = new Map<string, Database.Database>()

const SCHEMA = `
CREATE TABLE IF NOT EXISTS speakers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS recordings (
  id INTEGER PRIMARY KEY,
  speaker_id INTEGER REFERENCES speakers(id),
  audio_path TEXT NOT NULL,
  duration_seconds REAL,
  source TEXT CHECK (source IN ('wizard', 'chat', 'active_listening')),
  project_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  project_id TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);
CREATE TABLE IF NOT EXISTS utterances (
  id INTEGER PRIMARY KEY,
  session_id INTEGER REFERENCES sessions(id),
  recording_id INTEGER REFERENCES recordings(id),
  speaker_id INTEGER REFERENCES speakers(id),
  text TEXT NOT NULL,
  start_seconds REAL,
  end_seconds REAL,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS training_jobs (
  id INTEGER PRIMARY KEY,
  status TEXT CHECK (status IN ('queued', 'running', 'complete', 'failed')),
  accuracy REAL,
  deployed INTEGER,
  error TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS model_versions (
  id INTEGER PRIMARY KEY,
  accuracy REAL,
  is_active INTEGER,
  checkpoint_path TEXT,
  trained_at TEXT,
  sample_count INTEGER,
  notes TEXT
);
`

function getDb(projectPath: string): Database.Database {
  if (openDbs.has(projectPath)) return openDbs.get(projectPath)!

  const dbDir = path.join(projectPath, '.projectrose')
  fs.mkdirSync(dbDir, { recursive: true })

  const db = new Database(path.join(dbDir, 'speech.db'))
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)

  openDbs.set(projectPath, db)
  return db
}

export function getSpeakers(projectPath: string): unknown[] {
  return getDb(projectPath).prepare('SELECT * FROM speakers ORDER BY name').all()
}

export function createSpeaker(projectPath: string, name: string): { id: number; name: string } {
  const db = getDb(projectPath)
  const result = db.prepare('INSERT INTO speakers (name) VALUES (?)').run(name)
  return { id: result.lastInsertRowid as number, name }
}

export function addRecording(
  projectPath: string,
  speakerId: number | null,
  audioPath: string,
  source: string,
  projectId: string | null,
  durationSeconds: number | null
): { id: number } {
  const db = getDb(projectPath)
  const result = db
    .prepare(
      'INSERT INTO recordings (speaker_id, audio_path, source, project_id, duration_seconds) VALUES (?, ?, ?, ?, ?)'
    )
    .run(speakerId, audioPath, source, projectId, durationSeconds)
  return { id: result.lastInsertRowid as number }
}

export function createSession(projectPath: string, projectId: string | null): { id: number } {
  const db = getDb(projectPath)
  const result = db.prepare('INSERT INTO sessions (project_id) VALUES (?)').run(projectId)
  return { id: result.lastInsertRowid as number }
}

export function endSession(projectPath: string, sessionId: number): { ok: boolean } {
  getDb(projectPath)
    .prepare("UPDATE sessions SET ended_at = datetime('now') WHERE id = ?")
    .run(sessionId)
  return { ok: true }
}

export function getSessions(projectPath: string): unknown[] {
  return getDb(projectPath)
    .prepare('SELECT * FROM sessions ORDER BY started_at DESC')
    .all()
}

export function createUtterance(
  projectPath: string,
  sessionId: number,
  recordingId: number | null,
  speakerId: number | null,
  text: string
): { id: number } {
  const db = getDb(projectPath)
  const result = db
    .prepare(
      'INSERT INTO utterances (session_id, recording_id, speaker_id, text) VALUES (?, ?, ?, ?)'
    )
    .run(sessionId, recordingId, speakerId, text)
  return { id: result.lastInsertRowid as number }
}

export function getUtterances(projectPath: string, sessionId: number): unknown[] {
  return getDb(projectPath)
    .prepare(
      `SELECT u.id, u.text, u.speaker_id, s.name as speaker_name
       FROM utterances u
       LEFT JOIN speakers s ON s.id = u.speaker_id
       WHERE u.session_id = ?
       ORDER BY u.created_at`
    )
    .all(sessionId)
}

export function labelSpeaker(
  projectPath: string,
  utteranceId: number,
  speakerId: number | null,
  speakerName: string | null
): { ok: boolean; speaker_id: number | null } {
  const db = getDb(projectPath)

  let resolvedId = speakerId
  if (!resolvedId && speakerName) {
    const existing = db
      .prepare('SELECT id FROM speakers WHERE name = ?')
      .get(speakerName) as { id: number } | undefined
    if (existing) {
      resolvedId = existing.id
    } else {
      const r = db.prepare('INSERT INTO speakers (name) VALUES (?)').run(speakerName)
      resolvedId = r.lastInsertRowid as number
    }
  }

  db.prepare('UPDATE utterances SET speaker_id = ? WHERE id = ?').run(resolvedId, utteranceId)

  const utterance = db
    .prepare('SELECT recording_id FROM utterances WHERE id = ?')
    .get(utteranceId) as { recording_id: number | null } | undefined
  if (utterance?.recording_id) {
    db.prepare('UPDATE recordings SET speaker_id = ? WHERE id = ?').run(
      resolvedId,
      utterance.recording_id
    )
  }

  return { ok: true, speaker_id: resolvedId }
}

export function createTrainingJob(projectPath: string): { job_id: number } {
  const db = getDb(projectPath)
  const result = db
    .prepare("INSERT INTO training_jobs (status, started_at) VALUES ('queued', datetime('now'))")
    .run()
  return { job_id: result.lastInsertRowid as number }
}

export function updateTrainingJob(
  projectPath: string,
  jobId: number,
  update: { status: string; accuracy?: number; deployed?: boolean; error?: string }
): void {
  getDb(projectPath)
    .prepare(
      "UPDATE training_jobs SET status = ?, accuracy = ?, deployed = ?, error = ?, finished_at = datetime('now') WHERE id = ?"
    )
    .run(
      update.status,
      update.accuracy ?? null,
      update.deployed ? 1 : 0,
      update.error ?? null,
      jobId
    )
}

export function getTrainingJob(projectPath: string, jobId: number): unknown {
  return getDb(projectPath).prepare('SELECT * FROM training_jobs WHERE id = ?').get(jobId)
}

export function getTrainingJobs(projectPath: string): unknown[] {
  return getDb(projectPath)
    .prepare('SELECT * FROM training_jobs ORDER BY created_at DESC')
    .all()
}

export function getLabeledRecordings(
  projectPath: string
): Array<{ id: number; speaker_id: number; audio_path: string }> {
  return getDb(projectPath)
    .prepare(
      'SELECT id, speaker_id, audio_path FROM recordings WHERE speaker_id IS NOT NULL'
    )
    .all() as Array<{ id: number; speaker_id: number; audio_path: string }>
}

export function createModelVersion(
  projectPath: string,
  accuracy: number,
  sampleCount: number
): void {
  const db = getDb(projectPath)
  db.prepare('UPDATE model_versions SET is_active = 0 WHERE is_active = 1').run()
  db.prepare(
    "INSERT INTO model_versions (accuracy, is_active, trained_at, sample_count) VALUES (?, 1, datetime('now'), ?)"
  ).run(accuracy, sampleCount)
}
