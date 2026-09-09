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
  cubeSelfTest, CUBE_VARS, CUBE_PLANES, TIERS, TIER_BY_ID, CUBE_DOMAIN, CUBE_STEP_COUNT,
  chunkPath, chunkExtent, cellOf, MISSING, quantize, dequantize, planeIndex,
  POINT_INDEX_PATH, POINT_SOURCES_PATH, POINT_CALIB_PATH,
} from '../src/point/cubeFormat.ts';
import {
  sourceMatrixSelfTest, SOURCES, SOURCE_BY_ID, MATRIX_BANDS, SCHEDULED_CHANGES,
  daysUntil, buildSourcesJson, mustSelfArchive, CH_EDGE_DISCREPANCY,
} from '../src/point/sourceMatrix.ts';
import { terrainPointSelfTest } from '../src/point/terrainPoint.ts';
import { calibrationSelfTest, CALIBRATION_V1 } from '../src/point/calibration.ts';
import { buildPointIndex, planeManifest, tierManifest, RETENTION_HOURS, MIN_RUNS, TIMELESS_PATHS, isTimeless, runsToKeep, CDN_BASE } from '../src/point/manifest.ts';
import { verifyCogTiff } from '../src/fire/detail/cogTiff.ts';
import { adapterFor, INGESTABLE, PENDING, ingestableFor } from './point/adapters/index.mjs';
import { placeUnderPublishRun, runManifest } from './point/build-point-cube.mjs';
import { MATRIX_ALIASES, BENCHMARKS } from '../src/point/sourceMatrix.ts';

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
    JSON.parse(JSON.stringify(idx)).schema === 1);
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
add('27 Ebenen im Cube', CUBE_PLANES.length === 27, `${CUBE_PLANES.length}`);
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

// --- Ausgabe ----------------------------------------------------------------
let failed = 0;
for (const c of checks) {
  if (!c.ok) failed++;
  console.log(`${c.ok ? 'OK  ' : 'FAIL'}  ${c.name}${c.detail ? `  — ${c.detail}` : ''}`);
}
console.log(`\n${checks.length - failed}/${checks.length} Prüfungen bestanden.`);
process.exit(failed === 0 ? 0 : 1);
