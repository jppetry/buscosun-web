#!/usr/bin/env node
/**
 * verify-road-vs.mjs — AW-6.2 „Virtueller Fahrbahnsensor" (`audit/autobahnwetter.md` §20), network-free.
 *   npm run verify:road-vs
 * A forcing contract and physics · B GMA quality chain · C SWSMOS reducer · D switch · E health R8 · F producer parts.
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

const failed = checks.filter((c) => !c.pass);
console.log(`\n${failed.length === 0 ? `ALLE ${checks.length} CHECKS PASS` : `${failed.length} von ${checks.length} CHECK(S) FEHLGESCHLAGEN: ${failed.map((c) => c.id).join(' · ')}`}`);
process.exit(failed.length ? 1 : 0);
