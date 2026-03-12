'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';

type LeadStatus = 'new' | 'contacted' | 'proposal_sent' | 'closed';

interface LeadRow {
  id: string;
  name: string;
  company: string;
  email: string;
  whatsapp: string;
  pointName: string;
  pointsSimulated: number;
  creativeUploaded: boolean;
  dateCreated: string;
  status: LeadStatus;
}

const STATUS_OPTIONS: LeadStatus[] = ['new', 'contacted', 'proposal_sent', 'closed'];

export default function AdminLeadsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<LeadStatus | 'all'>('all');
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (status !== 'all') query.set('status', status);
      const res = await fetch(`/api/leads?${query.toString()}`);
      const data = (await res.json()) as LeadRow[];
      setRows(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const handleStatusUpdate = async (id: string, nextStatus: LeadStatus) => {
    await fetch(`/api/leads/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });

    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, status: nextStatus } : row)),
    );
  };

  const counters = useMemo(() => {
    const countBy = (key: LeadStatus) => rows.filter((r) => r.status === key).length;
    return {
      total: rows.length,
      new: countBy('new'),
      contacted: countBy('contacted'),
      proposal: countBy('proposal_sent'),
      closed: countBy('closed'),
    };
  }, [rows]);

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-6xl mx-auto space-y-6">
          <div>
            <h1 className="text-h1 font-heading font-bold text-white">Leads</h1>
            <p className="text-body text-neutral-400 font-body mt-1">
              Leads capturados no simulador com tracking de interesse.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: counters.total },
              { label: 'Novos', value: counters.new },
              { label: 'Contatados', value: counters.contacted },
              { label: 'Proposta', value: counters.proposal },
              { label: 'Fechados', value: counters.closed },
            ].map((item) => (
              <div key={item.label} className="rounded-panel bg-surface-1 border border-white/10 p-4">
                <p className="text-label text-neutral-500 font-body">{item.label}</p>
                <p className="text-h2 font-heading font-bold text-white mt-1">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-panel bg-surface-1 border border-white/10 p-4 flex flex-col sm:flex-row gap-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, empresa, WhatsApp..."
              className="flex-1 rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white font-body placeholder:text-neutral-600 focus:outline-none focus:border-accent/30"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LeadStatus | 'all')}
              className="rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-sm text-white font-body focus:outline-none focus:border-accent/30"
            >
              <option value="all">Todos os status</option>
              <option value="new">new</option>
              <option value="contacted">contacted</option>
              <option value="proposal_sent">proposal_sent</option>
              <option value="closed">closed</option>
            </select>
            <button
              onClick={loadLeads}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-body font-medium text-white hover:bg-accent-hover transition-colors"
            >
              Filtrar
            </button>
          </div>

          <div className="rounded-panel bg-surface-1 border border-white/10 overflow-hidden">
            <div className="overflow-auto">
              <table className="w-full min-w-[900px]">
                <thead className="bg-white/[0.03]">
                  <tr className="text-left text-[11px] text-neutral-500 font-body uppercase tracking-wider">
                    <th className="px-4 py-3">Nome</th>
                    <th className="px-4 py-3">Empresa</th>
                    <th className="px-4 py-3">WhatsApp</th>
                    <th className="px-4 py-3">Ponto simulado</th>
                    <th className="px-4 py-3">Data</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td className="px-4 py-6 text-sm text-neutral-500 font-body" colSpan={6}>
                        Carregando leads...
                      </td>
                    </tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr>
                      <td className="px-4 py-6 text-sm text-neutral-500 font-body" colSpan={6}>
                        Nenhum lead encontrado.
                      </td>
                    </tr>
                  )}
                  {!loading && rows.map((lead) => (
                    <tr key={lead.id} className="border-t border-white/5 text-sm font-body text-white/85">
                      <td className="px-4 py-3">{lead.name}</td>
                      <td className="px-4 py-3">{lead.company || '-'}</td>
                      <td className="px-4 py-3">{lead.whatsapp}</td>
                      <td className="px-4 py-3">{lead.pointName || '-'}</td>
                      <td className="px-4 py-3 text-neutral-400">{new Date(lead.dateCreated).toLocaleString('pt-BR')}</td>
                      <td className="px-4 py-3">
                        <select
                          value={lead.status}
                          onChange={(e) => handleStatusUpdate(lead.id, e.target.value as LeadStatus)}
                          className="rounded-md bg-white/[0.04] border border-white/[0.1] px-2 py-1 text-xs text-white font-body"
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
