import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

export interface RecentProject {
  path: string
  name: string
  lastOpened: number
}

const MAX_RECENT = 20
const filePath = join(app.getPath('userData'), 'recent-projects.json')

function load(): RecentProject[] {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8'))
    }
  } catch {}
  return []
}

function save(projects: RecentProject[]): void {
  writeFileSync(filePath, JSON.stringify(projects, null, 2), 'utf-8')
}

export function getRecentProjects(): RecentProject[] {
  return load()
}

export function addRecentProject(projectPath: string): RecentProject[] {
  const projects = load().filter((p) => p.path !== projectPath)
  const name = projectPath.replace(/\\/g, '/').split('/').pop() || projectPath

  projects.unshift({
    path: projectPath,
    name,
    lastOpened: Date.now()
  })

  const trimmed = projects.slice(0, MAX_RECENT)
  save(trimmed)
  return trimmed
}

export function removeRecentProject(projectPath: string): RecentProject[] {
  const projects = load().filter((p) => p.path !== projectPath)
  save(projects)
  return projects
}
