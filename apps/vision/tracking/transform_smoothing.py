"""
Transform parameter decomposition and temporal smoothing.

Decomposes homographies into 8 meaningful geometric parameters via
QR decomposition of the affine part, then applies independent temporal
smoothing to each channel:

    [θ, scale_x, scale_y, shear, tx, ty, perspective_x, perspective_y]

This avoids artefacts caused by directly smoothing raw matrix elements
(e.g. rotation sign-flips, non-uniform scale oscillation).
"""

from __future__ import annotations

import numpy as np
from scipy.signal import savgol_filter


# ---------------------------------------------------------------------------
# Decomposition / Recomposition
# ---------------------------------------------------------------------------

def decompose_homography(H: np.ndarray) -> np.ndarray:
    """
    Decompose a 3×3 homography into 8 geometric parameters.

    H (normalised so H[2,2] == 1):

        [a  b  tx]
        [c  d  ty]
        [px py  1]

    The upper-left 2×2 block is factored via QR:

        [[a,b],[c,d]] = Q · R

        Q → rotation angle θ
        R → upper-triangular: scale_x, shear, scale_y

    Returns  [θ, scale_x, scale_y, shear, tx, ty, px, py]  (float64)
    """
    Hn = H / H[2, 2]

    tx, ty = Hn[0, 2], Hn[1, 2]
    px, py = Hn[2, 0], Hn[2, 1]

    A = Hn[:2, :2].astype(np.float64)
    Q, R = np.linalg.qr(A)

    # Ensure a proper rotation (det > 0, no reflection)
    if np.linalg.det(Q) < 0:
        Q[:, 1] *= -1
        R[1, :] *= -1

    theta = np.arctan2(Q[1, 0], Q[0, 0])
    sx = R[0, 0]
    sy = R[1, 1]
    shear = R[0, 1]

    return np.array(
        [theta, sx, sy, shear, tx, ty, px, py], dtype=np.float64,
    )


def recompose_homography(params: np.ndarray) -> np.ndarray:
    """Reconstruct 3×3 homography from 8 geometric parameters."""
    theta, sx, sy, shear, tx, ty, px, py = params

    cos_t, sin_t = np.cos(theta), np.sin(theta)
    Q = np.array([[cos_t, -sin_t],
                  [sin_t,  cos_t]], dtype=np.float64)
    R = np.array([[sx, shear],
                  [0.0, sy]], dtype=np.float64)
    A = Q @ R

    return np.array([
        [A[0, 0], A[0, 1], tx],
        [A[1, 0], A[1, 1], ty],
        [px,      py,      1.0],
    ], dtype=np.float64)


# ---------------------------------------------------------------------------
# Temporal smoothing
# ---------------------------------------------------------------------------

def smooth_transforms(
    homographies: list[np.ndarray | None],
    method: str = "savgol",
    window_length: int = 11,
    polyorder: int = 3,
    ema_alpha: float = 0.6,
) -> list[np.ndarray | None]:
    """
    Temporally smooth a sequence of homographies.

    method
        'savgol'  – Savitzky-Golay filter  (best quality, default)
        'ema'     – Exponential Moving Average
        'hybrid'  – EMA followed by a Savitzky-Golay polish pass
    """
    total = len(homographies)
    valid_indices = [i for i, H in enumerate(homographies) if H is not None]

    if len(valid_indices) < 4:
        return list(homographies)

    # --- Decompose into 8-channel parameter matrix ---
    params = np.zeros((len(valid_indices), 8), dtype=np.float64)
    for idx, vi in enumerate(valid_indices):
        params[idx] = decompose_homography(homographies[vi])

    # Unwrap rotation angles to prevent 2π discontinuities
    params[:, 0] = np.unwrap(params[:, 0])

    # --- Apply chosen smoothing strategy ---
    if method == "ema":
        smoothed = _ema_smooth(params, ema_alpha)
    elif method == "hybrid":
        smoothed = _ema_smooth(params, ema_alpha)
        smoothed = _savgol_smooth(smoothed, window_length, polyorder)
    else:  # savgol
        smoothed = _savgol_smooth(params, window_length, polyorder)

    # --- Recompose ---
    result: list[np.ndarray | None] = [None] * total
    for idx, vi in enumerate(valid_indices):
        result[vi] = recompose_homography(smoothed[idx])

    return result


# ---------------------------------------------------------------------------
# Internal smoothing helpers
# ---------------------------------------------------------------------------

def _savgol_smooth(
    params: np.ndarray,
    window_length: int,
    polyorder: int,
) -> np.ndarray:
    wl = min(window_length, len(params))
    if wl % 2 == 0:
        wl -= 1
    if wl < polyorder + 2:
        return params.copy()

    smoothed = np.zeros_like(params)
    for col in range(params.shape[1]):
        smoothed[:, col] = savgol_filter(params[:, col], wl, polyorder)
    return smoothed


def _ema_smooth(params: np.ndarray, alpha: float) -> np.ndarray:
    smoothed = np.zeros_like(params)
    smoothed[0] = params[0]
    for i in range(1, len(params)):
        smoothed[i] = alpha * params[i] + (1.0 - alpha) * smoothed[i - 1]
    return smoothed
