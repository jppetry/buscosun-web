/**
 * repack-icon-d2.mjs — Producer der Repack-Linie (Phasen BW-1 und BW-6b,
 * `audit/bandbreite.md`).
 *
 * Nimmt die ICON-D2-GRIB2-Dateien, die heute JEDER Browser einzeln holt und
 * dekodiert, und schreibt sie EINMAL als PNG — genau in der Form, in die der
 * Client sie ohnehin überführt, bevor er sie zeichnet.
 *
 * ── Der Kern in einem Satz ─────────────────────────────────────────────────
 * Die App reduziert die Daten heute schon: `buildWindRgba`/`buildTempRgba`/
 * `scalarFrameBuild.ts` tasten das native 1215×746-Float-Gitter auf 608×373 ×
 * 8 bit herunter, BEVOR irgendetwas gezeichnet wird. Wir verschieben diesen
 * Schritt nach vorn — vom Browser jedes Besuchers in einen Lauf.
 *
 * ── Warum das nichts kostet ────────────────────────────────────────────────
 * Der Producer importiert **dieselben Module** wie der Client
 * (`src/wind/windFrameBuild.ts`, `src/sources/tempFrameBuild.ts`,
 * `src/sources/scalarFrameBuild.ts`, `src/sources/gribGridDecode.ts`) — keine
 * nachgebaute Mathematik. PNG ist verlustfrei. `verify:repack` beweist je Lauf
 * am Byte, dass `PNG → decode` identisch zu `GRIB → Client-Pfad` ist; der
 * Browser-Rundlauf ist in `audit/bandbreite.md` §19.1 gemessen (0 abweichende
 * Bytes in Chrome).
 *
 * ── Familien (BW-6b: EINE Liste, `scripts/lib/repackManifest.mjs` FAMILIES) ──
 *   wind-<SSS>.png       RGB   R = norm. u, G = norm. v, B = 0 (A ist immer 255 →
 *                              gespart). Die vier Normierungswerte stehen JE SCHRITT
 *                              im Manifest — ohne sie ist das Bild bedeutungslos.
 *   temp-<SSS>.png       G+A   Grau = norm. °C, Alpha = Maske. Alpha trägt hier
 *                              Information (außerhalb der Domäne 0).
 *   hsurf-v1.png         Grau  norm. Orographie — der Grün-Kanal des Temp-Bilds.
 *                              EINE Datei an der Wurzel: zeit- UND lauf-invariant.
 *   gust/thunder/rotation/lpi/snowdepth/snowfresh-<SSS>.png
 *                        G+A   Grau = norm. Wert (feste Skala je Familie, s.
 *                              `scalarFrameBuild.ts`), Alpha = Maske. Bei Gewitter,
 *                              Rotation und Neuschnee werden DREI Felder zu EINEM
 *                              Bild — der Score wird hier gerechnet, nicht im Browser.
 *                              Ein Schritt wird NUR mit allen Feldern gepackt; fehlt
 *                              eines, steht der Schritt in `missing` und der Client
 *                              nimmt für ihn GRIB (§25.4 (2)).
 *   precip-<SSS>.png     Grau  VOLLE Auflösung (1215×746), Stundenrate mm/h ÷ 20 —
 *                              exakt `decodeGridStep(…, accumulate)`. Kein Alpha: 0
 *                              ist dort „transparent". Jeder Schritt nennt den
 *                              Schritt, gegen den er deakkumuliert wurde (`ref`) —
 *                              der Client prüft, dass das SEINE Referenz wäre
 *                              (§25.4 (3)).
 *
 * ── Netz ───────────────────────────────────────────────────────────────────
 * Geholt wird DIREKT von opendata.dwd.de (Node kennt kein CORS) — kein Byte
 * durch Netlify. Rohdateien landen in `.cache/repack/` (gitignored), damit
 * Wiederholungen und `verify:repack` offline laufen und das DWD nicht unnötig
 * belastet wird.
 *
 * ENV:
 *   REPACK_OUT     Ausgabeverzeichnis. Default `data/repack`.
 *   REPACK_RUN     Fester Lauf (YYYYMMDDHH) statt Discovery.
 *   REPACK_STEPS   Komma-Liste statt aller Schritte (z. B. `0,1,2`).
 *   REPACK_ONLY    Komma-Liste von Familien (z. B. `wind,temp`).
 *   REPACK_SKIP_IF_RUN  Lauf, der bereits abgelegt ist (BW-2: der Batch tickt
 *                  öfter als das DWD publiziert).
 *   REPACK_HAVE_STEPS  JSON `{ "wind": 13, "temp": 25, … }` — wie viele Schritte
 *                  je Familie davon abliegen. Nur wenn das für JEDE Familie
 *                  reicht, wird ausgestiegen (s. `skipDecision`).
 *                  (`REPACK_HAVE_WIND`/`REPACK_HAVE_TEMP` werden weiter gelesen.)
 *   DWD_BASE       Default https://opendata.dwd.de/weather/nwp/icon-d2/grib
 *
 * Ausgabe-Layout (spiegelt das Daten-Repo):
 *   <REPACK_OUT>/hsurf-v1.png          lauf-unabhängig
 *   <REPACK_OUT>/runs/<lauf>/*.png     je Lauf
 *   <REPACK_OUT>/runs/<lauf>/repack.json
 *   <REPACK_OUT>/state.json            was dieser Lauf getan hat
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/repack-icon-d2.mjs
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import bz2mod from 'bz2';
import { decodeGrib2, subsampledCorners, gribCorners } from '../src/sources/gribDecode.ts';
import { buildWindRgba } from '../src/wind/windFrameBuild.ts';
import { buildTempRgba, buildHsurfGrey, TEMP_VMIN, TEMP_VMAX, TEMP_DEM_MAX } from '../src/sources/tempFrameBuild.ts';
import {
  buildGustRgba, buildLpiRgba, buildSnowDepthRgba, buildSnowFreshRgba, buildThunderRgba, buildRotationRgba,
  GUST_VMIN, GUST_VMAX, LPI_VMIN, LPI_VMAX, SNOW_DEPTH_VMAX_CM, SNOW_FRESH_VMAX_CM,
  THUNDER_VMIN, THUNDER_VMAX, ROTATION_VMIN, ROTATION_VMAX,
} from '../src/sources/scalarFrameBuild.ts';
import { decodeGridStep } from '../src/sources/gribGridDecode.ts';
import { PRECIP_VMAX, CAPE_MAX } from '../src/scalar/RainLayer.ts';
import { encodePng } from './lib/png.mjs';
import { RUNS_DIR, HSURF_FILE, FAMILIES, FAMILY_KEYS } from './lib/repackManifest.mjs';

const bz2 = bz2mod.decompress ? bz2mod : (bz2mod.default ?? bz2mod);

const DWD_BASE = (process.env.DWD_BASE || 'https://opendata.dwd.de/weather/nwp/icon-d2/grib').replace(/\/+$/, '');
const OUT_DIR = resolve(process.env.REPACK_OUT || 'data/repack');
const CACHE_DIR = resolve('.cache/repack');
const ONLY = process.env.REPACK_ONLY ? process.env.REPACK_ONLY.split(',').map((s) => s.trim()).filter(Boolean) : null;

/** MUSS identisch zum Client sein (`iconD2WindSource.ts:41`, `iconD2TempSource.ts:34`
 *  und alle `iconD2*Source.ts`) UND zu `scripts/verify-layer-geometry.mjs:29-31`,
 *  das den Wert hart kodiert. Eine andere Abtastung verschiebt jeden Wert auf der Karte. */
export const TARGET_WIDTH = 700;
/** Horizont-Caps wie im Client — aus der Familienliste, nicht ein zweites Mal hier. */
const MAX_STEP = Object.fromEntries(FAMILY_KEYS.map((f) => [f, FAMILIES[f].maxStep]));

const pad2 = (n) => String(n).padStart(2, '0');
const pad3 = (n) => String(n).padStart(3, '0');
const log = (...a) => console.log('[repack]', ...a);

// ---------------------------------------------------------------------------
// DWD-Zugriff mit Plattencache
// ---------------------------------------------------------------------------
function stepUrl(run, param, step) {
  const hh = run.slice(8, 10);
  return `${DWD_BASE}/${hh}/${param}/icon-d2_germany_regular-lat-lon_single-level_${run}_${pad3(step)}_2d_${param}.grib2.bz2`;
}
function invariantUrl(run, param) {
  const hh = run.slice(8, 10);
  return `${DWD_BASE}/${hh}/${param}/icon-d2_germany_regular-lat-lon_time-invariant_${run}_000_0_${param}.grib2.bz2`;
}

/**
 * Holt eine Datei (Cache zuerst) und gibt die ROHEN bz2-Bytes zurück.
 *
 * Mit Wiederholung: opendata.dwd.de bricht Verbindungen sporadisch ab
 * (`ECONNRESET` / `TypeError: terminated`) — bei einem Lauf über 51 Dateien am
 * 2026-08-23 reproduziert, mitten in der Wind-Schleife. Genau diese Ursache hat
 * T2c bei den Warm-Crons gefixt; ohne Wiederholung reißt eine einzelne zufällig
 * abgerissene Verbindung den ganzen Lauf ab.
 *
 * 4 statt 3 Versuche (Wartezeiten 0,5 / 1,5 / 4,5 s) seit dem 2026-08-23: mit
 * dreien fielen im selben Lauf ZWEIMAL dieselben Schritte (Wind 4 und 5) aus,
 * obwohl die Dateien gelistet waren, HTTP 200 lieferten und über denselben Pfad
 * sauber dekodierten — die Leitung brauchte 3,5–6,3 s je Datei. Ein Fehlschlag
 * kostet hier nicht den Lauf, sondern legt ihn UNVOLLSTÄNDIG ab (s. `skipDecision`).
 */
async function fetchRaw(url, tries = 4) {
  const name = url.slice(url.lastIndexOf('/') + 1);
  const cached = join(CACHE_DIR, name);
  if (existsSync(cached)) return readFileSync(cached);
  let last;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(CACHE_DIR, { recursive: true });
      writeFileSync(cached, buf);
      return buf;
    } catch (e) {
      last = e;
      // 4xx heißt „gibt es nicht" — Wiederholen hilft nie, Warten kostet nur.
      if (/HTTP 4\d\d/.test(e.message)) break;
      if (attempt < tries) await new Promise((r) => setTimeout(r, 500 * 3 ** (attempt - 1)));
    }
  }
  throw new Error(`${last?.message || last} — ${url}`);
}

/** bz2 → entpackte GRIB2-Bytes (das, was `decodeGridStep` im Browser bekommt). */
export async function fetchGrib(url) {
  return bz2.decompress(new Uint8Array(await fetchRaw(url)));
}

/** bz2 → GRIB2 → decodiertes Feld, über denselben Decoder wie der Browser. */
export async function fetchField(url) {
  return decodeGrib2(await fetchGrib(url));
}

export const urls = { step: stepUrl, invariant: invariantUrl };

// ---------------------------------------------------------------------------
// Lauf-Discovery (dieselbe Listing-Logik wie die Manifest-Publisher)
// ---------------------------------------------------------------------------
/**
 * Verzeichnis-Listing mit Wiederholung — dieselbe Leitung wie `fetchRaw`: beim
 * ersten BW-6b-Lauf brachen 15 gleichzeitige Listings mit `UND_ERR_CONNECT_TIMEOUT`
 * ab, obwohl jedes einzelne binnen einer Sekunde durchgeht. Deshalb außerdem
 * gedeckelte Parallelität in `familySteps`.
 */
async function listSteps(run, param, tries = 3) {
  const hh = run.slice(8, 10);
  let res = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try { res = await fetch(`${DWD_BASE}/${hh}/${param}/`); break; } catch (e) {
      if (attempt === tries) throw e;
      await new Promise((r) => setTimeout(r, 500 * 3 ** (attempt - 1)));
    }
  }
  if (!res?.ok) return [];
  const html = await res.text();
  const re = new RegExp(`icon-d2_germany_regular-lat-lon_single-level_${run}_(\\d{3})_2d_${param}\\.grib2\\.bz2`, 'g');
  const steps = new Set();
  let m;
  while ((m = re.exec(html)) !== null) steps.add(parseInt(m[1], 10));
  return [...steps].sort((a, b) => a - b);
}

const runStrOf = (d) =>
  `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}`;
const parseRunStr = (r) =>
  new Date(Date.UTC(+r.slice(0, 4), +r.slice(4, 6) - 1, +r.slice(6, 8), +r.slice(8, 10)));

/**
 * Schritte je Familie eines Laufs: der Schnitt über ALLE Felder der Familie im
 * Horizont `minStep…maxStep`. Ein Schritt, den ein Nebenfeld nicht hat, wird
 * hier gar nicht erst angefragt (§25.4 (2)).
 */
export async function familySteps(run, families = FAMILY_KEYS) {
  const params = [...new Set(families.flatMap((f) => FAMILIES[f].params))];
  const listed = new Map();
  let ptr = 0;
  await Promise.all(Array.from({ length: Math.min(4, params.length) }, async () => {
    while (ptr < params.length) { const p = params[ptr++]; listed.set(p, await listSteps(run, p)); }
  }));
  const out = {};
  for (const f of families) {
    const fam = FAMILIES[f];
    const lists = fam.params.map((p) => listed.get(p) ?? []);
    out[f] = lists[0]
      .filter((s) => s >= fam.minStep && s <= fam.maxStep)
      .filter((s) => lists.every((l) => l.includes(s)));
  }
  return out;
}

/** Neuester Lauf, der u_10m, v_10m UND t_2m mindestens bis Schritt 2 führt. */
export async function findLatestRun(families = FAMILY_KEYS) {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const run = runStrOf(new Date(now.getTime() - back * 3 * 3600_000));
    const steps = await familySteps(run, [...new Set(['wind', 'temp', ...families])]);
    const near = [0, 1, 2];
    if (near.every((s) => steps.wind.includes(s) && steps.temp.includes(s))) {
      return { run, runAt: parseRunStr(run), steps, wind: steps.wind, temp: steps.temp };
    }
    log(`Lauf ${run} noch unvollständig (wind:${steps.wind.length} temp:${steps.temp.length}) — weiter zurück`);
  }
  throw new Error('kein vollständiger ICON-D2-Lauf gefunden');
}

// ---------------------------------------------------------------------------
// Die Repack-Schritte — alle über die GETEILTEN Client-Module
// ---------------------------------------------------------------------------

/** Wind: u+v → RGB-PNG + die vier Normierungswerte. */
export async function repackWindStep(run, step) {
  const [u, v] = await Promise.all([
    fetchField(stepUrl(run, 'u_10m', step)),
    fetchField(stepUrl(run, 'v_10m', step)),
  ]);
  const b = buildWindRgba(u, v, TARGET_WIDTH);
  // Alpha ist überall 255, Blau überall 0 → RGB reicht und spart ein Viertel.
  // Der Decoder ergänzt A = 255, das Ergebnis ist wieder exakt `b.rgba`.
  const rgb = new Uint8Array(b.width * b.height * 3);
  for (let p = 0, s = 0, d = 0; p < b.width * b.height; p++, s += 4, d += 3) {
    rgb[d] = b.rgba[s]; rgb[d + 1] = b.rgba[s + 1]; rgb[d + 2] = b.rgba[s + 2];
  }
  return {
    png: encodePng(b.width, b.height, rgb, 3),
    rgba: b.rgba,
    width: b.width, height: b.height,
    norm: { uMin: b.uMin, uMax: b.uMax, vMin: b.vMin, vMax: b.vMax },
    field: u,
  };
}

/** R + A eines RGBA-Bilds → Grau+Alpha-Bytes (Kanalabstand 2). */
function greyAlphaOf(rgba, n) {
  const ga = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) { ga[i * 2] = rgba[i * 4]; ga[i * 2 + 1] = rgba[i * 4 + 3]; }
  return ga;
}

/**
 * Temperatur: t_2m → Grau+Alpha-PNG (Grau = norm. °C, Alpha = Maske).
 * `hsurf` geht NICHT mit ins Bild — es steht einmal je Lauf in `hsurf.png`.
 * `rgba` ist trotzdem das VOLLE Client-Bild (inkl. Grün), damit der Verifier
 * gegen genau das prüfen kann, was der Client am Ende halten muss.
 */
export async function repackTempStep(run, step, hsurf) {
  const t2m = await fetchField(stepUrl(run, 't_2m', step));
  const ss = Math.max(1, Math.ceil(t2m.ni / TARGET_WIDTH));
  const b = buildTempRgba(t2m, hsurf, ss);
  return {
    png: encodePng(b.width, b.height, greyAlphaOf(b.rgba, b.width * b.height), 2),
    rgba: b.rgba,
    width: b.width, height: b.height,
    field: t2m,
  };
}

/** Orographie: hsurf → Graustufen-PNG. Einmal je Lauf. */
export function repackHsurf(hsurf) {
  const ss = Math.max(1, Math.ceil(hsurf.ni / TARGET_WIDTH));
  const g = buildHsurfGrey(hsurf, ss);
  return { png: encodePng(g.width, g.height, g.grey, 1), grey: g.grey, width: g.width, height: g.height };
}

/**
 * Setzt die zwei Dateien wieder zum Client-Bild zusammen — DIE Referenz für
 * das, was `iconD2TempSource` in BW-3 tut, und für `verify:repack`.
 * Die Maske gewinnt: wo Alpha 0 ist, ist der ganze Pixel 0 (wie `buildTempRgba`).
 */
export function composeTempRgba(tempGA, hsurfGrey, width, height) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const a = tempGA[i * 2 + 1];
    if (!a) continue;
    rgba[i * 4] = tempGA[i * 2];
    rgba[i * 4 + 1] = hsurfGrey ? hsurfGrey[i] : 0;
    rgba[i * 4 + 3] = a;
  }
  return rgba;
}

/**
 * Die Ein-Kanal-Familien (BW-6b): Felder in der Reihenfolge von `FAMILIES[f].params`
 * → der geteilte Builder → Grau+Alpha. Die Skala je Familie steht informativ im
 * Manifest (`vMin`/`vMax`); der Client prüft sie gegen SEINE Konstanten —
 * weichen sie ab, driften Producer und Client, und der Abschnitt wird abgelehnt.
 */
export const SCALAR_BUILDERS = {
  gust:        { build: ([g], ss) => buildGustRgba(g, ss),                     vMin: GUST_VMIN,     vMax: GUST_VMAX },
  thunder:     { build: ([c, ci, l], ss) => buildThunderRgba(c, ci, l, ss),    vMin: THUNDER_VMIN,  vMax: THUNDER_VMAX },
  rotation:    { build: ([u, lo, sd], ss) => buildRotationRgba(u, lo, sd, ss), vMin: ROTATION_VMIN, vMax: ROTATION_VMAX },
  lightningfc: { build: ([l], ss) => buildLpiRgba(l, ss),                      vMin: LPI_VMIN,      vMax: LPI_VMAX },
  snowDepth:   { build: ([h], ss) => buildSnowDepthRgba(h, ss),                vMin: 0,             vMax: SNOW_DEPTH_VMAX_CM },
  snowFresh:   { build: ([g, c, r], ss) => buildSnowFreshRgba(g, c, r, ss),    vMin: 0,             vMax: SNOW_FRESH_VMAX_CM },
};

/** Ein-Kanal-Familie: ALLE Felder des Schritts (sonst wirft es → `missing`). */
export async function repackScalarStep(family, run, step) {
  const fam = FAMILIES[family];
  const fields = await Promise.all(fam.params.map((p) => fetchField(stepUrl(run, p, step))));
  const ref = fields[0];
  const ss = Math.max(1, Math.ceil(ref.ni / TARGET_WIDTH));
  const b = SCALAR_BUILDERS[family].build(fields, ss);
  return {
    png: encodePng(b.width, b.height, greyAlphaOf(b.rgba, b.width * b.height), 2),
    rgba: b.rgba,
    width: b.width, height: b.height,
    field: ref,
  };
}

/**
 * Niederschlag: EXAKT `decodeGridStep(bytes, prevRaw, true, 'precip')` — volle
 * Auflösung, Stundenrate gegen den vorherigen Schritt, `precipToU8`. Das PNG ist
 * das `values`-Array des Clients, 1 Kanal. `prev` ist `{ step, rawValues }` des
 * zuletzt gepackten Schritts oder `null` (dann Differenz gegen 0, wie im Client
 * beim ersten Schritt seines Fensters — der Client baut aus diesem Schritt KEIN
 * Frame, s. `iconD2Precip.ts`; deshalb wird `ref` genannt und dort geprüft).
 */
export async function repackPrecipStep(run, step, prev) {
  return repackGridStep('precip', run, step, prev);
}

/**
 * Voll aufgelöste Familien (`fullRes`): EXAKT `decodeGridStep(bytes, prev, accumulate, kind)`
 * — `precip` sequenziell mit `ref`, `cape` (BW-7a) instantan mit `capeToU8`.
 */
export async function repackGridStep(family, run, step, prev) {
  const fam = FAMILIES[family];
  const bytes = await fetchGrib(stepUrl(run, fam.params[0], step));
  const seq = !!fam.sequential;
  const d = decodeGridStep(bytes, seq ? (prev?.rawValues ?? null) : null, seq, fam.kind);
  return {
    png: encodePng(d.width, d.height, d.values, 1),
    values: d.values,
    width: d.width, height: d.height,
    rawValues: d.rawValues,
    corners: d.corners,
    ref: seq ? (prev ? prev.step : null) : undefined,
    field: () => decodeGrib2(bytes),
  };
}

/**
 * Gitter der Niederschlag-Familie: volle Auflösung, Ecken aus DERSELBEN Funktion
 * wie der GRIB-Pfad (`decodeGridStep` → `gribCorners`), nicht aus
 * `subsampledCorners(f, 1)`. Rechnerisch dasselbe, aber um Gleitkomma-Rauschen
 * verschieden (−3.9499999999999975 vs −3.95) — und der Client soll aus dem
 * Abschnitt BIT-gleiche Ecken bekommen. Exportiert, damit `verify:repack` es je
 * Lauf prüft.
 */
export function precipGridOf(field) {
  const c = gribCorners(field);
  return { ni: field.ni, nj: field.nj, ss: 1, width: field.ni, height: field.nj, corners: { nw: c[0], ne: c[1], se: c[2], sw: c[3] } };
}

// ---------------------------------------------------------------------------
// Lauf
// ---------------------------------------------------------------------------
/**
 * Rechnen oder nicht? — BW-2. Der Batch im Daten-Repo tickt stündlich, das DWD
 * publiziert alle ~3 h. Ohne Ausstieg würde jeder Tick denselben Lauf neu
 * rechnen und einen inhaltsgleichen Force-Push auslösen.
 *
 * Der Ausstieg fragt aber NICHT nur „liegt der Lauf schon?", sondern „liegt er
 * VOLLSTÄNDIG?" — und das ist der Unterschied, den erst der Betrieb gezeigt hat:
 * am 2026-08-23 lief der Producer, während das DWD den 21-UTC-Lauf noch
 * hochschob, und legte 11 statt 13 Windschritten ab (fehlend: 4 und 5 — mitten
 * im Nahbereich, den JEDER Client lädt). Ein Ausstieg nur auf die Lauf-Kennung
 * hätte diese Lücke für die vollen drei Stunden festgeschrieben; die beiden
 * Schritte kämen still aus GRIB, und genau das soll die Phase ja abstellen.
 *
 * BW-6b: generisch über Familien — `have`/`want` sind `{ familie: schrittzahl }`.
 * Rein gehalten, damit `verify:repack` die Entscheidung ohne Netz durchspielen
 * kann. Fehlende oder `-1`-Einträge heißen „unbekannt" und zählen nie als
 * vollständig.
 */
export function skipDecision({ run, haveRun, have = {}, want = {} }) {
  if (!haveRun || haveRun !== run) return { skip: false, reason: `Lauf ${run} ist neu → rechnen.` };
  const fams = Object.keys(want);
  const short = fams.filter((f) => !((have[f] ?? -1) >= want[f]));
  const fmt = (f) => `${f} ${have[f] ?? '?'}/${want[f]}`;
  if (short.length === 0) {
    return { skip: true, reason: `Lauf ${run} liegt vollständig (${fams.map((f) => `${f} ${have[f]}`).join(', ')}) → nichts zu tun.` };
  }
  return { skip: false, reason: `Lauf ${run} liegt schon, aber unvollständig (${short.map(fmt).join(', ')}) → nachrechnen.` };
}

/** Bestand aus der Umgebung: JSON `REPACK_HAVE_STEPS` (BW-6b) plus die zwei Alt-Variablen. */
function haveFromEnv(env = process.env) {
  let have = {};
  if (env.REPACK_HAVE_STEPS) {
    try { have = JSON.parse(env.REPACK_HAVE_STEPS) ?? {}; } catch { have = {}; }
  }
  if (env.REPACK_HAVE_WIND != null && have.wind == null) have.wind = Number(env.REPACK_HAVE_WIND);
  if (env.REPACK_HAVE_TEMP != null && have.temp == null) have.temp = Number(env.REPACK_HAVE_TEMP);
  return have;
}

async function main() {
  const t0 = Date.now();
  const families = ONLY ? FAMILY_KEYS.filter((f) => ONLY.includes(f)) : [...FAMILY_KEYS];
  let run, runAt, stepsBy;
  if (process.env.REPACK_RUN) {
    run = process.env.REPACK_RUN;
    runAt = parseRunStr(run);
    stepsBy = await familySteps(run, families);
  } else {
    ({ run, runAt, steps: stepsBy } = await findLatestRun(families));
  }
  if (process.env.REPACK_STEPS) {
    const only = process.env.REPACK_STEPS.split(',').map(Number);
    for (const f of families) stepsBy[f] = (stepsBy[f] ?? []).filter((s) => only.includes(s));
  }
  for (const f of FAMILY_KEYS) if (!families.includes(f)) stepsBy[f] = [];

  // BW-2: Der Batch im Daten-Repo tickt häufiger als das DWD publiziert (~3 h).
  // Ohne diesen Ausstieg würde jeder Tick denselben Lauf neu rechnen und einen
  // inhaltsgleichen Force-Push auslösen. `state.json` sagt dem Workflow, ob es
  // etwas zu tun gab — der Producer entscheidet das, nicht der YAML-Text.
  mkdirSync(OUT_DIR, { recursive: true });
  const stateFile = join(OUT_DIR, 'state.json');
  const decision = skipDecision({
    run,
    haveRun: process.env.REPACK_SKIP_IF_RUN || '',
    have: haveFromEnv(),
    want: Object.fromEntries(families.map((f) => [f, stepsBy[f].length])),
  });
  writeFileSync(stateFile, JSON.stringify(
    { run, skipped: decision.skip, reason: decision.reason, at: new Date().toISOString() }, null, 2) + '\n');
  log(decision.reason);
  if (decision.skip) return;

  log(`Lauf ${run} — ${families.map((f) => `${f} [${stepsBy[f].join(',')}]`).join(' · ')}`);

  // Layout SPIEGELT das Daten-Repo (BW-2): `runs/<lauf>/…` + `hsurf-v1.png` an
  // der Wurzel. Der Publisher kopiert dann 1:1 statt umzusortieren — eine
  // Umsortierung wäre die Stelle, an der Pfade im Manifest und Pfade auf dem
  // CDN auseinanderlaufen könnten.
  const dir = join(OUT_DIR, RUNS_DIR, run);
  mkdirSync(dir, { recursive: true });

  const manifest = {
    schema: 1,
    run,
    runAt: runAt.toISOString(),
    targetWidth: TARGET_WIDTH,
    source: DWD_BASE,
    license: 'DWD ICON-D2, CC BY 4.0',
    grid: null,
  };
  const famEntry = (f) => {
    if (manifest[f]) return manifest[f];
    const fam = FAMILIES[f];
    if (f === 'wind') manifest[f] = { channels: 3, steps: [] };
    else if (f === 'temp') manifest[f] = { channels: 2, vMin: TEMP_VMIN, vMax: TEMP_VMAX, demMax: TEMP_DEM_MAX, hsurf: null, steps: [] };
    else if (f === 'precip') manifest[f] = { channels: 1, vMin: 0, vMax: PRECIP_VMAX, grid: null, steps: [] };
    else if (f === 'cape') manifest[f] = { channels: 1, vMin: 0, vMax: CAPE_MAX, grid: null, steps: [] };
    else manifest[f] = { channels: fam.channels, vMin: SCALAR_BUILDERS[f].vMin, vMax: SCALAR_BUILDERS[f].vMax, steps: [] };
    return manifest[f];
  };

  let gribBytes = 0, pngBytes = 0;

  const gridOf = (field, ss) => {
    // Die Ecken der ABGETASTETEN Punkte, nicht des nativen Gitters (KL3) —
    // dieselbe Funktion, die der Client für seine uvBounds benutzt.
    const c = subsampledCorners(field, ss);
    return {
      ni: field.ni, nj: field.nj, ss,
      width: Math.ceil(field.ni / ss), height: Math.ceil(field.nj / ss),
      corners: { nw: c[0], ne: c[1], se: c[2], sw: c[3] },
    };
  };
  const noteGrid = (field) => {
    if (manifest.grid) return;
    manifest.grid = gridOf(field, Math.max(1, Math.ceil(field.ni / TARGET_WIDTH)));
  };
  const rawSize = (url) => {
    const f = join(CACHE_DIR, url.slice(url.lastIndexOf('/') + 1));
    return existsSync(f) ? readFileSync(f).length : 0;
  };

  // Ein einzelner Schritt darf den Lauf nicht töten (der Client fängt fehlende
  // Schritte ohnehin einzeln ab) — aber er wird GENANNT, nicht verschwiegen.
  const missing = {};
  const miss = (f, step, e) => {
    (missing[f] ??= []).push(step);
    log(`  ${f} ${pad3(step)} FEHLT — ${e.message}`);
  };
  const wrote = (f, step, png, params) => {
    const file = `${FAMILIES[f].file}-${pad3(step)}.png`;
    writeFileSync(join(dir, file), png);
    for (const p of params) gribBytes += rawSize(stepUrl(run, p, step));
    pngBytes += png.length;
    log(`  ${f} ${pad3(step)} → ${(png.length / 1024).toFixed(0)} KB`);
    return { step, file, bytes: png.length };
  };

  // ── Wind ─────────────────────────────────────────────────────────────────
  for (const step of stepsBy.wind) {
    try {
      const r = await repackWindStep(run, step);
      noteGrid(r.field);
      famEntry('wind').steps.push({ ...wrote('wind', step, r.png, FAMILIES.wind.params), ...r.norm });
    } catch (e) { miss('wind', step, e); }
  }

  // ── Temperatur (+ hsurf an der Wurzel) ───────────────────────────────────
  if (stepsBy.temp.length) {
    const hsurf = await fetchField(invariantUrl(run, 'hsurf')).catch((e) => {
      log(`  hsurf fehlt (${e.message}) → Grün-Kanal bleibt 0, keine Höhenkorrektur`);
      return null;
    });
    if (hsurf) {
      const r = repackHsurf(hsurf);
      // LAUF-UNABHÄNGIGER Pfad an der Wurzel, nicht im Lauf-Verzeichnis: an drei
      // Läufen gemessen 0 abweichende Zellen (§20.2). Der Client lädt die Datei
      // damit einmal und behält sie über Laufwechsel hinweg im HTTP-Cache.
      const hsurfPath = join(OUT_DIR, HSURF_FILE);
      // Die gemessene Invarianz ist eine BEHAUPTUNG über künftige Läufe. Wenn
      // sie je bricht, soll es auffallen statt still überschrieben zu werden.
      if (existsSync(hsurfPath) && !readFileSync(hsurfPath).equals(r.png)) {
        log(`  ⚠ hsurf WEICHT AB vom bisherigen ${HSURF_FILE} — die Lauf-Invarianz `
          + `(§20.2) gilt nicht mehr; Datei wird ersetzt, Befund gehört ins Audit.`);
      }
      writeFileSync(hsurfPath, r.png);
      pngBytes += r.png.length;
      famEntry('temp').hsurf = { url: HSURF_FILE, scope: 'repo', channels: 1, bytes: r.png.length };
      log(`  hsurf     → ${(r.png.length / 1024).toFixed(0)} KB (lauf-unabhängig, an der Wurzel)`);
    }
    for (const step of stepsBy.temp) {
      try {
        const r = await repackTempStep(run, step, hsurf);
        noteGrid(r.field);
        famEntry('temp').steps.push(wrote('temp', step, r.png, FAMILIES.temp.params));
      } catch (e) { miss('temp', step, e); }
    }
  }

  // ── Ein-Kanal-Familien (BW-6b) ───────────────────────────────────────────
  for (const f of Object.keys(SCALAR_BUILDERS)) {
    for (const step of stepsBy[f] ?? []) {
      try {
        const r = await repackScalarStep(f, run, step);
        noteGrid(r.field);
        famEntry(f).steps.push(wrote(f, step, r.png, FAMILIES[f].params));
      } catch (e) { miss(f, step, e); }
    }
  }

  // ── Voll aufgelöste Familien: Niederschlag sequenziell mit genannter
  //    Referenz (§25.4 (3)), CAPE instantan (BW-7a) ─────────────────────────
  for (const f of FAMILY_KEYS.filter((k) => FAMILIES[k].fullRes)) {
    let prev = null;
    for (const step of stepsBy[f] ?? []) {
      try {
        const r = await repackGridStep(f, run, step, prev);
        const entry = famEntry(f);
        if (!entry.grid) entry.grid = precipGridOf(r.field());
        entry.steps.push({ ...wrote(f, step, r.png, FAMILIES[f].params), ...(FAMILIES[f].sequential ? { ref: r.ref } : {}) });
        prev = { step, rawValues: r.rawValues };
      } catch (e) {
        // Sequenziell: der nächste Schritt würde gegen den FALSCHEN Vorschritt
        // differenzieren (2-h-Summe als 1-h-Rate). Genau das täte der Client
        // auch, wenn ihm ein Schritt fehlt — er nennt es aber nicht. Wir nennen
        // es: `ref` zeigt dann auf den letzten gepackten Schritt, der Client prüft.
        miss(f, step, e);
      }
    }
  }

  // Weggelassenes wird benannt, nicht stillschweigend gekürzt — eine kürzere
  // Liste ohne Hinweis wäre eine Falschaussage über den Bestand (V-246-Muster).
  if (Object.keys(missing).length) manifest.missing = missing;
  writeFileSync(join(dir, 'repack.json'), JSON.stringify(manifest, null, 2) + '\n');

  const dt = (Date.now() - t0) / 1000;
  log(`fertig in ${dt.toFixed(1)} s → ${dir}`);
  if (gribBytes) {
    log(`GRIB (bz2) ${(gribBytes / 1048576).toFixed(2)} MiB → PNG ${(pngBytes / 1048576).toFixed(2)} MiB `
      + `= Faktor ${(gribBytes / pngBytes).toFixed(1)}×`);
  }
  for (const f of Object.keys(missing)) log(`FEHLENDE Schritte — ${f} [${missing[f].join(',')}]`);

  // Der Nah-Horizont ist das, was eine Kaltsitzung wirklich lädt (START_NOW_ONLY,
  // `MapView.tsx:408`). Fehlt er bei den Default-Layern, ist der Lauf unbrauchbar
  // und darf nicht als Erfolg durchgehen — sonst legt BW-2 später ein taubes Tag um.
  const nearMissing = [0, 1, 2].filter((s) =>
    (stepsBy.wind.includes(s) && (missing.wind ?? []).includes(s))
    || (stepsBy.temp.includes(s) && (missing.temp ?? []).includes(s)));
  if (nearMissing.length) {
    log(`ABBRUCH: Nah-Horizont unvollständig (Schritte ${nearMissing.join(',')})`);
    process.exitCode = 1;
  }
}

// Nur als Skript laufen, nicht beim Import durch `verify-repack.mjs`.
// (`process.argv[1]` fehlt bei `node -e` → optionaler Zugriff.)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('[repack] FEHLER:', e); process.exit(1); });
}
