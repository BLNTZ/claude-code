import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'

const USAGE =
  '/fork <directive> — hand work to a background fork that inherits this conversation.'

export function buildForkPrompt(args: string): string {
  const directive = args.trim()
  if (!directive) {
    return `The user ran /fork with no directive. Reply with this usage line and nothing else:

${USAGE}`
  }

  return `The user ran /fork. Their directive:

<directive>
${directive}
</directive>

Launch it as a fork: call ${AGENT_TOOL_NAME} with no \`subagent_type\`, the directive as the prompt, and a short lowercase \`name\` so they can see it in the teams panel. Don't set \`model\` — a fork shares this conversation's prompt cache and a different model can't.

The fork inherits everything above, so pass the directive through rather than restating background. Add only what the fork can't infer: the scope boundary — what's in, what's out, and what a sibling fork is covering.

If the directive splits into genuinely independent pieces, launch one fork per piece in a single message. If it doesn't, one fork.

Then stop. Say in one line what you launched. Do not also do the work yourself, do not read the fork's output file, and do not predict or summarize what it will find — the result arrives as its own notification later.`
}

export { USAGE }
