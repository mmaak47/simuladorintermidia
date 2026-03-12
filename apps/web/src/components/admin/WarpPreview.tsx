'use client';

import type { ScreenCorners } from '@dooh/core';

interface WarpPreviewProps {
  corners: ScreenCorners;
  width: number;
  height: number;
  active?: boolean;
}

/**
 * Draws a perspective-like test grid inside the selected quad.
 * This gives immediate visual feedback while the admin edits corners.
 */
export function WarpPreview({ corners, width, height, active = false }: WarpPreviewProps) {
  const [tl, tr, br, bl] = corners;
  const rows = 8;
  const cols = 8;

  const horizontalLines: string[] = [];
  const verticalLines: string[] = [];

  for (let r = 1; r < rows; r++) {
    const v = r / rows;
    const p0 = bilerp(tl, tr, br, bl, 0, v);
    const p1 = bilerp(tl, tr, br, bl, 1, v);
    horizontalLines.push(`${p0.x},${p0.y} ${p1.x},${p1.y}`);
  }

  for (let c = 1; c < cols; c++) {
    const u = c / cols;
    const p0 = bilerp(tl, tr, br, bl, u, 0);
    const p1 = bilerp(tl, tr, br, bl, u, 1);
    verticalLines.push(`${p0.x},${p0.y} ${p1.x},${p1.y}`);
  }

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="warp-grid-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="rgba(254, 92, 43, 0.7)" />
          <stop offset="100%" stopColor="rgba(254, 92, 43, 0.35)" />
        </linearGradient>
      </defs>

      <polygon
        points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
        fill={active ? 'rgba(254, 92, 43, 0.09)' : 'rgba(254, 92, 43, 0.05)'}
      />

      {horizontalLines.map((line, index) => (
        <polyline
          key={`h-${index}`}
          points={line}
          fill="none"
          stroke="url(#warp-grid-glow)"
          strokeOpacity={active ? 0.65 : 0.45}
          strokeWidth={1}
        />
      ))}

      {verticalLines.map((line, index) => (
        <polyline
          key={`v-${index}`}
          points={line}
          fill="none"
          stroke="url(#warp-grid-glow)"
          strokeOpacity={active ? 0.65 : 0.45}
          strokeWidth={1}
        />
      ))}
    </svg>
  );
}

function bilerp(
  tl: { x: number; y: number },
  tr: { x: number; y: number },
  br: { x: number; y: number },
  bl: { x: number; y: number },
  u: number,
  v: number,
): { x: number; y: number } {
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
  const bottom = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
  return { x: top.x + (bottom.x - top.x) * v, y: top.y + (bottom.y - top.y) * v };
}
