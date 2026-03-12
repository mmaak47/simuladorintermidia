'use client';

import { useMemo } from 'react';
import { usePointStore } from '@/store/point-store';
import { useClientStore } from '@/store/client-store';
import { useLeadSessionStore } from '@/store/lead-session-store';
import type { PointPreset } from '@dooh/core';

/* ── Pill selector ─────────────────────────────────────────── */

function PillGroup({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <h4 className="text-[10px] font-heading font-semibold text-white/40 uppercase tracking-wider">
        {label}
      </h4>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = opt === selected;
          return (
            <button
              key={opt}
              onClick={() => onSelect(active ? null : opt)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-body font-medium transition-all duration-150 cursor-pointer ${
                active
                  ? 'bg-accent text-white shadow-[0_0_10px_rgba(254,92,43,0.3)]'
                  : 'bg-white/[0.06] text-neutral-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Horizontal point card ─────────────────────────────────── */

function PointCardRow({
  point,
  isSelected,
  onSelect,
  onHoverStart,
  onHoverEnd,
}: {
  point: PointPreset;
  isSelected: boolean;
  onSelect: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      className={`group w-full flex rounded-xl overflow-hidden transition-all duration-200 cursor-pointer ${
        isSelected
          ? 'ring-2 ring-accent shadow-[0_0_18px_rgba(254,92,43,0.25)] bg-[#111]'
          : 'ring-1 ring-white/[0.06] bg-[#111] hover:ring-accent/50 hover:-translate-y-0.5 hover:shadow-[0_0_18px_rgba(254,92,43,0.25)]'
      }`}
      style={{ minHeight: 88 }}
    >
      {/* Thumbnail — left */}
      <div className="w-28 flex-shrink-0 relative overflow-hidden">
        {point.thumbnailUrl ? (
          <img src={point.thumbnailUrl} alt={point.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-white/[0.04] to-transparent">
            <span className="text-2xl opacity-20">📍</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#111]/60" />
      </div>

      {/* Info — right */}
      <div className="flex-1 min-w-0 p-3 flex flex-col justify-center gap-1">
        <h3
          className={`text-xs font-heading font-semibold truncate transition-colors leading-tight ${
            isSelected ? 'text-accent' : 'text-white group-hover:text-accent'
          }`}
        >
          {point.name}
        </h3>
        {point.insertionType && (
          <p className="text-[10px] text-neutral-500 font-body truncate leading-tight">
            {point.insertionType}
          </p>
        )}
        {point.address && (
          <p className="text-[10px] text-neutral-600 font-body truncate leading-tight">
            📍 {point.address}
          </p>
        )}
        {point.audienceClassification && (
          <p className="text-[10px] text-neutral-600 font-body truncate leading-tight">
            {point.audienceClassification}
          </p>
        )}
        {isSelected && (
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="text-[9px] text-accent font-body">Selecionado</span>
          </div>
        )}
      </div>
    </button>
  );
}

/* ── Main panel ────────────────────────────────────────────── */

export function PointBrowserPanel() {
  const published = usePointStore((s) => s.getPublishedPoints());
  const {
    selectedCity,
    selectedType,
    selectedPoint,
    setCity,
    setType,
    setPoint,
    setHoveredPoint,
  } = useClientStore();
  const leadCaptured = useLeadSessionStore((s) => s.leadCaptured);
  const simulatedPointIds = useLeadSessionStore((s) => s.simulatedPointIds);
  const openLeadGate = useLeadSessionStore((s) => s.openLeadGate);

  const cities = useMemo(
    () => [...new Set(published.map((p) => p.city).filter(Boolean))] as string[],
    [published],
  );

  const cityPoints = useMemo(
    () => (selectedCity ? published.filter((p) => p.city === selectedCity) : published),
    [published, selectedCity],
  );

  const types = useMemo(
    () => [...new Set(cityPoints.map((p) => p.type).filter(Boolean))] as string[],
    [cityPoints],
  );

  const filteredPoints = useMemo(
    () => (selectedType ? cityPoints.filter((p) => p.type === selectedType) : cityPoints),
    [cityPoints, selectedType],
  );

  const handlePointSelect = (point: PointPreset) => {
    if (selectedPoint?.id === point.id) {
      setPoint(null);
      return;
    }

    const isNewUnsimulatedPoint = !simulatedPointIds.includes(point.id);
    const reachedFreeLimit = simulatedPointIds.length >= 2;

    if (!leadCaptured && isNewUnsimulatedPoint && reachedFreeLimit) {
      openLeadGate({ id: point.id, name: point.name });
      return;
    }

    setPoint(point);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-[13px] font-heading font-semibold text-white tracking-tight">
          Inventário DOOH
        </h2>
        <p className="text-[10px] text-neutral-500 font-body mt-0.5" suppressHydrationWarning>
          {filteredPoints.length} ponto{filteredPoints.length !== 1 ? 's' : ''} disponíve{filteredPoints.length !== 1 ? 'is' : 'l'}
        </p>
      </div>

      {/* Filters */}
      <div className="px-4 py-2.5 space-y-2.5 border-b border-white/[0.04]">
        {cities.length > 0 && (
          <PillGroup label="Praça" options={cities} selected={selectedCity} onSelect={setCity} />
        )}
        {types.length > 0 && (
          <PillGroup
            label="Tipo"
            options={types}
            selected={selectedType}
            onSelect={setType}
          />
        )}
      </div>

      {/* Scrollable card list */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2.5 space-y-2"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.08) transparent',
        }}
      >
        {filteredPoints.length === 0 ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-[11px] text-neutral-600 font-body text-center leading-relaxed px-4">
              {selectedCity
                ? 'Nenhum ponto encontrado para esta seleção.'
                : 'Selecione uma praça para ver os pontos disponíveis.'}
            </p>
          </div>
        ) : (
          filteredPoints.map((p) => (
            <PointCardRow
              key={p.id}
              point={p}
              isSelected={selectedPoint?.id === p.id}
              onSelect={() => handlePointSelect(p)}
              onHoverStart={() => setHoveredPoint(p)}
              onHoverEnd={() => setHoveredPoint(null)}
            />
          ))
        )}
      </div>
    </div>
  );
}
