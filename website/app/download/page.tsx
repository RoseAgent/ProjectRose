import { DownloadClient } from './DownloadClient'

interface GithubAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GithubRelease {
  tag_name: string
  name: string
  published_at: string
  assets: GithubAsset[]
}

async function getLatestRelease(): Promise<GithubRelease | null> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/ghalrym/ProjectRose/releases/latest',
      {
        next: { revalidate: 3600 },
        headers: { Accept: 'application/vnd.github+json' }
      }
    )
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

function categorizeAssets(assets: GithubAsset[]): Record<string, GithubAsset[]> {
  const categories: Record<string, GithubAsset[]> = {
    windows: [],
    macos: [],
    linux: []
  }
  for (const asset of assets) {
    const n = asset.name.toLowerCase()
    if (n.endsWith('.exe') || n.endsWith('.msi') || n.includes('win')) {
      categories.windows.push(asset)
    } else if (n.endsWith('.dmg') || n.endsWith('.pkg') || n.includes('mac') || n.includes('darwin')) {
      categories.macos.push(asset)
    } else if (n.endsWith('.deb') || n.endsWith('.rpm') || n.endsWith('.appimage') || n.includes('linux')) {
      categories.linux.push(asset)
    }
  }
  return categories
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function DownloadPage() {
  const release = await getLatestRelease()
  const categories = release ? categorizeAssets(release.assets) : {}

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '64px 32px' }}>
      <div style={{ fontSize: 10, letterSpacing: 2.4, color: 'var(--ink-soft)', marginBottom: 24 }}>
        DOWNLOAD
      </div>
      <h1 style={{ fontSize: 36, fontWeight: 400, marginBottom: 8, letterSpacing: -0.3 }}>
        Download ProjectRose
      </h1>
      {release ? (
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 48 }}>
          Version {release.tag_name} · Released {new Date(release.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      ) : (
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 48 }}>
          No release found yet. Check the{' '}
          <a href="https://github.com/ghalrym/ProjectRose/releases" target="_blank" rel="noopener noreferrer">
            GitHub releases page
          </a>{' '}
          directly.
        </p>
      )}

      {/* OS-detected recommendation (client component) */}
      {release && <DownloadClient categories={categories} />}

      {/* All downloads */}
      {release && (
        <div style={{ marginTop: 48 }}>
          <div style={{ fontSize: 10, letterSpacing: 2.4, color: 'var(--ink-soft)', marginBottom: 24 }}>
            ALL DOWNLOADS
          </div>
          {(['windows', 'macos', 'linux'] as const).map((platform) => (
            categories[platform]?.length > 0 && (
              <div key={platform} style={{ marginBottom: 32 }}>
                <div style={{ fontSize: 12, letterSpacing: 1.2, color: 'var(--ink-soft)', marginBottom: 12 }}>
                  {platform.toUpperCase()}
                </div>
                {categories[platform].map((asset) => (
                  <a
                    key={asset.name}
                    href={asset.browser_download_url}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      border: '1px solid var(--line)',
                      marginBottom: 8,
                      color: 'var(--ink)',
                      fontSize: 13
                    }}
                  >
                    <span>{asset.name}</span>
                    <span style={{ color: 'var(--ink-soft)', fontSize: 11 }}>{formatBytes(asset.size)}</span>
                  </a>
                ))}
              </div>
            )
          ))}
        </div>
      )}

      <div style={{
        marginTop: 64,
        padding: '24px',
        border: '1px solid var(--line)',
        fontSize: 13,
        color: 'var(--ink-mid)',
        lineHeight: 1.7
      }}>
        <strong>Requirements:</strong> Windows 10+, macOS 12+, or Ubuntu 20.04+.
        ProjectRose runs entirely locally — no account or internet connection required after download.
      </div>
    </main>
  )
}
