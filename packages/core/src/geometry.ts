import type { ScreenCorners, Point2D } from './types';

/**
 * Order 4 contour points as [tl, tr, br, bl] based on spatial position.
 */
export function orderCorners(points: Point2D[]): ScreenCorners {
  if (points.length !== 4) {
    throw new Error(`Expected exactly 4 points, got ${points.length}`);
  }

  // Sort by y to separate top pair from bottom pair
  const sorted = [...points].sort((a, b) => a.y - b.y);

  // Top two points: left has smaller x
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  // Bottom two points: left has smaller x
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);

  return [top[0], top[1], bottom[1], bottom[0]];
}

/**
 * Compute the area of a quadrilateral using the Shoelace formula.
 */
export function quadArea(corners: ScreenCorners): number {
  let area = 0;
  const n = corners.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += corners[i].x * corners[j].y;
    area -= corners[j].x * corners[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Check if a quad is roughly convex and has reasonable proportions.
 */
export function isValidScreenQuad(corners: ScreenCorners, minArea: number = 100): boolean {
  // Check minimum area
  if (quadArea(corners) < minArea) return false;

  // Check convexity via cross products — all should be same sign
  const signs: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    const c = corners[(i + 2) % 4];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    signs.push(Math.sign(cross));
  }

  return signs.every((s) => s > 0) || signs.every((s) => s < 0);
}

/**
 * Linear interpolation between two corner sets (for smoothing).
 */
export function lerpCorners(a: ScreenCorners, b: ScreenCorners, t: number): ScreenCorners {
  return a.map((pa, i) => ({
    x: pa.x + (b[i].x - pa.x) * t,
    y: pa.y + (b[i].y - pa.y) * t,
  })) as unknown as ScreenCorners;
}

/**
 * Exponential smoothing for tracked corners.
 */
export function smoothCorners(
  prev: ScreenCorners,
  current: ScreenCorners,
  alpha: number = 0.3,
): ScreenCorners {
  return lerpCorners(prev, current, alpha);
}
