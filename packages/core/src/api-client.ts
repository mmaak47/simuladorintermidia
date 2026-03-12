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
  KeyframeCorners,
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

/**
 * Combined detect + track: sends a video file, the backend detects the
 * screen on frame 0 and tracks corners through the entire video with
 * periodic hybrid re-detection.
 */
export async function detectAndTrack(
  videoFile: File,
  redetectInterval: number = 60,
): Promise<TrackingResponse> {
  const form = new FormData();
  form.append('file', videoFile);
  form.append('redetect_interval', String(redetectInterval));

  const res = await fetch(`${VISION_BASE}/api/vision/detect-and-track`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error(`Detect & track failed: ${await res.text()}`);
  return res.json() as Promise<TrackingResponse>;
}

// ─── Keyframes ───────────────────────────────────────────────

import type { KeyframeExtractionResult } from './types';

export async function extractKeyframes(
  videoFile: File,
  maxKeyframes: number = 20,
): Promise<KeyframeExtractionResult> {
  const form = new FormData();
  form.append('file', videoFile);
  form.append('max_keyframes', String(maxKeyframes));

  const res = await fetch(`${VISION_BASE}/api/vision/extract-keyframes`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) throw new Error(`Keyframe extraction failed: ${await res.text()}`);
  return res.json() as Promise<KeyframeExtractionResult>;
}

// ─── Export ──────────────────────────────────────────────────

export async function exportImage(compositionId: string, width: number, height: number): Promise<ExportResult> {
  return visionFetch<ExportResult>('/api/export/image', { compositionId, width, height, quality: 95 });
}

export interface VideoExportProgress {
  status: 'started' | 'processing' | 'done' | 'error';
  frame?: number;
  totalFrames?: number;
  percent?: number;
  downloadUrl?: string;
  fileSize?: number;
  message?: string;
}

/**
 * Export composited video. Sends files + keyframe data to the backend,
 * which streams SSE progress events back.
 *
 * @param onProgress  Called for each progress event from the server.
 * @returns The final progress event (status 'done' or 'error').
 */
export async function exportVideoStream(
  locationVideoFile: Blob,
  creativeFile: Blob,
  creativeIsVideo: boolean,
  keyframeCorners: KeyframeCorners[],
  options: {
    fitMode?: string;
    glassReflectivity?: number;
    screenNits?: number;
    vignette?: number;
    grain?: number;
  } = {},
  onProgress?: (progress: VideoExportProgress) => void,
): Promise<VideoExportProgress> {
  const form = new FormData();
  form.append('location_video', new File([locationVideoFile], 'location.mp4', { type: 'video/mp4' }));
  form.append('creative_file', new File(
    [creativeFile],
    creativeIsVideo ? 'creative.mp4' : 'creative.png',
    { type: creativeIsVideo ? 'video/mp4' : 'image/png' },
  ));
  form.append('creative_is_video', String(creativeIsVideo));
  form.append('keyframe_corners_json', JSON.stringify(keyframeCorners));
  form.append('fit_mode', options.fitMode ?? 'cover');
  form.append('glass_reflectivity', String(options.glassReflectivity ?? 0.08));
  form.append('screen_nits', String(options.screenNits ?? 700));
  form.append('vignette', String(options.vignette ?? 0.15));
  form.append('grain', String(options.grain ?? 0.06));

  const res = await fetch(`${VISION_BASE}/api/export/video`, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Export failed: ${text}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let lastEvent: VideoExportProgress = { status: 'started' };
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6)) as VideoExportProgress;
          lastEvent = data;
          onProgress?.(data);
        } catch {
          // Ignore malformed JSON
        }
      }
    }
  }

  return lastEvent;
}
