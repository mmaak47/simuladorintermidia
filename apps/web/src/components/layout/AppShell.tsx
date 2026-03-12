'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { FloatingWhatsAppButton } from './FloatingWhatsAppButton';

/** Shell layout with sidebar + main content area */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-surface-0">
      <div className="hidden md:block">
        <Sidebar />
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative">
        <header className="md:hidden h-12 px-3 border-b border-white/10 bg-black/90 backdrop-blur-sm flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md border border-white/15 text-white/80 hover:text-white hover:border-white/30 transition-colors"
            aria-label="Abrir menu"
          >
            <span className="text-base leading-none">☰</span>
          </button>
          <p className="text-xs font-heading tracking-wide text-white/80">Intermidia DOOH</p>
          <div className="h-8 w-8" />
        </header>

        {children}
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
            className="absolute inset-0 bg-black/70"
          />
          <div className="relative h-full w-[260px] max-w-[85vw]">
            <Sidebar className="h-full" onNavigate={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      <FloatingWhatsAppButton />
    </div>
  );
}
