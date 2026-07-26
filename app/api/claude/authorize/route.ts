import { NextResponse } from "next/server";
import {
  generatePKCE,
  generateState,
  CLAUDE_CLIENT_ID,
  CLAUDE_AUTH_URL,
  CLAUDE_HOSTED_REDIRECT,
  CLAUDE_SCOPES_STRING,
  COOKIE_CLAUDE_PKCE_VERIFIER,
  COOKIE_CLAUDE_OAUTH_STATE,
  OAUTH_COOKIE_MAX_AGE,
} from "@/src/lib/claude/oauth";

export async function GET() {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = generateState();

  // Use the hosted redirect URI (console.anthropic.com) — the user copies the
  // displayed code and pastes it back into the app. This works universally
  // since Claude Code's registered redirects may not include arbitrary origins.
  const redirectUri = CLAUDE_HOSTED_REDIRECT;

  const url = new URL(CLAUDE_AUTH_URL);
  url.searchParams.set("client_id", CLAUDE_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", CLAUDE_SCOPES_STRING);
  url.searchParams.set("state", state);

  const res = NextResponse.json({
    authUrl: url.toString(),
    redirectUri,
  });

  res.cookies.set(COOKIE_CLAUDE_PKCE_VERIFIER, codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: "/",
  });
  res.cookies.set(COOKIE_CLAUDE_OAUTH_STATE, state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: OAUTH_COOKIE_MAX_AGE,
    path: "/",
  });

  return res;
}
