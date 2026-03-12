"""
SAM segmentation service — crop-aware refinement.

Runs SAM within the YOLO/geometric-detected crop region, using:
  - A box prompt covering the (unpadded) bbox region for strong guidance
  - 1 positive point at crop center
  - 4 negative points near crop borders (background / frame edges)

Chooses the best mask by area, rectangularity, and coverage of the crop.
"""

import logging
import uuid
from pathlib import Path
from typing import Tuple, Optional, List

import numpy as np
import cv2

logger = logging.getLogger(__name__)

# ── SAM predictor singleton ──────────────────────────────────
from services.sam_service import get_sam_predictor

# Minimum mask coverage relative to crop area to be accepted
MIN_MASK_COVERAGE = 0.10

# Penalty threshold for nested rectangles
NESTED_PENALTY_THRESHOLD = 0.45


def segment_screen_in_crop(
    full_image_rgb: np.ndarray,
    crop_x1: int,
    crop_y1: int,
    crop_x2: int,
    crop_y2: int,
    padding: float = 0.10,
) -> Tuple[np.ndarray, float, str]:
    """
    Run SAM inside a padded crop of the full image.

    Uses box prompts (strong) + point prompts (refinement) for accurate
    screen segmentation. The box prompt covers the original (unpadded)
    YOLO/geometric bbox, giving SAM a clear spatial hint.

    Returns:
        (mask_fullsize, confidence, mask_url)
    """
    img_h, img_w = full_image_rgb.shape[:2]

    # ── Padded crop ───────────────────────────────────────────
    bw = crop_x2 - crop_x1
    bh = crop_y2 - crop_y1
    pad_x = int(bw * padding)
    pad_y = int(bh * padding)

    cx1 = max(crop_x1 - pad_x, 0)
    cy1 = max(crop_y1 - pad_y, 0)
    cx2 = min(crop_x2 + pad_x, img_w)
    cy2 = min(crop_y2 + pad_y, img_h)

    crop = full_image_rgb[cy1:cy2, cx1:cx2].copy()
    ch, cw = crop.shape[:2]

    if ch < 10 or cw < 10:
        raise ValueError("Crop region too small for SAM segmentation")

    # ── Build box prompt (original bbox in crop coords) ───────
    # This tells SAM "the screen is approximately in this box"
    box_in_crop = np.array([
        crop_x1 - cx1,   # x1
        crop_y1 - cy1,   # y1
        crop_x2 - cx1,   # x2
        crop_y2 - cy1,   # y2
    ], dtype=np.float32)

    # ── Build point prompts ───────────────────────────────────
    center_x = (crop_x1 + crop_x2) / 2.0 - cx1
    center_y = (crop_y1 + crop_y2) / 2.0 - cy1

    margin_x = cw * 0.05
    margin_y = ch * 0.05

    point_coords = np.array([
        [center_x, center_y],                  # positive: screen center
        [margin_x, margin_y],                  # negative: top-left corner
        [cw - margin_x, margin_y],             # negative: top-right corner
        [cw - margin_x, ch - margin_y],        # negative: bottom-right corner
        [margin_x, ch - margin_y],             # negative: bottom-left corner
    ], dtype=np.float32)

    point_labels = np.array([1, 0, 0, 0, 0], dtype=np.int32)

    # ── Run SAM with box + point prompts ──────────────────────
    predictor = get_sam_predictor()
    predictor.set_image(crop)

    masks, scores, _ = predictor.predict(
        point_coords=point_coords,
        point_labels=point_labels,
        box=box_in_crop[None, :],  # SAM expects shape (1, 4)
        multimask_output=True,
    )

    # ── Pick best mask ────────────────────────────────────────
    crop_area = cw * ch
    best_idx = _select_best_mask(masks, scores, crop_area)
    best_mask_crop = masks[best_idx]   # bool, shape (ch, cw)
    best_score = float(scores[best_idx])

    # ── Project mask back to full-image coordinates ───────────
    mask_full = np.zeros((img_h, img_w), dtype=bool)
    mask_full[cy1:cy2, cx1:cx2] = best_mask_crop

    # ── Save mask PNG ─────────────────────────────────────────
    mask_id = str(uuid.uuid4())
    mask_path = Path("masks") / f"{mask_id}.png"
    mask_uint8 = (mask_full.astype(np.uint8)) * 255
    cv2.imwrite(str(mask_path), mask_uint8)
    mask_url = f"/files/masks/{mask_id}.png"

    return mask_full, best_score, mask_url


def _select_best_mask(
    masks: np.ndarray,
    scores: np.ndarray,
    crop_area: int,
) -> int:
    """
    Choose the best mask from SAM's multi-mask output.

    Criteria (weighted):
      - SAM confidence score
      - Mask area (prefer larger → more likely the outer frame)
      - Rectangularity (how close to a filled rectangle)
      - Coverage of crop area (penalise tiny inner rectangles)
    """
    best_idx = 0
    best_composite = -1.0

    for i, mask in enumerate(masks):
        area = float(mask.sum())
        if area < 1:
            continue

        # Rectangularity: area / bounding-rect area
        ys, xs = np.where(mask)
        bb_area = float((xs.max() - xs.min() + 1) * (ys.max() - ys.min() + 1))
        rectangularity = area / bb_area if bb_area > 0 else 0.0

        # Coverage: fraction of crop area
        coverage = area / crop_area if crop_area > 0 else 0.0

        # Nested-rectangle penalty
        coverage_penalty = 1.0
        if coverage < NESTED_PENALTY_THRESHOLD:
            coverage_penalty = coverage / NESTED_PENALTY_THRESHOLD

        composite = (
            float(scores[i]) * 0.30
            + min(coverage, 1.0) * 0.35
            + rectangularity * 0.15
            + coverage_penalty * 0.20
        )

        if composite > best_composite:
            best_composite = composite
            best_idx = i

    return best_idx
