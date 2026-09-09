/**
 * Wetterarchiv · Zustand in der QUERY (Phase SH4, pur).
 *
 * Löst `#h=` ab (`historyState.ts` `encodeState`/`decodeState`, bleiben als
 * Leser für Alt-Links). Der alte Codec war schon ein Query-String — nur eben im
 * **Fragment**, das den Server nie erreicht (`audit/teilen-share.md` §1.2), und
 * mit Kürzeln, die niemand raten kann (`v=tmax&r=yearly&p=all&c=kenntage&k=hot`).
 *
 * Hier stehen dieselben Werte in Klartext: `groesse=tmax&diagramm=kenntage&kenntag=hitzetage`.
 * Alles, was dem Standard entspricht, entfällt — ein frisch geöffnetes Archiv
 * erzeugt einen blanken Pfad.
 */

import type { Resolution, VariableKey, KenntagKey } from './historyModel';
import type { ChartType, HistorySettings, PeriodPreset } from './historyState';
import { DEFAULT_SETTINGS } from './historyState';
import { encodeShareQuery } from '../share/shareSchema';

type Pair<T extends string> = readonly (readonly [T, string])[];

const VARIABLES: Pair<VariableKey> = [
  ['tmean', 'temperatur'], ['tmax', 'tmax'], ['tmin', 'tmin'],
  ['precip', 'regen'], ['sunshine', 'sonne'], ['wind', 'wind'], ['humidity', 'feuchte'],
] as const;

const CHARTS: Pair<ChartType> = [
  ['stripes', 'streifen'], ['anomaly', 'anomalie'], ['dayband', 'tagesband'], ['calendar', 'kalender'],
  ['overlay', 'ueberlagert'], ['bands', 'baender'], ['box', 'box'], ['windrose', 'windrose'],
  ['kenntage', 'kenntage'], ['records', 'rekorde'], ['dateLookup', 'datum'], ['line', 'linie'],
] as const;

const KENNTAGE: Pair<KenntagKey> = [
  ['hot', 'hitzetage'], ['summer', 'sommertage'], ['tropicalNight', 'tropennaechte'],
  ['frost', 'frost'], ['ice', 'eistage'],
] as const;

const RESOLUTIONS: Pair<Resolution> = [
  ['daily', 'taeglich'], ['monthly', 'monatlich'], ['seasonal', 'jahreszeiten'], ['yearly', 'jaehrlich'],
] as const;

const PERIODS: Pair<Exclude<PeriodPreset, 'custom'>> = [
  ['last-year', 'letztes-jahr'], ['10y', '10j'], ['30y', '30j'], ['all', 'alle'],
] as const;

const GRANS = [['day', 'tag'], ['month', 'monat'], ['year', 'jahr']] as const;

export const HISTORY_QUERY_ORDER = [
  'modus', 'zeitpunkt', 'groesse', 'aufloesung', 'zeitraum', 'normal', 'diagramm',
  'kenntag', 'schwelle', 'monate', 'beschriftung', 'trend', 'datum', 'jahr',
  'ort', 'olat', 'olon', 'land',
] as const;
const KNOWN: ReadonlySet<string> = new Set(HISTORY_QUERY_ORDER);

const slugOf = <T extends string>(table: Pair<T>, v: T, fallback: string) => table.find(([k]) => k === v)?.[1] ?? fallback;
const keyOf = <T extends string>(table: Pair<T>, s: string | null): T | null => table.find(([, sl]) => sl === s)?.[0] ?? null;

/** Ort des Archivs — eigener Typ, weil `HistoryLocation` `admin` statt `country` führt. */
export interface HistoryUrlPlace { name: string; lat: number; lon: number; admin?: string }

const c4 = (n: number) => Number(n.toFixed(4));

/**
 * Zustand → Query-Paare. `slug`/`inTable` kommen vom Aufrufer (`slugForPlace`);
 * ein Tabellenort braucht dann weder Namen noch Koordinate.
 */
export function historyPairs(
  place: HistoryUrlPlace | null,
  s: HistorySettings,
  slug: { slug: string; inTable: boolean } | null,
  extra: ReadonlyArray<[string, string]> = [],
): Array<[string, string]> {
  const d = DEFAULT_SETTINGS;
  const out: Array<[string, string]> = [];

  if (s.mode !== d.mode) {
    out.push(['modus', 'zeitpunkt']);
    const gran = GRANS.find(([k]) => k === s.exploreGran)?.[1] ?? 'monat';
    out.push(['zeitpunkt', `${gran}:${s.exploreYear}-${s.exploreMonth}-${s.exploreDay}`]);
  }
  if (s.variable !== d.variable) out.push(['groesse', slugOf(VARIABLES, s.variable, 'temperatur')]);
  if (s.resolution !== d.resolution) out.push(['aufloesung', slugOf(RESOLUTIONS, s.resolution, 'jaehrlich')]);
  if (s.period !== d.period) {
    out.push(['zeitraum', s.period === 'custom' ? `${s.customStart}-${s.customEnd}` : slugOf(PERIODS, s.period as Exclude<PeriodPreset, 'custom'>, 'alle')]);
  }
  if (s.normalPeriodId !== d.normalPeriodId) out.push(['normal', s.normalPeriodId]);
  if (s.chart !== d.chart) out.push(['diagramm', slugOf(CHARTS, s.chart, 'streifen')]);
  if (s.kenntag !== d.kenntag) out.push(['kenntag', slugOf(KENNTAGE, s.kenntag, 'hitzetage')]);
  if (s.kenntagThreshold != null) out.push(['schwelle', String(s.kenntagThreshold)]);
  if (s.months.length) out.push(['monate', s.months.join(',')]);
  if (s.showLabels) out.push(['beschriftung', '1']);
  if (!s.showTrend) out.push(['trend', '0']);
  if (s.chart === 'dateLookup') out.push(['datum', `${String(s.lookupMonth).padStart(2, '0')}-${String(s.lookupDay).padStart(2, '0')}`]);
  if (s.focusYear) out.push(['jahr', String(s.focusYear)]);

  if (place && !slug?.inTable) {
    out.push(['ort', place.name], ['olat', String(c4(place.lat))], ['olon', String(c4(place.lon))]);
  }

  const ordered = HISTORY_QUERY_ORDER.flatMap((k) => out.filter(([ok]) => ok === k));
  for (const [k, v] of extra) if (!KNOWN.has(k)) ordered.push([k, v]);
  return ordered;
}

export function buildHistorySearch(
  place: HistoryUrlPlace | null,
  s: HistorySettings,
  slug: { slug: string; inTable: boolean } | null,
  extra: ReadonlyArray<[string, string]> = [],
): string {
  return encodeShareQuery(historyPairs(place, s, slug, extra));
}

export interface ParsedHistoryQuery {
  place: HistoryUrlPlace | null;
  settings: HistorySettings;
  invalid: string[];
  extra: Array<[string, string]>;
}

/** Query → Zustand. Jeder unbrauchbare Wert fällt auf den Standard zurück. */
export function parseHistoryQuery(search: string): ParsedHistoryQuery {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const invalid: string[] = [];
  const extra: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (!KNOWN.has(k)) extra.push([k, v]);
  const s: HistorySettings = { ...DEFAULT_SETTINGS };

  if (p.has('modus')) {
    if (p.get('modus') === 'zeitpunkt') s.mode = 'explore';
    else if (p.get('modus') !== 'veraenderung') invalid.push('modus');
  }
  if (p.has('zeitpunkt')) {
    const m = /^(tag|monat|jahr):(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(p.get('zeitpunkt') ?? '');
    if (m) {
      s.exploreGran = (GRANS.find(([, sl]) => sl === m[1])?.[0] ?? 'month');
      s.exploreYear = +m[2]; s.exploreMonth = +m[3]; s.exploreDay = +m[4];
    } else invalid.push('zeitpunkt');
  }

  const take = <T extends string>(key: string, table: Pair<T>, set: (v: T) => void) => {
    if (!p.has(key)) return;
    const v = keyOf(table, p.get(key));
    if (v) set(v); else invalid.push(key);
  };
  take('groesse', VARIABLES, (v) => { s.variable = v; });
  take('aufloesung', RESOLUTIONS, (v) => { s.resolution = v; });
  take('diagramm', CHARTS, (v) => { s.chart = v; });
  take('kenntag', KENNTAGE, (v) => { s.kenntag = v; });

  if (p.has('zeitraum')) {
    const raw = p.get('zeitraum') ?? '';
    const preset = keyOf(PERIODS, raw);
    const span = /^(\d{4})-(\d{4})$/.exec(raw);
    if (preset) s.period = preset;
    else if (span && +span[1] <= +span[2]) { s.period = 'custom'; s.customStart = +span[1]; s.customEnd = +span[2]; }
    else invalid.push('zeitraum');
  }
  if (p.has('normal')) {
    const v = p.get('normal') ?? '';
    if (/^\d{4}-\d{4}$/.test(v)) s.normalPeriodId = v; else invalid.push('normal');
  }
  if (p.has('schwelle')) {
    const n = Number(p.get('schwelle'));
    if (Number.isFinite(n)) s.kenntagThreshold = n; else invalid.push('schwelle');
  }
  if (p.has('monate')) {
    const ms = (p.get('monate') ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= 12);
    if (ms.length) s.months = ms; else invalid.push('monate');
  }
  if (p.has('beschriftung')) {
    if (p.get('beschriftung') === '1') s.showLabels = true; else invalid.push('beschriftung');
  }
  if (p.has('trend')) {
    if (p.get('trend') === '0') s.showTrend = false; else invalid.push('trend');
  }
  if (p.has('datum')) {
    const m = /^(\d{1,2})-(\d{1,2})$/.exec(p.get('datum') ?? '');
    if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) { s.lookupMonth = +m[1]; s.lookupDay = +m[2]; }
    else invalid.push('datum');
  }
  if (p.has('jahr')) {
    const n = Number(p.get('jahr'));
    if (Number.isInteger(n) && n > 1800 && n < 2200) s.focusYear = n; else invalid.push('jahr');
  }

  let place: HistoryUrlPlace | null = null;
  if (p.has('ort') || p.has('olat') || p.has('olon')) {
    const lat = Number(p.get('olat')), lon = Number(p.get('olon'));
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      place = { name: (p.get('ort') ?? '').trim(), lat: c4(lat), lon: c4(lon) };
    } else {
      for (const k of ['ort', 'olat', 'olon']) if (p.has(k)) invalid.push(k);
    }
  }

  return { place, settings: s, invalid, extra };
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface HistoryUrlCheck { name: string; ok: boolean; detail?: string }

export function verifyHistoryUrl(): { checks: HistoryUrlCheck[]; passed: number; failed: number } {
  const checks: HistoryUrlCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const d = DEFAULT_SETTINGS;

  add('Standardzustand schreibt nichts', buildHistorySearch(null, d, null) === '', buildHistorySearch(null, d, null));

  const stgt = { name: 'Stuttgart', lat: 48.7758, lon: 9.1829 };
  const s1: HistorySettings = { ...d, variable: 'tmax', chart: 'kenntage', kenntag: 'hot' };
  add('Tabellenort braucht weder Namen noch Koordinate',
    buildHistorySearch(stgt, s1, { slug: 'stuttgart', inTable: true }) === '?groesse=tmax&diagramm=kenntage', buildHistorySearch(stgt, s1, { slug: 'stuttgart', inTable: true }));
  add('die Werte stehen im Klartext, nicht als Kürzel',
    !buildHistorySearch(stgt, s1, { slug: 'stuttgart', inTable: true }).includes('v=') );

  const s2: HistorySettings = {
    ...d, mode: 'explore', exploreGran: 'day', exploreYear: 2003, exploreMonth: 8, exploreDay: 13,
    variable: 'precip', resolution: 'monthly', period: 'custom', customStart: 1990, customEnd: 2020,
    normalPeriodId: '1991-2020', chart: 'dateLookup', kenntag: 'frost', kenntagThreshold: 32,
    months: [6, 7, 8], showLabels: true, showTrend: false, lookupMonth: 7, lookupDay: 4, focusYear: 2018,
  };
  const free = { name: 'Feldberg (Schwarzwald)', lat: 47.8744, lon: 8.0043 };
  const q2 = buildHistorySearch(free, s2, { slug: 'feldberg-schwarzwald', inTable: false });
  add('voller Zustand bleibt lesbar',
    q2 === '?modus=zeitpunkt&zeitpunkt=tag:2003-8-13&groesse=regen&aufloesung=monatlich&zeitraum=1990-2020&normal=1991-2020&diagramm=datum&kenntag=frost&schwelle=32&monate=6,7,8&beschriftung=1&trend=0&datum=07-04&jahr=2018&ort=Feldberg%20(Schwarzwald)&olat=47.8744&olon=8.0043', q2);

  const back = parseHistoryQuery(q2);
  add('Rundlauf: Modus und Zeitpunkt', back.settings.mode === 'explore' && back.settings.exploreGran === 'day' && back.settings.exploreYear === 2003 && back.settings.exploreDay === 13);
  add('Rundlauf: Größe, Auflösung, Zeitraum, Normal',
    back.settings.variable === 'precip' && back.settings.resolution === 'monthly'
    && back.settings.period === 'custom' && back.settings.customStart === 1990 && back.settings.customEnd === 2020
    && back.settings.normalPeriodId === '1991-2020');
  add('Rundlauf: Diagramm, Kenntag, Schwelle, Monate, Schalter',
    back.settings.chart === 'dateLookup' && back.settings.kenntag === 'frost' && back.settings.kenntagThreshold === 32
    && back.settings.months.join(',') === '6,7,8' && back.settings.showLabels && !back.settings.showTrend);
  add('Rundlauf: Datum und Fokusjahr', back.settings.lookupMonth === 7 && back.settings.lookupDay === 4 && back.settings.focusYear === 2018);
  add('Rundlauf: freier Ort', back.place?.name === 'Feldberg (Schwarzwald)' && back.place.lat === 47.8744);
  add('Rundlauf ist ein Fixpunkt',
    buildHistorySearch(back.place, back.settings, { slug: 'feldberg-schwarzwald', inTable: false }) === q2);
  add('Rundlauf: kein Invalid, kein Extra', back.invalid.length === 0 && back.extra.length === 0);

  // Vollständigkeit: jede Aufzählung deckt ihren Typ ab (sonst fiele ein Wert still weg).
  add('alle 7 Größen, 12 Diagramme, 5 Kenntage, 4 Auflösungen haben einen Slug',
    VARIABLES.length === 7 && CHARTS.length === 12 && KENNTAGE.length === 5 && RESOLUTIONS.length === 4);
  add('Slugs sind paarweise verschieden',
    new Set([...VARIABLES, ...CHARTS, ...KENNTAGE, ...RESOLUTIONS].map(([, sl]) => sl)).size
    === VARIABLES.length + CHARTS.length + KENNTAGE.length + RESOLUTIONS.length);
  for (const [, sl] of [...VARIABLES, ...CHARTS, ...KENNTAGE, ...RESOLUTIONS, ...PERIODS]) {
    if (!/^[a-z0-9-]+$/.test(sl)) add(`Slug „${sl}" folgt der Regel [a-z0-9-]`, false, sl);
  }
  add('jeder Slug folgt der Regel [a-z0-9-]',
    [...VARIABLES, ...CHARTS, ...KENNTAGE, ...RESOLUTIONS, ...PERIODS].every(([, sl]) => /^[a-z0-9-]+$/.test(sl)));

  // Robustheit
  const bad = parseHistoryQuery('?modus=x&zeitpunkt=x&groesse=x&aufloesung=x&zeitraum=x&normal=x&diagramm=x&kenntag=x&schwelle=x&monate=x&beschriftung=2&trend=1&datum=99-99&jahr=abc&olat=999&olon=1&fremd=1');
  add('jeder unbrauchbare Wert wird gemeldet',
    ['modus', 'zeitpunkt', 'groesse', 'aufloesung', 'zeitraum', 'normal', 'diagramm', 'kenntag', 'schwelle', 'monate', 'beschriftung', 'trend', 'datum', 'jahr', 'olat'].every((k) => bad.invalid.includes(k)),
    bad.invalid.join(','));
  add('und der Zustand bleibt der Standard', JSON.stringify(bad.settings) === JSON.stringify(d));
  add('Fremdschlüssel bleiben erhalten', bad.extra.some(([k]) => k === 'fremd'));

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
