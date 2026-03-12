"""
Professional VFX-grade screen replacement pipeline — dense planar grid tracking.

Pipeline (Mocha Pro / Nuke style):

  1. Keyframe interpolation → dense corners per frame
  2. Generate canonical NxN feature grid
  3. Dense optical-flow tracking (frame-to-frame LK with fwd/bwd check)
  4. RANSAC homography estimation (frame → canonical) per frame
  5. ECC sub-pixel refinement (optional)
  6. Re-anchoring to keyframes (drift prevention)
  7. Homography parameter smoothing (Savitzky-Golay or EMA)
  8. For each frame:
     a. Composite creative in canonical (stabilized) space
     b. Reproject canonical → original frame (2×–4× supersample)
     c. Apply motion-vector-aligned blur
     d. Apply cinematic post (vignette + grain)
  9. Encode to MP4

Yields SSE-compatible progress dicts.
"""

from __future__ import annotations

import cv2
import numpy as np
from pathlib import Path
from typing import Generator

from tracking.interpolate_keyframes import interpolate_all_frames, corners_to_array
from tracking.feature_tracker import track_all_frames_grid
from tracking.homography_estimator import (
    estimate_homographies_from_grid,
    smooth_homography_params,
)
from tracking.ecc_refine import refine_homography_sequence_ecc
from tracking.stabilize_plane import reanchor_homographies
from tracking.smoothing import smooth_corner_trajectories
from compositor.canonical_compositor import composite_in_canonical
from compositor.reproject_to_frame import reproject_and_blend
from post.motion_blur import apply_directional_motion_blur
from services.compositor import apply_cinematic, estimate_screen_size


def _determine_canonical_size(
    keyframe_corners: list[dict],
    min_dim: int = 480,
) -> tuple[int, int]:
    """
    Determine canonical screen canvas size from the average keyframe
    screen dimensions.
    """
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

    # Even dimensions (required by some codecs)
    cw += cw % 2
    ch += ch % 2
    return (cw, ch)


def render_screen_replace(
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
    # ── Grid tracking ────────────────────────────────────────────
    grid_size: int = 20,
    fb_threshold: float = 1.0,
    min_points_ratio: float = 0.25,
    reinit_interval: int = 30,
    ransac_threshold: float = 2.0,
    # ── ECC ──────────────────────────────────────────────────────
    enable_ecc: bool = True,
    # ── Smoothing ────────────────────────────────────────────────
    smooth_window: int = 11,
    smooth_polyorder: int = 3,
    ema_alpha: float = 0.0,
    corner_smooth_window: int = 11,
    # ── Re-anchoring ─────────────────────────────────────────────
    reanchor_interval: int = 30,
    confidence_threshold: float = 0.4,
    # ── Quality ──────────────────────────────────────────────────
    supersample: int = 2,
    bloom_strength: float = 0.05,
    softness: float = 0.3,
    edge_feather: int = 3,
    # ── Motion blur ──────────────────────────────────────────────
    enable_motion_blur: bool = True,
    motion_blur_strength: float = 0.35,
    # ── Debug ────────────────────────────────────────────────────
    enable_debug: bool = False,
) -> Generator[dict, None, None]:
    """
    Full dense-grid planar tracking pipeline.

    Pipeline: grid track → RANSAC → ECC → re-anchor → smooth →
              canonical composite → reproject → motion blur → encode.

    Yields SSE progress dicts:
        {status, phase, frame, totalFrames, percent}
    """
    # ── Validate inputs ──────────────────────────────────────────
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

    # ── STEP 1: Keyframe interpolation ───────────────────────────
    corners_per_frame = interpolate_all_frames(keyframe_corners, total_frames)

    # Pre-smooth corners for better grid initialisation
    corners_per_frame = smooth_corner_trajectories(
        corners_per_frame,
        window_length=corner_smooth_window,
        polyorder=min(smooth_polyorder, corner_smooth_window - 2),
    )

    yield {
        "status": "processing", "phase": "grid_tracking",
        "frame": 0, "totalFrames": total_frames, "percent": 5,
    }

    # ── STEP 2+3: Dense grid tracking (generate grid + LK flow) ─
    tracking_data = track_all_frames_grid(
        location_path,
        corners_per_frame,
        canonical_size,
        grid_size=grid_size,
        fb_threshold=fb_threshold,
        min_points_ratio=min_points_ratio,
        reinit_interval=reinit_interval,
    )

    yield {
        "status": "processing", "phase": "homography",
        "frame": 0, "totalFrames": total_frames, "percent": 20,
    }

    # ── STEP 4: RANSAC homography estimation ─────────────────────
    homographies_to_canon, confidences = estimate_homographies_from_grid(
        tracking_data, corners_per_frame, canonical_size, ransac_threshold,
    )

    yield {
        "status": "processing", "phase": "ecc_refine",
        "frame": 0, "totalFrames": total_frames, "percent": 30,
    }

    # ── STEP 5: ECC sub-pixel refinement ─────────────────────────
    ecc_success_list: list[bool] = [False] * total_frames
    if enable_ecc:
        homographies_to_canon, ecc_success_list = refine_homography_sequence_ecc(
            location_path, homographies_to_canon, corners_per_frame,
            canonical_size,
        )

    yield {
        "status": "processing", "phase": "reanchor",
        "frame": 0, "totalFrames": total_frames, "percent": 38,
    }

    # ── STEP 6: Re-anchoring ─────────────────────────────────────
    homographies_to_canon = reanchor_homographies(
        homographies_to_canon, confidences, keyframe_corners,
        canonical_size, confidence_threshold, reanchor_interval,
    )

    yield {
        "status": "processing", "phase": "smoothing",
        "frame": 0, "totalFrames": total_frames, "percent": 42,
    }

    # ── STEP 7: Temporal smoothing ───────────────────────────────
    homographies_to_canon = smooth_homography_params(
        homographies_to_canon,
        window_length=smooth_window,
        polyorder=smooth_polyorder,
        ema_alpha=ema_alpha,
    )

    # Compute inverse homographies (canonical → frame)
    homographies_from_canon: list[np.ndarray | None] = []
    for H in homographies_to_canon:
        if H is not None:
            try:
                homographies_from_canon.append(np.linalg.inv(H))
            except np.linalg.LinAlgError:
                homographies_from_canon.append(None)
        else:
            homographies_from_canon.append(None)

    yield {
        "status": "processing", "phase": "rendering",
        "frame": 0, "totalFrames": total_frames, "percent": 45,
    }

    # ── STEP 8: Render loop ──────────────────────────────────────
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

    prev_tracking = None  # for debug flow vectors

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
                    cr_frame = np.zeros((vid_h, vid_w, 3), dtype=np.uint8)
        else:
            cr_frame = creative_img

        H_to = homographies_to_canon[frame_idx]
        H_from = homographies_from_canon[frame_idx]

        if H_to is None or H_from is None:
            result = bg_frame
        else:
            # (a) Composite creative in canonical space
            canonical_comp = composite_in_canonical(
                canonical_bg=None,
                creative_frame=cr_frame,
                canonical_size=canonical_size,
                fit_mode=fit_mode,
                glass_reflectivity=glass_reflectivity,
                screen_nits=screen_nits,
                bloom_strength=bloom_strength,
                softness=softness,
            )

            # (b) Reproject canonical → original frame
            result = reproject_and_blend(
                bg_frame, canonical_comp, H_from,
                supersample=supersample,
                edge_feather=edge_feather,
            )

            # (c) Motion-vector-aligned blur
            if enable_motion_blur and frame_idx > 0:
                H_prev = homographies_to_canon[frame_idx - 1]
                result = apply_directional_motion_blur(
                    result, H_prev, H_to,
                    strength=motion_blur_strength,
                )

        # (d) Cinematic post-processing
        if vignette > 0.01 or grain > 0.01:
            result = apply_cinematic(
                result, vignette=vignette, grain=grain,
                frame_idx=frame_idx,
            )

        writer.write(result)

        # ── Debug output ─────────────────────────────────────────
        if debug_writer is not None and enable_debug:
            from debug.visualize import compose_debug_frame, create_canonical_preview

            corners = corners_per_frame[frame_idx] if frame_idx < len(corners_per_frame) else None
            conf = confidences[frame_idx] if frame_idx < len(confidences) else 0.0
            ecc_ok = ecc_success_list[frame_idx] if frame_idx < len(ecc_success_list) else False

            td = tracking_data[frame_idx] if frame_idx < len(tracking_data) else None
            frame_pts = td.frame_pts if td else None
            inlier_mask = td.inlier_mask if td else None
            num_tracked = td.num_tracked if td else 0
            prev_pts = prev_tracking.frame_pts if prev_tracking and prev_tracking.frame_pts is not None else None

            H_prev_dbg = homographies_to_canon[frame_idx - 1] if frame_idx > 0 else None

            canon_prev = None
            if H_to is not None:
                try:
                    canon_prev = create_canonical_preview(canonical_comp, target_height=180)
                except Exception:
                    pass

            debug_frame = compose_debug_frame(
                bg_frame,
                corners=corners,
                frame_pts=frame_pts,
                prev_pts=prev_pts,
                inlier_mask=inlier_mask,
                confidence=conf,
                H_prev=H_prev_dbg,
                H_curr=H_to,
                canonical_preview=canon_prev,
                ecc_success=ecc_ok,
                num_tracked=num_tracked,
            )
            debug_writer.write(debug_frame)
            prev_tracking = td

        # ── Progress ─────────────────────────────────────────────
        if frame_idx % 10 == 0 or frame_idx == total_frames - 1:
            pct = 45 + round((frame_idx + 1) / total_frames * 55, 1)
            yield {
                "status": "processing",
                "phase": "rendering",
                "frame": frame_idx + 1,
                "totalFrames": total_frames,
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
