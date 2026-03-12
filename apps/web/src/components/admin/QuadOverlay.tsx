'use client';

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { ScreenCorners } from '@dooh/core';

export type EdgeName = 'top' | 'right' | 'bottom' | 'left';

interface QuadOverlayProps {
  corners: ScreenCorners;
  imageWidth: number;
  imageHeight: number;
  activeHandle: number | null;
  activeEdge: EdgeName | null;
  quadActive: boolean;
  onCornerPointerDown: (index: number, event: ReactPointerEvent) => void;
  onEdgePointerDown: (edge: EdgeName, event: ReactPointerEvent) => void;
  onQuadPointerDown: (event: ReactPointerEvent) => void;
  onCornerHover: (index: number | null) => void;
  onEdgeHover: (edge: EdgeName | null) => void;
}

/**
 * Visible editable quad: edges, fill, corner handles and edge handles.
 */
export function QuadOverlay({
  corners,
  imageWidth,
  imageHeight,
  activeHandle,
  activeEdge,
  quadActive,
  onCornerPointerDown,
  onEdgePointerDown,
  onQuadPointerDown,
  onCornerHover,
  onEdgeHover,
}: QuadOverlayProps) {
  const [tl, tr, br, bl] = corners;

  const edgeMidpoints = {
    top: midpoint(tl, tr),
    right: midpoint(tr, br),
    bottom: midpoint(bl, br),
    left: midpoint(tl, bl),
  };
    const cornerCursor = (index: number): React.CSSProperties['cursor'] => {
      if (index === 0 || index === 2) return 'nwse-resize';
      return 'nesw-resize';
    };

    const edgeCursor = (edge: EdgeName): React.CSSProperties['cursor'] => {
      if (edge === 'top' || edge === 'bottom') return 'ns-resize';
      return 'ew-resize';
    };


  const edgeOrder: EdgeName[] = ['top', 'right', 'bottom', 'left'];

  return (
    <svg
      className="absolute inset-0 w-full h-full"
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="quad-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <polygon
        points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
        fill={quadActive ? 'rgba(254, 92, 43, 0.12)' : 'rgba(254, 92, 43, 0.08)'}
        stroke={quadActive ? 'rgba(254, 92, 43, 0.95)' : 'rgba(254, 92, 43, 0.75)'}
        strokeWidth={quadActive ? 3 : 2}
        filter="url(#quad-glow)"
        style={{ cursor: 'move' }}
        onPointerDown={onQuadPointerDown}
      />

      {edgeOrder.map((edge) => {
        const active = activeEdge === edge;
        const p = edgeMidpoints[edge];
        return (
          <g key={edge}>
            <circle
              cx={p.x}
              cy={p.y}
              r={active ? 7 : 5.5}
              fill={active ? 'rgba(254, 92, 43, 0.95)' : 'rgba(254, 92, 43, 0.7)'}
              stroke="rgba(0,0,0,0.75)"
              strokeWidth={1.5}
              style={{ cursor: edge === 'top' || edge === 'bottom' ? 'ns-resize' : 'ew-resize' }}
              onPointerDown={(event) => onEdgePointerDown(edge, event)}
              onPointerEnter={(event) => {
                onEdgeHover(edge);
                event.currentTarget.setAttribute('opacity', '1');
              }}
              onPointerLeave={(event) => {
                onEdgeHover(null);
                event.currentTarget.setAttribute('opacity', '0.92');
              }}
              opacity={0.92}
            />
          </g>
        );
      })}

      {corners.map((corner, index) => {
        const active = activeHandle === index;
        return (
          <g key={index}>
            <circle
              cx={corner.x}
              cy={corner.y}
              r={active ? 9.5 : 8}
              fill={active ? 'rgba(254, 92, 43, 1)' : 'rgba(254, 92, 43, 0.82)'}
              stroke="rgba(0,0,0,0.85)"
              strokeWidth={2}
              filter="url(#quad-glow)"
              style={{ cursor: 'grab' }}
              onPointerDown={(event) => onCornerPointerDown(index, event)}
              onPointerEnter={() => onCornerHover(index)}
              onPointerLeave={() => onCornerHover(null)}
            />
            <circle
              cx={corner.x}
              cy={corner.y}
              r={active ? 3.6 : 3}
              fill="rgba(18, 18, 18, 0.95)"
            />
          </g>
        );
      })}
    </svg>
  );
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}
