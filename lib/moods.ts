/**
 * Cat moods. A new one is chosen per request, both for live models and for the
 * offline brain, so the same question gets a different flavour every time.
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

export function isCatMood(value: unknown): value is CatMood {
  return typeof value === "string" && (CAT_MOODS as readonly string[]).includes(value);
}

export function pickMood(rng: () => number = Math.random): CatMood {
  const index = Math.min(CAT_MOODS.length - 1, Math.floor(rng() * CAT_MOODS.length));
  return CAT_MOODS[index] ?? "frisky";
}
