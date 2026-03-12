/**
 * Environment Effects Layer
 *
 * Post-processing effects that simulate real-world environmental
 * conditions affecting the DOOH screen visibility:
 *
 * - Rain: droplets on glass surface, wet reflections
 * - Sun glare: bright lens flare hitting the screen
 * - Fog/haze: reduced contrast, atmospheric scattering
 *
 * Each effect runs as a canvas overlay pass after compositing.
 */

/* ─── Settings ────────────────────────────────────────── */

export interface EnvironmentSettings {
  /** Rain droplets on the screen glass */
  rain: {
    enabled: boolean;
    /** 0..1 — from light drizzle to downpour */
    intensity: number;
  };
  /** Sun glare hitting the screen */
  sunGlare: {
    enabled: boolean;
    /** 0..1 */
    intensity: number;
    /** Angle of sun in degrees (0 = top, 90 = right, etc.) */
    angle: number;
  };
  /** Atmospheric fog / haze */
  fog: {
    enabled: boolean;
    /** 0..1 — density */
    density: number;
  };
}

export const DEFAULT_ENVIRONMENT: EnvironmentSettings = {
  rain: { enabled: false, intensity: 0.3 },
  sunGlare: { enabled: false, intensity: 0.4, angle: 30 },
  fog: { enabled: false, density: 0.2 },
};

/* ─── Rain droplets ───────────────────────────────────── */

// Persistent droplet positions (regenerated when intensity changes significantly)
let _droplets: { x: number; y: number; size: number; opacity: number }[] = [];
let _lastIntensity = -1;
let _dropletsFrame = 0;

function generateDroplets(width: number, height: number, intensity: number) {
  const count = Math.round(60 + intensity * 200);
  _droplets = [];
  for (let i = 0; i < count; i++) {
    _droplets.push({
      x: Math.random() * width,
      y: Math.random() * height,
      size: 1 + Math.random() * (2 + intensity * 3),
      opacity: 0.15 + Math.random() * 0.35 * intensity,
    });
  }
  _lastIntensity = intensity;
}

export function drawRainDroplets(
  ctx: CanvasRenderingContext2D,
  corners: import('@dooh/core').ScreenCorners,
  intensity: number,
) {
  if (intensity < 0.01) return;

  const [tl, tr, br, bl] = corners;

  // Compute screen bounding box
  const minX = Math.min(tl.x, bl.x);
  const maxX = Math.max(tr.x, br.x);
  const minY = Math.min(tl.y, tr.y);
  const maxY = Math.max(bl.y, br.y);
  const w = maxX - minX;
  const h = maxY - minY;

  // Regenerate droplets periodically or when intensity changes
  _dropletsFrame++;
  if (Math.abs(intensity - _lastIntensity) > 0.05 || _dropletsFrame % 90 === 0) {
    generateDroplets(w, h, intensity);
  }

  ctx.save();

  // Clip to screen quad
  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.clip();

  // Draw each droplet as a semi-transparent highlight with specular accent
  for (const drop of _droplets) {
    const dx = minX + drop.x;
    const dy = minY + drop.y;

    // Droplet body (distorted highlight)
    const grad = ctx.createRadialGradient(
      dx - drop.size * 0.3, dy - drop.size * 0.3, 0,
      dx, dy, drop.size,
    );
    grad.addColorStop(0, `rgba(255, 255, 255, ${drop.opacity * 0.8})`);
    grad.addColorStop(0.4, `rgba(200, 210, 220, ${drop.opacity * 0.3})`);
    grad.addColorStop(1, `rgba(150, 160, 180, 0)`);

    ctx.beginPath();
    ctx.ellipse(dx, dy, drop.size, drop.size * 1.3, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Tiny specular highlight
    ctx.beginPath();
    ctx.arc(dx - drop.size * 0.25, dy - drop.size * 0.25, drop.size * 0.25, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${drop.opacity})`;
    ctx.fill();
  }

  // Overall wet-glass overlay: slight darkening + reflection
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgba(200, 210, 220, ${1 - intensity * 0.08})`;
  ctx.fillRect(minX, minY, w, h);

  ctx.restore();
}

/* ─── Sun Glare ───────────────────────────────────────── */

export function drawSunGlare(
  ctx: CanvasRenderingContext2D,
  corners: import('@dooh/core').ScreenCorners,
  intensity: number,
  angleDeg: number,
) {
  if (intensity < 0.01) return;

  const [tl, tr, br, bl] = corners;
  const cx = (tl.x + tr.x + br.x + bl.x) / 4;
  const cy = (tl.y + tr.y + br.y + bl.y) / 4;
  const screenW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const screenH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const screenDiag = Math.hypot(screenW, screenH);

  // Glare source position (outside screen, at the given angle)
  const angleRad = (angleDeg * Math.PI) / 180;
  const glareDist = screenDiag * 0.3;
  const gx = cx + Math.cos(angleRad) * glareDist;
  const gy = cy - Math.sin(angleRad) * glareDist; // Y inverted in canvas

  ctx.save();

  // Large soft radial glow
  const outerRadius = screenDiag * 0.8;
  const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, outerRadius);
  grad.addColorStop(0, `rgba(255, 250, 230, ${intensity * 0.4})`);
  grad.addColorStop(0.2, `rgba(255, 245, 200, ${intensity * 0.2})`);
  grad.addColorStop(0.5, `rgba(255, 240, 180, ${intensity * 0.08})`);
  grad.addColorStop(1, 'rgba(255, 240, 180, 0)');

  ctx.globalCompositeOperation = 'screen';
  ctx.fillStyle = grad;
  ctx.fillRect(
    Math.min(tl.x, bl.x) - outerRadius,
    Math.min(tl.y, tr.y) - outerRadius,
    (Math.max(tr.x, br.x) - Math.min(tl.x, bl.x)) + outerRadius * 2,
    (Math.max(bl.y, br.y) - Math.min(tl.y, tr.y)) + outerRadius * 2,
  );

  // Streak lines (4-6 light rays emanating from glare point)
  const streakCount = 6;
  ctx.globalAlpha = intensity * 0.15;
  ctx.strokeStyle = 'rgba(255, 250, 220, 0.5)';
  ctx.lineWidth = Math.max(1, screenDiag * 0.003);

  for (let i = 0; i < streakCount; i++) {
    const a = angleRad + (i / streakCount) * Math.PI * 2;
    const streakLen = screenDiag * (0.3 + Math.random() * 0.3);
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx + Math.cos(a) * streakLen, gy + Math.sin(a) * streakLen);
    ctx.stroke();
  }

  // Bright hotspot inside screen where glare hits
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = intensity * 0.12;

  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.clip();

  const hotspotGrad = ctx.createRadialGradient(gx, gy, 0, gx, gy, screenDiag * 0.5);
  hotspotGrad.addColorStop(0, 'rgba(255, 250, 235, 0.8)');
  hotspotGrad.addColorStop(1, 'rgba(255, 250, 235, 0)');
  ctx.fillStyle = hotspotGrad;
  ctx.fillRect(
    Math.min(tl.x, bl.x), Math.min(tl.y, tr.y),
    Math.max(tr.x, br.x) - Math.min(tl.x, bl.x),
    Math.max(bl.y, br.y) - Math.min(tl.y, tr.y),
  );

  ctx.restore();
}

/* ─── Fog / Haze ──────────────────────────────────────── */

export function drawFog(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  density: number,
) {
  if (density < 0.01) return;

  ctx.save();

  // Overall haze: reduces contrast by blending toward a neutral gray
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = density * 0.3;
  ctx.fillStyle = 'rgba(180, 190, 200, 1)';
  ctx.fillRect(0, 0, width, height);

  // Layered depth fog — thicker at edges/bottom
  const grad = ctx.createLinearGradient(0, height * 0.3, 0, height);
  grad.addColorStop(0, `rgba(180, 190, 200, 0)`);
  grad.addColorStop(1, `rgba(180, 190, 200, ${density * 0.2})`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.restore();
}

/* ─── Combined environment effects pass ───────────────── */

export function applyEnvironmentEffects(
  ctx: CanvasRenderingContext2D,
  corners: import('@dooh/core').ScreenCorners | null,
  width: number,
  height: number,
  env: EnvironmentSettings,
) {
  // Fog affects the whole scene
  if (env.fog.enabled) {
    drawFog(ctx, width, height, env.fog.density);
  }

  // Rain and sun glare affect the screen area
  if (corners) {
    if (env.rain.enabled) {
      drawRainDroplets(ctx, corners, env.rain.intensity);
    }
    if (env.sunGlare.enabled) {
      drawSunGlare(ctx, corners, env.sunGlare.intensity, env.sunGlare.angle);
    }
  }
}
