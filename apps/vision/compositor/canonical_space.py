"""
Canonical screen-space utilities.

Warps video frames to and from a stabilised canonical screen canvas
at a fixed resolution (canonical_size).
"""

from __future__ import annotations

import cv2
import numpy as np


def warp_to_canonical_space(
    frame: np.ndarray,
    H_to_canon: np.ndarray,
    canonical_size: tuple[int, int],
    supersample: int = 1,
) -> np.ndarray:
    """
    Warp a video frame into canonical (stabilised) screen space.

    Parameters
        frame          BGR uint8 video frame
        H_to_canon     3×3 homography  frame → canonical
        canonical_size (width, height) of canonical canvas
        supersample    render at Nx internal resolution then downscale
    """
    cw, ch = canonical_size

    if supersample > 1:
        S = np.diag([float(supersample), float(supersample), 1.0])
        H_hi = S @ H_to_canon
        hi = cv2.warpPerspective(
            frame, H_hi,
            (cw * supersample, ch * supersample),
            flags=cv2.INTER_LANCZOS4,
        )
        return cv2.resize(hi, (cw, ch), interpolation=cv2.INTER_AREA)

    return cv2.warpPerspective(
        frame, H_to_canon, (cw, ch), flags=cv2.INTER_LINEAR,
    )


def warp_from_canonical_space(
    canonical_frame: np.ndarray,
    H_from_canon: np.ndarray,
    output_size: tuple[int, int],
) -> tuple[np.ndarray, np.ndarray]:
    """
    Warp canonical frame back to original video space.

    Returns
        warped  BGR uint8 image at output_size
        mask    uint8 [0..255] mask of the reprojected region
    """
    w_out, h_out = output_size

    warped = cv2.warpPerspective(
        canonical_frame, H_from_canon, (w_out, h_out),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0),
    )

    ch, cw = canonical_frame.shape[:2]
    canon_corners = np.array(
        [[[0, 0]], [[cw, 0]], [[cw, ch]], [[0, ch]]], dtype=np.float32,
    )
    frame_corners = cv2.perspectiveTransform(canon_corners, H_from_canon)

    mask = np.zeros((h_out, w_out), dtype=np.uint8)
    cv2.fillConvexPoly(
        mask,
        frame_corners.astype(np.int32).reshape(-1, 2),
        255,
    )

    return warped, mask
