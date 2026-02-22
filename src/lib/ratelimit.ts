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
  if (!redis) {
    if (process.env.VERCEL) {
      return {
        allowed: false,
        limit: 0,
        remaining: 0,
        reset: Date.now() + 60_000,
        retryAfter: 60,
        skipped: true,
        reason: "Rate limiting is not configured.",
      };
    }

    return {
      allowed: true,
      limit: 0,
      remaining: 0,
      reset: 0,
      retryAfter: null,
      skipped: true,
    };
  }

  const limiter = getLimiter(options);
  const identifier = `${options.prefix}:${getClientIp(request)}`;
  const result = await limiter.limit(
    identifier,
    options.rate ? { rate: options.rate } : undefined
  );
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
