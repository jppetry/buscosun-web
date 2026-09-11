/**
 * manifest.ts — die Manifeste der Punkt-Linie (Phase PD-A,
 * `audit/punktdaten-versorgung.md` §17).
 *
 * Vier Dateien, vier Zwecke:
 *
 *   `point/index.json`     welche Läufe es gibt, welcher Commit sie trägt, welche
 *                          Ebenen mit welcher Skala — das Gegenstück zum `index.json`
 *                          der Kartenlinie
 *   `point/<lauf>/run.json` der Zeiger je Lauf (Muster `runs/<lauf>/index.json`, BW-9:
 *                          ein NEUER Pfad ist am CDN sofort frisch, ein bestehender nicht)
 *   `point/sources.json`   die Quellenmatrix maschinenlesbar
 *   `point/calib.json`     die Kalibrierung mit Herkunft je Wert
 *
 * ── Die Regel aus dem README des Daten-Repos, hier durchgesetzt ────────────
 * „Ein Bild ohne seinen Eintrag in `index.json` ist bedeutungslos."
 * Für den Cube gilt dasselbe schärfer: eine int16-Ebene ohne ihre Skala ist Zahlensalat,
 * und `ABLAUFPLAENE.md` PAP 6 rechnet mit der Skala (`σ_quant² = Δ²/12`). Deshalb steht
 * die vollständige Ebenenliste MIT Skala in jedem Manifest — nicht als Verweis auf Code.
 */

import {
  CUBE_SCHEMA, CUBE_PLANES, CHUNK_CELLS, TIERS, POINT_DIR, POINT_INDEX_PATH,
  POINT_SOURCES_PATH, POINT_CALIB_PATH, STATIONS_DIR, STATION_CATALOG_PATH, type TierId,
} from './cubeFormat';
import { nowcastManifest } from './nowcastFormat';

/** Basis des Daten-CDNs — dieselbe Konstante wie die Kartenlinie (`repackManifest.mjs`). */
export const CDN_BASE = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data';
export const POINT_INDEX_URL = `https://raw.githubusercontent.com/jppetry/buscosun-data/main/${POINT_INDEX_PATH}`;
export const POINT_INDEX_CDN_URL = `${CDN_BASE}@main/${POINT_INDEX_PATH}`;

/**
 * ── Aufbewahrung: 24 Stunden, quellenunabhängig (Jans Entscheidung 2026-09-09) ──
 *
 * Im Daten-Repo liegen nur Daten der **letzten 24 Stunden**, gleich aus welcher Quelle.
 * Das ist eine Obergrenze für das ALTER eines Laufs, **nicht** für seinen Horizont:
 * ein Lauf von heute trägt weiterhin die vollen 0–336 h; er fällt heraus, sobald er
 * selbst älter als 24 h ist. Für das Produkt heißt das: die Vorhersage, die ein Nutzer
 * bekommt, ist nie älter als einen Tag.
 *
 * **Alter statt Anzahl.** `keep: N` war die Regel der Kartenlinie (4 Läufe ≈ 12 h) und
 * hängt am Takt: ändert sich die Zahl der Slots, ändert sich die vorgehaltene Zeit,
 * ohne dass jemand die Regel angefasst hätte. Ein Alter sagt, was gemeint ist.
 *
 * **Der Boden ist trotzdem nötig.** V-BW-58 belegt, dass Publishes ausfallen
 * (2026-09-04 dreimal; 15z fiel ganz aus, die Karte stand sechs Stunden auf 12z).
 * Fallen mehrere Slots hintereinander aus, altern ALLE Läufe heraus — und ein leeres
 * Repo ist schlimmer als ein altes. Deshalb bleiben immer mindestens zwei Läufe
 * stehen, auch wenn sie die 24 h reißen; das Manifest weist sie dann als überaltert
 * aus, statt sie zu verschweigen.
 */
export const RETENTION_HOURS = 24;
export const MIN_RUNS = 2;

/**
 * Was von der Aufbewahrung AUSGENOMMEN ist, weil es kein Alter hat.
 *
 * Der Stationskatalog, das Quellenregister, die Kalibrierung und die Modellorographie
 * der Kartenlinie haben kein Alter: sie ändern sich mit der Sache, nicht mit der Uhr.
 * Würde die 24-h-Regel blind gelten, wäre der Stationskatalog nach einem Tag weg und
 * jedes Stationsbündel unlesbar (die Zuordnung Spalte → Station steckt dort).
 * Deshalb steht die Ausnahme als Liste und nicht als Erinnerung.
 */
export const TIMELESS_PATHS: readonly string[] = Object.freeze([
  STATION_CATALOG_PATH,      // der Stationskatalog: Orte und Höhen altern nicht
  `${POINT_DIR}/sources.json`,
  `${POINT_DIR}/calib.json`,
  `${POINT_DIR}/index.json`,
  'hsurf-v1.png',
  'index.json',
]);

/** Ist dieser Pfad von der 24-h-Regel ausgenommen? */
export function isTimeless(path: string): boolean {
  return TIMELESS_PATHS.some((t) => (t.endsWith('/') ? path.startsWith(t) : path === t));
}

/**
 * Welche Läufe bleiben. `runs` absteigend nach Lauf-Zeit; gibt die zu behaltenden
 * zurück und markiert, welche davon nur wegen des Bodens überleben.
 */
export function runsToKeep<T extends { run: string; runAt: string | null }>(
  runs: readonly T[], nowMs = Date.now(),
): { keep: T[]; drop: T[]; stale: T[] } {
  const sorted = [...runs].sort((a, b) => (a.run < b.run ? 1 : -1));
  const ageH = (r: T) => (r.runAt ? (nowMs - Date.parse(r.runAt)) / 3_600_000 : Infinity);
  const fresh = sorted.filter((r) => ageH(r) <= RETENTION_HOURS);
  const keep = fresh.length >= MIN_RUNS ? fresh : sorted.slice(0, MIN_RUNS);
  const keepIds = new Set(keep.map((r) => r.run));
  return {
    keep,
    drop: sorted.filter((r) => !keepIds.has(r.run)),
    stale: keep.filter((r) => ageH(r) > RETENTION_HOURS),
  };
}

export interface PointTierManifest {
  id: TierId;
  deg: number;
  lat0: number; lon0: number; ny: number; nx: number;
  chunk: { cells: number; cy: number; cx: number };
  leadHours: readonly number[];
  files: Array<{ file: string; bytes: number; cy: number; cx: number }>;
}

export interface PointRunManifest {
  schema: number;
  run: string;
  runAt: string;
  tiers: PointTierManifest[];
  planes: Array<{ id: string; unit: string; scale: number; offset: number; group: string }>;
  sources: Array<{ id: string; name: string; runAt: string; fromH: number; toH: number; attribution: string; licence: string }>;
  missing: string[];
  note?: string;
}

/** Die Ebenenliste, wie sie in jedes Manifest geschrieben wird. */
export function planeManifest() {
  return CUBE_PLANES.map((p) => ({
    id: p.id, unit: p.unit, scale: p.scale, offset: p.offset, group: p.group,
    // Zu WELCHER Größe die Ebene gehört und WAS sie ist. Ohne diese beiden Felder müsste
    // ein Leser die Bedeutung aus dem Namen raten („endet auf _sd_ens, also …") — genau
    // die Sorte stillschweigender Konvention, an der die Repack-Linie schon einmal
    // gescheitert ist (Schlüssel ≠ Dateipräfix, PD0 R-2).
    of: p.varId,
    kind: p.kind,
    // Δ für `σ_quant² = Δ²/12` — der Client soll ihn nicht aus `scale` „wissen" müssen.
    quantStep: p.scale,
  }));
}

/** Die Stufenbeschreibung ohne Dateien — was auch ohne Lauf gilt. */
export function tierManifest() {
  return TIERS.map((t) => ({
    id: t.id, label: t.label, deg: t.deg,
    lat0: t.lat0, lon0: t.lon0, ny: t.ny, nx: t.nx,
    fromH: t.fromH, toH: t.toH, stepH: t.stepH,
    steps: t.leadHours.length,
    chunk: { cells: CHUNK_CELLS, cy: t.chunk.cy, cx: t.chunk.cx },
    sources: t.sources,
  }));
}

/**
 * `point/index.json`. `commit` füllt der Publisher NACH dem Commit — vorher ist er
 * `null`, denn ein Manifest, das einen Commit behauptet, den es nicht gibt, wäre
 * schlimmer als eines ohne.
 */
export function buildPointIndex(opts: {
  commit: string | null;
  publishedAt: string;
  runs: Array<{ run: string; runAt: string; path: string; tiers: string[]; sources: string[]; bytes: number }>;
  /**
   * Die Läufe des Stationsprodukts. Getrennt von `runs`, weil es ein getrenntes
   * Produkt mit eigener Zeitachse ist — wer beide in eine Liste würfe, machte aus
   * dem Unterschied ein Versehen.
   */
  stationRuns?: Array<{ run: string; runAt: string | null; ageH: number | null; path: string;
    manifest: string; stationCount: number | null; leadHours: number | null; bytes: number }>;
}) {
  return {
    schema: CUBE_SCHEMA,
    commit: opts.commit,
    base: CDN_BASE,
    publishedAt: opts.publishedAt,
    retentionHours: RETENTION_HOURS,
    minRuns: MIN_RUNS,
    timeless: TIMELESS_PATHS,
    dir: POINT_DIR,
    sources: POINT_SOURCES_PATH,
    calibration: POINT_CALIB_PATH,
    stations: { dir: STATIONS_DIR, catalog: STATION_CATALOG_PATH,
      runs: opts.stationRuns ?? [],
      source: 'mosmix_l',
      axis: 'eigene Achse, stuendlich bis 247 h — NICHT die Stufenachse des Cubes (die ist ab 51 h dreistuendlich).',
      note: 'Stationsvorhersagen (MOSMIX) sind ein EIGENES Produkt, kein Gitter — s. cubeFormat.ts. Gebündelt nach dem Chunk-Raster der Stufe 1, gleicher Container, Zuordnung Spalte → Station im Lauf-Manifest.' },
    // Die 0–3-h-Zeile der Quellenmatrix. Sie liegt seit RD3 im Repo — aber nirgends stand,
    // WIE man daraus einen Punktwert gewinnt, und dass Byte 0 zweideutig ist (PD-B3).
    nowcast: nowcastManifest(),
    tiers: tierManifest(),
    planes: planeManifest(),
    runs: opts.runs,
    producer: 'buscosun-web/scripts/point/build-point-cube.mjs',
    note: 'Punkt-Cube (Zeitreihe je Ort). Die Kartenlinie liegt unverändert in index.json / runs/.',
  };
}
