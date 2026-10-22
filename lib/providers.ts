import { buildSystemPrompt, buildUserPrompt, clampReply } from "@/lib/personality";
import type { BrainConfig, ProviderId } from "@/lib/config";
import type { ChatMode } from "@/lib/types";
import type { CatMood } from "@/lib/moods";

export interface ProviderDiagnostics {
  reason?: string;
  status?: number;
  finishReason?: string;
  latencyMs?: number;
  /** Set when the primary model failed and a secondary model answered. */
  fallbackModel?: string;
  /** Seconds until Google says the quota will reset, when provided. */
  retryAfterSeconds?: number;
  /** The model named in Google's quota error (may differ from the requested ID). */
  quotaModel?: string;
}

export interface GenerateArgs {
  question: string;
  mode: ChatMode;
  mood?: CatMood;
  avoid?: string[];
  config: BrainConfig;
  maxAnswerChars: number;
  diagnostics?: ProviderDiagnostics;
}

export interface GenerateResult {
  text: string;
  provider: ProviderId;
}

const REQUEST_TIMEOUT_MS = 9_000;
/** Short budget for non-thinking providers; the prompt caps the answer anyway. */
const TEXT_OUTPUT_TOKENS = 200;
/** Claude 5.x may use adaptive thinking, so leave room for reasoning + the reply. */
const ANTHROPIC_OUTPUT_TOKENS = 800;
/** Thinking models need room for internal reasoning plus the visible answer. */
const GOOGLE_OUTPUT_TOKENS = 1600;
const GOOGLE_COOLDOWN_MS = 10 * 60_000;
let googleCooldownUntil = 0;
let googleCooldownReason: string | null = null;
let googleCooldownModel: string | undefined;
let googleQuotaRetryAfterSeconds: number | undefined;

/** Clears the in-process provider cooldown (used by tests). */
export function resetProviderCooldown(): void {
  googleCooldownUntil = 0;
  googleCooldownReason = null;
  googleCooldownModel = undefined;
  googleQuotaRetryAfterSeconds = undefined;
}

function isCooldownWorthy(reason: string | undefined): boolean {
  return (
    reason === "quota_exhausted" ||
    reason === "network" ||
    reason === "timeout" ||
    reason === "http_500" ||
    reason === "http_502" ||
    reason === "http_503" ||
    reason === "http_504"
  );
}
const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);

class ProviderRequestError extends Error {
  reason?: string;
  retryAfterSeconds?: number;
  quotaModel?: string;

  constructor(
    message: string,
    extra: { reason?: string; retryAfterSeconds?: number; quotaModel?: string } = {},
  ) {
    super(message);
    this.name = "ProviderRequestError";
    this.reason = extra.reason;
    this.retryAfterSeconds = extra.retryAfterSeconds;
    this.quotaModel = extra.quotaModel;
  }
}

function parseRetrySeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.ceil(value);
  if (typeof value !== "string") return undefined;
  const plain = /^(\d+(?:\.\d+)?)s$/.exec(value);
  if (plain) return Math.ceil(Number(plain[1]));
  const hours = /(\d+)h/.exec(value);
  const minutes = /(\d+)m/.exec(value);
  const seconds = /(\d+(?:\.\d+)?)s/.exec(value);
  if (!hours && !minutes && !seconds) return undefined;
  return (
    (hours ? Number(hours[1]) * 3600 : 0) +
    (minutes ? Number(minutes[1]) * 60 : 0) +
    (seconds ? Number(seconds[1]) : 0)
  );
}

function parseGoogleError(text: string): {
  message: string;
  retryAfterSeconds?: number;
  quotaModel?: string;
} {
  try {
    const data = JSON.parse(text) as {
      error?: {
        message?: string;
        details?: Array<Record<string, unknown>>;
      };
    };
    const error = data.error;
    if (!error) return { message: text };
    const details = Array.isArray(error.details) ? error.details : [];
    const retryInfo = details.find((detail) =>
      String(detail["@type"] ?? "").includes("RetryInfo"),
    ) as { retryDelay?: unknown } | undefined;
    const quota = details.find((detail) =>
      String(detail["@type"] ?? "").includes("QuotaFailure"),
    ) as
      | { violations?: Array<{ quotaDimensions?: { model?: string } }> }
      | undefined;
    const message = typeof error.message === "string" ? error.message : text;
    return {
      message,
      retryAfterSeconds: parseRetrySeconds(retryInfo?.retryDelay) ?? parseRetrySeconds(message),
      quotaModel: quota?.violations?.[0]?.quotaDimensions?.model,
    };
  } catch {
    return { message: text };
  }
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function classifyFailure(error: unknown): string {
  if (error instanceof ProviderRequestError && error.reason) return error.reason;
  if (isTimeoutError(error)) return "timeout";
  if (error instanceof Error) {
    const status = /^(\d{3})\b/.exec(error.message);
    if (status) return `http_${status[1]}`;
    if (/fetch failed|network|ENOTFOUND|ECONN|EAI_AGAIN/i.test(error.message)) return "network";
  }
  return "provider_error";
}

function isFallbackWorthy(error: unknown): boolean {
  const reason = classifyFailure(error);
  return (
    reason === "timeout" ||
    reason === "network" ||
    /^http_(404|429|500|502|503|504)$/.test(reason)
  );
}

function logProviderError(provider: ProviderId, detail: string): void {
  // Never includes keys or full guest questions; safe for platform logs.
  console.warn(`[catgpt] ${provider} request failed: ${detail.replace(/\s+/g, " ").slice(0, 300)}`);
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
    max_tokens: TEXT_OUTPUT_TOKENS,
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
      Authorization: `Bearer ${apiKey}`,
      "anthropic-version": "2026-10-21",
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: ANTHROPIC_OUTPUT_TOKENS,
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
interface GoogleReply {
  text: string | null;
  blockReason?: string;
  finishReason?: string;
}

interface GoogleCallOptions {
  timeoutMs?: number;
  retryTransient?: boolean;
}

async function callGoogle(
  apiKey: string,
  model: string,
  system: string,
  user: string,
  options: GoogleCallOptions = {},
): Promise<GoogleReply> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const retryTransient = options.retryTransient ?? true;

  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig: { temperature: 1.15, topP: 0.95, maxOutputTokens: GOOGLE_OUTPUT_TOKENS },
    // The default filters are aggressive for a risqué party cat. Keep high-harm
    // blocked, but stop flagging harmless innuendo as a crisis.
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  const send = () =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      },
    );

  let response: Response;
  try {
    response = await send();
  } catch (error) {
    if (!retryTransient || !isTimeoutError(error)) throw error;
    await sleep(250);
    response = await send();
  }

  if (retryTransient && TRANSIENT_STATUS.has(response.status)) {
    await response.text();
    await sleep(400);
    response = await send();
  }

  if (!response.ok) {
    const errorText = await response.text();
    const info = parseGoogleError(errorText);
    throw new ProviderRequestError(`${response.status} ${info.message.slice(0, 200)}`, {
      reason: response.status === 429 ? "quota_exhausted" : undefined,
      retryAfterSeconds: info.retryAfterSeconds,
      quotaModel: info.quotaModel,
    });
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> };
      finishReason?: string;
    }>;
    promptFeedback?: { blockReason?: string };
  };
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts
    ?.filter((part) => part.thought !== true)
    .map((part) => part.text ?? "")
    .join(" ")
    .trim();

  return {
    text: text || null,
    blockReason: data.promptFeedback?.blockReason,
    finishReason: candidate?.finishReason,
  };
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
  diagnostics,
}: GenerateArgs): Promise<GenerateResult | null> {
  const started = Date.now();
  const finishLatency = () => {
    if (diagnostics) diagnostics.latencyMs = Date.now() - started;
  };

  if (!config.ready || config.provider === "offline") {
    if (diagnostics) diagnostics.reason = "not_configured";
    finishLatency();
    return null;
  }

  if (config.provider === "google" && Date.now() < googleCooldownUntil) {
    if (diagnostics) {
      diagnostics.reason =
        googleCooldownReason === "quota_exhausted" ? "quota_cooldown" : "provider_cooldown";
      diagnostics.retryAfterSeconds = Math.max(
        1,
        googleQuotaRetryAfterSeconds ?? Math.ceil((googleCooldownUntil - Date.now()) / 1000),
      );
      diagnostics.quotaModel = googleCooldownModel;
    }
    finishLatency();
    return null;
  }

  const system = buildSystemPrompt({ mode, mood, maxChars: maxAnswerChars });
  const user = buildUserPrompt(question, avoid);

  try {
    let raw: string | null = null;
    let blockReason: string | undefined;
    let finishReason: string | undefined;

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
        const fallback =
          config.fallbackModel && config.fallbackModel !== config.model
            ? config.fallbackModel
            : undefined;
        let reply: GoogleReply;
        try {
          reply = await callGoogle(
            config.apiKey,
            config.model,
            system,
            user,
            fallback ? { timeoutMs: 6_000, retryTransient: true } : {},
          );
        } catch (error) {
          if (!fallback || !isFallbackWorthy(error)) throw error;
          if (diagnostics) diagnostics.fallbackModel = fallback;
          reply = await callGoogle(config.apiKey, fallback, system, user, {
            timeoutMs: 6_000,
            retryTransient: false,
          });
        }

        // A safety block or a thinking model that spent its budget before writing
        // gets one try on the alternate model before we give up.
        if (
          !reply.text &&
          fallback &&
          (reply.blockReason || reply.finishReason === "SAFETY" || reply.finishReason === "MAX_TOKENS")
        ) {
          if (diagnostics) diagnostics.fallbackModel = fallback;
          reply = await callGoogle(config.apiKey, fallback, system, user, {
            timeoutMs: 6_000,
            retryTransient: false,
          });
        }
        raw = reply.text;
        blockReason = reply.blockReason;
        finishReason = reply.finishReason;
        break;
      }
      default:
        if (diagnostics) diagnostics.reason = "unsupported_provider";
        finishLatency();
        return null;
    }

    if (!raw) {
      if (diagnostics) {
        diagnostics.reason = blockReason
          ? "blocked"
          : finishReason === "SAFETY"
            ? "safety"
            : finishReason === "MAX_TOKENS"
              ? "truncated"
              : "empty_completion";
        diagnostics.finishReason = finishReason;
      }
      finishLatency();
      return null;
    }

    const text = clampReply(raw, maxAnswerChars);
    if (!text) {
      if (diagnostics) diagnostics.reason = "empty_after_cleanup";
      finishLatency();
      return null;
    }

    finishLatency();
    return { text, provider: config.provider };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (diagnostics) {
      diagnostics.reason = classifyFailure(error);
      if (error instanceof ProviderRequestError) {
        diagnostics.retryAfterSeconds = error.retryAfterSeconds;
        diagnostics.quotaModel = error.quotaModel;
      }
    }
    finishLatency();
    logProviderError(config.provider, message.slice(0, 240));
    if (config.provider === "google" && isCooldownWorthy(diagnostics?.reason)) {
      googleCooldownUntil =
        Date.now() + (diagnostics?.reason === "quota_exhausted" ? GOOGLE_COOLDOWN_MS : 60_000);
      googleCooldownReason = diagnostics?.reason ?? "provider_error";
      googleCooldownModel = diagnostics?.quotaModel;
      if (diagnostics?.reason === "quota_exhausted") {
        googleQuotaRetryAfterSeconds = diagnostics.retryAfterSeconds;
      }
    }
    return null;
  }
}

