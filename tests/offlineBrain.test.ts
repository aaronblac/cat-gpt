import { describe, expect, it } from "vitest";
import { buildOfflineReply, pickTopic } from "@/lib/offlineBrain";
import { CHAT_MODES } from "@/lib/types";

const SAMPLES = [
  "Who are you?",
  "Are you single?",
  "Rate my costume",
  "You're so cute",
  "You're stupid",
  "Do you like tuna?",
  "Do you like dogs?",
  "How do I get rich?",
  "What's the meaning of life?",
  "I'm so tired",
  "What's in the box?",
  "Why do you knock things over?",
  "Do you take baths?",
  "Who should I vote for?",
  "Are you ChatGPT?",
  "Do you have Instagram?",
  "Is this a good party?",
  "What's the weather like?",
  "What's 2 + 2?",
  "Tell me about the Krebs cycle",
];

describe("offline brain", () => {
  it("routes questions to the right topic", () => {
    expect(pickTopic("Do you like dogs?")?.id).toBe("dogs");
    expect(pickTopic("Are you single?")?.id).toBe("love");
    expect(pickTopic("Rate my costume")?.id).toBe("costume");
    expect(pickTopic("What's the meaning of life?")?.id).toBe("philosophy");
    expect(pickTopic("What's in the box?")?.id).toBe("box");
    expect(pickTopic("What's the weather like?")?.id).toBe("weather");
    expect(pickTopic("Will it rain tonight?")?.id).toBe("weather");
    expect(pickTopic("Do you take baths?")?.id).toBe("water");
    expect(pickTopic("Tell me about your outfits")?.id).toBe("costume");
    expect(pickTopic("Do you like parties?")?.id).toBe("party");
    expect(pickTopic("What's in the boxes?")?.id).toBe("box");
    expect(pickTopic("Tell me about the Krebs cycle")).toBeUndefined();
  });

  it("always returns a short, non-empty line in every mode", () => {
    for (const mode of CHAT_MODES) {
      for (const question of SAMPLES) {
        const reply = buildOfflineReply({ question, mode });
        expect(reply.length).toBeGreaterThan(8);
        expect(reply.length).toBeLessThanOrEqual(220);
      }
    }
  });

  it("respects a tighter length budget", () => {
    for (const mode of CHAT_MODES) {
      for (const question of SAMPLES) {
        const reply = buildOfflineReply({ question, mode, maxChars: 80 });
        expect(reply.length).toBeLessThanOrEqual(80);
      }
    }
  });

  it("gives each mode a different personality", () => {
    const rng = () => 0.9;
    const ask = buildOfflineReply({ question: "Are you single?", mode: "ask", rng });
    const roast = buildOfflineReply({ question: "Are you single?", mode: "roast", rng });
    const flirt = buildOfflineReply({ question: "Are you single?", mode: "flirt", rng });

    expect(new Set([ask, roast, flirt]).size).toBe(3);
    expect(roast.toLowerCase()).toContain("single");
    expect(flirt.toLowerCase()).toContain("take me home");
  });

  it("lets the mood change the answer to the same question", () => {
    const question = "Are you single?";
    const rng = () => 0;
    const smug = buildOfflineReply({ question, mode: "ask", mood: "smug", rng });
    const needy = buildOfflineReply({ question, mode: "ask", mood: "needy", rng });
    const ignoring = buildOfflineReply({ question, mode: "ask", mood: "ignoring", rng });

    expect(new Set([smug, needy, ignoring]).size).toBe(3);
  });

  it("quotes the guest when roasting an unmatched question", () => {
    const reply = buildOfflineReply({
      question: "Tell me about the Krebs cycle",
      mode: "roast",
      rng: () => 0,
    });
    expect(reply).toContain("Krebs cycle");
    expect(reply).not.toContain("{q}");
  });

  it("never repeats a line while fresh options exist", () => {
    const seen: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const reply = buildOfflineReply({
        question: "Are you single?",
        mode: "ask",
        avoid: seen,
        rng: () => 0,
      });
      expect(seen).not.toContain(reply);
      seen.push(reply);
    }
    expect(new Set(seen).size).toBe(5);
  });

  it("keeps answers unique across a long run of the same question", () => {
    let state = 42;
    const rng = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };

    const seen: string[] = [];
    for (let i = 0; i < 20; i += 1) {
      const reply = buildOfflineReply({
        question: "Are you single?",
        mode: "flirt",
        mood: "frisky",
        avoid: seen,
        rng,
      });
      expect(reply.length).toBeGreaterThan(8);
      expect(seen).not.toContain(reply);
      seen.push(reply);
    }
    expect(new Set(seen).size).toBe(20);
  });

  it("falls back to a repeat rather than returning nothing when every bank is exhausted", () => {
    const seen: string[] = [];
    for (let i = 0; i < 40; i += 1) {
      seen.push(
        buildOfflineReply({
          question: "Are you single?",
          mode: "ask",
          mood: "frisky",
          avoid: seen,
        }),
      );
    }
    expect(seen.filter(Boolean).length).toBe(40);
  });

  it("is deterministic with a seeded rng", () => {
    const a = buildOfflineReply({ question: "Do you like dogs?", mode: "ask", rng: () => 0.42 });
    const b = buildOfflineReply({ question: "Do you like dogs?", mode: "ask", rng: () => 0.42 });
    expect(a).toBe(b);
  });

  it("has something to say about a blank question", () => {
    const reply = buildOfflineReply({ question: "  ", mode: "ask" });
    expect(reply).toMatch(/vibe/i);
  });
});
