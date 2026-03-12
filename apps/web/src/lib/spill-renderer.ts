/**
 * Light Spill Renderer — simulates screen light bleeding onto
 * surrounding walls, bezels, and environment.
 *
 * Uses per-edge color sampling from the composited creative to
 * create directional soft gradients that extend outward from
 * each screen edge.  This is THE key realism differentiator for
 * DOOH simulation — it's the light you see on the wall around a
 * real digital screen.
 */

import type { ScreenCorners, SpillSettings, Point2D } from '@dooh/core';

/* ─── Edge color sampling ──────────────────────────────── */

export interface EdgeColors {
  top: [number, number, number];
  right: [number, number, number];
  bottom: [number, number, number];
  left: [number, number, number];
  /** Average of all edges, used as fallback */
  average: [number, number, number];
}

// Temporal smoothing state for per-edge colors
let _prevEdge: EdgeColors | null = null;
const EDGE_ALPHA = 0.15;

function lerpC(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[0] + EDGE_ALPHA * (b[0] - a[0]),
    a[1] + EDGE_ALPHA * (b[1] - a[1]),
    a[2] + EDGE_ALPHA * (b[2] - a[2]),
  ];
}

/**
 * Sample average colors along each edge of the screen quad
 * by reading pixel data from the already-composited canvas.
 * Returns smoothed per-edge colors.
 */
export function sampleEdgeColors(
  ctx: CanvasRenderingContext2D,
  corners: ScreenCorners,
): EdgeColors {
  const SAMPLES = 8;
  const [tl, tr, br, bl] = corners;

  const sampleEdge = (a: Point2D, b: Point2D): [number, number, number] => {
    let r = 0, g = 0, b2 = 0, count = 0;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const x = Math.round(a.x + (b.x - a.x) * t);
      const y = Math.round(a.y + (b.y - a.y) * t);
      // Inset by 2px to avoid reading exactly on the quad boundary
      const ix = Math.max(0, Math.min(ctx.canvas.width - 1, x));
      const iy = Math.max(0, Math.min(ctx.canvas.height - 1, y));
      try {
        const px = ctx.getImageData(ix, iy, 1, 1).data;
        r += px[0]; g += px[1]; b2 += px[2]; count++;
      } catch { count++; }
    }
    const n = Math.max(1, count);
    return [r / n, g / n, b2 / n];
  };

  const raw: EdgeColors = {
    top: sampleEdge(tl, tr),
    right: sampleEdge(tr, br),
    bottom: sampleEdge(bl, br),
    left: sampleEdge(tl, bl),
    average: [0, 0, 0],
  };
  raw.average = [
    (raw.top[0] + raw.right[0] + raw.bottom[0] + raw.left[0]) / 4,
    (raw.top[1] + raw.right[1] + raw.bottom[1] + raw.left[1]) / 4,
    (raw.top[2] + raw.right[2] + raw.bottom[2] + raw.left[2]) / 4,
  ];

  // Temporal smoothing
  if (!_prevEdge) { _prevEdge = raw; return raw; }

  const smoothed: EdgeColors = {
    top: lerpC(_prevEdge.top, raw.top),
    right: lerpC(_prevEdge.right, raw.right),
    bottom: lerpC(_prevEdge.bottom, raw.bottom),
    left: lerpC(_prevEdge.left, raw.left),
    average: lerpC(_prevEdge.average, raw.average),
  };
  _prevEdge = smoothed;
  return smoothed;
}

/** Reset temporal edge color state (call when creative changes) */
export function resetEdgeColors() {
  _prevEdge = null;
}

/* ─── Light Spill Rendering ───────────────────────────── */

/**
 * Draw light spill around the screen quad.
 *
 * For each edge:
 *   1. Compute outward normal direction
 *   2. Create a trapezoidal spill region extending outward
 *   3. Fill with radial gradient from edge color → transparent
 *
 * Also draws bezel reflection (thin bright strip along inner edge).
 */
export function drawLightSpill(
  ctx: CanvasRenderingContext2D,
  corners: ScreenCorners,
  spill: SpillSettings,
  edgeColors: EdgeColors,
  canvasWidth: number,
  canvasHeight: number,
) {
  if (!spill.enabled || spill.intensity < 0.01) return;

  const [tl, tr, br, bl] = corners;

  // Estimate screen size for radius calculation
  const screenW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const screenH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const maxSpillDist = Math.max(screenW, screenH) * spill.radius;

  ctx.save();
  ctx.globalCompositeOperation = 'screen'; // additive-ish blend

  // Draw spill for each edge
  drawEdgeSpill(ctx, tl, tr, 'top', edgeColors.top, spill.intensity, maxSpillDist, canvasWidth, canvasHeight);
  drawEdgeSpill(ctx, tr, br, 'right', edgeColors.right, spill.intensity, maxSpillDist, canvasWidth, canvasHeight);
  drawEdgeSpill(ctx, br, bl, 'bottom', edgeColors.bottom, spill.intensity, maxSpillDist, canvasWidth, canvasHeight);
  drawEdgeSpill(ctx, bl, tl, 'left', edgeColors.left, spill.intensity, maxSpillDist, canvasWidth, canvasHeight);

  // Corner spill (radial glow at each corner for smooth transitions)
  drawCornerSpill(ctx, tl, edgeColors.top, edgeColors.left, spill.intensity, maxSpillDist * 0.6);
  drawCornerSpill(ctx, tr, edgeColors.top, edgeColors.right, spill.intensity, maxSpillDist * 0.6);
  drawCornerSpill(ctx, br, edgeColors.bottom, edgeColors.right, spill.intensity, maxSpillDist * 0.6);
  drawCornerSpill(ctx, bl, edgeColors.bottom, edgeColors.left, spill.intensity, maxSpillDist * 0.6);

  ctx.restore();

  // Bezel reflection (additive thin strip along the inner screen boundary)
  if (spill.bezelReflection > 0.01) {
    drawBezelReflection(ctx, corners, edgeColors, spill.bezelReflection, screenW, screenH);
  }
}

/* ─── Per-edge spill gradient ─────────────────────────── */

function drawEdgeSpill(
  ctx: CanvasRenderingContext2D,
  p1: Point2D,
  p2: Point2D,
  _side: string,
  color: [number, number, number],
  intensity: number,
  spillDist: number,
  _cw: number,
  _ch: number,
) {
  // Edge midpoint and outward normal
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  // Outward normal (perpendicular, pointing away from quad center)
  // Convention: for a CW quad [TL, TR, BR, BL], the outward normal
  // for the top edge (TL→TR) points upward (negative Y)
  const nx = dy / len;
  const ny = -dx / len;

  // Ensure normal points outward by checking against quad center
  // (We just use the normal as-is since edge order is consistent)

  // Gradient endpoints: from edge midpoint, extending outward
  const g0x = mx;
  const g0y = my;
  const g1x = mx + nx * spillDist;
  const g1y = my + ny * spillDist;

  const grad = ctx.createLinearGradient(g0x, g0y, g1x, g1y);

  const [r, g, b] = color;
  // Boost saturation slightly for more visible color spill
  const boost = 1.2;
  const br = Math.min(255, r * boost);
  const bg = Math.min(255, g * boost);
  const bb = Math.min(255, b * boost);

  const alpha = intensity * 0.35;
  grad.addColorStop(0, `rgba(${br | 0}, ${bg | 0}, ${bb | 0}, ${alpha})`);
  grad.addColorStop(0.3, `rgba(${br | 0}, ${bg | 0}, ${bb | 0}, ${alpha * 0.4})`);
  grad.addColorStop(1, `rgba(${br | 0}, ${bg | 0}, ${bb | 0}, 0)`);

  // Build a trapezoidal spill region: edge extended outward
  const extend = spillDist;
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.lineTo(p2.x + nx * extend, p2.y + ny * extend);
  ctx.lineTo(p1.x + nx * extend, p1.y + ny * extend);
  ctx.closePath();

  ctx.fillStyle = grad;
  ctx.fill();
}

/* ─── Corner radial spill ─────────────────────────────── */

function drawCornerSpill(
  ctx: CanvasRenderingContext2D,
  corner: Point2D,
  edgeColor1: [number, number, number],
  edgeColor2: [number, number, number],
  intensity: number,
  radius: number,
) {
  // Blend the two adjacent edge colors
  const r = (edgeColor1[0] + edgeColor2[0]) / 2;
  const g = (edgeColor1[1] + edgeColor2[1]) / 2;
  const b = (edgeColor1[2] + edgeColor2[2]) / 2;

  const alpha = intensity * 0.2;
  const grad = ctx.createRadialGradient(
    corner.x, corner.y, 0,
    corner.x, corner.y, radius,
  );
  grad.addColorStop(0, `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`);
  grad.addColorStop(0.5, `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha * 0.3})`);
  grad.addColorStop(1, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0)`);

  ctx.beginPath();
  ctx.arc(corner.x, corner.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
}

/* ─── Bezel / frame reflection ────────────────────────── */

function drawBezelReflection(
  ctx: CanvasRenderingContext2D,
  corners: ScreenCorners,
  edgeColors: EdgeColors,
  bezelIntensity: number,
  screenW: number,
  _screenH: number,
) {
  const [tl, tr, br, bl] = corners;
  const bezelWidth = Math.max(2, screenW * 0.006);

  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineWidth = bezelWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw each edge with its corresponding color
  const edges: [Point2D, Point2D, [number, number, number]][] = [
    [tl, tr, edgeColors.top],
    [tr, br, edgeColors.right],
    [br, bl, edgeColors.bottom],
    [bl, tl, edgeColors.left],
  ];

  for (const [a, b, color] of edges) {
    const [r, g, bb] = color;
    const alpha = bezelIntensity * 0.5;
    ctx.strokeStyle = `rgba(${r | 0}, ${g | 0}, ${bb | 0}, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.restore();
}
