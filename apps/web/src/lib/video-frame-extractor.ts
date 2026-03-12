/**
 * Extract a single frame from a video at a given time.
 * Returns a data URL (JPEG) of the captured frame.
 */
export function extractVideoFrame(
  videoUrl: string,
  time = 0,
  width?: number,
  height?: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };

    video.addEventListener('error', () => {
      cleanup();
      reject(new Error('Failed to load video for frame extraction'));
    }, { once: true });

    video.addEventListener('loadeddata', () => {
      video.currentTime = time;
    }, { once: true });

    video.addEventListener('seeked', () => {
      try {
        const w = width ?? video.videoWidth;
        const h = height ?? video.videoHeight;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        cleanup();
        resolve(dataUrl);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }, { once: true });

    video.src = videoUrl;
    video.load();
  });
}
