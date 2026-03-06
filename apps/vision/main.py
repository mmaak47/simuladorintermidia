"""
DOOH Simulator — Vision API
FastAPI backend for screen segmentation (SAM), contour extraction (OpenCV),
video tracking, and export.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from routers import segmentation, tracking, export as export_router
from routers import hybrid_detect

app = FastAPI(
    title="DOOH Vision API",
    version="0.1.0",
    description="Computer vision backend for cinematic DOOH simulator",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure upload/export directories exist
os.makedirs("uploads", exist_ok=True)
os.makedirs("exports", exist_ok=True)
os.makedirs("masks", exist_ok=True)

# Serve generated files
app.mount("/files/uploads", StaticFiles(directory="uploads"), name="uploads")
app.mount("/files/masks", StaticFiles(directory="masks"), name="masks")
app.mount("/files/exports", StaticFiles(directory="exports"), name="exports")

# Register routers
app.include_router(segmentation.router, prefix="/api/vision", tags=["vision"])
app.include_router(hybrid_detect.router, prefix="/api/vision", tags=["vision"])
app.include_router(tracking.router, prefix="/api/vision", tags=["vision"])
app.include_router(export_router.router, prefix="/api/export", tags=["export"])


@app.get("/health")
async def health():
    return {"status": "ok"}
