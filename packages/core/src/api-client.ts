const VISION_BASE = process.env.NEXT_PUBLIC_VISION_API_URL ?? 'http://localhost:8000';

/**
 * Typed fetch wrapper with error handling for the vision API.
 */
async function visionFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${VISION_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vision API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

/**
 * Upload a file (image/video) via multipart form.
 */
async function visionUpload<T>(path: string, file: File, extra?: Record<string, string>): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      form.append(k, v);
    }
  }

  const res = await fetch(`${VISION_BASE}${path}`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vision API error ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

import type {
  SegmentationResponse,
  TrackingResponse,
  HybridDetectionResult,
  Point2D,
  ScreenCorners,
  ExportResult,
} from './types';

// ─── Segmentation ────────────────────────────────────────────

export async function segmentScreen(
  imageFile: File,
  positivePoints: Point2D[],
  negativePoints: Point2D[] = [],
): Promise<SegmentationResponse> {
  const form = new FormData();
  form.append('file', imageFile);
  form.append('positive_points', JSON.stringify(positivePoints));
  form.append('negative_points', JSON.stringify(negativePoints));

  const res = await fetch(`${VISION_BASE}/api/vision/segment-screen`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error(`Segmentation failed: ${await res.text()}`);
  return res.json() as Promise<SegmentationResponse>;
}

// ─── Hybrid Detection (YOLO → SAM → OpenCV) ─────────────────

export async function detectScreenHybrid(
  imageFile: File,
): Promise<HybridDetectionResult> {
  const form = new FormData();
  form.append('file', imageFile);

  const res = await fetch(`${VISION_BASE}/api/vision/detect-screen-hybrid`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error(`Hybrid detection failed: ${await res.text()}`);
  return res.json() as Promise<HybridDetectionResult>;
}

// ─── Tracking ────────────────────────────────────────────────

export async function trackScreen(
  videoFile: File,
  initialCorners: ScreenCorners,
): Promise<TrackingResponse> {
  const form = new FormData();
  form.append('file', videoFile);
  form.append('initial_corners', JSON.stringify(initialCorners));

  const res = await fetch(`${VISION_BASE}/api/vision/track-screen`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error(`Tracking failed: ${await res.text()}`);
  return res.json() as Promise<TrackingResponse>;
}

// ─── Export ──────────────────────────────────────────────────

export async function exportImage(compositionId: string, width: number, height: number): Promise<ExportResult> {
  return visionFetch<ExportResult>('/api/export/image', { compositionId, width, height, quality: 95 });
}

export async function exportVideo(
  compositionId: string,
  width: number,
  height: number,
  fps: number = 30,
  bitrateMbps: number = 8,
): Promise<ExportResult> {
  return visionFetch<ExportResult>('/api/export/video', { compositionId, width, height, fps, bitrateMbps });
}
