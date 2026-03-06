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
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          setCreative({
            url,
            type,
            width: video.videoWidth,
            height: video.videoHeight,
            duration: video.duration,
          });
        });
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
        <div className="text-xs text-zinc-500">
          {creative.type === 'video' ? '🎬' : '🖼️'} {creative.width}×{creative.height}
          {creative.duration ? ` • ${creative.duration.toFixed(1)}s` : ''}
        </div>
        <button
          onClick={() => {
            setCreative(null as unknown as CreativeSource);
            if (inputRef.current) inputRef.current.value = '';
          }}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Remover criativo
        </button>
      </div>
    );
  }

  return (
    <label className="flex flex-col items-center justify-center h-24 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-accent transition-colors">
      <span className="text-sm text-zinc-500">Upload do criativo</span>
      <span className="text-xs text-zinc-600 mt-1">Imagem ou vídeo do anúncio</span>
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
