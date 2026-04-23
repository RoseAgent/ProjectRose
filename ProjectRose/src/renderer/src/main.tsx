import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/400-italic.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/700.css'
import { StrictMode } from 'react'
import * as React from 'react'
import * as ReactJSXRuntime from 'react/jsx-runtime'
import { createRoot } from 'react-dom/client'
import * as useDiscordStore from './stores/useDiscordStore'
import * as useDockerStore from './stores/useDockerStore'
import * as useEmailStore from './stores/useEmailStore'
import * as useFileStore from './stores/useFileStore'
import * as useGitStore from './stores/useGitStore'
import * as useIndexingStore from './stores/useIndexingStore'
import * as useProjectStore from './stores/useProjectStore'
import * as useServiceStore from './stores/useServiceStore'
import * as useSettingsStore from './stores/useSettingsStore'
import * as useTerminalStore from './stores/useTerminalStore'
import * as useThemeStore from './stores/useThemeStore'
import * as useViewStore from './stores/useViewStore'
import * as useChatStore from './stores/useChatStore'
import App from './App'
import './themes/global.css'
import './themes/variables.css'

// Expose shared host deps so dynamically-loaded third-party extensions can
// receive the same React instance and stores rather than bundling their own.
window.__rose__ = {
  'react': React,
  'react/jsx-runtime': ReactJSXRuntime,
  '@renderer/stores/useDiscordStore': useDiscordStore,
  '@renderer/stores/useDockerStore': useDockerStore,
  '@renderer/stores/useEmailStore': useEmailStore,
  '@renderer/stores/useFileStore': useFileStore,
  '@renderer/stores/useGitStore': useGitStore,
  '@renderer/stores/useIndexingStore': useIndexingStore,
  '@renderer/stores/useProjectStore': useProjectStore,
  '@renderer/stores/useServiceStore': useServiceStore,
  '@renderer/stores/useSettingsStore': useSettingsStore,
  '@renderer/stores/useTerminalStore': useTerminalStore,
  '@renderer/stores/useThemeStore': useThemeStore,
  '@renderer/stores/useViewStore': useViewStore,
  '@renderer/stores/useChatStore': useChatStore,
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
