import { spawn } from 'child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  dedupePeers,
  formatUptime,
  listPeers,
  type Peer,
  peerLabel,
  toPeer,
} from '../../src/utils/peerRegistry.js'

const MINUTE = 60_000

function peer(overrides: Partial<Peer> = {}): Peer {
  return {
    address: 'uds:/tmp/a.sock',
    transport: 'uds',
    pid: 100,
    kind: 'interactive',
    isSelf: false,
    ...overrides,
  }
}

describe('toPeer()', () => {
  it('addresses a session by its messaging socket', () => {
    const result = toPeer(
      { messagingSocketPath: '/tmp/cc.sock', sessionId: 's1', name: 'api' },
      42,
      1,
    )
    expect(result?.address).toBe('uds:/tmp/cc.sock')
    expect(result?.transport).toBe('uds')
    expect(result?.name).toBe('api')
    expect(result?.isSelf).toBe(false)
  })

  it('falls back to the bridge session id', () => {
    const result = toPeer({ bridgeSessionId: 'session_01Ab' }, 42, 1)
    expect(result?.address).toBe('bridge:session_01Ab')
    expect(result?.transport).toBe('bridge')
  })

  it('prefers the local socket when a session has both', () => {
    const result = toPeer(
      { messagingSocketPath: '/tmp/cc.sock', bridgeSessionId: 'session_01Ab' },
      42,
      1,
    )
    expect(result?.transport).toBe('uds')
  })

  it('skips a session with no way to reach it', () => {
    expect(toPeer({ sessionId: 's1', name: 'api' }, 42, 1)).toBeUndefined()
  })

  it('marks this process as self', () => {
    expect(toPeer({ messagingSocketPath: '/s' }, 7, 7)?.isSelf).toBe(true)
  })

  it('ignores junk in the kind and status fields', () => {
    const result = toPeer(
      { messagingSocketPath: '/s', kind: 'wat', status: 'vibing' },
      42,
      1,
    )
    expect(result?.kind).toBe('interactive')
    expect(result?.status).toBeUndefined()
  })
})

describe('dedupePeers()', () => {
  it('lists a session reachable both ways once, locally', () => {
    const result = dedupePeers([
      peer({ sessionId: 's1', transport: 'bridge', address: 'bridge:s1' }),
      peer({ sessionId: 's1', transport: 'uds', address: 'uds:/tmp/s1.sock' }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.address).toBe('uds:/tmp/s1.sock')
  })

  it('keeps local first regardless of order', () => {
    const result = dedupePeers([
      peer({ sessionId: 's1', transport: 'uds', address: 'uds:/tmp/s1.sock' }),
      peer({ sessionId: 's1', transport: 'bridge', address: 'bridge:s1' }),
    ])
    expect(result[0]!.address).toBe('uds:/tmp/s1.sock')
  })

  it('keeps the newer record when a session reconnected under a new pid', () => {
    const result = dedupePeers([
      peer({ sessionId: 's1', pid: 1, startedAt: 1000 }),
      peer({ sessionId: 's1', pid: 2, startedAt: 5000 }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]!.pid).toBe(2)
  })

  it('keeps distinct sessions', () => {
    const result = dedupePeers([
      peer({ sessionId: 's1', address: 'uds:/a' }),
      peer({ sessionId: 's2', address: 'uds:/b' }),
    ])
    expect(result).toHaveLength(2)
  })

  it('falls back to the address when records carry no session id', () => {
    const result = dedupePeers([
      peer({ address: 'uds:/a' }),
      peer({ address: 'uds:/a' }),
      peer({ address: 'uds:/b' }),
    ])
    expect(result).toHaveLength(2)
  })
})

describe('formatUptime()', () => {
  const now = 10 * 24 * 60 * MINUTE

  it.each([
    [now - 30_000, '<1m'],
    [now - 5 * MINUTE, '5m'],
    [now - 3 * 60 * MINUTE, '3h'],
    [now - 4 * 24 * 60 * MINUTE, '4d'],
  ])('renders %i as %s', (startedAt, expected) => {
    expect(formatUptime(startedAt, now)).toBe(expected)
  })

  it('gives up on missing or future timestamps', () => {
    expect(formatUptime(undefined, now)).toBe('—')
    expect(formatUptime(now + MINUTE, now)).toBe('—')
  })
})

describe('peerLabel()', () => {
  it('prefers the session name', () => {
    expect(peerLabel(peer({ name: 'api', sessionId: 'abcdef123' }))).toBe('api')
  })

  it('falls back to a short session id, then the pid', () => {
    expect(peerLabel(peer({ sessionId: 'abcdef123456' }))).toBe('abcdef12')
    expect(peerLabel(peer({ pid: 4321 }))).toBe('pid 4321')
  })
})

describe('listPeers()', () => {
  let configDir: string
  let sessionsDir: string
  let livePid: number
  let child: ReturnType<typeof spawn>
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR

  beforeAll(async () => {
    // A genuinely live pid that isn't this process — the registry filters on
    // process liveness, so a fake number wouldn't exercise it.
    child = spawn('sleep', ['120'], { stdio: 'ignore' })
    livePid = child.pid!
  })

  afterAll(() => {
    child.kill()
    if (originalConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = originalConfigDir
  })

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'peers-test-'))
    sessionsDir = join(configDir, 'sessions')
    mkdirSync(sessionsDir)
    process.env.CLAUDE_CONFIG_DIR = configDir
  })

  function writeRecord(pid: number, record: Record<string, unknown>): void {
    writeFileSync(join(sessionsDir, `${pid}.json`), JSON.stringify(record))
  }

  it('returns nothing when the registry directory is missing', async () => {
    rmSync(sessionsDir, { recursive: true })
    expect(await listPeers()).toEqual([])
  })

  it('lists a live peer and excludes this session', async () => {
    writeRecord(livePid, {
      messagingSocketPath: '/tmp/peer.sock',
      sessionId: 'other',
      name: 'worker',
      cwd: '/repo',
      startedAt: Date.now() - MINUTE,
    })
    writeRecord(process.pid, {
      messagingSocketPath: '/tmp/self.sock',
      sessionId: 'self',
    })

    const peers = await listPeers()
    expect(peers).toHaveLength(1)
    expect(peers[0]!.name).toBe('worker')
    expect(peers[0]!.address).toBe('uds:/tmp/peer.sock')
  })

  it('includes this session on request', async () => {
    writeRecord(process.pid, {
      messagingSocketPath: '/tmp/self.sock',
      sessionId: 'self',
    })
    const peers = await listPeers({ includeSelf: true })
    expect(peers).toHaveLength(1)
    expect(peers[0]!.isSelf).toBe(true)
  })

  it('drops dead sessions rather than listing them as unreachable', async () => {
    writeRecord(999_999, { messagingSocketPath: '/tmp/ghost.sock' })
    expect(await listPeers()).toEqual([])
  })

  it('ignores files that are not pid records', async () => {
    writeFileSync(join(sessionsDir, '2026-03-14_notes.md'), 'not a session')
    writeFileSync(join(sessionsDir, `${livePid}.json.bak`), '{}')
    expect(await listPeers()).toEqual([])
    // The strict filename guard also means the note survives the stale sweep.
    expect(await listPeers()).toEqual([])
  })

  it('survives a half-written record from another session starting up', async () => {
    writeFileSync(join(sessionsDir, `${livePid}.json`), '{"messagingSock')
    expect(await listPeers()).toEqual([])
  })

  it('skips live sessions that have no address', async () => {
    writeRecord(livePid, { sessionId: 'other', name: 'worker' })
    expect(await listPeers()).toEqual([])
  })
})
