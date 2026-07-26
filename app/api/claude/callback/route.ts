import { NextRequest, NextResponse } from "next/server";
import {
  CLAUDE_CLIENT_ID,
  CLAUDE_TOKEN_URL,
  CLAUDE_HOSTED_REDIRECT,
  COOKIE_CLAUDE_PKCE_VERIFIER,
  COOKIE_CLAUDE_OAUTH_STATE,
  setTokenCookies,
} from "@/src/lib/claude/oauth";

interface TokenResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
  refresh_token: string;
  scope: string;
  organization: { uuid: string; name: string };
  account: { uuid: string; email_address: string };
}

/**
 * POST /api/claude/callback
 *
 * Exchanges an OAuth authorization code for tokens.
 * The code comes from the user after they authenticate on claude.ai
 * and are redirected to console.anthropic.com where the code is displayed.
 *
 * Expected body (JSON):
 *   { "code": "<full_code>#<state>" }   (the code displayed on the hosted redirect page)
 *
 * Alternative body (when our own callback URL works):
 *   { "code": "<auth_code>", "state": "<state>" }
 */
export async function POST(request: NextRequest) {
  const headers = { "Content-Type": "application/json" };

  try {
    const { code: rawCode } = (await request.json()) as { code: string };

    if (!rawCode) {
      return NextResponse.json(
        { error: "Missing authorization code" },
        { status: 400, headers },
      );
    }

    // The code from the hosted redirect page is in format: {authorization_code}#{state}
    let authCode: string;
    let returnedState: string | null = null;

    const hashIdx = rawCode.indexOf("#");
    if (hashIdx !== -1) {
      authCode = rawCode.slice(0, hashIdx);
      returnedState = rawCode.slice(hashIdx + 1);
    } else {
      authCode = rawCode;
    }

    // Validate state from cookie (CSRF protection)
    const storedState = request.cookies.get(COOKIE_CLAUDE_OAUTH_STATE)?.value;
    if (storedState) {
      if (!returnedState || returnedState !== storedState) {
        return NextResponse.json(
          { error: "State mismatch — CSRF prevented. Please try again." },
          { status: 403, headers },
        );
      }
    }

    // Get the PKCE verifier from cookie
    const codeVerifier = request.cookies.get(COOKIE_CLAUDE_PKCE_VERIFIER)?.value;
    if (!codeVerifier) {
      return NextResponse.json(
        { error: "Missing PKCE verifier. Please start the authorization flow again." },
        { status: 400, headers },
      );
    }

    // Exchange the auth code for tokens
    // Must use the same redirect_uri that was in the authorization request
    const tokenRes = await fetch(CLAUDE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: authCode,
        state: returnedState,
        client_id: CLAUDE_CLIENT_ID,
        redirect_uri: CLAUDE_HOSTED_REDIRECT,
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errorBody = await tokenRes.text().catch(() => "");
      return NextResponse.json(
        {
          error: `Token exchange failed: ${tokenRes.status}`,
          detail: errorBody,
        },
        { status: tokenRes.status, headers },
      );
    }

    const tokenData = (await tokenRes.json()) as TokenResponse;

    // Store tokens in httpOnly cookies
    const res = NextResponse.json({
      ok: true,
      organization: tokenData.organization.name,
      email: tokenData.account.email_address,
      scopes: tokenData.scope,
    });

    setTokenCookies(res, tokenData);

    // Clean up OAuth flow cookies
    res.cookies.delete(COOKIE_CLAUDE_PKCE_VERIFIER);
    res.cookies.delete(COOKIE_CLAUDE_OAUTH_STATE);

    return res;
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Token exchange failed",
      },
      { status: 500, headers },
    );
  }
}
