"""
Step 4 — Homography smoothing.

Computes the perspective transform (homography) for each frame, then
temporally smooths the 3×3 matrix elements so that the warp doesn't
flicker between frames.
"""

import cv2
import numpy as np


def compute_homography_sequence(
    corners_per_frame: list[np.ndarray | None],
    creative_w: int,
    creative_h: int,
) -> list[np.ndarray | None]:
    """
    Compute a homography matrix for each frame mapping from the creative
    rect to the destination quad.

    Returns list of 3×3 float64 matrices (or None where corners are None).
    """
    src_pts = np.array([
        [0, 0],
        [creative_w, 0],
        [creative_w, creative_h],
        [0, creative_h],
    ], dtype=np.float32)

    result: list[np.ndarray | None] = []
    for corners in corners_per_frame:
        if corners is None:
            result.append(None)
        else:
            H = cv2.getPerspectiveTransform(src_pts, corners.astype(np.float32))
            result.append(H)
    return result


def smooth_homographies(
    homographies: list[np.ndarray | None],
    alpha: float = 0.2,
) -> list[np.ndarray | None]:
    """
    Temporally smooth homography matrices using exponential moving average.

    H_smooth[t] = alpha * H[t] + (1 - alpha) * H_smooth[t-1]

    alpha: blending weight for current frame.
        Lower = smoother but more latent.  0.2 is good for 30fps.

    Forward-backward pass is used to avoid directional lag.
    """
    total = len(homographies)
    if total == 0:
        return homographies

    # Forward pass
    forward: list[np.ndarray | None] = [None] * total
    prev: np.ndarray | None = None
    for i in range(total):
        H = homographies[i]
        if H is None:
            forward[i] = prev  # carry last valid
            continue
        if prev is None:
            forward[i] = H.copy()
        else:
            forward[i] = alpha * H + (1.0 - alpha) * prev
        prev = forward[i]

    # Backward pass
    backward: list[np.ndarray | None] = [None] * total
    prev = None
    for i in range(total - 1, -1, -1):
        H = homographies[i]
        if H is None:
            backward[i] = prev
            continue
        if prev is None:
            backward[i] = H.copy()
        else:
            backward[i] = alpha * H + (1.0 - alpha) * prev
        prev = backward[i]

    # Average forward and backward for zero-lag result
    result: list[np.ndarray | None] = [None] * total
    for i in range(total):
        f = forward[i]
        b = backward[i]
        if f is not None and b is not None:
            result[i] = (f + b) / 2.0
        elif f is not None:
            result[i] = f
        elif b is not None:
            result[i] = b

    return result
