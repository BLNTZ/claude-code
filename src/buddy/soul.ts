import { saveGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { safeParseJSON } from '../utils/json.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import { companionUserId, roll } from './companion.js'
import { textFromBlocks } from './text.js'
import type {
  Companion,
  CompanionBones,
  CompanionSoul,
  StoredCompanion,
} from './types.js'

// Bones are rolled from hash(userId) — the same account always gets the same
// creature. Only the soul (name + personality) is model-generated, and only
// once: after the first hatch it lives in config and never regenerates.

const MAX_NAME_CHARS = 20
const MAX_PERSONALITY_CHARS = 160
const HATCH_TIMEOUT_MS = 15_000

// Offline/rate-limited hatches still get a companion. Picked by inspirationSeed
// so a retry after a network blip doesn't rename an already-named creature.
const FALLBACK_NAMES = [
  'Pip',
  'Mote',
  'Sprocket',
  'Waffle',
  'Bandwidth',
  'Noodle',
  'Sudo',
  'Biscuit',
  'Gremlin',
  'Muffin',
  'Tarball',
  'Pebble',
  'Kernel',
  'Marble',
  'Widget',
  'Grumbles',
] as const

const FALLBACK_PERSONALITIES = [
  'Quietly judgmental, deeply loyal.',
  'Enthusiastic about everything, informed about nothing.',
  'Has seen things. Mostly stack traces.',
  'Optimistic to a fault, especially about tests passing.',
] as const

export function fallbackSoul(inspirationSeed: number): CompanionSoul {
  return {
    name: FALLBACK_NAMES[inspirationSeed % FALLBACK_NAMES.length]!,
    personality:
      FALLBACK_PERSONALITIES[inspirationSeed % FALLBACK_PERSONALITIES.length]!,
  }
}

/** One line, no quotes, bounded — this string ends up inside a 12-col sprite column. */
export function sanitizeSoulField(raw: unknown, max: number): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”](.*)["'“”]$/, '$1')
    .trim()
    .slice(0, max)
}

export function buildHatchPrompt(
  bones: CompanionBones,
  inspirationSeed: number,
): string {
  const stats = Object.entries(bones.stats)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ')
  const hat = bones.hat === 'none' ? 'no hat' : `wearing a ${bones.hat}`
  return `Name this creature and give it a personality.

Species: ${bones.species}
Rarity: ${bones.rarity}
Accessories: ${hat}${bones.shiny ? ', and it is shiny' : ''}
Stats (0-100): ${stats}

It is about to move in next to a software developer's terminal and comment on their work forever.

Rules:
- name: one word, at most ${MAX_NAME_CHARS} characters. Give it some character — not "Buddy", not "Pixel", not the species name. Let the stats suggest it: a high-CHAOS creature is not named the same as a high-WISDOM one.
- personality: one sentence, at most ${MAX_PERSONALITY_CHARS} characters, describing how it acts. Specific and a little funny beats generic and sweet.
- Randomness seed (use it to avoid your usual first guess): ${inspirationSeed}

Reply with JSON: {"name": string, "personality": string}.`
}

async function generateSoul(
  bones: CompanionBones,
  inspirationSeed: number,
  signal: AbortSignal,
): Promise<CompanionSoul | undefined> {
  try {
    // Loaded on demand — hatching happens once, so the API layer shouldn't sit
    // in the import graph of everything that just wants to read a companion.
    const { queryHaiku } = await import('../services/api/claude.js')
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([
        'You name small imaginary creatures. You answer only with the JSON asked for.',
      ]),
      userPrompt: buildHatchPrompt(bones, inspirationSeed),
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            personality: { type: 'string' },
          },
          required: ['name', 'personality'],
          additionalProperties: false,
        },
      },
      signal,
      options: {
        querySource: 'buddy_hatch',
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const parsed = safeParseJSON(textFromBlocks(result.message.content))
    if (!parsed || typeof parsed !== 'object') return undefined
    const name = sanitizeSoulField(
      (parsed as { name?: unknown }).name,
      MAX_NAME_CHARS,
    )
    const personality = sanitizeSoulField(
      (parsed as { personality?: unknown }).personality,
      MAX_PERSONALITY_CHARS,
    )
    if (!name || !personality) return undefined
    return { name, personality }
  } catch (error) {
    logForDebugging(`companion hatch failed: ${errorMessage(error)}`, {
      level: 'error',
    })
    return undefined
  }
}

/**
 * Roll the bones, ask the model for a soul, persist it. Returns the assembled
 * companion. Never throws — a failed model call falls back to a canned soul so
 * `/buddy` always ends with a creature on screen.
 */
export async function hatchCompanion(
  signal?: AbortSignal,
): Promise<{ companion: Companion; usedFallback: boolean }> {
  const { bones, inspirationSeed } = roll(companionUserId())

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HATCH_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  let soul: CompanionSoul | undefined
  try {
    soul = await generateSoul(bones, inspirationSeed, controller.signal)
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', onAbort)
  }

  const usedFallback = soul === undefined
  const stored: StoredCompanion = {
    ...(soul ?? fallbackSoul(inspirationSeed)),
    hatchedAt: Date.now(),
  }
  saveGlobalConfig(current => ({ ...current, companion: stored }))

  return { companion: { ...stored, ...bones }, usedFallback }
}
