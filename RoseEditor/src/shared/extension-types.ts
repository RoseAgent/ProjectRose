export interface ExtensionManifest {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon?: string
  navItem?: {
    label: string
    iconName: string
  }
  provides: {
    pageView?: boolean
    projectSettings?: boolean
    globalSettings?: boolean
    agentTools?: boolean
  }
}

export interface InstalledExtension {
  manifest: ExtensionManifest
  installPath: string
  enabled: boolean
}

export interface RegistryExtension {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon?: string
  firstParty: boolean
  downloadUrl: string
  categories: string[]
}

export interface ExtensionRegistry {
  extensions: RegistryExtension[]
}

export interface ExtensionToolParameter {
  type: 'string' | 'number' | 'boolean'
  description: string
  optional?: boolean
}

export interface ExtensionToolDefinition {
  name: string
  description: string
  parameters: Record<string, ExtensionToolParameter>
  execute: (params: Record<string, unknown>) => Promise<string>
}
