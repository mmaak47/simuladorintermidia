"""
Canonical-space compositor.

Composites the creative content onto a stabilized canonical screen
canvas.  All blending, fit-mode, glass/reflection, bloom, and soft-glow
effects are applied in this stable coordinate space — free from any
camera motion or perspective jitter.
"""

import cv2
import numpy as np

from services.compositor import compute_fit_crop


def composite_in_canonical(
    canonical_bg: np.ndarray,
    creative_frame: np.ndarray,
    canonical_size: tuple[int, int],
    fit_mode: str = "cover",
    glass_reflectivity: float = 0.08,
    screen_nits: float = 700.0,
    bloom_strength: float = 0.05,
    softness: float = 0.0,
) -> np.ndarray:
    """
    Composite the creative onto the canonical screen canvas.

    canonical_bg: the video's screen region warped to canonical space
        (used for colour/exposure reference — can be None for clean comp).
    creative_frame: the creative image/video frame (original res).
    canonical_size: (width, height) of the canonical canvas.

    Returns the composited canonical-space frame (BGR, uint8).
    """
    cw, ch = canonical_size
    h_cr, w_cr = creative_frame.shape[:2]

    # Fit creative to canonical aspect
    cx, cy, crop_w, crop_h = compute_fit_crop(
        w_cr, h_cr, float(cw), float(ch), fit_mode
    )
    cropped = creative_frame[cy:cy + crop_h, cx:cx + crop_w]

    # Resize creative to fill the canonical canvas exactly
    canvas = cv2.resize(cropped, (cw, ch), interpolation=cv2.INTER_LANCZOS4)

    # --- Display realism effects (all in stable canonical space) ---

    canvas_f = canvas.astype(np.float32)

    # Brightness / nits simulation
    nits_scale = screen_nits / 700.0
    if abs(nits_scale - 1.0) > 0.05:
        canvas_f *= nits_scale

    # Subtle light bloom (glow around bright areas)
    if bloom_strength > 0.005:
        bright = np.clip(canvas_f - 180, 0, 255)
        bloom = cv2.GaussianBlur(bright, (0, 0), sigmaX=ch * 0.03)
        canvas_f += bloom * bloom_strength

    # Glass reflection gradient (top-to-bottom)
    if glass_reflectivity > 0.01:
        gradient = np.linspace(
            glass_reflectivity * 0.4, 0.0, ch, dtype=np.float32
        )
        glass = np.zeros((ch, cw, 3), dtype=np.float32)
        glass[:, :, :] = (gradient[:, np.newaxis, np.newaxis] * 255)
        canvas_f += glass

    # Subtle screen softness (very mild blur to simulate display pixel diffusion)
    if softness > 0.01:
        sigma = softness * min(cw, ch) * 0.002
        if sigma > 0.3:
            canvas_f = cv2.GaussianBlur(canvas_f, (0, 0), sigmaX=sigma)

    return canvas_f.clip(0, 255).astype(np.uint8)
