import { readdir, readFile, unlink } from 'fs/promises'
import { join } from 'path'
import type { SessionKind, SessionStatus } from './concurrentSessions.js'
import { getSessionsDir } from './concurrentSessions.js'
import { logForDebugging } from './debug.js'
import { errorMessage, isFsInaccessible } from './errors.js'
import { isProcessRunning } from './genericProcessUtils.js'
import { getPlatform } from './platform.js'
import { jsonParse } from './slowOperations.js'

/**
 * Peer discovery over the session registry that concurrentSessions.ts writes
 * (`~/.claude/sessions/<pid>.json`). Every top-level session registers itself
 * there on startup and removes the file on exit, so the directory is the
 * closest thing to a live roster of Claude sessions on this machine.
 *
 * Address parsing lives in peerAddress.ts so SendMessageTool can import it
 * without dragging fs in at tool-enumeration time; this module is the other
 * half — the part that actually touches disk.
 */

/** A registry record as written by registerSession(). Every field beyond pid
 *  is optional: which ones get written depends on the feature gates that were
 *  live in the session that wrote it. */
type SessionRecord = {
  pid?: unknown
  sessionId?: unknown
  cwd?: unknown
  startedAt?: unknown
  kind?: unknown
  entrypoint?: unknown
  messagingSocketPath?: unknown
  bridgeSessionId?: unknown
  name?: unknown
  status?: unknown
  updatedAt?: unknown
}

export type Peer = {
  /** Address to hand to SendMessage — `uds:<socket>` or `bridge:<session-id>`. */
  address: string
  transport: 'uds' | 'bridge'
  pid: number
  sessionId?: string
  /** Session name from `--name` / updateSessionName, when one was set. */
  name?: string
  cwd?: string
  kind: SessionKind
  status?: SessionStatus
  startedAt?: number
  /** True for the record belonging to this process. */
  isSelf: boolean
}

const KINDS: readonly SessionKind[] = [
  'interactive',
  'bg',
  'daemon',
  'daemon-worker',
]
const STATUSES: readonly SessionStatus[] = ['busy', 'idle', 'waiting']

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * A record becomes a peer only if it is addressable. Local UDS wins over the
 * bridge for a session reachable both ways — same machine, no round trip —
 * which is what updateSessionBridgeId's dedup note asks for.
 */
export function toPeer(
  record: SessionRecord,
  pid: number,
  selfPid: number,
): Peer | undefined {
  const socket = str(record.messagingSocketPath)
  const bridgeSessionId = str(record.bridgeSessionId)
  const transport: 'uds' | 'bridge' | undefined = socket
    ? 'uds'
    : bridgeSessionId
      ? 'bridge'
      : undefined
  if (!transport) return undefined

  const kind = record.kind
  return {
    address: socket ? `uds:${socket}` : `bridge:${bridgeSessionId}`,
    transport,
    pid,
    sessionId: str(record.sessionId),
    name: str(record.name),
    cwd: str(record.cwd),
    kind: KINDS.includes(kind as SessionKind)
      ? (kind as SessionKind)
      : 'interactive',
    status: STATUSES.includes(record.status as SessionStatus)
      ? (record.status as SessionStatus)
      : undefined,
    startedAt: num(record.startedAt),
    isSelf: pid === selfPid,
  }
}

/** Same filename guard concurrentSessions.ts uses — parseInt would happily
 *  read `2026-03-14_notes.md` as PID 2026 and sweep a user's file. */
function pidFromFilename(file: string): number | undefined {
  if (!/^\d+\.json$/.test(file)) return undefined
  return parseInt(file.slice(0, -5), 10)
}

/**
 * Drop a session that is reachable twice. Records are keyed by sessionId
 * where one exists (a session that reconnected under a new pid shows up
 * once), otherwise by address.
 */
export function dedupePeers(peers: Peer[]): Peer[] {
  const bySession = new Map<string, Peer>()
  for (const peer of peers) {
    const key = peer.sessionId ?? peer.address
    const existing = bySession.get(key)
    if (!existing) {
      bySession.set(key, peer)
      continue
    }
    // Local wins; between two of the same transport, the newer record does.
    const preferNew =
      (existing.transport === 'bridge' && peer.transport === 'uds') ||
      (existing.transport === peer.transport &&
        (peer.startedAt ?? 0) > (existing.startedAt ?? 0))
    if (preferNew) bySession.set(key, peer)
  }
  return [...bySession.values()]
}

/** One registry file → a peer, or nothing if it is stale, junk or unreachable. */
async function readPeerFile(
  dir: string,
  file: string,
): Promise<Peer | undefined> {
  const pid = pidFromFilename(file)
  if (pid === undefined) return undefined

  if (pid !== process.pid && !isProcessRunning(pid)) {
    if (getPlatform() !== 'wsl') {
      void unlink(join(dir, file)).catch(() => {})
    }
    return undefined
  }

  try {
    const record = jsonParse(
      await readFile(join(dir, file), 'utf8'),
    ) as SessionRecord
    return toPeer(record, pid, process.pid)
  } catch (e) {
    // A half-written file during another session's startup is normal.
    logForDebugging(`[peerRegistry] skipping ${file}: ${errorMessage(e)}`)
    return undefined
  }
}

/**
 * Live, addressable sessions other than this one.
 *
 * "Listed means alive" is the contract SendMessage's prompt states, so dead
 * pids are filtered rather than shown as unreachable. Stale files are swept
 * on the way past — except on WSL, where a Windows-native pid isn't probeable
 * and a sweep would delete a live session's record (see concurrentSessions).
 *
 * Never throws: discovery failing should cost you the peer list, not the turn.
 */
export async function listPeers({
  includeSelf = false,
}: { includeSelf?: boolean } = {}): Promise<Peer[]> {
  const dir = getSessionsDir()
  let files: string[]
  try {
    files = await readdir(dir)
  } catch (e) {
    if (!isFsInaccessible(e)) {
      logForDebugging(`[peerRegistry] readdir failed: ${errorMessage(e)}`)
    }
    return []
  }

  const peers: Peer[] = []
  for (const file of files) {
    const peer = await readPeerFile(dir, file)
    if (peer && (includeSelf || !peer.isSelf)) peers.push(peer)
  }

  return dedupePeers(peers).sort(
    (a, b) => (a.startedAt ?? 0) - (b.startedAt ?? 0),
  )
}

/** "3m" / "2h" / "4d" — how long a peer has been up. */
export function formatUptime(startedAt: number | undefined, now: number): string {
  if (startedAt === undefined || startedAt > now) return '—'
  const minutes = Math.floor((now - startedAt) / 60_000)
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/** Fallback label for a session that never set a name. */
export function peerLabel(peer: Peer): string {
  return peer.name ?? peer.sessionId?.slice(0, 8) ?? `pid ${peer.pid}`
}
