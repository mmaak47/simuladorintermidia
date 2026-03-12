'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { usePointStore } from '@/store/point-store';

type CampaignSummary = {
  id: string;
  name: string;
  client: string;
  description: string;
  status: string;
  pointsCount: number;
  renderedCount: number;
  lastRenderAt: string | null;
};

type CampaignSimulationItem = {
  id: string;
  pointId: string;
  renderUrl: string;
  renderType: 'image' | 'video';
  status: string;
  createdAt: string;
  point: {
    id: string;
    name: string;
    city: string;
    slug: string;
    type: string;
  };
};

export default function CampaignsPage() {
  const points = usePointStore((s) => s.points);
  const fetchPoints = usePointStore((s) => s.fetchPoints);

  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [campaignSimulations, setCampaignSimulations] = useState<CampaignSimulationItem[]>([]);
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [attaching, setAttaching] = useState(false);

  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [description, setDescription] = useState('');

  const loadCampaigns = useCallback(async () => {
    const res = await fetch('/api/campaigns', { cache: 'no-store' });
    const data = (await res.json()) as CampaignSummary[];
    setCampaigns(data);
    if (!selectedCampaignId && data.length > 0) {
      setSelectedCampaignId(data[0].id);
    }
  }, [selectedCampaignId]);

  const loadSimulations = useCallback(async (campaignId: string) => {
    if (!campaignId) {
      setCampaignSimulations([]);
      return;
    }

    const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/simulations`, {
      cache: 'no-store',
    });
    const data = (await res.json()) as CampaignSimulationItem[];
    setCampaignSimulations(data);
  }, []);

  useEffect(() => {
    fetchPoints();
    loadCampaigns();
  }, [fetchPoints, loadCampaigns]);

  useEffect(() => {
    if (!selectedCampaignId) return;
    loadSimulations(selectedCampaignId);
  }, [selectedCampaignId, loadSimulations]);

  const availablePoints = useMemo(() => {
    const existing = new Set(campaignSimulations.map((s) => s.pointId));
    return points.filter((p) => !existing.has(p.id));
  }, [points, campaignSimulations]);

  const createCampaign = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setCreating(true);
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          client: client.trim(),
          description: description.trim(),
          status: 'draft',
        }),
      });
      if (!res.ok) return;
      const created = (await res.json()) as { id: string };
      setName('');
      setClient('');
      setDescription('');
      await loadCampaigns();
      setSelectedCampaignId(created.id);
    } finally {
      setCreating(false);
    }
  };

  const attachPoints = async () => {
    if (!selectedCampaignId || selectedPointIds.length === 0) return;

    setAttaching(true);
    try {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(selectedCampaignId)}/simulations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pointIds: selectedPointIds }),
      });
      if (!res.ok) return;
      setSelectedPointIds([]);
      await Promise.all([loadCampaigns(), loadSimulations(selectedCampaignId)]);
    } finally {
      setAttaching(false);
    }
  };

  const setSimulationStatus = async (id: string, status: string) => {
    await fetch(`/api/campaign-simulations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    await Promise.all([loadCampaigns(), loadSimulations(selectedCampaignId)]);
  };

  return (
    <AppShell>
      <main className="flex-1 min-h-0 p-4 md:p-6">
        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-4 h-full min-h-0">
          <section
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-4 overflow-y-auto"
            style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          >
            <div>
              <h1 className="text-lg font-heading font-semibold text-white">Campanhas</h1>
              <p className="text-xs text-neutral-500 font-body mt-1">
                Crie campanhas, adicione pontos e acompanhe status por simulação.
              </p>
            </div>

            <div className="space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome da campanha"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-accent/40"
              />
              <input
                value={client}
                onChange={(e) => setClient(e.target.value)}
                placeholder="Cliente"
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-accent/40"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descrição"
                rows={3}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none focus:border-accent/40"
              />
              <button
                onClick={createCampaign}
                disabled={creating || !name.trim()}
                className="w-full rounded-lg bg-accent px-3 py-2 text-sm text-white font-body disabled:opacity-50"
              >
                {creating ? 'Criando...' : 'Criar campanha'}
              </button>
            </div>

            <div className="space-y-2">
              {campaigns.length === 0 && (
                <p className="text-xs text-neutral-600 font-body">Nenhuma campanha ainda.</p>
              )}
              {campaigns.map((campaign) => {
                const selected = campaign.id === selectedCampaignId;
                return (
                  <button
                    key={campaign.id}
                    onClick={() => setSelectedCampaignId(campaign.id)}
                    className={`w-full text-left rounded-xl border px-3 py-2 transition-colors ${selected ? 'border-accent/40 bg-accent/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'}`}
                  >
                    <p className="text-sm text-white font-medium">{campaign.name}</p>
                    <p className="text-[11px] text-neutral-500 mt-0.5">
                      {campaign.client || 'Sem cliente'}
                    </p>
                    <p className="text-[11px] text-neutral-400 mt-1">
                      {campaign.pointsCount} pontos • {campaign.renderedCount} renderizados • {campaign.status}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>

          <section
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 md:p-5 flex flex-col min-h-0"
            style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          >
            {!selectedCampaignId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-neutral-500 font-body">
                Selecione ou crie uma campanha para começar.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h2 className="text-sm md:text-base font-heading font-semibold text-white">Pontos da campanha</h2>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/proposals/${encodeURIComponent(selectedCampaignId)}`}
                      className="rounded-md bg-white/10 hover:bg-white/15 px-2.5 py-1 text-[11px] text-white"
                    >
                      Baixar proposta PDF
                    </a>
                    <span className="text-[11px] text-neutral-500">{campaignSimulations.length} pontos vinculados</span>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 p-3 mb-4 bg-black/20">
                  <p className="text-xs text-neutral-400 mb-2">Adicionar pontos</p>
                  <div className="max-h-36 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {availablePoints.map((point) => {
                      const checked = selectedPointIds.includes(point.id);
                      return (
                        <label key={point.id} className="flex items-center gap-2 text-xs text-neutral-300 bg-white/[0.03] rounded-lg px-2 py-1.5 border border-white/5">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setSelectedPointIds((prev) => e.target.checked
                                ? [...prev, point.id]
                                : prev.filter((id) => id !== point.id));
                            }}
                          />
                          <span className="truncate">{point.name}</span>
                        </label>
                      );
                    })}
                    {availablePoints.length === 0 && (
                      <p className="text-xs text-neutral-600">Todos os pontos já foram adicionados.</p>
                    )}
                  </div>
                  <button
                    onClick={attachPoints}
                    disabled={attaching || selectedPointIds.length === 0}
                    className="mt-2 rounded-lg bg-white/10 hover:bg-white/15 px-3 py-1.5 text-xs text-white disabled:opacity-50"
                  >
                    {attaching ? 'Adicionando...' : `Adicionar ${selectedPointIds.length || ''} ponto(s)`}
                  </button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                  {campaignSimulations.length === 0 && (
                    <p className="text-sm text-neutral-500 font-body">Ainda não há pontos nessa campanha.</p>
                  )}

                  {campaignSimulations.map((sim) => (
                    <div key={sim.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm text-white font-medium">{sim.point.name}</p>
                          <p className="text-[11px] text-neutral-500">{sim.point.city || 'Sem cidade'} • {sim.point.type}</p>
                        </div>
                        <select
                          value={sim.status}
                          onChange={(e) => setSimulationStatus(sim.id, e.target.value)}
                          className="rounded-md bg-black/30 border border-white/10 px-2 py-1 text-xs text-white"
                        >
                          <option value="pending">pending</option>
                          <option value="rendered">rendered</option>
                          <option value="exported">exported</option>
                        </select>
                      </div>
                      {sim.renderUrl && (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                          <a
                            href={sim.renderUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-accent hover:underline"
                          >
                            Abrir render ({sim.renderType})
                          </a>
                          <a
                            href={`/simulator/ar?pointId=${encodeURIComponent(sim.pointId)}&campaignId=${encodeURIComponent(selectedCampaignId)}`}
                            className="text-xs text-neutral-300 hover:text-white"
                          >
                            Abrir AR preview
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
    </AppShell>
  );
}
