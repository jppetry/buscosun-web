/**
 * 7-Tage-Forecast der Kartenseite (Command-Deck) — references/desktop-karte.png
 * (rechtes Panel, kompakte Zeilen) + references/mobile-forecast.png (eigener
 * Screen mit Größen-Umschalter Temperatur/Regen/Wind).
 *
 * Datenquelle: `fetchMultiModelForecast` (Open-Meteo-Modellvergleich, 5 Modelle,
 * 7 Tage) — dieselbe explizite Feature-Quelle wie die Vorhersage-Seite. Das
 * Regenrisiko ist ehrlich als Modell-Einigkeit hergeleitet: Anteil der Modelle,
 * die für den Tag nennenswerten Niederschlag (≥ 0,5 mm) rechnen.
 */

import { useEffect, useMemo, useState } from 'react';
import { fetchMultiModelForecast, type MultiModelForecast } from '../confidence/multiModel';
import { WeatherIcon, pickWeatherCondition } from '../components/WeatherIcon';

export type SevenDayMetric = 'temp' | 'rain' | 'wind';

interface Props {
  lat: number;
  lon: number;
  /** `panel` = kompakte Zeilen im rechten Panel · `screen` = Mobile-Screen mit Umschalter. */
  variant: 'panel' | 'screen';
}

interface DayRow {
  label: string;
  isToday: boolean;
  noonMs: number;
  tMin: number;
  tMax: number;
  rainPct: number;
  precipMm: number;
  windMs: number;
  cloudPct: number;
}

/** Temperatur → Farbe entlang der Vorlagen-Skala (kühl-Steel → warm-Terracotta). */
const TEMP_STOPS: Array<[number, [number, number, number]]> = [
  [-10, [0x3a, 0x6f, 0xa8]],
  [2, [0x9d, 0xc3, 0xe6]],
  [10, [0xa8, 0xb0, 0x8e]],
  [17, [0xd4, 0xa3, 0x73]],
  [24, [0xc9, 0x7b, 0x47]],
  [32, [0xa8, 0x5e, 0x2e]],
];
function tempColor(t: number): string {
  if (!Number.isFinite(t)) return '#D9D0B8';
  if (t <= TEMP_STOPS[0][0]) return rgb(TEMP_STOPS[0][1]);
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i];
    if (t <= t1) {
      const [t0, c0] = TEMP_STOPS[i - 1];
      const f = (t - t0) / (t1 - t0);
      return rgb([0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * f)) as [number, number, number]);
    }
  }
  return rgb(TEMP_STOPS[TEMP_STOPS.length - 1][1]);
}
const rgb = (c: [number, number, number]) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;

const mean = (xs: number[]): number => {
  const f = xs.filter(Number.isFinite);
  return f.length ? f.reduce((a, b) => a + b, 0) / f.length : NaN;
};

function buildRows(mm: MultiModelForecast): DayRow[] {
  return mm.days.map((d, idx) => {
    const dayHours = mm.hours.filter((h) => h.dayIndex === idx);
    const cloudPct = mean(dayHours.map((h) => mean(h.cloudByModel)));
    const windMs = dayHours.length
      ? Math.max(...dayHours.map((h) => mean(h.windByModel)).filter(Number.isFinite)) / 3.6
      : NaN;
    const finitePrecip = d.precipByModel.filter(Number.isFinite);
    const wet = finitePrecip.filter((p) => p >= 0.5).length;
    const rainPct = finitePrecip.length
      ? Math.round(((wet / finitePrecip.length) * 100) / 5) * 5
      : 0;
    return {
      label: d.isToday ? 'Heute' : d.weekdayShort,
      isToday: d.isToday,
      noonMs: d.dateMs,
      tMin: d.tMinConsensus,
      tMax: d.tMaxConsensus,
      rainPct,
      precipMm: mean(d.precipByModel),
      windMs,
      cloudPct,
    };
  });
}

function tempBar(row: DayRow): string {
  const mid = (row.tMin + row.tMax) / 2;
  return `linear-gradient(90deg, ${tempColor(row.tMin)}, ${tempColor(mid)}, ${tempColor(row.tMax)})`;
}

const d0 = (v: number) => (Number.isFinite(v) ? `${Math.round(v)}` : '—');

export default function SevenDayForecast({ lat, lon, variant }: Props) {
  const [data, setData] = useState<MultiModelForecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<SevenDayMetric>('temp');

  useEffect(() => {
    const ac = new AbortController();
    setData(null);
    setError(null);
    fetchMultiModelForecast(lat, lon, ac.signal)
      .then((r) => { if (!ac.signal.aborted) setData(r); })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => ac.abort();
  }, [lat, lon]);

  const rows = useMemo(() => (data ? buildRows(data) : []), [data]);

  if (error) return <div className="sdf-state">⚠ {error}</div>;
  if (!data) {
    return (
      <div className="sdf-list" aria-hidden="true">
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="sdf-row sdf-skeleton" />)}
      </div>
    );
  }

  const list = (
    <div className="sdf-list">
      {rows.map((r) => {
        const cond = pickWeatherCondition(r.cloudPct, r.precipMm / 24, new Date(r.noonMs));
        return (
          <div key={r.noonMs} className={`sdf-row${r.isToday ? ' is-today' : ''}`}>
            <span className="sdf-day">{r.label}</span>
            <span className="sdf-ico"><WeatherIcon condition={cond} size={variant === 'screen' ? 30 : 22} /></span>
            <span className="sdf-pct">{r.rainPct}%</span>
            {metric === 'temp' && (
              <>
                <span className="sdf-min">{d0(r.tMin)}°</span>
                <span className="sdf-bar" style={{ background: tempBar(r) }} aria-hidden="true" />
                <span className="sdf-max">{d0(r.tMax)}°</span>
              </>
            )}
            {metric === 'rain' && (
              <>
                <span className="sdf-bar sdf-bar-track" aria-hidden="true">
                  <span
                    className="sdf-bar-fill sdf-bar-rain"
                    style={{ width: `${Math.min(100, (Math.max(0, r.precipMm) / 15) * 100)}%` }}
                  />
                </span>
                <span className="sdf-max">{Number.isFinite(r.precipMm) ? r.precipMm.toFixed(r.precipMm >= 10 ? 0 : 1) : '—'} mm</span>
              </>
            )}
            {metric === 'wind' && (
              <>
                <span className="sdf-bar sdf-bar-track" aria-hidden="true">
                  <span
                    className="sdf-bar-fill sdf-bar-wind"
                    style={{ width: `${Math.min(100, (Math.max(0, r.windMs) / 20) * 100)}%` }}
                  />
                </span>
                <span className="sdf-max">{Number.isFinite(r.windMs) ? r.windMs.toFixed(1) : '—'} m/s</span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );

  if (variant === 'panel') return list;

  return (
    <div className="sdf-screen">
      <div className="sdf-metric-chips" role="tablist" aria-label="Größe">
        {([['temp', 'Temperatur'], ['rain', 'Regen'], ['wind', 'Wind']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={metric === key}
            className={`sdf-chip${metric === key ? ' is-active' : ''}`}
            onClick={() => setMetric(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {list}
      <div className="sdf-legend">
        <span className="sdf-legend-label">Legende</span>
        {metric === 'temp' && (
          <span className="sdf-legend-item">
            kühl
            <span className="sdf-legend-ramp" aria-hidden="true" />
            warm
          </span>
        )}
        {metric === 'rain' && <span className="sdf-legend-item">Balken = Tagessumme (mm) im Modellmittel</span>}
        {metric === 'wind' && <span className="sdf-legend-item">Balken = Tagesmaximum Wind (m/s) im Modellmittel</span>}
        <span className="sdf-legend-item"><b className="sdf-legend-pct">%</b> Regenrisiko</span>
      </div>
    </div>
  );
}
