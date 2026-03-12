'use client';

import type { PointPreset } from '@dooh/core';
import { PointCard } from './PointCard';

export function PointGrid({ points }: { points: PointPreset[] }) {
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-body text-neutral-500 font-body">Nenhum ponto publicado ainda.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {points.map((p) => (
        <PointCard key={p.id} point={p} />
      ))}
    </div>
  );
}
