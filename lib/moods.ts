import type { ChatMode } from "@/lib/types";

/**
 * Cat moods. A new one is chosen per request, both for live models and for the
 * offline brain, so the same question gets a different flavour every time.
 *
 * Moods are not shared across modes. Each mode has its own emotional range so
 * the Oracle never turns into the Lap Cat, and the Gremlin never starts
 * purring.
 */
export const CAT_MOODS = [
  "frisky",
  "moody",
  "aloof",
  "chaotic",
  "sleepy",
  "smug",
  "needy",
  "ignoring",
] as const;

export type CatMood = (typeof CAT_MOODS)[number];

/** Allowed moods per mode. This is what keeps the three cats distinct. */
export const MODE_MOODS: Record<ChatMode, readonly CatMood[]> = {
  ask: ["smug", "aloof", "sleepy", "chaotic", "ignoring", "moody"],
  roast: ["chaotic", "smug", "moody", "ignoring", "frisky"],
  flirt: ["needy", "frisky", "sleepy", "moody"],
};

export function isCatMood(value: unknown): value is CatMood {
  return typeof value === "string" && (CAT_MOODS as readonly string[]).includes(value);
}

export function moodsForMode(mode: ChatMode): readonly CatMood[] {
  return MODE_MOODS[mode] ?? MODE_MOODS.ask;
}

export function pickMood(mode: ChatMode = "ask", rng: () => number = Math.random): CatMood {
  const moods = moodsForMode(mode);
  const index = Math.min(moods.length - 1, Math.floor(rng() * moods.length));
  return moods[index] ?? "smug";
}
