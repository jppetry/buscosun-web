// ---------------------------------------------------------------------------
// RD3 — verify:radar-repack: Bekommt der Client aus den abgeleiteten Dateien
// EXAKT die Bytes, die er heute selbst dekodiert? (`audit/radar-datenrepo.md` §14)
//
// A  netzfrei: der Vertrag (`src/sources/radarImg.ts`) — Pfade, Stempel,
//    Meta-Bauer ↔ -Prüfer, Drift-Ablehnung, Gates ≥ gemessene Ketten, Kill-Switch.
// B  an ECHTEN Dateien (DWD/GeoSphere/MeteoSwiss direkt; ohne Netz ⊘ statt rot):
//    der Producer-Weg selbst — `radar-derive.mjs` wird als Kindprozess gespawnt
//    (wie im Spiegel) und seine PNGs/JSONs werden Byte für Byte gegen die
//    Client-Decoder gehalten (`Buffer.compare === 0`, deep-equal).
// C  mit RADAR_CHECK_CDN=1: liegen gegattete Slots wirklich auf dem CDN?
//    (fragt NUR gegattete Slots an — kein 404-Vergiften)
//
// Aufruf: npm run verify:radar-repack
// ---------------------------------------------------------------------------

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from './lib/png.mjs';
import { decompressBz2 } from './lib/bz2.mjs';
import {
  RADAR_IMG_BASE, RV_IMG_GATE_MS, KONRAD_IMG_GATE_MS, RV_IMG_LEADS, INCA_IMG_LEADS,
  RV_IMG_WIDTH, RV_IMG_HEIGHT, INCA_IMG_WIDTH, INCA_IMG_HEIGHT, RZC_IMG_WIDTH, RZC_IMG_HEIGHT,
  radarImgStamp, radarImgStampToMs, radarImgFrameFile, rvImgDir, incaImgDir, rzcImgDir, konradImgUrl,
  makeRvImgMeta, makeIncaImgMeta, makeRzcImgMeta,
  parseRvImgMeta, parseIncaImgMeta, parseRzcImgMeta, parseKonradImgJson, radarImgFlagFrom,
} from '../src/sources/radarImg.ts';
import { RV_CDN_GATE_MS, rvStamp, RADAR_CDN_WINDOW_MS, rvImgEligible, _resetRadarCdn } from '../src/sources/radolanRuns.ts';
import { guessIncaStamps, INCA_IMG_GATE_MS } from '../src/sources/geosphereIncaGrid.ts';
import { PRECIP_VMAX } from '../src/scalar/RainLayer.ts';
import { decodeRvTar } from '../src/sources/radolanDecode.ts';
import { decodeRvHdf5Tar } from '../src/sources/rvHdf5.ts';
import { rvFileNameOf as rvFileName } from '../src/sources/radolanDecode.ts';
import { parseIncaNetcdf } from '../src/sources/incaParse.ts';
import { parseRzcHdf5 } from '../src/sources/rzcParse.ts';
import { parseKonrad3d } from '../src/radar/konrad3d.ts';
import { decodeGrayPng, GrayPngUnsupported } from '../src/sources/grayPng.ts';
// E-AX-16 (audit/fusion-ausbau.md §6m): das Stundenmittel als Produkt des Spiegels — Producer-Seite, Umkehrung, Punktleser.
import { rvHourMeanPlan, rvHourMeanImage, rvHourMeanPixel, rvHourMeanMeta } from '../src/sources/radarImgHourMean.ts';
import { NOWCAST_SATURATION, nowcastHourMeanFile, nowcastHourMeanFromSum } from '../src/point/nowcastFormat.ts';
import { sampleNowcastFrame, sampleNowcastHourMean } from '../src/point/nowcastSample.ts';

let passed = 0, failed = 0, skipped = 0;
const add = (name, ok, detail) => {
  if (ok) passed++; else failed++;
  console.log(`${ok ? '✔' : '✘'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const skip = (name, why) => { skipped++; console.log(`⊘ ${name} — ${why}`); };
const eq = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;

const WORK = resolve('.cache/radar-repack');
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });

// ── A: Vertrag, netzfrei ──────────────────────────────────────────────────────

add('A1 Basis-URL trägt Version + Radar-CDN-Stamm',
  RADAR_IMG_BASE === 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/radar/img/v1', RADAR_IMG_BASE);
add('A2 Pfade: rv/inca/rzc/konrad haben die Spiegel-Form',
  rvImgDir('2609030815') === `${RADAR_IMG_BASE}/rv/2609030815`
  && incaImgDir('20260903T0800') === `${RADAR_IMG_BASE}/inca/20260903T0800`
  && rzcImgDir('20260903T0830') === `${RADAR_IMG_BASE}/rzc/20260903T0830`
  && konradImgUrl('20260903T081500') === `${RADAR_IMG_BASE}/konrad3d/20260903T081500/cells.json`);
add('A3 Frame-Datei: f000/f005/f120', radarImgFrameFile(0) === 'f000.png' && radarImgFrameFile(5) === 'f005.png' && radarImgFrameFile(120) === 'f120.png');
{
  const ms = Date.UTC(2026, 8, 3, 8, 15);
  add('A4 Stempel-Rundlauf YYYYMMDDTHHMM', radarImgStamp(ms) === '20260903T0815' && radarImgStampToMs('20260903T0815') === ms
    && Number.isNaN(radarImgStampToMs('2609030815')));
}
add('A5 Leads: RV 25×5 min (0…120, +2 h bleibt), INCA 12×15 min (15…180)',
  RV_IMG_LEADS.length === 25 && RV_IMG_LEADS[0] === 0 && RV_IMG_LEADS[24] === 120
  && INCA_IMG_LEADS.length === 12 && INCA_IMG_LEADS[0] === 15 && INCA_IMG_LEADS[11] === 180);

{
  const rvFrames = RV_IMG_LEADS.map((l) => ({ lead: l, file: radarImgFrameFile(l), bytes: 100 + l }));
  const m = makeRvImgMeta('2609030815', 123, rvFrames);
  const j = JSON.parse(JSON.stringify(m));
  add('A6 rv-Meta: Bauer → JSON → Prüfer besteht', parseRvImgMeta(j) !== null);
  add('A7 rv-Meta: vMax-Drift wird abgelehnt', parseRvImgMeta({ ...j, vMax: PRECIP_VMAX + 1 }) === null);
  add('A8 rv-Meta: falsche Maße werden abgelehnt', parseRvImgMeta({ ...j, width: 1101 }) === null);
  add('A9 rv-Meta: fehlender Frame wird abgelehnt', parseRvImgMeta({ ...j, frames: j.frames.slice(1) }) === null);
  add('A10 rv-Meta: Maße = 1100×1200', m.width === RV_IMG_WIDTH && m.height === RV_IMG_HEIGHT && RV_IMG_WIDTH === 1100 && RV_IMG_HEIGHT === 1200);
}
{
  // A32–A36 (E-AX-16, audit/fusion-ausbau.md §6m): das Stundenmittel als Produkt — der Plan je Slotminute, das Zusatzfeld im Meta,
  // das Summenbild und seine Umkehrung (dieselbe Arithmetik wie der Motor über die Einzelframes).
  const plan00 = rvHourMeanPlan(RV_IMG_LEADS, Date.UTC(2026, 9, 2, 15, 0));
  const plan45 = rvHourMeanPlan(RV_IMG_LEADS, Date.UTC(2026, 9, 2, 14, 45));
  const plan05 = rvHourMeanPlan(RV_IMG_LEADS, Date.UTC(2026, 9, 2, 15, 5));
  const sig = (p) => p.map((e) => `${e.lead}:${e.leads[0]}-${e.leads.at(-1)}/${e.leads.length}`).join(' ');
  add('A32 Stundenmittel-Plan: Slot :00 ⇒ m060 (f005…f060) + m120 (f065…f120); :45 ⇒ m075 (12) + m135 (f080…f120, 9 Frames), keine erste Stunde (4 Frames < 6); :05 ⇒ m055 (f000…f055) + m115',
    sig(plan00) === '60:5-60/12 120:65-120/12' && sig(plan45) === '75:20-75/12 135:80-120/9' && sig(plan05) === '55:0-55/12 115:60-115/12',
    `${sig(plan00)} · ${sig(plan45)} · ${sig(plan05)}`);
  const rvFrames = RV_IMG_LEADS.map((l) => ({ lead: l, file: radarImgFrameFile(l), bytes: 100 + l }));
  const hms = plan45.map((e) => rvHourMeanMeta(e, 5000 + e.lead));
  const j = JSON.parse(JSON.stringify(makeRvImgMeta('2610021445', 123, rvFrames, hms)));
  const { hourMeans: _hm, ...without } = j;
  add('A33 rv-Meta mit hourMeans: Bauer → JSON → Prüfer besteht; ohne das Feld (Slots vor dem 02.10.) ebenso; Dateien m075/m135, frames = Fensterlänge, Fenstergrenzen aus dem Plan',
    parseRvImgMeta(j) !== null && parseRvImgMeta(without) !== null && j.hourMeans[0].file === 'm075.png' && j.hourMeans[1].file === 'm135.png'
    && j.hourMeans[0].frames === 12 && j.hourMeans[1].frames === 9 && j.hourMeans[1].leadFrom === 80 && j.hourMeans[1].leadTo === 120 && j.hourMeans[1].bytes === 5135);
  const bad = (patch) => parseRvImgMeta({ ...j, hourMeans: [{ ...j.hourMeans[0], ...patch }, j.hourMeans[1]] }) === null;
  add('A34 rv-Meta: kaputte hourMeans werden abgelehnt (fremder Dateiname, frames ≠ Fenster, Fenster über den Lead, Lead > 180, bytes 0, kein Array)',
    bad({ file: 'h075.png' }) && bad({ frames: 11 }) && bad({ leadTo: 80 }) && bad({ lead: 185, file: 'm185.png' }) && bad({ bytes: 0 })
    && parseRvImgMeta({ ...j, hourMeans: 'x' }) === null && parseRvImgMeta({ ...j, hourMeans: [] }) !== null);
  // Summenbild 2×2 aus drei Frames: Summen, Sättigungszähler, Umkehrung.
  const f1 = Uint8Array.of(0, 10, 255, 1), f2 = Uint8Array.of(0, 20, 255, 0), f3 = Uint8Array.of(0, 30, 5, 0);
  const img = rvHourMeanImage([f1, f2, f3], 2, 2);
  const px = (i) => rvHourMeanPixel(img[i * 3], img[i * 3 + 1], img[i * 3 + 2]);
  add('A35 Summenbild (RGB): R·256 + G = Summe der Rohbytes (0 · 60 · 515 · 1), B = Zahl der 255er (0 · 0 · 2 · 0), 3 Bytes je Pixel',
    img.length === 12 && px(0).sum === 0 && px(1).sum === 60 && px(2).sum === 515 && px(3).sum === 1
    && px(0).nSat === 0 && px(1).nSat === 0 && px(2).nSat === 2 && px(3).nSat === 0);
  const engine = (NOWCAST_SATURATION + NOWCAST_SATURATION + (5 / 255) * PRECIP_VMAX) / 3;
  const dec = nowcastHourMeanFromSum(px(2).sum, px(2).nSat, 3);
  add('A36 Umkehrung: ((Summe − 255·nSat)·vMax/255 + nSat·NOWCAST_SATURATION) / frames = das Mittel des Motors über die Frames (gesättigt zählt als NOWCAST_SATURATION, nicht als 20); ein Nieselbyte unter trockenen bleibt > 0',
    Math.abs(dec.mmh - engine) < 1e-12 && dec.saturated
    && Math.abs(nowcastHourMeanFromSum(px(1).sum, 0, 3).mmh - ((60 / 255) * PRECIP_VMAX) / 3) < 1e-12 && !nowcastHourMeanFromSum(px(1).sum, 0, 3).saturated
    && nowcastHourMeanFromSum(px(3).sum, 0, 3).mmh > 0 && nowcastHourMeanFromSum(px(3).sum, 0, 3).mmh < 0.06,
    `${dec.mmh.toFixed(6)} gegen ${engine.toFixed(6)} mm/h`);
}
{
  const corners = [[8.09, 49.37], [17.75, 49.4], [17.44, 45.53], [8.46, 45.5]];
  const frames = INCA_IMG_LEADS.map((l) => ({ lead: l, file: radarImgFrameFile(l), bytes: 10 }));
  const j = JSON.parse(JSON.stringify(makeIncaImgMeta('20260903T0800', 5, corners, frames)));
  add('A11 inca-Meta: Bauer → Prüfer besteht (701×431, Ecken Pflicht)', parseIncaImgMeta(j) !== null && j.width === INCA_IMG_WIDTH && INCA_IMG_HEIGHT === 431);
  add('A12 inca-Meta: kaputte Ecken werden abgelehnt', parseIncaImgMeta({ ...j, corners: [[1, 2], [3, 4]] }) === null);
  const rz = JSON.parse(JSON.stringify(makeRzcImgMeta('20260903T0830', null, corners, 1234)));
  add('A13 rzc-Meta: Bauer → Prüfer besteht (710×640, frame.png, validAt null erlaubt)',
    parseRzcImgMeta(rz) !== null && rz.frames[0].file === 'frame.png' && RZC_IMG_WIDTH === 710 && RZC_IMG_HEIGHT === 640);
  add('A14 rzc-Meta: fremder Frame-Name wird abgelehnt', parseRzcImgMeta({ ...rz, frames: [{ lead: 0, file: 'x.png', bytes: 1 }] }) === null);
}
add('A15 KONRAD-Umschlag: schema 1 + Run-Form Pflicht',
  parseKonradImgJson({ schema: 1, run: { refMs: 1, file: 'a.xml', cells: [] } }) !== null
  && parseKonradImgJson({ schema: 2, run: { refMs: 1, file: 'a.xml', cells: [] } }) === null
  && parseKonradImgJson({ schema: 1, run: { refMs: 1, cells: [] } }) === null);

add('A16 RV-Bild-Gate liegt über dem Tar-Gate + gemessener Derive-Zeit',
  RV_IMG_GATE_MS > RV_CDN_GATE_MS && RV_IMG_GATE_MS >= (206 + 17 + 4 + 3) * 1000, `${RV_IMG_GATE_MS} > ${RV_CDN_GATE_MS}`);
add('A17 KONRAD-Bild-Gate ≥ RD2-Gate (selber Push)', KONRAD_IMG_GATE_MS >= 330_000);
add('A18 Fenster: Bild-Gates passen ins 55-min-CDN-Fenster', RV_IMG_GATE_MS < RADAR_CDN_WINDOW_MS && KONRAD_IMG_GATE_MS < RADAR_CDN_WINDOW_MS);
add('A19 Kill-Switch: Query schlägt Speicher in beide Richtungen; default an',
  !radarImgFlagFrom('?radarimg=0', '1') && radarImgFlagFrom('?radarimg=1', '0')
  && !radarImgFlagFrom('', '0') && radarImgFlagFrom('', null));

{
  // A20–A22: rvImgEligible — Gate-/Fenster-Grenzen und beide Schalter über die echte
  // globale Leitung (injiziertes localStorage, Muster verify:radar-runs §D).
  const ts = rvStamp(new Date(Date.UTC(2026, 8, 3, 8, 0)));
  const t0 = Date.UTC(2026, 8, 3, 8, 0);
  _resetRadarCdn();
  add('A20 rvImgEligible: Gate- und Fenster-Grenzen',
    !rvImgEligible(ts, t0 + RV_IMG_GATE_MS - 1000) && rvImgEligible(ts, t0 + RV_IMG_GATE_MS)
    && rvImgEligible(ts, t0 + RADAR_CDN_WINDOW_MS) && !rvImgEligible(ts, t0 + RADAR_CDN_WINDOW_MS + 60_000));
  const realLS = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: (k) => (k === 'radarimg' ? '0' : null) };
    add('A21 rvImgEligible: localStorage.radarimg=0 schaltet den Bild-Weg ab', !rvImgEligible(ts, t0 + RV_IMG_GATE_MS));
    globalThis.localStorage = { getItem: (k) => (k === 'radarcdn' ? '0' : null) };
    add('A22 rvImgEligible: der äußere Schalter radarcdn=0 schaltet ihn ebenfalls ab', !rvImgEligible(ts, t0 + RV_IMG_GATE_MS));
  } finally {
    if (realLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = realLS;
  }
}

{
  // A23–A26: INCA-Ausfall-Rückfall (RD3c-Nachtrag) — gerechnete Stempel, wenn
  // GeoSphere GANZ weg ist (das `/metadata` flattert gemessen mit 502/503).
  const stamps = guessIncaStamps(3, Date.UTC(2026, 8, 3, 12, 40));
  add('A23 guessIncaStamps: 15-min-Raster, absteigend, gegattert',
    stamps.length === 3 && stamps.every((x) => /^\d{8}T\d{4}$/.test(x))
    && radarImgStampToMs(stamps[0]) - radarImgStampToMs(stamps[1]) === 15 * 60_000
    && Date.UTC(2026, 8, 3, 12, 40) - radarImgStampToMs(stamps[0]) >= INCA_IMG_GATE_MS, stamps.join(' '));
  add('A24 INCA-Gate ≥ gemessener reftime→Push-Spanne (22,8 min) + Reserve',
    INCA_IMG_GATE_MS >= 23 * 60_000, `${INCA_IMG_GATE_MS / 60_000} min`);
  add('A25 Kandidaten liegen im Spiegel-Fenster (Retention 12 × 15 min = 3 h)',
    Date.UTC(2026, 8, 3, 12, 40) - radarImgStampToMs(stamps[2]) < 3 * 3600_000);
  const src = readFileSync(resolve('src/sources/geosphereIncaGrid.ts'), 'utf8');
  const iDirect = src.indexOf('output_format=netcdf&bbox=');
  const iGuess = src.indexOf('loadIncaFromImgGuessed(priority)', iDirect);
  add('A26 Frische-Regel: der geratene Bild-Weg läuft NACH dem Direktweg',
    iDirect > 0 && iGuess > iDirect && /catch \(err\) \{[\s\S]{0,300}loadIncaFromImgGuessed/.test(src));
  // A27: der Fremdhost darf den GETEILTEN CDN-Latch nicht belasten — ein 502 des
  // GeoSphere-`/metadata` hätte sonst auch RV/KONRAD/rzc auf den Altweg geschaltet.
  const meta = src.slice(src.indexOf('const mr = await fetch(META_URL'), src.indexOf('const grid = await loadIncaSlot'));
  add('A27 GeoSphere-Fehler zählt NICHT in den CDN-Latch (eigenes catch, kein noteRadarCdnFailure)',
    /catch \{[\s\S]{0,200}return null;/.test(meta) && !meta.includes('noteRadarCdnFailure'));
}

{
  // A28–A29: CH — MeteoSwiss listet ein Asset, bevor es abrufbar ist (403 am jüngsten
  // gemessen, §14.5). Der Leser muss mehrere Kandidaten haben und bei Totalausfall
  // den Spiegel nehmen dürfen — beides NACH dem Direktweg (Frische-Regel).
  const src = readFileSync(resolve('src/sources/meteoSwissRadar.ts'), 'utf8');
  add('A28 rzc: mehrere STAC-Kandidaten, jüngstes zuerst, !ok ⇒ nächstälteres',
    /resolveRzcHrefs\(/.test(src) && /slice\(-count\)\.reverse\(\)/.test(src)
    && /if \(!res\.ok\) \{[\s\S]{0,200}continue;/.test(src) && !src.includes('resolveLatestRzcHref'));
  const iDirect = src.indexOf('resolveRzcHrefs(undefined, priority)');
  const iGuess = src.indexOf('loadRzcFromImg(priority, true)', iDirect);
  add('A29 rzc: Ausfall-Bildweg läuft NACH dem Direktweg und ignoriert dann das Frische-Fenster',
    iDirect > 0 && iGuess > iDirect && /!quelleWeg && guessRzcStamps/.test(src));
}

{
  // A30/A31: Ladeweg-Mechanik wie beim ICON-Repack — 33 MPixel je Lauf gehören
  // off-main, und der Worker muss BEIDE Aufträge kennen (Tar wie PNG).
  const rad = readFileSync(resolve('src/sources/radolan.ts'), 'utf8');
  const wrk = readFileSync(resolve('src/sources/radolanWorker.ts'), 'utf8');
  add('A30 RV-Bildweg dekodiert off-main (Worker), mit Hauptthread-Rückfall',
    /decodeGrayPngsOffMain\(/.test(rad) && /rwInit\(\);[\s\S]{0,200}return onMain\(\)/.test(rad)
    && /w\.postMessage\(\{ id, pngs \}/.test(rad));
  add('A31 Worker kennt beide Aufträge (tarBuf und pngs) und transferiert die Werte',
    /pngs\?:/.test(wrk) && /decodeGrayPng\(/.test(wrk) && /decodeRvTar\(/.test(wrk)
    && /out\.map\(\(f\) => f\.valuesBuf\)/.test(wrk));
}

// ── B: Producer-Weg an echten Dateien (Kindprozess wie im Spiegel) ────────────

const APP = resolve('.');
function runDerive(source, inPath, stamp) {
  const outDir = join(WORK, 'img', source, stamp);
  execFileSync(process.execPath, [
    '--experimental-strip-types', '--import', pathToFileURL(join(APP, 'scripts', 'lib', 'register-ts.mjs')).href,
    join(APP, 'scripts', 'radar-mirror', 'radar-derive.mjs'), source, inPath, outDir, stamp,
  ], { encoding: 'utf8', timeout: 180_000, stdio: ['ignore', 'pipe', 'pipe'] });
  return outDir;
}
const grayOf = (pngBytes) => {
  const d = decodePng(pngBytes);
  if (d.channels !== 1) throw new Error(`PNG hat ${d.channels} Kanäle statt 1`);
  return { width: d.width, height: d.height, data: d.data };
};
async function fetchBuf(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return new Uint8Array(await r.arrayBuffer());
}
const gatedSlotMs = (gateMs, stepMs) => Math.floor((Date.now() - gateMs - 60_000) / stepMs) * stepMs;

try {
  // B1 — RV: gegatteter Slot, Tar → derive → PNGs byte-gleich zum Client-Decoder.
  const ms = gatedSlotMs(RV_IMG_GATE_MS, 300_000);
  const stamp = rvStamp(new Date(ms));
  // EX-3: die HDF5-Lieferung ist die Form, die der Spiegel ablegt; `ref` ist der Client-Leser dafür.
  const tarPath = join(WORK, 'rv.tar');
  writeFileSync(tarPath, await fetchBuf(`https://opendata.dwd.de/weather/radar/composite/rv/${rvFileName(stamp, 'hdf5')}`));
  const outDir = runDerive('rv', tarPath, stamp);
  const tRef0 = Date.now();
  const ref = await decodeRvHdf5Tar(new Uint8Array(readFileSync(tarPath)));
  const msFast = Date.now() - tRef0;
  let identical = ref.frames.length === 25;
  for (const f of ref.frames) {
    const g = grayOf(readFileSync(join(outDir, radarImgFrameFile(f.leadMinutes))));
    if (g.width !== f.width || g.height !== f.height || !eq(g.data, f.values)) { identical = false; break; }
  }
  add('B1 RV: 25 derive-PNGs byte-gleich zu decodeRvTar (Buffer.compare)', identical, stamp);
  // B1b: der SCHNELLE Client-Dekoder (grayPng.ts, ohne Canvas — 3× schneller, §14.7)
  // muss dieselben Bytes liefern wie der unabhängige `decodePng` und wie der Tar.
  let schnellGleich = true, msDirekt = 0;
  for (const f of ref.frames) {
    const png = readFileSync(join(outDir, radarImgFrameFile(f.leadMinutes)));
    const t0 = Date.now();
    const g = await decodeGrayPng(new Uint8Array(png));
    msDirekt += Date.now() - t0;
    if (g.width !== f.width || g.height !== f.height || !eq(g.values, f.values)) { schnellGleich = false; break; }
  }
  add('B1b RV: grayPng-Dekoder (ohne Canvas) byte-gleich zu decodeRvTar', schnellGleich, `${msDirekt} ms für 25 Frames`);
  {
    // Ablehnungsfälle: fremde Bauart ⇒ benannter Fehler (der Client fällt dann auf Canvas)
    let rejected = 0;
    for (const bad of [Buffer.from('kein png'), Buffer.concat([readFileSync(join(outDir, 'f000.png')).subarray(0, 20)])]) {
      try { await decodeGrayPng(new Uint8Array(bad)); } catch (e) { if (e instanceof GrayPngUnsupported) rejected++; }
    }
    add('B1c grayPng: fremde/abgeschnittene Datei ⇒ GrayPngUnsupported (Canvas übernimmt)', rejected === 2);
  }
  const meta = parseRvImgMeta(JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8')));
  add('B2 RV: meta.json besteht den Client-Prüfer, runAtMs = Tar-Lauf', meta !== null && meta.runAtMs === ref.runAtMs && meta.stamp === stamp);
  add('B2b RV (EX-3): Laufzeit aus der HDF5-Datei = Slot des Dateinamens, Vorläufe 0…120 min im 5-Minuten-Raster',
    ref.runAtMs === ms && ref.frames.every((f, i) => f.leadMinutes === i * 5 && f.validAtMs === ms),
    `${new Date(ref.runAtMs).toISOString()} · ${ref.frames.map((f) => f.leadMinutes).slice(0, 3).join(',')}…${ref.frames.at(-1).leadMinutes}`);

  {
    // B1e/B1f (E-AX-16, audit/fusion-ausbau.md §6m): die Stundenmittel-Bilder des Slots — jedes Pixel die Summe der Frame-Bytes im
    // Fenster und die Zahl der gesättigten Frames; meta.hourMeans = Plan; am Punkt dasselbe Mittel wie der Motor über die Einzelframes.
    const plan = rvHourMeanPlan(ref.frames.map((f) => f.leadMinutes), ref.runAtMs);
    const byLead = new Map(ref.frames.map((f) => [f.leadMinutes, f.values]));
    let ok = plan.length >= 1 && meta !== null && Array.isArray(meta.hourMeans) && meta.hourMeans.length === plan.length;
    let pixels = 0, hmBytes = 0;
    const decoded = [];
    for (const [k, e] of plan.entries()) {
      const png = readFileSync(join(outDir, nowcastHourMeanFile(e.lead)));
      hmBytes += png.length;
      const d = decodePng(png);
      decoded.push({ e, d });
      const mm = meta?.hourMeans?.[k];
      if (!mm || mm.lead !== e.lead || mm.frames !== e.leads.length || mm.leadFrom !== e.leads[0] || mm.leadTo !== e.leads.at(-1) || mm.bytes !== png.length) ok = false;
      if (d.channels !== 3 || d.width !== RV_IMG_WIDTH || d.height !== RV_IMG_HEIGHT) { ok = false; continue; }
      const win = e.leads.map((l) => byLead.get(l));
      for (let i = 0; i < d.width * d.height; i++) {
        let s = 0, c = 0;
        for (const w of win) { const b = w[i]; s += b; if (b === 255) c++; }
        pixels++;
        if (d.data[i * 3] * 256 + d.data[i * 3 + 1] !== s || d.data[i * 3 + 2] !== c) { ok = false; break; }
      }
    }
    add('B1e RV (E-AX-16): Stundenmittel-Bilder m<lead>.png — Pixel für Pixel die Summe der Frame-Bytes im Fenster und die Zahl der gesättigten Frames; meta.hourMeans = Plan (lead, frames, Fenster, bytes)', ok,
      `${plan.map((e) => `m${String(e.lead).padStart(3, '0')} (${e.leads.length} Frames)`).join(', ')} · ${pixels} Pixel · ${(hmBytes / 1024).toFixed(0)} KB gegen ${((meta?.frames ?? []).reduce((s, f) => s + f.bytes, 0) / 1024).toFixed(0)} KB Frames`);
    let pts = 0, maxD = 0, wet = 0, nullMismatch = 0;
    const framePngs = ref.frames.map((f) => ({ f: { lead: f.leadMinutes, file: radarImgFrameFile(f.leadMinutes) }, png: { data: f.values, width: f.width, height: f.height, channels: 1 } }));
    for (const [lat, lon] of [[51.31, 9.49], [53.55, 9.99], [48.14, 11.58], [50.11, 8.68], [52.52, 13.40]]) {
      for (const { e, d } of decoded) {
        const hmEntry = meta?.hourMeans?.find((h) => h.lead === e.lead);
        if (!hmEntry) { nullMismatch++; continue; }
        const a = sampleNowcastHourMean('radvor_rv', meta, { data: d.data, width: d.width, height: d.height, channels: 3 }, lat, lon, hmEntry);
        let s = 0, n = 0;
        for (const fp of framePngs) {
          if (fp.f.lead <= e.lead - 60 || fp.f.lead > e.lead) continue;
          const x = sampleNowcastFrame('radvor_rv', meta, fp.png, lat, lon, fp.f);
          if (!x) { n = -1; break; }
          s += x.saturated ? NOWCAST_SATURATION : x.mmh; n++;
        }
        if ((a == null) !== (n < 0)) { nullMismatch++; continue; }
        if (a == null) continue;
        pts++;
        const dlt = Math.abs(a.mmh - s / n);
        if (dlt > maxD) maxD = dlt;
        if (s > 0) wet++;
      }
    }
    add('B1f RV (E-AX-16): am Punkt dekodiert das Summenbild dasselbe Stundenmittel, das der Motor aus den Einzelframes rechnet (|Δ| ≤ 1e-9; fünf DE-Orte × alle Stunden des Slots)',
      pts > 0 && maxD <= 1e-9 && nullMismatch === 0, `${pts} Vergleiche, max |Δ| ${maxD.toExponential(1)} mm/h, ${wet} nasse Stunden`);
  }

  {
    // B2c — der schnelle Leser (ein Chunk, DecompressionStream) gegen den jsfive-Weg: dieselben Bytes, und schneller.
    const t0 = Date.now();
    const slow = await decodeRvHdf5Tar(new Uint8Array(readFileSync(tarPath)), { reader: 'jsfive' });
    const msSlow = Date.now() - t0;
    const same = slow.frames.length === ref.frames.length && slow.runAtMs === ref.runAtMs
      && slow.frames.every((f, i) => f.leadMinutes === ref.frames[i].leadMinutes && eq(f.values, ref.frames[i].values));
    add('B2c RV (EX-3): schneller Leser byte-gleich zum jsfive-Weg (25 Felder)', same, `${msFast} ms gegen ${msSlow} ms`);
    add('B2c RV (EX-3): der schnelle Weg ist wirklich gelaufen (mindestens doppelt so schnell wie jsfive)', msFast * 2 <= msSlow, `${msFast} ms gegen ${msSlow} ms`);
  }

  // B1h — der Wechsel der Lieferform, am SELBEN Lauf gemessen. Nur möglich, solange der DWD beide
  // Formen ablegt (bis 2026-10-20 08 UTC); danach ⊘. Behauptet wird: dieselbe Radarmaske Zelle für
  // Zelle, und in den nassen Zellen höchstens eine RADOLAN-Einheit Abstand (0,12 mm/h = 2 Byte-Stufen),
  // und das nur auf den Einheitengrenzen (`rvHdf5.ts`, gemessen 1,5 % der nassen Zellen).
  let legacyTar = null;
  try { legacyTar = await fetchBuf(`https://opendata.dwd.de/weather/radar/composite/rv/${rvFileName(stamp, 'radolan')}`); } catch { /* abgeschaltet */ }
  if (!legacyTar) {
    skip('B1h RV (EX-3): HDF5 gegen RADOLAN am selben Lauf', 'das Altformat liegt nicht mehr beim DWD');
  } else {
    const legacyPath = join(WORK, 'rv-legacy.tar.bz2');
    writeFileSync(legacyPath, legacyTar);
    const old = decodeRvTar(await decompressBz2(readFileSync(legacyPath)));
    let maskDiff = 0, wet = 0, differ = 0, maxStep = 0, cells = 0;
    const sameShape = old.frames.length === ref.frames.length && old.runAtMs === ref.runAtMs
      && old.frames.every((f, i) => f.leadMinutes === ref.frames[i].leadMinutes && f.validAtMs === ref.frames[i].validAtMs
        && f.width === ref.frames[i].width && f.height === ref.frames[i].height);
    if (sameShape) {
      for (let i = 0; i < old.frames.length; i++) {
        const a = old.frames[i].values, b = ref.frames[i].values;
        for (let k = 0; k < a.length; k++) {
          cells++;
          if ((a[k] === 0) !== (b[k] === 0)) { maskDiff++; continue; }
          if (a[k] === 0) continue;
          wet++;
          const d = Math.abs(a[k] - b[k]);
          if (d) { differ++; if (d > maxStep) maxStep = d; }
        }
      }
    }
    add('B1h RV (EX-3): beide Lieferformen tragen dieselben 25 Felder (Laufzeit, Vorläufe, Maße)', sameShape,
      `${old.frames.length}/${ref.frames.length} Felder`);
    add('B1h RV (EX-3): trocken/nass stimmt Zelle für Zelle überein (keine erfundene und keine verlorene Zelle)',
      sameShape && maskDiff === 0, `${maskDiff} von ${cells} Zellen`);
    add('B1h RV (EX-3): nasse Zellen weichen höchstens um eine RADOLAN-Einheit ab (≤ 2 Byte-Stufen), und das in ≤ 5 %',
      sameShape && maxStep <= 2 && differ <= 0.05 * Math.max(1, wet), `${differ} von ${wet} nassen Zellen, größter Abstand ${maxStep} Stufen`);
    // Gegenprobe: die feinen Werte (`units: 'native'`) sind NICHT dasselbe Bild — sonst prüfte B1h nichts.
    const fine = await decodeRvHdf5Tar(new Uint8Array(readFileSync(tarPath)), { units: 'native' });
    let fineDiff = 0;
    for (let i = 0; i < fine.frames.length && sameShape; i++) {
      const a = old.frames[i].values, b = fine.frames[i].values;
      for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) fineDiff++;
    }
    add('B1h Gegenprobe: mit den feinen Werten wichen mehr Zellen ab als mit den RADOLAN-Einheiten', wet === 0 || fineDiff > differ + maskDiff,
      `${fineDiff} gegen ${differ + maskDiff}`);
  }
} catch (e) { skip('B1/B2 RV (Netz)', e.message); }

try {
  // B3 — KONRAD: gegatteter Slot, XML → derive → cells.json deep-equal zum Parser.
  const ms = Math.floor((Date.now() - KONRAD_IMG_GATE_MS - 60_000) / 300_000) * 300_000;
  const stamp = `${radarImgStamp(ms)}00`;
  const xmlPath = join(WORK, 'konrad.xml');
  const xml = await fetchBuf(`https://opendata.dwd.de/weather/radar/konrad3d/KONRAD3D_${stamp}.xml`);
  writeFileSync(xmlPath, xml);
  const outDir = runDerive('konrad3d', xmlPath, stamp);
  const env = JSON.parse(readFileSync(join(outDir, 'cells.json'), 'utf8'));
  const ref = parseKonrad3d(new TextDecoder().decode(xml), `KONRAD3D_${stamp}.xml`);
  add('B3 KONRAD: cells.json = {schema:1, run} deep-equal zu parseKonrad3d',
    env.schema === 1 && JSON.stringify(env.run) === JSON.stringify(ref), `${stamp}, ${ref.cells.length} Zellen`);
  add('B4 KONRAD: Umschlag besteht den Client-Prüfer', parseKonradImgJson(env) !== null);
} catch (e) { skip('B3/B4 KONRAD (Netz)', e.message); }

try {
  // B5 — INCA: Live-NetCDF → derive → PNGs + Ecken byte-/wert-gleich zum Parser.
  const ncPath = join(WORK, 'inca.nc');
  const nc = await fetchBuf('https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km?parameters=rr&output_format=netcdf&bbox=45.51,8.11,49.47,17.73');
  writeFileSync(ncPath, nc);
  const stamp = radarImgStamp(Date.now());
  const outDir = runDerive('inca', ncPath, stamp);
  const ref = parseIncaNetcdf(nc.buffer.slice(nc.byteOffset, nc.byteOffset + nc.byteLength));
  // Frame-Zahl ist NICHT fix: die API liefert je nach Lauf-Alter 11 oder 12 (deshalb
  // trägt das Meta die echten Leads). Geprüft wird, dass JEDER gelieferte Frame
  // byte-gleich ankommt — nicht, wie viele es sind.
  let identical = ref.frames.length >= 1 && ref.frames.length <= 12;
  for (const f of ref.frames) {
    const g = grayOf(readFileSync(join(outDir, radarImgFrameFile(Math.round(f.leadHours * 60)))));
    if (!eq(g.data, f.values)) { identical = false; break; }
  }
  add(`B5 INCA: alle ${ref.frames.length} derive-PNGs byte-gleich zu parseIncaNetcdf`, identical);
  const meta = parseIncaImgMeta(JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8')));
  add('B6 INCA: meta.json besteht den Prüfer, Ecken = Datei-Ecken',
    meta !== null && JSON.stringify(meta.corners) === JSON.stringify(ref.corners));
} catch (e) { skip('B5/B6 INCA (Netz)', e.message); }

try {
  // B7 — rzc: jüngstes STAC-Asset → derive → PNG + validAt/Ecken gleich zum Parser.
  const now = new Date();
  const day = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`;
  const item = JSON.parse(new TextDecoder().decode(await fetchBuf(`https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`)));
  // Wie der Client (A28): MeteoSwiss listet ein Asset, bevor es abrufbar ist — das
  // jüngste kann 403 liefern. Also das jüngste ABRUFBARE nehmen, sonst prüfte diese
  // Zeile nie etwas (sie wurde dauerhaft übersprungen).
  const keys = Object.keys(item.assets ?? {}).filter((k) => k.startsWith('rzc')).sort();
  let h5 = null, lastErr = null;
  for (const k of keys.slice(-4).reverse()) {
    try { h5 = await fetchBuf(item.assets[k].href); break; } catch (e) { lastErr = e; }
  }
  if (!h5) throw lastErr ?? new Error('rzc: kein abrufbares Asset');
  const h5Path = join(WORK, 'rzc.h5');
  writeFileSync(h5Path, h5);
  const stamp = radarImgStamp(Date.now());
  const outDir = runDerive('rzc', h5Path, stamp);
  const ref = parseRzcHdf5(h5.buffer.slice(h5.byteOffset, h5.byteOffset + h5.byteLength));
  const g = grayOf(readFileSync(join(outDir, 'frame.png')));
  add('B7 rzc: frame.png byte-gleich zu parseRzcHdf5', eq(g.data, ref.values));
  const meta = parseRzcImgMeta(JSON.parse(readFileSync(join(outDir, 'meta.json'), 'utf8')));
  add('B8 rzc: meta.json besteht den Prüfer, validAt/Ecken aus der Datei',
    meta !== null && meta.validAtMs === ref.validAtMs && JSON.stringify(meta.corners) === JSON.stringify(ref.corners));
} catch (e) { skip('B7/B8 rzc (Netz)', e.message); }

// ── C: CDN-Stichprobe (nur auf Wunsch, nur gegattete Slots) ───────────────────

if (process.env.RADAR_CHECK_CDN === '1') {
  try {
    const stamp = rvStamp(new Date(gatedSlotMs(RV_IMG_GATE_MS, 300_000)));
    const r = await fetch(`${rvImgDir(stamp)}/meta.json`, { method: 'HEAD' });
    add('C1 CDN: gegatteter RV-Bild-Slot liegt auf jsDelivr', r.ok, `${stamp}: HTTP ${r.status}`);
  } catch (e) { skip('C1 CDN', e.message); }
} else {
  skip('C1 CDN-Stichprobe', 'RADAR_CHECK_CDN=1 setzt sie scharf (fragt nur gegattete Slots an)');
}

console.log(`\nverify:radar-repack — ${passed}/${passed + failed} bestanden${skipped ? `, ${skipped} übersprungen (⊘)` : ''}`);
if (failed) process.exit(1);
