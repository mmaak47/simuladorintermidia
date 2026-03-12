"""
Keyframe extraction service — extracts representative frames from a video
at regular intervals for manual corner editing.
"""

import logging
import uuid
import base64
from pathlib import Path
from typing import List, Dict, Any

import cv2
import numpy as np

logger = logging.getLogger(__name__)


def extract_keyframes(
    video_path: str,
    max_keyframes: int = 20,
    min_interval_sec: float = 0.5,
) -> Dict[str, Any]:
    """
    Extract keyframes from a video at regular intervals.

    Args:
        video_path: path to the video file
        max_keyframes: maximum number of keyframes to extract
        min_interval_sec: minimum time between keyframes in seconds

    Returns:
        {
            fps: float,
            totalFrames: int,
            duration: float,
            width: int,
            height: int,
            keyframes: [
                {
                    frameIndex: int,
                    time: float,
                    thumbnailUrl: str,  (served path)
                }
            ]
        }
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration = total_frames / fps if fps > 0 else 0

    # Calculate interval
    min_interval_frames = int(min_interval_sec * fps)
    # Distribute keyframes evenly, but at least min_interval apart
    ideal_interval = max(total_frames // max_keyframes, min_interval_frames)
    # Always include first and last frame
    frame_indices = [0]
    current = ideal_interval
    while current < total_frames - 1:
        frame_indices.append(current)
        current += ideal_interval
    if frame_indices[-1] != total_frames - 1:
        frame_indices.append(total_frames - 1)

    # Limit to max_keyframes
    if len(frame_indices) > max_keyframes:
        step = len(frame_indices) / max_keyframes
        selected = [frame_indices[int(i * step)] for i in range(max_keyframes)]
        if frame_indices[-1] not in selected:
            selected[-1] = frame_indices[-1]
        frame_indices = selected

    # Extract thumbnails
    thumb_dir = Path("uploads") / "keyframes"
    thumb_dir.mkdir(parents=True, exist_ok=True)

    batch_id = uuid.uuid4().hex[:8]
    keyframes = []

    # Thumbnail size (scale to fit within 320px wide)
    thumb_w = 320
    thumb_h = int(thumb_w * height / width) if width > 0 else 180

    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ret, frame = cap.read()
        if not ret:
            continue

        # Resize for thumbnail
        thumb = cv2.resize(frame, (thumb_w, thumb_h), interpolation=cv2.INTER_AREA)

        # Save thumbnail
        fname = f"kf_{batch_id}_{idx:06d}.jpg"
        fpath = thumb_dir / fname
        cv2.imwrite(str(fpath), thumb, [cv2.IMWRITE_JPEG_QUALITY, 80])

        keyframes.append({
            "frameIndex": idx,
            "time": round(idx / fps, 3),
            "thumbnailUrl": f"/files/uploads/keyframes/{fname}",
        })

    cap.release()

    return {
        "fps": fps,
        "totalFrames": total_frames,
        "duration": round(duration, 3),
        "width": width,
        "height": height,
        "keyframes": keyframes,
    }
