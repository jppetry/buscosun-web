/**
 * verify-ruc.mjs — Phase RUC (audit/niederschlag-ruc.md): 5-min precipitation form from ICON-D2-RUC behind the radar.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-ruc.mjs
 *
 * A Vertrag `src/point/rucFormat.ts`: Byte-Umkehr auf allen 256 Codes, Sättigung, Spalten-/Chunk-Zuordnung gegen
 *   `cellOf`/`CHUNK_CELLS` an 1 000 Zufallspunkten, Lauf-Stempel ↔ ms, Intervalle, Manifest mit Gegenprobe.
 * B Producer-Bausteine (netzfrei, Fixture = zwei echte RUC-Felder PT001H00M/PT001H05M des Laufs 23.10. 02z und die
 *   RUC-Zellen in 47,5–49,5°N / 8–11°E): Δ zweier Akkumulationen ⇒ Rate ≥ 0, Blockmittel = Mittel der Zellen im Block
 *   (Gegenprobe brute force an 50 Zellen), Zelle ohne Treffer gefüllt, Chunk-Bytes = Vertrag, PNG-Rundlauf, Statistik,
 *   Stationsreihen; Byte 0 nur dort, wo das Feld `NaN` hat.
 * C Publisher mit Git-Attrappe: Speicher ohne latest.json wirft, abgewiesener Push ⇒ frische Basis und Wiederholung, nur
 *   `ruc/` im Commit (Gegenprobe: fremder Pfad wirft), leerer Diff ⇒ unchanged; CDN-Plan Purge = latest.json, Wärmen der
 *   neuen Dateien, Fehler nie fatal.
 * D Workflow-Vorlage: eine freie Cron-Minute (gegen alle Vorlagen gezählt), ≥ 15 min zu den Force-Push-Fenstern der
 *   Kartenlinie, Timeout, Kill-Variable, Sparse-Muster decken die gelesenen Pfade, MANUELLE-SCHRITTE §74.
 * E Leser am Punkt (memoryStore, echter Chunk + Manifest des Volllaufs 2026102305): Spalte der Zelle = Byte-Reihe, Zeiten =
 *   rucIntervalMs, Alter > 3 h ⇒ null, fehlendes/fremdes Manifest ⇒ null, 404 des Chunks ⇒ null, außerhalb der Domäne ⇒ null.
 * F Anpassung an die Stundensummen von buscosun Fusion 13: Stundenmittel exakt f (1 080 Zufallsstunden), Arten dry/flat/form/mixed,
 *   Kappe ×4 genau an der Grenze, fehlendes Intervall ⇒ Stunde ohne Punkte, rucAt an den Rändern, Schalter aus/an.
 * G Verdrahtung: ohne ruc byte-gleiche Ergebnisse von computeRainWindow, buildMinuteSeries, assembleNowcast, buildEventDetail;
 *   mit ruc Beginn aus dem ersten nassen Intervall (Spanne ±15/30/45 nach Vorlauf), flache Stunde ⇒ Stundensatz, Ende nach
 *   30 min trocken, Minutenverlauf-Schicht, Überblendung, Ereignisse ≤ 27 h minutengenau; Verdrahtung als Quelltext.
 * H Messskript T9: Regel eingefroren (Hash), Fall-Rechnung gegen Handrechnung (Beginn, Brier), Fehlalarm/Verfehlung/trocken/ungültig,
 *   Aggregat (MAE, Treffer, Quantile, Verdikt, Spannen), Dateilauf mit Katalog, Stationsreihe und dense-day.
 * I Nachbesserungen aus dem Review vom 23.10.: Naht-Texte ohne Schalter wortgleich (C1), Messfenster gegen 7-h-Deckung (C2),
 *   flache Stunde ⇒ Stundensatz (I1), Koordinaten-Cache bei Gitterwechsel (I2), 15-min-Mittel in der Engine (I3), Schlüssel nur mit ruc (I4).
 * J Regen-Kante der Anzeigen (E-RUC-11). K Minutenkurve der 5-min-Form (E-RUC-13): kumulierte Menge monoton-kubisch interpoliert — jede
 *   5-min-Summe und jede Stundensumme exakt erhalten, nie negativ, flache Läufe flach, Lücken ⇒ getrennte Läufe, Schalter, Verdrahtung.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { decodeGrib2 } from '../src/sources/gribDecode.ts';
import { encodePng, decodePng } from './lib/png.mjs';
import { buildBlockMeanIndex, sampleBlockMean, blockIndexSignature } from './ruc/lib/blockIndex.mjs';
import { intervalRateMmH, encodeChunkImages, rucStatsOf, encodeStationSeries, stationCellsOf, RATE_PER_MM } from './ruc/lib/rucEncode.mjs';
import { publishRuc, planRucCdn, syncRucCdn, RUC_REPO_PATH } from './ruc/ruc-publish.mjs';
import { loadRucPoint } from '../src/point/client/rucPoint.ts';
import { memoryStore } from '../src/point/client/store.ts';
import { fitRucToFusion, rucAt, rucMeanOver, rucEnabledFrom, rucBaseFrom } from '../src/nowcast/rucSeries.ts';
import { rucMinuteCurve, rucCurveAt, rucCurveEnabledFrom } from '../src/nowcast/rucCurve.ts';
import { loadRucCoords } from './ruc/lib/rucCoords.mjs';
import { computeRainWindow, clock } from '../src/nowcast/rainWindow.ts';
import { buildMinuteSeries, valueAt, MV_VIEW_H, MV_HORIZON_H, minuteBarsEnabledFrom } from '../src/nowcast/minuteSeries.ts';
import { assembleNowcast } from '../src/nowcast/nowcastEngine.ts';
import { buildEventDetail } from '../src/nowcast/eventDetail.ts';
import { MEASURE_RULE, ruleHash, measureCase, aggregate, measureRuc } from './ruc/ruc-measure.mjs';
import { quantile } from '../src/nowcast/rainWindow.ts';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import {
  RUC_SCHEMA, RUC_DIR, RUC_STEP_MIN, RUC_HORIZON_H, RUC_STEPS, RUC_KEEP_RUNS, RUC_STATIONS_KEEP_DAYS, RUC_STALE_MS,
  RUC_DRY_MM, RUC_CAP_FACTOR, RUC_MODEL, RUC_PARAM, RUC_LABEL, RUC_ENCODING, RUC_CHUNK_WIDTH, RUC_TIER, RUC_STATION_STEPS,
  rucRunStamp, rucRunMs, rucRunDir, rucChunkFile, rucLatestPath, rucRunManifestPath, rucChunkPath, rucStationsPath, rucStationsCatalogPath, parseRucStationsFile,
  rucChunkOf, rucCellOfColumn, rucPixelOffset, encodeRucByte, decodeRucByte, makeRucManifest, parseRucManifest, rucIntervalMs,
} from '../src/point/rucFormat.ts';
import { TIER_BY_ID, CHUNK_CELLS, cellOf, chunkOf, CUBE_DOMAIN } from '../src/point/cubeFormat.ts';
import { precipLogCode, precipLogValue, PRECIP_X0 } from '../src/point/fieldFormat.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = join(ROOT, 'scripts', 'lib', 'fixtures', 'ruc');
let pass = 0, fail = 0;
const add = (name, ok, detail = '') => { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`); };
const H = 3_600_000, MIN = 60_000;
// deterministic LCG so the 1 000 points are the same on every run
let seed = 20261023;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

// ---------------------------------------------------------------------------
console.log('\nA Vertrag rucFormat.ts');
add('A1 Konstanten: 5 min, 27 h ⇒ 324 Intervalle, Ablage ruc/v1 außerhalb point/, Schema 1',
  RUC_STEP_MIN === 5 && RUC_HORIZON_H === 27 && RUC_STEPS === 324 && RUC_STEPS === (RUC_HORIZON_H * 60) / RUC_STEP_MIN
  && RUC_DIR === 'ruc/v1' && !RUC_DIR.startsWith('point') && RUC_SCHEMA === 1 && RUC_TIER === TIER_BY_ID.t1
  && RUC_CHUNK_WIDTH === CHUNK_CELLS * CHUNK_CELLS && RUC_STATION_STEPS === (12 * 60) / RUC_STEP_MIN,
  `${RUC_STEP_MIN} ${RUC_HORIZON_H} ${RUC_STEPS} ${RUC_DIR}`);
add('A2 Betriebskonstanten: 3 Läufe, 21 Tage Stationsreihen, 3 h Alter, Rauschschwelle 0,001 mm, Kappe ×4, Quelle benannt',
  RUC_KEEP_RUNS === 3 && RUC_STATIONS_KEEP_DAYS === 21 && RUC_STALE_MS === 3 * H && RUC_DRY_MM === 0.001 && RUC_CAP_FACTOR === 4
  && RUC_MODEL === 'icon-d2-ruc' && RUC_PARAM === 'TOT_PREC' && RUC_LABEL === 'ICON-D2-RUC' && RUC_ENCODING === 'ruc-log-v1');

{
  // Byte 0 = kein Wert, 1 = 0 mm/h, 2…255 = precipLogCode(x) der Kartenfelder (dieselbe Skala, Code 1 ist auch dort die Null)
  let roundTrip = 0, monotone = true, prev = -1;
  for (let b = 2; b <= 255; b++) {
    const v = decodeRucByte(b);
    if (!(v > prev)) monotone = false;
    prev = v;
    if (encodeRucByte(v) === b && Math.abs(v - precipLogValue(b)) < 1e-12) roundTrip++;
  }
  add('A3 Byte-Umkehr: decode(0) = null, decode(1) = 0, 2…255 ↔ Log-Code der Kartenfelder, streng monoton',
    decodeRucByte(0) === null && decodeRucByte(1) === 0 && roundTrip === 254 && monotone, `${roundTrip}/254`);
  add('A4 encode: null/NaN ⇒ 0 (kein Wert), 0, negative und Spuren unter der ersten Log-Stufe ⇒ 1 (trocken), 0,002 mm/h ⇒ 2',
    encodeRucByte(null) === 0 && encodeRucByte(NaN) === 0 && encodeRucByte(0) === 1 && encodeRucByte(-0.5) === 1 && encodeRucByte(0.001) === 1
    && encodeRucByte(0.002) === 2 && encodeRucByte(0.05) === precipLogCode(0.05));
  let worst = 0;
  for (let i = 0; i < 1000; i++) {
    const x = 0.05 + rnd() * 95;
    const y = decodeRucByte(encodeRucByte(x));
    worst = Math.max(worst, Math.abs((y + PRECIP_X0) / (x + PRECIP_X0) - 1));
  }
  add('A5 Quantisierung: relativer Fehler von (1 + x/x₀) ≤ 1,4 % an 1 000 Zufallswerten 0,05…95 mm/h', worst <= 0.014, `max ${(worst * 100).toFixed(3)} %`);
  add('A6 Sättigung: 99 mm/h ⇒ 255, decode(255) = 100 mm/h, 500 mm/h ⇒ 255, 98 mm/h ⇒ 254 (Gegenprobe)',
    encodeRucByte(99) === 255 && Math.abs(decodeRucByte(255) - 100) < 1e-9 && encodeRucByte(500) === 255 && encodeRucByte(98) === 254,
    `decode(255) = ${decodeRucByte(255).toFixed(2)}`);
}

{
  const t1 = TIER_BY_ID.t1;
  let ok = 0, inverse = 0;
  for (let i = 0; i < 1000; i++) {
    const lat = CUBE_DOMAIN.latMin + rnd() * (CUBE_DOMAIN.latMax - CUBE_DOMAIN.latMin);
    const lon = CUBE_DOMAIN.lonMin + rnd() * (CUBE_DOMAIN.lonMax - CUBE_DOMAIN.lonMin);
    const c = cellOf(t1, lat, lon);
    const ch = chunkOf(c.iy, c.ix);
    const r = rucChunkOf(c.iy, c.ix);
    const col = (c.iy % CHUNK_CELLS) * CHUNK_CELLS + (c.ix % CHUNK_CELLS);
    if (r.cy === ch.cy && r.cx === ch.cx && r.column === col && col >= 0 && col < RUC_CHUNK_WIDTH) ok++;
    const back = rucCellOfColumn(r.cy, r.cx, r.column);
    if (back.iy === c.iy && back.ix === c.ix) inverse++;
  }
  add('A7 Chunk und Spalte = cellOf/chunkOf der Stufe t1 an 1 000 Zufallspunkten (Spalte = (iy mod 16)·16 + ix mod 16)', ok === 1000, `${ok}/1000`);
  add('A8 Umkehr Spalte → Zelle', inverse === 1000, `${inverse}/1000`);
  add('A9 Pixelversatz: Zeile k, Spalte p ⇒ k·256 + p; letzte Zeile 323', rucPixelOffset(5, 0) === 5 && rucPixelOffset(0, 1) === 256
    && rucPixelOffset(255, 323) === 323 * 256 + 255 && rucPixelOffset(255, 323) === RUC_STEPS * RUC_CHUNK_WIDTH - 1);
  add('A10 Chunk-Raster t1 = 13 × 16 = 208 Chunks', t1.chunk.cy === 13 && t1.chunk.cx === 16 && t1.ny === 201 && t1.nx === 241);
}

{
  const ms = Date.UTC(2026, 9, 23, 2);
  add('A11 Lauf-Stempel ↔ ms: YYYYMMDDHH UTC', rucRunStamp(ms) === '2026102302' && rucRunMs('2026102302') === ms && rucRunMs(rucRunStamp(ms + 17 * MIN)) === ms);
  add('A12 Gegenprobe: falscher Stempel ⇒ null', rucRunMs('2026-10-23') === null && rucRunMs('20261023') === null && rucRunMs('2026102325') === null && rucRunMs('') === null);
  add('A13 Pfade: latest, Laufverzeichnis, Manifest, Chunk, Stationsreihe',
    rucLatestPath() === 'ruc/v1/latest.json' && rucRunDir('2026102302') === 'ruc/v1/2026102302' && rucRunManifestPath('2026102302') === 'ruc/v1/2026102302/run.json'
    && rucChunkFile(3, 12) === '03_12.png' && rucChunkPath('2026102302', 3, 12) === 'ruc/v1/2026102302/03_12.png'
    && rucStationsPath('2026102302', 'deadbeef') === 'ruc/v1/stations/2026102302-deadbeef.png' && rucStationsCatalogPath('deadbeef') === 'ruc/v1/stations/catalog-deadbeef.json'
    && JSON.stringify(parseRucStationsFile('2026102302-deadbeef.png')) === JSON.stringify({ run: '2026102302', catalog: 'deadbeef' })
    && parseRucStationsFile('2026102302.png') === null && parseRucStationsFile('catalog-deadbeef.json') === null);
  const i0 = rucIntervalMs(ms, 0), iLast = rucIntervalMs(ms, RUC_STEPS - 1);
  add('A14 Intervall k = (Lauf + 5k, Lauf + 5(k+1)] min; letztes endet bei +27 h',
    i0.fromMs === ms && i0.toMs === ms + 5 * MIN && iLast.toMs === ms + 27 * H && iLast.fromMs === ms + 27 * H - 5 * MIN);
}

{
  const run = '2026102302';
  const m = makeRucManifest({
    run, builtAtMs: rucRunMs(run) + 45 * MIN, chunks: 208,
    stats: { cells: 48441, missing: 12, wet: 5000, maxMmH: 31.2, minPosDeltaMm: 0.0024, saturated: 0 },
    timing: { fetchMs: 1000, decodeMs: 2000, sampleMs: 3000, totalMs: 7000 },
    stations: { count: 1500, steps: RUC_STATION_STEPS, catalog: 'deadbeef' },
  });
  add('A15 makeRucManifest: Schema, Lauf-ms, Takt, Gitter t1 201 × 241 / 16, Kodierung, Quelle', m.schema === RUC_SCHEMA && m.run === run
    && m.runAtMs === rucRunMs(run) && m.stepMin === 5 && m.steps === 324 && m.horizonH === 27 && m.grid.tier === 't1' && m.grid.ny === 201
    && m.grid.nx === 241 && m.grid.chunk === 16 && m.encoding === RUC_ENCODING && m.source.model === RUC_MODEL && m.source.param === RUC_PARAM
    && typeof m.source.base === 'string' && m.source.base.includes('icon-d2-ruc') && m.chunks === 208 && m.stations.count === 1500 && m.stations.catalog === 'deadbeef');
  const back = parseRucManifest(JSON.parse(JSON.stringify(m)));
  add('A16 parseRucManifest: Rundlauf über JSON ist gleich', back != null && JSON.stringify(back) === JSON.stringify(m));
  add('A17 Gegenprobe: falsches Schema, falscher Takt, falsche Schrittzahl, falsches Gitter, Lauf ≠ runAtMs, kein Objekt ⇒ null',
    parseRucManifest({ ...m, schema: 2 }) === null && parseRucManifest({ ...m, stepMin: 15 }) === null && parseRucManifest({ ...m, steps: 108 }) === null
    && parseRucManifest({ ...m, grid: { ...m.grid, nx: 240 } }) === null && parseRucManifest({ ...m, runAtMs: m.runAtMs + H }) === null
    && parseRucManifest(null) === null && parseRucManifest('x') === null && parseRucManifest({}) === null);
  add('A18 Stationsblock ist freiwillig (null erlaubt), ohne Katalog-Hash aber ungültig', parseRucManifest({ ...m, stations: null }) != null && parseRucManifest({ ...m, stations: undefined }) != null
    && parseRucManifest({ ...m, stations: { count: 1, steps: 144 } }) === null);
}

// ---------------------------------------------------------------------------
console.log('\nB Producer-Bausteine (Fixture: ICON-D2-RUC 23.10.2026 02z, PT001H00M → PT001H05M)');
{
  const t1 = TIER_BY_ID.t1;
  const a0 = decodeGrib2(new Uint8Array(readFileSync(join(FIX, 'PT001H00M.grib2'))));
  const a1 = decodeGrib2(new Uint8Array(readFileSync(join(FIX, 'PT001H05M.grib2'))));
  add('B1 Fixture: zwei TOT_PREC-Akkumulationen seit Laufbeginn (Template 8, Prozess 1, 60 → 65 min), 542 040 Zellen, Dreiecksgitter',
    a0.values.length === 542040 && a1.values.length === 542040 && a0.unstructured && a1.unstructured && a0.statProcess === 1 && a1.statProcess === 1
    && a0.timeRangeMin === 60 && a1.timeRangeMin === 65 && a0.parameterCategory === 1 && a0.parameterNumber === 52);
  let nanSrc = 0, maxD = 0, negSrc = 0, minPos = Infinity;
  for (let i = 0; i < a0.values.length; i++) {
    const d = a1.values[i] - a0.values[i];
    if (!Number.isFinite(d)) { nanSrc++; continue; }
    if (d < 0) negSrc++;
    if (d >= RUC_DRY_MM) { if (d > maxD) maxD = d; if (d < minPos) minPos = d; }
  }
  const r = intervalRateMmH(a0.values, a1.values);
  let nanR = 0, neg = 0, mx = 0, zeroBelow = 0;
  for (let i = 0; i < r.rate.length; i++) {
    const v = r.rate[i];
    if (!Number.isFinite(v)) { nanR++; continue; }
    if (v < 0) neg++;
    if (v > mx) mx = v;
    const d = a1.values[i] - a0.values[i];
    if (Number.isFinite(d) && d < RUC_DRY_MM && v !== 0) zeroBelow++;
  }
  add('B2 Rate = Δ × 12 mm/h, Δ < 0,001 mm ⇒ 0 (auch negative Rundungsreste), NaN bleibt NaN, nie negativ', r.rate.length === 542040 && nanR === nanSrc
    && neg === 0 && zeroBelow === 0 && mx === Math.fround(maxD * RATE_PER_MM) && RATE_PER_MM === 12 && r.negatives === negSrc
    && r.minPosDeltaMm === minPos, `NaN ${nanR}, max ${mx.toFixed(2)} mm/h, negative Δ ${negSrc}, kleinstes Δ ${minPos.toExponential(2)} mm`);

  const win = JSON.parse(gunzipSync(readFileSync(join(FIX, 'clat-clon-window.json.gz'))).toString('utf8'));
  const lat = Float32Array.from(win.lat), lon = Float32Array.from(win.lon), srcIdx = Int32Array.from(win.idx);
  const idx = buildBlockMeanIndex(lat, lon, t1, srcIdx);
  let hits = 0, wrong = 0;
  const expectCell = new Map();
  for (let j = 0; j < lat.length; j++) { const c = cellOf(t1, lat[j], lon[j]); if (c) { hits++; expectCell.set(srcIdx[j], c.iy * t1.nx + c.ix); } }
  for (let cell = 0; cell < t1.ny * t1.nx; cell++) for (let o = idx.offsets[cell]; o < idx.offsets[cell + 1]; o++) if (expectCell.get(idx.cells[o]) !== cell) wrong++;
  add('B3 Blockindex (CSR): jede RUC-Zelle genau in der t1-Zelle ihres Mittelpunkts (cellOf), Quellindex erhalten, Signatur aus n/erster/letzter Zelle',
    win.n === 542040 && idx.offsets.length === t1.ny * t1.nx + 1 && idx.offsets[idx.offsets.length - 1] === hits && idx.cells.length === hits && wrong === 0
    && idx.hits === hits && idx.signature === blockIndexSignature(lat, lon) && /^11109:/.test(idx.signature), `${hits} Treffer, ${lat.length} Zellen`);

  const raw = sampleBlockMean(r.rate, idx, t1, { fill: false });
  const filled = sampleBlockMean(r.rate, idx, t1);
  const occupied = [];
  for (let cell = 0; cell < t1.ny * t1.nx; cell++) if (idx.offsets[cell + 1] > idx.offsets[cell]) occupied.push(cell);
  let brute = 0, checked = 0;
  for (let i = 0; i < 50; i++) {
    const cell = occupied[Math.floor(rnd() * occupied.length)];
    let sum = 0, n = 0;
    for (let j = 0; j < lat.length; j++) { if (expectCell.get(srcIdx[j]) !== cell) continue; const v = r.rate[srcIdx[j]]; if (Number.isFinite(v)) { sum += v; n++; } }
    const want = n ? sum / n : NaN;
    checked++;
    if ((Number.isNaN(want) && Number.isNaN(raw[cell])) || Math.abs(raw[cell] - want) <= 1e-6 + 1e-6 * Math.abs(want)) brute++;
  }
  const perCell = occupied.map((c) => idx.offsets[c + 1] - idx.offsets[c]);
  const minPer = Math.min(...perCell), maxPer = Math.max(...perCell), meanPer = perCell.reduce((a, b) => a + b, 0) / perCell.length;
  add('B4 Blockmittel = Mittel der endlichen RUC-Zellen im Block (brute force an 50 Zellen)', brute === checked && checked === 50,
    `${brute}/${checked}; RUC-Zellen je t1-Zelle ${minPer}…${maxPer} (Ø ${meanPer.toFixed(2)}) im Fenster`);
  const inner = occupied.filter((c) => { const iy = Math.floor(c / t1.nx), ix = c % t1.nx; const la = t1.lat0 + iy * t1.deg, lo = t1.lon0 + ix * t1.deg; return la > 47.6 && la < 49.4 && lo > 8.1 && lo < 10.9; });
  const innerN = inner.map((c) => idx.offsets[c + 1] - idx.offsets[c]);
  const innerMean = innerN.reduce((a, b) => a + b, 0) / innerN.length, ones = innerN.filter((n) => n === 1).length;
  add('B4b im Fensterinneren hat jede t1-Zelle 1…7 Treffer, Ø 3,5…5,5 (gemessen 23.10.: 1…7, Ø 4,4 — das Dreiecksgitter ist nicht gleichmäßig auf 0,05° verteilt)',
    innerN.every((n) => n >= 1 && n <= 7) && innerMean > 3.5 && innerMean < 5.5, `${inner.length} Zellen, Ø ${innerMean.toFixed(2)}, mit nur einem Treffer ${ones}`);

  // Zelle ohne Treffer: direkt westlich des Fensters (lon < 8) ⇒ gefüllt aus dem nächsten belegten Nachbarn; weit weg bleibt NaN
  const iyMid = Math.round((48.5 - t1.lat0) / t1.deg), ixWest = Math.round((8 - t1.lon0) / t1.deg) - 1;
  const westCell = iyMid * t1.nx + ixWest;
  const nbr = iyMid * t1.nx + ixWest + 1;
  add('B5 Zelle ohne Treffer: ohne Füllung NaN, mit Füllung = nächster belegter Nachbar; weit entfernt (Ecke) bleibt NaN',
    idx.offsets[westCell + 1] === idx.offsets[westCell] && Number.isNaN(raw[westCell]) && Number.isFinite(filled[westCell]) && filled[westCell] === raw[nbr]
    && Number.isNaN(filled[0]) && Number.isNaN(raw[0]));

  const images = encodeChunkImages([filled], t1);
  const byKey = new Map(images.map((im) => [`${im.cy}_${im.cx}`, im]));
  let bytesOk = 0, rowsOk = 0, nanOk = 0, cutOk = 0;
  for (let i = 0; i < 200; i++) {
    const cell = occupied[Math.floor(rnd() * occupied.length)];
    const iy = Math.floor(cell / t1.nx), ix = cell % t1.nx;
    const { cy, cx, column } = rucChunkOf(iy, ix);
    const im = byKey.get(`${cy}_${cx}`);
    if (im.data[rucPixelOffset(column, 0)] === encodeRucByte(filled[cell])) bytesOk++;
    if (im.data[rucPixelOffset(column, 1)] === 0 && im.data[rucPixelOffset(column, RUC_STEPS - 1)] === 0) rowsOk++;
  }
  {
    const { cy, cx, column } = rucChunkOf(0, 0); // Ecke: NaN
    if (byKey.get(`${cy}_${cx}`).data[rucPixelOffset(column, 0)] === 0) nanOk++;
    const last = byKey.get('12_15'); // angeschnitten: ny 201 ⇒ Zeilen 192…200 (9), nx 241 ⇒ Spalte 240 (1)
    let nonzeroOutside = 0;
    for (let col = 0; col < RUC_CHUNK_WIDTH; col++) { const ly = Math.floor(col / 16), lx = col % 16; if ((ly >= 9 || lx >= 1) && last.data[col] !== 0) nonzeroOutside++; }
    if (nonzeroOutside === 0) cutOk++;
  }
  add('B6 Chunk-Bilder: 208 × (324 × 256) Byte, Byte(Spalte, 0) = encodeRucByte(Wert), fehlende Schritte 0, NaN ⇒ 0, angeschnittener Chunk außerhalb 0',
    images.length === 208 && images.every((im) => im.data.length === RUC_STEPS * RUC_CHUNK_WIDTH) && bytesOk === 200 && rowsOk === 200 && nanOk === 1 && cutOk === 1,
    `${bytesOk}/200`);

  const wetChunk = images.reduce((best, im) => { let n = 0; for (let i = 0; i < RUC_CHUNK_WIDTH; i++) if (im.data[i] > 1) n++; return n > best.n ? { im, n } : best; }, { im: images[0], n: -1 }).im;
  const png = encodePng(RUC_CHUNK_WIDTH, RUC_STEPS, wetChunk.data, 1);
  const back = decodePng(png);
  let same = back.width === RUC_CHUNK_WIDTH && back.height === RUC_STEPS && back.channels === 1 && back.data.length === wetChunk.data.length;
  for (let i = 0; same && i < back.data.length; i++) if (back.data[i] !== wetChunk.data[i]) same = false;
  const allPng = images.reduce((n, im) => n + encodePng(RUC_CHUNK_WIDTH, RUC_STEPS, im.data, 1).length, 0);
  add('B7 PNG-Rundlauf (1 Kanal, 256 × 324) byte-gleich', same, `nassester Chunk ${wetChunk.cy}_${wetChunk.cx}: ${png.length} B PNG; alle 208 mit einem Schritt: ${allPng} B`);

  const st = rucStatsOf([filled], t1, r.minPosDeltaMm);
  let wet = 0, missing = 0, mxT = 0, sat = 0;
  for (let c = 0; c < filled.length; c++) { const v = filled[c]; if (Number.isNaN(v)) missing++; else { if (v > 0) wet++; if (v > mxT) mxT = v; if (encodeRucByte(v) === 255) sat++; } }
  add('B8 Statistik gezählt: Zellen 48 441, fehlend, nass, Maximum, gesättigt, kleinstes positives Δ; Manifest daraus parst',
    st.cells === 48441 && st.missing === missing && st.wet === wet && st.maxMmH === mxT && st.saturated === sat && st.minPosDeltaMm === r.minPosDeltaMm
    && parseRucManifest(JSON.parse(JSON.stringify(makeRucManifest({ run: '2026102302', builtAtMs: Date.UTC(2026, 9, 23, 2, 45), chunks: images.length, stats: st,
      timing: { fetchMs: 1, decodeMs: 1, sampleMs: 1, totalMs: 3 } })))) != null, `fehlend ${missing}, nass ${wet}, max ${mxT.toFixed(2)}`);

  const obs = JSON.parse(readFileSync(join(ROOT, 'scripts', 'lib', 'fixtures', 'obs-v1-sample.json'), 'utf8'));
  const stations = obs.catalog.stations;
  const sel = stationCellsOf(stations, t1);
  const withRr = stations.filter((s) => s.vars.includes('rr') && cellOf(t1, s.lat, s.lon));
  const series = encodeStationSeries([filled], sel.cells, RUC_STATION_STEPS);
  let stOk = 0;
  for (let j = 0; j < sel.ids.length; j++) {
    const s = stations.find((x) => x.id === sel.ids[j]);
    const c = cellOf(t1, s.lat, s.lon);
    if (series.data[j] === encodeRucByte(filled[c.iy * t1.nx + c.ix]) && series.data[series.width + j] === 0) stOk++;
  }
  add('B9 Stationsreihen: nur Stationen mit rr in der Domäne, Breite = Anzahl, Höhe 144, Zeile 0 = Byte der Zelle, Katalog-Hash',
    sel.ids.length === withRr.length && sel.ids.length > 0 && series.width === sel.ids.length && series.height === RUC_STATION_STEPS
    && series.data.length === RUC_STATION_STEPS * sel.ids.length && stOk === sel.ids.length && /^[0-9a-f]{8}$/.test(sel.catalog),
    `${sel.ids.length} von ${stations.length} Stationen, Katalog ${sel.catalog}`);
}

// ---------------------------------------------------------------------------
console.log('\nC Publisher (Git-Attrappe, CDN-Plan)');
{
  const RUN = '2026102305';
  const mkStore = () => {
    const d = mkdtempSync(join(tmpdir(), 'ruc-store-'));
    mkdirSync(join(d, RUN), { recursive: true }); mkdirSync(join(d, 'stations')); mkdirSync(join(d, '.build', RUN), { recursive: true });
    writeFileSync(join(d, 'latest.json'), JSON.stringify({ run: RUN }));
    writeFileSync(join(d, RUN, 'run.json'), JSON.stringify({ run: RUN }));
    writeFileSync(join(d, RUN, '00_00.png'), Buffer.from([1, 2, 3]));
    writeFileSync(join(d, 'stations', `${RUN}-d213d4de.png`), Buffer.from([4]));
    writeFileSync(join(d, '.build', RUN, '00_01.png'), Buffer.from([9]));
    return d;
  };
  const STAGED = ['A\truc/v1/2026102305/00_00.png', 'A\truc/v1/2026102305/run.json', 'M\truc/v1/latest.json', 'A\truc/v1/stations/2026102305-d213d4de.png', 'D\truc/v1/2026102302/00_00.png'].join('\n');
  const mkGit = ({ staged = STAGED, pushFails = 0 } = {}) => {
    const calls = [];
    let fails = pushFails;
    const git = (...a) => {
      calls.push(a.join(' '));
      switch (a[0]) {
        case 'status': return '';
        case 'diff': return staged;
        case 'push': if (fails-- > 0) { const e = new Error('push'); e.stderr = '! [rejected]        HEAD -> main (fetch first)'; throw e; } return '';
        case 'rev-parse': return 'abc1234def5678';
        default: return '';
      }
    };
    return { git, calls };
  };
  const logs = [];
  const log = (m) => logs.push(m);
  const sleepMs = () => 0;

  {
    const repo = mkdtempSync(join(tmpdir(), 'ruc-repo-')), store = mkdtempSync(join(tmpdir(), 'ruc-empty-'));
    let threw = null;
    try { publishRuc({ repoDir: repo, storeDir: store, message: 'x', git: mkGit().git, log, sleepMs }); } catch (e) { threw = e; }
    add('C1 Speicher ohne latest.json ⇒ wirft (kein leerer Publish)', threw != null && /latest\.json/.test(String(threw.message)));
    rmSync(repo, { recursive: true, force: true }); rmSync(store, { recursive: true, force: true });
  }
  {
    const repo = mkdtempSync(join(tmpdir(), 'ruc-repo-')), store = mkStore();
    const g = mkGit({ pushFails: 2 });
    const res = publishRuc({ repoDir: repo, storeDir: store, message: 'ruc: 2026102305', git: g.git, log, sleepMs, retries: 6 });
    const fetches = g.calls.filter((c) => c.startsWith('fetch ')).length, pushes = g.calls.filter((c) => c.startsWith('push ')).length;
    const dst = join(repo, RUC_REPO_PATH, 'v1');
    add('C2 abgewiesener Push ⇒ frische Basis (fetch, checkout -B FETCH_HEAD), Wiederholung; dritter Versuch landet',
      res.pushed === true && res.attempts === 3 && res.sha === 'abc1234def5678' && fetches === 3 && pushes === 3
      && g.calls.some((c) => c === 'checkout --quiet -B main FETCH_HEAD') && g.calls.some((c) => c === 'add -A -- ruc') && g.calls.some((c) => c === 'push --quiet origin HEAD:main'),
      `fetch ${fetches}, push ${pushes}, Versuche ${res.attempts}`);
    add('C3 kopiert den Speicher nach ruc/v1 ohne .build; nur der Pfad ruc wird committet', existsSync(join(dst, RUN, 'run.json')) && existsSync(join(dst, 'latest.json'))
      && existsSync(join(dst, 'stations', `${RUN}-d213d4de.png`)) && !existsSync(join(dst, '.build')) && g.calls.some((c) => c === 'commit --quiet -m ruc: 2026102305')
      && res.staged.length === 5 && res.files === 5);
    rmSync(repo, { recursive: true, force: true }); rmSync(store, { recursive: true, force: true });
  }
  {
    const repo = mkdtempSync(join(tmpdir(), 'ruc-repo-')), store = mkStore();
    const g = mkGit({ staged: `${STAGED}\nM\tpoint/index.json` });
    let threw = null;
    try { publishRuc({ repoDir: repo, storeDir: store, message: 'x', git: g.git, log, sleepMs }); } catch (e) { threw = e; }
    add('C4 Pfad außerhalb ruc/ im Commit ⇒ wirft, kein Push', threw != null && /außerhalb ruc/.test(String(threw.message)) && !g.calls.some((c) => c.startsWith('push ')));
    const g2 = mkGit({ staged: '' });
    const res = publishRuc({ repoDir: repo, storeDir: store, message: 'x', git: g2.git, log, sleepMs });
    add('C5 leerer Diff ⇒ unchanged, kein Commit, kein Push', res.pushed === false && res.unchanged === true && !g2.calls.some((c) => c.startsWith('commit') || c.startsWith('push')));
    rmSync(repo, { recursive: true, force: true }); rmSync(store, { recursive: true, force: true });
  }
  {
    const staged = STAGED.split('\n').map((l) => { const [status, path] = l.split('\t'); return { status, path }; });
    const plan = planRucCdn(staged);
    add('C6 CDN-Plan: Purge = genau latest.json (@main), Wärmen = neue Dateien des Laufs und die Stationsreihe, Gelöschtes nichts',
      plan.purge.length === 1 && plan.purge[0] === 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/ruc/v1/latest.json'
      && plan.warm.length === 3 && plan.warm.every((u) => u.startsWith('https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/ruc/v1/'))
      && !plan.warm.some((u) => u.endsWith('latest.json') || u.includes('2026102302')), `${plan.purge.length} Purge, ${plan.warm.length} warm`);
    const plan2 = planRucCdn([{ status: 'A', path: 'ruc/v1/2026102306/run.json' }]);
    add('C6b ohne geänderte latest.json kein Purge', plan2.purge.length === 0 && plan2.warm.length === 1);
  }
  {
    const seen = [];
    const fetchImpl = async (url, init) => {
      seen.push({ url, method: init?.method ?? 'GET' });
      if (url.startsWith('https://purge.jsdelivr.net/')) return { ok: true, status: 200, json: async () => ({ status: 'finished' }), text: async () => '' };
      if (url.endsWith('/latest.json')) return { ok: true, status: 200, headers: new Map([['x-cache', 'MISS']]), json: async () => ({ run: RUN }), arrayBuffer: async () => new ArrayBuffer(0) };
      return { ok: true, status: 200, headers: { get: (k) => (k === 'x-cache' ? 'MISS' : null) }, arrayBuffer: async () => new ArrayBuffer(3) };
    };
    const staged = STAGED.split('\n').map((l) => { const [status, path] = l.split('\t'); return { status, path }; });
    const rep = await syncRucCdn({ staged, run: RUN, fetchImpl, sleepImpl: async () => {}, log, budgetS: 60 });
    const purges = seen.filter((s) => s.url.startsWith('https://purge.jsdelivr.net/')).map((s) => s.url);
    const warms = seen.filter((s) => !s.url.startsWith('https://purge.jsdelivr.net/') && !s.url.endsWith('/latest.json'));
    add('C7 syncRucCdn: ein Purge von latest.json, Frischeprüfung (run im JSON), 3 Dateien gewärmt, Bericht',
      purges.length === 1 && purges[0] === 'https://purge.jsdelivr.net/gh/jppetry/buscosun-data@main/ruc/v1/latest.json' && rep.latest?.fresh === true
      && warms.length === 3 && rep.warm?.ok === 3 && rep.warm?.total === 3, `Purges ${purges.length}, warm ${warms.length}, frisch ${rep.latest?.fresh}`);
    const rep2 = await syncRucCdn({ staged, run: RUN, fetchImpl: async () => { throw new Error('net down'); }, sleepImpl: async () => {}, log, budgetS: 1 });
    add('C8 CDN-Fehler sind nie fatal (Bericht statt Ausnahme)', rep2 != null && rep2.latest?.fresh === false && (rep2.warm == null || rep2.warm.ok === 0));
  }
}

// ---------------------------------------------------------------------------
console.log('\nD Workflow-Vorlage scripts/ruc/workflow-ruc.yml');
{
  const wfPath = join(ROOT, 'scripts', 'ruc', 'workflow-ruc.yml');
  const wf = existsSync(wfPath) ? readFileSync(wfPath, 'utf8') : '';
  const cronOf = (text) => [...text.matchAll(/^\s+-\s+cron:\s*'([^']+)'/gm)].map((m) => m[1]);
  const minutesOf = (expr) => expr.split(/\s+/)[0].split(',').flatMap((m) => { const s = m.match(/^(\d+)-(\d+)$/); return s ? Array.from({ length: +s[2] - +s[1] + 1 }, (_, i) => +s[1] + i) : [+m]; });
  const crons = cronOf(wf);
  const minute = crons.length === 1 ? minutesOf(crons[0]) : [];
  add('D1 genau ein Cron, stündlich, eine Minute im Fenster 46…59 (RUC vollständig um H:41, Reserve ≥ 5 min)',
    crons.length === 1 && /^\d+ \* \* \* \*$/.test(crons[0]) && minute.length === 1 && minute[0] >= 46 && minute[0] <= 59, crons.join(' | '));
  // alle anderen Vorlagen: die Minute ist frei
  const templates = [];
  const walk = (dir) => { for (const e of readdirSync(dir, { withFileTypes: true })) { const p = join(dir, e.name); if (e.isDirectory()) walk(p); else if (/^workflow-.*\.yml$/.test(e.name) && p !== wfPath) templates.push(p); } };
  walk(join(ROOT, 'scripts'));
  const taken = new Map();
  for (const t of templates) for (const c of cronOf(readFileSync(t, 'utf8'))) for (const m of minutesOf(c)) taken.set(m, [...(taken.get(m) ?? []), t.slice(ROOT.length + 1)]);
  add('D2 die Minute ist in keiner anderen Vorlage unter scripts/**/workflow-*.yml belegt', minute.length === 1 && !taken.has(minute[0]),
    `${templates.length} Vorlagen, belegt: ${[...taken.keys()].sort((a, b) => a - b).join(',')}`);
  const build = readFileSync(join(ROOT, 'scripts', 'repack-repo', 'workflow-build.yml'), 'utf8');
  const forceMin = cronOf(build).flatMap(minutesOf);
  const dist = (a, b) => Math.min(Math.abs(a - b), 60 - Math.abs(a - b));
  add('D3 ≥ 15 min Abstand zu den Force-Push-Fenstern der Kartenlinie (workflow-build.yml :20/:30)', forceMin.length === 2 && minute.length === 1
    && forceMin.every((m) => dist(m, minute[0]) >= 15), `Kartenlinie ${forceMin.join('/')}, Abstand ${forceMin.map((m) => dist(m, minute[0])).join('/')}`);
  const timeout = +(wf.match(/timeout-minutes:\s*(\d+)/)?.[1] ?? 0);
  add('D4 timeout-minutes ≥ 10 (Volllauf gemessen 69 s + Checkout), Concurrency-Gruppe ruc, Kill-Variable RUC_KILL, workflow_dispatch',
    timeout >= 10 && /group:\s*ruc\b/.test(wf) && /vars\.RUC_KILL\s*!=\s*'1'/.test(wf) && /workflow_dispatch/.test(wf), `timeout ${timeout}`);
  add('D5 Producer-Checkout sparse: scripts, src, package.json; Vorhandensein der drei Kerndateien geprüft (Leerlauf vor dem Push von buscosun-web)',
    /sparse-checkout set --no-cone scripts src package\.json/.test(wf) && /scripts\/ruc\/ruc-build\.mjs/.test(wf) && /scripts\/ruc\/ruc-publish\.mjs/.test(wf) && /src\/point\/rucFormat\.ts/.test(wf));
  add('D6 Daten-Repo sparse auf ruc; Stationskatalog per GET von raw.githubusercontent (obs/v1/stations.json), fehlt er, läuft der Bau ohne Stationsreihen',
    /sparse-checkout:\s*ruc\b/.test(wf) && /raw\.githubusercontent\.com\/jppetry\/buscosun-data\/main\/obs\/v1\/stations\.json/.test(wf) && /--obs=/.test(wf));
  add('D7 Bau in den Speicher, Publish mit --repo=data --store=store; Cache der Zellkoordinaten über actions/cache',
    /ruc-build\.mjs --store=\.\.\/store/.test(wf) && /ruc-publish\.mjs --repo=data --store=store/.test(wf) && /actions\/cache/.test(wf) && /--cache=\.\.\/cache/.test(wf));
  const ms = readFileSync(join(ROOT, 'MANUELLE-SCHRITTE.md'), 'utf8');
  const sec74 = ms.slice(ms.indexOf('\n## 74.'));
  add('D8 MANUELLE-SCHRITTE §74: Vorlage als .github/workflows/ruc.yml im Daten-Repo, Variable RUC_KILL, Erstlauf (Run workflow), Rückfall ?ruc=0, Messung T9',
    ms.includes('\n## 74.') && /workflows\/ruc\.yml/.test(sec74) && /RUC_KILL/.test(sec74) && /Run workflow/.test(sec74) && /\?ruc=0/.test(sec74) && /ruc-measure\.mjs/.test(sec74));
}

// ---------------------------------------------------------------------------
console.log('\nE Leser am Punkt src/point/client/rucPoint.ts (memoryStore mit echtem Chunk 02_13 und Manifest des Laufs 2026102305)');
{
  const RUN = '2026102305', RUN_MS = rucRunMs(RUN);
  const manifestBytes = new Uint8Array(readFileSync(join(FIX, `run-${RUN}.json`)));
  const chunkBytes = new Uint8Array(readFileSync(join(FIX, `chunk-${RUN}-02_13.png`)));
  const manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8'));
  const files = new Map([[rucLatestPath(), manifestBytes], [rucChunkPath(RUN, 2, 13), chunkBytes]]);
  const decode = (b) => decodePng(b);
  const t1 = TIER_BY_ID.t1;
  // Zelle iy 40, ix 215 liegt im Chunk 2_13 (Zeilen 32…47, Spalten 208…223): 47,5°N 16,25°E, Spalte 8·16 + 7 = 135
  const LAT = t1.lat0 + 40 * t1.deg, LON = t1.lon0 + 215 * t1.deg;
  const png = decodePng(chunkBytes);
  add('E0 Fixture: Manifest parst (Schema 1, Lauf 2026102305, 208 Chunks, missing 0), Chunk 256 × 324 × 1', parseRucManifest(manifest) != null && manifest.run === RUN
    && manifest.chunks === 208 && manifest.stats.missing === 0 && png.width === RUC_CHUNK_WIDTH && png.height === RUC_STEPS && png.channels === 1);
  {
    const store = memoryStore(files);
    const s = await loadRucPoint(store, LAT, LON, RUN_MS + 50 * MIN, decode);
    let same = 0, nulls = 0, wet = 0, times = 0;
    for (let k = 0; k < RUC_STEPS; k++) {
      const b = png.data[rucPixelOffset(135, k)];
      const want = decodeRucByte(b);
      const p = s?.points[k];
      if (p && ((want == null && p.mmH == null) || p.mmH === want)) same++;
      if (p?.mmH == null) nulls++; else if (p.mmH > 0) wet++;
      if (p && p.fromMs === RUN_MS + k * 5 * MIN && p.toMs === p.fromMs + 5 * MIN) times++;
    }
    add('E1 Reihe: Lauf, Laufzeit, 5 min, 324 Punkte = Spalte 135 des Chunks (Byte-Umkehr), Zeiten = rucIntervalMs', s != null && s.run === RUN && s.runAtMs === RUN_MS
      && s.stepMin === 5 && s.points.length === RUC_STEPS && same === RUC_STEPS && times === RUC_STEPS && s.cell.iy === 40 && s.cell.ix === 215
      && s.chunk.cy === 2 && s.chunk.cx === 13 && s.chunk.column === 135, `${same}/324 gleich, nass ${wet}, ohne Wert ${nulls}`);
    add('E2 Alter = Minuten seit dem Lauf (50), letztes Intervall endet bei +27 h, ein Manifest + EIN Chunk geholt (eine Zelle, V-RUC-8)',
      s != null && s.ageMin === 50 && s.points[RUC_STEPS - 1].toMs === RUN_MS + 27 * H && store.stats.files === 2 && store.stats.misses === 0, `files ${store.stats.files}`);
    add('E2b die Zelle hat Regen im Lauf (Fixture gewählt als mittelgroßer Chunk)', wet > 0, `${wet} nasse Intervalle`);
  }
  {
    const store = memoryStore(files);
    const stale = await loadRucPoint(store, LAT, LON, RUN_MS + 3 * H + MIN, decode);
    const edge = await loadRucPoint(memoryStore(files), LAT, LON, RUN_MS + 3 * H, decode);
    add('E3 Alter > 3 h ⇒ null ohne Chunk-Abruf; genau 3 h ⇒ Reihe', stale === null && store.stats.files === 1 && edge != null && edge.ageMin === 180);
  }
  {
    const empty = await loadRucPoint(memoryStore(new Map()), LAT, LON, RUN_MS + MIN, decode);
    const wrong = await loadRucPoint(memoryStore(new Map([[rucLatestPath(), new TextEncoder().encode(JSON.stringify({ ...manifest, schema: 2 }))]])), LAT, LON, RUN_MS + MIN, decode);
    const noChunkStore = memoryStore(new Map([[rucLatestPath(), manifestBytes]]));
    const noChunk = await loadRucPoint(noChunkStore, LAT, LON, RUN_MS + MIN, decode);
    const outside = await loadRucPoint(memoryStore(files), 60, 10, RUN_MS + MIN, decode);
    const otherChunk = await loadRucPoint(memoryStore(files), LAT, LON + 1, RUN_MS + MIN, decode);
    add('E4 kein Manifest ⇒ null; fremdes Schema ⇒ null; Chunk 404 ⇒ null (Befund, kein Fehler); außerhalb der Domäne ⇒ null (ohne Abruf); anderer Chunk fehlt ⇒ null',
      empty === null && wrong === null && noChunk === null && noChunkStore.stats.misses === 1 && outside === null && otherChunk === null);
  }
  {
    const s2 = await loadRucPoint(memoryStore(files), t1.lat0 + 33 * t1.deg, t1.lon0 + 209 * t1.deg, RUN_MS + MIN, decode);
    const col = (33 % 16) * 16 + (209 % 16);
    let same = 0;
    for (let k = 0; k < RUC_STEPS; k++) { const want = decodeRucByte(png.data[rucPixelOffset(col, k)]); const p = s2.points[k]; if ((want == null && p.mmH == null) || p.mmH === want) same++; }
    add('E5 andere Zelle desselben Chunks liest ihre eigene Spalte', s2 != null && s2.chunk.column === col && same === RUC_STEPS, `Spalte ${col}`);
    const bad = await loadRucPoint(memoryStore(new Map([[rucLatestPath(), manifestBytes], [rucChunkPath(RUN, 2, 13), new Uint8Array([1, 2, 3])]])), LAT, LON, RUN_MS + MIN, decode).catch(() => 'threw');
    add('E6 kaputter Chunk ⇒ null, keine Ausnahme', bad === null);
  }
}

// ---------------------------------------------------------------------------
console.log('\nF Anpassung an buscosun Fusion 13 src/nowcast/rucSeries.ts');
{
  const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);
  const RUN_MS = NOW - 50 * MIN; // Lauf 09:00 UTC, jetzt 09:50
  const STEP = 5 * MIN;
  add('F1 Schalter: voreingestellt AN (E-RUC-7 gedreht, Jan 23.10.), ?ruc=0 = Rückfall (alles wie vor RUC), ?ruc=1 an, andere Parameter egal',
    rucEnabledFrom('') && rucEnabledFrom('?ruc=1') && !rucEnabledFrom('?ruc=0') && rucEnabledFrom('?x=1&ruc=1') && rucEnabledFrom('?rb=0') && rucEnabledFrom('?ruc=true'));
  add('F1b ?rucbase= nur als http(s)-Origin (lokaler Nachbau), sonst null; Schrägstrich am Ende entfernt',
    rucBaseFrom('') === null && rucBaseFrom('?rucbase=http://127.0.0.1:8765/store/') === 'http://127.0.0.1:8765/store' && rucBaseFrom('?rucbase=javascript:x') === null && rucBaseFrom('?rucbase=ftp://x') === null);
  const mkRuc = (values) => ({
    run: '2026102309', runAtMs: RUN_MS, builtAtMs: RUN_MS + 45 * MIN, ageMin: 50, stepMin: 5, cell: { iy: 0, ix: 0 }, chunk: { cy: 0, cx: 0, column: 0 },
    manifest: null, points: values.map((v, k) => ({ fromMs: RUN_MS + k * STEP, toMs: RUN_MS + (k + 1) * STEP, mmH: v })),
  });
  const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  // 40 Versuche × 27 Stunden: je Stunde zwölf Zufallswerte (teils 0) und ein f aus {0, klein, groß}
  let hours = 0, sumOk = 0, kindOk = 0, shapeOk = 0, nForm = 0, nFlat = 0, nMixed = 0, nDry = 0;
  for (let trial = 0; trial < 40; trial++) {
    const vals = [];
    for (let k = 0; k < RUC_STEPS; k++) vals.push(rnd() < 0.3 ? 0 : +(rnd() * 6).toFixed(3));
    const fusion = [];
    for (let h = 1; h <= 27; h++) { const u = rnd(); fusion.push({ tMs: RUN_MS + h * H, mmH: u < 0.25 ? 0 : u < 0.6 ? +(rnd() * 2).toFixed(3) : +(rnd() * 30).toFixed(3), conf: 0.5 }); }
    const fit = fitRucToFusion(mkRuc(vals), fusion, NOW);
    for (const hr of fit.hours) {
      hours++;
      const f = fusion.find((x) => x.tMs === hr.hourEndMs).mmH;
      const pts = fit.points.filter((p) => p.fromMs >= hr.hourStartMs && p.toMs <= hr.hourEndMs);
      const k0 = (hr.hourStartMs - RUN_MS) / STEP;
      const raw = vals.slice(k0, k0 + 12);
      const r = raw.reduce((a, b) => a + b, 0) / 12;
      if (pts.length === 12 && close(pts.reduce((a, p) => a + p.mmH, 0) / 12, f)) sumOk++;
      const want = f <= 0 ? 'dry' : r <= 0 ? 'flat' : f / r <= RUC_CAP_FACTOR ? 'form' : 'mixed';
      if (hr.kind === want && pts.every((p) => p.kind === want)) kindOk++;
      if (want === 'dry') { nDry++; if (pts.every((p) => p.mmH === 0)) shapeOk++; }
      else if (want === 'flat') { nFlat++; if (pts.every((p) => close(p.mmH, f))) shapeOk++; }
      else if (want === 'form') { nForm++; if (pts.every((p, i) => close(p.mmH, raw[i] * (f / r))) && close(hr.factor, f / r)) shapeOk++; }
      else { nMixed++; if (pts.every((p, i) => close(p.mmH - pts[0].mmH, RUC_CAP_FACTOR * (raw[i] - raw[0]))) && hr.factor === RUC_CAP_FACTOR && pts.every((p) => p.mmH >= 0)) shapeOk++; }
    }
  }
  add('F2 Stundenmittel der zwölf Punkte = f exakt (1e-9) in allen Fällen', hours > 900 && sumOk === hours, `${sumOk}/${hours} Stunden`);
  add('F3 Art je Stunde: f ≤ 0 ⇒ dry (Nullen), r ≤ 0 < f ⇒ flat (zwölfmal f), f/r ≤ 4 ⇒ form (Faktor), > 4 ⇒ mixed (×4 + flacher Rest ≥ 0)',
    kindOk === hours && shapeOk === hours, `form ${nForm}, flat ${nFlat}, mixed ${nMixed}, dry ${nDry}`);
  {
    const vals = new Array(RUC_STEPS).fill(1); // 1 mm/h überall, Stunde 4 (Intervalle 36…47) trocken im RUC
    for (let k = 36; k < 48; k++) vals[k] = 0;
    const fusion = [{ tMs: RUN_MS + H, mmH: 4, conf: 0.5 }, { tMs: RUN_MS + 2 * H, mmH: 4.0004, conf: 0.5 }, { tMs: RUN_MS + 3 * H, mmH: 0, conf: 0.5 }, { tMs: RUN_MS + 4 * H, mmH: 2.5, conf: 0.5 }];
    const fit = fitRucToFusion(mkRuc(vals), fusion, NOW);
    const [h1, h2, h3, h4] = fit.hours;
    add('F4 Kappe greift genau über 4: Faktor 4 ⇒ form, 4,0001 ⇒ mixed mit Rest 0,0004, f = 0 ⇒ dry, RUC trocken bei f = 2,5 ⇒ flat (zwölfmal 2,5)',
      fit.hours.length === 4 && h1.kind === 'form' && h1.factor === 4 && h2.kind === 'mixed' && h2.factor === RUC_CAP_FACTOR && close(fit.points[12].mmH, 4.0004)
      && h3.kind === 'dry' && fit.points[24].mmH === 0 && h4.kind === 'flat' && h4.factor === 0 && fit.points.slice(36, 48).every((p) => p.mmH === 2.5 && p.kind === 'flat')
      && fit.stats.form === 1 && fit.stats.mixed === 1 && fit.stats.dry === 1 && fit.stats.flat === 1);
  }
  {
    const vals = new Array(RUC_STEPS).fill(0.5);
    vals[15] = null; // Intervall in Stunde 2 (Lauf + 1 h … + 2 h) fehlt
    const fusion = [];
    for (let h = 1; h <= 30; h++) fusion.push({ tMs: RUN_MS + h * H, mmH: 1, conf: 0.5 });
    fusion.push({ tMs: RUN_MS - H, mmH: 1, conf: 0.5 }); // Stunde vor dem Lauf
    const fit = fitRucToFusion(mkRuc(vals), fusion, NOW);
    const h2 = fit.hours.find((h) => h.hourEndMs === RUN_MS + 2 * H);
    add('F5 fehlendes Intervall ⇒ die Stunde trägt keine Punkte (gezählt als missing); Stunden vor dem Lauf und jenseits +27 h werden nicht angepasst',
      h2 == null && fit.hours.length === 26 && fit.stats.missing === 1 && fit.points.length === 26 * 12 && fit.hours[0].hourStartMs === RUN_MS
      && fit.hours[fit.hours.length - 1].hourEndMs === RUN_MS + 27 * H && fit.fromMs === RUN_MS && fit.toMs === RUN_MS + 27 * H,
      `${fit.hours.length} Stunden, ${fit.points.length} Punkte, missing ${fit.stats.missing}`);
    const p0 = fit.points[0], pLastH1 = fit.points[11], pFirstH3 = fit.points[12];
    add('F6 rucAt: (from, to] — Anfang des ersten Intervalls, Ende eines Intervalls, 1 ms danach das nächste, in der Lücke null, vor/nach der Reihe null',
      rucAt(fit, p0.fromMs) === p0.mmH && rucAt(fit, pLastH1.toMs) === pLastH1.mmH && rucAt(fit, pLastH1.toMs + 1) === null
      && rucAt(fit, pFirstH3.fromMs + 1) === pFirstH3.mmH && rucAt(fit, RUN_MS - 1) === null && rucAt(fit, RUN_MS + 27 * H + 1) === null
      && rucAt(fit, RUN_MS + 90 * MIN) === null);
  }
  {
    const fit = fitRucToFusion(mkRuc(new Array(RUC_STEPS).fill(0.2)), [], NOW);
    add('F7 ohne Fusion-Stunden keine Punkte (die Stundensumme ist die Wahrheit, nicht der RUC)', fit.hours.length === 0 && fit.points.length === 0 && rucAt(fit, RUN_MS + MIN) === null);
  }
}

// ---------------------------------------------------------------------------
console.log('\nG Verdrahtung im Regenradar (ohne ruc byte-gleich; mit ruc: Beginn aus dem ersten nassen Intervall, Spanne nach Vorlauf, Ende, Minutenverlauf, Ereignisse)');
{
  // jetzt 10:00 UTC = 12:00 Europe/Berlin (CEST); Lauf 09:00 UTC
  const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);
  const RUN_MS = NOW - H;
  const STEP = 5 * MIN;
  const mkRuc = (values) => ({
    run: '2026102309', runAtMs: RUN_MS, builtAtMs: RUN_MS + 45 * MIN, ageMin: 60, stepMin: 5, cell: { iy: 0, ix: 0 }, chunk: { cy: 0, cx: 0, column: 0 },
    manifest: null, points: values.map((v, k) => ({ fromMs: RUN_MS + k * STEP, toMs: RUN_MS + (k + 1) * STEP, mmH: v })),
  });
  /** Fusion-Stunden (Ende der Stunde) und P(nass) (Beginn der Stunde) aus einer Tabelle je Stundenbeginn UTC-Stunde des 23.10. */
  const scenario = (mmByStartH, pByStartH, ruc) => {
    const fusionHours = [], fusionPWet = [];
    for (let h = 1; h <= 30; h++) {
      const start = RUN_MS + (h - 1) * H;
      const key = 9 + h - 1; // UTC-Stunde des Beginns (kann > 23 laufen)
      fusionHours.push({ tMs: start + H, mmH: mmByStartH[key] ?? 0, conf: 0.5, tempC: 10, snowLineM: null, windDir: null, windMs: null, gustMs: null });
      fusionPWet.push({ tMs: start, p: pByStartH[key] ?? 0.05 });
    }
    const vals = new Array(RUC_STEPS).fill(0);
    for (const [k0, k1, v] of ruc) for (let k = k0; k < k1; k++) vals[k] = v;
    return { fusionHours, fusionPWet, fit: fitRucToFusion(mkRuc(vals), fusionHours, NOW) };
  };
  const kOf = (utcH, min = 0) => (utcH - 9) * 12 + min / 5; // Intervallindex eines UTC-Zeitpunkts des 23.10.
  const lc = (utcH, min = 0) => clock(Date.UTC(2026, 9, 23, utcH, min)); // Uhrzeit Europe/Berlin
  const rad = (onset, end = null, wetNow = false, horizonMin = 120) => ({ kind: 'extrapolation', product: 'RADOLAN-RV', horizonMin, wetNow, onsetMin: onset, endMin: end });

  // A: Regen ab 12:40 UTC in der Stunde 12–13 (f 1,2, p 0,7), 13–14 (0,8, p 0,6), 14–15 (0,3, p 0,4)
  const A = scenario({ 12: 1.2, 13: 0.8, 14: 0.3 }, { 12: 0.7, 13: 0.6, 14: 0.4 }, [[kOf(12, 40), kOf(14), 2], [kOf(14), kOf(15), 1]]);
  {
    const base = { nowMs: NOW, radar: null, fusion: A.fusionPWet };
    const w0 = computeRainWindow(base), wNull = computeRainWindow({ ...base, ruc: null }), wUndef = computeRainWindow({ ...base, ruc: undefined });
    add('G1 computeRainWindow ohne ruc / ruc: null / ruc: undefined byte-gleich (Stundenregel wie heute)', JSON.stringify(w0) === JSON.stringify(wNull) && JSON.stringify(w0) === JSON.stringify(wUndef)
      && w0.source === 'fusion' && w0.precision === 'hour', w0.sentence);
    const w = computeRainWindow({ ...base, ruc: A.fit });
    add(`G2 mit ruc: Beginn = erstes nasses Intervall (${lc(12, 40)}), Vorlauf 2 h 40 ⇒ ±15 min, Kern (p 0,7) ⇒ „Regen wahrscheinlich ab etwa ${lc(12, 40)} (±15 min)"`,
      w.kind === 'onset' && w.source === 'ruc' && w.precision === 'min' && !w.uncertain && w.fromMs === NOW + 145 * MIN && w.toMs === NOW + 175 * MIN && w.prob === 0.7
      && w.sentence === `Regen wahrscheinlich ab etwa ${lc(12, 40)} (±15 min)` && w.label === `Regen ~${lc(12, 40)}` && w.sourceLabel === 'buscosun Fusion · 5 min (ICON-D2-RUC)'
      && w.notes.some((n) => /ICON-D2-RUC/.test(n) && /±15\/30\/45/.test(n)), `${w.sentence} · ${w.sourceLabel}`);
    const wr = computeRainWindow({ ...base, radar: rad(null), ruc: A.fit });
    add('G3 Radar trocken bis +2 h ⇒ die RUC-Regel gilt dahinter (gleicher Satz)', wr.kind === 'onset' && wr.source === 'ruc' && wr.sentence === w.sentence);
    const wrad = computeRainWindow({ ...base, radar: rad(30), ruc: A.fit });
    add('G4 Radar sieht den Beginn (30 min) ⇒ Radar-Regel vor der RUC-Regel', wrad.source === 'radar' && wrad.precision === 'min');
  }
  {
    // B: dieselbe Fusion, RUC trocken ⇒ Stunde 12–13 flat ⇒ Stundensatz wie heute
    const B = scenario({ 12: 1.2, 13: 0.8, 14: 0.3 }, { 12: 0.7, 13: 0.6, 14: 0.4 }, []);
    const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: B.fusionPWet, ruc: B.fit });
    const w0 = computeRainWindow({ nowMs: NOW, radar: null, fusion: B.fusionPWet });
    add('G5 flache Stunde (RUC trocken, Fusion nass) ⇒ Stundensatz wie heute', B.fit.hours.find((h) => h.hourStartMs === Date.UTC(2026, 9, 23, 12)).kind === 'flat'
      && w.source === 'fusion' && w.precision === 'hour' && w.sentence === w0.sentence, w.sentence);
    // Rand-Stunde (p 0,35 < Kern): „möglich", unsicher, ohne ±
    const C = scenario({ 12: 1.2 }, { 12: 0.35 }, [[kOf(12, 40), kOf(13), 2]]);
    const wc = computeRainWindow({ nowMs: NOW, radar: null, fusion: C.fusionPWet, ruc: C.fit });
    add(`G6 Rand (p 0,35) ⇒ „Regen möglich ab etwa ${lc(12, 40)}", unsicher`, wc.source === 'ruc' && wc.uncertain && wc.sentence === `Regen möglich ab etwa ${lc(12, 40)}` && wc.prob === 0.35, wc.sentence);
    // nasses Intervall in einer Stunde unter dem Rand (p 0,1) zählt nicht; die spätere Stunde trägt
    const D = scenario({ 11: 0.5, 13: 1.0 }, { 11: 0.1, 13: 0.8 }, [[kOf(11, 30), kOf(12), 1], [kOf(13, 20), kOf(14), 2]]);
    const wd = computeRainWindow({ nowMs: NOW, radar: null, fusion: D.fusionPWet, ruc: D.fit });
    add(`G7 nasses Intervall in einer Stunde mit p < 30 % ist Rauschen; Beginn ${lc(13, 20)} aus der Stunde mit p 0,8`, wd.source === 'ruc' && wd.sentence === `Regen wahrscheinlich ab etwa ${lc(13, 20)} (±30 min)`, wd.sentence);
  }
  {
    // Spannen nach Vorlauf: 5 h ⇒ ±30, 14 h 15 ⇒ ±45 (morgen 02:15 Ortszeit)
    const E = scenario({ 15: 1 }, { 15: 0.8 }, [[kOf(15), kOf(16), 1]]);
    const we = computeRainWindow({ nowMs: NOW, radar: null, fusion: E.fusionPWet, ruc: E.fit });
    const F = scenario({ 24: 1 }, { 24: 0.8 }, [[kOf(24, 15), kOf(25), 1]]);
    const wf = computeRainWindow({ nowMs: NOW, radar: null, fusion: F.fusionPWet, ruc: F.fit });
    add('G8 Spanne nach Vorlauf: 5 h ⇒ ±30 min, 14 h 15 ⇒ ±45 min mit Tageswort „morgen"', we.source === 'ruc' && we.sentence === `Regen wahrscheinlich ab etwa ${lc(15)} (±30 min)` && we.toMs - we.fromMs === 60 * MIN
      && wf.source === 'ruc' && wf.sentence === `Regen wahrscheinlich morgen ab etwa ${lc(24, 15)} (±45 min)` && wf.toMs - wf.fromMs === 90 * MIN, `${we.sentence} | ${wf.sentence}`);
  }
  {
    // Ende: es regnet (p 0,9 jetzt), Stunde 12–13 UTC p 0,4 mit f 0,5; RUC nass bis 12:30 UTC, dann sechs trockene Intervalle
    const G = scenario({ 9: 2, 10: 2, 11: 2, 12: 0.5 }, { 9: 0.9, 10: 0.9, 11: 0.9, 12: 0.4, 13: 0.1 }, [[0, kOf(12, 30), 2]]);
    const wg = computeRainWindow({ nowMs: NOW, radar: null, fusion: G.fusionPWet, ruc: G.fit });
    const wg0 = computeRainWindow({ nowMs: NOW, radar: null, fusion: G.fusionPWet });
    add(`G9 Ende: erstes trockenes 30-min-Fenster (${lc(12, 30)}) in einer Stunde mit p < 50 % ⇒ „Regen hört voraussichtlich gegen ${lc(12, 30)} auf (±15 min)", Sicherheit 1 − p`,
      wg.kind === 'end' && wg.source === 'ruc' && wg.precision === 'min' && wg.sentence === `Regen hört voraussichtlich gegen ${lc(12, 30)} auf (±15 min)` && Math.abs(wg.prob - 0.6) < 1e-9
      && wg.fromMs === NOW + 135 * MIN && wg.toMs === NOW + 165 * MIN && wg0.kind === 'end' && wg0.source === 'fusion', `${wg.sentence} | ohne ruc: ${wg0.sentence}`);
  }
  {
    // Minutenverlauf
    const inp = { nowMs: NOW, radarFrames: [], radarSource: '', fusionHours: A.fusionHours, fusionPWet: A.fusionPWet, fusionLabel: 'buscosun Fusion' };
    const s0 = buildMinuteSeries(inp), sNull = buildMinuteSeries({ ...inp, ruc: null });
    add('G10 buildMinuteSeries ohne ruc / ruc: null byte-gleich', JSON.stringify(s0) === JSON.stringify(sNull) && s0.ruc === null && s0.firstWet.source === 'fusion');
    const s = buildMinuteSeries({ ...inp, ruc: A.fit });
    const covered = s.hours.filter((b) => b.rucCovered).length, uncovered = s.hours.filter((b) => !b.rucCovered).length;
    const v = valueAt(s, NOW + 165 * MIN), vh = valueAt(s, NOW + 28 * H);
    add('G11 mit ruc: 5-min-Stufen ab der Naht bis +27 h (312 Punkte), erster Regen aus dem RUC-Intervall, Spitze 3,6 mm/h (2 × Faktor 1,8), 26 Stunden als „gedeckt" markiert, 3 Balken dahinter (Szenario trägt 30 Stunden)',
      s.ruc != null && s.ruc.points.length === 312 && s.ruc.fromMs === NOW && s.ruc.toMs === RUN_MS + 27 * H && s.firstWet.source === 'ruc' && s.firstWet.tMs === NOW + 160 * MIN
      && Math.abs(s.peak.mmH - 3.6) < 1e-9 && s.peak.source === 'ruc' && covered === 26 && uncovered === 3 && s.ruc.label === `${RUC_LABEL} · 5-min-Form`
      && v?.source === 'ruc' && Math.abs(v.mmH - 3.6) < 1e-9 && vh?.source === 'fusion' && Math.abs(s.sumMm - s0.sumMm) < 0.11,
      `Punkte ${s.ruc?.points.length}, gedeckt ${covered}, Summe ${s.sumMm} gegen ${s0.sumMm}`);
    const frames = [{ tMs: NOW, mmH: 0 }, { tMs: NOW + 60 * MIN, mmH: 0 }, { tMs: NOW + 120 * MIN, mmH: 0 }];
    const sr = buildMinuteSeries({ ...inp, radarFrames: frames, radarSource: 'radolan_rv', ruc: A.fit });
    add('G12 mit Radar: RUC-Stufen beginnen an der Radar-Naht (+2 h), das erste Intervall angeschnitten; Radar-Minuten unverändert',
      sr.radar != null && sr.ruc != null && sr.ruc.fromMs === NOW + 120 * MIN && sr.ruc.points[0].fromMs === NOW + 120 * MIN && sr.ruc.points.length === 288
      && sr.radar.points.length === buildMinuteSeries({ ...inp, radarFrames: frames, radarSource: 'radolan_rv' }).radar.points.length);
    const sFlat = buildMinuteSeries({ ...inp, ruc: scenario({ 12: 1.2 }, { 12: 0.7 }, []).fit });
    add('G13 flache Stunde ⇒ erster Regen mit Stundenauflösung (Quelle fusion, Stundenbeginn), die Stufen tragen kind flat', sFlat.firstWet.source === 'fusion' && sFlat.firstWet.tMs === Date.UTC(2026, 9, 23, 12)
      && sFlat.ruc?.points.some((p) => p.kind === 'flat' && p.mmH === 1.2));
  }
  {
    // Engine: rucAt ersetzt den Modellteil, wo es trägt; ohne rucAt byte-gleich
    const nwp = [];
    for (let h = 0; h <= 8; h++) nwp.push({ tMs: NOW + h * H, mmH: 0.05, conf: 0.5, snowLineM: null, tempC: 10 });
    const base = { nowMs: NOW, radarSampleAt: () => null, radarValidUntilMs: 0, radarSource: '', runAtMs: NOW, fetchedAtMs: NOW, nwp, nwpSource: 'cube' };
    const n0 = assembleNowcast(base), nNull = assembleNowcast({ ...base, rucAt: () => null });
    add('G14 assembleNowcast ohne rucAt / rucAt ⇒ null byte-gleich', JSON.stringify(n0) === JSON.stringify(nNull));
    const n1 = assembleNowcast({ ...base, rucAt: (eta) => (eta >= NOW + 150 * MIN ? 3 : null) });
    add('G15 rucAt trägt ab +150 min: Schritte davor 0,05 (Fusion-Stunde), ab 150 min 3 mm/h; Regenbeginn 150 min',
      n1.steps.filter((s) => s.minutes < 150).every((s) => s.mmH === 0.05) && n1.steps.filter((s) => s.minutes >= 150).every((s) => s.mmH === 3) && n1.nextRainInMin === 150);
    const radarBase = { ...base, radarSampleAt: (eta) => (eta <= NOW + 120 * MIN ? 1 : null), radarValidUntilMs: NOW + 120 * MIN, radarSource: 'radolan_rv' };
    const nb0 = assembleNowcast(radarBase), nb1 = assembleNowcast({ ...radarBase, rucAt: () => 5 });
    const blend0 = nb0.steps.find((s) => s.minutes === 120), blend1 = nb1.steps.find((s) => s.minutes === 120);
    add('G16 Überblendung 90–150 min: die Modellseite ist der RUC-Wert (bei 120 min: 1·0,5 + 5·0,5 = 3 statt 0,525), Radarseite unverändert',
      blend0.source === 'blend' && Math.abs(blend0.mmH - 0.525) < 1e-9 && Math.abs(blend1.mmH - 3) < 1e-9 && nb1.steps.find((s) => s.minutes === 60).mmH === 1);
  }
  {
    // Ereignisse: Beginn ≤ 27 h minutengenau aus dem RUC, danach Stunden
    const F = scenario({ 24: 1, 36: 1 }, { 24: 0.8, 36: 0.8 }, [[kOf(24, 15), kOf(25), 1]]); // Stunde 36 (12:00 UTC 24.10.) liegt hinter +27 h
    const nwp = F.fusionHours.filter((h) => h.tMs <= NOW + 8 * H).map((h) => ({ tMs: h.tMs, mmH: h.mmH, conf: h.conf, snowLineM: null, tempC: 10 }));
    const nc = assembleNowcast({ nowMs: NOW, radarSampleAt: () => null, radarValidUntilMs: 0, radarSource: '', runAtMs: NOW, fetchedAtMs: NOW, nwp, nwpSource: 'cube' });
    nc.radarFrames = []; nc.fusionHours = F.fusionHours; nc.fusionPWet = F.fusionPWet;
    const d0 = buildEventDetail(nc, NOW);
    nc.ruc = F.fit;
    const d1 = buildEventDetail(nc, NOW);
    const start0 = d0.items.find((i) => i.kind === 'fusion-start'), start1 = d1.items.find((i) => i.kind === 'fusion-start');
    const late1 = d1.items.filter((i) => i.kind === 'fusion-start')[1];
    add('G17 Ereignisse: ohne ruc Stundenbeginn (precision hour); mit ruc der erste nasse 5-min-Punkt (00:15 UTC, precision min, Quelle ruc), die Stunde jenseits +27 h bleibt stündlich',
      start0?.precision === 'hour' && start0.tMs === Date.UTC(2026, 9, 24, 0) && start1?.precision === 'min' && start1.tMs === Date.UTC(2026, 9, 24, 0, 15) && start1.minSource === 'ruc'
      && /ICON-D2-RUC/.test(start1.detail) && late1?.precision === 'hour' && late1.tMs === Date.UTC(2026, 9, 24, 12),
      `${start0?.title} ${start0 && clock(start0.tMs)} → ${start1?.title} ${start1 && clock(start1.tMs)}`);
    add('G17b ohne ruc byte-gleich (ruc: undefined)', JSON.stringify(buildEventDetail({ ...nc, ruc: undefined }, NOW)) === JSON.stringify(d0));
  }
  {
    const eng = readFileSync(join(ROOT, 'src/nowcast/nowcastEngine.ts'), 'utf8');
    const deck = readFileSync(join(ROOT, 'src/nowcast/NowcastDeck.tsx'), 'utf8');
    const map = readFileSync(join(ROOT, 'src/nowcast/NowcastRadarMap.tsx'), 'utf8');
    const card = readFileSync(join(ROOT, 'src/nowcast/MinuteSeriesCard.tsx'), 'utf8');
    const chart = readFileSync(join(ROOT, 'src/nowcast/MinuteChart.tsx'), 'utf8');
    const tile = readFileSync(join(ROOT, 'src/nowcast/EventsTile.tsx'), 'utf8');
    add('G18 buildNowcast: Schalter rucEnabledFrom, Leser loadRucPoint parallel zum Cube, Anpassung fitRucToFusion, rucAt an assembleNowcast, nc.ruc',
      /const rucOn = rucEnabledFrom\(/.test(eng) && /loadRucPoint\(/.test(eng) && /fitRucToFusion\(/.test(eng) && /rucAt: \(eta/.test(eng) && /nc\.ruc = /.test(eng));
    add('G19 Deck und Karte reichen nc.ruc an computeRainWindow; Karte des Minutenverlaufs und Hero kennen die Quelle ruc; Ereignis-Kachel nennt die 5-min-Form',
      /ruc: nowcast\.ruc \?\? null/.test(deck) && /ruc: pointNowcast\.ruc \?\? null/.test(map) && /source === 'ruc'/.test(card) && /mv-ruc/.test(chart) && /minSource === 'ruc'/.test(tile));
    add('G19b Gegenprobe: Muster G18 erkennt die Abwesenheit', !/const rucOn = rucEnabledFrom\(/.test(eng.replace('const rucOn = rucEnabledFrom(', 'const rucOn = false && (')));
  }
}

// ---------------------------------------------------------------------------
console.log('\nH Messskript T9 scripts/ruc/ruc-measure.mjs (Regel eingefroren, Fälle synthetisch, Dateien im Temp-Verzeichnis)');
{
  const H10 = 10 * MIN;
  add('H1 Messregel eingefroren: Wahrheit rr ≥ 0,1 mm/10 min, Form ≥ 0,1 mm/10 min, Stundenblock ≥ 0,6 mm/h, Fenster 2–12 h, Treffer ±30 min, Klassen ≤ 3 h / 3–12 h, Lücken ≤ 20 %; Hash = sha256(JSON der Regel)',
    MEASURE_RULE.truthWetMm10 === 0.1 && MEASURE_RULE.fcWetMm10 === 0.1 && MEASURE_RULE.hourWetMmH === 0.6 && MEASURE_RULE.leadFromMin === 120 && MEASURE_RULE.leadToMin === 720
    && MEASURE_RULE.hitWindowMin === 30 && MEASURE_RULE.leadClasses.length === 2 && MEASURE_RULE.leadClasses[0][1] === 120 && MEASURE_RULE.leadClasses[0][2] === 180 && MEASURE_RULE.leadClasses[1][2] === 720
    && MEASURE_RULE.maxMissing === 0.2 && Object.isFrozen(MEASURE_RULE) && /^[0-9a-f]{16}$/.test(ruleHash())
    && ruleHash() === createHash('sha256').update(JSON.stringify(MEASURE_RULE)).digest('hex').slice(0, 16), ruleHash());

  const RUN = Date.UTC(2026, 9, 23, 6);
  const ruc5 = (wetFromK, wetToK, mmH = 2) => Array.from({ length: RUC_STATION_STEPS }, (_, k) => (k >= wetFromK && k < wetToK ? mmH : 0));
  const truthOf = (wetFromIdx, wetToIdx, mm = 0.3, n = 80) => ({ t0Ms: RUN, stepMs: H10, rr: Array.from({ length: n }, (_, i) => (i >= wetFromIdx && i < wetToIdx ? mm : 0)) });
  {
    // RUC nass 09:40–11:00 UTC (k 44…60); Wahrheit nass ab Stempel 09:40 (Index 22 = Ende des Intervalls 09:30–09:40) bis 11:00
    const c = measureCase({ runAtMs: RUN, ruc5: ruc5(44, 60), truth: truthOf(22, 30) });
    // Referenz von Hand: Form-Beginn = erster 10-min-Stempel im Fenster mit (r[k] + r[k+1]) / 12 ≥ 0,1 ⇒ 09:50 (k 44/45) ⇒ 230 min;
    // Stundenblock 09–10 UTC: Mittel 4·2/12 = 0,67 ≥ 0,6 ⇒ Beginn = Stundenanfang + 10 = 09:10 ⇒ 190 min; Wahrheit 220 min
    add('H2 Fall: Wahrheit 220 min, Form 230 min (+10), Stundenblock 190 min (−30), beide Treffer ±30, gültig, Beginn-Fall',
      c.valid && c.onsetCase && c.truthOnsetMin === 220 && c.aOnsetMin === 230 && c.bOnsetMin === 190 && c.errA === 10 && c.errB === -30 && c.hitA && c.hitB,
      JSON.stringify({ t: c.truthOnsetMin, a: c.aOnsetMin, b: c.bOnsetMin }));
    // Brier von Hand: Fenster 120…720 min = 61 Stempel (Ende 08:00 … 18:00); Wahrheit nass an 8 Stempeln (09:40…10:50);
    // Form nass an Stempeln 09:50…11:00 (8); Stundenblock nass 09:10…11:00 (12). Übereinstimmung zählen.
    let dA = 0, dB = 0, n = 0;
    for (let lead = 120; lead <= 720; lead += 10) {
      const T = RUN + lead * MIN, i = (T - RUN) / H10;
      const tw = i >= 22 && i < 30 ? 1 : 0;
      const k = (T - H10 - RUN) / (5 * MIN);
      const r = ruc5(44, 60);
      const aw = (r[k] + r[k + 1]) / 12 >= 0.1 ? 1 : 0;
      const h = Math.floor((T - RUN - 1) / H);
      const hm = r.slice(12 * h, 12 * h + 12).reduce((s, v) => s + v, 0) / 12;
      const bw = hm >= 0.6 ? 1 : 0;
      dA += (aw - tw) ** 2; dB += (bw - tw) ** 2; n++;
    }
    add('H3 Brier (deterministisch = Fehlanteil je 10 min) gegen eine unabhängige Handrechnung über alle 61 Stempel des Fensters',
      c.nSlices === 61 && n === 61 && Math.abs(c.brierA - dA / n) < 1e-12 && Math.abs(c.brierB - dB / n) < 1e-12, `a ${c.brierA.toFixed(3)} b ${c.brierB.toFixed(3)}`);
  }
  {
    const fa = measureCase({ runAtMs: RUN, ruc5: ruc5(44, 60), truth: truthOf(0, 0) });
    const miss = measureCase({ runAtMs: RUN, ruc5: ruc5(0, 0), truth: truthOf(22, 30) });
    const dry = measureCase({ runAtMs: RUN, ruc5: ruc5(0, 0), truth: truthOf(0, 0) });
    const wetAtStart = measureCase({ runAtMs: RUN, ruc5: ruc5(0, 144), truth: truthOf(10, 40) }); // Wahrheit schon am ersten Fensterstempel (120 min = Index 12) nass
    const gaps = { t0Ms: RUN, stepMs: H10, rr: Array.from({ length: 80 }, (_, i) => (i % 3 === 0 ? null : 0)) };
    const invalid = measureCase({ runAtMs: RUN, ruc5: ruc5(0, 0), truth: gaps });
    const offset = measureCase({ runAtMs: RUN, ruc5: ruc5(0, 0), truth: { t0Ms: RUN + 3 * MIN, stepMs: H10, rr: new Array(80).fill(0) } }); // Stempel nicht auf dem 10-min-Raster des Laufs
    add('H4 Fehlalarm (Wahrheit trocken, Form nass), Verfehlung (umgekehrt), trocken (beide), Regen schon am Fensteranfang ⇒ kein Beginn-Fall, > 20 % Lücken ⇒ ungültig, versetzte Stempel ⇒ ungültig',
      fa.valid && fa.onsetCase && fa.truthOnsetMin === null && fa.aOnsetMin === 230 && fa.kindA === 'falseAlarm' && fa.kindB === 'falseAlarm'
      && miss.kindA === 'miss' && miss.kindB === 'miss' && dry.kindA === 'dry' && dry.kindB === 'dry' && !wetAtStart.onsetCase && wetAtStart.valid && !invalid.valid && !offset.valid,
      `${fa.kindA}/${miss.kindA}/${dry.kindA}`);
  }
  {
    const mk = (errA, errB, lead = 150, country = 'DE') => ({ valid: true, onsetCase: true, country, truthOnsetMin: lead, aOnsetMin: lead + errA, bOnsetMin: lead + errB, errA, errB, hitA: Math.abs(errA) <= 30, hitB: Math.abs(errB) <= 30, kindA: 'both', kindB: 'both', brierA: 0.1, brierB: 0.2, nSlices: 61 });
    const cases = [mk(-10, -40), mk(5, 30), mk(20, 60), mk(-20, -50, 400, 'AT'), mk(0, 35, 500, 'AT'),
      { valid: true, onsetCase: true, country: 'DE', truthOnsetMin: 170, aOnsetMin: null, bOnsetMin: 170, errA: null, errB: 0, hitA: false, hitB: true, kindA: 'miss', kindB: 'both', brierA: 0.3, brierB: 0.1, nSlices: 61 },
      { valid: false, onsetCase: false, country: 'DE', truthOnsetMin: null, aOnsetMin: null, bOnsetMin: null, errA: null, errB: null, hitA: false, hitB: false, kindA: 'invalid', kindB: 'invalid', brierA: NaN, brierB: NaN, nSlices: 0 }];
    const agg = aggregate(cases);
    const all = agg.groups.all;
    // MAE a = (10+5+20+20+0)/5 = 11; b = (40+30+60+50+35)/5 = 43; Treffer a 5/5 vs b 2/5 (30, 0 ⇒ ≤ 30 ⇒ 2 … prüfen: |−40| nein, |30| ja, |60| nein, |−50| nein, |35| nein ⇒ 1; plus Verfehlung-Fall b Treffer ⇒ Treffer zählen über beide-Beginn-Fälle je Verfahren)
    add('H5 Aggregat: nur gültige Fälle, MAE/Treffer je Verfahren über die Fälle mit Beginn in Wahrheit und Verfahren, Verfehlungen/Fehlalarme gezählt, Quantile des Fehlers, Brier-Mittel',
      all.n === 6 && all.bothA === 5 && all.bothB === 6 && Math.abs(all.maeA - 11) < 1e-9 && Math.abs(all.maeB - (40 + 30 + 60 + 50 + 35 + 0) / 6) < 1e-9
      && all.hitA === 5 / 5 && Math.abs(all.hitB - 2 / 6) < 1e-9 && all.missA === 1 && all.missB === 0 && all.falseA === 0
      && all.q25A === quantile([-10, 5, 20, -20, 0], 0.25) && all.q75A === quantile([-10, 5, 20, -20, 0], 0.75)
      && Math.abs(all.brierA - (0.1 * 5 + 0.3) / 6) < 1e-9, JSON.stringify({ maeA: all.maeA, maeB: all.maeB, hitA: all.hitA, hitB: all.hitB }));
    add('H6 Gruppen je Vorlaufklasse und Land; Verdikt a ≤ b in MAE UND Treffer ⇒ E-RUC-7 drehen; Spannen aus max(|q25|, |q75|) auf 5 min aufgerundet',
      agg.groups['≤3h'].n === 4 && agg.groups['3–12h'].n === 2 && agg.groups.DE.n === 4 && agg.groups.AT.n === 2 && agg.verdict.aBetter === true
      && agg.verdict.reason.includes('MAE') && agg.spans['≤3h'].halfMin === 15 && agg.spans['3–12h'].halfMin === 15,
      JSON.stringify(agg.spans));
    const worse = aggregate([mk(40, 10), mk(-50, 5)]);
    add('H6b Gegenprobe: Form schlechter ⇒ Verdikt nein', worse.verdict.aBetter === false);
  }
  {
    // Dateien: Speicher mit Katalog + Stationsreihe (zwei Stationen, eine davon ohne Messung), Messtag als dense-day
    const store = mkdtempSync(join(tmpdir(), 'ruc-ms-')), obs = mkdtempSync(join(tmpdir(), 'ruc-obs-'));
    const run = '2026102309', cat = 'abcdef12'; // Lauf 09 UTC: Fenster 11:00–21:00; der Messtag deckt 13:20–20:20 (43 Stempel wie die echten Dateien)
    mkdirSync(join(store, 'stations'));
    writeFileSync(join(store, 'stations', `catalog-${cat}.json`), JSON.stringify({ catalog: cat, count: 3, steps: RUC_STATION_STEPS, ids: ['de:X1', 'at:X2', 'ch:X3'] }));
    const rates = Array.from({ length: RUC_STATION_STEPS }, (_, k) => Float32Array.from([k >= 60 && k < 72 ? 2 : 0, 0, 5])); // nass 14:00–15:00 UTC
    const series = encodeStationSeries(rates, Int32Array.from([0, 1, 2]), RUC_STATION_STEPS);
    writeFileSync(join(store, 'stations', `${run}-${cat}.png`), encodePng(series.width, series.height, series.data, 1));
    const T0 = Date.UTC(2026, 9, 23, 13, 20);
    const day = { kind: 'obsfusion/dense-day', schema: 1, day: '2026-10-23', slotAt: '2026-10-23T20:21:00.000Z', t0Ms: T0, n: 43, stepMs: H10, stations: {
      'de:X1': { lat: 50, lon: 8, elev: 100, country: 'DE', cols: { rr: Array.from({ length: 43 }, (_, i) => (i >= 5 && i < 10 ? 0.3 : 0)) } }, // nass ab Stempel 14:10
      'at:X2': { lat: 47, lon: 13, elev: 500, country: 'AT', cols: { rr: new Array(43).fill(0) } },
    } };
    writeFileSync(join(obs, '2026-10-23.json.gz'), gzipSync(JSON.stringify(day)));
    const rep = measureRuc({ storeDir: store, obsDir: obs, log: () => {} });
    add('H7 Dateien (7-h-Messtag wie echt): eine Stationsreihe × zwei gemessene Stationen ⇒ zwei Fälle (ch:X3 ohne Messung ausgelassen), Lauf und Katalog erkannt, Regel-Hash im Bericht, Verdikt da, Form-Beginn 14:10 = Wahrheit',
      rep.runs === 1 && rep.cases === 2 && rep.stationsUsed === 2 && rep.ruleHash === ruleHash() && rep.groups.all.n === 2 && rep.groups.DE.n === 1 && rep.groups.AT.n === 1
      && rep.groups.all.bothA === 1 && rep.groups.all.maeA === 0 && rep.groups.all.bothB === 1 && typeof rep.verdict.aBetter === 'boolean', JSON.stringify({ runs: rep.runs, cases: rep.cases, maeA: rep.groups.all.maeA, maeB: rep.groups.all.maeB }));
    rmSync(store, { recursive: true, force: true }); rmSync(obs, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
console.log('\nI Nachbesserungen aus dem Review (23.10.): Naht-Texte ohne Schalter wortgleich, flache Stunde ⇒ Stundensatz, 15-min-Mittel in der Engine, Schlüssel nur mit ruc, Koordinaten-Cache, Messfenster');
{
  const chart = readFileSync(join(ROOT, 'src/nowcast/MinuteChart.tsx'), 'utf8');
  // die drei Naht-Texte des Standes vor RUC (git show HEAD) müssen ohne ruc wortgleich bleiben
  add('I1 (C1) Naht-Texte ohne ruc wortgleich wie vor RUC (seit E-RUC-15 steht „minutengenau" als `radarRes` darin, mit `?mvbars=0` wortgleich): „danach ‹Fusion› ▸", „ab hier ‹Fusion› als Stundenmittel", „‹Fusion› · Stundenmittel (kein Radar-Nowcast am Ort)"',
    chart.includes('`Radar · ${radarRes} bis ${fmtClock(seamMs)} · danach ${series.fusionLabel} ▸`') && /const radarRes = bars && series\.radar \? `Bild alle \$\{series\.radar\.frameStepMin\} min` : 'minutengenau';/.test(chart)
    && chart.includes('`◂ Radar bis ${fmtClock(seamMs)} · ab hier ${series.fusionLabel} als Stundenmittel`')
    && chart.includes("{series.fusionLabel} · Stundenmittel{full ? ' (kein Radar-Nowcast am Ort)' : ''}")
    && chart.includes('`${series.fusionLabel} · Stundenmittel`'));
  const ed = readFileSync(join(ROOT, 'src/nowcast/eventDetail.ts'), 'utf8');
  add('I2 (I4) minSource wird nur für ruc in das Ereignis gespreizt (Radar-Fälle ohne Schalter bleiben ohne neuen Schlüssel); die Serie des Ereignis-Details kennt ruc (M2)',
    /\.\.\.\(minSource === 'ruc' \? \{ minSource \} : \{\}\)/.test(ed) && !/minSource = 'radar'/.test(ed) && /ruc: nc\.ruc \?\? null/.test(ed));
  const eng = readFileSync(join(ROOT, 'src/nowcast/nowcastEngine.ts'), 'utf8');
  const card = readFileSync(join(ROOT, 'src/nowcast/MinuteSeriesCard.tsx'), 'utf8');
  add('I9 (Jan 23.10./25.10.) die kleine Kachel zeigt 2 h (Radar-Horizont), das Overlay 27 h (MV_VIEW_H, Stufen 2 | 6 | 27 h, Reihe über horizonH: MV_VIEW_H); die Mini-Achse beschriftet bei 2 h nur volle und halbe Stunden',
    /const MINI_RANGE_H = 2;/.test(card) && /const \[rangeH, setRangeH\] = useState\(MV_VIEW_H\);/.test(card) && /horizonH: MV_VIEW_H,/.test(card)
    && /\[\{ h: 2, label: '2 h' \}, \{ h: 6, label: '6 h' \}, \{ h: MV_VIEW_H, label: `\$\{MV_VIEW_H\} h` \}\]/.test(card) && !/48 h/.test(card) && MV_VIEW_H === 27 && MV_HORIZON_H === 48
    && /getMinutes\(\) % 30 === 0/.test(chart));
  add('I3 (I3) die Engine nimmt das Mittel der 5-min-Intervalle des 15-min-Schritts (rucMeanOver), nicht den Punktwert',
    /rucAt: \(eta: number\) => rucMeanOver\(fit, eta - NOWCAST_STEP_MIN \* 60_000, eta\)/.test(eng));
}
{
  const NOW = Date.UTC(2026, 9, 23, 10, 0, 0);
  const RUN_MS = NOW - H, STEP = 5 * MIN;
  const mkRuc = (values) => ({ run: '2026102309', runAtMs: RUN_MS, builtAtMs: RUN_MS + 45 * MIN, ageMin: 60, stepMin: 5, cell: { iy: 0, ix: 0 }, chunk: { cy: 0, cx: 0, column: 0 }, manifest: null,
    points: values.map((v, k) => ({ fromMs: RUN_MS + k * STEP, toMs: RUN_MS + (k + 1) * STEP, mmH: v })) });
  const vals = new Array(RUC_STEPS).fill(0);
  for (let k = 36; k < 48; k++) vals[k] = [0, 0, 0, 0, 0, 0, 0, 6, 6, 0, 0, 0][k - 36]; // Stunde 12–13 UTC: 10-min-Schauer 12:35–12:45 mit 6 mm/h
  const fit = fitRucToFusion(mkRuc(vals), [{ tMs: RUN_MS + 4 * H, mmH: 1, conf: 0.5 }], NOW);
  const t = (h, m) => Date.UTC(2026, 9, 23, h, m);
  add('I4 (I3) rucMeanOver: Mittel über (von, bis] — 12:30–12:45 = (0 + 6 + 6)/3 = 4 mm/h, 12:45–13:00 = 0, Fenster mit fehlendem Intervall ⇒ null, außerhalb ⇒ null; Σ der vier 15-min-Mittel/4 = f',
    Math.abs(rucMeanOver(fit, t(12, 30), t(12, 45)) - 4) < 1e-9 && rucMeanOver(fit, t(12, 45), t(13, 0)) === 0 && rucMeanOver(fit, t(12, 50), t(13, 5)) === null
    && rucMeanOver(fit, t(11, 0), t(11, 15)) === null && Math.abs((rucMeanOver(fit, t(12, 0), t(12, 15)) + rucMeanOver(fit, t(12, 15), t(12, 30)) + rucMeanOver(fit, t(12, 30), t(12, 45)) + rucMeanOver(fit, t(12, 45), t(13, 0))) / 4 - 1) < 1e-9);
  // flache Stunde 13–14 UTC (f 0,5, p 0,6, RUC trocken) vor einer Form-Stunde 14–15 (f 0,8, p 0,6, RUC ab 14:35) ⇒ Stundensatz wie heute
  const fusionHours = [], fusionPWet = [];
  for (let h = 1; h <= 30; h++) { const start = RUN_MS + (h - 1) * H; const key = 9 + h - 1; fusionHours.push({ tMs: start + H, mmH: key === 13 ? 0.5 : key === 14 ? 0.8 : 0, conf: 0.5 }); fusionPWet.push({ tMs: start, p: key === 13 || key === 14 ? 0.6 : 0.05 }); }
  const v2 = new Array(RUC_STEPS).fill(0);
  for (let k = (14 - 9) * 12 + 7; k < (15 - 9) * 12; k++) v2[k] = 2;
  const fit2 = fitRucToFusion(mkRuc(v2), fusionHours, NOW);
  const w = computeRainWindow({ nowMs: NOW, radar: null, fusion: fusionPWet, ruc: fit2 });
  const w0 = computeRainWindow({ nowMs: NOW, radar: null, fusion: fusionPWet });
  add('I5 (I1) flache nasse Stunde vor einer Form-Stunde ⇒ der Stundensatz wie heute (nicht der spätere 5-min-Beginn)',
    fit2.hours.find((x) => x.hourStartMs === t(13, 0)).kind === 'flat' && w.source === 'fusion' && w.precision === 'hour' && w.sentence === w0.sentence, `${w.sentence} | ${w0.sentence}`);
  // flache Stunde, an der Radar-Naht angeschnitten ⇒ erster Regen frühestens an der Naht (M7)
  const frames = [{ tMs: NOW, mmH: 0 }, { tMs: NOW + 60 * MIN, mmH: 0 }, { tMs: NOW + 120 * MIN, mmH: 0 }, { tMs: NOW + 140 * MIN, mmH: 0 }];
  const fh = [{ tMs: t(13, 0), mmH: 1.2, conf: 0.5 }];
  const fitFlat = fitRucToFusion(mkRuc(new Array(RUC_STEPS).fill(0)), fh, NOW);
  const sFlat = buildMinuteSeries({ nowMs: NOW, radarFrames: frames, radarSource: 'radolan_rv', fusionHours: fh, fusionPWet: null, fusionLabel: 'buscosun Fusion', ruc: fitFlat });
  add('I6 (M7) flache Stunde 12–13 UTC, Radar trocken bis 12:20 ⇒ erster Regen 12:20 (Naht), nicht 12:00', sFlat.firstWet?.source === 'fusion' && sFlat.firstWet.tMs === t(12, 20), `${sFlat.firstWet && new Date(sFlat.firstWet.tMs).toISOString()}`);
}
{
  // (I2) Koordinaten-Cache: erster Aufruf holt und schreibt, zweiter liest den Cache, force holt neu
  const dir = mkdtempSync(join(tmpdir(), 'ruc-coords-'));
  let fetches = 0;
  const fetchCoords = async () => { fetches++; const lat = Float32Array.from([50, 50.01, 30]), lon = Float32Array.from([8, 8.01, 8]); return { lat, lon, n: 3 }; };
  const c1 = await loadRucCoords({ cacheDir: dir, fetchCoords, log: () => {} });
  const c2 = await loadRucCoords({ cacheDir: dir, fetchCoords, log: () => {} });
  const c3 = await loadRucCoords({ cacheDir: dir, fetchCoords, log: () => {}, force: true });
  add('I7 (I2) loadRucCoords: holen → Cache → Cache gelesen → force holt neu und überschreibt; nur Zellen in der Domäne (2 von 3)',
    fetches === 2 && !c1.cached && c2.cached && !c3.cached && c1.n === 3 && c1.idx.length === 2 && c2.idx.length === 2 && existsSync(join(dir, 'ruc-cells-dach.json.gz')));
  rmSync(dir, { recursive: true, force: true });
  const build = readFileSync(join(ROOT, 'scripts/ruc/ruc-build.mjs'), 'utf8');
  add('I7b Producer: bei „grid changed" mit Cache ⇒ Cache verwerfen, Koordinaten neu holen, Index neu bauen (kein dauerhaft roter Workflow)',
    /force: true/.test(build) && /grid changed/.test(build) && /loadRucCoords\(/.test(build));
}
{
  // (C2) Messfenster gegen die 7-h-Fenster der dense-day-Dateien: gedeckte Stempel zählen, Mindestdeckung 25
  const RUN = Date.UTC(2026, 9, 23, 9); // Fenster 11:00–21:00 UTC (61 Stempel); Messtag deckt 13:20–20:20 (43 Stempel)
  const T0 = Date.UTC(2026, 9, 23, 13, 20), n = 43;
  const ruc5 = Array.from({ length: RUC_STATION_STEPS }, (_, k) => (k >= 60 && k < 72 ? 2 : 0)); // nass 14:00–15:00 UTC
  const rr = Array.from({ length: n }, (_, i) => (T0 + i * 10 * MIN >= Date.UTC(2026, 9, 23, 14, 10) && T0 + i * 10 * MIN < Date.UTC(2026, 9, 23, 15) ? 0.3 : 0));
  const c = measureCase({ runAtMs: RUN, ruc5, truth: { t0Ms: T0, stepMs: 10 * MIN, rr } });
  add('I8 (C2) 43 gedeckte Stempel im 61er-Fenster ⇒ gültig (Deckung ≥ 25, Lücken innerhalb 0 %), Beginn-Fall ab dem ersten gedeckten Stempel, Wahrheit 14:10 = 310 min, Form 14:10 = 310 min',
    MEASURE_RULE.minCovered === 25 && c.valid && c.onsetCase && c.nSlices === 43 && c.truthOnsetMin === 310 && c.aOnsetMin === 310 && c.errA === 0, JSON.stringify({ v: c.valid, n: c.nSlices, t: c.truthOnsetMin, a: c.aOnsetMin }));
  const few = measureCase({ runAtMs: RUN, ruc5, truth: { t0Ms: Date.UTC(2026, 9, 23, 18), stepMs: 10 * MIN, rr: new Array(19).fill(0) } });
  add('I8b nur 19 gedeckte Stempel ⇒ ungültig; Hash der Regel neu eingefroren', !few.valid && ruleHash() !== 'cebb3885c364bdac' && /^[0-9a-f]{16}$/.test(ruleHash()), ruleHash());
}

// ---------------------------------------------------------------------------
console.log('\nJ Regen-Kante der Anzeigen (E-RUC-11, 24.10.): Spurenstunde ⇒ kein erster Regen, Hinweis, Summen-Split; Ereignis-Minute ≥ Naht; Pin unverändert; Schalter aus ⇒ byte-gleich');
{
  // Herborn 24.10. 19:02 MESZ nachgestellt: jetzt 17:00 UTC, Lauf 16 UTC; Radar trocken bis 19:00 UTC; Stunde 18–19 UTC (20–21 MESZ) f 0,047 p 0,16 mit der
  // RUC-Form am Stundenende (roh 0,005/0,031/0,077/0,042 ⇒ ×2,99 = 0,017/0,093/0,230/0,127); Stunde 19–20 UTC f 0,124 p 0,39, Form ab 19:15 ≥ 0,1; 20–21 UTC f 0,16 p 0,41
  const t = (h, m = 0) => Date.UTC(2026, 9, 24, h, m);
  const NOW = t(17, 2);                 // 19:02 MESZ wie im Befund: die Engine-Schritte liegen bei :47/:02
  const RUN_MS = t(16), STEP = 5 * MIN;
  const mkRuc = (values) => ({ run: '2026102416', runAtMs: RUN_MS, builtAtMs: RUN_MS + 45 * MIN, ageMin: 60, stepMin: 5, cell: { iy: 0, ix: 0 }, chunk: { cy: 0, cx: 0, column: 0 }, manifest: null,
    points: values.map((v, k) => ({ fromMs: RUN_MS + k * STEP, toMs: RUN_MS + (k + 1) * STEP, mmH: v })) });
  const kOf = (h, m = 0) => (h - 16) * 12 + m / 5;
  const vals = new Array(RUC_STEPS).fill(0);
  vals[kOf(18, 40)] = 0.005; vals[kOf(18, 45)] = 0.031; vals[kOf(18, 50)] = 0.077; vals[kOf(18, 55)] = 0.042;
  for (let k = kOf(19, 0); k < kOf(19, 15); k++) vals[k] = 0.2;
  for (let k = kOf(19, 15); k < kOf(21, 0); k++) vals[k] = 0.5;
  const fusionHours = [], fusionPWet = [];
  for (let h = 1; h <= 30; h++) {
    const start = RUN_MS + (h - 1) * H, key = 16 + h - 1;
    fusionHours.push({ tMs: start + H, mmH: key === 18 ? 0.047 : key === 19 ? 0.124 : key === 20 ? 0.16 : 0, conf: 0.5, tempC: 10, snowLineM: null, windDir: null, windMs: null, gustMs: null });
    fusionPWet.push({ tMs: start, p: key === 18 ? 0.16 : key === 19 ? 0.39 : key === 20 ? 0.41 : 0.05 });
  }
  const fit0 = fitRucToFusion(mkRuc(vals), fusionHours, NOW);
  const fitOff = fitRucToFusion(mkRuc(vals), fusionHours, NOW, { pWet: fusionPWet, gate: false });
  const fit = fitRucToFusion(mkRuc(vals), fusionHours, NOW, { pWet: fusionPWet, gate: true });
  const h18 = fit.hours.find((x) => x.hourStartMs === t(18)), h19 = fit.hours.find((x) => x.hourStartMs === t(19));
  add('J1 fitRucToFusion mit Kante: Stunde 18–19 UTC (0,047 mm/h, 16 %) ist Spur (trace, pWet 0,16), 19–20 (0,124, 39 %) nicht; Punkte tragen die Marke; die Summe bleibt (Mittel = f)',
    h18?.trace === true && h18.pWet === 0.16 && h19?.trace === false && fit.points.filter((p) => p.fromMs >= t(18) && p.fromMs < t(19)).every((p) => p.trace === true)
    && Math.abs(fit.points.filter((p) => p.fromMs >= t(18) && p.fromMs < t(19)).reduce((a, p) => a + p.mmH, 0) / 12 - 0.047) < 1e-9
    && Math.abs(fit.points.find((p) => p.fromMs === t(18, 50)).mmH - 0.077 * (0.047 / ((0.005 + 0.031 + 0.077 + 0.042) / 12))) < 1e-9, JSON.stringify(h18));
  add('J1b ohne Kante (gate: false / ohne Optionen) byte-gleich und ohne Marken', JSON.stringify(fit0) === JSON.stringify(fitOff) && !('trace' in fit0.hours[0]) && !('trace' in fit0.points[0]));
  add('J1c rucAt/rucMeanOver liefern in der Spurenstunde null (Engine fällt auf die Stundeninterpolation zurück), in der Regenstunde den Wert',
    rucAt(fit, t(18, 53)) === null && rucMeanOver(fit, t(18, 45), t(19, 0)) === null && Math.abs(rucAt(fit, t(19, 20)) - 0.5 * (0.124 / ((0.2 * 3 + 0.5 * 9) / 12))) < 1e-9 && rucAt(fit0, t(18, 53)) != null);

  // Minutenverlauf: Radar trocken bis 19:00 UTC
  const frames = []; for (let tm = t(17); tm <= t(18, 55); tm += 5 * MIN) frames.push({ tMs: tm, mmH: 0 });
  const inp = { nowMs: NOW, radarFrames: frames, radarSource: 'radolan_rv', fusionHours, fusionPWet, fusionLabel: 'buscosun Fusion' };
  const s0 = buildMinuteSeries({ ...inp, ruc: fit0 });
  const sOff = buildMinuteSeries({ ...inp, ruc: fitOff, gate: false });
  const s = buildMinuteSeries({ ...inp, ruc: fit, gate: true });
  const bar18 = s.hours.find((b) => Math.floor(b.fromMs / H) * H === t(18)), bar19 = s.hours.find((b) => b.fromMs === t(19));
  add('J2 ohne Kante: erster Regen 18:55 UTC (die Spurenstunde, direkt an der Naht) — der Befund V-RUC-20', s0.firstWet?.source === 'ruc' && s0.firstWet.tMs === t(18, 55), `${s0.firstWet && new Date(s0.firstWet.tMs).toISOString()}`);
  add('J2b mit Kante: erster Regen 19:15 UTC aus der Regenstunde (Quelle ruc); Balken 18–19 trace, 19–20 nicht; Stufen 18:55–19:00 trace',
    s.firstWet?.source === 'ruc' && s.firstWet.tMs === t(19, 15) && bar18?.trace === true && bar19?.trace === false
    && s.ruc.points.filter((p) => p.fromMs < t(19)).every((p) => p.trace === true) && s.ruc.points.filter((p) => p.fromMs >= t(19) && p.fromMs < t(21)).every((p) => p.trace === false),
    `${s.firstWet && new Date(s.firstWet.tMs).toISOString()} bar18 ${JSON.stringify(bar18)}`);
  add('J2c Spitze und Summe überspringen die Spur: Spitze aus der Regenstunde, sumMm = Regenstunden, sumTraceMm = Spur (18:55–19:00 ⇒ 0,127 × 5/60 ≈ 0,0 mm, gerundet), Hinweis-Spanne 18:55–19:00 mit pMax 0,16',
    s.peak?.source === 'ruc' && s.peak.tMs >= t(19) && Math.abs(s.sumMm - (s0.sumMm - 0.127 * 5 / 60)) < 0.11 && s.sumTraceMm < 0.05 && s.hints.length >= 1 && s.hints[0].fromMs === t(18, 55) && s.hints[0].toMs === t(19) && s.hints[0].pMax === 0.16,
    `Summe ${s.sumMm} (ohne Kante ${s0.sumMm}), Spur ${s.sumTraceMm}, Hinweise ${JSON.stringify(s.hints)}`);
  add('J2d Schalter aus (gate: false) ⇒ buildMinuteSeries byte-gleich zum Stand ohne Optionen; sumTraceMm 0, keine Hinweise', JSON.stringify(sOff) === JSON.stringify(s0) && s0.sumTraceMm === 0 && s0.hints.length === 0);
  // ohne Radar: ganze Spurenstunde ⇒ Hinweis mit 0,05 mm, Summe geteilt
  const sNoRadar = buildMinuteSeries({ ...inp, radarFrames: [], radarSource: '', ruc: fit, gate: true });
  add('J2e ohne Radar: die ganze Spurenstunde 18–19 UTC ist EIN Hinweis „16 % · 0,05 mm", sumTraceMm ≈ 0,0–0,1, erster Regen 19:15',
    sNoRadar.hints.length >= 1 && sNoRadar.hints[0].fromMs === t(18) && sNoRadar.hints[0].toMs === t(19) && Math.abs(sNoRadar.hints[0].mm - 0.05) < 0.006 && sNoRadar.firstWet?.tMs === t(19, 15),
    JSON.stringify(sNoRadar.hints[0]));

  // Ereignisse: Engine-Schritt 120 min (19:00 UTC) liegt in der Blend-Zone; ohne Kante nennt das Ereignis 18:50 (im Radarfenster), mit Kante 19:15
  const nwp = fusionHours.filter((h) => h.tMs <= NOW + 8 * H).map((h) => ({ tMs: h.tMs, mmH: h.mmH, conf: h.conf, snowLineM: null, tempC: 10 }));
  const radarSampleAt = (eta) => (eta <= t(18, 55) ? 0 : null);
  const ncOf = (f, gate) => {
    const nc = assembleNowcast({ nowMs: NOW, radarSampleAt, radarValidUntilMs: t(18, 55), radarSource: 'radolan_rv', runAtMs: NOW, fetchedAtMs: NOW, nwp, nwpSource: 'cube',
      rucAt: (eta) => rucMeanOver(f, eta - 15 * MIN, eta) });
    nc.radarFrames = frames; nc.fusionHours = fusionHours; nc.fusionPWet = fusionPWet; nc.ruc = f; nc.rainGate = gate;
    return nc;
  };
  const d0 = buildEventDetail(ncOf(fit0, false), NOW), d1 = buildEventDetail(ncOf(fit, true), NOW);
  const st0 = d0.items.find((i) => i.kind === 'rain-start' && i.precision === 'min'), st1 = d1.items.find((i) => (i.kind === 'rain-start' || i.kind === 'fusion-start') && i.tMs >= NOW);
  add('J3 ohne Kante: „ab 18:50 UTC" aus dem Radarfenster (V-RUC-21); mit Kante: keine Minute vor der Naht und keine aus der Spur — der Beginn ist die Minute des Minutenverlaufs, 19:15 UTC (V-RUC-22)',
    st0?.tMs === t(18, 50) && st1?.tMs === t(19, 15) && st1.minSource === 'ruc' && !d1.items.some((i) => i.precision === 'min' && i.minSource === 'ruc' && i.tMs < t(19)),
    `ohne ${st0 && new Date(st0.tMs).toISOString()} · mit ${st1 && st1.title} ${st1 && new Date(st1.tMs).toISOString()}`);
  add('J3b Schalter aus ⇒ buildEventDetail byte-gleich (rainGate false mit gate-freiem Fit)', JSON.stringify(buildEventDetail(ncOf(fitOff, false), NOW)) === JSON.stringify(d0));
  // Radar-Minute in der Blend-Zone (Regen laut Radar ab 18:40 UTC = +98 min, Schritt 105 ist „blend"): mit Kante nennt das Ereignis die Radar-Minute, ohne Kante die RUC-Minute des Schritts
  const wetFrames = frames.map((f) => ({ tMs: f.tMs, mmH: f.tMs >= t(18, 40) ? 1.5 : 0 }));
  const ncBlend = (f, gate) => {
    const nc = assembleNowcast({ nowMs: NOW, radarSampleAt: (eta) => (eta <= t(18, 55) ? (eta >= t(18, 40) ? 1.5 : 0) : null), radarValidUntilMs: t(18, 55), radarSource: 'radolan_rv', runAtMs: NOW, fetchedAtMs: NOW, nwp, nwpSource: 'cube',
      rucAt: (eta) => rucMeanOver(f, eta - 15 * MIN, eta) });
    nc.radarFrames = wetFrames; nc.fusionHours = fusionHours; nc.fusionPWet = fusionPWet; nc.ruc = f; nc.rainGate = gate;
    return nc;
  };
  const b0 = buildEventDetail(ncBlend(fit0, false), NOW).items.find((i) => i.kind === 'rain-start'), b1 = buildEventDetail(ncBlend(fit, true), NOW).items.find((i) => i.kind === 'rain-start');
  const sBlend = buildMinuteSeries({ ...inp, radarFrames: wetFrames, ruc: fit, gate: true });
  add('J3c Radar-Beginn in der Blend-Zone: mit Kante nennt das Ereignis die Radar-Minute des Minutenverlaufs (18:40 UTC), ohne Kante wie bisher nicht (Schritt „blend" bleibt beim RUC-Punkt)',
    sBlend.firstWet?.source === 'radar' && sBlend.firstWet.tMs >= t(18, 35) && sBlend.firstWet.tMs <= t(18, 40) && b1?.tMs === sBlend.firstWet.tMs && b1.precision === 'min' && b1.minSource !== 'ruc' && b0 != null && b0.tMs !== b1.tMs,
    `ohne ${b0 && new Date(b0.tMs).toISOString()} ${b0?.minSource ?? ''} · mit ${b1 && new Date(b1.tMs).toISOString()}`);

  // Karten-Pin: schon vor der Kante 19:15 (P-Kante); mit Kante dieselbe Minute
  const w0 = computeRainWindow({ nowMs: NOW, radar: { kind: 'extrapolation', product: 'RADOLAN-RV', horizonMin: 120, wetNow: false, onsetMin: null, endMin: null }, fusion: fusionPWet, ruc: fit0 });
  const w1 = computeRainWindow({ nowMs: NOW, radar: { kind: 'extrapolation', product: 'RADOLAN-RV', horizonMin: 120, wetNow: false, onsetMin: null, endMin: null }, fusion: fusionPWet, ruc: fit });
  add('J4 Karten-Pin: 19:15 UTC vor und nach der Kante (eine Regel, drei Anzeigen nennen dieselbe Minute wie der Minutenverlauf)',
    w0.kind === 'onset' && w0.source === 'ruc' && w1.kind === 'onset' && w1.source === 'ruc' && w0.label === w1.label && /19:15|21:15/.test(w1.label) && s.firstWet.tMs === t(19, 15), `${w0.label} | ${w1.label}`);

  // Verdrahtung als Quelltext
  const eng = readFileSync(join(ROOT, 'src/nowcast/nowcastEngine.ts'), 'utf8');
  const card = readFileSync(join(ROOT, 'src/nowcast/MinuteSeriesCard.tsx'), 'utf8');
  const chart = readFileSync(join(ROOT, 'src/nowcast/MinuteChart.tsx'), 'utf8');
  const ed = readFileSync(join(ROOT, 'src/nowcast/eventDetail.ts'), 'utf8');
  const rw = readFileSync(join(ROOT, 'src/nowcast/rainWindow.ts'), 'utf8');
  add('J5 Verdrahtung: Engine rechnet P(nass) vor dem Fit und reicht { pWet, gate }; nc.rainGate; Kachel reicht gate und zeigt „möglich"; Diagramm zeichnet Hinweise (mv-hint); Ereignisse schneiden an der Naht; Pin nutzt RAIN_GATE_P',
    /const gate = rainGateEnabledFrom\(/.test(eng) && /fitRucToFusion\(rucSeries, nwpFull, nowMs, \{ pWet: pw, gate \}\)/.test(eng) && /nc\.rainGate = gate/.test(eng)
    && /gate: nowcast\.rainGate === true/.test(card) && /sumTraceMm/.test(card) && /möglich \(Stunden unter der Kante\)/.test(card)
    && /mv-hint/.test(chart) && /traceHintText\(/.test(chart) && /s\.trace \? \{ \.\.\.s, mmH: 0 \}/.test(chart)
    && /rucFirstWetNear\(nc, tMs, seamMs\)/.test(ed) && /x\.fromMs >= seamMs/.test(ed) && /RB_P_EDGE = RAIN_GATE_P/.test(rw) && /if \(p\.trace\) continue;/.test(rw));
  add('J5b Gegenprobe: Muster J5 erkennt die Abwesenheit', !/nc\.rainGate = gate/.test(eng.replace('nc.rainGate = gate', 'nc.rainGate = false')));
}

// ---------------------------------------------------------------------------
console.log('\nK Minutenkurve der 5-min-Form (E-RUC-13, 25.10.): Masse je 5 min und je Stunde exakt, nie negativ, flach bleibt flach, Lücken trennen, Schalter, Verdrahtung');
{
  const STEP = 5 * MIN, T0 = Date.UTC(2026, 9, 25, 6);
  // 240 steps (20 h): 2 h zeros, 1 h flat 0,3, then a noisy mix with 30 % zeros; the first step is cut at a seam (2 min long)
  const steps = [];
  for (let k = 0; k < 240; k++) {
    const v = k < 24 ? 0 : k < 36 ? 0.3 : rnd() < 0.3 ? 0 : rnd() * 6;
    steps.push({ fromMs: T0 + k * STEP, toMs: T0 + (k + 1) * STEP, mmH: v });
  }
  steps[0] = { fromMs: T0 + 3 * MIN, toMs: T0 + STEP, mmH: 0.8 };
  const runs = rucMinuteCurve(steps);
  const run = runs[0];
  const at = (t) => run.find((p) => p.tMs === t);
  let massErr = 0, hourErr = 0, neg = 0, flatErr = 0, integErr = 0;
  for (const s of steps) {
    const a = at(s.fromMs), b = at(s.toMs);
    massErr = Math.max(massErr, Math.abs(b.mm - a.mm - s.mmH * (s.toMs - s.fromMs) / H));
  }
  for (let h = 1; h < 20; h++) {
    const a = at(T0 + h * H), b = at(T0 + (h + 1) * H);
    const f = steps.slice(h * 12, h * 12 + 12).reduce((x, s) => x + s.mmH, 0) / 12;
    hourErr = Math.max(hourErr, Math.abs(b.mm - a.mm - f));
  }
  for (const p of run) { if (p.mmH < 0) neg++; if (p.tMs > T0 + 25 * STEP && p.tMs < T0 + 35 * STEP) flatErr = Math.max(flatErr, Math.abs(p.mmH - 0.3)); }
  // fine sampling (1 s): the integral of the drawn rate over each 5 min is the 5-min sum (the slope IS the derivative of the value)
  const fine = rucMinuteCurve(steps.slice(36, 60), Infinity, 1000)[0];
  for (let k = 36; k < 60; k++) {
    const s = steps[k], seg = fine.filter((p) => p.tMs >= s.fromMs && p.tMs <= s.toMs);
    let integ = 0; for (let i = 1; i < seg.length; i++) integ += ((seg[i].mmH + seg[i - 1].mmH) / 2) * (seg[i].tMs - seg[i - 1].tMs) / H;
    integErr = Math.max(integErr, Math.abs(integ - s.mmH * STEP / H));
  }
  add('K1 ein Lauf, eine Probe je Minute von der Naht (06:03) bis 02:00, Enden inklusive', runs.length === 1 && run[0].tMs === T0 + 3 * MIN && run[run.length - 1].tMs === T0 + 240 * STEP && run.length === 240 * 5 - 3 + 1, `${runs.length} Läufe, ${run.length} Proben`);
  add('K2 jede 5-min-Summe exakt erhalten (auch die angeschnittene erste): max. Abweichung der kumulierten Menge an den Stützstellen < 1e-9 mm', massErr < 1e-9, `${massErr}`);
  add('K3 jede Stundensumme exakt der Wert von buscosun Fusion (Mittel der zwölf Stufen): max. Abweichung < 1e-9 mm', hourErr < 1e-9, `${hourErr}`);
  add('K4 Integral der gezeichneten Rate (1-s-Trapez) = 5-min-Summe auf 1e-5 mm; keine negative Minute', integErr < 1e-5 && neg === 0, `Integral ${integErr}, negativ ${neg}`);
  add('K5 flache Stunde (zwölf gleiche Stufen 0,3 mm/h) bleibt eine waagerechte Linie (< 1e-12); Nullen bleiben Nullen', flatErr < 1e-12 && run.filter((p) => p.tMs > T0 + STEP && p.tMs < T0 + 24 * STEP).every((p) => p.mmH === 0), `${flatErr}`);
  const peakStep = Math.max(...steps.map((s) => s.mmH)), peakCurve = Math.max(...run.map((p) => p.mmH));
  add('K6 Überschwingen begrenzt: Gipfel der Kurve ≤ 3 × höchste Stufe (Fritsch–Butland), hier gemessen', peakCurve <= 3 * peakStep + 1e-9, `Stufe ${peakStep.toFixed(2)}, Kurve ${peakCurve.toFixed(2)} (×${(peakCurve / peakStep).toFixed(2)})`);
  // gaps: a missing hour splits the runs, no minute lies in the gap; clipping at endMs
  const gapped = steps.filter((s) => s.fromMs < T0 + 5 * H || s.fromMs >= T0 + 6 * H);
  const gRuns = rucMinuteCurve(gapped, T0 + 10 * H + 2 * MIN);
  add('K7 Lücke (Stunde 11–12 UTC fehlt) ⇒ zwei Läufe, keine Probe in der Lücke; endMs schneidet den zweiten Lauf bei 16:02',
    gRuns.length === 2 && gRuns[0][gRuns[0].length - 1].tMs === T0 + 5 * H && gRuns[1][0].tMs === T0 + 6 * H && gRuns[1][gRuns[1].length - 1].tMs === T0 + 10 * H + 2 * MIN
    && !gRuns.flat().some((p) => p.tMs > T0 + 5 * H && p.tMs < T0 + 6 * H), `${gRuns.length} Läufe`);
  add('K8 rucCurveAt: Probe der Minute, in der Lücke null, vor dem Anfang null', rucCurveAt(gRuns, T0 + 4 * H + 7 * MIN)?.tMs === T0 + 4 * H + 7 * MIN && rucCurveAt(gRuns, T0 + 5 * H + 30 * MIN) === null && rucCurveAt(gRuns, T0) === null);
  // the curve on a real fit: hourly sums of the fit are Fusion's (block F), the curve keeps them
  const RUN_MS = T0 - 2 * H;
  const rucIn = { run: '2026102504', runAtMs: RUN_MS, builtAtMs: RUN_MS + 45 * MIN, ageMin: 60, stepMin: 5, cell: { iy: 0, ix: 0 }, chunk: { cy: 0, cx: 0, column: 0 }, manifest: null,
    points: Array.from({ length: RUC_STEPS }, (_, k) => ({ fromMs: RUN_MS + k * STEP, toMs: RUN_MS + (k + 1) * STEP, mmH: k % 7 === 0 ? 0 : rnd() * 3 })) };
  const fh = Array.from({ length: 30 }, (_, i) => ({ tMs: RUN_MS + (i + 1) * H, mmH: i % 5 === 0 ? 0 : Math.round(rnd() * 20) / 10, conf: 0.5, tempC: 10, snowLineM: null, windDir: null, windMs: null, gustMs: null }));
  const fit = fitRucToFusion(rucIn, fh, T0);
  const fRuns = rucMinuteCurve(fit.points);
  let fitErr = 0, n = 0;
  for (const hr of fit.hours) {
    const a = rucCurveAt(fRuns, hr.hourStartMs), b = rucCurveAt(fRuns, hr.hourEndMs);
    if (!a || !b || a.tMs !== hr.hourStartMs || b.tMs !== hr.hourEndMs) continue;
    n++; fitErr = Math.max(fitErr, Math.abs(b.mm - a.mm - hr.fusionMmH));
  }
  add('K9 auf einem echten Fit (fitRucToFusion, 27 Stunden mit dry/flat/form/mixed): die Kurve trägt je Stunde exakt die Fusion-Summe (< 1e-9 mm)', n >= 20 && fitErr < 1e-9, `${n} Stunden, max ${fitErr}`);
  add('K10 Schalter: ohne Query an, `?mvcurve=0` aus, `?mvcurve=1` an, kaputte Query an', rucCurveEnabledFrom('') && !rucCurveEnabledFrom('?a=1&mvcurve=0') && rucCurveEnabledFrom('?mvcurve=1') && rucCurveEnabledFrom(null));
  const chartSrc = readFileSync(join(ROOT, 'src/nowcast/MinuteChart.tsx'), 'utf8');
  const cardSrc = readFileSync(join(ROOT, 'src/nowcast/MinuteSeriesCard.tsx'), 'utf8');
  add('K11 Verdrahtung: Diagramm rechnet die Kurve aus den (kanten-bereinigten) Stufen, nimmt ihr Maximum in yMax, zeichnet je Lauf, Hover auf der Kurve mit 5-min-Mittel; Kachel liest den Schalter und reicht ihn beiden Diagrammen; Quellzeile „Minute interpoliert"',
    /rucMinuteCurve\(rucPts, endMs, undefined, /.test(chartSrc) && /for \(const run of rucCurve\) for \(const p of run\) maxInRange = Math\.max\(maxInRange, p\.mmH\)/.test(chartSrc) && /rucCurveAt\(geom\.rucCurve, hoverMs\)/.test(chartSrc) && /5-min-Mittel/.test(chartSrc)
    && /const curve = rucCurveEnabledFrom\(/.test(cardSrc) && (cardSrc.match(/curve=\{curve\}/g) ?? []).length === 2 && /5-min-Summen\$\{bars \? ', ein Balken je 5 min' : curve \? ', Minute interpoliert' : ''\}/.test(cardSrc));
  add('K11b Gegenprobe: Muster K11 erkennt die Abwesenheit', !/rucCurveAt\(geom\.rucCurve, hoverMs\)/.test(chartSrc.replace('rucCurveAt(geom.rucCurve, hoverMs)', 'null')));

  // soft start at the radar seam (Jan 25.10.): the radar's last minute is the start tangent, every sum untouched, clamped to 3 × first mean
  const seamSteps = steps.slice(36, 60).map((s) => ({ ...s }));
  seamSteps[0].mmH = 0.6;
  const seamAt = seamSteps[0].fromMs;
  const soft = rucMinuteCurve(seamSteps, Infinity, 1000, { startMmH: 1.2, startAtMs: seamAt })[0];
  const plain = rucMinuteCurve(seamSteps, Infinity, 1000)[0];
  let softMass = 0, softNeg = 0;
  for (const s of seamSteps) { const a = soft.find((p) => p.tMs === s.fromMs), b = soft.find((p) => p.tMs === s.toMs); softMass = Math.max(softMass, Math.abs(b.mm - a.mm - s.mmH * (s.toMs - s.fromMs) / H)); }
  for (const p of soft) if (p.mmH < 0) softNeg++;
  const firstEnd = seamSteps[0].toMs;
  add('K12 weicher Start: Kurve beginnt mit dem Radarwert 1,2 (erstes 5-min-Mittel 0,6), ab dem zweiten Intervall gleich der Kurve ohne Start; jede 5-min-Summe exakt, keine negative Minute',
    Math.abs(soft[0].mmH - 1.2) < 1e-12 && Math.abs(plain[0].mmH - 0.6) < 1e-12 && softMass < 1e-9 && softNeg === 0
    && soft.filter((p) => p.tMs >= firstEnd).every((p, i) => Math.abs(p.mmH - plain.filter((q) => q.tMs >= firstEnd)[i].mmH) < 1e-12), `Start ${soft[0].mmH}, Masse ${softMass}, negativ ${softNeg}`);
  const capped = rucMinuteCurve(seamSteps, Infinity, 1000, { startMmH: 5, startAtMs: seamAt })[0];
  const dryFirst = seamSteps.map((s, i) => (i === 0 ? { ...s, mmH: 0 } : s));
  const dry = rucMinuteCurve(dryFirst, Infinity, 1000, { startMmH: 1.2, startAtMs: seamAt })[0];
  const elsewhere = rucMinuteCurve(seamSteps, Infinity, 1000, { startMmH: 1.2, startAtMs: seamAt + MIN })[0];
  add('K13 Deckel 3 × Mittel (Radar 5 ⇒ Start 1,8, keine negative Minute), trockenes erstes Intervall ⇒ Start 0 (Kante bleibt), Startzeit ≠ Laufbeginn ⇒ ohne Wirkung',
    Math.abs(capped[0].mmH - 1.8) < 1e-12 && capped.every((p) => p.mmH >= 0) && dry[0].mmH === 0 && dry.every((p) => p.tMs > firstEnd || p.mmH === 0) && Math.abs(elsewhere[0].mmH - 0.6) < 1e-12,
    `Deckel ${capped[0].mmH}, trocken ${dry[0].mmH}, anderswo ${elsewhere[0].mmH}`);
  add('K14 Verdrahtung: das Diagramm reicht den letzten Radar-Minutenwert als Start, nur wenn das Radar genau am ersten Schritt endet',
    /radarLast && radarLast\.tMs === rucPts\[0\]\.fromMs \? \{ startMmH: radarLast\.mmH, startAtMs: radarLast\.tMs \} : \{\}/.test(readFileSync(join(ROOT, 'src/nowcast/MinuteChart.tsx'), 'utf8')));
}

// ---------------------------------------------------------------------------
console.log('\nL Balken je Ebene (E-RUC-15, 25.10.): ein Balken je Radarbild, Kachel-Zahlen aus den Balken, Schalter aus ⇒ byte-gleich, Verdrahtung');
{
  const T0 = Date.UTC(2026, 9, 25, 8), NOW = T0 + 2 * MIN;    // now 08:02, images 08:00, 08:05, … 10:00 (25 frames)
  const frames = [];
  for (let k = 0; k <= 24; k++) frames.push({ tMs: T0 + k * 5 * MIN, mmH: k < 4 ? 0 : k === 4 ? 0.08 : k < 10 ? 0.6 + 0.1 * k : k === 10 ? 3 : 0.2 });
  const fusionHours = Array.from({ length: 30 }, (_, i) => ({ tMs: T0 + (i + 1) * H, mmH: 0, conf: 0.5 }));   // dry hours: the sum is the radar's alone
  const inp = { nowMs: NOW, radarFrames: frames, radarSource: 'radolan_rv', fusionHours, fusionPWet: null, fusionLabel: 'buscosun Fusion' };
  const s0 = buildMinuteSeries(inp), sOff = buildMinuteSeries({ ...inp, bars: false }), s1 = buildMinuteSeries({ ...inp, bars: true });
  const b = s1.radar.bars;
  add('L1 Balken: 24 Balken (ein Bild weniger als Bilder), lückenlos von jetzt (erster Balken bei 08:02 angeschnitten) bis zum letzten Bild 10:00, Wert = Bild am Balkenanfang, kein Balken über das Radar hinaus',
    b.length === 24 && b[0].fromMs === NOW && b[0].frameMs === T0 && b[0].toMs === T0 + 5 * MIN && b.every((x, i) => i === 0 || x.fromMs === b[i - 1].toMs) && b[b.length - 1].toMs === s1.radar.toMs
    && b.every((x) => x.mmH === frames.find((f) => f.tMs === x.frameMs).mmH), `${b.length} Balken, ${JSON.stringify(b[0])}`);
  add('L2 mit Balken: erster Regen = Beginn des ersten nassen Bildes (08:25, Bild 4 ist 0,08 < 0,1), Spitze 3 mm/h um 08:50, Summe = Σ Bild × Dauer; ohne Balken: Minute 08:21 (interpoliert), gleiche Spitze',
    s1.firstWet?.tMs === T0 + 25 * MIN && s1.firstWet.source === 'radar' && s1.peak?.mmH === 3 && s1.peak.tMs === T0 + 50 * MIN
    && Math.abs(s1.sumMm - Math.round(b.reduce((a, x) => a + x.mmH * (x.toMs - x.fromMs) / H, 0) * 10) / 10) < 1e-9
    && s0.firstWet?.tMs > T0 + 20 * MIN && s0.firstWet.tMs < T0 + 25 * MIN && s0.peak?.mmH === 3,
    `mit ${new Date(s1.firstWet?.tMs).toISOString()} Summe ${s1.sumMm} · ohne ${new Date(s0.firstWet?.tMs).toISOString()} Summe ${s0.sumMm}`);
  add('L3 Schalter aus (bars: false) ⇒ byte-gleich zur Reihe ohne Option; Radar-Balken liegen trotzdem bereit (die Zeichnung wählt)', JSON.stringify(sOff) === JSON.stringify(s0) && s0.radar.bars.length === 24);
  add('L4 Schalter: ohne Query an, `?mvbars=0` aus, kaputte Query an', minuteBarsEnabledFrom('') && !minuteBarsEnabledFrom('?mvbars=0&x=1') && minuteBarsEnabledFrom(null));
  const chartL = readFileSync(join(ROOT, 'src/nowcast/MinuteChart.tsx'), 'utf8');
  const cardL = readFileSync(join(ROOT, 'src/nowcast/MinuteSeriesCard.tsx'), 'utf8');
  add('L5 Verdrahtung: Kachel liest den Schalter, reicht `bars` an die Reihe und beide Diagramme; Diagramm zeichnet Radar- und RUC-Balken nur mit `bars`, Linie/Kurve nur ohne; Hover nennt das Bild; Fußtext „Nichts ist interpoliert"',
    /const bars = minuteBarsEnabledFrom\(/.test(cardL) && /horizonH: MV_VIEW_H,\n    bars,/.test(cardL) && (cardL.match(/bars=\{bars\}/g) ?? []).length === 2 && /Nichts ist interpoliert\./.test(cardL)
    && /\{bars && geom\.radarBars\.map/.test(chartL) && /\{bars && geom\.rucPts\.map/.test(chartL) && /if \(bars \|\| pts\.length < 2 \|\| width === 0\) return null;/.test(chartL)
    && /curve && !bars && rucPts\.length/.test(chartL) && /mv-bar mv-bar--radar/.test(chartL) && /mv-bar mv-bar--ruc/.test(chartL) && /gilt bis \$\{fmtClock\(hoverBar\.toMs\)\}/.test(chartL));
  add('L5b Gegenprobe: Muster L5 erkennt die Abwesenheit', !/\{bars && geom\.radarBars\.map/.test(chartL.replace('{bars && geom.radarBars.map', '{geom.radarBars.map')));
}

console.log(`\nverify:ruc ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
