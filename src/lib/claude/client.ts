import { createAnthropic } from "@ai-sdk/anthropic";
import { cookies } from "next/headers";
import {
  CLAUDE_CLIENT_ID,
  CLAUDE_TOKEN_URL,
  CLAUDE_HEADERS,
  TOKEN_COOKIE_PROPS,
  COOKIE_CLAUDE_ACCESS_TOKEN,
  COOKIE_CLAUDE_REFRESH_TOKEN,
  COOKIE_CLAUDE_TOKEN_EXPIRES_AT,
} from "./oauth";

/**
 * Create an Anthropic SDK client configured with an OAuth token.
 * Adds the required beta headers automatically.
 */
export function createClaudeClient(token: string) {
  return createAnthropic({
    authToken: token,
    headers: CLAUDE_HEADERS,
  });
}

interface FreshTokenResult {
  token: string | null;
  /**
   * Non-null when the token was just refreshed.
   * The caller MUST set these cookies on their response.
   */
  refreshedTokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
}

/**
 * Read the Claude OAuth access token from cookies, auto-refreshing if
 * expired or close to expiry. Returns the token (or null if none found)
 * and optionally fresh tokens the caller must persist on the response.
 */
export async function getFreshClaudeToken(): Promise<FreshTokenResult> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_CLAUDE_ACCESS_TOKEN)?.value;
  if (!token) return { token: null };

  // Check expiry (5-minute grace period)
  const expiresAtStr = cookieStore.get(COOKIE_CLAUDE_TOKEN_EXPIRES_AT)?.value;
  const expired =
    !expiresAtStr ||
    Number.isNaN(parseInt(expiresAtStr, 10)) ||
    Date.now() / 1000 >= parseInt(expiresAtStr, 10) - 300;

  if (expired) {
    const refreshToken = cookieStore.get(COOKIE_CLAUDE_REFRESH_TOKEN)?.value;
    if (refreshToken) {
      try {
        const res = await fetch(CLAUDE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: CLAUDE_CLIENT_ID,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            access_token: string;
            refresh_token: string;
            expires_in: number;
          };
          return {
            token: data.access_token,
            refreshedTokens: {
              accessToken: data.access_token,
              refreshToken: data.refresh_token,
              expiresIn: data.expires_in,
            },
          };
        }
      } catch {
        void 0; // Refresh failed — fall through to return original token
      }
    }
  }

  return { token };
}

/**
 * Set refreshed Claude OAuth token cookies on a response-like object.
 * Only call this when `FreshTokenResult.refreshedTokens` is non-null.
 */
export function setClaudeRefreshedCookies(
  res: {
    cookies: {
      set: (
        name: string,
        value: string,
        opts: Record<string, unknown>,
      ) => void;
    };
  },
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
): void {
  const expiresAt = Math.floor(Date.now() / 1000) + tokens.expiresIn;
  res.cookies.set(COOKIE_CLAUDE_ACCESS_TOKEN, tokens.accessToken, TOKEN_COOKIE_PROPS);
  res.cookies.set(COOKIE_CLAUDE_REFRESH_TOKEN, tokens.refreshToken, TOKEN_COOKIE_PROPS);
  res.cookies.set(COOKIE_CLAUDE_TOKEN_EXPIRES_AT, String(expiresAt), TOKEN_COOKIE_PROPS);
}
