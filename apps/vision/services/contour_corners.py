"""
OpenCV contour → 4-corner extraction service.

Takes a binary mask, extracts external contours, rejects nested/tiny
rectangles, and produces ordered [TL, TR, BR, BL] corners.
"""

import logging
from typing import List, Tuple, Optional

import numpy as np
import cv2

from services.schemas import ContourResult, Point2D

logger = logging.getLogger(__name__)

# ── Tuning parameters ────────────────────────────────────────

# Minimum contour area as a fraction of the image area
MIN_AREA_FRACTION = 0.005

# Epsilon multiplier for approxPolyDP (fraction of arc length)
POLY_EPSILON = 0.02

# Morphological kernel size (pixels)
MORPH_KERNEL_SIZE = 7

# Maximum number of candidate contours to evaluate
MAX_CANDIDATES = 10


def extract_corners(
    mask: np.ndarray,
    reject_nested: bool = True,
) -> ContourResult:
    """
    Extract 4 ordered screen corners from a binary mask.

    Pipeline:
      1. Threshold + morphological cleanup
      2. Find external contours
      3. Filter by area
      4. Reject nested rectangles (inner content)
      5. Choose the best contour by area + rectangularity
      6. approxPolyDP → 4 corners, or fallback to minAreaRect
      7. Order: TL, TR, BR, BL

    Raises ValueError if no valid contour is found.
    """
    h, w = mask.shape[:2]
    img_area = h * w
    min_area = img_area * MIN_AREA_FRACTION

    # ── Binarise + cleanup ────────────────────────────────────
    if mask.dtype != np.uint8:
        mask = (mask.astype(np.uint8)) * 255

    _, binary = cv2.threshold(mask, 127, 255, cv2.THRESH_BINARY)

    kernel = cv2.getStructuringElement(
        cv2.MORPH_RECT, (MORPH_KERNEL_SIZE, MORPH_KERNEL_SIZE)
    )
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)
    binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)

    # ── Find contours ─────────────────────────────────────────
    contours, hierarchy = cv2.findContours(
        binary, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE
    )

    if not contours:
        raise ValueError("No contours found in mask")

    # ── Filter + score candidates ─────────────────────────────
    candidates: List[Tuple[float, int, np.ndarray]] = []

    for idx, cnt in enumerate(contours):
        area = cv2.contourArea(cnt)
        if area < min_area:
            continue

        # Bounding-rect area for rectangularity
        x, y, bw, bh = cv2.boundingRect(cnt)
        bb_area = bw * bh
        rect_score = area / bb_area if bb_area > 0 else 0.0

        candidates.append((area, idx, cnt, rect_score))

    if not candidates:
        raise ValueError(
            f"All contours below minimum area ({min_area:.0f}px). "
            "The mask may not contain a valid screen region."
        )

    # Sort by area descending
    candidates.sort(key=lambda c: c[0], reverse=True)
    candidates = candidates[:MAX_CANDIDATES]

    # ── Nested-rectangle rejection ────────────────────────────
    if reject_nested and len(candidates) > 1 and hierarchy is not None:
        candidates = _reject_nested(candidates, hierarchy[0], img_area)

    if not candidates:
        raise ValueError("All contours rejected by nested-rectangle filter")

    # ── Pick best: largest area × rectangularity ──────────────
    best = max(candidates, key=lambda c: c[0] * c[3])
    _, _, best_cnt, best_rect = best

    # ── Approximate to 4 corners ──────────────────────────────
    peri = cv2.arcLength(best_cnt, True)
    approx = cv2.approxPolyDP(best_cnt, POLY_EPSILON * peri, True)

    if len(approx) == 4:
        points = approx.reshape(4, 2).astype(np.float64)
    elif len(approx) >= 4:
        # Too many vertices — pick the 4 most extreme
        points = _pick_extreme_4(approx.reshape(-1, 2))
    else:
        # Fallback: minAreaRect
        rect = cv2.minAreaRect(best_cnt)
        box = cv2.boxPoints(rect)
        points = box.astype(np.float64)

    # Order: TL, TR, BR, BL
    corners = _order_corners(points)

    # ── Metrics ───────────────────────────────────────────────
    area = cv2.contourArea(best_cnt)
    x, y, bw, bh = cv2.boundingRect(best_cnt)
    bb_area = bw * bh
    rectangularity = area / bb_area if bb_area > 0 else 0.0
    aspect_ratio = bw / bh if bh > 0 else 1.0

    return ContourResult(
        corners=[Point2D(x=float(c[0]), y=float(c[1])) for c in corners],
        contour_area=float(area),
        rectangularity=rectangularity,
        aspect_ratio=aspect_ratio,
    )


# ── Nested rejection ─────────────────────────────────────────


def _reject_nested(
    candidates: List[Tuple],
    hier: np.ndarray,
    img_area: int,
) -> List[Tuple]:
    """
    Remove contours that are fully nested inside a larger rectangular
    contour, unless they occupy most of the parent box (>60%).

    hier row: [next, prev, child, parent]
    """
    kept = []
    largest_area = candidates[0][0]

    for area, idx, cnt, rect_score in candidates:
        parent_idx = hier[idx][3]

        if parent_idx < 0:
            # Top-level contour — always keep
            kept.append((area, idx, cnt, rect_score))
            continue

        # Inner contour — check ratio to largest candidate
        ratio = area / largest_area if largest_area > 0 else 0
        if ratio > 0.60:
            # Occupies most of the outer — might be the actual screen
            kept.append((area, idx, cnt, rect_score))
        else:
            logger.debug(
                "Rejecting nested contour idx=%d area=%.0f (%.1f%% of largest)",
                idx, area, ratio * 100,
            )

    return kept if kept else candidates[:1]


# ── Corner ordering ──────────────────────────────────────────


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """
    Order 4 points as [TL, TR, BR, BL].
    TL = smallest x+y,  BR = largest x+y
    TR = smallest y-x,  BL = largest y-x
    """
    s = pts.sum(axis=1)
    d = (pts[:, 1] - pts[:, 0])  # y - x

    ordered = np.zeros((4, 2), dtype=np.float64)
    ordered[0] = pts[np.argmin(s)]   # TL
    ordered[2] = pts[np.argmax(s)]   # BR
    ordered[1] = pts[np.argmin(d)]   # TR
    ordered[3] = pts[np.argmax(d)]   # BL
    return ordered


def _pick_extreme_4(pts: np.ndarray) -> np.ndarray:
    """
    From N points, pick the 4 that best approximate the corners of
    the convex hull (furthest in each diagonal direction).
    """
    s = pts.sum(axis=1)
    d = (pts[:, 1] - pts[:, 0])

    indices = set()
    indices.add(int(np.argmin(s)))
    indices.add(int(np.argmax(s)))
    indices.add(int(np.argmin(d)))
    indices.add(int(np.argmax(d)))

    # If fewer than 4 unique, fill with convex-hull extremes
    if len(indices) < 4:
        hull = cv2.convexHull(pts.astype(np.float32))
        hull_pts = hull.reshape(-1, 2)
        for p in hull_pts:
            if len(indices) >= 4:
                break
            # Find closest original index
            dists = np.linalg.norm(pts - p, axis=1)
            indices.add(int(np.argmin(dists)))

    idx_list = list(indices)[:4]
    return pts[idx_list].astype(np.float64)
