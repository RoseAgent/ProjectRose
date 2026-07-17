import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { createLogger, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const appVersion = JSON.parse(readFileSync(resolve('package.json'), 'utf-8')).version as string

// Load .env / .env.development / .env.development.local from this dir.
// Only keys we explicitly forward below are exposed to the main bundle.
const env = loadEnv(process.env.NODE_ENV ?? 'development', resolve('.'), '')

// Build a process.env replacement map for the main bundle. Skip empty values so
// the `?? '<placeholder>'` fallbacks in src/main/lib/webConfig.ts still work in
// production builds where no .env file is present.
const mainProcessEnvDefines: Record<string, string> = {}
if (env.WEB_BASE_URL) {
  mainProcessEnvDefines['process.env.WEB_BASE_URL'] = JSON.stringify(env.WEB_BASE_URL)
}

// Optional bundled Google OAuth pair (ADR 0009 amendment 2026-05-24). CI release
// builds inject these from GitHub Actions secrets so the app works without the
// user creating their own Google Cloud project; dev/local builds leave them empty
// and fall back to the bring-your-own credential path. Skipping empty values means
// `process.env.GOOGLE_OAUTH_*` reads as undefined at runtime in unbundled builds.
if (env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET) {
  mainProcessEnvDefines['process.env.GOOGLE_OAUTH_CLIENT_ID'] = JSON.stringify(env.GOOGLE_OAUTH_CLIENT_ID)
  mainProcessEnvDefines['process.env.GOOGLE_OAUTH_CLIENT_SECRET'] = JSON.stringify(env.GOOGLE_OAUTH_CLIENT_SECRET)
}

// Suppress the Monaco marked.js missing-sourcemap warning.
// The warning fires on the server logger — intercepting here is the guaranteed fix.
const rendererLogger = createLogger()
const _warn = rendererLogger.warn.bind(rendererLogger)
rendererLogger.warn = (msg, opts) => {
  if (msg.includes('marked.umd.js.map')) return
  _warn(msg, opts)
}

export default defineConfig({
  main: {
    // @ai-sdk/openai-compatible ships ESM-only (no CJS build), so it can't be
    // externalized — the CJS main bundle would require() it and crash at load.
    // Excluding it here makes Rollup inline it into the bundle instead.
    plugins: [externalizeDepsPlugin({ include: ['node-pty'], exclude: ['@ai-sdk/openai-compatible'] })],
    define: mainProcessEnvDefines,
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          speechWorker: resolve('src/main/services/speech/speechWorker.ts')
        },
        external: ['node-pty']
      }
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    customLogger: rendererLogger,
    define: {
      __APP_VERSION__: JSON.stringify(appVersion)
    },
    plugins: [
      react(),
      {
        // Belt-and-suspenders: strip the sourceMappingURL before Vite reads it.
        // Vite appends ?v=<hash> to IDs, so we must split on '?' before matching.
        name: 'strip-monaco-marked-sourcemap',
        load(id) {
          const file = id.split('?')[0]
          if (file.includes('monaco-editor') && file.endsWith('marked.js')) {
            const code = readFileSync(file, 'utf-8')
            return { code: code.replace(/\/\/# sourceMappingURL=\S+/g, ''), map: null }
          }
        }
      }
    ],
    optimizeDeps: {
      exclude: ['monaco-editor']
    },
    server: {
      sourcemapIgnoreList: (sourcePath) => sourcePath.includes('node_modules')
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        'sonner':                 resolve('../node_modules/sonner'),
        'clsx':                   resolve('../node_modules/clsx'),
        'monaco-editor':          resolve('../node_modules/monaco-editor'),
        '@xterm/xterm':           resolve('../node_modules/@xterm/xterm'),
        '@xterm/addon-fit':       resolve('../node_modules/@xterm/addon-fit'),
        '@xterm/addon-web-links': resolve('../node_modules/@xterm/addon-web-links')
      }
    },
    css: {
      modules: {
        localsConvention: 'camelCase'
      }
    }
  }
})
