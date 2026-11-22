// Phase GM, GM-2 diagnosis (read-only): buscosun Fusion at tongue / median / top on the cube of 21.11. (gs/cube, 489c0e4).
// Questions: (1) where does the snowfall line of the answer fall below 200 m and what do temperature, wet bulb and pSnow of the SAME
// answers say there (K-2)? (2) is pSnow monotone with elevation? (3) which members carry the temperature at the tongue (V-GM-1)?
import { readFileSync } from 'node:fs';
import { makeIo, dirStore, geoBackend } from 'file:///C:/dev/buscosun-web/scripts/road/road-forecast.mjs';
import { getPointForecastFromCube, clearCubeForecastCache } from 'file:///C:/dev/buscosun-web/src/pointForecast/cubeSource.ts';
import { terrainScales } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/terrainScale.ts';
import { installNodeShims } from 'file:///C:/dev/buscosun-web/scripts/punktarchiv/lib/nodeShims.mjs';
import { wetBulbC } from 'file:///C:/dev/buscosun-web/src/pointForecast/fusion/meteo.ts';
import { bandsOf } from 'file:///C:/dev/buscosun-web/scripts/glacier/lib/meltcore.mjs';

installNodeShims();
const H = 3_600_000;
const CUBE = 'C:/dev/buscosun-glacier-cache/gs/cube', V1 = 'C:/dev/buscosun-glacier-cache/gs/view/glacier/v1';
const nowMs = Date.parse(process.argv[2] ?? '2026-11-21T17:50:00Z');
const t0 = Math.floor(nowMs / H) * H;
const HOURS = 120;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const index = J(`${V1}/index.json`), build = index.static.build;
const cat = J(`${V1}/static/${build}/catalog.json`).glaciers;
const want = (process.argv[3] ?? 'Pasterze,Aletsch,Hintereis,Schneeferner,Gepatsch,Morteratsch,Rhone,Dachstein,Hallstätter,Ochsentaler,Gorner,Höllental').split(',');
const picks = [];
for (const w of want) { const g = cat.filter((x) => x.klass !== 'C' && (x.name ?? '').includes(w)).sort((a, b) => (b.area?.km2 ?? 0) - (a.area?.km2 ?? 0))[0]; if (g) picks.push(g); }
const hypCache = new Map();
const hypOf = (region) => { if (!hypCache.has(region)) hypCache.set(region, J(`${V1}/static/${build}/hypso/${region}.json`).glaciers); return hypCache.get(region); };
const io0 = makeIo({ store: dirStore(CUBE), cache: geoBackend(null), nowMs });
const flat = (h, lat, lon) => ({ elevationM: h, tpi500M: 0, tpi2000M: 0, svf: 1, slopeDeg: 0, aspectDeg: null, horizonDeg: new Array(8).fill(0), scales: terrainScales(() => h, lon, lat), sinkDepthM: 0 });
const r1 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
let shown = false;
const all = { hours: 0, low: 0, nonMono: 0, nonMonoWet: 0, maxInv: 0, slBelowTongue: 0, slBelowTongueAndPs0Low: 0 };
for (const g of picks) {
  let hyp; try { hyp = hypOf(g.region)[g.id]; } catch { hyp = null; }
  const zb = hyp ? bandsOf(hyp).zb : null;
  const z = zb ? [zb[0], g.z[1], zb[zb.length - 1]] : g.z;
  const lv = [];
  let ms = 0;
  for (const zz of z) {
    clearCubeForecastCache();
    const t = Date.now();
    const fc = await getPointForecastFromCube({ lat: g.lat, lng: g.lon, country: g.country, hours: 336, pointSource: 'cube', includeRadarNowcast: false }, { ...io0, terrain: false, terrainOverride: flat(zz, g.lat, g.lon) });
    ms += Date.now() - t;
    const by = new Array(HOURS).fill(null);
    for (const s of fc.cube.v2.axis.steps) { const i = Math.round((s.validAtMs - t0) / H); if (i >= 0 && i < HOURS) by[i] = s; }
    if (!shown) {
      shown = true;
      const s0 = by.find(Boolean);
      console.log('t2m:', JSON.stringify(s0.vars.t2m).slice(0, 700));
      console.log('snowline:', JSON.stringify(s0.vars.snowline).slice(0, 400));
      console.log('pSnow:', JSON.stringify(s0.vars.pSnow).slice(0, 300));
      console.log('cell keys snow*:', Object.entries(s0.cell ?? {}).filter(([k]) => /snow/i.test(k)).map(([k, v]) => `${k}=${v}`).join(' '));
      console.log('samples:', (s0.samples ?? []).map((x) => `${x.source}:${x.snowLine ?? '-'}`).join(' ').slice(0, 400));
      console.log('notes:', (fc.cube.notes ?? []).join(' | ').slice(0, 600));
    }
    lv.push(by);
  }
  const v = (l, h, k, f = 'mean') => lv[l][h]?.vars?.[k]?.[f] ?? NaN;
  let low = 0, n = 0, nonMono = 0, firstLow = -1;
  const rows = [];
  for (let h = 0; h < HOURS; h++) {
    const sl = v(1, h, 'snowline'); const ps = [0, 1, 2].map((l) => v(l, h, 'pSnow')); const p = v(1, h, 'precip');
    if (!ps.every(Number.isFinite)) continue;
    n++; all.hours++;
    if (ps[0] > ps[1] + 0.02 || ps[1] > ps[2] + 0.02) { nonMono++; all.nonMono++; if (p > 0.05) all.nonMonoWet++; all.maxInv = Math.max(all.maxInv, ps[0] - ps[1], ps[1] - ps[2]); }
    if (Number.isFinite(sl)) { if (sl < z[0]) { all.slBelowTongue++; if (ps[0] < 0.5) all.slBelowTongueAndPs0Low++; } if (sl < 200) { low++; all.low++; if (firstLow < 0) firstLow = h; } }
  }
  console.log(`\n## ${g.name} (${g.country}, ${g.id}) z ${z.map(Math.round).join(' / ')} m · ${ms} ms für 3 Abrufe · ${n} Stunden mit pSnow an 3 Höhen · Grenze < 200 m in ${low} h · pSnow nicht monoton in ${nonMono} h`);
  const show = new Set([0, 6, 12, 18, 24, 36, 48, 72, 96]); if (firstLow >= 0) { show.add(firstLow); show.add(Math.min(HOURS - 1, firstLow + 3)); }
  for (const h of [...show].sort((a, b) => a - b)) {
    const f = (l) => `T ${r1(v(l, h, 't2m'))} Td ${r1(v(l, h, 'td2m'))} rh ${Math.round(v(l, h, 'rh', 'p50'))} Tw ${r1(wetBulbC(v(l, h, 't2m'), v(l, h, 'rh', 'p50')))} pS ${r2(v(l, h, 'pSnow'))}`;
    const s1 = lv[1][h];
    console.log(`  +${String(h).padStart(3)} h ${new Date(t0 + h * H).toISOString().slice(5, 13)}Z sl ${r1(v(1, h, 'snowline'))} (sl@Zunge ${r1(v(0, h, 'snowline'))}, σ ${r1(v(1, h, 'snowline', 'sigma'))}) P ${r2(v(1, h, 'precip'))} | Zunge ${f(0)} | Mitte ${f(1)} | Oben ${f(2)} | Zelle ${Object.entries(s1?.cell ?? {}).filter(([k]) => /^snowlmt/.test(k)).map(([k, x]) => `${k}=${r1(x)}`).join(' ')}`);
  }
  // V-GM-1: members of the temperature at the tongue, first step
  const m = lv[0].find(Boolean)?.vars?.t2m?.members;
  if (m) console.log('  Mitglieder T an der Zunge (+0 h):', JSON.stringify(m).slice(0, 500));
}
console.log('\nGesamt:', JSON.stringify(all));
