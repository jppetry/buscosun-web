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
  // PD-C4 (Plan PD-C11): das statische Produkt (Versiegelung, Gebäudehöhe aus GHS-BUILT)
  // altert mit dem Datensatz-Jahrgang, nicht mit der Uhr. Präfix mit Schrägstrich — der
  // Jahrgang steht als Unterverzeichnis (`point/static/ghs-2023-v1/`).
  `${POINT_DIR}/static/`,
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

// ---------------------------------------------------------------------------
// Das Lauf-Manifest (`point/<run>/run.json`) — der Vertrag zwischen Producer und Client
// ---------------------------------------------------------------------------
//
// PD-C4: Bis hier deklarierte dieser Typ ein Feld `missing`, das kein Producer je
// geschrieben hat, und kannte weder Quantile, Ensemble, Profil, `ageH` noch die
// Fehler- und Netzfelder aus PD-C2 — er beschrieb ein Manifest, das es nicht gibt.
// Jetzt ist er aus dem TATSÄCHLICHEN Output von `runManifest()` in
// `scripts/point/build-point-cube.mjs` abgeschrieben, und `validateRunManifest()` hält
// jedes echte Manifest dagegen (Verifier, später der Client-Leser, PD-C12).

/** Was `sources[]` je (Stufe, Quelle) trägt. */
export interface PointSourceManifest {
  id: string; name: string; tier: TierId; runAt: string;
  fromH: number; toH: number;
  /** Zahl der Stunden, die der Lauf dieser Quelle in dieser Stufe trägt (aus `leadsFor`). */
  steps: number;
  /** 0 = deterministisch, 1 = nur Kontrolllauf, n = Member einer reinen σ_ens-Quelle. */
  members: number | null;
  role: 'assigned' | 'diversity';
  coverage: 'full' | 'partial';
  /** Stunden, die der Lauf dieser Quelle VOR dem Publikationslauf liegt (Gültigzeit, §37). */
  offsetH: number;
  geometry: { cells: number; covered: number; domain: unknown; clip: unknown; edgeMarginKm: number; from: string } | null;
  attribution: string | null; licence: string | null;
  /** PD-C2 (V-PD-40): Fehler dieser Quelle in dieser Stufe; `dropped` = ab hier nicht mehr gefragt. */
  errors: number;
  firstError: string | null;
  dropped: { reason: string; errors: number; firstError: string | null } | null;
}

/** Netzvolumen einer Quelle in einer Stufe (PD-C2). */
export interface PointNetStat {
  files: number; bytes: number; ms: number; cached: number; absent: number; throttled: number; probes: number;
}

export interface PointTierManifest {
  id: TierId;
  deg: number;
  lat0: number; lon0: number; ny: number; nx: number;
  chunk: { cells: number; cy: number; cx: number };
  /** QUELL-Lauf dieser Stufe — das Verzeichnis heißt nach dem PUBLIKATIONSLAUF (§26). */
  run: string; runAt: string;
  /** Stunden, die der Quell-Lauf hinter dem Publikationslauf liegt. */
  ageH: number;
  leadHours: readonly number[];
  files: Array<{ file: string; bytes: number; cy: number; cx: number }>;
  quantiles: { source: string; run: string; vars: string[]; levels: string[]; steps: number; missing: number;
    cellsWritten: number; provenance: string; note: string | null; caveat: string } | null;
  ensemble: { sources: Array<Record<string, unknown>>; byHour: Record<string, string>; steps: number; missing: number;
    provenance: string; rule: string; precip: string; caveat: string } | null;
  profile: { source: string; run: string; stepH: number; levels: unknown; steps: number; missing: number;
    inversionShare: number; params: unknown; provenance: string; why: string; calibrated: boolean; calibNote: string } | null;
  /** PD-C2: Netz je Quelle in dieser Stufe; `null` bei einem älteren Producer. */
  net: Record<string, PointNetStat> | null;
  dropped: Array<{ id: string; reason: string }>;
}

export interface PointRunManifest {
  schema: number;
  run: string;
  runAt: string;
  tiers: PointTierManifest[];
  planes: Array<{ id: string; unit: string; scale: number; offset: number; group: string }>;
  sources: PointSourceManifest[];
  fusion: {
    weights: string; provenance: string; note: string; sigma: string; resolutionCaveat: string; memberBias: string;
    spread: { div: string; ens: string; rule: string; doNotAdd: string; noEns: string; sdEnsEmpty: string[] };
    geometry: string; validTime: string; runChoice: string;
  };
  /** Quelle → Grund, warum sie in einer Stufe übersprungen wurde. */
  skipped: Record<string, string>;
  /** Quelle → Grund, warum es keinen Ingest gibt (aus `adapters/index.mjs`). */
  pending: Record<string, string>;
  /** Gesetzt von `--run` (PD-C2): die Obergrenze der Laufsuche. */
  note?: string;
}

const TIER_IDS: readonly string[] = TIERS.map((t) => t.id);

/**
 * Hält ein Manifest gegen den Vertrag oben. Gibt die Liste der Verstöße zurück — leer
 * heißt gültig. Ohne Abhängigkeit, damit Producer-Verifier UND Browser sie ausführen.
 *
 * Geprüft wird das AKTUELLE Schema: ein Manifest eines älteren Producers (Schema 1–3)
 * fällt an der ersten Zeile durch, statt an einer zufälligen späteren — das ist gewollt,
 * `check-cdn.mjs` liest ältere Läufe über die Ebenenliste, nicht über diesen Typ.
 */
export function validateRunManifest(json: unknown): string[] {
  const errs: string[] = [];
  const err = (s: string) => { errs.push(s); };
  if (json == null || typeof json !== 'object') return ['kein Objekt'];
  const m = json as Record<string, unknown>;
  const isNum = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const isStr = (v: unknown) => typeof v === 'string' && v.length > 0;
  const isRun = (v: unknown) => typeof v === 'string' && /^\d{10}$/.test(v);
  const isIso = (v: unknown) => typeof v === 'string' && !Number.isNaN(Date.parse(v));
  const isObj = (v: unknown) => v != null && typeof v === 'object' && !Array.isArray(v);
  const objOrNull = (v: unknown) => v === null || isObj(v);

  if (m.schema !== CUBE_SCHEMA) err(`schema ${String(m.schema)} ≠ ${CUBE_SCHEMA}`);
  if (!isRun(m.run)) err('run: kein YYYYMMDDHH');
  if (!isIso(m.runAt)) err('runAt: keine Zeit');
  if (m.note != null && typeof m.note !== 'string') err('note: kein Text');

  if (!Array.isArray(m.tiers) || m.tiers.length === 0) err('tiers: leer oder kein Array');
  const tierIds = new Set<string>();
  for (const [i, tRaw] of (Array.isArray(m.tiers) ? m.tiers : []).entries()) {
    const at = `tiers[${i}]`;
    if (!isObj(tRaw)) { err(`${at}: kein Objekt`); continue; }
    const t = tRaw as Record<string, unknown>;
    if (!TIER_IDS.includes(String(t.id))) err(`${at}.id ${String(t.id)} unbekannt`);
    if (tierIds.has(String(t.id))) err(`${at}.id ${String(t.id)} doppelt`);
    tierIds.add(String(t.id));
    for (const k of ['deg', 'lat0', 'lon0', 'ny', 'nx', 'ageH']) if (!isNum(t[k])) err(`${at}.${k}: keine Zahl`);
    if (!isRun(t.run)) err(`${at}.run: kein YYYYMMDDHH`);
    if (!isIso(t.runAt)) err(`${at}.runAt: keine Zeit`);
    const ch = t.chunk as Record<string, unknown> | undefined;
    if (!isObj(ch) || !isNum(ch!.cells) || !isNum(ch!.cy) || !isNum(ch!.cx)) err(`${at}.chunk: {cells,cy,cx} fehlt`);
    if (!Array.isArray(t.leadHours) || !t.leadHours.every(isNum)) err(`${at}.leadHours: keine Zahlenliste`);
    if (!Array.isArray(t.files)) err(`${at}.files: kein Array`);
    else for (const [j, fRaw] of t.files.entries()) {
      const f = fRaw as Record<string, unknown>;
      if (!isObj(f) || !isStr(f.file) || !isNum(f.bytes) || !isNum(f.cy) || !isNum(f.cx)) { err(`${at}.files[${j}]: {file,bytes,cy,cx} fehlt`); continue; }
      const want = `${POINT_DIR}/${String(m.run)}/${String(t.id)}/`;
      if (!String(f.file).startsWith(want)) err(`${at}.files[${j}].file liegt nicht unter ${want} (§26: ein Verzeichnis = eine Veröffentlichung)`);
    }
    for (const k of ['quantiles', 'ensemble', 'profile', 'net']) if (!(k in t) || !objOrNull(t[k])) err(`${at}.${k}: fehlt oder weder Objekt noch null`);
    if (!Array.isArray(t.dropped)) err(`${at}.dropped: kein Array`);
    if (isObj(t.profile)) {
      const p = t.profile as Record<string, unknown>;
      if (p.calibrated !== false) err(`${at}.profile.calibrated muss false sein, solange nichts gemessen ist`);
      if (!isNum(p.inversionShare)) err(`${at}.profile.inversionShare: keine Zahl`);
    }
    if (isObj(t.ensemble)) {
      const e = t.ensemble as Record<string, unknown>;
      if (!isObj(e.byHour)) err(`${at}.ensemble.byHour fehlt (welche Quelle welche Stunde trägt)`);
      if (!Array.isArray(e.sources)) err(`${at}.ensemble.sources: kein Array`);
    }
  }

  if (!Array.isArray(m.planes) || m.planes.length === 0) err('planes: leer');
  else for (const [i, pRaw] of m.planes.entries()) {
    const p = pRaw as Record<string, unknown>;
    if (!isObj(p) || !isStr(p.id) || typeof p.unit !== 'string' || !isNum(p.scale) || !isNum(p.offset) || !isStr(p.group)) err(`planes[${i}]: {id,unit,scale,offset,group} fehlt`);
  }

  if (!Array.isArray(m.sources)) err('sources: kein Array');
  else for (const [i, sRaw] of m.sources.entries()) {
    const at = `sources[${i}]`;
    if (!isObj(sRaw)) { err(`${at}: kein Objekt`); continue; }
    const s = sRaw as Record<string, unknown>;
    if (!isStr(s.id) || !isStr(s.name)) err(`${at}: id/name fehlt`);
    if (!TIER_IDS.includes(String(s.tier))) err(`${at}.tier ${String(s.tier)} unbekannt`);
    if (!isIso(s.runAt)) err(`${at}.runAt: keine Zeit`);
    for (const k of ['fromH', 'toH', 'steps', 'offsetH', 'errors']) if (!isNum(s[k])) err(`${at}.${k}: keine Zahl`);
    if (!(s.members === null || isNum(s.members))) err(`${at}.members: weder Zahl noch null`);
    if (!['assigned', 'diversity'].includes(String(s.role))) err(`${at}.role ${String(s.role)} unbekannt`);
    if (!['full', 'partial'].includes(String(s.coverage))) err(`${at}.coverage ${String(s.coverage)} unbekannt`);
    if (!objOrNull(s.geometry)) err(`${at}.geometry: weder Objekt noch null`);
    if (!objOrNull(s.dropped)) err(`${at}.dropped: weder Objekt noch null`);
    if (!(s.firstError === null || typeof s.firstError === 'string')) err(`${at}.firstError: weder Text noch null`);
    if (isObj(s.dropped) && (s.errors as number) === 0) err(`${at}: dropped ohne Fehler`);
  }

  if (!isObj(m.fusion)) err('fusion fehlt');
  else {
    const f = m.fusion as Record<string, unknown>;
    for (const k of ['weights', 'provenance', 'note', 'sigma', 'resolutionCaveat', 'memberBias', 'geometry', 'validTime', 'runChoice']) if (!isStr(f[k])) err(`fusion.${k}: fehlt`);
    if (f.weights === 'equal' && f.provenance !== 'fallback') err('fusion: gleiche Gewichte müssen als fallback ausgewiesen sein');
    const sp = f.spread as Record<string, unknown> | undefined;
    if (!isObj(sp)) err('fusion.spread fehlt');
    else {
      for (const k of ['div', 'ens', 'rule', 'doNotAdd', 'noEns']) if (!isStr(sp![k])) err(`fusion.spread.${k}: fehlt`);
      if (!Array.isArray(sp!.sdEnsEmpty)) err('fusion.spread.sdEnsEmpty: keine Liste (gezählt, nicht behauptet)');
    }
  }
  if (!isObj(m.skipped)) err('skipped: kein Objekt (Quelle → Grund)');
  if (!isObj(m.pending)) err('pending: kein Objekt (Quelle → Grund)');
  return errs;
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
