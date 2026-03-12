'use client';

import { useEffect, useRef, useState } from 'react';
import type { VideoRenderMode } from '@/store/video-render-store';

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
      const ease = 1 - Math.pow(1 - t, 3);
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

/* ─── Card variants ───────────────────────────────────────── */

interface VideoSimulationCardProps {
  mode: VideoRenderMode;
  pointName: string;
  renderProgress: number;
  renderedVideoUrl: string | null;
  onGenerateVideo: () => void;
  onWhatsApp: () => void;
  onContinuePreview: () => void;
  onDownload: () => void;
}

export function VideoSimulationCard({
  mode,
  pointName,
  renderProgress,
  renderedVideoUrl,
  onGenerateVideo,
  onWhatsApp,
  onContinuePreview,
  onDownload,
}: VideoSimulationCardProps) {
  const smoothProgress = useSmoothProgress(renderProgress);

  return (
    <div
      className="animate-fade-in"
      style={{
        borderRadius: 20,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(254, 92, 43, 0.12)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
        padding: '24px 20px',
        width: 320,
      }}
    >
      {/* ─── Deciding: offer three options ─── */}
      {(mode === 'deciding' || mode === 'preview') && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FE5C2B" strokeWidth="1.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-heading font-semibold text-white">
                Simulação em vídeo disponível
              </h3>
              <p className="text-[10px] text-neutral-500 font-body mt-0.5">
                {pointName}
              </p>
            </div>
          </div>

          <p className="text-xs text-neutral-400 font-body leading-relaxed">
            Simulações em vídeo podem levar até alguns minutos para renderizar.
          </p>

          <div className="space-y-2">
            <button
              onClick={onGenerateVideo}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs text-white font-body font-medium hover:bg-accent/90 transition-all duration-200 shadow-[0_0_20px_rgba(254,92,43,0.15)] cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Gerar vídeo agora
            </button>

            <button
              onClick={onWhatsApp}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#25D366]/10 px-4 py-2.5 text-xs text-[#25D366] font-body font-medium hover:bg-[#25D366]/15 transition-all duration-200 border border-[#25D366]/20 cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.29-1.243l-.307-.184-2.87.853.853-2.87-.184-.307A8 8 0 1 1 12 20z" />
              </svg>
              Receber vídeo pelo WhatsApp
            </button>

            <button
              onClick={onContinuePreview}
              className="w-full rounded-xl px-4 py-2.5 text-xs text-neutral-500 font-body hover:text-white transition-all duration-200 bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer"
            >
              Continuar apenas com preview
            </button>
          </div>
        </div>
      )}

      {/* ─── Rendering: show progress ─── */}
      {mode === 'rendering' && (
        <div className="space-y-5">
          <div className="flex justify-center">
            <div className="relative w-14 h-14">
              <svg className="animate-spin w-14 h-14" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="24" fill="none" stroke="rgba(254,92,43,0.12)" strokeWidth="3" />
                <circle
                  cx="28" cy="28" r="24" fill="none" stroke="#FE5C2B" strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="151"
                  strokeDashoffset={151 - (151 * smoothProgress) / 100}
                  className="transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-heading font-bold text-accent tabular-nums">
                {smoothProgress}%
              </span>
            </div>
          </div>

          <div className="text-center space-y-1.5">
            <h3 className="text-sm font-heading font-semibold text-white">
              Renderizando simulação em vídeo
            </h3>
            <p className="text-xs text-neutral-500 font-body leading-relaxed">
              Estamos aplicando seu criativo ao ponto selecionado.
            </p>
          </div>

          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-accent to-[#ff8c40] transition-all duration-500 ease-out"
              style={{ width: `${smoothProgress}%` }}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-body">
              <span className="text-neutral-600">Ponto</span>
              <span className="text-neutral-400 truncate ml-3 max-w-[180px]">{pointName}</span>
            </div>
            <div className="flex items-center justify-between text-[10px] font-body">
              <span className="text-neutral-600">Tipo</span>
              <span className="text-accent/80 font-medium">Renderização em vídeo</span>
            </div>
          </div>

          <p className="text-[10px] text-neutral-600 font-body text-center leading-relaxed">
            Você pode continuar visualizando o preview enquanto o vídeo é renderizado.
          </p>
        </div>
      )}

      {/* ─── Complete: download ready ─── */}
      {mode === 'complete' && renderedVideoUrl && (
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FE5C2B" strokeWidth="1.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          <div className="text-center space-y-1.5">
            <h3 className="text-sm font-heading font-semibold text-white">
              Seu vídeo está pronto
            </h3>
            <p className="text-xs text-neutral-500 font-body">
              A simulação em vídeo foi concluída com sucesso.
            </p>
          </div>

          <button
            onClick={onDownload}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs text-white font-body font-medium hover:bg-accent/90 transition-all duration-200 shadow-[0_0_20px_rgba(254,92,43,0.15)] cursor-pointer"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Baixar vídeo
          </button>
        </div>
      )}

      {/* ─── Error ─── */}
      {mode === 'error' && (
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-red-400">
                <circle cx="12" cy="12" r="10" />
                <path d="M15 9l-6 6M9 9l6 6" />
              </svg>
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <h3 className="text-sm font-heading font-semibold text-white">
              Erro na renderização
            </h3>
            <p className="text-xs text-neutral-500 font-body">
              Não foi possível gerar o vídeo. Tente novamente.
            </p>
          </div>
          <button
            onClick={onGenerateVideo}
            className="w-full rounded-xl bg-accent/[0.08] px-4 py-2.5 text-xs text-accent font-body font-medium hover:bg-accent/15 transition-all duration-200 cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
