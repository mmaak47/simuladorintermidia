'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedCountUpProps {
  value: number;
  duration?: number;
  className?: string;
}

/**
 * Animated counter — always animates from 0 to the target value on mount.
 * Uses ease-in-out with a subtle bounce at the end.
 */
export function AnimatedCountUp({
  value,
  duration = 1800,
  className = '',
}: AnimatedCountUpProps) {
  const [displayed, setDisplayed] = useState(0);
  const [finished, setFinished] = useState(false);
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    setDisplayed(0);
    setFinished(false);

    if (value <= 0) return;

    // Small delay so the "0" is visible before the count starts
    const delay = setTimeout(() => {
      const start = performance.now();

      const tick = (now: number) => {
        const elapsed = now - start;
        const t = Math.min(elapsed / duration, 1);

        // Ease-in-out cubic
        let ease: number;
        if (t < 0.5) {
          ease = 4 * t * t * t;
        } else {
          const p = t - 1;
          ease = 1 + 4 * p * p * p;
        }

        // Subtle bounce near the end
        const bounce = t >= 0.85 ? 1 + Math.sin(((t - 0.85) / 0.15) * Math.PI) * 0.03 : 1;
        const val = Math.round(ease * bounce * value);

        setDisplayed(Math.min(val, value));

        if (t < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayed(value);
          setFinished(true);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    }, 200);

    return () => {
      clearTimeout(delay);
      cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span
      className={`tabular-nums inline-block transition-transform ${finished ? 'animate-impact-pulse' : ''} ${className}`}
    >
      {displayed.toLocaleString('pt-BR')}
    </span>
  );
}
