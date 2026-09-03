import type { BaseHookInput } from '../entrypoints/agentSdkTypes.js'
import type { VimMode } from './textInputTypes.js'

/**
 * Per-window claude.ai subscription rate limit, as reported by the API's
 * `anthropic-ratelimit-unified-*` response headers.
 */
export type StatusLineRateLimitWindow = {
  /** Utilization of the window, 0-100. */
  used_percentage: number
  /** Unix epoch seconds at which the window resets. */
  resets_at: number
}

/**
 * JSON payload piped on stdin to a user-configured status line command
 * (settings `statusLine: { type: 'command', command: '...' }`). Whatever the
 * command prints to stdout is rendered as the status line beneath the prompt.
 *
 * Keys are snake_case because this is a public, documented contract consumed
 * by shell scripts. Optional sections are omitted entirely (never `null`) when
 * they do not apply to the current session.
 */
export type StatusLineCommandInput = BaseHookInput & {
  /** User-set or AI-generated session title, when one exists. */
  session_name?: string
  model: {
    /** Full model ID, e.g. `claude-sonnet-4-5-20250929`. */
    id: string
    /** Human-readable model name, e.g. `Sonnet 4.5`. */
    display_name: string
  }
  workspace: {
    current_dir: string
    /** Directory Claude Code was launched from. */
    project_dir: string
    /** Extra directories granted via `--add-dir` / `/add-dir`. */
    added_dirs: string[]
  }
  /** Claude Code version. */
  version: string
  output_style: {
    name: string
  }
  cost: {
    total_cost_usd: number
    total_duration_ms: number
    total_api_duration_ms: number
    total_lines_added: number
    total_lines_removed: number
  }
  context_window: {
    total_input_tokens: number
    total_output_tokens: number
    context_window_size: number
    /**
     * Token usage reported on the most recent assistant message. `null` until
     * the first API response arrives.
     */
    current_usage: {
      input_tokens: number
      output_tokens: number
      cache_creation_input_tokens: number
      cache_read_input_tokens: number
    } | null
    /** Percentage of the context window in use (0-100); `null` when unknown. */
    used_percentage: number | null
    /** Percentage of the context window still free (0-100); `null` when unknown. */
    remaining_percentage: number | null
  }
  /** True once the latest assistant turn has crossed the 200k-token threshold. */
  exceeds_200k_tokens: boolean
  /** Present only when the API has reported subscription rate limits. */
  rate_limits?: {
    five_hour?: StatusLineRateLimitWindow
    seven_day?: StatusLineRateLimitWindow
  }
  /** Present only when vim mode is enabled. */
  vim?: {
    mode: VimMode
  }
  /** Present only when running with `--agent` or `settings.agent`. */
  agent?: {
    name: string
  }
  /** Present only in `--remote` mode. */
  remote?: {
    session_id: string
  }
  /** Present only when the session runs inside a `--worktree`. */
  worktree?: {
    name: string
    path: string
    branch?: string
    original_cwd: string
    original_branch?: string
  }
}
