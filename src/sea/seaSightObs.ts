/**
 * Phase SG — reading the measured visibility (`audit/seewetter-sicht-konvektion.md`): the DWD POI file and the DMI metObs
 * parameter. A module of its own so the data client (`seaClient.ts`, part of the route's first chunk) and the archive
 * (`sea-archive.mjs`, which checks out `src/sea` only) read it without the page's words. Pure, imports nothing.
 */
const H = 3_600_000;

// --- Measured visibility ---------------------------------------------------------------------------------------

/** Columns of the DWD POI file (`weather_reports/poi/<id>-BEOB.csv`) this phase reads; visibility is stated in km. */
export const POI_SIGHT_COLS = Object.freeze({
  vis: 'horizontal_visibility', t: 'dry_bulb_temperature_at_2_meter_above_ground', td: 'dew_point_temperature_at_2_meter_above_ground', rr: 'precipitation_amount_last_hour',
} as const);
/** DMI metObs: mean visibility of the last 10 minutes, metres (five of the eight stations of the Danish spots deliver it). */
export const DMI_VIS_PARAM = 'visib_mean_last10min';
/** The POI file is hourly and was 98 min behind when measured (18.11.2026) — a value older than this is not shown (`set`). */
export const SIGHT_POI_MAX_AGE_MS = 3 * H;
/** Plausible range of a visibility value (m); the POI files cap at 75 km. */
export const SIGHT_RANGE_M = Object.freeze([0, 100_000] as const);

export interface PoiSightRow { t: number; visKm: number | null; tC: number | null; tdC: number | null; rr: number | null }
/** Every row of a POI file with the four columns; `visKm` is `null` when the file states another unit than km. */
export function poiSightRows(text: string): PoiSightRow[] {
  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const head = rows[0]?.split(';') ?? [], unit = rows[1]?.split(';') ?? [];
  const ci = { vis: head.indexOf(POI_SIGHT_COLS.vis), t: head.indexOf(POI_SIGHT_COLS.t), td: head.indexOf(POI_SIGHT_COLS.td), rr: head.indexOf(POI_SIGHT_COLS.rr) };
  const km = ci.vis >= 0 && unit[ci.vis] === 'km';
  const num = (c: string[], k: number) => { if (k < 0) return null; const s = c[k]; if (!s || s === '---') return null; const x = Number(s.replace(',', '.')); return Number.isFinite(x) ? x : null; };
  const out: PoiSightRow[] = [];
  for (const r of rows.slice(3)) {
    const c = r.split(';');
    if (!/^\d\d\.\d\d\.\d\d$/.test(c[0] ?? '') || !/^\d\d:\d\d$/.test(c[1] ?? '')) continue;
    const t = Date.UTC(2000 + +c[0].slice(6, 8), +c[0].slice(3, 5) - 1, +c[0].slice(0, 2), +c[1].slice(0, 2), +c[1].slice(3, 5));
    out.push({ t, visKm: km ? num(c, ci.vis) : null, tC: num(c, ci.t), tdC: num(c, ci.td), rr: num(c, ci.rr) });
  }
  return out;
}

export interface SightObs { t: number; visM: number; src: 'poi' | 'dmi' }
const inRange = (m: number) => m >= SIGHT_RANGE_M[0] && m <= SIGHT_RANGE_M[1];
/** The newest row with a visibility — only when it is not older than `SIGHT_POI_MAX_AGE_MS` (else `null`: no stale value). */
export function poiSightLatest(text: string, nowMs: number): SightObs | null {
  let best: PoiSightRow | null = null;
  for (const r of poiSightRows(text)) if (r.visKm != null && r.t <= nowMs + 10 * 60_000 && (!best || r.t > best.t)) best = r;
  if (!best || nowMs - best.t > SIGHT_POI_MAX_AGE_MS) return null;
  const visM = Math.round((best.visKm as number) * 1000);
  return inRange(visM) ? { t: best.t, visM, src: 'poi' } : null;
}
