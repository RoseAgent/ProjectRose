import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import { createLogger } from 'vite'
import react from '@vitejs/plugin-react'

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
    plugins: [externalizeDepsPlugin({ include: ['node-pty'] })],
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
        '@main': resolve('src/main'),
        '@ext/rose-discord': resolve('../RoseExtensions/rose-discord'),
        '@ext/rose-email':   resolve('../RoseExtensions/rose-email'),
        '@ext/rose-git':     resolve('../RoseExtensions/rose-git'),
        '@ext/rose-docker':  resolve('../RoseExtensions/rose-docker'),
        '@ext/rose-listen':  resolve('../RoseExtensions/rose-listen')
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
