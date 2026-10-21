"use client";

import { useEffect, useMemo } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";

const COLORS = ["#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#60a5fa"];
const PIECES = 36;

/**
 * Lightweight celebration (CSS only, no dependency). Renders nothing when the
 * user prefers reduced motion, never captures pointer events, and removes
 * itself after `durationMs`.
 */
export default function Confetti({ active, durationMs = 2500, onDone }) {
  const prefersReducedMotion = useReducedMotion();

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        id: i,
        left: (i * 97) % 100,
        delay: (i % 6) * 0.08,
        size: 6 + (i % 4) * 2,
        color: COLORS[i % COLORS.length],
        drift: ((i % 5) - 2) * 40,
      })),
    [],
  );

  useEffect(() => {
    if (!active || prefersReducedMotion) return undefined;
    const timer = setTimeout(() => onDone?.(), durationMs);
    return () => clearTimeout(timer);
  }, [active, prefersReducedMotion, durationMs, onDone]);

  if (!active || prefersReducedMotion) return null;

  return (
    <div
      data-testid="confetti"
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
    >
      <style>{`
        @keyframes sh-confetti-fall {
          from { transform: translate3d(0, -10vh, 0) rotate(0deg); opacity: 1; }
          to { transform: translate3d(var(--drift), 105vh, 0) rotate(540deg); opacity: 0.9; }
        }
      `}</style>
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{
            position: "absolute",
            top: 0,
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            backgroundColor: p.color,
            "--drift": `${p.drift}px`,
            animation: `sh-confetti-fall ${durationMs}ms ease-in ${p.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
