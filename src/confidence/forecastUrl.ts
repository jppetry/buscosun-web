/**
 * Vorhersage · Zustand in der URL (Phase SH5, pur).
 *
 * Diese Seite hatte **gar keinen** URL-Zustand: Ort, gewählter Tag, Diagrammgröße
 * und die abgewählten Modelle lebten in React-State und `localStorage`
 * (`audit/teilen-share.md` §1.1, §3.4). Ein Link führte immer auf das leere
 * Suchfeld — teilen ließ sich nichts, und ein Reload verlor die Auswahl.
 *
 * Zwei Dinge sind dabei mehr als ein Umzug:
 *
 *  1. **Der Tag steht als Datum in der URL, nicht als Index.** `selected` war
 *     die Position in der Tagesliste — morgen zeigt derselbe Index einen anderen
 *     Tag. Jans Vorgabe (absolute Zeitangaben) verlangt `tag=2026-09-14`.
 *  2. **`localStorage` bleibt der Standard, die URL gewinnt** (V-SH-10). Wer
 *     nichts teilt, behält seine gemerkte Diagrammgröße; wer einen Link öffnet,
 *     sieht, was der Absender sah.
 */

import type { Location } from '../types';
import { encodeShareQuery, fmtCoord, parseIsoDate, roundTo } from '../share/shareSchema';
import { FORECAST_MODELS } from './multiModel';
import type { ChartMetric } from './ModelCompareChart';

const METRICS: ReadonlyArray<readonly [ChartMetric, string]> = [
  ['temp', 'temperatur'], ['precip', 'regen'], ['wind', 'wind'], ['cloud', 'wolken'],
] as const;

export const DEFAULT_FORECAST_METRIC: ChartMetric = 'temp';

export interface ForecastUrlState {
  place: Location | null;
  /** Gewählter Tag als ISO-Datum; `null` = der erste (heute). */
  day: string | null;
  metric: ChartMetric;
  /** Abgewählte Modelle (IDs aus `FORECAST_MODELS`). */
  disabled: readonly string[];
  /** Konsenslinie sichtbar? Standard `true`. */
  consensus: boolean;
}

export const FORECAST_QUERY_ORDER = ['tag', 'groesse', 'ohne', 'konsens', 'ort', 'olat', 'olon', 'land'] as const;
const KNOWN: ReadonlySet<string> = new Set(FORECAST_QUERY_ORDER);

const isModelId = (id: string) => FORECAST_MODELS.some((m) => m.id === id);

/** Zustand → Query-Paare; Standardwerte entfallen. */
export function forecastPairs(
  s: ForecastUrlState,
  slug: { slug: string; inTable: boolean } | null,
  extra: ReadonlyArray<[string, string]> = [],
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (s.day) out.push(['tag', s.day]);
  if (s.metric !== DEFAULT_FORECAST_METRIC) out.push(['groesse', METRICS.find(([k]) => k === s.metric)?.[1] ?? 'temperatur']);
  // Reihenfolge des Katalogs, damit dieselbe Auswahl denselben Link ergibt.
  const off = FORECAST_MODELS.filter((m) => s.disabled.includes(m.id)).map((m) => m.id);
  if (off.length) out.push(['ohne', off.join(',')]);
  if (!s.consensus) out.push(['konsens', '0']);
  if (s.place) {
    if (slug?.inTable) {
      if (s.place.country !== 'DE') out.push(['land', s.place.country.toLowerCase()]);
    } else {
      out.push(['ort', s.place.name], ['olat', fmtCoord(s.place.lat)], ['olon', fmtCoord(s.place.lon)], ['land', s.place.country.toLowerCase()]);
    }
  }
  const ordered = FORECAST_QUERY_ORDER.flatMap((k) => out.filter(([ok]) => ok === k));
  for (const [k, v] of extra) if (!KNOWN.has(k)) ordered.push([k, v]);
  return ordered;
}

export function buildForecastSearch(
  s: ForecastUrlState,
  slug: { slug: string; inTable: boolean } | null,
  extra: ReadonlyArray<[string, string]> = [],
): string {
  return encodeShareQuery(forecastPairs(s, slug, extra));
}

export interface ParsedForecastQuery {
  place: Location | null;
  day: string | null;
  /** `null` = die URL sagt nichts ⇒ `localStorage` bzw. Standard gilt. */
  metric: ChartMetric | null;
  disabled: string[] | null;
  consensus: boolean | null;
  invalid: string[];
  extra: Array<[string, string]>;
}

const num = (s: string | null) => {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Query → Zustand. Nie ein Wurf; `null` heißt „die URL sagt dazu nichts". */
export function parseForecastQuery(search: string): ParsedForecastQuery {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const invalid: string[] = [];
  const extra: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (!KNOWN.has(k)) extra.push([k, v]);

  let day: string | null = null;
  if (p.has('tag')) { day = parseIsoDate(p.get('tag')); if (!day) invalid.push('tag'); }

  let metric: ChartMetric | null = null;
  if (p.has('groesse')) {
    const hit = METRICS.find(([, sl]) => sl === p.get('groesse'));
    if (hit) metric = hit[0]; else invalid.push('groesse');
  }

  let disabled: string[] | null = null;
  if (p.has('ohne')) {
    const raw = (p.get('ohne') ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const good = raw.filter(isModelId);
    if (good.length !== raw.length) invalid.push('ohne');
    // Alle Modelle abzuwählen wäre ein leeres Diagramm — der Aufrufer prüft das
    // ohnehin, hier bleibt die Liste, wie sie gemeint war.
    disabled = FORECAST_MODELS.filter((m) => good.includes(m.id)).map((m) => m.id);
  }

  let consensus: boolean | null = null;
  if (p.has('konsens')) {
    if (p.get('konsens') === '0') consensus = false; else invalid.push('konsens');
  }

  let place: Location | null = null;
  const landRaw = (p.get('land') ?? '').toUpperCase();
  const country = landRaw === 'AT' || landRaw === 'CH' ? landRaw : landRaw === 'DE' ? 'DE' : null;
  if (p.has('land') && !country) invalid.push('land');
  if (p.has('ort') || p.has('olat') || p.has('olon')) {
    const lat = num(p.get('olat')), lon = num(p.get('olon'));
    if (lat != null && lon != null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      place = { name: (p.get('ort') ?? '').trim(), lat: roundTo(lat, 4), lon: roundTo(lon, 4), country: country ?? 'DE' };
    } else {
      for (const k of ['ort', 'olat', 'olon']) if (p.has(k)) invalid.push(k);
    }
  }

  return { place, day, metric, disabled, consensus, invalid, extra };
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface ForecastUrlCheck { name: string; ok: boolean; detail?: string }

export function verifyForecastUrl(): { checks: ForecastUrlCheck[]; passed: number; failed: number } {
  const checks: ForecastUrlCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const stgt: Location = { name: 'Stuttgart', lat: 48.7758, lon: 9.1829, country: 'DE' };
  const tableSlug = { slug: 'stuttgart', inTable: true };

  add('Standardzustand schreibt nichts',
    buildForecastSearch({ place: null, day: null, metric: 'temp', disabled: [], consensus: true }, null) === '');

  const s: ForecastUrlState = { place: stgt, day: '2026-09-14', metric: 'precip', disabled: ['gfs_seamless'], consensus: false };
  const q = buildForecastSearch(s, tableSlug);
  add('voller Zustand bleibt lesbar', q === '?tag=2026-09-14&groesse=regen&ohne=gfs_seamless&konsens=0', q);

  const back = parseForecastQuery(q);
  add('Rundlauf: Tag, Größe, Modelle, Konsens',
    back.day === '2026-09-14' && back.metric === 'precip' && back.disabled?.join(',') === 'gfs_seamless' && back.consensus === false);
  add('Rundlauf ist ein Fixpunkt',
    buildForecastSearch({ ...s, disabled: back.disabled ?? [] }, tableSlug) === q);
  add('Rundlauf: kein Invalid, kein Extra', back.invalid.length === 0 && back.extra.length === 0);

  // Der Tag ist ein DATUM, kein Index — genau darum geht es hier.
  add('kein Index in der URL', !/[?&](sel|i|idx)=/.test(q) && q.includes('tag=2026-09-14'));

  // „Die URL sagt nichts" ist etwas anderes als „Standard".
  const silent = parseForecastQuery('');
  add('leere Query lässt localStorage den Vortritt (null statt Standard)',
    silent.metric === null && silent.disabled === null && silent.consensus === null && silent.day === null);

  // Modell-Liste in Katalogreihenfolge, unbekannte Kennungen gemeldet.
  const mixed = parseForecastQuery('?ohne=gfs_seamless,quatsch,icon_seamless');
  add('unbekannte Modell-Kennung wird gemeldet', mixed.invalid.includes('ohne'));
  add('die bekannten bleiben, in Katalogreihenfolge',
    mixed.disabled?.join(',') === 'icon_seamless,gfs_seamless', mixed.disabled?.join(','));
  add('dieselbe Auswahl ergibt denselben Link (Reihenfolge egal)',
    buildForecastSearch({ place: null, day: null, metric: 'temp', disabled: ['gfs_seamless', 'icon_seamless'], consensus: true }, null)
    === buildForecastSearch({ place: null, day: null, metric: 'temp', disabled: ['icon_seamless', 'gfs_seamless'], consensus: true }, null));

  // Freier Ort
  const free: Location = { name: 'Feldberg (Schwarzwald)', lat: 47.8744, lon: 8.0043, country: 'DE' };
  add('freier Ort trägt Name und Koordinate',
    buildForecastSearch({ place: free, day: null, metric: 'temp', disabled: [], consensus: true }, { slug: 'feldberg-schwarzwald', inTable: false })
    === '?ort=Feldberg%20(Schwarzwald)&olat=47.8744&olon=8.0043&land=de');

  // Robustheit
  const bad = parseForecastQuery('?tag=gestern&groesse=quatsch&konsens=2&olat=999&olon=1&land=fr&fremd=1');
  add('jeder unbrauchbare Wert wird gemeldet',
    ['tag', 'groesse', 'konsens', 'olat', 'land'].every((k) => bad.invalid.includes(k)), bad.invalid.join(','));
  add('und fällt auf „nichts gesagt" zurück', bad.day === null && bad.metric === null && bad.consensus === null && bad.place === null);
  add('Fremdschlüssel bleiben erhalten', bad.extra.some(([k]) => k === 'fremd'));

  add('alle vier Diagrammgrößen haben einen Slug, alle verschieden',
    METRICS.length === 4 && new Set(METRICS.map(([, sl]) => sl)).size === 4);

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
