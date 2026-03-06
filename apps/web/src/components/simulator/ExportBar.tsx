'use client';

import { useState } from 'react';
import { useCompositionStore } from '@/store/composition-store';

export function ExportBar() {
  const { location } = useCompositionStore();
  const [exporting, setExporting] = useState(false);

  const isVideo = location?.type === 'video';

  const handleExportImage = async () => {
    setExporting(true);
    try {
      // Find the compositor canvas (first canvas in the main area)
      const canvas = document.querySelector('main canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        alert('Nenhum canvas de preview encontrado');
        return;
      }

      // Convert to blob for better quality than toDataURL
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );

      if (!blob) {
        alert('Falha ao gerar imagem');
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `dooh-export-${Date.now()}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  const handleExportVideo = async () => {
    setExporting(true);
    try {
      alert('Exportação de vídeo será implementada na Fase 4');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex items-center justify-between border-t border-zinc-800 bg-surface-1 px-4 py-3">
      <div className="text-xs text-zinc-500">
        {isVideo ? 'Vídeo' : 'Imagem'} • {location?.width}×{location?.height}
      </div>
      <div className="flex gap-3">
        <button
          onClick={handleExportImage}
          disabled={exporting}
          className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {exporting ? 'Exportando...' : 'Exportar imagem'}
        </button>
        {isVideo && (
          <button
            onClick={handleExportVideo}
            disabled={exporting}
            className="rounded-lg border border-zinc-700 px-5 py-2 text-sm font-medium text-zinc-300 hover:border-accent disabled:opacity-50 transition-colors"
          >
            Exportar vídeo
          </button>
        )}
      </div>
    </div>
  );
}
