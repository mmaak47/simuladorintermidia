'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import { CornerEditor } from './CornerEditor';
import { DetectionDebugSvg } from './DetectionDebugOverlay';
import { computeUvFit, computeScreenAspect } from '@dooh/core';
import type { ScreenCorners, CinematicSettings, DisplaySettings } from '@dooh/core';

/**
 * Canvas-based preview that composites:
 * 1. Location background
 * 2. Perspective-warped creative into the screen quad
 * 3. Display simulation (brightness, glass)
 * 4. Cinematic effects (bloom, vignette, grain, CA)
 * 5. Click-to-place detection point
 *
 * Uses ResizeObserver to fit the canvas within the available viewport area.
 * Canvas buffer is always at full image resolution for export quality.
 */
export function PreviewCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const {
    location,
    corners,
    creative,
    fitMode,
    display,
    cinematic,
    segmentation,
    hybridDetection,
    setCorners,
  } = useCompositionStore();

  const bgImage = useImageLoader(location?.url ?? null);
  const creativeImage = useImageLoader(creative?.type === 'image' ? creative.url : null);

  // ─── Track available space via ResizeObserver ───────────────
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ─── Calculate display size (fit image within container) ───
  const displaySize = useMemo(() => {
    if (!location || containerSize.w <= 0 || containerSize.h <= 0) return null;
    const imgAspect = location.width / location.height;
    const boxAspect = containerSize.w / containerSize.h;
    if (imgAspect > boxAspect) {
      return { width: containerSize.w, height: Math.round(containerSize.w / imgAspect) };
    }
    return { width: Math.round(containerSize.h * imgAspect), height: containerSize.h };
  }, [location, containerSize]);

  // ─── Render composited frame ──────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !location || !bgImage) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Canvas buffer = full image resolution (for export)
    if (canvas.width !== location.width || canvas.height !== location.height) {
      canvas.width = location.width;
      canvas.height = location.height;
    }

    // 1. Background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgImage, 0, 0, location.width, location.height);

    // 2. Creative into screen quad
    if (creativeImage && corners) {
      drawCreativeIntoQuad(ctx, creativeImage, corners, fitMode, display);

      // 3. Cinematic post-processing
      if (cinematic.enabled) {
        applyCinematicEffects(ctx, canvas.width, canvas.height, cinematic);
      }
    }
    // Mask overlay when corners exist but no creative yet
    else if (corners && segmentation && !creative) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.closePath();
      ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.7)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }, [location, bgImage, creativeImage, corners, creative, segmentation, fitMode, display, cinematic]);

  useEffect(() => {
    render();
  }, [render]);

  // ─── Click to place default corners ───────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !location) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = location.width / rect.width;
      const scaleY = location.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      if (!corners && !segmentation) {
        const dw = location.width * 0.25;
        const dh = location.height * 0.3;
        setCorners([
          { x: x - dw / 2, y: y - dh / 2 },
          { x: x + dw / 2, y: y - dh / 2 },
          { x: x + dw / 2, y: y + dh / 2 },
          { x: x - dw / 2, y: y + dh / 2 },
        ]);
      }
    },
    [location, corners, segmentation, setCorners],
  );

  if (!location) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center p-4">
      {displaySize && displaySize.width > 0 && (
        <div
          className="relative flex-shrink-0"
          style={{ width: displaySize.width, height: displaySize.height }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            className="block w-full h-full cursor-crosshair"
          />
          {hybridDetection && (
            <DetectionDebugSvg imgWidth={location.width} imgHeight={location.height} />
          )}
          {corners && <CornerEditor />}
        </div>
      )}
    </div>
  );
}

// ─── Drawing helpers ─────────────────────────────────────────────

/**
 * Draw creative into the screen quad using perspective subdivision.
 * Splits the quad into a grid and uses per-cell affine transforms
 * to approximate perspective distortion on a 2D canvas.
 */
function drawCreativeIntoQuad(
  ctx: CanvasRenderingContext2D,
  creative: HTMLImageElement,
  corners: ScreenCorners,
  fitMode: 'cover' | 'contain',
  display: DisplaySettings,
) {
  const [tl, tr, br, bl] = corners;
  const cw = creative.naturalWidth;
  const ch = creative.naturalHeight;

  // Compute UV fit
  const aspect = computeScreenAspect(corners);
  const fit = computeUvFit(cw, ch, aspect, fitMode);

  // Subdivision grid for perspective approximation
  const DIVS = 8;

  ctx.save();

  // Clip to the quad shape
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.clip();

  for (let row = 0; row < DIVS; row++) {
    for (let col = 0; col < DIVS; col++) {
      const u0 = col / DIVS;
      const u1 = (col + 1) / DIVS;
      const v0 = row / DIVS;
      const v1 = (row + 1) / DIVS;

      // Bilinear interpolation to get quad positions for this cell
      const p00 = bilerp(tl, tr, br, bl, u0, v0);
      const p10 = bilerp(tl, tr, br, bl, u1, v0);
      const p01 = bilerp(tl, tr, br, bl, u0, v1);
      const p11 = bilerp(tl, tr, br, bl, u1, v1);

      // Source rect in creative image (clamped to valid range)
      let sx = (fit.offsetX + u0 * fit.scaleX) * cw;
      let sy = (fit.offsetY + v0 * fit.scaleY) * ch;
      let sw = (fit.scaleX / DIVS) * cw;
      let sh = (fit.scaleY / DIVS) * ch;

      // Clamp to image bounds (browser handles partial source rects)
      sx = Math.max(0, Math.min(sx, cw - 1));
      sy = Math.max(0, Math.min(sy, ch - 1));
      sw = Math.min(sw, cw - sx);
      sh = Math.min(sh, ch - sy);

      if (sw <= 0 || sh <= 0) continue;

      // Draw this cell using affine transform
      drawAffineCell(ctx, creative, sx, sy, sw, sh, p00, p10, p01, p11);
    }
  }

  // Glass overlay — semi-transparent gradient
  if (display.glassReflectivity > 0.01) {
    const grad = ctx.createLinearGradient(
      (tl.x + bl.x) / 2, tl.y,
      (tr.x + br.x) / 2, br.y,
    );
    grad.addColorStop(0, `rgba(180, 200, 220, ${display.glassReflectivity * 0.25})`);
    grad.addColorStop(0.5, `rgba(255, 255, 255, ${display.glassReflectivity * 0.08})`);
    grad.addColorStop(1, `rgba(140, 160, 180, ${display.glassReflectivity * 0.2})`);

    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.restore();

  // Brightness overlay (nits simulation)
  const nitsScale = display.screenNits / 700;
  if (nitsScale > 1.05) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min((nitsScale - 1.0) * 0.12, 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      Math.min(tl.x, bl.x), Math.min(tl.y, tr.y),
      Math.max(tr.x, br.x) - Math.min(tl.x, bl.x),
      Math.max(bl.y, br.y) - Math.min(tl.y, tr.y),
    );
    ctx.restore();
  } else if (nitsScale < 0.95) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = Math.min((1.0 - nitsScale) * 0.5, 0.5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      Math.min(tl.x, bl.x), Math.min(tl.y, tr.y),
      Math.max(tr.x, br.x) - Math.min(tl.x, bl.x),
      Math.max(bl.y, br.y) - Math.min(tl.y, tr.y),
    );
    ctx.restore();
  }
}

/**
 * Draw a single cell with affine transform approximation.
 */
function drawAffineCell(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  sx: number, sy: number, sw: number, sh: number,
  p00: { x: number; y: number },
  p10: { x: number; y: number },
  p01: { x: number; y: number },
  _p11: { x: number; y: number },
) {
  // Affine transform: map unit square to parallelogram defined by p00, p10, p01
  const dx1 = p10.x - p00.x;
  const dy1 = p10.y - p00.y;
  const dx2 = p01.x - p00.x;
  const dy2 = p01.y - p00.y;

  ctx.save();
  ctx.setTransform(
    dx1 / sw, dy1 / sw,
    dx2 / sh, dy2 / sh,
    p00.x, p00.y,
  );
  // Draw slightly oversized to prevent seams between cells
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw + 0.5, sh + 0.5);
  ctx.restore();
}

/**
 * Bilinear interpolation within a quad.
 */
function bilerp(
  tl: { x: number; y: number }, tr: { x: number; y: number },
  br: { x: number; y: number }, bl: { x: number; y: number },
  u: number, v: number,
): { x: number; y: number } {
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
  const bot = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

// ─── Cinematic post-processing (canvas-based) ───────────────────

function applyCinematicEffects(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: CinematicSettings,
) {
  // Vignette
  if (settings.vignetteIntensity > 0.01) {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.hypot(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${settings.vignetteIntensity * 0.6})`);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Bloom (soft glow over bright areas)
  if (settings.bloomIntensity > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = settings.bloomIntensity * 0.2;
    ctx.filter = `blur(${Math.round(Math.max(width, height) * 0.015)}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
    // Reset filter
    ctx.filter = 'none';
  }

  // Film grain via pixel manipulation
  if (settings.grainIntensity > 0.01) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const intensity = settings.grainIntensity * 25;
    // Sample every 2nd pixel for performance
    for (let i = 0; i < data.length; i += 8) {
      const noise = (Math.random() - 0.5) * intensity;
      data[i] = clamp(data[i] + noise);         // R
      data[i + 1] = clamp(data[i + 1] + noise); // G
      data[i + 2] = clamp(data[i + 2] + noise); // B
      // Copy to next pixel for speed
      if (i + 4 < data.length) {
        data[i + 4] = clamp(data[i + 4] + noise);
        data[i + 5] = clamp(data[i + 5] + noise);
        data[i + 6] = clamp(data[i + 6] + noise);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Chromatic aberration (RGB channel shift)
  if (settings.chromaticAberration > 0.01) {
    const shift = Math.round(settings.chromaticAberration * 4);
    if (shift >= 1) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const copy = new Uint8ClampedArray(imageData.data);
      const data = imageData.data;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          // Shift red channel outward from center
          const rx = Math.min(Math.max(x + shift, 0), width - 1);
          const ridx = (y * width + rx) * 4;
          data[idx] = copy[ridx]; // R from shifted position

          // Shift blue channel opposite direction
          const bx = Math.min(Math.max(x - shift, 0), width - 1);
          const bidx = (y * width + bx) * 4;
          data[idx + 2] = copy[bidx + 2]; // B from shifted position
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }

  // Highlight compression (tone map bright pixels)
  if (settings.highlightCompression > 0.01) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const comp = settings.highlightCompression;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = toneMap(data[i], comp);
      data[i + 1] = toneMap(data[i + 1], comp);
      data[i + 2] = toneMap(data[i + 2], comp);
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function toneMap(value: number, compression: number): number {
  const v = value / 255;
  const mapped = v / (1 + v * compression);
  // Re-normalize so midtones stay roughly the same
  const midCorrection = 1 + 0.5 * compression;
  return clamp(mapped * midCorrection * 255);
}

// ─── Image loader hook (triggers re-render) ─────────────────────

function useImageLoader(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = url;

    // If already cached, it may fire synchronously
    if (img.complete && img.naturalWidth > 0) {
      setImage(img);
    }

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  return image;
}
