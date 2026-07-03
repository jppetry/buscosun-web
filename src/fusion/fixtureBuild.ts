/**
 * Pure grid → fixture conversion shared by the browser capture hook
 * (`captureFixture.ts`) and the Node capture script (`scripts/capture-fixture.mjs`).
 * Both call `assembleCapture` on the SAME adapter outputs with the SAME
 * `CAPTURE_PARAMS`, so a browser session and a Node session for one valid time
 * are structurally identical by construction (the equivalence gate then only
 * has to confirm endpoints + DEM parity). No DOM/Node APIs here — DEM is
 * injected as an `ElevationSampler` so each caller supplies its own.
 */

import type { ForecastGrid, ForecastHourPoint } from '../sources/openMeteoForecast';
import type { Fixture, FixtureBounds, FixtureSample, FixtureStation, OiVariable } from './fixture';

/** Minimal elevation lookup — satisfied by the browser `ElevationGrid` and the
 *  Node Terrarium decoder alike. */
export interface ElevationSampler { sample(lng: number, lat: number): number }

/** Canonical fetch geometry — identical in browser + Node so station/grid sets
 *  match. Changing capture resolution here changes both callers at once. */
export const CAPTURE_PARAMS = {
  hours: 1,
  obs: { cols: 10, rows: 8 },
  mosmix: { cols: 16, rows: 13 },
  arome: { cols: 12, rows: 7 },
  smn: { maxStations: 80 },
  icond2: { cols: 20, rows: 16 },
} as const;

export const eqx = (lng: number) => (lng + 180) / 360;
export const eqy = (lat: number) => (90 - lat) / 180;

/** Resolve a grid point's geographic position (station coords win over grid). */
export function pointLngLat(g: ForecastGrid, p: ForecastHourPoint, k: number): [number, number] {
  if (p.lng != null && p.lat != null) return [p.lng, p.lat];
  const i = k % g.cols, j = Math.floor(k / g.cols);
  const lng = g.bounds.lngMin + (i / Math.max(1, g.cols - 1)) * (g.bounds.lngMax - g.bounds.lngMin);
  const lat = g.bounds.latMin + (j / Math.max(1, g.rows - 1)) * (g.bounds.latMax - g.bounds.latMin);
  return [lng, lat];
}

export function pointVals(p: ForecastHourPoint): Partial<Record<OiVariable, number>> {
  const u = p.u, v = p.v;
  const vals: Partial<Record<OiVariable, number>> = {};
  if (p.temperature != null) vals.t2m = p.temperature;
  if (u != null) vals.windU = u;
  if (v != null) vals.windV = v;
  if (u != null && v != null) vals.windSpeed = Math.hypot(u, v);
  if (p.precipitation != null) vals.precip = p.precipitation;
  if (p.cloudLow != null) vals.cloud = p.cloudLow;
  return vals;
}

export function gridToSamples(
  g: ForecastGrid | null, source: string, dem: ElevationSampler | null,
  provenance: FixtureSample['provenance'] = 'ccby',
): FixtureSample[] {
  if (!g?.points[0]) return [];
  const out: FixtureSample[] = [];
  const ps = g.points[0];
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k];
    if (!p) continue;
    const [lng, lat] = pointLngLat(g, p, k);
    const demV = dem ? dem.sample(lng, lat) : NaN;
    const elev = Number.isFinite(p.elev) ? (p.elev as number) : (Number.isFinite(demV) ? Math.max(0, demV) : 0);
    out.push({ x: eqx(lng), y: eqy(lat), elev, source, vals: pointVals(p), provenance });
  }
  return out;
}

export function gridToStations(g: ForecastGrid | null, network: FixtureStation['network']): FixtureStation[] {
  if (!g?.points[0]) return [];
  const out: FixtureStation[] = [];
  const ps = g.points[0];
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k];
    if (!p || p.lat == null || p.lng == null) continue;   // stations must be geolocated
    const elev = Number.isFinite(p.elev) ? (p.elev as number) : 0;
    out.push({ id: `${network}-${k}`, x: eqx(p.lng), y: eqy(p.lat), elev, network, truth: pointVals(p) });
  }
  return out;
}

export interface RawGrids {
  obs: ForecastGrid | null;
  mosmix: ForecastGrid | null;
  arome: ForecastGrid | null;
  tawes: ForecastGrid | null;
  smn: ForecastGrid | null;
  icond2: ForecastGrid | null;
}

/**
 * Assemble a Fixture from the h=0 (analysis) slice of the fetched grids. The
 * ICON-D2 provenance is `'open-meteo'` iff it came from Open-Meteo (so the
 * training loader strips it, constraint C1); a native GRIB2 ICON-D2 grid would
 * be passed with `openMeteoIcond2:false` (→ 'ccby', trainable).
 */
export function assembleCapture(
  g: RawGrids, dem: ElevationSampler | null,
  opts: { bounds: FixtureBounds; openMeteoIcond2: boolean; capturedAt: string },
): Fixture {
  const stations: FixtureStation[] = [
    ...gridToStations(g.obs, 'dwd'),
    ...gridToStations(g.tawes, 'tawes'),
    ...gridToStations(g.smn, 'smn'),
  ];
  const background: FixtureSample[] = [
    ...gridToSamples(g.mosmix, 'mosmix', dem),
    ...gridToSamples(g.arome, 'arome', dem),
  ];
  const validTime = (g.mosmix?.times[0] ?? g.obs?.times[0] ?? new Date(opts.capturedAt)).toISOString();
  const dwdN = gridToStations(g.obs, 'dwd').length;
  const tawesN = gridToStations(g.tawes, 'tawes').length;
  const smnN = gridToStations(g.smn, 'smn').length;
  return {
    meta: {
      capturedAt: opts.capturedAt,
      validTime, bounds: opts.bounds, synthetic: false,
      note: `Captured session: obs(dwd=${dwdN}, tawes=${tawesN}, smn=${smnN}), ` +
        `bg(mosmix+arome=${background.length}), icond2=${g.icond2 ? (opts.openMeteoIcond2 ? 'open-meteo icon_d2' : 'icon_d2') : 'none'}.`,
    },
    stations,
    background,
    icond2: gridToSamples(g.icond2, 'icon_d2', dem, opts.openMeteoIcond2 ? 'open-meteo' : 'ccby'),
  };
}
