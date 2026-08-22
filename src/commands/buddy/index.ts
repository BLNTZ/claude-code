/**
 * Buddy command - minimal metadata only.
 * Implementation is lazy-loaded from buddy.tsx so the sprite tables and the
 * hatch path stay out of startup.
 */
import { isBuddyLive } from '../../buddy/window.js'
import type { Command } from '../../commands.js'

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Meet the companion that lives next to your prompt',
  argumentHint: '[pet|mute|unmute]',
  isEnabled: () => isBuddyLive(),
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
