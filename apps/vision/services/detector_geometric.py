"""
Geometric rectangle detector — edge-based fallback for when YOLO
cannot identify a screen (e.g. outdoor billboards, LED panels,
digital signage not in COCO classes).

Uses Canny edge detection + contour analysis to find the largest
rectangular structure in the image.
"""

import logging
from typing import List, Tuple

import numpy as np
import cv2

from services.schemas import Detection, BBox

logger = logging.getLogger(__name__)

# Minimum contour area as a fraction of the image
MIN_AREA_RATIO = 0.02

# Maximum aspect ratio (w/h or h/w) to accept as screen-like
MAX_ASPECT_RATIO = 8.0

# Minimum rectangularity for a contour to be considered
MIN_RECTANGULARITY = 0.55

# Maximum number of candidates to return
MAX_CANDIDATES = 5


def detect_rectangles(
    image_rgb: np.ndarray,
) -> List[Detection]:
    """
    Find rectangular structures in the image using edge detection
    and contour analysis. Returns candidates sorted by score.

    This is a fallback for when YOLO fails to detect screen-like
    objects (common for outdoor DOOH screens, billboards, LED panels).
    """
    h, w = image_rgb.shape[:2]
    img_area = h * w
    min_area = img_area * MIN_AREA_RATIO

    gray = cv2.cvtColor(image_rgb, cv2.COLOR_RGB2GRAY)

    # Multi-scale edge detection for robustness
    candidates: List[Tuple[float, BBox]] = []

    for blur_k in (5, 9, 15):
        blurred = cv2.GaussianBlur(gray, (blur_k, blur_k), 0)

        # Adaptive Canny thresholds from median
        median_val = float(np.median(blurred))
        low_t = int(max(0, 0.5 * median_val))
        high_t = int(min(255, 1.3 * median_val))
        edges = cv2.Canny(blurred, low_t, high_t)

        # Dilate to close small gaps in edges
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        edges = cv2.dilate(edges, kernel, iterations=1)

        contours, _ = cv2.findContours(
            edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < min_area:
                continue

            # Check if it approximates to a quadrilateral
            peri = cv2.arcLength(cnt, True)
            approx = cv2.approxPolyDP(cnt, 0.03 * peri, True)

            if len(approx) < 4 or len(approx) > 6:
                continue

            # Bounding rect-based rectangularity
            x, y, bw, bh = cv2.boundingRect(cnt)
            bb_area = bw * bh
            if bb_area == 0:
                continue

            rectangularity = area / bb_area
            if rectangularity < MIN_RECTANGULARITY:
                continue

            # Aspect ratio check
            aspect = max(bw, bh) / max(min(bw, bh), 1)
            if aspect > MAX_ASPECT_RATIO:
                continue

            # Score: area × rectangularity (prefer large, clean rectangles)
            score = (area / img_area) * rectangularity

            bbox = BBox(
                x1=float(x), y1=float(y),
                x2=float(x + bw), y2=float(y + bh),
            )
            candidates.append((score, bbox))

    # Deduplicate overlapping candidates (keep highest-scoring)
    candidates.sort(key=lambda c: c[0], reverse=True)
    filtered = _nms_bboxes(candidates, iou_threshold=0.5)

    detections = []
    for score, bbox in filtered[:MAX_CANDIDATES]:
        detections.append(Detection(
            bbox=bbox,
            confidence=min(score * 2.0, 0.9),  # scale to 0-0.9 range
            class_name="geometric_rect",
            rank_score=score,
        ))

    logger.info("Geometric fallback found %d rectangular candidates", len(detections))
    return detections


def _nms_bboxes(
    candidates: List[Tuple[float, BBox]],
    iou_threshold: float,
) -> List[Tuple[float, BBox]]:
    """Simple non-max suppression by IoU."""
    kept: List[Tuple[float, BBox]] = []
    for score, bbox in candidates:
        suppress = False
        for _, kept_bbox in kept:
            if _iou(bbox, kept_bbox) > iou_threshold:
                suppress = True
                break
        if not suppress:
            kept.append((score, bbox))
    return kept


def _iou(a: BBox, b: BBox) -> float:
    """Compute Intersection-over-Union of two bboxes."""
    xi1 = max(a.x1, b.x1)
    yi1 = max(a.y1, b.y1)
    xi2 = min(a.x2, b.x2)
    yi2 = min(a.y2, b.y2)
    inter = max(0, xi2 - xi1) * max(0, yi2 - yi1)
    union = a.area + b.area - inter
    return inter / union if union > 0 else 0.0
