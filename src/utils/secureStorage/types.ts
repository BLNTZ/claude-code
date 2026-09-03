import type { OAuthTokens } from '../../services/oauth/types.js'

/**
 * OAuth discovery results cached per MCP server so re-auth and refresh can
 * locate the authorization server without re-probing.
 *
 * Only URLs are persisted. The full metadata blobs
 * (`resourceMetadata` / `authorizationServerMetadata`) were written by older
 * versions and blew past the macOS `security -i` stdin limit (#30337); they
 * are stripped on every write but may still be present on read.
 */
export type McpOAuthDiscoveryState = {
  authorizationServerUrl?: string
  resourceMetadataUrl?: string
  /** @deprecated legacy field, no longer written */
  resourceMetadata?: unknown
  /** @deprecated legacy field, no longer written */
  authorizationServerMetadata?: unknown
}

/**
 * Stored OAuth state for one MCP server, keyed by
 * `getServerKey(serverName, serverConfig)`.
 *
 * `accessToken` is `''` and `expiresAt` is `0` for entries that only hold
 * client registration or discovery state (no token yet).
 */
export type McpOAuthTokenData = {
  serverName: string
  serverUrl: string
  accessToken: string
  refreshToken?: string
  /** Epoch milliseconds */
  expiresAt: number
  /** Space-separated scopes granted with the current token */
  scope?: string
  /** Dynamic client registration result (or XAA-registered client) */
  clientId?: string
  clientSecret?: string
  /** Scope requested by a 403 insufficient_scope response, kept for re-auth */
  stepUpScope?: string
  discoveryState?: McpOAuthDiscoveryState
}

/**
 * Everything that lives in the secure credential store (macOS keychain
 * entry or `~/.claude/.credentials.json`). The whole object is read and
 * written atomically, so keep it small — the keychain write path has a
 * ~2KB budget (see macOsKeychainStorage.ts).
 */
export type SecureStorageData = {
  /** claude.ai / Console login tokens */
  claudeAiOauth?: OAuthTokens
  /** Per-MCP-server OAuth tokens and client registration */
  mcpOAuth?: Record<string, McpOAuthTokenData>
  /** Pre-configured MCP client secrets (`claude mcp add ... --client-secret`) */
  mcpOAuthClientConfig?: Record<string, { clientSecret?: string }>
  /** Cached XAA IdP id_tokens, keyed by normalized issuer */
  mcpXaaIdp?: Record<string, { idToken: string; expiresAt: number }>
  /** XAA IdP client secrets, keyed by normalized issuer */
  mcpXaaIdpConfig?: Record<string, { clientSecret: string }>
  /**
   * Sensitive plugin options, keyed by plugin id (`name@marketplace`) or
   * `${pluginId}/${serverName}` for per-MCP-server user config.
   */
  pluginSecrets?: Record<string, Record<string, string>>
  /** Trusted device token for bridge / remote control auth */
  trustedDeviceToken?: string
}

/**
 * A backend for {@link SecureStorageData}. `read`/`update`/`delete` are
 * synchronous because callers run in sync contexts (memoized token getters,
 * config helpers); `readAsync` exists for hot paths that must not block on a
 * keychain subprocess.
 */
export type SecureStorage = {
  /** Backend identifier used in analytics (e.g. 'keychain', 'plaintext') */
  name: string
  /** Returns `null` when nothing is stored or the store is unreadable */
  read(): SecureStorageData | null
  readAsync(): Promise<SecureStorageData | null>
  /** Replaces the stored data. `warning` surfaces degraded storage to the user. */
  update(data: SecureStorageData): { success: boolean; warning?: string }
  /** Removes all stored data. Returns `true` if nothing remains. */
  delete(): boolean
}
