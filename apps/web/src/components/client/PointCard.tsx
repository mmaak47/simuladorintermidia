'use client';

import Link from 'next/link';
import type { PointPreset } from '@dooh/core';

const TYPE_LABELS: Record<string, string> = {
  elevator: 'Elevador',
  totem: 'Totem',
  billboard: 'Outdoor',
  'indoor-screen': 'Tela Indoor',
};

const TYPE_ICONS: Record<string, string> = {
  elevator: '🛗',
  totem: '🪧',
  billboard: '🖼',
  'indoor-screen': '📺',
};

export function PointCard({ point }: { point: PointPreset }) {
  return (
    <Link
      href={`/simulator/point/${point.slug}`}
      className="group block rounded-panel border border-white/10 bg-surface-1 overflow-hidden hover:border-accent/40 hover:-translate-y-0.5 transition-all duration-200"
    >
      {/* Thumbnail area */}
      <div className="aspect-video bg-surface-2 relative overflow-hidden">
        {point.thumbnailUrl ? (
          <img src={point.thumbnailUrl} alt={point.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <span className="text-4xl opacity-30">{TYPE_ICONS[point.type] ?? '📺'}</span>
          </div>
        )}
        {/* Type badge */}
        <span className="absolute top-2 left-2 px-2 py-0.5 text-[10px] font-heading font-semibold uppercase tracking-wider bg-black/60 backdrop-blur-sm text-white/80 rounded-md">
          {TYPE_LABELS[point.type] ?? point.type}
        </span>
      </div>

      {/* Info */}
      <div className="p-3.5 space-y-1">
        <h3 className="text-sm font-heading font-semibold text-white group-hover:text-accent transition-colors truncate">
          {point.name}
        </h3>
        <div className="flex items-center gap-3 text-[11px] text-neutral-500 font-body">
          <span>{point.screenWidth && point.screenHeight ? `${point.screenWidth}×${point.screenHeight}` : point.screenAspect}</span>
          <span>{point.renderPreset.screenNits} nits</span>
        </div>
      </div>
    </Link>
  );
}
