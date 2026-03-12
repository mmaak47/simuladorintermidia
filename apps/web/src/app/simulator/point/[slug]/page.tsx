'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { CreativeUploadPanel } from '@/components/client/CreativeUploadPanel';
import { ResultActions } from '@/components/client/ResultActions';
import { PreviewCanvas } from '@/components/simulator/PreviewCanvas';
import { ExportBar } from '@/components/simulator/ExportBar';
import { usePointStore } from '@/store/point-store';
import { useCompositionStore } from '@/store/composition-store';
import type { CreativeSource } from '@dooh/core';

export default function PointSimulationPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const point = usePointStore((s) => s.getPointBySlug(slug));
  const loadPointPreset = useCompositionStore((s) => s.loadPointPreset);
  const setCreative = useCompositionStore((s) => s.setCreative);
  const creative = useCompositionStore((s) => s.creative);
  const location = useCompositionStore((s) => s.location);
  const corners = useCompositionStore((s) => s.corners);
  const reset = useCompositionStore((s) => s.reset);

  const [loaded, setLoaded] = useState(false);

  // Load preset into composition store automatically (atomic single-set)
  useEffect(() => {
    if (!point || loaded) return;

    loadPointPreset(point);
    setLoaded(true);

    return () => { reset(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point]);

  if (!point) {
    return (
      <AppShell>
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 animate-fade-in">
            <p className="text-body text-neutral-400 font-body">Ponto não encontrado</p>
            <button
              onClick={() => router.push('/simulator/points')}
              className="rounded-xl bg-accent px-6 py-2.5 text-sm text-white font-body hover:bg-accent-hover transition-colors"
            >
              Ver pontos disponíveis
            </button>
          </div>
        </main>
      </AppShell>
    );
  }

  const handleCreativeUpload = (c: CreativeSource) => {
    setCreative(c);
  };

  const hasScreenSelection = !!corners;

  return (
    <AppShell>
      <main className="flex-1 relative min-h-0 bg-surface-0">
        {/* Creative uploaded + screen configured → show full simulation */}
        {creative && hasScreenSelection && location ? (
          <PreviewCanvas readOnly />
        ) : (
          /* Creative upload prompt — NO location/media upload */
          <div className="flex items-center justify-center h-full">
            <div className="max-w-md w-full px-4 animate-fade-in space-y-6">
              <div className="text-center space-y-2">
                <h2 className="text-h2 font-heading font-bold text-white">{point.name}</h2>
                <p className="text-body text-neutral-400 font-body">
                  Envie seu criativo para iniciar a simulação
                </p>
              </div>
              <CreativeUploadPanel onUpload={handleCreativeUpload} />
            </div>
          </div>
        )}
      </main>

      {/* Bottom bar — result actions or export */}
      {creative && hasScreenSelection ? (
        <>
          <ExportBar />
          <ResultActions pointName={point.name} />
        </>
      ) : null}
    </AppShell>
  );
}
