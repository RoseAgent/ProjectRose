import type { RegistryExtension } from './types'

const REGISTRY_URL =
  'https://raw.githubusercontent.com/ghalrym/ProjectRose/master/extensions/registry.json'

const CATEGORY_LABELS: Record<string, string> = {
  communication: 'Communication',
  'dev-tools': 'Dev Tools',
  productivity: 'Productivity'
}

async function getExtensions(): Promise<RegistryExtension[]> {
  try {
    const res = await fetch(REGISTRY_URL, { next: { revalidate: 3600 } })
    if (!res.ok) return []
    const data = await res.json()
    return data.extensions ?? []
  } catch {
    return []
  }
}

export default async function ExtensionsPage() {
  const extensions = await getExtensions()

  const byCategory: Record<string, RegistryExtension[]> = {}
  for (const ext of extensions) {
    for (const cat of ext.categories) {
      if (!byCategory[cat]) byCategory[cat] = []
      byCategory[cat].push(ext)
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 32px' }}>
      <div style={{ fontSize: 10, letterSpacing: 2.4, color: 'var(--ink-soft)', marginBottom: 24 }}>
        EXTENSIONS
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 400, marginBottom: 12, letterSpacing: -0.3 }}>
        Extension Store
      </h1>
      <p style={{ color: 'var(--ink-mid)', fontSize: 14, marginBottom: 48, lineHeight: 1.7, maxWidth: 560 }}>
        ProjectRose ships with a minimal base (Chat, Editor, Heartbeat, Settings).
        Everything else is an extension — install only what you need.
        Extensions are installed and managed from inside the app under Settings → Extensions.
      </p>

      {Object.keys(byCategory).length === 0 && (
        <div style={{ color: 'var(--ink-soft)', fontSize: 13 }}>
          No extensions found. Check back soon or{' '}
          <a href="https://github.com/ghalrym/ProjectRose" target="_blank" rel="noopener noreferrer">
            contribute one on GitHub
          </a>.
        </div>
      )}

      {Object.entries(byCategory).map(([cat, exts]) => (
        <div key={cat} style={{ marginBottom: 48 }}>
          <div style={{
            fontSize: 10,
            letterSpacing: 2.4,
            color: 'var(--ink-soft)',
            marginBottom: 20,
            paddingBottom: 12,
            borderBottom: '1px solid var(--line)'
          }}>
            {CATEGORY_LABELS[cat] ?? cat.toUpperCase()}
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16
          }}>
            {exts.map((ext) => (
              <div key={ext.id} style={{
                padding: '20px',
                border: '1px solid var(--line)',
                background: 'var(--card)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{ext.name}</div>
                  {ext.firstParty && (
                    <span style={{
                      fontSize: 9,
                      letterSpacing: 1.2,
                      color: 'var(--sepia)',
                      border: '1px solid var(--sepia)',
                      padding: '1px 6px'
                    }}>
                      OFFICIAL
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-mid)', lineHeight: 1.6, marginBottom: 12 }}>
                  {ext.description}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>
                  v{ext.version} · {ext.author}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{
        marginTop: 64,
        padding: '24px',
        border: '1px solid var(--line)',
        fontSize: 13,
        color: 'var(--ink-mid)',
        lineHeight: 1.7
      }}>
        <strong>Want to publish an extension?</strong>{' '}
        Extensions are GitHub repos with a <code>rose-extension.json</code> manifest and a pre-built JS bundle.{' '}
        <a href="/docs">Read the extension development guide →</a>
      </div>
    </main>
  )
}
