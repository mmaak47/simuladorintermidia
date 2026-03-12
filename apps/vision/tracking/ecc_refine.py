"""
ECC (Enhanced Correlation Coefficient) refinement.

After the initial homography is estimated from the dense grid RANSAC,
refine it using cv2.findTransformECC on the screen patch.  ECC aligns
the actual pixel intensities to sub-pixel precision, eliminating the
residual micro-drift that point tracking alone cannot catch.

Uses the previous frame's homography as initialization for ECC.
"""

from __future__ import annotations

import cv2
import numpy as np


_ECC_CRITERIA = (
    cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT,
    50,
    1e-4,
)


def refine_homography_ecc(
    prev_gray: np.ndarray,
    curr_gray: np.ndarray,
    H_init: np.ndarray,
    canonical_size: tuple[int, int],
) -> tuple[np.ndarray, bool]:
    """
    Refine a frame→canonical homography using ECC alignment.

    Warps both the previous and current frames into canonical space using
    H_init, then runs findTransformECC to compute a residual correction.
    The refined homography is composed as:  warp_residual @ H_init.

    Returns
        H_refined  refined 3×3 homography (frame → canonical)
        success    whether ECC converged
    """
    cw, ch = canonical_size

    try:
        prev_canon = cv2.warpPerspective(
            prev_gray, H_init, (cw, ch), flags=cv2.INTER_LINEAR,
        )
        curr_canon = cv2.warpPerspective(
            curr_gray, H_init, (cw, ch), flags=cv2.INTER_LINEAR,
        )

        warp_matrix = np.eye(3, dtype=np.float32)
        _, warp_matrix = cv2.findTransformECC(
            prev_canon,
            curr_canon,
            warp_matrix,
            motionType=cv2.MOTION_HOMOGRAPHY,
            criteria=_ECC_CRITERIA,
            inputMask=None,
            gaussFiltSize=5,
        )

        # Compose: H_refined = residual @ H_init
        H_refined = warp_matrix.astype(np.float64) @ H_init
        return H_refined, True

    except cv2.error:
        return H_init, False


def refine_homography_sequence_ecc(
    video_path: str,
    homographies: list[np.ndarray | None],
    corners_per_frame: list[np.ndarray | None],
    canonical_size: tuple[int, int],
    max_refinements: int = -1,
) -> tuple[list[np.ndarray | None], list[bool]]:
    """
    Refine a full sequence of homographies using ECC.

    max_refinements: if >0, cap the number of frames refined (for speed).
                     -1 = refine all.

    Returns
        refined_homographies  list of refined 3×3 matrices
        ecc_success           list of bools (True where ECC converged)
    """
    total = len(homographies)
    refined = [H.copy() if H is not None else None for H in homographies]
    success = [False] * total

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return refined, success

    prev_gray: np.ndarray | None = None
    refinements_done = 0

    for i in range(total):
        ret, frame = cap.read()
        if not ret:
            break

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        if (
            refined[i] is not None
            and prev_gray is not None
            and corners_per_frame[i] is not None
        ):
            if max_refinements < 0 or refinements_done < max_refinements:
                H_ref, ok = refine_homography_ecc(
                    prev_gray, gray, refined[i], canonical_size,
                )
                if ok:
                    refined[i] = H_ref
                    success[i] = True
                    refinements_done += 1

        prev_gray = gray

    cap.release()
    return refined, success
