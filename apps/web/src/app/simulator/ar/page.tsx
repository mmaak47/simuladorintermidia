'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { usePointStore } from '@/store/point-store';

export const dynamic = 'force-dynamic';

type CampaignPayload = {
  creativeUrl: string;
  creativeType: 'image' | 'video';
};

function ArPreviewContent() {
  const search = useSearchParams();
  const pointId = search.get('pointId') ?? '';
  const campaignId = search.get('campaignId') ?? '';

  const points = usePointStore((s) => s.points);
  const fetchPoints = usePointStore((s) => s.fetchPoints);

  const [permissionError, setPermissionError] = useState<string>('');
  const [streamReady, setStreamReady] = useState(false);
  const [creativeUrl, setCreativeUrl] = useState<string>('');
  const [scale, setScale] = useState(0.38);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);

  const point = useMemo(() => points.find((p) => p.id === pointId) ?? null, [points, pointId]);

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  useEffect(() => {
    if (!campaignId) return;
    let active = true;

    const run = async () => {
      const res = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as CampaignPayload;
      if (!active) return;
      if (data.creativeType === 'image' && data.creativeUrl) {
        setCreativeUrl(data.creativeUrl);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [campaignId]);

  useEffect(() => {
    let mounted = true;
    let localStream: MediaStream | null = null;

    const openCamera = async () => {
      try {
        // Check if we're on HTTPS or localhost
        const isSecure = window.location.protocol === 'https:' || window.location.hostname === 'localhost';
        if (!isSecure) {
          throw new Error('HTTPS_REQUIRED');
        }

        // Check if browser supports getUserMedia
        const constraints = { video: true, audio: false };
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('NO_SUPPORT');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
          },
          audio: false,
        });
        localStream = stream;

        const video = document.getElementById('ar-camera') as HTMLVideoElement | null;
        if (!video || !mounted) return;

        video.srcObject = stream;
        await video.play();
        if (mounted) setStreamReady(true);
      } catch (err) {
        if (mounted) {
          const error = err instanceof Error ? err.message : 'UNKNOWN';
          if (error === 'HTTPS_REQUIRED') {
            setPermissionError('Esta pagina requer HTTPS para acessar a camera. Acesse via HTTPS ou use localhost.');
          } else if (error === 'NO_SUPPORT') {
            setPermissionError('Seu navegador nao suporta acesso a camera.');
          } else if (error.includes('NotAllowedError') || error.includes('Permission denied')) {
            setPermissionError('Permissao negada. Abra Configuracoes > Privacidade > Camera e permita o acesso.');
          } else if (error.includes('NotFoundError') || error.includes('No camera')) {
            setPermissionError('Nenhuma camera encontrada no dispositivo.');
          } else {
            setPermissionError('Nao foi possivel abrir a camera. Erro: ' + error);
          }
        }
      }
    };

    openCamera();

    return () => {
      mounted = false;
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <AppShell>
      <main className="flex-1 min-h-0 p-2 sm:p-4 md:p-6 flex items-center justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-3 sm:gap-4 h-full w-full max-w-6xl">
          <section className="relative rounded-lg sm:rounded-2xl overflow-hidden border border-white/10 bg-black min-h-[300px] sm:min-h-[420px] w-full">
            <video
              id="ar-camera"
              className="absolute inset-0 w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {creativeUrl && (
              <img
                src={creativeUrl}
                alt="Creative overlay"
                className="absolute left-1/2 top-1/2 pointer-events-none"
                style={{
                  width: `${Math.max(15, Math.min(85, scale * 100))}%`,
                  transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`,
                  filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.45))',
                }}
              />
            )}

            {!creativeUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-[11px] sm:text-xs text-neutral-300 px-3 text-center">
                Envie uma imagem para overlay AR.
              </div>
            )}

            {!streamReady && !permissionError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-[11px] sm:text-xs text-neutral-400">
                Carregando camera...
              </div>
            )}

            {permissionError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-[11px] sm:text-xs text-red-300 px-4 text-center leading-relaxed">
                {permissionError}
              </div>
            )}
          </section>

          <section className="rounded-lg sm:rounded-2xl border border-white/10 bg-white/[0.02] p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto max-h-full">
            <div>
              <h1 className="text-sm sm:text-base font-heading font-semibold text-white">AR On-Site</h1>
              <p className="text-[11px] sm:text-xs text-neutral-500 mt-1 leading-relaxed">
                MVP de visualizacao em camera para aprovacao rapida no local.
              </p>
            </div>

            <div className="text-[11px] sm:text-xs text-neutral-400 space-y-1">
              <p><span className="text-neutral-500">Ponto:</span> <span className="break-words">{point?.name ?? 'N/A'}</span></p>
              <p><span className="text-neutral-500">Cidade:</span> {point?.city || 'N/A'}</p>
            </div>

            <div className="space-y-2">
              <label className="block text-[10px] sm:text-[11px] text-neutral-500">Imagem overlay</label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="block w-full text-[10px] sm:text-xs text-neutral-300"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setCreativeUrl(URL.createObjectURL(file));
                }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] sm:text-[11px] text-neutral-500 block">Escala: {Math.round(scale * 100)}%</label>
              <input
                type="range"
                min={0.15}
                max={0.85}
                step={0.01}
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              <button
                onClick={() => setOffsetY((v) => v - 12)}
                className="rounded-lg bg-white/10 hover:bg-white/15 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-white"
              >
                Mover para cima
              </button>
              <button
                onClick={() => setOffsetY((v) => v + 12)}
                className="rounded-lg bg-white/10 hover:bg-white/15 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-white"
              >
                Mover para baixo
              </button>
              <button
                onClick={() => setOffsetX((v) => v - 12)}
                className="rounded-lg bg-white/10 hover:bg-white/15 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-white"
              >
                Mover para esquerda
              </button>
              <button
                onClick={() => setOffsetX((v) => v + 12)}
                className="rounded-lg bg-white/10 hover:bg-white/15 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-white"
              >
                Mover para direita
              </button>
            </div>
          </section>
        </div>
      </main>
    </AppShell>
  );
}

export default function ArPreviewPage() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <main className="flex-1 min-h-0 p-4 md:p-6 flex items-center justify-center text-sm text-neutral-500">
            Carregando AR preview...
          </main>
        </AppShell>
      }
    >
      <ArPreviewContent />
    </Suspense>
  );
}
