/**
 * Generate placeholder scene images for DOOH demo points.
 * Run with: node scripts/generate-placeholders.mjs
 */
import { createCanvas } from 'canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(import.meta.dirname, '..', 'apps', 'web', 'public', 'placeholders');
mkdirSync(OUT_DIR, { recursive: true });

/** Draw a city scene with buildings and a screen area */
function drawScene(ctx, w, h, opts) {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.55);
  sky.addColorStop(0, opts.skyTop || '#1a1a2e');
  sky.addColorStop(1, opts.skyBottom || '#2d2d44');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  // Ground / floor
  ctx.fillStyle = opts.ground || '#1e1e1e';
  ctx.fillRect(0, h * 0.65, w, h * 0.35);

  // Ground perspective lines
  ctx.strokeStyle = 'rgba(60,60,60,0.3)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo(w * 0.5, h * 0.65);
    ctx.lineTo(w * (i / 7), h);
    ctx.stroke();
  }

  // Buildings silhouette
  const buildings = opts.buildings || [];
  for (const b of buildings) {
    ctx.fillStyle = b.color || '#16161a';
    ctx.fillRect(b.x * w, b.y * h, b.w * w, b.h * h);
    // Windows
    ctx.fillStyle = 'rgba(255,220,150,0.15)';
    const cols = Math.floor(b.w * w / 30);
    const rows = Math.floor(b.h * h / 35);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (Math.random() > 0.4) {
          const wx = b.x * w + 8 + col * 28;
          const wy = b.y * h + 10 + row * 32;
          ctx.fillRect(wx, wy, 14, 18);
        }
      }
    }
  }

  // Wall / structure around screen
  if (opts.wall) {
    ctx.fillStyle = opts.wall.color || '#2a2a30';
    ctx.fillRect(opts.wall.x * w, opts.wall.y * h, opts.wall.w * w, opts.wall.h * h);
  }

  // Screen placeholder (dark rect where the ad goes)
  if (opts.screen) {
    const sx = opts.screen.x * w, sy = opts.screen.y * h;
    const sw = opts.screen.w * w, sh = opts.screen.h * h;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(sx, sy, sw, sh);
    ctx.strokeStyle = 'rgba(80,80,80,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(sx, sy, sw, sh);

    // Screen bezel
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 4;
    ctx.strokeRect(sx - 2, sy - 2, sw + 4, sh + 4);
  }

  // Ambient lighting
  if (opts.ambientLight) {
    const grad = ctx.createRadialGradient(
      opts.ambientLight.x * w, opts.ambientLight.y * h, 0,
      opts.ambientLight.x * w, opts.ambientLight.y * h, opts.ambientLight.r * w
    );
    grad.addColorStop(0, opts.ambientLight.color || 'rgba(254,200,100,0.08)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Noise grain
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * 8;
    data[i] += n; data[i + 1] += n; data[i + 2] += n;
  }
  ctx.putImageData(imageData, 0, 0);
}

// ── Scene configs ──────────────────────────────────────────

const scenes = [
  // 1. Elevator lobby (vertical screen) 1920x1080
  {
    name: 'elevator-lobby', w: 1920, h: 1080,
    opts: {
      skyTop: '#0d0d12', skyBottom: '#1a1a22',
      ground: '#18181c',
      wall: { x: 0.3, y: 0.05, w: 0.4, h: 0.85, color: '#22222a' },
      screen: { x: 0.40, y: 0.15, w: 0.17, h: 0.52 },
      buildings: [],
      ambientLight: { x: 0.48, y: 0.4, r: 0.35, color: 'rgba(180,200,220,0.04)' },
    }
  },
  // 2. Billboard outdoor (wide) 3840x2160
  {
    name: 'billboard-outdoor', w: 3840, h: 2160,
    opts: {
      skyTop: '#0f1020', skyBottom: '#1e2030',
      ground: '#1a1a1e',
      buildings: [
        { x: 0, y: 0.25, w: 0.22, h: 0.45, color: '#16161a' },
        { x: 0.8, y: 0.15, w: 0.2, h: 0.55, color: '#14141a' },
      ],
      wall: { x: 0.12, y: 0.08, w: 0.75, h: 0.72, color: '#1e1e25' },
      screen: { x: 0.16, y: 0.14, w: 0.67, h: 0.56 },
      ambientLight: { x: 0.5, y: 0.4, r: 0.5, color: 'rgba(200,180,150,0.05)' },
    }
  },
  // 3. Totem indoor (vertical base) 1080x1920
  {
    name: 'totem-indoor', w: 1080, h: 1920,
    opts: {
      skyTop: '#12121a', skyBottom: '#1a1a24',
      ground: '#161618',
      wall: { x: 0.2, y: 0.02, w: 0.6, h: 0.95, color: '#1e1e24' },
      screen: { x: 0.22, y: 0.06, w: 0.56, h: 0.82 },
      buildings: [],
      ambientLight: { x: 0.5, y: 0.5, r: 0.5, color: 'rgba(160,180,200,0.04)' },
    }
  },
  // 4. LED panel indoor 1920x1080
  {
    name: 'led-indoor', w: 1920, h: 1080,
    opts: {
      skyTop: '#10101a', skyBottom: '#1a1a28',
      ground: '#14141a',
      wall: { x: 0.15, y: 0.08, w: 0.7, h: 0.8, color: '#20202a' },
      screen: { x: 0.22, y: 0.16, w: 0.56, h: 0.55 },
      buildings: [],
      ambientLight: { x: 0.5, y: 0.42, r: 0.4, color: 'rgba(100,150,255,0.04)' },
    }
  },
];

for (const scene of scenes) {
  const canvas = createCanvas(scene.w, scene.h);
  const ctx = canvas.getContext('2d');
  drawScene(ctx, scene.w, scene.h, scene.opts);
  const buf = canvas.toBuffer('image/jpeg', { quality: 0.88 });
  const path = join(OUT_DIR, `${scene.name}.jpg`);
  writeFileSync(path, buf);
  console.log(`Generated: ${path} (${(buf.length / 1024).toFixed(0)}KB)`);
}

console.log('\nDone! All placeholder scenes generated.');
