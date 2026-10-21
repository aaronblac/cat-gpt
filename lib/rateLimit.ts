/**
 * Tiny in-memory sliding-window rate limiter.
 *
 * Serverless caveat: each warm instance keeps its own counters, so this is a
 * speed bump rather than a fortress. It is paired with a provider-side spending
 * cap and a global limiter. For multi-instance deployments swap `store` for
 * Upstash Redis — the interface stays the same.
 */

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
  /** Maximum tracked keys, so a bot can't grow the map without bound. */
  maxKeys?: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}

export interface RateLimiter {
  check(key: string, now?: number): RateLimitResult;
  size(): number;
}

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const limit = Math.max(1, Math.floor(options.limit));
  const windowMs = Math.max(1000, Math.floor(options.windowMs));
  const maxKeys = Math.max(50, Math.floor(options.maxKeys ?? 5000));
  const store = new Map<string, number[]>();

  function pruneKey(key: string, now: number): number[] {
    const hits = store.get(key);
    if (!hits) return [];
    const fresh = hits.filter((stamp) => now - stamp < windowMs);
    if (fresh.length === 0) {
      store.delete(key);
    } else {
      store.set(key, fresh);
    }
    return fresh;
  }

  function evictIfNeeded(now: number): void {
    if (store.size <= maxKeys) return;
    // Drop the least recently used keys first; they are the cheapest to lose.
    const entries = [...store.entries()]
      .map(([key, hits]) => ({ key, last: hits[hits.length - 1] ?? 0 }))
      .sort((a, b) => a.last - b.last);
    const removeCount = store.size - maxKeys;
    for (let i = 0; i < removeCount; i += 1) {
      const entry = entries[i];
      if (entry) store.delete(entry.key);
    }
    // Opportunistic sweep of stale buckets.
    for (const key of store.keys()) pruneKey(key, now);
  }

  return {
    check(key: string, now: number = Date.now()): RateLimitResult {
      const hits = pruneKey(key, now);
      if (hits.length >= limit) {
        const oldest = hits[0] ?? now;
        const resetAt = oldest + windowMs;
        return {
          ok: false,
          remaining: 0,
          retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
          resetAt,
        };
      }
      hits.push(now);
      store.set(key, hits);
      evictIfNeeded(now);
      return {
        ok: true,
        remaining: Math.max(0, limit - hits.length),
        retryAfterSeconds: 0,
        resetAt: now + windowMs,
      };
    },
    size() {
      return store.size;
    },
  };
}

/** Best-effort client identity behind Vercel / Cloudflare / Render proxies. */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip") ??
    headers.get("x-vercel-forwarded-for") ??
    "unknown"
  );
}
