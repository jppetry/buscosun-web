/**
 * Sun table per glacier and elevation (compact file of `scripts/glacier/py/terrain_params.py --sun-out`) and the terrain variant of the global
 * radiation for the GLACIER_SUN shadow of the melt run. The melt core is not touched: this module only builds an hourly series per band.
 *
 *   file  { kind: 'glacier/sun-table', build, sun: { day, year, time, … }, glaciers: { <id>: { z: [tongue, median, top], sun: [b64 × 3], svf: [3] } } }
 *   sun   288 bytes per elevation, c × 255, index 24 · (month − 1) + UTC hour (the table hour = hh:30 of the 15th).
 */
import { readFileSync } from 'node:fs';
import { cloudFactor } from './meltcore.mjs';

/** Terrain variant: G_terrain = G_flat · [ (1 − d) · min(c / cosZ, RATIO_MAX) + d · svf ] (all `set`). */
export const SUN_RATIO_MAX = 5;
export const SUN_DIFFUSE_CLEAR = 0.15;
export const SUN_COSZ_MIN = 0.02;
const CF_MIN = cloudFactor(1);   // the cloud factor at full cover (0.25)
export const SUN_RULES = Object.freeze({
  formula: 'G_terrain = G_flat * [(1 - d) * min(c / cosZ, ratioMax) + d * svf]; direct part 0 when cosZ < cosZMin',
  ratioMax: { v: SUN_RATIO_MAX, origin: 'set' }, diffuseClear: { v: SUN_DIFFUSE_CLEAR, origin: 'set' }, cosZMin: { v: SUN_COSZ_MIN, origin: 'set' },
  diffuse: 'd = diffuseClear under a clear sky, linear to 1 at the cloud factor of full cover', table: 'c linear between the two nearest mid-month tables by day of year, table hour = UTC hour of the start of the step, linear in elevation between tongue / median / top (outside the nearest)',
});
export const SUN_MODES = Object.freeze(['flat', 'shadow']);
export function sunModeOf(v) {
  const s = v == null || v === '' ? 'flat' : String(v);
  if (!SUN_MODES.includes(s)) throw new Error(`--sun=${s} unbekannt (${SUN_MODES.join(' | ')})`);
  return s;
}

const H = 3_600_000;
/** `{ table }` or `{ why }` — never throws. */
export function loadSunTable(path) {
  if (!path) return { why: 'keine Sonnentabelle angegeben (--sun-table / GLACIER_SUN_TABLE)' };
  let raw, doc;
  try { raw = readFileSync(path); } catch (e) { return { why: `Sonnentabelle nicht lesbar: ${e?.code ?? e?.message}` }; }
  try { doc = JSON.parse(raw.toString('utf8')); } catch { return { why: 'Sonnentabelle ist kein JSON' }; }
  if (doc?.kind !== 'glacier/sun-table' || typeof doc.glaciers !== 'object') return { why: 'Sonnentabelle: falsche Art' };
  const year = doc.sun?.year ?? 2026, day = doc.sun?.day ?? 15;
  const mid = Array.from({ length: 12 }, (_, m) => (Date.UTC(year, m, day) - Date.UTC(year, 0, 0)) / 86_400_000);   // day of year of each table
  return { table: { doc, mid, bytes: raw.length, cache: new Map() } };
}

/** The decoded entry of a glacier (`null` = none, with `why`). */
export function sunEntryOf(table, id) {
  if (table.cache.has(id)) return table.cache.get(id);
  const e = table.doc.glaciers[id];
  let out;
  if (!e) out = { why: 'kein Eintrag in der Sonnentabelle' };
  else if (!Array.isArray(e.z) || e.z.length !== 3 || !e.z.every(Number.isFinite) || !Array.isArray(e.sun) || e.sun.some((s) => typeof s !== 'string') || !Array.isArray(e.svf) || !e.svf.every(Number.isFinite)) out = { why: 'Eintrag unvollständig' };
  else {
    const lv = e.sun.map((s) => Buffer.from(s, 'base64'));
    out = lv.every((b) => b.length === 288) ? { z: e.z, lv, svf: e.svf } : { why: 'Tabelle nicht 288 Werte' };
  }
  table.cache.set(id, out);
  return out;
}

/** Weights of the three elevations at `zM` (linear between, outside the nearest). */
function elevW(z, zM) {
  if (zM <= z[0]) return [1, 0, 0];
  if (zM >= z[2]) return [0, 0, 1];
  if (zM <= z[1]) { const w = z[1] > z[0] ? (zM - z[0]) / (z[1] - z[0]) : 1; return [1 - w, w, 0]; }
  const w = z[2] > z[1] ? (zM - z[1]) / (z[2] - z[1]) : 1; return [0, 1 - w, w];
}

/** Effective cosine c (0…1) of a glacier entry at elevation `zM` for the step that starts at `tMs`. */
export function sunC(table, entry, zM, tMs) {
  const d = new Date(tMs);
  const doy = (Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 86_400_000 + d.getUTCHours() / 24;
  const mid = table.mid;
  // the two neighbouring mid-month tables (wrapping over the year end)
  let m1 = mid.findIndex((x) => x > doy), m0, w;
  if (m1 === -1) { m0 = 11; m1 = 0; w = (doy - mid[11]) / (mid[0] + 365 - mid[11]); }
  else if (m1 === 0) { m0 = 11; w = (doy + 365 - mid[11]) / (mid[0] + 365 - mid[11]); }
  else { m0 = m1 - 1; w = (doy - mid[m0]) / (mid[m1] - mid[m0]); }
  const h = d.getUTCHours();
  const ew = elevW(entry.z, zM);
  let c = 0;
  for (let k = 0; k < 3; k++) if (ew[k]) c += ew[k] * ((1 - w) * entry.lv[k][24 * m0 + h] + w * entry.lv[k][24 * m1 + h]) / 255;
  return c;
}
export const sunSvf = (entry, zM) => { const ew = elevW(entry.z, zM); return ew[0] * entry.svf[0] + ew[1] * entry.svf[1] + ew[2] * entry.svf[2]; };

/** Diffuse share from the cloud factor the core uses (0.55 where the cloud fraction is missing). */
export function diffuseShare(nFrac) {
  const cf = Number.isFinite(nFrac) ? cloudFactor(nFrac) : 0.55;
  return Math.min(1, Math.max(SUN_DIFFUSE_CLEAR, SUN_DIFFUSE_CLEAR + (1 - SUN_DIFFUSE_CLEAR) * (1 - cf) / (1 - CF_MIN)));
}

/**
 * The terrain series at elevation `zM`: `gFlat`, `n` = the forcing's radiation and cloud fraction, `cosZ(i)` = the flat cosine of step i as the core
 * computes it (at the middle of the step), `t0Ms` = start of step 0.
 */
export function terrainG({ table, entry, zM, gFlat, n, cosZ, t0Ms }) {
  const out = new Float64Array(gFlat.length), svf = sunSvf(entry, zM);
  for (let i = 0; i < gFlat.length; i++) {
    const g = gFlat[i];
    if (!(g > 0)) { out[i] = 0; continue; }
    const cz = cosZ(i), d = diffuseShare(n[i]);
    const direct = cz < SUN_COSZ_MIN ? 0 : Math.min(sunC(table, entry, zM, t0Ms + i * H) / cz, SUN_RATIO_MAX);
    out[i] = g * ((1 - d) * direct + d * svf);
  }
  return out;
}
