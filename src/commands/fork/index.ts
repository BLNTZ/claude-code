import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.js'
import type { Command } from '../../commands.js'
import { isForkSubagentEnabled } from '../../tools/AgentTool/forkSubagent.js'
import { buildForkPrompt } from './prompt.js'

/**
 * `/fork <directive>` — the user-facing entry to the fork path documented in
 * tools/AgentTool/forkSubagent.ts.
 *
 * A prompt command rather than a local one on purpose: forking is spawned by
 * the Agent tool, which builds the child's context from the parent's assistant
 * message (buildForkedMessages needs its tool_use blocks for a cache-identical
 * prefix). A command that spawned the child itself would have no such message
 * and the fork would start with no inherited context at all — the one thing
 * forking is for.
 */
const fork = {
  type: 'prompt',
  name: 'fork',
  description: 'Hand work to a background fork that inherits this conversation',
  argumentHint: '<directive>',
  progressMessage: 'forking',
  contentLength: 0,
  source: 'builtin',
  // Narrower than the FORK_SUBAGENT gate commands.ts already applies:
  // forking is off in coordinator mode (which owns delegation) and in
  // non-interactive sessions (nobody to notify when the fork lands).
  isEnabled: () => isForkSubagentEnabled(),
  async getPromptForCommand(args: string): Promise<ContentBlockParam[]> {
    return [{ type: 'text', text: buildForkPrompt(args) }]
  },
} satisfies Command

export default fork
