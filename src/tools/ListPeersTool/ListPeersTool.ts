import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { formatUptime, listPeers, peerLabel } from '../../utils/peerRegistry.js'
import { LIST_PEERS_TOOL_NAME } from './constants.js'
import { DESCRIPTION, getPrompt } from './prompt.js'

const inputSchema = lazySchema(() => z.strictObject({}))
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    peers: z.array(
      z.object({
        address: z.string(),
        transport: z.enum(['uds', 'bridge']),
        label: z.string(),
        cwd: z.string().optional(),
        kind: z.string(),
        status: z.string().optional(),
        uptime: z.string(),
      }),
    ),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>

export type Output = z.infer<OutputSchema>

export const ListPeersTool = buildTool({
  name: LIST_PEERS_TOOL_NAME,
  searchHint: 'list other claude sessions to message',
  maxResultSizeChars: 100_000,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return getPrompt()
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  userFacingName() {
    return LIST_PEERS_TOOL_NAME
  },
  shouldDefer: true,
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  renderToolUseMessage() {
    return null
  },
  async call() {
    const now = Date.now()
    const peers = await listPeers()
    return {
      data: {
        peers: peers.map(peer => ({
          address: peer.address,
          transport: peer.transport,
          label: peerLabel(peer),
          cwd: peer.cwd,
          kind: peer.kind,
          status: peer.status,
          uptime: formatUptime(peer.startedAt, now),
        })),
      },
    }
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    const { peers } = content as Output
    if (peers.length === 0) {
      return {
        tool_use_id: toolUseID,
        type: 'tool_result',
        content: 'No other Claude sessions are running.',
      }
    }

    // One line per peer, address first — it's the part that gets copied into
    // SendMessage, and the rest is only there to pick between peers.
    const lines = peers.map(peer => {
      const state = peer.status ? `, ${peer.status}` : ''
      const where = peer.cwd ? ` — ${peer.cwd}` : ''
      return `${peer.address}  ${peer.label} (${peer.kind}${state}, up ${peer.uptime})${where}`
    })

    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: lines.join('\n'),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
