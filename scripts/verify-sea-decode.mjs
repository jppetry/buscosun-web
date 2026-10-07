/**
 * verify:sea-decode — Phase SW (audit/seewetter.md §2.1): the client's GRIB2 decoder (`src/sources/gribDecode.ts`) on
 * REAL CWAM files (run 07.10.2026 00 UTC, 11 excerpts in `scripts/lib/fixtures/sea/cwam-2026100700/`) against the
 * values of the source analysis: grid, orientation (rows north → south), bitmap sea points, the WAM wind floor, the
 * period placeholder, the peak-period artefact, the eleven mockup spots — and the contract's PNG coding round trip.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-sea-decode.mjs
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';
import { decompressBz2 } from './lib/bz2.mjs';
import {
  SEA_MODELS, SEA_PARAM_IDS, packMask, seaCellOf, encodeHs, decodeHs, encodeDir, decodeDir, encodePeriod, decodePeriod,
  SEA_HS_CLIP, SEA_NULL, newCounts, cleanPeriod, cleanPeakWindSea, cleanHs, invalidShareOk,
} from '../src/sea/seaContract.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIR = join(HERE, 'lib', 'fixtures', 'sea', 'cwam-2026100700');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const load = async (p, s) => {
  const raw = readFileSync(join(DIR, `CWAM_${p}_2026100700_${String(s).padStart(3, '0')}.grib2.bz2`));
  return decodeGrib2(new Uint8Array(await decompressBz2(raw)));
};

// Fixture integrity.
const sums = readFileSync(join(DIR, 'SHA256SUMS'), 'utf8').trim().split('\n').map((l) => l.split(/\s+\*?/));
const sumBad = sums.filter(([h, f]) => createHash('sha256').update(readFileSync(join(DIR, f))).digest('hex') !== h).map(([, f]) => f);
add('D0 GRIB-Ausschnitte unverändert (SHA256SUMS)', sumBad.length === 0, sumBad.join(' ') || `${sums.length} Dateien`);

const F = {};
for (const [p, s] of [['SWH', 10], ['SWH', 24], ['SWH', 34], ['SWH', 58], ['TM10', 24], ['TM10', 34], ['PPWW', 24], ['SHWW', 24], ['SHWW', 34], ['SHTS', 34], ['SP_10M', 24]]) F[`${p}@${s}`] = await load(p, s);
const g = SEA_MODELS.cwam.grid;
const f0 = F['SWH@24'];
add('D1 Gitter wie Vertrag (630 × 387, La1/Lo1/La2/Lo2, Di/Dj), scanMode 0',
  f0.ni === g.ni && f0.nj === g.nj && Math.abs(f0.lat1 - g.lat1) < 1e-5 && Math.abs(f0.lon1 - g.lon1) < 1e-5 && Math.abs(f0.lat2 - g.lat2) < 1e-5 && Math.abs(f0.lon2 - g.lon2) < 1e-5
  && Math.abs(f0.di - g.di) < 1e-6 && Math.abs(f0.dj - g.dj) < 1e-6 && f0.scanMode === 0,
  `${f0.ni}×${f0.nj} ${f0.lat1}/${f0.lon1} → ${f0.lat2}/${f0.lon2} scan ${f0.scanMode}`);
const ids = Object.entries(F).every(([k, f]) => {
  const p = k.split('@')[0].toLowerCase();
  const [d, c, n] = SEA_PARAM_IDS[p];
  return f.discipline === d && f.parameterCategory === c && f.parameterNumber === n;
});
add('D2 GRIB-Kennung je Größe wie Vertrag (Disziplin/Kategorie/Nummer)', ids, Object.entries(F).map(([k, f]) => `${k}=${f.discipline}/${f.parameterCategory}/${f.parameterNumber}`).join(' '));
const sea = (f) => { let n = 0; for (const v of f.values) if (!Number.isNaN(v)) n++; return n; };
const seaCounts = Object.values(F).map(sea);
add('D3 Seepunkte 124 011 in jedem Feld (Bitmap Sektion 6)', seaCounts.every((n) => n === SEA_MODELS.cwam.seaPoints), [...new Set(seaCounts)].join());
const hashes = new Set(Object.values(F).map((f) => createHash('sha256').update(packMask(f.values)).digest('hex')));
const maskHash = [...hashes][0];
add('D4 eine Landmaske für alle Größen und Schritte (Hash der gepackten Bitmap)', hashes.size === 1, `${maskHash.slice(0, 16)}… (${hashes.size})`);

// Orientation: island centres are land in scan order (rows from the north); flipped rows would not be.
const land = [[54.45, 11.15, 'Fehmarn'], [54.45, 13.40, 'Rügen'], [54.89, 8.34, 'Sylt'], [54.70, 8.53, 'Föhr'], [53.50, 8.95, 'Bremervörde'], [54.40, 9.80, 'Festland SH']];
const isLand = (lat, lon, flip = false) => {
  const c = seaCellOf('cwam', lat, lon);
  const i = Math.round(c.i), j0 = Math.round(c.j), j = flip ? g.nj - 1 - j0 : j0;
  return Number.isNaN(f0.values[j * g.ni + i]);
};
const direct = land.filter(([a, b]) => isLand(a, b)).length, flipped = land.filter(([a, b]) => isLand(a, b, true)).length;
const openSea = !isLand(55.5, 7.0) && !isLand(54.25, 7.6);
add('D5 Orientierung N → S: sechs Landorte sind Land, offene Nordsee ist See; gespiegelt nicht (Gegenprobe)', direct === land.length && openSea && flipped < land.length, `direkt ${direct}/${land.length}, gespiegelt ${flipped}/${land.length}`);

// Traps at +24 h (datenpruefung §4).
const sp = F['SP_10M@24'].values, hs = f0.values, tm = F['TM10@24'].values, pp = F['PPWW@24'].values, ww = F['SHWW@24'].values;
let floor = 0, tmPh = 0, tmPhLow = 0, pp15 = 0, pp12 = 0; const pp15hs = [];
for (let k = 0; k < sp.length; k++) {
  if (Number.isNaN(sp[k])) continue;
  if (Math.abs(sp[k] - 2) < 1e-6) floor++;
  if (Math.abs(tm[k] - 1) < 1e-6) { tmPh++; if (hs[k] < 0.05) tmPhLow++; }
  if (pp[k] > 15) { pp15++; pp15hs.push(hs[k]); }
  if (pp[k] > 12 && ww[k] < 0.3) pp12++;
}
pp15hs.sort((a, b) => a - b);
add('D6 Windboden: sp_10m exakt 2,00 m/s an 7 487 Seepunkten (+ 24 h) — der Grund, warum WAM-Wind nie gezeigt wird', floor === 7487, `${floor}`);
add('D7 Platzhalter: tm10 = 1,0 s an 3 191 Punkten, alle mit Hs < 0,05 m', tmPh === 3191 && tmPhLow === 3191, `${tmPh} / ${tmPhLow}`);
add('D8 Artefakt: ppww > 15 s an 468 Punkten, Median Hs 0,17 m; Regel ppww > 12 s ∧ shww < 0,3 m trifft 496', pp15 === 468 && Math.abs(pp15hs[pp15hs.length >> 1] - 0.17) < 0.005 && pp12 === 496, `${pp15}, Median ${pp15hs[pp15hs.length >> 1].toFixed(3)}, Regel ${pp12}`);

// The contract's rules on the same fields count the same.
const c = newCounts();
for (let k = 0; k < hs.length; k++) {
  if (Number.isNaN(hs[k])) continue;
  c.cells++;
  const h = cleanHs(hs[k], c);
  cleanPeriod(tm[k], h, c);
  cleanPeakWindSea(pp[k], ww[k], c);
}
add('D9 Vertragsregeln auf dem echten Feld: Platzhalter 3 191 (tm10) + Platzhalter/Artefakt ppww, 0 außerhalb ⇒ Feld frei',
  c.invalid === 0 && c.placeholder >= 3191 && c.ppwwArtefact > 0 && invalidShareOk(c), JSON.stringify(c));

// Eleven mockup spots (datenpruefung §5), best sea point within ±6 cells, tolerance 0.1 m / 0.2 s.
const SPOTS = [
  ['St. Peter-Ording', 176, 258, [0.4, 2.2, 1.8], 6.0, 2.2, 0.1], ['Westerland (Sylt)', 153, 184, [0.7, 3.2, 2.0], 6.4, 3.2, 0.0],
  ['Helgoland', 124, 272, [0.7, 3.6, 2.3], 7.2, 3.5, 0.2], ['Büsum', 192, 278, [0.1, 1.0, 0.9], 3.6, 1.0, 0.0],
  ['Cuxhaven-Duhnen', 178, 308, [0.2, 1.4, 0.3], 3.8, 1.4, 0.0], ['Norderney', 71, 328, [0.7, 3.8, 1.4], 7.6, 3.8, 0.0],
  ['Eckernförde', 264, 237, [0.0, 0.1, 0.1], 2.4, 0.0, 0.1], ['Kiel-Schilksee', 288, 242, [0.1, 0.3, 0.1], 3.0, 0.3, 0.0],
  ['Laboe', 291, 244, [0.1, 0.7, 0.3], 3.0, 0.7, 0.0], ['Heiligenhafen', 346, 248, [0.0, 0.0, 0.4], 1.8, 0.0, 0.0],
  ['Fehmarn Grüner Brink', 360, 230, [0.2, 0.2, 0.7], 2.6, 0.1, 0.2],
];
const H = [F['SWH@10'].values, F['SWH@34'].values, F['SWH@58'].values], TM = F['TM10@34'].values, WS = F['SHWW@34'].values, SW = F['SHTS@34'].values;
const spotRes = SPOTS.map(([name, i0, j0, h, t, w, s]) => {
  let best = null;
  for (let j = j0 - 6; j <= j0 + 6; j++) for (let i = i0 - 6; i <= i0 + 6; i++) {
    const k = j * g.ni + i;
    if (Number.isNaN(H[0][k])) continue;
    const e = Math.max(...h.map((x, n) => Math.abs(H[n][k] - x)), Math.abs(WS[k] - w), Math.abs(SW[k] - s));
    const et = Math.abs(TM[k] - t);
    if (!best || e + et / 2 < best.e + best.et / 2) best = { i, j, e, et };
  }
  return { name, ...best, ok: best && best.e <= 0.1 + 0.05 && best.et <= 0.2 + 0.05 };
});
add('D10 elf Mockup-Spots: bester Seepunkt (± 6 Zellen) trifft Hs + 10/34/58 h, Windsee/Dünung + 34 h auf 0,1 m und Tm−1,0 auf 0,2 s (Werte der Datenprüfung auf 0,1 gerundet)',
  spotRes.every((r) => r.ok), spotRes.map((r) => `${r.name} ${r.i - SPOTS.find((s) => s[0] === r.name)[1]}/${r.j - SPOTS.find((s) => s[0] === r.name)[2]} Δ${r.e.toFixed(2)}`).join(' · '));

// PNG coding round trip on the real field: error ≤ half a step.
let maxHs = 0, maxTm = 0, nulls = 0, clipped = 0;
for (let k = 0; k < hs.length; k++) {
  if (Number.isNaN(hs[k])) continue;
  const r = encodeHs(hs[k]);
  if (r === SEA_HS_CLIP) clipped++;
  maxHs = Math.max(maxHs, Math.abs(decodeHs(r) - hs[k]));
  const b = encodePeriod(tm[k]);
  if (b === SEA_NULL) nulls++; else maxTm = Math.max(maxTm, Math.abs(decodePeriod(b) - tm[k]));
}
let maxDir = 0;
for (let d = 0; d < 360; d += 0.37) { const e = Math.abs(((decodeDir(encodeDir(d)) - d + 540) % 360) - 180); maxDir = Math.max(maxDir, e); }
add('D11 PNG-Kodierung hin und zurück: Hs ≤ 2,5 cm, Periode ≤ 0,05 s, Richtung ≤ 0,70° (je eine halbe Stufe); 0 gekappt am echten Feld',
  maxHs <= 0.025 + 1e-9 && maxTm <= 0.05 + 1e-9 && maxDir <= 0.703125 + 1e-9 && clipped === 0 && nulls === 0,
  `Hs ${maxHs.toFixed(4)} m · Tm ${maxTm.toFixed(4)} s · Richtung ${maxDir.toFixed(4)}° · gekappt ${clipped}`);
add('D12 Kodier-Ränder: 12,70 m und 20 m ⇒ 254 (gekappt), null ⇒ 255, 360° ⇒ 0, Periode null ⇒ 255',
  encodeHs(12.7) === 254 && encodeHs(20) === 254 && encodeHs(12.6) === 252 && encodeHs(null) === 255 && encodeDir(360) === 0 && encodeDir(359.9) === 0 && encodePeriod(null) === 255 && decodeHs(255) === null,
  `${encodeHs(12.7)}/${encodeHs(20)}/${encodeHs(null)}/${encodeDir(360)}/${encodePeriod(null)}`);

console.log(`  Maskenhash CWAM: ${maskHash}`);
const passed = checks.filter((x) => x.ok).length;
const failed = checks.length - passed;
for (const x of checks) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name}${x.detail ? `  [${x.detail}]` : ''}`);
console.log(`\nverify:sea-decode — ${passed}/${checks.length}${failed ? ` (${failed} FEHLER)` : ''}`);
process.exit(failed ? 1 : 0);
