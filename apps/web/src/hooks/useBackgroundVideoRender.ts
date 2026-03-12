import { useCallback, useRef } from 'react';
import { useVideoRenderStore } from '@/store/video-render-store';

/**
 * Hook that drives background video rendering.
 *
 * Strategy: Locate the PreviewCanvas <canvas> in the DOM, capture its
 * stream via `captureStream()`, let the video play through once,
 * and record frames in real time with MediaRecorder.
 *
 * This reuses the EXACT same compositing pipeline — zero duplication.
 */
export function useBackgroundVideoRender() {
  const { setMode, setRenderProgress, setRenderedVideoUrl } = useVideoRenderStore();
  const abortRef = useRef(false);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const startRender = useCallback(async () => {
    abortRef.current = false;
    setMode('rendering');
    setRenderProgress(0);

    try {
      // Find the PreviewCanvas canvas in the DOM
      const canvas = document.querySelector('main canvas') as HTMLCanvasElement | null;
      if (!canvas) throw new Error('Canvas not found');

      // Find the background video element being used by PreviewCanvas.
      // useVideoLoader creates a <video> element in memory, but it's the
      // same one feeding the canvas. We locate it via the composition store's
      // location URL (set as the video's src).
      const videos = Array.from(document.querySelectorAll('video'));
      const bgVideo = videos.find((v) => v.src && v.duration > 0 && v.loop) ?? null;

      // Determine duration — fallback to 10s if no video element found
      const duration = bgVideo?.duration ?? 10;

      // Start capture stream from the canvas
      const stream = canvas.captureStream(30);
      const chunks: Blob[] = [];

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = () => {
        if (abortRef.current) return;
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setRenderedVideoUrl(url);
        setRenderProgress(100);
        setMode('complete');
      };

      recorder.onerror = () => {
        if (!abortRef.current) setMode('error');
      };

      // Rewind and play the video from the start
      if (bgVideo) {
        bgVideo.currentTime = 0;
        await bgVideo.play().catch(() => {});
      }

      recorder.start(100); // Collect data every 100ms

      // Progress tracking
      const progressInterval = setInterval(() => {
        if (abortRef.current) {
          clearInterval(progressInterval);
          return;
        }
        if (bgVideo) {
          const pct = Math.min(95, (bgVideo.currentTime / duration) * 95);
          setRenderProgress(Math.round(pct));
        }
      }, 250);

      // Stop after one full duration cycle
      const endTimer = setTimeout(() => {
        clearInterval(progressInterval);
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, duration * 1000 + 500);

      // If the video fires "ended" (even though it's looped, we catch it)
      const onEnded = () => {
        clearTimeout(endTimer);
        clearInterval(progressInterval);
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      };

      if (bgVideo) {
        // Temporarily disable loop so the video fires 'ended'
        bgVideo.loop = false;
        bgVideo.addEventListener('ended', onEnded, { once: true });

        // Restore loop when done
        const restoreLoop = () => { bgVideo.loop = true; };
        recorder.addEventListener('stop', restoreLoop, { once: true });
      }
    } catch {
      setMode('error');
    }
  }, [setMode, setRenderProgress, setRenderedVideoUrl]);

  const cancelRender = useCallback(() => {
    abortRef.current = true;
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop();
    }
    setMode('preview');
    setRenderProgress(0);
  }, [setMode, setRenderProgress]);

  return { startRender, cancelRender };
}
