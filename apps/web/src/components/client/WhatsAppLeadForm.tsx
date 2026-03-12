'use client';

import { useCallback, useState } from 'react';
import type { WhatsAppLead } from '@/store/video-render-store';

interface WhatsAppLeadFormProps {
  onSubmit: (lead: WhatsAppLead) => void;
  onCancel: () => void;
}

export function WhatsAppLeadForm({ onSubmit, onCancel }: WhatsAppLeadFormProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    setSubmitted(true);
    onSubmit({ name: name.trim(), phone: phone.trim(), company: company.trim() });
  }, [name, phone, company, onSubmit]);

  if (submitted) {
    return (
      <div
        className="animate-fade-in"
        style={{
          borderRadius: 20,
          background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(37, 211, 102, 0.2)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          padding: '24px 20px',
          width: 320,
        }}
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-[#25D366]/10 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#25D366" strokeWidth="1.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <h3 className="text-sm font-heading font-semibold text-white">
              Dados recebidos!
            </h3>
            <p className="text-xs text-neutral-400 font-body leading-relaxed">
              Enviaremos o vídeo da simulação para o WhatsApp informado quando estiver pronto.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="animate-fade-in"
      style={{
        borderRadius: 20,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(37, 211, 102, 0.15)',
        boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
        padding: '24px 20px',
        width: 320,
      }}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#25D366]/10 flex items-center justify-center flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
              <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0 0 12 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 0 1-4.29-1.243l-.307-.184-2.87.853.853-2.87-.184-.307A8 8 0 1 1 12 20z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-heading font-semibold text-white">
              Receber pelo WhatsApp
            </h3>
            <p className="text-[10px] text-neutral-500 font-body mt-0.5">
              Enviaremos o vídeo quando estiver pronto.
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          <div>
            <label className="block text-[10px] text-neutral-500 font-body mb-1">Nome *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs text-white font-body placeholder:text-neutral-700 focus:outline-none focus:border-accent/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-500 font-body mb-1">WhatsApp *</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(00) 00000-0000"
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs text-white font-body placeholder:text-neutral-700 focus:outline-none focus:border-accent/30 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] text-neutral-500 font-body mb-1">Empresa <span className="text-neutral-700">(opcional)</span></label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Nome da empresa"
              className="w-full rounded-lg bg-white/[0.04] border border-white/[0.08] px-3 py-2 text-xs text-white font-body placeholder:text-neutral-700 focus:outline-none focus:border-accent/30 transition-colors"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl px-4 py-2.5 text-xs text-neutral-500 font-body hover:text-white transition-all duration-200 bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer"
          >
            Voltar
          </button>
          <button
            type="submit"
            disabled={!name.trim() || !phone.trim()}
            className="flex-1 rounded-xl bg-[#25D366] px-4 py-2.5 text-xs text-white font-body font-medium hover:bg-[#25D366]/90 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
