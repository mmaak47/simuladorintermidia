'use client';

import type { MouseEvent as ReactMouseEvent, WheelEvent as ReactWheelEvent } from 'react';

interface ImageViewportProps {
  width: number;
  height: number;
  zoom: number;
  panX: number;
  panY: number;
  onWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onDoubleClick: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onResetView: () => void;
  children: React.ReactNode;
}

/**
 * Viewport shell for zoom/pan editing with transform controls.
 */
export function ImageViewport({
  width,
  height,
  zoom,
  panX,
  panY,
  onWheel,
  onDoubleClick,
  onResetView,
  children,
}: ImageViewportProps) {
  return (
    <div className="relative" style={{ width, height }}>
      <div
        className="absolute inset-0 overflow-hidden rounded-md"
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transformOrigin: 'center center',
            transition: 'transform 110ms ease-out',
            willChange: 'transform',
          }}
        >
          {children}
        </div>
      </div>

      <div className="absolute top-3 left-3 z-50 pointer-events-auto flex items-center gap-2">
        <div className="rounded-lg bg-black/70 border border-white/10 px-2.5 py-1 text-[11px] font-body text-white/85">
          Zoom {Math.round(zoom * 100)}%
        </div>
        <button
          type="button"
          onClick={onResetView}
          className="rounded-lg bg-black/70 border border-white/10 px-2.5 py-1 text-[11px] font-body text-white/85 hover:bg-black/85 transition-colors"
        >
          Reset zoom
        </button>
      </div>
    </div>
  );
}
