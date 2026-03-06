'use client';

import { useCallback, useRef, useState } from 'react';
import { useCompositionStore } from '@/store/composition-store';

/**
 * Overlay for dragging screen corners on the preview image.
 * Renders 4 draggable handles + connecting lines.
 * Shows a zoom lens with coordinates while dragging.
 */
export function CornerEditor() {
  const { location, corners, updateCorner } = useCompositionStore();
  const [dragging, setDragging] = useState<number | null>(null);
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 });

  /** Get the canvas element and its rendered rect */
  const getCanvasRect = useCallback(() => {
    const canvas = document.querySelector('main canvas') as HTMLCanvasElement | null;
    return canvas?.getBoundingClientRect() ?? null;
  }, []);

  /** Convert mouse event to image-space coords */
  const toImageCoords = useCallback(
    (e: React.PointerEvent | PointerEvent): { x: number; y: number } | null => {
      if (!location) return null;
      const rect = getCanvasRect();
      if (!rect) return null;
      const scaleX = location.width / rect.width;
      const scaleY = location.height / rect.height;
      return {
        x: Math.max(0, Math.min(location.width, (e.clientX - rect.left) * scaleX)),
        y: Math.max(0, Math.min(location.height, (e.clientY - rect.top) * scaleY)),
      };
    },
    [location, getCanvasRect],
  );

  /** Get CSS position relative to the canvas (as percentage of rendered size) */
  const toViewportPos = useCallback(
    (imgX: number, imgY: number): { left: string; top: string } | null => {
      if (!location) return null;
      return {
        left: `${(imgX / location.width) * 100}%`,
        top: `${(imgY / location.height) * 100}%`,
      };
    },
    [location],
  );

  const handlePointerDown = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(index);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging === null) return;
      const coords = toImageCoords(e);
      if (coords) {
        updateCorner(dragging, coords.x, coords.y);
        setZoomPos({ x: e.clientX, y: e.clientY });
      }
    },
    [dragging, toImageCoords, updateCorner],
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  if (!corners || !location) return null;

  // Build percentage-based positions for corners
  const viewportCorners = corners.map((c) => toViewportPos(c.x, c.y));
  if (viewportCorners.some((v) => !v)) return null;

  return (
    <div
      className="absolute inset-0"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={{ pointerEvents: dragging !== null ? 'auto' : 'none' }}
    >
      {/* SVG connecting lines — uses viewBox matching the image dimensions */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox={`0 0 ${location.width} ${location.height}`}
        preserveAspectRatio="none"
        style={{ pointerEvents: 'none' }}
      >
        <polygon
          points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
          fill="rgba(99, 102, 241, 0.06)"
          stroke="rgba(99, 102, 241, 0.6)"
          strokeWidth={Math.max(location.width, location.height) * 0.002}
          strokeDasharray={`${location.width * 0.005} ${location.width * 0.003}`}
        />
      </svg>

      {/* Corner handles */}
      {corners.map((corner, i) => {
        const pos = viewportCorners[i];
        if (!pos) return null;
        return (
          <div
            key={i}
            className="corner-handle"
            style={{
              left: pos.left,
              top: pos.top,
              pointerEvents: 'auto',
            }}
            onPointerDown={handlePointerDown(i)}
          />
        );
      })}

      {/* Zoom lens while dragging */}
      {dragging !== null && corners[dragging] && (
        <div
          className="zoom-lens"
          style={{
            left: zoomPos.x + 20,
            top: zoomPos.y - 80,
          }}
        >
          <div className="text-[10px] text-center text-zinc-400 mt-12">
            {Math.round(corners[dragging].x)}, {Math.round(corners[dragging].y)}
          </div>
        </div>
      )}
    </div>
  );
}
