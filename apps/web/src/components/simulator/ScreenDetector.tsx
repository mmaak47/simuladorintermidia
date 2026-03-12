'use client';

import { useState, useCallback, useRef } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import { detectScreenHybrid, trackScreen } from '@dooh/core';
import type { ScreenCorners } from '@dooh/core';

/**
 * Extracts a single JPEG frame from a video blob URL.
 * Draws the current (first) frame onto an offscreen canvas and returns it as a File.
 */
function extractFrameFromVideo(videoUrl: string, w: number, h: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.currentTime = 0.1; // seek slightly in to avoid black frame

    video.addEventListener('seeked', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context unavailable'));
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Frame extraction failed'));
            resolve(new File([blob], 'location-frame.jpg', { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.92,
        );
      } catch (e) {
        reject(e);
      }
    }, { once: true });

    video.addEventListener('error', () => reject(new Error('Video load failed')), { once: true });
    video.src = videoUrl;
    video.load();
  });
}

/**
 * Fetches the video blob as a File for sending to the tracking endpoint.
 */
async function fetchVideoFile(url: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], 'location.mp4', { type: blob.type || 'video/mp4' });
}

/**
 * ScreenDetector — triggers the hybrid YOLO → SAM → OpenCV pipeline.
 *
 * For video locations, after detection it automatically runs optical-flow
 * tracking with periodic re-detection to handle moving cameras.
 */
export function ScreenDetector() {
  const { location, segmentation, hybridDetection, tracking, setHybridDetection, setTracking } =
    useCompositionStore();
  const [loading, setLoading] = useState(false);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileRef = useRef<File | null>(null);

  const handleDetect = useCallback(async () => {
    if (!location) return;

    setLoading(true);
    setError(null);

    try {
      let file = fileRef.current;
      if (!file) {
        if (location.type === 'video') {
          file = await extractFrameFromVideo(location.url, location.width, location.height);
        } else {
          const res = await fetch(location.url);
          const blob = await res.blob();
          file = new File([blob], 'location.jpg', { type: 'image/jpeg' });
        }
        fileRef.current = file;
      }

      const result = await detectScreenHybrid(file);
      setHybridDetection(result);

      // For video: auto-trigger tracking after detection
      if (location.type === 'video') {
        setTrackingLoading(true);
        try {
          const videoFile = await fetchVideoFile(location.url);
          const corners = result.corners as unknown as ScreenCorners;
          const trackResult = await trackScreen(videoFile, corners);
          setTracking(trackResult);
        } catch (trackErr) {
          console.error('Auto-tracking failed:', trackErr);
          // Detection succeeded, tracking is optional — don't overwrite the error
        } finally {
          setTrackingLoading(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha na detecção');
    } finally {
      setLoading(false);
    }
  }, [location, setHybridDetection, setTracking]);

  const detected = !!segmentation || !!hybridDetection;
  const confidence = hybridDetection?.confidence ?? segmentation?.confidence ?? 0;

  return (
    <div className="space-y-3">
      <button
        onClick={handleDetect}
        disabled={loading || trackingLoading}
        className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all duration-200"
      >
        {loading
          ? 'Detectando tela...'
          : trackingLoading
            ? 'Rastreando quadros...'
            : 'Detectar tela'}
      </button>

      {detected && (
        <div className="text-label text-green-400 font-body">
          ✓ Tela detectada (confiança: {(confidence * 100).toFixed(0)}%)
        </div>
      )}

      {tracking && (
        <div className="text-label text-blue-400 font-body">
          ✓ Rastreamento: {tracking.totalFrames} quadros @ {tracking.fps.toFixed(0)} fps
        </div>
      )}

      {hybridDetection && (
        <div className="text-[11px] text-neutral-500 space-y-0.5 font-body">
          <p>
            YOLO: {hybridDetection.debug.yolo_candidates.length} candidato(s)
          </p>
          <p>
            Retangularidade: {(hybridDetection.debug.rectangularity * 100).toFixed(0)}%
          </p>
          <p>
            Cobertura da máscara: {(hybridDetection.debug.mask_area_ratio * 100).toFixed(0)}%
          </p>
        </div>
      )}

      {error && <div className="text-label text-red-400 font-body">{error}</div>}

      <p className="text-[11px] text-neutral-600 font-body">
        O pipeline híbrido usa YOLO → SAM → OpenCV para detectar a tela
        física completa. {location?.type === 'video' ? 'Para vídeos, o rastreamento por quadro é executado automaticamente.' : 'Ajuste os cantos manualmente se necessário.'}
      </p>
    </div>
  );
}
