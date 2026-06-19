/**
 * Konfiguration des Geschwindigkeitsprofils — passt sich der gewählten
 * Bewegungsart an (Fuß vs. Rad). Schnell-Voreinstellungen + Feintuning per
 * Slider, dazu eine Live-Schätzung von Dauer und Ø-Tempo für die Strecke.
 */

import { useMemo } from 'react';
import type { MovementType, Range } from './movementTypes';
import { MODELS } from './movementModels';
import { estimateTiming, formatHM, type SpeedProfile } from './speedModel';
import type { TourTrack } from './tourTrack';

type Preset = 'gemütlich' | 'normal' | 'sportlich';
const PRESET_FRAC: Record<Preset, number> = { gemütlich: 0.2, normal: 0.5, sportlich: 0.85 };

interface Props {
  type: MovementType;
  profile: SpeedProfile;
  track: TourTrack;
  onChange: (p: SpeedProfile) => void;
  onChangeType: () => void;
  /** Eigener Kopf (Icon + Label + „Andere Art"). Aus, wenn der Container ihn stellt. */
  showHead?: boolean;
}

export default function SpeedProfileConfig({ type, profile, track, onChange, onChangeType, showHead = true }: Props) {
  const estimate = useMemo(
    () => estimateTiming(track.points, profile, MODELS[type.id]),
    [track, profile, type.id],
  );

  const set = (patch: Partial<SpeedProfile>) => onChange({ ...profile, ...patch });

  function applyPreset(p: Preset) {
    const f = PRESET_FRAC[p];
    const next: SpeedProfile = { ...profile, flatSpeedKmh: round1(lerp(type.flatSpeed, f)) };
    if (type.category === 'foot') {
      if (type.ascentRate) next.ascentRateMh = Math.round(lerp(type.ascentRate, f) / 10) * 10;
      if (type.descentRate) next.descentRateMh = Math.round(lerp(type.descentRate, f) / 10) * 10;
    } else {
      next.climbStrength = p === 'gemütlich' ? 2 : p === 'normal' ? 3 : 4;
    }
    onChange(next);
  }

  return (
    <div className="mv-config">
      {showHead && (
        <div className="mv-config-head">
          <span className="mv-config-icon">{type.icon}</span>
          <div className="mv-config-title">
            <span className="mv-config-label">{type.label}</span>
            <span className="mv-config-blurb">{type.blurb}</span>
          </div>
          <button type="button" className="mv-change" onClick={onChangeType}>Andere Art</button>
        </div>
      )}

      <span className="rt-eyebrow mv-config-eyebrow">Tempo-Profil</span>
      <div className="mv-presets" role="group" aria-label="Voreinstellung">
        {(Object.keys(PRESET_FRAC) as Preset[]).map((p) => (
          <button key={p} type="button" className="mv-preset" onClick={() => applyPreset(p)}>{p}</button>
        ))}
      </div>

      <div className="mv-sliders">
        <Slider
          label="Flachtempo" unit="km/h" value={profile.flatSpeedKmh}
          min={type.flatSpeed.min} max={type.flatSpeed.max} step={0.5}
          onChange={(v) => set({ flatSpeedKmh: v })}
        />
        {type.category === 'foot' ? (
          <>
            <Slider
              label="Steigleistung" unit="Hm/h" value={profile.ascentRateMh}
              min={type.ascentRate!.min} max={type.ascentRate!.max} step={10}
              onChange={(v) => set({ ascentRateMh: v })}
            />
            <Slider
              label="Abstiegsleistung" unit="Hm/h" value={profile.descentRateMh}
              min={type.descentRate!.min} max={type.descentRate!.max} step={10}
              onChange={(v) => set({ descentRateMh: v })}
            />
          </>
        ) : (
          <>
            <Slider
              label="Bergfitness" unit={`/ 5`} value={profile.climbStrength}
              min={1} max={5} step={1}
              onChange={(v) => set({ climbStrength: v })}
            />
            <Slider
              label="Max. Abfahrt" unit="km/h" value={profile.maxDownhillKmh}
              min={30} max={80} step={5}
              onChange={(v) => set({ maxDownhillKmh: v })}
            />
          </>
        )}
        <Slider
          label="Tempo-Anpassung" unit="%" value={profile.paceFactor}
          min={0.7} max={1.3} step={0.05}
          valueLabel={`${Math.round(profile.paceFactor * 100)} %`}
          onChange={(v) => set({ paceFactor: v })}
        />
      </div>

      <dl className="mv-estimate">
        <div><dt>{type.category === 'bike' ? 'Reine Fahrzeit' : 'Reine Gehzeit'}</dt><dd>{formatHM(estimate.movingSec)}</dd></div>
        <div><dt>Ø Tempo</dt><dd>{estimate.avgKmh.toFixed(1).replace('.', ',')} km/h</dd></div>
        <div><dt>Tempo-Spanne</dt><dd>{estimate.minKmh.toFixed(1).replace('.', ',')}–{estimate.maxKmh.toFixed(1).replace('.', ',')} km/h</dd></div>
      </dl>
    </div>
  );
}

function Slider({ label, unit, value, min, max, step, onChange, valueLabel }: {
  label: string; unit: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; valueLabel?: string;
}) {
  return (
    <label className="mv-slider">
      <span className="mv-slider-head">
        <span className="mv-slider-label">{label}</span>
        <span className="mv-slider-value">{valueLabel ?? `${formatNum(value)} ${unit}`}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

function lerp(r: Range, f: number): number { return r.min + (r.max - r.min) * f; }
function round1(n: number): number { return Math.round(n * 2) / 2; }
function formatNum(n: number): string {
  return (Number.isInteger(n) ? n.toString() : n.toFixed(1)).replace('.', ',');
}
