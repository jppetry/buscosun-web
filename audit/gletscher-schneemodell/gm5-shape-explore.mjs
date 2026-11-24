#!/usr/bin/env node
/**
 * GM-5 — EXPLORATORY, written AFTER the first scored run of gm5-distribution.mjs (no verdict): where the truth's shape departs from "linear between
 * three elevations". Per glacier-winter of the scored set (same filters as gm5-distribution.mjs, A.5): relative winter balance d = bw/bw̄ − 1 of the
 * lowest and the highest 100-m band against the straight line through the two bands next to them (extrapolated), and the persistent residual
 * pattern (d − L3) averaged per glacier on the normalized elevation. Writes gm5-shape-explore.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STATIC = 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1/static/20261120-1';
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cat = new Map(rd(join(STATIC, 'catalog.json')).glaciers.map((g) => [g.id, g]));
const truth = rd('C:/dev/buscosun-glacier-cache/gm3/truth/gy.json').gy;
const med = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = (s.length - 1) / 2; return (s[Math.floor(m)] + s[Math.ceil(m)]) / 2; };
const qt = (a, q) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); const p = q * (s.length - 1), i = Math.floor(p); return s[i] + (s[Math.min(s.length - 1, i + 1)] - s[i]) * (p - i); };
const top = [], tongue = [], topRel = [], tongueRel = [], areaTop = [], areaTongue = [];
let n = 0;
for (const w of truth) {
  const g = cat.get(w.catId); if (!g || g.klass !== 'A') continue;
  const bins = w.bins.filter((b) => b.area > 0 && Number.isFinite(b.bw)).sort((a, b) => a.z0 - b.z0);
  if (bins.length < 4) continue;
  const A = bins.reduce((s, b) => s + b.area, 0), bwm = bins.reduce((s, b) => s + b.area * b.bw, 0) / A;
  if (!(bwm > 100)) continue;
  n++;
  const d = bins.map((b) => b.bw / bwm - 1), k = d.length;
  const extTop = d[k - 2] + (d[k - 2] - d[k - 3]), extTongue = d[1] - (d[2] - d[1]);
  top.push(d[k - 1] - extTop); tongue.push(d[0] - extTongue);
  topRel.push(bins[k - 1].bw / bins[k - 2].bw - 1); tongueRel.push(bins[0].bw / bins[1].bw - 1);
  areaTop.push(bins[k - 1].area / A); areaTongue.push(bins[0].area / A);
}
const out = { kind: 'gm5/shape-explore', exploratory: true, writtenAfter: 'first scored run of gm5-distribution.mjs', glacierWinters: n,
  topBand: { againstLineOfTwoBelow: { median: med(top), p10: qt(top, 0.1), p90: qt(top, 0.9) }, relativeToBandBelow: { median: med(topRel), p10: qt(topRel, 0.1), p90: qt(topRel, 0.9) }, areaShareMedian: med(areaTop) },
  tongueBand: { againstLineOfTwoAbove: { median: med(tongue), p10: qt(tongue, 0.1), p90: qt(tongue, 0.9) }, relativeToBandAbove: { median: med(tongueRel), p10: qt(tongueRel, 0.1), p90: qt(tongueRel, 0.9) }, areaShareMedian: med(areaTongue) } };
writeFileSync(join(HERE, 'gm5-shape-explore.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
