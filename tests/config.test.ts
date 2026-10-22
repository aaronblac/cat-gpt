import { describe, expect, it } from "vitest";
import { getServerConfig, resolveBrain } from "@/lib/config";

describe("brain configuration", () => {
  it("falls back to the offline engine with no credentials", () => {
    const brain = resolveBrain({});
    expect(brain.provider).toBe("offline");
    expect(brain.ready).toBe(true);
  });

  it("uses the first configured provider when set to auto", () => {
    expect(resolveBrain({ ANTHROPIC_API_KEY: "sk-ant" }).provider).toBe("anthropic");
    expect(
      resolveBrain({ ANTHROPIC_API_KEY: "sk-ant", OPENAI_API_KEY: "sk-openai" }).provider,
    ).toBe("openai");
    expect(resolveBrain({ GROQ_API_KEY: "gsk" }).provider).toBe("groq");
  });

  it("gives Gemini a working fallback model automatically", () => {
    const current = resolveBrain({ GOOGLE_GENERATIVE_AI_API_KEY: "key" });
    expect(current).toMatchObject({
      provider: "google",
      model: "gemini-3.5-flash",
      fallbackModel: "gemini-3.1-flash-lite",
    });

    const legacy = resolveBrain({
      GOOGLE_GENERATIVE_AI_API_KEY: "key",
      GOOGLE_MODEL: "gemini-3.5-flash-lite",
    });
    expect(legacy.model).toBe("gemini-3.5-flash");
    expect(legacy.fallbackModel).toBe("gemini-3.1-flash-lite");

    const explicit = resolveBrain({
      GOOGLE_GENERATIVE_AI_API_KEY: "key",
      GOOGLE_MODEL: "gemini-custom",
      GOOGLE_FALLBACK_MODEL: "gemini-backup",
    });
    expect(explicit.fallbackModel).toBe("gemini-backup");
  });

  it("honours an explicit provider and its model", () => {
    const brain = resolveBrain({
      CATGPT_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test",
      OPENAI_MODEL: "gpt-custom",
    });
    expect(brain).toMatchObject({
      provider: "openai",
      model: "gpt-custom",
      apiKey: "sk-test",
      ready: true,
    });
  });

  it("reports a missing key instead of silently using another provider", () => {
    const brain = resolveBrain({ CATGPT_PROVIDER: "google" });
    expect(brain.provider).toBe("google");
    expect(brain.ready).toBe(false);
    expect(brain.note).toContain("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("can be forced offline even when keys exist", () => {
    const brain = resolveBrain({ CATGPT_PROVIDER: "offline", OPENAI_API_KEY: "sk-test" });
    expect(brain.provider).toBe("offline");
    expect(brain.ready).toBe(true);
  });

  it("detects a local Ollama server and normalises its OpenAI-compatible URL", () => {
    const brain = resolveBrain({ OLLAMA_BASE_URL: "http://10.0.0.5:11434///" });
    expect(brain.provider).toBe("ollama");
    expect(brain.baseUrl).toBe("http://10.0.0.5:11434/v1");
    expect(brain.model).toBe("llama3.2");

    expect(resolveBrain({ OLLAMA_BASE_URL: "http://localhost:11434/v1" }).baseUrl).toBe(
      "http://localhost:11434/v1",
    );
  });

  it("clamps party guards to sane values", () => {
    const config = getServerConfig({
      CATGPT_MAX_ANSWER_CHARS: "9999",
      CATGPT_RATE_LIMIT: "0",
      CATGPT_RATE_WINDOW_SECONDS: "1",
      CATGPT_GLOBAL_LIMIT: "999999",
    });
    expect(config.maxAnswerChars).toBe(400);
    expect(config.rateLimit).toBe(1);
    expect(config.rateWindowMs).toBe(5_000);
    expect(config.globalLimit).toBe(10_000);
  });

  it("uses sensible defaults", () => {
    const config = getServerConfig({});
    expect(config.maxAnswerChars).toBe(220);
    expect(config.rateLimit).toBe(12);
    expect(config.rateWindowMs).toBe(60_000);
    expect(config.globalLimit).toBe(120);
  });
});
