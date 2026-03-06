import type { Point2D, ScreenCorners, HomographyMatrix, FitMode } from './types';

// ─── Homography helpers (CPU-side, small matrices) ──────────

/**
 * Compute a 3×3 perspective transform from source rect to destination quad.
 * Uses the DLT (Direct Linear Transform) approach.
 */
export function computeHomography(
  srcWidth: number,
  srcHeight: number,
  dst: ScreenCorners,
): HomographyMatrix {
  const src: ScreenCorners = [
    { x: 0, y: 0 },
    { x: srcWidth, y: 0 },
    { x: srcWidth, y: srcHeight },
    { x: 0, y: srcHeight },
  ];

  // Build 8×9 matrix for DLT
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x: sx, y: sy } = src[i];
    const { x: dx, y: dy } = dst[i];
    rows.push([-sx, -sy, -1, 0, 0, 0, sx * dx, sy * dx, dx]);
    rows.push([0, 0, 0, -sx, -sy, -1, sx * dy, sy * dy, dy]);
  }

  // Solve via SVD-like approach — for a 4-point correspondence this is exact.
  // We use a simplified Gaussian elimination on the 8×9 system.
  const A = rows.map((r) => [...r]);
  const n = 8;

  for (let col = 0; col < n; col++) {
    // Partial pivoting
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > Math.abs(A[maxRow][col])) maxRow = row;
    }
    [A[col], A[maxRow]] = [A[maxRow], A[col]];

    const pivot = A[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let j = col; j <= n; j++) A[col][j] /= pivot;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = A[row][col];
      for (let j = col; j <= n; j++) {
        A[row][j] -= factor * A[col][j];
      }
    }
  }

  // Extract h values, h9 = 1
  const h = new Array(9);
  for (let i = 0; i < 8; i++) h[i] = A[i][8];
  h[8] = 1;

  return { data: h };
}

/**
 * Apply a 3×3 homography to a 2D point.
 */
export function applyHomography(H: HomographyMatrix, p: Point2D): Point2D {
  const d = H.data;
  const w = d[6] * p.x + d[7] * p.y + d[8];
  return {
    x: (d[0] * p.x + d[1] * p.y + d[2]) / w,
    y: (d[3] * p.x + d[4] * p.y + d[5]) / w,
  };
}

/**
 * Compute UV-space source rect that maps a creative into the destination quad
 * respecting the given fit mode and preserving aspect ratio.
 */
export function computeUvFit(
  creativeWidth: number,
  creativeHeight: number,
  screenAspect: number,
  fitMode: FitMode,
): { offsetX: number; offsetY: number; scaleX: number; scaleY: number } {
  const creativeAspect = creativeWidth / creativeHeight;

  let scaleX = 1;
  let scaleY = 1;

  if (fitMode === 'cover') {
    if (creativeAspect > screenAspect) {
      // Creative is wider → crop sides
      scaleX = screenAspect / creativeAspect;
    } else {
      // Creative is taller → crop top/bottom
      scaleY = creativeAspect / screenAspect;
    }
  } else {
    // contain
    if (creativeAspect > screenAspect) {
      scaleY = creativeAspect / screenAspect;
    } else {
      scaleX = screenAspect / creativeAspect;
    }
  }

  return {
    offsetX: (1 - scaleX) / 2,
    offsetY: (1 - scaleY) / 2,
    scaleX,
    scaleY,
  };
}

/**
 * Compute the aspect ratio of a screen quad from its corners.
 */
export function computeScreenAspect(corners: ScreenCorners): number {
  const [tl, tr, br, bl] = corners;
  const topWidth = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const bottomWidth = Math.hypot(br.x - bl.x, br.y - bl.y);
  const leftHeight = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const rightHeight = Math.hypot(br.x - tr.x, br.y - tr.y);
  const avgWidth = (topWidth + bottomWidth) / 2;
  const avgHeight = (leftHeight + rightHeight) / 2;
  return avgWidth / avgHeight;
}
