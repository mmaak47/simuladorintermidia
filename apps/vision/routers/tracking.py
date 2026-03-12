"""
Video tracking router — track screen corners across video frames
using optical flow with periodic hybrid re-detection.
"""

import json
import uuid
import tempfile
import numpy as np
import cv2
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.tracking_service import track_corners_in_video

router = APIRouter()


class Point2D(BaseModel):
    x: float
    y: float


class TrackingFrame(BaseModel):
    frameIndex: int
    corners: list[Point2D]
    confidence: float


class TrackingResult(BaseModel):
    fps: float
    totalFrames: int
    frames: list[TrackingFrame]


def _save_upload(file_bytes: bytes, suffix: str) -> str:
    """Save uploaded bytes to a temp file and return the path."""
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=str(upload_dir)) as tmp:
        tmp.write(file_bytes)
        return tmp.name


def _build_tracking_result(result: dict) -> TrackingResult:
    """Convert the service dict to the response model."""
    return TrackingResult(
        fps=result["fps"],
        totalFrames=result["totalFrames"],
        frames=[
            TrackingFrame(
                frameIndex=f["frameIndex"],
                corners=[Point2D(x=float(c[0]), y=float(c[1])) for c in f["corners"]],
                confidence=f["confidence"],
            )
            for f in result["frames"]
        ],
    )


@router.post("/track-screen", response_model=TrackingResult)
async def track_screen(
    file: UploadFile = File(...),
    initial_corners: str = Form(...),
):
    """
    Track screen corners through a video using optical flow.
    Re-detects with the hybrid pipeline periodically.
    """
    try:
        corners_data = json.loads(initial_corners)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in initial_corners")

    if len(corners_data) != 4:
        raise HTTPException(status_code=400, detail="Exactly 4 corners required")

    initial = np.array(
        [[c["x"], c["y"]] for c in corners_data],
        dtype=np.float32,
    )

    contents = await file.read()
    suffix = Path(file.filename or "video.mp4").suffix
    tmp_path = _save_upload(contents, suffix)

    try:
        result = track_corners_in_video(tmp_path, initial)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tracking failed: {e}")

    return _build_tracking_result(result)


@router.post("/detect-and-track", response_model=TrackingResult)
async def detect_and_track(
    file: UploadFile = File(...),
    redetect_interval: Optional[int] = Form(60),
):
    """
    Combined endpoint: detects the screen on frame 0 using the hybrid
    pipeline (YOLO → SAM → OpenCV), then tracks corners through the
    entire video with periodic re-detection.

    Accepts a single video upload — no need to separately detect first.
    """
    from services.detector_yolo import detect_screens
    from services.detector_geometric import detect_rectangles
    from services.segment_sam import segment_screen_in_crop
    from services.contour_corners import extract_corners
    from services.schemas import BBox, Detection

    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    suffix = Path(file.filename or "video.mp4").suffix
    tmp_path = _save_upload(contents, suffix)

    # ── Extract frame 0 for initial detection ─────────────────
    cap = cv2.VideoCapture(tmp_path)
    if not cap.isOpened():
        raise HTTPException(status_code=400, detail="Could not open video file")

    ret, first_frame = cap.read()
    cap.release()

    if not ret or first_frame is None:
        raise HTTPException(status_code=400, detail="Could not read first frame from video")

    frame_rgb = cv2.cvtColor(first_frame, cv2.COLOR_BGR2RGB)
    img_h, img_w = frame_rgb.shape[:2]

    # ── Hybrid detection on frame 0 ──────────────────────────
    try:
        candidates = detect_screens(frame_rgb)
    except Exception:
        candidates = []

    # Geometric fallback when YOLO finds no screen-like detections
    if not candidates:
        try:
            candidates = detect_rectangles(frame_rgb)
        except Exception:
            candidates = []

    if not candidates:
        candidates = [
            Detection(
                bbox=BBox(x1=0, y1=0, x2=float(img_w), y2=float(img_h)),
                confidence=0.15,
                class_name="fallback_fullimage",
                rank_score=0.15,
            )
        ]

    best = candidates[0]
    bbox = best.bbox
    x1 = max(int(bbox.x1), 0)
    y1 = max(int(bbox.y1), 0)
    x2 = min(int(bbox.x2), img_w)
    y2 = min(int(bbox.y2), img_h)

    if (x2 - x1) < 20 or (y2 - y1) < 20:
        raise HTTPException(status_code=422, detail="Detected screen region too small")

    try:
        mask_full, _conf, _url = segment_screen_in_crop(
            full_image_rgb=frame_rgb,
            crop_x1=x1, crop_y1=y1, crop_x2=x2, crop_y2=y2,
            padding=0.10,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SAM segmentation failed: {e}")

    mask_uint8 = (mask_full.astype(np.uint8)) * 255

    try:
        contour_result = extract_corners(mask_uint8, reject_nested=True)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=f"Corner extraction failed: {e}")

    initial_corners = np.array(
        [[p.x, p.y] for p in contour_result.corners], dtype=np.float32,
    )

    # ── Track through entire video ───────────────────────────
    try:
        result = track_corners_in_video(
            tmp_path, initial_corners, redetect_interval=redetect_interval or 60,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tracking failed: {e}")

    return _build_tracking_result(result)
