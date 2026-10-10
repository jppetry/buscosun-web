/**
 * obsDense.mjs — phase OF (`audit/obs-fusion.md` §5.4): the dense station measurements of the past for the replay, read from
 * the day files of `scripts/obsfusion/build-dense-obs.mjs` (`<PS_ROOT>/obs-dense/<day>.json.gz`: the 10-min series of every
 * station of the mirror's catalogue in [slot − 7 h, slot], rebuilt from the originals).
 *
 * At the slot time the day file becomes the SAME shape the browser reads (`obsStoreOf(catalog, latest)` of the candidate's
 * `src/sources/obsStore.ts`): per station the newest stamp ≤ now with any value, its values, the hour sum `rr1h` ending at
 * that stamp with completeness — so the replay selects the stations with the candidate's own `nearestObsStations` and maps
 * them with its `cubeObsOf`: the engine sees in the replay what it sees in the browser.
 *
 * Leak rule of OF-0 (§1.6): a role-B point gets no station within `EXCLUDE_OWN_KM` of itself (its own station is masked);
 * the truth is never read from this set.
 */
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { PS_ROOT, p } from './common.mjs';

export const DENSE_DIR = p(PS_ROOT, 'obs-dense');
export const EXCLUDE_OWN_KM = 0.25;
/** A station's newest stamp must lie within this of `now` (the browser reader's `OBS_MAX_AGE_MS`, 6 h). */
const MAX_AGE_MS = 6 * 3_600_000;

const cache = new Map();
export const densePath = (day) => p(DENSE_DIR, `${day}.json.gz`);
export const denseAvailable = (day) => existsSync(densePath(day));
/** The day file (cached per process); null when the day is not built. */
export function readDenseDay(day) {
  if (cache.has(day)) return cache.get(day);
  const path = densePath(day);
  const doc = existsSync(path) ? JSON.parse(gunzipSync(readFileSync(path)).toString('utf8')) : null;
  if (doc && (doc.kind !== 'obsfusion/dense-day' || doc.schema !== 1)) throw new Error(`${path}: kein dense-day Schema 1`);
  cache.set(day, doc);
  return doc;
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * The `ObsStore` input (catalogue + latest) of a day file at `nowMs`: per station the newest stamp ≤ now (≥ now − 6 h) with any
 * value, `v` = the values at that stamp, `rr1h` = the sum of `rr` over the six stamps ending there (complete when all six are
 * there). Stations without such a stamp are left out of `latest` (the reader then skips them). Pure.
 */
export function denseStoreInput(doc, nowMs, { exclude = null } = {}) {
  const stations = [], latest = {};
  const { t0Ms, stepMs, n } = doc;
  const iMax = Math.min(n - 1, Math.floor((nowMs - t0Ms) / stepMs));
  const iMin = Math.max(0, Math.ceil((nowMs - MAX_AGE_MS - t0Ms) / stepMs));
  for (const [id, s] of Object.entries(doc.stations)) {
    if (exclude && exclude(s)) continue;
    const cols = s.cols;
    let best = -1;
    for (let i = iMax; i >= iMin; i--) { let any = false; for (const c of Object.keys(cols)) if (cols[c][i] != null) { any = true; break; } if (any) { best = i; break; } }
    const country = s.country;
    stations.push({ id, name: id, lat: s.lat, lon: s.lon, elev: s.elev, country, networks: [], vars: Object.keys(cols) });
    if (best < 0) continue;
    const v = {};
    for (const c of Object.keys(cols)) if (cols[c][best] != null) v[c] = cols[c][best];
    const e = { t: new Date(t0Ms + best * stepMs).toISOString(), src: 'dense', v };
    if (cols.rr) {
      let mm = 0, k = 0;
      for (let j = 0; j < 6; j++) { const x = cols.rr[best - j]; if (best - j >= 0 && x != null) { mm += x; k += 1; } }
      e.rr1h = { mm: r2(mm), n: k, of: 6, complete: k === 6 };
    }
    latest[id] = e;
  }
  return { catalog: { schema: 1, kind: 'obs/stations', builtAt: doc.builtAt, count: stations.length, stations }, latest: { schema: 1, kind: 'obs/latest', builtAt: doc.slotAt, count: Object.keys(latest).length, stations: latest } };
}

const km = (aLat, aLon, bLat, bLon) => { const r = Math.PI / 180; const x = (bLon - aLon) * Math.cos(((aLat + bLat) / 2) * r), y = bLat - aLat; return 111.2 * Math.hypot(x, y); };

/**
 * The engine's `obs` for one point from a day file, with the candidate's reader modules (`eng.dense` of `loadEngine`):
 *   mode 'dense'   the dense set (OBS_DENSE_MAX stations incl. gauges, Td, rr10/rr1h) — `FuseCubeOptions.obsDense`
 *   mode 'store6'  today's semantics on the product (six nearest full stations, 10-min stamps, no extras) — the OF-1 effect alone
 * `maskOwn` (role B): no station within EXCLUDE_OWN_KM of the point. Returns null when the day is not built (caller falls back).
 */
export function denseObsFor(eng, day, lat, lon, country, { nowMs, mode = 'dense', maskOwn = false }) {
  const doc = readDenseDay(day);
  if (!doc || !eng.dense) return null;
  const input = denseStoreInput(doc, nowMs, { exclude: maskOwn ? (s) => km(lat, lon, s.lat, s.lon) <= EXCLUDE_OWN_KM : null });
  const store = eng.dense.obsStoreOf(input.catalog, input.latest, nowMs);
  const list = eng.dense.nearestObsStations(store, lat, lon, country, mode === 'dense' ? { max: eng.dense.OBS_DENSE_MAX, nowMs, dense: true } : { max: 6, nowMs });
  return eng.dense.cubeObsOf(list, nowMs);
}
