'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useCompositionStore } from '@/store/composition-store';

/* ─── Time-of-day presets ─────────────────────────────────── */

type TimePreset = 'day' | 'sunset' | 'night';

const TIME_PRESETS: Record<TimePreset, { hour: number; label: string; icon: string }> = {
  day:    { hour: 12,   label: 'Dia',        icon: '☀️' },
  sunset: { hour: 18,   label: 'Pôr do sol', icon: '🌅' },
  night:  { hour: 22,   label: 'Noite',      icon: '🌙' },
};

/* ─── Environment effect types ────────────────────────────── */

type EnvEffect = 'rain' | 'sun' | 'fog';

const ENV_EFFECTS: Record<EnvEffect, { label: string; icon: string }> = {
  rain: { label: 'Chuva',         icon: '🌧️' },
  sun:  { label: 'Reflexo solar', icon: '☀️' },
  fog:  { label: 'Neblina',       icon: '🌫️' },
};

/* ─── Smooth hour transition hook ─────────────────────────── */

function useAnimatedHour(targetHour: number, duration: number = 400) {
  const [currentHour, setCurrentHour] = useState(targetHour);
  const rafRef = useRef<number>(0);
  const startRef = useRef({ hour: targetHour, time: 0 });

  useEffect(() => {
    const startHour = startRef.current.hour;
    if (Math.abs(targetHour - startHour) < 0.01) return;

    const startTime = performance.now();
    startRef.current = { hour: startHour, time: startTime };

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-in-out cubic
      const ease = t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const interpolated = startHour + (targetHour - startHour) * ease;
      setCurrentHour(interpolated);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        startRef.current = { hour: targetHour, time: now };
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [targetHour, duration]);

  return currentHour;
}

/* ─── Main panel ──────────────────────────────────────────── */

export function EnvironmentPanel() {
  const updateTimeOfDay = useCompositionStore((s) => s.updateTimeOfDay);
  const updateRain = useCompositionStore((s) => s.updateRain);
  const updateSunGlare = useCompositionStore((s) => s.updateSunGlare);
  const updateFog = useCompositionStore((s) => s.updateFog);

  const [activeTime, setActiveTime] = useState<TimePreset | null>(null);
  const [activeEffects, setActiveEffects] = useState<Set<EnvEffect>>(new Set());

  // Animated hour value for smooth transitions
  const targetHour = activeTime ? TIME_PRESETS[activeTime].hour : 14;
  const animatedHour = useAnimatedHour(targetHour);

  // Push animated hour to composition store every frame during transition
  useEffect(() => {
    updateTimeOfDay({
      enabled: activeTime !== null,
      hour: animatedHour,
      ambientOverride: -1,
    });
  }, [animatedHour, activeTime, updateTimeOfDay]);

  // Night mode: boost spill + cinematic bloom
  const updateCinematic = useCompositionStore((s) => s.updateCinematic);
  const prevTimeRef = useRef<TimePreset | null>(null);

  useEffect(() => {
    if (prevTimeRef.current === activeTime) return;
    prevTimeRef.current = activeTime;

    if (activeTime === 'night') {
      updateCinematic({ bloomIntensity: 0.22 });
    } else {
      // Restore default bloom from the preset
      updateCinematic({ bloomIntensity: 0.12 });
    }
  }, [activeTime, updateCinematic]);

  // Handle time preset selection
  const handleTimeSelect = useCallback(
    (preset: TimePreset) => {
      setActiveTime((prev) => (prev === preset ? null : preset));
    },
    [],
  );

  // Handle environment effect toggle
  const handleEffectToggle = useCallback(
    (effect: EnvEffect) => {
      setActiveEffects((prev) => {
        const next = new Set(prev);
        if (next.has(effect)) {
          next.delete(effect);
        } else {
          next.add(effect);
        }

        // Sync to composition store
        updateRain({
          enabled: next.has('rain'),
          intensity: 0.35,
        });
        updateSunGlare({
          enabled: next.has('sun'),
          intensity: 0.45,
          angle: 30,
        });
        updateFog({
          enabled: next.has('fog'),
          density: 0.25,
        });

        return next;
      });
    },
    [updateRain, updateSunGlare, updateFog],
  );

  return (
    <div className="space-y-4">
      {/* ── Time of Day ───────────────────────────── */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-heading font-semibold text-white/40 uppercase tracking-wider">
          Hora do dia
        </h4>
        <div className="flex gap-1.5">
          {(Object.entries(TIME_PRESETS) as [TimePreset, typeof TIME_PRESETS.day][]).map(
            ([key, { label, icon }]) => {
              const active = activeTime === key;
              return (
                <button
                  key={key}
                  onClick={() => handleTimeSelect(key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all duration-200 cursor-pointer ${
                    active
                      ? 'bg-accent/15 ring-1 ring-accent/50 shadow-[0_0_12px_rgba(254,92,43,0.15)]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.04]'
                  }`}
                >
                  <span className="text-base leading-none">{icon}</span>
                  <span
                    className={`text-[10px] font-body font-medium leading-tight ${
                      active ? 'text-accent' : 'text-neutral-400'
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            },
          )}
        </div>
      </div>

      {/* ── Environment effects ───────────────────── */}
      <div className="space-y-2">
        <h4 className="text-[10px] font-heading font-semibold text-white/40 uppercase tracking-wider">
          Ambiente
        </h4>
        <div className="flex gap-1.5">
          {(Object.entries(ENV_EFFECTS) as [EnvEffect, typeof ENV_EFFECTS.rain][]).map(
            ([key, { label, icon }]) => {
              const active = activeEffects.has(key);
              return (
                <button
                  key={key}
                  onClick={() => handleEffectToggle(key)}
                  className={`flex-1 flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all duration-200 cursor-pointer ${
                    active
                      ? 'bg-accent/15 ring-1 ring-accent/50 shadow-[0_0_12px_rgba(254,92,43,0.15)]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] ring-1 ring-white/[0.04]'
                  }`}
                >
                  <span className="text-base leading-none">{icon}</span>
                  <span
                    className={`text-[10px] font-body font-medium leading-tight ${
                      active ? 'text-accent' : 'text-neutral-400'
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            },
          )}
        </div>
      </div>
    </div>
  );
}
