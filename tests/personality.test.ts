import { describe, expect, it } from "vitest";
import { buildSystemPrompt, buildUserPrompt, clampReply } from "@/lib/personality";

describe("personality prompts", () => {
  it("embeds the selected mode, mood, and length limit", () => {
    const roast = buildSystemPrompt({ mode: "roast", maxChars: 180 });
    expect(roast).toContain("MODE: ROAST ME");
    expect(roast).toContain("Never exceed 180 characters");
    expect(roast).toContain("CatGPT");
    expect(roast).toContain("CURRENT MOOD: FRISKY");

    const ignoring = buildSystemPrompt({ mode: "ask", maxChars: 220, mood: "ignoring" });
    expect(ignoring).toContain("CURRENT MOOD: IGNORING");
    expect(ignoring).toContain("deliberately unhelpful non-answer");

    expect(buildSystemPrompt({ mode: "flirt", maxChars: 220 })).toContain("MODE: FLIRT");
    expect(buildSystemPrompt({ mode: "ask", maxChars: 220 })).toContain("MODE: OPEN QUESTIONS");
  });

  it("keeps the roast rules humane", () => {
    const prompt = buildSystemPrompt({ mode: "roast", maxChars: 220 });
    expect(prompt).toContain("never their body or identity");
    expect(prompt).toContain("If the guest seems vulnerable, go softer");
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
