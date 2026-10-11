/**
 * verify:glacier-melt — Phase GL, package GL-3 (audit/gletscher.md §GL-3): the melt core against the real glacier-year of Rhonegletscher 2024
 * (`scripts/lib/fixtures/glacier/melt-case.json`, expected values computed independently by `py/gate_c.py`), hand calculations of single hours, the
 * freezing-level lapse, the scenario sums (quantile of sums — never a sum of quantiles), the unit gate (no millimetres without a passed Gate C),
 * the repeat guard, and `melt.mjs` end to end with a stubbed buscosun Fusion (state carried, satellite nudge, class C with neighbour forcing,
 * retention 72 h, climatology missing ⇒ job red). Every rule with a negative control.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-melt.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, readdirSync, rmSync, cpSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MELT, bandsOf, emptyState, simulate, scenarioPaths, quantile } from './glacier/lib/meltcore.mjs';
import {
  lapseOf, tempAt, fillShortGaps, forcingFromForecast, meltOfForcing, dailySums, impliedSnowline, nudgeState, seedOf, runGlacier, repeatVerdict, assertClima, main,
  MELT_SNOW_NUDGE_MM,
} from './glacier/melt.mjs';
import { fusionStageNote, fusionStage, FUSION_CURRENT } from '../src/pointForecast/fusion/fusionRelease.ts';
import { meltProblems, meltStateProblems, meltIndexOf, GLACIER_MELT_REF_DAILY_MM, GLACIER_MELT_SCENARIOS, GLACIER_MELT_RHO } from '../src/glacier/glacierMeltContract.ts';

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
const run1 = async (root, extra = {}) => main({ data: join(root, 'data'), cube: join(root, 'cube'), out: join(root, 'out'), calibration: join(root, 'cal.json'), now: new Date(NOW).toISOString(), forecast, ioFactory: okIo, always: true, ...extra });
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
  const rep = await main({ data: tr1.data, cube: tr1.cube, out: join(root1, 'out2'), calibration: tr1.calFile, now: new Date(NOW + 1 * H).toISOString(), forecast, ioFactory: okIo });
  add('G5 Zweiter Aufruf mit unveränderten t2/t3 schreibt nichts (übersprungen mit Grund), ein neuer t2 startet den Lauf', rep.skipped === true && /unverändert/.test(rep.reason) && !existsSync(join(root1, 'out2')), JSON.stringify(rep));
  writeFileSync(join(tr1.cube, 'point', 'index.json'), JSON.stringify({ latestByTier: { t1: { run: '2026101006' }, t2: { run: '2026101006' }, t3: { run: '2026101000' } } }));
  const T1 = NOW + 6 * H;
  const r2 = await main({ data: tr1.data, cube: tr1.cube, out: join(root1, 'out3'), calibration: tr1.calFile, now: new Date(T1).toISOString(), forecast: async (o) => { const fc = await forecast(o); fc.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = Math.floor(T1 / H) * H + i * H; }); return fc; }, ioFactory: okIo });
  const d2 = JSON.parse(readFileSync(join(root1, 'out3', 'melt', `${r2.run}.json`), 'utf8'));
  add('G6 Neuer Lauf: der Zustand des vorigen Laufs wird übernommen (carried, Alter 0 h bei Lauf + 6 h), das alte Dokument bleibt (72 h), der neue kommt dazu', d2.state.source === 'carried' && d2.state.ageH === 0 && existsSync(join(root1, 'out3', 'melt', `${r1.run}.json`)) && existsSync(join(root1, 'out3', 'melt', `${r2.run}.json`)), JSON.stringify(d2.state));
  // state older than 30 h ⇒ cold, named
  const r3 = await main({ data: tr1.data, cube: tr1.cube, out: join(root1, 'out4'), calibration: tr1.calFile, now: new Date(NOW + 40 * H).toISOString(), forecast: async (o) => { const fc = await forecast(o); fc.cube.v2.axis.steps.forEach((s, i) => { s.validAtMs = Math.floor((NOW + 40 * H) / H) * H + i * H; }); return fc; }, ioFactory: okIo, always: true });
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
  try { await main({ data: tr.data, cube: tr.cube, out: join(root, 'out'), calibration: tr.calFile, now: new Date(NOW).toISOString(), forecast, ioFactory: () => ({ clima: async () => null }), always: true }); } catch (e) { err = String(e.message ?? e); }
  let err2 = null; try { await assertClima({ clima: async () => ({}) }); } catch (e) { err2 = e; }
  add('G10 Ohne Klimatologie (public/climaGrid.json) bricht der Lauf mit Fehler ab (roter Job, Lehre V-SW-18) und schreibt nichts; mit Klimatologie kein Fehler (Gegenprobe)', /Klimatologie/.test(err ?? '') && !existsSync(join(root, 'out')) && err2 === null, String(err));
}
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
