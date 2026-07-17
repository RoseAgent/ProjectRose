export interface ReleaseEntry {
  version: string
  tag: string | null
  date: string | null
  title: string
  highlights: string[]
}

export const RELEASES: ReleaseEntry[] = [
  {
    version: '1.9.4',
    tag: null,
    date: null,
    title: 'Manage routines from chat',
    highlights: [
      'New Kimi provider — sign in with your kimi.com account under Settings → Providers → Kimi (browser-based OAuth, no API keys) and chats route through Kimi Code. Pick your model — Kimi for Coding, high-speed, K2 Thinking, or K3 — subject to your kimi.com plan; signing out falls back to your other providers',
      'The agent can now manage Routines for you — ask it in chat to create, edit, enable/disable, delete, or immediately run a routine, and to read a routine\'s run history and transcripts. Eight new routines_* tools, all toggleable under Settings → Tools',
      'Chats now pick their own folder — the app opens straight to your conversations instead of gating on "open a project." Start a new conversation and choose its workspace from the picker; the file tree, terminal, and editor follow whichever conversation you\'re in',
      'Conversations are grouped by folder in the sidebar, and your Claude Code and Codex sessions for those same folders show up right alongside them — badged and viewable read-only, so your whole history for a project lives in one place',
      'Routines and channel rules are now always-on — they run at launch for every folder that has them, so a scheduled routine fires and a Discord/Slack rule reacts even when you\'re working in a different conversation'
    ]
  },
  {
    version: '1.9.3',
    tag: null,
    date: null,
    title: 'Prompt editor reads the real ROSE.md',
    highlights: [
      'Fix: the ROSE.md card in Settings → Prompts now opens the global ~/.rose/ROSE.md that the agent actually reads at chat time — it had been pointing at a per-workspace file, so the editor showed empty content and Save wrote to a file the system prompt never loaded'
    ]
  },
  {
    version: '1.9.2',
    tag: null,
    date: null,
    title: 'Multi-query contact search',
    highlights: [
      'New built-in "report a bug" skill — the agent now has a guided flow plus a settings-snapshot tool and a recent-actions log of what you were just doing, so it can put together a useful bug report on your behalf',
      'Removed the email prompt-injection quarantine — incoming mail is no longer auto-flagged or hidden. The heuristic scanner, ledger, Quarantine tab, settings card, and the email_list_quarantined / email_release_from_quarantine agent tools are all gone',
      'Cleaner IPC error messages — Electron\'s `Error invoking remote method \'…\': Error:` envelope is now stripped at the binding layer, so renderer error UIs see the original main-process message verbatim',
      'Contact search now accepts multiple queries in one call and ranks hits by how many matched',
      'New built-in Routines extension — schedule a prompt to fire the Agent on a weekly / bi-weekly / monthly / yearly cadence with a tool allowlist, and audit every fire',
      'Extensions settings page unified into a single view — Installed and Available extensions are now visible together instead of behind a tab switch',
      'Read agent responses aloud — new built-in on-device text-to-speech via Piper, toggled from Settings → General. Replaces the vLLM TTS extension; voice files download on demand to ~/.rose/cache/piper/voices/.'
    ]
  },
  {
    version: '1.9.1',
    tag: null,
    date: null,
    title: 'Provider trim and chat timeline fixes',
    highlights: [
      'Providers narrowed to ProjectRose (managed) and Ollama (local) — Anthropic, OpenAI, Amazon Bedrock, and OpenAI-compatible options have been removed',
      'Ollama now holds a single model name instead of a list — pick it once under Settings → Providers → Ollama',
      'Router removed entirely; every chat goes to the configured model with no classification step',
      'Settings → Providers loses the Behavior & Context section; the compression toast still fires automatically and the never-used thinking-in-context and inline-tool-result toggles are gone',
      'Existing API keys, OpenAI-compatible base URLs, and the legacy model catalogue are dropped from settings on first launch (the previously-default Ollama model is preserved)',
      'Google integration now works out of the box in official builds — just sign in; there\'s no longer any need to create your own Google Cloud OAuth credentials. Builds without bundled keys (e.g. self-built) still let you paste your own under Settings → Providers → Google',
      'The Compress button now summarises the whole conversation, not just the older turns — the automatic suggestion still keeps your most recent turns verbatim',
      'Compressed turns collapse behind a single divider so it\'s obvious they were summarised; expand it any time to read the originals',
      'Fix: blank assistant cells no longer appear when the agent finishes a step with only thinking and tool calls',
      'Fix: the Compress button now reports its result (or why it can\'t run) instead of silently doing nothing',
      'Fix: chat messages no longer have their own inner scrollbars — long messages, thinking blocks, and tool output now flow into a single timeline scroll instead of nesting scroll areas'
    ]
  },
  {
    version: '1.9.0',
    tag: null,
    date: null,
    title: 'Built-in Contacts, Email, and Calendar',
    highlights: [
      'New built-in Contacts extension — list and edit people in agent memory, with two-way Google Contacts sync',
      'New built-in Email extension — single-account inbox and compose over IMAP/SMTP or Gmail, with a heuristic prompt-injection quarantine for incoming mail',
      'New built-in Calendar extension — create, edit, and list events in agent memory, with two-way Google Calendar sync and agent tools for scheduling',
      'Built-in extensions ship inside the app and are always available — no install step, no per-workspace enable toggle'
    ]
  },
  {
    version: '1.6.0',
    tag: null,
    date: null,
    title: 'Editor returns, smoother voice, and macOS fixes',
    highlights: [
      'Editor is back — switch between Bloom and Editor from the ProjectRose menu in the top-left; your choice is remembered across launches and the chat panel stays visible alongside the editor',
      'The floating dock button now slides over the editor instead of pushing its content up',
      'Active listening and the speech session feel smoother',
      'Extensions install once but enable, disable, and configure separately in each workspace',
      'Fix: macOS app opens from Finder again — a language-server crash on launch is resolved',
      'Fix: unsigned macOS builds now launch',
      'Fix: extensions installed in older versions are no longer blocked at startup',
      'Fix: the .projectrose workspace folder is always created when you open a project',
      'Fix: scheduled-task code no longer leaks into unrelated parts of the app',
      'Fix: removed a stale "default project" button on the welcome screen',
      'Fix: assistant message rendering edge case',
      'Improving code architecture under the hood for a more maintainable foundation'
    ]
  },
  {
    version: '1.5.1',
    tag: null,
    date: null,
    title: 'Web search built into the agent',
    highlights: [
      'Agent can now search the web with a new built-in search_web tool, powered by the ProjectRose search API',
      'Toggle Web Search on or off per project from Settings → Tools'
    ]
  },
  {
    version: '1.5.0',
    tag: null,
    date: null,
    title: 'Account sign-in, Concrete CMS, and compression-toast fix',
    highlights: [
      'Sign in to your ProjectRose account from Settings → Providers — no API keys to copy around',
      'When you\'re signed in, chats automatically use your account; sign out and your other providers come back',
      'Your sign-in is saved securely on your device',
      'New Concrete CMS extension in the in-app discovery page',
      'Bottom dock button can be repositioned to your preferred spot',
      'Settings page now spans the full window — the chat panel hides while you\'re in Settings to give settings more room',
      'Dock settings cog flips to the inner side of the main button when you drag it toward an edge, so the button itself stays closest to the screen edge',
      'App Board got a refresh — lighter background and a divider under the title for a cleaner look',
      'Extension settings pages have proper spacing so text no longer hugs the edge',
      'Fix: the compression toast no longer keeps reappearing after you click Compress'
    ]
  },
  {
    version: '1.4.0',
    tag: null,
    date: null,
    title: 'Screen sharing, redesigned navigation, and new extensions',
    highlights: [
      'Chat composer can share a screen, a window, or a camera feed with the agent',
      'A fresh frame is attached automatically to each message you send while sharing is on',
      'Live preview tile shows what the agent will see before you send',
      'Agent can take its own screenshots while working on screenshare-based tasks',
      'Redesigned navigation with a bottom dock and an apps drawer that pulls up from the menu bar',
      'Chat can open in full or half-screen view',
      'Settings button is now a cogwheel; agent and settings split out of the apps drawer',
      'New WordPress and Bond extensions, available in the in-app discovery page',
      'Extensions can mark individual tools as off-by-default',
      'Project opening no longer shows the app bar or breadcrumb'
    ]
  },
  {
    version: '1.3.1',
    tag: null,
    date: null,
    title: 'Extension prompts and session-aware extensions',
    highlights: [
      'Auto-update no longer forced — users can defer or skip versions',
      'Extensions can ship their own prompts',
      'Session id is passed to extensions so they can react to fresh user turns',
      'Coding harness extension added',
      'System tray supports closing the app',
      'Chat panel is now expandable',
      'adjustable active listening timer'
    ]
  },
  {
    version: '1.2.3',
    tag: 'v1.2.3-build.37',
    date: '2026-05-01',
    title: 'TTS extracted, two new bundled extensions',
    highlights: [
      'TTS removed from base app and moved to a dedicated extension',
      'New vllm-omni TTS extension',
      'Two additional extensions added to the base install set',
      'Auto-update issue with locating the build artifact fixed',
      'TTS test suite stabilized'
    ]
  },
  {
    version: '1.2.2',
    tag: 'v1.2.2-build.34',
    date: '2026-04-30',
    title: 'Previous-session view and auto-update infrastructure',
    highlights: [
      'View previous active sessions',
      'Auto-update infrastructure landed',
      'Project picker dropdown'
    ]
  },
  {
    version: '1.2.0',
    tag: 'v1.2.0-build.33',
    date: '2026-04-29',
    title: 'Dead-code purge and indexing cleanup',
    highlights: [
      'Large removal of dead code',
      'Indexing and project tools cleanup'
    ]
  },
  {
    version: '1.1.5',
    tag: 'v1.1.5-build.32',
    date: '2026-04-29',
    title: 'on_user_message hook and status bar polish',
    highlights: [
      'New on_user_message extension hook lets extensions reset state on fresh user turns',
      'Injections can now be collapsed in the chat',
      'Fix: status bar contributions from extensions were not rendering',
      'Status bar shows the build version',
      'Fix: non-viewable extensions no longer appear in navigation'
    ]
  },
  {
    version: '1.1.0',
    tag: 'v1.1.0-build.31',
    date: '2026-04-29',
    title: 'Chat hook infrastructure',
    highlights: [
      'Chat hook infrastructure for extensions',
      'Settings navigation improvements',
      'Fixed text input bug where the cursor would reset',
      'User-facing error message when no provider is configured',
      'Updated screenshots'
    ]
  },
  {
    version: '1.0.3-build.30',
    tag: 'v1.0.3-build.30',
    date: '2026-04-29',
    title: 'Documentation correction',
    highlights: ['Documentation correction']
  },
  {
    version: '1.0.3-build.29',
    tag: 'v1.0.3-build.29',
    date: '2026-04-29',
    title: 'GitHub Pages site update',
    highlights: ['GitHub Pages site update', 'Test fixes']
  },
  {
    version: '1.0.2-build.27',
    tag: 'v1.0.2-build.27',
    date: '2026-04-28',
    title: 'Initial tagged release',
    highlights: [
      'First tagged build with the auto-update channel wired up',
      'Build configuration corrected for proper versioning',
      'Discover page and install-from-disk extension flow'
    ]
  }
]
