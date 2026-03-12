"""
Step 1 — Keyframe corner interpolation.

Given a sparse set of manually-placed keyframe corners, produce a dense
per-frame corner array using linear interpolation.
"""

import numpy as np


def corners_to_array(corners: list[dict]) -> np.ndarray:
    """Convert [{x, y}, ...] list to (4, 2) float32 ndarray."""
    return np.array([[c["x"], c["y"]] for c in corners], dtype=np.float32)


def interpolate_all_frames(
    keyframe_corners: list[dict],
    total_frames: int,
) -> list[np.ndarray | None]:
    """
    Produce a list of (4, 2) corner arrays for every frame in the video.

    keyframe_corners: sorted list of {frameIndex, corners: [{x,y}×4]}
    total_frames: total number of video frames

    Returns a list of length total_frames. Entries outside the keyframe
    range are None; entries between keyframes are linearly interpolated.
    """
    if not keyframe_corners:
        return [None] * total_frames

    result: list[np.ndarray | None] = [None] * total_frames

    if len(keyframe_corners) == 1:
        c = corners_to_array(keyframe_corners[0]["corners"])
        first_idx = keyframe_corners[0]["frameIndex"]
        for i in range(first_idx, total_frames):
            result[i] = c.copy()
        for i in range(0, first_idx):
            result[i] = c.copy()
        return result

    first_kf = keyframe_corners[0]
    last_kf = keyframe_corners[-1]

    # Fill before first keyframe
    c_first = corners_to_array(first_kf["corners"])
    for i in range(0, first_kf["frameIndex"]):
        result[i] = c_first.copy()

    # Fill after last keyframe
    c_last = corners_to_array(last_kf["corners"])
    for i in range(last_kf["frameIndex"], total_frames):
        result[i] = c_last.copy()

    # Interpolate between consecutive keyframes
    for k in range(len(keyframe_corners) - 1):
        kf_a = keyframe_corners[k]
        kf_b = keyframe_corners[k + 1]
        idx_a = kf_a["frameIndex"]
        idx_b = kf_b["frameIndex"]
        c_a = corners_to_array(kf_a["corners"])
        c_b = corners_to_array(kf_b["corners"])
        span = idx_b - idx_a

        for i in range(idx_a, idx_b + 1):
            t = (i - idx_a) / span if span > 0 else 0.0
            result[i] = c_a + t * (c_b - c_a)

    return result
