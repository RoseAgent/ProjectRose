import { tool } from 'ai'
import { z } from 'zod'
import { IPC } from '../../shared/ipcChannels'
import {
  handleReadFile,
  handleWriteFile,
  handleEditFile,
  handleListDirectory,
  handleDeleteFile,
  handleMoveFile,
  handleGrep,
  handleGlob,
  handleRunCommand,
  handleReadProcessOutput,
  handleKillProcess,
  handleFetchUrl,
  handleSearchWeb
} from './toolHandlers'
import { getConversationToolState } from './conversationToolState'
import type { TodoItem } from '../../shared/todos'
import {
  handleMemoryReadDiary,
  handleMemoryListDiary,
  handleMemoryWriteDiary,
  handleMemoryAddBehaviorRecord,
  handleMemoryListBehaviorRecords,
  handleMemoryReadBehaviorRecord,
  handleMemoryRemoveBehaviorRecord,
  handleMemoryNewContact,
  handleMemoryReadContact,
  handleMemorySearchContacts,
  handleMemoryAddContactNote,
  handleMemoryRemoveContactNote,
  handleMemorySetContactKind
} from './memory/tools'
import {
  handleCalendarCreateEvent,
  handleCalendarEditEvent,
  handleCalendarGetEvent,
  handleCalendarListEvents,
  handleCalendarInviteToEvent,
  handleCalendarDeleteEvent
} from './memory/calendarTools'
import {
  handleEmailListMessages,
  handleEmailSearch,
  handleEmailGetMessage,
  handleEmailListFolders,
  handleEmailDraftMessage,
  handleEmailSendMessage,
  handleEmailReply,
  handleEmailForward,
  handleEmailMarkRead,
  handleEmailArchive,
  handleEmailMove,
  handleEmailLabel,
  handleEmailDelete
} from './email/tools'
import { sessionRegistry } from './sessionRegistry'
import { wrapExecute } from './toolRegistry'
import type { ToolSourceContext } from './toolRegistry'
import { readRecentInteractions } from './interactionLog'
import { INTERACTION_LOG_CAPACITY } from '../../shared/interactionLog'
import { buildSettingsSnapshot } from './settingsSnapshot'
import type { ScreenshotResult } from './chatSession'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCoreTools(ctx: ToolSourceContext): Record<string, any> {
  const { rootPath: projectRoot, emit, toolCtx, hookCtx } = ctx
  return {
    read_file: tool({
      description:
        'Read the contents of a file with line numbers (each line is "N<tab>text"). Use project-relative paths. Reads up to 2000 lines by default; for larger files pass offset/limit to page through.',
      inputSchema: z.object({
        path: z.string().describe('File path relative to the project root'),
        offset: z.number().optional().describe('1-based line number to start reading from (default 1)'),
        limit: z.number().optional().describe('Maximum number of lines to return (default 2000)')
      }),
      execute: wrapExecute('read_file', handleReadFile, projectRoot, emit, toolCtx, hookCtx)
    }),
    write_file: tool({
      description:
        'Write content to a file. Creates the file and any missing parent directories if they do not exist. Overwriting an existing file requires reading it with read_file first.',
      inputSchema: z.object({
        path: z.string().describe('File path relative to the project root'),
        content: z.string().describe('The full file content to write')
      }),
      execute: wrapExecute('write_file', handleWriteFile, projectRoot, emit, toolCtx, hookCtx)
    }),
    edit_file: tool({
      description:
        'Replace a string in a file. old_string must match the file exactly — strip the "N<tab>" line-number prefix that read_file adds before composing it. Fails if old_string is not found, or if it appears more than once (add surrounding context to disambiguate, or pass replace_all to replace every occurrence). The file must have been read with read_file earlier in the conversation.',
      inputSchema: z.object({
        path: z.string().describe('File path relative to the project root'),
        old_string: z.string().describe('Exact string to find and replace (without read_file line-number prefixes)'),
        new_string: z.string().describe('String to replace old_string with'),
        replace_all: z.boolean().optional().describe('Replace every occurrence instead of requiring a unique match (default false)')
      }),
      execute: wrapExecute('edit_file', handleEditFile, projectRoot, emit, toolCtx, hookCtx)
    }),
    list_directory: tool({
      description: 'List files and subdirectories in a directory.',
      inputSchema: z.object({
        path: z.string().describe('Directory path relative to the project root. Use "." for the root.')
      }),
      execute: wrapExecute('list_directory', handleListDirectory, projectRoot, emit, toolCtx, hookCtx)
    }),
    delete_file: tool({
      description: 'Delete a single file. Refuses directories — use run_command to remove those.',
      inputSchema: z.object({
        path: z.string().describe('File path relative to the project root')
      }),
      execute: wrapExecute('delete_file', handleDeleteFile, projectRoot, emit, toolCtx, hookCtx)
    }),
    move_file: tool({
      description: 'Move or rename a file. Creates missing parent directories at the destination; fails if the destination already exists.',
      inputSchema: z.object({
        path: z.string().describe('Current file path relative to the project root'),
        new_path: z.string().describe('New file path relative to the project root')
      }),
      execute: wrapExecute('move_file', handleMoveFile, projectRoot, emit, toolCtx, hookCtx)
    }),
    grep: tool({
      description:
        'Search file contents for a regex pattern using ripgrep. Respects .gitignore and skips binary files. Returns matching lines as file:line:text. Searches the entire project by default; narrow with path or include.',
      inputSchema: z.object({
        pattern: z.string().describe('Regex pattern to search for (ripgrep syntax)'),
        path: z.string().optional().describe('Directory to search in, relative to project root (default: entire project)'),
        include: z.string().optional().describe('Comma-separated extensions or globs to include, e.g. ".ts,.tsx" or "*.py" or "src/**/*.css"'),
        case_sensitive: z.boolean().optional().describe('Case-sensitive match (default: false)'),
        context: z.number().optional().describe('Show N lines of context around each match (max 10)')
      }),
      execute: wrapExecute('grep', handleGrep, projectRoot, emit, toolCtx, hookCtx)
    }),
    glob: tool({
      description:
        'Find files by name pattern, e.g. "*.test.ts" or "src/**/*.css". Respects .gitignore. Results are sorted most-recently-modified first.',
      inputSchema: z.object({
        pattern: z.string().describe('Glob pattern to match file paths against'),
        path: z.string().optional().describe('Directory to search in, relative to project root (default: entire project)')
      }),
      execute: wrapExecute('glob', handleGlob, projectRoot, emit, toolCtx, hookCtx)
    }),
    run_command: tool({
      description:
        'Run a shell command in the project directory. Use for installing packages, running tests, linting, git, etc. Returns stdout/stderr. Default timeout is 2 minutes — pass timeout (ms) for longer runs. For servers and watchers that should keep running, pass run_in_background: true and poll with read_process_output.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute'),
        timeout: z.number().optional().describe('Timeout in milliseconds (default 120000, max 600000). Ignored for background commands.'),
        run_in_background: z.boolean().optional().describe('Start the command as a background process and return a shell_id immediately (default false)')
      }),
      execute: wrapExecute('run_command', handleRunCommand, projectRoot, emit, toolCtx, hookCtx)
    }),
    read_process_output: tool({
      description: 'Read output produced by a background process since the last read. Also reports whether it is still running.',
      inputSchema: z.object({
        shell_id: z.string().describe('The shell_id returned by run_command with run_in_background')
      }),
      execute: wrapExecute('read_process_output', handleReadProcessOutput, projectRoot, emit, toolCtx, hookCtx)
    }),
    kill_process: tool({
      description: 'Kill a background process started with run_command run_in_background.',
      inputSchema: z.object({
        shell_id: z.string().describe('The shell_id of the process to kill')
      }),
      execute: wrapExecute('kill_process', handleKillProcess, projectRoot, emit, toolCtx, hookCtx)
    }),
    fetch_url: tool({
      description:
        'Fetch a web page or API endpoint and return its readable text content (HTML is converted to plain text). Use after search_web to read a result, or directly when the user gives a URL.',
      inputSchema: z.object({
        url: z.string().describe('The http/https URL to fetch')
      }),
      execute: wrapExecute('fetch_url', handleFetchUrl, projectRoot, emit, toolCtx, hookCtx)
    }),
    todo_write: tool({
      description:
        'Replace your task list for this conversation. Use for multi-step work: create the list when you start, mark exactly one item in_progress at a time, and mark items completed as soon as they are done. The user sees the list as a live checklist.',
      inputSchema: z.object({
        todos: z
          .array(
            z.object({
              content: z.string().describe('Short imperative description of the task'),
              status: z.enum(['pending', 'in_progress', 'completed']).describe('Current state of the task')
            })
          )
          .describe('The full task list — this replaces the previous list entirely')
      }),
      execute: wrapExecute(
        'todo_write',
        async (input) => {
          const todos = (input.todos ?? []) as TodoItem[]
          getConversationToolState(toolCtx.sessionId).todos = todos
          emit(IPC.AI_TODOS_UPDATED, { sessionId: toolCtx.sessionId, todos })
          const done = todos.filter((t) => t.status === 'completed').length
          return `Todo list updated: ${done}/${todos.length} completed.`
        },
        projectRoot,
        emit,
        toolCtx,
        hookCtx
      )
    }),
    ask_user: tool({
      description: 'Ask the user a clarifying question and wait for their response before continuing. Use when you need input or a decision from the user. Provide 2–6 multiple-choice options when relevant.',
      inputSchema: z.object({
        question: z.string().describe('The question to ask the user'),
        options: z.array(z.string()).optional().describe('2–6 multiple-choice options for the user to select from')
      }),
      execute: async (input, options) => {
        const id = options.toolCallId
        const session = sessionRegistry.get(toolCtx.sessionId)
        if (!session) {
          // No registered session — happens only if the tool runs outside a
          // ChatSession-managed turn (no current path does this). Return
          // the cancelled sentinel rather than hang forever.
          return '[cancelled]'
        }
        return new Promise<string>((resolve) => {
          session.pendingAskUser.set(id, resolve)
          emit(IPC.AI_ASK_USER, { sessionId: session.sessionId, questionId: id, question: input.question, options: input.options ?? [] })
        })
      }
    }),
    screenshot: tool({
      description: 'Capture a single frame from whatever the user is currently sharing (screen, window, or camera) and attach the image to your context. Only works when the user has share-screen or camera mode enabled in the chat composer; returns an error otherwise. Useful when you need to see the user\'s current screen state or look at them through their camera.',
      inputSchema: z.object({}),
      execute: async (_input, options): Promise<string> => {
        const id = options.toolCallId
        const sessionId = toolCtx.sessionId
        emit(IPC.AI_TOOL_CALL_START, { sessionId, id, name: 'screenshot', params: {} })
        const session = sessionRegistry.get(sessionId)
        const cancelled: ScreenshotResult = { ok: false, reason: 'cancelled' }
        if (!session) {
          // No registered session — no current path reaches this branch.
          // Return the cancelled sentinel rather than hang forever.
          emit(IPC.AI_TOOL_CALL_END, { sessionId, id, result: cancelled.reason, error: true })
          return JSON.stringify(cancelled)
        }
        const result = await new Promise<ScreenshotResult>((resolve) => {
          session.pendingScreenshots.set(id, resolve)
          // sessionId rides along so the renderer can echo it back unchanged
          // on AI_CAPTURE_SCREENSHOT_RESULT — no need for the renderer to
          // reach into a sessions store.
          emit(IPC.AI_CAPTURE_SCREENSHOT, { requestId: id, sessionId: session.sessionId })
        })
        if (!result.ok) {
          emit(IPC.AI_TOOL_CALL_END, { sessionId, id, result: result.reason, error: true })
        } else {
          const summary = `Captured ${result.mode} frame${result.sourceLabel ? ` (${result.sourceLabel})` : ''}`
          emit(IPC.AI_TOOL_CALL_END, { sessionId, id, result: summary, error: false })
        }
        return JSON.stringify(result)
      },
      toModelOutput: ({ output }) => {
        let parsed: ScreenshotResult
        try {
          parsed = typeof output === 'string' ? JSON.parse(output) : (output as ScreenshotResult)
        } catch {
          return { type: 'error-text', value: 'Failed to parse screenshot result.' }
        }
        if (!parsed.ok) {
          return { type: 'error-text', value: parsed.reason }
        }
        const commaIdx = parsed.dataUrl.indexOf(',')
        const base64 = commaIdx >= 0 ? parsed.dataUrl.slice(commaIdx + 1) : parsed.dataUrl
        return {
          type: 'content',
          value: [
            {
              type: 'text',
              text: `Screenshot of ${parsed.mode}${parsed.sourceLabel ? ` (${parsed.sourceLabel})` : ''}.`
            },
            { type: 'media', data: base64, mediaType: 'image/jpeg' }
          ]
        }
      }
    }),
    search_web: tool({
      description: 'Search the web for up-to-date information using the search provider configured in Settings > Providers > Search (Brave, Tavily, or Browserbase). Use when the user asks about current events, documentation, libraries, or anything that may have changed since the model was trained. Returns JSON with result titles, URLs, and snippets — use fetch_url to read a result page.',
      inputSchema: z.object({
        query: z.string().describe('The search query — natural language is fine'),
        numResults: z.number().optional().describe('Maximum number of results to return (server picks a default if omitted)')
      }),
      execute: wrapExecute('search_web', handleSearchWeb, projectRoot, emit, toolCtx, hookCtx)
    }),
    // ── Memory subsystem (~/.rose/memory/) ────────────────────────────────
    // Diary, behaviour records, and contacts are agent-global — they live in
    // ~/.rose/ alongside ROSE.md so the Agent carries them across every
    // Workspace it operates in.
    memory_read_diary: tool({
      description: 'Read your diary entry for a given date. Use this to recall what happened on a previous day.',
      inputSchema: z.object({
        date: z.string().describe('Date key in yyyy-mm-dd format')
      }),
      execute: wrapExecute('memory_read_diary', handleMemoryReadDiary, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_list_diary: tool({
      description: 'List the dates of your existing diary entries. Optional from/to bounds (yyyy-mm-dd, inclusive).',
      inputSchema: z.object({
        from: z.string().optional().describe('Inclusive lower bound, yyyy-mm-dd'),
        to: z.string().optional().describe('Inclusive upper bound, yyyy-mm-dd')
      }),
      execute: wrapExecute('memory_list_diary', handleMemoryListDiary, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_write_diary: tool({
      description: 'Write or overwrite your diary entry for a given date. Normally called only by the daily scheduler — use sparingly outside of that flow.',
      inputSchema: z.object({
        date: z.string().optional().describe('Date key in yyyy-mm-dd format (defaults to today)'),
        content: z.string().describe('Full markdown body of the diary entry')
      }),
      execute: wrapExecute('memory_write_diary', handleMemoryWriteDiary, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_add_behavior_record: tool({
      description: 'Record a standing behaviour directive the user has given you ("from now on, always X"; "don\'t Y"; "prefer Z"). Use when the user expresses a durable preference about how you should act. The decision + details are written to a dated markdown file the user can review later.',
      inputSchema: z.object({
        slug: z.string().describe('Short kebab-case identifier for the behaviour, e.g. "ask-before-pushing-main"'),
        decision: z.string().describe('One-line summary of the behaviour the user wants'),
        details: z.string().describe('Longer explanation: why the user wants this, when it applies, what the impact on your behaviour should be')
      }),
      execute: wrapExecute('memory_add_behavior_record', handleMemoryAddBehaviorRecord, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_list_behavior_records: tool({
      description: 'List every behaviour record the user has given you. Use at the start of work in an unfamiliar context to refresh your standing directives.',
      inputSchema: z.object({}),
      execute: wrapExecute('memory_list_behavior_records', handleMemoryListBehaviorRecords, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_read_behavior_record: tool({
      description: 'Read the full text of a behaviour record by filename.',
      inputSchema: z.object({
        filename: z.string().describe('Filename returned by memory_list_behavior_records, e.g. 2026-05-21-ask-before-pushing-main.md')
      }),
      execute: wrapExecute('memory_read_behavior_record', handleMemoryReadBehaviorRecord, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_remove_behavior_record: tool({
      description: 'Delete a behaviour record. Use only when the user explicitly retracts a directive.',
      inputSchema: z.object({
        filename: z.string().describe('Filename of the record to remove')
      }),
      execute: wrapExecute('memory_remove_behavior_record', handleMemoryRemoveBehaviorRecord, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_new_contact: tool({
      description: 'Create an empty contact entry for a person, business, website, or other entity. Notes are added separately via memory_add_contact_note. The `kind` classification is what gates Google Contacts sync — set it accurately if you can.',
      inputSchema: z.object({
        entity: z.string().describe('Name of the person/business/website/other'),
        kind: z.enum(['person', 'business', 'website', 'other']).optional().describe('Classification — defaults to "other" if omitted. Set this when you know.')
      }),
      execute: wrapExecute('memory_new_contact', handleMemoryNewContact, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_set_contact_kind: tool({
      description: 'Update the kind classification of an existing contact (person / business / website / other). Use this when you learn a contact you previously created is actually a different kind than you initially assumed.',
      inputSchema: z.object({
        entity: z.string().describe('Name of the contact'),
        kind: z.enum(['person', 'business', 'website', 'other']).describe('New classification')
      }),
      execute: wrapExecute('memory_set_contact_kind', handleMemorySetContactKind, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_read_contact: tool({
      description: 'Read every note you have about a person/place/thing by name.',
      inputSchema: z.object({
        entity: z.string().describe('Name of the contact to read')
      }),
      execute: wrapExecute('memory_read_contact', handleMemoryReadContact, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_search_contacts: tool({
      description: 'Search your contacts using one or more query strings (case-insensitive substring). Each query is checked against every contact\'s name and notes; a contact becomes a hit if at least one query matches anywhere. Returns JSON: { queries: string[], hits: [{ entity, kind, matchedQueryCount, totalMatches, nameMatches: string[], noteMatches: [{ note, queries }], contact: <markdown if a query matched the name, else null> }] }. Hits are ranked highest first — more distinct queries matched is the primary signal, then total match count, then alphabetical. Pass multiple queries to look up several candidates at once (e.g. variant spellings, related people, related topics).',
      inputSchema: z.object({
        queries: z.array(z.string()).min(1).describe('One or more terms to search for in contact names and notes. Each is matched independently; results combine and rank by match count.')
      }),
      execute: wrapExecute('memory_search_contacts', handleMemorySearchContacts, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_add_contact_note: tool({
      description: 'Append a note to a contact. Creates the contact if it does not yet exist. Notes are bullets in the contact\'s markdown file.',
      inputSchema: z.object({
        entity: z.string().describe('Name of the contact'),
        note: z.string().describe('The note to add (one line, no leading bullet)')
      }),
      execute: wrapExecute('memory_add_contact_note', handleMemoryAddContactNote, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_remove_contact_note: tool({
      description: 'Remove a note from a contact. Matches notes case-insensitively against the supplied text.',
      inputSchema: z.object({
        entity: z.string().describe('Name of the contact'),
        note: z.string().describe('The note text to remove')
      }),
      execute: wrapExecute('memory_remove_contact_note', handleMemoryRemoveContactNote, projectRoot, emit, toolCtx, hookCtx)
    }),
    // ─── rose-calendar (Memory.Event) ──────────────────────────────────
    memory_create_event: tool({
      description: 'Create a calendar event in agent memory. Events store as markdown under ~/.rose/memory/calendar/{yyyy}/{mm}/{dd}/. Times are ISO 8601 — `2026-05-22T14:00` for timed events (pair with `timeZone`), `2026-05-22` for all-day (set `allDay: true`). For recurring events pass `recurrence` as an array of RRULE/RDATE/EXDATE strings (e.g. ["RRULE:FREQ=WEEKLY;BYDAY=TU"]).',
      inputSchema: z.object({
        summary: z.string().describe('Event title'),
        start: z.string().describe('ISO 8601 start time (or date for all-day)'),
        end: z.string().optional().describe('ISO 8601 end time. Defaults to start if omitted.'),
        allDay: z.boolean().optional().describe('Mark as an all-day event (uses date-only values for start/end)'),
        timeZone: z.string().optional().describe('IANA timezone, e.g. America/New_York. Ignored for all-day.'),
        description: z.string().optional(),
        location: z.string().optional(),
        attendees: z.array(z.union([z.string(), z.object({ email: z.string(), displayName: z.string().optional(), responseStatus: z.string().optional() })])).optional().describe('Attendee emails (strings) or {email, displayName?, responseStatus?} objects'),
        recurrence: z.array(z.string()).optional().describe('Array of RRULE/RDATE/EXDATE strings, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=TU"]'),
        calendarId: z.string().optional().describe('Target Google calendar id (defaults to "primary" on push)')
      }),
      execute: wrapExecute('memory_create_event', handleCalendarCreateEvent, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_edit_event: tool({
      description: 'Edit an existing event. Identify it either by `date` + `slug` (the local ref returned by memory_list_events) or by `google_id`. Pass only the fields you want to change.',
      inputSchema: z.object({
        date: z.string().optional().describe('yyyy-mm-dd of the event\'s storage directory'),
        slug: z.string().optional().describe('Filename slug without .md'),
        google_id: z.string().optional().describe('Google iCalUID, as stored in the event\'s google-id bullet'),
        summary: z.string().optional(),
        description: z.string().optional(),
        location: z.string().optional(),
        status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
        start: z.string().optional(),
        end: z.string().optional(),
        allDay: z.boolean().optional(),
        timeZone: z.string().optional(),
        attendees: z.array(z.union([z.string(), z.object({ email: z.string(), displayName: z.string().optional(), responseStatus: z.string().optional() })])).optional(),
        recurrence: z.array(z.string()).optional()
      }),
      execute: wrapExecute('memory_edit_event', handleCalendarEditEvent, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_get_event: tool({
      description: 'Fetch the full record of an event (summary, times, description, attendees, recurrence, google ids). Identify by date+slug or google_id.',
      inputSchema: z.object({
        date: z.string().optional(),
        slug: z.string().optional(),
        google_id: z.string().optional()
      }),
      execute: wrapExecute('memory_get_event', handleCalendarGetEvent, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_list_events: tool({
      description: 'List events whose occurrences fall inside a date-time range. Recurring events are expanded via RRULE — you see one row per occurrence. Both bounds are ISO 8601; the upper bound is exclusive.',
      inputSchema: z.object({
        start: z.string().describe('Inclusive lower bound, ISO 8601'),
        end: z.string().describe('Exclusive upper bound, ISO 8601'),
        calendarIds: z.array(z.string()).optional().describe('Restrict to specific Google calendarIds. Local-only events are always included.'),
        limit: z.number().optional().describe('Max occurrences to return (default 100)')
      }),
      execute: wrapExecute('memory_list_events', handleCalendarListEvents, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_invite_to_event: tool({
      description: 'Add attendees to a synced event and trigger Google\'s native invitation email (Google sends the standard calendar invite to each new attendee). The event must already be synced — push it first if it has no google-id.',
      inputSchema: z.object({
        date: z.string().optional(),
        slug: z.string().optional(),
        google_id: z.string().optional(),
        attendees: z.array(z.union([z.string(), z.object({ email: z.string(), displayName: z.string().optional() })])).describe('Attendees to invite — email strings or {email, displayName?} objects')
      }),
      execute: wrapExecute('memory_invite_to_event', handleCalendarInviteToEvent, projectRoot, emit, toolCtx, hookCtx)
    }),
    memory_delete_event: tool({
      description: 'Delete an event. If the event is synced to Google, the remote copy is removed first (and attendees are notified). Local-only events are removed from disk.',
      inputSchema: z.object({
        date: z.string().optional(),
        slug: z.string().optional(),
        google_id: z.string().optional()
      }),
      execute: wrapExecute('memory_delete_event', handleCalendarDeleteEvent, projectRoot, emit, toolCtx, hookCtx)
    }),
    // ─── rose-email: read group ───────────────────────────────────────
    email_list_messages: tool({
      description: 'List messages in a folder.',
      inputSchema: z.object({
        folder: z.string().optional().describe('Folder/label ID. Defaults to INBOX.'),
        limit: z.number().optional().describe('Max messages to return. Default 50.'),
        query: z.string().optional().describe('Free-text search filter applied server-side.')
      }),
      execute: wrapExecute('email_list_messages', handleEmailListMessages, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_search: tool({
      description: 'Search messages by free-text query.',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        folder: z.string().optional().describe('Restrict to a folder/label ID'),
        limit: z.number().optional().describe('Max results. Default 50.')
      }),
      execute: wrapExecute('email_search', handleEmailSearch, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_get_message: tool({
      description: 'Fetch a full message by ID.',
      inputSchema: z.object({ messageId: z.string().describe('Message ID returned by list/search') }),
      execute: wrapExecute('email_get_message', handleEmailGetMessage, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_list_folders: tool({
      description: 'List available folders/labels.',
      inputSchema: z.object({}),
      execute: wrapExecute('email_list_folders', handleEmailListFolders, projectRoot, emit, toolCtx, hookCtx)
    }),
    // ─── rose-email: compose group ────────────────────────────────────
    email_draft_message: tool({
      description: 'Create a draft (no send). Returns the draft ID.',
      inputSchema: z.object({
        to: z.array(z.object({ address: z.string(), name: z.string().optional() })).describe('Recipients'),
        cc: z.array(z.object({ address: z.string(), name: z.string().optional() })).optional(),
        bcc: z.array(z.object({ address: z.string(), name: z.string().optional() })).optional(),
        subject: z.string(),
        body: z.string(),
        inReplyTo: z.string().optional().describe('Message-Id this draft replies to')
      }),
      execute: wrapExecute('email_draft_message', handleEmailDraftMessage, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_send_message: tool({
      description: 'Send a new message.',
      inputSchema: z.object({
        to: z.array(z.object({ address: z.string(), name: z.string().optional() })),
        cc: z.array(z.object({ address: z.string(), name: z.string().optional() })).optional(),
        bcc: z.array(z.object({ address: z.string(), name: z.string().optional() })).optional(),
        subject: z.string(),
        body: z.string(),
        draftId: z.string().optional().describe('Send a previously-created draft instead')
      }),
      execute: wrapExecute('email_send_message', handleEmailSendMessage, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_reply: tool({
      description: 'Reply to a message.',
      inputSchema: z.object({
        messageId: z.string(),
        body: z.string(),
        replyAll: z.boolean().optional()
      }),
      execute: wrapExecute('email_reply', handleEmailReply, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_forward: tool({
      description: 'Forward a message.',
      inputSchema: z.object({
        messageId: z.string(),
        to: z.array(z.object({ address: z.string(), name: z.string().optional() })),
        body: z.string().optional()
      }),
      execute: wrapExecute('email_forward', handleEmailForward, projectRoot, emit, toolCtx, hookCtx)
    }),
    // ─── rose-email: triage group ─────────────────────────────────────
    email_mark_read: tool({
      description: 'Toggle the read/unread flag on a message.',
      inputSchema: z.object({ messageId: z.string(), read: z.boolean() }),
      execute: wrapExecute('email_mark_read', handleEmailMarkRead, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_archive: tool({
      description: 'Archive a message (Gmail: remove INBOX label; IMAP: move to Archive).',
      inputSchema: z.object({ messageId: z.string() }),
      execute: wrapExecute('email_archive', handleEmailArchive, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_move: tool({
      description: 'Move a message to a different folder/label.',
      inputSchema: z.object({ messageId: z.string(), folder: z.string() }),
      execute: wrapExecute('email_move', handleEmailMove, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_label: tool({
      description: 'Add or remove a label/keyword on a message.',
      inputSchema: z.object({ messageId: z.string(), label: z.string(), add: z.boolean() }),
      execute: wrapExecute('email_label', handleEmailLabel, projectRoot, emit, toolCtx, hookCtx)
    }),
    email_delete: tool({
      description: 'Move a message to Trash. Never hard-deletes.',
      inputSchema: z.object({ messageId: z.string() }),
      execute: wrapExecute('email_delete', handleEmailDelete, projectRoot, emit, toolCtx, hookCtx)
    }),
    // ── Settings snapshot (configuration + live connection tests) ───────────
    read_settings_snapshot: tool({
      description: 'Return a structured snapshot of the user\'s current ProjectRose configuration plus live connection-test results for every configured provider. Two top-level keys: `configuration` (the user\'s settings, with credentials stripped) and `connections` (one entry per provider with `status: "ok" | "not-configured" | "failed: <reason>"` and optional `detail`). Providers tested: projectRose (managed model auth), ollama (local model server), googleAuth (OAuth token refresh), googleCalendar (scope check), imap, smtp. Use when the user asks "is X working", "what\'s configured", "why isn\'t Y connecting", or before suggesting they change a provider. Calls hit the network — only invoke when you actually need a live read; one call per turn is typically enough.',
      inputSchema: z.object({}),
      execute: wrapExecute(
        'read_settings_snapshot',
        async (_input, root) => {
          const snapshot = await buildSettingsSnapshot(root)
          return JSON.stringify(snapshot)
        },
        projectRoot,
        emit,
        toolCtx,
        hookCtx
      )
    }),
    // ── User-interaction log (in-memory ring, capacity 50) ───────────────────
    read_recent_interactions: tool({
      description: `Read the most recent UI actions the user has taken in this app (this session only — the log is in-memory and resets on app restart). Returns up to ${INTERACTION_LOG_CAPACITY} entries, newest last, each shaped as { timestamp, kind, target? }. Use when the user refers to "what I just did", their current view, a setting they toggled, or otherwise expects you to know recent UI context. Kinds include: view.changed (target=view), view.chat-toggled, view.terminal-toggled, chat.message-sent, settings.changed (target=key path, never a value), project.opened, extension.installed/uninstalled/enabled/disabled/opened, email.opened/sent/replied/forwarded/archived/deleted/moved/labeled, contact.created/edited/deleted, calendar.event-created/edited/deleted, routine.created/edited/deleted/fired.`,
      inputSchema: z.object({
        limit: z.number().optional().describe(`Max entries to return (default and max ${INTERACTION_LOG_CAPACITY}).`)
      }),
      execute: wrapExecute(
        'read_recent_interactions',
        async (input) => {
          const rawLimit = typeof input.limit === 'number' ? input.limit : INTERACTION_LOG_CAPACITY
          const limit = Math.max(0, Math.min(INTERACTION_LOG_CAPACITY, Math.floor(rawLimit)))
          const entries = readRecentInteractions(limit)
          return JSON.stringify(entries)
        },
        projectRoot,
        emit,
        toolCtx,
        hookCtx
      )
    })
  }
}
