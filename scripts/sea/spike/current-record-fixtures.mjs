#!/usr/bin/env node
/**
 * Phase ST — records the fixtures of `verify:sea-current` from real BSH files (`audit/seewetter-stroemung.md` §4).
 * Run once on the day files of a run; nothing here is product code.
 *
 *   run/Current_{db,wb}_<run>_00.grb2   BYTE-EXACT cuts of the real day files: the four messages of 00:45 and 01:00 UTC
 *                                        (u and v each) — offset and length in the source file stand in the manifest
 *   series.json                          the 15-min u/v of the whole run at the model cells of six spots (decoded with the
 *                                        producer reader; the reader itself is checked against ecCodes in `reference-eccodes.json`)
 *   doc.json                             the product the producer wrote for the whole run (`current/<run>.json`)
 *   reference-request.json               which cells the independent decoder is asked for (input of `current-reference.py`)
 *   manifest.json                        sha256 and length of every fixture, provenance of the cuts
 * The listings (`filebox-*.xml`, `ftp-*.txt`) are copied as they were recorded; `reference-eccodes.json` is written by
 * `current-reference.py` (ecCodes, an independent decoder) — both are passed in with `--extra=<dir>`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/current-record-fixtures.mjs
 *     --files=<dir with the six day files> --run=YYYYMMDDHH --doc=<current/<run>.json of a producer run> --extra=<dir> [--out=scripts/lib/fixtures/sea/current]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { bshMessages, bshHead, bshField } from '../bshGrib.mjs';
import { bshIndexOfCwam } from '../../../src/sea/seaCurrent.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const dir = resolve(String(args.files)), run = String(args.run), out = resolve(String(args.out ?? 'scripts/lib/fixtures/sea/current'));
const doc = JSON.parse(readFileSync(resolve(String(args.doc)), 'utf8'));
const sha = (b) => createHash('sha256').update(b).digest('hex');
const SERIES = ['elbe-wittenbergen', 'sylt-hoernum', 'norderney', 'cuxhaven-duhnen', 'helgoland', 'warnemuende'];
const CUT_T = [Date.parse(`${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}T00:45:00Z`), Date.parse(`${run.slice(0, 4)}-${run.slice(4, 6)}-${run.slice(6, 8)}T01:00:00Z`)];
mkdirSync(join(out, 'run'), { recursive: true });
const manifest = { recorded: new Date().toISOString(), run, source: 'BSH Strömungsvorhersage, Pakete db und wb (CC BY 4.0)', cuts: {}, files: {} };
const request = {};
const series = { run, stepMin: 15, note: 'u (east) and v (north) in m/s at the model cell of the spot, every 15-min step of the run', spots: {} };

for (const pkg of ['db', 'wb']) {
  // Cells the reference decoder is asked for: the cell of every spot of this package in the product.
  request[pkg] = Object.values(doc.spots).filter((s) => s.pkg === pkg).map((s) => bshIndexOfCwam(pkg, s.cell[0], s.cell[1])).sort((a, b) => a - b);
  const want = Object.entries(doc.spots).filter(([id, s]) => SERIES.includes(id) && s.pkg === pkg).map(([id, s]) => ({ id, k: bshIndexOfCwam(pkg, s.cell[0], s.cell[1]), cell: s.cell }));
  for (const w of want) series.spots[w.id] = { pkg, cell: w.cell, t: [], u: [], v: [] };
  for (const day of doc.bsh.days) {
    const name = `Current_${pkg}_${run}_${day}.grb2`, raw = new Uint8Array(readFileSync(join(dir, name)));
    const msgs = bshMessages(raw);
    if (day === doc.bsh.days[0]) {
      const pick = msgs.filter((m) => CUT_T.includes(bshHead(raw, m.offset, m.length).t));
      if (pick.length !== 4 || pick.some((m, i) => i > 0 && m.offset !== pick[i - 1].offset + pick[i - 1].length)) throw new Error(`${name}: the four messages of the cut are not contiguous`);
      const offset = pick[0].offset, length = pick.reduce((a, m) => a + m.length, 0);
      const cut = raw.subarray(offset, offset + length);
      writeFileSync(join(out, 'run', name), cut);
      manifest.cuts[`run/${name}`] = { from: name, fromBytes: raw.length, fromSha256: sha(raw), offset, length, messages: pick.length, times: CUT_T.map((t) => new Date(t).toISOString()) };
    }
    const byT = new Map();
    for (const m of msgs) { const f = bshField(raw, m.offset, m.length); const e = byT.get(f.t) ?? {}; e[f.num === 2 ? 'u' : 'v'] = f.values; byT.set(f.t, e); }
    for (const [t, e] of [...byT].sort((a, b) => a[0] - b[0])) for (const w of want) {
      const s = series.spots[w.id];
      s.t.push(t); s.u.push(+e.u[w.k].toFixed(6)); s.v.push(+e.v[w.k].toFixed(6));
    }
    console.log(`${name}: ${msgs.length} messages`);
  }
}
for (const s of Object.values(series.spots)) { s.t0 = s.t[0]; s.n = s.t.length; delete s.t; }
writeFileSync(join(out, 'series.json'), JSON.stringify(series) + '\n');
writeFileSync(join(out, 'doc.json'), JSON.stringify(doc) + '\n');
writeFileSync(join(out, 'reference-request.json'), JSON.stringify(request) + '\n');
if (typeof args.extra === 'string') for (const f of readdirSync(resolve(args.extra))) if (/^(filebox-|ftp-|reference-eccodes)/.test(f)) copyFileSync(join(resolve(args.extra), f), join(out, f));
for (const f of [...readdirSync(out).filter((x) => x !== 'manifest.json' && x !== 'run'), ...readdirSync(join(out, 'run')).map((x) => `run/${x}`)]) {
  const b = readFileSync(join(out, f));
  manifest.files[f] = { bytes: b.length, sha256: sha(b) };
}
if (!existsSync(join(out, 'reference-eccodes.json'))) console.log('reference-eccodes.json fehlt noch: current-reference.py laufen lassen und dieses Skript mit --extra wiederholen');
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${Object.keys(manifest.files).length} fixtures in ${out}`);
