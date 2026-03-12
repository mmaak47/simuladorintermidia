"""
Motion-vector-aligned motion blur.

Computes the per-frame screen motion direction from the homography
delta, then applies a directional blur kernel aligned to that motion.
This hides residual micro-jitter without making the image generically
soft.
"""

import cv2
import numpy as np


def _homography_translation_delta(
    H_prev: np.ndarray | None,
    H_curr: np.ndarray | None,
) -> tuple[float, float]:
    """
    Estimate the frame-to-frame translation of the screen center
    from two homographies (frame→canonical).

    Returns (dx, dy) in canonical-space pixels.
    """
    if H_prev is None or H_curr is None:
        return 0.0, 0.0

    try:
        # Compute relative homography: H_curr @ inv(H_prev)
        H_rel = H_curr @ np.linalg.inv(H_prev)
        H_rel /= H_rel[2, 2]
        dx = H_rel[0, 2]
        dy = H_rel[1, 2]
        return float(dx), float(dy)
    except np.linalg.LinAlgError:
        return 0.0, 0.0


def _make_directional_kernel(
    dx: float,
    dy: float,
    max_size: int = 15,
) -> np.ndarray:
    """
    Create a 1D motion-blur kernel oriented along (dx, dy).
    """
    magnitude = np.sqrt(dx * dx + dy * dy)
    if magnitude < 0.5:
        # No significant motion — identity kernel
        k = np.zeros((1, 1), dtype=np.float32)
        k[0, 0] = 1.0
        return k

    # Clamp kernel size
    ksize = min(int(magnitude + 0.5), max_size)
    if ksize < 1:
        ksize = 1
    if ksize % 2 == 0:
        ksize += 1

    # Build a 1D kernel along the motion direction
    kernel = np.zeros((ksize, ksize), dtype=np.float32)
    cx, cy = ksize // 2, ksize // 2

    angle = np.arctan2(dy, dx)
    cos_a = np.cos(angle)
    sin_a = np.sin(angle)

    for i in range(ksize):
        offset = i - ksize // 2
        x = int(round(cx + offset * cos_a))
        y = int(round(cy + offset * sin_a))
        if 0 <= x < ksize and 0 <= y < ksize:
            kernel[y, x] = 1.0

    total = kernel.sum()
    if total > 0:
        kernel /= total

    return kernel


def apply_directional_motion_blur(
    frame: np.ndarray,
    H_prev: np.ndarray | None,
    H_curr: np.ndarray | None,
    strength: float = 0.5,
    max_kernel: int = 11,
) -> np.ndarray:
    """
    Apply subtle motion blur aligned to the screen's motion direction.

    strength: 0.0 = no blur, 1.0 = full motion-aligned blur.
        Values around 0.3-0.5 are usually enough to hide jitter.
    max_kernel: maximum blur kernel size in pixels.

    The blur is blended with the original frame using strength as alpha.
    """
    dx, dy = _homography_translation_delta(H_prev, H_curr)

    # Scale motion vector by strength
    dx *= strength
    dy *= strength

    magnitude = np.sqrt(dx * dx + dy * dy)
    if magnitude < 0.3:
        return frame

    kernel = _make_directional_kernel(dx, dy, max_kernel)
    blurred = cv2.filter2D(frame, -1, kernel)

    # Blend: use strength to mix original and blurred
    alpha = min(strength, 0.6)  # cap to prevent over-blur
    result = cv2.addWeighted(
        frame, 1.0 - alpha,
        blurred, alpha,
        0,
    )
    return result
