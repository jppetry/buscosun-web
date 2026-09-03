/**
 * V-SAT-18 — Bisektion der Komposit-Schleife (§12.10.2).
 *
 * Der Kosten-Prüfstand (`dnbr-composite-bench.mjs`) misst `dnbrTileRgba` mit 27–30 ms je
 * 512²-Kachel — rund 110 ns je Pixel für eine reine Arithmetik-Schleife. Das ist zwei
 * Größenordnungen zu viel; bevor die V-SAT-18-Skizze („ab in den Worker") gebaut wird, klärt
 * diese Bisektion, WOFÜR die Zeit draufgeht. Zwei Verdächtige stehen im Quelltext:
 *
 *   (a) `const [r, g, bl, al] = dnbrRgba(...)` — Array-Destrukturierung läuft über das
 *       Iterator-Protokoll, JE PIXEL.
 *   (b) `nbrOf`/`boaOf` geben `number | null` zurück — ein getaggter Wert je Aufruf, zweimal
 *       je Pixel, mit Rechnung auf boxed Doubles.
 *
 * `refLoop` ist die Schleife aus `burnIndex.ts` VOR dieser Phase, wortgleich übernommen. Sie
 * ist zugleich das Gleichheits-Orakel (BW-1-Muster): jede Variante muss Byte für Byte dasselbe
 * liefern, sonst ist die Messung wertlos.
 *
 * Aufruf: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *           audit/brandradar-satellitenbilder/dnbr-loop-bisect.mjs
 */

import {
  DNBR_CLASSES, dnbrRgba, nbrOf, sclPreMasked, sclPostMasked, sclPostUnsure, wcDamped,
  swirChannel, dnbrTileRgba, swirTileRgba,
} from '../../src/fire/detail/burnIndex.ts';

const SIDE = Number(process.env.SIDE || 512);
const N = SIDE * SIDE;
const S = { scale: 1e-4, offset: -0.1 };

/* ------------------------------------------------- Referenz (Stand vor V-SAT-18, wortgleich) */

function refLoop(preN, preS, postN, postS, sPre, sPost, preScl, postScl, wcCls) {
  const out = new Uint8ClampedArray(preN.length * 4);
  for (let i = 0, j = 0; i < preN.length; i++, j += 4) {
    if (preScl && sclPreMasked(preScl[i])) continue;
    if (postScl && sclPostMasked(postScl[i])) continue;
    const a = nbrOf(preN[i], preS[i], sPre);
    const b = nbrOf(postN[i], postS[i], sPost);
    const [r, g, bl, al] = dnbrRgba(a == null || b == null ? null : a - b);
    if (al === 0) continue;
    out[j] = r; out[j + 1] = g; out[j + 2] = bl;
    const unsure = (postScl != null && sclPostUnsure(postScl[i])) || (wcCls != null && wcDamped(wcCls[i]));
    out[j + 3] = unsure ? al >> 1 : al;
  }
  return out;
}

/* --------------------------------------------- V1: nur die Destrukturierung durch Index-Zugriff */

function v1NoDestructure(preN, preS, postN, postS, sPre, sPost, preScl, postScl, wcCls) {
  const out = new Uint8ClampedArray(preN.length * 4);
  for (let i = 0, j = 0; i < preN.length; i++, j += 4) {
    if (preScl && sclPreMasked(preScl[i])) continue;
    if (postScl && sclPostMasked(postScl[i])) continue;
    const a = nbrOf(preN[i], preS[i], sPre);
    const b = nbrOf(postN[i], postS[i], sPost);
    const c = dnbrRgba(a == null || b == null ? null : a - b);
    const al = c[3];
    if (al === 0) continue;
    out[j] = c[0]; out[j + 1] = c[1]; out[j + 2] = c[2];
    const unsure = (postScl != null && sclPostUnsure(postScl[i])) || (wcCls != null && wcDamped(wcCls[i]));
    out[j + 3] = unsure ? al >> 1 : al;
  }
  return out;
}

/* ------------------------------------------------- V2: nur nbrOf inline, NaN statt null-Union */

function v2InlineNbr(preN, preS, postN, postS, sPre, sPost, preScl, postScl, wcCls) {
  const out = new Uint8ClampedArray(preN.length * 4);
  const scA = sPre.scale, ofA = sPre.offset, scB = sPost.scale, ofB = sPost.offset;
  for (let i = 0, j = 0; i < preN.length; i++, j += 4) {
    if (preScl && sclPreMasked(preScl[i])) continue;
    if (postScl && sclPostMasked(postScl[i])) continue;
    let a = NaN;
    const an = preN[i], as = preS[i];
    if (an !== 0 && as !== 0) {
      const n = Math.max(0, an * scA + ofA), w = Math.max(0, as * scA + ofA);
      const sum = n + w;
      if (sum > 0) a = (n - w) / sum;
    }
    let b = NaN;
    const bn = postN[i], bs = postS[i];
    if (bn !== 0 && bs !== 0) {
      const n = Math.max(0, bn * scB + ofB), w = Math.max(0, bs * scB + ofB);
      const sum = n + w;
      if (sum > 0) b = (n - w) / sum;
    }
    const d = a - b;
    // `!(d >= min)` fängt NaN mit ab — `d < min` täte es NICHT (NaN-Vergleiche sind immer falsch).
    if (!(d >= DNBR_CLASSES[0].min)) continue;
    const [r, g, bl, al] = dnbrRgba(d);
    out[j] = r; out[j + 1] = g; out[j + 2] = bl;
    const unsure = (postScl != null && sclPostUnsure(postScl[i])) || (wcCls != null && wcDamped(wcCls[i]));
    out[j + 3] = unsure ? al >> 1 : al;
  }
  return out;
}

/* ------------------------------------------------------------------------ V3: beides zusammen */

function v3Both(preN, preS, postN, postS, sPre, sPost, preScl, postScl, wcCls) {
  const n = preN.length;
  const out = new Uint8ClampedArray(n * 4);
  // Die Klassenkanten bleiben DNBR_CLASSES (eine Quelle für Canvas UND Legende) — hier nur in
  // typisierte Spalten gelegt, damit die Schleife keine Objekte anfasst.
  const nc = DNBR_CLASSES.length;
  const mins = new Float64Array(nc);
  const cr = new Uint8Array(nc), cg = new Uint8Array(nc), cb = new Uint8Array(nc), ca = new Uint8Array(nc);
  for (let k = 0; k < nc; k++) {
    mins[k] = DNBR_CLASSES[k].min;
    cr[k] = DNBR_CLASSES[k].rgba[0]; cg[k] = DNBR_CLASSES[k].rgba[1];
    cb[k] = DNBR_CLASSES[k].rgba[2]; ca[k] = DNBR_CLASSES[k].rgba[3];
  }
  const min0 = mins[0];
  const scA = sPre.scale, ofA = sPre.offset, scB = sPost.scale, ofB = sPost.offset;
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    if (preScl && sclPreMasked(preScl[i])) continue;
    if (postScl && sclPostMasked(postScl[i])) continue;
    let a = NaN;
    const an = preN[i], as = preS[i];
    if (an !== 0 && as !== 0) {
      const p = Math.max(0, an * scA + ofA), q = Math.max(0, as * scA + ofA);
      const sum = p + q;
      if (sum > 0) a = (p - q) / sum;
    }
    let b = NaN;
    const bn = postN[i], bs = postS[i];
    if (bn !== 0 && bs !== 0) {
      const p = Math.max(0, bn * scB + ofB), q = Math.max(0, bs * scB + ofB);
      const sum = p + q;
      if (sum > 0) b = (p - q) / sum;
    }
    const d = a - b;
    if (!(d >= min0)) continue;
    let k = nc - 1;
    while (mins[k] > d) k--;
    const al = ca[k];
    out[j] = cr[k]; out[j + 1] = cg[k]; out[j + 2] = cb[k];
    const unsure = (postScl != null && sclPostUnsure(postScl[i])) || (wcCls != null && wcDamped(wcCls[i]));
    out[j + 3] = unsure ? al >> 1 : al;
  }
  return out;
}

/* ------------------------------------------------------------------------------------ Fixture */

function makeBands() {
  const preN = new Uint16Array(N), preS = new Uint16Array(N);
  const postN = new Uint16Array(N), postS = new Uint16Array(N);
  for (let i = 0; i < N; i++) {
    if (i % 97 === 0) { preN[i] = 0; preS[i] = 500; postN[i] = 500; postS[i] = 500; continue; }
    if (i % 211 === 0) { preN[i] = 400; preS[i] = 400; postN[i] = 400; postS[i] = 400; continue; } // beide geklemmt ⇒ Summe 0
    const burn = (i % 16) < 1;
    preN[i] = 3000 + (i % 400); preS[i] = 540 + (i % 60);
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

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
function time(fn, runs = 9) {
  fn(); fn();
  const ms = [];
  for (let i = 0; i < runs; i++) { const t = performance.now(); fn(); ms.push(performance.now() - t); }
  return median(ms);
}
const same = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/* ---------------------------------------------------------------------------------------- Lauf */

const { preN, preS, postN, postS } = makeBands();
const scl = clsPattern(11, 8, 4);
const wc = clsPattern(7, 40, 10);

/** Vier Aufrufformen — die Gleichheit muss in JEDER gelten, nicht nur im Betriebsfall. */
const CASES = [
  { label: 'ohne SCL/WC (SAT2b)', args: [null, null, null] },
  { label: 'nur SCL (SAT2c)', args: [scl, scl, null] },
  { label: 'nur WorldCover (SAT2d)', args: [null, null, wc] },
  { label: 'SCL + WorldCover (Betrieb)', args: [scl, scl, wc] },
];

const VARIANTS = [
  ['REF  Stand vor V-SAT-18', refLoop],
  ['V1   ohne Destrukturierung', v1NoDestructure],
  ['V2   nbrOf inline (NaN statt null)', v2InlineNbr],
  ['V3   beides', v3Both],
  // Der ausgelieferte Stand läuft als Variante MIT — sonst prüfte der Prüfstand eine Skizze
  // statt des Codes, den der Browser lädt (Lehre aus SAT2f: das Orakel muss den Bestand fassen).
  ['BAU  burnIndex.ts (Bestand)', dnbrTileRgba],
];

/**
 * `ONE=<Label>` misst NUR diese Variante und beendet sich — ein Isolat je Variante.
 * Nötig, weil fünf Varianten in EINEM Isolat die Aufrufstellen polymorph machen: die
 * Verhältnisse bleiben aussagekräftig, die Absolutwerte nicht (Mess-Lehre §12.10.5).
 */
const ONE = process.env.ONE || '';
if (ONE) {
  const v = VARIANTS.find(([l]) => l.startsWith(ONE));
  if (!v) { console.error(`unbekannte Variante: ${ONE}`); process.exit(2); }
  const out = [];
  for (const c of CASES) out.push(`${c.label}: ${time(() => v[1](preN, preS, postN, postS, S, S, ...c.args)).toFixed(2)} ms`);
  console.log(`${v[0].padEnd(36)} ${out.join('  |  ')}`);
  process.exit(0);
}

console.log(`V-SAT-18 — Bisektion der Komposit-Schleife, ${SIDE}² = ${N.toLocaleString('de-DE')} Pixel`);
console.log(`Node ${process.version}, Median aus 9 Läufen\n`);

let fails = 0;
for (const c of CASES) {
  console.log(`Fall: ${c.label}`);
  const call = (fn) => fn(preN, preS, postN, postS, S, S, ...c.args);
  const ref = call(refLoop);
  let base = 0;
  for (const [label, fn] of VARIANTS) {
    const ms = time(() => call(fn));
    if (label.startsWith('REF')) base = ms;
    const eq = same(ref, call(fn));
    if (!eq) fails++;
    console.log(`  ${label.padEnd(36)}${ms.toFixed(2).padStart(7)} ms  ${(base / ms).toFixed(1).padStart(5)}×  ${eq ? 'gleich' : 'ABWEICHUNG'}`);
  }
  console.log('');
}

/* ------------------------------------------- SWIR: derselbe Defekt, dieselbe Beweisführung (E3) */

/** Die SWIR-Schleife von vorher, wortgleich — `swirChannel` gibt ebenfalls `number | null`. */
function refSwir(s12, n8a, r04, s) {
  const out = new Uint8ClampedArray(s12.length * 4);
  for (let i = 0, j = 0; i < s12.length; i++, j += 4) {
    const r = swirChannel(s12[i], s);
    const g = swirChannel(n8a[i], s);
    const b = swirChannel(r04[i], s);
    if (r == null || g == null || b == null) continue;
    out[j] = r; out[j + 1] = g; out[j + 2] = b; out[j + 3] = 255;
  }
  return out;
}

{
  console.log('Fall: SWIR-Falschfarbe (B12/B8A/B04)');
  const args = [postS, postN, preN, S];
  const ref = refSwir(...args);
  const now = swirTileRgba(...args);
  const eq = same(ref, now);
  if (!eq) fails++;
  const tRef = time(() => refSwir(...args));
  const tNow = time(() => swirTileRgba(...args));
  console.log(`  ${'REF  Stand vor V-SAT-18'.padEnd(36)}${tRef.toFixed(2).padStart(7)} ms    1.0×  gleich`);
  console.log(`  ${'BAU  burnIndex.ts (Bestand)'.padEnd(36)}${tNow.toFixed(2).padStart(7)} ms  ${(tRef / tNow).toFixed(1).padStart(5)}×  ${eq ? 'gleich' : 'ABWEICHUNG'}`);
  console.log('');
}

console.log(fails === 0
  ? 'Gleichheit: jede Variante liefert in jedem Fall dieselben Bytes wie die Referenz.'
  : `FEHLER: ${fails} Variante(n) weichen von der Referenz ab.`);
process.exit(fails === 0 ? 0 : 1);
