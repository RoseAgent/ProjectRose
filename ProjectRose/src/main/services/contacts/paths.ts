import { join } from 'path'
import { agentContactDir } from '../../lib/agentHome'

// Contact files live at ~/.rose/contact/{entity}.md — agent-global, like the
// rest of ~/.rose/ (see ADR 0019 for the move out of the retired
// ~/.rose/memory/ tree).

export function contactPath(entity: string): string {
  return join(agentContactDir(), `${entity}.md`)
}

// Allow [a-z0-9_.-] only (case-insensitive). Used to guard contact entity
// names since they round-trip through user-supplied content.
export function safeEntityName(entity: string): string {
  return entity.trim().replace(/[^A-Za-z0-9_. -]+/g, '').replace(/\s+/g, ' ').slice(0, 100)
}
