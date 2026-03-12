"""
Plane stabilization — canonical-space warp helpers and re-anchoring.

The homography estimator already produces H_to_canon for each frame
(mapping frame-space screen points → canonical rectangle).  This module
provides:

  - warp_to_canonical / warp_from_canonical  (perspective warp utils)
  - reanchor_homographies  (periodically snap back to keyframe reference
    to prevent long-term drift)
"""

from __future__ import annotations

import cv2
import numpy as np


def warp_to_canonical(
    frame: np.ndarray,
    H_to_canon: np.ndarray,
    canonical_size: tuple[int, int],
    supersample: int = 1,
) -> np.ndarray:
    """
    Warp a video frame into canonical screen space.

    supersample: if > 1, render at supersample× resolution then
    downsample for anti-aliasing.
    """
    cw, ch = canonical_size

    if supersample > 1:
        S = np.diag([float(supersample), float(supersample), 1.0])
        H_hi = S @ H_to_canon
        hi = cv2.warpPerspective(
            frame, H_hi, (cw * supersample, ch * supersample),
            flags=cv2.INTER_LANCZOS4,
        )
        return cv2.resize(hi, (cw, ch), interpolation=cv2.INTER_AREA)

    return cv2.warpPerspective(
        frame, H_to_canon, (cw, ch), flags=cv2.INTER_LINEAR,
    )


def warp_from_canonical(
    canonical_frame: np.ndarray,
    H_from_canon: np.ndarray,
    output_size: tuple[int, int],
) -> tuple[np.ndarray, np.ndarray]:
    """
    Reproject a canonical-space image back into the video frame.

    output_size: (width, height) of the video frame.

    Returns  (warped_image, mask_uint8).
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
    cv2.fillConvexPoly(mask, frame_corners.astype(np.int32).reshape(-1, 2), 255)

    return warped, mask


def reanchor_homographies(
    homographies: list[np.ndarray | None],
    confidences: list[float],
    keyframe_corners: list[dict],
    canonical_size: tuple[int, int],
    confidence_threshold: float = 0.4,
    reanchor_interval: int = 30,
) -> list[np.ndarray | None]:
    """
    Re-anchor homographies to prevent long-term tracking drift.

    At every reanchor_interval frames — or when confidence drops below
    threshold — blend back toward the nearest keyframe's 4-corner
    homography.  At exact keyframe frames, snap 100 % to the keyframe H.

    This mirrors professional tracker practice of "locking" the solve to
    known reference frames periodically.
    """
    cw, ch = canonical_size
    canonical_rect = np.array(
        [[0, 0], [cw, 0], [cw, ch], [0, ch]], dtype=np.float32,
    )

    kf_map: dict[int, np.ndarray] = {}
    for kc in keyframe_corners:
        idx = kc["frameIndex"]
        corners = np.array(
            [[c["x"], c["y"]] for c in kc["corners"]], dtype=np.float32,
        )
        kf_map[idx] = cv2.getPerspectiveTransform(corners, canonical_rect)

    kf_indices = sorted(kf_map.keys())
    if not kf_indices:
        return homographies

    def _nearest_kf_H(frame_idx: int) -> np.ndarray:
        best = min(kf_indices, key=lambda ki: abs(ki - frame_idx))
        return kf_map[best]

    result = [H.copy() if H is not None else None for H in homographies]

    for i in range(len(result)):
        if result[i] is None:
            continue

        # Exact keyframe → snap hard
        if i in kf_map:
            result[i] = kf_map[i].copy()
            continue

        needs_reanchor = (
            i % reanchor_interval == 0
            or (i < len(confidences) and confidences[i] < confidence_threshold)
        )
        if needs_reanchor:
            kf_H = _nearest_kf_H(i)
            result[i] = 0.7 * kf_H + 0.3 * result[i]
            result[i] /= result[i][2, 2]

    return result
