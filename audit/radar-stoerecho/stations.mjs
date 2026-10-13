// Phase SE — Nachtrag A1 (§5a) and R-SE-5: the outcome of the six rule variants (Basis, N, R85, R90, N + R85, N + R90),
// each without and with the fill, at every blue station pixel of every collected slot — computed with the producer's
// own functions (`siteVote`; the fill exactly as `clutterMask` does it, on the 5 × 5 neighbourhood of the station cell).
// Output: <out>/st-<slot>.json = { slot, validAt, sites, withSweep, rows: [[stationIndex, [vote, filled] × 6], …] }
// (vote: 0 none, 1 "no precipitation", 2 precipitation; filled: 1 = the fill would mask the unvoted cell).
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-stoerecho/stations.mjs
//          <store> <extractDir> --out=<dir> [--part=0/4] [--only=slot,…]
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { untar } from '../../src/sources/radolanDecode.ts';
import { decodeRvHdf5 } from '../../src/sources/rvHdf5.ts';
import { decodePx250, PX250_SITES } from '../../src/sources/dwdPx250.ts';
import { decodeSweep } from '../../src/sources/dwdSweep.ts';
import { siteRho, siteLattice, sameScan, siteBlocks, siteVote, CLUTTER_RULE, RV_COLS, RV_ROWS } from '../../src/sources/radarClutter.ts';
import { RADAR_DISPLAY_MIN_MMH } from '../../src/scalar/radarHd.ts';

export const VARIANTS = [
  ['Basis', {}], ['N', { neighbourVote: true }], ['R85', { rhoMaxRich: 0.85 }], ['R90', { rhoMaxRich: 0.90 }],
  ['N + R85', { neighbourVote: true, rhoMaxRich: 0.85 }], ['N + R90', { neighbourVote: true, rhoMaxRich: 0.90 }],
];
const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? '1']; }));
const [store, exDir] = args.filter((a) => !a.startsWith('--'));
if (store) {
  const out = opt.out ?? 'C:/dev/buscosun-radar-truth/se-stations';
  mkdirSync(out, { recursive: true });
  const [part, parts] = (opt.part ?? '0/1').split('/').map(Number);
  const stations = JSON.parse(readFileSync(join(exDir, 'stations.json'), 'utf8'));
  const only = opt.only ? new Set(opt.only.split(',')) : null;
  const slots = readdirSync(store).filter((d) => /^\d{8}_\d{4}$/.test(d)).sort().filter((d, i) => (only ? only.has(d) : i % parts === part));
  const inflate = (b) => inflateSync(b);
  const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
  const rules = VARIANTS.map(([, o]) => ({ ...CLUTTER_RULE, rhoMax: 0.8, zCapDbz: 15, kernel: 3, neighbourVote: false, rhoMaxRich: 0.8, ...o }));
  const lattices = new Map();
  const t0 = Date.now();
  for (const [n, slot] of slots.entries()) {
    const file = join(out, `st-${slot}.json`);
    if (existsSync(file) && !opt.force) continue;
    const dir = join(store, slot);
    if (!existsSync(join(dir, 'rv.tar'))) continue;
    const tarBuf = readFileSync(join(dir, 'rv.tar'));
    const e0 = untar(new Uint8Array(tarBuf.buffer, tarBuf.byteOffset, tarBuf.byteLength)).find((e) => /_000-hd5$/.test(e.name));
    if (!e0) continue;
    const rv = await decodeRvHdf5(e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength), { units: 'native', name: e0.name });
    const blocks = [];
    let withSweep = 0;
    for (const site of PX250_SITES) {
      const pg = join(dir, `px250-${site.id}.h5`), ps = join(dir, `rhohv-${site.id}.h5`);
      if (!existsSync(pg)) continue;
      let g; try { g = await decodePx250(ab(pg), { name: pg, inflate }); } catch { continue; }
      if (g.timeMs !== rv.validAt.getTime()) continue;
      let sr = null, dbz0 = NaN;
      if (existsSync(ps)) { try { const sw = await decodeSweep(ab(ps), { name: ps, inflate }); if (sameScan(g, sw)) { const key = `${g.site}|${g.x0}|${g.y0}`; if (!lattices.has(key)) lattices.set(key, siteLattice(g)); sr = siteRho(g, sw, lattices.get(key)); dbz0 = sw.dbz0; withSweep++; } } catch { /* fail-open */ } }
      blocks.push(siteBlocks(g, sr, dbz0, CLUTTER_RULE));
    }
    const wetAt = (i, j) => i >= 0 && j >= 0 && i < RV_COLS && j < RV_ROWS && rv.rainRate[j * RV_COLS + i] >= RADAR_DISPLAY_MIN_MMH - 1e-6;
    const cellVote = (i, j, rule) => { let v = 0; for (const sb of blocks) { const s = siteVote(sb, i, j, rule); if (s === 2) return 2; if (s === 1) v = 1; } return v; };
    const rows = [];
    for (const [si, s] of stations.entries()) {
      if (!s.covered || !wetAt(s.col, s.row)) continue;
      const flags = [];
      for (const rule of rules) {
        const v = cellVote(s.col, s.row, rule);
        let filled = 0;
        if (v === 0) {
          let c = 0, pr = false;
          for (let dj = -2; dj <= 2 && !pr; dj++) for (let di = -2; di <= 2; di++) {
            if (!wetAt(s.col + di, s.row + dj)) continue;
            const vv = cellVote(s.col + di, s.row + dj, rule);
            if (vv === 2) { pr = true; break; }
            if (vv === 1) c++;
          }
          filled = !pr && c >= 3 ? 1 : 0;
        }
        flags.push(v, filled);
      }
      rows.push([si, flags]);
    }
    writeFileSync(file, JSON.stringify({ slot, validAt: rv.validAt.toISOString(), sites: blocks.length, withSweep, rows }));
    if (only || n % 10 === 0) console.log(`${slot} (${n + 1}/${slots.length}) ${((Date.now() - t0) / 1000).toFixed(0)} s · Stationen blau ${rows.length} · Standorte ${blocks.length}/${withSweep}`);
  }
  console.log(`fertig: ${slots.length} Slots in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
