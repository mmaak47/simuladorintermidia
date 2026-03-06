'use client';

import { useCallback, useRef } from 'react';
import { useCompositionStore } from '@/store/composition-store';
import type { MediaType } from '@dooh/core';

const ACCEPTED_IMAGE = 'image/jpeg,image/png,image/webp';
const ACCEPTED_VIDEO = 'video/mp4,video/webm,video/quicktime';

export function LocationUploader() {
  const { location, setLocation, reset } = useCompositionStore();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const isVideo = file.type.startsWith('video/');
      const mediaType: MediaType = isVideo ? 'video' : 'image';
      const url = URL.createObjectURL(file);

      if (isVideo) {
        const video = document.createElement('video');
        video.src = url;
        video.addEventListener('loadedmetadata', () => {
          setLocation(url, mediaType, video.videoWidth, video.videoHeight);
        });
      } else {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          setLocation(url, mediaType, img.naturalWidth, img.naturalHeight);
        };
      }
    },
    [setLocation],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  if (location) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-zinc-500 truncate">
          {location.type === 'video' ? '🎬' : '📷'} {location.width}×{location.height}
        </div>
        <button
          onClick={() => {
            reset();
            if (inputRef.current) inputRef.current.value = '';
          }}
          className="text-xs text-red-400 hover:text-red-300"
        >
          Remover
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-accent transition-colors">
        <span className="text-sm text-zinc-500">Arraste ou clique para upload</span>
        <span className="text-xs text-zinc-600 mt-1">Foto ou vídeo da tela</span>
        <input
          ref={inputRef}
          type="file"
          accept={`${ACCEPTED_IMAGE},${ACCEPTED_VIDEO}`}
          onChange={handleChange}
          className="hidden"
        />
      </label>
    </div>
  );
}
