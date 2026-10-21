/**
 * Server-side configuration. Nothing here is exposed to the browser except the
 * explicitly `NEXT_PUBLIC_` values at build time.
 */

export type ProviderId = "openai" | "anthropic" | "google" | "groq" | "openrouter" | "ollama";
export type BrainChoice = ProviderId | "offline";

interface ProviderDefinition {
  id: ProviderId;
  apiKeyEnv: string;
  modelEnv: string;
  defaultModel: string;
  defaultBaseUrl?: string;
}

/** Auto-detection order. The first provider with credentials wins. */
const PROVIDERS: ProviderDefinition[] = [
  {
    id: "openai",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o-mini",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  {
    id: "anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-haiku-4-5",
  },
  {
    id: "google",
    apiKeyEnv: "GOOGLE_GENERATIVE_AI_API_KEY",
    modelEnv: "GOOGLE_MODEL",
    defaultModel: "gemini-3.5-flash-lite",
  },
  {
    id: "groq",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "llama-3.3-70b-versatile",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
  },
  {
    id: "openrouter",
    apiKeyEnv: "OPENROUTER_API_KEY",
    modelEnv: "OPENROUTER_MODEL",
    defaultModel: "google/gemini-3.5-flash-lite",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
  },
  {
    id: "ollama",
    apiKeyEnv: "OLLAMA_API_KEY",
    modelEnv: "OLLAMA_MODEL",
    defaultModel: "llama3.2",
  },
];

export interface BrainConfig {
  provider: BrainChoice;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  /** False when the requested provider is missing credentials. */
  ready: boolean;
  note?: string;
}

export interface ServerConfig {
  brain: BrainConfig;
  maxAnswerChars: number;
  rateLimit: number;
  rateWindowMs: number;
  globalLimit: number;
}

type Env = Record<string, string | undefined>;

function readInt(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function trim(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Pure and injectable so the routing rules can be tested without touching env. */
export function resolveBrain(env: Env = process.env): BrainConfig {
  const requested = trim(env.CATGPT_PROVIDER).toLowerCase();

  if (requested === "offline") {
    return { provider: "offline", model: "offline-comedy-engine", ready: true, note: "Forced offline mode." };
  }

  const explicit = PROVIDERS.find((provider) => provider.id === requested);
  const candidates = explicit ? [explicit] : PROVIDERS;

  for (const provider of candidates) {
    if (provider.id === "ollama") {
      const configured = trim(env.OLLAMA_BASE_URL).replace(/\/+$/, "");
      if (configured) {
        // Ollama exposes an OpenAI-compatible API under /v1.
        const baseUrl = /\/v1$/.test(configured) ? configured : `${configured}/v1`;
        return {
          provider: "ollama",
          model: trim(env.OLLAMA_MODEL) || provider.defaultModel,
          baseUrl,
          ready: true,
        };
      }
      continue;
    }

    const apiKey = trim(env[provider.apiKeyEnv]);
    if (apiKey) {
      const overrideBase = provider.id === "openai" ? trim(env.OPENAI_BASE_URL) : "";
      return {
        provider: provider.id,
        model: trim(env[provider.modelEnv]) || provider.defaultModel,
        apiKey,
        baseUrl: (overrideBase || provider.defaultBaseUrl || "").replace(/\/+$/, ""),
        ready: true,
      };
    }
  }

  if (explicit) {
    return {
      provider: explicit.id,
      model: trim(env[explicit.modelEnv]) || explicit.defaultModel,
      ready: false,
      note: `${explicit.apiKeyEnv} is not set, so CatGPT is using the offline comedy engine.`,
    };
  }

  return {
    provider: "offline",
    model: "offline-comedy-engine",
    ready: true,
    note: "No API key found. Using the built-in offline comedy engine.",
  };
}

export function getServerConfig(env: Env = process.env): ServerConfig {
  return {
    brain: resolveBrain(env),
    maxAnswerChars: readInt(env, "CATGPT_MAX_ANSWER_CHARS", 220, 80, 400),
    rateLimit: readInt(env, "CATGPT_RATE_LIMIT", 12, 1, 1000),
    rateWindowMs: readInt(env, "CATGPT_RATE_WINDOW_SECONDS", 60, 5, 3600) * 1000,
    globalLimit: readInt(env, "CATGPT_GLOBAL_LIMIT", 120, 1, 10000),
  };
}

/** Public, secret-free description for /api/health and the boot log. */
export function describeBrain(brain: BrainConfig): {
  provider: BrainChoice;
  model: string;
  ready: boolean;
  note?: string;
} {
  return { provider: brain.provider, model: brain.model, ready: brain.ready, note: brain.note };
}
