#!/usr/bin/env node
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { readdirSync, readFileSync, existsSync, mkdirSync, statSync, rmSync } from 'fs'
import { spawnSync } from 'child_process'
import { createRequire } from 'module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const extensionsDir = join(rootDir, 'RoseExtensions')
const outputDir = join(rootDir, 'dist', 'extensions')

mkdirSync(outputDir, { recursive: true })

// Load esbuild from root node_modules
const _require = createRequire(import.meta.url)
const esbuild = _require(join(rootDir, 'node_modules', 'esbuild'))

// esbuild plugin: handles .module.css imports by injecting scoped styles at runtime
// and exporting the class-name mapping as the module value.
const cssModulesPlugin = {
  name: 'css-modules',
  setup(build) {
    build.onLoad({ filter: /\.module\.css$/ }, (args) => {
      const css = readFileSync(args.path, 'utf8')

      // Simple numeric hash for a short stable scope suffix
      let h = 0
      for (const ch of args.path) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0
      const scope = Math.abs(h).toString(36).slice(0, 6)

      // Collect all locally-defined class names (the leading dot, not pseudo-classes)
      const classNames = new Set()
      for (const m of css.matchAll(/\.-?[_a-zA-Z][_a-zA-Z0-9-]*/g)) {
        classNames.add(m[0].slice(1))
      }

      // Build scoped name mapping
      const mapping = {}
      for (const cls of classNames) mapping[cls] = `${cls}_${scope}`

      // Rewrite class names in the CSS
      const scoped = css.replace(/(\.-?[_a-zA-Z][_a-zA-Z0-9-]*)/g, (m) => {
        const cls = m.slice(1)
        return mapping[cls] ? `.${mapping[cls]}` : m
      })

      return {
        contents: `
const __s = document.createElement('style');
__s.textContent = ${JSON.stringify(scoped)};
if (typeof document !== 'undefined') document.head.appendChild(__s);
export default ${JSON.stringify(mapping)};
`,
        loader: 'js',
      }
    })

    // Plain .css: inject as side-effect, no exports
    build.onLoad({ filter: /\.css$/ }, (args) => {
      const css = readFileSync(args.path, 'utf8')
      return {
        contents: `
const __s = document.createElement('style');
__s.textContent = ${JSON.stringify(css)};
if (typeof document !== 'undefined') document.head.appendChild(__s);
`,
        loader: 'js',
      }
    })
  },
}

// esbuild plugin: resolves @main/* imports to ProjectRose/src/main/*
const mainSrcDir = join(rootDir, 'ProjectRose', 'src', 'main')
const mainAliasPlugin = {
  name: 'main-alias',
  setup(build) {
    build.onResolve({ filter: /^@main\// }, (args) => {
      const rel = args.path.slice('@main/'.length)
      const base = join(mainSrcDir, rel)
      for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
        const candidate = base + ext
        if (existsSync(candidate)) return { path: candidate }
      }
      // Fall back without extension — esbuild will emit the error
      return { path: base }
    })
  }
}

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

  // ── 1. Compile renderer.ts → renderer.js ────────────────────────────────
  const rendererEntry = join(extPath, 'renderer.ts')
  const rendererOut = join(extPath, 'renderer.js')
  let rendererCompiled = false

  if (existsSync(rendererEntry)) {
    try {
      await esbuild.build({
        entryPoints: [rendererEntry],
        bundle: true,
        format: 'cjs',
        platform: 'browser',
        outfile: rendererOut,
        external: ['react', 'react/jsx-runtime', 'react-dom', '@renderer/*'],
        plugins: [cssModulesPlugin],
        jsx: 'automatic',
        loader: { '.json': 'json' },
        logLevel: 'silent',
      })
      rendererCompiled = true
      process.stdout.write(' renderer')
    } catch (err) {
      process.stdout.write(` (renderer FAILED: ${err.message})`)
    }
  }

  // ── 1b. Compile main.ts → main.js ────────────────────────────────────────
  const mainEntry = join(extPath, 'main.ts')
  const mainOut = join(extPath, 'main.js')
  let mainCompiled = false

  if (existsSync(mainEntry)) {
    try {
      await esbuild.build({
        entryPoints: [mainEntry],
        bundle: true,
        format: 'cjs',
        platform: 'node',
        outfile: mainOut,
        external: ['electron'],
        plugins: [mainAliasPlugin],
        loader: { '.json': 'json' },
        resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        logLevel: 'silent',
      })
      mainCompiled = true
      process.stdout.write(' main')
    } catch (err) {
      process.stdout.write(` (main FAILED: ${err.message})`)
    }
  }

  // ── 2. Create ZIP ─────────────────────────────────────────────────────────
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

  // ── 3. Clean up compiled files from source tree ──────────────────────────
  if (rendererCompiled && existsSync(rendererOut)) {
    try { rmSync(rendererOut) } catch { /* ignore */ }
  }
  if (mainCompiled && existsSync(mainOut)) {
    try { rmSync(mainOut) } catch { /* ignore */ }
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
