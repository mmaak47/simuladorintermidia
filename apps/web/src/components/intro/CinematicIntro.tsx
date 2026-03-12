'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { IntroBackground } from './IntroBackground';
import { IntroSlide } from './IntroSlide';
import { IntroTextSlide } from './IntroTextSlide';
import { IntroLogo } from './IntroLogo';
import { IntroCTA } from './IntroCTA';

/* ── timeline (milliseconds) ──────────────────────────────── */
const SEGMENTS = [
  { end: 3000 },   // 0  logo entrance (no text)
  { end: 6000 },   // 1  "Seja bem-vindo!"
  { end: 9500 },   // 2  "Nós somos o futuro do DOOH"
  { end: 14000 },  // 3  "Você está pronto para posicionar..."
                    // 4  CTA (∞)
];



function segmentFromElapsed(ms: number): number {
  for (let i = 0; i < SEGMENTS.length; i++) {
    if (ms < SEGMENTS[i].end) return i;
  }
  return 4; // CTA
}

/* ═════════════════════════════════════════════════════════════ */

export function CinematicIntro() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [seg, setSeg] = useState(-1);       // -1 = not started
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const segRef = useRef(-1);                 // mirror to avoid stale closure

  /* ── rAF tick ───────────────────────────────────────────── */
  const tick = useCallback(() => {
    const elapsed = performance.now() - startRef.current;
    const next = segmentFromElapsed(elapsed);
    if (next !== segRef.current) {
      segRef.current = next;
      setSeg(next);
    }
    if (next < 4) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, []);

  /* ── mount: kick off the loop ───────────────────────────── */
  useEffect(() => {
    setMounted(true);
    startRef.current = performance.now();
    segRef.current = 0;
    setSeg(0);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [tick]);

  /* ── skip button ────────────────────────────────────────── */
  const skip = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    segRef.current = 4;
    setSeg(4);
  }, []);

  /* ── navigate to simulator ──────────────────────────────── */
  const start = useCallback(() => {
    router.push('/simulator');
  }, [router]);

  /* active text slide index (1-based seg → 0-based index), -1 = none */
  const activeSlide = seg >= 1 && seg <= 3 ? seg - 1 : -1;

  /* ── render ─────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[9999] bg-black">
      {/* background slideshow */}
      <IntroBackground />

      {/* Nothing else renders until client mount */}
      {mounted && (
        <>
          {/* skip button (hidden once CTA visible) */}
          {seg < 4 && (
            <button
              onClick={skip}
              className="absolute top-6 right-8 z-50 text-white/50 text-sm
                         hover:text-white/80 transition-colors cursor-pointer"
            >
              Pular introdução →
            </button>
          )}

          {/* centred content column */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full px-6">
            {/* Logo — always visible, pushed slightly above centre */}
            <div className="-mt-16 mb-10">
              <IntroLogo />
            </div>

            {/* Text + CTA zone — only the active child is mounted */}
            <div className="relative w-full max-w-4xl" style={{ minHeight: '10rem' }}>
              {activeSlide >= 0 && (
                <IntroTextSlide key={activeSlide} index={activeSlide} />
              )}

              {seg === 4 && (
                <IntroSlide visible>
                  <IntroCTA onStart={start} />
                </IntroSlide>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
