"""
Export router — image (PNG) and video (MP4) export endpoints.
Video export uses SSE to stream progress to the client.
"""

import uuid
import json
import shutil
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from pipeline.cinematic_screen_replace import render_cinematic_screen_replace

router = APIRouter()

UPLOAD_DIR = Path("uploads")
EXPORT_DIR = Path("exports")
UPLOAD_DIR.mkdir(exist_ok=True)
EXPORT_DIR.mkdir(exist_ok=True)


class ExportResult(BaseModel):
    downloadUrl: str
    format: str
    fileSize: int


@router.post("/image", response_model=ExportResult)
async def export_image():
    """
    Image export is handled client-side (canvas.toBlob).
    This endpoint exists for forward-compatibility.
    """
    return ExportResult(downloadUrl="", format="png", fileSize=0)


@router.post("/video")
async def export_video(
    location_video: UploadFile = File(...),
    creative_file: UploadFile = File(...),
    creative_is_video: str = Form("false"),
    keyframe_corners_json: str = Form(...),
    fit_mode: str = Form("cover"),
    glass_reflectivity: float = Form(0.08),
    screen_nits: float = Form(700.0),
    vignette: float = Form(0.15),
    grain: float = Form(0.06),
    # Grid tracking
    grid_size: int = Form(20),
    fb_threshold: float = Form(1.0),
    min_points_ratio: float = Form(0.25),
    reinit_interval: int = Form(30),
    ransac_threshold: float = Form(2.0),
    # ECC
    enable_ecc: bool = Form(True),
    # Smoothing
    smooth_window: int = Form(11),
    ema_alpha: float = Form(0.0),
    corner_smooth_window: int = Form(11),
    # Re-anchoring
    reanchor_interval: int = Form(30),
    # Quality
    supersample: int = Form(2),
    bloom_strength: float = Form(0.05),
    softness: float = Form(0.3),
    edge_feather: int = Form(3),
    # Motion blur
    enable_motion_blur: bool = Form(True),
    motion_blur_strength: float = Form(0.35),
    # Debug
    enable_debug: bool = Form(False),
):
    """
    Export composited video as MP4.
    Receives the location video + creative + keyframe corners as a multipart upload.
    Returns an SSE stream with progress updates, final event has the download URL.
    """
    export_id = str(uuid.uuid4())

    # Save uploaded files to temp location
    loc_path = UPLOAD_DIR / f"export_{export_id}_location.mp4"
    cr_ext = Path(creative_file.filename or "creative").suffix or (
        ".mp4" if creative_is_video == "true" else ".png"
    )
    cr_path = UPLOAD_DIR / f"export_{export_id}_creative{cr_ext}"
    output_path = EXPORT_DIR / f"{export_id}.mp4"

    try:
        with open(loc_path, "wb") as f:
            shutil.copyfileobj(location_video.file, f)
        with open(cr_path, "wb") as f:
            shutil.copyfileobj(creative_file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha ao salvar arquivos: {e}")

    # Parse keyframe corners
    try:
        keyframe_corners = json.loads(keyframe_corners_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="keyframe_corners_json inválido")

    is_video = creative_is_video.lower() == "true"

    def event_stream():
        try:
            for progress in render_cinematic_screen_replace(
                location_path=str(loc_path),
                creative_path=str(cr_path),
                creative_is_video=is_video,
                keyframe_corners=keyframe_corners,
                output_path=str(output_path),
                fit_mode=fit_mode,
                glass_reflectivity=glass_reflectivity,
                screen_nits=screen_nits,
                vignette=vignette,
                grain=grain,
                grid_size=grid_size,
                fb_threshold=fb_threshold,
                min_points_ratio=min_points_ratio,
                reinit_interval=reinit_interval,
                ransac_threshold=ransac_threshold,
                enable_ecc=enable_ecc,
                smooth_window=smooth_window,
                ema_alpha=ema_alpha,
                corner_smooth_window=corner_smooth_window,
                reanchor_interval=reanchor_interval,
                supersample=supersample,
                bloom_display=bloom_strength,
                led_softness=softness,
                edge_feather=edge_feather,
                enable_motion_blur=enable_motion_blur,
                motion_blur_strength=motion_blur_strength,
                enable_debug=enable_debug,
            ):
                if progress["status"] == "done":
                    progress["downloadUrl"] = f"/files/exports/{export_id}.mp4"

                yield f"data: {json.dumps(progress)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'status': 'error', 'message': str(e)})}\n\n"
        finally:
            # Clean up temp uploads
            loc_path.unlink(missing_ok=True)
            cr_path.unlink(missing_ok=True)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )

