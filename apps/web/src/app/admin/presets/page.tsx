'use client';

import { useState } from 'react';
import type { LocationPreset } from '@dooh/core';
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_CINEMATIC_SETTINGS } from '@dooh/core';
import { AppShell } from '@/components/layout/AppShell';

const DEMO_PRESETS: LocationPreset[] = [
  {
    id: 'elevator-lobby-01',
    name: 'Elevador — Lobby Shopping',
    mediaType: 'image',
    preset: {
      fitMode: 'cover',
      screenAspect: 9 / 16,
      display: { ...DEFAULT_DISPLAY_SETTINGS, screenNits: 500 },
      cinematic: { ...DEFAULT_CINEMATIC_SETTINGS },
    },
  },
  {
    id: 'outdoor-billboard-01',
    name: 'Outdoor — Av. Paulista',
    mediaType: 'image',
    preset: {
      fitMode: 'cover',
      screenAspect: 16 / 9,
      display: { ...DEFAULT_DISPLAY_SETTINGS, screenNits: 2000, pixelGridIntensity: 0.08 },
      cinematic: { ...DEFAULT_CINEMATIC_SETTINGS, bloomIntensity: 0.18 },
    },
  },
  {
    id: 'indoor-totem-01',
    name: 'Totem — Interior',
    mediaType: 'image',
    preset: {
      fitMode: 'contain',
      screenAspect: 9 / 16,
      display: { ...DEFAULT_DISPLAY_SETTINGS, screenNits: 400 },
      cinematic: { ...DEFAULT_CINEMATIC_SETTINGS, enabled: false },
    },
  },
];

export default function AdminPresetsPage() {
  const [presets, setPresets] = useState<LocationPreset[]>(DEMO_PRESETS);

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-6 font-body">
          <h1 className="text-h1 font-heading font-bold">Presets de Localização</h1>
          <p className="text-body text-neutral-500 mb-8">
            Presets legados — use <a href="/admin/points" className="text-accent hover:text-accent-hover transition-colors">Pontos DOOH</a> para o novo sistema.
          </p>

          <div className="space-y-4">
            {presets.map((preset) => (
              <div
                key={preset.id}
                className="border border-white/10 rounded-panel p-4 bg-surface-1 flex items-center justify-between hover:border-white/20 transition-colors"
              >
                <div>
                  <h3 className="font-heading font-medium">{preset.name}</h3>
                  <div className="text-label text-neutral-500 mt-1 space-x-3">
                    <span>ID: {preset.id}</span>
                    <span>Tipo: {preset.mediaType}</span>
                    <span>Aspecto: {preset.preset.screenAspect.toFixed(2)}</span>
                    <span>Nits: {preset.preset.display.screenNits}</span>
                    <span>Fit: {preset.preset.fitMode}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="text-label text-accent hover:text-accent-hover transition-colors">
                    Editar
                  </button>
                  <button className="text-label text-red-400 hover:text-red-300 transition-colors">
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button className="mt-6 rounded-panel border border-dashed border-white/10 px-4 py-3 w-full text-body text-neutral-400 hover:border-accent hover:text-accent transition-colors">
            + Adicionar preset
          </button>
        </div>
      </main>
    </AppShell>
  );
}
