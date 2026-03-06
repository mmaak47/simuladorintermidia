"""
SAM-based screen segmentation + OpenCV contour → 4-corner extraction.
"""

import json
import uuid
import numpy as np
import cv2
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel

from services.sam_service import get_sam_predictor, predict_mask
from services.contour_service import mask_to_corners

router = APIRouter()


class Point2D(BaseModel):
    x: float
    y: float


class SegmentationResult(BaseModel):
    maskUrl: str
    corners: list[Point2D]
    confidence: float
    maskBounds: dict


@router.post("/segment-screen", response_model=SegmentationResult)
async def segment_screen(
    file: UploadFile = File(...),
    positive_points: str = Form("[]"),
    negative_points: str = Form("[]"),
):
    """
    Detect a screen/display in an uploaded image using SAM + OpenCV.

    - file: image (JPEG/PNG)
    - positive_points: JSON array of {x, y} clicks on the screen
    - negative_points: JSON array of {x, y} clicks outside the screen
    """
    # Parse points
    try:
        pos_pts = json.loads(positive_points)
        neg_pts = json.loads(negative_points)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON in points")

    # Read image
    contents = await file.read()
    nparr = np.frombuffer(contents, np.uint8)
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Could not decode image")

    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    h, w = image.shape[:2]

    # Build point arrays for SAM
    point_coords = []
    point_labels = []

    for pt in pos_pts:
        point_coords.append([pt["x"], pt["y"]])
        point_labels.append(1)

    for pt in neg_pts:
        point_coords.append([pt["x"], pt["y"]])
        point_labels.append(0)

    # If no points provided, use center of image as positive click
    if len(point_coords) == 0:
        point_coords.append([w / 2, h / 2])
        point_labels.append(1)

    point_coords_np = np.array(point_coords, dtype=np.float32)
    point_labels_np = np.array(point_labels, dtype=np.int32)

    # Run SAM prediction
    mask, confidence = predict_mask(image_rgb, point_coords_np, point_labels_np)

    # Save mask as PNG
    mask_id = str(uuid.uuid4())
    mask_path = Path("masks") / f"{mask_id}.png"
    mask_uint8 = (mask * 255).astype(np.uint8)
    cv2.imwrite(str(mask_path), mask_uint8)

    # Extract 4 corners from mask
    corners = mask_to_corners(mask_uint8)

    # Compute mask bounding box
    ys, xs = np.where(mask > 0)
    if len(xs) == 0:
        raise HTTPException(status_code=422, detail="No screen detected in mask")

    mask_bounds = {
        "x": int(xs.min()),
        "y": int(ys.min()),
        "width": int(xs.max() - xs.min()),
        "height": int(ys.max() - ys.min()),
    }

    return SegmentationResult(
        maskUrl=f"/files/masks/{mask_id}.png",
        corners=[Point2D(x=float(c[0]), y=float(c[1])) for c in corners],
        confidence=float(confidence),
        maskBounds=mask_bounds,
    )
