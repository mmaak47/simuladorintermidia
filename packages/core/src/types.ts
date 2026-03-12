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

// ─── Keyframes (manual corner editing) ──────────────────────

export interface KeyframeInfo {
  frameIndex: number;
  time: number;
  thumbnailUrl: string;
}

export interface KeyframeExtractionResult {
  fps: number;
  totalFrames: number;
  duration: number;
  width: number;
  height: number;
  keyframes: KeyframeInfo[];
}

/** A single keyframe with manually-set corners */
export interface KeyframeCorners {
  frameIndex: number;
  time: number;
  corners: ScreenCorners;
}

/** A complete video location preset: keyframes + settings */
export interface VideoLocationPreset {
  id: string;
  name: string;
  /** Original video dimensions */
  width: number;
  height: number;
  fps: number;
  duration: number;
  totalFrames: number;
  /** Manually-edited keyframe corners */
  keyframeCorners: KeyframeCorners[];
  /** Display + cinematic settings */
  display: DisplaySettings;
  cinematic: CinematicSettings;
  fitMode: FitMode;
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

// ─── Screen Edge Light Spill ────────────────────────────────

export interface SpillSettings {
  enabled: boolean;
  /** Overall spill intensity 0..1 */
  intensity: number;
  /** How far the spill extends beyond the screen edge (px factor) 0..1 */
  radius: number;
  /** Bezel/frame reflection strength 0..1 */
  bezelReflection: number;
  /** Automatically track creative colors */
  dynamicColor: boolean;
}

export const DEFAULT_SPILL_SETTINGS: SpillSettings = {
  enabled: true,
  intensity: 0.35,
  radius: 0.4,
  bezelReflection: 0.15,
  dynamicColor: true,
};

// ─── Scene Match ────────────────────────────────────────────

export interface SceneMatchParams {
  exposureOffset: number;   // EV stops
  saturation: number;       // multiplier
  temperatureBias: number;  // Kelvin offset
  highlightCompress: number; // 0..1
}

// ─── Location Preset (legacy) ───────────────────────────────

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

// ─── Point Preset (product model) ───────────────────────────

export type PointType = 'Elevadores' | 'Indoors' | 'Paineis de Led' | 'FrontLights' | 'BackLights';

export type EnvironmentType = 'street' | 'shopping' | 'elevator' | 'pedestrian';

export interface ScreenSelection {
  mode: 'quad' | 'keyframes';
  corners?: ScreenCorners;
  /** Optional multi-face selection for structures with repeated creatives */
  faces?: ScreenCorners[];
  keyframes?: Array<{
    frame: number;
    corners: ScreenCorners;
  }>;
}

export interface RenderPreset {
  screenNits: number;
  bloom: number;
  glassReflection: number;
  grain: number;
  cinematicMode: boolean;
  /** Light spill enabled (defaults to true) */
  lightSpillEnabled?: boolean;
  /** Light spill intensity 0..1 (defaults to 0.35) */
  lightSpillIntensity?: number;
  /** Light spill radius 0..1 (defaults to 0.4) */
  lightSpillRadius?: number;
  /** Bezel reflection strength 0..1 (defaults to 0.15) */
  bezelReflection?: number;
}

export const DEFAULT_RENDER_PRESET: RenderPreset = {
  screenNits: 700,
  bloom: 0.12,
  glassReflection: 0.08,
  grain: 0.06,
  cinematicMode: true,
};

export interface PointPreset {
  id: string;
  name: string;
  slug: string;
  type: PointType;
  city?: string;
  address?: string;
  description?: string;
  insertionType?: string;
  minimumInsertions?: number;
  targetAudience?: string;
  audienceClassification?: string;
  thumbnailUrl: string;
  baseMediaUrl: string;
  baseMediaType: 'image' | 'video';
  /** Original media dimensions (set during upload) */
  baseWidth: number;
  baseHeight: number;
  /** Screen native resolution */
  screenWidth: number;
  screenHeight: number;
  /** Derived aspect label (e.g. "9:16", "16:9") — computed from screenWidth/screenHeight */
  screenAspect: string;
  fitMode: FitMode;
  screenSelection: ScreenSelection;
  renderPreset: RenderPreset;
  environmentType?: EnvironmentType;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Map a simplified RenderPreset to full DisplaySettings */
export function renderPresetToDisplay(rp: RenderPreset): DisplaySettings {
  return {
    screenNits: rp.screenNits,
    pixelGridIntensity: 0.05,
    glassRoughness: 0.15,
    glassReflectivity: rp.glassReflection,
    angleFalloff: true,
  };
}

/** Map a simplified RenderPreset to full CinematicSettings */
export function renderPresetToCinematic(rp: RenderPreset): CinematicSettings {
  return {
    enabled: rp.cinematicMode,
    bloomIntensity: rp.bloom,
    vignetteIntensity: 0.15,
    grainIntensity: rp.grain,
    chromaticAberration: 0.02,
    highlightCompression: 0.2,
    motionBlur: false,
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

  /** All selected faces for static scenes (first face mirrors `corners`) */
  faces: ScreenCorners[];

  /** Index of the currently edited face in `faces` */
  activeFaceIndex: number;

  /** Tracking data (video only) */
  tracking: TrackingResponse | null;

  /** Keyframe extraction data (video only) */
  keyframeData: KeyframeExtractionResult | null;

  /** Manually-edited corners per keyframe */
  keyframeCorners: KeyframeCorners[];

  /** Index of the currently-active keyframe being edited */
  activeKeyframeIndex: number;

  /** Uploaded creative */
  creative: CreativeSource | null;

  /** Current fit mode */
  fitMode: FitMode;

  /** Display settings */
  display: DisplaySettings;

  /** Cinematic settings */
  cinematic: CinematicSettings;

  /** Screen edge light spill settings */
  spill: SpillSettings;

  /** Scene match params (auto-estimated or overridden) */
  sceneMatch: SceneMatchParams | null;

  /** Quality mode for current preview */
  qualityMode: QualityMode;
}
