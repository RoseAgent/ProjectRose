// Shape of the snapshot returned by the `read_settings_snapshot` agent tool.
// Two top-level sections:
//   - `configuration` mirrors what the user has set up, with every credential
//     stripped out. The OAuth client_id is the only true secret stored in
//     ~/.rose/settings.json; everything else (passwords, OAuth client_secret,
//     refresh tokens, session tokens) lives encrypted in userData/*.bin and
//     was never in settings.json to begin with.
//   - `connections` carries one entry per provider with a live test result.
//     The agent sees `status: 'ok' | 'not-configured' | 'failed: <reason>'`
//     for each — never the underlying credential.

export type ConnectionStatus = 'ok' | 'not-configured' | string  // 'failed: <reason>'

export interface ConnectionResult {
  status: ConnectionStatus
  detail?: string
}

export interface ProjectRoseConnection extends ConnectionResult {
  loggedInEmail?: string
}

export interface OllamaConnection extends ConnectionResult {
  modelsReachable?: number
}

export interface GoogleAuthConnection extends ConnectionResult {
  signedInEmail?: string
}

export interface SettingsSnapshot {
  configuration: {
    identity: {
      userName: string
      agentName: string
      lastMainView: 'bloom' | 'editor'
      agentStartsExpanded: boolean
    }
    speech: {
      micDeviceId: string
      whisperModel: string
      activeListeningSetupComplete: boolean
      activeListeningDraftSeconds: number
    }
    tts: {
      enabled: boolean
      voice: string
      speed: number
      roseSpeechSpeakerId: number | null
    }
    provider: {
      hostMode: 'projectrose' | 'kimi' | 'self'
      ollamaBaseUrl: string
      ollamaModelName: string
      kimiModelName: string
    }
    google: {
      credentialsConfigured: boolean
      credentialsBundled: boolean
      signedInEmail: string | null
    }
    memory: {
      diary: { enabled: boolean; time: string; lastRunAt: number | null }
      contactsUpdater: { enabled: boolean; lastRunAt: number | null }
      googleContactsSync: {
        accountEmail: string | null
        lastPullAt: number | null
        lastPushAt: number | null
        syncKinds: Record<string, boolean>
      }
      googleCalendarSync: {
        lastPullAt: number | null
        lastPushAt: number | null
        syncCalendars: Record<string, boolean>
      } | null
    }
    email: {
      transport: 'imap' | 'google' | null
      accountAddress: string | null
      accountDisplayName: string | null
      imap: { host: string; port: number; secure: boolean; username: string } | null
      smtp: { host: string; port: number; secure: boolean; username: string } | null
      lastSyncAt: number | null
    }
    workspace: {
      disabledTools: string[]
      disabledPrompts: string[]
    }
  }
  connections: {
    projectRose: ProjectRoseConnection
    ollama: OllamaConnection
    kimi: ConnectionResult
    googleAuth: GoogleAuthConnection
    googleCalendar: ConnectionResult
    imap: ConnectionResult
    smtp: ConnectionResult
  }
}
