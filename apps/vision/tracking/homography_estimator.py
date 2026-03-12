"""
RANSAC homography estimation from dense planar grid tracking.

For each frame, computes the homography mapping frame-space tracked
grid points to their known canonical-space positions.  RANSAC rejects
outliers automatically, yielding a robust per-frame transform.

Includes decomposition into 8 normalised parameters for temporal
smoothing (Savitzky-Golay or exponential moving average).
"""

from __future__ import annotations

import cv2
import numpy as np
from scipy.signal import savgol_filter


def estimate_homographies_from_grid(
    tracking_data: list,
    corners_per_frame: list[np.ndarray | None],
    canonical_size: tuple[int, int],
    ransac_threshold: float = 2.0,
) -> tuple[list[np.ndarray | None], list[float]]:
    """
    Compute per-frame homography (frame → canonical) from dense grid
    correspondences.

    Uses RANSAC on the grid point matches where available, falling back
    to the 4-corner getPerspectiveTransform.

    Returns
        homographies  list of 3×3 float64 matrices (or None)
        confidences   list of float [0..1]
    """
    total = len(corners_per_frame)
    cw, ch = canonical_size
    canonical_rect = np.array(
        [[0, 0], [cw, 0], [cw, ch], [0, ch]], dtype=np.float32,
    )

    homographies: list[np.ndarray | None] = [None] * total
    confidences: list[float] = [0.0] * total

    for i in range(total):
        corners = corners_per_frame[i]
        if corners is None:
            continue

        td = tracking_data[i] if i < len(tracking_data) else None

        if (
            td is not None
            and td.frame_pts is not None
            and td.canonical_pts is not None
            and len(td.frame_pts) >= 8
        ):
            H, mask = cv2.findHomography(
                td.frame_pts.reshape(-1, 1, 2),
                td.canonical_pts.reshape(-1, 1, 2),
                cv2.RANSAC,
                ransac_threshold,
            )
            if H is not None and mask is not None:
                inlier_ratio = float(mask.sum()) / len(mask)
                if inlier_ratio > 0.3:
                    homographies[i] = H.astype(np.float64)
                    confidences[i] = inlier_ratio
                    td.inlier_mask = mask.flatten().astype(bool)
                    continue

        # Fallback: 4-corner homography
        H = cv2.getPerspectiveTransform(
            corners.astype(np.float32), canonical_rect,
        )
        homographies[i] = H.astype(np.float64)
        confidences[i] = 0.5  # lower confidence for corner-only

    return homographies, confidences


# ── Decompose / Recompose ───────────────────────────────────────────

def decompose_homography(H: np.ndarray) -> np.ndarray:
    """
    Normalise H so H[2,2]=1, return the 8 remaining elements as a flat
    array: [h00, h01, h02, h10, h11, h12, h20, h21].

    Perfect roundtrip with recompose_homography.
    """
    Hn = H / H[2, 2]
    return np.array([
        Hn[0, 0], Hn[0, 1], Hn[0, 2],
        Hn[1, 0], Hn[1, 1], Hn[1, 2],
        Hn[2, 0], Hn[2, 1],
    ], dtype=np.float64)


def recompose_homography(params: np.ndarray) -> np.ndarray:
    """Reconstruct a 3×3 homography from 8 normalised elements."""
    return np.array([
        [params[0], params[1], params[2]],
        [params[3], params[4], params[5]],
        [params[6], params[7], 1.0],
    ], dtype=np.float64)


# ── Temporal smoothing ──────────────────────────────────────────────

def smooth_homography_params(
    homographies: list[np.ndarray | None],
    window_length: int = 11,
    polyorder: int = 3,
    ema_alpha: float = 0.0,
) -> list[np.ndarray | None]:
    """
    Smooth homography parameters over time.

    Two strategies (selected by ema_alpha):

      ema_alpha > 0  →  Exponential Moving Average
                         H_smooth = α·H_curr + (1−α)·H_prev
      ema_alpha == 0 →  Savitzky-Golay filter (default, better quality)

    Both operate on the 8-element decomposed representation to avoid
    the instability of directly averaging 3×3 matrices.
    """
    total = len(homographies)
    valid_indices = [i for i, H in enumerate(homographies) if H is not None]

    if len(valid_indices) < 4:
        return homographies

    # Decompose all valid homographies
    param_matrix = np.zeros((len(valid_indices), 8), dtype=np.float64)
    for idx, vi in enumerate(valid_indices):
        param_matrix[idx] = decompose_homography(homographies[vi])

    if ema_alpha > 0:
        # ── EMA smoothing ────────────────────────────────────────
        smoothed = np.zeros_like(param_matrix)
        smoothed[0] = param_matrix[0]
        for j in range(1, len(param_matrix)):
            smoothed[j] = (
                ema_alpha * param_matrix[j]
                + (1.0 - ema_alpha) * smoothed[j - 1]
            )
    else:
        # ── Savitzky-Golay smoothing ─────────────────────────────
        wl = min(window_length, len(valid_indices))
        if wl % 2 == 0:
            wl -= 1
        if wl < polyorder + 2:
            return homographies

        smoothed = np.zeros_like(param_matrix)
        for col in range(8):
            smoothed[:, col] = savgol_filter(
                param_matrix[:, col], wl, polyorder,
            )

    # Recompose
    result: list[np.ndarray | None] = [None] * total
    for idx, vi in enumerate(valid_indices):
        result[vi] = recompose_homography(smoothed[idx])

    return result
