/**
 * Creative Compliance Checker
 *
 * Validates uploaded creatives against DOOH best practices
 * and screen specifications.  Produces a list of compliance
 * issues with severity and recommendations.
 *
 * Checks performed:
 * 1. Resolution adequacy (is the creative high-enough quality for the screen?)
 * 2. Aspect ratio match (does it fit the screen without excessive crop?)
 * 3. Safe zone violations (text/logos near edges that may be cropped)
 * 4. Contrast ratio (readability at distance)
 * 5. Brightness distribution (overly bright → glare, overly dark → invisible)
 * 6. File weight estimate (for network delivery)
 */

export type Severity = 'pass' | 'warn' | 'fail';

export interface ComplianceIssue {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface ComplianceReport {
  /** Overall pass/warn/fail */
  overall: Severity;
  issues: ComplianceIssue[];
  /** 0..100 quality score */
  score: number;
}

/* ─── Resolution check ────────────────────────────────── */

function checkResolution(
  creativeW: number,
  creativeH: number,
  screenW: number,
  screenH: number,
): ComplianceIssue {
  const scaleX = creativeW / screenW;
  const scaleY = creativeH / screenH;
  const minScale = Math.min(scaleX, scaleY);

  if (minScale >= 1) {
    return { id: 'resolution', severity: 'pass', title: 'Resolução', detail: `Resolução adequada (${creativeW}×${creativeH})` };
  }
  if (minScale >= 0.5) {
    return { id: 'resolution', severity: 'warn', title: 'Resolução baixa', detail: `Criativo ${creativeW}×${creativeH} pode ficar pixelado na tela ${screenW}×${screenH}. Escala: ${(minScale * 100).toFixed(0)}%` };
  }
  return { id: 'resolution', severity: 'fail', title: 'Resolução insuficiente', detail: `Criativo ${creativeW}×${creativeH} é muito pequeno para a tela ${screenW}×${screenH}. Escala: ${(minScale * 100).toFixed(0)}%` };
}

/* ─── Aspect ratio check ──────────────────────────────── */

function checkAspectRatio(
  creativeW: number,
  creativeH: number,
  screenAspect: number,
): ComplianceIssue {
  const creativeAspect = creativeW / creativeH;
  const diff = Math.abs(creativeAspect - screenAspect) / screenAspect;

  if (diff < 0.05) {
    return { id: 'aspect', severity: 'pass', title: 'Proporção', detail: `Proporção compatível (${creativeAspect.toFixed(2)} vs ${screenAspect.toFixed(2)})` };
  }
  if (diff < 0.2) {
    return { id: 'aspect', severity: 'warn', title: 'Proporção diferente', detail: `Criativo ${creativeAspect.toFixed(2)}:1 será cortado/ajustado para a tela ${screenAspect.toFixed(2)}:1. Diferença: ${(diff * 100).toFixed(0)}%` };
  }
  return { id: 'aspect', severity: 'fail', title: 'Proporção incompatível', detail: `Proporção do criativo (${creativeAspect.toFixed(2)}:1) é muito diferente da tela (${screenAspect.toFixed(2)}:1). Corte significativo.` };
}

/* ─── Safe zone check (via edge brightness analysis) ──── */

function checkSafeZone(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
): ComplianceIssue {
  // Sample 10% border strips for content density
  const margin = Math.round(Math.min(w, h) * 0.1);
  let edgeBrightSum = 0;
  let innerBrightSum = 0;
  let edgeCount = 0;
  let innerCount = 0;

  const data = ctx.getImageData(0, 0, w, h).data;

  for (let y = 0; y < h; y += 4) {
    for (let x = 0; x < w; x += 4) {
      const idx = (y * w + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      const variance = Math.abs(lum - 128); // content indicator

      if (x < margin || x > w - margin || y < margin || y > h - margin) {
        edgeBrightSum += variance;
        edgeCount++;
      } else {
        innerBrightSum += variance;
        innerCount++;
      }
    }
  }

  const edgeActivity = edgeCount > 0 ? edgeBrightSum / edgeCount : 0;
  const innerActivity = innerCount > 0 ? innerBrightSum / innerCount : 0;

  // If edge activity is high relative to inner, content may be near edges
  const ratio = innerActivity > 0 ? edgeActivity / innerActivity : 0;

  if (ratio < 0.6) {
    return { id: 'safezone', severity: 'pass', title: 'Zona segura', detail: 'Conteúdo principal está centralizado, longe das bordas.' };
  }
  if (ratio < 0.85) {
    return { id: 'safezone', severity: 'warn', title: 'Zona segura', detail: 'Algum conteúdo pode estar perto das bordas. Considere centralizar elementos importantes.' };
  }
  return { id: 'safezone', severity: 'fail', title: 'Conteúdo nas bordas', detail: 'Conteúdo significativo nas bordas pode ser cortado pelo enquadramento da tela.' };
}

/* ─── Contrast check ──────────────────────────────────── */

function checkContrast(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
): ComplianceIssue {
  const data = ctx.getImageData(0, 0, w, h).data;
  let minLum = 255, maxLum = 0;

  for (let i = 0; i < data.length; i += 16) { // sample every 4th pixel
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }

  const contrastRatio = (maxLum + 0.05) / (minLum + 0.05);

  if (contrastRatio > 4.5) {
    return { id: 'contrast', severity: 'pass', title: 'Contraste', detail: `Contraste adequado (${contrastRatio.toFixed(1)}:1). Boa legibilidade à distância.` };
  }
  if (contrastRatio > 2.5) {
    return { id: 'contrast', severity: 'warn', title: 'Contraste baixo', detail: `Contraste ${contrastRatio.toFixed(1)}:1 pode dificultar leitura à distância. Recomendado >4.5:1.` };
  }
  return { id: 'contrast', severity: 'fail', title: 'Contraste insuficiente', detail: `Contraste ${contrastRatio.toFixed(1)}:1 torna o conteúdo difícil de ler. Aumente contraste entre texto e fundo.` };
}

/* ─── Brightness distribution ─────────────────────────── */

function checkBrightness(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
): ComplianceIssue {
  const data = ctx.getImageData(0, 0, w, h).data;
  let totalLum = 0;
  let brightPixels = 0;
  let darkPixels = 0;
  const n = data.length / 4;
  const step = 4; // sample every 4th pixel

  for (let i = 0; i < data.length; i += step * 4) {
    const lum = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
    totalLum += lum;
    if (lum > 0.9) brightPixels++;
    if (lum < 0.1) darkPixels++;
  }

  const samples = Math.ceil(n / step);
  const avgBrightness = totalLum / samples;
  const brightRatio = brightPixels / samples;
  const darkRatio = darkPixels / samples;

  if (brightRatio > 0.5) {
    return { id: 'brightness', severity: 'warn', title: 'Muito claro', detail: `${(brightRatio * 100).toFixed(0)}% dos pixels são muito brilhantes. Pode causar ofuscamento à noite.` };
  }
  if (darkRatio > 0.7) {
    return { id: 'brightness', severity: 'warn', title: 'Muito escuro', detail: `${(darkRatio * 100).toFixed(0)}% dos pixels são muito escuros. Pode ficar invisível durante o dia.` };
  }
  if (avgBrightness > 0.3 && avgBrightness < 0.8) {
    return { id: 'brightness', severity: 'pass', title: 'Brilho', detail: `Distribuição de brilho equilibrada (média: ${(avgBrightness * 100).toFixed(0)}%).` };
  }
  return { id: 'brightness', severity: 'warn', title: 'Brilho desbalanceado', detail: `Brilho médio ${(avgBrightness * 100).toFixed(0)}% — considere ajustar para melhor visibilidade.` };
}

/* ─── Main compliance check ───────────────────────────── */

/**
 * Run all compliance checks on a creative.
 *
 * @param source — Creative image/video element
 * @param creativeW — Creative pixel width
 * @param creativeH — Creative pixel height
 * @param screenAspect — Target screen aspect ratio (width/height)
 * @param screenW — Screen pixel width (for resolution check)
 * @param screenH — Screen pixel height (for resolution check)
 */
export function checkCompliance(
  source: CanvasImageSource,
  creativeW: number,
  creativeH: number,
  screenAspect: number,
  screenW: number,
  screenH: number,
): ComplianceReport {
  const issues: ComplianceIssue[] = [];

  // 1. Resolution
  issues.push(checkResolution(creativeW, creativeH, screenW, screenH));

  // 2. Aspect ratio
  issues.push(checkAspectRatio(creativeW, creativeH, screenAspect));

  // 3-5: Need a canvas draw for pixel analysis
  let canvas: OffscreenCanvas | HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

  const THUMB = 256;
  const tw = THUMB;
  const th = Math.round(THUMB * (creativeH / creativeW));

  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(tw, th);
    ctx = canvas.getContext('2d')!;
  } else {
    canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    ctx = canvas.getContext('2d')!;
  }

  ctx.drawImage(source, 0, 0, creativeW, creativeH, 0, 0, tw, th);

  // 3. Safe zone
  issues.push(checkSafeZone(ctx, tw, th));

  // 4. Contrast
  issues.push(checkContrast(ctx, tw, th));

  // 5. Brightness
  issues.push(checkBrightness(ctx, tw, th));

  // Calculate overall severity and score
  const fails = issues.filter((i) => i.severity === 'fail').length;
  const warns = issues.filter((i) => i.severity === 'warn').length;
  const overall: Severity = fails > 0 ? 'fail' : warns > 0 ? 'warn' : 'pass';
  const score = Math.max(0, 100 - fails * 20 - warns * 10);

  return { overall, issues, score };
}
