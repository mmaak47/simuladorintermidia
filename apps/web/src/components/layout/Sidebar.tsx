'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const CLIENT_NAV = [
  { label: 'Simulador', href: '/simulator', icon: '▶' },
  { label: 'Pontos', href: '/simulator/points', icon: '◉' },
  { label: 'Campanhas', href: '/simulator/campaigns', icon: '◫' },
  { label: 'Exportações', href: '/simulator/exports', icon: '↗' },
  { label: 'AR Preview', href: '/simulator/ar', icon: '⌖' },
];

const ADMIN_NAV = [
  { label: 'Dashboard', href: '/admin', icon: '⊞' },
  { label: 'Pontos', href: '/admin/points', icon: '◉' },
  { label: 'Leads', href: '/admin/leads', icon: '✉' },
];

type SidebarProps = {
  className?: string;
  onNavigate?: () => void;
};

export function Sidebar({ className, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const items = isAdmin ? ADMIN_NAV : CLIENT_NAV;

  return (
    <nav className={`w-[260px] flex-shrink-0 bg-black flex flex-col border-r border-white/5 relative z-40 ${className ?? ''}`}>
      {/* Logo */}
      <div className="px-5 py-5">
        <Image
          src="/intro/logo.png"
          alt="Intermidia"
          width={170}
          height={48}
          priority
          className="h-9 w-auto object-contain"
        />
      </div>

      {/* Mode badge */}
      {isAdmin && (
        <div className="mx-5 mb-2 px-2.5 py-1 rounded-lg bg-accent/15 text-accent text-[10px] font-heading font-semibold uppercase tracking-widest text-center">
          Admin Mode
        </div>
      )}

      {/* Nav Menu */}
      <div className="flex-1 px-3 py-2 space-y-0.5">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body transition-all duration-150 ${
                active
                  ? 'text-accent bg-accent-muted'
                  : 'text-white/70 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {/* Divider + admin back link (hidden from public/client mode) */}
        {isAdmin && (
          <div className="pt-4 mt-4 border-t border-white/5">
            <Link
              href="/simulator"
              onClick={onNavigate}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body text-white/40 hover:text-white hover:bg-white/5 transition-all duration-150"
            >
              <span className="text-base w-5 text-center">◀</span>
              Voltar ao simulador
            </Link>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/5 flex flex-col items-start gap-2">
        <a
          href="https://www.instagram.com/intermidiadigitalooh/"
          target="_blank"
          rel="noreferrer"
          aria-label="Instagram Intermidia Digital OOH"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-white/55 transition-all duration-150 hover:border-accent/60 hover:text-accent"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.8" />
            <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
          </svg>
        </a>
        <p className="group inline-flex items-center gap-1 text-[10px] text-neutral-600 font-body transition-colors duration-200 hover:text-white/90">
          <span className="transition-transform duration-200 group-hover:-translate-y-[1px]">© 2026</span>
          <span className="text-accent transition-all duration-200 group-hover:brightness-125 group-hover:drop-shadow-[0_0_6px_rgba(254,92,43,0.45)]">
            Maitê Doin
          </span>
        </p>
      </div>
    </nav>
  );
}
