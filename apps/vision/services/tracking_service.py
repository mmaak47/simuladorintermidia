"""
Video tracking service — tracks 4 screen corners across video frames
using Lucas-Kanade optical flow with temporal smoothing.
"""

import numpy as np
import cv2
import logging
from typing import Dict, List, Any

logger = logging.getLogger(__name__)

# Optical flow parameters
LK_PARAMS = dict(
    winSize=(21, 21),
    maxLevel=3,
    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
)

# Temporal smoothing factor (0 = full smoothing, 1 = no smoothing)
SMOOTH_ALPHA = 0.3


def track_corners_in_video(
    video_path: str,
    initial_corners: np.ndarray,
    redetect_interval: int = 60,
) -> Dict[str, Any]:
    """
    Track 4 screen corners through a video using optical flow.

    Args:
        video_path: path to video file
        initial_corners: 4×2 array of (x, y) corners from frame 0
        redetect_interval: re-run SAM every N frames (placeholder)

    Returns:
        {
            fps: float,
            totalFrames: int,
            frames: [{ frameIndex, corners: [[x,y],...], confidence }]
        }
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    ret, first_frame = cap.read()
    if not ret:
        raise RuntimeError("Could not read first frame")

    prev_gray = cv2.cvtColor(first_frame, cv2.COLOR_BGR2GRAY)
    prev_corners = initial_corners.copy().reshape(4, 1, 2)

    # Smoothed corners (exponential moving average)
    smoothed = initial_corners.copy()

    frames_result: List[Dict[str, Any]] = []
    frames_result.append({
        "frameIndex": 0,
        "corners": initial_corners.tolist(),
        "confidence": 1.0,
    })

    frame_idx = 1
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        curr_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        # Lucas-Kanade optical flow
        next_corners, status, err = cv2.calcOpticalFlowPyrLK(
            prev_gray, curr_gray, prev_corners, None, **LK_PARAMS
        )

        if next_corners is None or status is None:
            # Tracking lost — use last known corners
            confidence = 0.0
            tracked = smoothed.copy()
        else:
            # Check how many corners were tracked successfully
            good = status.flatten().astype(bool)
            confidence = float(good.sum()) / 4.0

            tracked_raw = next_corners.reshape(4, 2)

            if confidence >= 0.5:
                # Apply exponential smoothing
                smoothed = smoothed * (1 - SMOOTH_ALPHA) + tracked_raw * SMOOTH_ALPHA
                tracked = smoothed.copy()
            else:
                # Low confidence — hold previous
                tracked = smoothed.copy()

        frames_result.append({
            "frameIndex": frame_idx,
            "corners": tracked.tolist(),
            "confidence": confidence,
        })

        # Prepare for next iteration
        prev_gray = curr_gray
        prev_corners = tracked.reshape(4, 1, 2).astype(np.float32)
        frame_idx += 1

        # TODO: Phase 2 — re-detect with SAM every redetect_interval frames
        # when confidence drops below threshold.

    cap.release()

    return {
        "fps": fps,
        "totalFrames": total_frames,
        "frames": frames_result,
    }
