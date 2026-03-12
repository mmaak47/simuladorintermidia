"""
Robust homography estimation via RANSAC.

Computes per-frame homographies from dense grid correspondences
(frame points → canonical positions), including confidence metrics
and per-point reprojection error.
"""

from __future__ import annotations

import cv2
import numpy as np


def estimate_homography_ransac(
    frame_pts: np.ndarray,
    canonical_pts: np.ndarray,
    threshold: float = 2.0,
) -> tuple[np.ndarray | None, np.ndarray, float, float]:
    """
    Single-frame RANSAC homography estimation.

    Returns
        H             3×3 float64 homography (or None)
        inlier_mask   (N,) bool array
        inlier_ratio  float [0..1]
        reproj_error  mean reprojection error in pixels
    """
    if len(frame_pts) < 4:
        return None, np.zeros(0, dtype=bool), 0.0, float("inf")

    H, mask = cv2.findHomography(
        frame_pts.reshape(-1, 1, 2),
        canonical_pts.reshape(-1, 1, 2),
        cv2.RANSAC,
        threshold,
    )

    if H is None or mask is None:
        return None, np.zeros(len(frame_pts), dtype=bool), 0.0, float("inf")

    inlier_mask = mask.flatten().astype(bool)
    inlier_ratio = float(inlier_mask.sum()) / len(inlier_mask)
    reproj_err = compute_reprojection_error(
        H, frame_pts[inlier_mask], canonical_pts[inlier_mask],
    )

    return H.astype(np.float64), inlier_mask, inlier_ratio, reproj_err


def compute_reprojection_error(
    H: np.ndarray,
    src_pts: np.ndarray,
    dst_pts: np.ndarray,
) -> float:
    """Mean reprojection error (px) after applying H to src_pts."""
    mapped = cv2.perspectiveTransform(
        src_pts.reshape(-1, 1, 2).astype(np.float64), H,
    ).reshape(-1, 2)
    errors = np.linalg.norm(mapped - dst_pts.reshape(-1, 2), axis=1)
    return float(errors.mean())


def estimate_sequence_homographies(
    tracking_data: list,
    corners_per_frame: list,
    canonical_size: tuple[int, int],
    ransac_threshold: float = 2.0,
) -> tuple[list[np.ndarray | None], list[float], list[float]]:
    """
    Estimate per-frame homographies (frame→canonical) from tracking data.

    Falls back to the 4-corner getPerspectiveTransform when grid
    tracking is unavailable or confidence is too low.

    Returns
        homographies    list of 3×3 float64 (or None)
        confidences     list of float [0..1]
        reproj_errors   list of float (mean px error, inf where unavailable)
    """
    total = len(corners_per_frame)
    cw, ch = canonical_size
    canonical_rect = np.array(
        [[0, 0], [cw, 0], [cw, ch], [0, ch]], dtype=np.float32,
    )

    homographies: list[np.ndarray | None] = [None] * total
    confidences: list[float] = [0.0] * total
    reproj_errors: list[float] = [float("inf")] * total

    for i in range(total):
        corners = corners_per_frame[i]
        if corners is None:
            continue

        td = tracking_data[i] if i < len(tracking_data) else None

        if (
            td is not None
            and td.frame_pts is not None
            and td.canonical_pts is not None
            and len(td.frame_pts) >= 8
        ):
            H, inlier_mask, inlier_ratio, reproj = estimate_homography_ransac(
                td.frame_pts, td.canonical_pts, ransac_threshold,
            )
            if H is not None and inlier_ratio > 0.3:
                homographies[i] = H
                confidences[i] = inlier_ratio
                reproj_errors[i] = reproj
                td.inlier_mask = inlier_mask
                continue

        # Fallback: 4-corner homography
        H = cv2.getPerspectiveTransform(
            corners.astype(np.float32), canonical_rect,
        )
        homographies[i] = H.astype(np.float64)
        confidences[i] = 0.5

    return homographies, confidences, reproj_errors
