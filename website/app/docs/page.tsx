const sections = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    content: `Download ProjectRose for your platform from the download page. On first launch, open a project folder and ProjectRose will prompt you to initialize it with a ROSE.md configuration file.

The setup wizard walks you through naming your project, defining the agent's identity, and setting its autonomy level.`
  },
  {
    id: 'base-features',
    title: 'Base Features',
    content: `ProjectRose ships with four built-in views:

· Chat — Conversational AI agent with tool access (file read/write, shell commands, semantic code search)
· Editor — Monaco-based code editor with file tree and integrated terminal
· Heartbeat — Autonomous background agent that runs on a configurable interval
· Settings — Global and per-project configuration`
  },
  {
    id: 'extensions',
    title: 'Installing Extensions',
    content: `Open Settings → Extensions → Browse tab to see available extensions.
Click Install on any extension. The app will download and extract it, then prompt you to restart.

Built-in first-party extensions include Git, Docker, Email (IMAP), Discord, and Listen (speaker diarization).`
  },
  {
    id: 'extension-development',
    title: 'Building an Extension',
    content: `An extension is a GitHub repository with this structure:

  rose-extension.json   ← manifest
  dist/renderer.js      ← pre-built renderer bundle (ES module)
  dist/main.js          ← pre-built main-process bundle (optional)

The manifest declares what the extension provides:

  {
    "id": "my-extension",
    "name": "My Extension",
    "version": "1.0.0",
    "description": "...",
    "author": "Your Name",
    "navItem": { "label": "My View", "iconName": "custom" },
    "provides": {
      "pageView": true,
      "globalSettings": false,
      "projectSettings": false,
      "agentTools": true
    }
  }

The renderer bundle exports named React components:

  export const PageView: React.FC
  export const GlobalSettings: React.FC<{ settings, onChange }>
  export const ProjectSettings: React.FC<{ settings, onChange }>

The main bundle exports tool definitions:

  export const tools: ExtensionToolDefinition[]

Publish a GitHub Release with the bundle zip to make your extension installable.
To add it to the official registry, open a PR adding your extension to extensions/registry.json.`
  },
  {
    id: 'models',
    title: 'Configuring AI Models',
    content: `Go to Settings → Chat to add models.

Supported providers:
· Anthropic (Claude) — requires API key
· OpenAI (GPT-4o, o1, etc.) — requires API key
· Ollama — local models, no key needed
· OpenAI-compatible — any provider with an OpenAI-compatible endpoint
· AWS Bedrock — requires AWS credentials

You can configure a router model (small Ollama model) to automatically select the right model per request based on task type.`
  },
  {
    id: 'heartbeat',
    title: 'Heartbeat',
    content: `Heartbeat is an autonomous background agent that runs on a configurable interval (default: 5 minutes).

It reads your project state, reviews recent changes, and produces a structured summary log in .rose/heartbeat/.

Enable/disable and configure the interval in Settings → Heartbeat.`
  }
]

export default function DocsPage() {
  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 32px' }}>
      <div style={{ fontSize: 10, letterSpacing: 2.4, color: 'var(--ink-soft)', marginBottom: 24 }}>
        DOCUMENTATION
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 400, marginBottom: 48, letterSpacing: -0.3 }}>
        Docs
      </h1>

      <div style={{ display: 'flex', gap: 48 }}>
        {/* Sidebar */}
        <aside style={{ width: 200, flexShrink: 0 }}>
          <nav style={{ position: 'sticky', top: 32 }}>
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                style={{
                  display: 'block',
                  fontSize: 12,
                  color: 'var(--ink-mid)',
                  marginBottom: 12,
                  letterSpacing: 0.3
                }}
              >
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <div style={{ flex: 1 }}>
          {sections.map((s) => (
            <section key={s.id} id={s.id} style={{ marginBottom: 56, scrollMarginTop: 32 }}>
              <h2 style={{ fontSize: 18, fontWeight: 500, marginBottom: 16, letterSpacing: -0.2 }}>
                {s.title}
              </h2>
              <div style={{
                fontSize: 13,
                color: 'var(--ink-mid)',
                lineHeight: 1.8,
                whiteSpace: 'pre-line'
              }}>
                {s.content}
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
