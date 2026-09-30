/**
 * stationSelect.ts — the `cap` stations nearest to a point (phase AX, AX-1 / V-FS-15).
 *
 * The three observation adapters used to cap their station lists blindly: BrightSky by a probe raster, TAWES by
 * `slice(0, cap)` of the operator's list, SMN by every k-th station of the alphabet. Measured 30.09.2026 at eight
 * cities: not one measurement within 5 km / 50 m of the point reached the cube path (`audit/fusion-ausbau.md` §1.1).
 * With a point to measure from, the cap keeps the nearest stations — pure, so the verifier can check it.
 */

const R_EARTH_KM = 6371;

export function distanceKmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const p = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * p) / 2) ** 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * Math.sin(((lon2 - lon1) * p) / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.sqrt(Math.min(1, a)));
}

export interface NearPoint { lat: number; lon: number }

/** The `cap` items nearest to `near`, ascending by distance; ties keep the input order (stable sort). */
export function nearestSubset<T>(items: readonly T[], near: NearPoint, cap: number, coordOf: (t: T) => NearPoint): T[] {
  if (!(cap > 0) || !items.length) return [];
  const withD = items.map((t, i) => { const c = coordOf(t); return { t, i, d: distanceKmBetween(near.lat, near.lon, c.lat, c.lon) }; });
  withD.sort((a, b) => (a.d - b.d) || (a.i - b.i));
  return withD.slice(0, Math.min(cap, withD.length)).map((x) => x.t);
}
