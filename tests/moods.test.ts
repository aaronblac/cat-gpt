import { describe, expect, it } from "vitest";
import { MODE_MOODS, pickMood } from "@/lib/moods";
import { CHAT_MODES } from "@/lib/types";

describe("mode moods", () => {
  it("keeps every mode inside its own emotional range", () => {
    for (const mode of CHAT_MODES) {
      for (let i = 0; i < 50; i += 1) {
        const mood = pickMood(mode, () => i / 50);
        expect(MODE_MOODS[mode]).toContain(mood);
      }
    }
  });

  it("does not let the flirty moods leak into Ask or Roast", () => {
    expect(MODE_MOODS.ask).not.toContain("needy");
    expect(MODE_MOODS.ask).not.toContain("frisky");
    expect(MODE_MOODS.roast).not.toContain("needy");
    expect(MODE_MOODS.roast).not.toContain("sleepy");
  });

  it("does not let the Lap Cat turn into the Gremlin or the Oracle", () => {
    expect(MODE_MOODS.flirt).not.toContain("ignoring");
    expect(MODE_MOODS.flirt).not.toContain("aloof");
    expect(MODE_MOODS.flirt).not.toContain("chaotic");
  });

  it("defaults to Ask and is deterministic with a seeded rng", () => {
    expect(MODE_MOODS.ask).toContain(pickMood());
    expect(pickMood("flirt", () => 0)).toBe("needy");
    expect(pickMood("roast", () => 0)).toBe("chaotic");
    expect(pickMood("ask", () => 0.99)).toBe("moody");
  });
});
