'use client';

import { useMemo } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Floating WhatsApp CTA for client-facing routes.
 * Hidden on admin routes.
 */
export function FloatingWhatsAppButton() {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');

  const href = useMemo(() => {
    const salesNumber = process.env.NEXT_PUBLIC_SALES_WHATSAPP_NUMBER ?? '5511999999999';
    const message = encodeURIComponent(
      'Ola! Vim pelo simulador da Intermidia e gostaria de falar com um representante comercial.',
    );
    return `https://wa.me/${salesNumber}?text=${message}`;
  }, []);

  if (isAdmin) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Falar com representante comercial no WhatsApp"
      className="fixed top-6 right-6 z-[70] group"
      title="Falar com comercial"
    >
      <span className="absolute inset-0 rounded-full bg-accent/35 blur-xl opacity-70 group-hover:opacity-100 transition-opacity duration-300" />
      <span className="relative inline-flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black/75 text-accent shadow-[0_12px_30px_rgba(0,0,0,0.45),0_0_0_1px_rgba(255,255,255,0.03)_inset] transition-all duration-200 group-hover:-translate-y-0.5 group-hover:border-accent/70 group-hover:text-white">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
          <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.29-1.243l-.307-.184-2.87.853.853-2.87-.184-.307A8 8 0 1 1 12 20z" />
        </svg>
      </span>
    </a>
  );
}
