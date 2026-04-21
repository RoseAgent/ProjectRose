'use client'

import { useEffect, useState } from 'react'

interface Asset {
  name: string
  browser_download_url: string
  size: number
}

interface Props {
  categories: Record<string, Asset[]>
}

type Platform = 'windows' | 'macos' | 'linux' | 'unknown'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('win')) return 'windows'
  if (ua.includes('mac')) return 'macos'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const PLATFORM_LABELS: Record<Platform, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  unknown: 'your platform'
}

export function DownloadClient({ categories }: Props) {
  const [platform, setPlatform] = useState<Platform>('unknown')

  useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  const platformAssets = platform !== 'unknown' ? (categories[platform] ?? []) : []
  const primaryAsset = platformAssets[0]

  if (!primaryAsset) return null

  return (
    <div style={{
      padding: '24px',
      background: 'var(--card)',
      border: '1px solid var(--line)',
      marginBottom: 32
    }}>
      <div style={{ fontSize: 10, letterSpacing: 2.4, color: 'var(--ink-soft)', marginBottom: 16 }}>
        RECOMMENDED FOR {PLATFORM_LABELS[platform].toUpperCase()}
      </div>
      <a
        href={primaryAsset.browser_download_url}
        style={{
          display: 'inline-block',
          padding: '12px 28px',
          background: 'var(--ink)',
          color: 'var(--paper)',
          fontSize: 13,
          letterSpacing: 0.5,
          marginBottom: 8
        }}
      >
        Download {primaryAsset.name}
      </a>
      <div style={{ fontSize: 11, color: 'var(--ink-soft)', marginTop: 8 }}>
        {formatBytes(primaryAsset.size)}
      </div>
      {platformAssets.length > 1 && (
        <div style={{ marginTop: 16 }}>
          {platformAssets.slice(1).map((asset) => (
            <a
              key={asset.name}
              href={asset.browser_download_url}
              style={{
                display: 'inline-block',
                fontSize: 12,
                color: 'var(--ink-soft)',
                marginRight: 16
              }}
            >
              {asset.name} ({formatBytes(asset.size)})
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
