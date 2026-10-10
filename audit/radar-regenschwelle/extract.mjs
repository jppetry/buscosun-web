// Phase RG — RG-1 step A: radar values at every DWD 10-min station for every collected RV analysis.
// Reads the lead-0 analyses (`…_000-hd5`) from the store, decodes them NATIVELY (0,012-mm/h steps) and writes, per slot and
// station, the native rate at the pixel under the station and the maximum over 3 × 3 pixels. RADOLAN units are derived from
// the native value by the reader's own rule (max(1, ⌊mm / 0,01⌋) · 0,12) and verified against the reader on the first slot.
// Output: <out>/stations.json (id, lat, lon, name, pixel, nearest DWD site km, covered) and <out>/values.json
// (slots[], per slot Float32 arrays as base64: nat, nat3, rad) — scored by score.mjs.
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-regenschwelle/extract.mjs \
//          <rvAnalysisDir> <stationsTxt...> --out=<dir>
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodeRvHdf5 } from '../../src/sources/rvHdf5.ts';
import { psFwd, DE1200_CORNERS } from '../../src/sources/radolanGeo.ts';
import { DWD_RADAR_SITES, DWD_RADAR_RANGE_KM } from '../../src/point/sourceMatrix.ts';

const args = process.argv.slice(2);
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [rvDir, ...stationFiles] = args.filter((a) => !a.startsWith('--'));
const out = opt.out ?? 'C:/dev/buscosun-radar-truth/extract';
mkdirSync(out, { recursive: true });

// --- stations (DWD description files, fixed-width, latin1) ---
const stations = new Map();
for (const f of stationFiles) {
  const txt = readFileSync(f, 'latin1').split(/\r?\n/);
  for (const line of txt.slice(2)) {
    const m = /^(\d{5})\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(.+?)\s{2,}(\S.*?)\s{2,}/.exec(line);
    if (!m) continue;
    const id = +m[1];
    if (!stations.has(id)) stations.set(id, { id, elev: +m[4], lat: +m[5], lon: +m[6], name: m[7].trim(), state: m[8].trim() });
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
  s.inGrid = u >= 0 && u < 1 && v >= 0 && v < 1;
  s.siteKm = Math.min(...DWD_RADAR_SITES.map(([la, lo]) => hav(s.lat, s.lon, la, lo)));
  s.covered = s.inGrid && s.siteKm <= DWD_RADAR_RANGE_KM;
}
console.log(`stations ${list.length}, in grid ${list.filter((s) => s.inGrid).length}, within ${DWD_RADAR_RANGE_KM} km of a site ${list.filter((s) => s.covered).length}`);

// --- radar ---
const files = readdirSync(rvDir).filter((f) => /^composite_rv_\d{8}_\d{4}_000-hd5$/.test(f)).sort();
const slots = [];
const GAIN_UM = 1000, OFF_UM = -1000, UNIT_UM = 10000, MMH_PER_UNIT = 0.12;
const toRadolan = (nat) => { if (!(nat > 0) && nat !== 0) return nat; if (nat === 0) return 0; const um = Math.round(nat * 1e6 / 12); return Math.max(1, Math.floor(um / UNIT_UM)) * MMH_PER_UNIT; };
const b64 = (f32) => Buffer.from(f32.buffer, f32.byteOffset, f32.byteLength).toString('base64');
let nodataChecked = false, firstVerified = false;
const t0 = Date.now();
for (const [idx, f] of files.entries()) {
  const b = readFileSync(join(rvDir, f));
  const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  const g = await decodeRvHdf5(ab, { units: 'native', name: f });
  const gr = await decodeRvHdf5(ab, { units: 'radolan', name: f });   // raw value 1 (0,000 mm/h natively) is an echo here: 0,12
  if (g.leadMinutes !== 0) throw new Error(`${f}: lead ${g.leadMinutes}`);
  if (!firstVerified) {   // the derived RADOLAN rule must equal the reader's own output wherever the native value is > 0
    let bad = 0; for (let k = 0; k < gr.rainRate.length; k++) { const a = gr.rainRate[k], n = g.rainRate[k]; if (!(n > 0)) continue; if (Math.abs(a - toRadolan(n)) > 1e-6) bad++; }
    if (bad) throw new Error(`RADOLAN rule mismatch on ${f}: ${bad} cells`);
    firstVerified = true;
  }
  const nat = new Float32Array(list.length), nat3 = new Float32Array(list.length), rad = new Float32Array(list.length);
  let wetDomain = 0, land = 0;
  const rr = g.rainRate, rrad = gr.rainRate;
  // domain-wide histogram of native values (for the "blue area" curve): counts per step k·0,012 (k = 0 … 61, 61 = ≥ 0,732);
  // `echo` = pixels blue today (RADOLAN unit > 0, includes raw value 1 = native 0,000)
  const hist = new Uint32Array(62); let echo = 0;
  for (let k = 0; k < rr.length; k++) { const v = rr[k]; if (Number.isNaN(v)) continue; land++; const e = rrad[k] > 0; if (e) { echo++; wetDomain++; const step = Math.min(61, Math.round(v / 0.012)); hist[step]++; } }
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s.covered) { nat[i] = NaN; nat3[i] = NaN; rad[i] = NaN; continue; }
    const k0 = s.row * 1100 + s.col; const v = rr[k0];
    nat[i] = v; rad[i] = rrad[k0];
    let mx = Number.isNaN(v) ? NaN : 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const r = s.row + dj, c = s.col + di; if (r < 0 || r >= 1200 || c < 0 || c >= 1100) continue; const w = rr[r * 1100 + c]; if (w > mx) mx = w; }
    nat3[i] = mx;
  }
  const stamp = /composite_rv_(\d{8})_(\d{4})/.exec(f);
  const ms = Date.UTC(+stamp[1].slice(0, 4), +stamp[1].slice(4, 6) - 1, +stamp[1].slice(6, 8), +stamp[2].slice(0, 2), +stamp[2].slice(2, 4));
  if (ms !== g.validAt.getTime()) throw new Error(`${f}: validAt ${g.validAt.toISOString()} ≠ name`);
  slots.push({ ms, file: f, land, wetDomain, echo, hist: Array.from(hist), nat: b64(nat), nat3: b64(nat3), rad: b64(rad) });
  if (idx % 50 === 0) console.log(`${idx + 1}/${files.length} ${f} land ${land} wet ${wetDomain} (${(Date.now() - t0) / 1000 | 0} s)`);
}
writeFileSync(join(out, 'stations.json'), JSON.stringify({ builtAt: new Date().toISOString(), n: list.length, stations: list }));
writeFileSync(join(out, 'values.json'), JSON.stringify({ builtAt: new Date().toISOString(), rvDir, nStations: list.length, slots }));
console.log(`wrote ${slots.length} slots × ${list.length} stations → ${out} (${(Date.now() - t0) / 1000 | 0} s)`);
