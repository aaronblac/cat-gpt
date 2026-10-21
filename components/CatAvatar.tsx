"use client";

import { useId } from "react";

export type CatMood = "idle" | "thinking" | "smug";

interface CatAvatarProps {
  size?: number;
  mood?: CatMood;
  /** Decorative repeats (hero + header) should be hidden from screen readers. */
  decorative?: boolean;
  className?: string;
}

/**
 * The CatGPT mascot: a hand-built SVG cat with glowing eyes, a nameplate
 * collar, whiskers and an orbiting "thinking" halo. No image assets, so it
 * stays razor sharp on any tablet and adds zero network weight.
 */
export function CatAvatar({ size = 160, mood = "idle", decorative, className = "" }: CatAvatarProps) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const headId = `head-${uid}`;
  const strokeId = `stroke-${uid}`;
  const glowId = `glow-${uid}`;
  const eyeId = `eye-${uid}`;

  return (
    <div
      className={`cat-avatar cat-avatar--${mood} ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "CatGPT, a glowing neon cat wearing a CATGPT collar"}
    >
      <svg viewBox="0 0 200 200" width="100%" height="100%" focusable="false">
        <defs>
          <radialGradient id={headId} cx="50%" cy="34%" r="70%">
            <stop offset="0%" stopColor="#1b2b4d" />
            <stop offset="55%" stopColor="#0b1122" />
            <stop offset="100%" stopColor="#05070d" />
          </radialGradient>
          <linearGradient id={strokeId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5ee7ff" />
            <stop offset="55%" stopColor="#7b8cff" />
            <stop offset="100%" stopColor="#ff5cc8" />
          </linearGradient>
          <linearGradient id={eyeId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#c9fbff" />
            <stop offset="45%" stopColor="#5ee7ff" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <filter id={glowId} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="cat-halo" filter={`url(#${glowId})`}>
          <circle cx="100" cy="100" r="86" fill="none" stroke="#5ee7ff" strokeOpacity="0.16" strokeWidth="1" />
          <circle
            className="cat-halo-dash"
            cx="100"
            cy="100"
            r="78"
            fill="none"
            stroke={`url(#${strokeId})`}
            strokeOpacity="0.55"
            strokeWidth="1.4"
            strokeDasharray="4 18"
            strokeLinecap="round"
          />
          <circle
            className="cat-halo-dash cat-halo-dash--slow"
            cx="100"
            cy="100"
            r="94"
            fill="none"
            stroke="#ff5cc8"
            strokeOpacity="0.18"
            strokeWidth="1"
            strokeDasharray="1 26"
            strokeLinecap="round"
          />
        </g>

        <g className="cat-float">
          {/* Ears */}
          <g filter={`url(#${glowId})`}>
            <path d="M54 62 L46 22 L86 44 Z" fill={`url(#${headId})`} stroke={`url(#${strokeId})`} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M146 62 L154 22 L114 44 Z" fill={`url(#${headId})`} stroke={`url(#${strokeId})`} strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M58 55 L54 33 L76 45 Z" fill="#ff5cc8" fillOpacity="0.22" />
            <path d="M142 55 L146 33 L124 45 Z" fill="#ff5cc8" fillOpacity="0.22" />
          </g>

          {/* Head */}
          <path
            d="M100 38 C136 38 158 60 158 98 C158 138 134 162 100 162 C66 162 42 138 42 98 C42 60 64 38 100 38 Z"
            fill={`url(#${headId})`}
            stroke={`url(#${strokeId})`}
            strokeWidth="2.5"
            filter={`url(#${glowId})`}
          />
          {/* Brows: a permanent air of superiority */}
          <path d="M66 78 Q78 72 90 78" fill="none" stroke="#5ee7ff" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />
          <path d="M134 78 Q122 72 110 78" fill="none" stroke="#5ee7ff" strokeOpacity="0.6" strokeWidth="2" strokeLinecap="round" />

          {/* Eyes */}
          <g className="cat-eyes">
            <path d="M62 98 Q78 82 94 98 Q78 114 62 98 Z" fill={`url(#${eyeId})`} />
            <path d="M106 98 Q122 82 138 98 Q122 114 106 98 Z" fill={`url(#${eyeId})`} />
            <ellipse cx="78" cy="98" rx="2.6" ry="11" fill="#040711" />
            <ellipse cx="122" cy="98" rx="2.6" ry="11" fill="#040711" />
            <circle cx="83" cy="92" r="2.2" fill="#ffffff" fillOpacity="0.9" />
            <circle cx="127" cy="92" r="2.2" fill="#ffffff" fillOpacity="0.9" />
          </g>

          {/* Nose + mouth */}
          <path d="M100 114 L93 121 L107 121 Z" fill="#ff5cc8" fillOpacity="0.9" />
          <path d="M100 121 L100 129" stroke="#ff5cc8" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M100 129 Q92 138 85 131" fill="none" stroke="#ff5cc8" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />
          <path d="M100 129 Q108 138 115 131" fill="none" stroke="#ff5cc8" strokeOpacity="0.7" strokeWidth="1.6" strokeLinecap="round" />

          {/* Whiskers */}
          <g className="cat-whiskers" stroke="#a6f4ff" strokeOpacity="0.5" strokeWidth="1.4" strokeLinecap="round">
            <path d="M64 118 Q42 112 24 116" />
            <path d="M64 124 Q42 124 22 132" />
            <path d="M136 118 Q158 112 176 116" />
            <path d="M136 124 Q158 124 178 132" />
          </g>

          {/* Collar + nameplate */}
          <g filter={`url(#${glowId})`}>
            <path d="M58 148 Q100 172 142 148 L146 158 Q100 184 54 158 Z" fill="#080d18" stroke={`url(#${strokeId})`} strokeWidth="2" />
            <g transform="translate(100 163)">
              <rect x="-27" y="-9" width="54" height="18" rx="6" fill="#5ee7ff" />
              <text
                x="0"
                y="3.4"
                textAnchor="middle"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize="8"
                fontWeight="700"
                letterSpacing="1.4"
                fill="#04121a"
              >
                CATGPT
              </text>
            </g>
          </g>
        </g>

        {mood === "thinking" && (
          <g className="cat-orbit" filter={`url(#${glowId})`}>
            <circle cx="100" cy="12" r="3" fill="#5ee7ff" />
            <circle cx="176" cy="100" r="2.4" fill="#ff5cc8" />
            <circle cx="100" cy="188" r="2" fill="#7b8cff" />
          </g>
        )}
      </svg>
    </div>
  );
}
