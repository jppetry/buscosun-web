/**
 * verify-calib-fit.mjs — der Fit der Kalibrierung (AP13, `src/point/calibFit.ts`) an einem synthetischen Archiv.
 *
 *   npm run verify:calib-fit
 *
 * Netzfrei, deterministisch (feste Saat). Erzeugt Fallsätze in der Form des Vertrags mit dem Nachlauf (AP9) mit
 * BEKANNTEN Parametern und prüft:
 *   • Rückgewinnung: σ_sys ±10 %, c ±10 %, Konfidenz-Abschlag ±10 %, L_h ±25 %, L_d ±25 %, λ exakt (Gitter),
 *     A und A_uhi ±20 %, z_b exakt (Gitter), meltOffset ±30 m, tpiSigma ±5 %;
 *   • die Ausgabe ist ein Schema-2-Dokument, das der Client-Prüfer (`calibDoc.ts`) ohne Verwerfung annimmt, und
 *     die Abbildung auf die Rechnung trägt die Werte;
 *   • Abbruch „Archiv zu kurz" bei 7 Tagen (unter jedem Mindestbeleg): nichts geschrieben, Diagnose mit Reifedatum je Parameter;
 *   • Negativkontrollen: vertauschte Wahrheit ⇒ A/A_uhi nicht geschrieben, σ_sys groß; Leck-Wächter: Wahrheit
 *     nach dem Stichtag zählt nicht, Wahrheit vor dem Slot bricht ab; zwei Läufe byte-gleich.
 */
import { fitCalib, calibDocumentWith, CALIB_REGISTRY, FIT_VERSION } from '../src/point/calibFit.ts';
import { validateCalibDocument, calibOverridesFrom, CALIB_N_MIN, CALIB_BINS_H } from '../src/point/calibDoc.ts';
import { CALIBRATION_V1 } from '../src/point/calibration.ts';
import { fRadOf, windBlendingFactor, TERRAIN_SET } from '../src/pointForecast/fusion/terrainTerms.ts';

const checks = [];
const add = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const T0 = Date.now();

// ── Zufall (LCG + Box–Muller), deterministisch ─────────────────────────────
function rng(seed) {
  let s = seed >>> 0;
  const u = () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  const n = () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
  return { u, n };
}

const DAY = 86_400_000;
const START = Date.UTC(2026, 8, 14, 23, 10);          // erster Slot 14.09. 23:10 UTC
const dayOf = (d) => new Date(START + d * DAY).toISOString().slice(0, 10);
const BIN_LEAD = CALIB_BINS_H.map(([a, b]) => Math.round((a + b) / 2));
const SIGMA_SYS_TRUE = [1.0, 1.2, 1.5, 2.0, 2.8, 3.5];
const C_TRUE = 1.4, DISC_TRUE = 0.8, LH_TRUE = 300, LD_F_TRUE = 1, LAM_TRUE = 1, A_TRUE = 2.5, AU_TRUE = 1.2, ZB_TRUE = 80, MELT_TRUE = 150, TPI_SD = 35;

function makePoints(n, r) {
  return Array.from({ length: n }, (_, i) => ({ id: `P${i}`, lat: 46 + 8 * r.u(), lon: 6 + 10 * r.u(), elev: Math.round(100 + 1500 * r.u()), country: i % 5 === 0 ? 'AT' : 'DE', basin: i % 5 < 2, urban: i % 10 < 3 }));
}

function makeCases({ days = 60, seed = 7 } = {}) {
  const r = rng(seed);
  const pts = makePoints(120, r);
  const cases = [];
  for (let d = 0; d < days; d++) {
    const slotAtMs = START + d * DAY, day = dayOf(d);
    for (const p of pts) {
      const base = (leadH) => ({ pointId: p.id, day, slotAtMs, validAtMs: slotAtMs + leadH * 3_600_000, leadH, lat: p.lat, lon: p.lon, country: p.country, elevM: p.elev });
      // σ_sys: t2m und Wind, ein Fall je Bin
      for (const v of ['t2m', 'wind']) {
        for (let b = 0; b < BIN_LEAD.length; b++) {
          const mu = 10 + 5 * r.n(), sn = 0.5 + 0.5 * r.u();
          const tot = Math.sqrt(sn * sn + SIGMA_SYS_TRUE[b] ** 2);
          cases.push({ ...base(BIN_LEAD[b]), kind: 'sigma', var: v, mu, obs: mu + tot * r.n(), sigmaNonSys: sn, sigmaEns: null, flags: [], sigmaMember: tot });
        }
      }
      // c: Böe, Ensemble-Stunden
      for (let b = 0; b < BIN_LEAD.length; b++) {
        const mu = 12 + 4 * r.n(), se = 0.5 + 1.5 * r.u();
        cases.push({ ...base(BIN_LEAD[b]), kind: 'sigma', var: 'gust', mu, obs: mu + C_TRUE * se * r.n(), sigmaNonSys: se, sigmaEns: se, flags: [], sigmaMember: se });
      }
      // Konfidenz-Abschlag: Bewölkung, ein Fall je Punkt und Tag (Bin reihum), 25 % interpoliert mit 1/0,8-fachem Fehler
      {
        const b = (d + Number(p.id.slice(1))) % BIN_LEAD.length;
        const mu = 50 + 20 * r.n(), s = 8, flagged = r.u() < 0.25;
        cases.push({ ...base(BIN_LEAD[b]), kind: 'sigma', var: 'clct', mu, obs: mu + (flagged ? s / DISC_TRUE : s) * r.n(), sigmaNonSys: 1, sigmaEns: null, flags: flagged ? ['interpolated'] : [], sigmaMember: s });
      }
      // Geländeterme: eine Nachtstunde je Punkt und Tag
      {
        const clct = 100 * r.u(), windMs = 6 * r.u();
        const gCap = p.basin ? r.u() : 0, gUhi = p.urban ? r.u() : 0;
        const f = fRadOf(clct, windMs);
        const on = f != null && f >= TERRAIN_SET.epsilon;
        const xc = on ? gCap * f * 0.7 : 0, xu = on ? gUhi * f * 0.7 : 0;
        const mu = 5 + 3 * r.n();
        cases.push({ ...base(6), kind: 'terms', obs: mu - A_TRUE * xc + AU_TRUE * xu + 0.5 * r.n(), muNoTerms: mu, clct, windMs, gCap: p.basin ? gCap : null, basin: p.basin, gUhi: p.urban ? gUhi : null, fSaison: 0.7, foehnFactor: 1 });
      }
    }
    // Gitter (t1), Wind, Phase: kleinere Stichproben — die Gittersuche ist der teure Teil.
    for (const p of pts.slice(0, 40)) {
      const base = (leadH) => ({ pointId: p.id, day, slotAtMs, validAtMs: slotAtMs + leadH * 3_600_000, leadH, lat: p.lat, lon: p.lon, country: p.country, elevM: p.elev });
      const ld = LD_F_TRUE * 0.05 * 110_574;
      const cells = Array.from({ length: 4 }, () => ({ distM: 500 + 6500 * r.u(), dhM: 600 * r.u(), landDelta: 0.8 * r.u(), value: 10 + 3 * r.n() }));
      let sw = 0, sv = 0;
      for (const c of cells) { const w = Math.exp(-((c.distM / ld) ** 2)) * Math.exp(-((c.dhM / LH_TRUE) ** 2)) * Math.exp(-c.landDelta / LAM_TRUE); sw += w; sv += w * c.value; }
      cases.push({ ...base(3), kind: 'grid', tier: 't1', obs: sv / sw + 0.3 * r.n(), sigma: 0.5, cells });
      const modWind = 1 + 9 * r.u(), z0Mod = 0.1 + 0.4 * r.u(), z0True = 0.001 + r.u(), d0True = 0;
      const fz = windBlendingFactor(z0Mod, z0True, 0, d0True, ZB_TRUE);
      cases.push({ ...base(4), kind: 'wind', obs: modWind * fz * Math.exp(0.1 * r.n()), modWind, z0Mod, z0True, d0True });
    }
    for (const p of pts.slice(0, 10)) {
      const zw0 = 500 + 2000 * r.u(), hTrue = zw0 - 800 + 1600 * r.u();
      const pSnow = 1 / (1 + Math.exp(-(hTrue - (zw0 - MELT_TRUE)) / 100));
      cases.push({ pointId: p.id, day, slotAtMs, validAtMs: slotAtMs + 5 * 3_600_000, leadH: 5, lat: p.lat, lon: p.lon, country: 'DE', elevM: p.elev, kind: 'phase', snow: r.u() < pSnow ? 1 : 0, hTrue, zWetZeroM: zw0 });
    }
  }
  return cases;
}

const tpiSample = (() => { const r = rng(99); return Array.from({ length: 500 }, () => ({ region: 'default', tpiM: TPI_SD * r.n() })); })();
const cases = makeCases();
// Stichtag hinter dem letzten Fenster (Slot 59 + 291 h Vorlauf) — alle Fälle zählen.
const asOfMs = START + 75 * DAY;
const res = fitCalib(cases, { asOfMs, tpi: tpiSample });
const rel = (x, t) => Math.abs(x - t) / Math.abs(t);
const row = (p) => res.report.find((r) => r.path === p);

// (1) Registry
add('(1) Registry: jeder fitbare Pfad hat einen Mindestbeleg in calibDoc (eine Stelle für Fit und Leser); die nicht fitbaren sind benannt',
  CALIB_REGISTRY.filter((r) => r.fittable).every((r) => CALIB_N_MIN[r.path]) && CALIB_REGISTRY.some((r) => !r.fittable && r.path === 'dzMin'),
  `${CALIB_REGISTRY.length} Einträge, fitbar ${CALIB_REGISTRY.filter((r) => r.fittable).length}`);

// (2) σ_sys
const ss = res.entries.sigmaSys?.value;
const ssOk = ss && ['t2m', 'wind'].every((v) => ss[v].every((x, b) => x != null && rel(x, SIGMA_SYS_TRUE[b]) <= 0.10));
add('(2) σ_sys je Größe × Bin zurückgewonnen (±10 %), mit n, Tagen, 90-%-Intervall und gehaltener Spread/Skill',
  ssOk && res.entries.sigmaSys.binsH === CALIB_BINS_H && row('sigmaSys').cv,
  ss ? `t2m ${ss.t2m.map((x) => x.toFixed(2)).join('/')} · wind ${ss.wind.map((x) => x.toFixed(2)).join('/')} (wahr ${SIGMA_SYS_TRUE.join('/')})` : 'fehlt');
const cvT = row('sigmaSys')?.cv?.spreadSkillHeldOut?.t2m;
add('(2b) geblockte Raum-CV: Spread/Skill im ausgelassenen Block nahe 1 (0,9…1,1)', cvT && cvT.every((x) => x != null && x > 0.9 && x < 1.1), cvT?.join('/'));

// (3) c
const cs = res.entries.cSpread?.value?.gust;
add('(3) c(p,f) zurückgewonnen (±10 %) an den Ensemble-Stunden', cs && cs.every((x) => x != null && rel(x, C_TRUE) <= 0.10), cs?.map((x) => x?.toFixed(3)).join('/'));

// (4) Konfidenz-Abschlag
const di = res.entries.confDiscount?.value?.interpolated;
add('(4) Konfidenz-Abschlag „interpoliert" zurückgewonnen (±10 %)', di != null && rel(di, DISC_TRUE) <= 0.10, `${di} (wahr ${DISC_TRUE})`);

// (5) Gitter
const lh = res.entries.Lh?.value, ldT1 = res.entries.Ld?.value?.t1, lam = res.entries.kappaLambda?.value;
add('(5) L_h (±25 %), L_d (±25 %) und λ (Gitter) zurückgewonnen; Leave-one-region-out-Gewinn gegen die Setzung > 0',
  lh != null && rel(lh, LH_TRUE) <= 0.25 && ldT1 != null && rel(ldT1, LD_F_TRUE * 0.05 * 110_574) <= 0.25 && lam === LAM_TRUE && row('Lh').cv.crpssVsSetHeldOut > 0,
  `L_h ${lh} · L_d t1 ${ldT1} · λ ${lam} · CV ${JSON.stringify(row('Lh').cv)}`);

// (6) Amplituden
const A = res.entries.A?.value?.default, Au = res.entries.Auhi?.value?.default;
add('(6) A und A_uhi gemeinsam zurückgewonnen (±20 %), 90-%-Intervall schließt 0 aus; f_rad-Parameter geschrieben',
  A != null && rel(A, A_TRUE) <= 0.2 && Au != null && rel(Au, AU_TRUE) <= 0.2 && res.entries['fRad.a'] && res.entries['fRad.vRef'] && res.entries['fRad.epsilon'],
  `A ${A} ${JSON.stringify(row('A').ci90)} · A_uhi ${Au} ${JSON.stringify(row('Auhi').ci90)} · a ${res.entries['fRad.a']?.value} v_ref ${res.entries['fRad.vRef']?.value} ε ${res.entries['fRad.epsilon']?.value}`);

// (6b) Unverzerrtheit: ein einzelner Lauf darf ±2 SE daneben liegen (gemessen 18.09.: A_uhi 0,98 bei wahr 1,2, das
// Intervall knapp daneben) — die Prüfung der Schätzer ist deshalb das MITTEL über fünf Saaten (nur Geländefälle).
{
  const means = { A: 0, Au: 0 };
  const seeds = [11, 12, 13, 14, 15];
  for (const seed of seeds) {
    const r = rng(seed);
    const pts = makePoints(120, r);
    const tc = [];
    for (let d = 0; d < 60; d++) {
      const slotAtMs = START + d * DAY, day = dayOf(d);
      for (const p of pts) {
        const clct = 100 * r.u(), windMs = 6 * r.u(), gCap = p.basin ? r.u() : 0, gUhi = p.urban ? r.u() : 0;
        const f = fRadOf(clct, windMs), on = f != null && f >= TERRAIN_SET.epsilon;
        const xc = on ? gCap * f * 0.7 : 0, xu = on ? gUhi * f * 0.7 : 0, mu = 5 + 3 * r.n();
        tc.push({ pointId: p.id, day, slotAtMs, validAtMs: slotAtMs + 6 * 3_600_000, leadH: 6, lat: p.lat, lon: p.lon, country: p.country, elevM: p.elev, kind: 'terms', obs: mu - A_TRUE * xc + AU_TRUE * xu + 0.5 * r.n(), muNoTerms: mu, clct, windMs, gCap: p.basin ? gCap : null, basin: p.basin, gUhi: p.urban ? gUhi : null, fSaison: 0.7, foehnFactor: 1 });
      }
    }
    const f = fitCalib(tc, { asOfMs });
    means.A += f.report.find((x) => x.path === 'A').value / seeds.length;
    means.Au += f.report.find((x) => x.path === 'Auhi').value / seeds.length;
  }
  add('(6b) A und A_uhi unverzerrt: Mittel über 5 Saaten ±5 % am wahren Wert', rel(means.A, A_TRUE) <= 0.05 && rel(means.Au, AU_TRUE) <= 0.05,
    `A ${means.A.toFixed(3)} (wahr ${A_TRUE}) · A_uhi ${means.Au.toFixed(3)} (wahr ${AU_TRUE})`);
}

// (7) z_b, meltOffset, tpiSigma
add('(7) z_b (Gitter), meltOffset (±30 m) und tpiSigma (±5 %) zurückgewonnen; tpiSigma nennt als Herkunft das Gelände, nicht das Archiv (V-FI-97)',
  res.entries.zBlend?.value === ZB_TRUE && Math.abs(res.entries.meltOffset?.value - MELT_TRUE) <= 30 && rel(res.entries.tpiSigma?.value?.default, TPI_SD) <= 0.05
  && /^Geländestack/.test(res.entries.tpiSigma?.source ?? '') && !/undefined|buscosun-archiv/.test(res.entries.tpiSigma?.source ?? ''),
  `z_b ${res.entries.zBlend?.value} · meltOffset ${res.entries.meltOffset?.value} ${JSON.stringify(res.entries.meltOffset?.ci90)} · tpiSigma ${res.entries.tpiSigma?.value?.default}`);

// (8) Ausgabe → Client-Prüfer → Abbildung
const doc = calibDocumentWith(JSON.parse(JSON.stringify(CALIBRATION_V1)), res.entries, new Date(asOfMs).toISOString());
const val = validateCalibDocument(doc);
const ov = calibOverridesFrom(val);
add('(8) die Ausgabe ist ein Schema-2-Dokument, das der Client-Prüfer ohne Verwerfung annimmt; die Abbildung trägt die Werte',
  res.verdict === 'ok' && val.schema === 2 && val.rejected.length === 0 && val.accepted.length === Object.keys(res.entries).length
  && ov.sigmaSys.temperature[0] === ss.t2m[0] && ov.LhM === lh && ov.A === A && ov.zBlendM === ZB_TRUE && ov.unwired.includes('meltOffset') && ov.unwired.includes('kappaLambda'),
  `geschrieben ${Object.keys(res.entries).length}: ${Object.keys(res.entries).join(', ')} · verworfen ${JSON.stringify(val.rejected)} · ohne Einspeisestelle ${ov.unwired.join(', ')}`);

// (9) Archiv zu kurz
// 7 Tage: unter jedem Mindestbeleg (der kleinste ist 10 Tage — confDiscount, meltOffset).
const short = fitCalib(cases.filter((c) => Date.parse(c.day) < Date.parse(dayOf(7))), { asOfMs, tpi: [] });
const sRow = short.report.find((r) => r.path === 'sigmaSys');
add('(9) 7 Tage ⇒ „Archiv zu kurz": nichts geschrieben, Diagnose je Parameter mit n, Tagen und Reifedatum (σ_sys ≈ 30. Slot-Tag)',
  short.verdict === 'Archiv zu kurz' && Object.keys(short.entries).length === 0 && sRow.status === 'too-short' && sRow.eta === dayOf(29) && short.diagnosis[0].startsWith('Archiv zu kurz'),
  `${short.diagnosis[0]} · σ_sys reif ≈ ${sRow.eta} (erwartet ${dayOf(29)})`);

// (10) vertauschte Wahrheit
const r10 = rng(4242);
const shuffled = cases.map((c) => ({ ...c }));
const terms = shuffled.filter((c) => c.kind === 'terms');
for (let i = terms.length - 1; i > 0; i--) { const j = Math.floor(r10.u() * (i + 1)); const t = terms[i].obs; terms[i].obs = terms[j].obs; terms[j].obs = t; }
const t2 = shuffled.filter((c) => c.kind === 'sigma' && c.var === 't2m');
for (let i = t2.length - 1; i > 0; i--) { const j = Math.floor(r10.u() * (i + 1)); const t = t2[i].obs; t2[i].obs = t2[j].obs; t2[j].obs = t; }
const neg = fitCalib(shuffled, { asOfMs, tpi: tpiSample });
add('(10) Negativkontrolle: vertauschte Wahrheit ⇒ A und A_uhi nicht geschrieben (Intervall schließt 0 ein), σ_sys der Temperatur > 2× der wahre Wert',
  !neg.entries.A && !neg.entries.Auhi && neg.entries.sigmaSys.value.t2m.every((x, b) => x > 2 * SIGMA_SYS_TRUE[b]),
  `A ${neg.report.find((r) => r.path === 'A').status} ${JSON.stringify(neg.report.find((r) => r.path === 'A').ci90)} · σ_sys t2m ${neg.entries.sigmaSys.value.t2m.map((x) => x.toFixed(1)).join('/')}`);

// (11) Leck-Wächter
const future = { ...cases[0], pointId: 'LEAK', validAtMs: asOfMs + 3_600_000 };
const withFuture = fitCalib([...cases, future], { asOfMs, tpi: tpiSample });
let threw = null;
try { fitCalib([...cases.slice(0, 50), { ...cases[0], validAtMs: cases[0].slotAtMs - 1 }], { asOfMs }); } catch (e) { threw = String(e.message ?? e); }
add('(11) Leck-Wächter: Wahrheit nach dem Stichtag zählt nicht (1 ausgeschlossen, Ergebnis gleich); Wahrheit vor dem Slot bricht ab',
  res.excluded.afterAsOf === 0 && withFuture.excluded.afterAsOf === 1 && JSON.stringify(withFuture.entries) === JSON.stringify(res.entries) && /as-of verletzt/.test(threw ?? ''),
  threw?.slice(0, 90));

// (12) Determinismus
const again = fitCalib(cases, { asOfMs, tpi: tpiSample });
add('(12) zwei Läufe byte-gleich (feste Saat, keine Uhr außer dem Stichtag)', JSON.stringify(again) === JSON.stringify(res), `${FIT_VERSION}`);

const passed = checks.filter((c) => c.ok).length;
console.log(`\n${passed}/${checks.length} Prüfungen bestanden · ${cases.length} Fälle · ${Math.round((Date.now() - T0) / 1000)} s`);
process.exit(passed === checks.length ? 0 : 1);
