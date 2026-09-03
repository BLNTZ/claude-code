/**
 * Peers command - minimal metadata only.
 * Implementation is lazy-loaded from peers.tsx so the registry scan and the
 * renderer stay out of startup.
 */
import type { Command } from '../../commands.js'

const peers = {
  type: 'local-jsx',
  name: 'peers',
  description: 'List other Claude sessions you can message',
  argumentHint: '[all]',
  immediate: true,
  load: () => import('./peers.js'),
} satisfies Command

export default peers
