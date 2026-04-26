import { tool } from 'ai'
import type { ToolExecutionOptions } from 'ai'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { streamChat } from './llmClient'
import { saveSubagentSession } from './sessionService'
import type { AgentContext, SubagentCounter } from './agentRunner'
import type { ModelConfig } from '../ipc/settingsHandlers'
import type { ProviderKeys } from './llmClient'
import { IPC } from '../../shared/ipcChannels'

const EXPLORE_SYSTEM_PROMPT =
  'You are a read-only code explorer. Answer questions by reading files, listing directories, and grepping. ' +
  'Never write files, edit files, or run commands. Return a concise, factual summary of your findings.'

const EXPLORE_DISABLED_TOOLS = ['write_file', 'edit_file', 'run_command', 'ask_user']

function decomposeExploreQueries(topic: string): string[] {
  const keywords = topic
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter((w) => w.length > 4)
    .slice(0, 3)

  const queries: string[] = [
    `List the top-level project structure and explore the directories most likely relevant to: ${topic}`,
    `Grep for type names, function names, and identifiers related to: ${topic}. Read the most relevant files and summarise how they work.`,
    ...keywords.map(
      (kw) => `Search all source files for "${kw}" and explain every usage that is relevant to: ${topic}`
    )
  ]
  return queries.slice(0, 5)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSubagentTools(
  ctx: AgentContext,
  model: ModelConfig,
  providerKeys: ProviderKeys,
  counter: SubagentCounter,
  systemPrompt: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any> {
  // Run a subagent and emit per-subagent IPC events so the user can see each one start/finish.
  async function runSubagent(
    agentLabel: string,
    prompt: string,
    subSystemPrompt?: string,
    disabledCoreTools?: string[]
  ): Promise<string> {
    const idx = counter.value++
    const subId = randomUUID()
    const messages = [{ role: 'user' as const, content: prompt }]

    ctx.notify(IPC.AI_TOOL_CALL_START, { id: subId, name: `subagent:${agentLabel}`, params: { prompt } })

    let resultContent = ''
    try {
      const result = await streamChat({
        messages,
        systemPrompt: subSystemPrompt ?? systemPrompt,
        pythonTools: [],
        model,
        providerKeys,
        projectRoot: ctx.rootPath,
        notify: () => {},  // subagents do not stream tokens to renderer
        abortSignal: ctx.abortSignal,
        disabledCoreTools
      })
      resultContent = result.content

      ctx.notify(IPC.AI_TOOL_CALL_END, { id: subId, result: resultContent, error: false })
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      ctx.notify(IPC.AI_TOOL_CALL_END, { id: subId, result: error, error: true })
      throw err
    }

    await saveSubagentSession(ctx.rootPath, ctx.sessionId, idx, {
      id: ctx.sessionId,
      title: prompt.slice(0, 60),
      createdAt: Date.now(),
      updatedAt: Date.now(),
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
      ctx.notify(IPC.AI_TOOL_CALL_START, { id, name: 'create_subagents', params: { agents: input.agents.map((a) => a.agentId) } })

      let resultJson = '{}'
      try {
        const results = await Promise.all(
          input.agents.map(async ({ agentId, prompt }) => {
            const text = await runSubagent(agentId, prompt)
            return [agentId, text] as const
          })
        )
        resultJson = JSON.stringify(Object.fromEntries(results))
        ctx.notify(IPC.AI_TOOL_CALL_END, { id, result: `Completed ${input.agents.length} subagent(s)`, error: false })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        ctx.notify(IPC.AI_TOOL_CALL_END, { id, result: error, error: true })
        return JSON.stringify({ error })
      }

      return resultJson
    }
  })

  const explore = tool({
    description:
      'Explore the codebase to answer a question or investigate a topic. ' +
      'Automatically decomposes the topic into 3–5 parallel read-only sub-queries, ' +
      'runs them concurrently, then returns a combined report of all findings. ' +
      'Sub-explorers cannot write files or run commands.',
    inputSchema: z.object({
      topic: z.string().describe('The question or topic to explore, e.g. "How does session persistence work?"')
    }),
    execute: async (input, options: ToolExecutionOptions) => {
      const id = options.toolCallId
      const subQueries = decomposeExploreQueries(input.topic)

      ctx.notify(IPC.AI_TOOL_CALL_START, { id, name: 'explore', params: { topic: input.topic, queries: subQueries.length } })

      let combined = ''
      try {
        const results = await Promise.all(
          subQueries.map(async (query, i) => {
            const text = await runSubagent(`explorer-${i + 1}`, query, EXPLORE_SYSTEM_PROMPT, EXPLORE_DISABLED_TOOLS)
            return `=== Explorer ${i + 1} (query: "${query.slice(0, 80)}") ===\n${text}`
          })
        )
        combined = results.join('\n\n')
        ctx.notify(IPC.AI_TOOL_CALL_END, { id, result: `${subQueries.length} explorers completed`, error: false })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        ctx.notify(IPC.AI_TOOL_CALL_END, { id, result: error, error: true })
        return error
      }

      return combined
    }
  })

  return { create_subagents, explore }
}
