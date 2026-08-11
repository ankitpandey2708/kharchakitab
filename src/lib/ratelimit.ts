import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import type { NextRequest } from "next/server";
import type { Duration } from "@upstash/ratelimit";

type RateLimitOptions = {
  prefix: string;
  max: number;
  window: Duration;
  rate?: number;
};

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number;
  retryAfter: number | null;
  skipped: boolean;
  reason?: string;
};

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

const limiterCache = new Map<string, Ratelimit>();

/**
 * No Redis configured — the operator has opted out of rate limiting, so let the
 * request through rather than blocking the route entirely.
 */
const unlimited = (): RateLimitResult => ({
  allowed: true,
  limit: 0,
  remaining: 0,
  reset: 0,
  retryAfter: null,
  skipped: true,
});

/**
 * Configured but unreachable. Deployed, refuse: limits were explicitly asked
 * for, and failing open for the duration of an outage leaves spend on the paid
 * APIs behind this uncapped. Locally, fall through so a down Redis doesn't
 * block dev.
 */
const unavailable = (reason: string): RateLimitResult =>
  process.env.VERCEL
    ? {
        allowed: false,
        limit: 0,
        remaining: 0,
        reset: Date.now() + 60_000,
        retryAfter: 60,
        skipped: true,
        reason,
      }
    : unlimited();

const getLimiter = ({ prefix, max, window }: RateLimitOptions): Ratelimit => {
  const key = `${prefix}:${max}:${window}`;
  const cached = limiterCache.get(key);
  if (cached) return cached;

  const limiter = new Ratelimit({
    redis: redis as Redis,
    limiter: Ratelimit.slidingWindow(max, window),
    analytics: true,
    prefix,
  });
  limiterCache.set(key, limiter);
  return limiter;
};

const getClientIp = (request: NextRequest): string => {
  const directIp = (request as { ip?: string }).ip;
  if (directIp) return directIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim() || "unknown";

  return request.headers.get("x-real-ip") ?? "unknown";
};

export const rateLimitByIp = async (
  request: NextRequest,
  options: RateLimitOptions
): Promise<RateLimitResult> => {
  if (!redis) return unlimited();

  const limiter = getLimiter(options);
  const identifier = `${options.prefix}:${getClientIp(request)}`;

  // Redis.fromEnv() only checks that the vars exist — an unreachable or deleted
  // database fails here, at call time. Unwrapped this throws past the route and
  // surfaces as an opaque 500.
  let result: Awaited<ReturnType<Ratelimit["limit"]>>;
  try {
    result = await limiter.limit(
      identifier,
      options.rate ? { rate: options.rate } : undefined
    );
  } catch (e) {
    console.error("ratelimit: Redis unreachable", e);
    return unavailable("Rate limiting is temporarily unavailable.");
  }

  const retryAfter = result.success
    ? null
    : Math.max(0, Math.ceil((result.reset - Date.now()) / 1000));

  return {
    allowed: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
    retryAfter,
    skipped: false,
  };
};
