/**
 * Pure tool progress type definitions extracted to break import cycles.
 *
 * Tools stream these payloads through their `onProgress` callback (see
 * `ToolCallProgress` in src/Tool.ts). Each one becomes `ProgressMessage.data`,
 * is rendered by the owning tool's `renderToolUseProgressMessage`, and a subset
 * is forwarded to SDK consumers (src/utils/queryHelpers.ts) or replaced
 * in-place as ephemeral ticks (src/utils/sessionStorage.ts, src/screens/REPL.tsx).
 *
 * This file contains only type definitions with no runtime dependencies.
 */

import type { TaskType } from '../Task.js'
import type { AgentId } from './ids.js'
import type { AssistantMessage, NormalizedUserMessage } from './message.js'

// ============================================================================
// Shell tools (Bash / PowerShell)
// ============================================================================

/**
 * Per-tick fields shared by both shell backends. BashTool and PowerShellTool
 * copy these verbatim from their command generator's yields
 * (`runShellCommand` / `runPowerShellCommand`); ShellProgressMessage renders
 * them and CollapsedReadSearchContent reads elapsedTimeSeconds/totalLines.
 */
type ShellProgressFields = {
  /** Most recent output lines (the tail shown in non-verbose mode) */
  output: string
  /** Everything captured so far */
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
  /** Bytes captured while output is still incomplete; 0 or absent otherwise */
  totalBytes?: number
  /** Background task id once the command has been (auto-)backgrounded */
  taskId?: string
  /** Only present when the caller supplied an explicit timeout */
  timeoutMs?: number
}

export type BashProgress = ShellProgressFields & {
  type: 'bash_progress'
}

export type PowerShellProgress = ShellProgressFields & {
  type: 'powershell_progress'
}

/**
 * Either shell backend's progress. `!`-mode input (processBashCommand) and
 * AgentTool — which forwards a sub-agent's shell ticks to the parent so the
 * SDK still sees tool_progress — treat the two uniformly.
 */
export type ShellProgress = BashProgress | PowerShellProgress

// ============================================================================
// Sub-agent style tools (Agent / Skill)
// ============================================================================

/**
 * Progress from a synchronous sub-agent. AgentTool emits one per tool_use /
 * tool_result block the sub-agent produces (after normalizeMessages splits
 * multi-block messages), preceded by one carrying the initial user prompt.
 */
export type AgentToolProgress = {
  type: 'agent_progress'
  /** Single-block message from the sub-agent's transcript */
  message: AssistantMessage | NormalizedUserMessage
  /**
   * The sub-agent's prompt. Only meaningful on the first progress message
   * (AgentTool/UI.tsx reads progressMessages[0]); later ones carry ''.
   */
  prompt: string
  agentId: AgentId
}

/**
 * Progress from a forked skill (SkillTool with `fork` / forked slash
 * commands). Same payload as AgentToolProgress under its own discriminant so
 * transcript tooling can tell skills and agents apart.
 */
export type SkillToolProgress = {
  type: 'skill_progress'
  message: AssistantMessage | NormalizedUserMessage
  /** The rendered skill content the fork was primed with */
  prompt: string
  agentId: AgentId
}

// ============================================================================
// MCP tools
// ============================================================================

/**
 * Lifecycle + optional MCP `notifications/progress` data for an MCP tool
 * call. `status` moves started → (progress)* → completed | failed;
 * `progress`/`total`/`progressMessage` are only populated on 'progress'
 * ticks relayed from the server (see callMCPTool in services/mcp/client.ts).
 */
export type MCPProgress = {
  type: 'mcp_progress'
  status: 'started' | 'progress' | 'completed' | 'failed'
  serverName: string
  toolName: string
  /** Wall-clock duration, set on completed/failed */
  elapsedTimeMs?: number
  /** Server-reported progress counter */
  progress?: number
  /** Server-reported total, when known; drives the percentage bar */
  total?: number
  /** Server-supplied human-readable status line */
  progressMessage?: string
}

// ============================================================================
// Web search
// ============================================================================

export type WebSearchProgress =
  | {
      type: 'query_update'
      /** The query the model is currently issuing */
      query: string
    }
  | {
      type: 'search_results_received'
      resultCount: number
      /** The query those results answer */
      query: string
    }

// ============================================================================
// Background task output
// ============================================================================

/** Emitted once by TaskOutputTool while it blocks waiting on a task. */
export type TaskOutputProgress = {
  type: 'waiting_for_task'
  taskDescription: string
  taskType: TaskType
}

// ============================================================================
// REPL
// ============================================================================

/**
 * Streaming console output from a running REPL script. The primitive tool
 * calls the script makes are surfaced separately as virtual messages via
 * `newMessages` (see tools/REPLTool/primitiveTools.ts), so progress only
 * needs to carry the script's own output and elapsed time.
 */
// NOTE: REPLTool is not in-tree yet; shape mirrors shell progress so the same
// ShellProgressMessage renderer can display it.
export type REPLToolProgress = {
  type: 'repl_progress'
  output: string
  fullOutput: string
  elapsedTimeSeconds: number
  totalLines: number
}

// ============================================================================
// Sleep
// ============================================================================

/**
 * One tick per second while SleepTool waits. Ephemeral (replaced in-place by
 * REPL.tsx, never persisted) — see EPHEMERAL_PROGRESS_TYPES in sessionStorage.
 */
// NOTE: SleepTool is not in-tree yet; 'sleep_progress' is already a known
// ephemeral discriminant, so the member is defined here for it to emit.
export type SleepToolProgress = {
  type: 'sleep_progress'
  elapsedSeconds: number
  totalSeconds: number
}

// ============================================================================
// Union
// ============================================================================

/**
 * Every progress payload a tool can emit. `ProgressMessage.data` is this or
 * HookProgress (see `Progress` in src/Tool.ts); consumers discriminate on
 * `type`, and `filterToolProgressMessages` narrows by excluding
 * 'hook_progress'.
 */
export type ToolProgressData =
  | AgentToolProgress
  | SkillToolProgress
  | BashProgress
  | PowerShellProgress
  | MCPProgress
  | WebSearchProgress
  | TaskOutputProgress
  | REPLToolProgress
  | SleepToolProgress

// ============================================================================
// SDK workflow progress
// ============================================================================

export type SdkWorkflowProgressStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'

/** One phase of a workflow script, keyed by its position in the script. */
export type SdkWorkflowPhaseProgress = {
  type: 'phase'
  index: number
  name: string
  status: SdkWorkflowProgressStatus
}

/** One agent run inside a phase, keyed by its position across the workflow. */
export type SdkWorkflowAgentProgress = {
  type: 'agent'
  index: number
  /** Which phase this agent belongs to — clients group on this */
  phaseIndex: number
  description: string
  status: SdkWorkflowProgressStatus
  /** Set once the agent has been spawned */
  agentId?: string
  lastToolName?: string
  /** Short result text once the agent reaches a terminal status */
  summary?: string
}

/**
 * A delta entry in the `workflow_progress` batch of a `task_progress` SDK
 * event. Each batch carries only what changed since the last flush; clients
 * upsert entries by `${type}:${index}` and group agents by `phaseIndex` to
 * rebuild the phase tree.
 */
// NOTE: The in-tree emitter (LocalWorkflowTask) and the SDK schema for this
// field are not present yet; the shape follows the upsert/grouping contract
// documented in src/utils/sdkEventQueue.ts.
export type SdkWorkflowProgress =
  | SdkWorkflowPhaseProgress
  | SdkWorkflowAgentProgress
