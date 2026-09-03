/**
 * V-SAT-18 — Prüfstand für das KOMPOSIT einer dNBR-Kachel (§12.10).
 *
 * Die SAT2g-Messung hat gesagt: „Komposit einer 512²-Kachel 50–85 ms, mit und ohne Dämpfung."
 * Das ist die Dauer des TASKS, in dem das Komposit landet — nicht die Kosten einer benannten
 * Funktion. Bevor irgendetwas in einen Worker wandert, zerlegt dieser Prüfstand den
 * SYNCHRONEN Anteil in seine Bausteine (die Lehre aus 12.9.1: eine plausible Ursache ohne
 * Messung kann falsch sein).
 *
 * Was hier NICHT gemessen werden kann: `createImageBitmap` (kein DOM in Node) und `inflate`
 * (Netz/Stream-Anteil). Beide sind ausdrücklich benannt und gehören in die Browser-Sonde.
 *
 * Aufruf: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *           audit/brandradar-satellitenbilder/dnbr-composite-bench.mjs
 */

import { dnbrTileRgba, swirTileRgba } from '../../src/fire/detail/burnIndex.ts';
import { decodeTileU16 } from '../../src/fire/detail/cogTiff.ts';

const SIDE = Number(process.env.SIDE || 512);
const N = SIDE * SIDE;
const SCALE = { scale: 1e-4, offset: -0.1 };

/* ------------------------------------------------------------------------------- Fixtures */

/**
 * Synthetische, aber REALISTISCHE Kachel: ~1 % nodata (Szenenrand), ~6 % Narbe (dNBR über der
 * ersten Kante), Rest gesunde Vegetation unter der Kante. Die Mischung entscheidet über die
 * Sprungvorhersage in `dnbrTileRgba` — eine reine Narbenkachel wäre ein anderer Prüfstand.
 */
function makeBands() {
  const preN = new Uint16Array(N), preS = new Uint16Array(N);
  const postN = new Uint16Array(N), postS = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    if (i % 97 === 0) { preN[i] = 0; preS[i] = 500; postN[i] = 500; postS[i] = 500; continue; }
    const burn = (i % 16) < 1; // ~6 %
    preN[i] = 3000 + (i % 400);
    preS[i] = 540 + (i % 60);
    postN[i] = burn ? 2688 : 3017 + (i % 200);
    postS[i] = burn ? 1723 : 725 + (i % 90);
  }
  return { preN, preS, postN, postS };
}

const clsPattern = (mod, hit, miss) => {
  const a = new Uint8Array(N);
  for (let i = 0; i < N; i++) a[i] = (i % mod === 0) ? hit : miss;
  return a;
};

/** Eine Deflate-Kachel im Format der Band-COGs (uint16, LE, Predictor 2) für `decodeTileU16`. */
async function makeEncodedTile(values) {
  const bytes = new Uint8Array(N * 2);
  const dv = new DataView(bytes.buffer);
  for (let y = 0; y < SIDE; y++) {
    let prev = 0;
    for (let x = 0; x < SIDE; x++) {
      const v = values[y * SIDE + x];
      dv.setUint16((y * SIDE + x) * 2, (v - prev) & 0xffff, true);
      prev = v;
    }
  }
  const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

const IFD = {
  width: SIDE * 4, height: SIDE * 4, tileW: SIDE, tileH: SIDE,
  samplesPerPixel: 1, bitsPerSample: 16, littleEndian: true,
  compression: 8, predictor: 2, tilesAcross: 4, tilesDown: 4, tileOffsets: [], tileByteCounts: [],
};

/* ---------------------------------------------------------------------------------- Messung */

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

function time(fn, runs = 9) {
  fn(); fn();
  const ms = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); fn(); ms.push(performance.now() - t); }
  return median(ms);
}

async function timeAsync(fn, runs = 9) {
  await fn(); await fn();
  const ms = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); await fn(); ms.push(performance.now() - t); }
  return median(ms);
}

const row = (label, ms, note = '') =>
  console.log(`${label.padEnd(52)}${ms.toFixed(2).padStart(8)} ms   ${note}`);

/* ------------------------------------------------------------------------------------- Lauf */

const { preN, preS, postN, postS } = makeBands();
const scl = clsPattern(11, 8, 4);       // ~9 % Wolke mittel
const wc = clsPattern(7, 40, 10);       // ~14 % Acker
const encoded = await makeEncodedTile(preN);

console.log(`V-SAT-18 — Bausteine des dNBR-Komposits, ${SIDE}² = ${N.toLocaleString('de-DE')} Pixel`);
console.log(`Node ${process.version}, Median aus 9 Läufen\n`);
console.log('Baustein                                                Zeit   Anmerkung');
console.log('─'.repeat(96));

// 1) Die Dekodierung EINER Bandkachel — sie liegt im selben Task wie das Komposit, sobald ihr
//    `inflate`-await als letztes auflöst. Ohne diese Zeile wäre die Zuordnung geraten.
const tDecodeFull = await timeAsync(() => decodeTileU16(encoded, IFD));
row('decodeTileU16 (inflate + DataView-Schleife + Predictor)', tDecodeFull, 'davon inflate = Stream');

// Der reine JS-Anteil der Dekodierung, ohne inflate: DataView-Lesen + Predictor-Rückrechnung.
const rawBytes = new Uint8Array(N * 2);
{
  const dv = new DataView(rawBytes.buffer);
  for (let y = 0; y < SIDE; y++) {
    let prev = 0;
    for (let x = 0; x < SIDE; x++) { dv.setUint16((y * SIDE + x) * 2, (preN[y * SIDE + x] - prev) & 0xffff, true); prev = preN[y * SIDE + x]; }
  }
}
const tDecodeJs = time(() => {
  const dv = new DataView(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength);
  const out = new Uint16Array(N);
  for (let i = 0; i < N; i++) out[i] = dv.getUint16(i * 2, true);
  for (let y = 0; y < SIDE; y++) {
    const base = y * SIDE;
    for (let i = 1; i < SIDE; i++) out[base + i] = (out[base + i] + out[base + i - 1]) & 0xffff;
  }
  return out;
});
row('  davon reiner JS-Anteil (ohne inflate)', tDecodeJs, '× 4 Bänder je Kachel');

console.log('');

// 2) Das Komposit selbst — die Funktion, die die V-SAT-18-Skizze in den Worker schicken wollte.
const tPlain = time(() => dnbrTileRgba(preN, preS, postN, postS, SCALE, SCALE));
row('dnbrTileRgba ohne SCL/WorldCover', tPlain, 'SAT2b-Stand');
const tScl = time(() => dnbrTileRgba(preN, preS, postN, postS, SCALE, SCALE, scl, scl));
row('dnbrTileRgba mit SCL-Maske', tScl, 'SAT2c');
const tAll = time(() => dnbrTileRgba(preN, preS, postN, postS, SCALE, SCALE, scl, scl, wc));
row('dnbrTileRgba mit SCL + WorldCover-Dämpfung', tAll, 'SAT2d — der Betriebsfall');
const tSwir = time(() => swirTileRgba(postS, postN, preN, SCALE));
row('swirTileRgba (Vergleichswert, gleicher Umfang)', tSwir, 'SWIR-Modus');

console.log('');

// 3) Die Allokation der Ausgabe — 1 MB je Kachel; sie fällt im Worker genauso an.
const tAlloc = time(() => new Uint8ClampedArray(N * 4));
row('new Uint8ClampedArray(nPix · 4)', tAlloc, `${((N * 4) / 1024 / 1024).toFixed(1)} MB`);

console.log('─'.repeat(96));
const sync = tAll + 4 * tDecodeJs;
console.log(`\nSynchroner JS-Anteil einer Kachel (Komposit + 4 × Dekode-JS): ${sync.toFixed(1)} ms`);
console.log('Nicht hier messbar (Browser-Sonde): createImageBitmap, inflate-Stream, GC-Druck.');
