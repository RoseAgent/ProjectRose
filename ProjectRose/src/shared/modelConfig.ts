// Model/provider vocabulary shared by main and renderer.
//
// There is no global "active provider" — the user picks a provider+model pair
// per Conversation from the chat composer's ModelPicker. Settings keep only
// credentials/config (Ollama base URL, Kimi auth method, sealed secrets) plus
// an internal `lastModel` used as the fallback for background LLM work and as
// the default for new Conversations.

export interface ModelConfig {
  provider: 'ollama' | 'projectrose' | 'kimi' | 'bedrock'
  modelName: string
}

export const PROJECTROSE_MODEL: ModelConfig = {
  provider: 'projectrose',
  modelName: 'managed'
}

// Fallback model ids used only when a Conversation has no explicit pick yet
// (e.g. background LLM work before the user opens the picker). The picker's
// real option lists are fetched live from each provider's list-models
// endpoint — see useProviderStore.refreshKimiModels — never hardcoded here.
export const DEFAULT_KIMI_MODEL = 'kimi-for-coding'
export const DEFAULT_KIMI_PLATFORM_MODEL = 'kimi-k3'

// CLI resume model choices for external sessions. `flag` is the value passed
// to the CLI's --model param; null means "omit the flag" (CLI default).
export const CLAUDE_MODEL_ALIASES: Array<{ flag: string | null; label: string }> = [
  { flag: null,     label: 'Default' },
  { flag: 'opus',   label: 'Opus'    },
  { flag: 'sonnet', label: 'Sonnet'  },
  { flag: 'haiku',  label: 'Haiku'   }
]

export const CODEX_MODEL_ALIASES: Array<{ flag: string | null; label: string }> = [
  { flag: null,          label: 'Default'     },
  { flag: 'gpt-5-codex', label: 'GPT-5 Codex' },
  { flag: 'gpt-5',       label: 'GPT-5'       }
]
