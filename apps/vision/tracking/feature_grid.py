"""
Dense planar feature grid generation.

Generates a regular NxN grid in canonical screen space and projects it
into video frame coordinates.  Optionally supplements with
cv2.goodFeaturesToTrack for texture-rich regions.
"""

from __future__ import annotations

import cv2
import numpy as np


def generate_planar_grid(
    canonical_size: tuple[int, int],
    grid_size: int = 20,
    margin_frac: float = 0.03,
) -> np.ndarray:
    """
    Generate a dense NxN regular grid in canonical screen space.

    canonical_size: (width, height) of the canonical canvas.
    grid_size:      points per axis (20 → 20×20 = 400 points).
    margin_frac:    fractional inset from each edge (0.03 = 3 %).

    Returns (grid_size*grid_size, 2) float32 array.
    """
    cw, ch = canonical_size
    mx, my = cw * margin_frac, ch * margin_frac

    xs = np.linspace(mx, cw - mx, grid_size, dtype=np.float32)
    ys = np.linspace(my, ch - my, grid_size, dtype=np.float32)

    gx, gy = np.meshgrid(xs, ys)
    return np.stack([gx.ravel(), gy.ravel()], axis=-1).astype(np.float32)


def supplement_with_features(
    gray: np.ndarray,
    mask: np.ndarray,
    max_extra: int = 100,
    quality_level: float = 0.01,
    min_distance: int = 7,
) -> np.ndarray:
    """
    Detect extra Shi-Tomasi features inside the screen mask.

    Returns (N, 2) float32 array (may be empty).
    """
    pts = cv2.goodFeaturesToTrack(
        gray,
        maxCorners=max_extra,
        qualityLevel=quality_level,
        minDistance=min_distance,
        mask=mask,
        blockSize=7,
    )
    if pts is None:
        return np.empty((0, 2), dtype=np.float32)
    return pts.reshape(-1, 2).astype(np.float32)


def project_grid_to_frame(
    canonical_pts: np.ndarray,
    H_canon_to_frame: np.ndarray,
) -> np.ndarray:
    """Project canonical-space points into frame coordinates via H."""
    pts = canonical_pts.reshape(-1, 1, 2).astype(np.float32)
    mapped = cv2.perspectiveTransform(pts, H_canon_to_frame.astype(np.float64))
    return mapped.reshape(-1, 2).astype(np.float32)


def filter_in_bounds(
    pts: np.ndarray,
    frame_shape: tuple[int, ...],
    margin: int = 5,
) -> np.ndarray:
    """Boolean mask — True for points inside the frame with margin."""
    h, w = frame_shape[:2]
    return (
        (pts[:, 0] >= margin) & (pts[:, 0] < w - margin)
        & (pts[:, 1] >= margin) & (pts[:, 1] < h - margin)
    )
