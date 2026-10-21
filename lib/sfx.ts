/**
 * Tiny synthesized sound effects. No audio files, no network cost, no
 * licensing — just a couple of WebAudio chirps so the costume feels alive.
 * All calls are safe to make on the server or before a user gesture.
 */

type AudioContextConstructor = typeof AudioContext;

let context: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (context) return context;

  const w = window as unknown as { AudioContext?: AudioContextConstructor; webkitAudioContext?: AudioContextConstructor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;

  try {
    context = new Ctor();
  } catch {
    return null;
  }
  return context;
}

/** Call on the first tap so iOS unlocks audio for the rest of the night. */
export function unlockAudio(): void {
  const ctx = getContext();
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

function tone(
  ctx: AudioContext,
  startHz: number,
  endHz: number,
  duration: number,
  delay: number,
  type: OscillatorType,
  volume: number,
): void {
  const now = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(startHz, now);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, endHz), now + duration);

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.02);
}

/** A curious upward "mrrp" when a question is sent. */
export function playSend(): void {
  const ctx = getContext();
  if (!ctx) return;
  tone(ctx, 430, 720, 0.12, 0, "triangle", 0.05);
  tone(ctx, 660, 980, 0.09, 0.06, "sine", 0.03);
}

/** Two smug little notes when the answer lands. */
export function playReply(): void {
  const ctx = getContext();
  if (!ctx) return;
  tone(ctx, 740, 660, 0.1, 0, "sine", 0.04);
  tone(ctx, 560, 470, 0.16, 0.1, "triangle", 0.035);
}

/** A soft descending "goodbye" when the screen resets for the next guest. */
export function playReset(): void {
  const ctx = getContext();
  if (!ctx) return;
  tone(ctx, 520, 300, 0.14, 0, "sine", 0.03);
}
