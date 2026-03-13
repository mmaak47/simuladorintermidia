'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { usePointStore } from '@/store/point-store';
import { formatHour } from '@/lib/time-of-day';
import type { RenderPreset, FitMode } from '@dooh/core';
import { DEFAULT_RENDER_PRESET } from '@dooh/core';
import type { SpillSettings } from '@dooh/core';
import { DEFAULT_SPILL_SETTINGS } from '@dooh/core';
import type { TimeOfDaySettings } from '@/lib/time-of-day';
import { DEFAULT_TIME_OF_DAY } from '@/lib/time-of-day';
import type { EnvironmentSettings } from '@/lib/environment-effects';
import { DEFAULT_ENVIRONMENT } from '@/lib/environment-effects';

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between">
        <label className="text-label text-neutral-400 font-body">{label}</label>
        <span className="text-label text-white font-body tabular-nums">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#FE5C2B]"
      />
    </div>
  );
}

export default function PointSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const point = usePointStore((s) => s.getPointById(id));
  const updateRenderPreset = usePointStore((s) => s.updateRenderPreset);
  const updateFitMode = usePointStore((s) => s.updateFitMode);
  const updatePoint = usePointStore((s) => s.updatePoint);
  const togglePublish = usePointStore((s) => s.togglePublish);

  const [preset, setPreset] = useState<RenderPreset>(
    point?.renderPreset
      ? { ...DEFAULT_RENDER_PRESET, ...point.renderPreset }
      : { ...DEFAULT_RENDER_PRESET },
  );
  const [fitMode, setFitMode] = useState<FitMode>(point?.fitMode ?? 'cover');
  const [spillSettings, setSpillSettings] = useState<SpillSettings>({ ...DEFAULT_SPILL_SETTINGS });
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDaySettings>({ ...DEFAULT_TIME_OF_DAY });
  const [environment, setEnvironment] = useState<EnvironmentSettings>(structuredClone(DEFAULT_ENVIRONMENT));

  // Metadata fields
  const [metaName, setMetaName] = useState(point?.name ?? '');
  const [metaCity, setMetaCity] = useState(point?.city ?? '');
  const [metaAddress, setMetaAddress] = useState(point?.address ?? '');
  const [metaDescription, setMetaDescription] = useState(point?.description ?? '');
  const [metaInsertionType, setMetaInsertionType] = useState(point?.insertionType ?? '');
  const [metaMinInsertions, setMetaMinInsertions] = useState<string>(
    point?.minimumInsertions != null ? String(point.minimumInsertions) : '',
  );
  const [metaAudience, setMetaAudience] = useState(point?.targetAudience ?? '');
  const [metaAudienceClass, setMetaAudienceClass] = useState(point?.audienceClassification ?? '');

  const [saved, setSaved] = useState(false);
  const isStaticPrintPanel = point?.type === 'FrontLights' || point?.type === 'BackLights';

  const handleSave = useCallback(() => {
    if (!point) return;
    updateRenderPreset(id, preset);
    updateFitMode(id, fitMode);
    // Save metadata
    updatePoint(id, {
      name: metaName.trim() || point.name,
      city: metaCity.trim(),
      address: metaAddress.trim(),
      description: metaDescription.trim(),
      insertionType: metaInsertionType.trim(),
      minimumInsertions: metaMinInsertions.trim() ? Number(metaMinInsertions) : undefined,
      targetAudience: metaAudience.trim(),
      audienceClassification: metaAudienceClass.trim(),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [id, point, preset, fitMode, updateRenderPreset, updateFitMode, updatePoint,
      metaName, metaCity, metaAddress, metaDescription,
      metaInsertionType, metaMinInsertions, metaAudience, metaAudienceClass]);

  if (!point) {
    return (
      <AppShell>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-body text-neutral-400 font-body">Ponto não encontrado</p>
        </main>
      </AppShell>
    );
  }

  const hasScreenSelection = !!point.screenSelection.corners
    || !!(point.screenSelection.faces && point.screenSelection.faces.length > 0)
    || !!(point.screenSelection.keyframes && point.screenSelection.keyframes.length > 0);

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-lg mx-auto space-y-8">
          {/* Header */}
          <div>
            <button
              onClick={() => router.push(`/admin/points/${id}/editor`)}
              className="text-sm text-neutral-500 hover:text-white transition-colors mb-4"
            >
              ← Voltar ao editor
            </button>
            <h1 className="text-h1 font-heading font-bold text-white">{point.name}</h1>
            <p className="text-body text-neutral-400 font-body mt-1">Etapa 4 — Configurar renderização</p>
          </div>

          {/* Completion status */}
          <div className="rounded-panel bg-surface-1 border border-white/10 p-4 space-y-2">
            <h3 className="text-label font-heading font-semibold text-white/80 uppercase tracking-wider">Status do ponto</h3>
            <div className="space-y-1 text-sm font-body">
              <div className="flex items-center gap-2">
                <span className={point.baseMediaUrl ? 'text-green-400' : 'text-neutral-500'}>{point.baseMediaUrl ? '✓' : '○'}</span>
                <span className={point.baseMediaUrl ? 'text-white' : 'text-neutral-500'}>Mídia base</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={hasScreenSelection ? 'text-green-400' : 'text-neutral-500'}>{hasScreenSelection ? '✓' : '○'}</span>
                <span className={hasScreenSelection ? 'text-white' : 'text-neutral-500'}>Seleção de tela</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-blue-400">◉</span>
                <span className="text-white">Preset de renderização</span>
              </div>
            </div>
          </div>

          {/* ─── Metadata ─── */}
          <div className="space-y-4">
            <h3 className="text-label font-heading font-semibold text-white/60 uppercase tracking-wider">Dados do ponto</h3>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-label text-neutral-400 font-body">Nome</label>
                <input type="text" value={metaName} onChange={(e) => setMetaName(e.target.value)} placeholder="Nome do ponto" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-label text-neutral-400 font-body">Praça / Cidade</label>
                  <input type="text" value={metaCity} onChange={(e) => setMetaCity(e.target.value)} placeholder="Ex: Londrina" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-label text-neutral-400 font-body">Endereço</label>
                  <input type="text" value={metaAddress} onChange={(e) => setMetaAddress(e.target.value)} placeholder="Ex: Av. Higienópolis, 1200 — Londrina/PR" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-label text-neutral-400 font-body">Descrição</label>
                <textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} rows={2} placeholder="Descrição curta do ponto" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-label text-neutral-400 font-body">Tipo de inserção</label>
                  <input type="text" value={metaInsertionType} onChange={(e) => setMetaInsertionType(e.target.value)} placeholder="Ex: Tela Vertical 9:16" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-label text-neutral-400 font-body">Inserções mínimas</label>
                  <input type="number" value={metaMinInsertions} onChange={(e) => setMetaMinInsertions(e.target.value)} placeholder="Ex: 120" min={0} className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-label text-neutral-400 font-body">Público-alvo</label>
                <input type="text" value={metaAudience} onChange={(e) => setMetaAudience(e.target.value)} placeholder="Ex: Executivos, compradores de alto valor" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-label text-neutral-400 font-body">Classificação de audiência</label>
                <input type="text" value={metaAudienceClass} onChange={(e) => setMetaAudienceClass(e.target.value)} placeholder="Ex: Classe A/B" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
              </div>
            </div>
          </div>

          {/* Fit mode */}
          <div className="space-y-1.5">
            <label className="text-label text-neutral-400 font-body">Fit mode</label>
            <div className="flex gap-2">
              {(['cover', 'contain'] as const).map((fm) => (
                <button
                  key={fm}
                  onClick={() => setFitMode(fm)}
                  className={`flex-1 rounded-lg py-2.5 text-sm font-body transition-all ${
                    fitMode === fm ? 'bg-accent text-white shadow-sm' : 'bg-white/[0.06] text-neutral-400 hover:bg-white/10'
                  }`}
                >
                  {fm === 'cover' ? 'Cover' : 'Contain'}
                </button>
              ))}
            </div>
          </div>

          {/* Render preset sliders */}
          <div className="space-y-5">
            <Slider label="Brilho (nits)" value={preset.screenNits} min={100} max={2500} step={50} onChange={(v) => setPreset((p) => ({ ...p, screenNits: v }))} />
            <Slider label="Bloom" value={preset.bloom} min={0} max={1} step={0.01} onChange={(v) => setPreset((p) => ({ ...p, bloom: v }))} />
            <Slider label="Reflexo do vidro" value={preset.glassReflection} min={0} max={1} step={0.01} onChange={(v) => setPreset((p) => ({ ...p, glassReflection: v }))} />
            <Slider label="Grão" value={preset.grain} min={0} max={1} step={0.01} onChange={(v) => setPreset((p) => ({ ...p, grain: v }))} />

            {isStaticPrintPanel && (
              <>
                <div className="pt-2 border-t border-white/10">
                  <h4 className="text-label font-heading font-semibold text-white/60 uppercase tracking-wider mb-3">
                    Midia Estatica ({point.type === 'BackLights' ? 'BackLight' : 'FrontLight'})
                  </h4>
                  <p className="text-[11px] text-neutral-500 font-body mb-3">
                    Ajusta o aspecto de lona/tecido para paineis sem LED emissivo.
                  </p>
                  <div className="space-y-5">
                    <Slider
                      label="Textura da lona"
                      value={preset.staticTextureIntensity ?? 0.45}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => setPreset((p) => ({ ...p, staticTextureIntensity: v }))}
                    />
                    <Slider
                      label="Transmissao de luz"
                      value={preset.staticLightTransmission ?? (point.type === 'BackLights' ? 0.65 : 0.4)}
                      min={0}
                      max={1}
                      step={0.01}
                      onChange={(v) => setPreset((p) => ({ ...p, staticLightTransmission: v }))}
                    />
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center justify-between">
              <label className="text-label text-neutral-400 font-body">Modo cinematográfico</label>
              <button
                onClick={() => setPreset((p) => ({ ...p, cinematicMode: !p.cinematicMode }))}
                className={`w-11 h-6 rounded-full transition-colors ${preset.cinematicMode ? 'bg-accent' : 'bg-white/10'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${preset.cinematicMode ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>

          {/* ─── Light Spill ─── */}
          <div className="space-y-4">
            <h3 className="text-label font-heading font-semibold text-white/60 uppercase tracking-wider">Light Spill</h3>
            <div className="flex items-center justify-between">
              <label className="text-label text-neutral-400 font-body">Ativado</label>
              <button
                onClick={() => setSpillSettings((s) => ({ ...s, enabled: !s.enabled }))}
                className={`w-11 h-6 rounded-full transition-colors ${spillSettings.enabled ? 'bg-accent' : 'bg-white/10'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${spillSettings.enabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {spillSettings.enabled && (
              <>
                <Slider label="Intensidade" value={spillSettings.intensity} min={0} max={1} step={0.01} onChange={(v) => setSpillSettings((s) => ({ ...s, intensity: v }))} />
                <Slider label="Raio" value={spillSettings.radius} min={0} max={1} step={0.01} onChange={(v) => setSpillSettings((s) => ({ ...s, radius: v }))} />
                <Slider label="Reflexo do bezel" value={spillSettings.bezelReflection} min={0} max={1} step={0.01} onChange={(v) => setSpillSettings((s) => ({ ...s, bezelReflection: v }))} />
              </>
            )}
          </div>

          {/* ─── Time of Day ─── */}
          <div className="space-y-4">
            <h3 className="text-label font-heading font-semibold text-white/60 uppercase tracking-wider">Hora do dia</h3>
            <div className="flex items-center justify-between">
              <label className="text-label text-neutral-400 font-body">Ativado</label>
              <button
                onClick={() => setTimeOfDay((t) => ({ ...t, enabled: !t.enabled }))}
                className={`w-11 h-6 rounded-full transition-colors ${timeOfDay.enabled ? 'bg-accent' : 'bg-white/10'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${timeOfDay.enabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {timeOfDay.enabled && (
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <label className="text-label text-neutral-400 font-body">Horário</label>
                  <span className="text-label text-white font-body tabular-nums">{formatHour(timeOfDay.hour)}</span>
                </div>
                <input type="range" min={0} max={24} step={0.5} value={timeOfDay.hour} onChange={(e) => setTimeOfDay((t) => ({ ...t, hour: Number(e.target.value) }))} className="w-full accent-[#FE5C2B]" />
              </div>
            )}
          </div>

          {/* ─── Environment Effects ─── */}
          <div className="space-y-4">
            <h3 className="text-label font-heading font-semibold text-white/60 uppercase tracking-wider">Ambiente</h3>
            {/* Rain */}
            <div className="flex items-center justify-between">
              <label className="text-label text-neutral-400 font-body">Chuva</label>
              <button
                onClick={() => setEnvironment((e) => ({ ...e, rain: { ...e.rain, enabled: !e.rain.enabled } }))}
                className={`w-11 h-6 rounded-full transition-colors ${environment.rain.enabled ? 'bg-accent' : 'bg-white/10'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${environment.rain.enabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {environment.rain.enabled && (
              <Slider label="Intensidade chuva" value={environment.rain.intensity} min={0} max={1} step={0.01} onChange={(v) => setEnvironment((e) => ({ ...e, rain: { ...e.rain, intensity: v } }))} />
            )}
            {/* Sun Glare */}
            <div className="flex items-center justify-between">
              <label className="text-label text-neutral-400 font-body">Reflexo solar</label>
              <button
                onClick={() => setEnvironment((e) => ({ ...e, sunGlare: { ...e.sunGlare, enabled: !e.sunGlare.enabled } }))}
                className={`w-11 h-6 rounded-full transition-colors ${environment.sunGlare.enabled ? 'bg-accent' : 'bg-white/10'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${environment.sunGlare.enabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {environment.sunGlare.enabled && (
              <>
                <Slider label="Intensidade" value={environment.sunGlare.intensity} min={0} max={1} step={0.01} onChange={(v) => setEnvironment((e) => ({ ...e, sunGlare: { ...e.sunGlare, intensity: v } }))} />
                <Slider label="Ângulo do sol" value={environment.sunGlare.angle} min={0} max={360} step={5} onChange={(v) => setEnvironment((e) => ({ ...e, sunGlare: { ...e.sunGlare, angle: v } }))} />
              </>
            )}
            {/* Fog */}
            <div className="flex items-center justify-between">
              <label className="text-label text-neutral-400 font-body">Neblina</label>
              <button
                onClick={() => setEnvironment((e) => ({ ...e, fog: { ...e.fog, enabled: !e.fog.enabled } }))}
                className={`w-11 h-6 rounded-full transition-colors ${environment.fog.enabled ? 'bg-accent' : 'bg-white/10'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${environment.fog.enabled ? 'translate-x-5.5' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {environment.fog.enabled && (
              <Slider label="Densidade" value={environment.fog.density} min={0} max={1} step={0.01} onChange={(v) => setEnvironment((e) => ({ ...e, fog: { ...e.fog, density: v } }))} />
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              className="rounded-xl bg-white/10 px-6 py-2.5 text-sm font-body text-white hover:bg-white/15 transition-colors"
            >
              {saved ? '✓ Salvo' : 'Salvar'}
            </button>
            <button
              onClick={() => { handleSave(); router.push(`/admin/points/${id}/preview`); }}
              className="rounded-xl bg-accent/80 px-6 py-2.5 text-sm font-body font-medium text-white hover:bg-accent transition-colors"
            >
              Visualizar preview
            </button>
            <button
              onClick={() => { handleSave(); togglePublish(id); }}
              className="rounded-xl bg-accent px-6 py-2.5 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 transition-all duration-200 shadow-panel"
            >
              {point.published ? 'Despublicar' : 'Publicar'}
            </button>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
