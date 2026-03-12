/**
 * Aspect Ratio Utilities
 *
 * Parses aspect ratios, computes compatibility between creatives and points,
 * and ranks points by compatibility.
 */

import type { PointPreset } from '@dooh/core';

export type AspectOrientation = 'horizontal' | 'vertical' | 'square' | 'ultra-wide';

export interface AspectInfo {
  width: number;
  height: number;
  ratio: number;
  orientation: AspectOrientation;
  label: string;      // e.g. "16:9", "9:16", "1:1"
}

export interface CompatibilityResult {
  compatible: boolean;
  deviation: number;   // 0 = perfect match, 1+ = very different
  message: string;
  consequences: string[];
}

export interface RankedPoint {
  point: PointPreset;
  score: number;       // 0..1, higher = better match
  matchLabel: string;
}

/* ─── Parse aspect ratio string ──────────────────────────── */

export function parseAspectString(aspect: string): number {
  const parts = aspect.split(':').map(Number);
  if (parts.length === 2 && parts[0] > 0 && parts[1] > 0) {
    return parts[0] / parts[1];
  }
  return 1;
}

/* ─── Determine orientation ──────────────────────────────── */

function getOrientation(ratio: number): AspectOrientation {
  if (ratio > 2.5) return 'ultra-wide';
  if (ratio > 1.1) return 'horizontal';
  if (ratio < 0.9) return 'vertical';
  return 'square';
}

/* ─── Simplify ratio to label ────────────────────────────── */

function simplifyRatio(w: number, h: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(Math.round(w), Math.round(h));
  const sw = Math.round(w / g);
  const sh = Math.round(h / g);

  // Common DOOH ratios
  const known: [number, number, string][] = [
    [16, 9, '16:9'],
    [9, 16, '9:16'],
    [4, 3, '4:3'],
    [3, 4, '3:4'],
    [1, 1, '1:1'],
    [21, 9, '21:9'],
    [32, 9, '32:9'],
  ];

  const ratio = w / h;
  for (const [kw, kh, label] of known) {
    if (Math.abs(ratio - kw / kh) < 0.05) return label;
  }

  return `${sw}:${sh}`;
}

/* ─── Calculate aspect ratio from screen resolution ──────── */

export function calculateAspectRatio(width: number, height: number): { aspectRatio: number; aspectLabel: string } {
  if (width <= 0 || height <= 0) return { aspectRatio: 1, aspectLabel: '1:1' };
  return {
    aspectRatio: width / height,
    aspectLabel: simplifyRatio(width, height),
  };
}

/* ─── Analyze creative dimensions ────────────────────────── */

export function analyzeAspect(width: number, height: number): AspectInfo {
  const ratio = width / height;
  return {
    width,
    height,
    ratio,
    orientation: getOrientation(ratio),
    label: simplifyRatio(width, height),
  };
}

/* ─── Check compatibility ────────────────────────────────── */

export function checkCompatibility(
  creativeWidth: number,
  creativeHeight: number,
  pointAspectString: string,
): CompatibilityResult {
  const creativeRatio = creativeWidth / creativeHeight;
  const pointRatio = parseAspectString(pointAspectString);

  // Deviation: how far apart the ratios are. 0 = identical.
  const deviation = Math.abs(creativeRatio - pointRatio) / Math.max(creativeRatio, pointRatio);

  if (deviation < 0.1) {
    return {
      compatible: true,
      deviation,
      message: '',
      consequences: [],
    };
  }

  const creativeInfo = analyzeAspect(creativeWidth, creativeHeight);
  const pointOrientation = getOrientation(pointRatio);

  // Build human-readable warning
  const orientationFlip = creativeInfo.orientation !== pointOrientation
    && ((creativeInfo.orientation === 'vertical' && (pointOrientation === 'horizontal' || pointOrientation === 'ultra-wide'))
      || (creativeInfo.orientation === 'horizontal' && pointOrientation === 'vertical'));

  const message = `Atenção: este criativo está em proporção ${creativeInfo.label}, mas o ponto selecionado utiliza proporção ${pointAspectString}.`;

  const consequences: string[] = [];
  if (orientationFlip) {
    consequences.push('A orientação do criativo é diferente do ponto — o conteúdo será significativamente cortado ou distorcido.');
  }
  if (creativeRatio > pointRatio) {
    consequences.push('O criativo é mais largo que o ponto — haverá corte nas laterais ou barras em cima/baixo.');
  } else {
    consequences.push('O criativo é mais alto que o ponto — haverá corte em cima/baixo ou barras nas laterais.');
  }
  consequences.push('Elementos importantes podem ser perdidos na adaptação.');
  if (deviation > 0.4) {
    consequences.push('A diferença de proporção é grande — recomendamos usar um criativo adequado.');
  }

  return {
    compatible: false,
    deviation,
    message,
    consequences,
  };
}

/* ─── Rank points by compatibility ───────────────────────── */

export function rankPointsByCompatibility(
  creativeWidth: number,
  creativeHeight: number,
  points: PointPreset[],
): RankedPoint[] {
  const creativeRatio = creativeWidth / creativeHeight;
  const creativeOrientation = getOrientation(creativeRatio);

  return points
    .map((point) => {
      const pointRatio = parseAspectString(point.screenAspect);
      const deviation = Math.abs(creativeRatio - pointRatio) / Math.max(creativeRatio, pointRatio);
      const orientationMatch = getOrientation(pointRatio) === creativeOrientation;

      // Score: 1.0 = perfect, 0.0 = terrible
      let score = Math.max(0, 1 - deviation);
      if (orientationMatch) score = Math.min(1, score + 0.15);

      const matchLabel = deviation < 0.1
        ? 'Compatível'
        : deviation < 0.3
          ? 'Adaptável'
          : 'Incompatível';

      return { point, score, matchLabel };
    })
    .sort((a, b) => b.score - a.score);
}
