/**
 * pressure-profile-shadow.mjs — Abnahme-Gate von AP15 VOR dem Archiv (Jans Punkt C, `audit/fusion-vollform.md` §9.3).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs audit/fusion-vollform/pressure-profile-shadow.mjs
 *
 * Frage: verbessert das Druckflächen-Profil (ii) die Höhenkorrektur gegenüber der Standard-Lapse (i)? Referenz ist das
 * Modelllevel-Profil der Stufe t1 (iii) — dieselbe Zelle, dieselbe Stunde. KEINE Wahrheit: (iii) ist das ICON-D2-Profil;
 * AP9 wiederholt den Vergleich gegen Stationsmessungen.
 *
 * Stichprobe: die Archivpunkte (`scripts/punktarchiv/points.json`, h_true = Stationshöhe) an ihrer NÄCHSTEN t1-Zelle,
 * alle t1-Schritte mit Modelllevel-Profil, im lebenden Cube (Index @main, Chunks gepinnt über raw.githubusercontent).
 * Je Fall: T an h_true nach PAP 4 (`verticalCorrection`) mit (i) profile null, (ii) `pressureProfileFromCell`
 * (extendBelowBase false, E-F-14; die Variante mit Fall C wird mitberichtet), (iii) dem Modelllevel-Profil (wie heute).
 * Berichtet: Γ-MAE gegen (iii); T-Fehler gegen (iii) an Punkten mit |h_true − hModEff| > 300 m (dazu alle); die
 * Fehlalarme (ii sieht eine Inversion, iii nicht) und Treffer getrennt; Nacht/Tag nach Ortssonnenzeit.
 */
import { readFileSync } from 'node:fs';
import { decodeCubeChunk, dequantize, planeOffset, cellOf, chunkOf, chunkPath, TIER_BY_ID } from '../../src/point/cubeFormat.ts';
import { pressureProfileFromCell, profileFromColumnTs, PRESSURE_PROFILE_SET } from '../../src/point/profileColumn.ts';
import { verticalCorrection } from '../../src/pointForecast/fusion/vertical.ts';

const RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/';
const idx = await (await fetch('https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/point/index.json', { cache: 'no-store' })).json();
const get = async (p) => { for (let i = 0; i < 4; i++) { const r = await fetch(RAW + idx.commit + '/' + p); if (r.ok) return r; await new Promise((s) => setTimeout(s, 600)); } throw new Error('fetch ' + p); };
const L = idx.latestByTier.t1;
const man = await (await get(L.manifest)).json();
const tierM = man.tiers.find((t) => t.id === 't1');
const planes = man.planes;
const pi = Object.fromEntries(planes.map((p, i) => [p.id, i]));
const tier = TIER_BY_ID.t1;
const runMs = Date.parse(tierM.runAt);
const points = JSON.parse(readFileSync(new URL('../../scripts/punktarchiv/points.json', import.meta.url), 'utf8')).points;

// Punkte je Chunk gruppieren — jeder Chunk wird einmal geholt.
const byChunk = new Map();
for (const p of points) {
  const c = cellOf(tier, p.lat, p.lon); if (!c) continue;
  const ch = chunkOf(c.iy, c.ix), k = `${ch.cy}_${ch.cx}`;
  if (!byChunk.has(k)) byChunk.set(k, { ch, pts: [] });
  byChunk.get(k).pts.push({ ...p, cell: c });
}
const WANT = ['t2m', 'ps', 'hModEff', 't925', 't850', 't700', 'gammaEff', 'zBase', 'zInv', 'dTInv'];
const cases = [];
let bytes = 0;
const jobs = [...byChunk.values()];
for (let i = 0; i < jobs.length; i += 8) {
  await Promise.all(jobs.slice(i, i + 8).map(async ({ ch, pts }) => {
    const b = new Uint8Array(await (await get(chunkPath(L.run, tier, ch.cy, ch.cx))).arrayBuffer());
    bytes += b.length;
    const chunk = await decodeCubeChunk(b, { planes, wanted: WANT });
    for (const p of pts) {
      const ry = p.cell.iy - chunk.y0, rx = p.cell.ix - chunk.x0;
      for (let it = 0; it < chunk.nt; it++) {
        const v = {};
        for (const id of WANT) v[id] = dequantize(chunk.planes[pi[id]][planeOffset(chunk, it, ry, rx)], planes[pi[id]]);
        if (v.gammaEff == null || v.zBase == null || v.zInv == null || v.dTInv == null || v.t2m == null || v.hModEff == null) continue;
        const validMs = runMs + tierM.leadHours[it] * 3_600_000;
        const ls = ((new Date(validMs).getUTCHours() + p.lon / 15) % 24 + 24) % 24;
        cases.push({ id: p.id, lat: p.lat, lon: p.lon, hTrue: p.elev, v, night: ls >= 21 || ls < 5, day: ls >= 10 && ls < 16, hasT925: v.t925 != null });
      }
    }
  }));
}

const ref = (c) => ({ gammaEff: c.v.gammaEff, zBase: c.v.zBase, zInv: c.v.zInv, dTInv: c.v.dTInv });
const rows = [];
for (const c of cases) {
  const base = { tMean: c.v.t2m, hModEff: c.v.hModEff, hTrue: c.hTrue, ps: c.v.ps };
  const iii = verticalCorrection({ ...base, profile: ref(c) });
  const i = verticalCorrection({ ...base, profile: null });
  const pp = pressureProfileFromCell(c.v);
  const ii = verticalCorrection({ ...base, profile: pp, extendBelowBase: false });
  const iiC = verticalCorrection({ ...base, profile: pp, extendBelowBase: true });
  const invRef = c.v.zInv > c.v.zBase && c.v.dTInv > 0;
  const invPP = !!pp && pp.zInv > pp.zBase && pp.dTInv > 0;
  rows.push({ c, dh: c.hTrue - c.v.hModEff, eI: i.t - iii.t, eII: ii.t - iii.t, eIIc: iiC.t - iii.t, gRef: c.v.gammaEff, gPP: pp?.gammaEff ?? null, invRef, invPP, pp: !!pp, caseII: ii.case });
}

const mae = (xs) => xs.reduce((a, x) => a + Math.abs(x), 0) / Math.max(1, xs.length);
const bias = (xs) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : '—');
const report = (label, rs) => {
  const pts = new Set(rs.map((r) => r.c.id)).size;
  console.log(`  ${label.padEnd(44)} n ${String(rs.length).padStart(6)} (${String(pts).padStart(3)} Pkt) · MAE (i) Standard-Lapse ${f2(mae(rs.map((r) => r.eI)))} K · (ii) Druckflächen ${f2(mae(rs.map((r) => r.eII)))} K · (ii+C) ${f2(mae(rs.map((r) => r.eIIc)))} K · Bias (i) ${f2(bias(rs.map((r) => r.eI)))} (ii) ${f2(bias(rs.map((r) => r.eII)))}`);
};
console.log(`t1-Lauf ${L.run} (Index ${String(idx.commit).slice(0, 7)}), ${byChunk.size} Chunks, ${(bytes / 1e6).toFixed(1)} MB, ${cases.length} Fälle mit Modelllevel-Profil an ${new Set(cases.map((c) => c.id)).size} Punkten`);
const withPP = rows.filter((r) => r.pp);
console.log(`Ersatzprofil vorhanden: ${withPP.length}/${rows.length} Fällen (ohne: < 3 Niveaus über Grund ⇒ Standard-Lapse)`);
const gs = withPP.filter((r) => Math.abs(r.gRef) <= 20);
console.log(`Γ-MAE gegen (iii): (i) 6,5 K/km ${f2(mae(gs.map((r) => 6.5 - r.gRef)))} K/km · (ii) ${f2(mae(gs.map((r) => r.gPP - r.gRef)))} K/km  (n ${gs.length})`);
console.log('\nT-Fehler gegen das t1-Profil (iii), |Δh| > 300 m (das Gate):');
const big = rows.filter((r) => Math.abs(r.dh) > 300);
report('alle', big);
report('nachts', big.filter((r) => r.c.night));
report('tags', big.filter((r) => r.c.day));
report('Treffer (ii und iii Inversion)', big.filter((r) => r.invPP && r.invRef));
report('FEHLALARM (ii Inversion, iii keine)', big.filter((r) => r.invPP && !r.invRef));
report('verfehlt (iii Inversion, ii keine)', big.filter((r) => !r.invPP && r.invRef));
report('beide ohne Inversion', big.filter((r) => !r.invPP && !r.invRef));
console.log('\nzum Vergleich, alle |Δh|:');
report('alle', rows);
report('|Δh| ≤ 300 m', rows.filter((r) => Math.abs(r.dh) <= 300));
const fa = big.filter((r) => r.invPP && !r.invRef).length, hit = big.filter((r) => r.invPP && r.invRef).length, miss = big.filter((r) => !r.invPP && r.invRef).length;
console.log(`\nInversionen |Δh| > 300 m: Treffer ${hit} · Fehlalarm ${fa} (${(100 * fa / Math.max(1, fa + hit)).toFixed(1)} % der ii-Inversionen) · verfehlt ${miss}`);
const better = mae(big.map((r) => r.eII)) < mae(big.map((r) => r.eI));
console.log(`GATE: (ii) ${better ? 'SCHLÄGT' : 'schlägt NICHT'} die Standard-Lapse (i) bei |Δh| > 300 m (MAE ${f2(mae(big.map((r) => r.eII)))} gegen ${f2(mae(big.map((r) => r.eI)))} K)`);

// ── Varianten zur Entscheidung (NICHT das Produkt — E-F-14 bleibt die Regel, bis Jan anders entscheidet) ─────────────
// V-a Γ über der Inversion aus der Schicht DARÜBER (Nachbarpaar über zInv), sonst 6,5 K/km — statt der Regression,
//     die die Inversion selbst einschließt.
// V-b strengere Inversion: dTMin 1,5 K.  V-c nur Γ aus den Flächen, keine Inversion (Fall A mit Druckflächen-Γ).
// V-d = V-a + V-b.
const colOf = (v) => {
  const P = PRESSURE_PROFILE_SET, out = [{ z: v.hModEff + 2, t: v.t2m }];
  for (const lev of P.levelsHPa) { const tp = v[`t${lev}`]; if (tp != null && v.ps - lev >= P.minAboveGroundHPa) out.push({ z: v.hModEff + (287.05 / 9.80665) * ((v.t2m + tp) / 2 + 273.15) * Math.log(v.ps / lev), t: tp }); }
  return out.sort((a, b) => a.z - b.z);
};
const aboveGamma = (pp, v) => {
  if (!pp || !(pp.zInv > pp.zBase)) return pp?.gammaEff ?? null;
  const col = colOf(v); const k = col.findIndex((c) => Math.abs(c.z - pp.zInv) < 1e-6);
  if (k < 0 || k + 1 >= col.length) return 6.5;
  return Math.min(9.8, -(col[k + 1].t - col[k].t) / (col[k + 1].z - col[k].z) * 1000);
};
const variants = {
  'E-F-14 (wie gebaut)': (v) => pressureProfileFromCell(v),
  'V-a Γ über der Inversion': (v) => { const pp = pressureProfileFromCell(v); return pp && { ...pp, gammaEff: aboveGamma(pp, v) }; },
  'V-b dTMin 1,5 K': (v) => pressureProfileFromCell(v, { ...PRESSURE_PROFILE_SET, dTMinK: 1.5 }),
  'V-c nur Γ, keine Inversion': (v) => { const pp = pressureProfileFromCell(v); return pp && { ...pp, zInv: pp.zBase, dTInv: 0 }; },
  'V-d = V-a + V-b': (v) => { const pp = pressureProfileFromCell(v, { ...PRESSURE_PROFILE_SET, dTMinK: 1.5 }); return pp && { ...pp, gammaEff: aboveGamma(pp, v) }; },
  // V-e/V-f ohne den 2-m-Punkt: die t1-Säule beginnt am untersten Modelllevel (≈ 10 m), nicht bei 2 m — nachts ist die
  // 2-m-Schicht entkoppelt. V-e: Γ aus den Flächen allein (≥ 2 über Grund), keine Inversion. V-f: V-e, Γ ≥ 0 geklemmt.
  'V-e Γ nur aus den Flächen': (v) => fromLevels(v, false),
  'V-f V-e, Γ ≥ 0': (v) => fromLevels(v, true),
  // V-g: 2-m-Punkt nur, wenn die unterste Schicht (2 m → erste Fläche über Grund) KEINE Inversion ist; sonst V-e.
  'V-g 2 m nur ohne Bodeninv.': (v) => { const col = colOf(v); return col.length >= 2 && col[1].t > col[0].t ? fromLevels(v, false) : pressureProfileFromCell(v); },
};
function fromLevels(v, clampNeg) {
  const col = colOf(v).slice(1);
  if (col.length < 2 || v.hModEff == null) return null;
  const r = profileFromColumnTs(col.map((c) => c.t), col.map((c) => c.z), { ...PRESSURE_PROFILE_SET, dTMinK: Infinity });
  if (!Number.isFinite(r.gammaEff)) {
    const g = -(col[1].t - col[0].t) / (col[1].z - col[0].z) * 1000;
    return { gammaEff: Math.min(9.8, clampNeg ? Math.max(0, g) : g), zBase: v.hModEff + 2, zInv: v.hModEff + 2, dTInv: 0 };
  }
  return { gammaEff: Math.min(9.8, clampNeg ? Math.max(0, r.gammaEff) : r.gammaEff), zBase: v.hModEff + 2, zInv: v.hModEff + 2, dTInv: 0 };
}
console.log('\nVarianten (Diagnose, gleiche Stichprobe, MAE gegen (iii) in K; oben (i) Standard-Lapse zum Vergleich):');
const bigCases = rows.filter((r) => Math.abs(r.dh) > 300).map((r) => r.c);
const smallCases = rows.filter((r) => Math.abs(r.dh) <= 300).map((r) => r.c);
const errOf = (cs, fn) => cs.map((c) => {
  const base = { tMean: c.v.t2m, hModEff: c.v.hModEff, hTrue: c.hTrue, ps: c.v.ps };
  return verticalCorrection({ ...base, profile: fn(c.v), extendBelowBase: false }).t - verticalCorrection({ ...base, profile: ref(c) }).t;
});
const line = (name, fn) => {
  const inv = bigCases.map((c) => { const pp = fn(c.v); return !!pp && pp.zInv > pp.zBase && pp.dTInv > 0; });
  const refInv = bigCases.map((c) => c.v.zInv > c.v.zBase && c.v.dTInv > 0);
  const hit = inv.filter((x, k) => x && refInv[k]).length, fa = inv.filter((x, k) => x && !refInv[k]).length;
  const up = bigCases.filter((c) => c.hTrue > c.v.hModEff), down = bigCases.filter((c) => c.hTrue < c.v.hModEff);
  console.log(`  ${name.padEnd(28)} |Δh|>300: alle ${f2(mae(errOf(bigCases, fn)))} · nachts ${f2(mae(errOf(bigCases.filter((c) => c.night), fn)))} · tags ${f2(mae(errOf(bigCases.filter((c) => c.day), fn)))} · über ${f2(mae(errOf(up, fn)))} (n ${up.length}) · unter ${f2(mae(errOf(down, fn)))} (n ${down.length}) · Treffer ${hit} Fehlalarm ${fa} || |Δh|≤300: ${f2(mae(errOf(smallCases, fn)))}`);
};
line('(i) Standard-Lapse', () => null);
for (const [name, fn] of Object.entries(variants)) line(name, fn);
