"""
Step 3 — Temporal smoothing of corner trajectories.

Applies a Savitzky-Golay filter to each corner coordinate over time,
eliminating high-frequency jitter while preserving the overall motion
curve.
"""

import numpy as np
from scipy.signal import savgol_filter


def smooth_corner_trajectories(
    corners_per_frame: list[np.ndarray | None],
    window_length: int = 11,
    polyorder: int = 3,
) -> list[np.ndarray | None]:
    """
    Smooth all 4 corner trajectories (x, y) over time using Savitzky-Golay.

    window_length: must be odd, number of frames in smoothing window.
        Larger = smoother but less responsive.  11 is good for 30fps.
    polyorder: polynomial order for the filter.  3 preserves curves well.

    Returns a new list with smoothed corners; None entries are preserved.
    """
    total = len(corners_per_frame)
    valid_indices = [i for i, c in enumerate(corners_per_frame) if c is not None]

    if len(valid_indices) < window_length:
        # Not enough frames to smooth — adjust window or return as-is
        if len(valid_indices) < 4:
            return corners_per_frame
        # Use smaller window
        window_length = len(valid_indices)
        if window_length % 2 == 0:
            window_length -= 1
        if window_length < polyorder + 2:
            return corners_per_frame

    valid_corners = np.array(
        [corners_per_frame[i] for i in valid_indices]
    )  # (N_valid, 4, 2)

    smoothed = np.empty_like(valid_corners)

    for corner_idx in range(4):
        for coord_idx in range(2):
            trajectory = valid_corners[:, corner_idx, coord_idx]
            smoothed[:, corner_idx, coord_idx] = savgol_filter(
                trajectory, window_length, polyorder
            )

    result: list[np.ndarray | None] = [None] * total
    for idx, vi in enumerate(valid_indices):
        result[vi] = smoothed[idx].astype(np.float32)

    return result
