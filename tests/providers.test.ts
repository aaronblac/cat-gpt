import { afterEach, describe, expect, it, vi } from "vitest";
import { generateAiReply } from "@/lib/providers";
import type { BrainConfig } from "@/lib/config";

const base = {
  question: "Are you single?",
  mode: "ask" as const,
  mood: "smug" as const,
  avoid: ["An older joke."],
  maxAnswerChars: 220,
};

const openaiConfig: BrainConfig = {
  provider: "openai",
  model: "gpt-4o-mini",
  apiKey: "sk-test",
  baseUrl: "https://api.openai.com/v1",
  ready: true,
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("provider adapter", () => {
  it("returns null in offline mode without touching the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAiReply({
      ...base,
      config: { provider: "offline", model: "offline-comedy-engine", ready: true },
    });

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses an OpenAI-compatible reply and sends the persona", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "  Single. Obviously.  " } }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAiReply({ ...base, config: openaiConfig });

    expect(result).toEqual({ text: "Single. Obviously.", provider: "openai" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    const body = JSON.parse(String(init.body));
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("MODE: ASK — THE ORACLE");
    expect(body.messages[0].content).toContain("CURRENT MOOD: SMUG");
    expect(body.messages[1].content).toContain("<guest_question>");
    expect(body.presence_penalty).toBeGreaterThan(0);
    expect(body.max_tokens).toBeLessThanOrEqual(200);
  });

  it("retries without unsupported parameters when a model rejects them", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("Unsupported value: 'temperature'", { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "Fine. Tuna." } }] }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAiReply({ ...base, config: openaiConfig });

    expect(result?.text).toBe("Fine. Tuna.");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryBody = JSON.parse(String((fetchMock.mock.calls[1] as [string, RequestInit])[1].body));
    expect(retryBody.temperature).toBeUndefined();
    expect(retryBody.max_tokens).toBeUndefined();
  });

  it("calls Anthropic with the right shape and headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ content: [{ type: "text", text: "I am the prize." }] }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAiReply({
      ...base,
      config: {
        provider: "anthropic",
        model: "claude-haiku-4-5",
        apiKey: "sk-ant",
        ready: true,
      },
    });

    expect(result).toEqual({ text: "I am the prize.", provider: "anthropic" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-ant");
    const body = JSON.parse(String(init.body));
    expect(body.system).toContain("CatGPT");
    expect(body.messages[0].content).toContain("Are you single?");
  });

  it("calls Gemini with the model in the path and the key in a header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "Tuna is a love language." }] } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAiReply({
      ...base,
      config: {
        provider: "google",
        model: "gemini-3.5-flash-lite",
        apiKey: "goog-key",
        ready: true,
      },
    });

    expect(result).toEqual({ text: "Tuna is a love language.", provider: "google" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("models/gemini-3.5-flash-lite:generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("goog-key");
    expect(url).not.toContain("goog-key");
  });

  it("returns null and logs when the provider fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await generateAiReply({ ...base, config: openaiConfig });

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("openai request failed"));
  });

  it("returns null for an empty completion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ choices: [{ message: { content: "   " } }] }), {
          status: 200,
        }),
      ),
    );
    expect(await generateAiReply({ ...base, config: openaiConfig })).toBeNull();
  });

  it("skips providers that are not ready", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateAiReply({
      ...base,
      config: { ...openaiConfig, ready: false, apiKey: undefined },
    });
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
