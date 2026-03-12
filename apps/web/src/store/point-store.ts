import { create } from 'zustand';
import type {
  PointPreset,
  ScreenSelection,
  RenderPreset,
  PointType,
  EnvironmentType,
  FitMode,
} from '@dooh/core';
import { DEFAULT_RENDER_PRESET } from '@dooh/core';

/* ─── Store interface ─────────────────────────────────────── */

interface PointStore {
  points: PointPreset[];
  initialized: boolean;

  // Async init
  fetchPoints: () => Promise<void>;

  // Queries
  getPublishedPoints: () => PointPreset[];
  getPointById: (id: string) => PointPreset | undefined;
  getPointBySlug: (slug: string) => PointPreset | undefined;

  // Mutations (mirror API endpoints)
  addPoint: (meta: {
    name: string; slug: string; type: PointType; environmentType?: EnvironmentType;
    screenWidth: number; screenHeight: number;
    city?: string; address?: string; description?: string;
    insertionType?: string; minimumInsertions?: number;
    targetAudience?: string; audienceClassification?: string;
  }) => Promise<string>;
  updateMedia: (id: string, media: { thumbnailUrl: string; baseMediaUrl: string; baseMediaType: 'image' | 'video'; baseWidth: number; baseHeight: number }) => void;
  updateScreenSelection: (id: string, screenSelection: ScreenSelection) => void;
  updateRenderPreset: (id: string, renderPreset: RenderPreset) => void;
  updateFitMode: (id: string, fitMode: FitMode) => void;
  togglePublish: (id: string) => void;
  deletePoint: (id: string) => void;
  updatePoint: (id: string, patch: Partial<PointPreset>) => void;
}

/** Sync helper — fire API call, no await needed in store */
function apiPatch(id: string, patch: Record<string, unknown>) {
  fetch(`/api/points/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export const usePointStore = create<PointStore>()(
  (set, get) => ({
    points: [],
    initialized: false,

    fetchPoints: async () => {
      if (get().initialized) return;
      const res = await fetch('/api/points');
      const data: PointPreset[] = await res.json();
      set({ points: data, initialized: true });
    },

    getPublishedPoints: () => get().points.filter((p) => p.published),
    getPointById: (id) => get().points.find((p) => p.id === id),
    getPointBySlug: (slug) => get().points.find((p) => p.slug === slug),

    addPoint: async ({ name, slug, type, environmentType, screenWidth, screenHeight, city, address, description, insertionType, minimumInsertions, targetAudience, audienceClassification }) => {
      const res = await fetch('/api/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, slug, type, environmentType: environmentType || 'street', screenWidth, screenHeight,
          city: city || '', address: address || '',
          description: description || '', insertionType: insertionType || '',
          minimumInsertions: minimumInsertions ?? null,
          targetAudience: targetAudience || '', audienceClassification: audienceClassification || '',
          screenSelection: { mode: 'quad' },
          renderPreset: { ...DEFAULT_RENDER_PRESET },
          published: false,
        }),
      });
      const point: PointPreset = await res.json();
      set((s) => ({ points: [...s.points, point] }));
      return point.id;
    },

    updateMedia: (id, media) => {
      set((s) => ({
        points: s.points.map((p) =>
          p.id === id ? { ...p, ...media, updatedAt: new Date().toISOString() } : p,
        ),
      }));
      apiPatch(id, media);
    },

    updateScreenSelection: (id, screenSelection) => {
      set((s) => ({
        points: s.points.map((p) =>
          p.id === id ? { ...p, screenSelection, updatedAt: new Date().toISOString() } : p,
        ),
      }));
      apiPatch(id, { screenSelection });
    },

    updateRenderPreset: (id, renderPreset) => {
      set((s) => ({
        points: s.points.map((p) =>
          p.id === id ? { ...p, renderPreset, updatedAt: new Date().toISOString() } : p,
        ),
      }));
      apiPatch(id, { renderPreset });
    },

    updateFitMode: (id, fitMode) => {
      set((s) => ({
        points: s.points.map((p) =>
          p.id === id ? { ...p, fitMode, updatedAt: new Date().toISOString() } : p,
        ),
      }));
      apiPatch(id, { fitMode });
    },

    togglePublish: (id) => {
      const point = get().points.find((p) => p.id === id);
      if (!point) return;
      const published = !point.published;
      set((s) => ({
        points: s.points.map((p) =>
          p.id === id ? { ...p, published, updatedAt: new Date().toISOString() } : p,
        ),
      }));
      apiPatch(id, { published });
    },

    deletePoint: (id) => {
      set((s) => ({ points: s.points.filter((p) => p.id !== id) }));
      fetch(`/api/points/${encodeURIComponent(id)}`, { method: 'DELETE' });
    },

    updatePoint: (id, patch) => {
      set((s) => ({
        points: s.points.map((p) =>
          p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
        ),
      }));
      apiPatch(id, patch);
    },
  }),
);
