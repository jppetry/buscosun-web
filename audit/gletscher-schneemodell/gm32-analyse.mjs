#!/usr/bin/env node
/**
 * gm32-analyse.mjs — phase GM (GM-3d, V-GM-32): reads the local full runs of the state switch and writes the numbers of the audit (§3g.4).
 *
 *   node audit/gletscher-schneemodell/gm32-analyse.mjs --root=C:\dev\buscosun-glacier-cache\gm32
 *
 * Expects below `--root`: `ref` (the reference tree of the run without the switch, before the change), `off` and `on` (the full run at the same hour
 * without the switch and with `--melt-state=run-hour`), and the two chains `a-A|a-B|a-C` (`ahead`) and `r-A|r-B|r-C` (`run-hour`): A at the hour the
 * view's state belongs to, B 3 h later, C 6 h later (B and C both read the state of A).
 */
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const root = args.root;
const walk = (d, pre = '') => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n), `${pre}${n}/`) : [`${pre}${n}`]));
const cmp = (a, b) => {
  const fa = walk(a).sort(), fb = new Set(walk(b));
  const onlyA = fa.filter((f) => !fb.has(f)), both = fa.filter((f) => fb.has(f)), onlyB = [...fb].filter((f) => !fa.includes(f));
  const differ = both.filter((f) => Buffer.compare(readFileSync(join(a, f)), readFileSync(join(b, f))) !== 0);
  return { files: fa.length, same: both.length - differ.length, differ, onlyA, onlyB };
};
const J = (f) => JSON.parse(readFileSync(f, 'utf8'));
const docOf = (dir) => { const f = readdirSync(join(root, dir, 'melt')).filter((n) => /^\d{10}\.json$/.test(n)).sort().at(-1); return J(join(root, dir, 'melt', f)); };
const newest = (dir) => {
  // the run document this run wrote = the one whose id is the run of the status patch's hour; the tree also carries the copied runs of the last 72 h
  const runs = readdirSync(join(root, dir, 'melt')).filter((n) => /^\d{10}\.json$/.test(n)).sort();
  return runs.at(-1).replace('.json', '');
};
const mean = (a) => Math.round((a.reduce((s, v) => s + v, 0) / a.length) * 10) / 10;
const tile = (d) => { const ice = d.glaciers.map((g) => g.ice); return { run: d.run, state: d.state, glaciers: ice.length, iceMean: mean(ice), iceZero: ice.filter((v) => v === 0).length, ix7Sum: d.glaciers.reduce((s, g) => s + g.ix7[1], 0) }; };
const rowsCmp = (x, y) => {
  const my = new Map(y.glaciers.map((g) => [g.id, g]));
  let same = 0, iceDiff = 0, idxDiff = 0, maxIce = 0, maxIdx = 0, n = 0;
  for (const g of x.glaciers) {
    const h = my.get(g.id); if (!h) continue; n++;
    if (JSON.stringify(g) === JSON.stringify(h)) { same++; continue; }
    if (g.ice !== h.ice) { iceDiff++; maxIce = Math.max(maxIce, Math.abs(g.ice - h.ice)); }
    const dI = Math.max(...g.idx.flatMap((t, d) => t.map((v, k) => Math.abs(v - h.idx[d][k]))), ...g.ix7.map((v, k) => Math.abs(v - h.ix7[k])), ...g.ix14.map((v, k) => Math.abs(v - h.ix14[k])));
    if (dI > 0) { idxDiff++; maxIdx = Math.max(maxIdx, dI); }
  }
  return { shared: n, identical: same, iceDiffers: iceDiff, maxIcePoints: maxIce, indexDiffers: idxDiff, maxIndexPoints: maxIdx };
};
const stateFile = (dir) => { const f = join(root, dir, 'melt', 'state.json'); const s = J(f); return { bytes: statSync(f).size, at: new Date(s.atMs).toISOString(), glaciers: Object.keys(s.g).length, pend: s.pend ? { h: s.pend.h, owners: Object.keys(s.pend.f).length, mapped: Object.keys(s.pend.o).length } : null }; };

const out = { kind: 'gm32-analyse', readAt: new Date().toISOString(), root };
if (existsSync(join(root, 'ref')) && existsSync(join(root, 'off'))) out.offVsRef = cmp(join(root, 'ref'), join(root, 'off'));
if (existsSync(join(root, 'on'))) { out.onVsOff = cmp(join(root, 'off'), join(root, 'on')); out.stateOff = stateFile('off'); out.stateOn = stateFile('on'); out.onDoc = tile(docOf('on')); out.offDoc = tile(docOf('off')); out.onVsOffRows = rowsCmp(docOf('off'), docOf('on')); }
for (const k of ['a-A', 'a-B', 'a-C', 'r-A', 'r-B', 'r-C']) if (existsSync(join(root, k))) out[k] = { ...tile(docOf(k)), newest: newest(k), stateFile: stateFile(k) };
if (out['a-A'] && out['r-A']) out.rowsA = rowsCmp(docOf('a-A'), docOf('r-A'));
if (out['a-B'] && out['r-B']) out.rowsB = rowsCmp(docOf('a-B'), docOf('r-B'));
if (out['a-C'] && out['r-C']) out.rowsC = rowsCmp(docOf('a-C'), docOf('r-C'));
const file = args.out ?? join(dirname(fileURLToPath(import.meta.url)), 'gm32-analyse.json');
writeFileSync(file, JSON.stringify(out, null, 1));
const short = (c) => (c ? `${c.same} von ${c.files} gleich, anders: ${c.differ.join(' ') || '—'}${c.onlyA.length ? `, nur links: ${c.onlyA.join(' ')}` : ''}${c.onlyB.length ? `, nur rechts: ${c.onlyB.join(' ')}` : ''}` : '—');
console.log(`ohne Schalter gegen Referenz: ${short(out.offVsRef)}`);
console.log(`run-hour gegen ohne Schalter: ${short(out.onVsOff)}`);
for (const k of ['a-A', 'r-A', 'a-B', 'r-B', 'a-C', 'r-C']) if (out[k]) console.log(`${k}: Lauf ${out[k].run} ${JSON.stringify(out[k].state)} Kachel Mittel ${out[k].iceMean} %, 0 % bei ${out[k].iceZero} von ${out[k].glaciers}; ix7-Summe ${out[k].ix7Sum}; Zustand ${out[k].stateFile.bytes} B @ ${out[k].stateFile.at}`);
for (const k of ['rowsA', 'rowsB', 'rowsC', 'onVsOffRows']) if (out[k]) console.log(`${k}: ${JSON.stringify(out[k])}`);
console.log(`→ ${file}`);
