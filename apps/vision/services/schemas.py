"""
Shared Pydantic schemas for the hybrid detection pipeline.
YOLO → SAM → OpenCV corner extraction.
"""

from pydantic import BaseModel
from typing import Optional


class Point2D(BaseModel):
    x: float
    y: float


class BBox(BaseModel):
    """Bounding box in absolute pixel coordinates."""
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return self.x2 - self.x1

    @property
    def height(self) -> float:
        return self.y2 - self.y1

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)


class Detection(BaseModel):
    """A single YOLO detection result."""
    bbox: BBox
    confidence: float
    class_name: str
    rank_score: float = 0.0


class ContourResult(BaseModel):
    """Result from OpenCV contour extraction."""
    corners: list[Point2D]
    contour_area: float
    rectangularity: float
    aspect_ratio: float


class HybridDetectionDebug(BaseModel):
    """Debug metadata returned alongside the detection result."""
    yolo_candidates: list[Detection]
    selected_bbox: BBox
    selected_crop_score: float
    mask_area_ratio: float
    rectangularity: float
    contour_area: float
    pipeline_stages: list[str]


class HybridDetectionResult(BaseModel):
    """Final result from the full YOLO → SAM → OpenCV pipeline."""
    bbox: BBox
    mask_url: str
    corners: list[Point2D]
    confidence: float
    debug: HybridDetectionDebug
