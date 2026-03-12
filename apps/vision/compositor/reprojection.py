"""
Reproject canonical composite back into the original video frame.

Supports high-resolution internal processing (supersample) and
Gaussian edge-feathering for seamless blending against the
original background.
"""

from __future__ import annotations

import cv2
import numpy as np

from compositor.blending import feather_mask, alpha_blend


def reproject_to_frame(
    original_frame: np.ndarray,
    canonical_composite: np.ndarray,
    H_from_canon: np.ndarray,
    supersample: int = 2,
    edge_feather: int = 3,
) -> np.ndarray:
    """
    Warp the canonical composite into original-frame space and alpha-blend
    it onto the background.

    Parameters
        original_frame       BGR uint8 background
        canonical_composite  BGR uint8 finished creative in canonical space
        H_from_canon         3×3 homography  canonical → frame
        supersample          render at Nx then downsample for subpixel quality
        edge_feather         Gaussian radius for mask edge softening
    """
    h_frame, w_frame = original_frame.shape[:2]
    output_size = (w_frame, h_frame)
    ch, cw = canonical_composite.shape[:2]

    if supersample > 1:
        hi_w, hi_h = cw * supersample, ch * supersample
        hi_res = cv2.resize(
            canonical_composite, (hi_w, hi_h),
            interpolation=cv2.INTER_LANCZOS4,
        )
        S_inv = np.diag([1.0 / supersample, 1.0 / supersample, 1.0])
        H_hi = H_from_canon @ S_inv

        warped = cv2.warpPerspective(
            hi_res, H_hi, output_size,
            flags=cv2.INTER_LANCZOS4,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0),
        )

        ss_corners = np.array(
            [[[0, 0]], [[hi_w, 0]], [[hi_w, hi_h]], [[0, hi_h]]],
            dtype=np.float32,
        )
        frame_corners = cv2.perspectiveTransform(ss_corners, H_hi)
        mask = np.zeros((h_frame, w_frame), dtype=np.uint8)
        cv2.fillConvexPoly(
            mask,
            frame_corners.astype(np.int32).reshape(-1, 2),
            255,
        )
    else:
        from compositor.canonical_space import warp_from_canonical_space
        warped, mask = warp_from_canonical_space(
            canonical_composite, H_from_canon, output_size,
        )

    if edge_feather > 0:
        mask = feather_mask(mask, edge_feather)

    return alpha_blend(warped, original_frame, mask)
