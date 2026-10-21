import type { ChatMode } from "@/lib/types";

export interface ModeMeta {
  id: ChatMode;
  label: string;
  short: string;
  blurb: string;
  placeholder: string;
}

/**
 * Client-safe copy. Kept separate from `personality.ts` so the system prompt
 * never ships to the browser.
 */
export const MODE_META: Record<ChatMode, ModeMeta> = {
  ask: {
    id: "ask",
    label: "Ask CatGPT",
    short: "Ask",
    blurb: "The Oracle: deadpan verdicts from a cat who has read everything.",
    placeholder: "Ask the oracle…",
  },
  roast: {
    id: "roast",
    label: "Roast Me",
    short: "Roast",
    blurb: "The Gremlin: short, sharp, and entirely uncalled for.",
    placeholder: "Offer yourself to the gremlin…",
  },
  flirt: {
    id: "flirt",
    label: "Flirt With Me",
    short: "Flirt",
    blurb: "The Lap Cat: needy, tactile, emotionally unavailable.",
    placeholder: "Say something reckless…",
  },
};

