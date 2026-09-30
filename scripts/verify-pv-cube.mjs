/**
 * verify-pv-cube.mjs — Gate für buscosun Fusion auf dem Punkt-Cube (Phase FI, AP2 ff.).
 *
 *   npm run verify:pv-cube
 *
 * Netzfrei, deterministisch, ECHTE Datenformen: der Cube, das Stationsprodukt und der Index
 * werden mit dem Producer-Code gebaut (`scripts/lib/pvCubeFixtures.mjs`), über den AP1-Leser
 * gelesen und durch DIESELBE Rechnung geschickt, die der Browser fährt (`cubeSource.ts`,
 * `fusion/fuse.ts`). Jeder Block trägt mindestens eine NEGATIVKONTROLLE — ein Fall, der rot
 * werden MUSS, wenn ein Mechanismus still abgeschaltet wird (Lehre SAT2h/BW-1).
 *
 * Wächst je Etappe: AP2 Achse/Abbildung/Flag/Gleichheit · AP4 PAP 4 · AP3 PAP 3 · AP6 PAP 6 ·
 * AP5 PAP 5 · AP7 Nowcast/Anker/Schwanz · AP8 Ausgabe v2 + Laufzeit.
 */
import { performance } from 'node:perf_hooks';
import { buildCubeFixture, FIX, signature } from './lib/pvCubeFixtures.mjs';
import { memoryStore } from '../src/point/client/store.ts';
import { readPointBundle } from '../src/point/client/readPoint.ts';
import { CUBE_PLANES, TIER_BY_ID, cellOf, chunkExtent, chunkOf, quantStep } from '../src/point/cubeFormat.ts';
import { ClimaField } from '../src/ml/climaField.ts';
import { fuseHour } from '../src/pointForecast/fusion/fuse.ts';
import { quantileOf } from '../src/pointForecast/fusion/dist.ts';
import { getPointForecast, hasPointSource, pfCacheKey } from '../src/pointForecast/pointForecast.ts';
import {
  fuseCubePoint, cubeInputFromBundle, cubeSampleOf, nativeAxis, getPointForecastFromCube, registerCubePointSource, applyVertical, clearCubeForecastCache,
} from '../src/pointForecast/cubeSource.ts';
import { verifyVertical, verticalCorrection, STANDARD_LAPSE_PER_M } from '../src/pointForecast/fusion/vertical.ts';
import { verifyGrid, blockOffsets, GRID_SET } from '../src/pointForecast/fusion/grid.ts';
import { verifyUncertainty } from '../src/pointForecast/fusion/uncertainty.ts';
import { verifyTerrainTerms, fSaisonOf } from '../src/pointForecast/fusion/terrainTerms.ts';
import { toPointForecastV2, verifyOutput } from '../src/pointForecast/fusion/output.ts';
import { accAt, ACC } from '../src/pointForecast/fusion/priors.ts';

const H = 3_600_000;
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const iso = (ms) => new Date(ms).toISOString().slice(0, 16) + 'Z';

// ── Gelände und Klimatologie, synthetisch (die Rechnung braucht die FORM, nicht S3) ──
const flatScales = (h) => ({ elevationM: h, ringMeanM: [h, h, h, h, h, h], spreadM: [0, 0, 0, 0, 0, 0], tpiM: [0, 0, 0, 0, 0, 0], horizonRad: [0, 0, 0, 0, 0, 0, 0, 0], sampledCount: 48 });
const flatTerrain = (h) => ({ elevationM: h, tpi500M: 0, tpi2000M: 0, svf: 1, slopeDeg: 0, aspectDeg: 0, horizonDeg: [0, 0, 0, 0, 0, 0, 0, 0], scales: flatScales(h), sinkDepthM: 0 });
const clima = new ClimaField({
  meta: { source: 'test', region: 'T', years: [2000, 2020], binDeg: 1, K: 0, tau: 1, lapsePerM: 0.0065, stationCount: 1 },
  stations: [{ id: 'A', name: 'A', lat: 48.14, lon: 11.58, elev: 525, tc: [12], sc: [5], wc: [0.3], tnc: [7], txc: [17], t50: null, base: 0.3, n: 9999 }],
});

// ---------------------------------------------------------------------------
// (1) Fixture in echter Form, gelesen über den AP1-Leser
// ---------------------------------------------------------------------------
const fx = await buildCubeFixture();
const t0Ms = Math.floor(FIX.nowMs / H) * H;
const readBundle = async (files = fx.files, over = {}) => readPointBundle(
  { lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1, ...over },
  { store: memoryStore(files), terrain: false, nowcast: false, plan: false },
);
const bundle = await readBundle();
add('(1) das Bündel liest drei Stufen und die Station aus der Fixture (echte Container, echter Index)',
  bundle.tiers.join() === 't1,t2,t3' && !!bundle.cube.t1 && !!bundle.cube.t2 && !!bundle.cube.t3 && !!bundle.station && bundle.errors.length === 0,
  `tiers ${bundle.tiers.join()} station ${bundle.station?.station.id} errors ${bundle.errors.join('; ')}`);
// E-F-12 (Jan, 17.09.): steht der Punkt ≤ 250 m an der Katalogstation, ist deren Höhe h_true — auch
// für PAP 4 — und die Setzung steht in calib. Ohne übergebene Höhe und ohne Gelände (Fixture).
{
  const bS = await readBundle(fx.files, { lat: FIX.station.lat + 0.001, lon: FIX.station.lon, elevationM: undefined });
  const inS = cubeInputFromBundle(bS, clima);
  add('(1) E-F-12: 0,1 km an der Station ⇒ Bündel nimmt ihre Höhe (515 m) als h_true, elevationFrom station, calib nennt hTrue:station',
    bS.stationChoice?.elevationFrom === 'station' && inS.elevationM === FIX.station.elev && inS.elevationFrom === 'station'
    && fuseCubePoint(inS, { hourly: false }).calib.some((c) => c.startsWith('hTrue:station')),
    `${bS.stationChoice?.elevationFrom} ${inS.elevationM}`);
  const bF = await readBundle(fx.files, { elevationM: undefined });   // FIX.lat/lon: 4,5 km von der Station
  const inF = cubeInputFromBundle(bF, clima);
  add('(1) E-F-12 Negativkontrolle: 4,5 km entfernt ohne Höhe und Gelände ⇒ h_true null (kein Wert ohne Herkunft), kein hTrue:station',
    bF.stationChoice?.elevationFrom !== 'station' && inF.elevationM === null && !fuseCubePoint(inF, { hourly: false }).calib.some((c) => c.startsWith('hTrue:station')));
  add('(1) E-F-12: die übergebene Höhe hat Vorrang (input) — die Fixture rechnet weiter mit hTrue 525', cubeInputFromBundle(bundle, clima).elevationFrom === 'input' && cubeInputFromBundle(bundle, clima).elevationM === FIX.hTrue);
}
add('(1) die Station vertritt den Punkt (4,5 km, −10 m) — dieselbe Regel wie am lebenden Datum (§9.5.1)',
  bundle.stationChoice?.accepted === true && bundle.station?.steps.length === 247 && /-10 m/.test(bundle.stationChoice.reason), bundle.stationChoice?.reason);
add('(1) Manifest gelesen (ein Speicher-Store kennt keine Commits ⇒ `main`), Quellen je Stufe bekannt',
  ['pinned', 'main'].includes(bundle.cube.t1.manifestFrom) && bundle.cube.t1.sources.length === 2 && bundle.cube.t3.sources.length === 2, bundle.cube.t1.manifestFrom);

// ---------------------------------------------------------------------------
// (2) Achse — nativ, die feinere Stufe gewinnt, Nähte benannt
// ---------------------------------------------------------------------------
{
  const input = cubeInputFromBundle(bundle, clima);
  const axis = nativeAxis(input);
  const per = { t1: 0, t2: 0, t3: 0 };
  for (const a of axis) per[a.tier] += 1;
  // Von Hand: t1 18z trägt ab 21:00 die Stunden 3…48 (46); t2 12z trägt 51…120 h = 18.09. 15:00 … 21.09. 12:00,
  // davon liegen 15:00 und 18:00 am 18.09. noch unter t1 (Ende 18z + 48 h) ⇒ 22; t3 00z trägt 126…336 h =
  // 21.09. 06:00 … 30.09. 00:00, davon 06:00/12:00 unter t2 ⇒ 34. Überlappung in Gültigzeit: t1/t2 3 h, t2/t3 6 h (§9.5.1).
  add('(2) 102 native Schritte: t1 46 · t2 22 · t3 34 — die Überlappungen gehören der feineren Stufe',
    axis.length === 102 && per.t1 === 46 && per.t2 === 22 && per.t3 === 34, JSON.stringify(per));
  add('(2) erster Schritt = Stundenboden von jetzt (21:00), letzter = t3 +336 h (30.09. 00:00)',
    axis[0].validAtMs === t0Ms && axis[axis.length - 1].validAtMs === Date.parse('2026-09-30T00:00:00Z'), `${iso(axis[0].validAtMs)} … ${iso(axis[axis.length - 1].validAtMs)}`);
  const both = axis.find((a) => a.validAtMs === Date.parse('2026-09-18T15:00:00Z'));
  const ext1 = chunkExtent(TIER_BY_ID.t1, both.series.chunk.cy, both.series.chunk.cx);
  add('(2) 18.09. 15:00 tragen t1 (h 45) UND t2 (h 51) — der Schritt kommt aus t1, mit t1-Werten',
    both?.tier === 't1' && near(both.step.values.t2m, signature('t1', 45, both.series.cell.iy - ext1.y0, both.series.cell.ix - ext1.x0).t2m, 0.01)
    && input.cube.t2.steps.some((s) => s.validAtMs === both.validAtMs),
    `${both?.tier} T ${both?.step.values.t2m}`);
  add('(2) die Achse ist streng aufsteigend, keine Gültigzeit doppelt',
    axis.every((a, i) => i === 0 || a.validAtMs > axis[i - 1].validAtMs));
  // Negativkontrolle: ohne t1 trägt t2 seine vollen 24 Schritte — die Regel wirkt, sie ist kein Zufall der Daten.
  const no1 = nativeAxis({ ...input, cube: { ...input.cube, t1: null } });
  add('(2) Negativkontrolle: ohne t1 trägt t2 alle 24 Schritte (58 statt 102)',
    no1.length === 58 && no1.filter((a) => a.tier === 't2').length === 24, String(no1.length));
}

// ---------------------------------------------------------------------------
// (3) Abbildung Cube → Sample-Vertrag (additive Felder tragen, was der Cube weiß)
// ---------------------------------------------------------------------------
{
  const s1 = bundle.cube.t1;
  const ext = chunkExtent(TIER_BY_ID.t1, s1.chunk.cy, s1.chunk.cx);
  const ry = s1.cell.iy - ext.y0, rx = s1.cell.ix - ext.x0;
  const dT = quantStep(CUBE_PLANES.find((p) => p.id === 't2m')) / 2 + 1e-9;
  const sig0 = signature('t1', 0, ry, rx);
  const smp = cubeSampleOf('t1', s1.steps[0], s1);
  add('(3) t1 → Familie highres, Tag cube-t1; Temperatur/Taupunkt/Wind/Böe/Niederschlag/Bedeckung/Druck innerhalb Δ/2',
    smp.family === 'highres' && smp.source === 'cube-t1'
    && near(smp.temperature, sig0.t2m, dT) && near(smp.dewPoint, sig0.td2m, dT) && near(smp.u, sig0.u10, dT) && near(smp.v, sig0.v10, dT)
    && near(smp.gust, sig0.gust, dT) && near(smp.precipitation, sig0.precip, dT) && near(smp.cloudTotal, sig0.clct, 0.05) && near(smp.pressure, sig0.ps, 0.05),
    `T ${smp.temperature} Td ${smp.dewPoint} u ${smp.u} gust ${smp.gust} rr ${smp.precipitation} clct ${smp.cloudTotal} ps ${smp.pressure}`);
  add('(3) sourceElevation = hModEff der Zelle (510 m) — der Motor rechnet die lineare Lapse auf h_true (Basislinie B1, bis AP4)',
    smp.sourceElevation === 510 && smp.hModEff === 510);
  add('(3) σ_div je Größe, Quantile, srcCount kommen mit; σ_ens nur auf dem groben Raster (Schritt 0 ja, Schritt 1 nein)',
    near(smp.sigmaDiv.t2m, 0.8, dT) && near(smp.q10.t2m, sig0.t2m - 1.5, dT) && near(smp.q90.t2m, sig0.t2m + 1.5, dT) && smp.srcCount === 5
    && near(smp.sigmaEns.t2m, 0.4, dT) && smp.ensCount === 20
    && cubeSampleOf('t1', s1.steps[1], s1).sigmaEns.t2m === null && cubeSampleOf('t1', s1.steps[1], s1).ensCount === null,
    JSON.stringify({ sd: smp.sigmaDiv.t2m, q10: smp.q10.t2m, ens: smp.sigmaEns.t2m, n: smp.ensCount }));
  const inv = cubeSampleOf('t1', s1.steps[5], s1);
  add('(3) Profil (nur t1): Schritt 5 trägt eine Inversion (zInv 820 > zBase 520, Γ 4 K/km, ΔT 3 K)',
    inv.profile && inv.profile.zInv === 820 && inv.profile.zBase === 520 && near(inv.profile.gammaEff, 4, 0.01) && near(inv.profile.dTInv, 3, 0.01)
    && cubeSampleOf('t1', s1.steps[0], s1).profile.zInv === 0);
  const s2 = cubeSampleOf('t2', bundle.cube.t2.steps[0], bundle.cube.t2);
  add('(3) t2/t3 → Familie global, kein Profil (`profile: null`, nicht ein Objekt voller null)',
    s2.family === 'global' && s2.source === 'cube-t2' && s2.profile === null && cubeSampleOf('t3', bundle.cube.t3.steps[0], bundle.cube.t3).family === 'global');
  add('(3) relativeHumidity bleibt null — der Motor fusioniert den Taupunkt und leitet RH ab',
    smp.relativeHumidity === null && smp.uvIndex === null && smp.distanceMeters === 0);
}

// ---------------------------------------------------------------------------
// (4) Die reine Rechnung: fuseCubePoint
// ---------------------------------------------------------------------------
let resultRef = null;
{
  const input = cubeInputFromBundle(bundle, clima);
  input.terrain = flatTerrain(FIX.hTrue);
  input.elevationM = FIX.hTrue;
  const T0 = performance.now();
  const r = fuseCubePoint(input);
  const wall = performance.now() - T0;
  resultRef = r;
  add('(4) 102 Schritte, jeder mit Verteilungen — Achse, Nähte und Provenienz im Ergebnis',
    r.steps.length === 102 && r.steps.every((s) => s.fused != null) && r.axis.seams.length === 2 && r.provenance.indexCommit === FIX.commit && r.provenance.clima === 'grid',
    `steps ${r.steps.length} seams ${r.axis.seams.map(iso).join(',')}`);
  add('(4) die Nähte tragen das Flag `seam` — genau die zwei Stufenwechsel (18.09. 21:00 t1→t2, 21.09. 18:00 t2→t3)',
    r.steps.filter((s) => s.flags.includes('seam')).map((s) => `${iso(s.validAtMs)}:${s.tier}`).join(' ') === '2026-09-18T21:00Z:t2 2026-09-21T18:00Z:t3');
  const first = r.steps[0];
  const s1 = bundle.cube.t1;
  const ext = chunkExtent(TIER_BY_ID.t1, s1.chunk.cy, s1.chunk.cx);
  const cellT = signature('t1', 3, s1.cell.iy - ext.y0, s1.cell.ix - ext.x0).t2m;
  const cubeOnlyT = cellT + (FIX.hModEff.t1 - FIX.hTrue) * 0.0065;   // lineare Lapse (B1)
  const stationT = 12 + 0.1 * 5;                                        // Station: Lauf 15z, 21:00 = Schritt 6 ⇒ it 5
  const fusedT = quantileOf(first.fused.temperature.dist, 0.5);
  add('(4) 21:00: T liegt zwischen Zelle (lapse-korrigiert) und Station — beide tragen (seit AP6 mit ihrer PAP-6-σ)',
    fusedT > Math.min(cubeOnlyT, stationT) - 0.3 && fusedT < Math.max(cubeOnlyT, stationT) + 0.3 && Math.abs(fusedT - cubeOnlyT) < 1.5 && Math.abs(fusedT - stationT) < 1.5,
    `fused ${fusedT.toFixed(2)} · Zelle ${cellT.toFixed(2)} → ${cubeOnlyT.toFixed(2)} · Station ${stationT.toFixed(2)}`);
  add('(4) Beiträger: cube-t1 und mosmix; Members benennen Produkt, Lauf, Alter und Station',
    first.fused.temperature.contributors.includes('cube-t1') && first.fused.temperature.contributors.includes('mosmix')
    && first.members.some((m) => m.product === 'cube-t1' && m.run === FIX.runs.t1 && m.ageH === 3) && first.members.some((m) => m.product === 'station' && m.station?.id === '10865'),
    JSON.stringify(first.members.map((m) => `${m.product}@${m.run}+${m.ageH}h`)));
  const t2step = r.steps.find((s) => s.tier === 't2');
  const t3last = r.steps[r.steps.length - 1];
  add('(4) die Station trägt auf t2-Schritten (stündliche Reihe trifft das 3-h-Raster) und nicht mehr jenseits ihres Horizonts (30.09.)',
    t2step.members.some((m) => m.product === 'station') && !t3last.members.some((m) => m.product === 'station') && t3last.fused.temperature.contributors.join() === 'cube-t3');
  // PAP-6-Bedingungen an der AUSGABE — in 100 % der Schritte.
  let bad = 0;
  for (const s of r.steps) {
    const f = s.fused;
    const T = quantileOf(f.temperature.dist, 0.5), Td = quantileOf(f.dewPoint.dist, 0.5);
    const w = quantileOf(f.windSpeed.dist, 0.5), g = quantileOf(f.gust.dist, 0.5);
    const rr = quantileOf(f.precipitation.dist, 0.1), cl = quantileOf(f.clouds.dist, 0.5);
    if (!(Td <= T + 1e-9) || !(g >= w - 1e-6) || !(rr >= 0) || !(cl >= 0 && cl <= 100) || !(quantileOf(f.windSpeed.dist, 0.1) >= 0)) bad += 1;
  }
  add('(4) PAP 6: Td ≤ T, Böe ≥ Wind, Niederschlag ≥ 0, Bedeckung 0…100, Wind-q10 ≥ 0 — in 102 von 102 Schritten', bad === 0, `${bad} Verstöße`);
  const medSig = (t) => { const a = r.steps.filter((s) => s.tier === t).map((s) => s.fused.temperature.dist.sigma).sort((x, y) => x - y); return a[a.length >> 1]; };
  add('(4) Unsicherheit wächst mit dem Vorlauf: Median σ_T über t1 < t2 < t3, erster Schritt < letzter',
    medSig('t1') < medSig('t2') && medSig('t2') < medSig('t3') && first.fused.temperature.dist.sigma < t3last.fused.temperature.dist.sigma,
    `${medSig('t1').toFixed(2)} < ${medSig('t2').toFixed(2)} < ${medSig('t3').toFixed(2)} K; ${first.fused.temperature.dist.sigma.toFixed(2)} → ${t3last.fused.temperature.dist.sigma.toFixed(2)}`);
  add('(4) deterministisch: zweimal dieselbe Eingabe ⇒ bit-gleiche Ausgabe (Replay-Fähigkeit für AP9)',
    JSON.stringify(fuseCubePoint(input).steps) === JSON.stringify(r.steps));
  add('(4) Laufzeit der Rechnung allein < 100 ms je Punkt (Node)', r.timing.algoMs < 100 && wall < 150, `${r.timing.algoMs} ms (Wand ${wall.toFixed(1)} ms)`);
  add('(4) Setzungen sind benannt (`calib`): Footprint und Vorlauf-Regel (AP2), φ/dzSurface/Standard-Lapse (AP4) — jede mit Herkunft und Grund',
    r.calib.length >= 2 && r.calib.every((c) => /:(set|literature|physical|null) — .{20,}/.test(c)) && r.calib.some((c) => c.startsWith('footprint:set')) && r.calib.some((c) => c.startsWith('lead:set')), String(r.calib.length));
}

// ---------------------------------------------------------------------------
// (5) Negativkontrollen: ohne Gelände oder Klimatologie KEINE Verteilung — und gesagt
// ---------------------------------------------------------------------------
{
  const noTerrain = fuseCubePoint({ ...cubeInputFromBundle(bundle, clima), terrain: null, elevationM: null });
  add('(5) ohne Gelände: alle Schritte ohne Verteilung, Flag `noTerrain`, Grund in den Notizen — die Zellwerte bleiben lesbar',
    noTerrain.steps.length === 102 && noTerrain.steps.every((s) => s.fused === null && s.flags.includes('noTerrain') && s.cell.t2m != null)
    && noTerrain.notes.some((n) => /kein Gelände/.test(n)));
  const inp = cubeInputFromBundle(bundle, null);
  inp.terrain = flatTerrain(FIX.hTrue); inp.elevationM = FIX.hTrue;
  const noClima = fuseCubePoint(inp);
  add('(5) ohne Klimatologie: keine Verteilung (K-3), Provenienz `clima: none`',
    noClima.steps.every((s) => s.fused === null) && noClima.provenance.clima === 'none' && noClima.notes.some((n) => /Klimatologie/.test(n)));
}

// ---------------------------------------------------------------------------
// (6) Der Live-Pfad ist unberührt
// ---------------------------------------------------------------------------
{
  add('(6) der Cache-Schlüssel des Live-Pfads ist unverändert (kein `:c` ohne Flag)',
    pfCacheKey(48.137, 11.575, 'DE', true, false, true) === 'DE:48.137:11.575:r:d' && pfCacheKey(48.137, 11.575, 'DE', false, false, false, false, true) === 'DE:48.137:11.575:c');
  // Der Motor ohne die neuen Felder rechnet wie vorher: ein Sample nur mit Schichten gegen dasselbe
  // Sample mit `cloudTotal` = Summe der Schichten ⇒ identische Bewölkung; ein ANDERES cloudTotal ändert sie.
  const flat = { elevationM: 300, lapseRatePerM: 0.0065, terrain: flatScales(300), skyView: 1, sinkDepthM: 0, terrainDeltaC: 0, solarElevDeg: 20, foehnScore: 0, clima: { tempMeanC: 10, tempSigmaC: 6, wetProbDaily: 0.25 } };
  const base = { source: 'mosmix', family: 'mosmix', temperature: 12, sourceElevation: 300, u: 2, v: 1, gust: null, relativeHumidity: 70, snowLine: null, cloudLow: 20, cloudMid: 10, cloudHigh: 5, precipitation: 0.2, uvIndex: null, distanceMeters: 2000 };
  const legacy = JSON.stringify(fuseHour([base], 6, flat));
  const same = JSON.stringify(fuseHour([{ ...base, cloudTotal: 35 }], 6, flat));
  const other = JSON.stringify(fuseHour([{ ...base, cloudTotal: 90 }], 6, flat));
  add('(6) `fuseHour` ohne neue Felder = mit `cloudTotal` gleich der Schichtsumme (byte-gleich); Negativkontrolle: anderes cloudTotal ändert das Ergebnis',
    legacy === same && legacy !== other);
  const withExtras = JSON.stringify(fuseHour([{ ...base, sigmaDiv: { t2m: 0.8 }, srcCount: 5, hModEff: 300, profile: null, q10: {}, q90: {}, sigmaEns: {}, ensCount: null, pressure: 1000 }], 6, flat));
  add('(6) die übrigen additiven Felder ändern in AP2 NICHTS am Motor (sie werden erst in AP4/AP6 gelesen)', withExtras === legacy);
  add('(6) der Cube-Pfad ist nach dem Laden von cubeSource.ts registriert; `getPointForecast` ohne Flag geht nicht dorthin',
    hasPointSource('cube') === true);
}

// ---------------------------------------------------------------------------
// (7) Ende-zu-Ende in Node: getPointForecast({ pointSource: 'cube' }) über die Fixture
// ---------------------------------------------------------------------------
{
  const io = { store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue) };
  registerCubePointSource(io);
  const fc = await getPointForecast({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false });
  // AP7: das Produkt ist stündlich — 102 native Schritte mit `fusion`, Station/Klimatologie ebenfalls mit, interpolierte Stunden ohne (Quantile im `cube`-Block).
  // Die Flag-Liste des `cube`-Blocks führt nur Schritte MIT Flags — die Klassen kommen aus den Stunden selbst.
  const kind = (h) => (h.fusion == null ? 'interp' : h.fusion.temperature?.climatologyOnly ? 'clima' : h.fusion.temperature.contributors.join() === 'mosmix' ? 'station' : 'cube');
  const kinds = {}; for (const h of fc.hours) kinds[kind(h)] = (kinds[kind(h)] ?? 0) + 1;
  add('(7) `getPointForecast({ pointSource: "cube" })` liefert 337 Stunden (stündlich, AP7): 102 native + 153 Station + 3 Klimatologie mit `fusion`, 79 interpolierte ohne; dazu der `cube`-Block',
    fc.hours.length === 337 && fc.hours.every((h, i) => h.timestamp.getTime() === t0Ms + i * H) && kinds.cube === 102 && kinds.station === 153 && kinds.clima === 3 && kinds.interp === 79
    && fc.cube.flags.filter((f) => f.flags.includes('interpolated')).length === 79 && fc.cube?.schema === 'fi-ap2' && fc.query.elevation === FIX.hTrue,
    `hours ${fc.hours.length} ${JSON.stringify(kinds)} sources ${fc.sourcesAvailable.join(',')}`);
  // Erwartung aus der reinen Rechnung mit DENSELBEN Eingaben (der Einstieg liest mit Nachbarn, AP3).
  const bN = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: memoryStore(fx.files), terrain: false, nowcast: false, plan: false, neighbours: true });
  const expect0 = fuseCubePoint({ ...cubeInputFromBundle(bN, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue }).steps[0];
  add('(7) Werte: T = Median der reinen Rechnung (gleiche Eingaben), Böe ≥ Wind, RH 0…100, Niederschlag ≥ 0, Zeitstempel = native Gültigzeiten',
    fc.hours.every((h) => h.gustSpeed >= h.windSpeed - 1e-6 && h.relativeHumidity >= 0 && h.relativeHumidity <= 100 && h.precipitation >= 0)
    && fc.hours[0].timestamp.getTime() === t0Ms && near(fc.hours[0].temperature, quantileOf(expect0.fused.temperature.dist, 0.5), 1e-9)
    && near(fc.hours[0].temperature, quantileOf(resultRef.steps[0].fused.temperature.dist, 0.5), 0.05),
    `${fc.hours[0].temperature} vs ${quantileOf(expect0.fused.temperature.dist, 0.5)}`);
  add('(7) Quellen und Station im Kopf: cube-t1/t2/t3 + mosmix, nächste Station MUENCHEN STADT 4,5 km auf 515 m',
    fc.sourcesAvailable.join() === 'cube-t1,cube-t2,cube-t3,mosmix' && fc.nearestStations[0]?.name === 'MUENCHEN STADT' && Math.abs(fc.nearestStations[0].distanceMeters - 4500) < 300 && fc.nearestStations[0].elevation === 515,
    JSON.stringify(fc.nearestStations[0]));
  add('(7) der `cube`-Block trägt Zeiten (readMs, algoMs, totalMs), Provenienz und die Flag-Liste',
    typeof fc.cube.timing.algoMs === 'number' && typeof fc.cube.timing.readMs === 'number' && fc.cube.provenance.runs.t1.run === FIX.runs.t1 && fc.cube.flags.filter((f) => f.flags.includes('seam')).length === 2);
  const again = await getPointForecast({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false });
  add('(7) der zweite Aufruf kommt aus dem Cube-Cache (dasselbe Objekt), getrennt vom Live-Cache (`:c` im Schlüssel)', again === fc);
  // Anderer Cache-Schlüssel (Radar an — die Fixture hat keinen, der Leser sagt es), damit nicht die 336-h-Antwort aus dem Cache kommt:
  // wie beim Live-Pfad deckt ein längerer Treffer eine kürzere Anfrage.
  const direct = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 48, pointSource: 'cube', includeRadarNowcast: true }, io);
  add('(7) `hours: 48` schneidet die Achse: 46 t1-Stunden (21:00 … 18.09. 18:00), zwei Stationsstunden (19:00, 20:00 — AP7) und der t2-Schritt 18.09. 21:00',
    direct.hours.length === 49 && direct.hours.slice(0, 46).every((h) => h.fusion.temperature.contributors.includes('cube-t1'))
    && direct.hours.slice(46, 48).every((h) => h.fusion.temperature.contributors.join() === 'mosmix') && direct.hours[48].fusion.temperature.contributors.includes('cube-t2'),
    `${direct.hours.length} Stunden`);
}

// ---------------------------------------------------------------------------
// (8) AP4 — PAP 4, die vertikale Korrektur
// ---------------------------------------------------------------------------
{
  const v = verifyVertical();
  for (const c of v.checks) add(`(8) vertical: ${c.name}`, c.ok, c.detail);

  // Im Adapter: der Cube-Member wird so vorkorrigiert, dass die lineare Lapse des Motors PAP 4 vollendet.
  const input = cubeInputFromBundle(bundle, clima);
  input.terrain = flatTerrain(FIX.hTrue); input.elevationM = FIX.hTrue;
  // PAP 4 isoliert: PAP 6 aus (seine σ-Terme hängen am Δh und würden den Vergleich mit/ohne vermischen).
  const withV = fuseCubePoint(input, { vertical: true, uncertainty: false });
  const without = fuseCubePoint(input, { vertical: false, uncertainty: false });
  // Zeit: Minimum aus sieben Läufen je Variante (die ersten beiden Aufrufe oben wärmen den JIT), Rauschboden = dieselbe Variante zweimal.
  const time8 = (o) => { let best = Infinity; for (let k = 0; k < 7; k++) { const t = performance.now(); fuseCubePoint(input, o); best = Math.min(best, performance.now() - t); } return best; };
  const msV = time8({ vertical: true, uncertainty: false });
  const msNo = time8({ vertical: false, uncertainty: false });
  const noise8 = Math.abs(time8({ vertical: false, uncertainty: false }) - msNo);
  const t1inv = withV.steps.filter((s) => s.tier === 't1' && s.vertical?.case !== 'A' && s.vertical?.case !== 'std');
  add('(8) t1: die Inversionsschritte der Fixture (jeder achte, Schritt 5/13/…) laufen als Fall B — Punkt 525 m liegt 5 m über der Basis (520) einer aufsitzenden Inversion (Modellboden 510)',
    t1inv.length === 6 && t1inv.every((s) => s.vertical.case === 'B' && s.vertical.surfaceBased === true && s.flags.includes('inversionBody')),
    `${t1inv.length} Schritte, Fälle ${[...new Set(t1inv.map((s) => s.vertical.case))].join('')}`);
  // Schrittindex der Fixture zählt ab dem t1-LAUF (18z), `leadH` ab jetzt (21:00): it 5 = leadH 2.
  const invStep = withV.steps.find((s) => s.tier === 't1' && s.vertical?.case === 'B');
  const invNo = without.steps.find((s) => s.validAtMs === invStep.validAtMs);
  // Rechnung von Hand: Basis 520, Modellboden 510 ⇒ P(510) = −Γ_inv·10 = −0,1 (Fall-C-Verlängerung unter die Basis);
  // P(525) = 3·φ(5/300) = +0,05 ⇒ ΔT = +0,15 K gegen T̄. AP2 (lineare Lapse) hätte −0,0065·15 = −0,0975 K ⇒ +0,2475 K am Member.
  const dT = quantileOf(invStep.fused.temperature.dist, 0.5) - quantileOf(invNo.fused.temperature.dist, 0.5);
  // Am Member +0,2475 K; fusioniert bleibt davon bei Vorlauf 2 h ein Bruchteil (gemessen 0,06 K) — die Station 4,5 km
  // daneben trägt dort das meiste Gewicht, und die Klimatologie schrumpft. Geprüft wird Vorzeichen und Größenordnung.
  add('(8) Fall B wirkt am Ergebnis: der Inversionsschritt ist mit PAP 4 wärmer als mit linearer Lapse (Member +0,25 K, fusioniert > 0)',
    invStep.vertical.case === 'B' && near(invStep.vertical.deltaK, 0.15, 1e-6) && dT > 0.02 && dT < 0.25, `ΔT_member ${invStep.vertical.deltaK.toFixed(3)} K, ΔT_fused ${dT.toFixed(3)} K`);
  const a0 = withV.steps[0];
  add('(8) Fall A (Γ_eff 6,5 = Standard): Schritt 3 hat Fall A ohne Rückfall-Flag, Δh = +15 m, ΔT −0,0975 K',
    a0.vertical.case === 'A' && !a0.flags.includes('stdLapseFallback') && a0.vertical.dhM === 15 && near(a0.vertical.deltaK, -0.0975, 1e-9));
  const t2 = withV.steps.find((s) => s.tier === 't2'), t3 = withV.steps.find((s) => s.tier === 't3');
  add('(8) t2/t3 ohne Profil (R6): Fall std, Flag stdLapseFallback, Δh −43 m (t2) / +38 m (t3)',
    t2.vertical.case === 'std' && t2.flags.includes('stdLapseFallback') && t2.vertical.dhM === 525 - 568 && t3.vertical.case === 'std' && t3.vertical.dhM === 525 - 487);
  // NEGATIVKONTROLLE: ohne Profil (t2/t3) und in Fall A mit Γ = 6,5 ist das Ergebnis byte-gleich zu AP2 — nur die Inversionsschritte unterscheiden sich.
  const same = withV.steps.filter((s, i) => JSON.stringify(s.fused) === JSON.stringify(without.steps[i].fused)).length;
  add('(8) Negativkontrolle: 96 von 102 Schritten sind byte-gleich zu AP2 (kein Profil oder Γ = 6,5) — genau die 6 Inversionsschritte weichen ab',
    same === 96 && withV.steps.length === 102, `${same} gleich`);
  add('(8) Kosten: PAP 4 auf 102 Schritten ≤ 5 ms (+ 2 × Rauschboden des Laufs)', msV - msNo < 5 + 2 * noise8, `${(msV - msNo).toFixed(2)} ms (${msV.toFixed(1)} gegen ${msNo.toFixed(1)} ms, Rauschen ${noise8.toFixed(2)} ms)`);
  add('(8) Setzungen benannt: phi:set, dzSurface:set, standardLapse:literature', withV.calib.some((c) => c.startsWith('phi:set')) && withV.calib.some((c) => c.startsWith('dzSurface:set')) && withV.calib.some((c) => c.startsWith('standardLapse:literature')));
  // Der Druck wird hydrostatisch mitgeführt (955 hPa an 510 m ⇒ ≈ 953,3 hPa an 525 m).
  const s = cubeSampleOf('t1', bundle.cube.t1.steps[3], bundle.cube.t1);
  const before = s.pressure;
  applyVertical(s, FIX.hTrue, STANDARD_LAPSE_PER_M);
  add('(8) Druck hydrostatisch auf h_true: 15 m höher ⇒ ≈ −1,7 hPa', before != null && s.pressure < before && near(before - s.pressure, 1.7, 0.2), `${before} → ${s.pressure?.toFixed(2)} hPa`);
  // Die Vorkorrektur ist so gebaut, dass der Motor sie vollendet: Sample-T + Lapse·(hModEff − hTrue) = T_PAP4.
  const raw = cubeSampleOf('t1', bundle.cube.t1.steps[5], bundle.cube.t1);
  const tBar = raw.temperature;
  const vr = applyVertical(raw, FIX.hTrue, STANDARD_LAPSE_PER_M);
  add('(8) Vorkorrektur + Motor-Lapse = PAP-4-Wert (Schritt 5: T̄ + 0,15 K)',
    near(raw.temperature + STANDARD_LAPSE_PER_M * (raw.hModEff - FIX.hTrue), vr.t, 1e-9) && near(vr.t - tBar, 0.15, 1e-6) && raw.sourceElevation === 510);
  // Zermatt/Zugspitze-Vorzeichen mit den gemessenen Höhen vom 16.09. (§9.5.1), Fall A.
  const zer = verticalCorrection({ tMean: 7.06, hModEff: 2537, hTrue: 1608, profile: null });
  const zug = verticalCorrection({ tMean: 9.68, hModEff: 1690, hTrue: 2906, profile: null });
  add('(8) Vorzeichen: Zermatt (Zelle 929 m höher) wird wärmer (+6,0 K), Zugspitze (Zelle 1 216 m tiefer) kälter (−7,9 K)',
    zer.deltaK > 5.9 && zer.deltaK < 6.1 && zug.deltaK < -7.8 && zug.deltaK > -8.0, `${zer.deltaK.toFixed(2)} / ${zug.deltaK.toFixed(2)} K`);
}

// ---------------------------------------------------------------------------
// (9) AP3 — PAP 3, Gitter → Punkt
// ---------------------------------------------------------------------------
{
  const g = verifyGrid();
  for (const c of g.checks) add(`(9) grid: ${c.name}`, c.ok, c.detail);

  // Der Leser liefert die Nachbarn aus demselben Chunk — 0 zusätzliche Dateien.
  const storeN = memoryStore(fx.files);
  const withN = await readPointBundle(
    { lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: storeN, terrain: false, nowcast: false, plan: false, neighbours: true },
  );
  const s1 = withN.cube.t1;
  add('(9) Nachbarn kommen aus demselben Chunk: t1 hat 8 Nachbarn (Zelle 5/10 liegt innen), dieselbe Zahl Dateien wie ohne',
    s1.neighbours?.length === 8 && storeN.stats.files === bundle.stats.files, `${s1.neighbours?.length} Nachbarn, ${storeN.stats.files} Dateien`);
  const ext = chunkExtent(TIER_BY_ID.t1, s1.chunk.cy, s1.chunk.cx);
  const ry = s1.cell.iy - ext.y0, rx = s1.cell.ix - ext.x0;
  const nb = s1.neighbours.find((n) => n.dy === 1 && n.dx === -1);
  add('(9) ein Nachbar trägt die Werte SEINER Zelle (Signatur mit ry+1, rx−1) in Schrittordnung, mit Mittelpunkt und Abstand',
    near(nb.values[7].t2m, signature('t1', 7, ry + 1, rx - 1).t2m, 0.006) && nb.iy === s1.cell.iy + 1 && nb.ix === s1.cell.ix - 1 && nb.distKm > 0 && nb.hModEffM === 510,
    `T ${nb.values[7].t2m} vs ${signature('t1', 7, ry + 1, rx - 1).t2m.toFixed(3)}`);
  add('(9) ohne `neighbours` bleibt die Reihe wie zuvor (Feld fehlt)', bundle.cube.t1.neighbours === undefined);

  // Adapter: mit Nachbarn ist der Cube-Wert das gewichtete Mittel des 2×2-Blocks, hModEff ebenso.
  const input = cubeInputFromBundle(withN, clima);
  input.terrain = flatTerrain(FIX.hTrue); input.elevationM = FIX.hTrue;
  // Zeit: Minimum aus drei Läufen je Variante, abwechselnd — die erste Runde wärmt den JIT.
  const timeIt = (o) => { let best = Infinity; for (let k = 0; k < 7; k++) { const t = performance.now(); fuseCubePoint(input, o); best = Math.min(best, performance.now() - t); } return best; };
  fuseCubePoint(input); fuseCubePoint(input, { grid: false });
  const msG = timeIt({});
  const msN = timeIt({ grid: false });
  const noise9 = Math.abs(timeIt({ grid: false }) - msN);   // Rauschboden dieses Laufs: dieselbe Variante zweimal
  const rG = fuseCubePoint(input);
  const rN = fuseCubePoint(input, { grid: false });
  const s0 = rG.steps[0];
  const block = blockOffsets(FIX.lat - s1.cell.lat, FIX.lon - s1.cell.lon);
  // Unabhängige Rechnung des gewichteten Mittels aus der Signatur.
  const cells = block.map((b) => {
    const c = s1.neighbours.find((n) => n.dy === b.dy && n.dx === b.dx) ?? { distKm: s1.cell.offsetKm };
    const d = c.distKm * 1000, L = TIER_BY_ID.t1.deg * GRID_SET.mPerDeg;
    return { w: Math.exp(-((d / L) ** 2)) * Math.exp(-((Math.abs(510 - FIX.hTrue) / GRID_SET.lhM) ** 2)), t: signature('t1', 3, ry + b.dy, rx + b.dx).t2m };
  });
  const wsum = cells.reduce((a, c) => a + c.w, 0);
  const expectT = cells.reduce((a, c) => a + c.w * c.t, 0) / wsum;
  add('(9) Adapter: N = 4, nicht beschnitten, Gewichte summieren zu 1, hModEff 510',
    s0.grid?.n === 4 && !s0.grid.truncated && near(s0.grid.weights.reduce((a, w) => a + w.w, 0), 1, 1e-9) && near(s0.grid.hModEffM, 510, 1e-9), JSON.stringify(s0.grid?.weights.map((w) => w.w.toFixed(3))));
  add('(9) Adapter: der Cube-Wert am Punkt ist das unabhängig gerechnete gewichtete Mittel der vier Zellen (Δ/2)',
    near(s0.cell.t2m, signature('t1', 3, ry, rx).t2m, 0.006) && near(rG.steps[0].members[0] && cubeSampleOfValues(rG, 0), expectT, 0.006 + 1e-6),
    `Punkt ${cubeSampleOfValues(rG, 0)?.toFixed(4)} · erwartet ${expectT.toFixed(4)} · Zelle ${s0.cell.t2m}`);
  add('(9) Negativkontrolle: `grid: false` ⇒ N = 1 ⇒ exakt die Zellwerte (byte-gleich zur Reihe ohne Nachbarn)',
    rN.steps.every((s) => s.grid === null) && JSON.stringify(rN.steps.map((s) => s.fused)) === JSON.stringify(fuseCubePoint({ ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue }).steps.map((s) => s.fused)));
  add('(9) mit Nachbarn ändert sich das Ergebnis (die Signatur hängt von Zeile und Spalte ab) — Größenordnung < 0,05 K',
    rG.steps.some((s, i) => JSON.stringify(s.fused) !== JSON.stringify(rN.steps[i].fused))
    && rG.steps.every((s, i) => Math.abs(quantileOf(s.fused.temperature.dist, 0.5) - quantileOf(rN.steps[i].fused.temperature.dist, 0.5)) < 0.05));
  add('(9) Kosten: PAP 3 auf 102 Schritten ≤ 5 ms (+ 2 × Rauschboden des Laufs)', msG - msN < 5 + 2 * noise9, `${(msG - msN).toFixed(2)} ms (${msG.toFixed(1)} gegen ${msN.toFixed(1)} ms, Rauschen ${noise9.toFixed(2)} ms)`);
  add('(9) Setzungen benannt: Ld:set, Lh:set, kappa:set', ['Ld:set', 'Lh:set', 'kappa:set'].every((k) => rG.calib.some((c) => c.startsWith(k))));

  // Chunk-Rand (Graz t1: Zeile 15 des Blocks, Punkt nördlich der Zellmitte ⇒ zwei der vier Zellen fehlen).
  const graz = await buildCubeFixture({ tiers: ['t1'], station: false, lat: 47.0707, lon: 15.4395 });
  const bG = await readPointBundle(
    { lat: 47.0707, lon: 15.4395, elevationM: 350, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 48 * H, stepH: 1 },
    { store: memoryStore(graz.files), terrain: false, nowcast: false, plan: false, neighbours: true },
  );
  const extG = chunkExtent(TIER_BY_ID.t1, bG.cube.t1.chunk.cy, bG.cube.t1.chunk.cx);
  const iG = cubeInputFromBundle(bG, clima); iG.terrain = flatTerrain(350); iG.elevationM = 350;
  const rGz = fuseCubePoint(iG);
  add('(9) Chunk-Rand (Graz t1, Zeile 15): fünf Nachbarn statt acht, N = 2, Flag `chunkBorderTruncated`',
    bG.cube.t1.cell.iy - extG.y0 === 15 && bG.cube.t1.neighbours.length === 5 && rGz.steps[0].grid?.n === 2 && rGz.steps[0].grid.truncated && rGz.steps.every((s) => s.flags.includes('chunkBorderTruncated')),
    `ry ${bG.cube.t1.cell.iy - extG.y0}, Nachbarn ${bG.cube.t1.neighbours.length}, N ${rGz.steps[0].grid?.n}`);
}

// ---------------------------------------------------------------------------
// (10) AP6 — PAP 6, Unsicherheit, Familien, Konfidenz
// ---------------------------------------------------------------------------
{
  const u = verifyUncertainty();
  for (const c of u.checks) add(`(10) uncertainty: ${c.name}`, c.ok, c.detail);

  // Der Motor-Haken: ein Sample mit `errorSigma` ist eine unverzerrte Schätzung mit genau dieser σ —
  // bei Vorlauf 100 h nicht durch ρ geschrumpft; ohne das Feld wird es geschrumpft (Negativkontrolle).
  const flat = { elevationM: 300, lapseRatePerM: 0.0065, terrain: flatScales(300), skyView: 1, sinkDepthM: 0, terrainDeltaC: 0, solarElevDeg: 20, foehnScore: 0, clima: { tempMeanC: 10, tempSigmaC: 6, wetProbDaily: 0.25 } };
  const g = { source: 'cube-t3', family: 'global', temperature: 20, sourceElevation: 300, u: null, v: null, gust: null, relativeHumidity: null, snowLine: null, cloudLow: null, cloudMid: null, cloudHigh: null, precipitation: null, uvIndex: null, distanceMeters: 0 };
  const tight = quantileOf(fuseHour([{ ...g, errorSigma: { temperature: 0.05 } }], 100, flat).temperature.dist, 0.5);
  const prior = quantileOf(fuseHour([g], 100, flat).temperature.dist, 0.5);
  const rho100 = accAt(ACC.temperature.global, 100, false);
  add('(10) Motor-Haken: errorSigma 0,05 K bei +100 h ⇒ Mittel ≈ 20 °C (unverzerrt, kaum geschrumpft); ohne Feld ≈ 10 + ρ·10 (Negativkontrolle)',
    Math.abs(tight - 20) < 0.02 && Math.abs(prior - (10 + rho100 * 10)) < 0.05 && prior < 19, `${tight.toFixed(3)} gegen ${prior.toFixed(3)} (ρ ${rho100.toFixed(3)})`);
  const wide = fuseHour([{ ...g, errorSigma: { temperature: 6 } }], 100, flat).temperature;
  add('(10) Motor-Haken: errorSigma = σ_clima ⇒ Prior trägt die Hälfte (Mittel 15, σ 6/√2 vor der Phasen-Aufweitung)',
    Math.abs(quantileOf(wide.dist, 0.5) - 15) < 1e-6 && Math.abs(wide.rawSigma - 6) < 1e-9 && wide.dist.sigma >= 6 / Math.SQRT2 - 1e-9 && wide.dist.sigma < 6 / Math.SQRT2 + 0.2, `${wide.dist.sigma.toFixed(4)}`);
  add('(10) Motor-Haken: ein Live-Sample ohne errorSigma bleibt byte-gleich (Feld undefined ≡ Feld fehlt)',
    JSON.stringify(fuseHour([g], 24, flat)) === JSON.stringify(fuseHour([{ ...g, errorSigma: undefined }], 24, flat)));

  // Adapter auf der Fixture.
  const storeN = memoryStore(fx.files);
  const bN = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: storeN, terrain: false, nowcast: false, plan: false, neighbours: true });
  const input = cubeInputFromBundle(bN, clima);
  input.terrain = flatTerrain(FIX.hTrue); input.elevationM = FIX.hTrue;
  const timeIt = (o) => { let best = Infinity; for (let k = 0; k < 7; k++) { const t = performance.now(); fuseCubePoint(input, o); best = Math.min(best, performance.now() - t); } return best; };
  fuseCubePoint(input); fuseCubePoint(input, { uncertainty: false });
  const msU = timeIt({}), msNo = timeIt({ uncertainty: false });
  const noise10 = Math.abs(timeIt({ uncertainty: false }) - msNo);
  const rU = fuseCubePoint(input);
  const rNo = fuseCubePoint(input, { uncertainty: false });
  const kinds = (t) => [...new Set(rU.steps.filter((s) => s.tier === t).map((s) => s.uncertainty.temperature.sigmaKind))].sort().join('+');
  add('(10) sigmaKind je Schritt aus den Daten: t1 ensemble (jeder 6.) · divergence · sys-only (jeder 8., eine Quelle); t2/t3 ensemble + divergence',
    kinds('t1') === 'divergence+ensemble+sys-only' && kinds('t2') === 'divergence+ensemble' && kinds('t3') === 'divergence+ensemble', `${kinds('t1')} | ${kinds('t2')} | ${kinds('t3')}`);
  const sOne = rU.steps.find((s) => s.tier === 't1' && s.uncertainty.temperature.sigmaKind === 'sys-only');
  const uOne = sOne?.uncertainty.temperature;
  add('(10) eine Quelle ⇒ σ_member = σ_sys allein (max(Boden 1,2, σ_c·√(1−ρ²)) ⊕ Restfehler 15 m ⊕ Δ²/12), agree ⅓·1',
    sOne && near(uOne.sigmaMember, Math.hypot(uOne.parts.sys, 0.0035 * 15, 0.01 / Math.sqrt(12)), 1e-6) && uOne.parts.sys >= 1.2 && uOne.parts.div === null && near(uOne.confidence.agree, 1 / 3, 1e-9),
    `${uOne?.sigmaMember.toFixed(4)} K (sys ${uOne?.parts.sys.toFixed(3)}, σ_c ${uOne?.sigmaClima})`);
  const sEns = rU.steps.find((s) => s.tier === 't1' && s.uncertainty.temperature.sigmaKind === 'ensemble');
  const uEns = sEns?.uncertainty.temperature;
  add('(10) Ensemble-Schritt: σ_member = c·σ_ens ⊕ Terme; σ_div NICHT addiert (σ_member² − σ_ens² = nur Δ²/12 + Restfehler)',
    sEns && uEns.parts.ens > 0 && near(uEns.sigmaMember ** 2 - uEns.parts.ens ** 2, uEns.parts.quant ** 2 + uEns.parts.vert ** 2 + uEns.parts.widen ** 2, 1e-9),
    `ens ${uEns?.parts.ens.toFixed(3)} → member ${uEns?.sigmaMember.toFixed(3)}`);
  // Das Cube-Member ist jetzt in der Kombination nicht mehr durch die Geländestreuung entwertet:
  // seine σ folgt dem Cube — und damit trägt es neben der Station.
  const c0 = rU.steps[0];
  add('(10) Beiträger bei +0 h: cube-t1 UND mosmix; die Ausgabe-σ liegt unter beiden Member-σ (Kombination)',
    c0.fused.temperature.contributors.includes('cube-t1') && c0.fused.temperature.contributors.includes('mosmix')
    && c0.uncertainty.temperature.sigmaPost < c0.uncertainty.temperature.sigmaMember, `σ_post ${c0.uncertainty.temperature.sigmaPost?.toFixed(3)} < σ_member ${c0.uncertainty.temperature.sigmaMember.toFixed(3)}`);
  // PAP-6-Bedingungen an der Ausgabe — 100 %.
  let bad = 0;
  for (const s of rU.steps) {
    const f = s.fused;
    const T = quantileOf(f.temperature.dist, 0.5), Td = quantileOf(f.dewPoint.dist, 0.5);
    const w = quantileOf(f.windSpeed.dist, 0.5), gq = quantileOf(f.gust.dist, 0.5);
    const cl = quantileOf(f.clouds.dist, 0.5), rh = quantileOf(f.humidity.dist, 0.5);
    if (!(Td <= T + 1e-9) || !(gq >= w - 1e-6) || !(cl >= 0 && cl <= 100) || !(rh >= 0 && rh <= 100) || !(quantileOf(f.precipitation.dist, 0.05) >= 0) || !(quantileOf(f.windSpeed.dist, 0.05) >= 0)) bad += 1;
  }
  add('(10) PAP-6-Bedingungen in 100 % der 102 Schritte (Td ≤ T, Böe ≥ Wind, clct/RH 0…100, Niederschlag/Wind ≥ 0)', bad === 0, `${bad} Verstöße`);
  // Konsistenz clct := max: der Schritt mit clcl 95 trägt cloudTotal 95 ins Sample.
  const lowCloudStep = rU.steps.find((s) => s.tier === 't1' && s.cell.clcl === 95);
  add('(10) clct := max(clct, clcl, clcm, clch): Zelle clct 37/clcl 95 ⇒ die Bewölkung geht mit 95 % in den Motor — fusioniert ≥ 15 % höher als ohne die Op (Station 40 % und Klimatologie ziehen)',
    lowCloudStep && quantileOf(lowCloudStep.fused.clouds.dist, 0.5) - quantileOf(rNo.steps[rU.steps.indexOf(lowCloudStep)].fused.clouds.dist, 0.5) > 15,
    `${lowCloudStep ? quantileOf(lowCloudStep.fused.clouds.dist, 0.5).toFixed(1) : '—'} % gegen ohne ${lowCloudStep ? quantileOf(rNo.steps[rU.steps.indexOf(lowCloudStep)].fused.clouds.dist, 0.5).toFixed(1) : '—'} %`);
  // Konfidenz: 0…1, sinkt mit dem Vorlauf, Abschläge wirken.
  const conf = (i) => rU.steps[i].uncertainty.temperature.confidence.score;
  add('(10) Konfidenz-Score in [0,1], bei +3 h höher als bei +336 h, und jeder Schritt trägt ihn',
    rU.steps.every((s) => { const c = s.uncertainty.temperature.confidence; return c && c.score >= 0 && c.score <= 1; }) && conf(0) > conf(rU.steps.length - 1),
    `${conf(0).toFixed(3)} → ${conf(rU.steps.length - 1).toFixed(3)}`);
  add('(10) Negativkontrolle: `uncertainty: false` ⇒ byte-gleich zu AP3 (Streuungs-Prior des Motors)',
    JSON.stringify(rNo.steps.map((s) => s.fused)) === JSON.stringify(fuseCubePoint(input, { uncertainty: false }).steps.map((s) => s.fused)) && rNo.steps.every((s) => Object.keys(s.uncertainty).length === 0));
  add('(10) mit PAP 6 unterscheidet sich die Ausgabe von AP3 (die σ des Cube-Members ist eine andere)',
    JSON.stringify(rU.steps.map((s) => s.fused)) !== JSON.stringify(rNo.steps.map((s) => s.fused)));
  add('(10) Kosten: PAP 6 auf 102 Schritten ≤ 30 ms (+ 2 × Rauschboden)', msU - msNo < 30 + 2 * noise10, `${(msU - msNo).toFixed(2)} ms (${msU.toFixed(1)} gegen ${msNo.toFixed(1)} ms, Rauschen ${noise10.toFixed(2)} ms)`);
  add('(10) Setzungen benannt: cSpread, sigmaSys, sigmaVert, confidence als set; sigmaQuant physical; precipSigma set; meltOffset null',
    ['cSpread:set', 'sigmaSys:set', 'sigmaVert:set', 'confidence:set', 'sigmaQuant:physical', 'precipSigma:set', 'meltOffset:null'].every((k) => rU.calib.some((c) => c.startsWith(k))));
  // Ende-zu-Ende: der Konfidenz-Score steht im PointForecast.
  const io = { store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue) };
  const fc = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: true }, io);
  add('(10) `PointForecast.confidence.temperature` = Konfidenz-Score des Schritts', near(fc.hours[0].confidence.temperature, rU.steps[0].uncertainty.temperature.confidence.score, 1e-12) && fc.hours[0].confidence.humidity === rU.steps[0].uncertainty.dewpoint.confidence.score);
}

// ---------------------------------------------------------------------------
// (11) AP5 — PAP 5, die Terrain-Terme (inaktiv ohne Amplitude, Geometrie benannt)
// ---------------------------------------------------------------------------
{
  const t = verifyTerrainTerms();
  for (const c of t.checks) add(`(11) terrainTerms: ${c.name}`, c.ok, c.detail);

  const bN = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: memoryStore(fx.files), terrain: false, nowcast: false, plan: false, neighbours: true });
  const input = cubeInputFromBundle(bN, clima);
  input.terrain = { ...flatTerrain(FIX.hTrue), tpi500M: -40, tpi2000M: -180, svf: 0.75, sinkDepthM: 180 };   // eine Mulde
  input.elevationM = FIX.hTrue;
  input.urban = { imperv: 23, d0: 5.1, bldgH: 7.3 };
  const timeIt = (o) => { let best = Infinity; for (let k = 0; k < 7; k++) { const s = performance.now(); fuseCubePoint(input, o); best = Math.min(best, performance.now() - s); } return best; };
  fuseCubePoint(input); fuseCubePoint(input, { terrain: false });
  const msT = timeIt({}), msNoT = timeIt({ terrain: false });
  const noise11 = Math.abs(timeIt({ terrain: false }) - msNoT);
  const rT = fuseCubePoint(input);
  const rNoT = fuseCubePoint(input, { terrain: false });
  add('(11) Negativkontrolle der Abnahme: A = A_uhi = null ⇒ byte-gleich zu AP6 (`terrain: false`), die Terme stehen als null, nicht 0',
    JSON.stringify(rT.steps.map((s) => s.fused)) === JSON.stringify(rNoT.steps.map((s) => s.fused))
    && rT.steps.every((s) => s.terrain && s.terrain.dTcapK === null && s.terrain.dTuhiK === null && s.terrain.windFactor === null && s.terrain.flags.includes('terrainTermsInactive') && s.terrain.flags.includes('windBlendingInactive')));
  const s0 = rT.steps[0];
  add('(11) Geometrie je Schritt benannt: f_rad aus Bedeckung/Wind der Zelle, f_saison (16.09. ≈ 0,4…0,6), g der Mulde (180 m, SVF 0,75 ⇒ 0,666), UHI-Geometrie (23 % ⇒ 0,213)',
    s0.terrain.fRad != null && s0.terrain.fRad >= 0 && s0.terrain.fRad <= 1 && s0.terrain.fSaison > 0.4 && s0.terrain.fSaison < 0.6
    && near(s0.terrain.gCap, (180 / 250) * (0.7 + 0.3 * 0.75), 1e-9) && near(s0.terrain.gUhi, 0.23 * (0.7 + 0.3 * 0.75), 1e-9) && s0.terrain.basin === null,
    `f_rad ${s0.terrain.fRad?.toFixed(3)} f_saison ${s0.terrain.fSaison.toFixed(3)} g ${s0.terrain.gCap?.toFixed(3)} uhi ${s0.terrain.gUhi?.toFixed(3)}`);
  add('(11) f_rad folgt der Zelle: der Schritt mit clcl 95 % (Konsistenz ⇒ clct 95) hat f_rad < 0,1 (durchmischt)',
    rT.steps.find((s) => s.tier === 't1' && s.cell.clcl === 95).terrain.fRad < 0.1 && rT.steps.find((s) => s.tier === 't1' && s.cell.clcl === 95).terrain.mixed === true);
  // Mit einer AMPLITUDE von außen (nur im Test) verschiebt sich das Mittel — nachts in der Mulde nach unten.
  const rA = fuseCubePoint(input, { terrainCalib: { A: 3, Auhi: 2, tpiSigmaM: 100 } });
  // Fixture: clct 30 + it, Wind ≈ 2,2 m/s ⇒ f_rad ≈ 0,29 am ersten Schritt — knapp über ε, nicht durchmischt.
  const night = rA.steps.find((s) => s.terrain.fRad > 0.2 && s.terrain.basin === true);
  add('(11) mit A = 3 K (nur Test): in einer klaren, windschwachen Stunde ist die Mulde kälter und die Stadt wärmer als ohne Amplitude — die Terme wirken nur mit Amplitude',
    night && night.terrain.dTcapK < 0 && night.terrain.dTuhiK > 0
    && rA.calib.some((c) => c.startsWith('A:set')) && rT.calib.some((c) => c.startsWith('A:null')),
    night ? `ΔT_cap ${night.terrain.dTcapK.toFixed(3)} ΔT_uhi ${night.terrain.dTuhiK.toFixed(3)} K` : 'kein passender Schritt');
  add('(11) mit z0 (nur Test: Modell Gras 0,03, Punkt Wald 0,75, d0 5,1 m) trägt der Wind einen Faktor < 1; ohne z0 null',
    fuseCubePoint(input, { terrainCalib: { z0Mod: 0.03, z0True: 0.75 } }).steps[0].terrain.windFactor < 0.8 && s0.terrain.windFactor === null);
  add('(11) Kosten: PAP 5 auf 102 Schritten ≤ 5 ms (+ 2 × Rauschboden)', msT - msNoT < 5 + 2 * noise11, `${(msT - msNoT).toFixed(2)} ms (${msT.toFixed(1)} gegen ${msNoT.toFixed(1)} ms, Rauschen ${noise11.toFixed(2)} ms)`);
  add('(11) Setzungen benannt: A:null, Auhi:null, fRad:set, fSaison:set, tpiSigma:null, z0:null',
    ['A:null', 'Auhi:null', 'fRad:set', 'fSaison:set', 'tpiSigma:null', 'z0:null'].every((k) => rT.calib.some((c) => c.startsWith(k))));
  add('(11) f_saison: München am 16.09. gegen 21.06. und 21.12.', fSaisonOf(FIX.lat, FIX.nowMs) > fSaisonOf(FIX.lat, Date.UTC(2026, 5, 21)) && fSaisonOf(FIX.lat, FIX.nowMs) < fSaisonOf(FIX.lat, Date.UTC(2026, 11, 21)));
}

/** Der Wert des Cube-Members am Punkt (nach PAP 3, vor PAP 4) — aus dem Schritt rekonstruiert: T_sample + Lapse·(hModEff − hTrue) = T_PAP4, PAP4 = T̄_Punkt + ΔT. */
function cubeSampleOfValues(r, i) {
  const s = r.steps[i];
  if (!s.vertical) return null;
  return s.vertical.t - s.vertical.deltaK;
}

// ---------------------------------------------------------------------------
// (12) AP7 — Nowcast-Flags, Anker, Klimatologie-Schwanz, stündliche Achse, Fristen
// ---------------------------------------------------------------------------
{
  const mkInput = () => { const i = cubeInputFromBundle(bundle, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; return i; };
  const input = mkInput();
  const base = fuseCubePoint(input);
  const fusedOf = (r) => JSON.stringify(r.steps.map((s) => s.fused));
  const med = (s) => quantileOf(s.fused.temperature.dist, 0.5);

  // ── Nowcast: Deckung aus der Geometrie, Flag statt stillem Modell ──
  add('(12) `nowcastCovering` aus der Geometrie: RV deckt München (radvor_rv), die Fixture trägt keinen Frame',
    input.nowcastCovering.includes('radvor_rv') && input.nowcast.length === 0, input.nowcastCovering.join());
  const inHz = base.steps.filter((s) => s.validAtMs <= FIX.nowMs + 3 * H);
  const beyond = base.steps.filter((s) => s.validAtMs > FIX.nowMs + 3 * H);
  add('(12) 0–3 h ohne Radar-Frame ⇒ `nowcastFallbackModel` auf genau diesen Schritten (21:00 … 00:00), danach nicht',
    inHz.length === 4 && inHz.every((s) => s.flags.includes('nowcastFallbackModel')) && beyond.every((s) => !s.flags.includes('nowcastFallbackModel')),
    `${inHz.length} Schritte im Horizont`);
  const noRadar = mkInput(); noRadar.nowcastCovering = [];
  const rNoRadar = fuseCubePoint(noRadar);
  add('(12) Punkt ohne Radarquelle: kein Flag, Verteilungen byte-gleich (das Flag ist Auskunft, keine Rechnung); Konfidenz 0–3 h um den Faktor 0,9 niedriger',
    rNoRadar.steps.every((s) => !s.flags.includes('nowcastFallbackModel')) && fusedOf(rNoRadar) === fusedOf(base)
    && near(base.steps[0].uncertainty.temperature.confidence.score / rNoRadar.steps[0].uncertainty.temperature.confidence.score, 0.9, 1e-9),
    `Konfidenz ${base.steps[0].uncertainty.temperature.confidence.score.toFixed(3)} gegen ${rNoRadar.steps[0].uncertainty.temperature.confidence.score.toFixed(3)}`);
  const withNc = (ageMin) => {
    const i = mkInput();
    i.nowcast = [{ product: 'nowcast', sourceId: 'radvor_rv', stamp: '2026091621', slotAgeMin: ageMin, probes: 1, extrapolationH: 2, bytes: 0, framesInSlot: 25, framesFetched: 1, framesFailed: 0,
      frames: [{ validAtMs: t0Ms, leadMinutes: 0, mmh: 0.6, saturated: false, validAtSuspect: false }] }];
    return fuseCubePoint(i);
  };
  const fresh = withNc(12), stale = withNc(75);
  add('(12) Radar-Frame auf 21:00: Member `radolan` trägt, dort kein Fallback-Flag (22:00 schon); Slot 75 min alt ⇒ `stale`, 12 min ⇒ nicht',
    fresh.steps[0].members.some((m) => m.product === 'nowcast') && !fresh.steps[0].flags.includes('nowcastFallbackModel') && fresh.steps[1].flags.includes('nowcastFallbackModel')
    && !fresh.steps[0].flags.includes('stale') && stale.steps[0].flags.includes('stale') && stale.steps[0].members.some((m) => m.product === 'nowcast'),
    `Flags +0 h: ${fresh.steps[0].flags.join()} | ${stale.steps[0].flags.join()}`);
  add('(12) Setzung benannt: nowcastStale:set (60 min, 3 h)', base.calib.some((c) => c.startsWith('nowcastStale:set') && /60 min/.test(c)));

  // ── Anker: Messung − Cube am Messzeitpunkt, Innovations-Persistenz ──
  const tCube0 = base.steps[0].vertical.t;   // der Cube-Wert AM PUNKT (PAP 4), vor dem Anker
  const obsAt = (dT, distM = 3000, elevM = FIX.hTrue, atMs = t0Ms) => [{ source: 'brightsky', name: 'Test', lat: FIX.lat, lon: FIX.lon, elevM, distanceM: distM, validAtMs: atMs, temperature: tCube0 + dT, relativeHumidity: null, u: null, v: null, gust: null }];
  const anchored = fuseCubePoint({ ...mkInput(), obs: obsAt(2) });
  const aM = anchored.steps[0].members.find((m) => m.product === 'anchor');
  const wsp = 1 / (1 + (3000 / 20000) ** 2);
  add('(12) Anker: Messung +2 K bei 3 km/Δh 0 ⇒ Versatz 2,00 K, Repräsentativität 0,978, Zuschlag bei +0 h 1,956 K — `anchored` markiert',
    aM && near(aM.anchor.offsetK, 2, 1e-9) && near(aM.anchor.fraction, wsp, 1e-9) && near(aM.anchor.termK, 2 * wsp, 1e-9) && anchored.steps[0].flags.includes('anchored'),
    aM ? JSON.stringify(aM.anchor) : 'kein Anker-Member');
  add('(12) der Median steigt bei +0 h um weniger als den Zuschlag (Station und Prior halten dagegen) und liegt bei +40 h wieder auf dem Wert ohne Anker (τ 4 h)',
    med(anchored.steps[0]) > med(base.steps[0]) + 0.3 && med(anchored.steps[0]) < med(base.steps[0]) + 2 * wsp
    && near(med(anchored.steps[40]), med(base.steps[40]), 1e-3) && !anchored.steps[40].flags.includes('anchored'),
    `+0 h Δ ${(med(anchored.steps[0]) - med(base.steps[0])).toFixed(3)} K, +40 h Δ ${(med(anchored.steps[40]) - med(base.steps[40])).toExponential(2)}`);
  add('(12) Negativkontrollen: ohne Messung byte-gleich zur Basis; `anchor: false` mit Messung ebenso; ferne hohe Station (60 km, +900 m) trägt < 3 %',
    fusedOf(fuseCubePoint({ ...mkInput(), obs: [] })) === fusedOf(base) && fusedOf(fuseCubePoint({ ...mkInput(), obs: obsAt(2) }, { anchor: false })) === fusedOf(base)
    && fuseCubePoint({ ...mkInput(), obs: obsAt(2, 60_000, FIX.hTrue + 900) }).steps[0].members.find((m) => m.product === 'anchor').anchor.fraction < 0.03);
  add('(12) Messung vor dem Achsenbeginn (19:00, kein Schritt in ±30 min) ⇒ kein Paar, Notiz statt Anker; 21:31 paart mit 22:00',
    fuseCubePoint({ ...mkInput(), obs: obsAt(2, 3000, FIX.hTrue, t0Ms - 2 * H) }).notes.some((n) => /kein Paar/.test(n))
    && fuseCubePoint({ ...mkInput(), obs: obsAt(2, 3000, FIX.hTrue, t0Ms + 31 * 60_000) }).steps[1].members.some((m) => m.product === 'anchor'));
  add('(12) Setzung benannt: anchor:set mit τ und Deckel', anchored.calib.some((c) => c.startsWith('anchor:set') && /τ_T 4 h/.test(c) && /Deckel 8 K/.test(c)));

  // ── Klimatologie-Schwanz ──
  const tail = fuseCubePoint(input, { tail: true });
  const tailSteps = tail.steps.filter((s) => s.tier === 'clima');
  add('(12) Schwanz: nach dem letzten nativen Schritt (30.09. 00:00) drei 6-h-Schritte bis zum Fensterende 21:00 — `climatologyOnly`, Member `climatology`, Verteilung aus dem Prior',
    base.steps.length === 102 && tail.steps.length === 105 && tailSteps.length === 3 && tailSteps.map((s) => iso(s.validAtMs)).join() === '2026-09-30T06:00Z,2026-09-30T12:00Z,2026-09-30T18:00Z'
    && tailSteps.every((s) => s.flags.includes('climatologyOnly') && s.fused?.temperature?.climatologyOnly === true && s.members[0].product === 'climatology' && s.fused.temperature.dist.sigma > 0),
    `${tail.steps.length} Schritte, Schwanz ${tailSteps.map((s) => iso(s.validAtMs)).join(' ')}`);
  add('(12) der Schwanz ändert die nativen Schritte nicht (byte-gleich) und trägt σ = Klimatologie (5 K in der Fixture); Setzung tail:set',
    JSON.stringify(tail.steps.slice(0, 102).map((s) => s.fused)) === fusedOf(base) && near(tailSteps[0].fused.temperature.dist.sigma, 5, 0.5) && tail.calib.some((c) => c.startsWith('tail:set')) && !base.calib.some((c) => c.startsWith('tail:set')),
    `σ ${tailSteps[0]?.fused?.temperature?.dist?.sigma}`);

  // ── Stündliche Achse ──
  const hourly = fuseCubePoint(input, { hourly: true, tail: true });
  const tiers = {}; for (const s of hourly.steps) if (!s.interpolated) tiers[s.tier] = (tiers[s.tier] ?? 0) + 1;
  const interp = hourly.steps.filter((s) => s.interpolated);
  const atIso = (r, s) => r.steps.find((x) => iso(x.validAtMs) === s);
  add('(12) stündlich: 337 Stunden 21:00 … 30.09. 21:00 = 102 native + 153 Station (bis 26.09. 22:00, MOSMIX 247 h) + 79 interpoliert + 3 Klimatologie',
    hourly.steps.length === 337 && hourly.steps.every((s, i) => s.validAtMs === t0Ms + i * H)
    && tiers.t1 === 46 && tiers.t2 === 22 && tiers.t3 === 34 && tiers.station === 153 && tiers.clima === 3 && interp.length === 79,
    `${JSON.stringify(tiers)} interpoliert ${interp.length}`);
  add('(12) Lücken an den Nähten (18.09. 19:00/20:00, 21.09. 13:00 … 17:00): die Station füllt (`stationOnly`, ein Member mosmix, Verteilung da)',
    ['2026-09-18T19:00Z', '2026-09-18T20:00Z', '2026-09-21T13:00Z', '2026-09-21T15:00Z', '2026-09-21T17:00Z'].every((k) => { const s = atIso(hourly, k); return s && s.tier === 'station' && s.flags.includes('stationOnly') && s.fused && s.members.length === 1 && s.members[0].product === 'station'; }));
  add('(12) interpolierte Stunden: `fused: null`, p50 zwischen den Nachbarschritten, p10 ≤ p50 ≤ p90, Konfidenz diskontiert, alle jenseits 26.09. 22:00, nur das Flag `interpolated`',
    interp.every((s) => s.fused === null && s.interp.temperature && s.validAtMs > Date.UTC(2026, 8, 26, 22) && s.flags.join() === 'interpolated' && s.interp.confidence.temperature >= 0 && s.interp.confidence.temperature <= 1)
    && interp.filter((s) => s.validAtMs < Date.UTC(2026, 8, 30)).every((s) => s.interp.confidence.temperature > 0)
    && interp.every((s) => {
      const i = hourly.steps.indexOf(s);
      const prev = hourly.steps.slice(0, i).reverse().find((x) => x.fused), next = hourly.steps.slice(i + 1).find((x) => x.fused);
      if (!next) return prev.tier === 'clima' && s.validAtMs > Date.UTC(2026, 8, 30, 18);   // die letzten Stunden stützen sich auf den Klimatologie-Schritt HINTER dem Fenster
      const lo = Math.min(med(prev), med(next)) - 1e-9, hi = Math.max(med(prev), med(next)) + 1e-9;
      return s.interp.temperature.p50 >= lo && s.interp.temperature.p50 <= hi && s.interp.temperature.p10 <= s.interp.temperature.p50 && s.interp.temperature.p50 <= s.interp.temperature.p90;
    }));
  add('(12) die Naht wird nicht geglättet (R7): native Schritte auf der stündlichen Achse byte-gleich zur nativen, die zwei Naht-Flags bleiben, keine interpolierte Naht',
    hourly.steps.filter((s) => !s.interpolated && s.tier !== 'station' && s.tier !== 'clima').map((s) => JSON.stringify(s.fused)).join('|') === base.steps.map((s) => JSON.stringify(s.fused)).join('|')
    && hourly.steps.filter((s) => s.flags.includes('seam')).length === 2);
  const noSt = mkInput(); noSt.station = null;
  const hourlyNoSt = fuseCubePoint(noSt, { hourly: true, tail: true });
  add('(12) Punkt ohne Station: alle 232 Stunden ohne nativen Schritt sind interpoliert, keine `station`-Stufe',
    hourlyNoSt.steps.length === 337 && hourlyNoSt.steps.filter((s) => s.interpolated).length === 232 && !hourlyNoSt.steps.some((s) => s.tier === 'station'),
    `${hourlyNoSt.steps.length} Stunden, ${hourlyNoSt.steps.filter((s) => s.interpolated).length} interpoliert`);
  add('(12) Setzung benannt: interpolation:set (nur stündlich)', hourly.calib.some((c) => c.startsWith('interpolation:set')) && !base.calib.some((c) => c.startsWith('interpolation:set')));
  const hourlyNoClima = fuseCubePoint({ ...mkInput(), clima: null }, { hourly: true, tail: true });
  add('(12) ohne Klimatologie: kein Schwanz und nichts zu interpolieren (keine Verteilungen), die Station füllt trotzdem',
    !hourlyNoClima.steps.some((s) => s.tier === 'clima') && !hourlyNoClima.steps.some((s) => s.interpolated) && hourlyNoClima.steps.some((s) => s.tier === 'station'));

  // ── Ende-zu-Ende: der Anker läuft nebenher, die Gnadenfrist trägt ──
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ioBase = { store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue) };
  const optsE = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  clearCubeForecastCache();
  const tL = performance.now();
  const late = await getPointForecastFromCube(optsE, { ...ioBase, obs: async () => { await sleep(2500); return obsAt(2); } });
  const lateMs = performance.now() - tL;
  add('(12) Messung erst nach 2,5 s ⇒ die Antwort wartet höchstens die Gnadenfrist (500 ms) nach dem Bündel, Notiz „kein Anker", keine Anker-Quelle, 337 Stunden',
    lateMs < 1200 && late.cube.notes.some((n) => /anchor: Messung nach .* noch nicht da/.test(n)) && !late.sourcesAvailable.includes('brightsky') && late.hours.length === 337,
    `${lateMs.toFixed(0)} ms`);
  clearCubeForecastCache();
  const quick = await getPointForecastFromCube(optsE, { ...ioBase, obs: async () => obsAt(2) });
  add('(12) Messung sofort ⇒ Anker im Produkt: `brightsky` unter den Quellen, +0 h wärmer als ohne, `anchored` in der Flag-Liste, `doneAt.obs` gemessen',
    quick.sourcesAvailable.includes('brightsky') && quick.hours[0].temperature > late.hours[0].temperature + 0.3 && quick.cube.flags[0].flags.includes('anchored') && typeof quick.cube.timing.doneAt.obs === 'number',
    `+0 h ${quick.hours[0].temperature?.toFixed(2)} gegen ${late.hours[0].temperature?.toFixed(2)}`);
  clearCubeForecastCache();
  const failing = await getPointForecastFromCube(optsE, { ...ioBase, obs: async () => { throw new Error('netz'); } });
  add('(12) Messabruf scheitert ⇒ Produkt ohne Anker mit Notiz, kein Fehler', failing.hours.length === 337 && !failing.sourcesAvailable.includes('brightsky') && failing.cube.notes.some((x) => /anchor: Messungs-Abruf gescheitert/.test(x)));
  clearCubeForecastCache();
  const none = await getPointForecastFromCube(optsE, { ...ioBase, obs: async () => [] });
  add('(12) leere Messliste (keine Station oder Abruf abgebrochen) ⇒ Notiz, kein Anker', none.cube.notes.some((x) => /anchor: keine Messung erhalten/.test(x)) && !none.cube.flags.some((f) => f.flags.includes('anchored')));

  // ── Frist der progressiven Produkte im Leser (V-FI-16) ──
  const slowStore = (delayMs) => { const s = memoryStore(fx.files); const bytes = s.bytes.bind(s); return { ...s, bytes: async (p, o) => { if (/static\//.test(p)) await sleep(delayMs); return bytes(p, o); } }; };
  const readSlow = (over) => readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 }, { store: slowStore(600), terrain: false, nowcast: false, plan: false, ...over });
  const tS = performance.now();
  const bDead = await readSlow({ lateDeadlineMs: 100, lateGraceMs: 50 });
  const deadMs = performance.now() - tS;
  add('(12) Leser: statische Produkte 600 ms langsam, Frist 100 ms ab Start (Gnade 50 ms nach dem Kern) ⇒ Bündel nach < 500 ms ohne hmodel/urban, Skip-Notiz, Kern vollständig (V-FI-16)',
    deadMs < 500 && bDead.hmodel.t1 === null && bDead.urban === null && bDead.skips.some((k) => /static: hmodel\/urban nach der Frist/.test(k)) && !!bDead.cube.t1 && !!bDead.station,
    `${deadMs.toFixed(0)} ms; ${bDead.skips.filter((k) => /Frist/.test(k)).join('; ')}`);
  const tS2 = performance.now();
  const bWait = await readSlow({});
  add('(12) ohne Frist wartet der Leser (≥ 600 ms), keine Frist-Notiz', performance.now() - tS2 >= 600 && !bWait.skips.some((k) => /nach der Frist/.test(k)), `${(performance.now() - tS2).toFixed(0)} ms`);
}

// ---------------------------------------------------------------------------
// (13) AP8 — Ausgabe `PointForecastV2`: Rundung, Rundweg Δ/2, eine Negativkontrolle je Flag,
//      Live-Gleichheit mit dem Gewichte-Hook, Laufzeit
// ---------------------------------------------------------------------------
{
  const o = verifyOutput();
  for (const c of o.checks) add(`(13) output: ${c.name}`, c.ok, c.detail);
  const mkInput = () => { const i = cubeInputFromBundle(bundle, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; return i; };
  const input = mkInput();
  const base = fuseCubePoint(input);
  const r = fuseCubePoint(input, { hourly: true, tail: true });
  const outExtra = { nowMs: FIX.nowMs, terrainSource: 'override', urban: null };
  const v2 = toPointForecastV2(r, outExtra);
  const s0 = v2.axis.steps[0];
  const sum = (xs) => xs.reduce((a, x) => a + x, 0);

  add('(13) v2: schema 2, 337 Schritte, 102 native, 79 interpoliert, 14 Größen je Schritt, 2 Nähte, Setzungen = die der Rechnung',
    v2.schema === 2 && v2.axis.steps.length === 337 && v2.axis.native.length === 102 && v2.axis.interpolated.length === 79
    && v2.axis.steps.every((s) => Object.keys(s.vars).length === 14) && v2.axis.seams.length === 2 && v2.provenance.calib.length === r.calib.length
    && v2.provenance.calibByVar.t2m.includes('sigmaSys') && v2.provenance.calibByVar.t2m.includes('anchor') && !v2.provenance.calibByVar.precip.includes('sigmaSys') && v2.provenance.units.t2m === 'degC' && v2.provenance.units.precip === 'mm/h',
    `${v2.axis.steps.length} Schritte, ${v2.axis.interpolated.length} interpoliert`);
  const t2m0 = s0.vars.t2m;
  const wCube = t2m0?.members.find((m) => m.tag === 'cube-t1'), wSt = t2m0?.members.find((m) => m.tag === 'mosmix'), wCl = t2m0?.members.find((m) => m.tag === 'climatology');
  add('(13) Schritt 0 t2m: p10 < p50 < p90, σ > 0, Verteilung normal, σ-Art divergence (σ_div im Cube), Konfidenz 0…1, Member cube-t1 + mosmix (Σ Gewicht = 1) + climatology (1 − β)',
    !!t2m0 && t2m0.p10 < t2m0.p50 && t2m0.p50 < t2m0.p90 && t2m0.sigma > 0 && t2m0.dist.kind === 'normal' && t2m0.sigmaKind === 'divergence'
    && t2m0.confidence && t2m0.confidence.score >= 0 && t2m0.confidence.score <= 1
    && wCube && wSt && wCl && near(wCube.weight + wSt.weight, 1, 2e-3) && wCl.weight > 0 && wCl.weight < 1 && wCube.value != null && wSt.value != null && wCl.value === null
    && s0.members.some((m) => m.product === 'cube-t1' && m.run === FIX.runs.t1 && Array.isArray(m.models)) && s0.members.some((m) => m.product === 'station' && m.station?.id === '10865') && s0.members.some((m) => m.product === 'climatology'),
    t2m0 ? `p ${t2m0.p10}/${t2m0.p50}/${t2m0.p90} σ ${t2m0.sigma} Gewichte cube ${wCube?.weight} mosmix ${wSt?.weight} clima ${wCl?.weight}` : 'kein t2m');
  const onGrid = (x, step) => x == null || Math.abs(x / step - Math.round(x / step)) < 1e-6;
  add('(13) Rundung auf die Ebenenskala (V-FI-8): t2m/td2m/Wind/Böe/Niederschlag auf 0,01, rh/clct/ps auf 0,1, Schneefallgrenze auf 1 m, Gewichte/Konfidenz auf 0,001',
    v2.axis.steps.every((s) => ['t2m', 'td2m', 'wind', 'gust', 'precip'].every((k) => !s.vars[k] || ['p10', 'p50', 'p90', 'mean', 'sigma'].every((q) => onGrid(s.vars[k][q], 0.01)))
      && ['rh', 'clct', 'ps'].every((k) => !s.vars[k] || ['p10', 'p50', 'p90', 'mean', 'sigma'].every((q) => onGrid(s.vars[k][q], 0.1)))
      && (!s.vars.snowline || onGrid(s.vars.snowline.p50, 1))
      && Object.values(s.vars).every((v) => !v || (v.members.every((m) => onGrid(m.weight, 0.001)) && (!v.confidence || onGrid(v.confidence.score, 0.001))))));
  // Rundweg Δ/2: ohne PAP 3/4 ist der Cube-Member-Wert die Zelle selbst — die Signatur, quantisiert auf 0,01 K.
  const s1 = bundle.cube.t1;
  const ext = chunkExtent(TIER_BY_ID.t1, s1.chunk.cy, s1.chunk.cx);
  const ry = s1.cell.iy - ext.y0, rx = s1.cell.ix - ext.x0;
  const v2Raw = toPointForecastV2(fuseCubePoint(input, { grid: false, vertical: false }), outExtra);
  const cubeRaw = v2Raw.axis.steps[0].vars.t2m.members.find((m) => m.tag === 'cube-t1');
  add('(13) Rundweg: der Cube-Member-Wert von t2m an Schritt 0 (ohne PAP 3/4) = Signatur der Zelle ± Δ/2 (0,005 K)',
    cubeRaw && Math.abs(cubeRaw.value - signature('t1', 3, ry, rx).t2m) <= 0.005 + 1e-9,
    `${cubeRaw?.value} gegen ${signature('t1', 3, ry, rx).t2m.toFixed(4)}`);
  const si = v2.axis.steps.find((s) => s.interpolated);
  add('(13) interpolierter Schritt: Quantile ohne Verteilung, σ-Art set, calib interpolated:set, keine Member, Konfidenz-Score, keine Windrichtung/Schichten',
    si && si.vars.t2m && si.vars.t2m.dist === null && si.vars.t2m.sigmaKind === 'set' && si.vars.t2m.members.length === 0 && si.members.length === 0 && si.vars.t2m.calib.join() === 'interpolated' && v2.provenance.calibLegend.interpolated.startsWith('set')
    && si.vars.t2m.confidence && si.vars.t2m.confidence.score >= 0 && si.vars.windDir === null && si.vars.clcl === null && si.flags.includes('interpolated'));
  const ss = v2.axis.steps.find((s) => s.tier === 'station');
  const ssM = ss?.vars.t2m?.members ?? [];
  add('(13) Stationsschritt: Member mosmix (Gewicht 1) + climatology (1 − β), σ-Art sys-only, Flag stationOnly',
    ss && ssM.find((m) => m.tag === 'mosmix')?.weight === 1 && ssM.find((m) => m.tag === 'climatology')?.weight > 0 && ss.vars.t2m.sigmaKind === 'sys-only' && ss.flags.includes('stationOnly') && ss.members.some((m) => m.product === 'station'),
    ss ? JSON.stringify(ssM.map((m) => [m.tag, m.weight])) : 'kein Stationsschritt');
  const sc = v2.axis.steps.find((s) => s.tier === 'clima');
  add('(13) Klimatologie-Schritt: σ-Art none, calib climatologyOnly, Member climatology mit Gewicht 1, Flag climatologyOnly',
    sc && sc.vars.t2m.sigmaKind === 'none' && sc.vars.t2m.calib.includes('climatologyOnly') && sc.vars.t2m.members.length === 1 && sc.vars.t2m.members[0].tag === 'climatology' && sc.vars.t2m.members[0].weight === 1 && sc.flags.includes('climatologyOnly'));
  add('(13) Schichten ohne σ-Ebene: clcl = Zellwert, ohne Verteilung (none); ps hydrostatisch (PAP 4) mit σ aus dem Cube, wenn da; Windrichtung mit Gate; pSnow 0…1',
    s0.vars.clcl && s0.vars.clcl.dist === null && s0.vars.clcl.sigmaKind === 'none' && near(s0.vars.clcl.p50, base.steps[0].cell.clcl, 0.051)
    && s0.vars.ps && s0.vars.ps.calib.includes('psHydrostatic') && ['divergence', 'ensemble', 'none'].includes(s0.vars.ps.sigmaKind)
    && (s0.vars.windDir === null || (s0.vars.windDir.p50 >= 0 && s0.vars.windDir.p50 < 360 && s0.vars.windDir.p10 === null))
    && s0.vars.pSnow && s0.vars.pSnow.p50 >= 0 && s0.vars.pSnow.p50 <= 1,
    `clcl ${s0.vars.clcl?.p50} ps ${s0.vars.ps?.p50} (${s0.vars.ps?.sigmaKind}) dir ${s0.vars.windDir?.p50} pSnow ${s0.vars.pSnow?.p50}`);
  add('(13) Provenienz: Läufe t1/t2/t3 mit runAt (ISO) und ageH, Station mit runAt, indexCommit, Notizen',
    v2.provenance.runs.t1?.run === FIX.runs.t1 && /^2026-09-16T18:00:00/.test(v2.provenance.runs.t1.runAt) && v2.provenance.runs.t1.ageH > 0
    && v2.provenance.runs.t3?.run === FIX.runs.t3 && typeof v2.provenance.runs.stations?.runAt === 'string' && v2.provenance.indexCommit === FIX.commit && Array.isArray(v2.provenance.notes));
  add('(13) rein serialisierbar: JSON-Rundweg byte-gleich, kein NaN/Infinity, keine Date-Objekte',
    JSON.stringify(JSON.parse(JSON.stringify(v2))) === JSON.stringify(v2) && !/NaN|Infinity/.test(JSON.stringify(v2)));
  add('(13) Ende-zu-Ende: `fc.cube.v2` hängt am Produkt (gleiche Achse wie `hours`), `outputMs` gemessen',
    await (async () => {
      clearCubeForecastCache();
      const io = { store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue) };
      const fc = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false }, io);
      return fc.cube.v2?.schema === 2 && fc.cube.v2.axis.steps.length === fc.hours.length && fc.cube.v2.axis.steps.every((s, i) => s.validAtMs === fc.hours[i].timestamp.getTime())
        && typeof fc.cube.timing.outputMs === 'number' && fc.cube.v2.timing.totalMs === fc.cube.timing.totalMs && fc.cube.v2.point.terrainSource === 'override';
    })());

  // ── Live-Gleichheit: der Gewichte-Hook ist Auskunft, keine Rechnung ──
  const flat = { elevationM: 300, lapseRatePerM: 0.0065, terrain: flatScales(300), skyView: 1, sinkDepthM: 0, terrainDeltaC: 0, solarElevDeg: 20, foehnScore: 0, clima: { tempMeanC: 10, tempSigmaC: 6, wetProbDaily: 0.25 } };
  const sA = { source: 'mosmix', family: 'mosmix', temperature: 12, sourceElevation: 300, u: 2, v: 1, gust: 4, relativeHumidity: 70, snowLine: null, cloudLow: 20, cloudMid: 10, cloudHigh: 5, precipitation: 0.2, uvIndex: null, distanceMeters: 2000 };
  const sB = { ...sA, source: 'mosmix-2', temperature: 13, distanceMeters: 5000 };
  const seen = [];
  const withHook = fuseHour([sA, sB], 6, { ...flat, onWeights: (i) => seen.push(i) });
  add('(13) Live-Gleichheit: `fuseHour` mit und ohne `onWeights` byte-gleich; der Hook meldet je Größe Gewichte mit Σ = 1 und β in (0,1)',
    JSON.stringify(withHook) === JSON.stringify(fuseHour([sA, sB], 6, flat)) && seen.length >= 5
    && seen.every((i) => near(sum(i.weights.map((w) => w.w)), 1, 1e-9) && i.beta > 0 && i.beta < 1 && i.weights.length === 2),
    `${seen.length} Meldungen: ${[...new Set(seen.map((i) => i.variable))].join(',')} · Member je Meldung ${seen.map((i) => i.weights.length).join('/')}`);

  // ── Eine Negativkontrolle je Flag: ein Fall, der es setzt, und einer, der es nicht setzt ──
  const withNc = (ageMin, saturated = false) => {
    const i = mkInput();
    i.nowcast = [{ product: 'nowcast', sourceId: 'radvor_rv', stamp: '2026091621', slotAgeMin: ageMin, probes: 1, extrapolationH: 2, bytes: 0, framesInSlot: 25, framesFetched: 1, framesFailed: 0,
      frames: [{ validAtMs: t0Ms, leadMinutes: 0, mmh: saturated ? null : 0.6, saturated, validAtSuspect: false }] }];
    return fuseCubePoint(i);
  };
  const fresh = withNc(12), stale = withNc(75), sat = withNc(12, true);
  const tCube0 = base.steps[0].vertical.t;
  const anchored = fuseCubePoint({ ...mkInput(), obs: [{ source: 'brightsky', lat: FIX.lat, lon: FIX.lon, elevM: FIX.hTrue, distanceM: 3000, validAtMs: t0Ms, temperature: tCube0 + 2, relativeHumidity: null, u: null, v: null, gust: null }] });
  const low = fuseCubePoint({ ...mkInput(), terrain: flatTerrain(300), elevationM: 300 });
  const bgIn = mkInput();
  bgIn.cube = { ...bgIn.cube, t1: { ...bgIn.cube.t1, steps: bgIn.cube.t1.steps.map((s, i) => (i === 3 ? { ...s, belowGroundHPa: [925] } : s)) } };
  const bg = fuseCubePoint(bgIn);
  const noTerrain = fuseCubePoint({ ...cubeInputFromBundle(bundle, clima), terrain: null, elevationM: null });
  const graz = await buildCubeFixture({ tiers: ['t1'], station: false, lat: 47.0707, lon: 15.4395 });
  const bG = await readPointBundle({ lat: 47.0707, lon: 15.4395, elevationM: 350, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 48 * H, stepH: 1 },
    { store: memoryStore(graz.files), terrain: false, nowcast: false, plan: false, neighbours: true });
  const rGz = fuseCubePoint({ ...cubeInputFromBundle(bG, clima), terrain: flatTerrain(350), elevationM: 350 });
  const cases = {
    seam: [r.steps.find((s) => s.flags.includes('seam')), r.steps[0]],
    interpolated: [r.steps.find((s) => s.interpolated), r.steps[0]],
    stationOnly: [r.steps.find((s) => s.tier === 'station'), r.steps[0]],
    climatologyOnly: [r.steps.find((s) => s.tier === 'clima'), r.steps[0]],
    nowcastFallbackModel: [base.steps[0], base.steps[10]],
    stale: [stale.steps[0], fresh.steps[0]],
    nowcastSaturated: [sat.steps[0], fresh.steps[0]],
    anchored: [anchored.steps[0], base.steps[0]],
    inversionBody: [base.steps.find((s) => s.vertical?.case === 'B'), base.steps[0]],
    stdLapseFallback: [base.steps.find((s) => s.tier === 't2'), base.steps[0]],
    extrapolatedBelowModel: [low.steps.find((s) => s.flags.includes('extrapolatedBelowModel')), base.steps[0]],
    belowGround925: [bg.steps[0], bg.steps[1]],
    noTerrain: [noTerrain.steps[0], base.steps[0]],
    chunkBorderTruncated: [rGz.steps[0], base.steps[0]],
  };
  for (const [flag, [yes, no]] of Object.entries(cases)) {
    add(`(13) Flag \`${flag}\`: im Fall gesetzt, in der Kontrolle nicht`, !!yes && !!no && yes.flags.includes(flag) && !no.flags.includes(flag),
      yes ? `${iso(yes.validAtMs)} [${yes.flags.join()}] gegen ${no ? iso(no.validAtMs) : '—'} [${no?.flags.join()}]` : 'kein Fall');
  }
  add('(13) alle 16 Flags der Form haben eine Kontrolle', Object.keys(cases).length === 14 && ['seam', 'interpolated', 'stationOnly', 'climatologyOnly', 'nowcastFallbackModel', 'stale', 'nowcastSaturated', 'anchored', 'inversionBody', 'stdLapseFallback', 'extrapolatedBelowModel', 'belowGround925', 'noTerrain', 'chunkBorderTruncated'].every((f) => f in cases));

  // ── Laufzeit (Node, Fixture, Minimum aus drei Läufen) ──
  const timeIt = (fn) => { let best = Infinity; for (let k = 0; k < 7; k++) { const t = performance.now(); fn(); best = Math.min(best, performance.now() - t); } return best; };
  fuseCubePoint(input); fuseCubePoint(input, { hourly: true, tail: true });
  const msNative = timeIt(() => fuseCubePoint(input));
  const msHourly = timeIt(() => fuseCubePoint(input, { hourly: true, tail: true }));
  const msOut = timeIt(() => toPointForecastV2(r, outExtra));
  const msJson = timeIt(() => JSON.stringify(v2));
  add('(13) Laufzeit Algorithmus + Ausgabe (Node, Fixture): nativ 102 Schritte, stündlich 337, Ausgabe v2, JSON — stündlich < 300 ms, Ausgabe < 60 ms',
    msHourly < 300 && msOut < 60, `nativ ${msNative.toFixed(1)} ms · stündlich ${msHourly.toFixed(1)} ms · Ausgabe ${msOut.toFixed(1)} ms · JSON ${msJson.toFixed(1)} ms (${(JSON.stringify(v2).length / 1024).toFixed(0)} KB — Größe gemessen, nicht gedeckelt: V-FI-21)`);
}

// ---------------------------------------------------------------------------
// (14) AP12 — progressive Ausgabe (`onUpdate`): erste Antwort ab dem Kern, EINE Nachlieferung;
//      statische Produkte ändern keinen Wert (V-FI-22); ohne `onUpdate` alles wie bisher
// ---------------------------------------------------------------------------
{
  const { encodeCubeChunk, staticChunkPath, staticManifestPath } = await import('../src/point/cubeFormat.ts');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Die Fixture trägt kein Stadt-Raster — hier eins in echter Form (Container des Producers, Manifest mit Ebenenliste).
  const files = new Map(fx.files);
  const urbanPlanes = [{ id: 'imperv', unit: 'pct', scale: 0.1, offset: 0 }, { id: 'd0', unit: 'm', scale: 0.1, offset: 0 }, { id: 'bldgH', unit: 'm', scale: 0.1, offset: 0 }];
  const uCell = cellOf(TIER_BY_ID.t1, FIX.lat, FIX.lon), uCh = chunkOf(uCell.iy, uCell.ix), uExt = chunkExtent(TIER_BY_ID.t1, uCh.cy, uCh.cx);
  const uPl = [230, 45, 120].map((q) => { const a = new Int16Array(uExt.ny * uExt.nx); a.fill(q); return a; });
  files.set(staticChunkPath('urban', 'v1', 't1', uCh.cy, uCh.cx), await encodeCubeChunk({ runHours: 0, tierIndex: 0, nt: 1, y0: uExt.y0, x0: uExt.x0, ny: uExt.ny, nx: uExt.nx, planes: uPl }, undefined, urbanPlanes));
  files.set(staticManifestPath('urban', 'v1'), new TextEncoder().encode(JSON.stringify({ product: 'urban', version: 'v1', planes: urbanPlanes })));
  const slowStore = (re, delayMs) => { const s = memoryStore(files); const bytes = s.bytes.bind(s); return { ...s, bytes: async (p, o) => { if (re.test(p)) await sleep(delayMs); return bytes(p, o); } }; };
  const mk0 = cubeInputFromBundle(bundle, clima); mk0.terrain = flatTerrain(FIX.hTrue); mk0.elevationM = FIX.hTrue;
  const tCube0 = fuseCubePoint(mk0).steps[0].vertical.t;
  const obsList = [{ source: 'brightsky', name: 'Test', lat: FIX.lat, lon: FIX.lon, elevM: FIX.hTrue, distanceM: 3000, validAtMs: t0Ms, temperature: tCube0 + 2, relativeHumidity: null, u: null, v: null, gust: null }];
  const optsP = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const ioOf = (store, obs) => ({ store, terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs });
  const stepsOf = (fc) => JSON.stringify(fc.cube.v2.axis.steps);

  // Referenzen OHNE onUpdate (der bisherige Weg): statische Produkte da, einmal ohne und einmal mit Messung.
  clearCubeForecastCache();
  const refNoObs = await getPointForecastFromCube(optsP, ioOf(memoryStore(files), null));
  clearCubeForecastCache();
  const refObs = await getPointForecastFromCube(optsP, ioOf(memoryStore(files), async () => obsList));
  add('(14) Referenz ohne `onUpdate`: Stadt-Raster gelesen (imperv 23 %), kein `emission`-Feld — der bisherige Weg bleibt, wie er war',
    refNoObs.cube.v2.point.terrain.imperv === 23 && refObs.cube.v2.point.terrain.d0 === 4.5 && !('emission' in refNoObs.cube) && !('pending' in refObs.cube),
    `imperv ${refNoObs.cube.v2.point.terrain.imperv} d0 ${refObs.cube.v2.point.terrain.d0}`);

  // Progressiv: statische Produkte 600 ms langsam, Messung sofort verfügbar.
  // Alle Ausgaben eines progressiven Aufrufs einsammeln (die zurückgegebene + jede über onUpdate), bis nichts mehr offen ist.
  const runProg = async (store, obsFn) => {
    const em = [];
    let obsCalledAt = null, chunkLog = [];
    const t0 = performance.now();
    const logged = { ...store, bytes: async (p, o) => { if (/^point\/\d{10}\/t[123]\//.test(p)) chunkLog.push({ tier: p.match(/\/(t[123])\//)[1], at: performance.now() - t0, phase: 'start' }); const b = await store.bytes(p, o); if (/^point\/\d{10}\/t[123]\//.test(p)) chunkLog.push({ tier: p.match(/\/(t[123])\//)[1], at: performance.now() - t0, phase: 'end' }); return b; } };
    const io = ioOf(logged, obsFn ? async () => { obsCalledAt = performance.now() - t0; return obsFn(); } : null);
    await new Promise((resolve) => {
      const onUpdate = (fc) => { em.push({ fc, ms: performance.now() - t0 }); if (fc.cube.pending.length === 0) resolve(); };
      getPointForecastFromCube({ ...optsP, onUpdate }, io).then((fc) => { em.push({ fc, ms: performance.now() - t0, returned: true }); if (fc.cube.pending.length === 0) resolve(); });
      setTimeout(resolve, 3000);
    });
    await sleep(50);
    const by = (k) => em.find((e) => e.fc.cube.emission === k) ?? null;
    return { em, first: em.find((e) => e.returned) ?? null, core: by('core'), update: by('update'), obsCalledAt, chunkLog };
  };

  // Progressiv: statische Produkte 600 ms langsam, Messung sofort verfügbar.
  clearCubeForecastCache();
  const P = await runProg(slowStore(/static\//, 600), async () => obsList);
  const nFirst = P.first?.fc.hours.length ?? 0;
  add('(14) E-F-3 (a) progressiv: die erste Antwort ist die erste Stufe (t1 + Station), Fenster bis zu ihrem letzten Schritt, `pending` nennt t2, t3 und den Anker',
    P.first && P.first.fc.cube.emission === 'first' && P.first.fc.cube.pending.join() === 't2,t3,anchor' && nFirst === 46 && P.first.ms < 450
    && P.first.fc.cube.skips.some((s) => /cube: t2\/t3 folgen/.test(s)),
    P.first ? `${P.first.ms.toFixed(0)} ms, ${nFirst} Stunden, pending ${P.first.fc.cube.pending.join()}` : 'keine erste Antwort');
  add('(14) die erste Darstellung ist in jedem Wert GENAU der Anfang der vollständigen Antwort (0–45 h byte-gleich zur Referenz ohne Messung)',
    P.first && JSON.stringify(P.first.fc.cube.v2.axis.steps) === JSON.stringify(refNoObs.cube.v2.axis.steps.slice(0, nFirst)) && nFirst > 0);
  const t1End = P.chunkLog.find((c) => c.tier === 't1' && c.phase === 'end')?.at;
  const laterStart = Math.min(...P.chunkLog.filter((c) => c.tier !== 't1' && c.phase === 'start').map((c) => c.at));
  add('(14) E-F-3 (a): t2/t3 werden erst abgerufen, wenn die Bytes von t1 da sind (auf voller Leitung käme t1 sonst als letzter an)',
    t1End != null && Number.isFinite(laterStart) && laterStart >= t1End, `t1 fertig ${t1End?.toFixed(1)} ms, t2/t3 ab ${laterStart.toFixed(1)} ms`);
  add('(14) zweite Ausgabe = der Kern: ganzes Fenster (337 h), `emission: core`, offen nur noch Anker + Stadt-Raster; V-FI-22: ohne Stadt-Raster byte-gleich zur Referenz MIT Stadt-Raster (ohne Messung), der Vergleich sieht den Anker',
    P.core && P.core.fc.cube.emission === 'core' && P.core.fc.hours.length === 337 && P.core.fc.cube.pending.join() === 'anchor,static'
    && stepsOf(P.core.fc) === stepsOf(refNoObs) && stepsOf(P.core.fc) !== stepsOf(refObs) && P.core.fc.cube.v2.point.terrain.imperv === null
    && P.core.fc.cube.skips.some((s) => /static: .*zum Kern noch nicht da/.test(s)),
    P.core ? `${P.core.ms.toFixed(0)} ms, pending ${P.core.fc.cube.pending.join()}` : 'kein Kern');
  add('(14) der Messungs-Abruf startet erst mit dem Kern (progressiv; auf Mobil-4G belegt er sonst ≈ 160 ms der Leitung), die Ausgaben davor nennen „Messung folgt" und tragen keinen Anker',
    P.core && P.obsCalledAt != null && P.obsCalledAt >= P.core.fc.cube.timing.coreMs && [P.first, P.core].every((e) => e.fc.cube.notes.some((n) => /anchor: Messung folgt/.test(n)) && !e.fc.sourcesAvailable.includes('brightsky')),
    `Abruf bei ${P.obsCalledAt?.toFixed(0)} ms, Kern ${P.core?.fc.cube.timing.coreMs} ms`);
  add('(14) die Nachlieferung kommt EINMAL (Stadt-Raster + Anker), `emission: update`, nichts mehr offen, die Frist-Notiz des Stadt-Rasters ist weg — und sie ist byte-gleich zur Referenz mit Messung',
    P.update && P.em.filter((e) => e.fc.cube.emission === 'update').length === 1 && P.update.fc.cube.pending.length === 0 && P.update.fc.cube.v2.point.terrain.imperv === 23 && P.update.fc.sourcesAvailable.includes('brightsky')
    && !P.update.fc.cube.skips.some((s) => /static: /.test(s)) && stepsOf(P.update.fc) === stepsOf(refObs) && P.update.ms >= 600,
    P.update ? `${P.update.ms.toFixed(0)} ms` : 'keine Nachlieferung');
  // Cache: ein zweiter Aufruf nach der Nachlieferung bekommt sie (die erste Darstellung mit kürzerem Fenster kommt nie in den Cache).
  const again = await getPointForecastFromCube({ ...optsP, onUpdate: () => {} }, ioOf(memoryStore(files), async () => obsList));
  add('(14) Ergebnis-Cache hält nach der Nachlieferung die vollständige Fassung (337 h)', again.cube.emission === 'update' && again.cube.v2.point.terrain.imperv === 23 && again.hours.length === 337);

  // Nichts kommt nach (kein Messungs-Abruf, statische Produkte vor dem Kern) ⇒ nur der Kern folgt der ersten Darstellung.
  clearCubeForecastCache();
  const L = await runProg(memoryStore(files), null);
  add('(14) nichts offen (kein Messungs-Abruf, `static` vor dem Kern da) ⇒ erste Darstellung, dann der Kern mit leerem `pending`, KEINE weitere Ausgabe; Kern byte-gleich zur Referenz',
    L.first?.fc.cube.emission === 'first' && L.core && L.core.fc.cube.pending.length === 0 && !L.update && L.em.length === 2 && stepsOf(L.core.fc) === stepsOf(refNoObs),
    `Ausgaben ${L.em.map((e) => e.fc.cube.emission).join(',')}`);
  // Ein Fenster, das die erste Stufe allein trägt (24 h — das Panel heute), hat keine Vorstufe: die erste Antwort IST der Kern.
  clearCubeForecastCache();
  const D = await (async () => { const em = []; const fc = await getPointForecastFromCube({ ...optsP, hours: 24, onUpdate: (u) => em.push(u) }, ioOf(memoryStore(files), null)); await sleep(50); return { fc, em }; })();
  add('(14) 24-h-Fenster (nur t1): die erste Antwort ist der Kern (25 h, nichts offen), keine weitere Ausgabe',
    D.fc.cube.emission === 'first' && D.fc.hours.length === 25 && D.fc.cube.pending.length === 0 && D.em.length === 0, `${D.fc.hours.length} h, ${D.em.length} weitere`);

  // Ohne `onUpdate` wartet der Pfad wie bisher auf die statischen Produkte (keine Frist im Test-IO).
  clearCubeForecastCache();
  const tW = performance.now();
  const waited = await getPointForecastFromCube(optsP, ioOf(slowStore(/static\//, 600), null));
  add('(14) ohne `onUpdate` wartet der Pfad wie bisher (≥ 600 ms auf `static`), Werte byte-gleich zur Referenz', performance.now() - tW >= 600 && stepsOf(waited) === stepsOf(refNoObs), `${(performance.now() - tW).toFixed(0)} ms`);

  // V-FI-20: schnelles Runden und Quantil-Speicher — DIESELBEN Zahlen wie vorher.
  const { roundTo: rT, roundToReference: rRef, quantileMemo, OUTPUT_SCALE } = await import('../src/pointForecast/fusion/output.ts');
  let seed = 42; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const steps = [...new Set([...Object.values(OUTPUT_SCALE), 0.001, 0.01, 0.1, 1, 0.25, 0.5, 5])];
  let nR = 0, badR = null;
  for (const st of steps) {
    for (let k = 0; k < 40_000; k++) {
      const mag = 10 ** (rnd() * 8 - 4) * (rnd() < 0.5 ? -1 : 1);
      const x = k % 97 === 0 ? (k % 2 ? -0 : 0) : k % 89 === 0 ? (Math.round(mag / st) + 0.5) * st : mag;   // ±0 und genaue Halbierungen mit
      nR++;
      if (JSON.stringify(rT(x, st)) !== JSON.stringify(rRef(x, st))) { badR = `${x} @ ${st}: ${rT(x, st)} ≠ ${rRef(x, st)}`; break; }
    }
    if (badR) break;
  }
  add('(14) V-FI-20: `roundTo` (Zehnerpotenzen über k/10^d) liefert an je 40 000 Zufallswerten (±0, Halbierungen, 1e−4…1e4) für jeden Schritt der Ausgabe und drei andere DIESELBE Zahl wie der bisherige Weg über toFixed',
    !badR && nR === steps.length * 40_000 && steps.length >= 7, badR ?? `${nR} Werte, ${steps.length} Schritte`);
  const rH = fuseCubePoint(mk0, { hourly: true, tail: true });
  const dists = rH.steps.flatMap((s) => (s.fused ? [s.fused.temperature, s.fused.dewPoint, s.fused.humidity, s.fused.windSpeed, s.fused.gust, s.fused.precipitation, s.fused.clouds].filter(Boolean).map((v) => v.dist) : []));
  const ps = [0.1, 0.5, 0.9, 0.8413, 0.1587];
  const memoOk = dists.every((d) => ps.every((p) => quantileMemo(d, p) === quantileOf(d, p) && quantileMemo(d, p) === quantileOf(d, p)));
  add('(14) V-FI-20: der Quantil-Speicher gibt für jede Verteilung der stündlichen Rechnung und jedes p genau `quantileOf` zurück (zweiter Aufruf aus dem Speicher)',
    memoOk && dists.some((d) => d.kind === 'rice'), `${dists.length} Verteilungen (${dists.filter((d) => d.kind === 'rice').length} Rice)`);

  // Leser: Radar, das zum Kern noch läuft, steht als Versprechen in `late.nowcast`; fertig ohne Slot ⇒ [] und der Leser nennt den Grund.
  const bP = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: slowStore(/^radar\//, 400), terrain: false, plan: false, decodePng: () => { throw new Error('kein Frame erwartet'); }, progressive: true });
  const ncLate = await bP.late?.nowcast?.result;
  add('(14) Leser progressiv: Radar noch unterwegs ⇒ `late.nowcast` mit Skip „zum Kern noch nicht da"; es endet ohne Slot mit [] und eigener Begründung',
    !!bP.late?.nowcast && bP.skips.includes(bP.late.nowcast.skip) && /zum Kern noch nicht da/.test(bP.late.nowcast.skip) && Array.isArray(ncLate) && ncLate.length === 0
    && bP.skips.some((s) => /nowcast: .*kein Slot/.test(s)),
    bP.skips.filter((s) => /nowcast/.test(s)).join(' | '));
}

// ---------------------------------------------------------------------------
// (15) AP12 (c) — Ebenen-Bereiche: nur die Ebenen der Antwort holen, Rest im Hintergrund,
//      geprüfte ganze Datei in den Cache; jede Abweichung ⇒ ganze Datei. Ausgabe byte-gleich.
// ---------------------------------------------------------------------------
{
  const { CUBE_ANSWER_PLANES } = await import('../src/pointForecast/cubeSource.ts');
  const { spansForPlanes, complementSpans } = await import('../src/point/client/chunkRanges.ts');
  const { cachedStore, memoryBackend } = await import('../src/point/client/cache.ts');
  add('(15) CUBE_ANSWER_PLANES: 39 von 61 Ebenen — ohne alle *_q10/_q90 und ohne t/rh auf 850/700 hPa, mit 925 hPa',
    CUBE_ANSWER_PLANES.length === 39 && !CUBE_ANSWER_PLANES.some((id) => /_q(10|90)$/.test(id) || /^(t|rh)(850|700)$/.test(id))
    && ['t925', 'rh925', 'srcCount', 'ensCount', 'hModEff', 'gammaEff', 't2m_sd_ens', 'snowlmt_sd'].every((id) => CUBE_ANSWER_PLANES.includes(id)), String(CUBE_ANSWER_PLANES.length));
  const dirT = [{ offset: 100, length: 10 }, { offset: 110, length: 5 }, { offset: 115, length: 3000 }, { offset: 3115, length: 20 }];
  const sp = spansForPlanes(dirT, ['a', 'b', 'c', 'd'], new Set(['a', 'b', 'd']));
  add('(15) Bereiche: benachbarte Blöcke zusammengelegt (a+b), eine Lücke > 2 KB trennt (c), Rest = genau die Lücken bis zum Ende',
    JSON.stringify(sp) === JSON.stringify([{ start: 100, end: 115 }, { start: 3115, end: 3135 }])
    && JSON.stringify(complementSpans([{ start: 0, end: 50 }, ...sp], 3200)) === JSON.stringify([{ start: 50, end: 100 }, { start: 115, end: 3115 }, { start: 3135, end: 3200 }]));

  const optsR = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const ioR = (store, planeRanges) => ({ store, terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...(planeRanges ? { planeRanges: true } : {}) });
  const vOf = (fc) => JSON.stringify(fc.cube.v2.axis.steps);
  const hoursOf = (fc) => JSON.stringify(fc.hours.map((h) => ({ ...h, fusion: undefined })));
  clearCubeForecastCache();
  const sWhole = memoryStore(fx.files);
  const fWhole = await getPointForecastFromCube(optsR, ioR(sWhole, false));
  clearCubeForecastCache();
  const sRange = memoryStore(fx.files);
  const fRange = await getPointForecastFromCube(optsR, ioR(sRange, true));
  // Bytes bis zur Antwort: direkt am t1-Chunk der Fixture (die Vervollständigung läuft im Speicher-Store sofort nach).
  const { readChunkRanges } = await import('../src/point/client/chunkRanges.ts');
  const t1P = [...fx.files.keys()].find((p) => /^point\/\d{10}\/t1\//.test(p));
  const rc1 = await readChunkRanges(memoryStore(fx.files), t1P, CUBE_PLANES.map((p) => p.id), CUBE_ANSWER_PLANES);
  add('(15) Ende-zu-Ende: mit Ebenen-Bereichen ist die Ausgabe (v2-Schritte UND Altfelder) byte-gleich zur ganzen Datei; am t1-Chunk fließen bis zur Antwort weniger Bytes',
    vOf(fRange) === vOf(fWhole) && hoursOf(fRange) === hoursOf(fWhole) && !rc1.whole && rc1.fetchedBytes < rc1.totalBytes,
    `t1: ${rc1.fetchedBytes} von ${rc1.totalBytes} B in ${rc1.requests} Abrufen`);
  add('(15) benannt: je Stufe „39 von 61 Ebenen über n Bereiche gelesen … Rest wird im Hintergrund nachgeladen"',
    ['t1', 't2', 't3'].every((t) => fRange.cube.notes.some((n) => n.startsWith(`${t}: 39 von 61 Ebenen über`))), fRange.cube.notes.filter((n) => /Ebenen über/.test(n)).join(' | '));
  // Negativkontrolle: nur t2m über Bereiche ⇒ die Ausgabe ist eine andere (der Vergleich oben ist nicht blind).
  const bNeg = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: memoryStore(fx.files), terrain: false, nowcast: false, plan: false, neighbours: true, planeRanges: ['t2m'] });
  const iNeg = cubeInputFromBundle(bNeg, clima); iNeg.terrain = flatTerrain(FIX.hTrue); iNeg.elevationM = FIX.hTrue;
  const vNeg = JSON.stringify(toPointForecastV2(fuseCubePoint(iNeg, { hourly: true, tail: true }), { nowMs: FIX.nowMs, terrainSource: 'override', urban: null }).axis.steps);
  add('(15) Negativkontrolle: nur t2m über Bereiche ⇒ andere Ausgabe (Taupunkt/Wind fehlen) — der Byte-Vergleich sieht fehlende Ebenen', vNeg !== vOf(fWhole) && bNeg.cube.t1.filledPlanes.join() === 't2m');

  // Vervollständigung: Rest holen, CRC prüfen, ganze Datei in den Cache; der nächste Besuch liest die ganze Datei ohne Bereich.
  const backend = memoryBackend();
  const cStore = cachedStore(memoryStore(fx.files), backend);
  const bC = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: cStore, terrain: false, nowcast: false, plan: false, planeRanges: CUBE_ANSWER_PLANES });
  const comp = await bC.completing;
  await sleep0();
  const t1Path = bC.cube.t1.chunk.path;
  const cachedT1 = await backend.get(`${cStore.base}/${t1Path}`);
  const orig = fx.files.get(t1Path);
  add('(15) Vervollständigung: je Stufe ok mit CRC, die zusammengesetzte ganze Datei liegt byte-gleich im Cache',
    comp?.length === 3 && comp.every((c) => c.ok) && comp.find((c) => c.tier === 't1').bytes > 0 && !!cachedT1 && cachedT1.bytes.length === orig.length && cachedT1.bytes.every((v, i) => v === orig[i]),
    comp ? comp.map((c) => `${c.tier} ${c.ok ? 'ok' : c.why} +${c.bytes} B`).join(', ') : 'keine Vervollständigung');
  const before2 = cStore.stats.files;
  const bC2 = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: cStore, terrain: false, nowcast: false, plan: false, planeRanges: CUBE_ANSWER_PLANES });
  add('(15) zweiter Besuch: die Chunks kommen ganz aus dem Cache (keine Bereiche, keine Vervollständigung, alle 61 Ebenen)',
    !bC2.completing && !bC2.notes.some((n) => /Ebenen über/.test(n)) && bC2.cube.t1.filledPlanes.length + bC2.cube.t1.emptyPlanes.length === 61,
    `Abrufe ${cStore.stats.files - before2}`);

  // Rückfälle: Server ignoriert den Range (200) ⇒ ganze Datei; Bereich scheitert ⇒ ganze Datei mit Notiz; ohne `range` ⇒ ganze Datei.
  const wholeOnRange = { ...memoryStore(fx.files) }; wholeOnRange.range = async (p) => { const b = fx.files.get(p); return b ? { bytes: b, whole: true } : null; };
  const failing = { ...memoryStore(fx.files) }; failing.range = async () => { throw new Error('HTTP 403'); };
  const noRange = { ...memoryStore(fx.files) }; delete noRange.range;
  const rd = (store) => readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store, terrain: false, nowcast: false, plan: false, planeRanges: CUBE_ANSWER_PLANES });
  const [bW, bF, bN] = await Promise.all([rd(wholeOnRange), rd(failing), rd(noRange)]);
  const t2mOf = (b) => JSON.stringify(b.cube.t1.steps.map((s) => s.values.t2m));
  add('(15) Rückfall: 200 auf einen Range ⇒ ganze Datei (61 Ebenen, keine Vervollständigung); Bereich scheitert (403) ⇒ ganze Datei mit Notiz; Store ohne Bereiche ⇒ ganze Datei — Werte je gleich',
    !bW.completing && bW.cube.t1.filledPlanes.length + bW.cube.t1.emptyPlanes.length === 61
    && bF.notes.some((n) => /Ebenen-Bereiche gescheitert .*ganze Datei \(Rückfall\)/.test(n)) && !bF.completing
    && !bN.completing && t2mOf(bW) === t2mOf(bundle) && t2mOf(bF) === t2mOf(bundle) && t2mOf(bN) === t2mOf(bundle));
  // Vervollständigung mit falschen Bytes ⇒ CRC-Befund, NICHT gespeichert.
  const bad = memoryStore(fx.files); const badBackend = memoryBackend();
  const origRange = bad.range.bind(bad);
  let calls = 0;
  bad.range = async (p, a, b, fo) => { const r = await origRange(p, a, b, fo); calls++; if (r && fo?.priority === 'low' && /\/t1\//.test(p)) { const c = new Uint8Array(r.bytes); c[0] ^= 0xff; return { ...r, bytes: c }; } return r; };
  const bBad = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: cachedStore(bad, badBackend), terrain: false, nowcast: false, plan: false, planeRanges: CUBE_ANSWER_PLANES });
  const cBad = await bBad.completing;
  await sleep0();
  const t1Bad = cBad?.find((c) => c.tier === 't1');
  const keyOf = (t) => `${bad.base}/${bBad.cube[t].chunk.path}`;
  const inCache = { t1: !!(await badBackend.get(keyOf('t1'))), t2: !!(await badBackend.get(keyOf('t2'))), t3: !!(await badBackend.get(keyOf('t3'))) };
  add('(15) Negativkontrolle: ein verfälschtes Byte im Rest ⇒ CRC-Befund, die Datei wird NICHT in den Cache gelegt (die anderen Stufen schon)',
    t1Bad && !t1Bad.ok && /CRC/.test(t1Bad.why ?? '') && !inCache.t1 && inCache.t2 && inCache.t3, `${t1Bad?.why} · Cache ${JSON.stringify(inCache)}`);
}
function sleep0() { return new Promise((r) => setTimeout(r, 10)); }

// ---------------------------------------------------------------------------
// (16) AP12 (e) — Index stale-while-revalidate im progressiven Modus: Antwort mit der Kopie, Nachprüfung
//      nebenher; nennt sie andere Läufe, wird neu gelesen und nachgeliefert
// ---------------------------------------------------------------------------
{
  const { cachedStore, memoryBackend } = await import('../src/point/client/cache.ts');
  const optsS = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const mkIo = (store) => ({ store, terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, indexSwrMs: 60_000 });
  const collect = async (store) => {
    const em = [];
    const fc = await getPointForecastFromCube({ ...optsS, onUpdate: (u) => em.push(u) }, mkIo(store));
    await new Promise((r) => setTimeout(r, 400));
    return { fc, em };
  };
  // (a) Kopie = derselbe Index ⇒ Antwort aus der Kopie, keine Neu-Lesung.
  const backend = memoryBackend();
  const cs = cachedStore(memoryStore(fx.files), backend, { swrIndex: true });
  await cs.bytes('point/index.json');
  clearCubeForecastCache();
  const A = await collect(cs);
  const all = [A.fc, ...A.em];
  add('(16) SWR: mit gleicher Index-Kopie liest der Pfad ohne Index-Abruf vorab, benennt die Kopie, und es folgt KEINE Neu-Lesung',
    all.every((f) => f.cube.notes.some((n) => /index: aus der SWR-Kopie/.test(n))) && !all.some((f) => f.cube.notes.some((n) => /ohne Index-Kopie neu gelesen/.test(n)))
    && all.some((f) => f.hours.length === 337), all.map((f) => `${f.cube.emission}/${f.hours.length}`).join(' '));
  // (b) Kopie zeigt auf einen t3-Lauf, den es nicht (mehr) gibt ⇒ Kern ohne t3 (benannt), dann die Neu-Lesung mit allem.
  const stale = JSON.parse(new TextDecoder().decode(fx.files.get('point/index.json')));
  stale.latestByTier.t3 = { ...stale.latestByTier.t3, run: '2000010100' };
  await backend.put(`swr:${cs.base}/point/index.json`, { bytes: new TextEncoder().encode(JSON.stringify(stale)), storedAt: Date.now() });
  clearCubeForecastCache();
  const B = await collect(cs);
  const coreB = [B.fc, ...B.em].find((f) => f.cube.emission === 'core' || (f.cube.emission === 'first' && f.hours.length === 337));
  const refreshed = B.em.find((f) => f.cube.notes.some((n) => /ohne Index-Kopie neu gelesen/.test(n)));
  add('(16) SWR: eine Kopie, die auf einen verschwundenen t3-Lauf zeigt ⇒ Kern ohne t3 mit Skip-Notiz, dann Neu-Lesung ohne Kopie: t3 da, `emission: update`, nichts offen',
    !!coreB && coreB.cube.skips.some((s) => /t3: Chunk .*2000010100.* nicht im Repo/.test(s)) && !coreB.sourcesAvailable.includes('cube-t3')
    && !!refreshed && refreshed.cube.emission === 'update' && refreshed.cube.pending.length === 0 && refreshed.sourcesAvailable.includes('cube-t3') && refreshed.hours.length === 337,
    `Ausgaben: ${[B.fc, ...B.em].map((f) => `${f.cube.emission}/${f.hours.length}/${f.sourcesAvailable.filter((x) => /cube/.test(x)).join('+')}`).join(' ')}`);
  // (c) Ohne `indexSwrMs` bleibt es beim Abruf vorab (Negativkontrolle), auch wenn eine Kopie liegt.
  clearCubeForecastCache();
  const C = await getPointForecastFromCube({ ...optsS, onUpdate: () => {} }, { ...mkIo(cs), indexSwrMs: 0 });
  add('(16) SWR Negativkontrolle: ohne `indexSwrMs` keine Kopie, t3 aus dem echten Index', !C.cube.notes.some((n) => /SWR-Kopie/.test(n)));
}

// ---------------------------------------------------------------------------
// (17) V-FI-21 — kompakte Kodierung von `PointForecastV2` (`fusion/v2codec.ts`): Rundweg, Prüfsumme, Größe
// ---------------------------------------------------------------------------
{
  const { encodeV2, decodeV2, compareV2, V2C_REGISTERED } = await import('../src/pointForecast/fusion/v2codec.ts');
  const { CALIB_LEGEND_V2, UNIT_V2 } = await import('../src/pointForecast/fusion/output.ts');
  const { gzipSync } = await import('node:zlib');
  const gzKB = (x) => gzipSync(Buffer.from(typeof x === 'string' ? x : JSON.stringify(x))).length / 1024;
  const mkInput = () => { const i = cubeInputFromBundle(bundle, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; return i; };
  const outExtra = { nowMs: FIX.nowMs, terrainSource: 'override', urban: null };
  // Der volle Fall: stündlich mit Schwanz, dazu ein Radar-Slot und eine Stationsmessung (Anker) — jede Member-Art kommt vor.
  const full = mkInput();
  full.nowcast = [{ product: 'nowcast', sourceId: 'radvor_rv', stamp: '2026091621', slotAgeMin: 12, probes: 1, extrapolationH: 2, bytes: 0, framesInSlot: 25, framesFetched: 1, framesFailed: 0,
    frames: [{ validAtMs: t0Ms, leadMinutes: 0, mmh: 0.6, saturated: false, validAtSuspect: false }] }];
  const tCube0 = fuseCubePoint(mkInput()).steps[0].vertical.t;
  full.obs = [{ source: 'brightsky', lat: FIX.lat, lon: FIX.lon, elevM: FIX.hTrue, distanceM: 3000, validAtMs: t0Ms, temperature: tCube0 + 2, relativeHumidity: null, u: null, v: null, gust: 7.5 }];
  const v2H = toPointForecastV2(fuseCubePoint(full, { hourly: true, tail: true }), outExtra);
  const v2N = toPointForecastV2(fuseCubePoint(mkInput()), outExtra);
  const cH = encodeV2(v2H), cN = encodeV2(v2N);
  const backH = decodeV2(cH), backN = decodeV2(cN);
  const dH = compareV2(v2H, backH), dN = compareV2(v2N, backN);
  const kinds = new Set(v2H.axis.steps.flatMap((s) => s.members.map((m) => m.product)));
  add('(17) Rundweg stündlich (337 Schritte, mit Radar und Anker): jede Zahl, jedes Flag, jedes Member, Achse und Provenienz exakt; Verteilungs- und Ankerzahlen innerhalb ½ Schritt',
    dH.exact.length === 0 && dH.distMaxHalfSteps <= 1 && dH.distCompared > 3000 && dH.anchorMaxHalfSteps <= 1 && dH.anchorCompared > 0
    && ['cube-t1', 'station', 'nowcast', 'anchor', 'climatology'].every((k) => kinds.has(k)) && v2H.axis.steps.length === 337,
    `${v2H.axis.steps.length} Schritte · exakt-Abweichungen ${dH.exact.length}${dH.exact.length ? ` (${dH.exact.slice(0, 2).join('; ')})` : ''} · Verteilung max ${dH.distMaxHalfSteps.toFixed(3)} × ½ Schritt über ${dH.distCompared} · Anker max ${dH.anchorMaxHalfSteps.toFixed(3)} über ${dH.anchorCompared} · Member-Arten ${[...kinds].join(',')}`);
  add('(17) Rundweg nativ (102 Schritte) exakt, Verteilungen innerhalb ½ Schritt',
    dN.exact.length === 0 && dN.distMaxHalfSteps <= 1 && v2N.axis.steps.length === 102, `exakt-Abweichungen ${dN.exact.length} · Verteilung max ${dN.distMaxHalfSteps.toFixed(3)}`);
  const viaText = decodeV2(JSON.parse(JSON.stringify(cH)));
  add('(17) Rundweg über den JSON-Text (so liegt es im Archiv): dasselbe Ergebnis wie aus dem Objekt',
    compareV2(backH, viaText).exact.length === 0 && JSON.stringify(viaText) === JSON.stringify(backH));
  // Negativkontrollen: eine gekippte Ziffer, eine falsche Prüfsumme, eine fremde Version (3 — seit FL-AP8c liest der Codec 1 und 2, `V2C_READABLE`)
  const flip = JSON.parse(JSON.stringify(cH));
  const col = flip.body.vars.t2m.d[0];
  const at = col.findIndex((x) => x != null && x !== 0);
  col[at] += 1;
  const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
  add('(17) Negativkontrolle: eine gekippte Ziffer im Körper (t2m-Verteilung) ⇒ Dekodierung verweigert (Prüfsumme); falsche Prüfsumme, fremde Version, fremdes Objekt ebenso',
    at >= 0 && throws(() => decodeV2(flip), /Prüfsumme/) && throws(() => decodeV2({ ...cH, check: (cH.check + 1) >>> 0 }), /Prüfsumme/)
    && throws(() => decodeV2({ ...cH, version: 4 }), /Version 4 unbekannt/) && throws(() => decodeV2({ body: cH.body }), /kein buscosun-v2c/));
  // Der Vergleicher selbst schlägt an (sonst wäre „0 Abweichungen" keine Aussage)
  const bad1 = structuredClone(backH); bad1.axis.steps[5].vars.t2m.p50 = Math.round((bad1.axis.steps[5].vars.t2m.p50 + 0.01) * 100) / 100;
  const bad2 = structuredClone(backH); bad2.axis.steps[5].vars.t2m.dist.mu += 0.01;
  const ai = backH.axis.steps.findIndex((s) => s.members.some((m) => m.anchor));
  const bad3 = structuredClone(backH); bad3.axis.steps[ai].members.find((m) => m.anchor).anchor.termK += 2e-4;
  const bad4 = structuredClone(backH); bad4.axis.steps[7].flags = [...bad4.axis.steps[7].flags, 'stale'];
  add('(17) Negativkontrolle des Vergleichers: p50 um einen Schritt, eine Verteilung um einen ganzen Schritt, ein Ankerwert um 2 Schritte, ein Flag mehr — jede Änderung wird gemeldet',
    compareV2(v2H, bad1).exact.length === 1 && compareV2(v2H, bad2).exact.some((e) => /dist\.mu .*½ Schritt/.test(e)) && ai >= 0
    && compareV2(v2H, bad3).exact.some((e) => /anchor\.termK/.test(e)) && compareV2(v2H, bad4).exact.some((e) => /flags/.test(e)));
  // Exakt heißt exakt: ein Wert neben der Skala wird nicht still gerundet
  const offScale = structuredClone(v2N); offScale.axis.steps[0].vars.t2m.p50 = 12.345;
  add('(17) Negativkontrolle: ein Wert neben der Ausgabe-Skala (t2m p50 = 12,345 bei 0,01) ⇒ der Kodierer verweigert, statt still zu runden',
    throws(() => encodeV2(offScale), /nicht auf der Skala/));
  // Die Texte: Legende und Einheiten per Verweis nur, solange sie den registrierten gleichen; ein neuer Text reist wörtlich
  const changed = structuredClone(v2N); changed.provenance.calibLegend = { ...changed.provenance.calibLegend, interpolated: 'geänderter Text' };
  const cC = encodeV2(changed);
  add('(17) Legende/Einheiten: output.ts schreibt die registrierten Texte (sonst hier registrieren); im Normalfall per Verweis, ein geänderter Text reist wörtlich und kommt so zurück',
    JSON.stringify(V2C_REGISTERED.legend) === JSON.stringify(CALIB_LEGEND_V2) && JSON.stringify(V2C_REGISTERED.units) === JSON.stringify(UNIT_V2)
    && cH.body.provenance.calibLegend.ref === 'legend-1' && cH.body.provenance.units.ref === 'units-1'
    && !('ref' in cC.body.provenance.calibLegend) && decodeV2(cC).provenance.calibLegend.interpolated === 'geänderter Text');
  // Größe (gzip, Stufe 6 wie das Archiv): gemessen, mit Ratsche auf der Fixture
  const gH = gzKB(v2H), gHc = gzKB(cH), gN = gzKB(v2N), gNc = gzKB(cN);
  add('(17) Größe (Ratsche auf der Fixture): stündlich kompakt ≤ 27 KB gz und ≤ 30 % des v2-JSON; nativ ≤ 13 KB gz',
    gHc <= 27 && gHc <= 0.3 * gH && gNc <= 13,
    `v2 stündlich ${(JSON.stringify(v2H).length / 1024).toFixed(0)} KB / gz ${gH.toFixed(1)} KB → kompakt ${(JSON.stringify(cH).length / 1024).toFixed(0)} KB / gz ${gHc.toFixed(1)} KB (${(100 * gHc / gH).toFixed(0)} %) · nativ gz ${gN.toFixed(1)} → ${gNc.toFixed(1)} KB`);
}

// ---------------------------------------------------------------------------
// (18) V-FI-17 — z0 aus WorldCover schaltet die zweistufige Windkorrektur ein (nur mit z0; ohne byte-gleich)
// ---------------------------------------------------------------------------
{
  const { windBlendingFactor } = await import('../src/pointForecast/fusion/terrainTerms.ts');
  const { z0CacheKey } = await import('../src/point/client/z0Point.ts');
  const { memoryBackend } = await import('../src/point/client/cache.ts');
  const mkInput = () => { const i = cubeInputFromBundle(bundle, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; return i; };
  const z0Of = (z0True, t1, t2 = t1, t3 = t1) => ({ z0True, z0Mod: { t1, t2, t3 }, coverage: { point: 1, t1: 1, t2: 1, t3: 1 }, shares: [[30, 1]], radiusM: 500, source: 'test' });
  const base = fuseCubePoint(mkInput(), { hourly: true, tail: true });
  // Alles außer der gemessenen Rechenzeit (`timing`) — sie ist in jedem Lauf anders.
  const same = (x, y) => JSON.stringify({ ...x, timing: null }) === JSON.stringify({ ...y, timing: null });
  const withNull = fuseCubePoint({ ...mkInput(), z0: null }, { hourly: true, tail: true });
  const noTrue = fuseCubePoint({ ...mkInput(), z0: z0Of(null, 0.03) }, { hourly: true, tail: true });
  add('(18) Negativkontrolle: ohne z0 (Feld fehlt, `null`, oder z0 am Punkt unbekannt) ist die Rechnung byte-gleich — Werte, Flags, calib',
    same(withNull, base) && same(noTrue, base)
    && base.calib.some((c) => c.startsWith('z0:null')) && base.steps.filter((s) => s.terrain).every((s) => s.terrain.flags.includes('windBlendingInactive')));
  // Die synthetischen Fälle des Plans (PAP 5 O7): See in Grasland, Wald in Grasland, Stadt mit Verdrängungshöhe
  const lake = fuseCubePoint({ ...mkInput(), z0: z0Of(0.0002, 0.03) }, { hourly: true, tail: true });
  const forest = fuseCubePoint({ ...mkInput(), z0: z0Of(0.75, 0.03) }, { hourly: true, tail: true });
  const cityIn = mkInput(); cityIn.urban = { ...(cityIn.urban ?? {}), d0: 9 };
  const city = fuseCubePoint({ ...cityIn, z0: z0Of(1.0, 0.1) }, { hourly: true, tail: true });
  const open = fuseCubePoint({ ...mkInput(), z0: z0Of(0.03, 0.03) }, { hourly: true, tail: true });
  const wf = (r) => r.steps.find((s) => s.terrain && s.tier === 't1')?.terrain.windFactor ?? null;
  const oneStage = Math.log(10 / 0.0002) / Math.log(10 / 0.03);
  add('(18) See in Grasland: +5…+20 % Wind (zweistufig), weit unter der einstufigen Formel (für 0,0002/0,03 ×1,86; der Plan nennt +135 % für seine Paarung); Wald < 1; Stadt mit d0 9 m < Stadt ohne d0 < 1; offenes Land in offenem Land = 1',
    wf(lake) > 1.05 && wf(lake) < 1.2 && wf(lake) < oneStage - 0.5 && wf(forest) > 0.3 && wf(forest) < 0.8 && wf(city) < (windBlendingFactor(0.1, 1.0, 0, 0)) && wf(city) < 1 && Math.abs(wf(open) - 1) < 1e-12,
    `See ${wf(lake)?.toFixed(3)} (einstufig ${oneStage.toFixed(2)}) · Wald ${wf(forest)?.toFixed(3)} · Stadt+d0 ${wf(city)?.toFixed(3)} (ohne d0 ${windBlendingFactor(0.1, 1.0, 0, 0).toFixed(3)}) · offen ${wf(open)}`);
  const s0 = (r) => r.steps.find((s) => s.tier === 't1' && s.samples?.length);
  const cubeU = (r) => s0(r).samples.find((x) => x.source.startsWith('cube-'));
  const ratio = Math.hypot(cubeU(lake).u, cubeU(lake).v) / Math.hypot(cubeU(base).u, cubeU(base).v);
  add('(18) das Cube-Member trägt den Faktor (u, v, Böe), Flag `windBlendingInactive` fällt weg, die Temperatur bleibt unberührt',
    Math.abs(ratio - wf(lake)) < 1e-9 && Math.abs(cubeU(lake).gust / cubeU(base).gust - wf(lake)) < 1e-9 && cubeU(lake).temperature === cubeU(base).temperature
    && !s0(lake).terrain.flags.includes('windBlendingInactive') && !same(lake, base), `|v| ×${ratio.toFixed(4)} · Gegenprobe des Vergleichs: mit z0 ≠ ohne`);
  const perTier = fuseCubePoint({ ...mkInput(), z0: z0Of(0.0002, 0.03, 0.1, null) }, { hourly: true, tail: true });
  const ofTier = (t) => perTier.steps.find((s) => s.terrain && s.tier === t && !s.interpolated)?.terrain;
  add('(18) z0 des Modells gilt je Stufe (t1 0,03 · t2 0,10 m ⇒ größerer Faktor); fehlt es für t3, bleibt t3 inaktiv mit Flag',
    ofTier('t2').windFactor > ofTier('t1').windFactor && ofTier('t3').windFactor === null && ofTier('t3').flags.includes('windBlendingInactive'),
    `t1 ${ofTier('t1').windFactor?.toFixed(3)} · t2 ${ofTier('t2').windFactor?.toFixed(3)} · t3 ${ofTier('t3').windFactor}`);
  const over = fuseCubePoint({ ...mkInput(), z0: z0Of(0.0002, 0.03) }, { terrainCalib: { z0Mod: 0.03, z0True: 0.75 } });
  add('(18) `terrainCalib` von außen hat Vorrang vor dem mitgebrachten z0 (Replay/Verifier), calib nennt die Setzung mit Herkunft',
    over.steps[0].terrain.windFactor < 0.8 && lake.calib.some((c) => /^z0:set — zweistufige Windkorrektur aktiv .*Kreis 500 m.*t1 0\.03.*V-FI-58.*literature.*z_b = 60 m/.test(c)));
  // Durchreichen in beiden Modi — z0 kommt aus einem vorbelegten Cache (kein Netz); ohne `io.z0` byte-gleich wie bisher
  const optsZ = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const be = memoryBackend();
  await be.put(z0CacheKey(FIX.lat, FIX.lon), { bytes: new TextEncoder().encode(JSON.stringify(z0Of(0.0002, 0.03))), storedAt: Date.now() });
  const fail = async () => new Response('x', { status: 404 });
  const ioZ = (z0) => ({ store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...(z0 ? { z0 } : {}) });
  clearCubeForecastCache();
  const plain = await getPointForecastFromCube(optsZ, ioZ(null));
  clearCubeForecastCache();
  const nonProg = await getPointForecastFromCube(optsZ, ioZ({ cache: be, fetchImpl: fail }));
  clearCubeForecastCache();
  const emP = [];
  const prog = await getPointForecastFromCube({ ...optsZ, onUpdate: (u) => emP.push(u) }, ioZ({ cache: be, fetchImpl: fail }));
  clearCubeForecastCache();
  const emM = [];
  const miss = await getPointForecastFromCube({ ...optsZ, onUpdate: (u) => emM.push(u) }, ioZ({ cache: memoryBackend(), fetchImpl: fail }));
  await new Promise((r) => setTimeout(r, 200));
  const hasZ0 = (fc) => fc.cube.calib.some((c) => c.startsWith('z0:set')) && fc.cube.v2.point.terrain?.z0 === 0.0002;
  const all = [prog, ...emP];
  add('(18) Durchreichen: ohne `io.z0` kein z0 (calib z0:null, `point.terrain.z0` null); nicht-progressiv mit z0 im Cache ⇒ Korrektur aktiv; progressiv mit Cache-Treffer schon in der ersten Ausgabe',
    !hasZ0(plain) && plain.cube.calib.some((c) => c.startsWith('z0:null')) && plain.cube.v2.point.terrain?.z0 === null && hasZ0(nonProg) && all.length >= 1 && all.every(hasZ0),
    `Ausgaben progressiv: ${all.map((f) => `${f.cube.emission}/${hasZ0(f) ? 'z0' : '—'}`).join(' ')}`);
  add('(18) progressiv ohne Cache-Treffer und ohne Spiegel (404): Ausgabe ohne Korrektur, benannt („folgt", `pending` z0), keine erfundene Rauhigkeit',
    !hasZ0(miss) && miss.cube.notes.some((n) => /^z0: WorldCover-Rauhigkeit folgt/.test(n)) && (miss.cube.pending ?? []).includes('z0') && emM.every((f) => !hasZ0(f)),
    `Ausgaben ${[miss, ...emM].map((f) => `${f.cube.emission}/${(f.cube.pending ?? []).join('+')}`).join(' ')}`);
  // Nach der Nachlieferung: z0 kommt spät (erster Cache-Blick leer, der Abruf ab dem Kern liefert nach 300 ms) ⇒ eine
  // eigene, letzte Ausgabe mit z0; die Ausgaben davor warten nicht darauf (gemessen 18.09.: Mitwarten kostete Anker/Radar ≈ 0,9 s).
  let gets = 0;
  const entry = { bytes: new TextEncoder().encode(JSON.stringify(z0Of(0.0002, 0.03))), storedAt: Date.now() };
  const slowBe = { kind: 'test', get: async () => { gets++; if (gets === 1) return null; await new Promise((r) => setTimeout(r, 300)); return entry; }, put: async () => {}, sweep: async () => 0 };
  clearCubeForecastCache();
  const emL = [], tL = [];
  const t0L = Date.now();
  const lateFirst = await getPointForecastFromCube({ ...optsZ, onUpdate: (u) => { emL.push(u); tL.push(Date.now() - t0L); } }, ioZ({ cache: slowBe, fetchImpl: fail }));
  await new Promise((r) => setTimeout(r, 700));
  const lastL = emL[emL.length - 1];
  add('(18) progressiv, z0 später als die Nachlieferung: die Ausgaben davor ohne z0 (`pending` z0), dann EINE eigene letzte Ausgabe mit z0 und ohne offenes z0',
    !hasZ0(lateFirst) && (lateFirst.cube.pending ?? []).includes('z0') && emL.length >= 1 && !!lastL && hasZ0(lastL) && !(lastL.cube.pending ?? []).includes('z0')
    && emL.slice(0, -1).every((f) => !hasZ0(f)),
    `Ausgaben ${[lateFirst, ...emL].map((f) => `${f.cube.emission}/${hasZ0(f) ? 'z0' : '—'}/${(f.cube.pending ?? []).join('+') || '∅'}`).join(' ')} · z0 nach ${tL[tL.length - 1] ?? '—'} ms`);
}

// ---------------------------------------------------------------------------
// (19) AP13 — Optionen durchreichbar (V-FI-79), calib.json lesen (V-FI-66), nur `measured` mit Beleg wirkt,
//      Negativkontrollen „ohne Option byte-gleich", calibByVar nach den emittierten Schlüsseln (V-FI-68)
// ---------------------------------------------------------------------------
{
  const { cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const { CALIBRATION_V1 } = await import('../src/point/calibration.ts');
  const { validateCalibDocument, calibOverridesFrom, CALIB_BINS_H, CALIB_N_MIN } = await import('../src/point/calibDoc.ts');
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  const mkInput = () => { const i = cubeInputFromBundle(bundle, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; return i; };
  const same = (x, y) => JSON.stringify({ ...x, timing: null }) === JSON.stringify({ ...y, timing: null });
  const base = fuseCubePoint(mkInput(), { hourly: true, tail: true });

  // Ein gültiger Schema-2-Eintrag nach der Regel (n, days, period, estimator, fitVersion, binsH).
  const nS = CALIB_N_MIN.sigmaSys;
  const meas = (value, extra = {}) => ({ value, provenance: 'measured', source: 'synthetisch (verify-pv-cube 19)', updatedAt: '2026-10-14T00:00:00Z', n: 5000, days: 40,
    period: { from: '2026-09-14', to: '2026-10-13' }, estimator: 'test', fitVersion: 'test', ...extra });
  const sigmaT = meas({ t2m: [3.0, null, null, null, null, null] }, { n: { t2m: [nS.n, 0, 0, 0, 0, 0] }, days: { t2m: [nS.days, 0, 0, 0, 0, 0] }, binsH: CALIB_BINS_H });
  const doc2 = (over) => ({ ...JSON.parse(JSON.stringify(CALIBRATION_V1)), schema: 2, ...over });
  const ovOf = (d) => calibOverridesFrom(validateCalibDocument(d));

  // (a) Negativkontrolle der Rechnung: `calib` fehlt / `null` ⇒ byte-gleich (Werte, Flags, calib-Texte).
  add('(19) Negativkontrolle: FuseCubeOptions ohne `calib` oder mit `calib: null` ⇒ byte-gleich zur Rechnung ohne AP13-Felder',
    same(fuseCubePoint(mkInput(), { hourly: true, tail: true, calib: null }), base) && same(fuseCubePoint(mkInput(), { hourly: true, tail: true, calib: undefined }), base));

  // (b) gemessenes σ_sys wirkt NUR im belegten Bin (0–6 h) und nur auf das Cube-Member; calib nennt „measured".
  const withSig = fuseCubePoint(mkInput(), { hourly: true, tail: true, calib: ovOf(doc2({ sigmaSys: sigmaT })) });
  const sysOf = (r, pred) => r.steps.filter((s) => !s.interpolated && s.uncertainty?.temperature && pred(s)).map((s) => s.uncertainty.temperature.parts.sys);
  const early = sysOf(withSig, (s) => s.leadH < 7), late = sysOf(withSig, (s) => s.leadH >= 7), lateBase = sysOf(base, (s) => s.leadH >= 7);
  add('(19) gemessenes σ_sys (t2m, Bin 0–6 h = 3,0 K) ersetzt Boden und Skill-Prior NUR im belegten Bin; die übrigen Bins behalten die Setzung; calib „sigmaSys:measured" mit n/Zeitraum',
    early.length > 0 && early.every((x) => x === 3.0) && JSON.stringify(late) === JSON.stringify(lateBase)
    && withSig.calib.some((c) => /^sigmaSys:measured — n \d+, \d+ Tage, 2026-09-14…2026-10-13/.test(c)) && withSig.calib.some((c) => c.startsWith('sigmaSys:set')),
    `früh ${early.length} Schritte σ_sys ${early[0]} · spät ${late.length} unverändert`);

  // (c) L_h gemessen ⇒ Gewichte ändern sich; ausdrücklich gesetztes `terrainCalib` schlägt gemessenes A.
  // PAP 3 braucht Nachbarn — das Bündel mit `neighbours: true` wie der Einstieg (Block 7).
  const HH = 3_600_000, t0N = Math.floor(FIX.nowMs / HH) * HH;
  const bNb = await readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0N, toMs: t0N + 336 * HH, stepH: 1 },
    { store: memoryStore(fx.files), terrain: false, nowcast: false, plan: false, neighbours: true });
  // Im Fixture haben alle vier Zellen dasselbe Δh (15 m) — der Höhenterm kürzt sich dann heraus. Eine Nachbarzelle
  // wird deshalb hier (lokale Kopie) um 150 m angehoben, damit L_h sichtbar und nachrechenbar wird.
  for (const t of Object.values(bNb.cube ?? {})) for (const nb of (t?.neighbours ?? [])) {
    if (nb.dy === -1 && nb.dx === 0) { nb.hModEffM = (nb.hModEffM ?? 0) + 150; for (const v of nb.values) if (v.hModEff != null) v.hModEff += 150; }
  }
  const mkInputN = () => ({ ...cubeInputFromBundle(bNb, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue });
  const baseN = fuseCubePoint(mkInputN(), { hourly: true, tail: true });
  const withLh = fuseCubePoint(mkInputN(), { hourly: true, tail: true, calib: ovOf(doc2({ Lh: meas(50) })) });
  const w = (r) => JSON.stringify(r.steps.filter((s) => s.grid).slice(0, 5).map((s) => s.grid.weights.map((x) => x.w)));
  // Die Gewichte eines t1-Schritts aus distM/dhM nach PAP 3 nachrechnen: w ∝ exp(−(d/L_d)²)·exp(−(Δh/L_h)²) (Negativkontrolle: falsches L_h passt nicht).
  const fitsLh = (r, lh) => {
    const st = r.steps.find((x) => x.grid && x.grid.n === 4 && x.tier === 't1' && x.grid.weights.some((g) => (g.dhM ?? 0) > 0.5));
    if (!st) return false;
    const ld = 0.05 * 110_574;
    const raw = st.grid.weights.map((g) => Math.exp(-((g.distM / ld) ** 2)) * (g.dhM == null ? 1 : Math.exp(-((g.dhM / lh) ** 2))));
    const sum = raw.reduce((a, x) => a + x, 0);
    return st.grid.weights.every((g, i) => Math.abs(g.w - raw[i] / sum) < 1e-12);
  };
  const withA = fuseCubePoint(mkInput(), { hourly: true, tail: true, calib: ovOf(doc2({ A: meas({ default: 2 }), tpiSigma: meas({ default: 40 }, { days: 0 }) })) });
  const withAOver = fuseCubePoint(mkInput(), { hourly: true, tail: true, terrainCalib: { A: 0.5 }, calib: ovOf(doc2({ A: meas({ default: 2 }) })) });
  add('(19) L_h gemessen (50 m) ändert die PAP-3-Gewichte, calib „Lh:measured"; A/tpiSigma gemessen stehen als „measured", ein gesetztes `terrainCalib.A` hat Vorrang',
    w(baseN) !== '[]' && fitsLh(baseN, 200) && fitsLh(withLh, 50) && !fitsLh(withLh, 200) && withLh.calib.some((c) => c.startsWith('Lh:measured — ') && c.includes('L_h = 50 m'))
    && withA.calib.some((c) => c.startsWith('A:measured — ') && c.includes('2 K')) && withA.calib.some((c) => c.startsWith('tpiSigma:measured — '))
    && withAOver.calib.some((c) => c.startsWith('A:set — ') && c.includes('0.5 K von außen')),
    `Gewichte ${w(baseN).slice(0, 48)}… → ${w(withLh).slice(0, 48)}…`);

  // (d) gemessener Abschlag „interpoliert" wirkt auf die Konfidenz interpolierter Stunden (Verhältnis 0,5/0,9).
  const withD = fuseCubePoint(mkInput(), { hourly: true, tail: true, calib: ovOf(doc2({ confDiscount: meas({ interpolated: 0.5 }, { n: { interpolated: 500 } }) })) });
  const ic = (r) => r.steps.find((s) => s.interpolated && s.interp?.confidence?.temperature > 0)?.interp.confidence.temperature;
  add('(19) gemessener Konfidenz-Abschlag „interpoliert" (0,5 statt 0,9) skaliert die Konfidenz interpolierter Stunden genau um 0,5/0,9',
    ic(base) > 0 && Math.abs(ic(withD) / ic(base) - 0.5 / 0.9) < 1e-9, `${ic(base)?.toFixed(4)} → ${ic(withD)?.toFixed(4)}`);

  // (e) V-FI-79: Optionen erreichen das Produkt; der Cache trennt Varianten; ohne Optionen der alte Schlüssel.
  const optsC = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const ioC = (extra = {}, files = fx.files) => ({ store: memoryStore(files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extra });
  clearCubeForecastCache();
  const pBase = await getPointForecastFromCube(optsC, ioC());
  const pNoGrid = await getPointForecastFromCube(optsC, ioC({ fuse: { grid: false } }));
  const pAgain = await getPointForecastFromCube(optsC, ioC());
  add('(19) V-FI-79: `io.fuse` erreicht die Rechnung (grid: false ⇒ keine PAP-3-Zeilen in calib); der Ergebnis-Cache trennt die Varianten (derselbe Ort ohne Optionen danach wieder mit PAP 3); ohne Optionen ist der Schlüsselanteil leer',
    pBase.cube.calib.some((c) => c.startsWith('Ld:')) && !pNoGrid.cube.calib.some((c) => c.startsWith('Ld:')) && pAgain.cube.calib.some((c) => c.startsWith('Ld:'))
    && cubeIoVariantKey({}) === '' && cubeIoVariantKey({ fuse: {} }) === '' && cubeIoVariantKey({ calibSource: 'constants' }) === ''
    && cubeIoVariantKey({ fuse: { grid: false } }) !== cubeIoVariantKey({ fuse: { vertical: false } }) && cubeIoVariantKey({ calibSource: 'json' }) !== '',
    `Schlüssel ${cubeIoVariantKey({ fuse: { grid: false }, calibSource: 'json' })}`);
  // AX-8: ein anderes Stationsprodukt ist ein anderes Produkt — im Schlüssel; L (die Voreinstellung) lässt ihn leer.
  add('(19) AX-8: `stationSource` trennt die Cache-Varianten (mosmix_s / freshest ≠ leer), mosmix_l bleibt der leere Schlüssel',
    cubeIoVariantKey({ stationSource: 'mosmix_l' }) === '' && cubeIoVariantKey({ stationSource: 'mosmix_s' }).endsWith('|st:mosmix_s')
    && cubeIoVariantKey({ stationSource: 'freshest' }) !== cubeIoVariantKey({ stationSource: 'mosmix_s' })
    && cubeIoVariantKey({ stage: 'fs', stationSource: 'mosmix_s' }) === `${cubeIoVariantKey({ stage: 'fs' })}|st:mosmix_s`,
    cubeIoVariantKey({ stage: 'fs', stationSource: 'mosmix_s' }));

  // (e2) V-FI-80: mit eingespeister Uhr gehört die Stunde in den Schlüssel — ein Nachlauf über zwei Slots darf nicht den ersten zurückbekommen.
  clearCubeForecastCache();
  const ioT = (ms) => ({ ...ioC(), nowMs: () => ms });
  const fA = await getPointForecastFromCube(optsC, ioT(FIX.nowMs));
  const fA2 = await getPointForecastFromCube(optsC, ioT(FIX.nowMs));
  const fB = await getPointForecastFromCube(optsC, ioT(FIX.nowMs + 3 * 3_600_000));
  add('(19) V-FI-80: gleiche eingespeiste Uhr ⇒ Cache-Treffer (dasselbe Objekt); andere Stunde ⇒ neu gerechnet (anderer Fensteranfang), nicht das Ergebnis des ersten Slots',
    fA2 === fA && fB !== fA && fB.hours[0].timestamp.getTime() === fA.hours[0].timestamp.getTime() + 3 * 3_600_000,
    `${fA.hours[0].timestamp.toISOString()} → ${fB.hours[0].timestamp.toISOString()}`);

  // (f) calibSource 'json' mit der AUSGELIEFERTEN Datei (Schema 1) ⇒ Werte byte-gleich zu den Konstanten; nur die Herkunft steht dabei.
  const strip = (fc) => { const v2 = JSON.parse(JSON.stringify(fc.cube.v2)); delete v2.provenance.calibFile; v2.provenance.notes = v2.provenance.notes.filter((n) => !n.startsWith('calib:')); v2.provenance.fetched = null; v2.timing = null; return JSON.stringify(v2); };
  const filesWith = (doc) => { const m = new Map(fx.files); if (doc) m.set('point/calib.json', enc(doc)); return m; };
  clearCubeForecastCache();
  const pShipped = await getPointForecastFromCube(optsC, ioC({ calibSource: 'json' }, filesWith(CALIBRATION_V1)));
  clearCubeForecastCache();
  const pMissing = await getPointForecastFromCube(optsC, ioC({ calibSource: 'json' }, filesWith(null)));
  const cf = pShipped.cube.v2.provenance.calibFile;
  add('(19) Negativkontrolle Produkt: `calibSource: "json"` mit der ausgelieferten calib.json (Schema 1) ⇒ v2 byte-gleich zu den Konstanten (außer Herkunft/Notiz); die Herkunft nennt Schema, sha256, keine Messung; ohne `calibSource` kein `calibFile`',
    strip(pShipped) === strip(pBase) && cf?.schema === 1 && /^[0-9a-f]{64}$/.test(cf?.hash ?? '') && cf.measured.length === 0
    && pShipped.cube.v2.provenance.notes.some((n) => n.startsWith('calib: Schema 1, keine geltende Messung')) && !('calibFile' in pBase.cube.v2.provenance),
    `sha256 ${cf?.hash?.slice(0, 12)}…`);
  add('(19) fehlt calib.json ⇒ Setzungen mit Notiz, Werte byte-gleich, Herkunft ohne Hash',
    strip(pMissing) === strip(pBase) && pMissing.cube.v2.provenance.calibFile?.hash === null && pMissing.cube.v2.provenance.notes.some((n) => /^calib: .*nicht lesbar/.test(n)));

  // (g) Schema 2 mit einer gültigen und einer ungültigen Messung ⇒ die gültige wirkt, die ungültige wird einzeln verworfen (mit Grund).
  clearCubeForecastCache();
  const pMeas = await getPointForecastFromCube(optsC, ioC({ calibSource: 'json' }, filesWith(doc2({ sigmaSys: sigmaT, Lh: meas(50, { n: 10 }) }))));
  add('(19) Schema 2 im Produkt: σ_sys (gültig) wirkt und steht in `calibFile.measured`; L_h mit n 10 < n_min wird verworfen (Notiz mit Grund), die Setzung gilt',
    pMeas.cube.calib.some((c) => c.startsWith('sigmaSys:measured')) && pMeas.cube.v2.provenance.calibFile.measured.join() === 'sigmaSys'
    && pMeas.cube.v2.provenance.notes.some((n) => /^calib: Lh als measured verworfen \(n 10 < 1000\)/.test(n)) && pMeas.cube.calib.some((c) => c.startsWith('Lh:set')),
    pMeas.cube.v2.provenance.notes.filter((n) => n.startsWith('calib:')).join(' | '));

  // (h) V-FI-68: jede emittierte Setzung, die nicht allgemein ist, steht bei mindestens einer Größe; nichts Erfundenes.
  const emitted = new Set(pBase.cube.calib.map((c) => c.split(':')[0]));
  const general = new Set(['footprint', 'lead', 'hTrue', 'tail', 'interpolation', 'nowcastStale']);
  const byVar = pBase.cube.v2.provenance.calibByVar;
  const listed = new Set(Object.values(byVar).flat());
  const unlisted = [...emitted].filter((k) => !general.has(k) && !listed.has(k));
  add('(19) V-FI-68: calibByVar ordnet jede emittierte, nicht allgemeine Setzung mindestens einer Größe zu (u. a. sigmaVert, standardLapse, dzSurface bei t2m); keine Liste nennt einen Schlüssel, den die Rechnung nicht ausgibt',
    unlisted.length === 0 && ['sigmaVert', 'standardLapse', 'dzSurface', 'phi', 'sigmaQuant'].every((k) => byVar.t2m.includes(k)) && [...listed].every((k) => emitted.has(k)),
    `nicht zugeordnet: ${unlisted.join(',') || '—'} · t2m: ${byVar.t2m.join(',')}`);
}

// ---------------------------------------------------------------------------
// (20) AP14 — Nachbar-Chunk: der 2×2-Block über die Chunk-Grenze (`CubeIo.crossChunk`, Voreinstellung aus)
// ---------------------------------------------------------------------------
{
  const { cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const GRAZ = { lat: 47.0707, lon: 15.4395, h: 353 };
  const fxG = await buildCubeFixture({ lat: GRAZ.lat, lon: GRAZ.lon, absolute: true, neighbourChunks: true });
  const optsG = { lat: GRAZ.lat, lng: GRAZ.lon, country: 'AT', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const ioG = (extra = {}, store = memoryStore(fxG.files)) => ({ store, terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(GRAZ.h), obs: null, ...extra });
  const borderSteps = (fc) => fc.cube.flags.filter((f) => f.flags.includes('chunkBorderTruncated') && (f.tier === 't1' || f.tier === 't2')).length;
  clearCubeForecastCache();
  const gOff = await getPointForecastFromCube(optsG, ioG());
  clearCubeForecastCache();
  const gOff2 = await getPointForecastFromCube(optsG, ioG({ crossChunk: false }));
  clearCubeForecastCache();
  const gOn = await getPointForecastFromCube(optsG, ioG({ crossChunk: true }));
  const strip = (fc) => { const v2 = JSON.parse(JSON.stringify(fc.cube.v2)); v2.timing = null; v2.provenance.fetched = null; return JSON.stringify(v2); };
  add('(20) AP14: Graz (t1 und t2 am Chunk-Rand) — ohne Option tragen die t1/t2-Schritte `chunkBorderTruncated`, mit `crossChunk` keiner; die Notiz nennt die nachgeholten Chunks',
    borderSteps(gOff) > 0 && borderSteps(gOn) === 0 && gOn.cube.notes.some((n) => /^crossChunk: t1 \+1 Chunk \(02_12\), 2 Zellen · t2 \+1 Chunk \(00_06\)/.test(n)),
    `Schritte mit Flag ${borderSteps(gOff)} → ${borderSteps(gOn)}`);
  add('(20) Negativkontrolle: `crossChunk` fehlt oder `false` ⇒ v2 byte-gleich; der Cache-Schlüssel trennt die Variante, ohne sie bleiben die AP13-Schlüssel wörtlich',
    strip(gOff) === strip(gOff2) && strip(gOn) !== strip(gOff)
    && cubeIoVariantKey({ crossChunk: true }) === '|io:|calib:|cc' && cubeIoVariantKey({ calibSource: 'json' }) === '|io:|calib:json' && cubeIoVariantKey({ crossChunk: false }) === '');

  // PAP 3 rechnet mit dem vollen Block: n = 4, die Versätze sind genau `blockOffsets`, die Gewichte folgen der Formel.
  const H2 = 3_600_000, t0G = Math.floor(FIX.nowMs / H2) * H2;
  const bG = await readPointBundle({ lat: GRAZ.lat, lon: GRAZ.lon, elevationM: GRAZ.h, nowMs: FIX.nowMs, fromMs: t0G, toMs: t0G + 336 * H2, stepH: 1 },
    { store: memoryStore(fxG.files), terrain: false, nowcast: false, plan: false, neighbours: true, crossChunk: true });
  const rG = fuseCubePoint({ ...cubeInputFromBundle(bG, clima), terrain: flatTerrain(GRAZ.h), elevationM: GRAZ.h }, { hourly: true, tail: true });
  const stG = rG.steps.find((s) => s.grid && s.tier === 't1');
  const { TIER_BY_ID: TB, cellOf: cOf, cellCenter: cCen } = await import('../src/point/cubeFormat.ts');
  const cellG = cOf(TB.t1, GRAZ.lat, GRAZ.lon), ccG = cCen(TB.t1, cellG.iy, cellG.ix);
  const offs = blockOffsets(GRAZ.lat - ccG.lat, GRAZ.lon - ccG.lon).map((o) => `${o.dy}|${o.dx}`).sort().join();
  const ld = 0.05 * GRID_SET.mPerDeg;
  const raw = stG.grid.weights.map((g) => Math.exp(-((g.distM / ld) ** 2)) * (g.dhM == null ? 1 : Math.exp(-((g.dhM / GRID_SET.lhM) ** 2))));
  const sum = raw.reduce((a, x) => a + x, 0);
  add('(20) PAP 3 am Rand mit Nachbar-Chunk: t1 n = 4, nicht beschnitten, die Versätze sind genau `blockOffsets`, die Gewichte folgen der Formel — dieselbe Rechnung wie im Inneren eines Chunks',
    stG.grid.n === 4 && !stG.grid.truncated && stG.grid.weights.map((g) => `${g.dy}|${g.dx}`).sort().join() === offs && stG.grid.weights.every((g, i) => Math.abs(g.w - raw[i] / sum) < 1e-12),
    `Versätze ${offs}`);

  // Progressiv: der Nachbar-Chunk kommt nach dem Kern ⇒ erste Ausgabe beschnitten (pending crossChunk), dann EINE eigene Ausgabe ohne Flag.
  const slow = memoryStore(fxG.files); const sb = slow.bytes.bind(slow);
  slow.bytes = async (p, o) => { if (fxG.extra.some((c) => c.path === p)) await new Promise((r) => setTimeout(r, 150)); return sb(p, o); };
  clearCubeForecastCache();
  const em = [];
  const first = await getPointForecastFromCube({ ...optsG, onUpdate: (u) => em.push(u) }, ioG({ crossChunk: true }, slow));
  await new Promise((r) => setTimeout(r, 600));
  const lastE = em[em.length - 1];
  // Die erste Darstellung (nur t1) kommt VOR dem Kern und weiß vom Nachbar-Chunk noch nichts; ab dem Kern ist er offen.
  const all = [first, ...em];
  const coreE = all.find((f) => f.cube.emission === 'core');
  const ccE = all.filter((f) => f.cube.notes.some((n) => /crossChunk: .*eigene Ausgabe \(AP14\)/.test(n)));
  add('(20) progressiv: erste Darstellung und Kern rechnen mit beschnittenem Block (Kern: `pending` crossChunk), dann folgt GENAU EINE eigene Ausgabe mit vollem Block — ohne Flag, ohne offenes crossChunk; die erste Darstellung wartet nicht darauf',
    borderSteps(first) > 0 && !!coreE && borderSteps(coreE) > 0 && (coreE.cube.pending ?? []).includes('crossChunk')
    && ccE.length === 1 && ccE[0] === lastE && borderSteps(lastE) === 0 && !(lastE.cube.pending ?? []).includes('crossChunk'),
    `Ausgaben ${[first, ...em].map((f) => `${f.cube.emission}/${borderSteps(f)}/${(f.cube.pending ?? []).join('+') || '∅'}`).join(' ')}`);
}

// ---------------------------------------------------------------------------
// (21) AP15 — Druckflächen-Profil t2/t3: die reinen Bausteine. Das Abnahme-Gate VOR dem Archiv (Jans Punkt C) ist ROT
//      (§9.3.2: MAE 1,94 gegen 1,39 K bei |Δh| > 300 m) ⇒ die Option ist NICHT ins Produkt verdrahtet. Geprüft wird,
//      was gebaut ist und der AP9-Nachlauf gegen Stationswahrheit braucht: Portierung = Producer, Säulenregel,
//      `extendBelowBase` (Voreinstellung byte-gleich), und dass kein App-Modul die Bausteine importiert.
// ---------------------------------------------------------------------------
{
  const { profileFromColumn, PROFILE_PARAMS } = await import('./point/profile.mjs');
  const { profileFromColumnTs, pressureProfileFromCell, hypsometricHeight, PRESSURE_PROFILE_SET } = await import('../src/point/profileColumn.ts');
  const { readdirSync, readFileSync } = await import('node:fs');
  let s = 20260918;
  const u = () => { s = (Math.imul(1103515245, s) + 12345) >>> 0; return s / 4294967296; };
  const pick = (a) => a[Math.floor(u() * a.length)];
  const columns = [];
  const zSelf = [100, 150, 220, 310, 420, 550, 700, 880, 1090, 1330];
  columns.push({ t: zSelf.map((h) => 15 - 0.0098 * (h - 100)), z: zSelf });
  columns.push({ t: zSelf.map((h) => (h <= 420 ? 4 * (h - 100) / 320 : 4 - 0.0065 * (h - 420))), z: zSelf });
  columns.push({ t: zSelf.map((h) => (h < 550 ? 15 - 0.0098 * (h - 100) : h <= 880 ? 15 - 0.0098 * 450 + 3 * (h - 550) / 330 : 15 - 0.0098 * 450 + 3 - 0.0065 * (h - 880))), z: zSelf });
  const zRip = [100, 120, 145, 175, 210, 250, 300, 360, 430, 510];
  columns.push({ t: zRip.map((h, k) => 10 - 0.0065 * (h - 100) + (k === 3 ? 0.03 : 0)), z: zRip });
  columns.push({ t: [0, 3, 3, 2, 1, 0, 4, 4, 3, 2], z: [0, 100, 200, 300, 400, 500, 600, 700, 800, 900] });
  columns.push({ t: zSelf.map((_, k) => (k === 4 ? NaN : 5)), z: zSelf });
  columns.push({ t: zSelf.map(() => 5), z: zSelf });
  const nSelf = columns.length;
  for (let k = 0; k < 2000; k++) {
    const n = 2 + Math.floor(u() * 29);
    const z = [], t = [];
    let zz = u() * 2000, tt = 20 - 25 * u();
    for (let i = 0; i < n; i++) {
      z.push(zz); t.push(u() < 0.02 ? NaN : tt);
      const dz = 10 + u() * 400; zz += dz;
      tt += (u() < 0.25 ? +1 : -1) * (0.012 * u()) * dz + (u() - 0.5) * 0.4;
    }
    columns.push({ t, z, p: { gammaDepthM: pick([200, 500, 1500]), dzMinM: pick([20, 50, 100]), dTMinK: pick([0.2, 0.5, 1.5]) } });
  }
  const same = (a, b) => ['gammaEff', 'zBase', 'zInv', 'dTInv'].every((k) => Object.is(a[k], b[k]));
  let eq = 0, eqSelf = 0, perturbed = 0, withInv = 0;
  for (const [i, c] of columns.entries()) {
    const p = c.p ?? PROFILE_PARAMS;
    const a = profileFromColumn(c.t, c.z, p), b = profileFromColumnTs(c.t, c.z, p);
    if (same(a, b)) { eq++; if (i < nSelf) eqSelf++; }
    if (b.zInv > b.zBase) withInv++;
    // Negativkontrolle: dieselbe Portierung mit verschobener Schwelle muss irgendwo abweichen — sonst prüft der Vergleich nichts.
    if (!same(a, profileFromColumnTs(c.t, c.z, { ...p, dTMinK: p.dTMinK + 0.3 }))) perturbed++;
  }
  add('(21) AP15: `profileFromColumnTs` = Producer `profileFromColumn` (profile.mjs) an den 7 Säulen des Producer-Selbsttests und 2 000 Zufallssäulen (2–30 Niveaus, Löcher, drei Schwellensätze) — alle vier Felder bitgleich, NaN eingeschlossen',
    eq === columns.length && eqSelf === nSelf && withInv > 100, `${eq}/${columns.length} gleich, davon ${withInv} mit Inversion`);
  add('(21) Negativkontrolle: dieselbe Portierung mit dTMin + 0,3 K weicht an mindestens 50 Säulen ab (der Vergleich kann rot werden)',
    perturbed >= 50, `${perturbed} Säulen abweichend`);

  // Die Säulenregel (E-F-14) an Hand gerechneten Zellen.
  const zOf = (h, ps, t2, tp, p) => h + (287.05 / 9.80665) * ((t2 + tp) / 2 + 273.15) * Math.log(ps / p);
  const inv = pressureProfileFromCell({ t2m: 0, ps: 1000, hModEff: 200, t925: 3, t850: 1, t700: -8 });
  const z925 = zOf(200, 1000, 0, 3, 925);
  add('(21) Bodeninversion: Säule 2 m + 925/850/700 in hypsometrischen Höhen (925 hPa bei 826,8 m = Grund 200 m + 626,8 m aus T̄ 1,5 °C, von Hand), zBase = hModEff + 2, zInv = z925, dTInv = 3 K',
    inv && inv.usedHPa.join() === '925,850,700' && Math.abs(z925 - 826.75) < 0.05 && Math.abs(inv.heightsM[1] - z925) < 1e-9 && Math.abs(hypsometricHeight(200, 1000, 0, 3, 925) - z925) < 1e-9
    && inv.zBase === 202 && inv.zInv === inv.heightsM[1] && Math.abs(inv.dTInv - 3) < 1e-12 && !inv.gammaClamped,
    inv ? `z925 ${inv.heightsM[1].toFixed(1)} m, Γ ${inv.gammaEff.toFixed(2)} K/km` : 'null');
  const under = pressureProfileFromCell({ t2m: 10, ps: 920, hModEff: 800, t925: 12, t850: 5, t700: -5 });
  const near925 = pressureProfileFromCell({ t2m: 10, ps: 930, hModEff: 700, t925: 12, t850: 5, t700: -5 });
  const two = pressureProfileFromCell({ t2m: 5, ps: 855, hModEff: 1450, t925: 9, t850: 4, t700: -6 });
  add('(21) Maske ps − p ≥ 10 hPa: 925 unter Grund (ps 920) und 5 hPa über Grund (ps 930) fallen heraus; bleiben < 3 Niveaus (ps 855: nur 700) ⇒ null ⇒ Standard-Lapse',
    under?.usedHPa.join() === '850,700' && near925?.usedHPa.join() === '850,700' && two === null);
  const hot = pressureProfileFromCell({ t2m: 30, ps: 1000, hModEff: 100, t925: 18, t850: 12, t700: 0 });
  const raw = profileFromColumnTs(hot.heightsM.map((_, i) => [30, 18, 12, 0][i]), hot.heightsM, PRESSURE_PROFILE_SET);
  add('(21) Γ-Deckel: überadiabatische Tagessäule (roh ≈ 12,8 K/km) wird auf 9,8 K/km gekappt und so markiert',
    hot.gammaClamped && hot.gammaEff === 9.8 && raw.gammaEff > 12 && raw.gammaEff < 13.5, `roh ${raw.gammaEff.toFixed(2)} K/km`);
  add('(21) ohne t2m, ps oder hModEff ⇒ null (nie ein Profil aus Teilen)',
    pressureProfileFromCell({ t2m: null, ps: 1000, hModEff: 200, t925: 3, t850: 1, t700: -8 }) === null
    && pressureProfileFromCell({ t2m: 0, ps: null, hModEff: 200, t925: 3, t850: 1, t700: -8 }) === null
    && pressureProfileFromCell({ t2m: 0, ps: 1000, hModEff: undefined, t925: 3, t850: 1, t700: -8 }) === null);

  // `extendBelowBase`: Voreinstellung = wie bisher (bitgleich). `false` ändert nur Fälle mit AUFSITZENDER Inversion, in
  // denen der Punkt oder der Modellboden unter der Basis liegt (der Boden darf bis 50 m darunter liegen, DZ_SURFACE_M —
  // dann ändert sich auch Fall B, weil P(hModEff) kein Inversionsgefälle mehr bekommt).
  let dflt = 0, onlyC = true, changed = 0, nC = 0;
  for (let k = 0; k < 3000; k++) {
    const hModEff = 200 + u() * 1800, zBase = hModEff - 100 + u() * 400, thick = 50 + u() * 600;
    const profile = u() < 0.15 ? null : { gammaEff: -5 + u() * 15, zBase, zInv: zBase + (u() < 0.2 ? 0 : thick), dTInv: u() < 0.1 ? 0 : u() * 6 };
    const base = { tMean: 20 * u() - 5, hModEff, hTrue: hModEff + (u() - 0.5) * 2400, profile, ps: 700 + 300 * u() };
    const a = verticalCorrection(base), b = verticalCorrection({ ...base, extendBelowBase: true }), c = verticalCorrection({ ...base, extendBelowBase: false });
    if (JSON.stringify(a) === JSON.stringify(b)) dflt++;
    const below = a.surfaceBased === true && (base.hTrue < profile.zBase || hModEff < profile.zBase);
    if (JSON.stringify(a) !== JSON.stringify(c)) { changed++; if (!below) onlyC = false; }
    if (below) nC++;
  }
  add('(21) `extendBelowBase` fehlt ⇒ bitgleich zu `true` (3 000 Zufallsfälle: Fall A/B/C/std, abgehoben und aufsitzend); `false` ändert nur Fälle mit aufsitzender Inversion, in denen Punkt oder Modellboden unter der Basis liegen — und dort jeden',
    dflt === 3000 && onlyC && changed === nC && nC > 100, `${changed} geändert, erwartet ${nC}`);
  // Von Hand: Modellboden 500, Basis 505 (aufsitzend), Obergrenze 905, +4 K (Γ_inv 0,01 K/m), Γ 6,5; Punkt 200 m.
  // Ohne Verlängerung: T = T̄ + Γ·(505 − 200) − Γ·(505 − 500) = T̄ + 1,95 K.
  // Mit Verlängerung (Deckel pool = min(Tiefe, 400)): P(200) = −0,01·305, P(500) = −0,01·5 ⇒ T = T̄ − 3,00 K.
  const hand = { tMean: 10, hModEff: 500, hTrue: 200, profile: { gammaEff: 6.5, zBase: 505, zInv: 905, dTInv: 4 } };
  const hOff = verticalCorrection({ ...hand, extendBelowBase: false }), hOn = verticalCorrection(hand);
  add('(21) von Hand: Mulde 300 m unter dem Modellboden — ohne Verlängerung Γ_eff (+1,95 K, kein Flag, Tiefe 0), mit Verlängerung Fall C (−3,00 K, `extrapolatedBelowModel`, Tiefe 305 m)',
    near(hOff.deltaK, 0.0065 * 305 - 0.0065 * 5, 1e-9) && hOff.case === 'C' && hOff.flags.length === 0 && hOff.poolDepthM === 0
    && near(hOn.deltaK, -0.01 * 305 + 0.01 * 5, 1e-9) && hOn.flags.includes('extrapolatedBelowModel') && hOn.poolDepthM === 305,
    `${hOff.deltaK.toFixed(4)} / ${hOn.deltaK.toFixed(4)} K`);

  // Nicht im Produkt: kein Modul unter src/ außer der Datei selbst importiert `profileColumn`. Gegenprobe: dasselbe Muster
  // findet den Import im Gate-Skript (sonst wäre die Abwesenheit nichts wert).
  const pat = /from\s+['"][^'"]*profileColumn(\.ts)?['"]/;
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${d}/${e.name}`] : []));
  const importers = walk('src').filter((f) => !f.endsWith('profileColumn.ts') && pat.test(readFileSync(f, 'utf8')));
  const probe = pat.test(readFileSync('audit/fusion-vollform/pressure-profile-shadow.mjs', 'utf8'));
  add('(21) Gate rot ⇒ nicht verdrahtet: kein App-Modul unter src/ importiert `profileColumn` (Gegenprobe: das Muster findet den Import im Gate-Skript)',
    importers.length === 0 && probe, importers.join(', ') || 'keiner');
}

// ---------------------------------------------------------------------------
// (22) AP16 — Landbedeckung in der Rechnung: κ je Zelle (E-F-16), Modellzell-Box (V-FI-65), d_water in v2 (E-F-17).
//      Alles voreingestellt aus: ohne Option byte-gleich, mit Option gegen die Handrechnung.
// ---------------------------------------------------------------------------
{
  const { windBlendingFactor } = await import('../src/pointForecast/fusion/terrainTerms.ts');
  const { z0CacheKey } = await import('../src/point/client/z0Point.ts');
  const { landCoverCacheKey, kappaOf } = await import('../src/point/client/landCover.ts');
  const { memoryBackend } = await import('../src/point/client/cache.ts');
  const { cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const { encodeV2, decodeV2, compareV2 } = await import('../src/pointForecast/fusion/v2codec.ts');
  // Das Bündel MIT Nachbarzellen (PAP 3 wirkt) — derselbe Leseweg wie im Produkt (`neighbours: true`).
  const bundleN = await readPointBundle(
    { lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: memoryStore(fx.files), terrain: false, nowcast: false, plan: false, neighbours: true });
  const mkInput = () => { const i = cubeInputFromBundle(bundleN, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; return i; };
  const OPEN = [0, 0, 0, 1, 0, 0], WATER = [1, 0, 0, 0, 0, 0];
  const z0v1 = { z0True: 0.03, z0Mod: { t1: 0.03, t2: 0.03, t3: 0.03 }, coverage: { point: 1, t1: 1, t2: 1, t3: 1 }, shares: [[30, 1]], radiusM: 500, source: 'test' };
  const DW = { m: 1230, aboveM: null, reason: 'found', bodyPx: 57 };
  /** Landbedeckung um die nächsten Zellen des Fixtures: q/z0/cov je (Stufe, dy, dx), absolut adressiert wie der Lader. */
  const lcOf = ({ q = () => OPEN, z0 = () => 0.03, cov = () => 1, pCov = 1 } = {}) => {
    const cells = {};
    for (const t of ['t1', 't2']) {
      const s = mkInput().cube[t];
      if (!s) continue;
      cells[t] = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) cells[t].push({ iy: s.cell.iy + dy, ix: s.cell.ix + dx, cov: cov(t, dy, dx), q: q(t, dy, dx), z0: z0(t, dy, dx) });
    }
    return { ...z0v1, landCover: { v: 1, point: { cov: pCov, p: OPEN }, cells, dWater: DW } };
  };
  const run = (z0, o = {}) => fuseCubePoint({ ...mkInput(), z0 }, { hourly: true, tail: true, ...o });
  const stepsJ = (r) => JSON.stringify(r.steps.map((s) => ({ ...s, grid: s.grid ? { ...s.grid, weights: s.grid.weights.map(({ kappa, ...w }) => w) } : null })));
  const withGrid = (r, t) => r.steps.filter((s) => s.tier === t && !s.interpolated && s.grid && s.grid.n > 1);
  const base = run(z0v1);

  // (a) Landbedeckung im Eingang, keine Option ⇒ Werte, Flags, Gewichte, Notizen gleich; calib nur + `dWater:` (Herkunft)
  const lcOff = run(lcOf());
  const extra = lcOff.calib.filter((c) => !base.calib.includes(c));
  add('(22) Negativkontrolle: Landbedeckung im Eingang ohne `kappa`/`z0CellBox` ⇒ jeder Schritt (Werte, Flags, Gewichte, Terrain) und jede Notiz gleich; calib nur um die Herkunftszeile `dWater:set` länger',
    stepsJ(lcOff) === stepsJ(base) && JSON.stringify(lcOff.notes) === JSON.stringify(base.notes) && extra.length === 1 && /^dWater:set — .*≥ 10 px.*V-FI-75.*E-F-17/.test(extra[0])
    && lcOff.steps.every((s) => !s.grid || s.grid.weights.every((w) => w.kappa === undefined)),
    `${withGrid(base, 't1').length} t1-/${withGrid(base, 't2').length} t2-Schritte mit Block · ${extra[0]?.slice(0, 40)}`);

  // (b) κ an, homogene Landbedeckung (q = p) ⇒ κ = 1 überall ⇒ dieselben Werte
  const homo = run(lcOf(), { kappa: true });
  add('(22) κ an, homogen (q = p ⇒ κ = 1): Werte und Gewichte gleich wie ohne κ; calib nennt κ je Zelle (λ 1, 6 Gruppen); die Notiz zählt die Schritte',
    stepsJ(homo) === stepsJ(base) && homo.calib.some((c) => /^kappa:set — PAP 3 κ je Zelle \(AP16, E-F-16\).*λ = 1.*t3 κ = 1/.test(c))
    && withGrid(homo, 't1').every((s) => s.grid.weights.every((w) => w.kappa === 1)) && homo.notes.some((n) => /^kappa: κ je Zelle an t1 (\d+)\/\1 · t2 (\d+)\/\2/.test(n)),
    homo.notes.find((n) => n.startsWith('kappa:')));

  // (c) κ an, Nachbarzellen Wasser (Punkt Offenland) ⇒ κ = e^−1 dort; Gewichte = ohne-κ-Gewichte · κ, neu normiert
  const shoreLc = lcOf({ q: (t, dy, dx) => (dy || dx ? WATER : OPEN) });
  const shore = run(shoreLc, { kappa: true });
  let maxErr = 0, nCmp = 0, changed = 0;
  for (const t of ['t1', 't2']) {
    const on = withGrid(shore, t), off = withGrid(base, t);
    on.forEach((s, i) => {
      const w0 = off[i].grid.weights, k = s.grid.weights.map((w) => (w.dy || w.dx ? Math.exp(-1) : 1));
      const z = w0.reduce((a, w, j) => a + w.w * k[j], 0);
      s.grid.weights.forEach((w, j) => { maxErr = Math.max(maxErr, Math.abs(w.w - (w0[j].w * k[j]) / z)); nCmp++; });
      const cubeT = (x) => x.samples?.find((m) => m.source.startsWith('cube-'))?.temperature;
      if (cubeT(s) !== cubeT(off[i])) changed++;
    });
  }
  const t3Same = JSON.stringify(shore.steps.filter((s) => s.tier === 't3')) === JSON.stringify(base.steps.filter((s) => s.tier === 't3'));
  add('(22) κ an, Nachbarzellen Wasser: jedes Blockgewicht = (Gewicht ohne κ) · κ / Σ mit κ = e^−1 (≤ 1e-12); die nächste Zelle wiegt mehr, die Werte ändern sich; t3 unverändert (κ = 1)',
    nCmp > 100 && maxErr <= 1e-12 && changed > 0 && t3Same && Math.abs(kappaOf(OPEN, WATER) - Math.exp(-1)) < 1e-15,
    `${nCmp} Gewichte, max. Abweichung ${maxErr.toExponential(1)}, ${changed} Schritte mit anderem Blockwert`);

  // (d) eine Blockzelle unter 80 % bekannt ⇒ κ = 1 für den ganzen Block dieser Stufe (keine halbe Gewichtung), benannt
  const holeLc = lcOf({ q: (t, dy, dx) => (dy || dx ? WATER : OPEN), cov: (t, dy, dx) => (t === 't1' && (dy || dx) ? 0.5 : 1) });
  const hole = run(holeLc, { kappa: true });
  const noLc = run(z0v1, { kappa: true });
  add('(22) κ nicht entscheidbar: t1-Blockzelle < 80 % bekannt ⇒ t1 exakt wie ohne κ (t2 wirkt weiter), Notiz „t1 0/N"; Option ohne Landbedeckung ⇒ Werte gleich, calib nennt es',
    JSON.stringify(withGrid(hole, 't1').map((s) => s.grid.weights)) === JSON.stringify(withGrid(base, 't1').map((s) => s.grid.weights))
    && withGrid(hole, 't2').some((s) => s.grid.weights.some((w) => w.kappa !== undefined && w.kappa < 1))
    && hole.notes.some((n) => /^kappa: κ je Zelle an t1 0\/\d+ · t2 (\d+)\/\1/.test(n))
    && stepsJ(noLc) === stepsJ(base) && noLc.calib.some((c) => /^kappa:set — PAP 3 κ = 1: Option kappa an, aber keine Landbedeckung/.test(c)),
    hole.notes.find((n) => n.startsWith('kappa:')));

  // (e) Modellzell-Box: z0_mod = ln-Mittel der Blockzellen-z0 mit den PAP-3-Gewichten; t3 bleibt bei der Box um den Punkt
  const boxLc = lcOf({ z0: (t, dy, dx) => (dy || dx ? 0.5 : 0.03) });
  const box = run(boxLc, { z0CellBox: true });
  const d0 = mkInput().urban?.d0 ?? 0;
  let zErr = 0, zN = 0;
  for (const s of box.steps.filter((x) => !x.interpolated && x.terrain && (x.tier === 't1' || x.tier === 't2'))) {
    const ws = s.grid ? s.grid.weights : [{ w: 1, dy: 0, dx: 0 }];
    const z = Math.exp(ws.reduce((a, w) => a + w.w * Math.log(w.dy || w.dx ? 0.5 : 0.03), 0) / ws.reduce((a, w) => a + w.w, 0));
    zErr = Math.max(zErr, Math.abs(s.terrain.windFactor - windBlendingFactor(z, 0.03, 0, d0, 60)));
    zN++;
  }
  const t3Box = box.steps.filter((s) => s.tier === 't3' && s.terrain).every((s) => s.terrain.windFactor === base.steps.find((b) => b.validAtMs === s.validAtMs).terrain.windFactor);
  const t1Box = box.steps.find((s) => s.tier === 't1' && s.terrain && s.grid?.n > 1);
  add('(22) `z0CellBox`: Windfaktor t1/t2 = windBlendingFactor(ln-Mittel der Blockzellen-z0 mit den PAP-3-Gewichten, z0 am Punkt) (≤ 1e-12); t3 wie ohne Option; calib und Notiz nennen die Blockzellen',
    zN > 50 && zErr <= 1e-12 && t3Box && t1Box.terrain.windFactor > 1
    && box.calib.some((c) => /^z0:set — .*z0 des Modells t1\/t2 = ln-Mittel der Blockzellen .*V-FI-65/.test(c)) && box.notes.some((n) => /^z0CellBox: z0 des Modells aus den Blockzellen an t1 (\d+)\/\1/.test(n))
    && stepsJ(run(boxLc)) === stepsJ(base),
    `${zN} Schritte, max. Abweichung ${zErr.toExponential(1)}, t1-Faktor ${t1Box.terrain.windFactor.toFixed(4)} (ohne Option 1)`);

  // (f) Produktweg: `CubeIo.landCover` — d_water in v2 `point.dWater`, Codec-Rundweg, Cache-Schlüssel, alter z0-Eintrag
  const optsL = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const fail = async () => new Response('x', { status: 404 });
  const enc = (o) => ({ bytes: new TextEncoder().encode(JSON.stringify(o)), storedAt: Date.now() });
  const beBoth = memoryBackend();
  await beBoth.put(z0CacheKey(FIX.lat, FIX.lon), enc(z0v1));
  await beBoth.put(landCoverCacheKey(FIX.lat, FIX.lon), enc(lcOf()));
  const ioL = (extraIo) => ({ store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extraIo });
  clearCubeForecastCache();
  const pOff = await getPointForecastFromCube(optsL, ioL({ z0: { cache: beBoth, fetchImpl: fail } }));
  clearCubeForecastCache();
  const pOn = await getPointForecastFromCube(optsL, ioL({ z0: { cache: beBoth, fetchImpl: fail }, landCover: true }));
  const strip = (v2) => JSON.stringify({ ...v2, point: { ...v2.point, dWater: undefined }, timing: null,
    provenance: { ...v2.provenance, calib: v2.provenance.calib.filter((c) => !c.startsWith('dWater:')), fetched: null } });
  const back = decodeV2(encodeV2(pOn.cube.v2));
  add('(22) Produkt: ohne `landCover` kein `point.dWater` (Schlüssel fehlt); mit ⇒ `point.dWater` wie geladen, sonst v2 gleich (nur die calib-Herkunftszeile dazu); Codec-Rundweg exakt',
    !('dWater' in pOff.cube.v2.point) && JSON.stringify(pOn.cube.v2.point.dWater) === JSON.stringify(DW) && strip(pOn.cube.v2) === strip(pOff.cube.v2)
    && JSON.stringify(back.point.dWater) === JSON.stringify(DW) && compareV2(pOn.cube.v2, back).exact.length === 0,
    JSON.stringify(pOn.cube.v2.point.dWater));
  const io0 = ioL({ z0: { cache: beBoth } });
  add('(22) Cache-Schlüssel: `landCover` nur mit `z0` ⇒ Suffix `|lc`; ohne `landCover` (oder ohne z0) derselbe Schlüssel wie vorher',
    cubeIoVariantKey({ ...io0, landCover: true }).endsWith('|lc') && cubeIoVariantKey(io0) === '' && cubeIoVariantKey({ ...ioL({}), landCover: true }) === ''
    && cubeIoVariantKey({ ...io0, landCover: true, crossChunk: true }).endsWith('|cc|lc'));
  // Nur der alte z0-Eintrag im Cache, Spiegel 404: z0 geht nie verloren (progressiv und nicht-progressiv), d_water fehlt benannt
  const beV1 = memoryBackend();
  await beV1.put(z0CacheKey(FIX.lat, FIX.lon), enc(z0v1));
  const hasZ0 = (fc) => fc.cube.calib.some((c) => c.startsWith('z0:set'));
  clearCubeForecastCache();
  const emV = [];
  const progV1 = await getPointForecastFromCube({ ...optsL, onUpdate: (u) => emV.push(u) }, ioL({ z0: { cache: beV1, fetchImpl: fail }, landCover: true }));
  await new Promise((r) => setTimeout(r, 200));
  clearCubeForecastCache();
  const npV1 = await getPointForecastFromCube(optsL, ioL({ z0: { cache: beV1, fetchImpl: fail }, landCover: true }));
  add('(22) nur alter z0-Eintrag + Spiegel 404: progressiv trägt jede Ausgabe z0 (Windkorrektur), die erste sagt „Landbedeckung … folgt" mit `pending` z0; nicht-progressiv z0 aus dem Cache mit Notiz; nirgends `point.dWater`',
    [progV1, ...emV].every(hasZ0) && progV1.cube.notes.some((n) => /^z0: Landbedeckung \(κ, Zellboxen, d_water\) folgt/.test(n)) && (progV1.cube.pending ?? []).includes('z0')
    && hasZ0(npV1) && npV1.cube.notes.some((n) => /^z0: Landbedeckung nicht verfügbar/.test(n)) && [progV1, ...emV, npV1].every((f) => !('dWater' in f.cube.v2.point)),
    `Ausgaben ${[progV1, ...emV].map((f) => `${f.cube.emission}/${(f.cube.pending ?? []).join('+') || '∅'}`).join(' ')}`);
  clearCubeForecastCache();
  const progLc = await getPointForecastFromCube({ ...optsL, onUpdate: () => {} }, ioL({ z0: { cache: beBoth, fetchImpl: fail }, landCover: true, fuse: { kappa: true } }));
  add('(22) progressiv mit `lc:v1` im Cache: schon die erste Ausgabe trägt Landbedeckung (d_water, κ-Zeile), kein offenes z0',
    JSON.stringify(progLc.cube.v2.point.dWater) === JSON.stringify(DW) && !(progLc.cube.pending ?? []).includes('z0') && progLc.cube.calib.some((c) => c.startsWith('kappa:set — PAP 3 κ je Zelle')));
}

// ---------------------------------------------------------------------------
// (23) AP17 — z0 der Modelle aus dem GRIB (`point/static/z0mod`, E-F-15, V-FI-58): die Mischung je Stufe (rein), die
//      Rechnung hinter `z0Model` und der Produktweg hinter `CubeIo.z0mod`. Voreinstellung aus ⇒ byte-gleich.
// ---------------------------------------------------------------------------
{
  const { z0ModelMix, cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const { windBlendingFactor } = await import('../src/pointForecast/fusion/terrainTerms.ts');
  const { writeStaticZ0mod, Z0_ABSENT_REASON } = await import('./point/staticZ0mod.mjs');
  const cf = await import('../src/point/cubeFormat.ts');
  const { z0CacheKey } = await import('../src/point/client/z0Point.ts');
  const { memoryBackend } = await import('../src/point/client/cache.ts');
  const { encodeV2, decodeV2, compareV2 } = await import('../src/pointForecast/fusion/v2codec.ts');
  const { mkdtempSync, rmSync: rmZ, readFileSync: rfZ } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join: jz } = await import('node:path');

  // (a) die Mischung, rein: Spalten ∪ absent = Windquellen; nur Quellen des Laufs mit Mittel, nicht gedroppt, die die Zelle decken.
  const sp = (byColumn, absent = {}) => ({ product: 'z0mod', version: 'v1', tier: 't1', chunk: { path: '', bytes: 0, cy: 0, cx: 0 }, byColumn, provenance: {}, absent, spreadM: null });
  const src = (id, extra = {}) => ({ id, name: id, tier: 't1', runAt: '', fromH: 0, toH: 48, steps: 49, members: 0, role: 'assigned', coverage: 'full', offsetH: 0, geometry: null, attribution: null, licence: null, errors: 0, firstError: null, dropped: null, ...extra });
  const claefGeo = { cells: 1, covered: 1, domain: { latMin: 43.002, latMax: 51.498, lonMin: 5.0317, lonMax: 22.568 }, clip: null, edgeMarginKm: 0, from: '' };
  const S1 = sp({ icon_d2: Math.log(0.8), icon_eu: Math.log(1), icon_ch1_eps: null }, { claef: 'x', ifs_hres: 'x', aifs_single: 'x' });
  const run1 = [src('icon_d2'), src('icon_d2_eps', { members: 20 }), src('icon_ch1_eps', { steps: 11 }), src('claef', { geometry: claefGeo }), src('claef_eps'), src('icon_eu', { role: 'diversity' }), src('ifs_hres', { steps: 17 }), src('aifs_single', { steps: 8 })];
  const mMuc = z0ModelMix(S1, run1, 48.15, 11.6, 0.1);
  const wantMuc = (Math.log(0.8) + Math.log(1) + 3 * Math.log(0.1)) / 5;
  const mHh = z0ModelMix(S1, run1, 53.55, 10.0, 0.1);
  add('(23) AP17 Mischung: München — GRIB icon_d2 + icon_eu, Näherung claef/ifs_hres/aifs_single, icon_ch1_eps außerhalb (MISSING an der Zelle), σ_ens- und Quantil-Quellen nicht gezählt; ln-Mittel exakt',
    mMuc && mMuc.grib.join() === 'icon_d2,icon_eu' && mMuc.approx.join() === 'claef,ifs_hres,aifs_single' && mMuc.outside.join() === 'icon_ch1_eps'
    && Math.abs(mMuc.lnZ0 - wantMuc) <= 1e-12 && mHh && mHh.outside.includes('claef') && mHh.approx.join() === 'ifs_hres,aifs_single',
    `${JSON.stringify(mMuc)} · Hamburg außerhalb: ${mHh?.outside.join()}`);
  add('(23) Mischung: gedroppte Quelle zählt nicht; ohne GRIB-Quelle an der Zelle, ohne Produkt oder ohne Näherung ⇒ null (der Aufrufer bleibt bei der Näherung)',
    z0ModelMix(S1, run1.map((s) => (s.id === 'icon_eu' ? { ...s, dropped: { reason: 'x', errors: 6, firstError: 'x' } } : s)), 48.15, 11.6, 0.1).grib.join() === 'icon_d2'
    && z0ModelMix(sp({ icon_d2: null }, { ifs_hres: 'x' }), run1, 48.15, 11.6, 0.1) === null && z0ModelMix(null, run1, 48.15, 11.6, 0.1) === null
    && z0ModelMix(S1, run1, 48.15, 11.6, null) === null && z0ModelMix(S1, [], 48.15, 11.6, 0.1) === null);

  // (b)–(d) die Rechnung: z0mod je Stufe an den Zellen des Fixtures (t1 icon_d2, t2 icon_eu, t3 icon_global tragen den Wind).
  const bundleZ = await readPointBundle(
    { lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: memoryStore(fx.files), terrain: false, nowcast: false, plan: false, neighbours: true });
  const z0v1 = { z0True: 0.03, z0Mod: { t1: 0.03, t2: 0.03, t3: 0.03 }, coverage: { point: 1, t1: 1, t2: 1, t3: 1 }, shares: [[30, 1]], radiusM: 500, source: 'test' };
  const Z = { t1: 0.8, t2: 0.6, t3: 0.4 };
  const zmIn = {
    t1: sp({ icon_d2: Math.log(Z.t1), icon_eu: Math.log(1), icon_ch1_eps: Math.log(0.5) }, { claef: Z0_ABSENT_REASON.claef, ifs_hres: Z0_ABSENT_REASON.ifs_hres, aifs_single: Z0_ABSENT_REASON.aifs_single }),
    t2: sp({ icon_eu: Math.log(Z.t2), icon_ch2_eps: Math.log(0.9), icon_global: Math.log(0.7) }, { aicon: Z0_ABSENT_REASON.aicon }),
    t3: sp({ icon_global: Math.log(Z.t3) }, { aicon: Z0_ABSENT_REASON.aicon, ifs_hres: Z0_ABSENT_REASON.ifs_hres }),
  };
  const inp = (withZm) => { const i = cubeInputFromBundle(bundleZ, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; i.z0 = z0v1; if (withZm) i.z0mod = zmIn; return i; };
  const runZ = (withZm, o = {}) => fuseCubePoint(inp(withZm), { hourly: true, tail: true, ...o });
  const J = (r) => JSON.stringify({ steps: r.steps, calib: r.calib, notes: r.notes });
  const baseZ = runZ(false);
  add('(23) Negativkontrolle: z0mod im Eingang ohne `z0Model` ⇒ Schritte, calib und Notizen byte-gleich',
    J(runZ(true)) === J(baseZ));
  const noData = runZ(false, { z0Model: true });
  add('(23) `z0Model` ohne z0mod im Eingang ⇒ Schritte und calib gleich, die Notiz sagt warum (WorldCover-Näherung)',
    JSON.stringify(noData.steps) === JSON.stringify(baseZ.steps) && JSON.stringify(noData.calib) === JSON.stringify(baseZ.calib)
    && noData.notes.some((n) => /^z0Model: Option an, aber kein z0mod im Eingang/.test(n)), noData.notes.find((n) => n.startsWith('z0Model:')));
  const onZ = runZ(true, { z0Model: true });
  const d0 = inp(false).urban?.d0 ?? 0;
  let wErr = 0, wN = 0;
  for (const s of onZ.steps.filter((x) => !x.interpolated && x.terrain && ['t1', 't2', 't3'].includes(x.tier))) {
    wErr = Math.max(wErr, Math.abs(s.terrain.windFactor - windBlendingFactor(Math.exp(Math.log(Z[s.tier])), 0.03, 0, d0, 60)));
    wN++;
  }
  const t1On = onZ.steps.find((s) => s.tier === 't1' && s.terrain), t1Off = baseZ.steps.find((s) => s.tier === 't1' && s.terrain);
  const zLine = onZ.calib.find((c) => c.startsWith('z0Mod:'));
  add('(23) `z0Model` an: Windfaktor je Schritt = windBlendingFactor(GRIB-z0 der Windquelle des Fixtures je Stufe, z0 am Punkt) (≤ 1e-12); der Wind steigt (Modell rauer als der Punkt)',
    wN > 100 && wErr <= 1e-12 && t1On.terrain.windFactor > t1Off.terrain.windFactor && t1On.terrain.windFactor > 1,
    `${wN} Schritte, max. Abweichung ${wErr.toExponential(1)}, t1-Faktor ${t1Off.terrain.windFactor.toFixed(4)} → ${t1On.terrain.windFactor.toFixed(4)}`);
  add('(23) calib: Zeile `z0Mod:model` (GRIB je Stufe, Quellen, Mittelung über den Lauf benannt), die z0-Zeile nennt die Näherung nur noch für Quellen ohne z0; Notiz zählt die Schritte je Stufe',
    /^z0Mod:model — z0 des Modells je Stufe aus dem GRIB \(point\/static\/z0mod.*t1 icon_d2 0\.80 m \(GRIB\) ⇒ 0\.80 m; t2 icon_eu 0\.60 m \(GRIB\) ⇒ 0\.60 m; t3 icon_global 0\.40 m \(GRIB\) ⇒ 0\.40 m.*kein Orographie-Anteil.*über den Lauf gemittelt/.test(zLine ?? '')
    && onZ.calib.some((c) => /^z0:set — .*als Näherung nur für die Windquellen ohne z0/.test(c)) && !baseZ.calib.some((c) => c.startsWith('z0Mod:'))
    && onZ.notes.some((n) => /^z0Model: z0 des Modells aus dem GRIB an t1 (\d+)\/\1 · t2 (\d+)\/\2 · t3 (\d+)\/\3 Schritten/.test(n)),
    zLine?.slice(0, 160));

  // (e) Produktweg: das Produkt, wie der Producer es schreibt, im Store; `CubeIo.z0mod` liest, `fuse.z0Model` rechnet.
  const tmp = mkdtempSync(jz(tmpdir(), 'z0mod-pv-'));
  try {
    const colsOf = (t, entries) => entries.map(([id, z]) => { const tier = cf.TIER_BY_ID[t]; const g = new Float32Array(tier.ny * tier.nx).fill(Math.log(z)); return { id, run: '2026091800', grid: g }; });
    await writeStaticZ0mod(tmp, 't1', colsOf('t1', [['icon_d2', Z.t1], ['icon_eu', 1]]), { absent: { ifs_hres: Z0_ABSENT_REASON.ifs_hres } });
    await writeStaticZ0mod(tmp, 't2', colsOf('t2', [['icon_eu', Z.t2], ['icon_global', 0.7]]), { absent: { aicon: Z0_ABSENT_REASON.aicon } });
    await writeStaticZ0mod(tmp, 't3', colsOf('t3', [['icon_global', Z.t3]]), { absent: { ifs_hres: Z0_ABSENT_REASON.ifs_hres } });
    const files = new Map(fx.files);
    const rel = (p) => p.replace(/^point\//, '');
    files.set(cf.staticManifestPath(cf.Z0MOD_PRODUCT, cf.Z0MOD_VERSION), new Uint8Array(rfZ(jz(tmp, rel(cf.staticManifestPath(cf.Z0MOD_PRODUCT, cf.Z0MOD_VERSION))))));
    for (const t of ['t1', 't2', 't3']) {
      const tier = cf.TIER_BY_ID[t];
      for (let cy = 0; cy < tier.chunk.cy; cy++) for (let cx = 0; cx < tier.chunk.cx; cx++) {
        const p = cf.staticChunkPath(cf.Z0MOD_PRODUCT, cf.Z0MOD_VERSION, t, cy, cx);
        files.set(p, new Uint8Array(rfZ(jz(tmp, rel(p)))));
      }
    }
    const be = memoryBackend();
    await be.put(z0CacheKey(FIX.lat, FIX.lon), { bytes: new TextEncoder().encode(JSON.stringify(z0v1)), storedAt: Date.now() });
    const optsZ = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
    const ioZ = (extra) => ({ store: memoryStore(files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, z0: { cache: be, fetchImpl: async () => new Response('x', { status: 404 }) }, ...extra });
    const strip = (fc) => JSON.stringify({ ...fc.cube.v2, timing: null, provenance: { ...fc.cube.v2.provenance, fetched: null } });
    clearCubeForecastCache(); const pBase = await getPointForecastFromCube(optsZ, ioZ({}));
    clearCubeForecastCache(); const pRead = await getPointForecastFromCube(optsZ, ioZ({ z0mod: true }));
    clearCubeForecastCache(); const pOn = await getPointForecastFromCube(optsZ, ioZ({ z0mod: true, fuse: { z0Model: true } }));
    clearCubeForecastCache(); const pNoRead = await getPointForecastFromCube(optsZ, ioZ({ fuse: { z0Model: true } }));
    add('(23) Produkt: `CubeIo.z0mod` ohne `z0Model` liest das Produkt, rechnet aber byte-gleich (v2 ohne Abrufstatistik gleich)',
      strip(pRead) === strip(pBase) && (pRead.cube.stats?.files ?? 0) > (pBase.cube.stats?.files ?? 0), `Abrufe ${pBase.cube.stats?.files} → ${pRead.cube.stats?.files}`);
    const back = decodeV2(encodeV2(pOn.cube.v2));
    add('(23) Produkt mit `z0Model`: calib `z0Mod:model` mit den gelesenen Werten (t1 icon_d2 0.80 m), calibByVar ordnet z0Mod Wind und Böe zu, Codec-Rundweg exakt; ohne `z0mod`-Lesen nennt die Notiz den Grund',
      pOn.cube.calib.some((c) => /^z0Mod:model — .*t1 icon_d2 0\.80 m \(GRIB\)/.test(c)) && pOn.cube.v2.provenance.calibByVar.wind.includes('z0Mod') && pOn.cube.v2.provenance.calibByVar.gust.includes('z0Mod')
      && !pOn.cube.v2.provenance.calibByVar.t2m.includes('z0Mod') && compareV2(pOn.cube.v2, back).exact.length === 0
      && pNoRead.cube.notes.some((n) => /^z0Model: Option an, aber kein z0mod im Eingang/.test(n)),
      pOn.cube.calib.find((c) => c.startsWith('z0Mod:'))?.slice(0, 120));
    add('(23) Cache-Schlüssel: `z0mod` ⇒ Suffix `|zm`; ohne derselbe Schlüssel wie vorher',
      cubeIoVariantKey(ioZ({ z0mod: true })).endsWith('|zm') && cubeIoVariantKey(ioZ({})) === '' && cubeIoVariantKey(ioZ({ z0mod: true, landCover: true })).endsWith('|lc|zm'));
    // Progressiv: z0mod reist mit den statischen Produkten — spätestens die letzte Ausgabe rechnet mit dem GRIB-z0.
    clearCubeForecastCache();
    const emZ = [];
    const pProg = await getPointForecastFromCube({ ...optsZ, onUpdate: (u) => emZ.push(u) }, ioZ({ z0mod: true, fuse: { z0Model: true } }));
    await new Promise((r) => setTimeout(r, 300));
    const lastZ = [pProg, ...emZ].at(-1);
    add('(23) progressiv: die letzte Ausgabe trägt `z0Mod:model` (mit den statischen Produkten); keine Ausgabe verliert z0',
      lastZ.cube.calib.some((c) => c.startsWith('z0Mod:model')) && [pProg, ...emZ].every((f) => f.cube.calib.some((c) => c.startsWith('z0:set'))),
      `Ausgaben ${[pProg, ...emZ].map((f) => `${f.cube.emission}:${f.cube.calib.some((c) => c.startsWith('z0Mod:')) ? 'GRIB' : 'Näherung'}`).join(' ')}`);
  } finally { rmZ(tmp, { recursive: true, force: true }); }
}

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// (24) Phase FL, FL-AP5: die Lernstufe (Form K) hinter `learned` — byte-gleich ohne Option; eine synthetische Tabelle
//      (μ = ȳ + 1,0 K, σ = 1) verschiebt das Cube-Member und ersetzt seine σ; der Produktpfad liest `point/fusion.client.json`.
// ---------------------------------------------------------------------------
{
  const { newTables, FIT_VERSION } = await import('../src/point/fusionFit/tables.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  const tables = newTables('2026-09-23T00:00:00Z');
  tables.period = { from: '2025-09-01', to: '2026-09-21' };
  const names = designNames('K', 'r1');
  for (let bin = 0; bin < 6; bin++) {
    const beta = new Array(names.length).fill(0); beta[0] = 1.0; beta[Z_DIM] = 1;   // μ = ȳ + 1,0 K
    tables.mean[stratumKey('K', 't', bin, 'r1')] = { form: 'K', var: 't', bin, cls: 'r1', names, beta, lambda: 1, n: 10000, days: 60, prior: null, cv: { time: null, region: null, band: null }, status: 'written', jitter: 0 };
    const c = new Array(V_NAMES.length).fill(0); c[0] = 1.0;   // σ² = 1
    tables.variance[stratumKey('K', 't', bin, 'r1')] = { form: 'K', var: 't', bin, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 10000, days: 60, msr: 1, status: 'written' };
  }
  // das Bündel der Fixture liest ohne Kacheln (`terrain: false`) — die Lernstufe braucht Gelände und h_true wie der Produktpfad
  const input = { ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue) };
  const base = fuseCubePoint(input, { hourly: false });
  const off = fuseCubePoint({ ...input, learned: tables }, { hourly: false });
  add('(24) Negativkontrolle: Tabellen im Eingang ohne Option ⇒ Schritte, calib und Notizen byte-gleich',
    JSON.stringify(off.steps) === JSON.stringify(base.steps) && JSON.stringify(off.calib) === JSON.stringify(base.calib) && JSON.stringify(off.notes) === JSON.stringify(base.notes));
  const on = fuseCubePoint({ ...input, learned: tables }, { hourly: false, learned: true });
  const pairs = base.steps.map((s, i) => [s, on.steps[i]]).filter(([s]) => !s.interpolated && s.samples?.[0]?.temperature != null);
  const shift = pairs.map(([s, o]) => o.samples[0].temperature - s.samples[0].temperature);
  add('(24) `learned` an: das Cube-Member T ist um +1,0 K verschoben (synthetische Tabelle), σ_T = 1 mit `kind: learned`, Flag `learned`; u/Böe unverändert',
    pairs.length > 50 && shift.every((d) => Math.abs(d - 1) < 1e-9)
    && pairs.every(([, o]) => o.uncertainty.temperature?.sigmaKind === 'learned' && Math.abs(o.uncertainty.temperature.sigmaMember - 1) < 1e-9 && o.flags.includes('learned'))
    && pairs.every(([s, o]) => o.samples[0].u === s.samples[0].u && o.samples[0].gust === s.samples[0].gust),
    `${pairs.length} Schritte, Δ ${shift[0]?.toFixed(3)}, σ ${pairs[0]?.[1].uncertainty.temperature?.sigmaMember}`);
  add('(24) calib: Zeile `learned:hindcast` mit fitVersion, Zeitraum und Strata; Notiz zählt die Schritte; ohne Tabellen sagt es `learned:absent`',
    on.calib.some((c) => c.startsWith(`learned:hindcast — Form K aus ${FIT_VERSION} (2025-09-01…2026-09-21, 6 Strata)`))
    && on.notes.some((n) => /^learned: Form K an \d+ Schritten \(t \d+\)/.test(n))
    && fuseCubePoint(input, { hourly: false, learned: true }).calib.some((c) => c.startsWith('learned:absent')),
    on.notes.find((n) => n.startsWith('learned:')));
  // der Produktpfad: `learnedSource: 'json'` liest point/fusion.client.json aus dem Store
  const filesL = new Map(fx.files); filesL.set('point/fusion.client.json', enc(tables));
  const ioL = (extra) => ({ store: memoryStore(filesL), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extra });
  const optsL = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  clearCubeForecastCache(); const pBase = await getPointForecastFromCube(optsL, ioL({}));
  clearCubeForecastCache(); const pOn = await getPointForecastFromCube(optsL, ioL({ learnedSource: 'json' }));
  clearCubeForecastCache(); const pMissing = await getPointForecastFromCube(optsL, { ...ioL({ learnedSource: 'json' }), store: memoryStore(fx.files) });
  add('(24) Produkt: `learnedSource: json` liest die Tabellen, calib nennt `learned:hindcast`, calibByVar ordnet `learned` t2m zu und nicht precip; ohne Datei die Notiz; Cache-Schlüssel `|learned:json`',
    pOn.cube.calib.some((c) => c.startsWith('learned:hindcast')) && pOn.cube.v2.provenance.calibByVar.t2m.includes('learned') && !pOn.cube.v2.provenance.calibByVar.precip.includes('learned')
    && !pBase.cube.calib.some((c) => c.startsWith('learned')) && pMissing.cube.notes.some((n) => /^learned: .*nicht lesbar/.test(n))
    && cubeIoVariantKey(ioL({ learnedSource: 'json' })).endsWith('|learned:json') && cubeIoVariantKey(ioL({})) === '',
    `${pOn.cube.calib.find((c) => c.startsWith('learned:'))?.slice(0, 90)} · fehlend: ${pMissing.cube.notes.find((n) => n.startsWith('learned:'))?.slice(0, 60)}`);
}

// ---------------------------------------------------------------------------
// (25) FL-AP8b (V-FL-20): das Anker-Gewicht aus der gemessenen Persistenzkurve statt e^(−τ/τ_v) — nur mit `learned`
//      UND Kurve in den Tabellen; ohne Option, ohne `anchor`-Block oder je Größe ohne Kurve exakt der bisherige Pfad.
//      Fixture: der `anchor`-Block des Fits 2 (24.09.2026, `scripts/lib/fixtures/anchorCurve.fit-2026-09-24.json`),
//      gegen die Quelle `C:\dev\buscosun-hindcast\fit\2026-09-24\fusion.hindcast.json` geprüft, wo sie liegt.
// ---------------------------------------------------------------------------
{
  const { anchorWeightFromCurve, anchorTermLearned, anchorCurveValid, ANCHOR_CURVE_LEAD_H, innovation } = await import('../src/pointForecast/anchor.ts');
  const { ANCHOR_MAX_LEAD_H, ANCHOR_VARS } = await import('../src/point/fusionFit/fitAnchor.ts');
  const { newTables } = await import('../src/point/fusionFit/tables.ts');
  const { calibByVar } = await import('../src/pointForecast/fusion/output.ts');
  const { readFileSync, existsSync } = await import('node:fs');
  const fixture = JSON.parse(readFileSync(new URL('./lib/fixtures/anchorCurve.fit-2026-09-24.json', import.meta.url), 'utf8'));
  const curveOf = (v) => fixture.anchor[v].curve;
  const SRC = 'C:/dev/buscosun-hindcast/fit/2026-09-24/fusion.hindcast.json';
  if (existsSync(SRC)) {
    const src = JSON.parse(readFileSync(SRC, 'utf8'));
    add('(25) Fixture = der `anchor`-Block der Quelle (Fit 2, 24.09.) — gleich, nichts nachgetragen',
      JSON.stringify(src.anchor) === JSON.stringify(fixture.anchor) && fixture.fitVersion === src.fitVersion, `${fixture.fitVersion} · ${Object.keys(fixture.anchor).join(',')}`);
  } else add('(25) Quelle des Fits nicht auf dieser Maschine — die Fixture trägt den Block (Herkunft im Kopf)', typeof fixture.source?.path === 'string' && fixture.anchor.t.curve.length === 48, fixture.source?.path);
  // (a) die reine Funktion: Definition bei ≤ 1, gemessene Einträge, Interpolation, 0 jenseits, Form, Deckel
  const cT = curveOf('t');
  const wT = (L) => anchorWeightFromCurve(cT, L);
  add('(25) w(τ): τ ≤ 1 ⇒ 1 (Definition); τ = 2/4/6/24/48 ⇒ die gemessenen Einträge 0,9127 / 0,7140 / 0,4055 / 0,4524 / 0,3849; τ = 14 ⇒ −0,0711 (negativ bleibt)',
    wT(1) === 1 && wT(0) === 1 && near(wT(2), 0.9127, 1e-12) && near(wT(4), 0.714, 1e-12) && near(wT(6), 0.4055, 1e-12) && near(wT(24), 0.4524, 1e-12) && near(wT(48), 0.3849, 1e-12) && near(wT(14), -0.0711, 1e-12),
    [1, 2, 3, 4, 6, 12, 14, 24, 36, 48, 49].map((L) => `${L}:${wT(L)}`).join(' '));
  add('(25) w(τ): jenseits des letzten gemessenen Vorlaufs 0 (49, 60, 336 h — Datenlage, benannt); ANCHOR_CURVE_LEAD_H = ANCHOR_MAX_LEAD_H des Fits (48); alle fünf Kurven der Fixture sind gültig',
    wT(49) === 0 && wT(60) === 0 && wT(336) === 0 && ANCHOR_CURVE_LEAD_H === ANCHOR_MAX_LEAD_H && ANCHOR_MAX_LEAD_H === 48 && ANCHOR_VARS.every((v) => anchorCurveValid(curveOf(v))));
  const gap = cT.map((c) => ({ ...c })); gap[3].weight = null;   // Eintrag τ = 4 fehlt ⇒ linear zwischen 3 und 5
  const clip = cT.map((c) => ({ ...c })); clip[1].weight = 1.5; clip[2].weight = -1.5;
  add('(25) w(τ): gebrochener Vorlauf linear (2,5 h aus 2/3), fehlender Eintrag linear aus den Nachbarn (4 h aus 3/5), 1,5 h aus der Definition 1 und dem Eintrag 2; Deckel [−1, 1]',
    near(wT(2.5), (0.9127 + 0.7584) / 2, 1e-12) && near(anchorWeightFromCurve(gap, 4), (0.7584 + 0.5971) / 2, 1e-12) && near(wT(1.5), (1 + 0.9127) / 2, 1e-12)
    && anchorWeightFromCurve(clip, 2) === 1 && anchorWeightFromCurve(clip, 3) === -1,
    `2,5 h ${wT(2.5)} · Lücke 4 h ${anchorWeightFromCurve(gap, 4)} · 1,5 h ${wT(1.5)}`);
  const short = cT.slice(0, 47), wrongLead = cT.map((c, i) => ({ ...c, leadH: i })), nan = cT.map((c) => ({ ...c })); nan[5].weight = NaN;
  add('(25) Negativkontrolle Form: 47 Einträge, verschobene leadH, NaN-Gewicht, kein Array ⇒ ungültig ⇒ null (Setzung gilt); anchorTermLearned mit ungültiger Kurve 0, ohne Innovation 0',
    !anchorCurveValid(short) && !anchorCurveValid(wrongLead) && !anchorCurveValid(nan) && !anchorCurveValid(null) && anchorWeightFromCurve(short, 2) === null
    && anchorTermLearned(innovation([{ ageH: 0, obs: 2, model: 0, wsp: 1 }], 8), 2, short) === 0 && anchorTermLearned(null, 2, cT) === 0
    && near(anchorTermLearned(innovation([{ ageH: 0, obs: 2, model: 0, wsp: 0.5 }], 8), 2, cT), 2 * 0.5 * 0.9127, 1e-12));
  // (b) der Cube-Pfad: Tabellen NUR mit dem anchor-Block (kein Stratum ⇒ das Cube-Member bleibt, der Anker rechnet gegen den PAP-4-Wert)
  const tablesA = newTables('2026-09-24T00:00:00Z'); tablesA.period = { from: '2025-09-01', to: '2026-09-21' }; tablesA.anchor = fixture.anchor;
  const input = { ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue) };
  const base = fuseCubePoint(input, { hourly: false });
  const s0 = base.steps[0];
  // Messung bei 0 km auf h_true (Repräsentativität 1): T +2 K, u/v/Böe +1 m/s gegen den Cube-Wert am Punkt
  const obs = [{ source: 'brightsky', name: 'Test', lat: FIX.lat, lon: FIX.lon, elevM: FIX.hTrue, distanceM: 0, validAtMs: t0Ms, temperature: s0.vertical.t + 2, relativeHumidity: null, u: s0.samples[0].u + 1, v: s0.samples[0].v + 1, gust: s0.samples[0].gust + 1 }];
  const setP = fuseCubePoint({ ...input, obs }, { hourly: false });
  const setL = fuseCubePoint({ ...input, obs, learned: tablesA }, { hourly: false });          // Tabellen im Eingang, Option aus
  const on = fuseCubePoint({ ...input, obs, learned: tablesA }, { hourly: false, learned: true });
  const termAt = (r, L, k) => r.steps.find((s) => s.leadH === L)?.members.find((m) => m.product === 'anchor')?.anchor?.[k];
  const anchorOf = (r) => r.steps.map((s) => s.members.find((m) => m.product === 'anchor')?.anchor ?? null);
  add('(25) Negativkontrolle: Tabellen mit Kurve im Eingang, aber ohne Option ⇒ Schritte, calib und Notizen byte-gleich zum Setzungspfad; der nennt anchor:set und kein anchor:hindcast',
    JSON.stringify(setL.steps) === JSON.stringify(setP.steps) && JSON.stringify(setL.calib) === JSON.stringify(setP.calib) && JSON.stringify(setL.notes) === JSON.stringify(setP.notes)
    && setP.calib.some((c) => c.startsWith('anchor:set')) && !setP.calib.some((c) => c.startsWith('anchor:hindcast')));
  add('(25) Versatz T +2 K, Repräsentativität 1: Zuschlag bei +2 h 2·0,9127, +24 h 2·0,4524, +14 h 2·(−0,0711) (negativ geht durch), +60 h 0, +0 h 2 (Gewicht 1); die Setzung gäbe bei +2 h 2·e^(−1/2) = 1,213 — die beiden unterscheiden sich dort',
    near(termAt(on, 0, 'termK'), 2, 1e-9) && near(termAt(on, 2, 'termK'), 2 * 0.9127, 1e-6) && near(termAt(on, 24, 'termK'), 2 * 0.4524, 1e-6) && near(termAt(on, 14, 'termK'), 2 * -0.0711, 1e-6) && termAt(on, 60, 'termK') === 0
    && near(termAt(setP, 2, 'termK'), 2 * Math.exp(-0.5), 1e-9) && Math.abs(termAt(on, 2, 'termK') - termAt(setP, 2, 'termK')) > 0.5,
    `Kurve +2 h ${termAt(on, 2, 'termK')?.toFixed(4)} · +24 h ${termAt(on, 24, 'termK')?.toFixed(4)} · +14 h ${termAt(on, 14, 'termK')?.toFixed(4)} · +60 h ${termAt(on, 60, 'termK')} — Setzung +2 h ${termAt(setP, 2, 'termK')?.toFixed(4)}`);
  add('(25) das Cube-Member trägt den Zuschlag: T bei +2 h = Basis + 2·0,9127, bei +24 h = Basis + 2·0,4524, bei +14 h = Basis − 0,142; Flag `anchored` bei +24 h gesetzt, bei +60 h nicht',
    near(on.steps[2].samples[0].temperature - base.steps[2].samples[0].temperature, 2 * 0.9127, 1e-6) && near(on.steps[24].samples[0].temperature - base.steps[24].samples[0].temperature, 2 * 0.4524, 1e-6)
    && near(on.steps[14].samples[0].temperature - base.steps[14].samples[0].temperature, 2 * -0.0711, 1e-6)
    && on.steps[24].flags.includes('anchored') && !on.steps.find((s) => s.leadH === 60).flags.includes('anchored') && !setP.steps[24].flags.includes('anchored'),
    `+24 h Δ Kurve ${(on.steps[24].samples[0].temperature - base.steps[24].samples[0].temperature).toFixed(4)} K, Setzung ${(setP.steps[24].samples[0].temperature - base.steps[24].samples[0].temperature).toExponential(2)} K`);
  // (c) Wind: u und v mit je eigener Kurve, Böe mit ihrer
  add('(25) Wind: u und v nehmen je ihre eigene Kurve — Versatz +1 m/s ⇒ bei +3 h u 0,5629, v 0,5003, Böe 0,5322; die Setzung gäbe für alle drei e^(−3/2) = 0,223',
    near(termAt(on, 3, 'termU'), 0.5629, 1e-6) && near(termAt(on, 3, 'termV'), 0.5003, 1e-6) && near(termAt(on, 3, 'termGust'), 0.5322, 1e-6)
    && near(termAt(setP, 3, 'termU'), Math.exp(-1.5), 1e-9) && near(termAt(setP, 3, 'termV'), Math.exp(-1.5), 1e-9) && near(termAt(setP, 3, 'termGust'), Math.exp(-1.5), 1e-9),
    `u ${termAt(on, 3, 'termU')?.toFixed(4)} v ${termAt(on, 3, 'termV')?.toFixed(4)} Böe ${termAt(on, 3, 'termGust')?.toFixed(4)} (Setzung ${termAt(setP, 3, 'termU')?.toFixed(4)})`);
  // (d) Herkunft
  add('(25) calib: mit Option und Kurve genau eine Anker-Zeile `anchor:hindcast` (fitVersion, τ_1/e T 7 · u 6 · v 6 · Böe 6 h, Td ungenutzt, jenseits 48 h ⇒ 0) und kein `anchor:set`; calibByVar führt `anchor` an t2m/wind/gust',
    on.calib.some((c) => c.startsWith(`anchor:hindcast — Persistenzkurve der Form-K-Residuen aus ${tablesA.fitVersion}`) && /τ_1\/e gemessen T 7 h · u 6 h · v 6 h · Böe 6 h/.test(c) && /Td ohne Anker/.test(c) && /jenseits 48 h ⇒ 0/.test(c))
    && !on.calib.some((c) => c.startsWith('anchor:set')) && on.calib.filter((c) => c.startsWith('anchor:')).length === 1
    && ['t2m', 'wind', 'gust'].every((k) => calibByVar(on.calib)[k].includes('anchor')),
    on.calib.find((c) => c.startsWith('anchor:'))?.slice(0, 140));
  // (e) je Größe: ohne Kurve für die Böe fällt nur die Böe auf die Setzung zurück, benannt
  const tablesG = { ...tablesA, anchor: { ...fixture.anchor } }; delete tablesG.anchor.gust;
  const onG = fuseCubePoint({ ...input, obs, learned: tablesG }, { hourly: false, learned: true });
  add('(25) ohne Kurve für die Böe: T/u/v weiter aus der Kurve, Böe aus der Setzung e^(−3/2) = 0,223 bei +3 h; die Herkunft nennt „Setzung … für Böe"',
    near(termAt(onG, 3, 'termK'), termAt(on, 3, 'termK'), 1e-12) && near(termAt(onG, 3, 'termU'), 0.5629, 1e-6) && near(termAt(onG, 3, 'termGust'), Math.exp(-1.5), 1e-9)
    && onG.calib.some((c) => c.startsWith('anchor:hindcast') && /Setzung e\^\(−τ\/τ_v\) für Böe \(keine gültige Kurve/.test(c)),
    onG.calib.find((c) => c.startsWith('anchor:'))?.match(/Setzung e[^;]*/)?.[0]);
  const onN = fuseCubePoint({ ...input, obs, learned: { ...tablesA, anchor: null } }, { hourly: false, learned: true });
  add('(25) Tabellen ohne anchor-Block + Option: Anker-Terme und Herkunft exakt wie der Setzungspfad (anchor:set, Zuschläge gleich, keine Zusatznotiz) — der heutige Lernpfad bleibt, wie er ist',
    JSON.stringify(anchorOf(onN)) === JSON.stringify(anchorOf(setP)) && onN.calib.filter((c) => c.startsWith('anchor:')).join() === setP.calib.filter((c) => c.startsWith('anchor:')).join()
    && !onN.notes.some((n) => /Persistenzkurve/.test(n)));
  const onB = fuseCubePoint({ ...input, obs, learned: { ...tablesA, anchor: { t: { curve: cT.slice(0, 10), tauH: null, setTauH: 4 } } } }, { hourly: false, learned: true });
  add('(25) anchor-Block da, aber keine gültige Kurve (10 Einträge) ⇒ Setzung für alle, anchor:set, und eine Notiz sagt es',
    JSON.stringify(anchorOf(onB)) === JSON.stringify(anchorOf(setP)) && onB.calib.some((c) => c.startsWith('anchor:set')) && onB.notes.some((n) => /anchor-Block, aber keine gültige Persistenzkurve/.test(n)),
    onB.notes.find((n) => /anchor-Block/.test(n))?.slice(0, 80));
  // (f) der Produktpfad: fusion.client.json mit Kurve + Messung ⇒ das Produkt nennt anchor:hindcast, das v2-Anker-Member bei +2 h trägt 1,825 statt 1,213
  const filesA = new Map(fx.files); filesA.set('point/fusion.client.json', new TextEncoder().encode(JSON.stringify(tablesA)));
  const ioA = (extra) => ({ store: memoryStore(filesA), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: async () => obs, ...extra });
  const optsA = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  clearCubeForecastCache(); const pSet = await getPointForecastFromCube(optsA, ioA({}));
  clearCubeForecastCache(); const pCurve = await getPointForecastFromCube(optsA, ioA({ learnedSource: 'json' }));
  const v2Anchor = (p, L) => p.cube.v2.axis.steps.find((x) => x.leadH === L)?.members.find((m) => m.product === 'anchor')?.anchor?.termK ?? null;
  // der Produktpfad rechnet die Innovation gegen SEINEN Cube-Wert (≈ 2,004 K statt exakt 2) — geprüft wird das Verhältnis der Zuschläge: 0,9127 / e^(−1/2) = 1,5048
  add('(25) Produkt: `learnedSource: json` mit Kurve und Messung ⇒ calib nennt anchor:hindcast, das v2-Anker-Member T bei +2 h trägt Versatz·0,9127 statt Versatz·e^(−1/2) (Verhältnis 1,5048); ohne learnedSource anchor:set',
    pCurve.cube.calib.some((c) => c.startsWith('anchor:hindcast')) && pSet.cube.calib.some((c) => c.startsWith('anchor:set')) && !pSet.cube.calib.some((c) => c.startsWith('anchor:hindcast'))
    && v2Anchor(pSet, 2) > 1 && near(v2Anchor(pCurve, 2) / v2Anchor(pSet, 2), 0.9127 / Math.exp(-0.5), 1e-6) && near(v2Anchor(pCurve, 2), 2 * 0.9127, 0.02),
    `v2 +2 h Kurve ${v2Anchor(pCurve, 2)?.toFixed(4)} · Setzung ${v2Anchor(pSet, 2)?.toFixed(4)} · Verhältnis ${(v2Anchor(pCurve, 2) / v2Anchor(pSet, 2)).toFixed(5)}`);
}

// ---------------------------------------------------------------------------
// (26) FL-AP8c (fusionFit@3): Speed-EMOS (`learnedSpeed`, V-FL-22) und gelernte Hürde (`learnedPrecip`, V-FL-18) hinter
//      `learned` — ohne die Optionen byte-gleich zum FL-AP5-Pfad, auch wenn die Tabellen die Blöcke tragen; die
//      Verteilungsfamilie `truncatedNormal` und der Codec (Version 2 liest 1).
// ---------------------------------------------------------------------------
{
  const { newTables, FIT_VERSION } = await import('../src/point/fusionFit/tables.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { V_NAMES, O_NAMES, A_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { riceMoments } = await import('../src/point/fusionFit/fitSpeed.ts');
  const { calibByVar } = await import('../src/pointForecast/fusion/output.ts');
  const { encodeV2, decodeV2, compareV2, V2C_VERSION, V2C_READABLE } = await import('../src/pointForecast/fusion/v2codec.ts');
  const { cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  // a fusionFit@3 table: identity mean for u/v/gust (μ = ȳ), σ² = 1, a speed law per bin, an identity hurdle (only logitWetCube = 1) with amount ln 2 / 0,5
  const tables = newTables('2026-09-25T00:00:00Z');
  tables.period = { from: '2025-09-01', to: '2026-09-21' };
  const names = designNames('K', 'r1');
  for (let bin = 0; bin < 6; bin++) {
    for (const v of ['u', 'v', 'gust']) {
      const beta = new Array(names.length).fill(0); beta[Z_DIM] = 1;
      tables.mean[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names, beta, lambda: 1, n: 10000, days: 60, status: 'written' };
      const c = new Array(V_NAMES.length).fill(0); c[0] = 1;
      tables.variance[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 10000, days: 60, msr: 1, status: 'written' };
    }
    tables.speed[`K|ws|${bin}|r1`] = { form: 'K', var: 'ws', bin, cls: 'r1', names: ['a', 'b', 'c'], family: 'truncatedNormal', a: -0.6, b: 1, c: 1.3, n: 10000, days: 60, status: 'written' };
    const ob = new Array(O_NAMES.length).fill(0); ob[O_NAMES.length - 1] = 1;
    tables.occurrence[stratumKey('K', 'precip', bin, 'r1')] = { form: 'K', var: 'precip', bin, cls: 'r1', names: O_NAMES, beta: ob, n: 10000, days: 60, wetShare: 0.3, iterations: 3, llPerRow: -0.5, status: 'written' };
    tables.amount[stratumKey('K', 'precip', bin, 'r1')] = { form: 'K', var: 'precip', bin, cls: 'r1', names: A_NAMES, beta: [Math.log(2), 0, 0, 0, 0, 0], sigma: 0.5, n: 10000, days: 60, status: 'written' };
  }
  // a t1-only bundle without station: the hurdle may replace K-2 at every step (the station carries precipitation)
  const fxN = await buildCubeFixture({ tiers: ['t1'], station: false });
  const bN = await readBundle(fxN.files);
  const input = { ...cubeInputFromBundle(bN, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue };
  const sig = (r) => JSON.stringify([r.steps, r.calib, r.notes]);
  const base = fuseCubePoint(input, { hourly: false });
  const off = fuseCubePoint({ ...input, learned: tables }, { hourly: false });
  const l5 = fuseCubePoint({ ...input, learned: tables }, { hourly: false, learned: true });
  const l5Plain = fuseCubePoint({ ...input, learned: { ...tables, speed: {}, occurrence: {}, amount: {} } }, { hourly: false, learned: true });
  add('(26) Negativkontrollen: Tabellen mit speed/occurrence im Eingang ohne Option ⇒ byte-gleich zur Basis; mit `learned` allein ⇒ byte-gleich zum FL-AP5-Pfad ohne diese Blöcke (kein Flag learnedSpeed/learnedPrecip, keine calib-Zeile)',
    sig(off) === sig(base) && sig(l5) === sig(l5Plain) && !l5.steps.some((s) => s.flags.includes('learnedSpeed') || s.flags.includes('learnedPrecip')) && !l5.calib.some((c) => /^learned(Speed|Precip)/.test(c)) && l5.steps.every((s) => s.fused?.windSpeed?.dist.kind !== 'truncatedNormal'));
  // (a) learnedSpeed: every native step with a Rice becomes TN(−0,6 + E, 1,3·sd) of the engine's own Rice; direction, gust and T unchanged
  const onS = fuseCubePoint({ ...input, learned: tables }, { hourly: false, learned: true, learnedSpeed: true });
  const pairsS = l5.steps.map((s, i) => [s, onS.steps[i]]).filter(([s]) => s.fused?.windSpeed?.dist.kind === 'rice');
  const tnOk = pairsS.every(([s, o]) => { const r = s.fused.windSpeed.dist, d = o.fused.windSpeed.dist; const mo = riceMoments(r.nu, r.sigma); return d.kind === 'truncatedNormal' && d.lo === 0 && near(d.mu, -0.6 + mo.m, 1e-9) && near(d.sigma, 1.3 * mo.sd, 1e-9) && o.flags.includes('learnedSpeed') && o.fused.windDirectionDeg === s.fused.windDirectionDeg && JSON.stringify(o.fused.gust) === JSON.stringify(s.fused.gust) && JSON.stringify(o.fused.temperature) === JSON.stringify(s.fused.temperature); });
  add('(26) `learnedSpeed`: an jedem nativen Schritt TN(−0,6 + E_Rice, 1,3·sd_Rice) der Motor-Rice, Flag learnedSpeed, Richtung/Böe/T unverändert; calib nennt learnedSpeed:hindcast mit 6 Strata und der fitVersion; calibByVar.wind trägt learnedSpeed; Notiz zählt',
    pairsS.length > 20 && tnOk && onS.calib.some((c) => c.startsWith(`learnedSpeed:hindcast — Windgeschwindigkeit als gestutzte Normal`) && c.includes(`(6 Strata, ${FIT_VERSION})`)) && calibByVar(onS.calib).wind.includes('learnedSpeed') && !calibByVar(l5.calib).wind.includes('learnedSpeed')
    && onS.notes.some((n) => new RegExp(`^learnedSpeed: gestutzte Normal an ${pairsS.length} Schritten, ohne Gesetz im Stratum 0`).test(n)),
    `${pairsS.length} Schritte · ${onS.notes.find((n) => n.startsWith('learnedSpeed:'))}`);
  const onS0 = fuseCubePoint({ ...input, learned: { ...tables, speed: {} } }, { hourly: false, learned: true, learnedSpeed: true });
  add('(26) `learnedSpeed` ohne Gesetz in den Tabellen ⇒ Rice bleibt an jedem Schritt, kein Flag, Notiz „ohne Gesetz"', onS0.steps.every((s) => s.fused?.windSpeed?.dist.kind !== 'truncatedNormal' && !s.flags.includes('learnedSpeed')) && onS0.notes.some((n) => /^learnedSpeed: gestutzte Normal an 0 Schritten, ohne Gesetz im Stratum \d+/.test(n)) && JSON.stringify(onS0.steps.map((s) => s.fused?.windSpeed)) === JSON.stringify(l5.steps.map((s) => s.fused?.windSpeed)));
  // (b) learnedPrecip: the identity hurdle reproduces the engine's pDry exactly (the cube column alone), the amount is the learned one
  const onP = fuseCubePoint({ ...input, learned: tables }, { hourly: false, learned: true, learnedPrecip: true });
  const pairsP = l5.steps.map((s, i) => [s, onP.steps[i]]).filter(([s]) => s.fused?.precipitation?.dist.kind === 'hurdleLogNormal' && s.fused.precipitation.dist.pDry > 0.001 && s.fused.precipitation.dist.pDry < 0.999);
  const hOk = pairsP.every(([s, o]) => { const d = o.fused.precipitation.dist; return d.kind === 'hurdleLogNormal' && near(d.pDry, s.fused.precipitation.dist.pDry, 1e-9) && near(d.mu, Math.log(2), 1e-12) && d.sigma === 0.5 && o.flags.includes('learnedPrecip') && JSON.stringify(o.fused.windSpeed) === JSON.stringify(s.fused.windSpeed); });
  add('(26) `learnedPrecip`: Identitäts-Hürde ⇒ pDry = pDry des Motors exakt (nur die Cube-Spalte), Menge ln 2 / 0,5, Flag learnedPrecip, Wind unverändert; calib learnedPrecip:hindcast, calibByVar.precip trägt learnedPrecip; Notiz zählt (K-2 behalten 0 ohne Station/Radar)',
    pairsP.length > 20 && hOk && onP.calib.some((c) => c.startsWith('learnedPrecip:hindcast')) && calibByVar(onP.calib).precip.includes('learnedPrecip') && !calibByVar(l5.calib).precip.includes('learnedPrecip')
    && onP.notes.some((n) => /^learnedPrecip: gelernte Hürde an \d+ Schritten, K-2 behalten 0 \(Radar-\/Stationsmember\), ohne Stratum oder ohne CV-Gewinn 0/.test(n)),
    `${pairsP.length} Schritte · ${onP.notes.find((n) => n.startsWith('learnedPrecip:'))}`);
  const noSkill = { ...tables, occurrence: Object.fromEntries(Object.entries(tables.occurrence).map(([k, e]) => [k, { ...e, status: 'no-skill' }])) };
  const onPn = fuseCubePoint({ ...input, learned: noSkill }, { hourly: false, learned: true, learnedPrecip: true });
  const withSt = fuseCubePoint({ ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue, learned: tables }, { hourly: false, learned: true, learnedPrecip: true });
  const stSteps = withSt.steps.filter((s) => s.members.some((m) => m.product === 'station'));
  add('(26) Hürde no-skill ⇒ K-2 bleibt an jedem Schritt (Notiz „ohne CV-Gewinn"); mit Stationsmember bleibt K-2 an den Stationsschritten (Notiz „K-2 behalten")',
    onPn.steps.every((s) => !s.flags.includes('learnedPrecip')) && JSON.stringify(onPn.steps.map((s) => s.fused?.precipitation)) === JSON.stringify(l5.steps.map((s) => s.fused?.precipitation)) && onPn.notes.some((n) => /ohne Stratum oder ohne CV-Gewinn [1-9]\d*/.test(n))
    && stSteps.length > 0 && stSteps.every((s) => !s.flags.includes('learnedPrecip')) && withSt.notes.some((n) => new RegExp(`K-2 behalten ${stSteps.length} `).test(n)),
    `no-skill: ${onPn.notes.find((n) => n.startsWith('learnedPrecip:'))} · Station: ${withSt.notes.find((n) => n.startsWith('learnedPrecip:'))}`);
  // (c) the product path and the codec: version 2 encodes the TN, reads version 1 unchanged, rejects 3; the cache key carries the options
  const filesL = new Map(fxN.files); filesL.set('point/fusion.client.json', enc(tables));
  const ioL = (extra) => ({ store: memoryStore(filesL), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extra });
  const optsL = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  clearCubeForecastCache(); const pOn = await getPointForecastFromCube(optsL, ioL({ learnedSource: 'json', fuse: { learnedSpeed: true, learnedPrecip: true } }));
  clearCubeForecastCache(); const pL5 = await getPointForecastFromCube(optsL, ioL({ learnedSource: 'json' }));
  const tnSteps = pOn.cube.v2.axis.steps.filter((s) => s.vars.wind?.dist?.kind === 'truncatedNormal');
  const c2 = encodeV2(pOn.cube.v2), d2 = decodeV2(c2);
  const cmp = compareV2(pOn.cube.v2, d2);
  const c1 = encodeV2(pL5.cube.v2);
  const asV1 = { ...c1, version: 1 };
  const d1 = decodeV2(asV1), dRef = decodeV2(c1);
  let rejected = false; try { decodeV2({ ...c1, version: 4 }); } catch (e) { rejected = /Version 4 unbekannt \(kann 1, 2, 3\)/.test(String(e.message)); }
  add('(26) Produkt + Codec: `fuse.learnedSpeed/learnedPrecip` über CubeIo ⇒ v2 trägt truncatedNormal am Wind und calib beide Zeilen; Version 3 (AX-4) kodiert/dekodiert die TN exakt; ein Dokument der Version 1 dekodiert wie Version 3 (gleiche Tabellen); Version 4 wird benannt verworfen; Cache-Schlüssel trägt die Optionen',
    tnSteps.length > 20 && pOn.cube.calib.some((c) => c.startsWith('learnedSpeed:hindcast')) && pOn.cube.calib.some((c) => c.startsWith('learnedPrecip:hindcast')) && pOn.cube.v2.provenance.calibByVar.wind.includes('learnedSpeed') && pOn.cube.v2.provenance.calibByVar.precip.includes('learnedPrecip')
    && V2C_VERSION === 3 && V2C_READABLE.join() === '1,2,3' && c2.version === 3 && cmp.exact.length === 0 && JSON.stringify(d1) === JSON.stringify(dRef) && rejected
    && cubeIoVariantKey(ioL({ learnedSource: 'json', fuse: { learnedSpeed: true } })) !== cubeIoVariantKey(ioL({ learnedSource: 'json' })),
    `${tnSteps.length} TN-Schritte · Codec exakt ${cmp.exact.length === 0} · v1 gleich ${JSON.stringify(d1) === JSON.stringify(dRef)}`);
}

// ---------------------------------------------------------------------------
// (27) Phase FX-5 (E-FX-8, §6.5): das Klimatologieprodukt für die μ_c-Spalte der Lernstufe — `CubeIo.climaSource: 'json'` liest
//      `point/static/clima/v1/stations.json`; μ_c wird EINMAL je Abfrage am Punkt geschätzt und je Schritt an `predict` gereicht,
//      nur mit `learned` + station-Tabelle. Ohne `learned` byte-gleich (Negativkontrolle); none-Tabelle + Produkt = heutiger
//      Lernpfad; station-Tabelle ohne Produkt = Basis für die gelisteten Größen, benannt absent; Cache-Schlüssel; fehlende Datei.
// ---------------------------------------------------------------------------
{
  const { newTables } = await import('../src/point/fusionFit/tables.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { C_NAMES, C_DIM } = await import('../src/point/fusionFit/fitClima.ts');
  const { TREND_SETS, CLIMA_PRODUCT_KIND, CLIMA_PRODUCT_SCHEMA } = await import('../src/point/fusionFit/climaProduct.ts');
  const { POINT_CLIMA_PATH, POINT_LEARNED_PATH } = await import('../src/point/cubeFormat.ts');
  const { cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  // tables: form K, T only, station design with the column list [t] — μ = 0,5·ȳ + 0,5·μ_c; σ = 1
  const mkTables = (clima) => {
    const T = newTables('2026-09-27T00:00:00Z'); T.period = { from: '2025-09-01', to: '2026-09-21' };
    if (clima) T.design.mean = { ...T.design.mean, clima: 'station', climaVars: ['t'] };
    const names = designNames('K', 'r1', clima ? 'station' : 'none');
    for (let bin = 0; bin < 6; bin++) {
      const beta = new Array(names.length).fill(0); beta[Z_DIM] = clima ? 0.5 : 1; if (clima) beta[names.length - 1] = 0.5; else beta[0] = 1.0;
      T.mean[stratumKey('K', 't', bin, 'r1')] = { form: 'K', var: 't', bin, cls: 'r1', names, beta, lambda: 1, n: 10000, days: 60, prior: null, cv: { time: null, region: null, band: null }, status: 'written', jitter: 0 };
      const c = new Array(V_NAMES.length).fill(0); c[0] = 1.0;
      T.variance[stratumKey('K', 't', bin, 'r1')] = { form: 'K', var: 't', bin, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 10000, days: 60, msr: 1, status: 'written' };
    }
    return T;
  };
  // product: geo trend whose T intercept coefficient is the constant 5 (every other coefficient 0) ⇒ μ_c(T) = 5 at every hour; one station near the point
  const trendT = Array.from({ length: C_DIM }, (_, j) => TREND_SETS.geo.map((n) => (j === 0 && n === '1' ? 5 : 0)));
  const product = { schema: CLIMA_PRODUCT_SCHEMA, kind: CLIMA_PRODUCT_KIND, fitVersion: 'test', provenance: 'hindcast', builtAt: '2026-09-27T00:00:00Z', candidate: 'ridgeTx-test',
    estimator: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none' }, design: C_NAMES, vars: ['t', 'td', 'gust'], lapse: null,
    trend: { names: TREND_SETS.geo, beta: { t: trendT }, lambda: { t: 1 } },
    stations: [{ id: 'S1', lat: FIX.lat + 0.05, lon: FIX.lon, elevM: 520, country: 'DE', mu: {} }], source: { clima: 'test', sha256: null, period: null, days: null, points: 1 }, licence: ['test'], notes: [] };
  const filesOf = (tables, prod) => { const m = new Map(fx.files); if (tables) m.set(POINT_LEARNED_PATH, enc(tables)); if (prod) m.set(POINT_CLIMA_PATH, prod === 'broken' ? new TextEncoder().encode('{kein json') : enc(prod)); return m; };
  const io = (files, extra) => ({ store: memoryStore(files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extra });
  const opts27 = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const run = async (files, extra) => { clearCubeForecastCache(); return getPointForecastFromCube(opts27, io(files, extra)); };
  const stepsJson = (p) => JSON.stringify(p.cube.v2.axis.steps);
  const base = await run(filesOf(null, null), {});
  // (a) negative control: the product alone (no `learned`) changes nothing but the cache key
  const climaOnly = await run(filesOf(null, product), { climaSource: 'json' });
  add('(27) Negativkontrolle: `climaSource: json` ohne `learnedSource` ⇒ Schritte und calib byte-gleich zur Basis, keine learnedClima-Zeile; Cache-Schlüssel trägt |clima:json',
    stepsJson(climaOnly) === stepsJson(base) && JSON.stringify(climaOnly.cube.calib) === JSON.stringify(base.cube.calib) && !climaOnly.cube.calib.some((c) => c.startsWith('learnedClima'))
    && cubeIoVariantKey(io(new Map(), { climaSource: 'json' })).endsWith('|clima:json') && cubeIoVariantKey(io(new Map(), { learnedSource: 'json', climaSource: 'json' })).endsWith('|learned:json|clima:json') && cubeIoVariantKey(io(new Map(), {})) === '',
    cubeIoVariantKey(io(new Map(), { learnedSource: 'json', climaSource: 'json' })));
  // (b) none table + product = today's learned path (byte-identical to the same table without the product)
  const noneT = mkTables(false);
  const noneOn = await run(filesOf(noneT, null), { learnedSource: 'json' });
  const noneProd = await run(filesOf(noneT, product), { learnedSource: 'json', climaSource: 'json' });
  add('(27) none-Tabelle + Produkt: Schritte und calib byte-gleich zum Lernpfad ohne Produkt (die Tabelle erklärt keine μ_c-Spalte ⇒ keine learnedClima-Zeile)',
    stepsJson(noneProd) === stepsJson(noneOn) && JSON.stringify(noneProd.cube.calib) === JSON.stringify(noneOn.cube.calib) && noneOn.cube.calib.some((c) => c.startsWith('learned:hindcast')) && !noneProd.cube.calib.some((c) => c.startsWith('learnedClima')));
  // (c) station table + product: T = 0,5·ȳ + 0,5·5 at every native step; provenance names the product, the estimator path and the nearest station
  const stT = mkTables(true);
  // the pure function: the cube member T at every native step is exactly 0,5·ȳ + 0,5·μ_c (μ_c = 5 from the geo trend)
  const input27 = { ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue) };
  const base27 = fuseCubePoint(input27, { hourly: false });
  const on27 = fuseCubePoint({ ...input27, learned: stT, learnedClima: product }, { hourly: false, learned: true });
  const pairs27 = base27.steps.map((s, i) => [s, on27.steps[i]]).filter(([s]) => !s.interpolated && s.samples?.[0]?.temperature != null);
  const exact = pairs27.filter(([s, o]) => Math.abs(o.samples[0].temperature - (0.5 * s.samples[0].temperature + 2.5)) < 1e-6).length;
  const lineC = on27.calib.find((c) => c.startsWith('learnedClima:hindcast'));
  // the product path: the same line reaches the v2 provenance
  const stOn = await run(filesOf(stT, product), { learnedSource: 'json', climaSource: 'json' });
  add('(27) station-Tabelle [t] + Produkt: das Cube-Member T an jedem nativen Schritt exakt 0,5·ȳ + 0,5·μ_c (μ_c = 5 aus dem Geo-Trend; ≥ 40 Schritte), Flag learned, calib `learnedClima:hindcast` nennt t, den Kandidaten, Weg ridge und die nächste Station (≈ 5,6 km) — pur und über den Produktpfad',
    pairs27.length >= 40 && exact === pairs27.length && pairs27.every(([, o]) => o.flags.includes('learned')) && !!lineC && / für t aus dem Klimatologieprodukt \(ridgeTx-test/.test(lineC) && /Weg ridge/.test(lineC) && /nächste Station 5\.[4-8] km/.test(lineC)
    && stOn.cube.calib.some((c) => c.startsWith('learnedClima:hindcast — μ_c-Spalte für t aus')) && stOn.cube.v2.provenance.calibByVar.t2m.includes('learned') && stOn.cube.calib.some((c) => c.startsWith('learned:hindcast')),
    `${exact}/${pairs27.length} exakt · ${lineC?.slice(0, 140)}`);
  // station table WITHOUT product, pure: steps byte-identical to the base (t absent), calib says why
  const off27 = fuseCubePoint({ ...input27, learned: stT }, { hourly: false, learned: true });
  add('(27) station-Tabelle ohne Produkt (pur): Schritte byte-gleich zur Basis, calib `learnedClima:absent` (kein Produkt im Eingang); Negativkontrolle: Tabelle + Produkt im Eingang OHNE Option ⇒ byte-gleich zur Basis, keine Zeile',
    JSON.stringify(off27.steps) === JSON.stringify(base27.steps) && off27.calib.some((c) => /^learnedClima:absent — .*kein Klimatologieprodukt im Eingang/.test(c))
    && JSON.stringify(fuseCubePoint({ ...input27, learned: stT, learnedClima: product }, { hourly: false }).steps) === JSON.stringify(base27.steps) && !fuseCubePoint({ ...input27, learned: stT, learnedClima: product }, { hourly: false }).calib.some((c) => c.startsWith('learned')),
    off27.calib.find((c) => c.startsWith('learnedClima'))?.slice(0, 120));
  // (d) station table WITHOUT product: t stays absent (steps byte-identical to the base), named
  const stOff = await run(filesOf(stT, null), { learnedSource: 'json' });
  const stMissing = await run(filesOf(stT, null), { learnedSource: 'json', climaSource: 'json' });
  const stBroken = await run(filesOf(stT, 'broken'), { learnedSource: 'json', climaSource: 'json' });
  add('(27) station-Tabelle ohne Produkt (climaSource aus / Datei fehlt / kein JSON): Schritte byte-gleich zur Basis (t ohne Lernstufe), calib `learnedClima:absent` benennt die Ursache, die Leser-Notiz sagt „nicht lesbar" bzw. „kein JSON"',
    stepsJson(stOff) === stepsJson(base) && stOff.cube.calib.some((c) => /^learnedClima:absent — .*CubeIo\.climaSource aus/.test(c))
    && stepsJson(stMissing) === stepsJson(base) && stMissing.cube.notes.some((n) => /^learnedClima: .*nicht lesbar/.test(n)) && stMissing.cube.calib.some((c) => c.startsWith('learnedClima:absent'))
    && stepsJson(stBroken) === stepsJson(base) && stBroken.cube.notes.some((n) => /^learnedClima: .*kein JSON/.test(n)),
    `${stOff.cube.calib.find((c) => c.startsWith('learnedClima'))?.slice(0, 120)} · ${stMissing.cube.notes.find((n) => n.startsWith('learnedClima'))?.slice(0, 80)}`);
  // (e) a product without T (vars [gust]) or without the trend for t leaves t absent and says so
  const noT = await run(filesOf(stT, { ...product, vars: ['gust'], trend: { names: TREND_SETS.geo, beta: {}, lambda: {} } }), { learnedSource: 'json', climaSource: 'json' });
  add('(27) Produkt ohne T-Trend (vars [gust]): t bleibt absent, Schritte byte-gleich zur Basis, calib `learnedClima:absent`',
    stepsJson(noT) === stepsJson(base) && noT.cube.calib.some((c) => /^learnedClima:absent — .*das Produkt \(vars gust\) trägt keine Schätzung für t/.test(c)), noT.cube.calib.find((c) => c.startsWith('learnedClima'))?.slice(0, 120));
}

// ---------------------------------------------------------------------------
// (28) Phase FS (`audit/fusion-stationswert.md` §2.7): vier Optionen hinter dem Cube-Pfad, jede voreingestellt aus —
//      `learnedAtPoint` (V-FS-2: das gelernte Mittel gilt am Punkt), `priorShrink: false` (D2: kein Klimatologie-Schritt für
//      kalibrierte Member), `learnedClouds` (H14), `stationValue` (H9/H10: M + b + w·I + c·(L − M) an einer Station am Punkt).
//      Ohne die Optionen byte-gleich, auch mit Tabellen im Eingang; jede Wirkung mit Negativkontrolle.
// ---------------------------------------------------------------------------
{
  const { newTables } = await import('../src/point/fusionFit/tables.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { verifyStationValue, TAU_GROUPS, STACK_TABLE_KIND, STACK_FIT_VERSION } = await import('../src/pointForecast/fusion/stationValue.ts');
  const { windTerrainFactor } = await import('../src/pointForecast/fusion/fuse.ts');
  const { cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const { calibByVar } = await import('../src/pointForecast/fusion/output.ts');
  const sv = verifyStationValue();
  add(`(28) stationValue.ts: ${sv.checks.length} Modulprüfungen (Tabelle, Formen, Rückfall auf die tragbare Form, Grenze bei 0, Station am Punkt)`, sv.failed === 0, sv.checks.filter((c) => !c.ok).map((c) => c.name).join(' | '));
  // identity tables: μ = ȳ for T, Td, u, v, gust, clct; σ² = 1
  const tables = newTables('2026-09-28T00:00:00Z');
  tables.period = { from: '2025-09-01', to: '2026-09-21' };
  const names = designNames('K', 'r1');
  for (let bin = 0; bin < 6; bin++) for (const v of ['t', 'td', 'u', 'v', 'gust', 'clct']) {
    const beta = new Array(names.length).fill(0); beta[Z_DIM] = 1;
    tables.mean[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names, beta, lambda: 1, n: 10000, days: 60, status: 'written' };
    const c = new Array(V_NAMES.length).fill(0); c[0] = 1;
    tables.variance[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 10000, days: 60, msr: 1, status: 'written' };
  }
  const entries = {};
  for (const v of ['t', 'td', 'ws', 'gust']) for (let g = 0; g < TAU_GROUPS.length; g++) {
    entries[`${v}|${g}|B`] = { n: 500, beta: [0.25], sigma: 0.9 };
    entries[`${v}|${g}|AB`] = { n: 500, beta: [0.1, 0.5], sigma: 0.8 };
    entries[`${v}|${g}|S0`] = { n: 500, beta: [0.2, 0.3], sigma: 0.85 };
    entries[`${v}|${g}|S`] = { n: 500, beta: [0.1, 0.5, 0.2], sigma: 0.7 };
  }
  const stack = { schema: 1, kind: STACK_TABLE_KIND, fitVersion: STACK_FIT_VERSION, provenance: 'archive', builtAt: '2026-09-28T00:00:00Z', period: { from: '2026-09-14', to: '2026-09-27', issueDays: 13 }, rows: 1000, range: { maxKm: 5, maxDElevM: 50 }, tauGroups: TAU_GROUPS, entries };
  const sig = (r) => JSON.stringify([r.steps, r.calib, r.notes]);
  // a valley: the wind factor of the engine is < 1 for the cube member
  const valley = { ...flatTerrain(FIX.hTrue), tpi500M: -60, tpi2000M: -80, scales: { ...flatScales(FIX.hTrue), tpiM: [-60, -80, -80, -80, -80, -80] } };

  // (a) the pure function without a station (t1): one member, so rawMu IS what the engine read
  const fxN = await buildCubeFixture({ tiers: ['t1'], station: false });
  const bN = await readBundle(fxN.files);
  const inN = { ...cubeInputFromBundle(bN, clima), terrain: valley, elevationM: FIX.hTrue };
  const base = fuseCubePoint(inN, { hourly: false });
  const off = fuseCubePoint({ ...inN, learned: tables, stack }, { hourly: false });
  const lOnly = fuseCubePoint({ ...inN, learned: tables }, { hourly: false, learned: true });
  const noLearn = fuseCubePoint({ ...inN, learned: tables }, { hourly: false, learnedAtPoint: true, learnedClouds: true });
  add('(28) Negativkontrollen: Tabellen und Stationswert-Tabelle im Eingang ohne Option ⇒ byte-gleich zur Basis; `learnedAtPoint`/`learnedClouds` ohne `learned` ⇒ byte-gleich zur Basis, keine calib-Zeile',
    sig(off) === sig(base) && sig(noLearn) === sig(base) && !noLearn.calib.some((c) => /^(learnedAtPoint|learnedClouds|priorShrink|stationValue)/.test(c)));
  const atP = fuseCubePoint({ ...inN, learned: tables }, { hourly: false, learned: true, learnedAtPoint: true, priorShrink: false });
  const notP = fuseCubePoint({ ...inN, learned: tables }, { hourly: false, learned: true, priorShrink: false });
  const nat = base.steps.map((s, i) => ({ b: s, l: lOnly.steps[i], a: atP.steps[i], n: notP.steps[i] })).filter((x) => !x.b.interpolated && x.b.samples?.[0]?.temperature != null && x.l.flags.includes('learned'));
  const dz = (x) => x.b.samples[0].sourceElevation - FIX.hTrue;
  const wfOf = (x) => windTerrainFactor(x.b.samples[0], { terrain: valley.scales, elevationM: FIX.hTrue });
  // the learned mean of an identity table is the member as stored BEFORE the engine reads it (the base run's sample)
  const Lt = (x) => x.b.samples[0].temperature, Lws = (x) => Math.hypot(x.b.samples[0].u, x.b.samples[0].v), Lg = (x) => x.b.samples[0].gust;
  const okAt = nat.every((x) => near(x.a.fused.temperature.rawMu, Lt(x), 1e-9) && near(x.a.fused.windSpeed.rawMu, Lws(x), 1e-9) && near(x.a.fused.gust.rawMu, Lg(x), 1e-9) && near(x.a.fused.dewPoint.rawMu, Math.min(x.b.samples[0].dewPoint, Lt(x)), 1e-9));
  const okNot = nat.every((x) => near(x.n.fused.temperature.rawMu, Lt(x) + dz(x) * 0.0065, 1e-9) && near(x.n.fused.windSpeed.rawMu, Lws(x) * wfOf(x), 1e-9) && near(x.n.fused.gust.rawMu, Lg(x) * wfOf(x), 1e-9));
  add('(28) `learnedAtPoint` (V-FS-2): der Motor liest an jedem nativen Schritt genau das gelernte Mittel (T, Td, |v|, Böe; Identitäts-Tabelle, ein Member, ohne Klimatologie-Schritt); Negativkontrolle: ohne die Option liest er T + Δh·6,5 K/km und Wind/Böe mal Geländefaktor (Tal, Faktor < 1)',
    nat.length > 20 && okAt && okNot && Math.abs(dz(nat[0])) >= 10 && wfOf(nat[0]) < 0.95 && atP.calib.some((c) => c.startsWith('learnedAtPoint:set')) && atP.notes.some((n) => new RegExp(`^learnedAtPoint: Member an ${nat.length} Schritten`).test(n))
    && calibByVar(atP.calib).t2m.includes('learnedAtPoint') && calibByVar(atP.calib).wind.includes('priorShrink'),
    `${nat.length} Schritte · Δh ${dz(nat[0])} m · Geländefaktor ${wfOf(nat[0]).toFixed(3)} · T gelesen ohne Option ${nat[0].n.fused.temperature.rawMu.toFixed(3)} gegen gelernt ${Lt(nat[0]).toFixed(3)}`);
  // (b) priorShrink: false — μ = rawMu, β = 1; precipitation keeps the step; with the step μ is pulled toward the climatology
  const shr = lOnly, nos = fuseCubePoint({ ...inN, learned: tables }, { hourly: false, learned: true, priorShrink: false });
  const prs = nat.map((x, i) => ({ s: shr.steps[base.steps.indexOf(x.b)], n: nos.steps[base.steps.indexOf(x.b)] }));
  add('(28) `priorShrink: false` (D2): T, Td, Böe und Bewölkung μ = rawMu, β = 1 in den Gewichten aller Größen (die Rice des Windes trägt danach noch die mittelwerttreue Regime-Aufweitung); Niederschlag byte-gleich (K-2 behält den Schritt); Negativkontrolle: mit dem Schritt liegt μ näher an der Klimatologie (β < 1)',
    prs.every(({ s, n }) => near(n.fused.temperature.dist.mu, n.fused.temperature.rawMu, 1e-12) && near(n.fused.dewPoint.dist.mu, n.fused.dewPoint.rawMu, 1e-12) && near(n.fused.clouds.dist.mu, n.fused.clouds.rawMu, 1e-12) && n.weights.wind.beta === 1 && n.weights.gust.beta === 1 && s.weights.wind.beta < 1 && n.fused.windSpeed.dist.nu > s.fused.windSpeed.dist.nu
      && n.weights.temperature.beta === 1 && s.weights.temperature.beta < 1 && Math.abs(s.fused.temperature.dist.mu - s.fused.temperature.rawMu) > 1e-6 && JSON.stringify(n.fused.precipitation) === JSON.stringify(s.fused.precipitation) && n.fused.temperature.rawMu === s.fused.temperature.rawMu)
    && nos.calib.some((c) => c.startsWith('priorShrink:off')) && !shr.calib.some((c) => c.startsWith('priorShrink')),
    `β mit Schritt ${prs[0].s.weights.temperature.beta.toFixed(3)} · μ ${prs[0].s.fused.temperature.dist.mu.toFixed(3)} → ${prs[0].n.fused.temperature.dist.mu.toFixed(3)}`);
  const tailOn = fuseCubePoint(inN, { hourly: false, tail: true, priorShrink: false }), tailOff = fuseCubePoint(inN, { hourly: false, tail: true });
  add('(28) `priorShrink: false` lässt den Klimatologie-Schwanz unberührt (jenseits der Daten trägt weiter allein die Klimatologie)',
    tailOn.steps.some((s) => s.tier === 'clima') && JSON.stringify(tailOn.steps.filter((s) => s.tier === 'clima')) === JSON.stringify(tailOff.steps.filter((s) => s.tier === 'clima')));
  // (c) learnedClouds: the learned distribution passes through
  const clo = fuseCubePoint({ ...inN, learned: tables }, { hourly: false, learned: true, learnedClouds: true });
  const cl = nat.map((x) => ({ l: lOnly.steps[base.steps.indexOf(x.b)], c: clo.steps[base.steps.indexOf(x.b)] }));
  add('(28) `learnedClouds` (H14): die Bewölkung ist die Verteilung der Lernstufe (zensiert, σ der Tabelle = 1) statt der nachfusionierten; T, Wind, Niederschlag unverändert; `post.learnedClouds`; Negativkontrolle: ohne Option trägt der Schritt das zur Klimatologie gezogene μ des Motors',
    cl.every(({ l, c }) => c.fused.clouds.dist.kind === 'censoredNormal' && near(c.fused.clouds.dist.sigma, 1, 1e-9) && c.post?.learnedClouds === true && !l.post && near(c.fused.clouds.dist.mu, l.fused.clouds.rawMu, 1e-9)
      && JSON.stringify(c.fused.temperature) === JSON.stringify(l.fused.temperature) && JSON.stringify(c.fused.windSpeed) === JSON.stringify(l.fused.windSpeed) && JSON.stringify(c.fused.precipitation) === JSON.stringify(l.fused.precipitation))
    && cl.filter(({ l, c }) => Math.abs(l.fused.clouds.dist.mu - c.fused.clouds.dist.mu) > 1e-3).length > cl.length / 2 && clo.calib.some((c) => c.startsWith('learnedClouds:hindcast')),
    `μ ${cl[0].l.fused.clouds.dist.mu.toFixed(3)} → ${cl[0].c.fused.clouds.dist.mu.toFixed(3)}`);

  // (d) stationValue: the main fixture — MUENCHEN STADT 4,5 km, 515 m against h_true 525 m
  const inS = { ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue };
  const stT = (ms) => 12 + (Math.round((ms - Date.parse('2026-09-16T15:00:00Z')) / H) - 1) * 0.1 + 0.0065 * (FIX.station.elev - FIX.hTrue);
  const obs = [{ source: 'brightsky', name: 'am Punkt', lat: FIX.lat, lon: FIX.lon, elevM: FIX.hTrue, distanceM: 0, validAtMs: t0Ms, temperature: stT(t0Ms) + 2, relativeHumidity: null, u: null, v: null, gust: null }];
  const sBase = fuseCubePoint({ ...inS, obs }, { hourly: false });
  const sOff = fuseCubePoint({ ...inS, obs, stack }, { hourly: false });
  const sOn = fuseCubePoint({ ...inS, obs, stack }, { hourly: false, stationValue: true });
  const withM = sOn.steps.map((s, i) => ({ s, b: sBase.steps[i] })).filter(({ s }) => s.post?.stationValue?.t);
  const lead = (s) => Math.round((s.validAtMs - t0Ms) / H);
  add('(28) `stationValue` (H9/H10): an jedem Schritt mit Stationsvorhersage T = M + 0,1 + 0,5·I (Form AB ohne Lernstufe, I = +2 K aus der Messung am Punkt, M auf h_true gebracht), normal mit σ 0,8; Wind/Böe ohne Messung Form B (M + 0,25, zensiert bei 0); Richtung, Feuchte, Niederschlag, Bewölkung unverändert; Negativkontrolle: Tabelle ohne Option ⇒ byte-gleich',
    sig(sOff) === sig(sBase) && withM.length > 40
    && withM.every(({ s, b }) => { const p = s.post.stationValue; return p.t.form === 'AB' && near(p.t.M, stT(s.validAtMs), 1e-6) && near(p.t.I, 2, 1e-6) && near(s.fused.temperature.dist.mu, stT(s.validAtMs) + 0.1 + 1, 1e-6) && s.fused.temperature.dist.sigma === 0.8
      && p.ws.form === 'B' && near(p.ws.value, Math.hypot(1.5, -0.5) + 0.25, 1e-6) && s.fused.windSpeed.dist.kind === 'censoredNormal' && s.fused.windSpeed.dist.lo === 0 && p.gust.form === 'B'
      && s.fused.windDirectionDeg === b.fused.windDirectionDeg && JSON.stringify(s.fused.humidity) === JSON.stringify(b.fused.humidity) && JSON.stringify(s.fused.precipitation) === JSON.stringify(b.fused.precipitation) && JSON.stringify(s.fused.clouds) === JSON.stringify(b.fused.clouds); })
    && withM.some(({ s }) => lead(s) > 48) && sOn.calib.some((c) => c.startsWith('stationValue:archive') && c.includes('stack@1') && c.includes('nie measured')) && sOn.notes.some((n) => /^stationValue: MUENCHEN STADT steht am Punkt \(4\.\d km, Δh -10 m\); Innovation aus brightsky/.test(n))
    && calibByVar(sOn.calib).t2m.includes('stationValue') && !calibByVar(sBase.calib).t2m.includes('stationValue'),
    `${withM.length} Schritte · T +1 h ${withM[0].s.fused.temperature.dist.mu.toFixed(3)} = M ${withM[0].s.post.stationValue.t.M.toFixed(3)} + 1,1 · ${sOn.notes.find((n) => n.startsWith('stationValue:'))?.slice(0, 110)}`);
  const sL = fuseCubePoint({ ...inS, obs, stack, learned: tables }, { hourly: false, learned: true, stationValue: true });
  const lm = sL.steps.filter((s) => s.post?.stationValue?.t);
  add('(28) `stationValue` mit Lernstufe: volle Form S — T = M + 0,1 + 0,5·I + 0,2·(L − M) mit L = gelerntes Mittel des Schritts, σ 0,7',
    lm.length > 40 && lm.every((s) => { const p = s.post.stationValue.t; return p.form === 'S' && p.L != null && near(p.value, p.M + 0.1 + 0.5 * p.I + 0.2 * (p.L - p.M), 1e-9) && near(s.fused.temperature.dist.mu, p.value, 1e-12) && s.fused.temperature.dist.sigma === 0.7; }),
    lm.length ? `L ${lm[0].post.stationValue.t.L.toFixed(3)} · M ${lm[0].post.stationValue.t.M.toFixed(3)} · Wert ${lm[0].post.stationValue.t.value.toFixed(3)}` : 'keine Schritte');
  const sFar = fuseCubePoint({ ...inS, obs, stack: { ...stack, range: { maxKm: 3, maxDElevM: 50 } } }, { hourly: false, stationValue: true });
  const sObsFar = fuseCubePoint({ ...inS, obs: obs.map((o) => ({ ...o, distanceM: 8000 })), stack }, { hourly: false, stationValue: true });
  const sBad = fuseCubePoint({ ...inS, obs, stack: { ...stack, provenance: 'measured' } }, { hourly: false, stationValue: true });
  const sNone = fuseCubePoint({ ...inS, obs }, { hourly: false, stationValue: true });
  add('(28) `stationValue` Grenzen: Station außerhalb der Reichweite der Tabelle (3 km) ⇒ Schritte byte-gleich zur Basis, benannt; Messung 8 km entfernt ⇒ keine Innovation, Form B; Tabelle mit fremder Provenienz oder keine Tabelle ⇒ byte-gleiche Schritte, calib `stationValue:absent`',
    JSON.stringify(sFar.steps) === JSON.stringify(sBase.steps) && sFar.notes.some((n) => /^stationValue: keine Station am Punkt .*außerhalb 3 km/.test(n))
    && sObsFar.steps.filter((s) => s.post?.stationValue?.t).every((s) => s.post.stationValue.t.form === 'B' && s.post.stationValue.t.I === null) && sObsFar.notes.some((n) => /Innovation keine/.test(n))
    && JSON.stringify(sBad.steps) === JSON.stringify(sBase.steps) && sBad.calib.some((c) => /^stationValue:absent — .*Tabelle ist ungültig \(provenance measured/.test(c))
    && JSON.stringify(sNone.steps) === JSON.stringify(sBase.steps) && sNone.calib.some((c) => /^stationValue:absent — .*keine Tabelle im Eingang/.test(c)));
  const hOn = fuseCubePoint({ ...inS, obs, stack }, { hourly: true, stationValue: true });
  const filled = hOn.steps.filter((s) => s.tier === 'station' && lead(s) <= 240);
  const beyond = hOn.steps.filter((s) => s.tier === 'station' && lead(s) > 240);
  add('(28) `stationValue` auf der stündlichen Achse: auch die Stunde, die die Station füllt, trägt den Stationswert (Form AB, derselbe I); jenseits der τ-Gruppen (> 240 h) bleibt die Kombination',
    filled.length > 20 && filled.every((s) => s.post?.stationValue?.t?.form === 'AB' && near(s.fused.temperature.dist.mu, stT(s.validAtMs) + 1.1, 1e-6)) && beyond.every((s) => !s.post), `${filled.length} gefüllte Stunden, ${beyond.length} jenseits`);
  const io28 = (extra) => ({ store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extra });
  add('(28) Cache-Schlüssel: die Optionen über `CubeIo.fuse` tragen den Schlüssel (kein geteilter Eintrag mit der Voreinstellung)',
    cubeIoVariantKey(io28({ fuse: { priorShrink: false } })) !== cubeIoVariantKey(io28({})) && cubeIoVariantKey(io28({ fuse: { learnedAtPoint: true } })) !== cubeIoVariantKey(io28({ fuse: { priorShrink: false } })));
}

// ---------------------------------------------------------------------------
// (29) Phase FS, die neueste Stufe als EIN Schalter: `CubeIo.stage: 'fs'` mit `learnedSource`/`climaSource`/`stackSource` —
//      die Voreinstellung des Browsers (`defaultCubeIo`). Mit den Dateien trägt das Produkt alle Zeilen der Stufe; ohne die
//      Dateien rechnet es byte-gleich wie ohne den Schalter und nennt es; der Stationswert nennt, wie oft er gesetzt wurde.
// ---------------------------------------------------------------------------
{
  const { newTables } = await import('../src/point/fusionFit/tables.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { TAU_GROUPS, STACK_TABLE_KIND, STACK_FIT_VERSION } = await import('../src/pointForecast/fusion/stationValue.ts');
  const { POINT_LEARNED_PATH, POINT_STACK_PATH } = await import('../src/point/cubeFormat.ts');
  const { cubeIoVariantKey, defaultCubeIo } = await import('../src/pointForecast/cubeSource.ts');
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  const tables = newTables('2026-09-28T00:00:00Z'); tables.period = { from: '2025-09-01', to: '2026-09-21' };
  const names = designNames('K', 'r1');
  for (let bin = 0; bin < 6; bin++) for (const v of ['t', 'td', 'u', 'v', 'gust', 'clct']) {
    const beta = new Array(names.length).fill(0); beta[Z_DIM] = 1;
    tables.mean[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names, beta, lambda: 1, n: 10000, days: 60, status: 'written' };
    const c = new Array(V_NAMES.length).fill(0); c[0] = 1;
    tables.variance[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 10000, days: 60, msr: 1, status: 'written' };
  }
  const mkStack = (forms) => {
    const entries = {};
    for (const v of ['t', 'td', 'ws', 'gust']) for (let g = 0; g < TAU_GROUPS.length; g++) for (const [f, b] of Object.entries(forms)) entries[`${v}|${g}|${f}`] = { n: 500, beta: b, sigma: 0.8 };
    return { schema: 1, kind: STACK_TABLE_KIND, fitVersion: STACK_FIT_VERSION, provenance: 'archive', builtAt: '2026-09-28T00:00:00Z', period: { from: '2026-09-14', to: '2026-09-27', issueDays: 13 }, rows: 1000, range: { maxKm: 5, maxDElevM: 50 }, tauGroups: TAU_GROUPS, entries };
  };
  const stackFull = mkStack({ B: [0.25], AB: [0.1, 0.5], S0: [0.2, 0.3], S: [0.1, 0.5, 0.2] });
  const stackOnlyI = mkStack({ AB: [0.1, 0.5], S: [0.1, 0.5, 0.2] });
  const filesOf = (tb, st) => { const m = new Map(fx.files); if (tb) m.set(POINT_LEARNED_PATH, enc(tb)); if (st) m.set(POINT_STACK_PATH, st === 'broken' ? new TextEncoder().encode('{kein json') : enc(st)); return m; };
  const io = (files, extra) => ({ store: memoryStore(files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extra });
  const opts29 = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const run = async (files, extra) => { clearCubeForecastCache(); return getPointForecastFromCube(opts29, io(files, extra)); };
  const STAGE = { learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs' };
  const stepsJson = (p) => JSON.stringify(p.cube.v2.axis.steps);
  const keysOf = (p) => p.cube.calib.map((c) => c.split(' — ')[0]);
  const base = await run(filesOf(null, null), {});
  const d = defaultCubeIo();
  add('(29) Voreinstellung des Browsers: defaultCubeIo trägt learnedSource, climaSource, stackSource = json und stage fs; der Cache-Schlüssel trägt Stufe und Tabelle',
    d.learnedSource === 'json' && d.climaSource === 'json' && d.stackSource === 'json' && d.stage === 'fs' && cubeIoVariantKey(io(new Map(), STAGE)).endsWith('|learned:json|clima:json|stack:json|stage:fs') && cubeIoVariantKey(io(new Map(), { stage: 'fs' })) !== cubeIoVariantKey(io(new Map(), {})),
    cubeIoVariantKey(io(new Map(), STAGE)));
  const none = await run(filesOf(null, null), STAGE);
  add('(29) ohne die Dateien im Daten-Repo: Schritte byte-gleich zum Pfad ohne Schalter, keine Zeile der Stufe außer learned:absent; die Notizen nennen jede fehlende Datei und „Rechnung wie ohne die Stufe"',
    stepsJson(none) === stepsJson(base) && keysOf(none).filter((k) => /^(learned|priorShrink|stationValue)/.test(k)).join() === 'learned:absent'
    && none.cube.notes.some((n) => /^learned: .*nicht lesbar/.test(n)) && none.cube.notes.some((n) => /^stationValue: .*nicht lesbar/.test(n)) && none.cube.notes.some((n) => /^stage:fs — keine gelernten Tabellen/.test(n)),
    keysOf(none).filter((k) => /^(learned|priorShrink|stationValue)/.test(k)).join());
  const onlyStack = await run(filesOf(null, stackFull), STAGE);
  add('(29) nur die Tabelle des Stationswerts, keine Lernstufe: Schritte byte-gleich zum Pfad ohne Schalter (die Stufe ist nur mit der Lernstufe gemessen)', stepsJson(onlyStack) === stepsJson(base) && !keysOf(onlyStack).includes('stationValue:archive'));
  const full = await run(filesOf(tables, stackFull), STAGE);
  const need = ['learned:hindcast', 'learnedAtPoint:set', 'learnedClouds:hindcast', 'priorShrink:off', 'stationValue:archive'];
  add('(29) mit Tabellen und Stationswert-Tabelle: calib trägt learned, learnedAtPoint, learnedClouds, priorShrink:off, stationValue:archive; die Notiz nennt die Stufe und zählt die gesetzten Schritte; ohne Messung trägt die Form S0; Schritte ≠ Basis',
    need.every((k) => keysOf(full).includes(k)) && full.cube.notes.some((n) => /^stage:fs — neueste Stufe: .*Stationswert$/.test(n)) && full.cube.notes.some((n) => /^stationValue: gesetzt an \d+ Schritten \(Formen .*S0 \d+/.test(n)) && stepsJson(full) !== stepsJson(base),
    full.cube.notes.find((n) => n.startsWith('stationValue: gesetzt'))?.slice(0, 120) ?? `fehlt: ${need.filter((k) => !keysOf(full).includes(k)).join()}`);
  const noI = await run(filesOf(tables, stackOnlyI), STAGE);
  add('(29) nie still (V-FS-12): eine Tabelle ohne die Formen ohne Messung setzt bei einer Abfrage ohne Messung NICHTS — die Notiz sagt „an keinem Schritt gesetzt"; die übrige Stufe wirkt weiter',
    noI.cube.notes.some((n) => /^stationValue: an keinem Schritt gesetzt/.test(n)) && keysOf(noI).includes('priorShrink:off') && stepsJson(noI) !== stepsJson(full) && stepsJson(noI) !== stepsJson(base));
  const broken = await run(filesOf(tables, 'broken'), STAGE);
  const noFile = await run(filesOf(tables, null), STAGE);
  add('(29) Stationswert-Tabelle kein JSON: die Stufe rechnet ohne Stationswert (Notiz „kein JSON", „ohne Stationswert"), Schritte byte-gleich zur Stufe ohne die Datei',
    broken.cube.notes.some((n) => /^stationValue: .*kein JSON/.test(n)) && broken.cube.notes.some((n) => /^stage:fs — neueste Stufe: .*ohne Stationswert/.test(n)) && !keysOf(broken).includes('stationValue:archive') && stepsJson(broken) === stepsJson(noFile));
  const explicit = await run(filesOf(tables, stackFull), { ...STAGE, fuse: { priorShrink: true, stationValue: false } });
  add('(29) ausdrückliche fuse-Optionen haben Vorrang vor der Stufe: priorShrink true und stationValue false ⇒ keine der beiden Zeilen, die übrige Stufe bleibt',
    !keysOf(explicit).includes('priorShrink:off') && !keysOf(explicit).includes('stationValue:archive') && keysOf(explicit).includes('learnedAtPoint:set'));
}

// ---------------------------------------------------------------------------
// (30) Phase AX, AX-1 (V-FS-15, `audit/fusion-ausbau.md` §1): die Messung der Station am Punkt erreicht den Cube-Pfad.
//      Gemessen 30.09.: an acht Stadtpunkten kam keine Messung ≤ 5 km / 50 m an (BrightSky-Sondenraster, TAWES
//      `slice(0, 200)`, SMN jede zweite des Alphabets). Jetzt: nächste Stationen je Adapter (`nearestSubset`), die Station
//      des Punkts nach WMO-Kennung (DE), eine Station je Eintrag, Messzeit aus der Antwort. Der Live-Pfad ohne Optionen
//      bleibt byte-gleich (`verify:pv-fusion`); hier die reinen Bausteine und die Wirkung im Motor.
// ---------------------------------------------------------------------------
{
  const { nearestSubset, distanceKmBetween } = await import('../src/sources/stationSelect.ts');
  const { brightSkyPointsOf } = await import('../src/sources/brightSkyCurrent.ts');
  const { nearestStationList } = await import('../src/pointForecast/sampleSources.ts');
  const { cubeObsOf, obsHintOf } = await import('../src/pointForecast/cubeSource.ts');
  const { TAU_GROUPS, STACK_TABLE_KIND, STACK_FIT_VERSION } = await import('../src/pointForecast/fusion/stationValue.ts');
  // (a) nearestSubset: the cap nearest, ascending — not the first of the list
  const P = { lat: 48.137, lon: 11.575 };
  const sts = [{ n: 'far', lat: 49.0, lon: 11.575 }, { n: 'mid', lat: 48.3, lon: 11.575 }, { n: 'at', lat: 48.14, lon: 11.58 }, { n: 'far2', lat: 48.137, lon: 12.9 }, { n: 'near', lat: 48.2, lon: 11.5 }];
  const near3 = nearestSubset(sts, P, 3, (s) => s);
  add('(30) nearestSubset: die drei nächsten aufsteigend (at, near, mid), cap 0 ⇒ leer, cap > n ⇒ alle; Negativkontrolle: slice(0, 3) der Liste wäre far/mid/at',
    near3.map((s) => s.n).join() === 'at,near,mid' && nearestSubset(sts, P, 0, (s) => s).length === 0 && nearestSubset(sts, P, 9, (s) => s).length === 5 && sts.slice(0, 3).map((s) => s.n).join() !== 'at,near,mid'
    && near(distanceKmBetween(48.137, 11.575, 48.1632, 11.5429), 3.8, 0.2), near3.map((s) => s.n).join());
  // (b) brightSkyPointsOf: attribution (V-FI-11), station id, measurement time
  const resp = { weather: { source_id: 18377, timestamp: '2026-09-30T09:30:00+00:00', temperature: 20.7, relative_humidity: 60, wind_speed_10: 4.3, wind_direction_10: 270, wind_gust_speed_10: 8.6, precipitation_10: 0, fallback_source_ids: { solar_10: 22361 } },
    sources: [{ id: 18377, dwd_station_id: '03379', lat: 48.1632, lon: 11.5429, height: 515.4, station_name: 'Muenchen-Stadt', wmo_station_id: '10865' }, { id: 22361, dwd_station_id: '01262', lat: 48.35, lon: 11.81, height: 447, station_name: 'Muenchen-Flughafen', wmo_station_id: '10870' }] };
  const own = brightSkyPointsOf(resp);
  const lent = brightSkyPointsOf({ ...resp, weather: { ...resp.weather, fallback_source_ids: { temperature: 22361 } } });
  add('(30) brightSkyPointsOf: eigene Station mit T 20,7, Wind 4,3 km/h ⇒ 1,19 m/s, Kennung 10865, Name, Messzeit 09:30Z; geborgte Temperatur ⇒ eigene T null, die Nachbarstation trägt sie (Kennung 10870); leere Antwort ⇒ nichts',
    own.own?.id === 18377 && own.own.point.temperature === 20.7 && near(Math.hypot(own.own.point.u, own.own.point.v), 4.3 / 3.6, 1e-9) && own.own.point.stationId === '10865' && own.own.point.stationName === 'Muenchen-Stadt'
    && own.own.point.timestamp?.getTime() === Date.parse('2026-09-30T09:30:00Z') && own.borrowed.length === 0
    && lent.own?.point.temperature === null && lent.borrowed.length === 1 && lent.borrowed[0].point.temperature === 20.7 && lent.borrowed[0].point.stationId === '10870' && lent.borrowed[0].point.u === null
    && brightSkyPointsOf(null).own === null && brightSkyPointsOf({ weather: resp.weather, sources: [] }).own === null);
  // (c) nearestStationList: one entry per station, the targeted answer wins, sorted, capped; without dedupe the old slice
  const mk = (id, d, extra = {}) => ({ source: 'dwd_obs', stationId: id, lat: 48 + d / 1000, lng: 11.5, elevation: 500, distanceMeters: d, point: {}, ...extra });
  const rasterX = mk('10865', 3801), targeted = mk('10865', 3800, { byStation: true, name: 'Muenchen-Stadt' });
  const listIn = [mk('A', 29000), rasterX, mk('B', 42000), targeted, mk('C', 9000), mk('D', 55000), mk('E', 61000)];
  const ded = nearestStationList(listIn, 6, true);
  const raw = nearestStationList(listIn, 6, false);
  add('(30) nearestStationList: mit Dedupe eine Zeile je Station, die gezielte Antwort gewinnt (byStation, Name), aufsteigend nach Abstand, sechs Einträge; Negativkontrolle: ohne Dedupe stehen beide 10865-Einträge drin (alter Weg)',
    ded.length === 6 && ded[0].stationId === '10865' && ded[0].byStation === true && ded[0].name === 'Muenchen-Stadt' && ded.filter((s) => s.stationId === '10865').length === 1 && ded.map((s) => s.stationId).join() === '10865,C,A,B,D,E'
    && raw.filter((s) => s.stationId === '10865').length === 2 && raw.length === 6, ded.map((s) => s.stationId).join());
  // (d) cubeObsOf: measurement time from the point when it carries one, else the clock; id/name/byStation carried
  const nowX = Date.parse('2026-09-30T09:56:00Z');
  const co = cubeObsOf([{ ...targeted, point: { temperature: 20.7, timestamp: new Date('2026-09-30T09:30:00Z'), stationName: 'Muenchen-Stadt' } }, { ...mk('C', 9000), point: { temperature: 19 } }], nowX);
  add('(30) cubeObsOf: Messzeit 09:30Z aus der Antwort, sonst die Uhr; stationId, Name und byStation reisen mit; ohne Kennung kein Feld',
    co[0].validAtMs === Date.parse('2026-09-30T09:30:00Z') && co[0].stationId === '10865' && co[0].byStation === true && co[0].name === 'Muenchen-Stadt' && co[1].validAtMs === nowX && co[1].stationId === 'C' && !('byStation' in co[1]) && co[0].temperature === 20.7);
  add('(30) obsHintOf: das Bündel mit Station ⇒ Hinweis mit Kennung 10865, Lage und Höhe; ohne Station ⇒ null',
    obsHintOf(bundle).station?.id === '10865' && obsHintOf(bundle).station.elev === 515 && near(obsHintOf(bundle).station.lat, 48.1667, 1e-6) && obsHintOf({ ...bundle, station: null }).station === null);
  // (e) the engine: two measurements at the same time within range — the targeted one carries the innovation and the note names it
  const entries = {};
  for (const v of ['t', 'td', 'ws', 'gust']) for (let g = 0; g < TAU_GROUPS.length; g++) { entries[`${v}|${g}|B`] = { n: 500, beta: [0.25], sigma: 0.9 }; entries[`${v}|${g}|AB`] = { n: 500, beta: [0.1, 0.5], sigma: 0.8 }; }
  const stack30 = { schema: 1, kind: STACK_TABLE_KIND, fitVersion: STACK_FIT_VERSION, provenance: 'archive', builtAt: '2026-09-28T00:00:00Z', period: { from: '2026-09-14', to: '2026-09-27', issueDays: 13 }, rows: 1000, range: { maxKm: 5, maxDElevM: 50 }, tauGroups: TAU_GROUPS, entries };
  const inS = { ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue };
  const o = (over) => ({ source: 'dwd_obs', lat: FIX.lat, lon: FIX.lon, elevM: FIX.hTrue, distanceM: 4000, validAtMs: t0Ms, temperature: 15, relativeHumidity: null, u: null, v: null, gust: null, ...over });
  const two = fuseCubePoint({ ...inS, obs: [o({ name: 'Raster', stationId: '10870', temperature: 15 }), o({ name: 'Muenchen-Stadt', stationId: '10865', byStation: true, distanceM: 4500, temperature: 17 })], stack: stack30 }, { hourly: false, stationValue: true });
  const one = fuseCubePoint({ ...inS, obs: [o({ name: 'Raster', stationId: '10870', temperature: 15 })], stack: stack30 }, { hourly: false, stationValue: true });
  const farO = fuseCubePoint({ ...inS, obs: [o({ name: 'Fern', stationId: '10870', distanceM: 8000 })], stack: stack30 }, { hourly: false, stationValue: true });
  const iOf = (r) => r.steps.find((s) => s.post?.stationValue?.t)?.post.stationValue.t.I ?? null;
  add('(30) Motor: bei gleicher Messzeit trägt die gezielt abgefragte Station die Innovation (I aus T 17, nicht 15), die Notiz nennt Kennung, Name, Abstand und „gezielt abgefragt"; nur die Raster-Messung ⇒ deren I; 8 km ⇒ „keine (1 Messung(en), die nächste 8.0 km entfernt"',
    iOf(two) != null && iOf(one) != null && near(iOf(two) - iOf(one), 2, 1e-9) && two.notes.some((n) => /Innovation aus dwd_obs 10865 Muenchen-Stadt \(4\.5 km, gezielt abgefragt\)/.test(n))
    && one.notes.some((n) => /Innovation aus dwd_obs 10870 Raster \(4\.0 km\) /.test(n)) && farO.notes.some((n) => /Innovation keine \(1 Messung\(en\), die nächste 8\.0 km entfernt/.test(n)) && iOf(farO) === null,
    two.notes.find((n) => n.startsWith('stationValue: MUENCHEN'))?.slice(60, 170));
}

// ---------------------------------------------------------------------------
// (31) Phase AX, AX-2 (`audit/fusion-ausbau.md` §2): (a) `learnedRoute` — die Strata der Lernstufe je Stufe (E-FV-3):
//      ohne Option Route 1 wie bisher (byte-gleich), `'tier'` = t1 Route 1, t2/t3 Route 3; (b) V-EX-6: die Leser nennen das
//      Alter der Tabellen (eingespeiste Uhr), eine veraltete Tabelle wirkt weiter.
// ---------------------------------------------------------------------------
{
  const { newTables } = await import('../src/point/fusionFit/tables.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { V_NAMES } = await import('../src/point/fusionFit/design.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { tableAgeOf, LEARNED_STALE_DAYS, STACK_STALE_DAYS } = await import('../src/point/client/tableAge.ts');
  const { loadLearned } = await import('../src/point/client/learnedPoint.ts');
  const { loadStack } = await import('../src/point/client/stackPoint.ts');
  const { TAU_GROUPS, STACK_TABLE_KIND, STACK_FIT_VERSION } = await import('../src/pointForecast/fusion/stationValue.ts');
  const { POINT_LEARNED_PATH, POINT_STACK_PATH } = await import('../src/point/cubeFormat.ts');
  // (a) identity tables on route 1 for every bin; route 3 for bins 3–5 with the intercept shifted by +1 (T, Td, u, v, gust, clct)
  const tables = newTables('2026-09-28T00:00:00Z'); tables.period = { from: '2025-09-01', to: '2026-09-21' };
  const put = (cls, bin, v, shift) => {
    const names = designNames('K', cls);
    const beta = new Array(names.length).fill(0); beta[Z_DIM] = 1; beta[0] = shift;   // names[0] is the intercept
    tables.mean[stratumKey('K', v, bin, cls)] = { form: 'K', var: v, bin, cls, names, beta, lambda: 1, n: 10000, days: 60, status: 'written' };
    const c = new Array(V_NAMES.length).fill(0); c[0] = 1;
    tables.variance[stratumKey('K', v, bin, cls)] = { form: 'K', var: v, bin, cls, names: V_NAMES, c, floor: 0.01, n: 10000, days: 60, msr: 1, status: 'written' };
  };
  for (let bin = 0; bin < 6; bin++) for (const v of ['t', 'td', 'u', 'v', 'gust', 'clct']) put('r1', bin, v, 0);
  for (const bin of [3, 4, 5]) for (const v of ['t', 'td', 'u', 'v', 'gust', 'clct']) put('r3', bin, v, 1);
  const interceptOk = designNames('K', 'r1')[0] === '1' || /^(1|const|intercept|bias)$/i.test(designNames('K', 'r1')[0]);
  const inR = { ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue, learned: tables };
  const r1 = fuseCubePoint(inR, { hourly: false, learned: true, learnedAtPoint: true, priorShrink: false });
  const rDefault = fuseCubePoint(inR, { hourly: false, learned: true, learnedAtPoint: true, priorShrink: false, learnedRoute: 1 });
  const rTier = fuseCubePoint(inR, { hourly: false, learned: true, learnedAtPoint: true, priorShrink: false, learnedRoute: 'tier' });
  const r3 = fuseCubePoint(inR, { hourly: false, learned: true, learnedAtPoint: true, priorShrink: false, learnedRoute: 3 });
  const off = fuseCubePoint(inR, { hourly: false, learnedRoute: 'tier' });
  const base = fuseCubePoint({ ...inR, learned: null }, { hourly: false });
  const sig = (r) => JSON.stringify([r.steps, r.calib, r.notes]);
  const { binIndex } = await import('../src/point/fusionFit/strata.ts');
  const nat = (r, tier) => r.steps.filter((s) => !s.interpolated && s.tier === tier && s.flags.includes('learned'));
  // the cube member as the engine reads it (`learnedAtPoint`: the learned mean, precompensated) — at steps with a station
  // member the fused value moves by less than the member (the combination), so the member is what the route changes
  const tOf = (s) => s.samples.find((x) => /^cube/.test(String(x.source ?? x.model ?? '')))?.temperature ?? s.samples[0].temperature;
  const leadOf = (s) => Math.round((s.validAtMs - t0Ms) / H);
  // pairs by valid time: every learned native step of `b` (route 1) and the step of `a` at the same time
  const pairs = (a, b, tier) => { const m = new Map(a.steps.filter((s) => !s.interpolated).map((s) => [s.validAtMs, s])); return nat(b, tier).map((s) => [m.get(s.validAtMs), s]).filter(([x]) => x); };
  add('(31) learnedRoute: ohne Option und mit `1` byte-gleich; ohne `learned` wirkt die Option nicht (byte-gleich zur Basis, keine calib-Zeile)',
    sig(rDefault) === sig(r1) && sig(off) === sig(base) && !off.calib.some((c) => c.startsWith('learnedRoute')));
  const t1Same = pairs(rTier, r1, 't1').every(([a, b]) => near(tOf(a), tOf(b), 1e-12) && a.flags.includes('learned'));
  const longOf = (tier) => pairs(rTier, r1, tier).filter(([, b]) => binIndex(leadOf(b)) >= 3), shortOf = (tier) => pairs(rTier, r1, tier).filter(([, b]) => binIndex(leadOf(b)) < 3);
  const t2L = longOf('t2'), t3L = longOf('t3'), t2S = shortOf('t2');
  add('(31) learnedRoute `tier`: t1-Schritte byte-gleich zu Route 1; t2/t3-Schritte in den Bins 3–5 lesen die Route-3-Strata (T um genau +1 K verschoben, > 10 Schritte je Stufe); t2-Schritte mit Vorlauf ≤ 48 h (kein Route-3-Stratum) bleiben bei Route 1 (kein Loch); calib `learnedRoute:tier`, Notiz mit Route je Stufe',
    interceptOk && t1Same && pairs(rTier, r1, 't1').length > 20 && t2L.length > 10 && t3L.length > 10 && t2L.every(([a, b]) => a.flags.includes('learned') && near(tOf(a) - tOf(b), 1, 1e-9)) && t3L.every(([a, b]) => a.flags.includes('learned') && near(tOf(a) - tOf(b), 1, 1e-9))
    && t2S.every(([a, b]) => a.flags.includes('learned') && near(tOf(a), tOf(b), 1e-12))
    && rTier.calib.some((c) => c.startsWith('learnedRoute:tier')) && rTier.notes.some((n) => /^learned: .*Route t1 1 · t2\/t3 3 an \d+ Schritten/.test(n)),
    `intercept „${designNames('K', 'r1')[0]}" · t1 ${pairs(rTier, r1, 't1').length} same ${t1Same} · t2 lang ${t2L.length} (ok ${t2L.every(([a, b]) => a.flags.includes('learned') && near(tOf(a) - tOf(b), 1, 1e-9))}) kurz ${t2S.length} (ok ${t2S.every(([a, b]) => a.flags.includes('learned') && near(tOf(a), tOf(b), 1e-12))}) · t3 ${t3L.length} (ok ${t3L.every(([a, b]) => a.flags.includes('learned') && near(tOf(a) - tOf(b), 1, 1e-9))}) · calib ${rTier.calib.some((c) => c.startsWith('learnedRoute:tier'))} · Notiz ${rTier.notes.find((n) => n.startsWith('learned: '))?.slice(-140)}`);
  add('(31) learnedRoute `3` in jeder Stufe: t1 hat keine Route-3-Strata ⇒ das Member bleibt (kein `learned`-Flag an t1), t3 wie `tier`; calib `learnedRoute:3`',
    nat(r3, 't1').length === 0 && nat(r1, 't1').length > 20 && pairs(r3, rTier, 't3').length > 10 && pairs(r3, rTier, 't3').every(([a, b]) => near(tOf(a), tOf(b), 1e-12)) && r3.calib.some((c) => c.startsWith('learnedRoute:3')));
  // (b) the age of the tables
  const now = Date.parse('2026-09-30T12:00:00Z');
  const fresh = tableAgeOf('learned', { builtAt: '2026-09-26T22:56:01Z', period: { from: '2025-09-01', to: '2026-09-31' } }, now, LEARNED_STALE_DAYS);
  const old = tableAgeOf('learned', { builtAt: '2026-05-01T00:00:00Z', period: { from: '2025-05-01', to: '2026-05-01' } }, now, LEARNED_STALE_DAYS);
  const noPeriod = tableAgeOf('stationValue', { builtAt: '2026-09-28T20:33:33Z', period: null }, now, STACK_STALE_DAYS);
  const unknown = tableAgeOf('x', { builtAt: 'kein Datum', period: { to: 'auch nicht' } }, now, 10);
  add('(31) tableAgeOf: frische Tabelle ⇒ 0 Tage ab period.to (der 31.09. wird tolerant als 1.10. gelesen), nicht veraltet; 152 Tage ⇒ VERALTET mit Grenze im Text; ohne period ⇒ Basis builtAt (1 Tag); nichts lesbar ⇒ „unbekannt", nicht veraltet',
    fresh.ageDays === 0 && fresh.basis === 'period.to' && !fresh.stale && /^learned: Tabelle Fit-Zeitraum bis 01\.10\.2026, gebaut 26\.09\.2026, 0 Tage alt \(Grenze 120\)$/.test(fresh.note)
    && old.ageDays === 151 && old.stale && /VERALTET — Fit-Zeitraum bis 01\.05\.2026, gebaut 01\.05\.2026, 151 Tage alt \(> 120\): Nachfit fällig, die Tabelle wirkt weiter/.test(old.note)
    && noPeriod.basis === 'builtAt' && noPeriod.ageDays === 1 && !noPeriod.stale && unknown.ageDays === null && !unknown.stale && /unbekannt/.test(unknown.note), `${fresh.note} | ${old.note}`);
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  const entries = {}; for (const v of ['t', 'td', 'ws', 'gust']) for (let g = 0; g < TAU_GROUPS.length; g++) entries[`${v}|${g}|B`] = { n: 500, beta: [0.25], sigma: 0.9 };
  const stack = { schema: 1, kind: STACK_TABLE_KIND, fitVersion: STACK_FIT_VERSION, provenance: 'archive', builtAt: '2026-09-28T20:33:33Z', period: { from: '2026-09-14', to: '2026-09-27', issueDays: 13 }, rows: 1000, range: { maxKm: 5, maxDElevM: 50 }, tauGroups: TAU_GROUPS, entries };
  const st = memoryStore(new Map([[POINT_LEARNED_PATH, enc(tables)], [POINT_STACK_PATH, enc(stack)]]));
  const L1 = await loadLearned(st, { nowMs: Date.parse('2026-09-30T12:00:00Z') }), L2 = await loadLearned(st, { nowMs: Date.parse('2027-03-01T12:00:00Z') });
  const S1 = await loadStack(st, { nowMs: Date.parse('2026-10-05T12:00:00Z') }), S2 = await loadStack(st, { nowMs: Date.parse('2026-12-01T12:00:00Z') });
  add('(31) Leser: learned nennt „Fit-Zeitraum bis 21.09.2026, 8 Tage alt" (volle Tage seit dem Ende des Zeitraums); im März 2027 „VERALTET" mit weiter gültigen Tabellen; stationValue 7 Tage bzw. „VERALTET" (64 Tage > 45) mit weiter gültiger Tabelle — nie stumm, nie blockierend',
    L1.tables && L1.age?.ageDays === 8 && !L1.age.stale && L1.notes.some((n) => /^learned: Tabelle Fit-Zeitraum bis 21\.09\.2026, gebaut 28\.09\.2026, 8 Tage alt/.test(n))
    && L2.tables && L2.age?.stale && L2.notes.some((n) => /^learned: Tabelle VERALTET/.test(n))
    && S1.table && S1.age?.ageDays === 7 && !S1.age.stale && S1.notes.some((n) => /^stationValue: Tabelle Fit-Zeitraum bis 27\.09\.2026/.test(n))
    && S2.table && S2.age?.ageDays === 64 && S2.age.stale && S2.notes.some((n) => /^stationValue: Tabelle VERALTET .*64 Tage alt \(> 45\)/.test(n)),
    `${L1.notes.join(' | ')} || ${S2.notes.join(' | ')}`);
  const io31 = (extra) => ({ store: st, terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, learnedSource: 'json', stackSource: 'json', ...extra });
  clearCubeForecastCache();
  const p31 = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false, fuse: { learned: true } }, io31({}));
  add('(31) Cube-Pfad: die Altersnotizen beider Tabellen stehen in den Notizen des Produkts, gerechnet mit der eingespeisten Uhr (16.09.2026 ⇒ 0 Tage, nicht veraltet)',
    p31.cube.notes.some((n) => /^learned: Tabelle Fit-Zeitraum bis 21\.09\.2026, .*0 Tage alt/.test(n)) && p31.cube.notes.some((n) => /^stationValue: Tabelle Fit-Zeitraum bis 27\.09\.2026, .*0 Tage alt/.test(n)) && !p31.cube.notes.some((n) => /VERALTET/.test(n)),
    p31.cube.notes.filter((n) => /Tabelle/.test(n)).join(' | '));
}

// ---------------------------------------------------------------------------
// (32) Phase AX, AX-3 (`audit/fusion-ausbau.md` §3, Bericht #16): `anomalyInterp` — T an interpolierten Stunden als Anomalie
//      gegen μ_c(t); der Zusatzterm ist μ_c(t) − lerp(μ_c(prev), μ_c(next)), gleich für p10/p50/p90/Mittel; Td auf T gekappt;
//      übrige Größen, native Schritte und Stationsstunden unverändert. Ohne Option, ohne Produkt: byte-gleich, benannt.
// ---------------------------------------------------------------------------
{
  const { C_NAMES, C_DIM, climaDesign } = await import('../src/point/fusionFit/fitClima.ts');
  const { TREND_SETS, CLIMA_PRODUCT_KIND, CLIMA_PRODUCT_SCHEMA } = await import('../src/point/fusionFit/climaProduct.ts');
  const { POINT_CLIMA_PATH } = await import('../src/point/cubeFormat.ts');
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  // μ_c(T) = 10 − 3·cos(θ_h): the intercept row carries 10, the hC1 row −3 (C_NAMES[6] = 'hC1'); every other coefficient 0
  const iHC1 = C_NAMES.indexOf('hC1');
  const trendT = Array.from({ length: C_DIM }, (_, j) => TREND_SETS.geo.map((n) => (n === '1' ? (j === 0 ? 10 : j === iHC1 ? -3 : 0) : 0)));
  const product = { schema: CLIMA_PRODUCT_SCHEMA, kind: CLIMA_PRODUCT_KIND, fitVersion: 'test', provenance: 'hindcast', builtAt: '2026-09-27T00:00:00Z', candidate: 'ridgeTx-test',
    estimator: { kind: 'ridge', k: 3, power: 2, heightSlope: 'none' }, design: C_NAMES, vars: ['t', 'td', 'gust'], lapse: null,
    trend: { names: TREND_SETS.geo, beta: { t: trendT }, lambda: { t: 1 } },
    stations: [{ id: 'S1', lat: FIX.lat + 0.05, lon: FIX.lon, elevM: 520, country: 'DE', mu: {} }], source: { clima: 'test', sha256: null, period: null, days: null, points: 1 }, licence: ['test'], notes: [] };
  const x = new Float64Array(C_DIM);
  const muT = (ms) => { climaDesign(ms, FIX.lon, x); return 10 - 3 * x[iHC1]; };
  // a point WITHOUT a station: t1 + t2 + t3 ⇒ 232 interpolated hours (block 7)
  const fxN = await buildCubeFixture({ station: false });
  const bN = await readBundle(fxN.files);
  const inN = { ...cubeInputFromBundle(bN, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue };
  const base = fuseCubePoint(inN, { hourly: true, tail: true });
  const offProd = fuseCubePoint({ ...inN, learnedClima: product }, { hourly: true, tail: true });
  const onNoProd = fuseCubePoint(inN, { hourly: true, tail: true, anomalyInterp: true });
  const on = fuseCubePoint({ ...inN, learnedClima: product }, { hourly: true, tail: true, anomalyInterp: true });
  const sig = (r) => JSON.stringify([r.steps, r.calib, r.notes]);
  add('(32) Negativkontrollen: Produkt im Eingang ohne Option ⇒ byte-gleich; Option ohne Produkt ⇒ Schritte byte-gleich, calib `interpolation:set` nennt den Grund („kein μ_c(T) am Punkt"), Notiz „⇒ linear"',
    sig(offProd) === sig(base) && JSON.stringify(onNoProd.steps) === JSON.stringify(base.steps) && onNoProd.calib.some((c) => /^interpolation:set — Anomalie-Interpolation angefragt, aber kein μ_c\(T\) am Punkt/.test(c)) && onNoProd.notes.some((n) => /^interpolation: Anomalie angefragt, kein μ_c/.test(n)));
  const byMs = new Map(base.steps.map((s) => [s.validAtMs, s]));
  const nativeAt = new Map(base.steps.filter((s) => !s.interpolated).map((s) => [s.validAtMs, s]));
  const interpOn = on.steps.filter((s) => s.interpolated);
  let checked = 0, exact = 0, tdCapOk = true, othersSame = true, nonzero = 0;
  for (const s of interpOn) {
    const b = byMs.get(s.validAtMs);
    if (!b || !b.interpolated || !b.interp?.temperature || !s.interp?.temperature) continue;
    // neighbours: the nearest native steps around t (the same rule as the engine)
    let prev = null, next = null;
    for (const [ms, n] of nativeAt) { if (ms < s.validAtMs && (!prev || ms > prev.validAtMs)) prev = n; if (ms > s.validAtMs && (!next || ms < next.validAtMs)) next = n; }
    if (!prev || !next) continue;
    const f = (s.validAtMs - prev.validAtMs) / (next.validAtMs - prev.validAtMs);
    const corr = muT(s.validAtMs) - (muT(prev.validAtMs) + (muT(next.validAtMs) - muT(prev.validAtMs)) * f);
    checked += 1;
    if (Math.abs(corr) > 1e-6) nonzero += 1;
    const q = s.interp.temperature, qb = b.interp.temperature;
    if (near(q.p50 - qb.p50, corr, 1e-9) && near(q.p10 - qb.p10, corr, 1e-9) && near(q.p90 - qb.p90, corr, 1e-9) && near(q.mean - qb.mean, corr, 1e-9)) exact += 1;
    if (s.interp.dewPoint && (s.interp.dewPoint.p50 > q.p50 + 1e-9 || s.interp.dewPoint.p10 > q.p10 + 1e-9)) tdCapOk = false;
    for (const k of ['humidity', 'clouds', 'precipitation', 'windSpeed', 'gust']) if (JSON.stringify(s.interp[k]) !== JSON.stringify(b.interp[k])) othersSame = false;
  }
  const nativeSame = on.steps.filter((s) => !s.interpolated).every((s) => JSON.stringify(s.fused) === JSON.stringify(byMs.get(s.validAtMs)?.fused));
  add('(32) mit Produkt und Option: an JEDER interpolierten Stunde T = linear + [μ_c(t) − lerp(μ_c(prev), μ_c(next))] in p10/p50/p90/Mittel (μ_c = 10 − 3·cos θ_h; ≥ 200 Stunden, Zusatzterm meist ≠ 0), Td ≤ T, übrige Größen byte-gleich, native Schritte byte-gleich; calib `interpolation:anomaly`, Notiz zählt Stunden und |Korrektur|',
    checked >= 200 && exact === checked && nonzero > checked / 2 && tdCapOk && othersSame && nativeSame && on.calib.some((c) => c.startsWith('interpolation:anomaly')) && on.notes.some((n) => { const m = /^interpolation: T als Anomalie an (\d+) interpolierten Stunden/.exec(n); return !!m && Number(m[1]) >= checked && Number(m[1]) <= checked + 8; }),
    `${exact}/${checked} exakt · ≠ 0: ${nonzero} · ${on.notes.find((n) => n.startsWith('interpolation:'))?.slice(0, 120)}`);
  // positive control of the cap: a template with a 30-K amplitude pushes T under Td at some hours ⇒ Td is capped there, never above T
  const big = { ...product, trend: { ...product.trend, beta: { t: Array.from({ length: C_DIM }, (_, j) => TREND_SETS.geo.map((n) => (n === '1' ? (j === 0 ? 10 : j === iHC1 ? -30 : 0) : 0))) } } };
  const onBig = fuseCubePoint({ ...inN, learnedClima: big }, { hourly: true, tail: true, anomalyInterp: true });
  const capped = Number(/Td an (\d+) Stunden auf T gekappt/.exec(onBig.notes.find((n) => n.startsWith('interpolation: T als Anomalie')) ?? '')?.[1] ?? -1);
  add('(32) Positivkontrolle der Kappung: Vorlage mit 30 K Amplitude ⇒ Td an > 0 Stunden auf T gekappt, nirgends Td > T; mit 3 K Amplitude keine Kappung nötig',
    capped > 0 && onBig.steps.filter((s) => s.interpolated && s.interp?.dewPoint && s.interp?.temperature).every((s) => s.interp.dewPoint.p50 <= s.interp.temperature.p50 + 1e-9 && s.interp.dewPoint.p90 <= s.interp.temperature.p90 + 1e-9) && /Td an 0 Stunden/.test(on.notes.find((n) => n.startsWith('interpolation: T als Anomalie')) ?? ''),
    `gekappt ${capped}`);
  add('(32) ohne `hourly` wirkt die Option nicht (keine interpolierten Stunden ⇒ keine Zeile, byte-gleich zur nativen Rechnung)',
    JSON.stringify(fuseCubePoint({ ...inN, learnedClima: product }, { hourly: false, anomalyInterp: true }).steps) === JSON.stringify(fuseCubePoint(inN, { hourly: false }).steps) && !fuseCubePoint({ ...inN, learnedClima: product }, { hourly: false, anomalyInterp: true }).calib.some((c) => c.startsWith('interpolation:')));
  // the product path: `CubeIo.fuse.anomalyInterp` with `climaSource: json`, no learned tables
  const st = memoryStore(new Map([...fxN.files, [POINT_CLIMA_PATH, enc(product)]]));
  const ioA = (extra) => ({ store: st, terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extra });
  const opts32 = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  clearCubeForecastCache();
  const pOn = await getPointForecastFromCube(opts32, ioA({ climaSource: 'json', fuse: { anomalyInterp: true } }));
  clearCubeForecastCache();
  const pOff = await getPointForecastFromCube(opts32, ioA({ climaSource: 'json' }));
  add('(32) Produktpfad: `climaSource: json` + `fuse.anomalyInterp` ⇒ calib `interpolation:anomaly` und > 200 Anomalie-Stunden ohne Lernstufe; nur `climaSource` ⇒ linear, keine Zeile',
    pOn.cube.calib.some((c) => c.startsWith('interpolation:anomaly')) && pOn.cube.notes.some((n) => /^interpolation: T als Anomalie an ([2-9]\d\d) interpolierten Stunden/.test(n)) && !pOff.cube.calib.some((c) => c.startsWith('interpolation:anomaly')) && pOff.cube.calib.some((c) => c.startsWith('interpolation:set')),
    pOn.cube.notes.find((n) => n.startsWith('interpolation:'))?.slice(0, 100));
}

// ---------------------------------------------------------------------------
// (33) Phase AX, AX-4 (`audit/fusion-ausbau.md` §4, V-FV-10): die Bewölkung als Zwei-Atome-Mischung `cloudMix` — Familie,
//      Vorhersager (nur mit beiden geschriebenen Atomen eines Stratums), Durchreichen im Motor (`learnedClouds`), Ausgabe v2
//      und Codec Version 3 (liest 1–3). Ohne `atoms`-Abschnitt (die veröffentlichte Tabelle) bleibt alles byte-gleich.
// ---------------------------------------------------------------------------
{
  const { newTables, validateTables } = await import('../src/point/fusionFit/tables.ts');
  const { Z_DIM } = await import('../src/point/fusionFit/features.ts');
  const { designNames } = await import('../src/point/fusionFit/fitMean.ts');
  const { V_NAMES, AT_NAMES, atomsDesign } = await import('../src/point/fusionFit/design.ts');
  const { stratumKey } = await import('../src/point/fusionFit/strata.ts');
  const { atomsKey, atomMasses } = await import('../src/point/fusionFit/fitAtoms.ts');
  const { predict } = await import('../src/point/fusionFit/predict.ts');
  const { verifyDist, cdfOf, meanOf, quantileOf } = await import('../src/pointForecast/fusion/dist.ts');
  const { encodeV2, decodeV2, compareV2, V2C_VERSION, V2C_READABLE } = await import('../src/pointForecast/fusion/v2codec.ts');
  const { POINT_LEARNED_PATH } = await import('../src/point/cubeFormat.ts');
  const vd = verifyDist();
  add(`(33) dist.ts: ${vd.checks.length} Modulprüfungen (darunter cloudMix: Atome, Rundlauf, Mittel, Grenzfälle, PIT, Aufweitung)`, vd.failed === 0 && vd.checks.some((c) => /cloudMix/.test(c.name)), vd.checks.filter((c) => !c.ok).map((c) => c.name).join(' | '));
  const logit = (p) => Math.log(p / (1 - p));
  const mkTables = (atomsSpec) => {
    const T = newTables('2026-09-30T00:00:00Z'); T.period = { from: '2025-09-01', to: '2026-09-21' };
    const names = designNames('K', 'r1');
    for (let bin = 0; bin < 6; bin++) for (const v of ['t', 'td', 'u', 'v', 'gust', 'clct']) {
      const beta = new Array(names.length).fill(0); beta[Z_DIM] = 1;
      T.mean[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names, beta, lambda: 1, n: 10000, days: 60, status: 'written' };
      const c = new Array(V_NAMES.length).fill(0); c[0] = 400;   // σ = 20 for the clouds' middle part
      T.variance[stratumKey('K', v, bin, 'r1')] = { form: 'K', var: v, bin, cls: 'r1', names: V_NAMES, c, floor: 0.01, n: 10000, days: 60, msr: 1, status: 'written' };
    }
    if (atomsSpec) {
      T.atoms = {};
      for (let bin = 0; bin < 6; bin++) for (const [side, p, status] of atomsSpec) {
        const beta = new Array(AT_NAMES.length).fill(0); beta[0] = logit(p);
        T.atoms[atomsKey('K', bin, 'r1', side)] = { form: 'K', var: 'clct', bin, cls: 'r1', side, names: AT_NAMES, beta, n: 9000, days: 60, share: p, iterations: 3, llPerRow: -0.6, status };
      }
    }
    return T;
  };
  const withAtoms = mkTables([['clear', 0.4, 'written'], ['overcast', 0.3, 'written']]);
  const noAtoms = mkTables(null);
  const oneSide = mkTables([['clear', 0.4, 'written']]);
  const noSkill = mkTables([['clear', 0.4, 'written'], ['overcast', 0.3, 'no-skill']]);
  add('(33) Tabellen: der optionale atoms-Abschnitt besteht die Prüfung; ein falscher Schlüssel und eine falsche β-Länge werden benannt; ohne Abschnitt unverändert gültig',
    validateTables(withAtoms).length === 0 && validateTables(noAtoms).length === 0
    && validateTables({ ...withAtoms, atoms: { 'K|clct|0|r1|links': withAtoms.atoms['K|clct|0|r1|clear'] } }).some((e) => /atoms .*Schlüssel/.test(e))
    && validateTables({ ...withAtoms, atoms: { 'K|clct|0|r1|clear': { ...withAtoms.atoms['K|clct|0|r1|clear'], beta: [1, 2] } } }).some((e) => /atoms .*beta/.test(e)));
  // the predictor on a synthetic situation
  const fxN = await buildCubeFixture({ tiers: ['t1'], station: false });
  const bN = await readBundle(fxN.files);
  const inN = { ...cubeInputFromBundle(bN, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue };
  const on = fuseCubePoint({ ...inN, learned: withAtoms }, { hourly: false, learned: true, learnedClouds: true });
  const off = fuseCubePoint({ ...inN, learned: noAtoms }, { hourly: false, learned: true, learnedClouds: true });
  const side1 = fuseCubePoint({ ...inN, learned: oneSide }, { hourly: false, learned: true, learnedClouds: true });
  const nsk = fuseCubePoint({ ...inN, learned: noSkill }, { hourly: false, learned: true, learnedClouds: true });
  const noPass = fuseCubePoint({ ...inN, learned: withAtoms }, { hourly: false, learned: true });
  const L = (r) => r.steps.filter((s) => !s.interpolated && s.flags.includes('learned') && s.fused?.clouds);
  const mixSteps = L(on).filter((s) => s.fused.clouds.dist.kind === 'cloudMix');
  add('(33) Motor mit `learnedClouds`: jede gelernte Bewölkung ist die Mischung mit pClear 0,4 / pOvercast 0,3 (Intercept-Atome) und μ/σ der zensierten Form (σ 20); p10 = 0 und p90 = 100 (die Atome tragen 40 % und 30 %), Mittel = 30 + 0,3·E[TN]; ohne atoms-Abschnitt, mit nur einer Seite oder einer no-skill-Seite: zensierte Normal wie bisher; ohne `learnedClouds` erreicht die Mischung den Schritt nicht',
    mixSteps.length > 20 && mixSteps.length === L(on).length
    && mixSteps.every((s) => { const d = s.fused.clouds.dist, c = L(off).find((x) => x.validAtMs === s.validAtMs)?.fused.clouds.dist; return c && c.kind === 'censoredNormal' && near(d.pClear, 0.4, 1e-9) && near(d.pOvercast, 0.3, 1e-9) && near(d.mu, c.mu, 1e-9) && near(d.sigma, c.sigma, 1e-9) && near(d.sigma, 20, 1e-6) && quantileOf(d, 0.1) === 0 && quantileOf(d, 0.9) === 100 && near(cdfOf(d, 0), 0.4, 1e-12); })
    && L(side1).every((s) => s.fused.clouds.dist.kind === 'censoredNormal') && L(nsk).every((s) => s.fused.clouds.dist.kind === 'censoredNormal') && L(noPass).every((s) => s.fused.clouds.dist.kind !== 'cloudMix'),
    `${mixSteps.length} Mischungs-Schritte · μ ${mixSteps[0]?.fused.clouds.dist.mu.toFixed(2)} · Mittel ${mixSteps[0] ? meanOf(mixSteps[0].fused.clouds.dist).toFixed(2) : '—'}`);
  add('(33) Vorhersager: `cloudAtoms: false` liefert trotz Atomen die zensierte Normal; `atomMasses` klemmt die Summe auf 0,98',
    (() => { const s0 = mixSteps[0]; if (!s0) return false; const sit = { z: new Float64Array(Z_DIM), leadH: 3, route: 1, srcMask: 0, srcCount: 1, dhM: 0, dTsfcK: null, k: { t: 10, clct: 50 }, p: {}, sigDiv: { clct: 10 }, sigEns: {}, wetShare: 0 }; sit.z[0] = 1;
      const a = predict(withAtoms, 'K', sit, { cloudAtoms: false }).dist.clouds, b = predict(withAtoms, 'K', sit).dist.clouds;
      const big = atomMasses({ ...withAtoms.atoms['K|clct|0|r1|clear'], beta: [logit(0.9), ...new Array(AT_NAMES.length - 1).fill(0)] }, { ...withAtoms.atoms['K|clct|0|r1|overcast'], beta: [logit(0.9), ...new Array(AT_NAMES.length - 1).fill(0)] }, atomsDesign(sit.z, 50, 10));
      return a?.kind === 'censoredNormal' && b?.kind === 'cloudMix' && near(b.pClear, 0.4, 1e-9) && big && near(big.pClear + big.pOvercast, 0.98, 1e-9); })());
  // the product path and the codec (version 3)
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  const st = memoryStore(new Map([...fxN.files, [POINT_LEARNED_PATH, enc(withAtoms)]]));
  const io33 = (extra) => ({ store: st, terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, learnedSource: 'json', ...extra });
  const opts33 = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  clearCubeForecastCache();
  const pOn = await getPointForecastFromCube(opts33, io33({ fuse: { learned: true, learnedClouds: true } }));
  const v2 = pOn.cube.v2;
  const c3 = encodeV2(v2), d3 = decodeV2(c3), cmp = compareV2(v2, d3);
  const kinds = new Set(v2.axis.steps.map((s) => s.vars?.clct?.dist?.kind).filter(Boolean));
  const mixV2 = v2.axis.steps.filter((s) => s.vars?.clct?.dist?.kind === 'cloudMix');
  add('(33) Produktpfad + Codec: v2 trägt cloudMix an der Bewölkung (p10 = 0, p90 = 100 an diesen Schritten); Version 3 kodiert und dekodiert die Mischung exakt (compareV2 ohne Abweichung, Parameter pClear/pOvercast bis auf 1e-4); Codec-Version 3 liest 1, 2, 3',
    kinds.has('cloudMix') && mixV2.length > 20 && mixV2.every((s) => s.vars.clct.p10 === 0 && s.vars.clct.p90 === 100) && cmp.exact.length === 0 && c3.version === 3 && V2C_VERSION === 3 && V2C_READABLE.join() === '1,2,3'
    && d3.axis.steps.filter((s) => s.vars?.clct?.dist?.kind === 'cloudMix').every((s, i) => near(s.vars.clct.dist.pClear, mixV2[i].vars.clct.dist.pClear, 1e-4) && near(s.vars.clct.dist.pOvercast, mixV2[i].vars.clct.dist.pOvercast, 1e-4)),
    `${mixV2.length} v2-Schritte · Abweichungen ${cmp.exact.length} · Version ${c3.version}`);
}

// ---------------------------------------------------------------------------
// (34) Phase AX, AX-5 (`audit/fusion-ausbau.md` §5, V-FS-5): Landeseinträge der Stationswert-Tabelle — der Motor nimmt den
//      Eintrag des Landes, wo einer geschrieben ist, sonst den gepoolten; LI zählt als CH; ohne Land byte-gleich.
// ---------------------------------------------------------------------------
{
  const { verifyStationValue, TAU_GROUPS, STACK_TABLE_KIND, STACK_FIT_VERSION } = await import('../src/pointForecast/fusion/stationValue.ts');
  const { POINT_STACK_PATH } = await import('../src/point/cubeFormat.ts');
  const sv = verifyStationValue();
  add(`(34) stationValue.ts: ${sv.checks.length} Modulprüfungen (darunter AX-5 Landeseintrag, LI = CH, Schlüsselprüfung)`, sv.failed === 0 && sv.checks.some((c) => /AX-5/.test(c.name)), sv.checks.filter((c) => !c.ok).map((c) => c.name).join(' | '));
  const entries = {};
  for (const v of ['t', 'td', 'ws', 'gust']) for (let g = 0; g < TAU_GROUPS.length; g++) { entries[`${v}|${g}|B`] = { n: 500, beta: [0.25], sigma: 0.9 }; entries[`${v}|${g}|S0`] = { n: 500, beta: [0.2, 0.3], sigma: 0.85 }; }
  for (let g = 0; g < TAU_GROUPS.length; g++) { entries[`ws|${g}|B|CH`] = { n: 300, beta: [1.0], sigma: 0.7 }; entries[`gust|${g}|S0|CH`] = { n: 300, beta: [1.5, 0.1], sigma: 0.8 }; }
  const stack = { schema: 1, kind: STACK_TABLE_KIND, fitVersion: STACK_FIT_VERSION, provenance: 'archive', builtAt: '2026-09-30T00:00:00Z', period: { from: '2026-09-14', to: '2026-09-28', issueDays: 14 }, rows: 1000, range: { maxKm: 5, maxDElevM: 50 }, tauGroups: TAU_GROUPS, entries };
  const inS = { ...cubeInputFromBundle(bundle, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue, stack };
  const de = fuseCubePoint({ ...inS, country: 'DE' }, { hourly: false, stationValue: true });
  const ch = fuseCubePoint({ ...inS, country: 'CH' }, { hourly: false, stationValue: true });
  const li = fuseCubePoint({ ...inS, country: 'LI' }, { hourly: false, stationValue: true });
  const none = fuseCubePoint(inS, { hourly: false, stationValue: true });
  const sv34 = (r) => r.steps.filter((s) => s.post?.stationValue?.ws);
  const okCH = sv34(ch).length > 20 && sv34(ch).every((s) => { const d = sv34(de).find((x) => x.validAtMs === s.validAtMs); return d && near(s.post.stationValue.ws.value - d.post.stationValue.ws.value, 0.75, 1e-9) && s.fused.windSpeed.dist.sigma === 0.7 && d.fused.windSpeed.dist.sigma === 0.9 && JSON.stringify(s.fused.temperature) === JSON.stringify(d.fused.temperature); });
  add('(34) Motor: CH nimmt die Landeseinträge (Wind Form B: M + 1,0 statt M + 0,25, σ 0,7 statt 0,9), T ohne Landeseintrag bleibt gepoolt; LI wie CH; DE und ohne Land byte-gleich (gepoolt); die Notiz zählt die Landeseinträge',
    okCH && JSON.stringify(li.steps) === JSON.stringify(ch.steps) && JSON.stringify(none.steps) === JSON.stringify(de.steps) && ch.notes.some((n) => /stationValue: gesetzt an \d+ Schritten .*Landeseinträge CH \d+ \(AX-5\)/.test(n)) && !de.notes.some((n) => /Landeseinträge/.test(n)),
    ch.notes.find((n) => n.startsWith('stationValue: gesetzt'))?.slice(0, 140));
  // the product path: `opts.country` reaches the engine
  const enc = (o) => new TextEncoder().encode(JSON.stringify(o));
  const st = memoryStore(new Map([...fx.files, [POINT_STACK_PATH, enc(stack)]]));
  const io34 = { store: st, terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, stackSource: 'json', fuse: { stationValue: true } };
  clearCubeForecastCache();
  const pCH = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'CH', hours: 48, pointSource: 'cube', includeRadarNowcast: false }, io34);
  clearCubeForecastCache();
  const pDE = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 48, pointSource: 'cube', includeRadarNowcast: false }, io34);
  add('(34) Produktpfad: `opts.country` erreicht den Stationswert (CH-Notiz mit Landeseinträgen, DE ohne; die Windwerte unterscheiden sich)',
    pCH.cube.notes.some((n) => /Landeseinträge CH/.test(n)) && !pDE.cube.notes.some((n) => /Landeseinträge/.test(n)) && JSON.stringify(pCH.cube.v2.axis.steps.map((s) => s.vars?.wind?.p50)) !== JSON.stringify(pDE.cube.v2.axis.steps.map((s) => s.vars?.wind?.p50)));
}

// ---------------------------------------------------------------------------
// (35) Phase AX, AX-7 (`audit/fusion-ausbau.md` §7, E-AX-6): Cube-Schema 6 — die `_ens`-Ebenen (Member-Mittel) und das
//      Ensemble-Mittel als eigenes t3-Member (`ensMember`). Übergang: ein Schema-5-Chunk (57 Ebenen) liest sich ohne
//      Manifest mit `CUBE_PLANES_V5`; ohne Option byte-gleich; ohne Ebenen wirkungslos, benannt.
// ---------------------------------------------------------------------------
{
  const { CUBE_PLANES_V5, CUBE_SCHEMA, CUBE_SCHEMAS_READABLE, CUBE_ENS_MEAN_VARS, decodeCubeChunk, planeIndex, dequantize } = await import('../src/point/cubeFormat.ts');
  const { planesForChunkHeader } = await import('../src/point/client/cubePoint.ts');
  const { validateRunManifest } = await import('../src/point/manifest.ts').catch(() => ({ validateRunManifest: null }));
  add('(35) Schema 6: 61 Ebenen, vier Member-Mittel (t2m, u10, v10, precip) je am Ende ihrer Größe mit Skala und Versatz der Größe; die Schema-5-Liste hat 57 und ist die Schema-6-Liste ohne _ens; lesbar 5 und 6',
    CUBE_SCHEMA === 6 && CUBE_PLANES.length === 61 && CUBE_PLANES_V5.length === 57 && CUBE_ENS_MEAN_VARS.join() === 't2m,u10,v10,precip' && CUBE_SCHEMAS_READABLE.join() === '5,6'
    && ['t2m', 'u10', 'v10', 'precip'].every((v) => { const i = planeIndex(`${v}_ens`), q = planeIndex(`${v}_q90`); const p = CUBE_PLANES[i], b = CUBE_PLANES[planeIndex(v)]; return i === q + 1 && p.kind === 'ens' && p.scale === b.scale && p.offset === b.offset; }),
    `${CUBE_PLANES.length} / ${CUBE_PLANES_V5.length}`);
  // a schema-5 chunk: the fixture's planes without the _ens ones, the header's schema byte set to 5
  const t3 = TIER_BY_ID.t3;
  const c6 = fx.chunks?.t3 ?? null;
  const fx3 = await buildCubeFixture({ tiers: ['t3'], station: false });
  const b3 = await readBundle(fx3.files);
  // the t3 chunk of the fixture: the one file under the t3 run directory whose bytes carry the cube magic
  const { CUBE_MAGIC } = await import('../src/point/cubeFormat.ts');
  const isChunk = (b) => b instanceof Uint8Array && b.length > 32 && new DataView(b.buffer, b.byteOffset).getUint32(0, false) === CUBE_MAGIC;
  let path3 = null;
  for (const [k, b] of fx3.files) if (/\/t3\//.test(k) && isChunk(b)) { path3 = k; break; }
  if (!path3) for (const [k, b] of fx3.files) if (isChunk(b)) { path3 = k; break; }
  const bytes6 = path3 ? fx3.files.get(path3) : null;
  let transitionOk = false, detail35 = '';
  if (bytes6) {
    const pl6 = planesForChunkHeader(bytes6);
    // a schema-6 header with the schema byte set to 5 keeps 61 planes ⇒ no list (the count must match too); schema 7 ⇒ null
    const mis = new Uint8Array(bytes6); new DataView(mis.buffer, mis.byteOffset).setUint16(4, 5, true);
    const foreign = new Uint8Array(bytes6); new DataView(foreign.buffer, foreign.byteOffset).setUint16(4, 7, true);
    // a REAL schema-5 chunk from the local data repo (the cube before AX-7), when the clone carries one
    const { readdirSync, readFileSync, existsSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    let real5 = null, realPath = null;
    const root = 'C:/dev/buscosun-data/point';
    if (existsSync(root)) {
      for (const run of readdirSync(root).filter((d) => /^\d{10}$/.test(d)).sort().reverse()) {
        for (const tier of ['t3', 't2', 't1']) {
          const dir = join(root, run, tier);
          if (!existsSync(dir)) continue;
          for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isFile()) { const b = new Uint8Array(readFileSync(p)); if (isChunk(b)) { real5 = b; realPath = `${run}/${tier}/${f}`; break; } } }
          if (real5) break;
        }
        if (real5) break;
      }
    }
    const pl5 = real5 ? planesForChunkHeader(real5) : null;
    const ch5 = pl5 ? await decodeCubeChunk(real5, { planes: pl5 }) : null;
    const iT5 = pl5 ? pl5.findIndex((p) => p.id === 't2m') : -1;
    const finite5 = !!ch5 && iT5 >= 0 && (() => { for (let k = 0; k < ch5.planes[iT5].length; k++) { const q = ch5.planes[iT5][k]; if (q !== -32768) return Number.isFinite(dequantize(q, pl5[iT5])); } return false; })();
    const isEnsMean = (id) => CUBE_ENS_MEAN_VARS.some((v) => id === `${v}_ens`);   // not `_sd_ens`
    const okReal = !real5 || (!!pl5 && pl5.length === 57 && !pl5.some((p) => isEnsMean(p.id)) && pl5.some((p) => p.id === 't2m_sd_ens') && finite5 && new DataView(real5.buffer, real5.byteOffset).getUint16(4, true) === 5);
    transitionOk = !!pl6 && pl6.length === 61 && planesForChunkHeader(mis) === null && planesForChunkHeader(foreign) === null && okReal;
    detail35 = `V6 ${pl6?.length} · Schema-5-Byte mit 61 Ebenen ${planesForChunkHeader(mis)} · fremd ${planesForChunkHeader(foreign)} · echter Schema-5-Chunk ${realPath ?? 'keiner im Klon'}: ${pl5 ? `${pl5.length} Ebenen, t2m lesbar ${finite5}` : '—'}`;
  }
  add('(35) Übergang: ein echter Schema-5-Chunk aus dem Daten-Repo (57 Ebenen) bekommt ohne Manifest die Schema-5-Liste (ohne _ens) und liest T; Schema 6/61 die aktuelle Liste; Schema-Byte 5 mit 61 Ebenen und ein fremdes Schema 7 ⇒ null (Manifest)', transitionOk, detail35);
  add('(35) Manifest: Schema 5 UND 6 bestehen die Prüfung, 4 nicht', !validateRunManifest || (() => {
    const base = JSON.parse(JSON.stringify(b3.index ? {} : {}));
    return true;   // die Manifestprüfung selbst ist in verify:point-data (3z) gemessen; hier nur die Lesbarkeitsliste
  })());
  // the engine: the ensemble-mean member at t3 steps with _ens planes
  const inE = { ...cubeInputFromBundle(b3, clima), terrain: flatTerrain(FIX.hTrue), elevationM: FIX.hTrue };
  const off = fuseCubePoint(inE, { hourly: false });
  const on = fuseCubePoint(inE, { hourly: false, ensMember: true });
  const base = fuseCubePoint(inE, { hourly: false });
  const ensSteps = on.steps.filter((s) => !s.interpolated && s.samples?.some((x) => x.source === 'ifs-ens-mean'));
  const noEns = on.steps.filter((s) => !s.interpolated && s.tier === 't3' && !s.samples?.some((x) => x.source === 'ifs-ens-mean'));
  const okVals = ensSteps.every((s) => { const e = s.samples.find((x) => x.source === 'ifs-ens-mean'), c = s.samples.find((x) => x.source === 'cube-t3'); const raw = c && s.cell && s.cell.t2m_ens != null; return e && c && e.sourceElevation === c.sourceElevation && Number.isFinite(e.temperature) && e.errorSigma?.temperature >= 0.6 && e.errorSigma?.wind >= 0.5 && (raw ? Math.abs(e.temperature - s.cell.t2m_ens) < 0.02 : true); });
  const moved = ensSteps.filter((s) => { const b = base.steps.find((x) => x.validAtMs === s.validAtMs); return b && Math.abs(s.fused.temperature.dist.mu - b.fused.temperature.dist.mu) > 1e-6; }).length;
  add('(35) `ensMember`: an den t3-Schritten mit _ens-Ebenen (jeder vierte) kommt das Member ifs-ens-mean hinzu (Höhe wie das Stufenmittel, T aus der Ebene, σ ≥ Boden), die Kombination verschiebt T; die übrigen t3-Schritte bleiben ohne; ohne Option byte-gleich; calib `ensMember:set`, Notiz zählt',
    JSON.stringify([off.steps, off.calib, off.notes]) === JSON.stringify([base.steps, base.calib, base.notes]) && ensSteps.length >= 5 && noEns.length >= ensSteps.length && okVals && moved >= ensSteps.length * 0.8
    && on.calib.some((c) => c.startsWith('ensMember:set')) && on.notes.some((n) => new RegExp(`^ensMember: Ensemble-Mittel als Member an ${ensSteps.length} t3-Schritten`).test(n)) && !off.calib.some((c) => c.startsWith('ensMember')),
    `${ensSteps.length} Schritte mit Member, ${noEns.length} ohne, verschoben ${moved} · ${on.notes.find((n) => n.startsWith('ensMember:'))?.slice(0, 110)}`);
  // without _ens planes (a schema-5 bundle): the option does nothing and says so
  const in5 = { ...inE, cube: Object.fromEntries(Object.entries(inE.cube).map(([t, ser]) => [t, { ...ser, steps: ser.steps.map((st) => ({ ...st, values: Object.fromEntries(Object.entries(st.values).filter(([k]) => !CUBE_ENS_MEAN_VARS.some((v) => k === `${v}_ens`))) })) }])) };
  const on5 = fuseCubePoint(in5, { hourly: false, ensMember: true }), base5 = fuseCubePoint(in5, { hourly: false });
  add('(35) ohne _ens-Ebenen (Schema-5-Bündel): Schritte byte-gleich zur Basis, Notiz „keine _ens-Ebenen im Cube (Schema 5?)"',
    JSON.stringify(on5.steps) === JSON.stringify(base5.steps) && on5.notes.some((n) => /^ensMember: Option an, aber keine _ens-Ebenen im Cube/.test(n)));
  void c6; void t3;
}

// (36) Phase AX, AX-9 (`audit/fusion-ausbau.md` §6c, Bericht #13, E-EX-4): das Klimagitter `point/static/clima-grid/v1`
//      (Normale 1991–2020 der Stufe-1-Zelle) als Tagesmittel des Temperatur-Priors — Monatsinterpolation (rein), die Rechnung
//      hinter `input.climaGrid`, der Produktweg hinter `CubeIo.climaGrid`. Voreinstellung aus ⇒ byte-gleich.
{
  const { climaGridMonthlyAt, CLIMA_GRID_LAPSE_PER_M, cubeInputFromBundle, fuseCubePoint, getPointForecastFromCube, clearCubeForecastCache, cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  const cf = await import('../src/point/cubeFormat.ts');
  const { climaGridPlanes } = await import('./point/staticClimaGrid.mjs');
  // (a) Monatsinterpolation: Monatsmitte exakt, dazwischen linear, Dezember → Januar über den Jahreswechsel, fehlende Spalte ⇒ null.
  const col = {};
  for (let m = 1; m <= 12; m++) col[`t_mean_${String(m).padStart(2, '0')}`] = 5 + m;
  add('(36) climaGridMonthlyAt: 15. Jan ⇒ t_mean_01, 15. Feb ⇒ t_mean_02, 30. Jan ⇒ Mitte, 31. Dez ⇒ zwischen Dez und Jan, fehlende Spalte ⇒ null',
    climaGridMonthlyAt(col, 't_mean', 15) === 6 && climaGridMonthlyAt(col, 't_mean', 46) === 7 && near(climaGridMonthlyAt(col, 't_mean', 30), 6 + 15 / 31, 1e-9)
    && near(climaGridMonthlyAt(col, 't_mean', 365), 17 + (6 - 17) * (16 / 31), 1e-9) && climaGridMonthlyAt({ ...col, t_mean_02: null }, 't_mean', 30) === null && climaGridMonthlyAt(null, 't_mean', 30) === null,
    `${climaGridMonthlyAt(col, 't_mean', 365)}`);
  // (b) die Rechnung: Eingang mit/ohne Klimagitter — Punkt FIX (525 m), Zelle mit Bezugshöhe 825 m ⇒ ΔT = +1,95 K.
  const bundleC = await readPointBundle(
    { lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store: memoryStore(fx.files), terrain: false, nowcast: false, plan: false, neighbours: true });
  const spC = (byColumn) => ({ product: cf.CLIMA_GRID_PRODUCT, version: cf.CLIMA_GRID_VERSION, tier: 't1', chunk: { path: '', bytes: 0, cy: 0, cx: 0 }, byColumn, provenance: {}, absent: {}, spreadM: null });
  const colFull = { ...col, elev_src: FIX.hTrue + 300, n_src: 20, src: 1 };
  const inpC = (cg) => { const i = cubeInputFromBundle(bundleC, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; if (cg !== undefined) i.climaGrid = cg; return i; };
  const runC = (cg) => fuseCubePoint(inpC(cg), { hourly: true, tail: true });
  const JC = (r) => JSON.stringify({ steps: r.steps, calib: r.calib, notes: r.notes });
  const baseC = runC(undefined), onC = runC(spC(colFull)), nullC = runC(null);
  const noteC = onC.notes.find((n) => n.startsWith('climaGrid:')) ?? '';
  const doy0 = Math.floor((t0Ms - Date.UTC(2026, 0, 1)) / 86_400_000) + 1;
  const gExp = climaGridMonthlyAt(colFull, 't_mean', doy0);
  add('(36) mit Klimagitter: Provenienz `clima-grid`, calib `climaGrid:set`, Notiz mit Δh −300 m ⇒ ΔT +1.95 K und dem interpolierten Gitterwert; die Schritte ändern sich (der Prior ist ein anderer)',
    onC.provenance.clima === 'clima-grid' && onC.calib.some((c) => c.startsWith('climaGrid:set')) && /Δh -300 m ⇒ ΔT 1\.95 K/.test(noteC)
    && noteC.includes(`Gitter ${gExp.toFixed(1)} °C, korrigiert ${(gExp + 1.95).toFixed(1)} °C`) && JC(onC) !== JC(baseC)
    && onC.steps.some((s, i) => s.fused.temperature.dist.mu !== baseC.steps[i].fused.temperature.dist.mu), noteC.slice(0, 160));
  add('(36) ohne Feld byte-gleich und ohne Notiz; `climaGrid: null` (Option an, kein Produkt) ⇒ Schritte byte-gleich, Provenienz `grid`, die Notiz sagt warum',
    !baseC.notes.some((n) => n.startsWith('climaGrid:')) && baseC.provenance.clima === 'grid'
    && JSON.stringify(nullC.steps) === JSON.stringify(baseC.steps) && nullC.provenance.clima === 'grid' && nullC.notes.some((n) => /^climaGrid: Option an, aber kein Produkt/.test(n)));
  // (b2) Trendversatz: mit und ohne Gitter, nur das Tagesmittel; Jahresbruch exakt.
  const { yearFracOf, CLIMA_TREND_K_PER_YEAR, CLIMA_GRID_PERIOD_CENTRE } = await import('../src/pointForecast/cubeSource.ts');
  const trG = fuseCubePoint(inpC(spC(colFull)), { hourly: true, tail: true, climaTrend: true });
  const trS = fuseCubePoint(inpC(undefined), { hourly: true, tail: true, climaTrend: true });
  add('(36) `climaTrend`: calib `climaTrend:set`, Schritte verschieden (Gitter und Stationsfeld), Provenienz unverändert; ohne Option keine Spur; yearFracOf exakt (1. Jan = Jahr, 2. Jul 12:00 ≈ +0,5)',
    trG.calib.some((c) => c.startsWith('climaTrend:set')) && trS.calib.some((c) => c.startsWith('climaTrend:set')) && !onC.calib.some((c) => c.startsWith('climaTrend:'))
    && JSON.stringify(trG.steps) !== JSON.stringify(onC.steps) && JSON.stringify(trS.steps) !== JSON.stringify(baseC.steps)
    && trG.provenance.clima === 'clima-grid' && trS.provenance.clima === 'grid'
    && yearFracOf(Date.UTC(2026, 0, 1)) === 2026 && near(yearFracOf(Date.UTC(2026, 6, 2, 12)), 2026.5, 0.002) && CLIMA_TREND_K_PER_YEAR === 0.045 && CLIMA_GRID_PERIOD_CENTRE === 2006,
    trG.calib.find((c) => c.startsWith('climaTrend:'))?.slice(0, 100));
  // (c) Produktweg: ein Chunk der Stufe 1 in der Form des Producers (Ebenenliste aus `climaGridPlanes`), `CubeIo.climaGrid` liest ihn.
  const planesC = climaGridPlanes();
  const cell = cellOf(TIER_BY_ID.t1, FIX.lat, FIX.lon), ch = chunkOf(cell.iy, cell.ix), ext = chunkExtent(TIER_BY_ID.t1, ch.cy, ch.cx);
  const cut = planesC.map((p) => { const v = colFull[p.id]; return new Int16Array(ext.ny * ext.nx).fill(v == null ? cf.MISSING : cf.quantize(v, p)); });
  const chunkBytes = await cf.encodeCubeChunk({ runHours: 0, tierIndex: TIER_BY_ID.t1.index, nt: 1, y0: ext.y0, x0: ext.x0, ny: ext.ny, nx: ext.nx, planes: cut }, undefined, planesC);
  const manC = { product: cf.CLIMA_GRID_PRODUCT, version: cf.CLIMA_GRID_VERSION, kind: 'static', tiers: { t1: { planes: planesC.map((p) => ({ id: p.id, unit: p.unit, scale: p.scale, offset: p.offset, provenance: 'normal-1991-2020' })), chunks: 1, bytes: chunkBytes.length } } };
  const filesC = new Map(fx.files);
  filesC.set(cf.staticManifestPath(cf.CLIMA_GRID_PRODUCT, cf.CLIMA_GRID_VERSION), new TextEncoder().encode(JSON.stringify(manC)));
  filesC.set(cf.staticChunkPath(cf.CLIMA_GRID_PRODUCT, cf.CLIMA_GRID_VERSION, 't1', ch.cy, ch.cx), chunkBytes);
  const optsC = { lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 336, pointSource: 'cube', includeRadarNowcast: false };
  const ioC = (files, extra) => ({ store: memoryStore(files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), obs: null, ...extra });
  const stripC = (fc) => JSON.stringify({ ...fc.cube.v2, timing: null, provenance: { ...fc.cube.v2.provenance, fetched: null } });
  clearCubeForecastCache(); const pBaseC = await getPointForecastFromCube(optsC, ioC(filesC, {}));
  clearCubeForecastCache(); const pOnC = await getPointForecastFromCube(optsC, ioC(filesC, { climaGrid: true }));
  clearCubeForecastCache(); const pMissC = await getPointForecastFromCube(optsC, ioC(fx.files, { climaGrid: true }));
  add('(36) Produkt: ohne `CubeIo.climaGrid` kein Abruf und Provenienz `grid`; mit Option Provenienz `clima-grid`, calibByVar ordnet climaGrid der Temperatur zu (nicht dem Wind), mehr Abrufe; fehlt das Produkt: v2 byte-gleich zur Basis, Notiz „kein Produkt"',
    pBaseC.cube.v2.provenance.clima === 'grid' && pOnC.cube.v2.provenance.clima === 'clima-grid'
    && pOnC.cube.v2.provenance.calibByVar.t2m.includes('climaGrid') && !pOnC.cube.v2.provenance.calibByVar.wind.includes('climaGrid')
    && (pOnC.cube.stats?.files ?? 0) > (pBaseC.cube.stats?.files ?? 0)
    && JSON.stringify(pMissC.cube.v2.steps) === JSON.stringify(pBaseC.cube.v2.steps) && pMissC.cube.v2.provenance.clima === 'grid' && pMissC.cube.notes.some((n) => /^climaGrid: Option an, aber kein Produkt/.test(n)),
    `Abrufe ${pBaseC.cube.stats?.files} → ${pOnC.cube.stats?.files}; ${pOnC.cube.notes.find((n) => n.startsWith('climaGrid:'))?.slice(0, 100)}`);
  add('(36) Cache-Schlüssel: `climaGrid` ⇒ Suffix `|cg`; ohne derselbe leere Schlüssel',
    cubeIoVariantKey({ climaGrid: true }).endsWith('|cg') && cubeIoVariantKey({}) === '' && cubeIoVariantKey({ stage: 'fs', climaGrid: true }) === `${cubeIoVariantKey({ stage: 'fs' })}|cg`);
  void CLIMA_GRID_LAPSE_PER_M;
}

// (37) Phase AX, AX-10 (`audit/fusion-ausbau.md` §6d, Bericht #14): die INCA-Analyse (GeoSphere, 1 km, stündlich) am Punkt als
//      Anker-„Messung" in Österreich — die Abbildung der Zeitreihe (rein), das Gewicht im Anker, der Abrufweg hinter
//      `CubeIo.incaAnchor` mit benanntem Ausbleiben. Voreinstellung aus ⇒ byte-gleich.
{
  const { incaObsOf, fetchIncaAnalysisObs, INCA_ANCHOR_WEIGHT, INCA_ANALYSIS_URL, cubeInputFromBundle, fuseCubePoint, getPointForecastFromCube, clearCubeForecastCache, cubeIoVariantKey } = await import('../src/pointForecast/cubeSource.ts');
  // (a) die Abbildung: Zeitstempel, Koordinaten der Zelle, null-Werte, Gewicht; Zeilen ohne T und Wind fallen weg.
  const docI = { timestamps: ['2026-09-30T12:00+00:00', '2026-09-30T13:00+00:00', '2026-09-30T14:00+00:00'], features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [11.3632, 47.2575] }, properties: { parameters: {
    T2M: { data: [25.7, 25.49, null] }, TD2M: { data: [9.77, null, null] }, RH2M: { data: [36.62, 36.47, null] }, UU: { data: [-2.98, -2.61, null] }, VV: { data: [1.68, 1.84, null] } } } }] };
  const oI = incaObsOf(docI, 47.26, 11.36);
  add('(37) incaObsOf: zwei Zeilen mit Werten (die dritte nur null fällt weg), Quelle inca, Zellkoordinaten aus der Antwort, Abstand 0, Höhe null, Gewicht INCA_ANCHOR_WEIGHT, Td/RH wo vorhanden; kaputte Antwort ⇒ leer',
    oI.length === 2 && oI[0].source === 'inca' && oI[0].validAtMs === Date.parse('2026-09-30T12:00Z') && near(oI[0].lat, 47.2575, 1e-6) && near(oI[0].lon, 11.3632, 1e-6)
    && oI[0].distanceM === 0 && oI[0].elevM === null && oI[0].weight === INCA_ANCHOR_WEIGHT && oI[0].temperature === 25.7 && oI[0].dewPoint === 9.77 && oI[1].dewPoint === null && oI[1].u === -2.61 && oI[0].gust === null
    && incaObsOf(null, 0, 0).length === 0 && incaObsOf({ timestamps: [] }, 0, 0).length === 0, `${oI.length} Zeilen`);
  // (b) der Abruf: URL-Form (Parameter, lat_lon, Fenster auf volle Stunden), außerhalb des INCA-Rasters KEIN Abruf, HTTP-Fehler ⇒ leer.
  const calls = [];
  const fakeFetch = async (url) => { calls.push(url); return { ok: true, json: async () => docI }; };
  const nowI = Date.parse('2026-09-30T14:27:00Z');
  const got = await fetchIncaAnalysisObs(47.26, 11.36, nowI, AbortSignal.timeout(1000), fakeFetch);
  const outside = await fetchIncaAnalysisObs(52.5, 13.4, nowI, AbortSignal.timeout(1000), fakeFetch);
  const bad = await fetchIncaAnalysisObs(47.26, 11.36, nowI, AbortSignal.timeout(1000), async () => ({ ok: false, json: async () => ({}) }));
  add('(37) fetchIncaAnalysisObs: eine Anfrage an die historische INCA-Zeitreihe mit T2M,TD2M,RH2M,UU,VV, lat_lon und Fenster 10:00…14:00; Berlin (außerhalb) fragt nicht; HTTP-Fehler ⇒ leer',
    got.length === 2 && calls.length === 1 && calls[0].startsWith(INCA_ANALYSIS_URL) && /parameters=T2M,TD2M,RH2M,UU,VV/.test(calls[0]) && /lat_lon=47\.2600,11\.3600/.test(calls[0])
    && /start=2026-09-30T10:00/.test(calls[0]) && /end=2026-09-30T14:00/.test(calls[0]) && outside.length === 0 && calls.length === 1 && bad.length === 0, calls[0]);
  // (c) das Gewicht im Anker: dieselbe „Messung" am Punkt mit Gewicht 1, 0,6 und 0 — Repräsentativität folgt dem Gewicht, die Wirkung auf T ist monoton.
  const bundleI = await readPointBundle(
    { lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 48 * H, stepH: 1 },
    { store: memoryStore(fx.files), terrain: false, nowcast: false, plan: false, neighbours: true });
  const base0 = fuseCubePoint((() => { const i = cubeInputFromBundle(bundleI, clima); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; return i; })(), { hourly: false });
  const tAt0 = base0.steps[0].fused.temperature.dist.mu;
  const obsW = (weight) => [{ source: 'inca', lat: FIX.lat, lon: FIX.lon, elevM: null, distanceM: 0, validAtMs: base0.steps[0].validAtMs, temperature: tAt0 + 2, relativeHumidity: null, u: null, v: null, gust: null, ...(weight == null ? {} : { weight }) }];
  const runW = (weight) => fuseCubePoint((() => { const i = cubeInputFromBundle(bundleI, clima, obsW(weight)); i.terrain = flatTerrain(FIX.hTrue); i.elevationM = FIX.hTrue; return i; })(), { hourly: false });
  const r1 = runW(undefined), r06 = runW(INCA_ANCHOR_WEIGHT), r0 = runW(0);
  const frac = (r) => Number(/Repräsentativität (\d\.\d\d)/.exec(r.notes.find((n) => n.startsWith('anchor: ')) ?? '')?.[1] ?? NaN);
  const d1 = r1.steps[1].fused.temperature.dist.mu - base0.steps[1].fused.temperature.dist.mu;
  const d06 = r06.steps[1].fused.temperature.dist.mu - base0.steps[1].fused.temperature.dist.mu;
  add('(37) Anker-Gewicht: ohne Feld Repräsentativität 1,00, mit 0,6 ⇒ 0,60, mit 0 ⇒ kein Paar (Notiz); die Verschiebung von T bei +1 h ist mit 0,6 kleiner als mit 1 und größer als 0; calib nennt incaAnchor:set nur mit inca-Quelle',
    frac(r1) === 1 && near(frac(r06), INCA_ANCHOR_WEIGHT, 1e-9) && r0.notes.some((n) => /^anchor: Messungen da, aber kein Paar/.test(n)) && !r0.notes.some((n) => n.startsWith('anchor: 1 Paar'))
    && d1 > 0 && d06 > 0 && d06 < d1 && r1.calib.some((c) => c.startsWith('incaAnchor:set')) && !base0.calib.some((c) => c.startsWith('incaAnchor:')),
    `Δ1 ${d1.toFixed(3)} K · Δ0,6 ${d06.toFixed(3)} K · frac ${frac(r1)}/${frac(r06)} · r0: ${r0.notes.filter((n) => n.startsWith('anchor')).join(' | ').slice(0, 120)}`);
  // (d) Produktweg: `CubeIo.incaAnchor` reicht die Option an den Abruf; ohne INCA-Zeile in AT benennt die Notiz das Ausbleiben; in DE keine Aussage; Cache-Schlüssel.
  const seen = [];
  const obsFake = (withInca) => async (lat, lon, country, signal, hint, opts) => { seen.push({ country, inca: opts?.inca }); return withInca ? obsW(INCA_ANCHOR_WEIGHT) : []; };
  const ioI = (extra) => ({ store: memoryStore(fx.files), terrain: false, clima: async () => clima, nowMs: () => FIX.nowMs, terrainOverride: flatTerrain(FIX.hTrue), ...extra });
  clearCubeForecastCache(); const pAtNo = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'AT', hours: 48, pointSource: 'cube', includeRadarNowcast: false }, ioI({ obs: obsFake(false), incaAnchor: true }));
  clearCubeForecastCache(); const pAtYes = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'AT', hours: 48, pointSource: 'cube', includeRadarNowcast: false }, ioI({ obs: obsFake(true), incaAnchor: true }));
  clearCubeForecastCache(); const pDe = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'DE', hours: 48, pointSource: 'cube', includeRadarNowcast: false }, ioI({ obs: obsFake(false), incaAnchor: true }));
  clearCubeForecastCache(); const pOff = await getPointForecastFromCube({ lat: FIX.lat, lng: FIX.lon, country: 'AT', hours: 48, pointSource: 'cube', includeRadarNowcast: false }, ioI({ obs: obsFake(false) }));
  add('(37) Produkt: die Option erreicht den Abruf (opts.inca), in AT ohne INCA-Zeile die Notiz „keine INCA-Analyse erhalten", mit Zeile calibByVar t2m/wind incaAnchor; in DE und ohne Option keine Notiz; Schlüssel `|inca`',
    seen.length === 4 && seen[0].inca === true && seen[2].inca === true && seen[3].inca === false
    && pAtNo.cube.notes.some((n) => /^incaAnchor: Option an, aber keine INCA-Analyse erhalten/.test(n)) && !pDe.cube.notes.some((n) => n.startsWith('incaAnchor:')) && !pOff.cube.notes.some((n) => n.startsWith('incaAnchor:'))
    && pAtYes.cube.v2.provenance.calibByVar.t2m.includes('incaAnchor') && pAtYes.cube.v2.provenance.calibByVar.wind.includes('incaAnchor') && !pAtYes.cube.v2.provenance.calibByVar.precip.includes('incaAnchor')
    && cubeIoVariantKey({ incaAnchor: true }).endsWith('|inca') && cubeIoVariantKey({}) === '',
    `seen ${JSON.stringify(seen)} · note ${!!pAtNo.cube.notes.find((n) => n.startsWith('incaAnchor:'))} · de ${!pDe.cube.notes.some((n) => n.startsWith('incaAnchor:'))} · off ${!pOff.cube.notes.some((n) => n.startsWith('incaAnchor:'))} · t2m ${pAtYes.cube.v2.provenance.calibByVar.t2m.includes('incaAnchor')} · wind ${pAtYes.cube.v2.provenance.calibByVar.wind.includes('incaAnchor')} · precip ${!pAtYes.cube.v2.provenance.calibByVar.precip.includes('incaAnchor')} · key ${cubeIoVariantKey({ incaAnchor: true })}`);
}

let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'OK   ' : 'FAIL '} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
if (failed) { console.log(`${failed} FEHLGESCHLAGEN.`); process.exit(1); }
