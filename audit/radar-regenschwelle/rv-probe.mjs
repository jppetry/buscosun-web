// Phase RG — RG-0: what does the DWD RV analysis carry natively, and what does the RADOLAN floor make of it?
// Reads one or more local RV tars (HDF5 form), lead 0 only, decodes twice (units 'native' and 'radolan') and prints
// (a) the domain-wide histogram of wet pixels by native class, (b) the Herborn box, (c) named places.
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/radar-regenschwelle/rv-probe.mjs <tar> [<tar> …]
import { readFileSync } from 'node:fs';
import { untar } from '../../src/sources/radolanDecode.ts';
import { decodeRvHdf5 } from '../../src/sources/rvHdf5.ts';
import { psFwd, DE1200_CORNERS } from '../../src/sources/radolanGeo.ts';
import { precipToU8, precipToU8Log, precipFromU8Log } from '../../src/scalar/RainLayer.ts';

const PLACES = { Herborn: [8.3075, 50.6826], Dillenburg: [8.2878, 50.7406], Burbach: [8.0864, 50.7442], Herdorf: [7.9536, 50.7766], Haiger: [8.2083, 50.7428], Siegen: [8.0242, 50.8748] };
const [NW, NE, , SW] = DE1200_CORNERS;
const pNW = psFwd(...NW), pNE = psFwd(...NE), pSW = psFwd(...SW);
const uv = (lon, lat) => { const [x, y] = psFwd(lon, lat); return [(x - pNW[0]) / (pNE[0] - pNW[0]), (y - pNW[1]) / (pSW[1] - pNW[1])]; };
const CLASSES = [[0, 0.0001, '0,000'], [0.0001, 0.018, '0,012'], [0.018, 0.03, '0,024'], [0.03, 0.042, '0,036'], [0.042, 0.054, '0,048'], [0.054, 0.114, '0,060–0,108'], [0.114, 0.126, '0,120'], [0.126, 0.2, '0,13–0,19'], [0.2, 0.5, '0,2–0,5'], [0.5, 1e9, '≥ 0,5']];
const cls = (mm) => CLASSES.find(([a, b]) => mm >= a && mm < b)?.[2] ?? '?';

for (const path of process.argv.slice(2)) {
  const buf = readFileSync(path);
  const e0 = untar(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)).find((e) => /_000-hd5$/.test(e.name));
  const ab = e0.data.buffer.slice(e0.data.byteOffset, e0.data.byteOffset + e0.data.byteLength);
  const nat = await decodeRvHdf5(ab, { units: 'native', name: e0.name });
  const rad = await decodeRvHdf5(ab, { units: 'radolan', name: e0.name });
  const N = nat.rainRate.length;
  console.log(`\n== ${path.split(/[\/]/).pop()}  valid ${nat.validAt.toISOString()}  lead ${nat.leadMinutes}`);
  // (a) domain
  const hist = new Map(); let wet = 0, nodata = 0, lifted = 0, shownBlue = 0, nativeGe006 = 0, nativeGe012 = 0, nativeGe02 = 0, nativeGe01 = 0;
  for (let k = 0; k < N; k++) {
    const v = nat.rainRate[k]; if (Number.isNaN(v)) { nodata++; continue; }
    const r = rad.rainRate[k];
    if (r > 0) { wet++; shownBlue += precipToU8Log(r) > 0 ? 1 : 0; const c = cls(v); hist.set(c, (hist.get(c) ?? 0) + 1); if (r > v + 1e-9) lifted++; if (v >= 0.06) nativeGe006++; if (v >= 0.1) nativeGe01++; if (v >= 0.12) nativeGe012++; if (v >= 0.2) nativeGe02++; }
    if (v > 0 && !(r > 0)) throw new Error('mask differs');
  }
  const land = N - nodata;
  console.log(`Domäne: ${land} Pixel mit Radar, nass (RADOLAN-Einheit > 0) ${wet} = ${(100 * wet / land).toFixed(2)} %; davon im Log-Bild blau ${shownBlue} (${(100 * shownBlue / wet).toFixed(1)} %)`);
  console.log(`  angehoben (Anzeige > nativ): ${lifted} = ${(100 * lifted / wet).toFixed(1)} % der nassen Pixel`);
  console.log(`  nativ ≥ 0,06: ${nativeGe006} (${(100 * nativeGe006 / wet).toFixed(1)} %) · ≥ 0,1: ${nativeGe01} (${(100 * nativeGe01 / wet).toFixed(1)} %) · ≥ 0,12: ${nativeGe012} (${(100 * nativeGe012 / wet).toFixed(1)} %) · ≥ 0,2: ${nativeGe02} (${(100 * nativeGe02 / wet).toFixed(1)} %)`);
  console.log('  Histogramm der nassen Pixel nach nativem Wert (mm/h): ' + CLASSES.map(([, , c]) => `${c}: ${hist.get(c) ?? 0}`).join(' · '));
  // (b) Herborn box
  const [u0, v0] = uv(7.75, 50.95), [u1, v1] = uv(8.55, 50.55);
  const i0 = Math.floor(u0 * 1100), i1 = Math.ceil(u1 * 1100), j0 = Math.floor(v0 * 1200), j1 = Math.ceil(v1 * 1200);
  const bh = new Map(); let bw = 0, bl = 0, bn = 0, exact012 = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) { const k = j * 1100 + i; const v = nat.rainRate[k], r = rad.rainRate[k]; bn++; if (!(r > 0)) continue; bw++; const c = cls(v); bh.set(c, (bh.get(c) ?? 0) + 1); if (r > v + 1e-9) bl++; if (Math.abs(r - 0.12) < 1e-6 && Math.abs(v - 0.12) < 1e-6) exact012++; }
  console.log(`Box 50,55–50,95 N / 7,75–8,55 E: ${bn} Pixel, nass ${bw} (${(100 * bw / bn).toFixed(1)} %), angehoben ${bl} (${(100 * bl / bw).toFixed(1)} %), nativ genau 0,12: ${exact012}`);
  console.log('  ' + CLASSES.map(([, , c]) => `${c}: ${bh.get(c) ?? 0}`).join(' · '));
  // (c) places
  for (const [name, [lon, lat]] of Object.entries(PLACES)) {
    const [u, v] = uv(lon, lat); const i = Math.floor(u * 1100), j = Math.floor(v * 1200);
    let mx = 0, mxR = 0; for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) { const k = (j + dj) * 1100 + i + di; if (nat.rainRate[k] > mx) mx = nat.rainRate[k]; if (rad.rainRate[k] > mxR) mxR = rad.rainRate[k]; }
    const k0 = j * 1100 + i;
    console.log(`  ${name.padEnd(11)} px(${i},${j}) nativ hier ${nat.rainRate[k0].toFixed(3)} max±3 ${mx.toFixed(3)} | RADOLAN hier ${rad.rainRate[k0].toFixed(3)} max±3 ${mxR.toFixed(3)} | v1-Byte ${precipToU8(rad.rainRate[k0])} Log-Byte ${precipToU8Log(rad.rainRate[k0])} (${precipFromU8Log(precipToU8Log(rad.rainRate[k0])).toFixed(3)} mm/h)`);
  }
}
