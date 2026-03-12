'use client';

import { useRef, useState } from 'react';
import type { CreativeSource } from '@dooh/core';

interface ABCreativePanelProps {
  variant: CreativeSource | null;
  enabled: boolean;
  onVariantChange: (next: CreativeSource | null) => void;
  onEnabledChange: (enabled: boolean) => void;
}

export function ABCreativePanel({
  variant,
  enabled,
  onVariantChange,
  onEnabledChange,
}: ABCreativePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async (file: File) => {
    setLoading(true);
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        onVariantChange({
          url,
          type: 'image',
          width: img.naturalWidth,
          height: img.naturalHeight,
        });
        setLoading(false);
      };
      img.onerror = () => setLoading(false);
      img.src = url;
    } catch {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/80 p-3 space-y-2"
      style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-heading font-semibold text-white uppercase tracking-wider">
          A/B Split Compare
        </h4>
        <label className="inline-flex items-center gap-1.5 text-[10px] text-neutral-400">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!variant}
            onChange={(e) => onEnabledChange(e.target.checked)}
          />
          Ativar
        </label>
      </div>

      <p className="text-[11px] text-neutral-500 leading-relaxed">
        Envie uma variacao de criativo para comparar lado a lado na tela.
      </p>

      <button
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-lg bg-white/10 hover:bg-white/15 px-3 py-2 text-xs text-white"
      >
        {loading ? 'Carregando...' : variant ? 'Trocar variacao B' : 'Enviar variacao B'}
      </button>

      {variant && (
        <button
          onClick={() => {
            onEnabledChange(false);
            onVariantChange(null);
          }}
          className="w-full rounded-lg bg-white/5 hover:bg-white/10 px-3 py-1.5 text-[11px] text-neutral-400"
        >
          Remover variacao B
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          void handleUpload(file);
        }}
      />
    </div>
  );
}
