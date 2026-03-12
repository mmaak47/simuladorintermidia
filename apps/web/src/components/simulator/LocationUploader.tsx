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
        video.preload = 'metadata';
        video.muted = true;
        video.playsInline = true;
        video.addEventListener('loadedmetadata', () => {
          setLocation(url, mediaType, video.videoWidth, video.videoHeight);
        });
        video.src = url;
        video.load();
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
        <div className="text-label text-neutral-400 truncate font-body">
          {location.type === 'video' ? '🎬' : '📷'} {location.width}×{location.height}
        </div>
        <button
          onClick={() => {
            reset();
            if (inputRef.current) inputRef.current.value = '';
          }}
          className="text-label text-red-400 hover:text-red-300 font-body transition-colors"
        >
          Remover
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed border-white/10 rounded-panel cursor-pointer hover:border-accent transition-colors duration-200 group">
        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center mb-2 group-hover:bg-accent/10 transition-colors">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500 group-hover:text-accent transition-colors">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <span className="text-label text-neutral-400 font-body">Arraste ou clique para upload</span>
        <span className="text-[11px] text-neutral-600 mt-0.5 font-body">Foto ou vídeo da tela</span>
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
