"""
Hybrid screen detection router.

POST /api/vision/detect-screen-hybrid

Pipeline:
  1. YOLO → candidate bounding boxes
  2. Rank & select best candidate
  3. SAM → refined mask inside selected crop
  4. OpenCV → 4 ordered corners
  5. Return result with debug metadata
"""

import logging
import numpy as np
import cv2

from fastapi import APIRouter, UploadFile, File, HTTPException

from services.schemas import (
    BBox,
    Detection,
    HybridDetectionResult,
    HybridDetectionDebug,
    Point2D,
)
from services.detector_yolo import detect_screens
from services.segment_sam import segment_screen_in_crop
from services.contour_corners import extract_corners

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/detect-screen-hybrid", response_model=HybridDetectionResult)
async def detect_screen_hybrid(
    file: UploadFile = File(...),
):
    """
    Full hybrid detection pipeline: YOLO → SAM → OpenCV corners.

    Accepts a single image upload and returns the detected screen quad,
    SAM mask, and debug metadata.
    """
    stages: list[str] = []

    # ── Read image ────────────────────────────────────────────
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image_bgr is None:
        raise HTTPException(status_code=400, detail="Could not decode image")

    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    img_h, img_w = image_rgb.shape[:2]
    stages.append("image_loaded")

    # ── Stage 1: YOLO detection ───────────────────────────────
    try:
        candidates = detect_screens(image_rgb)
    except Exception as e:
        logger.error("YOLO detection failed: %s", e)
        raise HTTPException(status_code=500, detail=f"YOLO detection failed: {e}")

    stages.append(f"yolo_detected_{len(candidates)}_candidates")

    if not candidates:
        # No YOLO detections → fallback: treat entire image as the screen region
        logger.warning("No YOLO detections — falling back to full-image crop")
        candidates = [
            Detection(
                bbox=BBox(x1=0, y1=0, x2=float(img_w), y2=float(img_h)),
                confidence=0.3,
                class_name="fallback_fullimage",
                rank_score=0.3,
            )
        ]
        stages.append("yolo_fallback_fullimage")

    # ── Stage 2: Select best candidate ────────────────────────
    best = candidates[0]
    bbox = best.bbox
    stages.append(f"selected_bbox_score_{best.rank_score:.3f}")

    # Clip bbox to image bounds
    x1 = max(int(bbox.x1), 0)
    y1 = max(int(bbox.y1), 0)
    x2 = min(int(bbox.x2), img_w)
    y2 = min(int(bbox.y2), img_h)

    if (x2 - x1) < 20 or (y2 - y1) < 20:
        raise HTTPException(
            status_code=422,
            detail="Selected bounding box is too small for segmentation",
        )

    # ── Stage 3: SAM refinement ───────────────────────────────
    try:
        mask_full, sam_confidence, mask_url = segment_screen_in_crop(
            full_image_rgb=image_rgb,
            crop_x1=x1,
            crop_y1=y1,
            crop_x2=x2,
            crop_y2=y2,
            padding=0.10,
        )
    except Exception as e:
        logger.error("SAM segmentation failed: %s", e)
        raise HTTPException(status_code=500, detail=f"SAM segmentation failed: {e}")

    stages.append(f"sam_mask_confidence_{sam_confidence:.3f}")

    # ── Stage 4: OpenCV corner extraction ─────────────────────
    mask_uint8 = (mask_full.astype(np.uint8)) * 255

    try:
        contour_result = extract_corners(mask_uint8, reject_nested=True)
    except ValueError as e:
        logger.error("Corner extraction failed: %s", e)
        raise HTTPException(
            status_code=422,
            detail=f"Could not extract screen corners: {e}",
        )

    stages.append("corners_extracted")

    # ── Compute debug metrics ─────────────────────────────────
    mask_pixels = int(mask_full.sum())
    bbox_area = (x2 - x1) * (y2 - y1)
    mask_area_ratio = mask_pixels / bbox_area if bbox_area > 0 else 0.0

    # Combined confidence: weighted average of YOLO rank + SAM score
    combined_confidence = best.rank_score * 0.4 + sam_confidence * 0.6

    debug = HybridDetectionDebug(
        yolo_candidates=candidates,
        selected_bbox=best.bbox,
        selected_crop_score=best.rank_score,
        mask_area_ratio=mask_area_ratio,
        rectangularity=contour_result.rectangularity,
        contour_area=contour_result.contour_area,
        pipeline_stages=stages,
    )

    return HybridDetectionResult(
        bbox=best.bbox,
        mask_url=mask_url,
        corners=contour_result.corners,
        confidence=combined_confidence,
        debug=debug,
    )
