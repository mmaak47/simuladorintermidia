'use client';

import { useEffect, useRef, useState } from 'react';
import type { SimulationStatus } from '@/store/client-store';
import type { PointPreset, CreativeSource } from '@dooh/core';

/* ─── Stage config ────────────────────────────────────────── */

interface StageInfo {
  title: string;
  subtitle: string;
  progress: number;
}

const STAGES: Record<SimulationStatus, StageInfo> = {
  idle:      { title: '', subtitle: '', progress: 0 },
  uploading: { title: 'Carregando criativo', subtitle: 'Lendo o arquivo enviado.', progress: 15 },
  preparing: { title: 'Preparando simulação', subtitle: 'Carregando ponto, preset e mídia base.', progress: 35 },
  rendering: { title: 'Renderizando', subtitle: 'Aplicando seu criativo ao ponto selecionado.', progress: 75 },
  done:      { title: 'Simulação pronta', subtitle: 'Seu criativo foi aplicado com sucesso.', progress: 100 },
  error:     { title: 'Não foi possível concluir', subtitle: 'Tente novamente ou selecione outro ponto.', progress: 0 },
};

/* ─── Smooth progress hook ────────────────────────────────── */

function useSmoothProgress(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    if (Math.abs(target - from) < 0.5) { setValue(target); return; }
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const v = from + (target - from) * ease;
      setValue(v);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = target;
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return Math.round(value);
}

/* ─── Main component ──────────────────────────────────────── */

interface SimulationStatusCardProps {
  status: SimulationStatus;
  point: PointPreset | null;
  creative: CreativeSource | null;
  onRetry?: () => void;
}

export function SimulationStatusCard({ status, point, creative, onRetry }: SimulationStatusCardProps) {
  const stage = STAGES[status];
  const smoothProgress = useSmoothProgress(stage.progress);
  const isVideo = point?.baseMediaType === 'video';

  // Timeout warning for long renders
  const [showTimeout, setShowTimeout] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setShowTimeout(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (status === 'rendering' && isVideo) {
      timerRef.current = setTimeout(() => setShowTimeout(true), 12000);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [status, isVideo]);

  if (status === 'idle' || status === 'done') return null;

  return (
    <div className="flex items-center justify-center h-full animate-fade-in">
      <div
        className="w-full max-w-sm mx-auto"
        style={{
          borderRadius: 20,
          background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(254, 92, 43, 0.12)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          padding: '28px 24px',
        }}
      >
        <div className="space-y-5">
          {/* Spinner / Status icon */}
          <div className="flex justify-center">
            {status === 'error' ? (
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M15 9l-6 6M9 9l6 6" />
                </svg>
              </div>
            ) : (
              <div className="relative w-12 h-12">
                <svg className="animate-spin w-12 h-12" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(254,92,43,0.12)" strokeWidth="3" />
                  <circle
                    cx="24" cy="24" r="20" fill="none" stroke="#FE5C2B" strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray="126"
                    strokeDashoffset={126 - (126 * smoothProgress) / 100}
                    className="transition-[stroke-dashoffset] duration-300"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[11px] font-heading font-bold text-accent tabular-nums">
                  {smoothProgress}%
                </span>
              </div>
            )}
          </div>

          {/* Title + subtitle */}
          <div className="text-center space-y-1.5">
            <h3 className="text-sm font-heading font-semibold text-white">
              {stage.title}
            </h3>
            <p className="text-xs text-neutral-500 font-body leading-relaxed">
              {stage.subtitle}
            </p>
          </div>

          {/* Progress bar */}
          {status !== 'error' && (
            <div className="space-y-2">
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-accent to-[#ff8c40] transition-all duration-500 ease-out"
                  style={{ width: `${smoothProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Point + creative metadata */}
          <div className="space-y-1.5 pt-1">
            {point && (
              <div className="flex items-center justify-between text-[10px] font-body">
                <span className="text-neutral-600">Ponto</span>
                <span className="text-neutral-400 truncate ml-3 max-w-[200px]">{point.name}</span>
              </div>
            )}
            {creative && (
              <div className="flex items-center justify-between text-[10px] font-body">
                <span className="text-neutral-600">Criativo</span>
                <span className="text-neutral-400 tabular-nums">
                  {creative.type === 'video' ? '🎬' : '🖼️'} {creative.width}×{creative.height}
                  {creative.duration ? ` • ${creative.duration.toFixed(1)}s` : ''}
                </span>
              </div>
            )}
            {isVideo && (
              <div className="flex items-center justify-between text-[10px] font-body">
                <span className="text-neutral-600">Mídia base</span>
                <span className="text-accent/80 font-medium">Renderização em vídeo</span>
              </div>
            )}
          </div>

          {/* Video rendering note */}
          {isVideo && status === 'rendering' && !showTimeout && (
            <p className="text-[10px] text-neutral-600 font-body text-center leading-relaxed">
              A renderização de vídeo pode levar alguns segundos.
            </p>
          )}

          {/* Timeout warning */}
          {showTimeout && (
            <div className="space-y-3">
              <p className="text-[10px] text-amber-400/80 font-body text-center leading-relaxed">
                A simulação está levando mais tempo do que o esperado.
              </p>
              <div className="flex gap-2 justify-center">
                <button className="text-[10px] text-neutral-500 font-body hover:text-white transition-colors cursor-pointer px-3 py-1.5 rounded-lg bg-white/[0.04]">
                  Continuar aguardando
                </button>
                {onRetry && (
                  <button
                    onClick={onRetry}
                    className="text-[10px] text-accent font-body font-medium hover:text-accent/80 transition-colors cursor-pointer px-3 py-1.5 rounded-lg bg-accent/[0.08]"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Error actions */}
          {status === 'error' && onRetry && (
            <div className="flex justify-center pt-1">
              <button
                onClick={onRetry}
                className="text-xs text-accent font-body font-medium hover:text-accent/80 transition-colors cursor-pointer px-5 py-2 rounded-xl bg-accent/[0.08]"
              >
                Tentar novamente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
