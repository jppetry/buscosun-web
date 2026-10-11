#!/usr/bin/env node
/**
 * V-SW-20 — the dry map of the spot catalogue: per CWAM sea cell the number of hours of ONE whole run (79 steps) the
 * model writes its "no sea state" (`seaNoSeaRaw`: Hs below the 1-cm floor with the period placeholder 1.0 s). West of
 * Jutland that count follows the tide — the cell has fallen dry; `build-spots.mjs` takes the nearest cell at or below
 * `SEA_SPOT_MAX_DRY_SHARE` with it. The DWD keeps a run 48 h, so the map is a fixture, not rebuilt at every catalogue
 * build (`scripts/lib/fixtures/sea/cwam-dry-<run>.json`: sparse, cell index → hours, only cells with ≥ 1 h).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/build-dry-map.mjs
 *     --run=YYYYMMDDHH --cache=<dir for the GRIB files> [--out=<file>]   (without --out: the measurement only)
 *
 * Prints what the audit quotes: the state's separation (largest Hs inside, smallest outside), cells in the state per
 * step west/east of 9.6° E with the share near land, and the histogram of dry hours per cell.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrib2 } from '../../src/sources/gribDecode.ts';
import { decompressBz2 } from '../lib/bz2.mjs';
import { SEA_MODELS, SEA_SPOT_STEPS, seaGribPath, seaNoSeaRaw } from '../../src/sea/seaContract.ts';
import { downloadRun } from './sea-derive.mjs';

/** Rough split of the CWAM domain: west of this longitude the North Sea (tide), east of it Kattegat and Baltic. */
export const DRY_SPLIT_LON = 9.6;

/** Reads a dry map file into a dense per-cell array of hours. */
export function readDryMap(file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  if (doc?.product !== 'sea-dry-map') throw new Error(`${file}: kein sea-dry-map`);
  const g = SEA_MODELS[doc.model].grid;
  if (doc.ni !== g.ni || doc.nj !== g.nj) throw new Error(`${file}: Gitter ${doc.ni}×${doc.nj} ≠ Vertrag`);
  const hours = new Uint8Array(g.ni * g.nj);
  for (let p = 0; p + 1 < doc.cells.length; p += 2) hours[doc.cells[p]] = doc.cells[p + 1];
  return { run: doc.run, steps: doc.steps, hours, share: (i, j) => hours[j * g.ni + i] / doc.steps };
}

export async function measureDry({ run, cacheDir, log = () => {} }) {
  const g = SEA_MODELS.cwam.grid, n = g.ni * g.nj;
  await downloadRun({ run, inv: null, cacheDir, params: ['swh', 'tm10'], steps: SEA_SPOT_STEPS, log });
  const read = async (p, s) => decodeGrib2(new Uint8Array(await decompressBz2(readFileSync(join(cacheDir, seaGribPath('cwam', run, p, s).split('/').pop()))))).values;
  const hours = new Uint8Array(n);
  let water = null, nearLand = null, maxIn = 0, minOut = Infinity;
  const perStep = [];
  for (const s of SEA_SPOT_STEPS) {
    const [hs, tm] = [await read('swh', s), await read('tm10', s)];
    if (!water) {
      water = new Uint8Array(n);
      for (let k = 0; k < n; k++) water[k] = Number.isNaN(hs[k]) ? 0 : 1;
      nearLand = new Uint8Array(n);
      for (let j = 0; j < g.nj; j++) for (let i = 0; i < g.ni; i++) {
        if (!water[j * g.ni + i]) continue;
        let l = 0;
        for (let dj = -2; dj <= 2 && !l; dj++) for (let di = -2; di <= 2; di++) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= g.ni || b >= g.nj || !water[b * g.ni + a]) { l = 1; break; } }
        nearLand[j * g.ni + i] = l;
      }
    }
    const c = { step: s, west: 0, westNear: 0, east: 0, eastNear: 0 };
    for (let k = 0; k < n; k++) {
      if (!water[k]) continue;
      if (seaNoSeaRaw(hs[k], tm[k])) {
        hours[k]++;
        if (hs[k] > maxIn) maxIn = hs[k];
        if (g.lon1 + (k % g.ni) * g.di < DRY_SPLIT_LON) { c.west++; c.westNear += nearLand[k]; } else { c.east++; c.eastNear += nearLand[k]; }
      } else if (hs[k] < minOut) minOut = hs[k];
    }
    perStep.push(c);
  }
  const hist = new Array(SEA_SPOT_STEPS.length + 1).fill(0);
  let sea = 0;
  for (let k = 0; k < n; k++) if (water[k]) { sea++; hist[hours[k]]++; }
  return { run, steps: SEA_SPOT_STEPS.length, hours, water, sea, maxIn, minOut, perStep, hist };
}

async function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  if (typeof args.run !== 'string' || typeof args.cache !== 'string') throw new Error('--run=YYYYMMDDHH --cache=<dir> [--out=<file>]');
  const log = (m) => console.log(`[dry-map] ${m}`);
  const r = await measureDry({ run: args.run, cacheDir: resolve(args.cache), log });
  const g = SEA_MODELS.cwam.grid;
  log(`Lauf ${r.run}, ${r.steps} Schritte, ${r.sea} Seepunkte`);
  log(`Zustand „kein Seegang“: größter Hs darin ${r.maxIn.toExponential(1)} m · kleinster Hs außerhalb ${r.minOut.toFixed(4)} m`);
  const mm = (f) => { const a = r.perStep.map(f); return `${Math.min(...a)}…${Math.max(...a)}`; };
  log(`Zellen im Zustand je Schritt: West (< ${DRY_SPLIT_LON}° O) ${mm((c) => c.west)}, Ost ${mm((c) => c.east)}; küstennah (≤ 2 Zellen bis Land) West ${(100 * r.perStep.reduce((a, c) => a + c.westNear, 0) / r.perStep.reduce((a, c) => a + c.west, 0)).toFixed(0)} %, Ost ${(100 * r.perStep.reduce((a, c) => a + c.eastNear, 0) / r.perStep.reduce((a, c) => a + c.east, 0)).toFixed(0)} %`);
  log(`West je Schritt: ${r.perStep.map((c) => c.west).join(' ')}`);
  log(`Ost je Schritt:  ${r.perStep.map((c) => c.east).join(' ')}`);
  const band = (a, b) => r.hist.slice(a, b + 1).reduce((x, y) => x + y, 0);
  log(`Stunden ohne Seegang je Zelle: 0 h ${r.hist[0]} · 1–9 ${band(1, 9)} · 10–24 ${band(10, 24)} · 25–39 ${band(25, 39)} · 40–59 ${band(40, 59)} · 60–78 ${band(60, 78)} · alle 79 ${r.hist[79]}`);
  log(`Histogramm (h:Zellen, nur ≥ 40 Zellen): ${r.hist.map((c, h) => [h, c]).filter(([h, c]) => h > 0 && c >= 40).map(([h, c]) => `${h}:${c}`).join(' ')}`);
  if (typeof args.out === 'string') {
    const cells = [];
    for (let k = 0; k < r.hours.length; k++) if (r.water[k] && r.hours[k]) cells.push(k, r.hours[k]);
    const doc = {
      schema: 1, product: 'sea-dry-map', model: 'cwam', run: r.run, steps: r.steps, ni: g.ni, nj: g.nj,
      rule: 'Stunden mit Hs < 0,01 m und Tm-1,0 = 1,0 s (Zustand „kein Seegang“ des Modells), je Seezelle über alle Schritte des Laufs',
      source: 'DWD CWAM (swh, tm10), Deutscher Wetterdienst, GeoNutzV', built: new Date().toISOString(),
      about: 'cells = [Zellindex j·ni+i, Stunden, …] — nur Zellen mit mindestens einer Stunde',
      cells,
    };
    const out = resolve(args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(doc) + '\n');
    log(`geschrieben: ${out} (${cells.length / 2} Zellen)`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
