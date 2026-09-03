import { homedir } from 'os'
import type * as React from 'react'
import { Box, Text } from '../../ink.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import {
  formatUptime,
  type Peer,
  listPeers,
  peerLabel,
} from '../../utils/peerRegistry.js'
import { renderToAnsiString } from '../../utils/staticRender.js'

const HELP = `Usage: /peers [all]

  /peers       Other Claude sessions you can message
  /peers all   Include this session

Sessions register themselves in ~/.claude/sessions while they run, so the list
is whatever is alive right now. Copy an address into SendMessage's "to" to
reach one: uds: peers are on this machine, bridge: peers go via Remote Control.`

function column(values: string[]): number {
  return values.reduce((width, value) => Math.max(width, value.length), 0)
}

/** Which checkout a session is in is the thing that tells two of them apart,
 *  so it earns its place on the row — shortened, since it is usually long. */
function shortenHome(cwd: string | undefined): string {
  if (!cwd) return ''
  const home = homedir()
  return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd
}

export function PeerList({
  peers,
  now,
}: {
  peers: Peer[]
  now: number
}): React.ReactNode {
  const labels = peers.map(peerLabel)
  const labelWidth = column(labels)
  const addressWidth = column(peers.map(p => p.address))
  return (
    <Box flexDirection="column" paddingX={1}>
      <Text bold>
        {peers.length === 1 ? '1 peer' : `${peers.length} peers`}
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {peers.map((peer, i) => {
          const state = peer.status ? ` · ${peer.status}` : ''
          return (
            <Text key={peer.address}>
              <Text color={peer.isSelf ? 'inactive' : 'success'}>
                {labels[i]!.padEnd(labelWidth)}
              </Text>
              <Text dimColor>{`  ${peer.address.padEnd(addressWidth)}`}</Text>
              <Text dimColor>
                {`  ${peer.kind}${state} · up ${formatUptime(peer.startedAt, now)}`}
              </Text>
              {peer.cwd ? (
                <Text dimColor>{` · ${shortenHome(peer.cwd)}`}</Text>
              ) : null}
              {peer.isSelf ? <Text dimColor> · this session</Text> : null}
            </Text>
          )
        })}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Message one with SendMessage, passing its address as `to`.
        </Text>
      </Box>
    </Box>
  )
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: unknown,
  args = '',
): Promise<React.ReactNode> {
  const arg = args.trim().toLowerCase()

  if (arg === 'help' || arg === '-h' || arg === '--help') {
    onDone(HELP, { display: 'system' })
    return null
  }
  if (arg && arg !== 'all') {
    onDone(`Unknown option "${arg}".\n\n${HELP}`, { display: 'system' })
    return null
  }

  const includeSelf = arg === 'all'
  const peers = await listPeers({ includeSelf })
  if (peers.length === 0) {
    onDone(
      includeSelf
        ? 'No addressable sessions — this one included. Cross-session messaging needs a messaging socket (--messaging-socket-path) or a Remote Control connection.'
        : 'No other Claude sessions are running. /peers all includes this one.',
      { display: 'system' },
    )
    return null
  }

  const output = await renderToAnsiString(
    <PeerList peers={peers} now={Date.now()} />,
    process.stdout.columns || 80,
  )
  onDone(output)
  return null
}
