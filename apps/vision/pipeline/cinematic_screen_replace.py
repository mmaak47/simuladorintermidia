"""
Cinematic screen replacement pipeline — the definitive VFX-grade workflow.

Replaces the legacy services/video_screen_replace.py with a clean,
modular architecture inspired by Mocha Pro / After Effects / Nuke
planar-tracking pipelines.

Primary pipeline (8 phases):

    1. Interpolate keyframe corners → dense per-frame corners
    2. Pre-smooth corners for stable grid initialisation
    3. Dense planar grid tracking  (20×20 grid + supplemental features)
    4. RANSAC homography estimation with confidence metrics
    5. ECC sub-pixel refinement
    6. Drift detection and re-anchoring to keyframes
    7. QR-decomposition-based transform smoothing
    8. Per-frame rendering:
       a. Fit creative to canonical screen  (cover / contain)
       b. Apply display realism simulation  (7 layers)
       c. Reproject to frame with 2×+ supersample
       d. Directional motion blur
       e. Hollywood cinematic finishing

Yields SSE-compatible progress dicts for real-time client updates.
"""

from __future__ import annotations

import cv2
import numpy as np
from pathlib import Path
from typing import Generator

from tracking.interpolate_keyframes import interpolate_all_frames, corners_to_array
from tracking.smoothing import smooth_corner_trajectories
from tracking.optical_flow import track_full_sequence
from tracking.homography_ransac import estimate_sequence_homographies
from tracking.ecc_refine import refine_homography_sequence_ecc
from tracking.drift_control import reanchor
from tracking.transform_smoothing import smooth_transforms

from compositor.creative_fit import fit_creative_to_screen
from compositor.display_realism import apply_display_realism
from compositor.reprojection import reproject_to_frame

from post.cinematic_finish import apply_cinematic_finish
from post.motion_blur import apply_directional_motion_blur

from services.compositor import estimate_screen_size


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _determine_canonical_size(
    keyframe_corners: list[dict],
    min_dim: int = 480,
) -> tuple[int, int]:
    """Derive canonical canvas (w, h) from keyframe geometry."""
    if not keyframe_corners:
        return (1080, 1920)

    sizes = []
    for kc in keyframe_corners:
        arr = corners_to_array(kc["corners"])
        w, h = estimate_screen_size(arr)
        sizes.append((w, h))

    avg_w = sum(s[0] for s in sizes) / len(sizes)
    avg_h = sum(s[1] for s in sizes) / len(sizes)

    scale = max(min_dim / min(avg_w, avg_h), 1.0)
    cw = int(round(avg_w * scale))
    ch = int(round(avg_h * scale))
    # Ensure even dimensions for video encoding
    cw += cw % 2
    ch += ch % 2
    return (cw, ch)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def render_cinematic_screen_replace(
    location_path: str,
    creative_path: str,
    creative_is_video: bool,
    keyframe_corners: list[dict],
    output_path: str,
    # --- Display realism ---
    fit_mode: str = "cover",
    screen_nits: float = 700.0,
    display_gamma: float = 1.0,
    glass_reflectivity: float = 0.06,
    led_softness: float = 0.3,
    bloom_display: float = 0.04,
    # --- Grid tracking ---
    grid_size: int = 20,
    fb_threshold: float = 1.0,
    min_points_ratio: float = 0.25,
    reinit_interval: int = 30,
    supplement_features: bool = True,
    # --- RANSAC ---
    ransac_threshold: float = 2.0,
    # --- ECC ---
    enable_ecc: bool = True,
    # --- Drift control ---
    reanchor_interval: int = 30,
    confidence_threshold: float = 0.4,
    reanchor_blend: float = 0.7,
    # --- Smoothing ---
    smooth_method: str = "savgol",
    smooth_window: int = 11,
    smooth_polyorder: int = 3,
    ema_alpha: float = 0.6,
    corner_smooth_window: int = 11,
    # --- Quality ---
    supersample: int = 2,
    edge_feather: int = 3,
    # --- Cinematic finishing ---
    vignette: float = 0.12,
    grain: float = 0.04,
    bloom_finish: float = 0.03,
    chromatic_aberration: float = 0.0,
    highlight_compression: float = 0.3,
    # --- Motion blur ---
    enable_motion_blur: bool = True,
    motion_blur_strength: float = 0.35,
    # --- Debug ---
    enable_debug: bool = False,
) -> Generator[dict, None, None]:
    """
    Full cinematic screen-replacement pipeline.

    Yields dicts with keys: status, phase, frame, totalFrames, percent.
    Final dict has status='done', outputPath, fileSize.
    """
    # ------------------------------------------------------------------
    # Validate inputs
    # ------------------------------------------------------------------
    loc_cap = cv2.VideoCapture(location_path)
    if not loc_cap.isOpened():
        yield {"status": "error", "message": "Falha ao abrir vídeo de localização"}
        return

    fps = loc_cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(loc_cap.get(cv2.CAP_PROP_FRAME_COUNT))
    vid_w = int(loc_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    vid_h = int(loc_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    loc_cap.release()

    creative_img = None
    if creative_is_video:
        cap_test = cv2.VideoCapture(creative_path)
        if not cap_test.isOpened():
            yield {"status": "error", "message": "Falha ao abrir vídeo criativo"}
            return
        cap_test.release()
    else:
        creative_img = cv2.imread(creative_path)
        if creative_img is None:
            yield {"status": "error", "message": "Falha ao abrir imagem criativa"}
            return

    canonical_size = _determine_canonical_size(keyframe_corners)

    yield {
        "status": "processing", "phase": "interpolation",
        "frame": 0, "totalFrames": total_frames, "percent": 0,
    }

    # ------------------------------------------------------------------
    # Phase 1+2: Keyframe interpolation + corner pre-smoothing
    # ------------------------------------------------------------------
    corners_per_frame = interpolate_all_frames(keyframe_corners, total_frames)
    corners_per_frame = smooth_corner_trajectories(
        corners_per_frame,
        window_length=corner_smooth_window,
        polyorder=min(smooth_polyorder, max(1, corner_smooth_window - 2)),
    )

    yield {
        "status": "processing", "phase": "grid_tracking",
        "frame": 0, "totalFrames": total_frames, "percent": 5,
    }

    # ------------------------------------------------------------------
    # Phase 3: Dense planar grid tracking
    # ------------------------------------------------------------------
    tracking_data = track_full_sequence(
        location_path, corners_per_frame, canonical_size,
        grid_size=grid_size,
        fb_threshold=fb_threshold,
        min_points_ratio=min_points_ratio,
        reinit_interval=reinit_interval,
        supplement_features=supplement_features,
    )

    yield {
        "status": "processing", "phase": "homography",
        "frame": 0, "totalFrames": total_frames, "percent": 20,
    }

    # ------------------------------------------------------------------
    # Phase 4: RANSAC homography estimation
    # ------------------------------------------------------------------
    homographies, confidences, reproj_errors = estimate_sequence_homographies(
        tracking_data, corners_per_frame, canonical_size, ransac_threshold,
    )

    yield {
        "status": "processing", "phase": "ecc_refine",
        "frame": 0, "totalFrames": total_frames, "percent": 30,
    }

    # ------------------------------------------------------------------
    # Phase 5: ECC sub-pixel refinement
    # ------------------------------------------------------------------
    ecc_success = [False] * total_frames
    if enable_ecc:
        homographies, ecc_success = refine_homography_sequence_ecc(
            location_path, homographies, corners_per_frame, canonical_size,
        )

    yield {
        "status": "processing", "phase": "drift_control",
        "frame": 0, "totalFrames": total_frames, "percent": 38,
    }

    # ------------------------------------------------------------------
    # Phase 6: Drift control / re-anchoring
    # ------------------------------------------------------------------
    homographies = reanchor(
        homographies, confidences, keyframe_corners, canonical_size,
        confidence_threshold, reanchor_interval, reanchor_blend,
    )

    yield {
        "status": "processing", "phase": "smoothing",
        "frame": 0, "totalFrames": total_frames, "percent": 42,
    }

    # ------------------------------------------------------------------
    # Phase 7: Transform decomposition + temporal smoothing
    # ------------------------------------------------------------------
    homographies = smooth_transforms(
        homographies,
        method=smooth_method,
        window_length=smooth_window,
        polyorder=smooth_polyorder,
        ema_alpha=ema_alpha,
    )

    # Pre-compute inverse homographies (canonical → frame)
    H_inv_list: list[np.ndarray | None] = []
    for H in homographies:
        if H is not None:
            try:
                H_inv_list.append(np.linalg.inv(H))
            except np.linalg.LinAlgError:
                H_inv_list.append(None)
        else:
            H_inv_list.append(None)

    yield {
        "status": "processing", "phase": "rendering",
        "frame": 0, "totalFrames": total_frames, "percent": 45,
    }

    # ------------------------------------------------------------------
    # Phase 8: Per-frame rendering
    # ------------------------------------------------------------------
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (vid_w, vid_h))
    if not writer.isOpened():
        yield {"status": "error", "message": "Falha ao criar arquivo de saída"}
        return

    debug_writer = None
    if enable_debug:
        debug_path = str(Path(output_path).with_suffix("")) + "_debug.mp4"
        debug_writer = cv2.VideoWriter(debug_path, fourcc, fps, (vid_w, vid_h))

    loc_cap = cv2.VideoCapture(location_path)
    creative_cap = None
    if creative_is_video:
        creative_cap = cv2.VideoCapture(creative_path)

    for frame_idx in range(total_frames):
        ret, bg_frame = loc_cap.read()
        if not ret:
            break

        # --- Creative frame ---
        if creative_cap:
            ret_c, cr_frame = creative_cap.read()
            if not ret_c:
                creative_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret_c, cr_frame = creative_cap.read()
                if not ret_c:
                    cr_frame = np.zeros((vid_h, vid_w, 3), dtype=np.uint8)
        else:
            cr_frame = creative_img

        H_to = homographies[frame_idx]
        H_from = H_inv_list[frame_idx]

        if H_to is None or H_from is None:
            result = bg_frame
        else:
            # (a) Fit creative to canonical screen
            canonical_creative = fit_creative_to_screen(
                cr_frame, canonical_size, fit_mode,
            )

            # (b) Apply display realism simulation
            canonical_comp = apply_display_realism(
                canonical_creative,
                mode="cinematic",
                screen_nits=screen_nits,
                gamma=display_gamma,
                bloom_strength=bloom_display,
                led_softness=led_softness,
                glass_reflectivity=glass_reflectivity,
            )

            # (c) Reproject to frame with supersample + edge feathering
            result = reproject_to_frame(
                bg_frame, canonical_comp, H_from,
                supersample=supersample,
                edge_feather=edge_feather,
            )

            # (d) Directional motion blur
            if enable_motion_blur and frame_idx > 0:
                H_prev = homographies[frame_idx - 1]
                result = apply_directional_motion_blur(
                    result, H_prev, H_to,
                    strength=motion_blur_strength,
                )

        # (e) Cinematic finishing (applied to every frame for consistency)
        result = apply_cinematic_finish(
            result,
            vignette=vignette,
            grain_strength=grain,
            bloom_strength=bloom_finish,
            chromatic_aberration=chromatic_aberration,
            highlight_compression=highlight_compression,
            frame_idx=frame_idx,
        )

        writer.write(result)

        # --- Debug overlay ---
        if debug_writer is not None and enable_debug:
            _write_debug_frame(
                debug_writer, bg_frame, frame_idx,
                corners_per_frame, tracking_data, homographies,
                confidences, ecc_success, canonical_comp if H_to is not None else None,
                canonical_size,
            )

        # SSE progress (every 10 frames)
        if frame_idx % 10 == 0 or frame_idx == total_frames - 1:
            pct = 45 + round((frame_idx + 1) / total_frames * 55, 1)
            yield {
                "status": "processing", "phase": "rendering",
                "frame": frame_idx + 1, "totalFrames": total_frames,
                "percent": min(pct, 99),
            }

    writer.release()
    loc_cap.release()
    if creative_cap:
        creative_cap.release()
    if debug_writer:
        debug_writer.release()

    file_size = Path(output_path).stat().st_size if Path(output_path).exists() else 0

    yield {
        "status": "done",
        "frame": total_frames,
        "totalFrames": total_frames,
        "percent": 100,
        "outputPath": output_path,
        "fileSize": file_size,
    }


# ---------------------------------------------------------------------------
# Debug helper
# ---------------------------------------------------------------------------

def _write_debug_frame(
    debug_writer,
    bg_frame,
    frame_idx,
    corners_per_frame,
    tracking_data,
    homographies,
    confidences,
    ecc_success,
    canonical_comp,
    canonical_size,
):
    """Compose and write a debug overlay frame."""
    try:
        from debug.visualize import compose_debug_frame, create_canonical_preview

        corners = corners_per_frame[frame_idx] if frame_idx < len(corners_per_frame) else None
        conf = confidences[frame_idx] if frame_idx < len(confidences) else 0.0
        ecc_ok = ecc_success[frame_idx] if frame_idx < len(ecc_success) else False

        td = tracking_data[frame_idx] if frame_idx < len(tracking_data) else None
        frame_pts = td.frame_pts if td and td.frame_pts is not None else None
        inlier_mask = td.inlier_mask if td else None
        num_tracked = td.num_tracked if td else 0

        H_curr = homographies[frame_idx] if frame_idx < len(homographies) else None
        H_prev = homographies[frame_idx - 1] if frame_idx > 0 else None

        canon_prev = None
        if canonical_comp is not None:
            try:
                canon_prev = create_canonical_preview(canonical_comp, target_height=180)
            except Exception:
                pass

        debug_frame = compose_debug_frame(
            bg_frame,
            corners=corners,
            frame_pts=frame_pts,
            prev_pts=None,
            inlier_mask=inlier_mask,
            confidence=conf,
            H_prev=H_prev,
            H_curr=H_curr,
            canonical_preview=canon_prev,
            ecc_success=ecc_ok,
            num_tracked=num_tracked,
        )
        debug_writer.write(debug_frame)

    except Exception:
        debug_writer.write(bg_frame)
