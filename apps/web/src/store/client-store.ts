import { create } from 'zustand';
import type { PointPreset, CreativeSource } from '@dooh/core';

export type SimulationStatus = 'idle' | 'uploading' | 'preparing' | 'rendering' | 'done' | 'error';

interface ClientStore {
  selectedCity: string | null;
  selectedType: string | null;
  selectedPoint: PointPreset | null;
  hoveredPoint: PointPreset | null;
  uploadedCreative: CreativeSource | null;
  simulationStatus: SimulationStatus;

  setCity: (city: string | null) => void;
  setType: (type: string | null) => void;
  setPoint: (point: PointPreset | null) => void;
  setHoveredPoint: (point: PointPreset | null) => void;
  setCreative: (creative: CreativeSource | null) => void;
  setSimulationStatus: (status: SimulationStatus) => void;
  resetSelection: () => void;
}

export const useClientStore = create<ClientStore>((set) => ({
  selectedCity: null,
  selectedType: null,
  selectedPoint: null,
  hoveredPoint: null,
  uploadedCreative: null,
  simulationStatus: 'idle',

  setCity: (city) => set({ selectedCity: city, selectedType: null, selectedPoint: null }),
  setType: (type) => set({ selectedType: type, selectedPoint: null }),
  setPoint: (point) => set({ selectedPoint: point }),
  setHoveredPoint: (point) => set({ hoveredPoint: point }),
  setCreative: (creative) => set({ uploadedCreative: creative, simulationStatus: creative ? 'uploading' : 'idle' }),
  setSimulationStatus: (status) => set({ simulationStatus: status }),
  resetSelection: () => set({ selectedCity: null, selectedType: null, selectedPoint: null, hoveredPoint: null, uploadedCreative: null, simulationStatus: 'idle' }),
}));
