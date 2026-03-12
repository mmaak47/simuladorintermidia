"""
Alpha blending and mask feathering utilities for compositing.
"""

from __future__ import annotations

import cv2
import numpy as np


def feather_mask(mask: np.ndarray, radius: int = 3) -> np.ndarray:
    """Soften mask edges with Gaussian blur for seamless integration."""
    if radius <= 0:
        return mask
    k = radius * 2 + 1
    return cv2.GaussianBlur(mask, (k, k), 0)


def alpha_blend(
    foreground: np.ndarray,
    background: np.ndarray,
    mask: np.ndarray,
) -> np.ndarray:
    """
    Alpha blend foreground onto background using mask.

    mask: uint8 [0..255]  —  255 = full foreground, 0 = full background.
    """
    alpha = mask.astype(np.float32) / 255.0
    alpha_3c = alpha[:, :, np.newaxis]

    result = (
        foreground.astype(np.float32) * alpha_3c
        + background.astype(np.float32) * (1.0 - alpha_3c)
    )
    return np.clip(result, 0, 255).astype(np.uint8)
