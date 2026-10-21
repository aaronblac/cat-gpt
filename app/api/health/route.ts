import { NextResponse } from "next/server";
import { describeBrain, getServerConfig } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Secret-free status endpoint.
 * GET /api/health → which brain is wired up, and whether it is ready.
 */
export async function GET() {
  const config = getServerConfig();
  const brain = describeBrain(config.brain);

  return NextResponse.json(
    {
      ok: true,
      app: "CatGPT",
      version: "1.0.0",
      brain: {
        provider: brain.provider,
        model: brain.model,
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
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
