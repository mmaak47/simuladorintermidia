'use client';

import { useMemo } from 'react';

type AttentionZone = {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
};

interface AttentionHeatmapPanelProps {
  loading: boolean;
  visibilityScore: number | null;
  overlayEnabled: boolean;
  overlayOpacity: number;
  zones: AttentionZone[];
  onGenerate: () => void;
  onToggleOverlay: (next: boolean) => void;
  onOpacityChange: (next: number) => void;
}

export function AttentionHeatmapPanel({
  loading,
  visibilityScore,
  overlayEnabled,
  overlayOpacity,
  zones,
  onGenerate,
  onToggleOverlay,
  onOpacityChange,
}: AttentionHeatmapPanelProps) {
  const topZone = useMemo(() => zones[0] ?? null, [zones]);

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/70 p-3 space-y-2"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-neutral-300 font-body">AI Attention</p>
        {visibilityScore != null && (
          <span className="text-[11px] text-accent font-medium">
            Score {visibilityScore.toFixed(1)}
          </span>
        )}
      </div>

      <button
        onClick={onGenerate}
        disabled={loading}
        className="w-full rounded-lg bg-accent px-3 py-1.5 text-xs text-white disabled:opacity-50"
      >
        {loading ? 'Analisando...' : 'Gerar heatmap'}
      </button>

      <label className="flex items-center gap-2 text-[11px] text-neutral-400">
        <input
          type="checkbox"
          checked={overlayEnabled}
          onChange={(e) => onToggleOverlay(e.target.checked)}
        />
        Mostrar overlay
      </label>

      <div>
        <p className="text-[10px] text-neutral-500 mb-1">Opacidade do heatmap</p>
        <input
          type="range"
          min={0.05}
          max={1}
          step={0.05}
          value={overlayOpacity}
          onChange={(e) => onOpacityChange(Number(e.target.value))}
          className="w-full"
        />
      </div>

      {topZone && (
        <p className="text-[10px] text-neutral-500 leading-relaxed">
          Zona principal: {(topZone.score * 100).toFixed(1)}% da atenção local.
        </p>
      )}
    </div>
  );
}
