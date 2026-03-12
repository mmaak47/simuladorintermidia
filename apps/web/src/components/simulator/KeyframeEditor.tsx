'use client';

import { useState, useCallback, useRef } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import { extractKeyframes, detectScreenHybrid } from '@dooh/core';
import type { ScreenCorners } from '@dooh/core';

const VISION_BASE = process.env.NEXT_PUBLIC_VISION_API_URL ?? 'http://localhost:8000';

/**
 * KeyframeEditor — the main workflow component for video locations.
 *
 * Flow:
 *   1. Extract keyframes from the video
 *   2. For each keyframe, auto-detect (assist) or manually place corners
 *   3. Navigate between keyframes, editing corners on each
 *   4. Export / import the preset when done
 */
export function KeyframeEditor() {
  const {
    location,
    keyframeData,
    keyframeCorners,
    activeKeyframeIndex,
    setKeyframeData,
    setActiveKeyframe,
    setKeyframeCorners,
    setCorners,
    exportPresetJSON,
    importPresetJSON,
  } = useCompositionStore();

  const [extracting, setExtracting] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectingAll, setDetectingAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // ─── Extract keyframes from video ──────────────────────────
  const handleExtract = useCallback(async () => {
    if (!location || location.type !== 'video') return;
    setExtracting(true);
    setError(null);

    try {
      const res = await fetch(location.url);
      const blob = await res.blob();
      const file = new File([blob], 'location.mp4', { type: blob.type || 'video/mp4' });
      const result = await extractKeyframes(file);
      setKeyframeData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na extração');
    } finally {
      setExtracting(false);
    }
  }, [location, setKeyframeData]);

  // ─── Auto-detect corners on current keyframe ───────────────
  const handleAutoDetect = useCallback(async () => {
    if (!keyframeData) return;
    const kf = keyframeData.keyframes[activeKeyframeIndex];
    if (!kf) return;

    setDetecting(true);
    setError(null);

    try {
      // Download thumbnail as image file for detection
      const res = await fetch(`${VISION_BASE}${kf.thumbnailUrl}`);
      const blob = await res.blob();
      const file = new File([blob], 'keyframe.jpg', { type: 'image/jpeg' });
      const result = await detectScreenHybrid(file);

      // Scale corners from thumbnail (320px wide) to full image dimensions
      const scaleX = keyframeData.width / 320;
      const scaleY = keyframeData.height / (320 * keyframeData.height / keyframeData.width);

      const corners: ScreenCorners = [
        { x: result.corners[0].x * scaleX, y: result.corners[0].y * scaleY },
        { x: result.corners[1].x * scaleX, y: result.corners[1].y * scaleY },
        { x: result.corners[2].x * scaleX, y: result.corners[2].y * scaleY },
        { x: result.corners[3].x * scaleX, y: result.corners[3].y * scaleY },
      ];

      setKeyframeCorners(kf.frameIndex, kf.time, corners);
      // Also set as current corners for the preview canvas
      setCorners(corners);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na detecção');
    } finally {
      setDetecting(false);
    }
  }, [keyframeData, activeKeyframeIndex, setKeyframeCorners, setCorners]);

  // ─── Auto-detect corners on ALL keyframes ──────────────────
  const handleAutoDetectAll = useCallback(async () => {
    if (!keyframeData) return;
    setDetectingAll(true);
    setError(null);

    try {
      const scaleX = keyframeData.width / 320;
      const scaleY = keyframeData.height / (320 * keyframeData.height / keyframeData.width);

      for (const kf of keyframeData.keyframes) {
        try {
          const res = await fetch(`${VISION_BASE}${kf.thumbnailUrl}`);
          const blob = await res.blob();
          const file = new File([blob], 'keyframe.jpg', { type: 'image/jpeg' });
          const result = await detectScreenHybrid(file);

          const corners: ScreenCorners = [
            { x: result.corners[0].x * scaleX, y: result.corners[0].y * scaleY },
            { x: result.corners[1].x * scaleX, y: result.corners[1].y * scaleY },
            { x: result.corners[2].x * scaleX, y: result.corners[2].y * scaleY },
            { x: result.corners[3].x * scaleX, y: result.corners[3].y * scaleY },
          ];

          setKeyframeCorners(kf.frameIndex, kf.time, corners);
        } catch {
          // Skip keyframes where detection fails
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na detecção');
    } finally {
      setDetectingAll(false);
    }
  }, [keyframeData, setKeyframeCorners]);

  // ─── Navigate keyframes ───────────────────────────────────
  const goToKeyframe = useCallback(
    (index: number) => {
      if (!keyframeData) return;
      const clamped = Math.max(0, Math.min(index, keyframeData.keyframes.length - 1));
      setActiveKeyframe(clamped);

      // Sync static corners to this keyframe's data (or clear if none)
      const kf = keyframeData.keyframes[clamped];
      const kfCorners = keyframeCorners.find((kc) => kc.frameIndex === kf.frameIndex);
      setCorners(kfCorners ? kfCorners.corners : null);
    },
    [keyframeData, keyframeCorners, setActiveKeyframe, setCorners],
  );

  // ─── Copy corners from previous keyframe ──────────────────
  const copyFromPrevious = useCallback(() => {
    if (!keyframeData || activeKeyframeIndex === 0) return;
    const prevKf = keyframeData.keyframes[activeKeyframeIndex - 1];
    const prevCorners = keyframeCorners.find((kc) => kc.frameIndex === prevKf.frameIndex);
    if (!prevCorners) return;

    const kf = keyframeData.keyframes[activeKeyframeIndex];
    const corners = prevCorners.corners.map(c => ({ ...c })) as unknown as ScreenCorners;
    setKeyframeCorners(kf.frameIndex, kf.time, corners);
    setCorners(corners);
  }, [keyframeData, activeKeyframeIndex, keyframeCorners, setKeyframeCorners, setCorners]);

  // ─── Export preset ────────────────────────────────────────
  const handleExport = useCallback(() => {
    const json = exportPresetJSON();
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `dooh-preset-${Date.now()}.json`;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [exportPresetJSON]);

  // ─── Import preset ────────────────────────────────────────
  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const ok = importPresetJSON(text);
      if (!ok) setError('Falha ao importar preset');
    };
    reader.readAsText(file);
    if (importRef.current) importRef.current.value = '';
  }, [importPresetJSON]);

  // ─── Render ───────────────────────────────────────────────
  if (!location || location.type !== 'video') return null;

  const activeKf = keyframeData?.keyframes[activeKeyframeIndex];
  const activeHasCorners = activeKf
    ? keyframeCorners.some((kc) => kc.frameIndex === activeKf.frameIndex)
    : false;
  const editedCount = keyframeCorners.length;
  const totalKf = keyframeData?.keyframes.length ?? 0;

  return (
    <div className="space-y-3">
      {/* Step 1: Extract keyframes */}
      {!keyframeData ? (
        <button
          onClick={handleExtract}
          disabled={extracting}
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all duration-200"
        >
          {extracting ? 'Extraindo quadros-chave...' : 'Extrair quadros-chave'}
        </button>
      ) : (
        <>
          {/* Keyframe count */}
          <div className="text-label text-neutral-500 font-body">
            {totalKf} quadros-chave • {editedCount} editados •{' '}
            {keyframeData.duration.toFixed(1)}s @ {keyframeData.fps.toFixed(0)} fps
          </div>

          {/* Filmstrip */}
          <KeyframeFilmstrip
            keyframes={keyframeData.keyframes}
            keyframeCorners={keyframeCorners}
            activeIndex={activeKeyframeIndex}
            onSelect={goToKeyframe}
          />

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => goToKeyframe(activeKeyframeIndex - 1)}
              disabled={activeKeyframeIndex === 0}
              className="px-3 py-1.5 text-label rounded-lg bg-white/[0.06] text-white font-body disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              ← Anterior
            </button>
            <span className="text-label text-neutral-400 tabular-nums font-body">
              {activeKeyframeIndex + 1} / {totalKf}
              {activeKf ? ` • ${activeKf.time.toFixed(2)}s` : ''}
            </span>
            <button
              onClick={() => goToKeyframe(activeKeyframeIndex + 1)}
              disabled={activeKeyframeIndex >= totalKf - 1}
              className="px-3 py-1.5 text-label rounded-lg bg-white/[0.06] text-white font-body disabled:opacity-30 hover:bg-white/10 transition-colors"
            >
              Próximo →
            </button>
          </div>

          {/* Actions for current keyframe */}
          <div className="flex flex-col gap-2">
            <button
              onClick={handleAutoDetect}
              disabled={detecting || detectingAll}
              className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-label text-white font-body hover:bg-white/10 disabled:opacity-50 transition-colors"
            >
              {detecting ? 'Detectando...' : '🎯 Detectar tela neste quadro'}
            </button>

            {activeKeyframeIndex > 0 && (
              <button
                onClick={copyFromPrevious}
                className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-label text-white font-body hover:bg-white/10 transition-colors"
              >
                📋 Copiar do quadro anterior
              </button>
            )}

            <button
              onClick={handleAutoDetectAll}
              disabled={detecting || detectingAll}
              className="w-full rounded-lg bg-white/[0.06] px-3 py-2 text-label text-white font-body hover:bg-white/10 disabled:opacity-50 transition-colors"
            >
              {detectingAll ? 'Detectando todos...' : '⚡ Auto-detectar todos'}
            </button>
          </div>

          {/* Status */}
          {activeHasCorners && (
            <div className="text-label text-green-400 font-body">
              ✓ Tela marcada neste quadro
            </div>
          )}

          {!activeHasCorners && (
            <p className="text-[11px] text-neutral-600 font-body">
              Clique na imagem para posicionar a tela manualmente,
              ou use a detecção automática.
            </p>
          )}

          {/* Preset save/load */}
          {editedCount > 0 && (
            <div className="flex gap-2 pt-3 border-t border-white/5">
              <button
                onClick={handleExport}
                className="flex-1 rounded-lg bg-accent/15 px-3 py-2 text-label text-accent font-body font-medium hover:bg-accent/25 transition-colors"
              >
                💾 Salvar preset
              </button>
              <label className="flex-1 rounded-lg bg-white/[0.06] px-3 py-2 text-label text-white font-body hover:bg-white/10 transition-colors text-center cursor-pointer">
                📂 Carregar preset
                <input
                  ref={importRef}
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  className="hidden"
                />
              </label>
            </div>
          )}
        </>
      )}

      {error && <div className="text-label text-red-400 font-body">{error}</div>}
    </div>
  );
}

// ─── Filmstrip sub-component ─────────────────────────────────────

function KeyframeFilmstrip({
  keyframes,
  keyframeCorners,
  activeIndex,
  onSelect,
}: {
  keyframes: { frameIndex: number; time: number; thumbnailUrl: string }[];
  keyframeCorners: { frameIndex: number }[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const VISION_BASE = process.env.NEXT_PUBLIC_VISION_API_URL ?? 'http://localhost:8000';
  const editedFrames = new Set(keyframeCorners.map((kc) => kc.frameIndex));

  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
      {keyframes.map((kf, i) => {
        const isActive = i === activeIndex;
        const hasCorners = editedFrames.has(kf.frameIndex);

        return (
          <button
            key={kf.frameIndex}
            onClick={() => onSelect(i)}
            className={`relative flex-shrink-0 rounded overflow-hidden border-2 transition-colors ${
              isActive
                ? 'border-accent'
                : hasCorners
                  ? 'border-green-500/50'
                  : 'border-white/10'
            }`}
            title={`Frame ${kf.frameIndex} • ${kf.time.toFixed(2)}s`}
          >
            <img
              src={`${VISION_BASE}${kf.thumbnailUrl}`}
              alt={`Keyframe ${i + 1}`}
              className="w-14 h-8 object-cover"
              loading="lazy"
            />
            {hasCorners && (
              <div className="absolute top-0 right-0 w-2 h-2 bg-green-400 rounded-bl" />
            )}
            <div className="absolute bottom-0 inset-x-0 bg-black/60 text-[8px] text-neutral-400 text-center leading-3 font-body">
              {kf.time.toFixed(1)}s
            </div>
          </button>
        );
      })}
    </div>
  );
}
