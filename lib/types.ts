/**
 * Shared types for the CatGPT party brain.
 * These are intentionally tiny so the client bundle stays lean.
 */

export type ChatMode = "ask" | "roast" | "flirt";

export const CHAT_MODES: readonly ChatMode[] = ["ask", "roast", "flirt"] as const;

export interface ChatRequestBody {
  question: string;
  mode: ChatMode;
  /** Recently shown answers, so the offline brain never repeats itself. */
  avoid?: string[];
}

export interface ChatSuccess {
  reply: string;
  source: "ai" | "offline";
  mode: ChatMode;
  /** The cat mood used for this reply, e.g. "frisky". */
  mood?: string;
  /** Present only when a real model answered, e.g. "openai". */
  provider?: string;
  /** Why the offline brain answered instead of the model, when applicable. */
  fallbackReason?: string;
  /** Number of questions the guest may still ask in this window. */
  remaining?: number;
}

export interface ChatFailure {
  error: string;
  retryAfterSeconds?: number;
}

export type ChatApiResponse = ChatSuccess | ChatFailure;
