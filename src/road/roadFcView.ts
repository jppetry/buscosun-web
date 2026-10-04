/**
 * AW-6.1b — View model of the route forecast on the Autobahnwetter page (`audit/autobahnwetter.md` §15). DOM-free, so
 * `verify:road-fc` checks it without a browser. Input is the run file of `road/fc/v1/` (contract `roadFc.ts`).
 *
 * The forecast is WEATHER at the road from buscosun Fusion 8 (air temperature 2 m, dew point, precipitation, wind,
 * cloud cover) — never the road surface. Every text built here names "Luft" or "Prognose"; the road classes
 * (ice, frost, wet, dry) stay reserved for measurements (AW-6.2, Gate D).
 */
import {
  ROAD_FC_INTERPOLATED, roadFcDecode, roadFcFreshness,
  type RoadFcFile, type RoadFcFreshness, type RoadFcPoint, type RoadFcRunEntry,
} from './roadFc';
import type { RoadCorridor } from './roadClient';
import { BAND_REACH_KM, dec, f1, hm, kmIn, shieldText } from './roadView';

const H = 3_600_000;

/** Lead times of the tiles and time chips (design: +1, +3, +6 h). */
export const ROAD_FC_LEADS = [1, 3, 6] as const;

export interface RoadFcValue {
  /** Step index in the run and its valid time (full hour). */
  step: number;
  validMs: number;
  /** Air temperature 2 m °C and its spread (σ, K). */
  t: number;
  ts: number | null;
  td: number | null;
  /** Precipitation probability %, expected amount mm/h, snow share %. */
  pp: number | null;
  rr: number | null;
  sn: number | null;
  /** Wind and gust m/s, direction °, cloud cover %. */
  ff: number | null;
  fx: number | null;
  dd: number | null;
  n: number | null;
  /** The step is interpolated between native steps of the cube (origin code of the contract). */
  interpolated: boolean;
}

type RunShape = Pick<RoadFcFile, 't0Ms' | 'steps'>;

/** Step valid nearest to `ms`; `null` outside the run (before its first hour or after the horizon). */
export function roadFcStep(run: RunShape, ms: number): number | null {
  const i = Math.round((ms - run.t0Ms) / H);
  return i < 0 || i >= run.steps ? null : i;
}

/** The forecast of a point for the hour nearest to `ms`; `null` outside the run or without an air temperature. */
export function roadFcValue(p: RoadFcPoint, run: RunShape, ms: number): RoadFcValue | null {
  const i = roadFcStep(run, ms);
  if (i == null) return null;
  const t = roadFcDecode('t', p.v.t[i]);
  if (t == null) return null;
  const q = p.v.q[i];
  return {
    step: i, validMs: run.t0Ms + i * H, t,
    ts: roadFcDecode('ts', p.v.ts[i]), td: roadFcDecode('td', p.v.td[i]),
    pp: roadFcDecode('pp', p.v.pp[i]), rr: roadFcDecode('rr', p.v.rr[i]), sn: roadFcDecode('sn', p.v.sn[i]),
    ff: roadFcDecode('ff', p.v.ff[i]), fx: roadFcDecode('fx', p.v.fx[i]), dd: roadFcDecode('dd', p.v.dd[i]), n: roadFcDecode('n', p.v.n[i]),
    interpolated: q != null && q >= ROAD_FC_INTERPOLATED,
  };
}

// --- air classes (forecast row of the band, map dots) ---------------------------------------------

/** Forecast AIR temperature in three bands — deliberately other colours and words than the measured road classes. */
export type RoadFcAirClass = 'frost' | 'near' | 'above';
/** Upper edge of the middle band (`set`; the same +3 °C the contract uses for ice codes, E-AW-11). */
export const ROAD_FC_AIR_NEAR_C = 3;
export const roadFcAirClass = (t: number): RoadFcAirClass => (t <= 0 ? 'frost' : t <= ROAD_FC_AIR_NEAR_C ? 'near' : 'above');
export const ROAD_FC_AIR_COLOR: Readonly<Record<RoadFcAirClass, string>> = Object.freeze({ frost: '#2F5F9E', near: '#8FB4DB', above: '#A89F86' });
export const ROAD_FC_AIR_LABEL: Readonly<Record<RoadFcAirClass, string>> = Object.freeze({
  frost: 'Luft ≤ 0 °C', near: `Luft bis +${ROAD_FC_AIR_NEAR_C} °C`, above: `Luft über +${ROAD_FC_AIR_NEAR_C} °C`,
});

/** Precipitation is marked in the band from this probability on (`set`). */
export const ROAD_FC_PRECIP_PP = 50;
/** Below this probability the text says only "Niederschlag x %" (`set`). */
export const ROAD_FC_PRECIP_NAME_PP = 30;
export type RoadFcPrecipKind = 'Regen' | 'Schneeregen' | 'Schnee';
/** Kind from the snow share of buscosun Fusion (wet-bulb phase): ≥ 70 % snow, 30–70 % sleet, else rain (`set`). */
export function roadFcPrecipKind(sn: number | null): RoadFcPrecipKind {
  return sn != null && sn >= 70 ? 'Schnee' : sn != null && sn >= 30 ? 'Schneeregen' : 'Regen';
}
export type RoadFcPrecipMark = 'none' | 'rain' | 'snow';
export function roadFcPrecipMark(v: Pick<RoadFcValue, 'pp' | 'sn'>): RoadFcPrecipMark {
  if (v.pp == null || v.pp < ROAD_FC_PRECIP_PP) return 'none';
  return roadFcPrecipKind(v.sn) === 'Regen' ? 'rain' : 'snow';
}
/** `Regen 60 % · 0,4 mm` / `Niederschlag 10 %` / `—`. */
export function roadFcPrecipText(v: Pick<RoadFcValue, 'pp' | 'rr' | 'sn'>): string {
  if (v.pp == null) return '—';
  if (v.pp < ROAD_FC_PRECIP_NAME_PP) return `Niederschlag ${Math.round(v.pp)} %`;
  return `${roadFcPrecipKind(v.sn)} ${Math.round(v.pp)} %${v.rr != null && v.rr >= 0.1 ? ` · ${dec(v.rr)} mm` : ''}`;
}
/** `Luft +1,2 °C · Regen 60 %` — the one-line forecast of a point (arrival rows, callout). */
export function roadFcLine(v: RoadFcValue): string {
  return `Luft ${f1(v.t)} °C · ${roadFcPrecipText(v)}`;
}
export function roadFcWindText(v: Pick<RoadFcValue, 'ff' | 'fx'>): string {
  if (v.ff == null && v.fx == null) return '—';
  return `${v.ff != null ? Math.round(v.ff * 3.6) : '—'} / ${v.fx != null ? Math.round(v.fx * 3.6) : '—'} km/h`;
}

// --- run ------------------------------------------------------------------------------------------

export interface RoadFcRunView {
  freshness: RoadFcFreshness;
  /** Forecast may be shown (`live` or `stale`). */
  usable: boolean;
  issuedMs: number;
  /** `Lauf 11:05` / `Lauf 08:05 · veraltet`. */
  label: string;
}

export function roadFcRunView(run: Pick<RoadFcRunEntry, 'issuedAt'> | null, nowMs: number): RoadFcRunView {
  const issuedMs = run ? Date.parse(run.issuedAt) : NaN;
  const freshness = roadFcFreshness(issuedMs, nowMs);
  return {
    freshness, usable: freshness !== 'dead', issuedMs,
    label: freshness === 'dead' ? 'keine Prognose' : `Lauf ${hm(issuedMs)}${freshness === 'stale' ? ' · veraltet' : ''}`,
  };
}

// --- band -----------------------------------------------------------------------------------------

export interface RoadFcCell {
  /** Axis point id (`<corridor>@<km>`). */
  id: string;
  /** Km of the point and of the cell edges, in the chosen direction. */
  km: number;
  fromKm: number;
  toKm: number;
  cls: RoadFcAirClass | 'gap';
  mark: RoadFcPrecipMark;
  value: RoadFcValue | null;
}

export const roadFcAxisPoints = (file: Pick<RoadFcFile, 'points'>) => file.points.filter((p) => p.kind === 'axis' && p.km != null);

/**
 * Forecast row of the band: one cell per axis point (every 5 km), reaching to the midpoint towards its neighbours but
 * never farther than `reachKm` — a lost point leaves a hole instead of stretching its neighbours over it.
 */
export function roadFcBand(c: Pick<RoadCorridor, 'lengthKm'>, file: Pick<RoadFcFile, 'points' | 't0Ms' | 'steps'>, dir: 0 | 1, ms: number, reachKm = 5): RoadFcCell[] {
  const pts = roadFcAxisPoints(file).map((p) => ({ p, km: kmIn(c as RoadCorridor, p.km as number, dir) })).sort((a, b) => a.km - b.km);
  return pts.map(({ p, km }, i) => {
    const prev = pts[i - 1]?.km, next = pts[i + 1]?.km;
    const fromKm = Math.max(0, prev == null ? km - reachKm : Math.max((prev + km) / 2, km - reachKm));
    const toKm = Math.min(c.lengthKm, next == null ? km + reachKm : Math.min((km + next) / 2, km + reachKm));
    const value = roadFcValue(p, file, ms);
    return { id: p.id, km, fromKm, toKm, cls: value ? roadFcAirClass(value.t) : 'gap' as const, mark: value ? roadFcPrecipMark(value) : 'none' as const, value };
  });
}

/** `A 8 · km 70` — display name of an axis point in the chosen direction. */
export function roadFcAxisName(c: Pick<RoadCorridor, 'road' | 'lengthKm'>, p: Pick<RoadFcPoint, 'km'>, dir: 0 | 1): string {
  return `${shieldText(c.road)} · km ${dec(kmIn(c as RoadCorridor, p.km ?? 0, dir), 0)}`;
}
export const isRoadFcAxisId = (id: string | null | undefined): id is string => !!id && id.includes('@');

/** Default forecast point of a corridor without a selectable station: the coldest forecast air at `ms`. */
export function defaultRoadFcAxis(file: Pick<RoadFcFile, 'points' | 't0Ms' | 'steps'>, ms: number): RoadFcPoint | null {
  let best: { p: RoadFcPoint; t: number } | null = null;
  for (const p of roadFcAxisPoints(file)) {
    const v = roadFcValue(p, file, ms);
    if (v && (!best || v.t < best.t)) best = { p, t: v.t };
  }
  return best?.p ?? roadFcAxisPoints(file)[0] ?? null;
}

// --- tiles, chart, arrival -------------------------------------------------------------------------

export interface RoadFcTile { leadH: number; value: RoadFcValue | null }
export function roadFcTiles(p: RoadFcPoint | null, run: RunShape | null, nowMs: number): RoadFcTile[] {
  return ROAD_FC_LEADS.map((leadH) => ({ leadH, value: p && run ? roadFcValue(p, run, nowMs + leadH * H) : null }));
}

/** Hourly air temperature and dew point between two times (chart): `[hours from refMs, t, td]`. */
export function roadFcSeries(p: RoadFcPoint, run: RunShape, refMs: number, fromH: number, toH: number): Array<[number, number, number | null]> {
  const out: Array<[number, number, number | null]> = [];
  for (let i = 0; i < run.steps; i++) {
    const dh = (run.t0Ms + i * H - refMs) / H;
    if (dh < fromH || dh > toH) continue;
    const t = roadFcDecode('t', p.v.t[i]);
    if (t != null) out.push([dh, t, roadFcDecode('td', p.v.td[i])]);
  }
  return out;
}

/** Axis points that stand in for a missing measurement in the route table: farther than the band reach from every
 *  station, on a full 10 km (`set`: a 100-km gap gives ten rows, not twenty). */
export function roadFcGapPoints(c: Pick<RoadCorridor, 'stations'>, file: Pick<RoadFcFile, 'points'>): RoadFcPoint[] {
  return roadFcAxisPoints(file).filter((p) => {
    const km = p.km as number;
    return Math.round(km) % 10 === 0 && c.stations.every((s) => Math.abs(s.km - km) > BAND_REACH_KM);
  });
}

export interface RoadFcTrip {
  /** Rows with a forecast for their arrival hour. */
  n: number;
  coldest: { km: number; value: RoadFcValue } | null;
  /** Rows with precipitation probability ≥ `ROAD_FC_PRECIP_PP`. */
  wet: number;
  snow: number;
}
/** Summary over the arrival forecasts of a trip (briefing sentence). */
export function roadFcTrip(rows: ReadonlyArray<{ km: number; value: RoadFcValue | null }>): RoadFcTrip {
  const out: RoadFcTrip = { n: 0, coldest: null, wet: 0, snow: 0 };
  for (const r of rows) {
    if (!r.value) continue;
    out.n++;
    if (!out.coldest || r.value.t < out.coldest.value.t) out.coldest = { km: r.km, value: r.value };
    const m = roadFcPrecipMark(r.value);
    if (m !== 'none') out.wet++;
    if (m === 'snow') out.snow++;
  }
  return out;
}
export function roadFcTripText(trip: RoadFcTrip): string {
  if (!trip.coldest) return '';
  const c = trip.coldest;
  const rain = trip.wet === 0 ? `an keinem Punkt Niederschlag ab ${ROAD_FC_PRECIP_PP} %`
    : `an ${trip.wet} von ${trip.n} Punkten Niederschlag ab ${ROAD_FC_PRECIP_PP} %${trip.snow ? ` (${trip.snow} mit Schnee-Anteil)` : ''}`;
  return `Prognose zur Ankunft: kälteste Luft ${f1(c.value.t)} °C bei km ${dec(c.km, 0)} gegen ${hm(c.value.validMs)}, ${rain}.`;
}

/** Shown wherever the forecast appears — the limits of the product in one sentence. */
export const ROAD_FC_UI_NOTE = 'Prognose: buscosun Fusion 8, Wetter an der Strecke (Luft in 2 m, Niederschlag, Wind) — keine Prognose der Fahrbahn.';
