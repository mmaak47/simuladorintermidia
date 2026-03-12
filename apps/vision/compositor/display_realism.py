"""
Display realism engine.

Simulates the physical appearance of a real digital display (DOOH panel,
LED billboard, LCD monitor) by layering seven physically-motivated effects
in canonical (stabilised) screen space:

    1. Brightness / nits scaling
    2. Gamma / highlight shaping
    3. Bloom glow from bright pixel areas
    4. LCD / LED pixel-diffusion softness
    5. Subpixel micro-texture  (optional, cinematic only)
    6. Glass / ambient reflection gradient
    7. Viewing-angle brightness fall-off  (optional)

Two quality modes:
    'preview'   — lighter processing for real-time UI preview
    'cinematic' — full quality for final export
"""

from __future__ import annotations

import cv2
import numpy as np


def apply_display_realism(
    canvas: np.ndarray,
    mode: str = "cinematic",
    screen_nits: float = 700.0,
    gamma: float = 1.0,
    bloom_strength: float = 0.04,
    led_softness: float = 0.3,
    glass_reflectivity: float = 0.06,
    subpixel_texture: bool = False,
    viewing_angle_falloff: float = 0.0,
) -> np.ndarray:
    """
    Apply layered display-realism simulation to a canonical canvas.

    All manipulations happen in float32 and are clamped to [0, 255]
    before returning uint8.
    """
    f = canvas.astype(np.float32)
    ch, cw = f.shape[:2]

    # --- 1. Brightness / nits scaling ---
    nits_factor = screen_nits / 700.0
    if abs(nits_factor - 1.0) > 0.02:
        f *= nits_factor

    # --- 2. Gamma / highlight shaping ---
    if abs(gamma - 1.0) > 0.01:
        f = np.clip(f, 0, 255)
        f = 255.0 * np.power(f / 255.0, gamma)

    # Soft highlight roll-off above 230
    bright = f > 230
    if bright.any():
        excess = f[bright] - 230
        f[bright] = 230 + excess * 0.4

    # --- 3. Bloom from bright areas ---
    if bloom_strength > 0.005:
        bright_part = np.clip(f - 180, 0, 255)
        sigma = ch * (0.025 if mode == "cinematic" else 0.015)
        bloom = cv2.GaussianBlur(bright_part, (0, 0), sigmaX=sigma)
        f += bloom * bloom_strength

    # --- 4. LCD / LED pixel-diffusion ---
    if led_softness > 0.01:
        sigma = led_softness * min(cw, ch) * 0.002
        if sigma > 0.3:
            f = cv2.GaussianBlur(f, (0, 0), sigmaX=sigma)

    # --- 5. Subpixel micro-texture (cinematic only) ---
    if subpixel_texture and mode == "cinematic":
        rng = np.random.RandomState(0)
        texture = rng.normal(0, 1.5, f.shape).astype(np.float32)
        f += texture

    # --- 6. Glass / ambient reflection gradient ---
    if glass_reflectivity > 0.01:
        gradient = np.linspace(
            glass_reflectivity * 0.4, 0.0, ch, dtype=np.float32,
        )
        glass = np.zeros_like(f)
        glass[:, :, :] = gradient[:, np.newaxis, np.newaxis] * 255
        f += glass

    # --- 7. Viewing-angle brightness fall-off ---
    if viewing_angle_falloff > 0.01:
        _, X = np.ogrid[:ch, :cw]
        center_x = cw / 2
        dist = np.abs(X - center_x) / (cw / 2)
        falloff = 1.0 - viewing_angle_falloff * 0.1 * dist ** 2
        f *= falloff[..., np.newaxis]

    return np.clip(f, 0, 255).astype(np.uint8)
