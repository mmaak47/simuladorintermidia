"""
Attention heatmap router.

Generates a saliency-like heatmap for uploaded creative images and returns
an estimated visibility score with top attention zones.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

router = APIRouter()

MASKS_DIR = Path("masks")
MASKS_DIR.mkdir(parents=True, exist_ok=True)


class AttentionZone(BaseModel):
    x: int
    y: int
    width: int
    height: int
    score: float


class AttentionHeatmapResult(BaseModel):
    heatmapUrl: str
    visibilityScore: float
    zones: List[AttentionZone]


def _read_upload_as_bgr(file: UploadFile) -> np.ndarray:
    raw = file.file.read()
    arr = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file")
    return img


def _build_saliency_map(img_bgr: np.ndarray) -> np.ndarray:
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    gray_f = gray.astype(np.float32) / 255.0

    # Edge/contrast saliency
    lap = cv2.Laplacian(gray_f, cv2.CV_32F, ksize=3)
    lap = np.abs(lap)

    # Color saliency by saturation (brand elements tend to be high saturation)
    hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV).astype(np.float32)
    sat = hsv[:, :, 1] / 255.0

    saliency = (lap * 0.7) + (sat * 0.3)
    saliency = cv2.GaussianBlur(saliency, (0, 0), sigmaX=3.0, sigmaY=3.0)
    saliency = cv2.normalize(saliency, None, 0, 255, cv2.NORM_MINMAX)

    return saliency.astype(np.uint8)


def _top_zones(saliency_u8: np.ndarray, grid: int = 3) -> List[AttentionZone]:
    h, w = saliency_u8.shape
    zones: List[AttentionZone] = []

    cell_w = max(1, w // grid)
    cell_h = max(1, h // grid)

    for row in range(grid):
        for col in range(grid):
          x0 = col * cell_w
          y0 = row * cell_h
          x1 = w if col == grid - 1 else (col + 1) * cell_w
          y1 = h if row == grid - 1 else (row + 1) * cell_h

          cell = saliency_u8[y0:y1, x0:x1]
          score = float(cell.mean()) / 255.0
          zones.append(AttentionZone(
              x=x0,
              y=y0,
              width=max(1, x1 - x0),
              height=max(1, y1 - y0),
              score=round(score, 4),
          ))

    zones.sort(key=lambda z: z.score, reverse=True)
    return zones[:3]


@router.post("/attention-heatmap", response_model=AttentionHeatmapResult)
async def attention_heatmap(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image uploads are supported")

    img = _read_upload_as_bgr(file)
    saliency = _build_saliency_map(img)

    visibility_score = round(float(saliency.mean()) / 255.0 * 100.0, 2)
    zones = _top_zones(saliency)

    heat = cv2.applyColorMap(saliency, cv2.COLORMAP_JET)
    overlay = cv2.addWeighted(img, 0.2, heat, 0.8, 0)

    stamp = datetime.utcnow().strftime("%Y%m%d%H%M%S%f")
    out_name = f"attention_{stamp}.png"
    out_path = MASKS_DIR / out_name
    cv2.imwrite(str(out_path), overlay)

    return AttentionHeatmapResult(
        heatmapUrl=f"/files/masks/{out_name}",
        visibilityScore=visibility_score,
        zones=zones,
    )
