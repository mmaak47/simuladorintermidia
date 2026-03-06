'use client';

import { useState, useCallback, useRef } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import { detectScreenHybrid } from '@dooh/core';

/**
 * ScreenDetector — triggers the hybrid YOLO → SAM → OpenCV pipeline.
 *
 * After detection, corners are set in the store and the user can
 * fine-tune them with the CornerEditor overlay on the canvas.
 */
export function ScreenDetector() {
  const { location, segmentation, hybridDetection, setHybridDetection } =
    useCompositionStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cache the file blob so we don't re-fetch from the object URL each time
  const fileRef = useRef<File | null>(null);

  const handleDetect = useCallback(async () => {
    if (!location) return;

    setLoading(true);
    setError(null);

    try {
      let file = fileRef.current;
      if (!file) {
        const res = await fetch(location.url);
        const blob = await res.blob();
        file = new File([blob], 'location.jpg', { type: blob.type });
        fileRef.current = file;
      }

      const result = await detectScreenHybrid(file);
      setHybridDetection(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na detecção');
    } finally {
      setLoading(false);
    }
  }, [location, setHybridDetection]);

  const detected = !!segmentation || !!hybridDetection;
  const confidence = hybridDetection?.confidence ?? segmentation?.confidence ?? 0;
  const stages = hybridDetection?.debug.pipeline_stages ?? [];

  return (
    <div className="space-y-3">
      <button
        onClick={handleDetect}
        disabled={loading}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
      >
        {loading ? 'Detectando tela...' : 'Detectar tela'}
      </button>

      {detected && (
        <div className="text-xs text-green-400">
          ✓ Tela detectada (confiança: {(confidence * 100).toFixed(0)}%)
        </div>
      )}

      {hybridDetection && (
        <div className="text-xs text-zinc-500 space-y-0.5">
          <p>
            YOLO: {hybridDetection.debug.yolo_candidates.length} candidato(s)
          </p>
          <p>
            Retangularidade: {(hybridDetection.debug.rectangularity * 100).toFixed(0)}%
          </p>
          <p>
            Cobertura da máscara: {(hybridDetection.debug.mask_area_ratio * 100).toFixed(0)}%
          </p>
        </div>
      )}

      {error && <div className="text-xs text-red-400">{error}</div>}

      <p className="text-xs text-zinc-600">
        O pipeline híbrido usa YOLO → SAM → OpenCV para detectar a tela
        física completa. Ajuste os cantos manualmente se necessário.
      </p>
    </div>
  );
}
