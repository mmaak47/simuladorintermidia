'use client';

import { useCallback, useMemo, useState } from 'react';
import type { ScreenCorners } from '@dooh/core';
import { useCompositionStore } from '@/store/composition-store';
import { ZoomLens } from '@/components/simulator/ZoomLens';
import { QuadOverlay, type EdgeName } from './QuadOverlay';
import { WarpPreview } from './WarpPreview';

type DragMode =
  | { kind: 'corner'; index: number; pointerId: number; startX: number; startY: number; startCorners: ScreenCorners }
  | { kind: 'edge'; edge: EdgeName; pointerId: number; startX: number; startY: number; startCorners: ScreenCorners }
  | { kind: 'quad'; pointerId: number; startX: number; startY: number; startCorners: ScreenCorners }
  | {
      kind: 'create';
      pointerId: number;
      startIX: number;
      startIY: number;
      originalCorners: ScreenCorners | null;
    }
  | { kind: 'pan'; pointerId: number; startX: number; startY: number };

interface PerspectiveFrameEditorProps {
  imageWidth: number;
  imageHeight: number;
  onPanBy: (dx: number, dy: number) => void;
}

/**
 * Admin-only perspective frame editor with quad/edge/corner dragging,
 * live warped grid preview and optional pan interaction.
 */
export function PerspectiveFrameEditor({ imageWidth, imageHeight, onPanBy }: PerspectiveFrameEditorProps) {
  const {
    corners,
    setCorners,
    keyframeData,
    activeKeyframeIndex,
    setKeyframeCorners,
  } = useCompositionStore();

  const [drag, setDrag] = useState<DragMode | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<number | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeName | null>(null);
  const [zoomPos, setZoomPos] = useState({ x: 0, y: 0 });
  const [imgCoords, setImgCoords] = useState({ x: 0, y: 0 });

  const isKeyframeEditMode = !!keyframeData;

  const activeHandle = drag?.kind === 'corner' ? drag.index : hoveredHandle;
  const activeEdge = drag?.kind === 'edge' ? drag.edge : hoveredEdge;
  const quadActive = drag?.kind === 'quad' || drag?.kind === 'edge' || drag?.kind === 'corner';

  const activeKeyframe = keyframeData?.keyframes[activeKeyframeIndex] ?? null;

  const applyCorners = useCallback(
    (nextCorners: ScreenCorners) => {
      setCorners(nextCorners);
      if (isKeyframeEditMode && activeKeyframe) {
        setKeyframeCorners(activeKeyframe.frameIndex, activeKeyframe.time, nextCorners);
      }
    },
    [setCorners, isKeyframeEditMode, activeKeyframe, setKeyframeCorners],
  );

  const buildDefaultQuadAt = useCallback((x: number, y: number): ScreenCorners => {
    const qw = imageWidth * 0.34;
    const qh = imageHeight * 0.28;
    return [
      { x: clamp(x - qw / 2, 0, imageWidth), y: clamp(y - qh / 2, 0, imageHeight) },
      { x: clamp(x + qw / 2, 0, imageWidth), y: clamp(y - qh / 2, 0, imageHeight) },
      { x: clamp(x + qw / 2, 0, imageWidth), y: clamp(y + qh / 2, 0, imageHeight) },
      { x: clamp(x - qw / 2, 0, imageWidth), y: clamp(y + qh / 2, 0, imageHeight) },
    ] as ScreenCorners;
  }, [imageWidth, imageHeight]);

  const buildRectQuad = useCallback((x0: number, y0: number, x1: number, y1: number): ScreenCorners => {
    const left = clamp(Math.min(x0, x1), 0, imageWidth);
    const right = clamp(Math.max(x0, x1), 0, imageWidth);
    const top = clamp(Math.min(y0, y1), 0, imageHeight);
    const bottom = clamp(Math.max(y0, y1), 0, imageHeight);

    return [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
    ] as ScreenCorners;
  }, [imageWidth, imageHeight]);

  const toImageCoords = useCallback((event: React.PointerEvent | PointerEvent) => {
    const canvas = document.querySelector('main canvas') as HTMLCanvasElement | null;
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return null;

    const x = ((event.clientX - rect.left) / rect.width) * imageWidth;
    const y = ((event.clientY - rect.top) / rect.height) * imageHeight;

    return {
      x: clamp(x, 0, imageWidth),
      y: clamp(y, 0, imageHeight),
    };
  }, [imageWidth, imageHeight]);

  const startCornerDrag = useCallback(
    (index: number, event: React.PointerEvent) => {
      if (!corners) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      setDrag({
        kind: 'corner',
        index,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCorners: cloneCorners(corners),
      });
    },
    [corners],
  );

  const startEdgeDrag = useCallback(
    (edge: EdgeName, event: React.PointerEvent) => {
      if (!corners) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      setDrag({
        kind: 'edge',
        edge,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCorners: cloneCorners(corners),
      });
    },
    [corners],
  );

  const startQuadDrag = useCallback(
    (event: React.PointerEvent) => {
      if (!corners) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);

      setDrag({
        kind: 'quad',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startCorners: cloneCorners(corners),
      });
    },
    [corners],
  );

  const handlePointerDownBackground = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    // Left click + drag on background draws a new marquee selection.
    // Safety rule: if a quad already exists, require Alt to avoid accidental resets.
    if (event.button === 0 && !event.shiftKey) {
      if (corners && !event.altKey) {
        return;
      }

      const point = toImageCoords(event);
      if (point) {
        setDrag({
          kind: 'create',
          pointerId: event.pointerId,
          startIX: point.x,
          startIY: point.y,
          originalCorners: corners ? cloneCorners(corners) : null,
        });
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      return;
    }

    // Pan only when explicitly requested: middle/right click or Shift + left drag.
    const wantsPan = event.button === 1 || event.button === 2 || (event.button === 0 && event.shiftKey);
    if (!wantsPan) return;

    event.preventDefault();
    setDrag({
      kind: 'pan',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [toImageCoords, corners]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const coords = toImageCoords(event);
      if (coords) {
        setImgCoords({ x: coords.x, y: coords.y });
        setZoomPos({ x: event.clientX, y: event.clientY });
      }

      if (!drag) return;
      if (event.pointerId !== drag.pointerId) return;

      if (drag.kind === 'pan') {
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        onPanBy(dx, dy);
        setDrag({ ...drag, startX: event.clientX, startY: event.clientY });
        return;
      }

      if (drag.kind === 'create') {
        const point = toImageCoords(event);
        if (!point) return;
        applyCorners(buildRectQuad(drag.startIX, drag.startIY, point.x, point.y));
        return;
      }

      const next = cloneCorners(drag.startCorners);
      const point = toImageCoords(event);
      const startPoint = toImageCoords({ clientX: drag.startX, clientY: drag.startY } as PointerEvent);
      if (!point || !startPoint) return;

      const dx = point.x - startPoint.x;
      const dy = point.y - startPoint.y;

      if (drag.kind === 'corner') {
        next[drag.index] = {
          x: clamp(drag.startCorners[drag.index].x + dx, 0, imageWidth),
          y: clamp(drag.startCorners[drag.index].y + dy, 0, imageHeight),
        };
      }

      if (drag.kind === 'edge') {
        const mapping: Record<EdgeName, [number, number]> = {
          top: [0, 1],
          right: [1, 2],
          bottom: [3, 2],
          left: [0, 3],
        };
        const [a, b] = mapping[drag.edge];
        next[a] = {
          x: clamp(drag.startCorners[a].x + dx, 0, imageWidth),
          y: clamp(drag.startCorners[a].y + dy, 0, imageHeight),
        };
        next[b] = {
          x: clamp(drag.startCorners[b].x + dx, 0, imageWidth),
          y: clamp(drag.startCorners[b].y + dy, 0, imageHeight),
        };
      }

      if (drag.kind === 'quad') {
        for (let i = 0; i < next.length; i++) {
          next[i] = {
            x: clamp(drag.startCorners[i].x + dx, 0, imageWidth),
            y: clamp(drag.startCorners[i].y + dy, 0, imageHeight),
          };
        }
      }

      applyCorners(next);
    },
    [drag, imageWidth, imageHeight, applyCorners, toImageCoords, onPanBy, buildRectQuad],
  );

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (drag && event.pointerId === drag.pointerId) {
      if (drag.kind === 'create') {
        const point = toImageCoords(event);
        const endX = point ? point.x : drag.startIX;
        const endY = point ? point.y : drag.startIY;
        const dx = Math.abs(endX - drag.startIX);
        const dy = Math.abs(endY - drag.startIY);

        // Treat tiny mouse movement as a click: create a centered default quad.
        if (dx < 6 && dy < 6) {
          applyCorners(buildDefaultQuadAt(drag.startIX, drag.startIY));
        }
      }
      setDrag(null);
    }
  }, [drag, toImageCoords, applyCorners, buildDefaultQuadAt]);

  const showLens = useMemo(() => {
    return drag?.kind === 'corner' || drag?.kind === 'edge' || drag?.kind === 'quad';
  }, [drag]);

  if (!corners) {
    return (
      <div
        className="absolute inset-0 z-40"
        onPointerDown={handlePointerDownBackground}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ cursor: 'crosshair' }}
      />
    );
  }

  return (
    <div
      className="absolute inset-0 z-40"
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerDown={handlePointerDownBackground}
      style={{
        cursor: drag?.kind === 'pan' ? 'grabbing' : drag ? 'crosshair' : 'crosshair',
      }}
    >
      <WarpPreview corners={corners} width={imageWidth} height={imageHeight} active={quadActive} />
      <QuadOverlay
        corners={corners}
        imageWidth={imageWidth}
        imageHeight={imageHeight}
        activeHandle={activeHandle}
        activeEdge={activeEdge}
        quadActive={quadActive}
        onCornerPointerDown={startCornerDrag}
        onEdgePointerDown={startEdgeDrag}
        onQuadPointerDown={startQuadDrag}
        onCornerHover={setHoveredHandle}
        onEdgeHover={setHoveredEdge}
      />

      <ZoomLens
        imageX={imgCoords.x}
        imageY={imgCoords.y}
        screenX={zoomPos.x}
        screenY={zoomPos.y}
        visible={!!showLens}
      />

      <div className="absolute bottom-3 left-3 rounded-lg bg-black/70 border border-white/10 px-3 py-1.5 text-[11px] text-white/80 font-body pointer-events-none">
        Arraste cantos/arestas/area interna para ajuste fino. Nova selecao: Alt+arrastar no fundo. Pan: Shift+arrastar ou botao do meio/direito.
      </div>
    </div>
  );
}

function cloneCorners(corners: ScreenCorners): ScreenCorners {
  return corners.map((c) => ({ x: c.x, y: c.y })) as ScreenCorners;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
