"""
Video tracking router — track screen corners across video frames
using optical flow with periodic SAM re-detection.
"""

import json
import uuid
import tempfile
import numpy as np
import cv2
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

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


@router.post("/track-screen", response_model=TrackingResult)
async def track_screen(
    file: UploadFile = File(...),
    initial_corners: str = Form(...),
):
    """
    Track screen corners through a video using optical flow.
    Re-detects with SAM periodically.
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

    # Save uploaded video to temp file
    suffix = Path(file.filename or "video.mp4").suffix
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir="uploads") as tmp:
        contents = await file.read()
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = track_corners_in_video(tmp_path, initial)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tracking failed: {e}")

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
