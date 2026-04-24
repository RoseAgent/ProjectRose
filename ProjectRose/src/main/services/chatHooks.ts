import type { Message } from '../../shared/roseModelTypes'

export type HookPhase = 'chatStart' | 'preToolCall' | 'postToolCall' | 'chatEnd'

export interface CompletedToolCall {
  name: string
  summary: string  // tool name + key arg, e.g. read_file("src/main.ts")
}

export interface HookContext {
  messages: Message[]
  completedToolCalls?: CompletedToolCall[]  // every tool call executed so far this response (postToolCall only)
}

export interface HookResult {
  inject?: Array<{ role: 'user' | 'assistant'; content: string }>
}

export interface ChatHook {
  name: string
  phase: HookPhase
  enabled: boolean
  run: (ctx: HookContext) => HookResult | Promise<HookResult>
}

const registry: ChatHook[] = []

export function registerHook(hook: ChatHook): void {
  registry.push(hook)
}

export async function applyHooks(
  phase: HookPhase,
  ctx: HookContext
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const injections: Array<{ role: 'user' | 'assistant'; content: string }> = []
  for (const hook of registry) {
    if (!hook.enabled || hook.phase !== phase) continue
    const result = await hook.run(ctx)
    if (result.inject) injections.push(...result.inject)
  }
  return injections
}

registerHook({
  name: 'taskDefinition',
  phase: 'chatStart',
  enabled: true,
  run: () => ({
    inject: [{
      role: 'user',
      content: '[HOOK] Before taking any action, state in one sentence what you are going to do. Then execute every step required to fully complete the request — do not pause between steps or ask for confirmation unless absolutely necessary. For all file operations use write_file (create/overwrite), edit_file (targeted changes), and read_file — never use run_command to create or write files.'
    }]
  })
})

registerHook({
  name: 'taskReminder',
  phase: 'postToolCall',
  enabled: true,
  run: (ctx) => {
    const lastUserMsg = [...ctx.messages].reverse().find((m) => m.role === 'user')
    const taskText = lastUserMsg
      ? (lastUserMsg.content.length > 500
          ? `${lastUserMsg.content.slice(0, 500)}…`
          : lastUserMsg.content)
      : '(see conversation above)'

    const calls = ctx.completedToolCalls ?? []

    const EXPLORATORY = new Set(['list_directory', 'grep'])
    const WRITE = new Set(['write_file', 'edit_file'])

    const explorationCalls = calls.filter((c) => EXPLORATORY.has(c.name))
    const readCalls        = calls.filter((c) => c.name === 'read_file')
    const writeCalls       = calls.filter((c) => WRITE.has(c.name))
    const otherCalls       = calls.filter((c) => !EXPLORATORY.has(c.name) && c.name !== 'read_file' && !WRITE.has(c.name))

    const lines: string[] = []
    if (explorationCalls.length > 0) {
      lines.push('Completed exploration — do NOT repeat:')
      explorationCalls.forEach((c) => lines.push(`  • ${c.summary}`))
    }
    if (readCalls.length > 0) {
      lines.push('Files already read — re-read ONLY if you need a fresh file_token to edit:')
      readCalls.forEach((c) => lines.push(`  • ${c.summary}`))
    }
    if (writeCalls.length > 0) {
      lines.push('Edits already written — do NOT redo:')
      writeCalls.forEach((c) => lines.push(`  • ${c.summary}`))
    }
    if (otherCalls.length > 0) {
      lines.push('Other completed calls:')
      otherCalls.forEach((c) => lines.push(`  • ${c.summary}`))
    }

    const callSection = lines.length > 0 ? `\n${lines.join('\n')}\n` : ''

    return {
      inject: [{
        role: 'user',
        content: `[HOOK] Execution checkpoint — you are mid-response, not starting over.\nOriginal user request: "${taskText}"${callSection}\nIdentify the next incomplete step and proceed directly.`
      }]
    }
  }
})
