# ProjectRose

ProjectRose is an **Agent Desktop** — a desktop OS-like layer that agents live in. The Electron app is the desktop, extensions are the apps, and the editor and chat are first-party apps shipped with the desktop.

## Language

**Agent Desktop**:
The product itself — the Electron app that hosts agents and the extensions they use. Preferred over "IDE" or "personal assistant", both of which describe a *configuration* of the desktop (which extensions are installed), not the desktop itself.
_Avoid_: IDE, assistant, harness, app (when referring to ProjectRose as a whole)

**Agent**:
A single persistent identity on a machine, stored at `~/.rose/`, that operates on **Workspaces**. One Agent per machine — there is no notion of multiple Agents to switch between. The Agent owns its system prompt (`~/.rose/ROSE.md`), provider credentials/config (sign-ins, Ollama base URL, Kimi auth method), and its agent-global records (**Contacts**, **Events**); the model itself is chosen per **Conversation** in the chat composer's ModelPicker (there is no global "active provider" — `settings.lastModel` records only the most recent pick, as the default for new Conversations and the fallback for background LLM work). A **Workspace** contributes optional project-specific operating instructions and per-project enable/disable + settings for installed **Extensions**. Running an agent means starting a **Turn** inside a **Conversation** with it; the LLM-loop instance is the **Turn**, not the agent itself.
_Avoid_: bot, assistant (lowercase), AI

**Conversation**:
A persistent, resumable thread of turns the user holds with an agent in the chat panel. Identified in the code as `sessionId`. Always bound to exactly one **Workspace** (`workspacePath` on its meta) — the active Conversation is what determines the active Workspace, not the other way round (see ADR 0016). Carries its own provider+model pair (`model` on its meta), picked in the chat composer's ModelPicker and pinned across reloads. Persisted agent-global at `~/.rose/conversations/<encoded-workspace>/<sessionId>/main.json`, with the real Workspace path recorded in the group's `workspace.json` (the encoded directory name is lossy and never decoded).
_Avoid_: chat, session (bare), thread, history

**External Session**:
A read-only transcript discovered in another agent CLI's on-disk store — Claude Code at `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl`, Codex at `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Surfaced in the sidebar grouped under its Workspace (the real cwd, read from inside the file — never decoded from the lossy directory name) alongside Rose **Conversations**, badged by source. The on-disk transcript is never mutated. The viewer shows the same chat composer as a Rose Conversation; "continuing" one depends on the ModelPicker choice: the session's own CLI (Claude/Codex) resumes it in the integrated terminal (`claude --resume` / `codex resume`, optional `--model`, typed message passed as the first prompt), while a Rose provider forks the transcript into a brand-new Rose Conversation seeded with the converted history. Parsed by `src/main/services/externalSessions/{claudeReader,codexReader}.ts` into the shared `ExternalTranscript` shape (`src/shared/externalSession.ts`), whose entry kinds mirror the Detached Run transcript so the same renderer cells apply. See ADR 0016.
_Avoid_: foreign session, imported chat, legacy session

**Turn**:
A single cycle of "one user message → one agent response", together with the per-turn scratch state (abort signal, pending ask-user resolvers, modified-files list, per-extension injection budget). Constructed at the start of the cycle, disposed at the end.
_Avoid_: chat session, request, message-pair

**Agent Handle**:
A live, in-memory, multi-turn handle that an **Extension** opens against an **Agent** to talk to it programmatically (not user-visible). Returned by the `openAgentSession` capability. Distinct from a **Conversation** (no persistence) and from a **Turn** (spans many turns).
_Avoid_: agent session (when speaking canonically), sub-conversation

**Extension**:
An installable unit that adds capability to the **Agent Desktop** — tools the agent can call, hooks that fire on chat events, and optionally a UI panel. The single word covers both panelled and headless extensions; we do *not* distinguish "app" vs "service" at the language level. Lives in `RoseExtensions/`.
_Avoid_: app, plugin, add-on, integration

**Workspace**:
The folder/scope an **Agent** operates inside for a given **Conversation** — the absolute `rootPath` the agent reads, writes, and runs commands within. Survives the IDE/assistant distinction: it can be a code repo or a CRM-data folder or a documents folder; the harness doesn't care. Bounded by `projectPathGuard.ts`. There is no app-level "open workspace" independent of Conversations: **the active Conversation determines the active Workspace** (file tree, terminal, LSP, editor all follow it). Selecting a Conversation binds its Workspace; there is no launch-time Workspace gate (ADR 0016 amends ADR 0006).
_Avoid_: project, root, working directory, folder (as a domain noun)

**Skill**:
A workspace-scoped markdown how-to that an **Agent** loads on demand to learn a specific task. Lives at `<workspace>/skills/*.md` with `description:` frontmatter and a body. Not part of an **Extension**, not a **Tool** — it's instructional content the agent reads.
_Avoid_: playbook, recipe, guide, prompt template

**Tool**:
A named, schema-typed action an **Agent** can invoke during a **Turn**. Umbrella term covering both host-supplied tools (`read_file`, `edit_file`, `grep`/`glob` (ripgrep-backed, see ADR 0018), `run_command` (async, with **Background Process** support), `fetch_url`, `todo_write`, `ask_user`, `screenshot`, etc.) and **Extension Tools**. The file-mutating tools enforce a read-before-modify guard: `edit_file` and `write_file`-on-an-existing-file require the file to have been read earlier in the same **Conversation**.
_Avoid_: action, function (in domain talk), command

**Background Process**:
A long-lived child process a **Turn** starts via `run_command` with `run_in_background` (dev servers, watchers, long builds). Owned by the **Conversation**, not the Turn — it survives across Turns, is addressed by the `shell_id` returned at spawn, is polled with `read_process_output` (cursor-based: each read returns only output since the last), stopped with `kill_process`, and reaped when the Conversation is deleted or the app quits. Registry at `src/main/services/backgroundProcesses.ts`.
_Avoid_: daemon, service, job (when speaking canonically)

**Extension Tool**:
A **Tool** contributed by an **Extension** via `ctx.registerTools()`. Distinct from a built-in tool because it crosses a trust/sandbox boundary — the extension's code, not the host's, executes when the agent calls it. Must agree with the manifest's `provides.tools[]` declaration on names.
_Avoid_: plugin tool, addon tool, third-party tool

**Hook**:
An **Extension**'s registered subscription to a chat event during a **Turn** (`on_thought`, `on_message`, `on_tool_call`, `on_user_message`, `on_token`). Has a handler, a type, and a priority. Hooks can be notification-only or can return an **Injection**.
_Avoid_: listener, interceptor, callback, watcher

**Injection**:
Content a **Hook** adds to a **Turn** by returning `{ inject: string }` from its handler. The unit of measurement for the per-extension injection budget and the target of the `first-wins` vs `all` injection policy. Not every hook produces one (`on_token` is notification-only).
_Avoid_: hook output, inject, contribution

**Worker**:
A transient, task-scoped LLM run that an **Agent** dispatches during a **Turn** to do a delegated piece of work (e.g., read-only codebase exploration). Has its own system prompt and a scoped tool set (often with destructive tools disabled). Dies when its task finishes. *Not* a persistent identity — distinct from **Agent**. The `explore` tool's queries are authored by the dispatching Agent itself (1–5 self-contained queries, one Worker each); the earlier mechanical keyword decomposition was removed.
_Avoid_: subagent (in canonical talk), child agent, sub-agent

**Detached Run**:
A one-shot LLM run an **Extension** triggers via `runBackgroundAgent` — runs in isolation, returns a single result, no chat hooks fire. Sibling to **Worker** (also transient, also not an Agent), but not nested inside a **Turn**; the trigger is the extension, not an agent.
_Avoid_: background agent (in canonical talk), background run, headless agent

**Scheduled Task**:
A first-party concept owned by the **rose-heartbeat** Extension. A markdown file in `<workspace>/.projectrose/tasks/*.md` with YAML frontmatter (including a `recurrence` like `1d`, `2h`, `1mo`) and a body. The Heartbeat extension picks up due tasks on each tick, runs each one as a **Detached Run**, and writes the agent's findings back into the task body's agent-maintained `## Memory` section. The host knows nothing about scheduling — this concept lives entirely in the extension.
_Avoid_: cron job, recurring agent, deferred work item, todo

**Routine**:
A user-defined recurring prompt that fires the Agent at a calendar-style schedule, with the resulting conversation persisted for later audit. Owned by the **rose-routines** built-in Extension. A routine is a workspace-scoped markdown file at `<workspace>/.projectrose/routines/{slug}.md` with a `# Routine: <name>` header, an `enabled:` bullet, an RRULE `recurrence:` bullet (RFC 5545, same shape Events use), a `fire-time:` bullet (local clock HH:MM), and a `tools:` sub-list naming the tool allowlist this routine may use. The body's `## Prompt` section holds the prompt fired at the Agent each occurrence. Each fire produces a transcript at `<workspace>/.projectrose/routines/{slug}/runs/{yyyy-mm-ddThh-mm-ss}.md`. Distinct from **Scheduled Task** (Heartbeat's interval grammar + `## Memory` mutation; Routine uses RRULE + a separate transcript-per-fire) and from **Event** (Calendar surfaces it on a grid and may invite attendees, but takes no Agent action on fire; a Routine's whole purpose IS the Agent action). The scheduler is **always-on** (ADR 0017): at app launch, runtimes start for every known Workspace that has enabled routines on disk, independent of which Conversation is active; `ensureRuntimeFor` brings a Workspace online the moment its first routine is saved. A routine only fires while the app is running — fires that pass while the app is closed are silently skipped (no catch-up). Parser/serializer at `src/shared/routineFields.ts`; per-fire wrapper at `src/shared/routineRun.ts`; the consumer-agnostic transcript shape at `src/shared/detachedRunTranscript.ts`. See ADR 0013. The execution primitive is a **Detached Run with tools**: rose-routines calls `ctx.runDetachedRunWithTools(prompt, systemPrompt, { allowedTools })`, a contract extension capability that runs a one-shot Agent turn with a pre-filtered tool set and returns a transcript instead of a single string — interactive tools (`ask_user`, `screenshot`) are auto-failed because no user is present. See ADR 0014.
_Avoid_: cron job, recurring agent, scheduled prompt, automation (when speaking canonically)

**Channel Rule**:
A user-defined binding of `(source, identifier) → prompt + tool allowlist` that fires the Agent when a matching message arrives on Discord, Slack, or email. Owned by the **rose-channels** built-in Extension. A rule is a workspace-scoped markdown file at `<workspace>/.projectrose/channel-rules/{slug}.md` with a `# Channel Rule: <name>` header, an `enabled:` bullet, a `source:` bullet (`discord` / `slack` / `email`), an `identifier:` bullet (Discord channel snowflake / Slack channel id / email sender address, or the literal `*` for the email fallback rule that matches any sender), an optional `identifier-display:` cosmetic label, and a `tools:` sub-list naming the tool allowlist. The body's `## Prompt` section holds the prompt fired at the Agent on each match. Distinct from **Routine** (clock-triggered vs. event-triggered; same execution primitive, different audit metadata): a Routine's wrapper carries `scheduledAt + trigger: scheduled|manual`, a Channel Rule's wrapper carries `source + identifier + sourceMessage + trigger: message|manual`. Each fire produces a transcript at `<workspace>/.projectrose/channel-rules/{slug}/runs/{yyyy-mm-ddThh-mm-ss}.md`. Matching is drop-silent: if no enabled rule covers the incoming message, the message is ignored (email has a single explicit `*` fallback; Discord and Slack have no wildcard). Reply is opt-in via the four destructive tools (`channels_send_discord`, `channels_reply_discord`, `channels_send_slack`, `channels_reply_slack`, plus the existing `email_reply`) which ship `defaultDisabled: true` — the agent's `finalText` is never auto-posted. The listeners are **always-on** (ADR 0017): rose-channels runtimes start at app launch for every known Workspace with enabled channel rules, independent of the active Conversation. Because the Discord/Slack bot tokens are agent-global (`credentialsStore` is not workspace-scoped), there is exactly ONE socket per platform shared across every always-on Workspace, and each incoming message fans out to every Workspace's rule matcher — a message matching rules in two Workspaces fires both. Missed messages while the app is closed are silently dropped (no catch-up). Parser/serializer at `src/shared/channelRuleFields.ts`; per-fire wrapper at `src/shared/channelRuleRun.ts`. See ADR 0015.
_Avoid_: channel (alone — overloaded with Discord/Slack chatroom; always say "Channel Rule"), reactor, trigger, automation (when speaking canonically)

**Detached Run Transcript**:
The structured shape returned by `ctx.runDetachedRunWithTools` (ADR 0014). An ordered list of entries (`user_message | assistant_thought | assistant_message | tool_call | tool_result`) plus token counts, duration, and the final assistant text. Consumer-agnostic — wrapper records (`RoutineRunRecord`, `ChannelRuleRunRecord`) compose it with their own per-fire header metadata. Lives at `src/shared/detachedRunTranscript.ts`. Originally named `RoutineTranscript`; renamed in the ADR 0014 / ADR 0015 followup once channels became the second consumer.
_Avoid_: routine transcript (the old name), run record (covers the wrapper, not the inner structure)

**Contact**:
One markdown file per entity at `~/.rose/contact/{entity}.md`: `# Entity: Name` followed by a `- kind: <person|business|website|other>` bullet and then bullets that are either structured-by-convention (`email:`, `phone:`, `address:`, `url:`, `org:`, `title:`) or freeform notes. Agent-global (lives in the host, not a Workspace) because the people the Agent knows are not project-scoped. Distinct from **rose-crm** contacts, which are structured business records (email/phone/company) in workspace-scoped JSON. The user manages these in the **rose-contacts** built-in extension — opened from the App Board, with a per-field detail editor and Google sync controls under its drawer-cog SettingsView. (Built-in extensions ship inside the host repo, are always loaded, and cannot be uninstalled — see ADR 0010.) Google integration is BYO-credentials: the user creates their own OAuth client in Google Cloud Console and pastes the clientId + clientSecret into **Settings > Providers > Google** — see ADR 0009 (which supersedes ADR 0008's PKCE-only model). Google's structured fields flatten into the same bullet labels the editor edits, sharing a parser/serializer at `src/shared/contactFields.ts`; the on-disk file format does not change. The Google-sync filter is per-kind — by default only `person` and `business` entries round-trip with Google. Agent tools are prefixed `contacts_*`.
_Avoid_: memory (retired term), address book, CRM entry (that's rose-crm)

**Event**:
One markdown file per event at `~/.rose/calendar/{yyyy}/{mm}/{dd}/{slug}.md`. The file is filed under the event's first-occurrence date; recurring events store a single master at that date with an `- recurrence: RRULE:…` bullet and are expanded into per-occurrence views at runtime (via the `rrule` library). Agent-global, like **Contact**. Format mirrors **Contact**'s bullet shape: a `# Event: <summary>` header, structured bullets (`start:`, `end:`, `location:`, `attendee:`, `recurrence:`, `google-id:`, `google-calendar-id:`), and free-form `## Description` (or other `##`) sections. Parser/serializer at `src/shared/eventFields.ts`. The user manages these in the **rose-calendar** built-in extension — month-grid PageView with a create/edit drawer, Google Calendar sync under its drawer-cog SettingsView. Google integration reuses the same BYO OAuth pair as Contacts and Email (ADR 0009 / ADR 0012); the `calendar` scope is included in `GOOGLE_SCOPES`, so users signed in before this change re-consent on next sign-in. **Invitations are sent by Google, never by us** — the event-invite tool and the renderer's attendee editor add attendees and trigger `events.patch({sendUpdates: 'all'})`, which makes Google email the standard calendar invitation. The tool errors with a clear "push this event first" message when called against an unsynced event. The sync filter is per-Google-calendar: by default only the user's `primary` calendar round-trips, and the SettingsView shows a per-calendar checkbox list of every calendar the account exposes. Agent tools are prefixed `events_*`.
_Avoid_: memory (retired term), appointment, calendar entry (when speaking canonically)

**Email Account**:
The single mailbox the **Agent Desktop** is signed in to via the **rose-email** built-in extension. Identified by its `address`. Exactly zero or one at a time — multi-account is intentionally not supported (see ADR 0011). Owned by `AppSettings.email.account`.
_Avoid_: inbox, mailbox, mail (as a domain noun)

**Email Transport**:
The protocol stack used to read and send for the **Email Account**. Either `imap` (IMAP for read, SMTP for send, with passwords encrypted in `userData/email-imap.bin`) or `google` (Gmail API, reusing the shared Google OAuth token). Mutually exclusive; switching wipes the inactive transport's local state and the **Quarantine** ledger. Stored at `AppSettings.email.transport`.
_Avoid_: backend, provider, account type

**Quarantine**:
A heuristic-only holding queue for incoming email messages flagged as suspected prompt-injection. Quarantined messages are invisible to `email_list_messages` and `email_get_message`; only `email_list_quarantined` returns them, and only the off-by-default `email_release_from_quarantine` tool (or the renderer's manual Release button) re-admits a message to the read tools. Detection is heuristic — phrase regex bank, hidden-text scanner, role-claim patterns, imperative density — no LLM in the read path. Ledger keyed on `${transport}:${messageId}` at `userData/email-quarantine.json`.
_Avoid_: spam, junk, blocklist, filter

## Relationships

- An **Agent Desktop** hosts a single **Agent** and many **Extensions**, and lets the **Agent** operate on many **Workspaces**.
- An **Agent** participates in one or more **Conversations** with the user, scoped to the **Workspace** the conversation is in.
- A **Conversation** is a sequence of **Turns**, each one a single message→response cycle.
- An **Agent** may dispatch **Workers** during a **Turn**.
- An **Extension** contributes tools, hooks, and optionally a UI panel that the user opens from the Apps Drawer (UI rename to "Extensions Drawer" is implied but not yet done).
- An **Extension** may open one or more **Agent Handles** to drive an **Agent** programmatically.

## Flagged ambiguities

- **"Memory" is a retired term — do not reuse it.** The host-memory subsystem (Diary, Behavior Records, their feeder logs, and the background contacts-updater sweep) was deliberately deleted in July 2026 (ADR 0019) to clear the ground for a future, completely different memory system. **Contact** and **Event** were part of the old "Memory" umbrella but survive as standalone concepts at `~/.rose/contact/` and `~/.rose/calendar/`; never describe them as "memory". The word — and the `~/.rose/memory/` path, the `memory_*` tool prefix, and the `memory.*` IPC namespace — are reserved for the future system. Until it exists, the Agent has no durable self-writable record: standing directives ("from now on always X") are user-managed via ROSE.md in Settings → Prompts, by design.

- **"channel" is overloaded.** Discord and Slack use the word for a chatroom (e.g. `#alerts`); rose-channels uses it for the extension as a whole. When talking about the per-source-prompt binding, the canonical noun is **Channel Rule**, never "channel" alone. When referring to a Discord/Slack chatroom, the canonical phrasing is "Discord channel #alerts" or "Slack channel #general" — never "channel" alone.



- **"session" is overloaded in the code.** Three distinct lifetimes share the word:
  - `ChatSession` (per-turn scratch) → canonical name: **Turn**
  - `sessionId` (persistent thread) → canonical name: **Conversation** (`conversationId`)
  - `AgentSession` (extension's multi-turn handle) → canonical name: **Agent Handle**

  Code has not been reconciled with the canonical language; refer by canonical names in conversation and ADRs even when reading code that uses the old terms.

- **"project" in the code is the canonical "Workspace".** `recentProjects.ts`, `projectHandlers.ts`, `projectSettingsHandlers.ts`, `projectPathGuard.ts` all use "project" but refer to what the canonical language calls a **Workspace**. Do not interpret these as something distinct from a Workspace.

- **"subagent" in the code is the canonical "Worker".** `subagentTools.ts`, `AgentContext.agentIndex` (`0 = main agent, 1+ = subagents`), `saveSubagentSession`, and the `subagent:<label>` IPC events all refer to what the canonical language calls a **Worker**. Subagents are *not* a kind of **Agent** (which is a persistent identity); they are transient delegated runs.

- **"backgroundAgent" capability in the contract is the canonical "Detached Run".** `provides.backgroundAgent`, `ctx.runBackgroundAgent(...)`, and the capability label "Run scheduled background tasks" all refer to what the canonical language calls a **Detached Run**. A Detached Run is *not* an **Agent** (no persistent identity, no Persona); it is a one-shot LLM execution that an extension triggers.

- **"Bloom" in the code is the voice-mode visualisation of a Conversation, not the Conversation itself.** `BloomStage.tsx` is the animated orb that occupies the centre column of the chat view; the **Conversation** is the persistent thread of Turns, whose text appears in `ChatPanel`. When discussing the UI mode, say "bloom mode" (orb visible) vs "editor mode" (Monaco visible). Top-level `activeView` values are `'chat' | 'editor' | 'settings' | 'account'`; "bloom mode" is `activeView === 'chat'`.
