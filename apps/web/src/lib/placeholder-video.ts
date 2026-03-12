/**
 * Generate a placeholder looping video in the browser using Canvas + MediaRecorder.
 * Returns a blob URL suitable for use as baseMediaUrl.
 */
export async function generatePlaceholderVideo(
  width: number,
  height: number,
  durationMs = 6000,
  fps = 24,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new Error('No 2D context')); return; }

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(URL.createObjectURL(blob));
    };

    recorder.onerror = () => reject(new Error('MediaRecorder error'));

    // Render animated frames
    const frameInterval = 1000 / fps;
    let elapsed = 0;
    const startTime = performance.now();

    recorder.start();

    function renderFrame() {
      const t = elapsed / durationMs; // normalized 0..1
      const time = elapsed / 1000;

      // Dark urban scene
      const skyGrad = ctx!.createLinearGradient(0, 0, 0, height * 0.6);
      skyGrad.addColorStop(0, '#0d0d18');
      skyGrad.addColorStop(1, '#1a1a2e');
      ctx!.fillStyle = skyGrad;
      ctx!.fillRect(0, 0, width, height);

      // Ground
      ctx!.fillStyle = '#16161a';
      ctx!.fillRect(0, height * 0.62, width, height * 0.38);

      // Buildings
      const buildingData = [
        { x: 0, w: 0.18, h: 0.48, color: '#13131a' },
        { x: 0.2, w: 0.15, h: 0.38, color: '#15151d' },
        { x: 0.65, w: 0.18, h: 0.52, color: '#12121a' },
        { x: 0.85, w: 0.15, h: 0.42, color: '#14141c' },
      ];

      for (const b of buildingData) {
        ctx!.fillStyle = b.color;
        const bx = b.x * width;
        const bh = b.h * height;
        const by = height * 0.62 - bh;
        ctx!.fillRect(bx, by, b.w * width, bh);

        // Animated windows
        ctx!.fillStyle = `rgba(255,220,150,${0.08 + 0.05 * Math.sin(time * 0.5)})`;
        const cols = Math.floor(b.w * width / 22);
        const rows = Math.floor(bh / 28);
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            if ((row + col + Math.floor(time * 2)) % 3 !== 0) {
              ctx!.fillRect(bx + 4 + col * 20, by + 6 + row * 26, 10, 14);
            }
          }
        }
      }

      // Central structure / wall
      ctx!.fillStyle = '#1e1e28';
      ctx!.fillRect(width * 0.28, height * 0.08, width * 0.44, height * 0.72);

      // Screen area (dark)
      ctx!.fillStyle = '#0a0a0e';
      ctx!.fillRect(width * 0.32, height * 0.14, width * 0.36, height * 0.52);

      // Screen bezel
      ctx!.strokeStyle = 'rgba(80,80,80,0.4)';
      ctx!.lineWidth = 2;
      ctx!.strokeRect(width * 0.32, height * 0.14, width * 0.36, height * 0.52);

      // Ambient glow (animated)
      const glowIntensity = 0.03 + 0.01 * Math.sin(time * 1.2);
      const glow = ctx!.createRadialGradient(
        width * 0.5, height * 0.4, 0,
        width * 0.5, height * 0.4, width * 0.4
      );
      glow.addColorStop(0, `rgba(200,180,255,${glowIntensity})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, width, height);

      // Moving car headlights on the ground
      const carX = ((time * 0.15) % 1.4 - 0.2) * width;
      const headlight = ctx!.createRadialGradient(carX, height * 0.75, 0, carX, height * 0.75, width * 0.08);
      headlight.addColorStop(0, 'rgba(255,240,200,0.06)');
      headlight.addColorStop(1, 'rgba(0,0,0,0)');
      ctx!.fillStyle = headlight;
      ctx!.fillRect(0, height * 0.62, width, height * 0.38);

      elapsed += frameInterval;

      if (elapsed < durationMs) {
        // Schedule next frame precisely relative to start
        const nextAt = startTime + elapsed;
        const delay = Math.max(0, nextAt - performance.now());
        setTimeout(renderFrame, delay);
      } else {
        recorder.stop();
      }
    }

    renderFrame();
  });
}
