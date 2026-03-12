'use client';

import { useEffect, useRef, useState } from 'react';

interface MinimumInsertionsCounterProps {
  value: number | undefined;
  label?: string;
}

export function MinimumInsertionsCounter({
  value,
  label = 'Inserções mínimas neste ponto',
}: MinimumInsertionsCounterProps) {
  const [displayed, setDisplayed] = useState(0);
  const rafRef = useRef(0);
  const prevValue = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Reset + animate whenever the target value changes
    if (value === prevValue.current) return;
    prevValue.current = value;

    cancelAnimationFrame(rafRef.current);
    if (value == null || value <= 0) {
      setDisplayed(0);
      return;
    }

    const duration = 1400; // ms
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // ease-out quart — fast start, gentle landing
      const ease = 1 - Math.pow(1 - t, 4);
      setDisplayed(Math.round(ease * value));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    setDisplayed(0);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  if (value == null || value <= 0) {
    return (
      <div className="space-y-1">
        <p className="text-[10px] font-heading font-semibold text-white/40 uppercase tracking-wider">
          Inserções mínimas
        </p>
        <p className="text-xs font-body text-neutral-500 italic">Sob consulta</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-heading font-semibold text-white/40 uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-heading font-bold tabular-nums text-accent drop-shadow-[0_0_6px_rgba(254,92,43,0.3)]">
        {displayed.toLocaleString('pt-BR')}
      </p>
    </div>
  );
}
