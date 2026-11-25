#!/usr/bin/env node
/**
 * verify:glacier-snowpack — phase GM, GM-3c (audit/gletscher-schneemodell.md §3f): the snowpack line of the melt run.
 *
 *   A  the core: the mass of one elevation against the melt core (`simulate` on one band), the forcing in the resolution of the state, the pack the state holds
 *   B  the state does not depend on the cadence of the runs: a later run walks exactly the path the earlier one forecast; hours beyond the stored forcing are counted
 *   C  the row and the contract: real answers of buscosun Fusion at three elevations (`weather-levels.json`), negative controls of both contracts, a neighbour's answers
 *   D  `melt.mjs` end to end with the real answers as the stubbed buscosun Fusion: off = nothing read and nothing written, shadow, the state between runs,
 *      one snowpack from one calculation, the density follows the precipitation switch (E-GM-15), all glaciers (E-GM-16)
 *   E  the publisher: the melt line may write `snowpack/`, run documents older than 72 h go, the state stays (E-GM-17)
 *   F  the seed of the spin-up (`snowpack-seed.mjs`): its pure part on forcing in the shape of the sources, and a run that continues a seed
 *   H  GM-4 (E-GM-20/21): the shadow pairs — switch, byte identity of everything else, the pair by hand on real station entries (`snowpack-pairs.json`),
 *      the time window, missing inputs without a silent fall back, the contract, publisher and archive
 *
 *   I  GM-5a (E-GM-32 … E-GM-35): the spread from scenarios — switch, byte identity of everything else, a scenario without noise is the expected value
 *      (core and producer), every source of the spread acts, the sum rule, neighbours and answers without a distribution carry none, the contract
 *   J  GM-5c (V-GM-79): the pairs carry the forecast at the station elevation in a run with spreads — the quantile of the scenario values read at that
 *      elevation (never a mix of two levels' quantiles), the pair by hand, byte identity of every combination of the two switches, missing inputs, the contract
 *
 * Exit 0 = all green. Last line: `verify:glacier-snowpack n/m`.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MELT, simulate, emptyState } from './glacier/lib/meltcore.mjs';
import { SNOW, SNOW_ORIGIN, packSwe, packDepthCm, packToRow, packFromRow, packProblems, emptyPack, deposit } from './glacier/lib/snowcore.mjs';
import { snowCoreSetup } from './glacier/lib/snowcal.mjs';
import { solidFraction, weatherOfGlacier, shareAtElevation, tempAtElevation, precipAmountOf } from './glacier/lib/weathercore.mjs';
import {
  SNOWPACK_DEFAULT, SNOWPACK_MODES, SNOWPACK_START_DEFAULT, snowpackModeOf, snowpackStartOf, emptyLevel, bareAlbedo, stepLevel, driveOf, normalizeLevel, levelsOfEntry, advanceEntry,
  snowpackOfGlacier, placeLevels, stateRefusal, SNOWPACK_PAIRS_DEFAULT, SNOWPACK_PAIRS_MODES, snowpackPairsModeOf, atElevation, pairsOf, stationLevelsOf,
  SNOWPACK_SPREAD_DEFAULT, SNOWPACK_SPREAD_MODES, snowpackSpreadModeOf, spreadOfGlacier, shiftLevels,
} from './glacier/lib/snowpackcore.mjs';
import { GLACIER_SNOWPACK_PAIRS_NOTE, GLACIER_SNOWPACK_PAIRS_FC_HOURS, GLACIER_SNOWPACK_PAIRS_FC_ELEVATION, GLACIER_SNOWPACK_PAIRS_WINDOW_MIN, glacierSnowpackPairsPath, snowpackPairsProblems } from '../src/glacier/glacierSnowpackPairsContract.ts';
import { archivePairs, archiveForcing } from './glacier/glacier-archive.mjs';
import {
  GLACIER_SNOWPACK_DAYS, GLACIER_SNOWPACK_PEND_H, GLACIER_SNOWPACK_STATE_PATH, GLACIER_SNOWPACK_NOTE, glacierSnowpackRunPath, snowpackProblems, snowpackStateProblems,
  GLACIER_SNOWPACK_SPREAD_RULE, GLACIER_SNOWPACK_SPREAD_K, GLACIER_SNOWPACK_NOW_FACTOR,
} from '../src/glacier/glacierSnowpackContract.ts';
import { glacierWeatherRunPath, glacierWeatherHourlyPath, GLACIER_WEATHER_PHASE_PATH } from '../src/glacier/glacierWeatherContract.ts';
import { main } from './glacier/melt.mjs';
import { checkPackage, pruneList, GLACIER_POLICIES, GLACIER_LINES } from './glacier/glacier-publish.mjs';
import { seedOfForcing, hourlyFromDaily, shiftOf, respinMeltState } from './glacier/snowpack-seed.mjs';
import { stateRowOf } from './glacier/lib/meltstate.mjs';
import { meltStateProblems } from '../src/glacier/glacierMeltContract.ts';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = 3_600_000;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const f64 = (a) => Float64Array.from(a, (v) => (v == null ? NaN : v));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const throws = async (f) => { try { await f(); return null; } catch (e) { return String(e?.message ?? e); } };
const tmp = mkdtempSync(join(tmpdir(), 'glacier-snowpack-'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const eq = same;
/** One block of checks; an exception inside it is a failure with its message (the blocks after it still run). */
const block = async (name, f) => { try { await f(); } catch (e) { add(`${name} Block bricht ab`, false, String(e?.stack ?? e).split(/\r?\n/).slice(0, 3).join(' | ')); } };

const LX = J(join(HERE, 'lib', 'fixtures', 'glacier', 'weather-levels.json'));
const LX_T0 = Date.parse(LX.t0), LX_RUN = LX.t0.replace(/[-:T]/g, '').slice(0, 10);
const [gCold, gWarm] = LX.glaciers;
const CAL = J(join(HERE, 'glacier', 'melt-calibration.json')).fit;
const TABLE = J(join(HERE, 'glacier', 'snow-calibration.json'));
const BOARD = snowCoreSetup({ density: 'board', base: SNOW, baseOrigin: SNOW_ORIGIN, table: TABLE });
const HELF = snowCoreSetup({ density: 'helfricht', base: SNOW, baseOrigin: SNOW_ORIGIN });
const HOURS = GLACIER_SNOWPACK_DAYS * 24;

// --- A: the core ---------------------------------------------------------------------------------------------------------------------------
await block('A', async () => {
  // a winter-to-thaw series: the real temperature of the warm glacier's tongue plus a slow warming, its real precipitation, a radiation with a daily course
  const n = 336, T = Float64Array.from(gWarm.levels[0].t, (v, i) => v + 0.02 * i), P = f64(gWarm.median.p), G = Float64Array.from({ length: n }, (_, i) => Math.max(0, 420 * Math.sin((2 * Math.PI * ((i + 17) % 24 - 6)) / 24)));
  const cmp = (z, ela, F, tweak = 1, n = 336) => {
    const sim = simulate({ bands: { zb: [z], w: [1] }, ela, t: T.subarray(0, n), g: G.subarray(0, n), p: P.subarray(0, n), zT: z, zP: z, pf: F, TF: CAL.TF, SRF: CAL.SRF, state: emptyState(1), pGrad: 0 });
    const lv = emptyLevel(), par = { TF: CAL.TF * tweak, SRF: CAL.SRF, aBare: bareAlbedo(z, ela) };
    let solid = 0, melted = 0;
    for (let h = 0; h < n; h++) { const S = F * Math.max(0, P[h]) * solidFraction(T[h]); solid += S; melted += stepLevel(lv, { tMs: LX_T0 + h * H, T: T[h], S, G: G[h] }, par, BOARD.c); }
    return { sim: sim.state.swe[0], core: packSwe(lv.pack), aSim: sim.state.aS[0], aCore: lv.aS, solid, melted, problems: packProblems(lv.pack, BOARD.c) };
  };
  // compared after 3, 5, 8 and 14 days: early there is snow that has partly melted, at the end of the warming it is gone at both
  const CP = [72, 120, 200, 336], as = CP.map((k) => cmp(1725, 3147, 1.793, 1, k)), bs = CP.map((k) => cmp(3200, 3147, 2.326, 1, k)), bads = CP.map((k) => cmp(1725, 3147, 1.793, 1.1, k));
  // one hour by hand: 30 mm at +1.5 °C on a bare surface — the new snow of the hour decides the albedo (snow, not ice), so far less melts than on bare ice
  const spot = (() => { const z = 2000, one = (v) => Float64Array.of(v); const sim = simulate({ bands: { zb: [z], w: [1] }, ela: 3000, t: one(1.5), g: one(500), p: one(30), zT: z, zP: z, pf: 2, TF: CAL.TF, SRF: CAL.SRF, state: emptyState(1), pGrad: 0 }); const lv = emptyLevel(); const m = stepLevel(lv, { tMs: LX_T0, T: 1.5, S: 2 * 30 * solidFraction(1.5), G: 500 }, { TF: CAL.TF, SRF: CAL.SRF, aBare: bareAlbedo(z, 3000) }, BOARD.c); return { sim: sim.state.swe[0], core: packSwe(lv.pack), melted: m, onIce: CAL.TF * 0.85 * 1.5 + CAL.SRF * (1 - MELT.aIce) * 500 }; })();
  const a = as[1], b = bs[1], bad = bads.reduce((m, x) => (Math.abs(x.sim - x.core) > Math.abs(m.sim - m.core) ? x : m));
  add('A1 Masse an einer Höhe = Schmelzkern: `stepLevel` und `simulate` auf EINEM Band geben mit denselben Eingaben (echte Temperatur und echter Niederschlag der Zunge, dazu Erwärmung und Tagesgang der Strahlung) denselben Wasserwert und dieselbe Schneealbedo, unter und über der Gleichgewichtslinie; es wird geschmolzen (die Prüfung ist nicht leer); von Hand eine Stunde, in der Neuschnee eine blanke Fläche zudeckt: es gilt die Albedo des Schnees dieser Stunde (weniger als halb so viel Schmelze wie auf Eis), in beiden Kernen gleich; Gegenprobe: mit 10 % mehr TF weicht der Wasserwert ab',
    [...as, ...bs].every((x) => Math.abs(x.sim - x.core) < 1e-9 && Math.abs(x.aSim - x.aCore) < 1e-12) && as.some((x) => x.melted > 1 && x.core > 1) && bs.some((x) => x.melted > 1 && x.core > 1) && Math.abs(bad.sim - bad.core) > 0.3
    && Math.abs(spot.sim - spot.core) < 1e-9 && spot.melted > 0.1 && spot.melted < 0.5 * spot.onIce,
    JSON.stringify({ tongue: as.map((x) => [x.sim, x.core, x.melted]), above: bs.map((x) => [x.sim, x.core, x.melted]), tweak: bad.sim - bad.core }));
  add('A2 der Kern fügt Dicke hinzu, nie Masse: Wasserwert = fester Niederschlag − genommene Schmelze; die Schneedecke besteht die Regeln des Schneekerns',
    [...as, ...bs].every((x) => Math.abs(x.solid - x.melted - x.core) < 1e-9 && !x.problems.length) && a.solid > 5, JSON.stringify([a.solid, a.melted, a.core]));
  const tz = gWarm.levels.map((l) => f64(l.t)), share = tz.map((t) => Float64Array.from(t, solidFraction));
  const d = driveOf({ tz, share, p: P, g: G, factor: [1.5, 2, 2.5], hours: HOURS });
  const h0 = P.findIndex((v) => v > 0.2);
  const pNaN = Float64Array.from(P); pNaN[h0] = NaN;
  const tNaN = tz.map((t) => Float64Array.from(t)); tNaN[1][5] = NaN;
  add('A3 Antrieb in der Auflösung des Zustands: Temperatur auf 0,1 °C, fester Niederschlag = Faktor × Niederschlag × Schneeanteil auf 0,01 mm, Strahlung auf 1 W/m², alles ganze Zahlen; fehlender Niederschlag zählt als keiner; eine Temperaturlücke bricht ab (nichts wird gefüllt)',
    d.t.every((a2, l) => a2.every((v, h) => Number.isInteger(v) && v === Math.round(tz[l][h] * 10))) && d.s.every((a2, l) => a2.every((v, h) => Number.isInteger(v) && v === Math.round(100 * [1.5, 2, 2.5][l] * Math.max(0, P[h]) * share[l][h])))
    && d.g.every((v, h) => v === Math.round(G[h])) && d.s[2][h0] > 0 && driveOf({ tz, share, p: pNaN, g: G, factor: [1, 1, 1], hours: HOURS }).s[2][h0] === 0
    && /Temperaturlücke/.test((await throws(() => driveOf({ tz: tNaN, share, p: P, g: G, factor: [1, 1, 1], hours: HOURS }))) ?? ''));
  // nasty layers: a trace that rounds to nothing, a layer denser than the maximum after rounding, a thin fluffy one
  const lv = { pack: emptyPack(), aS: 0.612345 };
  lv.pack.old = { swe: 0.44, h: 0.06 };
  lv.pack.fresh = [{ swe: 0.03, h: 0.05, t0: 100 * H }, { swe: 0.16, h: 0.74, t0: 106 * H }, { swe: 12.34, h: 12.86, t0: 112 * H }];
  const row = normalizeLevel(lv, BOARD.c), again = normalizeLevel(lv, BOARD.c);
  const doc = { schema: 1, kind: 'glacier/snowpack-state', atMs: 200 * H, source: 'run', run: null, since: new Date(90 * H).toISOString(), rules: { precip: 'country', density: 'board' }, pendH: 18, g: { x: [100, 0, [row, [0, 0], [0, 0]], [612, 550, 550], null] } };
  add('A4 die Schneedecke, wie der Zustand sie hält: Masse und Dicke auf 0,1, eine Schicht ohne Masse entfällt, jede Dichte liegt in den Grenzen des Vertrags, die Albedo auf 0,001; danach IST die Schneedecke genau die gespeicherte (zweites Normalisieren ändert nichts) und besteht Kern- und Vertragsregeln',
    same(row, again) && same(packToRow(lv.pack), row) && row.length === 2 + 2 * 3 && row[0] === 4 && row[1] === 1 && lv.aS === 0.612 && !packProblems(lv.pack, BOARD.c).length && !snowpackStateProblems(doc).length, JSON.stringify(row));
  add('A5 Schalter: die Voreinstellung ist „off“ (der Rückfall), „shadow“ ist wählbar, leer und null geben die Voreinstellung, ein unbekanntes Wort bricht mit den erlaubten Stellungen ab; der Start verlangt ab Werk einen Zustand („state“), „cold“ ist wählbar',
    SNOWPACK_DEFAULT === 'off' && SNOWPACK_MODES.join() === 'off,shadow' && snowpackModeOf(null) === 'off' && snowpackModeOf('') === 'off' && snowpackModeOf(undefined) === 'off' && snowpackModeOf('shadow') === 'shadow'
    && /off, shadow/.test((await throws(() => snowpackModeOf('an'))) ?? '') && SNOWPACK_START_DEFAULT === 'state' && snowpackStartOf(null) === 'state' && snowpackStartOf('cold') === 'cold' && /state, cold/.test((await throws(() => snowpackStartOf('kalt'))) ?? ''));
});

// --- B: the state does not depend on the cadence ---------------------------------------------------------------------------------------------
const lvDrive = (g, factor) => { const tz = g.levels.map((l) => f64(l.t)); return driveOf({ tz, share: tz.map((t) => Float64Array.from(t, solidFraction)), p: f64(g.median.p), g: new Float64Array(336).fill(60), factor, hours: HOURS }); };
const parsOf = (g) => g.z.map((z) => ({ TF: CAL.TF, SRF: CAL.SRF, aBare: bareAlbedo(z, g.z[1]) }));
await block('B', async () => {
  const g = gWarm, drive = lvDrive(g, [1.8, 1.8, 1.8]), pars = parsOf(g), c = BOARD.c, begin = Math.round(LX_T0 / H);
  const A = snowpackOfGlacier({ id: g.id, z: g.z, levels: levelsOfEntry(null), drive, pars, c, t0Ms: LX_T0, begin });
  // the path run A forecast, hour by hour, from the state it stored
  const path = (k) => { const lv = levelsOfEntry(A.entry); for (let h = 0; h < k; h++) for (let l = 0; l < 3; l++) stepLevel(lv[l], { tMs: LX_T0 + h * H, T: drive.t[l][h] / 10, S: drive.s[l][h] / 100, G: drive.g[h] }, pars[l], c); return lv.map((x) => packToRow(x.pack)); };
  const at = (k) => advanceEntry(A.entry, LX_T0, LX_T0 + k * H, pars, c);
  const eq = [0, 3, 6, 9, 15, 18].map((k) => { const a = at(k); return a.replayed === k && a.holes === 0 && same(a.levels.map((x) => packToRow(x.pack)), path(k)); });
  const far = at(20), far30 = at(30);
  add('B1 der Zustand hängt nicht an der Taktung: ein Lauf 0, 3, 6, 9, 15 oder 18 Stunden später steht nach dem Rechnen mit dem gespeicherten Antrieb genau dort, wo der frühere Lauf diese Stunde vorhergesagt hat (Schicht für Schicht gleich), ohne Stunde ohne Antrieb — auch der Abstand 3 h, der den Schmelzzustand verwirft; es liegt Schnee (die Prüfung ist nicht leer)',
    eq.every(Boolean) && packSwe(at(18).levels[2].pack) > 5, JSON.stringify(eq));
  add(`B2 jenseits des gespeicherten Antriebs (${GLACIER_SNOWPACK_PEND_H} h) wird gezählt, nicht gefüllt: 20 h später sind 18 Stunden gerechnet und 2 ohne Antrieb, 30 h später 18 und 12, die Schneedecke ist die nach 18 Stunden; ein Zustand aus der Zukunft bricht ab`,
    far.replayed === 18 && far.holes === 2 && far30.holes === 12 && same(far.levels.map((x) => packToRow(x.pack)), path(18)) && /Zukunft/.test((await throws(() => at(-1))) ?? ''));
  const noPend = advanceEntry([A.entry[0], 0, A.entry[2], A.entry[3], null], LX_T0, LX_T0 + 18 * H, pars, c);
  add('B3 Gegenprobe: ohne gespeicherten Antrieb fehlen die 18 Stunden (gezählt) und mit ihnen der Schnee dieser Stunden',
    noPend.replayed === 0 && noPend.holes === 18 && packSwe(noPend.levels[2].pack) < packSwe(at(18).levels[2].pack) - 1);
  // a chain of runs every 3 h against one path: only the rounding of the stored packs lies between them
  let entry = A.entry, t = LX_T0;
  for (let k = 0; k < 6; k++) {
    const a = advanceEntry(entry, t, t + 3 * H, pars, c); t += 3 * H;
    const sh = (x) => x.map((arr) => arr.slice(3 * (k + 1)).concat(new Array(3 * (k + 1)).fill(0)));
    entry = snowpackOfGlacier({ id: g.id, z: g.z, levels: a.levels, drive: { t: sh(drive.t), s: sh(drive.s), g: drive.g }, pars, c, t0Ms: t, begin }).entry;
  }
  const chain = levelsOfEntry(entry).map((x) => packSwe(x.pack)), one = at(18).levels.map((x) => packSwe(x.pack));
  add('B4 sechs Läufe im 3-Stunden-Takt gegen einen Lauf über dieselben 18 Stunden: derselbe Wasserwert an allen drei Höhen bis auf die Rundung des gespeicherten Zustands (0,5 mm)',
    chain.every((v, l) => Math.abs(v - one[l]) <= 0.5) && one[2] > 3, JSON.stringify({ chain, one }));
  const st = { atMs: LX_T0, rules: { precip: 'country', density: 'board' } };
  add('B5 eine Schneedecke aus einer Rechnung (V-GM-27): ein Zustand mit anderem Faktor oder anderer Dichte wird nicht fortgesetzt, ein fehlender und einer aus der Zukunft auch nicht — jeweils mit Grund; der passende wird genommen',
    stateRefusal(st, { precip: 'country', density: 'board' }, LX_T0) === null && /anderer Rechnung/.test(stateRefusal(st, { precip: 'gate-c', density: 'helfricht' }, LX_T0)) && /anderer Rechnung/.test(stateRefusal(st, { precip: 'country', density: 'helfricht' }, LX_T0))
    && /kein Zustand/.test(stateRefusal(null, st.rules, LX_T0)) && /Zukunft/.test(stateRefusal(st, st.rules, LX_T0 - H)));
});

// --- C: the row and the contract ---------------------------------------------------------------------------------------------------------------
const docOf = (rows, extra = {}) => {
  const gapped = rows.filter((r) => r.gap != null);
  return {
    schema: 1, kind: 'glacier/snowpack', run: LX_RUN, runAt: LX.at, origin: 'computed', engine: { name: 'buscosun Fusion 14', version: 14, stageCurrent: true }, cube: {}, verified: { measured: false, note: GLACIER_SNOWPACK_NOTE },
    heights: ['tongue', 'median', 'top'], days: 14, windows: [24, 48, 72],
    rules: { forcing: { rule: 'answers', neighbour: 'placed', phase: 'temperature', order: 'not-more-below' }, precip: { rule: 'country', gate: false, reason: 'rot' }, density: { source: 'board', rhoNew: 96, p10: 65, p90: 148.1, origin: 'measured' },
      melt: { rule: 'eti', TF: 0.12, SRF: 0.005, origin: 'measured', radiation: 'clear-sky-cloud' }, core: { layerH: 6, newWindowH: 72, sources: [] }, sums: 'expected', spread: 'none', newSnow: 'settled' },
    state: { source: 'carried', since: '2026-10-01T00:00:00.000Z', ageH: 6, replayedH: 6, started: 0, gaps: { glaciers: gapped.length, maxH: gapped.reduce((m, r) => Math.max(m, r.gap), 0) } },
    coverage: { own: rows.filter((r) => r.f === 'own').length, neighbour: rows.filter((r) => r.f !== 'own').length, lapse: rows.filter((r) => r.lv === 'lapse').length }, build: 'x', glaciers: rows, skipped: [], ...extra,
  };
};
let rowWarm, rowCold;
await block('C', async () => {
  const mk = (g, F, c, state = null) => { const levels = levelsOfEntry(state); return snowpackOfGlacier({ id: g.id, z: g.z, levels, drive: lvDrive(g, [F, F, F]), pars: parsOf(g), c, t0Ms: LX_T0, begin: Math.round(LX_T0 / H) }); };
  const w = mk(gWarm, 1.793, BOARD.c), cold = mk(gCold, 2.326, BOARD.c), wH = mk(gWarm, 1.793, HELF.c);
  rowWarm = w.row; rowCold = cold.row;
  const doc = docOf([w.row, cold.row]);
  // by hand at the top of the warm glacier (never above −4.5 °C: all precipitation solid, no melt): after day 1 the pack holds F × the precipitation of 24 h
  const F = 1.793, p24 = gWarm.median.p.slice(0, 24).reduce((s, v) => s + Math.round(100 * F * Math.max(0, v)) / 100, 0);
  const d1 = (() => { const lv = levelsOfEntry(w.entry), dr = lvDrive(gWarm, [F, F, F]), pars = parsOf(gWarm); for (let h = 0; h < 24; h++) stepLevel(lv[2], { tMs: LX_T0 + h * H, T: dr.t[2][h] / 10, S: dr.s[2][h] / 100, G: dr.g[h] }, pars[2], BOARD.c); return lv[2]; })();
  const hsLo = (p24 / BOARD.c.rhoMax) * 100, hsHi = (p24 / BOARD.c.rhoNew) * 100;
  add('C1 Zeile aus echten Antworten an drei Höhen (zwei Gletscher): das Dokument besteht den Vertrag; aus dem Kaltstart ist zur Laufstunde nichts da, danach wächst die Schneedecke; von Hand an der Oberkante (immer unter −4 °C): der Wasserwert nach 24 h ist der Faktor × Niederschlag dieser Stunden, die Schneehöhe am Tagesende liegt zwischen der dichtesten und der frischesten Packung; an der Zunge (bis +4 °C) liegt weniger als oben',
    !snowpackProblems(doc).length && w.row.hs.every((v) => v === 0) && w.row.swe.every((v) => v === 0) && Math.abs(packSwe(d1.pack) - p24) < 1e-6 && p24 > 15 && Math.abs(w.row.hsd[2][0] - Math.round(packDepthCm(d1.pack) * 10) / 10) < 1e-9
    && w.row.hsd[2][0] >= hsLo && w.row.hsd[2][0] <= hsHi && w.row.hsd[0][13] < w.row.hsd[2][13] && w.row.hnd[2][0] > 5 && w.row.hnd[2][0] <= w.row.hsd[2][0], JSON.stringify({ p24, hsd: w.row.hsd[2].slice(0, 3), tongue: w.row.hsd[0][13], top: w.row.hsd[2][13] }));
  add('C2 die Dichte des Laufs wirkt: mit 68 kg/m³ (Rückfall) steht am ersten Tag an der Oberkante mehr Neuschnee als mit 96 kg/m³, bei gleichem Wasserwert im gespeicherten Antrieb',
    wH.row.hnd[2][0] > w.row.hnd[2][0] * 1.15 && same(wH.entry[4], w.entry[4]), JSON.stringify([wH.row.hnd[2][0], w.row.hnd[2][0]]));
  // a pack taken over: 72-h windows and the depth at the run hour
  const pre = [Math.round(LX_T0 / H) - 500, 0, [[2000, 800, 300, 280, Math.round(LX_T0 / H) - 30, 120, 150, Math.round(LX_T0 / H) - 10], [0, 0], [3000, 1000]], [600, 550, 700], null];
  const t = mk(gCold, 2.326, BOARD.c, pre).row;
  add('C3 Neuschnee der letzten 24 / 48 / 72 h aus den frischen Schichten des übernommenen Zustands: die Schicht von vor 10 h zählt in allen Fenstern, die von vor 30 h erst ab 48 h, der Altschnee nie; kein Fenster liegt über dem größeren oder über der Schneehöhe',
    Math.abs(t.hn[0][0] - 15) < 0.11 && Math.abs(t.hn[0][1] - 43) < 0.11 && Math.abs(t.hn[0][2] - 43) < 0.11 && Math.abs(t.hs[0] - 123) < 0.11 && Math.abs(t.swe[0] - 242) < 0.11 && t.hn[2].every((v) => v === 0) && t.hs[2] === 100, JSON.stringify(t.hn[0]));
  const bad = [
    (d) => { d.origin = 'measured'; }, (d) => { d.origin = 'model'; }, (d) => { d.verified.measured = true; }, (d) => { delete d.verified; }, (d) => { d.windows = [24, 48]; }, (d) => { d.days = 7; },
    (d) => { d.rules.spread = 'scenarios'; }, (d) => { d.rules.precip = { rule: 'country', gate: false }; }, (d) => { d.rules.precip = { rule: 'gate-c' }; }, (d) => { d.rules.density.p10 = 120; }, (d) => { delete d.rules.melt; },
    (d) => { d.state.source = 'guess'; }, (d) => { d.state.since = '2027-01-01T00:00:00Z'; }, (d) => { d.state.replayedH = 9; }, (d) => { d.state.gaps.glaciers = 1; }, (d) => { d.coverage.own = 5; },
    (d) => { d.glaciers[0].hs[1] = -1; }, (d) => { d.glaciers[0].hs[1] = 40; d.glaciers[0].swe[1] = 0; }, (d) => { d.glaciers[0].hs[1] = 10; d.glaciers[0].swe[1] = 60; }, (d) => { d.glaciers[0].hs[1] = 100; d.glaciers[0].swe[1] = 10; },
    (d) => { d.glaciers[0].hn[1] = [5, 3, 3]; }, (d) => { d.glaciers[0].hn[1] = [1, 1, 9]; }, (d) => { d.glaciers[0].hnd[1][4] = d.glaciers[0].hsd[1][4] + 3; }, (d) => { d.glaciers[0].hsd[2].pop(); }, (d) => { d.glaciers[0].z = [3000, 2000, 1000]; },
    (d) => { d.glaciers[0].f = d.glaciers[0].id; }, (d) => { d.glaciers[0].lv = 'median'; }, (d) => { d.glaciers[0].gap = 0; }, (d) => { d.glaciers[0].from = '2026-09-01'; }, (d) => { d.glaciers.push(structuredClone(d.glaciers[0])); d.coverage.own++; },
    (d) => { d.skipped = [{ id: 'x' }]; }, (d) => { d.engine.version = null; }, (d) => { d.run = '20261121'; },
  ];
  const caught = bad.map((edit) => { const d = structuredClone(doc); edit(d); return snowpackProblems(d).length; });
  add(`C4 Negativkontrollen des Vertrags: jede von ${bad.length} Verletzungen wird gemeldet — darunter Herkunft „measured“ oder „model“ statt „computed“, fehlender Vermerk „nicht nachgemessen“, Spanne behauptet, Dichte ohne den passenden Faktor (E-GM-13), Schneehöhe ohne Wasserwert, unmögliche Dichte, Neuschnee über der Schneehöhe, Abdeckung und Lücken, die nicht zu den Zeilen passen`,
    caught.every((n) => n > 0), JSON.stringify(caught));
  const st = { schema: 1, kind: 'glacier/snowpack-state', atMs: LX_T0, source: 'run', run: LX_RUN, since: '2026-10-01T00:00:00.000Z', rules: { precip: 'country', density: 'board' }, pendH: 18, g: { [gWarm.id]: w.entry, [gCold.id]: structuredClone(pre) } };
  const sBad = [
    (s) => { s.atMs += 1800_000; }, (s) => { s.source = 'guess'; }, (s) => { s.since = new Date(LX_T0 + H).toISOString(); }, (s) => { s.rules.precip = 'gate-c'; }, (s) => { s.rules.precip = 'pf'; }, (s) => { s.pendH = -1; },
    (s) => { s.g[gWarm.id][0] = Math.round(LX_T0 / H) + 1; }, (s) => { s.g[gWarm.id][1] = -1; }, (s) => { s.g[gCold.id][2][0] = [2000, 0]; }, (s) => { s.g[gCold.id][2][0] = [2000, 10]; }, (s) => { s.g[gCold.id][2][0][7] = s.g[gCold.id][2][0][4]; },
    (s) => { s.g[gCold.id][2][2] = [1.5, 2]; }, (s) => { s.g[gWarm.id][3] = [600, 1200, 600]; }, (s) => { s.g[gWarm.id][4][0][1].pop(); }, (s) => { s.g[gWarm.id][4][1][0][0] = -3; }, (s) => { s.pendH = 12; }, (s) => { s.g[gWarm.id].pop(); },
  ];
  const sCaught = sBad.map((edit) => { const s = structuredClone(st); edit(s); return snowpackStateProblems(s).length; });
  add(`C5 der Zustand besteht seinen Vertrag; Negativkontrollen: jede von ${sBad.length} Verletzungen wird gemeldet (Zeit keine volle Stunde, Regeln, Beginn, Masse ohne Dicke, unmögliche Dichte, Reihenfolge der Schichten, Albedo, gespeicherter Antrieb)`,
    !snowpackStateProblems(st).length && sCaught.every((n) => n > 0), JSON.stringify(sCaught));
});
await block('C6', async () => {
  // a neighbour's answers on own elevations (E-GM-16): the context the weather core hands out for the warm glacier
  const g = gWarm, tz = g.levels.map((l) => f64(l.t)), levels = { sg: g.levels.map((l) => f64(l.sg)), rh: g.levels.map((l) => f64(l.rh)), ps: g.levels.map((l) => f64(l.ps)) }, m = g.median;
  const wx = { w: f64(m.w), g: f64(m.g), g10: f64(m.g10), g90: f64(m.g90), d: f64(m.d), t10: f64(m.t10), t90: f64(m.t90), sl: f64(m.sl), ps: levels.ps[1], rh: levels.rh[1], pDist: new Array(LX.hours).fill(null) };
  const out = weatherOfGlacier({ id: g.id, z: g.z, from: 'own', p: f64(m.p), n: f64(m.n), wx, sg: levels.sg[1], seed: 7, tz, levels });
  const at = { temp: (zq, h) => tempAtElevation(zq, h, out.ctx), share: (zq, h) => shareAtElevation(zq, h, out.ctx) };
  // the same under psnow: the share of an answer is its pSnow, which the rule function reproduces only with the offset of that answer
  const outP = weatherOfGlacier({ id: g.id, z: g.z, from: 'own', p: f64(m.p), n: f64(m.n), wx, sg: levels.sg[1], seed: 7, tz, levels, phase: 'psnow' });
  const selfPs = placeLevels(g.z, HOURS, { temp: (zq, h) => tempAtElevation(zq, h, outP.ctx), share: (zq, h) => shareAtElevation(zq, h, outP.ctx) });
  let idPs = true, offUsed = 0;
  for (let h = 0; h < HOURS; h++) for (let l = 0; l < 3; l++) { if (Math.abs(selfPs.share[l][h] - outP.shares[l][h]) > 1e-9) idPs = false; if (Math.abs(outP.ctx.c[l][h]) > 0.02) offUsed++; }
  const selfP = placeLevels(g.z, HOURS, at), mid = placeLevels([g.z[0] + 400, (g.z[0] + g.z[1]) / 2, g.z[2] - 300], HOURS, at), outside = placeLevels([g.z[0] - 200, g.z[1], g.z[2] + 200], HOURS, at);
  const clip = placeLevels([1, 2, 3], 2, { temp: () => 0, share: (z) => (z === 1 ? 0.9 : z === 2 ? 0.5 : 0.7) });
  let idT = true, idS = true, between = true, order = true, colder = 0;
  for (let h = 0; h < HOURS; h++) {
    for (let l = 0; l < 3; l++) { if (Math.abs(selfP.tz[l][h] - tz[l][h]) > 1e-9) idT = false; if (Math.abs(selfP.share[l][h] - out.shares[l][h]) > 1e-9) idS = false; }
    const lo = Math.min(tz[0][h], tz[1][h]), hi = Math.max(tz[0][h], tz[1][h]);
    if (mid.tz[1][h] < lo - 1e-9 || mid.tz[1][h] > hi + 1e-9) between = false;
    for (const pl of [mid, outside]) if (pl.share[0][h] > pl.share[1][h] + 1e-12 || pl.share[1][h] > pl.share[2][h] + 1e-12) order = false;
    if (outside.tz[2][h] < tz[2][h]) colder++;
  }
  add('C6 Antworten eines Nachbarn auf eigenen Höhen (E-GM-16): die Wetterzeile gibt Schneeanteile und den Bezug der drei Antworten heraus; in den Höhen des Nachbarn selbst kommen genau seine Temperaturen und Schneeanteile heraus — auch unter „psnow“, wo der Schneeanteil einer Antwort nur mit ihrem Versatz zur Regelfunktion stimmt (in vielen Stunden über 0,02) —, dazwischen liegt die Temperatur zwischen den zwei Antworten, 200 m über der Oberkante ist es in jeder Stunde kälter (begrenzter Gradient), unten nie mehr Schneeanteil als oben (von Hand: 0,9 / 0,5 / 0,7 von unten nach oben wird 0,5 / 0,5 / 0,7)',
    !!out.ctx && out.shares?.length === 3 && idT && idS && idPs && offUsed > 20 && between && order && colder === HOURS && same([clip.share[0][0], clip.share[1][0], clip.share[2][0]], [0.5, 0.5, 0.7]), JSON.stringify({ idT, idS, between, order, colder }));
});

// --- D: melt.mjs end to end ------------------------------------------------------------------------------------------------------------------
const mkTree = (root) => {
  const data = join(root, 'data'), cube = join(root, 'cube'), build = '20261011-9', region = 'ch-test';
  mkdirSync(join(data, 'static', build, 'hypso'), { recursive: true }); mkdirSync(join(cube, 'point'), { recursive: true }); mkdirSync(join(data, 'melt'), { recursive: true });
  const cat = [
    { id: 'gl_ch_alpha', name: 'Alpha', country: 'CH', region, klass: 'A', area: { km2: 3 }, z: [2400, 2600, 2800], lat: 46.5, lon: 8.4, lead: true },
    { id: 'gl_ch_beta', name: 'Beta', country: 'CH', region, klass: 'B', area: { km2: 0.5 }, z: [2500, 2700, 2900], lat: 46.52, lon: 8.45 },
    { id: 'gl_ch_gamma', name: 'Gamma', country: 'CH', region, klass: 'C', area: { km2: 0.05 }, z: [2600, 2800, 3000], lat: 46.51, lon: 8.42 },
    { id: 'gl_ch_far', name: 'Far', country: 'CH', region: 'ch-far', klass: 'C', area: { km2: 0.05 }, z: [2600, 2800, 3000], lat: 46.0, lon: 9.9 },
  ];
  writeFileSync(join(data, 'static', build, 'catalog.json'), JSON.stringify({ build, glaciers: cat }));
  const hyp = (z0) => ({ z0, a: [0.1, 0.3, 0.5, 0.6, 0.5, 0.3, 0.2, 0.1], zr: [z0, z0 + 400], cov: 1 });
  writeFileSync(join(data, 'static', build, 'hypso', `${region}.json`), JSON.stringify({ schema: 1, kind: 'glacier/hypso', build, region, bandM: 50, glaciers: { gl_ch_alpha: hyp(2400), gl_ch_beta: hyp(2500), gl_ch_gamma: hyp(2600) } }));
  writeFileSync(join(data, 'static', build, 'hypso', 'ch-far.json'), JSON.stringify({ schema: 1, kind: 'glacier/hypso', build, region: 'ch-far', bandM: 50, glaciers: { gl_ch_far: hyp(2600) } }));
  writeFileSync(join(data, 'index.json'), JSON.stringify({ schema: 1, static: { build }, updatedAt: '2026-10-10T00:00:00Z' }));
  writeFileSync(join(cube, 'point', 'index.json'), JSON.stringify({ latestByTier: { t1: { run: '2026101003' }, t2: { run: '2026101000' }, t3: { run: '2026101000' } } }));
  writeFileSync(join(root, 'cal.json'), JSON.stringify({ schema: 1, fit: { pf: 1.2, TF: 0.05, SRF: 0.008 }, gate: { unit: false, reason: 'Test' }, report: 'test' }));
  // the real table in the form the producer reads, with the two regions of the test catalogue
  const t = structuredClone(TABLE); t.precip.regions = { 'ch-test': { ...TABLE.precip.regions['ch-ost'] }, 'ch-far': { ...TABLE.precip.regions['at-dachstein'] } };
  writeFileSync(join(root, 'snowcal.json'), JSON.stringify(t));
  return { data, cube, cal: join(root, 'cal.json'), snowcal: join(root, 'snowcal.json'), ids: cat.map((g) => g.id) };
};
const F_TEST = TABLE.precip.regions['ch-ost'].F;
const MEDIANS = [2600, 2700, 2800], TONGUES = [2425, 2525, 2625];
/** The real answers of the warm glacier as the stubbed buscosun Fusion, answering by the elevation asked; `shiftH` = the run hour of a later run (the same weather, later). */
const fcLevel = (lv, shiftH = 0, edit = null) => ({
  cube: { notes: LX.notes, cells: [], v2: { provenance: { runs: LX.runs }, axis: { steps: Array.from({ length: LX.hours }, (_, i) => {
    const k = Math.min(LX.hours - 1, i + shiftH), l = gWarm.levels[lv], m = gWarm.median;
    const s = { validAtMs: LX_T0 + (i + shiftH) * H, leadH: i, interpolated: false, vars: {
      t2m: { mean: l.t[k], sigma: l.sg[k], p10: m.t10[k], p90: m.t90[k] }, rh: { p50: l.rh[k] }, precip: { mean: m.p[k], dist: null }, clct: { mean: m.n[k] == null ? null : m.n[k] * 100 },
      wind: { mean: m.w[k] }, windDir: m.d[k] == null ? null : { mean: m.d[k] }, gust: { mean: m.g[k], p10: m.g10[k], p90: m.g90[k] }, snowline: m.sl[k] == null ? null : { mean: m.sl[k] }, pSnow: l.ps[k] == null ? null : { mean: l.ps[k] },
    } };
    if (edit) edit(s, i);
    return s;
  }) } } },
});
const okIo = () => ({ clima: async () => ({}), store: null });
const WX_FILES = [glacierWeatherRunPath, (r) => glacierWeatherHourlyPath(r, 'ch-test'), (r) => glacierWeatherHourlyPath(r, 'ch-far'), () => GLACIER_WEATHER_PHASE_PATH, (r) => `melt/${r}.json`, () => 'melt/state.json'];
/** One run of `melt.mjs` on a tree; `shiftH` hours after the fixture's run hour; `hook(o, elevation, lv)` may throw or edit. */
const runSp = async (root, extra = {}, { shiftH = 0, out = 'out', hook = null } = {}) => {
  const tr = { data: join(root, 'data'), cube: join(root, 'cube'), cal: join(root, 'cal.json'), snowcal: join(root, 'snowcal.json') };
  const outDir = join(root, out), patch = join(root, `${out}-patch`), run = new Date(LX_T0 + shiftH * H).toISOString().replace(/[-:T]/g, '').slice(0, 10);
  const forecast = async (o, io) => { const e = io.terrainOverride.elevationM, lv = MEDIANS.includes(e) ? 1 : TONGUES.includes(e) ? 0 : 2; return fcLevel(lv, shiftH, hook ? hook(o, e, lv) : null); };
  let res = null, err = null;
  try { res = await main({ data: tr.data, cube: tr.cube, out: outDir, patch, calibration: tr.cal, snowcal: tr.snowcal, now: new Date(Date.parse(LX.at) + shiftH * H).toISOString(), forecast, ioFactory: okIo, always: true, ...extra }); } catch (e) { err = String(e?.message ?? e); }
  const rd = (rel) => (existsSync(join(outDir, rel)) ? readFileSync(join(outDir, rel), 'utf8') : null);
  const status = existsSync(join(patch, 'status-patch.json')) ? J(join(patch, 'status-patch.json')) : null, index = existsSync(join(patch, 'index-patch.json')) ? J(join(patch, 'index-patch.json')) : null;
  const sp = rd(glacierSnowpackRunPath(run)), st = rd(GLACIER_SNOWPACK_STATE_PATH);
  return { res, err, run, outDir, wrote: existsSync(outDir), files: WX_FILES.map((f) => rd(f(run))), status, index, doc: sp ? JSON.parse(sp) : null, state: st ? JSON.parse(st) : null, stateRaw: st, hasDir: existsSync(join(outDir, 'snowpack')) };
};
/** Puts a state into the data tree of a root (what the publisher would have done between two runs). */
const putState = (root, stateRaw) => { mkdirSync(join(root, 'data', 'snowpack'), { recursive: true }); writeFileSync(join(root, 'data', 'snowpack', 'state.json'), stateRaw); };
const strip = (e) => { const s = structuredClone(e.status); delete s.lines.snowpack; delete s.lines.melt.seconds; delete s.lines.melt.mem; if (s.lines.weather?.levels) delete s.lines.weather.levels.seconds; const i = structuredClone(e.index); delete i.snowpack; return JSON.stringify([s, i]); };
const mk = (name) => { const root = join(tmp, name); mkTree(root); return root; };
const rowOf = (e, id) => e.doc?.glaciers.find((r) => r.id === id);
await block('D', async () => {
  const rDef = mk('d-def'), rOff = mk('d-off'), rGarb = mk('d-garbage'), rNo = mk('d-nostate'), rCold = mk('d-cold');
  const eDef = await runSp(rDef), eOff = await runSp(rOff, { snowpack: 'off' });
  putState(rGarb, '{ kein json');
  const eGarbOff = await runSp(rGarb, { snowpack: 'off', density: '96', 'snowpack-start': 'kalt' }), eGarbOn = await runSp(rGarb, { snowpack: 'shadow' }, { out: 'out2' });
  process.env.GLACIER_SNOW_DENSITY = 'unsinn'; process.env.GLACIER_SNOWPACK_START = 'unsinn';
  const eEnvOff = await runSp(mk('d-envoff'));
  delete process.env.GLACIER_SNOW_DENSITY; delete process.env.GLACIER_SNOWPACK_START;
  const eNo = await runSp(rNo, { snowpack: 'shadow' }), eCold = await runSp(rCold, { snowpack: 'shadow', 'snowpack-start': 'cold' });
  process.env.GLACIER_SNOWPACK = 'shadow'; process.env.GLACIER_SNOWPACK_START = 'cold';
  const eEnv = await runSp(mk('d-env'));
  delete process.env.GLACIER_SNOWPACK; delete process.env.GLACIER_SNOWPACK_START;
  const sameFiles = (a, b) => a.files.every((f, i) => f != null && f === b.files[i]);
  add('D1 aus = nichts gelesen, nichts geschrieben: ohne Angabe und mit „off“ entstehen dieselben Dateien (Schmelzdokument, Zustand, Wetterdokument, Stunden-Chunks, Regelvergleich), kein Ordner `snowpack/`, kein Eintrag in Zeiger und Statuszeile; ein unlesbarer Zustand im Daten-Repo, ein unsinniges Dichte- oder Startwort (Schalter oder Umgebung) stören den Lauf nicht — sie werden nicht angefasst',
    !eDef.err && !eOff.err && sameFiles(eDef, eOff) && !eDef.hasDir && !eOff.hasDir && !('snowpack' in eDef.status.lines) && !('snowpack' in eDef.index) && !('snowpack' in eDef.res) && strip(eDef) === strip(eOff)
    && !eGarbOff.err && sameFiles(eDef, eGarbOff) && !eGarbOff.hasDir && !eEnvOff.err && sameFiles(eDef, eEnvOff) && !eEnvOff.hasDir, JSON.stringify({ def: eDef.err, garb: eGarbOff.err, env: eEnvOff.err }));
  add('D2 „shadow“ ändert an den bestehenden Dateien nichts: Schmelzdokument, Zustand des Schmelzlaufs, Wetterdokument, Stunden-Chunks und Regelvergleich sind Byte für Byte die des Laufs ohne Schalter, Zeiger und Statuszeile bis auf die eigenen Einträge gleich; dazu kommen genau zwei Dateien unter `snowpack/`; die Umgebungsvariablen ergeben dasselbe Dokument wie die Schalter',
    !eCold.err && sameFiles(eDef, eCold) && strip(eDef) === strip(eCold) && eCold.hasDir && same(readdirSync(join(eCold.outDir, 'snowpack')).sort(), [`${eCold.run}.json`, 'state.json']) && same(eEnv.doc, eCold.doc) && eEnv.stateRaw === eCold.stateRaw);
  add('D3 kein stiller Ersatz: „shadow“ ohne Zustand schreibt nichts unter `snowpack/` und nennt den Grund in der Statuszeile (kein Zeiger), der Schmelzlauf und das Wetter sind die des Laufs ohne Schalter; ein unlesbarer Zustand ebenso; erst „--snowpack-start=cold“ beginnt bei null und sagt es',
    !eNo.err && !eNo.hasDir && /kein Zustand/.test(eNo.status.lines.snowpack?.error ?? '') && !('snowpack' in eNo.index) && sameFiles(eDef, eNo) && !eGarbOn.hasDir && /nicht lesbar/.test(eGarbOn.status.lines.snowpack?.error ?? '') && sameFiles(eDef, eGarbOn)
    && eCold.doc?.state.source === 'cold' && eCold.doc.state.since === LX.t0 && eCold.doc.state.ageH === null && eCold.status.lines.snowpack.mode === 'shadow' && eCold.index.snowpack?.run === eCold.run && eCold.index.snowpack.since === LX.t0,
    JSON.stringify({ no: eNo.status?.lines.snowpack, garb: eGarbOn.status?.lines.snowpack }));
  const d = eCold.doc, ids = new Set(['gl_ch_alpha', 'gl_ch_beta', 'gl_ch_gamma', 'gl_ch_far']);
  const a = rowOf(eCold, 'gl_ch_alpha'), gm = rowOf(eCold, 'gl_ch_gamma'), far = rowOf(eCold, 'gl_ch_far');
  add('D4 das Dokument: besteht den Vertrag, Herkunft „computed“, Vermerk „berechnet, noch nicht nachgemessen“, Stand von buscosun Fusion aus der Antwort, Regeln mit Faktor je Region samt rotem Urteil der Eichung, Dichte 96 kg/m³ mit der gemessenen Spanne, Schmelzparameter des Laufs; alle vier Gletscher haben eine Zeile (E-GM-16): drei mit eigenen Antworten, einer mit den Antworten seines Nachbarn auf eigenen Höhen (andere Höhen, andere Werte), keiner mit Hochrechnung',
    d && !snowpackProblems(d, ids).length && !snowpackStateProblems(eCold.state).length && d.origin === 'computed' && d.verified.measured === false && d.verified.note === GLACIER_SNOWPACK_NOTE && d.engine.version === 14
    && d.rules.precip.rule === 'country' && d.rules.precip.gate === false && !!d.rules.precip.reason && d.rules.precip.regions['ch-test'].F === F_TEST && d.rules.density.source === 'board' && d.rules.density.rhoNew === 96 && d.rules.density.p10 === 65 && d.rules.density.origin === 'measured'
    && d.rules.melt.TF === 0.05 && d.rules.forcing.phase === 'temperature' && d.glaciers.length === 4 && same(d.coverage, { own: 3, neighbour: 1, lapse: 0 }) && a.f === 'own' && far.f === 'own' && ['gl_ch_alpha', 'gl_ch_beta'].includes(gm.f) && !gm.lv
    && same(gm.z, [2625, 2800, 2975]) && !same(gm.hsd, rowOf(eCold, gm.f).hsd) && eCold.state.rules.precip === 'country' && eCold.state.rules.density === 'board' && eCold.state.source === 'run' && eCold.state.atMs === LX_T0, JSON.stringify({ cov: d?.coverage, gm: gm?.f, p: d ? snowpackProblems(d, ids) : null }));

  // the state between runs: B 18 h after A (all of the stored forcing), C 30 h after A (beyond it), an earlier hour (refused)
  const rB = mk('d-b'), rC = mk('d-c'), rPast = mk('d-past');
  putState(rB, eCold.stateRaw); putState(rC, eCold.stateRaw); putState(rPast, eCold.stateRaw);
  const eB = await runSp(rB, { snowpack: 'shadow' }, { shiftH: 18 }), eC = await runSp(rC, { snowpack: 'shadow' }, { shiftH: 30 }), ePast = await runSp(rPast, { snowpack: 'shadow' }, { shiftH: -2 });
  // a start word left in the workflow never throws a state away: with a state present, cold is the run as without the word
  const rBc = mk('d-bc'); putState(rBc, eCold.stateRaw);
  const eBc = await runSp(rBc, { snowpack: 'shadow', 'snowpack-start': 'cold' }, { shiftH: 18 });
  // by hand: 18 h after the cold start the top of Alpha (never above −4 °C) holds F × the precipitation of these hours
  const want = gWarm.median.p.slice(0, 18).reduce((s, v) => s + Math.round(100 * F_TEST * Math.max(0, v)) / 100, 0), bA = rowOf(eB, 'gl_ch_alpha');
  const viaCore = (() => { const g = { z: [2425, 2600, 2775] }; const e = eCold.state.g.gl_ch_alpha; const adv = advanceEntry(e, LX_T0, LX_T0 + 18 * H, g.z.map((z) => ({ TF: 0.05, SRF: 0.008, aBare: bareAlbedo(z, 2600) })), BOARD.c); return adv.levels.map((lv) => { normalizeLevel(lv, BOARD.c); return [Math.round(packDepthCm(lv.pack) * 10) / 10, Math.round(packSwe(lv.pack) * 10) / 10]; }); })();
  add('D5 der nächste Lauf, 18 h später, setzt den Zustand fort: Quelle „carried“, Alter 18 h, alle 18 Stunden aus dem gespeicherten Antrieb, keine Stunde ohne Antrieb, der Beginn bleibt der des ersten Laufs — auch wenn der Lauf „--snowpack-start=cold“ nennt (ein vorhandener Zustand wird nie verworfen); Schneehöhe und Wasserwert zur Laufstunde sind genau die, die der Kern aus dem gespeicherten Zustand rechnet; von Hand an der Oberkante: Faktor × Niederschlag der 18 Stunden (das Wasser der Wetterzeile × Faktor, V-GM-29)',
    !eB.err && eB.doc?.state.source === 'carried' && eB.doc.state.ageH === 18 && eB.doc.state.replayedH === 18 && eB.doc.state.gaps.glaciers === 0 && eB.doc.state.since === LX.t0 && eB.doc.state.started === 0 && !eB.doc.glaciers.some((r) => r.gap != null || r.from != null)
    && same(eBc.doc, eB.doc) && eBc.stateRaw === eB.stateRaw && bA.hs.every((v, l) => v === viaCore[l][0]) && bA.swe.every((v, l) => v === viaCore[l][1]) && Math.abs(bA.swe[2] - want) <= 0.15 && want > 3 && eB.state.atMs === LX_T0 + 18 * H && !snowpackProblems(eB.doc, ids).length, JSON.stringify({ want, swe: bA?.swe, viaCore }));
  add(`D6 ein Lauf 30 h später: ${GLACIER_SNOWPACK_PEND_H} Stunden gerechnet, 12 ohne Antrieb — jede Zeile nennt sie (\`gap\`), das Dokument zählt Gletscher und Höchstwert, der Zustand trägt sie weiter; ein Lauf VOR der Stunde des Zustands schreibt nichts unter \`snowpack/\`, nennt „Zukunft“ und lässt den Schmelzlauf laufen`,
    !eC.err && eC.doc?.state.ageH === 30 && eC.doc.state.replayedH === 18 && eC.doc.glaciers.every((r) => r.gap === 12) && same(eC.doc.state.gaps, { glaciers: 4, maxH: 12 }) && Object.values(eC.state.g).every((e) => e[1] === 12) && !snowpackProblems(eC.doc, ids).length
    && !ePast.err && !ePast.hasDir && /Zukunft/.test(ePast.status.lines.snowpack?.error ?? '') && ePast.files[4] != null);

  // one snowpack from one calculation; the density follows the precipitation switch
  const rRule = mk('d-rule'), rGc = mk('d-gc');
  putState(rRule, eCold.stateRaw);
  const eRule = await runSp(rRule, { snowpack: 'shadow', precip: 'gate-c' }), eGc = await runSp(rGc, { snowpack: 'shadow', precip: 'gate-c', 'snowpack-start': 'cold' });
  const eMix = await runSp(mk('d-mix'), { snowpack: 'shadow', precip: 'gate-c', density: 'board', 'snowpack-start': 'cold' }), eWord = await runSp(mk('d-word'), { snowpack: 'an' }), eStart = await runSp(mk('d-start'), { snowpack: 'shadow', 'snowpack-start': 'kalt' });
  const eH = await runSp(mk('d-helf'), { snowpack: 'shadow', density: 'helfricht', 'snowpack-start': 'cold' });
  // by hand under gate-c: the factor of Gate C with 4 % per 100 m from the median elevation (the top of Alpha: 2 775 m against 2 600 m)
  const rGcB = mk('d-gcb'); putState(rGcB, eGc.stateRaw ?? '{}');
  const eGcB = await runSp(rGcB, { snowpack: 'shadow', precip: 'gate-c' }, { shiftH: 18 });
  const wantGc = gWarm.median.p.slice(0, 18).reduce((s, v) => s + Math.round(100 * 1.2 * (1 + 0.04 * 1.75) * Math.max(0, v)) / 100, 0);
  add('D7 eine Schneedecke aus einer Rechnung (V-GM-27) und E-GM-15: ein Lauf mit „gate-c“ setzt einen Zustand aus „country“ nicht fort (Grund in der Statuszeile, nichts geschrieben, der Zustand bleibt); „gate-c“ ALLEIN rechnet mit 68 kg/m³ (die Dichte folgt, Dokument und Zustand nennen beide), mit dem Faktor von Gate C und 4 % je 100 m (von Hand an der Oberkante); „board“ neben „gate-c“, ein unbekanntes Wort des Schalters oder des Starts beenden den ganzen Lauf, bevor etwas geschrieben ist; „helfricht“ mit „country“ ist wählbar',
    /anderer Rechnung/.test(eRule.status?.lines.snowpack?.error ?? '') && !eRule.hasDir && eGc.doc?.rules.density.source === 'helfricht' && eGc.doc.rules.density.rhoNew === 68 && eGc.doc.rules.density.origin === 'literature' && eGc.doc.rules.precip.rule === 'gate-c' && eGc.doc.rules.precip.pf === 1.2
    && eGc.doc.rules.precip.gradient === 0.04 && same(eGc.state.rules, { precip: 'gate-c', density: 'helfricht' }) && eGc.status.lines.snowpack.density === 'helfricht' && !snowpackProblems(eGc.doc, ids).length && Math.abs(rowOf(eGcB, 'gl_ch_alpha').swe[2] - wantGc) <= 0.15 && wantGc > 3
    && /nur mit dem Niederschlagsfaktor/.test(eMix.err ?? '') && !eMix.wrote && /off, shadow/.test(eWord.err ?? '') && !eWord.wrote && /state, cold/.test(eStart.err ?? '') && !eStart.wrote && eH.doc?.rules.density.source === 'helfricht' && eH.doc.rules.precip.rule === 'country' && !snowpackProblems(eH.doc, ids).length,
    JSON.stringify({ rule: eRule.status?.lines.snowpack, mix: eMix.err, word: eWord.err, start: eStart.err, gc: [rowOf(eGcB, 'gl_ch_alpha')?.swe[2], wantGc] }));

  // the weather part is the source of temperature and share
  const eNoWx = await runSp(mk('d-nowx'), { snowpack: 'shadow', 'snowpack-start': 'cold', weather: '0' }), eBadPhase = await runSp(mk('d-phase'), { snowpack: 'shadow', 'snowpack-start': 'cold', phase: 'regen' });
  const eMed = await runSp(mk('d-median'), { snowpack: 'shadow', 'snowpack-start': 'cold', heights: 'median' }), ePs = await runSp(mk('d-psnow'), { snowpack: 'shadow', 'snowpack-start': 'cold', phase: 'psnow' });
  add('D8 der Schritt braucht den Wetterteil: mit „--weather=0“ oder einer unbekannten Phasenregel schreibt er nichts und nennt es, das Schmelzdokument entsteht; mit „--heights=median“ rechnet jede Zeile aus einer Antwort und sagt es (`lv: lapse`), die Abdeckung zählt sie; unter „psnow“ nennt das Dokument die Regel und die Zunge trägt andere Werte als unter „temperature“',
    !eNoWx.err && !eNoWx.hasDir && /Wetterteil/.test(eNoWx.status.lines.snowpack?.error ?? '') && eNoWx.files[4] != null && !eBadPhase.hasDir && /Wetterteil/.test(eBadPhase.status.lines.snowpack?.error ?? '')
    && eMed.doc?.glaciers.every((r) => r.lv === 'lapse') && eMed.doc.coverage.lapse === 4 && !snowpackProblems(eMed.doc, ids).length && ePs.doc?.rules.forcing.phase === 'psnow' && !same(rowOf(ePs, 'gl_ch_alpha').hsd[0], a.hsd[0]) && !snowpackProblems(ePs.doc, ids).length,
    JSON.stringify({ nowx: eNoWx.status?.lines.snowpack, med: eMed.doc?.coverage }));

  // a glacier without a row keeps its entry; one that is new says since when; one that left the catalogue is dropped
  const rSkip = mk('d-skip');
  const st2 = JSON.parse(eCold.stateRaw); delete st2.g.gl_ch_far; st2.g.gl_ch_gone = structuredClone(st2.g.gl_ch_alpha);
  putState(rSkip, JSON.stringify(st2));
  const eSkip = await runSp(rSkip, { snowpack: 'shadow' }, { shiftH: 9, hook: (o) => (Math.abs(o.lat - 46.52) < 1e-6 ? (s, i) => { if (i > 300) s.vars.t2m.mean = null; } : null) });
  // a glacier the melt run itself skips (too few hours with a temperature): no row either, the entry is carried and the document names it
  const rFew = mk('d-few'); putState(rFew, eCold.stateRaw);
  const eFew = await runSp(rFew, { snowpack: 'shadow' }, { shiftH: 9, hook: (o) => (Math.abs(o.lat - 46.52) < 1e-6 ? (s, i) => { if (i > 200) s.vars.t2m.mean = null; } : null) });
  const rAfter = mk('d-after'); putState(rAfter, eSkip.stateRaw ?? '{}');
  const eAfter = await runSp(rAfter, { snowpack: 'shadow' }, { shiftH: 15 });
  const beta0 = eCold.state.g.gl_ch_beta, betaS = eSkip.state?.g.gl_ch_beta;
  add('D9 Zeilen, die fehlen oder neu sind: ein Gletscher mit Temperaturlücke bekommt keine Zeile (übersprungen mit Grund; ebenso einer, den schon der Schmelzlauf überspringt — „not-run“), sein Eintrag bleibt — bis zur Laufstunde gerechnet, ohne neuen Antrieb, derselbe Beginn; im Lauf danach hat er wieder eine Zeile und nennt die 6 Stunden ohne Antrieb; ein Gletscher ohne Eintrag beginnt bei null und nennt seinen Beginn (`from`), das Dokument zählt ihn; ein Eintrag, dessen Gletscher nicht im Katalog steht, entfällt und wird gezählt',
    !eSkip.err && !rowOf(eSkip, 'gl_ch_beta') && eSkip.doc.skipped.some((s) => s.id === 'gl_ch_beta' && /Temperaturlücke|temperature-gaps/.test(s.reason)) && betaS && betaS[0] === beta0[0] && betaS[4] === null && betaS[1] === 0
    && rowOf(eSkip, 'gl_ch_far')?.from === '2026-11-22' && eSkip.doc.state.started === 1 && !('gl_ch_gone' in eSkip.state.g) && eSkip.status.lines.snowpack.dropped === 1 && eSkip.status.lines.snowpack.carried === 0 && !snowpackProblems(eSkip.doc, ids).length
    && !rowOf(eFew, 'gl_ch_beta') && eFew.doc.skipped.some((s) => s.id === 'gl_ch_beta' && s.reason === 'not-run') && eFew.status.lines.snowpack.carried === 1 && eFew.state.g.gl_ch_beta?.[4] === null && eFew.state.g.gl_ch_beta[0] === beta0[0]
    && rowOf(eAfter, 'gl_ch_beta')?.gap === 6 && same(eAfter.doc.state.gaps, { glaciers: 1, maxH: 6 }) && rowOf(eAfter, 'gl_ch_far').from === '2026-11-22' && !snowpackProblems(eAfter.doc, ids).length,
    JSON.stringify({ skipped: eSkip.doc?.skipped, far: rowOf(eSkip, 'gl_ch_far')?.from, sp: eSkip.status?.lines.snowpack, after: eAfter.doc?.state }));
});

// --- E: the publisher --------------------------------------------------------------------------------------------------------------------------
await block('E', async () => {
  const src = join(tmp, 'pub'); mkdirSync(join(src, 'snowpack'), { recursive: true }); mkdirSync(join(src, 'melt'), { recursive: true });
  writeFileSync(join(src, 'snowpack', '2026112117.json'), '{}'); writeFileSync(join(src, 'snowpack', 'state.json'), '{}'); writeFileSync(join(src, 'melt', '2026112117.json'), '{}');
  const ok = await throws(() => checkPackage('melt', src));
  mkdirSync(join(src, 'stn'), { recursive: true }); writeFileSync(join(src, 'stn', 'x.json'), '{}');
  const outside = await throws(() => checkPackage('melt', src));
  rmSync(join(src, 'stn'), { recursive: true });
  const other = await throws(() => checkPackage('stations', src));
  const now = Date.UTC(2026, 10, 25, 12), list = { snowpack: ['2026112117.json', '2026112211.json', '2026112511.json', 'state.json'], melt: ['2026101202.json', 'state.json', 'wx'] };
  const gone = pruneList((p) => list[p] ?? [], GLACIER_POLICIES.melt, now);
  add('E1 Publisher (E-GM-17): die Linie „melt“ darf unter `melt/` und `snowpack/` schreiben und sonst nirgends (eine Datei unter `stn/` wird abgelehnt), eine andere Linie darf nicht nach `snowpack/`; entfernt werden nur Laufdokumente unter `snowpack/`, die älter als 72 h sind — der Zustand und alles unter `melt/` bleiben',
    ok === null && /außerhalb der Linie melt/.test(outside ?? '') && /außerhalb der Linie stations/.test(other ?? '') && same(GLACIER_LINES.melt, ['melt', 'snowpack']) && same(gone, ['snowpack/2026112117.json', 'snowpack/2026112211.json']), JSON.stringify({ ok, gone }));
});

// --- F: the seed of the spin-up ------------------------------------------------------------------------------------------------------------------
await block('F', async () => {
  const FX = J(join(HERE, 'lib', 'fixtures', 'glacier', 'snowpack-seed.json'));
  // hourly source (INCA shape): two points, real values
  const t0 = Date.parse(FX.inca.timestamps[0]), n = FX.inca.timestamps.length;
  const one = (i) => { const P = FX.inca.features[i].properties.parameters; return { t: P['2t'].data, p: P.tp.data, g: P.ssrd.data }; };
  const glaciers = [{ id: 'gl_a', z: [2400, 2700, 3000], ela: 2700, F: 2.326, series: one(0), dT: -1.5 }, { id: 'gl_b', z: [2000, 2300, 2500], ela: 2300, F: 2.326, series: one(1), dT: 0.5 }];
  const seed = seedOfForcing({ glaciers, fromMs: t0, hours: n, cal: CAL, c: BOARD.c, rules: { precip: 'country', density: 'board' }, info: { test: true } });
  // by hand: the same hours through the core, level by level
  const hand = (g, l) => { const lv = emptyLevel(), par = { TF: CAL.TF, SRF: CAL.SRF, aBare: bareAlbedo(g.z[l], g.ela) }; for (let h = 0; h < n; h++) { if (g.series.t[h] == null) { const fx = g.fill?.[h]; if (fx) stepLevel(lv, { tMs: t0 + h * H, T: fx.T[l], S: Math.round(100 * g.F * fx.P * solidFraction(fx.T[l])) / 100, G: fx.G }, par, BOARD.c); continue; } const T = Math.round((g.series.t[h] + g.dT + MELT.gamma * (g.z[l] - g.z[1])) * 10) / 10; stepLevel(lv, { tMs: t0 + h * H, T, S: Math.round(100 * g.F * Math.max(0, g.series.p[h] ?? 0) * solidFraction(T)) / 100, G: Math.round(Math.max(0, g.series.g[h] ?? 0)) }, par, BOARD.c); } return normalizeLevel(lv, BOARD.c); };
  const okRows = glaciers.every((g) => [0, 1, 2].every((l) => same(seed.g[g.id][2][l], hand(g, l))));
  const holeSeries = structuredClone(glaciers[0]); for (let h = 10; h < 34; h++) holeSeries.series.t[h] = null;
  const seedHole = seedOfForcing({ glaciers: [holeSeries], fromMs: t0, hours: n, cal: CAL, c: BOARD.c, rules: { precip: 'country', density: 'board' }, info: {} });
  // 12 of the 24 hours without analysis carry the forcing of a weather run: cold, 2 mm every hour
  const fillSeries = structuredClone(holeSeries); fillSeries.fill = Object.fromEntries(Array.from({ length: 12 }, (_, k) => [10 + k, { T: [-6, -8, -10], P: 2, G: 0 }]));
  const seedFill = seedOfForcing({ glaciers: [fillSeries], fromMs: t0, hours: n, cal: CAL, c: BOARD.c, rules: { precip: 'country', density: 'board' }, info: {} });
  const sweTop = (s) => (s.g.gl_a[2][2][0] + s.g.gl_a[2][2].slice(2).reduce((a, v, i) => a + (i % 3 === 0 ? v : 0), 0)) / 10;
  add('F1 Startzustand aus dem Einschwingen (reiner Teil von `snowpack-seed.mjs`, Antrieb in der Form der INCA-Antwort mit echten Werten): der Zustand besteht den Vertrag, Quelle „seed“, Beginn und Ende wie der Antrieb, Regeln des Laufs, kein gespeicherter Antrieb; jede Schneedecke ist genau die, die der Kern von Hand aus denselben Stunden rechnet (Temperatur um die Verschiebung und den Gradienten zur Höhe gerückt); es liegt Schnee; 24 Stunden ohne Temperatur sind 24 gezählte Stunden ohne Antrieb, nichts wird geraten; tragen 12 davon den Antrieb eines Wetterlaufs von buscosun Fusion, bleiben 12 gezählt, der Zustand nennt die 12 übernommenen, jede Schneedecke ist die, die der Kern von Hand mit diesen 12 Stunden rechnet (Temperatur der Antwort je Höhe, ohne Verschiebung), und es liegt mehr Schnee als ohne sie',
    !snowpackStateProblems(seed).length && seed.source === 'seed' && seed.atMs === t0 + n * H && seed.since === new Date(t0).toISOString() && same(seed.rules, { precip: 'country', density: 'board' }) && Object.values(seed.g).every((e) => e[4] === null && e[0] === Math.round(t0 / H) && e[1] === 0)
    && okRows && seed.g.gl_a[2][2][0] + seed.g.gl_a[2][2].slice(2).reduce((s, v, i) => s + (i % 3 === 0 ? v : 0), 0) > 100 && seedHole.g.gl_a[1] === 24 && !snowpackStateProblems(seedHole).length && seedHole.seed.filled == null && seedFill.g.gl_a[1] === 12 && same(seedFill.seed.filled, { rule: 'fusion-weather-runs', glaciers: 1, maxH: 12 })
    && [0, 1, 2].every((l) => same(seedFill.g.gl_a[2][l], hand(fillSeries, l)) && same(seedHole.g.gl_a[2][l], hand(holeSeries, l))) && sweTop(seedFill) > sweTop(seedHole) + 5 && !snowpackStateProblems(seedFill).length, JSON.stringify({ okRows, top: seed.g.gl_a[2][2].slice(0, 2), holes: seedHole.g.gl_a[1], fill: [seedFill.g.gl_a[1], seedFill.seed.filled, sweTop(seedFill) - sweTop(seedHole)] }));
  // daily source (MeteoSwiss shape): day sums 06–06 UTC evenly over 24 h, temperature from mean, minimum and maximum, radiation from the sunshine share
  const D = FX.daily, hd = hourlyFromDaily({ day0: D.day0, p: D.p, t: D.t, tn: D.tn, tx: D.tx, sun: D.sun, lat: D.lat, lon: D.lon, z: D.z, fromMs: Date.parse(`${D.day0}T06:00:00Z`), hours: D.p.length * 24 });
  const dayOf = (a, d) => a.slice(24 * d, 24 * d + 24);
  const sums = D.p.map((v, d) => (v == null || D.t[d] == null ? null : dayOf(hd.p, d).reduce((s, x) => s + x, 0)));
  const means = D.t.map((v, d) => (v == null || D.p[d] == null ? null : dayOf(hd.t, d).reduce((s, x) => s + x, 0) / 24));
  const miss = D.p.findIndex((v) => v == null);
  const range = (d) => Math.max(...dayOf(hd.t, d)) - Math.min(...dayOf(hd.t, d));
  const noon = (d) => Math.max(...dayOf(hd.g, d)), sunny = D.sun.reduce((b, v, d) => (v != null && D.p[d] != null && (b < 0 || v > D.sun[b]) ? d : b), -1), dull = D.sun.reduce((b, v, d) => (v != null && D.p[d] != null && Math.abs(d - sunny) <= 3 && (b < 0 || v < D.sun[b]) ? d : b), -1);
  add('F2 Tagesgitter auf Stunden (Form der MeteoSchweiz-Dateien, echte Werte): die Tagessumme liegt gleichmäßig auf den 24 Stunden von 06 bis 06 UTC und bleibt erhalten, das Tagesmittel der Temperatur bleibt erhalten, der Tagesgang hat die Spanne zwischen Minimum und Maximum des Tages, die Strahlung ist nachts null und am sonnigsten Tag höher als an einem trüben derselben Woche; ein Tag, der an der Quelle fehlt, bleibt ohne Werte (24 Stunden ohne Antrieb)',
    sums.every((s, d) => s == null || Math.abs(s - D.p[d]) < 1e-9) && means.every((m, d) => m == null || Math.abs(m - D.t[d]) < 1e-9) && D.t.every((v, d) => v == null || D.p[d] == null || Math.abs(range(d) - (D.tx[d] - D.tn[d])) <= 0.02 * (D.tx[d] - D.tn[d]) + 1e-6)
    && hd.g.some((v) => v === 0) && sunny >= 0 && dull >= 0 && D.sun[sunny] > D.sun[dull] + 20 && noon(sunny) > noon(dull) && miss >= 0 && dayOf(hd.t, miss).every((v) => v == null) && dayOf(hd.p, miss).every((v) => v == null), JSON.stringify({ miss, sums: sums.slice(0, 4), sunny, dull }));
  const sh = shiftOf([1, 2, 3, null, 4], [0, 0.5, 1, 9, null]);
  add('F3 Verschiebung der Analyse auf die gesuchte Höhe: Median der Differenz über die Stunden, die beide Reihen haben; unter 24 gemeinsamen Stunden gibt es keine (null), nie eine geratene',
    sh === null && Math.abs(shiftOf(Array.from({ length: 48 }, (_, i) => i * 0.1 + 2), Array.from({ length: 48 }, (_, i) => i * 0.1)) - 2) < 1e-9);
  // a run continues a seed
  const root = mk('f-seed');
  const g2 = [{ id: 'gl_ch_alpha', z: [2425, 2600, 2775], ela: 2600, F: F_TEST, series: one(0), dT: 0 }, { id: 'gl_ch_gamma', z: [2625, 2800, 2975], ela: 2800, F: F_TEST, series: one(1), dT: 0 }];
  const sd = seedOfForcing({ glaciers: g2, fromMs: LX_T0 - (n + 4) * H, hours: n, cal: { TF: 0.05, SRF: 0.008 }, c: BOARD.c, rules: { precip: 'country', density: 'board' }, info: {} });
  putState(root, JSON.stringify(sd));
  const e = await runSp(root, { snowpack: 'shadow' });
  const ra = rowOf(e, 'gl_ch_alpha'), rb = rowOf(e, 'gl_ch_beta');
  add('F4 ein Lauf setzt einen Startzustand fort: Quelle „seed“, Beginn der des Einschwingens, die 4 Stunden zwischen seinem Ende und der Laufstunde sind ohne Antrieb und stehen an den Zeilen; die Schneedecke zur Laufstunde ist die des Startzustands (nichts dazwischen erfunden); ein Gletscher, den der Startzustand nicht kennt, beginnt bei null und nennt seinen Beginn; der Zustand danach ist der eines Laufs',
    !e.err && e.doc?.state.source === 'seed' && e.doc.state.since === sd.since && e.doc.state.ageH === 4 && e.doc.state.replayedH === 0 && ra.gap === 4 && ra.from == null && ra.swe[2] > 10
    && Math.abs(ra.swe[2] - (sd.g.gl_ch_alpha[2][2][0] + sd.g.gl_ch_alpha[2][2].slice(2).reduce((s, v, i) => s + (i % 3 === 0 ? v : 0), 0)) / 10) < 0.051 && rb.from === '2026-11-21' && rb.hs.every((v) => v === 0) && e.state.source === 'run' && !snowpackProblems(e.doc).length,
    JSON.stringify({ st: e.doc?.state, a: ra?.swe, err: e.err, sp: e.status?.lines.snowpack }));
});

// --- H: shadow pairs (GM-4, E-GM-20) ----------------------------------------------------------------------------------------------------------------
const PX = J(join(HERE, 'lib', 'fixtures', 'glacier', 'snowpack-pairs.json'));
const PX_SHIFT = LX_T0 - Date.parse(PX.source.slotHour);
/** The station line in a data tree: the real entries of the fixture, their stamps moved to the run hour (+ `extraMin` minutes earlier), mapped onto the test glaciers. */
const putStations = (root, { extraMin = 0, stampAt = null, slotRun = LX_RUN, withExt = true, pointer = true } = {}) => {
  const data = join(root, 'data'), c = PX.chosen, r = PX.rows;
  const glaciers = { gl_ch_alpha: { snow: r.tirol.snow }, gl_ch_beta: { snow: r.imis.snow }, gl_ch_gamma: { snow: r.bz.snow }, gl_ch_far: { snow: r.missing.snow }, gl_ch_unknown: { snow: r.imis.snow } };
  const map = { schema: 1, kind: 'glacier/stn-map', file: 'test.1', build: '20261011-9', rule: { km: 5, dz: 300 }, stations: {}, glaciers: {}, ...(withExt ? { ext: { rule: { km: 5, dz: 300, from: 'outline' }, stations: PX.stations, glaciers } } : {}) };
  const move = (sec) => Object.fromEntries(Object.entries(sec ?? {}).map(([s, e]) => [s, { ...e, t: new Date(stampAt ?? Date.parse(e.t) + PX_SHIFT - extraMin * 60_000).toISOString() }]));
  const slot = { ...PX.slot, stations: move(PX.slot.stations), ext: { stations: move(PX.slot.ext.stations) } };
  mkdirSync(join(data, 'stn', 'map'), { recursive: true }); mkdirSync(join(data, 'stn', 'h'), { recursive: true });
  writeFileSync(join(data, 'stn', 'map', 'test.1.json'), JSON.stringify(map));
  if (slotRun) writeFileSync(join(data, 'stn', 'h', `${slotRun}.json`), JSON.stringify(slot));
  const ix = J(join(data, 'index.json'));
  writeFileSync(join(data, 'index.json'), JSON.stringify(pointer ? { ...ix, stations: { hour: slotRun, slot: slotRun, map: 'test.1' } } : ix));
  return { chosen: c };
};
const pairsDoc = (e) => { const f = join(e.outDir, glacierSnowpackPairsPath(e.run)); return existsSync(f) ? J(f) : null; };
const stripPairs = (e) => { const s = structuredClone(e.status); delete s.lines.snowpack?.pairs; delete s.lines.melt.seconds; delete s.lines.melt.mem; if (s.lines.weather?.levels) delete s.lines.weather.levels.seconds; if (s.lines.snowpack) delete s.lines.snowpack.seconds; return JSON.stringify([s, e.index]); };
await block('H', async () => {
  // a seed with snow (the spin-up of F4 on the real INCA answer), so that the pairs carry depths that are not zero
  const FXs = J(join(HERE, 'lib', 'fixtures', 'glacier', 'snowpack-seed.json')), ns = FXs.inca.timestamps.length;
  const oneS = (i) => { const P = FXs.inca.features[i].properties.parameters; return { t: P['2t'].data, p: P.tp.data, g: P.ssrd.data }; };
  const seedH = JSON.stringify(seedOfForcing({ glaciers: [{ id: 'gl_ch_alpha', z: [2425, 2600, 2775], ela: 2600, F: F_TEST, series: oneS(0), dT: 0 }, { id: 'gl_ch_beta', z: [2525, 2700, 2875], ela: 2700, F: F_TEST, series: oneS(0), dT: -1 }, { id: 'gl_ch_gamma', z: [2625, 2800, 2975], ela: 2800, F: F_TEST, series: oneS(1), dT: 0 }], fromMs: LX_T0 - (ns + 4) * H, hours: ns, cal: { TF: 0.05, SRF: 0.008 }, c: BOARD.c, rules: { precip: 'country', density: 'board' }, info: {} }));
  const mkH = (name, o) => { const r = mk(name); putState(r, seedH); putStations(r, o); return r; };
  const COLD = { snowpack: 'shadow' };
  const rBase = mkH('h-base'), rOn = mkH('h-on'), rOffW = mkH('h-offword'), rBad = mkH('h-bad');
  const eBase = await runSp(rBase, COLD), eOn = await runSp(rOn, { ...COLD, 'snowpack-pairs': 'on' });
  const eOffW = await runSp(rOffW, { snowpack: 'off', 'snowpack-pairs': 'unsinn' });
  const eBad = await runSp(rBad, { ...COLD, 'snowpack-pairs': 'ja' });
  process.env.GLACIER_SNOWPACK_PAIRS = 'on';
  const rEnv = mkH('h-env');
  const eEnv = await runSp(rEnv, COLD);
  delete process.env.GLACIER_SNOWPACK_PAIRS;
  add('H1 Schalter der Schattenpaare: ab Werk „off“; nur mit der Schneedecke gelesen — mit `--snowpack=off` stört ein unsinniges Wort nicht und es entsteht kein Ordner `snowpack/`; mit der Schneedecke bricht ein unbekanntes Wort den Lauf ab, bevor etwas geschrieben ist; ohne Schalter kein Paar-Dokument und keine Zeile `pairs` in der Statuszeile',
    SNOWPACK_PAIRS_DEFAULT === 'off' && same(SNOWPACK_PAIRS_MODES, ['off', 'on']) && snowpackPairsModeOf(undefined) === 'off' && snowpackPairsModeOf('') === 'off' && /Schattenpaare/.test((await throws(() => snowpackPairsModeOf('ja'))) ?? '')
    && !eOffW.err && !eOffW.hasDir && /Schattenpaare/.test(eBad.err ?? '') && !eBad.wrote && !eBase.err && pairsDoc(eBase) === null && !('pairs' in (eBase.status?.lines.snowpack ?? {})), JSON.stringify({ off: eOffW.err, bad: eBad.err }));
  const sameFiles = (a, b) => a.files.every((f, i) => f != null && f === b.files[i]);
  const listed = existsSync(join(eOn.outDir, 'snowpack')) ? readdirSync(join(eOn.outDir, 'snowpack')).sort() : [];
  add('H2 „on“ ändert an der Schneedecke und an allen anderen Dateien nichts: Schmelz- und Wetterdokumente, Schmelzzustand, Laufdokument und Zustand der Schneedecke sind Byte für Byte die des Laufs ohne Schalter, Zeiger gleich, Statuszeile bis auf `lines.snowpack.pairs` gleich; dazu kommt genau eine Datei `snowpack/pairs/<lauf>.json`; die Umgebungsvariable ergibt dieselbe Datei',
    !eOn.err && sameFiles(eBase, eOn) && same(eBase.doc, eOn.doc) && eBase.stateRaw === eOn.stateRaw && stripPairs(eBase) === stripPairs(eOn) && same(listed, [`${eOn.run}.json`, 'pairs', 'state.json']) && same(readdirSync(join(eOn.outDir, 'snowpack', 'pairs')), [`${eOn.run}.json`])
    && same(pairsDoc(eEnv), pairsDoc(eOn)), JSON.stringify({ err: eOn.err, listed }));
  const d = pairsDoc(eOn), byG = new Map((d?.pairs ?? []).map((p) => [p.g, p])), rows = new Map(eOn.doc.glaciers.map((r) => [r.id, r]));
  const hand = (gid) => { const r = rows.get(gid), zs = PX.stations[byG.get(gid).s].elev; const at = zs < r.z[0] ? 0 : zs > r.z[2] ? 2 : null; if (at != null) return { v: r.hs[at], at: at ? 'above' : 'below' }; const l = zs <= r.z[1] ? 0 : 1; return { v: r.hs[l] + ((r.hs[l + 1] - r.hs[l]) * (zs - r.z[l])) / (r.z[l + 1] - r.z[l]), at: 'inside' }; };
  const ent = (s) => PX.slot.stations[s] ?? PX.slot.ext.stations[s];
  const c = PX.chosen, a = byG.get('gl_ch_alpha'), b = byG.get('gl_ch_beta'), g = byG.get('gl_ch_gamma'), f = byG.get('gl_ch_far');
  const ageOf = (s) => Math.round((LX_T0 - (Date.parse(ent(s).t) + PX_SHIFT)) / 60_000);
  add('H3 das Paar-Dokument: besteht den Vertrag; Herkunft je Feld (Modell „computed“, Station „measured“), Vermerk „Vergleich, keine Kopplung“, Kopplung „none“, Regeln und Zuordnung der Läufe genannt; je Gletscher mit Schneestation ein Paar (der ferne ohne Zeile der Schneedecke zählt als `mappedWithoutRow`); der Modellwert ist von Hand zwischen den drei Höhen der Zeile gerechnet — Tirol (2 431 m) zwischen Zunge und Mitte, IMIS (2 304 m) und die Station ohne Wert (2 517 m) unter der Zunge = Wert der Zunge, Südtirol (3 035 m) über der Oberkante = Wert der Oberkante, nie hochgerechnet (Schneedecke aus einem Startzustand mit Schnee, Werte über 5 cm); Neuschnee 24 ≤ 48 ≤ 72 h; der Stationswert ist der der Linie, das Alter aus dem Stempel; die Tiroler Station trägt ihre gelieferte Änderung der Schneehöhe; eine zugeordnete Station ohne Schneehöhe in der Stunde gibt kein Paar mit erfundenem Wert, sondern `v: null` mit Grund',
    d && !snowpackPairsProblems(d, new Set(rows.keys())).length && d.origin === 'comparison' && same(d.origins, { m: 'computed', hn: 'computed', v: 'measured', hsd: 'measured' }) && d.note === GLACIER_SNOWPACK_PAIRS_NOTE && d.coupling === 'none'
    && d.snowpack.precip === 'country' && d.snowpack.density === 'board' && d.stations.map === 'test.1' && d.stations.slot === LX_RUN && d.atMs === LX_T0 && d.counts.pairs === 4 && d.counts.mappedWithoutRow === 1 && same(d.counts.at, { below: 2, inside: 1, above: 1 }) && a.m > 5 && b.m > 5 && g.m > 5 && rows.get('gl_ch_beta').hs[0] !== rows.get('gl_ch_beta').hs[1] && rows.get('gl_ch_gamma').hs[1] !== rows.get('gl_ch_gamma').hs[2]
    && a.s === c.tirol && a.at === 'inside' && Math.abs(a.m - hand('gl_ch_alpha').v) <= 0.051 && b.at === 'below' && b.m === rows.get('gl_ch_beta').hs[0] && g.at === 'above' && g.m === rows.get('gl_ch_gamma').hs[2]
    && [a, b, g, f].every((p) => p.hn[0] <= p.hn[1] && p.hn[1] <= p.hn[2]) && a.v === ent(c.tirol).v.snow && a.age === ageOf(c.tirol) && same(a.hsd, ent(c.tirol).hsd) && b.v === ent(c.imis).v.snow && b.hsd === undefined
    && f.s === c.missing && f.v === null && f.why === 'no-value' && d.counts.withValue === 3 && same(eOn.status.lines.snowpack.pairs, { pairs: 4, withValue: 3, map: 'test.1', slot: LX_RUN, bytes: Buffer.byteLength(readFileSync(join(eOn.outDir, glacierSnowpackPairsPath(eOn.run)))) }),
    JSON.stringify({ counts: d?.counts, a, f, p: d ? snowpackPairsProblems(d) : null, st: eOn.status?.lines.snowpack?.pairs }));
  const ae = (zs) => atElevation([2000, 2500, 3000], [10, 20, 40], zs);
  add('H3b Höhe der Station (rein): linear im unteren Abschnitt (2 250 m ⇒ 15) und im oberen (2 750 m ⇒ 30), an den drei Höhen genau deren Wert, darunter der Wert der Zunge (1 900 m ⇒ 10, „below“), darüber der der Oberkante (3 100 m ⇒ 40, „above“) — nie hochgerechnet; zwei gleiche Höhen teilen nicht durch null',
    eq(ae(2250), { v: 15, at: 'inside' }) && eq(ae(2750), { v: 30, at: 'inside' }) && eq(ae(2500), { v: 20, at: 'inside' }) && eq(ae(2000), { v: 10, at: 'inside' }) && eq(ae(3000), { v: 40, at: 'inside' })
    && eq(ae(1900), { v: 10, at: 'below' }) && eq(ae(3100), { v: 40, at: 'above' }) && Number.isFinite(atElevation([2500, 2500, 3000], [5, 5, 9], 2500).v), JSON.stringify([ae(2250), ae(2750), ae(1900), ae(3100)]));
  // the time window, with every stamp set: 61 / 60 min before the run hour, 15 / 16 min after it
  const win = async (name, min) => { const r = mkH(name, { stampAt: LX_T0 - min * 60_000 }); return pairsDoc(await runSp(r, { ...COLD, 'snowpack-pairs': 'on' })); };
  const w61 = await win('h-61', 61), w60 = await win('h-60', 60), wM15 = await win('h-m15', -15), wM16 = await win('h-m16', -16);
  const valued = (x) => x?.pairs.filter((p) => p.s !== c.missing) ?? [];
  add('H4 das Zeitfenster der Station (60 min davor, 15 min danach, `set`): ein Stempel 61 min vor der Laufstunde gilt nicht (`stale`, Alter 61, kein Wert), einer genau 60 min davor gilt (Alter 60), einer 15 min danach gilt (Alter −15), einer 16 min danach nicht (`future`); das Dokument besteht jedes Mal den Vertrag',
    valued(w61).length === 3 && valued(w61).every((p) => p.why === 'stale' && p.v === null && p.age === 61) && valued(w60).every((p) => p.v != null && p.age === 60 && p.why === undefined)
    && valued(wM15).every((p) => p.v != null && p.age === -15) && valued(wM16).every((p) => p.why === 'future' && p.v === null && p.age === -16) && [w61, w60, wM15, wM16].every((x) => x && !snowpackPairsProblems(x).length),
    JSON.stringify([w61, w60, wM15, wM16].map((x) => valued(x).map((p) => [p.why ?? 'v', p.age]))));
  // inputs missing or unusable: the snowpack stays, no pairs file, the reason in the status line
  const rNoPtr = mkH('h-noptr', { pointer: false }), rPrev = mkH('h-prev', { slotRun: new Date(LX_T0 - H).toISOString().replace(/[-:T]/g, '').slice(0, 10), stampAt: LX_T0 - 40 * 60_000 }), rNone = mkH('h-none', { slotRun: null }), rNoExt = mkH('h-noext', { withExt: false });
  const rNoSeed = mk('h-noseed'); putStations(rNoSeed);
  const eNoSeed = await runSp(rNoSeed, { snowpack: 'shadow', 'snowpack-pairs': 'on' });
  const eNoPtr = await runSp(rNoPtr, { ...COLD, 'snowpack-pairs': 'on' }), ePrev = await runSp(rPrev, { ...COLD, 'snowpack-pairs': 'on' }), eNone = await runSp(rNone, { ...COLD, 'snowpack-pairs': 'on' }), eNoExt = await runSp(rNoExt, { ...COLD, 'snowpack-pairs': 'on' });
  const kept = (e) => !e.err && same(e.doc, eBase.doc) && e.stateRaw === eBase.stateRaw && pairsDoc(e) === null && !existsSync(join(e.outDir, 'snowpack', 'pairs'));
  add('H5 kein stiller Ersatz: ohne Startzustand schreibt die Schneedecke nichts und die Paare auch nicht (Grund: Schneedecke nicht geschrieben); ohne Zeiger auf die Zuordnung, ohne Stationsslot der Laufstunde UND der Stunde davor oder mit einer Zuordnung ohne Abschnitt `ext` entsteht kein Paar-Dokument, die Statuszeile nennt den Grund, die Schneedecke ist Byte für Byte die des Laufs ohne Schalter; fehlt nur der Slot der Laufstunde, nimmt der Lauf den der Stunde davor und nennt ihn',
    kept(eNoPtr) && /index\.stations\.map/.test(eNoPtr.status.lines.snowpack.pairs?.error ?? '') && kept(eNone) && /kein Stationsslot/.test(eNone.status.lines.snowpack.pairs?.error ?? '') && kept(eNoExt) && /ohne Abschnitt ext/.test(eNoExt.status.lines.snowpack.pairs?.error ?? '')
    && !eNoSeed.err && !eNoSeed.hasDir && /kein Zustand/.test(eNoSeed.status.lines.snowpack?.error ?? '') && /Schneedecke nicht geschrieben/.test(eNoSeed.status.lines.snowpack?.pairs?.error ?? '') && !eNoSeed.status.lines.snowpack?.pairs?.pairs
    && !ePrev.err && pairsDoc(ePrev)?.stations.slot === new Date(LX_T0 - H).toISOString().replace(/[-:T]/g, '').slice(0, 10) && pairsDoc(ePrev).counts.withValue === 3,
    JSON.stringify({ ptr: eNoPtr.status?.lines.snowpack?.pairs, none: eNone.status?.lines.snowpack?.pairs, ext: eNoExt.status?.lines.snowpack?.pairs, prev: pairsDoc(ePrev)?.stations }));
  // the contract, negative controls
  const bad = (edit) => { const x = structuredClone(d); edit(x); return snowpackPairsProblems(x, new Set(rows.keys())).length > 0; };
  const muts = [
    (x) => { x.origin = 'measured'; }, (x) => { x.origins.m = 'measured'; }, (x) => { x.coupling = 'nudge'; }, (x) => { x.note = 'gemessen'; }, (x) => { x.pairs[0].v = null; }, (x) => { x.pairs[0].age = 75; },
    (x) => { x.pairs[3].why = undefined; }, (x) => { x.pairs[0].why = 'stale'; }, (x) => { x.pairs.push(structuredClone(x.pairs[0])); x.counts.pairs++; x.counts.withValue++; x.counts.at[x.pairs[0].at]++; }, (x) => { x.pairs[0].hn = [5, 3, 7]; },
    (x) => { x.pairs[0].at = 'oben'; }, (x) => { x.pairs[0].m = -1; }, (x) => { x.pairs[0].g = 'gl_ch_unknown'; }, (x) => { x.counts.withValue = 4; }, (x) => { x.pairs[0].net = 'imis'; }, (x) => { x.rule.windowMin = [90, 15]; }, (x) => { x.atMs += 60_000; },
  ];
  const caught = muts.map(bad);
  add(`H6 Vertrag der Paare: ${muts.length} Verletzungen, jede gemeldet (Herkunft, Kopplung, Vermerk, Wert ohne Alter bzw. außerhalb des Fensters, fehlender Wert ohne Grund, Grund am Wert, doppeltes Paar, Neuschnee nicht steigend, unbekannte Lage, negativer Modellwert, Gletscher ohne Zeile, Zählung, Netz, Fenster, Laufstunde)`, caught.every(Boolean), JSON.stringify(caught));
  // publisher and archive
  const now = Date.UTC(2026, 10, 25, 12), list = { snowpack: ['2026112511.json', 'pairs', 'state.json'], 'snowpack/pairs': ['2026112117.json', '2026112211.json', '2026112511.json'] };
  const gone = pruneList((p) => list[p] ?? [], GLACIER_POLICIES.melt, now);
  const pub = join(tmp, 'h-pub'); mkdirSync(join(pub, 'snowpack', 'pairs'), { recursive: true }); writeFileSync(join(pub, 'snowpack', 'pairs', `${eOn.run}.json`), '{}');
  const okPkg = await throws(() => checkPackage('melt', pub));
  const arch = join(tmp, 'h-arch'), aOut = join(tmp, 'h-arch-out'), pDir = join(eOn.outDir, 'snowpack', 'pairs');
  writeFileSync(join(pDir, '2026101100.json'), '{"kind":"glacier/snowpack-pairs"}');
  const a1 = archivePairs({ pairsDir: pDir, archiveDir: arch, outDir: aOut });
  const day = `${eOn.run.slice(0, 4)}-${eOn.run.slice(4, 6)}-${eOn.run.slice(6, 8)}`, gz = join(aOut, day, `pairs-${eOn.run}.json.gz`);
  const back = existsSync(gz) ? gunzipSync(readFileSync(gz)) : null;
  mkdirSync(join(arch, day), { recursive: true }); writeFileSync(join(arch, day, `pairs-${eOn.run}.json.gz`), 'x');
  const a2 = archivePairs({ pairsDir: pDir, archiveDir: arch, outDir: join(tmp, 'h-arch-out2') }), a3 = archivePairs({ pairsDir: join(tmp, 'nirgends'), archiveDir: arch, outDir: join(tmp, 'h-arch-out3') });
  add('H7 Publisher und Archiv (E-GM-21): unter `snowpack/pairs/` gehen Dateien älter als 72 h, jüngere bleiben, der Ordner selbst und der Zustand bleiben; die Linie „melt“ darf dorthin schreiben; das Archiv legt jedes Paar-Dokument, das es noch nicht hält, als `pairs-<lauf>.json.gz` unter dem Tag des Laufs ab — Bytes unverändert —, hält ein vorhandenes, nimmt ein Dokument, das den Vertrag bricht, nicht und nennt es; ohne Ordner legt es nichts ab',
    same(gone, ['snowpack/pairs/2026112117.json', 'snowpack/pairs/2026112211.json']) && okPkg === null && same(a1.written, [eOn.run]) && same(a1.refused, ['2026101100']) && back?.equals(readFileSync(join(pDir, `${eOn.run}.json`)))
    && a2.written.length === 0 && a2.held === 1 && a3.dir === false && a3.runs === 0, JSON.stringify({ gone, a1, a2, a3 }));
});

// --- I: GM-5a — the spread from scenarios (E-GM-32 … E-GM-35) ---------------------------------------------------------------------------------------
await block('I', async () => {
  add('I1 Schalter der Spanne: Voreinstellung „off“, zwei Stellungen (off, scenarios), ein unbekanntes Wort wird abgelehnt; die Regel ist festgeschrieben (100 Szenarien, ρ 0,9, Faktor 0,25, Dichte 0,12 fest und 0,30 je Tag, Summe der Tage 8–14, p10/p90) und das Paar zur Laufstunde (×0,73 … ×1,37, nicht nachgemessen) — eine Änderung daran ist eine bewusste',
    SNOWPACK_SPREAD_DEFAULT === 'off' && eq(SNOWPACK_SPREAD_MODES, ['off', 'scenarios']) && snowpackSpreadModeOf(undefined) === 'off' && snowpackSpreadModeOf('') === 'off' && snowpackSpreadModeOf('scenarios') === 'scenarios'
    && !!(await throws(() => snowpackSpreadModeOf('an'))) && GLACIER_SNOWPACK_SPREAD_K === 100
    && eq(GLACIER_SNOWPACK_SPREAD_RULE, { rule: 'scenarios', k: 100, rho: 0.9, quantiles: [10, 90], sums: 'scenarios', week2: [8, 14], sigma: { factor: 0.25, densitySystematic: 0.12, densityEvent: 0.3 }, origin: { paths: 'set', sigma: 'measured' }, neighbour: 'none' })
    && GLACIER_SNOWPACK_NOW_FACTOR.p10 === 0.73 && GLACIER_SNOWPACK_NOW_FACTOR.p90 === 1.37 && GLACIER_SNOWPACK_NOW_FACTOR.verified === false && GLACIER_SNOWPACK_NOW_FACTOR.origin === 'measured');
  // the precipitation of an hour at a level of the scenario, by hand: a distribution in the hour, one 3 h on either side, none within reach
  {
    const pp = new Float64Array(24).fill(0.4), D = (mu) => ({ kind: 'logCensored', mu, sigma: 0.5 }), pd = new Array(24).fill(null);
    pd[2] = D(Math.log1p(1)); pd[5] = D(Math.log1p(3)); pd[20] = D(Math.log1p(2));
    const am = precipAmountOf(pp, pd, 24), z90 = 1.2815515655446004, q = (mu, z) => Math.expm1(mu + 0.5 * z);
    const near = (a, b) => Math.abs(a - b) < 1e-3;
    add('I1b Niederschlag einer Stunde auf der Stufe eines Szenarios, von Hand: in einer Stunde mit Verteilung ihr Quantil (Stufe 0 = Median, Stufe 1,28 = p90, nach unten nie unter 0), zwischen zwei Verteilungen im Abstand von 3 Stunden deren Mischung nach der Zeit, ohne Verteilung in Reichweite (mehr als 6 Stunden auseinander oder nur auf einer Seite) der Erwartungswert selbst — unabhängig von der Stufe',
      near(am(2, 0), 1) && near(am(2, z90), q(Math.log1p(1), z90)) && am(2, z90) > 1.5 && am(2, -8) === 0 && near(am(3, 0), (2 / 3) * 1 + (1 / 3) * 3) && near(am(4, z90), (1 / 3) * q(Math.log1p(1), z90) + (2 / 3) * q(Math.log1p(3), z90))
      && am(10, z90) === 0.4 && am(10, -3) === 0.4 && am(0, 2) === 0.4 && am(23, 2) === 0.4 && near(am(20, 0), 2), JSON.stringify([am(2, 0), am(2, z90), am(3, 0), am(4, z90), am(10, z90), am(0, 2)]));
  }

  // --- the core on the real answers of the warm glacier, from a pack taken over
  const g = gWarm, F = 1.793, c = BOARD.c, pars = parsOf(g), begin = Math.round(LX_T0 / H);
  const tz = g.levels.map((l) => f64(l.t)), share = tz.map((t) => Float64Array.from(t, solidFraction)), p = f64(g.median.p), gg = new Float64Array(336).fill(60), factor = [F, F, F];
  const pre = [begin - 500, 0, [[2000, 800], [2500, 900], [3000, 1000]], [600, 600, 600], null];
  const levels = levelsOfEntry(pre);
  const exp = snowpackOfGlacier({ id: g.id, z: g.z, levels, drive: driveOf({ tz, share, p, g: gg, factor, hours: HOURS }), pars, c, t0Ms: LX_T0, begin }).row;
  const frozen = () => JSON.stringify(levels.map((lv) => [packToRow(lv.pack), lv.aS]));
  const before = frozen();
  const ruleOf = (sigma = {}, k = 40) => ({ ...GLACIER_SNOWPACK_SPREAD_RULE, k, sigma: { factor: 0, densitySystematic: 0, densityEvent: 0, ...sigma } });
  const still = { amount: (h) => Math.max(0, p[h]), place: () => ({ tz, share }) };
  const spr = (rule, paths = still, seed = 11) => spreadOfGlacier({ levels, pars, c, t0Ms: LX_T0, seed, rule, p, g: gg, factor, ...paths });
  const width = (q, l, d) => q[l][1][d] - q[l][0][d];
  const none = spr(ruleOf({}, 10));
  const w2 = exp.hnd.map((a) => a.slice(7).reduce((s, v) => s + v, 0));
  add('I2 Kern: ein Szenario ohne Streuung ist der Erwartungswert — ohne Fehler am Faktor, an der Dichte, am Niederschlag und an der Temperatur sind p10 und p90 an jeder Höhe und jedem Tag genau die Zeile des Laufs (Schneehöhe und Neuschnee), die Summe der Tage 8–14 ist die Summe der Tageswerte; die Schneedecke der Laufstunde bleibt unberührt',
    [0, 1, 2].every((l) => eq(none.hsq[l][0], exp.hsd[l]) && eq(none.hsq[l][1], exp.hsd[l]) && eq(none.hnq[l][0], exp.hnd[l]) && eq(none.hnq[l][1], exp.hnd[l]) && none.hnw[l].every((v) => Math.abs(v - w2[l]) < 0.06)) && frozen() === before,
    JSON.stringify({ hsd: exp.hsd[1].slice(0, 3), p10: none.hsq[1][0].slice(0, 3), w2, hnw: none.hnw }));

  const wet = { amount: (h, zP) => Math.max(0, p[h]) * Math.exp(0.6 * zP), place: still.place };
  const tShift = { amount: still.amount, place: (zT) => { const t2 = tz.map((a) => Float64Array.from(a, (v, h) => v + 2 * zT[h])); return { tz: t2, share: t2.map((a) => Float64Array.from(a, solidFraction)) }; } };
  const onlyF = spr(ruleOf({ factor: 0.25 })), widerF = spr(ruleOf({ factor: 0.5 })), onlyRs = spr(ruleOf({ densitySystematic: 0.12 })), onlyRe = spr(ruleOf({ densityEvent: 0.3 })), onlyP = spr(ruleOf(), wet), onlyT = spr(ruleOf(), tShift);
  const wF = width(onlyF.hsq, 2, 13), wF2 = width(widerF.hsq, 2, 13), wRs = width(onlyRs.hsq, 2, 13), wRe = width(onlyRe.hnq, 2, 0), wP = width(onlyP.hsq, 2, 13), wT = width(onlyT.hsq, 0, 13);
  add('I3 Kern: jede Quelle der Spanne wirkt für sich — nur der Faktor, nur der feste Teil der Dichte, nur der Tagesteil der Dichte (am Neuschnee des ersten Tages), nur der Niederschlagspfad, nur der Temperaturpfad (an der Zunge, wo es um den Gefrierpunkt geht) öffnen je eine Spanne; der doppelte Fehler am Faktor öffnet eine breitere; nichts davon ändert die Schneedecke der Laufstunde',
    wF > 1 && wF2 > wF * 1.5 && wRs > 0.5 && wRe > 0.5 && wP > 1 && wT > 0.5 && frozen() === before, JSON.stringify({ wF, wF2, wRs, wRe, wP, wT }));
  const all = spr({ ...GLACIER_SNOWPACK_SPREAD_RULE, k: 40 }, { amount: wet.amount, place: tShift.place }), again = spr({ ...GLACIER_SNOWPACK_SPREAD_RULE, k: 40 }, { amount: wet.amount, place: tShift.place }), other = spr({ ...GLACIER_SNOWPACK_SPREAD_RULE, k: 40 }, { amount: wet.amount, place: tShift.place }, 12);
  const sumQ = [0, 1].map((j) => all.hnq[1][j].slice(7).reduce((s, v) => s + v, 0));
  let ordered = true;
  for (const q of [all, onlyP, onlyT, onlyF]) for (let l = 0; l < 3; l++) { if (!(q.hnw[l][0] <= q.hnw[l][1] && q.hnw[l][1] <= q.hnw[l][2])) ordered = false; for (let d = 0; d < 14; d++) if (q.hsq[l][0][d] > q.hsq[l][1][d] || q.hnq[l][0][d] > q.hnq[l][1][d] || q.hnq[l][1][d] > q.hsq[l][1][d] + 1e-9 || q.hnq[l][0][d] > q.hsq[l][0][d] + 1e-9) ordered = false; }
  add('I4 Kern: wiederholbar und geordnet — derselbe Startwert gibt dieselben Spannen, ein anderer andere; p10 liegt nie über p90, der Neuschnee nie über der Schneehöhe desselben Quantils; die Spanne der SUMME der Tage 8–14 ist die der Szenario-Summen und nicht die Summe der Tages-Quantile (sie liegt enger als diese)',
    eq(all, again) && !eq(all, other) && ordered && all.hnw[1][0] > sumQ[0] + 0.05 && all.hnw[1][2] < sumQ[1] - 0.05, JSON.stringify({ hnw: all.hnw[1], sumQ }));
  // the quantiles are the 10th and the 90th: with the factor as the only source the snow depth rises with the factor, so p10 / p90 of many scenarios
  // must sit where ONE run with the factor at its own p10 / p90 (× exp(∓1.2816 · 0.25)) lands
  {
    const many = spr(ruleOf({ factor: 0.25 }, 600)), z90 = 1.2815515655446004;
    const at = (mul) => snowpackOfGlacier({ id: g.id, z: g.z, levels: levelsOfEntry(pre), drive: driveOf({ tz, share, p, g: gg, factor: factor.map((f) => f * mul), hours: HOURS }), pars, c, t0Ms: LX_T0, begin }).row.hsd[2][13];
    const lo = at(Math.exp(-z90 * 0.25)), mid = at(1), hi = at(Math.exp(z90 * 0.25)), p10 = many.hsq[2][0][13], p90 = many.hsq[2][1][13];
    add('I4b Kern: die Quantile sind das 10. und das 90. Perzentil — mit dem Faktor als einziger Quelle (600 Szenarien) liegen p10 und p90 der Schneehöhe an Tag 14 dort, wo EIN Lauf mit dem Faktor an seinem eigenen p10 bzw. p90 landet (auf ein Viertel des Abstands zum Erwartungswert genau)',
      hi - mid > 2 && mid - lo > 2 && Math.abs(p90 - hi) < 0.25 * (hi - mid) && Math.abs(p10 - lo) < 0.25 * (mid - lo), JSON.stringify({ lo, mid, hi, p10, p90 }));
  }
  // the paths have a memory: with the hourly correlation of the rule a wet (or dry) spell lasts, so the snow of a day spreads far wider than with paths drawn anew every hour
  {
    const persistent = spr({ ...ruleOf(), rho: 0.9 }, wet), loose = spr({ ...ruleOf(), rho: 0.05 }, wet);
    const wA = width(persistent.hnq, 2, 0), wB = width(loose.hnq, 2, 0);
    add('I4c Kern: die Pfade haben ein Gedächtnis — mit der stündlichen Korrelation der Regel (0,9) ist die Spanne des Neuschnees eines Tages deutlich breiter als mit fast unabhängigen Stunden (0,05), in denen sich die Abweichungen über 24 Stunden wegmitteln',
      wA > 1.5 * wB && wB > 0, JSON.stringify({ wA, wB }));
  }
  // a row without three answers: temperature and share of a scenario by hand (two hours; the share of the answers is NOT the ramp)
  {
    const ramp = solidFraction, tz2 = [[3, 3], [2, 2], [1, 1]].map(f64), sh2 = [[0.1, 0.1], [0.3, 0.3], [0.7, 0.7]].map(f64), sg2 = f64([1, NaN]);
    const zero = shiftLevels({ tz: tz2, share: sh2, sg: sg2, zT: f64([0, 0]), hours: 2, ramp }), warm = shiftLevels({ tz: tz2, share: sh2, sg: sg2, zT: f64([3, 3]), hours: 2, ramp }), cold = shiftLevels({ tz: tz2, share: sh2, sg: sg2, zT: f64([-2, -2]), hours: 2, ramp });
    // +3 K in hour 0: tongue 6 °C → ramp 0 + (0.1 − 0) = 0.1; median 5 °C → 0 + (0.3 − 0) = 0.3; top 4 °C → 0 + (0.7 − 0.5) = 0.2: never more below than above ⇒ 0.1 / 0.2 / 0.2
    // −2 K in hour 0: tongue 1 °C → 0.5 + 0.1 = 0.6; median 0 °C → 1 + 0.3 → 1 (never above 1); top −1 °C → 1 + 0.2 → 1: ⇒ 0.6 / 1 / 1
    add('I4d Kern, Zeile ohne drei Antworten, von Hand: ohne Temperaturfehler kommen genau die Temperaturen und Schneeanteile des Laufs heraus (auch wenn der Schneeanteil nicht die Temperatur-Rampe ist); mit +3 K bleibt der Abstand zur Rampe, der Anteil bleibt zwischen 0 und 1, und unten liegt nie mehr als oben (0,1 / 0,3 / 0,2 wird 0,1 / 0,2 / 0,2; mit −2 K wird 0,6 / 1,3 / 1,2 zu 0,6 / 1 / 1); eine Stunde ohne Sigma der Antwort verschiebt nichts',
      [0, 1, 2].every((l) => eq(Array.from(zero.tz[l]), Array.from(tz2[l])) && eq(Array.from(zero.share[l]).map((v) => Math.round(v * 1e9)), Array.from(sh2[l]).map((v) => Math.round(v * 1e9))))
      && eq([0, 1, 2].map((l) => warm.tz[l][0]), [6, 5, 4]) && eq([0, 1, 2].map((l) => Math.round(warm.share[l][0] * 1e6) / 1e6), [0.1, 0.2, 0.2]) && eq([0, 1, 2].map((l) => Math.round(cold.share[l][0] * 1e6) / 1e6), [0.6, 1, 1])
      && eq([0, 1, 2].map((l) => warm.tz[l][1]), [3, 2, 1]) && eq([0, 1, 2].map((l) => Math.round(warm.share[l][1] * 1e6) / 1e6), [0.1, 0.3, 0.7]),
      JSON.stringify({ warm: [0, 1, 2].map((l) => warm.share[l][0]), cold: [0, 1, 2].map((l) => cold.share[l][0]) }));
  }
  add('I5 Kern: eine unbrauchbare Regel bricht ab (kein K, Summen-Tage außerhalb der Vorhersage) — nie eine Spanne aus einer geratenen Regel',
    !!(await throws(() => spr({ ...ruleOf(), k: 0 }))) && !!(await throws(() => spr({ ...ruleOf(), week2: [8, 15] }))) && !!(await throws(() => spr({ ...ruleOf(), week2: [0, 14] }))));

  // --- the contract with spreads
  const nbRow = { ...structuredClone(rowCold), f: gWarm.id, sq: 'neighbour' }, noDist = { ...structuredClone(rowCold), id: 'gl_x_nodist', sq: 'no-distribution' };
  const docQ = () => { const d = docOf([{ ...structuredClone(exp), ...structuredClone(all) }, nbRow, noDist].map((r) => structuredClone(r)), { spread: { rows: 1, none: { neighbour: 1, 'no-distribution': 1 } }, now: { factor: { ...GLACIER_SNOWPACK_NOW_FACTOR } } }); d.rules.spread = structuredClone(GLACIER_SNOWPACK_SPREAD_RULE); return d; };
  const badQ = [
    (d) => { d.rules.spread.k = 5; }, (d) => { d.rules.spread.rho = 1; }, (d) => { delete d.rules.spread.sigma; }, (d) => { d.rules.spread.sigma.factor = -1; }, (d) => { d.rules.spread.quantiles = [25, 75]; }, (d) => { d.rules.spread.week2 = [8, 15]; },
    (d) => { d.rules.spread.sums = 'expected'; }, (d) => { d.rules.spread.neighbour = 'placed'; }, (d) => { delete d.rules.spread.origin; }, (d) => { d.rules.spread = { rule: 'guess' }; },
    (d) => { delete d.now; }, (d) => { d.now.factor.verified = true; }, (d) => { d.now.factor.p10 = 1.1; }, (d) => { delete d.now.factor.note; }, (d) => { delete d.spread; }, (d) => { d.spread.rows = 2; }, (d) => { d.spread.none.neighbour = 0; }, (d) => { delete d.spread.none['no-distribution']; },
    (d) => { delete d.glaciers[0].hsq; }, (d) => { delete d.glaciers[0].hnw; }, (d) => { d.glaciers[0].hsq[1][0][3] = d.glaciers[0].hsq[1][1][3] + 5; }, (d) => { d.glaciers[0].hnq[1][1][3] = d.glaciers[0].hsq[1][1][3] + 5; }, (d) => { d.glaciers[0].hnw[1] = [9, 5, 1]; },
    (d) => { d.glaciers[0].hsq[2][0].pop(); }, (d) => { d.glaciers[0].hnq[0][0][2] = -1; }, (d) => { d.glaciers[0].hnw[1].pop(); }, (d) => { d.glaciers[0].sq = 'neighbour'; }, (d) => { d.glaciers[0].sq = 'no-distribution'; },
    (d) => { delete d.glaciers[1].sq; }, (d) => { delete d.glaciers[2].sq; },
    // each of the next four with the head counted as the wrong row would have it — so that only the rule about the row itself can notice
    (d) => { d.glaciers[1].sq = 'no-distribution'; d.spread.none = { 'no-distribution': 2 }; }, (d) => { d.glaciers[2].sq = 'neighbour'; d.spread.none = { neighbour: 2 }; },
    (d) => { d.glaciers[2].sq = 'weiß nicht'; d.spread.none = { neighbour: 1, 'weiß nicht': 1 }; }, (d) => { Object.assign(d.glaciers[1], structuredClone(all)); delete d.glaciers[1].sq; d.spread = { rows: 2, none: { 'no-distribution': 1 } }; },
  ];
  const caughtQ = badQ.map((edit) => { const d = docQ(); edit(d); return snowpackProblems(d).length; });
  const plain = docOf([structuredClone(exp), structuredClone(rowCold)]);
  const badPlain = [(d) => { d.glaciers[0].hsq = structuredClone(all.hsq); }, (d) => { d.glaciers[1].sq = 'neighbour'; }, (d) => { d.now = { factor: { ...GLACIER_SNOWPACK_NOW_FACTOR } }; }, (d) => { d.spread = { rows: 0, none: {} }; }];
  const caughtP = badPlain.map((edit) => { const d = structuredClone(plain); edit(d); return snowpackProblems(d).length; });
  add(`I6 Vertrag: ein Dokument mit Spannen besteht ihn (eine Zeile mit Spanne, eine Nachbar-Zeile mit Vermerk, eine eigene ohne Verteilung mit Vermerk; Regel, Zählung und das Paar zum Faktor im Kopf), ein Dokument ohne Spannen weiterhin; Negativkontrollen: jede von ${badQ.length} Verletzungen wird gemeldet (Regel, Kopf, Zählung, fehlende oder ungeordnete Felder, Neuschnee über der Schneehöhe, falscher oder fehlender Vermerk, Spanne an einer Nachbar-Zeile), und jede von ${badPlain.length} Spannen-Angaben in einem Dokument OHNE Regel`,
    !snowpackProblems(docQ()).length && !snowpackProblems(plain).length && caughtQ.every((n) => n > 0) && caughtP.every((n) => n > 0), JSON.stringify({ ok: snowpackProblems(docQ()), caughtQ, caughtP }));
});
await block('Ip', async () => {
  // --- the producer end to end: the stubbed buscosun Fusion names a precipitation distribution (`sigma` of the log amount)
  const withDist = (sigma, tSigma = null) => () => (s) => { const m = s.vars.precip.mean; s.vars.precip.dist = Number.isFinite(m) ? { kind: 'logCensored', mu: Math.log1p(Math.max(0, m)), sigma } : null; if (tSigma != null) s.vars.t2m.sigma = tSigma; };
  const base = { snowpack: 'shadow', 'snowpack-start': 'cold' }, wide = { hook: withDist(0.6) };
  const eOff = await runSp(mk('i-off'), base, wide), eWord = await runSp(mk('i-word'), { ...base, 'snowpack-spread': 'off' }, wide);
  const eOn = await runSp(mk('i-on'), { ...base, 'snowpack-spread': 'scenarios' }, wide), eOn2 = await runSp(mk('i-on2'), { ...base, 'snowpack-spread': 'scenarios' }, wide);
  process.env.GLACIER_SNOWPACK_SPREAD = 'scenarios';
  const eEnv = await runSp(mk('i-env'), base, wide);
  process.env.GLACIER_SNOWPACK_SPREAD = 'unsinn';
  const eEnvBad = await runSp(mk('i-envbad'), base, wide), eEnvBadOff = await runSp(mk('i-envbadoff'), {}, wide);
  delete process.env.GLACIER_SNOWPACK_SPREAD;
  const eBad = await runSp(mk('i-bad'), { ...base, 'snowpack-spread': 'ja' }, wide);
  const sameFiles = (a, b) => a.files.every((f, i) => f != null && f === b.files[i]);
  const bare = (e) => { if (!e.doc) return null; const d = structuredClone(e.doc); d.rules.spread = 'none'; delete d.spread; delete d.now; for (const r of d.glaciers) { delete r.hsq; delete r.hnq; delete r.hnw; delete r.sq; } return JSON.stringify(d); };
  const stat = (e) => { if (!e.status?.lines?.snowpack) return null; const s = structuredClone(e.status.lines.snowpack); delete s.spread; delete s.bytes; delete s.seconds; return JSON.stringify(s); };
  add('I7 Producer, aus = wie vorher: ohne Angabe und mit „off“ entstehen dieselben Bytes (Dokument, Zustand, alle anderen Dateien, Zeiger), keine Zeile `spread` im Status; ein unbekanntes Wort (Schalter oder Umgebung) bricht den Lauf vor dem Rechnen ab — bei ausgeschalteter Schneedecke wird es gar nicht gelesen',
    !eOff.err && !eWord.err && JSON.stringify(eOff.doc) === JSON.stringify(eWord.doc) && eOff.stateRaw === eWord.stateRaw && sameFiles(eOff, eWord) && eOff.doc.rules.spread === 'none' && !('spread' in eOff.status.lines.snowpack) && !('spread' in eOff.doc) && !('now' in eOff.doc)
    && /Spanne der Schneedecke/.test(eBad.err ?? '') && !eBad.wrote && /Spanne der Schneedecke/.test(eEnvBad.err ?? '') && !eEnvBadOff.err, JSON.stringify({ off: eOff.err, bad: eBad.err, envBad: eEnvBad.err, envBadOff: eEnvBadOff.err }));
  const own = ['gl_ch_alpha', 'gl_ch_beta', 'gl_ch_far'], rOn = (id) => rowOf(eOn, id);
  add('I8 Producer, an: nur das Schneedecken-Dokument und seine Statuszeile ändern sich — ohne die Spannen-Felder ist das Dokument Byte für Byte das des Laufs ohne Schalter, Zustand, Schmelzdokument, Wetterdokumente und Zeiger sind gleich; die Statuszeile nennt K, die Zahl der Zeilen mit Spanne und die ohne mit Grund; auch über die Umgebung; zweimal gerechnet gibt dieselben Bytes',
    !eOn.err && !!eOn.doc && !!eOn2.doc && bare(eOn) === JSON.stringify(eOff.doc) && eOn.stateRaw === eOff.stateRaw && sameFiles(eOn, eOff) && JSON.stringify(eOn.index) === JSON.stringify(eOff.index) && stat(eOn) === stat(eOff)
    && eq({ ...eOn.status.lines.snowpack.spread, seconds: 0 }, { k: GLACIER_SNOWPACK_SPREAD_K, rows: 3, none: { neighbour: 1 }, seconds: 0 }) && JSON.stringify(eOn.doc) === JSON.stringify(eOn2.doc) && JSON.stringify(eEnv.doc) === JSON.stringify(eOn.doc),
    JSON.stringify({ err: eOn.err, spread: eOn.status?.lines.snowpack.spread }));
  add('I9 Producer, an: jede Zeile mit eigenem Antrieb trägt p10/p90 je Höhe und Tag und die Summe der Tage 8–14, die Nachbar-Zeile den Vermerk „neighbour“ und keine Spanne (E-GM-35); der Kopf nennt die Regel mit K, die Zählung und EIN Paar zur Unsicherheit des Faktors als „nicht nachgemessen“ (E-GM-33); das Dokument besteht den Vertrag; am ersten Tag (Schneefall) ist die Spanne an der Oberkante offen',
    !!eOn.doc && own.every((id) => rOn(id)?.hsq && rOn(id).hnq && rOn(id).hnw && !rOn(id).sq) && rOn('gl_ch_gamma').sq === 'neighbour' && !rOn('gl_ch_gamma').hsq && eq(eOn.doc.rules.spread, GLACIER_SNOWPACK_SPREAD_RULE) && eq(eOn.doc.spread, { rows: 3, none: { neighbour: 1 } })
    && eq(eOn.doc.now, { factor: GLACIER_SNOWPACK_NOW_FACTOR }) && eOn.doc.now.factor.verified === false && !snowpackProblems(eOn.doc, new Set(mkTree(join(tmp, 'i-ids')).ids)).length && rOn('gl_ch_alpha').hsq[2][1][0] - rOn('gl_ch_alpha').hsq[2][0][0] > 2,
    JSON.stringify({ alpha: rOn('gl_ch_alpha') && { hsd: rOn('gl_ch_alpha').hsd[2].slice(0, 2), p10: rOn('gl_ch_alpha').hsq[2][0].slice(0, 2), p90: rOn('gl_ch_alpha').hsq[2][1].slice(0, 2), hnw: rOn('gl_ch_alpha').hnw }, problems: snowpackProblems(eOn.doc).slice(0, 3) }));
  // answers without a distribution: no spread, named
  const eNoDist = await runSp(mk('i-nodist'), { ...base, 'snowpack-spread': 'scenarios' });
  add('I10 Producer: nennt die Antwort keine Niederschlagsverteilung, trägt die Zeile keine Spanne und den Vermerk „no-distribution“ — nie eine Spanne ohne Grundlage; gezählt im Kopf, der Vertrag gilt',
    !eNoDist.err && !!eNoDist.doc && own.every((id) => rowOf(eNoDist, id)?.sq === 'no-distribution' && !rowOf(eNoDist, id).hsq) && eNoDist.doc.spread.rows === 0 && eNoDist.doc.spread.none.neighbour === 1 && eNoDist.doc.spread.none['no-distribution'] === 3 && Object.keys(eNoDist.doc.spread.none).length === 2 && !snowpackProblems(eNoDist.doc).length, JSON.stringify({ err: eNoDist.err, spread: eNoDist.doc?.spread }));
  // a scenario without noise through the producer: a distribution without width, answers without a temperature sigma, a rule without sigmas
  const quiet = { ...GLACIER_SNOWPACK_SPREAD_RULE, k: 10, sigma: { factor: 0, densitySystematic: 0, densityEvent: 0 } };
  const eStill = await runSp(mk('i-still'), { ...base, 'snowpack-spread': 'scenarios', spreadRule: quiet }, { hook: withDist(1e-9, 0) });
  const stillOk = own.map((id) => { const r = rowOf(eStill, id); return !!r?.hsq && [0, 1, 2].every((l) => eq(r.hsq[l][0], r.hsd[l]) && eq(r.hsq[l][1], r.hsd[l]) && eq(r.hnq[l][0], r.hnd[l]) && eq(r.hnq[l][1], r.hnd[l])); });
  // … and each path of the producer alone: only the precipitation distribution, only the temperature sigma of the answers
  const eP = await runSp(mk('i-p'), { ...base, 'snowpack-spread': 'scenarios', spreadRule: quiet }, { hook: withDist(0.6, 0) }), eT = await runSp(mk('i-t'), { ...base, 'snowpack-spread': 'scenarios', spreadRule: quiet }, { hook: withDist(1e-9, 2) });
  const wOf = (e, id, l, d) => { const r = rowOf(e, id); return r?.hsq ? r.hsq[l][1][d] - r.hsq[l][0][d] : NaN; };
  add('I11 Producer: ein Szenario ohne Streuung ist der Erwartungswert — mit einer Verteilung ohne Breite, Antworten ohne Temperaturfehler und einer Regel ohne Fehler an Faktor und Dichte sind p10 und p90 an jeder Zeile mit eigenem Antrieb genau `hsd` und `hnd` (der Weg der Szenarien über Niederschlagsmenge, Temperatur und Schneeanteil ist der des Laufs); nur die Verteilung öffnet eine Spanne, nur der Temperaturfehler der Antworten auch (an der Zunge)',
    !eStill.err && !!eStill.doc && stillOk.every(Boolean) && eq(eStill.doc.rules.spread, quiet) && wOf(eP, 'gl_ch_alpha', 2, 13) > 1 && wOf(eT, 'gl_ch_alpha', 0, 13) > 0.3, JSON.stringify({ err: eStill.err, stillOk, wP: wOf(eP, 'gl_ch_alpha', 2, 13), wT: wOf(eT, 'gl_ch_alpha', 0, 13) }));
  // every glacier draws its own paths: Alpha and Beta get the same answers from the stub (their expected rows may differ by their elevations only)
  const a = rOn('gl_ch_alpha'), b = rOn('gl_ch_beta'), eLater = await runSp(mk('i-later'), { ...base, 'snowpack-spread': 'scenarios' }, { ...wide, shiftH: 6 });
  add('I12 Producer: jeder Gletscher zieht eigene Pfade und jeder Lauf andere — die Spannen-Breite von Alpha und Beta (gleiche Antworten) ist an Tag 14 nicht dieselbe Zahlenreihe, und der Lauf sechs Stunden später schreibt für Alpha andere Spannen',
    !!a?.hsq && !!b?.hsq && !eq(a.hsq[2].map((x, j) => x.map((v, d) => Math.round((v - a.hsd[2][d]) * 10))), b.hsq[2].map((x) => x.map((v, d) => Math.round((v - b.hsd[2][d]) * 10)))) && !eLater.err && !eq(rowOf(eLater, 'gl_ch_alpha')?.hsq, a.hsq),
    JSON.stringify({ a: a?.hsq[2][1].slice(0, 4), b: b?.hsq[2][1].slice(0, 4), later: eLater.err }));
  // a row without three answers (tongue and top failed) under psnow: the solid share is not the temperature ramp — a scenario without noise must still be the expected row
  const lapseHook = (o, e, lv) => { if (lv !== 1) throw new Error('Antwort fehlt'); return withDist(1e-9, 0)(); };
  const eLapse = await runSp(mk('i-lapse'), { ...base, 'snowpack-spread': 'scenarios', spreadRule: quiet, phase: 'psnow' }, { hook: lapseHook });
  const lapseOk = own.map((id) => { const r = rowOf(eLapse, id); return r?.lv === 'lapse' && !!r.hsq && [0, 1, 2].every((l) => eq(r.hsq[l][0], r.hsd[l]) && eq(r.hsq[l][1], r.hsd[l]) && eq(r.hnq[l][0], r.hnd[l])); });
  const eLapseT = await runSp(mk('i-lapset'), { ...base, 'snowpack-spread': 'scenarios', spreadRule: quiet, phase: 'psnow' }, { hook: (o, e, lv) => { if (lv !== 1) throw new Error('Antwort fehlt'); return withDist(1e-9, 2)(); } });
  // V-GM-86 (GM-10b): with the factor switch on, the snowpack runs every glacier on the SAME factor as its melt run (own here), the shape stays with the melt
  // run, the state names the rule; equivalence by hand: Alpha's row on its own factor 2,5 is the row of a run whose REGION value is 2,5
  const glT = J(join(HERE, 'glacier', 'snow-calibration-glaciers.json'));
  glT.glaciers = { gl_ch_alpha: { country: 'CH', winters: 9, years: [2015, 2023], F: 2.5, origin: 'measured', shape: { z0: 2400, stepM: 50, s: [-0.3, -0.1, 0, 0.1, 0.2, 0.2, 0.1, 0, 0], m: 0.5 } } };
  const glFile = join(tmp, 'gl-table.json'); writeFileSync(glFile, JSON.stringify(glT));
  const glSha16 = createHash('sha256').update(readFileSync(glFile)).digest('hex').slice(0, 16);
  const eGl = await runSp(mk('i-gl'), { ...base, 'glacier-factor': 'on', 'glacier-shape': 'on', 'snowcal-glaciers': glFile }, wide);
  const eSh = await runSp(mk('i-sh'), { ...base, 'glacier-shape': 'on', 'snowcal-glaciers': glFile }, wide);
  const r25 = mk('i-region25'); { const t = J(join(r25, 'snowcal.json')); t.precip.regions['ch-test'].F = 2.5; writeFileSync(join(r25, 'snowcal.json'), JSON.stringify(t)); }
  const e25 = await runSp(r25, base, wide);
  const rowEq = (a, b, id) => JSON.stringify(rowOf(a, id)) === JSON.stringify(rowOf(b, id));
  add('I14 V-GM-86 — die Schneedecke rechnet mit dem Faktor des Schmelzlaufs: mit „Faktor je Gletscher“ an ist Alphas Zeile genau die eines Laufs, dessen REGIONSwert 2,5 ist (eigener Faktor 2,5), und eine andere als ohne Schalter; Beta, Gamma, Far bleiben Byte für Byte; die Form je Band gehört weiter allein dem Schmelzlauf (nur Form an = dieselben Bytes wie ohne Schalter); der Zustand nennt die Regel `on:<Tabelle>`, das Dokument die Zeilen mit eigenem Faktor; die Wetterdokumente bleiben gleich, das Schmelzdokument nennt den Gletscher',
    !eGl.err && !eSh.err && !e25.err && rowEq(eGl, e25, 'gl_ch_alpha') && !rowEq(eGl, eOff, 'gl_ch_alpha') && ['gl_ch_beta', 'gl_ch_gamma', 'gl_ch_far'].every((id) => rowEq(eGl, eOff, id))
    && JSON.stringify(eSh.doc) === JSON.stringify(eOff.doc) && eSh.stateRaw === eOff.stateRaw && eGl.state.rules.factor === `on:${glSha16}` && eOff.state.rules.factor === undefined
    && JSON.stringify(eGl.doc.rules.precip.glaciers?.applied) === JSON.stringify({ own: ['gl_ch_alpha'], predicted: [], 'predicted-shrunk': [] }) && eGl.doc.rules.precip.glaciers.rule === 'on'
    && [0, 1, 2, 3].every((i) => eGl.files[i] != null && eGl.files[i] === eOff.files[i]) && eGl.files[4] !== eOff.files[4]
    && JSON.stringify(JSON.parse(eGl.files[4]).params.precip.glaciers?.applied) === JSON.stringify({ factor: ['gl_ch_alpha'], shape: ['gl_ch_alpha'] }) && !snowpackProblems(eGl.doc).length && !snowpackStateProblems(eGl.state).length,
    JSON.stringify({ err: [eGl.err, eSh.err, e25.err], rule: eGl.state?.rules, block: eGl.doc?.rules?.precip?.glaciers }));
  // one snowpack from ONE factor rule: a state of another rule is not continued (either way), a state of the same rule is
  const rA = mk('i-rule-a'); putState(rA, eOff.stateRaw); const eA = await runSp(rA, { snowpack: 'shadow', 'glacier-factor': 'on', 'snowcal-glaciers': glFile }, { ...wide, shiftH: 6 });
  const rB = mk('i-rule-b'); putState(rB, eGl.stateRaw); const eB = await runSp(rB, { snowpack: 'shadow' }, { ...wide, shiftH: 6 });
  const rC = mk('i-rule-c'); putState(rC, eGl.stateRaw); const eC = await runSp(rC, { snowpack: 'shadow', 'glacier-factor': 'on', 'snowcal-glaciers': glFile }, { ...wide, shiftH: 6 });
  add('I15 V-GM-86 — eine Schneedecke aus EINER Faktorregel: ein Zustand ohne Regel wird von einem Lauf mit „Faktor je Gletscher“ nicht fortgesetzt und umgekehrt (kein Schneedecken-Dokument, kein Zustand, die Statuszeile nennt die Faktorregel und den Weg über einen neuen Startzustand; der Schmelzlauf läuft); ein Zustand derselben Regel wird fortgesetzt; die Regeln des Zustands: eine Faktorregel nur neben „country“ und nur in der Form <Wort>:<16 hex>',
    !eA.err && !eA.doc && /anderer Faktorregel \(Landeswert statt on:/.test(eA.status?.lines?.snowpack?.error ?? '') && !eB.err && !eB.doc && /anderer Faktorregel \(on:[0-9a-f]{16} statt Landeswert\)/.test(eB.status?.lines?.snowpack?.error ?? '')
    && /snowpack-seed\.mjs --glacier-factor/.test(eA.status.lines.snowpack.error) && !eC.err && !!eC.doc && eC.doc.state.source === 'carried'
    && stateRefusal({ ...eGl.state, rules: { ...eGl.state.rules, factor: 'predicted:0123456789abcdef' } }, eGl.state.rules, Date.now()) != null && stateRefusal(eGl.state, eGl.state.rules, Date.now()) === null
    && snowpackStateProblems({ ...eGl.state, rules: { ...eGl.state.rules, factor: 'on' } }).length > 0 && snowpackStateProblems({ ...eGl.state, rules: { precip: 'gate-c', density: 'helfricht', factor: eGl.state.rules.factor } }).length > 0,
    JSON.stringify({ err: [eA.err, eB.err, eC.err], a: eA.status?.lines?.snowpack, b: eB.status?.lines?.snowpack?.error }));
  // GM-10b: predicted factors with spreads — the head names the measured pair of every basis next to the one pair of the run hour
  const fxP = J(join(HERE, 'lib', 'fixtures', 'glacier', 'snowcal-predicted.json'));
  fxP.inputs.ownTable = createHash('sha256').update(readFileSync(glFile)).digest('hex'); delete fxP.glaciers.gl_ch_delta; fxP.counts.country = 0;
  const pFile = join(tmp, 'predicted.json'); writeFileSync(pFile, JSON.stringify(fxP));
  const ePr = await runSp(mk('i-pred'), { ...base, 'snowpack-spread': 'scenarios', 'glacier-factor': 'predicted', 'glacier-factor-table': pFile, 'snowcal-glaciers': glFile }, wide);
  const ePr0 = await runSp(mk('i-pred-nospread'), { ...base, 'glacier-factor': 'predicted', 'glacier-factor-table': pFile, 'snowcal-glaciers': glFile }, wide);
  const nb = ePr.doc?.now?.bases;
  add('I16 GM-10b — vorhergesagte Faktoren in der Schneedecke: Betas Zeile ist die eines Laufs mit Regionswert 2,1 (vorhergesagt), Alphas die mit 2,5 (eigener Faktor); mit Spannen nennt der Kopf neben dem einen Paar der Laufstunde das gemessene Paar jeder Grundlage (aus der Tabelle, „measured“, „nicht nachgeprüft“), ohne Spannen nicht; der Zustand nennt die Regel `predicted:<Tabelle>`, das Dokument die Zeilen je Grundlage; Verträge ohne Befund; Gegenprobe: ein Paar je Grundlage ohne Herkunft wird abgelehnt',
    !ePr.err && !ePr0.err && !!nb && JSON.stringify(Object.keys(nb)) === JSON.stringify(['own', 'predicted', 'predicted-shrunk', 'country']) && nb.predicted.p10 === fxP.spread.predicted.p10 && nb.predicted.origin === 'measured' && nb.predicted.verified === false
    && ePr.doc.now.factor.p10 === 0.73 && ePr0.doc.now === undefined && /^predicted:[0-9a-f]{16}$/.test(ePr.state.rules.factor) && JSON.stringify(ePr.doc.rules.precip.glaciers.applied) === JSON.stringify({ own: ['gl_ch_alpha'], predicted: ['gl_ch_beta'], 'predicted-shrunk': ['gl_ch_gamma'] })
    && !snowpackProblems(ePr.doc).length && snowpackProblems({ ...ePr.doc, now: { ...ePr.doc.now, bases: { ...nb, predicted: { ...nb.predicted, origin: 'set' } } } }).length > 0,
    JSON.stringify({ err: [ePr.err, ePr0.err], nb, rules: ePr.state?.rules }));
  // V-GM-91: the re-spin of the melt state by the seed tool, by hand (pure)
  {
    const fromMs = Date.UTC(2026, 9, 1), hours = 48, bands = { zb: [2625, 2675], w: [0.5, 0.5] }, ser = { t: Array(48).fill(-4), p: Array(48).fill(1), g: Array(48).fill(100) };
    ser.t[10] = null; ser.p[10] = null;   // an hour without forcing: left out
    // a's hour 20 has no analysis but the forcing of a weather run of buscosun Fusion (`fill`): it counts, with its own temperature and no shift
    const serA = { t: ser.t.map((v, h) => (h === 20 ? null : v)), p: ser.p.map((v, h) => (h === 20 ? null : v)), g: ser.g };
    const glaciers = [{ id: 'a', bands, ela: 2650, F: 2.5, series: serA, dT: -1, fill: { 20: { T: [-6, -6, -6], P: 5, G: 50 } } }, { id: 'b', bands, ela: 2650, F: 2.1, series: ser, dT: 0 }, { id: 'c', bands, ela: 2650, F: 1.793, series: ser, dT: 0 }];
    const state = { schema: 1, kind: 'glacier/melt-state', atMs: fromMs + hours * H, g: { a: [[5, 5], [800, 800]], b: [[7, 7], [700, 700]], c: [[9, 9], [600, 600]], d: [[1, 1], [500, 500]] }, fac: { rule: 'on:0123456789abcdef', f: { b: 2.1, c: 1.9 } } };
    const factorOf = (id) => ({ a: 2.5, b: 2.1, d: 2.2 })[id] ?? null;
    const r = respinMeltState({ state, glaciers, factorOf, rule: 'predicted:fedcba9876543210', fromMs, hours, cal: { TF: 0.05, SRF: 0.008 } });
    const hand = (dT, F) => stateRowOf(simulate({ bands, ela: 2650, t: Float64Array.from(ser.t.filter((v, h) => h !== 10).map((v) => v + dT)), g: Float64Array.from(Array(47).fill(100)), p: Float64Array.from(Array(47).fill(1)), zT: 2650, zP: 2650, pf: F, TF: 0.05, SRF: 0.008, state: emptyState(2), model: 'eti', pGrad: 0 }).state);
    const hours47 = Array.from({ length: 48 }, (_, h) => h).filter((h) => h !== 10);
    const handA = stateRowOf(simulate({ bands, ela: 2650, t: Float64Array.from(hours47.map((h) => (h === 20 ? -6 : ser.t[h] - 1))), g: Float64Array.from(hours47.map((h) => (h === 20 ? 50 : 100))), p: Float64Array.from(hours47.map((h) => (h === 20 ? 5 : 1))), zT: 2650, zP: 2650, pf: 2.5, TF: 0.05, SRF: 0.008, state: emptyState(2), model: 'eti', pGrad: 0 }).state);
    let refused = null; try { respinMeltState({ state, glaciers, factorOf, rule: null, fromMs, hours: 47, cal: { TF: 0.05, SRF: 0.008 } }); } catch (e) { refused = String(e.message); }
    add('I17 V-GM-91 — Neu-Einschwingen des Schmelzzustands (rein, `snowpack-seed.mjs --melt-respin`): a (bisher Landeswert, jetzt 2,5) und c (bisher 1,9, jetzt Landeswert) beginnen am 1. Oktober neu — von Hand der Kern des Betriebs mit dem neuen Faktor über die Stunden mit Antrieb (die Stunde ohne fällt weg, eine Stunde mit dem Antrieb eines Wetterlaufs von buscosun Fusion zählt mit dessen Temperatur, Niederschlag und Strahlung); b (gleicher Faktor 2,1) bleibt Byte für Byte; d (ohne Antrieb) fällt heraus statt mit altem Schnee weiterzulaufen; `fac` nennt die neue Regel und die Faktoren der Gletscher, die nicht auf dem Landeswert laufen; der Vertrag nimmt den Zustand; ein Zustand, der nicht am Ende des Einschwingens steht, wird abgelehnt',
      JSON.stringify(r.state.g.a) === JSON.stringify(handA) && JSON.stringify(handA) !== JSON.stringify(hand(-1, 2.5)) && JSON.stringify(r.state.g.c) === JSON.stringify(hand(0, 1.793)) && r.state.g.b === state.g.b && !('d' in r.state.g)
      && JSON.stringify(r.respun) === JSON.stringify(['a', 'c']) && JSON.stringify(r.missing) === JSON.stringify(['d']) && r.state.fac.rule === 'predicted:fedcba9876543210' && JSON.stringify(r.state.fac.f) === JSON.stringify({ a: 2.5, b: 2.1 })
      && r.state.g.a[0][0] > 0 && meltStateProblems(r.state).length === 0 && /dieselbe Stunde/.test(refused ?? ''), JSON.stringify({ a: r.state.g.a, hand: handA, fac: r.state.fac, respun: r.respun, refused }));
  }
  add('I13 Producer: auch eine Zeile OHNE drei Antworten (Zunge und Oberkante ausgefallen, Regel „psnow“ — der Schneeanteil ist dort nicht die Temperatur-Rampe) hält die Regel: ein Szenario ohne Streuung ist der Erwartungswert; mit dem Temperaturfehler der Antwort öffnet sich die Spanne',
    !eLapse.err && lapseOk.every(Boolean) && wOf(eLapseT, 'gl_ch_alpha', 0, 13) > 0.3, JSON.stringify({ err: eLapse.err, lapseOk, rows: eLapse.doc?.glaciers.map((r) => [r.id, r.lv ?? null, r.sq ?? null]), wT: wOf(eLapseT, 'gl_ch_alpha', 0, 13) }));
});

// --- J: GM-5c — the pairs carry the forecast at the station elevation (V-GM-79) -------------------------------------------------------------------
await block('J', async () => {
  add('J1 Vorlaufzeiten und Regel sind festgeschrieben: +24 / +48 / +72 h (ganze Tage der Zeile), „je Szenario zwischen den Höhen“ — eine Änderung daran ist eine bewusste',
    eq(GLACIER_SNOWPACK_PAIRS_FC_HOURS, [24, 48, 72]) && GLACIER_SNOWPACK_PAIRS_FC_ELEVATION === 'per-scenario-linear-between-levels-clamped');
  // --- the core: the scenarios read at one more elevation
  const g = gWarm, F = 1.793, c = BOARD.c, pars = parsOf(g), begin = Math.round(LX_T0 / H);
  const tz = g.levels.map((l) => f64(l.t)), share = tz.map((t) => Float64Array.from(t, solidFraction)), p = f64(g.median.p), gg = new Float64Array(336).fill(60), factor = [F, F, F];
  const pre = [begin - 500, 0, [[2000, 800], [2500, 900], [3000, 1000]], [600, 600, 600], null];
  const levels = levelsOfEntry(pre);
  snowpackOfGlacier({ id: g.id, z: g.z, levels, drive: driveOf({ tz, share, p, g: gg, factor, hours: HOURS }), pars, c, t0Ms: LX_T0, begin });
  const frozen = () => JSON.stringify(levels.map((lv) => [packToRow(lv.pack), lv.aS]));
  const before = frozen();
  const wet = { amount: (h, zP) => Math.max(0, p[h]) * Math.exp(0.6 * zP), place: (zT) => { const t2 = tz.map((a) => Float64Array.from(a, (v, h) => v + 2 * zT[h])); return { tz: t2, share: t2.map((a) => Float64Array.from(a, solidFraction)) }; } };
  const spr = (at, rule = { ...GLACIER_SNOWPACK_SPREAD_RULE, k: 40 }, paths = wet, lv = levels) => spreadOfGlacier({ levels: lv, pars, c, t0Ms: LX_T0, seed: 11, rule, p, g: gg, factor, ...paths, ...(at ? { at } : {}) });
  const plain = spr(null), mid = (g.z[0] + g.z[1]) / 2;
  const below = spr({ z: g.z, zs: g.z[0] - 50, days: 3 }), above = spr({ z: g.z, zs: g.z[2] + 50, days: 3 }), onMed = spr({ z: g.z, zs: g.z[1], days: 3 }), inside = spr({ z: g.z, zs: mid, days: 3 });
  const rest = (x) => { const { at, ...o } = x; return JSON.stringify(o); };
  const first3 = (q, l) => [q.hsq[l][0].slice(0, 3), q.hsq[l][1].slice(0, 3)];
  add('J2 Kern: die Szenarien in einer weiteren Höhe gelesen — ohne die Angabe hat das Ergebnis kein solches Feld; mit ihr bleiben `hsq`, `hnq`, `hnw` Zahl für Zahl dieselben (keine Zufallszahl gezogen) und die Schneedecke der Laufstunde unberührt; unter der Zunge ist die Spanne genau die der Zunge, über der Oberkante die der Oberkante, auf der Medianhöhe die der Mitte — nie hochgerechnet; drei Tage verlangt, drei geliefert',
    !('at' in plain) && [below, above, onMed, inside].every((x) => rest(x) === JSON.stringify(plain) && x.at.length === 2 && x.at[0].length === 3 && x.at[1].length === 3) && eq(below.at, first3(plain, 0)) && eq(above.at, first3(plain, 2)) && eq(onMed.at, first3(plain, 1))
    && !eq(inside.at, first3(plain, 0)) && !eq(inside.at, first3(plain, 1)) && frozen() === before, JSON.stringify({ below: below.at, tongue: first3(plain, 0), inside: inside.at }));
  // one scenario: the value at the elevation by hand from that scenario's two levels (three quarters of the way from the tongue to the median elevation)
  {
    const one = { ...GLACIER_SNOWPACK_SPREAD_RULE, k: 1 }, zq = g.z[0] + 0.75 * (g.z[1] - g.z[0]), a = spr({ z: g.z, zs: zq, days: 3 }, one), zu = g.z[1] + 0.25 * (g.z[2] - g.z[1]), b = spr({ z: g.z, zs: zu, days: 3 }, one);
    const hand = (x, lo, w) => [0, 1, 2].map((d) => Math.round((x.hsq[lo][0][d] + w * (x.hsq[lo + 1][0][d] - x.hsq[lo][0][d])) * 10) / 10);
    add('J3 Kern, ein Szenario von Hand: der Wert in der Höhe ist der dieses Szenarios zwischen seinen zwei Nachbarhöhen — drei Viertel des Wegs von der Zunge zur Mitte bzw. ein Viertel von der Mitte zur Oberkante, an jedem der drei Tage (auf 0,1 cm); p10 = p90',
      eq(a.at[0], a.at[1]) && eq(a.at[0], hand(a, 0, 0.75)) && eq(b.at[0], hand(b, 1, 0.25)) && a.hsq[0][0][0] !== a.hsq[1][0][0], JSON.stringify({ at: a.at[0], hand: hand(a, 0, 0.75), tongue: a.hsq[0][0].slice(0, 3), median: a.hsq[1][0].slice(0, 3) }));
  }
  // the quantile of the values read at the elevation, not a mix of two quantiles: scenarios in which the snow falls EITHER at the tongue OR at the median
  // elevation (never both) — half way between, every scenario gets the same; each level alone spreads wide
  {
    const cold = [0, 1, 2].map(() => new Float64Array(336).fill(-5)), fill = (v) => new Float64Array(336).fill(v);
    const either = { amount: (h) => Math.max(0, p[h]), place: (zT) => { const up = zT[0] > 0; return { tz: cold, share: [fill(up ? 0.9 : 0.1), fill(up ? 0.1 : 0.9), fill(0.5)] }; } };
    const flat = levelsOfEntry([begin - 500, 0, [[2000, 800], [2000, 800], [2000, 800]], [600, 600, 600], null]);
    snowpackOfGlacier({ id: g.id, z: g.z, levels: flat, drive: driveOf({ tz: cold, share: [fill(0.5), fill(0.5), fill(0.5)], p, g: gg, factor, hours: HOURS }), pars, c, t0Ms: LX_T0, begin });
    const x = spr({ z: g.z, zs: mid, days: 3 }, { ...GLACIER_SNOWPACK_SPREAD_RULE, k: 40, sigma: { factor: 0, densitySystematic: 0, densityEvent: 0 } }, either, flat);
    const w = (q, d) => q[1][d] - q[0][d], w0 = w(x.hsq[0], 2), w1 = w(x.hsq[1], 2), wAt = w(x.at, 2);
    add('J4 Kern: das Quantil der in der Höhe gelesenen Szenario-Werte, nie die Mischung zweier Quantile — fällt der Schnee je Szenario ENTWEDER an der Zunge ODER an der Mitte, ist die Spanne an jeder der zwei Höhen weit offen, auf halbem Weg dazwischen aber fast geschlossen (jedes Szenario bringt dort gleich viel); die Mischung der Quantile wäre so breit wie die Höhen selbst',
      w0 > 3 && w1 > 3 && wAt < 0.2 * Math.min(w0, w1), JSON.stringify({ w0, w1, wAt, at: x.at }));
  }
  add('J5 Kern: eine unbrauchbare Angabe der Höhe bricht ab (keine Höhe, null Tage, mehr Tage als die Vorhersage, nur zwei Höhen der Zeile) — nie eine Spanne an einer geratenen Stelle',
    !!(await throws(() => spr({ z: g.z, zs: NaN, days: 3 }))) && !!(await throws(() => spr({ z: g.z, zs: 2500, days: 0 }))) && !!(await throws(() => spr({ z: g.z, zs: 2500, days: 15 }))) && !!(await throws(() => spr({ z: g.z.slice(0, 2), zs: 2500, days: 3 }))));

  // --- the pairs, pure: rows by hand
  {
    const row = (id, z, extra) => ({ id, z, f: 'own', hs: [10, 20, 40], swe: [20, 40, 80], hn: [[1, 2, 3], [2, 3, 4], [3, 4, 5]], hsd: [[11, 12, 13, 99], [21, 24, 27, 99], [41, 46, 51, 99]], hnd: [[1, 1, 1, 0], [1, 3, 3, 0], [1, 5, 5, 0]], ...extra });
    const hsq = [[[9, 10, 11, 0], [13, 14, 15, 0]], [[19, 20, 21, 0], [23, 28, 33, 0]], [[39, 40, 41, 0], [43, 52, 61, 0]]];
    const rows = [row('g_in', [2000, 2500, 3000], { hsq }), row('g_lo', [2000, 2500, 3000], { hsq }), row('g_nb', [2000, 2500, 3000], { f: 'g_in', sq: 'neighbour' }), row('g_nd', [2000, 2500, 3000], { sq: 'no-distribution' })];
    const map = { ext: { stations: { 'n:in': { elev: 2250 }, 'n:lo': { elev: 1900 }, 'n:hi': { elev: 3100 } }, glaciers: { g_in: { snow: ['n:in', 1, -250] }, g_lo: { snow: ['n:lo', 2, -600] }, g_nb: { snow: ['n:hi', 3, 600] }, g_nd: { snow: ['n:in', 1, -250] } } } };
    const slot = { stations: { 'n:in': { t: new Date(LX_T0).toISOString(), v: { snow: 30 } } }, ext: { stations: {} } };
    const qIn = [[14.1, 15.2, 16.3], [18.4, 19.5, 20.6]], qLo = [[9, 10, 11], [13, 14, 15]];
    const base = { rows, map, slot, t0Ms: LX_T0, windowMin: GLACIER_SNOWPACK_PAIRS_WINDOW_MIN };
    const fcast = (at) => ({ days: [1, 2, 3], at });
    const off = pairsOf(base), on = pairsOf({ ...base, forecast: fcast(new Map([['g_in', { zs: 2250, q: qIn }], ['g_lo', { zs: 1900, q: qLo }]])) });
    const by = new Map(on.pairs.map((x) => [x.g, x]));
    const strip = (ps) => JSON.stringify(ps.map((x) => { const { fm, fq, sq, ...o } = x; return o; }));
    const levels2 = stationLevelsOf(map);
    add('J6 Paare (rein), von Hand: ohne die Angabe ist jedes Paar, was es war, und das Ergebnis hat keine Zählung der Vorhersage; mit ihr trägt JEDES Paar die erwartete Schneehöhe in Stationshöhe zu +24 / +48 / +72 h aus den Tagen 1–3 der Zeile (2 250 m zwischen 11·12·13 und 21·24·27 ⇒ 16·18·20; unter der Zunge 11·12·13; über der Oberkante 41·46·51 — nie hochgerechnet, der vierte Tag bleibt draußen), das Paar auf einer Zeile mit Spanne genau die gereichte Spanne dieser Höhe, das auf der Nachbar-Zeile und das ohne Verteilung den Vermerk der Zeile und keine Spanne; alle anderen Felder Zeichen für Zeichen wie ohne; die Zählung nennt 2 mit Spanne und je 1 ohne',
      !('forecast' in off) && off.pairs.every((x) => !('fm' in x) && !('fq' in x) && !('sq' in x)) && strip(on.pairs) === JSON.stringify(off.pairs) && eq(on.counts, off.counts)
      && eq(by.get('g_in').fm, [16, 18, 20]) && eq(by.get('g_lo').fm, [11, 12, 13]) && eq(by.get('g_nb').fm, [41, 46, 51]) && eq(by.get('g_nd').fm, [16, 18, 20]) && eq(by.get('g_in').fq, qIn) && eq(by.get('g_lo').fq, qLo)
      && by.get('g_nb').sq === 'neighbour' && !('fq' in by.get('g_nb')) && by.get('g_nd').sq === 'no-distribution' && !('fq' in by.get('g_nd')) && !('sq' in by.get('g_in')) && eq(on.forecast, { pairs: 2, none: { neighbour: 1, 'no-distribution': 1 } })
      && eq([...levels2], [['g_in', 2250], ['g_lo', 1900], ['g_nb', 3100], ['g_nd', 2250]]), JSON.stringify({ on: on.pairs.map((x) => [x.g, x.fm, x.fq ?? x.sq]), fc: on.forecast }));
    const noQ = await throws(() => pairsOf({ ...base, forecast: fcast(new Map([['g_in', { zs: 2250, q: qIn }]])) }));
    const otherZ = await throws(() => pairsOf({ ...base, forecast: fcast(new Map([['g_in', { zs: 2300, q: qIn }], ['g_lo', { zs: 1900, q: qLo }]])) }));
    // a row with neither a spread nor a reason — even when a spread for its station elevation is handed in (so that only the rule about the ROW can refuse it)
    const noRowQ = await throws(() => pairsOf({ ...base, rows: rows.map((r) => (r.id === 'g_nd' ? row('g_nd', [2000, 2500, 3000], {}) : r)), forecast: fcast(new Map([['g_in', { zs: 2250, q: qIn }], ['g_lo', { zs: 1900, q: qLo }], ['g_nd', { zs: 2250, q: qIn }]])) }));
    add('J7 Paare (rein), kein stiller Ersatz: fehlt zu einer Zeile mit Spanne die Spanne in Stationshöhe, gilt sie für eine andere Höhe als die der Station, oder trägt eine Zeile weder Spanne noch Vermerk (auch wenn für ihre Stationshöhe eine Spanne gereicht wird), bricht der Schritt mit dem Grund ab — nie die Quantile der Zeile zwischen zwei Höhen gemischt; eine Zuordnung ohne Abschnitt `ext` nennt keine Stationshöhen',
      /Spanne in Stationshöhe fehlt \(g_lo/.test(noQ ?? '') && /Spanne in Stationshöhe fehlt \(g_in/.test(otherZ ?? '') && /Spanne in Stationshöhe fehlt \(g_nd/.test(noRowQ ?? '') && /ohne Abschnitt ext/.test((await throws(() => stationLevelsOf({ glaciers: {} }))) ?? ''), JSON.stringify({ noQ, otherZ, noRowQ }));
  }
});
await block('Jp', async () => {
  // --- the producer: every combination of the two switches on the same tree (a seed with snow, the station line, answers with a distribution)
  const FXs = J(join(HERE, 'lib', 'fixtures', 'glacier', 'snowpack-seed.json')), ns = FXs.inca.timestamps.length;
  const oneS = (i) => { const P = FXs.inca.features[i].properties.parameters; return { t: P['2t'].data, p: P.tp.data, g: P.ssrd.data }; };
  const seedJ = JSON.stringify(seedOfForcing({ glaciers: [{ id: 'gl_ch_alpha', z: [2425, 2600, 2775], ela: 2600, F: F_TEST, series: oneS(0), dT: 0 }, { id: 'gl_ch_beta', z: [2525, 2700, 2875], ela: 2700, F: F_TEST, series: oneS(0), dT: -1 }, { id: 'gl_ch_gamma', z: [2625, 2800, 2975], ela: 2800, F: F_TEST, series: oneS(1), dT: 0 }], fromMs: LX_T0 - (ns + 4) * H, hours: ns, cal: { TF: 0.05, SRF: 0.008 }, c: BOARD.c, rules: { precip: 'country', density: 'board' }, info: {} }));
  const mkJ = (name, o) => { const r = mk(name); putState(r, seedJ); putStations(r, o); return r; };
  const withDist = (sigma, tSigma = null) => () => (s) => { const m = s.vars.precip.mean; s.vars.precip.dist = Number.isFinite(m) ? { kind: 'logCensored', mu: Math.log1p(Math.max(0, m)), sigma } : null; if (tSigma != null) s.vars.t2m.sigma = tSigma; };
  const SP = { snowpack: 'shadow' }, PAIRS = { ...SP, 'snowpack-pairs': 'on' }, SPREAD = { ...SP, 'snowpack-spread': 'scenarios' }, BOTH = { ...PAIRS, 'snowpack-spread': 'scenarios' }, wide = { hook: withDist(0.6) };
  const eP = await runSp(mkJ('j-pairs'), PAIRS, wide), eS = await runSp(mkJ('j-spread'), SPREAD, wide), eB = await runSp(mkJ('j-both'), BOTH, wide), eB2 = await runSp(mkJ('j-both2'), BOTH, wide);
  const rawOf = (e, rel) => (existsSync(join(e.outDir, rel)) ? readFileSync(join(e.outDir, rel), 'utf8') : null);
  const pRaw = (e) => rawOf(e, glacierSnowpackPairsPath(e.run)), sRaw = (e) => rawOf(e, glacierSnowpackRunPath(e.run));
  const dP = pairsDoc(eP), dB = pairsDoc(eB);
  const bareP = (d) => { if (!d) return null; const x = structuredClone(d); delete x.forecast; delete x.origins.fm; delete x.origins.fq; for (const q of x.pairs) { delete q.fm; delete q.fq; delete q.sq; } return JSON.stringify(x); };
  const sameFiles = (a, b) => a.files.every((f, i) => f != null && f === b.files[i]);
  const stP = (e) => { const s = structuredClone(e.status?.lines.snowpack?.pairs ?? null); if (s) { delete s.spread; delete s.bytes; } return JSON.stringify(s); };
  add('J8 Producer, Spanne aus = wie vorher: mit den Paaren allein trägt das Paar-Dokument keine Vorhersage (kein Kopfblock, kein `fm`, `fq`, `sq`, Herkunft nur der vier alten Felder), die Statuszeile der Paare keine Zeile `spread`',
    !eP.err && !!dP && !('forecast' in dP) && eq(Object.keys(dP.origins), ['m', 'hn', 'v', 'hsd']) && dP.pairs.every((x) => !('fm' in x) && !('fq' in x) && !('sq' in x)) && !('spread' in (eP.status?.lines.snowpack?.pairs ?? {})) && !snowpackPairsProblems(dP).length, JSON.stringify({ err: eP.err }));
  add('J9 Producer, beide an: das Schneedecken-Dokument ist Byte für Byte das des Laufs mit der Spanne allein (der Zusatz zieht keine Zufallszahl und steht in keiner Zeile), sein Zustand ebenso, Schmelz- und Wetterdateien und der Zeiger sind die des Laufs mit den Paaren allein; das Paar-Dokument ist OHNE die neuen Felder Byte für Byte das ohne Spanne, die Statuszeile der Paare bis auf `spread` und `bytes` gleich; zweimal gerechnet gibt dieselben Bytes',
    !eS.err && !eB.err && !!sRaw(eB) && sRaw(eB) === sRaw(eS) && eB.stateRaw === eS.stateRaw && sameFiles(eB, eP) && sameFiles(eB, eS) && JSON.stringify(eB.index) === JSON.stringify(eP.index) && !!dB && bareP(dB) === pRaw(eP) && stP(eB) === stP(eP)
    && pRaw(eB) === pRaw(eB2) && pRaw(eB) !== pRaw(eP) && pairsDoc(eS) === null, JSON.stringify({ errS: eS.err, errB: eB.err, sameSp: sRaw(eB) === sRaw(eS), bare: bareP(dB) === pRaw(eP) }));
  const rows = new Map((eB.doc?.glaciers ?? []).map((r) => [r.id, r])), by = new Map((dB?.pairs ?? []).map((x) => [x.g, x]));
  const a = by.get('gl_ch_alpha'), b = by.get('gl_ch_beta'), gm = by.get('gl_ch_gamma'), fr = by.get('gl_ch_far');
  const handFm = (gid) => { const r = rows.get(gid), zs = PX.stations[by.get(gid).s].elev; return [0, 1, 2].map((d) => { const v = r.hsd.map((x) => x[d]); if (zs < r.z[0]) return v[0]; if (zs > r.z[2]) return v[2]; const l = zs <= r.z[1] ? 0 : 1; return Math.round((v[l] + ((v[l + 1] - v[l]) * (zs - r.z[l])) / (r.z[l + 1] - r.z[l])) * 10) / 10; }); };
  const d3 = (q) => [q[0].slice(0, 3), q[1].slice(0, 3)];
  const ok10 = !!dB && [a, b, gm, fr].every(Boolean) && !!rows.get('gl_ch_alpha')?.hsq && !!rows.get('gl_ch_beta')?.hsq && !!rows.get('gl_ch_far')?.hsq;
  add('J10 Producer, beide an — das Paar von Hand: jedes der vier Paare trägt die erwartete Schneehöhe in Stationshöhe zu +24 / +48 / +72 h, von Hand aus den Tagen 1–3 der Zeile gelesen; die Station unter der Zunge (IMIS, eigener Antrieb) trägt als Spanne genau die der Zunge, die zweite unter der Zunge ebenso; die Station über der Oberkante sitzt auf einer Nachbar-Zeile und trägt deren Vermerk und keine Spanne; die Station zwischen Zunge und Mitte (Tirol) trägt eine eigene, geordnete, offene Spanne, die weder die der Zunge noch die der Mitte ist und zwischen beiden liegt; Kopfblock: Stunden, Regel (K der Schneedecke, p10/p90, „je Szenario“), 3 Paare mit Spanne, 1 Nachbar; Herkunft `fm`, `fq` = „computed“; Statuszeile `spread: 3`; der Vertrag gilt, auch gegen die Zeilen geprüft',
    ok10 && [a, b, gm, fr].every((x, i) => eq(x.fm, handFm(['gl_ch_alpha', 'gl_ch_beta', 'gl_ch_gamma', 'gl_ch_far'][i]))) && b.at === 'below' && eq(b.fq, d3(rows.get('gl_ch_beta').hsq[0])) && fr.at === 'below' && eq(fr.fq, d3(rows.get('gl_ch_far').hsq[0]))
    && gm.at === 'above' && gm.sq === 'neighbour' && !('fq' in gm) && rows.get('gl_ch_gamma').sq === 'neighbour' && a.at === 'inside' && !('sq' in a) && [0, 1, 2].every((d) => a.fq[0][d] <= a.fq[1][d]) && a.fq[1][0] - a.fq[0][0] > 1
    && !eq(a.fq, d3(rows.get('gl_ch_alpha').hsq[0])) && !eq(a.fq, d3(rows.get('gl_ch_alpha').hsq[1]))
    && [0, 1].every((j) => [0, 1, 2].every((d) => { const lo = rows.get('gl_ch_alpha').hsq[0][j][d], hi = rows.get('gl_ch_alpha').hsq[1][j][d]; return a.fq[j][d] >= Math.min(lo, hi) - 0.05 && a.fq[j][d] <= Math.max(lo, hi) + 0.05; }))
    && eq(dB.forecast, { hours: [24, 48, 72], origin: 'computed', spread: { rule: 'scenarios', k: GLACIER_SNOWPACK_SPREAD_K, quantiles: [10, 90], elevation: GLACIER_SNOWPACK_PAIRS_FC_ELEVATION }, pairs: 3, none: { neighbour: 1 } })
    && dB.origins.fm === 'computed' && dB.origins.fq === 'computed' && eB.status.lines.snowpack.pairs.spread === 3 && !snowpackPairsProblems(dB, new Set(rows.keys()), rows).length && !snowpackPairsProblems(dB).length,
    JSON.stringify({ err: eB.err, a, fm: ok10 && handFm('gl_ch_alpha'), tongue: ok10 && d3(rows.get('gl_ch_alpha').hsq[0]), median: ok10 && d3(rows.get('gl_ch_alpha').hsq[1]), fc: dB?.forecast, p: dB ? snowpackPairsProblems(dB, new Set(rows.keys()), rows) : null, st: eB.status?.lines.snowpack?.pairs }));
  // a scenario without noise is the expected value — also at the station elevation, through the whole producer
  const quiet = { ...GLACIER_SNOWPACK_SPREAD_RULE, k: 10, sigma: { factor: 0, densitySystematic: 0, densityEvent: 0 } };
  const eQ = await runSp(mkJ('j-quiet'), { ...BOTH, spreadRule: quiet }, { hook: withDist(1e-9, 0) }), dQ = pairsDoc(eQ);
  add('J11 Producer: ein Szenario ohne Streuung ist der Erwartungswert — auch in Stationshöhe: mit einer Verteilung ohne Breite, Antworten ohne Temperaturfehler und einer Regel ohne Fehler an Faktor und Dichte sind p10 und p90 jedes Paars mit Spanne genau seine erwartete Schneehöhe (auch zwischen den Höhen); der Kopfblock nennt das K dieses Laufs',
    !eQ.err && !!dQ && dQ.pairs.filter((x) => x.fq).length === 3 && dQ.pairs.filter((x) => x.fq).every((x) => eq(x.fq[0], x.fm) && eq(x.fq[1], x.fm)) && dQ.forecast.spread.k === 10, JSON.stringify({ err: eQ.err, pairs: dQ?.pairs.map((x) => [x.g, x.fm, x.fq ?? x.sq]) }));
  // answers without a distribution: no spread anywhere, every pair names why
  const eN = await runSp(mkJ('j-nodist'), BOTH), dN = pairsDoc(eN);
  add('J12 Producer: nennt die Antwort keine Niederschlagsverteilung, trägt kein Paar eine Spanne — die drei auf Zeilen mit eigenem Antrieb den Vermerk „no-distribution“, das auf der Nachbar-Zeile „neighbour“; die erwartete Schneehöhe steht trotzdem an jedem Paar; der Kopf zählt 0 mit Spanne; der Vertrag gilt',
    !eN.err && !!dN && dN.pairs.length === 4 && dN.pairs.every((x) => !('fq' in x) && Array.isArray(x.fm)) && dN.pairs.filter((x) => x.sq === 'no-distribution').length === 3 && dN.pairs.filter((x) => x.sq === 'neighbour').length === 1
    && eq({ pairs: dN.forecast.pairs, none: dN.forecast.none }, { pairs: 0, none: { 'no-distribution': 3, neighbour: 1 } }) && eN.status.lines.snowpack.pairs.spread === 0 && !snowpackPairsProblems(dN, undefined, new Map(eN.doc.glaciers.map((r) => [r.id, r]))).length, JSON.stringify({ err: eN.err, fc: dN?.forecast }));
  // inputs unusable with both switches on: the snowpack with its spread stays what it is, no pairs file, the reason in the status line
  const eNoExt = await runSp(mkJ('j-noext', { withExt: false }), BOTH, wide), eNoPtr = await runSp(mkJ('j-noptr', { pointer: false }), BOTH, wide);
  add('J13 Producer, kein stiller Ersatz: ist die Zuordnung mit beiden Schaltern nicht nutzbar (ohne Abschnitt `ext`, ohne Zeiger), bleibt die Schneedecke mit ihrer Spanne Byte für Byte die des Laufs mit der Spanne allein, es entsteht kein Paar-Dokument und die Statuszeile nennt den Grund',
    !eNoExt.err && !!sRaw(eS) && sRaw(eNoExt) === sRaw(eS) && eNoExt.stateRaw === eS.stateRaw && pairsDoc(eNoExt) === null && /ohne Abschnitt ext/.test(eNoExt.status.lines.snowpack.pairs?.error ?? '')
    && !eNoPtr.err && sRaw(eNoPtr) === sRaw(eS) && pairsDoc(eNoPtr) === null && /index\.stations\.map/.test(eNoPtr.status.lines.snowpack.pairs?.error ?? ''), JSON.stringify({ ext: eNoExt.status?.lines.snowpack?.pairs, ptr: eNoPtr.status?.lines.snowpack?.pairs }));

  // --- the contract
  if (!ok10) { add('J14 Vertrag der Paare mit Vorhersage: Negativkontrollen', false, 'kein Paar-Dokument mit Vorhersage'); add('J15 Archiv: ein Paar-Dokument mit Vorhersage wird abgelegt', false, 'kein Paar-Dokument mit Vorhersage'); return; }
  const probs = (x, withRows) => snowpackPairsProblems(x, new Set(rows.keys()), withRows ? rows : undefined);
  const iOf = (gid) => dB.pairs.findIndex((x) => x.g === gid), iA = iOf('gl_ch_alpha'), iB = iOf('gl_ch_beta'), iG = iOf('gl_ch_gamma');
  const bad = [
    (x) => { delete x.forecast; }, (x) => { x.forecast.hours = [24, 48]; }, (x) => { x.forecast.origin = 'measured'; }, (x) => { x.forecast.spread.k = 5; }, (x) => { x.forecast.spread.quantiles = [25, 75]; }, (x) => { x.forecast.spread.elevation = 'mixed-quantiles'; },
    (x) => { x.forecast.spread.rule = 'guess'; }, (x) => { delete x.origins.fm; }, (x) => { x.origins.fq = 'measured'; }, (x) => { x.forecast.pairs = 4; }, (x) => { x.forecast.none.neighbour = 2; }, (x) => { x.forecast.none['no-distribution'] = 1; },
    (x) => { delete x.pairs[iA].fm; }, (x) => { x.pairs[iA].fm = [1, 2]; }, (x) => { x.pairs[iA].fm[1] = -1; }, (x) => { x.pairs[iA].fq[0][1] = x.pairs[iA].fq[1][1] + 5; }, (x) => { x.pairs[iA].fq[1].pop(); }, (x) => { x.pairs[iA].fq = [x.pairs[iA].fq[0]]; },
    (x) => { x.pairs[iA].sq = 'neighbour'; x.forecast.none.neighbour = 2; x.forecast.pairs = 2; },
    // each of the next three with the head counted as the wrong pair would have it — so that only the rule about the pair itself can notice
    (x) => { delete x.pairs[iA].fq; x.forecast.pairs = 2; }, (x) => { delete x.pairs[iG].sq; x.forecast.none = {}; }, (x) => { x.pairs[iG].sq = 'weiß nicht'; x.forecast.none = { 'weiß nicht': 1 }; },
  ];
  const caught = bad.map((edit) => { const x = structuredClone(dB); edit(x); return probs(x, false).length; });
  // … and what only the comparison with the ROWS can notice (each passes the document's own rules)
  const badRows = [
    (x) => { x.pairs[iG].sq = 'no-distribution'; x.forecast.none = { 'no-distribution': 1 }; }, (x) => { delete x.pairs[iG].sq; x.pairs[iG].fq = structuredClone(x.pairs[iB].fq); x.forecast.pairs = 4; x.forecast.none = {}; },
    (x) => { delete x.pairs[iB].fq; x.pairs[iB].sq = 'no-distribution'; x.forecast.pairs = 2; x.forecast.none['no-distribution'] = 1; },
    (x) => { x.pairs[iB].fq[1][2] += 0.1; }, (x) => { x.pairs[iB].fq = d3(rows.get('gl_ch_beta').hsq[1]); }, (x) => { x.pairs[iB].fm[0] += 0.1; }, (x) => { x.pairs[iG].fm = rows.get('gl_ch_gamma').hsd[1].slice(0, 3); },
  ];
  const caughtRows = badRows.map((edit) => { const x = structuredClone(dB); edit(x); return [probs(x, false).length, probs(x, true).length]; });
  const badPlain = [(x) => { x.pairs[0].fm = [1, 2, 3]; }, (x) => { x.pairs[0].fq = [[1, 2, 3], [2, 3, 4]]; }, (x) => { x.pairs[0].sq = 'neighbour'; }, (x) => { x.origins.fm = 'computed'; }, (x) => { x.origins.fq = 'computed'; }];
  const caughtPlain = badPlain.map((edit) => { const x = structuredClone(dP); edit(x); return snowpackPairsProblems(x).length; });
  add(`J14 Vertrag der Paare mit Vorhersage: jede von ${bad.length} Verletzungen wird gemeldet (Felder ohne Kopfblock, Stunden, Herkunft, K, Quantile, Regel der Höhe, Zählung, fehlende / zu kurze / negative Vorhersage, Spanne nicht geordnet oder unvollständig, Spanne UND Vermerk, weder Spanne noch Vermerk, unbekannter Vermerk); ${badRows.length} weitere bestehen die Regeln des Dokuments allein und fallen NUR im Vergleich mit den Zeilen auf (Vermerk nicht der der Zeile, Spanne an einer Zeile ohne Spanne, Vermerk an einer Zeile mit Spanne, unter der Zunge eine andere Spanne oder Vorhersage als die der Zunge, über der Oberkante die der Mitte); in einem Dokument OHNE Kopfblock wird jede von ${badPlain.length} Vorhersage-Angaben gemeldet`,
    caught.every((n) => n > 0) && caughtRows.every(([own, withRows]) => own === 0 && withRows > 0) && caughtPlain.every((n) => n > 0), JSON.stringify({ caught, caughtRows, caughtPlain }));
  // the archive takes the document as it is
  const pDir = join(eB.outDir, 'snowpack', 'pairs'), aOut = join(tmp, 'j-arch-out'), a1 = archivePairs({ pairsDir: pDir, archiveDir: join(tmp, 'j-arch'), outDir: aOut });
  const gz = join(aOut, `${eB.run.slice(0, 4)}-${eB.run.slice(4, 6)}-${eB.run.slice(6, 8)}`, `pairs-${eB.run}.json.gz`);
  add('J15 Archiv: ein Paar-Dokument mit Vorhersage wird abgelegt wie jedes andere — Bytes unverändert, nichts verweigert',
    eq(a1.written, [eB.run]) && a1.refused.length === 0 && existsSync(gz) && gunzipSync(readFileSync(gz)).toString('utf8') === pRaw(eB), JSON.stringify(a1));
  // GM-11 (V-GM-139): the forcing of the glaciers with a snow station — a small store: g1 own with a station, g2 on g3's forcing with a station,
  // g3 without a station (kept as the owner of g2), g4 without a station and not an owner (left out); run R2 has no snowpack document (refused)
  const st = join(tmp, 'j16-store'), R1 = '2026112417', R2 = '2026112423';
  const w = (p, o) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(o)); };
  const hr = (v) => ({ t: [[v], [v], [v]], p: [1], s: [100], sn: [[1], [1], [1]], sl: [900], w: [5] });
  for (const r of [R1, R2]) w(join(st, 'melt', 'wx', r, 'ch-west.json'), { glaciers: { g1: hr(-1), g2: { t: [[-2], [-2], [-2]] }, g3: hr(-3), g4: hr(-4) } });
  w(join(st, 'snowpack', `${R1}.json`), { runAt: 'x', engine: { version: 14 }, state: { ageH: 6 }, rules: { precip: { rule: 'country', regions: { 'ch-west': { F: 1.793 } } }, density: { rhoNew: 96 } }, glaciers: [{ id: 'g1', z: [1, 2, 3], f: 'own', hs: [1, 2, 3], swe: [1, 2, 3], hn: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }, { id: 'g2', z: [1, 2, 3], f: 'g3', hs: [1, 2, 3], swe: [1, 2, 3], hn: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }, { id: 'g4', z: [1, 2, 3], f: 'own', hs: [1, 2, 3], swe: [1, 2, 3], hn: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] }] });
  w(join(st, 'snowpack', 'pairs', `${R1}.json`), { stations: { map: 'm.1' } });
  w(join(st, 'stn', 'map', 'm.1.json'), { ext: { glaciers: { g1: { snow: ['imis:A', 1, 0] }, g2: { snow: ['imis:B', 2, 0] }, g3: { t: ['imis:A', 1, 0] } }, stations: {} } });
  const fArch = join(tmp, 'j16-arch'), fOut = join(tmp, 'j16-out');
  const f1 = archiveForcing({ storeDir: st, archiveDir: fArch, outDir: fOut });
  const fz = join(fOut, '2026-11-24', `forcing-${R1}.json.gz`), fd = existsSync(fz) ? JSON.parse(gunzipSync(readFileSync(fz)).toString('utf8')) : null;
  mkdirSync(join(fArch, '2026-11-24'), { recursive: true }); if (existsSync(fz)) writeFileSync(join(fArch, '2026-11-24', `forcing-${R1}.json.gz`), readFileSync(fz));
  const f2 = archiveForcing({ storeDir: st, archiveDir: fArch, outDir: join(tmp, 'j16-out2') }), f3 = archiveForcing({ storeDir: join(tmp, 'nirgends'), archiveDir: fArch, outDir: join(tmp, 'j16-out3') });
  add('J16 Archiv des Antriebs (V-GM-139): Zeilen nur der Gletscher mit Schneestation, Stundenwerte dazu für ihre Antriebs-Besitzer, nichts sonst; Wind bleibt draußen; ein Lauf ohne Schneedecken-Dokument wird genannt, nicht abgelegt; ein zweiter Lauf hält, ohne Daten-Ordner nichts',
    eq(f1.written, [R1]) && f1.refused.length === 1 && f1.refused[0].run === R2 && fd && eq(Object.keys(fd.rows).sort(), ['g1', 'g2']) && eq(Object.keys(fd.hourly).sort(), ['g1', 'g2', 'g3'])
      && fd.hourly.g1.w === undefined && fd.hourly.g1.sn && fd.rules.precip.regions['ch-west'] === 1.793 && fd.map === 'm.1' && f2.written.length === 0 && f2.held === 1 && f3.dir === false && f3.written.length === 0,
    JSON.stringify({ f1, f2: { written: f2.written, held: f2.held }, rows: fd && Object.keys(fd.rows), hourly: fd && Object.keys(fd.hourly) }));
});

// --- G: guard ------------------------------------------------------------------------------------------------------------------------------------
await block('G', async () => {
  const files = ['glacier/lib/snowpackcore.mjs', 'glacier/snowpack-seed.mjs', '../src/glacier/glacierSnowpackContract.ts', '../src/glacier/glacierSnowpackPairsContract.ts', 'glacier/make-snowpack-pairs-fixture.mjs'];
  const pat = /pointForecast|src\/point\//;
  add('G1 buscosun Fusion bleibt ungelesen und unberührt: Kern, Einschwing-Werkzeug und Vertrag der Schneedecke importieren nichts aus `src/pointForecast` oder `src/point`; Gegenprobe: dasselbe Muster trifft den Schmelzlauf, der die Antworten holt',
    files.every((f) => !pat.test(readFileSync(join(HERE, f), 'utf8'))) && pat.test(readFileSync(join(HERE, 'glacier', 'melt.mjs'), 'utf8')));
});

rmSync(tmp, { recursive: true, force: true });
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok || c.detail == null ? '' : `\n     ${typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail)}`}`);
const failed = checks.filter((c) => !c.ok);
console.log(`\nverify:glacier-snowpack ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
