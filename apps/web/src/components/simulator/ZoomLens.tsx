'use client';

import { useRef, useEffect } from 'react';

/* ─── Configuration ──────────────────────────────────────── */
const LENS_SIZE = 140;
const ZOOM = 5;
const SAMPLE = LENS_SIZE / ZOOM; // ~28px sampled per axis
const OFFSET = 50;
const ACCENT = '#FE5C2B';

/* ─── ZoomLens Component ─────────────────────────────────── */

interface ZoomLensProps {
  /** Cursor position in image-space pixels */
  imageX: number;
  imageY: number;
  /** Cursor position in viewport (screen) coordinates */
  screenX: number;
  screenY: number;
  /** Whether to render the lens */
  visible: boolean;
}

/**
 * Precision magnifier that samples pixels from the preview
 * canvas and renders them at 5× with an orange crosshair.
 * Used during corner placement and drag for pixel-level accuracy.
 */
export function ZoomLens({
  imageX,
  imageY,
  screenX,
  screenY,
  visible,
}: ZoomLensProps) {
  const lensRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const lens = lensRef.current;
    if (!visible || !lens) return;

    const source = document.querySelector('main canvas') as HTMLCanvasElement | null;
    if (!source) return;

    const ctx = lens.getContext('2d');
    if (!ctx) return;

    const half = SAMPLE / 2;

    // 1. Dark background (for edges of image)
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, LENS_SIZE, LENS_SIZE);

    // 2. Magnified pixels — no interpolation for pixel clarity
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      source,
      imageX - half, imageY - half, SAMPLE, SAMPLE,
      0, 0, LENS_SIZE, LENS_SIZE,
    );

    // 3. Subtle pixel grid
    ctx.imageSmoothingEnabled = true;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 0.5;
    for (let g = ZOOM; g < LENS_SIZE; g += ZOOM) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, LENS_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(LENS_SIZE, g);
      ctx.stroke();
    }

    // 4. Crosshair
    const c = LENS_SIZE / 2;
    const GAP = 6;
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 2;

    ctx.beginPath();
    ctx.moveTo(0, c);
    ctx.lineTo(c - GAP, c);
    ctx.moveTo(c + GAP, c);
    ctx.lineTo(LENS_SIZE, c);
    ctx.moveTo(c, 0);
    ctx.lineTo(c, c - GAP);
    ctx.moveTo(c, c + GAP);
    ctx.lineTo(c, LENS_SIZE);
    ctx.stroke();

    // Center dot
    ctx.shadowBlur = 0;
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(c, c, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }, [visible, imageX, imageY]);

  if (!visible) return null;

  // Adaptive positioning — avoid blocking cursor or leaving viewport
  let left = screenX + OFFSET;
  let top = screenY - OFFSET - LENS_SIZE;

  if (typeof window !== 'undefined') {
    if (left + LENS_SIZE + 8 > window.innerWidth) left = screenX - OFFSET - LENS_SIZE;
    if (top < 8) top = screenY + OFFSET;
  }

  return (
    <div className="fixed pointer-events-none z-50" style={{ left, top }}>
      <canvas
        ref={lensRef}
        width={LENS_SIZE}
        height={LENS_SIZE}
        className="rounded-xl border-2 shadow-lg"
        style={{
          borderColor: 'rgba(254, 92, 43, 0.5)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.5)',
          imageRendering: 'pixelated',
        }}
      />
      <div className="text-[10px] text-center text-neutral-400 font-body mt-1.5 bg-black/80 backdrop-blur-sm rounded-md px-2 py-0.5 mx-auto w-fit">
        {Math.round(imageX)}, {Math.round(imageY)}
      </div>
    </div>
  );
}

/* ─── Edge Snap (Sobel gradient) ─────────────────────────── */

/**
 * Light edge snapping — finds the strongest gradient pixel
 * within `radius` pixels of (imgX, imgY) using a Sobel 3×3
 * kernel.  Returns a gently pulled coordinate when an edge is
 * found above `threshold`, or null to keep the raw position.
 */
export function findEdgeSnap(
  canvas: HTMLCanvasElement,
  imgX: number,
  imgY: number,
  radius = 4,
  threshold = 40,
): { x: number; y: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const size = radius * 2 + 1;
  const ox = Math.max(0, Math.round(imgX) - radius);
  const oy = Math.max(0, Math.round(imgY) - radius);
  const w = Math.min(size, canvas.width - ox);
  const h = Math.min(size, canvas.height - oy);

  if (w < 3 || h < 3) return null;

  const { data } = ctx.getImageData(ox, oy, w, h);

  // Grayscale luminance
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
  }

  // Sobel 3×3
  let bestMag = 0;
  let bestLx = -1;
  let bestLy = -1;

  for (let ly = 1; ly < h - 1; ly++) {
    for (let lx = 1; lx < w - 1; lx++) {
      const at = (dy: number, dx: number) => gray[(ly + dy) * w + (lx + dx)];
      const gx =
        -at(-1, -1) + at(-1, 1)
        - 2 * at(0, -1) + 2 * at(0, 1)
        - at(1, -1) + at(1, 1);
      const gy =
        -at(-1, -1) - 2 * at(-1, 0) - at(-1, 1)
        + at(1, -1) + 2 * at(1, 0) + at(1, 1);
      const mag = Math.sqrt(gx * gx + gy * gy);

      if (mag > bestMag) {
        bestMag = mag;
        bestLx = lx;
        bestLy = ly;
      }
    }
  }

  if (bestMag >= threshold && bestLx >= 0) {
    const snapX = ox + bestLx;
    const snapY = oy + bestLy;
    const dist = Math.hypot(snapX - imgX, snapY - imgY);

    if (dist <= radius && dist > 0.5) {
      // Gentle pull — stronger when closer to the edge
      const pull = Math.max(0.3, 1 - dist / radius);
      return {
        x: imgX + (snapX - imgX) * pull,
        y: imgY + (snapY - imgY) * pull,
      };
    }
  }

  return null;
}
