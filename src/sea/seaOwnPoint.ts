/**
 * „Eigener Punkt“ for the planner „Vor Ort“: a start point the user sets on the map instead of a catalogue spot.
 * Computed at the point itself, with the readers of the leg (`seaTripData.ts`), never with a substitute:
 *
 *   wind     buscosun Fusion at the point (`loadTripWind`) — outside the cube "keine Daten".
 *   wave     the CWAM field of the full hour at the nearest WATER cell within `SEA_SPOT_MAX_CELL_KM` (as a spot's cell);
 *            loaded for the hours the planner looks at (window and the shown hour) — other hours have no wave value.
 *   current  the BSH u/v field of the same hours at that cell.
 *   shore    the seaward normal from the model's water mask around the point (the producer's vector rule of
 *            `scripts/sea/shoreNormal.mjs` `maskVectorNormal`, on one field's mask) — an estimate, said so.
 *
 * Water level, official text and the shower hint stay those of the nearest catalogue spot, named with its distance.
 */
import { SEA_MODELS, SEA_SPOT_MAX_CELL_KM, seaCellCentre, seaCellOf, type SeaSpot } from './seaContract';
import type { SeaFieldImage } from './seaClient';
import { planBearingDeg, planDistKm, type PlanPos } from './seaPlanner';
import type { SeaReadoutHour } from './SeaReadout';
import { currentAt, waveAt, type TripHourFields, type TripWindSeries } from './seaTripData';
import type { TripCur } from './seaTrip';

const H = 3_600_000;

/** Where the point's wave and current are read, and which way the shore faces. `null` = no water cell near enough. */
export interface OwnGeo { cell: NonNullable<SeaSpot['cell']>; normal: number }

/** Nearest water cell within `SEA_SPOT_MAX_CELL_KM` and the seaward normal of the mask around the point. */
export function ownGeoOf(img: Pick<SeaFieldImage, 'rgba' | 'width'> | null | undefined, pos: PlanPos): OwnGeo | null {
  if (!img) return null;
  const g = SEA_MODELS.cwam.grid, c = seaCellOf('cwam', pos.lat, pos.lon);
  let best: { i: number; j: number; km: number } | null = null, ve = 0, vn = 0;
  for (let j = Math.floor(c.j) - 12; j <= Math.ceil(c.j) + 12; j++) for (let i = Math.floor(c.i) - 8; i <= Math.ceil(c.i) + 8; i++) {
    if (i < 0 || j < 0 || i >= g.ni || j >= g.nj) continue;
    const p = seaCellCentre('cwam', i, j), d = planDistKm(pos, p);
    const w = waveAt(img, p);
    const water = w != null && w !== 'land';
    if (water && d <= SEA_SPOT_MAX_CELL_KM && (!best || d < best.km)) best = { i, j, km: d };
    if (d < 0.2 || d > 2.5) continue;
    const b = (planBearingDeg(pos, p) * Math.PI) / 180, s = water ? 1 : -1;
    ve += (s * Math.sin(b)) / d; vn += (s * Math.cos(b)) / d;
  }
  if (!best) return null;
  const centre = seaCellCentre('cwam', best.i, best.j);
  // Without land around (open water) the vector is ~0: the normal then points from the point to its water cell.
  const normal = Math.hypot(ve, vn) < 1e-6 ? Math.round(planBearingDeg(pos, centre)) % 360 : Math.round(((Math.atan2(ve, vn) * 180) / Math.PI + 360) % 360) % 360;
  return { cell: { model: 'cwam', i: best.i, j: best.j, km: +best.km.toFixed(2) }, normal };
}

/** The point as a spot for the planner: position, cell and normal of its own; the rest (coast, gauge, area) of the nearest spot. */
export function ownSpotOf(near: SeaSpot, pos: PlanPos, geo: OwnGeo): SeaSpot {
  return { ...near, name: OWN_NAME, lat: pos.lat, lon: pos.lon, normal: geo.normal, normalFrom: 'mask', normalMask: undefined, normalWhy: undefined, cell: geo.cell };
}

/** The point's hours on the page's axis: wind from buscosun Fusion, wave where its field is loaded, hints of the nearest spot. */
export function ownHoursOf(x: {
  nHours: number; nowHour: number; wind: TripWindSeries | null; fields: ReadonlyMap<number, TripHourFields>; geo: OwnGeo;
  /** The nearest spot's hours and its distance: only the shower/sight hints are taken, and only within `hintKm`. */
  near: readonly (SeaReadoutHour | null | undefined)[]; nearKm: number; hintKm: number;
}): SeaReadoutHour[] {
  const at = seaCellCentre('cwam', x.geo.cell.i, x.geo.cell.j);
  return Array.from({ length: x.nHours }, (_, kk) => {
    const t = x.nowHour + kk * H, w = x.wind?.get(t) ?? null, f = x.fields.get(t);
    const wave = f ? waveAt(f.wave, at) : null, n = x.nearKm <= x.hintKm ? x.near[kk] : null;
    const wv = wave && wave !== 'land' ? wave : null;
    return {
      t, windMs: w?.windMs ?? null, gustMs: w?.gustMs ?? null, windDir: w?.windDir ?? null,
      hs: wv?.hs ?? null, dir: wv?.dir ?? null, tm: wv?.per ?? null,
      ws: null, wsDir: null, wsPer: null, wsPeak: null, sw: null, swDir: null, swPer: null, swPeak: null,
      dry: wave === 'land', windQ: null, gustQ: null, vis: n?.vis ?? null, conv: n?.conv ?? null,
    };
  });
}

/** Current of the point's cell at one full hour (`null` = field not loaded or no water). */
export function ownCurrentAt(fields: ReadonlyMap<number, TripHourFields>, geo: OwnGeo, t: number): TripCur | null {
  const c = currentAt(fields.get(t)?.uv, seaCellCentre('cwam', geo.cell.i, geo.cell.j));
  return c && c !== 'land' ? c : null;
}

export const OWN_NAME = 'Eigener Punkt';
/** Most hours of fields loaded for one point (window + shown hour). */
export const OWN_MAX_FIELD_HOURS = 30;
export const ownPosText = (p: PlanPos): string => `${p.lat.toFixed(3).replace('.', ',')}° N, ${p.lon.toFixed(3).replace('.', ',')}° O`;
/** What the point's numbers are, in one sentence each (shown on the page „Startort“ and in the result). */
export function ownNotes(x: { nearName: string; nearKm: number; cellKm: number }): string[] {
  const km = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return [
    'Wind und Böen: buscosun Fusion genau an diesem Punkt.',
    `Welle und Strom: nächste Wasserzelle des Modells (${km(x.cellKm)} km), nur für die Stunden deines Fensters.`,
    'Von See oder vom Land: Uferrichtung aus der Wassermaske des Modells geschätzt.',
    `Wasserstand, amtliche Meldung und Schauer-Hinweis: vom nächsten Spot ${x.nearName} (${km(x.nearKm)} km).`,
  ];
}
