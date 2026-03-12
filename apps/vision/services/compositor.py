"""
Video compositor service.

Takes a location video + creative (image or video) + keyframe corners,
interpolates corners per-frame, warps the creative into the screen quad
via perspective transform, and encodes the result as MP4.
"""

import cv2
import numpy as np
from pathlib import Path
from typing import Generator
from scipy.ndimage import uniform_filter1d


def interpolate_corners(
    keyframe_corners: list[dict],
    frame_index: int,
) -> np.ndarray | None:
    """
    Linearly interpolate 4 screen corners at a given frame index.
    keyframe_corners: sorted list of {frameIndex, corners: [{x,y}×4]}
    Returns 4×2 float32 array or None.
    """
    if not keyframe_corners:
        return None
    if len(keyframe_corners) == 1:
        return _corners_to_array(keyframe_corners[0]["corners"])

    first = keyframe_corners[0]
    last = keyframe_corners[-1]

    if frame_index <= first["frameIndex"]:
        return _corners_to_array(first["corners"])
    if frame_index >= last["frameIndex"]:
        return _corners_to_array(last["corners"])

    # Find surrounding keyframes
    before = first
    after = keyframe_corners[1]
    for i in range(len(keyframe_corners) - 1):
        if keyframe_corners[i]["frameIndex"] <= frame_index <= keyframe_corners[i + 1]["frameIndex"]:
            before = keyframe_corners[i]
            after = keyframe_corners[i + 1]
            break

    span = after["frameIndex"] - before["frameIndex"]
    t = (frame_index - before["frameIndex"]) / span if span > 0 else 0.0

    c_before = _corners_to_array(before["corners"])
    c_after = _corners_to_array(after["corners"])
    return c_before + t * (c_after - c_before)


def _corners_to_array(corners: list[dict]) -> np.ndarray:
    return np.array([[c["x"], c["y"]] for c in corners], dtype=np.float32)


def compute_fit_crop(
    creative_w: int, creative_h: int,
    screen_w: float, screen_h: float,
    fit_mode: str = "cover",
) -> tuple[int, int, int, int]:
    """
    Compute the source crop rect (x, y, w, h) within the creative
    to fit the screen aspect ratio using cover/contain.
    """
    screen_aspect = screen_w / screen_h if screen_h > 0 else 1.0
    creative_aspect = creative_w / creative_h if creative_h > 0 else 1.0

    if fit_mode == "cover":
        if creative_aspect > screen_aspect:
            # Creative wider — crop sides
            new_w = int(creative_h * screen_aspect)
            x = (creative_w - new_w) // 2
            return x, 0, new_w, creative_h
        else:
            # Creative taller — crop top/bottom
            new_h = int(creative_w / screen_aspect)
            y = (creative_h - new_h) // 2
            return 0, y, creative_w, new_h
    else:  # contain
        if creative_aspect > screen_aspect:
            new_h = int(creative_w / screen_aspect)
            y = (creative_h - new_h) // 2
            return 0, max(0, y), creative_w, min(new_h, creative_h)
        else:
            new_w = int(creative_h * screen_aspect)
            x = (creative_w - new_w) // 2
            return max(0, x), 0, min(new_w, creative_w), creative_h


def estimate_screen_size(corners: np.ndarray) -> tuple[float, float]:
    """Estimate screen width/height from the 4 corners (TL, TR, BR, BL)."""
    tl, tr, br, bl = corners
    w = (np.linalg.norm(tr - tl) + np.linalg.norm(br - bl)) / 2
    h = (np.linalg.norm(bl - tl) + np.linalg.norm(br - tr)) / 2
    return float(w), float(h)


def composite_frame(
    bg_frame: np.ndarray,
    creative_frame: np.ndarray,
    corners: np.ndarray,
    fit_mode: str = "cover",
    glass_reflectivity: float = 0.08,
    screen_nits: float = 700.0,
    stable_screen_size: tuple[float, float] | None = None,
) -> np.ndarray:
    """
    Composite the creative onto a single background frame using perspective warp.
    corners: 4×2 float32 array [TL, TR, BR, BL].
    stable_screen_size: if provided, use this (w, h) instead of estimating per-frame.
    """
    h_bg, w_bg = bg_frame.shape[:2]
    h_cr, w_cr = creative_frame.shape[:2]

    # Use stable screen size if provided, otherwise estimate from corners
    if stable_screen_size is not None:
        screen_w, screen_h = stable_screen_size
    else:
        screen_w, screen_h = estimate_screen_size(corners)

    # Crop creative to fit screen aspect
    cx, cy, cw, ch = compute_fit_crop(w_cr, h_cr, screen_w, screen_h, fit_mode)
    cropped = creative_frame[cy:cy+ch, cx:cx+cw]

    # Source corners (creative crop rect)
    src_pts = np.array([
        [0, 0],
        [cw, 0],
        [cw, ch],
        [0, ch],
    ], dtype=np.float32)

    # Destination corners (screen quad in background)
    dst_pts = corners.astype(np.float32)

    # Perspective transform
    M = cv2.getPerspectiveTransform(src_pts, dst_pts)
    warped = cv2.warpPerspective(
        cropped, M, (w_bg, h_bg),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_TRANSPARENT,
    )

    # Create a mask from the warped region
    mask = np.zeros((h_bg, w_bg), dtype=np.uint8)
    cv2.fillConvexPoly(mask, dst_pts.astype(np.int32), 255)

    # Glass reflection overlay (subtle gradient)
    if glass_reflectivity > 0.01:
        glass = np.zeros_like(warped, dtype=np.float32)
        # Simple top-to-bottom gradient
        for y in range(h_bg):
            alpha = glass_reflectivity * 0.3 * (1.0 - y / h_bg)
            glass[y] = alpha * 255
        warped = cv2.addWeighted(
            warped.astype(np.float32), 1.0,
            glass, 1.0, 0
        ).clip(0, 255).astype(np.uint8)

    # Brightness adjustment (nits simulation)
    nits_scale = screen_nits / 700.0
    if abs(nits_scale - 1.0) > 0.05:
        warped_f = warped.astype(np.float32) * nits_scale
        warped = warped_f.clip(0, 255).astype(np.uint8)

    # Composite: replace background within mask
    result = bg_frame.copy()
    mask_3c = cv2.merge([mask, mask, mask])
    result = np.where(mask_3c > 0, warped, result)

    return result


def apply_cinematic(
    frame: np.ndarray,
    vignette: float = 0.15,
    grain: float = 0.06,
    frame_idx: int = 0,
) -> np.ndarray:
    """Apply lightweight cinematic post-processing."""
    h, w = frame.shape[:2]
    result = frame.astype(np.float32)

    # Vignette
    if vignette > 0.01:
        Y, X = np.ogrid[:h, :w]
        cx, cy = w / 2, h / 2
        r = np.sqrt((X - cx) ** 2 + (Y - cy) ** 2)
        max_r = np.sqrt(cx ** 2 + cy ** 2)
        falloff = 1.0 - vignette * 0.6 * np.clip((r / max_r - 0.35) / 0.65, 0, 1)
        result *= falloff[..., np.newaxis]

    # Film grain (seeded per-frame for temporal coherence)
    if grain > 0.01:
        rng = np.random.RandomState(frame_idx)
        noise = rng.normal(0, grain * 25, result.shape).astype(np.float32)
        result += noise

    return result.clip(0, 255).astype(np.uint8)


def _smooth_corner_trajectories(
    all_corners: list[np.ndarray],
    window: int = 5,
) -> list[np.ndarray]:
    """
    Apply temporal smoothing to corner trajectories.
    Uses a uniform (moving-average) filter across frames to eliminate jitter.
    """
    if len(all_corners) < 3:
        return all_corners

    # Stack into (N, 4, 2) array
    stacked = np.array(all_corners)  # shape: (N, 4, 2)
    smoothed = np.empty_like(stacked)

    # Smooth each corner coordinate independently
    for corner_idx in range(4):
        for coord_idx in range(2):
            trajectory = stacked[:, corner_idx, coord_idx]
            smoothed[:, corner_idx, coord_idx] = uniform_filter1d(
                trajectory, size=window, mode='nearest'
            )

    return [smoothed[i].astype(np.float32) for i in range(len(all_corners))]


def composite_video(
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
) -> Generator[dict, None, None]:
    """
    Composite creative onto location video frame-by-frame.
    Yields progress dicts: {frame, totalFrames, percent, status}
    Final yield has status='done' with the output path.
    """
    loc_cap = cv2.VideoCapture(location_path)
    if not loc_cap.isOpened():
        yield {"status": "error", "message": "Falha ao abrir vídeo de localização"}
        return

    fps = loc_cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(loc_cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(loc_cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(loc_cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    # Open creative
    creative_img = None
    creative_cap = None
    if creative_is_video:
        creative_cap = cv2.VideoCapture(creative_path)
        if not creative_cap.isOpened():
            loc_cap.release()
            yield {"status": "error", "message": "Falha ao abrir vídeo criativo"}
            return
    else:
        creative_img = cv2.imread(creative_path)
        if creative_img is None:
            loc_cap.release()
            yield {"status": "error", "message": "Falha ao abrir imagem criativa"}
            return

    # Output writer
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    if not writer.isOpened():
        loc_cap.release()
        if creative_cap:
            creative_cap.release()
        yield {"status": "error", "message": "Falha ao criar arquivo de saída"}
        return

    yield {"status": "started", "frame": 0, "totalFrames": total_frames, "percent": 0}

    # Pre-compute and smooth all corners to eliminate jitter
    all_corners: list[np.ndarray | None] = []
    for i in range(total_frames):
        all_corners.append(interpolate_corners(keyframe_corners, i))

    # Separate valid corners for smoothing
    valid_indices = [i for i, c in enumerate(all_corners) if c is not None]
    if valid_indices:
        valid_corners = [all_corners[i] for i in valid_indices]
        smoothed = _smooth_corner_trajectories(valid_corners, window=5)
        for idx, vi in enumerate(valid_indices):
            all_corners[vi] = smoothed[idx]

    # Compute a stable screen size from the average of all keyframe corners
    # to prevent crop rect jitter from frame-to-frame size estimation
    stable_screen_size = None
    kf_sizes = []
    for kc in keyframe_corners:
        arr = _corners_to_array(kc["corners"])
        kf_sizes.append(estimate_screen_size(arr))
    if kf_sizes:
        avg_w = sum(s[0] for s in kf_sizes) / len(kf_sizes)
        avg_h = sum(s[1] for s in kf_sizes) / len(kf_sizes)
        stable_screen_size = (avg_w, avg_h)

    for frame_idx in range(total_frames):
        ret, bg_frame = loc_cap.read()
        if not ret:
            break

        # Get creative frame
        if creative_cap:
            ret_c, cr_frame = creative_cap.read()
            if not ret_c:
                # Loop creative video
                creative_cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret_c, cr_frame = creative_cap.read()
                if not ret_c:
                    cr_frame = np.zeros((height, width, 3), dtype=np.uint8)
        else:
            cr_frame = creative_img

        corners = all_corners[frame_idx]

        if corners is not None:
            # Composite
            result = composite_frame(
                bg_frame, cr_frame, corners,
                fit_mode=fit_mode,
                glass_reflectivity=glass_reflectivity,
                screen_nits=screen_nits,
                stable_screen_size=stable_screen_size,
            )
            # Cinematic
            if vignette > 0.01 or grain > 0.01:
                result = apply_cinematic(result, vignette=vignette, grain=grain, frame_idx=frame_idx)
        else:
            result = bg_frame

        writer.write(result)

        # Report progress every 10 frames
        if frame_idx % 10 == 0 or frame_idx == total_frames - 1:
            pct = round((frame_idx + 1) / total_frames * 100, 1)
            yield {
                "status": "processing",
                "frame": frame_idx + 1,
                "totalFrames": total_frames,
                "percent": pct,
            }

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
