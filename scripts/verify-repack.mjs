/**
 * verify-repack.mjs — Byte-Identitäts-Gate der Repack-Linie (Phase BW-1,
 * `audit/bandbreite.md`).
 *
 * Die Frage, die dieses Skript beantwortet, ist die einzige, die zählt:
 *
 *   **Bekommt der Client aus dem PNG exakt dieselben Bytes, die er heute aus
 *   dem GRIB rechnet — oder nur ungefähr dieselben?**
 *
 * „Ungefähr" wäre hier tödlich: die Bytes SIND die Werte (R = Temperatur,
 * R/G = Windkomponenten). Ein einziges verschobenes Byte ist ein anderer
 * Messwert auf der Karte, nicht ein anderer Pixel.
 *
 * Gemessen wird deshalb der volle Rundlauf über MEHRERE Läufe:
 *   GRIB → Client-Modul  →  Referenz-Bytes
 *   GRIB → Producer      →  PNG → Decoder → Zusammensetzen  →  Ist-Bytes
 * und beide müssen `Buffer.compare === 0` sein. Nicht „Abweichung klein".
 *
 * Was dieses Skript NICHT beweist: dass CHROME das PNG genauso dekodiert. Das
 * ist separat gemessen (BW-P, `audit/bandbreite.md` §19.1: adversarialer Rahmen
 * über `createImageBitmap`, 0 abweichende Bytes). Erst beide Hälften zusammen
 * schließen die Kette Producer → CDN → Browser.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-repack.mjs
 *
 * ── Zweiter Teil: die Ablage (BW-2) ────────────────────────────────────────
 * Ab Prüfung (7) geht es nicht mehr um die Bytes, sondern darum, ob der Client
 * sie WIEDERFINDET. Die Fehlerklasse ist eine andere und schlimmer, weil sie
 * stumm ist: ein Bild am falschen Lauf oder ohne seine Normierung zeigt eine
 * Karte, die plausibel aussieht und falsch ist.
 *
 * Diese Prüfungen brauchen einen Publisher-Probelauf im Baum:
 *     npm run repack           # Bilder
 *     npm run repack:publish   # Baum + index.json (pusht nicht)
 *     npm run verify:repack
 * Fehlt der Baum, schlägt die erste BW-2-Prüfung fehl statt still zu überspringen.
 *
 * ENV: REPACK_RUNS  Komma-Liste fester Läufe statt Discovery (offline-Wiederholung).
 *      REPACK_STEPS Komma-Liste der Schritte je Lauf. Default `0,1`.
 *      REPACK_WORK  Publisher-Baum. Default `.cache/repack-repo`.
 *      REPACK_CHECK_CDN=1  prüft zusätzlich jsDelivr (erst sinnvoll, wenn das
 *                   Daten-Repo steht — sonst wird die Zeile als „nicht geprüft"
 *                   ausgewiesen, nie als bestanden).
 */

import { readFileSync } from 'node:fs';
import { encodePng, decodePng, toRgba } from './lib/png.mjs';
import {
  fetchField, urls, TARGET_WIDTH,
  repackWindStep, repackTempStep, repackHsurf, composeTempRgba,
} from './repack-icon-d2.mjs';
import { buildWindRgba } from '../src/wind/windFrameBuild.ts';
import { buildTempRgba, TEMP_VMIN, TEMP_VMAX, TEMP_DEM_MAX } from '../src/sources/tempFrameBuild.ts';
// BW-3: das Modul, das der Browser benutzt — hier ohne DOM importiert, damit
// seine reinen Teile (Prüfung, URL-Bau, Zusammensetzen, Schalter) gegen
// DIESELBE Wahrheit laufen wie der Producer.
import * as RS from '../src/sources/repackSource.ts';

const checks = [];
const add = (name, ok, detail) => { checks.push({ name, ok, detail }); };
const eq = (a, b) => Buffer.compare(Buffer.from(a.buffer ?? a, a.byteOffset ?? 0, a.length),
  Buffer.from(b.buffer ?? b, b.byteOffset ?? 0, b.length)) === 0;
/** Erste abweichende Stelle — eine Zahl sagt mehr als „ungleich". */
function firstDiff(a, b) {
  if (a.length !== b.length) return `Länge ${a.length} ≠ ${b.length}`;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return `Byte ${i}: ${a[i]} ≠ ${b[i]}`;
  return null;
}

const STEPS = (process.env.REPACK_STEPS || '0,1').split(',').map(Number);

// ---------------------------------------------------------------------------
// (1) Das Werkzeug zuerst: der Codec muss verlustfrei sein, sonst misst alles
//     Weitere nur die Fehler des Messgeräts.
// ---------------------------------------------------------------------------
for (const ch of [1, 2, 3, 4]) {
  const w = 257, h = 131;                     // krumm: deckt Zeilen-Padding auf
  const d = new Uint8Array(w * h * ch);
  for (let i = 0; i < d.length; i++) d[i] = (i * 7919 + (i >> 3) * 13) & 0xff;
  for (let i = 0; i < d.length; i += 997) d[i] = 0;   // Sprünge gegen Filter-Annahmen
  const dec = decodePng(encodePng(w, h, d, ch));
  add(`Codec: Rundlauf verlustfrei bei ${ch} Kanälen`,
    dec.width === w && dec.height === h && dec.channels === ch && eq(dec.data, d),
    firstDiff(dec.data, d) ?? `${w}×${h}, alle 256 Bytewerte`);
}
add('Codec: gekipptes Byte wird erkannt (CRC-Wächter)', (() => {
  const png = encodePng(8, 8, new Uint8Array(256), 4);
  png[30] ^= 0xff;
  try { decodePng(png); return false; } catch { return true; }
})(), 'ein kaputtes PNG darf nicht als „identisch" durchgehen');

// ---------------------------------------------------------------------------
// (2) Abtastung: der Producer darf das Gitter NICHT anders abtasten als der
//     Client — und `verify-layer-geometry.mjs` kodiert den Wert hart.
// ---------------------------------------------------------------------------
const srcOf = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const geomWidth = Number(/const TARGET_WIDTH = (\d+)/.exec(srcOf('./verify-layer-geometry.mjs'))?.[1]);
const windWidth = Number(/const TARGET_WIDTH = (\d+)/.exec(srcOf('../src/wind/iconD2WindSource.ts'))?.[1]);
const tempWidth = Number(/const TARGET_WIDTH = (\d+)/.exec(srcOf('../src/sources/iconD2TempSource.ts'))?.[1]);
add('Abtastung: Producer, Wind-Client, Temp-Client und Geometrie-Gate nennen dieselbe Zielbreite',
  TARGET_WIDTH === 700 && geomWidth === 700 && windWidth === 700 && tempWidth === 700,
  `Producer ${TARGET_WIDTH} · Wind ${windWidth} · Temp ${tempWidth} · Geometrie-Gate ${geomWidth}`);

// Der Producer rechnet nicht selbst — er importiert die Client-Module.
const prodSrc = srcOf('./repack-icon-d2.mjs');
add('Producer rechnet NICHT selbst: er importiert die geteilten Client-Module',
  /from '\.\.\/src\/wind\/windFrameBuild\.ts'/.test(prodSrc)
  && /from '\.\.\/src\/sources\/tempFrameBuild\.ts'/.test(prodSrc)
  && /from '\.\.\/src\/sources\/gribDecode\.ts'/.test(prodSrc)
  && !/Math\.round\(clamp01/.test(prodSrc),
  'windFrameBuild + tempFrameBuild + gribDecode, keine eigene Normierung');

// Und der Client benutzt wirklich das ausgelagerte Modul (kein zweiter Bildbauer).
const tempClient = srcOf('../src/sources/iconD2TempSource.ts');
add('Client baut das Temp-Bild über `buildTempRgba` (keine zweite Kopie der Mathematik)',
  /import \{[^}]*buildTempRgba[^}]*\} from '\.\/tempFrameBuild'/.test(tempClient)
  && /buildTempRgba\(t2m, hsurf, ss\)/.test(tempClient)
  && !/const celsius = kelvin - KELVIN/.test(tempClient),
  'iconD2TempSource.ts');

// Die Normierung steht an drei weiteren Stellen als LITERAL (`scalar/snowLine.ts`,
// `scalar/confidenceImage.ts`) — sie LESEN das Bild, das hier entsteht. Diese
// Kopien zu entfernen wäre ein eigener Umbau (V-BW-20); dass sie auseinander
// laufen, wäre ein stiller Wertfehler auf der Karte. Also hier bewacht.
{
  const snow = srcOf('../src/scalar/snowLine.ts');
  const conf = srcOf('../src/scalar/confidenceImage.ts');
  const lit = (src, name) => Number(new RegExp(`const ${name} = (-?\\d+)`).exec(src)?.[1]);
  add('Bild-Leser benutzen dieselbe Normierung wie der Bild-Bauer (Kopien-Wächter)',
    lit(snow, 'TEMP_VMIN') === TEMP_VMIN && lit(snow, 'TEMP_VMAX') === TEMP_VMAX
    && lit(snow, 'DEM_MAX') === TEMP_DEM_MAX && lit(conf, 'DEM_MAX') === TEMP_DEM_MAX,
    `snowLine ${lit(snow, 'TEMP_VMIN')}…${lit(snow, 'TEMP_VMAX')} °C / ${lit(snow, 'DEM_MAX')} m · `
    + `confidenceImage ${lit(conf, 'DEM_MAX')} m · Modul ${TEMP_VMIN}…${TEMP_VMAX} °C / ${TEMP_DEM_MAX} m`);
}

// ---------------------------------------------------------------------------
// (3) Der eigentliche Beweis — über mehrere echte Läufe.
// ---------------------------------------------------------------------------
const pad2 = (n) => String(n).padStart(2, '0');
const runStrOf = (d) =>
  `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}${pad2(d.getUTCHours())}`;

/** Sammelt Läufe rückwärts, bis `want` davon wirklich Daten liefern. */
async function collectRuns(want) {
  if (process.env.REPACK_RUNS) return process.env.REPACK_RUNS.split(',');
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  const out = [];
  for (let back = 0; back < 10 && out.length < want; back++) {
    const run = runStrOf(new Date(now.getTime() - back * 3 * 3600_000));
    try {
      await fetchField(urls.step(run, 'u_10m', STEPS[0]));  // eine Sonde reicht
      out.push(run);
    } catch { /* Lauf noch nicht/nicht mehr da → weiter zurück */ }
  }
  return out;
}

const runs = await collectRuns(3);
add('mindestens drei echte ICON-D2-Läufe geprüft (nicht einer)',
  runs.length >= 3, runs.join(', ') || 'keiner erreichbar');

const hsurfGreys = [];
/** Ein echtes Feld + sein Subsampling, aufgehoben für die Geometrie-Prüfung in (8). */
let geomRef = null;
let naiveShown = false;

for (const run of runs) {
  // --- Wind ---------------------------------------------------------------
  for (const step of STEPS) {
    let ok = false, detail = '';
    try {
      const prod = await repackWindStep(run, step);
      const [u, v] = await Promise.all([
        fetchField(urls.step(run, 'u_10m', step)),
        fetchField(urls.step(run, 'v_10m', step)),
      ]);
      const ref = buildWindRgba(u, v, TARGET_WIDTH);

      // Blau/Alpha sind konstant — nur DESHALB darf das PNG sie weglassen.
      let constOk = true;
      for (let i = 0; i < ref.rgba.length; i += 4) {
        if (ref.rgba[i + 2] !== 0 || ref.rgba[i + 3] !== 255) { constOk = false; break; }
      }
      add(`Wind ${run}+${step}: B = 0 und A = 255 überall (Rechtfertigung für RGB statt RGBA)`,
        constOk, constOk ? '' : 'RGB würde Information verlieren');

      const back = toRgba(decodePng(prod.png));
      ok = eq(back, ref.rgba);
      detail = firstDiff(back, ref.rgba) ?? `${ref.width}×${ref.height} = ${ref.rgba.length} Bytes identisch`;

      // Die Normierung ist Teil der Nutzlast, nicht Zierat.
      const n = prod.norm;
      add(`Wind ${run}+${step}: Normierung vollständig und sinnvoll`,
        [n.uMin, n.uMax, n.vMin, n.vMax].every(Number.isFinite)
        && n.uMax > n.uMin && n.vMax > n.vMin
        && n.uMin === ref.uMin && n.uMax === ref.uMax && n.vMin === ref.vMin && n.vMax === ref.vMax,
        `u ${n.uMin?.toFixed(2)}…${n.uMax?.toFixed(2)} · v ${n.vMin?.toFixed(2)}…${n.vMax?.toFixed(2)} m/s`);
    } catch (e) { detail = e.message; }
    add(`Wind ${run}+${step}: PNG → Decoder ist BYTE-identisch zum Client-Pfad`, ok, detail);
  }

  // --- Temperatur ---------------------------------------------------------
  let hsurf = null;
  try { hsurf = await fetchField(urls.invariant(run, 'hsurf')); } catch { /* s. u. */ }
  add(`Temperatur ${run}: hsurf geladen`, !!hsurf, hsurf ? '' : 'ohne hsurf keine Höhenkorrektur');
  if (!hsurf) continue;

  const hp = repackHsurf(hsurf);
  hsurfGreys.push([run, hp.grey]);
  const hBack = decodePng(hp.png);
  add(`Temperatur ${run}: hsurf-PNG → Decoder byte-identisch`,
    hBack.channels === 1 && eq(hBack.data, hp.grey),
    firstDiff(hBack.data, hp.grey) ?? `${hp.width}×${hp.height}, ${(hp.png.length / 1024).toFixed(0)} KB`);

  for (const step of STEPS) {
    let ok = false, detail = '';
    try {
      const prod = await repackTempStep(run, step, hsurf);
      const t2m = await fetchField(urls.step(run, 't_2m', step));
      const ss = Math.max(1, Math.ceil(t2m.ni / TARGET_WIDTH));
      const ref = buildTempRgba(t2m, hsurf, ss);

      // Genau der Weg, den der Client in BW-3 gehen wird: zwei Dateien, ein Bild.
      const dt = decodePng(prod.png);
      const back = composeTempRgba(dt.data, decodePng(hp.png).data, dt.width, dt.height);
      ok = eq(back, ref.rgba);
      detail = firstDiff(back, ref.rgba) ?? `${ref.width}×${ref.height} = ${ref.rgba.length} Bytes identisch`;

      // BW-3: derselbe Rundlauf, aber mit dem BYTE-LAYOUT, das der BROWSER
      // liefert. `createImageBitmap` + `getImageData` expandieren Grau auf
      // R = G = B — die Temperatur steht danach AUCH im Grünkanal, also genau
      // dort, wo der ScalarLayer die Bezugshöhe liest. Der Client muss ihn durch
      // hsurf ersetzen; täte er es nicht, rechnete die Höhenkorrektur mit 20 °C
      // als 2 400 m (§22.2) — plausible Karte, falsche Werte. `toRgba` bildet
      // genau diese Expansion nach.
      const browserTemp = toRgba(dt);
      const browserHsurf = toRgba(decodePng(hp.png));
      const greyFromR = new Uint8Array(dt.width * dt.height);
      for (let i = 0; i < greyFromR.length; i++) greyFromR[i] = browserHsurf[i * 4];
      const clientBack = RS.composeTempRgba(browserTemp, greyFromR, dt.width, dt.height);
      add(`Temperatur ${run}+${step}: CLIENT-Zusammensetzen aus Browser-Bytes ist BYTE-identisch`,
        eq(clientBack, ref.rgba),
        firstDiff(clientBack, ref.rgba) ?? `${ref.rgba.length} Bytes identisch`);

      // Gegenprobe: ohne das Ersetzen des Grünkanals MUSS es auffallen. Sonst
      // prüfte die Zeile darüber nichts (die Maske allein macht sie nicht grün).
      if (!geomRef) geomRef = { field: t2m, ss, run, step };
      if (!naiveShown) {
        naiveShown = true;
        add('Gegenprobe: das PNG ungefiltert durchreichen wäre NICHT identisch',
          !eq(browserTemp, ref.rgba),
          'Grau expandiert auf R=G=B — der Grünkanal trüge die Temperatur statt der Höhe');
      }
    } catch (e) { detail = e.message; }
    add(`Temperatur ${run}+${step}: PNG + hsurf → Zusammensetzen ist BYTE-identisch zum Client-Pfad`, ok, detail);
  }
}

// hsurf einmal je Lauf zu schreiben lohnt nur, wenn es zwischen Läufen gleich ist.
if (hsurfGreys.length >= 2) {
  const [refRun, ref] = hsurfGreys[0];
  const same = hsurfGreys.every(([, g]) => eq(g, ref));
  add('hsurf ist lauf-invariant (rechtfertigt EINE Datei statt einer je Zeitschritt)',
    same, `${hsurfGreys.length} Läufe gegen ${refRun}`);
}

// ---------------------------------------------------------------------------
// (7) BW-2 — die ABLAGE. Bis hierher ist bewiesen, dass die BYTES stimmen.
//     Jetzt: findet der Client sie auch wieder? Die Fehlerklasse ist eine andere
//     — nicht „falscher Wert", sondern „richtiger Wert am falschen Lauf" bzw.
//     „Bild ohne seine Normierung". Beides ist stumm: die Karte zeigt etwas.
// ---------------------------------------------------------------------------
{
  const { existsSync, readFileSync: rf, statSync } = await import('node:fs');
  const { join } = await import('node:path');
  const RM = await import('./lib/repackManifest.mjs');
  const PUB = await import('./publish-repack.mjs');

  const WORK = process.env.REPACK_WORK || '.cache/repack-repo';
  const indexPath = join(WORK, 'index.json');
  const built = existsSync(indexPath);
  add('BW-2: Publisher-Baum vorhanden (`npm run repack:publish`)', built,
    built ? indexPath : `${indexPath} fehlt — die BW-2-Prüfungen brauchen einen Probelauf`);

  if (built) {
    const index = JSON.parse(rf(indexPath, 'utf8'));

    add('Index nennt einen vollständigen Commit-SHA',
      /^[0-9a-f]{40}$/.test(String(index.commit)), String(index.commit));
    add('Index nennt die CDN-Basis aus dem geteilten Modul',
      index.base === RM.CDN_BASE, index.base);
    add('Index nennt Quelle und Lizenz (CC-BY-Pflicht des DWD)',
      /Deutscher Wetterdienst/.test(index.source ?? '') && /CC BY 4\.0/.test(index.source ?? ''),
      index.source);
    add('Index führt mindestens einen Lauf', (index.runs ?? []).length > 0,
      `${index.runs?.length ?? 0} Läufe: ${(index.runs ?? []).map((r) => r.run).join(', ')}`);

    const entry = index.runs[0];

    // ── Die Normierung ist KEIN Zubehör ────────────────────────────────────
    // `buildWindRgba` normiert JE FRAME. Ein Wind-PNG ohne seine vier Werte ist
    // nicht ungenau, sondern bedeutungslos — und zwar unauffällig: die Karte
    // zeichnete Wind, nur den falschen.
    const wsteps = entry.wind?.steps ?? [];
    const normOk = wsteps.every((s) =>
      ['uMin', 'uMax', 'vMin', 'vMax'].every((k) => Number.isFinite(s[k])) && s.uMin < s.uMax && s.vMin < s.vMax);
    add('JEDER Wind-Schritt trägt seine vier Normierungswerte (uMin<uMax, vMin<vMax)',
      wsteps.length > 0 && normOk, `${wsteps.length} Schritte`);
    // Gegenprobe, dass die Prüfung etwas misst: die Werte müssen sich von
    // Schritt zu Schritt unterscheiden — sonst wäre eine feste Skala gemeint.
    const distinct = new Set(wsteps.map((s) => `${s.uMin}|${s.uMax}`)).size;
    add('Die Normierung ist je Schritt verschieden (also wirklich je Frame bestimmt)',
      wsteps.length < 2 || distinct === wsteps.length, `${distinct} verschiedene von ${wsteps.length}`);

    add('Temperatur nennt ihre feste Skala (vMin/vMax/demMax)',
      entry.temp?.vMin === TEMP_VMIN && entry.temp?.vMax === TEMP_VMAX && entry.temp?.demMax === TEMP_DEM_MAX,
      `${entry.temp?.vMin}…${entry.temp?.vMax} °C, DEM ${entry.temp?.demMax} m`);
    add('Gitter-Ecken stehen im Index (KL3: die Ecken der ABGETASTETEN Punkte)',
      entry.grid?.corners?.nw != null && entry.grid.width === Math.ceil(entry.grid.ni / entry.grid.ss),
      `${entry.grid?.width}×${entry.grid?.height}, ss=${entry.grid?.ss}`);

    // ── URL-Bau: eine Regel, nicht drei ────────────────────────────────────
    const wSec = RM.sectionFor(entry, 'wind', index.commit);
    const tSec = RM.sectionFor(entry, 'temp', index.commit);
    add('Wind-Abschnitt trägt NUR Wind, Temperatur-Abschnitt NUR Temperatur',
      wSec.wind != null && wSec.temp == null && tSec.temp != null && tSec.wind == null);

    const wUrl = RM.stepUrl(wSec, wSec.wind.steps[0].file);
    const hUrl = RM.repoUrl(tSec, tSec.temp.hsurf.url);
    add('Schritt-URL enthält Commit UND Lauf',
      wUrl.includes(`@${index.commit}/`) && wUrl.includes(`/${entry.run}/`), wUrl.slice(0, 96) + '…');
    // Das ist der sichtbare Beweis der Lauf-Unabhängigkeit: die Orographie
    // steht in der URL NICHT hinter einem Lauf. Landete sie doch dort, lüde
    // der Client sie bei jedem Laufwechsel neu — 64 KB × 8/Tag umsonst.
    add('hsurf-URL trägt KEINEN Lauf-Pfad (lauf-unabhängig, §20.2)',
      !hUrl.includes(`/${entry.run}/`) && hUrl.endsWith(RM.HSURF_FILE), hUrl.slice(0, 96) + '…');

    // ── Anti-Drift: der Abschnitt darf nie zu einem anderen Lauf gehören ───
    add('Index liefert für einen FREMDEN Lauf keinen Abschnitt (Anti-Drift)',
      RM.pickForRun(index, '1999010100', 'wind') === null);
    add('Ohne Commit kein Abschnitt', RM.sectionFor(entry, 'wind', null) === null);

    // ── carryRepack: die drei Fälle, einzeln ───────────────────────────────
    const sec = wSec;
    const other = { ...sec, run: 'X', commit: 'b'.repeat(40) };
    add('carryRepack (1) Index gelesen und führt den Lauf → nimm ihn',
      RM.carryRepack({ repack: other }, entry.run, { ok: true, section: sec }) === sec);
    add('carryRepack (2) Index gelesen, führt ihn NICHT → weglassen statt veralten',
      RM.carryRepack({ repack: other }, entry.run, { ok: true, section: null }) === null);
    add('carryRepack (3a) Index unlesbar → bestehenden Abschnitt DESSELBEN Laufs behalten',
      RM.carryRepack({ repack: sec }, entry.run, { ok: false, section: null }) === sec);
    add('carryRepack (3b) Index unlesbar → Abschnitt eines ANDEREN Laufs fallen lassen',
      RM.carryRepack({ repack: other }, entry.run, { ok: false, section: null }) === null);
    add('sameSection erkennt einen Commit-Wechsel',
      RM.sameSection(sec, sec) && !RM.sameSection(sec, { ...sec, commit: 'c'.repeat(40) }));

    // ── Die Wiederholung, an einem echten Server ───────────────────────────
    // Anlass ist kein Gedankenspiel: `raw.githubusercontent.com` lief am
    // 2026-08-23 zweimal binnen zehn Minuten in einen Connect-Timeout. Geprüft
    // werden BEIDE Hälften der Regel — dass wiederholt wird, und dass bei 404
    // eben NICHT wiederholt wird (sonst wäre jeder Takt vor dem ersten
    // Producer-Lauf unnötig langsam).
    {
      const { createServer } = await import('node:http');
      const serve = (plan) => new Promise((ready) => {
        let n = 0;
        const srv = createServer((req, res) => {
          const step = plan[Math.min(n++, plan.length - 1)];
          res.writeHead(step, { 'content-type': 'application/json' });
          res.end(step === 200 ? JSON.stringify(index) : 'nope');
        });
        srv.listen(0, '127.0.0.1', () => ready({
          url: `http://127.0.0.1:${srv.address().port}/index.json`,
          hits: () => n,
          close: () => srv.close(),
        }));
      });

      const flaky = await serve([500, 200]);
      const r1 = await RM.fetchIndex({ indexUrl: flaky.url, retryMs: 10 });
      add('fetchIndex wiederholt nach 5xx und kommt beim zweiten Versuch durch',
        r1.ok === true && flaky.hits() === 2, `ok=${r1.ok} nach ${flaky.hits()} Abrufen`);
      flaky.close();

      const gone = await serve([404]);
      const r2 = await RM.fetchIndex({ indexUrl: gone.url, retryMs: 10 });
      add('fetchIndex wiederholt NICHT nach 404 („noch nicht abgelegt" ist eine Antwort)',
        r2.ok === false && gone.hits() === 1, `ok=${r2.ok} nach ${gone.hits()} Abruf(en) · ${r2.note}`);
      gone.close();
    }

    // ── Der Publisher darf Dateien nur BEWEGEN, nicht anfassen ─────────────
    let copiedOk = true, copiedNote = '';
    for (const r of index.runs) {
      for (const f of [...(r.wind?.steps ?? []), ...(r.temp?.steps ?? [])]) {
        const a = join(WORK, r.path, f.file);
        const b = join(process.env.REPACK_OUT || 'data/repack', 'runs', r.run, f.file);
        if (!existsSync(a)) { copiedOk = false; copiedNote = `${a} fehlt`; break; }
        if (statSync(a).size !== f.bytes) { copiedOk = false; copiedNote = `${f.file}: ${statSync(a).size} ≠ ${f.bytes} laut Index`; break; }
        if (existsSync(b) && !rf(a).equals(rf(b))) { copiedOk = false; copiedNote = `${f.file} vom Publisher verändert`; break; }
      }
      if (!copiedOk) break;
    }
    add('Publisher kopiert byte-identisch und der Index nennt die echten Größen',
      copiedOk, copiedNote || `${index.runs.reduce((n, r) => n + (r.wind?.steps?.length ?? 0) + (r.temp?.steps?.length ?? 0), 0)} Dateien`);

    // Ein Bild im Baum muss auch wirklich ein Bild sein — und das mit den
    // Maßen, die der Index behauptet.
    const png = decodePng(rf(join(WORK, entry.path, entry.wind.steps[0].file)));
    add('Ein Bild aus dem Publisher-Baum dekodiert auf die Gittermaße',
      png.width === entry.grid.width && png.height === entry.grid.height && png.channels === entry.wind.channels,
      `${png.width}×${png.height}×${png.channels}`);

    // ── Retention benennt, was sie wegwirft ────────────────────────────────
    const all = PUB.runsIn(WORK);
    add('Läufe im Baum sind absteigend sortiert (neuester zuerst)',
      all.join(',') === [...all].sort().reverse().join(','), all.join(', '));

    // Die Retention wird an einem Wegwerf-Baum geprüft, nicht am echten: sie
    // LÖSCHT, und eine Prüfung, die dabei danebengreift, kostet echte Bilder.
    {
      const { mkdtempSync, mkdirSync: mk, rmSync: rm } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const tmp = mkdtempSync(join(tmpdir(), 'repack-prune-'));
      const fake = ['2026082400', '2026082321', '2026082318', '2026082315', '2026082312', '2026082309'];
      for (const r of fake) mk(join(tmp, 'runs', r), { recursive: true });
      const res = PUB.prune(tmp, 4);
      const ok = res.kept.join(',') === fake.slice(0, 4).join(',')
        && res.dropped.join(',') === fake.slice(4).join(',')
        && PUB.runsIn(tmp).join(',') === fake.slice(0, 4).join(',');
      add('Retention behält die 4 NEUESTEN und nennt die entfernten',
        ok, `behalten [${res.kept.join(', ')}] · entfernt [${res.dropped.join(', ')}]`);
      rm(tmp, { recursive: true, force: true });
    }

    // ── Rechnen oder nicht: der Ausstieg des stündlichen Batches ──────────
    // Der Fall, der die Regel erzwungen hat, ist der dritte: am 2026-08-23 fing
    // der Producer den 21-UTC-Lauf, während das DWD ihn noch hochschob, und legte
    // 11 statt 13 Windschritten ab (fehlend 4 und 5 — im Nahbereich, den JEDER
    // Client lädt). Ein Ausstieg allein auf die Lauf-Kennung hätte diese Lücke
    // für die vollen drei Stunden festgeschrieben.
    {
      const PROD = await import('./repack-icon-d2.mjs');
      // BW-6b: generisch über Familien — `have`/`want` sind `{ familie: schrittzahl }`.
      const want = { wind: 13, temp: 25, gust: 25, thunder: 13, precip: 28 };
      const d = (haveRun, have) => PROD.skipDecision({ run: '2026082321', haveRun, have, want });
      add('Neuer Lauf → rechnen',
        d('2026082318', { ...want }).skip === false);
      add('Derselbe Lauf, vollständig abgelegt → aussteigen',
        d('2026082321', { ...want }).skip === true);
      const partial = d('2026082321', { ...want, wind: 11 });
      add('Derselbe Lauf, aber UNVOLLSTÄNDIG → nachrechnen statt Lücke festschreiben',
        partial.skip === false, partial.reason);
      add('Unbekannter Bestand (-1 oder fehlend) zählt nie als vollständig',
        d('2026082321', { ...want, gust: -1 }).skip === false
        && d('2026082321', { wind: 13, temp: 25 }).skip === false);
      const newFam = d('2026082321', { ...want, precip: 0 });
      add('Eine NEUE Familie, die im Bestand fehlt, erzwingt das Nachrechnen (BW-6b-Übergang)',
        newFam.skip === false && /precip 0\/28/.test(newFam.reason), newFam.reason);
      // Und der Workflow muss die Zahlen auch wirklich durchreichen — sonst ist
      // die Regel im Producer richtig und im Betrieb wirkungslos.
      const wf = rf('scripts/repack-repo/workflow-build.yml', 'utf8');
      add('Der Batch reicht Lauf UND Schrittzahlen JEDER Familie an den Producer durch',
        /REPACK_SKIP_IF_RUN:/.test(wf) && /REPACK_HAVE_STEPS:/.test(wf) && /steps\[k\] = v\.steps\.length/.test(wf),
        'workflow-build.yml');
    }

    // ── Der Force-Push ist die Stelle, an der etwas verschwinden KANN ──────
    // Ausgelöst von einem echten Vorfall am 2026-08-23: der Klon des Bestands
    // brach mit `RPC failed; curl 56 Recv failure` ab, das Skript las das als
    // „erster Publish" und baute einen Baum mit EINEM statt drei Läufen — im
    // Begriff, ihn über den Bestand zu force-pushen. Nur weil der Push in
    // derselben Störung hängenblieb, ist nichts verloren gegangen.
    // Geprüft wird deshalb an einem echten, aber LOKALEN Remote: netzfrei und
    // damit wiederholbar, anders als der Vorfall selbst.
    {
      const { mkdtempSync, rmSync: rm, cpSync: cp, mkdirSync: mk } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const { execFileSync } = await import('node:child_process');
      const root = mkdtempSync(join(tmpdir(), 'repack-remote-'));
      const OUT = process.env.REPACK_OUT || 'data/repack';
      const have = PUB.runsIn(OUT);

      const runPublish = (env) => {
        try {
          return {
            code: 0,
            out: execFileSync(process.execPath, ['scripts/publish-repack.mjs', '--push'],
              { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }),
          };
        } catch (e) { return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` }; }
      };

      // (a) Ist der Bestand unbekannt, wird NICHT gepusht — und zwar abgebrochen,
      // BEVOR ein Baum entsteht, der etwas ersetzen könnte.
      const blind = runPublish({
        REPACK_REPO: join(root, 'gibt-es-nicht.git'),
        REPACK_WORK: join(root, 'work-blind'),
      });
      add('Unerreichbares Remote → Abbruch VOR dem Bauen, kein Push',
        blind.code !== 0 && /Abbruch/.test(blind.out) && !/Baum fertig/.test(blind.out),
        `exit ${blind.code}`);

      // (b) Der Ablauf der Action, nachgestellt: erst drei Läufe ablegen, dann
      // so publizieren, wie sie es tut — nur der NEUESTE Lauf liegt lokal vor.
      // Die beiden anderen können also nur aus dem Klon kommen.
      if (have.length >= 3) {
        const bare = join(root, 'remote.git');
        execFileSync('git', ['init', '--bare', '--quiet', '--initial-branch=main', bare]);
        const treeOf = (runs, name) => {
          const t = join(root, name);
          mk(join(t, RM.RUNS_DIR), { recursive: true });
          for (const r of runs) cp(join(OUT, RM.RUNS_DIR, r), join(t, RM.RUNS_DIR, r), { recursive: true });
          if (existsSync(join(OUT, RM.HSURF_FILE))) cp(join(OUT, RM.HSURF_FILE), join(t, RM.HSURF_FILE));
          return t;
        };
        const first = runPublish({
          REPACK_OUT: treeOf(have.slice(0, 3), 'tree-all'),
          REPACK_REPO: bare, REPACK_WORK: join(root, 'work-1'), REPACK_KEEP: '4',
        });
        const second = runPublish({
          REPACK_OUT: treeOf([have[0]], 'tree-newest'),
          REPACK_REPO: bare, REPACK_WORK: join(root, 'work-2'), REPACK_KEEP: '2',
        });
        const tracked = execFileSync('git', ['-C', bare, 'ls-tree', '-r', '--name-only', 'main'], { encoding: 'utf8' });
        const inRepo = (r) => tracked.includes(`${RM.RUNS_DIR}/${r}/`);
        add('Ein Lauf, den dieser Publish NICHT gerechnet hat, überlebt ihn (Seed-Klon)',
          first.code === 0 && second.code === 0 && inRepo(have[1]),
          `${have[1]} lag nur im Remote → ${inRepo(have[1]) ? 'erhalten' : 'VERLOREN'} (exit ${first.code}/${second.code})`);
        add('Retention entfernt den ältesten Lauf wirklich aus dem GEPUSHTEN Baum',
          !inRepo(have[2]) && inRepo(have[0]),
          `[${have.join(', ')}] mit KEEP=2 → Remote führt [${have.filter(inRepo).join(', ')}]`);
      }
      rm(root, { recursive: true, force: true });
    }

    // ── Der Endpunkt, wenn er denn schon steht ─────────────────────────────
    // Kein Netz-Fehlschlag darf hier grün aussehen: „noch nicht abgelegt" wird
    // als eigene Zeile gesagt, nicht als bestandene Prüfung gezählt.
    if (process.env.REPACK_CHECK_CDN === '1') {
      // ⚠️ NICHT gegen den lokalen Baum prüfen. `repack:publish` OHNE `--push`
      // baut einen Index mit einem Commit, den es auf GitHub nie gab — die
      // CDN-Zeile stünde danach dauerhaft auf 404, ohne dass irgendetwas kaputt
      // wäre. Ein Test, der aus harmlosen Gründen rot ist, wird bald ignoriert.
      // Geprüft wird deshalb, was WIRKLICH liegt: der Index aus dem Daten-Repo.
      const live = await RM.fetchIndex();
      if (!live.ok) {
        add('Daten-Repo liefert seinen Index', false, live.note);
      } else {
        const lEntry = live.index.runs[0];
        const lWind = RM.sectionFor(lEntry, 'wind', live.index.commit);
        const lTemp = RM.sectionFor(lEntry, 'temp', live.index.commit);
        const stepFile = lWind.wind.steps[0].file;
        try {
          const res = await fetch(RM.stepUrl(lWind, stepFile));
          const body = res.ok ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
          add('jsDelivr liefert das Bild mit ACAO: * und unveränderlichem Cache',
            res.ok && res.headers.get('access-control-allow-origin') === '*'
              && /immutable/.test(res.headers.get('cache-control') ?? ''),
            `HTTP ${res.status} · ${res.headers.get('cache-control')}`);

          // ── Die Stelle, an der die Kette zugeht ────────────────────────
          // BW-1 hat bewiesen: Producer-Bytes == Client-Pfad. Bewiesen war
          // damit nur, was hier ENTSTEHT — nicht, was drüben ANKOMMT. Ein CDN,
          // das PNGs rekomprimiert oder einen früheren Stand ausliefert, wäre
          // stumm: die Karte zeichnete Wind, nur den falschen.
          const localPath = join(process.env.REPACK_OUT || 'data/repack', RM.RUNS_DIR, lEntry.run, stepFile);
          if (!existsSync(localPath)) {
            console.log(`⊘ Byte-Vergleich übersprungen: Lauf ${lEntry.run} liegt lokal nicht vor`);
          } else {
            const local = rf(localPath);
            add('Die ausgelieferten Bytes SIND die Producer-Bytes (Kette BW-1 → CDN)',
              body.length > 0 && body.equals(local),
              `${body.length} B empfangen, ${local.length} B lokal, ${body.equals(local) ? 'identisch' : 'ABWEICHEND'}`);
          }

          // Die Lauf-Unabhängigkeit von `hsurf` ist bis hier eine Behauptung des
          // Manifests (`scope: 'repo'`). Am Endpunkt ist sie prüfbar.
          const hRes = await fetch(RM.repoUrl(lTemp, lTemp.temp.hsurf.url), { method: 'HEAD' });
          add('hsurf ist unter dem lauf-unabhängigen Pfad abrufbar',
            hRes.ok && hRes.headers.get('access-control-allow-origin') === '*',
            `HTTP ${hRes.status} · ${lTemp.temp.hsurf.url}`);
        } catch (e) {
          add('jsDelivr liefert das Bild', false, `${e.message} · ${e.cause?.message ?? e.cause ?? 'ohne Ursache'}`);
        }
        // Und die Frage, die man sonst erst beim Debuggen stellt: zeigt der
        // LIVE-Index auf denselben Stand wie der letzte lokale Publish?
        const pubPath = join(process.env.REPACK_OUT || 'data/repack', 'published.json');
        if (existsSync(pubPath)) {
          const pub = JSON.parse(rf(pubPath, 'utf8'));
          add('Live-Index und letzter lokaler Push nennen denselben Commit',
            pub.commit === live.index.commit,
            `gepusht ${String(pub.commit).slice(0, 7)} · live ${String(live.index.commit).slice(0, 7)}`);
        }
      }
    } else {
      console.log('⊘ CDN-Abruf nicht geprüft (REPACK_CHECK_CDN=1 setzen, sobald das Daten-Repo steht)');
    }
  }

  // ── Die Caps des Producers gegen die des Clients ─────────────────────────
  // Der Plan warnt vor `verify:warm-budget`, das MAX_STEP per Regex aus den
  // Quellen liest. Hier zählt der SACHVERHALT dahinter: publiziert der Producer
  // weniger Schritte, als der Client anfragt, fällt der Rest still auf GRIB
  // zurück — die Ersparnis wäre kleiner als behauptet, ohne dass etwas bricht.
  // BW-6b: die Caps stehen in EINER Liste (`FAMILIES`), der Client hält sie je
  // Modul als Literal — hier gegeneinander, für JEDE Familie.
  const lit = (file, re) => Number((rf(file, 'utf8').match(re) ?? [])[1]);
  const clientCaps = {
    wind: lit('src/wind/iconD2WindSource.ts', /const MAX_STEP = (\d+);/),
    temp: lit('src/sources/iconD2TempSource.ts', /const MAX_STEP = (\d+);/),
    gust: lit('src/sources/iconD2GustSource.ts', /const MAX_STEP = (\d+);/),
    thunder: lit('src/sources/iconD2Thunder.ts', /const MAX_STEP = (\d+);/),
    rotation: lit('src/sources/iconD2Rotation.ts', /const MAX_STEP = (\d+);/),
    lightningfc: lit('src/sources/iconD2Lpi.ts', /const MAX_STEP = (\d+);/),
    snowDepth: lit('src/sources/iconD2Snow.ts', /const MAX_STEP = (\d+);/),
    snowFresh: lit('src/sources/iconD2Snow.ts', /const MAX_STEP = (\d+);/),
    precip: lit('src/sources/iconD2Precip.ts', /const PRECIP_MAX_STEP = (\d+);/),
    cape: lit('src/event/EventResult.tsx', /Math\.min\((\d+), Math\.max\(3, Math\.ceil\(hoursToEnd\)/),
  };
  const capDiff = Object.keys(RM.FAMILIES).filter((f) => RM.FAMILIES[f].maxStep !== clientCaps[f]);
  add('Producer-Caps == Client-Caps (alle Familien)',
    capDiff.length === 0,
    capDiff.length ? capDiff.map((f) => `${f}: Liste ${RM.FAMILIES[f].maxStep} ≠ Client ${clientCaps[f]}`).join(' · ')
      : Object.keys(RM.FAMILIES).map((f) => `${f} ${RM.FAMILIES[f].maxStep}`).join(' · '));
  // Der GRIB-Pfad des Niederschlags kappt an derselben Stelle (Literal im Aufruf).
  add('Niederschlag: Repack-Cap == Cap des GRIB-Pfads',
    lit('src/sources/iconD2Precip.ts', /maxStep: (\d+), nowOnly/) === RM.FAMILIES.precip.maxStep);
}

// ---------------------------------------------------------------------------
// (8) BW-3 — der CLIENT. Bewiesen ist jetzt, dass die Bytes stimmen (BW-1) und
//     dass sie am richtigen Lauf liegen (BW-2). Bleibt die dritte Frage: baut
//     der Client dieselben URLs, glaubt er dem Abschnitt nur für SEINEN Lauf,
//     und gibt er rechtzeitig auf? Alles davon ist rein prüfbar — der Bildlader
//     selbst braucht einen Browser und ist in §19.1 (BW-P) gemessen.
// ---------------------------------------------------------------------------
{
  const { existsSync, readFileSync: rf } = await import('node:fs');
  const { join } = await import('node:path');
  const RM = await import('./lib/repackManifest.mjs');
  const { subsampledCorners } = await import('../src/sources/gribDecode.ts');
  const WORK = process.env.REPACK_WORK || '.cache/repack-repo';
  const indexPath = join(WORK, 'index.json');

  // ── Der Schalter ──────────────────────────────────────────────────
  // BW-4 dreht ihn auf default-ON. Damit ist nicht mehr das Einschalten die
  // Zusage, sondern das Abschalten — wer den neuen Weg nicht will, muss ihn
  // sicher und dauerhaft loswerden können.
  add('Schalter ist default-on (ohne Query, ohne localStorage)',
    RS.repackFlagFrom('', null) === true);
  add('`?repack=0` schaltet ab, und die Query schlägt den Speicher in BEIDE Richtungen',
    RS.repackFlagFrom('?repack=0', null) === false
    && RS.repackFlagFrom('?repack=0', '1') === false
    && RS.repackFlagFrom('?repack=1', '0') === true
    && RS.repackFlagFrom('', '0') === false
    && RS.repackFlagFrom('', '1') === true
    && RS.repackFlagFrom('?lat=48&repack=0&z=6', null) === false);
  // Ein Kill-Switch, den die Karte beim ersten Kameraschwenk aus der URL wirft,
  // ist keiner: `WetterkarteRoute.tsx:105` schreibt die Query per replaceState
  // neu. `repack` muss das als unbekannter Key überleben.
  {
    const { parseMapSearch, buildMapUrl } = await import('../src/router/urlState.ts');
    const parsed = parseMapSearch('?lat=48.5&lon=9.2&z=7&repack=0', Date.now());
    const back = buildMapUrl(
      { primary: 'wind', layers: ['wind'], cam: parsed.cam }, Date.now(), '/wetterkarte', parsed.extra);
    add('`?repack=0` überlebt das Umschreiben der Karten-URL',
      parsed.extra.some(([k, v]) => k === 'repack' && v === '0') && back.includes('repack=0'), back);
  }
  add('ohne `window` (Node, SSR, Verifier) ist der Weg aus',
    RS.repackEnabled() === false && RS.repackUsable() === false);
  const st = RS.repackStatus();
  add('Sitzungsgedächtnis startet sauber', st.broken === false && st.loaded === 0);

  // ── Die Fristen ──────────────────────────────────────────────────────────
  // Sie existieren wegen EINER Messung: ein force-weggedrückter Commit
  // antwortete noch nach 19,9 s mit 200 (§21.6). Eine Frist, die darüber läge,
  // wäre keine.
  add('Erste Frist kürzer als die Schritt-Frist, beide deutlich unter 19,9 s',
    RS.FIRST_TIMEOUT_MS > 0 && RS.FIRST_TIMEOUT_MS < RS.STEP_TIMEOUT_MS && RS.STEP_TIMEOUT_MS < 19_900,
    `${RS.FIRST_TIMEOUT_MS} ms → ${RS.STEP_TIMEOUT_MS} ms`);

  // ── Der Service Worker ───────────────────────────────────────────────────
  // Die PNGs tragen einen Commit-SHA und `immutable` — der HTTP-Cache genügt.
  // Landeten sie zusätzlich im gedeckelten `bsc-data`, verdrängten sie per FIFO
  // die Wetterdaten, für die er gedacht ist (V-BW-7 in neuer Form).
  const sw = rf('public/sw.js', 'utf8');
  const swHost = /const DATA_CDN_HOST = '([^']+)'/.exec(sw)?.[1];
  add('Service Worker kennt GENAU den Host des Daten-CDNs',
    swHost === new URL(RM.CDN_BASE).hostname, `${swHost} vs. ${new URL(RM.CDN_BASE).hostname}`);
  const iPass = sw.indexOf('DATA_CDN_HOST) return;');
  const iResp = sw.indexOf('event.respondWith');
  add('… und reicht ihn durch, BEVOR irgendein Cache-Zweig greift',
    iPass > 0 && iResp > 0 && iPass < iResp, `Durchreichen@${iPass} < respondWith@${iResp}`);

  if (!existsSync(indexPath)) {
    add('Publisher-Baum für die Client-Prüfungen vorhanden', false,
      `${indexPath} fehlt — vorher \`npm run repack:publish\` laufen lassen`);
  } else {
    const index = JSON.parse(rf(indexPath, 'utf8'));
    const entry = index.runs[0];
    const wSec = RM.sectionFor(entry, 'wind', index.commit);
    const tSec = RM.sectionFor(entry, 'temp', index.commit);

    // ── Zwei Spiegel derselben Regel ───────────────────────────────────────
    // Producer und Client bauen die URL getrennt (Node vs. Browser). Weichen
    // sie ab, zeigt die Karte 404 statt Daten — und zwar erst in Produktion.
    const wParsed = RS.parseRepackSection(wSec, 'wind', entry.run);
    const tParsed = RS.parseRepackSection(tSec, 'temp', entry.run);
    add('Client nimmt den echten Abschnitt an (Wind und Temperatur)',
      !!wParsed && !!tParsed,
      `${wParsed?.wind?.steps.length ?? 0} Wind- / ${tParsed?.temp?.steps.length ?? 0} Temperaturschritte`);

    if (wParsed && tParsed) {
      const wf = wSec.wind.steps[0].file, tf = tSec.temp.steps[0].file;
      add('Schritt-URL des Clients == die des Producers',
        RS.stepUrl(wParsed, wf) === RM.stepUrl(wSec, wf)
        && RS.stepUrl(tParsed, tf) === RM.stepUrl(tSec, tf),
        RS.stepUrl(wParsed, wf).slice(0, 96) + '…');
      if (tSec.temp.hsurf) {
        add('hsurf-URL des Clients == die des Producers (ohne Lauf-Pfad)',
          RS.repoUrl(tParsed, tSec.temp.hsurf.url) === RM.repoUrl(tSec, tSec.temp.hsurf.url)
          && !RS.repoUrl(tParsed, tSec.temp.hsurf.url).includes(entry.run));
      }

      // Die Normierung ist die Nutzlast, nicht Zierat — sie muss unverändert
      // durch die Prüfung kommen, sonst zeichnet der Client fremde Windstärken.
      const a = wSec.wind.steps[0], b = wParsed.wind.steps[0];
      add('Wind-Normierung übersteht die Prüfung unverändert',
        a.uMin === b.uMin && a.uMax === b.uMax && a.vMin === b.vMin && a.vMax === b.vMax,
        `u ${b.uMin.toFixed(2)}…${b.uMax.toFixed(2)} m/s`);

      // Producer-Normierung == Client-Normierung. Wären es verschiedene
      // Konstanten, wäre JEDE Temperatur auf der Karte falsch — ohne Symptom.
      add('Temperatur-Skala im Abschnitt == die Konstanten des Clients',
        tParsed.temp.vMin === TEMP_VMIN && tParsed.temp.vMax === TEMP_VMAX
        && tParsed.temp.demMax === TEMP_DEM_MAX,
        `${tParsed.temp.vMin}…${tParsed.temp.vMax} °C · demMax ${tParsed.temp.demMax} m`);

      // ── Die Geometrie ────────────────────────────────────────────────────
      // Der Repack-Pfad holt KEIN GRIB mehr, nur um zu wissen, wo das Bild
      // liegt — er nimmt die Ecken aus dem Abschnitt. Stimmen die nicht mit
      // dem überein, was der GRIB-Pfad rechnet, liegt jeder Wert woanders als
      // heute (die Fehlerklasse aus `audit/karten-layer-verortung.md`).
      if (geomRef) {
        const c = subsampledCorners(geomRef.field, geomRef.ss);
        const lngX = (l) => (l + 180) / 360, latY = (l) => (90 - l) / 180;
        const want = [lngX(c[0][0]), latY(c[0][1]), lngX(c[1][0]), latY(c[2][1])];
        const got = RS.uvBoundsOf(tParsed);
        const dmax = Math.max(...want.map((v, i) => Math.abs(v - got[i])));
        add('uvBounds aus dem Abschnitt == uvBounds aus dem dekodierten Feld',
          dmax === 0, `größte Abweichung ${dmax} (Lauf ${geomRef.run})`);
      } else {
        add('uvBounds aus dem Abschnitt == uvBounds aus dem dekodierten Feld', false,
          'kein Referenzfeld — der Temperatur-Rundlauf ist nicht gelaufen');
      }
    }

    // ── Was der Client ABLEHNEN muss ───────────────────────────────────────
    // Jede dieser Zeilen ist ein stiller Fehler, wenn sie durchginge.
    const clone = () => JSON.parse(JSON.stringify(wSec));
    const bad = [
      ['fremder Lauf (Anti-Drift)', clone(), (x) => x, '1970010100'],
      ['fremde Schema-Version', (() => { const x = clone(); x.schema = 2; return x; })()],
      ['Basis ohne https', (() => { const x = clone(); x.base = 'http://example.invalid'; return x; })()],
      ['abgeschnittener Commit', (() => { const x = clone(); x.commit = 'abc123'; return x; })()],
      ['Dateiname mit Pfadwechsel', (() => { const x = clone(); x.wind.steps = [{ ...x.wind.steps[0], file: '../../etc/passwd.png' }]; return x; })()],
      ['Windschritt ohne Normierung', (() => { const x = clone(); x.wind.steps = [{ step: 0, file: 'wind-000.png', bytes: 1 }]; return x; })()],
      ['leere Schrittliste', (() => { const x = clone(); x.wind.steps = []; return x; })()],
      ['Gitter ohne Ecken', (() => { const x = clone(); delete x.grid.corners; return x; })()],
    ];
    for (const [name, obj, , runOverride] of bad) {
      add(`Client lehnt ab: ${name}`,
        RS.parseRepackSection(obj, 'wind', runOverride ?? entry.run) === null);
    }
    add('Client lehnt ab: gar kein Abschnitt (der Normalfall, §22.4)',
      RS.parseRepackSection(null, 'wind', entry.run) === null
      && RS.parseRepackSection(undefined, 'temp', entry.run) === null);
    add('Client lehnt ab: Abschnitt ohne die angefragte Familie',
      RS.parseRepackSection(wSec, 'temp', entry.run) === null
      && RS.parseRepackSection(tSec, 'wind', entry.run) === null);
  }
}

// ---------------------------------------------------------------------------
// (9) BW-6 — ALLE Wetterkarten-Layer (`audit/bandbreite.md` §25). Dieselbe
//     Beweiskette wie (3)/(7)/(8), je Familie: die Bytes, die Ablage, der Client.
//     Neu ist die Familie `precip`: volle Auflösung, kein Alpha, SEQUENZIELL —
//     ein Bild ist nur derselbe Wert, wenn seine Referenz (`ref`) der Schritt
//     ist, gegen den auch der GRIB-Pfad differenziert hätte.
// ---------------------------------------------------------------------------
{
  const { existsSync, readFileSync: rf } = await import('node:fs');
  const { join } = await import('node:path');
  const RM = await import('./lib/repackManifest.mjs');
  const PROD = await import('./repack-icon-d2.mjs');
  const SB = await import('../src/sources/scalarFrameBuild.ts');
  const { decodeGridStep } = await import('../src/sources/gribGridDecode.ts');
  const { decodeGrib2, gribCorners, subsampledCorners } = await import('../src/sources/gribDecode.ts');

  // ── EINE Familienliste ───────────────────────────────────────────────────
  const pf = Object.keys(RM.FAMILIES), cf = Object.keys(RS.REPACK_FAMILIES);
  add('Familienliste Producer == Familienliste Client (Schlüssel und Kanäle)',
    pf.length === cf.length && pf.every((f) => cf.includes(f) && RM.FAMILIES[f].channels === RS.REPACK_FAMILIES[f].channels),
    `${pf.length} Familien: ${pf.join(', ')}`);
  add('`latest-grib.json` bekommt alle Familien außer Wind, `latest-wind.json` nur Wind',
    RM.GRIB_FAMILIES.length === pf.length - 1 && !RM.GRIB_FAMILIES.includes('wind') && RM.familiesOf('wind').join() === 'wind');

  // ── Producer und Clients benutzen die GETEILTEN Bauschleifen ────────────
  const prodSrc = rf('scripts/repack-icon-d2.mjs', 'utf8');
  add('Producer importiert `scalarFrameBuild.ts` und `gribGridDecode.ts` (keine zweite Mathematik)',
    /from '\.\.\/src\/sources\/scalarFrameBuild\.ts'/.test(prodSrc) && /from '\.\.\/src\/sources\/gribGridDecode\.ts'/.test(prodSrc));
  const CLIENTS = {
    gust: ['src/sources/iconD2GustSource.ts', 'buildGustRgba'],
    thunder: ['src/sources/iconD2Thunder.ts', 'buildThunderRgba'],
    rotation: ['src/sources/iconD2Rotation.ts', 'buildRotationRgba'],
    lightningfc: ['src/sources/iconD2Lpi.ts', 'buildLpiRgba'],
    snowDepth: ['src/sources/iconD2Snow.ts', 'buildSnowDepthRgba'],
    snowFresh: ['src/sources/iconD2Snow.ts', 'buildSnowFreshRgba'],
  };
  for (const [f, [file, fn]] of Object.entries(CLIENTS)) {
    const src = rf(file, 'utf8');
    add(`Client ${f}: baut über \`${fn}\` und lädt über \`loadScalarStep(…, '${f}')\``,
      new RegExp(`\\b${fn}\\(`).test(src) && !/Math\.round\(clamp01/.test(src)
      && new RegExp(`loadScalarStep\\(section, (?:'${f}'|mode === 'depth' \\? 'snowDepth' : 'snowFresh'), step, signal\\)`).test(src),
      file);
    // H13 (BW-8): Nur-Jetzt-Fenster wie Wind/Temp/Böen — der Loader nimmt `nowOnly`
    // über `stepsForNowWindow`, sonst lädt jede Aktivierung alle 13/25 Schritte.
    add(`Client ${f}: Nur-Jetzt-Fenster über \`stepsForNowWindow\` (H13)`,
      /opts\?\.nowOnly \? stepsForNowWindow\(capped, runAt, opts\.aheadHours \?\? 0\) : capped/.test(src)
      && /import \{ stepsForNowWindow \} from '\.\/frameAtValidTime'/.test(src),
      file);
  }
  {
    const mv = rf('src/MapView.tsx', 'utf8');
    const passes = (mv.match(/\{ nowOnly: START_NOW_ONLY && !embedded, aheadHours: forecastAheadHRef\.current \}\); \/\/ H13/g) ?? []).length;
    add('MapView reicht `nowOnly` an Gewitter/Blitz/Schnee/Rotation durch (4 Aufrufstellen, H13)', passes === 4, `${passes}/4`);
    const widen = ['thunder', 'lightningfc', 'snow', 'rotation']
      .every((k) => new RegExp(`if \\(active\\.has\\('${k}'\\)\\) void install\\w+Ref\\.current\\?\\.\\(\\);`).test(mv));
    add('MapView erweitert das Fenster der vier Layer beim ersten Slider-Zug (H13)', widen);
  }
  {
    const src = rf('src/sources/iconD2Precip.ts', 'utf8');
    add('Client cape: nimmt die Familie über `loadGridStep(section, \'cape\', …)` und fällt als GANZES zurück',
      /loadGridStep\(section, 'cape', step, signal\)/.test(rf('src/sources/iconD2Cape.ts', 'utf8'))
      && /if \(!wanted\.every\(\(s\) => have\.has\(s\)\)\) return null;/.test(rf('src/sources/iconD2Cape.ts', 'utf8')));
    add('Client precip: prüft die Schrittfolge (`precipStepsUsable`) und fällt als GANZES auf GRIB zurück',
      /precipStepsUsable\(section, steps\)/.test(src) && /loadPrecipStep\(section, step, signal\)/.test(src)
      && /if \(failed \|\| signal\?\.aborted \|\| frames\.length === 0\) return null;/.test(src));
  }

  // ── Die Bytes, je Familie, über die Läufe aus (3) ────────────────────────
  const BUILD = {
    gust: (F, ss) => SB.buildGustRgba(F[0], ss),
    thunder: (F, ss) => SB.buildThunderRgba(F[0], F[1], F[2], ss),
    rotation: (F, ss) => SB.buildRotationRgba(F[0], F[1], F[2], ss),
    lightningfc: (F, ss) => SB.buildLpiRgba(F[0], ss),
    snowDepth: (F, ss) => SB.buildSnowDepthRgba(F[0], ss),
    snowFresh: (F, ss) => SB.buildSnowFreshRgba(F[0], F[1], F[2], ss),
  };
  let naiveScalarShown = false;
  for (const run of runs) {
    for (const f of Object.keys(BUILD)) {
      const fam = RM.FAMILIES[f];
      const steps = [...new Set(STEPS.map((s) => Math.max(s, fam.minStep)))];
      for (const step of steps) {
        let ok = false, detail = '';
        try {
          const prod = await PROD.repackScalarStep(f, run, step);
          const fields = await Promise.all(fam.params.map((p) => fetchField(urls.step(run, p, step))));
          const ss = Math.max(1, Math.ceil(fields[0].ni / TARGET_WIDTH));
          const ref = BUILD[f](fields, ss);
          add(`${f} ${run}+${step}: Producer-Bytes == geteilter Builder (G = B = 0)`,
            eq(prod.rgba, ref.rgba), firstDiff(prod.rgba, ref.rgba) ?? '');
          // Der Weg des BROWSERS: Grau expandiert auf R = G = B, dann `composeScalarRgba`.
          const dec = decodePng(prod.png);
          const browser = toRgba(dec);
          const hasValue = ref.rgba.some((v, i) => i % 4 === 0 && v !== 0);
          if (!naiveScalarShown && hasValue) {
            naiveScalarShown = true;
            add('Gegenprobe: ein Ein-Kanal-PNG ungefiltert durchreichen wäre NICHT byte-gleich',
              !eq(browser, ref.rgba), `${f} ${run}+${step}: Grau steht auch in G und B`);
          }
          const back = RS.composeScalarRgba(browser);
          ok = dec.channels === 2 && dec.width === ref.width && dec.height === ref.height && eq(back, ref.rgba);
          detail = firstDiff(back, ref.rgba) ?? `${ref.width}×${ref.height} = ${ref.rgba.length} Bytes identisch, ${(prod.png.length / 1024).toFixed(0)} KB`;
        } catch (e) { detail = e.message; }
        add(`${f} ${run}+${step}: PNG → Browser-Bytes → Client-Zusammensetzen ist BYTE-identisch`, ok, detail);
      }
    }

    // ── CAPE (BW-7a): instantan, volle Auflösung, `capeToU8` ────────────────
    for (const step of [0, 3]) {
      try {
        const prod = await PROD.repackGridStep('cape', run, step, null);
        const bytes = await PROD.fetchGrib(urls.step(run, 'cape_ml', step));
        const ref = decodeGridStep(bytes, null, false, 'cape');
        const dec = decodePng(prod.png);
        const browser = toRgba(dec);
        const back = new Uint8Array(dec.width * dec.height);
        for (let i = 0; i < back.length; i++) back[i] = browser[i * 4];
        add(`cape ${run}+${step}: PNG (1 Kanal, ${dec.width}×${dec.height}) → Browser-Bytes → values ist BYTE-identisch (kein ref)`,
          dec.channels === 1 && eq(back, ref.values) && prod.ref === undefined,
          firstDiff(back, ref.values) ?? `${back.length} Zellen, ${(prod.png.length / 1024).toFixed(0)} KB`);
      } catch (e) { add(`cape ${run}+${step}: Rundlauf`, false, e.message); }
    }

    // ── Niederschlag: die Kette 0 → 1 → 2 ───────────────────────────────────
    try {
      let prev = null, prevRaw = null;
      const chain = [];
      for (const step of [0, 1, 2]) {
        const prod = await PROD.repackPrecipStep(run, step, prev);
        const bytes = await PROD.fetchGrib(urls.step(run, 'tot_prec', step));
        const ref = decodeGridStep(bytes, prevRaw, true, 'precip');
        const dec = decodePng(prod.png);
        const browser = toRgba(dec);
        const back = new Uint8Array(dec.width * dec.height);
        for (let i = 0; i < back.length; i++) back[i] = browser[i * 4];
        add(`precip ${run}+${step}: PNG (1 Kanal, ${dec.width}×${dec.height}) → Browser-Bytes → values ist BYTE-identisch, ref = ${prod.ref}`,
          dec.channels === 1 && dec.width === 1215 && eq(back, ref.values) && prod.ref === (prev ? prev.step : null),
          firstDiff(back, ref.values) ?? `${back.length} Zellen, ${(prod.png.length / 1024).toFixed(0)} KB`);
        chain.push({ step, ref: prod.ref });
        prev = { step, rawValues: prod.rawValues };
        prevRaw = ref.rawValues;
        if (step === 0) {
          // Die Ecken im Abschnitt müssen BIT-gleich zu `gribCorners` sein — genau
          // die Funktion, die der GRIB-Pfad benutzt. `subsampledCorners(f, 1)` wäre
          // rechnerisch dasselbe und um Gleitkomma-Rauschen daneben (gemessen:
          // −3.9499999999999975 vs −3.95) — deshalb nimmt der Producer `gribCorners`.
          const field = decodeGrib2(bytes);
          const b = gribCorners(field);
          const sub = subsampledCorners(field, 1);
          const pg = PROD.precipGridOf(field);
          const g = pg.corners;
          add(`precip ${run}: Gitter des Producers == \`gribCorners\` des GRIB-Pfads (bit-gleich, ss = 1, ${pg.width}×${pg.height})`,
            pg.ss === 1 && pg.width === field.ni && pg.height === field.nj
            && [g.nw, g.ne, g.se, g.sw].every((c, i) => c[0] === b[i][0] && c[1] === b[i][1]),
            `${g.nw.join('/')} … ${g.se.join('/')}`);
          add(`precip ${run}: \`subsampledCorners(f, 1)\` wäre nur „gleich genug" (Gleitkomma-Rauschen)`,
            sub.every((c, i) => Math.abs(c[0] - b[i][0]) < 1e-9 && Math.abs(c[1] - b[i][1]) < 1e-9),
            `max Δ ${Math.max(...sub.flatMap((c, i) => [Math.abs(c[0] - b[i][0]), Math.abs(c[1] - b[i][1])])).toExponential(1)}°`);
        }
      }
      // Die Regel, an der der Client entscheidet — gegen genau diese Kette.
      const sec = { precip: { steps: chain.map((c) => ({ step: c.step, file: `precip-${String(c.step).padStart(3, '0')}.png`, bytes: 1, ref: c.ref })) } };
      add('precipStepsUsable: zusammenhängendes Fenster → Frames ab dem ZWEITEN Schritt (wie der GRIB-Pfad)',
        JSON.stringify(RS.precipStepsUsable(sec, [0, 1, 2])) === '[1,2]'
        && JSON.stringify(RS.precipStepsUsable(sec, [1, 2])) === '[2]');
      add('precipStepsUsable: Lücke im Fenster ⇒ KEIN Repack (die Rate wäre gegen den falschen Vorschritt)',
        RS.precipStepsUsable(sec, [0, 2]) === null);
      add('precipStepsUsable: fehlender Schritt in der Ablage ⇒ KEIN Repack',
        RS.precipStepsUsable(sec, [1, 2, 3]) === null);
      add('precipStepsUsable: ein einzelner Schritt ergibt kein Frame ⇒ null',
        RS.precipStepsUsable(sec, [1]) === null);
    } catch (e) {
      add(`precip ${run}: Kette 0 → 1 → 2 geprüft`, false, e.message);
    }
  }

  // ── Die Ablage und der Client — am Publisher-Baum ────────────────────────
  const WORK = process.env.REPACK_WORK || '.cache/repack-repo';
  const indexPath = join(WORK, 'index.json');
  if (!existsSync(indexPath)) {
    add('BW-6: Publisher-Baum für die Familien-Prüfungen vorhanden', false, `${indexPath} fehlt`);
  } else {
    const index = JSON.parse(rf(indexPath, 'utf8'));
    // Den Lauf nehmen, den DIESER Producer gerechnet hat — der Baum trägt auch
    // die Läufe des stündlichen Batches, und die kennen (bis BW-6 auf `main`
    // liegt) nur Wind und Temperatur. Gemessen: `runs[0]` war 2026082421 (Batch).
    const stateFile = join(process.env.REPACK_OUT || 'data/repack', 'state.json');
    const localRun = existsSync(stateFile) ? JSON.parse(rf(stateFile, 'utf8')).run : null;
    const entry = index.runs.find((r) => r.run === localRun) ?? index.runs[0];
    add('BW-6: Index führt den lokal produzierten Lauf', !!localRun && entry.run === localRun,
      `lokal ${localRun ?? '—'} · Baum [${index.runs.map((r) => r.run).join(', ')}]`);
    const present = RM.GRIB_FAMILIES.filter((f) => entry[f]?.steps?.length);
    add('Index-Eintrag führt die neuen Familien (BW-6b)',
      present.length === RM.GRIB_FAMILIES.length,
      `${present.length}/${RM.GRIB_FAMILIES.length}: ${present.join(', ')}`);
    const gSec = RM.sectionFor(entry, RM.GRIB_FAMILIES, index.commit);
    add('GRIB-Abschnitt trägt alle vorhandenen Familien und KEINEN Wind',
      !!gSec && present.every((f) => gSec[f]) && gSec.wind == null);
    add('sameSection erkennt eine Schrittzahl-Änderung in einer NEUEN Familie',
      !!gSec && !RM.sameSection(gSec, { ...gSec, gust: { ...gSec.gust, steps: gSec.gust.steps.slice(1) } }));
    for (const f of present) {
      const parsed = RS.parseRepackSection(gSec, f, entry.run);
      add(`Client nimmt den echten Abschnitt an: ${f}`,
        !!parsed && parsed[f].steps.length === entry[f].steps.length,
        `${entry[f].steps.length} Schritte`);
      if (parsed) {
        const file = parsed[f].steps[0].file;
        add(`Schritt-URL des Clients == die des Producers: ${f}`,
          RS.stepUrl(parsed, file) === RM.stepUrl(gSec, file) && /^https:\/\/cdn\.jsdelivr\.net\/gh\//.test(RS.stepUrl(parsed, file)));
        // Das Bild aus dem Baum dekodiert auf die Maße, gegen die der Client prüft.
        const grid = f === 'precip' ? parsed.precip.grid : f === 'cape' ? parsed.cape.grid : parsed.grid;
        const dec = decodePng(rf(join(WORK, entry.path, file)));
        add(`Bild im Baum hat die Maße des Abschnitts: ${f}`,
          dec.width === grid.width && dec.height === grid.height && dec.channels === RM.FAMILIES[f].channels,
          `${dec.width}×${dec.height}, ${dec.channels} Kanal/Kanäle`);
      }
    }
    // Was der Client ABLEHNEN muss — je eine Zeile, die sonst ein stiller Wertfehler wäre.
    const clone = () => JSON.parse(JSON.stringify(gSec));
    if (gSec?.gust) {
      add('Client lehnt ab: Skalen-Drift (Manifest nennt eine andere vMax als der Code)',
        RS.parseRepackSection((() => { const x = clone(); x.gust.vMax = x.gust.vMax + 1; return x; })(), 'gust', entry.run) === null);
      add('Client lehnt ab: falsche Kanalzahl einer Ein-Kanal-Familie',
        RS.parseRepackSection((() => { const x = clone(); x.gust.channels = 3; return x; })(), 'gust', entry.run) === null);
    }
    if (gSec?.precip) {
      add('Client lehnt ab: Niederschlag-Schritt ohne `ref` (Rate gegen unbekannten Vorschritt)',
        RS.parseRepackSection((() => { const x = clone(); x.precip.steps = x.precip.steps.map(({ ref, ...r }) => r); return x; })(), 'precip', entry.run) === null);
      add('Client lehnt ab: Niederschlag mit abgetastetem Gitter (ss ≠ 1)',
        RS.parseRepackSection((() => { const x = clone(); x.precip.grid.ss = 2; return x; })(), 'precip', entry.run) === null);
      add('Client lehnt ab: `ref` zeigt nach vorn oder auf sich selbst',
        (() => { const x = clone(); x.precip.steps = [{ ...x.precip.steps[1], ref: x.precip.steps[1].step }]; return RS.parseRepackSection(x, 'precip', entry.run) === null; })());
    }
  }
}

// ---------------------------------------------------------------------------
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
console.log(`\n${checks.length - failed.length}/${checks.length} Prüfungen bestanden`);
process.exit(failed.length ? 1 : 0);
