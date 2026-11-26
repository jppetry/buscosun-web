#!/usr/bin/env node
/**
 * GM-11 phase 1b — forcing H: the hindcast slots of buscosun Fusion at one glacier for one winter, at three elevations
 * (tongue, median, top) with flat terrain at each, the way `scripts/glacier/melt.mjs` asks for its answers (`flatTerrain`).
 *
 * The engine is `fuseCubePoint` of the replayed release, imported from its Prüfstand worktree (read only; nothing under
 * src/pointForecast is changed). The input is the cube series of the glacier's archive point (its 2 × 2 block, PAP 3) of the
 * 00 UTC slot of each UTC day, tier t1 only ("day 0" before 17.06.2026); the engine is called per 3-h block with
 * nowMs = block start (V-HC-20, as the case builder of the learning stage), so every hour has lead 0–2 h. No station
 * product, no nowcast, no observations, no RUC — the hindcast carries none (V-GM-147).
 *
 * Writes ONLY `--out` (a JSON file outside the repo). One process, one glacier-winter.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/gletscher-schneemodell/gm11-hindcast-forcing.mjs \
 *     --glacier=<catId> --winter=<2024|2025|2026> --lat=<deg> --lon=<deg> --out=<json> [--release=fusion-12x]
 *
 * The scorer (`gm11-hindcast.mjs`) turns this file into the record the snow core reads; its negative control sends the
 * S series through that same builder.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), '1']; }));
const H = 3_600_000;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const HINDCAST = 'C:/dev/buscosun-hindcast';
const PRUEF = 'C:/dev/buscosun-pruefstand';
const INVENTORY = 'C:/dev/buscosun-glacier-cache/gm11/hindcast-inventory.json';
const release = args.release ?? 'fusion-12x';
const winter = +args.winter;
if (![2024, 2025, 2026].includes(winter)) throw new Error('--winter=2024|2025|2026');
// `--site=<id> --point=<archive point> --z=<m>[,<m>…]`: a site that is not a glacier (Weissfluhjoch, step 6)
const inv = args.site ? { id: args.site, name: args.site, points: [args.point], z: args.z.split(',').map(Number), cell: null, km: null, hmodel: null } : J(INVENTORY).find((g) => g.id === args.glacier);
if (!inv) throw new Error(`${args.glacier}: nicht im Bestand`);
if (inv.points.length !== 1) throw new Error(`${args.glacier}: ${inv.points.length} Archivpunkte`);
// hours: 1 Oct 00 UTC … 1 Jun 00 UTC of the winter (truth windows 1 Oct … 30 Apr + 24 h; points until 31 May)
const fromMs = Date.UTC(winter - 1, 9, 1), toMs = Date.UTC(winter, 5, 1), n = (toMs - fromMs) / H;
const freeMb = () => Math.round(os.freemem() / 2 ** 20);

const { loadEngine, loadTables, readHindcastSlot, features } = await import(pathToFileURL(join(REPO, 'scripts/pruefstand/lib/replay.mjs')).href);
const { seriesFromSlotTier, inputFromSlot } = await import(pathToFileURL(join(REPO, 'scripts/fusionfit/lib/slotAdapter.mjs')).href);
const { terrainScales } = await import(pathToFileURL(join(PRUEF, 'worktrees', release, 'src/pointForecast/fusion/terrainScale.ts')).href);
const reg = J(join(REPO, 'scripts/pruefstand/register', `${release}.json`));
for (const t of Object.values(reg.tables ?? {})) if (t && !t.path) t.path = t.from;
const eng = await loadEngine(join(PRUEF, 'worktrees', release));
const D = await import(pathToFileURL(join(PRUEF, 'worktrees', release, 'src/pointForecast/fusion/dist.ts')).href);
const tables = loadTables(reg);
const row = features().byPoint[inv.points[0]];
if (!row) throw new Error(`${inv.points[0]}: kein Merkmal`);
const lat = +args.lat, lon = +args.lon;
if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('--lat/--lon des Gletschers (aus der Wahrheit) fehlen');
const Z = inv.z;   // tongue, median, top
// flat terrain at h, as melt.mjs `flatTerrain` (the engine's own scale function)
const flat = (h) => ({ elevationM: h, tpi500M: 0, tpi2000M: 0, svf: 1, slopeDeg: 0, aspectDeg: null, horizonDeg: new Array(8).fill(0), scales: terrainScales(() => h, lon, lat), sinkDepthM: 0 });
const terr = Z.map(flat);
const opts = { ...reg.options, hourly: true, tail: true };

const out = { t: Z.map(() => new Array(n).fill(null)), p: Z.map(() => new Array(n).fill(null)), n: Z.map(() => new Array(n).fill(null)), ps: Z.map(() => new Array(n).fill(null)) };
const hMod = { cell: null, hModEffM: [] };
let calls = 0, errors = [], slotsRead = 0, slotsMissing = [], msSum = 0, minFree = freeMb();
for (let day = fromMs; day < toMs; day += 24 * H) {
  const d = new Date(day).toISOString().slice(0, 10);
  const path = join(HINDCAST, 'slots', d, '0000.json.gz');
  if (!existsSync(path)) { slotsMissing.push(d); continue; }
  const slot = readHindcastSlot(path); slotsRead++;
  if (!(slot.cube?.t1)) { slotsMissing.push(`${d}:t1`); continue; }
  const ser = seriesFromSlotTier(slot, 't1', inv.points[0]);
  if (!ser) { slotsMissing.push(`${d}:pt`); continue; }
  if (hMod.cell == null) hMod.cell = ser.cell;
  if (hMod.hModEffM.length < 3) hMod.hModEffM.push(ser.hModEffM);
  for (let b = 0; b < 8; b++) {
    const t0 = day + 3 * b * H;
    for (let k = 0; k < Z.length; k++) {
      const input = { ...inputFromSlot(slot, row, { t1: ser }, eng.clima, { nowMs: t0, window: { fromMs: t0, toMs: t0 + 2 * H, stepH: 1 } }),
        lat, lon, elevationM: Z[k], elevationFrom: 'glacier', terrain: terr[k],
        country: 'CH', learned: tables.learned, learnedClima: tables.clima, ...(tables.stack ? { stack: tables.stack } : {}) };
      let res; const c0 = performance.now();
      try { res = eng.fuseCubePoint(input, opts); } catch (e) { errors.push(`${d} ${b} ${k}: ${e?.message ?? e}`); continue; }
      msSum += performance.now() - c0; calls++;
      for (const st of res.steps) {
        const i = Math.round((st.validAtMs - fromMs) / H);
        if (i < 0 || i >= n || st.validAtMs < t0 || st.validAtMs > t0 + 2 * H || !st.fused) continue;
        const f = st.fused;
        out.t[k][i] = f.temperature ? D.meanOf(f.temperature.dist) : null;
        out.p[k][i] = f.precipitation ? D.meanOf(f.precipitation.dist) : null;
        out.n[k][i] = f.clouds ? D.meanOf(f.clouds.dist) / 100 : null;
        out.ps[k][i] = f.pSnow ?? null;
      }
    }
  }
  minFree = Math.min(minFree, freeMb());
}
const missing = Z.map((_, k) => ({ t: out.t[k].filter((v) => v == null || !Number.isFinite(v)).length, p: out.p[k].filter((v) => v == null || !Number.isFinite(v)).length }));
const doc = {
  kind: 'gm11/hindcast-forcing', glacier: inv.id, name: inv.name, winter, release, releaseName: reg.name, releaseCommit: reg.commit,
  engineRoot: join(PRUEF, 'worktrees', release), options: reg.options, tier: 't1', route: 'day0, 00 UTC slot, 3-h blocks, lead 0–2 h',
  point: inv.points[0], cellOfPoint: hMod.cell, hModEffM: hMod.hModEffM[0] ?? null, inventoryCell: inv.cell, inventoryKm: inv.km, hmodel: inv.hmodel,
  z: Z, lat, lon, fromMs, n, calls, errors: errors.length, firstErrors: errors.slice(0, 5), slotsRead, slotsMissing, missing,
  msPerCall: calls ? Math.round((msSum / calls) * 10) / 10 : null, minFreeMb: minFree,
  note: 'no station product, no nowcast, no observations, no RUC (not in the hindcast)', series: out,
};
mkdirSync(dirname(args.out), { recursive: true });
writeFileSync(args.out, JSON.stringify(doc));
console.log(JSON.stringify({ ...doc, series: undefined }));
