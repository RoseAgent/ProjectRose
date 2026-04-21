import Link from 'next/link'

const FEATURES = [
  {
    title: 'Local-first',
    desc: 'All computation runs on your machine. No telemetry, no cloud, no subscriptions. Your code never leaves.'
  },
  {
    title: 'AI-powered chat',
    desc: 'Conversational coding agent with full tool access — reads files, writes code, runs commands, and searches your codebase semantically.'
  },
  {
    title: 'Extensible',
    desc: 'An app-store model for IDE features. Install only what you need: Git, Docker, Email, Discord, and community extensions.'
  },
  {
    title: 'Multi-model',
    desc: 'Use Claude, GPT-4o, Ollama, or any OpenAI-compatible endpoint. Switch models per project without changing your workflow.'
  },
  {
    title: 'Heartbeat',
    desc: 'Autonomous background agent that processes deferred tasks, summarizes activity, and keeps your project state current.'
  },
  {
    title: 'Code intelligence',
    desc: 'Semantic code search, symbol references, and project overview — all indexed locally using tree-sitter and ChromaDB.'
  }
]

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section style={{
        padding: '80px 32px 64px',
        maxWidth: 960,
        margin: '0 auto'
      }}>
        <div style={{ fontSize: 10, letterSpacing: 2.4, color: 'var(--ink-soft)', marginBottom: 20 }}>
          PROJECTROSE · LOCAL AI IDE · OPEN SOURCE
        </div>
        <h1 style={{
          fontSize: 52,
          fontWeight: 400,
          letterSpacing: -0.5,
          lineHeight: 1.1,
          marginBottom: 24,
          maxWidth: 640
        }}>
          A coding IDE that runs entirely{' '}
          <span style={{ color: 'var(--sepia)', fontStyle: 'italic' }}>on your machine.</span>
        </h1>
        <p style={{
          fontSize: 16,
          color: 'var(--ink-mid)',
          maxWidth: 560,
          lineHeight: 1.7,
          marginBottom: 40
        }}>
          ProjectRose combines a Monaco-based code editor with a powerful AI agent, local code indexing,
          and an extensible app store — all running locally with no cloud required.
        </p>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/download" style={{
            display: 'inline-block',
            padding: '10px 24px',
            background: 'var(--ink)',
            color: 'var(--paper)',
            fontSize: 12,
            letterSpacing: 1.4,
            border: 'none',
            cursor: 'pointer'
          }}>
            DOWNLOAD
          </Link>
          <a
            href="https://github.com/ghalrym/ProjectRose"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '10px 24px',
              border: '1px solid var(--line)',
              color: 'var(--ink)',
              fontSize: 12,
              letterSpacing: 1.4
            }}
          >
            VIEW SOURCE
          </a>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--line)', margin: '0 32px' }} />

      {/* Features */}
      <section style={{ padding: '64px 32px', maxWidth: 960, margin: '0 auto' }}>
        <div style={{
          fontSize: 10,
          letterSpacing: 2.4,
          color: 'var(--ink-soft)',
          marginBottom: 40
        }}>
          FEATURES
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 32
        }}>
          {FEATURES.map((f) => (
            <div key={f.title}>
              <div style={{
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: 0.5,
                marginBottom: 8,
                color: 'var(--sepia)'
              }}>
                {f.title}
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-mid)', lineHeight: 1.7 }}>
                {f.desc}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '48px 32px',
        maxWidth: 960,
        margin: '0 auto',
        borderTop: '1px solid var(--line)'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 400, marginBottom: 8 }}>
              Browse the extension store
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-mid)' }}>
              Git, Docker, Email, Discord, and more — install only what you need.
            </div>
          </div>
          <Link href="/extensions" style={{
            display: 'inline-block',
            padding: '10px 24px',
            border: '1px solid var(--line)',
            color: 'var(--ink)',
            fontSize: 12,
            letterSpacing: 1.4
          }}>
            BROWSE EXTENSIONS
          </Link>
        </div>
      </section>
    </main>
  )
}
