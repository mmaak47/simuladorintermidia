'use client';

import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { usePointStore } from '@/store/point-store';

const TYPE_LABELS: Record<string, string> = {
  elevator: 'Elevador',
  totem: 'Totem',
  billboard: 'Outdoor',
  'indoor-screen': 'Tela Indoor',
};

export default function AdminPointsPage() {
  const points = usePointStore((s) => s.points);
  const togglePublish = usePointStore((s) => s.togglePublish);
  const deletePoint = usePointStore((s) => s.deletePoint);

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-h1 font-heading font-bold text-white">Pontos DOOH</h1>
              <p className="text-body text-neutral-400 font-body mt-1">{points.length} pontos cadastrados</p>
            </div>
            <Link
              href="/admin/points/new"
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 transition-all duration-200 shadow-panel"
            >
              + Novo ponto
            </Link>
          </div>

          {/* Points table */}
          <div className="space-y-3">
            {points.map((point) => {
              const hasMedia = !!point.baseMediaUrl;
              const hasScreen = !!point.screenSelection.corners
                || !!(point.screenSelection.faces && point.screenSelection.faces.length > 0)
                || !!(point.screenSelection.keyframes && point.screenSelection.keyframes.length > 0);
              return (
                <div
                  key={point.id}
                  className="border border-white/10 rounded-panel p-4 bg-surface-1 flex items-center gap-4 hover:border-white/20 transition-colors"
                >
                  {/* Thumbnail */}
                  <div className="w-20 h-14 rounded-lg bg-surface-2 flex-shrink-0 overflow-hidden flex items-center justify-center">
                    {point.thumbnailUrl ? (
                      <img src={point.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl opacity-30">📺</span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-heading font-medium text-white truncate">{point.name}</h3>
                    <div className="flex items-center gap-3 text-label text-neutral-500 font-body mt-0.5">
                      <span>{TYPE_LABELS[point.type] ?? point.type}</span>
                      <span>{point.screenWidth && point.screenHeight ? `${point.screenWidth}×${point.screenHeight} (${point.screenAspect})` : point.screenAspect}</span>
                      <span>{hasMedia ? '✓ Mídia' : '— Sem mídia'}</span>
                      <span>{hasScreen ? '✓ Tela' : '— Sem tela'}</span>
                    </div>
                  </div>

                  {/* Status */}
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-heading font-semibold uppercase tracking-wider ${
                      point.published ? 'bg-green-500/15 text-green-400' : 'bg-white/5 text-neutral-500'
                    }`}
                  >
                    {point.published ? 'Publicado' : 'Rascunho'}
                  </span>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={hasMedia ? `/admin/points/${point.id}/editor` : `/admin/points/${point.id}/media`}
                      className="text-label text-accent hover:text-accent-hover transition-colors font-body"
                    >
                      Editar
                    </Link>
                    <button
                      onClick={() => togglePublish(point.id)}
                      className="text-label text-neutral-400 hover:text-white transition-colors font-body"
                    >
                      {point.published ? 'Despublicar' : 'Publicar'}
                    </button>
                    <button
                      onClick={() => deletePoint(point.id)}
                      className="text-label text-red-400 hover:text-red-300 transition-colors font-body"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
