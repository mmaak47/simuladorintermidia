"""
Dense planar grid tracking — Mocha Pro / Nuke style.

Instead of detecting sparse Shi-Tomasi corners, generates a dense
NxN regular grid of feature points inside the screen polygon and
tracks ALL of them with Lucas-Kanade optical flow.

The grid is defined in canonical (stabilized) screen space and projected
into each video frame.  Tracked positions maintain a 1-to-1 correspondence
with their canonical origins, so the frame→canonical homography can be
computed directly via RANSAC without accumulation drift.

Re-initialization happens automatically when too many points are lost
or at configurable intervals, snapping back to the known keyframe geometry.
"""

from __future__ import annotations

import cv2
import numpy as np
from dataclasses import dataclass, field
from typing import Optional

# ── LK optical flow parameters ──────────────────────────────────────
_LK_PARAMS = dict(
    winSize=(31, 31),
    maxLevel=4,
    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
)


# ── Data class for per-frame tracking result ────────────────────────
@dataclass
class FrameTrackingData:
    """Holds tracking data for a single frame."""
    frame_pts: Optional[np.ndarray] = None       # (N,2) in frame coords
    canonical_pts: Optional[np.ndarray] = None    # (N,2) in canonical coords
    inlier_mask: Optional[np.ndarray] = None      # (N,) bool — set by RANSAC
    num_tracked: int = 0
    was_reinitialized: bool = False


# ── Grid generation ─────────────────────────────────────────────────
def generate_grid_in_canonical(
    canonical_size: tuple[int, int],
    grid_size: int = 20,
    margin_frac: float = 0.03,
) -> np.ndarray:
    """
    Generate a dense NxN regular grid in canonical screen space.

    canonical_size: (width, height) of the canonical canvas.
    grid_size:      number of points per axis (20 → 20×20 = 400 pts).
    margin_frac:    fractional inset from edges (0.03 = 3 %).

    Returns (grid_size*grid_size, 2) float32 array.
    """
    cw, ch = canonical_size
    mx, my = cw * margin_frac, ch * margin_frac

    xs = np.linspace(mx, cw - mx, grid_size, dtype=np.float32)
    ys = np.linspace(my, ch - my, grid_size, dtype=np.float32)

    # meshgrid → (grid_size, grid_size, 2) → flatten to (N, 2)
    gx, gy = np.meshgrid(xs, ys)
    grid = np.stack([gx.ravel(), gy.ravel()], axis=-1)
    return grid.astype(np.float32)


def _map_canonical_to_frame(
    canonical_pts: np.ndarray,
    H_canon_to_frame: np.ndarray,
) -> np.ndarray:
    """Project canonical-space points into frame coords via H."""
    pts = canonical_pts.reshape(-1, 1, 2).astype(np.float32)
    mapped = cv2.perspectiveTransform(pts, H_canon_to_frame.astype(np.float64))
    return mapped.reshape(-1, 2).astype(np.float32)


def _filter_in_bounds(
    pts: np.ndarray,
    frame_shape: tuple[int, ...],
    margin: int = 5,
) -> np.ndarray:
    """Boolean mask — True for points inside the frame with margin."""
    h, w = frame_shape[:2]
    return (
        (pts[:, 0] >= margin) & (pts[:, 0] < w - margin) &
        (pts[:, 1] >= margin) & (pts[:, 1] < h - margin)
    )


# ── LK tracking with forward-backward validation ───────────────────
def track_grid_points(
    prev_gray: np.ndarray,
    curr_gray: np.ndarray,
    prev_pts: np.ndarray,
    fb_threshold: float = 1.0,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Track points prev→curr using Lucas-Kanade with forward-backward check.

    Returns
        prev_good  (M, 2)  surviving points in prev frame
        curr_good  (M, 2)  corresponding points in curr frame
        mask       (N,)    bool — which input points survived
    """
    if len(prev_pts) == 0:
        empty = np.empty((0, 2), dtype=np.float32)
        return empty, empty, np.zeros(0, dtype=bool)

    pts_in = prev_pts.reshape(-1, 1, 2).astype(np.float32)

    # Forward: prev → curr
    next_pts, st_fwd, _ = cv2.calcOpticalFlowPyrLK(
        prev_gray, curr_gray, pts_in, None, **_LK_PARAMS
    )
    # Backward: curr → prev
    back_pts, st_bwd, _ = cv2.calcOpticalFlowPyrLK(
        curr_gray, prev_gray, next_pts, None, **_LK_PARAMS
    )

    if next_pts is None or back_pts is None:
        empty = np.empty((0, 2), dtype=np.float32)
        return empty, empty, np.zeros(len(prev_pts), dtype=bool)

    fb_err = np.linalg.norm(
        pts_in.reshape(-1, 2) - back_pts.reshape(-1, 2), axis=1
    )
    good = (
        (st_fwd.flatten() == 1)
        & (st_bwd.flatten() == 1)
        & (fb_err < fb_threshold)
    )

    return pts_in.reshape(-1, 2)[good], next_pts.reshape(-1, 2)[good], good


# ── Full-video dense grid tracking ─────────────────────────────────
def track_all_frames_grid(
    video_path: str,
    corners_per_frame: list[np.ndarray | None],
    canonical_size: tuple[int, int],
    grid_size: int = 20,
    fb_threshold: float = 1.0,
    min_points_ratio: float = 0.25,
    reinit_interval: int = 30,
) -> list[FrameTrackingData | None]:
    """
    Dense planar grid tracking across all video frames.

    1. Generates a canonical-space NxN grid.
    2. Projects it into the first frame via the 4-corner homography.
    3. Tracks frame-to-frame with LK optical flow.
    4. Each surviving point retains its canonical correspondence, so
       the frame→canonical homography can be estimated directly.
    5. Re-initialises the grid when too many points are lost or at
       every reinit_interval frames.

    Returns a list of FrameTrackingData (one per frame, None where
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
    canonical_grid = generate_grid_in_canonical(canonical_size, grid_size)
    total_grid_pts = len(canonical_grid)

    results: list[FrameTrackingData | None] = [None] * total

    prev_gray: np.ndarray | None = None
    cur_frame_pts: np.ndarray | None = None   # tracked positions in frame
    cur_canon_pts: np.ndarray | None = None   # matching canonical positions

    def _init_grid(corners: np.ndarray, gray: np.ndarray):
        """Project canonical grid into frame via 4-corner H, filter OOB."""
        H_to = cv2.getPerspectiveTransform(
            corners.astype(np.float32), canonical_rect,
        )
        H_from = np.linalg.inv(H_to)
        frame_pts = _map_canonical_to_frame(canonical_grid, H_from)
        valid = _filter_in_bounds(frame_pts, gray.shape)
        return frame_pts[valid], canonical_grid[valid].copy()

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

        # Determine whether to (re)initialise the grid
        needs_reinit = (
            cur_frame_pts is None
            or prev_gray is None
            or i % reinit_interval == 0
            or len(cur_frame_pts) < total_grid_pts * min_points_ratio
        )

        if needs_reinit:
            cur_frame_pts, cur_canon_pts = _init_grid(corners, gray)
            results[i] = FrameTrackingData(
                frame_pts=cur_frame_pts.copy(),
                canonical_pts=cur_canon_pts.copy(),
                num_tracked=len(cur_frame_pts),
                was_reinitialized=True,
            )
        else:
            # Track from previous frame
            _, curr_good, mask = track_grid_points(
                prev_gray, gray, cur_frame_pts, fb_threshold,
            )

            if len(curr_good) < 4:
                # Too few survivors → force reinit
                cur_frame_pts, cur_canon_pts = _init_grid(corners, gray)
                results[i] = FrameTrackingData(
                    frame_pts=cur_frame_pts.copy(),
                    canonical_pts=cur_canon_pts.copy(),
                    num_tracked=len(cur_frame_pts),
                    was_reinitialized=True,
                )
            else:
                surviving_canon = cur_canon_pts[mask]
                cur_frame_pts = curr_good
                cur_canon_pts = surviving_canon
                results[i] = FrameTrackingData(
                    frame_pts=cur_frame_pts.copy(),
                    canonical_pts=cur_canon_pts.copy(),
                    num_tracked=len(cur_frame_pts),
                    was_reinitialized=False,
                )

        prev_gray = gray

    cap.release()
    return results
