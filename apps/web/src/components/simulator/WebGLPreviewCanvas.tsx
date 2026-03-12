'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { CompositorScene } from '@dooh/render';
import { useCompositionStore } from '@/store/composition-store';
import { computeUvFit, computeScreenAspect, interpolateCornersAtTime, isValidScreenQuad, orderCorners } from '@dooh/core';
import type { SceneMatchParams, ScreenCorners, TrackingResponse, KeyframeCorners } from '@dooh/core';
import type { TimeOfDaySettings } from '@/lib/time-of-day';
import type { EnvironmentSettings } from '@/lib/environment-effects';

interface WebGLPreviewCanvasProps {
  onFirstRender?: (canvas: HTMLCanvasElement) => void;
  onWebGLError?: () => void;
}

function getCornersForTime(
  keyframeCorners: KeyframeCorners[],
  fps: number,
  tracking: TrackingResponse | null,
  currentTime: number,
  staticCorners: ScreenCorners | null,
): ScreenCorners | null {
  if (keyframeCorners.length > 0) {
    const interp = interpolateCornersAtTime(keyframeCorners, currentTime, fps);
    if (interp) return interp;
  }

  if (tracking && tracking.frames.length > 0) {
    const frameIndex = Math.round(currentTime * tracking.fps);
    const idx = Math.max(0, Math.min(frameIndex, tracking.frames.length - 1));
    return tracking.frames[idx].corners;
  }

  return staticCorners;
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

function mapSceneMatch(timeOfDay: TimeOfDaySettings, environment: EnvironmentSettings): SceneMatchParams {
  let exposureOffset = 0;
  let saturation = 1;
  let temperatureBias = 0;
  let highlightCompress = 0.12;

  if (timeOfDay.enabled) {
    const hour = ((timeOfDay.hour % 24) + 24) % 24;

    if (hour >= 19 || hour < 6) {
      exposureOffset -= 0.08;
      saturation *= 0.95;
      temperatureBias -= 450;
      highlightCompress += 0.1;
    } else if (hour >= 6 && hour < 8) {
      temperatureBias += 650;
      saturation *= 1.04;
    } else if (hour >= 17 && hour < 19) {
      temperatureBias += 420;
      saturation *= 1.02;
    }
  }

  if (environment.fog.enabled) {
    const fog = Math.max(0, Math.min(1, environment.fog.density));
    saturation *= 1 - fog * 0.22;
    highlightCompress += fog * 0.3;
    exposureOffset -= fog * 0.06;
  }

  if (environment.rain.enabled) {
    const rain = Math.max(0, Math.min(1, environment.rain.intensity));
    saturation *= 1 - rain * 0.12;
    highlightCompress += rain * 0.12;
  }

  if (environment.sunGlare.enabled) {
    const glare = Math.max(0, Math.min(1, environment.sunGlare.intensity));
    highlightCompress += glare * 0.2;
    exposureOffset += glare * 0.03;
  }

  return {
    exposureOffset,
    saturation,
    temperatureBias,
    highlightCompress: Math.max(0, Math.min(1, highlightCompress)),
  };
}

export function WebGLPreviewCanvas({ onFirstRender, onWebGLError }: WebGLPreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const compositorRef = useRef<CompositorScene | null>(null);
  const postSceneRef = useRef<THREE.Scene | null>(null);
  const postCameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const bgTextureRef = useRef<THREE.Texture | null>(null);
  const creativeTextureRef = useRef<THREE.Texture | null>(null);
  const rafRef = useRef<number>(0);
  const firstRenderFiredRef = useRef(false);

  const {
    location,
    corners,
    faces,
    tracking,
    keyframeData,
    keyframeCorners,
    creative,
    fitMode,
    display,
    cinematic,
    timeOfDay,
    environment,
  } = useCompositionStore();

  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  const [bgVideo, setBgVideo] = useState<HTMLVideoElement | null>(null);
  const [creativeImage, setCreativeImage] = useState<HTMLImageElement | null>(null);
  const [creativeVideo, setCreativeVideo] = useState<HTMLVideoElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [bgLoading, setBgLoading] = useState(false);
  const [bgError, setBgError] = useState(false);

  useEffect(() => {
    firstRenderFiredRef.current = false;
  }, [creative?.url, location?.url]);

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

  const displaySize = useMemo(() => {
    if (!location || containerSize.w <= 0 || containerSize.h <= 0) return null;
    const imgAspect = location.width / location.height;
    const boxAspect = containerSize.w / containerSize.h;
    if (imgAspect > boxAspect) {
      return { width: containerSize.w, height: Math.round(containerSize.w / imgAspect) };
    }
    return { width: Math.round(containerSize.h * imgAspect), height: containerSize.h };
  }, [location, containerSize]);

  useEffect(() => {
    if (!location) {
      setBgImage(null);
      setBgVideo(null);
      setBgLoading(false);
      setBgError(false);
      return;
    }

    setBgError(false);

    if (location.type === 'image') {
      const img = new Image();
      setBgLoading(true);
      img.onload = () => { setBgImage(img); setBgLoading(false); };
      img.onerror = () => {
        setBgImage(null);
        setBgLoading(false);
        setBgError(true);
        onWebGLError?.();
      };
      img.src = location.url;
      if (img.complete && img.naturalWidth > 0) { setBgImage(img); setBgLoading(false); }
      return () => {
        img.onload = null;
        img.onerror = null;
      };
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    const onReady = () => {
      setBgVideo(video);
      video.play().catch(() => {});
    };

    video.addEventListener('canplaythrough', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', () => {
      setBgVideo(null);
      setBgError(true);
      onWebGLError?.();
    }, { once: true });
    video.src = location.url;
    video.load();

    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setBgVideo(null);
    };
  }, [location]);

  useEffect(() => {
    if (!creative) {
      setCreativeImage(null);
      setCreativeVideo(null);
      return;
    }

    if (creative.type === 'image') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => setCreativeImage(img);
      img.onerror = () => setCreativeImage(null);
      img.src = creative.url;
      if (img.complete && img.naturalWidth > 0) setCreativeImage(img);
      return () => {
        img.onload = null;
        img.onerror = null;
      };
    }

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;

    const onReady = () => {
      setCreativeVideo(video);
      video.play().catch(() => {});
    };

    video.addEventListener('canplaythrough', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', () => setCreativeVideo(null), { once: true });
    video.src = creative.url;
    video.load();

    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setCreativeVideo(null);
    };
  }, [creative]);

  useEffect(() => {
    if (!location || !mountRef.current) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    } catch {
      onWebGLError?.();
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(location.width, location.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    mountRef.current.innerHTML = '';
    mountRef.current.appendChild(renderer.domElement);

    rendererRef.current = renderer;
    compositorRef.current = new CompositorScene(location.width, location.height, display, cinematic);
    postSceneRef.current = new THREE.Scene();
    postCameraRef.current = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    postSceneRef.current.add(compositorRef.current.cinematic.fullscreenQuad);

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (bgTextureRef.current) {
        bgTextureRef.current.dispose();
        bgTextureRef.current = null;
      }
      if (creativeTextureRef.current) {
        creativeTextureRef.current.dispose();
        creativeTextureRef.current = null;
      }
      compositorRef.current?.dispose();
      compositorRef.current = null;
      postSceneRef.current = null;
      postCameraRef.current = null;
      rendererRef.current?.dispose();
      rendererRef.current = null;
      if (mountRef.current) {
        mountRef.current.innerHTML = '';
      }
    };
  }, [location?.url, location?.width, location?.height, onWebGLError]);

  useEffect(() => {
    const compositor = compositorRef.current;
    if (!compositor) return;
    compositor.display.updateSettings(display);
    compositor.glass.updateSettings({
      glassRoughness: display.glassRoughness,
      glassReflectivity: display.glassReflectivity,
    });
    compositor.cinematic.updateSettings(cinematic);
  }, [display, cinematic]);

  useEffect(() => {
    const compositor = compositorRef.current;
    if (!compositor) return;

    if (bgTextureRef.current) {
      bgTextureRef.current.dispose();
      bgTextureRef.current = null;
    }

    const source = bgVideo ?? bgImage;
    if (!source) return;

    const texture = source instanceof HTMLVideoElement
      ? new THREE.VideoTexture(source)
      : new THREE.Texture(source);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    bgTextureRef.current = texture;
    compositor.setBackground(texture);
  }, [bgImage, bgVideo]);

  useEffect(() => {
    const compositor = compositorRef.current;
    if (!compositor || !creative) return;

    if (creativeTextureRef.current) {
      creativeTextureRef.current.dispose();
      creativeTextureRef.current = null;
    }

    const source = creativeVideo ?? creativeImage;
    if (!source) return;

    const texture = source instanceof HTMLVideoElement
      ? new THREE.VideoTexture(source)
      : new THREE.Texture(source);

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;

    creativeTextureRef.current = texture;
    compositor.display.setCreativeTexture(texture);
  }, [creative, creativeImage, creativeVideo]);

  const renderLoop = useCallback((time: number) => {
    const renderer = rendererRef.current;
    const compositor = compositorRef.current;
    if (!renderer || !compositor || !location) return;

    const currentTime = bgVideo ? bgVideo.currentTime : 0;
    const kfFps = keyframeData?.fps ?? 30;
    const activeCorners = getCornersForTime(keyframeCorners, kfFps, tracking, currentTime, corners);

    const usesDynamicCorners = keyframeCorners.length > 0 || !!tracking;
    const sourceFaces: ScreenCorners[] = usesDynamicCorners
      ? (activeCorners ? [activeCorners] : [])
      : (faces.length > 0 ? faces : (activeCorners ? [activeCorners] : []));

    const face = sourceFaces.map((f) => sanitizeCorners(f)).find((f): f is ScreenCorners => !!f);

    if (face) {
      compositor.setScreenCorners(face);
      if (creative) {
        const cw = creative.width || location.width;
        const ch = creative.height || location.height;

        const screenAspect = computeScreenAspect(face);
        const fit = computeUvFit(cw, ch, screenAspect, fitMode);
        compositor.display.setUvFit(
          { x: fit.offsetX, y: fit.offsetY },
          { x: fit.scaleX, y: fit.scaleY },
        );
      }
    }

    const sceneMatch = mapSceneMatch(timeOfDay, environment);
    compositor.applySceneMatch(sceneMatch);

    compositor.cinematic.tick(time * 0.001);

    if (cinematic.enabled) {
      renderer.setRenderTarget(compositor.cinematic.sceneTarget);
      renderer.render(compositor.scene, compositor.camera);

      renderer.setRenderTarget(compositor.cinematic.bloomTarget);
      renderer.render(compositor.scene, compositor.camera);

      renderer.setRenderTarget(null);
      if (postSceneRef.current && postCameraRef.current) {
        renderer.render(postSceneRef.current, postCameraRef.current);
      }
    } else {
      renderer.setRenderTarget(null);
      renderer.render(compositor.scene, compositor.camera);
    }

    if (!firstRenderFiredRef.current && onFirstRender && creative) {
      firstRenderFiredRef.current = true;
      onFirstRender(renderer.domElement);
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  }, [location, bgVideo, keyframeData?.fps, keyframeCorners, tracking, corners, faces, creative, fitMode, timeOfDay, environment, cinematic.enabled, onFirstRender]);

  useEffect(() => {
    if (!location || !rendererRef.current || !compositorRef.current) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [location, renderLoop]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !displaySize) return;
    renderer.domElement.style.width = `${displaySize.width}px`;
    renderer.domElement.style.height = `${displaySize.height}px`;
    renderer.domElement.style.display = 'block';
  }, [displaySize]);

  if (!location) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 flex items-center justify-center p-4">
      <div ref={mountRef} className="block" />
      {bgLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
            <span className="text-xs text-neutral-500 font-body">Carregando imagem...</span>
          </div>
        </div>
      )}
      {bgError && !bgLoading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-center px-8">
            <span className="text-2xl">⚠️</span>
            <span className="text-xs text-neutral-500 font-body">Imagem base não disponível para este ponto</span>
          </div>
        </div>
      )}
    </div>
  );
}
