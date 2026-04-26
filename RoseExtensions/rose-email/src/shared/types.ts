export interface SpamRule {
  id: string
  type: 'sender' | 'domain' | 'subject'
  value: string
  enabled: boolean
}

export interface InjectionPattern {
  id: string
  pattern: string
  isRegex: boolean
  enabled: boolean
  builtin: boolean
}

export interface EmailFilters {
  spamRules: SpamRule[]
  injectionPatterns: InjectionPattern[]
  customFolders: { id: string; name: string }[]
}
