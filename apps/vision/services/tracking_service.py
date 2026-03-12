"""
Video tracking service — tracks 4 screen corners across video frames
using Lucas-Kanade optical flow with periodic hybrid re-detection
(YOLO → SAM → OpenCV) to correct drift on camera-movement videos.
"""

import numpy as np
import cv2
import logging
from typing import Dict, List, Any, Optional

logger = logging.getLogger(__name__)

# Optical flow parameters
LK_PARAMS = dict(
    winSize=(21, 21),
    maxLevel=3,
    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 30, 0.01),
)

# Temporal smoothing factor (0 = full smoothing, 1 = no smoothing)
SMOOTH_ALPHA = 0.3

# If optical-flow confidence drops below this, trigger re-detection
REDETECT_CONFIDENCE_THRESHOLD = 0.5


def _redetect_corners(frame_bgr: np.ndarray) -> Optional[np.ndarray]:
    """
    Run the full hybrid detection pipeline on a single video frame.
    Returns a 4×2 float32 ndarray of ordered corners, or None on failure.
    """
    from services.detector_yolo import detect_screens
    from services.detector_geometric import detect_rectangles
    from services.segment_sam import segment_screen_in_crop
    from services.contour_corners import extract_corners

    frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    img_h, img_w = frame_rgb.shape[:2]

    # YOLO first, then geometric fallback
    try:
        candidates = detect_screens(frame_rgb)
    except Exception as e:
        logger.debug("Re-detection YOLO failed: %s", e)
        candidates = []

    if not candidates:
        try:
            candidates = detect_rectangles(frame_rgb)
        except Exception as e:
            logger.debug("Re-detection geometric failed: %s", e)
            candidates = []

    if not candidates:
        return None

    best = candidates[0]
    bbox = best.bbox
    x1 = max(int(bbox.x1), 0)
    y1 = max(int(bbox.y1), 0)
    x2 = min(int(bbox.x2), img_w)
    y2 = min(int(bbox.y2), img_h)

    if (x2 - x1) < 20 or (y2 - y1) < 20:
        return None

    try:
        mask_full, _conf, _url = segment_screen_in_crop(
            full_image_rgb=frame_rgb,
            crop_x1=x1, crop_y1=y1, crop_x2=x2, crop_y2=y2,
            padding=0.10,
        )
    except Exception as e:
        logger.debug("Re-detection SAM failed: %s", e)
        return None

    mask_uint8 = (mask_full.astype(np.uint8)) * 255

    try:
        contour_result = extract_corners(mask_uint8, reject_nested=True)
    except ValueError as e:
        logger.debug("Re-detection corner extraction failed: %s", e)
        return None

    corners = np.array(
        [[p.x, p.y] for p in contour_result.corners], dtype=np.float32,
    )
    return corners


def track_corners_in_video(
    video_path: str,
    initial_corners: np.ndarray,
    redetect_interval: int = 60,
) -> Dict[str, Any]:
    """
    Track 4 screen corners through a video using optical flow,
    with periodic hybrid re-detection to correct drift.

    Args:
        video_path: path to video file
        initial_corners: 4×2 array of (x, y) corners from frame 0
        redetect_interval: re-run hybrid pipeline every N frames

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
            confidence = 0.0
            tracked = smoothed.copy()
        else:
            good = status.flatten().astype(bool)
            confidence = float(good.sum()) / 4.0

            tracked_raw = next_corners.reshape(4, 2)

            if confidence >= 0.5:
                smoothed = smoothed * (1 - SMOOTH_ALPHA) + tracked_raw * SMOOTH_ALPHA
                tracked = smoothed.copy()
            else:
                tracked = smoothed.copy()

        # ── Re-detect on keyframes or when confidence drops ──
        should_redetect = (
            frame_idx % redetect_interval == 0
            or confidence < REDETECT_CONFIDENCE_THRESHOLD
        )

        if should_redetect:
            logger.info(
                "Re-detecting on frame %d (confidence=%.2f)", frame_idx, confidence,
            )
            new_corners = _redetect_corners(frame)
            if new_corners is not None:
                smoothed = new_corners.copy()
                tracked = new_corners.copy()
                confidence = 1.0
                logger.info("Re-detection succeeded on frame %d", frame_idx)
            else:
                logger.info("Re-detection failed on frame %d, keeping flow", frame_idx)

        frames_result.append({
            "frameIndex": frame_idx,
            "corners": tracked.tolist(),
            "confidence": confidence,
        })

        # Prepare for next iteration
        prev_gray = curr_gray
        prev_corners = tracked.reshape(4, 1, 2).astype(np.float32)
        frame_idx += 1

    cap.release()

    return {
        "fps": fps,
        "totalFrames": total_frames,
        "frames": frames_result,
    }
