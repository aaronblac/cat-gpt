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
    blurb: "Frisky, moody, and taking questions under protest.",
    placeholder: "Ask the cat anything…",
  },
  roast: {
    id: "roast",
    label: "Roast Me",
    short: "Roast",
    blurb: "Playful, surgical, entirely uncalled for.",
    placeholder: "Ask to be humbled…",
  },
  flirt: {
    id: "flirt",
    label: "Flirt With Me",
    short: "Flirt",
    blurb: "Charmingly unavailable. Emotionally a fire exit.",
    placeholder: "Say something bold…",
  },
};

