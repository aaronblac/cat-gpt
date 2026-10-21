"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CatAvatar } from "@/components/CatAvatar";
import { MODE_META } from "@/lib/modes";
import { pickMood } from "@/lib/moods";
import { buildOfflineReply } from "@/lib/offlineBrain";
import { playReply, playReset, playSend, unlockAudio } from "@/lib/sfx";
import { CHAT_MODES, type ChatApiResponse, type ChatMode } from "@/lib/types";

const MAX_QUESTION_CHARS = 180;

/** Seconds before the screen clears itself for the next guest. */
const RESET_SECONDS = (() => {
  const raw = Number(process.env.NEXT_PUBLIC_RESET_SECONDS);
  if (!Number.isFinite(raw)) return 30;
  return Math.min(300, Math.max(10, Math.round(raw)));
})();

type Status = "idle" | "thinking";
type LinkState = "live" | "local" | null;

interface Exchange {
  question: string;
  reply: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored === "1";
  } catch {
    return fallback;
  }
}

function writeBool(key: string, value: boolean): void {
  try {
    window.localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* private browsing or full storage — not worth interrupting the party */
  }
}

export function CatGptApp() {
  const [mode, setMode] = useState<ChatMode>("ask");
  const [question, setQuestion] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [pending, setPending] = useState<string | null>(null);
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [guestCount, setGuestCount] = useState(0);
  const [link, setLink] = useState<LinkState>(null);

  const [soundOn, setSoundOn] = useState(true);
  const [speakOn, setSpeakOn] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const avoidRef = useRef<string[]>([]);
  const inFlightRef = useRef(false);
  const soundRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  const meta = MODE_META[mode];

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  // Restore preferences after mount so server and client markup match.
  useEffect(() => {
    setSoundOn(readBool("catgpt:sound", true));
    setSpeakOn(readBool("catgpt:speak", false));
    setSpeechSupported("speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined");
    setCanFullscreen(Boolean(document.fullscreenEnabled));

    try {
      const stored = Number(window.sessionStorage.getItem("catgpt:guests") ?? "0");
      if (Number.isFinite(stored) && stored > 0) setGuestCount(Math.min(9999, Math.floor(stored)));
    } catch {
      /* ignore */
    }

    const onFullscreen = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  // Report which brain is wired up before the first question is asked.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/health", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { brain?: { provider?: string; ready?: boolean } } | null) => {
        if (cancelled || !data?.brain?.provider) return;
        const healthy = data.brain.provider !== "offline" && data.brain.ready !== false;
        setLink(healthy ? "live" : "local");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Register the offline shell in production only. In development a stale cache
  // would fight with hot reloading.
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const timer = window.setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  // Keep the costume screen awake. Re-acquire after the tab is backgrounded.
  useEffect(() => {
    type WakeLockLike = { release: () => Promise<void> };
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<WakeLockLike> };
    };
    if (!nav.wakeLock) return;

    let lock: WakeLockLike | null = null;
    let cancelled = false;

    const request = async () => {
      try {
        lock = await nav.wakeLock!.request("screen");
      } catch {
        /* low power mode or unsupported — the app still works */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => undefined);
      lock = null;
    };
  }, []);

  // Speak the answer when the guest has enabled the voice toggle.
  useEffect(() => {
    if (!speakOn || !exchange) return;
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(exchange.reply);
    utterance.rate = 1.02;
    utterance.pitch = 0.85;
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(
      (voice) => /en[-_]/i.test(voice.lang) && /Google|Samantha|Daniel/i.test(voice.name),
    );
    if (preferred) utterance.voice = preferred;
    window.speechSynthesis.speak(utterance);

    return () => window.speechSynthesis.cancel();
  }, [exchange, speakOn]);

  const reset = useCallback(() => {
    setExchange(null);
    setPending(null);
    setQuestion("");
    setError(null);
    setSecondsLeft(null);
    setStatus("idle");
    inFlightRef.current = false;
    if (soundRef.current) playReset();
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Countdown to the next victim. Pauses while someone is typing.
  useEffect(() => {
    if (!exchange) return;
    const timer = window.setInterval(() => {
      if ((inputRef.current?.value ?? "").trim().length > 0) return;
      setSecondsLeft((current) => (current === null ? current : Math.max(0, current - 1)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [exchange]);

  useEffect(() => {
    if (secondsLeft === 0 && exchange) reset();
  }, [secondsLeft, exchange, reset]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const rememberReply = (reply: string) => {
    avoidRef.current = [reply, ...avoidRef.current].slice(0, 24);
  };

  const deliver = useCallback((asked: string, reply: string, source: "live" | "local") => {
    const trimmed = reply.trim();
    setExchange({ question: asked, reply: trimmed });
    setPending(null);
    setStatus("idle");
    setSecondsLeft(RESET_SECONDS);
    setLink(source);
    rememberReply(trimmed);
    setGuestCount((count) => {
      const next = Math.min(9999, count + 1);
      try {
        window.sessionStorage.setItem("catgpt:guests", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    if (soundRef.current) playReply();
  }, []);

  const ask = useCallback(
    async (raw: string) => {
      const asked = raw.replace(/\s+/g, " ").trim().slice(0, MAX_QUESTION_CHARS);
      if (!asked || inFlightRef.current) return;

      unlockAudio();
      if (soundRef.current) playSend();

      inFlightRef.current = true;
      setError(null);
      setExchange(null);
      setPending(asked);
      setStatus("thinking");
      setSecondsLeft(null);
      setQuestion("");

      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 25_000);

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: asked, mode, avoid: avoidRef.current }),
          signal: controller.signal,
        });

        const data = (await response.json().catch(() => null)) as ChatApiResponse | null;

        if (!response.ok || !data || "error" in data) {
          const message =
            data && "error" in data
              ? data.error
              : "CatGPT is pretending not to hear you. Try again.";
          setError(message);
          setPending(null);
          setStatus("idle");
          setQuestion(asked);
          return;
        }

        deliver(asked, data.reply, data.source === "ai" ? "live" : "local");
      } catch {
        // Total network failure (dead hotspot, airplane mode). Answer locally so
        // the costume never dies mid-conversation.
        const reply = buildOfflineReply({
          question: asked,
          mode,
          mood: pickMood(),
          avoid: avoidRef.current,
        });
        deliver(asked, reply, "local");
      } finally {
        window.clearTimeout(timeout);
        inFlightRef.current = false;
        abortRef.current = null;
      }
    },
    [deliver, mode],
  );

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void ask(question);
  };

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    soundRef.current = next;
    writeBool("catgpt:sound", next);
    if (next) {
      unlockAudio();
      playSend();
    }
  };

  const toggleSpeech = () => {
    const next = !speakOn;
    setSpeakOn(next);
    writeBool("catgpt:speak", next);
    if (!next && "speechSynthesis" in window) window.speechSynthesis.cancel();
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* iOS Safari blocks element fullscreen; Guided Access covers it */
    }
  };

  const startMode = (next: ChatMode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
  };

  const progress = secondsLeft === null ? 0 : (secondsLeft / RESET_SECONDS) * 100;
  const showIntro = !exchange && status === "idle" && !pending;

  return (
    <main className="stage" onPointerDown={unlockAudio}>
      <div className="bg-aurora" aria-hidden="true" />
      <div className="bg-grid" aria-hidden="true" />
      <div className="bg-vignette" aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <CatAvatar size={44} decorative />
          <div className="brand-text">
            <span className="wordmark">
              Cat<span className="wordmark-accent">GPT</span>
            </span>
            <span className="subline">
              MEOWdel 9.0
              <span className="subline-long">
                {" "}<span className="dot">·</span> Artificial Feline Intelligence
              </span>
            </span>
          </div>
        </div>

        <div className="topbar-right">
          <span className={`online online--${link ?? "ready"}`}>
            <i aria-hidden="true" />
            {link === "local" ? "Local wit" : "Online"}
          </span>
          <div className="controls">
            <button
              type="button"
              className={`icon-btn ${soundOn ? "is-on" : ""}`}
              onClick={toggleSound}
              aria-pressed={soundOn}
              aria-label={soundOn ? "Mute CatGPT sounds" : "Enable CatGPT sounds"}
              title={soundOn ? "Sound on" : "Sound off"}
            >
              <SoundIcon on={soundOn} />
            </button>
            {speechSupported && (
              <button
                type="button"
                className={`icon-btn ${speakOn ? "is-on" : ""}`}
                onClick={toggleSpeech}
                aria-pressed={speakOn}
                aria-label={speakOn ? "Stop speaking answers aloud" : "Speak answers aloud"}
                title={speakOn ? "Voice on" : "Voice off"}
              >
                <VoiceIcon on={speakOn} />
              </button>
            )}
            {canFullscreen && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => void toggleFullscreen()}
                aria-label={isFullscreen ? "Exit full screen" : "Enter full screen"}
                title={isFullscreen ? "Exit full screen" : "Full screen"}
              >
                <ExpandIcon expanded={isFullscreen} />
              </button>
            )}
          </div>
        </div>
      </header>

      <section className={`arena ${showIntro ? "arena--intro" : "arena--chat"}`}>
        {showIntro ? (
          <div className="intro">
            <div className="intro-halo">
              <CatAvatar variant="full" mood="smug" />
            </div>
          </div>
        ) : (
          <div className="thread" role="log" aria-live="polite" aria-relevant="additions text">
            {pending && (
              <div className="bubble bubble--guest">
                <span className="bubble-label">Human</span>
                <p>{pending}</p>
              </div>
            )}

            {status === "thinking" && (
              <div className="bubble bubble--cat bubble--thinking">
                <span className="bubble-label">
                  <CatAvatar size={18} decorative /> CatGPT
                </span>
                <p className="purrcessing">
                  Purrcessing<span className="ellipsis" aria-hidden="true">…</span>
                </p>
                <div className="think-track" aria-hidden="true">
                  <span />
                </div>
              </div>
            )}

            {exchange && (
              <>
                <div className="bubble bubble--guest">
                  <span className="bubble-label">Human</span>
                  <p>{exchange.question}</p>
                </div>
                <div className="bubble bubble--cat">
                  <span className="bubble-label">
                    <CatAvatar size={18} decorative /> CatGPT
                  </span>
                  <p>{exchange.reply}</p>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <div className="dock">
        {error && (
          <div className="error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}

        <div className="modes" role="group" aria-label="Choose CatGPT's mood">
          {CHAT_MODES.map((id) => (
            <button
              key={id}
              type="button"
              className={`mode ${mode === id ? "is-active" : ""}`}
              onClick={() => startMode(id)}
              aria-pressed={mode === id}
              title={MODE_META[id].blurb}
            >
              {MODE_META[id].short}
            </button>
          ))}
        </div>

        <form className="askbar" onSubmit={onSubmit}>
          <input
            ref={inputRef}
            className="ask-input"
            value={question}
            onChange={(event) => setQuestion(event.target.value.slice(0, MAX_QUESTION_CHARS))}
            placeholder={meta.placeholder}
            aria-label="Your question for CatGPT"
            maxLength={MAX_QUESTION_CHARS}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="sentences"
            spellCheck={false}
            disabled={status === "thinking"}
          />
          <button
            type="submit"
            className="send"
            disabled={status === "thinking" || question.trim().length === 0}
            aria-label="Send question"
          >
            <SendIcon />
          </button>
        </form>

        <div className="dock-meta">
          <span className="guest" title="Questions answered tonight">
            Q<span className="guest-num">{pad(guestCount)}</span>
          </span>
          <span className={`link link--${link ?? "idle"}`}>
            {link === "live" ? "NEURAL LINK" : link === "local" ? "OFFLINE WIT" : "READY TO JUDGE"}
          </span>
          {secondsLeft !== null && exchange ? (
            <button type="button" className="next" onClick={reset}>
              Next victim <span className="next-time">0:{pad(secondsLeft)}</span>
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>

        <div className="timerbar" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </main>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 10v4h3l4 3V7L7 10H4Z" strokeLinejoin="round" />
      {on ? (
        <>
          <path d="M15.5 9a4 4 0 0 1 0 6" strokeLinecap="round" />
          <path d="M18 6.5a7.5 7.5 0 0 1 0 11" strokeLinecap="round" />
        </>
      ) : (
        <path d="m16 9 5 6M21 9l-5 6" strokeLinecap="round" />
      )}
    </svg>
  );
}

function VoiceIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" strokeLinecap="round" />
      {on && <path d="M3 4.5c1.4 1.2 1.4 2.8 0 4" strokeLinecap="round" strokeOpacity="0.6" />}
    </svg>
  );
}

function ExpandIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      {expanded ? (
        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
      ) : (
        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      )}
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12h15M13 5.5 19.5 12 13 18.5" />
    </svg>
  );
}

