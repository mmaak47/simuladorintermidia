"""
Hybrid screen detection router.

POST /api/vision/detect-screen-hybrid

Pipeline:
  1. YOLO → screen-like candidate bounding boxes
  2. If YOLO finds nothing → Geometric fallback (edge + contour rectangles)
  3. Rank & select best candidate
  4. SAM → refined mask inside selected crop (box + point prompts)
  5. OpenCV → 4 ordered corners
  6. Return result with debug metadata
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
from services.detector_geometric import detect_rectangles
from services.segment_sam import segment_screen_in_crop
from services.contour_corners import extract_corners

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/detect-screen-hybrid", response_model=HybridDetectionResult)
async def detect_screen_hybrid(
    file: UploadFile = File(...),
):
    """
    Full hybrid detection pipeline: YOLO → Geometric → SAM → OpenCV corners.

    Accepts a single image upload and returns the detected screen quad,
    SAM mask, and debug metadata.
    """
    stages: list[str] = []

    # ── Read image ────────────────────────────────────────────
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    nparr = np.frombuffer(contents, np.uint8)
    image_bgr = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image_bgr is None:
        ct = file.content_type or "unknown"
        raise HTTPException(
            status_code=400,
            detail=(
                f"Could not decode image (content_type={ct}, "
                f"size={len(contents)} bytes). "
                "Only JPEG/PNG/WebP image formats are supported. "
                "If the source is a video, extract a frame first."
            ),
        )

    image_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
    img_h, img_w = image_rgb.shape[:2]
    stages.append("image_loaded")

    # ── Stage 1: YOLO detection ───────────────────────────────
    try:
        candidates = detect_screens(image_rgb)
    except Exception as e:
        logger.error("YOLO detection failed: %s", e)
        candidates = []
        stages.append("yolo_error")

    stages.append(f"yolo_detected_{len(candidates)}_screen_candidates")

    # ── Stage 2: Geometric fallback if YOLO found nothing ─────
    detection_source = "yolo"
    if not candidates:
        logger.info("No YOLO screen detections — trying geometric rectangle fallback")
        try:
            candidates = detect_rectangles(image_rgb)
        except Exception as e:
            logger.error("Geometric detection failed: %s", e)
            candidates = []

        if candidates:
            detection_source = "geometric"
            stages.append(f"geometric_detected_{len(candidates)}_candidates")
        else:
            # Last resort: use the full image, but log a warning
            logger.warning("Both YOLO and geometric detection failed — using full image")
            candidates = [
                Detection(
                    bbox=BBox(x1=0, y1=0, x2=float(img_w), y2=float(img_h)),
                    confidence=0.15,
                    class_name="fallback_fullimage",
                    rank_score=0.15,
                )
            ]
            detection_source = "fallback"
            stages.append("fallback_fullimage")

    # ── Stage 3: Select best candidate ────────────────────────
    best = candidates[0]
    bbox = best.bbox
    stages.append(f"selected_{detection_source}_score_{best.rank_score:.3f}")

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

    # ── Stage 4: SAM refinement (box + point prompts) ─────────
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

    # ── Stage 5: OpenCV corner extraction ─────────────────────
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

    # Combined confidence: weighted by detection source reliability
    if detection_source == "yolo":
        combined_confidence = best.rank_score * 0.4 + sam_confidence * 0.6
    elif detection_source == "geometric":
        combined_confidence = best.rank_score * 0.3 + sam_confidence * 0.7
    else:
        combined_confidence = sam_confidence * 0.5  # low trust for full-image fallback

    debug = HybridDetectionDebug(
        yolo_candidates=candidates if detection_source == "yolo" else [],
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
