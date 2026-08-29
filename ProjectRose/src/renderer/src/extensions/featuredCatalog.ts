export interface CatalogEntry {
  id: string
  name: string
  description: string
  author: string
  repoUrl: string
}

export const FEATURED_CATALOG: CatalogEntry[] = [
  {
    id: 'rose-bond',
    name: 'Bond',
    description: 'Toggle Bond Bridge smart-home devices on/off. Multi-bridge, IR/RF learn, scenes, rooms, AI tool calls.',
    author: 'ProjectRose',
    repoUrl: 'https://github.com/RoseAgent/projectrose-bond.git'
  },
  {
    id: 'rose-qwen-director',
    name: 'Qwen Director',
    description: 'Tracks checklists in agent thinking and reminds the agent to finish all tasks before responding to the user.',
    author: 'ProjectRose',
    repoUrl: 'https://github.com/RoseAgent/projectrose-qwen-director.git'
  },
  {
    id: 'rose-wordpress',
    name: 'WordPress',
    description: 'Manage one or more self-hosted WordPress sites via Application Passwords. Posts, pages, custom post types, media, comments, users, taxonomies, plugins, themes, and site settings — for both the user and the AI agent.',
    author: 'ProjectRose',
    repoUrl: 'https://github.com/RoseAgent/projectrose-wordpress.git'
  },
  {
    id: 'rose-concretecms',
    name: 'Concrete CMS',
    description: 'Manage one or more self-hosted Concrete CMS v9 sites via OAuth API integrations. Pages, files, users, groups, topics, and attributes — for both the user and the AI agent.',
    author: 'ProjectRose',
    repoUrl: 'https://github.com/RoseAgent/projectrose-concretecms.git'
  }
]
