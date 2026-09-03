/**
 * GitHub Actions workflows the /install-github-app command can add to a repo.
 * - `claude`: the @claude mention workflow (.github/workflows/claude.yml)
 * - `claude-review`: automated PR review (.github/workflows/claude-code-review.yml)
 */
export type Workflow = 'claude' | 'claude-review'

/**
 * A non-fatal problem found while checking prerequisites (gh CLI missing,
 * not authenticated, repo not detected, ...). Shown by WarningsStep, which
 * lets the user continue anyway.
 */
export type Warning = {
  title: string
  message: string
  /** Suggested fixes, rendered as a bulleted list; may be empty */
  instructions: string[]
}

/** Which screen of the install wizard is showing. */
export type Step =
  | 'check-gh'
  | 'warnings'
  | 'choose-repo'
  | 'install-app'
  | 'check-existing-workflow'
  | 'select-workflows'
  | 'check-existing-secret'
  | 'api-key'
  | 'oauth-flow'
  | 'creating'
  | 'success'
  | 'error'

/** Full state of the /install-github-app wizard. */
export type State = {
  step: Step
  /** `owner/repo` the workflow will be installed into */
  selectedRepoName: string
  /** `owner/repo` detected from the current git remote, or '' if none */
  currentRepo: string
  useCurrentRepo: boolean
  /** API key or OAuth token to store as the repository secret */
  apiKeyOrOAuthToken: string
  /** Reuse the API key already configured locally */
  useExistingKey: boolean
  /** Index into CreatingStep's progress list */
  currentWorkflowInstallStep: number
  warnings: Warning[]
  /** The repository already has a secret named `secretName` */
  secretExists: boolean
  /** Repository secret to create, e.g. ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN */
  secretName: string
  /** Keep the existing repository secret instead of overwriting it */
  useExistingSecret: boolean
  /** A Claude workflow file already exists in the repository */
  workflowExists: boolean
  /** What to do about an existing workflow file; unset until the user chooses */
  workflowAction?: 'update' | 'skip'
  selectedWorkflows: Workflow[]
  selectedApiKeyOption: 'existing' | 'new' | 'oauth'
  authType: 'api_key' | 'oauth_token'
  /** Set when `step` is `error` */
  error?: string
  errorReason?: string
  errorInstructions?: string[]
}
