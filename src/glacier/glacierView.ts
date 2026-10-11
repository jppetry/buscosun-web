/**
 * GL-1 — Pure view logic of the glacier page (no DOM): the metrics the situation map can be coloured by, each with its
 * origin, unit, ramp and — where a package is still missing — its LOCK; value buckets, ranking, search, German number
 * formatting, season wording. Everything here is tested by `verify:glacier-ui` without a browser.
 */
import type { GlacierCatalogEntry, GlacierOrigin, GlacierCountry } from './glacierContract';
import type { GlacierLatest, GlacierSummary } from './glacierClient';
import type { GlacierLand, GlacierMetric } from './glacierState';

// --- Formatting -------------------------------------------------------------------------------------------------

const nf = (min: number, max: number) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });
const F0 = nf(0, 0), F1 = nf(1, 1), F2 = nf(2, 2), F3 = nf(0, 3);
/** Typographic minus (U+2212), thin grouping handled by the locale. */
const neg = (s: string) => s.replace('-', '−');
export const fmt0 = (v: number) => neg(F0.format(v));
export const fmt1 = (v: number) => neg(F1.format(v));
export const fmt2 = (v: number) => neg(F2.format(v));
export const fmtKm2 = (v: number) => (v >= 10 ? F0.format(v) : v >= 1 ? F1.format(v) : v >= 0.1 ? F2.format(v) : F3.format(v)) + ' km²';
export const fmtSigned = (v: number, nd = 1) => (v > 0 ? '+' : '') + (nd === 0 ? fmt0(v) : fmt1(v));

/** Year or range of a reference stamp as shown ("2016", "2013–2018"). */
export const fmtRefYear = (y: number | string) => String(y).replace('-', '–');

// --- Metrics ---------------------------------------------------------------------------------------------------------

export interface GlacierMetricDef {
  id: GlacierMetric;
  label: string;
  sub: string;
  origin: GlacierOrigin;
  unit: string;
  /** Larger loss = darker. Ramp family: `loss` (terracotta) or `snow` (glacier cyan). */
  ramp: 'loss' | 'snow';
  /** Upper bounds of buckets 0–3 (bucket 4 = beyond the last); values compare on `|v|` of a LOSS. */
  bounds: [number, number, number, number];
  /** Why the metric cannot be shown yet; the dock shows it locked with this reason (never a placeholder number). */
  locked: string | null;
  legendTitle: string;
  noValue: string;
}
export const GLACIER_METRIC_DEFS: Readonly<Record<GlacierMetric, GlacierMetricDef>> = Object.freeze({
  laenge: { id: 'laenge', label: 'Länge zuletzt', sub: 'Längenänderung im letzten Messjahr', origin: 'measured', unit: 'm', ramp: 'loss', bounds: [10, 25, 50, 100], locked: null, legendTitle: 'Längenänderung (m, letztes Messjahr)', noValue: 'keine Längenmessung' },
  flaeche: { id: 'flaeche', label: 'Fläche je Jahrzehnt', sub: 'Änderung zwischen den Inventaren', origin: 'official', unit: '% je 10 Jahre', ramp: 'loss', bounds: [3, 6, 10, 15], locked: null, legendTitle: 'Flächenänderung (% je Jahrzehnt)', noValue: 'nur ein Inventar' },
  bilanz: { id: 'bilanz', label: 'Jüngste Bilanz', sub: 'Massenbilanz des letzten Jahres', origin: 'measured', unit: 'mm w. e.', ramp: 'loss', bounds: [500, 1000, 1500, 2500], locked: null, legendTitle: 'Jahresbilanz (mm Wasseräquivalent)', noValue: 'keine Massenbilanz' },
  schmelze: { id: 'schmelze', label: 'Schmelze heute', sub: 'Modell, 0–336 h', origin: 'model', unit: 'mm w. e.', ramp: 'snow', bounds: [10, 20, 40, 60], locked: 'folgt mit der Schmelzrechnung (GL-3), sobald die Eichung besteht', legendTitle: 'Schmelze heute', noValue: 'noch nicht verfügbar' },
  ausaperung: { id: 'ausaperung', label: 'Ausaperung', sub: 'Satellit, Anteil schneefrei', origin: 'satellite', unit: '%', ramp: 'snow', bounds: [20, 40, 60, 80], locked: 'folgt mit den Sentinel-2-Szenen (GL-2)', legendTitle: 'Ausaperung', noValue: 'noch nicht verfügbar' },
});

export interface MetricValue {
  /** Display number in the metric's unit, `null` = no value. */
  v: number | null;
  /** Bucket 0–4 or −1 (no value). */
  bucket: number;
  /** Human text of the value ("−54 m"), `null` when none. */
  text: string | null;
  /** Period/reference that belongs to the value ("2024", "1973–2016", "2024/25"). */
  period: string | null;
  reason: string | null;
}

const annualisedPct = (da: [number, number, number]): number | null => {
  const years = da[1] - da[0];
  if (years < 3) return null;
  const ratio = 1 + da[2] / 100;
  if (ratio <= 0) return -100;
  return (Math.pow(ratio, 10 / years) - 1) * 100;
};

export function bucketOf(def: GlacierMetricDef, loss: number): number {
  const a = Math.max(0, loss);
  let b = 0;
  while (b < 4 && a >= def.bounds[b]) b++;
  return b;
}

export function metricValue(metric: GlacierMetric, latest: GlacierLatest | undefined, g: GlacierCatalogEntry): MetricValue {
  const def = GLACIER_METRIC_DEFS[metric];
  const none = (reason: string): MetricValue => ({ v: null, bucket: -1, text: null, period: null, reason });
  if (def.locked) return none(def.locked);
  if (metric === 'laenge') {
    if (!latest?.len) return none(def.noValue);
    const [y1, dl, y0] = latest.len;
    return { v: dl, bucket: bucketOf(def, -dl), text: `${fmtSigned(dl, Math.abs(dl) < 10 ? 1 : 0)} m`, period: y1 - y0 === 1 ? `${y0}/${String(y1).slice(2)}` : `${y0}–${y1}`, reason: null };
  }
  if (metric === 'flaeche') {
    if (!latest?.da) return none(g.country === 'DE' ? def.noValue : def.noValue);
    const r = annualisedPct(latest.da);
    if (r == null) return none('Inventare zu nah beieinander');
    return { v: r, bucket: bucketOf(def, -r), text: `${fmtSigned(r, 1)} %`, period: `${latest.da[0]}–${latest.da[1]}`, reason: null };
  }
  if (metric === 'bilanz') {
    if (!latest?.ba) return none(def.noValue);
    const [y, ba] = latest.ba;
    return { v: ba, bucket: bucketOf(def, -ba), text: `${fmtSigned(ba / 1000, 2)} m w. e.`, period: `${y - 1}/${String(y).slice(2)}`, reason: null };
  }
  return none(def.noValue);
}

// --- Selection, search, ranking -----------------------------------------------------------------------------------------

const normText = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
export function matchesQuery(g: GlacierCatalogEntry, q: string): boolean {
  const t = q.trim();
  if (!t) return true;
  const n = normText(t);
  return normText(g.name ?? '').includes(n) || g.id.includes(n.replace(/\s+/g, '-')) || Object.values(g.inv).some((v) => String(v).toLowerCase() === t.toLowerCase());
}
export const inLand = (g: GlacierCatalogEntry, land: GlacierLand): boolean => land === 'alle' || g.country.toLowerCase() === land;

export interface RankRow { g: GlacierCatalogEntry; value: MetricValue }
/** Ranking of the chosen metric: worst loss first (most negative `v`), glaciers without a value are never ranked. */
export function rankGlaciers(glaciers: readonly GlacierCatalogEntry[], summary: GlacierSummary | null, metric: GlacierMetric, land: GlacierLand, q: string, limit = 8): RankRow[] {
  if (GLACIER_METRIC_DEFS[metric].locked) return [];
  const rows: RankRow[] = [];
  for (const g of glaciers) {
    if (!inLand(g, land) || !matchesQuery(g, q)) continue;
    const value = metricValue(metric, summary?.latest[g.id], g);
    if (value.v != null) rows.push({ g, value });
  }
  rows.sort((a, b) => (a.value.v as number) - (b.value.v as number) || b.g.area.km2 - a.g.area.km2 || (a.g.id < b.g.id ? -1 : 1));
  return rows.slice(0, limit);
}

/** Display name: the inventory name, or the class + inventory id for nameless glaciers ("namenlos · 9027"). */
export function displayName(g: GlacierCatalogEntry): string {
  if (g.name) return g.name;
  const id = g.inv.sgi ?? g.inv.agi5 ?? g.inv.rgi6 ?? g.id;
  return `namenlos · ${id}`;
}

export const COUNTRY_SHORT: Readonly<Record<GlacierCountry, string>> = { CH: 'CH', AT: 'AT', DE: 'DE' };

// --- Season wording (from the date, hydrological year Oct–Sep) -------------------------------------------------------------------

export function seasonStatus(nowMs: number): { label: string; phase: 'winter' | 'melt' | 'over' } {
  const d = new Date(nowMs);
  const m = d.getUTCMonth() + 1, y = d.getUTCFullYear();
  if (m >= 10) return { label: `Saison ${y - 1}/${String(y).slice(2)} beendet`, phase: 'over' };
  if (m >= 6) return { label: `Schmelzsaison ${y}`, phase: 'melt' };
  return { label: `Winter ${y - 1}/${String(y).slice(2)}`, phase: 'winter' };
}

/**
 * "Messung" stand of the top bar: the date of the newest official item per measuring network ("GLAMOS 01.10. · ÖAV 13.03. · BAdW 19.03.").
 * Only the three networks of the stage-1 register count; a year is added when it is not the current one.
 */
const NETWORKS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^Schweizerisches Gletschermessnetz/, 'GLAMOS'], [/^Österreichischer Alpenverein/, 'ÖAV'], [/^Bayerische Akademie/, 'BAdW'],
];
export function officialStandLabel(items: ReadonlyArray<{ date: string; source: string }>, nowMs: number): string | null {
  const year = new Date(nowMs).getUTCFullYear();
  const parts: string[] = [];
  for (const [rx, name] of NETWORKS) {
    const newest = items.filter((i) => rx.test(i.source)).map((i) => i.date).sort().pop();
    if (!newest) continue;
    parts.push(`${name} ${newest.slice(8, 10)}.${newest.slice(5, 7)}.${Number(newest.slice(0, 4)) === year ? '' : newest.slice(2, 4)}`);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Colours (README-gletscher.md): ramps from light to dark; "no value" is a dashed circle. */
export const GLACIER_RAMPS: Readonly<Record<'loss' | 'snow', readonly string[]>> = Object.freeze({
  loss: ['#F4DCC6', '#E9B48C', '#D68A55', '#B5602C', '#7E3C17'],
  snow: ['#E3F1F5', '#A9D4E2', '#5FAFC9', '#1E87A8', '#145A70'],
});
export const GLACIER_ORIGIN_STYLE: Readonly<Record<GlacierOrigin, { text: string; fill: string; border: string; dot: string }>> = Object.freeze({
  measured: { text: '#4F6A3D', fill: '#EFF3E8', border: '#C3D2AF', dot: '#5F7A4C' },
  satellite: { text: '#4B3D96', fill: '#EEEBF8', border: '#CFC6EE', dot: '#6B5BB8' },
  model: { text: '#7A5418', fill: '#FBF3E7', border: '#E7D3B4', dot: '#B8862F' },
  official: { text: '#2C2A26', fill: '#EDE6D3', border: '#D9D0B8', dot: '#2C2A26' },
});
