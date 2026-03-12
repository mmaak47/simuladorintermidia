'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';

type ExportGroup = {
  campaign: {
    id: string;
    name: string;
    client: string;
    status: string;
  };
  items: Array<{
    id: string;
    pointId: string;
    pointName: string;
    city: string;
    renderUrl: string;
    renderType: string;
    status: string;
    createdAt: string;
  }>;
};

export default function ExportsPage() {
  const [groups, setGroups] = useState<ExportGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch('/api/exports', { cache: 'no-store' });
        const data = (await res.json()) as ExportGroup[];
        if (mounted) setGroups(data);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AppShell>
      <main className="flex-1 min-h-0 p-4 md:p-6">
        <div
          className="h-full rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5 overflow-y-auto"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        >
          <div className="mb-4">
            <h1 className="text-lg font-heading font-semibold text-white">Exportações</h1>
            <p className="text-xs text-neutral-500 font-body mt-1">
              Outputs renderizados agrupados por campanha.
            </p>
          </div>

          {loading && (
            <p className="text-sm text-neutral-500 font-body">Carregando exportações...</p>
          )}

          {!loading && groups.length === 0 && (
            <p className="text-sm text-neutral-500 font-body">
              Nenhuma exportação disponível ainda. Marque simulações como rendered/exported em Campanhas.
            </p>
          )}

          <div className="space-y-3">
            {groups.map((group) => (
              <section key={group.campaign.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div>
                    <h2 className="text-sm font-medium text-white">{group.campaign.name}</h2>
                    <p className="text-[11px] text-neutral-500">
                      {group.campaign.client || 'Sem cliente'} • {group.campaign.status} • {group.items.length} arquivos
                    </p>
                  </div>
                  <a
                    href={`/api/proposals/${encodeURIComponent(group.campaign.id)}`}
                    className="text-xs text-neutral-200 hover:text-white rounded-md bg-white/10 hover:bg-white/15 px-2.5 py-1"
                  >
                    Proposta PDF
                  </a>
                </div>

                <div className="space-y-1.5">
                  {group.items.map((item) => (
                    <div key={item.id} className="rounded-lg bg-white/[0.03] border border-white/5 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-white">{item.pointName}</p>
                        <p className="text-[11px] text-neutral-600">
                          {item.city || 'Sem cidade'} • {item.renderType} • {item.status}
                        </p>
                      </div>
                      {item.renderUrl ? (
                        <div className="flex items-center gap-3">
                          <a
                            href={item.renderUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-accent hover:underline"
                          >
                            Abrir arquivo
                          </a>
                          <a
                            href={`/simulator/ar?pointId=${encodeURIComponent(item.pointId)}&campaignId=${encodeURIComponent(group.campaign.id)}`}
                            className="text-xs text-neutral-300 hover:text-white"
                          >
                            AR preview
                          </a>
                        </div>
                      ) : (
                        <span className="text-[11px] text-neutral-600">Sem URL de render</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
