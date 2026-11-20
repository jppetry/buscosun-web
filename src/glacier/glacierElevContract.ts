/**
 * Phase GH — contract of the elevation-change block of the glacier line (`audit/gletscher-hugonnet.md`): ONE file for the producer
 * (`scripts/glacier/hugonnet.mjs`), the client (`src/glacier/*`) and the verifier (`verify:glacier-hugonnet`).
 *
 * What it carries: the satellite-derived mean elevation change of the glacier surface per glacier, 2000–2019 and the four
 * five-year periods, each with its 1-sigma uncertainty — the per-glacier table of Hugonnet et al. 2021 (doi:10.6096/13, CC BY 4.0),
 * values and uncertainties exactly as published. No density conversion of ours, nothing beyond 2019. The other quantities of the same
 * tables (mass balance, volume, mass, decades, yearly cumulative series) are a second product: `glacierHugonnetContract.ts`.
 *
 * Where it lives: `static/<build>/dhdt/<region>.json` of the static build (branch `glacier`), next to `proj/<region>.json`. The files of a
 * build are immutable, so the document names its own source; the pointer `index.json` says which build carries the files
 * (`static.dhdt === static.build`), and a client only asks then.
 *
 * One glacier of the catalogue gets the row of ONE RGI glacier or none (rule frozen in `audit/gletscher-hugonnet/regel-eingefroren.md`):
 * values of several RGI glaciers are never averaged — that would be a derivation of ours with an uncertainty of ours.
 * Dependency-free apart from the glacier contract.
 */
import { GLACIER_BUILD_RE, GLACIER_MATCH_MIN_OVERLAP, GLACIER_REGIONS } from './glacierContract';

// --- Paths and periods ---------------------------------------------------------------------------------------------------------------------

export const glacierElevFile = (region: string) => `dhdt/${region}.json`;
export const GLACIER_ELEV_REPORT_FILE = 'dhdt/report.json';

/** `key` = the `period` cell of the table; `to` = the last year the period covers (the table's end date is the 1 January after it). */
export interface GlacierElevPeriod { key: string; from: number; to: number; label: string }
/** Index 0 is the whole period; 1–4 the five-year periods in order. */
export const GLACIER_ELEV_PERIODS: readonly GlacierElevPeriod[] = Object.freeze([
  { key: '2000-01-01_2020-01-01', from: 2000, to: 2019, label: '2000–2019' },
  { key: '2000-01-01_2005-01-01', from: 2000, to: 2004, label: '2000–2004' },
  { key: '2005-01-01_2010-01-01', from: 2005, to: 2009, label: '2005–2009' },
  { key: '2010-01-01_2015-01-01', from: 2010, to: 2014, label: '2010–2014' },
  { key: '2015-01-01_2020-01-01', from: 2015, to: 2019, label: '2015–2019' },
]);
/** The last year the data set covers — named at every number (it is not a forecast and does not continue). */
export const GLACIER_ELEV_END_YEAR = 2019;

/** Source, licence and required attribution (primary page read 19.11.2026, audit §1); written into every document. */
export const GLACIER_ELEV_SOURCE = Object.freeze({
  id: 'hugonnet2021',
  label: 'Hugonnet et al. 2021 — Höhenänderung der Gletscheroberfläche 2000–2019 (je Gletscher, RGI 6.0)',
  licence: 'CC BY 4.0',
  attribution: 'Hugonnet, R., McNabb, R., Berthier, E., Menounos, B., Nuth, C., Girod, L., Farinotti, D., Huss, M., Dussaillant, I., Brun, F. & Kääb, A. (2021). Accelerated global glacier mass loss in the early twenty-first century - Dataset. Theia. https://doi.org/10.6096/13 — Veröffentlichung: Nature 592, 726–731, https://doi.org/10.1038/s41586-021-03436-z',
  url: 'https://doi.org/10.6096/13',
  refYear: '2000–2019',
  used: 'Höhenänderung der Oberfläche je Gletscher mit Unsicherheit (1 σ), Gesamtzeitraum und vier Fünfjahreszeiträume; Werte unverändert',
});
export type GlacierElevSource = { id: string; label: string; licence: string; attribution: string; url: string; refYear: string; used: string };

// --- The per-glacier table (real shape) ---------------------------------------------------------------------------------------------------

/** Header of `dh_<region>_rgi60_pergla_rates.csv` as published. */
export const HUGONNET_RATES_COLUMNS: readonly string[] = Object.freeze([
  'rgiid', 'period', 'area', 'dhdt', 'err_dhdt', 'dvoldt', 'err_dvoldt', 'dmdt', 'err_dmdt', 'dmdtda', 'err_dmdtda', 'perc_area_meas', 'perc_area_res', 'valid_obs', 'valid_obs_py', 'reg',
]);
export const RGI6_ID_RE = /^RGI60-\d{2}\.\d{5}$/;
/**
 * One table row; a cell is `null` where the table carries no number (an empty cell). Numbers are taken as written.
 * `dhdt`/`err` feed the elevation block; the other three pairs (specific mass balance in m w.e. per year, volume change in m³ per year,
 * mass change in Gt per year) feed `glacierHugonnetContract.ts`.
 */
export interface HugonnetRate {
  areaM2: number; dhdt: number | null; err: number | null;
  dvoldt: number | null; errDvoldt: number | null; dmdt: number | null; errDmdt: number | null; dmdtda: number | null; errDmdtda: number | null;
}
export interface HugonnetTable { rows: Map<string, Map<string, HugonnetRate>>; glaciers: number; lines: number }

const cell = (s: string): number | null => { const t = s.trim(); if (t === '' || /^nan$/i.test(t)) return null; const v = Number(t); return Number.isFinite(v) ? v : null; };

/**
 * Reads the rates table. Only the given periods are kept — by default those of `GLACIER_ELEV_PERIODS` (the table carries 42 per glacier).
 * Throws when the header is not the published one or a kept row is malformed — a changed table is a stop, never a silent guess at the columns.
 */
export function parseHugonnetRates(csv: string, periods: ReadonlyArray<{ key: string }> = GLACIER_ELEV_PERIODS): HugonnetTable {
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;
  const nl = text.indexOf('\n');
  const head = (nl < 0 ? text : text.slice(0, nl)).trim().split(',').map((c) => c.trim());
  if (head.length !== HUGONNET_RATES_COLUMNS.length || head.some((c, i) => c !== HUGONNET_RATES_COLUMNS[i])) throw new Error(`Hugonnet-Tabelle: Kopfzeile weicht ab (${head.join(',')})`);
  const iId = 0, iPeriod = 1, iArea = 2, iDh = 3, iErr = 4;
  const keep = new Set(periods.map((p) => p.key));
  const rows = new Map<string, Map<string, HugonnetRate>>();
  let lines = 0, at = nl + 1;
  while (nl >= 0 && at < text.length) {
    let end = text.indexOf('\n', at);
    if (end < 0) end = text.length;
    const line = text.slice(at, end).trim();
    at = end + 1;
    if (!line) continue;
    lines++;
    const c = line.split(',');
    if (!keep.has(c[iPeriod])) continue;
    if (c.length !== HUGONNET_RATES_COLUMNS.length) throw new Error(`Hugonnet-Tabelle: Zeile ${lines + 1} hat ${c.length} Spalten`);
    if (!RGI6_ID_RE.test(c[iId])) throw new Error(`Hugonnet-Tabelle: RGI-Nummer "${c[iId]}" in Zeile ${lines + 1}`);
    const areaM2 = cell(c[iArea]);
    if (areaM2 == null || !(areaM2 > 0)) throw new Error(`Hugonnet-Tabelle: Fläche "${c[iArea]}" in Zeile ${lines + 1}`);
    let g = rows.get(c[iId]);
    if (!g) { g = new Map(); rows.set(c[iId], g); }
    if (g.has(c[iPeriod])) throw new Error(`Hugonnet-Tabelle: ${c[iId]} ${c[iPeriod]} doppelt`);
    g.set(c[iPeriod], {
      areaM2, dhdt: cell(c[iDh]), err: cell(c[iErr]),
      dvoldt: cell(c[5]), errDvoldt: cell(c[6]), dmdt: cell(c[7]), errDmdt: cell(c[8]), dmdtda: cell(c[9]), errDmdtda: cell(c[10]),
    });
  }
  return { rows, glaciers: rows.size, lines };
}

// --- The bridge and the 1 : 1 rule (R1, R2) -----------------------------------------------------------------------------------------------

/**
 * Overlap of a catalogue glacier with an RGI 6 glacier (`scripts/glacier/py/rgi_bridge.py`, the geometry of the GloGEM bridge):
 * `[glacier id, RGI id, intersection km², aG = share of OUR outline inside the RGI outline, aR = share of the RGI outline inside ours]`.
 */
export type RgiBridgePair = [g: string, r: string, km2: number, aG: number, aR: number];
export interface RgiBridgeDoc { schema: 1; kind: 'glacier/rgi-bridge'; build: string; pairs: RgiBridgePair[] }

/** Why a glacier has no block. */
export type GlacierElevWhy = 'no-rgi' | 'not-mutual' | 'part-of-rgi' | 'several-rgi' | 'no-value';
export const GLACIER_ELEV_WHY_TEXT: Readonly<Record<GlacierElevWhy, string>> = Object.freeze({
  'no-rgi': 'kein RGI-6-Umriss schneidet den Gletscher',
  'not-mutual': 'der RGI-Gletscher gehört mehrheitlich zu einem anderen Gletscher des Katalogs',
  'part-of-rgi': 'der Gletscher ist nur ein Teil des RGI-Gletschers (weniger als die Hälfte von dessen Fläche)',
  'several-rgi': 'der Gletscher liegt über mehreren RGI-Gletschern (keiner deckt die Hälfte seiner Fläche)',
  'no-value': 'die Tabelle trägt für 2000–2019 keinen Wert',
});
export type GlacierElevMatch = { ok: true; rgi: string; aG: number; aR: number } | { ok: false; why: GlacierElevWhy; rgi?: string; aG?: number; aR?: number };

/**
 * R2: glacier G gets RGI glacier R iff R has the largest intersection with G among all RGI glaciers, G has the largest intersection with R
 * among all catalogue glaciers, and the intersection covers at least half of BOTH outlines. Never a name, never a distance. Ties go to the
 * smaller id (stable under a reordered input).
 */
export function elevMatch(ids: readonly string[], pairs: readonly RgiBridgePair[], min: number = GLACIER_MATCH_MIN_OVERLAP): Map<string, GlacierElevMatch> {
  const bestOfG = new Map<string, RgiBridgePair>(), bestOfR = new Map<string, RgiBridgePair>();
  const better = (p: RgiBridgePair, cur: RgiBridgePair | undefined, by: 0 | 1) => !cur || p[2] > cur[2] || (p[2] === cur[2] && p[by] < cur[by]);
  for (const p of pairs) {
    if (!(p[2] > 0)) continue;
    if (better(p, bestOfG.get(p[0]), 1)) bestOfG.set(p[0], p);
    if (better(p, bestOfR.get(p[1]), 0)) bestOfR.set(p[1], p);
  }
  const out = new Map<string, GlacierElevMatch>();
  for (const id of ids) {
    const p = bestOfG.get(id);
    if (!p) { out.set(id, { ok: false, why: 'no-rgi' }); continue; }
    const info = { rgi: p[1], aG: p[3], aR: p[4] };
    if (bestOfR.get(p[1])?.[0] !== id) out.set(id, { ok: false, why: 'not-mutual', ...info });
    else if (p[4] < min) out.set(id, { ok: false, why: 'part-of-rgi', ...info });
    else if (p[3] < min) out.set(id, { ok: false, why: 'several-rgi', ...info });
    else out.set(id, { ok: true, ...info });
  }
  return out;
}

// --- Block and document -------------------------------------------------------------------------------------------------------------------

/** `[dhdt, err]` in m per year, err = 1 sigma — the table's numbers, unchanged. */
export type GlacierElevRate = [dhdt: number, err: number];
export interface GlacierElevBlock {
  /** The RGI 6.0 glacier the row belongs to. */
  rgi: string;
  /** Area (km²) of the RGI 6.0 outline the mean refers to (column `area`). */
  km2: number;
  /** One entry per `GLACIER_ELEV_PERIODS`; index 0 (2000–2019) is never `null`, a five-year period without a number is. */
  r: Array<GlacierElevRate | null>;
}
export interface GlacierElevDoc {
  schema: 1;
  kind: 'glacier/elev';
  build: string;
  region: string;
  periods: Array<{ from: number; to: number; label: string }>;
  unit: 'm/a';
  /** The uncertainties are 1-sigma values of the data set. */
  sigma: 1;
  /** What the mean refers to, in words. */
  ref: string;
  source: GlacierElevSource;
  glaciers: Record<string, GlacierElevBlock>;
}
export const GLACIER_ELEV_REF = 'Mittlere Höhenänderung der Oberfläche über den Umriss des Inventars RGI 6.0 (Stand um 2003), aus ASTER-Stereobildern; Unsicherheit 1 σ';

/** R3: the block of one matched glacier from its table rows, or `null` when 2000–2019 carries no number. */
export function elevBlockOf(rgi: string, rows: ReadonlyMap<string, HugonnetRate> | undefined): GlacierElevBlock | null {
  if (!rows) return null;
  const r = GLACIER_ELEV_PERIODS.map((p): GlacierElevRate | null => {
    const x = rows.get(p.key);
    return x && x.dhdt != null && x.err != null ? [x.dhdt, x.err] : null;
  });
  const whole = rows.get(GLACIER_ELEV_PERIODS[0].key);
  if (!r[0] || !whole) return null;
  return { rgi, km2: Math.round(whole.areaM2) / 1e6, r };
}

/** Rules of one document; anything returned makes the client drop the document whole (never half a block). */
export function elevProblems(d: GlacierElevDoc, region: string, ids?: { has(id: string): boolean }): string[] {
  const out: string[] = [];
  if (!d || d.schema !== 1 || d.kind !== 'glacier/elev') return ['schema/kind'];
  if (!GLACIER_BUILD_RE.test(d.build ?? '')) out.push(`build "${d.build}"`);
  if (d.region !== region || !GLACIER_REGIONS[region]) out.push(`region ${d.region}`);
  if (d.unit !== 'm/a' || d.sigma !== 1) out.push('unit/sigma');
  if (!d.ref) out.push('ref');
  const P = GLACIER_ELEV_PERIODS;
  if (!Array.isArray(d.periods) || d.periods.length !== P.length || d.periods.some((p, i) => p?.from !== P[i].from || p?.to !== P[i].to || p?.label !== P[i].label)) out.push('periods');
  const s = d.source;
  if (!s || !s.label || !s.licence || !s.attribution || !/^https:\/\//.test(s.url ?? '') || !s.attribution.includes('10.6096/13')) out.push('source');
  if (!d.glaciers || typeof d.glaciers !== 'object') return [...out, 'glaciers'];
  for (const [id, b] of Object.entries(d.glaciers)) {
    const t = `${id}:`;
    if (ids && !ids.has(id)) { out.push(`${t} not in the catalogue`); continue; }
    if (!b || !RGI6_ID_RE.test(b.rgi ?? '')) { out.push(`${t} rgi`); continue; }
    if (!(typeof b.km2 === 'number' && b.km2 > 0)) out.push(`${t} km2`);
    if (!Array.isArray(b.r) || b.r.length !== P.length) { out.push(`${t} periods`); continue; }
    if (b.r[0] == null) out.push(`${t} no value for ${P[0].label}`);
    for (const x of b.r) {
      if (x == null) continue;
      if (!Array.isArray(x) || x.length !== 2 || !Number.isFinite(x[0]) || !Number.isFinite(x[1]) || !(x[1] > 0) || Math.abs(x[0]) > 50) { out.push(`${t} rate ${JSON.stringify(x)}`); break; }
    }
  }
  return out;
}
