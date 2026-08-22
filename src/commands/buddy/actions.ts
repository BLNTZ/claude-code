import { getCompanion } from '../../buddy/companion.js'
import type { ToolUseContext } from '../../Tool.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

// The non-rendering half of /buddy. Kept away from the card so the
// subcommands can be exercised without standing up a renderer.

export const HELP = `Usage: /buddy [pet|mute|unmute]

  /buddy          Hatch your companion (first run) and show its card
  /buddy pet      Hearts, briefly
  /buddy mute     Hide the sprite and stop the quips
  /buddy unmute   Bring it back

Your companion is rolled from your account ID — same account, same creature,
forever. Only its name and personality come from the model, once, at hatch.`

const PET_REACTIONS = [
  'leans into it.',
  'makes a small pleased noise.',
  'pretends not to enjoy this.',
  'vibrates faintly.',
  'accepts the tribute.',
] as const

export type BuddyAction = 'help' | 'mute' | 'unmute' | 'pet' | 'card' | 'unknown'

export function parseBuddyArgs(args: string): BuddyAction {
  const arg = args.trim().toLowerCase()
  switch (arg) {
    case '':
      return 'card'
    case 'help':
    case '-h':
    case '--help':
      return 'help'
    case 'mute':
      return 'mute'
    case 'unmute':
      return 'unmute'
    case 'pet':
      return 'pet'
    default:
      return 'unknown'
  }
}

function setMuted(muted: boolean): void {
  saveGlobalConfig(current =>
    current.companionMuted === muted
      ? current
      : { ...current, companionMuted: muted },
  )
}

/** mute/unmute — both need a hatched companion to talk about. */
export function muteMessage(mute: boolean): string {
  const companion = getCompanion()
  if (!companion) return 'No companion yet — run /buddy first.'
  setMuted(mute)
  return mute
    ? `${companion.name} settles down out of sight. /buddy unmute to bring them back.`
    : `${companion.name} is back.`
}

export function petMessage(context: Pick<ToolUseContext, 'setAppState'>): string {
  const companion = getCompanion()
  if (!companion) return 'Nothing to pet yet — run /buddy first.'
  // CompanionSprite floats hearts for PET_BURST_MS from this timestamp.
  context.setAppState(prev => ({ ...prev, companionPetAt: Date.now() }))
  const reaction =
    PET_REACTIONS[Math.floor(Math.random() * PET_REACTIONS.length)]!
  const muted = getGlobalConfig().companionMuted === true
  const aside = muted ? ' (muted — /buddy unmute to watch)' : ''
  return `${companion.name} ${reaction}${aside}`
}

export function unknownArgMessage(args: string): string {
  return `Unknown option "${args.trim().toLowerCase()}".\n\n${HELP}`
}
