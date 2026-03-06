'use client';

import { useState } from 'react';
import type { LocationPreset } from '@dooh/core';
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_CINEMATIC_SETTINGS } from '@dooh/core';

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
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Presets de Localização</h1>
      <p className="text-zinc-500 mb-8">
        Gerencie presets para que usuários finais não precisem ajustar manualmente.
      </p>

      <div className="space-y-4">
        {presets.map((preset) => (
          <div
            key={preset.id}
            className="border border-zinc-800 rounded-lg p-4 bg-surface-1 flex items-center justify-between"
          >
            <div>
              <h3 className="font-medium">{preset.name}</h3>
              <div className="text-xs text-zinc-500 mt-1 space-x-3">
                <span>ID: {preset.id}</span>
                <span>Tipo: {preset.mediaType}</span>
                <span>Aspecto: {preset.preset.screenAspect.toFixed(2)}</span>
                <span>Nits: {preset.preset.display.screenNits}</span>
                <span>Fit: {preset.preset.fitMode}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="text-xs text-accent hover:text-accent-hover">
                Editar
              </button>
              <button className="text-xs text-red-400 hover:text-red-300">
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <button className="mt-6 rounded-lg border border-dashed border-zinc-700 px-4 py-3 w-full text-sm text-zinc-400 hover:border-accent transition-colors">
        + Adicionar preset
      </button>
    </div>
  );
}
