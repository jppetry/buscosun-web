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
  add('(15) CUBE_ANSWER_PLANES: 39 von 57 Ebenen — ohne alle *_q10/_q90 und ohne t/rh auf 850/700 hPa, mit 925 hPa',
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
  add('(15) benannt: je Stufe „39 von 57 Ebenen über n Bereiche gelesen … Rest wird im Hintergrund nachgeladen"',
    ['t1', 't2', 't3'].every((t) => fRange.cube.notes.some((n) => n.startsWith(`${t}: 39 von 57 Ebenen über`))), fRange.cube.notes.filter((n) => /Ebenen über/.test(n)).join(' | '));
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
  add('(15) zweiter Besuch: die Chunks kommen ganz aus dem Cache (keine Bereiche, keine Vervollständigung, alle 57 Ebenen)',
    !bC2.completing && !bC2.notes.some((n) => /Ebenen über/.test(n)) && bC2.cube.t1.filledPlanes.length + bC2.cube.t1.emptyPlanes.length === 57,
    `Abrufe ${cStore.stats.files - before2}`);

  // Rückfälle: Server ignoriert den Range (200) ⇒ ganze Datei; Bereich scheitert ⇒ ganze Datei mit Notiz; ohne `range` ⇒ ganze Datei.
  const wholeOnRange = { ...memoryStore(fx.files) }; wholeOnRange.range = async (p) => { const b = fx.files.get(p); return b ? { bytes: b, whole: true } : null; };
  const failing = { ...memoryStore(fx.files) }; failing.range = async () => { throw new Error('HTTP 403'); };
  const noRange = { ...memoryStore(fx.files) }; delete noRange.range;
  const rd = (store) => readPointBundle({ lat: FIX.lat, lon: FIX.lon, elevationM: FIX.hTrue, nowMs: FIX.nowMs, fromMs: t0Ms, toMs: t0Ms + 336 * H, stepH: 1 },
    { store, terrain: false, nowcast: false, plan: false, planeRanges: CUBE_ANSWER_PLANES });
  const [bW, bF, bN] = await Promise.all([rd(wholeOnRange), rd(failing), rd(noRange)]);
  const t2mOf = (b) => JSON.stringify(b.cube.t1.steps.map((s) => s.values.t2m));
  add('(15) Rückfall: 200 auf einen Range ⇒ ganze Datei (57 Ebenen, keine Vervollständigung); Bereich scheitert (403) ⇒ ganze Datei mit Notiz; Store ohne Bereiche ⇒ ganze Datei — Werte je gleich',
    !bW.completing && bW.cube.t1.filledPlanes.length + bW.cube.t1.emptyPlanes.length === 57
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
  // Negativkontrollen: eine gekippte Ziffer, eine falsche Prüfsumme, eine fremde Version
  const flip = JSON.parse(JSON.stringify(cH));
  const col = flip.body.vars.t2m.d[0];
  const at = col.findIndex((x) => x != null && x !== 0);
  col[at] += 1;
  const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
  add('(17) Negativkontrolle: eine gekippte Ziffer im Körper (t2m-Verteilung) ⇒ Dekodierung verweigert (Prüfsumme); falsche Prüfsumme, fremde Version, fremdes Objekt ebenso',
    at >= 0 && throws(() => decodeV2(flip), /Prüfsumme/) && throws(() => decodeV2({ ...cH, check: (cH.check + 1) >>> 0 }), /Prüfsumme/)
    && throws(() => decodeV2({ ...cH, version: 2 }), /Version/) && throws(() => decodeV2({ body: cH.body }), /kein buscosun-v2c/));
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
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'OK   ' : 'FAIL '} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
if (failed) { console.log(`${failed} FEHLGESCHLAGEN.`); process.exit(1); }
