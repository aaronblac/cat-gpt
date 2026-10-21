import { buildSystemPrompt, buildUserPrompt, clampReply } from "@/lib/personality";
import type { BrainConfig, ProviderId } from "@/lib/config";
import type { ChatMode } from "@/lib/types";
import type { CatMood } from "@/lib/moods";

export interface GenerateArgs {
  question: string;
  mode: ChatMode;
  mood?: CatMood;
  avoid?: string[];
  config: BrainConfig;
  maxAnswerChars: number;
}

export interface GenerateResult {
  text: string;
  provider: ProviderId;
}

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_OUTPUT_TOKENS = 160;

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function logProviderError(provider: ProviderId, detail: string): void {
  // Never includes keys or full guest questions; safe for platform logs.
  console.warn(`[catgpt] ${provider} request failed: ${detail}`);
}

interface OpenAiCompatibleArgs {
  baseUrl: string;
  apiKey?: string;
  model: string;
  system: string;
  user: string;
  provider: ProviderId;
}

/**
 * Covers OpenAI, Groq, OpenRouter and Ollama's compatibility endpoint.
 * Retries once without optional parameters for models that reject them
 * (reasoning models dislike `temperature`; some reject `max_tokens`).
 */
async function callOpenAiCompatible({
  baseUrl,
  apiKey,
  model,
  system,
  user,
  provider,
}: OpenAiCompatibleArgs): Promise<string | null> {
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  if (provider === "openrouter") headers["X-Title"] = "CatGPT";

  const send = (body: Record<string, unknown>) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: timeoutSignal(),
      cache: "no-store",
    });

  let response = await send({
    model,
    messages,
    temperature: 1,
    presence_penalty: 0.6,
    frequency_penalty: 0.5,
    max_tokens: MAX_OUTPUT_TOKENS,
  });

  if (!response.ok) {
    const errorText = await response.text();
    const paramIssue =
      response.status === 400 &&
      /temperature|max_tokens|max_completion|presence_penalty|frequency_penalty/i.test(errorText);
    if (!paramIssue) {
      throw new Error(`${response.status} ${errorText.slice(0, 200)}`);
    }
    response = await send({ model, messages });
  }

  if (!response.ok) {
    throw new Error(`${response.status} retry failed`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return data.choices?.[0]?.message?.content?.trim() ?? null;
}

async function callAnthropic(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string | null> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 1,
      messages: [{ role: "user", content: user }],
    }),
    signal: timeoutSignal(),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return data.content?.find((part) => part.type === "text")?.text?.trim() ?? null;
}
async function callGoogle(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<string | null> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { temperature: 1.15, topP: 0.95, maxOutputTokens: MAX_OUTPUT_TOKENS },
      }),
      signal: timeoutSignal(),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`${response.status} ${errorText.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join(" ")
    .trim();
  return text || null;
}

/**
 * Asks the configured provider for one in-character reply.
 * Returns null on any failure so the route can fall back to the offline brain.
 */
export async function generateAiReply({
  question,
  mode,
  mood = "frisky",
  avoid = [],
  config,
  maxAnswerChars,
}: GenerateArgs): Promise<GenerateResult | null> {
  if (!config.ready || config.provider === "offline") return null;

  const system = buildSystemPrompt({ mode, mood, maxChars: maxAnswerChars });
  const user = buildUserPrompt(question, avoid);

  try {
    let raw: string | null = null;

    switch (config.provider) {
      case "openai":
      case "groq":
      case "openrouter":
      case "ollama": {
        const fallbackBase =
          config.provider === "groq"
            ? "https://api.groq.com/openai/v1"
            : config.provider === "openrouter"
              ? "https://openrouter.ai/api/v1"
              : "";
        const baseUrl = config.baseUrl || fallbackBase;
        if (!baseUrl) throw new Error("Missing base URL");
        raw = await callOpenAiCompatible({
          baseUrl,
          apiKey: config.apiKey,
          model: config.model,
          system,
          user,
          provider: config.provider,
        });
        break;
      }
      case "anthropic": {
        if (!config.apiKey) throw new Error("Missing API key");
        raw = await callAnthropic(config.apiKey, config.model, system, user);
        break;
      }
      case "google": {
        if (!config.apiKey) throw new Error("Missing API key");
        raw = await callGoogle(config.apiKey, config.model, system, user);
        break;
      }
      default:
        return null;
    }

    if (!raw) return null;
    const text = clampReply(raw, maxAnswerChars);
    if (!text) return null;
    return { text, provider: config.provider };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    logProviderError(config.provider, message.slice(0, 240));
    return null;
  }
}

