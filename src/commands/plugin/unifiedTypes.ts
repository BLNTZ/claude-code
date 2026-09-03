import type {
  ConfigScope,
  MCPServerConnection,
} from '../../services/mcp/types.js'
import type { LoadedPlugin, PluginError } from '../../types/plugin.js'
import type { PersistablePluginScope } from '../../utils/plugins/pluginIdentifier.js'

/**
 * Scope a loaded plugin is displayed under in the Installed tab: any persisted
 * install scope, or `builtin` for plugins bundled with Claude Code.
 */
export type InstalledPluginScope = PersistablePluginScope | 'builtin'

/** Connection state of an MCP server row, derived from MCPServerConnection.type */
export type UnifiedMcpStatus =
  | 'connected'
  | 'disabled'
  | 'pending'
  | 'needs-auth'
  | 'failed'

/** A successfully loaded plugin (enabled or disabled). */
export type UnifiedPluginItem = {
  type: 'plugin'
  /** `${name}@${marketplace}` */
  id: string
  name: string
  description?: string
  marketplace: string
  scope: InstalledPluginScope
  isEnabled: boolean
  errorCount: number
  errors: PluginError[]
  plugin: LoadedPlugin
  /** Enable/disable toggle queued in the pending-changes model */
  pendingEnable?: boolean
  /** Marked for update in the pending-changes model */
  pendingUpdate?: boolean
  /** Toggle already applied on disk but not yet reloaded into the session */
  pendingToggle?: 'will-enable' | 'will-disable'
}

/**
 * A plugin recorded in settings whose load failed entirely, so there is no
 * LoadedPlugin to show — only the errors attributed to its identifier.
 */
export type UnifiedFailedPluginItem = {
  type: 'failed-plugin'
  id: string
  name: string
  marketplace: string
  scope: PersistablePluginScope
  errorCount: number
  errors: PluginError[]
}

/**
 * A plugin flagged in user settings (e.g. delisted from its marketplace).
 * Always grouped under the synthetic `flagged` scope at the top of the list.
 */
export type UnifiedFlaggedPluginItem = {
  type: 'flagged-plugin'
  id: string
  name: string
  marketplace: string
  scope: 'flagged'
  /** Machine-readable reason, e.g. `delisted` */
  reason: string
  /** Human-readable explanation shown in the flagged-detail view */
  text: string
  /** ISO timestamp of when the plugin was flagged */
  flaggedAt: string
}

/**
 * An MCP server. Standalone servers use their own config scope; servers that
 * belong to a plugin are listed right after it with `indented` set and inherit
 * the plugin's scope (built-in plugins display their servers under `user`).
 */
export type UnifiedMcpItem = {
  type: 'mcp'
  /** `mcp:${serverName}` */
  id: string
  name: string
  description?: string
  scope: ConfigScope
  status: UnifiedMcpStatus
  client: MCPServerConnection
  /** True when this server is a child of the plugin row above it */
  indented?: boolean
}

/**
 * One row of the unified Installed tab in /plugin, which merges plugins and
 * MCP servers into a single scope-grouped list. Discriminated on `type`;
 * every variant carries `id`, `name` and `scope` so the list can be keyed,
 * searched and grouped without narrowing.
 */
export type UnifiedInstalledItem =
  | UnifiedPluginItem
  | UnifiedFailedPluginItem
  | UnifiedFlaggedPluginItem
  | UnifiedMcpItem
