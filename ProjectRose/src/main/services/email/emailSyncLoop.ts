// Background poll loop for rose-email. Adds a `new-message` event other
// built-ins can subscribe to (rose-channels is the first consumer, per
// ADR 0015 + ADR 0011 amendment 2026-05-25).
//
// Polls the active transport's inbox every POLL_INTERVAL_MS, diffs against
// a per-transport "ids seen" cursor at userData/email-sync-cursor.json, and
// emits `new-message` for each id not in the cursor. First-poll seeding is
// silent (we record the inbox contents but don't fire events for messages
// that arrived before the loop ever ran).
//
// No quarantine filter is wired up yet — when ADR 0011's quarantine system
// lands, this loop is the natural place to drop quarantined ids before they
// reach subscribers.

import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile } from 'fs/promises'
import { EventEmitter } from 'events'
import type { EmailMessage } from '../../../shared/email'
import {
  EmailTransportNotConfiguredError,
  getActiveTransport,
  getActiveTransportKind
} from './emailTransport'

const POLL_INTERVAL_MS = 60_000
const CURSOR_FILENAME = 'email-sync-cursor.json'
const POLL_LIMIT = 50

// Per-transport ids cursor. Switching transports invalidates everything by
// keying on the transport name — the lookup just misses and the new transport
// reseeds on first poll.
interface SyncCursor {
  transport: 'imap' | 'google' | null
  /** Ids seen on previous polls (capped to most recent POLL_LIMIT entries). */
  ids: string[]
  /** Set on first successful poll so we don't event-storm pre-existing mail. */
  seeded: boolean
}

const EMPTY_CURSOR: SyncCursor = { transport: null, ids: [], seeded: false }

function cursorPath(): string {
  return join(app.getPath('userData'), CURSOR_FILENAME)
}

async function readCursor(): Promise<SyncCursor> {
  try {
    const buf = await readFile(cursorPath(), 'utf-8')
    const parsed = JSON.parse(buf) as Partial<SyncCursor>
    if (
      (parsed.transport === 'imap' || parsed.transport === 'google' || parsed.transport === null) &&
      Array.isArray(parsed.ids) &&
      typeof parsed.seeded === 'boolean'
    ) {
      return { transport: parsed.transport, ids: parsed.ids, seeded: parsed.seeded }
    }
  } catch {
    /* missing or malformed — caller treats as empty */
  }
  return { ...EMPTY_CURSOR }
}

async function writeCursor(cursor: SyncCursor): Promise<void> {
  await writeFile(cursorPath(), JSON.stringify(cursor), 'utf-8')
}

// ── Public events surface ───────────────────────────────────────────────

interface EmailServiceEvents {
  /** Emitted for each new inbox message after the first-poll seeding. */
  'new-message': (message: EmailMessage) => void
}

class TypedEmailEmitter extends EventEmitter {
  override on<K extends keyof EmailServiceEvents>(event: K, listener: EmailServiceEvents[K]): this {
    return super.on(event, listener as (...args: unknown[]) => void)
  }
  override off<K extends keyof EmailServiceEvents>(event: K, listener: EmailServiceEvents[K]): this {
    return super.off(event, listener as (...args: unknown[]) => void)
  }
  override emit<K extends keyof EmailServiceEvents>(
    event: K,
    ...args: Parameters<EmailServiceEvents[K]>
  ): boolean {
    return super.emit(event, ...args)
  }
}

export const emailEvents = new TypedEmailEmitter()
// We expect cross-extension subscribers; raise the default cap so a small
// number of legitimate listeners doesn't trip the warning.
emailEvents.setMaxListeners(32)

// ── Loop control ────────────────────────────────────────────────────────

let loopTimer: NodeJS.Timeout | null = null
let inFlight = false

async function tick(): Promise<void> {
  if (inFlight) return
  inFlight = true
  try {
    const kind = await getActiveTransportKind()
    if (!kind) return // no transport configured — silent skip until reconfigured

    let summaries
    try {
      const transport = await getActiveTransport()
      summaries = await transport.listMessages({ limit: POLL_LIMIT })
    } catch (err) {
      if (err instanceof EmailTransportNotConfiguredError) return
      console.error('[email-sync] poll failed:', err)
      return
    }

    let cursor = await readCursor()
    if (cursor.transport !== kind) {
      // Transport switched (or first run on this transport) — reseed silently.
      cursor = { transport: kind, ids: summaries.map((s) => s.id), seeded: true }
      await writeCursor(cursor)
      return
    }

    if (!cursor.seeded) {
      cursor = { transport: kind, ids: summaries.map((s) => s.id), seeded: true }
      await writeCursor(cursor)
      return
    }

    const seen = new Set(cursor.ids)
    const newOnes = summaries.filter((s) => !seen.has(s.id))
    if (newOnes.length === 0) return

    // Fetch + emit, oldest first, so subscribers see chronological order.
    newOnes.sort((a, b) => a.date - b.date)
    const transport = await getActiveTransport()
    const newIds: string[] = []
    for (const sum of newOnes) {
      try {
        const msg = await transport.getMessage(sum.id)
        emailEvents.emit('new-message', msg)
        newIds.push(sum.id)
      } catch (err) {
        console.error('[email-sync] failed to fetch new message', sum.id, err)
      }
    }

    // Cap the cursor at POLL_LIMIT * 2 so it never grows unbounded.
    const next = [...newIds, ...cursor.ids].slice(0, POLL_LIMIT * 2)
    await writeCursor({ transport: kind, ids: next, seeded: true })
  } finally {
    inFlight = false
  }
}

/**
 * Start the email sync loop. Idempotent — calling twice is a no-op. Triggers
 * a first poll immediately so a transport switch surfaces new state quickly
 * instead of waiting POLL_INTERVAL_MS.
 */
export function startEmailSyncLoop(): void {
  if (loopTimer) return
  loopTimer = setInterval(() => {
    void tick()
  }, POLL_INTERVAL_MS)
  // Kick the first poll immediately; defer one frame so the caller's
  // post-startup wiring can finish first.
  setTimeout(() => {
    void tick()
  }, 0)
}

export function stopEmailSyncLoop(): void {
  if (!loopTimer) return
  clearInterval(loopTimer)
  loopTimer = null
}
