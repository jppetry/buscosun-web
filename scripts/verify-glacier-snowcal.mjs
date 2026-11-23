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

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-snowcal ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
