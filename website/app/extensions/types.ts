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
