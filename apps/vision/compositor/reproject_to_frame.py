"""
Reproject canonical-space composite back into the original video frame.

Takes the composited canonical screen, warps it into the video frame's
perspective, and blends it with the original frame using edge feathering
for seamless integration.
"""

import cv2
import numpy as np

from tracking.stabilize_plane import warp_from_canonical


def reproject_and_blend(
    original_frame: np.ndarray,
    canonical_composite: np.ndarray,
    H_from_canon: np.ndarray,
    supersample: int = 1,
    edge_feather: int = 3,
) -> np.ndarray:
    """
    Reproject the canonical composite into the original video frame and
    blend it in.

    supersample: render at higher internal resolution then downsample
        for subpixel quality.
    edge_feather: pixel radius for alpha feathering at the edges of the
        reprojected region, preventing hard seams.

    Returns the final composited video frame (BGR, uint8).
    """
    h_frame, w_frame = original_frame.shape[:2]
    output_size = (w_frame, h_frame)

    if supersample > 1:
        # Upscale canonical composite
        ch, cw = canonical_composite.shape[:2]
        hi_res = cv2.resize(
            canonical_composite,
            (cw * supersample, ch * supersample),
            interpolation=cv2.INTER_LANCZOS4,
        )

        # Scale the H_from_canon to map from the upscaled canonical space
        S_inv = np.array([
            [1.0 / supersample, 0, 0],
            [0, 1.0 / supersample, 0],
            [0, 0, 1],
        ], dtype=np.float64)
        H_hi = H_from_canon @ S_inv

        # Warp at higher precision then the downsampling happens
        # through the warp itself
        warped = cv2.warpPerspective(
            hi_res, H_hi, output_size,
            flags=cv2.INTER_LANCZOS4,
            borderMode=cv2.BORDER_CONSTANT,
            borderValue=(0, 0, 0),
        )
        # Build mask from canonical corners at hi-res
        canon_corners = np.array([
            [[0, 0]], [[cw * supersample, 0]],
            [[cw * supersample, ch * supersample]], [[0, ch * supersample]]
        ], dtype=np.float32)
        frame_corners = cv2.perspectiveTransform(canon_corners, H_hi)
        mask = np.zeros((h_frame, w_frame), dtype=np.uint8)
        cv2.fillConvexPoly(
            mask, frame_corners.astype(np.int32).reshape(-1, 2), 255
        )
    else:
        warped, mask = warp_from_canonical(
            canonical_composite, H_from_canon, output_size
        )

    # Edge feathering: blur the mask edges for a smoother blend
    if edge_feather > 0:
        k = edge_feather * 2 + 1
        mask = cv2.GaussianBlur(mask, (k, k), 0)

    # Alpha blend
    alpha = mask.astype(np.float32) / 255.0
    alpha_3c = alpha[:, :, np.newaxis]

    result = (
        warped.astype(np.float32) * alpha_3c
        + original_frame.astype(np.float32) * (1.0 - alpha_3c)
    )

    return result.clip(0, 255).astype(np.uint8)
