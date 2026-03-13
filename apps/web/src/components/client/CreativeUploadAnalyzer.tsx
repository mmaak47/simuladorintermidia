'use client';

import { useEffect, useState, useCallback } from 'react';
import type { CreativeAnalysis } from '@/services/creative_analysis';
import {
  generateLogoComposition,
  pickRandomHeadline,
  DEFAULT_STYLE_OPTIONS,
  type StyleOptions,
  type PatternType,
  type StylePreset,
  type BackgroundMode,
} from '@/services/logo_auto_layout';
import { parseAspectString } from '@/services/aspect_ratio_utils';
import { computeScreenAspect } from '@dooh/core';
import type { PointPreset, CreativeSource } from '@dooh/core';

/**
 * CreativeUploadAnalyzer
 *
 * Shown after upload analysis completes but before simulation begins.
 * Handles two scenarios:
 *   1. Logo detected → generates branded composition with style options, then calls onProceed
 *   2. Campaign image detected → calls onProceed immediately
 */

interface Props {
  analysis: CreativeAnalysis;
  originalFile: File;
  originalUrl: string;
  selectedPoint: PointPreset;
  onProceed: (creative: CreativeSource) => void;
  onCancel: () => void;
}

const PATTERN_OPTIONS: { value: PatternType; label: string }[] = [
  { value: 'none', label: 'Nenhum' },
  { value: 'dots', label: 'Pontos' },
  { value: 'grid', label: 'Grid' },
  { value: 'diagonal', label: 'Diagonal' },
  { value: 'waves', label: 'Ondas' },
];

const PRESET_OPTIONS: { value: StylePreset; label: string }[] = [
  { value: 'minimal', label: 'Minimal' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'premium', label: 'Premium' },
  { value: 'energetic', label: 'Energético' },
];

const BG_MODE_OPTIONS: { value: BackgroundMode; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'dark', label: 'Escuro' },
  { value: 'light', label: 'Claro' },
  { value: 'custom', label: 'Custom' },
];

export function CreativeUploadAnalyzer({
  analysis,
  originalFile,
  originalUrl,
  selectedPoint,
  onProceed,
  onCancel,
}: Props) {
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showOptions, setShowOptions] = useState(false);
  const [styleOptions, setStyleOptions] = useState<StyleOptions>({
    ...DEFAULT_STYLE_OPTIONS,
    headline: pickRandomHeadline(),
  });

  // Derive the creative's target dimensions from the most accurate source available:
  // 1. Actual face corner geometry (most reliable — reflects what the camera sees)
  // 2. screenWidth/screenHeight stored in DB (may be misconfigured)
  // 3. screenAspect label string (last resort)
  // This prevents portrait creatives being generated for wide-format panels.
  const faces = selectedPoint.screenSelection?.faces;
  const aspectFromFaces = faces && faces.length > 0 ? computeScreenAspect(faces[0]) : null;
  const aspectFromDb =
    selectedPoint.screenWidth > 0 && selectedPoint.screenHeight > 0
      ? selectedPoint.screenWidth / selectedPoint.screenHeight
      : null;
  const screenAspectRatio = aspectFromFaces ?? aspectFromDb ?? parseAspectString(selectedPoint.screenAspect);

  const BASE = 1080;
  const MAX_LONG = 3840;
  const targetW = screenAspectRatio >= 1
    ? Math.min(Math.round(BASE * screenAspectRatio), MAX_LONG)
    : BASE;
  const targetH = screenAspectRatio < 1
    ? Math.min(Math.round(BASE / screenAspectRatio), MAX_LONG)
    : BASE;

  const regenerate = useCallback((opts: StyleOptions) => {
    if (analysis.creativeType !== 'logo') return;
    setGenerating(true);
    generateLogoComposition(originalUrl, targetW, targetH, analysis.dominantColors, opts)
      .then((result) => {
        setPreviewUrl(result.composedUrl);
        setGenerating(false);
      })
      .catch(() => setGenerating(false));
  }, [analysis, originalUrl, targetW, targetH]);

  // Initial generation
  useEffect(() => {
    if (analysis.creativeType !== 'logo') return;
    regenerate(styleOptions);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateOption = <K extends keyof StyleOptions>(key: K, value: StyleOptions[K]) => {
    const next = { ...styleOptions, [key]: value };
    setStyleOptions(next);
    regenerate(next);
  };

  const handleProceedWithComposition = () => {
    if (!previewUrl) return;
    onProceed({ url: previewUrl, type: 'image', width: targetW, height: targetH });
  };

  const handleProceedOriginal = () => {
    onProceed({
      url: originalUrl,
      type: analysis.creativeType === 'campaign_video' ? 'video' : 'image',
      width: analysis.width,
      height: analysis.height,
    });
  };

  // ── Logo flow ──
  if (analysis.creativeType === 'logo') {
    return (
      <div className="flex h-full w-full items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6 animate-fade-in">
        <div
          className="w-full max-w-lg mx-auto overflow-hidden"
          style={{
            maxHeight: 'min(860px, calc(100dvh - 2rem))',
            borderRadius: 20,
            background: 'rgba(0, 0, 0, 0.88)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(254, 92, 43, 0.12)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          }}
        >
          <div className="space-y-5 overflow-y-auto p-4 sm:p-6" style={{ maxHeight: 'min(860px, calc(100dvh - 2rem))' }}>
            {/* Icon */}
            <div className="flex justify-center">
              <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-accent">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </div>
            </div>

            <div className="text-center">
              <h3 className="text-sm font-heading font-semibold text-white">Logo detectada</h3>
              <p className="text-xs text-neutral-400 font-body mt-1.5 leading-relaxed">
                Detectamos que você enviou apenas uma logo. Vamos criar uma composição base premium para sua simulação.
              </p>
            </div>

            {/* Preview area */}
            <div className="rounded-xl overflow-hidden border border-white/5 bg-black/40">
              {generating ? (
                <div className="flex items-center justify-center h-40">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-[10px] text-neutral-500 font-body">Gerando composição...</span>
                  </div>
                </div>
              ) : previewUrl ? (
                <div className="relative">
                  <img src={previewUrl} alt="Composição gerada" className="w-full h-auto" />
                  <div className="absolute top-2 right-2">
                    <span className="text-[9px] font-body bg-accent/20 text-accent px-2 py-0.5 rounded-full">
                      Preview
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-40">
                  <span className="text-xs text-red-400 font-body">Falha ao gerar composição</span>
                </div>
              )}
            </div>

            {/* Colors extracted */}
            {analysis.dominantColors.length > 0 && (
              <div className="flex items-center justify-center gap-1.5">
                <span className="text-[10px] text-neutral-600 font-body mr-1">Cores detectadas:</span>
                {analysis.dominantColors.slice(0, 5).map((c, i) => (
                  <div
                    key={i}
                    className="w-4 h-4 rounded-full border border-white/10"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            )}

            {/* Style Options Toggle */}
            <button
              onClick={() => setShowOptions(!showOptions)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-white/5 hover:bg-white/8 transition-colors cursor-pointer"
            >
              <span className="text-[11px] text-neutral-400 font-body">Personalizar estilo</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-neutral-500 transition-transform ${showOptions ? 'rotate-180' : ''}`}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {/* Style Options Panel */}
            {showOptions && (
              <div className="space-y-3 p-3 rounded-xl bg-white/[0.03] border border-white/5">
                {/* Background Mode */}
                <div>
                  <label className="text-[10px] text-neutral-500 font-body block mb-1.5">Fundo</label>
                  <div className="flex gap-1">
                    {BG_MODE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateOption('backgroundMode', opt.value)}
                        className={`flex-1 text-[10px] py-1.5 rounded-lg font-body transition-all cursor-pointer ${
                          styleOptions.backgroundMode === opt.value
                            ? 'bg-accent/20 text-accent border border-accent/30'
                            : 'bg-white/5 text-neutral-500 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {styleOptions.backgroundMode === 'custom' && (
                    <input
                      type="color"
                      value={styleOptions.customBgColor || '#1a1a2e'}
                      onChange={(e) => updateOption('customBgColor', e.target.value)}
                      className="mt-1.5 w-full h-7 rounded-lg cursor-pointer bg-transparent border border-white/10"
                    />
                  )}
                </div>

                {/* Pattern */}
                <div>
                  <label className="text-[10px] text-neutral-500 font-body block mb-1.5">Padrão</label>
                  <div className="flex gap-1">
                    {PATTERN_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateOption('pattern', opt.value)}
                        className={`flex-1 text-[10px] py-1.5 rounded-lg font-body transition-all cursor-pointer ${
                          styleOptions.pattern === opt.value
                            ? 'bg-accent/20 text-accent border border-accent/30'
                            : 'bg-white/5 text-neutral-500 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Style Preset */}
                <div>
                  <label className="text-[10px] text-neutral-500 font-body block mb-1.5">Estilo</label>
                  <div className="flex gap-1">
                    {PRESET_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => updateOption('preset', opt.value)}
                        className={`flex-1 text-[10px] py-1.5 rounded-lg font-body transition-all cursor-pointer ${
                          styleOptions.preset === opt.value
                            ? 'bg-accent/20 text-accent border border-accent/30'
                            : 'bg-white/5 text-neutral-500 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Headline */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] text-neutral-500 font-body">Headline</label>
                    <button
                      onClick={() => updateOption('headline', pickRandomHeadline())}
                      className="text-[9px] text-accent/70 font-body hover:text-accent transition-colors cursor-pointer"
                    >
                      Sortear
                    </button>
                  </div>
                  <input
                    type="text"
                    value={styleOptions.headline || ''}
                    onChange={(e) => updateOption('headline', e.target.value || undefined)}
                    placeholder="Deixe vazio para remover"
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white font-body placeholder:text-neutral-600 focus:outline-none focus:border-accent/30"
                  />
                </div>

                {/* CTA */}
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={styleOptions.showCta || false}
                      onChange={(e) => updateOption('showCta', e.target.checked)}
                      className="w-3.5 h-3.5 rounded bg-white/5 border border-white/10 accent-accent"
                    />
                    <span className="text-[10px] text-neutral-500 font-body">CTA</span>
                  </label>
                  {styleOptions.showCta && (
                    <input
                      type="text"
                      value={styleOptions.ctaText || ''}
                      onChange={(e) => updateOption('ctaText', e.target.value)}
                      className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[10px] text-white font-body focus:outline-none focus:border-accent/30"
                    />
                  )}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleProceedWithComposition}
                disabled={generating || !previewUrl}
                className="w-full rounded-xl bg-accent px-4 py-2.5 text-xs text-white font-body font-medium hover:bg-accent/90 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Usar esta composição
              </button>
              <button
                onClick={handleProceedOriginal}
                className="w-full rounded-xl bg-white/5 px-4 py-2 text-xs text-neutral-400 font-body hover:bg-white/10 transition-all duration-200 cursor-pointer"
              >
                Usar logo original mesmo assim
              </button>
              <button
                onClick={onCancel}
                className="text-[10px] text-neutral-600 font-body hover:text-neutral-400 transition-colors cursor-pointer mt-1"
              >
                Cancelar e escolher outro arquivo
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Campaign image / video → parent auto-proceeds ──
  return null;
}
