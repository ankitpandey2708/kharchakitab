import { cookies } from "next/headers";

/** Cookie name for user-provided Anthropic API key */
export const COOKIE_ANTHROPIC_API_KEY = "anthropic_api_key";
/** Cookie name for user-provided Gemini API key */
export const COOKIE_GEMINI_API_KEY = "gemini_api_key";

/**
 * Read the user's Anthropic API key from cookies.
 * Falls back to ANTHROPIC_API_KEY env var if no cookie is set.
 */
export async function getAnthropicApiKey(): Promise<string | null> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COOKIE_ANTHROPIC_API_KEY)?.value;
  if (fromCookie) return fromCookie;

  const fromEnv = process.env.ANTHROPIC_API_KEY;
  if (fromEnv) return fromEnv;

  return null;
}

/**
 * Read the user's Gemini API key from cookies.
 * Falls back to GEMINI_API_KEY env var if no cookie is set.
 */
export async function getGeminiApiKey(): Promise<string | null> {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(COOKIE_GEMINI_API_KEY)?.value;
  if (fromCookie) return fromCookie;

  const fromEnv = process.env.GEMINI_API_KEY;
  if (fromEnv) return fromEnv;

  return null;
}


