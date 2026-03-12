"""
Drift detection and re-anchoring.

Prevents accumulated optical-flow / homography drift by periodically
snapping the tracked transforms back toward known keyframe references.
"""

from __future__ import annotations

import cv2
import numpy as np


def detect_drift(
    homographies: list[np.ndarray | None],
    confidences: list[float],
    keyframe_corners: list[dict],
    canonical_size: tuple[int, int],
    drift_threshold: float = 5.0,
) -> list[float]:
    """
    Compute per-frame drift (px in canonical space) relative to the
    nearest keyframe reference.

    Returns list[float] — one drift value per frame.
    """
    cw, ch = canonical_size
    canonical_rect = np.array(
        [[0, 0], [cw, 0], [cw, ch], [0, ch]], dtype=np.float32,
    )

    kf_map: dict[int, np.ndarray] = {}
    for kc in keyframe_corners:
        idx = kc["frameIndex"]
        corners = np.array(
            [[c["x"], c["y"]] for c in kc["corners"]], dtype=np.float32,
        )
        kf_map[idx] = cv2.getPerspectiveTransform(corners, canonical_rect)

    kf_indices = sorted(kf_map.keys())
    if not kf_indices:
        return [0.0] * len(homographies)

    test_pts = canonical_rect.reshape(-1, 1, 2)
    drifts: list[float] = []

    for i, H in enumerate(homographies):
        if H is None:
            drifts.append(0.0)
            continue

        nearest = min(kf_indices, key=lambda ki: abs(ki - i))
        kf_H = kf_map[nearest]

        try:
            mapped_track = cv2.perspectiveTransform(
                test_pts, np.linalg.inv(H),
            )
            mapped_kf = cv2.perspectiveTransform(
                test_pts, np.linalg.inv(kf_H),
            )
            drift = float(np.linalg.norm(
                mapped_track - mapped_kf, axis=2,
            ).mean())
        except np.linalg.LinAlgError:
            drift = 0.0

        drifts.append(drift)

    return drifts


def reanchor(
    homographies: list[np.ndarray | None],
    confidences: list[float],
    keyframe_corners: list[dict],
    canonical_size: tuple[int, int],
    confidence_threshold: float = 0.4,
    reanchor_interval: int = 30,
    blend_strength: float = 0.7,
) -> list[np.ndarray | None]:
    """
    Re-anchor homographies to prevent accumulated drift.

    At keyframe frames → snap exactly to keyframe H.
    At reanchor intervals or low-confidence frames → blend toward
    the nearest keyframe.
    """
    cw, ch = canonical_size
    canonical_rect = np.array(
        [[0, 0], [cw, 0], [cw, ch], [0, ch]], dtype=np.float32,
    )

    kf_map: dict[int, np.ndarray] = {}
    for kc in keyframe_corners:
        idx = kc["frameIndex"]
        corners = np.array(
            [[c["x"], c["y"]] for c in kc["corners"]], dtype=np.float32,
        )
        kf_map[idx] = cv2.getPerspectiveTransform(corners, canonical_rect)

    kf_indices = sorted(kf_map.keys())
    if not kf_indices:
        return list(homographies)

    result = [
        H.copy() if H is not None else None for H in homographies
    ]

    for i in range(len(result)):
        if result[i] is None:
            continue

        # Keyframe frame → exact snap
        if i in kf_map:
            result[i] = kf_map[i].astype(np.float64).copy()
            continue

        conf = confidences[i] if i < len(confidences) else 1.0
        needs_reanchor = (
            i % reanchor_interval == 0
            or conf < confidence_threshold
        )

        if needs_reanchor:
            nearest = min(kf_indices, key=lambda ki: abs(ki - i))
            kf_H = kf_map[nearest].astype(np.float64)
            result[i] = blend_strength * kf_H + (1.0 - blend_strength) * result[i]
            result[i] /= result[i][2, 2]

    return result
