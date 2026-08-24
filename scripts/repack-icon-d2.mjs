/**
 * repack-icon-d2.mjs — Producer der Repack-Linie (Phase BW-1, `audit/bandbreite.md`).
 *
 * Nimmt die ICON-D2-GRIB2-Dateien, die heute JEDER Browser einzeln holt und
 * dekodiert, und schreibt sie EINMAL als PNG — genau in der Form, in die der
 * Client sie ohnehin überführt, bevor er sie zeichnet.
 *
 * ── Der Kern in einem Satz ─────────────────────────────────────────────────
 * Die App reduziert die Daten heute schon: `buildWindRgba`/`buildTempRgba`
 * tasten das native 1215×746-Float-Gitter auf 608×373 × 8 bit herunter, BEVOR
 * irgendetwas gezeichnet wird. Wir verschieben diesen Schritt nach vorn — vom
 * Browser jedes Besuchers in einen Lauf.
 *
 * ── Warum das nichts kostet ────────────────────────────────────────────────
 * Der Producer importiert **dieselben Module** wie der Client
 * (`src/wind/windFrameBuild.ts`, `src/sources/tempFrameBuild.ts`) — keine
 * nachgebaute Mathematik. PNG ist verlustfrei. `verify:repack` beweist je Lauf
 * am Byte, dass `PNG → decode` identisch zu `GRIB → Client-Pfad` ist; der
 * Browser-Rundlauf ist in `audit/bandbreite.md` §19.1 gemessen (0 abweichende
 * Bytes in Chrome).
 *
 * ── Kanalbelegung ──────────────────────────────────────────────────────────
 *   wind-<SSS>.png  RGB   R = norm. u, G = norm. v, B = 0 (A ist immer 255 →
 *                         gespart; der Decoder liefert sie zurück). Die vier
 *                         Normierungswerte stehen JE SCHRITT im Manifest —
 *                         ohne sie ist das Bild bedeutungslos.
 *   temp-<SSS>.png  G+A   Grau = norm. °C, Alpha = Maske. Alpha trägt hier
 *                         Information (außerhalb der Domäne 0) und darf NICHT
 *                         weggelassen werden.
 *   hsurf.png       Grau  norm. Orographie — der Grün-Kanal des Client-Bilds.
 *                         EINE Datei statt einer Kopie in jedem Zeitschritt:
 *                         `hsurf` ist zeitinvariant UND lauf-invariant (an drei
 *                         Läufen gemessen, 0 abweichende Zellen). Das ist der
 *                         Unterschied zwischen 161 KB und 87 KB je Schritt.
 *                         Nebengewinn: der separate 647-KB-`hsurf`-GRIB-Abruf
 *                         des Clients entfällt.
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
 *   REPACK_ONLY    `wind` | `temp` — nur eine Familie.
 *   REPACK_SKIP_IF_RUN  Lauf, der bereits abgelegt ist (BW-2: der Batch tickt
 *                  öfter als das DWD publiziert).
 *   REPACK_HAVE_WIND / REPACK_HAVE_TEMP  Wie viele Schritte davon abliegen.
 *                  Nur wenn das reicht, wird ausgestiegen — sonst wird ein
 *                  unvollständig erwischter Lauf nachgerechnet (s. `skipDecision`).
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
import { decodeGrib2, subsampledCorners } from '../src/sources/gribDecode.ts';
import { buildWindRgba } from '../src/wind/windFrameBuild.ts';
import { buildTempRgba, buildHsurfGrey, TEMP_VMIN, TEMP_VMAX, TEMP_DEM_MAX } from '../src/sources/tempFrameBuild.ts';
import { encodePng } from './lib/png.mjs';
import { RUNS_DIR, HSURF_FILE } from './lib/repackManifest.mjs';

const bz2 = bz2mod.decompress ? bz2mod : (bz2mod.default ?? bz2mod);

const DWD_BASE = (process.env.DWD_BASE || 'https://opendata.dwd.de/weather/nwp/icon-d2/grib').replace(/\/+$/, '');
const OUT_DIR = resolve(process.env.REPACK_OUT || 'data/repack');
const CACHE_DIR = resolve('.cache/repack');
const ONLY = process.env.REPACK_ONLY || null;

/** MUSS identisch zum Client sein (`iconD2WindSource.ts:41`, `iconD2TempSource.ts:34`)
 *  UND zu `scripts/verify-layer-geometry.mjs:29-31`, das den Wert hart kodiert.
 *  Eine andere Abtastung verschiebt jeden Wert auf der Karte. */
export const TARGET_WIDTH = 700;
/** Horizont-Caps wie im Client: Wind 12 h, Temperatur 24 h. */
const MAX_STEP = { wind: 12, temp: 24 };

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

/** bz2 → GRIB2 → decodiertes Feld, über denselben Decoder wie der Browser. */
export async function fetchField(url) {
  const raw = await fetchRaw(url);
  return decodeGrib2(bz2.decompress(new Uint8Array(raw)));
}

export const urls = { step: stepUrl, invariant: invariantUrl };

// ---------------------------------------------------------------------------
// Lauf-Discovery (dieselbe Listing-Logik wie die Manifest-Publisher)
// ---------------------------------------------------------------------------
async function listSteps(run, param) {
  const hh = run.slice(8, 10);
  const res = await fetch(`${DWD_BASE}/${hh}/${param}/`);
  if (!res.ok) return [];
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

/** Neuester Lauf, der u_10m, v_10m UND t_2m mindestens bis Schritt 2 führt. */
export async function findLatestRun() {
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 6; back++) {
    const run = runStrOf(new Date(now.getTime() - back * 3 * 3600_000));
    const [u, v, t] = await Promise.all(['u_10m', 'v_10m', 't_2m'].map((p) => listSteps(run, p)));
    const near = [0, 1, 2];
    if (near.every((s) => u.includes(s) && v.includes(s) && t.includes(s))) {
      return {
        run,
        runAt: parseRunStr(run),
        wind: u.filter((s) => v.includes(s) && s <= MAX_STEP.wind),
        temp: t.filter((s) => s <= MAX_STEP.temp),
      };
    }
    log(`Lauf ${run} noch unvollständig (u:${u.length} v:${v.length} t:${t.length}) — weiter zurück`);
  }
  throw new Error('kein vollständiger ICON-D2-Lauf gefunden');
}

// ---------------------------------------------------------------------------
// Die zwei Repack-Schritte — beide über die GETEILTEN Client-Module
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
  const n = b.width * b.height;
  const ga = new Uint8Array(n * 2);
  for (let i = 0; i < n; i++) { ga[i * 2] = b.rgba[i * 4]; ga[i * 2 + 1] = b.rgba[i * 4 + 3]; }
  return {
    png: encodePng(b.width, b.height, ga, 2),
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
 * das, was `iconD2TempSource` in BW-3 tun wird, und für `verify:repack`.
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
 * Rein gehalten, damit `verify:repack` die Entscheidung ohne Netz durchspielen
 * kann. `-1` heißt „unbekannt" und zählt nie als vollständig.
 */
export function skipDecision({ run, haveRun, haveWind, haveTemp, wind, temp }) {
  if (!haveRun || haveRun !== run) return { skip: false, reason: `Lauf ${run} ist neu → rechnen.` };
  if (haveWind >= wind && haveTemp >= temp) {
    return { skip: true, reason: `Lauf ${run} liegt vollständig (Wind ${haveWind}, Temperatur ${haveTemp}) → nichts zu tun.` };
  }
  return {
    skip: false,
    reason: `Lauf ${run} liegt schon, aber unvollständig `
      + `(Wind ${haveWind}/${wind}, Temperatur ${haveTemp}/${temp}) → nachrechnen.`,
  };
}

async function main() {
  const t0 = Date.now();
  let run, runAt, windSteps, tempSteps;
  if (process.env.REPACK_RUN) {
    run = process.env.REPACK_RUN;
    runAt = parseRunStr(run);
    const [u, v, t] = await Promise.all(['u_10m', 'v_10m', 't_2m'].map((p) => listSteps(run, p)));
    windSteps = u.filter((s) => v.includes(s) && s <= MAX_STEP.wind);
    tempSteps = t.filter((s) => s <= MAX_STEP.temp);
  } else {
    ({ run, runAt, wind: windSteps, temp: tempSteps } = await findLatestRun());
  }
  if (process.env.REPACK_STEPS) {
    const only = process.env.REPACK_STEPS.split(',').map(Number);
    windSteps = windSteps.filter((s) => only.includes(s));
    tempSteps = tempSteps.filter((s) => only.includes(s));
  }
  if (ONLY === 'wind') tempSteps = [];
  if (ONLY === 'temp') windSteps = [];

  // BW-2: Der Batch im Daten-Repo tickt häufiger als das DWD publiziert (~3 h).
  // Ohne diesen Ausstieg würde jeder Tick denselben Lauf neu rechnen und einen
  // inhaltsgleichen Force-Push auslösen. `state.json` sagt dem Workflow, ob es
  // etwas zu tun gab — der Producer entscheidet das, nicht der YAML-Text.
  mkdirSync(OUT_DIR, { recursive: true });
  const stateFile = join(OUT_DIR, 'state.json');
  const decision = skipDecision({
    run,
    haveRun: process.env.REPACK_SKIP_IF_RUN || '',
    haveWind: Number(process.env.REPACK_HAVE_WIND ?? -1),
    haveTemp: Number(process.env.REPACK_HAVE_TEMP ?? -1),
    wind: windSteps.length,
    temp: tempSteps.length,
  });
  writeFileSync(stateFile, JSON.stringify(
    { run, skipped: decision.skip, reason: decision.reason, at: new Date().toISOString() }, null, 2) + '\n');
  log(decision.reason);
  if (decision.skip) return;

  log(`Lauf ${run} — Wind [${windSteps.join(',')}] · Temperatur [${tempSteps.join(',')}]`);

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
    wind: { channels: 3, steps: [] },
    temp: {
      channels: 2, vMin: TEMP_VMIN, vMax: TEMP_VMAX, demMax: TEMP_DEM_MAX,
      hsurf: null, steps: [],
    },
  };

  let gribBytes = 0, pngBytes = 0;

  const noteGrid = (field) => {
    if (manifest.grid) return;
    const ss = Math.max(1, Math.ceil(field.ni / TARGET_WIDTH));
    // Die Ecken der ABGETASTETEN Punkte, nicht des nativen Gitters (KL3) —
    // dieselbe Funktion, die der Client für seine uvBounds benutzt.
    const c = subsampledCorners(field, ss);
    manifest.grid = {
      ni: field.ni, nj: field.nj, ss,
      width: Math.ceil(field.ni / ss), height: Math.ceil(field.nj / ss),
      corners: { nw: c[0], ne: c[1], se: c[2], sw: c[3] },
    };
  };
  const rawSize = (url) => {
    const f = join(CACHE_DIR, url.slice(url.lastIndexOf('/') + 1));
    return existsSync(f) ? readFileSync(f).length : 0;
  };

  // Ein einzelner Schritt darf den Lauf nicht töten (der Client fängt fehlende
  // Schritte ohnehin einzeln ab) — aber er wird GENANNT, nicht verschwiegen.
  const missing = { wind: [], temp: [] };

  for (const step of windSteps) {
    try {
      const r = await repackWindStep(run, step);
      noteGrid(r.field);
      const file = `wind-${pad3(step)}.png`;
      writeFileSync(join(dir, file), r.png);
      gribBytes += rawSize(stepUrl(run, 'u_10m', step)) + rawSize(stepUrl(run, 'v_10m', step));
      pngBytes += r.png.length;
      manifest.wind.steps.push({ step, file, bytes: r.png.length, ...r.norm });
      log(`  wind ${pad3(step)} → ${(r.png.length / 1024).toFixed(0)} KB`);
    } catch (e) {
      missing.wind.push(step);
      log(`  wind ${pad3(step)} FEHLT — ${e.message}`);
    }
  }

  if (tempSteps.length) {
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
      manifest.temp.hsurf = { url: HSURF_FILE, scope: 'repo', channels: 1, bytes: r.png.length };
      log(`  hsurf     → ${(r.png.length / 1024).toFixed(0)} KB (lauf-unabhängig, an der Wurzel)`);
    }
    for (const step of tempSteps) {
      try {
        const r = await repackTempStep(run, step, hsurf);
        noteGrid(r.field);
        const file = `temp-${pad3(step)}.png`;
        writeFileSync(join(dir, file), r.png);
        gribBytes += rawSize(stepUrl(run, 't_2m', step));
        pngBytes += r.png.length;
        manifest.temp.steps.push({ step, file, bytes: r.png.length });
        log(`  temp ${pad3(step)} → ${(r.png.length / 1024).toFixed(0)} KB`);
      } catch (e) {
        missing.temp.push(step);
        log(`  temp ${pad3(step)} FEHLT — ${e.message}`);
      }
    }
  }

  // Weggelassenes wird benannt, nicht stillschweigend gekürzt — eine kürzere
  // Liste ohne Hinweis wäre eine Falschaussage über den Bestand (V-246-Muster).
  if (missing.wind.length || missing.temp.length) manifest.missing = missing;
  writeFileSync(join(dir, 'repack.json'), JSON.stringify(manifest, null, 2) + '\n');

  const dt = (Date.now() - t0) / 1000;
  log(`fertig in ${dt.toFixed(1)} s → ${dir}`);
  if (gribBytes) {
    log(`GRIB (bz2) ${(gribBytes / 1048576).toFixed(2)} MiB → PNG ${(pngBytes / 1048576).toFixed(2)} MiB `
      + `= Faktor ${(gribBytes / pngBytes).toFixed(1)}×`);
  }
  if (missing.wind.length || missing.temp.length) {
    log(`FEHLENDE Schritte — Wind [${missing.wind.join(',')}] · Temperatur [${missing.temp.join(',')}]`);
  }

  // Der Nah-Horizont ist das, was eine Kaltsitzung wirklich lädt (START_NOW_ONLY,
  // `MapView.tsx:408`). Fehlt er, ist der Lauf unbrauchbar und darf nicht als
  // Erfolg durchgehen — sonst legt BW-2 später ein taubes Tag um.
  const nearMissing = [0, 1, 2].filter((s) =>
    (windSteps.includes(s) && missing.wind.includes(s))
    || (tempSteps.includes(s) && missing.temp.includes(s)));
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
