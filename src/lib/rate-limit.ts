import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Simple in-memory rate limiter
// Suitable for single-instance internal tools. For multi-instance deployments,
// replace with a Redis-backed implementation.
// ---------------------------------------------------------------------------

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

// Default configs for different operation types
export const RATE_LIMIT_CONFIGS = {
  /** Read operations — generous limit */
  read: { windowMs: 60_000, maxRequests: 200 } satisfies RateLimitConfig,
  /** Write/mutation operations — stricter limit */
  write: { windowMs: 60_000, maxRequests: 50 } satisfies RateLimitConfig,
  /** Auth operations — tight limit to prevent brute-force */
  auth: { windowMs: 60_000, maxRequests: 10 } satisfies RateLimitConfig,
} as const;

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodically clean up expired entries to prevent memory leaks
    this.cleanupInterval = setInterval(() => this.cleanup(), 60_000);
    // Allow the process to exit even if the interval is still active
    if (this.cleanupInterval && typeof this.cleanupInterval === "object" && "unref" in this.cleanupInterval) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Check if a request should be allowed.
   * @returns true if the request is within the rate limit, false if it should be blocked.
   */
  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      // New window
      this.store.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return true;
    }

    if (entry.count >= config.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Get remaining requests for a key.
   */
  remaining(key: string, config: RateLimitConfig): number {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      return config.maxRequests;
    }

    return Math.max(0, config.maxRequests - entry.count);
  }

  /**
   * Get the number of seconds until the rate limit window resets.
   * Returns 0 if no active window or window has expired.
   */
  retryAfterSeconds(key: string): number {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      return 0;
    }

    return Math.ceil((entry.resetAt - now) / 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) {
        this.store.delete(key);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// Singleton instance
const globalForRateLimiter = globalThis as unknown as {
  rateLimiter: RateLimiter | undefined;
};

export const rateLimiter =
  globalForRateLimiter.rateLimiter ?? new RateLimiter();

if (process.env.NODE_ENV !== "production") {
  globalForRateLimiter.rateLimiter = rateLimiter;
}

/**
 * Convenience function to rate-limit by IP address.
 * @param ip - The client IP address (from request headers)
 * @param operation - The type of operation ("read" | "write" | "auth")
 * @returns true if the request is allowed, false if rate-limited
 */
export function rateLimit(
  ip: string | null,
  operation: keyof typeof RATE_LIMIT_CONFIGS = "read"
): boolean {
  // If IP is unknown, use a fallback key but still rate-limit
  const key = `${operation}:${ip ?? "unknown"}`;
  const config = RATE_LIMIT_CONFIGS[operation];
  return rateLimiter.check(key, config);
}

/**
 * Create a 429 Too Many Requests response with a Retry-After header.
 * @param ip - The client IP address
 * @param operation - The type of operation that was rate-limited
 * @returns NextResponse with 429 status and Retry-After header
 */
export function rateLimitResponse(
  ip: string | null,
  operation: keyof typeof RATE_LIMIT_CONFIGS = "read"
): NextResponse {
  const key = `${operation}:${ip ?? "unknown"}`;
  const retryAfter = rateLimiter.retryAfterSeconds(key);

  return NextResponse.json(
    {
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests",
        retryAfter,
      },
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter || 60),
      },
    }
  );
}

/**
 * Extract client IP from a request. In Next.js, the IP is typically available
 * via x-forwarded-for header when behind a reverse proxy.
 */
export function getClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for can contain multiple IPs; the first is the client
    return forwarded.split(",")[0].trim();
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return null;
}
