import { describe, expect, it } from "vitest";
import { createRateLimiter, clientKeyFromHeaders } from "@/lib/rateLimit";

describe("rate limiter", () => {
  it("allows the budget, then blocks with a retry hint", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000 });
    const t0 = 1_000_000;

    const first = limiter.check("guest", t0);
    expect(first.ok).toBe(true);
    expect(first.remaining).toBe(2);

    expect(limiter.check("guest", t0 + 100).ok).toBe(true);
    expect(limiter.check("guest", t0 + 200).ok).toBe(true);

    const blocked = limiter.check("guest", t0 + 300);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("reopens the window once the oldest hit expires", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 10_000 });
    expect(limiter.check("guest", 0).ok).toBe(true);
    expect(limiter.check("guest", 5_000).ok).toBe(false);
    expect(limiter.check("guest", 10_001).ok).toBe(true);
  });

  it("tracks guests independently", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("guest-a", 100).ok).toBe(true);
    expect(limiter.check("guest-b", 100).ok).toBe(true);
    expect(limiter.check("guest-a", 100).ok).toBe(false);
  });

  it("prunes stale keys instead of leaking memory", () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1_000, maxKeys: 50 });
    for (let i = 0; i < 200; i += 1) limiter.check(`guest-${i}`, 10_000);
    expect(limiter.size()).toBeLessThanOrEqual(50);
  });

  it("identifies guests behind common proxies", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    expect(clientKeyFromHeaders(headers)).toBe("203.0.113.9");
    expect(clientKeyFromHeaders(new Headers({ "cf-connecting-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
    expect(clientKeyFromHeaders(new Headers())).toBe("unknown");
  });
});
