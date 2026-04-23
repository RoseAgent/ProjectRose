#!/usr/bin/env node
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdirSync, readFileSync, existsSync, mkdirSync, statSync } from 'fs'
import { spawnSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const extensionsDir = join(rootDir, 'RoseExtensions')
const outputDir = join(rootDir, 'dist', 'extensions')

mkdirSync(outputDir, { recursive: true })

let packaged = 0
let failed = 0

for (const name of readdirSync(extensionsDir)) {
  const extPath = join(extensionsDir, name)
  if (!statSync(extPath).isDirectory()) continue

  const manifestPath = join(extPath, 'rose-extension.json')
  if (!existsSync(manifestPath)) continue

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const outputPath = join(outputDir, `${manifest.id}.zip`)

  process.stdout.write(`Packaging ${manifest.id}...`)

  let result
  if (process.platform === 'win32') {
    const psScript = `$items = Get-ChildItem -Path '${extPath}' -Exclude 'node_modules','.git' | ForEach-Object { $_.FullName }; if ($items) { Compress-Archive -Path $items -DestinationPath '${outputPath}' -Force }`
    result = spawnSync('powershell', ['-NoProfile', '-Command', psScript], {
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } else {
    result = spawnSync('zip', ['-r', outputPath, '.', '-x', '*/node_modules/*', '-x', '.git/*'], {
      cwd: extPath,
      stdio: ['ignore', 'pipe', 'pipe']
    })
  }

  if (result.status !== 0) {
    process.stdout.write(' FAILED\n')
    if (result.stderr?.length) console.error(result.stderr.toString())
    failed++
  } else {
    process.stdout.write(` → dist/extensions/${manifest.id}.zip\n`)
    packaged++
  }
}

console.log(`\nPackaged ${packaged} extension(s)${failed ? `, ${failed} failed` : ''}.`)
if (failed) process.exit(1)
