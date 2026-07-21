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
      // The most recent provider+model pair picked in the chat composer.
      // There is no global "active provider" — each Conversation carries its
      // own pick; this is the fallback for background work.
      lastModel: {
        provider: 'ollama' | 'projectrose' | 'kimi' | 'bedrock'
        modelName: string
      } | null
      ollamaBaseUrl: string
      kimiAuthMethod: 'oauth' | 'apikey'
      bedrockRegion: string
    }
    search: {
      provider: 'brave' | 'tavily' | 'browserbase' | null
    }
    google: {
      credentialsConfigured: boolean
      credentialsBundled: boolean
      signedInEmail: string | null
    }
    contacts: {
      googleSync: {
        accountEmail: string | null
        lastPullAt: number | null
        lastPushAt: number | null
        syncKinds: Record<string, boolean>
      }
    }
    calendar: {
      googleSync: {
        lastPullAt: number | null
        lastPushAt: number | null
        syncCalendars: Record<string, boolean>
      }
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
    bedrock: ConnectionResult
    googleAuth: GoogleAuthConnection
    googleCalendar: ConnectionResult
    imap: ConnectionResult
    smtp: ConnectionResult
    search: ConnectionResult
  }
}
