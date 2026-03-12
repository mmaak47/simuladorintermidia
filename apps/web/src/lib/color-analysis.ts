/**
 * ColorAnalysisEngine — extracts dominant color, brightness, and
 * highlight strength from a canvas image source.
 *
 * Designed for real-time use: downscales the source to 64×64 and
 * runs a fast weighted k-means (k=3) in a single pass.  For video
 * a temporal-smoothing wrapper prevents per-frame flicker.
 */

export interface ColorAnalysisResult {
  /** Dominant color [r, g, b] 0-255 */
  dominantColor: [number, number, number];
  /** Up to 2 secondary colors */
  secondaryColors: [number, number, number][];
  /** Average brightness 0-1 */
  avgBrightness: number;
  /** Fraction of pixels above 80% brightness */
  highlightStrength: number;
}

/* ─── Scratch buffers (reused between frames) ──────────── */
const THUMB = 64;
let _offCanvas: OffscreenCanvas | HTMLCanvasElement | null = null;
let _offCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function getThumbCtx() {
  if (_offCtx) return _offCtx;
  if (typeof OffscreenCanvas !== 'undefined') {
    _offCanvas = new OffscreenCanvas(THUMB, THUMB);
    _offCtx = _offCanvas.getContext('2d')!;
  } else {
    _offCanvas = document.createElement('canvas');
    _offCanvas.width = THUMB;
    _offCanvas.height = THUMB;
    _offCtx = _offCanvas.getContext('2d')!;
  }
  return _offCtx;
}

/* ─── Single-frame analysis ───────────────────────────── */

export function analyzeColors(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): ColorAnalysisResult {
  const ctx = getThumbCtx();
  ctx.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, THUMB, THUMB);
  const { data } = ctx.getImageData(0, 0, THUMB, THUMB);

  const n = THUMB * THUMB;
  let totalR = 0, totalG = 0, totalB = 0;
  let highlights = 0;

  // Collect pixel sample
  const pixels: [number, number, number][] = new Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    pixels[i] = [r, g, b];
    totalR += r; totalG += g; totalB += b;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (lum > 0.8) highlights++;
  }

  const avgBrightness = (0.299 * totalR + 0.587 * totalG + 0.114 * totalB) / (n * 255);
  const highlightStrength = highlights / n;

  // Fast k-means (k=3, 6 iterations)
  const K = 3;
  const ITER = 6;
  const centers: [number, number, number][] = [
    pixels[0],
    pixels[Math.floor(n / 3)],
    pixels[Math.floor(2 * n / 3)],
  ];
  const counts = new Int32Array(K);
  const sums = new Float64Array(K * 3);

  for (let it = 0; it < ITER; it++) {
    counts.fill(0);
    sums.fill(0);

    for (let i = 0; i < n; i++) {
      const [r, g, b] = pixels[i];
      let bestD = Infinity, bestK = 0;
      for (let k = 0; k < K; k++) {
        const dr = r - centers[k][0];
        const dg = g - centers[k][1];
        const db = b - centers[k][2];
        const d = dr * dr + dg * dg + db * db;
        if (d < bestD) { bestD = d; bestK = k; }
      }
      counts[bestK]++;
      const off = bestK * 3;
      sums[off] += r; sums[off + 1] += g; sums[off + 2] += b;
    }

    for (let k = 0; k < K; k++) {
      const c = Math.max(1, counts[k]);
      const off = k * 3;
      centers[k] = [sums[off] / c, sums[off + 1] / c, sums[off + 2] / c];
    }
  }

  // Sort clusters by population (largest first)
  const clusters = centers.map((c, i) => ({ color: c, count: counts[i] }));
  clusters.sort((a, b) => b.count - a.count);

  const round3 = (c: [number, number, number]): [number, number, number] =>
    [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];

  return {
    dominantColor: round3(clusters[0].color),
    secondaryColors: clusters.slice(1).map((c) => round3(c.color)),
    avgBrightness,
    highlightStrength,
  };
}

/* ─── Temporal smoothing (for video) ─────────────────── */

const ALPHA = 0.2; // smoothing factor

function lerpChannel(prev: number, cur: number): number {
  return prev + ALPHA * (cur - prev);
}

function lerpColor(
  prev: [number, number, number],
  cur: [number, number, number],
): [number, number, number] {
  return [
    lerpChannel(prev[0], cur[0]),
    lerpChannel(prev[1], cur[1]),
    lerpChannel(prev[2], cur[2]),
  ];
}

let _prev: ColorAnalysisResult | null = null;

/**
 * Smoothed analysis suitable for video — call once per frame
 * (or once every N frames).  Returns temporally-smoothed values.
 */
export function analyzeColorsSmoothed(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
): ColorAnalysisResult {
  const raw = analyzeColors(source, sourceWidth, sourceHeight);
  if (!_prev) { _prev = raw; return raw; }

  const smoothed: ColorAnalysisResult = {
    dominantColor: lerpColor(_prev.dominantColor, raw.dominantColor),
    secondaryColors: raw.secondaryColors.map((c, i) =>
      _prev!.secondaryColors[i] ? lerpColor(_prev!.secondaryColors[i], c) : c,
    ),
    avgBrightness: lerpChannel(_prev.avgBrightness, raw.avgBrightness),
    highlightStrength: lerpChannel(_prev.highlightStrength, raw.highlightStrength),
  };

  _prev = smoothed;
  return smoothed;
}

/** Reset temporal smoothing state (e.g. when creative changes) */
export function resetSmoothing() {
  _prev = null;
}
