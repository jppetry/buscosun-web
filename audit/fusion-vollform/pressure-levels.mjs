/**
 * pressure-levels.mjs — die Druckflächen-Zahlen aus §0 von `audit/fusion-vollform.md` nachrechenbar (Jans Punkt D).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-vollform/pressure-levels.mjs
 *
 * Am lebenden Cube (Index @main, Chunks über raw.githubusercontent gepinnt), alle t2- und t3-Chunks, eine t1-Stichprobe
 * (jeder 9. Chunk). Je Zellschritt: Belegung t925/t850/t700/ps/hModEff; Anteil der Flächen unter der Modelloberfläche
 * (ps < p); Inversionsanteile nachts/tags (Ortssonnenzeit 21–5 / 10–16 h) nach
 *   U-15  t850 > t925 (die geplante Producer-Regel),
 *   Boden t925 > t2m bei 925 über Grund,
 *   Ersatzprofil `pressureProfileFromCell` (AP15, die Regel des Produkts);
 * die Abweichung hypsometrischer von Standardhöhen (925/850/700 hPa ⇒ 762/1 457/3 012 m). Die Zahlen hängen am Wetter
 * des Laufs — sie sind eine Momentaufnahme, keine Klimatologie.
 */
import { decodeCubeChunk, dequantize, planeOffset, chunkPath, TIER_BY_ID } from '../../src/point/cubeFormat.ts';
import { pressureProfileFromCell, hypsometricHeight } from '../../src/point/profileColumn.ts';

const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/';
const idx = await (await fetch('https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/point/index.json', { cache: 'no-store' })).json();
const get = async (p) => { for (let i = 0; i < 4; i++) { const r = await fetch(RAW + idx.commit + '/' + p); if (r.ok) return r; await new Promise((s) => setTimeout(s, 600)); } throw new Error('fetch ' + p); };
const STD = { 925: 762, 850: 1457, 700: 3012 };
const WANT = ['t2m', 'ps', 'hModEff', 't925', 't850', 't700', 'gammaEff'];
console.log(`Index ${String(idx.commit).slice(0, 7)} (${idx.publishedAt})`);

for (const [tid, every] of [['t2', 1], ['t3', 1], ['t1', 9]]) {
  const L = idx.latestByTier[tid];
  const man = await (await get(L.manifest)).json();
  const tm = man.tiers.find((t) => t.id === tid);
  const tier = TIER_BY_ID[tid];
  const planes = man.planes, pi = Object.fromEntries(planes.map((p, i) => [p.id, i]));
  const runMs = Date.parse(tm.runAt);
  const S = { n: 0, v: { t925: 0, t850: 0, t700: 0, ps: 0, hModEff: 0 }, prof: 0, below: { 925: 0, 850: 0, 700: 0 }, all3: 0,
    u15: [[0, 0], [0, 0]], sfc: [[0, 0], [0, 0]], pp: [[0, 0], [0, 0]], dz: { 925: [], 850: [], 700: [] } };
  const list = [];
  for (let cy = 0; cy < tier.chunk.cy; cy++) for (let cx = 0; cx < tier.chunk.cx; cx++) list.push([cy, cx]);
  for (const [cy, cx] of list.filter((_, i) => i % every === 0)) {
    const ch = await decodeCubeChunk(new Uint8Array(await (await get(chunkPath(L.run, tier, cy, cx))).arrayBuffer()), { planes, wanted: WANT });
    for (let it = 0; it < ch.nt; it++) {
      const vU = new Date(runMs + tm.leadHours[it] * 3_600_000).getUTCHours();
      for (let ry = 0; ry < ch.ny; ry++) for (let rx = 0; rx < ch.nx; rx++) {
        const v = {};
        for (const id of WANT) v[id] = dequantize(ch.planes[pi[id]][planeOffset(ch, it, ry, rx)], planes[pi[id]]);
        S.n++;
        for (const k of Object.keys(S.v)) if (v[k] != null) S.v[k]++;
        if (v.gammaEff != null) S.prof++;
        const lon = tier.lon0 + (ch.x0 + rx) * tier.deg;
        const ls = ((vU + lon / 15) % 24 + 24) % 24;
        const c = ls >= 21 || ls < 5 ? 0 : ls >= 10 && ls < 16 ? 1 : -1;
        if (v.t925 == null || v.t850 == null || v.t700 == null || v.ps == null || v.hModEff == null || v.t2m == null) continue;
        S.all3++;
        for (const p of [925, 850, 700]) if (v.ps < p) S.below[p]++;
        for (const p of [925, 850, 700]) if (v.ps >= p) S.dz[p].push(hypsometricHeight(v.hModEff, v.ps, v.t2m, v[`t${p}`], p) - STD[p]);
        if (c < 0) continue;
        S.u15[c][1]++; if (v.t850 > v.t925) S.u15[c][0]++;
        if (v.ps >= 925) { S.sfc[c][1]++; if (v.t925 > v.t2m) S.sfc[c][0]++; }
        const pp = pressureProfileFromCell(v);
        S.pp[c][1]++; if (pp && pp.zInv > pp.zBase && pp.dTInv > 0) S.pp[c][0]++;
      }
    }
  }
  const pc = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : '—');
  const q = (a) => { const s = [...a].sort((x, y) => x - y); const f = (p) => (s.length ? s[Math.floor(p * (s.length - 1))].toFixed(0) : '—'); return `${f(0.1)} / ${f(0.5)} / ${f(0.9)} m`; };
  console.log(`\n${tid} Lauf ${L.run}: ${S.n} Zellschritte`);
  console.log(`  belegt: t925 ${pc(S.v.t925, S.n)} · t850 ${pc(S.v.t850, S.n)} · t700 ${pc(S.v.t700, S.n)} · ps ${pc(S.v.ps, S.n)} · hModEff ${pc(S.v.hModEff, S.n)} · Modelllevel-Profil ${pc(S.prof, S.n)}`);
  console.log(`  unter Modellgrund (ps < p): 925 ${pc(S.below[925], S.all3)} · 850 ${pc(S.below[850], S.all3)} · 700 ${pc(S.below[700], S.all3)}`);
  console.log(`  Inversion nachts / tags: U-15 t850 > t925 ${pc(...S.u15[0])} / ${pc(...S.u15[1])} · Boden t925 > t2m ${pc(...S.sfc[0])} / ${pc(...S.sfc[1])} · Ersatzprofil (AP15) ${pc(...S.pp[0])} / ${pc(...S.pp[1])}`);
  console.log(`  hypsometrisch − Standard (p10 / p50 / p90): 925 ${q(S.dz[925])} · 850 ${q(S.dz[850])} · 700 ${q(S.dz[700])}`);
}
