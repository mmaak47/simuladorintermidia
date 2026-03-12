/**
 * Logo Auto-Layout Engine
 *
 * When a logo is uploaded instead of a finished campaign image, this engine
 * generates a premium branded background and composites the logo onto it,
 * producing a ready-to-simulate creative image.
 *
 * Supports: pattern overlays, headline text, CTA, style presets.
 */

export interface LogoLayoutResult {
  /** Data URL of the final composed image (PNG) */
  composedUrl: string;
  /** Width of the output */
  width: number;
  /** Height of the output */
  height: number;
}

export type PatternType = 'none' | 'dots' | 'grid' | 'diagonal' | 'waves';
export type StylePreset = 'minimal' | 'corporate' | 'premium' | 'energetic';
export type BackgroundMode = 'auto' | 'light' | 'dark' | 'custom';

export interface StyleOptions {
  backgroundMode: BackgroundMode;
  customBgColor?: string;
  pattern: PatternType;
  preset: StylePreset;
  headline?: string;
  showCta?: boolean;
  ctaText?: string;
}

export const DEFAULT_STYLE_OPTIONS: StyleOptions = {
  backgroundMode: 'auto',
  pattern: 'none',
  preset: 'premium',
  showCta: false,
  ctaText: 'Saiba mais',
};

type BackgroundStyle = 'dark-glow' | 'gradient' | 'minimal-dark' | 'light-clean' | 'light-gradient';

/* ─── Headline Template System ───────────────────────────── */

const HEADLINE_TEMPLATES: string[] = [
  'Sua marca em destaque',
  'O lugar certo para sua marca aparecer',
  'Conecte sua marca ao público',
  'Impacto real para sua campanha',
  'Visibilidade onde seu público está',
  'Sua campanha no cenário ideal',
  'Presença marcante para sua marca',
  'O destaque que sua marca merece',
  'Alcance máximo, impacto visual',
  'Seu público vai notar',
];

export function pickRandomHeadline(): string {
  return HEADLINE_TEMPLATES[Math.floor(Math.random() * HEADLINE_TEMPLATES.length)];
}

/* ─── Color helpers ──────────────────────────────────────── */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function pickPrimarySecondary(colors: string[]): { primary: string; secondary: string } {
  if (colors.length === 0) return { primary: '#FE5C2B', secondary: '#1a1a2e' };

  let bestIdx = 0;
  let bestSat = 0;
  for (let i = 0; i < colors.length; i++) {
    const [r, g, b] = hexToRgb(colors[i]);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    const lum = luminance(r, g, b);
    const score = sat * (1 - Math.abs(lum - 0.5));
    if (score > bestSat) {
      bestSat = score;
      bestIdx = i;
    }
  }

  const primary = colors[bestIdx];
  const secondary = colors.find((c, i) => {
    if (i === bestIdx) return false;
    const [r, g, b] = hexToRgb(c);
    return luminance(r, g, b) < 0.4;
  }) ?? '#1a1a2e';

  return { primary, secondary };
}

function chooseStyle(lum: number, mode: BackgroundMode): BackgroundStyle {
  if (mode === 'light') return lum > 0.5 ? 'light-gradient' : 'light-clean';
  if (mode === 'dark') return lum < 0.3 ? 'gradient' : 'dark-glow';
  // auto
  if (lum < 0.3) return 'gradient';
  if (lum > 0.7) return 'dark-glow';
  return 'minimal-dark';
}

/* ─── Preset multipliers ─────────────────────────────────── */

interface PresetConfig {
  logoScale: number;      // max % of canvas width
  glowIntensity: number;  // glow alpha multiplier
  noiseIntensity: number;
  patternAlpha: number;
  headlineSize: number;   // relative to canvas width
  ctaSize: number;
}

const PRESET_CONFIGS: Record<StylePreset, PresetConfig> = {
  minimal: { logoScale: 0.35, glowIntensity: 0.6, noiseIntensity: 0.015, patternAlpha: 0.04, headlineSize: 0.028, ctaSize: 0.018 },
  corporate: { logoScale: 0.40, glowIntensity: 0.8, noiseIntensity: 0.025, patternAlpha: 0.06, headlineSize: 0.032, ctaSize: 0.020 },
  premium: { logoScale: 0.45, glowIntensity: 1.0, noiseIntensity: 0.03, patternAlpha: 0.08, headlineSize: 0.035, ctaSize: 0.022 },
  energetic: { logoScale: 0.50, glowIntensity: 1.2, noiseIntensity: 0.04, patternAlpha: 0.12, headlineSize: 0.038, ctaSize: 0.024 },
};

/* ─── Background rendering ───────────────────────────────── */

function drawBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  style: BackgroundStyle,
  primary: string,
  _secondary: string,
  config: PresetConfig,
  customBgColor?: string,
) {
  const [pr, pg, pb] = hexToRgb(primary);
  const gAlpha = config.glowIntensity;

  if (customBgColor) {
    ctx.fillStyle = customBgColor;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.45);
    glow.addColorStop(0, `rgba(${pr},${pg},${pb},${0.12 * gAlpha})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    drawNoise(ctx, w, h, config.noiseIntensity);
    return;
  }

  switch (style) {
    case 'dark-glow': {
      ctx.fillStyle = '#0d0d14';
      ctx.fillRect(0, 0, w, h);
      const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.45);
      glow.addColorStop(0, `rgba(${pr},${pg},${pb},${0.18 * gAlpha})`);
      glow.addColorStop(0.6, `rgba(${pr},${pg},${pb},${0.05 * gAlpha})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      drawNoise(ctx, w, h, config.noiseIntensity);
      break;
    }
    case 'gradient': {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#0d0d18');
      grad.addColorStop(0.5, `rgba(${pr},${pg},${pb},${0.12 * gAlpha})`);
      grad.addColorStop(1, '#0d0d14');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      const bottomGlow = ctx.createRadialGradient(w * 0.5, h, 0, w * 0.5, h, h * 0.5);
      bottomGlow.addColorStop(0, `rgba(${pr},${pg},${pb},${0.08 * gAlpha})`);
      bottomGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bottomGlow;
      ctx.fillRect(0, 0, w, h);
      drawNoise(ctx, w, h, config.noiseIntensity);
      break;
    }
    case 'minimal-dark': {
      ctx.fillStyle = '#111118';
      ctx.fillRect(0, 0, w, h);
      const halo = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.35);
      halo.addColorStop(0, `rgba(${pr},${pg},${pb},${0.1 * gAlpha})`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      drawNoise(ctx, w, h, config.noiseIntensity);
      break;
    }
    case 'light-clean': {
      ctx.fillStyle = '#f5f5f7';
      ctx.fillRect(0, 0, w, h);
      const halo = ctx.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, w * 0.4);
      halo.addColorStop(0, `rgba(${pr},${pg},${pb},${0.06 * gAlpha})`);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'light-gradient': {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#f8f8fa');
      grad.addColorStop(0.5, `rgba(${pr},${pg},${pb},0.05)`);
      grad.addColorStop(1, '#f0f0f4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      break;
    }
  }
}

function drawNoise(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;
  const scale = intensity * 255;
  for (let i = 0; i < data.length; i += 4) {
    const noise = (Math.random() - 0.5) * scale;
    data[i] += noise;
    data[i + 1] += noise;
    data[i + 2] += noise;
  }
  ctx.putImageData(imageData, 0, 0);
}

/* ─── Pattern overlays ───────────────────────────────────── */

function drawPattern(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  pattern: PatternType,
  color: string,
  alpha: number,
) {
  if (pattern === 'none') return;

  const [cr, cg, cb] = hexToRgb(color);
  ctx.save();
  ctx.globalAlpha = alpha;

  switch (pattern) {
    case 'dots': {
      const spacing = Math.max(20, w * 0.025);
      const radius = spacing * 0.12;
      ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
      for (let y = spacing / 2; y < h; y += spacing) {
        for (let x = spacing / 2; x < w; x += spacing) {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      break;
    }
    case 'grid': {
      const spacing = Math.max(30, w * 0.04);
      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += spacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += spacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      break;
    }
    case 'diagonal': {
      const spacing = Math.max(20, w * 0.03);
      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.lineWidth = 0.5;
      for (let d = -h; d < w + h; d += spacing) {
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d - h, h);
        ctx.stroke();
      }
      break;
    }
    case 'waves': {
      const amp = h * 0.015;
      const freq = (Math.PI * 2) / (w * 0.15);
      const spacing = Math.max(25, h * 0.05);
      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.lineWidth = 0.8;
      for (let row = spacing; row < h; row += spacing) {
        ctx.beginPath();
        for (let x = 0; x <= w; x += 2) {
          const y = row + Math.sin(x * freq + row * 0.01) * amp;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
  }

  ctx.restore();
}

/* ─── Text rendering ─────────────────────────────────────── */

function isLightBackground(style: BackgroundStyle): boolean {
  return style === 'light-clean' || style === 'light-gradient';
}

function drawHeadline(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number, h: number,
  logoBottomY: number,
  fontSize: number,
  lightBg: boolean,
) {
  const size = Math.max(14, Math.round(w * fontSize));
  ctx.save();
  ctx.font = `600 ${size}px "Inter", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = lightBg ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.75)';

  const y = logoBottomY + h * 0.04;
  ctx.fillText(text, w / 2, y, w * 0.8);
  ctx.restore();
}

function drawCta(
  ctx: CanvasRenderingContext2D,
  text: string,
  w: number, h: number,
  accentColor: string,
  fontSize: number,
) {
  const size = Math.max(11, Math.round(w * fontSize));
  const padding = size * 1.2;
  const btnW = ctx.measureText(text).width + padding * 2 || size * text.length * 0.6 + padding * 2;
  const btnH = size * 2.4;
  const x = (w - btnW) / 2;
  const y = h - h * 0.12;

  const [ar, ag, ab] = hexToRgb(accentColor);

  ctx.save();
  // Button background
  ctx.fillStyle = `rgba(${ar},${ag},${ab},0.9)`;
  const radius = btnH / 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + btnW - radius, y);
  ctx.arc(x + btnW - radius, y + radius, radius, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x + radius, y + btnH);
  ctx.arc(x + radius, y + radius, radius, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fill();

  // Text
  ctx.font = `600 ${size}px "Inter", "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, w / 2, y + btnH / 2);
  ctx.restore();
}

/* ─── Logo placement ─────────────────────────────────────── */

interface LogoPlacement {
  x: number;
  y: number;
  drawW: number;
  drawH: number;
  bottomY: number;
}

function placeLogoCentered(
  ctx: CanvasRenderingContext2D,
  logoImg: HTMLImageElement,
  canvasW: number,
  canvasH: number,
  maxWidthRatio: number,
  hasHeadline: boolean,
): LogoPlacement {
  const maxW = canvasW * maxWidthRatio;
  const maxH = canvasH * (hasHeadline ? 0.35 : 0.4);
  const scale = Math.min(maxW / logoImg.naturalWidth, maxH / logoImg.naturalHeight);
  const drawW = logoImg.naturalWidth * scale;
  const drawH = logoImg.naturalHeight * scale;
  const x = (canvasW - drawW) / 2;
  // shift logo up when there's headline/CTA below
  const yOffset = hasHeadline ? -canvasH * 0.06 : -canvasH * 0.02;
  const y = (canvasH - drawH) / 2 + yOffset;

  ctx.drawImage(logoImg, x, y, drawW, drawH);

  return { x, y, drawW, drawH, bottomY: y + drawH };
}

/* ─── Public API ──────────────────────────────────────────── */

/**
 * Generates a premium DOOH-ready composition from a logo file.
 */
export function generateLogoComposition(
  logoUrl: string,
  targetWidth: number,
  targetHeight: number,
  dominantColors: string[],
  options?: Partial<StyleOptions>,
): Promise<LogoLayoutResult> {
  const opts: StyleOptions = { ...DEFAULT_STYLE_OPTIONS, ...options };
  const config = PRESET_CONFIGS[opts.preset];

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d')!;

      const { primary, secondary } = pickPrimarySecondary(dominantColors);
      const [pr, pg, pb] = hexToRgb(primary);
      const lum = luminance(pr, pg, pb);
      const style = chooseStyle(lum, opts.backgroundMode);

      // 1. Background
      drawBackground(ctx, targetWidth, targetHeight, style, primary, secondary, config,
        opts.backgroundMode === 'custom' ? opts.customBgColor : undefined);

      // 2. Pattern overlay
      const patternColor = isLightBackground(style) ? '#000000' : '#ffffff';
      drawPattern(ctx, targetWidth, targetHeight, opts.pattern, patternColor, config.patternAlpha);

      // 3. Logo
      const hasText = !!opts.headline || !!opts.showCta;
      const placement = placeLogoCentered(ctx, img, targetWidth, targetHeight, config.logoScale, hasText);

      // 4. Headline
      if (opts.headline) {
        drawHeadline(ctx, opts.headline, targetWidth, targetHeight,
          placement.bottomY, config.headlineSize, isLightBackground(style));
      }

      // 5. CTA button
      if (opts.showCta && opts.ctaText) {
        drawCta(ctx, opts.ctaText, targetWidth, targetHeight, primary, config.ctaSize);
      }

      resolve({
        composedUrl: canvas.toDataURL('image/png'),
        width: targetWidth,
        height: targetHeight,
      });
    };
    img.onerror = () => reject(new Error('Failed to load logo for composition'));
    img.crossOrigin = 'anonymous';
    img.src = logoUrl;
  });
}
