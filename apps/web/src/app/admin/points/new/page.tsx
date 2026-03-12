'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { usePointStore } from '@/store/point-store';
import { calculateAspectRatio } from '@/services/aspect_ratio_utils';
import type { PointType, EnvironmentType } from '@dooh/core';

export default function NewPointPage() {
  const router = useRouter();
  const addPoint = usePointStore((s) => s.addPoint);

  const [name, setName] = useState('');
  const [type, setType] = useState<PointType>('Elevadores');
  const [environmentType, setEnvironmentType] = useState<EnvironmentType>('street');
  const [screenWidth, setScreenWidth] = useState(1080);
  const [screenHeight, setScreenHeight] = useState(1920);
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [insertionType, setInsertionType] = useState('');
  const [minInsertions, setMinInsertions] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [audienceClassification, setAudienceClassification] = useState('');

  const detectedAspect = useMemo(
    () => calculateAspectRatio(screenWidth, screenHeight),
    [screenWidth, screenHeight],
  );

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;

    const slug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

    const id = await addPoint({
      name: name.trim(),
      slug,
      type,
      environmentType,
      screenWidth,
      screenHeight,
      city: city.trim(),
      address: address.trim(),
      description: description.trim(),
      insertionType: insertionType.trim(),
      minimumInsertions: minInsertions.trim() ? Number(minInsertions) : undefined,
      targetAudience: targetAudience.trim(),
      audienceClassification: audienceClassification.trim(),
    });
    router.push(`/admin/points/${id}/media`);
  }, [name, type, environmentType, screenWidth, screenHeight, city, address, description, insertionType, minInsertions, targetAudience, audienceClassification, addPoint, router]);

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-lg mx-auto space-y-8">
          <div>
            <h1 className="text-h1 font-heading font-bold text-white">Novo Ponto DOOH</h1>
            <p className="text-body text-neutral-400 font-body mt-1">Etapa 1 — Informações básicas</p>
          </div>

          <div className="space-y-5">
            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-label text-neutral-400 font-body">Nome do ponto</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Elevador — Shopping Ibirapuera"
                className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors"
              />
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-label text-neutral-400 font-body">Tipo</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['Elevadores', 'Elevadores'],
                  ['Indoors', 'Indoors'],
                  ['Paineis de Led', 'Painéis de Led'],
                  ['FrontLights', 'FrontLights'],
                  ['BackLights', 'BackLights'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setType(value)}
                    className={`rounded-lg px-4 py-2.5 text-sm font-body transition-all ${
                      type === value
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-white/[0.06] text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Screen Resolution */}
            <div className="space-y-1.5">
              <label className="text-label text-neutral-400 font-body">Ambiente</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['street', 'Rua'],
                  ['shopping', 'Shopping'],
                  ['elevator', 'Elevador'],
                  ['pedestrian', 'Pedestre'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setEnvironmentType(value)}
                    className={`rounded-lg px-4 py-2.5 text-sm font-body transition-all ${
                      environmentType === value
                        ? 'bg-accent text-white shadow-sm'
                        : 'bg-white/[0.06] text-neutral-400 hover:bg-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Screen Resolution */}
            <div className="space-y-1.5">
              <label className="text-label text-neutral-400 font-body">Resolução da tela</label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] text-neutral-500 font-body">Largura (px)</span>
                  <input
                    type="number"
                    value={screenWidth}
                    onChange={(e) => setScreenWidth(Math.max(0, Number(e.target.value)))}
                    min={0}
                    placeholder="1080"
                    className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-neutral-500 font-body">Altura (px)</span>
                  <input
                    type="number"
                    value={screenHeight}
                    onChange={(e) => setScreenHeight(Math.max(0, Number(e.target.value)))}
                    min={0}
                    placeholder="1920"
                    className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors"
                  />
                </div>
              </div>
              {screenWidth > 0 && screenHeight > 0 && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-neutral-500 font-body">Proporção detectada:</span>
                  <span className="text-xs font-body font-medium text-accent">{detectedAspect.aspectLabel}</span>
                  <span className="text-[10px] text-neutral-600 font-body">
                    ({screenWidth > screenHeight ? 'Horizontal' : screenWidth < screenHeight ? 'Vertical' : 'Quadrado'})
                  </span>
                </div>
              )}
            </div>

            {/* ─── Metadata ─── */}
            <div className="pt-2 border-t border-white/[0.06] space-y-4">
              <h3 className="text-label font-heading font-semibold text-white/60 uppercase tracking-wider">Dados comerciais</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-label text-neutral-400 font-body">Praça / Cidade</label>
                  <input type="text" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ex: Londrina" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-label text-neutral-400 font-body">Endereço</label>
                  <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Av. Higienópolis, 1200 — Londrina/PR" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-label text-neutral-400 font-body">Descrição</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Descrição curta do ponto" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-label text-neutral-400 font-body">Tipo de inserção</label>
                  <input type="text" value={insertionType} onChange={(e) => setInsertionType(e.target.value)} placeholder="Ex: Tela Vertical 9:16" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-label text-neutral-400 font-body">Inserções mínimas</label>
                  <input type="number" value={minInsertions} onChange={(e) => setMinInsertions(e.target.value)} placeholder="Ex: 120" min={0} className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-label text-neutral-400 font-body">Público-alvo</label>
                <input type="text" value={targetAudience} onChange={(e) => setTargetAudience(e.target.value)} placeholder="Ex: Executivos, compradores de alto valor" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-label text-neutral-400 font-body">Classificação de audiência</label>
                <input type="text" value={audienceClassification} onChange={(e) => setAudienceClassification(e.target.value)} placeholder="Ex: Classe A/B" className="w-full rounded-lg bg-surface-2 border border-white/10 px-4 py-2.5 text-sm text-white font-body placeholder-neutral-600 focus:border-accent focus:outline-none transition-colors" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => router.push('/admin/points')}
              className="rounded-xl bg-white/10 px-6 py-2.5 text-sm font-body text-white hover:bg-white/15 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={!name.trim()}
              className="rounded-xl bg-accent px-6 py-2.5 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 transition-all duration-200 shadow-panel"
            >
              Criar e continuar →
            </button>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
