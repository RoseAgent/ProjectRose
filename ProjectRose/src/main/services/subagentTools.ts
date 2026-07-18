import { tool } from 'ai'
import type { ToolExecutionOptions } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { streamChat } from './llmClient'
import { saveSubagentConversation } from './conversationStore'
import type { AgentContext, SubagentCounter } from './agentRunner'
import type { ModelConfig } from './settingsService'
import { IPC } from '../../shared/ipcChannels'

const EXPLORE_SYSTEM_PROMPT =
  'You are a read-only code explorer. Answer questions by reading files, listing directories, and grepping. ' +
  'Never write files, edit files, or run commands. Return a concise, factual summary of your findings.'

const EXPLORE_DISABLED_TOOLS = [
  'write_file',
  'edit_file',
  'delete_file',
  'move_file',
  'run_command',
  'read_process_output',
  'kill_process',
  'todo_write',
  'ask_user'
]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSubagentTools(
  ctx: AgentContext,
  model: ModelConfig,
  ollamaBaseUrl: string,
  counter: SubagentCounter,
  systemPrompt: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // Run a subagent and emit per-subagent IPC events so the user can see each one start/finish.
  async function runSubagent(
    agentLabel: string,
    prompt: string,
    subSystemPrompt?: string,
    disabledTools?: string[]
  ): Promise<string> {
    const idx = counter.value++
    const subId = randomUUID()
    const messages = [{ role: 'user' as const, content: prompt }]

    ctx.notify(IPC.AI_TOOL_CALL_START, { sessionId: ctx.sessionId, id: subId, name: `subagent:${agentLabel}`, params: { prompt } })

    let resultContent = ''
    try {
      const result = await streamChat({
        messages,
        systemPrompt: subSystemPrompt ?? systemPrompt,
        model,
        ollamaBaseUrl,
        projectRoot: ctx.rootPath,
        notify: () => {},  // subagents do not stream tokens to renderer
        abortSignal: ctx.abortSignal,
        disabledTools,
        // Subagents must not get the subagent/skill sources themselves, or
        // create_subagents would recurse. Same shape as runAgentOnce.
        include: ['core', 'extension'],
        // Subagents share the parent chat session so extension tools see
        // continuity across the user's turn.
        sessionId: ctx.sessionId
      })
      resultContent = result.content

      ctx.notify(IPC.AI_TOOL_CALL_END, { sessionId: ctx.sessionId, id: subId, result: resultContent, error: false })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      ctx.notify(IPC.AI_TOOL_CALL_END, { sessionId: ctx.sessionId, id: subId, result: error, error: true })
      throw err
    }

    await saveSubagentConversation(ctx.rootPath, ctx.sessionId, idx, {
      id: ctx.sessionId,
      title: prompt.slice(0, 60),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      workspacePath: ctx.rootPath,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: resultContent }
      ]
    })

    return resultContent
  }

  const create_subagents = tool({
    description:
      'Spawn one or more subagents to complete focused tasks concurrently. ' +
      'Each subagent runs the full agentic loop (all tools) and returns its final text response. ' +
      'Pass a single-element array to delegate one task; multiple elements run in parallel. ' +
      'Returns a JSON object mapping each agentId to its result.',
    inputSchema: z.object({
      agents: z
        .array(
          z.object({
            agentId: z.string().describe('A short identifier for this agent, used as the key in the result map'),
            prompt: z.string().describe('Complete task instructions for this agent. Be explicit about what to read, write, or return.')
          })
        )
        .describe('Agents to run. Multiple agents run in parallel.')
    }),
    execute: async (input, options: ToolExecutionOptions) => {
      const id = options.toolCallId
      ctx.notify(IPC.AI_TOOL_CALL_START, { sessionId: ctx.sessionId, id, name: 'create_subagents', params: { agents: input.agents.map((a) => a.agentId) } })

      let resultJson = '{}'
      try {
        const results = await Promise.all(
          input.agents.map(async ({ agentId, prompt }) => {
            const text = await runSubagent(agentId, prompt)
            return [agentId, text] as const
          })
        )
        resultJson = JSON.stringify(Object.fromEntries(results))
        ctx.notify(IPC.AI_TOOL_CALL_END, { sessionId: ctx.sessionId, id, result: `Completed ${input.agents.length} subagent(s)`, error: false })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        ctx.notify(IPC.AI_TOOL_CALL_END, { sessionId: ctx.sessionId, id, result: error, error: true })
        return JSON.stringify({ error })
      }

      return resultJson
    }
  })

  const explore = tool({
    description:
      'Explore the codebase with read-only workers to answer a question or investigate a topic. ' +
      'You write the queries: pass one focused query for a simple question, or up to 5 for a broad ' +
      'investigation — they run concurrently and the combined findings are returned. Make each query ' +
      'self-contained and explicit about what to look for. Explorers cannot write files or run commands.',
    inputSchema: z.object({
      queries: z
        .array(z.string())
        .min(1)
        .max(5)
        .describe('1–5 self-contained exploration queries, e.g. "Find where sessions are persisted and summarise the save/load flow"')
    }),
    execute: async (input, options: ToolExecutionOptions) => {
      const id = options.toolCallId
      const subQueries = input.queries

      ctx.notify(IPC.AI_TOOL_CALL_START, { sessionId: ctx.sessionId, id, name: 'explore', params: { queries: subQueries.length } })

      let combined = ''
      try {
        const results = await Promise.all(
          subQueries.map(async (query, i) => {
            const text = await runSubagent(`explorer-${i + 1}`, query, EXPLORE_SYSTEM_PROMPT, EXPLORE_DISABLED_TOOLS)
            return `=== Explorer ${i + 1} (query: "${query.slice(0, 80)}") ===\n${text}`
          })
        )
        combined = results.join('\n\n')
        ctx.notify(IPC.AI_TOOL_CALL_END, { sessionId: ctx.sessionId, id, result: `${subQueries.length} explorers completed`, error: false })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        ctx.notify(IPC.AI_TOOL_CALL_END, { sessionId: ctx.sessionId, id, result: error, error: true })
        return error
      }

      return combined
    }
  })

  return { create_subagents, explore }
}
