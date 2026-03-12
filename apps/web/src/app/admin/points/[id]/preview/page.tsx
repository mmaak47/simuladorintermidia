'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { PreviewCanvas } from '@/components/simulator/PreviewCanvas';
import { ControlPanel } from '@/components/simulator/ControlPanel';
import { CompliancePanel } from '@/components/simulator/CompliancePanel';
import { usePointStore } from '@/store/point-store';
import { useCompositionStore } from '@/store/composition-store';
import { CreativeUploadPanel } from '@/components/client/CreativeUploadPanel';
import { renderPresetToDisplay, renderPresetToCinematic, DEFAULT_SPILL_SETTINGS } from '@dooh/core';
import type { CreativeSource } from '@dooh/core';

export default function PointPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const point = usePointStore((s) => s.getPointById(id));
  const {
    setLocation,
    setCorners,
    setFaces,
    setFitMode,
    updateDisplay,
    updateCinematic,
    updateSpill,
    setCreative,
    creative,
    location,
    corners,
    reset,
  } = useCompositionStore();

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!point || loaded) return;
    if (point.baseMediaUrl) {
      setLocation(point.baseMediaUrl, point.baseMediaType, point.baseWidth, point.baseHeight);
    }
    if (point.screenSelection.faces && point.screenSelection.faces.length > 0) {
      setFaces(point.screenSelection.faces);
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

  if (!point) {
    return (
      <AppShell>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-body text-neutral-400 font-body">Ponto não encontrado</p>
        </main>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Topbar */}
      <div className="flex items-center justify-between px-5 py-3 bg-surface-1 border-b border-white/5 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(`/admin/points/${id}/settings`)} className="text-neutral-500 hover:text-white text-sm transition-colors">← Configurações</button>
          <div className="h-4 w-px bg-white/10" />
          <h2 className="text-sm font-heading font-semibold text-white">Preview — {point.name}</h2>
        </div>
        <Link
          href={`/admin/points/${id}/editor`}
          className="rounded-lg bg-white/10 px-4 py-1.5 text-label font-body text-white hover:bg-white/15 transition-colors"
        >
          Voltar ao editor
        </Link>
      </div>

      <main className="flex-1 relative min-h-0 bg-surface-0">
        {creative && corners && location ? (
          <>
            <PreviewCanvas readOnly editorMode="none" />
            {/* ─── Floating Control Panels ─── */}
            <div className="absolute top-4 right-4 w-72 max-h-[calc(100vh-120px)] overflow-y-auto space-y-3 z-30">
              <div className="glass-panel p-4 animate-fade-in">
                <ControlPanel />
              </div>
              <div className="glass-panel p-4 animate-fade-in" style={{ animationDelay: '60ms' }}>
                <CompliancePanel />
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="max-w-md w-full px-4 animate-fade-in space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-h2 font-heading font-bold text-white">Preview do ponto</h2>
                <p className="text-body text-neutral-400 font-body">
                  Envie um criativo de teste para ver como ficará a simulação
                </p>
              </div>
              <CreativeUploadPanel onUpload={(c: CreativeSource) => setCreative(c)} />
            </div>
          </div>
        )}
      </main>
    </AppShell>
  );
}
