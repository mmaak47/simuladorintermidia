"""
Film grain generator.

Perceptually calibrated noise using a seeded RNG for temporal coherence
(consistent grain pattern per frame, no flickering).
"""

from __future__ import annotations

import numpy as np


def apply_film_grain(
    frame: np.ndarray,
    strength: float = 0.04,
    seed: int = 0,
) -> np.ndarray:
    """
    Apply subtle film grain noise.

    strength: 0.0 = none, 0.04 = subtle cinematic, 0.10 = visible.
    seed:     per-frame seed for temporal consistency.
    """
    if strength < 0.005:
        return frame

    f = frame if frame.dtype == np.float32 else frame.astype(np.float32)
    rng = np.random.RandomState(seed)
    noise = rng.normal(0, strength * 25, f.shape).astype(np.float32)
    return np.clip(f + noise, 0, 255).astype(np.uint8 if frame.dtype == np.uint8 else np.float32)
