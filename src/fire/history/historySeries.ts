/**
 * BH5 — Saisonverlauf gegen die Vorjahre (`audit/brand-historie.md` §5 BH5, Konzept §9).
 *
 * Je Saison (1.3.–31.10., `seasonWindow`) eine Tagesreihe **kumulierter Ereignisse** — DACH gesamt
 * und je Land — aus DENSELBEN Ereignissen wie die Liste (`selectWindow`/`indexAnomalyKind`): kein
 * zweites Zählen. Thermalanomalien (`site`) zählen nicht mit, sonst zeigte die Kurve Stahlwerke.
 * Die laufende Saison endet am Auswertetag (danach `null`, nie 0); die Vorjahre sind vollständig.
 * Referenz = alle vollständigen Vorjahre: Mittel, Minimum, Maximum je Saisontag — „langjährig" wird
 * nicht behauptet, der Bestand beginnt 2020.
 *
 * Pur und netzfrei; Batch (`build-index.mjs`) schreibt, Client (`FireHistoryChart`) liest.
 */

import type { HistoryEvent } from './historyEvents';
import { seasonWindow } from './historyEvents';
import { indexAnomalyKind, isDach } from './historyArtifacts';

export const SEASON_SERIES_VERSION = 1 as const;
export const SEASON_SERIES_URL = '/fire/bh/season-series-v1.json';

const D = 86_400_000;

export type SeriesCountry = 'DACH' | 'DE' | 'AT' | 'CH';

export interface SeasonSeries {
  year: number;
  /** Vollständig (Saison abgeschlossen vor dem Auswertetag) oder laufend. */
  complete: boolean;
  /** Letzter belegter Saisontag (0-basiert), bei vollständigen Saisons = Länge − 1. */
  lastDay: number;
  /** Kumulierte Ereignisse je Saisontag; `null` nach `lastDay` (laufende Saison). */
  cumulative: Record<SeriesCountry, (number | null)[]>;
}

export interface SeasonReference {
  years: number[];
  mean: Record<SeriesCountry, number[]>;
  min: Record<SeriesCountry, number[]>;
  max: Record<SeriesCountry, number[]>;
}

export interface SeasonSeriesFile {
  version: typeof SEASON_SERIES_VERSION;
  evaluatedAt: number;
  generatedAt: string;
  /** Saisonlänge in Tagen (1.3.–31.10. = 245, im Schaltjahr 245 — der 29.2. liegt davor). */
  days: number;
  seasons: SeasonSeries[];
  reference: SeasonReference | null;
  rule: { season: string; excludes: string; countsAs: string };
  limits: string[];
}

const COUNTRIES: SeriesCountry[] = ['DACH', 'DE', 'AT', 'CH'];

export function seasonLengthDays(year: number): number {
  const w = seasonWindow(year);
  return Math.round((w.toMs - w.fromMs) / D);
}

/** Saisontag (0-basiert) eines Zeitpunkts; außerhalb der Saison `null`. */
export function seasonDayOf(ms: number, year: number): number | null {
  const w = seasonWindow(year);
  if (ms < w.fromMs || ms >= w.toMs) return null;
  return Math.floor((ms - w.fromMs) / D);
}

/** Zählt ein Ereignis in der Kurve? DACH, mit Beginn, kein Dauersignal (`site`). */
export function countsInSeries(e: HistoryEvent): boolean {
  return isDach(e) && e.firstMs != null && indexAnomalyKind(e) !== 'site';
}

export function seasonSeriesOf(events: readonly HistoryEvent[], year: number, evaluatedAt: number): SeasonSeries {
  const n = seasonLengthDays(year);
  const w = seasonWindow(year);
  const complete = evaluatedAt >= w.toMs;
  // Letzter belegter Tag: der Tag VOR dem Auswertetag-Ende (evaluatedAt ist exklusiv).
  const lastDay = complete ? n - 1 : Math.max(-1, Math.min(n - 1, Math.floor((evaluatedAt - 1 - w.fromMs) / D)));
  const daily: Record<SeriesCountry, number[]> = { DACH: new Array(n).fill(0), DE: new Array(n).fill(0), AT: new Array(n).fill(0), CH: new Array(n).fill(0) };
  for (const e of events) {
    if (!countsInSeries(e)) continue;
    const d = seasonDayOf(e.firstMs as number, year);
    if (d == null || d > lastDay) continue;
    daily.DACH[d]++;
    daily[e.country as 'DE' | 'AT' | 'CH'][d]++;
  }
  const cumulative = {} as Record<SeriesCountry, (number | null)[]>;
  for (const c of COUNTRIES) {
    let acc = 0;
    cumulative[c] = daily[c].map((v, i) => { if (i > lastDay) return null; acc += v; return acc; });
  }
  return { year, complete, lastDay, cumulative };
}

export function referenceOf(seasons: readonly SeasonSeries[]): SeasonReference | null {
  const full = seasons.filter((s) => s.complete);
  if (!full.length) return null;
  const n = Math.min(...full.map((s) => s.cumulative.DACH.length));
  const mean = {} as SeasonReference['mean']; const min = {} as SeasonReference['min']; const max = {} as SeasonReference['max'];
  for (const c of COUNTRIES) {
    mean[c] = []; min[c] = []; max[c] = [];
    for (let i = 0; i < n; i++) {
      const vals = full.map((s) => s.cumulative[c][i] ?? 0);
      mean[c].push(Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10);
      min[c].push(Math.min(...vals)); max[c].push(Math.max(...vals));
    }
  }
  return { years: full.map((s) => s.year).sort(), mean, min, max };
}

export function buildSeasonSeries(events: readonly HistoryEvent[], years: readonly number[], evaluatedAt: number, generatedAt: string): SeasonSeriesFile {
  const seasons = years.map((y) => seasonSeriesOf(events, y, evaluatedAt));
  const days = Math.max(...seasons.map((s) => s.cumulative.DACH.length));
  return {
    version: SEASON_SERIES_VERSION, evaluatedAt, generatedAt, days, seasons,
    reference: referenceOf(seasons),
    rule: { season: '03-01..10-31', excludes: 'Ereignisse auf Anlagenstandorten (site, inkl. Dauersignal > 7 Tage)', countsAs: 'Ereignis (Cluster 2 km × Zeitlücke 48 h) mit Beginn am Saisontag, DE/AT/CH' },
    limits: [
      'Referenz sind die vollständigen Saisons seit 2020 — kein langjähriges Mittel.',
      'Die laufende Saison trägt am Rand NRT-Detektionen, die durch die Standard-Verarbeitung noch wandern können.',
      'Nur Suomi-NPP und NOAA-20; Zahl der Ereignisse, nicht Fläche — kleine Brände fehlen dem Satelliten systematisch.',
    ],
  };
}

/** Vergleich „bis heute": laufender Wert gegen Mittel/Spanne der Vorjahre am selben Saisontag. */
export function compareToReference(file: SeasonSeriesFile, country: SeriesCountry = 'DACH'): { year: number; day: number; value: number; mean: number; min: number; max: number; years: number[] } | null {
  const cur = file.seasons.find((s) => !s.complete) ?? null;
  if (!cur || !file.reference || cur.lastDay < 0) return null;
  const d = cur.lastDay;
  const value = cur.cumulative[country][d];
  if (value == null) return null;
  return { year: cur.year, day: d, value, mean: file.reference.mean[country][d], min: file.reference.min[country][d], max: file.reference.max[country][d], years: file.reference.years };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface SeriesCheck { name: string; ok: boolean; detail?: string }

export function verifyHistorySeries(sample: HistoryEvent): { checks: SeriesCheck[]; passed: number; total: number } {
  const checks: SeriesCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const ev = (year: number, month: number, day: number, over: Partial<HistoryEvent> = {}): HistoryEvent => ({ ...sample, country: 'DE', anomaly: null, firstMs: Date.UTC(year, month - 1, day, 12), ...over });
  const site: HistoryEvent['anomaly'] = { kind: 'site', siteId: 's', checks: { footprint: true, growth: true, intensity: true, mapping: true }, reasons: ['r'] };
  const events = [
    ev(2025, 3, 1), ev(2025, 3, 1), ev(2025, 8, 10), ev(2025, 11, 5),                 // 2025: 3 in der Saison, 1 danach
    ev(2025, 7, 1, { anomaly: site }), ev(2025, 7, 1, { country: 'outside' }),       // zählen nicht
    ev(2024, 5, 5), ev(2024, 5, 6, { country: 'AT' }),
    ev(2026, 3, 2), ev(2026, 8, 20), ev(2026, 8, 23),                                // 2026 läuft; 23.8. liegt NACH dem Stand
  ];
  const evaluatedAt = Date.UTC(2026, 7, 23);  // Ende des 22.08. (exklusiv)
  add('Saisonlänge 1.3.–31.10. = 245 Tage', seasonLengthDays(2025) === 245 && seasonLengthDays(2024) === 245);
  const s25 = seasonSeriesOf(events, 2025, evaluatedAt);
  add('2025 vollständig: 3 Ereignisse, Standort und außerhalb zählen nicht, November nicht', s25.complete && s25.cumulative.DACH[244] === 3 && s25.cumulative.DE[244] === 3 && s25.lastDay === 244);
  add('kumulativ: zwei am 1.3. ⇒ Tag 0 = 2, Tag 1 = 2', s25.cumulative.DACH[0] === 2 && s25.cumulative.DACH[1] === 2);
  const s26 = seasonSeriesOf(events, 2026, evaluatedAt);
  const d22 = seasonDayOf(Date.UTC(2026, 7, 22), 2026) as number;
  add('2026 läuft: letzter Tag = 22.8., danach null, Ereignis vom 23.8. zählt nicht', !s26.complete && s26.lastDay === d22 && s26.cumulative.DACH[d22] === 2 && s26.cumulative.DACH[d22 + 1] === null);
  const file = buildSeasonSeries(events, [2024, 2025, 2026], evaluatedAt, '2026-08-23T00:00:00Z');
  add('Referenz = nur vollständige Saisons (2024, 2025)', JSON.stringify(file.reference?.years) === '[2024,2025]');
  add('Referenz am Saisonende: Mittel 2,5, min 2, max 3 (DACH); AT-Mittel 0,5', file.reference?.mean.DACH[244] === 2.5 && file.reference?.min.DACH[244] === 2 && file.reference?.max.DACH[244] === 3 && file.reference?.mean.AT[244] === 0.5);
  const cmp = compareToReference(file);
  add('Vergleich bis heute: 2026 = 2 gegen Mittel der Vorjahre am selben Tag', !!cmp && cmp.year === 2026 && cmp.value === 2 && cmp.day === d22 && cmp.mean === file.reference!.mean.DACH[d22]);
  add('Grenzen: kein „langjährig", NRT-Rand genannt', file.limits.some((l) => /kein langjähriges Mittel/.test(l)) && file.limits.some((l) => /NRT/.test(l)));
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
