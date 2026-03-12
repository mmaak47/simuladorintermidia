"""
Debug visualization overlays for the planar grid tracking pipeline.

Renders:
  - Dense grid feature points (green = inlier, red = outlier)
  - Optical flow vectors (yellow lines)
  - Screen quad outline
  - RANSAC inlier/outlier ratio display
  - Homography confidence bar
  - Drift warning banner
  - Canonical stabilized screen preview (PiP)
  - Homography stability metric
"""

from __future__ import annotations

import cv2
import numpy as np


def draw_grid_features(
    frame: np.ndarray,
    frame_pts: np.ndarray | None,
    prev_pts: np.ndarray | None = None,
    inlier_mask: np.ndarray | None = None,
) -> np.ndarray:
    """
    Draw dense grid feature points and optical flow vectors.

    Green  = inlier (accepted by RANSAC)
    Red    = outlier (rejected by RANSAC)
    Yellow = optical flow motion vectors
    """
    vis = frame.copy()
    if frame_pts is None or len(frame_pts) == 0:
        return vis

    pts = frame_pts.reshape(-1, 2)
    for i, pt in enumerate(pts):
        x, y = int(pt[0]), int(pt[1])
        is_inlier = True
        if inlier_mask is not None and i < len(inlier_mask):
            is_inlier = bool(inlier_mask[i])

        color = (0, 255, 0) if is_inlier else (0, 0, 255)
        cv2.circle(vis, (x, y), 2, color, -1, cv2.LINE_AA)

        # Optical flow vector
        if prev_pts is not None and i < len(prev_pts.reshape(-1, 2)):
            px, py = prev_pts.reshape(-1, 2)[i]
            cv2.line(
                vis, (int(px), int(py)), (x, y),
                (0, 255, 255), 1, cv2.LINE_AA,
            )

    return vis


def draw_screen_quad(
    frame: np.ndarray,
    corners: np.ndarray | None,
    color: tuple[int, int, int] = (0, 255, 0),
    thickness: int = 2,
) -> np.ndarray:
    """Draw the screen quad outline."""
    vis = frame.copy()
    if corners is None:
        return vis
    pts = corners.astype(np.int32).reshape(-1, 2)
    for i in range(4):
        cv2.line(vis, tuple(pts[i]), tuple(pts[(i + 1) % 4]),
                 color, thickness, cv2.LINE_AA)
    return vis


def draw_confidence_bar(
    frame: np.ndarray,
    confidence: float,
    position: tuple[int, int] = (10, 30),
    bar_width: int = 200,
    bar_height: int = 20,
) -> np.ndarray:
    """Draw a colour-coded confidence meter."""
    vis = frame.copy()
    x, y = position

    cv2.rectangle(vis, (x, y), (x + bar_width, y + bar_height), (50, 50, 50), -1)

    fill_w = int(bar_width * min(max(confidence, 0), 1))
    if confidence > 0.7:
        color = (0, 200, 0)
    elif confidence > 0.4:
        color = (0, 200, 200)
    else:
        color = (0, 0, 200)
    cv2.rectangle(vis, (x, y), (x + fill_w, y + bar_height), color, -1)
    cv2.rectangle(vis, (x, y), (x + bar_width, y + bar_height), (200, 200, 200), 1)

    cv2.putText(
        vis, f"Conf: {confidence:.2f}",
        (x + bar_width + 10, y + bar_height - 4),
        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA,
    )
    return vis


def draw_inlier_ratio(
    frame: np.ndarray,
    inlier_mask: np.ndarray | None,
    position: tuple[int, int] = (10, 58),
) -> np.ndarray:
    """Show RANSAC inlier count and ratio."""
    vis = frame.copy()
    if inlier_mask is None:
        return vis
    n_inlier = int(inlier_mask.sum())
    n_total = len(inlier_mask)
    ratio = n_inlier / n_total if n_total > 0 else 0
    label = f"Inliers: {n_inlier}/{n_total} ({ratio:.0%})"
    cv2.putText(
        vis, label, position,
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1, cv2.LINE_AA,
    )
    return vis


def draw_stability_metric(
    frame: np.ndarray,
    H_prev: np.ndarray | None,
    H_curr: np.ndarray | None,
    position: tuple[int, int] = (10, 78),
) -> np.ndarray:
    """
    Display homography stability: Frobenius norm of H_curr − H_prev.
    Small values ≈ stable tracking, large values ≈ jitter.
    """
    vis = frame.copy()
    if H_prev is None or H_curr is None:
        return vis
    diff = np.linalg.norm(H_curr - H_prev, "fro")
    label = f"H-stability: {diff:.4f}"
    color = (0, 200, 0) if diff < 0.5 else (0, 200, 200) if diff < 2.0 else (0, 0, 200)
    cv2.putText(
        vis, label, position,
        cv2.FONT_HERSHEY_SIMPLEX, 0.45, color, 1, cv2.LINE_AA,
    )
    return vis


def draw_drift_warning(
    frame: np.ndarray,
    drift_pixels: float,
    threshold: float = 5.0,
) -> np.ndarray:
    """Red banner warning when drift exceeds threshold."""
    vis = frame.copy()
    if drift_pixels < threshold:
        return vis
    h, w = vis.shape[:2]
    overlay = vis.copy()
    cv2.rectangle(overlay, (0, 0), (w, 40), (0, 0, 180), -1)
    cv2.addWeighted(overlay, 0.6, vis, 0.4, 0, vis)
    cv2.putText(
        vis, f"DRIFT WARNING: {drift_pixels:.1f}px",
        (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
        (255, 255, 255), 2, cv2.LINE_AA,
    )
    return vis


def create_canonical_preview(
    canonical_frame: np.ndarray,
    target_height: int = 200,
) -> np.ndarray:
    """Scale canonical frame to a small PiP thumbnail."""
    ch, cw = canonical_frame.shape[:2]
    scale = target_height / ch
    tw = int(cw * scale)
    return cv2.resize(canonical_frame, (tw, target_height), interpolation=cv2.INTER_AREA)


def compose_debug_frame(
    frame: np.ndarray,
    corners: np.ndarray | None = None,
    frame_pts: np.ndarray | None = None,
    prev_pts: np.ndarray | None = None,
    inlier_mask: np.ndarray | None = None,
    confidence: float = 0.0,
    drift: float = 0.0,
    H_prev: np.ndarray | None = None,
    H_curr: np.ndarray | None = None,
    canonical_preview: np.ndarray | None = None,
    ecc_success: bool = False,
    num_tracked: int = 0,
) -> np.ndarray:
    """Compose a full debug overlay with all available data."""
    vis = frame.copy()

    vis = draw_screen_quad(vis, corners)
    vis = draw_grid_features(vis, frame_pts, prev_pts, inlier_mask)
    vis = draw_confidence_bar(vis, confidence, position=(10, 10))
    vis = draw_inlier_ratio(vis, inlier_mask, position=(10, 58))
    vis = draw_stability_metric(vis, H_prev, H_curr, position=(10, 78))

    # ECC + tracked count status line
    ecc_label = "ECC: OK" if ecc_success else "ECC: --"
    cv2.putText(
        vis, f"{ecc_label}  |  Grid pts: {num_tracked}",
        (10, 98), cv2.FONT_HERSHEY_SIMPLEX, 0.45,
        (200, 200, 200), 1, cv2.LINE_AA,
    )

    vis = draw_drift_warning(vis, drift)

    # Canonical PiP
    if canonical_preview is not None:
        h_frame, w_frame = vis.shape[:2]
        ph, pw = canonical_preview.shape[:2]
        x0, y0 = w_frame - pw - 10, h_frame - ph - 10
        if x0 > 0 and y0 > 0:
            vis[y0:y0 + ph, x0:x0 + pw] = canonical_preview

    return vis
