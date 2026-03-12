'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePointStore } from '@/store/point-store';
import type { PointPreset } from '@dooh/core';
import { renderPresetToDisplay, renderPresetToCinematic } from '@dooh/core';
import { analyzeColors, type ColorAnalysisResult } from '@/lib/color-analysis';

/* ─── Measurement for a single point ──────────────────── */

interface PointMeasurement {
  pointId: string;
  pointName: string;
  /** Creative pixel density (px/inch equivalent) at screen */
  pixelDensity: number;
  /** Average brightness of composited screen area */
  avgBrightness: number;
  /** Contrast ratio (max/min luminance on screen) */
  contrastRatio: number;
  /** Creative dominant color */
  dominantColor: [number, number, number];
  /** Overall visibility score 0-100 */
  visibilityScore: number;
}

/* ─── Compute measurements ────────────────────────────── */

function computeMeasurement(
  point: PointPreset,
  creativeW: number,
  creativeH: number,
  creativeSource: CanvasImageSource,
): PointMeasurement {
  // Pixel density
  const corners = point.screenSelection.corners;
  let screenPixelW = point.baseWidth * 0.4;
  if (corners && corners.length >= 4) {
    screenPixelW = Math.hypot(
      corners[1].x - corners[0].x,
      corners[1].y - corners[0].y,
    );
  }
  const pixelDensity = creativeW / Math.max(1, screenPixelW);

  // Color analysis of creative
  let analysis: ColorAnalysisResult;
  try {
    analysis = analyzeColors(creativeSource, creativeW, creativeH);
  } catch {
    analysis = {
      dominantColor: [128, 128, 128],
      secondaryColors: [],
      avgBrightness: 0.5,
      highlightStrength: 0.2,
    };
  }

  const contrastRatio = Math.max(1, (analysis.highlightStrength + 0.05) / (1 - analysis.avgBrightness + 0.05) * 5);

  // Visibility score: combination of nits, pixel density, contrast
  const nitsScore = Math.min(1, point.renderPreset.screenNits / 2000);
  const densityScore = Math.min(1, pixelDensity / 2);
  const contrastScore = Math.min(1, contrastRatio / 7);
  const visibilityScore = Math.round((nitsScore * 30 + densityScore * 40 + contrastScore * 30));

  return {
    pointId: point.id,
    pointName: point.name,
    pixelDensity: Math.round(pixelDensity * 100) / 100,
    avgBrightness: Math.round(analysis.avgBrightness * 100) / 100,
    contrastRatio: Math.round(contrastRatio * 10) / 10,
    dominantColor: analysis.dominantColor,
    visibilityScore,
  };
}

/* ─── Score badge color ───────────────────────────────── */

function scoreColor(score: number): string {
  if (score >= 75) return 'bg-green-500/20 text-green-400';
  if (score >= 50) return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-red-500/20 text-red-400';
}

/* ─── Component ───────────────────────────────────────── */

interface BatchPreviewProps {
  /** Creative URL to test across all points */
  creativeUrl: string | null;
  creativeWidth: number;
  creativeHeight: number;
}

export function BatchPreview({ creativeUrl, creativeWidth, creativeHeight }: BatchPreviewProps) {
  const { points } = usePointStore();
  const [measurements, setMeasurements] = useState<PointMeasurement[]>([]);
  const [running, setRunning] = useState(false);

  const runBatch = useCallback(() => {
    if (!creativeUrl || points.length === 0) return;

    setRunning(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const results: PointMeasurement[] = points
        .filter((p) => p.published)
        .map((point) => computeMeasurement(point, creativeWidth, creativeHeight, img));
      setMeasurements(results);
      setRunning(false);
    };
    img.onerror = () => setRunning(false);
    img.src = creativeUrl;
  }, [creativeUrl, creativeWidth, creativeHeight, points]);

  if (!creativeUrl) {
    return (
      <div className="text-center text-neutral-500 font-body text-sm py-8">
        Faça upload de um criativo para visualizar o batch preview.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-heading font-bold text-white">
          Batch Preview
        </h2>
        <button
          onClick={runBatch}
          disabled={running}
          className="text-sm font-body font-medium py-2 px-4 rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {running ? 'Analisando...' : `Analisar ${points.filter(p => p.published).length} pontos`}
        </button>
      </div>

      {measurements.length > 0 && (
        <div className="space-y-3">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              label="Score Médio"
              value={`${Math.round(measurements.reduce((s, m) => s + m.visibilityScore, 0) / measurements.length)}`}
            />
            <StatCard
              label="Melhor Ponto"
              value={measurements.reduce((best, m) => m.visibilityScore > best.visibilityScore ? m : best).pointName.split(' — ')[0]}
            />
            <StatCard
              label="Pontos Analisados"
              value={`${measurements.length}`}
            />
          </div>

          {/* Per-point results */}
          <div className="space-y-2">
            {measurements.map((m) => (
              <div
                key={m.pointId}
                className="rounded-panel bg-white/[0.04] p-3 flex items-center gap-4"
              >
                {/* Color swatch */}
                <div
                  className="w-8 h-8 rounded-md flex-shrink-0"
                  style={{ backgroundColor: `rgb(${m.dominantColor.join(',')})` }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-body font-semibold text-white truncate">
                    {m.pointName}
                  </p>
                  <div className="flex gap-4 text-xs text-neutral-500 font-body">
                    <span>Densidade: {m.pixelDensity}x</span>
                    <span>Brilho: {Math.round(m.avgBrightness * 100)}%</span>
                    <span>Contraste: {m.contrastRatio}:1</span>
                  </div>
                </div>

                {/* Score badge */}
                <div className={`px-3 py-1 rounded-full text-sm font-body font-bold tabular-nums ${scoreColor(m.visibilityScore)}`}>
                  {m.visibilityScore}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-panel bg-white/[0.04] p-3 text-center">
      <p className="text-xs font-body text-neutral-500 uppercase tracking-wider">{label}</p>
      <p className="text-lg font-heading font-bold text-white mt-1">{value}</p>
    </div>
  );
}
