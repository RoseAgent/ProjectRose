---
description: How to build a ProjectRose extension — the rose-extension.json manifest, the provides.* capability contract, bundle layout, and the registry-submission flow
---

A ProjectRose extension is a folder bundled into a zip with a manifest at its root. The host loads it at startup; what it can do is gated by what it declares in `manifest.provides`.

## Minimal manifest

`rose-extension.json` at the bundle root:

```json
{
  "id": "rose-myext",
  "name": "My Extension",
  "version": "0.1.0",
  "description": "What it does in one line",
  "author": "you",
  "icon": "icon.png",
  "navItem": { "label": "My Ext", "iconName": "Star" },
  "provides": {
    "pageView": true,
    "main": true,
    "agentTools": true,
    "tools": [
      { "name": "myext_do_thing", "displayName": "Do thing", "description": "..." }
    ],
    "chatHooks": true,
    "hooks": [{ "type": "on_user_message", "injectionPolicy": "first-wins", "priority": 100 }],
    "systemPrompt": "prompt.md"
  }
}
```

## What `provides.*` gates

| Field | Enables |
|---|---|
| `pageView` | A React component shown in the App Board sidebar. Renderer bundle (`renderer.js`) required. |
| `projectSettings` / `globalSettings` | A settings page surface — workspace-scoped or agent-global. |
| `main` | Loads `main.js` in the main process and calls `register(ctx)`. Required for any background or tool work. |
| `agentTools` + `tools[]` | Lets `ctx.registerTools(...)` register agent tools. Each entry in `tools[]` shows up in Settings → Tools. `defaultDisabled: true` adds the tool to the project's `disabledTools` list at install time. |
| `chatHooks` + `hooks[]` | Lets `ctx.registerHooks(...)` add lifecycle handlers: `on_user_message`, `on_thought`, `on_message`, `on_tool_call`, `on_token`. Declare each in `hooks[]` so the host can warn on drift. |
| `agentSession` | `ctx.openAgentSession(...)` — multi-turn in-memory agent handle. |
| `backgroundAgent` | `ctx.runBackgroundAgent(prompt, systemPrompt)` — one-shot agent invocation. |
| `detachedRunWithTools` | `ctx.runDetachedRunWithTools(...)` — one-shot agent run with an explicit tool allowlist; returns a structured transcript. |
| `notifyStatus` | `ctx.notifyStatus(...)` — push a status line to the UI. |
| `broadcast` | `ctx.broadcast(...)` — send arbitrary events to the renderer. |
| `systemPrompt` | Relative path to a `.md` file appended to the system prompt as the extension's default. User can override per-workspace at `.projectrose/prompts/<id>.md`. |

The host's context slicer (`buildContext.ts`) only gives you the methods you declared. Calling an undeclared capability throws a clear error.

## Bundle layout

```
my-extension.zip
├── rose-extension.json     # manifest (required)
├── main.js                 # CommonJS, exports register(ctx)  (if provides.main)
├── renderer.js             # CommonJS for App Board view      (if provides.pageView)
├── icon.png                # navItem icon
├── prompt.md               # default system-prompt contribution (if provides.systemPrompt)
└── style.css               # optional renderer CSS
```

Renderer code uses a custom `require()` that routes `react`, `react-dom`, and the host's renderer API through `window.__rose__` so the extension shares the host's React.

## Registering tools (main process)

```js
exports.register = (ctx) => {
  ctx.registerTools([
    {
      name: 'myext_do_thing',
      description: 'Do the thing the user asked about',
      schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: async (input, projectRoot, toolCtx) => {
        // do work — return a string the agent can read
        return `did it for ${input.query}`
      }
    }
  ])
}
```

## Registering chat hooks

```js
ctx.registerHooks({
  on_user_message: async (turn, hookCtx) => {
    // return { injection: '...' } to add content to the turn, or null to skip
    return null
  }
})
```

## Settings & secrets

Per-extension settings are namespaced under `settings.extensions['rose-myext']` in both global and project settings JSON. Secrets (passwords, OAuth tokens) **should not** go in settings.json — write them to `userData/<your-id>-secret.bin` via Electron's `safeStorage`, the pattern email and Google integrations follow.

## Distribution

1. Build a zip from your bundle folder.
2. Publish a GitHub Release with the zip attached.
3. Open a PR to `extensions/registry.json` at the ProjectRose repo root — community extensions are listed there and surfaced in the in-app store via the raw GitHub URL.

## First-party reference extensions

The four built-ins ship in the host bundle (never installed from a zip, always enabled):

- **rose-contacts** — agent-global contacts + Google Contacts sync
- **rose-email** — IMAP/SMTP and Gmail inbox/compose
- **rose-calendar** — agent-global calendar + Google Calendar sync
- **rose-routines** — scheduled agent prompts (weekly / bi-weekly / monthly / yearly) with per-routine tool allowlists

Their source lives under `src/renderer/src/extensions/builtins/` and is the cleanest reference for the contract.

## Related skills

- `rose:tools` — the tool registry, how `disabledTools` and `enabledExtensionIds` filter what the agent sees
- `rose:settings` — where `settings.extensions['rose-<id>']` lives
