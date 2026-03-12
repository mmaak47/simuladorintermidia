"""
Step 2 — Optical flow tracking refinement.

Uses Lucas-Kanade sparse optical flow to refine interpolated corner
positions by tracking actual pixel motion between consecutive frames.
"""

import cv2
import numpy as np


# Lucas-Kanade parameters tuned for screen corner tracking
_LK_PARAMS = dict(
    winSize=(31, 31),
    maxLevel=4,
    criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 50, 0.01),
)


def refine_corners_optical_flow(
    video_path: str,
    corners_per_frame: list[np.ndarray | None],
    blend_alpha: float = 0.4,
) -> list[np.ndarray | None]:
    """
    Refine pre-interpolated corners by blending with optical-flow tracked
    positions.  This follows real surface motion and corrects interpolation
    drift.

    blend_alpha: weight of optical-flow result vs interpolation.
        0.0 = pure interpolation, 1.0 = pure optical flow.
        0.4 is a good balance — trusts flow for micro-motion but
        doesn't let tracking drift accumulate.

    Returns a new corners_per_frame list with refined positions.
    """
    total = len(corners_per_frame)
    refined = [c.copy() if c is not None else None for c in corners_per_frame]

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return refined

    prev_gray: np.ndarray | None = None
    prev_pts: np.ndarray | None = None

    for i in range(total):
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if refined[i] is None:
            prev_gray = gray
            prev_pts = None
            continue

        if prev_gray is not None and prev_pts is not None:
            # Track previous corners into current frame
            next_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                prev_gray, gray, prev_pts, None, **_LK_PARAMS
            )

            if next_pts is not None and status is not None:
                good = status.flatten().astype(bool)
                if good.all():
                    tracked = next_pts.reshape(-1, 2)
                    interp = refined[i]
                    # Blend: use interpolated as anchor, nudge toward flow
                    refined[i] = (
                        (1.0 - blend_alpha) * interp
                        + blend_alpha * tracked
                    ).astype(np.float32)

        # Prepare points for next frame's tracking
        prev_gray = gray
        prev_pts = refined[i].reshape(-1, 1, 2).astype(np.float32)

    cap.release()
    return refined
