import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt, clampReply } from "@/lib/personality";

describe("personality prompts", () => {
  it("embeds the selected mode, mood, and length limit", () => {
    const roast = buildSystemPrompt({ mode: "roast", maxChars: 180 });
    expect(roast).toContain("MODE: ROAST — THE GREMLIN");
    expect(roast).toContain("Never exceed 180 characters");
    expect(roast).toContain("CatGPT");
    expect(roast).toContain("CURRENT MOOD: FRISKY");
    expect(roast).toContain("MODE LOCK");

    const ignoring = buildSystemPrompt({ mode: "ask", maxChars: 220, mood: "ignoring" });
    expect(ignoring).toContain("MODE: ASK — THE ORACLE");
    expect(ignoring).toContain("CURRENT MOOD: IGNORING");
    expect(ignoring).toContain("deliberately unhelpful non-answer");

    expect(buildSystemPrompt({ mode: "flirt", maxChars: 220 })).toContain(
      "MODE: FLIRT — THE LAP CAT",
    );
  });

  it("separates the three personas and forbids blending", () => {
    const ask = buildSystemPrompt({ mode: "ask", maxChars: 220 });
    const roast = buildSystemPrompt({ mode: "roast", maxChars: 220 });
    const flirt = buildSystemPrompt({ mode: "flirt", maxChars: 220 });

    expect(ask).toContain("deliver a verdict");
    expect(ask).toContain("Never use pet names");
    expect(roast).toContain("Never end with warmth");
    expect(roast).toContain("do not flirt");
    expect(flirt).toContain("Push-pull");
    expect(flirt).toContain("no verdicts, no insults");

    expect(ask).toContain("The Oracle does not purr");
    expect(roast).toContain("The Gremlin does not philosophize");
    expect(flirt).toContain("The Lap Cat does not deliver verdicts");
  });

  it("keeps the roast rules humane", () => {
    const prompt = buildSystemPrompt({ mode: "roast", maxChars: 220 });
    expect(prompt).toContain("Never their body or identity");
    expect(prompt).toContain("turn the roast into self-deprecation");
  });

  it("delimits guest input and lists recent answers", () => {
    const prompt = buildUserPrompt("Are you single?", ["Single, obviously.", "Tuna."]);
    expect(prompt).toContain("<guest_question>\nAre you single?\n</guest_question>");
    expect(prompt).toContain("Answers already used tonight");
    expect(prompt).toContain("- Single, obviously.");
    expect(prompt).toContain("- Tuna.");
    expect(buildUserPrompt("hi")).not.toContain("already used tonight");
  });

  it("cleans model formatting and enforces the cap", () => {
    expect(clampReply('```\n"Absolutely not."\n```', 220)).toBe("Absolutely not.");
    expect(clampReply("  lots   of\n\nspace  ", 220)).toBe("lots of space");
    expect(clampReply("word ".repeat(100), 50).length).toBeLessThanOrEqual(50);
    expect(clampReply("a".repeat(300), 100).length).toBeLessThanOrEqual(100);
    expect(clampReply("short and sweet", 220)).toBe("short and sweet");
  });
});
