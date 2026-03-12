'use client';

import { useEffect, useState } from 'react';
import { AnimatedCountUp } from './AnimatedCountUp';

interface InsertionsImpactCardProps {
  value: number | undefined | null;
  liveInsertions?: number;
  pointName?: string;
}

/**
 * Premium animated impact counter card.
 * Animates from 0 to the total insertion count configured on the point.
 */
export function InsertionsImpactCard({ value, liveInsertions = 0, pointName }: InsertionsImpactCardProps) {
  const [animKey, setAnimKey] = useState(0);
  const [showFrequency, setShowFrequency] = useState(false);

  useEffect(() => {
    setAnimKey((k) => k + 1);
    setShowFrequency(false);

    if (value && value > 0) {
      const timer = setTimeout(() => setShowFrequency(true), 1900);
      return () => clearTimeout(timer);
    }
  }, [value, pointName]);

  if (value == null || value <= 0) return null;

  const dailyExposure = Math.round(value / 30);
  const safeLive = Math.max(0, Math.floor(liveInsertions));
  const progressRatio = Math.min(safeLive / value, 1);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      style={{
        background: 'linear-gradient(135deg, rgba(20,20,20,0.95) 0%, rgba(10,10,10,0.98) 100%)',
        border: '1px solid rgba(254, 92, 43, 0.15)',
        boxShadow:
          '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset, 0 0 60px rgba(254,92,43,0.06)',
      }}
    >
      {/* Decorative top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: 'linear-gradient(90deg, transparent, #FE5C2B 30%, #FE5C2B 70%, transparent)',
          opacity: 0.6,
        }}
      />

      <div className="px-5 py-5 space-y-4">
        {/* Top label */}
        <p className="text-[11px] font-body font-medium text-neutral-400 uppercase tracking-wider">
          Sua marca poderia aparecer <span className="text-accent font-semibold">NO MÍNIMO</span>
        </p>

        {/* Large animated number */}
        <div className="relative">
          <div
            className="text-[48px] leading-none font-heading font-bold text-accent"
            style={{
              textShadow: '0 0 20px rgba(254,92,43,0.35), 0 0 60px rgba(254,92,43,0.12)',
            }}
          >
            <AnimatedCountUp key={animKey} value={value} duration={3200} />
          </div>

          {/* Light sweep overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ animation: 'impact-sweep 1.6s ease-in-out 1.5s forwards', opacity: 0 }}
          />
        </div>

        {/* Bottom text */}
        <div className="space-y-1.5">
          <p className="text-sm font-body font-medium text-white/80">
            vezes neste ponto durante a campanha.
          </p>
          <p className="text-xs font-body text-neutral-500 leading-relaxed">
            Essa é a quantidade de vezes que sua marca estaria passando neste local.
          </p>
          <p className="text-[11px] font-body text-neutral-600 italic leading-relaxed">
            Quanto mais sua marca aparece, mais ela é lembrada.
          </p>
        </div>

        {/* Live simulation progress */}
        <div className="pt-3 border-t border-white/5 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-body">
            <span className="text-neutral-500">Agora na simulação</span>
            <span className="text-white/80 tabular-nums">
              {safeLive.toLocaleString('pt-BR')} / {value.toLocaleString('pt-BR')}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-500"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
        </div>

        {/* Frequency breakdown — fades in after count-up */}
        <div
          className="pt-3 border-t border-white/5 transition-all duration-500"
          style={{
            opacity: showFrequency ? 1 : 0,
            transform: showFrequency ? 'translateY(0)' : 'translateY(6px)',
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px]"
              style={{
                background: 'rgba(254, 92, 43, 0.12)',
                color: '#FE5C2B',
              }}
            >
              ≈
            </span>
            <p className="text-sm font-body font-medium text-white/70">
              {dailyExposure.toLocaleString('pt-BR')} exibições por dia
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
