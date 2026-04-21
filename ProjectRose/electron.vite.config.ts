import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ include: ['node-pty'] })],
    build: {
      rollupOptions: {
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
    plugins: [react()],
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
        '@ext/rose-discord': resolve('../RoseExtensions/rose-discord'),
        '@ext/rose-email':   resolve('../RoseExtensions/rose-email'),
        '@ext/rose-git':     resolve('../RoseExtensions/rose-git'),
        '@ext/rose-docker':  resolve('../RoseExtensions/rose-docker'),
        '@ext/rose-listen':  resolve('../RoseExtensions/rose-listen'),
        // Redirect bare imports from extension files to RoseEditor's node_modules
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
