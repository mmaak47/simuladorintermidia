'use client';

import { useRef, useState, useCallback, useEffect } from 'react';

/**
 * Before/After Comparison Slider
 *
 * Displays two canvases (or images) side-by-side with a draggable
 * vertical divider. Left side shows "before" (original location),
 * right side shows "after" (composited result).
 *
 * Usage:
 *   <BeforeAfterSlider
 *     beforeSrc={locationImageUrl}
 *     afterCanvas={previewCanvasRef.current}
 *   />
 */

interface BeforeAfterSliderProps {
  /** URL of the original location (before) */
  beforeSrc: string | null;
  /** The composited canvas element to read (after) */
  afterCanvas: HTMLCanvasElement | null;
  /** Width of display area */
  width: number;
  /** Height of display area */
  height: number;
}

export function BeforeAfterSlider({ beforeSrc, afterCanvas, width, height }: BeforeAfterSliderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [position, setPosition] = useState(0.5); // 0..1
  const dragging = useRef(false);

  // Load before image
  const [beforeImg, setBeforeImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!beforeSrc) { setBeforeImg(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setBeforeImg(img);
    img.src = beforeSrc;
    return () => { img.onload = null; };
  }, [beforeSrc]);

  // Draw the comparison
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !afterCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = width;
    canvas.height = height;

    const splitX = Math.round(width * position);

    // Right side: composited "after"
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, width - splitX, height);
    ctx.clip();
    ctx.drawImage(afterCanvas, 0, 0, width, height);
    ctx.restore();

    // Left side: original "before"
    if (beforeImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, splitX, height);
      ctx.clip();
      ctx.drawImage(beforeImg, 0, 0, width, height);
      ctx.restore();
    }

    // Divider line
    ctx.save();
    ctx.strokeStyle = '#FE5C2B';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(splitX, 0);
    ctx.lineTo(splitX, height);
    ctx.stroke();
    ctx.restore();

    // Divider handle
    const handleY = height / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(splitX, handleY, 16, 0, Math.PI * 2);
    ctx.fillStyle = '#FE5C2B';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Arrows
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⟨ ⟩', splitX, handleY);
    ctx.restore();

    // Labels
    ctx.save();
    ctx.font = '600 12px Poppins, sans-serif';
    ctx.textBaseline = 'top';
    // Before label
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(8, 8, 50, 22);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    ctx.fillText('ANTES', 14, 14);
    // After label
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(width - 58, 8, 50, 22);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.fillText('DEPOIS', width - 14, 14);
    ctx.restore();
  }, [beforeImg, afterCanvas, width, height, position]);

  useEffect(() => { draw(); }, [draw]);

  // Drag handling
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    dragging.current = true;
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging.current) return;
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    setPosition(Math.max(0.02, Math.min(0.98, x)));
  }, []);

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  if (!beforeSrc || !afterCanvas) return null;

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full cursor-col-resize"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
}
