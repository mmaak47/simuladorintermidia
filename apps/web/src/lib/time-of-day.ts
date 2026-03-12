/**
 * Time-of-Day Simulation
 *
 * Overlays lighting shifts on the entire scene to simulate
 * how a DOOH screen looks at different times of day.  Applies:
 *
 * 1. Global color temperature shift (warm sunset → cool night)
 * 2. Ambient brightness reduction (daylight → dark)
 * 3. Screen relative brightness boost (screens "pop" more at night)
 * 4. Sky color gradient at horizon (subtle environmental cue)
 *
 * The simulation works as a canvas post-processing pass that
 * modifies the background (scene) while leaving the screen quad
 * relatively untouched — mirroring real-world behavior where
 * the screen brightness is constant but ambient light changes.
 */

/* ─── Time-of-Day Settings Type ───────────────────────── */

export interface TimeOfDaySettings {
  enabled: boolean;
  /** Time as decimal hours: 0-24 (e.g. 14.5 = 2:30 PM) */
  hour: number;
  /** Ambient light multiplier override (auto-computed if -1) */
  ambientOverride: number;
}

export const DEFAULT_TIME_OF_DAY: TimeOfDaySettings = {
  enabled: false,
  hour: 14, // 2 PM default (daylight)
  ambientOverride: -1,
};

/* ─── Lighting curves per hour ────────────────────────── */

interface LightProfile {
  /** Scene brightness multiplier 0-1 */
  ambient: number;
  /** Color temperature: [R multiplier, G multiplier, B multiplier] */
  tint: [number, number, number];
  /** Sky glow at top of image 0-1 */
  skyGlow: number;
  /** How much the screen stands out (additive boost) */
  screenPop: number;
}

/**
 * Compute lighting profile for a given hour.
 * Uses smooth interpolation between key time anchors.
 */
function getLightProfile(hour: number): LightProfile {
  // Normalize to 0-24
  const h = ((hour % 24) + 24) % 24;

  // Key profiles
  const profiles: [number, LightProfile][] = [
    [0,  { ambient: 0.08, tint: [0.7, 0.75, 1.2],  skyGlow: 0,    screenPop: 0.25 }], // midnight
    [5,  { ambient: 0.12, tint: [0.8, 0.8, 1.1],   skyGlow: 0.02, screenPop: 0.2 }],  // pre-dawn
    [6,  { ambient: 0.35, tint: [1.15, 0.9, 0.75],  skyGlow: 0.15, screenPop: 0.12 }], // dawn
    [7,  { ambient: 0.6,  tint: [1.1, 0.95, 0.85],  skyGlow: 0.1,  screenPop: 0.08 }], // morning
    [10, { ambient: 0.9,  tint: [1.0, 1.0, 1.0],   skyGlow: 0.05, screenPop: 0.02 }], // mid-morning
    [12, { ambient: 1.0,  tint: [1.0, 1.0, 1.0],   skyGlow: 0.03, screenPop: 0.0 }],  // noon
    [15, { ambient: 0.95, tint: [1.02, 0.98, 0.95], skyGlow: 0.04, screenPop: 0.01 }], // afternoon
    [17, { ambient: 0.7,  tint: [1.15, 0.92, 0.78], skyGlow: 0.12, screenPop: 0.06 }], // late afternoon
    [18, { ambient: 0.45, tint: [1.2, 0.85, 0.7],   skyGlow: 0.18, screenPop: 0.1 }],  // sunset
    [19, { ambient: 0.25, tint: [1.05, 0.82, 0.85], skyGlow: 0.08, screenPop: 0.15 }], // dusk
    [20, { ambient: 0.12, tint: [0.85, 0.8, 1.05],  skyGlow: 0.02, screenPop: 0.2 }],  // evening
    [22, { ambient: 0.08, tint: [0.75, 0.78, 1.15], skyGlow: 0,    screenPop: 0.25 }], // night
    [24, { ambient: 0.08, tint: [0.7, 0.75, 1.2],   skyGlow: 0,    screenPop: 0.25 }], // midnight (wrap)
  ];

  // Find surrounding anchors and interpolate
  let lower = profiles[0];
  let upper = profiles[profiles.length - 1];

  for (let i = 0; i < profiles.length - 1; i++) {
    if (h >= profiles[i][0] && h <= profiles[i + 1][0]) {
      lower = profiles[i];
      upper = profiles[i + 1];
      break;
    }
  }

  const range = upper[0] - lower[0];
  const t = range > 0 ? (h - lower[0]) / range : 0;

  const lerp = (a: number, b: number) => a + (b - a) * t;
  return {
    ambient: lerp(lower[1].ambient, upper[1].ambient),
    tint: [
      lerp(lower[1].tint[0], upper[1].tint[0]),
      lerp(lower[1].tint[1], upper[1].tint[1]),
      lerp(lower[1].tint[2], upper[1].tint[2]),
    ],
    skyGlow: lerp(lower[1].skyGlow, upper[1].skyGlow),
    screenPop: lerp(lower[1].screenPop, upper[1].screenPop),
  };
}

/* ─── Rendering ───────────────────────────────────────── */

/**
 * Apply time-of-day ambient lighting to the scene.
 * This should be called BEFORE drawing the creative into the quad,
 * so that the background is dimmed/tinted but the screen content
 * remains at full brightness (like a real screen).
 */
export function applyTimeOfDayToScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: TimeOfDaySettings,
) {
  if (!settings.enabled) return;

  const profile = getLightProfile(settings.hour);
  const ambient = settings.ambientOverride >= 0 ? settings.ambientOverride : profile.ambient;

  // 1. Darken scene based on ambient level
  if (ambient < 0.95) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const [rMul, gMul, bMul] = profile.tint;
    // Apply color temperature AND ambient dimming in one pass
    const r = Math.round(255 * rMul * ambient);
    const g = Math.round(255 * gMul * ambient);
    const b = Math.round(255 * bMul * ambient);
    ctx.fillStyle = `rgb(${Math.min(255, r)}, ${Math.min(255, g)}, ${Math.min(255, b)})`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  // 2. Sky glow (warm/cool gradient at the top)
  if (profile.skyGlow > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const grad = ctx.createLinearGradient(0, 0, 0, height * 0.4);
    const [rT, gT, bT] = profile.tint;
    const glowR = Math.round(200 * rT);
    const glowG = Math.round(160 * gT);
    const glowB = Math.round(120 * bT);
    grad.addColorStop(0, `rgba(${glowR}, ${glowG}, ${glowB}, ${profile.skyGlow})`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height * 0.4);
    ctx.restore();
  }
}

/**
 * Apply screen "pop" effect — makes the screen quad brighter
 * relative to the dimmed scene.  Call AFTER drawing the creative.
 */
export function applyScreenPop(
  ctx: CanvasRenderingContext2D,
  corners: import('@dooh/core').ScreenCorners,
  settings: TimeOfDaySettings,
) {
  if (!settings.enabled) return;

  const profile = getLightProfile(settings.hour);
  if (profile.screenPop < 0.01) return;

  const [tl, tr, br, bl] = corners;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = profile.screenPop;

  ctx.beginPath();
  ctx.moveTo(tl.x, tl.y);
  ctx.lineTo(tr.x, tr.y);
  ctx.lineTo(br.x, br.y);
  ctx.lineTo(bl.x, bl.y);
  ctx.closePath();
  ctx.clip();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(
    Math.min(tl.x, bl.x), Math.min(tl.y, tr.y),
    Math.max(tr.x, br.x) - Math.min(tl.x, bl.x),
    Math.max(bl.y, br.y) - Math.min(tl.y, tr.y),
  );
  ctx.restore();
}

/** Format hour to readable time string */
export function formatHour(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour % 1) * 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}
