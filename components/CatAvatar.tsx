"use client";

export type CatMood = "idle" | "thinking" | "smug";
export type CatAvatarVariant = "face" | "full";

interface CatAvatarProps {
  size?: number;
  mood?: CatMood;
  /** "full" shows the complete logo lockup; "face" is for the header and bubbles. */
  variant?: CatAvatarVariant;
  /** Decorative repeats (hero + header) should be hidden from screen readers. */
  decorative?: boolean;
  className?: string;
}

/**
 * The CatGPT mascot. The full lockup is the supplied transparent logo, floated
 * over the spinning halo. The face variant is a transparent crop for the
 * header and message labels, where the wordmark would be unreadable.
 */
export function CatAvatar({
  size = 160,
  mood = "idle",
  variant = "face",
  decorative,
  className = "",
}: CatAvatarProps) {
  const full = variant === "full";

  return (
    <div
      className={`cat-avatar cat-avatar--${variant} cat-avatar--${mood} ${className}`.trim()}
      style={full ? undefined : { width: size, height: size }}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={
        decorative
          ? undefined
          : "CatGPT, a cat-man mascot in yellow cat-eye sunglasses and a studded collar"
      }
    >
      {full && (
        <>
          <span className="cat-ring" aria-hidden="true" />
          <span className="cat-ring cat-ring--slow" aria-hidden="true" />
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="cat-logo"
        src={full ? "/brand/catgpt-logo-transparent.png" : "/brand/catgpt-face.png"}
        alt=""
        draggable={false}
        decoding="async"
      />
      {mood === "thinking" && (
        <span className="cat-thinking-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}
