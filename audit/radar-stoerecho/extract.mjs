// Phase SE — SE-1 step A: per collected slot, the RV analysis value at every DWD 10-min station and, where the station's
// pixel is blue (native ≥ 0,06 mm/h), every site's block statistic there (kernel 1 and 3) — the inputs of the whole rule
// family of §4.2, so the scorer applies any (rhoMax, zCap, kernel) without touching the radar files again.
// The statistics come from the producer's own functions (`src/sources/radarClutter.ts`).
// Output: <out>/stations.json and one <out>/slot-<JJJJMMTT_HHMM>.json per slot:
//   { slot, validAt, sites:[…], missing:[…], blue, nat: base64 Float32 per station (NaN = no radar),
//     rows: [[stationIndex, [[siteIndex, hasSweep, nEv1, zMax1, med1, nEv3, zMax3, med3], …]], …] }
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-stoerecho/extract.mjs
//          <store> <stationsTxt…> --out=<dir> [--part=0/4] [--only=20261012_2235,…]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { untar } from '../../src/sources/radolanDecode.ts';
import { decodeRvHdf5 } from '../../src/sources/rvHdf5.ts';
import { psFwd, DE1200_CORNERS } from '../../src/sources/radolanGeo.ts';
import { DWD_RADAR_SITES, DWD_RADAR_RANGE_KM } from '../../src/point/sourceMatrix.ts';
import { decodePx250, PX250_SITES } from '../../src/sources/dwdPx250.ts';
import { decodeSweep } from '../../src/sources/dwdSweep.ts';
import { siteRho, siteLattice, sameScan, siteBlocks, blockStat, CLUTTER_SNR_OFFSET_DB, CLUTTER_SNR_MIN_DB } from '../../src/sources/radarClutter.ts';
import { RADAR_DISPLAY_MIN_MMH } from '../../src/scalar/radarHd.ts';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [store, ...stationFiles] = args.filter((a) => !a.startsWith('--'));
const out = opt.out ?? 'C:/dev/buscosun-radar-truth/se-extract';
mkdirSync(out, { recursive: true });
const [part, parts] = (opt.part ?? '0/1').split('/').map(Number);

// --- stations (DWD description files, fixed-width, latin1) — as audit/radar-regenschwelle/extract.mjs ---
const stations = new Map();
for (const f of stationFiles) {
  for (const line of readFileSync(f, 'latin1').split(/\r?\n/).slice(2)) {
    const m = /^(\d{5})\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(.+?)\s{2,}(\S.*?)\s{2,}/.exec(line);
    if (m && !stations.has(+m[1])) stations.set(+m[1], { id: +m[1], elev: +m[4], lat: +m[5], lon: +m[6], name: m[7].trim() });
  }
}
const [NW, NE, , SW] = DE1200_CORNERS;
const pNW = psFwd(...NW), pNE = psFwd(...NE), pSW = psFwd(...SW);
const hav = (a, b, c, d) => { const R = 6371, t = Math.PI / 180, dl = (c - a) * t, dn = (d - b) * t, h = Math.sin(dl / 2) ** 2 + Math.cos(a * t) * Math.cos(c * t) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const list = [...stations.values()].sort((a, b) => a.id - b.id);
for (const s of list) {
  const [x, y] = psFwd(s.lon, s.lat);
  const u = (x - pNW[0]) / (pNE[0] - pNW[0]), v = (y - pNW[1]) / (pSW[1] - pNW[1]);
  s.col = Math.floor(u * 1100); s.row = Math.floor(v * 1200);
  s.siteKm = Math.min(...DWD_RADAR_SITES.map(([la, lo]) => hav(s.lat, s.lon, la, lo)));
  s.covered = u >= 0 && u < 1 && v >= 0 && v < 1 && s.siteKm <= DWD_RADAR_RANGE_KM;
}
if (part === 0) writeFileSync(join(out, 'stations.json'), JSON.stringify(list));

const inflate = (b) => inflateSync(b);
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const only = opt.only ? new Set(opt.only.split(',')) : null;
const slots = readdirSync(store).filter((d) => /^\d{8}_\d{4}$/.test(d)).sort().filter((d, i) => (only ? only.has(d) : i % parts === part));
const P = { snrMinDb: CLUTTER_SNR_MIN_DB, snrOffsetDb: CLUTTER_SNR_OFFSET_DB };
const lattices = new Map();
const t0 = Date.now();
for (const [n, slot] of slots.entries()) {
  const file = join(out, `slot-${slot}.json`);
  if (existsSync(file) && !opt.force) continue;
  const dir = join(store, slot);
  if (!existsSync(join(dir, 'rv.tar'))) { console.log(`${slot}: ohne rv.tar`); continue; }
  const tar = readFileSync(join(dir, 'rv.tar'));
  const e0 = untar(new Uint8Array(tar.buffer, tar.byteOffset, tar.byteLength)).find((e) => /_000-hd5$/.test(e.name));
  const rv = await decodeRvHdf5(e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength), { units: 'native', name: e0.name });
  const blocks = [], sites = [], missing = [];
  for (const site of PX250_SITES) {
    const pg = join(dir, `px250-${site.id}.h5`), ps = join(dir, `rhohv-${site.id}.h5`);
    if (!existsSync(pg)) { missing.push(`${site.id}:px250`); continue; }
    let g;
    try { g = await decodePx250(ab(pg), { name: pg, inflate }); } catch (e) { missing.push(`${site.id}:px250 ${e.message}`); continue; }
    if (g.timeMs !== rv.validAt.getTime()) { missing.push(`${site.id}:px250 Zeit`); continue; }
    let sr = null, dbz0 = NaN;
    if (existsSync(ps)) {
      try {
        const sw = await decodeSweep(ab(ps), { name: ps, inflate });
        if (sameScan(g, sw)) {
          const key = `${g.site}|${g.x0}|${g.y0}`;
          if (!lattices.has(key)) lattices.set(key, siteLattice(g));
          sr = siteRho(g, sw, lattices.get(key)); dbz0 = sw.dbz0;
        } else missing.push(`${site.id}:rhohv Zeit`);
      } catch (e) { missing.push(`${site.id}:rhohv ${e.message}`); }
    } else missing.push(`${site.id}:rhohv`);
    blocks.push(siteBlocks(g, sr, dbz0, P)); sites.push(site.id);
  }
  const nat = new Float32Array(list.length).fill(NaN);
  const rows = [];
  let blue = 0;
  for (let k = 0; k < rv.rainRate.length; k++) if (rv.rainRate[k] >= RADAR_DISPLAY_MIN_MMH - 1e-6) blue++;
  for (const [si, s] of list.entries()) {
    if (!s.covered) continue;
    const v = rv.rainRate[s.row * 1100 + s.col];
    nat[si] = v;
    if (!(v >= RADAR_DISPLAY_MIN_MMH - 1e-6)) continue;
    const per = [];
    for (const [bi, sb] of blocks.entries()) {
      const x = s.col - sb.i0, y = s.row - sb.j0;
      if (x < 0 || y < 0 || x >= sb.w || y >= sb.h || sb.nEcho[y * sb.w + x] === 0) continue;
      const a = blockStat(sb, s.col, s.row, 1), b = blockStat(sb, s.col, s.row, 3);
      const r3 = (x) => (x === x && Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);
      per.push([bi, sb.hasSweep ? 1 : 0, a.nEv, r3(a.zMax), r3(a.med), b.nEv, r3(b.zMax), r3(b.med)]);
    }
    rows.push([si, per]);
  }
  writeFileSync(file, JSON.stringify({ slot, validAt: rv.validAt.toISOString(), sites, missing, blue, nat: Buffer.from(nat.buffer).toString('base64'), rows }));
  if (n % 10 === 0) console.log(`${slot} (${n + 1}/${slots.length}) ${((Date.now() - t0) / 1000).toFixed(0)} s · blau ${blue} · Stationen blau ${rows.length} · fehlt ${missing.length}`);
}
console.log(`fertig: ${slots.length} Slots in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
