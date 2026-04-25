import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import https from 'https'

const URLHAUS_URL = 'https://urlhaus.abuse.ch/downloads/text/'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000
const CACHE_FILE = 'urlhaus-cache.json'

interface CacheFile {
  lastUpdated: number
  domains: string[]
}

let _domains: Set<string> | null = null
let _lastUpdated: number | null = null
let _domainCount = 0

function cachePath(): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const electron = require('electron')
  return join(electron.app.getPath('userData'), CACHE_FILE)
}

function loadFromDisk(): boolean {
  const p = cachePath()
  if (!existsSync(p)) return false
  try {
    const data: CacheFile = JSON.parse(readFileSync(p, 'utf8'))
    if (Date.now() - data.lastUpdated > CACHE_TTL_MS) return false
    _domains = new Set(data.domains)
    _lastUpdated = data.lastUpdated
    _domainCount = data.domains.length
    return true
  } catch {
    return false
  }
}

function fetchText(url: string = URLHAUS_URL, redirectCount = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectCount > 3) { reject(new Error('Too many redirects')); return }
        res.resume()
        resolve(fetchText(res.headers.location, redirectCount + 1))
        return
      }
      if (res.statusCode && res.statusCode !== 200) {
        reject(new Error(`URLhaus returned HTTP ${res.statusCode}`))
        return
      }
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      res.on('error', reject)
    })
    req.setTimeout(30000, () => req.destroy(new Error('URLhaus request timed out')))
    req.on('error', reject)
  })
}

function parseDomainsFromText(text: string): string[] {
  const domains = new Set<string>()
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    try {
      const host = new URL(trimmed).hostname.toLowerCase().replace(/^www\./, '')
      if (host) domains.add(host)
    } catch { /* skip malformed lines */ }
  }
  return [...domains]
}

export async function refreshUrlhaus(): Promise<{ domainCount: number; lastUpdated: number }> {
  const text = await fetchText()
  const domains = parseDomainsFromText(text)
  const lastUpdated = Date.now()
  writeFileSync(cachePath(), JSON.stringify({ lastUpdated, domains } as CacheFile), 'utf8')
  _domains = new Set(domains)
  _lastUpdated = lastUpdated
  _domainCount = domains.length
  return { domainCount: _domainCount, lastUpdated }
}

// Called once per fetchMessages. Loads from disk if fresh; otherwise kicks off a
// background refresh so the next fetch will have an up-to-date list.
export function ensureUrlhausLoaded(): void {
  if (_domains) return
  if (loadFromDisk()) return
  refreshUrlhaus().catch((err) => console.warn('[urlhaus] background refresh failed:', err))
}

export function isBlockedByUrlhaus(domain: string): boolean {
  if (!_domains) return false
  return _domains.has(domain.toLowerCase().replace(/^www\./, ''))
}

export function getUrlhausStatus(): { lastUpdated: number | null; domainCount: number } {
  return { lastUpdated: _lastUpdated, domainCount: _domainCount }
}
