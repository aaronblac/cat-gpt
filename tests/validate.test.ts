import { describe, expect, it } from "vitest";
import {
  isAnswerableQuestion,
  normalizeQuestion,
  parseMode,
  sanitizeAvoid,
} from "@/lib/validate";

describe("question validation", () => {
  it("strips control characters and collapses whitespace", () => {
    expect(normalizeQuestion("  are\u0000 you\n\nsingle?  ")).toBe("are you single?");
    expect(normalizeQuestion("zero\u200bwidth")).toBe("zero width");
  });

  it("caps long questions instead of rejecting the guest", () => {
    const long = normalizeQuestion("a".repeat(500));
    expect(long).toHaveLength(180);
  });

  it("ignores non-strings", () => {
    expect(normalizeQuestion(null)).toBe("");
    expect(normalizeQuestion(42)).toBe("");
    expect(normalizeQuestion({ question: "hi" })).toBe("");
  });

  it("only answers things with letters or numbers", () => {
    expect(isAnswerableQuestion("are you single?")).toBe(true);
    expect(isAnswerableQuestion("42")).toBe(true);
    expect(isAnswerableQuestion("?!?!")).toBe(false);
    expect(isAnswerableQuestion("😼")).toBe(false);
  });

  it("falls back to ask mode for unknown modes", () => {
    expect(parseMode("roast")).toBe("roast");
    expect(parseMode("FLIRT")).toBe("ask");
    expect(parseMode(undefined)).toBe("ask");
    expect(parseMode("../../etc/passwd")).toBe("ask");
  });

  it("keeps the repeat-guard payload small and clean", () => {
    const avoid = sanitizeAvoid([
      "  a   line  ",
      7,
      null,
      "b".repeat(400),
      ...Array.from({ length: 40 }, (_, i) => `line ${i}`),
    ]);
    expect(avoid.length).toBe(24);
    expect(avoid[0]).toBe("a line");
    expect(avoid[1]).toHaveLength(260);
    expect(sanitizeAvoid("nope")).toEqual([]);
  });
});
