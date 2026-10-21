import type { ChatMode } from "@/lib/types";
import { CHAT_MODES } from "@/lib/types";

export const MAX_QUESTION_CHARS = 180;
export const MAX_AVOID_ENTRIES = 24;
export const MAX_AVOID_CHARS = 260;

/**
 * Turn whatever a party guest typed into something safe and short.
 * - strips control characters and zero-width junk
 * - collapses runs of whitespace
 * - trims and hard-caps the length
 */
export function normalizeQuestion(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\ufeff]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUESTION_CHARS)
    .trim();
}

export function isChatMode(value: unknown): value is ChatMode {
  return typeof value === "string" && (CHAT_MODES as readonly string[]).includes(value);
}

export function parseMode(value: unknown): ChatMode {
  return isChatMode(value) ? value : "ask";
}

/** Keeps the repeat-guard payload small and string-only. */
export function sanitizeAvoid(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.replace(/\s+/g, " ").trim().slice(0, MAX_AVOID_CHARS))
    .filter(Boolean)
    .slice(0, MAX_AVOID_ENTRIES);
}

/** Basic spam gate: a question needs at least one letter or digit. */
export function isAnswerableQuestion(question: string): boolean {
  return /[\p{L}\p{N}]/u.test(question);
}
