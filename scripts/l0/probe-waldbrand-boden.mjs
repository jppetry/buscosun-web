/**
 * L0-Sonde für Phase WT1 — **Bodentrockenheit aus ICON-D2 `smi`**.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/l0/probe-waldbrand-boden.mjs
 *
 * Beantwortet vor dem ersten Produktcode die Fragen, deren falsche Antwort
 * teuer wäre — und zwar am **echten Byte**, nicht aus der Dokumentation:
 *
 *   1. Liest unser handgeschriebener GRIB2-Decoder die Boden-Dateien überhaupt?
 *      (`smi` liegt im `soil-level`-Baum, nicht im `single-level` — anderes
 *      Dateimuster, möglicherweise anderes Packing.)
 *   2. Welche Bodenschichten gibt es wirklich, und decken sich Dateiname und
 *      GRIB-Metadaten?
 *   3. Welchen Wertebereich hat `smi` gemessen — ist es wirklich 0..1, oder
 *      kommen Füllwerte/Sentinels vor, die als „knochentrocken" durchgingen?
 *      (Die Lehre aus F1/F4: `-999,9`-Füllwerte und `freshsnw` als 0..1-Faktor
 *      statt cm — beides fiel erst am Feld auf.)
 *   4. Wie verhalten sich Wasser-/Meerpunkte? Ein See mit `smi = 0` wäre auf
 *      der Karte die trockenste Fläche Deutschlands.
 *   5. Deckt sich das Gitter mit dem der übrigen ICON-D2-Layer (Ecken/Größe)?
 *
 * Schreibt den Befund nach `audit/l0/waldbrand-boden-smi.json`.
 * Kein Produktcode, keine Änderung an bestehenden Modulen.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGrib2, gribCorners } from '../../src/sources/gribDecode.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'audit', 'l0', 'waldbrand-boden-smi.json');
const BASE = 'https://opendata.dwd.de/weather/nwp/icon-d2/grib';

/** Die acht Bodenebenen, die das Verzeichnis führt (Zahl = Tiefe in mm). */
const LEVELS = [0, 1, 3, 9, 27, 81, 243, 729];

const pad3 = (n) => String(n).padStart(3, '0');

function soilFileName(runStr, param, step, level) {
  return `icon-d2_germany_regular-lat-lon_soil-level_${runStr}_${pad3(step)}_${level}_${param}.grib2.bz2`;
}

/** Jüngsten Lauf finden: HH rückwärts, bis das Verzeichnis Dateien führt. */
async function resolveRun(param) {
  const now = new Date();
  for (let back = 0; back <= 8; back++) {
    const d = new Date(now.getTime() - back * 3 * 3600_000);
    const hh = String(Math.floor(d.getUTCHours() / 3) * 3).padStart(2, '0');
    const url = `${BASE}/${hh}/${param}/`;
    const res = await fetch(url).catch(() => null);
    if (!res || !res.ok) continue;
    const html = await res.text();
    const m = [...html.matchAll(
      new RegExp(`icon-d2_germany_regular-lat-lon_soil-level_(\\d{10})_(\\d{3})_(\\d+)_${param}\\.grib2\\.bz2`, 'g'),
    )];
    if (m.length === 0) continue;
    const runStr = m[0][1];
    const steps = [...new Set(m.map((x) => parseInt(x[2], 10)))].sort((a, b) => a - b);
    const levels = [...new Set(m.map((x) => parseInt(x[3], 10)))].sort((a, b) => a - b);
    return { hh, runStr, steps, levels, files: m.length };
  }
  return null;
}

/** bz2 entpacken — dasselbe Paket, das die App im Browser benutzt. */
async function bunzip(buf) {
  const { default: bz2 } = await import('bz2');
  return bz2.decompress(new Uint8Array(buf));
}

async function loadField(hh, runStr, param, step, level) {
  const url = `${BASE}/${hh}/${param}/${soilFileName(runStr, param, step, level)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const raw = await bunzip(await res.arrayBuffer());
  return { field: decodeGrib2(raw), bytes: raw.length, url };
}

/** Kennzahlen eines Feldes — inklusive der Dinge, die man erst vermisst,
 *  wenn die Karte falsch aussieht. */
function stats(values) {
  let min = Infinity, max = -Infinity, sum = 0, finite = 0, nan = 0;
  const below0 = [], above1 = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) { nan++; continue; }
    finite++;
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v < -0.001 && below0.length < 5) below0.push(v);
    if (v > 1.001 && above1.length < 5) above1.push(v);
  }
  // Histogramm über [0,1] in 10 Klassen + zwei Ausreißerkörbe.
  const hist = new Array(10).fill(0);
  let outLow = 0, outHigh = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (!Number.isFinite(v)) continue;
    if (v < 0) { outLow++; continue; }
    if (v > 1) { outHigh++; continue; }
    hist[Math.min(9, Math.floor(v * 10))]++;
  }
  return {
    n: values.length, finite, nan,
    min: finite ? +min.toFixed(4) : null,
    max: finite ? +max.toFixed(4) : null,
    mean: finite ? +(sum / finite).toFixed(4) : null,
    beispieleUnter0: below0, beispieleUeber1: above1,
    unter0: outLow, ueber1: outHigh,
    histogramm_0_1: hist,
  };
}

const report = { erzeugt: new Date().toISOString(), quelle: BASE, befunde: {} };
const log = (...a) => console.log(...a);

log('— Lauf auflösen —');
const run = await resolveRun('smi');
if (!run) {
  console.error('FEHLER: kein smi-Lauf gefunden. Sonde bricht ab, ohne etwas zu behaupten.');
  process.exit(1);
}
report.befunde.lauf = run;
log(`Lauf ${run.runStr} (${run.hh}z) · ${run.files} Dateien · Schritte ${run.steps[0]}…${run.steps.at(-1)} (${run.steps.length}) · Ebenen ${run.levels.join(', ')}`);

log('\n— Frage 1+2: liest unser Decoder die Boden-Dateien, und was steht drin? —');
const perLevel = {};
for (const lvl of LEVELS) {
  if (!run.levels.includes(lvl)) { perLevel[lvl] = { vorhanden: false }; continue; }
  try {
    const { field, bytes, url } = await loadField(run.hh, run.runStr, 'smi', run.steps[0], lvl);
    const c = gribCorners(field);
    perLevel[lvl] = {
      vorhanden: true, dekodiert: true, bytesEntpackt: bytes,
      ni: field.ni, nj: field.nj,
      eckeNW: c[0].map((x) => +x.toFixed(4)), eckeSE: c[2].map((x) => +x.toFixed(4)),
      werte: stats(field.values),
      datei: url.split('/').pop(),
    };
    const s = perLevel[lvl].werte;
    log(`  Ebene ${String(lvl).padStart(3)} mm  ${field.ni}×${field.nj}  `
      + `min ${s.min}  max ${s.max}  mittel ${s.mean}  NaN ${s.nan}  <0: ${s.unter0}  >1: ${s.ueber1}`);
  } catch (e) {
    perLevel[lvl] = { vorhanden: true, dekodiert: false, fehler: String(e.message ?? e) };
    log(`  Ebene ${String(lvl).padStart(3)} mm  DECODE-FEHLER: ${e.message ?? e}`);
  }
}
report.befunde.ebenen = perLevel;

log('\n— Frage 3+4: Zeitverhalten und Wasserpunkte (Ebene 9 mm gegen 729 mm) —');
try {
  const spaet = run.steps.filter((s) => s <= 24).at(-1) ?? run.steps.at(-1);
  const a = await loadField(run.hh, run.runStr, 'smi', run.steps[0], 9);
  const b = await loadField(run.hh, run.runStr, 'smi', spaet, 9);
  let geaendert = 0, gleich = 0;
  for (let i = 0; i < a.field.values.length; i++) {
    if (!Number.isFinite(a.field.values[i]) || !Number.isFinite(b.field.values[i])) continue;
    if (Math.abs(a.field.values[i] - b.field.values[i]) > 1e-4) geaendert++; else gleich++;
  }
  report.befunde.zeitverhalten = {
    schrittA: run.steps[0], schrittB: spaet,
    geaenderteZellen: geaendert, unveraenderteZellen: gleich,
    anteilGeaendert: +(geaendert / (geaendert + gleich)).toFixed(4),
  };
  log(`  Ebene 9 mm: ${geaendert} von ${geaendert + gleich} Zellen ändern sich zwischen +${run.steps[0]} h und +${spaet} h `
    + `(${(100 * geaendert / (geaendert + gleich)).toFixed(1)} %)`);
} catch (e) {
  report.befunde.zeitverhalten = { fehler: String(e.message ?? e) };
  log(`  FEHLER: ${e.message ?? e}`);
}

log('\n— Frage 5: Gittervergleich gegen einen bestehenden Layer (relhum_2m) —');
try {
  const url = `${BASE}/${run.hh}/relhum_2m/`
    + `icon-d2_germany_regular-lat-lon_single-level_${run.runStr}_${pad3(run.steps[0])}_2d_relhum_2m.grib2.bz2`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  const f = decodeGrib2(await bunzip(await res.arrayBuffer()));
  const c = gribCorners(f);
  const soil = perLevel[9] ?? perLevel[1];
  report.befunde.gittervergleich = {
    relhum: { ni: f.ni, nj: f.nj, eckeNW: c[0].map((x) => +x.toFixed(4)) },
    smi: soil?.dekodiert ? { ni: soil.ni, nj: soil.nj, eckeNW: soil.eckeNW } : null,
    identisch: !!soil?.dekodiert && soil.ni === f.ni && soil.nj === f.nj,
  };
  log(`  relhum_2m ${f.ni}×${f.nj}  ·  smi ${soil?.ni}×${soil?.nj}  ⇒ `
    + (report.befunde.gittervergleich.identisch ? 'IDENTISCH' : 'ABWEICHEND'));
} catch (e) {
  report.befunde.gittervergleich = { fehler: String(e.message ?? e) };
  log(`  FEHLER: ${e.message ?? e}`);
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(report, null, 2));
log(`\nBefund geschrieben: ${OUT}`);
