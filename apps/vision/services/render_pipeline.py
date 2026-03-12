"""
Professional stabilization render pipeline.

Orchestrates the full VFX-grade screen replacement workflow:

  1. Keyframe interpolation → dense corners per frame
  2. Optical flow refinement → corners follow real surface motion
  3. Savitzky-Golay temporal smoothing → eliminate jitter
  4. Homography computation + EMA smoothing → stable perspective
  5. Warp + composite per frame
  6. Temporal motion blur → hide residual micro-jitter
  7. Cinematic post (vignette + grain)
  8. Encode to MP4

Yields SSE-compatible progress dicts just like the old compositor.
"""

import cv2
import numpy as np
from pathlib import Path
from typing import Generator

from tracking.interpolate_keyframes import interpolate_all_frames, corners_to_array
from tracking.optical_flow_tracker import refine_corners_optical_flow
from tracking.smoothing import smooth_corner_trajectories
from tracking.homography_smoothing import (
    compute_homography_sequence,
    smooth_homographies,
)
from tracking.motion_blur import apply_motion_blur_streaming
from services.compositor import (
    estimate_screen_size,
    compute_fit_crop,
    apply_cinematic,
)


def _composite_with_homography(
    bg_frame: np.ndarray,
    creative_frame: np.ndarray,
    H: np.ndarray,
    corners: np.ndarray,
    crop_rect: tuple[int, int, int, int],
) -> np.ndarray:
    """Warp creative into the background using a pre-computed homography."""
    h_bg, w_bg = bg_frame.shape[:2]
    cx, cy, cw, ch = crop_rect
    cropped = creative_frame[cy:cy + ch, cx:cx + cw]

    warped = cv2.warpPerspective(
        cropped, H, (w_bg, h_bg),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_TRANSPARENT,
    )

    mask = np.zeros((h_bg, w_bg), dtype=np.uint8)
    cv2.fillConvexPoly(mask, corners.astype(np.int32), 255)

    result = bg_frame.copy()
    mask_3c = cv2.merge([mask, mask, mask])
    result = np.where(mask_3c > 0, warped, result)
    return result


def _apply_glass_and_nits(
    warped: np.ndarray,
    bg_frame: np.ndarray,
    corners: np.ndarray,
    glass_reflectivity: float,
    screen_nits: float,
) -> np.ndarray:
    """Apply glass reflection gradient and nits brightness to the composited region."""
    h_bg, w_bg = bg_frame.shape[:2]

    if glass_reflectivity > 0.01:
        glass = np.zeros((h_bg, w_bg, 3), dtype=np.float32)
        for y in range(h_bg):
            alpha = glass_reflectivity * 0.3 * (1.0 - y / h_bg)
            glass[y] = alpha * 255

        mask = np.zeros((h_bg, w_bg), dtype=np.uint8)
        cv2.fillConvexPoly(mask, corners.astype(np.int32), 255)
        mask_3c = cv2.merge([mask, mask, mask]) > 0

        composited_f = warped.astype(np.float32)
        composited_f[mask_3c] = (composited_f[mask_3c] + glass[mask_3c]).clip(0, 255)
        warped = composited_f.astype(np.uint8)

    nits_scale = screen_nits / 700.0
    if abs(nits_scale - 1.0) > 0.05:
        mask = np.zeros((h_bg, w_bg), dtype=np.uint8)
        cv2.fillConvexPoly(mask, corners.astype(np.int32), 255)
        mask_3c = cv2.merge([mask, mask, mask]) > 0

        scaled = warped.astype(np.float32)
        scaled[mask_3c] = (scaled[mask_3c] * nits_scale).clip(0, 255)
        warped = scaled.astype(np.uint8)

    return warped


def render_stabilized_video(
    location_path: str,
    creative_path: str,
    creative_is_video: bool,
    keyframe_corners: list[dict],
    output_path: str,
    fit_mode: str = "cover",
    glass_reflectivity: float = 0.08,
    screen_nits: float = 700.0,
    vignette: float = 0.15,
    grain: float = 0.06,
    # Stabilization parameters
    optical_flow_alpha: float = 0.4,
    smooth_window: int = 11,
    smooth_polyorder: int = 3,
    homography_alpha: float = 0.2,
    motion_blur_weights: tuple[float, float, float] = (0.15, 0.70, 0.15),
    enable_optical_flow: bool = True,
    enable_motion_blur: bool = True,
) -> Generator[dict, None, None]:
    """
    Full professional stabilization render pipeline.

    Yields progress dicts compatible with the SSE export stream:
        {status, frame, totalFrames, percent, phase, ...}
    """
    # ── Open location video ──────────────────────────────────────────
    loc_cap = cv2.VideoCapture(location_path)
    if not loc_cap.isOpened():
        yield {"status": "error", "message": "Falha ao abrir vídeo de localização"}
        return

    fps = loc_cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(loc_cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(loc_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(loc_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    loc_cap.release()

    # ── Open creative ────────────────────────────────────────────────
    creative_img = None
    creative_cap_test = None
    if creative_is_video:
        creative_cap_test = cv2.VideoCapture(creative_path)
        if not creative_cap_test.isOpened():
            yield {"status": "error", "message": "Falha ao abrir vídeo criativo"}
            return
        creative_cap_test.release()
    else:
        creative_img = cv2.imread(creative_path)
        if creative_img is None:
            yield {"status": "error", "message": "Falha ao abrir imagem criativa"}
            return

    yield {
        "status": "processing",
        "phase": "interpolation",
        "frame": 0,
        "totalFrames": total_frames,
        "percent": 0,
    }

    # ── STEP 1: Keyframe interpolation ───────────────────────────────
    corners_per_frame = interpolate_all_frames(keyframe_corners, total_frames)

    yield {
        "status": "processing",
        "phase": "optical_flow" if enable_optical_flow else "smoothing",
        "frame": 0,
        "totalFrames": total_frames,
        "percent": 5,
    }

    # ── STEP 2: Optical flow refinement ──────────────────────────────
    if enable_optical_flow:
        corners_per_frame = refine_corners_optical_flow(
            location_path, corners_per_frame, blend_alpha=optical_flow_alpha
        )

    yield {
        "status": "processing",
        "phase": "smoothing",
        "frame": 0,
        "totalFrames": total_frames,
        "percent": 15,
    }

    # ── STEP 3: Savitzky-Golay temporal smoothing ────────────────────
    corners_per_frame = smooth_corner_trajectories(
        corners_per_frame,
        window_length=smooth_window,
        polyorder=smooth_polyorder,
    )

    # ── Compute stable screen size from keyframe corners ─────────────
    kf_sizes = []
    for kc in keyframe_corners:
        arr = corners_to_array(kc["corners"])
        kf_sizes.append(estimate_screen_size(arr))
    avg_w = sum(s[0] for s in kf_sizes) / len(kf_sizes) if kf_sizes else 200.0
    avg_h = sum(s[1] for s in kf_sizes) / len(kf_sizes) if kf_sizes else 120.0

    # Get creative dimensions for homography computation
    if creative_img is not None:
        h_cr, w_cr = creative_img.shape[:2]
    else:
        tmp_cap = cv2.VideoCapture(creative_path)
        w_cr = int(tmp_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        h_cr = int(tmp_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        tmp_cap.release()

    # Pre-compute stable crop rect (single value for all frames)
    crop_rect = compute_fit_crop(w_cr, h_cr, avg_w, avg_h, fit_mode)
    _, _, cw, ch = crop_rect

    yield {
        "status": "processing",
        "phase": "homography",
        "frame": 0,
        "totalFrames": total_frames,
        "percent": 20,
    }

    # ── STEP 4: Homography computation + smoothing ───────────────────
    homographies = compute_homography_sequence(
        corners_per_frame, cw, ch
    )
    homographies = smooth_homographies(homographies, alpha=homography_alpha)

    yield {
        "status": "processing",
        "phase": "rendering",
        "frame": 0,
        "totalFrames": total_frames,
        "percent": 25,
    }

    # ── STEP 5 + 6 + 7: Render, motion blur, cinematic ──────────────
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    if not writer.isOpened():
        yield {"status": "error", "message": "Falha ao criar arquivo de saída"}
        return

    loc_cap = cv2.VideoCapture(location_path)
    creative_cap = None
    if creative_is_video:
        creative_cap = cv2.VideoCapture(creative_path)

    # Motion blur needs a 1-frame lookahead, so we use a small buffer
    prev_composited: np.ndarray | None = None
    current_composited: np.ndarray | None = None
    pending_write: np.ndarray | None = None
    pending_frame_idx: int = -1

    def _composite_one(frame_idx: int, bg: np.ndarray, cr: np.ndarray) -> np.ndarray:
        """Composite a single frame using the stabilized pipeline."""
        H = homographies[frame_idx]
        corners = corners_per_frame[frame_idx]
        if H is None or corners is None:
            return bg

        result = _composite_with_homography(bg, cr, H, corners, crop_rect)
        result = _apply_glass_and_nits(
            result, bg, corners, glass_reflectivity, screen_nits
        )
        return result

    for frame_idx in range(total_frames):
        ret, bg_frame = loc_cap.read()
        if not ret:
            break

        # Get creative frame
        if creative_cap:
            ret_c, cr_frame = creative_cap.read()
            if not ret_c:
                creative_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret_c, cr_frame = creative_cap.read()
                if not ret_c:
                    cr_frame = np.zeros((height, width, 3), dtype=np.uint8)
        else:
            cr_frame = creative_img

        # Composite this frame
        composited = _composite_one(frame_idx, bg_frame, cr_frame)

        # Motion blur pipeline (1-frame delay)
        if enable_motion_blur:
            if pending_write is not None:
                # Now we have prev, current (pending), and next (composited)
                blurred = apply_motion_blur_streaming(
                    prev_composited, pending_write, composited,
                    weights=motion_blur_weights,
                )
                if vignette > 0.01 or grain > 0.01:
                    blurred = apply_cinematic(
                        blurred, vignette=vignette, grain=grain,
                        frame_idx=pending_frame_idx,
                    )
                writer.write(blurred)

            prev_composited = pending_write
            pending_write = composited
            pending_frame_idx = frame_idx
        else:
            if vignette > 0.01 or grain > 0.01:
                composited = apply_cinematic(
                    composited, vignette=vignette, grain=grain,
                    frame_idx=frame_idx,
                )
            writer.write(composited)

        # Progress (rendering is 25% → 100%)
        if frame_idx % 10 == 0 or frame_idx == total_frames - 1:
            pct = 25 + round((frame_idx + 1) / total_frames * 75, 1)
            yield {
                "status": "processing",
                "phase": "rendering",
                "frame": frame_idx + 1,
                "totalFrames": total_frames,
                "percent": min(pct, 99),
            }

    # Flush last pending frame (motion blur)
    if enable_motion_blur and pending_write is not None:
        blurred = apply_motion_blur_streaming(
            prev_composited, pending_write, None,
            weights=motion_blur_weights,
        )
        if vignette > 0.01 or grain > 0.01:
            blurred = apply_cinematic(
                blurred, vignette=vignette, grain=grain,
                frame_idx=pending_frame_idx,
            )
        writer.write(blurred)

    writer.release()
    loc_cap.release()
    if creative_cap:
        creative_cap.release()

    file_size = Path(output_path).stat().st_size if Path(output_path).exists() else 0

    yield {
        "status": "done",
        "frame": total_frames,
        "totalFrames": total_frames,
        "percent": 100,
        "outputPath": output_path,
        "fileSize": file_size,
    }
