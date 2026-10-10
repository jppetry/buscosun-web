// Phase RG — RG-0: how the 250-m downscaling distributes a 1-km block's mass (concentration), measured on a real slot.
// Usage: … hd250-probe.mjs <rv _000-hd5 or tar> <sitesDir>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { untar } from '../../src/sources/radolanDecode.ts';
import { decodeRvHdf5, isHdf5 } from '../../src/sources/rvHdf5.ts';
import { PX250_SITES, decodePx250 } from '../../src/sources/dwdPx250.ts';
import { compositePx250, anchorToRv, HD250_COLS } from '../../src/sources/radarHd250.ts';
const [src, sitesDir] = process.argv.slice(2);
const raw = readFileSync(src); let ab;
if (/\.tar$/.test(src)) { const e0 = untar(new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)).find((e) => /_000-hd5$/.test(e.name)); ab = e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength); }
else ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const rv = await decodeRvHdf5(ab, { name: 'rv' });            // RADOLAN units = what the producer uses
const rvNat = await decodeRvHdf5(ab, { name: 'rv', units: 'native' });
const grids = [];
for (const site of PX250_SITES) { const p = join(sitesDir, `${site.id}.h5`); try { const b = readFileSync(p); grids.push(await decodePx250(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), { name: site.id })); } catch (e) { console.log(`${site.id}: ${e.message}`); } }
const comp = compositePx250(grids);
const field = anchorToRv(rv.rainRate, comp);
console.log(`sites ${grids.length}, wet blocks ${field.wetBlocks}, structured ${field.structuredBlocks}, flat ${field.flatBlocks}`);
// per wet block: max/mean, wet cells, share of mass in the max cell; stratified by RV value class
const strata = [['nativ < 0,06', (v) => v < 0.06], ['0,06–0,12', (v) => v >= 0.06 && v < 0.12], ['0,12–0,5', (v) => v >= 0.12 && v < 0.5], ['≥ 0,5', (v) => v >= 0.5]];
const acc = strata.map(() => ({ n: 0, ratio: [], oneCell: 0, le2: 0, maxShare50: 0, spikeGe1: [] }));
for (let j = 0; j < 1200; j++) for (let i = 0; i < 1100; i++) {
  const v = rv.rainRate[j * 1100 + i]; if (!(v > 0)) continue; const vn = rvNat.rainRate[j * 1100 + i];
  let sum = 0, mx = 0, wetc = 0; for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) { const r = field.rate[(j * 4 + dy) * HD250_COLS + i * 4 + dx]; sum += r; if (r > mx) mx = r; if (r > 0) wetc++; }
  const s = strata.findIndex(([, f]) => f(vn)); const a = acc[s]; a.n++; a.ratio.push(mx / (sum / 16)); if (wetc === 1) a.oneCell++; if (wetc <= 2) a.le2++; if (mx / sum >= 0.5) a.maxShare50++; a.spikeGe1.push(mx);
}
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
for (let s = 0; s < strata.length; s++) { const a = acc[s]; if (!a.n) continue; console.log(`${strata[s][0].padEnd(12)} Blöcke ${String(a.n).padStart(6)} · max/Mittel p50 ${q(a.ratio, 0.5).toFixed(2)} p90 ${q(a.ratio, 0.9).toFixed(2)} p99 ${q(a.ratio, 0.99).toFixed(2)} · 1 nasse Zelle ${(100 * a.oneCell / a.n).toFixed(1)} % · ≤ 2 ${(100 * a.le2 / a.n).toFixed(1)} % · ≥ 50 % der Masse in einer Zelle ${(100 * a.maxShare50 / a.n).toFixed(1)} % · Spitze p50 ${q(a.spikeGe1, 0.5).toFixed(2)} p90 ${q(a.spikeGe1, 0.9).toFixed(2)} mm/h`); }
