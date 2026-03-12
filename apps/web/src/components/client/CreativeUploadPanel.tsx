'use client';

import { useCallback, useState, useRef } from 'react';
import type { CreativeSource } from '@dooh/core';

interface Props {
  onUpload: (creative: CreativeSource) => void;
}

export function CreativeUploadPanel({ onUpload }: Props) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith('video/');

      if (isVideo) {
        const vid = document.createElement('video');
        vid.preload = 'metadata';
        vid.onloadedmetadata = () => {
          onUpload({
            url,
            type: 'video',
            width: vid.videoWidth,
            height: vid.videoHeight,
            duration: vid.duration,
          });
        };
        vid.src = url;
      } else {
        const img = new Image();
        img.onload = () => {
          onUpload({ url, type: 'image', width: img.naturalWidth, height: img.naturalHeight });
        };
        img.src = url;
      }
    },
    [onUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  return (
    <div
      className={`rounded-panel border-2 border-dashed p-8 text-center transition-colors ${
        dragging
          ? 'border-accent bg-accent/5'
          : 'border-white/10 hover:border-white/20'
      }`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      <div className="space-y-3">
        <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center mx-auto">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-500">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <div>
          <p className="text-sm font-heading font-medium text-white">Envie seu criativo</p>
          <p className="text-label text-neutral-500 font-body mt-1">
            Arraste uma imagem ou vídeo, ou clique para selecionar
          </p>
        </div>
        <button
          onClick={() => inputRef.current?.click()}
          className="rounded-xl bg-accent px-6 py-2.5 text-sm text-white font-body font-medium hover:bg-accent-hover hover:-translate-y-0.5 transition-all duration-200 shadow-panel"
        >
          Selecionar arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>
    </div>
  );
}
