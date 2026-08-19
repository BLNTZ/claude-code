/**
 * Local copy of the content-block text extraction utils/messages.js offers.
 *
 * That module is one of the heaviest in the tree — and it imports buddy/prompt
 * itself — so the companion pulls in this three-line version instead of hanging
 * the whole message pipeline off an easter egg that is off by default.
 */
export function textFromBlocks(
  blocks: readonly { readonly type: string }[],
  separator = '',
): string {
  return blocks
    .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
    .map(b => b.text)
    .join(separator)
}
