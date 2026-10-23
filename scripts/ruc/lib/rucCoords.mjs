/**
 * rucCoords.mjs — the RUC cell centres inside the cube domain (from CLAT/CLON), cached on disk per `--cache` directory.
 * `force: true` ignores and overwrites the cache — the producer uses it when a step field no longer matches the cached grid
 * (review I2: a DWD re-grid must not turn the hourly workflow permanently red behind an immutable `actions/cache` key).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { CUBE_DOMAIN } from '../../../src/point/cubeFormat.ts';
import { RUC_TIER } from '../../../src/point/rucFormat.ts';

export const RUC_CELLS_CACHE_FILE = 'ruc-cells-dach.json.gz';

/**
 * @param fetchCoords async (runMs) => { lat, lon, n } (degrees) — `fetchRucCoords` in production, a stub in the verifier
 * @returns { n, idx: Int32Array, lat: Float32Array, lon: Float32Array, cached: boolean } — only cells whose centre lies in the domain (± half a t1 cell)
 */
export async function loadRucCoords({ cacheDir = null, fetchCoords, runMs = 0, log = () => {}, force = false }) {
  const cacheFile = cacheDir ? join(cacheDir, RUC_CELLS_CACHE_FILE) : null;
  if (cacheFile && !force && existsSync(cacheFile)) {
    try {
      const c = JSON.parse(gunzipSync(readFileSync(cacheFile)).toString('utf8'));
      if (Number.isFinite(c.n) && Array.isArray(c.idx) && Array.isArray(c.lat) && Array.isArray(c.lon)) {
        return { n: c.n, idx: Int32Array.from(c.idx), lat: Float32Array.from(c.lat), lon: Float32Array.from(c.lon), cached: true };
      }
      log('cell cache has an unexpected shape — refetching');
    } catch (e) {
      log(`cell cache unreadable (${e instanceof Error ? e.message : e}) — refetching`);
    }
  }
  const cc = await fetchCoords(runMs);
  if (!cc) throw new Error('CLAT/CLON of the run not readable');
  const half = RUC_TIER.deg / 2;
  const idx = [], lat = [], lon = [];
  for (let i = 0; i < cc.n; i++) {
    const y = cc.lat[i], x = cc.lon[i];
    if (y >= CUBE_DOMAIN.latMin - half && y <= CUBE_DOMAIN.latMax + half && x >= CUBE_DOMAIN.lonMin - half && x <= CUBE_DOMAIN.lonMax + half) {
      idx.push(i); lat.push(+y.toFixed(5)); lon.push(+x.toFixed(5));
    }
  }
  if (cacheFile) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(cacheFile, gzipSync(JSON.stringify({ n: cc.n, idx, lat, lon })));
  }
  return { n: cc.n, idx: Int32Array.from(idx), lat: Float32Array.from(lat), lon: Float32Array.from(lon), cached: false };
}
