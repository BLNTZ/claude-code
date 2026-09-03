/**
 * Core types for the keybinding system.
 *
 * Keybindings are configured as blocks of `keystroke → action` entries scoped
 * to a UI context (`KeybindingBlock`), then flattened into `ParsedBinding`s.
 * A keystroke string like "ctrl+shift+k" parses into a `ParsedKeystroke`; a
 * space-separated sequence like "ctrl+k ctrl+s" is a `Chord`.
 *
 * See parser.ts for parsing, match.ts/resolver.ts for matching, and
 * schema.ts for the user-facing JSON schema of ~/.claude/keybindings.json.
 */

/**
 * UI contexts in which keybindings can be active.
 *
 * Contexts are registered while a component is mounted (see
 * useRegisterKeybindingContext) and take precedence over Global bindings.
 * Must stay in sync with KEYBINDING_CONTEXTS in schema.ts and VALID_CONTEXTS
 * in validate.ts. `Scroll` and `MessageActions` are bound only from code
 * (defaultBindings.ts) and are not exposed in the user config schema.
 */
export type KeybindingContextName =
  | 'Global'
  | 'Chat'
  | 'Autocomplete'
  | 'Confirmation'
  | 'Help'
  | 'Transcript'
  | 'HistorySearch'
  | 'Task'
  | 'ThemePicker'
  | 'Settings'
  | 'Tabs'
  | 'Attachments'
  | 'Footer'
  | 'MessageSelector'
  | 'DiffDialog'
  | 'ModelPicker'
  | 'Select'
  | 'Plugin'
  | 'Scroll'
  | 'MessageActions'

/**
 * A binding that runs a slash command as if it were typed, e.g.
 * "command:help" or "command:compact". Only valid in the Chat context.
 */
export type CommandKeybindingAction = `command:${string}`

/**
 * Action identifiers that keystrokes can be bound to, namespaced as
 * `area:action`.
 *
 * Handlers are registered by plain string (useKeybinding/useKeybindings), so
 * this union exists for call sites that name a specific action — shortcut
 * hints, permission prompt options — to catch typos at compile time. It is
 * the compile-time counterpart of KEYBINDING_ACTIONS in schema.ts, plus
 * actions bound only from code (scroll:*, selection:copy, messageActions:*)
 * and open-ended command bindings.
 */
export type KeybindingAction =
  // App-level actions (Global context)
  | 'app:interrupt'
  | 'app:exit'
  | 'app:toggleTodos'
  | 'app:toggleTranscript'
  | 'app:toggleBrief'
  | 'app:toggleTeammatePreview'
  | 'app:toggleTerminal'
  | 'app:redraw'
  | 'app:globalSearch'
  | 'app:quickOpen'
  // History navigation
  | 'history:search'
  | 'history:previous'
  | 'history:next'
  // Chat input actions
  | 'chat:cancel'
  | 'chat:killAgents'
  | 'chat:cycleMode'
  | 'chat:modelPicker'
  | 'chat:fastMode'
  | 'chat:thinkingToggle'
  | 'chat:submit'
  | 'chat:newline'
  | 'chat:undo'
  | 'chat:externalEditor'
  | 'chat:stash'
  | 'chat:imagePaste'
  | 'chat:messageActions'
  // Autocomplete menu actions
  | 'autocomplete:accept'
  | 'autocomplete:dismiss'
  | 'autocomplete:previous'
  | 'autocomplete:next'
  // Confirmation dialog actions
  | 'confirm:yes'
  | 'confirm:no'
  | 'confirm:previous'
  | 'confirm:next'
  | 'confirm:nextField'
  | 'confirm:previousField'
  | 'confirm:cycleMode'
  | 'confirm:toggle'
  | 'confirm:toggleExplanation'
  // Tabs navigation actions
  | 'tabs:next'
  | 'tabs:previous'
  // Transcript viewer actions
  | 'transcript:toggleShowAll'
  | 'transcript:exit'
  // History search actions
  | 'historySearch:next'
  | 'historySearch:accept'
  | 'historySearch:cancel'
  | 'historySearch:execute'
  // Task/agent actions
  | 'task:background'
  // Theme picker actions
  | 'theme:toggleSyntaxHighlighting'
  // Help menu actions
  | 'help:dismiss'
  // Attachment navigation (select dialog image attachments)
  | 'attachments:next'
  | 'attachments:previous'
  | 'attachments:remove'
  | 'attachments:exit'
  // Footer indicator actions
  | 'footer:up'
  | 'footer:down'
  | 'footer:next'
  | 'footer:previous'
  | 'footer:openSelected'
  | 'footer:clearSelection'
  | 'footer:close'
  // Message selector (rewind) actions
  | 'messageSelector:up'
  | 'messageSelector:down'
  | 'messageSelector:top'
  | 'messageSelector:bottom'
  | 'messageSelector:select'
  // Message actions overlay (MESSAGE_ACTIONS feature)
  | 'messageActions:prev'
  | 'messageActions:next'
  | 'messageActions:top'
  | 'messageActions:bottom'
  | 'messageActions:prevUser'
  | 'messageActions:nextUser'
  | 'messageActions:escape'
  | 'messageActions:ctrlc'
  | 'messageActions:enter'
  | 'messageActions:c'
  | 'messageActions:p'
  // Diff dialog actions
  | 'diff:dismiss'
  | 'diff:previousSource'
  | 'diff:nextSource'
  | 'diff:back'
  | 'diff:viewDetails'
  | 'diff:previousFile'
  | 'diff:nextFile'
  // Model picker actions (ant-only)
  | 'modelPicker:decreaseEffort'
  | 'modelPicker:increaseEffort'
  // Select component actions (distinct from confirm: to avoid collisions)
  | 'select:next'
  | 'select:previous'
  | 'select:accept'
  | 'select:cancel'
  // Plugin dialog actions
  | 'plugin:toggle'
  | 'plugin:install'
  // Permission dialog actions
  | 'permission:toggleDebug'
  // Settings config panel actions
  | 'settings:search'
  | 'settings:retry'
  | 'settings:close'
  // Voice actions
  | 'voice:pushToTalk'
  // Scroll actions (ScrollBox / ScrollKeybindingHandler)
  | 'scroll:pageUp'
  | 'scroll:pageDown'
  | 'scroll:halfPageUp'
  | 'scroll:halfPageDown'
  | 'scroll:fullPageUp'
  | 'scroll:fullPageDown'
  | 'scroll:lineUp'
  | 'scroll:lineDown'
  | 'scroll:top'
  | 'scroll:bottom'
  // Mouse selection actions
  | 'selection:copy'
  // Slash command bindings (Chat context only)
  | CommandKeybindingAction

/**
 * A block of keybindings for one context, as written in keybindings.json
 * and in DEFAULT_BINDINGS.
 */
export type KeybindingBlock = {
  /** UI context in which these bindings apply */
  context: KeybindingContextName
  /**
   * Map of keystroke pattern to action. Keys are keystroke strings such as
   * "ctrl+k", "shift+tab", or a chord like "ctrl+x ctrl+k". A `null` value
   * unbinds an earlier (default) binding for that keystroke.
   *
   * Values are plain strings rather than KeybindingAction: user config is
   * read from JSON and validated separately (validate.ts), and `command:*`
   * bindings are open-ended.
   */
  bindings: Record<string, string | null>
}

/**
 * A single keystroke with its modifiers, parsed from a string like
 * "ctrl+shift+k" (see parseKeystroke in parser.ts).
 */
export type ParsedKeystroke = {
  /**
   * Normalized key name: a single lowercase character, ' ' for space, or a
   * named key such as 'escape', 'enter', 'tab', 'backspace', 'delete', 'up',
   * 'down', 'left', 'right', 'pageup', 'pagedown', 'home', 'end', 'wheelup',
   * 'wheeldown'.
   */
  key: string
  ctrl: boolean
  /**
   * Alt/Option. Terminals cannot distinguish alt from meta (both arrive as
   * an escape prefix), so matching treats `alt` and `meta` as one modifier.
   */
  alt: boolean
  shift: boolean
  /** Meta — an alias of `alt` for matching purposes (see match.ts) */
  meta: boolean
  /**
   * Super (cmd on macOS, win elsewhere). Distinct from alt/meta; only
   * delivered by terminals using the kitty keyboard protocol.
   */
  super: boolean
}

/**
 * A chord is a sequence of one or more keystrokes that must be pressed in
 * order, e.g. "ctrl+k ctrl+s". Single-key bindings are one-element chords.
 */
export type Chord = ParsedKeystroke[]

/**
 * A single parsed binding: the chord that triggers it, the action it maps
 * to, and the context it applies in. Bindings are matched in order with the
 * last match winning, which is how user bindings override defaults.
 */
export type ParsedBinding = {
  chord: Chord
  /**
   * Action to trigger, or `null` when this entry unbinds an earlier binding
   * for the same chord in the same context.
   */
  action: string | null
  context: KeybindingContextName
}
