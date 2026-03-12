'use client';

import Link from 'next/link';
import { AppShell } from '@/components/layout/AppShell';
import { usePointStore } from '@/store/point-store';

export default function AdminDashboard() {
  const points = usePointStore((s) => s.points);
  const published = points.filter((p) => p.published).length;

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-h1 font-heading font-bold text-white">Admin Dashboard</h1>
            <p className="text-body text-neutral-400 font-body mt-1">
              Gerencie pontos DOOH e presets de simulação
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { label: 'Total de pontos', value: points.length },
              { label: 'Publicados', value: published },
              { label: 'Rascunhos', value: points.length - published },
            ].map((stat) => (
              <div key={stat.label} className="rounded-panel bg-surface-1 border border-white/10 p-5">
                <p className="text-label text-neutral-500 font-body">{stat.label}</p>
                <p className="text-h1 font-heading font-bold text-white mt-1">{stat.value}</p>
              </div>
            ))}
          </div>

          {/* Quick links */}
          <div className="flex gap-4">
            <Link
              href="/admin/points"
              className="rounded-xl bg-accent px-6 py-3 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 transition-all duration-200 shadow-panel"
            >
              Gerenciar pontos
            </Link>
            <Link
              href="/admin/leads"
              className="rounded-xl bg-white/10 px-6 py-3 text-sm font-body text-white hover:bg-white/15 transition-colors"
            >
              Ver leads
            </Link>
            <Link
              href="/admin/points/new"
              className="rounded-xl bg-white/10 px-6 py-3 text-sm font-body text-white hover:bg-white/15 transition-colors"
            >
              + Novo ponto
            </Link>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
