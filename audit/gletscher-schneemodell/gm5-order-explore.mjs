#!/usr/bin/env node
/**
 * GM-5 — EXPLORATORY, written AFTER the first scored run of gm5-distribution.mjs (not part of the frozen rule): why the A2 order check gave a
 * Spearman median of 0.91 although D never falls with elevation in any season. Counts, per pair of seasons of one glacier, the strictly discordant
 * band pairs (D_a(z1) < D_a(z2) while D_b(z1) > D_b(z2)) and the tied band pairs. Same data and same definitions as gm5-distribution.mjs.
 * Writes gm5-order-explore.json.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE = 'C:/dev/buscosun-glacier-cache/gm4/live';
const STATIC = 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1/static/20261120-1';
const rd = (p) => JSON.parse(readFileSync(p, 'utf8'));
const cat = new Map(rd(join(STATIC, 'catalog.json')).glaciers.map((g) => [g.id, g]));
const hypso = new Map();
for (const f of readdirSync(join(STATIC, 'hypso'))) for (const [id, h] of Object.entries(rd(join(STATIC, 'hypso', f)).glaciers)) hypso.set(id, h);
const seasons = new Map();
for (const y of readdirSync(join(LIVE, 'season'))) for (const reg of readdirSync(join(LIVE, 'season', y))) for (const f of readdirSync(join(LIVE, 'season', y, reg))) {
  const doc = rd(join(LIVE, 'season', y, reg, f));
  for (const [id, rows] of Object.entries(doc.glaciers)) { if (!seasons.has(id)) seasons.set(id, new Map()); seasons.get(id).set(+y, rows); }
}
const doy = (d) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${d.slice(0, 4)}-01-01T12:00:00Z`)) / 86_400_000) + 1;
function lineRows(rows) { const out = []; for (const r of rows) { const m = r[0].slice(5); if (m < '05-01' || m > '09-30' || r[8] & 1) continue; const line = r[3] === 0 ? -Infinity : r[3] === 2 ? Infinity : r[4] ?? null; if (line != null) out.push([doy(r[0]), line]); } return out.length >= 4 ? out : null; }
function meltOutDay(lr, z) { for (let i = 0; i < lr.length; i++) if (lr[i][1] > z && (i === lr.length - 1 || lr[i + 1][1] > z)) return i === 0 ? null : (lr[i - 1][0] + lr[i][0]) / 2; return null; }
let pairs = 0, bandPairs = 0, discordant = 0, tiedA = 0, tiedEither = 0, distinctShare = [];
for (const [id, ys] of seasons) {
  const h = hypso.get(id); if (!h || !cat.get(id)) continue;
  const zs = h.a.map((v, i) => (v > 0 ? h.z0 + 50 * (i + 0.5) : null)).filter((z) => z != null);
  const Ds = [];
  for (const [, rows] of ys) {
    const lr = lineRows(rows); if (!lr) continue;
    const D = zs.map((z) => meltOutDay(lr, z)); const idx = D.map((d, i) => (d == null ? -1 : i)).filter((i) => i >= 0);
    if (idx.length < 3 || zs[idx.at(-1)] - zs[idx[0]] < 150) continue;
    Ds.push(D); const v = D.filter((d) => d != null); distinctShare.push(new Set(v).size / v.length);
  }
  for (let i = 0; i < Ds.length; i++) for (let j = i + 1; j < Ds.length; j++) {
    const k = zs.map((_, b) => b).filter((b) => Ds[i][b] != null && Ds[j][b] != null);
    if (k.length < 4) continue;
    pairs++;
    for (let x = 0; x < k.length; x++) for (let y = x + 1; y < k.length; y++) {
      bandPairs++;
      const a = Math.sign(Ds[i][k[y]] - Ds[i][k[x]]), b = Math.sign(Ds[j][k[y]] - Ds[j][k[x]]);
      if (a * b < 0) discordant++;
      if (a === 0) tiedA++;
      if (a === 0 || b === 0) tiedEither++;
    }
  }
}
distinctShare.sort((a, b) => a - b);
const out = { kind: 'gm5/order-explore', exploratory: true, writtenAfter: 'first scored run of gm5-distribution.mjs', codeCommit: 'dc982141', seasonPairs: pairs, bandPairs, strictlyDiscordant: discordant, tiedInFirst: tiedA, tiedInEither: tiedEither, tiedShare: tiedEither / bandPairs,
  distinctDaysPerBandMedian: distinctShare[Math.floor(distinctShare.length / 2)] };
writeFileSync(join(HERE, 'gm5-order-explore.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
