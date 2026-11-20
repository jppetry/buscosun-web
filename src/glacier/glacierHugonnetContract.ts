/**
 * Phase GH (continuation, 20.11.2026) — every per-glacier quantity of Hugonnet et al. 2021 (doi:10.6096/13, CC BY 4.0) for the glaciers
 * that carry the elevation block (`glacierElevContract.ts`, same frozen 1 : 1 rule, same glaciers):
 *   - elevation change of the surface (m per year), specific mass balance (m w.e. per year), volume change (m³ per year) and
 *     mass change (Gt per year), each with its 1-sigma uncertainty,
 *   - for 2000–2019, the two decades and the four five-year periods,
 *   - plus the cumulative elevation change in yearly steps, 1 January 2000 … 1 January 2020.
 *
 * Produced by `scripts/glacier/hugonnet.mjs --product=hugonnet`. NOT read by the client yet: no pointer key, no display.
 * Every number is the tables' own. The mass quantities are the data set's conversion (its numbers give dmdtda / dhdt = 0.85,
 * i.e. 850 kg/m³), never ours.
 *
 * Where it lives: `static/<build>/hugonnet/<region>.json`; the files `dhdt/` of the first step stay exactly as published.
 * Dependency-free apart from the glacier contracts.
 */
import { GLACIER_BUILD_RE, GLACIER_REGIONS } from './glacierContract';
import { GLACIER_ELEV_SOURCE, RGI6_ID_RE, type GlacierElevPeriod, type GlacierElevSource, type HugonnetRate } from './glacierElevContract';

// --- Paths, periods, quantities --------------------------------------------------------------------------------------------------------------

export const glacierHugonnetFile = (region: string) => `hugonnet/${region}.json`;
export const GLACIER_HUGONNET_REPORT_FILE = 'hugonnet/report.json';

/** Index 0 is the whole period, 1–2 the decades, 3–6 the five-year periods. `key` = the `period` cell of the rates table. */
export const GLACIER_HUGONNET_PERIODS: readonly GlacierElevPeriod[] = Object.freeze([
  { key: '2000-01-01_2020-01-01', from: 2000, to: 2019, label: '2000–2019' },
  { key: '2000-01-01_2010-01-01', from: 2000, to: 2009, label: '2000–2009' },
  { key: '2010-01-01_2020-01-01', from: 2010, to: 2019, label: '2010–2019' },
  { key: '2000-01-01_2005-01-01', from: 2000, to: 2004, label: '2000–2004' },
  { key: '2005-01-01_2010-01-01', from: 2005, to: 2009, label: '2005–2009' },
  { key: '2010-01-01_2015-01-01', from: 2010, to: 2014, label: '2010–2014' },
  { key: '2015-01-01_2020-01-01', from: 2015, to: 2019, label: '2015–2019' },
]);

/** The four quantities in the order of the value pairs of a period entry (`[value, uncertainty]` each). `col` = the table's column. */
export const GLACIER_HUGONNET_QUANTITIES = Object.freeze([
  { key: 'dhdt', col: 'dhdt', unit: 'm/a', label: 'Höhenänderung der Oberfläche' },
  { key: 'dmdtda', col: 'dmdtda', unit: 'm w.e./a', label: 'Spezifische Massenbilanz' },
  { key: 'dvoldt', col: 'dvoldt', unit: 'm³/a', label: 'Volumenänderung' },
  { key: 'dmdt', col: 'dmdt', unit: 'Gt/a', label: 'Massenänderung' },
] as const);

export const GLACIER_HUGONNET_SOURCE: GlacierElevSource = Object.freeze({
  ...GLACIER_ELEV_SOURCE,
  label: 'Hugonnet et al. 2021 — Höhen-, Volumen- und Massenänderung der Gletscher 2000–2019 (je Gletscher, RGI 6.0)',
  used: 'Höhenänderung, spezifische Massenbilanz, Volumen- und Massenänderung je Gletscher mit Unsicherheit (1 σ) für den Gesamtzeitraum, zwei Zehnjahres- und vier Fünfjahreszeiträume, dazu die aufsummierte Höhenänderung in Jahresschritten; Werte unverändert',
});
export const GLACIER_HUGONNET_REF = 'Mittel bzw. Summe über den Umriss des Inventars RGI 6.0 (Stand um 2003), aus ASTER-Stereobildern; Massengrößen mit der Dichteannahme des Datensatzes (850 kg/m³); Unsicherheit 1 σ';
export const GLACIER_HUGONNET_SERIES_REF = 'Aufsummierte mittlere Höhenänderung der Oberfläche seit dem 1. Januar 2000, je ein Wert im Abstand von einem Jahr; die Unsicherheit ist die des Datensatzes zum jeweiligen Zeitpunkt (sie beginnt nicht bei null)';

// --- The cumulative table (real shape) -----------------------------------------------------------------------------------------------------

/** Header of `dh_<region>_rgi60_pergla_cumul.csv` as published. */
export const HUGONNET_CUMUL_COLUMNS: readonly string[] = Object.freeze([
  'rgiid', 'time', 'area', 'dh', 'err_dh', 'perc_area_meas', 'perc_area_res', 'valid_obs', 'valid_obs_py', 'dt', 'std_dt',
  'err_corr_150', 'err_corr_2000', 'err_corr_5000', 'err_corr_20000', 'err_corr_50000', 'err_corr_200000', 'perc_err_cont', 'lat', 'lon', 'reg',
]);
/** The table steps 365.25 / 12 days: 12 rows per year, 241 rows per glacier (2000-01-01 … 2020-01-01). */
export const HUGONNET_CUMUL_ROWS = 241;
export const HUGONNET_CUMUL_PER_YEAR = 12;
export const GLACIER_HUGONNET_SERIES_POINTS = 21;

export interface HugonnetCumulRow { t: string; dh: number | null; err: number | null }
export interface HugonnetCumulTable { rows: Map<string, HugonnetCumulRow[]>; glaciers: number; lines: number }

const cell = (s: string): number | null => { const t = s.trim(); if (t === '' || /^nan$/i.test(t)) return null; const v = Number(t); return Number.isFinite(v) ? v : null; };

/**
 * Reads the cumulative table; with `wanted` only the rows of those RGI glaciers are kept (the table has 946 000 rows).
 * Throws on a changed header or a malformed kept row.
 */
export function parseHugonnetCumul(csv: string, wanted?: { has(id: string): boolean }): HugonnetCumulTable {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const nl = text.indexOf('\n');
  const head = (nl < 0 ? text : text.slice(0, nl)).trim().split(',').map((c) => c.trim());
  if (head.length !== HUGONNET_CUMUL_COLUMNS.length || head.some((c, i) => c !== HUGONNET_CUMUL_COLUMNS[i])) throw new Error(`Hugonnet-Jahresreihe: Kopfzeile weicht ab (${head.join(',')})`);
  const rows = new Map<string, HugonnetCumulRow[]>();
  const all = new Set<string>();
  let lines = 0, at = nl + 1;
  while (nl >= 0 && at < text.length) {
    let end = text.indexOf('\n', at);
    if (end < 0) end = text.length;
    const comma = text.indexOf(',', at);
    const id = comma > at && comma < end ? text.slice(at, comma) : '';
    const raw = id && wanted && !wanted.has(id) ? null : text.slice(at, end).trim();
    at = end + 1;
    if (raw === '') continue;
    lines++;
    if (raw === null) { all.add(id); continue; }
    if (!id) throw new Error(`Hugonnet-Jahresreihe: Zeile ${lines + 1} ohne RGI-Nummer`);
    all.add(id);
    const c = raw.split(',');
    if (c.length !== HUGONNET_CUMUL_COLUMNS.length) throw new Error(`Hugonnet-Jahresreihe: Zeile ${lines + 1} hat ${c.length} Spalten`);
    if (!RGI6_ID_RE.test(c[0])) throw new Error(`Hugonnet-Jahresreihe: RGI-Nummer "${c[0]}" in Zeile ${lines + 1}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c[1])) throw new Error(`Hugonnet-Jahresreihe: Datum "${c[1]}" in Zeile ${lines + 1}`);
    let g = rows.get(c[0]);
    if (!g) { g = []; rows.set(c[0], g); }
    g.push({ t: c[1], dh: cell(c[3]), err: cell(c[4]) });
  }
  return { rows, glaciers: all.size, lines };
}

/** `[cumulative dh in m, err in m]`, the table's numbers. */
export type GlacierHugonnetPoint = [dh: number, err: number];

/**
 * The yearly points of one glacier: every twelfth row from 2000-01-01 on, dates as the table writes them. Throws when the glacier does not
 * carry the published 241 distinct dates from 2000-01-01 to 2020-01-01 — a changed time axis is a stop, not something to interpolate.
 */
export function cumulYearly(rows: readonly HugonnetCumulRow[]): { times: string[]; c: Array<GlacierHugonnetPoint | null> } {
  const s = [...rows].sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  if (s.length !== HUGONNET_CUMUL_ROWS || s.some((r, i) => i > 0 && r.t === s[i - 1].t) || s[0].t !== '2000-01-01' || s[s.length - 1].t !== '2020-01-01') {
    throw new Error(`Hugonnet-Jahresreihe: Zeitachse weicht ab (${s.length} Zeilen, ${s[0]?.t} … ${s[s.length - 1]?.t})`);
  }
  const pick = s.filter((_, i) => i % HUGONNET_CUMUL_PER_YEAR === 0);
  return { times: pick.map((r) => r.t), c: pick.map((r): GlacierHugonnetPoint | null => (r.dh != null && r.err != null ? [r.dh, r.err] : null)) };
}

// --- Block and document -------------------------------------------------------------------------------------------------------------------

/** One period: the four value pairs in the order of `GLACIER_HUGONNET_QUANTITIES` — the table's numbers, unchanged. */
export type GlacierHugonnetRates = [dhdt: number, errDhdt: number, dmdtda: number, errDmdtda: number, dvoldt: number, errDvoldt: number, dmdt: number, errDmdt: number];
export interface GlacierHugonnetBlock {
  /** The RGI 6.0 glacier the rows belong to. */
  rgi: string;
  /** Area (km²) of the RGI 6.0 outline the values refer to (column `area`). */
  km2: number;
  /** One entry per `GLACIER_HUGONNET_PERIODS`; index 0 (2000–2019) is never `null`, another period without numbers is. */
  r: Array<GlacierHugonnetRates | null>;
  /** One entry per `series.times` of the document, or `null` when the cumulative table carries no number for the glacier. */
  c: Array<GlacierHugonnetPoint | null> | null;
}
export interface GlacierHugonnetDoc {
  schema: 1;
  kind: 'glacier/hugonnet';
  build: string;
  region: string;
  periods: Array<{ from: number; to: number; label: string }>;
  quantities: Array<{ key: string; unit: string; label: string }>;
  /** The uncertainties are 1-sigma values of the data set. */
  sigma: 1;
  ref: string;
  /** The yearly cumulative series: its dates as the table writes them (the same for every glacier). */
  series: { unit: 'm'; times: string[]; ref: string };
  source: GlacierElevSource;
  glaciers: Record<string, GlacierHugonnetBlock>;
}

/** The block of one matched glacier, or `null` when 2000–2019 carries no elevation change (the condition of the elevation block). */
export function hugonnetBlockOf(rgi: string, rows: ReadonlyMap<string, HugonnetRate> | undefined, c: Array<GlacierHugonnetPoint | null> | null): GlacierHugonnetBlock | null {
  if (!rows) return null;
  const whole = rows.get(GLACIER_HUGONNET_PERIODS[0].key);
  if (!whole || whole.dhdt == null || whole.err == null) return null;
  const r = GLACIER_HUGONNET_PERIODS.map((p): GlacierHugonnetRates | null => {
    const x = rows.get(p.key);
    if (!x) return null;
    const v = [x.dhdt, x.err, x.dmdtda, x.errDmdtda, x.dvoldt, x.errDvoldt, x.dmdt, x.errDmdt];
    return v.every((n) => n != null) ? (v as GlacierHugonnetRates) : null;
  });
  return { rgi, km2: Math.round(whole.areaM2) / 1e6, r, c: c && c.some((x) => x != null) ? c : null };
}

/** Rules of one document. */
export function hugonnetProblems(d: GlacierHugonnetDoc, region: string, ids?: { has(id: string): boolean }): string[] {
  const out: string[] = [];
  if (!d || d.schema !== 1 || d.kind !== 'glacier/hugonnet') return ['schema/kind'];
  if (!GLACIER_BUILD_RE.test(d.build ?? '')) out.push(`build "${d.build}"`);
  if (d.region !== region || !GLACIER_REGIONS[region]) out.push(`region ${d.region}`);
  if (d.sigma !== 1 || !d.ref) out.push('sigma/ref');
  const P = GLACIER_HUGONNET_PERIODS, Q = GLACIER_HUGONNET_QUANTITIES;
  if (!Array.isArray(d.periods) || d.periods.length !== P.length || d.periods.some((p, i) => p?.from !== P[i].from || p?.to !== P[i].to || p?.label !== P[i].label)) out.push('periods');
  if (!Array.isArray(d.quantities) || d.quantities.length !== Q.length || d.quantities.some((q, i) => q?.key !== Q[i].key || q?.unit !== Q[i].unit || !q?.label)) out.push('quantities');
  const T = d.series?.times;
  const timesOk = Array.isArray(T) && T.length === GLACIER_HUGONNET_SERIES_POINTS && T[0] === '2000-01-01' && T[T.length - 1] === '2020-01-01' && T.every((t, i) => /^\d{4}-\d{2}-\d{2}$/.test(t) && (i === 0 || t > T[i - 1]));
  if (!timesOk || d.series.unit !== 'm' || !d.series.ref) out.push('series');
  const s = d.source;
  if (!s || !s.label || !s.licence || !s.attribution || !/^https:\/\//.test(s.url ?? '') || !s.attribution.includes('10.6096/13')) out.push('source');
  if (!d.glaciers || typeof d.glaciers !== 'object') return [...out, 'glaciers'];
  const fin = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  for (const [id, b] of Object.entries(d.glaciers)) {
    const t = `${id}:`;
    if (ids && !ids.has(id)) { out.push(`${t} not in the catalogue`); continue; }
    if (!b || !RGI6_ID_RE.test(b.rgi ?? '')) { out.push(`${t} rgi`); continue; }
    if (!(typeof b.km2 === 'number' && b.km2 > 0)) out.push(`${t} km2`);
    if (!Array.isArray(b.r) || b.r.length !== P.length) { out.push(`${t} periods`); continue; }
    if (b.r[0] == null) out.push(`${t} no value for ${P[0].label}`);
    for (const x of b.r) {
      if (x == null) continue;
      // every value finite, every uncertainty positive, and all four quantities with the sign of the elevation change (they are one measurement)
      const ok = Array.isArray(x) && x.length === 2 * Q.length && x.every(fin) && [1, 3, 5, 7].every((i) => x[i] > 0) && Math.abs(x[0]) <= 50
        && [2, 4, 6].every((i) => x[i] === 0 || x[0] === 0 || Math.sign(x[i]) === Math.sign(x[0]));
      if (!ok) { out.push(`${t} rates ${JSON.stringify(x)}`); break; }
    }
    if (b.c === null) continue;
    if (!Array.isArray(b.c) || b.c.length !== GLACIER_HUGONNET_SERIES_POINTS || !b.c.some((x) => x != null)) { out.push(`${t} series`); continue; }
    for (const x of b.c) {
      if (x == null) continue;
      if (!Array.isArray(x) || x.length !== 2 || !fin(x[0]) || !fin(x[1]) || !(x[1] > 0) || Math.abs(x[0]) > 1000) { out.push(`${t} series point ${JSON.stringify(x)}`); break; }
    }
  }
  return out;
}
