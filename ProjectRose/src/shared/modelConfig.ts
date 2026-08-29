// Model/provider vocabulary shared by main and renderer.
//
// There is no global "active provider" — the user picks a provider+model pair
// per Conversation from the chat composer's ModelPicker. Settings keep only
// credentials/config (endpoint URLs and an optional sealed API key) plus
// an internal `lastModel` used as the fallback for background LLM work and as
// the default for new Conversations.

export interface ModelConfig {
  provider: 'ollama' | 'openai-compatible'
  modelName: string
}
