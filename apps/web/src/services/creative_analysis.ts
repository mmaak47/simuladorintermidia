/**
 * Creative Analysis Service
 *
 * Classifies uploaded files as logo, campaign_image, or campaign_video.
 * Extracts dimensions, dominant colors (via KMeans), and transparency info.
 */

export type CreativeType = 'logo' | 'campaign_image' | 'campaign_video';

export interface CreativeAnalysis {
  creativeType: CreativeType;
  width: number;
  height: number;
  aspectRatio: number;
  /** Dominant colors extracted via KMeans clustering (hex) */
  dominantColors: string[];
  /** Structured primary/secondary/accent from KMeans */
  brandColors: { primary: string; secondary: string; accent: string };
  hasTransparency: boolean;
}

/* ─── Color helpers ───────────────────────────────────────── */

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
}

function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/* ─── KMeans Color Extraction ─────────────────────────────── */

interface ColorCluster {
  r: number; g: number; b: number;
  count: number;
}

function kmeansColors(pixels: number[][], k: number, maxIter = 12): ColorCluster[] {
  if (pixels.length === 0) return [];

  // Initialize centroids by picking k evenly-spaced pixels
  const step = Math.max(1, Math.floor(pixels.length / k));
  const centroids: number[][] = [];
  for (let i = 0; i < k; i++) {
    centroids.push([...pixels[Math.min(i * step, pixels.length - 1)]]);
  }

  const assignments = new Int32Array(pixels.length);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;

    // Assign pixels to nearest centroid
    for (let i = 0; i < pixels.length; i++) {
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let c = 0; c < k; c++) {
        const dr = pixels[i][0] - centroids[c][0];
        const dg = pixels[i][1] - centroids[c][1];
        const db = pixels[i][2] - centroids[c][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; bestIdx = c; }
      }
      if (assignments[i] !== bestIdx) { assignments[i] = bestIdx; changed = true; }
    }

    if (!changed) break;

    // Recompute centroids
    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]); // r, g, b, count
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      sums[c][3]++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centroids[c][0] = sums[c][0] / sums[c][3];
        centroids[c][1] = sums[c][1] / sums[c][3];
        centroids[c][2] = sums[c][2] / sums[c][3];
      }
    }
  }

  // Build cluster results with count
  const counts = new Array(k).fill(0);
  for (let i = 0; i < assignments.length; i++) counts[assignments[i]]++;

  return centroids.map((c, i) => ({
    r: Math.round(c[0]), g: Math.round(c[1]), b: Math.round(c[2]),
    count: counts[i],
  }));
}

function extractDominantColors(ctx: CanvasRenderingContext2D, w: number, h: number, count = 5): string[] {
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.floor(data.length / 4 / 2000));
  const pixels: number[][] = [];

  for (let i = 0; i < data.length; i += step * 4) {
    const a = data[i + 3];
    if (a < 30) continue; // skip transparent pixels
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }

  const clusters = kmeansColors(pixels, Math.min(count, 8));
  return clusters
    .sort((a, b) => b.count - a.count)
    .slice(0, count)
    .map((c) => rgbToHex(c.r, c.g, c.b));
}

/** Classify KMeans colors into primary/secondary/accent */
function classifyBrandColors(colors: string[]): { primary: string; secondary: string; accent: string } {
  if (colors.length === 0) return { primary: '#FE5C2B', secondary: '#1a1a2e', accent: '#ffffff' };

  // Score each color by vibrancy = saturation × distance-from-extremes
  const scored = colors.map((hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const sat = saturation(r, g, b);
    const lum = luminance(r, g, b);
    return { hex, sat, lum, vibrancy: sat * (1 - Math.abs(lum - 0.45)) };
  });

  // Primary: most vibrant
  scored.sort((a, b) => b.vibrancy - a.vibrancy);
  const primary = scored[0].hex;

  // Secondary: darkest non-primary
  const dark = scored.filter((c) => c.hex !== primary).sort((a, b) => a.lum - b.lum);
  const secondary = dark[0]?.hex ?? '#1a1a2e';

  // Accent: lightest or second-most-vibrant, excluding primary/secondary
  const remaining = scored.filter((c) => c.hex !== primary && c.hex !== secondary);
  const accent = remaining[0]?.hex ?? '#ffffff';

  return { primary, secondary, accent };
}

/* ─── Transparency detection ──────────────────────────────── */

function detectTransparency(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  let transparentPixels = 0;
  const total = w * h;
  const step = Math.max(1, Math.floor(total / 5000));

  for (let i = 3; i < data.length; i += step * 4) {
    if (data[i] < 240) transparentPixels++;
  }

  return transparentPixels / Math.ceil(total / step) > 0.05;
}

/* ─── Logo heuristic checks ──────────────────────────────── */

interface LogoSignals {
  hasTransparency: boolean;
  hasLargeMargins: boolean;
  hasSimpleComposition: boolean;
  isSmallDimension: boolean;
  hasCenteredElement: boolean;
  hasLowColorVariation: boolean;
}

function checkLargeMargins(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // Check if edges are mostly empty (transparent or uniform color)
  const edgeSamples = 80;
  const edgePixels: number[] = [];

  for (let i = 0; i < edgeSamples; i++) {
    const x = Math.floor((i / edgeSamples) * w);
    // Top edge
    const topData = ctx.getImageData(x, 0, 1, 1).data;
    edgePixels.push(topData[3]);
    // Bottom edge
    const bottomData = ctx.getImageData(x, h - 1, 1, 1).data;
    edgePixels.push(bottomData[3]);
    // Left edge
    const y = Math.floor((i / edgeSamples) * h);
    const leftData = ctx.getImageData(0, y, 1, 1).data;
    edgePixels.push(leftData[3]);
    // Right edge
    const rightData = ctx.getImageData(w - 1, y, 1, 1).data;
    edgePixels.push(rightData[3]);
  }

  const emptyEdge = edgePixels.filter((a) => a < 20).length / edgePixels.length;
  return emptyEdge > 0.6;
}

function checkSimpleComposition(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  // A logo tends to have fewer unique color regions than a full campaign image
  const data = ctx.getImageData(0, 0, w, h).data;
  const uniqueColors = new Set<string>();
  const step = Math.max(1, Math.floor(data.length / 4 / 3000));

  for (let i = 0; i < data.length; i += step * 4) {
    // Quantize heavily to find broad color regions
    const r = Math.round(data[i] / 64) * 64;
    const g = Math.round(data[i + 1] / 64) * 64;
    const b = Math.round(data[i + 2] / 64) * 64;
    uniqueColors.add(`${r},${g},${b}`);
  }

  // Logos tend to have fewer than ~15 broad color regions
  return uniqueColors.size < 15;
}

function computeContentBounds(ctx: CanvasRenderingContext2D, w: number, h: number): { contentRatio: number; centerX: number; centerY: number } {
  const data = ctx.getImageData(0, 0, w, h).data;
  let minX = w, maxX = 0, minY = h, maxY = 0;
  let hasContent = false;

  const step = Math.max(1, Math.floor(w * h / 10000));
  for (let idx = 0; idx < w * h; idx += step) {
    const x = idx % w;
    const y = Math.floor(idx / w);
    const i = idx * 4;
    const a = data[i + 3];
    const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;

    // Consider a pixel as "content" if it's not transparent and not nearly white
    if (a > 30 && brightness < 245) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      hasContent = true;
    }
  }

  if (!hasContent) return { contentRatio: 0, centerX: 0.5, centerY: 0.5 };

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  const centerX = (minX + maxX) / 2 / w;
  const centerY = (minY + maxY) / 2 / h;
  return { contentRatio: (contentW * contentH) / (w * h), centerX, centerY };
}

/** Check if the content is a single centered element */
function checkCenteredElement(centerX: number, centerY: number, contentRatio: number): boolean {
  // Content center should be near image center (within 15%) and content should be small (<50%)
  const distFromCenter = Math.hypot(centerX - 0.5, centerY - 0.5);
  return distFromCenter < 0.15 && contentRatio < 0.5;
}

/** Check if image has very low color variation (few distinct colors) */
function checkLowColorVariation(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const data = ctx.getImageData(0, 0, w, h).data;
  const step = Math.max(1, Math.floor(data.length / 4 / 2000));
  const uniqueCoarse = new Set<string>();

  for (let i = 0; i < data.length; i += step * 4) {
    if (data[i + 3] < 30) continue; // skip transparent
    const r = Math.round(data[i] / 48) * 48;
    const g = Math.round(data[i + 1] / 48) * 48;
    const b = Math.round(data[i + 2] / 48) * 48;
    uniqueCoarse.add(`${r},${g},${b}`);
  }

  // Logos typically have < 10 coarse color bins
  return uniqueCoarse.size < 10;
}

function classifyImage(signals: LogoSignals): CreativeType {
  let logoScore = 0;

  if (signals.hasTransparency) logoScore += 3;
  if (signals.hasLargeMargins) logoScore += 2;
  if (signals.hasSimpleComposition) logoScore += 2;
  if (signals.isSmallDimension) logoScore += 1;
  if (signals.hasCenteredElement) logoScore += 2;
  if (signals.hasLowColorVariation) logoScore += 1;

  // Score >= 4 → likely a logo
  return logoScore >= 4 ? 'logo' : 'campaign_image';
}

/* ─── Public API ──────────────────────────────────────────── */

export function analyzeCreative(file: File): Promise<CreativeAnalysis> {
  return new Promise((resolve, reject) => {
    const isVideo = file.type.startsWith('video/');

    if (isVideo) {
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => {
        // Extract a single frame for color analysis
        const canvas = document.createElement('canvas');
        const w = Math.min(vid.videoWidth, 400);
        const h = Math.min(vid.videoHeight, 400);
        canvas.width = w;
        canvas.height = h;

        vid.currentTime = 0.1;
        vid.onseeked = () => {
          const ctx = canvas.getContext('2d')!;
          ctx.drawImage(vid, 0, 0, w, h);
          const colors = extractDominantColors(ctx, w, h);
          const brandColors = classifyBrandColors(colors);
          resolve({
            creativeType: 'campaign_video',
            width: vid.videoWidth,
            height: vid.videoHeight,
            aspectRatio: vid.videoWidth / vid.videoHeight,
            dominantColors: colors,
            brandColors,
            hasTransparency: false,
          });
        };
      };
      vid.onerror = () => reject(new Error('Failed to load video metadata'));
      vid.src = URL.createObjectURL(file);
      return;
    }

    // Image analysis
    const img = new Image();
    img.onload = () => {
      const w = Math.min(img.naturalWidth, 600);
      const h = Math.min(img.naturalHeight, 600);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;

      // Draw on a transparent canvas to preserve alpha
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const hasAlpha = file.type === 'image/png' || file.type === 'image/webp';
      const transparency = hasAlpha ? detectTransparency(ctx, w, h) : false;
      const largeMargins = hasAlpha ? checkLargeMargins(ctx, w, h) : false;
      const simpleComp = checkSimpleComposition(ctx, w, h);
      const { contentRatio, centerX, centerY } = computeContentBounds(ctx, w, h);
      const isSmall = img.naturalWidth <= 1200 && img.naturalHeight <= 1200;
      const centeredElement = checkCenteredElement(centerX, centerY, contentRatio);
      const lowColorVariation = checkLowColorVariation(ctx, w, h);

      const signals: LogoSignals = {
        hasTransparency: transparency,
        hasLargeMargins: largeMargins || (transparency && contentRatio < 0.35),
        hasSimpleComposition: simpleComp,
        isSmallDimension: isSmall,
        hasCenteredElement: centeredElement,
        hasLowColorVariation: lowColorVariation,
      };

      const colors = extractDominantColors(ctx, w, h);
      const brandColors = classifyBrandColors(colors);
      const creativeType = classifyImage(signals);

      resolve({
        creativeType,
        width: img.naturalWidth,
        height: img.naturalHeight,
        aspectRatio: img.naturalWidth / img.naturalHeight,
        dominantColors: colors,
        brandColors,
        hasTransparency: transparency,
      });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}
