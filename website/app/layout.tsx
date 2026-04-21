import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ProjectRose — Local-first AI IDE',
  description: 'A local-first, privacy-preserving IDE with AI-powered coding assistance and an extensible app store.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header style={{
          borderBottom: '1px solid var(--line)',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <a href="/" style={{
            fontFamily: 'var(--mono)',
            fontSize: 18,
            fontWeight: 500,
            color: 'var(--ink)',
            letterSpacing: -0.3
          }}>
            Project<span style={{ color: 'var(--sepia)', fontStyle: 'italic' }}>Rose</span>
          </a>
          <nav style={{ display: 'flex', gap: 24, fontSize: 12, letterSpacing: 1.2 }}>
            <a href="/download">DOWNLOAD</a>
            <a href="/extensions">EXTENSIONS</a>
            <a href="/docs">DOCS</a>
            <a href="https://github.com/ghalrym/ProjectRose" target="_blank" rel="noopener noreferrer">GITHUB</a>
          </nav>
        </header>
        {children}
        <footer style={{
          marginTop: 96,
          borderTop: '1px solid var(--line)',
          padding: '32px',
          fontSize: 11,
          color: 'var(--ink-soft)',
          letterSpacing: 1.2,
          textAlign: 'center'
        }}>
          PROJECTROSE · LOCAL-FIRST · OPEN SOURCE
        </footer>
      </body>
    </html>
  )
}
