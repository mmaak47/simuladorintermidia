import { create } from 'zustand';

export type VideoRenderMode =
  | 'idle'
  | 'preview'
  | 'deciding'
  | 'capturing-lead'
  | 'rendering'
  | 'complete'
  | 'error';

export interface WhatsAppLead {
  name: string;
  phone: string;
  company: string;
}

interface VideoRenderStore {
  mode: VideoRenderMode;
  beforeImage: string | null;
  afterImage: string | null;
  renderProgress: number;
  renderedVideoUrl: string | null;
  whatsappLead: WhatsAppLead | null;
  whatsappSubmitted: boolean;

  setMode: (mode: VideoRenderMode) => void;
  setPreviewImages: (before: string, after: string) => void;
  setRenderProgress: (progress: number) => void;
  setRenderedVideoUrl: (url: string | null) => void;
  submitWhatsAppLead: (lead: WhatsAppLead) => void;
  reset: () => void;
}

export const useVideoRenderStore = create<VideoRenderStore>((set) => ({
  mode: 'idle',
  beforeImage: null,
  afterImage: null,
  renderProgress: 0,
  renderedVideoUrl: null,
  whatsappLead: null,
  whatsappSubmitted: false,

  setMode: (mode) => set({ mode }),
  setPreviewImages: (before, after) => set({ beforeImage: before, afterImage: after }),
  setRenderProgress: (progress) => set({ renderProgress: progress }),
  setRenderedVideoUrl: (url) => set({ renderedVideoUrl: url }),
  submitWhatsAppLead: (lead) => set({ whatsappLead: lead, whatsappSubmitted: true }),
  reset: () => set({
    mode: 'idle',
    beforeImage: null,
    afterImage: null,
    renderProgress: 0,
    renderedVideoUrl: null,
    whatsappLead: null,
    whatsappSubmitted: false,
  }),
}));
