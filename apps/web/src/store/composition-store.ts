import { create } from 'zustand';
import type {
  CompositionState,
  ScreenCorners,
  SegmentationResponse,
  HybridDetectionResult,
  TrackingResponse,
  CreativeSource,
  DisplaySettings,
  CinematicSettings,
  SceneMatchParams,
  FitMode,
  QualityMode,
  MediaType,
} from '@dooh/core';
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_CINEMATIC_SETTINGS } from '@dooh/core';

interface CompositionStore extends CompositionState {
  // Actions
  setLocation: (url: string, type: MediaType, width: number, height: number) => void;
  setSegmentation: (seg: SegmentationResponse) => void;
  setHybridDetection: (result: HybridDetectionResult) => void;
  setCorners: (corners: ScreenCorners) => void;
  updateCorner: (index: number, x: number, y: number) => void;
  setTracking: (tracking: TrackingResponse) => void;
  setCreative: (creative: CreativeSource) => void;
  setFitMode: (mode: FitMode) => void;
  updateDisplay: (settings: Partial<DisplaySettings>) => void;
  updateCinematic: (settings: Partial<CinematicSettings>) => void;
  setSceneMatch: (params: SceneMatchParams) => void;
  setQualityMode: (mode: QualityMode) => void;
  reset: () => void;
}

const initialState: CompositionState = {
  location: null,
  segmentation: null,
  hybridDetection: null,
  corners: null,
  tracking: null,
  creative: null,
  fitMode: 'cover',
  display: { ...DEFAULT_DISPLAY_SETTINGS },
  cinematic: { ...DEFAULT_CINEMATIC_SETTINGS },
  sceneMatch: null,
  qualityMode: 'preview',
};

export const useCompositionStore = create<CompositionStore>((set) => ({
  ...initialState,

  setLocation: (url, type, width, height) =>
    set({
      location: { url, type, width, height },
      segmentation: null,
      hybridDetection: null,
      corners: null,
      tracking: null,
    }),

  setSegmentation: (seg) =>
    set({ segmentation: seg, corners: seg.corners }),

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
    }),

  setCorners: (corners) =>
    set({ corners }),

  updateCorner: (index, x, y) =>
    set((state) => {
      if (!state.corners) return {};
      const updated = [...state.corners] as unknown as ScreenCorners;
      updated[index] = { x, y };
      return { corners: updated };
    }),

  setTracking: (tracking) =>
    set({ tracking }),

  setCreative: (creative) =>
    set({ creative }),

  setFitMode: (fitMode) =>
    set({ fitMode }),

  updateDisplay: (settings) =>
    set((state) => ({ display: { ...state.display, ...settings } })),

  updateCinematic: (settings) =>
    set((state) => ({ cinematic: { ...state.cinematic, ...settings } })),

  setSceneMatch: (sceneMatch) =>
    set({ sceneMatch }),

  setQualityMode: (qualityMode) =>
    set({ qualityMode }),

  reset: () => set(initialState),
}));
