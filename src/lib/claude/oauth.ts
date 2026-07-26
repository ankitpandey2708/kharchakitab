import crypto from "node:crypto";

export function generatePKCE() {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

/** Generate a cryptographically random state value for CSRF protection */
export function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Claude Code's OAuth client ID (public client — no secret needed) */
export const CLAUDE_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";

/** The hosted redirect URI that Claude shows the auth code on */
export const CLAUDE_HOSTED_REDIRECT =
  "https://console.anthropic.com/oauth/code/callback";

export const CLAUDE_AUTH_URL = "https://claude.ai/oauth/authorize";
export const CLAUDE_TOKEN_URL = "https://console.anthropic.com/v1/oauth/token";
const CLAUDE_SCOPES = ["user:profile", "user:inference"];

/** Scopes formatted as a space-separated string for the OAuth request */
export const CLAUDE_SCOPES_STRING = CLAUDE_SCOPES.join(" ");

/** Cookie names for the OAuth flow */
export const COOKIE_CLAUDE_PKCE_VERIFIER = "claude_pkce_verifier";
export const COOKIE_CLAUDE_OAUTH_STATE = "claude_oauth_state";
export const COOKIE_CLAUDE_ACCESS_TOKEN = "claude_access_token";
export const COOKIE_CLAUDE_REFRESH_TOKEN = "claude_refresh_token";
export const COOKIE_CLAUDE_ORG_UUID = "claude_org_uuid";
export const COOKIE_CLAUDE_ACCOUNT_EMAIL = "claude_account_email";
export const COOKIE_CLAUDE_SCOPES = "claude_scopes";
export const COOKIE_CLAUDE_TOKEN_EXPIRES_AT = "claude_token_expires_at";

/** Cookie TTLs */
export const OAUTH_COOKIE_MAX_AGE = 600; // 10 minutes
const TOKEN_COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days (tokens can be refreshed)

/** Default Claude model to use with OAuth tokens */
export const CLAUDE_OAUTH_MODEL =
  process.env.CLAUDE_OAUTH_MODEL || "claude-sonnet-4-5-20250929";

/**
 * Required prefix for the system prompt when using Claude via OAuth.
 * The API validates that the prompt starts with this exact string.
 * Defined here so all routes (agent, parse, receipt) can import without
 * depending on the agent config module.
 */
const CLAUDE_SYSTEM_PROMPT_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude.";

/** Headers for @ai-sdk/anthropic SDK calls (config.ts, parse/route.ts). */
export const CLAUDE_HEADERS = {
  "anthropic-beta": "oauth-2025-04-20,claude-code-20250219",
} as const;

/** Headers for raw fetch calls (receipt/route.ts). Includes the required version header. */
export const CLAUDE_FETCH_HEADERS = {
  ...CLAUDE_HEADERS,
  "anthropic-version": "2023-06-01",
} as const;

/**
 * Prefix a prompt with the required Claude Code system prompt prefix.
 * The API validates that the system message starts with this exact string.
 */
export function buildClaudePrompt(prompt: string): string {
  return `${CLAUDE_SYSTEM_PROMPT_PREFIX}\n\n${prompt}`;
}

export interface TokenResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  organization: { uuid: string; name: string };
  account: { uuid: string; email_address: string };
}

/** Shared cookie options for setting tokens */
export const TOKEN_COOKIE_PROPS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: TOKEN_COOKIE_MAX_AGE,
  path: "/",
};

/**
 * Set all Claude token cookies on a response from a token response.
 */
export function setTokenCookies(
  res: { cookies: { set: (name: string, value: string, opts: Record<string, unknown>) => void } },
  tokenData: TokenResponse,
): void {
  const expiresAt = Math.floor(Date.now() / 1000) + tokenData.expires_in;

  res.cookies.set(COOKIE_CLAUDE_ACCESS_TOKEN, tokenData.access_token, TOKEN_COOKIE_PROPS);
  res.cookies.set(COOKIE_CLAUDE_REFRESH_TOKEN, tokenData.refresh_token, TOKEN_COOKIE_PROPS);
  res.cookies.set(COOKIE_CLAUDE_ORG_UUID, tokenData.organization.uuid, TOKEN_COOKIE_PROPS);
  res.cookies.set(COOKIE_CLAUDE_ACCOUNT_EMAIL, tokenData.account.email_address, TOKEN_COOKIE_PROPS);
  res.cookies.set(COOKIE_CLAUDE_SCOPES, tokenData.scope, TOKEN_COOKIE_PROPS);
  res.cookies.set(COOKIE_CLAUDE_TOKEN_EXPIRES_AT, String(expiresAt), TOKEN_COOKIE_PROPS);
}


