#!/usr/bin/env node
/**
 * GM-3b (E-GM-7) — the two local full runs of `melt.mjs` at the cube of 21.11. (`--now=2026-11-21T17:50:00Z --always`), read against each other:
 *   A  switch off (no word given) against the run of the code BEFORE GM-3b (`gm2/out-default`): every file byte for byte;
 *   B  switch `country` against switch off: what changes in the melt document and in the carried snow state.
 * Result: gm3b-analyse.json.
 *
 *   node audit/gletscher-schneemodell/gm3b-analyse.mjs [--cache=C:/dev/buscosun-glacier-cache]
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const CACHE = arg('cache', 'C:/dev/buscosun-glacier-cache');
const REF = join(CACHE, 'gm2', 'out-default'), REFP = join(CACHE, 'gm2', 'patch-default');
const OFF = join(CACHE, 'gm3b', 'out-off'), OFFP = join(CACHE, 'gm3b', 'patch-off');
const ON = join(CACHE, 'gm3b', 'out-country');
const V1 = join(CACHE, 'gs', 'view', 'glacier', 'v1');
const RUN = '2026112117';
const NUDGE = 250;   // MELT_SNOW_NUDGE_MM of melt.mjs
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const walk = (dir, base = dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p, base) : [relative(base, p).replace(/\\/g, '/')]; });
const r1 = (v) => Math.round(v * 10) / 10, r3 = (v) => Math.round(v * 1000) / 1000;

// --- A: off against the code before GM-3b ---------------------------------------------------------------------------------------------------
const refFiles = walk(REF).sort(), offFiles = walk(OFF).sort();
const differ = refFiles.filter((f) => !existsSync(join(OFF, f)) || !readFileSync(join(REF, f)).equals(readFileSync(join(OFF, f))));
const noSeconds = (p) => { const s = J(p); delete s.lines.melt.seconds; if (s.lines.weather?.levels) delete s.lines.weather.levels.seconds; return JSON.stringify(s); };
const A = {
  reference: 'gm2/out-default (Lauf des Standes vor GM-3b, 22.11.)', files: { reference: refFiles.length, off: offFiles.length, sameNames: JSON.stringify(refFiles) === JSON.stringify(offFiles) },
  different: differ.length, differentFiles: differ.slice(0, 10),
  indexPatchSame: readFileSync(join(REFP, 'index-patch.json')).equals(readFileSync(join(OFFP, 'index-patch.json'))),
  statusPatchSameWithoutSeconds: noSeconds(join(REFP, 'status-patch.json')) === noSeconds(join(OFFP, 'status-patch.json')),
};

// --- B: country against off ------------------------------------------------------------------------------------------------------------------
const build = J(join(V1, 'index.json')).static.build;
const cat = Object.fromEntries(J(join(V1, 'static', build, 'catalog.json')).glaciers.map((g) => [g.id, g]));
const dOff = J(join(OFF, 'melt', `${RUN}.json`)), dOn = J(join(ON, 'melt', `${RUN}.json`));
const sOff = J(join(OFF, 'melt', 'state.json')).g, sOn = J(join(ON, 'melt', 'state.json')).g;
const sBefore = existsSync(join(V1, 'melt', 'state.json')) ? J(join(V1, 'melt', 'state.json')).g : {};
const rowsOn = Object.fromEntries(dOn.glaciers.map((r) => [r.id, r]));
const fields = ['idx', 'ix7', 'ix14', 'ice', 'zf', 'zs', 'nf', 'f'];
const changed = Object.fromEntries(fields.map((k) => [k, 0]));
let rowsDifferent = 0, maxIdx = 0;
for (const a of dOff.glaciers) {
  const b = rowsOn[a.id]; let any = false;
  for (const k of fields) if (JSON.stringify(a[k]) !== JSON.stringify(b?.[k])) { changed[k]++; any = true; }
  if (any) rowsDifferent++;
  if (b) a.idx.forEach((t, d) => t.forEach((v, i) => { maxIdx = Math.max(maxIdx, Math.abs(v - b.idx[d][i])); }));
}
const { precip, ...paramsOn } = dOn.params;
// snow state after the six hours the run carries on: mean snow water over the bands of a glacier (unweighted), and the six-hour gain where the state before is known
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const by = {};
for (const id of Object.keys(sOff)) {
  const g = cat[id]; if (!g || !sOn[id]) continue;
  const c = (by[g.country] ??= { glaciers: 0, withDifference: 0, off: 0, on: 0, gainOff: 0, gainOn: 0, gainGlaciers: 0, ratios: [] });
  const a = mean(sOff[id][0]), b = mean(sOn[id][0]);
  c.glaciers++; c.off += a; c.on += b; if (JSON.stringify(sOff[id][0]) !== JSON.stringify(sOn[id][0])) c.withDifference++;
  // the state before: carried (the file of the view) or, in a cold start, 0 or the satellite value (250 mm) — six hours of snowfall stay far below that
  const carried = dOff.state.source === 'carried' ? sBefore[id]?.[0] : null;
  const gainOf = (v, i) => v - (carried ? carried[i] : v >= NUDGE ? NUDGE : 0);
  // bands that gained 0,3 … 100 mm in the run with the switch off (the file is rounded to 0,1 mm; a satellite band that melted a little reads as a gain of
  // nearly 250 mm and is left out): the gain is the accumulation of the six hours
  let gOff = 0, gOn = 0, n = 0;
  sOff[id][0].forEach((v, i) => { const x = gainOf(v, i), y = gainOf(sOn[id][0][i], i); if (x >= 0.3 && x < 100 && y > 0 && y < 100) { gOff += x; gOn += y; n++; } });
  if (n) { c.gainOff += gOff / n; c.gainOn += gOn / n; c.gainGlaciers++; c.ratios.push(gOn / gOff); }
}
// direction of the index: sum of the 14 daily medians per glacier
let lower = 0, higher = 0, sumOff = 0, sumOn = 0; const moved = [];
for (const a of dOff.glaciers) {
  const b = rowsOn[a.id]; if (!b) continue;
  const x = a.idx.reduce((s, t) => s + t[1], 0), y = b.idx.reduce((s, t) => s + t[1], 0);
  sumOff += x; sumOn += y; if (y < x) lower++; else if (y > x) higher++;
  if (x !== y) moved.push({ id: a.id, country: cat[a.id]?.country, z: cat[a.id]?.z, off: x, on: y });
}
moved.sort((p, r) => Math.abs(r.on - r.off) - Math.abs(p.on - p.off));
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) * p)] : null; };
const countries = Object.fromEntries(Object.entries(by).map(([k, c]) => [k, {
  glaciers: c.glaciers, stateDifferent: c.withDifference, meanSweOffMm: r1(c.off / c.glaciers), meanSweOnMm: r1(c.on / c.glaciers),
  sixHourGain: c.gainGlaciers ? { glaciers: c.gainGlaciers, offMm: r3(c.gainOff / c.gainGlaciers), onMm: r3(c.gainOn / c.gainGlaciers), ratioOfSums: r3(c.gainOn / c.gainOff), ratioMedian: r3(q(c.ratios, 0.5)), ratioP10: r3(q(c.ratios, 0.1)), ratioP90: r3(q(c.ratios, 0.9)) } : null,
}]));
const B = {
  rows: dOff.glaciers.length, rowsOn: dOn.glaciers.length, rowsDifferent, changedByField: changed, maxIndexDifference: maxIdx,
  indexMedianSum14: { off: sumOff, on: sumOn, glaciersLower: lower, glaciersHigher: higher, largest: moved.slice(0, 5) },
  paramsOtherwiseSame: JSON.stringify(paramsOn) === JSON.stringify(dOff.params), stateOf: dOff.state, stateOn: dOn.state, unit: [dOff.gate.unit, dOn.gate.unit],
  precipBlock: { rule: precip?.rule, regions: Object.keys(precip?.regions ?? {}).length, F: Object.fromEntries(['ch-ost', 'at-dachstein', 'de'].map((r) => [r, precip?.regions?.[r]?.F])), gradient: precip?.gradient, bridge: precip?.bridge, gate: precip?.gate },
  bytes: { off: statSync(join(OFF, 'melt', `${RUN}.json`)).size, on: statSync(join(ON, 'melt', `${RUN}.json`)).size },
  expectedRatioAtMedian: { CH: r3(1.793 / dOff.params.pf), AT: r3(2.326 / dOff.params.pf), DE: r3(1.854 / dOff.params.pf) },
  countries,
};
const out = { generated: new Date().toISOString(), run: RUN, now: '2026-11-21T17:50:00Z', A, B };
writeFileSync(join(import.meta.dirname, 'gm3b-analyse.json'), JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify(out, null, 1));
