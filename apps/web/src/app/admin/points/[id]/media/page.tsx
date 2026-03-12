'use client';

import { useCallback, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { usePointStore } from '@/store/point-store';

export default function PointMediaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const point = usePointStore((s) => s.getPointById(id));
  const updateMedia = usePointStore((s) => s.updateMedia);

  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(point?.baseMediaUrl || null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>(point?.baseMediaType ?? 'image');

  const getMediaDimensions = useCallback((file: File, isVideo: boolean) => {
    return new Promise<{ w: number; h: number }>((resolve, reject) => {
      const localUrl = URL.createObjectURL(file);
      const timeoutId = window.setTimeout(() => {
        URL.revokeObjectURL(localUrl);
        reject(new Error('Timeout ao ler dimensoes da midia'));
      }, 15000);

      if (isVideo) {
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.muted = true;
        vid.onloadedmetadata = () => {
          window.clearTimeout(timeoutId);
          const dims = { w: vid.videoWidth, h: vid.videoHeight };
          URL.revokeObjectURL(localUrl);
          resolve(dims);
        };
        vid.onerror = () => {
          window.clearTimeout(timeoutId);
          URL.revokeObjectURL(localUrl);
          reject(new Error('Nao foi possivel ler o video enviado'));
        };
        vid.src = localUrl;
        vid.load();
        return;
      }

      const img = new Image();
      img.onload = () => {
        window.clearTimeout(timeoutId);
        const dims = { w: img.naturalWidth, h: img.naturalHeight };
        URL.revokeObjectURL(localUrl);
        resolve(dims);
      };
      img.onerror = () => {
        window.clearTimeout(timeoutId);
        URL.revokeObjectURL(localUrl);
        reject(new Error('Nao foi possivel ler a imagem enviada'));
      };
      img.src = localUrl;
    });
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      const isVideo = file.type.startsWith('video/');
      setMediaType(isVideo ? 'video' : 'image');
      setUploadError(null);
      setUploading(true);

      try {
        const dimensions = await getMediaDimensions(file, isVideo);

        // Upload to server
        const form = new FormData();
        form.append('file', file);
        const controller = new AbortController();
        const abortTimer = window.setTimeout(() => controller.abort(), 120000);
        const res = await fetch('/api/upload', { method: 'POST', body: form, signal: controller.signal });
        window.clearTimeout(abortTimer);

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || 'Upload failed');
        }
        const data = await res.json();

        // Persist to point store
        updateMedia(id, {
          baseMediaUrl: data.url,
          baseMediaType: isVideo ? 'video' : 'image',
          baseWidth: dimensions.w,
          baseHeight: dimensions.h,
          thumbnailUrl: isVideo ? '' : data.url,
        });
        setPreview(data.url);
      } catch (err) {
        console.error('Upload error:', err);
        setUploadError(err instanceof Error ? err.message : 'Falha no upload');
      } finally {
        setUploading(false);
      }
    },
    [getMediaDimensions, id, updateMedia],
  );

  if (!point) {
    return (
      <AppShell>
        <main className="flex-1 flex items-center justify-center">
          <p className="text-body text-neutral-400 font-body">Ponto não encontrado</p>
        </main>
      </AppShell>
    );
  }

  const hasMedia = !!point.baseMediaUrl;

  return (
    <AppShell>
      <main className="flex-1 overflow-y-auto p-6 lg:p-8">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Header */}
          <div>
            <button
              onClick={() => router.push('/admin/points')}
              className="text-sm text-neutral-500 hover:text-white transition-colors mb-4"
            >
              ← Voltar aos pontos
            </button>
            <h1 className="text-h1 font-heading font-bold text-white">{point.name}</h1>
            <p className="text-body text-neutral-400 font-body mt-1">
              Etapa 2 — Upload da mídia base (foto ou vídeo do ponto real)
            </p>
          </div>

          {/* Upload area */}
          <div className="space-y-4">
            {uploadError ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 font-body">
                Falha no upload: {uploadError}
              </div>
            ) : null}
            {preview ? (
              <div className="rounded-panel border border-white/10 overflow-hidden bg-surface-1">
                {mediaType === 'video' ? (
                  <video src={preview} controls className="w-full max-h-[400px] object-contain bg-black" />
                ) : (
                  <img src={preview} alt="Mídia base" className="w-full max-h-[400px] object-contain bg-black" />
                )}
                <div className="p-4 flex items-center justify-between">
                  <div className="text-label text-neutral-400 font-body">
                    {mediaType === 'video' ? '🎬 Vídeo' : '📷 Imagem'} — {point.baseWidth}×{point.baseHeight}
                  </div>
                  <button
                    onClick={() => {
                      setPreview(null);
                      updateMedia(id, { baseMediaUrl: '', baseMediaType: 'image', baseWidth: 0, baseHeight: 0, thumbnailUrl: '' });
                    }}
                    className="text-label text-red-400 hover:text-red-300 font-body transition-colors"
                  >
                    Remover
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-white/10 rounded-panel cursor-pointer hover:border-accent transition-colors duration-200 group bg-surface-1">
                {uploading ? (
                  <div className="animate-pulse text-accent text-sm font-body">Enviando...</div>
                ) : (
                  <>
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-3 group-hover:bg-accent/10 transition-colors">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-500 group-hover:text-accent transition-colors">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <span className="text-sm text-neutral-400 font-body">Arraste ou clique para enviar</span>
                    <span className="text-[11px] text-neutral-600 mt-1 font-body">Foto ou vídeo do ponto DOOH</span>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFile(file);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => router.push('/admin/points')}
              className="rounded-xl bg-white/10 px-6 py-2.5 text-sm font-body text-white hover:bg-white/15 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => router.push(`/admin/points/${id}/editor`)}
              disabled={!hasMedia}
              className="rounded-xl bg-accent px-6 py-2.5 text-sm font-body font-medium text-white hover:bg-accent-hover hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 transition-all duration-200 shadow-panel"
            >
              Definir tela →
            </button>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
