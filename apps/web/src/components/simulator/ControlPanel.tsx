'use client';

import { useCompositionStore } from '@/store/composition-store';

/** Slider helper component */
function Slider({
  label,
  value,
  min = 0,
  max = 1,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-400">{label}</label>
        <span className="text-xs text-zinc-500 tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-accent"
      />
    </div>
  );
}

/** Toggle helper */
function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-xs text-zinc-400">{label}</span>
      <div
        className={`w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-zinc-700'
        } relative`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  );
}

export function ControlPanel() {
  const { display, cinematic, fitMode, updateDisplay, updateCinematic, setFitMode } =
    useCompositionStore();

  return (
    <div className="space-y-6">
      {/* Fit mode */}
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          Ajuste
        </h3>
        <div className="flex gap-2">
          {(['cover', 'contain'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFitMode(mode)}
              className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${
                fitMode === mode
                  ? 'bg-accent text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {mode === 'cover' ? 'Preencher' : 'Conter'}
            </button>
          ))}
        </div>
      </section>

      {/* Display settings */}
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Brilho da tela
        </h3>
        <div className="space-y-3">
          <Slider
            label="Nits"
            value={display.screenNits}
            min={100}
            max={2500}
            step={50}
            onChange={(v) => updateDisplay({ screenNits: v })}
          />
          <Slider
            label="Grade de pixels"
            value={display.pixelGridIntensity}
            onChange={(v) => updateDisplay({ pixelGridIntensity: v })}
          />
          <Toggle
            label="Queda angular"
            checked={display.angleFalloff}
            onChange={(v) => updateDisplay({ angleFalloff: v })}
          />
        </div>
      </section>

      {/* Glass settings */}
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Reflexo do vidro
        </h3>
        <div className="space-y-3">
          <Slider
            label="Rugosidade"
            value={display.glassRoughness}
            onChange={(v) => updateDisplay({ glassRoughness: v })}
          />
          <Slider
            label="Reflexividade"
            value={display.glassReflectivity}
            onChange={(v) => updateDisplay({ glassReflectivity: v })}
          />
        </div>
      </section>

      {/* Cinematic settings */}
      <section>
        <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-3">
          Efeito cinematográfico
        </h3>
        <div className="space-y-3">
          <Toggle
            label="Ativado"
            checked={cinematic.enabled}
            onChange={(v) => updateCinematic({ enabled: v })}
          />
          {cinematic.enabled && (
            <>
              <Slider
                label="Bloom"
                value={cinematic.bloomIntensity}
                onChange={(v) => updateCinematic({ bloomIntensity: v })}
              />
              <Slider
                label="Vinheta"
                value={cinematic.vignetteIntensity}
                onChange={(v) => updateCinematic({ vignetteIntensity: v })}
              />
              <Slider
                label="Granulação"
                value={cinematic.grainIntensity}
                onChange={(v) => updateCinematic({ grainIntensity: v })}
              />
              <Slider
                label="Aberração cromática"
                value={cinematic.chromaticAberration}
                onChange={(v) => updateCinematic({ chromaticAberration: v })}
              />
              <Slider
                label="Compressão highlights"
                value={cinematic.highlightCompression}
                onChange={(v) => updateCinematic({ highlightCompression: v })}
              />
            </>
          )}
        </div>
      </section>
    </div>
  );
}
