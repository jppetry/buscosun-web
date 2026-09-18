/**
 * chunk-border.mjs — Diagnose zu AP14 (`audit/fusion-vollform.md` §0, §1.3, §9.2): wie viele Punkte haben eine Zelle
 * des 2×2-Blocks (PAP 3) in einem anderen Chunk, und wie viele Zusatz-Chunks bräuchte der Leser?
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-vollform/chunk-border.mjs
 *
 * Netzfrei, deterministisch. Dieselbe Regel wie Leser und PAP 3 (`blockCellsOutsideChunk` → `blockOffsets` in
 * `src/point/cubeFormat.ts`). Stichproben: die Archivpunkte (`scripts/punktarchiv/points.json`), die zehn Orte des
 * Latenz-Harnischs, 200 000 gleichverteilte Punkte der Domäne (32-bit-LCG, Saat 12345). Gemessen am 18.09.:
 * Archiv t1 12,6 % · t2 14,1 % · t3 8,4 % · irgendeine Stufe 24,0 %; gleichverteilt 11,8 / 11,4 / 10,9 / 24,5 %
 * (analytisch: innere Chunk-Grenzen je Achse / Zellspannen, t1 1 − (1 − 12/200)(1 − 15/240) = 11,9 %, t2 11,5 %,
 * t3 10,9 %). Die gleichverteilten Zahlen der ersten Sonde (§0: 12,9 / 11,5 / 11,0 / 25,4 %) kamen aus einem
 * Gleitkomma-LCG, der oberhalb 2^53 Stellen verliert — korrigiert in AP14 (§9.2).
 */
import { readFileSync } from 'node:fs';
import { TIERS, blockCellsOutsideChunk } from '../../src/point/cubeFormat.ts';

const points = JSON.parse(readFileSync(new URL('../../scripts/punktarchiv/points.json', import.meta.url), 'utf8')).points
  .map((p) => [p.id, p.lat, p.lon]);
const places = [
  ['hamburg', 53.5511, 9.9937], ['berlin', 52.52, 13.405], ['muenchen', 48.1372, 11.5755], ['wien', 48.2082, 16.3738], ['graz', 47.0707, 15.4395],
  ['innsbruck', 47.2692, 11.4041], ['zuerich', 47.3769, 8.5417], ['genf', 46.2044, 6.1432], ['zermatt', 46.0207, 7.7491], ['zugspitze', 47.421, 10.9863],
];
let s = 12345;
const u = () => { s = (Math.imul(1103515245, s) + 12345) >>> 0; return s / 4294967296; };
const uniform = Array.from({ length: 200_000 }, () => ['u', 45.5 + 10 * u(), 5.5 + 12 * u()]);

function summarise(list, label) {
  const n = list.length;
  const per = Object.fromEntries(TIERS.map((t) => [t.id, { border: 0, chunks: {} }]));
  let any = 0;
  const hits = [];
  for (const [id, lat, lon] of list) {
    let hit = false;
    for (const t of TIERS) {
      const g = blockCellsOutsideChunk(t, lat, lon);
      if (!g.length) continue;
      hit = true;
      per[t.id].border++;
      per[t.id].chunks[g.length] = (per[t.id].chunks[g.length] ?? 0) + 1;
      if (list.length <= 20) hits.push(`${id} ${t.id}: +${g.length} (${g.map((x) => `${x.cy}_${x.cx}`).join(',')})`);
    }
    if (hit) any++;
  }
  const pc = (x) => `${(100 * x / n).toFixed(1)} %`;
  console.log(`\n${label} (n = ${n})`);
  for (const t of TIERS) console.log(`  ${t.id}: am Rand ${per[t.id].border} (${pc(per[t.id].border)}) · Zusatz-Chunks ${JSON.stringify(per[t.id].chunks)}`);
  console.log(`  irgendeine Stufe: ${any} (${pc(any)})`);
  for (const h of hits) console.log(`  ${h}`);
}

summarise(points, 'Archivpunkte');
summarise(places, 'Harnisch-Orte');
summarise(uniform, 'gleichverteilt');
