/**
 * nowcastReader.mjs — Punktwerte aus dem gespiegelten Nowcast (PD-B3).
 *
 * `adapters/index.mjs` sagt es seit PD-A selbst: RADVOR RV, INCA und CombiPrecip
 * „liegen bereits als Spiegel … braucht einen Leser, keinen Ingest". Das hier ist der
 * Leser. Er zieht **kein Byte aus dem Netz** — alles steht schon im Daten-Repo.
 *
 * ── Warum er nichts in den Cube schreibt ───────────────────────────────────
 * Siehe `src/point/nowcastFormat.ts`: die Cube-Achse hängt am Modelllauf, und der ist
 * beim Bau 3,4–3,8 h alt. Ein 5-Minuten-Produkt in ein 6-Stunden-Raster zu backen hieße,
 * eine Beobachtung auszuliefern, die beim Lesen längst überholt ist. Der Leser bedient
 * deshalb die Abfragezeit — und den Verifier, der damit die Kodierungsaussage prüft.
 *
 * ── Zwei Wege, mit Absicht ─────────────────────────────────────────────────
 *   `readFrame()`  aus dem Werte-PNG — alle drei Quellen, aber bei 20 mm/h gesättigt.
 *   `readRvExact()` aus dem unveränderten `tar.bz2` — nur DE, dafür OHNE Sättigung.
 *
 * Der zweite Weg ist nicht nur ein Extra: er ist die Gegenprobe, mit der die
 * Sättigungsbehauptung überhaupt belegbar wird (unterhalb 20 mm/h müssen beide Wege
 * bis auf den Quantisierungsschritt übereinstimmen, oberhalb müssen sie auseinandergehen).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from '../lib/png.mjs';
import { decompressBz2 } from '../lib/bz2.mjs';
import { sampleRadarPoint } from '../../src/pointForecast/radarSample.ts';
import { untar, decodeRadolanRaw } from '../../src/sources/radolanDecode.ts';
import { DE1200_CORNERS } from '../../src/sources/radolanGeo.ts';
import {
  NOWCAST_BY_ID, NOWCAST_SOURCES, NOWCAST_VMAX, NOWCAST_IMG_DIR, NOWCAST_RV_RAW_DIR,
  nowcastFramePath, nowcastMetaPath, nowcastFromU8,
} from '../../src/point/nowcastFormat.ts';
import { SOURCE_BY_ID, coversPoint } from '../../src/point/sourceMatrix.ts';

/**
 * Die vorhandenen Slots einer Quelle, **jüngster zuerst**.
 *
 * Der Spiegel hält nur `KEEP = 12` Slots (RV/RZC ≈ 1 h, INCA ≈ 3 h) — er ist ein
 * Live-Spiegel, kein Archiv. Wer hier nichts findet, hat kein Datenproblem, sondern
 * schaut zu spät.
 */
export function listSlots(repoRoot, sourceId) {
  const spec = NOWCAST_BY_ID[sourceId];
  if (!spec) throw new Error(`nowcast: unbekannte Quelle ${sourceId}`);
  const dir = join(repoRoot, NOWCAST_IMG_DIR, spec.dir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => existsSync(join(dir, n, 'meta.json'))).sort().reverse();
}

/** Die Slot-Beschreibung: Maße, Ecken, `vMax`, Frameliste. */
export function readMeta(repoRoot, sourceId, stamp) {
  const spec = NOWCAST_BY_ID[sourceId];
  const p = join(repoRoot, nowcastMetaPath(spec, stamp));
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Die vier Eckpunkte des Gitters als `[lon, lat]`.
 *
 * Für INCA und RZC stehen sie in der `meta.json` — sie ändern sich nicht, aber sie AUS
 * DEN DATEN zu nehmen ist der Unterschied zwischen einer geprüften und einer geglaubten
 * Geometrie. DE1200 hat ein festes Gitter; dort ist die Konstante die Quelle.
 */
function cornersOf(spec, meta) {
  if (spec.cornersFrom === 'de1200') return DE1200_CORNERS;
  if (!Array.isArray(meta?.corners) || meta.corners.length !== 4) {
    throw new Error(`nowcast: ${spec.id} — meta.json ohne brauchbare corners`);
  }
  return meta.corners;
}

/**
 * Ein Frame lesen und an einem Punkt abtasten.
 *
 * `lead` wählt den Vorhersageschritt in Minuten; ohne Angabe der erste (die Analyse).
 * Rückgabe wie `NowcastPoint`: `mmh`, `saturated`, `validAtMs`.
 */
export async function readFrame(repoRoot, sourceId, stamp, lat, lon, lead = null) {
  const spec = NOWCAST_BY_ID[sourceId];
  const meta = readMeta(repoRoot, sourceId, stamp);
  if (!meta) return null;

  // ⚠ Der Drift-Wächter, den auch der Client fährt (`src/sources/radarImg.ts`): weicht das
  // `vMax` des Slots von der erwarteten Skala ab, sind ALLE Werte darin anders gemeint.
  // Lieber laut abbrechen als eine ganze Kachel um den Faktor 5 danebenliegen.
  if (meta.vMax !== NOWCAST_VMAX) {
    throw new Error(`nowcast: ${sourceId}/${stamp} hat vMax ${meta.vMax}, erwartet ${NOWCAST_VMAX}`);
  }

  // ⚠ Die Domäne wird HIER angewandt, nicht beim Aufrufer — und das ist kein Luxus,
  // sondern die Kur für einen gemessenen Fehler (2026-09-09, PD-B3):
  //
  // `decodeRadolanRaw` setzt ausserhalb der Radarabdeckung **NaN**. `precipToU8` bildet
  // NaN auf **0** ab (`!(NaN >= 0.06)`), und 0 heisst im PNG „kein messbarer
  // Niederschlag". Das Werte-PNG wirft damit „keine Abdeckung" und „kein Regen" in
  // DASSELBE Byte. Am echten Slot nachgemessen: Linz und Wien liefern aus dem rohen
  // tar.bz2 `NaN` (keine Abdeckung), aus dem PNG aber **0,0000 mm/h** — eine erfundene
  // Trockenheit, mitten in ⚠¹ („Nicht abgedeckt: Linz, Graz, Klagenfurt, Villach, Wien").
  //
  // Das DE1200-Gitter ist viel groesser als das, was die Radare sehen; genau dafuer
  // fuehrt die Registry `clip`. Ohne diesen Test bekaeme Ostoesterreich eine plausible
  // Null statt einer ehrlichen Luecke.
  const src = SOURCE_BY_ID[sourceId];
  if (src && !coversPoint(src, lat, lon)) return null;

  const frames = meta.frames ?? [];
  const f = lead == null ? frames[0] : frames.find((x) => x.lead === lead);
  if (!f) return null;

  const png = decodePng(readFileSync(join(repoRoot, nowcastFramePath(spec, stamp, f.file))));
  if (png.channels !== 1) throw new Error(`nowcast: ${f.file} hat ${png.channels} Kanäle, erwartet 1`);

  // `sampleRadarPoint` mit vMax = 255 liefert das ROHE Byte zurück (raw/255·255). Die
  // Umkehrung in mm/h macht danach `nowcastFromU8` — an EINER Stelle, mit der
  // Sättigungsregel. Sonst käme aus 255 eine 20, und die wäre eine Erfindung.
  const raw = sampleRadarPoint(
    spec.grid, png.data, png.width, png.height,
    cornersOf(spec, meta), lat, lon, 255,
  );
  if (raw == null) return null;

  const { mmh, saturated } = nowcastFromU8(Math.round(raw));
  const validAtMs = f.validAtMs
    ?? (meta.runAtMs != null ? meta.runAtMs + (f.lead ?? 0) * 60_000 : null)
    ?? (meta.validAtMs ?? null);
  return { mmh, saturated, validAtMs, lead: f.lead ?? 0, stamp };
}

/**
 * Derselbe Punkt aus dem UNVERÄNDERTEN RV-Archiv — ohne Sättigung, ohne Quantisierung.
 *
 * Nur für Deutschland: `radar/rv/DE1200_RV<stamp>.tar.bz2` liegt roh im Spiegel. Der
 * Weg ist teurer (entpacken statt PNG lesen), aber er ist die einzige Stelle, an der ein
 * Starkregen über 20 mm/h seinen echten Wert behält — und er belegt, dass die Aussage
 * über die PNG-Kodierung stimmt.
 */
export async function readRvExact(repoRoot, stamp, lat, lon, lead = 0) {
  const p = join(repoRoot, NOWCAST_RV_RAW_DIR, `DE1200_RV${stamp}.tar.bz2`);
  if (!existsSync(p)) return null;
  const entries = untar(await decompressBz2(new Uint8Array(readFileSync(p))));
  for (const e of entries) {
    const grid = decodeRadolanRaw(e.data);
    if (grid.leadMinutes !== lead) continue;
    // Das Rasterfeld ist Float32 in mm/h. Um DIESELBE Verortung wie der PNG-Weg zu
    // benutzen (und nicht versehentlich eine zweite Geometrie einzuführen), wird es über
    // denselben Abtaster gelesen.
    //
    // ⚠ `sampleRadarQuad` rechnet IMMER `(raw / 255) * vMax` — die Skala steckt fest in
    // der Funktion, weil sie für u8-Kacheln gebaut ist. Für ein Feld, das schon in mm/h
    // vorliegt, ist `vMax = 255` deshalb die Identität. Mit `vMax = 1` (der ersten,
    // naheliegenden Wahl) käme jeder Wert um den Faktor 255 zu klein heraus — und zwar
    // als plausible Zahl: aus 12 mm/h würden 0,047, was wie Nieselregen aussieht.
    const vals = new Float32Array(grid.rainRate);
    const mmh = sampleRadarPoint(
      'radolan_rv', vals, grid.cols, grid.rows, DE1200_CORNERS, lat, lon, 255,
    );
    return { mmh: Number.isFinite(mmh) ? mmh : null, saturated: false, validAtMs: grid.validAt.getTime(), lead, stamp };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Kommandozeile
// ---------------------------------------------------------------------------
// Ein Leser, den man nicht aufrufen kann, ist totes Werkzeug. Aufruf:
//   npm run point:nowcast -- 48.137 11.575
//   npm run point:nowcast -- 48.209 16.373 --repo=data/repo
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const lat = Number(args[0]), lon = Number(args[1]);
  const repo = (args.find((a) => a.startsWith('--repo=')) ?? '--repo=data/repo').slice(7);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    console.error('Aufruf: point:nowcast -- <lat> <lon> [--repo=data/repo]');
    process.exit(2);
  }
  console.log(`Nowcast am Punkt ${lat.toFixed(4)}, ${lon.toFixed(4)} — Spiegel ${repo}\n`);
  for (const spec of NOWCAST_SOURCES) {
    const slots = listSlots(repo, spec.id);
    if (!slots.length) { console.log(`${spec.id}: keine Slots im Spiegel`); continue; }
    const covered = SOURCE_BY_ID[spec.id] && coversPoint(SOURCE_BY_ID[spec.id], lat, lon);
    if (!covered) {
      console.log(`${spec.id}: deckt diesen Punkt NICHT (Domäne aus sources.json)`);
      continue;
    }
    const meta = readMeta(repo, spec.id, slots[0]);
    const leads = (meta?.frames ?? []).map((f) => f.lead);
    const show = leads.filter((_, i) => i % Math.max(1, Math.ceil(leads.length / 6)) === 0);
    const parts = [];
    for (const lead of show) {
      const r = await readFrame(repo, spec.id, slots[0], lat, lon, lead);
      parts.push(`+${String(lead).padStart(3)}min ${r == null ? '—' : r.saturated ? '≥20' : r.mmh.toFixed(2)}`);
    }
    console.log(`${spec.id} @ ${slots[0]} (${slots.length} Slots): ${parts.join(' · ')}  [mm/h]`);
    if (spec.lossless) {
      const e = await readRvExact(repo, slots[0], lat, lon, 0);
      if (e) console.log(`${' '.repeat(spec.id.length)}   verlustfrei aus ${spec.lossless}: ${e.mmh == null ? '— (keine Abdeckung)' : e.mmh.toFixed(4)} mm/h`);
    }
  }
}
