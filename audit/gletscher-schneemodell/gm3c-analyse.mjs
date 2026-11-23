#!/usr/bin/env node
/**
 * Phase GM, GM-3c — evaluation of the local full runs (audit §3f.4): byte comparison of output trees, weight of the snowpack product, what the rows hold.
 *
 *   node audit/gletscher-schneemodell/gm3c-analyse.mjs --base=C:/dev/buscosun-glacier-cache --ref=gm3c/out-default --refPatch=gm3c/patch-default \
 *        --off=gm3c-snowpack/out-off --shadow=gm3c-snowpack/out-shadow [--next=gm3c-snowpack/out-next] [--cold=gm3c-snowpack/out-cold]
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const arg = (n, d = null) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const base = arg('base');
const dir = (n) => (arg(n) ? join(base, arg(n)) : null);
const walk = (d, b = d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name), b) : [relative(b, join(d, e.name)).split('\\').join('/')]));
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const quant = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return Math.round((s[lo] + (s[hi] - s[lo]) * (i - lo)) * 10) / 10; };
const q3 = (a) => [quant(a, 0.1), quant(a, 0.5), quant(a, 0.9)];

function compare(a, b, ignore = () => false) {
  const fa = walk(a).filter((f) => !ignore(f)), fb = walk(b).filter((f) => !ignore(f));
  const onlyA = fa.filter((f) => !fb.includes(f)), onlyB = fb.filter((f) => !fa.includes(f));
  const diff = fa.filter((f) => fb.includes(f) && Buffer.compare(readFileSync(join(a, f)), readFileSync(join(b, f))) !== 0);
  return { a: fa.length, b: fb.length, same: fa.length - onlyA.length - diff.length, different: diff, onlyA, onlyB };
}
const patchOf = (d) => { const p = d.replace(/out-([^/\\]+)$/, 'patch-$1'); if (!existsSync(p)) return null; const s = J(join(p, 'status-patch.json')), i = J(join(p, 'index-patch.json')); return { s, i }; };
const stripped = (p) => { const s = structuredClone(p.s), i = structuredClone(p.i); delete s.lines.snowpack; delete s.lines.melt.seconds; if (s.lines.weather?.levels) delete s.lines.weather.levels.seconds; delete i.snowpack; return JSON.stringify([s, i]); };
const weight = (file) => { const b = readFileSync(file); return { raw: b.length, gzip: gzipSync(b, { level: 9 }).length, brotli: brotliCompressSync(b).length }; };
const docStats = (d) => {
  const f = readdirSync(join(d, 'snowpack')).find((x) => /^\d{10}\.json$/.test(x)), doc = J(join(d, 'snowpack', f)), rows = doc.glaciers;
  const lv = (get) => [0, 1, 2].map((l) => q3(rows.map((r) => get(r, l))));
  return {
    run: doc.run, glaciers: rows.length, skipped: doc.skipped.length, skippedReasons: doc.skipped.reduce((m, s) => { const k = s.reason.replace(/^error: /, ''); m[k] = (m[k] ?? 0) + 1; return m; }, {}), coverage: doc.coverage, state: doc.state,
    rules: { precip: doc.rules.precip.rule, density: doc.rules.density, phase: doc.rules.forcing.phase },
    hsNowCm: lv((r, l) => r.hs[l]), sweNowMm: lv((r, l) => r.swe[l]), hn24Cm: lv((r, l) => r.hn[l][0]), hn72Cm: lv((r, l) => r.hn[l][2]), hsDay1Cm: lv((r, l) => r.hsd[l][0]), hsDay14Cm: lv((r, l) => r.hsd[l][13]),
    newSnowDay1Cm: lv((r, l) => r.hnd[l][0]), newSnow14Cm: lv((r, l) => r.hnd[l].reduce((s, v) => s + v, 0)), without: [0, 1, 2].map((l) => rows.filter((r) => r.hs[l] === 0).length),
    weight: { doc: weight(join(d, 'snowpack', f)), state: weight(join(d, 'snowpack', 'state.json')) },
  };
};

const out = { kind: 'glacier/gm3c-analyse', generated: new Date().toISOString() };
const ref = dir('ref'), off = dir('off'), shadow = dir('shadow'), next = dir('next'), cold = dir('cold');
if (ref && off) {
  out.offAgainstReference = compare(ref, off);
  const pr = arg('refPatch') ? { s: J(join(base, arg('refPatch'), 'status-patch.json')), i: J(join(base, arg('refPatch'), 'index-patch.json')) } : null, po = patchOf(off);
  if (pr && po) out.offAgainstReference.patches = { index: JSON.stringify(pr.i) === JSON.stringify(po.i), statusWithoutSeconds: stripped(pr) === stripped(po), secondsOff: po.s.lines.melt.seconds, secondsRef: pr.s.lines.melt.seconds };
}
for (const [name, d] of [['shadow', shadow], ['next', next], ['cold', cold]]) {
  if (!d) continue;
  const o = { againstOff: off ? compare(off, d, (f) => f.startsWith('snowpack/')) : null, added: walk(d).filter((f) => f.startsWith('snowpack/')), ...docStats(d) };
  const po = off ? patchOf(off) : null, pd = patchOf(d);
  if (po && pd) { o.patches = { sameWithoutOwnEntries: stripped(po) === stripped(pd), status: pd.s.lines.snowpack, pointer: pd.i.snowpack, meltSeconds: pd.s.lines.melt.seconds }; }
  out[name] = o;
}
if (off) { const w = walk(off); out.offTree = { files: w.length, bytes: w.reduce((s, f) => s + statSync(join(off, f)).size, 0), snowpackFiles: w.filter((f) => f.startsWith('snowpack/')).length }; }
writeFileSync('audit/gletscher-schneemodell/gm3c-analyse.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
