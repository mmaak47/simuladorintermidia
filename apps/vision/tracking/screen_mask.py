"""
Screen plane initialization and mask creation.

Provides utilities to:
  - Create a binary mask from the screen polygon
  - Shrink the polygon inward for tracking robustness
  - Initialize tracking state from corners
"""

from __future__ import annotations

import cv2
import numpy as np


def initialize_screen_plane(
    corners: np.ndarray,
    frame_shape: tuple[int, ...],
    margin: int = 10,
) -> dict:
    """
    Initialize the screen plane from 4 corners.

    Returns dict with:
        corners        (4,2) float32 screen corners
        mask           binary mask of the screen region (eroded by margin)
        center         (x, y) centroid
        size_estimate  (width, height) of the screen in pixels
    """
    corners = corners.astype(np.float32)
    mask = get_screen_mask(corners, frame_shape, margin)
    center = corners.mean(axis=0)

    tl, tr, br, bl = corners
    w = float((np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2)
    h = float((np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2)

    return {
        "corners": corners,
        "mask": mask,
        "center": center.tolist(),
        "size_estimate": (w, h),
    }


def get_screen_mask(
    corners: np.ndarray,
    frame_shape: tuple[int, ...],
    margin: int = 0,
) -> np.ndarray:
    """
    Create a binary uint8 mask filling the screen polygon.

    margin > 0 erodes the mask inward for safety.
    """
    mask = np.zeros(frame_shape[:2], dtype=np.uint8)
    pts = corners.astype(np.int32).reshape(-1, 2)
    cv2.fillConvexPoly(mask, pts, 255)

    if margin > 0:
        kernel = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (margin * 2 + 1, margin * 2 + 1),
        )
        mask = cv2.erode(mask, kernel)

    return mask
