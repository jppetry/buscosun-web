// Phase SE — radar-only look at ρHV against signal-to-noise (no station truth, no rule): for the given slots and sites,
// every px250 echo cell with a ρHV value goes into a table SNR class × ρHV quantiles. Answers §2.5: does URHOHV of real
// rain drop with falling SNR (then the rule must know the SNR), and where does the bird echo sit?
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-stoerecho/explore-rho.mjs
//          <store> --slots=20261011_0905,20261011_1005 [--sites=oft,nhb] [--az=285-360] [--range=25-90]
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { decodePx250, PX250_SITES } from '../../src/sources/dwdPx250.ts';
import { decodeSweep } from '../../src/sources/dwdSweep.ts';
import { siteRho, siteLattice, sameScan, snrDb, rhoNoiseCorrected } from '../../src/sources/radarClutter.ts';

const [store, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const slots = opt.slots.split(',');
const sites = opt.sites ? opt.sites.split(',') : PX250_SITES.map((s) => s.id);
const [az0, az1] = (opt.az ?? '0-360').split('-').map(Number), [r0, r1] = (opt.range ?? '0-150').split('-').map(Number);
const inflate = (b) => inflateSync(b);
const ab = (p) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const SNR_EDGES = [-10, 0, 3, 6, 9, 12, 15, 20, 25, 30, 40, 80];
const bins = SNR_EDGES.slice(0, -1).map(() => []);
const zBins = [[-40, 0], [0, 5], [5, 10], [10, 15], [15, 20], [20, 30], [30, 80]].map((r) => ({ r, v: [] }));
let cells = 0, dbz0s = new Map();
const OFFS = (opt.offsets ?? '').split(',').filter(Boolean).map(Number);
const corr = OFFS.map(() => SNR_EDGES.slice(0, -1).map(() => []));
for (const slot of slots) for (const site of sites) {
  const pg = join(store, slot, `px250-${site}.h5`), ps = join(store, slot, `rhohv-${site}.h5`);
  if (!existsSync(pg) || !existsSync(ps)) continue;
  const g = await decodePx250(ab(pg), { name: pg, inflate }), sw = await decodeSweep(ab(ps), { name: ps, inflate });
  if (!sameScan(g, sw)) { console.log(`${slot} ${site}: Scan passt nicht (${new Date(g.timeMs).toISOString()} / ${new Date(sw.slotMs).toISOString()})`); continue; }
  dbz0s.set(site, sw.dbz0);
  const sr = siteRho(g, sw, siteLattice(g));
  const S = g.size, c = S / 2;
  for (let b = 0; b < S; b++) for (let a = 0; a < S; a++) {
    const k = b * S + a, rho = sr.rho[k]; if (!(rho === rho)) continue;
    const rk = sr.rangeKm[k]; if (rk < r0 || rk >= r1) continue;
    if (az0 !== 0 || az1 !== 360) { const az = (Math.atan2(a - c, c - b) * 180 / Math.PI + 360) % 360; if (az < az0 || az >= az1) continue; }
    const z = g.dbz[k], snr = snrDb(z, rk, sw.dbz0);
    let i = SNR_EDGES.findIndex((e) => snr < e) - 1; if (i < 0) i = snr < SNR_EDGES[0] ? 0 : bins.length - 1;
    bins[Math.min(bins.length - 1, i)].push(rho);
    if (OFFS.length && (cells % 7) === 0) OFFS.forEach((o, oi) => { const se = snr - o; let ii = SNR_EDGES.findIndex((e) => se < e) - 1; if (ii < 0) ii = se < SNR_EDGES[0] ? 0 : bins.length - 1; corr[oi][Math.min(bins.length - 1, ii)].push(rhoNoiseCorrected(rho, se)); });
    zBins.find((zb) => z >= zb.r[0] && z < zb.r[1])?.v.push(rho);
    cells++;
  }
}
const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))].toFixed(3) : '—';
console.log(`${slots.length} Slots (${slots[0]} … ${slots.at(-1)}), Standorte ${sites.join(',')}, Azimut ${az0}–${az1}°, ${r0}–${r1} km: ${cells} Echo-Zellen mit ρHV · dBZ0 ${[...dbz0s.entries()].map(([s, v]) => `${s} ${v.toFixed(1)}`).join(' ')}`);
console.log('SNR dB        n        ρHV p05   p10   p25   p50   p75   p90   | < 0,8   < 0,9   ≥ 0,95');
bins.forEach((arr, i) => { arr.sort((x, y) => x - y); const f = (t, ge) => arr.length ? (100 * arr.filter((x) => ge ? x >= t : x < t).length / arr.length).toFixed(1).padStart(5) + ' %' : '    —'; console.log(`${String(SNR_EDGES[i]).padStart(4)} … ${String(SNR_EDGES[i + 1]).padStart(3)} ${String(arr.length).padStart(9)}   ${q(arr, 0.05)} ${q(arr, 0.1)} ${q(arr, 0.25)} ${q(arr, 0.5)} ${q(arr, 0.75)} ${q(arr, 0.9)} | ${f(0.8)} ${f(0.9)} ${f(0.95, true)}`); });
console.log('dBZ           n        ρHV p10   p50   p90');
zBins.forEach(({ r, v }) => { v.sort((x, y) => x - y); console.log(`${String(r[0]).padStart(4)} … ${String(r[1]).padStart(3)} ${String(v.length).padStart(9)}   ${q(v, 0.1)} ${q(v, 0.5)} ${q(v, 0.9)}`); });

// §2.5: the offset that makes the corrected median flat over the effective SNR classes (every 7th cell)
if (OFFS.length) {
  console.log('Median des korrigierten ρHV je Klasse des EFFEKTIVEN SNR (dB): ' + SNR_EDGES.slice(1, -1).map((e, i) => `${SNR_EDGES[i + 1]}…${SNR_EDGES[i + 2]}`).join(' | '));
  OFFS.forEach((o, oi) => { const med = corr[oi].slice(1).map((a) => { a.sort((x, y) => x - y); return a.length > 200 ? a[Math.floor(a.length / 2)] : NaN; }); const use = med.slice(1, 6).filter((x) => x === x); const spread = Math.max(...use) - Math.min(...use); console.log(`  Versatz ${o.toFixed(1)} dB: ${med.map((m) => m === m ? m.toFixed(3) : '—').join(' | ')}   Spanne 3…20 dB: ${spread.toFixed(3)}`); });
}
