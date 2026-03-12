'use client';

import { useMemo } from 'react';
import { rankPointsByCompatibility } from '@/services/aspect_ratio_utils';
import { usePointStore } from '@/store/point-store';
import type { PointPreset } from '@dooh/core';

/**
 * CompatiblePointsSuggestion
 *
 * Lists points ranked by compatibility with the uploaded creative.
 * Allows the user to switch to a better-matching point.
 */

interface Props {
  creativeWidth: number;
  creativeHeight: number;
  currentPointId: string;
  onSelectPoint: (point: PointPreset) => void;
  onBack: () => void;
}

export function CompatiblePointsSuggestion({
  creativeWidth,
  creativeHeight,
  currentPointId,
  onSelectPoint,
  onBack,
}: Props) {
  const published = usePointStore((s) => s.getPublishedPoints());

  const ranked = useMemo(
    () => rankPointsByCompatibility(creativeWidth, creativeHeight, published),
    [creativeWidth, creativeHeight, published],
  );

  return (
    <div className="flex items-center justify-center h-full animate-fade-in">
      <div
        className="w-full max-w-md mx-auto max-h-[80vh] flex flex-col"
        style={{
          borderRadius: 20,
          background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(254, 92, 43, 0.12)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          padding: '24px',
        }}
      >
        {/* Header */}
        <div className="text-center space-y-1.5 mb-4">
          <h3 className="text-sm font-heading font-semibold text-white">Pontos compatíveis</h3>
          <p className="text-[11px] text-neutral-500 font-body">
            Criativo {creativeWidth}×{creativeHeight} — ordenados por compatibilidade
          </p>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0 pr-1 -mr-1">
          {ranked.map(({ point, score, matchLabel }) => {
            const isCurrent = point.id === currentPointId;
            return (
              <button
                key={point.id}
                onClick={() => !isCurrent && onSelectPoint(point)}
                disabled={isCurrent}
                className={`w-full text-left rounded-xl px-3.5 py-3 transition-all duration-150 cursor-pointer ${
                  isCurrent
                    ? 'bg-accent/10 border border-accent/20'
                    : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06] hover:border-white/5'
                } ${isCurrent ? 'cursor-default' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-body font-medium text-white truncate">
                        {point.name}
                      </p>
                      {isCurrent && (
                        <span className="text-[8px] font-body bg-accent/20 text-accent px-1.5 py-0.5 rounded-full flex-shrink-0">
                          Atual
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-neutral-600 font-body">{point.city}</span>
                      <span className="text-[10px] text-neutral-700">•</span>
                      <span className="text-[10px] text-neutral-600 font-body">{point.screenWidth && point.screenHeight ? `${point.screenWidth}×${point.screenHeight}` : point.screenAspect}</span>
                      <span className="text-[10px] text-neutral-700">•</span>
                      <span className="text-[10px] text-neutral-600 font-body">{point.type}</span>
                    </div>
                  </div>

                  {/* Compatibility badge */}
                  <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                    <span
                      className={`text-[9px] font-body font-medium px-2 py-0.5 rounded-full ${
                        matchLabel === 'Compatível'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : matchLabel === 'Adaptável'
                            ? 'bg-amber-500/10 text-amber-400'
                            : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {matchLabel}
                    </span>
                    <span className="text-[9px] text-neutral-700 font-body">
                      {Math.round(score * 100)}%
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Back button */}
        <div className="mt-4 pt-3 border-t border-white/5">
          <button
            onClick={onBack}
            className="w-full rounded-xl bg-white/5 px-4 py-2 text-xs text-neutral-400 font-body hover:bg-white/10 transition-all duration-200 cursor-pointer"
          >
            Voltar
          </button>
        </div>
      </div>
    </div>
  );
}
