/**
 * Scene-Adaptive Auto-Tuning Engine
 *
 * Analyzes the scene (location background) and creative content
 * to automatically suggest optimal display and cinematic settings.
 *
 * Uses the ColorAnalysisEngine to extract scene characteristics,
 * then applies heuristics to set screen brightness, spill
 * intensity, glass tint, and cinematic parameters.
 */

import type { DisplaySettings, CinematicSettings, SpillSettings, ScreenCorners } from '@dooh/core';
import type { ColorAnalysisResult } from './color-analysis';

/* ─── Auto-tuned result ───────────────────────────────── */

export interface AutoTuneResult {
  display: Partial<DisplaySettings>;
  cinematic: Partial<CinematicSettings>;
  spill: Partial<SpillSettings>;
  /** Human-readable explanation of adjustments */
  reasons: string[];
}

/* ─── Scene characteristics ───────────────────────────── */

interface SceneProfile {
  /** Average scene brightness 0-1 */
  brightness: number;
  /** Whether scene is predominantly warm (>0.5) or cool (<0.5) */
  warmth: number;
  /** High-contrast scene (outdoor daylight) vs low-contrast (indoor) */
  contrast: number;
  /** Estimated time-of-day category */
  timeOfDay: 'day' | 'dusk' | 'night' | 'indoor';
}

function classifyScene(sceneColors: ColorAnalysisResult): SceneProfile {
  const { dominantColor, avgBrightness, highlightStrength } = sceneColors;
  const [r, g, b] = dominantColor;

  // Warmth: high R relative to B = warm
  const warmth = Math.max(0, Math.min(1, (r - b + 128) / 256));

  // Contrast heuristic: high brightness + high highlights = day
  const contrast = Math.min(1, highlightStrength * 2 + avgBrightness * 0.5);

  // Time-of-day classification
  let timeOfDay: SceneProfile['timeOfDay'] = 'indoor';
  if (avgBrightness > 0.55 && highlightStrength > 0.2) {
    timeOfDay = 'day';
  } else if (avgBrightness > 0.3 && avgBrightness <= 0.55) {
    timeOfDay = 'dusk';
  } else if (avgBrightness < 0.15) {
    timeOfDay = 'night';
  }

  return { brightness: avgBrightness, warmth, contrast, timeOfDay };
}

/* ─── Auto-tune logic ─────────────────────────────────── */

/**
 * Compute optimal settings based on scene and creative analysis.
 *
 * Rules:
 * - Dark scene → lower screen nits (screen should not look blown-out)
 * - Bright scene → higher nits to remain visible
 * - Night scene → stronger spill, more bloom
 * - Indoor/dim → moderate spill, subtle cinematic
 * - Warm scene → slight warm glass tint
 * - Cool scene → slight cool glass tint
 * - High-highlight creative → more highlight compression
 */
export function autoTune(
  sceneColors: ColorAnalysisResult,
  creativeColors: ColorAnalysisResult | null,
): AutoTuneResult {
  const scene = classifyScene(sceneColors);
  const reasons: string[] = [];
  const display: Partial<DisplaySettings> = {};
  const cinematic: Partial<CinematicSettings> = {};
  const spill: Partial<SpillSettings> = {};

  // ── Screen brightness (nits) ────────────────────────────
  if (scene.timeOfDay === 'day') {
    display.screenNits = 1800;
    reasons.push('Cena diurna detectada — nits altos para visibilidade');
  } else if (scene.timeOfDay === 'dusk') {
    display.screenNits = 1000;
    reasons.push('Cena ao entardecer — nits moderados');
  } else if (scene.timeOfDay === 'night') {
    display.screenNits = 500;
    reasons.push('Cena noturna — nits baixos para evitar estourar');
  } else {
    display.screenNits = 700;
    reasons.push('Ambiente interno detectado — nits padrão');
  }

  // ── Glass reflection ────────────────────────────────────
  if (scene.brightness > 0.5) {
    display.glassReflectivity = 0.15;
    reasons.push('Cena clara — reflexo de vidro aumentado');
  } else {
    display.glassReflectivity = 0.05;
    reasons.push('Cena escura — reflexo de vidro reduzido');
  }

  // ── Spill settings ─────────────────────────────────────
  if (scene.timeOfDay === 'night') {
    spill.intensity = 0.6;
    spill.radius = 0.55;
    reasons.push('Noturno — light spill forte (efeito visual dramático)');
  } else if (scene.timeOfDay === 'dusk') {
    spill.intensity = 0.4;
    spill.radius = 0.4;
    reasons.push('Entardecer — spill moderado');
  } else if (scene.timeOfDay === 'day') {
    spill.intensity = 0.15;
    spill.radius = 0.25;
    reasons.push('Diurno — spill leve (menos visível sob sol)');
  } else {
    spill.intensity = 0.35;
    spill.radius = 0.4;
    reasons.push('Interno — spill padrão');
  }

  // ── Cinematic settings ──────────────────────────────────
  cinematic.enabled = true;

  if (scene.timeOfDay === 'night') {
    cinematic.bloomIntensity = 0.25;
    cinematic.vignetteIntensity = 0.2;
    cinematic.grainIntensity = 0.08;
    reasons.push('Noturno — bloom forte, vinheta dramática');
  } else if (scene.timeOfDay === 'dusk') {
    cinematic.bloomIntensity = 0.18;
    cinematic.vignetteIntensity = 0.15;
    cinematic.grainIntensity = 0.06;
    reasons.push('Entardecer — efeitos cinematográficos médios');
  } else {
    cinematic.bloomIntensity = 0.08;
    cinematic.vignetteIntensity = 0.1;
    cinematic.grainIntensity = 0.04;
    reasons.push('Diurno/Interno — efeitos sutis');
  }

  // ── Creative-based adjustments ──────────────────────────
  if (creativeColors) {
    if (creativeColors.highlightStrength > 0.4) {
      cinematic.highlightCompression = 0.35;
      reasons.push('Criativo com áreas brilhantes — highlight compression aumentado');
    }
    if (creativeColors.avgBrightness > 0.7) {
      // Very bright creative: slightly boost nits, strong spill
      display.screenNits = Math.min(2500, (display.screenNits ?? 700) + 300);
      spill.intensity = Math.min(1, (spill.intensity ?? 0.35) + 0.1);
      reasons.push('Criativo predominantemente claro — brilho e spill aumentados');
    } else if (creativeColors.avgBrightness < 0.2) {
      // Dark creative: reduce spill
      spill.intensity = Math.max(0.1, (spill.intensity ?? 0.35) - 0.15);
      reasons.push('Criativo escuro — spill reduzido');
    }
  }

  return { display, cinematic, spill, reasons };
}

/* ─── Convenience: analyze scene from canvas region ───── */

/**
 * Sample the background around (but not inside) the screen quad.
 * Returns a rough average color of the surrounding environment.
 */
export function sampleSceneAroundScreen(
  ctx: CanvasRenderingContext2D,
  corners: ScreenCorners,
  canvasWidth: number,
  canvasHeight: number,
): { r: number; g: number; b: number; brightness: number } {
  const SAMPLES = 20;
  const [tl, tr, br, bl] = corners;

  // Sample points around the quad (offset outward)
  const cx = (tl.x + tr.x + br.x + bl.x) / 4;
  const cy = (tl.y + tr.y + br.y + bl.y) / 4;
  const screenW = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const screenH = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const offset = Math.max(screenW, screenH) * 0.3;

  let totalR = 0, totalG = 0, totalB = 0, count = 0;

  for (let i = 0; i < SAMPLES; i++) {
    const angle = (i / SAMPLES) * Math.PI * 2;
    const dist = offset + Math.random() * offset * 0.5;
    const sx = Math.round(cx + Math.cos(angle) * dist);
    const sy = Math.round(cy + Math.sin(angle) * dist);

    if (sx < 0 || sx >= canvasWidth || sy < 0 || sy >= canvasHeight) continue;

    try {
      const px = ctx.getImageData(sx, sy, 1, 1).data;
      totalR += px[0]; totalG += px[1]; totalB += px[2]; count++;
    } catch { /* out of bounds */ }
  }

  if (count === 0) return { r: 128, g: 128, b: 128, brightness: 0.5 };
  const r = totalR / count;
  const g = totalG / count;
  const b = totalB / count;
  const brightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return { r, g, b, brightness };
}
