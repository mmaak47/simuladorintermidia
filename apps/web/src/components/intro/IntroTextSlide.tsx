'use client';

import { motion } from 'framer-motion';
import { type ReactNode } from 'react';

/* ── slide definitions with keyword highlights ─────────────── */

interface SlideData {
  jsx: ReactNode;
}

const HL = 'text-[#FE5C2B] font-semibold [text-shadow:0_0_12px_rgba(254,92,43,0.25)]';

export const SLIDES: SlideData[] = [
  {
    jsx: <>Seja bem-vindo!</>,
  },
  {
    jsx: (
      <>
        Nós somos o <span className={HL}>futuro</span> do{' '}
        <span className={HL}>DOOH</span>
      </>
    ),
  },
  {
    jsx: (
      <>
        Você está pronto para posicionar sua{' '}
        <span className={HL}>marca</span> onde seu{' '}
        <span className={HL}>público</span> alvo está?
      </>
    ),
  },
];

/* ── component ─────────────────────────────────────────────── */

interface Props {
  index: number;
}

export function IntroTextSlide({ index }: Props) {
  const slide = SLIDES[index];
  if (!slide) return null;

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1], delay: 0.3 }}
    >
      {/* text */}
      <p className="text-center text-white text-2xl md:text-4xl font-heading font-semibold leading-relaxed max-w-3xl mx-auto relative z-10">
        {slide.jsx}
      </p>

      {/* cinematic orange line behind text */}
      <motion.div
        className="mt-5 h-[2px] rounded-full"
        style={{
          background: '#FE5C2B',
          filter: 'blur(2px)',
        }}
        initial={{ width: '0%', opacity: 0 }}
        animate={{ width: '55%', opacity: 0.6 }}
        transition={{
          width: { duration: 1.2, ease: [0.4, 0, 0.2, 1], delay: 0.3 },
          opacity: { duration: 0.8, ease: 'easeInOut', delay: 0.3 },
        }}
      />
    </motion.div>
  );
}
