"""
Candidate ranking for YOLO detections.

Scoring formula:
  score = confidence * 0.5
        + normalized_area * 0.3
        + centrality_score * 0.1
        + aspect_ratio_score * 0.1

Prefers large, centered, vertically-oriented screen regions.
"""

import math
from typing import List

from services.schemas import Detection, BBox


def rank_candidates(
    detections: List[Detection],
    image_width: int,
    image_height: int,
) -> List[Detection]:
    """
    Score and sort detections by descending rank_score.
    Returns the same list, mutated with updated rank_score fields.
    """
    image_area = image_width * image_height
    cx_img = image_width / 2.0
    cy_img = image_height / 2.0
    max_dist = math.hypot(cx_img, cy_img)

    for det in detections:
        bbox = det.bbox

        # 1. Confidence component (0–1)
        conf = min(max(det.confidence, 0.0), 1.0)

        # 2. Normalised area (0–1): prefer large detections
        norm_area = min(bbox.area / image_area, 1.0) if image_area > 0 else 0.0

        # 3. Centrality (0–1): how close to image center
        bcx, bcy = bbox.center
        dist = math.hypot(bcx - cx_img, bcy - cy_img)
        centrality = 1.0 - min(dist / max_dist, 1.0) if max_dist > 0 else 0.5

        # 4. Aspect ratio score (0–1): prefer vertical (portrait) screens
        w, h = bbox.width, bbox.height
        if w > 0 and h > 0:
            ratio = h / w  # >1 = portrait
            # Best score when ratio ∈ [1.2, 3.0]; still okay when ~1
            if ratio >= 1.2:
                aspect_score = min(ratio / 3.0, 1.0)
            else:
                # landscape still gets partial credit
                aspect_score = max(ratio / 1.2, 0.0) * 0.6
        else:
            aspect_score = 0.0

        det.rank_score = (
            conf * 0.50
            + norm_area * 0.30
            + centrality * 0.10
            + aspect_score * 0.10
        )

    detections.sort(key=lambda d: d.rank_score, reverse=True)
    return detections
