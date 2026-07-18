// Model/provider vocabulary shared by main and renderer.
//
// There is no global "active provider" — the user picks a provider+model pair
// per Conversation from the chat composer's ModelPicker. Settings keep only
// credentials/config (Ollama base URL, Kimi auth method, sealed secrets) plus
// an internal `lastModel` used as the fallback for background LLM work and as
// the default for new Conversations.

export interface ModelConfig {
  provider: 'ollama' | 'projectrose' | 'kimi'
  modelName: string
}

export const PROJECTROSE_MODEL: ModelConfig = {
  provider: 'projectrose',
  modelName: 'managed'
}

export const DEFAULT_KIMI_MODEL = 'kimi-for-coding'
export const DEFAULT_KIMI_PLATFORM_MODEL = 'kimi-k2-thinking'

// Kimi Code models (OAuth / Coding API). Which ones a given account can
// actually use depends on the kimi.com membership tier — the API rejects
// models above the plan, so we list the known set and let the server judge.
export const KIMI_MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'kimi-for-coding',           label: 'Kimi for Coding — default'          },
  { id: 'kimi-for-coding-highspeed', label: 'Kimi for Coding — high speed'       },
  { id: 'kimi-k2-thinking',          label: 'Kimi K2 Thinking — deep reasoning'  },
  { id: 'k3',                        label: 'K3'                                  },
  { id: 'k3[1m]',                    label: 'K3 — 1M context'                     }
]

// Moonshot open-platform models (API-key mode). Different id namespace from
// the Coding API aliases above — platform keys can't call 'kimi-for-coding'.
export const KIMI_PLATFORM_MODEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: 'kimi-k2-thinking',       label: 'Kimi K2 Thinking — deep reasoning'  },
  { id: 'kimi-k2-thinking-turbo', label: 'Kimi K2 Thinking — turbo'           },
  { id: 'kimi-k2-0905-preview',   label: 'Kimi K2 — instruct'                 },
  { id: 'kimi-latest',            label: 'Kimi Latest — auto-updating'        }
]

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
