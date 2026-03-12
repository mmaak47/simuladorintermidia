"""
Light bloom / glow effect.

Extracts pixels above a brightness threshold and adds a soft Gaussian
halo to simulate lens bloom from high-luminance areas on the display.
"""

from __future__ import annotations

import cv2
import numpy as np


def apply_bloom(
    frame: np.ndarray,
    strength: float = 0.03,
    threshold: int = 200,
) -> np.ndarray:
    """
    Apply light bloom from bright areas.

    strength:  glow intensity multiplier.
    threshold: brightness level above which bloom is generated.
    """
    if strength < 0.005:
        return frame

    f = frame if frame.dtype == np.float32 else frame.astype(np.float32)
    h = f.shape[0]

    bright = np.clip(f - threshold, 0, 255)
    sigma = h * 0.02
    bloom = cv2.GaussianBlur(bright, (0, 0), sigmaX=sigma)

    result = np.clip(f + bloom * strength, 0, 255)
    return result.astype(frame.dtype)
