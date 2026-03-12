"""
Step 6 — Motion blur post-processing.

Applies temporal blending between neighbouring frames to simulate natural
camera motion blur and mask any residual micro-jitter.
"""

import numpy as np


def apply_motion_blur(
    frames_buffer: list[np.ndarray],
    index: int,
    weights: tuple[float, float, float] = (0.2, 0.6, 0.2),
) -> np.ndarray:
    """
    Temporal motion blur via weighted blending of previous, current, and
    next frames.

    frames_buffer: list of decoded BGR frames (at least surrounding the
        current index).
    index: position in frames_buffer of the "current" frame.
    weights: (prev, current, next) blend weights. Should sum to 1.0.

    Returns blended frame as uint8.
    """
    w_prev, w_curr, w_next = weights
    current = frames_buffer[index].astype(np.float32) * w_curr

    if index > 0:
        current += frames_buffer[index - 1].astype(np.float32) * w_prev
    else:
        current += frames_buffer[index].astype(np.float32) * w_prev

    if index < len(frames_buffer) - 1:
        current += frames_buffer[index + 1].astype(np.float32) * w_next
    else:
        current += frames_buffer[index].astype(np.float32) * w_next

    return current.clip(0, 255).astype(np.uint8)


def apply_motion_blur_streaming(
    prev_frame: np.ndarray | None,
    current_frame: np.ndarray,
    next_frame: np.ndarray | None,
    weights: tuple[float, float, float] = (0.2, 0.6, 0.2),
) -> np.ndarray:
    """
    Streaming variant — takes explicit prev/current/next frames instead
    of a buffer index.  More memory-efficient for large videos.
    """
    w_prev, w_curr, w_next = weights
    blended = current_frame.astype(np.float32) * w_curr

    if prev_frame is not None:
        blended += prev_frame.astype(np.float32) * w_prev
    else:
        blended += current_frame.astype(np.float32) * w_prev

    if next_frame is not None:
        blended += next_frame.astype(np.float32) * w_next
    else:
        blended += current_frame.astype(np.float32) * w_next

    return blended.clip(0, 255).astype(np.uint8)
