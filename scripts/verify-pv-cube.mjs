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
// Ausgabe
// ---------------------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed += 1;
  console.log(`${c.ok ? 'OK   ' : 'FAIL '} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
if (failed) { console.log(`${failed} FEHLGESCHLAGEN.`); process.exit(1); }
