/**
 * verify-rain-window.mjs — Phase RB (audit/regenbeginn-spanne.md): Regenbeginn als Spanne im Regenradar (`?rb=1`).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-rain-window.mjs
 *
 * A Schalter `?rb=1` (nur exakt „1"; sonst aus).
 * B buscosun Fusion: Beginn (Kern/Rand), „möglich", „Kein Regen bis", breites Fenster ⇒ „unsicher", Ende, Regen hält
 *   an, Tageswörter, Grenzen der gesetzten Schwellen (mit Gegenprobe knapp darunter).
 * C Radar (E-RB-5/6): Minute der Extrapolation ± Tempo-Unsicherheit t/1,15 … t/0,85 (DE und AT gleich), Sicherheit aus
 *   buscosun Fusion in der Stunde des Fensters, niedrige Fusion-p ⇒ „Beginn unsicher", Ende, ohne Fusion keine %,
 *   CH (rzc) ⇒ Fusion, Radar trocken ⇒ Übergabe an die Fusion nach dem Radar-Horizont (mit Gegenprobe).
 * D Befund V-RB-4 (Messung, kein Gate): das Horn–Schunck-Feld des Flow-Ensembles an ziehendem, texturiertem Regen —
 *   im Echo und am trockenen Ort vor dem Regen gegen die wahre Verlagerung.
 * E `radarTimesAt` an einem synthetischen DE1200-Stack (echte Ecken/Projektion): ziehender Regen erreicht Frankfurt
 *   nach 75 min, Fenster um diese Minute; Laufalter; ohne Regen trocken; über dem Ort ⇒ Ende; außerhalb ⇒ null; Kosten.
 * F Band-Geometrie und Marker-Label.
 * G Verdrahtung: Deck (Desktop über dem Hero, mobil Schnellblick), Karte (Label nur im Profil), `buildNowcast`
 *   ohne Schalter unverändert (8 h, keine Wahrscheinlichkeit), kein Flow-Ensemble im Weg.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeRainWindow, rainWindowEnabledFrom, bandGeometry, dayWord, radarSpeedWindow,
  RB_P_CORE, RB_P_EDGE, RB_P_DRY, RB_SPEED_LO, RB_SPEED_HI,
} from '../src/nowcast/rainWindow.ts';
import { radarTimesAt } from '../src/nowcast/rainWindowRadar.ts';
import { estimateFlowHS } from '../src/ml/opticalFlowNowcast.ts';
import { coarsenFrameU8 } from '../src/ml/coarsen.ts';
import { DE1200_CORNERS, psFwd } from '../src/sources/radolanGeo.ts';
import { quadCellIndex } from '../src/pointForecast/quadSampler.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const add = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const H = 3_600_000, MIN = 60_000;
// 09.10.2026 12:00 Europe/Berlin (= 10:00 UTC)
const NOW = Date.UTC(2026, 9, 9, 10, 0, 0);
const hours = (ps, from = NOW) => ps.map((p, i) => ({ tMs: from + i * H, p }));
const rad = (onset, end = null, wetNow = false, product = 'RADOLAN-RV', horizonMin = 120) => ({ kind: 'extrapolation', product, horizonMin, wetNow, onsetMin: onset, endMin: end });

// ---------------------------------------------------------------------------
console.log('\nA Schalter');
add('A1 ?rb=1 an', rainWindowEnabledFrom('?rb=1'));
add('A2 ohne/0/true/RB=1 aus', !rainWindowEnabledFrom('') && !rainWindowEnabledFrom('?rb=0') && !rainWindowEnabledFrom('?rb=true') && !rainWindowEnabledFrom('?RB=1'));

// ---------------------------------------------------------------------------
console.log('\nB buscosun Fusion');
{
  // 12, 13, … Uhr: trocken bis 16, 17 Uhr 35 %, 18 Uhr 55 %, dann nass
  const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours([0.05, 0.05, 0.1, 0.1, 0.15, 0.35, 0.55, 0.8, 0.8]) });
  add('B1 Beginn Kern: „Regen wahrscheinlich heute 17–19 Uhr"', w.kind === 'onset' && w.source === 'fusion' && w.sentence === 'Regen wahrscheinlich heute 17–19 Uhr', w.sentence);
  add('B2 Sicherheit = höchste p im Block (80 %), Stundenauflösung', w.prob === 0.8 && w.precision === 'hour' && !w.uncertain, `${w.prob}`);
  add('B3 Quelle buscosun Fusion, Achse +24 h', w.sourceLabel === 'buscosun Fusion' && w.axisToMs - w.axisFromMs === 24 * H);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours([0.05, 0.1, 0.4, 0.45, 0.2]) });
  add('B4 nur Rand (≥ 30 %, < 50 %) ⇒ „Regen möglich ab 14 Uhr", unsicher', w.sentence === 'Regen möglich ab 14 Uhr' && w.uncertain && w.prob === 0.45, w.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours([0.05, 0.1, 0.1, 0.15, RB_P_DRY, 0.1]) });
  add('B5 „Kein Regen bis 16 Uhr" (erste Stunde ≥ 20 %)', w.kind === 'dry' && w.sentence === 'Kein Regen bis 16 Uhr', w.sentence);
  add('B5b Sicherheit trocken = 1 − höchste p davor (85 %)', Math.abs(w.prob - 0.85) < 1e-9, `${w.prob}`);
  const g = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours([0.05, 0.1, 0.1, 0.15, RB_P_DRY - 0.001, 0.1]) });
  add('B5c Gegenprobe knapp unter 20 % ⇒ trocken bis zum Ende der Reihe (18 Uhr)', g.kind === 'dry' && g.sentence === 'Kein Regen bis 18 Uhr', g.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours(Array(25).fill(0.02)) });
  add('B6 durchgehend trocken über 24 h ⇒ „Kein Regen bis morgen 12 Uhr"', w.sentence === 'Kein Regen bis morgen 12 Uhr', w.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours([0.05, 0.31, 0.32, 0.33, 0.34, 0.35, 0.6]) });
  add('B7 breites Fenster (> 3 h) ⇒ „Beginn unsicher, zwischen 13 Uhr und 19 Uhr"', w.uncertain && w.sentence === 'Beginn unsicher, zwischen 13 Uhr und 19 Uhr', w.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours([0.9, 0.8, 0.6, 0.4, 0.2, 0.1]) });
  add('B8 es regnet (Fusion) ⇒ Ende 15–17 Uhr (erste Stunde < 50 % … erste < 30 % + 1 h)', w.kind === 'end' && w.sentence === 'Regen hört voraussichtlich heute 15–17 Uhr auf', w.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours(Array(25).fill(0.9)) });
  add('B9 Regen hält an ⇒ „bis mindestens morgen 12 Uhr"', w.kind === 'wet' && /mindestens morgen 12 Uhr/.test(w.sentence), w.sentence);
}
{
  const nightNow = Date.UTC(2026, 9, 9, 20, 0, 0); // 22 Uhr
  const w = computeRainWindow({ nowMs: nightNow, radar: null, fusion: hours([0.05, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.4, 0.6, 0.9], nightNow) });
  add('B10 über Mitternacht ⇒ Tageswort „morgen"', w.sentence === 'Regen wahrscheinlich morgen 6–8 Uhr', w.sentence);
  add('B10b dayWord heute/morgen', dayWord(NOW, NOW) === 'heute' && dayWord(NOW + 24 * H, NOW) === 'morgen');
}
{
  const eve = Date.UTC(2026, 9, 9, 18, 0, 0); // 20 Uhr
  const w = computeRainWindow({ nowMs: eve, radar: null, fusion: hours([0.05, 0.1, 0.35, 0.6, 0.2], eve) });
  add('B10c Mitternacht als Ende ⇒ „22–24 Uhr" statt „22–0 Uhr" (Satz und Label)', w.sentence === 'Regen wahrscheinlich heute 22–24 Uhr' && w.label === 'Regen 22–24 Uhr', `${w.sentence} · ${w.label}`);
}
add('B11 ohne Fusion und ohne Radar ⇒ keine Aussage', computeRainWindow({ nowMs: NOW, radar: null, fusion: null }).kind === 'none');
add('B12 Schwellen-Reihenfolge trocken < Rand < Kern', RB_P_DRY < RB_P_EDGE && RB_P_EDGE < RB_P_CORE);

// ---------------------------------------------------------------------------
console.log('\nC Radar');
{
  const sw = radarSpeedWindow(60, 120);
  add('C1 Tempo-Spanne um 60 min: 60/1,15 … 60/0,85 auf 5 min ⇒ 50–75 min', sw.fromMin === 50 && sw.toMin === 75, JSON.stringify(sw));
  const s2 = radarSpeedWindow(5, 120);
  add('C1b kurze Vorläufe: mindestens 5 min breit, enthält die Minute', s2.toMin - s2.fromMin >= 5 && s2.fromMin <= 5 && s2.toMin >= 5, JSON.stringify(s2));
  add('C1c Tempo-Member = mittlere Hälfte des Ensemble-Designs (0,7/0,85/1/1,15/1,3)', RB_SPEED_LO === 0.85 && RB_SPEED_HI === 1.15);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: rad(30), fusion: hours([0.7, 0.8]) });
  add('C2 „Regen ab 12:25–12:40", Quelle Radar · RADOLAN-RV', w.kind === 'onset' && w.source === 'radar' && w.sentence === 'Regen ab 12:25–12:40' && w.sourceLabel === 'Radar · RADOLAN-RV', w.sentence);
  add('C3 Sicherheit = P(nass) der Fusion in der Stunde des Fensters (70 %)', w.prob === 0.7 && /buscosun Fusion/.test(w.probNote), `${w.prob}`);
  add('C3b Fenster enthält die Radar-Minute, Achse 2 h', w.fromMs <= NOW + 30 * MIN && w.toMs >= NOW + 30 * MIN && w.axisToMs - NOW === 120 * MIN);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: rad(40), fusion: hours([0.2, 0.3]) });
  add('C4 Radar sieht Regen, Fusion nur 20 % ⇒ „Beginn unsicher" (ehrlich statt Minuten)', w.uncertain && w.sentence === 'Beginn unsicher, zwischen 12 und 13 Uhr', w.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: rad(100), fusion: hours([0.9, 0.9, 0.9]) });
  add('C5 langer Vorlauf (100 min) ⇒ breiteres Fenster 85–120, sichere Fusion ⇒ Minuten bleiben', !w.uncertain && w.fromMs === NOW + 85 * MIN && w.toMs === NOW + 120 * MIN && w.sentence === 'Regen ab 13:25–14:00', `${w.sentence} (${(w.fromMs - NOW) / MIN}–${(w.toMs - NOW) / MIN})`);
  const u = computeRainWindow({ nowMs: NOW, radar: rad(100), fusion: hours([0.9, 0.4, 0.4]) });
  add('C5b dasselbe mit Fusion 40 % ⇒ „Beginn unsicher, zwischen 13 und 14 Uhr"', u.uncertain && u.sentence === 'Beginn unsicher, zwischen 13 und 14 Uhr', u.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: rad(30), fusion: null });
  add('C6 ohne Fusion: Radar-Fenster ohne %', w.source === 'radar' && w.prob === null && w.sentence === 'Regen ab 12:25–12:40', w.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: rad(null), fusion: hours([0.05, 0.05, 0.1, 0.4, 0.6]) });
  add('C7 Radar trocken ⇒ Übergabe an die Fusion nach dem Radar-Horizont', w.source === 'fusion' && w.sentence === 'Regen wahrscheinlich heute 15–17 Uhr', w.sentence);
  const g = computeRainWindow({ nowMs: NOW, radar: rad(null), fusion: hours([0.05, 0.9, 0.05, 0.05]) });
  add('C7b Gegenprobe: Fusion-Stunde innerhalb des Radar-Horizonts beginnt kein Fenster', g.kind === 'dry', g.sentence);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: rad(null, 55, true), fusion: hours([0.9, 0.1]) });
  add('C8 es regnet ⇒ „Regen hört auf 12:45–13:05", Sicherheit 1 − p am Ende (90 %)', w.kind === 'end' && w.sentence === 'Regen hört auf 12:45–13:05' && Math.abs(w.prob - 0.9) < 1e-9, `${w.sentence} · ${w.prob}`);
}
{
  const w = computeRainWindow({ nowMs: NOW, radar: rad(60, null, false, 'INCA', 180), fusion: hours([0.6, 0.7]) });
  add('C9 AT: dieselbe Regel (60 min ⇒ 50–75), Quelle INCA, Achse 3 h', w.fromMs === NOW + 50 * MIN && w.toMs === NOW + 75 * MIN && w.sourceLabel === 'Radar · INCA' && w.axisToMs - NOW === 180 * MIN, w.sentence);
}
{
  const r = { kind: 'analysis', product: 'rzc', horizonMin: 0, wetNow: false, onsetMin: null, endMin: null };
  const w = computeRainWindow({ nowMs: NOW, radar: r, fusion: hours([0.05, 0.6, 0.8]) });
  add('C10 CH: rzc ohne Nowcast ⇒ Fusion ab jetzt', w.source === 'fusion' && w.sentence === 'Regen wahrscheinlich heute 13–14 Uhr', w.sentence);
  const n = computeRainWindow({ nowMs: NOW, radar: { ...r, wetNow: true }, fusion: hours([0.9, 0.7, 0.4, 0.1]) });
  add('C10b CH: nass laut rzc ⇒ Ende aus der Fusion', n.kind === 'end' && n.source === 'fusion', n.sentence);
}

// ---------------------------------------------------------------------------
console.log('\nD Befund V-RB-4 — Horn–Schunck-Feld des Flow-Ensembles (Messung, kein Gate)');
const W = 1100, HH = 1200;
const FFM = { lat: 50.11, lon: 8.68 };
const FCELL = quadCellIndex(W, HH, DE1200_CORNERS, FFM.lat, FFM.lon, psFwd, 'edge');
const FCX = FCELL % W, FCY = Math.floor(FCELL / W);
const SPEED = 3; // Zellen je 5 min nach Osten
function blobFrame(lead, startOff) {
  const vals = new Uint8Array(W * HH);
  const bx = FCX - startOff + (lead / 5) * SPEED;
  for (let y = FCY - 26; y <= FCY + 26; y++) for (let x = Math.round(bx - 26); x <= Math.round(bx + 26); x++) {
    if (x < 0 || x >= W || y < 0 || y >= HH) continue;
    // texturiert, damit der Fluss nicht am Aperturproblem einer gleichförmigen Scheibe scheitert
    if ((x - bx) ** 2 + (y - FCY) ** 2 <= 25 * 25) vals[y * W + x] = Math.max(2, Math.round(70 + 50 * Math.sin(x * 0.21 + y * 0.13) * Math.cos(x * 0.07 - y * 0.19)));
  }
  return vals;
}
{
  const a = coarsenFrameU8(blobFrame(0, 70), W, HH, 8), b = coarsenFrameU8(blobFrame(5, 70), W, HH, 8);
  const t0 = performance.now();
  const flow = estimateFlowHS(a.data, b.data, a.W, a.H, { alpha: 0.5, iters: 100 });
  const hsMs = performance.now() - t0;
  const pc = Math.floor(FCX / 8), pr = Math.floor(FCY / 8);
  const truth = SPEED / 8;
  const uPoint = flow.u[pr * flow.w + pc];
  const echo = [];
  for (let i = 0; i < a.data.length; i++) if (a.data[i] > 0.05) echo.push(flow.u[i]);
  const uEcho = echo.reduce((x, y) => x + y, 0) / echo.length;
  console.log(`  wahre Verlagerung ${truth.toFixed(3)} Zellen/5 min · im Echo ${uEcho.toFixed(3)} (${Math.round(uEcho / truth * 100)} %) · am trockenen Ort ${uPoint.toFixed(3)} (${Math.round(uPoint / truth * 100)} %) · Horn–Schunck ${hsMs.toFixed(0)} ms`);
}

// ---------------------------------------------------------------------------
console.log('\nE radarTimesAt an einem synthetischen DE1200-Stack');
{
  const stackOf = (startOff) => ({
    source: 'radolan_rv', corners: DE1200_CORNERS, runAtMs: NOW, skillMin: 120, nowIndex: 0, stepMin: 5,
    frames: Array.from({ length: 25 }, (_, i) => ({ values: blobFrame(i * 5, startOff), width: W, height: HH, timeMs: NOW + i * 5 * MIN, leadMinutes: i * 5, measured: i === 0 })),
  });
  const st = stackOf(70);
  const t0 = performance.now();
  const r = radarTimesAt(st, FFM.lat, FFM.lon, NOW);
  const ms = performance.now() - t0;
  // Rand des Blobs erreicht den Ort nach (70 − 25) / 3 · 5 = 75 min
  add('E1 Extrapolation, trocken jetzt, Radar-Minute 75 min', r && r.kind === 'extrapolation' && !r.wetNow && r.onsetMin === 75, `${r?.kind} ${r?.onsetMin}`);
  const w = computeRainWindow({ nowMs: NOW, radar: r, fusion: hours([0.6, 0.7, 0.8]) });
  add('E2 Fenster 65–90 min enthält 75 min', w.kind === 'onset' && w.fromMs === NOW + 65 * MIN && w.toMs === NOW + 90 * MIN, w.sentence);
  const r5 = radarTimesAt(st, FFM.lat, FFM.lon, NOW + 5 * MIN);
  add('E3 fünf Minuten später (Lauf älter) ⇒ 70 min', r5 && r5.onsetMin === 70, `${r5?.onsetMin}`);
  add('E4 Kosten: eine Punktabfrage je Frame (< 20 ms)', ms < 20, `${ms.toFixed(1)} ms`);
  const dry = radarTimesAt(stackOf(400), FFM.lat, FFM.lon, NOW);
  add('E5 Regen weit weg ⇒ keine Beginn-Minute', dry && !dry.wetNow && dry.onsetMin == null);
  const wet = radarTimesAt(stackOf(0), FFM.lat, FFM.lon, NOW);
  add('E6 Regen über dem Ort ⇒ nass jetzt, Ende ≈ 45 min', wet && wet.wetNow && wet.endMin != null && Math.abs(wet.endMin - 45) <= 5, `Ende ${wet?.endMin}`);
  add('E7 Punkt außerhalb des Gitters ⇒ null', radarTimesAt(st, 40.0, -5.0, NOW) === null);
  const ch = radarTimesAt({ ...st, source: 'meteoswiss_rzc' }, FFM.lat, FFM.lon, NOW);
  add('E8 rzc ⇒ Analyse ohne Minuten (Gegenprobe der Quellenweiche)', ch === null || (ch.kind === 'analysis' && ch.onsetMin == null), JSON.stringify(ch));
}

// ---------------------------------------------------------------------------
console.log('\nF Band und Label');
{
  const w = computeRainWindow({ nowMs: NOW, radar: rad(30), fusion: hours([0.7]) });
  const g = bandGeometry(w);
  add('F1 Band: x0 < Kernanfang < Spitze < Kernende < x1, Spitze in der Mitte', g && g.x0 < g.core0 && g.core0 < g.peak && g.peak < g.core1 && g.core1 < g.x1 && Math.abs(g.peak - (g.core0 + g.core1) / 2) < 1e-9, JSON.stringify(g));
  add('F2 Label „Regen 12:25–12:40"', w.label === 'Regen 12:25–12:40', w.label);
  const d = computeRainWindow({ nowMs: NOW, radar: null, fusion: hours([0.05, 0.1, 0.1, 0.15, 0.25]) });
  add('F3 trocken: kein Band, Label „trocken bis 16 Uhr"', bandGeometry(d) === null && d.label === 'trocken bis 16 Uhr', d.label);
}

// ---------------------------------------------------------------------------
console.log('\nG Verdrahtung');
{
  const deck = readFileSync(join(ROOT, 'src/nowcast/NowcastDeck.tsx'), 'utf8');
  const map = readFileSync(join(ROOT, 'src/nowcast/NowcastRadarMap.tsx'), 'utf8');
  const mv = readFileSync(join(ROOT, 'src/MapView.tsx'), 'utf8');
  const eng = readFileSync(join(ROOT, 'src/nowcast/nowcastEngine.ts'), 'utf8');
  const rr = readFileSync(join(ROOT, 'src/nowcast/rainWindowRadar.ts'), 'utf8');
  add('G1 Desktop: Karte direkt über dem Hero', /\{rainWindow && <RainWindowCard w=\{rainWindow\} variant="desktop" \/>\}\s*<Hero nowcast=\{nowcast\} \/>/.test(deck));
  add('G2 Mobil: Karte oben im Schnellblick', /<div className="rm-glance">\s*\{rainWindow && <RainWindowCard w=\{rainWindow\} variant="mobile" \/>\}/.test(deck));
  add('G3 Deck rechnet nur mit Schalter', /if \(!rbOn \|\| !nowcast \|\| rbStack === undefined\) return null;/.test(deck) && /const onRadarStack = rbOn \? setRbStack : undefined;/.test(deck));
  add('G4 Hero bleibt erhalten (Funktionserhalt)', /<Hero nowcast=\{nowcast\} \/>/.test(deck) && /function Hero\(/.test(deck));
  add('G5 Karte: Label nur mit Schalter, Prop nur gesetzt wenn vorhanden', /if \(!rbOn \|\| !stack \|\| !pointNowcast\) return null;/.test(map) && /\.\.\.\(markerLabel \? \{ profileMarkerLabel: markerLabel \} : \{\}\)/.test(map));
  add('G6 MapView: Label nur im Profil, ohne Label entfernt', /if \(!profile\) return;[\s\S]{0,200}if \(!profileMarkerLabel\) \{ lab\?\.remove\(\); return; \}/.test(mv));
  add('G7 buildNowcast ohne Schalter: 8 h, Reihe ungefiltert, keine Wahrscheinlichkeit', /const cubeHours = rb \? RB_HORIZON_H \+ 1 : 8;/.test(eng) && /nwp: rb \? nwpAll\.filter\([^)]*\)[^:]*: nwpAll,/.test(eng) && /if \(rb && nwpSource === 'cube' && exceed\)/.test(eng));
  add('G8 Gegenprobe: Muster G7 erkennt eine Änderung', !/const cubeHours = rb \? RB_HORIZON_H \+ 1 : 8;/.test(eng.replace('RB_HORIZON_H + 1 : 8', 'RB_HORIZON_H + 1 : 12')));
  add('G9 kein Flow-Ensemble/Horn–Schunck im Weg (V-RB-4)', !/^import[^\n]*(flowEnsemble|estimateFlowHS|opticalFlow)/m.test(rr));
  add('G9b Gegenprobe: Muster G9 erkennt einen Import', /^import[^\n]*(flowEnsemble|estimateFlowHS|opticalFlow)/m.test(`import { estimateFlowHS } from '../ml/opticalFlowNowcast';\n${rr}`));
}

console.log(`\nverify:rain-window ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
