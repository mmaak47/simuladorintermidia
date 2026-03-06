'use client';

import { useState } from 'react';
import { useCompositionStore } from '@/store/composition-store';

/**
 * DetectionDebugOverlay — togglable SVG overlay that visualises:
 * - YOLO bounding box (green dashed)
 * - SAM mask (loaded from URL, semi-transparent purple)
 * - Final corner polygon (blue solid)
 *
 * Rendered inside the same explicitly-sized wrapper as the canvas,
 * so coordinates map 1:1 via the SVG viewBox.
 */
export function DetectionDebugOverlay() {
  const { location, hybridDetection, corners } = useCompositionStore();
  const [show, setShow] = useState(false);
  const [layers, setLayers] = useState({
    bbox: true,
    mask: true,
    contour: true,
  });

  if (!hybridDetection || !location) return null;

  const { debug, bbox, mask_url } = hybridDetection;
  const visionBase = process.env.NEXT_PUBLIC_VISION_API_URL ?? 'http://localhost:8000';

  return (
    <div className="space-y-2">
      <button
        onClick={() => setShow((v) => !v)}
        className="w-full rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-accent transition-colors"
      >
        {show ? 'Ocultar debug' : 'Mostrar detecção'}
      </button>

      {show && (
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={layers.bbox}
              onChange={() => setLayers((l) => ({ ...l, bbox: !l.bbox }))}
              className="accent-green-500"
            />
            Mostrar YOLO bbox
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={layers.mask}
              onChange={() => setLayers((l) => ({ ...l, mask: !l.mask }))}
              className="accent-purple-500"
            />
            Mostrar máscara SAM
          </label>
          <label className="flex items-center gap-2 text-xs text-zinc-500 cursor-pointer">
            <input
              type="checkbox"
              checked={layers.contour}
              onChange={() => setLayers((l) => ({ ...l, contour: !l.contour }))}
              className="accent-blue-500"
            />
            Mostrar contorno final
          </label>

          {/* Pipeline stages */}
          <details className="text-[10px] text-zinc-600">
            <summary className="cursor-pointer hover:text-zinc-400">
              Pipeline ({debug.pipeline_stages.length} etapas)
            </summary>
            <ol className="list-decimal list-inside mt-1 space-y-0.5">
              {debug.pipeline_stages.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </details>
        </div>
      )}
    </div>
  );
}

/**
 * SVG overlay rendered on top of the canvas inside PreviewCanvas.
 * Requires the image dimensions for the viewBox.
 */
export function DetectionDebugSvg({
  imgWidth,
  imgHeight,
}: {
  imgWidth: number;
  imgHeight: number;
}) {
  const { hybridDetection, corners } = useCompositionStore();
  const [layers] = useState({ bbox: true, mask: true, contour: true });

  if (!hybridDetection) return null;

  const { bbox, mask_url } = hybridDetection;
  const visionBase = process.env.NEXT_PUBLIC_VISION_API_URL ?? 'http://localhost:8000';

  const strokeW = Math.max(imgWidth, imgHeight) * 0.002;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${imgWidth} ${imgHeight}`}
      preserveAspectRatio="none"
    >
      {/* SAM mask as a semi-transparent image */}
      {layers.mask && mask_url && (
        <image
          href={`${visionBase}${mask_url}`}
          x={0}
          y={0}
          width={imgWidth}
          height={imgHeight}
          opacity={0.25}
          style={{ mixBlendMode: 'screen' }}
        />
      )}

      {/* YOLO bounding box */}
      {layers.bbox && (
        <rect
          x={bbox.x1}
          y={bbox.y1}
          width={bbox.x2 - bbox.x1}
          height={bbox.y2 - bbox.y1}
          fill="none"
          stroke="#22c55e"
          strokeWidth={strokeW}
          strokeDasharray={`${strokeW * 4} ${strokeW * 2}`}
          opacity={0.8}
        />
      )}

      {/* Final contour polygon */}
      {layers.contour && corners && (
        <polygon
          points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
          fill="rgba(59, 130, 246, 0.08)"
          stroke="#3b82f6"
          strokeWidth={strokeW}
          opacity={0.9}
        />
      )}
    </svg>
  );
}
