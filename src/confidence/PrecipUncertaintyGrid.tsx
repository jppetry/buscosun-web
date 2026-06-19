/**
 * Räumliche Niederschlagsunsicherheit (US-4.3): kompaktes 5×5-Raster der
 * Umgebung, je Zelle eingefärbt nach „in wie vielen Szenarien fällt Regen?".
 * Die Mitte = Ort ist markiert. Lazy geladen (Progressive Disclosure).
 */

import { useEffect, useState } from 'react';
import { fetchPrecipGrid, GRID_N, type PrecipGrid } from './precipGrid';
import { gridSummary } from './precipGridModel';
import type { DayVM } from './forecastView';

// Sequentielle Sand→Blau-Skala (kein Rot/Grün, barrierearm).
function wetColor(f: number): string {
  if (!Number.isFinite(f)) return '#EFE7D6';
  const stops: [number, string][] = [
    [0, '#F2EAD8'], [0.25, '#CBD9DE'], [0.5, '#8FB2C9'], [0.75, '#5388B0'], [1, '#2E6491'],
  ];
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) if (f >= stops[i][0] && f <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  const t = (f - lo[0]) / Math.max(1e-6, hi[0] - lo[0]);
  const mix = (a: string, b: string) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return `rgb(${r},${g},${bl})`;
  };
  return mix(lo[1], hi[1]);
}

export default function PrecipUncertaintyGrid({ lat, lon, vm }: { lat: number; lon: number; vm: DayVM }) {
  const [grid, setGrid] = useState<PrecipGrid | null>(null);
  const [state, setState] = useState<'load' | 'ok' | 'err'>('load');

  useEffect(() => {
    const ctrl = new AbortController();
    setState('load'); setGrid(null);
    fetchPrecipGrid(lat, lon, ctrl.signal)
      .then((g) => { setGrid(g); setState('ok'); })
      .catch((err) => { if (err?.name !== 'AbortError') setState('err'); });
    return () => ctrl.abort();
  }, [lat, lon]);

  const summary = grid ? gridSummary(grid.cells, vm.day.leadDays) : null;

  return (
    <div className="fc-pgrid">
      <div className="fc-block-head"><span className="rt-eyebrow fc-eyebrow">Regen genau an deinem Ort · in wie vielen Szenarien fällt Regen? · {vm.day.weekdayShort}</span></div>
      <div className="rt-card fc-pgrid-card">
        {state === 'load' && <div className="fc-chart-empty">Umgebungsraster wird geladen …</div>}
        {state === 'err' && <div className="fc-chart-empty">Rasterdaten für diesen Ort nicht verfügbar.</div>}
        {state === 'ok' && grid && summary && (
          <div className="fc-pgrid-body">
            <div className="fc-pgrid-map" role="img" aria-label={summary.text}
              style={{ gridTemplateColumns: `repeat(${GRID_N}, 1fr)` }}>
              {grid.cells.map((c, i) => {
                const f = summary.fractions[i];
                return (
                  <div key={`${c.row}-${c.col}`} className={`fc-pgrid-cell${c.isCenter ? ' is-center' : ''}`}
                    style={{ background: wetColor(f) }}
                    title={Number.isFinite(f) ? `${Math.round(f * 100)} % der Szenarien mit Regen` : 'keine Daten'}>
                    {c.isCenter && <span className="fc-pgrid-pin">●</span>}
                  </div>
                );
              })}
            </div>
            <div className="fc-pgrid-side">
              <p className="fc-pgrid-text">{summary.text}</p>
              <div className="fc-pgrid-scale">
                <span>trocken</span>
                <i style={{ background: 'linear-gradient(90deg,#F2EAD8,#8FB2C9,#2E6491)' }} />
                <span>Regen</span>
              </div>
              <p className="fc-pgrid-note">Raster ≈ 22 km · Mitte ● = dein Ort · Anteil der ICON-Ensemble-Szenarien mit Regen (gleiche Schwelle wie überall: ≥ 1 mm/Tag).</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
