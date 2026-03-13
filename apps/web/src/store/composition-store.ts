import { create } from 'zustand';
import type {
  CompositionState,
  ScreenCorners,
  SegmentationResponse,
  HybridDetectionResult,
  TrackingResponse,
  KeyframeExtractionResult,
  KeyframeCorners,
  CreativeSource,
  DisplaySettings,
  CinematicSettings,
  SpillSettings,
  SceneMatchParams,
  FitMode,
  QualityMode,
  MediaType,
} from '@dooh/core';
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_CINEMATIC_SETTINGS, DEFAULT_SPILL_SETTINGS, renderPresetToDisplay, renderPresetToCinematic } from '@dooh/core';
import type { TimeOfDaySettings } from '@/lib/time-of-day';
import { DEFAULT_TIME_OF_DAY } from '@/lib/time-of-day';
import type { EnvironmentSettings } from '@/lib/environment-effects';
import { DEFAULT_ENVIRONMENT } from '@/lib/environment-effects';
import type { AmbientState } from '@/lib/ambient-animation';
import { DEFAULT_AMBIENT_STATE } from '@/lib/ambient-animation';

interface CompositionStore extends CompositionState {
  // Actions
  setLocation: (url: string, type: MediaType, width: number, height: number) => void;
  setSegmentation: (seg: SegmentationResponse) => void;
  setHybridDetection: (result: HybridDetectionResult) => void;
  setCorners: (corners: ScreenCorners | null) => void;
  setFaces: (faces: ScreenCorners[]) => void;
  setActiveFaceIndex: (index: number) => void;
  addFaceFromCurrent: () => void;
  removeActiveFace: () => void;
  updateCorner: (index: number, x: number, y: number) => void;
  setTracking: (tracking: TrackingResponse) => void;

  // Keyframe actions
  setKeyframeData: (data: KeyframeExtractionResult) => void;
  setActiveKeyframe: (index: number) => void;
  setKeyframeCorners: (frameIndex: number, time: number, corners: ScreenCorners) => void;
  updateKeyframeCorner: (cornerIndex: number, x: number, y: number) => void;
  removeKeyframeCorners: (frameIndex: number) => void;
  clearAllKeyframeCorners: () => void;

  setCreative: (creative: CreativeSource) => void;
  setFitMode: (mode: FitMode) => void;
  updateDisplay: (settings: Partial<DisplaySettings>) => void;
  updateCinematic: (settings: Partial<CinematicSettings>) => void;
  updateSpill: (settings: Partial<SpillSettings>) => void;
  setSceneMatch: (params: SceneMatchParams) => void;
  setQualityMode: (mode: QualityMode) => void;
  loadPointPreset: (preset: import('@dooh/core').PointPreset) => void;
  reset: () => void;

  // New feature state
  timeOfDay: TimeOfDaySettings;
  environment: EnvironmentSettings;
  ambient: AmbientState;
  autoTuneRequested: boolean;

  // New feature actions
  updateTimeOfDay: (settings: Partial<TimeOfDaySettings>) => void;
  updateRain: (settings: Partial<EnvironmentSettings['rain']>) => void;
  updateSunGlare: (settings: Partial<EnvironmentSettings['sunGlare']>) => void;
  updateFog: (settings: Partial<EnvironmentSettings['fog']>) => void;
  updateAmbient: (settings: Partial<AmbientState>) => void;
  requestAutoTune: () => void;
  clearAutoTuneRequest: () => void;

  // Preset export helper
  exportPresetJSON: () => string | null;
  importPresetJSON: (json: string) => boolean;
}

const initialState: CompositionState = {
  location: null,
  segmentation: null,
  hybridDetection: null,
  corners: null,
  faces: [],
  activeFaceIndex: 0,
  tracking: null,
  keyframeData: null,
  keyframeCorners: [],
  activeKeyframeIndex: 0,
  creative: null,
  fitMode: 'cover',
  display: { ...DEFAULT_DISPLAY_SETTINGS },
  cinematic: { ...DEFAULT_CINEMATIC_SETTINGS },
  spill: { ...DEFAULT_SPILL_SETTINGS },
  sceneMatch: null,
  qualityMode: 'preview',
};

const initialExtras = {
  timeOfDay: { ...DEFAULT_TIME_OF_DAY },
  environment: structuredClone(DEFAULT_ENVIRONMENT),
  ambient: { ...DEFAULT_AMBIENT_STATE },
  autoTuneRequested: false,
};

export const useCompositionStore = create<CompositionStore>((set, get) => ({
  ...initialState,
  ...initialExtras,

  setLocation: (url, type, width, height) =>
    set({
      location: { url, type, width, height },
      segmentation: null,
      hybridDetection: null,
      corners: null,
      faces: [],
      activeFaceIndex: 0,
      tracking: null,
      keyframeData: null,
      keyframeCorners: [],
      activeKeyframeIndex: 0,
    }),

  setSegmentation: (seg) =>
    set({
      segmentation: seg,
      corners: seg.corners,
      faces: [cloneCorners(seg.corners)],
      activeFaceIndex: 0,
    }),

  setHybridDetection: (result) =>
    set({
      hybridDetection: result,
      segmentation: {
        maskUrl: result.mask_url,
        corners: result.corners as unknown as ScreenCorners,
        confidence: result.confidence,
        maskBounds: {
          x: result.bbox.x1,
          y: result.bbox.y1,
          width: result.bbox.x2 - result.bbox.x1,
          height: result.bbox.y2 - result.bbox.y1,
        },
      },
      corners: result.corners as unknown as ScreenCorners,
      faces: [cloneCorners(result.corners as unknown as ScreenCorners)],
      activeFaceIndex: 0,
    }),

  setCorners: (corners) =>
    set((state) => {
      if (!corners) {
        return { corners: null, faces: [], activeFaceIndex: 0 };
      }

      const nextFaces = [...state.faces];
      const targetIndex = Math.max(0, Math.min(state.activeFaceIndex, nextFaces.length));

      if (nextFaces.length === 0 || targetIndex >= nextFaces.length) {
        nextFaces.push(cloneCorners(corners));
      } else {
        nextFaces[targetIndex] = cloneCorners(corners);
      }

      const safeIndex = Math.max(0, Math.min(targetIndex, nextFaces.length - 1));
      return {
        corners: cloneCorners(corners),
        faces: nextFaces,
        activeFaceIndex: safeIndex,
      };
    }),

  setFaces: (faces) =>
    set((state) => {
      const nextFaces = faces.map(cloneCorners);
      if (nextFaces.length === 0) {
        return { faces: [], corners: null, activeFaceIndex: 0 };
      }
      const safeIndex = Math.max(0, Math.min(state.activeFaceIndex, nextFaces.length - 1));
      return {
        faces: nextFaces,
        activeFaceIndex: safeIndex,
        corners: cloneCorners(nextFaces[safeIndex]),
      };
    }),

  setActiveFaceIndex: (index) =>
    set((state) => {
      if (state.faces.length === 0) return { activeFaceIndex: 0, corners: null };
      const safeIndex = Math.max(0, Math.min(index, state.faces.length - 1));
      return {
        activeFaceIndex: safeIndex,
        corners: cloneCorners(state.faces[safeIndex]),
      };
    }),

  addFaceFromCurrent: () =>
    set((state) => {
      const source = state.corners ?? state.faces[0] ?? null;
      if (!source) return {};

      // Create a slightly shifted duplicate so multi-face editing starts fast.
      const shifted = source.map((p) => ({ x: p.x + 24, y: p.y + 12 })) as ScreenCorners;
      const nextFaces = [...state.faces, shifted].map(cloneCorners);
      const nextIndex = nextFaces.length - 1;

      return {
        faces: nextFaces,
        activeFaceIndex: nextIndex,
        corners: cloneCorners(nextFaces[nextIndex]),
      };
    }),

  removeActiveFace: () =>
    set((state) => {
      if (state.faces.length === 0) return {};
      const nextFaces = state.faces.filter((_, idx) => idx !== state.activeFaceIndex).map(cloneCorners);
      if (nextFaces.length === 0) {
        return { faces: [], corners: null, activeFaceIndex: 0 };
      }
      const nextIndex = Math.max(0, Math.min(state.activeFaceIndex, nextFaces.length - 1));
      return {
        faces: nextFaces,
        activeFaceIndex: nextIndex,
        corners: cloneCorners(nextFaces[nextIndex]),
      };
    }),

  updateCorner: (index, x, y) =>
    set((state) => {
      if (!state.corners) return {};
      const updated = [...state.corners] as unknown as ScreenCorners;
      updated[index] = { x, y };
      const nextFaces = [...state.faces];
      if (nextFaces.length === 0) {
        nextFaces.push(cloneCorners(updated));
      } else {
        const safeFaceIndex = Math.max(0, Math.min(state.activeFaceIndex, nextFaces.length - 1));
        nextFaces[safeFaceIndex] = cloneCorners(updated);
      }
      return { corners: updated, faces: nextFaces };
    }),

  setTracking: (tracking) =>
    set({ tracking }),

  // ── Keyframe actions ─────────────────────────────────────

  setKeyframeData: (data) =>
    set({ keyframeData: data, keyframeCorners: [], activeKeyframeIndex: 0 }),

  setActiveKeyframe: (index) =>
    set({ activeKeyframeIndex: index }),

  setKeyframeCorners: (frameIndex, time, corners) =>
    set((state) => {
      const existing = state.keyframeCorners.filter(
        (kc) => kc.frameIndex !== frameIndex,
      );
      const updated = [...existing, { frameIndex, time, corners }]
        .sort((a, b) => a.frameIndex - b.frameIndex);
      return { keyframeCorners: updated };
    }),

  updateKeyframeCorner: (cornerIndex, x, y) =>
    set((state) => {
      const { keyframeData, activeKeyframeIndex, keyframeCorners } = state;
      if (!keyframeData) return {};
      const kf = keyframeData.keyframes[activeKeyframeIndex];
      if (!kf) return {};

      const existing = keyframeCorners.find(
        (kc) => kc.frameIndex === kf.frameIndex,
      );
      if (!existing) return {};

      const updatedCorners = [...existing.corners] as unknown as ScreenCorners;
      updatedCorners[cornerIndex] = { x, y };

      const filtered = keyframeCorners.filter(
        (kc) => kc.frameIndex !== kf.frameIndex,
      );
      const updated = [
        ...filtered,
        { frameIndex: kf.frameIndex, time: kf.time, corners: updatedCorners },
      ].sort((a, b) => a.frameIndex - b.frameIndex);

      return { keyframeCorners: updated };
    }),

  removeKeyframeCorners: (frameIndex) =>
    set((state) => ({
      keyframeCorners: state.keyframeCorners.filter(
        (kc) => kc.frameIndex !== frameIndex,
      ),
    })),

  clearAllKeyframeCorners: () =>
    set({ keyframeCorners: [] }),

  setCreative: (creative) =>
    set({ creative }),

  setFitMode: (fitMode) =>
    set({ fitMode }),

  updateDisplay: (settings) =>
    set((state) => ({ display: { ...state.display, ...settings } })),

  updateCinematic: (settings) =>
    set((state) => ({ cinematic: { ...state.cinematic, ...settings } })),

  updateSpill: (settings) =>
    set((state) => ({ spill: { ...state.spill, ...settings } })),

  updateTimeOfDay: (settings) =>
    set((state) => ({ timeOfDay: { ...state.timeOfDay, ...settings } })),

  updateRain: (settings) =>
    set((state) => ({ environment: { ...state.environment, rain: { ...state.environment.rain, ...settings } } })),

  updateSunGlare: (settings) =>
    set((state) => ({ environment: { ...state.environment, sunGlare: { ...state.environment.sunGlare, ...settings } } })),

  updateFog: (settings) =>
    set((state) => ({ environment: { ...state.environment, fog: { ...state.environment.fog, ...settings } } })),

  updateAmbient: (settings) =>
    set((state) => ({ ambient: { ...state.ambient, ...settings } })),

  requestAutoTune: () =>
    set({ autoTuneRequested: true }),

  clearAutoTuneRequest: () =>
    set({ autoTuneRequested: false }),

  setSceneMatch: (sceneMatch) =>
    set({ sceneMatch }),

  setQualityMode: (qualityMode) =>
    set({ qualityMode }),

  /**
   * Atomically load a full point preset into the composition store.
   * Sets location, corners, fitMode, display, cinematic, and spill in a
   * single store update so intermediate states never leak to React.
   */
  loadPointPreset: (preset) => {
    const faces = normalizeScreenFaces(preset.screenSelection);
    const location = preset.baseMediaUrl
      ? {
          url: preset.baseMediaUrl,
          type: preset.baseMediaType as MediaType,
          width: preset.baseWidth,
          height: preset.baseHeight,
        }
      : null;

    // Derive spill settings from the point's render preset
    const spillFromPreset: typeof DEFAULT_SPILL_SETTINGS = {
      enabled: preset.renderPreset.lightSpillEnabled ?? DEFAULT_SPILL_SETTINGS.enabled,
      intensity: preset.renderPreset.lightSpillIntensity ?? DEFAULT_SPILL_SETTINGS.intensity,
      radius: preset.renderPreset.lightSpillRadius ?? DEFAULT_SPILL_SETTINGS.radius,
      bezelReflection: preset.renderPreset.bezelReflection ?? DEFAULT_SPILL_SETTINGS.bezelReflection,
      dynamicColor: true,
    };

    const isStaticPrintPanel = preset.type === 'FrontLights' || preset.type === 'BackLights';
    const displayFromPreset = renderPresetToDisplay(preset.renderPreset);
    const cinematicFromPreset = renderPresetToCinematic(preset.renderPreset);

    if (isStaticPrintPanel) {
      // Static panels are printed media (lona/tecido), not emissive LED.
      displayFromPreset.screenNits = preset.type === 'BackLights' ? 420 : 300;
      displayFromPreset.pixelGridIntensity = 0;
      displayFromPreset.glassReflectivity = 0.03;
      displayFromPreset.glassRoughness = 0.34;

      cinematicFromPreset.bloomIntensity = Math.min(cinematicFromPreset.bloomIntensity, 0.14);
      cinematicFromPreset.chromaticAberration = Math.min(cinematicFromPreset.chromaticAberration, 0.01);
      cinematicFromPreset.highlightCompression = Math.max(cinematicFromPreset.highlightCompression, 0.28);
      cinematicFromPreset.grainIntensity = Math.max(cinematicFromPreset.grainIntensity, 0.1);
    }

    set({
      location,
      segmentation: null,
      hybridDetection: null,
      faces,
      activeFaceIndex: 0,
      corners: faces[0] ?? null,
      tracking: null,
      keyframeData: null,
      keyframeCorners: [],
      activeKeyframeIndex: 0,
      fitMode: preset.fitMode,
      display: displayFromPreset,
      cinematic: cinematicFromPreset,
      spill: spillFromPreset,
      ambient: {
        ...DEFAULT_AMBIENT_STATE,
        environmentType: preset.environmentType || 'street',
      },
    });
  },

  reset: () => set({ ...initialState, ...initialExtras }),

  exportPresetJSON: () => {
    const state = get();
    if (!state.location || !state.keyframeData || state.keyframeCorners.length === 0) {
      return null;
    }
    const preset = {
      id: crypto.randomUUID(),
      name: `Preset ${new Date().toISOString().slice(0, 10)}`,
      width: state.keyframeData.width,
      height: state.keyframeData.height,
      fps: state.keyframeData.fps,
      duration: state.keyframeData.duration,
      totalFrames: state.keyframeData.totalFrames,
      keyframeCorners: state.keyframeCorners,
      display: state.display,
      cinematic: state.cinematic,
      fitMode: state.fitMode,
    };
    return JSON.stringify(preset, null, 2);
  },

  importPresetJSON: (json) => {
    try {
      const preset = JSON.parse(json);
      if (!preset.keyframeCorners || !Array.isArray(preset.keyframeCorners)) return false;
      set({
        keyframeCorners: preset.keyframeCorners,
        display: preset.display ?? get().display,
        cinematic: preset.cinematic ?? get().cinematic,
        fitMode: preset.fitMode ?? get().fitMode,
      });
      return true;
    } catch {
      return false;
    }
  },
}));

function cloneCorners(corners: ScreenCorners): ScreenCorners {
  return corners.map((c) => ({ x: c.x, y: c.y })) as ScreenCorners;
}

function normalizeScreenFaces(screenSelection: import('@dooh/core').ScreenSelection): ScreenCorners[] {
  if (Array.isArray(screenSelection.faces) && screenSelection.faces.length > 0) {
    return screenSelection.faces.map(cloneCorners);
  }
  if (screenSelection.corners) {
    return [cloneCorners(screenSelection.corners)];
  }
  return [];
}
