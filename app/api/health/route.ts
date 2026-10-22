import { NextResponse } from "next/server";
import { describeBrain, getServerConfig } from "@/lib/config";
import { generateAiReply, type ProviderDiagnostics } from "@/lib/providers";
import { createRateLimiter, clientKeyFromHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const probeLimiter = createRateLimiter({ limit: 3, windowMs: 60_000 });

/**
 * Secret-free status endpoint.
 * GET /api/health           → which brain is wired up and whether it is ready.
 * GET /api/health?probe=1   → makes one tiny live model call and reports why it
 *                             succeeded or fell back. Rate-limited to 3/minute.
 */
export async function GET(request: Request) {
  const config = getServerConfig();
  const brain = describeBrain(config.brain);
  const url = new URL(request.url);

  const base = {
    ok: true,
    app: "CatGPT",
    version: "1.0.0",
    brain: {
      provider: brain.provider,
      model: brain.model,
      fallbackModel: config.brain.fallbackModel ?? null,
      ready: brain.ready,
      note: brain.note ?? null,
    },
    limits: {
      maxAnswerChars: config.maxAnswerChars,
      perGuestPerWindow: config.rateLimit,
      windowSeconds: Math.round(config.rateWindowMs / 1000),
      globalPerMinute: config.globalLimit,
    },
    time: new Date().toISOString(),
  };

  if (url.searchParams.get("probe") !== "1") {
    return NextResponse.json(base, { headers: { "Cache-Control": "no-store, max-age=0" } });
  }

  const key = clientKeyFromHeaders(request.headers);
  const allowed = probeLimiter.check(key);
  if (!allowed.ok) {
    return NextResponse.json(
      {
        ...base,
        probe: {
          ok: false,
          reason: "rate_limited",
          retryAfterSeconds: allowed.retryAfterSeconds,
        },
      },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "Retry-After": String(allowed.retryAfterSeconds),
        },
      },
    );
  }

  if (!brain.ready || brain.provider === "offline") {
    return NextResponse.json(
      {
        ...base,
        probe: { ok: false, reason: "not_configured", latencyMs: 0 },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const diagnostics: ProviderDiagnostics = {};
  const started = Date.now();
  const result = await generateAiReply({
    question: "Reply with the single word: meow",
    mode: "ask",
    mood: "smug",
    avoid: [],
    config: config.brain,
    maxAnswerChars: 80,
    diagnostics,
  });

  return NextResponse.json(
    {
      ...base,
      probe: {
        ok: Boolean(result?.text),
        reply: result?.text ?? null,
        modelUsed: diagnostics.fallbackModel ?? brain.model,
        fallbackModel: diagnostics.fallbackModel ?? null,
        reason: result ? null : diagnostics.reason ?? "unknown",
        finishReason: diagnostics.finishReason ?? null,
        retryAfterSeconds: diagnostics.retryAfterSeconds ?? null,
        quotaModel: diagnostics.quotaModel ?? null,
        latencyMs: diagnostics.latencyMs ?? Date.now() - started,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
