/**
 * Phase HZS (`audit/hoehen-zeit-schnitt.md`): the height-time section at a point — pure model, no DOM, no network.
 *
 * Everything here only READS buscosun Fusion (`PointForecastV2` + `cube.cells`); nothing is re-fused:
 *   - snowfall line = `vars.snowline` (p50 = most likely line, p10/p90 = band) at the NATIVE cube steps (E-HZS-3);
 *     interpolated hours, station hours and the climatology tail carry none ⇒ gap, never bridged.
 *   - precipitation columns = `vars.precip.mean` over the interval of its native step (t1 1 h, t2 3 h, t3 6 h), never
 *     spread over hours (same decomposition as `precipChance/chanceSeries.ts`); phase from `vars.pSnow` (E-HZS-5).
 *   - freezing level = derived OUTSIDE buscosun Fusion from the cube's T925/T850/T700 at the point, level heights
 *     hypsometric above h_true with Fusion's own t2m/ps there (E-HZS-4); above 700 hPa nothing is extrapolated.
 */

import type { PointForecastV2, StepV2 } from '../../pointForecast/fusion/output';
import type { Dist } from '../../pointForecast/fusion/dist';
import { phaseLabel, type PhaseLabel } from '../../pointForecast/fusion/meteo';
import { hypsometricHeight } from '../../point/profileColumn';

const H = 3_600_000;

export type HzsRangeH = 48 | 336;
export const HZS_RANGES: readonly HzsRangeH[] = [48, 336];
/** Display convention (`set`): height axis 0 … 4 000 m, raised to 5 000 m only where the place or the ridge needs it. */
export const HZS_Y_MAX_M = 4000;
/** Display convention (`set`): "hardly any precipitation" below this P(wet) around the crossing (E-HZS-6). */
export const HZS_DRY_P = 0.3;
/** Window (h) around the crossing in which P(wet) is looked at for the dry note. */
export const HZS_DRY_WINDOW_H = 3;
/** A pressure level only counts at least this far above the ground (same rule as `pressureProfileFromCell`). */
export const HZS_MIN_ABOVE_GROUND_HPA = 10;
export const HZS_LEVELS_HPA = [925, 850, 700] as const;

type CubeTier = 't1' | 't2' | 't3';
type ColTier = CubeTier | 'station' | 'clima';
const STEP_H: Record<ColTier, number> = { t1: 1, t2: 3, t3: 6, station: 1, clima: 1 };

export interface SnowPoint {
  tMs: number;
  tier: CubeTier;
  /** `null` = no value at this native step (gap). */
  p50: number | null;
  p10: number | null;
  p90: number | null;
  sigmaKind: string | null;
}

export interface Column {
  /** Free part the column stands over. */
  fromMs: number;
  toMs: number;
  /** Interval of the step the value belongs to. */
  stepFromMs: number;
  stepToMs: number;
  tier: ColTier;
  /** Expected rate (mm/h) over the step; `null` = gap. */
  mmh: number | null;
  /** P(wet) of the step (`null` without a distribution). */
  pWet: number | null;
  /** P(snow | precipitation); `null` = phase unknown. */
  pSnow: number | null;
  phase: PhaseLabel | null;
}

export type FreezeState = 'ok' | 'ground' | 'above' | 'none';
export interface FreezePoint {
  tMs: number;
  tier: CubeTier;
  state: FreezeState;
  /** ok: height of the 0 °C crossing; ground: h_true; above: height of the highest level used (no data above); none: null. */
  m: number | null;
}

export interface TerrainStats {
  radiusKm: number;
  zoom: number;
  n: number;
  minM: number;
  p10M: number;
  p50M: number;
  p90M: number;
  maxM: number;
}

export interface CellRowIn { validAtMs: number; tier: string; v: Record<string, number | null> }

export interface HeightTimeModel {
  fromMs: number;
  toMs: number;
  rangeH: HzsRangeH;
  hTrue: number | null;
  yMaxM: number;
  snow: SnowPoint[];
  columns: Column[];
  freeze: FreezePoint[];
  terrain: TerrainStats | null;
  /** Time ranges inside the window without any snowfall line (for the hatched gap). */
  snowGaps: Array<[number, number]>;
  sentence: SnowSentence;
  /** Largest column rate in the window (mm/h), for the column scale. */
  maxMmH: number;
}

type Exceed = (d: Dist, x: number) => number;

const isCubeTier = (t: string): t is CubeTier => t === 't1' || t === 't2' || t === 't3';

/** Native cube steps of the snowfall line in [fromMs, toMs] — values and gaps. */
export function snowPointsFromV2(v2: PointForecastV2, fromMs: number, toMs: number): SnowPoint[] {
  const out: SnowPoint[] = [];
  for (const s of v2.axis.steps) {
    if (s.interpolated || !isCubeTier(s.tier) || s.validAtMs < fromMs || s.validAtMs > toMs) continue;
    const v = s.vars.snowline;
    const ok = (x: number | null | undefined) => (x != null && Number.isFinite(x) ? x : null);
    const p50 = ok(v?.p50);
    out.push({
      tMs: s.validAtMs, tier: s.tier, p50,
      p10: p50 == null ? null : ok(v?.p10), p90: p50 == null ? null : ok(v?.p90),
      sigmaKind: v?.sigmaKind ?? null,
    });
  }
  return out.sort((a, b) => a.tMs - b.tMs);
}

/** Runs of consecutive native points with a value (the line is drawn per run, never across a gap). */
export function snowRuns(points: readonly SnowPoint[], key: 'p50' | 'band' = 'p50'): SnowPoint[][] {
  const runs: SnowPoint[][] = [];
  let cur: SnowPoint[] = [];
  for (const p of points) {
    const has = key === 'p50' ? p.p50 != null : p.p10 != null && p.p90 != null;
    if (has) cur.push(p);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** Window parts not covered by any snowfall value (a single point covers the interval of its step). */
export function snowGapsOf(points: readonly SnowPoint[], fromMs: number, toMs: number): Array<[number, number]> {
  const covered: Array<[number, number]> = [];
  for (const run of snowRuns(points)) {
    const first = run[0], last = run[run.length - 1];
    covered.push([Math.max(fromMs, first.tMs - STEP_H[first.tier] * H), Math.min(toMs, last.tMs)]);
  }
  const gaps: Array<[number, number]> = [];
  let cur = fromMs;
  for (const [a, b] of covered.sort((x, y) => x[0] - y[0])) {
    if (a > cur) gaps.push([cur, a]);
    cur = Math.max(cur, b);
  }
  if (cur < toMs) gaps.push([cur, toMs]);
  return gaps.filter(([a, b]) => b - a >= H);
}

/** Precipitation columns over [fromMs, toMs): cube tiers first, then station hours, then the climatology tail; gaps as `mmh: null`. */
export function columnsFromV2(v2: PointForecastV2, fromMs: number, toMs: number, exceed: Exceed | null): Column[] {
  const usable = v2.axis.steps.filter((s) => !s.interpolated && s.vars.precip?.mean != null && Number.isFinite(s.vars.precip.mean));
  const taken: Array<[number, number]> = [];
  const cols: Column[] = [];
  const free = (a: number, b: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let cur = a;
    for (const [x, y] of [...taken].sort((p, q) => p[0] - q[0])) {
      if (y <= cur) continue;
      if (x >= b) break;
      if (x > cur) out.push([cur, Math.min(x, b)]);
      cur = Math.max(cur, y);
      if (cur >= b) break;
    }
    if (cur < b) out.push([cur, b]);
    return out;
  };
  const claim = (s: StepV2, tier: ColTier) => {
    const sa = s.validAtMs - STEP_H[tier] * H, sb = s.validAtMs;
    const a = Math.max(fromMs, sa), b = Math.min(toMs, sb);
    if (b <= a) return;
    const parts = free(a, b);
    if (!parts.length) return;
    const pr = s.vars.precip!;
    const pw = pr.dist && exceed ? exceed(pr.dist, 0) : null;
    const ps = s.vars.pSnow?.p50 ?? s.vars.pSnow?.mean ?? null;
    const pSnow = ps != null && Number.isFinite(ps) ? Math.max(0, Math.min(1, ps)) : null;
    for (const [x, y] of parts) {
      cols.push({
        fromMs: x, toMs: y, stepFromMs: sa, stepToMs: sb, tier,
        mmh: Math.max(0, pr.mean as number), pWet: pw != null && Number.isFinite(pw) ? Math.max(0, Math.min(1, pw)) : null,
        pSnow, phase: pSnow == null ? null : phaseLabel(pSnow),
      });
      taken.push([x, y]);
    }
  };
  for (const t of ['t1', 't2', 't3', 'station', 'clima'] as const) for (const s of usable) if (s.tier === t) claim(s, t);
  for (const [x, y] of free(fromMs, toMs)) cols.push({ fromMs: x, toMs: y, stepFromMs: x, stepToMs: y, tier: 'clima', mmh: null, pWet: null, pSnow: null, phase: null });
  return cols.sort((a, b) => a.fromMs - b.fromMs);
}

/**
 * The freezing level of one native step (E-HZS-4): column [h_true (t2m), 925, 850, 700 hPa above ground], heights
 * hypsometric above h_true with Fusion's t2m and ps there, the first warm → cold crossing from below, linear in z.
 */
export function freezingLevel(hTrue: number, t2m: number, ps: number, t: Partial<Record<(typeof HZS_LEVELS_HPA)[number], number | null>>): { state: FreezeState; m: number | null } {
  if (![hTrue, t2m, ps].every(Number.isFinite)) return { state: 'none', m: null };
  if (t2m <= 0) return { state: 'ground', m: hTrue };
  const col: Array<{ z: number; t: number }> = [{ z: hTrue, t: t2m }];
  for (const lev of HZS_LEVELS_HPA) {
    const tp = t[lev];
    if (tp == null || !Number.isFinite(tp) || ps - lev < HZS_MIN_ABOVE_GROUND_HPA) continue;
    col.push({ z: hypsometricHeight(hTrue, ps, t2m, tp, lev), t: tp });
  }
  col.sort((a, b) => a.z - b.z);
  if (col.length < 2) return { state: 'none', m: null };
  for (let i = 0; i + 1 < col.length; i++) {
    const a = col[i], b = col[i + 1];
    if (a.t > 0 && b.t <= 0) return { state: 'ok', m: a.z + (a.t / (a.t - b.t)) * (b.z - a.z) };
  }
  return { state: 'above', m: col[col.length - 1].z };
}

/** Freezing level at every native cube step with cells in [fromMs, toMs]. */
export function freezeFromCells(v2: PointForecastV2, cells: readonly CellRowIn[], fromMs: number, toMs: number): FreezePoint[] {
  const hTrue = v2.point.hTrue;
  const byT = new Map<number, StepV2>();
  for (const s of v2.axis.steps) if (!s.interpolated) byT.set(s.validAtMs, s);
  const out: FreezePoint[] = [];
  for (const c of cells) {
    if (!isCubeTier(c.tier) || c.validAtMs < fromMs || c.validAtMs > toMs) continue;
    const s = byT.get(c.validAtMs);
    const t2m = s?.vars.t2m?.p50, ps = s?.vars.ps?.p50;
    const r = hTrue == null || t2m == null || ps == null
      ? { state: 'none' as const, m: null }
      : freezingLevel(hTrue, t2m, ps, { 925: c.v.t925, 850: c.v.t850, 700: c.v.t700 });
    out.push({ tMs: c.validAtMs, tier: c.tier, ...r });
  }
  return out.sort((a, b) => a.tMs - b.tMs);
}

/** Terrain statistics of elevation samples (already restricted to the disc); `null` without enough samples. */
export function terrainStatsOf(samples: readonly number[], radiusKm: number, zoom: number): TerrainStats | null {
  const xs = samples.filter((x) => Number.isFinite(x)).map((x) => Math.max(0, x)).sort((a, b) => a - b);
  if (xs.length < 20) return null;
  const q = (p: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.round(p * (xs.length - 1))))];
  return { radiusKm, zoom, n: xs.length, minM: xs[0], p10M: q(0.1), p50M: q(0.5), p90M: q(0.9), maxM: xs[xs.length - 1] };
}

// ---------------------------------------------------------------------------
// Sentence "Schnee bis zu dir ab …" (E-HZS-6)

const TZ = 'Europe/Berlin';
const FMT_WD = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, weekday: 'short' });
const FMT_HM = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const FMT_DAY = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, day: 'numeric', month: 'numeric' });
/** "Do" (no trailing dot). */
export const weekdayShort = (ms: number) => FMT_WD.format(ms).replace('.', '');
export const clockHM = (ms: number) => FMT_HM.format(ms);
/** "Do 03:00". */
export const dayClock = (ms: number) => `${weekdayShort(ms)} ${clockHM(ms)}`;
const FMT_D = new Intl.DateTimeFormat('de-DE', { timeZone: TZ, day: 'numeric' });
/** "Do 10." (time axis, short). */
export const dayShortDate = (ms: number) => `${weekdayShort(ms)} ${FMT_D.format(ms)}${FMT_D.format(ms).endsWith('.') ? '' : '.'}`;
/** "Do 10.10." */
export const dayDate = (ms: number) => `${weekdayShort(ms)} ${FMT_DAY.format(ms)}`;
/** Thousands with a narrow no-break space, German style ("1 840"). */
export const fmtM = (m: number) => Math.round(m).toLocaleString('de-DE').replace(/\./g, ' ');

export type SnowSentence =
  | { kind: 'no-height'; text: string }
  | { kind: 'no-data'; text: string }
  | { kind: 'already'; text: string; atMs: number; dry: boolean }
  | { kind: 'reaches'; text: string; atMs: number; earlyMs: number | null; lateMs: number | null; band: 'full' | 'early-only' | 'none'; dry: boolean }
  | { kind: 'possible'; text: string; atMs: number; dry: boolean }
  | { kind: 'stays-above'; text: string; minM: number; minAtMs: number };

/** max P(wet) of the columns within ± `HZS_DRY_WINDOW_H` around `tMs` (`null` = no distribution there). */
export function wetAround(columns: readonly Column[], tMs: number): number | null {
  let best: number | null = null;
  for (const c of columns) {
    if (c.toMs <= tMs - HZS_DRY_WINDOW_H * H || c.fromMs >= tMs + HZS_DRY_WINDOW_H * H || c.pWet == null) continue;
    best = best == null ? c.pWet : Math.max(best, c.pWet);
  }
  return best;
}

/** A second time next to the main one: clock only within 24 h of it, otherwise with the weekday. */
const near = (ms: number, refMs: number) => (Math.abs(ms - refMs) < 24 * H ? clockHM(ms) : dayClock(ms));

export function snowSentence(points: readonly SnowPoint[], hTrue: number | null, columns: readonly Column[]): SnowSentence {
  if (hTrue == null || !Number.isFinite(hTrue)) return { kind: 'no-height', text: 'Ortshöhe unbekannt — kein Vergleich mit der Schneefallgrenze.' };
  const vals = points.filter((p) => p.p50 != null);
  if (!vals.length) return { kind: 'no-data', text: 'Keine Schneefallgrenze von buscosun Fusion in diesem Zeitraum.' };
  const dryAt = (t: number) => { const w = wetAround(columns, t); return w != null && w < HZS_DRY_P; };
  const dryNote = (t: number) => (dryAt(t) ? ' — aber kaum Niederschlag' : '');
  const at = vals.find((p) => (p.p50 as number) <= hTrue);
  if (at && at === vals[0]) {
    return { kind: 'already', atMs: at.tMs, dry: dryAt(at.tMs), text: `Schneefallgrenze liegt schon auf deiner Höhe${dryNote(at.tMs)}` };
  }
  if (at) {
    const early = vals.find((p) => p.p10 != null && p.p10 <= hTrue && p.tMs <= at.tMs) ?? null;
    const late = vals.find((p) => p.p90 != null && p.p90 <= hTrue) ?? null;
    const hasBand = vals.some((p) => p.p10 != null && p.p90 != null && Math.abs(p.tMs - at.tMs) <= 6 * H);
    const band: 'full' | 'early-only' | 'none' = !hasBand ? 'none' : late ? 'full' : 'early-only';
    const range = band === 'none' ? ' (ohne Spanne)'
      : band === 'full' ? ` (zwischen ${near((early ?? at).tMs, at.tMs)} und ${near(late!.tMs, at.tMs)})`
        : ` (frühestens ${near((early ?? at).tMs, at.tMs)})`;
    return {
      kind: 'reaches', atMs: at.tMs, earlyMs: early?.tMs ?? null, lateMs: late?.tMs ?? null, band, dry: dryAt(at.tMs),
      text: `Schnee bis zu dir ab ${dayClock(at.tMs)}${range}${dryNote(at.tMs)}`,
    };
  }
  const possible = vals.find((p) => p.p10 != null && p.p10 <= hTrue);
  if (possible) {
    return { kind: 'possible', atMs: possible.tMs, dry: dryAt(possible.tMs), text: `Schnee bis zu dir möglich ab ${dayClock(possible.tMs)} (untere Grenze); wahrscheinlich bleibt die Grenze über dir${dryNote(possible.tMs)}` };
  }
  const lo = vals.reduce((m, p) => ((p.p50 as number) < (m.p50 as number) ? p : m), vals[0]);
  return { kind: 'stays-above', minM: lo.p50 as number, minAtMs: lo.tMs, text: `Schneefallgrenze bleibt über dir (tiefster Wert ≈ ${fmtM(lo.p50 as number)} m, ${dayClock(lo.tMs)})` };
}

// ---------------------------------------------------------------------------

export function buildHeightTime(input: {
  v2: PointForecastV2;
  cells: readonly CellRowIn[] | null;
  terrain: TerrainStats | null;
  nowMs: number;
  rangeH: HzsRangeH;
  exceed: Exceed | null;
}): HeightTimeModel {
  const { v2, terrain, rangeH } = input;
  const fromMs = Math.floor(input.nowMs / H) * H;
  const toMs = fromMs + rangeH * H;
  const hTrue = v2.point.hTrue != null && Number.isFinite(v2.point.hTrue) ? v2.point.hTrue : null;
  const snow = snowPointsFromV2(v2, fromMs, toMs);
  const columns = columnsFromV2(v2, fromMs, toMs, input.exceed);
  const freeze = input.cells ? freezeFromCells(v2, input.cells, fromMs, toMs) : [];
  const needs = Math.max(hTrue ?? 0, terrain?.maxM ?? 0);
  const yMaxM = needs > HZS_Y_MAX_M - 200 ? 5000 : HZS_Y_MAX_M;
  const maxMmH = columns.reduce((m, c) => Math.max(m, c.mmh ?? 0), 0);
  return {
    fromMs, toMs, rangeH, hTrue, yMaxM, snow, columns, freeze, terrain,
    snowGaps: snowGapsOf(snow, fromMs, toMs),
    sentence: snowSentence(snow, hTrue, columns),
    maxMmH,
  };
}

// ---------------------------------------------------------------------------
// Per-hour readout (hover / tap) and the screen-reader text

export interface HourInfo {
  tMs: number;
  snow: SnowPoint | null;
  column: Column | null;
  freeze: FreezePoint | null;
}

/** Values valid at `tMs`: the native step whose interval contains it (a 3-h value stands for its 3 h). */
export function infoAt(m: HeightTimeModel, tMs: number): HourInfo {
  const inStep = <T extends { tMs: number; tier: CubeTier }>(xs: readonly T[]) =>
    xs.find((p) => tMs > p.tMs - STEP_H[p.tier] * H && tMs <= p.tMs) ?? null;
  return {
    tMs,
    snow: inStep(m.snow),
    column: m.columns.find((c) => tMs >= c.fromMs && tMs < c.toMs) ?? null,
    freeze: inStep(m.freeze),
  };
}

const PHASE_WORD: Record<PhaseLabel, string> = { rain: 'Regen', sleet: 'Schneeregen', snow: 'Schnee' };
export const phaseWord = (p: PhaseLabel | null) => (p ? PHASE_WORD[p] : 'Phase unbekannt');
export const fmtMmH = (x: number) => `${(Math.round(x * 10) / 10).toString().replace('.', ',')} mm/h`;

export function srText(m: HeightTimeModel, place: string, fusionName: string): string {
  const parts: string[] = [];
  parts.push(`Höhen-Zeit-Schnitt für ${place}, ${m.rangeH === 48 ? 'nächste 48 Stunden' : 'nächste 14 Tage'}.`);
  parts.push(m.hTrue != null ? `Ortshöhe ${fmtM(m.hTrue)} m.` : 'Ortshöhe unbekannt.');
  if (m.terrain) parts.push(`Gelände im Umkreis von ${m.terrain.radiusKm} km: Tal ${fmtM(m.terrain.minM)} m, Grat ${fmtM(m.terrain.maxM)} m.`);
  const vals = m.snow.filter((p) => p.p50 != null);
  if (vals.length) {
    const lo = vals.reduce((a, p) => ((p.p50 as number) < (a.p50 as number) ? p : a), vals[0]);
    const hi = vals.reduce((a, p) => ((p.p50 as number) > (a.p50 as number) ? p : a), vals[0]);
    parts.push(`Schneefallgrenze (${fusionName}) zwischen ${fmtM(lo.p50 as number)} m (${dayClock(lo.tMs)}) und ${fmtM(hi.p50 as number)} m (${dayClock(hi.tMs)}).`);
    const lastMs = vals[vals.length - 1].tMs;
    if (lastMs < m.toMs - 6 * H) parts.push(`Nach ${dayClock(lastMs)} liefert buscosun Fusion keine Schneefallgrenze.`);
  }
  parts.push(`${m.sentence.text}.`);
  const fz = m.freeze.filter((f) => f.state === 'ok' && f.m != null);
  if (fz.length) {
    const ms = fz.map((f) => f.m as number);
    parts.push(`Nullgradgrenze zwischen ${fmtM(Math.min(...ms))} und ${fmtM(Math.max(...ms))} m.`);
  }
  if (m.freeze.some((f) => f.state === 'above')) parts.push('Zeitweise liegt die Nullgradgrenze über der höchsten Druckfläche (etwa 3 000 m).');
  const wet = m.columns.filter((c) => c.mmh != null && c.mmh >= 0.1);
  if (wet.length) {
    const sum = wet.reduce((s, c) => s + (c.mmh as number) * (c.toMs - c.fromMs) / H, 0);
    const snowH = wet.filter((c) => c.phase === 'snow').reduce((s, c) => s + (c.toMs - c.fromMs) / H, 0);
    parts.push(`Niederschlag in Summe etwa ${(Math.round(sum * 10) / 10).toString().replace('.', ',')} mm${snowH > 0 ? `, davon ${Math.round(snowH)} Stunden als Schnee` : ''}.`);
  } else parts.push('Kaum Niederschlag erwartet.');
  return parts.join(' ');
}
