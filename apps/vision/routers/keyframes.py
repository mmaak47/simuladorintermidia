"""
Keyframe extraction router.

POST /api/vision/extract-keyframes — extracts representative frames
from a video at regular intervals for manual corner editing.
"""

import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import Optional

from services.keyframe_service import extract_keyframes

router = APIRouter()


class KeyframeInfo(BaseModel):
    frameIndex: int
    time: float
    thumbnailUrl: str


class KeyframeExtractionResult(BaseModel):
    fps: float
    totalFrames: int
    duration: float
    width: int
    height: int
    keyframes: list[KeyframeInfo]


@router.post("/extract-keyframes", response_model=KeyframeExtractionResult)
async def extract_keyframes_endpoint(
    file: UploadFile = File(...),
    max_keyframes: Optional[int] = Form(20),
):
    """
    Extract keyframes from a video for manual corner editing.
    Returns frame indices, timestamps, and thumbnail URLs.
    """
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty file uploaded")

    suffix = Path(file.filename or "video.mp4").suffix
    upload_dir = Path("uploads")
    upload_dir.mkdir(exist_ok=True)

    with tempfile.NamedTemporaryFile(
        delete=False, suffix=suffix, dir=str(upload_dir)
    ) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        result = extract_keyframes(
            tmp_path,
            max_keyframes=max_keyframes or 20,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Keyframe extraction failed: {e}")

    return KeyframeExtractionResult(**result)
