import { NextRequest, NextResponse } from "next/server";
import { generatePKCE, SWIGGY_AUTH_URL, getAppOrigin, getSwiggyClientId, getSwiggyRedirectUri } from "@/src/lib/swiggy/oauth";
import { isMockMode } from "@/src/lib/swiggy/client";
import crypto from "node:crypto";

export async function GET(request: NextRequest) {
  const origin = getAppOrigin(request);

  if (isMockMode()) {
    const res = NextResponse.redirect(`${origin}/api/swiggy/callback?mock=true`);
    return res;
  }

  const redirectUri = getSwiggyRedirectUri(request);

  let clientId: string;
  try {
    clientId = await getSwiggyClientId(redirectUri);
  } catch (e) {
    console.error("Swiggy client registration failed", e);
    return NextResponse.redirect(`${origin}/?swiggy_error=registration_failed`);
  }

  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = crypto.randomBytes(16).toString("hex");

  const url = new URL(SWIGGY_AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("scope", "mcp:tools");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url.toString());
  res.cookies.set("swiggy_pkce_verifier", codeVerifier, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  res.cookies.set("swiggy_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}
