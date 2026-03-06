// ─── Geometry ───────────────────────────────────────────────

export interface Point2D {
  x: number;
  y: number;
}

/** Ordered: top-left, top-right, bottom-right, bottom-left */
export type ScreenCorners = [Point2D, Point2D, Point2D, Point2D];

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Segmentation ───────────────────────────────────────────

export interface SegmentationRequest {
  /** Base-64 encoded image or URL to uploaded image */
  imageUrl: string;
  positivePoints: Point2D[];
  negativePoints: Point2D[];
}

export interface SegmentationResponse {
  maskUrl: string;
  corners: ScreenCorners;
  confidence: number;
  maskBounds: BoundingBox;
}

// ─── Tracking ───────────────────────────────────────────────

export interface TrackingRequest {
  videoUrl: string;
  initialCorners: ScreenCorners;
  /** How often to re-run SAM (in frames). Default 60 */
  redetectInterval?: number;
}

export interface TrackingFrame {
  frameIndex: number;
  corners: ScreenCorners;
  confidence: number;
}

export interface TrackingResponse {
  fps: number;
  totalFrames: number;
  frames: TrackingFrame[];
}

// ─── Perspective ────────────────────────────────────────────

export type FitMode = 'cover' | 'contain';

export interface HomographyMatrix {
  /** 3×3 row-major */
  data: number[];
}

// ─── Creative ───────────────────────────────────────────────

export type MediaType = 'image' | 'video';

export interface CreativeSource {
  url: string;
  type: MediaType;
  width: number;
  height: number;
  /** Duration in seconds (video only) */
  duration?: number;
}

// ─── Display Settings ───────────────────────────────────────

export interface DisplaySettings {
  /** Screen brightness in nits (100–2500) */
  screenNits: number;
  /** LED pixel grid intensity 0..1 */
  pixelGridIntensity: number;
  /** Glass roughness 0..1 */
  glassRoughness: number;
  /** Glass reflectivity 0..1 */
  glassReflectivity: number;
  /** Enable angle-based brightness falloff */
  angleFalloff: boolean;
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  screenNits: 700,
  pixelGridIntensity: 0.05,
  glassRoughness: 0.15,
  glassReflectivity: 0.08,
  angleFalloff: true,
};

// ─── Cinematic Settings ─────────────────────────────────────

export interface CinematicSettings {
  enabled: boolean;
  bloomIntensity: number;     // 0..1
  vignetteIntensity: number;  // 0..1
  grainIntensity: number;     // 0..1
  chromaticAberration: number; // 0..1
  highlightCompression: number; // 0..1
  motionBlur: boolean;         // video only
}

export const DEFAULT_CINEMATIC_SETTINGS: CinematicSettings = {
  enabled: true,
  bloomIntensity: 0.12,
  vignetteIntensity: 0.15,
  grainIntensity: 0.06,
  chromaticAberration: 0.02,
  highlightCompression: 0.2,
  motionBlur: false,
};

// ─── Scene Match ────────────────────────────────────────────

export interface SceneMatchParams {
  exposureOffset: number;   // EV stops
  saturation: number;       // multiplier
  temperatureBias: number;  // Kelvin offset
  highlightCompress: number; // 0..1
}

// ─── Location Preset ────────────────────────────────────────

export interface LocationPreset {
  id: string;
  name: string;
  mediaType: MediaType;
  thumbnailUrl?: string;
  preset: {
    fitMode: FitMode;
    screenAspect: number;
    initialClickPoint?: Point2D;
    display: DisplaySettings;
    cinematic: CinematicSettings;
  };
}

// ─── Export ─────────────────────────────────────────────────

export type ExportFormat = 'png' | 'mp4';

// ─── Hybrid Detection (YOLO → SAM → OpenCV) ────────────────

export interface DetectionBBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface YoloDetection {
  bbox: DetectionBBox;
  confidence: number;
  class_name: string;
  rank_score: number;
}

export interface HybridDetectionDebug {
  yolo_candidates: YoloDetection[];
  selected_bbox: DetectionBBox;
  selected_crop_score: number;
  mask_area_ratio: number;
  rectangularity: number;
  contour_area: number;
  pipeline_stages: string[];
}

export interface HybridDetectionResult {
  bbox: DetectionBBox;
  mask_url: string;
  corners: Point2D[];
  confidence: number;
  debug: HybridDetectionDebug;
}

// ─── Other Export types ─────────────────────────────────────

export type QualityMode = 'preview' | 'export';

export interface ExportImageRequest {
  compositionId: string;
  width: number;
  height: number;
  quality: number; // 0..100 for JPEG, ignored for PNG
}

export interface ExportVideoRequest {
  compositionId: string;
  width: number;
  height: number;
  fps: number;
  bitrateMbps: number;
}

export interface ExportResult {
  downloadUrl: string;
  format: ExportFormat;
  fileSize: number;
}

// ─── Composition State (UI orchestration) ───────────────────

export interface CompositionState {
  /** Uploaded location media */
  location: {
    url: string;
    type: MediaType;
    width: number;
    height: number;
  } | null;

  /** Segmentation result (legacy SAM-only) */
  segmentation: SegmentationResponse | null;

  /** Hybrid detection result (YOLO → SAM → OpenCV) */
  hybridDetection: HybridDetectionResult | null;

  /** User-edited corners (may differ from auto-detected) */
  corners: ScreenCorners | null;

  /** Tracking data (video only) */
  tracking: TrackingResponse | null;

  /** Uploaded creative */
  creative: CreativeSource | null;

  /** Current fit mode */
  fitMode: FitMode;

  /** Display settings */
  display: DisplaySettings;

  /** Cinematic settings */
  cinematic: CinematicSettings;

  /** Scene match params (auto-estimated or overridden) */
  sceneMatch: SceneMatchParams | null;

  /** Quality mode for current preview */
  qualityMode: QualityMode;
}
