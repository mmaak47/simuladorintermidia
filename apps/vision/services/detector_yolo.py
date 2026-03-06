"""
YOLO-based screen detector service.

Uses Ultralytics YOLOv8 to find candidate display / monitor /
screen bounding boxes in a full location image.

Model resolution:
  1. Custom model  – env YOLO_SCREEN_MODEL points to a .pt trained on
     screen/display/signage classes.
  2. Generic model – falls back to YOLOv8n which detects COCO classes.
     Screen-like classes (tv, monitor, laptop) are extracted and all
     other classes are ignored unless none are found, in which case the
     largest high-confidence box is returned.
"""

import os
import logging
from typing import List

import numpy as np

from services.schemas import Detection, BBox
from services.ranking import rank_candidates

logger = logging.getLogger(__name__)

# ── Model config ─────────────────────────────────────────────

CUSTOM_MODEL_PATH = os.environ.get("YOLO_SCREEN_MODEL", "")
GENERIC_MODEL_NAME = os.environ.get("YOLO_GENERIC_MODEL", "yolov8n.pt")

# COCO class names that might represent a display/screen
SCREEN_LIKE_CLASSES = {"tv", "monitor", "laptop", "cell phone"}

# Minimum confidence to consider at all
MIN_CONFIDENCE = 0.15

# ── Singleton loader ─────────────────────────────────────────

_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model

    from ultralytics import YOLO

    if CUSTOM_MODEL_PATH and os.path.isfile(CUSTOM_MODEL_PATH):
        logger.info("Loading custom YOLO screen model: %s", CUSTOM_MODEL_PATH)
        _model = YOLO(CUSTOM_MODEL_PATH)
    else:
        logger.info("Loading generic YOLO model: %s", GENERIC_MODEL_NAME)
        _model = YOLO(GENERIC_MODEL_NAME)

    return _model


# ── Public API ───────────────────────────────────────────────


def detect_screens(
    image_rgb: np.ndarray,
    conf_threshold: float = MIN_CONFIDENCE,
) -> List[Detection]:
    """
    Run YOLO inference and return ranked candidate detections.

    Args:
        image_rgb: H×W×3 uint8 RGB image.
        conf_threshold: minimum confidence to keep.

    Returns:
        List of Detection sorted by rank_score descending.
    """
    h, w = image_rgb.shape[:2]
    model = _load_model()

    results = model.predict(
        source=image_rgb,
        conf=conf_threshold,
        verbose=False,
    )

    detections: List[Detection] = []

    for result in results:
        boxes = result.boxes
        if boxes is None:
            continue
        for i in range(len(boxes)):
            xyxy = boxes.xyxy[i].cpu().numpy()
            conf = float(boxes.conf[i].cpu().numpy())
            cls_id = int(boxes.cls[i].cpu().numpy())
            cls_name = model.names.get(cls_id, str(cls_id))

            detections.append(Detection(
                bbox=BBox(
                    x1=float(xyxy[0]),
                    y1=float(xyxy[1]),
                    x2=float(xyxy[2]),
                    y2=float(xyxy[3]),
                ),
                confidence=conf,
                class_name=cls_name,
            ))

    # ── Filtering strategy ────────────────────────────────────
    # If custom model → trust all detections.
    # If generic model → prefer screen-like classes; fall back to all.
    is_custom = bool(CUSTOM_MODEL_PATH and os.path.isfile(CUSTOM_MODEL_PATH))

    if not is_custom:
        screen_dets = [d for d in detections if d.class_name.lower() in SCREEN_LIKE_CLASSES]
        if screen_dets:
            detections = screen_dets
        else:
            # No screen-like classes found — keep the top detections by area
            # (large rectangles are likely the screen frame we care about)
            detections.sort(key=lambda d: d.bbox.area, reverse=True)
            detections = detections[:5]

    # Rank
    detections = rank_candidates(detections, w, h)
    return detections
