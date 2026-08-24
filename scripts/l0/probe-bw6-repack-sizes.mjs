// BW-6 Diagnose: PNG-Größen je Familie an einem echten ICON-D2-Lauf (Messung, kein Produktionscode).
// Aufruf aus C:\dev\buscosun-web:
//   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs <dieser Pfad>
import { fetchField, urls, findLatestRun } from '../repack-icon-d2.mjs';
import { encodePng } from '../lib/png.mjs';
import { thunderScore } from '../../src/radar/thunderPotential.ts';
import { rotationScore, smoothScores } from '../../src/radar/rotationPotential.ts';
import { freshSnowCmFromSwe } from '../../src/nowcast/alpineSplit.ts';
import { decodeGridStep } from '../../src/sources/gribGridDecode.ts';
import { statSync } from 'node:fs';
import { join } from 'node:path';

const CACHE = 'C:/dev/buscosun-web/.cache/repack';
const bz2Size = (u) => { try { return statSync(join(CACHE, u.slice(u.lastIndexOf('/') + 1))).size; } catch { return 0; } };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ss = 2;

/** Ein-Kanal-Familie: Grau = R-Byte, Alpha = Maske — dieselbe Schleife wie build*Image. */
function greyAlpha(fields, valueOf) {
  const { ni, nj } = fields[0];
  const w = Math.ceil(ni / ss), h = Math.ceil(nj / ss);
  const out = new Uint8Array(w * h * 2);
  for (let jj = 0; jj < h; jj++) {
    const sj = Math.min(nj - 1, jj * ss); const y = h - 1 - jj;
    for (let ii = 0; ii < w; ii++) {
      const si = Math.min(ni - 1, ii * ss); const k = sj * ni + si; const idx = (y * w + ii) * 2;
      const v = valueOf(k);
      if (!Number.isFinite(v)) continue;
      out[idx] = Math.round(clamp01(v) * 255); out[idx + 1] = 255;
    }
  }
  return encodePng(w, h, out, 2);
}

const run = (await findLatestRun()).run;
console.log('Lauf', run);
const rows = [];
async function measure(family, step, params, build) {
  const fields = [];
  let bz = 0;
  for (const p of params) {
    const u = urls.step(run, p, step);
    try { fields.push(await fetchField(u)); bz += bz2Size(u); } catch (e) { console.log('  fehlt', p, step, e.message.slice(0, 60)); fields.push(null); }
  }
  if (!fields[0]) return;
  const png = build(fields);
  rows.push({ family, step, grib_kb: Math.round(bz / 1024), png_kb: Math.round(png.length / 1024) });
  console.log(family, step, 'grib', Math.round(bz / 1024), 'KB → png', Math.round(png.length / 1024), 'KB');
}

for (const s of [0, 12, 24]) await measure('gust', s, ['vmax_10m'], ([g]) => greyAlpha([g], (k) => g.values[k] / 40));
for (const s of [1, 6, 12]) await measure('lightningfc', s, ['lpi_max'], ([g]) => greyAlpha([g], (k) => g.values[k] / 30));
for (const s of [0, 12, 24]) await measure('snowDepth', s, ['h_snow'], ([g]) => greyAlpha([g], (k) => g.values[k] * 100 / 150));
for (const s of [1, 12, 24]) await measure('snowFresh', s, ['snow_gsp', 'snow_con', 'rho_snow'], ([g, c, r]) =>
  greyAlpha([g], (k) => { const v = g.values[k]; if (!Number.isFinite(v)) return NaN; const sw = v + (c && Number.isFinite(c.values[k]) ? c.values[k] : 0); return freshSnowCmFromSwe(sw, r && Number.isFinite(r.values[k]) ? r.values[k] : undefined) / 50; }));
for (const s of [0, 6, 12]) await measure('thunder', s, ['cape_ml', 'cin_ml', 'lpi'], ([ca, ci, l]) =>
  greyAlpha([ca], (k) => thunderScore(ca.values[k], ci ? ci.values[k] : 0, l ? l.values[k] : 0) / 100));
for (const s of [1, 6, 12]) await measure('rotation', s, ['uh_max', 'uh_max_low', 'sdi_2'], ([uh, lo, sd]) => {
  const { ni, nj } = uh; const w = Math.ceil(ni / ss), h = Math.ceil(nj / ss);
  const sc = new Float32Array(w * h);
  for (let jj = 0; jj < h; jj++) { const sj = Math.min(nj - 1, jj * ss); const y = h - 1 - jj;
    for (let ii = 0; ii < w; ii++) { const si = Math.min(ni - 1, ii * ss); const k = sj * ni + si;
      sc[y * w + ii] = rotationScore(uh.values[k], lo ? lo.values[k] : 0, sd ? sd.values[k] : 0); } }
  const sm = smoothScores(sc, w, h);
  const out = new Uint8Array(w * h * 2);
  for (let p = 0; p < w * h; p++) { if (!Number.isFinite(sm[p])) continue; out[p * 2] = Math.round(clamp01(sm[p] / 100) * 255); out[p * 2 + 1] = 255; }
  return encodePng(w, h, out, 2);
});

// tot_prec: VOLLE Auflösung, deakkumuliert wie decodeGridStep (Grau ohne Alpha — 0 ist dort „transparent").
{
  const { readFileSync } = await import('node:fs');
  const bz2mod = (await import('bz2')).default;
  const bz2 = bz2mod.decompress ? bz2mod : bz2mod.default;
  let prev = null;
  for (const s of [0, 1, 2, 6, 12, 24, 27]) {
    const u = urls.step(run, 'tot_prec', s);
    try {
      await fetchField(u); // füllt den Cache
      const raw = bz2.decompress(new Uint8Array(readFileSync(join(CACHE, u.slice(u.lastIndexOf('/') + 1)))));
      const d = decodeGridStep(raw, prev, true, 'precip');
      prev = d.rawValues;
      const png = encodePng(d.width, d.height, d.values, 1);
      rows.push({ family: 'precipD2(full)', step: s, grib_kb: Math.round(bz2Size(u) / 1024), png_kb: Math.round(png.length / 1024) });
      console.log('precipD2', s, 'grib', Math.round(bz2Size(u) / 1024), 'KB → png', Math.round(png.length / 1024), 'KB', d.width + 'x' + d.height);
    } catch (e) { console.log('  tot_prec', s, 'Fehler', e.message.slice(0, 80)); }
  }
}

// ICON-EU Druckflächen-Wind: nur Dateigrößen (HEAD).
for (const lvl of [850, 700, 500]) {
  const hh = run.slice(8, 10);
  const u = `https://opendata.dwd.de/weather/nwp/icon-eu/grib/${hh}/u/icon-eu_europe_regular-lat-lon_pressure-level_${run}_000_${lvl}_U.grib2.bz2`;
  try { const r = await fetch(u, { method: 'HEAD' }); console.log('icon-eu', lvl, r.status, r.headers.get('content-length')); } catch (e) { console.log('icon-eu', lvl, e.message); }
}
console.table(rows);
