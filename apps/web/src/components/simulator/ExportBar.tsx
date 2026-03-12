'use client';

import { useState, useCallback } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import { useLeadSessionStore } from '@/store/lead-session-store';
import { useClientStore } from '@/store/client-store';
import { exportVideoStream } from '@dooh/core';
import type { VideoExportProgress } from '@dooh/core';
import { LeadCaptureModal } from '@/components/client/LeadCaptureModal';
import { submitLead } from '@/lib/lead-api';

const VISION_BASE = process.env.NEXT_PUBLIC_VISION_API_URL ?? 'http://localhost:8000';

export function ExportBar() {
  const { location, creative, keyframeCorners, fitMode, display, cinematic } = useCompositionStore();
  const selectedPoint = useClientStore((s) => s.selectedPoint);
  const [exportingImage, setExportingImage] = useState(false);
  const [exportingVideo, setExportingVideo] = useState(false);
  const [progress, setProgress] = useState<VideoExportProgress | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showImageLeadModal, setShowImageLeadModal] = useState(false);
  const [exportClientName, setExportClientName] = useState<string>('');
  const markImageExport = useLeadSessionStore((s) => s.markImageExport);
  const markLeadCaptured = useLeadSessionStore((s) => s.markLeadCaptured);

  const isVideo = location?.type === 'video';
  const hasKeyframes = keyframeCorners.length > 0;

  // ─── Image export (client-side canvas grab) ─────────────────
  const performExportImage = useCallback(async (clientName?: string) => {
    setExportingImage(true);
    try {
      const canvas = document.querySelector('main canvas') as HTMLCanvasElement | null;
      if (!canvas) return;

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = buildSimulationFileName({
        pointName: selectedPoint?.name,
        clientName,
        ext: 'png',
      });
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setExportingImage(false);
    }
  }, [selectedPoint?.name]);

  const handleExportImage = useCallback(() => {
    markImageExport();
    setShowImageLeadModal(true);
  }, [markImageExport]);

  const handleImageLeadSubmit = useCallback(async (lead: { name: string; whatsapp: string }) => {
    await submitLead({
      name: lead.name,
      whatsapp: lead.whatsapp,
      pointName: selectedPoint?.name ?? '',
      source: 'image_export',
    });
    setExportClientName(lead.name);
    markLeadCaptured();
    setShowImageLeadModal(false);
    await performExportImage(lead.name);
  }, [selectedPoint?.name, markLeadCaptured, performExportImage]);

  // ─── Video export (backend compositing with SSE progress) ───
  const handleExportVideo = useCallback(async () => {
    if (!location || !creative || keyframeCorners.length === 0) return;

    setExportingVideo(true);
    setProgress(null);
    setDownloadUrl(null);
    setError(null);

    try {
      // Fetch location video as blob
      const locRes = await fetch(location.url);
      const locationBlob = await locRes.blob();

      // Fetch creative as blob
      const crRes = await fetch(creative.url);
      const creativeBlob = await crRes.blob();

      const result = await exportVideoStream(
        locationBlob,
        creativeBlob,
        creative.type === 'video',
        keyframeCorners,
        {
          fitMode,
          glassReflectivity: display.glassReflectivity,
          screenNits: display.screenNits,
          vignette: cinematic.enabled ? cinematic.vignetteIntensity : 0,
          grain: cinematic.enabled ? cinematic.grainIntensity : 0,
        },
        (p) => setProgress(p),
      );

      if (result.status === 'done' && result.downloadUrl) {
        setDownloadUrl(`${VISION_BASE}${result.downloadUrl}`);
      } else if (result.status === 'error') {
        setError(result.message ?? 'Erro na exportação');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro na exportação');
    } finally {
      setExportingVideo(false);
    }
  }, [location, creative, keyframeCorners, fitMode, display, cinematic]);

  // ─── Download the exported video ────────────────────────────
  const handleDownload = useCallback(() => {
    if (!downloadUrl) return;
    const link = document.createElement('a');
    link.download = buildSimulationFileName({
      pointName: selectedPoint?.name,
      clientName: exportClientName,
      ext: 'mp4',
    });
    link.href = downloadUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [downloadUrl, selectedPoint?.name, exportClientName]);

  return (
    <div className="border-t border-white/5 bg-black/80 backdrop-blur-md px-6 py-4">
      {/* Top row: info + buttons */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h3 className="text-label font-heading font-semibold text-white/80 uppercase tracking-wider">
            Exportar Simulação
          </h3>
          <div className="text-[11px] text-neutral-500 font-body">
            {isVideo ? 'Vídeo' : 'Imagem'} • {location?.width}×{location?.height}
            {hasKeyframes && ` • ${keyframeCorners.length} keyframes`}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleExportImage}
            disabled={exportingImage || exportingVideo}
            className="rounded-xl bg-accent px-6 py-2.5 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all duration-200 shadow-panel"
          >
            {exportingImage ? 'Exportando...' : 'Exportar PNG'}
          </button>
          {isVideo && hasKeyframes && (
            <button
              onClick={exportingVideo ? undefined : handleExportVideo}
              disabled={exportingVideo || !creative}
              className="rounded-xl bg-white/10 px-6 py-2.5 text-sm font-body font-medium text-white hover:bg-white/15 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 transition-all duration-200"
            >
              {exportingVideo ? 'Renderizando...' : 'Exportar MP4'}
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {exportingVideo && progress && (
        <div className="mt-4 space-y-1.5">
          <div className="flex items-center justify-between text-label text-neutral-400 font-body">
            <span>
              {progress.status === 'started' && 'Iniciando renderização...'}
              {progress.status === 'processing' && `Frame ${progress.frame} / ${progress.totalFrames}`}
            </span>
            <span className="text-accent font-medium">{progress.percent ?? 0}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-accent to-[#ff8c40] rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress.percent ?? 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Download link */}
      {downloadUrl && (
        <div className="mt-3 flex items-center gap-3">
          <span className="text-label text-green-400 font-body">✓ Vídeo exportado com sucesso!</span>
          <button
            onClick={handleDownload}
            className="rounded-lg bg-green-500/15 px-5 py-2 text-label text-green-300 font-body font-medium hover:bg-green-500/25 transition-colors"
          >
            ⬇ Baixar MP4
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-2 text-label text-red-400 font-body">{error}</div>
      )}

      {showImageLeadModal && (
        <LeadCaptureModal
          title="Envie essa simulação para seu WhatsApp."
          description={[]}
          fields={[
            { key: 'name', label: 'Nome', required: true, placeholder: 'Seu nome' },
            { key: 'whatsapp', label: 'WhatsApp', required: true, type: 'tel', placeholder: '(00) 00000-0000' },
          ]}
          submitLabel="Receber simulação"
          cancelLabel="Cancelar"
          onCancel={() => setShowImageLeadModal(false)}
          onSubmit={async (data) => {
            await handleImageLeadSubmit({
              name: data.name,
              whatsapp: data.whatsapp,
            });
          }}
        />
      )}
    </div>
  );
}

function buildSimulationFileName(params: {
  pointName?: string | null;
  clientName?: string | null;
  ext: string;
}): string {
  const parts = ['Simulação Intermidia'];
  if (params.pointName && params.pointName.trim()) {
    parts.push(params.pointName.trim());
  }
  if (params.clientName && params.clientName.trim()) {
    parts.push(params.clientName.trim());
  }

  const raw = parts.join(' - ');
  const safe = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return `${safe || 'Simulacao Intermidia'}.${params.ext}`;
}
