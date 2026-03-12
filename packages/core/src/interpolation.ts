import type { ScreenCorners, KeyframeCorners, Point2D } from './types';

/**
 * Interpolate screen corners between manually-set keyframes using linear
 * interpolation. Given a set of keyframe corners (sorted by frameIndex)
 * and a target frame, returns the interpolated corners.
 *
 * - Before the first keyframe: uses the first keyframe's corners
 * - After the last keyframe: uses the last keyframe's corners
 * - Between two keyframes: linearly interpolates each corner
 */
export function interpolateCornersAtFrame(
  keyframeCorners: KeyframeCorners[],
  frameIndex: number,
): ScreenCorners | null {
  if (keyframeCorners.length === 0) return null;
  if (keyframeCorners.length === 1) return keyframeCorners[0].corners;

  // Before first keyframe
  if (frameIndex <= keyframeCorners[0].frameIndex) {
    return keyframeCorners[0].corners;
  }

  // After last keyframe
  const last = keyframeCorners[keyframeCorners.length - 1];
  if (frameIndex >= last.frameIndex) {
    return last.corners;
  }

  // Find surrounding keyframes
  let before = keyframeCorners[0];
  let after = keyframeCorners[1];

  for (let i = 0; i < keyframeCorners.length - 1; i++) {
    if (
      keyframeCorners[i].frameIndex <= frameIndex &&
      keyframeCorners[i + 1].frameIndex >= frameIndex
    ) {
      before = keyframeCorners[i];
      after = keyframeCorners[i + 1];
      break;
    }
  }

  // Linear interpolation factor
  const range = after.frameIndex - before.frameIndex;
  const t = range > 0 ? (frameIndex - before.frameIndex) / range : 0;

  return [
    lerpPoint(before.corners[0], after.corners[0], t),
    lerpPoint(before.corners[1], after.corners[1], t),
    lerpPoint(before.corners[2], after.corners[2], t),
    lerpPoint(before.corners[3], after.corners[3], t),
  ];
}

/**
 * Same as interpolateCornersAtFrame but takes a time in seconds.
 */
export function interpolateCornersAtTime(
  keyframeCorners: KeyframeCorners[],
  time: number,
  fps: number,
): ScreenCorners | null {
  return interpolateCornersAtFrame(keyframeCorners, Math.round(time * fps));
}

/**
 * Build a full TrackingResponse-like frames array from keyframe corners
 * for a video with the given fps and totalFrames. This generates
 * interpolated corners for every frame.
 */
export function buildInterpolatedFrames(
  keyframeCorners: KeyframeCorners[],
  totalFrames: number,
  fps: number,
): { frameIndex: number; corners: ScreenCorners; confidence: number }[] {
  const frames: { frameIndex: number; corners: ScreenCorners; confidence: number }[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const corners = interpolateCornersAtFrame(keyframeCorners, i);
    if (!corners) continue;

    // Confidence is 1.0 at keyframes, interpolated in between
    const isKeyframe = keyframeCorners.some((kc) => kc.frameIndex === i);
    frames.push({
      frameIndex: i,
      corners,
      confidence: isKeyframe ? 1.0 : 0.8,
    });
  }

  return frames;
}

function lerpPoint(a: Point2D, b: Point2D, t: number): Point2D {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}
