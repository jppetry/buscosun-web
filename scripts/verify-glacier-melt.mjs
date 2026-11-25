/**
 * verify:glacier-melt — Phase GL, package GL-3 (audit/gletscher.md §GL-3): the melt core against the real glacier-year of Rhonegletscher 2024
 * (`scripts/lib/fixtures/glacier/melt-case.json`, expected values computed independently by `py/gate_c.py`), hand calculations of single hours, the
 * freezing-level lapse, the scenario sums (quantile of sums — never a sum of quantiles), the unit gate (no millimetres without a passed Gate C),
 * the repeat guard, and `melt.mjs` end to end with a stubbed buscosun Fusion (state carried, satellite nudge, class C with neighbour forcing,
 * retention 72 h, climatology missing ⇒ job red). Every rule with a negative control.
 * Block H (phase GM, GM-3b, E-GM-7; switched on 23.11., E-GM-12): the precipitation switch `--precip=gate-c|country` end to end — no word = `country`,
 * the fall back `gate-c` = the bytes as before GM-3b and the table not opened,
 * `country` = the factor of the region and no gradient (state by hand), the document names it, a table that cannot be used stops the run.
 * Block I (phase GM, GM-3d, V-GM-32): the state switch `--melt-state=ahead|run-hour` — no word = `ahead` and the bytes as before; `run-hour` = the state
 * at the run hour with its forcing, advanced by the next run whatever the distance (3, 6, 15, 24 h by hand; melt against the core), both transitions.
 * Block J (phase GM, GM-4, E-GM-22, M-18): the satellite switch `--sat-nudge=every|once` — no word = `every` and the bytes as before; `once` = a scene
 * nudges a carried state once (the state names the date of the row), a younger scene nudges again, a state that was not carried takes it again.
 * Block L (phase GM, V-GM-81): the memory of the run in the status line — the three numbers by hand, sampled once per glacier, nothing else changes.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-melt.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MELT, bandsOf, emptyState, simulate, scenarioPaths, quantile } from './glacier/lib/meltcore.mjs';
import {
  lapseOf, tempAt, fillShortGaps, forcingFromForecast, meltOfForcing, dailySums, impliedSnowline, nudgeState, seedOf, runGlacier, repeatVerdict, assertClima, main,
  MELT_SNOW_NUDGE_MM,
} from './glacier/melt.mjs';
import { fusionStageNote, fusionStage, FUSION_CURRENT } from '../src/pointForecast/fusion/fusionRelease.ts';
import { meltProblems, meltStateProblems, meltIndexOf, GLACIER_MELT_REF_DAILY_MM, GLACIER_MELT_SCENARIOS, GLACIER_MELT_RHO, GLACIER_MELT_STATE_PEND_H } from '../src/glacier/glacierMeltContract.ts';
import { meltPrecipProblems } from './glacier/lib/snowcal.mjs';
import { memWatch } from './glacier/lib/runmem.mjs';
import { GLACIER_FACTOR_DEFAULT, GLACIER_SHAPE_DEFAULT, glacierFactorModeOf, glacierShapeModeOf } from './glacier/lib/snowcalGlaciers.mjs';
import { MELT_STATE_MODES, MELT_STATE_DEFAULT, meltStateModeOf, meltStateVerdict, pendOfForcing, forcingOfPend, SAT_NUDGE_MODES, SAT_NUDGE_DEFAULT, satNudgeModeOf, satRowDue } from './glacier/lib/meltstate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = 3_600_000;
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const FX = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'melt-case.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'glacier-melt-'));

// --- A: the core against the independent calculation ---------------------------------------------------------------------------------
const bandsFx = { zb: Float64Array.from(FX.zb), w: Float64Array.from(FX.w) };
const nbFx = bandsFx.zb.length;
const wr = simulate({ bands: bandsFx, ela: FX.ela, t: Float64Array.from(FX.winter.t), g: new Float64Array(FX.winter.t.length), p: Float64Array.from(FX.winter.p, (v) => v ?? NaN), zT: FX.zT, zP: FX.zP, pf: FX.pf, TF: 0, SRF: 0, state: emptyState(nbFx), accumulateOnly: true });
const bw = wr.state.swe.reduce((s, v, b) => s + bandsFx.w[b] * v, 0);
const sumArgs = { bands: bandsFx, ela: FX.ela, t: Float64Array.from(FX.summer.t, (v) => v ?? NaN), g: Float64Array.from(FX.summer.g, (v) => v ?? NaN), p: Float64Array.from(FX.summer.p, (v) => v ?? NaN), zT: FX.zT, zP: FX.zP, pf: FX.pf, state: wr.state };
const eti = simulate({ ...sumArgs, TF: FX.TF, SRF: FX.SRF, model: 'eti' });
const ddf = simulate({ ...sumArgs, TF: 0, SRF: 0, ddf: FX.ddf, model: 'ddf' });
add('A1 Rhonegletscher 2024: Winterbilanz, Sommerbilanz (ETI) und Basislinie (Gradtage) stimmen mit der unabhängigen Rechnung von gate_c.py auf 1e-6 mm überein',
  near(bw, FX.expected.bw, 1e-6) && near(eti.balance, FX.expected.bsEti, 1e-6) && near(ddf.balance, FX.expected.bsDdf, 1e-6),
  JSON.stringify({ bw, eti: eti.balance, ddf: ddf.balance, expected: FX.expected }));
{
  const one = { bands: { zb: [3000], w: [1] }, ela: 2900, g: Float64Array.from([500]), p: Float64Array.from([0]), zT: 3000, zP: 3000, pf: 1, TF: 0.05, SRF: 0.008, state: emptyState(1), model: 'eti' };
  const warm = simulate({ ...one, t: Float64Array.from([4]) });
  // T 4 °C over ice-damped (0.85 only for T > 0 on the glacier): Ti = 3.4 > T_T; bare firn above the ELA has albedo 0.50 ⇒ 0.05 · 3.4 + 0.008 · 0.5 · 500
  add('A2 Handrechnung einer Stunde: T = 4 °C, G = 500 W/m², Firn (α 0,50) über der Gleichgewichtslinie ⇒ 0,05 · 3,4 + 0,008 · 0,5 · 500 = 2,17 mm', near(warm.meltSum, 0.05 * 3.4 + 0.008 * 0.5 * 500, 1e-9), `${warm.meltSum}`);
  const cold = simulate({ ...one, t: Float64Array.from([0.9]) });
  const edge = simulate({ ...one, t: Float64Array.from([1.0]) });
  add('A3 Schwelle T_T = 1 °C: darunter und genau darauf keine Schmelze (die Schwelle ist nichtlinear — darum stündlich)', cold.meltSum === 0 && edge.meltSum === 0 && warm.meltSum > 0, `${cold.meltSum} ${edge.meltSum}`);
  const hourly = simulate({ ...one, g: Float64Array.from([500, 500]), p: Float64Array.from([0, 0]), t: Float64Array.from([0.2, 1.6]) }).meltSum;
  const mean = simulate({ ...one, t: Float64Array.from([0.9]) }).meltSum * 2;
  add('A4 stündlich ≠ gemittelt: 0,2 und 1,6 °C schmelzen zusammen mehr als zweimal das Mittel 0,9 °C (= 0)', hourly > 0 && mean === 0, `${hourly} vs ${mean}`);
  const snow = simulate({ ...one, t: Float64Array.from([-1]), g: Float64Array.from([0]), p: Float64Array.from([2]), pf: 1.5 });
  add('A5 Schnee statt Regen: bei −1 °C fällt der Niederschlag fest (Faktor 1,5 · 2 mm · Höhengradient 1) und bleibt als Schneewasser liegen, keine Schmelze', near(snow.state.swe[0], 1.5 * 2 * (1 + (MELT.pGrad * 0) / 100), 1e-9) && snow.meltSum === 0, `${snow.state.swe[0]}`);
  const rain = simulate({ ...one, t: Float64Array.from([3]), g: Float64Array.from([0]), p: Float64Array.from([2]), pf: 1.5 });
  add('A6 Regen bei +3 °C bildet kein Schneewasser (Negativkontrolle zu A5)', rain.state.swe[0] === 0, `${rain.state.swe[0]}`);
  // phase GM (E-GM-7): the gradient of the precipitation is a parameter of the run; left out it is the set 4 % per 100 m
  const three = { bands: { zb: [2500, 3000, 3500], w: [1 / 3, 1 / 3, 1 / 3] }, ela: 2900, t: Float64Array.from([-5]), g: Float64Array.from([0]), p: Float64Array.from([2]), zT: 3000, zP: 3000, pf: 1.5, TF: 0, SRF: 0, state: emptyState(3), model: 'eti' };
  const asIs = simulate(three).state.swe, named = simulate({ ...three, pGrad: MELT.pGrad }).state.swe, flat = simulate({ ...three, pGrad: 0 }).state.swe;
  add('A7 Höhengradient des Niederschlags: ohne Angabe die gesetzten 4 % je 100 m (500 m tiefer × 0,8, 500 m höher × 1,2), mit pGrad 0 an allen Höhen dasselbe (Gegenprobe: die zwei Stellungen unterscheiden sich)',
    MELT.pGrad === 0.04 && near(asIs[0], 1.5 * 2 * 0.8, 1e-12) && near(asIs[1], 3, 1e-12) && near(asIs[2], 1.5 * 2 * 1.2, 1e-12) && asIs.every((v, i) => v === named[i]) && flat.every((v) => near(v, 3, 1e-12)) && asIs[0] !== flat[0],
    JSON.stringify({ asIs: [...asIs], flat: [...flat] }));
}

// --- B: lapse anchored on the freezing level ------------------------------------------------------------------------------------------
add('B1 Gradient: mit Nullgradgrenze 1 000 m über der Bezugshöhe und +5 °C ⇒ 0,005 K/m (aus der Säule), nicht der Standard 0,0065', near(lapseOf(5, 3000, 4000), 0.005, 1e-12), `${lapseOf(5, 3000, 4000)}`);
add('B2 Gradient: ohne Nullgradgrenze, bei T ≤ 1 °C oder mit einer Grenze nahe der Bezugshöhe gilt der Standard 0,0065 (Negativkontrolle)', lapseOf(5, 3000, null) === 0.0065 && lapseOf(0.5, 3000, 4000) === 0.0065 && lapseOf(5, 3000, 3080) === 0.0065, [lapseOf(5, 3000, null), lapseOf(0.5, 3000, 4000), lapseOf(5, 3000, 3080)].join(' '));
add('B3 Gradient auf [0,0045; 0,009] begrenzt (eine Grenze weit über der Bezugshöhe ergäbe sonst einen unphysikalisch kleinen Wert)', lapseOf(5, 3000, 9000) === 0.0045 && lapseOf(5, 3000, 3150) === 0.009, `${lapseOf(5, 3000, 9000)} ${lapseOf(5, 3000, 3150)}`);
{
  const f = { zRef: 3000, t: Float64Array.from([5, 5]), fz: Float64Array.from([4000, NaN]) };
  const t = tempAt(f, 2000);
  add('B4 Temperatur auf 2 000 m: mit Nullgradgrenze 5 + 0,005 · 1 000 = 10 °C, ohne Grenze der Standard 5 + 0,0065 · 1 000 = 11,5 °C', near(t[0], 10, 1e-9) && near(t[1], 11.5, 1e-9), `${t[0]} ${t[1]}`);
}

// --- C: forcing from a Fusion forecast ---------------------------------------------------------------------------------------------------
const T0 = Date.UTC(2026, 6, 1, 6);   // 1 July 2026 06 UTC — a day with sun
const synthFc = ({ hours = 336, tOf = (i) => 3 + 4 * Math.sin((2 * Math.PI * (i % 24)) / 24), drop = () => false, sigma = 1.5, notes = null } = {}) => ({
  cube: {
    notes: notes ?? [fusionStageNote(fusionStage(), '')],
    cells: [],
    v2: {
      point: { hTrue: 2900 },
      provenance: { runs: { t1: { run: '2026101003' }, t2: { run: '2026101000' }, t3: { run: '2026101000' }, stations: { run: '2026101003' } } },
      axis: { steps: Array.from({ length: hours }, (_, i) => i).filter((i) => !drop(i)).map((i) => ({ validAtMs: T0 + i * H, interpolated: false, vars: { t2m: { mean: tOf(i), sigma }, precip: { mean: i % 24 === 12 ? 1 : 0 }, clct: { mean: 40 } } })) },
    },
  },
});
{
  const f = forcingFromForecast(synthFc({ drop: (i) => i === 10 || i === 11 || (i >= 50 && i <= 70) }), { lat: 46.5, lon: 8.4, zRef: 3000, t0Ms: T0 });
  add('C1 Antrieb aus der Fusion-Antwort: 336 Stunden, kurze Lücken (2 h) werden linear gefüllt, eine Lücke von 21 Stunden bleibt offen (NaN), die Zahl der Stunden mit Temperatur stimmt',
    f.t.length === 336 && Number.isFinite(f.t[10]) && Number.isNaN(f.t[60]) && f.hoursWithT === 336 - 21, `n ${f.t.length} t10 ${f.t[10]} t60 ${f.t[60]} mit ${f.hoursWithT}`);
  add('C2 Strahlung folgt dem Sonnenstand: nachts (00 UTC) 0, mittags (12 UTC) > 400 W/m² (Klarhimmel × Wolkenfaktor bei 40 % Bedeckung)', f.g[6] > 400 && f.g[18] === 0 && f.g[30] > 400, `g[6] ${f.g[6]} g[18] ${f.g[18]}`);
  add('C3 Streuung der Temperatur wird übernommen; fehlt sie, setzt der Antrieb eine mit dem Vorlauf wachsende Ersatzstreuung (1 K + 0,02 K/h, höchstens 3 K) und zählt sie', near(f.sg[0], 1.5, 1e-9) && f.sigmaMissing === 23 && f.sg[60] > 1 && f.sg[60] <= 3, `sg0 ${f.sg[0]} fehlend ${f.sigmaMissing} sg60 ${f.sg[60]}`);
  add('C4 fillShortGaps: Lücke ≤ 6 gefüllt, länger offen, Randlücken offen (Negativkontrolle)', (() => { const a = fillShortGaps(Float64Array.from([1, NaN, NaN, 4, NaN, NaN, NaN, NaN, NaN, NaN, NaN, 9, NaN])); return near(a[1], 2, 1e-9) && near(a[2], 3, 1e-9) && Number.isNaN(a[6]) && Number.isNaN(a[12]); })(), '');
}

// --- D: snow state, nudge ---------------------------------------------------------------------------------------------------------------------
{
  const b5 = { zb: [2600, 2700, 2800, 2900, 3000], w: [0.2, 0.2, 0.2, 0.2, 0.2] };
  const line40 = impliedSnowline(b5, 0.4);
  add('D1 Schneeanteil → gleichwertige Linie: 40 % der Fläche liegen über 2 875 m (Unterkante des zweiten Bandes von oben), 100 % ⇒ −∞, 0 % ⇒ +∞', line40 === 2875 && impliedSnowline(b5, 1) === -Infinity && impliedSnowline(b5, 0) === Infinity, `${line40}`);
  const st = emptyState(5);
  const n1 = nudgeState(st, b5, ['2026-09-20', 0.95, 0.6, 1, 2750, 0.6, null, null, 0]);
  add('D2 Satellit setzt den Zustand: Bänder über der Schneegrenze (2 750 m) tragen Schnee (250 mm), darunter bleibt es leer; 3 Bänder geändert', st.swe.join(',') === `0,0,${MELT_SNOW_NUDGE_MM},${MELT_SNOW_NUDGE_MM},${MELT_SNOW_NUDGE_MM}` && n1 === 3, st.swe.join(','));
  const n2 = nudgeState(st, b5, ['2026-09-22', 0.95, 0.0, 2, null, 0, null, null, 0]);
  add('D3 „schneefrei“ leert alle Bänder, „schneebedeckt“ füllt sie; ohne Änderung wird 0 gemeldet', st.swe.every((v) => v === 0) && n2 === 3 && nudgeState(st, b5, ['2026-09-22', 0.95, 0.0, 2, null, 0, null, null, 0]) === 0, st.swe.join(','));
  const stB = emptyState(5);
  nudgeState(stB, b5, ['2026-09-20', 0.9, 0.4, 1, null, null, null, null, 0]);
  add('D4 Klasse B (nur Schneeanteil 40 %, keine Schneegrenze): die gleichwertige Linie 2 875 m setzt den Zustand, es entsteht keine Schneegrenze', stB.swe.join(',') === `0,0,0,${MELT_SNOW_NUDGE_MM},${MELT_SNOW_NUDGE_MM}`, stB.swe.join(','));
}

// --- E: one glacier, scenarios, unit gate -------------------------------------------------------------------------------------------------------
const hypFx = { z0: 2200, a: FX.w.map((w) => w * 17) };   // the fixture's bands as a hypsometry (km² per 50 m)
const gFx = { id: 'gl_ch_rhonegletscher', z: [2200, 2850, 3650] };
const forcingFx = forcingFromForecast(synthFc({ tOf: (i) => 2 + 4 * Math.sin((2 * Math.PI * ((i + 6) % 24)) / 24) - 0.01 * i }), { lat: 46.6, lon: 8.4, zRef: 2850, t0Ms: T0 });
forcingFx.from = 'own';
const params = { pf: FX.pf, TF: FX.TF, SRF: FX.SRF };
const rowOf = (unit, run = '2026070106', forcing = forcingFx) => runGlacier({ g: gFx, hyp: hypFx, forcing, params, state: null, ela: FX.ela, run, unit });
const off = rowOf(false), on = rowOf(true);
const docOf = (rows, unit) => ({ schema: 1, kind: 'glacier/melt', run: '2026070106', runAt: '2026-07-01T06:30:00Z', origin: 'model', engine: { name: 'buscosun Fusion 12', version: 12, stageCurrent: true }, cube: {}, params: { ...params, origin: { pf: 'measured', TF: 'measured', SRF: 'measured' }, report: 'x' }, gate: { unit, reason: 'Test' }, scenarios: { k: GLACIER_MELT_SCENARIOS, rho: GLACIER_MELT_RHO, origin: 'set', sums: 'scenarios' }, ref: { dailyMm: GLACIER_MELT_REF_DAILY_MM, origin: 'set' }, state: { source: 'cold', ageH: null, nudged: 0 }, build: '20261011-2', glaciers: rows, skipped: [] });
add('E1 Einheit gesperrt (Gate C nicht bestanden): die Zeile trägt nur den Index — kein Feld mm, s7, s14; 14 Tage in Dreiergruppen p10 ≤ p50 ≤ p90 im Bereich 0–100',
  off.row.mm === undefined && off.row.s7 === undefined && off.row.s14 === undefined && off.row.idx.length === 14 && off.row.idx.every((t) => t[0] <= t[1] && t[1] <= t[2] && t[0] >= 0 && t[2] <= 100) && meltProblems(docOf([off.row], false)).length === 0,
  JSON.stringify(off.row).slice(0, 300));
add('E2 Einheit freigegeben: mm je Tag und die 7- und 14-Tage-Summen sind da und der Vertrag nimmt sie nur mit freigegebener Einheit an (Negativkontrolle: dieselbe Zeile in einem Dokument mit gesperrter Einheit wird abgelehnt)',
  on.row.mm?.length === 14 && on.row.s7 && on.row.s14 && meltProblems(docOf([on.row], true)).length === 0 && meltProblems(docOf([on.row], false)).some((p) => /Millimeter ohne freigegebene Einheit/.test(p)),
  JSON.stringify(meltProblems(docOf([on.row], false))));
// independent recomputation of the scenario sums
const bandsR = bandsOf(hypFx);
const pathsR = scenarioPaths(forcingFx.t, forcingFx.sg, GLACIER_MELT_SCENARIOS, GLACIER_MELT_RHO, seedOf('2026070106', gFx.id));
const sums7 = [], sums14 = [], daily = [];
for (const path of pathsR) {
  const r = meltOfForcing({ bands: bandsR, ela: FX.ela, forcing: forcingFx, params, state: emptyState(bandsR.zb.length), tOverride: path });
  const d = dailySums(r.meltH);
  daily.push(d); sums7.push(d.slice(0, 7).reduce((a, b) => a + b, 0)); sums14.push(d.reduce((a, b) => a + b, 0));
}
const q = (a, p) => quantile(Float64Array.from(a).sort(), p);
add('E3 Die Spanne der 7- und 14-Tage-Summe ist das Quantil der Summen der 40 Szenarien (unabhängig nachgerechnet, auf 0,1 mm)',
  near(on.row.s7[0], q(sums7, 0.1), 0.06) && near(on.row.s7[1], q(sums7, 0.5), 0.06) && near(on.row.s7[2], q(sums7, 0.9), 0.06) && near(on.row.s14[1], q(sums14, 0.5), 0.06) && near(on.row.s14[2], q(sums14, 0.9), 0.06),
  JSON.stringify({ s7: on.row.s7, own: [q(sums7, 0.1), q(sums7, 0.5), q(sums7, 0.9)] }));
const sumP10 = on.row.mm.slice(0, 7).reduce((s, t) => s + t[0], 0), sumP90 = on.row.mm.slice(0, 7).reduce((s, t) => s + t[2], 0);
add('E4 Keine addierten Quantile: die Summe der Tages-p10 liegt UNTER dem p10 der Summe, die Summe der Tages-p90 ÜBER dem p90 der Summe (zeitlich korrelierte Szenarien) — eine Spanne aus Tagesquantilen wäre falsch',
  sumP10 < on.row.s7[0] - 0.5 && sumP90 > on.row.s7[2] + 0.5, `Σp10 ${sumP10.toFixed(1)} < ${on.row.s7[0]} und Σp90 ${sumP90.toFixed(1)} > ${on.row.s7[2]}`);
const again = rowOf(true), other = rowOf(true, '2026070112');
add('E5 Reproduzierbar: derselbe Lauf liefert dieselbe Zeile (Saat aus Lauf und Gletscher); ein anderer Lauf zieht andere Szenarien (Negativkontrolle)', JSON.stringify(again.row) === JSON.stringify(on.row) && JSON.stringify(other.row.s14) !== JSON.stringify(on.row.s14), '');
{
  const warmF = { ...forcingFx, t: forcingFx.t.map((v) => v + 1.5) };
  const coldF = { ...forcingFx, t: forcingFx.t.map(() => -6) };
  const w = rowOf(false, '2026070106', warmF), c = rowOf(false, '2026070106', coldF);
  add('E6 Physik: 1,5 K wärmer ⇒ mittlerer 14-Tage-Index höher; bei −6 °C den ganzen Zeitraum ist der Index überall 0 (Negativkontrolle gegen einen immer positiven Index)', w.row.ix14[1] > off.row.ix14[1] && c.row.idx.every((t) => t[2] === 0) && c.row.ix14[2] === 0, `${off.row.ix14[1]} → ${w.row.ix14[1]}; kalt ${JSON.stringify(c.row.ix14)}`);
}
add('E7 Eisanteil, Nullgradgrenze, Nächte: Kaltstart ohne Schnee ⇒ alles unter der Gleichgewichtslinie ist Eis (≈ 55 % der Fläche), die Zeile trägt 14 Tageswerte der Nullgradgrenze und eine ganze Zahl frostfreier Nächte',
  on.row.ice >= 30 && on.row.ice <= 80 && on.row.zf.length === 14 && Number.isInteger(on.row.nf) && on.row.nf >= 0 && on.row.nf <= 14, `ice ${on.row.ice} nf ${on.row.nf}`);
add('E8 Index: 100 = 30 mm w. e. pro Tag (gesetzt), unter 0 und über 100 abgeschnitten, ganze Zahlen', meltIndexOf(30) === 100 && meltIndexOf(15) === 50 && meltIndexOf(0) === 0 && meltIndexOf(90) === 100 && meltIndexOf(-3) === 0, '');
add('E9 Vertrag: Herkunft immer „model“ (nie „measured“), Summen „scenarios“, Szenarienzahl ≥ 20 — Negativkontrollen werden abgelehnt',
  meltProblems({ ...docOf([off.row], false), origin: 'measured' }).length > 0 && meltProblems({ ...docOf([off.row], false), scenarios: { k: 40, rho: 0.9, origin: 'set', sums: 'quantiles' } }).length > 0 && meltProblems({ ...docOf([off.row], false), scenarios: { k: 5, rho: 0.9, origin: 'set', sums: 'scenarios' } }).length > 0, '');
add('E10 Zustandsdatei: negatives Schneewasser und Bandzahlen ungleich werden abgelehnt', meltStateProblems({ schema: 1, kind: 'glacier/melt-state', atMs: 1, g: { a: [[1, -2], [500, 500]] } }).length > 0 && meltStateProblems({ schema: 1, kind: 'glacier/melt-state', atMs: 1, g: { a: [[1, 2], [500]] } }).length > 0 && meltStateProblems({ schema: 1, kind: 'glacier/melt-state', atMs: 1, g: { a: [[1, 2], [500, 500]] } }).length === 0, '');

{
  // freezing level: from the cube's levels where it has them, else from the temperature at the glacier with the standard lapse (named in `zs`)
  const withCells = { ...forcingFx, fz: Float64Array.from(forcingFx.fz, () => 3900) };
  const c = rowOf(false, '2026070106', withCells);
  const day0 = Math.max(...Array.from({ length: 24 }, (_, h) => forcingFx.t[h]));
  const expect = Math.round(Math.min(7000, Math.max(0, 2850 + day0 / 0.0065)));
  add('E11 Nullgradgrenze: ohne Druckflächenwerte aus Temperatur und Standardgradient (zs = lapse, Tagesmaximum = Bezugshöhe + T/0,0065), mit Druckflächenwerten diese (zs = cells, 3 900 m) — die Herkunft steht in der Zeile',
    off.row.zs === 'lapse' && Math.abs(off.row.zf[0] - expect) <= 1 && c.row.zs === 'cells' && c.row.zf[0] === 3900 && meltProblems(docOf([c.row], false)).length === 0 && meltProblems(docOf([{ ...c.row, zs: 'x' }], false)).length > 0,
    `${off.row.zs} ${off.row.zf[0]} (erwartet ${expect}); ${c.row.zs} ${c.row.zf[0]}`);
}

// --- F: repeat guard -----------------------------------------------------------------------------------------------------------------------------
{
  const prev = { run: '2026101004', runAt: '2026-10-10T04:30:00Z', engine: { version: FUSION_CURRENT }, cube: { t1: 'a', t2: 'b', t3: 'c' } };
  const now = Date.parse('2026-10-10T06:00:00Z');
  const v1 = repeatVerdict({ prev, offered: { t2: 'b', t3: 'c' }, nowMs: now });
  const v2 = repeatVerdict({ prev, offered: { t2: 'b2', t3: 'c' }, nowMs: now });
  const v3 = repeatVerdict({ prev, offered: { t2: 'b2', t3: 'c' }, nowMs: now, runsToday: 4 });
  const v4 = repeatVerdict({ prev, offered: { t2: 'b', t3: 'c' }, nowMs: now + 13 * H });
  const v5 = repeatVerdict({ prev: { ...prev, engine: { version: FUSION_CURRENT - 1 } }, offered: { t2: 'b', t3: 'c' }, nowMs: now });
  add('F1 Wiederholungsschutz: gleiche Läufe t2/t3 ⇒ übersprungen; neuer t2 ⇒ Lauf; schon 4 Läufe heute ⇒ übersprungen; letzter Lauf älter als 12 h ⇒ Lauf; älterer Stand von buscosun Fusion ⇒ Lauf; --always erzwingt',
    !v1.run && v2.run && !v3.run && v4.run && v5.run && repeatVerdict({ prev, offered: { t2: 'b', t3: 'c' }, nowMs: now, always: true }).run && repeatVerdict({ prev: null, offered: {}, nowMs: now }).run,
    [v1, v2, v3, v4, v5].map((v) => `${v.run}:${v.reason}`).join(' | '));
}

// --- G: melt.mjs end to end with a stubbed Fusion -----------------------------------------------------------------------------------------------
const mkTree = (root, { runsOld = [] } = {}) => {
  const data = join(root, 'data'), cube = join(root, 'cube');
  const build = '20261011-9', region = 'ch-test';
  mkdirSync(join(data, 'static', build, 'hypso'), { recursive: true });
  mkdirSync(join(cube, 'point'), { recursive: true });
  const cat = [
    { id: 'gl_ch_alpha', name: 'Alpha', country: 'CH', region, klass: 'A', area: { km2: 3 }, z: [2400, 2900, 3400], lat: 46.5, lon: 8.4, lead: true },
    { id: 'gl_ch_beta', name: 'Beta', country: 'CH', region, klass: 'B', area: { km2: 0.5 }, z: [2500, 2800, 3100], lat: 46.52, lon: 8.45 },
    { id: 'gl_ch_gamma', name: 'Gamma', country: 'CH', region, klass: 'C', area: { km2: 0.05 }, z: [2600, 2750, 2900], lat: 46.51, lon: 8.42 },
    { id: 'gl_ch_delta', name: 'Delta', country: 'CH', region, klass: 'B', area: { km2: 0.5 }, z: [2500, 2800, 3100], lat: 46.53, lon: 8.46 },
    { id: 'gl_ch_far', name: 'Far', country: 'CH', region: 'ch-far', klass: 'C', area: { km2: 0.05 }, z: [2600, 2750, 2900], lat: 46.0, lon: 9.9 },
  ];
  writeFileSync(join(data, 'static', build, 'catalog.json'), JSON.stringify({ build, glaciers: cat }));
  const hyp = (z0) => ({ z0, a: [0.1, 0.3, 0.5, 0.6, 0.5, 0.3, 0.2, 0.1], zr: [z0, z0 + 400], cov: 1 });
  writeFileSync(join(data, 'static', build, 'hypso', `${region}.json`), JSON.stringify({ schema: 1, kind: 'glacier/hypso', build, region, bandM: 50, glaciers: { gl_ch_alpha: hyp(2400), gl_ch_beta: hyp(2500), gl_ch_gamma: hyp(2600) } }));   // delta has no hypsometry
  mkdirSync(join(data, 'static', build, 'hypso'), { recursive: true });
  writeFileSync(join(data, 'static', build, 'hypso', 'ch-far.json'), JSON.stringify({ schema: 1, kind: 'glacier/hypso', build, region: 'ch-far', bandM: 50, glaciers: { gl_ch_far: hyp(2600) } }));
  writeFileSync(join(data, 'index.json'), JSON.stringify({ schema: 1, static: { build }, updatedAt: '2026-10-10T00:00:00Z' }));
  writeFileSync(join(cube, 'point', 'index.json'), JSON.stringify({ latestByTier: { t1: { run: '2026101003' }, t2: { run: '2026101000' }, t3: { run: '2026101000' } } }));
  for (const [run, runAt] of runsOld) {
    mkdirSync(join(data, 'melt'), { recursive: true });
    writeFileSync(join(data, 'melt', `${run}.json`), JSON.stringify({ run, runAt, kind: 'glacier/melt' }));
  }
  const calFile = join(root, 'cal.json');
  writeFileSync(calFile, JSON.stringify({ schema: 1, fit: { pf: 1.2, TF: 0.05, SRF: 0.008 }, gate: { unit: false, reason: 'Test: Gate C nicht bestanden' }, report: 'test' }));
  return { data, cube, calFile, build };
};
const NOW = Date.parse('2026-10-10T04:30:00Z');
const T0N = Math.floor(NOW / H) * H;
const calls = [];
const forecast = async (o) => {
  calls.push(o);
  const fc = synthFc({ tOf: (i) => 0 + 3 * Math.sin((2 * Math.PI * ((i + 6) % 24)) / 24) });
  fc.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = T0N + i * H; });
  return fc;
};
const okIo = () => ({ clima: async () => ({}), store: null });
// since 23.11. (E-GM-12) a run without the switch uses the factor per country; the blocks up to G compute by hand with the factor of Gate C and 4 % per 100 m,
// so they name the fall back `gate-c` (GATE_C). The switch itself, default included, is block H.
const GATE_C = { precip: 'gate-c' };
const run1 = async (root, extra = {}) => main({ data: join(root, 'data'), cube: join(root, 'cube'), out: join(root, 'out'), calibration: join(root, 'cal.json'), now: new Date(NOW).toISOString(), forecast, ioFactory: okIo, always: true, ...GATE_C, ...extra });
const root1 = join(tmp, 't1'); const tr1 = mkTree(root1);
mkdirSync(join(tr1.data, 'melt'), { recursive: true });
const r1 = await run1(root1, { 'archive-out': join(root1, 'archive-out'), calibration: tr1.calFile });
const doc1 = JSON.parse(readFileSync(join(root1, 'out', 'melt', `${r1.run}.json`), 'utf8'));
const byId = Object.fromEntries(doc1.glaciers.map((r) => [r.id, r]));
add('G1 Lauf Ende zu Ende (Fusion als Attrappe): Dokument besteht den Vertrag, Herkunft model, Stand von buscosun Fusion benannt, Einheit gesperrt ⇒ nirgends ein mm-Feld, Zustandsdatei und Patches geschrieben',
  meltProblems(doc1).length === 0 && doc1.origin === 'model' && doc1.engine.name === `buscosun Fusion ${FUSION_CURRENT}` && doc1.gate.unit === false && doc1.glaciers.every((r) => r.mm === undefined)
  && existsSync(join(root1, 'out', 'melt', 'state.json')) && existsSync(join(root1, 'patch', 'index-patch.json')) && existsSync(join(root1, 'patch', 'status-patch.json')),
  JSON.stringify({ run: r1.run, problems: meltProblems(doc1).slice(0, 3), engine: doc1.engine }));
add('G2 Klasse C nimmt den Antrieb des nächsten Gletschers der Klasse A/B derselben Region (eigene Bänder, fremder Antrieb), nur A und B rufen die Fusion (3 Aufrufe: alpha, beta, delta fällt vorher aus), „far“ ohne Nachbarn im Umkreis von 60 km bekommt einen eigenen Fusion-Punkt (nie übersprungen)',
  byId.gl_ch_gamma?.f === 'gl_ch_alpha' && byId.gl_ch_alpha?.f === 'own' && byId.gl_ch_far?.f === 'own' && !doc1.skipped.some((s) => s.id === 'gl_ch_far'), JSON.stringify({ f: doc1.glaciers.map((r) => [r.id, r.f]), skipped: doc1.skipped, calls: calls.length }));
add('G3 Gletscher ohne Hypsometrie wird mit Grund übersprungen (kein Ersatzwert, keine Zeile)', doc1.skipped.some((s) => s.id === 'gl_ch_delta' && s.reason === 'no-hypsometry') && !byId.gl_ch_delta, JSON.stringify(doc1.skipped));
add('G4 Archiv: die Leitgletscher des Laufs gehen als eigene Datei ins Archivverzeichnis (nur alpha ist Leitgletscher)', (() => { const f = join(root1, 'archive-out', `melt-${r1.run}.json`); if (!existsSync(f)) return false; const a = JSON.parse(readFileSync(f, 'utf8')); return a.glaciers.length === 1 && a.glaciers[0].id === 'gl_ch_alpha'; })(), '');
// second run with the same cube inputs: repeat ⇒ skipped; needs the pointer in the index
{
  const ix = JSON.parse(readFileSync(join(tr1.data, 'index.json'), 'utf8'));
  const patch = JSON.parse(readFileSync(join(root1, 'patch', 'index-patch.json'), 'utf8'));
  writeFileSync(join(tr1.data, 'index.json'), JSON.stringify({ ...ix, ...patch }));
  cpSync(join(root1, 'out', 'melt'), join(tr1.data, 'melt'), { recursive: true });
  const rep = await main({ data: tr1.data, cube: tr1.cube, out: join(root1, 'out2'), calibration: tr1.calFile, now: new Date(NOW + 1 * H).toISOString(), forecast, ioFactory: okIo, ...GATE_C });
  add('G5 Zweiter Aufruf mit unveränderten t2/t3 schreibt nichts (übersprungen mit Grund), ein neuer t2 startet den Lauf', rep.skipped === true && /unverändert/.test(rep.reason) && !existsSync(join(root1, 'out2')), JSON.stringify(rep));
  writeFileSync(join(tr1.cube, 'point', 'index.json'), JSON.stringify({ latestByTier: { t1: { run: '2026101006' }, t2: { run: '2026101006' }, t3: { run: '2026101000' } } }));
  const T1 = NOW + 6 * H;
  const r2 = await main({ data: tr1.data, cube: tr1.cube, out: join(root1, 'out3'), calibration: tr1.calFile, now: new Date(T1).toISOString(), forecast: async (o) => { const fc = await forecast(o); fc.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = Math.floor(T1 / H) * H + i * H; }); return fc; }, ioFactory: okIo, ...GATE_C });
  const d2 = JSON.parse(readFileSync(join(root1, 'out3', 'melt', `${r2.run}.json`), 'utf8'));
  add('G6 Neuer Lauf: der Zustand des vorigen Laufs wird übernommen (carried, Alter 0 h bei Lauf + 6 h), das alte Dokument bleibt (72 h), der neue kommt dazu', d2.state.source === 'carried' && d2.state.ageH === 0 && existsSync(join(root1, 'out3', 'melt', `${r1.run}.json`)) && existsSync(join(root1, 'out3', 'melt', `${r2.run}.json`)), JSON.stringify(d2.state));
  // state older than 30 h ⇒ cold, named
  const r3 = await main({ data: tr1.data, cube: tr1.cube, out: join(root1, 'out4'), calibration: tr1.calFile, now: new Date(NOW + 40 * H).toISOString(), forecast: async (o) => { const fc = await forecast(o); fc.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = Math.floor((NOW + 40 * H) / H) * H + i * H; }); return fc; }, ioFactory: okIo, always: true, ...GATE_C });
  const d3 = JSON.parse(readFileSync(join(root1, 'out4', 'melt', `${r3.run}.json`), 'utf8'));
  add('G7 Zustand älter als 30 h wird nicht fortgeschrieben: Kaltstart, benannt (source cold, kein Alter)', d3.state.source === 'cold' && d3.state.ageH === null && existsSync(join(root1, 'out4', 'melt', 'state.json')), JSON.stringify(d3.state));
}
// retention
{
  const root = join(tmp, 't2');
  const tr = mkTree(root, { runsOld: [['2026100622', '2026-10-06T22:30:00Z'], ['2026100705', '2026-10-07T05:30:00Z'], ['2026100916', '2026-10-09T16:30:00Z']] });
  await run1(root, { calibration: tr.calFile });
  const kept = readdirSync(join(root, 'out', 'melt')).sort();
  add('G8 Aufbewahrung 72 h: der Lauf vom 06.10. 22 UTC (78 h alt) fällt heraus, der vom 07.10. 05 UTC (71 h) und der vom 09.10. 16 UTC bleiben', !kept.includes('2026100622.json') && kept.includes('2026100705.json') && kept.includes('2026100916.json') && kept.includes('2026101004.json') && kept.includes('state.json'), kept.join(' '));
}
// satellite nudge: a recent row nudges, an old one does not
{
  const mk = async (rowDate) => {
    const root = join(tmp, `t3-${rowDate}`);
    const tr = mkTree(root);
    const ix = JSON.parse(readFileSync(join(tr.data, 'index.json'), 'utf8'));
    writeFileSync(join(tr.data, 'index.json'), JSON.stringify({ ...ix, sat: { updatedAt: '2026-10-09T00:00:00Z', newest: {}, seasons: { 2026: { 'ch-test': '20261009T0000Z' } } } }));
    mkdirSync(join(tr.data, 'season', '2026', 'ch-test'), { recursive: true });
    writeFileSync(join(tr.data, 'season', '2026', 'ch-test', '20261009T0000Z.json'), JSON.stringify({ schema: 1, kind: 'glacier/season', year: 2026, region: 'ch-test', stand: '20261009T0000Z', cols: [], glaciers: { gl_ch_alpha: [[rowDate, 0.95, 0.5, 1, 2600, 0.4, null, null, 0]] } }));
    await run1(root, { calibration: tr.calFile });
    return JSON.parse(readFileSync(join(root, 'out', 'melt', '2026101004.json'), 'utf8'));
  };
  const fresh = await mk('2026-09-28'), stale = await mk('2026-09-10');
  add('G9 Satelliten-Nudge: eine klare Szene vom 28.09. (12 Tage alt) setzt den Zustand des Gletschers (1 Gletscher), eine vom 10.09. (30 Tage) nicht (Negativkontrolle)', fresh.state.nudged === 1 && stale.state.nudged === 0, `${fresh.state.nudged} / ${stale.state.nudged}`);
}
// climatology missing ⇒ the job is red
{
  const root = join(tmp, 't4'); const tr = mkTree(root);
  let err = null;
  try { await main({ data: tr.data, cube: tr.cube, out: join(root, 'out'), calibration: tr.calFile, now: new Date(NOW).toISOString(), forecast, ioFactory: () => ({ clima: async () => null }), always: true, ...GATE_C }); } catch (e) { err = String(e.message ?? e); }
  let err2 = null; try { await assertClima({ clima: async () => ({}) }); } catch (e) { err2 = e; }
  add('G10 Ohne Klimatologie (public/climaGrid.json) bricht der Lauf mit Fehler ab (roter Job, Lehre V-SW-18) und schreibt nichts; mit Klimatologie kein Fehler (Gegenprobe)', /Klimatologie/.test(err ?? '') && !existsSync(join(root, 'out')) && err2 === null, String(err));
}
// --- H: phase GM (GM-3b, E-GM-7) — the precipitation switch, end to end ---------------------------------------------------------------------------
{
  const realTable = JSON.parse(readFileSync(join(HERE, 'glacier', 'snow-calibration.json'), 'utf8'));
  // the real table in the form the producer reads, with the two regions of the test catalogue (one Swiss value, one Austrian)
  const tableFor = (edit = null) => { const t = structuredClone(realTable); t.precip.regions = { 'ch-test': { ...realTable.precip.regions['ch-ost'] }, 'ch-far': { ...realTable.precip.regions['at-dachstein'] } }; edit?.(t); return t; };
  const F = { 'ch-test': realTable.precip.regions['ch-ost'].F, 'ch-far': realTable.precip.regions['at-dachstein'].F };
  // cold and wet: −2 °C at the reference elevation, 3 mm every hour — snow at every band, no melt (at most 1,09 °C at the lowest band: 0,85 · 1,09 < 1 °C)
  const snowFc = async () => { const fc = synthFc({ tOf: () => -2 }); fc.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = T0N + i * H; s.vars.precip.mean = 3; }); return fc; };
  const runSw = async (name, extra = {}, table = tableFor()) => {
    const root = join(tmp, name); const tr = mkTree(root);
    const tf = join(root, 'snowcal.json');
    if (table) writeFileSync(tf, JSON.stringify(table));
    let r = null, err = null;
    try { r = await main({ data: tr.data, cube: tr.cube, out: join(root, 'out'), calibration: tr.calFile, now: new Date(NOW).toISOString(), forecast: snowFc, ioFactory: okIo, always: true, weather: '0', snowcal: tf, ...extra }); } catch (e) { err = String(e.message ?? e); }
    if (err) return { err, wrote: existsSync(join(root, 'out')) };
    const read = (rel) => readFileSync(join(root, rel), 'utf8');
    const status = JSON.parse(read('patch/status-patch.json')); delete status.lines.melt.seconds; delete status.lines.melt.mem;
    return { r, docRaw: read(`out/melt/${r.run}.json`), doc: JSON.parse(read(`out/melt/${r.run}.json`)), stateRaw: read('out/melt/state.json'), state: JSON.parse(read('out/melt/state.json')).g, index: read('patch/index-patch.json'), status };
  };
  const same = (a, b) => a.docRaw === b.docRaw && a.stateRaw === b.stateRaw && a.index === b.index && JSON.stringify(a.status) === JSON.stringify(b.status);
  // by hand: after the 6 hours of the state, every band holds 6 · 3 mm · factor · gradient · solid share (rounded to 0,1 mm in the file)
  const hypZb = (z0) => Array.from({ length: 8 }, (_, i) => z0 + 50 * (i + 0.5));
  const sweByHand = (z0, zRef, pf, grad) => hypZb(z0).map((z) => { const Tb = -2 + 0.0065 * (zRef - z); return 18 * pf * (1 + (grad * (z - zRef)) / 100) * Math.min(1, Math.max(0, (2 - Tb) / 2)); });
  const stateIs = (s, id, hand) => !!s?.[id] && s[id][0].length === 8 && s[id][0].every((v, i) => Math.abs(v - hand[i]) <= 0.051);
  const cases = [['gl_ch_alpha', 2400, 2900, 'ch-test'], ['gl_ch_gamma', 2600, 2900, 'ch-test'], ['gl_ch_far', 2600, 2750, 'ch-far']];   // gamma: own bands, alpha's forcing (reference elevation 2 900 m)

  // switched on 23.11. (E-GM-12): no word = `country`; `gate-c` is the fall back and does not need the table
  const on = await runSw('sw-on'), onNamed = await runSw('sw-on-named', { precip: 'country' }), off = await runSw('sw-off', { precip: 'gate-c' }), offNoTable = await runSw('sw-off-notable', { precip: 'gate-c' }, null);
  const onNoTable = await runSw('sw-on-notable', {}, null), onRealTable = await runSw('sw-on-realtable', { snowcal: undefined });
  add('H1 Voreinstellung „country“ (eingeschaltet 23.11., E-GM-12): ohne Angabe dieselben Bytes wie mit „country“ (Dokument, Zustand, Zeiger, Statuszeile); der Rückfall „gate-c“ schreibt andere Dateien, öffnet die Tabelle nicht (OHNE Tabellendatei dieselben Bytes), trägt kein Feld params.precip und keine Angabe in der Statuszeile; ohne Angabe und ohne Tabellendatei bricht der Lauf ab; ohne --snowcal liest er die Tabelle des Repos (die den Testkatalog nicht kennt ⇒ Abbruch mit der Region)',
    !on.err && !onNamed.err && !off.err && !offNoTable.err && same(on, onNamed) && same(off, offNoTable) && off.doc.params.precip === undefined && !('precip' in off.status.lines.melt) && off.r.precip === undefined
    && on.docRaw !== off.docRaw && on.stateRaw !== off.stateRaw && /nicht lesbar/.test(onNoTable.err ?? '') && onNoTable.wrote === false && /Region ch-(test|far) fehlt/.test(onRealTable.err ?? '') && onRealTable.wrote === false,
    JSON.stringify({ err: [on.err, onNamed.err, off.err, offNoTable.err, onNoTable.err, onRealTable.err] }));
  add('H2 der Rückfall „gate-c“ rechnet wie vor GM-3b: der Schneezustand nach 6 Stunden ist von Hand 6 · 3 mm · 1,2 · (1 + 4 % je 100 m ab der Bezugshöhe) · Schneeanteil — an drei Gletschern, alle Bänder; Gegenprobe: dieselbe Handrechnung ohne Gradient passt nicht',
    cases.every(([id, z0, zRef]) => stateIs(off.state, id, sweByHand(z0, zRef, 1.2, 0.04))) && !stateIs(off.state, 'gl_ch_alpha', sweByHand(2400, 2900, 1.2, 0)), JSON.stringify({ alpha: off.state?.gl_ch_alpha?.[0], hand: sweByHand(2400, 2900, 1.2, 0.04) }));
  add('H3 „country“ (auch ohne Angabe): derselbe Zustand von Hand mit dem F der Region aus der Tabelle (Schweiz 1,793, Österreich 2,326) und OHNE Gradient — auch am Gletscher mit Nachbar-Antrieb zählt die eigene Region; Gegenprobe: mit 4 % oder mit dem Faktor der anderen Region passt es nicht',
    !on.err && F['ch-test'] === 1.793 && F['ch-far'] === 2.326 && cases.every(([id, z0, zRef, region]) => stateIs(on.state, id, sweByHand(z0, zRef, F[region], 0)))
    && !stateIs(on.state, 'gl_ch_alpha', sweByHand(2400, 2900, F['ch-test'], 0.04)) && !stateIs(on.state, 'gl_ch_far', sweByHand(2600, 2750, F['ch-test'], 0)), JSON.stringify({ far: on.state?.gl_ch_far?.[0], hand: sweByHand(2600, 2750, F['ch-far'], 0) }));
  const blk = on.doc?.params?.precip;
  add('H4 das Dokument nennt, womit gerechnet wurde: params.precip mit Regel, F je Region samt Herkunft, Gradient 0 (set), Brücke 1 (set), Urteil der Eichung (gate false mit Grund) und Hash der Methode; params.pf bleibt als Zahl stehen (ältere Leser), der Vertrag der Seite nimmt das Dokument, Statuszeile und Rückgabe nennen „country“',
    blk?.rule === 'country' && blk.replaces === 'pf' && blk.regions['ch-test'].F === F['ch-test'] && blk.regions['ch-far'].F === F['ch-far'] && blk.regions['ch-test'].origin === 'measured' && blk.regions['ch-test'].from === 'CH'
    && blk.gradient === 0 && blk.origin.gradient === 'set' && blk.bridge === 1 && blk.origin.bridge === 'set' && blk.gate === false && /K-2/.test(blk.reason) && blk.method === realTable.method.sha256
    && on.doc.params.pf === 1.2 && meltProblems(on.doc).length === 0 && meltPrecipProblems(blk, ['ch-test', 'ch-far']).length === 0 && on.status.lines.melt.precip === 'country' && on.r.precip === 'country', JSON.stringify(blk ?? on.err));
  // environment variable; the argument wins
  process.env.GLACIER_SNOW_PRECIP = 'gate-c';
  const envOff = await runSw('sw-env'), envArg = await runSw('sw-env-arg', { precip: 'country' });
  delete process.env.GLACIER_SNOW_PRECIP;
  add('H5 Umgebungsvariable GLACIER_SNOW_PRECIP=gate-c schreibt dieselben Bytes wie der Schalter „gate-c“ (der Rückfall ohne Code-Änderung); ein Schalter „country“ daneben gewinnt (dieselben Bytes wie die Voreinstellung)', !envOff.err && !envArg.err && same(envOff, off) && same(envArg, on), JSON.stringify({ err: [envOff.err, envArg.err] }));
  // stops: nothing is written, the reason is named
  const word = await runSw('sw-word', { precip: 'region' }), noFile = await runSw('sw-nofile', { precip: 'country' }, null);
  const noRegion = await runSw('sw-noregion', { precip: 'country' }, tableFor((t) => { delete t.precip.regions['ch-far']; }));
  const broken = await runSw('sw-broken', { precip: 'country' }, tableFor((t) => { t.precip.gate = true; }));
  const wild = await runSw('sw-wild', { precip: 'country' }, tableFor((t) => { t.precip.regions['ch-test'].F = 7; }));
  add('H6 „country“ fällt nie still zurück: unbekanntes Wort, fehlende Tabelle, Tabelle ohne eine Region des Katalogs, Tabelle gegen ihre Regeln (gate widerspricht dem Urteil; F außerhalb der Grenzen) ⇒ Abbruch mit Grund, nichts geschrieben',
    /unbekannte Stellung „region“.*gate-c, country/.test(word.err ?? '') && /nicht lesbar/.test(noFile.err ?? '') && /Region ch-far fehlt/.test(noRegion.err ?? '') && /gate widerspricht/.test(broken.err ?? '') && /F 7 außerhalb/.test(wild.err ?? '')
    && [word, noFile, noRegion, broken, wild].every((x) => x.wrote === false), JSON.stringify([word.err, noFile.err, noRegion.err, broken.err, wild.err]));
  const bad = (f) => { const b = structuredClone(blk); f(b); return meltPrecipProblems(b, ['ch-test', 'ch-far']).length; };
  const caught = blk ? [(b) => { b.gradient = 0.04; }, (b) => { b.origin.gradient = 'measured'; }, (b) => { delete b.reason; }, (b) => { b.regions['ch-test'].F = 9; }, (b) => { delete b.regions['ch-far']; }, (b) => { b.method = 'x'; }, (b) => { b.rule = 'region'; }, (b) => { delete b.bridge; }].map(bad) : [];
  add('H7 Regeln des Blocks params.precip: acht Verletzungen, jede gemeldet; ein Dokument ohne den Block hat keine — außer es stammt aus einem Lauf mit „country“ (dann fehlt er)',
    caught.length === 8 && caught.every((n) => n > 0) && meltPrecipProblems(undefined).length === 0 && meltPrecipProblems(undefined, ['ch-test']).length === 1, JSON.stringify(caught));

  // --- K: phase GM (GM-5b, E-GM-9 / E-GM-31) — factor per measured glacier and its shape per band, end to end (same cold and wet run as H) ----------
  {
    const realGl = JSON.parse(readFileSync(join(HERE, 'glacier', 'snow-calibration-glaciers.json'), 'utf8'));
    // the real table with two glaciers of the test catalogue: Alpha with a factor and a shape, Far with a factor AT THE BOUND (not a measurement) and a shape
    const shapeA = { z0: 2400, stepM: 50, s: [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.2, 0.1, 0], m: 0.5 }, shapeF = { z0: 2600, stepM: 50, s: [0.2, 0, -0.2], m: 1 };
    const glFor = (edit = null) => { const t = structuredClone(realGl); t.glaciers = { gl_ch_alpha: { country: 'CH', winters: 9, years: [2015, 2023], F: 2.5, origin: 'measured', shape: shapeA }, gl_ch_far: { country: 'CH', winters: 7, years: [2012, 2018], F: 5, origin: 'measured', atBound: true, shape: shapeF } }; edit?.(t); return t; };
    const runGl = async (name, extra = {}, glTable = glFor()) => {
      const dir = join(tmp, `${name}-gl`); mkdirSync(dir, { recursive: true });
      const gf = join(dir, 'snowcal-glaciers.json'); if (glTable) writeFileSync(gf, JSON.stringify(glTable));
      return runSw(name, { 'snowcal-glaciers': gf, ...extra });
    };
    // by hand: the shape at the band mids (linear between the support points every 50 m, outside them the nearest), area-weighted mean-free, × m
    const W = [0.1, 0.3, 0.5, 0.6, 0.5, 0.3, 0.2, 0.1].map((v) => v / 2.6);
    const corrOfMid = (sMid, m) => { const bar = sMid.reduce((t, v, i) => t + W[i] * v, 0); return sMid.map((v) => 1 + m * (v - bar)); };
    const corrA = corrOfMid([-0.25, -0.15, -0.05, 0.05, 0.15, 0.2, 0.15, 0.05], 0.5), corrF = corrOfMid([0.1, -0.1, -0.2, -0.2, -0.2, -0.2, -0.2, -0.2], 1);
    const sweCorr = (z0, zRef, pf, corr) => hypZb(z0).map((z, i) => { const Tb = -2 + 0.0065 * (zRef - z); return 18 * pf * corr[i] * Math.min(1, Math.max(0, (2 - Tb) / 2)); });
    const one = [1, 1, 1, 1, 1, 1, 1, 1];

    const offNamed = await runGl('gl-off', { 'glacier-factor': 'off', 'glacier-shape': 'off' }), offNoTable = await runGl('gl-off-notable', {}, null);
    add('K1 Schalter „Faktor je Gletscher“ und „Form je Band“: Voreinstellung beider „off“, ein unbekanntes Wort wird abgelehnt; aus = dieselben Bytes wie der Lauf ohne die Schalter (Dokument, Zustand, Zeiger, Statuszeile), die Tabelle je Gletscher wird nicht geöffnet (OHNE die Datei dieselben Bytes), kein Feld `glaciers` im Dokument und keine Angabe in der Statuszeile',
      GLACIER_FACTOR_DEFAULT === 'off' && GLACIER_SHAPE_DEFAULT === 'off' && glacierFactorModeOf(undefined) === 'off' && glacierShapeModeOf('') === 'off' && glacierFactorModeOf('on') === 'on'
      && !offNamed.err && !offNoTable.err && same(offNamed, on) && same(offNoTable, on) && on.doc.params.precip.glaciers === undefined && !('glacier' in on.status.lines.melt), JSON.stringify({ err: [offNamed.err, offNoTable.err] }));

    const fOn = await runGl('gl-factor', { 'glacier-factor': 'on' }), sOn = await runGl('gl-shape', { 'glacier-shape': 'on' }), bothOn = await runGl('gl-both', { 'glacier-factor': 'on', 'glacier-shape': 'on' });
    const gb = fOn.doc?.params?.precip?.glaciers;
    add('K2 Faktor je Gletscher an: Alpha (Eintrag 2,5) hält nach 6 Stunden von Hand 6 · 3 mm · 2,5 · Schneeanteil an jedem Band; Gamma (kein Eintrag) und Far (Eintrag an der Grenze 5 — kein Messwert) behalten den Wert ihrer Region; Gegenprobe: Alpha mit dem Regionswert passt nicht; das Dokument nennt Regel, Hash der Methode und die Gletscher, die auf eigenem Faktor liefen (nur Alpha), die Statuszeile zählt sie; der Vertrag der Seite und des Blocks nimmt das Dokument',
      !fOn.err && stateIs(fOn.state, 'gl_ch_alpha', sweCorr(2400, 2900, 2.5, one)) && !stateIs(fOn.state, 'gl_ch_alpha', sweCorr(2400, 2900, F['ch-test'], one)) && stateIs(fOn.state, 'gl_ch_gamma', sweCorr(2600, 2900, F['ch-test'], one)) && stateIs(fOn.state, 'gl_ch_far', sweCorr(2600, 2750, F['ch-far'], one))
      && gb?.factor === true && gb.shape === false && JSON.stringify(gb.applied) === JSON.stringify({ factor: ['gl_ch_alpha'], shape: [] }) && gb.method === realGl.method.sha256 && gb.atBound === 1 && gb.entries === 2
      && JSON.stringify(fOn.status.lines.melt.glacier) === JSON.stringify({ factor: 1, shape: 0 }) && meltProblems(fOn.doc).length === 0 && meltPrecipProblems(fOn.doc.params.precip, ['ch-test', 'ch-far']).length === 0 && fOn.doc.params.precip.regions['ch-test'].F === F['ch-test'],
      JSON.stringify({ err: fOn.err, alpha: fOn.state?.gl_ch_alpha?.[0], hand: sweCorr(2400, 2900, 2.5, one), gb }));
    const meanOf = (c) => c.reduce((t, v, i) => t + W[i] * v, 0);
    add('K3 Form je Band an (ohne den Faktor): Alpha und Far verteilen den Zuwachs nach ihrer Form — von Hand je Band 6 · 3 mm · Regionswert · (1 + m · (Form − flächengewichtetes Mittel)) · Schneeanteil; das flächengewichtete Mittel der Multiplikatoren ist 1 (die Form verteilt nur um), unten und oben unterscheiden sie sich; Gamma bleibt wie ohne Schalter; das Dokument nennt beide Gletscher unter `shape` — auch den mit dem Faktor an der Grenze, dessen Form trotzdem gilt',
      !sOn.err && Math.abs(meanOf(corrA) - 1) < 1e-12 && Math.abs(meanOf(corrF) - 1) < 1e-12 && corrA[5] - corrA[0] > 0.2 && stateIs(sOn.state, 'gl_ch_alpha', sweCorr(2400, 2900, F['ch-test'], corrA)) && !stateIs(sOn.state, 'gl_ch_alpha', sweCorr(2400, 2900, F['ch-test'], one))
      && stateIs(sOn.state, 'gl_ch_far', sweCorr(2600, 2750, F['ch-far'], corrF)) && stateIs(sOn.state, 'gl_ch_gamma', sweCorr(2600, 2900, F['ch-test'], one))
      && JSON.stringify(sOn.doc.params.precip.glaciers?.applied) === JSON.stringify({ factor: [], shape: ['gl_ch_alpha', 'gl_ch_far'] }) && JSON.stringify(sOn.status.lines.melt.glacier) === JSON.stringify({ factor: 0, shape: 2 }),
      JSON.stringify({ err: sOn.err, corrA, alpha: sOn.state?.gl_ch_alpha?.[0], hand: sweCorr(2400, 2900, F['ch-test'], corrA) }));
    add('K4 beide an: Alpha rechnet mit eigenem Faktor UND eigener Form (von Hand 2,5 · Multiplikator je Band), Far mit dem Regionswert und seiner Form',
      !bothOn.err && stateIs(bothOn.state, 'gl_ch_alpha', sweCorr(2400, 2900, 2.5, corrA)) && stateIs(bothOn.state, 'gl_ch_far', sweCorr(2600, 2750, F['ch-far'], corrF)) && JSON.stringify(bothOn.status.lines.melt.glacier) === JSON.stringify({ factor: 1, shape: 2 }), JSON.stringify({ err: bothOn.err }));
    process.env.GLACIER_SNOW_GLACIER_FACTOR = 'on'; process.env.GLACIER_SNOW_GLACIER_SHAPE = 'on';
    const envBoth = await runGl('gl-env'), envArg = await runGl('gl-env-arg', { 'glacier-factor': 'off', 'glacier-shape': 'off' });
    delete process.env.GLACIER_SNOW_GLACIER_FACTOR; delete process.env.GLACIER_SNOW_GLACIER_SHAPE;
    add('K5 Umgebungsvariablen GLACIER_SNOW_GLACIER_FACTOR / _SHAPE = on schreiben dieselben Bytes wie die Schalter; ein Schalter „off“ daneben gewinnt (dieselben Bytes wie ohne)', !envBoth.err && !envArg.err && same(envBoth, bothOn) && same(envArg, on), JSON.stringify({ err: [envBoth.err, envArg.err] }));
    const word = await runGl('gl-word', { 'glacier-factor': 'ja' }), wordS = await runGl('gl-word-s', { 'glacier-shape': 'ja' }), gateC = await runGl('gl-gatec', { 'glacier-factor': 'on', precip: 'gate-c' }), noFile = await runGl('gl-nofile', { 'glacier-factor': 'on' }, null);
    const notCarried = await runGl('gl-gate', { 'glacier-factor': 'on' }, glFor((t) => { t.verdict.K6.carries = false; t.gate.factor = false; })), shapeGate = await runGl('gl-gate-s', { 'glacier-shape': 'on' }, glFor((t) => { t.verdict.K7.carries = false; t.gate.shape = false; }));
    const contradict = await runGl('gl-contradict', { 'glacier-factor': 'on' }, glFor((t) => { t.gate.factor = false; })), stranger = await runGl('gl-stranger', { 'glacier-shape': 'on' }, glFor((t) => { t.glaciers.gl_ch_nobody = structuredClone(t.glaciers.gl_ch_alpha); }));
    const wild = await runGl('gl-wild', { 'glacier-factor': 'on' }, glFor((t) => { t.glaciers.gl_ch_alpha.F = 7; })), unmarked = await runGl('gl-unmarked', { 'glacier-factor': 'on' }, glFor((t) => { delete t.glaciers.gl_ch_far.atBound; }));
    const stops = [word, wordS, gateC, noFile, notCarried, shapeGate, contradict, stranger, wild, unmarked];
    add('K6 die Schalter fallen nie still zurück: unbekanntes Wort (beide Schalter), „gate-c“ daneben, fehlende Tabelle, ein Urteil, das nicht trägt (Faktor bzw. Form), ein Urteil, dem `gate` widerspricht, ein Gletscher außerhalb des Katalogs, ein Faktor außerhalb der Grenzen, ein Faktor an der Grenze ohne Vermerk ⇒ Abbruch mit Grund, nichts geschrieben',
      /Faktor je Gletscher: unbekannte Stellung „ja“/.test(word.err ?? '') && /Form je Band: unbekannte Stellung „ja“/.test(wordS.err ?? '') && /nur mit dem Niederschlagsfaktor „country“/.test(gateC.err ?? '') && /nicht lesbar/.test(noFile.err ?? '')
      && /trägt nach dem Urteil der Eichung nicht \(gate\.factor\)/.test(notCarried.err ?? '') && /gate\.shape/.test(shapeGate.err ?? '') && /gate\.factor widerspricht/.test(contradict.err ?? '') && /gl_ch_nobody: nicht im Katalog/.test(stranger.err ?? '')
      && /Faktor außerhalb der Grenzen/.test(wild.err ?? '') && /atBound/.test(unmarked.err ?? '') && stops.every((x) => x.wrote === false), JSON.stringify(stops.map((x) => x.err)));
    // the core: a multiplier per band handed in, by hand; without it the gradient as always; a list that does not fit the bands is refused
    const bands2 = { zb: [2500, 2700], w: [0.5, 0.5] }, coldT = new Float64Array(6).fill(-5), wet = new Float64Array(6).fill(2);
    const sim = (extra) => simulate({ bands: bands2, ela: 2600, t: coldT, g: new Float64Array(6), p: wet, zT: 2600, zP: 2600, pf: 1.5, TF: 0.1, SRF: 0.005, state: emptyState(2), ...extra });
    const withCorr = sim({ pGrad: 0, corr: [0.8, 1.2] }), plain = sim({ pGrad: 0 }), grad = sim({});
    let refused = false; try { sim({ corr: [1] }); } catch { refused = true; }
    add('K7 Kern: mit einem Multiplikator je Band ist der Zuwachs von Hand Stunden · Niederschlag · Faktor · Multiplikator (6 · 2 · 1,5 · 0,8 = 14,4 und · 1,2 = 21,6 mm), ohne ihn rechnet der Kern wie immer (mit Gradient 0 je 18 mm, ohne Angabe die gesetzten 4 % je 100 m ab der Bezugshöhe); eine Liste, die nicht zu den Bändern passt, wird abgelehnt',
      Math.abs(withCorr.bal[0] - 14.4) < 1e-9 && Math.abs(withCorr.bal[1] - 21.6) < 1e-9 && Math.abs(plain.bal[0] - 18) < 1e-9 && Math.abs(plain.bal[1] - 18) < 1e-9 && Math.abs(grad.bal[0] - 18 * 0.96) < 1e-9 && Math.abs(grad.bal[1] - 18 * 1.04) < 1e-9 && refused, JSON.stringify([Array.from(withCorr.bal), Array.from(grad.bal)]));
  }
  // --- L: GM-10b (E-GM-44) — predicted factors (`--glacier-factor=predicted`) and the factor rule of the melt state (V-GM-91), same cold and wet run --------
  // (a crash inside the block is a named failure, not an abort of the verifier)
  try {
    const realGl = JSON.parse(readFileSync(join(HERE, 'glacier', 'snow-calibration-glaciers.json'), 'utf8'));
    const shapeA = { z0: 2400, stepM: 50, s: [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.2, 0.1, 0], m: 0.5 }, shapeF = { z0: 2600, stepM: 50, s: [0.2, 0, -0.2], m: 1 };
    const glTable = structuredClone(realGl);
    glTable.glaciers = { gl_ch_alpha: { country: 'CH', winters: 9, years: [2015, 2023], F: 2.5, origin: 'measured', shape: shapeA }, gl_ch_far: { country: 'CH', winters: 7, years: [2012, 2018], F: 5, origin: 'measured', atBound: true, shape: shapeF } };
    const glDir = join(tmp, 'L-gl'); mkdirSync(glDir, { recursive: true });
    const glFile = join(glDir, 'snowcal-glaciers.json'); writeFileSync(glFile, JSON.stringify(glTable));
    const glSha = createHash('sha256').update(readFileSync(glFile)).digest('hex');
    // the SYNTHETIC table of the fixture (invented glaciers of the test catalogue): Alpha own 2,5 — Beta predicted 2,1 — Gamma predicted-shrunk 1,9 — Delta country
    const fx = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'snowcal-predicted.json'), 'utf8'));
    const predFor = (edit = null) => { const t = structuredClone(fx); t.inputs.ownTable = glSha; edit?.(t); return t; };
    let nL = 0;
    const snowFcAt = (nowMs) => async () => { const fc = synthFc({ tOf: () => -2 }); fc.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = Math.floor(nowMs / H) * H + i * H; s.vars.precip.mean = 3; }); return fc; };
    const runL = async (name, { extra = {}, pred = predFor(), prevState = null, atH = 0, tableArg = true } = {}) => {
      const root = join(tmp, `L-${name}-${nL++}`); const tr = mkTree(root);
      const tf = join(root, 'snowcal.json'); writeFileSync(tf, JSON.stringify(tableFor()));
      const pf = join(root, 'predicted.json'); if (pred != null) writeFileSync(pf, typeof pred === 'string' ? pred : JSON.stringify(pred));
      if (prevState) { mkdirSync(join(tr.data, 'melt'), { recursive: true }); writeFileSync(join(tr.data, 'melt', 'state.json'), prevState); }
      const now = NOW + atH * H;
      let r = null, err = null;
      try { r = await main({ data: tr.data, cube: tr.cube, out: join(root, 'out'), calibration: tr.calFile, now: new Date(now).toISOString(), forecast: snowFcAt(now), ioFactory: okIo, always: true, weather: '0', snowcal: tf, 'snowcal-glaciers': glFile, ...(tableArg ? { 'glacier-factor-table': pf } : {}), ...extra }); } catch (e) { err = String(e.message ?? e); }
      if (err) return { err, wrote: existsSync(join(root, 'out')) };
      const read = (rel) => readFileSync(join(root, rel), 'utf8');
      const status = JSON.parse(read('patch/status-patch.json')); delete status.lines.melt.seconds; delete status.lines.melt.mem;
      const stateRaw = read('out/melt/state.json');
      return { r, docRaw: read(`out/melt/${r.run}.json`), doc: JSON.parse(read(`out/melt/${r.run}.json`)), stateRaw, file: JSON.parse(stateRaw), state: JSON.parse(stateRaw).g, index: read('patch/index-patch.json'), status };
    };
    const sweH = (hours, z0, zRef, pf) => hypZb(z0).map((z) => { const Tb = -2 + 0.0065 * (zRef - z); return 3 * hours * pf * Math.min(1, Math.max(0, (2 - Tb) / 2)); });
    // a state carried over one more run holds the rounding to 0,1 mm twice: 0,11 mm for 12-h values
    const is = (s, id, hand, tol = hand === null ? 0 : 0.051) => !!s?.[id] && s[id][0].length === 8 && s[id][0].every((v, i) => Math.abs(v - hand[i]) <= tol);
    const is12 = (s, id, hand) => is(s, id, hand, 0.11);

    const P = await runL('pred', { extra: { 'glacier-factor': 'predicted' } });
    const pb = P.doc?.params?.precip?.glaciers;
    add('L1 Faktor je Gletscher „predicted“ (E-GM-44): Alpha behält den eigenen Faktor 2,5, Beta läuft auf dem vorhergesagten 2,1, Gamma (Nachbar-Antrieb) auf dem geschrumpften 1,9, Far (eigener Faktor an der Grenze, keine Zeile) auf dem Wert seiner Region — je von Hand 6 · 3 mm · Faktor · Schneeanteil an jedem Band; Gegenprobe: Beta mit dem Landeswert passt nicht; das Dokument nennt Tabelle (Hash), Regel, Herkunft „computed“, „nicht nachgeprüft“, Zahlen je Grundlage und die Zeilen je Grundlage, die Statuszeile zählt sie, der Zustand nennt Regel und Faktor der drei (V-GM-91); Verträge ohne Befund; kein „measured“ im Block',
      !P.err && is(P.state, 'gl_ch_alpha', sweH(6, 2400, 2900, 2.5)) && is(P.state, 'gl_ch_beta', sweH(6, 2500, 2800, 2.1)) && !is(P.state, 'gl_ch_beta', sweH(6, 2500, 2800, F['ch-test']))
      && is(P.state, 'gl_ch_gamma', sweH(6, 2600, 2900, 1.9)) && is(P.state, 'gl_ch_far', sweH(6, 2600, 2750, F['ch-far']))
      && pb?.factor === true && JSON.stringify(pb.applied) === JSON.stringify({ factor: ['gl_ch_alpha'], shape: [] }) && pb.predicted?.rule === 'predicted' && /^[0-9a-f]{64}$/.test(pb.predicted.table)
      && pb.predicted.origin === 'computed' && pb.predicted.verified === false && pb.predicted.small === 'shrunk' && JSON.stringify(pb.predicted.applied) === JSON.stringify({ predicted: ['gl_ch_beta'], 'predicted-shrunk': ['gl_ch_gamma'] })
      && JSON.stringify(P.status.lines.melt.glacier) === JSON.stringify({ factor: 1, shape: 0, predicted: 1, predictedShrunk: 1 })
      && P.file.fac?.rule === `predicted:${pb.predicted.table.slice(0, 16)}` && JSON.stringify(P.file.fac.f) === JSON.stringify({ gl_ch_alpha: 2.5, gl_ch_beta: 2.1, gl_ch_gamma: 1.9 })
      && meltProblems(P.doc).length === 0 && meltStateProblems(P.file).length === 0 && meltPrecipProblems(P.doc.params.precip, ['ch-test', 'ch-far']).length === 0 && !/measured/.test(JSON.stringify(pb.predicted)),
      JSON.stringify({ err: P.err, beta: P.state?.gl_ch_beta?.[0], hand: sweH(6, 2500, 2800, 2.1), pb, fac: P.file?.fac, status: P.status?.lines?.melt?.glacier }));
    // the switch off: the table is not opened (a broken file named next to it changes nothing) and every byte is the run without any switch
    const plain = await runL('plain', { pred: null, tableArg: false }), offBroken = await runL('off-broken', { pred: '{kaputt', extra: { 'glacier-factor': 'off' } });
    add('L2 aus: mit „off“ wird die Tabelle vorhergesagter Faktoren nicht geöffnet — eine kaputte Datei daneben ändert kein Byte (Dokument, Zustand, Zeiger, Statuszeile gleich dem Lauf ohne jeden Schalter); kein Feld `fac` im Zustand, keine Angabe in der Statuszeile; die Voreinstellung bleibt „off“, „predicted“ ist ein erlaubtes Wort',
      !plain.err && !offBroken.err && plain.docRaw === offBroken.docRaw && plain.stateRaw === offBroken.stateRaw && plain.index === offBroken.index && JSON.stringify(plain.status) === JSON.stringify(offBroken.status)
      && plain.file.fac === undefined && !('glacier' in plain.status.lines.melt) && GLACIER_FACTOR_DEFAULT === 'off' && glacierFactorModeOf('predicted') === 'predicted', JSON.stringify({ err: [plain.err, offBroken.err] }));
    // never a silent fall back: every one stops with the reason and writes nothing
    const stops = {
      noName: await runL('no-name', { extra: { 'glacier-factor': 'predicted' }, tableArg: false }),
      noFile: await runL('no-file', { extra: { 'glacier-factor': 'predicted' }, pred: null }),
      notJson: await runL('not-json', { extra: { 'glacier-factor': 'predicted' }, pred: '{kaputt' }),
      gateC: await runL('gate-c', { extra: { 'glacier-factor': 'predicted', precip: 'gate-c' } }),
      otherOwn: await runL('other-own', { extra: { 'glacier-factor': 'predicted' }, pred: predFor((t) => { t.inputs.ownTable = 'f'.repeat(64); }) }),
      ownDiffers: await runL('own-differs', { extra: { 'glacier-factor': 'predicted' }, pred: predFor((t) => { t.glaciers.gl_ch_alpha.F = 2.4; t.glaciers.gl_ch_alpha.q = [2.328, 2.472]; }) }),
      ownAsPred: await runL('own-as-pred', { extra: { 'glacier-factor': 'predicted' }, pred: predFor((t) => { t.glaciers.gl_ch_alpha = { b: 'predicted', F: 2.5, q: [2, 3], n: 12 }; t.counts.own = 0; t.counts.predicted = 2; }) }),
      country: await runL('country', { extra: { 'glacier-factor': 'predicted' }, pred: predFor((t) => { t.inputs.countryF = 1.8; t.glaciers.gl_ch_delta.F = 1.8; t.glaciers.gl_ch_delta.q = [1.314, 2.466]; }) }),
      stranger: await runL('stranger', { extra: { 'glacier-factor': 'predicted' }, pred: predFor((t) => { t.glaciers.gl_ch_nobody = { ...t.glaciers.gl_ch_beta }; t.counts.predicted = 2; }) }),
      unclamped: await runL('unclamped', { extra: { 'glacier-factor': 'predicted' }, pred: predFor((t) => { t.glaciers.gl_ch_beta.F = 3.5; t.glaciers.gl_ch_beta.q = [2.8, 4.2]; }) }),
      measured: await runL('measured', { extra: { 'glacier-factor': 'predicted' }, pred: predFor((t) => { t.origin = 'measured'; }) }),
    };
    const want = { noName: /braucht die Tabelle vorhergesagter Faktoren/, noFile: /nicht lesbar/, notJson: /kein JSON/, gateC: /nur mit dem Niederschlagsfaktor „country“/, otherOwn: /inputs\.ownTable/, ownDiffers: /Zeile „own“ ohne denselben eigenen Faktor/, ownAsPred: /eigenem Faktor, Zeile aber „predicted“/, country: /mit 1\.8 gebaut/, stranger: /gl_ch_nobody: nicht als Schweizer Gletscher/, unclamped: /nicht an die eigenen Faktoren gekappt/, measured: /Herkunft measured/ };
    add('L3 „predicted“ fällt nie still zurück: ohne genannte Tabelle, Datei fehlt, kein JSON, „gate-c“ daneben, Tabelle gegen eine andere Tabelle eigener Faktoren gebaut, Zeile „own“ mit anderem Faktor, Gletscher mit eigenem Faktor als „predicted“, anderer Landeswert, Gletscher außerhalb des Katalogs, vorhergesagter Faktor nicht gekappt, Herkunft „measured“ ⇒ Abbruch mit Grund, nichts geschrieben',
      Object.entries(want).every(([k, re]) => re.test(stops[k].err ?? '') && stops[k].wrote === false), JSON.stringify(Object.fromEntries(Object.entries(stops).map(([k, x]) => [k, x.err ?? 'kein Abbruch']))));
    process.env.GLACIER_SNOW_GLACIER_FACTOR = 'predicted';
    const envP = await runL('env', { tableArg: false });   // no table named anywhere: stops
    const envFile = join(tmp, 'L-env-table.json'); writeFileSync(envFile, JSON.stringify(predFor()));
    process.env.GLACIER_SNOW_GLACIER_FACTOR_TABLE = envFile;
    const envT = await runL('env-t', { tableArg: false });
    delete process.env.GLACIER_SNOW_GLACIER_FACTOR; delete process.env.GLACIER_SNOW_GLACIER_FACTOR_TABLE;
    add('L4 Umgebungsvariablen GLACIER_SNOW_GLACIER_FACTOR=predicted und GLACIER_SNOW_GLACIER_FACTOR_TABLE schreiben dieselben Bytes wie die Schalter; ohne Tabelle bricht auch die Umgebungsvariable ab',
      /braucht die Tabelle/.test(envP.err ?? '') && !envT.err && envT.docRaw === P.docRaw && envT.stateRaw === P.stateRaw && JSON.stringify(envT.status) === JSON.stringify(P.status), JSON.stringify({ err: [envP.err, envT.err] }));
    // V-GM-91: the next run (6 h later) continues the state of the predicted run — with the switch off the three glaciers on another factor begin anew
    const offNext = await runL('off-next', { prevState: P.stateRaw, atH: 6, pred: null, tableArg: false });
    const predNext = await runL('pred-next', { prevState: P.stateRaw, atH: 6, extra: { 'glacier-factor': 'predicted' } });
    const onNext = await runL('on-next', { prevState: P.stateRaw, atH: 6, extra: { 'glacier-factor': 'on' } });
    const plainNext = await runL('plain-next', { prevState: plain.stateRaw, atH: 6, pred: null, tableArg: false });
    add('L5 V-GM-91 — nie Schnee aus zwei Faktoren: der Lauf 6 h später setzt den Zustand fort. Mit „off“ beginnen Alpha, Beta, Gamma (Zustand von einem anderen Faktor) neu — von Hand 6 h mit dem Landeswert —, Far wird fortgesetzt (12 h); das Dokument zählt 3 neu begonnene, der neue Zustand trägt kein `fac`. Mit „predicted“ wird jeder fortgesetzt (12 h mit 2,5 / 2,1 / 1,9, keiner neu). Mit „on“ beginnen Beta und Gamma neu (jetzt Landeswert), Alpha (gleicher Faktor 2,5) wird fortgesetzt. Gegenprobe: ohne Schalter auf einem Zustand ohne `fac` beginnt keiner neu',
      !offNext.err && offNext.doc.state.source === 'carried' && offNext.doc.state.respun === 3 && is(offNext.state, 'gl_ch_alpha', sweH(6, 2400, 2900, F['ch-test'])) && is(offNext.state, 'gl_ch_beta', sweH(6, 2500, 2800, F['ch-test'])) && is(offNext.state, 'gl_ch_gamma', sweH(6, 2600, 2900, F['ch-test']))
      && is12(offNext.state, 'gl_ch_far', sweH(12, 2600, 2750, F['ch-far'])) && offNext.file.fac === undefined && offNext.status.lines.melt.glacier?.respun === 3
      && !predNext.err && predNext.doc.state.respun === undefined && is12(predNext.state, 'gl_ch_alpha', sweH(12, 2400, 2900, 2.5)) && is12(predNext.state, 'gl_ch_beta', sweH(12, 2500, 2800, 2.1)) && is12(predNext.state, 'gl_ch_gamma', sweH(12, 2600, 2900, 1.9))
      && !onNext.err && onNext.doc.state.respun === 2 && is12(onNext.state, 'gl_ch_alpha', sweH(12, 2400, 2900, 2.5)) && is(onNext.state, 'gl_ch_beta', sweH(6, 2500, 2800, F['ch-test'])) && JSON.stringify(onNext.file.fac?.f) === JSON.stringify({ gl_ch_alpha: 2.5 }) && /^on:[0-9a-f]{16}$/.test(onNext.file.fac?.rule ?? '')
      && !plainNext.err && plainNext.doc.state.respun === undefined && is12(plainNext.state, 'gl_ch_beta', sweH(12, 2500, 2800, F['ch-test'])) && meltStateProblems(onNext.file).length === 0,
      JSON.stringify({ err: [offNext.err, predNext.err, onNext.err, plainNext.err], respun: [offNext.doc?.state?.respun, predNext.doc?.state?.respun, onNext.doc?.state?.respun], far: offNext.state?.gl_ch_far?.[0], farHand: sweH(12, 2600, 2750, F['ch-far']), betaPlain: plainNext.state?.gl_ch_beta?.[0], betaHand: sweH(12, 2500, 2800, F['ch-test']), alphaPred: predNext.state?.gl_ch_alpha?.[0], st: offNext.status?.lines?.melt?.glacier, facOn: onNext.file?.fac }));
    // the rule of the state file: eight violations of `fac`, each reported
    const st0 = P.file, badFac = (f) => { const s = structuredClone(st0); f(s); return meltStateProblems(s).length; };
    const facCaught = [(s) => { s.fac.rule = 'predicted'; }, (s) => { s.fac.rule = 'maybe:0123456789abcdef'; }, (s) => { s.fac.f = []; }, (s) => { s.fac.f.gl_ch_alpha = 7; }, (s) => { s.fac.f.gl_ch_alpha = '2.5'; }, (s) => { s.fac.f.gl_ch_nobody = 2; }, (s) => { delete s.fac.f; }, (s) => { s.fac = null; }].map(badFac);
    add('L6 Regeln von `fac` im Schmelzzustand: Regel ohne Tabelle, fremdes Wort, Liste statt Zuordnung, Faktor außerhalb der Grenzen, Faktor als Text, Faktor ohne Zustand, ohne Zuordnung, leerer Block — jede Verletzung gemeldet; der echte Zustand hat keine',
      facCaught.every((n) => n > 0) && meltStateProblems(st0).length === 0, JSON.stringify(facCaught));
    // the COMMAND LINE hands the table on: a run of melt.mjs as a process with a broken table file stops at the table (`kein JSON`), not for lack of one
    {
      const root = join(tmp, 'L-cli'); const tr = mkTree(root);
      const tf = join(root, 'snowcal.json'); writeFileSync(tf, JSON.stringify(tableFor()));
      const pf = join(root, 'predicted.json'); writeFileSync(pf, '{kaputt');
      const cli = (extra) => spawnSync(process.execPath, ['--experimental-strip-types', '--import', './scripts/lib/register-ts.mjs', 'scripts/glacier/melt.mjs', `--data=${tr.data}`, `--cube=${tr.cube}`, `--out=${join(root, 'out')}`, `--calibration=${tr.calFile}`, `--snowcal=${tf}`, `--snowcal-glaciers=${glFile}`, '--weather=0', '--always', ...extra], { cwd: join(HERE, '..'), encoding: 'utf8' });
      const withT = cli(['--glacier-factor=predicted', `--glacier-factor-table=${pf}`]), without = cli(['--glacier-factor=predicted']);
      add('L7 die Kommandozeile reicht die Tabelle durch: `melt.mjs --glacier-factor=predicted --glacier-factor-table=<kaputte Datei>` als Prozess bricht an der Tabelle ab („kein JSON“), ohne die Angabe mit „braucht die Tabelle“; beide mit Exit 1, nichts geschrieben',
        withT.status === 1 && /kein JSON/.test(withT.stderr) && without.status === 1 && /braucht die Tabelle/.test(without.stderr) && !existsSync(join(root, 'out')), JSON.stringify({ withT: [withT.status, withT.stderr.split('\n').filter((l) => !/Warning|trace-warnings/.test(l)).join(' | ')], without: [without.status, without.stderr.split('\n').slice(-3).join(' | ')] }));
    }
  } catch (e) { add('L Block abgebrochen', false, String(e?.stack ?? e)); }
}
// --- I: phase GM (GM-3d, V-GM-32) — where the carried state stands: `ahead` (as always, the fall back) or `run-hour` with its forcing ---------------
// (a crash inside the block is a named failure, not an abort of the verifier)
try {
  // pure: the verdict on a state file, the stored forcing
  const at0 = Date.UTC(2026, 9, 10, 4), v = (state, mode, gapH) => meltStateVerdict(state, mode, at0 + gapH * H, 30);
  const plain = { atMs: at0, g: {} }, withPend = { atMs: at0, g: {}, pend: { h: 18, f: {}, o: {} } };
  const is = (x, carry, ageH, replayH, form) => x.carry === carry && x.ageH === ageH && x.replayH === replayH && x.form === form;
  add('I1 Urteil über die Zustandsdatei (rein): „ahead“ nimmt 0–30 h alte Zustände und verwirft einen, der in der Zukunft liegt — auch eine Datei MIT Antrieb liest es so; „run-hour“ rechnet eine Datei mit Antrieb bis zur Laufstunde nach (höchstens die gespeicherten 18 h, der Rest ist das Alter, über 30 h Alter Kaltstart), eine Datei OHNE Antrieb beurteilt es nach der alten Regel; halbe Stunden und fehlende Dateien ⇒ Kaltstart',
    MELT_STATE_DEFAULT === 'ahead' && MELT_STATE_MODES.join() === 'ahead,run-hour' && meltStateModeOf(undefined) === 'ahead' && meltStateModeOf('') === 'ahead' && meltStateModeOf('run-hour') === 'run-hour'
    && (() => { try { meltStateModeOf('an'); return false; } catch (e) { return /unbekannt.*ahead, run-hour/.test(e.message); } })()
    && is(v(plain, 'ahead', -3), false, null, 0, 'plain') && is(v(plain, 'ahead', 0), true, 0, 0, 'plain') && is(v(plain, 'ahead', 30), true, 30, 0, 'plain') && is(v(plain, 'ahead', 31), false, null, 0, 'plain')
    && is(v(withPend, 'ahead', 6), true, 6, 0, 'plain') && is(v(plain, 'run-hour', -3), false, null, 0, 'plain') && is(v(plain, 'run-hour', 9), true, 9, 0, 'plain')
    && is(v(withPend, 'run-hour', 0), true, 0, 0, 'pend') && is(v(withPend, 'run-hour', 3), true, 0, 3, 'pend') && is(v(withPend, 'run-hour', 18), true, 0, 18, 'pend') && is(v(withPend, 'run-hour', 24), true, 6, 18, 'pend')
    && is(v(withPend, 'run-hour', 48), true, 30, 18, 'pend') && is(v(withPend, 'run-hour', 49), false, null, 0, 'pend') && is(v(withPend, 'run-hour', -3), false, null, 0, 'pend') && is(v(withPend, 'run-hour', 2.5), false, null, 0, 'pend')
    && is(v(null, 'run-hour', 3), false, null, 0, 'none') && is(v({ g: {} }, 'ahead', 3), false, null, 0, 'none'), JSON.stringify([v(withPend, 'run-hour', 24), v(withPend, 'ahead', 6)]));
  const fq = { zRef: 2900, t: Float64Array.from([1.234567, NaN, -3.005, ...new Array(20).fill(0)]), fz: Float64Array.from([3100.4, NaN, ...new Array(21).fill(NaN)]), g: Float64Array.from([512.6, 0, ...new Array(21).fill(0)]), p: Float64Array.from([0.126, NaN, ...new Array(21).fill(0)]) };
  const pr = pendOfForcing(fq), back = forcingOfPend(pr);
  add('I2 gespeicherter Antrieb (rein): die ersten 18 Stunden auf 0,01 K / 1 m / 1 W/m² / 0,01 mm, ein fehlender Wert ist null und wird beim Lesen wieder zur Lücke (NaN); eine unbrauchbare Zeile ergibt keinen Antrieb',
    GLACIER_MELT_STATE_PEND_H === 18 && pr[0] === 2900 && pr.slice(1).every((a) => a.length === 18) && pr[1][0] === 1.23 && pr[1][1] === null && pr[1][2] === -3 && pr[2][0] === 3100 && pr[2][1] === null && pr[3][0] === 513 && pr[4][0] === 0.13 && pr[4][1] === null
    && back.zRef === 2900 && back.t.length === 18 && Number.isNaN(back.t[1]) && Number.isNaN(back.fz[1]) && Number.isNaN(back.p[1]) && back.t[0] === 1.23 && back.g[0] === 513
    && forcingOfPend(null) === null && forcingOfPend([2900, [1], [1], [1]]) === null && forcingOfPend([2900, [1, 2], [1], [1], [1]]) === null && forcingOfPend([null, [1], [1], [1], [1]]) === null, JSON.stringify(pr.map((a) => (Array.isArray(a) ? a.slice(0, 3) : a))));

  // end to end: cold and wet (−2 °C, 3 mm every hour — snow at every band, no melt), so the state counts the hours it was advanced
  const snowAt = (nowMs) => async () => { const fc = synthFc({ tOf: () => -2 }); fc.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = Math.floor(nowMs / H) * H + i * H; s.vars.precip.mean = 3; }); return fc; };
  let nOut = 0;
  const runSt = async (root, tr, atH, extra = {}, fcOf = snowAt) => {
    const now = NOW + atH * H, out = join(root, `out-${nOut++}`);
    let r = null, err = null;
    try { r = await main({ data: tr.data, cube: tr.cube, out, calibration: tr.calFile, now: new Date(now).toISOString(), forecast: fcOf(now), ioFactory: okIo, always: true, weather: '0', ...GATE_C, ...extra }); } catch (e) { err = String(e.message ?? e); }
    if (err) return { err, wrote: existsSync(out) };
    const read = (f) => readFileSync(f, 'utf8');
    const status = JSON.parse(read(join(root, 'patch', 'status-patch.json'))); delete status.lines.melt.seconds; delete status.lines.melt.mem;
    const docRaw = read(join(out, 'melt', `${r.run}.json`)), stateRaw = read(join(out, 'melt', 'state.json'));
    return { r, docRaw, doc: JSON.parse(docRaw), stateRaw, file: JSON.parse(stateRaw), state: JSON.parse(stateRaw).g, index: read(join(root, 'patch', 'index-patch.json')), status };
  };
  const take = (tr, e) => { mkdirSync(join(tr.data, 'melt'), { recursive: true }); writeFileSync(join(tr.data, 'melt', 'state.json'), typeof e === 'string' ? e : e.stateRaw); };
  const fresh = (name) => { const root = join(tmp, name); return { root, tr: mkTree(root) }; };
  // one chain: a first run at hour 0 in `mode0`, then one run per later hour in `mode`, each reading the state of the one before
  const chain = async (name, hours, mode, mode0 = mode) => {
    const { root, tr } = fresh(name); const out = [];
    for (const [i, atH] of [0, ...hours].entries()) { const e = await runSt(root, tr, atH, { 'melt-state': i ? mode : mode0 }); out.push(e); if (e.err) break; take(tr, e); }
    return out;
  };
  const same = (a, b) => a.docRaw === b.docRaw && a.stateRaw === b.stateRaw && a.index === b.index && JSON.stringify(a.status) === JSON.stringify(b.status);
  const hypZb = (z0) => Array.from({ length: 8 }, (_, i) => z0 + 50 * (i + 0.5));
  // by hand: after `hours` hours every band holds hours · 3 mm · 1,2 · (1 + 4 % per 100 m from the reference elevation) · solid share (0,1 mm in the file)
  const sweByHand = (z0, zRef, hours) => hypZb(z0).map((z) => { const Tb = -2 + 0.0065 * (zRef - z); return hours * 3 * 1.2 * (1 + (0.04 * (z - zRef)) / 100) * Math.min(1, Math.max(0, (2 - Tb) / 2)); });
  const stateIs = (s, id, hand, tol = 0.051) => s?.[id]?.[0]?.length === 8 && s[id][0].every((x, i) => Math.abs(x - hand[i]) <= tol);
  const cases = [['gl_ch_alpha', 2400, 2900], ['gl_ch_beta', 2500, 2800], ['gl_ch_gamma', 2600, 2900], ['gl_ch_far', 2600, 2750]];   // gamma: own bands, alpha's forcing
  const allAre = (s, hours, tol) => cases.every(([id, z0, zRef]) => stateIs(s, id, sweByHand(z0, zRef, hours), tol));

  // the switch
  const d0 = fresh('st-default'), d1 = fresh('st-ahead'), d2 = fresh('st-rh'), d3 = fresh('st-rh2'), d4 = fresh('st-word'), d5 = fresh('st-env'), d6 = fresh('st-envarg');
  const eDef = await runSt(d0.root, d0.tr, 0), eAhead = await runSt(d1.root, d1.tr, 0, { 'melt-state': 'ahead' }), eRh = await runSt(d2.root, d2.tr, 0, { 'melt-state': 'run-hour' }), eRh2 = await runSt(d3.root, d3.tr, 0, { 'melt-state': 'run-hour' });
  const eWord = await runSt(d4.root, d4.tr, 0, { 'melt-state': 'laufstunde' });
  process.env.GLACIER_MELT_STATE = 'run-hour';
  const eEnv = await runSt(d5.root, d5.tr, 0), eEnvArg = await runSt(d6.root, d6.tr, 0, { 'melt-state': 'ahead' });
  delete process.env.GLACIER_MELT_STATE;
  add('I3 Schalter: ohne Angabe dieselben Bytes wie „ahead“ (Dokument, Zustand, Zeiger, Statuszeile) — der Zustand steht 6 h hinter der Laufstunde, trägt keinen Antrieb, Dokument und Statuszeile nennen keinen Modus; „run-hour“ schreibt andere Dateien (zweimal gerechnet dieselben Bytes); ein unbekanntes Wort bricht ab und schreibt nichts; GLACIER_MELT_STATE=run-hour wirkt wie der Schalter, ein Schalter daneben gewinnt',
    !eDef.err && !eAhead.err && !eRh.err && same(eDef, eAhead) && eDef.file.atMs === T0N + 6 * H && eDef.file.pend === undefined && !('mode' in eDef.doc.state) && !('state' in eDef.status.lines.melt)
    && !same(eRh, eDef) && eRh.stateRaw !== eDef.stateRaw && eRh.docRaw !== eDef.docRaw && same(eRh, eRh2) && /--melt-state=laufstunde: unbekannt/.test(eWord.err ?? '') && eWord.wrote === false && !eEnv.err && same(eEnv, eRh) && same(eEnvArg, eDef),
    JSON.stringify({ err: [eDef.err, eAhead.err, eRh.err, eWord.err, eEnv.err, eEnvArg.err] }));
  const fcG = synthFc(); fcG.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = T0N + i * H; });
  const gRun = forcingFromForecast(fcG, { lat: 46.5, lon: 8.4, zRef: 2900, t0Ms: T0N }).g;
  const fA = eRh.file, hourG = (i) => Math.round(gRun[i]);
  add('I4 Datei mit „run-hour“: die Zeit ist die LAUFSTUNDE, der Zustand der, mit dem der Lauf begann (Kaltstart ⇒ null Schneewasser an jedem Band), dazu der Antrieb der nächsten 18 Stunden je Antriebsgeber (alpha, beta, far: −2 °C, 3 mm, Strahlung wie im Lauf, Bezugshöhe) und die Zuordnung gamma → alpha; die Datei besteht den Vertrag; Dokument: cold, Modus genannt, nichts nachgerechnet; die Statuszeile nennt den Modus',
    fA.atMs === T0N && fA.schema === 1 && cases.every(([id]) => fA.g[id][0].every((x) => x === 0) && fA.g[id][0].length === 8) && fA.pend.h === 18 && Object.keys(fA.pend.f).sort().join() === 'gl_ch_alpha,gl_ch_beta,gl_ch_far'
    && JSON.stringify(fA.pend.o) === '{"gl_ch_gamma":"gl_ch_alpha"}' && fA.pend.f.gl_ch_alpha[0] === 2900 && fA.pend.f.gl_ch_beta[0] === 2800 && fA.pend.f.gl_ch_alpha[1].every((x) => x === -2) && fA.pend.f.gl_ch_alpha[4].every((x) => x === 3)
    && fA.pend.f.gl_ch_alpha[3].every((x, i) => x === hourG(i)) && fA.pend.f.gl_ch_alpha[3].some((x) => x > 100) && meltStateProblems(fA).length === 0
    && JSON.stringify(eRh.doc.state) === '{"source":"cold","ageH":null,"nudged":0,"mode":"run-hour","replayedH":0,"held":0}' && eRh.status.lines.melt.state === 'run-hour' && meltProblems(eRh.doc).length === 0,
    JSON.stringify({ state: eRh.doc?.state, o: fA.pend?.o, p: meltStateProblems(fA).slice(0, 3) }));

  // the 3-hour distance — the reason for the package
  const a3 = await chain('st-ahead-3', [3], 'ahead'), r3 = await chain('st-rh-3', [3], 'run-hour');
  add('I5 Lauf 3 h nach dem vorigen: „ahead“ verwirft den Zustand (cold — das Verhalten bis heute, Gegenprobe); „run-hour“ übernimmt ihn (carried, Alter 0, 3 h nachgerechnet) und beginnt mit dem Schnee von genau 3 Stunden — von Hand 3 · 3 mm · 1,2 · Gradient · Schneeanteil an allen Bändern von vier Gletschern, auch am Gletscher mit Nachbar-Antrieb (eigene Bänder); mit 6 Stunden gerechnet passt es nicht',
    a3[1]?.doc?.state.source === 'cold' && a3[1].doc.state.ageH === null && r3[1]?.doc?.state.source === 'carried' && r3[1].doc.state.ageH === 0 && r3[1].doc.state.replayedH === 3 && r3[1].doc.state.held === 0
    && r3[1].file.atMs === T0N + 3 * H && allAre(r3[1].state, 3) && !allAre(r3[1].state, 6) && !stateIs(r3[1].state, 'gl_ch_gamma', sweByHand(2600, 2750, 3)),
    JSON.stringify({ ahead: a3[1]?.doc?.state ?? a3[1]?.err, rh: r3[1]?.doc?.state ?? r3[1]?.err, alpha: r3[1]?.state?.gl_ch_alpha?.[0], hand: sweByHand(2400, 2900, 3) }));
  const a6 = await chain('st-ahead-6', [6], 'ahead'), r6 = await chain('st-rh-6', [6], 'run-hour');
  add('I6 Lauf 6 h nach dem vorigen: beide Wege beginnen mit demselben Schnee (6 Stunden von Hand; der Zustand von „run-hour“ gleicht Band für Band der Datei, die „ahead“ im Lauf davor geschrieben hat) und schreiben dieselben Gletscherzeilen ins Schmelzdokument',
    a6[1]?.doc?.state.source === 'carried' && a6[1].doc.state.ageH === 0 && r6[1]?.doc?.state.source === 'carried' && r6[1].doc.state.ageH === 0 && r6[1].doc.state.replayedH === 6 && allAre(r6[1].state, 6) && allAre(a6[0].state, 6)
    && JSON.stringify(r6[1].state) === JSON.stringify(a6[0].state) && JSON.stringify(r6[1].doc.glaciers) === JSON.stringify(a6[1].doc.glaciers) && r6[1].doc.glaciers.length === 4,
    JSON.stringify({ ahead: a6[1]?.doc?.state ?? a6[1]?.err, rh: r6[1]?.doc?.state ?? r6[1]?.err }));
  const a15 = await chain('st-ahead-15', [15], 'ahead'), r15 = await chain('st-rh-15', [15], 'run-hour'), r24 = await chain('st-rh-24', [24], 'run-hour'), r49 = await chain('st-rh-49', [49], 'run-hour'), r48 = await chain('st-rh-48', [48], 'run-hour');
  add('I7 längere Abstände: nach 15 h beginnt „run-hour“ mit 15 Stunden Schnee (Alter 0), „ahead“ mit 6 (Alter 9 — neun Stunden fehlen, Gegenprobe); nach 24 h rechnet „run-hour“ die gespeicherten 18 Stunden nach und nennt 6 fehlende (ageH 6), nach 48 h 18 und 30; nach 49 h (31 fehlende) Kaltstart ohne Alter',
    r15[1]?.doc?.state.ageH === 0 && r15[1].doc.state.replayedH === 15 && allAre(r15[1].state, 15) && a15[1]?.doc?.state.source === 'carried' && a15[1].doc.state.ageH === 9 && !allAre(a15[1].state, 15, 5)
    && r24[1]?.doc?.state.source === 'carried' && r24[1].doc.state.ageH === 6 && r24[1].doc.state.replayedH === 18 && allAre(r24[1].state, 18) && r48[1]?.doc?.state.ageH === 30 && r48[1].doc.state.replayedH === 18 && allAre(r48[1].state, 18)
    && r49[1]?.doc?.state.source === 'cold' && r49[1].doc.state.ageH === null && r49[1].doc.state.replayedH === 0 && cases.every(([id]) => r49[1].state[id][0].every((x) => x === 0)),
    JSON.stringify([r15[1]?.doc?.state ?? r15[1]?.err, a15[1]?.doc?.state, r24[1]?.doc?.state, r48[1]?.doc?.state, r49[1]?.doc?.state]));
  const r33 = await chain('st-rh-3-3', [3, 6], 'run-hour'), r3333 = await chain('st-rh-3333', [3, 6, 9, 12], 'run-hour');
  add('I8 die Taktung ist gleichgültig: 3 h + 3 h ergibt den Zustand von 6 h am Stück, vier Läufe im 3-Stunden-Abstand den von 12 Stunden (von Hand, auf die Rundung der Datei genau); jeder Lauf der Kette sagt carried, Alter 0',
    r33.length === 3 && allAre(r33[2].state, 6, 0.11) && r33[2].state.gl_ch_alpha[0].every((x, i) => Math.abs(x - r6[1].state.gl_ch_alpha[0][i]) <= 0.11) && r3333.length === 5 && allAre(r3333[4].state, 12, 0.21)
    && [...r33.slice(1), ...r3333.slice(1)].every((e) => e.doc.state.source === 'carried' && e.doc.state.ageH === 0 && e.doc.state.replayedH === 3), JSON.stringify(r3333.map((e) => e.doc?.state ?? e.err)));
  // the two transitions of switching on and falling back
  const tOn = await chain('st-on-6', [6], 'run-hour', 'ahead'), tOn3 = await chain('st-on-3', [3], 'run-hour', 'ahead'), tOff = await chain('st-off-6', [6], 'ahead', 'run-hour'), tOff3 = await chain('st-off-3', [3], 'ahead', 'run-hour');
  add('I9 Übergänge: der erste Lauf mit „run-hour“ findet eine Datei ohne Antrieb und beurteilt sie nach der alten Regel (6 h später: übernommen, nichts nachgerechnet, Schnee von 6 Stunden; 3 h später: Kaltstart) und schreibt selbst die neue Form; der Rückfall „ahead“ liest eine Datei mit Antrieb ohne Absturz als Zustand dieses Alters (ageH 6 bzw. 3, der Schnee der Stunden dazwischen fehlt und ist benannt) und schreibt wieder die alte Form',
    tOn[1]?.doc?.state.source === 'carried' && tOn[1].doc.state.ageH === 0 && tOn[1].doc.state.replayedH === 0 && allAre(tOn[1].state, 6) && tOn[1].file.pend?.h === 18 && tOn[1].file.atMs === T0N + 6 * H && tOn3[1]?.doc?.state.source === 'cold'
    && tOff[1]?.doc?.state.source === 'carried' && tOff[1].doc.state.ageH === 6 && !('mode' in tOff[1].doc.state) && tOff[1].file.pend === undefined && tOff[1].file.atMs === T0N + 12 * H && allAre(tOff[1].state, 6)
    && tOff3[1]?.doc?.state.source === 'carried' && tOff3[1].doc.state.ageH === 3, JSON.stringify([tOn[1]?.doc?.state ?? tOn[1]?.err, tOn3[1]?.doc?.state, tOff[1]?.doc?.state ?? tOff[1]?.err, tOff3[1]?.doc?.state]));

  // melt, not only accumulation: a hand-made file (50 mm of snow, a warm sunny afternoon with a shower), advanced 5 hours — against the core called directly
  {
    const tH = [5, 6, 7, 6, 5, 4, 3, 2, 1, 0, -1, -2, -2, -2, -2, -2, -2, -2], gH = [300, 400, 500, 400, 300, 200, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pH = [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const row = (zRef, dT = 0) => [zRef, tH.map((x) => x + dT), tH.map(() => null), gH, pH];
    const g0 = Object.fromEntries(cases.map(([id]) => [id, [new Array(8).fill(50), new Array(8).fill(600)]]));
    const handFile = { schema: 1, kind: 'glacier/melt-state', atMs: T0N, g: g0, pend: { h: 18, f: { gl_ch_alpha: row(2900), gl_ch_beta: row(2800, 1), gl_ch_far: row(2750) }, o: { gl_ch_gamma: 'gl_ch_alpha' } } };
    const hypI = (z0) => ({ z0, a: [0.1, 0.3, 0.5, 0.6, 0.5, 0.3, 0.2, 0.1] });
    // the core by hand: temperature moved from the owner's reference elevation to the glacier's median band with the standard lapse (no freezing level in the file)
    const expect = (z0, zRef, ela, dT, hours, TF = 0.05, swe0 = 50) => {
      const bands = bandsOf(hypI(z0)), zMed = bands.zb[4];
      const r = simulate({ bands, ela, t: Float64Array.from(tH.slice(0, hours), (x) => x + dT - 0.0065 * (zMed - zRef)), g: Float64Array.from(gH.slice(0, hours)), p: Float64Array.from(pH.slice(0, hours)), zT: zMed, zP: zRef, pf: 1.2, TF, SRF: 0.008, state: { swe: new Float64Array(8).fill(swe0), aS: new Float64Array(8).fill(0.6) }, model: 'eti' });
      return JSON.stringify([Array.from(r.state.swe, (x) => Math.round(x * 10) / 10), Array.from(r.state.aS, (x) => Math.round(x * 1000))]);
    };
    const w = fresh('st-warm'); take(w.tr, JSON.stringify(handFile));
    const eW = await runSt(w.root, w.tr, 5, { 'melt-state': 'run-hour' });
    const got = (id) => JSON.stringify(eW.state?.[id]);
    add('I10 Nachrechnen mit Schmelze: aus 50 mm Schnee und fünf warmen Stunden (5–7 °C, bis 500 W/m², ein Schauer) wird genau der Zustand, den der Schmelzkern direkt gerechnet ergibt — am Gletscher mit eigenem Antrieb, an einem mit +1 K und am Gletscher mit Nachbar-Antrieb (eigene Bänder und Gleichgewichtslinie, Temperatur von 2 900 m auf die eigene Medianhöhe); der Schnee ist dabei weniger geworden; Gegenproben: 4 Stunden, ohne Temperaturfaktor oder mit der Bezugshöhe des Gletschers selbst passt es nicht',
      !eW.err && meltStateProblems(handFile).length === 0 && eW.doc.state.source === 'carried' && eW.doc.state.replayedH === 5 && got('gl_ch_alpha') === expect(2400, 2900, 2900, 0, 5) && got('gl_ch_beta') === expect(2500, 2800, 2800, 1, 5)
      && got('gl_ch_gamma') === expect(2600, 2900, 2750, 0, 5) && got('gl_ch_far') === expect(2600, 2750, 2750, 0, 5) && eW.state.gl_ch_alpha[0].every((x) => x < 45)
      && got('gl_ch_alpha') !== expect(2400, 2900, 2900, 0, 4) && got('gl_ch_alpha') !== expect(2400, 2900, 2900, 0, 5, 0) && got('gl_ch_gamma') !== expect(2600, 2750, 2750, 0, 5) && got('gl_ch_beta') !== expect(2500, 2800, 2800, 0, 5),
      JSON.stringify({ err: eW.err, state: eW.doc?.state, match: [got('gl_ch_alpha') === expect(2400, 2900, 2900, 0, 5), got('gl_ch_beta') === expect(2500, 2800, 2800, 1, 5), got('gl_ch_gamma') === expect(2600, 2900, 2750, 0, 5), got('gl_ch_far') === expect(2600, 2750, 2750, 0, 5)], got: eW.state?.gl_ch_alpha?.[0], want: JSON.parse(expect(2400, 2900, 2900, 0, 5))[0] }));
    // thin snow (4 mm, below the 5 mm at which the surface counts as bare): the melt of the hour depends on the albedo of ice or firn — the glacier's own line
    const thin = structuredClone(handFile); for (const id of Object.keys(thin.g)) thin.g[id][0] = new Array(8).fill(4);
    const t = fresh('st-thin'); take(t.tr, JSON.stringify(thin));
    const eT = await runSt(t.root, t.tr, 1, { 'melt-state': 'run-hour' });
    const gotT = (id) => JSON.stringify(eT.state?.[id]);
    add('I14 dünne Schneedecke (4 mm) beim Nachrechnen: die Schmelze der Stunde rechnet mit der Albedo der blanken Fläche nach der Gleichgewichtslinie des GLETSCHERS (Eis darunter, Firn darüber) — eine Stunde, drei Gletscher, gegen den Kern; Gegenprobe: mit der Linie 0 (alles Firn) passt es nicht',
      !eT.err && eT.doc.state.replayedH === 1 && gotT('gl_ch_alpha') === expect(2400, 2900, 2900, 0, 1, 0.05, 4) && gotT('gl_ch_gamma') === expect(2600, 2900, 2750, 0, 1, 0.05, 4) && gotT('gl_ch_far') === expect(2600, 2750, 2750, 0, 1, 0.05, 4)
      && gotT('gl_ch_alpha') !== expect(2400, 2900, 0, 0, 1, 0.05, 4) && gotT('gl_ch_gamma') !== expect(2600, 2900, 0, 0, 1, 0.05, 4), JSON.stringify({ err: eT.err, got: eT.state?.gl_ch_alpha?.[0], want: JSON.parse(expect(2400, 2900, 2900, 0, 1, 0.05, 4))[0], firn: JSON.parse(expect(2400, 2900, 0, 0, 1, 0.05, 4))[0] }));
    // a glacier whose forcing owner is missing in the file keeps its state, counted
    const hf2 = structuredClone(handFile); delete hf2.pend.f.gl_ch_beta;
    const h = fresh('st-held'); take(h.tr, JSON.stringify(hf2));
    const eH = await runSt(h.root, h.tr, 5, { 'melt-state': 'run-hour' });
    add('I11 fehlt der Antrieb eines Gletschers in der Datei, behält er seinen Zustand ohne Nachrechnen und wird gezählt (held 1); die anderen werden nachgerechnet; der Vertrag meldet eine solche Datei',
      !eH.err && eH.doc.state.held === 1 && JSON.stringify(eH.state.gl_ch_beta) === JSON.stringify(g0.gl_ch_beta) && got('gl_ch_alpha') === JSON.stringify(eH.state.gl_ch_alpha) && meltStateProblems(hf2).some((p) => /gl_ch_beta: Zustand ohne Antrieb/.test(p)), JSON.stringify(eH.doc?.state ?? eH.err));
    // the satellite nudge comes AFTER the advance
    const n = fresh('st-nudge');
    const ix = JSON.parse(readFileSync(join(n.tr.data, 'index.json'), 'utf8'));
    writeFileSync(join(n.tr.data, 'index.json'), JSON.stringify({ ...ix, sat: { updatedAt: '2026-10-09T00:00:00Z', newest: {}, seasons: { 2026: { 'ch-test': '20261009T0000Z' } } } }));
    mkdirSync(join(n.tr.data, 'season', '2026', 'ch-test'), { recursive: true });
    writeFileSync(join(n.tr.data, 'season', '2026', 'ch-test', '20261009T0000Z.json'), JSON.stringify({ schema: 1, kind: 'glacier/season', year: 2026, region: 'ch-test', stand: '20261009T0000Z', cols: [], glaciers: { gl_ch_alpha: [['2026-09-28', 0.95, 0.5, 1, 2600, 0.4, null, null, 0]] } }));
    take(n.tr, eRh);   // the cold `run-hour` state of hour 0 (zeros and −2 °C / 3 mm)
    const eN = await runSt(n.root, n.tr, 3, { 'melt-state': 'run-hour' });
    const zbA = hypZb(2400);
    add('I12 der Satelliten-Abgleich greift NACH dem Nachrechnen: unter der Schneegrenze der Szene (2 600 m) ist der nachgerechnete Schnee wieder weg (0), darüber stehen die 250 mm des Abgleichs; der nicht abgeglichene Nachbar trägt den Schnee der 3 Stunden',
      !eN.err && eN.doc.state.nudged === 1 && eN.doc.state.replayedH === 3 && eN.state.gl_ch_alpha[0].every((x, i) => x === (zbA[i] >= 2600 ? 250 : 0)) && stateIs(eN.state, 'gl_ch_beta', sweByHand(2500, 2800, 3)), JSON.stringify({ state: eN.doc?.state ?? eN.err, alpha: eN.state?.gl_ch_alpha?.[0] }));
    // the contract of the file
    const badOf = (f) => { const s = structuredClone(handFile); f(s); return meltStateProblems(s).length; };
    const caught = [(s) => { s.pend.h = -1; }, (s) => { s.pend.h = 17; }, (s) => { delete s.pend.f; }, (s) => { s.pend.f.gl_ch_alpha[1][3] = 'kalt'; }, (s) => { s.pend.f.gl_ch_alpha[4][2] = -1; }, (s) => { s.pend.f.gl_ch_alpha[3][0] = -5; }, (s) => { s.pend.f.gl_ch_alpha.pop(); },
      (s) => { s.pend.f.gl_ch_alpha[0] = null; }, (s) => { s.pend.o.gl_ch_gamma = 'gl_ch_nirgends'; }, (s) => { delete s.pend.o.gl_ch_gamma; }, (s) => { s.pend.f.gl_ch_far[2].push(1); }].map(badOf);
    add('I13 Vertrag der Zustandsdatei mit Antrieb: elf Verletzungen, jede gemeldet (Stundenzahl, Länge, Nicht-Zahl, negative Strahlung, negativer Niederschlag, fehlende Reihe, fehlende Bezugshöhe, unbekannter oder fehlender Antriebsgeber); die Datei selbst und eine Datei der alten Form haben keine',
      caught.length === 11 && caught.every((k) => k > 0) && meltStateProblems(handFile).length === 0 && meltStateProblems({ schema: 1, kind: 'glacier/melt-state', atMs: 1, g: g0 }).length === 0, JSON.stringify(caught));
  }
  // --- J: phase GM (GM-4, E-GM-22, M-18) — the satellite nudge once per scene (`--sat-nudge=once`); `every` = as always --------------------------
  try {
    // `same` of block I compares RUN RESULTS (docRaw, stateRaw …); plain values need their own comparison
    const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    const putSeason = (tr, date) => {
      const ix = JSON.parse(readFileSync(join(tr.data, 'index.json'), 'utf8'));
      writeFileSync(join(tr.data, 'index.json'), JSON.stringify({ ...ix, sat: { updatedAt: '2026-10-09T00:00:00Z', newest: {}, seasons: { 2026: { 'ch-test': '20261009T0000Z' } } } }));
      mkdirSync(join(tr.data, 'season', '2026', 'ch-test'), { recursive: true });
      writeFileSync(join(tr.data, 'season', '2026', 'ch-test', '20261009T0000Z.json'), JSON.stringify({ schema: 1, kind: 'glacier/season', year: 2026, region: 'ch-test', stand: '20261009T0000Z', cols: [], glaciers: { gl_ch_alpha: [[date, 0.95, 0.5, 1, 2600, 0.4, null, null, 0]] } }));
    };
    const dueOk = satRowDue('every', '2026-09-28', '2026-09-28') && satRowDue('once', '2026-09-28', null) && !satRowDue('once', '2026-09-28', '2026-09-28') && !satRowDue('once', '2026-09-27', '2026-09-28') && satRowDue('once', '2026-09-29', '2026-09-28');
    add('J1 Schalter des Satelliten-Abgleichs (rein): ab Werk „every“, erlaubt „every“ und „once“, ein unbekanntes Wort wirft; eine Zeile greift unter „every“ immer, unter „once“ nur ohne Vermerk oder wenn sie jünger ist als die vermerkte',
      SAT_NUDGE_DEFAULT === 'every' && SAT_NUDGE_MODES.join() === 'every,once' && satNudgeModeOf(undefined) === 'every' && satNudgeModeOf('') === 'every' && satNudgeModeOf('once') === 'once'
      && (() => { try { satNudgeModeOf('einmal'); return false; } catch (e) { return /--sat-nudge=einmal: unbekannt/.test(e.message); } })() && dueOk);
    // byte identity: with a scene in the store, no word = `every` in both state modes; `once` changes only its own fields in the first run
    const j = {};
    for (const [k, extra] of [['def', {}], ['every', { 'sat-nudge': 'every' }], ['once', { 'sat-nudge': 'once' }], ['defRh', { 'melt-state': 'run-hour' }], ['everyRh', { 'melt-state': 'run-hour', 'sat-nudge': 'every' }], ['onceRh', { 'melt-state': 'run-hour', 'sat-nudge': 'once' }], ['word', { 'sat-nudge': 'einmal' }]]) {
      const f = fresh(`sat-${k}`); putSeason(f.tr, '2026-09-28'); j[k] = { ...(await runSt(f.root, f.tr, 0, extra)), tr: f.tr, root: f.root };
    }
    process.env.GLACIER_SAT_NUDGE = 'once';
    { const f = fresh('sat-env'); putSeason(f.tr, '2026-09-28'); j.env = await runSt(f.root, f.tr, 0); }
    delete process.env.GLACIER_SAT_NUDGE;
    const without = (e) => { const d = JSON.parse(e.docRaw); delete d.state.sat; const s = JSON.parse(e.stateRaw); delete s.sat; const st = structuredClone(e.status); delete st.lines.melt.sat; return JSON.stringify([d, s, e.index, st]); };
    add('J2 ohne Angabe dieselben Bytes wie „every“ (Dokument, Zustand, Zeiger, Statuszeile), in beiden Zustandsformen; „once“ ändert im ersten Lauf nur die eigenen Felder (Dokument `state.sat`, Zustand `sat`, Statuszeile `sat`) — der Abgleich greift dort wie bisher; die Umgebungsvariable wirkt wie der Schalter; ein unbekanntes Wort bricht ab und schreibt nichts',
      !j.def.err && same(j.def, j.every) && same(j.defRh, j.everyRh) && j.def.file.sat === undefined && !('sat' in j.def.doc.state) && !('sat' in j.def.status.lines.melt) && j.def.doc.state.nudged === 1
      && without(j.once) === without(j.def) && without(j.onceRh) === without(j.defRh) && eq(j.once.doc.state.sat, { rule: 'once', applied: 1, held: 0 }) && eq(j.once.file.sat, { gl_ch_alpha: '2026-09-28' }) && j.once.status.lines.melt.sat === 'once'
      && meltStateProblems(j.once.file).length === 0 && meltStateProblems(j.onceRh.file).length === 0 && same(j.env, j.once) && /--sat-nudge=einmal: unbekannt/.test(j.word.err ?? '') && j.word.wrote === false,
      JSON.stringify({ err: [j.def.err, j.once.err, j.word.err], once: j.once.doc?.state, file: j.once.file?.sat }));
    // the chain: B 3 h after A (run-hour), the same scene — `every` nudges again, `once` keeps the snow of the 3 hours below the scene's snow line
    const zbA = hypZb(2400), add3 = sweByHand(2400, 2900, 3);
    const chain = async (name, mode, { date = '2026-09-28', state = null, atH = 3 } = {}) => { const f = fresh(name); putSeason(f.tr, date); if (state !== false) take(f.tr, state ?? (mode === 'once' ? j.onceRh : j.everyRh)); return runSt(f.root, f.tr, atH, { 'melt-state': 'run-hour', 'sat-nudge': mode }); };
    const bEvery = await chain('sat-b-every', 'every'), bOnce = await chain('sat-b-once', 'once');
    const alphaIs = (e, want) => e.state?.gl_ch_alpha?.[0]?.length === 8 && e.state.gl_ch_alpha[0].every((x, i) => Math.abs(x - want[i]) <= 0.051);
    add('J3 dieselbe Szene im nächsten Lauf (3 h später): „every“ löscht unter ihrer Schneegrenze (2 600 m) den Schnee der 3 Stunden wieder (0) — „once“ lässt ihn liegen (von Hand: Schnee der 3 Stunden), darüber stehen in beiden 250 mm plus der Schnee der 3 Stunden; „once“ zählt die Szene als gehalten (held 1, applied 0) und trägt den Vermerk weiter; der Nachbar ohne Szene ist in beiden Wegen derselbe',
      !bEvery.err && !bOnce.err && bEvery.doc.state.replayedH === 3 && bOnce.doc.state.replayedH === 3
      && alphaIs(bEvery, zbA.map((z, i) => (z >= 2600 ? 250 + add3[i] : 0))) && alphaIs(bOnce, zbA.map((z, i) => (z >= 2600 ? 250 : 0) + add3[i]))
      && bEvery.doc.state.nudged === 1 && bOnce.doc.state.nudged === 0 && eq(bOnce.doc.state.sat, { rule: 'once', applied: 0, held: 1 }) && eq(bOnce.file.sat, { gl_ch_alpha: '2026-09-28' }) && JSON.stringify(bOnce.state.gl_ch_beta) === JSON.stringify(bEvery.state.gl_ch_beta),
      JSON.stringify({ every: bEvery.state?.gl_ch_alpha?.[0], once: bOnce.state?.gl_ch_alpha?.[0], st: bOnce.doc?.state ?? bOnce.err }));
    const cNew = await chain('sat-c-new', 'once', { date: '2026-10-05' }), cCold = await chain('sat-c-cold', 'once', { state: false }), cFut = await chain('sat-c-fut', 'once', { atH: -3 });
    const aheadA = await (async () => { const f = fresh('sat-ahead-a'); putSeason(f.tr, '2026-09-28'); take(f.tr, j.once); return runSt(f.root, f.tr, 6, { 'sat-nudge': 'once' }); })();
    add('J4 eine JÜNGERE Szene greift wieder und ersetzt den Vermerk; ein Zustand, der nicht übernommen wurde (Kaltstart ohne Datei, und eine Datei mit Vermerk, die in der Zukunft liegt und deshalb verworfen wird), nimmt die Szene erneut (der Vermerk gehört zum Zustand); in der Form „ahead“ trägt der Zustand den Vermerk ebenso (Lauf 6 h später: gehalten)',
      !cNew.err && cNew.doc.state.nudged === 1 && eq(cNew.doc.state.sat, { rule: 'once', applied: 1, held: 0 }) && eq(cNew.file.sat, { gl_ch_alpha: '2026-10-05' })
      && !cCold.err && cCold.doc.state.source === 'cold' && eq(cCold.doc.state.sat, { rule: 'once', applied: 1, held: 0 }) && eq(cCold.file.sat, { gl_ch_alpha: '2026-09-28' })
      && !cFut.err && cFut.doc.state.source === 'cold' && eq(cFut.doc.state.sat, { rule: 'once', applied: 1, held: 0 })
      && !aheadA.err && aheadA.doc.state.source === 'carried' && eq(aheadA.doc.state.sat, { rule: 'once', applied: 0, held: 1 }) && eq(aheadA.file.sat, { gl_ch_alpha: '2026-09-28' }),
      JSON.stringify({ nw: cNew.doc?.state ?? cNew.err, cold: cCold.doc?.state ?? cCold.err, ahead: aheadA.doc?.state ?? aheadA.err }));
    const badSat = [(s) => { s.sat = { gl_ch_alpha: '28.09.2026' }; }, (s) => { s.sat = { gl_ch_nirgends: '2026-09-28' }; }, (s) => { s.sat = ['2026-09-28']; }, (s) => { s.sat = { gl_ch_alpha: 20260928 }; }].map((f) => { const s = structuredClone(j.onceRh.file); f(s); return meltStateProblems(s).length; });
    add('J5 Vertrag des Vermerks: falsches Datum, Gletscher ohne Zustand, Liste statt Zuordnung, Zahl statt Datum — jede Verletzung gemeldet; eine Datei ohne Vermerk (alte Form) hat keine',
      badSat.every((k) => k > 0) && meltStateProblems(j.def.file).length === 0, JSON.stringify(badSat));
  } catch (e) { add('J0 Block J läuft ohne Absturz durch', false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')); }
} catch (e) { add('I0 Block I läuft ohne Absturz durch', false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')); }
// --- L: phase GM (V-GM-81) — the memory of the run in the status line -------------------------------------------------------------------------------
try {
  const MBy = 1024 * 1024, seq = [100, 900, 300, 250].map((v) => v * MBy);
  let i = 0;
  const w = memWatch({ heapUsed: () => seq[Math.min(i++, seq.length - 1)], peakRssKb: () => 2_871_296, heapLimit: () => 4144 * MBy });
  w.sample(); w.sample();   // the watch took 100 when it was made, now 900 and 300
  const line = w.line();    // one last sample: 250
  const own = memWatch().line();
  add('L1 Speicherzeile (rein), von Hand: von den Abtastungen 100 · 900 · 300 · 250 MB bleibt die höchste (900) — auch wenn die letzte niedriger ist, und die letzte wird beim Schreiben der Zeile noch genommen (vier Abtastungen); der Höchstwert des Prozesses kommt in Kilobyte und steht in MB da (2 871 296 kB ⇒ 2 804), die Grenze in Byte (⇒ 4 144); ohne Angaben liest die Zeile den eigenen Prozess: drei ganze Zahlen über null, der belegte Speicher nicht über der Grenze',
    JSON.stringify(line) === '{"rssMb":2804,"heapMb":900,"heapLimitMb":4144}' && i === 4 && [own.rssMb, own.heapMb, own.heapLimitMb].every((v) => Number.isInteger(v) && v > 0) && own.heapMb <= own.heapLimitMb, JSON.stringify({ line, i, own }));
  // in a run: the line is in the status file and nowhere else; the heap is sampled once per glacier of the run
  const mkL = (name) => { const root = join(tmp, name); const tr = mkTree(root); mkdirSync(join(tr.data, 'melt'), { recursive: true }); return { root, tr }; };
  const readL = (root, r) => { const rd = (rel) => readFileSync(join(root, rel), 'utf8'); return { doc: rd(`out/melt/${r.run}.json`), state: rd('out/melt/state.json'), index: rd('patch/index-patch.json'), status: JSON.parse(rd('patch/status-patch.json')) }; };
  const a = mkL('l-a'), b = mkL('l-b'), c = mkL('l-c');
  let samples = 0;
  const rA = await run1(a.root, { calibration: a.tr.calFile }), rB = await run1(b.root, { calibration: b.tr.calFile });
  const rC = await run1(c.root, { calibration: c.tr.calFile, memWatch: () => ({ sample: () => { samples++; }, line: () => ({ rssMb: 11, heapMb: 7, heapLimitMb: 13 }) }) });
  const eA = readL(a.root, rA), eB = readL(b.root, rB), eC = readL(c.root, rC), m = eA.status.lines.melt.mem, dA = JSON.parse(eA.doc);
  const bare = (e) => { const s = structuredClone(e.status); delete s.lines.melt.mem; delete s.lines.melt.seconds; return JSON.stringify(s); };
  add('L2 Speicherzeile im Lauf: `lines.melt.mem` trägt genau drei ganze Zahlen über null (`rssMb`, `heapMb`, `heapLimitMb`), der belegte Speicher liegt nicht über der Grenze; die Zeile steht NUR in der Statuszeile — Dokument, Zustand und Zeiger nennen sie nicht und sind in zwei Läufen Byte für Byte gleich, die Statuszeile ohne `mem` und die Laufzeit ebenso; abgetastet wird einmal je Gletscher des Laufs (Zeilen + Übersprungene), und die Zeile ist die der Messung (eine untergeschobene Messung steht Zahl für Zahl in der Statuszeile, ohne dass sich sonst ein Byte ändert)',
    !!m && JSON.stringify(Object.keys(m)) === '["rssMb","heapMb","heapLimitMb"]' && Object.values(m).every((v) => Number.isInteger(v) && v > 0) && m.heapMb <= m.heapLimitMb
    && ![eA.doc, eA.state, eA.index].some((x) => /"mem"|rssMb|heapMb/.test(x)) && eA.doc === eB.doc && eA.state === eB.state && eA.index === eB.index && bare(eA) === bare(eB)
    && samples === dA.glaciers.length + dA.skipped.length && samples > 3 && JSON.stringify(eC.status.lines.melt.mem) === '{"rssMb":11,"heapMb":7,"heapLimitMb":13}' && eC.doc === eA.doc && eC.state === eA.state && eC.index === eA.index && bare(eC) === bare(eA),
    JSON.stringify({ m, samples, rows: dA.glaciers.length, skipped: dA.skipped.length, melt: eA.status.lines.melt }));
  // the HIGHEST of the process, not what it holds now: a child process takes 300 MB, lets them go, and reads the line afterwards
  const child = execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import { memWatch } from ${JSON.stringify(new URL('./glacier/lib/runmem.mjs', import.meta.url).href)};
    let a = Buffer.alloc(300 * 1024 * 1024, 1); const during = process.memoryUsage.rss(); a = null; globalThis.gc();
    setTimeout(() => { globalThis.gc(); console.log(JSON.stringify({ during: Math.round(during / 1048576), now: Math.round(process.memoryUsage.rss() / 1048576), line: memWatch().line() })); }, 300);`], { encoding: 'utf8' });
  const cm = JSON.parse(child.trim().split('\n').pop());
  // (where the system takes freed memory back — measured on win32: 351 MB while held, 51 MB afterwards — a line built from the CURRENT size would fall short here;
  // where it does not, the check cannot tell the two apart, but it never turns red for that reason)
  add('L3 Speicherzeile, der HÖCHSTWERT des Prozesses und nicht der Stand von jetzt: ein eigener Prozess belegt 300 MB, gibt sie frei und liest danach die Zeile — `rssMb` nennt weiter den Stand mit den 300 MB (auf 20 MB)',
    cm.during > 300 && cm.line.rssMb >= cm.during - 20, JSON.stringify(cm));
} catch (e) { add('L0 Block L läuft ohne Absturz durch', false, String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')); }
// protected paths
{
  let detail = 'kein origin/main (CI-Klon)', ok = true;
  try {
    const out = execFileSync('git', ['diff', '--stat', 'origin/main...HEAD', '--', 'src/pointForecast', 'src/point', 'scripts/point', 'scripts/punktarchiv'], { cwd: join(HERE, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    ok = out.trim() === ''; detail = ok ? 'Diff leer' : out.slice(0, 300);
  } catch { /* shallow clone without origin/main: nothing to compare */ }
  add('G11 Geschützte Pfade unberührt: git diff origin/main...HEAD für src/pointForecast, src/point, scripts/point, scripts/punktarchiv ist leer', ok, detail);
}

rmSync(tmp, { recursive: true, force: true });
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-melt ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
