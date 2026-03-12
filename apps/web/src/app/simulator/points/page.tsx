'use client';

import { AppShell } from '@/components/layout/AppShell';
import { PointGrid } from '@/components/client/PointGrid';
import { usePointStore } from '@/store/point-store';

export default function PointsPage() {
  const published = usePointStore((s) => s.getPublishedPoints());

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-h1 font-heading font-bold text-white">Pontos DOOH</h1>
            <p className="text-body text-neutral-400 font-body mt-1">
              Selecione um ponto para simular seu criativo
            </p>
          </div>
          <PointGrid points={published} />
        </div>
      </main>
    </AppShell>
  );
}
