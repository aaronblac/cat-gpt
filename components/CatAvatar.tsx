"use client";

export type CatMood = "idle" | "thinking" | "smug";

interface CatAvatarProps {
  size?: number;
  mood?: CatMood;
  /** Decorative repeats (hero + header) should be hidden from screen readers. */
  decorative?: boolean;
  className?: string;
}

/**
 * The CatGPT mascot: a cat-man in yellow cat-eye shades and a studded collar.
 * The source artwork is cropped to a square portrait and masked into a circle,
 * with the spinning halo kept from the original design.
 */
export function CatAvatar({ size = 160, mood = "idle", decorative, className = "" }: CatAvatarProps) {
  return (
    <div
      className={`cat-avatar cat-avatar--${mood} ${className}`.trim()}
      style={{ width: size, height: size }}
      aria-hidden={decorative ? true : undefined}
      role={decorative ? undefined : "img"}
      aria-label={
        decorative
          ? undefined
          : "CatGPT, a cat-man mascot wearing yellow cat-eye sunglasses and a studded collar"
      }
    >
      <span className="cat-ring" aria-hidden="true" />
      <span className="cat-ring cat-ring--slow" aria-hidden="true" />
      <span className="cat-photo-shell">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="cat-photo"
          src="/brand/catgpt-portrait.png"
          alt=""
          draggable={false}
          decoding="async"
        />
      </span>
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
