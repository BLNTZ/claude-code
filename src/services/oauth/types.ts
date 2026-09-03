/**
 * Types for the claude.ai / Console OAuth flow and the account-level data
 * that rides along with it (profile, roles, referral program).
 *
 * Wire types (snake_case) mirror the JSON returned by the OAuth backend;
 * the camelCase types are what the CLI stores and passes around.
 */

/**
 * claude.ai subscription plan, derived from `organization_type` on the
 * profile endpoint (see `fetchProfileInfo` in client.ts). `null` everywhere
 * else means "unknown / not a subscriber".
 */
export type SubscriptionType = 'pro' | 'max' | 'team' | 'enterprise'

/**
 * Raw organization type from /api/oauth/profile. The four `claude_*` values
 * map onto {@link SubscriptionType}; anything else is treated as unknown.
 */
export type OrganizationType =
  | 'claude_pro'
  | 'claude_max'
  | 'claude_team'
  | 'claude_enterprise'
  | (string & {})

/**
 * Rate limit tier for the organization. Only the Max multipliers are
 * inspected by the CLI today; the server may return other tiers.
 */
export type RateLimitTier =
  | 'default_claude_max_5x'
  | 'default_claude_max_20x'
  | (string & {})

/**
 * How the organization is billed. The four listed values are the ones that
 * may purchase extra usage (see `isOverageProvisioningAllowed`); other
 * billing types exist server-side and pass through untouched.
 */
export type BillingType =
  | 'stripe_subscription'
  | 'stripe_subscription_contracted'
  | 'apple_subscription'
  | 'google_play_subscription'
  | (string & {})

/**
 * Response from /api/oauth/profile (bearer token) and
 * /api/claude_cli_profile (API key + account_uuid).
 */
export type OAuthProfileResponse = {
  account: {
    uuid: string
    email: string
    display_name?: string | null
    /** ISO-8601 timestamp */
    created_at?: string
    /** Only populated by /api/claude_cli_profile */
    has_claude_max?: boolean
    /** Only populated by /api/claude_cli_profile */
    has_claude_pro?: boolean
  }
  organization: {
    uuid: string
    organization_type?: OrganizationType | null
    rate_limit_tier?: RateLimitTier | null
    has_extra_usage_enabled?: boolean | null
    billing_type?: BillingType | null
    /** ISO-8601 timestamp */
    subscription_created_at?: string | null
  }
}

/**
 * Response from the token endpoint for both the authorization_code and
 * refresh_token grants.
 */
export type OAuthTokenExchangeResponse = {
  access_token: string
  refresh_token: string
  /** Seconds until `access_token` expires */
  expires_in: number
  /** Space-separated scopes actually granted */
  scope?: string
  token_type?: string
  /** Present on the authorization_code grant; used as a profile fallback */
  account?: {
    uuid: string
    email_address: string
  }
  organization?: {
    uuid: string
  }
}

/**
 * Response from the roles endpoint (`getOauthConfig().ROLES_URL`).
 */
export type UserRolesResponse = {
  organization_role: string | null
  workspace_role: string | null
  organization_name: string | null
}

/**
 * OAuth credentials as stored in secure storage under `claudeAiOauth` and
 * returned by `getClaudeAIOAuthTokens()`.
 *
 * `refreshToken` / `expiresAt` are `null` for inference-only tokens that come
 * from `CLAUDE_CODE_OAUTH_TOKEN` or a file descriptor — those are never
 * persisted or refreshed.
 */
export type OAuthTokens = {
  accessToken: string
  refreshToken: string | null
  /** Epoch milliseconds */
  expiresAt: number | null
  scopes: string[]
  subscriptionType: SubscriptionType | null
  rateLimitTier: RateLimitTier | null
  /**
   * Profile fetched while acquiring the token. Lets `installOAuthTokens`
   * skip a second /api/oauth/profile round-trip. Not persisted.
   */
  profile?: OAuthProfileResponse
  /**
   * Account info from the token exchange response. Used to populate
   * `oauthAccount` when the profile endpoint is unavailable. Not persisted.
   */
  tokenAccount?: {
    uuid: string
    emailAddress: string
    organizationUuid: string | undefined
  }
}

/**
 * Referral campaign identifier. `claude_code_guest_pass` is the default;
 * the eligibility endpoint may hand back a different campaign to use for
 * subsequent redemption lookups.
 */
export type ReferralCampaign = 'claude_code_guest_pass' | (string & {})

/**
 * Reward granted to the referrer when a referred user subscribes.
 * Amounts are in minor currency units (e.g. cents for USD).
 */
export type ReferrerRewardInfo = {
  currency: string
  amount_minor_units: number
}

export type ReferralCodeDetails = {
  /** Shareable link the user copies from /passes */
  referral_link?: string
  campaign?: ReferralCampaign
}

/**
 * Response from /api/oauth/organizations/{org}/referral/eligibility.
 * Cached per org in `GlobalConfig.passesEligibilityCache` with a timestamp.
 */
export type ReferralEligibilityResponse = {
  eligible: boolean
  referral_code_details?: ReferralCodeDetails | null
  /** Present for campaigns that reward the referrer (v1 guest passes) */
  referrer_reward?: ReferrerRewardInfo | null
  remaining_passes?: number | null
}

/**
 * A single redeemed guest pass. Only its presence is inspected by the CLI —
 * a slot with a redemption is shown as used.
 */
// NOTE: assumed shape — callers only check whether an entry exists.
export type ReferralRedemption = {
  /** ISO-8601 timestamp */
  redeemed_at?: string
}

/**
 * Response from /api/oauth/organizations/{org}/referral/redemptions.
 */
export type ReferralRedemptionsResponse = {
  redemptions?: ReferralRedemption[]
  /** Maximum number of passes for this campaign (defaults to 3 in the UI) */
  limit?: number
}
