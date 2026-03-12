'use client';

import { useCallback, useRef, useState } from 'react';

interface BeforeAfterSliderProps {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
}

export function BeforeAfterSlider({
  beforeImage,
  afterImage,
  beforeLabel = 'Original',
  afterLabel = 'Simulação',
}: BeforeAfterSliderProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(0, Math.min(100, pct)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    draggingRef.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    updatePosition(e.clientX);
  }, [updatePosition]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ cursor: 'col-resize', touchAction: 'none' }}
    >
      {/* Before image (full, underneath) */}
      <img
        src={beforeImage}
        alt="Original"
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        draggable={false}
      />

      {/* After image (clipped from left) */}
      <div
        className="absolute inset-0 overflow-hidden pointer-events-none"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img
          src={afterImage}
          alt="Simulação"
          className="absolute inset-0 w-full h-full object-contain"
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 -translate-x-1/2 z-10 pointer-events-none"
        style={{ left: `${position}%`, background: 'rgba(254, 92, 43, 0.9)' }}
      >
        {/* Handle */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '2px solid rgba(254, 92, 43, 0.9)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M5 3L2 8L5 13" stroke="#FE5C2B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 3L14 8L11 13" stroke="#FE5C2B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 z-20 pointer-events-none">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body font-medium"
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            color: 'rgba(255, 255, 255, 0.7)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          {beforeLabel}
        </span>
      </div>
      <div className="absolute top-3 right-3 z-20 pointer-events-none">
        <span
          className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-body font-medium"
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            color: '#FE5C2B',
            border: '1px solid rgba(254, 92, 43, 0.2)',
          }}
        >
          {afterLabel}
        </span>
      </div>

      {/* Hint text (fades after interaction) */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-pulse">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-body"
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(6px)',
            color: 'rgba(255, 255, 255, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M5 3L2 8L5 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 3L14 8L11 13" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Arraste para comparar
        </span>
      </div>
    </div>
  );
}
