import type { BaseHookInput } from '../entrypoints/agentSdkTypes.js'

/**
 * JSON payload piped on stdin to a user-configured file suggestion command
 * (settings `fileSuggestion: { type: 'command', command: '...' }`).
 *
 * The command is expected to print one file path per line on stdout, already
 * ranked by its own relevance logic. Those paths replace Claude Code's built-in
 * `@`-mention typeahead results, in the order returned.
 *
 * Keys are snake_case because this is a public contract consumed by shell
 * scripts, matching the other hook inputs.
 */
export type FileSuggestionCommandInput = BaseHookInput & {
  /** The partial path the user has typed after `@`. May be empty. */
  query: string
}
