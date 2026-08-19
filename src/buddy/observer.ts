import { feature } from 'bun:bundle'
import type { Message } from '../types/message.js'
import { getGlobalConfig } from '../utils/config.js'
import { logForDebugging } from '../utils/debug.js'
import { errorMessage } from '../utils/errors.js'
import { safeParseJSON } from '../utils/json.js'
import { asSystemPrompt } from '../utils/systemPromptType.js'
import { getCompanion } from './companion.js'
import { textFromBlocks } from './text.js'
import type { Companion } from './types.js'

// The companion watches the turn go by and occasionally says something. It is
// NOT the assistant: it never answers the technical question, it just reacts.
// Called once per completed turn from REPL.tsx; everything here is best-effort
// and must never throw into the query loop.

// Unprompted quips are rate-limited — a sprite that pipes up every turn stops
// being a friend and starts being a notification. Being addressed by name
// bypasses both the cooldown and the dice roll: if you talk to it, it answers.
const REACTION_COOLDOWN_MS = 3 * 60_000
const UNPROMPTED_CHANCE = 0.2
const OBSERVER_TIMEOUT_MS = 8_000
// Bubble wraps at 30 cols × ~4 lines before it starts crowding the input.
const MAX_QUIP_CHARS = 120
const MAX_TRANSCRIPT_CHARS = 800

/**
 * Does this text address the companion by name? Word-boundary match so
 * "duckling" doesn't wake a companion named "Duck", but "Duck?" and "hey,
 * duck!" both do. Unicode-aware because souls are model-named.
 */
export function isAddressedTo(text: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`,
    'iu',
  ).test(text)
}

/** Pure so the gating is testable without a model call. */
export function shouldReact({
  addressed,
  now,
  lastAttemptAt,
  roll,
}: {
  addressed: boolean
  now: number
  lastAttemptAt: number
  roll: number
}): boolean {
  if (addressed) return true
  if (now - lastAttemptAt < REACTION_COOLDOWN_MS) return false
  return roll < UNPROMPTED_CHANCE
}

function messageText(message: Message): string {
  if (message.type !== 'user' && message.type !== 'assistant') return ''
  const content = message.message.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return textFromBlocks(content, '\n')
}

/** Last thing the human actually typed — meta/tool/synthetic turns skipped. */
export function lastHumanText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    if (msg.type !== 'user') continue
    if (msg.isMeta || msg.isVirtual) continue
    // origin is only set for non-human turns (agent, teammate, command, hook…),
    // so anything with an origin is the machine talking to itself.
    if (msg.origin !== undefined) continue
    const text = messageText(msg).trim()
    if (text) return text
  }
  return ''
}

/** Last thing the assistant said, so the quip can react to the outcome. */
export function lastAssistantText(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!
    if (msg.type !== 'assistant') continue
    if (msg.isMeta || msg.isVirtual) continue
    const text = messageText(msg).trim()
    if (text) return text
  }
  return ''
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export function buildObserverSystemPrompt(companion: Companion): string {
  const stats = Object.entries(companion.stats)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ')
  return `You are ${companion.name}, a small ${companion.rarity} ${companion.species} who lives next to a developer's terminal and watches them work.

Personality: ${companion.personality}
Stats (0-100): ${stats}

You are NOT the coding assistant. You never answer the technical question, write code, give instructions, or offer to help — the assistant beside you is already doing that. You are a pet with opinions.

You get ONE speech bubble. Rules:
- One sentence, at most ${MAX_QUIP_CHARS} characters. Shorter is better.
- Plain text only: no markdown, no code, no emoji, no *action asterisks*.
- React to the moment — the mood of it, what just broke or landed, what the human is putting themselves through. Stay in character.
- If the human addressed you by name, answer them directly.
- If nothing is worth saying, say nothing. A quiet pet is better than a needy one.

Reply with JSON: {"speak": boolean, "say": string}. Set speak to false and say to "" when you have nothing to add.`
}

export function buildObserverUserPrompt({
  humanText,
  assistantText,
  addressed,
}: {
  humanText: string
  assistantText: string
  addressed: boolean
}): string {
  const parts = [
    `The human said:\n${clip(humanText, MAX_TRANSCRIPT_CHARS)}`,
    `The assistant replied:\n${clip(assistantText, MAX_TRANSCRIPT_CHARS)}`,
  ]
  parts.push(
    addressed
      ? 'They said your name. Answer them.'
      : 'They were not talking to you. Only speak if you actually have something.',
  )
  return parts.join('\n\n')
}

/** Model output → one bubble-safe line, or undefined if there's nothing to say. */
export function sanitizeQuip(raw: string): string | undefined {
  const line = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'“”](.*)["'“”]$/, '$1')
    .trim()
  if (!line) return undefined
  return clip(line, MAX_QUIP_CHARS)
}

// Module state, not React state — the observer outlives any one render and
// the cooldown should survive re-mounts within a session.
let lastAttemptAt = 0
let inFlight = false

/** Test seam: clears the cooldown so ordering between tests doesn't matter. */
export function resetCompanionObserverState(): void {
  lastAttemptAt = 0
  inFlight = false
}

export async function fireCompanionObserver(
  messages: Message[],
  onReaction: (reaction: string) => void,
): Promise<void> {
  if (!feature('BUDDY')) return
  if (inFlight) return
  const companion = getCompanion()
  if (!companion || getGlobalConfig().companionMuted) return

  const humanText = lastHumanText(messages)
  if (!humanText) return
  const addressed = isAddressedTo(humanText, companion.name)
  if (
    !shouldReact({
      addressed,
      now: Date.now(),
      lastAttemptAt,
      roll: Math.random(),
    })
  ) {
    return
  }

  inFlight = true
  // Stamped on the attempt, not the utterance: a "nothing to say" answer, a
  // timeout and an offline run all buy the same quiet period, so an idle
  // companion can't quietly bill a Haiku call every fifth turn.
  lastAttemptAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OBSERVER_TIMEOUT_MS)
  try {
    // Loaded on demand: the API layer is a heavy import and BUDDY is off by
    // default, so nothing should pay for it until a companion actually speaks.
    const { queryHaiku } = await import('../services/api/claude.js')
    const result = await queryHaiku({
      systemPrompt: asSystemPrompt([buildObserverSystemPrompt(companion)]),
      userPrompt: buildObserverUserPrompt({
        humanText,
        assistantText: lastAssistantText(messages),
        addressed,
      }),
      outputFormat: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: {
            speak: { type: 'boolean' },
            say: { type: 'string' },
          },
          required: ['speak', 'say'],
          additionalProperties: false,
        },
      },
      signal: controller.signal,
      options: {
        querySource: 'buddy_observer',
        agents: [],
        isNonInteractiveSession: false,
        hasAppendSystemPrompt: false,
        mcpTools: [],
      },
    })

    const parsed = safeParseJSON(textFromBlocks(result.message.content))
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      (parsed as { speak?: unknown }).speak !== true
    ) {
      return
    }
    const say = (parsed as { say?: unknown }).say
    if (typeof say !== 'string') return
    const quip = sanitizeQuip(say)
    if (!quip) return

    onReaction(quip)
  } catch (error) {
    // An easter egg must never surface an error. Timeouts, rate limits and
    // offline runs all just mean the companion stays quiet this turn.
    logForDebugging(`companion observer failed: ${errorMessage(error)}`, {
      level: 'error',
    })
  } finally {
    clearTimeout(timeout)
    inFlight = false
  }
}
