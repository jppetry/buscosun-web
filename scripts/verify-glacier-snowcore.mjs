/**
 * verify:glacier-snowcore — Phase GM-1 (`audit/gletscher-schneemodell.md`): the layered snow core of the glacier line.
 * Units and the density rules, mass conservation over random weather, every law against a hand calculation with the published constants,
 * the new-snow window, melt, the state row, and the core driven with MEASURED daily precipitation and temperature of three Austrian
 * mountain stations against their MEASURED new snow (`scripts/lib/fixtures/glacier/snowcore-klima.json`, GeoSphere klima-v2-1d, CC BY 4.0).
 * Every check that claims something is right has a counter-check on a deliberately wrong constant.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-snowcore.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SNOW, SNOW_ORIGIN, SNOW_SOURCES, SNOW_DENSITY_RULES, SNOW_DENSITY_DEFAULT, newSnowDensity, newSnowDensitySpan, depthCmOf, densityOf,
  emptyPack, packFromSwe, ageOut, overburden, deposit, compact, melt, stepPack, packSwe, packDepthCm, packDensity, newSnow,
  packToRow, packFromRow, packProblems,
} from './glacier/lib/snowcore.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = 3_600_000, DAY = 24 * H;
const checks = [];
const add = (name, ok, detail = '') => checks.push({ name, ok: !!ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) });
const near = (a, b, tol) => a != null && b != null && Math.abs(a - b) <= tol;
const throws = (f) => { try { f(); return false; } catch { return true; } };
const T0 = Date.UTC(2026, 0, 10, 0);
const withC = (over) => Object.freeze({ ...SNOW, ...over });

// --- A: units, span, density rules --------------------------------------------------------------------------------------------------
{
  const span = newSnowDensitySpan();
  add('A1 10 mm Wasserwert bei 68 kg/m³ sind 14,7 cm; die Spanne der Dichte ist 56,5 / 68 / 79,5',
    near(depthCmOf(10, 68), 14.7059, 1e-3) && near(span.p10, 56.466, 0.01) && span.p50 === 68 && near(span.p90, 79.534, 0.01), { d: depthCmOf(10, 68), span });
  const v = newSnowDensity({ rule: 'vionnet', tC: -5, uMs: 4 });
  add('A2 Dichteregeln: gemessen = 68 bei jedem Wetter; Vionnet(−5 °C, 4 m/s) = 131; Untergrenze 50; ohne Wert null; unbekannte Regel bricht ab',
    SNOW_DENSITY_DEFAULT === 'measured' && SNOW_DENSITY_RULES.length === 2 && newSnowDensity() === 68 && newSnowDensity({ rule: 'measured', tC: 1, uMs: 20 }) === 68
    && near(v, 131, 1e-9) && newSnowDensity({ rule: 'vionnet', tC: -20, uMs: 0 }) === 50 && newSnowDensity({ rule: 'vionnet', tC: null, uMs: 3 }) === null
    && newSnowDensity({ rule: 'vionnet', tC: -2, uMs: -1 }) === null && newSnowDensity({ rule: 'vionnet', tC: 30, uMs: 400 }) === SNOW.rhoMax
    && throws(() => newSnowDensity({ rule: 'schmucki' })), { v });
  const keys = Object.keys(SNOW).filter((k) => !['g', 'sweEps'].includes(k));
  add('A3 jede Konstante trägt ihre Herkunft, jede Quelle DOI und Lizenz',
    keys.every((k) => ['literature', 'set', 'measured'].includes(SNOW_ORIGIN[k])) && Object.keys(SNOW_ORIGIN).every((k) => k in SNOW)
    && SNOW_SOURCES.length === 2 && SNOW_SOURCES.every((s) => /^https:\/\/doi\.org\/10\.5194\/hess-/.test(s.doi) && s.licence === 'CC BY 4.0'),
    { ohne: keys.filter((k) => !SNOW_ORIGIN[k]) });
}

// --- B: mass conservation and bounds over random weather ---------------------------------------------------------------------------
{
  let seed = 20261122;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const p = emptyPack();
  let inMm = 0, outMm = 0, bad = [], grew = 0, maxRho = 0, maxLayers = 0;
  for (let h = 0; h < 24 * 60; h++) {
    const snowing = rnd() < 0.25, melting = rnd() < 0.1;
    const solid = snowing ? rnd() * 3 : 0, m = melting ? rnd() * 2 : 0, tC = -15 + rnd() * 17;
    const before = packDepthCm(p);
    const r = stepPack(p, { tMs: T0 + h * H, solidMm: solid, rhoNew: newSnowDensity(), meltMm: m, tC });
    inMm += solid; outMm += r.melted;
    if (solid === 0 && packDepthCm(p) > before + 1e-9) grew++;
    const pr = packProblems(p); if (pr.length && bad.length < 3) bad.push(`${h}: ${pr.join(',')}`);
    for (const l of [p.old, ...p.fresh]) { const rho = densityOf(l); if (rho != null) maxRho = Math.max(maxRho, rho); }
    maxLayers = Math.max(maxLayers, p.fresh.length);
  }
  add('B1 Masse bleibt erhalten: Schneefall − Schmelze = Wasserwert der Schneedecke (60 Tage Zufallswetter)', near(inMm - outMm, packSwe(p), 1e-6), { inMm, outMm, swe: packSwe(p) });
  add('B2 ohne Schneefall wächst die Schneehöhe nie; keine Dichte über 401 kg/m³; keine Regelverletzung; höchstens 13 frische Schichten',
    grew === 0 && maxRho <= SNOW.rhoMax + 1e-6 && bad.length === 0 && maxLayers <= SNOW.newWindowH / SNOW.layerH + 1, { grew, maxRho, bad, maxLayers });
}

// --- C: every law against a hand calculation with the published constants -----------------------------------------------------------
{
  // new snow: 13.6 mm at 68 kg/m³ = 20 cm; one hour at −5 °C: 20·e^(−2.777e-6·e^(−0.2)·3600) = 19.8370 cm
  const p = emptyPack(); deposit(p, 13.6, 68, T0); compact(p, 3600, -5);
  const pWrong = emptyPack(); deposit(pWrong, 13.6, 68, T0); compact(pWrong, 3600, -5, withC({ freshC1: 2.777e-5 }));
  const pNoT = emptyPack(); deposit(pNoT, 13.6, 68, T0); compact(pNoT, 3600, null);
  add('C1 Neuschnee setzt sich um 0,82 % in einer Stunde bei −5 °C (Handrechnung 19,837 cm); ohne Temperatur bleibt er stehen; Gegenprobe mit zehnfacher Rate fällt auf',
    near(p.fresh[0].h, 19.8370, 2e-4) && !near(pWrong.fresh[0].h, 19.8370, 0.5) && near(pNoT.fresh[0].h, 20, 1e-9), { h: p.fresh[0].h, wrong: pWrong.fresh[0].h });
  // hand-over: at 0 °C the rate is 0.9997 %/h, 68 → 81 takes ln(81/68)/0.0099972 = 17.5 h
  const q = emptyPack(); deposit(q, 13.6, 68, T0); let at17 = null, at18 = null;
  for (let h = 1; h <= 18; h++) { compact(q, 3600, 0); if (h === 17) at17 = densityOf(q.fresh[0]); if (h === 18) at18 = densityOf(q.fresh[0]); }
  add('C2 Neuschnee erreicht bei 0 °C nach 17,5 Stunden die Übergabedichte 81 kg/m³ und wird dort nicht übersprungen', at17 < 81 && at17 > 80 && at18 >= 81 && at18 < 81.2, { at17, at18 });
  // older snow: 300 mm at 300 kg/m³ = 100 cm, one day: η = 8.5e6·e^9 = 6.8876e10 Pa s, σ = 2943 Pa, ratio 1.0036918 → 99.6322 cm
  const o = emptyPack(); o.old = { swe: 300, h: 100 }; compact(o, 86400, -5);
  const oWrong = emptyPack(); oWrong.old = { swe: 300, h: 100 }; compact(oWrong, 86400, -5, withC({ eta0: 8.5e5 }));
  add('C3 Altschnee (300 kg/m³, 1 m) setzt sich an einem Tag auf 99,632 cm (Winkler 2021, Gl. 1, Handrechnung); Gegenprobe mit η0/10 fällt auf',
    near(o.old.h, 99.6322, 2e-3) && !near(oWrong.old.h, 99.6322, 1), { h: o.old.h, wrong: oWrong.old.h });
  // the load above counts: the same layer under 100 mm of snow above settles more
  const o2 = emptyPack(); o2.old = { swe: 300, h: 100 }; o2.fresh.push({ swe: 100, h: 100, t0: T0 }); compact(o2, 86400, -5);
  add('C4 die Auflast zählt: mit 100 mm Schnee darüber setzt sich dieselbe Schicht stärker (Verhältnis der Dehnung 400/300)',
    near((100 / o2.old.h - 1) / (100 / o.old.h - 1), 400 / 300, 1e-6), { a: o.old.h, b: o2.old.h });
  // overburden: 200 mm at 200 kg/m³ = 100 cm, new load 10 mm: ε = 5.1e-4·98.1·e^(−0.38·200/201) = 0.034279 → 96.572 cm; new snow below 81 is left alone
  const b = emptyPack(); b.old = { swe: 200, h: 100 }; b.fresh.push({ swe: 6.8, h: 10, t0: T0 }); overburden(b, 10);
  const bWrong = emptyPack(); bWrong.old = { swe: 200, h: 100 }; overburden(bWrong, 10, withC({ kOv: 3.8 }));
  add('C5 neue Last von 10 mm staucht Altschnee (200 kg/m³) um 3,43 % (Winkler 2021, Gl. 2); Neuschnee unter 81 kg/m³ bleibt; Gegenprobe mit k_ov·10 fällt auf',
    near(b.old.h, 96.5721, 2e-3) && near(b.fresh[0].h, 10, 1e-12) && near(b.old.swe, 200, 1e-12) && !near(bWrong.old.h, 96.5721, 1), { h: b.old.h, wrong: bWrong.old.h });
  // two independent papers agree: hourly new snow of 68 kg/m³ (Helfricht) is, after a day of steady snowfall, between 68 and the daily 81 (Winkler)
  const day = (c) => { const s = emptyPack(); for (let h = 0; h < 24; h++) stepPack(s, { tMs: T0 + h * H, solidMm: 1, rhoNew: 68, tC: -5 }, c); return newSnow(s, T0 + DAY, 24, c); };
  const d = day(SNOW), dOff = day(withC({ freshC1: 0 }));
  const rhoDay = d.mm / (d.cm / 100), rhoOff = dOff.mm / (dOff.cm / 100);
  add('C6 Quervergleich zweier Arbeiten: 24 mm in 24 h bei −5 °C ergeben am Tagesende eine Neuschneedichte zwischen 70 und 81 kg/m³; ohne Setzung bliebe sie bei 68',
    near(d.mm, 24, 1e-9) && rhoDay > 70 && rhoDay <= 81.01 && near(rhoOff, 68, 1e-6), { rhoDay, cm: d.cm, rhoOff });
}

// --- D: layers, the new-snow window, age-out, melt, the state row -----------------------------------------------------------------
{
  const p = emptyPack();
  deposit(p, 5, 68, T0); deposit(p, 5, 68, T0 + 3 * H); deposit(p, 4, 68, T0 + 7 * H); deposit(p, 2, 68, T0 + 30 * H);
  add('D1 Schneefall innerhalb von 6 Stunden sammelt sich in einer Schicht, danach beginnt eine neue', p.fresh.length === 3 && near(p.fresh[0].swe, 10, 1e-12) && p.fresh[1].t0 === T0 + 7 * H, p.fresh);
  const at = T0 + 31 * H;
  const n24 = newSnow(p, at, 24), n48 = newSnow(p, at, 48);
  // window 24 h starts at T0+7 h: the 7 h layer [7,13] lies inside, the first layer [0,6] outside, the 30 h layer has run one hour and counts fully
  add('D2 Neuschnee 24 h zählt nur, was im Fenster fiel (6 mm), 48 h alles (16 mm); eine angeschnittene Schicht zählt anteilig; Fenster über 72 h bricht ab',
    near(n24.mm, 6, 1e-9) && near(n48.mm, 16, 1e-9) && near(newSnow(p, T0 + 27 * H, 24).mm, 4 + 10 * (3 / 6), 1e-9) && throws(() => newSnow(p, at, 96)), { n24, n48, cut: newSnow(p, T0 + 27 * H, 24) });
  const sweB = packSwe(p), hB = packDepthCm(p);
  ageOut(p, T0 + 80 * H);
  add('D3 nach 72 Stunden wird Neuschnee zu Altschnee, Masse und Höhe bleiben', p.fresh.length === 1 && p.fresh[0].t0 === T0 + 30 * H && near(p.old.swe, 14, 1e-12) && near(packSwe(p), sweB, 1e-12) && near(packDepthCm(p), hB, 1e-12), p);
  const m = emptyPack(); m.old = { swe: 100, h: 40 }; m.fresh.push({ swe: 10, h: 12, t0: T0 }, { swe: 4, h: 6, t0: T0 + 7 * H });
  const took = melt(m, 9);
  add('D4 Schmelze nimmt von oben: 9 mm lassen die oberste Schicht verschwinden und die zweite auf die Hälfte schrumpfen, der Altschnee bleibt',
    near(took, 9, 1e-12) && m.fresh.length === 1 && near(m.fresh[0].swe, 5, 1e-12) && near(m.fresh[0].h, 6, 1e-12) && near(m.old.h, 40, 1e-12), m);
  const all = melt(m, 500);
  add('D5 mehr Schmelze als Schnee: genommen wird, was da ist, die Schneedecke ist danach leer und regelkonform', near(all, 105, 1e-9) && packSwe(m) === 0 && packDepthCm(m) === 0 && packProblems(m).length === 0, { all });
  const s = emptyPack(); s.old = { swe: 123.4, h: 45.6 }; s.fresh.push({ swe: 7.8, h: 9.1, t0: T0 }, { swe: 1.2, h: 1.7, t0: T0 + 8 * H });
  const row = packToRow(s), back = packFromRow(row);
  add('D6 Zustandszeile: ganze Zahlen, hin und zurück gleich; kaputte Zeilen werden abgewiesen',
    row.every(Number.isInteger) && row.length === 8 && near(back.old.swe, 123.4, 1e-9) && back.fresh[1].t0 === T0 + 8 * H && near(back.fresh[0].h, 9.1, 1e-9)
    && throws(() => packFromRow([1])) && throws(() => packFromRow([1, 2, 3])) && throws(() => packFromRow([1, -2])) && throws(() => packFromRow([1.5, 2])) && throws(() => packFromRow('x')), row);
  const f = packFromSwe(250), e = packFromSwe(0);
  add('D7 Übernahme aus dem Schmelzzustand: 250 mm werden 1 m Altschnee bei der gesetzten Dichte 250 kg/m³; ohne Schnee bleibt die Schneedecke leer',
    near(f.old.h, 100, 1e-9) && near(packDensity(f), 250, 1e-9) && packSwe(e) === 0 && packDensity(e) === null && SNOW_ORIGIN.rhoOldInit === 'set', f);
  const bad = emptyPack(); bad.old = { swe: 10, h: 0.5 }; bad.fresh.push({ swe: 1, h: 1, t0: T0 }, { swe: 1, h: 1, t0: T0 });
  add('D8 die Regelprüfung meldet eine Dichte über der Grenze und Schichten in falscher Reihenfolge', packProblems(bad).length === 2 && packProblems(emptyPack()).length === 0, packProblems(bad));
}

// --- E: measured weather in, measured new snow out (three Austrian mountain stations, winter 2025/26) -------------------------------
{
  const FX = JSON.parse(readFileSync(join(HERE, 'lib', 'fixtures', 'glacier', 'snowcore-klima.json'), 'utf8'));
  const t0 = Date.parse(FX.t0);
  const run = (st, rhoNew) => {
    const n = st.sh.length, pack = emptyPack(), hn = [];
    if (st.sh[0] > 0) { pack.old.h = st.sh[0]; pack.old.swe = (st.sh[0] / 100) * SNOW.rhoOldInit; }
    for (let i = 0; i < n; i++) {
      const solid = st.rr[i] > 0 && st.tm[i] != null && st.tm[i] <= 1 ? st.rr[i] : 0;
      for (let h = 0; h < 24; h++) stepPack(pack, { tMs: t0 + i * DAY + h * H, solidMm: solid / 24, rhoNew, tC: st.tm[i] });
      hn.push(newSnow(pack, t0 + (i + 1) * DAY, 24).cm);
    }
    let e = 0, a = 0, k = 0, rho = 0, rk = 0;
    for (let i = 0; i + 1 < n; i++) {
      const obs = st.hn[i + 1]; if (obs == null || !(obs >= 3)) continue;
      e += hn[i] - obs; a += Math.abs(hn[i] - obs); k++;
      if (st.rr[i] > 1.5 && st.tm[i] <= -1) { rho += st.rr[i] / (obs / 100); rk++; }
    }
    return { k, bias: e / k, mae: a / k, rhoObs: rk ? rho / rk : null, rk };
  };
  const r = FX.stations.map((st) => ({ name: st.name, ...run(st, SNOW.rhoNew) }));
  const days = r.reduce((s, x) => s + x.k, 0), bias = r.reduce((s, x) => s + x.bias * x.k, 0) / days, mae = r.reduce((s, x) => s + x.mae * x.k, 0) / days;
  const rhoObs = r.reduce((s, x) => s + x.rhoObs * x.rk, 0) / r.reduce((s, x) => s + x.rk, 0);
  add('E1 echte Datenform: drei Stationen, 120 Tage, Quelle und Lizenz genannt, mindestens 80 Tage mit gemessenem Neuschnee ab 3 cm',
    FX.stations.length === 3 && FX.stations.every((s) => s.sh.length === 120 && s.rr.length === 120 && s.tm.length === 120 && s.hn.length === 120) && /CC BY 4\.0/.test(FX.source) && days >= 80, { days });
  add('E2 gemessene Tagesdichte des Neuschnees (Niederschlag / Neuschneehöhe an Tagen ≤ −1 °C) liegt zwischen 55 und 85 kg/m³ — der Literaturwert 68 liegt darin',
    rhoObs > 55 && rhoObs < 85 && SNOW.rhoNew > 55 && SNOW.rhoNew < 85, { rhoObs, je: r.map((x) => `${x.name} ${Math.round(x.rhoObs)}`) });
  add('E3 Neuschnee je Schneefalltag (89 Tage): Modell gegen Messung im Mittel höchstens 5 cm daneben, Abweichung im Mittel zwischen −4 und +1 cm (Stand M-2: −2,5 / 3,9)',
    mae <= 5 && bias > -4 && bias < 1, { bias, mae, je: r.map((x) => `${x.name} ${x.bias.toFixed(1)}/${x.mae.toFixed(1)} (${x.k})`) });
  const w = FX.stations.map((st) => run(st, 200));
  const biasW = w.reduce((s, x) => s + x.bias * x.k, 0) / days;
  add('E4 Gegenprobe: mit einer Neuschneedichte von 200 kg/m³ fällt dieselbe Prüfung durch', !(biasW > -4), { biasW });
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-snowcore ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
