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
 *
 * Exit 0 = all green. Last line: `verify:glacier-snowpack n/m`.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MELT, simulate, emptyState } from './glacier/lib/meltcore.mjs';
import { SNOW, SNOW_ORIGIN, packSwe, packDepthCm, packToRow, packFromRow, packProblems, emptyPack, deposit } from './glacier/lib/snowcore.mjs';
import { snowCoreSetup } from './glacier/lib/snowcal.mjs';
import { solidFraction, weatherOfGlacier, shareAtElevation, tempAtElevation } from './glacier/lib/weathercore.mjs';
import {
  SNOWPACK_DEFAULT, SNOWPACK_MODES, SNOWPACK_START_DEFAULT, snowpackModeOf, snowpackStartOf, emptyLevel, bareAlbedo, stepLevel, driveOf, normalizeLevel, levelsOfEntry, advanceEntry,
  snowpackOfGlacier, placeLevels, stateRefusal,
} from './glacier/lib/snowpackcore.mjs';
import {
  GLACIER_SNOWPACK_DAYS, GLACIER_SNOWPACK_PEND_H, GLACIER_SNOWPACK_STATE_PATH, GLACIER_SNOWPACK_NOTE, glacierSnowpackRunPath, snowpackProblems, snowpackStateProblems,
} from '../src/glacier/glacierSnowpackContract.ts';
import { glacierWeatherRunPath, glacierWeatherHourlyPath, GLACIER_WEATHER_PHASE_PATH } from '../src/glacier/glacierWeatherContract.ts';
import { main } from './glacier/melt.mjs';
import { checkPackage, pruneList, GLACIER_POLICIES, GLACIER_LINES } from './glacier/glacier-publish.mjs';
import { seedOfForcing, hourlyFromDaily, shiftOf } from './glacier/snowpack-seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = 3_600_000;
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const f64 = (a) => Float64Array.from(a, (v) => (v == null ? NaN : v));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const throws = async (f) => { try { await f(); return null; } catch (e) { return String(e?.message ?? e); } };
const tmp = mkdtempSync(join(tmpdir(), 'glacier-snowpack-'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
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
const strip = (e) => { const s = structuredClone(e.status); delete s.lines.snowpack; delete s.lines.melt.seconds; if (s.lines.weather?.levels) delete s.lines.weather.levels.seconds; const i = structuredClone(e.index); delete i.snowpack; return JSON.stringify([s, i]); };
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

// --- G: guard ------------------------------------------------------------------------------------------------------------------------------------
await block('G', async () => {
  const files = ['glacier/lib/snowpackcore.mjs', 'glacier/snowpack-seed.mjs', '../src/glacier/glacierSnowpackContract.ts'];
  const pat = /pointForecast|src\/point\//;
  add('G1 buscosun Fusion bleibt ungelesen und unberührt: Kern, Einschwing-Werkzeug und Vertrag der Schneedecke importieren nichts aus `src/pointForecast` oder `src/point`; Gegenprobe: dasselbe Muster trifft den Schmelzlauf, der die Antworten holt',
    files.every((f) => !pat.test(readFileSync(join(HERE, f), 'utf8'))) && pat.test(readFileSync(join(HERE, 'glacier', 'melt.mjs'), 'utf8')));
});

rmSync(tmp, { recursive: true, force: true });
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok || c.detail == null ? '' : `\n     ${typeof c.detail === 'string' ? c.detail : JSON.stringify(c.detail)}`}`);
const failed = checks.filter((c) => !c.ok);
console.log(`\nverify:glacier-snowpack ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
