import type { SceneMatchParams } from './types';

/**
 * Estimate scene-match parameters from sampled pixel luminance / color
 * around the screen region.
 *
 * This is a simplified estimator — a production version would sample
 * pixels from the actual location image and run statistical analysis.
 */
export function estimateSceneMatch(
  avgLuminance: number,     // 0..255
  avgTemperature: number,   // estimated Kelvin
  avgContrast: number,      // 0..1
): SceneMatchParams {
  // Exposure: map scene luminance to EV offset
  // 128 = neutral, darker scenes push exposure down
  const exposureOffset = Math.log2(avgLuminance / 128) * 0.5;

  // Saturation: slightly desaturate in low-light scenes
  const saturation = avgLuminance < 80 ? 0.85 : avgLuminance > 200 ? 1.05 : 1.0;

  // Temperature bias: offset from 6500K (daylight)
  const temperatureBias = avgTemperature - 6500;

  // Highlight compression: increase in high-contrast scenes
  const highlightCompress = Math.min(avgContrast * 0.6, 1.0);

  return {
    exposureOffset,
    saturation,
    temperatureBias,
    highlightCompress,
  };
}

/**
 * Sample average luminance from an ImageData region.
 * Samples pixels in a ring around the given bounding box.
 */
export function sampleRegionLuminance(
  imageData: ImageData,
  cx: number,
  cy: number,
  radius: number,
  samples: number = 64,
): number {
  const { data, width } = imageData;
  let totalLum = 0;
  let count = 0;

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const px = Math.round(cx + Math.cos(angle) * radius);
    const py = Math.round(cy + Math.sin(angle) * radius);

    if (px < 0 || py < 0 || px >= width || py >= imageData.height) continue;

    const idx = (py * width + px) * 4;
    // Rec. 709 luminance
    const lum = data[idx] * 0.2126 + data[idx + 1] * 0.7152 + data[idx + 2] * 0.0722;
    totalLum += lum;
    count++;
  }

  return count > 0 ? totalLum / count : 128;
}
