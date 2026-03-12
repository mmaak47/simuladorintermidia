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
  onFirstRender?: (canvas: HTMLCanvasElement) => void;
}

export function PreviewCanvas({ readOnly = false, editorMode, onFirstRender }: PreviewCanvasProps) {
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
        });

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
  }, [location, bgSource, bgVideo, creativeVideo, creativeSource, creative, corners, faces, tracking, keyframeData, keyframeCorners, segmentation, fitMode, display, cinematic, spill, timeOfDay, environment, ambient, autoTuneRequested, updateDisplay, updateCinematic, updateSpill, clearAutoTuneRequest, onFirstRender]);

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
  },
) {
  const [tl, tr, br, bl] = corners;
  const cw = creativeWidth;
  const ch = creativeHeight;

  // Compute UV fit
  const aspect = computeScreenAspect(corners);
  const fit = computeUvFit(cw, ch, aspect, fitMode);

  // Subdivision grid for perspective approximation
  // Lower subdivision in realtime video mode for significantly better FPS.
  const DIVS = options?.realtime ? 5 : 8;

  ctx.save();

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
