'use client';

import { useEffect, useRef } from 'react';
import { usePointStore } from '@/store/point-store';
import { useClientStore } from '@/store/client-store';
import { useCompositionStore } from '@/store/composition-store';
import { generatePlaceholderVideo } from '@/lib/placeholder-video';

/**
 * Initializes demo points that need runtime-generated assets (video).
 * Points with `baseMediaUrl === '__video__'` get a generated placeholder video.
 * If the video point is currently active, also hot-patches the composition store
 * so the canvas picks up the generated blob URL without requiring a re-select.
 * Runs once on mount.
 */
export function useDemoVideoInit() {
  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const points = usePointStore.getState().points;
    const videoPoints = points.filter(
      (p) => p.baseMediaType === 'video' && p.baseMediaUrl === '__video__',
    );

    if (videoPoints.length === 0) return;

    // Generate placeholder videos for each video point
    videoPoints.forEach(async (point) => {
      try {
        const url = await generatePlaceholderVideo(
          point.baseWidth,
          point.baseHeight,
          6000, // 6 seconds
          24,
        );
        usePointStore.getState().updateMedia(point.id, {
          thumbnailUrl: point.thumbnailUrl,
          baseMediaUrl: url,
          baseMediaType: 'video',
          baseWidth: point.baseWidth,
          baseHeight: point.baseHeight,
        });

        // If this video point is currently active, hot-patch stores
        const { selectedPoint, hoveredPoint } = useClientStore.getState();
        const activeId = (hoveredPoint ?? selectedPoint)?.id;
        if (activeId === point.id) {
          const updated = usePointStore.getState().getPointById(point.id);
          if (updated) {
            if (selectedPoint?.id === point.id) useClientStore.getState().setPoint(updated);
            if (hoveredPoint?.id === point.id) useClientStore.getState().setHoveredPoint(updated);
          }
          const loc = useCompositionStore.getState().location;
          if (loc && loc.url === '__video__') {
            useCompositionStore.setState({ location: { ...loc, url } });
          }
        }
      } catch (err) {
        console.warn(`Failed to generate placeholder video for ${point.name}:`, err);
      }
    });
  }, []);
}
