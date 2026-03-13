'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import { CornerEditor } from './CornerEditor';
import { ZoomLens } from './ZoomLens';
import { DetectionDebugSvg } from './DetectionDebugOverlay';
import { PerspectiveFrameEditor } from '@/components/admin/PerspectiveFrameEditor';
import { ImageViewport } from '@/components/admin/ImageViewport';
import { computeUvFit, computeScreenAspect, interpolateCornersAtTime, orderCorners, isValidScreenQuad } from '@dooh/core';
import type { ScreenCorners, CinematicSettings, DisplaySettings, TrackingResponse, KeyframeCorners } from '@dooh/core';
import { sampleEdgeColors, drawLightSpill, resetEdgeColors } from '@/lib/spill-renderer';
import { applyTimeOfDayToScene, applyScreenPop } from '@/lib/time-of-day';
import { applyEnvironmentEffects } from '@/lib/environment-effects';
import { AmbientRenderer } from '@/lib/ambient-animation';
import { analyzeColors } from '@/lib/color-analysis';
import { autoTune, sampleSceneAroundScreen } from '@/lib/scene-adaptive';

/**
 * Look up the correct corners for the current video time.
 * Priority: keyframe interpolation → tracking data → static corners.
 */
function getCornersForTime(
  keyframeCorners: KeyframeCorners[],
  fps: number,
  tracking: TrackingResponse | null,
  currentTime: number,
  staticCorners: ScreenCorners | null,
): ScreenCorners | null {
  // 1. Prefer interpolated keyframe corners when available
  if (keyframeCorners.length > 0) {
    const interp = interpolateCornersAtTime(keyframeCorners, currentTime, fps);
    if (interp) return interp;
  }

  // 2. Per-frame tracking data
  if (tracking && tracking.frames.length > 0) {
    const frameIndex = Math.round(currentTime * tracking.fps);
    const idx = Math.max(0, Math.min(frameIndex, tracking.frames.length - 1));
    return tracking.frames[idx].corners;
  }

  // 3. Static corners fallback
  return staticCorners;
}

/**
 * Canvas-based preview that composites:
 * 1. Location background
 * 2. Perspective-warped creative into the screen quad
 * 3. Display simulation (brightness, glass)
 * 4. Cinematic effects (bloom, vignette, grain, CA)
 * 5. Click-to-place detection point
 *
 * Uses ResizeObserver to fit the canvas within the available viewport area.
 * Canvas buffer is always at full image resolution for export quality.
 * For video locations with tracking, corners update per-frame automatically.
 */
interface PreviewCanvasProps {
  readOnly?: boolean;
  editorMode?: 'none' | 'basic' | 'perspective';
  panelType?: string;
  staticTextureIntensity?: number;
  staticLightTransmission?: number;
  onFirstRender?: (canvas: HTMLCanvasElement) => void;
}

export function PreviewCanvas({
  readOnly = false,
  editorMode,
  panelType,
  staticTextureIntensity = 0.45,
  staticLightTransmission = 0.5,
  onFirstRender,
}: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstRenderFiredRef = useRef(false);
  const {
    location,
    corners,
    faces,
    creative,
    fitMode,
    display,
    cinematic,
    spill,
    timeOfDay,
    environment,
    ambient,
    autoTuneRequested,
    segmentation,
    hybridDetection,
    tracking,
    keyframeData,
    keyframeCorners,
    activeKeyframeIndex,
    setCorners,
    setKeyframeCorners,
    updateDisplay,
    updateCinematic,
    updateSpill,
    clearAutoTuneRequest,
  } = useCompositionStore();

  // Are we in keyframe editing mode? (keyframes extracted, user is editing)
  const isKeyframeEditMode = !!keyframeData;
  const activeKf = keyframeData?.keyframes[activeKeyframeIndex] ?? null;
  const effectiveEditorMode = editorMode ?? (readOnly ? 'none' : 'basic');

  const bgImage = useImageLoader(location?.url ?? null);
  const creativeImage = useImageLoader(creative?.type === 'image' ? creative.url : null);
  const isStaticPrintSurface = panelType === 'FrontLights' || panelType === 'BackLights';

  // Reset spill edge color smoothing when creative changes
  useEffect(() => { resetEdgeColors(); firstRenderFiredRef.current = false; }, [creative]);

  // Ambient animation renderer (persists across frames for particle state)
  const ambientRendererRef = useRef<AmbientRenderer | null>(null);
  if (!ambientRendererRef.current) ambientRendererRef.current = new AmbientRenderer();

  // ─── Video sources ─────────────────────────────────────────
  const bgVideo = useVideoLoader(
    location?.type === 'video' ? location.url : null,
  );
  const creativeVideo = useVideoLoader(
    creative?.type === 'video' ? creative.url : null,
  );

  // Unified source: video takes priority when available
  const bgSource: CanvasImageSource | null = bgVideo ?? bgImage;
  const creativeSource: CanvasImageSource | null = creativeVideo ?? creativeImage;

  // ─── Track available space via ResizeObserver ───────────────
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // ─── Calculate display size (fit image within container) ───
  const displaySize = useMemo(() => {
    if (!location || containerSize.w <= 0 || containerSize.h <= 0) return null;
    const imgAspect = location.width / location.height;
    const boxAspect = containerSize.w / containerSize.h;
    if (imgAspect > boxAspect) {
      return { width: containerSize.w, height: Math.round(containerSize.w / imgAspect) };
    }
    return { width: Math.round(containerSize.h * imgAspect), height: containerSize.h };
  }, [location, containerSize]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const MAX_PERSPECTIVE_ZOOM = 12;

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [location?.url]);

  useEffect(() => {
    if (effectiveEditorMode !== 'perspective' || !location || corners) return;
    const qw = location.width * 0.34;
    const qh = location.height * 0.28;
    const cx = location.width / 2;
    const cy = location.height / 2;
    const initialCorners: ScreenCorners = [
      { x: cx - qw / 2, y: cy - qh / 2 },
      { x: cx + qw / 2, y: cy - qh / 2 },
      { x: cx + qw / 2, y: cy + qh / 2 },
      { x: cx - qw / 2, y: cy + qh / 2 },
    ];
    setCorners(initialCorners);
  }, [effectiveEditorMode, location, corners, setCorners]);

  const handlePanBy = useCallback((dx: number, dy: number) => {
    setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const handleWheelZoom = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (effectiveEditorMode !== 'perspective') return;
    event.preventDefault();

    const scale = event.deltaY < 0 ? 1.14 : 1 / 1.14;
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerDx = event.clientX - rect.left - rect.width / 2;
    const pointerDy = event.clientY - rect.top - rect.height / 2;

    setZoom((prevZoom) => {
      const nextZoom = Math.max(1, Math.min(MAX_PERSPECTIVE_ZOOM, prevZoom * scale));
      const factor = nextZoom / prevZoom;

      setPan((prevPan) => ({
        x: nextZoom === 1 ? 0 : prevPan.x - pointerDx * (factor - 1),
        y: nextZoom === 1 ? 0 : prevPan.y - pointerDy * (factor - 1),
      }));

      return nextZoom;
    });
  }, [effectiveEditorMode]);

  const handleDoubleClickZoom = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (effectiveEditorMode !== 'perspective') return;
    event.preventDefault();

    setZoom((prev) => {
      const next = prev < 1.5 ? 2 : prev < 3.5 ? 4 : prev < 7.5 ? 8 : 1;
      if (next === 1) {
        setPan({ x: 0, y: 0 });
      }
      return next;
    });
  }, [effectiveEditorMode]);

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ─── Render composited frame ──────────────────────────────
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !location || !bgSource) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Canvas buffer = full image resolution (for export)
    if (canvas.width !== location.width || canvas.height !== location.height) {
      canvas.width = location.width;
      canvas.height = location.height;
    }

    // Resolve corners depending on mode
    let activeCorners: ScreenCorners | null;
    if (isKeyframeEditMode) {
      // In keyframe edit mode, use the static corners directly
      // (set per-keyframe by goToKeyframe / handleClick)
      activeCorners = corners;
    } else {
      const currentTime = bgVideo ? bgVideo.currentTime : 0;
      const kfFps = (keyframeData as { fps: number } | null)?.fps ?? 30;
      activeCorners = getCornersForTime(keyframeCorners, kfFps, tracking, currentTime, corners);
    }

    const isRealtimeVideo = !!bgVideo || !!creativeVideo;
    const usesDynamicCorners = isKeyframeEditMode || keyframeCorners.length > 0 || !!tracking;
    const sourceFaces: ScreenCorners[] = usesDynamicCorners
      ? (activeCorners ? [activeCorners] : [])
      : (faces.length > 0 ? faces : (activeCorners ? [activeCorners] : []));
    const activeFaces: ScreenCorners[] = sourceFaces
      .map((face) => sanitizeCorners(face))
      .filter((face): face is ScreenCorners => !!face);

    // 1. Background
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bgSource, 0, 0, location.width, location.height);

    // 2. Time-of-day: dim/tint the scene BEFORE drawing creative
    applyTimeOfDayToScene(ctx, canvas.width, canvas.height, timeOfDay);

    // 3. Creative into screen quad
    if (creativeSource && activeFaces.length > 0) {
      const cw = creative?.width ?? location.width;
      const ch = creative?.height ?? location.height;
      for (const faceCorners of activeFaces) {
        drawCreativeIntoQuad(ctx, creativeSource, cw, ch, faceCorners, fitMode, display, {
          realtime: isRealtimeVideo,
          highQuality: isStaticPrintSurface,
        });

        // FrontLight/BackLight surfaces are printed media (lona/tecido), not LED.
        if (isStaticPrintSurface) {
          drawStaticMediaTexture(ctx, faceCorners, {
            panelType,
            textureIntensity: staticTextureIntensity,
            lightTransmission: staticLightTransmission,
          });
        }

        // 4. Light spill — screen light bleeding onto surrounding walls
        if (spill.enabled) {
          const edgeColors = sampleEdgeColors(ctx, faceCorners);
          drawLightSpill(ctx, faceCorners, spill, edgeColors, canvas.width, canvas.height);
        }

        // 5. Screen pop — brighter screen at night (time-of-day)
        applyScreenPop(ctx, faceCorners, timeOfDay);

        // 6. Environment effects (rain, sun glare, fog)
        applyEnvironmentEffects(ctx, faceCorners, canvas.width, canvas.height, environment);
      }

      // 6.5. Ambient animation overlay
      if (ambient.enabled && ambientRendererRef.current) {
        ambientRendererRef.current.configure(ambient);
        ambientRendererRef.current.render(ctx, canvas.width, canvas.height);
      }

      // 7. Cinematic post-processing
      if (cinematic.enabled) {
        applyCinematicEffects(ctx, canvas.width, canvas.height, cinematic, {
          realtime: isRealtimeVideo,
        });
      }

      // 8. Auto-tune: one-shot analysis when requested
      if (autoTuneRequested) {
        try {
          const primaryFace = activeFaces[0];
          const sceneInfo = sampleSceneAroundScreen(ctx, primaryFace, canvas.width, canvas.height);
          const sceneColors = {
            dominantColor: [sceneInfo.r, sceneInfo.g, sceneInfo.b] as [number, number, number],
            secondaryColors: [] as [number, number, number][],
            avgBrightness: sceneInfo.brightness,
            highlightStrength: Math.max(0, sceneInfo.brightness - 0.5) * 2,
          };
          const creativeAnalysis = analyzeColors(creativeSource, cw, ch);
          const result = autoTune(sceneColors, creativeAnalysis);
          updateDisplay(result.display);
          updateCinematic(result.cinematic);
          updateSpill(result.spill);
        } catch { /* analysis may fail on cross-origin images */ }
        clearAutoTuneRequest();
      }

      // Notify first render with creative composited
      if (!firstRenderFiredRef.current && onFirstRender) {
        firstRenderFiredRef.current = true;
        const c = canvas;
        setTimeout(() => onFirstRender(c), 0);
      }
    }
    // Mask overlay when corners exist but no creative yet
    else if (activeFaces.length > 0 && !creative) {
      for (const faceCorners of activeFaces) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(faceCorners[0].x, faceCorners[0].y);
        ctx.lineTo(faceCorners[1].x, faceCorners[1].y);
        ctx.lineTo(faceCorners[2].x, faceCorners[2].y);
        ctx.lineTo(faceCorners[3].x, faceCorners[3].y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(254, 92, 43, 0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(254, 92, 43, 0.7)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }
    }
  }, [location, bgSource, bgVideo, creativeVideo, creativeSource, creative, corners, faces, tracking, keyframeData, keyframeCorners, segmentation, fitMode, display, cinematic, spill, timeOfDay, environment, ambient, autoTuneRequested, updateDisplay, updateCinematic, updateSpill, clearAutoTuneRequest, onFirstRender, isStaticPrintSurface, panelType, staticTextureIntensity, staticLightTransmission]);

  // Re-render on dependency change (static sources)
  useEffect(() => {
    render();
  }, [render]);

  // ─── Keyframe edit mode: pause video and seek to keyframe ──
  useEffect(() => {
    if (!bgVideo || !isKeyframeEditMode || !activeKf) return;
    bgVideo.pause();
    // Seek to the keyframe's time so the canvas shows the correct frame
    bgVideo.currentTime = activeKf.time;

    // Re-render once the seek completes
    const onSeeked = () => render();
    bgVideo.addEventListener('seeked', onSeeked, { once: true });
    return () => bgVideo.removeEventListener('seeked', onSeeked);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgVideo, isKeyframeEditMode, activeKf]);

  // ─── rAF loop for video playback (disabled in keyframe edit mode) ──
  const isVideoPlaying = (!!bgVideo || !!creativeVideo) && !isKeyframeEditMode;
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!isVideoPlaying) return;

    // Resume playback when exiting keyframe edit mode
    if (bgVideo && bgVideo.paused) {
      bgVideo.play().catch(() => {});
    }

    let running = true;
    const loop = () => {
      if (!running) return;
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [isVideoPlaying, bgVideo, render]);

  // ─── Click to place corners ────────────────────────────────
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (effectiveEditorMode !== 'basic') return;
      const canvas = canvasRef.current;
      if (!canvas || !location) return;

      const rect = canvas.getBoundingClientRect();
      const scaleX = location.width / rect.width;
      const scaleY = location.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;

      const dw = location.width * 0.25;
      const dh = location.height * 0.3;
      const newCorners: ScreenCorners = [
        { x: x - dw / 2, y: y - dh / 2 },
        { x: x + dw / 2, y: y - dh / 2 },
        { x: x + dw / 2, y: y + dh / 2 },
        { x: x - dw / 2, y: y + dh / 2 },
      ];

      // Keyframe edit mode: place corners on the active keyframe
      if (isKeyframeEditMode && activeKf) {
        setKeyframeCorners(activeKf.frameIndex, activeKf.time, newCorners);
        setCorners(newCorners);
        return;
      }

      // Normal mode: place corners only if none exist yet
      if (!corners && !segmentation) {
        setCorners(newCorners);
      }
    },
    [effectiveEditorMode, location, corners, segmentation, isKeyframeEditMode, activeKf, setCorners, setKeyframeCorners],
  );

  // ─── Hover tracking for placement zoom lens ──────────────
  const [hover, setHover] = useState<{ ix: number; iy: number; sx: number; sy: number } | null>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!location) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      setHover({
        ix: (e.clientX - rect.left) * (location.width / rect.width),
        iy: (e.clientY - rect.top) * (location.height / rect.height),
        sx: e.clientX,
        sy: e.clientY,
      });
    },
    [location],
  );

  const handleMouseLeave = useCallback(() => setHover(null), []);

  if (!location) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center p-4">
      {displaySize && displaySize.width > 0 && (
        <ImageViewport
          width={displaySize.width}
          height={displaySize.height}
          zoom={zoom}
          panX={pan.x}
          panY={pan.y}
          onWheel={handleWheelZoom}
          onDoubleClick={handleDoubleClickZoom}
          onResetView={handleResetView}
        >
          <canvas
            ref={canvasRef}
            onClick={readOnly ? undefined : handleClick}
            onMouseMove={readOnly || effectiveEditorMode !== 'basic' || corners ? undefined : handleMouseMove}
            onMouseLeave={readOnly || effectiveEditorMode !== 'basic' || corners ? undefined : handleMouseLeave}
            className={`block w-full h-full ${effectiveEditorMode === 'perspective' ? 'cursor-move' : readOnly ? '' : 'cursor-crosshair'}`}
          />
          {!readOnly && hybridDetection && (
            <DetectionDebugSvg imgWidth={location.width} imgHeight={location.height} />
          )}
          {!readOnly && effectiveEditorMode === 'basic' && !corners && hover && (
            <ZoomLens
              imageX={hover.ix}
              imageY={hover.iy}
              screenX={hover.sx}
              screenY={hover.sy}
              visible
            />
          )}
          {!readOnly && effectiveEditorMode === 'basic' && corners && <CornerEditor />}
          {!readOnly && effectiveEditorMode === 'perspective' && (
            <PerspectiveFrameEditor
              imageWidth={location.width}
              imageHeight={location.height}
              onPanBy={handlePanBy}
            />
          )}
        </ImageViewport>
      )}
    </div>
  );
}

function sanitizeCorners(corners: ScreenCorners): ScreenCorners | null {
  try {
    const ordered = orderCorners(corners);
    if (!isValidScreenQuad(ordered, 120)) return null;
    return ordered;
  } catch {
    return null;
  }
}

// ─── Drawing helpers ─────────────────────────────────────────────

/**
 * Draw creative into the screen quad using perspective subdivision.
 * Splits the quad into a grid and uses per-cell affine transforms
 * to approximate perspective distortion on a 2D canvas.
 */
function drawCreativeIntoQuad(
  ctx: CanvasRenderingContext2D,
  creative: CanvasImageSource,
  creativeWidth: number,
  creativeHeight: number,
  corners: ScreenCorners,
  fitMode: 'cover' | 'contain',
  display: DisplaySettings,
  options?: {
    realtime?: boolean;
    highQuality?: boolean;
  },
) {
  const [tl, tr, br, bl] = corners;
  const cw = creativeWidth;
  const ch = creativeHeight;

  // Compute UV fit
  const aspect = computeScreenAspect(corners);
  const fit = computeUvFit(cw, ch, aspect, fitMode);

  // Subdivision grid for perspective approximation.
  // highQuality uses more cells for printed-media panels (no real-time budget).
  // Lower subdivision in realtime video mode for significantly better FPS.
  const DIVS = options?.realtime ? 5 : (options?.highQuality ? 20 : 8);

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = options?.highQuality ? 'high' : (options?.realtime ? 'low' : 'medium');

  // Clip to the quad shape
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.clip();

  for (let row = 0; row < DIVS; row++) {
    for (let col = 0; col < DIVS; col++) {
      const u0 = col / DIVS;
      const u1 = (col + 1) / DIVS;
      const v0 = row / DIVS;
      const v1 = (row + 1) / DIVS;

      // Bilinear interpolation to get quad positions for this cell
      const p00 = bilerp(tl, tr, br, bl, u0, v0);
      const p10 = bilerp(tl, tr, br, bl, u1, v0);
      const p01 = bilerp(tl, tr, br, bl, u0, v1);
      const p11 = bilerp(tl, tr, br, bl, u1, v1);

      // Source rect in creative image (clamped to valid range)
      let sx = (fit.offsetX + u0 * fit.scaleX) * cw;
      let sy = (fit.offsetY + v0 * fit.scaleY) * ch;
      let sw = (fit.scaleX / DIVS) * cw;
      let sh = (fit.scaleY / DIVS) * ch;

      // Clamp to image bounds (browser handles partial source rects)
      sx = Math.max(0, Math.min(sx, cw - 1));
      sy = Math.max(0, Math.min(sy, ch - 1));
      sw = Math.min(sw, cw - sx);
      sh = Math.min(sh, ch - sy);

      if (sw <= 0 || sh <= 0) continue;

      // Draw this cell using affine transform
      drawAffineCell(ctx, creative, sx, sy, sw, sh, p00, p10, p01, p11);
    }
  }

  // Glass overlay — semi-transparent gradient
  if (display.glassReflectivity > 0.01) {
    const grad = ctx.createLinearGradient(
      (tl.x + bl.x) / 2, tl.y,
      (tr.x + br.x) / 2, br.y,
    );
    grad.addColorStop(0, `rgba(180, 200, 220, ${display.glassReflectivity * 0.25})`);
    grad.addColorStop(0.5, `rgba(255, 255, 255, ${display.glassReflectivity * 0.08})`);
    grad.addColorStop(1, `rgba(140, 160, 180, ${display.glassReflectivity * 0.2})`);

    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  ctx.restore();

  // Brightness overlay (nits simulation)
  const nitsScale = display.screenNits / 700;
  if (nitsScale > 1.05) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min((nitsScale - 1.0) * 0.12, 0.3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      Math.min(tl.x, bl.x), Math.min(tl.y, tr.y),
      Math.max(tr.x, br.x) - Math.min(tl.x, bl.x),
      Math.max(bl.y, br.y) - Math.min(tl.y, tr.y),
    );
    ctx.restore();
  } else if (nitsScale < 0.95) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = Math.min((1.0 - nitsScale) * 0.5, 0.5);
    ctx.fillStyle = '#000000';
    ctx.fillRect(
      Math.min(tl.x, bl.x), Math.min(tl.y, tr.y),
      Math.max(tr.x, br.x) - Math.min(tl.x, bl.x),
      Math.max(bl.y, br.y) - Math.min(tl.y, tr.y),
    );
    ctx.restore();
  }
}

// ─── Static-media (FrontLight / BackLight) rendering helpers ────────────────

/** Per-session UV offsets — shift where the texture tile seam lands in the quad */
const SESSION_UV_OFFSET_U = Math.random();
const SESSION_UV_OFFSET_V = Math.random();

/** Module-level reusable offscreen canvas for texture overlay compositing */
let _overlayCanvas: HTMLCanvasElement | null = null;

/** Module-level fabric texture cache (one 2048px canvas per discrete variant) */
const _fabricCache: Record<string, HTMLCanvasElement> = {};

/**
 * Fast mulberry32 PRNG — deterministic given the same seed.
 * Returns a function that produces a float in [0, 1).
 */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * Generate (or retrieve from cache) a 2048×2048 procedural fabric / lona texture.
 *
 * The texture is built entirely with deterministic random ops so it:
 * - never repeats in an obvious grid
 * - contains sub-pixel jitter on thread positions (prevents brick-grid artifacts)
 * - contains micro-wrinkle strokes (organic surface displacement)
 * - has a Gaussian-ish noise pass for grain
 */
function getFabricTexture(isBacklight: boolean, textureIntensity: number): HTMLCanvasElement {
  const iKey = Math.round(textureIntensity * 20); // 20 discrete quality steps
  const key = `${isBacklight ? 'b' : 'f'}_${iKey}`;
  if (_fabricCache[key]) return _fabricCache[key];

  const SIZE = 2048;
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const fCtx = canvas.getContext('2d', { willReadFrequently: true })!;

  // Deterministic seed unique to variant — produces same texture across renders
  const rng = mulberry32(0xf1b3c2a0 ^ (isBacklight ? 0x1327 : 0x4891) ^ (iKey * 7919));

  // Base warm-neutral fill
  fCtx.fillStyle = isBacklight ? 'rgb(250,248,240)' : 'rgb(242,234,218)';
  fCtx.fillRect(0, 0, SIZE, SIZE);

  fCtx.imageSmoothingEnabled = true;
  fCtx.imageSmoothingQuality = 'high';

  // ── Horizontal weft threads ───────────────────────────────────────────────
  // Sub-pixel positional jitter breaks the regular grid pattern
  const hStep = Math.round(3 + (1 - textureIntensity) * 2.5); // 3–5 px spacing
  fCtx.globalCompositeOperation = 'soft-light';
  for (let y = 0; y < SIZE; y += hStep) {
    const yOff = (rng() - 0.5) * 1.4;
    const alpha = 0.022 + rng() * 0.018 + textureIntensity * 0.012;
    fCtx.strokeStyle = `rgba(255,255,255,${alpha.toFixed(3)})`;
    fCtx.lineWidth = 0.7 + rng() * 0.5;
    fCtx.beginPath();
    fCtx.moveTo(0, y + yOff);
    fCtx.lineTo(SIZE, y + yOff);
    fCtx.stroke();
  }

  // ── Vertical warp threads ─────────────────────────────────────────────────
  const vStep = Math.round(4.5 + (1 - textureIntensity) * 3); // 4–7 px spacing
  for (let x = 0; x < SIZE; x += vStep) {
    const xOff = (rng() - 0.5) * 1.4;
    const alpha = 0.016 + rng() * 0.012 + textureIntensity * 0.008;
    fCtx.strokeStyle = `rgba(18,13,6,${alpha.toFixed(3)})`;
    fCtx.lineWidth = 0.6 + rng() * 0.4;
    fCtx.beginPath();
    fCtx.moveTo(x + xOff, 0);
    fCtx.lineTo(x + xOff, SIZE);
    fCtx.stroke();
  }

  // ── Micro-wrinkles: subtle diagonal strokes ───────────────────────────────
  for (let i = 0; i < 26; i++) {
    const x0 = rng() * SIZE;
    const y0 = rng() * SIZE;
    const len = 60 + rng() * 200;
    const angle = (rng() - 0.5) * Math.PI * 0.22; // mostly horizontal
    const alpha = 0.010 + rng() * 0.014;
    fCtx.strokeStyle = `rgba(200,188,168,${alpha.toFixed(3)})`;
    fCtx.lineWidth = 1.2 + rng() * 2.2;
    fCtx.beginPath();
    fCtx.moveTo(x0, y0);
    fCtx.lineTo(x0 + Math.cos(angle) * len, y0 + Math.sin(angle) * len);
    fCtx.stroke();
  }

  // ── Gaussian-ish noise pass via ImageData ─────────────────────────────────
  fCtx.globalCompositeOperation = 'source-over';
  const noiseData = fCtx.getImageData(0, 0, SIZE, SIZE);
  const nd = noiseData.data;
  const noiseStr = 5 + textureIntensity * 4; // 5–9 levels
  for (let i = 0; i < nd.length; i += 4) {
    const n = (rng() - 0.5) * noiseStr * 2;
    nd[i]     = Math.max(0, Math.min(255, nd[i]     + n));
    nd[i + 1] = Math.max(0, Math.min(255, nd[i + 1] + n * 0.95));
    nd[i + 2] = Math.max(0, Math.min(255, nd[i + 2] + n * 0.85));
  }
  fCtx.putImageData(noiseData, 0, 0);

  _fabricCache[key] = canvas;
  return canvas;
}

function drawStaticMediaTexture(
  ctx: CanvasRenderingContext2D,
  corners: ScreenCorners,
  options?: {
    panelType?: string;
    textureIntensity?: number;
    lightTransmission?: number;
  },
) {
  const panelType = options?.panelType;
  const textureIntensity = Math.max(0, Math.min(1, options?.textureIntensity ?? 0.45));
  const lightTransmission = Math.max(0, Math.min(1, options?.lightTransmission ?? 0.5));
  const isBacklight = panelType === 'BackLights';
  const [tl, tr, br, bl] = corners;

  const minX = Math.floor(Math.min(tl.x, tr.x, br.x, bl.x));
  const maxX = Math.ceil(Math.max(tl.x, tr.x, br.x, bl.x));
  const minY = Math.floor(Math.min(tl.y, tr.y, br.y, bl.y));
  const maxY = Math.ceil(Math.max(tl.y, tr.y, br.y, bl.y));
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  if (bboxW <= 0 || bboxH <= 0) return;

  // ─── 1. Build (or get cached) 2048px procedural fabric texture ────────────
  const fabricTex = getFabricTexture(isBacklight, textureIntensity);
  const texW = fabricTex.width;  // 2048
  const texH = fabricTex.height; // 2048

  // ─── 2. Draw the fabric texture into an offscreen bbox canvas ─────────────
  // Using an offscreen canvas lets us apply a single blur on composite-step,
  // avoiding expensive per-cell filter calls.
  if (!_overlayCanvas) _overlayCanvas = document.createElement('canvas');
  if (_overlayCanvas.width !== bboxW)  _overlayCanvas.width  = bboxW;
  if (_overlayCanvas.height !== bboxH) _overlayCanvas.height = bboxH;
  const oCtx = _overlayCanvas.getContext('2d', { willReadFrequently: false });
  if (!oCtx) return;
  oCtx.clearRect(0, 0, bboxW, bboxH);

  // Translate corners into local bbox-space
  const ltl = { x: tl.x - minX, y: tl.y - minY };
  const ltr = { x: tr.x - minX, y: tr.y - minY };
  const lbr = { x: br.x - minX, y: br.y - minY };
  const lbl = { x: bl.x - minX, y: bl.y - minY };

  oCtx.save();
  oCtx.beginPath();
  oCtx.moveTo(ltl.x, ltl.y);
  oCtx.lineTo(ltr.x, ltr.y);
  oCtx.lineTo(lbr.x, lbr.y);
  oCtx.lineTo(lbl.x, lbl.y);
  oCtx.closePath();
  oCtx.clip();

  oCtx.imageSmoothingEnabled = true;
  oCtx.imageSmoothingQuality = 'high';

  // UV mapping: UV_SCALE controls how much of the texture maps across the quad.
  // 0.55 means 55% of the texture is visible — thread density stays fine-grained.
  // The random session offset shifts the "tile seam" to a non-edge position.
  const UV_SCALE = 0.55;
  const uOff = SESSION_UV_OFFSET_U * texW * (1 - UV_SCALE);
  const vOff = SESSION_UV_OFFSET_V * texH * (1 - UV_SCALE);
  const cellTexW = (texW * UV_SCALE);
  const cellTexH = (texH * UV_SCALE);

  // 18×18 subdivision — 324 cells — high fidelity perspective warp of texture
  const TDIVS = 18;
  for (let row = 0; row < TDIVS; row++) {
    for (let col = 0; col < TDIVS; col++) {
      const u0 = col / TDIVS;
      const u1 = (col + 1) / TDIVS;
      const v0 = row / TDIVS;
      const v1 = (row + 1) / TDIVS;

      const p00 = bilerp(ltl, ltr, lbr, lbl, u0, v0);
      const p10 = bilerp(ltl, ltr, lbr, lbl, u1, v0);
      const p01 = bilerp(ltl, ltr, lbr, lbl, u0, v1);
      const p11 = bilerp(ltl, ltr, lbr, lbl, u1, v1);

      drawAffineCell(
        oCtx, fabricTex,
        uOff + u0 * cellTexW,
        vOff + v0 * cellTexH,
        cellTexW / TDIVS,
        cellTexH / TDIVS,
        p00, p10, p01, p11,
      );
    }
  }

  // ─── 3. Lighting variation overlay (projector / backlight fall-off) ────────
  oCtx.beginPath();
  oCtx.moveTo(ltl.x, ltl.y);
  oCtx.lineTo(ltr.x, ltr.y);
  oCtx.lineTo(lbr.x, lbr.y);
  oCtx.lineTo(lbl.x, lbl.y);
  oCtx.closePath();
  // Re-clip (context was restored above)
  // We're still inside the save block — reuse the clip
  if (isBacklight) {
    // Backlight: radial bloom from centre (light diffuses inward from edge frame)
    const cx = (ltl.x + ltr.x + lbr.x + lbl.x) / 4;
    const cy = (ltl.y + ltr.y + lbr.y + lbl.y) / 4;
    const rad = Math.hypot(bboxW, bboxH) * 0.48;
    const rg = oCtx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, `rgba(255,253,238,${(0.10 + lightTransmission * 0.09).toFixed(3)})`);
    rg.addColorStop(0.55, `rgba(255,250,228,0.03)`);
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    oCtx.globalCompositeOperation = 'soft-light';
    oCtx.fillStyle = rg;
    oCtx.fillRect(0, 0, bboxW, bboxH);
  } else {
    // Frontlight: linear fall-off from top (projectors illuminate from above)
    const topY = (ltl.y + ltr.y) / 2;
    const botY = (lbl.y + lbr.y) / 2;
    const midX = (ltl.x + ltr.x + lbr.x + lbl.x) / 4;
    const lg = oCtx.createLinearGradient(midX, topY, midX, botY);
    lg.addColorStop(0, `rgba(255,252,232,${(0.09 + lightTransmission * 0.07).toFixed(3)})`);
    lg.addColorStop(0.40, 'rgba(255,249,224,0.03)');
    lg.addColorStop(1,  `rgba(14,9,0,${(0.05 + (1 - lightTransmission) * 0.04).toFixed(3)})`);
    oCtx.globalCompositeOperation = 'soft-light';
    oCtx.fillStyle = lg;
    oCtx.fillRect(0, 0, bboxW, bboxH);
  }
  oCtx.restore();

  // ─── 4. Composite overlay onto main canvas ────────────────────────────────
  // A 0.35 px blur on drawImage softens any remaining cell-boundary seams
  // without blurring the banner artwork itself.
  const overlayAlpha = 0.11 + textureIntensity * 0.07; // 11–18 %
  ctx.save();
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = overlayAlpha;
  ctx.filter = 'blur(0.35px)';
  ctx.drawImage(_overlayCanvas, minX, minY);
  ctx.filter = 'none';
  ctx.restore();

  // ─── 5. Warm material tint via multiply — desaturates LED-like colours ─────
  const tintAlpha = Math.max(0,
    (isBacklight ? 0.04 : 0.06) + textureIntensity * 0.035 - lightTransmission * 0.02,
  );
  if (tintAlpha > 0.004) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(tl.x, tl.y);
    ctx.lineTo(tr.x, tr.y);
    ctx.lineTo(br.x, br.y);
    ctx.lineTo(bl.x, bl.y);
    ctx.closePath();
    ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = tintAlpha;
    ctx.fillStyle = isBacklight ? 'rgb(255,250,228)' : 'rgb(248,237,215)';
    ctx.fillRect(minX, minY, bboxW, bboxH);
    ctx.restore();
  }

  // ─── 6. Film grain via ImageData (last step — applied over the full banner) ─
  // Gaussian-ish noise at 1.5–3.5 % intensity breaks repeating pattern tiling
  // and adds the organic imperfection of real printed vinyl / lona media.
  // Reading back the exact bounding box avoids re-encoding the full canvas.
  const grainStr = 4 + textureIntensity * 5; // 4–9 levels out of 255
  try {
    const imageData = ctx.getImageData(minX, minY, bboxW, bboxH);
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 10) continue; // skip transparent
      const n = (Math.random() - 0.5) * grainStr * 2;
      d[i]     = Math.max(0, Math.min(255, d[i]     + n));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
    }
    ctx.putImageData(imageData, minX, minY);
  } catch { /* silently ignore cross-origin canvas restrictions */ }
}

/**
 * Draw a single cell with affine transform approximation.
 */
function drawAffineCell(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx: number, sy: number, sw: number, sh: number,
  p00: { x: number; y: number },
  p10: { x: number; y: number },
  p01: { x: number; y: number },
  _p11: { x: number; y: number },
) {
  // Affine transform: map unit square to parallelogram defined by p00, p10, p01
  const dx1 = p10.x - p00.x;
  const dy1 = p10.y - p00.y;
  const dx2 = p01.x - p00.x;
  const dy2 = p01.y - p00.y;

  ctx.save();
  ctx.setTransform(
    dx1 / sw, dy1 / sw,
    dx2 / sh, dy2 / sh,
    p00.x, p00.y,
  );
  // Draw slightly oversized to prevent seams between cells
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw + 0.5, sh + 0.5);
  ctx.restore();
}

/**
 * Bilinear interpolation within a quad.
 */
function bilerp(
  tl: { x: number; y: number }, tr: { x: number; y: number },
  br: { x: number; y: number }, bl: { x: number; y: number },
  u: number, v: number,
): { x: number; y: number } {
  const top = { x: tl.x + (tr.x - tl.x) * u, y: tl.y + (tr.y - tl.y) * u };
  const bot = { x: bl.x + (br.x - bl.x) * u, y: bl.y + (br.y - bl.y) * u };
  return { x: top.x + (bot.x - top.x) * v, y: top.y + (bot.y - top.y) * v };
}

// ─── Cinematic post-processing (canvas-based) ───────────────────

function applyCinematicEffects(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: CinematicSettings,
  options?: {
    realtime?: boolean;
  },
) {
  const realtime = !!options?.realtime;

  // Vignette
  if (settings.vignetteIntensity > 0.01) {
    const cx = width / 2;
    const cy = height / 2;
    const maxR = Math.hypot(cx, cy);
    const grad = ctx.createRadialGradient(cx, cy, maxR * 0.35, cx, cy, maxR);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${settings.vignetteIntensity * 0.6})`);
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // Bloom (soft glow over bright areas)
  if (settings.bloomIntensity > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = settings.bloomIntensity * (realtime ? 0.12 : 0.2);
    ctx.filter = `blur(${Math.round(Math.max(width, height) * (realtime ? 0.008 : 0.015))}px)`;
    ctx.drawImage(ctx.canvas, 0, 0);
    ctx.restore();
    // Reset filter
    ctx.filter = 'none';
  }

  // Film grain via pixel manipulation
  if (!realtime && settings.grainIntensity > 0.01) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const intensity = settings.grainIntensity * 25;
    // Sample every 2nd pixel for performance
    for (let i = 0; i < data.length; i += 8) {
      const noise = (Math.random() - 0.5) * intensity;
      data[i] = clamp(data[i] + noise);         // R
      data[i + 1] = clamp(data[i + 1] + noise); // G
      data[i + 2] = clamp(data[i + 2] + noise); // B
      // Copy to next pixel for speed
      if (i + 4 < data.length) {
        data[i + 4] = clamp(data[i + 4] + noise);
        data[i + 5] = clamp(data[i + 5] + noise);
        data[i + 6] = clamp(data[i + 6] + noise);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  // Chromatic aberration (RGB channel shift)
  if (!realtime && settings.chromaticAberration > 0.01) {
    const shift = Math.round(settings.chromaticAberration * 4);
    if (shift >= 1) {
      const imageData = ctx.getImageData(0, 0, width, height);
      const copy = new Uint8ClampedArray(imageData.data);
      const data = imageData.data;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          // Shift red channel outward from center
          const rx = Math.min(Math.max(x + shift, 0), width - 1);
          const ridx = (y * width + rx) * 4;
          data[idx] = copy[ridx]; // R from shifted position

          // Shift blue channel opposite direction
          const bx = Math.min(Math.max(x - shift, 0), width - 1);
          const bidx = (y * width + bx) * 4;
          data[idx + 2] = copy[bidx + 2]; // B from shifted position
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }

  // Highlight compression (tone map bright pixels)
  if (!realtime && settings.highlightCompression > 0.01) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const comp = settings.highlightCompression;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = toneMap(data[i], comp);
      data[i + 1] = toneMap(data[i + 1], comp);
      data[i + 2] = toneMap(data[i + 2], comp);
    }
    ctx.putImageData(imageData, 0, 0);
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(255, v));
}

function toneMap(value: number, compression: number): number {
  const v = value / 255;
  const mapped = v / (1 + v * compression);
  // Re-normalize so midtones stay roughly the same
  const midCorrection = 1 + 0.5 * compression;
  return clamp(mapped * midCorrection * 255);
}

// ─── Image loader hook (triggers re-render) ─────────────────────

function useImageLoader(url: string | null): HTMLImageElement | null {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => setImage(img);
    img.onerror = () => setImage(null);
    img.src = url;

    // If already cached, it may fire synchronously
    if (img.complete && img.naturalWidth > 0) {
      setImage(img);
    }

    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);

  return image;
}

// ─── Video loader hook (triggers re-render once ready) ──────────

function useVideoLoader(url: string | null): HTMLVideoElement | null {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!url) {
      setVideo(null);
      return;
    }

    const el = document.createElement('video');
    el.crossOrigin = 'anonymous';
    el.preload = 'auto';
    el.muted = true;
    el.loop = true;
    el.playsInline = true;

    const onReady = () => {
      setVideo(el);
      el.play().catch(() => {
        // Autoplay may be blocked — still usable for drawing frames
      });
    };

    el.addEventListener('canplaythrough', onReady, { once: true });
    // Fallback: some browsers only fire canplay
    el.addEventListener('canplay', onReady, { once: true });
    el.addEventListener('error', () => setVideo(null), { once: true });

    el.src = url;
    el.load();

    return () => {
      el.pause();
      el.removeAttribute('src');
      el.load(); // abort pending loads
      setVideo(null);
    };
  }, [url]);

  return video;
}
