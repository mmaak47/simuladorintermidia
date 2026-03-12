'use client';

import Link from 'next/link';

interface Props {
  pointName: string;
  /** Pass extra action buttons as children */
  children?: React.ReactNode;
}

/**
 * Actions strip shown after a simulation completes.
 * Rendered below the preview in the client simulation page.
 */
export function ResultActions({ pointName, children }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-6 py-4 bg-black/60 backdrop-blur-md border-t border-white/5">
      <div className="flex-1 min-w-0">
        <p className="text-label text-neutral-500 font-body truncate">Simulando em: <span className="text-white">{pointName}</span></p>
      </div>
      <Link
        href="/simulator/points"
        className="rounded-xl bg-white/10 px-5 py-2 text-sm font-body text-white hover:bg-white/15 transition-colors"
      >
        Trocar ponto
      </Link>
      {children}
      <button className="rounded-xl bg-accent px-5 py-2 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 transition-all duration-200 shadow-panel">
        Solicitar proposta
      </button>
    </div>
  );
}
