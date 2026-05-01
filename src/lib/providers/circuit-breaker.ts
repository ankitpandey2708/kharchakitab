// Shared in-memory per-provider circuit breaker for 429 rate limits.
// Module-level state is shared across all requests in the same process,
// so a rate limit on Gemini during a parse request also skips it for agent requests.

const rateLimitCooldown = new Map<string, number>()

export function isOnCooldown(key: string): boolean {
  const expires = rateLimitCooldown.get(key)
  return expires !== undefined && Date.now() < expires
}

export function setCooldown(key: string, retryAfterSec?: number): void {
  rateLimitCooldown.set(key, Date.now() + (retryAfterSec ?? 60) * 1000)
}

/** Normalise a Gemini model string to a consistent circuit-breaker key. */
export function geminiKey(model: string): string {
  return `gemini:${model.replace(/^models\//, '')}`
}

export function extractRateLimit(err: unknown): { isRateLimit: boolean; retryAfterSec?: number } {
  if (!(err instanceof Error)) return { isRateLimit: false }
  const e = err as Error & { statusCode?: number; responseHeaders?: Record<string, string> }
  const isRateLimit =
    e.statusCode === 429 ||
    err.message.includes('429') ||
    err.message.toLowerCase().includes('rate limit')
  if (!isRateLimit) return { isRateLimit: false }
  const raw = e.responseHeaders?.['retry-after']
  const retryAfterSec = raw ? (parseInt(raw, 10) || undefined) : undefined
  return { isRateLimit: true, retryAfterSec }
}
