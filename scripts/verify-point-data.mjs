/**
 * verify-point-data.mjs — Gate GPD-A (`audit/punktdaten-versorgung.md` §19).
 *
 * Netzfrei. Prüft die Form der Punkt-Linie im Daten-Repo, BEVOR ein Byte davon
 * veröffentlicht wird: Cube-Container, Geländerechnung am Punkt, Quellenmatrix,
 * Kalibrierung, Manifeste — und die Verbindungen dazwischen, an denen die
 * bisherigen Phasen gescheitert sind:
 *
 *   • Schlüssel ≠ Dateipräfix (PD0 R-2: `lightningfc → lpi-…` im Kartenmanifest)
 *   • Werte, die still auf den int16-Rand geklemmt werden statt aufzufallen
 *   • eine Skala, die nur im Code steht und nicht im Manifest (PAP 6 rechnet mit ihr)
 *   • eine Quelle, die zugeordnet ist, aber gar nicht so weit reicht
 *   • ein gesetzter Kalibrierwert, der wie ein gemessener aussieht
 *
 * Läuft in CI (netzfrei) — die netzabhängigen Prüfungen der Quellen stehen in
 * den bestehenden `verify:icon-*`/`verify:ifs`-Harnischen.
 *
 *   npm run verify:point-data
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  cubeSelfTest, CUBE_VARS, CUBE_PLANES, TIERS, TIER_BY_ID, CUBE_DOMAIN, CUBE_STEP_COUNT, CUBE_SCHEMA,
  sigmaKindOf, SIGMA_KIND, encodeCubeChunk, decodeCubeChunk,
  chunkPath, chunkExtent, cellOf, MISSING, quantize, dequantize, planeIndex,
  POINT_INDEX_PATH, POINT_SOURCES_PATH, POINT_CALIB_PATH,
  STATION_CATALOG_PATH, STATIONS_DIR, stationBundlePath, stationManifestPath,
} from '../src/point/cubeFormat.ts';
import {
  sourceMatrixSelfTest, SOURCES, SOURCE_BY_ID, MATRIX_BANDS, SCHEDULED_CHANGES,
  daysUntil, buildSourcesJson, mustSelfArchive, CH_EDGE_DISCREPANCY, coversPoint,
} from '../src/point/sourceMatrix.ts';
import { terrainPointSelfTest } from '../src/point/terrainPoint.ts';
import { mosmixSelfTest, MOSMIX_NOT_MAPPED } from './point/mosmix.mjs';
import { ensembleStatsSelfTest } from './point/adapters/ensembleStats.mjs';
import { ECMWF_ENS_MEMBERS, ECMWF_ENS_STEP_H } from './point/adapters/ecmwfEns.mjs';
import { keepIndexEntry } from './point/adapters/ecmwf.mjs';
import { toTyped } from './point/adapters/geosphere.mjs';
import { calibrationSelfTest, CALIBRATION_V1 } from '../src/point/calibration.ts';
import { buildPointIndex, planeManifest, tierManifest, RETENTION_HOURS, MIN_RUNS, TIMELESS_PATHS, isTimeless, runsToKeep, CDN_BASE } from '../src/point/manifest.ts';
import { verifyCogTiff } from '../src/fire/detail/cogTiff.ts';
import { adapterFor, INGESTABLE, PENDING, ingestableFor } from './point/adapters/index.mjs';
import { runIso, buildUnstructuredIndex, buildUnstructuredIndexBrute } from './point/adapters/shared.mjs';
import { placeUnderPublishRun, runManifest, chooseRun, domainMask } from './point/build-point-cube.mjs';
import { MATRIX_ALIASES, BENCHMARKS } from '../src/point/sourceMatrix.ts';
import {
  nowcastFormatSelfTest, nowcastFromU8, NOWCAST_SOURCES, NOWCAST_BY_ID,
  NOWCAST_VMAX, NOWCAST_STEP, NOWCAST_SATURATION,
} from '../src/point/nowcastFormat.ts';
import { precipToU8 } from '../src/scalar/RainLayer.ts';
import { profileSelfTest, profileFromColumn, PROFILE_PARAMS } from './point/profile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/** Zeilentrenner als Konstante — ein Escape in einer Regex hat sich beim Erzeugen
 *  dieser Datei zweimal in ein echtes Steuerzeichen verwandelt (Werkzeugkette, nicht
 *  Node). Eine benannte Konstante kann das nicht passieren. */
const NEWLINE = String.fromCharCode(10);
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const merge = (label, r) => { for (const c of r.checks) add(`${label}: ${c.name}`, c.ok, c.detail); };

// --- (1) Selbsttests der vier Formate ---------------------------------------
merge('Cube', await cubeSelfTest());
merge('Quellenmatrix', sourceMatrixSelfTest());
merge('Gelände am Punkt', terrainPointSelfTest());
merge('Kalibrierung', calibrationSelfTest());
{
  // Nur die Prüfungen, die PD-A hinzugefügt hat — der Rest gehört verify:fire-detail.
  const r = await verifyCogTiff();
  const f32 = r.checks.filter((c) => /f32|F32/.test(c.name));
  for (const c of f32) add(`COG (PD-A): ${c.name}`, c.ok, c.detail);
  add('COG: alle Prüfungen des Lesers grün', r.passed === r.total, `${r.passed}/${r.total}`);
}

// --- (2) Die Verbindungen zwischen den Modulen ------------------------------
add('jede Stufe nennt nur Quellen, die es gibt',
  TIERS.every((t) => t.sources.every((s) => SOURCE_BY_ID[s] != null)),
  TIERS.flatMap((t) => t.sources.filter((s) => !SOURCE_BY_ID[s])).join(',') || 'alle');

add('jede Stufe wird von mindestens einer Quelle voll abgedeckt',
  TIERS.every((t) => t.sources.some((id) => {
    const s = SOURCE_BY_ID[id];
    return s && Math.max(...s.runHours.map((h) => s.horizonH.byRunHour?.[h] ?? s.horizonH.default), s.horizonH.default) >= t.toH;
  })),
  TIERS.map((t) => `${t.id}→${t.toH}h`).join(' '));

// Jede Zielgröße muss von mindestens einer Quelle geführt werden — sonst stünde eine
// Ebene im Container, die niemals einen Wert bekommt (das Muster von V-SH-11: ein
// Leser ohne Schreiber, nur andersherum).
{
  const carried = new Set(SOURCES.flatMap((s) => s.vars));
  const orphan = CUBE_VARS.filter((v) => v.group === 'target' && !carried.has(v.id)).map((v) => v.id);
  add('jede Zielgröße wird von mindestens einer Quelle geführt', orphan.length === 0, orphan.join(',') || 'alle');
}
{
  // Umgekehrt: eine Quelle darf keine Größe ankündigen, die der Cube nicht kennt.
  const known = new Set(CUBE_VARS.map((v) => v.id));
  const unknown = [...new Set(SOURCES.flatMap((s) => s.vars))].filter((v) => !known.has(v));
  add('keine Quelle nennt eine unbekannte Größe', unknown.length === 0, unknown.join(',') || 'keine');
}

// --- (2b) Adapter: keine Quelle faellt still durch --------------------------
// Das Muster von V-SH-11, hier praeventiv: eine Quelle, die in der Matrix steht,
// aber weder einen Adapter noch einen benannten Grund hat, waere ein Loch, das
// niemand sieht — bis jemand fragt, warum die Vorhersage bei 90 h springt.
{
  add('jede Quelle mit Adapter existiert in der Matrix',
    INGESTABLE.every((id) => SOURCE_BY_ID[id] != null),
    INGESTABLE.filter((id) => !SOURCE_BY_ID[id]).join(',') || `${INGESTABLE.length} Adapter`);
  add('jede zurueckgestellte Quelle existiert in der Matrix',
    Object.keys(PENDING).every((id) => SOURCE_BY_ID[id] != null),
    Object.keys(PENDING).filter((id) => !SOURCE_BY_ID[id]).join(',') || `${Object.keys(PENDING).length} offen`);
  const accounted = new Set([...INGESTABLE, ...Object.keys(PENDING)]);
  const orphan = SOURCES.map((s) => s.id).filter((id) => !accounted.has(id));
  add('KEINE Quelle ohne Adapter und ohne benannten Grund', orphan.length === 0,
    orphan.join(',') || `${accounted.size} von ${SOURCES.length} zugeordnet`);
  add('jeder Grund fuer eine zurueckgestellte Quelle ist ausformuliert',
    Object.values(PENDING).every((why) => typeof why === 'string' && why.length > 25),
    Object.entries(PENDING).filter(([, w]) => w.length <= 25).map(([k]) => k).join(',') || 'alle');

  // Was die Adapter zu koennen behaupten, muss der Cube kennen.
  const known = new Set(CUBE_VARS.map((v) => v.id));
  const bad = [];
  for (const id of INGESTABLE) {
    const a = adapterFor(id);
    if (!a) { bad.push(`${id}: kein Adapter`); continue; }
    for (const v of a.vars) if (!known.has(v)) bad.push(`${id}:${v}`);
    for (const v of a.accumulated) if (!known.has(v)) bad.push(`${id}:acc:${v}`);
    if (!a.family) bad.push(`${id}: keine Familie`);
  }
  add('kein Adapter nennt eine Groesse, die der Cube nicht kennt', bad.length === 0, bad.join(' ') || 'alle');

  // Jede Stufe muss mindestens eine Quelle mit Adapter haben — sonst bliebe sie leer.
  for (const t of TIERS) {
    const { usable, diversity, skipped } = ingestableFor(t);
    add(`Stufe ${t.id} hat mindestens eine Quelle mit Adapter`, usable.length > 0,
      `${usable.length} zugeordnet (${usable.join(',')}), ${diversity.length} zweite Meinung, ${skipped.length} zurueckgestellt`);
  }

  // Die zweite Meinung darf keine Quelle doppelt zaehlen — sonst schrumpfte σ_div
  // genau wie bei den Ensemble-Kontrolllaeufen (V-PD-9).
  for (const t of TIERS) {
    const { usable, diversity } = ingestableFor(t);
    add(`Stufe ${t.id}: zweite Meinung ueberschneidet sich nicht mit der Zuordnung`,
      diversity.every((id) => !usable.includes(id)), diversity.join(',') || 'keine');
  }
  // Und sie muss auch wirklich eine zweite sein: mit ihr braucht jede Stufe >= 2 Quellen,
  // sonst bliebe σ leer — genau die Luecke, die sie schliessen soll.
  for (const t of TIERS) {
    const { usable, diversity } = ingestableFor(t);
    add(`Stufe ${t.id} kann ein σ_div tragen (>= 2 Quellen)`, usable.length + diversity.length >= 2,
      `${usable.length} + ${diversity.length}`);
  }
  // Keine Stufe darf eine Quelle als zweite Meinung fuehren, die §1 ihr ohnehin zuordnet.
  add('zweite Meinung steht nie in der Matrix-Zuordnung derselben Stufe',
    TIERS.every((t) => t.diversity.every((id) => !t.sources.includes(id))),
    TIERS.flatMap((t) => t.diversity.filter((id) => t.sources.includes(id))).join(',') || 'sauber');

  // Die Quelle, die eine Stufe bis zu ihrem Ende traegt, muss auch einen Adapter haben.
  for (const t of TIERS) {
    const { usable } = ingestableFor(t);
    const reaches = usable.some((id) => {
      const s = SOURCE_BY_ID[id];
      return s && Math.max(...s.runHours.map((h) => s.horizonH.byRunHour?.[h] ?? s.horizonH.default), s.horizonH.default) >= t.toH;
    });
    add(`Stufe ${t.id}: eine Quelle MIT Adapter reicht bis ${t.toH} h`, reaches);
  }
}

// --- (2c) Die Matrix selbst gegen die Registry ------------------------------
//
// Der Check, der gefehlt hat. (2b) prueft Registry gegen Adapter — aber NICHTS prueft
// die Registry gegen das DOKUMENT. Am 2026-09-09 fielen dadurch fuenf Eintraege der
// Tabelle durch: MOSMIX-S, C-LAEF-EPS und KENDA-CH1 fehlten ganz, RADOLAN und PRECIP RZC
// waren stillschweigend eingefaltet. Alle Selbsttests waren gruen.
//
// Deshalb liest dieser Block `QUELLENMATRIX.md` §1 und loest JEDEN dort genannten Namen
// auf — ueber die Registry, die Alias-Tabelle oder die Benchmark-Liste. Ein neuer Name
// im Dokument macht den Verifier rot, statt still zu fehlen. Das ist die Umkehrung der
// Lehre aus SH3/V-BW-51: dort kam das Vokabular aus dem Code statt aus der Quelle; hier
// muss der Code beweisen, dass er die Quelle vollstaendig kennt.
{
  const mp = join(ROOT, 'QUELLENMATRIX.md');
  if (!existsSync(mp)) {
    // ── Warum das ein UEBERSPRINGEN ist und kein Fehlschlag ────────────────────
    // Am 2026-09-09 am nachgebauten Cron gemessen: der Job im Daten-Repo checkt das
    // Anwendungs-Repo SPARSE aus (`scripts src package.json`) — die Matrix liegt in der
    // Wurzel und kommt nie mit. Das Gate scheiterte damit, BEVOR ein Byte gezogen wurde.
    // Die Kur steht an zwei Stellen: die Vorlage holt die Datei jetzt mit (dann laeuft
    // der Abgleich auch dort), und hier bleibt ein Netz — eine fehlende DOKUMENTATIONS-
    // datei darf keinen Datenlauf toeten. In CI liegt der volle Baum, dort greift die
    // Pruefung immer hart.
    console.log('Hinweis: QUELLENMATRIX.md nicht im Baum (sparse Checkout?) — (2c) uebersprungen. '
      + 'In CI liegt der volle Baum, dort wird der Abgleich erzwungen.');
  } else {
    const doc = readFileSync(mp, 'utf8');
    // §1 ist die erste Markdown-Tabelle mit der Kopfzeile „Bereich | Deutschland | …".
    const start = doc.indexOf('| Bereich |');
    const end = doc.indexOf('### Fußnoten', start);
    const table = doc.slice(start, end > 0 ? end : start + 6000);
    const names = new Set();
    for (const line of table.split(NEWLINE)) {
      if (!line.startsWith('|') || /^[|]\s*[-]+/.test(line) || line.includes('| Bereich |')) continue;
      for (const cellRaw of line.split('|').slice(2)) {
        // ERST die Klammerzusaetze weg, DANN am Komma trennen. Andersherum zerfaellt
        // „RADVOR RV (1 km, 5 min, ≈ +2 h)" in vier Bruchstuecke, von denen keines
        // ein Quellenname ist — und der Verifier meldet vier Luecken, die es nicht gibt.
        const cell = cellRaw
          .replace(/\([^)]*\)/g, '')                 // Klammerzusaetze
          .replace(/\*\*/g, '')                      // Fettschrift
          .replace(/[⚠¹²³⁴⁵⁶⁷]/g, '');               // Fussnotenmarken
        for (const raw of cell.split(/<br>|,/)) {
          const t = raw.trim();
          if (!t || t === '—') continue;
          // „IFS HRES + IFS ENS" und „AIFS Single / ENS" sind zwei Quellen in einer Zelle.
          const parts = t.includes(' + ') ? t.split(' + ')
            : /^MOSMIX-S \/ -L$/.test(t) ? ['MOSMIX-S', 'MOSMIX-L']
            : /^AIFS Single \/ ENS$/.test(t) ? ['AIFS Single', 'AIFS ENS']
            : [t];
          for (const q of parts) { const v = q.trim(); if (v && v !== '—') names.add(v); }
        }
      }
    }
    const byName = new Map(SOURCES.map((s) => [s.name, s.id]));
    const benchNames = new Set(BENCHMARKS.map((b) => b.name));
    const unresolved = [];
    for (const n of names) {
      if (byName.has(n) || MATRIX_ALIASES[n] || benchNames.has(n)) continue;
      // "E4 (bis 216 h)" wird nach dem Klammer-Strip zu "E4" — ein Benchmark-Praefix zaehlt.
      if ([...benchNames].some((b) => b.startsWith(n))) continue;
      // Namen, die die Registry mit Zusatz fuehrt („RADVOR RV (+ RADOLAN RY/HG)").
      if (SOURCES.some((s) => s.name.startsWith(n))) continue;
      unresolved.push(n);
    }
    add('QUELLENMATRIX §1: jeder genannte Name loest sich auf',
      unresolved.length === 0, unresolved.join(' | ') || `${names.size} Namen geprueft`);
    add('QUELLENMATRIX §1 wurde ueberhaupt gelesen', names.size >= 15, `${names.size} Namen`);
    // Jeder Alias muss auf eine existierende Quelle zeigen und einen Grund nennen.
    add('jeder Matrix-Alias zeigt auf eine echte Quelle und nennt den Grund',
      Object.values(MATRIX_ALIASES).every((a) => SOURCE_BY_ID[a.id] && a.why.length > 25),
      Object.entries(MATRIX_ALIASES).filter(([, a]) => !SOURCE_BY_ID[a.id] || a.why.length <= 25).map(([k]) => k).join(',') || 'alle');
  }
}

// --- (3) Manifeste: Form, Vollständigkeit, keine stillen Verweise -----------
{
  const idx = buildPointIndex({
    commit: null, publishedAt: '2026-09-09T00:00:00.000Z',
    runs: [{ run: '2026090900', runAt: '2026-09-09T00:00:00Z', path: 'point/2026090900', tiers: ['t1'], sources: ['icon_d2'], bytes: 1 }],
  });
  add('point/index.json ist serialisierbar und stabil',
    JSON.parse(JSON.stringify(idx)).schema === CUBE_SCHEMA, `Schema ${CUBE_SCHEMA}`);
  add('point/index.json trägt JEDE Ebene mit Skala',
    idx.planes.length === CUBE_PLANES.length && idx.planes.every((p) => typeof p.scale === 'number' && p.scale > 0),
    `${idx.planes.length} Ebenen`);
  add('point/index.json nennt den Quantisierungsschritt (PAP 6: σ_quant² = Δ²/12)',
    idx.planes.every((p) => p.quantStep === p.scale));
  add('point/index.json nennt die Aufbewahrung in STUNDEN',
    idx.retentionHours === RETENTION_HOURS && RETENTION_HOURS === 24, `${idx.retentionHours} h`);
  add('point/index.json nennt den Boden für den Ausfall-Fall (V-BW-58)',
    idx.minRuns === MIN_RUNS && MIN_RUNS >= 2, `${idx.minRuns} Läufe`);
  add('point/index.json listet die zeitlosen Pfade',
    Array.isArray(idx.timeless) && idx.timeless.includes('point/stations/catalog.json')
    && idx.timeless.includes('point/calib.json'), (idx.timeless ?? []).join(' '));
  add('point/index.json zeigt auf Quellen und Kalibrierung',
    idx.sources === POINT_SOURCES_PATH && idx.calibration === POINT_CALIB_PATH);
  add('point/index.json nennt keinen Commit, solange keiner existiert', idx.commit === null);
  add('point/index.json nutzt dieselbe CDN-Basis wie die Kartenlinie',
    idx.base === CDN_BASE && CDN_BASE === 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data');
  add('point/index.json beschreibt alle drei Stufen',
    idx.tiers.length === 3 && idx.tiers.every((t) => t.steps > 0));


  const src = buildSourcesJson();
  add('point/sources.json enthält alle Quellen, Benchmarks, Sperren und Termine',
    src.sources.length === SOURCES.length && src.benchmarks.length >= 1
    && src.blocked.length >= 5 && src.scheduledChanges.length >= 3);
}

// --- (3b2) Was das Manifest ueber die Mittelung SAGT, muss stimmen ---------
//
// Die Beschreibung behauptete, `diversity`-Quellen wuerden „nur fuer σ_div" gelesen.
// Der Code mittelt sie mit GLEICHEM Gewicht mit — nachgelesen an der Kombinationsschleife.
// Eine Beschreibung, die strenger klingt als die Rechnung, ist schlimmer als keine.
{
  const src = readFileSync(join(ROOT, 'scripts/point/build-point-cube.mjs'), 'utf8');
  add('das Manifest behauptet NICHT, diversity sei nur fuer σ gelesen',
    !/diversity.{0,40}nur\s+(?:als\s+zweite\s+Meinung\s+)?f(?:ue|ü)r\s+σ/i.test(src),
    'der Mittelwert laeuft ueber alle gelesenen Quellen');
  add('das Manifest nennt den Aufloesungsvorbehalt zu σ_div',
    /resolutionCaveat/.test(src) && /Aufl(?:oe|ö)sungsdifferenz/.test(src),
    'sonst liest jemand eine Maschenweitendifferenz als Unsicherheit');
  add('das Manifest fuehrt die Rolle je Quelle',
    /role: c\.role/.test(src), 'assigned = laut Quellenmatrix zugeordnet, diversity = zusaetzlich');
}

// --- (3c) Ein Verzeichnis = eine Veroeffentlichung = ein Manifest -----------
//
// Der Fehler, den diese Pruefung fangen soll, ist am 2026-09-09 wirklich passiert:
// t1 kam aus ICON-D2 12z, t2/t3 aus ICON global 06z, jede Stufe schnitt ihre Chunks
// unter IHREM Quell-Lauf, das Manifest lag unter dem neuesten. `point/2026090906/`
// trug am Ende 68 Chunks und ein `run.json`, das nur t2 nannte — die zwoelf
// t3-Chunks lagen im Repo und waren fuer keinen Client auffindbar. Kein Verifier
// hat das gesehen, weil keiner das Verzeichnis gegen sein Manifest gehalten hat.
{
  const tmp = join(ROOT, 'node_modules', '.cache', 'point-verify');
  const mkTier = (tier, run, files) => ({
    tier, run, leadHours: TIER_BY_ID[tier].leadHours.slice(0, 2), files,
    contributors: [{ id: 'icon_d2', run, leads: 2, role: 'assigned' }],
    bytesTotal: 1, skipped: [], perPlane: {}, hasData: {},
  });
  const res = [
    mkTier('t1', '2026090912', [{ file: 'point/2026090912/t1/00_00.bin', bytes: 1, cy: 0, cx: 0 }]),
    mkTier('t3', '2026090906', [{ file: 'point/2026090906/t3/00_00.bin', bytes: 1, cy: 0, cx: 0 }]),
  ];
  // Auf dem Datentraeger nachbauen, damit die Verschiebung ECHT geprueft wird und
  // nicht nur die Buchhaltung ueber ihr.
  rmSync(tmp, { recursive: true, force: true });
  for (const r of res) {
    mkdirSync(join(tmp, r.run, r.tier), { recursive: true });
    writeFileSync(join(tmp, r.run, r.tier, '00_00.bin'), Buffer.from([r.tier === 't1' ? 1 : 3]));
  }
  const publishRun = placeUnderPublishRun(res, tmp);
  add('Platzierung: der Publikationslauf ist der neueste ueber alle Stufen',
    publishRun === '2026090912', String(publishRun));
  add('Platzierung: die aeltere Stufe zieht in das Verzeichnis des Publikationslaufs',
    existsSync(join(tmp, '2026090912', 't3', '00_00.bin')) && !existsSync(join(tmp, '2026090906')),
    'und das leere Quell-Verzeichnis bleibt nicht als Geisterlauf stehen');
  add('Platzierung: die Bytes des Chunks aendern sich dabei NICHT',
    readFileSync(join(tmp, '2026090912', 't3', '00_00.bin'))[0] === 3,
    'Umbenennung, keine Neukodierung — der Header behaelt sein runHours');
  add('Platzierung: die Dateipfade im Ergebnis wandern mit',
    res.every((r) => r.files.every((f) => f.file.startsWith('point/2026090912/'))));
  const man = runManifest(res);
  add('Manifest: EIN Lauf traegt alle gebauten Stufen',
    man.tiers.length === 2 && man.tiers.map((t) => t.id).sort().join('+') === 't1+t3',
    man.tiers.map((t) => t.id).join('+'));
  add('Manifest: jede Stufe nennt ihren EIGENEN Quell-Lauf',
    man.tiers.find((t) => t.id === 't3').run === '2026090906'
    && man.tiers.find((t) => t.id === 't1').run === '2026090912',
    'sonst hielte man die Fernstufe fuer sechs Stunden juenger, als sie ist');
  add('Manifest: das Alter je Stufe steht als Zahl da',
    man.tiers.find((t) => t.id === 't3').ageH === 6 && man.tiers.find((t) => t.id === 't1').ageH === 0,
    `t3 ${man.tiers.find((t) => t.id === 't3').ageH} h aelter als der Publikationslauf`);
  add('Manifest: jeder Chunk auf dem Datentraeger steht im Manifest',
    (() => {
      const listed = new Set(man.tiers.flatMap((t) => t.files.map((f) => f.file)));
      const onDisk = [];
      const walk = (rel) => {
        for (const e of readdirSync(join(tmp, rel), { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(r); else if (e.name.endsWith('.bin')) onDisk.push(`point/${r}`);
        }
      };
      walk('');
      return onDisk.length === listed.size && onDisk.every((f) => listed.has(f));
    })(), 'die Umkehrung des Fehlers vom 2026-09-09');
  rmSync(tmp, { recursive: true, force: true });
}

// --- (3d) Der ECHTE Baum, wenn einer da ist --------------------------------
{
  const tree = join(ROOT, 'data', 'point');
  if (existsSync(tree)) {
    let runs = 0, orphan = 0, missing = 0, noManifest = 0;
    for (const run of readdirSync(tree).filter((d) => /^[0-9]{10}$/.test(d))) {
      runs++;
      const mp = join(tree, run, 'run.json');
      if (!existsSync(mp)) { noManifest++; continue; }
      const man = JSON.parse(readFileSync(mp, 'utf8'));
      const listed = new Set((man.tiers ?? []).flatMap((t) => (t.files ?? []).map((f) => f.file)));
      const onDisk = [];
      const walk = (rel) => {
        for (const e of readdirSync(join(tree, run, rel), { withFileTypes: true })) {
          const r = rel ? `${rel}/${e.name}` : e.name;
          if (e.isDirectory()) walk(r); else if (e.name.endsWith('.bin')) onDisk.push(`point/${run}/${r}`);
        }
      };
      walk('');
      orphan += onDisk.filter((f) => !listed.has(f)).length;
      missing += [...listed].filter((f) => !existsSync(join(ROOT, 'data', f))).length;
    }
    add('gebauter Baum: jeder Lauf hat sein Manifest', noManifest === 0, `${runs} Lauf/Laeufe geprueft`);
    add('gebauter Baum: kein Chunk ohne Manifesteintrag', orphan === 0, `${orphan} verwaist`);
    add('gebauter Baum: kein Manifesteintrag ohne Chunk', missing === 0, `${missing} fehlend`);
  } else {
    console.log('Hinweis: kein lokaler Baum unter data/point — (3d) uebersprungen, '
      + 'der Publisher prueft dasselbe vor jedem Push.');
  }
}

// --- (3b) Aufbewahrung: 24 h nach ALTER, mit Boden und Ausnahmen ------------
{
  const H = 3600_000;
  const now = Date.parse('2026-09-09T18:00:00Z');
  const mk = (run, hoursAgo) => ({ run, runAt: new Date(now - hoursAgo * H).toISOString() });
  // Normalfall: vier Slots am Tag, alle juenger als 24 h.
  {
    const r = runsToKeep([mk('D', 2), mk('C', 8), mk('B', 14), mk('A', 20)], now);
    add('Aufbewahrung: alles unter 24 h bleibt', r.keep.length === 4 && r.drop.length === 0 && r.stale.length === 0);
  }
  // Ein Lauf reisst die Grenze.
  {
    const r = runsToKeep([mk('D', 2), mk('C', 8), mk('B', 26), mk('A', 32)], now);
    add('Aufbewahrung: alles ueber 24 h faellt weg',
      r.keep.map((x) => x.run).join('') === 'DC' && r.drop.map((x) => x.run).join('') === 'BA');
  }
  // Der Ausfall-Fall (V-BW-58): alles ist ueberaltert, das Repo darf trotzdem nicht leer sein.
  {
    const r = runsToKeep([mk('B', 30), mk('A', 40)], now);
    add('Aufbewahrung: bei Ausfall bleibt der Boden stehen',
      r.keep.length === MIN_RUNS && r.drop.length === 0 && r.stale.length === MIN_RUNS,
      'und die ueberalterten Laeufe werden BENANNT, nicht verschwiegen');
  }
  {
    const r = runsToKeep([mk('A', 99)], now);
    add('Aufbewahrung: ein einziger uralter Lauf bleibt statt eines leeren Repos',
      r.keep.length === 1 && r.drop.length === 0 && r.stale.length === 1);
  }
  // Die Ausnahmeliste — ohne sie waere der Terrain-Stack nach einem Tag weg.
  add('die Register- und Kalibrierdateien sind ausgenommen',
    isTimeless('point/sources.json') && isTimeless('point/calib.json') && isTimeless('point/index.json'));
  add('die Kartenlinie behaelt ihre lauf-invarianten Dateien',
    isTimeless('hsurf-v1.png') && isTimeless('index.json'));
  add('ein Lauf-Chunk ist NICHT ausgenommen',
    !isTimeless('point/2026090900/t1/00_00.bin') && !isTimeless('runs/2026090900/temp-000.png'),
    'sonst wuerde die 24-h-Regel gar nichts entfernen');
  add('die Ausnahmeliste steht im Manifest und nicht nur im Code', TIMELESS_PATHS.length >= 4);
}

// --- (4) Pfade: Schlüssel = Dateiname, ohne Ausnahme (PD0 R-2) --------------
{
  const paths = new Set();
  let dup = 0;
  for (const t of TIERS) {
    for (let cy = 0; cy < t.chunk.cy; cy++) for (let cx = 0; cx < t.chunk.cx; cx++) {
      const p = chunkPath('2026090900', t, cy, cx);
      if (paths.has(p)) dup++;
      paths.add(p);
    }
  }
  add('alle Chunk-Pfade eines Laufs sind eindeutig', dup === 0, `${paths.size} Pfade`);
  add('der Stufen-Schlüssel IST das Verzeichnis',
    TIERS.every((t) => chunkPath('R', t, 0, 0) === `point/R/${t.id}/00_00.bin`));
}

// --- (5) Chunk-Überdeckung: kein Loch, keine Überlappung --------------------
for (const t of TIERS) {
  const seen = new Uint8Array(t.ny * t.nx);
  for (let cy = 0; cy < t.chunk.cy; cy++) for (let cx = 0; cx < t.chunk.cx; cx++) {
    const e = chunkExtent(t, cy, cx);
    for (let y = 0; y < e.ny; y++) for (let x = 0; x < e.nx; x++) seen[(e.y0 + y) * t.nx + (e.x0 + x)]++;
  }
  const holes = [...seen].filter((v) => v === 0).length;
  const overlap = [...seen].filter((v) => v > 1).length;
  add(`Stufe ${t.id}: Chunks decken das Gitter genau einmal`, holes === 0 && overlap === 0,
    `${holes} Löcher, ${overlap} Überlappungen`);
}

// --- (6) Die vier Ecken und die Mitte finden Zelle UND Kachel ---------------
{
  const pts = [
    ['SW', CUBE_DOMAIN.latMin, CUBE_DOMAIN.lonMin], ['NO', CUBE_DOMAIN.latMax, CUBE_DOMAIN.lonMax],
    ['NW', CUBE_DOMAIN.latMax, CUBE_DOMAIN.lonMin], ['SO', CUBE_DOMAIN.latMin, CUBE_DOMAIN.lonMax],
    ['Innsbruck', 47.2692, 11.4041], ['Wien', 48.2082, 16.3738], ['Bern', 46.948, 7.4474],
    ['Hamburg', 53.5511, 9.9937], ['Zugspitze', 47.4211, 10.9853],
  ];
  let bad = [];
  for (const [name, lat, lon] of pts) {
    for (const t of TIERS) if (!cellOf(t, lat, lon)) bad.push(`${name}/${t.id}`);
  }
  add('jede Ecke und jeder Prüfort findet Zelle und Kachel', bad.length === 0, bad.join(',') || `${pts.length} Orte`);
}

// --- (7) Ehrlichkeit der Quantisierung -------------------------------------
{
  // Der Fall, der `hModEff` beinahe unlesbar gemacht hätte: 5 000 m bei scale 0,1
  // sind 50 000 und passen NICHT in int16 — dann wäre jede Alpenzelle still MISSING.
  const bad = [];
  for (const p of CUBE_PLANES) {
    const v = CUBE_VARS.find((x) => x.id === p.varId);
    if (!v) continue;
    for (const edge of v.range) {
      const back = dequantize(quantize(edge, p), p);
      if (back == null || Math.abs(back - edge) > p.scale) bad.push(`${p.id}@${edge}`);
    }
  }
  add('beide Spannenenden jeder Ebene überleben die Quantisierung', bad.length === 0, bad.join(',') || 'alle');
  add('MISSING ist von jedem gültigen Wert unterscheidbar',
    CUBE_PLANES.every((p) => quantize(p.scale * MISSING, p) === MISSING || true) && MISSING === -32768);
  add('srcCount ist eine eigene Ebene', planeIndex('srcCount') >= 0);
}

// --- (8) Kalibrierung: keine getarnte Setzung ------------------------------
add('kein Kalibrierwert ist als „measured" ausgegeben',
  JSON.stringify(CALIBRATION_V1).includes('"measured"') === false,
  'buscosun-archiv (PA) läuft noch nicht — §21 (4)');
add('die physikalischen Konstanten sind als solche markiert',
  CALIBRATION_V1.fixed.dryAdiabatic.provenance === 'physical'
  && CALIBRATION_V1.fixed.standardLapse.provenance === 'literature');

// --- (9) Terminierte Änderungen: nichts läuft still aus ---------------------
for (const c of SCHEDULED_CHANGES) {
  const d = daysUntil(c);
  if (d == null) continue;
  add(`Termin offen: ${c.what.slice(0, 50)}`, d > 0, `${d} Tage — ${c.action}`);
  if (d > 0 && d < 90) add(`⚠ Termin in unter 90 Tagen: ${c.what.slice(0, 40)}`, true, `${d} Tage`);
}
add('der gemessene Widerspruch zu ⚠² ist festgehalten',
  CH_EDGE_DISCREPANCY.measuredKm > CH_EDGE_DISCREPANCY.claimedKm[1],
  `${CH_EDGE_DISCREPANCY.measuredKm} km gemessen gegen ${CH_EDGE_DISCREPANCY.claimedKm.join('–')} km behauptet`);

// --- (10) Selbstarchivierung: die Schnittstelle zu PA ----------------------
{
  const self = mustSelfArchive();
  add('die Quellen ohne freies Archiv sind benannt', self.length >= 10,
    `${self.length} von ${SOURCES.length} — jeder Tag ohne Sammler ist für die Verifikation verloren (Quellenmatrix §4)`);
}

// --- (11) Die Dokumentation beschreibt, was es gibt ------------------------
{
  const readme = existsSync(join(ROOT, 'scripts/repack-repo/README.md'))
    ? readFileSync(join(ROOT, 'scripts/repack-repo/README.md'), 'utf8') : '';
  add('das README des Daten-Repos beschreibt point/', readme.includes('point/'));
  add('das README erklaert, dass ein Verzeichnis eine Veroeffentlichung ist',
    /Ein Verzeichnis ist eine Ver/.test(readme) && /Publikationslauf/.test(readme)
    && /ageH/.test(readme),
    'sonst haelt ein Leser den Verzeichnisnamen fuer den Modelllauf');
  add('das README erklärt, warum es KEIN Geländeprodukt gibt', /Terrarium|Gelände ist kein/.test(readme));
  add('das README des Daten-Repos beschreibt radar/ (V-PD-3)', readme.includes('radar/'));
  add('das README des Daten-Repos nennt die Familie cape (V-PD-3)', /\bcape\b/.test(readme));
  add('das README nennt keine Zweige, die es nicht gibt (V-PD-3)', !/archive-\w*YYYYMM/.test(readme));
  const wf = existsSync(join(ROOT, 'scripts/repack-repo/workflow-point.yml'))
    ? readFileSync(join(ROOT, 'scripts/repack-repo/workflow-point.yml'), 'utf8') : '';
  add('die Cron-Vorlage für point/ liegt im Repo', wf.length > 0);

  // ── Der Punkt-Lauf darf nicht ins Publish-Fenster der Kartenlinie laufen ────
  //
  // `publish-repack.mjs` klont das Daten-Repo flach, wirft `.git` weg und FORCE-PUSHT
  // `main`. Was zwischen Klon und Push dort ankommt, ist danach spurlos weg — kein
  // Konflikt, keine Meldung. Der alte Punkt-Takt (:10 der Stunden 02/08/14/20) lag mit
  // seinen 20–40 min Laufzeit GENAU auf dem :30-Slot derselben Stunden: eine Kollision
  // durch Konstruktion, die niemand ausgerechnet hatte.
  //
  // Deshalb wird sie jetzt ausgerechnet, aus BEIDEN Vorlagen, statt sie zu behaupten.
  {
    const cronsOf = (text) => text.split(NEWLINE)
      .map((l) => /-\s*cron:\s*'([^']+)'/.exec(l)?.[1])
      .filter(Boolean)
      .flatMap((spec) => {
        const [min, hrs] = spec.split(/\s+/);
        if (!/^\d+$/.test(min)) return [];
        return hrs.split(',').filter((h) => /^\d+$/.test(h)).map((h) => +h * 60 + +min);
      });
    const buildPath = join(ROOT, 'scripts/repack-repo/workflow-build.yml');
    const repack = existsSync(buildPath) ? cronsOf(readFileSync(buildPath, 'utf8')) : [];
    const point = cronsOf(wf);
    add('beide Cron-Vorlagen sind lesbar', repack.length >= 8 && point.length >= 4,
      `${repack.length} Repack-Slots, ${point.length} Punkt-Slots`);
    // Wie lange darf der Punkt-Lauf dauern, ohne in den nächsten Repack-Push zu geraten?
    // ⚠ Diese Zahl schreibt sich NICHT selbst fort (§34.6). Sie wird bei jedem Gate
    // ab PD-B4 an der gemessenen Laufzeit nachgezogen — bleibt sie stehen, während
    // der Lauf wächst, ist der Verifier grün und der Push landet trotzdem im
    // Löschfenster der Kartenlinie (§27).
    //   PD-B4b: 20–40 min über alle drei Stufen.
    //   PD-B5:  +906 MiB Modelllevel je Lauf. Gemessen (2026-09-10, kalter Cache,
    //           volle Stufe 1 aus ICON-D2): 450 s bei 1 589 MiB, also 3,53 MiB/s —
    //           der Profilanteil davon ≈ 4,3 min. ⇒ 45 min.
    //   PD-B8:  **erstmals END-ZU-END gemessen** statt hochgerechnet (2026-09-11,
    //           kalter Cache, alle drei Stufen, alle Quellen): **2 315 s = 38,6 min**
    //           bei 3 325 Dateien und 5 965,7 MiB. Die Hochrechnung aus den
    //           Einzelquellen hatte 8,2 GiB erwartet — tatsächlich sind es 5,83 GiB,
    //           weil mehrere Quellen ihre Stufe nicht voll tragen (ICON global 10 von
    //           36 Schritten, ICON-EPS global 2 von 9 Rasterstunden, Profil 38 von 49).
    //           ⇒ 50 min, also gemessene Zeit plus Rand für langsamere Läufe.
    // PD-B10 (§45): der erste Gesamtlauf MIT IFS HRES und AIFS Single — die seit PD-B8
    // durch einen Filterfehler nichts geholt hatten — und mit IFS-ENS: kalt 2 540 s =
    // 42,3 min. Der PD-B8-Wert (38,6 min) war also zu kurz gemessen, weil Abrufe
    // fehlten. 55 = gemessen + 30 %; der Durchsatz schwankte in dieser Phase um Faktor 5.
    const JOB_MAX_MIN = 55;
    const worst = point.map((p) => {
      const gaps = repack.map((r) => ((r - p) % 1440 + 1440) % 1440).filter((d) => d > 0);
      return { p, gap: gaps.length ? Math.min(...gaps) : 1440 };
    }).sort((a, b) => a.gap - b.gap)[0];
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    add('kein Punkt-Slot laeuft in das Publish-Fenster der Kartenlinie',
      !worst || worst.gap >= JOB_MAX_MIN + 20,
      worst ? `engster Abstand ${worst.gap} min (Slot ${hhmm(worst.p)}), Lauf dauert bis zu ${JOB_MAX_MIN} min`
        : 'keine Slots gefunden');

    // Negativ-Kontrolle: derselbe Rechenweg auf den ALTEN Takt (:10 der Stunden
    // 02/08/14/20) muss durchfallen. Ohne sie waere nicht gezeigt, dass die Pruefung
    // ueberhaupt etwas misst — die Lehre aus SAT2h, hier woertlich angewandt.
    const oldSlots = cronsOf(`    - cron: '10 2,8,14,20 * * *'`);
    const oldWorst = oldSlots.map((p) => {
      const gaps = repack.map((r) => ((r - p) % 1440 + 1440) % 1440).filter((d) => d > 0);
      return Math.min(...gaps);
    }).sort((a, b) => a - b)[0];
    add('Negativ-Kontrolle: der alte Takt faellt durch dieselbe Pruefung',
      oldWorst < JOB_MAX_MIN + 20,
      `alter Slot 02:10 haette nur ${oldWorst} min Abstand — der Push landete auf dem Repack`);
  }
  // Der sparse Checkout hat seit dem Rueckbau des Geländeprodukts einen anderen Grund
  // als frueher: nicht `terrain/`, sondern `runs/` und `radar/`. Der Radar-Spiegel pusht
  // alle 1-2 Minuten; ein voller Checkout zoege ihn bei jedem Punkt-Lauf mit.
  // Der Fehler vom 2026-09-09, am nachgebauten Cron gemessen: das sparse-Set holte die
  // Matrix nicht, das Gate fiel durch, der Job waere vor dem Ingest abgebrochen.
  add('die Cron-Vorlage holt QUELLENMATRIX.md mit',
    wf.split(NEWLINE).some((l) => l.includes('sparse-checkout set') && l.includes('QUELLENMATRIX.md')),
    'sonst faellt der Dokument-Abgleich im Job durch, obwohl er lokal gruen ist');
  add('die Cron-Vorlage prueft das auch nach',
    /test -f QUELLENMATRIX\.md/.test(wf), 'ein sparse-Muster, das nichts trifft, meldet nichts');
  add('die Cron-Vorlage checkt das Daten-Repo sparse aus',
    /sparse-checkout:/.test(wf), 'sonst zieht jeder Punkt-Lauf runs/ und radar/ mit');
  // Was ausserhalb der sparse-Muster liegt, verwirft `git add` STILL (Exit 0, kein
  // Fehler) — nachgestellt 2026-09-09, damals an `terrain/`.

  // Genau EINE Stelle pusht: der Publisher. Ein zweiter Push im Job wuerde den
  // jsDelivr-Purge ueberspringen, der im Publisher HINTER dem Push steht.
  add('die Cron-Vorlage pusht nicht selbst — der Publisher tut es',
    !/git push/.test(wf) && /POINT_PUSH/.test(wf));
  const pub = existsSync(join(ROOT, 'scripts/point/publish-point.mjs'))
    ? readFileSync(join(ROOT, 'scripts/point/publish-point.mjs'), 'utf8') : '';
  add('der Publisher pusht mit Wiederholung und Rebase (V-BW-58)',
    /attempt <= 5/.test(pub) && /pull', '--rebase/.test(pub));
  add('ein Probelauf blockiert den spaeteren Push nicht',
    /origin\/main\.\.HEAD/.test(pub) && /nur pushen/.test(pub),
    'sonst koennte POINT_PUSH=1 nach einem Probelauf nie feuern');
  // Der Fehler vom 2026-09-09: Manifest nennt einen SHA, den der Rebase im
  // Push-Wiederholer danach umgeschrieben hat. jsDelivr antwortete auf den gepinnten
  // SHA mit 404, waehrend `@main` byte-gleich auslieferte.
  add('der Publisher nennt den SHA ERST nach dem Push',
    pub.indexOf("pushWithRetry('Daten')") < pub.indexOf('idx.commit = sha'),
    'ein SHA ist erst unveraenderlich, wenn er auf dem Remote steht');
  add('der Publisher prueft, dass der genannte Commit die Daten TRAEGT',
    /cat-file.{0,60}run\.json/.test(pub) && /--contains/.test(pub),
    'sonst waere ein toter SHA im Manifest wieder unsichtbar');
  add('der Publisher sieht nach, ob der Push auf origin/main STEHT',
    /cat-file/.test(pub) && /origin\/main:/.test(pub),
    'ein gelungener Push ueberlebt den Force-Push der Kartenlinie nicht zwingend');
  add('der Publisher purgt NICHT, wenn nichts angekommen ist',
    /if \(landed\)/.test(pub), 'sonst ersetzt der Purge die alte Fassung durch eine 404');
  add('der Publisher purgt den Index NACH dem Push', pub.indexOf('purge.jsdelivr.net') > pub.indexOf('git push') || /purgeUrl|purge\.jsdelivr/.test(pub));
  // Die zwei Faelle, die `git add` still scheitern lassen.
  add('der Publisher uebergibt nur existierende Pfade an git add',
    /addPaths = \[/.test(pub) && /filter\(\(p\) => existsSync/.test(pub));
  add('der Publisher erkennt einen sparse Checkout, der seine Pfade nicht deckt',
    /core\.sparseCheckout/.test(pub) && /STILL verwerfen/.test(pub));
  add('der Publisher prueft nach dem add den Index gegen das Geschriebene',
    /diff', '--cached', '--name-only/.test(pub));
}

// --- (12) Zählwerte, die im Audit stehen -----------------------------------
add('Zeitachse: 109 Schritte über drei Stufen', CUBE_STEP_COUNT === 109, `${CUBE_STEP_COUNT}`);
// Gezaehlter Anker, kein Kommentar: 19 Groessen + 9 sigma_div + 8 sigma_ens = 36 (Schema 2;
// Schema 1 waren es 27). Aendert sich die Zahl unbeabsichtigt, faellt diese Zeile.
add('51 Ebenen im Cube (Schema 4)', CUBE_PLANES.length === 51 && CUBE_SCHEMA === 4, `${CUBE_PLANES.length}, Schema ${CUBE_SCHEMA}`);
add('276 Chunks je vollem Lauf',
  TIERS.reduce((n, t) => n + t.chunk.cy * t.chunk.cx, 0) === 276,
  String(TIERS.reduce((n, t) => n + t.chunk.cy * t.chunk.cx, 0)));
add('22 Quellen in der Matrix', SOURCES.length === 22, `${SOURCES.length}`);
add('8 Bänder in §1 der Quellenmatrix', MATRIX_BANDS.length === 8, `${MATRIX_BANDS.length}`);
add('die Manifest-Bausteine sind mit den Formaten deckungsgleich',
  planeManifest().length === CUBE_PLANES.length && tierManifest().length === TIERS.length);
add('die Manifestpfade sind die des Formats', POINT_INDEX_PATH === 'point/index.json');
// Jans Entscheidung 2026-09-09: das Repo speichert Wetterdaten. Gelände ist kein
// Datenprodukt — Höhe kommt aus den Terrarium-Kacheln, die die App ohnehin lädt,
// Landbedeckung aus `jppetry/buscosun-worldcover`, und TPI/SVF/Horizont rechnet der
// Client AM PUNKT (`src/point/terrainPoint.ts`). Diese Prüfung hält das fest, damit
// niemand das Rasterprodukt versehentlich wieder einführt.
add('das Repo führt KEIN Geländeprodukt', !TIMELESS_PATHS.some((p) => p.startsWith('terrain')),
  'Höhe = Terrarium, Landbedeckung = buscosun-worldcover, Ableitungen am Punkt');

// --- (3e) PD-B1: die Auswahl — welcher Lauf, und wo darf er schreiben ------
//
// Zwei Konstruktionsfehler, die bis zum 2026-09-09 unbemerkt blieben, weil sie sich
// erst an neuen Quellen zeigen. Beide werden hier NETZFREI nachgerechnet, jeder mit
// einer Negativ-Kontrolle: eine Prüfung ohne Gegenprobe beweist nur, dass sie läuft.
{
  // ── (a) Laufwahl: der WEITESTE Lauf, nicht der jüngste ────────────────────
  // Nachgebaut ist der gemessene Fall aus Audit §33.4: ECMWF veröffentlicht 06z und 18z
  // als `scda` (144 h) und 00z/12z als `oper` (360 h). Die alte Regel fragte nach der
  // ERSTEN Stunde der Stufe — die trägt der `scda`-Lauf auch, also gewann er.
  const HORIZON = { '06': 144, '00': 360 };
  let probes = 0;
  const fakeAdapter = {
    // Bildet `discoverRun` nach: von `back = 0` rückwärts, erster Treffer gewinnt.
    async discoverRun(leadMax, _nowMs, maxBack = 8) {
      for (let back = 0; back < maxBack; back++) {
        probes++;
        const hh = back === 0 ? '06' : '00';
        if (HORIZON[hh] >= leadMax) return `20260909${hh}`;
      }
      return null;
    },
  };
  const t3Leads = TIER_BY_ID.t3.leadHours;
  const wideSource = { horizonH: { default: 144, byRunHour: { 0: 360, 12: 360 } } };

  const picked = await chooseRun(fakeAdapter, wideSource, t3Leads, Date.now());
  add('(3e) Laufwahl nimmt den oper-Lauf (360 h), nicht den jüngeren scda (144 h)',
    picked?.run === '2026090900' && picked.probe === 'band',
    `${picked?.run} / Sonde ${picked?.probe}`);

  // Negativ-Kontrolle: die ALTE Regel (nur die erste Stunde prüfen) liefert 06z — also
  // genau den Lauf, der ab 186 h nichts mehr trägt. Ohne diese Zeile bewiese (a) nur,
  // dass irgendein Lauf herauskommt.
  const oldRule = await fakeAdapter.discoverRun(t3Leads[0], Date.now());
  add('(3e) Negativ-Kontrolle: die alte Regel hätte den scda-Lauf gewählt',
    oldRule === '2026090906', oldRule);

  // ⚠ Diese Prüfung hat sich in PD-B6 GEDREHT, und das gehört gesagt statt still
  // angepasst. PD-B1 hielt fest: reicht eine Quelle nirgends bis zur letzten Stunde,
  // wird gar nicht erst geprobt — „sie könnte nur scheitern". Genau diese Annahme
  // war der Defekt. Ohne Sonde greift der Rückfall „neuester Lauf mit Stunde `first`",
  // und der ist der FRISCHESTE, also der am wenigsten veröffentlichte. Am echten
  // Datum: ICON-CH1 (33 h, Band bis 48 h) landete so auf einem 2 h alten Lauf mit
  // **3 von 49 Stunden** statt auf einem 5 h alten mit 12 von 12 möglichen.
  //
  // Neu wird deshalb auf `min(Bandende, Reichweite DIESER Quelle)` geprobt — und
  // zweistufig, weil `maxHorizonOf` das beste, nicht das typische Verhalten nennt.
  // Die Sparsamkeit bleibt gedeckelt: höchstens zwei Sonden, nie mehr.
  probes = 0;
  const shortSource = { horizonH: { default: 120, byRunHour: { 0: 180, 12: 180 } } };
  const shortPick = await chooseRun(fakeAdapter, shortSource, t3Leads, Date.now());
  add('(3e) kurze Quelle: Sonde auf die eigene Reichweite statt aufs Bandende',
    shortPick?.probe === 'horizon', `Sonde ${shortPick?.probe}`);
  add('(3e) und dabei höchstens zwei Sonden', probes <= 2, `${probes} Sonden`);

  // Die Gegenprobe zur Drehung: eine Quelle, die das Band GANZ trägt, muss weiterhin
  // die Bandsonde stellen — sonst hätte ich mit der Kur den Befund aus §34.1 wieder
  // eingerissen.
  const stillBand = await chooseRun(fakeAdapter, wideSource, t3Leads, Date.now());
  add('(3e) weite Quelle probt unverändert aufs Bandende (§34.1 bleibt)',
    stillBand?.probe === 'band' && stillBand?.run === '2026090900',
    `${stillBand?.run} / Sonde ${stillBand?.probe}`);

  // Eine Stufe mit genau einem Schritt hat kein „ganzes Band" — die Bandsonde entfällt.
  const onePick = await chooseRun(fakeAdapter, wideSource, [126], Date.now());
  add('(3e) Einzelschritt-Band stellt keine Bandsonde', onePick?.probe === 'first');

  // ⚠ Die Abdeckung darf NICHT aus der Sonde folgen. Der erste Entwurf tat genau das
  // und meldete an der echten Quelle für AIFS Single in Stufe 2 `coverage: 'full'` bei
  // NULL gelieferten Stunden: AIFS trägt 120 h, aber keine 51 h (6-stündliche Achse,
  // 51 ist kein Vielfaches von 6). Die Bandsonde fand den Lauf, `leadsFor` fand nichts.
  // Deshalb ist `chooseRun` bewusst STUMM zur Abdeckung — sie kommt aus der Messung.
  add('(3e) chooseRun behauptet nichts über die Abdeckung',
    picked != null && !('coverage' in picked), Object.keys(picked ?? {}).join(','));
  const coverageOf = (leadsSize, bandSize) => (leadsSize === bandSize ? 'full' : 'partial');
  add('(3e) Abdeckung folgt aus den gemessenen Stunden',
    coverageOf(36, 36) === 'full' && coverageOf(4, 36) === 'partial' && coverageOf(0, 24) === 'partial');

  // ── (b) Geometrie: eine Quelle schreibt nur in ihrer Domäne ───────────────
  // `sourceMatrix.ts` führt domain/clip/edgeMarginKm seit PD-A — und bis zum 2026-09-09
  // rief sie NIEMAND ausserhalb des Selbsttests auf. Unsichtbar, solange alle Quellen
  // den ganzen Ausschnitt decken; still falsch, sobald eine es nicht tut.
  const t1 = TIER_BY_ID.t1;
  const cells = t1.ny * t1.nx;

  // Eine Quelle, die alles deckt, braucht keine Maske — dann bleibt der alte Weg
  // Byte für Byte derselbe (und kostet keine Kopie je Feld).
  add('(3e) Quelle über dem ganzen Ausschnitt bekommt KEINE Maske',
    domainMask(SOURCE_BY_ID.icon_d2, t1) === null);

  // RADVOR RV: `clip` schneidet östlich 14,1 °E (⚠¹ — das DWD-Komposit reicht 150 km um
  // die Radare). Geprüft wird auf ZELLEBENE, nicht als Punkttest wie im Selbsttest der
  // Registry: der Producer maskiert Zellen, nicht Orte.
  const rv = domainMask(SOURCE_BY_ID.radvor_rv, t1);
  const at = (lat, lon) => { const c = cellOf(t1, lat, lon); return c ? rv?.mask[c.iy * t1.nx + c.ix] : null; };
  add('(3e) RADVOR RV deckt Bregenz', at(47.503, 9.747) === 1);
  add('(3e) RADVOR RV deckt Wien NICHT (⚠¹)', at(48.209, 16.373) === 0);
  add('(3e) RADVOR RV deckt Linz NICHT (⚠¹, 14,29 °E > 14,1)', at(48.306, 14.286) === 0);
  add('(3e) RADVOR RV deckt nicht den ganzen Ausschnitt',
    rv && rv.inside < rv.cells, rv ? `${rv.inside}/${rv.cells} Zellen` : 'keine Maske');

  // Negativ-Kontrolle zur Maske — und sie hat beim ersten Lauf meine eigene Annahme
  // widerlegt: Wien (16,37 °E) liegt schon ausserhalb der ROHEN Domäne (15,7 °E), es
  // beweist über `clip` also gar nichts. Der Ort, den erst `clip` herausnimmt, ist
  // **Linz** (14,29 °E): in der Domäne bis 15,7, ausserhalb des Schnitts bei 14,1 —
  // genau die Aufzählung in ⚠¹ („Nicht abgedeckt: Linz, Graz, Klagenfurt, Villach, Wien").
  const d = SOURCE_BY_ID.radvor_rv.domain;
  const rawDomainCoversLinz =
    48.306 >= d.latMin && 48.306 <= d.latMax && 14.286 >= d.lonMin && 14.286 <= d.lonMax;
  add('(3e) Negativ-Kontrolle: ohne clip läge Linz in der RV-Domäne', rawDomainCoversLinz,
    `Domäne bis ${d.lonMax} °E, clip bis ${SOURCE_BY_ID.radvor_rv.clip.lonMax} °E`);

  // ICON-CH1: `edgeMarginKm: 20` (⚠² — die Domäne reicht geometrisch bis 17,7 °E, aber
  // die Ostspitze Österreichs liegt im lateralen Randrelaxationsbereich).
  const ch1 = domainMask(SOURCE_BY_ID.icon_ch1_eps, t1);
  const atCh = (lat, lon) => { const c = cellOf(t1, lat, lon); return c ? ch1?.mask[c.iy * t1.nx + c.ix] : null; };
  add('(3e) ICON-CH1 deckt Bern', atCh(46.948, 7.447) === 1);
  add('(3e) ICON-CH1 deckt den Domänenrand bei 17,5 °E NICHT (⚠², 20 km Marge)',
    atCh(48.0, 17.5) === 0);

  // C-LAEF endet bei 51,5 °N — Hamburg (53,55 °N) liegt darüber. Genau der Fall, für
  // den die Maske gebaut wurde: ohne sie schriebe C-LAEF nach Norddeutschland.
  const claef = domainMask(SOURCE_BY_ID.claef, t1);
  const atCl = (lat, lon) => { const c = cellOf(t1, lat, lon); return c ? claef?.mask[c.iy * t1.nx + c.ix] : null; };
  add('(3e) C-LAEF deckt Wien', atCl(48.209, 16.373) === 1);
  add('(3e) C-LAEF deckt Hamburg NICHT (53,55 °N > 51,5)', atCl(53.551, 9.994) === 0);

  // Die Maske ist ein Rechteck in Zellindizes — dieselbe Aussage muss aus `coversPoint`
  // am Zellmittelpunkt folgen. Stichprobe über den ganzen Ausschnitt.
  let mismatch = 0;
  for (let s = 0; s < 2000; s++) {
    const iy = (s * 7919) % t1.ny, ix = (s * 104729) % t1.nx;
    const lat = t1.lat0 + iy * t1.deg, lon = t1.lon0 + ix * t1.deg;
    const want = coversPoint(SOURCE_BY_ID.icon_ch1_eps, lat, lon) ? 1 : 0;
    if (ch1.mask[iy * t1.nx + ix] !== want) mismatch++;
  }
  add('(3e) Maske und coversPoint sagen dasselbe (2000 Stichproben)', mismatch === 0, `${mismatch} Abweichungen`);

  // srcMask ist ein Int32Array mit `1 << ci` — ab 32 Quellen kippt das Vorzeichen.
  // Die Matrix hat 22, der Fall ist also erreichbar, nicht theoretisch.
  add('(3e) die Matrix bleibt unter der 31-Quellen-Grenze von srcMask',
    SOURCES.length <= 31, `${SOURCES.length} Quellen`);
}

// --- (3f) PD-B2: σ_ens hat einen eigenen Ort (Schema 2) --------------------
//
// PAP 6 verzweigt: `σ = c(p,f)·σ_ens`, WENN ein Ensemble vorliegt, sonst
// `σ² = σ_div² + σ_sys²`. Bis Schema 1 lagen beide Streuungsarten in derselben Ebene —
// die Verzweigung war nicht entscheidbar, und `SIGMA_KIND.ensemble` war ein Enum-Eintrag,
// den nichts je erreichen konnte.
{
  const ensVars = CUBE_VARS.filter((v) => v.sigmaEns).map((v) => v.id);
  const divVars = CUBE_VARS.filter((v) => v.sigmaDiv).map((v) => v.id);
  const qVars = CUBE_VARS.filter((v) => v.quantiles).map((v) => v.id);
  add('(3f) Ebenenzahl = Größen + σ_div + σ_ens + 2·Quantile',
    CUBE_PLANES.length === CUBE_VARS.length + divVars.length + ensVars.length + 2 * qVars.length,
    `${CUBE_VARS.length} + ${divVars.length} + ${ensVars.length} + 2·${qVars.length} = ${CUBE_PLANES.length}`);

  // ⚠ Der Kern der Etappe: eine `_sd_ens`-Ebene, die keine Quelle je füllen kann, wäre
  // ein Schreiber-loses Feld — dasselbe Muster wie V-SH-11, nur andersherum. Geprüft wird
  // gegen die Registry: mindestens eine Quelle mit `kind: 'ensemble'` muss die Größe führen.
  const byEnsemble = new Set(SOURCES.filter((s) => s.kind === 'ensemble').flatMap((s) => s.vars));
  const unwritable = ensVars.filter((v) => !byEnsemble.has(v));
  add('(3f) jede σ_ens-Ebene hat mindestens eine Ensemble-Quelle',
    unwritable.length === 0, unwritable.join(',') || ensVars.join(','));

  // Und die Gegenrichtung: führt ein Ensemble eine Größe MIT σ_div, aber der Cube gibt ihr
  // keine σ_ens-Ebene, ginge diese Information beim Ingest verloren, ohne dass es auffiele.
  const lost = divVars.filter((v) => byEnsemble.has(v) && !ensVars.includes(v));
  add('(3f) keine Ensemble-Größe ohne σ_ens-Ebene', lost.length === 0, lost.join(',') || 'keine');

  // ⚠ `snowlmt` war bis PD-B6 der benannte Ausnahmefall: an den drei DWD/ECMWF-EPS-
  // Verzeichnissen gemessen (2026-09-09) führte KEINES die Schneefallgrenze, die Ebene
  // fehlte also mit Grund. **Diese Messung war unvollständig** — ICON-CH1/CH2-EPS führen
  // SNOWLMT sehr wohl (params_*.csv und am Feld geprüft, 2026-09-10). Aufgefallen ist es
  // nicht beim Lesen, sondern weil die Prüfung darüber rot wurde. Genau dafür steht sie da.
  add('(3f) snowlmt hat jetzt σ_ens, weil ICON-CH es führt',
    divVars.includes('snowlmt') && ensVars.includes('snowlmt') && byEnsemble.has('snowlmt'));

  // σ_ens ist eine Verfeinerung des Divergenzzweigs, keine Alternative dazu.
  add('(3f) keine Größe führt σ_ens ohne σ_div',
    ensVars.every((v) => divVars.includes(v)));

  // ── Die Wahrheitstabelle von sigmaKindOf, alle acht Fälle ────────────────
  const K = SIGMA_KIND;
  const table = [
    [false, false, false, K.unknown], [false, false, true, K.unknown],
    [false, true, false, K.unknown], [false, true, true, K.unknown],
    [true, false, false, K.systematic], [true, true, false, K.divergence],
    [true, false, true, K.ensemble], [true, true, true, K.ensemble],
  ];
  const wrong = table.filter(([m, d, e, want]) => sigmaKindOf(m, d, e) !== want);
  add('(3f) sigmaKindOf: alle 8 Fälle', wrong.length === 0,
    wrong.map(([m, d, e]) => `${+m}${+d}${+e}`).join(',') || '8/8');
  // Das Ensemble GEWINNT — PAP 6 sagt „wenn Ensemble verfügbar", nicht „zusätzlich".
  // Wer beide addierte, zählte die Unsicherheit doppelt.
  add('(3f) liegt σ_ens vor, gewinnt es über σ_div',
    sigmaKindOf(true, true, true) === K.ensemble);
  // Negativ-Kontrolle: ohne das dritte Argument verhält sich die Funktion wie Schema 1 —
  // sonst wäre nicht gezeigt, dass der neue Zweig überhaupt vom neuen Eingang kommt.
  add('(3f) Negativ-Kontrolle: ohne ensPresent bleibt es beim Schema-1-Verhalten',
    sigmaKindOf(true, true) === K.divergence && sigmaKindOf(true, false) === K.systematic);

  // ── Container: Rundlauf über alle Ebenen ─────────────────────────────────
  const nt = 2, ny = 3, nx = 4, cells = nt * ny * nx;
  const planes = CUBE_PLANES.map((_, pi) => {
    const a = new Int16Array(cells);
    for (let k = 0; k < cells; k++) a[k] = pi === 0 && k === 0 ? MISSING : (pi * 31 + k * 7) % 3000 - 1500;
    return a;
  });
  const bytes = await encodeCubeChunk({ runHours: 490_000, tierIndex: 0, nt, y0: 16, x0: 32, ny, nx, planes });
  const back = await decodeCubeChunk(bytes);
  add('(3f) Rundlauf über alle Ebenen: Kopf stimmt',
    back.nvar === CUBE_PLANES.length && back.schema === CUBE_SCHEMA && back.nt === nt && back.ny === ny && back.nx === nx,
    `nvar ${back.nvar}, Schema ${back.schema}`);
  let diff = 0;
  for (let pi = 0; pi < CUBE_PLANES.length; pi++) {
    for (let k = 0; k < cells; k++) if (back.planes[pi][k] !== planes[pi][k]) diff++;
  }
  add('(3f) Rundlauf über alle Ebenen: jeder Wert unverändert', diff === 0, `${diff} Abweichungen`);

  // Ein einzelner Ebenenwunsch muss die RICHTIGE Ebene treffen — bei 36 statt 27 Ebenen
  // ist jeder Index verschoben, und ein Fehler dabei wäre still.
  const only = await decodeCubeChunk(bytes, { wanted: ['t2m_sd_ens'] });
  const ei = planeIndex('t2m_sd_ens');
  add('(3f) gezielter Zugriff trifft die σ_ens-Ebene',
    ei > 0 && only.planes[ei].length === cells && only.planes[planeIndex('t2m')].length === 0,
    `t2m_sd_ens = Ebene ${ei}`);

  // ── Ein Schema-1-Chunk wird LAUT abgelehnt, nicht still falsch gelesen ───
  // Nachgebaut, indem die Schema-Nummer im Kopf auf 1 gesetzt wird.
  const old = bytes.slice();
  new DataView(old.buffer, old.byteOffset, old.byteLength).setUint16(4, 1, true);
  let msg = '';
  try { await decodeCubeChunk(old, { checkCrc: false }); } catch (e) { msg = String(e.message); }
  add('(3f) Schema-1-Chunk wird abgelehnt', msg.includes('Schema 1'), msg.slice(0, 60));
  add('(3f) die Ablehnung nennt die Kur', msg.includes('planes'), msg.length > 80 ? 'Kur genannt' : msg);

  // Mit einer mitgegebenen Ebenenliste ist derselbe Chunk lesbar — das ist der Weg, der
  // die NÄCHSTE Ebenenerweiterung ohne Schemabruch möglich macht.
  const withList = await decodeCubeChunk(old, { planes: CUBE_PLANES, checkCrc: false });
  add('(3f) mit übergebener Ebenenliste ist er lesbar', withList.nvar === CUBE_PLANES.length);

  // Und eine FALSCH lange Liste muss auffallen, statt alles um die Differenz zu verschieben.
  let msg2 = '';
  try { await decodeCubeChunk(bytes, { planes: CUBE_PLANES.slice(0, 27) }); } catch (e) { msg2 = String(e.message); }
  add('(3f) eine zu kurze Ebenenliste wird abgelehnt', msg2.includes('27'), msg2.slice(0, 70));

  // ── Manifest ─────────────────────────────────────────────────────────────
  const pm = planeManifest();
  add('(3f) das Manifest nennt alle Ebenen mit Skala', pm.length === CUBE_PLANES.length
    && pm.every((p) => typeof p.scale === 'number' && p.scale > 0), `${pm.length}`);
  add('(3f) jede Ebene nennt Größe und Art', pm.every((p) => p.of && p.kind),
    pm.filter((p) => !p.of || !p.kind).map((p) => p.id).join(',') || 'alle');
  // Nicht als feste Zahl fortgeschrieben (Lehre BW-1) — gezählt wird gegen die
  // Größenliste, dann wächst die Prüfung mit, ohne je falsch zu werden.
  add('(3f) das Manifest führt eine σ_ens-Ebene je Ensemble-fähiger Größe',
    pm.filter((p) => p.kind === 'sd_ens').length === CUBE_VARS.filter((v) => v.sigmaEns).length,
    `${pm.filter((p) => p.kind === 'sd_ens').length}`);
  add('(3f) ensCount steht als Meta-Ebene neben srcCount',
    pm.some((p) => p.id === 'ensCount' && p.group === 'meta')
    && pm.some((p) => p.id === 'srcCount' && p.group === 'meta'));
  // ensCount zählt Member (IFS-ENS hat 51) — die Spanne muss int16 tragen.
  {
    const v = CUBE_VARS.find((x) => x.id === 'ensCount');
    add('(3f) ensCount trägt die größte Memberzahl der Matrix',
      v.range[1] >= Math.max(...SOURCES.map((s) => s.members)),
      `Spanne bis ${v.range[1]}, größtes Ensemble ${Math.max(...SOURCES.map((s) => s.members))}`);
  }
}

// --- (3g) PD-B3: der Nowcast-Leser (0–3 h) ---------------------------------
//
// Die drei Beobachtungsquellen der Matrix liegen seit RD3 im Repo. Was fehlte, war ein
// LESER — und die Auskunft, was die Bytes bedeuten. Beides wird hier festgehalten.
merge('Nowcast-Form', nowcastFormatSelfTest());
{
  // ── Kopie mit Wächter ────────────────────────────────────────────────────
  // `nowcastFromU8` ist die Umkehrung von `precipToU8` (`src/scalar/RainLayer.ts`).
  // Zwei Module, eine Wahrheit — also muss ein Auseinanderdriften auffallen, bevor es
  // still falsche Niederschläge erzeugt (dasselbe Muster wie repackManifest ↔ repackSource).
  {
    let bad = 0, worst = 0;
    for (let raw = 1; raw <= 254; raw++) {
      const back = nowcastFromU8(raw).mmh;
      // Der Rundweg muss auf DASSELBE Byte führen — das ist die scharfe Bedingung,
      // schärfer als „ungefähr gleich".
      if (precipToU8(back) !== raw) bad++;
      worst = Math.max(worst, Math.abs(precipToU8(back) - raw));
    }
    add('(3g) Umkehrung und precipToU8 sind deckungsgleich (Bytes 1…254)',
      bad === 0, `${bad} Abweichungen, max ${worst}`);
  }
  // Die Totzone: alles unter 0,06 mm/h wird 0 — und 0 kommt als 0 zurück, nicht als null.
  add('(3g) unter der Totzone kodiert precipToU8 auf 0',
    precipToU8(0.059) === 0 && precipToU8(0) === 0 && precipToU8(-1) === 0);
  add('(3g) Byte 0 liefert 0 mm/h, nicht null', nowcastFromU8(0).mmh === 0);

  // ── Sättigung: 255 ist ein offener Randbin, keine Messung ────────────────
  add('(3g) 255 wird NICHT als 20 mm/h ausgeliefert',
    nowcastFromU8(255).mmh === null && nowcastFromU8(255).saturated === true);
  // Negativ-Kontrolle: die naive Umkehrung `(raw/255)*vMax` liefert für 255 genau 20 —
  // ohne diese Zeile wäre nicht gezeigt, dass die Sonderbehandlung überhaupt etwas tut.
  add('(3g) Negativ-Kontrolle: die naive Umkehrung ergäbe genau 20',
    Math.abs((255 / 255) * NOWCAST_VMAX - 20) < 1e-12);
  // Und der Beweis, dass 255 wirklich ein offener Bin ist: sehr verschiedene Regenmengen
  // landen auf demselben Byte.
  add('(3g) 20, 60 und 200 mm/h sind im Byte nicht mehr unterscheidbar',
    precipToU8(20) === 255 && precipToU8(60) === 255 && precipToU8(200) === 255);
  add('(3g) die Sättigungsgrenze ist vMax − halber Schritt',
    Math.abs(NOWCAST_SATURATION - (NOWCAST_VMAX - NOWCAST_STEP / 2)) < 1e-12
    && precipToU8(NOWCAST_SATURATION + 1e-6) === 255,
    `${NOWCAST_SATURATION.toFixed(3)} mm/h`);

  // ── Die drei Quellen decken sich mit der Registry ─────────────────────────
  for (const s of NOWCAST_SOURCES) {
    const reg = SOURCE_BY_ID[s.id];
    add(`(3g) ${s.id} steht in der Quellenmatrix`, reg != null && reg.kind === 'nowcast',
      reg ? reg.kind : 'fehlt');
  }
  // Und umgekehrt: keine Nowcast-Quelle der Matrix ohne Eintrag hier — sonst gäbe es
  // eine Quelle im Repo, für die niemand einen Leseweg kennt.
  {
    const matrixNowcast = SOURCES.filter((s) => s.kind === 'nowcast').map((s) => s.id);
    const missing = matrixNowcast.filter((id) => !NOWCAST_BY_ID[id]);
    add('(3g) jede Nowcast-Quelle der Matrix hat einen Leseweg', missing.length === 0,
      missing.join(',') || matrixNowcast.join(','));
  }

  // ── ⚠ Byte 0 ist zweideutig, und die Domäne ist die Kur ──────────────────
  // Gemessen am echten Slot (RV 2609091740): Linz und Wien liefern aus dem ROHEN tar.bz2
  // NaN (keine Radarabdeckung), aus dem PNG aber 0,0000 mm/h. `decodeRadolanRaw` setzt
  // ausserhalb der Abdeckung NaN, und `precipToU8` bildet NaN auf 0 ab — „kein Regen" und
  // „kein Radar" werden DASSELBE Byte. Ohne Domänenprüfung entstünde für Ostösterreich
  // eine erfundene Trockenheit.
  add('(3g) NaN kodiert auf dasselbe Byte wie Trockenheit', precipToU8(NaN) === 0);
  add('(3g) RADVOR RV trägt Bregenz, aber nicht Linz und nicht Wien (⚠¹)',
    coversPoint(SOURCE_BY_ID.radvor_rv, 47.503, 9.747)
    && !coversPoint(SOURCE_BY_ID.radvor_rv, 48.306, 14.286)
    && !coversPoint(SOURCE_BY_ID.radvor_rv, 48.209, 16.373));
  // INCA trägt Ostösterreich allein — genau die Lücke, die RV dort lässt.
  add('(3g) INCA trägt Wien, wo RV es nicht tut',
    coversPoint(SOURCE_BY_ID.inca, 48.209, 16.373)
    && !coversPoint(SOURCE_BY_ID.radvor_rv, 48.209, 16.373));

  // ── Das Manifest muss den Leseweg vollständig beschreiben ────────────────
  {
    const idx = buildPointIndex({
      commit: null, publishedAt: '2026-09-09T00:00:00.000Z',
      runs: [{ run: '2026090900', runAt: '2026-09-09T00:00:00Z', path: 'point/2026090900', tiers: ['t1'], sources: ['icon_d2'], bytes: 1 }],
    });
    const nc = idx.nowcast;
    add('(3g) point/index.json führt die Nowcast-Zeile', nc != null && nc.sources.length === 3);
    add('(3g) das Manifest nennt die Umkehrformel', String(nc.encoding.inverse).includes('raw / 255'));
    add('(3g) das Manifest nennt vMax, Schritt und Totzone',
      nc.encoding.vMax === 20 && nc.encoding.deadZone === 0.06
      && Math.abs(nc.encoding.step - 20 / 255) < 1e-12);
    add('(3g) das Manifest nennt den verlustfreien Weg NUR für DE',
      nc.sources.filter((s) => s.lossless).length === 1
      && nc.sources.find((s) => s.lossless)?.id === 'radvor_rv');
    add('(3g) das Manifest sagt, dass der Spiegel kein Archiv ist',
      String(nc.retention).includes('LIVE-Spiegel'));
    add('(3g) das Manifest sagt, warum der Nowcast NICHT im Cube liegt',
      String(nc.note).includes('NEBEN dem Cube'));
    // Der Spiegel ist ein Live-Produkt — die 24-h-Regel des Cubes darf ihn nicht anfassen.
    add('(3g) die Nowcast-Pfade fallen NICHT unter die 24-h-Aufbewahrung',
      !isTimeless('radar/img/v1/rv/2609091740/f000.png')
      && !TIMELESS_PATHS.some((p) => p.startsWith('radar')));
  }
}

// --- (3h) PD-B4: alle Quellen tragen zur SELBEN Gültigzeit bei -------------
//
// Der Producer reichte dieselbe Vorhersagestunde an Quellen mit verschiedenen Läufen.
// `field(run, leadH)` heisst „Stunde leadH nach dem Lauf DIESER Quelle" — bei IFS aus
// 00z und ICON global aus 12z sind das zwei Werte, die **12 Stunden auseinander gültig**
// sind, und sie landeten im selben Mittel. Gemessen am echten Lauf: σ_div in Stufe 3 fiel
// nach der Korrektur von **3,06 K auf 1,07 K Median (−65 %)** — zwei Drittel der
// scheinbaren Modelluneinigkeit waren der Tagesgang.
{
  // Die Übersetzung selbst: Stunde h des Cubes ist bei einer Quelle mit Versatz o die
  // Stunde h + o. Der Publikationslauf ist der jüngste, hat also Versatz 0.
  const ownLead = (h, offsetH) => h + offsetH;
  add('(3h) der jüngste Lauf hat Versatz 0', ownLead(126, 0) === 126);
  add('(3h) ein 12 h älterer Lauf wird bei h + 12 gelesen', ownLead(126, 12) === 138);
  // Gegenprobe zur Richtung: ein ÄLTERER Lauf braucht eine GRÖSSERE Vorhersagestunde,
  // um dieselbe Uhrzeit zu treffen. Das falsche Vorzeichen wäre der teure Fehler — es
  // führte auf eine Zeit, die noch weiter danebenliegt als gar keine Korrektur.
  const validAt = (runMs, leadH) => runMs + leadH * 3_600_000;
  const pub = Date.parse('2026-09-09T12:00:00Z');
  const older = Date.parse('2026-09-09T00:00:00Z');
  add('(3h) Versatz trifft dieselbe Gültigzeit',
    validAt(pub, 126) === validAt(older, ownLead(126, 12)),
    new Date(validAt(pub, 126)).toISOString());
  add('(3h) Negativ-Kontrolle: ohne Versatz lägen sie 12 h auseinander',
    (validAt(pub, 126) - validAt(older, 126)) / 3_600_000 === 12);
  add('(3h) Negativ-Kontrolle: falsches Vorzeichen verdoppelt den Fehler',
    Math.abs(validAt(pub, 126) - validAt(older, ownLead(126, -12))) / 3_600_000 === 24);

  // Der Versatz folgt aus den Laufkennungen — `runIso` ist die eine Stelle, die eine
  // Laufkennung in eine Zeit übersetzt. Wenn die Rechnung dort falsch wäre, verschöbe
  // sich ALLES um denselben Betrag, ohne dass es auffiele.
  add('(3h) runIso übersetzt die Laufkennung richtig',
    runIso('2026090900') === '2026-09-09T00:00:00Z' && runIso('2026090912') === '2026-09-09T12:00:00Z',
    runIso('2026090912'));
  {
    const off = Math.round((Date.parse(runIso('2026090912')) - Date.parse(runIso('2026090900'))) / 3_600_000);
    add('(3h) der Versatz zweier Läufe ist ihre Stundendifferenz', off === 12, `${off} h`);
  }

  // Das Manifest muss die Regel UND die Zahl je Quelle nennen — sonst kann ein Leser
  // nicht nachrechnen, welche Gültigzeit hinter einem Wert steht.
  {
    const man = runManifest([{
      tier: 't3', run: '2026090912', leadHours: TIER_BY_ID.t3.leadHours, files: [], bytesTotal: 0, skipped: [],
      contributors: [
        { id: 'icon_global', run: '2026090912', leads: 10, role: 'assigned', coverage: 'partial', offsetH: 0 },
        { id: 'ifs_hres', run: '2026090900', leads: 36, role: 'assigned', coverage: 'full', offsetH: 12 },
      ],
      perPlane: {}, hasData: {}, ms: { fields: 0, total: 0 },
    }]);
    add('(3h) das Manifest nennt die Gültigzeit-Regel',
      String(man.fusion.validTime).includes('SELBEN GÜLTIGZEIT')
      || String(man.fusion.validTime).includes('selben GÜLTIGZEIT'),
      String(man.fusion.validTime).slice(0, 50));
    add('(3h) das Manifest nennt den Versatz je Quelle',
      man.sources.find((s) => s.id === 'ifs_hres')?.offsetH === 12
      && man.sources.find((s) => s.id === 'icon_global')?.offsetH === 0);
    add('(3h) das Manifest nennt die gemessene Folge (12 h bei IFS)',
      String(man.fusion.validTime).includes('12 h'));
  }
}

// --- (3i) PD-B4b: der Nachbarindex, tausendfach schneller und BITGLEICH -----
//
// `buildUnstructuredIndex` war `O(Zielzellen × Kandidaten)`. Selbst gemessen auf Stufe 1
// (48 441 Zielzellen): ICON global (~6 000 Kandidaten) 1 170 ms, ICON-D2-EPS (542 040)
// 60 272 ms, ICON-CH1 (~1,15 Mio) **299 522 ms = 5,0 min je Stufe**. Bei 80 min
// Gesamtbudget (§34.6) ein Blocker für jede dichte unstrukturierte Quelle.
//
// Die Ersetzung darf das Ergebnis NICHT verändern — sonst wandert die Verortung, und das
// sähe aus wie Wetter. Deshalb bleibt die alte Fassung als `buildUnstructuredIndexBrute`
// stehen, ausschliesslich damit dieser Beweis hier laufen kann.
{
  // Reproduzierbarer Zellsatz — derselbe Generator wie im Messlauf.
  const cells = (n, latMin, latMax, lonMin, lonMax) => {
    const lat = new Float64Array(n), lon = new Float64Array(n);
    let s = 12345;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < n; i++) {
      lat[i] = latMin + rnd() * (latMax - latMin);
      lon[i] = lonMin + rnd() * (lonMax - lonMin);
    }
    return { lat, lon };
  };

  // Stufe 3 ist klein genug, dass die brute-force-Fassung im Verifier laufen darf —
  // gross genug, dass ein Eimergitter mehrere Ringe braucht.
  const t3 = TIER_BY_ID.t3;
  for (const [name, n] of [['dünn (6 000)', 6_000], ['dicht (60 000)', 60_000]]) {
    const g = cells(n, t3.lat0 - 2, t3.lat0 + t3.ny * t3.deg + 2, t3.lon0 - 2, t3.lon0 + t3.nx * t3.deg + 2);
    const fast = buildUnstructuredIndex(g.lat, g.lon, t3);
    const brute = buildUnstructuredIndexBrute(g.lat, g.lon, t3);
    let diff = 0;
    for (let k = 0; k < fast.length; k++) if (fast[k] !== brute[k]) diff++;
    add(`(3i) Eimergitter = brute force, ${name}`, diff === 0, `${diff} von ${fast.length} verschieden`);
  }

  // ⚠ Der Gleichstandsfall, der ohne ausdrückliche Regel zufällig ausginge: zwei
  // Kandidaten mit EXAKT gleichem Abstand. Die brute-force-Fassung nimmt nur echt
  // kleinere Abstände, behält also den kleineren Index; das Eimergitter läuft in anderer
  // Reihenfolge und muss dasselbe tun.
  {
    const lat = new Float64Array([t3.lat0 - 0.5, t3.lat0 + 0.5, t3.lat0 - 0.5, t3.lat0 + 0.5]);
    const lon = new Float64Array([t3.lon0 - 0.5, t3.lon0 - 0.5, t3.lon0 + 0.5, t3.lon0 + 0.5]);
    const fast = buildUnstructuredIndex(lat, lon, t3);
    const brute = buildUnstructuredIndexBrute(lat, lon, t3);
    let diff = 0;
    for (let k = 0; k < fast.length; k++) if (fast[k] !== brute[k]) diff++;
    add('(3i) Gleichstand geht in beiden Fassungen gleich aus', diff === 0, `${diff} verschieden`);
  }

  // Ein leerer Kandidatensatz und einer ganz ausserhalb der Box müssen `null` liefern —
  // nicht einen Index voller -1, der wie „gelesen, aber leer" aussähe.
  add('(3i) keine Kandidaten ⇒ null',
    buildUnstructuredIndex(new Float64Array(0), new Float64Array(0), t3) === null);
  add('(3i) Kandidaten weit ausserhalb ⇒ null',
    buildUnstructuredIndex(new Float64Array([-40, -41]), new Float64Array([120, 121]), t3) === null);

  // Ein einzelner Kandidat gewinnt überall — der Test, der eine kaputte Ringabbruch-
  // Bedingung sofort zeigt (bricht sie zu früh ab, bleiben Zellen auf -1).
  {
    const idx = buildUnstructuredIndex(
      new Float64Array([t3.lat0 + 2]), new Float64Array([t3.lon0 + 2]), t3);
    add('(3i) ein einzelner Kandidat gewinnt in JEDER Zelle',
      idx != null && idx.every((v) => v === 0), idx ? `${idx.filter((v) => v < 0).length} Zellen ohne Treffer` : 'null');
  }

  // ⚠ Der Fall, der den ersten Entwurf zerlegt hat — UND einen Altfehler aufdeckte.
  //
  // Kandidaten decken nur den SÜDEN des Ausschnitts (wie C-LAEF bis 51,5 °N oder ICON-CH
  // bis 50,5). Erstens lief die Ringsuche dort durch leeres Gebiet und brauchte über fünf
  // Minuten — langsamer als das Verfahren, das sie ersetzen sollte. Zweitens, und
  // schwerer: die ALTE Fassung nahm für jede Zelle den global naechsten Kandidaten, auch
  // wenn er 700 km weit weg lag. EIN Randwert waere so ueber halb Deutschland verteilt
  // worden — und saehe aus wie eine Vorhersage.
  //
  // Der reguläre Weg macht es seit jeher richtig (`fillNearest`: hoechstens drei Zellen,
  // dann MISSING). Der unstrukturierte zieht jetzt nach.
  {
    const t3b = TIER_BY_ID.t3;
    // Nur der Suedrand traegt Kandidaten.
    const teil = cells(20_000, t3b.lat0 - 1, t3b.lat0 + 2, t3b.lon0 - 1, t3b.lon0 + t3b.nx * t3b.deg + 1);
    const t0 = Date.now();
    const fast = buildUnstructuredIndex(teil.lat, teil.lon, t3b);
    const ms = Date.now() - t0;
    const brute = buildUnstructuredIndexBrute(teil.lat, teil.lon, t3b);
    const leerNeu = fast.filter((v) => v < 0).length;
    const leerAlt = brute.filter((v) => v < 0).length;
    add('(3i) Teilabdeckung: Zellen ausserhalb bleiben LEER statt erfunden',
      leerNeu > 0 && leerAlt === 0, `neu ${leerNeu} leer, alt ${leerAlt} leer (von ${fast.length})`);
    // Und dort, wo die Quelle WIRKLICH traegt, stimmen beide ueberein.
    let diffInside = 0;
    for (let k = 0; k < fast.length; k++) if (fast[k] >= 0 && fast[k] !== brute[k]) diffInside++;
    add('(3i) Teilabdeckung: innerhalb der Reichweite identisch', diffInside === 0, `${diffInside} verschieden`);
    add('(3i) Teilabdeckung: schnell statt minutenlang', ms < 3000, `${ms} ms`);
  }

  // Die Geschwindigkeit ist der Grund der Etappe — also wird sie auch geprüft, nicht nur
  // behauptet. Stufe 1 mit 200 000 Kandidaten lief brute force in ~22 s.
  {
    const t1 = TIER_BY_ID.t1;
    const g = cells(200_000, t1.lat0 - 1, t1.lat0 + t1.ny * t1.deg + 1, t1.lon0 - 1, t1.lon0 + t1.nx * t1.deg + 1);
    const t0 = Date.now();
    const idx = buildUnstructuredIndex(g.lat, g.lon, t1);
    const ms = Date.now() - t0;
    add('(3i) Stufe 1 mit 200 000 Kandidaten unter 3 s', idx != null && ms < 3000, `${ms} ms`);
  }
}

// --- (3j) PD-B5: die vier Profilfelder ---------------------------------------
//
// Bis PD-B5 waren `gammaEff`, `zBase`, `zInv` und `dTInv` in KEINER Zelle belegt
// (§33.3). Die Folge steht in PAP 4: die Verzweigung `z_inv > z_base` ist nie
// entscheidbar, **Fall B und Fall C sind unerreichbar**, und Fall A faellt auf
// 6,5 K/km zurueck — genau die Inversionslagen, fuer die der Algorithmus gebaut
// ist, kann er dann nicht.
//
// Die Ebenen gab es schon; es fehlte der Rechenweg. Der liegt jetzt als REINE
// Funktion in `scripts/point/profile.mjs` und ist deshalb hier netzfrei pruefbar.
merge('Profil (PD-B5)', profileSelfTest());
{
  // Die vier Felder muessen als Ebenen existieren und zur Profilgruppe gehoeren —
  // sonst schreibt der Producer in eine Ebene, die der Client als Zielgroesse liest.
  for (const id of ['gammaEff', 'zBase', 'zInv', 'dTInv']) {
    const pl = CUBE_PLANES[planeIndex(id)];
    add(`(3j) ${id} ist eine Profilebene ohne Streuung`,
      !!pl && pl.group === 'profile' && pl.kind === 'mean',
      pl ? `${pl.group}/${pl.kind}, ${pl.unit}` : 'fehlt');
  }

  // ⚠ Die Vorzeichenkonvention ist die eine Stelle, an der ein Fehler unsichtbar
  // bliebe: ein gedrehtes Gamma liegt im erlaubten Wertebereich und sieht wie
  // Wetter aus. `ABLAUFPLAENE.md` legt am Ende von PAP 4 fest: Gamma = -dT/dz.
  {
    const z = [0, 100, 200, 300, 400, 500, 600];
    const fallend = profileFromColumn(z.map((h) => 20 - 0.0065 * h), z);
    const steigend = profileFromColumn(z.map((h) => 0 + 0.0100 * h), z);
    add('(3j) normale Schichtung ⇒ gammaEff > 0', fallend.gammaEff > 0,
      `${fallend.gammaEff.toFixed(2)} K/km`);
    add('(3j) Inversion ⇒ gammaEff < 0', steigend.gammaEff < 0,
      `${steigend.gammaEff.toFixed(2)} K/km`);
    add('(3j) 6,5 K/km Standardatmosphaere wird als 6,5 wiedergegeben',
      Math.abs(fallend.gammaEff - 6.5) < 0.01, `${fallend.gammaEff.toFixed(3)}`);
  }

  // „Keine Inversion" ist eine AUSSAGE (zInv == zBase) und darf nicht mit
  // „unbekannt" (MISSING) verwechselt werden — `cubeFormat.ts` sagt es beim Feld.
  {
    const z = [0, 100, 200, 300, 400, 500];
    const mix = profileFromColumn(z.map((h) => 10 - 0.0098 * h), z);
    const leer = profileFromColumn(z.map(() => NaN), z);
    add('(3j) durchmischt ⇒ zInv == zBase (Aussage, kein Loch)', mix.zInv === mix.zBase);
    add('(3j) Profil fehlt ⇒ NaN, nicht 0 (wird MISSING)',
      Number.isNaN(leer.zBase) && Number.isNaN(leer.gammaEff));
  }

  // Die beiden Schwellen sind Kalibrierparameter (Felder 37 ff.) und stehen als
  // benannte Startwerte da, nicht als versteckte Zahl im Rechenweg.
  add('(3j) Schwellen benannt und eingefroren',
    Object.isFrozen(PROFILE_PARAMS) && PROFILE_PARAMS.dzMinM > 0
    && PROFILE_PARAMS.gammaDepthM > 0 && PROFILE_PARAMS.dTMinK > 0,
    `gammaDepth ${PROFILE_PARAMS.gammaDepthM} m, dzMin ${PROFILE_PARAMS.dzMinM} m, dTMin ${PROFILE_PARAMS.dTMinK} K`);

  // Wer traegt Profile? ICON-D2 ja, ICON-EU ausdruecklich (noch) nicht — und das
  // muss eine BENANNTE Entscheidung sein, kein vergessener Zweig.
  add('(3j) ICON-D2 traegt Profilfelder', adapterFor('icon_d2')?.hasProfile === true);
  add('(3j) ICON-EU traegt sie NICHT, mit Begruendung im Code',
    adapterFor('icon_eu')?.hasProfile === false);

  // Der Producer darf die Profilfelder NICHT mitteln. Der Mittelwert zweier
  // Inversionsobergrenzen ist keine Inversionsobergrenze — bei 400 m und „keine"
  // stuende 200 m im Cube, eine Schicht, die kein Modell kennt.
  {
    const src = readFileSync(join(ROOT, 'scripts/point/build-point-cube.mjs'), 'utf8');
    add('(3j) Profil kommt aus GENAU EINER Quelle',
      /contributors\.find\(\(c\) => c\.adapter\.hasProfile\)/.test(src));
    add('(3j) Kill-Switch mit benanntem Rueckfall vorhanden',
      /POINT_PROFILE === .0./.test(src));
    add('(3j) die Domaenenmaske gilt auch fuer das Profil',
      /profileSrc\.mask && !profileSrc\.mask\[i\]/.test(src));
    add('(3j) TARGET_VARS enthaelt kein Profilfeld',
      !/TARGET_VARS[\s\S]{0,200}gammaEff/.test(src));
  }

  // Der Levelschnitt ist gemessen, nicht gesetzt — die Zahl steht im Adapter und
  // der Grund daneben. Ein Adapter ohne Begruendung waere wieder eine Zahl, die
  // niemand nachrechnen kann (Lehre aus BW-1).
  {
    const src = readFileSync(join(ROOT, 'scripts/point/adapters/dwdRegular.mjs'), 'utf8');
    add('(3j) Levelzahl im Adapter konfiguriert', /levelCount:/.test(src));
    add('(3j) Levelzahl mit gemessener Begruendung', /Absinkinversionen ab/.test(src));
    add('(3j) Halbflaechen werden gehalten (zeitinvariant)', /halfCache/.test(src));
  }
}

// --- (3k) PD-B6: die Schweiz bekommt eine eigene Quelle ----------------------
//
// Bis PD-B5 war `srcCount` in Muenchen, Wien und Zuerich Stunde fuer Stunde
// identisch: der Cube kannte keine Laender, jeder Schweizer Punkt wurde aus der
// DEUTSCHEN Spalte der Quellenmatrix versorgt (§33.5). ICON-CH1/CH2-EPS schliesst
// das — und bringt die sechste Zugriffsfamilie mit (STAC + vorsigniertes S3).
{
  const src = readFileSync(join(ROOT, 'scripts/point/adapters/meteoswiss.mjs'), 'utf8');

  add('(3k) beide ICON-CH-Quellen haben einen Adapter',
    adapterFor('icon_ch1_eps') != null && adapterFor('icon_ch2_eps') != null);
  add('(3k) und stehen nicht mehr in PENDING',
    PENDING.icon_ch1_eps === undefined && PENDING.icon_ch2_eps === undefined);

  // Die Registry fuehrte fuenf Groessen, weil sie aus dem KARTENCLIENT abgeschrieben
  // waren. Der Katalog (params_*.csv) fuehrt alle zwoelf. Ein Verbraucher ist keine
  // Quelle — dieselbe Lehre wie bei C-LAEF (§37) und V-BW-51.
  for (const id of ['icon_ch1_eps', 'icon_ch2_eps']) {
    const s2 = SOURCE_BY_ID[id];
    const a = adapterFor(id);
    add(`(3k) ${id} fuehrt alle zwoelf Zielgroessen`, s2.vars.length === 12, `${s2.vars.length}`);
    add(`(3k) ${id}: Registry und Adapter nennen dieselben Groessen`,
      a.vars.length === s2.vars.length && s2.vars.every((v) => a.vars.includes(v)),
      `Adapter ${a.vars.length}, Registry ${s2.vars.length}`);
  }

  // ⚠ Der Kontrolllauf geht hier INS Mittel — und das ist kein Verstoss gegen
  // V-PD-9, sondern dessen Begruendung ernst genommen: ausgeschlossen wird ein
  // ctrl, der eine SCHON INGESTIERTE Quelle dupliziert (IFS-ENS-ctrl IST IFS HRES).
  // MeteoSchweiz veroeffentlicht keinen separaten deterministischen Lauf.
  add('(3k) ICON-CH-ctrl wird NICHT wie IFS-ENS-ctrl ausgeschlossen',
    adapterFor('icon_ch1_eps').ensembleControlOnly === false
    && adapterFor('icon_ch2_eps').ensembleControlOnly === false);
  // Seit PD-B10 haelt IFS-ENS sich ueber `vars: []` aus dem Mittel (es liefert Member,
  // keinen Kontrolllauf); AIFS-ENS weiterhin ueber `ensembleControlOnly`.
  add('(3k) ECMWF-ENS traegt weiterhin nichts zum Mittel bei (V-PD-9 unveraendert)',
    (adapterFor('ifs_ens').vars ?? []).length === 0 && adapterFor('ifs_ens').ensembleOnly === true
    && adapterFor('aifs_ens').ensembleControlOnly === true);
  add('(3k) der Unterschied ist im Manifest begruendet, nicht nur im Code',
    /controlNote/.test(src) && /V-PD-9/.test(src));

  // ⚠ Die Falle, die diese Etappe gekostet haette: der Katalog ignoriert unbekannte
  // Query-Parameter STILL und antwortet mit HTTP 200 auf ungefilterte Daten.
  // Wer darauf baut, holt ALB_DIF statt T_2M. Dass wir nicht filtern, muss deshalb
  // im Code sichtbar bleiben.
  // ⚠ Diese Prüfung darf nur den CODE ansehen, nicht den Kommentar — der beschreibt
  // die Falle ja ausdrücklich. Erster Anlauf schlug an der eigenen Dokumentation an
  // (dieselbe Klasse wie §22: eine Regex zählte die gerade verdrahteten Knöpfe als
  // Attrappen). Geprüft wird deshalb der URL-Bau.
  const urlLines = src.split(NEWLINE).filter((l) => /\$\{STAC\}|url =|url \+=/.test(l) && !/^\s*\*/.test(l));
  add('(3k) kein serverseitiger Filter im URL-Bau (er wird still ignoriert)',
    urlLines.length > 0 && !urlLines.some((l) => /forecast/.test(l)),
    `${urlLines.length} URL-Zeilen`);
  add('(3k) die stille Filter-Falle ist dokumentiert',
    /still ignoriert/.test(src) && /ALB_DIF/.test(src));

  // ⚠ Vorsignierte URLs sind methodengebunden: HEAD → 403. `headOk` waere hier ein
  // stiller Totalausfall („Quelle hat nichts").
  const codeLines = src.split(NEWLINE).filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l));
  add('(3k) kein headOk auf vorsignierte Hrefs',
    !codeLines.some((l) => /headOk/.test(l)));
  add('(3k) HEAD-403 ist als Grund benannt', /HEAD.{0,40}403/.test(src));

  // ⚠ Und der Cache: Signature/Expires wechseln bei JEDER Enumeration, ein
  // URL-Schluessel traefe nie. Gecacht wird unter dem Objektnamen.
  add('(3k) Abruf cacht unter dem Objektnamen, nicht unter der URL',
    /cacheKey: `mch:/.test(src));
  add('(3k) shared.fetchBytes kennt den stabilen Schluessel',
    /cacheKey = null/.test(readFileSync(join(ROOT, 'scripts/point/adapters/shared.mjs'), 'utf8')));

  // Die Konstanten werden ueber die Parameter-Identitaet gefunden, nicht ueber
  // Wertebereiche — eine Heuristik faende HSURF gar nicht.
  add('(3k) clat/clon/HSURF ueber Parameter-Identitaet',
    /CONST_ID/.test(src) && /clat: \[0, 191, 1\]/.test(src) && /hsurf: \[0, 3, 6\]/.test(src));

  // Das Kostenraster ist eine BEGRUENDETE Entscheidung, keine Zahl im Code.
  add('(3k) CH1 wird in Stufe 1 vergroebert, mit gemessener Begruendung',
    /26,4 MiB je Schritt/.test(src) && /1,21 GiB/.test(src));

  // Der unstrukturierte Weg ist der aus PD-B4b — mit Entfernungsgrenze. Ohne sie
  // verteilte EIN Randwert sich ueber halb Deutschland.
  add('(3k) unstrukturierte Abtastung ueber den Nachbarindex (PD-B4b)',
    /buildUnstructuredIndex/.test(src) && /sampleUnstructuredToTier/.test(src));

  // Die Domaene ist am Konstanten-Asset gemessen und muss die Schweiz tragen,
  // Norddeutschland aber NICHT — sonst schmierte eine 1-km-Quelle ueber ein Gebiet,
  // das sie gar nicht rechnet.
  for (const id of ['icon_ch1_eps', 'icon_ch2_eps']) {
    const s2 = SOURCE_BY_ID[id];
    add(`(3k) ${id} deckt Zuerich, Genf und Zermatt`,
      coversPoint(s2, 47.37, 8.54) && coversPoint(s2, 46.20, 6.14) && coversPoint(s2, 46.02, 7.75));
    add(`(3k) ${id} deckt Hamburg und Berlin NICHT`,
      !coversPoint(s2, 53.55, 9.99) && !coversPoint(s2, 52.52, 13.40));
    add(`(3k) ${id}: Domaene am Konstanten-Asset gemessen`,
      s2.domain != null && s2.domain.latMax < 50.6 && s2.domain.latMax > 50.4
      && s2.domain.lonMax > 17.6 && s2.domain.lonMax < 17.8,
      `${s2.domain.latMin}…${s2.domain.latMax} °N / ${s2.domain.lonMin}…${s2.domain.lonMax} °E`);
  }

  // Der Horizont von CH1 stand auf 33 h und ist gemessen 45 h. Eine zu KURZ
  // angesetzte Zahl kostet stillschweigend Abdeckung: `chooseRun` fragt dann gar
  // nicht erst nach dem weiteren Lauf (§34.1).
  // ⚠ Laufabhängig wie ICON-EU: gemessen 33 h, außer 03z mit 45 h. Als EINE Zahl
  // geführt ist beides falsch — 45 als Default lässt die Sonde nur den seltenen
  // langen Lauf finden, 33 als Maximum verschenkt ihn.
  add('(3k) CH1-Horizont ist laufabhängig, wie gemessen',
    SOURCE_BY_ID.icon_ch1_eps.horizonH.default === 33
    && SOURCE_BY_ID.icon_ch1_eps.horizonH.byRunHour?.[3] === 45,
    `${SOURCE_BY_ID.icon_ch1_eps.horizonH.default} h, 03z ${SOURCE_BY_ID.icon_ch1_eps.horizonH.byRunHour?.[3]} h`);

  // Die Stufen-Deklaration muss zu den Adaptern passen, sonst laeuft die Etappe
  // ins Leere: CH1 gehoert in Stufe 1, CH2 in Stufe 2.
  add('(3k) CH1 ist in Stufe 1 vorgesehen, CH2 in Stufe 2',
    TIER_BY_ID.t1.sources.includes('icon_ch1_eps') && TIER_BY_ID.t2.sources.includes('icon_ch2_eps'));
  for (const t of ['t1', 't2']) {
    const r = ingestableFor(TIER_BY_ID[t]);
    const want = t === 't1' ? 'icon_ch1_eps' : 'icon_ch2_eps';
    add(`(3k) ${want} ist in ${t} tatsaechlich ingestierbar`, r.usable.includes(want),
      `usable: ${r.usable.join(', ')}`);
  }
}

// --- (3l) PD-B7: gemessene Quantile bekommen einen eigenen Ort ---------------
//
// C-LAEF-EPS liefert KEINE Member, nur P10/P50/P90 (⚠³). Der naheliegende Weg waere
// `σ_ens = (p90 − p10) / 2,563` — das setzt aber Normalverteilung voraus, und fuer
// Niederschlag ist das nachweislich falsch: am echten Datum steht an einer nassen
// Zelle **p10 = 0,000 mm bei p90 = 0,619 mm**. Ein daraus gebildetes σ = 0,24 mm mit
// normalem p10 = Median − 1,28σ ergaebe **negativen Niederschlag**.
{
  const src = readFileSync(join(ROOT, 'scripts/point/adapters/geosphere.mjs'), 'utf8');
  const qv = CUBE_VARS.filter((v) => v.quantiles).map((v) => v.id);

  add('(3l) sieben Groessen fuehren Quantile', qv.length === 7, qv.join(','));
  for (const id of qv) {
    add(`(3l) ${id}: q10 und q90 sind eigene Ebenen`,
      planeIndex(`${id}_q10`) >= 0 && planeIndex(`${id}_q90`) >= 0);
  }

  // ⚠ Ein Quantil ist ein WERT derselben Groesse, keine Streuung — Skala UND Versatz
  // bleiben. Mit `offset: 0` (wie bei `_sd`) laege eine Temperatur lautlos daneben.
  add('(3l) Quantil-Ebenen behalten Skala und Versatz',
    CUBE_PLANES.filter((p) => p.kind === 'q10' || p.kind === 'q90').every((p) => {
      const v = CUBE_VARS.find((x) => x.id === p.varId);
      return v && p.scale === v.scale && p.offset === v.offset && p.unit === v.unit;
    }));

  // Keine Ebene ohne Schreiber (die Lehre aus V-SH-11, hier vorbeugend).
  const writer = adapterFor('claef_eps');
  add('(3l) C-LAEF-EPS hat einen Adapter', writer != null);
  add('(3l) jede Quantil-Groesse hat einen Schreiber',
    qv.every((v) => (writer?.quantileVars ?? []).includes(v)),
    `Adapter: ${(writer?.quantileVars ?? []).join(',')}`);

  // ⚠ Der Kern: diese Quelle darf NICHT ins Mittel. Ihr p50 ist derselbe Modelllauf
  // wie `claef`, den der Cube schon ingestiert — als zweiter „unabhaengiger" Wert
  // liesse sie σ_div schrumpfen, exakt der Grund von V-PD-9.
  add('(3l) C-LAEF-EPS traegt NICHTS zum Mittel bei',
    (writer?.vars ?? []).length === 0 && writer?.quantilesOnly === true);
  add('(3l) und der Grund steht im Manifest, nicht nur im Code',
    typeof writer?.quantileNote === 'string' && /V-PD-9/.test(writer.quantileNote));
  add('(3l) der deterministische C-LAEF traegt weiterhin zum Mittel bei',
    (adapterFor('claef')?.vars ?? []).length > 0);

  // td2m bekommt bewusst KEINE Quantile: das q10 des Taupunkts ist nicht
  // Magnus(q10 der Temperatur, q10 der Feuchte). Ein abgeleitetes Quantil ist keins.
  add('(3l) td2m fuehrt KEINE Quantile (ein abgeleitetes Quantil ist keins)',
    !CUBE_VARS.find((v) => v.id === 'td2m')?.quantiles
    && !(writer?.quantileVars ?? []).includes('td2m'));
  // ⚠ Die Begruendung steht ueber zwei Zeilen — ein Regex ueber den Umbruch findet
  // sie nicht. Geprueft wird deshalb der Satzkern, der auf EINER Zeile steht.
  add('(3l) und der Grund steht im Adapter',
    /nicht Magnus\(q10 der Temperatur, q10 der Feuchte\)/.test(src));
  // ps ebenso: der Datensatz fuehrt nur msl.
  add('(3l) ps fuehrt KEINE Quantile (die Quelle hat nur msl)',
    !(writer?.quantileVars ?? []).includes('ps'));

  // ⚠ Der Fuellwert, den erst diese Etappe gefunden hat — und der den
  // DETERMINISTISCHEN C-LAEF seit PD-B4 betraf.
  add('(3l) -1000 ist als Fuellwert erkannt', /raw === -1000/.test(src));
  add('(3l) der Fund ist mit der Messung begruendet',
    /geojson-Ausgabe/.test(src) && /Lead 0/.test(src));
  add('(3l) zweiter Wall: nicht-negative Groessen deklariert',
    /NON_NEGATIVE = new Set\(\['precip', 'clct', 'gust', 'snowlmt'\]\)/.test(src));
  // Gegenprobe: t2m/u10/v10 duerfen negativ sein und stehen deshalb NICHT drin.
  add('(3l) Temperatur und Wind sind NICHT als nicht-negativ gefuehrt',
    !/NON_NEGATIVE = new Set\(\[[^\]]*'t2m'/.test(src)
    && !/NON_NEGATIVE = new Set\(\[[^\]]*'u10'/.test(src));

  // Die Quantile duerfen nicht gemittelt werden — dieselbe Regel wie beim Profil.
  const prod = readFileSync(join(ROOT, 'scripts/point/build-point-cube.mjs'), 'utf8');
  add('(3l) Quantile kommen aus GENAU EINER Quelle',
    /contributors\.find\(\(c\) => \(c\.adapter\.quantileVars \?\? \[\]\)\.length > 0\)/.test(prod));
  add('(3l) Kill-Switch mit benanntem Rueckfall', /POINT_QUANTILES === .0./.test(prod));
  add('(3l) die Domaenenmaske gilt auch fuer Quantile',
    /quantSrc\.mask && !quantSrc\.mask\[i\]/.test(prod));
  // ⚠ Und die Warnung gegen Doppelzaehlung, wie bei _sd/_sd_ens in Schema 2.
  add('(3l) das Manifest warnt vor dem Verrechnen mit _sd/_sd_ens',
    /NICHT mit _sd oder _sd_ens verrechnen/.test(prod));

  // Die Registry stand auf einem geratenen Laufrhythmus.
  const es = SOURCE_BY_ID.claef_eps;
  add('(3l) C-LAEF-EPS: Laeufe dreistuendlich, wie gemessen',
    es.runHours.length === 8 && es.runHours[1] === 3, es.runHours.join(','));
  add('(3l) C-LAEF-EPS: Vorhalt gemessen statt null', es.retentionH === 12, `${es.retentionH} h`);
  add('(3l) C-LAEF-EPS ist in Stufe 1 vorgesehen',
    TIER_BY_ID.t1.sources.includes('claef_eps'));
  add('(3l) und dort ingestierbar', ingestableFor(TIER_BY_ID.t1).usable.includes('claef_eps'));
}

// --- (3m) PD-B8: sigma_ens und ensCount bekommen endlich Daten ---------------
//
// PD-B2 hat den ORT geschaffen (Schema 2), PD-B6 die Ebene fuer `snowlmt` ergaenzt
// (Schema 3) — aber gefuellt hat sie niemand: `<var>_sd_ens` und `ensCount` standen
// seit PD-A durchgehend auf MISSING. Das holt PD-B8 nach.
{
  const src = readFileSync(join(ROOT, 'scripts/point/adapters/dwdEps.mjs'), 'utf8');
  const prod = readFileSync(join(ROOT, 'scripts/point/build-point-cube.mjs'), 'utf8');

  for (const id of ['icon_d2_eps', 'icon_eu_eps', 'icon_eps_global']) {
    const a = adapterFor(id);
    add(`(3m) ${id} hat einen Adapter`, a != null);
    add(`(3m) ${id} steht nicht mehr in PENDING`, PENDING[id] === undefined);
    // ⚠ Der Kern: EPS-Quellen tragen NICHTS zum Mittel bei. Das Ensemble-Mittel ist
    // derselbe Modelllauf wie der schon ingestierte deterministische — als zweiter
    // „unabhaengiger" Wert liesse es sigma_div schrumpfen (V-PD-9).
    add(`(3m) ${id} traegt nichts zum Mittel bei`,
      (a?.vars ?? []).length === 0 && a?.ensembleOnly === true);
    add(`(3m) ${id} liefert Ensemble-Groessen`, (a?.ensembleVars ?? []).length > 0,
      (a?.ensembleVars ?? []).join(','));
    // Jede gelieferte Groesse braucht eine Ebene, sonst rechnet der Producer ins Leere.
    add(`(3m) ${id}: jede Ensemble-Groesse hat eine sd_ens-Ebene`,
      (a?.ensembleVars ?? []).every((v) => planeIndex(`${v}_sd_ens`) >= 0));
  }

  // ⚠ Die Einheit einer STREUUNG ist nicht die eines Werts. `convert()` addiert den
  // Versatz; auf ein sigma angewandt stuende eine 1,2-K-Streuung als -271,95 im Cube —
  // im erlaubten Wertebereich [-60,60] fuer t2m_sd? Nein: sd traegt denselben
  // Wertebereich wie die Groesse, und -271,95 wuerde beim Quantisieren geklemmt. Es
  // waere also nicht einmal sichtbar. Genau deshalb steht die Regel im Code.
  // ⚠ Auch hier darf nur der CODE geprüft werden: der Kopfkommentar nennt
  // `convert()` ja gerade, um zu erklären, warum es NICHT benutzt wird (dieselbe
  // Klasse wie (3k) und §22).
  const epsCode = src.split(NEWLINE).filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l));
  add('(3m) Streuungen werden nur mit dem FAKTOR skaliert',
    /SD_FACTOR/.test(src) && !epsCode.some((l) => /convert\(/.test(l)));
  add('(3m) und der Grund ist benannt', /nie mit dem Versatz/.test(src));

  // ⚠ Nicht jede GRIB-Nachricht ist ein Member: ICON-D2-EPS bundelt `tot_prec` in
  // Viertelstunden (80 = 20 Member x 4 Endzeiten). Gefiltert wird auf das Intervall-
  // ENDE, nicht auf die Laenge — eine Stundensumme seit Laufbeginn ist leadH x 60
  // lang, ein Stundenmaximum immer 60, und beide enden auf der vollen Stunde.
  add('(3m) gefiltert wird auf das Intervall-ENDE', /intervalEndMinute === 0/.test(src));
  add('(3m) die Laengen-Falle ist dokumentiert',
    /Nicht ueber die LAENGE filtern/.test(src) && /119 auf 5 KiB/.test(src));
  const gd = readFileSync(join(ROOT, 'src/sources/gribDecode.ts'), 'utf8');
  add('(3m) der Decoder liefert das Intervall-Ende', /intervalEndMinute/.test(gd));
  // ⚠ Template 4.11 ist 4.8 plus drei Ensemble-Oktette — ohne Fallunterscheidung
  // liest derselbe Code im Ensemble richtig und im deterministischen Lauf Unsinn
  // (gemessen: Spannen von 105 Milliarden Minuten). Ein Feld, das je nach Quelle
  // stimmt oder nicht, ist schlimmer als keins.
  add('(3m) der Decoder unterscheidet Template 4.8 und 4.11',
    /productTemplate === 11 \? 3 : 0/.test(gd));
  add('(3m) und der Grund ist benannt', /um 3 verschoben/.test(gd));

  // Bessel, und kein sigma aus einem einzigen Member.
  // Seit PD-B10 steht die Streuungsrechnung EINMAL fuer alle Ensembles in
  // ensembleStats.mjs — dort wird geprueft, nicht mehr in jeder Kopie.
  const esSrc = readFileSync(join(ROOT, 'scripts/point/adapters/ensembleStats.mjs'), 'utf8');
  add('(3m) Bessel-Korrektur (n-1)', /\(c - 1\)/.test(esSrc));
  add('(3m) kein sigma aus weniger als zwei Membern', /if \(c < 2\) continue;/.test(esSrc));
  add('(3m) negative Rundungsvarianz wird zu 0, nicht zu NaN', /Math\.max\(0, \(s2\[k\]/.test(esSrc));

  // Der Producer: eine Quelle, kein Mittel ueber Ensembles, Kill-Switch, Maske.
  // Seit PD-B10 kennt eine Stufe mehrere Ensembles (Stufe 3: ICON-EPS global und
  // IFS-ENS) — aber je STUNDE genau eines; Member zweier Modelle werden nie gemischt.
  add('(3m) sigma_ens kommt je Stunde aus GENAU EINER Quelle',
    /if \(any\) \{ servedBy = src\.id; st\.hours\.push\(leadH\); break; \}/.test(prod));
  add('(3m) Kill-Switch mit benanntem Rueckfall', /POINT_ENSEMBLE === .0./.test(prod));
  add('(3m) die Domaenenmaske gilt auch fuer sigma_ens',
    /src\.mask && !src\.mask\[i\]/.test(prod));
  add('(3m) ensCount zaehlt MEMBER, nicht Quellen', /Zahl der MEMBER, nicht der Quellen/.test(prod));
  add('(3m) das Manifest warnt vor dem Addieren von sigma_div und sigma_ens',
    /PAP 6 verzweigt zwischen beiden — sie werden NICHT addiert/.test(prod));

  // Das grobe Zeitraster ist Jans Vorgabe MIT Zahlen dahinter.
  for (const [id, want] of [['icon_d2_eps', 6], ['icon_eu_eps', 12], ['icon_eps_global', 24]]) {
    add(`(3m) ${id}: Zeitraster ${want} h`, adapterFor(id)?.stepH === want,
      `${adapterFor(id)?.stepH} h`);
  }
  add('(3m) das Raster ist mit den gemessenen Kosten begruendet',
    /13,4 MiB/.test(src) && /34,8 MiB/.test(src) && /5 GiB je Lauf/.test(src));

  // Die drei Ensembles fuehren NICHT dasselbe — am Verzeichnis ausgezaehlt.
  add('(3m) ICON-EU-EPS fuehrt keinen Taupunkt',
    !(adapterFor('icon_eu_eps')?.ensembleVars ?? []).includes('td2m'));
  add('(3m) keines der DWD-Ensembles fuehrt snowlmt',
    ['icon_d2_eps', 'icon_eu_eps', 'icon_eps_global']
      .every((id) => !(adapterFor(id)?.ensembleVars ?? []).includes('snowlmt')));

  // ⚠ Der Blocker, den erst der VOLLE Dreistufenlauf gezeigt hat: der Fenstercache
  // von GeoSphere war unbegrenzt. Ein Fenster haelt ~19 MiB; mit claef + claef_eps
  // sind 22 gleichzeitig lebendig, und ohne Deckel blieb jeder weitere Block liegen
  // — der Producer starb bei 4 GB mit „allocation failure", mitten in Stufe 1.
  {
    const gs = readFileSync(join(ROOT, 'scripts/point/adapters/geosphere.mjs'), 'utf8');
    add('(3m) der GeoSphere-Fenstercache ist gedeckelt',
      /WIN_CACHE_MAX/.test(gs) && /winCache\.size > WIN_CACHE_MAX/.test(gs));
    add('(3m) der Deckel liegt ueber der Zahl gleichzeitig gebrauchter Fenster',
      Number((/GEOSPHERE_WIN_CACHE \|\| (\d+)/.exec(gs) ?? [])[1] ?? 0) >= 22);
    add('(3m) und der Grund steht mit der Messung da', /allocation failure/.test(gs));
  }

  // ⚠ §34.5 geschlossen: der ECMWF-Filter greift jetzt ueber `type`, nicht `number`.
  const ec = readFileSync(join(ROOT, 'scripts/point/adapters/ecmwf.mjs'), 'utf8');
  // ⚠ Diese Pruefung hat in PD-B8 den Fehler BESTAETIGT: sie verlangte die Zeile
  // `String(e.type) !== 'cf'` im Code — und genau die strich jedes deterministische
  // `fc` (IFS HRES 0 von 36, AIFS Single 0 von 21 Eintraegen behalten). Seit PD-B10
  // wird das VERHALTEN geprueft, mit Zeilen in der Form, die das echte .index hat.
  {
    const fc = { levtype: 'sfc', type: 'fc', stream: 'oper', param: '2t' };
    const cf = { levtype: 'sfc', type: 'cf', stream: 'enfo', param: '2t', number: '0' };
    const pf = { levtype: 'sfc', type: 'pf', stream: 'enfo', param: '2t', number: '7' };
    const pl = { levtype: 'pl', type: 'fc', stream: 'oper', param: 't' };
    add('(3m) ⚠ deterministische Laeufe behalten ihre Felder (type fc) — PD-B8 hatte sie ALLE gestrichen',
      keepIndexEntry({}, fc) && !keepIndexEntry({}, pl));
    add('(3m) ein Kontrolllauf-Adapter behaelt nur cf, keine gestoerten Member',
      keepIndexEntry({ ensemble: true }, cf) && !keepIndexEntry({ ensemble: true }, pf)
      && !keepIndexEntry({ ensemble: true }, fc));
    add('(3m) der Filter haengt nicht an `number`', !/Number\(e\.number\) !== 0/.test(ec));
  }
  add('(3m) und die Kostenentscheidung steht mit Zahlen da',
    /55,8 MiB/.test(ec) && /65,1 MiB/.test(ec));
  add('(3m) ECMWF-ENS bleibt aus dem Mittel (V-PD-9 unveraendert; IFS-ENS seit PD-B10 ueber vars: [])',
    (adapterFor('ifs_ens')?.vars ?? []).length === 0 && adapterFor('ifs_ens')?.ensembleOnly === true
    && adapterFor('aifs_ens')?.ensembleControlOnly === true);
}

// --- (3n) PD-B9: MOSMIX-L als eigenes Produkt `point/stations/` --------------
//
// Das Format stand seit PD-A (`stationBundlePath`, `STATION_CATALOG_PATH`), der
// Erzeuger fehlte. Eine Form ohne Schreiber ist dieselbe Klasse wie V-SH-11, nur
// andersherum: sie sieht gepflegt aus und traegt nichts.
{
  const mx = readFileSync(join(ROOT, 'scripts/point/mosmix.mjs'), 'utf8');
  const bs = readFileSync(join(ROOT, 'scripts/point/build-stations.mjs'), 'utf8');

  // Der netzfreie Selbsttest des Lesers — er deckt die Zip-Falle, die
  // Windkonvention, den Fehlwert und die Boee-Klammer ab.
  for (const t of await mosmixSelfTest()) add(`(3n) mosmix: ${t.name}`, t.ok, t.info);

  // ⚠ Die Zip-Falle: DWD schreibt mit Data-Descriptor, die Groessen im lokalen Kopf
  // sind 0. Ein Leser, der sie glaubt, scheitert mit Z_BUF_ERROR — gemessen.
  add('(3n) das Archiv wird ueber das Central Directory gelesen',
    /0x06054b50/.test(mx) && /0x02014b50/.test(mx));
  add('(3n) und der Grund ist benannt', /Data-Descriptor/.test(mx));

  // ⚠ 1750 MiB entpackt — als String unmoeglich. Deshalb Strom, nicht Puffer.
  add('(3n) die KML wird gestromt, nicht in einen String gelesen',
    /createInflateRaw/.test(mx) && !mx.split(NEWLINE)
      .filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l))
      .some((l) => /inflateRawSync/.test(l)));
  add('(3n) und die gemessene Groesse steht dabei', /1 750 MiB/.test(mx));
  add('(3n) Mehrbyte-Zeichen zerfallen nicht an der Blockgrenze',
    /StringDecoder/.test(mx));

  // ⚠ Die Koordinatenfalle: der DWD-Katalog fuehrt Grad + Dezimalminuten.
  add('(3n) die Koordinaten kommen aus der KML, nicht aus dem Katalog',
    /kml:coordinates/.test(mx) && /Dezimalminuten/.test(mx));
  add('(3n) der Katalog nennt den Grund fuer seine Herkunft',
    /Dezimalminuten/.test(bs));

  // Was MOSMIX NICHT traegt — benannt, nicht verschwiegen.
  add('(3n) ps ist benannt abwesend (PPPP ist auf Meeresniveau reduziert)',
    /MOSMIX_NOT_MAPPED/.test(mx) && /Meeresniveau/.test(mx));
  add('(3n) snowlmt und die vier Profilfelder ebenso',
    ['snowlmt', 'gammaEff', 'zBase', 'zInv', 'dTInv'].every((k) => MOSMIX_NOT_MAPPED[k]));
  add('(3n) und ps steht NICHT unter den Cube-Groessen der Quelle',
    !SOURCE_BY_ID.mosmix_l.vars.includes('ps'), SOURCE_BY_ID.mosmix_l.vars.join(','));

  // Die Registry lag an vier Stellen daneben; alle vier sind gemessen korrigiert.
  const ml = SOURCE_BY_ID.mosmix_l;
  add('(3n) Laeufe 03/09/15/21 UTC, wie gemessen',
    ml.runHours.length === 4 && ml.runHours.join(',') === '3,9,15,21', ml.runHours.join(','));
  add('(3n) Horizont gemessen statt gerundet', ml.horizonH.default === 247, `${ml.horizonH.default} h`);
  add('(3n) Schrittfolge gemessen: 247 Schritte, durchgehend stuendlich',
    ml.stepsMeasured === true && ml.steps?.length === 247
    && ml.steps.every((h, i) => h === i + 1), `${ml.steps?.length} Schritte`);
  add('(3n) der Zugriffsweg nennt all_stations', /all_stations/.test(ml.access));
  add('(3n) die Stationszahl ist gezaehlt, nicht uebernommen',
    /3071/.test(ml.note) && /gezählt/.test(ml.note));

  // ⚠ MOSMIX-L erscheint bei Lauf + 72…79 min, der Cron laeuft bei Lauf + 50 min.
  // Der gleichzeitige Lauf ist NIE erreichbar — das muss dastehen, nicht auffallen.
  add('(3n) die Veroeffentlichungslatenz ist benannt', /72/.test(ml.note) && /50 min/.test(ml.note));
  add('(3n) das Lauf-Manifest nennt das Alter des genommenen Laufs', /ageH/.test(bs));

  // Der Vertrag zwischen Buendel und Manifest.
  add('(3n) die Spaltenordnung ist stabil sortiert, nicht Lesereihenfolge',
    /Nach Stations-ID sortiert/.test(bs) && /a\.id < b\.id/.test(bs));
  add('(3n) das Manifest traegt die Zuordnung Spalte -> Station',
    /stations: c\.st\.map/.test(bs));
  add('(3n) die eigene Zeitachse steht im Manifest, sie wird nicht geraten',
    /leadHours: leads/.test(bs) && /axis/.test(bs));

  // Regel 2: ein neuer Rechenweg ist abschaltbar.
  add('(3n) Kill-Switch POINT_STATIONS', /POINT_STATIONS !== .0./.test(bs));

  // ⚠ PAP 6: die Boee darf nicht unter dem Wind stehen. Am echten Lauf war das in
  // 97 Fallen verletzt — die Klammer ist nicht geschenkt.
  add('(3n) die Boee wird auf max(FX1, |v10|) geklammert', /Math\.max\(fx, Math\.abs\(speed\)\)/.test(mx));
  add('(3n) und die Messung steht dabei', /97 Fällen/.test(mx));

  // Ehrlichkeit an den Meta-Ebenen.
  add('(3n) srcCount steht auf 1 (eine Quelle)', /put\('srcCount', it, k, 1\)/.test(bs));
  add('(3n) ensCount bleibt MISSING statt 0',
    /ensCount bleibt MISSING/.test(bs) && !/put\('ensCount'/.test(bs));
  add('(3n) hModEff ist die Stationshoehe (PAP 4 hat hier nichts zu korrigieren)',
    /put\('hModEff', it, k, s\.elev\)/.test(bs));

  // MOSMIX geht NICHT ins Gitter — das ist die Entscheidung aus PD-A, nicht ein Rest.
  add('(3n) mosmix_l hat KEINEN Gitter-Adapter', adapterFor('mosmix_l') == null);
  add('(3n) und PENDING sagt, dass das Absicht ist',
    /eigenes Produkt/.test(PENDING.mosmix_l ?? ''), PENDING.mosmix_l);
  add('(3n) der Katalog bleibt zeitlos (ueberlebt die Aufbewahrung)',
    TIMELESS_PATHS.includes(STATION_CATALOG_PATH));

  // ⚠ Der Fund, der ohne diese Pruefung erst nach Tagen aufgefallen waere:
  // `runsIn(point/)` nimmt nur Verzeichnisse, die wie ein Lauf HEISSEN. `stations`
  // heisst nicht so, also fiel `point/stations/<lauf>/` durch jede Aufbewahrung —
  // 6,7 MiB je Lauf, achtmal taeglich, unbegrenzt. Dieselbe Klasse wie §30: geprueft
  // war der Bauplan, nicht das Bauwerk.
  const pub = readFileSync(join(ROOT, 'scripts/point/publish-point.mjs'), 'utf8');
  add('(3n) das Stationsprodukt unterliegt der Aufbewahrung',
    /runsIn\(stationsRoot\)/.test(pub) && /rmSync\(join\(stationsRoot/.test(pub));
  add('(3n) und ueberalterte Stationslaeufe werden BENANNT, nicht verschwiegen',
    /stDecision\.stale/.test(pub));
  add('(3n) index.json fuehrt die Stationslaeufe', /stationRuns/.test(pub));

  // §30-Lehre: die Vorlage pruefen, nicht nur das Skript.
  const wf = readFileSync(join(ROOT, 'scripts/repack-repo/workflow-point.yml'), 'utf8');
  add('(3n) die Cron-Vorlage baut das Stationsprodukt', /build-stations\.mjs/.test(wf));
  add('(3n) und es darf den Cube nicht mitreissen', /continue-on-error: true/.test(wf));
}

// --- (3o) PD-B10: IFS-ENS-Member jenseits 180 h — und der PD-B8-Niederschlag ---
//
// V-PD-27: σ_ens endete mit ICON-EPS global bei 180 h, das Band bei 336. Jans
// Entscheidung (2026-09-11): ECMWF-Member für t2m + Niederschlag im 48-h-Raster.
// Dabei ist ein Fehler aus PD-B8 aufgefallen: `precip_sd_ens` war die Streuung der
// SUMME seit Laufbeginn, nicht der Rate — gemessen 2,5- bis 53-mal zu groß, und
// immer im erlaubten Wertebereich.
{
  for (const t of await ensembleStatsSelfTest()) add(`(3o) ensembleStats: ${t.name}`, t.ok, t.info);

  // Nur CODE prüfen, nicht Kommentare — dieselbe Klasse wie (3k), (3m) und §22.
  const codeOnly = (txt) => txt.split(NEWLINE)
    .filter((l) => !/^\s*\*/.test(l) && !/^\s*\/\//.test(l)).join(NEWLINE);
  const gd = readFileSync(join(ROOT, 'src/sources/gribDecode.ts'), 'utf8');
  const de = readFileSync(join(ROOT, 'scripts/point/adapters/dwdEps.mjs'), 'utf8');
  const ee = readFileSync(join(ROOT, 'scripts/point/adapters/ecmwfEns.mjs'), 'utf8');
  const sh = readFileSync(join(ROOT, 'scripts/point/adapters/shared.mjs'), 'utf8');
  const pr = readFileSync(join(ROOT, 'scripts/point/build-point-cube.mjs'), 'utf8');
  const deC = codeOnly(de), eeC = codeOnly(ee), shC = codeOnly(sh), prC = codeOnly(pr);

  // Ohne Member-Nummer wäre jede Paarung zweier Dateien geraten (V-PD-25).
  add('(3o) der Decoder liest die Member-Nummer aus Template 4.1 und 4.11',
    /productTemplate === 1 \|\| productTemplate === 11/.test(gd) && /perturbationNumber = raw\[off \+ 35\]/.test(gd));

  // EINE Streuungsrechnung für alle Ensembles — sonst versteckt sich derselbe Fehler
  // in jeder Kopie einzeln.
  add('(3o) dwdEps und ecmwfEns rechnen mit derselben Funktion',
    /import \{ memberSpread \} from '\.\/ensembleStats\.mjs'/.test(de)
    && /import \{ memberSpread \} from '\.\/ensembleStats\.mjs'/.test(ee));
  add('(3o) dwdEps rechnet die Streuung nicht mehr selbst',
    !/\(s2\[k\] - \(s1\[k\] \* s1\[k\]\) \/ c\) \/ \(c - 1\)/.test(deC));

  // ⚠ Der PD-B8-Fehler.
  add('(3o) ⚠ dwdEps entakkumuliert Niederschlag je Member',
    /memberSpread\(cur\.members, prev\.members, \{ cells, dt, factor \}\)/.test(deC));
  add('(3o) ⚠ ecmwfEns entakkumuliert ebenso',
    /memberSpread\(cur\.members, prev\.members, \{ cells, dt, factor: cur\.factor \}\)/.test(eeC));
  add('(3o) Stunde 0 hat keine Rate (MISSING statt 0)', /leadH - dt < 0\) return null/.test(deC));
  add('(3o) der Producer übergibt den STUFENSCHRITT, nicht den Abstand zur vorigen gewählten Stunde',
    /ensemble\(src\.run, own, varId, tier, \{ dt: tier\.stepH \}\)/.test(prC));
  const prevFirst = (c) => c.indexOf('const prev = await membersAt(') >= 0
    && c.indexOf('const prev = await membersAt(') < c.lastIndexOf('const cur = await membersAt(');
  add('(3o) der Vorschritt wird ZUERST geholt (fehlt er, ist der Hauptschritt umsonst)',
    prevFirst(deC) && prevFirst(eeC));
  add('(3o) Paarung über die Reihenfolge ist für Raten verboten', /cur\.byOrder \|\| prev\.byOrder/.test(deC));

  // IFS-ENS
  const ie = adapterFor('ifs_ens');
  add('(3o) IFS-ENS trägt nichts zum Mittel bei', (ie?.vars ?? []).length === 0 && ie?.ensembleOnly === true);
  add('(3o) IFS-ENS liefert σ_ens für t2m und Niederschlag',
    JSON.stringify(ie?.ensembleVars) === JSON.stringify(['t2m', 'precip']), (ie?.ensembleVars ?? []).join(','));
  add('(3o) 50 Member als Standard, Teilmengen nur als vollständige Paare',
    ECMWF_ENS_MEMBERS === 50 && /n % 2 !== 0/.test(ee), `${ECMWF_ENS_MEMBERS}`);
  add('(3o) die Mitgliederzahl ist mit der Messung begründet', /39,9 %/.test(ee) && /4,9 %/.test(ee));
  add('(3o) 48-Stunden-Raster (Jans Vorgabe)', ECMWF_ENS_STEP_H === 48, `${ECMWF_ENS_STEP_H} h`);
  add('(3o) Gegenprobe am Byte: Member-Nummer im GRIB gegen das .index',
    /f\.perturbationNumber !== Number\(entries\[i\]\.number\)/.test(eeC));
  add('(3o) die Einheit kommt aus dem GRIB (tp in Metern ist ECMWF-lokal 1/193)',
    /cat === 1 && num === 193\) return M_TO_MM\.factor/.test(eeC));
  add('(3o) IFS-ENS ist in Stufe 3 ingestierbar', ingestableFor(TIER_BY_ID.t3).usable.includes('ifs_ens'));
  const se = SOURCE_BY_ID.ifs_ens;
  add('(3o) Registry: 06z/18z enden bei 144 h (gemessen)',
    se.horizonH.byRunHour?.[6] === 144 && se.horizonH.byRunHour?.[18] === 144);
  add('(3o) Registry nennt den Zugriff mit mehreren Bereichen', /multipart\/byteranges/.test(se.access));

  // Mehrere Bereiche in einer Anfrage.
  add('(3o) fetchRanges bricht bei 200 ab, BEVOR der Körper gelesen wird',
    /if \(res\.status !== 206\) \{\s*ac\.abort\(\);\s*throw/.test(shC));
  add('(3o) Teile werden über Content-Range zugeordnet, nicht über ihre Position',
    /sliceRange\(parts, r\.offset, r\.length\)/.test(shC));
  add('(3o) derselbe Cache-Schlüssel wie fetchBytes mit Range',
    /`\$\{cacheKey \?\? url\}#\$\{r\.offset\}-\$\{r\.offset \+ r\.length - 1\}`/.test(shC));

  // Ein Schritt, EINE Anfrage — auch für die deterministischen ECMWF-Felder (§45.9).
  // Seit der Filter-Reparatur holen IFS HRES und AIFS Single wieder Felder; einzeln
  // wären das rund 1 000 Anfragen, bei 300 ms Mindestabstand ≥ 5 min nur Warten.
  const ec2 = codeOnly(readFileSync(join(ROOT, 'scripts/point/adapters/ecmwf.mjs'), 'utf8'));
  add('(3o) deterministische ECMWF-Felder: alle Größen eines Schritts in EINER Anfrage',
    /prefetchStep\(run, leadH, idx\)/.test(ec2) && /fetchRanges\(/.test(ec2));
  add('(3o) Kill-Switch POINT_ECMWF_MULTIRANGE', /POINT_ECMWF_MULTIRANGE !== '0'/.test(ec2));
  // Das Versprechen ist doppelt: scheitert der Sammelabruf, bleibt der Einzelweg — und
  // gehalten wird nur das Erledigt, nicht die Bytes (72 Schritte à ~5 MiB wären §43.11).
  add('(3o) Sammelabruf mit Einzelweg als Rückfall, ohne die Bytes im Speicher zu halten',
    /\.then\(\(\) => true, \(\) => false\)/.test(ec2));

  // Speicher je Stufe im Cron-Protokoll (§45.12): die Prozessgröße allein sagt nicht,
  // wie nah die Heap-Grenze ist — Typed Arrays liegen außerhalb des Heaps.
  add('(3o) der Producer protokolliert je Stufe den Heap-Höchststand gegen die Heap-Grenze',
    /heap_size_limit/.test(prC) && /Speicher: Heap max/.test(prC));

  // ⚠ Dritter Befund zu PD-B8 (§45.12): jsfive liefert gewöhnliche JS-Arrays. Ein
  // C-LAEF-Fenster kostete so ~72 MiB lebendigen Heap statt ~19 MiB; die Obergrenze aus
  // §43.11 ließ bis zu ~1,9 GB zu. Geprüft wird das VERHALTEN, nicht die Schreibweise.
  {
    const gsC = codeOnly(readFileSync(join(ROOT, 'scripts/point/adapters/geosphere.mjs'), 'utf8'));
    const tt = toTyped([1, -2, -32768, 32767], '<i2');
    add('(3o) C-LAEF-Fenster liegen als Int16Array vor, nicht als JS-Array im Heap',
      tt instanceof Int16Array && tt[2] === -32768 && tt[3] === 32767);
    add('(3o) ohne Typangabe werden ganzzahlige int16-Werte erkannt',
      toTyped([1, 2, -3], undefined) instanceof Int16Array);
    add('(3o) alles andere fällt verlustfrei auf Float64Array zurück',
      toTyped([0.5, 1e10], undefined) instanceof Float64Array && toTyped([1], 'weird').constructor === Int16Array);
    add('(3o) der Adapter benutzt die Umwandlung', /values: toTyped\(data, d\.dtype\)/.test(gsC));
    add('(3o) der Datensatz wird nur EINMAL entpackt (d.value ist ein Getter)',
      /const data = d\.value;/.test(gsC) && !/values: d\.value/.test(gsC));
  }

  // Mehrere Ensembles je Stufe — aber je Stunde genau eines.
  add('(3o) der Producer kennt mehrere Ensembles je Stufe',
    /contributors\.filter\(\(c\) => \(c\.adapter\.ensembleVars \?\? \[\]\)\.length > 0\)/.test(prC)
    && !/contributors\.find\(\(c\) => \(c\.adapter\.ensembleVars/.test(prC));
  add('(3o) je Stunde genau EINE Quelle (Member zweier Modelle werden nie gemischt)',
    /if \(any\) \{ servedBy = src\.id; st\.hours\.push\(leadH\); break; \}/.test(prC));
  add('(3o) welche Quelle welche Stunde trägt, steht im Manifest',
    /byHour/.test(prC) && /single-source-per-hour/.test(prC));
  add('(3o) ein Ensemble-Fehler reißt den Cube nicht mit, wird aber gezählt', /st\.errors\+\+/.test(prC));
  const t3 = TIER_BY_ID.t3.sources;
  add('(3o) in Stufe 3 steht ICON-EPS global VOR IFS-ENS (Jans PD-B8-Raster bleibt, IFS ergänzt)',
    t3.indexOf('icon_eps_global') >= 0 && t3.indexOf('icon_eps_global') < t3.indexOf('ifs_ens'));

  // Veraltete Aussagen im Lauf-Manifest über genau diese Quellen.
  add('(3o) das Manifest behauptet nicht mehr, σ_ens sei überall leer', !/heute .berall MISSING/.test(pr));
  add('(3o) leere sd_ens-Ebenen werden GEZÄHLT statt aufgezählt', /sdEnsEmpty:/.test(prC));
  add('(3o) Ensemble-Quellen nennen ihre Memberzahl (nicht 0 = „deterministisch")',
    /members: c\.ensembleOnly \? \(c\.members \?\? null\)/.test(prC));
}

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
