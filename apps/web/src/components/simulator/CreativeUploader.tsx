'use client';

import { useCallback, useRef } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import type { MediaType, CreativeSource } from '@dooh/core';

export function CreativeUploader() {
  const { creative, setCreative } = useCompositionStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const isVideo = file.type.startsWith('video/');
      const type: MediaType = isVideo ? 'video' : 'image';
      const url = URL.createObjectURL(file);

      if (isVideo) {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.addEventListener('loadedmetadata', () => {
          setCreative({
            url,
            type,
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
          });
        });
        video.src = url;
        video.load();
      } else {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          setCreative({
            url,
            type,
            width: img.naturalWidth,
            height: img.naturalHeight,
          });
        };
      }
    },
    [setCreative],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (creative) {
    return (
      <div className="space-y-2">
        <div className="text-label text-neutral-400 font-body">
          {creative.type === 'video' ? '🎬' : '🖼️'} {creative.width}×{creative.height}
          {creative.duration ? ` • ${creative.duration.toFixed(1)}s` : ''}
        </div>
        <button
          onClick={() => {
            setCreative(null as unknown as CreativeSource);
            if (inputRef.current) inputRef.current.value = '';
          }}
          className="text-label text-red-400 hover:text-red-300 font-body transition-colors"
        >
          Remover criativo
        </button>
      </div>
    );
  }

  return (
    <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-white/10 rounded-panel cursor-pointer hover:border-accent transition-colors duration-200 group">
      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center mb-2 group-hover:bg-accent/10 transition-colors">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500 group-hover:text-accent transition-colors">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      </div>
      <span className="text-label text-neutral-400 font-body">Upload do criativo</span>
      <span className="text-[11px] text-neutral-600 mt-0.5 font-body">Imagem ou vídeo do anúncio</span>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        onChange={handleChange}
        className="hidden"
      />
    </label>
  );
}
