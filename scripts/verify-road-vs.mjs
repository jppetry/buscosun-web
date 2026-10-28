#!/usr/bin/env node
/**
 * verify-road-vs.mjs — AW-6.2 „Virtueller Fahrbahnsensor" (`audit/autobahnwetter.md` §20), network-free.
 *   npm run verify:road-vs
 * A forcing contract and physics · B GMA quality chain · C SWSMOS reducer · D switch · E health R8 · F producer parts · … ·
 * O page view (AW-6.2.9: value per hour, class colours, words, info tab, series).
 * Every section has a negative control (a rule that cannot turn red proves nothing).
 */
import { gunzipSync, gzipSync } from 'node:zlib';
import {
  ROAD_VS_FIELDS, ROAD_VS_FIELD_IDS, ROAD_VS_RANGE, ROAD_VS_STEPS, ROAD_VS_SURFACE_EMISSIVITY, STEFAN_BOLTZMANN, KELVIN,
  intervalFromStartMeans, amountFromStartAccumulations, lwDownFromNet, lwDownBruntBolz, vapourPressureWaterHpa, vapourPressureIceHpa, frostPointC,
  roadVsEncode, roadVsDecode, roadVsForcingProblems, buildCellIndex, roadVsFieldUrl, roadVsRunStamp, roadVsRunDir, roadVsRunMsOf,
} from '../src/road/vs/roadVsForcing.ts';
import {
  VS_QC_CONSTANT_SLOTS, VS_QC_IQR, VS_QC_MODEL, vsQcConstant, vsQcJump, vsQcIqr, vsQcModel, vsQcStation, vsQcIsWinter,
} from '../src/road/vs/roadVsQc.ts';
import { ROAD_SLOT_MS, ROAD_SLOT_BASELINE, ROAD_SLOT_TOLERANCE, ROAD_JUMP_K } from '../src/road/roadContract.ts';
import { roadVsFlagFrom, ROAD_VS_LIVE } from '../src/road/roadFlag.ts';
import { ROAD_HEALTH, checkRoadStatus } from './health-manifests.mjs';
import { reduceSwsmos, parseKatalog, swsmosRunOf, SWSMOS_LEADS, SWSMOS_COLUMNS } from './road/swsmos-archive.mjs';
import { templateProblem, sampleAt, nextIndex } from './road/vs/build-forcing.mjs';
import { svfOf, horizonAt, horizon8to360, horizonAngleDeg, terrainClassOf, curveRadiusM, roadVsSiteProblems } from '../src/road/vs/roadVsSite.ts';
import { nearHorizon, segmentIndex } from './road/vs/build-site.mjs';
import { decodeTile, glo30TileName } from './road/vs/glo30.mjs';
import { deflateSync } from 'node:zlib';
import {
  VS_DT_S, VS_DT_LIMIT_S, VS_NODE_DEPTH_M, VS_SPINUP_H, VS_DEEP_SOIL, makeColumn, stepColumn, columnHeatJ, roadMaterialAt, initState, integrateHour,
  sensibleHeat, vsStateProblems, deepSoilC, albedoOf, emptyStores,
} from '../src/road/vs/roadVsCore.ts';
import { coupleModeOf, tsWithFactor, fitCouplingFactor, couplingFactorAt, weatherClassOf, learnResiduals, stationCorrection, neighbourCorrection, correctedSigma } from '../src/road/vs/roadVsCouple.ts';
import { gallawayFilm, aquaplaningKmh, frostPointOfDew, rimeIntegralUpdate, bourgouinAreas, bourgouinType, classifyRoad, gripOf, slipperinessP, VS_SCENARIO, VS_SCENARIO_TEXT } from '../src/road/vs/roadVsState.ts';
import { fogVisibilityM, precipVisibilityM, hazeVisibilityM, diagnoseVisibilityM, visibilityProbabilities, capForecastProbabilities, visibilityNow, fitVisLogistic, VS_VIS_DEFAULT_MODEL, VS_VIS_THRESHOLDS_M } from '../src/road/vs/roadVsVis.ts';
import { ROAD_VS_VAR_IDS, roadVsProductProblems, roadVsProductEncode, roadVsProductDecode, roadVsSrcOf, roadVsDisplay } from '../src/road/vs/roadVsProduct.ts';
import {
  ROAD_VS_WORD, ROAD_VS_HORIZON_H, roadVsStep, roadVsValue, roadVsClassOf, roadVsCondText, roadVsBadgeText, roadVsText, roadVsSigmaText, roadVsOriginText, roadVsInfoLines,
  roadVsSeries, roadLastValueMs, roadVsSourceRow,
} from '../src/road/vs/roadVsView.ts';
import { hourForcing, VS_SIGMA_SET, nextIndex as nextVsIndex } from './road/vs/run-vs.mjs';
import { thinRun, vsArchivePath } from './road/vs/archive-vs.mjs';
import { scoreVs, summaryText, VS_SCORE_LEADS } from './road/vs/score-vs.mjs';

const checks = [];
const ok = (id, pass, detail = '') => { checks.push({ id, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${id}${detail ? ` — ${detail}` : ''}`); };
const close = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// ── A: forcing contract and physics ─────────────────────────────────────────
{
  const v = [null, 10, 30, 20, 40, 0, 55];
  const m = v.map((_, h) => (h === 0 ? null : v.slice(1, h + 1).reduce((s, x) => s + x, 0) / h));
  const back = v.map((_, h) => (h === 0 ? null : intervalFromStartMeans(h === 1 ? null : m[h - 1], m[h], h - 1, h)));
  ok('A1 Intervallmittel aus Mitteln seit Start exakt (6 Stunden, auch 0 W/m²)', back.slice(1).every((x, i) => close(x, v[i + 1])), back.join(','));
  ok('A1b Gegenprobe: das Mittel seit Start selbst ist NICHT das Intervall', !close(m[2], v[2]) && !close(m[5], v[5]), `${m[2]} ≠ ${v[2]}`);
  ok('A2 erste Stunde = erstes Startmittel; fehlendes Vorgängermittel ⇒ null', intervalFromStartMeans(null, 12, 0, 1) === 12 && intervalFromStartMeans(null, 12, 1, 2) === null && intervalFromStartMeans(5, null, 1, 2) === null);
  const acc = [0, 0.2, 0.2, 1.5, 1.4];
  ok('A3 Akkumulation ⇒ Stundenmenge, nie negativ', close(amountFromStartAccumulations(acc[2], acc[3], 2), 1.3) && amountFromStartAccumulations(acc[3], acc[4], 3) === 0 && amountFromStartAccumulations(null, 0.2, 0) === 0.2);
  const lw = 300, tg = 10, net = ROAD_VS_SURFACE_EMISSIVITY * (lw - STEFAN_BOLTZMANN * (tg + KELVIN) ** 4);
  ok('A4 LW↓ aus Netto-Thermalstrahlung und T_G (Rundlauf)', close(lwDownFromNet(net, tg), lw, 1e-6) && lwDownFromNet(null, tg) === null && lwDownFromNet(net, tg, 0) === null, `${lwDownFromNet(net, tg)?.toFixed(3)}`);
  const clear = lwDownBruntBolz(0, 6, 0), cloudy = lwDownBruntBolz(0, 6, 1);
  ok('A5 Brunt/Bolz-Rückfall: klar 200–300 W/m² bei 0 °C, bedeckt größer', clear > 200 && clear < 300 && cloudy > clear && cloudy < 400, `${clear.toFixed(0)} / ${cloudy.toFixed(0)}`);
  ok('A5b Dampfdruck: Magnus Wasser 6,112 hPa bei 0 °C, Eis darunter bei −10 °C, Frostpunkt invertiert', close(vapourPressureWaterHpa(0), 6.112, 1e-9) && vapourPressureIceHpa(-10) < vapourPressureWaterHpa(-10) && close(frostPointC(vapourPressureIceHpa(-7.3)), -7.3, 1e-6));
  ok('A6 Kodierung: Rundlauf, Spanne, null', roadVsDecode('t2m', roadVsEncode('t2m', -3.14)) === -3.1 && roadVsEncode('t2m', 80) === null && roadVsEncode('lwdown', 40) === null && roadVsEncode('qc', null) === null && roadVsDecode('tch', roadVsEncode('tch', 0.00912)) === 0.00912);
  ok('A6b jedes Feld hat Spanne und Skala, abgeleitete ohne DWD-Parameter', ROAD_VS_FIELD_IDS.every((id) => Array.isArray(ROAD_VS_RANGE[id]) && ROAD_VS_FIELDS[id].scale > 0) && ROAD_VS_FIELDS.lwdown.param === null && ROAD_VS_FIELDS.vis.model === 'icon-d2-ruc');
  const run = Date.UTC(2026, 9, 27, 12);
  const good = {
    schema: 1, product: 'road-vs-forcing', run: '2026102712', runMs: run, builtAt: new Date().toISOString(), model: 'icon-d2', steps: ROAD_VS_STEPS, stepH: 1,
    conv: { avg: 'interval', acc: 'interval', eps: 0.95 }, ruc: null, cells: 'abc', missing: {}, outOfRange: {}, source: 'x',
    points: [{ id: 'a1@0', cell: 5, dKm: 0.4, v: { t2m: new Array(ROAD_VS_STEPS).fill(123), lwnet: [null, ...new Array(ROAD_VS_STEPS - 1).fill(-70)] } }],
  };
  ok('A7 Prüfer: gute Datei ohne Befund', roadVsForcingProblems(good).length === 0, roadVsForcingProblems(good).join('; '));
  ok('A7b Prüfer rot bei falscher Länge, falschem run, Dezimalwert', roadVsForcingProblems({ ...good, points: [{ ...good.points[0], v: { t2m: [1, 2] } }] }).some((p) => /Form/.test(p)) && roadVsForcingProblems({ ...good, run: '2026102713' }).some((p) => /run/.test(p)) && roadVsForcingProblems({ ...good, points: [{ ...good.points[0], v: { t2m: new Array(ROAD_VS_STEPS).fill(1.5) } }] }).length === 1);
  // A8: nearest cell on a synthetic 0.02° grid against brute force.
  const la = [], lo = [];
  for (let i = 0; i < 100; i++) for (let j = 0; j < 100; j++) { la.push(50 + i * 0.02 + ((i * 7 + j * 3) % 5) * 0.001); lo.push(8 + j * 0.02); }
  const idx = buildCellIndex(la, lo);
  let agree = 0;
  for (let k = 0; k < 60; k++) {
    const plat = 50.1 + (k * 0.0137) % 1.7, plon = 8.1 + (k * 0.0231) % 1.7;
    const f = idx.find(plat, plon);
    let best = -1, bd = Infinity;
    for (let c = 0; c < la.length; c++) { const dy = (la[c] - plat) * 111.2, dx = (lo[c] - plon) * 111.2 * Math.cos((plat * Math.PI) / 180); const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = c; } }
    if (f && f.cell === best) agree++;
  }
  ok('A8 Zellindex = Brute-Force an 60 Punkten; Punkt 50 km außerhalb ⇒ null', agree === 60 && idx.find(55, 8.5) === null, `${agree}/60`);
  ok('A9 URLs wie im Spike: Einflächen, lvt-Pfad, RUC-Modell', roadVsFieldUrl(ROAD_VS_FIELDS.lwnet, run, 2) === 'https://opendata.dwd.de/weather/nwp/v1/m/icon-d2/p/ATHB_S/r/2026-10-27T12%3A00/s/PT002H00M.grib2'
    && roadVsFieldUrl(ROAD_VS_FIELDS.tso54, run, 1) === 'https://opendata.dwd.de/weather/nwp/v1/m/icon-d2/p/T_SO/lvt1/106/lv1/0.54/r/2026-10-27T12%3A00/s/PT001H00M.grib2'
    && roadVsFieldUrl(ROAD_VS_FIELDS.vis, run, 0).startsWith('https://opendata.dwd.de/weather/nwp/v1/m/icon-d2-ruc/p/VIS/r/') && roadVsFieldUrl(ROAD_VS_FIELDS.lwdown, run, 0) === null);
  ok('A9b Laufstempel: Rundlauf und Verzeichnisname', roadVsRunStamp(run) === '2026102712' && roadVsRunMsOf('2026102712') === run && roadVsRunDir(run) === '2026-10-27T12:00' && Number.isNaN(roadVsRunMsOf('26102712')));
}

// ── B: GMA quality chain ────────────────────────────────────────────────────
{
  const t0 = Date.UTC(2026, 0, 15, 3);
  const hist = (n, rsFn, taFn, dropSlots = []) => { const slotsMs = [], rs = [], ta = []; for (let i = 0; i < n; i++) { if (dropSlots.includes(i)) continue; slotsMs.push(t0 + i * ROAD_SLOT_MS); rs.push(rsFn(i)); ta.push(taFn(i)); } return { slotsMs, rs, ta }; };
  ok('B0 Konstanz-Schwelle = 4 h = 16 Slots', VS_QC_CONSTANT_SLOTS === 16);
  ok('B1 Fahrbahn UND Luft 17 Slots gleich ⇒ eingefroren; Luft bewegt sich ⇒ nicht', vsQcConstant(hist(17, () => -1.2, () => 0.4)) === true && vsQcConstant(hist(17, () => -1.2, (i) => 0.4 + 0.1 * (i % 2))) === false);
  ok('B1b 15 gleiche Slots reichen nicht; 0,01 K Gerätewackeln zählt als gleich', vsQcConstant(hist(15, () => -1.2, () => 0.4)) === false && vsQcConstant(hist(17, (i) => -1.2 + (i % 2) * 0.01, () => 0.4)) === true);
  ok('B2 Lücke von 3 fehlenden Werten ist neutral, 5 unterbrechen', vsQcConstant(hist(20, (i) => (i > 5 && i < 9 ? null : -1.2), () => 0.4)) === true && vsQcConstant(hist(24, (i) => (i > 5 && i < 11 ? null : -1.2), () => 0.4)) === false);
  ok('B3 Sprung 9 K in 15 min ⇒ ja; 5 K ⇒ nein; 9 K über 2 Slots (Grenze 16 K) ⇒ nein', vsQcJump(hist(3, (i) => (i === 2 ? 19 : 10), () => 5)) === true && vsQcJump(hist(3, (i) => (i === 2 ? 15 : 10), () => 5)) === false && vsQcJump(hist(3, (i) => (i === 2 ? 19 : i === 1 ? null : 10), () => 5)) === false && ROAD_JUMP_K === 8);
  const nb = Array.from({ length: 8 }, (_, i) => ({ id: `N${i}`, lat: 50 + 0.05 * i, lon: 8 + 0.05 * (i % 3), h: 120 + i, rs: 2 + 0.2 * (i % 4), model: 2 }));
  const me = { lat: 50.1, lon: 8.1, h: 150 };
  ok('B4 Tukey-Zaun: Residuum +6 K gegen 8 Nachbarn (Residuen 0–0,6) ⇒ draußen; +1 K ⇒ drinnen; 3 Nachbarn ⇒ null', vsQcIqr({ ...me, rs: 8, model: 2 }, nb) === true && vsQcIqr({ ...me, rs: 3, model: 2 }, nb) === false && vsQcIqr({ ...me, rs: 8, model: 2 }, nb.slice(0, 3)) === null && VS_QC_IQR.k === 1.5);
  ok('B4b anderes Höhenband zählt nicht als Nachbar', vsQcIqr({ ...me, h: 450, rs: 8, model: 2 }, nb) === null);
  ok('B5 Modellkonsistenz: 5 K bei σ 1 ⇒ draußen (k 4); 3 K ⇒ drinnen; Kaltstart ⇒ null', vsQcModel(7, { rs: 2, sigma: 1 }) === true && vsQcModel(5, { rs: 2, sigma: 1 }) === false && vsQcModel(7, { rs: 2, sigma: 1, coldStart: true }) === null && VS_QC_MODEL.k === 4);
  const base = { id: 'X', lat: 50.1, lon: 8.1, h: 150, slotMs: t0 };
  const clean = vsQcStation({ ...base, point: { rs: 2.1, ta: 3.0, td: 1, cond: 0 } });
  ok('B6 sauberer Punkt ohne Ring und Modell: ok, übersprungene Schritte benannt', clean.rs.ok && clean.ta.ok && clean.rs.value === 2.1 && clean.skipped.includes('constant') && clean.skipped.includes('jump') && clean.skipped.includes('iqr') && clean.skipped.includes('model'), clean.skipped.join(','));
  const hard = vsQcStation({ ...base, point: { rs: null, ta: 15, td: 1, cond: 0, x: { rs: 'fillValue' } } });
  const obs = vsQcStation({ ...base, point: { rs: 2.1, ta: 3, td: 1, cond: 0, o: { rs: 'neighbours' } } });
  ok('B6b harte Regel ⇒ hard:fillValue; Beobachtungstreffer ⇒ observe:neighbours, Wert null', hard.rs.reasons[0] === 'hard:fillValue' && !hard.rs.ok && hard.ta.ok && obs.rs.reasons[0] === 'observe:neighbours' && obs.rs.value === null);
  const frozen = vsQcStation({ ...base, point: { rs: -1.2, ta: 0.4, td: 0, cond: 0 }, history: hist(17, () => -1.2, () => 0.4) });
  ok('B6c eingefrorener Logger ⇒ Fahrbahn UND Luft verworfen', !frozen.rs.ok && !frozen.ta.ok && frozen.rs.reasons.includes('constant'));
  const full = vsQcStation({ ...base, point: { rs: 8, ta: 3, td: 1, cond: 0 }, history: hist(3, (i) => (i === 2 ? 8 : 7.5), () => 3), neighbours: nb, model: { rs: 2, sigma: 1 } });
  ok('B6d mit Ring, Nachbarn und Modell: IQR verwirft, nichts übersprungen', !full.rs.ok && full.rs.reasons.includes('iqr') && full.skipped.length === 0, full.reasons);
  const weak = vsQcStation({ ...base, point: { rs: -12.5, ta: 0.5, td: 0, cond: 5, rsHi: -1, f: ['spread'] } });
  const oct = vsQcStation({ ...base, slotMs: Date.UTC(2026, 9, 27, 3), point: { rs: -12.5, ta: 0.5, td: 0, cond: 0 } });
  ok('B7 schwache Hinweise: Code 5, Streuung, Winterdifferenz −13 K; im Oktober keine Winterregel', weak.weak.includes('code') && weak.weak.includes('spread') && weak.weak.includes('winterDiff') && weak.rs.ok && !oct.weak.includes('winterDiff') && vsQcIsWinter(t0) && !vsQcIsWinter(Date.UTC(2026, 9, 27)));
}

// ── C: SWSMOS reducer ───────────────────────────────────────────────────────
{
  const head = 'ID;Lat;Lon;YYYYMMDDHHmm;TL;TLSTA;RRL1c;RRS1c;RR6;WWL6;WWS3;RRS3c;R650;RC;TS;TD';
  const rows = [];
  const runMs = Date.UTC(2026, 9, 27, 16);
  const stamp = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}00`; };
  for (const id of ['A006', 'Z999']) for (let h = 1; h <= 60; h++) rows.push(`${id};54.9;8.9;${stamp(runMs + h * 3_600_000)};${(10 - h * 0.1).toFixed(1)};0.4;0;0;0;50;0;0;0;${h % 7 === 0 ? 2 : 1};${h === 5 ? '' : (12.25 - h * 0.1).toFixed(2)};7.0`);
  const csv = [head, '202610271600', ...rows, ''].join('\n');
  const doc = reduceSwsmos(csv, new Set(['A006', 'B001']));
  ok('C1 Reduktion: nur Katalog-Stationen, 48 Vorläufe, vier Spalten, Skala 0,1', Object.keys(doc.stations).join() === 'A006' && doc.stations.A006.ts.length === SWSMOS_LEADS && doc.columns.join() === SWSMOS_COLUMNS.join() && doc.stations.A006.tl[0] === 99 && doc.stations.A006.ts[0] === 122 && doc.stations.A006.td[47] === 70, JSON.stringify(doc.counts));
  ok('C1b fehlender Wert ⇒ null; RC-Codes gezählt; Vorlauf 49–60 verworfen', doc.stations.A006.ts[4] === null && doc.counts.rcCodes[2] === 6 && doc.counts.rcCodes[1] === 42 && doc.counts.kept === 48 && doc.counts.rows === 120 && doc.run === '202610271600');
  let threw = false; try { reduceSwsmos(csv.replace(';TS;', ';XX;'), new Set()); } catch { threw = true; }
  ok('C1c Gegenprobe: Datei ohne TS-Spalte bricht ab', threw);
  const kat = parseKatalog(new TextEncoder().encode('Kennung;Name;Streckentyp (1=freie Strecke 2=Bruecke);Streckenbelag (1=Asphalt 2=Beton);Breite;Laenge;Hoehe;Flughafen;Inaktiv\nA065;Tarp - Bruecke;1;2;54,663597;9,430392;48;;\nA040;Lutterbek;2;1;54,393087;10,285818;15;x;\n'));
  ok('C2 Katalog: Dezimalkomma, Brücke/Belag, Flughafen-Marke', kat.count === 2 && kat.stations.A065.belag === 2 && close(kat.stations.A065.lat, 54.663597) && kat.stations.A040.typ === 2 && kat.stations.A040.flughafen === true && kat.stations.A065.flughafen === false);
  ok('C3 Dateiname → Tag/Stunde', JSON.stringify(swsmosRunOf('swsmos_20261027160000_opendata.csv.bz2')) === JSON.stringify({ day: '2026-10-27', hh: '16', runMs }) && swsmosRunOf('swsKatalog.csv.bz2') === null);
}

// ── D: switch ───────────────────────────────────────────────────────────────
{
  ok('D1 ROAD_VS_LIVE aus (E-VS-2); ?roadvs=1 zeigt, Query schlägt Speicher, Speicher schlägt Vorgabe', ROAD_VS_LIVE === false && roadVsFlagFrom('', null) === false && roadVsFlagFrom('?roadvs=1', null) === true && roadVsFlagFrom('?roadvs=0', '1') === false && roadVsFlagFrom('', '1') === true);
}

// ── E: health R8 ────────────────────────────────────────────────────────────
{
  ok('E1 R8-Grenze = Basis − Toleranz des Vertrags', ROAD_HEALTH.groupsOkMin === ROAD_SLOT_BASELINE - ROAD_SLOT_TOLERANCE, `${ROAD_HEALTH.groupsOkMin} = ${ROAD_SLOT_BASELINE} − ${ROAD_SLOT_TOLERANCE}`);
  const s = { schema: 1, product: 'road-status', updatedAt: '2026-10-27T17:09:00Z', killSwitch: false, lastSlot: '2610271645', lastPublishedSlot: '2610271645', catalog: { state: 'ok' }, recent: [{ slot: '2610271645', publish: true, derivedAt: '2026-10-27T16:57:00Z' }],
    groups: Object.fromEntries([...Array.from({ length: 22 }, (_, i) => [`G${i}`, { state: 'ok', ageMin: 1, stations: 5 }]), ['LH-LH', { state: 'missing', ageMin: null, stations: 0 }], ['WW-SO', { state: 'missing', ageMin: null, stations: 0 }]]) };
  const r8 = checkRoadStatus(s, { nowMs: Date.parse('2026-10-27T17:10:00Z') }).find((r) => r.id === 'R8 GMA-Reihen');
  ok('E2 Live-Form vom 27.10. (22 ok, LH-LH/WW-SO fehlen) ⇒ grün und benannt', r8?.pass === true && /LH-LH missing/.test(r8.detail) && /WW-SO missing/.test(r8.detail), r8?.detail);
}

// ── F: producer parts ───────────────────────────────────────────────────────
{
  ok('F1 Template-Prüfer: Momentanwert mit PDT 8 rot; Mittel 4.8/0/seit Start grün; Akkumulation mit Prozess 0 rot', /statistisch/.test(templateProblem('t2m', { productTemplate: 8, statProcess: 0, forecastTime: 0 }) ?? '') && templateProblem('lwnet', { productTemplate: 8, statProcess: 0, forecastTime: 0 }) === null && /Akkumulation/.test(templateProblem('frz', { productTemplate: 8, statProcess: 0, forecastTime: 0 }) ?? '') && /Modellstart/.test(templateProblem('swdir', { productTemplate: 8, statProcess: 0, forecastTime: 60 }) ?? '') && templateProblem('tg', { productTemplate: 0 }) === null);
  const f = { values: Float32Array.from([280.15, NaN, 0.001]) };
  const s = sampleAt(f, [0, 1, 2, 0], ROAD_VS_FIELDS.t2m);
  ok('F2 Abtastung wandelt K → °C, Bitmap-Lücke bleibt NaN, Zelle darf mehrfach vorkommen', close(s[0], 7, 1e-3) && Number.isNaN(s[1]) && close(s[3], 7, 1e-3) && close(sampleAt(f, [2], ROAD_VS_FIELDS.prr)[0], 3.6, 1e-3), `${s[0]}`);
  const idx = nextIndex({ runs: [{ run: '2026102709' }, { run: '2026102706' }, { run: '2026102703' }] }, { run: '2026102712', points: 1 }, 0);
  ok('F3 Zeiger: neuester zuerst, höchstens drei Läufe, Duplikat ersetzt', idx.runs.map((r) => r.run).join() === '2026102712,2026102709,2026102706' && nextIndex(idx, { run: '2026102712', points: 2 }, 0).runs[0].points === 2);
  const doc = { schema: 1, product: 'road-vs-forcing', run: '2026102712', runMs: Date.UTC(2026, 9, 27, 12), builtAt: 'x', model: 'icon-d2', steps: ROAD_VS_STEPS, stepH: 1, conv: { avg: 'interval', acc: 'interval', eps: 0.95 }, ruc: null, cells: 'a', missing: {}, outOfRange: {}, source: 'x', points: [{ id: 'p', cell: 1, dKm: 0.1, v: { tg: new Array(ROAD_VS_STEPS).fill(null) } }] };
  const back = JSON.parse(gunzipSync(gzipSync(JSON.stringify(doc))).toString('utf8'));
  ok('F4 gz-Rundlauf der Produktdatei besteht den Prüfer', roadVsForcingProblems(back).length === 0 && back.points[0].v.tg.length === ROAD_VS_STEPS);
}

// ── G: site features (AW-6.2.2) ─────────────────────────────────────────────
{
  const flat = new Array(360).fill(0);
  ok('G1 SVF: freier Horizont 1; 30° rundum = 0,5; 90° = 0', svfOf(flat) === 1 && close(svfOf(new Array(360).fill(30)), 0.5, 1e-3) && svfOf(new Array(16).fill(90)) === 0);
  const hz = new Array(360).fill(0).map((_, az) => (az === 90 ? 200 : 0));
  ok('G2 horizonAt: linear zwischen 1°-Stützen, 0,1°-Skala, Umlauf bei 360', horizonAt(hz, 90) === 20 && close(horizonAt(hz, 89.5), 10) && horizonAt(hz, 450) === 20 && horizonAt(hz, 0) === 0);
  const h8 = [0, 10, 20, 10, 0, 0, 0, 0];
  const h360 = horizon8to360(h8);
  ok('G3 8 → 360 Richtungen: Stützen exakt, dazwischen linear', h360[45] === 10 && h360[90] === 20 && close(h360[67.5 | 0], 10 + 22 * (10 / 45), 1e-9) && h360[359] > 0 === false);
  ok('G4 Horizontwinkel: 100 m Hügel in 1 km ≈ 5,7°; Erdkrümmung senkt 0 m in 5 km unter 0', close(horizonAngleDeg(100, 1000), 5.71, 0.02) && horizonAngleDeg(0, 5000) < 0 && horizonAngleDeg(0, 5000) > -0.1);
  ok('G5 Geländeklasse aus TPI/Hang; ohne Werte unbekannt', terrainClassOf(-20, 1) === 'tal' && terrainClassOf(20, 1) === 'kuppe' && terrainClassOf(0, 7) === 'hang' && terrainClassOf(0, 1) === 'eben' && terrainClassOf(null, null) === 'unbekannt');
  const r = curveRadiusM([8, 50], [8.01, 50.0001], [8.02, 50]);
  ok('G6 Kurvenradius aus drei Punkten: flacher Bogen ≈ 23 km, Gerade ⇒ null', r != null && r > 20000 && r < 26000 && curveRadiusM([8, 50], [8.01, 50], [8.02, 50]) === null, `${r}`);
  const nh = nearHorizon((lat, lon) => (lon > 8.0045 ? 150 : 100), 50, 8, { nearKm: 1, stepM: 30 });
  ok('G7 Nahhorizont: 50-m-Stufe 320 m östlich ⇒ Osten ≈ 8,9°, Westen 0°, z0 vom Punkt', nh && close(nh.hz[90], Math.atan2(50, 330) * 180 / Math.PI, 0.6) && nh.hz[270] === 0 && nh.z0 === 100 && nearHorizon(() => NaN, 50, 8) === null, `${nh?.hz[90].toFixed(2)}`);
  const segs = [{ id: 'S1', points: ['a1@0'], stations: ['X1'], near: ['X2'] }, { id: 'S2', points: [], stations: ['X2'], near: [] }];
  const si = segmentIndex(segs);
  ok('G8 Abschnittsindex: Achspunkt, eigene Station vor „nahe"', si.byPoint.get('a1@0').id === 'S1' && si.byStation.get('X1').id === 'S1' && si.byStation.get('X2').id === 'S2');
  const good = { schema: 1, product: 'road-vs-site', site: { p: { hz: new Array(360).fill(12), svf: 0.98, bridge: false, surface: 'asphalt', geom: 'standard', widthM: 7.5 } } };
  ok('G9 Prüfer: gute Datei ohne Befund; 359 Werte, svf 1,2, Belag „gravel" rot', roadVsSiteProblems(good).length === 0 && roadVsSiteProblems({ ...good, site: { p: { ...good.site.p, hz: new Array(359).fill(1) } } }).length === 1 && roadVsSiteProblems({ ...good, site: { p: { ...good.site.p, svf: 1.2 } } }).length === 1 && roadVsSiteProblems({ ...good, site: { p: { ...good.site.p, surface: 'gravel' } } }).length === 1);
  // GLO-30 float predictor: a synthetic tile row through deflate + predictor 3 must decode to the floats it encodes.
  const tw = 4, th = 1, vals = Float32Array.from([100.5, 101.25, 99, 250]);
  const be = Buffer.alloc(tw * 4); vals.forEach((v, i) => be.writeFloatBE(v, i * 4));
  const planes = Buffer.alloc(tw * 4); for (let x = 0; x < tw; x++) for (let b = 0; b < 4; b++) planes[b * tw + x] = be[x * 4 + b];
  const delta = Buffer.from(planes); for (let i = tw * 4 - 1; i > 0; i--) delta[i] = (planes[i] - planes[i - 1]) & 0xff;
  const dec = decodeTile(deflateSync(delta), { tw, th, pred: 3 });
  ok('G10 GLO-30: Deflate + Float-Prädiktor 3 (Byte-Ebenen, MSB zuerst) dekodiert rund', Array.from(dec).every((v, i) => v === vals[i]), Array.from(dec).join(','));
  ok('G11 GLO-30 Kachelname', glo30TileName(50, 8).endsWith('/Copernicus_DSM_COG_10_N50_00_E008_00_DEM/Copernicus_DSM_COG_10_N50_00_E008_00_DEM.tif') && /S01_00_W010/.test(glo30TileName(-1, -10)));
}

// ── H: the core (AW-6.2.3) ──────────────────────────────────────────────────
{
  ok(`H1 Stabilität: Δt ${VS_DT_S} s ≤ ρc·Δz²/(2λ) = ${VS_DT_LIMIT_S.toFixed(1)} s für beide Säulen und beide Beläge`, VS_DT_S <= VS_DT_LIMIT_S && VS_DT_LIMIT_S < 200);
  const col = makeColumn(VS_NODE_DEPTH_M, (d) => roadMaterialAt(d, 'asphalt'), VS_NODE_DEPTH_M.map((_, i) => 5 + 3 * Math.sin(i)));
  const h0 = columnHeatJ(col);
  for (let i = 0; i < 2000; i++) stepColumn(col, 0, VS_DT_S, null);
  const h1 = columnHeatJ(col);
  const spread = Math.max(...col.T) - Math.min(...col.T);
  const inside = col.T.every((t) => t >= 2 && t <= 8);
  for (let i = 0; i < 120; i++) stepColumn(col, 100, VS_DT_S, null);
  const h2 = columnHeatJ(col);
  ok('H2 Energieerhaltung: isolierte Säule hält ihren Wärmeinhalt (2 000 Schritte); 100 W/m² × 1 h = +360 kJ/m²', Math.abs(h1 - h0) < 1e-6 * Math.abs(h0) + 1e-3 && close(h2 - h1, 360_000, 1e-3), `${(h1 - h0).toExponential(2)} J/m², ${(h2 - h1).toFixed(1)}`);
  ok('H2b Diffusion glättet: Profilspanne nach 2 000 isolierten Schritten kleiner als am Anfang (5,97 K), kein Wert außerhalb 2 … 8 °C', spread < 5.97 && inside, `${spread.toFixed(2)} K`);

  const site = { lat: 50, lon: 8.5, svf: 1, hz: null, bridge: true, surface: 'asphalt' };
  const night = (ms) => ({ validMs: ms, ta: 0, td: -3, ff: 1, pHpa: 1000, swDir: 0, swDif: 0, lwDown: 230, rain: 0, snow: 0, frz: 0 });
  let st = initState(Date.UTC(2026, 0, 15, 18), 2, 'ta', site);
  const tsSeries = [], tbSeries = [];
  for (let h = 1; h <= 8; h++) { const r = integrateHour(st, site, h === 1 ? null : night(Date.UTC(2026, 0, 15, 18 + h - 1)), night(Date.UTC(2026, 0, 15, 18 + h))); tsSeries.push(r.ts); tbSeries.push(r.tsBridge); }
  ok('H3 Klarnacht (Ta 0 °C, LW↓ 230, Wind 1 m/s): Fahrbahn kühlt monoton unter die Luft, 1–8 K in 8 h', tsSeries.every((t, i) => i === 0 || t <= tsSeries[i - 1] + 1e-9) && tsSeries[7] < 0 && tsSeries[7] > -8, tsSeries.map((t) => t.toFixed(2)).join(' '));
  ok('H4 Brücke kälter als die Strecke bei klarem Himmel (unterer Rand = Luft statt 10 °C Boden)', tbSeries[7] < tsSeries[7] && tbSeries[7] > -12, `${tbSeries[7].toFixed(2)} < ${tsSeries[7].toFixed(2)}`);
  ok('H4b Kaltstart-Kennzeichen bis 7 Tage; danach nicht mehr', st.ageH === 8 && integrateHour(st, site, null, night(Date.UTC(2026, 0, 16, 3))).coldStart === true && (st.ageH = VS_SPINUP_H, integrateHour(st, site, null, night(Date.UTC(2026, 0, 16, 4))).coldStart === false));

  const noon = (ms) => ({ validMs: ms, ta: 10, td: 2, ff: 2, pHpa: 1000, swDir: 500, swDif: 120, lwDown: 300, rain: 0, snow: 0, frz: 0 });
  const siteFlat = { ...site, bridge: false };
  let s2 = initState(Date.UTC(2026, 3, 20, 9), 8, 'ta', siteFlat);
  let last = null;
  for (let h = 10; h <= 13; h++) last = integrateHour(s2, siteFlat, null, noon(Date.UTC(2026, 3, 20, h)));
  ok('H5 Sonne mittags (620 W/m² global, Ta 10 °C): Fahrbahn wärmer als die Luft nach 4 h, kurzwellige Bilanz > 400 W/m²', last.ts > 12 && last.flux.swNet > 400 && last.flux.shadeH === 0, `${last.ts.toFixed(1)} °C, swNet ${last.flux.swNet.toFixed(0)}`);
  const siteWall = { ...siteFlat, hz: new Array(360).fill(600) };
  let s3 = initState(Date.UTC(2026, 3, 20, 9), 8, 'ta', siteWall);
  let lastW = null;
  for (let h = 10; h <= 13; h++) lastW = integrateHour(s3, siteWall, null, noon(Date.UTC(2026, 3, 20, h)));
  ok('H7 Horizont 60° rundum im April (Sonne ≈ 50°): Direktstrahlung weg, Stunde ganz abgeschattet, Fahrbahn kühler', lastW.flux.shadeH > 0.99 && lastW.flux.swNet < 0.4 * last.flux.swNet && lastW.ts < last.ts, `swNet ${lastW.flux.swNet.toFixed(0)} gegen ${last.flux.swNet.toFixed(0)}`);

  // Deficit ≈ 60 W/m² (LW −29, H −4, LE ≈ −30, traffic +5): 2 mm of water (film + pores) carry the surface ≈ 3 h at 0 °C.
  const cold = (ms) => ({ validMs: ms, ta: -2, td: -2.5, ff: 1, pHpa: 1000, swDir: 0, swDif: 0, lwDown: 285, rain: 0, snow: 0, frz: 0 });
  let s4 = initState(Date.UTC(2026, 0, 10, 0), 0.05, 'ta', siteFlat);
  s4.stores.water = 1.0; s4.stores.pore = 1.0;
  const r4 = integrateHour(s4, siteFlat, null, cold(Date.UTC(2026, 0, 10, 1)));
  let s5 = initState(Date.UTC(2026, 0, 10, 0), 0.05, 'ta', siteFlat);
  const r5 = integrateHour(s5, siteFlat, null, cold(Date.UTC(2026, 0, 10, 1)));
  ok('H6 Latentwärme-Halt: 2 mm Wasser bei 0 °C und ≈ 60 W/m² Abkühlung ⇒ Eis entsteht, Ts bleibt am Gefrierpunkt, Wasser bleibt übrig; ohne Wasser fällt Ts in der Stunde unter −0,1 °C', r4.phaseMm > 0.3 && r4.stores.ice > 0.05 && Math.abs(r4.ts) <= 0.15 && r4.stores.water + r4.stores.pore > 0.3 && r5.ts < -0.1 && r5.phaseMm === 0, `gefroren ${r4.phaseMm} mm, Eis ${r4.stores.ice.toFixed(2)} mm, Rest ${(r4.stores.water + r4.stores.pore).toFixed(2)}, Ts ${r4.ts} gegen ${r5.ts}`);
  // Strong cooling (−150 W/m²) exhausts 0,8 mm within the hour: the surface then falls — the hold is not a thermostat.
  const harsh = (ms) => ({ validMs: ms, ta: -5, td: -8, ff: 2, pHpa: 1000, swDir: 0, swDif: 0, lwDown: 200, rain: 0, snow: 0, frz: 0 });
  let s6 = initState(Date.UTC(2026, 0, 10, 0), 0.05, 'ta', siteFlat); s6.stores.water = 0.8;
  const r6 = integrateHour(s6, siteFlat, null, harsh(Date.UTC(2026, 0, 10, 1)));
  ok('H6b bei −150 W/m² ist das Wasser in der Stunde gefroren, danach kühlt die Fahrbahn weiter', r6.stores.water + r6.stores.pore < 0.05 && r6.ts < -2 && r6.phaseMm > 0.3, `Ts ${r6.ts}, gefroren ${r6.phaseMm}`);

  const ex1 = sensibleHeat(3, 5, 0), ex2 = sensibleHeat(3, 0, 5), ex3 = sensibleHeat(8, 5, 0);
  ok('H8 Monin-Obukhov: warme Luft ⇒ H > 0 und stabil (ζ > 0); kalte Luft ⇒ H < 0, labil; mehr Wind ⇒ mehr Fluss', ex1.H > 0 && ex1.zeta > 0 && ex2.H < 0 && ex2.zeta < 0 && ex3.H > ex1.H && Number.isFinite(ex1.cH) && ex1.cH > 0.001 && ex1.cH < 0.05, `H ${ex1.H.toFixed(1)} ζ ${ex1.zeta.toFixed(3)} cH ${ex1.cH.toFixed(4)}`);
  ok('H9 Zustand: Form und Prüfer (NaN, falsche Länge rot)', vsStateProblems(st).length === 0 && vsStateProblems({ ...st, T: st.T.slice(1) }).includes('T') && vsStateProblems({ ...st, T: st.T.map((t, i) => (i === 2 ? NaN : t)) }).includes('T') && vsStateProblems({ ...st, stores: { ...st.stores, ice: -1 } }).includes('stores'));
  const d1 = deepSoilC(Date.UTC(2026, 8, 27)), d2 = deepSoilC(Date.UTC(2026, 2, 28));
  ok('H10 Tiefentemperatur: Maximum Ende September, Minimum Ende März, innerhalb Mittel ± Amplitude', close(d1, VS_DEEP_SOIL.meanC + VS_DEEP_SOIL.ampK, 0.01) && close(d2, VS_DEEP_SOIL.meanC - VS_DEEP_SOIL.ampK, 0.01));
  ok('H11 Albedo: Schnee 0,6; 0,75 mm Eis ⇒ 0,35; nass 0,08; trocken 0,10', albedoOf({ ...emptyStores(), snow: 1 }) === 0.6 && close(albedoOf({ ...emptyStores(), ice: 0.75 }), 0.35) && albedoOf({ ...emptyStores(), water: 0.2 }) === 0.08 && albedoOf(emptyStores()) === 0.1);
}

// ── I: coupling and site correction (AW-6.2.4) ─────────────────────────────
{
  const siteFlat = { lat: 50, lon: 8.5, svf: 1, hz: null, bridge: false, surface: 'asphalt' };
  const nightF = (ms) => ({ validMs: ms, ta: 1, td: -1, ff: 2, pHpa: 1000, swDir: 0, swDif: 0, lwDown: 260, rain: 0, snow: 0, frz: 0 });
  const dayF = (ms) => ({ validMs: ms, ta: 8, td: 1, ff: 2, pHpa: 1000, swDir: 300, swDif: 100, lwDown: 300, rain: 0, snow: 0, frz: 0 });
  const t0 = Date.UTC(2026, 0, 20, 0);
  const start = initState(t0, 3, 'ta', siteFlat);
  const win = [1, 2, 3].map((h) => nightF(t0 + h * 3_600_000));
  const dayWin = [10, 11, 12].map((h) => dayF(Date.UTC(2026, 0, 20, h)));
  ok('I1 Modus: Nachtfenster ⇒ langwellig, Tagfenster ⇒ kurzwellig', coupleModeOf(win) === 'lw' && coupleModeOf(dayWin) === 'sw');
  // Truth produced with C = 1.6 on the longwave; the fit must find it back within the tolerance.
  const truth = tsWithFactor(start, siteFlat, null, win, 'lw', 1.6);
  const fit = fitCouplingFactor({ start, site: siteFlat, window: win, obsTs: truth });
  ok('I2 Bisektion findet C_R = 1,6 zurück (|ΔTs| ≤ 0,1 K), Startzustand unverändert', fit.converged && Math.abs(fit.c - 1.6) < 0.08 && Math.abs(fit.residualK) <= 0.1 && start.T[0] === initState(t0, 3, 'ta', siteFlat).T[0] && start.ageH === 0, `C ${fit.c}, Rest ${fit.residualK}, ${fit.iterations} Iterationen`);
  const dayStart = initState(Date.UTC(2026, 0, 20, 9), 5, 'ta', siteFlat);
  const truthSw = tsWithFactor(dayStart, siteFlat, null, dayWin, 'sw', 0.6);
  const fitSw = fitCouplingFactor({ start: dayStart, site: siteFlat, window: dayWin, obsTs: truthSw });
  ok('I2b kurzwellig: C_R = 0,6 (Schatten/Dunst) zurückgefunden', fitSw.mode === 'sw' && fitSw.converged && Math.abs(fitSw.c - 0.6) < 0.08, `C ${fitSw.c}`);
  const tooWarm = fitCouplingFactor({ start, site: siteFlat, window: win, obsTs: truth - 25 });
  ok('I2c Messung 25 K unter jedem erreichbaren Wert ⇒ Grenze 0,01, nicht konvergiert, benannt', !tooWarm.converged && tooWarm.c === 0.01 && tooWarm.residualK > 0);
  ok('I3 Abklingen C(t) = 1 + (C_R − 1)·e^(−t/4 h): t 0 ⇒ C_R, t 4 h ⇒ 1 + 0,368·(C_R − 1), t → ∞ ⇒ 1', couplingFactorAt(1.6, 0) === 1.6 && close(couplingFactorAt(1.6, 4), 1 + 0.6 * Math.exp(-1), 1e-9) && close(couplingFactorAt(0.5, 100), 1, 1e-9));
  ok('I4 Wetterklassen: nass vor windig vor klar; bewölkt sonst', weatherClassOf({ ff: 7, clct: 10, rain: 0.2, snow: 0, frz: 0 }) === 'nass' && weatherClassOf({ ff: 7, clct: 10, rain: 0, snow: 0, frz: 0 }) === 'windig' && weatherClassOf({ ff: 1, clct: 10, rain: 0, snow: 0, frz: 0 }) === 'klar' && weatherClassOf({ ff: 1, clct: 80, rain: 0, snow: 0, frz: 0 }) === 'bewoelkt' && weatherClassOf({ ff: 1, clct: 10, rain: 0, snow: 0, frz: 0, filmMm: 0.2 }) === 'nass');
  const pairs = [];
  for (let d = 0; d < 10; d++) { pairs.push({ station: 'S1', validMs: Date.UTC(2026, 0, 1 + d, 3), cls: 'klar', residualK: 1.0 + (d % 2 ? 0.2 : -0.2) }); pairs.push({ station: 'S2', validMs: Date.UTC(2026, 0, 1 + d, 3), cls: 'klar', residualK: -0.5 }); }
  for (let d = 0; d < 3; d++) pairs.push({ station: 'S3', validMs: Date.UTC(2026, 0, 1 + d, 3), cls: 'klar', residualK: 5 });
  const tab = learnResiduals(pairs, '2026-01-11T00:00:00Z');
  const c1 = stationCorrection(tab, 'S1', Date.UTC(2026, 0, 12, 3), 'klar');
  ok('I5 Residuentabelle: Zelle 3 UTC/klar mit n 10 gelernt, geschrumpft 1,0·10/20 = 0,5; S3 mit n 3 < 5 fehlt; andere Stunde 0', tab.stations.S1['3:klar'].n === 10 && close(tab.stations.S1['3:klar'].mean, 1.0, 1e-9) && c1.k === 0.5 && tab.stations.S3 === undefined && stationCorrection(tab, 'S1', Date.UTC(2026, 0, 12, 4), 'klar').k === 0 && tab.window.days === 9 && Number.isFinite(tab.sigma.klar), JSON.stringify(c1));
  const me = { id: 'a1@5', lat: 50.0, lon: 8.5, h: 120, terrain: 'eben' };
  const gma = [{ id: 'S1', lat: 50.05, lon: 8.5, h: 130, terrain: 'eben' }, { id: 'S2', lat: 50.1, lon: 8.5, h: 140, terrain: 'eben' }, { id: 'S9', lat: 50.01, lon: 8.5, h: 450, terrain: 'eben' }, { id: 'S8', lat: 50.01, lon: 8.51, h: 120, terrain: 'tal' }];
  const nb = neighbourCorrection(tab, me, gma, Date.UTC(2026, 0, 12, 3), 'klar');
  ok('I6 Nachbar-Übertrag: Residuen von S1 (0,5, 5,6 km) und S2 (−0,25, 11 km) mit 1/d gewichtet; anderes Höhenband und andere Geländeklasse ausgeschlossen', nb && nb.n === 2 && nb.from.join() === 'S1,S2' && close(nb.k, (0.5 / 5.56 + -0.25 / 11.12) / (1 / 5.56 + 1 / 11.12), 0.02) && neighbourCorrection(tab, me, gma, Date.UTC(2026, 0, 12, 4), 'klar') === null && neighbourCorrection(null, me, gma, 0, 'klar') === null, JSON.stringify(nb));
  ok('I7 σ: Klassen-σ der Tabelle, in klarer Nacht × 1,5; ohne Tabelle der Rückfallwert', close(correctedSigma(tab, 'klar', Date.UTC(2026, 0, 12, 3), 2), tab.sigma.klar * 1.5, 0.02) && correctedSigma(tab, 'klar', Date.UTC(2026, 0, 12, 12), 2) === tab.sigma.klar && correctedSigma(null, 'nass', 0, 2) === 2);
}

// ── J: stores, condition, film, Bourgouin (AW-6.2.5) ───────────────────────
{
  const g = gallawayFilm(50, 58.6, 2.52, 0, 0.4);
  ok('J1 Gallaway-Testfall des Startprompts: T_XD 0,4 / L 58,6 / I 50 / S 2,52 ⇒ 3,256 mm', g.lengthM === 58.6 && g.slopePct === 2.52 && close(g.filmMm, 3.256, 0.001) && !g.capped, `${g.filmMm} mm, L ${g.lengthM}, S ${g.slopePct}`);
  const gl = gallawayFilm(50, 7.5, 2.5, 4);
  ok('J1c Längsneigung 4 % verlängert den Abflussweg (L = B·√(1 + (g/q)²) = 14,2 m) und steilt S auf 4,72 %', close(gl.lengthM, 7.5 * Math.sqrt(1 + (4 / 2.5) ** 2), 0.01) && close(gl.slopePct, Math.sqrt(2.5 ** 2 + 16), 0.01));
  const g2 = gallawayFilm(10, 7.5, 2.5), g3 = gallawayFilm(80, 7.5, 2.5), g0 = gallawayFilm(0, 7.5, 2.5);
  ok('J1b RQ 31 bei 10 mm/h ≈ 0,1 mm; 80 mm/h gekappt und gekennzeichnet; 0 mm/h ⇒ 0', g2.filmMm > 0.05 && g2.filmMm < 0.2 && g3.capped && g3.filmMm === gallawayFilm(50.8, 7.5, 2.5).filmMm && g0.filmMm === 0 && !g0.capped, `${g2.filmMm}`);
  ok('J2 Aquaplaning-Geschwindigkeit: 1 mm ⇒ 97 km/h, 0,5 mm ⇒ 116, ≥ 2,4 mm und 0 ⇒ null', aquaplaningKmh(1) === 97 && aquaplaningKmh(0.5) === 116 && aquaplaningKmh(2.4) === null && aquaplaningKmh(0) === null);
  ok('J3 Frostpunkt unter dem Taupunkt (−5 °C Taupunkt ⇒ ≈ −4,5 °C Frostpunkt, über Eis höher als über Wasser)', frostPointOfDew(-5) > -5 && frostPointOfDew(-5) < -4 && close(frostPointOfDew(0), 0, 1e-6));
  let kh = 0; for (let h = 0; h < 3; h++) kh = rimeIntegralUpdate(kh, -2, -2.5);
  ok('J4 Reif-Integral: 3 h bei T_frost − Ts = 0,5 K ⇒ 1,5 K·h (Auslösung ≥ 1); 2 K darüber setzt zurück; ohne Frostpunkt unverändert', close(kh, 1.5) && rimeIntegralUpdate(kh, -2, 0.5) === 0 && rimeIntegralUpdate(kh, null, 5) === kh && rimeIntegralUpdate(kh, -2, -1.5) === kh);
  const prof = (pairs) => pairs.map(([zM, tC]) => ({ zM, tC }));
  const warmNose = prof([[0, -2], [300, -1], [600, 2], [1200, 3], [1800, -1], [3000, -8]]);
  const a1 = bourgouinAreas(warmNose);
  ok('J5 Bourgouin: warme Nase über kalter Bodenschicht ⇒ PA > 0 und NA > 0; Typ gefrierender Regen bei kleinem NA', a1 && a1.pa > 40 && a1.na > 0 && a1.na < 46 + 0.66 * a1.pa && !a1.surfaceWarm && bourgouinType(a1, -2) === 'gefrierender-regen' && bourgouinType(a1, 2) === 'regen', JSON.stringify(a1));
  const deepCold = prof([[0, -6], [500, -5], [1000, -4], [1500, 2], [2000, 1], [2500, -5]]);
  const a2 = bourgouinAreas(deepCold);
  ok('J5b tiefe kalte Schicht unter der Nase ⇒ Eiskörner; reine Kaltluft ⇒ Schnee; warmer Boden ⇒ Regen', a2 && bourgouinType(a2, -6) === 'eiskoerner' && bourgouinType(bourgouinAreas(prof([[0, -3], [1000, -6], [2000, -10]])), -3) === 'schnee' && bourgouinType(bourgouinAreas(prof([[0, 4], [500, 2], [1000, -1], [2000, -6]])), 4) === 'regen' && bourgouinType(null, 0) === 'unbekannt', JSON.stringify(a2));
  const st = (o = {}) => ({ water: 0, pore: 0, snow: 0, ice: 0, frost: 0, ...o });
  const base = { ts: 2, stores: st(), rain: 0, snow: 0, frz: 0, rimeKh: 0 };
  const c = (o) => classifyRoad({ ...base, ...o });
  ok('J6 Klassen in Prompt-Reihenfolge: Glatteis (Regen auf Ts ≤ 0) schlägt Schnee; Schneeglätte; Matsch; Eis; Reif; nass/feucht/trocken',
    c({ ts: -1, rain: 0.5, stores: st({ snow: 5 }) }).condition === 'glatteis' && c({ ts: -1, stores: st({ snow: 1 }) }).condition === 'schneeglaette' && c({ ts: 1, stores: st({ snow: 1, water: 0.1 }) }).condition === 'schneematsch'
    && c({ ts: -1, stores: st({ ice: 0.1 }) }).condition === 'eis' && c({ ts: -1, stores: st({ water: 0.05 }) }).condition === 'eis' && c({ ts: -1, stores: st({ frost: 0.05 }), rimeKh: 1.2 }).condition === 'reifglaette' && c({ ts: -1, stores: st({ frost: 0.05 }), rimeKh: 0.5 }).condition === 'trocken'
    && c({ stores: st({ water: 0.1 }) }).condition === 'nass' && c({ stores: st({ water: 0.02 }) }).condition === 'feucht' && c({ stores: st({ water: 0.005 }) }).condition === 'trocken');
  ok('J6b Bourgouin „gefrierender Regen" bei Ts ≤ 0 ⇒ Glatteis auch ohne Regenrate im Antrieb; Griffklassen', c({ ts: -0.5, precipType: 'gefrierender-regen' }).condition === 'glatteis' && gripOf('glatteis') === 'sehr-glatt' && gripOf('reifglaette') === 'glatt' && gripOf('nass') === 'eingeschraenkt' && gripOf('trocken') === 'griffig' && gripOf('feucht', 0.015) === 'griffig' && gripOf('feucht', 0.025) === 'eingeschraenkt');
  const r1 = c({ ts: -1, stores: st({ ice: 0.1 }) }), r2 = c({ ts: 0.2, stores: st({ water: 0.02 }) }), r3 = c({ ts: 5, stores: st() });
  ok('J7 Glätte-Wort: Regel 1–5 ⇒ 1; feucht bei Ts ≤ 0,5 ⇒ 0,5; trocken warm ⇒ 0; „möglich" ⇒ 0,5', slipperinessP(r1, { ...base, ts: -1 }) === 1 && slipperinessP(r2, { ...base, ts: 0.2 }) === 0.5 && slipperinessP(r3, { ...base, ts: 5 }) === 0 && slipperinessP(c({ ts: -0.5, precipType: 'gefrierender-regen-moeglich' }), { ...base, ts: -0.5, precipType: 'gefrierender-regen-moeglich' }) === 0.5);
  ok('J8 Szenario-Wort v1 (E-VS-3)', VS_SCENARIO === 'ungestreut' && /ohne Streuung/.test(VS_SCENARIO_TEXT));
}

// ── K: visibility (AW-6.2.6) ────────────────────────────────────────────────
{
  const fog = fogVisibilityM(200), fogThin = fogVisibilityM(20);
  ok('K1 Gultepe: 200 mg/kg Wolkenwasser (0,25 g/m³, N_d 200) ⇒ ≈ 80 m; 20 mg/kg ⇒ dichter als 1 km aber weiter; 0 ⇒ null', fog > 50 && fog < 120 && fogThin > fog && fogThin < 1000 && fogVisibilityM(0) === null && fogVisibilityM(null) === null, `${fog} / ${fogThin} m`);
  const rain = precipVisibilityM(10, 0), snow = precipVisibilityM(0, 2), none = precipVisibilityM(0, 0);
  ok('K2 Koschmieder über β: Regen 10 mm/h ⇒ 3,912/(2,24·10^0,75) ≈ 311 m; Schnee 2 mm/h ⇒ ≈ 220 m; trocken ⇒ null', close(rain, 3912 / (2.24 * Math.pow(10, 0.75)), 1) && close(snow, 3912 / (10.36 * Math.pow(2, 0.7776)), 1) && none === null, `${rain} / ${snow}`);
  ok('K3 Feuchte-Dunst (`set`): Spread ≥ 2 K ⇒ 20 km, 0 K ⇒ 1 km, 1 K ⇒ 10,5 km', hazeVisibilityM(5, 2) === 20000 && hazeVisibilityM(5, 5) === 1000 && hazeVisibilityM(5, 4) === 10500 && hazeVisibilityM(null, 4) === null);
  const d = diagnoseVisibilityM({ qcMgKg: 200, rain: 10, snow: 0, tC: 3, tdC: 3 });
  ok('K4 Diagnose = Minimum der drei, nennt die begrenzende Größe', d.vM === fog && d.limiting === 'nebel' && diagnoseVisibilityM({ qcMgKg: null, rain: 0, snow: 0, tC: null, tdC: null }).vM === null);
  const p1 = visibilityProbabilities({ diag: 100, mos: null, ruc: null }), p2 = visibilityProbabilities({ diag: 20000, mos: 20000, ruc: null }), p3 = visibilityProbabilities({ diag: 1000, mos: null, ruc: null });
  ok('K5 Wahrscheinlichkeiten (unkalibriert): 100 m ⇒ P(<1000) ≈ 1, P(<50) < 0,5; 20 km ⇒ alle ≈ 0; genau an der Schwelle 0,5; ohne Quelle null', p1[0] > 0.95 && p1[3] < 0.5 && p2.every((x) => x < 0.01) && p3[0] === 0.5 && visibilityProbabilities({ diag: null, mos: null, ruc: null }) === null && VS_VIS_DEFAULT_MODEL.calibrated === false, JSON.stringify(p1));
  ok('K5b fehlende Quellen werden gleich stark gewichtet (eine Quelle = drei gleiche Quellen)', JSON.stringify(visibilityProbabilities({ diag: 300, mos: null, ruc: null })) === JSON.stringify(visibilityProbabilities({ diag: 300, mos: 300, ruc: 300 })));
  ok('K6 Stufe 3 (< 50 m) nur aus Messung: Prognose-P(<50) gedeckelt auf 0,5', capForecastProbabilities([1, 1, 1, 0.9])[3] === 0.5 && capForecastProbabilities(null) === null);
  const me = { id: 'a1@5', lat: 50, lon: 8.5, h: 120, terrain: 'eben' };
  const obs = [{ id: 'S1', lat: 50.05, lon: 8.5, h: 130, terrain: 'eben', visM: 400 }, { id: 'S2', lat: 50.02, lon: 8.5, h: 300, terrain: 'eben', visM: 100 }, { id: 'S3', lat: 50.02, lon: 8.52, h: 125, terrain: 'tal', visM: 50 }];
  const now = visibilityNow(me, obs);
  ok('K7 Sicht jetzt: eigener Wert zuerst; sonst nächster Nachbar gleicher Geländeklasse mit |Δz| ≤ 100 m (S2 zu hoch, S3 Tal)', now && now.from === 'S1' && now.visM === 400 && visibilityNow({ ...me, id: 'S3' }, obs).from === 'S3' && visibilityNow({ ...me, h: null }, obs) === null, JSON.stringify(now));
  // Calibration: synthetic truth V_obs = diag · noise ⇒ the fit must give negative weights on diag and a smaller Brier than the default.
  const pairs = [];
  for (let i = 0; i < 400; i++) { const v = Math.exp(Math.log(30) + (Math.log(20000) - Math.log(30)) * ((i * 37) % 400) / 400); const noise = Math.exp(((i * 13) % 11 - 5) * 0.12); pairs.push({ sources: { diag: v, mos: i % 3 ? v * 1.3 : null, ruc: null }, observedM: v * noise }); }
  const fit = fitVisLogistic(pairs);
  const brierDefault = VS_VIS_THRESHOLDS_M.map((x) => pairs.reduce((s, p) => s + (visibilityProbabilities(p.sources)[VS_VIS_THRESHOLDS_M.indexOf(x)] - (p.observedM < x ? 1 : 0)) ** 2, 0) / pairs.length);
  ok('K8 logistische Kalibrierung: negative Gewichte auf ln(V/x), Brier nicht schlechter als das unkalibrierte Modell, Modell heißt kalibriert', fit.model.calibrated && fit.model.weights.diag.every((w) => w < 0) && fit.brier.every((b, i) => b <= brierDefault[i] + 0.01) && fit.n === 400, `Brier ${fit.brier.join('/')} gegen ${brierDefault.map((b) => b.toFixed(3)).join('/')}`);
}

// ── L: product contract, display rule, drive mapping (AW-6.2.7) ─────────────
{
  const steps = 3;
  const mk = () => Object.fromEntries(ROAD_VS_VAR_IDS.map((k) => [k, new Array(steps).fill(null)]));
  const v = mk(); v.tf[1] = -12; v.tf_src[1] = 2; v.zustand[1] = 3; v.vis_p50[1] = 50;
  const good = { schema: 1, product: 'road-vs', run: '2026102712', t0Ms: Date.UTC(2026, 9, 27, 12), issuedAt: 'x', steps, kind: 'corridor', id: 'a1', engine: { live: false }, source: 's', points: [{ id: 'a1@0', kind: 'axis', lat: 50, lon: 8, bridge: false, kaltstart: true, szenario: 'ungestreut', v }] };
  ok('L1 Produktprüfer: gute Datei; live:true, fehlende Reihe, Wert außerhalb, anderes Szenario rot', roadVsProductProblems(good).length === 0 && roadVsProductProblems({ ...good, engine: { live: true } }).some((p) => /live/.test(p)) && roadVsProductProblems({ ...good, points: [{ ...good.points[0], v: { ...v, tf: undefined } }] }).length === 1 && roadVsProductProblems({ ...good, points: [{ ...good.points[0], v: { ...v, tf: [null, 900, null] } }] }).length === 1 && roadVsProductProblems({ ...good, points: [{ ...good.points[0], szenario: 'gestreut' }] }).length === 1);
  ok('L2 Kodierung: Fahrbahn 0,1 °C, Reif 0,001 mm, Prozent ganzzahlig und geklemmt, Codes', roadVsProductDecode('tf', roadVsProductEncode('tf', -3.14)) === -3.1 && roadVsProductEncode('reif_mm', 0.0234) === 23 && roadVsProductEncode('glaette_p', 120) === 100 && roadVsProductEncode('vis_p300', 86.1) === 86 && roadVsSrcOf(1) === 'gekoppelt' && roadVsSrcOf(9) === null);
  ok('L2b Antriebs-Kodierung: −0,3 W/m² Nachtstrahlung ⇒ 0 (Toleranz), −20 ⇒ null; Feuchte 100,4 % ⇒ 100', roadVsEncode('swdir', -0.3) === 0 && roadVsEncode('swdir', -20) === null && roadVsEncode('rh2m', 100.4) === 100 && roadVsEncode('rh2m', 103) === null);
  const d1 = roadVsDisplay('gemessen'), d2 = roadVsDisplay('gekoppelt', { sensorOffSinceMs: Date.UTC(2026, 0, 1, 5, 30) }), d3 = roadVsDisplay('modelliert'), d4 = roadVsDisplay('unbekannt'), d5 = roadVsDisplay(null, { runAgeH: 1 });
  ok('L3 Anzeigeregel: gemessen → Messung; gekoppelt → „Sensor aus seit 05:30 UTC"; modelliert → Standortkorrektur/breitere Streuung; unbekannt → kein Lauf bzw. Pflichteingang fehlt', d1.word === 'gemessen' && /Sensor aus seit 05:30 UTC/.test(d2.detail) && /Standortkorrektur/.test(d3.detail) && /kein aktueller Lauf/.test(d4.detail) && /Pflichteingang/.test(d5.detail));
  const fp = { v: { t2m: [null, 50, 40], td2m: [null, 20, 10], u10: [null, 30, 0], v10: [null, 40, 0], swdir: [null, 100, 200], swdif: [null, 50, 60], lwnet: [null, -70, -60], tg: [null, 60, 50], lwdown: [null, 300, null], clct: [null, 50, 50], frz: [null, 0, 10], prr: [null, 100, 0], prs: [null, 0, 50], prg: [null, 0, 0], qc: [null, 5, 0], vis: [null, 8000, null] } };
  const t0 = Date.UTC(2026, 9, 27, 12);
  const hIcon = hourForcing(fp, null, t0, 3, 'icon');
  ok('L4 Antrieb aus ICON: Wind aus u/v, Regen = prr − frz, Schnee prs, LW↓ aus der Datei, sonst Brunt/Bolz-Rückfall; Stunde 0 leer', hIcon[0] === null && hIcon[1].ff === 5 && hIcon[1].rain === 1 && hIcon[1].lwDown === 300 && hIcon[2].lwDown > 200 && hIcon[2].lwDown < 400 && hIcon[2].snow === 0.5 && hIcon[2].frz === 0.1 && hIcon[2].rain === 0 && hIcon[1].vis === 8000 && hIcon[1].mos === null, `${hIcon[2].lwDown?.toFixed(0)}`);
  const fu = { t0Ms: t0, t: [1, 2, 3], td: [0, 1, 2], ff: [7, 7, 7], rr: [0, 2, 2], sn: [0, 25, 100], vs: [null, 900, 500] };
  const hF = hourForcing(fp, fu, t0, 3, 'fusion');
  ok('L5 Antrieb mit Fusion: Luft/Taupunkt/Wind/Niederschlag aus der Streckenprognose (Regen 2·0,75 − frz 0 = 1,5, Schnee 0,5), Strahlung aus ICON, MOSMIX-Sicht dabei', hF[1].ta === 2 && hF[1].td === 1 && hF[1].ff === 7 && close(hF[1].rain, 1.5) && close(hF[1].snow, 0.5) && hF[1].swDir === 100 && hF[1].mos === 900 && hF[2].snow === 2 && hF[2].rain === 0);
  const fpGap = { v: { ...fp.v, swdir: [null, null, 200] } };
  ok('L6 fehlende Pflichtgröße (Direktstrahlung) ⇒ Stunde null, nie ein Ersatzwert', hourForcing(fpGap, null, t0, 3, 'icon')[1] === null && hourForcing(fpGap, null, t0, 3, 'icon')[2] !== null);
  ok('L7 σ-Vorgabe ohne Tabelle: 1 + 0,1·h, Deckel 3 K', VS_SIGMA_SET(0) === 1 && VS_SIGMA_SET(10) === 2 && VS_SIGMA_SET(40) === 3);
  const idx = nextVsIndex({ runs: [{ run: '2026102709' }, { run: '2026102706' }, { run: '2026102703' }] }, { run: '2026102712' }, 0);
  ok('L8 Produkt-Zeiger: drei Läufe, neuester zuerst, killed false', idx.runs.map((r) => r.run).join() === '2026102712,2026102709,2026102706' && idx.killed === false && idx.product === 'road-vs-index');
}

// ── M: archive thinning (AW-6.2.7) ──────────────────────────────────────────
{
  const steps = 2;
  const mkv = () => Object.fromEntries(ROAD_VS_VAR_IDS.map((k) => [k, new Array(steps).fill(null)]));
  const files = [
    { run: '2026102712', t0Ms: 1, steps, engine: { live: false }, points: [{ id: 'a1@0', kind: 'axis', lat: 50, lon: 8, bridge: false, kaltstart: true, szenario: 'ungestreut', v: mkv() }, { id: 'S1', kind: 'station', lat: 50, lon: 8, bridge: true, kaltstart: false, couple: { c: 1.2 }, szenario: 'ungestreut', v: mkv() }] },
    { run: '2026102712', t0Ms: 1, steps, engine: { live: false }, points: [{ id: 'S2', kind: 'station', lat: 51, lon: 9, bridge: false, kaltstart: true, szenario: 'ungestreut', v: mkv() }] },
  ];
  const forcing = { run: '2026102712', points: [{ id: 'S1', v: { tg: [1, 2], t2m: [3, 4], swdir: [5, 6] } }, { id: 'a1@0', v: { tg: [9, 9] } }] };
  const doc = thinRun({ run: '2026102712', files, forcing, shadow: [{ id: 'S1', residualK: 0.5 }] });
  ok('M1 Archiv-Ausdünnung: nur Stationen (2), Antrieb nur an Stationen und nur die Baseline-Felder, Schatten mitgenommen, Kopplung erhalten', Object.keys(doc.stations).join() === 'S1,S2' && Object.keys(doc.forcing.points).join() === 'S1' && Object.keys(doc.forcing.points.S1).join() === 'tg,t2m' && doc.shadow.length === 1 && doc.stations.S1.couple.c === 1.2 && doc.counts.stations === 2 && doc.engine.live === false);
  ok('M2 Archivpfad je Tag', vsArchivePath('2026102712') === '2026-10-27/2026102712.json.gz');
}

// ── N: test stand (AW-6.2.8) on a synthetic archive ─────────────────────────
{
  const t0 = Date.UTC(2026, 0, 10, 12), steps = 49;
  const series = (fill) => Object.fromEntries(ROAD_VS_VAR_IDS.map((k) => [k, new Array(steps).fill(null)])).valueOf() && Object.fromEntries(ROAD_VS_VAR_IDS.map((k) => [k, Array.from({ length: steps }, (_, h) => fill(k, h))]));
  // Six stations: model = obs + 0,5 K everywhere; station S5 is 2 K too warm (the CV must see it as the held-out error).
  const ids = ['S0', 'S1', 'S2', 'S3', 'S4', 'S5'];
  const obsRs = (id, h) => 1 - 0.1 * h + (id === 'S5' ? 0 : 0);           // cold: −3,8 … +1 over 48 h
  const modelOff = (id) => (id === 'S5' ? 2 : 0.5);
  const stations = Object.fromEntries(ids.map((id, i) => [id, { lat: 50 + i * 0.1, lon: 8, bridge: i % 2 === 0, kaltstart: false, v: series((k, h) => (k === 'tf' ? Math.round((obsRs(id, h) + modelOff(id)) * 10) : k === 'tf_src' ? (h === 2 ? 0 : 2) : k === 'zustand' ? (h >= 20 ? 3 : 0) : k === 'vis_p1000' ? (h === 2 ? 100 : 0) : k.startsWith('vis_p') ? 0 : null)) }]));
  const forcing = { run: '2026011012', points: Object.fromEntries(ids.map((id) => [id, { tg: Array.from({ length: steps }, (_, h) => Math.round((obsRs(id, h) + 1.5) * 10)), t2m: Array.from({ length: steps }, (_, h) => Math.round((obsRs(id, h) + 3) * 10)), clct: new Array(steps).fill(20), u10: new Array(steps).fill(60), v10: new Array(steps).fill(0), prr: new Array(steps).fill(0), prs: new Array(steps).fill(0), frz: new Array(steps).fill(0) }])) };
  const shadow = ids.map((id) => ({ id, validMs: t0 + 2 * 3_600_000, hObs: 2, modelTs: obsRs(id, 2) + modelOff(id), obsTs: obsRs(id, 2), residualK: modelOff(id), cls: 'klar', coldStart: false, obsWf: 0.1, modelWater: 0.05, obsVis: 200 }));
  const run = { run: '2026011012', t0Ms: t0, steps, engine: { live: false }, stations, forcing, shadow };
  const gma = (id, ms) => { const h = (ms - t0) / 3_600_000; if (!Number.isInteger(h) || h < 0 || h >= steps || !ids.includes(id)) return null; return { rs: obsRs(id, h), k: h >= 20 ? 'i' : 'd' }; };
  const sws = (id, ms, t0Ms) => ({ ts: obsRs(id, (ms - t0Ms) / 3_600_000) - 1, rc: 1 });
  const sc = scoreVs({ runs: [run], gma, swsmos: sws, cvFolds: 2 });
  const t1 = sc.temperature.alle['1'], t2 = sc.temperature.alle['2'];
  ok('N1 Temperatur +1 h: Modell MAE 0,75 (5 × 0,5, 1 × 2), Bias +0,75, within1 5/6; T_G 1,5; T2m 3; SWSMOS −1; Persistenz fehlt vor der Messstunde', t1.model.n === 6 && close(t1.model.mae, 0.75) && close(t1.model.bias, 0.75) && close(t1.model.within1, 5 / 6, 1e-3) && close(t1.tg.mae, 1.5) && close(t1.t2m.mae, 3) && close(t1.swsmos.bias, -1) && t1.persist === undefined && t2 === undefined, JSON.stringify(t1?.model));
  const t3 = sc.temperature.alle['3'];
  ok('N1b +3 h: Persistenz = Messwert der Stunde 2 ⇒ Fehler 0,1 K; Brücken-Stratum 3 Stationen; Klasse windig bei 6 m/s; 6 Stationen × 7 Vorläufe Paare', close(t3.persist.mae, 0.1, 1e-6) && t3.persist.n === 6 && sc.temperature.bruecke['3'].model.n === 3 && sc.temperature['klasse:windig']['3'].model.n === 6 && sc.pairs === 6 * VS_SCORE_LEADS.length, `${sc.pairs}`);
  const runM = { ...run, stations: Object.fromEntries(Object.entries(stations).map(([id, s]) => [id, { ...s, v: { ...s.v, tf_src: s.v.tf_src.map((x, h) => (h === 3 ? 0 : x)) } }])) };
  ok('N1c eine als „gemessen" markierte Stunde zählt nicht als Prognose (+3 h fällt aus den Paaren)', scoreVs({ runs: [runM], gma, swsmos: null, cvFolds: 2 }).temperature.alle['3'] === undefined);
  const e24 = sc.events.ts0['24'];
  ok('N2 Ereignis Ts ≤ 0 im Fenster −3 … +1: bei +24 h (obs −1,4) Modell 5 Treffer, S5 (+0,6) verfehlt ⇒ POD 0,83; T2m (+1,6) POD 0; SWSMOS (−2,4) POD 1', e24.model.hit === 5 && e24.model.miss === 1 && close(e24.model.pod, 5 / 6, 1e-3) && e24.t2m.pod === 0 && e24.swsmos.pod === 1 && sc.events.ts0['48'] === undefined, JSON.stringify(e24.model));
  const i24 = sc.events.ice['24'];
  ok('N2b Eis-Ereignis: GMA „i" ab Stunde 20, Modell Reif (3) ab 20 ⇒ POD 1, FAR 0; SWSMOS RC 1 ⇒ POD 0', i24.model.pod === 1 && i24.model.far === 0 && i24.swsmos.pod === 0, JSON.stringify(i24));
  ok('N3 Kontingenz: +24 h Modell reif × GMA eis = 6; +1 h trocken × trocken = 6', sc.contingency['24|reif|eis'] === 6 && sc.contingency['1|trocken|trocken'] === 6);
  ok('N4 Film: |0,05 − 0,1| mm = 50 µm MAE über 6 Paare; Sicht: P(<1000) = 1 bei 200 m ⇒ Brier 0, P(<300) = 0 ⇒ Brier 1', sc.film.n === 6 && close(sc.film.maeUm, 50, 1e-6) && sc.visibility[0].brier === 0 && sc.visibility[1].brier === 1 && sc.visibility[0].reliability[9].n === 6);
  ok('N5 Stationsweise 2-fach-CV: roh MAE = mittlerer Versatz der Testfalte; korrigiert über den gepoolten Stunden-/Klassen-Mittelwert kleiner oder gleich', sc.cv.folds === 2 && sc.cv.perFold.every((f) => f.stations === 3 && f.raw.n === 3) && sc.cv.meanCorrectedMae <= sc.cv.meanRawMae + 1e-9, `${sc.cv.meanRawMae} → ${sc.cv.meanCorrectedMae}`);
  ok('N6 Zusammenfassung nennt Läufe, Paare, Vorläufe und Film', /Läufe 1, Paare/.test(summaryText(sc)) && /\+24 h: model MAE/.test(summaryText(sc)) && /Film: MAE 50 µm/.test(summaryText(sc)));
}

// ── O: the page's view (AW-6.2.9, `?roadvs=1`) — pure functions over a product file ──────────────
{
  const t0 = Date.UTC(2026, 9, 28, 9), steps = 4, H = 3_600_000;
  const enc = (k, xs) => xs.map((x) => roadVsProductEncode(k, x));
  const v = Object.fromEntries(ROAD_VS_VAR_IDS.map((k) => [k, new Array(steps).fill(null)]));
  Object.assign(v, {
    tf: enc('tf', [1.2, -0.4, -1.1, null]), tf_sigma: enc('tf_sigma', [0.8, 1.1, 1.3, 1.4]), tf_src: [1, 2, 2, 3],
    zustand: [0, 0, 3, 0], griff: [0, 0, 2, 0], glaette_p: [0, 0, 50, 0], wasserfilm_mm: enc('wasserfilm_mm', [0, 0.02, 0.05, 0]),
    tf_bruecke: enc('tf_bruecke', [null, -1.5, null, null]), vis_p1000: [5, 40, 90, 0], vis_p300: [0, 10, 60, 0], vis_p150: [0, 0, 20, 0], vis_p50: [0, 0, 0, 0], vis_src: [2, 2, 2, 2],
  });
  const file = { t0Ms: t0, steps, run: '2026102809', engine: { forcing: { run: '2026102809' }, fusionRun: '2026102808' } };
  const pt = { id: 'S1', kind: 'station', bridge: true, kaltstart: false, couple: { c: 1.2, mode: 'lw', ageH: 2, converged: true }, corr: { k: -0.3, from: 'neighbours', n: 4 }, szenario: 'ungestreut', v };
  ok('O1 Stundenindex: nächste volle Stunde innerhalb 0 … steps−1, außerhalb null (auch 20 min vor t0 ⇒ Stunde 0)', roadVsStep(file, t0) === 0 && roadVsStep(file, t0 + 1.4 * H) === 1 && roadVsStep(file, t0 + 1.6 * H) === 2 && roadVsStep(file, t0 - 20 * 60_000) === 0 && roadVsStep(file, t0 - H) === null && roadVsStep(file, t0 + 4 * H) === null);
  const v0 = roadVsValue(pt, file, t0), v2 = roadVsValue(pt, file, t0 + 2 * H);
  ok('O2 Wert der Stunde: tf, σ, Herkunft, Zustand, Griff, Film, Sicht dekodiert; Stunde 0 gekoppelt/trocken, Stunde 2 modelliert/Reifglätte', v0 && v0.tf === 1.2 && v0.sigma === 0.8 && v0.src === 'gekoppelt' && v0.cond === 'trocken' && v0.grip === 'griffig' && v0.vis[0] === 5
    && v2 && v2.tf === -1.1 && v2.src === 'modelliert' && v2.cond === 'reifglaette' && v2.grip === 'glatt' && v2.glaetteP === 50 && v2.filmMm === 0.05 && v2.vis[1] === 60 && v2.validMs === t0 + 2 * H, JSON.stringify(v2));
  ok('O3 Gegenprobe: Stunde ohne tf oder mit Herkunft unbekannt ⇒ null (nie ein Wert aus dem Nichts)', roadVsValue(pt, file, t0 + 3 * H) === null && roadVsValue({ ...pt, v: { ...v, tf_src: [3, 2, 2, 3] } }, file, t0) === null);
  ok('O4 Klasse in den Farben der Messklassen: gefroren ⇒ ice, nass/feucht ⇒ wet, trocken ≤ 0 °C ⇒ frost, trocken > 0 ⇒ dry, ohne Zustand ⇒ unknown',
    roadVsClassOf({ cond: 'reifglaette', tf: -1 }) === 'ice' && roadVsClassOf({ cond: 'glatteis', tf: 0.3 }) === 'ice' && roadVsClassOf({ cond: 'schneematsch', tf: 0.5 }) === 'ice' && roadVsClassOf({ cond: 'nass', tf: -1 }) === 'wet' && roadVsClassOf({ cond: 'feucht', tf: 5 }) === 'wet'
    && roadVsClassOf({ cond: 'trocken', tf: 0 }) === 'frost' && roadVsClassOf({ cond: 'trocken', tf: 0.1 }) === 'dry' && roadVsClassOf({ cond: null, tf: 2 }) === 'unknown');
  ok('O5 Wörter: jeder berechnete Wert trägt das Wort „berechnet"; Badge, Zeile, σ-Text, Herkunft gekoppelt mit „Sensor aus seit"', ROAD_VS_WORD === 'berechnet' && roadVsBadgeText(v2) === `Reifglätte · ${ROAD_VS_WORD}` && roadVsText(v2) === `Fahrbahn −1,1 °C · ${ROAD_VS_WORD} · Reifglätte` && roadVsSigmaText(v2) === 'typisch ± 1,3 K' && roadVsCondText({ cond: null }) === 'Zustand unbekannt'
    && /^berechnet · gekoppelt · Sensor aus seit \d\d:\d\d UTC$/.test(roadVsOriginText(v0, t0 - H)) && roadVsOriginText(v2) === 'berechnet · Modell mit Standortkorrektur, breitere Streuung', roadVsOriginText(v0, t0 - H));
  const lines0 = roadVsInfoLines({ point: pt, value: v0, file, sensorOffSinceMs: t0 - 2 * H }), lines2 = roadVsInfoLines({ point: { ...pt, kaltstart: true }, value: v2, file });
  ok('O6 Info-Tab: beginnt mit „nicht gemessen", nennt Kopplung mit Messalter, Standortkorrektur mit Nachbarn, Kaltstart, Szenario ohne Streuung, Brücke, Sicht, Lauf und den Schalter',
    /^Dieser Fahrbahnwert ist nicht gemessen/.test(lines0[0]) && /Brückensäule\)/.test(lines0[0]) && /gekoppelt \(Messung 2,0 h alt, Wärmestrahlung × 1,20\)/.test(lines0[1]) && /seit \d\d:\d\d keinen gültigen/.test(lines0[1])
    && /Standortkorrektur −0,3 K aus 4 Nachbaranlagen/.test(lines2[1]) && lines2.some((l) => /^Kaltstart/.test(l)) && lines2.some((l) => /Glättepotenzial ohne Streuung: Zustand Reifglätte, Griff glatt, Glättepotenzial 50 %, Wasserfilm 0,05 mm/.test(l))
    && roadVsInfoLines({ point: pt, value: roadVsValue(pt, file, t0 + H), file }).some((l) => /^Brückensäule .* −1,5 °C/.test(l)) && lines2.some((l) => /^Sicht: P\(< 1 000 m\) 90 %, P\(< 300 m\) 60 %/.test(l)) && /ICON-D2 2026102809, buscosun Fusion 2026102808.*roadvs=1/.test(lines2[lines2.length - 1]), lines2.join(' | '));
  ok('O7 Reihe fürs Diagramm: nur Stunden mit tf und bekannter Herkunft, relativ zur Bezugszeit, Fenster eingehalten', JSON.stringify(roadVsSeries(pt, file, t0, 0, 48)) === '[[0,1.2],[1,-0.4],[2,-1.1]]' && JSON.stringify(roadVsSeries(pt, file, t0 + H, 0, 1)) === '[[0,-0.4],[1,-1.1]]');
  const ring = { group: 'G', slots: ['2610280800', '2610280815', '2610280830'], stations: { S1: { rs: [1, null, null] }, S2: { rs: [null, null, null] } } };
  ok('O8 letzter gültiger Fahrbahnwert aus dem Ring (für „Sensor aus seit"): S1 08:00 UTC, S2 nie, fremde Gruppe/unbekannte Station null', roadLastValueMs(ring, 'S1', 'G') === Date.UTC(2026, 9, 28, 8) && roadLastValueMs(ring, 'S2', 'G') === null && roadLastValueMs(ring, 'S1', 'H') === null && roadLastValueMs(ring, 'S9', 'G') === null && roadLastValueMs(null, 'S1', 'G') === null);
  ok('O9 Quellen-Zeile: aktiv nur mit Lauf und mit dem Schalter im Text, sonst geplant; Horizont 48 h', roadVsSourceRow(true).status === 'aktiv' && /roadvs=1/.test(roadVsSourceRow(true).what) && roadVsSourceRow(false).status === 'geplant' && ROAD_VS_HORIZON_H === 48);
}

const failed = checks.filter((c) => !c.pass);
console.log(`\n${failed.length === 0 ? `ALLE ${checks.length} CHECKS PASS` : `${failed.length} von ${checks.length} CHECK(S) FEHLGESCHLAGEN: ${failed.map((c) => c.id).join(' · ')}`}`);
process.exit(failed.length ? 1 : 0);
