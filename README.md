# DOOH Cinematic Simulator

A world-class Digital Out-of-Home (DOOH) simulator that composites ad creatives into real photos and videos of physical display screens with cinematic realism.

## Architecture

```
dooh-simulator/
├── apps/
│   ├── web/            # Next.js 14 frontend (React, Three.js, Tailwind)
│   └── vision/         # Python FastAPI backend (SAM, OpenCV, FFmpeg)
├── packages/
│   ├── core/           # Shared types, perspective math, API client
│   └── render/         # Three.js/WebGL engines & shaders
├── package.json        # Monorepo root (npm workspaces)
└── turbo.json          # Turborepo build pipeline
```

### Module Map

| Module | Location | Purpose |
|---|---|---|
| **VisionEngine** | `apps/vision/` | FastAPI server orchestrating SAM + OpenCV |
| **ScreenSegmentationService** | `apps/vision/services/sam_service.py` | Meta SAM mask prediction |
| **ContourAndCornerService** | `apps/vision/services/contour_service.py` | Mask → 4-corner extraction |
| **TrackingEngine** | `apps/vision/services/tracking_service.py` | Optical flow corner tracking |
| **PerspectiveEngine** | `packages/core/src/perspective.ts` | Homography & UV-fit computation |
| **DisplayEngine** | `packages/render/src/engines/DisplayEngine.ts` | LED/LCD shader material |
| **GlassOverlayEngine** | `packages/render/src/engines/GlassOverlayEngine.ts` | Fresnel glass layer |
| **SceneMatchEngine** | `packages/core/src/scene-match.ts` | Lighting/color estimation |
| **CinematicComposer** | `packages/render/src/engines/CinematicComposer.ts` | Post-processing effects |
| **ExportEngine** | `apps/vision/routers/export.py` | PNG/MP4 export pipeline |
| **CompositorScene** | `packages/render/src/engines/CompositorScene.ts` | Full rendering orchestrator |

## Setup

### Prerequisites

- **Node.js** ≥ 18
- **Python** ≥ 3.10
- **CUDA GPU** recommended for SAM inference (CPU fallback supported)

### 1. Install Node.js dependencies

```bash
npm install
```

### 2. Set up Python backend

```bash
cd apps/vision
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

### 3. Download SAM weights

Download the SAM ViT-H checkpoint from [Meta's repository](https://github.com/facebookresearch/segment-anything#model-checkpoints) and place it at:

```
apps/vision/sam_weights/sam_vit_h_4b8939.pth
```

### 4. Start development servers

**Terminal 1 — Vision API:**
```bash
cd apps/vision
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Web frontend:**
```bash
npm run web
```

Open [http://localhost:3000/simulator](http://localhost:3000/simulator)

## API Endpoints

### Vision

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/vision/segment-screen` | SAM segmentation + corner extraction |
| POST | `/api/vision/track-screen` | Optical flow video tracking |
| GET | `/health` | Health check |

### Export

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/export/image` | Export composited PNG |
| POST | `/api/export/video` | Export composited MP4 |

## User Workflow

1. **Upload location** — Photo or video of a physical screen
2. **Detect screen** — SAM segments the display area, OpenCV extracts 4 corners
3. **Adjust corners** — Drag-to-edit with precision zoom lens
4. **Upload creative** — Image or video ad content
5. **Configure display** — Brightness (nits), pixel grid, glass reflections
6. **Cinematic effects** — Bloom, vignette, grain, chromatic aberration
7. **Export** — High-quality PNG or MP4

## Rendering Pipeline

```
Location Image/Frame
  └─ Background plate (full resolution)
      └─ Screen Quad (homography-warped from 4 corners)
          ├─ LED Screen Material (GLSL)
          │   ├─ Creative texture with UV fit (cover/contain)
          │   ├─ Nits brightness scaling
          │   ├─ Scene match color correction
          │   ├─ Pixel grid simulation
          │   └─ Angle-based falloff
          ├─ Glass Overlay (GLSL)
          │   ├─ Fresnel reflection
          │   ├─ Roughness
          │   └─ Environment tint
          └─ Cinematic Post-Processing (fullscreen GLSL pass)
              ├─ Bloom (half-res blur)
              ├─ Vignette
              ├─ Film grain
              ├─ Chromatic aberration
              └─ Highlight compression
```

## Implementation Phases

### Phase 1 ✅ — Foundation
- [x] Image upload & display
- [x] SAM segmentation endpoint
- [x] OpenCV contour → 4 corners
- [x] Image creative insertion (2D canvas)
- [x] Manual corner correction UI
- [x] Cover/contain fit modes

### Phase 2 — Video
- [ ] Video input support
- [ ] Optical flow tracking engine
- [ ] Video texture creative
- [ ] Temporal corner smoothing
- [ ] SAM re-detection on confidence drop

### Phase 3 — Realism
- [ ] WebGL display shader (LED material)
- [ ] Glass/reflection overlay
- [ ] Scene color matching
- [ ] Cinematic post-processing pass
- [ ] Pixel grid / subpixel simulation

### Phase 4 — Export & Production
- [ ] Server-side PNG export (high-res)
- [ ] FFmpeg video export pipeline
- [ ] Location preset management
- [ ] Preset auto-apply workflow

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, React 18, TypeScript |
| 3D Rendering | Three.js, React Three Fiber, custom GLSL shaders |
| Styling | Tailwind CSS |
| State | Zustand |
| Vision Backend | Python, FastAPI |
| Segmentation | Meta Segment Anything (SAM) |
| Image Processing | OpenCV, NumPy, Pillow |
| Video Export | FFmpeg |
| Monorepo | npm workspaces + Turborepo |

## Types & Data Contracts

All shared types are in `packages/core/src/types.ts`:

- `ScreenCorners` — ordered [tl, tr, br, bl] points
- `SegmentationResponse` — mask URL + corners + confidence
- `TrackingFrame` — per-frame corners with confidence
- `LocationPreset` — saved display/cinematic configuration
- `CreativeSource` — uploaded ad media metadata
- `DisplaySettings` — nits, pixel grid, glass, falloff
- `CinematicSettings` — bloom, vignette, grain, CA
- `CompositionState` — full UI orchestration state

## License

Proprietary — All rights reserved.
