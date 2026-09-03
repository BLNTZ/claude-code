import type { FileStateCache } from '../../utils/fileStateCache.js'
import type { ThemeName } from '../../utils/theme.js'

/**
 * Session signals handed to tips so they can decide relevance and render
 * themselves. `theme` is always present; the file/tool signals are only
 * supplied by the REPL spinner path and are absent for the startup prefetch
 * (`getRelevantTips()` with no context).
 */
export type TipContext = {
  /** Resolved theme (never 'auto'), for colorizing tip content */
  theme: ThemeName
  /** Files read so far this session — lets tips key off what the user edits */
  readFileState?: FileStateCache
  /** Executables invoked through the Bash tool this session (e.g. 'vercel') */
  bashTools?: Set<string>
}

/**
 * A rotating spinner tip. Selection: `isRelevant` filters, then
 * `cooldownSessions` gates on sessions-since-last-shown, then the tip that
 * has gone longest unseen wins (see tipScheduler.ts).
 */
export type Tip = {
  /** Stable identifier; keys the shown-history in global config */
  id: string
  /** Rendered text. Async so tips can consult caches or feature flags. */
  content: (context: TipContext) => Promise<string>
  /** Minimum sessions between showings. 0 = every session. */
  cooldownSessions: number
  /** Whether the tip applies right now. Context is absent on startup prefetch. */
  isRelevant: (context?: TipContext) => Promise<boolean>
}
