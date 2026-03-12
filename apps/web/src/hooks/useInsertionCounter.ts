import { useEffect, useRef, useState } from 'react';
import type { CreativeSource } from '@dooh/core';

/** Default display cycle for image creatives (seconds) */
const IMAGE_CYCLE_SECONDS = 15;

/**
 * Tracks live insertion count while a simulation is active.
 *
 * - Video creatives: counts each complete playback loop as 1 insertion.
 * - Image creatives: counts 1 insertion per IMAGE_CYCLE_SECONDS.
 *
 * Resets when the creative or point changes.
 */
export function useInsertionCounter(
  creative: CreativeSource | null,
  active: boolean,
): number {
  const [count, setCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset count when creative changes
  useEffect(() => {
    setCount(0);
  }, [creative?.url]);

  useEffect(() => {
    // Cleanup
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (!creative || !active) return;

    const cycleDuration = creative.type === 'video' && creative.duration && creative.duration > 0
      ? creative.duration * 1000
      : (creative.type === 'video' ? 10 : IMAGE_CYCLE_SECONDS) * 1000;

    // First insertion starts as soon as simulation becomes active.
    setCount(1);

    if (creative.type === 'video' && creative.duration && creative.duration > 0) {
      // Video: count each loop based on duration
      timerRef.current = setInterval(() => {
        setCount((c) => c + 1);
      }, cycleDuration);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }

    // Image or video without known duration: use fixed cycle
    timerRef.current = setInterval(() => {
      setCount((c) => c + 1);
    }, cycleDuration);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [creative, active]);

  return count;
}
