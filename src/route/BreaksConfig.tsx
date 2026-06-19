/**
 * Pausen-Konfiguration: Auto-Pausen (Intervall je Bewegungsart), Mahlzeiten-
 * Pause als eigene Kategorie, Wegpunkte als Pausen-Vorschläge und eine Liste
 * der gesetzten Custom-Pausen (per Map-Klick oder Wegpunkt hinzugefügt).
 */

import { detectBreakFromName, type BreakConfig, type CustomBreak } from './breaks';
import type { TourTrack } from './tourTrack';
import { IconFork, IconCoffee } from './routeIcons';

interface Props {
  track: TourTrack;
  cfg: BreakConfig;
  onChange: (cfg: BreakConfig) => void;
}

export default function BreaksConfig({ track, cfg, onChange }: Props) {
  const set = (patch: Partial<BreakConfig>) => onChange({ ...cfg, ...patch });

  const addCustom = (b: CustomBreak) => set({ custom: [...cfg.custom, b] });
  const removeCustom = (id: string) => set({ custom: cfg.custom.filter((c) => c.id !== id) });

  // Wegpunkte, die noch nicht als Pause gesetzt sind: erkannte (mit Hint) vs.
  // einfache.
  const available = track.waypoints.filter(
    (w) => !cfg.custom.some((c) => Math.abs(c.dist - w.dist) < 50),
  );
  const detected = available
    .map((w) => ({ ...w, hint: detectBreakFromName(w.name) }))
    .filter((w): w is typeof w & { hint: NonNullable<typeof w.hint> } => w.hint != null);
  const plain = available.filter((w) => detectBreakFromName(w.name) == null);

  return (
    <div className="tp-block">
      <div className="tp-block-head"><span className="tp-block-title">Pausen</span></div>

      {/* Auto-Pausen */}
      <label className="tp-toggle">
        <input type="checkbox" checked={cfg.autoEnabled} onChange={(e) => set({ autoEnabled: e.target.checked })} />
        <span>Automatische Pausen — {cfg.mode === 'time' ? `alle ${cfg.intervalValue} min` : `alle ${cfg.intervalValue} km`}, {cfg.durationMin} min</span>
      </label>
      {cfg.autoEnabled && (
        <div className="tp-sliders">
          <Slider
            label={cfg.mode === 'time' ? 'Intervall' : 'Intervall'} unit={cfg.mode === 'time' ? 'min' : 'km'}
            value={cfg.intervalValue}
            min={cfg.mode === 'time' ? 30 : 10} max={cfg.mode === 'time' ? 240 : 100} step={cfg.mode === 'time' ? 15 : 5}
            onChange={(v) => set({ intervalValue: v })}
          />
          <Slider label="Dauer" unit="min" value={cfg.durationMin} min={5} max={60} step={5} onChange={(v) => set({ durationMin: v })} />
        </div>
      )}

      {/* Mahlzeiten-Pause */}
      <label className="tp-toggle">
        <input type="checkbox" checked={cfg.mealEnabled} onChange={(e) => set({ mealEnabled: e.target.checked })} />
        <span>Mittagspause</span>
      </label>
      {cfg.mealEnabled && (
        <div className="tp-sliders">
          <Slider label="nach" unit="h" value={Math.round(cfg.mealAfterMin / 30) / 2} min={1} max={6} step={0.5} onChange={(v) => set({ mealAfterMin: v * 60 })} />
          <Slider label="Dauer" unit="min" value={cfg.mealDurationMin} min={15} max={90} step={5} onChange={(v) => set({ mealDurationMin: v })} />
        </div>
      )}

      {/* Auto-erkannte Pausen-Vorschläge (aus Wegpunkt-Namen) */}
      {detected.length > 0 && (
        <div className="tp-suggest">
          <span className="tp-suggest-label">Erkannte Pausen aus den Wegpunkt-Namen:</span>
          <div className="tp-chips">
            {detected.map((w, i) => (
              <button
                key={`d${i}`} type="button"
                className={`tp-chip tp-chip-${w.hint.kind}`}
                title={`„${w.hint.matchedKeyword}" erkannt`}
                onClick={() => addCustom({ id: uid(), dist: w.dist, durationMin: w.hint.durationMin, kind: w.hint.kind, label: w.name ?? w.hint.preset })}
              >
                {w.hint.kind === 'meal' ? <IconFork size={13} /> : <IconCoffee size={13} />} {w.name ?? w.hint.preset} · {w.hint.preset} · {w.hint.durationMin} min · {km(w.dist)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Generische Wegpunkt-Vorschläge */}
      {plain.length > 0 && (
        <div className="tp-suggest">
          <span className="tp-suggest-label">Wegpunkte als Pause:</span>
          <div className="tp-chips">
            {plain.map((w, i) => (
              <button
                key={`p${i}`} type="button" className="tp-chip"
                onClick={() => addCustom({ id: uid(), dist: w.dist, durationMin: 15, kind: 'rest', label: w.name ?? `Wegpunkt ${i + 1}` })}
              >
                + {w.name ?? `Wegpunkt ${i + 1}`} · {km(w.dist)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Gesetzte Custom-Pausen */}
      {cfg.custom.length > 0 && (
        <ul className="tp-custom-list">
          {cfg.custom.slice().sort((a, b) => a.dist - b.dist).map((c) => (
            <li key={c.id} className="tp-custom">
              <span className={`tp-dot tp-dot-${c.kind}`} aria-hidden="true" />
              <span className="tp-custom-label">{c.label ?? (c.kind === 'meal' ? 'Mahlzeit' : 'Pause')} · {km(c.dist)}</span>
              <select
                className="tp-custom-dur"
                value={c.durationMin}
                onChange={(e) => onChange({ ...cfg, custom: cfg.custom.map((x) => x.id === c.id ? { ...x, durationMin: parseInt(e.target.value, 10) } : x) })}
                aria-label="Dauer"
              >
                {[10, 15, 20, 30, 45, 60].map((m) => <option key={m} value={m}>{m} min</option>)}
              </select>
              <button type="button" className="tp-remove" onClick={() => removeCustom(c.id)} aria-label="Pause entfernen">✕</button>
            </li>
          ))}
        </ul>
      )}

      <p className="tp-hint">Tipp: Wegpunkte als Pause übernehmen oder die Dauer einer gesetzten Pause anpassen.</p>
    </div>
  );
}

function Slider({ label, unit, value, min, max, step, onChange }: {
  label: string; unit: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void;
}) {
  return (
    <label className="mv-slider">
      <span className="mv-slider-head">
        <span className="mv-slider-label">{label}</span>
        <span className="mv-slider-value">{fmt(value)} {unit}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

function uid(): string {
  return (crypto.randomUUID?.() ?? `b${Date.now()}${Math.random()}`);
}
function km(m: number): string { return `km ${(m / 1000).toFixed(1).replace('.', ',')}`; }
function fmt(n: number): string { return (Number.isInteger(n) ? n.toString() : n.toFixed(1)).replace('.', ','); }
