/**
 * GL-4 — pure logic of the glacier sheet (five tabs): facts of the inventory, series, snow-line season against the TSLA band, long-term
 * comparison, projection ranges, melt index, tour lines, the list of sources. No DOM, no network; everything a number on the sheet is made from
 * is computed here so the verifier can test it without a browser.
 *
 * Honesty rules (plan §6/§7/§11): origin at every value, reference year at every area, a projection is always a range (never one year),
 * the melt index has no unit while Gate C is red, class B has no snow line and class C no satellite number, "verschwunden" only with the
 * authority's criterion, and the tour tab never says "begehbar", "sicher" or "frei" (checked by `tourProblems`).
 */
import type { GlacierCatalogEntry, GlacierOrigin, GlacierSeries } from './glacierContract';
import { GLACIER_FORBIDDEN_TOUR_WORDS, glacierForbiddenWords, glacierMeltFresh } from './glacierContract';
import { glacierFlagsOfMask, type GlacierSeasonRow, type GlacierSatFlag } from './glacierSatContract';
import { GLACIER_SAT_MAX_AGE_DAYS } from './glacierContract';
import type { GlacierMeltDoc, GlacierMeltRow, Triple } from './glacierMeltContract';
import type { GlacierElevBlock, GlacierElevDoc, GlacierElevSource } from './glacierElevContract';
import type { GlacierHugonnetBlock, GlacierHugonnetDoc } from './glacierHugonnetContract';

export const SHEET_DAY_MS = 86_400_000;
export const isoDoy = (iso: string): number => { const d = Date.parse(`${iso}T12:00:00Z`); return Math.floor((d - Date.UTC(new Date(d).getUTCFullYear(), 0, 0)) / SHEET_DAY_MS); };
export const dateDe = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
export const dateDeLong = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

// --- series ---------------------------------------------------------------------------------------------------------------------------

/** The longest tongue-survey series of the glacier (several survey lines exist at some glaciers) — rows `[yearFrom, yearTo, ΔL m]`. */
export function longestLength(series: readonly GlacierSeries[] | undefined): GlacierSeries | null {
  const l = (series ?? []).filter((s) => s.kind === 'length' && s.rows.length > 0);
  return l.length ? l.reduce((a, b) => (b.rows.length > a.rows.length ? b : a)) : null;
}
export interface CumPoint { year: number; cum: number }
/** Cumulative length change (m) over the measured years; the first point is the start year at 0. Years without a measurement stay gaps in the sum — said by `gaps`. */
export function cumulativeLength(s: GlacierSeries | null): { points: CumPoint[]; total: number; from: number; to: number; gaps: number } | null {
  if (!s || !s.rows.length) return null;
  const rows = ([...s.rows] as number[][]).sort((a, b) => a[0] - b[0]);
  const points: CumPoint[] = [{ year: rows[0][0], cum: 0 }];
  let cum = 0, gaps = 0, prevEnd = rows[0][0];
  for (const r of rows) {
    if (r[0] > prevEnd) gaps += r[0] - prevEnd;
    cum += r[2];
    points.push({ year: r[1], cum: Math.round(cum * 10) / 10 });
    prevEnd = r[1];
  }
  return { points, total: Math.round(cum * 10) / 10, from: rows[0][0], to: rows[rows.length - 1][1], gaps };
}

export interface MassRow { year: number; bw: number | null; bs: number | null; ba: number | null; ela: number | null; aar: number | null }
/** Mass-balance rows `[year, Bw, Bs, Ba, ELA, AAR]` of the glaciological series (mm w.e.). */
export function massRows(series: readonly GlacierSeries[] | undefined): MassRow[] {
  const s = (series ?? []).find((x) => x.kind === 'mass');
  if (!s) return [];
  return (s.rows as unknown as Array<Array<number | null>>).map((r) => ({ year: r[0] as number, bw: r[1], bs: r[2], ba: r[3], ela: r[4] ?? null, aar: r[5] ?? null }));
}
export const latestMass = (rows: readonly MassRow[]): MassRow | null => (rows.length ? rows[rows.length - 1] : null);

/** Inventory areas `[year, km²]` and the change between the first and the last. */
export function areaChange(series: readonly GlacierSeries[] | undefined): { from: [number, number]; to: [number, number]; pct: number } | null {
  const s = (series ?? []).find((x) => x.kind === 'area');
  if (!s || s.rows.length < 2) return null;
  const rows = ([...s.rows] as number[][]).sort((a, b) => a[0] - b[0]);
  const a = rows[0], b = rows[rows.length - 1];
  if (!(a[1] > 0)) return null;
  return { from: [a[0], a[1]], to: [b[0], b[1]], pct: ((b[1] - a[1]) / a[1]) * 100 };
}

// --- satellite season ------------------------------------------------------------------------------------------------------------------

export interface Scene { date: string; doy: number; clear: number; snow: number; state: 0 | 1 | 2; sla: number | null; aar: number | null; albSnow: number | null; albIce: number | null; flags: GlacierSatFlag[] }
export const sceneOf = (r: GlacierSeasonRow): Scene => ({ date: r[0], doy: isoDoy(r[0]), clear: r[1], snow: r[2], state: r[3], sla: r[4], aar: r[5], albSnow: r[6], albIce: r[7], flags: glacierFlagsOfMask(r[8] ?? 0) });
export const STATE_TEXT: Readonly<Record<0 | 1 | 2, string>> = Object.freeze({ 0: 'schneebedeckt', 1: 'Schneegrenze im Gletscher', 2: 'schneefrei' });

export interface SeasonSummary {
  scenes: Scene[];
  /** Highest snow line of the season (state 1 only) — class A. */
  highest: { sla: number; date: string } | null;
  /** Newest scene with an AAR. */
  aar: { v: number; date: string } | null;
  /** Newest scene. */
  last: Scene | null;
  /** Snow-free share (Ausaperung) of the newest scene = 1 − snow share. */
  bare: number | null;
}
export function seasonSummary(rows: readonly GlacierSeasonRow[] | undefined, klass: 'A' | 'B'): SeasonSummary {
  const scenes = (rows ?? []).map(sceneOf).sort((a, b) => (a.date < b.date ? -1 : 1));
  const withLine = klass === 'A' ? scenes.filter((s) => s.state === 1 && s.sla != null) : [];
  const hi = withLine.length ? withLine.reduce((a, b) => (b.sla! > a.sla! ? b : a)) : null;
  const withAar = klass === 'A' ? scenes.filter((s) => s.aar != null) : [];
  const la = withAar.length ? withAar[withAar.length - 1] : null;
  const last = scenes.length ? scenes[scenes.length - 1] : null;
  return { scenes, highest: hi ? { sla: hi.sla!, date: hi.date } : null, aar: la ? { v: la.aar!, date: la.date } : null, last, bare: last ? Math.round((1 - last.snow) * 100) / 100 : null };
}

/**
 * Albedo anomaly of bare ice: mean `albIce` of this year's scenes against the mean of the earlier years' scenes in the same window of the year (± 20 days around the
 * mean day of this year's scenes). Needs ≥ 3 scenes now and ≥ 2 earlier years with ≥ 3 scenes each — otherwise `null` (no anomaly is better than a thin one).
 */
export function albedoAnomaly(byYear: ReadonlyMap<number, readonly GlacierSeasonRow[]>, year: number): { delta: number; now: number; before: number; nNow: number; nBefore: number; years: number[] } | null {
  const now = (byYear.get(year) ?? []).map(sceneOf).filter((s) => s.albIce != null && !s.flags.includes('neuschnee'));
  if (now.length < 3) return null;
  const mid = now.reduce((a, s) => a + s.doy, 0) / now.length;
  const lo = mid - 20, hi = mid + 20;
  const years: number[] = []; const vals: number[] = [];
  for (const [y, rows] of byYear) {
    if (y >= year) continue;
    const v = rows.map(sceneOf).filter((s) => s.albIce != null && !s.flags.includes('neuschnee') && s.doy >= lo && s.doy <= hi).map((s) => s.albIce!);
    if (v.length >= 3) { years.push(y); vals.push(...v); }
  }
  if (years.length < 2) return null;
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const n = mean(now.map((s) => s.albIce!)), b = mean(vals);
  return { delta: Math.round((n - b) * 100) / 100, now: Math.round(n * 100) / 100, before: Math.round(b * 100) / 100, nNow: now.length, nBefore: vals.length, years: years.sort() };
}

/** Weekly TSLA band `[p10, p50, p90, n]` per glacier: points at the middle of each week; weeks without enough observations are skipped. */
export interface ClimaEntry { rgi7: string; n: number; weeks: Array<[number, number, number, number] | null> }
export function climaBand(e: ClimaEntry | undefined, doy0: number, bin: number): Array<{ doy: number; p10: number; p50: number; p90: number; n: number }> {
  if (!e) return [];
  const out: Array<{ doy: number; p10: number; p50: number; p90: number; n: number }> = [];
  e.weeks.forEach((w, i) => { if (w) out.push({ doy: doy0 + bin * i + Math.floor(bin / 2), p10: w[0], p50: w[1], p90: w[2], n: w[3] }); });
  return out;
}
/** Position of a snow line inside the TSLA band of its week: `above` the p90, `below` the p10, else `within`; `null` outside the band's weeks. */
export function againstBand(band: ReturnType<typeof climaBand>, doy: number, sla: number, bin = 7): { where: 'above' | 'within' | 'below'; p10: number; p50: number; p90: number; dev: number } | null {
  const w = band.find((b) => Math.abs(b.doy - doy) <= bin / 2 + 0.5);
  if (!w) return null;
  return { where: sla > w.p90 ? 'above' : sla < w.p10 ? 'below' : 'within', p10: w.p10, p50: w.p50, p90: w.p90, dev: Math.round(sla - w.p50) };
}

// --- long-term projection ---------------------------------------------------------------------------------------------------------------

export interface ProjectionView {
  years: number[];
  scenarios: Array<{ key: string; label: string; p10: number[]; p50: number[]; p90: number[]; u10: [number | null, number | null, number | null] }>;
  /** The span over all scenarios of the first year below 10 % of the 2020 volume: `[earliest, latest]`; `null` year = "after 2100". */
  range: { from: number; to: number | null } | null;
  v2020km3: number | null;
}
export function projectionView(p: { years: number[]; ssp: Record<string, string> } | null | undefined, e: { v2020km3: number | null; f: Record<string, number[][]>; u10: Record<string, Array<number | null>> } | undefined): ProjectionView | null {
  if (!p || !e) return null;
  const scenarios = Object.entries(e.f).map(([key, f]) => ({ key, label: p.ssp[key] ?? key, p10: f[0].map((v) => v * 100), p50: f[1].map((v) => v * 100), p90: f[2].map((v) => v * 100), u10: (e.u10[key] ?? [null, null, null]) as [number | null, number | null, number | null] }));
  const firsts = scenarios.map((s) => s.u10[0]).filter((v): v is number => v != null);
  const lasts = scenarios.map((s) => s.u10[2]);
  const range = firsts.length ? { from: Math.min(...firsts), to: lasts.some((v) => v == null) ? null : Math.max(...(lasts as number[])) } : null;
  return { years: p.years, scenarios, range, v2020km3: e.v2020km3 };
}
export function projectionSentence(v: ProjectionView): string {
  if (!v.range) return 'Unter 10 % des Volumens von 2020 fällt der Gletscher in keinem Szenario vor 2100 (Spanne über alle Szenarien und 12 Klimamodelle).';
  return `Unter 10 % des Volumens von 2020: ${v.range.from}–${v.range.to == null ? 'nach 2100' : v.range.to}, je nach Szenario und Klimamodell (nie ein einzelnes Jahr).`;
}

// --- elevation change 2000–2019 (phase GH, Hugonnet et al. 2021) ------------------------------------------------------------------------------

/** One period: the data set's value and 1-sigma uncertainty (m per year). `rangeOnly` = the uncertainty is at least as large as the value. */
export interface ElevRate { label: string; from: number; to: number; v: number; err: number; lo: number; hi: number; rangeOnly: boolean }
export interface ElevView {
  /** 2000–2019. */
  total: ElevRate;
  /** The four five-year periods in order; `null` = the table carries no number for it. */
  periods: Array<ElevRate | null>;
  rgi: string;
  km2: number;
  ref: string;
  source: GlacierElevSource;
}
/** The block of one glacier as the sheet shows it — nothing is computed beyond `value ± uncertainty` (no density, no mass, no extrapolation). */
export function elevView(doc: Pick<GlacierElevDoc, 'periods' | 'ref' | 'source'> | null | undefined, b: GlacierElevBlock | null | undefined): ElevView | null {
  if (!doc || !b || !Array.isArray(b.r) || !b.r[0]) return null;
  const rate = (i: number): ElevRate | null => {
    const x = b.r[i], p = doc.periods[i];
    if (!x || !p) return null;
    return { label: p.label, from: p.from, to: p.to, v: x[0], err: x[1], lo: x[0] - x[1], hi: x[0] + x[1], rangeOnly: x[1] >= Math.abs(x[0]) };
  };
  const total = rate(0);
  if (!total) return null;
  return { total, periods: doc.periods.slice(1).map((_, i) => rate(i + 1)), rgi: b.rgi, km2: b.km2, ref: doc.ref, source: doc.source };
}
/** One decimal; two when the uncertainty is below 0.05 m per year (a "± 0,0" would claim an exact value). */
export const elevDecimals = (err: number): 1 | 2 => (err < 0.05 ? 2 : 1);
/** German number with a typographic minus; `signed` puts a plus before a gain. A value that rounds to zero carries no sign. */
export function elevNum(v: number, nd: number, signed = true): string {
  const r = Math.round(Math.abs(v) * 10 ** nd) / 10 ** nd;
  const s = r.toFixed(nd).replace('.', ',');
  return r === 0 ? s : v < 0 ? `−${s}` : signed ? `+${s}` : s;
}
/**
 * The figure of one period: `value` is what stands large, `note` the small line next to it. With the uncertainty as large as the value only
 * the range is shown — no single number and no direction.
 */
export function elevFigure(r: ElevRate): { value: string; note: string } {
  const nd = elevDecimals(r.err);
  if (r.rangeOnly) return { value: `${elevNum(r.lo, nd)} bis ${elevNum(r.hi, nd)} m pro Jahr`, note: 'nur die Spanne: die Unsicherheit ist so groß wie der Wert' };
  return { value: `${elevNum(r.v, nd)} m pro Jahr`, note: `± ${elevNum(r.err, nd, false)}` };
}
/** Plain sentence under the figure; a direction ("gesunken"/"gestiegen") only when the value stands clear of its uncertainty. */
export function elevSentence(v: ElevView): string {
  const t = v.total, nd = elevDecimals(t.err);
  if (t.rangeOnly) return `Für ${t.label} lässt die Messung keine Richtung erkennen: die Höhenänderung liegt zwischen ${elevNum(t.lo, nd)} und ${elevNum(t.hi, nd)} m pro Jahr.`;
  return `Die Oberfläche ist von ${t.from} bis ${t.to} im Mittel um ${elevNum(Math.abs(t.v), nd, false)} m pro Jahr ${t.v < 0 ? 'gesunken' : 'gestiegen'} (± ${elevNum(t.err, nd, false)} m).`;
}

// --- elevation, volume and mass 2000–2019 (phase GH, second product) --------------------------------------------------------------------------

export type HugKey = 'dhdt' | 'dmdtda' | 'dvoldt' | 'dmdt';
/** Order of the value pairs of a period entry (`GLACIER_HUGONNET_QUANTITIES`). */
export const HUG_KEYS: readonly HugKey[] = Object.freeze(['dhdt', 'dmdtda', 'dvoldt', 'dmdt'] as const);
/** What a tile is called and the one line that says what the number is. */
export const HUG_TEXT: Readonly<Record<HugKey, { title: string; hint: string }>> = Object.freeze({
  dhdt: { title: 'Höhe der Oberfläche', hint: 'Mittel über die Gletscherfläche' },
  dmdtda: { title: 'Massenbilanz je Fläche', hint: 'Wasseräquivalent je Quadratmeter' },
  dvoldt: { title: 'Volumen', hint: 'Höhenänderung mal Fläche des Umrisses' },
  dmdt: { title: 'Masse', hint: 'Volumen mit 850 kg/m³, der Annahme des Datensatzes' },
});
/** One quantity of one period in the data set's unit (m, m w.e., m³, Gt — each per year). `rangeOnly` as in the elevation block. */
export interface HugQty { key: HugKey; v: number; err: number; rangeOnly: boolean }
export interface HugPeriod { label: string; from: number; to: number; q: Record<HugKey, HugQty> }
/** One point of the yearly cumulative series: date as the table writes it, metres against 1 January 2000, 1-sigma uncertainty. */
export interface HugPoint { t: string; v: number; err: number }
export interface HugonnetView {
  /** 2000–2019. */
  total: HugPeriod;
  /** In the order of the document: 0 = 2000–2019, 1–2 the decades, 3–6 the five-year periods; `null` = the table has no numbers for it. */
  periods: Array<HugPeriod | null>;
  /** One entry per date of the document; `null` entry = no number at that date, `null` = the glacier has no series. */
  series: Array<HugPoint | null> | null;
  /** The newest point of the series that carries a number. */
  last: (HugPoint & { rangeOnly: boolean }) | null;
  /** Year of the first date of the series (the level everything is counted from). */
  year0: number;
  rgi: string;
  km2: number;
  ref: string;
  source: GlacierElevSource;
}
/** The block of one glacier as the sheet shows it. Nothing is computed: every number is the document's, only paired with its uncertainty. */
export function hugonnetView(doc: Pick<GlacierHugonnetDoc, 'periods' | 'quantities' | 'series' | 'ref' | 'source'> | null | undefined, b: GlacierHugonnetBlock | null | undefined): HugonnetView | null {
  if (!doc || !b || !Array.isArray(b.r) || !Array.isArray(doc.quantities) || doc.quantities.some((q, i) => q?.key !== HUG_KEYS[i])) return null;
  const period = (i: number): HugPeriod | null => {
    const x = b.r[i], p = doc.periods[i];
    if (!x || !p) return null;
    const q = {} as Record<HugKey, HugQty>;
    HUG_KEYS.forEach((key, k) => { const v = x[2 * k], err = x[2 * k + 1]; q[key] = { key, v, err, rangeOnly: err >= Math.abs(v) }; });
    return { label: p.label, from: p.from, to: p.to, q };
  };
  const total = period(0);
  if (!total) return null;
  const times = doc.series?.times ?? [];
  const series = b.c && b.c.length === times.length ? b.c.map((x, i): HugPoint | null => (x ? { t: times[i], v: x[0], err: x[1] } : null)) : null;
  const newest = series ? [...series].reverse().find((p): p is HugPoint => p != null) ?? null : null;
  return {
    total, periods: doc.periods.map((_, i) => (i === 0 ? total : period(i))), series, last: newest ? { ...newest, rangeOnly: newest.err >= Math.abs(newest.v) } : null,
    year0: Number((times[0] ?? '2000').slice(0, 4)), rgi: b.rgi, km2: b.km2, ref: doc.ref, source: doc.source,
  };
}
const HUG_NF = [0, 1, 2].map((nd) => new Intl.NumberFormat('de-DE', { minimumFractionDigits: nd, maximumFractionDigits: nd }));
/** German number with grouping and a typographic minus; `signed` puts a plus before a gain. A value that rounds to zero carries no sign. */
export function hugNum(v: number, nd: 0 | 1 | 2, signed = true): string {
  const r = Math.round(Math.abs(v) * 10 ** nd) / 10 ** nd;
  const s = HUG_NF[nd].format(r);
  return r === 0 ? s : v < 0 ? `−${s}` : signed ? `+${s}` : s;
}
/**
 * How a quantity is written: the factor on the data set's unit, the unit shown and the decimals. Only the prefix changes (m³ → Mio. m³,
 * Gt → Mio. t or t) — never the number behind it; the decimals follow the uncertainty, so a "± 0" never claims an exact value.
 */
export function hugScale(key: HugKey, v: number, err: number): { f: number; unit: string; nd: 0 | 1 | 2 } {
  const dec = (e: number): 0 | 1 | 2 => (e >= 10 ? 0 : e >= 0.05 ? 1 : 2);
  const m = Math.max(Math.abs(v), err);
  if (key === 'dhdt') return { f: 1, unit: 'm', nd: elevDecimals(err) };
  if (key === 'dmdtda') return { f: 1, unit: 'm w. e.', nd: elevDecimals(err) };
  if (key === 'dvoldt') return m >= 1e6 ? { f: 1e-6, unit: 'Mio. m³', nd: dec(err * 1e-6) } : { f: 1, unit: 'm³', nd: 0 };
  return m >= 1e-3 ? { f: 1e3, unit: 'Mio. t', nd: dec(err * 1e3) } : { f: 1e9, unit: 't', nd: 0 };
}
/** The figure of one quantity: value and unit, and the small line next to it. With the uncertainty as large as the value only the range. */
export function hugFigure(q: HugQty): { value: string; unit: string; note: string; range: boolean } {
  const s = hugScale(q.key, q.v, q.err), v = q.v * s.f, e = q.err * s.f;
  if (q.rangeOnly) return { value: `${hugNum(v - e, s.nd)} bis ${hugNum(v + e, s.nd)}`, unit: s.unit, note: 'nur die Spanne', range: true };
  return { value: hugNum(v, s.nd), unit: s.unit, note: `± ${hugNum(e, s.nd, false)}`, range: false };
}
/** Decimals of a cumulative height in metres. */
export const hugCumDecimals = (err: number): 0 | 1 => (err >= 10 ? 0 : 1);
/** The figure of a point of the series (metres against the first date). */
export function hugCumFigure(p: HugPoint): { value: string; note: string; range: boolean } {
  const nd = hugCumDecimals(p.err);
  if (p.err >= Math.abs(p.v)) return { value: `${hugNum(p.v - p.err, nd)} bis ${hugNum(p.v + p.err, nd)} m`, note: 'nur die Spanne', range: true };
  return { value: `${hugNum(p.v, nd)} m`, note: `± ${hugNum(p.err, nd, false)}`, range: false };
}
/** Plain sentence under the large figure; a direction ("tiefer"/"höher") only when the value stands clear of its uncertainty. */
export function hugSentence(v: HugonnetView): string | null {
  const l = v.last, first = v.series?.find((p) => p != null) ?? null;
  if (!l || !first) return null;
  const nd = hugCumDecimals(l.err), a = dateDeLong(first.t), b = dateDeLong(l.t);
  if (l.rangeOnly) return `Zwischen dem ${a} und dem ${b} lässt die Messung keine Richtung erkennen: die Oberfläche liegt zwischen ${hugNum(l.v - l.err, nd)} und ${hugNum(l.v + l.err, nd)} m gegenüber dem Anfang.`;
  return `Am ${b} lag die Oberfläche im Mittel ${hugNum(Math.abs(l.v), nd, false)} m ${l.v < 0 ? 'tiefer' : 'höher'} als am ${a} (± ${hugNum(l.err, nd, false)} m).`;
}

// --- melt (index) -----------------------------------------------------------------------------------------------------------------------------

export interface MeltView {
  fresh: boolean;
  ageH: number;
  runAt: string;
  unit: boolean;
  /** Daily index [p10,p50,p90] for 14 days from the run hour. */
  idx: Triple[];
  /** Index of today (the day containing `nowMs`, counted from the run hour). */
  todayIdx: Triple | null;
  ix7: Triple; ix14: Triple;
  ice: number; nf: number; zf: (number | null)[]; zs: 'cells' | 'lapse' | 'mixed';
  forcing: 'own' | string;
  state: GlacierMeltDoc['state'];
  engine: string;
  gateReason: string;
}
export function meltView(doc: GlacierMeltDoc | null, row: GlacierMeltRow | null, nowMs: number): MeltView | null {
  if (!doc || !row) return null;
  const runMs = Date.parse(doc.runAt);
  const day = Math.floor((nowMs - runMs) / SHEET_DAY_MS);
  return {
    fresh: glacierMeltFresh(runMs, nowMs), ageH: Math.round((nowMs - runMs) / 3_600_000), runAt: doc.runAt, unit: doc.gate.unit === true,
    idx: row.idx, todayIdx: day >= 0 && day < row.idx.length ? row.idx[day] : null, ix7: row.ix7, ix14: row.ix14, ice: row.ice, nf: row.nf, zf: row.zf, zs: row.zs ?? 'cells', forcing: row.f,
    state: doc.state, engine: doc.engine.name, gateReason: doc.gate.reason,
  };
}
/** Wording of the index level — relative, never a danger or a permission. */
export function indexWord(v: number): string {
  return v < 10 ? 'kaum Schmelze' : v < 30 ? 'schwache Schmelze' : v < 55 ? 'mäßige Schmelze' : v < 80 ? 'starke Schmelze' : 'sehr starke Schmelze';
}

// --- tour -------------------------------------------------------------------------------------------------------------------------------------

export interface TourLine { key: string; title: string; text: string; origin: GlacierOrigin; source: string }
export const TOUR_DISCLAIMER = 'Kein Urteil über Begehbarkeit. Wetter und Zustand am Gletscher als Planungshilfe; Verhältnisse bei Hütte und Bergführern erfragen.';
export function tourLines(_g: GlacierCatalogEntry, _melt: MeltView | null, season: SeasonSummary | null, nowMs: number): TourLine[] {
  const out: TourLine[] = [];
  if (season?.last) {
    const s = season.last;
    const age = Math.floor((nowMs - Date.parse(`${s.date}T12:00:00Z`)) / SHEET_DAY_MS);
    if (age <= GLACIER_SAT_MAX_AGE_DAYS) {
      const t = s.state === 0 ? 'Fläche schneebedeckt; Spalten können verdeckt sein' : s.state === 2 ? 'Fläche ohne Schnee; Eis und Spalten liegen offen' : `Schneegrenze bei ${s.sla != null ? fmtM(s.sla) : '—'}; darunter liegt Eis offen`;
      out.push({ key: 'sat', title: `Zustand der Oberfläche, Satellit ${dateDeLong(s.date)}`, text: t, origin: 'satellite', source: 'Sentinel-2 L2A' });
    }
  }
  return out;
}
const fmtM = (v: number) => `${Math.round(v).toLocaleString('de-DE').replace(/\./g, ' ')} m`;

/** Words the tour tab must never contain: the contract's list, checked over every produced line and the disclaimer. */
export function tourProblems(lines: readonly TourLine[]): string[] {
  const p: string[] = [];
  for (const l of [...lines.map((x) => `${x.title}. ${x.text}`), TOUR_DISCLAIMER]) {
    const bad = glacierForbiddenWords(l);
    if (bad.length) p.push(`${bad.join(', ')} in „${l.slice(0, 60)}“`);
  }
  return p;
}
export { GLACIER_FORBIDDEN_TOUR_WORDS };

// --- sources ----------------------------------------------------------------------------------------------------------------------------------

export interface SourceRow { what: string; origin: GlacierOrigin; stand: string; source: string }
/** Every number on the sheet with its origin and stand; a row exists only for a number that is really shown (nothing listed in advance). */
export function sourceRows(a: {
  g: GlacierCatalogEntry; hasLength: boolean; hasMass: boolean; area: ReturnType<typeof areaChange>; melt: MeltView | null; season: SeasonSummary | null; clima: boolean; proj: boolean; anomaly: boolean;
  mass: MassRow | null; lengthSeries: GlacierSeries | null; nowMs: number;
  /** Phase GH: the elevation-change block, when the glacier has one. */
  elev?: ElevView | null;
  /** Phase GH, second product: mass balance, volume, mass and the yearly series, when the sheet shows them. */
  hug?: HugonnetView | null;
}): SourceRow[] {
  const r: SourceRow[] = [];
  r.push({ what: `Fläche ${a.g.area.km2 >= 1 ? a.g.area.km2.toFixed(2).replace('.', ',') : a.g.area.km2.toFixed(3).replace('.', ',')} km² und Höhen`, origin: 'official', stand: `Bezugsjahr ${a.g.area.refYear}`, source: `Inventar ${a.g.area.source} — ${a.g.zSource}` });
  if (a.area) r.push({ what: `Flächenänderung ${a.area.from[0]} → ${a.area.to[0]}`, origin: 'official', stand: `${a.area.from[0]} und ${a.area.to[0]}`, source: 'Inventare der Länder (SGI / AGI / RGI 6.2)' });
  if (a.hasLength && a.lengthSeries) r.push({ what: 'Längenänderung der Zunge', origin: 'measured', stand: `bis ${a.lengthSeries.rows[a.lengthSeries.rows.length - 1][1]}`, source: a.lengthSeries.source });
  if (a.hasMass && a.mass) r.push({ what: `Massenbilanz ${a.mass.year - 1}/${String(a.mass.year).slice(2)}`, origin: 'measured', stand: String(a.mass.year), source: 'glaziologische Bilanz (GLAMOS / WGMS / FoG)' });
  if (a.season?.last) r.push({ what: 'Schneegrenze, Schneeanteil, AAR, Albedo je Szene', origin: 'satellite', stand: dateDeLong(a.season.last.date), source: 'Sentinel-2 L2A (Copernicus), Maske ≥ 70 % klar' });
  if (a.clima) r.push({ what: 'Band der Schneegrenze 2000–2025 (p10–p90)', origin: 'measured', stand: '2000–2025', source: 'TSLA (Sommer et al., Zenodo 18223929, CC BY 4.0), aus Satellitenbildern' });
  if (a.anomaly) r.push({ what: 'Albedo-Anomalie des Eises', origin: 'satellite', stand: 'eigene Szenen früherer Jahre', source: 'Sentinel-2 L2A, Mittel der Szenen im selben Zeitfenster' });
  if (a.melt) r.push({ what: 'Schmelzindex, Nullgradgrenze, Nächte ohne Frost, Eisanteil', origin: 'model', stand: `Lauf ${dateDeLong(a.melt.runAt.slice(0, 10))} ${a.melt.runAt.slice(11, 16)} UTC`, source: `${a.melt.engine} · Temperaturindex-Modell je 50-m-Band; nicht in mm geeicht (Gate C nicht bestanden)` });
  if (a.elev) r.push({ what: `Höhenänderung der Oberfläche ${a.elev.total.label} und je Fünfjahreszeitraum, mit Unsicherheit (1 σ)`, origin: 'satellite', stand: `${a.elev.total.label} (die Reihe endet ${a.elev.total.to})`, source: `${a.elev.source.attribution} · ${a.elev.source.licence} · Werte unverändert, bezogen auf den Umriss RGI 6.0 (${a.elev.rgi})` });
  if (a.hug) r.push({ what: `Massenbilanz je Fläche, Volumen- und Massenänderung ${a.hug.total.label}, je Jahrzehnt und je Fünfjahreszeitraum${a.hug.series ? ', dazu die aufsummierte Höhenänderung je Jahr' : ''}, mit Unsicherheit (1 σ)`, origin: 'satellite', stand: `${a.hug.total.label} (die Reihe endet ${a.hug.total.to})`, source: `${a.hug.source.attribution} · ${a.hug.source.licence} · Werte unverändert, Volumen und Masse mit der Dichteannahme des Datensatzes (850 kg/m³), bezogen auf den Umriss RGI 6.0 (${a.hug.rgi})` });
  if (a.proj) r.push({ what: 'Volumen bis 2100', origin: 'model', stand: 'Szenarien SSP1-2.6 … SSP5-8.5', source: 'GloGEM, CMIP6 (Zekollari et al. 2024), Spanne über 12 Klimamodelle' });
  return r;
}

export const NOT_USED_SOURCES: ReadonlyArray<{ kind: 'linked' | 'unused'; text: string }> = Object.freeze([
  { kind: 'linked', text: 'Webcams (Rechte vorbehalten): nur verlinkt' },
  { kind: 'unused', text: 'Gletscherseen Österreich (NC-Lizenz): nicht genutzt' },
]);

// --- download: the series of one glacier as CSV (plan §10) ---------------------------------------------------------------------------------

const csvCell = (v: string | number | null): string => { if (v == null) return ''; const t = String(v); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/**
 * CSV of the measured and official series of ONE glacier: long format (one value per row) with the origin, the unit and the source of every series, and the
 * comment block on top naming glacier, retrieval date and where the licences stand. Only series come out (length, mass balance, inventory areas) — no model value.
 */
export function seriesCsv(g: GlacierCatalogEntry, series: readonly GlacierSeries[], retrievedIso: string): string {
  const head = [
    `# Gletscher: ${g.name ?? g.id} (${g.id}), ${g.country}, Klasse ${g.klass}`,
    `# Abgerufen: ${retrievedIso} von buscosun.com/gletscher — Herkunft und Quelle je Reihe in den Spalten; Lizenzen: Steckbrief, Reiter Quellen`,
    '# Längenänderung: Messung der Zunge, ΔL in m je Messjahr. Bilanz: glaziologische Methode in mm Wasseräquivalent. Fläche: Inventare der Länder in km², je mit Bezugsjahr',
  ];
  const rows: string[] = ['reihe,herkunft,einheit,jahr_von,jahr,groesse,wert,quelle'];
  const push = (r: (string | number | null)[]) => rows.push(r.map(csvCell).join(','));
  for (const s of series) {
    if (s.kind === 'length') for (const r of s.rows as number[][]) push(['Länge', s.origin, s.unit, r[0], r[1], 'Längenänderung', r[2], s.source]);
    else if (s.kind === 'mass') for (const r of s.rows as Array<Array<number | null>>) {
      const [y, bw, bs, ba, ela, aar] = r;
      if (bw != null) push(['Massenbilanz', s.origin, 'mm w. e.', null, y, 'Winterbilanz', bw, s.source]);
      if (bs != null) push(['Massenbilanz', s.origin, 'mm w. e.', null, y, 'Sommerbilanz', bs, s.source]);
      if (ba != null) push(['Massenbilanz', s.origin, 'mm w. e.', null, y, 'Jahresbilanz', ba, s.source]);
      if (ela != null) push(['Massenbilanz', s.origin, 'm', null, y, 'Gleichgewichtslinie', ela, s.source]);
      if (aar != null) push(['Massenbilanz', s.origin, '1', null, y, 'AAR', aar, s.source]);
    } else if (s.kind === 'area') for (const r of s.rows as number[][]) push(['Fläche', s.origin, s.unit, null, r[0], 'Fläche (Bezugsjahr)', r[1], s.source]);
  }
  return `${head.join('\n')}\n${rows.join('\n')}\n`;
}
