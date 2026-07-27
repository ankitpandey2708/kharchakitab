/** Default Claude model to use with API keys */
export const CLAUDE_OAUTH_MODEL =
  process.env.CLAUDE_OAUTH_MODEL || "claude-sonnet-4-5-20250929";

/**
 * Standard headers for Anthropic API calls via @ai-sdk/anthropic.
 * The SDK adds Content-Type and Authorization automatically.
 */
export const CLAUDE_HEADERS = {
  "anthropic-version": "2023-06-01",
} as const;

/**
 * Headers for raw fetch calls to the Anthropic Messages API.
 * Includes the required version header.
 */
export const CLAUDE_FETCH_HEADERS = {
  ...CLAUDE_HEADERS,
} as const;


