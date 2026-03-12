"""
Hollywood / After Effects style cinematic finishing.

Applies subtle professional post-processing in seven ordered layers:

    1. Highlight roll-off / compression
    2. Light bloom
    3. Chromatic aberration  (optional)
    4. Unsharp-mask sharpening  (optional)
    5. Vignette
    6. Film grain
"""

from __future__ import annotations

import cv2
import numpy as np

from post.bloom import apply_bloom
from post.grain import apply_film_grain


def apply_cinematic_finish(
    frame: np.ndarray,
    vignette: float = 0.15,
    grain_strength: float = 0.04,
    bloom_strength: float = 0.03,
    bloom_threshold: int = 200,
    chromatic_aberration: float = 0.0,
    sharpening: float = 0.0,
    highlight_compression: float = 0.3,
    frame_idx: int = 0,
) -> np.ndarray:
    """Apply layered cinematic finishing effects to a composited frame."""
    f = frame.astype(np.float32)
    h, w = f.shape[:2]

    # 1. Highlight roll-off / compression
    if highlight_compression > 0.01:
        bright = f > 220
        if bright.any():
            excess = f[bright] - 220
            f[bright] = 220 + excess * (1.0 - highlight_compression)

    # 2. Bloom
    if bloom_strength > 0.005:
        f = apply_bloom(f, bloom_strength, bloom_threshold).astype(np.float32)

    # 3. Chromatic aberration
    if chromatic_aberration > 0.1:
        f = _apply_chromatic_aberration(f, chromatic_aberration)

    # 4. Subtle unsharp-mask sharpening
    if sharpening > 0.01:
        blurred = cv2.GaussianBlur(f, (0, 0), sigmaX=1.0)
        f = f + sharpening * (f - blurred)

    # 5. Vignette
    if vignette > 0.01:
        Y, X = np.ogrid[:h, :w]
        cx, cy = w / 2, h / 2
        r = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        max_r = np.sqrt(cx ** 2 + cy ** 2)
        falloff = 1.0 - vignette * 0.6 * np.clip(
            (r / max_r - 0.35) / 0.65, 0, 1,
        )
        f *= falloff[..., np.newaxis]

    # 6. Film grain (last before final clamp)
    if grain_strength > 0.005:
        f = apply_film_grain(f, grain_strength, frame_idx).astype(np.float32)

    return np.clip(f, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------

def _apply_chromatic_aberration(
    frame: np.ndarray,
    strength: float,
) -> np.ndarray:
    """Subtle channel-offset chromatic aberration."""
    shift = max(1, int(strength))
    result = frame.copy()
    # Red channel → shift outward
    result[:, shift:, 2] = frame[:, :-shift, 2]
    # Blue channel → shift inward
    result[:, :-shift, 0] = frame[:, shift:, 0]
    return result
