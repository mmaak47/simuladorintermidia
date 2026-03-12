"""
Creative content fitting for screen replacement.

Maps arbitrarily-sized creative material onto the canonical screen
canvas with correct aspect ratio, supporting two industry-standard
fit modes:

    cover   — fill entire screen, centre-crop any excess
    contain — fit inside screen, letterbox remaining area
"""

from __future__ import annotations

import cv2
import numpy as np


def fit_creative_to_screen(
    creative: np.ndarray,
    canonical_size: tuple[int, int],
    fit_mode: str = "cover",
) -> np.ndarray:
    """
    Fit creative content to canonical screen dimensions.

    Parameters
        creative       BGR uint8 image or frame
        canonical_size (width, height) of the canonical screen canvas
        fit_mode       'cover' | 'contain'

    Returns BGR uint8 image at canonical_size resolution.
    """
    cw, ch = canonical_size
    h_cr, w_cr = creative.shape[:2]

    screen_aspect = cw / ch
    creative_aspect = w_cr / h_cr

    if fit_mode == "contain":
        canvas = np.zeros((ch, cw, 3), dtype=np.uint8)
        if creative_aspect > screen_aspect:
            # Wider than screen → fit to width, letterbox top/bottom
            fit_w = cw
            fit_h = int(cw / creative_aspect)
            resized = cv2.resize(
                creative, (fit_w, fit_h), interpolation=cv2.INTER_LANCZOS4,
            )
            y_off = (ch - fit_h) // 2
            canvas[y_off : y_off + fit_h, :] = resized
        else:
            # Taller than screen → fit to height, pillarbox left/right
            fit_h = ch
            fit_w = int(ch * creative_aspect)
            resized = cv2.resize(
                creative, (fit_w, fit_h), interpolation=cv2.INTER_LANCZOS4,
            )
            x_off = (cw - fit_w) // 2
            canvas[:, x_off : x_off + fit_w] = resized
        return canvas

    # cover (default) — fill screen, crop excess
    if creative_aspect > screen_aspect:
        # Wider → crop sides
        new_w = int(h_cr * screen_aspect)
        x = (w_cr - new_w) // 2
        cropped = creative[:, x : x + new_w]
    else:
        # Taller → crop top/bottom
        new_h = int(w_cr / screen_aspect)
        y = (h_cr - new_h) // 2
        cropped = creative[y : y + new_h, :]

    return cv2.resize(cropped, (cw, ch), interpolation=cv2.INTER_LANCZOS4)
