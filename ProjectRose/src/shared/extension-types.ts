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
    main?: boolean
    projectSettings?: boolean
    globalSettings?: boolean
    agentTools?: boolean
    tools?: Array<{ name: string; displayName: string; description: string }>
  }
}

export interface InstalledExtension {
  manifest: ExtensionManifest
  installPath: string
  enabled: boolean
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

// Runtime tool entry registered by extension main modules via ctx.registerTools()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface ExtensionToolEntry {
  name: string
  description: string
  schema: Record<string, any>
  execute: (input: Record<string, unknown>, projectRoot: string) => Promise<string>
}
