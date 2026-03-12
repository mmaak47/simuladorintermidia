'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { PreviewCanvas } from '@/components/simulator/PreviewCanvas';
import { ScreenDetector } from '@/components/simulator/ScreenDetector';
import { KeyframeEditor } from '@/components/simulator/KeyframeEditor';
import { DetectionDebugOverlay } from '@/components/simulator/DetectionDebugOverlay';
import { usePointStore } from '@/store/point-store';
import { useCompositionStore } from '@/store/composition-store';
import { renderPresetToDisplay, renderPresetToCinematic } from '@dooh/core';
import { DEFAULT_SPILL_SETTINGS } from '@dooh/core';
import type { ScreenCorners } from '@dooh/core';

export default function PointEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const point = usePointStore((s) => s.getPointById(id));
  const updateScreenSelection = usePointStore((s) => s.updateScreenSelection);
  const togglePublish = usePointStore((s) => s.togglePublish);

  const {
    location,
    corners,
    faces,
    activeFaceIndex,
    hybridDetection,
    keyframeCorners,
    setLocation,
    setCorners,
    setFaces,
    setActiveFaceIndex,
    addFaceFromCurrent,
    removeActiveFace,
    setFitMode,
    updateDisplay,
    updateCinematic,
    updateSpill,
    reset,
  } = useCompositionStore();

  const [loaded, setLoaded] = useState(false);

  // Load point data into composition store
  useEffect(() => {
    if (!point || loaded) return;
    if (point.baseMediaUrl) {
      setLocation(point.baseMediaUrl, point.baseMediaType, point.baseWidth, point.baseHeight);
    }
    if (point.screenSelection.faces && point.screenSelection.faces.length > 0) {
      setFaces(point.screenSelection.faces);
      setActiveFaceIndex(0);
    } else if (point.screenSelection.corners) {
      setCorners(point.screenSelection.corners);
    }
    setFitMode(point.fitMode);
    updateDisplay(renderPresetToDisplay(point.renderPreset));
    updateCinematic(renderPresetToCinematic(point.renderPreset));
    updateSpill(DEFAULT_SPILL_SETTINGS);
    setLoaded(true);
    return () => { reset(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point]);

  // Save screen selection to point store
  const handleSave = useCallback(() => {
    if (!point) return;

    if (keyframeCorners.length > 0) {
      updateScreenSelection(id, {
        mode: 'keyframes',
        keyframes: keyframeCorners.map((kc) => ({
          frame: kc.frameIndex,
          corners: kc.corners,
        })),
      });
    } else if (faces.length > 0) {
      updateScreenSelection(id, {
        mode: 'quad',
        corners: faces[0] as ScreenCorners,
        faces,
      });
    }
  }, [id, point, faces, keyframeCorners, updateScreenSelection]);

  const hasScreenSelection = faces.length > 0 || keyframeCorners.length > 0;

  if (!point) {
    return (
      <AppShell>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-body text-neutral-400 font-body">Ponto não encontrado</p>
            <button onClick={() => router.push('/admin/points')} className="rounded-xl bg-accent px-6 py-2.5 text-sm text-white font-body hover:bg-accent-hover transition-colors">Voltar</button>
          </div>
        </main>
      </AppShell>
    );
  }

  if (!point.baseMediaUrl) {
    return (
      <AppShell>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 animate-fade-in">
            <p className="text-body text-neutral-400 font-body">Nenhuma mídia base. Faça o upload primeiro.</p>
            <button onClick={() => router.push(`/admin/points/${id}/media`)} className="rounded-xl bg-accent px-6 py-2.5 text-sm text-white font-body hover:bg-accent-hover transition-colors">Upload de mídia</button>
          </div>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Topbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-surface-1 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.push('/admin/points')} className="text-neutral-500 hover:text-white text-sm transition-colors">← Voltar</button>
          <div className="h-4 w-px bg-white/10" />
          <h2 className="text-sm font-heading font-semibold text-white truncate">{point.name}</h2>
          <span className="text-[10px] font-heading font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-500/15 text-blue-400">
            Etapa 3 — Seleção de tela
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-heading font-semibold uppercase tracking-wider ${
            point.published ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-neutral-500'
          }`}>
            {point.published ? 'Publicado' : 'Rascunho'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={!hasScreenSelection}
            className="rounded-lg bg-white/10 px-4 py-1.5 text-label font-body text-white hover:bg-white/15 disabled:opacity-40 transition-colors"
          >
            Salvar seleção
          </button>
          <button
            onClick={() => { handleSave(); router.push(`/admin/points/${id}/settings`); }}
            disabled={!hasScreenSelection}
            className="rounded-lg bg-accent px-4 py-1.5 text-label font-body font-medium text-white hover:bg-accent-hover disabled:opacity-40 transition-colors"
          >
            Salvar e continuar →
          </button>
        </div>
      </div>

      {/* Editor workspace */}
      <div className="flex-1 relative min-h-0 bg-surface-0">
        <main className="absolute inset-0">
          {location ? (
            <PreviewCanvas editorMode="perspective" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-neutral-400 font-body">Carregando mídia...</p>
            </div>
          )}
        </main>

        {/* ─── Floating Technical Panels ───── */}
        <div className="absolute top-4 right-4 w-72 max-h-[calc(100vh-160px)] overflow-y-auto space-y-3 z-30">
          {/* Screen detection / keyframes */}
          {location && (
            <>
              {location.type === 'video' ? (
                <div className="glass-panel p-4 animate-fade-in">
                  <h3 className="text-label font-heading font-semibold text-white/80 uppercase tracking-wider mb-3">Quadros-chave</h3>
                  <KeyframeEditor />
                </div>
              ) : (
                <div className="glass-panel p-4 animate-fade-in">
                  <h3 className="text-label font-heading font-semibold text-white/80 uppercase tracking-wider mb-3">Detectar tela</h3>
                  <ScreenDetector />
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-neutral-400 font-body">Faces selecionadas: {faces.length}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={addFaceFromCurrent}
                          disabled={!corners}
                          className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] text-white hover:bg-white/15 disabled:opacity-40 transition-colors"
                        >
                          + Face
                        </button>
                        <button
                          onClick={removeActiveFace}
                          disabled={faces.length <= 1}
                          className="rounded-md bg-white/10 px-2.5 py-1 text-[11px] text-white hover:bg-white/15 disabled:opacity-40 transition-colors"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                    {faces.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {faces.map((_, index) => (
                          <button
                            key={index}
                            onClick={() => setActiveFaceIndex(index)}
                            className={`rounded-md px-2 py-1 text-[11px] transition-colors ${
                              activeFaceIndex === index
                                ? 'bg-accent text-white'
                                : 'bg-white/10 text-neutral-300 hover:bg-white/15'
                            }`}
                          >
                            Face {index + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {!corners && (
                    <p className="text-[11px] text-neutral-500 mt-2 font-body">
                      Ou ajuste manualmente no editor de perspectiva (arraste cantos, arestas e area interna).
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* Status */}
          {hasScreenSelection && (
            <div className="glass-panel p-4 animate-fade-in">
              <h3 className="text-label font-heading font-semibold text-green-400 uppercase tracking-wider mb-2">✓ Tela definida</h3>
              <p className="text-[11px] text-neutral-400 font-body">
                {keyframeCorners.length > 0
                  ? `${keyframeCorners.length} quadro(s)-chave definido(s)`
                  : `${faces.length} face(s) definida(s)`}
              </p>
            </div>
          )}

          {/* Debug overlay */}
          {hybridDetection && (
            <div className="glass-panel p-4 animate-fade-in">
              <h3 className="text-label font-heading font-semibold text-white/80 uppercase tracking-wider mb-3">Debug</h3>
              <DetectionDebugOverlay />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
