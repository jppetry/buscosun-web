/**
 * verify:road-surface — Phase FB (audit/autobahn-fahrbahn.md): „buscosun Fusion — Fahrbahn", the road surface forecast
 * of Autobahnwetter (+0 … +6 h) — model, table, fit, backtest, producer plumbing, archive, view texts, flag.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-road-surface.mjs [--archive=<clone of buscosun-archiv>]
 *
 * Offline. A  model FB-1 as a pure function: table check with named reasons, climatology, anomaly, weights, hint class,
 *             cold probability, flag order
 *          B  contract: the optional series rs/rk/rq in the value lock (present, absent, out of range)
 *          C  fit and backtest on a SYNTHETIC archive with known truth (written in the archive's own file forms, read by the
 *             real readers): the fit recovers climatology, weights and bias; the score ranks FB-1 over the baselines;
 *             the gate says GRÜN; negative controls — a zero table equals the air proxy (ROT), a sensor with +50 K stays
 *             out of the fit (A1), the rule file is hashed
 *          D  producer plumbing without the cube: `applySurface` fills 0 … 6 h and nulls beyond, `readSurfaceTable` names
 *             every reason, `surfaceEngineOf` sums the shards
 *          E  archive thinning keeps rs/rk/rq and tolerates runs without them
 *          F  view model: values, texts („berechnet" in every surface text, no measured class label), σ text, series
 *          G  (only with --archive) the REAL archive: pairs, a fit that passes its own check
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  ROAD_SURFACE_HORIZON_H, ROAD_SURFACE_WET_PP, ROAD_SURFACE_COLD_C, ROAD_SURFACE_WORD, ROAD_SURFACE_HINT, ROAD_SURFACE_HINT_LABEL,
  ROAD_SURFACE_ORIGIN, ROAD_SURFACE_FIT_MAX_ABS_K, ROAD_SURFACE_TABLE_PATH, ROAD_SURFACE_MODEL,
  roadSurfaceTableProblems, parseRoadSurfaceTable, roadSurfaceClim, roadSurfaceSeries, roadSurfaceHint, roadSurfaceHintOf, roadSurfaceColdProb, normalCdf,
  roadSurfaceWet,
} from '../src/road/roadSurface.ts';
import { ROAD_SURFACE_LIVE, roadSurfaceFlagFrom } from '../src/road/roadFlag.ts';
import { ROAD_FC_STEPS, ROAD_FC_VAR_IDS, ROAD_FC_VARS, ROAD_FC_REPO_DIR, roadFcSeriesProblems, roadFcEncode, roadFcDecode, roadFcStamp, roadFcT0 } from '../src/road/roadFc.ts';
import { ROAD_FC_PRECIP_PP, roadFcValue, roadFcHasSurface, roadSurfaceText, roadSurfaceSigmaText, roadSurfaceOriginText, roadSurfaceUiNote, roadFcSurfaceSeries } from '../src/road/roadFcView.ts';
import { ROAD_CLASS_LABEL, FROST_ROAD_MAX_C } from '../src/road/roadClasses.ts';
import { roadStamp } from '../src/road/roadContract.ts';
import {
  readObsArchive, readFcArchive, buildPairs, fitSurfaceTable, scoreSurface, gateOf, predictAll, sunUp, sha256, SURFACE_LEADS_SCORED, SURFACE_MIN_EVENTS,
} from './road/road-surface-backtest.mjs';
import { thinRun, ROAD_FC_ARCHIVE_VARS, ROAD_FC_ARCHIVE_STEPS } from './road/road-fc-archive.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const results = [];
const add = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? `  [${detail}]` : ''}`); };
const near = (a, b, tol) => Number.isFinite(a) && Math.abs(a - b) <= tol;
const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 10, 12, 0);

/** A plausible table by hand: night road 1 K warmer than air, clear sky cools 2 K, wind 0.3 K per m/s, wet −0.5 K; day +3 K and sun +4 K. */
function handTable(over = {}) {
  const hours = Array.from({ length: 24 }, (_, h) => (h >= 8 && h <= 16 ? [3, 4, -0.2, -2] : [1, -2, -0.3, 0.5]));
  return {
    schema: 1, product: 'road-surface-table', model: 'fb1', builtAt: '2026-10-26T10:00:00Z',
    fitted: { from: '2026-10-04', to: '2026-10-25', runs: 150, pairs: 1_000_000, stations: 1200 },
    decay: [1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.2], decayFit: 'lead', tauH: null, hours, means: { cs: 0.3, ff: 2.6, wet: 0.1 },
    sigma: [0, 1.1, 1.4, 1.5, 1.7, 1.7, 1.8], bias: { S1: 12, S2: -8 }, shrinkN: 20, ...over,
  };
}
const stepAt = (h, t, { td = t - 3, n = 70, ff = 2.6, pp = 10 } = {}) => ({ validMs: T0 + h * H, t, td, n, ff, pp });

// --- A: model ----------------------------------------------------------------------------------------------
{
  const tab = handTable();
  const bad = [
    [{ decay: [0.9, 0.8, 0.65, 0.5, 0.4, 0.3, 0.2] }, 'decay'], [{ sigma: [0, -1, 1, 1, 1, 1, 1] }, 'sigma'], [{ bias: { S1: 400 } }, 'bias'], [{ hours: tab.hours.slice(0, 23) }, 'hours'],
    [{ decayFit: 'tau', tauH: null }, 'tauH'], [{ decayFit: 'lead', tauH: 4 }, 'tauH'], [{ model: 'fb2' }, 'Kopf'], [{ means: { cs: 0.3 } }, 'means'],
  ];
  add('A1 Tabellenprüfer: die Handtabelle besteht; jede Verletzung (Gewicht w0 ≠ 1, σ < 0, Versatz > 30 K, 23 Stunden, τ ohne/mit Form, falsches Modell, Mittel unvollständig) wird mit ihrem Namen genannt; parse ⇒ null',
    roadSurfaceTableProblems(tab).length === 0 && !!parseRoadSurfaceTable(tab) && bad.every(([o, word]) => { const p = roadSurfaceTableProblems(handTable(o)); return p.length >= 1 && p.some((x) => x.includes(word)) && parseRoadSurfaceTable(handTable(o)) === null; })
    && roadSurfaceTableProblems(null)[0] === 'kein Objekt', bad.map(([o, w]) => `${w}:${roadSurfaceTableProblems(handTable(o)).length}`).join(' '));
  const night = stepAt(0, 5, { n: 0, ff: 2, pp: 0 }), day = stepAt(0, 10, { n: 100, ff: 0, pp: 90 });
  const dayMs = Date.UTC(2026, 9, 10, 12, 0), nightMs = Date.UTC(2026, 9, 10, 2, 0);
  const cNight = roadSurfaceClim(tab, { ...night, validMs: nightMs }), cDay = roadSurfaceClim(tab, { ...day, validMs: dayMs });
  const cMeans = roadSurfaceClim(tab, { validMs: nightMs, n: null, ff: null, pp: null });
  add('A2 Klimatologie je UTC-Stunde: Nacht klar (cs 1), Wind 2, trocken ⇒ 1 − 2 − 0,6 = −1,6 K; Tag bedeckt (cs 0), still, nass ⇒ 3 − 2 = +1 K; fehlende Werte nehmen die Mittel der Tabelle (cs 0,3, Wind 2,6, Nässe 0,1)',
    near(cNight, -1.6, 1e-9) && near(cDay, 1, 1e-9) && near(cMeans, 1 - 2 * 0.3 - 0.3 * 2.6 + 0.5 * 0.1, 1e-9), `${cNight} ${cDay} ${cMeans}`);
  // Station S1 (bias +1.2 K), measured road 9.0 at t0 with air 5.0 ⇒ anomaly = 9 − 5 − clim(12 UTC, …) − 1.2.
  const steps = Array.from({ length: 7 }, (_, h) => stepAt(h, 5 + h, { n: 50, ff: 1, pp: 0 }));
  const own = roadSurfaceSeries(tab, 'S1', steps, 9.0);
  const clim = roadSurfaceSeries(tab, null, steps, null);
  const climS1 = roadSurfaceSeries(tab, 'S1', steps, null);
  const c12 = roadSurfaceClim(tab, steps[0]);
  const anomaly = 9 - 5 - c12 - 1.2;
  const want = (h) => Math.round((steps[h].t + roadSurfaceClim(tab, steps[h]) + 1.2 + anomaly * tab.decay[h]) * 10) / 10;
  add('A3 Reihe mit eigener Messung: Vorlauf 0 reproduziert die Messung (9,0), jeder Vorlauf = Luft + Klimatologie + Versatz + Anomalie · Gewicht, Herkunft 0 an allen 7 Schritten; Anomalie benannt',
    own.rs[0] === 9 && own.rs.length === ROAD_SURFACE_HORIZON_H + 1 && own.rs.every((v, h) => v === want(h)) && own.rq.every((q) => q === ROAD_SURFACE_ORIGIN.own) && near(own.anomaly, anomaly, 1e-9), own.rs.join(' '));
  add('A4 Reihe ohne Messung (Achspunkt): Luft + Klimatologie, Herkunft 1, keine Anomalie; eine Station ohne Messung behält ihren Versatz; fehlende Luft an einem Schritt ⇒ null dort; fehlende Luft am Schritt 0 ⇒ keine Anomalie trotz Messung',
    clim.rs.every((v, h) => v === Math.round((steps[h].t + roadSurfaceClim(tab, steps[h])) * 10) / 10) && clim.rq.every((q) => q === ROAD_SURFACE_ORIGIN.clim) && clim.anomaly === null
    && climS1.rs.every((v, h) => v === Math.round((steps[h].t + roadSurfaceClim(tab, steps[h]) + 1.2) * 10) / 10)
    && roadSurfaceSeries(tab, 'S1', steps.map((s, h) => (h === 3 ? { ...s, t: null } : s)), 9).rs[3] === null
    && roadSurfaceSeries(tab, 'S1', steps.map((s, h) => (h === 0 ? { ...s, t: null } : s)), 9).anomaly === null && roadSurfaceSeries(tab, 'S1', steps.map((s, h) => (h === 0 ? { ...s, t: null } : s)), 9).rq[1] === ROAD_SURFACE_ORIGIN.clim,
    clim.rs.join(' '));
  const hints = [
    [roadSurfaceHint(0.5, -5, true), ROAD_SURFACE_HINT.frost], [roadSurfaceHint(0.5, 0.8, false), ROAD_SURFACE_HINT.frost], [roadSurfaceHint(0.5, -5, false), ROAD_SURFACE_HINT.none],
    [roadSurfaceHint(1.0, -5, true), ROAD_SURFACE_HINT.frost], [roadSurfaceHint(1.1, -5, true), ROAD_SURFACE_HINT.wet], [roadSurfaceHint(8, 7.9, false), ROAD_SURFACE_HINT.none], [roadSurfaceHint(null, 0, true), null],
  ];
  const labels = Object.values(ROAD_SURFACE_HINT_LABEL).flatMap((l) => [l.label, l.short]);
  add('A5 Hinweis-Klasse (E-FB-4): Frostgefahr bei ≤ +1 °C mit Nässe oder ≤ Taupunkt; Nass bei Nässe über +1 °C; sonst kein Hinweis — nie „trocken", nie ein Eis-Code; Schwelle = FROST_ROAD_MAX_C, Nässe ab ROAD_FC_PRECIP_PP; jedes Etikett trägt „berechnet" oder „(ber.)"',
    hints.every(([got, want]) => got === want) && ROAD_SURFACE_COLD_C === FROST_ROAD_MAX_C && ROAD_SURFACE_WET_PP === ROAD_FC_PRECIP_PP && roadSurfaceWet(50) && !roadSurfaceWet(49) && !roadSurfaceWet(null)
    && labels.every((l) => /berechnet|\(ber\.\)/.test(l)) && !labels.some((l) => /trocken|gemessen/i.test(l)) && roadSurfaceHintOf(2) === 'frost' && roadSurfaceHintOf(3) === null && roadSurfaceHintOf(null) === null,
    hints.map(([g]) => g).join(' '));
  add('A6 Kälte-Wahrscheinlichkeit: Φ(0) = 0,5 an der Schwelle, Φ(±3) ≈ 0,9987 / 0,0013, σ-Boden 0,05 (σ = 0 ergibt eine Stufe, keine NaN)',
    near(roadSurfaceColdProb(1, 1.5), 0.5, 1e-6) && near(normalCdf(3), 0.99865, 2e-5) && near(normalCdf(-3), 0.00135, 2e-5) && roadSurfaceColdProb(0.9, 0) > 0.97 && roadSurfaceColdProb(1.1, 0) < 0.03);
  add('A7 Schalter: Vorgabe AN seit E-FB-10 (Jan 26.10., ROAD_SURFACE_LIVE = true); ?rsfc=1 schlägt localStorage 0; ?rsfc=0 schlägt localStorage 1 schlägt Vorgabe; kaputte Query = keine Stimme',
    ROAD_SURFACE_LIVE === true && roadSurfaceFlagFrom('', null) === true && roadSurfaceFlagFrom('', null, false) === false && roadSurfaceFlagFrom('?rsfc=1', '0') === true && roadSurfaceFlagFrom('?rsfc=0', '1') === false && roadSurfaceFlagFrom('?x=1', '0') === false && roadSurfaceFlagFrom('?x=1', null, false) === false);
}

// --- B: contract ---------------------------------------------------------------------------------------------
{
  const good = () => Object.fromEntries(ROAD_FC_VAR_IDS.map((v) => [v, new Array(ROAD_FC_STEPS).fill(ROAD_FC_VARS[v].unit === 'code' ? 0 : 5)]));
  const withSurface = () => { const g = good(); for (const k of ['rs', 'rk', 'rq']) g[k] = new Array(ROAD_FC_STEPS).fill(null); g.rs[0] = roadFcEncode('rs', -3.2); g.rk[0] = 2; g.rq[0] = 0; g.rs[6] = 123; g.rk[6] = 1; g.rq[6] = 1; return g; };
  const without = () => { const g = good(); delete g.rs; delete g.rk; delete g.rq; return g; };
  const mut = (f) => { const g = withSurface(); f(g); return roadFcSeriesProblems(g); };
  add('B1 Wertschloss: rs/rk/rq sind optional (fehlend = kein Befund, vorhanden = geprüft): Reihe mit Werten 0 … 6 und null danach besteht; rk 3, rq 2, rs 71 °C, Kommazahl je ein Befund; Kodierung 0,1 °C',
    roadFcSeriesProblems(withSurface()).length === 0 && roadFcSeriesProblems(without()).length === 0 && mut((g) => { g.rk[2] = 3; }).length === 1 && mut((g) => { g.rq[2] = 2; }).length === 1
    && mut((g) => { g.rs[2] = 710; }).length === 1 && mut((g) => { g.rs[2] = 1.5; }).length === 1 && roadFcEncode('rs', 1.26) === 13 && roadFcDecode('rs', -32) === -3.2
    && ['rs', 'rk', 'rq'].every((k) => ROAD_FC_VARS[k].optional === true));
}

// --- C: fit and backtest on a synthetic archive ----------------------------------------------------------------
const tmp = mkdtempSync(join(tmpdir(), 'verify-road-surface-'));
{
  // Deterministic RNG.
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = () => { const u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const DAYS = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'];
  const originMs = Date.parse(`${DAYS[0]}T00:00:00Z`);
  const HOURS = DAYS.length * 24 + 1;
  const N_ST = 40, RHO = 0.6;
  const TRUE = { a0: (h) => 1.5 + 2.5 * Math.cos(2 * Math.PI * (h - 13) / 24), a1: (h) => (h >= 8 && h <= 16 ? 4 : -3), a2: -0.3, a3: -1.5 };
  const stations = Array.from({ length: N_ST }, (_, i) => ({ id: `S${String(i).padStart(3, '0')}`, lat: 50 + i * 0.05, lon: 10 + (i % 5) * 0.1, bias: Math.round((rnd() * 4 - 2) * 10) / 10 }));
  stations.push({ id: 'BROKEN', lat: 51, lon: 9, bias: 50 });   // the E774 of the fixture
  // Weather: air per hour (cold enough for events), shared; clear sky, wind and wet per STATION and hour (clouds differ
  // across the country — and a regression per hour of day needs distinct predictor rows, not one row replicated 24 ×).
  const wx = Array.from({ length: HOURS }, (_, k) => { const hod = k % 24; return { t: 1.5 + 4 * Math.sin(2 * Math.PI * (hod - 9) / 24) + 2 * Math.sin(k / 37) }; });
  const sw = stations.map(() => Array.from({ length: HOURS }, () => ({ cs: rnd(), ff: rnd() * 6, wet: rnd() < 0.25 ? 1 : 0 })));
  const climTrue = (si, k) => { const w = sw[si][k], h = k % 24; return TRUE.a0(h) + TRUE.a1(h) * w.cs + TRUE.a2 * w.ff + TRUE.a3 * w.wet; };
  // Per station an AR(1) anomaly and the truth.
  const truth = stations.map((s, si) => { const rs = new Float64Array(HOURS), ta = new Float64Array(HOURS); let e = 0; for (let k = 0; k < HOURS; k++) { e = RHO * e + 1.2 * gauss(); ta[k] = wx[k].t + 0.2 * gauss(); rs[k] = wx[k].t + climTrue(si, k) + s.bias + e + 0.1 * gauss(); } return { rs, ta }; });
  // Obs half days in the archive's form (15-min slots; only full hours carry values).
  const obsDir = join(tmp, 'archiv', 'road', 'v1'), fcDir = join(tmp, 'archiv', 'road', 'fc', 'v1');
  for (const d of DAYS) for (const half of ['00', '12']) {
    const startMs = Date.parse(`${d}T${half}:00:00Z`);
    const slots = Array.from({ length: 48 }, (_, i) => roadStamp(startMs + i * 900_000));
    const st = {};
    stations.forEach((s, si) => {
      const rs = [], ta = [], td = []; let k = '';
      for (let i = 0; i < 48; i++) {
        const idx = Math.round((startMs + i * 900_000 - originMs) / H);
        if (i % 4 !== 0 || idx >= HOURS) { rs.push(null); ta.push(null); td.push(null); k += '-'; continue; }
        const r = Math.round(truth[si].rs[idx] * 10) / 10, a = Math.round(truth[si].ta[idx] * 10) / 10;
        rs.push(r); ta.push(a); td.push(Math.round((a - 2) * 10) / 10); k += r <= 1 ? 'f' : 'd';
      }
      st[s.id] = { g: 'XX', n: s.id, lat: s.lat, lon: s.lon, h: 300, road: 'A1', kind: 'A', dir: null, km: si, rs, ta, td, k };
    });
    mkdirSync(join(obsDir, d), { recursive: true });
    writeFileSync(join(obsDir, d, `${half}.json.gz`), gzipSync(JSON.stringify({ schema: 1, product: 'road-archive-half', day: d, half, from: slots[0], to: slots[47], slots, source: 'fixture', rings: [], windows: [], stations: st, quarantine: [] })));
  }
  // Forecast runs every 3 h, lead 0 … 24: air = truth air + model error; clouds/wind/pp from the weather.
  let nRuns = 0;
  for (const d of DAYS) for (const hh of [0, 3, 6, 9, 12, 15, 18, 21]) {
    const issued = Date.parse(`${d}T${String(hh).padStart(2, '0')}:04:00Z`), t0Ms = roadFcT0(issued), k0 = Math.round((t0Ms - originMs) / H);
    const run = roadFcStamp(issued), sts = {};
    const err = 0.15 * gauss();
    stations.forEach((s, si) => {
      const v = Object.fromEntries(['t', 'ts', 'td', 'pp', 'rr', 'sn', 'ff', 'fx', 'n', 'q'].map((x) => [x, new Array(25).fill(null)]));
      for (let h = 0; h <= 24; h++) {
        const k = k0 + h; if (k >= HOURS) break;
        const w = sw[si][k];
        v.t[h] = roadFcEncode('t', wx[k].t + err + 0.2 * gauss()); v.ts[h] = 9; v.td[h] = roadFcEncode('td', wx[k].t - 2); v.pp[h] = w.wet ? 80 : 10; v.rr[h] = w.wet ? 50 : 0; v.sn[h] = 0;
        v.ff[h] = roadFcEncode('ff', w.ff); v.fx[h] = roadFcEncode('fx', w.ff * 1.5); v.n[h] = Math.round(100 * (1 - w.cs)); v.q[h] = 0;
      }
      sts[s.id] = { lat: s.lat, lon: s.lon, h: 300, mos: null, at: null, v };
    });
    mkdirSync(join(fcDir, d), { recursive: true });
    writeFileSync(join(fcDir, d, `${run}.json.gz`), gzipSync(JSON.stringify({ schema: 1, product: 'road-fc-archive', run, issuedAt: new Date(issued).toISOString(), t0Ms, steps: 25, vars: ['t', 'ts', 'td', 'pp', 'rr', 'sn', 'ff', 'fx', 'n', 'q'], engine: { name: 'buscosun Fusion 13' }, source: 'fixture', stations: sts })));
    nRuns++;
  }
  const obs = readObsArchive(obsDir);
  const runs = readFcArchive(fcDir);
  const P = buildPairs(obs, runs);
  const expectPairs = runs.reduce((n, r) => { const k0 = Math.round((r.t0Ms - originMs) / H); return n + stations.length * Math.min(7, HOURS - 1 - k0); }, 0);
  add('C1 Leser: Halbtage ⇒ Vollstunden je Station (rs/ta/td, Klasse), Läufe sortiert; Paare = Läufe × Stationen × 7 Vorläufe (minus Rand), Tagesstunde und Tag/Nacht gesetzt',
    obs.stations.size === stations.length && obs.hours === HOURS && runs.length === nRuns && runs.every((r, i) => i === 0 || r.t0Ms >= runs[i - 1].t0Ms) && P.n === expectPairs && P.stations.length === stations.length
    && [...P.hod].every((h) => h < 24) && [...P.lead].every((l) => l <= 6) && sunUp(Date.UTC(2026, 9, 10, 12), 50, 10) && !sunUp(Date.UTC(2026, 9, 10, 0), 50, 10), `${P.n} Paare, ${runs.length} Läufe`);
  const splitMs = Date.parse('2026-10-06T00:00:00Z');
  const train = (i) => P.runs[P.runIdx[i]].t0Ms < splitMs, test = (i) => !train(i);
  const fitL = fitSurfaceTable(P, { mask: train, builtAt: '2026-10-26T10:00:00Z', decayFit: 'lead' });
  const fitT = fitSurfaceTable(P, { mask: train, builtAt: '2026-10-26T10:00:00Z', decayFit: 'tau' });
  const tab = fitL.table;
  // a0 and the station biases are identifiable only up to their mean (the regression absorbs it); the anomaly weights are
  // attenuated by the noise in the predictor (ρ · var(e) / (var(e) + var(noise)) ≈ 0.7 here), so they are checked for
  // shape (w1 in 0,6 … 0,9, w3 ≈ w1³, falling) rather than against ρ^h.
  const meanBias = stations.slice(0, N_ST).reduce((s, x) => s + x.bias, 0) / N_ST;
  // Noise-level tolerances (≈ 640 samples per hour with ≈ 1,6 K noise); the EXACT recovery is C2b below.
  // The AR anomaly (σ ≈ 1,5 K, shared across the leads of a run) is the noise here: ≈ 40 independent runs per station
  // ⇒ a bias σ of ≈ 0,25 K; the worst of 40 stations and 24 hours is a 3-σ draw. Tolerances follow; the structure is C2b.
  const a0ok = tab.hours.every((r, h) => near(r[0], TRUE.a0(h) + meanBias, 0.8)), a1ok = tab.hours.every((r, h) => near(r[1], TRUE.a1(h), 1.2)), a2ok = tab.hours.every((r) => near(r[2], TRUE.a2, 0.15)), a3ok = tab.hours.every((r) => near(r[3], TRUE.a3, 0.7));
  const biasOk = stations.slice(0, N_ST).every((s) => near(tab.bias[s.id] / 10, s.bias - meanBias, 1.0));
  const w = tab.decay;
  const decayOk = w[1] >= 0.4 && w[1] <= 0.75 && near(w[3], w[1] ** 3, 0.12) && w.every((x, h) => h === 0 || x <= w[h - 1] + 0.03);
  add('C2 Fit (Form steht fest, alles gefittet): Klimatologie je Stunde innerhalb 0,8 K (a0 + mittlerer Versatz), Klarhimmel 1,2, Wind 0,15 K je m/s, Nässe 0,7; Gewichte fallen (w1 0,4 … 0,75 bei ρ 0,6 und Messrauschen, w3 ≈ w1³); Versatz je Station (relativ zum Mittel) innerhalb 1,0 K (AR-Rauschen, s. Kommentar); τ-Form wählt ein τ aus dem Gitter mit Gewichten e^(−h/τ); Tabelle besteht ihren Prüfer',
    a0ok && a1ok && a2ok && a3ok && decayOk && biasOk && tab.decayFit === 'lead' && tab.tauH === null
    && fitT.table.decayFit === 'tau' && fitT.table.tauH > 0 && fitT.tauScan.length === 9 && fitT.table.decay.every((w, h) => near(w, Math.exp(-h / fitT.table.tauH), 0.001)) && roadSurfaceTableProblems(tab).length === 0 && roadSurfaceTableProblems(fitT.table).length === 0,
    `a0 ${a0ok} a1 ${a1ok} (max ${Math.max(...tab.hours.map((r, h) => Math.abs(r[1] - TRUE.a1(h)))).toFixed(2)}) a2 ${a2ok} a3 ${a3ok} w ${decayOk} bias ${biasOk} (max ${Math.max(...stations.slice(0, N_ST).map((s) => Math.abs((tab.bias[s.id] ?? NaN) / 10 - (s.bias - meanBias)))).toFixed(2)}) · w ${tab.decay.join('/')} · τ ${fitT.table.tauH} h · a0(03) ${tab.hours[3][0]} (wahr ${(TRUE.a0(3) + meanBias).toFixed(2)}, Mittelversatz ${meanBias.toFixed(2)}) · a1(12) ${tab.hours[12][1]} · a2 ${tab.hours[5][2]} a3 ${tab.hours[5][3]} · größte a0-Abweichung ${Math.max(...tab.hours.map((r, h) => Math.abs(r[0] - TRUE.a0(h) - meanBias))).toFixed(2)}`);
  // C2b: an EXACT linear truth in memory (no anomaly, no noise, three stations with biases) — the alternating fit must
  // return the coefficients to 0,05 K (a0 carries the mean bias), the biases relative to their mean after shrinkage.
  {
    const HRS = 24 * 6 + 1, org = Date.UTC(2026, 9, 1);
    const w2 = Array.from({ length: HRS }, () => ({ t: 5 + 6 * rnd() }));
    const bias2 = [1, -1, 0.5];
    const sw2 = bias2.map(() => Array.from({ length: HRS }, () => ({ cs: rnd(), ff: 5 * rnd(), wet: rnd() < 0.3 ? 1 : 0 })));
    const clim2 = (si, k) => { const w = sw2[si][k], h = k % 24; return (h >= 8 && h <= 16 ? 3 : 1) + (h >= 8 && h <= 16 ? 3 : -2) * w.cs - 0.3 * w.ff - 1 * w.wet; };
    const st2 = new Map(bias2.map((b, i) => { const rs = new Float32Array(HRS), ta = new Float32Array(HRS); for (let k = 0; k < HRS; k++) { ta[k] = w2[k].t; rs[k] = w2[k].t + clim2(i, k) + b; } return [`X${i}`, { id: `X${i}`, lat: 50, lon: 10, rs, ta, td: new Float32Array(HRS), cold: new Uint8Array(HRS) }]; }));
    const runs2 = [];
    for (let k0 = 0; k0 + 6 < HRS; k0 += 3) {
      const sts = {};
      [...st2.keys()].forEach((id, si) => { const v = { t: [], td: [], n: [], ff: [], pp: [] }; for (let h = 0; h <= 24; h++) { const k = k0 + h; if (k >= HRS) { v.t.push(null); v.td.push(null); v.n.push(null); v.ff.push(null); v.pp.push(null); continue; } const w = sw2[si][k]; v.t.push(Math.round(w2[k].t * 10)); v.td.push(Math.round((w2[k].t - 2) * 10)); v.n.push(Math.round(100 * (1 - w.cs))); v.ff.push(Math.round(w.ff * 10)); v.pp.push(w.wet ? 80 : 10); } sts[id] = { lat: 50, lon: 10, v }; });
      runs2.push({ run: String(k0), t0Ms: org + k0 * H, stations: sts });
    }
    const P2 = buildPairs({ originMs: org, hours: HRS, stations: st2 }, runs2);
    // Without shrinkage (shrinkN 0) the alternating fit must be EXACT up to the 0,1-°C coding of the fixture.
    const f2 = fitSurfaceTable(P2, { builtAt: '2026-10-26T00:00:00Z', decayFit: 'lead', shrinkN: 0 });
    const mb = bias2.reduce((a, b) => a + b, 0) / 3;
    const nPer = P2.n / 3;
    // Alternating least squares converges geometrically; after SURFACE_FIT_PASSES (8) the exact probe is within 0,08 K (3 passes: 0,12; 1 pass: up to 20 K).
    const exact = f2.table.hours.every((r, h) => near(r[0], (h >= 8 && h <= 16 ? 3 : 1) + mb, 0.08) && near(r[1], h >= 8 && h <= 16 ? 3 : -2, 0.08) && near(r[2], -0.3, 0.02) && near(r[3], -1, 0.08))
      && bias2.every((b, i) => near(f2.table.bias[`X${i}`] / 10, b - mb, 0.08)) && f2.table.sigma.slice(1).every((x) => x < 0.1);
    add('C2b exakte Wahrheit ohne Rauschen (3 Stationen mit Versatz, lineare Klimatologie, ohne Schrumpfung): die wechselnde Anpassung trifft jede Stundenzeile bis 0,08 K (a0 trägt den mittleren Versatz), die Versätze relativ zum Mittel bis 0,08 K, σ < 0,1 K — ohne das Wechseln (eine Regression, dann der Versatz) lagen die Koeffizienten um bis zu 20 K daneben',
      exact, `max |Δa0| ${Math.max(...f2.table.hours.map((r, h) => Math.abs(r[0] - (h >= 8 && h <= 16 ? 3 : 1) - mb))).toFixed(3)} |Δa1| ${Math.max(...f2.table.hours.map((r, h) => Math.abs(r[1] - (h >= 8 && h <= 16 ? 3 : -2)))).toFixed(3)} |Δa2| ${Math.max(...f2.table.hours.map((r) => Math.abs(r[2] + 0.3))).toFixed(3)} |Δa3| ${Math.max(...f2.table.hours.map((r) => Math.abs(r[3] + 1))).toFixed(3)} · bias ${JSON.stringify(f2.table.bias)} (nPer ${nPer}) · σ ${f2.table.sigma.join('/')}`);
  }
  add('C3 A1: der Fühler mit +50 K bleibt aus dem Fit (Paare gezählt), bekommt keinen Versatz und bläht σ nicht (σ(1 h) < 1,5 K); sein Mittel ist im Prüfbereich',
    fitL.clipped > 0 && tab.bias.BROKEN === undefined && tab.sigma[1] < 1.5 && tab.sigma[0] === 0, `${fitL.clipped} Paare aus dem Fit, σ ${tab.sigma.join('/')}`);
  const score = scoreSurface(P, tab, { mask: test, bootN: 200 });
  const gate = gateOf(score);
  const b = score.byLead;
  const maeOk = SURFACE_LEADS_SCORED.every((h) => b[h].M.mae < b[h].P.mae && b[h].M.mae < b[h].A.mae && b[h].M.mae < b[h].PA.mae);
  const ciOk = SURFACE_LEADS_SCORED.every((h) => score.boot[h].P.hi < 0 && score.boot[h].A.hi < 0 && score.boot[h].PA.hi < 0);
  const evOk = SURFACE_LEADS_SCORED.every((h) => b[h].events >= SURFACE_MIN_EVENTS);
  const bsOk = SURFACE_LEADS_SCORED.every((h) => b[h].M.brier < b[h].P.brier && b[h].M.brier < b[h].A.brier);
  const rateOk = [1, 3, 6].every((h) => b[h].M.hitRate >= 0 && b[h].M.hitRate <= 1 && !(b[h].M.far < 0 || b[h].M.far > 1));
  add('C4 Bewertung (Fenster ab 06.10.): FB-1 schlägt Persistenz, Luft-Proxy und Plan-Differenz bei 1/3/6 h; Bootstrap über Läufe schließt 0 aus; Gate D-T GRÜN; Ereignis ≤ +1 °C messbar (≥ 100 je Vorlauf), Brier M < P und A ⇒ Gate D-K GRÜN; Treffer-/Fehlalarmquoten zwischen 0 und 1',
    maeOk && ciOk && evOk && bsOk && gate.temperature.verdict === 'GRÜN' && gate.cold.verdict === 'GRÜN' && rateOk,
    `MAE ${maeOk} KI ${ciOk} (${SURFACE_LEADS_SCORED.map((h) => `+${h}: P ${score.boot[h].P.hi.toFixed(2)} A ${score.boot[h].A.hi.toFixed(2)} PA ${score.boot[h].PA.hi.toFixed(2)}`).join(' · ')}) Ereignisse ${evOk} Brier ${bsOk} Quoten ${rateOk} · Bias M +1 h ${b[1].M.bias.toFixed(2)} · D-T ${gate.temperature.verdict} D-K ${gate.cold.verdict} · +1 h M ${b[1].M.mae.toFixed(2)} P ${b[1].P.mae.toFixed(2)} A ${b[1].A.mae.toFixed(2)} PA ${b[1].PA.mae.toFixed(2)} · +6 h M ${b[6].M.mae.toFixed(2)} P ${b[6].P.mae.toFixed(2)} PA ${b[6].PA.mae.toFixed(2)} · Brier +3 h M ${b[3].M.brier.toFixed(3)} P ${b[3].P.brier.toFixed(3)} A ${b[3].A.brier.toFixed(3)} · Ereignisse ${b[1].events}`);
  // Negative controls.
  const zero = { ...tab, hours: tab.hours.map(() => [0, 0, 0, 0]), bias: {}, decay: [1, 0, 0, 0, 0, 0, 0] };
  const zScore = scoreSurface(P, zero, { mask: test, bootN: 50 });
  const i0 = [...Array(P.n).keys()].find((i) => test(i) && P.lead[i] === 3);
  const pr = predictAll(P, zero, i0);
  const zGate = gateOf(zScore);
  const few = gateOf(scoreSurface(P, tab, { mask: (i) => test(i) && P.runIdx[i] === P.runs.length - 1, bootN: 20 }));
  add('C5 Gegenproben: die Nulltabelle (keine Klimatologie, Gewicht 0) IST der Luft-Proxy (M = A je Paar, MAE gleich) ⇒ D-T ROT; ein Fenster mit einem Lauf hat zu wenige Ereignisse ⇒ D-K NICHT MESSBAR, nicht rot',
    pr.M === pr.A && near(zScore.byLead[3].M.mae, zScore.byLead[3].A.mae, 1e-9) && zGate.temperature.verdict === 'ROT' && few.cold.verdict === 'NICHT MESSBAR',
    `${zGate.temperature.verdict} / ${few.cold.verdict}`);
  const rule = join(ROOT, 'audit', 'autobahn-fahrbahn', 'backtest-regel.md');
  const auditDoc = existsSync(join(ROOT, 'audit', 'autobahn-fahrbahn.md')) ? readFileSync(join(ROOT, 'audit', 'autobahn-fahrbahn.md'), 'utf8') : '';
  const hash = existsSync(rule) ? sha256(readFileSync(rule)) : null;
  add('C6 Messregel liegt eingefroren vor und ihr SHA-256 steht im Phasendokument (Änderung A1 benannt)', !!hash && auditDoc.includes(hash) && readFileSync(rule, 'utf8').includes('Änderung A1'), hash?.slice(0, 12));
}

// --- D: producer plumbing (no cube) ------------------------------------------------------------------------------
{
  const { applySurface, readSurfaceTable, surfaceEngineOf, swisTable } = await import('./road/road-forecast.mjs');
  const tab = handTable();
  const v = Object.fromEntries(ROAD_FC_VAR_IDS.filter((k) => !['rs', 'rk', 'rq'].includes(k)).map((k) => [k, new Array(ROAD_FC_STEPS).fill(null)]));
  for (let i = 0; i < ROAD_FC_STEPS; i++) { v.t[i] = roadFcEncode('t', 4 + i * 0.1); v.td[i] = roadFcEncode('td', 1); v.n[i] = 50; v.ff[i] = 10; v.pp[i] = i === 2 ? 90 : 5; v.q[i] = 0; }
  const own = applySurface(v, T0, 'S1', 6.5, tab);
  const steps = Array.from({ length: 7 }, (_, h) => ({ validMs: T0 + h * H, t: roadFcDecode('t', v.t[h]), td: 1, n: 50, ff: 1, pp: h === 2 ? 90 : 5 }));
  const direct = roadSurfaceSeries(tab, 'S1', steps, 6.5);
  const v2 = JSON.parse(JSON.stringify(v));
  const clim = applySurface(v2, T0, null, null, tab);
  add('D1 applySurface: Reihen rs/rk/rq über 49 Schritte, 0 … 6 belegt (= direkte Rechnung, 0,1 °C kodiert), danach null; Herkunft eigene Messung / Klimatologie; Nässe-Stunde (pp 90) trägt den Hinweis; das Wertschloss nimmt die Reihe an',
    own === 'own' && clim === 'clim' && v.rs.length === ROAD_FC_STEPS && [0, 1, 2, 3, 4, 5, 6].every((h) => v.rs[h] === roadFcEncode('rs', direct.rs[h]) && v.rk[h] === direct.rk[h] && v.rq[h] === 0) && v.rs.slice(7).every((x) => x === null) && v.rk.slice(7).every((x) => x === null)
    && v2.rq.slice(0, 7).every((q) => q === 1) && v.rk[2] !== ROAD_SURFACE_HINT.none && roadFcSeriesProblems(v).length === 0 && roadFcSeriesProblems(v2).length === 0, `rs ${v.rs.slice(0, 7).join('/')} rk ${v.rk.slice(0, 7).join('')}`);
  const data = join(tmp, 'data-surface');
  mkdirSync(join(data, ROAD_FC_REPO_DIR, 'static'), { recursive: true });
  const none = readSurfaceTable(data);
  writeFileSync(join(data, ROAD_FC_REPO_DIR, ROAD_SURFACE_TABLE_PATH), '{ nicht json');
  const broken = readSurfaceTable(data);
  writeFileSync(join(data, ROAD_FC_REPO_DIR, ROAD_SURFACE_TABLE_PATH), JSON.stringify(handTable({ decay: [0.5, 0, 0, 0, 0, 0, 0] })));
  const invalid = readSurfaceTable(data);
  writeFileSync(join(data, ROAD_FC_REPO_DIR, ROAD_SURFACE_TABLE_PATH), JSON.stringify(tab));
  const good = readSurfaceTable(data);
  process.env.ROAD_SURFACE = '0';
  const off = readSurfaceTable(data);
  delete process.env.ROAD_SURFACE;
  add('D2 readSurfaceTable: fehlend / unlesbar / ungültig / Schalter ROAD_SURFACE=0 ⇒ keine Tabelle mit benanntem Grund; gültig ⇒ Tabelle + sha12',
    none.table === null && /fehlt/.test(none.reason) && broken.table === null && /nicht lesbar/.test(broken.reason) && invalid.table === null && /ungültig.*decay/.test(invalid.reason)
    && good.table && good.hash?.length === 12 && good.reason === null && off.table === null && /ROAD_SURFACE=0/.test(off.reason), `${none.reason} · ${invalid.reason}`);
  const eng = surfaceEngineOf([{ surface: { own: 2, clim: 3, hash: 'abc', reason: null, fitted: tab.fitted, decay: tab.decay, sigma: tab.sigma } }, { surface: { own: 1, clim: 0, hash: 'abc', reason: null, fitted: tab.fitted, decay: tab.decay, sigma: tab.sigma } }]);
  const engNone = surfaceEngineOf([{ surface: { own: 0, clim: 0, hash: null, reason: 'surface.json fehlt im Daten-Repo' } }]);
  add('D3 Kopfblock engine.surface: Scherben summiert (3 eigene, 3 Klimatologie), Tabelle, Fenster, Gewichte, σ; ohne Tabelle mode none mit Grund',
    eng.mode === 'fb1' && eng.own === 3 && eng.clim === 3 && eng.table === 'abc' && eng.decay === tab.decay && eng.sigma === tab.sigma && engNone.mode === 'none' && /fehlt/.test(engNone.reason));
  const rows = [{ id: 'S1', n: 'Eins', lat: 50, lon: 10, t: T0, ta: 4, td: 1, rs: 6.5 }, { id: 'S2', n: 'Zwei', lat: 50.1, lon: 10, t: T0, ta: 4, td: 1 }];
  const table = swisTable(rows, { S1: { lat: 50, lon: 10, h: 300 }, S2: { lat: 50.1, lon: 10, h: 300 } }, [{ id: 'S1', kind: 'station', lat: 50, lon: 10 }, { id: 'S2', kind: 'station', lat: 50.1, lon: 10 }]);
  add('D4 Messtabelle des Producers trägt die Fahrbahn der Anlage (rs), fehlend ⇒ null', table.get('S1').rs === 6.5 && table.get('S2').rs === null);
}

// --- E: archive thinning ------------------------------------------------------------------------------------------
{
  const mk = (id, withSurface) => {
    const v = Object.fromEntries(ROAD_FC_VAR_IDS.filter((k) => withSurface || !['rs', 'rk', 'rq'].includes(k)).map((k) => [k, new Array(ROAD_FC_STEPS).fill(ROAD_FC_VARS[k].unit === 'code' ? 0 : 5)]));
    return { id, kind: 'station', km: null, lat: 50, lon: 10, h: 300, mos: null, v };
  };
  const file = (pts) => ({ schema: 1, product: 'road-fc', run: '2610261204', issuedAt: 'x', t0Ms: roadFcT0(T0), steps: ROAD_FC_STEPS, kind: 'state', id: 'BY', engine: { name: 'buscosun Fusion 13', surface: { mode: 'fb1' } }, source: '', points: pts });
  const thin = thinRun([file([mk('S1', true), mk('S2', false), { ...mk('A', true), id: 'a1@0', kind: 'axis' }])]);
  add('E1 Archiv (E-FB-8): rs/rk/rq werden mitgenommen (25 Schritte), ein Punkt ohne die Reihen bleibt lesbar und trägt sie nicht; Achspunkte bleiben draußen; der Kopf trägt engine.surface',
    ROAD_FC_ARCHIVE_VARS.includes('rs') && ROAD_FC_ARCHIVE_VARS.includes('rk') && ROAD_FC_ARCHIVE_VARS.includes('rq') && thin.stations.S1.v.rs?.length === ROAD_FC_ARCHIVE_STEPS && thin.stations.S1.v.rk?.length === ROAD_FC_ARCHIVE_STEPS
    && thin.stations.S2.v.rs === undefined && thin.stations.S2.v.t.length === ROAD_FC_ARCHIVE_STEPS && !thin.stations['a1@0'] && thin.engine.surface.mode === 'fb1');
}

// --- F: view model --------------------------------------------------------------------------------------------------
{
  const v = Object.fromEntries(ROAD_FC_VAR_IDS.map((k) => [k, new Array(ROAD_FC_STEPS).fill(null)]));
  for (let i = 0; i < ROAD_FC_STEPS; i++) { v.t[i] = 32; v.td[i] = 10; v.pp[i] = 60; v.n[i] = 50; v.ff[i] = 20; v.q[i] = 0; }
  v.rs[1] = -5; v.rk[1] = 2; v.rq[1] = 0; v.rs[3] = 25; v.rk[3] = 1; v.rq[3] = 1;
  const p = { id: 'S1', kind: 'station', km: null, lat: 50, lon: 10, h: 300, mos: null, v };
  const run = { t0Ms: roadFcT0(T0), steps: ROAD_FC_STEPS };
  const tab = handTable();
  const file = { engine: { name: 'buscosun Fusion 13', stage: 'fs', anchor: 'none', hourMean: true, runs: {}, tables: {}, surface: { mode: 'fb1', table: 'abc', fitted: tab.fitted, decay: tab.decay, sigma: tab.sigma, own: 1, clim: 2 } } };
  const v1 = roadFcValue(p, run, T0 + H), v3 = roadFcValue(p, run, T0 + 3 * H), v6 = roadFcValue(p, run, T0 + 6 * H);
  const noSurf = { ...p, v: { ...v, rs: undefined, rk: undefined, rq: undefined } };
  const v1n = roadFcValue(noSurf, run, T0 + H);
  // A class word („Frostgefahr", „Nass") may appear in a surface text only as „… (ber.)"; the measured labels („Glätte gemessen", „Trocken", „Keine gültige Messung") never.
  const classWord = /Frostgefahr|Nass|Glätte|Trocken|gemessen/g;
  const honest = (t) => [...t.matchAll(classWord)].every((m) => /^(?:Frostgefahr|Nass) \(ber\.\)/.test(t.slice(m.index)));
  const roadWords = { test: (t) => !honest(t) || /gemessen|Trocken|Glätte/.test(t) };
  const texts = [roadSurfaceText(v1), roadSurfaceText(v3), roadSurfaceUiNote(file), roadSurfaceOriginText(v1), roadSurfaceOriginText(v3), roadSurfaceSigmaText(file, 3)];
  add('F1 Wert: rs/rk/rq werden gelesen (−0,5 °C Frostgefahr aus eigener Messung; +2,5 °C Nass aus Klimatologie; +6 h ohne Wert ⇒ null); ein Lauf ohne die Reihen ⇒ null ohne Fehler',
    v1.rs === -0.5 && v1.rk === 'frost' && v1.rq === 'own' && v3.rs === 2.5 && v3.rk === 'wet' && v3.rq === 'clim' && v6.rs === null && v6.rk === null && v6.rq === null && v1n.rs === null && v1n.rk === null && v1n.rq === null);
  add('F2 Texte: jede Fahrbahn-Zeile sagt „berechnet", Hinweis als (ber.), σ der Tabelle je Vorlauf („typisch ± 1,5 K" bei +3 h), Herkunft benannt, Hinweis-Satz nennt das Fenster der Tabelle und „Keine Messung"; kein Etikett einer gemessenen Klasse in keinem Text; Lauf ohne Fahrbahn ⇒ hasSurface false, σ-Text leer, Text null',
    texts[0] === `Fahrbahn −0,5 °C · ${ROAD_SURFACE_WORD} · Frostgefahr (ber.)` && texts[1] === `Fahrbahn +2,5 °C · ${ROAD_SURFACE_WORD} · Nass (ber.)` && texts[5] === 'typisch ± 1,5 K' && /2026-10-04 … 2026-10-25/.test(texts[2]) && /Keine Messung/.test(texts[2]) && /dieser Anlage/.test(texts[3]) && /ohne Messung/.test(texts[4])
    && texts.every((t) => !roadWords.test(t)) && roadFcHasSurface(file) && !roadFcHasSurface({ engine: { ...file.engine, surface: { mode: 'none', reason: 'x' } } }) && !roadFcHasSurface(null) && roadSurfaceSigmaText(null, 3) === '' && roadSurfaceText(v6) === null,
    texts[0]);
  const series = roadFcSurfaceSeries(p, run, T0, 0, 6);
  add('F3 Verlaufsreihe der Fahrbahn: nur Stunden mit Wert, [Stunden ab Bezug, °C]; ohne Reihe leer', series.length === 2 && series[0][0] === 1 && series[0][1] === -0.5 && series[1][0] === 3 && roadFcSurfaceSeries(noSurf, run, T0, 0, 6).length === 0);
  // The page's wording constants: the readout imports ROAD_SURFACE_WORD; nothing in src/road says "Fahrbahnprognose" without it.
  const src = readFileSync(join(ROOT, 'src', 'road', 'RoadReadout.tsx'), 'utf8');
  add('F4 Readout: Kacheln, Raster, Verlauf, Ankunftsspalte und Quellenzeile hängen an showSurface (Lauf trägt die Fahrbahn UND Schalter an); die alten Sätze „folgt erst nach dem Backtest" leben nur noch im Ausweichtext',
    (src.match(/showSurface\(p\)/g) ?? []).length >= 8 && (src.match(/folgt erst nach dem Backtest/g) ?? []).length <= 2 && !/Eine Prognose der Fahrbahn folgt erst nach dem Backtest\.<\/p>/.test(src) && /surfaceSourceRow\(file, surface\)/.test(src) && /ROAD_SURFACE_WORD/.test(src));
}

// --- G: the real archive (optional) ---------------------------------------------------------------------------------
if (args.archive) {
  const obs = readObsArchive(join(args.archive, 'road', 'v1'));
  const runs = readFcArchive(join(args.archive, 'road', 'fc', 'v1'));
  const P = buildPairs(obs, runs);
  const fit = fitSurfaceTable(P, { builtAt: new Date().toISOString(), decayFit: 'lead' });
  add('G1 echtes Archiv: Paare > 100 000, Fit besteht seinen Prüfer, Gewichte fallen monoton, σ(1 h) < σ(6 h)',
    P.n > 100_000 && roadSurfaceTableProblems(fit.table).length === 0 && fit.table.decay.every((w, h) => h === 0 || w <= fit.table.decay[h - 1] + 1e-9) && fit.table.sigma[1] < fit.table.sigma[6],
    `${P.n} Paare, w ${fit.table.decay.join('/')}, σ ${fit.table.sigma.join('/')}`);
}

rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.ok).length;
console.log(`\nverify:road-surface — ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
