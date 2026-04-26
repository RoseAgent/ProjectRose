# Write Extension

Create a fully functional ProjectRose extension from scratch.

The user may supply a description in `$ARGUMENTS`. If omitted, ask what the extension should do before proceeding.

---

## What a ProjectRose Extension Is

An extension is a `.zip` file installed per-project under `.projectrose/extensions/{id}/`. It can:

- Add a **page** to the sidebar nav (via `PageView` React component)
- Add a **settings panel** to the settings sidebar (via `SettingsView` React component)
- Register **AI tools** the agent can call (via `main.js` + `ctx.registerTools()`)
- Run **background logic** in the main process (file watchers, IPC handlers, etc.)

---

## Folder Structure to Create

```
rose-{name}/
├── rose-extension.json     # Manifest — required
├── src/
│   ├── renderer.tsx        # React components (PageView / SettingsView)
│   └── main.ts             # Main-process module (optional)
├── package.json            # Build config
└── tsconfig.json
```

The built output (what goes in the zip) is:
```
rose-{name}/
├── rose-extension.json
├── renderer.js             # CJS bundle of renderer.tsx
└── main.js                 # CJS bundle of main.ts (optional)
```

---

## 1. Manifest — rose-extension.json

```json
{
  "id": "rose-{name}",
  "name": "Display Name",
  "version": "0.1.0",
  "description": "One-line description",
  "author": "Your Name",
  "navItem": {
    "label": "Label",
    "iconName": "icon"
  },
  "provides": {
    "pageView": true,
    "globalSettings": true,
    "main": false
  }
}
```

**Field rules:**
- `id` — kebab-case, prefix `rose-`. Must be unique.
- `navItem` — omit entirely if the extension has no sidebar page.
- `provides.pageView` — set `true` if `renderer.js` exports `PageView`.
- `provides.globalSettings` — set `true` if `renderer.js` exports `SettingsView`.
- `provides.main` — set `true` if a `main.js` is included.

---

## 2. Renderer Bundle — src/renderer.tsx

The renderer is compiled to a **CommonJS bundle** (`renderer.js`). The host loads it with a custom `require()` that resolves shared dependencies from `window.__rose__`. **Never bundle React yourself** — always require it.

### Available shared imports

```ts
const React = require('react')
const { useProjectStore }  = require('@renderer/stores/useProjectStore')
const { useSettingsStore } = require('@renderer/stores/useSettingsStore')
const { useChatStore }     = require('@renderer/stores/useChatStore')
const { useFileStore }     = require('@renderer/stores/useFileStore')
const { useThemeStore }    = require('@renderer/stores/useThemeStore')
const { useViewStore }     = require('@renderer/stores/useViewStore')
const { useServiceStore }  = require('@renderer/stores/useServiceStore')
```

### Store APIs you'll use most

```ts
// Current project root path
const rootPath = useProjectStore(s => s.rootPath)

// Read + write settings (persisted to disk automatically)
const settings = useSettingsStore(s => s)
// Extension settings are namespaced under settings.extensions['rose-{name}']
const mySettings = useSettingsStore(s => s.extensions?.['rose-{name}'] ?? {})
const update = useSettingsStore(s => s.update)
// Save: update({ extensions: { ...currentExt, 'rose-{name}': { key: value } } })
```

### Component exports

```tsx
// renderer.tsx — source (compiled to renderer.js)
"use strict"
const React = require('react')
const { useProjectStore } = require('@renderer/stores/useProjectStore')

function PageView() {
  const rootPath = useProjectStore(s => s.rootPath)
  return (
    <div style={{ padding: 24 }}>
      <h2>My Extension</h2>
      <p>Project: {rootPath}</p>
    </div>
  )
}

function SettingsView() {
  return (
    <div style={{ padding: 16 }}>
      <p>Settings go here</p>
    </div>
  )
}

exports.PageView = PageView
exports.SettingsView = SettingsView
```

**Rules:**
- Use `exports.PageView` and `exports.SettingsView` (CommonJS, not ESM).
- Both components receive no props — use store hooks for all data.
- JSX is supported if you use `require('react/jsx-runtime')`, or write `React.createElement()` calls directly (safer for a hand-written bundle).
- For a hand-written `renderer.js` (no build step): write `React.createElement()` calls directly to avoid JSX transpilation.

---

## 3. Main Module — src/main.ts (optional)

Only needed if the extension registers AI tools, watches files, or needs background logic.

```ts
// main.ts — compiled to main.js (CJS)
module.exports = {
  register(ctx) {
    // ctx.rootPath          — absolute path to project root
    // ctx.getSettings()     — Promise<AppSettings>
    // ctx.updateSettings(p) — Promise<void>
    // ctx.broadcast(ch, d)  — send IPC event to all renderer windows
    // ctx.registerTools([]) — register AI tools the agent can call
    // ctx.runBackgroundAgent(prompt) — invoke the AI agent

    ctx.registerTools([
      {
        name: 'my_tool',
        description: 'What this tool does',
        schema: {
          input: { type: 'string', description: 'The input value' }
        },
        execute: async (args, projectRoot) => {
          // args.input is a string
          return 'result string'
        }
      }
    ])

    // Return optional cleanup function
    return () => {
      // Called on disable/uninstall
    }
  }
}
```

**Tool schema**: plain object where each key is a parameter name with `{ type, description }`. Types: `'string'`, `'number'`, `'boolean'`.

---

## 4. Build Config

### package.json

```json
{
  "name": "rose-{name}",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "node build.mjs",
    "pack": "node pack.mjs"
  },
  "devDependencies": {
    "esbuild": "^0.21.0"
  }
}
```

### build.mjs

```js
import { build } from 'esbuild'

// Renderer bundle
await build({
  entryPoints: ['src/renderer.tsx'],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  outfile: 'dist/renderer.js',
  external: [
    'react',
    'react/jsx-runtime',
    'react-dom',
    '@renderer/stores/useProjectStore',
    '@renderer/stores/useSettingsStore',
    '@renderer/stores/useChatStore',
    '@renderer/stores/useFileStore',
    '@renderer/stores/useThemeStore',
    '@renderer/stores/useViewStore',
    '@renderer/stores/useServiceStore',
    '@renderer/stores/useIndexingStore',
    '@renderer/stores/useTerminalStore',
  ],
  jsx: 'automatic',
})

// Main bundle (if provides.main = true)
await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: 'dist/main.js',
  external: ['electron', 'fs', 'path', 'os', 'child_process'],
})
```

### pack.mjs (creates the installable zip)

```js
import { createWriteStream, copyFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'

const id = JSON.parse(require('fs').readFileSync('rose-extension.json', 'utf-8')).id
const zipPath = `${id}.zip`

if (process.platform === 'win32') {
  const ps = `Compress-Archive -Path '.\\dist\\*','rose-extension.json' -DestinationPath '${zipPath}' -Force`
  spawnSync('powershell', ['-NoProfile', '-Command', ps])
} else {
  spawnSync('zip', ['-j', zipPath, 'rose-extension.json', 'dist/renderer.js', 'dist/main.js'])
}
console.log(`Packed → ${zipPath}`)
```

---

## 5. Step-by-Step: What to Do

1. **Ask the user** what the extension should do (if not in `$ARGUMENTS`).
2. **Decide the ID** — `rose-{kebab-name}`, e.g. `rose-pomodoro`.
3. **Decide capabilities** — needs PageView? SettingsView? AI tools? Main module?
4. **Write `rose-extension.json`** with the right `provides` flags.
5. **Write `renderer.js`** directly as a hand-written CJS file (no build step needed for simple cases):
   - Use `React.createElement()` instead of JSX to avoid a transpile step.
   - `require('react')` for React, `require('@renderer/stores/...')` for stores.
   - `exports.PageView = ...` and/or `exports.SettingsView = ...`.
6. **Write `main.js`** if tools or background logic are needed.
7. **Package as zip** — on Windows use `Compress-Archive`, on Unix use `zip -j`.
8. **Tell the user** how to install: Settings → Extensions tab → INSTALL FROM DISK → select the zip.

For simple extensions, skip the build step entirely and write `renderer.js` and `main.js` as plain hand-crafted CJS files. Only set up esbuild when the extension needs TypeScript, JSX shorthand, or npm dependencies.

---

## 6. CSS / Styling

Extensions render inside the host app. Use inline styles or a `<style>` tag injected in `useEffect`. To match the Herbarium theme, use CSS variables that the host defines:

```ts
// Available CSS variables (Herbarium palette):
// --color-bg-primary       warm paper background
// --color-bg-secondary     slightly darker panel background
// --color-text-primary     main text
// --color-text-muted       de-emphasized text
// --color-accent           rose red / primary brand color
// --color-saved            green (success/connected)
// --color-unsaved          amber (unsaved/pending)
// --color-error            red
// --font-mono              monospace font stack
```

---

## 7. Testing

The extension system e2e tests in `tests/e2e/extensions.spec.ts` show the full install/enable/disable flow. To test manually:

1. Open a project in the app.
2. Go to Settings → Extensions → INSTALL FROM DISK.
3. Select the `.zip`.
4. The extension appears in the list with a Disable button.
5. If it has `navItem`, its label appears in the top navigation bar.
6. If it has `globalSettings`, its name appears in the Settings sidebar.
