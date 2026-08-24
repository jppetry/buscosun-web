/**
 * BH5 — Saisonverlauf gegen die Vorjahre: kumulierte Ereignisse je Saisontag (1.3.–31.10.).
 *
 * Reines SVG (D-06: keine Chart-Bibliothek). Laufende Saison als Linie, Vorjahre als Band
 * (min–max) mit Mittel. Die Zählgrundlage ist DIESELBE wie die Liste (`historySeries.ts`):
 * der Endwert der laufenden Kurve ist die Zahl der Brände im Saison-Index ohne Anlagen-
 * Ereignisse. Jede Zahl, die hier steht, kommt aus der Datei — nichts wird interpoliert.
 */
import { useMemo } from 'react';
import { compareToReference, type SeasonSeriesFile, type SeriesCountry } from './history/historySeries';
import { SEASON_FROM_MONTH } from './history/historyEvents';

export interface HistoryChartProps {
  file: SeasonSeriesFile;
  country?: SeriesCountry;
  compact?: boolean;
}

const MONTH_TICKS = ['Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt'];
const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });

function monthStartDays(year: number): number[] {
  const out: number[] = [];
  const from = Date.UTC(year, SEASON_FROM_MONTH - 1, 1);
  for (let m = SEASON_FROM_MONTH; m <= 10; m++) out.push(Math.round((Date.UTC(year, m - 1, 1) - from) / 86_400_000));
  return out;
}

export function FireHistoryChart({ file, country = 'DACH', compact = false }: HistoryChartProps) {
  const W = compact ? 300 : 340, H = 150, L = 34, R = 8, T = 10, B = 22;
  const cur = file.seasons.find((s) => !s.complete) ?? null;
  const ref = file.reference;
  const cmp = compareToReference(file, country);
  const n = file.days;
  const yMax = useMemo(() => {
    let m = 1;
    for (const s of file.seasons) for (const v of s.cumulative[country]) if (v != null && v > m) m = v;
    return m;
  }, [file, country]);
  const x = (d: number) => L + (d / (n - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / yMax) * (H - T - B);
  const path = (vals: readonly (number | null)[]) => vals.map((v, i) => (v == null ? null : `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
  const band = ref ? `${ref.max[country].map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} ${[...ref.min[country]].reverse().map((v, i) => `L${x(n - 1 - i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')} Z` : '';
  const ticks = monthStartDays(cur?.year ?? file.seasons[file.seasons.length - 1]?.year ?? 2026);
  const yTicks = [0, Math.round(yMax / 2), yMax];
  const label = cur ? `Saison ${cur.year}` : 'Saison';
  return (
    <figure className="br-history-chart" aria-label={`Saisonverlauf ${label} gegen die Vorjahre`}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img">
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="#E0D6BE" strokeWidth="0.6" />
            <text x={L - 4} y={y(v) + 3} textAnchor="end" fontSize="8.5" fill="#8B7355">{de(v)}</text>
          </g>
        ))}
        {ticks.map((d, i) => (
          <text key={d} x={x(d)} y={H - 8} textAnchor="start" fontSize="8.5" fill="#8B7355">{MONTH_TICKS[i]}</text>
        ))}
        {ref && <path d={band} fill="#D9D0B8" fillOpacity="0.55" stroke="none" />}
        {ref && <path d={path(ref.mean[country])} fill="none" stroke="#8B7355" strokeWidth="1.2" strokeDasharray="3 2" />}
        {cur && <path d={path(cur.cumulative[country])} fill="none" stroke="#A32B1E" strokeWidth="2" />}
        {cmp && <circle cx={x(cmp.day)} cy={y(cmp.value)} r="3" fill="#A32B1E" />}
      </svg>
      <figcaption className="br-note">
        {cmp ? (
          <>
            <strong>{label}</strong> bis zum Stand: <strong>{de(cmp.value)}</strong> Ereignisse — Vorjahre {cmp.years[0]}–{cmp.years[cmp.years.length - 1]} am selben Saisontag im Mittel {de(cmp.mean)} (Spanne {de(cmp.min)}–{de(cmp.max)}).
          </>
        ) : (
          <>Keine laufende Saison in der Datei — Band und Mittel zeigen die Vorjahre.</>
        )}
        {' '}Rote Linie = laufende Saison, gestrichelt = Mittel, Band = Spanne der Vorjahre. Ohne Anlagen-Ereignisse. {file.limits[0]} {file.limits[1]}
      </figcaption>
    </figure>
  );
}
