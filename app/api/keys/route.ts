import { NextRequest, NextResponse } from "next/server";
import {
  COOKIE_ANTHROPIC_API_KEY,
  COOKIE_GEMINI_API_KEY,
} from "@/src/lib/keys";

const KEY_COOKIE_PROPS = {
  httpOnly: true,
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365, // 1 year
  path: "/",
};

const VALID_PROVIDERS = ["anthropic", "gemini"] as const;
type Provider = (typeof VALID_PROVIDERS)[number];

function cookieNameFor(provider: Provider): string {
  return provider === "anthropic" ? COOKIE_ANTHROPIC_API_KEY : COOKIE_GEMINI_API_KEY;
}

/**
 * GET /api/keys
 *
 * Returns which API keys are configured (without exposing the keys themselves).
 */
export async function GET() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  const configured: Array<{ provider: Provider; configured: boolean; source: string }> = [];

  const hasAnthropicCookie = !!cookieStore.get(COOKIE_ANTHROPIC_API_KEY)?.value;
  const hasAnthropicEnv = !!process.env.ANTHROPIC_API_KEY;
  if (hasAnthropicCookie) {
    configured.push({ provider: "anthropic", configured: true, source: "cookie" });
  } else if (hasAnthropicEnv) {
    configured.push({ provider: "anthropic", configured: true, source: "env" });
  } else {
    configured.push({ provider: "anthropic", configured: false, source: "none" });
  }

  const hasGeminiCookie = !!cookieStore.get(COOKIE_GEMINI_API_KEY)?.value;
  const hasGeminiEnv = !!process.env.GEMINI_API_KEY;
  if (hasGeminiCookie) {
    configured.push({ provider: "gemini", configured: true, source: "cookie" });
  } else if (hasGeminiEnv) {
    configured.push({ provider: "gemini", configured: true, source: "env" });
  } else {
    configured.push({ provider: "gemini", configured: false, source: "none" });
  }

  return NextResponse.json({ keys: configured });
}

/**
 * POST /api/keys
 *
 * Set an API key for a provider.
 * Body: { provider: "anthropic" | "gemini", key: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { provider?: string; key?: string };
    const { provider, key } = body;

    if (!provider || !VALID_PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 },
      );
    }

    if (!key || typeof key !== "string" || key.trim().length < 10) {
      return NextResponse.json(
        { error: "Valid API key is required (min 10 characters)." },
        { status: 400 },
      );
    }

    const cookieName = cookieNameFor(provider as Provider);
    const res = NextResponse.json({ ok: true, provider });
    res.cookies.set(cookieName, key.trim(), KEY_COOKIE_PROPS);

    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}

/**
 * DELETE /api/keys
 *
 * Remove an API key for a provider.
 * Body: { provider: "anthropic" | "gemini" }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = (await request.json()) as { provider?: string };
    const { provider } = body;

    if (!provider || !VALID_PROVIDERS.includes(provider as Provider)) {
      return NextResponse.json(
        { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(", ")}` },
        { status: 400 },
      );
    }

    const cookieName = cookieNameFor(provider as Provider);
    const res = NextResponse.json({ ok: true, provider });
    res.cookies.delete(cookieName);

    return res;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
}
