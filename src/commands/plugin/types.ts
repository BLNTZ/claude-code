import type { LocalJSXCommandOnDone } from '../../types/command.js'

/**
 * Top-level view of the /plugin command UI.
 *
 * PluginSettings owns this state (seeded from the parsed subcommand by
 * getInitialViewState) and hands `setViewState` down to every child view so a
 * child can return to the menu or hop to a sibling view — e.g. AddMarketplace
 * switches to `browse-marketplace` for the marketplace it just added, and the
 * Errors tab navigates to `manage-plugins` / `manage-marketplaces` with a
 * pre-selected target and action.
 */
export type ViewState =
  // Root of the interactive UI; the Discover/Installed/Marketplaces tabs
  // render beneath it. Reaching `menu` with no pending result ends the command.
  | { type: 'menu' }
  // `/plugin help` — prints usage and completes.
  | { type: 'help' }
  // `/plugin validate <path>` — runs the manifest validator on a local plugin.
  | { type: 'validate'; path?: string }
  // Discover tab: every uninstalled plugin across all marketplaces.
  // `targetPlugin` jumps straight to that plugin's details.
  | { type: 'discover-plugins'; targetPlugin?: string }
  // Discover tab, scoped to one marketplace (`/plugin install <marketplace>`,
  // or after a marketplace is added). `targetPlugin` opens that plugin's details.
  | {
      type: 'browse-marketplace'
      targetMarketplace?: string
      targetPlugin?: string
    }
  // Installed tab. `targetPlugin` (optionally disambiguated by
  // `targetMarketplace`) auto-navigates to that plugin; `action` then fires
  // on it once the details view has landed.
  | {
      type: 'manage-plugins'
      targetPlugin?: string
      targetMarketplace?: string
      action?: 'enable' | 'disable' | 'uninstall'
    }
  // `/plugin marketplace` with no action — immediately redirects to `menu`.
  | { type: 'marketplace-menu' }
  // `/plugin marketplace list` — non-interactive listing that completes.
  | { type: 'marketplace-list' }
  // Add-marketplace form. `initialValue` pre-fills the source input and, when
  // it came from the CLI, triggers an automatic add.
  | { type: 'add-marketplace'; initialValue?: string }
  // Marketplaces tab. `targetMarketplace` selects that marketplace's details;
  // `action` applies the update/remove immediately.
  | {
      type: 'manage-marketplaces'
      targetMarketplace?: string
      action?: 'update' | 'remove'
    }

/**
 * Props for the PluginSettings root component of the /plugin command.
 * `/mcp` also renders it (with `args="manage"` and the MCP redirect banner)
 * now that MCP servers are managed from the Installed tab.
 */
export type PluginSettingsProps = {
  onComplete: LocalJSXCommandOnDone
  /** Raw subcommand text after `/plugin`, parsed by parsePluginArgs */
  args?: string
  /** Show the banner explaining that `/mcp` now lives in the Installed tab */
  showMcpRedirectMessage?: boolean
}
