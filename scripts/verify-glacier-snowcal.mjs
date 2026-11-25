/**
 * verify:glacier-snowcal — Phase GM-3 (`audit/gletscher-schneemodell.md` §3c): the calibration of the glacier snow model.
 * Truth builder, forcing loader, the fast band recursion against the melt core, the fit (recovery of known parameters, region fall-back, hold-out),
 * the density run on real study-plot days, the table against its rules and against the reports, the verdict and the selection recomputed from the
 * reported numbers, the frozen method by hash — on REAL data in the form the calibration reads (`scripts/lib/fixtures/glacier/snowcal/`).
 * Every check that claims something is right has a counter-check.
 * Block G (GM-3b, audit §3d): the two switches that let the table into the run (precipitation factor per country, new-snow density) — both ON by
 * default since 23.11. (E-GM-12, audit §3e), the readers without the profile, the second set of constants of the snow core. The switch end to end is block H of verify:glacier-melt.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-snowcal.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { buildTruth, medianElevation } from './glacier/snowcal-truth.mjs';
import { CAL, loadWinters, eventsOf, balOf, balBySimulate, profOf, prepare, fitConfig, scoreOf, holdOut, pointSlopes } from './glacier/snowcal-fit.mjs';
import { boardDepth, d3Rho, DEN } from './glacier/snowcal-density.mjs';
import { SNOW, SNOW_ORIGIN, newSnowDensity, newSnowDensitySpan, emptyPack, stepPack, packDepthCm } from './glacier/lib/snowcore.mjs';
import {
  snowCalibrationProblems, precipFactorOf, precipProfile, newSnowDensityOf, SNOWCAL_BOUNDS,
  SNOW_PRECIP_RULES, SNOW_PRECIP_DEFAULT, SNOW_DENSITY_SOURCES, SNOW_DENSITY_SOURCE_DEFAULT, SNOW_DENSITY_FOLLOWS, snowPrecipOf, snowDensitySourceOf, snowSwitchesOf,
  precipLevelOf, precipRunOf, meltPrecipProblems, snowConstantsOf, snowOriginOf, snowCoreSetup,
} from './glacier/lib/snowcal.mjs';

import { snowGlaciersProblems, shapeAtElevation, shapeCorrOf, glacierRunOf, glacierFactorModeOf, GLACIER_FACTOR_DEFAULT, GLACIER_SHAPE_DEFAULT } from './glacier/lib/snowcalGlaciers.mjs';
import { snowFactorTableProblems, factorTableRunOf, ruleOf, kForLazy, fitForm, predictOf, spreadOfErrors, factorRuleOf, SNOW_FACTOR_RULE, SNOW_FACTOR_BASES, SNOW_FACTOR_SOURCES } from './glacier/lib/snowcalPredict.mjs';
import { x1Of } from './glacier/snowcal-predict.mjs';
import { buildGlacierTable } from './glacier/snowcal-table2.mjs';
import { CAL2, evaluate, tableValues, tableOf, tabVal, kStar, balAll, balOne, scoreOf as scoreOf2, attachRadiation, fitF, shapeFactors } from './glacier/snowcal-fit2.mjs';
import { simulate, emptyState, rng, gauss, cosZenith, clearSky } from './glacier/lib/meltcore.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, 'lib', 'fixtures', 'glacier', 'snowcal');
const AUDIT = join(HERE, '..', 'audit', 'gletscher-schneemodell');
const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const TMP = mkdtempSync(join(tmpdir(), 'snowcal-'));

// --- A: truth -------------------------------------------------------------------------------------------------------------------------
const src = { glamosDir: join(FX, 'truth-src', 'glamos'), wgmsDir: join(FX, 'truth-src', 'wgms'), catalogPath: join(FX, 'catalog.json') };
const truth = buildTruth(src);
{
  const rh = truth.gy.find((o) => o.country === 'CH'), he = truth.gy.filter((o) => o.country === 'AT');
  // independent reading of the raw lines
  const lines = readFileSync(join(src.glamosDir, 'massbalance_fixdate_elevationbins.csv'), 'utf8').split(/\r?\n/).filter((l) => l.startsWith('Rhonegletscher,') && l.includes(',2023-10-01,'));
  const raw = lines.map((l) => l.split(',')).map((c) => ({ bw: +c[5], a: +c[8], z0: +c[9], z1: +c[10] }));
  const area = raw.reduce((s, b) => s + b.a, 0), bw = raw.reduce((s, b) => s + b.a * b.bw, 0) / area;
  let acc = 0, med = null; for (const b of raw) { if (acc + b.a >= area / 2) { med = b.z0 + ((area / 2 - acc) / b.a) * (b.z1 - b.z0); break; } acc += b.a; }
  add('A1 Wahrheit Schweiz: Rhonegletscher 2024 aus GLAMOS, Stufen, Flächenmittel und Medianhöhe wie von Hand; das Jahr 2010 der Datei bleibt außen vor',
    truth.gy.filter((o) => o.country === 'CH').length === 1 && rh.year === 2024 && rh.t0 === '2023-10-01' && rh.t1 === '2024-04-30' && rh.bins.length === raw.length
    && rh.bw === Math.round(bw) && rh.zMed === Math.round(med) && rh.catId === 'gl_ch_rhonegletscher' && rh.region === 'ch-mitte-ost', { bw, med, got: { bw: rh?.bw, zMed: rh?.zMed, n: rh?.bins.length } });
  const band = readFileSync(join(src.wgmsDir, 'mass_balance_band.csv'), 'utf8').split(/\r?\n/).find((l) => l.startsWith('AT,HINTEREIS F.,491,2024,'));
  const c = band.split(','), h24 = he.find((o) => o.year === 2024);
  add('A2 Wahrheit Österreich: WGMS in mm (× 1000), Zeitraum aus begin_date und midseason_date, Region vom nächsten Katalogeintrag',
    he.length === 2 && h24.bins[0].bw === Math.round(+c[7] * 1000) && near(h24.bins[0].area, +c[6] / 1e6, 1e-9) && h24.t0 === '2023-10-01' && h24.t1 === '2024-04-30' && h24.region === 'at-oetztaler-alpen' && h24.catKm <= 3, { first: h24?.bins[0], c: c.slice(4, 8) });
  add('A3 Medianhöhe: zwei Stufen 2000–2100 (1 km²) und 2100–2200 (3 km²) ⇒ 2133,3 m', near(medianElevation([{ z0: 2000, z1: 2100, area: 1 }, { z0: 2100, z1: 2200, area: 3 }]), 2133.333, 0.001));
  // mutations of the sources
  const mut = (name, edit) => { const d = join(TMP, name); cpSync(join(FX, 'truth-src'), d, { recursive: true }); edit(d); return buildTruth({ glamosDir: join(d, 'glamos'), wgmsDir: join(d, 'wgms'), catalogPath: src.catalogPath }); };
  const rewrite = (file, f) => writeFileSync(file, readFileSync(file, 'utf8').split('\n').map(f).join('\n'));
  const noDate = mut('nodate', (d) => rewrite(join(d, 'wgms', 'mass_balance.csv'), (l) => (l.startsWith('AT,HINTEREIS F.,491,,2024,') ? l.replace('2024-04-30', '') : l)));
  const cut = (l) => { const x = l.split(','); x[6] = ''; return x.join(','); };
  const borrow = mut('borrow', (d) => rewrite(join(d, 'wgms', 'mass_balance_band.csv'), (l) => (l.startsWith('AT,HINTEREIS F.,491,2024,2900,2950,') ? cut(l) : l)));
  const none = mut('none', (d) => rewrite(join(d, 'wgms', 'mass_balance_band.csv'), (l) => (/^AT,HINTEREIS F\.,491,(2023|2024),2900,2950,/.test(l) ? cut(l) : l)));
  const nan = mut('nan', (d) => rewrite(join(d, 'glamos', 'massbalance_fixdate_elevationbins.csv'), (l) => (l.startsWith('Rhonegletscher,') && l.includes(',2023-10-01,') && l.includes(',2900,3000,') ? l.replace(/^(([^,]*,){5})[^,]*/, '$1NaN') : l)));
  const b23 = he.find((o) => o.year === 2023).bins.find((b) => b.z0 === 2900), bb = borrow.gy.find((o) => o.country === 'AT' && o.year === 2024);
  add('A4 Regeln der Wahrheit: ohne Mitteldatum verworfen; Stufe ohne Fläche nimmt die des Nachbarjahrs (genannt); ohne jede Fläche verworfen; Stufe ohne Winterbilanz verworfen',
    !noDate.gy.some((o) => o.country === 'AT' && o.year === 2024) && noDate.dropped.some((s) => /2024: no begin or mid-season date/.test(s))
    && bb && bb.areaFrom?.[0] === 2023 && near(bb.bins.find((b) => b.z0 === 2900).area, b23.area, 1e-12)
    && !none.gy.some((o) => o.country === 'AT') && none.dropped.filter((s) => /band without area/.test(s)).length === 2
    && !nan.gy.some((o) => o.country === 'CH') && nan.dropped.some((s) => /bin without winter balance/.test(s)), { noDate: noDate.dropped, none: none.dropped, nan: nan.dropped, areaFrom: bb?.areaFrom });
}

// --- B: forcing, recursion, profile -----------------------------------------------------------------------------------------------------
const truthPath = join(TMP, 'gy.json');
writeFileSync(truthPath, JSON.stringify({ gy: truth.gy }));
const { winters, unusable } = loadWinters({ truthPath, cache: join(FX, 'cache') });
const W = Object.fromEntries(winters.map((w) => [w.country, w]));
{
  const rh = J(join(FX, 'cache', 'rhires.json')), p = Object.values(rh.points)[0].p;
  const w = W.CH, t0 = Date.parse('2023-10-01T00:00:00Z');
  const hourOf = (iso) => Math.round((Date.parse(iso) - t0) / 3_600_000);        // index of the hour that STARTS at iso
  const dayOf = (iso) => Math.floor((Date.parse(iso) - Date.parse('2023-09-01T06:00:00Z')) / 86_400_000);
  const a = hourOf('2023-11-10T05:00:00Z'), b = hourOf('2023-11-10T06:00:00Z');
  add('B1 Antrieb: zwei nutzbare Winter, der Winter vor dem Fixture-Zeitraum ist „nicht nutzbar“; der RhiresD-Tag reicht von 06 bis 06 UTC und ist auf 24 Stunden verteilt',
    winters.length === 2 && unusable.length === 1 && /2023/.test(unusable[0]) && w.t.length === 213 * 24
    && near(w.p[a], p[dayOf('2023-11-10T05:00:00Z')] / 24, 1e-12) && near(w.p[b], p[dayOf('2023-11-10T06:00:00Z')] / 24, 1e-12) && dayOf('2023-11-10T05:00:00Z') + 1 === dayOf('2023-11-10T06:00:00Z'), { unusable, n: w?.t.length });
  let worst = 0, n = 0, worstShift = 0;
  for (const rec of winters) for (const k of [0.5, 1.3, 2.6, 4]) for (const bin of rec.b) { const ev = eventsOf(rec, bin.z); worst = Math.max(worst, Math.abs(balOf(ev, k) - balBySimulate(rec, bin.z, k))); worstShift = Math.max(worstShift, Math.abs(balOf(ev, k) - balBySimulate(rec, bin.z, k + 0.05))); n++; }
  add('B2 die schnelle Rekursion ist die Rechnung des Schmelzkerns: an zwei echten Wintern, allen Stufen und vier Faktoren höchstens 1e-6 mm Unterschied; Gegenprobe mit verschobenem Faktor über 10 mm',
    n === 4 * (W.CH.b.length + W.AT.b.length) && worst < 1e-6 && worstShift > 10, { n, worst, worstShift });
  const ev = Float64Array.from([2, 0, 0, 1, 0, 5, 0, 2, 1, 0]), o = {};
  add('B3 Rekursion von Hand: Zuwachs, Schmelze durch den Schnee begrenzt, Eisschmelze × 1,6 zählt negativ (k = 1 ⇒ −6,2; k = 2 ⇒ −3,2; Schmelze 9,2)',
    near(balOf(ev, 1), -6.2, 1e-12) && near(balOf(ev, 2, o), -3.2, 1e-12) && near(o.melt, 9.2, 1e-12), { k1: balOf(ev, 1), k2: balOf(ev, 2), melt: o.melt });
  add('B4 Verlauf: P1 ±500 m bei 0,04 ⇒ 1,2 / 0,8; P2 über der Medianhöhe 1; P3 zwei Steigungen; Untergrenze 0,2; die Tabelle rechnet dieselbe Form',
    near(profOf(500, 0.04, 0.04), 1.2, 1e-12) && near(profOf(-500, 0.04, 0.04), 0.8, 1e-12) && profOf(500, 0.04, 0) === 1 && near(profOf(-400, 0.03, -0.06), 0.88, 1e-12) && near(profOf(300, 0.03, -0.06), 0.82, 1e-12)
    && profOf(-1000, 0.2, 0.2) === 0.2 && [-700, -100, 0, 250, 900].every((d) => precipProfile(d, 0.03, -0.06) === profOf(d, 0.03, -0.06)) && CAL.profFloor === SNOWCAL_BOUNDS.floor);
  const toy = { t: Float64Array.from([-5, 1, 3, NaN]), p: Float64Array.from([1, 1, 1, 1]), zT: 2000 };
  const e = eventsOf(toy, 2000), up = eventsOf(toy, 2500);
  add('B5 Stunde von Hand: Schneeanteil 1 / 0,5 / 0 und 0,5 ohne Temperatur, Schmelze 0,165 mm je K und Stunde, 500 m höher 3,25 K kälter',
    e.length === 8 && [1, 0, 0.5, 0.165, 0, 0.495, 0.5, 0].every((v, i) => near(e[i], v, 1e-12)) && near(up[2], 1, 1e-12) && near(up[3], 0, 1e-12) && near(up[4], 1, 1e-12), { e: [...e], up: [...up] });
}

// --- C: fit ------------------------------------------------------------------------------------------------------------------------------
{
  const clone = (w, id, region, scale, F, gu, go) => {
    const rec = { ...w, key: id, name: id, region, p: Float64Array.from(w.p, (v) => v * scale) };
    rec.b = w.b.map((b) => ({ ...b, bw: balOf(eventsOf(rec, b.z), F * profOf(b.d, gu, go)) }));
    return rec;
  };
  // `single` adds a glacier that is alone in its region and whose own level (3.0) no pooled value can carry
  const make = (gu, go, single = false) => prepare([
    clone(W.CH, 'a1', 'ra', 1.0, 1.5, gu, go), clone(W.CH, 'a2', 'ra', 1.1, 1.5, gu, go),
    clone(W.CH, 'b1', 'rb', 0.9, 2.0, gu, go), clone(W.CH, 'b2', 'rb', 1.2, 2.0, gu, go),
    ...(single ? [clone(W.CH, 'c1', 'rc', 1.0, 3.0, gu, go)] : []),
    clone(W.AT, 'd1', 'rd', 1.0, 2.5, gu, go), clone(W.AT, 'd2', 'rd', 1.15, 2.5, gu, go),
  ]);
  const clean = make(0.03, 0.03), set = make(0.03, 0.03, true);
  const fitClean = fitConfig(clean, { form: 'P1', fLevel: 'R', gLevel: 'G' });
  const fit = fitConfig(set, { form: 'P1', fLevel: 'R', gLevel: 'G' }), country = fitConfig(set, { form: 'P1', fLevel: 'C', gLevel: 'G' });
  const c1 = fit.paramsOf(set.find((g) => g.id === 'c1'));
  add('C1 der Fit findet bekannte Werte wieder: F je Region 1,5 / 2,0 / 2,5 und die Steigung 0,03; eine Region mit nur einem Gletscher bekommt den Landeswert, nicht ihren eigenen',
    near(fitClean.F.get('ra'), 1.5, 0.01) && near(fitClean.F.get('rb'), 2.0, 0.01) && near(fitClean.F.get('rd'), 2.5, 0.01) && near(fitClean.gu.get('all'), 0.03, 0.002) && fitClean.gu.get('all') === fitClean.go.get('all')
    && !fit.F.has('rc') && c1.fKey === '=CH' && c1.F === country.F.get('CH') && Math.abs(c1.F - 3.0) > 0.3 && c1.F > 1.5 && c1.F < 3.0, { clean: Object.fromEntries(fitClean.F), g: fitClean.gu.get('all'), c1, countryCH: country.F.get('CH') });
  const lgo = holdOut(set, { form: 'P1', fLevel: 'R', gLevel: 'G' }, 'lgo');
  const ra1 = lgo.rows.find((r) => r.id === 'a1'), rd1 = lgo.rows.find((r) => r.id === 'd1');
  add('C2 Rückhaltung: der ausgelassene Gletscher einer Zweier-Region bekommt den Landeswert (a1 nicht 1,5); in Österreich bleibt ein Gletscher übrig, der den Wert trägt (d1 trifft)',
    lgo.rows.length === 7 && Math.abs(ra1.F - 1.5) > 0.2 && ra1.s1 > 20 && near(rd1.F, 2.5, 0.02) && rd1.s1 < 15, { a1: [ra1.F, ra1.s1], d1: [rd1.F, rd1.s1] });
  const g = { bins: [{ ev: Float64Array.from([100, 0]), d: 0, w: 0.25, bw: 150 }, { ev: Float64Array.from([200, 0]), d: 0, w: 0.75, bw: 380 }] };
  const s = scoreOf(g, { F: 2, gu: 0, go: 0 });
  add('C3 Kennzahlen von Hand: s1 27,5 · s2 27,5 · s3 +27,5 · s4 11,25', near(s.s1, 27.5, 1e-9) && near(s.s2, 27.5, 1e-9) && near(s.s3, 27.5, 1e-9) && near(s.s4, 11.25, 1e-9), s);
  const hump = make(0.04, -0.05);
  const p3 = fitConfig(hump, { form: 'P3', fLevel: 'R', gLevel: 'G' }), p2 = fitConfig(hump, { form: 'P2', fLevel: 'G', gLevel: 'G' }), p0 = fitConfig(hump, { form: 'P0', fLevel: 'G', gLevel: 'G' });
  add('C4 Formen: P3 findet zwei Steigungen (+0,04 unten, −0,05 oben) wieder; P2 lässt die obere bei 0; P0 hat keinen Verlauf',
    near(p3.gu.get('all'), 0.04, 0.004) && near(p3.go.get('all'), -0.05, 0.004) && p2.go.get('all') === 0 && p2.gu.get('all') !== 0 && p0.gu.get('all') === 0 && p0.go.get('all') === 0, { p3: [p3.gu.get('all'), p3.go.get('all')], p2: p2.gu.get('all') });
  const p3s = fitConfig(make(0.04, -0.05, true), { form: 'P3', fLevel: 'R', gLevel: 'G' });
  add('C4b Gegenprobe und Befund (V-GM-25): trägt ein Gletscher einen Landeswert, der nicht seiner ist, verbiegt das die gemeinsamen Steigungen (über 0,01 daneben) — Verlauf und Niveau sind nicht getrennt bestimmt',
    Math.abs(p3s.gu.get('all') - 0.04) > 0.01 || Math.abs(p3s.go.get('all') + 0.05) > 0.01, { p3s: [p3s.gu.get('all'), p3s.go.get('all')] });
  const big = prepare([clone(W.CH, 'x1', 'ra', 1, 8, 0, 0), clone(W.CH, 'x2', 'ra', 1.1, 8, 0, 0)]);
  const fb = fitConfig(big, { form: 'P0', fLevel: 'G', gLevel: 'G' });
  add('C5 Grenzen: eine Wahrheit mit F = 8 endet an der Obergrenze 5', near(fb.F.get('all'), CAL.fBounds[1], 1e-3), { F: fb.F.get('all') });
  const pts = pointSlopes({ wgmsDir: src.wgmsDir, winters });
  const rows = readFileSync(join(src.wgmsDir, 'mass_balance_point.csv'), 'utf8').split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(','));
  const zb = rows.map((c) => [+c[13], +c[14] * 1000]), mz = mean(zb.map((x) => x[0])), mb = mean(zb.map((x) => x[1]));
  const slope = zb.reduce((s2, [z, b]) => s2 + (z - mz) * (b - mb), 0) / zb.reduce((s2, [z]) => s2 + (z - mz) ** 2, 0);
  add('C6 Punktmessungen: die relative Steigung am Hintereisferner 2024 wie von Hand (Gerade durch die Winterpunkte, geteilt durch ihr Mittel, je 100 m)',
    pts.rows.length === 1 && pts.rows[0].n === zb.length && near(pts.rows[0].rel100, (slope / mb) * 100, 1e-9), { got: pts.rows[0], hand: (slope / mb) * 100 });
}

// --- D: density ----------------------------------------------------------------------------------------------------------------------------
{
  const ev = J(join(FX, 'events.json')).events;
  const run = (rho) => { const e = ev.map((x) => boardDepth(x.hnw, x.t, () => rho) - x.hn); return { bias: mean(e), mae: mean(e.map(Math.abs)) }; };
  const r68 = run(SNOW.rhoNew), r96 = run(96), r200 = run(200);
  add('D1 Brett und Schneekern an echten Messfeld-Tagen: mit 68 kg/m³ liegt der Neuschnee im Mittel mehr als 2 cm zu hoch, mit 96 näher an der Messung; Gegenprobe 200 kg/m³ zu niedrig',
    ev.length >= 30 && r68.bias > 2 && Math.abs(r96.bias) < r68.bias / 2 && r96.mae < r68.mae && r200.bias < -3, { n: ev.length, r68, r96, r200 });
  const cold = new Array(24).fill(-10), d100 = boardDepth(20, cold, () => 100), d150 = boardDepth(20, cold, () => 150);
  add('D2 Brett: 20 mm bei 100 kg/m³ sind höchstens 20 cm und nach einem Tag noch über 17 cm; dichter heißt dünner', d100 <= 20 + 1e-9 && d100 > 17 && d150 < d100, { d100, d150 });
  add('D3 Regel D3: 102 + 1,5·T, begrenzt auf 40 … 200', d3Rho(102, 1.5, -10) === 87 && d3Rho(102, 1.5, -60) === 40 && d3Rho(160, 8, 20) === 200 && DEN.d3.clip[0] === 40);
}

// --- E: table and reports ------------------------------------------------------------------------------------------------------------------
{
  const table = J(join(HERE, 'glacier', 'snow-calibration.json')), regions = J(join(FX, 'regions.json')).regions;
  const A = J(join(AUDIT, 'gm3-report-A.json')), B = J(join(AUDIT, 'gm3-report-B.json')), C = J(join(AUDIT, 'gm3-report-C.json')), X = J(join(AUDIT, 'gm3-report-A-explore.json')), R1 = J(join(AUDIT, 'gm3-report-A-run1.json'));
  const frozen = sha(join(AUDIT, 'gm3-method-frozen.md')), amend = sha(join(AUDIT, 'gm3-method-frozen-amendment-1.md'));
  const fileHash = (p) => readFileSync(join(AUDIT, p), 'utf8').trim().split(/\s+/)[0];
  add('E1 eingefrorene Methode: Datei, Hash-Datei, Berichte A und B und die Tabelle nennen denselben Hash; der Nachtrag ebenso',
    frozen === fileHash('gm3-method-frozen.sha256') && A.method.sha256 === frozen && B.method.sha256 === frozen && R1.method.sha256 === frozen && table.method.sha256 === frozen
    && amend === fileHash('gm3-method-frozen-amendment-1.sha256') && X.amendment.sha256 === amend, { frozen, a: A.method.sha256, amend });
  const problems = snowCalibrationProblems(table, regions);
  add('E2 die Tabelle erfüllt ihre Regeln und deckt alle 26 Regionen des Katalogs', problems.length === 0 && regions.length === 26 && typeof table.usedByProducer === 'boolean', problems);
  const key = `${A.chosen.cfg.form}|${A.chosen.cfg.fLevel}|${A.chosen.cfg.gLevel}`;
  const r = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
  const okRegions = A.table.every((t) => { const x = table.precip.regions[t.region]; return x && x.F === r(t.F, 3) && x.gu === r(t.gu, 4) && x.go === r(t.go, 4); });
  const fullF = A.configs[key].full.F;
  add('E3 die Tabelle ist der Voll-Fit der gewählten Stellung: Form und Ebenen, F je Land, Steigung; Deutschland trägt den Gesamtwert',
    table.precip.form === A.chosen.cfg.form && table.precip.levels.F === A.chosen.cfg.fLevel && table.precip.levels.g === A.chosen.cfg.gLevel && okRegions
    && table.precip.regions['ch-ost'].F === r(fullF.CH, 3) && table.precip.regions['at-dachstein'].F === r(fullF.AT, 3) && table.precip.regions.de.fFrom === 'all'
    && table.precip.regions.de.F === r(A.configs['P1|G|G'].full.F.all, 3) && table.precip.regions.de.fOrigin === 'transferred', { key, fullF, de: table.precip.regions.de });
  const v = Object.values(A.verdict);
  // the comparison without a profile is run after the selection; a report written before 23.11. carries its s4 only inside the verdict
  const lgo = A.chosen.lgo, b0 = A.baselines.B0.scores.all, flat = A.configs[`P0|${A.chosen.cfg.fLevel}|G`]?.lgo.all ?? { s4: v[3].flat };
  const k = [1 - lgo.all.s1 / b0.s1 >= 0.10, lgo.all.s2 / 1000 <= 0.35, Math.abs(lgo.CH.s3) <= 100 && Math.abs(lgo.AT.s3) <= 100, 1 - lgo.all.s4 / flat.s4 >= 0.10];
  add('E4 Urteil neu gerechnet aus den Zahlen des Berichts: K-1 … K-4 wie gemeldet, gate = alle grün; die Tabelle trägt dasselbe Urteil',
    v.length === 4 && v.every((x, i) => x.pass === k[i]) && A.gate === k.every(Boolean) && table.precip.gate === A.gate && JSON.stringify(table.precip.verdict) === JSON.stringify(A.verdict), { k, reported: v.map((x) => x.pass) });
  // selection recomputed from the configs
  const s1 = (c) => A.configs[c].lgo.all.s1, y1 = (c) => A.configs[c].lyo.all.s1;
  const better = (cand, cur) => s1(cand) <= s1(cur) * (1 - CAL.lgoStep) && y1(cand) <= y1(cur) * (1 + CAL.lyoGuard);
  let cur = 'P1|G|G';
  if (better('P2|G|G', cur)) cur = 'P2|G|G';
  if (better('P3|G|G', s1('P1|G|G') <= s1('P2|G|G') ? 'P1|G|G' : 'P2|G|G') && better('P3|G|G', cur)) cur = 'P3|G|G';
  for (const block of [1, 2]) for (const level of ['C', 'R']) { const p = cur.split('|'); if (p[block] !== (level === 'C' ? 'G' : 'C')) continue; p[block] = level; const cand = p.join('|'); if (A.configs[cand] && better(cand, cur)) cur = cand; }
  add('E5 Auswahl neu gerechnet aus den Kennzahlen aller Stellungen (3 % im LGO, LYO höchstens 1 % schlechter): dieselbe Stellung wie im Bericht', cur === key, { cur, key });
  add('E6 LGO-Zeilen: eine je nutzbarem Winter, ihr Mittel ist die gemeldete Kennzahl; der erste gewertete Lauf hat dieselbe Stellung und dasselbe Urteil',
    A.chosen.lgoRows.length === A.data.winters && near(mean(A.chosen.lgoRows.map((x) => x.s1)), lgo.all.s1, 0.5)
    && JSON.stringify(R1.selection.chosen) === JSON.stringify(A.selection.chosen) && JSON.stringify(Object.values(R1.verdict).map((x) => x.pass)) === JSON.stringify(v.map((x) => x.pass)) && near(R1.chosen.lgo.all.s1, lgo.all.s1, 1e-6),
    { rows: A.chosen.lgoRows.length, winters: A.data.winters });
  const d2 = 1 - B.D2.lsoMae / B.D0.mae, d3 = 1 - B.D3.lsoMae / B.D2.lsoMae;
  const want = d2 >= DEN.gain ? (d3 >= DEN.gain ? 'D3' : 'D2') : 'D0';
  add('E7 Dichte: Auswahl neu gerechnet (5 % im LSO, D3 muss D2 schlagen); die Tabelle trägt die Regel, den Wert und die gemessene Spanne',
    B.selection.chosen === want && table.density.rule === want && (want !== 'D2' || table.density.rhoNew === B.D2.rho) && newSnowDensityOf(table, -5) === (want === 'D2' ? B.D2.rho : newSnowDensityOf(table, -5))
    && near(table.density.span.p50, B.measured.all.p50, 0.06) && table.density.events === B.data.events && table.density.origin === 'measured', { d2, d3, want, rule: table.density.rule });
  const at = C.rows.filter((x) => x.country === 'AT');
  add('E8 Brücke: gemessen und nicht angewandt (Wert 1, set); das Verhältnis der Summen stimmt mit den Zeilen überein',
    C.applied === false && table.precip.bridge.value === 1 && table.precip.bridge.applied === false && near(C.AT.ratioOfSums, at.reduce((s, x) => s + x.fusion, 0) / at.reduce((s, x) => s + x.analysis, 0), 1e-9)
    && table.precip.bridge.measured.AT.ratioOfSums === r(C.AT.ratioOfSums, 3), { at: C.AT.ratioOfSums });
  add('E9 Nachtrag: als explorativ gekennzeichnet, die Stellung ist die des gewerteten Laufs', X.exploratory === true && JSON.stringify(X.chosen) === JSON.stringify(A.selection.chosen) && X.meltFactor.length === 12);
  const reg = table.precip.regions['ch-ost'];
  add('E10 Leser: Faktor einer Stufe = F · Brücke · Verlauf; unbekannte Region ohne Wert', near(precipFactorOf(table, 'ch-ost', 200), reg.F * precipProfile(200, reg.gu, reg.go), 1e-12) && precipFactorOf(table, 'xx', 0) === null);
  // negative controls
  const mutate = (f) => { const t = structuredClone(table); f(t); return snowCalibrationProblems(t, regions).length; };
  const muts = [
    (t) => { t.precip.regions['ch-ost'].F = 5.5; }, (t) => { delete t.precip.regions['at-dachstein']; }, (t) => { t.precip.regions.xx = t.precip.regions.de; },
    (t) => { t.precip.gate = !t.precip.gate; }, (t) => { t.precip.bridge.value = 1.2; }, (t) => { t.precip.bridge.applied = true; },
    (t) => { const x = t.precip.regions['at-allgaeuer-alpen']; x.fOrigin = 'measured'; }, (t) => { t.precip.regions['ch-west'].go = 0.01; },
    (t) => { t.density.span.p10 = 200; }, (t) => { t.precip.form = 'P9'; }, (t) => { t.method.sha256 = 'x'; }, (t) => { t.density.rhoNew = 20; },
    (t) => { delete t.precip.reason; t.precip.gate = false; t.precip.verdict[Object.keys(t.precip.verdict)[0]].pass = false; }, (t) => { t.density.rule = 'D7'; }, (t) => { t.precip.regions['ch-sued'].gu = 0.5; },
  ];
  const caught = muts.map(mutate);
  add('E11 Negativkontrollen: 15 Verletzungen der Tabelle, jede gemeldet', caught.every((n) => n > 0), caught);
}

// --- F: who reads the table -------------------------------------------------------------------------------------------------------------------
{
  const pat = /snow-calibration|snowcal/;
  // since GM-3b the melt run may read the table — behind its switch only (verify:glacier-melt, block H: off = the file is not opened). Everything else stays without it.
  // GM-3c: the snowpack step lives in the melt run (same table, same check); its local seed tool reads the table for the same factor. The cores stay without it.
  const others = ['glacier/lib/weathercore.mjs', 'glacier/lib/meltcore.mjs', 'glacier/lib/snowcore.mjs', 'glacier/lib/snowpackcore.mjs', 'glacier/stations.mjs', 'glacier/snow.mjs', 'glacier/glacier-publish.mjs'];
  add('F1 außer dem Schmelzlauf (hinter seinem Schalter) liest kein Producer die Tabelle, die Kerne — auch der der Schneedecke — bleiben ohne sie; Gegenprobe: dasselbe Muster trifft den Schmelzlauf, das Tabellen-Werkzeug und das Einschwing-Werkzeug der Schneedecke',
    others.every((f) => !pat.test(readFileSync(join(HERE, f), 'utf8'))) && pat.test(readFileSync(join(HERE, 'glacier', 'melt.mjs'), 'utf8')) && pat.test(readFileSync(join(HERE, 'glacier', 'snowcal-table.mjs'), 'utf8'))
    && pat.test(readFileSync(join(HERE, 'glacier', 'snowpack-seed.mjs'), 'utf8')));
}

// --- G: GM-3b — the two switches (E-GM-7 precipitation factor per country, E-GM-8 new-snow density), both on (E-GM-12) -----------------------------------
{
  const table = J(join(HERE, 'glacier', 'snow-calibration.json'));
  const throws = (f) => { try { f(); return null; } catch (e) { return String(e.message ?? e); } };
  add('G1 beide Schalter sind an (E-GM-12, 23.11.): Voreinstellung „country“ und „board“, leer und null geben die Voreinstellung, der Rückfall „gate-c“ / „helfricht“ ist wählbar; die Tabelle sagt dasselbe (usedByProducer true); ein unbekanntes Wort bricht mit den erlaubten Stellungen ab',
    SNOW_PRECIP_DEFAULT === 'country' && SNOW_DENSITY_SOURCE_DEFAULT === 'board' && snowPrecipOf(null) === 'country' && snowPrecipOf('') === 'country' && snowPrecipOf(undefined) === 'country' && snowPrecipOf('gate-c') === 'gate-c'
    && snowDensitySourceOf(undefined) === 'board' && snowDensitySourceOf('') === 'board' && snowDensitySourceOf('helfricht') === 'helfricht' && table.usedByProducer === true && table.usedByProducer === (SNOW_PRECIP_DEFAULT !== 'gate-c')
    && /gate-c, country/.test(throws(() => snowPrecipOf('region')) ?? '') && /helfricht, board/.test(throws(() => snowDensitySourceOf('96')) ?? '') && SNOW_PRECIP_RULES.length === 2 && SNOW_DENSITY_SOURCES.length === 2);
  const sw = snowSwitchesOf({ precip: 'country', density: 'board' });
  const none = (() => { try { return JSON.stringify(snowSwitchesOf()); } catch (e) { return String(e.message ?? e); } })();
  const back = (() => { try { return JSON.stringify(snowSwitchesOf({ precip: 'gate-c', density: 'helfricht' })); } catch (e) { return String(e.message ?? e); } })();
  const mixed = (() => { try { return JSON.stringify(snowSwitchesOf({ density: 'helfricht' })); } catch (e) { return String(e.message ?? e); } })();
  // E-GM-15 (Jan 23.11., audit §3f): a density that is not named follows the precipitation rule — the fall back needs ONE word; a named `board` next to `gate-c` stays refused
  const one = (() => { try { return JSON.stringify(snowSwitchesOf({ precip: 'gate-c' })); } catch (e) { return String(e.message ?? e); } })();
  const empty = (() => { try { return JSON.stringify(snowSwitchesOf({ precip: 'gate-c', density: '' })); } catch (e) { return String(e.message ?? e); } })();
  add('G2 96 kg/m³ nur mit wahrem Wasser: ein ausdrücklich genanntes „board“ neben „gate-c“ wird abgelehnt; die UNGENANNTE Dichte folgt dem Faktor (E-GM-15): „gate-c“ allein ergibt „gate-c“ + „helfricht“ (auch mit leerem Wort), „country“ allein „country“ + „board“; die Folgeregel passt zu den Voreinstellungen; der Rückfall mit beiden Wörtern, „country“ mit „helfricht“ und beide zusammen gehen; ohne Angabe beide an; ein unbekanntes Dichtewort bricht ab',
    /nur mit dem Niederschlagsfaktor/.test(throws(() => snowSwitchesOf({ precip: 'gate-c', density: 'board' })) ?? '') && one === JSON.stringify({ precip: 'gate-c', density: 'helfricht' }) && empty === one
    && SNOW_DENSITY_FOLLOWS[SNOW_PRECIP_DEFAULT] === SNOW_DENSITY_SOURCE_DEFAULT && Object.keys(SNOW_DENSITY_FOLLOWS).sort().join() === [...SNOW_PRECIP_RULES].sort().join()
    && sw.precip === 'country' && sw.density === 'board' && snowSwitchesOf({ density: 'board' }).precip === 'country' && back === JSON.stringify({ precip: 'gate-c', density: 'helfricht' })
    && mixed === JSON.stringify({ precip: 'country', density: 'helfricht' }) && none === JSON.stringify({ precip: 'country', density: 'board' })
    && /helfricht, board/.test(throws(() => snowSwitchesOf({ precip: 'gate-c', density: '96' })) ?? ''), { none, back, mixed, one });
  const ch = table.precip.regions['ch-ost'], lv = precipLevelOf(table, 'ch-ost'), at = precipLevelOf(table, 'at-dachstein'), de = precipLevelOf(table, 'de');
  const bridged = structuredClone(table); bridged.precip.bridge.value = 0.8;
  add('G3 Faktor je Land OHNE Verlauf: precipLevelOf gibt F · Brücke der Region mit Herkunft (Schweiz 1,793 gemessen, Österreich 2,326, Deutschland 1,854 übertragen), unbekannte Region ohne Wert; Gegenprobe: der Leser mit Verlauf weicht 300 m über der Medianhöhe davon ab, eine Brücke 0,8 geht ein',
    lv.F === ch.F && lv.F === 1.793 && lv.origin === 'measured' && lv.from === 'CH' && at.F === 2.326 && de.F === 1.854 && de.origin === 'transferred' && precipLevelOf(table, 'xx') === null
    && near(precipFactorOf(table, 'ch-ost', 0), lv.F, 1e-12) && Math.abs(precipFactorOf(table, 'ch-ost', 300) - lv.F) > 0.05 && near(precipLevelOf(bridged, 'ch-ost').F, 1.793 * 0.8, 1e-12), { lv, at, de });
  const regions = J(join(FX, 'regions.json')).regions;
  const run = precipRunOf(table, regions);
  const noDe = structuredClone(table); delete noDe.precip.regions.de;
  const flipped = structuredClone(table); flipped.precip.gate = true;
  add('G4 was ein Lauf mit „country“ aus der Tabelle bekommt: Faktor für jede der 26 Regionen des Katalogs, Gradient 0, ein Block, der seine Regeln erfüllt (Urteil der Eichung und Hash der Methode stehen darin); eine Tabelle ohne eine Region oder gegen ihre Regeln bricht mit Grund ab',
    regions.every((r) => run.factorOf(r) === table.precip.regions[r].F * table.precip.bridge.value) && run.gradient === 0 && Object.keys(run.block.regions).length === 26 && meltPrecipProblems(run.block, regions).length === 0
    && run.block.gate === false && run.block.reason === table.precip.reason && run.block.method === table.method.sha256 && run.block.gradient === 0 && run.block.origin.gradient === 'set'
    && /Region de fehlt/.test(throws(() => precipRunOf(noDe, regions)) ?? '') && /gate widerspricht/.test(throws(() => precipRunOf(flipped, regions)) ?? '') && /kein Eichdokument/.test(throws(() => precipRunOf({}, regions)) ?? ''));
  // density: a second set of constants, the core's own stays
  const before = JSON.stringify(SNOW), c = snowConstantsOf(SNOW, table), o = snowOriginOf(SNOW_ORIGIN), span = newSnowDensitySpan(c), span0 = newSnowDensitySpan();
  const d3 = structuredClone(table); d3.density.rule = 'D3';
  const wide = structuredClone(table); wide.density.rhoNew = 30;
  const setup = (o) => { try { return snowCoreSetup({ base: SNOW, baseOrigin: SNOW_ORIGIN, ...o }); } catch (e) { return { err: String(e.message ?? e) }; } };
  const off = setup({ density: 'helfricht' }), on = setup({ table }), onNamed = setup({ density: 'board', table });
  add('G5 Dichte aus der Tabelle als ZWEITER Konstantensatz: 96 kg/m³, Spanne 65 / 96 / 148,1 (gemessene Quantile statt 56 / 68 / 80), Herkunft „measured“ — ohne Angabe (Voreinstellung „board“) wie mit dem Wort; der Satz des Kerns bleibt 68 und unberührt, der Rückfall „helfricht“ gibt genau ihn zurück; andere Dichteregel, Dichte außerhalb der Grenzen oder „board“ ohne Tabelle bricht ab',
    c.rhoNew === 96 && c.rhoNew === table.density.rhoNew && span.p10 === 65 && span.p50 === 96 && span.p90 === 148.1 && o.rhoNew === 'measured' && o.rhoNewP10 === 'measured' && o.rhoMax === SNOW_ORIGIN.rhoMax && Object.isFrozen(c)
    && JSON.stringify(SNOW) === before && SNOW.rhoNew === 68 && SNOW_ORIGIN.rhoNew === 'literature' && near(span0.p10, 56.466, 0.01) && span0.p50 === 68 && newSnowDensity() === 68 && newSnowDensity({ c }) === 96
    && off.c === SNOW && off.origin === SNOW_ORIGIN && off.source === 'helfricht' && on.source === 'board' && on.c?.rhoNew === 96 && on.origin?.rhoNew === 'measured' && onNamed.c?.rhoNew === 96 && /nicht gebaut/.test(setup({}).err ?? '') && Object.keys(c).filter((k) => !(k in SNOW)).join() === 'rhoNewP10,rhoNewP90'
    && Object.keys(SNOW).every((k) => k === 'rhoNew' || c[k] === SNOW[k]) && /D3.*nicht gebaut/.test(throws(() => snowConstantsOf(SNOW, d3)) ?? '') && /unlesbar/.test(throws(() => snowConstantsOf(SNOW, wide)) ?? '')
    && /nicht gebaut/.test(throws(() => snowCoreSetup({ density: 'board', base: SNOW, baseOrigin: SNOW_ORIGIN, table: null })) ?? ''), { span, span0 });
  // the core with the second set is the run the calibration chose D2 with (the board of B, real study-plot days)
  const ev = J(join(FX, 'events.json')).events;
  const board = (x, cc) => { const p = emptyPack(); for (let h = 0; h < 24; h++) stepPack(p, { tMs: h * 3_600_000, solidMm: x.hnw / 24, meltMm: 0, tC: x.t[h], dtS: 3600 }, cc); return packDepthCm(p); };
  const dev = Math.max(...ev.map((x) => Math.abs(board(x, c) - boardDepth(x.hnw, x.t, () => 96)))), dev0 = Math.max(...ev.map((x) => Math.abs(board(x, SNOW) - boardDepth(x.hnw, x.t, () => SNOW.rhoNew))));
  const apart = mean(ev.map((x) => board(x, SNOW) - board(x, c)));
  add('G6 der Schneekern mit dem zweiten Satz rechnet das Brett der Eichung: an echten Messfeld-Tagen dieselbe Neuschneehöhe wie die Regel D2 mit 96 kg/m³, mit dem eigenen Satz die der Regel D0; Gegenprobe: die zwei Sätze liegen im Mittel über 2 cm auseinander',
    ev.length >= 30 && dev < 1e-9 && dev0 < 1e-9 && apart > 2, { n: ev.length, dev, dev0, apart });
}

// --- H: GM-5b — the second round (factor per glacier, shape per step, melt of the operation) and its table -----------------------------------------
{
  const report = J(join(AUDIT, 'gm5b-report.json')), table2 = J(join(HERE, 'glacier', 'snow-calibration-glaciers.json'));
  const frozen = sha(join(AUDIT, 'gm5b-method-frozen.md'));
  add('H1 die Regel der zweiten Runde ist eingefroren: der Hash der Datei steht gleich in der Hash-Datei, im Bericht und in der Tabelle',
    frozen === readFileSync(join(AUDIT, 'gm5b-method-frozen.sha256'), 'utf8').split(/\s+/)[0] && report.method.sha256 === frozen && table2.method.sha256 === frozen, { frozen });
  add('H2 die Tabelle je Gletscher ist genau das, was der Bericht nennt (neu gebaut aus dem Bericht, Feld für Feld gleich), besteht ihren Vertrag, steht als „vom Producer nicht benutzt“ da und beide Schalter sind ab Werk aus; die erste Tabelle trägt keinen Abschnitt je Gletscher',
    JSON.stringify(buildGlacierTable(report)) === JSON.stringify(table2) && snowGlaciersProblems(table2).length === 0 && table2.usedByProducer === false && GLACIER_FACTOR_DEFAULT === 'off' && GLACIER_SHAPE_DEFAULT === 'off'
    && !('glaciers' in J(join(HERE, 'glacier', 'snow-calibration.json'))), snowGlaciersProblems(table2));
  // verdicts and the two shrinkage numbers recomputed from the numbers of the report, not read from the reported result
  const S = report.summary, V = report.verdicts, r3 = (x) => Math.round(x * 1000) / 1000, gain = (a, b) => r3(1 - a / b);
  const pickOf = (grid, key) => { const best = Math.min(...grid.map((x) => x.s1)); return grid.filter((x) => x.s1 <= best * (1 + CAL2.tie)).map((x) => x[key]).sort((a, b) => b - a)[0]; };
  const k6 = gain(S.V1.all.s2, S.V0.all.s2), k7 = gain(S.V2.all.s4, S.V1.all.s4), kn = gain(S.N.all.s4, S.V1.all.s4), k5 = 1 - S.V0.all.s1 / report.sensitivities.degreeDay.V0.all.s1;
  const carries6 = k6 >= CAL2.k6 && S.gains.V1vsV0_s2.p10 > 0, carries7 = k7 >= CAL2.k7 && S.gains.V2vsV1_s4.p10 > 0 && kn < k7 / 2;
  add('H3 Urteile der zweiten Runde neu gerechnet aus den Zahlen des Berichts: K-6 (Faktor je Gletscher: Winterbilanz mindestens 20 % besser, p10 über 0), K-7 (Form: Formfehler mindestens 10 % besser, p10 über 0, die fremde Form bringt weniger als die Hälfte), K-5 (Schmelze des Betriebs gegen Gradtag, ±3 %), K-8 (Winterbilanz gegen 350 mm) und die zwei Schrumpfungszahlen nach der Regel (kleinster Stufenfehler, bei Gleichstand unter 0,5 % die größere) — alles wie berichtet; `gate` der Tabelle folgt den Urteilen',
    Math.abs(k6 - V.K6.gain) <= 0.0015 && Math.abs(k7 - V.K7.gain) <= 0.0015 && Math.abs(kn - V.K7.negative.gain) <= 0.0015 && carries6 === V.K6.carries && carries7 === V.K7.carries && table2.gate.factor === carries6 && table2.gate.shape === carries7
    && V.K5.verdict === (k5 >= CAL2.k5 ? 'besser' : k5 <= -CAL2.k5 ? 'schlechter' : 'gleich') && V.K8.reached === ((carries7 ? S.V2 : carries6 ? S.V1 : S.V0).all.s2 <= CAL2.k8)
    && pickOf(S.n0Grid, 'n0') === S.n0 && pickOf(S.n0sGrid, 'n0s') === S.n0s && table2.shrink.n0 === S.n0 && table2.shrink.n0s === S.n0s, { k6, k7, kn, k5, n0: pickOf(S.n0Grid, 'n0'), n0s: pickOf(S.n0sGrid, 'n0s') });
  const badT = [
    (t) => { t.kind = 'glacier/snow-calibration'; }, (t) => { t.method.sha256 = 'x'; }, (t) => { t.melt.model = 'ddf'; }, (t) => { delete t.against.AT; }, (t) => { delete t.shrink; }, (t) => { t.country.CH = 9; },
    (t) => { t.gate.factor = !t.gate.factor; }, (t) => { t.gate.shape = !t.gate.shape; }, (t) => { delete t.verdict.K7.p10; }, (t) => { t.glaciers = {}; },
    (t) => { Object.values(t.glaciers)[0].F = 7; Object.values(t.glaciers)[0].atBound = true; }, (t) => { Object.values(t.glaciers)[0].F = 5; }, (t) => { Object.values(t.glaciers)[0].atBound = true; }, (t) => { Object.values(t.glaciers)[0].winters = 3; }, (t) => { Object.values(t.glaciers)[0].origin = 'set'; },
    (t) => { Object.values(t.glaciers)[0].shape.stepM = 100; }, (t) => { Object.values(t.glaciers)[0].shape.s = [0.1]; }, (t) => { Object.values(t.glaciers)[0].shape.m = 1.5; }, (t) => { Object.values(t.glaciers)[0].shape.s[0] = 9; }, (t) => { Object.values(t.glaciers)[0].country = 'IT'; },
    (t) => { Object.values(t.glaciers)[0].years = [2020, 2015]; },
    // E-GM-37: the source attribution
    (t) => { delete t.sources; }, (t) => { delete t.sources.note; }, (t) => { t.sources.attribution = t.sources.attribution.filter((x) => x.id !== 'glamos'); }, (t) => { t.sources.attribution = t.sources.attribution.filter((x) => x.id !== 'wgms'); },
    (t) => { delete t.sources.attribution[0].licence; }, (t) => { delete t.sources.attribution[1].doi; },
  ];
  const caughtT = badT.map((edit) => { const t = structuredClone(table2); edit(t); return snowGlaciersProblems(t).length; });
  const atB = Object.entries(table2.glaciers).filter(([, g]) => g.atBound);
  add(`H4 Vertrag der Tabelle je Gletscher: jede von ${badT.length} Verletzungen wird gemeldet (falsche Art, fehlender Hash, andere Schmelze, fehlende Analyse, Urteil und \`gate\` im Widerspruch, Faktor außerhalb der Grenzen, Faktor an der Grenze ohne Vermerk und Vermerk ohne Grenze, weniger als vier Winter, Herkunft, Form unlesbar, fehlende Quellenangabe — GLAMOS oder WGMS, Lizenz, DOI, der Vermerk „abgeleitete Modellgrößen“); die Tabelle nennt GLAMOS und WGMS mit CC BY 4.0; ein Gletscher außerhalb eines Katalogs wird gemeldet; der eine Eintrag an der Grenze trägt den Vermerk`,
    caughtT.every((n) => n > 0) && table2.sources.attribution.map((x) => x.id).join() === 'glamos,wgms' && table2.sources.attribution.every((x) => /^CC BY 4\.0/.test(x.licence)) && /keine Zeile/.test(table2.sources.note)
    && snowGlaciersProblems(table2, new Set(['gl_x'])).length === Object.keys(table2.glaciers).length && atB.length === 1 && atB[0][1].F === 5, { caughtT, atB: atB.map(([id]) => id) });
  // the readers, by hand
  const sh = { z0: 2400, stepM: 50, s: [-0.2, 0, 0.4], m: 0.5 };
  const corr = shapeCorrOf(sh, [2400, 2450, 2500], [0.5, 0.25, 0.25]), bar = 0.5 * -0.2 + 0.25 * 0 + 0.25 * 0.4;
  const floor = shapeCorrOf({ ...sh, s: [-3, 0, 3], m: 1 }, [2400, 2450, 2500], [1 / 3, 1 / 3, 1 / 3]);
  const tOn = structuredClone(table2), idB = atB[0][0], idA = Object.keys(table2.glaciers).find((id) => !table2.glaciers[id].atBound);
  const both = glacierRunOf(tOn, { factor: true, shape: true }), none = glacierRunOf(tOn, {}), onlyS = glacierRunOf(tOn, { shape: true });
  let refF = '', refS = '';
  try { const t = structuredClone(table2); t.verdict.K6.carries = false; t.gate.factor = false; glacierRunOf(t, { factor: true }); } catch (e) { refF = String(e.message); }
  try { const t = structuredClone(table2); t.verdict.K7.carries = false; t.gate.shape = false; glacierRunOf(t, { shape: true }); } catch (e) { refS = String(e.message); }
  add('H5 Leser der Tabelle, von Hand: die Form zwischen den Stützstellen linear (2 425 m: −0,1; 2 475 m: +0,2), außerhalb der Wert der nächsten; der Multiplikator je Band ist 1 + m · (Form − flächengewichtetes Mittel) und im flächengewichteten Mittel 1, nie unter der Untergrenze 0,2; ohne Schalter gibt der Leser nichts heraus, ein Faktor an der Grenze wird nicht herausgegeben (seine Form schon), ein Gletscher ohne Eintrag bekommt nichts; ein Urteil, das nicht trägt, bricht den Leser ab (Faktor und Form getrennt)',
    near(shapeAtElevation(sh, 2425), -0.1, 1e-12) && near(shapeAtElevation(sh, 2475), 0.2, 1e-12) && shapeAtElevation(sh, 2300) === -0.2 && shapeAtElevation(sh, 2900) === 0.4
    && near(corr[0], 1 + 0.5 * (-0.2 - bar), 1e-12) && near(corr[2], 1 + 0.5 * (0.4 - bar), 1e-12) && near(0.5 * corr[0] + 0.25 * corr[1] + 0.25 * corr[2], 1, 1e-12) && floor[0] === 0.2 && floor[2] === 4
    && both.factorOf(idA) === table2.glaciers[idA].F && both.factorOf(idB) === null && Array.isArray(both.corrOf(idB, [2800, 2900], [0.5, 0.5])) && both.factorOf('gl_x') === null && both.corrOf('gl_x', [1], [1]) === null
    && none.factorOf(idA) === null && none.corrOf(idA, [2800], [1]) === null && onlyS.factorOf(idA) === null && Array.isArray(onlyS.corrOf(idA, [2800, 2900], [0.5, 0.5])) && /gate\.factor/.test(refF) && /gate\.shape/.test(refS), { corr, floor, refF, refS });

  // the tool of the round on INVENTED winters with a known factor per glacier and a known shape (no real truth is read here)
  const mEti = { model: 'eti', TF: J(join(HERE, 'glacier', 'melt-calibration.json')).fit.TF, SRF: J(join(HERE, 'glacier', 'melt-calibration.json')).fit.SRF };
  const rnd = rng(7), Hh = 24 * 150, zs = [2650, 2750, 2850, 2950, 3050], ws = [0.15, 0.25, 0.25, 0.2, 0.15];
  const inv = [['a', 'CH', 1.4, [-0.3, -0.1, 0, 0.1, 0.2]], ['b', 'CH', 2.2, [0.2, 0.1, 0, -0.1, -0.3]], ['c', 'CH', 1.8, [0, 0, 0, 0, 0]], ['d', 'AT', 2.6, [-0.2, 0, 0.1, 0.1, -0.1]], ['e', 'AT', 2.0, [0.1, 0, 0, 0, -0.1]]];
  const wintersInv = [];
  for (const [key, country, F, shape] of inv) {
    const bar2 = shape.reduce((s, v, b) => s + ws[b] * v, 0), c = shape.map((v) => 1 + v - bar2);
    for (let y = 2016; y < 2022; y++) {
      const t = new Float64Array(Hh), p = new Float64Array(Hh), g = new Float64Array(Hh); let wetLeft = 0;
      for (let h = 0; h < Hh; h++) {
        t[h] = 8 * Math.abs(h - Hh / 2) / (Hh / 2) + 4 * Math.sin((2 * Math.PI * ((h % 24) - 9)) / 24) + 2 * gauss(rnd);   // at a station 1 000 m below; warm at both ends of the winter
        if (rnd() < 0.02) wetLeft = 6 + Math.floor(rnd() * 18); p[h] = wetLeft > 0 ? 0.3 + rnd() : 0; if (wetLeft > 0) wetLeft--;
        g[h] = Math.max(0, 350 * Math.sin((2 * Math.PI * ((h % 24) - 6)) / 24)) * (0.4 + 0.6 * rnd());
      }
      const rec = { key, country, year: y, name: key, catId: `gl_${key}`, zMed: 2850, zT: 1850, lat: 46.5, lon: 8, t, p, g, gClear: g, gMiss: 0, t0: `${y - 1}-10-01`, b: zs.map((z, b) => ({ z, d: z - 2850, w: ws[b], bw: 0 })) };
      rec.b.forEach((x, b) => { x.bw = balOne(rec, mEti, b, F * c[b] * (1 + 0.02 * gauss(rnd))); });
      wintersInv.push(rec);
    }
  }
  const ev = evaluate(wintersInv, mEti), tv = tableValues(ev), sum = ev.summary;
  const fOk = inv.every(([key, , F]) => Math.abs(tv[key].F / F - 1) < 0.03);
  add('H6 das Werkzeug der zweiten Runde findet bekannte Werte wieder: an erfundenen Wintern (5 Gletscher × 6 Winter, 2 % Rauschen) den Faktor je Gletscher auf 3 %, die Rangfolge der Varianten (Stufenfehler V0 > V1 > V2; die Form senkt den Formfehler, die fremde Form der Negativkontrolle nicht), ohne Schrumpfung als beste Stellung; Gegenprobe: der Landeswert allein trifft keinen der Faktoren',
    fOk && sum.V0.all.s1 > sum.V1.all.s1 * 1.5 && sum.V1.all.s1 > sum.V2.all.s1 * 1.5 && sum.V2.all.s4 < sum.V1.all.s4 * 0.6 && sum.N.all.s4 > sum.V2.all.s4 * 2 && sum.n0 === 0 && sum.gains.V1vsV0_s2.gain > 0.5 && sum.gains.V2vsV1_s4.gain > 0.4
    && inv.filter(([key, country, F]) => Math.abs(sum.countryFull[country] / F - 1) < 0.03).length <= 1, { F: Object.fromEntries(Object.entries(tv).map(([k, v]) => [k, v.F])), country: sum.countryFull, s1: [sum.V0.all.s1, sum.V1.all.s1, sum.V2.all.s1], s4: [sum.V1.all.s4, sum.V2.all.s4, sum.N.all.s4] });
  // nothing of a winter goes into its own prediction: the factor comes from the OTHER winters, the country value from the OTHER glaciers, the shapes from the other winters
  const cA = ev.cases.find((c) => c.key === 'a'), listA = ev.byG.get('a'), othersA = listA.filter((x) => x !== cA.it), chOthers = ev.items.filter((x) => x.rec.country === 'CH' && x.rec.key !== 'a');
  add('H6b ein Winter geht nie in seine eigene Vorhersage ein: der Faktor eines Falls ist genau der Fit über die ANDEREN Winter des Gletschers (und ein anderer als der Fit über alle), der Landeswert genau der Fit über die ANDEREN Gletscher des Landes, die Formen sind die der anderen Winter (keine davon die eigene), und ihre Zahl ist die der anderen Winter',
    cA.Fown === fitF(othersA) && cA.Fown !== fitF(listA) && cA.FL === fitF(chOthers) && cA.FL !== ev.FLfull.CH && cA.n === listA.length - 1 && cA.sh.length === cA.n && !cA.sh.includes(ev.shapes.get(cA.it)) && othersA.every((x) => cA.sh.includes(ev.shapes.get(x)))
    && cA.foreign.every((shp) => !listA.some((x) => ev.shapes.get(x) === shp)), { Fown: cA.Fown, all: fitF(listA), FL: cA.FL, full: ev.FLfull.CH });
  // the multipliers of the steps from shapes, by hand: mean of the shapes, area-weighted mean-free, shrunk, never below the floor
  const recS = { b: [{ z: 2500, w: 0.75 }, { z: 2600, w: 0.25 }] }, shs = [{ z: [2500, 2600], r: [0.1, 0.5] }, { z: [2500, 2600], r: [0.3, 0.7] }];
  const sf = shapeFactors(recS, shs, 0.5), sfFloor = shapeFactors(recS, [{ z: [2500, 2600], r: [-9, 3] }], 1);
  add('H6c Multiplikatoren der Stufen aus den Formen, von Hand: Mittel der Formen (0,2 und 0,6), flächengewichtetes Mittel 0,3 abgezogen, mit m = 0,5 geschrumpft ⇒ 0,95 und 1,15; ihr flächengewichtetes Mittel ist 1; nie unter der Untergrenze 0,2; ohne Formen überall 1',
    near(sf[0], 0.95, 1e-12) && near(sf[1], 1.15, 1e-12) && near(0.75 * sf[0] + 0.25 * sf[1], 1, 1e-12) && sfFloor[0] === CAL2.shapeFloor && JSON.stringify(shapeFactors(recS, [], 1)) === '[1,1]', { sf, sfFloor });
  // the building blocks, by hand
  const rec0 = wintersInv[0], tab0 = tableOf(rec0, mEti), exact = balAll(rec0, mEti, 1.5), jk = Math.round((1.5 - CAL2.kMin) / CAL2.kStep);
  const direct = simulate({ bands: { zb: rec0.b.map((x) => x.z), w: rec0.b.map((x) => x.w) }, ela: rec0.zMed, t: rec0.t, g: rec0.g, p: rec0.p, zT: rec0.zT, zP: rec0.zMed, pf: 1.5, TF: mEti.TF, SRF: mEti.SRF, state: emptyState(5), model: 'eti', pGrad: 0 }).bal;
  const ddfBal = balAll(rec0, { model: 'ddf', TF: 0, SRF: 0, ddf: CAL2.ddf }, 1.5);
  const ks = kStar(tab0[2], exact[2]), sc = scoreOf2(rec0, mEti, rec0.b.map(() => 1.5)), eHand = rec0.b.map((x, b) => exact[b] - x.bw);
  const s1Hand = eHand.reduce((s, e, b) => s + rec0.b[b].w * Math.abs(e), 0), s3Hand = eHand.reduce((s, e, b) => s + rec0.b[b].w * e, 0);
  add('H7 Bausteine der zweiten Runde: die Rechnung je Stufe IST der Schmelzkern des Betriebs (dieselben Zahlen wie ein direkter Aufruf mit Modell „eti“ und TF / SRF aus `melt-calibration.json`; Gegenprobe: die Gradtag-Schmelze gibt andere), die Tabelle über den Multiplikator trifft an einem Gitterpunkt den exakten Wert, der gesuchte Multiplikator einer Stufe wird aus ihrer Bilanz wiedergefunden (auf 0,001), an den Grenzen gekappt und gezählt, die Kennzahlen s1 und s3 von Hand',
    exact.every((v, b) => v === direct[b]) && ddfBal.some((v, b) => Math.abs(v - exact[b]) > 1) && tab0.every((row, b) => Math.abs(row[jk] - exact[b]) < 1e-9) && Math.abs(tabVal(tab0[1], 1.5) - exact[1]) < 1e-9
    && Math.abs(ks.k - 1.5) < 1e-3 && !ks.capped && kStar(tab0[2], -1e9).capped && kStar(tab0[2], 1e9).capped && kStar(tab0[2], 1e9).k === CAL2.kMax && near(sc.s1, s1Hand, 1e-9) && near(sc.s3, s3Hand, 1e-9) && near(sc.s2, Math.abs(s3Hand), 1e-9), { ks, s1: [sc.s1, s1Hand] });
  // radiation at the glacier, by hand: the station's value with the clear-sky elevation gain, an hour without one = clear sky × 0.55
  const fromMs0 = Date.parse('2020-01-01T00:00:00Z'), recR = { station: { id: 'X' }, t0: '2020-06-21', t: new Float64Array(24), zMed: 3000, lat: 46.5, lon: 8 };
  const radX = { height: 1500, g: new Array(24 * 400).fill(null) }, i0R = Math.round((Date.parse('2020-06-21T00:00:00Z') - fromMs0) / 3_600_000);
  radX.g[i0R + 11] = 600; radX.g[i0R + 12] = 0;
  attachRadiation([recR], () => radX, fromMs0);
  const noon = clearSky(cosZenith(46.5, 8, Date.parse('2020-06-21T10:30:00Z')), 3000) * 0.55;
  add('H8 Strahlung am Gletscher, von Hand: der Stationswert mit dem Höhenzuschlag des Klarhimmels (600 W/m² auf 1 500 m werden auf 3 000 m 600 · 1,18 / 1,09), eine gemessene Null bleibt null, eine Stunde ohne Messung bekommt Klarhimmel × 0,55 (mittags im Juni mehrere hundert W/m², nachts 0), und der Anteil solcher Stunden wird gezählt (22 von 24)',
    near(recR.g[11], (600 * (1 + 6e-5 * 3000)) / (1 + 6e-5 * 1500), 1e-9) && recR.g[12] === 0 && near(recR.g[10], noon, 1e-9) && noon > 300 && recR.g[0] === 0 && near(recR.gMiss, 22 / 24, 1e-12), { g11: recR.g[11], noon, gMiss: recR.gMiss });
}

// --- I: GM-10b (E-GM-44) — the predicted factor of the Swiss glaciers: contract and reader of the table, the rule by hand, the search for x1, the fit -------
{
  const fx = J(join(HERE, 'lib', 'fixtures', 'glacier', 'snowcal-predicted.json'));
  const cat = new Map(['gl_ch_alpha', 'gl_ch_beta', 'gl_ch_gamma', 'gl_ch_delta'].map((id) => [id, { id, country: 'CH' }]).concat([['gl_at_x', { id: 'gl_at_x', country: 'AT' }]]));
  const bad = (f) => { const t = structuredClone(fx); f(t); return snowFactorTableProblems(t, cat); };
  const negatives = {
    kind: (t) => { t.kind = 'x'; }, country: (t) => { t.country = 'AT'; }, measured: (t) => { t.origin = 'measured'; }, verified: (t) => { t.verified = true; }, note: (t) => { delete t.note; },
    ownHash: (t) => { t.inputs.ownTable = 'x'; }, countryF: (t) => { delete t.inputs.countryF; }, form: (t) => { t.rule.form = 'A'; }, predictors: (t) => { t.rule.predictors = ['x1', 'zMed']; },
    minCells: (t) => { t.rule.minCells = 0; }, shrink: (t) => { t.rule.shrink = 1; }, ruleOrigin: (t) => { t.rule.origin = 'measured'; }, small: (t) => { delete t.smallClasses; },
    beta: (t) => { t.model.beta = [0.1, 0.2]; }, sc: (t) => { t.model.sc[1] = 0; }, ranges: (t) => { t.model.cal.ranges.zMed = [3000, 2000]; }, minArea: (t) => { t.model.cal.minArea = 0; },
    spreadBasis: (t) => { delete t.spread['predicted-shrunk']; }, spreadPair: (t) => { t.spread.predicted.p10 = 1.1; }, spreadOrigin: (t) => { t.spread.origin = 'set'; },
    basis: (t) => { t.glaciers.gl_ch_beta.b = 'guess'; }, bounds: (t) => { t.glaciers.gl_ch_beta.F = 7; }, countryWhy: (t) => { delete t.glaciers.gl_ch_delta.why; }, countryValue: (t) => { t.glaciers.gl_ch_delta.F = 2; }, countryValueOnly: (t) => { t.glaciers.gl_ch_delta.F = 2; t.glaciers.gl_ch_delta.q = [1.46, 2.74]; },
    whyElsewhere: (t) => { t.glaciers.gl_ch_beta.why = 'x'; }, unclamped: (t) => { t.glaciers.gl_ch_beta.F = 3.2; t.glaciers.gl_ch_beta.q = [2.56, 3.84]; }, fullSmall: (t) => { t.glaciers.gl_ch_beta.n = 4; },
    shrunkBig: (t) => { t.glaciers.gl_ch_gamma.n = 5; }, shrunkButCountry: (t) => { t.smallClasses.rule = 'country'; }, q: (t) => { t.glaciers.gl_ch_beta.q = [1.6, 2.6]; }, qLow: (t) => { t.glaciers.gl_ch_beta.q = [1.6, 2.52]; }, qHigh: (t) => { t.glaciers.gl_ch_beta.q = [1.68, 2.6]; }, counts: (t) => { t.counts.predicted = 5; },
    notSwiss: (t) => { t.glaciers.gl_at_x = { ...t.glaciers.gl_ch_beta }; t.counts.predicted = 2; }, unknown: (t) => { t.glaciers.gl_ch_nobody = { ...t.glaciers.gl_ch_beta }; t.counts.predicted = 2; },
    sources: (t) => { delete t.sources; }, citation: (t) => { t.sources.attribution[0].citation = 'GLAMOS (2025), doi:10.18750/massbalance.2025.r2025'; },
  };
  const caught = Object.fromEntries(Object.entries(negatives).map(([k, f]) => [k, bad(f).length]));
  add('I1 Vertrag der Tabelle vorhergesagter Faktoren (GM-10b): die synthetische Fixture hat keinen Befund; 38 Verletzungen, jede gemeldet — Art, Land, Herkunft „measured“, „nachgeprüft“, Vermerk, Hash der eigenen Tabelle, Landeswert, Form, Prädiktoren, Mindestzellen, Schrumpfung, Herkunft der Regel, Entscheidung für die kleinen Gletscher, β, Skala, Spannen, kleinste Fläche, eine Grundlage ohne Paar, Paar ohne 1 dazwischen, Herkunft der Paare, unbekannte Grundlage, Faktor außerhalb der Grenzen, Landeswert ohne Grund oder mit anderem Wert (auch mit dazu passender Spanne), Grund an anderer Zeile, nicht gekappt, volle Form unter 5 Zellen, geschrumpfte ab 5 Zellen, geschrumpfte obwohl die Kleinen den Landeswert behalten, Spanne passt nicht zur Grundlage (beide Enden, nur das untere, nur das obere), Zählung, Gletscher nicht in der Schweiz oder nicht im Katalog, Quellenangabe fehlt, Zitierwortlaut von GLAMOS weicht ab',
    snowFactorTableProblems(fx, cat).length === 0 && Object.values(caught).every((n) => n > 0) && Object.keys(caught).length === 38, JSON.stringify(Object.entries(caught).filter(([, n]) => !n)));
  // reader, by hand, against a stub of the GM-5b reader
  const ownSha = '1'.repeat(64), withSha = () => { const t = structuredClone(fx); t.inputs.ownTable = ownSha; return t; };
  const own = { factorOf: (id) => (id === 'gl_ch_alpha' ? 2.5 : null) };
  const args = { own, ownSha, countryOf: () => 1.793, catalog: cat, tableSha: 'a'.repeat(64) };
  const rd = factorTableRunOf(withSha(), args);
  const throws = (t, a = args) => { try { factorTableRunOf(t, a); return null; } catch (e) { return String(e.message); } };
  const tOwn = withSha(); tOwn.glaciers.gl_ch_alpha.F = 2.4; tOwn.glaciers.gl_ch_alpha.q = [2.328, 2.472];
  const tAsPred = withSha(); tAsPred.glaciers.gl_ch_alpha = { b: 'predicted', F: 2.5, q: [2, 3], n: 12 }; tAsPred.counts = { own: 0, predicted: 2, 'predicted-shrunk': 1, country: 1 };
  const refusals = [throws(fx), throws(tOwn), throws(tAsPred), throws(withSha(), { ...args, countryOf: () => 1.8 }), throws({ ...withSha(), origin: 'measured' })];
  add('I2 Leser der Tabelle, von Hand: eigener Faktor 2,5, vorhergesagt 2,1, geschrumpft 1,9 — die Zeile „country“ gibt nichts heraus (der Lauf nimmt den Wert der Region), ein Gletscher ohne Zeile auch nicht; Grundlage je Zeile, die Paare je Grundlage aus der Tabelle; der Block nennt Regel, Hash, Form, Mindestzellen, Schrumpfung, Entscheidung, „computed“, „nicht nachgeprüft“, Zählung; Abbruch mit Grund bei: Tabelle gegen eine andere eigene Tabelle gebaut, Zeile „own“ mit anderem Faktor, Gletscher mit eigenem Faktor als „predicted“, anderer Landeswert im Lauf, Verstoß gegen den Vertrag',
    rd.factorOf('gl_ch_alpha') === 2.5 && rd.factorOf('gl_ch_beta') === 2.1 && rd.factorOf('gl_ch_gamma') === 1.9 && rd.factorOf('gl_ch_delta') === null && rd.factorOf('gl_ch_nobody') === null
    && rd.basisOf('gl_ch_gamma') === 'predicted-shrunk' && rd.basisOf('gl_ch_nobody') === null && rd.spread.predicted.p90 === 1.2 && rd.spread.country.n === 31
    && rd.block.rule === 'predicted' && rd.block.table === 'a'.repeat(64) && rd.block.minCells === 5 && rd.block.shrink === 0.5 && rd.block.small === 'shrunk' && rd.block.origin === 'computed' && rd.block.verified === false && rd.block.counts.own === 1
    && /inputs\.ownTable/.test(refusals[0]) && /Zeile „own“ ohne denselben/.test(refusals[1]) && /Zeile aber „predicted“/.test(refusals[2]) && /mit 1\.793 gebaut/.test(refusals[3]) && /Herkunft measured/.test(refusals[4]), JSON.stringify(refusals));
  // the rule by hand
  const model = { c: Math.log(2), beta: [0.2, -0.1, 0.05], mu: [0, 3000, 0], sc: [1, 100, 1] };
  const calR = { ranges: { x1: [-0.5, 1], zMed: [2600, 3600], north: [-0.8, 0.9] }, minArea: 0.02, own: [1.2, 3.0] };
  const g = { x1: 0.4, zMed: 3200, north: 0.5, nIn: 6, areaKm2: 0.3 };
  const FcHand = Math.exp(Math.log(2) + 0.2 * 0.4 - 0.1 * 2 + 0.05 * 0.5);
  const full = ruleOf(g, model, calR, 1.793), five = ruleOf({ ...g, nIn: 5 }, model, calR, 1.793), shr = ruleOf({ ...g, nIn: 4 }, model, calR, 1.793), shr0 = ruleOf({ ...g, nIn: 0 }, model, calR, 1.793);
  const hi = ruleOf({ ...g, x1: 1, zMed: 2600, north: 0.9 }, model, calR, 1.793), lo = ruleOf({ ...g, x1: -0.5, zMed: 3600, north: -0.8 }, model, calR, 1.793);
  const small = ruleOf({ ...g, areaKm2: 0.019 }, model, calR, 1.793), edge = ruleOf({ ...g, areaKm2: 0.02 }, model, calR, 1.793), noX = ruleOf({ ...g, x1: null }, model, calR, 1.793);
  const outs = [ruleOf({ ...g, x1: 1.01 }, model, calR, 1.793), ruleOf({ ...g, zMed: 2599 }, model, calR, 1.793), ruleOf({ ...g, north: 0.91, x1: -0.6 }, model, calR, 1.793)];
  const hiHand = Math.exp(Math.log(2) + 0.2 + 0.4 + 0.045), loHand = Math.exp(Math.log(2) - 0.1 - 0.6 - 0.04);
  add('I3 Regel von Hand (Jan, E-GM-44): ab 5 Zellen (genau 5 eingeschlossen) die volle Form C (exp(c + Σ β · z)); darunter der halbe Weg zum Landeswert in ln — auch bei 0 Zellen; ein vorhergesagter Faktor über bzw. unter den eigenen Faktoren wird an 3,0 bzw. 1,2 gekappt (vor der Kappung steht der Rohwert); kleiner als der kleinste Eichgletscher (auch knapp) ⇒ Landeswert, genau gleich groß nicht; x1, Medianhöhe oder Exposition außerhalb der Eichspanne ⇒ Landeswert mit dem benannten Prädiktor, der Rand selbst gilt noch; ohne x1 ⇒ Landeswert; SNOW_FACTOR_RULE nennt 5 Zellen, ½, „set“',
    full.basis === 'predicted' && near(full.F, FcHand, 1e-12) && five.basis === 'predicted' && shr.basis === 'predicted-shrunk' && near(shr.F, Math.exp(0.5 * Math.log(FcHand) + 0.5 * Math.log(1.793)), 1e-12) && shr0.basis === 'predicted-shrunk'
    && hi.basis === 'predicted' && hi.F === 3.0 && near(hi.raw, hiHand, 1e-12) && hi.clamped === true && lo.F === 1.2 && near(lo.raw, loHand, 1e-12)
    && small.basis === 'country' && small.F === 1.793 && small.why === 'smaller-than-calibration' && edge.basis === 'predicted' && noX.why === 'no-grid-predictor'
    && outs[0].why === 'outside:x1' && outs[1].why === 'outside:zMed' && outs[2].why === 'outside:x1+north' && outs.every((o) => o.basis === 'country' && o.F === 1.793)
    && SNOW_FACTOR_RULE.minCells === 5 && SNOW_FACTOR_RULE.shrink === 0.5 && SNOW_FACTOR_RULE.origin === 'set' && JSON.stringify(SNOW_FACTOR_BASES) === '["own","predicted","predicted-shrunk","country"]',
    JSON.stringify({ full, shr, hi, lo, FcHand }));
  // the search for x1 on the grid: lazy bisection = the full table (first crossing, linear in between, capped), on a balance that never falls with k
  const KSg = Float64Array.from({ length: 236 }, (_, j) => Math.round((0.3 + j * 0.02) * 100) / 100), rr = rng(11);
  let same = 0, maxEvals = 0, n = 0;
  for (let c = 0; c < 40; c++) {
    let acc = -300 - 200 * rr(); const tot = KSg.map(() => (acc += rr() < 0.1 ? 0 : 5 * rr()));   // flat stretches included
    for (const target of [tot[0] - 1, tot[0], tot[235] + 1, tot[235], ...Array.from({ length: 6 }, () => tot[0] + (tot[235] - tot[0]) * rr()), tot[100]]) {
      n++; const a = kForLazy((j) => tot[j], target, KSg);
      // the full-table rule of step 0 (kFor in gm10-factor.mjs)
      let b; if (target <= tot[0]) b = { k: KSg[0], capped: true }; else { b = { k: KSg[235], capped: true }; for (let j = 0; j < 235; j++) if (tot[j + 1] >= target) { const d = tot[j + 1] - tot[j]; b = { k: KSg[j] + (d > 0 ? ((target - tot[j]) / d) * (KSg[1] - KSg[0]) : 0), capped: false }; break; } }
      if (a.k === b.k && a.capped === b.capped) same++; maxEvals = Math.max(maxEvals, a.evals);
    }
  }
  add('I4 Suche nach x1 auf dem Gitter: die Bisektion gibt an 440 erfundenen, nie fallenden Bilanzen (mit flachen Stücken, Zielen am Rand, unter und über der Spanne) genau den Wert der vollen Tabelle (erster Schnitt, linear dazwischen, gekappt) — mit höchstens 10 statt 236 Kernläufen',
    same === n && n === 440 && maxEvals <= 10, JSON.stringify({ same, n, maxEvals }));
  // the fit finds known coefficients on invented tables (the scored measure of step 0) and predicts by hand
  const tv = (row, k) => { const x = (Math.min(5, Math.max(0.3, k)) - 0.3) / 0.02, j = Math.min(234, Math.floor(x)); return row[j] + (row[j + 1] - row[j]) * (x - j); };
  const glac = Array.from({ length: 24 }, (_, i) => ({ key: `g${i}`, x: [rr() * 2 - 0.5, 2700 + 1000 * rr(), rr() * 1.6 - 0.8] }));
  const truthF = (x) => Math.exp(Math.log(1.8) + 0.25 * (x[0] - 0.5) / 0.6 - 0.15 * (x[1] - 3200) / 290 + 0.1 * x[2] / 0.46);
  for (const g2 of glac) g2.items = Array.from({ length: 6 }, () => { const A = 300 + 400 * rr(), B = 200 * rr(), tot = Float64Array.from(KSg, (k) => A * k - B); return { tot, BW: tv(tot, truthF(g2.x)) }; });
  const fit = fitForm(glac, tv), errs = glac.map((g2) => Math.abs(Math.log(predictOf(fit, g2.x) / truthF(g2.x))));
  const hand = Math.exp(fit.c + fit.beta.reduce((s, b, j) => s + b * ((glac[0].x[j] - fit.mu[j]) / fit.sc[j]), 0));
  add('I5 Anpassung auf der gewerteten Kennzahl (der Code von Schritt 0): an 24 erfundenen Gletschern mit bekanntem Faktor exp(c + β · z) findet sie jeden Faktor auf 2 % wieder und die Vorzeichen der drei β; die Vorhersage ist von Hand exp(c + Σ β · (x − μ) / s); die Konstante allein (Landeswert desselben Maßes) ist eine eigene Anpassung',
    Math.max(...errs) < 0.02 && fit.beta[0] > 0 && fit.beta[1] < 0 && fit.beta[2] > 0 && near(predictOf(fit, glac[0].x), hand, 1e-12) && Number.isFinite(fit.c0) && fit.c0 !== fit.c, JSON.stringify({ maxErr: Math.max(...errs), beta: fit.beta }));
  const eI = [Math.log(0.9), 0, Math.log(1.1), Math.log(1.2), Math.log(0.8)], sp = spreadOfErrors(eI), sI = [...eI].sort((x, y) => x - y);
  const q10 = Math.round(Math.exp(sI[0] + 0.4 * (sI[1] - sI[0])) * 1000) / 1000, q90 = Math.round(Math.exp(sI[3] + 0.6 * (sI[4] - sI[3])) * 1000) / 1000;
  add('I6 Paar je Grundlage von Hand: p10/p90 = exp(Quantile von ln(F / F_eigen)), n, Streuung in ln; unter drei Werten kein Paar; die Faktorregel des Zustands ist <Wort>:<16 hex der Tabelle>, aus = keine Regel; „predicted“ ist ein Wort des Schalters, die Voreinstellung bleibt „off“',
    sp.n === 5 && sp.p10 === q10 && sp.p90 === q90 && q10 < 0.85 && q90 > 1.15 && spreadOfErrors([0, 0]) === null && factorRuleOf('predicted', 'ab'.repeat(32)) === `predicted:${'ab'.repeat(8)}` && factorRuleOf('off', 'x') === null
    && glacierFactorModeOf('predicted') === 'predicted' && GLACIER_FACTOR_DEFAULT === 'off', JSON.stringify(sp));
  // the tool's x1 on one invented glacier: three winters reach their gain at k = 1,5 / 2 / 0,8 ⇒ x1 = mean ln k; a winter without gain is dropped, one without grid value counted
  const mEtiI = { model: 'eti', TF: J(join(HERE, 'glacier', 'melt-calibration.json')).fit.TF, SRF: J(join(HERE, 'glacier', 'melt-calibration.json')).fit.SRF };
  const mkRec = (year) => { const n2 = 24 * 120, t = new Float64Array(n2), p = new Float64Array(n2), gg = new Float64Array(n2); for (let h = 0; h < n2; h++) { t[h] = -3 + 2 * Math.sin((2 * Math.PI * h) / 24); p[h] = h % 30 < 6 ? 1 : 0; gg[h] = 100; } return { year, t, p, g: gg, zT: 2000, zMed: 2800, b: [{ z: 2700, w: 0.4 }, { z: 2900, w: 0.6 }] }; };
  const totOf = (rec, k) => { const bal = balAll(rec, mEtiI, k); return 0.4 * bal[0] + 0.6 * bal[1]; };
  const recs = [2017, 2018, 2019, 2020, 2021].map(mkRec), ks = [1.5, 2, 0.8];
  const q20w = { 2017: { swe0: 10, swe1: 10 + totOf(recs[0], 1.5) }, 2018: { swe0: 0, swe1: totOf(recs[1], 2) }, 2019: { swe0: 5, swe1: 5 + totOf(recs[2], 0.8) }, 2020: { swe0: 50, swe1: 40 } };
  const xr = x1Of(recs, q20w, mEtiI), two = x1Of(recs.slice(0, 2), q20w, mEtiI);
  add('I7 x1 des Werkzeugs an einem erfundenen Gletscher: drei Winter erreichen ihren Zuwachs bei k = 1,5 / 2 / 0,8 ⇒ x1 = Mittel der ln k (auf 1e-3); ein Winter ohne Zuwachs fällt heraus, einer ohne Gitterwert wird gezählt; unter drei Wintern kein x1',
    near(xr.x1, (Math.log(1.5) + Math.log(2) + Math.log(0.8)) / 3, 1e-3) && xr.winters === 3 && xr.dropped === 1 && xr.missing === 1 && two.x1 === null && two.winters === 2, JSON.stringify(xr));

  // the committed table (GLAMOS confirmed the use on 25.11.2026): it keeps the rules of its own and names its sources
  const tabPath = join(HERE, 'glacier', 'snow-factor-predicted-ch.json');
  const tab = J(tabPath), rowsT = Object.values(tab.glaciers ?? {});
  const glamos = tab.sources?.attribution?.find((x) => x.id === 'glamos');
  const ownT = J(join(HERE, 'glacier', 'snow-calibration-glaciers.json'));
  const ownCH = Object.entries(ownT.glaciers ?? {}).filter(([, g]) => g.country === 'CH').map(([id]) => id);
  add('I8 Tabelle im Repo (`scripts/glacier/snow-factor-predicted-ch.json`): ohne Befund des Vertrags; der Kopf nennt die Quellen wie `SNOW_FACTOR_SOURCES` mit dem Zitierwortlaut von GLAMOS, Release 2025 (CC BY 4.0, Bestätigung vom 25.11.2026); „verified: false“; jede Grundlage kommt vor und die Zählung stimmt; der Hash der eigenen Tabelle ist der der Tabelle im Repo; ein Gletscher mit eigenem Faktor steht als „own“ mit genau diesem Faktor',
    snowFactorTableProblems(tab).length === 0 && JSON.stringify(tab.sources) === JSON.stringify(SNOW_FACTOR_SOURCES) && glamos?.citation === 'GLAMOS (2025). Swiss Glacier Mass Balance, release 2025, Glacier Monitoring Switzerland, doi:10.18750/massbalance.2025.r2025.' && glamos?.licence === 'CC BY 4.0'
      && tab.verified === false && SNOW_FACTOR_BASES.every((b) => rowsT.some((g) => g.b === b)) && rowsT.length === SNOW_FACTOR_BASES.reduce((s, b) => s + tab.counts[b], 0)
      && tab.inputs.ownTable === createHash('sha256').update(readFileSync(join(HERE, 'glacier', 'snow-calibration-glaciers.json'))).digest('hex')
      && Object.entries(tab.glaciers).filter(([, g]) => g.b === 'own').every(([id, g]) => ownCH.includes(id) && Math.abs(g.F - ownT.glaciers[id].F) < 1e-9),
    JSON.stringify({ problems: snowFactorTableProblems(tab).slice(0, 5), counts: tab.counts, glamos }));
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-snowcal ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
