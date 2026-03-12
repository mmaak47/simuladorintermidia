'use client';

import { useCompositionStore } from '@/store/composition-store';
import { formatHour } from '@/lib/time-of-day';

/** Styled slider with brand colors */
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
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-label text-neutral-400 font-body">{label}</label>
        <span className="text-label text-neutral-500 tabular-nums font-body">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

/** Toggle with brand orange */
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
    <label className="flex items-center justify-between cursor-pointer group">
      <span className="text-label text-neutral-400 font-body group-hover:text-neutral-300 transition-colors">{label}</span>
      <div
        className={`w-9 h-5 rounded-full transition-colors duration-150 ${
          checked ? 'bg-accent' : 'bg-white/10'
        } relative`}
        onClick={() => onChange(!checked)}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </div>
    </label>
  );
}

/** Settings card wrapper */
function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel bg-white/[0.04] p-3.5 space-y-3">
      <h3 className="text-label font-heading font-semibold text-white/70 uppercase tracking-wider">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function ControlPanel() {
  const {
    display, cinematic, fitMode, spill, timeOfDay, environment,
    updateDisplay, updateCinematic, setFitMode, updateSpill,
    updateTimeOfDay, updateRain, updateSunGlare, updateFog,
    requestAutoTune,
  } = useCompositionStore();

  return (
    <div className="space-y-3">
      {/* Auto-tune button */}
      <button
        onClick={requestAutoTune}
        className="w-full py-2.5 rounded-lg bg-accent text-white font-body font-semibold text-label hover:bg-accent/90 transition-colors"
      >
        ⚡ Auto-Ajuste
      </button>

      {/* Fit mode */}
      <SettingsCard title="Ajuste">
        <div className="flex gap-2">
          {(['cover', 'contain'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFitMode(mode)}
              className={`flex-1 text-label py-2 rounded-lg font-body font-medium transition-all duration-150 ${
                fitMode === mode
                  ? 'bg-accent text-white shadow-sm'
                  : 'bg-white/[0.06] text-neutral-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              {mode === 'cover' ? 'Preencher' : 'Conter'}
            </button>
          ))}
        </div>
      </SettingsCard>

      {/* Display settings */}
      <SettingsCard title="Brilho da tela">
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
      </SettingsCard>

      {/* Glass settings */}
      <SettingsCard title="Reflexo do vidro">
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
      </SettingsCard>

      {/* Cinematic settings */}
      <SettingsCard title="Efeito cinematográfico">
        <div className="space-y-3">
          <Toggle
            label="Ativado"
            checked={cinematic.enabled}
            onChange={(v) => updateCinematic({ enabled: v })}
          />
          {cinematic.enabled && (
            <div className="space-y-3 animate-fade-in">
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
            </div>
          )}
        </div>
      </SettingsCard>

      {/* Light spill settings */}
      <SettingsCard title="Light spill">
        <div className="space-y-3">
          <Toggle
            label="Ativado"
            checked={spill.enabled}
            onChange={(v) => updateSpill({ enabled: v })}
          />
          {spill.enabled && (
            <div className="space-y-3 animate-fade-in">
              <Slider
                label="Intensidade"
                value={spill.intensity}
                onChange={(v) => updateSpill({ intensity: v })}
              />
              <Slider
                label="Raio"
                value={spill.radius}
                onChange={(v) => updateSpill({ radius: v })}
              />
              <Slider
                label="Reflexo do bezel"
                value={spill.bezelReflection}
                onChange={(v) => updateSpill({ bezelReflection: v })}
              />
              <Toggle
                label="Cor dinâmica"
                checked={spill.dynamicColor}
                onChange={(v) => updateSpill({ dynamicColor: v })}
              />
            </div>
          )}
        </div>
      </SettingsCard>

      {/* Time-of-day simulation */}
      <SettingsCard title="Hora do dia">
        <div className="space-y-3">
          <Toggle
            label="Ativado"
            checked={timeOfDay.enabled}
            onChange={(v) => updateTimeOfDay({ enabled: v })}
          />
          {timeOfDay.enabled && (
            <div className="space-y-3 animate-fade-in">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-label text-neutral-400 font-body">Horário</label>
                  <span className="text-label text-neutral-500 tabular-nums font-body">
                    {formatHour(timeOfDay.hour)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={0.5}
                  value={timeOfDay.hour}
                  onChange={(e) => updateTimeOfDay({ hour: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
      </SettingsCard>

      {/* Environment effects */}
      <SettingsCard title="Ambiente">
        <div className="space-y-3">
          {/* Rain */}
          <Toggle
            label="Chuva"
            checked={environment.rain.enabled}
            onChange={(v) => updateRain({ enabled: v })}
          />
          {environment.rain.enabled && (
            <Slider
              label="Intensidade chuva"
              value={environment.rain.intensity}
              onChange={(v) => updateRain({ intensity: v })}
            />
          )}

          {/* Sun glare */}
          <Toggle
            label="Reflexo solar"
            checked={environment.sunGlare.enabled}
            onChange={(v) => updateSunGlare({ enabled: v })}
          />
          {environment.sunGlare.enabled && (
            <div className="space-y-3 animate-fade-in">
              <Slider
                label="Intensidade luz"
                value={environment.sunGlare.intensity}
                onChange={(v) => updateSunGlare({ intensity: v })}
              />
              <Slider
                label="Ângulo do sol"
                value={environment.sunGlare.angle}
                min={0}
                max={360}
                step={5}
                onChange={(v) => updateSunGlare({ angle: v })}
              />
            </div>
          )}

          {/* Fog */}
          <Toggle
            label="Neblina"
            checked={environment.fog.enabled}
            onChange={(v) => updateFog({ enabled: v })}
          />
          {environment.fog.enabled && (
            <Slider
              label="Densidade"
              value={environment.fog.density}
              onChange={(v) => updateFog({ density: v })}
            />
          )}
        </div>
      </SettingsCard>
    </div>
  );
}
