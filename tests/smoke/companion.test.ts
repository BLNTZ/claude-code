import { beforeEach, describe, expect, it } from 'vitest'
import {
  companionUserId,
  getCompanion,
  roll,
  rollWithSeed,
} from '../../src/buddy/companion.js'
import {
  buildObserverSystemPrompt,
  buildObserverUserPrompt,
  fireCompanionObserver,
  isAddressedTo,
  lastAssistantText,
  lastHumanText,
  resetCompanionObserverState,
  sanitizeQuip,
  shouldReact,
} from '../../src/buddy/observer.js'
import {
  buildHatchPrompt,
  fallbackSoul,
  sanitizeSoulField,
} from '../../src/buddy/soul.js'
import {
  EYES,
  HATS,
  RARITIES,
  SPECIES,
  STAT_NAMES,
} from '../../src/buddy/types.js'
import { isBuddyLive } from '../../src/buddy/window.js'
import {
  muteMessage,
  parseBuddyArgs,
  petMessage,
  unknownArgMessage,
} from '../../src/commands/buddy/actions.js'
import buddyCommand from '../../src/commands/buddy/index.js'
import type { Message } from '../../src/types/message.js'
import { getGlobalConfig, saveGlobalConfig } from '../../src/utils/config.js'

const MINUTE = 60_000

function userMessage(content: string, extra: Partial<Message> = {}): Message {
  return {
    type: 'user',
    message: { role: 'user', content },
    uuid: '00000000-0000-0000-0000-000000000001',
    timestamp: new Date(0).toISOString(),
    ...extra,
  } as Message
}

function assistantMessage(
  text: string,
  extra: Record<string, unknown> = {},
): Message {
  return {
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text }] },
    uuid: '00000000-0000-0000-0000-000000000002',
    timestamp: new Date(0).toISOString(),
    ...extra,
  } as unknown as Message
}

beforeEach(() => {
  resetCompanionObserverState()
  saveGlobalConfig(current => ({
    ...current,
    userID: 'test-user',
    companion: undefined,
    companionMuted: undefined,
  }))
})

describe('companion roll', () => {
  it('is deterministic for a given seed', () => {
    const a = rollWithSeed('seed-one')
    const b = rollWithSeed('seed-one')
    expect(a).toEqual(b)
  })

  it('produces valid bones for every seed it is given', () => {
    for (let i = 0; i < 200; i++) {
      const { bones } = rollWithSeed(`seed-${i}`)
      expect(RARITIES).toContain(bones.rarity)
      expect(SPECIES).toContain(bones.species)
      expect(EYES).toContain(bones.eye)
      expect(HATS).toContain(bones.hat)
      for (const stat of STAT_NAMES) {
        expect(bones.stats[stat]).toBeGreaterThanOrEqual(1)
        expect(bones.stats[stat]).toBeLessThanOrEqual(100)
      }
      // Hats are a rarity perk — commons never get one.
      if (bones.rarity === 'common') expect(bones.hat).toBe('none')
    }
  })

  it('gives different seeds different creatures', () => {
    const seen = new Set(
      Array.from({ length: 50 }, (_, i) =>
        JSON.stringify(rollWithSeed(`s${i}`).bones),
      ),
    )
    expect(seen.size).toBeGreaterThan(1)
  })

  it('caches the roll for the same user', () => {
    const first = roll('cache-user')
    expect(roll('cache-user')).toBe(first)
  })
})

describe('getCompanion()', () => {
  it('returns undefined until something is hatched', () => {
    expect(getCompanion()).toBeUndefined()
  })

  it('merges the stored soul with freshly rolled bones', () => {
    saveGlobalConfig(current => ({
      ...current,
      companion: { name: 'Sudo', personality: 'Bossy.', hatchedAt: 123 },
    }))
    const companion = getCompanion()
    expect(companion?.name).toBe('Sudo')
    expect(companion?.hatchedAt).toBe(123)
    expect(companion?.species).toBe(roll(companionUserId()).bones.species)
  })

  it('ignores bones smuggled into the stored config', () => {
    const real = roll(companionUserId()).bones
    saveGlobalConfig(current => ({
      ...current,
      companion: {
        name: 'Cheater',
        personality: 'Tried it.',
        hatchedAt: 1,
        // Old-format/hand-edited configs may carry bones; they must not win.
        rarity: 'legendary',
        stats: { DEBUGGING: 100 },
      } as never,
    }))
    expect(getCompanion()?.rarity).toBe(real.rarity)
    expect(getCompanion()?.stats).toEqual(real.stats)
  })
})

describe('isAddressedTo()', () => {
  it.each([
    ['duck, look at this', 'Duck'],
    ['hey Duck!', 'Duck'],
    ['Duck', 'Duck'],
    ['what do you think, duck?', 'Duck'],
  ])('matches %j for %j', (text, name) => {
    expect(isAddressedTo(text, name)).toBe(true)
  })

  it.each([
    ['the duckling is fine', 'Duck'],
    ['unducked the pipeline', 'Duck'],
    ['no one here', 'Duck'],
  ])('does not match %j for %j', (text, name) => {
    expect(isAddressedTo(text, name)).toBe(false)
  })

  it('does not treat a name as a regex', () => {
    expect(() => isAddressedTo('anything', 'C++ (v2)')).not.toThrow()
    expect(isAddressedTo('ask C++ (v2) about it', 'C++ (v2)')).toBe(true)
  })
})

describe('shouldReact()', () => {
  const now = 10 * MINUTE

  it('always answers when addressed, even inside the cooldown', () => {
    expect(
      shouldReact({ addressed: true, now, lastAttemptAt: now - 1, roll: 0.99 }),
    ).toBe(true)
  })

  it('stays quiet inside the cooldown when not addressed', () => {
    expect(
      shouldReact({
        addressed: false,
        now,
        lastAttemptAt: now - MINUTE,
        roll: 0,
      }),
    ).toBe(false)
  })

  it('rolls the dice once the cooldown is up', () => {
    const past = now - 10 * MINUTE
    expect(
      shouldReact({ addressed: false, now, lastAttemptAt: past, roll: 0.01 }),
    ).toBe(true)
    expect(
      shouldReact({ addressed: false, now, lastAttemptAt: past, roll: 0.99 }),
    ).toBe(false)
  })
})

describe('transcript extraction', () => {
  it('picks the last human turn, skipping meta and non-human origins', () => {
    const messages = [
      userMessage('first'),
      userMessage('real question'),
      userMessage('<system-reminder>', { isMeta: true }),
      userMessage('/buddy pet', { origin: 'command' }),
    ]
    expect(lastHumanText(messages)).toBe('real question')
  })

  it('returns empty when the human never spoke', () => {
    expect(lastHumanText([assistantMessage('hello')])).toBe('')
  })

  it('picks the last assistant text', () => {
    const messages = [assistantMessage('older'), assistantMessage('newest')]
    expect(lastAssistantText(messages)).toBe('newest')
  })
})

describe('sanitizeQuip()', () => {
  it('collapses whitespace and strips wrapping quotes', () => {
    expect(sanitizeQuip('  "well\n  that went great"  ')).toBe(
      'well that went great',
    )
  })

  it('drops empty output', () => {
    expect(sanitizeQuip('   ')).toBeUndefined()
  })

  it('truncates long quips to one bubble', () => {
    const quip = sanitizeQuip('x'.repeat(400))
    expect(quip).toBeDefined()
    expect(quip!.length).toBeLessThanOrEqual(120)
    expect(quip!.endsWith('…')).toBe(true)
  })
})

describe('observer prompts', () => {
  const companion = {
    ...rollWithSeed('prompt-seed').bones,
    name: 'Grumbles',
    personality: 'Sighs at every force push.',
    hatchedAt: 0,
  }

  it('tells the model who it is and what it must not do', () => {
    const prompt = buildObserverSystemPrompt(companion)
    expect(prompt).toContain('Grumbles')
    expect(prompt).toContain(companion.species)
    expect(prompt).toContain('NOT the coding assistant')
  })

  it('marks whether the human addressed the companion', () => {
    expect(
      buildObserverUserPrompt({
        humanText: 'hi',
        assistantText: 'hello',
        addressed: true,
      }),
    ).toContain('Answer them')
    expect(
      buildObserverUserPrompt({
        humanText: 'hi',
        assistantText: 'hello',
        addressed: false,
      }),
    ).toContain('not talking to you')
  })
})

describe('fireCompanionObserver()', () => {
  it('does nothing while the BUDDY flag is off', async () => {
    saveGlobalConfig(current => ({
      ...current,
      companion: { name: 'Pip', personality: 'Quiet.', hatchedAt: 0 },
    }))
    let reactions = 0
    await fireCompanionObserver([userMessage('Pip, hello')], () => {
      reactions++
    })
    expect(reactions).toBe(0)
  })
})

describe('soul', () => {
  it('sanitizes model output into a single bounded line', () => {
    expect(sanitizeSoulField('  "Sir\n Quacks"  ', 20)).toBe('Sir Quacks')
    expect(sanitizeSoulField('x'.repeat(50), 10)).toHaveLength(10)
    expect(sanitizeSoulField(42, 10)).toBe('')
  })

  it('falls back to a real name and personality without the model', () => {
    const soul = fallbackSoul(rollWithSeed('fallback').inspirationSeed)
    expect(soul.name.length).toBeGreaterThan(0)
    expect(soul.personality.length).toBeGreaterThan(0)
    // Same seed, same fallback — a retry after a network blip must not rename.
    expect(fallbackSoul(7)).toEqual(fallbackSoul(7))
  })

  it('describes the rolled bones in the hatch prompt', () => {
    const { bones, inspirationSeed } = rollWithSeed('hatch-prompt')
    const prompt = buildHatchPrompt(bones, inspirationSeed)
    expect(prompt).toContain(bones.species)
    expect(prompt).toContain(bones.rarity)
    expect(prompt).toContain(String(inspirationSeed))
  })
})

describe('/buddy command', () => {
  it('is a lazy-loaded local-jsx command', () => {
    expect(buddyCommand.name).toBe('buddy')
    expect(buddyCommand.type).toBe('local-jsx')
    expect(typeof buddyCommand.load).toBe('function')
    expect(buddyCommand.isEnabled()).toBe(isBuddyLive())
  })

  it.each([
    ['', 'card'],
    ['  ', 'card'],
    ['pet', 'pet'],
    ['PET', 'pet'],
    ['mute', 'mute'],
    ['unmute', 'unmute'],
    ['--help', 'help'],
    ['feed', 'unknown'],
  ])('parses %j as %s', (args, expected) => {
    expect(parseBuddyArgs(args)).toBe(expected)
  })

  it('refuses to mute or pet before anything is hatched', () => {
    expect(muteMessage(true)).toContain('run /buddy first')
    expect(getGlobalConfig().companionMuted).toBeUndefined()
    expect(petMessage({ setAppState: () => {} })).toContain('run /buddy first')
  })

  it('mutes and unmutes a hatched companion', () => {
    saveGlobalConfig(current => ({
      ...current,
      companion: { name: 'Pip', personality: 'Quiet.', hatchedAt: 0 },
    }))
    expect(muteMessage(true)).toContain('Pip')
    expect(getGlobalConfig().companionMuted).toBe(true)
    expect(muteMessage(false)).toContain('Pip')
    expect(getGlobalConfig().companionMuted).toBe(false)
  })

  it('stamps the pet time so the sprite can float hearts', () => {
    saveGlobalConfig(current => ({
      ...current,
      companion: { name: 'Pip', personality: 'Quiet.', hatchedAt: 0 },
    }))
    let petAt: number | undefined
    const before = Date.now()
    const message = petMessage({
      setAppState: updater => {
        petAt = updater({} as never).companionPetAt
      },
    })
    expect(message.startsWith('Pip ')).toBe(true)
    expect(petAt).toBeGreaterThanOrEqual(before)
  })

  it('says which option it did not understand', () => {
    expect(unknownArgMessage('feed')).toContain('"feed"')
    expect(unknownArgMessage('feed')).toContain('/buddy pet')
  })
})
