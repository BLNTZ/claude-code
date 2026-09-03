import type { z } from 'zod/v4'
import type { LspServerConfigSchema } from '../../utils/plugins/schemas.js'
import type { ConfigScope } from '../mcp/types.js'

/**
 * A single LSP server definition as declared by a plugin (`.lsp.json` or
 * `manifest.lspServers`). Derived from the validating schema so the type
 * can't drift from what plugins are allowed to write:
 *
 * - `command` / `args` / `env` — how to spawn the server (stdio)
 * - `extensionToLanguage` — `{ '.ts': 'typescript' }`; file routing and
 *   `languageId` for didOpen are both derived from this map
 * - `initializationOptions` / `settings` — passed through to the server
 * - `workspaceFolder` — overrides cwd for the server and its root URI
 * - `startupTimeout` / `maxRestarts` — lifecycle limits honored by
 *   LSPServerInstance; `shutdownTimeout` / `restartOnCrash` are accepted by
 *   the schema but rejected at instance creation until implemented
 */
export type LspServerConfig = z.infer<ReturnType<typeof LspServerConfigSchema>>

/**
 * An LSP server config after plugin loading has resolved `${VAR}` /
 * `${CLAUDE_PLUGIN_ROOT}` references and namespaced it as
 * `plugin:<pluginName>:<serverName>`. Mirrors ScopedMcpServerConfig.
 */
export type ScopedLspServerConfig = LspServerConfig & {
  /** Always 'dynamic' for plugin-provided servers */
  scope: ConfigScope
  /** Name of the plugin that provides this server */
  source: string
}

/**
 * Lifecycle state of an LSPServerInstance.
 *
 * stopped → starting → running → stopping → stopped; any state may move to
 * `error` (spawn failure, init timeout, crash), from which `start()` retries.
 */
export type LspServerState =
  | 'stopped'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'error'
