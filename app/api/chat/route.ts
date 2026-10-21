import { NextResponse } from "next/server";
import { getServerConfig } from "@/lib/config";
import { pickMood } from "@/lib/moods";
import { generateAiReply } from "@/lib/providers";
import { buildOfflineReply } from "@/lib/offlineBrain";
import { createRateLimiter, clientKeyFromHeaders } from "@/lib/rateLimit";
import { isAnswerableQuestion, normalizeQuestion, parseMode, sanitizeAvoid } from "@/lib/validate";
import type { ChatApiResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const config = getServerConfig();
const guestLimiter = createRateLimiter({
  limit: config.rateLimit,
  windowMs: config.rateWindowMs,
});
const globalLimiter = createRateLimiter({
  limit: config.globalLimit,
  windowMs: 60_000,
  maxKeys: 4,
});

function json(payload: ChatApiResponse, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      ...extraHeaders,
    },
  });
}

export async function POST(request: Request) {
  const now = Date.now();
  const guestKey = clientKeyFromHeaders(request.headers);

  // A global ceiling protects the wallet if a crowd (or a bot) finds the URL.
  const globalCheck = globalLimiter.check("global", now);
  if (!globalCheck.ok) {
    return json(
      { error: "CatGPT is overwhelmed and has gone to sit in a box. Try again shortly." },
      429,
      { "Retry-After": String(globalCheck.retryAfterSeconds) },
    );
  }

  const guestCheck = guestLimiter.check(guestKey, now);
  if (!guestCheck.ok) {
    return json(
      {
        error: `CatGPT has answered enough of your questions. Try again in ${guestCheck.retryAfterSeconds}s.`,
        retryAfterSeconds: guestCheck.retryAfterSeconds,
      },
      429,
      { "Retry-After": String(guestCheck.retryAfterSeconds) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "CatGPT received something that wasn't a question. Suspicious." }, 400);
  }

  const raw = body as { question?: unknown; mode?: unknown; avoid?: unknown } | null;
  const question = normalizeQuestion(raw?.question);
  const mode = parseMode(raw?.mode);
  const avoid = sanitizeAvoid(raw?.avoid);
  const mood = pickMood();

  if (!isAnswerableQuestion(question)) {
    return json({ error: "Type an actual question. CatGPT can't read vibes." }, 400);
  }

  const ai = await generateAiReply({
    question,
    mode,
    mood,
    avoid,
    config: config.brain,
    maxAnswerChars: config.maxAnswerChars,
  });

  if (ai) {
    return json({
      reply: ai.text,
      source: "ai",
      mode,
      mood,
      provider: ai.provider,
      remaining: guestCheck.remaining,
    });
  }

  // No key, provider outage, timeout, or a model having a moment: stay funny.
  const reply = buildOfflineReply({
    question,
    mode,
    mood,
    avoid,
    maxChars: config.maxAnswerChars,
  });

  return json({
    reply,
    source: "offline",
    mode,
    mood,
    remaining: guestCheck.remaining,
  });
}

export async function GET() {
  return json({ error: "CatGPT only takes questions, not visits." }, 405);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "POST" },
  });
}

