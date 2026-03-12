'use client';

import type { CompatibilityResult } from '@/services/aspect_ratio_utils';

/**
 * CreativeCompatibilityWarning
 *
 * Displays a premium warning card when the uploaded creative's aspect ratio
 * is significantly different from the selected point's screen aspect.
 */

interface Props {
  compatibility: CompatibilityResult;
  onContinue: () => void;
  onShowCompatible: () => void;
}

export function CreativeCompatibilityWarning({ compatibility, onContinue, onShowCompatible }: Props) {
  return (
    <div className="flex items-center justify-center h-full animate-fade-in">
      <div
        className="w-full max-w-md mx-auto"
        style={{
          borderRadius: 20,
          background: 'rgba(0, 0, 0, 0.88)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(245, 158, 11, 0.2)',
          boxShadow: '0 12px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset',
          padding: '28px 24px',
        }}
      >
        <div className="space-y-5">
          {/* Warning icon */}
          <div className="flex justify-center">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-amber-400">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
          </div>

          {/* Message */}
          <div className="text-center">
            <h3 className="text-sm font-heading font-semibold text-amber-300">Proporção incompatível</h3>
            <p className="text-xs text-neutral-300 font-body mt-2 leading-relaxed">
              {compatibility.message}
            </p>
          </div>

          {/* Consequences */}
          {compatibility.consequences.length > 0 && (
            <div className="space-y-1.5 bg-white/[0.03] rounded-xl p-3">
              <p className="text-[10px] text-neutral-500 font-body font-medium uppercase tracking-wider">
                Possíveis consequências
              </p>
              <ul className="space-y-1">
                {compatibility.consequences.map((c, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-amber-500/60 text-[10px] mt-0.5">•</span>
                    <span className="text-[11px] text-neutral-400 font-body leading-relaxed">{c}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1">
            <button
              onClick={onContinue}
              className="w-full rounded-xl bg-accent px-4 py-2.5 text-xs text-white font-body font-medium hover:bg-accent/90 transition-all duration-200 cursor-pointer"
            >
              Continuar assim mesmo
            </button>
            <button
              onClick={onShowCompatible}
              className="w-full rounded-xl bg-white/5 px-4 py-2.5 text-xs text-neutral-300 font-body hover:bg-white/10 transition-all duration-200 cursor-pointer"
            >
              Ver pontos compatíveis
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
