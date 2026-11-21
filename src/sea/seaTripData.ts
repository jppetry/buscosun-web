/**
 * Phase AM — what the leg reads (`audit/seewetter-ausfahrt.md` §1.2, E-AM-2). Three readers, each answering "keine
 * Daten" (`null`) instead of a substitute:
 *
 *   wind    buscosun Fusion at a sample point: the client's cube path, called exactly as the producer of the spot wind
 *           calls it (`sea-derive.mjs`: `country: 'DE'`, no radar). Switched by the part `sea` of `FUSION_PARTS`. There
 *           is NO live path behind it — a point outside the cube, a failed read or `?pf=live` is "keine Daten", never
 *           the wind of a spot and never another model.
 *   wave    the CWAM field of the full hour (`loadField`), sampled at the position (`sampleField`); beyond +48 h the
 *           field exists only every third hour ⇒ the hours between have no value.
 *   current the u/v field of the BSH for the full hour (`loadCurrentUv`), sampled at the position (`sampleUv`).
 *
 * The point modules are imported dynamically: the Seewetter chunk stays free of them until a leg is planned.
 */
import { decodeSpotValue, encodeSpotValue, sanitizeGust, seaFieldStepAt } from './seaContract';
import { loadCurrentUv, loadField, type SeaFieldImage } from './seaClient';
import { MS_TO_KN, currentUvHour, currentUvXY, type SeaCurrentDoc, type SeaUvGrid } from './seaCurrent';
import { sampleUv, type Flow } from './seaRipples';
import { sampleField } from './seaView';
import { planDistKm, type PlanPos } from './seaPlanner';
import { sightConvAt, type SeaSightData } from './seaSight';
import { SEA_TRIP_CONV_KM, type TripConv, type TripCur, type TripData, type TripSample, type TripWave, type TripWind } from './seaTrip';
import type { SeaSpot } from './seaContract';

const H = 3_600_000;
/** Hours asked of buscosun Fusion per sample point: the page's axis (the wave run's 79 hours, +1 for the arrival's hour). */
export const SEA_TRIP_FUSION_HOURS = 80;
const WIND_TTL_MS = 10 * 60_000;

// --- Wind: buscosun Fusion at the sample points ---------------------------------------------------------------------

export type TripWindSeries = Map<number, TripWind>;
export interface TripWindLoad { series: TripWindSeries | null; /** Why there is none. */ why: 'outside' | 'off' | 'error' | null }

interface FusionStep { validAtMs: number; vars?: Record<string, { mean?: number | null } | undefined> }
/** The engine's steps → hour ⇒ wind, gust, direction, in the coding of the spot series (0.1 m/s, a gust below the wind dropped). */
export function windSeriesOfSteps(steps: readonly FusionStep[] | null | undefined): TripWindSeries | null {
  const list = (steps ?? []).filter((s) => Number.isFinite(s?.validAtMs) && s.validAtMs % H === 0);
  const cols = {
    wind: list.map((s) => encodeSpotValue('wind', s.vars?.wind?.mean)),
    gust: list.map((s) => encodeSpotValue('gust', s.vars?.gust?.mean)),
  };
  sanitizeGust(cols);
  const out: TripWindSeries = new Map();
  list.forEach((s, i) => {
    if (cols.wind[i] == null) return;
    out.set(s.validAtMs, { windMs: decodeSpotValue('wind', cols.wind[i]), gustMs: decodeSpotValue('gust', cols.gust[i]), windDir: decodeSpotValue('windDir', encodeSpotValue('windDir', s.vars?.windDir?.mean)) });
  });
  return out.size ? out : null;
}

const windCache = new Map<string, { at: number; p: Promise<TripWindLoad> }>();
let chain: Promise<unknown> = Promise.resolve();
/**
 * buscosun Fusion at one position (E-AM-2). One point after the other (the first one loads index and tables, the others
 * mostly reuse them — §1.2), each answer kept for ten minutes. Never rejects.
 */
export function loadTripWind(pos: PlanPos, country: 'DE' | 'AT' | 'CH' = 'DE'): Promise<TripWindLoad> {
  // Phase BS: on a lake the country parameters of the lake's land (the coast: Germany, as before — the key is unchanged there).
  const key = `${pos.lat.toFixed(4)},${pos.lon.toFixed(4)}${country === 'DE' ? '' : `|${country}`}`;
  const hit = windCache.get(key);
  if (hit && Date.now() - hit.at < WIND_TTL_MS) return hit.p;
  const p = (chain = chain.then(async (): Promise<TripWindLoad> => {
    try {
      const [{ getPointForecast }, { fusionPathFor }] = await Promise.all([import('../pointForecast/pointForecast'), import('../pointForecast/fusionForecast'), import('../pointForecast/cubeSource')]);
      if (fusionPathFor('sea', typeof window !== 'undefined' ? window.location?.search ?? '' : '') !== 'cube') return { series: null, why: 'off' };
      const fc = await getPointForecast({ lat: pos.lat, lng: pos.lon, country, hours: SEA_TRIP_FUSION_HOURS, pointSource: 'cube', includeRadarNowcast: false });
      const steps = (fc.cube as { v2?: { axis?: { steps?: FusionStep[] } } } | undefined)?.v2?.axis?.steps;
      const series = windSeriesOfSteps(steps);
      return series ? { series, why: null } : { series: null, why: 'outside' };
    } catch { return { series: null, why: 'error' }; }
  })) as Promise<TripWindLoad>;
  windCache.set(key, { at: Date.now(), p });
  // An error is not remembered: the next look at the leg asks again.
  void p.then((r) => { if (r.why === 'error' && windCache.get(key)?.p === p) windCache.delete(key); });
  if (windCache.size > 160) windCache.delete(windCache.keys().next().value as string);
  return p;
}

// --- Wave and current of one full hour --------------------------------------------------------------------------------

export interface TripHourFields { wave: SeaFieldImage | null; uv: SeaUvGrid | null }
/**
 * The step of the wave run that IS the full hour `hourMs` — or `null`: before the run, behind it, or (beyond +48 h, where
 * the run writes a field only every third hour) an hour between two fields. Never the field of a neighbour hour.
 */
export function tripFieldStep(runMs: number, hourMs: number): number | null {
  const lead = (hourMs - runMs) / H;
  if (!Number.isInteger(lead)) return null;
  const step = seaFieldStepAt(lead);
  return step != null && step === lead ? step : null;
}
/**
 * The two fields of the full hour `hourMs`. Wave: only where the run writes a field for exactly this hour (hourly to
 * +48 h, then every third hour). Current: the hour of the BSH run, or none. `null` = no field — never a neighbour hour.
 * `signal` ends the leg's own waiting (then `null`). The reads are shared with the map (`seaClient.ts`, V-AM-18): a
 * file somebody else still waits for loads on, and another caller's abort never reaches the leg (V-AM-16).
 */
export async function loadTripHour(x: { run: string | null; runMs: number | null; curDoc: Pick<SeaCurrentDoc, 'run' | 't0' | 'uv'> | null; hourMs: number; signal?: AbortSignal }): Promise<TripHourFields> {
  const step = x.run && x.runMs != null ? tripFieldStep(x.runMs, x.hourMs) : null;
  const uvHour = x.curDoc?.uv ? currentUvHour(x.curDoc, x.hourMs) : null;
  const [wave, uv] = await Promise.all([
    x.run && step != null ? loadField(x.run, 'f', step, x.signal).catch(() => null) : Promise.resolve(null),
    x.curDoc && uvHour != null ? loadCurrentUv(x.curDoc.run, uvHour, x.signal).catch(() => null) : Promise.resolve(null),
  ]);
  return { wave, uv };
}

/** The wave at a position from a field image: `'land'` where the model has no water (or no sea state: height 0 without a period, V-SW-20). */
export function waveAt(img: Pick<SeaFieldImage, 'rgba' | 'width'> | null | undefined, pos: PlanPos): TripWave | 'land' | null {
  if (!img) return null;
  const s = sampleField(img.rgba, img.width, 0, pos.lat, pos.lon);
  if (s === undefined) return 'land';
  if (s.hs === 0 && s.per == null) return 'land';
  return s;
}
const FLOW: Flow = { u: 0, v: 0 };
/** The current at a position from a u/v grid: knots and where it sets towards; `'land'` without a water point. */
export function currentAt(grid: SeaUvGrid | null | undefined, pos: PlanPos): TripCur | 'land' | null {
  if (!grid) return null;
  const { x, y } = currentUvXY(pos.lat, pos.lon);
  if (!sampleUv(grid, x, y, FLOW)) return 'land';
  const ms = Math.hypot(FLOW.u, FLOW.v);
  return { kn: ms * MS_TO_KN, to: ms > 0 ? ((Math.atan2(FLOW.u, FLOW.v) * 180) / Math.PI + 360) % 360 : 0 };
}

/**
 * The shower/thunderstorm hint at a position: the hint of the nearest catalogue spot within `SEA_TRIP_CONV_KM`, named —
 * or none (no spot that near, no statement for the hour).
 */
export function convAt(spots: readonly Pick<SeaSpot, 'id' | 'name' | 'lat' | 'lon'>[], sight: SeaSightData | null | undefined, runMs: number, nowMs: number, pos: PlanPos, hourMs: number): TripConv | null {
  let best: { s: Pick<SeaSpot, 'id' | 'name' | 'lat' | 'lon'>; km: number } | null = null;
  for (const s of spots) { const km = planDistKm(pos, s); if (km <= SEA_TRIP_CONV_KM && (!best || km < best.km) && sight?.spots[s.id]?.conv) best = { s, km }; }
  if (!best) return null;
  const c = sightConvAt(sight, best.s.id, Math.round((hourMs - runMs) / H), hourMs, nowMs);
  return c.state === 'ok' && c.cls != null ? { cls: c.cls, spot: best.s.name, km: best.km } : null;
}

/** The readers of `seaTrip.tripRows` over what is loaded. Anything not loaded (yet) is "keine Daten". */
export function tripDataOf(x: {
  samples: readonly TripSample[]; wind: ReadonlyMap<string, TripWindLoad>;
  hours: ReadonlyMap<number, TripHourFields>;
  spots: readonly Pick<SeaSpot, 'id' | 'name' | 'lat' | 'lon'>[]; sight: SeaSightData | null | undefined; runMs: number | null; nowMs: number;
}): TripData {
  return {
    wind: (i, hourMs) => x.wind.get(sampleKey(x.samples[i]))?.series?.get(hourMs) ?? null,
    wave: (pos, hourMs) => waveAt(x.hours.get(hourMs)?.wave, pos),
    cur: (pos, hourMs) => currentAt(x.hours.get(hourMs)?.uv, pos),
    conv: (pos, hourMs) => (x.runMs == null ? null : convAt(x.spots, x.sight, x.runMs, x.nowMs, pos, hourMs)),
  };
}
export const sampleKey = (s: PlanPos | undefined): string => (s ? `${s.lat.toFixed(4)},${s.lon.toFixed(4)}` : '');
