"""
Lucas-Kanade optical flow tracking with forward-backward validation.

Tracks dense planar grid points between consecutive video frames,
filtering unreliable matches via bidirectional consistency check.

The grid is defined in canonical (stabilized) screen space and projected
into each video frame via the 4-corner homography.  Tracked positions
maintain a 1:1 correspondence with their canonical origins, so the
frame→canonical homography can be estimated directly via RANSAC.
"""

from __future__ import annotations

import cv2
import numpy as np
from dataclasses import dataclass
from typing import Optional

from tracking.feature_grid import (
    generate_planar_grid,
    project_grid_to_frame,
    filter_in_bounds,
    supplement_with_features,
)
from tracking.screen_mask import get_screen_mask

# ── LK optical flow parameters ──────────────────────────────────────
_LK_PARAMS = dict(
    winSize=(31, 31),
    maxLevel=4,
    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
)


@dataclass
class TrackingResult:
    """Per-frame tracking data."""
    frame_pts: Optional[np.ndarray] = None       # (N,2) tracked points in frame coords
    canonical_pts: Optional[np.ndarray] = None   # (N,2) matching canonical positions
    inlier_mask: Optional[np.ndarray] = None     # (N,) bool set later by RANSAC
    num_tracked: int = 0
    was_reinitialized: bool = False


def track_planar_features(
    prev_gray: np.ndarray,
    curr_gray: np.ndarray,
    prev_pts: np.ndarray,
    fb_threshold: float = 1.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Track feature points prev→curr using Lucas-Kanade with
    forward-backward error check.

    Returns
        prev_good  (M, 2) surviving points in previous frame
        curr_good  (M, 2) corresponding points in current frame
        mask       (N,)   bool — which input points survived
    """
    if len(prev_pts) == 0:
        empty = np.empty((0, 2), dtype=np.float32)
        return empty, empty, np.zeros(0, dtype=bool)

    pts_in = prev_pts.reshape(-1, 1, 2).astype(np.float32)

    # Forward: prev → curr
    next_pts, st_fwd, _ = cv2.calcOpticalFlowPyrLK(
        prev_gray, curr_gray, pts_in, None, **_LK_PARAMS,
    )
    # Backward: curr → prev
    back_pts, st_bwd, _ = cv2.calcOpticalFlowPyrLK(
        curr_gray, prev_gray, next_pts, None, **_LK_PARAMS,
    )

    if next_pts is None or back_pts is None:
        empty = np.empty((0, 2), dtype=np.float32)
        return empty, empty, np.zeros(len(prev_pts), dtype=bool)

    fb_err = np.linalg.norm(
        pts_in.reshape(-1, 2) - back_pts.reshape(-1, 2), axis=1,
    )
    good = (
        (st_fwd.flatten() == 1)
        & (st_bwd.flatten() == 1)
        & (fb_err < fb_threshold)
    )

    return pts_in.reshape(-1, 2)[good], next_pts.reshape(-1, 2)[good], good


def track_full_sequence(
    video_path: str,
    corners_per_frame: list,
    canonical_size: tuple[int, int],
    grid_size: int = 20,
    fb_threshold: float = 1.0,
    min_points_ratio: float = 0.25,
    reinit_interval: int = 30,
    supplement_features: bool = True,
    max_supplement: int = 100,
) -> list[TrackingResult | None]:
    """
    Dense planar grid tracking across all video frames.

    1. Generates a canonical NxN grid.
    2. Projects it into the first frame via the 4-corner homography.
    3. Tracks frame-to-frame with LK optical flow + fwd/bwd check.
    4. Each survivor retains its canonical correspondence.
    5. Re-initialises the grid when points fall below threshold
       or at every reinit_interval frames.
    6. Optionally supplements grid with goodFeaturesToTrack.

    Returns a list of TrackingResult (one per frame, None where
    corners are unavailable).
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return [None] * len(corners_per_frame)

    total = len(corners_per_frame)
    cw, ch = canonical_size
    canonical_rect = np.array(
        [[0, 0], [cw, 0], [cw, ch], [0, ch]], dtype=np.float32,
    )
    canonical_grid = generate_planar_grid(canonical_size, grid_size)
    total_grid_pts = len(canonical_grid)

    results: list[TrackingResult | None] = [None] * total

    prev_gray: np.ndarray | None = None
    cur_frame_pts: np.ndarray | None = None
    cur_canon_pts: np.ndarray | None = None

    def _init_grid(corners: np.ndarray, gray: np.ndarray):
        """Project canonical grid into frame, optionally supplement."""
        H_to = cv2.getPerspectiveTransform(
            corners.astype(np.float32), canonical_rect,
        )
        H_from = np.linalg.inv(H_to)
        frame_pts = project_grid_to_frame(canonical_grid, H_from)
        valid = filter_in_bounds(frame_pts, gray.shape)

        f_pts = frame_pts[valid]
        c_pts = canonical_grid[valid].copy()

        # Supplement with texture features
        if supplement_features and max_supplement > 0:
            mask = get_screen_mask(corners, gray.shape, margin=8)
            extra_frame = supplement_with_features(gray, mask, max_supplement)
            if len(extra_frame) > 0:
                extra_canon = cv2.perspectiveTransform(
                    extra_frame.reshape(-1, 1, 2), H_to,
                ).reshape(-1, 2)
                f_pts = np.vstack([f_pts, extra_frame])
                c_pts = np.vstack([c_pts, extra_canon.astype(np.float32)])

        return f_pts, c_pts

    for i in range(total):
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        corners = corners_per_frame[i]

        if corners is None:
            prev_gray = gray
            cur_frame_pts = None
            cur_canon_pts = None
            continue

        needs_reinit = (
            cur_frame_pts is None
            or prev_gray is None
            or i % reinit_interval == 0
            or len(cur_frame_pts) < total_grid_pts * min_points_ratio
        )

        if needs_reinit:
            cur_frame_pts, cur_canon_pts = _init_grid(corners, gray)
            results[i] = TrackingResult(
                frame_pts=cur_frame_pts.copy(),
                canonical_pts=cur_canon_pts.copy(),
                num_tracked=len(cur_frame_pts),
                was_reinitialized=True,
            )
        else:
            _, curr_good, mask = track_planar_features(
                prev_gray, gray, cur_frame_pts, fb_threshold,
            )

            if len(curr_good) < 4:
                cur_frame_pts, cur_canon_pts = _init_grid(corners, gray)
                results[i] = TrackingResult(
                    frame_pts=cur_frame_pts.copy(),
                    canonical_pts=cur_canon_pts.copy(),
                    num_tracked=len(cur_frame_pts),
                    was_reinitialized=True,
                )
            else:
                cur_frame_pts = curr_good
                cur_canon_pts = cur_canon_pts[mask]
                results[i] = TrackingResult(
                    frame_pts=cur_frame_pts.copy(),
                    canonical_pts=cur_canon_pts.copy(),
                    num_tracked=len(cur_frame_pts),
                    was_reinitialized=False,
                )

        prev_gray = gray

    cap.release()
    return results
