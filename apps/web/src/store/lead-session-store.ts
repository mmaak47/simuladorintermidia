import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface PendingPoint {
  id: string;
  name: string;
}

interface LeadSessionState {
  sessionId: string;
  simulatedPointIds: string[];
  simulationsCount: number;
  creativeUploaded: boolean;
  videoRequest: boolean;
  imageExport: boolean;
  leadCaptured: boolean;
  leadGateOpen: boolean;
  pendingPoint: PendingPoint | null;

  markSimulation: (pointId: string) => void;
  markCreativeUploaded: () => void;
  markVideoRequest: () => void;
  markImageExport: () => void;
  openLeadGate: (point: PendingPoint) => void;
  closeLeadGate: () => void;
  markLeadCaptured: () => void;
  resetSession: () => void;
}

function makeSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export const useLeadSessionStore = create<LeadSessionState>()(
  persist(
    (set) => ({
      sessionId: makeSessionId(),
      simulatedPointIds: [],
      simulationsCount: 0,
      creativeUploaded: false,
      videoRequest: false,
      imageExport: false,
      leadCaptured: false,
      leadGateOpen: false,
      pendingPoint: null,

      markSimulation: (pointId) =>
        set((state) => {
          if (state.simulatedPointIds.includes(pointId)) return state;
          const nextIds = [...state.simulatedPointIds, pointId];
          return {
            simulatedPointIds: nextIds,
            simulationsCount: nextIds.length,
          };
        }),

      markCreativeUploaded: () => set({ creativeUploaded: true }),
      markVideoRequest: () => set({ videoRequest: true }),
      markImageExport: () => set({ imageExport: true }),

      openLeadGate: (point) => set({ leadGateOpen: true, pendingPoint: point }),
      closeLeadGate: () => set({ leadGateOpen: false, pendingPoint: null }),
      markLeadCaptured: () => set({ leadCaptured: true, leadGateOpen: false, pendingPoint: null }),

      resetSession: () =>
        set({
          sessionId: makeSessionId(),
          simulatedPointIds: [],
          simulationsCount: 0,
          creativeUploaded: false,
          videoRequest: false,
          imageExport: false,
          leadCaptured: false,
          leadGateOpen: false,
          pendingPoint: null,
        }),
    }),
    {
      name: 'dooh-lead-session',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
