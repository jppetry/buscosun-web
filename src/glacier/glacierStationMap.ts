/**
 * Phase DK-H — pure rules of the stations in the dossier map (level "Heute"): how well a station fits the glacier (three meters),
 * which one is the best match, its main values for the card on the map, where the dashed line starts on the outline, and the frame
 * of the map (outline plus every station). DOM-free, so `verify:glacier-dossier-heute` reads the same rules as the page.
 *
 * Nothing here judges conditions or compares a measurement with a model value: the meters say how near, how high and how recent the
 * instrument is — not what it means for the ice.
 */
import { fmt0 } from './glacierView';
import type { StnViewStation } from './glacierStationView';
import type { StnQuantity } from './glacierStationContract';

const HOUR = 3_600_000;
/** Nähe: ≤ 1 km three strokes, ≤ 3 km two, ≤ 5 km one (set, Jan 22.11.2026, phase DK-H). */
export const STN_MATCH_NEAR_KM = Object.freeze([1, 3, 5] as const);
/** Höhe: inside the glacier's elevation range three strokes, at most this far outside two, else one (set, Jan 22.11.2026). */
export const STN_MATCH_DZ_M = 300;
/** Aktuell: younger than 1 h three strokes, younger than 3 h two, else one (set, Jan 22.11.2026; older than 3 h is already dropped). */
export const STN_MATCH_AGE_MS = Object.freeze([1 * HOUR, 3 * HOUR] as const);
/** "Im Winter kleiner": the melt row of the board is compact in these months (UTC month 0–11; November to April, set). */
export const HEUTE_WINTER_MONTHS: readonly number[] = Object.freeze([10, 11, 0, 1, 2, 3]);
/** Quantities of the card on the map, in this order; at most three (the change of the snow depth stays in the list — too long for a card). */
export const STN_CARD_ORDER: readonly StnQuantity[] = Object.freeze(['t', 'wind', 'gust', 'snow', 'precip', 'rad'] as StnQuantity[]);
export const STN_CARD_MAX = 3;
/** Short words of the map card and the list (the full label stays in the sheet). */
export const STN_SHORT_LABEL: Readonly<Record<StnQuantity, string>> = Object.freeze({
  t: 'Temperatur', wind: 'Wind', gust: 'Böe', snow: 'Schneehöhe', precip: 'Niederschlag', rad: 'Strahlung', dsnow: 'Änderung der Schneehöhe',
});
/**
 * Inner padding of the map frame in px, so the white card above each marker is not cut off: desktop cards stand ≈ 100 px above the
 * point and are 220 px wide; on the phone only a small value pill shows.
 */
export const HEUTE_FRAME_PADDING = Object.freeze({
  desktop: Object.freeze({ top: 140, right: 130, bottom: 46, left: 130 }),
  mobile: Object.freeze({ top: 56, right: 54, bottom: 40, left: 54 }),
});

export interface StnMatch { near: number; height: number; fresh: number }
export const STN_MATCH_KEYS = Object.freeze([['near', 'Nähe'], ['height', 'Höhe'], ['fresh', 'Aktuell']] as const);

/** Three meters 0–3 for one station (0 = no shown value for "Aktuell"). */
export function stnMatch(s: Pick<StnViewStation, 'km' | 'elev' | 'ms'>, z: readonly [number, number, number], nowMs: number): StnMatch {
  const [k1, k3, k5] = STN_MATCH_NEAR_KM;
  const near = s.km <= k1 ? 3 : s.km <= k3 ? 2 : s.km <= k5 ? 1 : 0;
  const out = s.elev < z[0] ? z[0] - s.elev : s.elev > z[2] ? s.elev - z[2] : 0;
  const height = out === 0 ? 3 : out <= STN_MATCH_DZ_M ? 2 : 1;
  const age = s.ms == null ? null : Math.max(0, nowMs - s.ms);
  const fresh = age == null ? 0 : age < STN_MATCH_AGE_MS[0] ? 3 : age < STN_MATCH_AGE_MS[1] ? 2 : 1;
  return { near, height, fresh };
}
export const stnMatchSum = (m: StnMatch): number => m.near + m.height + m.fresh;

/** The best match (filled marker): largest sum of the meters, the nearer one on a tie, then the id. `null` without stations. */
export function stnBest(stations: readonly StnViewStation[], z: readonly [number, number, number], nowMs: number): string | null {
  let best: StnViewStation | null = null, bestSum = -1;
  for (const s of stations) {
    const sum = stnMatchSum(stnMatch(s, z, nowMs));
    if (sum > bestSum || (sum === bestSum && best && (s.km < best.km || (s.km === best.km && s.id < best.id)))) { best = s; bestSum = sum; }
  }
  return best?.id ?? null;
}

/** One to three shown values of a station for the card on the map, in `STN_CARD_ORDER`; `[]` when none is shown. */
export function stnMainValues(s: StnViewStation): Array<{ q: StnQuantity; label: string; text: string }> {
  const out: Array<{ q: StnQuantity; label: string; text: string }> = [];
  for (const q of STN_CARD_ORDER) {
    const v = s.values.find((x) => x.q === q && x.text != null);
    if (v) out.push({ q, label: STN_SHORT_LABEL[q], text: v.text! });
    if (out.length === STN_CARD_MAX) break;
  }
  return out;
}

type Ring = ReadonlyArray<readonly number[]>;
function ringsOf(g: GeoJSON.Geometry | null): Ring[][] {
  if (!g) return [];
  if (g.type === 'Polygon') return [g.coordinates as Ring[]];
  if (g.type === 'MultiPolygon') return g.coordinates as Ring[][];
  if (g.type === 'GeometryCollection') return g.geometries.flatMap(ringsOf);
  return [];
}

/**
 * The point of the outline nearest to `[lon, lat]` (local plane around the point, as `stnOutlineKm`), with its distance in km;
 * `inside: true` when the point lies on the ice (inside an outer ring, in none of its holes). `null` without an outline.
 */
export function nearestOnOutline(geometry: GeoJSON.Geometry | null, lat: number, lon: number): { lon: number; lat: number; km: number; inside: boolean } | null {
  const polys = ringsOf(geometry);
  if (!polys.length) return null;
  const rad = Math.PI / 180, kx = 111.195 * Math.cos(lat * rad), ky = 111.195;
  let best = Infinity, bx0 = 0, by0 = 0, inside = false;
  for (const poly of polys) {
    let inPoly = false;
    poly.forEach((ring, ri) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = (ring[j][0] - lon) * kx, ay = (ring[j][1] - lat) * ky, bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
        if ((ay > 0) !== (by > 0) && 0 < ((bx - ax) * (0 - ay)) / (by - ay) + ax) c = !c;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
        const px = ax + t * dx, py = ay + t * dy, d = Math.hypot(px, py);
        if (d < best) { best = d; bx0 = px; by0 = py; }
      }
      if (ri === 0) inPoly = c; else if (c) inPoly = false;
    });
    if (inPoly) inside = true;
  }
  if (!Number.isFinite(best)) return null;
  return { lon: lon + bx0 / kx, lat: lat + by0 / ky, km: inside ? 0 : best, inside };
}

/** The dashed lines from the nearest outline point to each station, with the distance of the mapping (`km`) as their label. */
export interface StnLine { id: string; from: [number, number]; to: [number, number]; mid: [number, number]; km: number }
export function stnLines(stations: readonly StnViewStation[], geometry: GeoJSON.Geometry | null): StnLine[] {
  const out: StnLine[] = [];
  for (const s of stations) {
    const p = nearestOnOutline(geometry, s.lat, s.lon);
    // on the ice or right at its edge: no line (the text says "am Rand des Gletschers")
    if (!p || p.inside || s.km < 0.05) continue;
    out.push({ id: s.id, from: [p.lon, p.lat], to: [s.lon, s.lat], mid: [(p.lon + s.lon) / 2, (p.lat + s.lat) / 2], km: s.km });
  }
  return out;
}
export const stnLinesGeoJson = (lines: readonly StnLine[]): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: lines.map((l) => ({ type: 'Feature', properties: { id: l.id, km: l.km }, geometry: { type: 'LineString', coordinates: [l.from, l.to] } })),
});

/** Frame of the map on level Heute: the outline's box widened to every station. `null` without outline and stations. */
export function heuteFrame(bbox: readonly [number, number, number, number] | null, stations: ReadonlyArray<{ lat: number; lon: number }>): [[number, number], [number, number]] | null {
  let w = bbox ? bbox[0] : Infinity, s = bbox ? bbox[1] : Infinity, e = bbox ? bbox[2] : -Infinity, n = bbox ? bbox[3] : -Infinity;
  for (const p of stations) { w = Math.min(w, p.lon); e = Math.max(e, p.lon); s = Math.min(s, p.lat); n = Math.max(n, p.lat); }
  return Number.isFinite(w) && Number.isFinite(s) ? [[w, s], [e, n]] : null;
}

export const isHeuteWinter = (nowMs: number): boolean => HEUTE_WINTER_MONTHS.includes(new Date(nowMs).getUTCMonth());

/** Elevation difference to the median in short words for the map card: "+424 m zur Mitte". */
export const dzShort = (dz: number): string => (dz === 0 ? 'auf der Mitte' : `${dz > 0 ? '+' : '−'}${fmt0(Math.abs(dz))} m zur Mitte`);
