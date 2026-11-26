/**
 * Reader for the height cube `atmo/v1` (contract `src/atmosphere/atmoContract.ts`, only imported) in the glacier job:
 * the nearest column of the newest run for a lat/lon — per level the height above MSL, per step temperature,
 * relative humidity and wind (u, v).
 *
 * Read over raw.githubusercontent like `scripts/sea/sea-sight.mjs` reads the ICON-D2 repack (no workflow change), or
 * from a local directory (`dirAtmo`, the repo root that holds `atmo/v1/`). Only the tiles asked for are loaded.
 * Every failure (index, run, tile, column) is a returned `{ why }` — never a throw, never a silent null.
 *
 * CLI:
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/lib/column.mjs --count \
 *        [--atmo-dir=<repo root with atmo/v1>] [--catalog=<catalog.json>]
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ATMO_INDEX_PATH, ATMO_SCHEMA, TILE_CELLS, runMs, gridCellOf, tileExtent, tilePath, decodeAtmoTile,
} from '../../../src/atmosphere/atmoContract.ts';

const UA = 'buscosun-glacier (buscosun-web/scripts/glacier/lib/column.mjs)';
export const ATMO_RAW_BASE = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
const GLACIER_RAW_BASE = 'https://raw.githubusercontent.com/jppetry/buscosun-data/glacier/glacier/v1';

// --- where atmo/v1 is read from -------------------------------------------------------------------------------

/** `bytes(path)` → `{ buf }` or `{ why }`. */
export function httpAtmo(base = ATMO_RAW_BASE, fetchImpl = fetch) {
  const bytes = async (path) => {
    try {
      const r = await fetchImpl(`${base}/${path}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60_000) });
      if (!r.ok) return { why: `HTTP ${r.status} ${path}` };
      return { buf: new Uint8Array(await r.arrayBuffer()) };
    } catch (e) { return { why: `Abruf ${path}: ${e?.name ?? 'Fehler'} ${e?.message ?? ''}`.trim() }; }
  };
  return { kind: 'http', bytes };
}
export function dirAtmo(dir) {
  const bytes = async (path) => {
    const f = join(dir, path);
    if (!existsSync(f)) return { why: `fehlt: ${path}` };
    try { return { buf: new Uint8Array(readFileSync(f)) }; } catch (e) { return { why: `lesen ${path}: ${e?.message}` }; }
  };
  return { kind: 'dir', bytes };
}

// --- reader ----------------------------------------------------------------------------------------------------

/**
 * Opens the newest run of the index. Returns `{ run, runAt, levels, steps, column(lat, lon), preload(points), stats }`
 * or `{ why }`. `column` resolves to `{ col }` or `{ why }`; tiles are cached per reader.
 */
export async function openAtmo(src) {
  const stats = { tiles: 0, bytes: 0, tileFailures: 0 };
  const ix = await src.bytes(ATMO_INDEX_PATH);
  if (ix.why) return { why: `Index des Höhenwürfels: ${ix.why}` };
  stats.bytes += ix.buf.length;
  let index;
  try { index = JSON.parse(new TextDecoder().decode(ix.buf)); } catch { return { why: 'Index des Höhenwürfels ist kein JSON.' }; }
  if (index?.schema !== ATMO_SCHEMA) return { why: `Index des Höhenwürfels: Schema ${index?.schema}, Leser kennt ${ATMO_SCHEMA}.` };
  const runs = (Array.isArray(index.runs) ? index.runs : []).filter((r) => typeof r?.run === 'string' && /^\d{10}$/.test(r.run) && r.tiles > 0)
    .sort((a, b) => (a.run < b.run ? 1 : -1));
  if (!runs.length) return { why: 'Der Index des Höhenwürfels nennt keinen Lauf mit Kacheln.' };
  const { run, runAt } = runs[0];

  const tiles = new Map(); // key → Promise<{ header, columns } | { why }>
  const loadTile = (ty, tx) => {
    const key = `${ty}_${tx}`;
    if (!tiles.has(key)) tiles.set(key, (async () => {
      const r = await src.bytes(tilePath(run, ty, tx));
      if (r.why) { stats.tileFailures++; return { why: `Kachel ${key} des Laufs ${run}: ${r.why}` }; }
      stats.tiles++; stats.bytes += r.buf.length;
      try {
        const d = await decodeAtmoTile(r.buf);
        if (d.header.run !== run) return { why: `Kachel ${key} trägt Lauf ${d.header.run} statt ${run}.` };
        return d;
      } catch (e) { stats.tileFailures++; return { why: `Kachel ${key} des Laufs ${run}: ${e?.message}` }; }
    })());
    return tiles.get(key);
  };
  const tileOf = (lat, lon) => {
    const c = gridCellOf(lat, lon);
    if (!c) return null;
    return { ...c, ty: Math.floor(c.iy / TILE_CELLS), tx: Math.floor(c.ix / TILE_CELLS) };
  };

  async function column(lat, lon) {
    const t = tileOf(lat, lon);
    if (!t) return { why: 'Ort außerhalb des Gitters des Höhenwürfels.' };
    const d = await loadTile(t.ty, t.tx);
    if (d.why) return { why: d.why };
    const e = tileExtent(t.ty, t.tx);
    const c = d.columns[(t.iy - e.y0) * e.nx + (t.ix - e.x0)];
    if (!c) return { why: `Spalte ${t.iy}/${t.ix} fehlt in der Kachel.` };
    const nLev = d.header.levels.length;
    if (!Array.from(c.z).every(Number.isFinite)) return { why: `Spalte ${t.iy}/${t.ix}: Höhen fehlen.` };
    return {
      col: {
        run, lat: c.lat, lon: c.lon, cellLat: c.cellLat, cellLon: c.cellLon, distKm: distKm(lat, lon, c.cellLat, c.cellLon),
        hsurf: c.hsurf, levels: d.header.levels, steps: d.header.steps, nLev,
        /** Heights above MSL per level, lowest first. */
        z: c.z,
        /** `[step * nLev + level]`, physical units, NaN = missing. */
        t: c.values.t, rh: c.values.rh, u: c.values.u, v: c.values.v,
      },
    };
  }
  /** Loads all tiles the points need, in parallel (deckel `conc`). */
  async function preload(points, conc = 6) {
    const keys = [...new Map(points.map((p) => tileOf(p.lat, p.lon)).filter(Boolean).map((t) => [`${t.ty}_${t.tx}`, t])).values()];
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(conc, keys.length) }, async () => { while (i < keys.length) { const k = keys[i++]; await loadTile(k.ty, k.tx); } }));
    return keys.length;
  }
  return { run, runAt, levels: index.levels, steps: index.steps, column, preload, stats };
}

// --- pure functions on a column ----------------------------------------------------------------------------------

/** `free` reference: the first level at least this far above the lowest (m, `set`). */
export const FREE_REF_ABOVE_LOWEST_M = 150;

/**
 * Values at elevation `zM` (m MSL) in step index `step`, linear in height between the two bracketing levels.
 * `{ v: { t, rh, ws, wd }, why: null }` (°C, %, m/s, degrees the wind comes FROM) or `{ v: null, why }`,
 * why ∈ 'below' | 'above' | 'step' | 'missing'. Never extrapolated.
 */
export function columnAt(col, zM, step) {
  const n = col.nLev, z = col.z;
  if (!Number.isInteger(step) || step < 0 || step >= col.steps.length) return { v: null, why: 'step' };
  if (!(zM >= z[0])) return { v: null, why: 'below' };
  if (!(zM <= z[n - 1])) return { v: null, why: 'above' };
  let l = 0;
  while (l < n - 2 && z[l + 1] < zM) l++;
  const w = z[l + 1] === z[l] ? 0 : (zM - z[l]) / (z[l + 1] - z[l]);
  const o = step * n;
  const at = (a) => a[o + l] + w * (a[o + l + 1] - a[o + l]);
  const t = at(col.t), rh = at(col.rh), u = at(col.u), vv = at(col.v);
  if (![t, rh, u, vv].every(Number.isFinite)) return { v: null, why: 'missing' };
  const ws = Math.hypot(u, vv);
  const wd = ws > 0 ? (Math.atan2(-u, -vv) * 180 / Math.PI + 360) % 360 : null;
  return { v: { t, rh, ws, wd }, why: null };
}

/** Temperature at `zTo` minus temperature at `zFrom` (K) from the column, null if either is outside or missing. */
export function lapseDelta(col, zFrom, zTo, step) {
  const a = columnAt(col, zFrom, step), b = columnAt(col, zTo, step);
  return a.v && b.v ? b.v.t - a.v.t : null;
}

/** Reference elevation of a column: `ground` = lowest level, `free` = first level ≥ FREE_REF_ABOVE_LOWEST_M above it. `{ zM, level }` or null. */
export function refLevel(col, variant) {
  const z = col.z;
  if (variant === 'ground') return { zM: z[0], level: 0 };
  if (variant === 'free') {
    for (let l = 1; l < col.nLev; l++) if (z[l] - z[0] >= FREE_REF_ABOVE_LOWEST_M) return { zM: z[l], level: l };
    return null;
  }
  return null;
}

/** Step index of run `run` (`YYYYMMDDHH`) valid at `tMs` (nearest full hour), null outside 0…48 h. */
export function stepOf(run, tMs) {
  const h = Math.round((tMs - runMs(run)) / 3_600_000);
  return Number.isFinite(h) && h >= 0 && h <= 48 ? h : null;
}

function distKm(la1, lo1, la2, lo2) {
  const r = Math.PI / 180, dla = (la2 - la1) * r, dlo = (lo2 - lo1) * r;
  const a = Math.sin(dla / 2) ** 2 + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dlo / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// --- CLI --count -----------------------------------------------------------------------------------------------

async function loadCatalog(path) {
  if (path) return JSON.parse(readFileSync(resolve(path), 'utf8')).glaciers;
  const ix = await fetch(`${ATMO_RAW_BASE}/glacier/v1/index.json`, { headers: { 'user-agent': UA } });
  if (!ix.ok) throw new Error(`Gletscher-Index HTTP ${ix.status}`);
  const build = (await ix.json()).static.build;
  const r = await fetch(`${GLACIER_RAW_BASE}/static/${build}/catalog.json`, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`Gletscher-Katalog ${build} HTTP ${r.status}`);
  return (await r.json()).glaciers;
}

async function countMain(args) {
  const t0 = performance.now();
  const glaciers = await loadCatalog(args.catalog);
  const atmo = await openAtmo(args['atmo-dir'] ? dirAtmo(resolve(args['atmo-dir'])) : httpAtmo());
  if (atmo.why) { console.log(JSON.stringify({ why: atmo.why })); process.exitCode = 1; return; }
  const tilesNeeded = await atmo.preload(glaciers);
  const dist = [], reasons = {};
  const inside = [0, 0, 0];
  const lapse = { ground: [], free: [] };
  for (const g of glaciers) {
    const r = await atmo.column(g.lat, g.lon);
    if (r.why) { reasons[r.why] = (reasons[r.why] ?? 0) + 1; continue; }
    const c = r.col;
    dist.push(c.distKm);
    const lo = c.z[0], hi = c.z[c.nLev - 1];
    for (const vr of ['ground', 'free']) {
      const ref = refLevel(c, vr), zg = g.z?.[1];
      if (!ref || !Number.isFinite(zg) || Math.abs(zg - ref.zM) < 1) continue;
      const d = lapseDelta(c, ref.zM, zg, 12);
      if (d != null) lapse[vr].push(d / ((zg - ref.zM) / 1000));
    }
    (g.z ?? []).forEach((zz, k) => { if (Number.isFinite(zz) && zz >= lo && zz <= hi) inside[k]++; });
  }
  dist.sort((a, b) => a - b);
  const q = (p) => (dist.length ? +dist[Math.min(dist.length - 1, Math.floor(p * (dist.length - 1) + 0.5))].toFixed(2) : null);
  console.log(JSON.stringify({
    run: atmo.run, glaciers: glaciers.length, withColumn: dist.length,
    distKm: { median: q(0.5), max: dist.length ? +dist[dist.length - 1].toFixed(2) : null },
    insideColumn: { tongue: inside[0], median: inside[1], top: inside[2] },
    lapseKPerKmStep12: Object.fromEntries(Object.entries(lapse).map(([k, a]) => { a.sort((x, y) => x - y); return [k, { n: a.length, median: a.length ? +a[a.length >> 1].toFixed(2) : null }]; })),
    tiles: { needed: tilesNeeded, read: atmo.stats.tiles, failed: atmo.stats.tileFailures }, bytes: atmo.stats.bytes,
    seconds: +((performance.now() - t0) / 1000).toFixed(1), reasons,
  }, null, 1));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  if (args.count) await countMain(args);
  else console.log('usage: column.mjs --count [--atmo-dir=<dir>] [--catalog=<catalog.json>]');
}
