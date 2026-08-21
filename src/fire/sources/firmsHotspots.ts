/**
 * `fireHotspots` — Satelliten-Thermalanomalien aus der **NASA-FIRMS-Area-API**
 * (VIIRS 375 m, NRT). Primärquelle seit Phase F1; GWIS bleibt keyloser Fallback.
 *
 * ── Warum diese Quelle die GWIS-Fensterlayer ablöst ──────────────────────────
 * GWIS liefert live nur `id`, `acq_at`, `CLASS` (V-199) — damit lässt sich weder
 * Intensität noch Verlässlichkeit einer Detektion darstellen. Die Area API führt
 * den vollen Attributsatz: `frp`, `confidence`, `bright_ti4`/`ti5`, `scan`/
 * `track`, `daynight`, `satellite`. Jans Freigabe und die zwei Auflagen stehen
 * in `docs/DATA_SOURCES.md` §W.2.1, die Messung in `audit/waldbrand-firms.md`.
 *
 * ── Der Schlüssel ist NICHT hier ─────────────────────────────────────────────
 * Der MAP_KEY steht ausschließlich in der Umgebungsvariablen `FIRMS_MAP_KEY`
 * und wird von der Edge Function `netlify/edge-functions/firms.ts` serverseitig
 * eingesetzt. Dieses Modul kennt ihn nicht und darf ihn nie kennen: buscosun ist
 * client-only (D-01), eine Konstante hier stünde im Netzwerk-Tab und im Bundle.
 * Es spricht deshalb ausschließlich den eigenen Pfad `/_firms/*` an.
 *
 * ── Drei Fallstricke, die keine Doku nennt (F0 am eigenen Schlüssel gemessen) ─
 *  1. **`acq_time` kommt OHNE führende Nullen.** Werte laufen von `7` bis
 *     `2358`; `33` bedeutet 00:33 UTC, `137` bedeutet 01:37 UTC. Die statische
 *     Regions-CSV füllt dagegen auf `0048` auf. Ohne `padStart(4,'0')` landet
 *     die Detektion still zur falschen Zeit — und nichts sieht kaputt aus.
 *     An 4.707 Detektionen gegengeprüft: 0 ungültige Zeiten, und die
 *     Tag/Nacht-Verteilung trifft exakt die VIIRS-Überflugfenster.
 *  2. **`confidence` ist einbuchstabig** (`l`/`n`/`h`), nicht `low`/`nominal`/
 *     `high` wie in der Regions-CSV. Beide Schreibweisen werden gelesen.
 *  3. **Die Spalte `instrument` gibt es nur hier** (Position 9, Wert `VIIRS`).
 *     Ein positionsbasierter Parser läse ab dort um eine Spalte verschoben und
 *     hielte `VIIRS` für die Konfidenz. Deshalb wird **nach Spaltennamen aus der
 *     Kopfzeile** geparst, nie nach Index.
 *
 * ── Ehrlichkeit ─────────────────────────────────────────────────────────────
 * Eine Detektion ist eine **Thermalanomalie**, keine Einsatzmeldung und kein
 * amtliches Warnprodukt. Der Punkt ist die **Pixelmitte**, nicht das Feuer.
 * `frp` ist eine **Leistung** (MW) — daraus wird **nie** eine Brandfläche in
 * Hektar abgeleitet. Und NRT enthält RT/URT-Detektionen, die bei der
 * Nachverarbeitung verschwinden oder umziehen können.
 */

/** Eigener Proxy-Pfad. Trägt den Schlüssel serverseitig ein — s. Kopf. */
const FIRMS_PROXY = '/_firms';

/**
 * DACH-Ausschnitt in FIRMS-Reihenfolge **west,south,east,north**.
 *
 * ⚠️ Der GWIS-WFS nebenan erwartet in Version 1.1.0 **lat,lon**
 * (`45.5,5.5,55.5,17.5`) — dieselben vier Zahlen, andere Reihenfolge. In F0
 * gemessen: eine vertauschte Box liefert `HTTP 200` mit **null Zeilen**, keinen
 * Fehler. Das ist der teuerste denkbare Nicht-Fehler; nicht „korrigieren".
 */
const DACH_WSEN = '5.5,45.5,17.5,55.5';
const DACH = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };

/** Die drei VIIRS-375-m-NRT-Ströme. NOAA-21 liefert DACH-Daten (F0 belegt). */
export const FIRMS_SOURCES = ['VIIRS_SNPP_NRT', 'VIIRS_NOAA20_NRT', 'VIIRS_NOAA21_NRT'] as const;
export type FirmsSource = (typeof FIRMS_SOURCES)[number];

/** Harte Grenze der API (F0: `days=6` ⇒ `400 Invalid day range. Expects [1..5]`). */
export const MAX_DAY_RANGE = 5;

/**
 * Obergrenze je Fenster. Gemessen liegen 5 Tage × 3 Satelliten bei **4.707**
 * Detektionen, 7 Tage entsprechend bei ~6.600. Der Deckel liegt bewusst
 * deutlich darüber: er soll nur eine entartete Lage abfangen, nicht den
 * Normalfall beschneiden — sonst wäre „Anzeige begrenzt" der Dauerzustand und
 * der Hinweis würde bedeutungslos.
 */
export const MAX_FEATURES = 12_000;

/** Ab diesem Zoom lohnt das Footprint-Rechteck; darunter sind es Subpixel. */
export const FOOTPRINT_MIN_ZOOM = 7;

export const FIRMS_ATTRIBUTION =
  'Detektionen <a href="https://firms.modaps.eosdis.nasa.gov/" target="_blank" rel="noopener">'
  + 'NASA FIRMS</a> / LANCE — VIIRS 375 m (NRT)';

// ---------------------------------------------------------------------------
// Zeilenmodell
// ---------------------------------------------------------------------------

export type FirmsConfidence = 'low' | 'nominal' | 'high';

export interface FirmsRow {
  lat: number;
  lon: number;
  /** Erfassungszeitpunkt in ms UTC. */
  acqMs: number;
  /** Feuerstrahlungsleistung in MW. Leistung, NIE Fläche. */
  frp: number | null;
  confidence: FirmsConfidence | null;
  /** Helligkeitstemperatur Kanal I4 in K. */
  brightTi4: number | null;
  /** Helligkeitstemperatur Kanal I5 in K (Hintergrund). */
  brightTi5: number | null;
  /** Pixelausdehnung quer zur Bahn / längs der Bahn, in km. */
  scanKm: number | null;
  trackKm: number | null;
  /** `N`, `N20`, `N21` … wie von der Quelle geliefert. */
  satellite: string;
  /** `true` = Tagüberflug. */
  day: boolean;
  source: FirmsSource;
}

/**
 * `acq_date` + `acq_time` → ms UTC.
 *
 * Fallstrick 1 aus dem Kopfkommentar. `acq_time` ist **numerisch**: `7`, `33`,
 * `137`, `1230`. Erst auf vier Stellen auffüllen, dann HHMM lesen.
 */
export function acqToUtcMs(date: unknown, time: unknown): number | null {
  if (typeof date !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return null;
  const raw = String(time ?? '').trim();
  if (!/^\d{1,4}$/.test(raw)) return null;
  const p = raw.padStart(4, '0');
  const hh = Number(p.slice(0, 2));
  const mm = Number(p.slice(2));
  if (hh > 23 || mm > 59) return null;
  const ms = Date.parse(`${date.trim()}T${p.slice(0, 2)}:${p.slice(2)}:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * `confidence` → einheitliche Stufe.
 *
 * Fallstrick 2: Die Area API liefert `l`/`n`/`h`, die Regions-CSV
 * `low`/`nominal`/`high`. MODIS führt stattdessen eine Prozentzahl — die wird
 * bewusst **nicht** übersetzt, weil MODIS hier nicht freigegeben ist und eine
 * stille Umdeutung schlimmer wäre als ein `null`.
 */
export function normalizeConfidence(raw: unknown): FirmsConfidence | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'l' || s === 'low') return 'low';
  if (s === 'n' || s === 'nominal') return 'nominal';
  if (s === 'h' || s === 'high') return 'high';
  return null;
}

const num = (v: string | undefined): number | null => {
  if (v == null || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface ParseResult {
  rows: FirmsRow[];
  /** Zeilen, die verworfen wurden (Spaltenzahl, Koordinate, Zeitstempel). */
  skipped: number;
  /** Die Kopfzeile, wie sie kam — für die Diagnose bei Formatwechsel. */
  header: string[];
}

/**
 * CSV → Zeilen. Handgeschrieben (D-06: keine neue Abhängigkeit).
 *
 * **Nach Spaltennamen**, nicht nach Index (Fallstrick 3). Fehlt eine Pflicht-
 * spalte oder passt eine Zeile nicht, wird sie gezählt und übersprungen — eine
 * kaputte Zeile darf nie den ganzen Abruf kippen, aber sie darf auch nicht
 * unbemerkt verschwinden.
 */
export function parseFirmsCsv(text: string, source: FirmsSource): ParseResult {
  const lines = text.split(/\r?\n/);
  const headerLine = lines.find((l) => l.trim() !== '') ?? '';
  const header = headerLine.split(',').map((h) => h.trim());
  const at = (name: string) => header.indexOf(name);

  const iLat = at('latitude');
  const iLon = at('longitude');
  const iDate = at('acq_date');
  const iTime = at('acq_time');
  if (iLat < 0 || iLon < 0 || iDate < 0 || iTime < 0) {
    return { rows: [], skipped: 0, header };
  }
  const iFrp = at('frp');
  const iConf = at('confidence');
  const iTi4 = at('bright_ti4');
  const iTi5 = at('bright_ti5');
  const iScan = at('scan');
  const iTrack = at('track');
  const iSat = at('satellite');
  const iDn = at('daynight');

  const rows: FirmsRow[] = [];
  let skipped = 0;
  const start = lines.indexOf(headerLine) + 1;

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') continue;
    const v = line.split(',');
    if (v.length !== header.length) { skipped++; continue; }

    const lat = num(v[iLat]);
    const lon = num(v[iLon]);
    const acqMs = acqToUtcMs(v[iDate], v[iTime]);
    if (lat == null || lon == null || acqMs == null) { skipped++; continue; }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) { skipped++; continue; }

    rows.push({
      lat,
      lon,
      acqMs,
      frp: iFrp >= 0 ? num(v[iFrp]) : null,
      confidence: iConf >= 0 ? normalizeConfidence(v[iConf]) : null,
      brightTi4: iTi4 >= 0 ? num(v[iTi4]) : null,
      brightTi5: iTi5 >= 0 ? num(v[iTi5]) : null,
      scanKm: iScan >= 0 ? num(v[iScan]) : null,
      trackKm: iTrack >= 0 ? num(v[iTrack]) : null,
      satellite: iSat >= 0 ? (v[iSat] ?? '').trim() : '',
      day: iDn >= 0 ? (v[iDn] ?? '').trim().toUpperCase() === 'D' : false,
      source,
    });
  }
  return { rows, skipped, header };
}

/**
 * Eindeutiger Schlüssel einer Detektion.
 *
 * Steht hier und nicht in `fireEvents.ts`, damit die Abhängigkeit **in eine
 * Richtung** zeigt: Die Ereignisbildung kennt die Quelle, die Quelle kennt die
 * Ereignisbildung nicht. Andersherum entstünde ein Importzyklus.
 */
export const detectionKey = (r: { lat: number; lon: number; acqMs: number }): string =>
  `${r.lat.toFixed(5)},${r.lon.toFixed(5)},${r.acqMs}`;

/** Liegt die Detektion im DACH-Ausschnitt? Der Proxy klemmt bereits, das hier
 *  ist die zweite Linie — eine Quelle darf uns nicht mehr liefern als bestellt. */
export function inDach(r: { lat: number; lon: number }): boolean {
  return r.lat >= DACH.south && r.lat <= DACH.north && r.lon >= DACH.west && r.lon <= DACH.east;
}

// ---------------------------------------------------------------------------
// Fensterplanung
// ---------------------------------------------------------------------------

export interface FirmsChunk {
  days: number;
  /** `null` = die jüngsten Tage; sonst Startdatum `YYYY-MM-DD`. */
  date: string | null;
}

/**
 * Zerlegt ein Rückblickfenster in Abrufe innerhalb der 5-Tage-Grenze.
 *
 * Zwei Dinge, die hier leicht falsch gehen:
 *
 *  • **`days=1` ist NICHT „die letzten 24 Stunden".** Die API rechnet in
 *    UTC-Kalendertagen: `days=1` liefert nur den heutigen UTC-Tag. Um 00:30 UTC
 *    wären das dreißig Minuten Daten, und die Karte wäre fast leer, ohne es zu
 *    sagen. Deshalb wird immer **ein Tag mehr** geholt als das Fenster breit
 *    ist, und anschließend am Zeitstempel gefiltert.
 *
 *  • **Die Teilfenster dürfen sich nicht überlappen und keine Lücke lassen.**
 *    `days=5` ohne Datum deckt `heute … heute−4`; der nächste Block beginnt
 *    deshalb bei `heute−5` und läuft rückwärts.
 */
export function windowPlan(windowH: number, nowMs: number): FirmsChunk[] {
  const needed = Math.min(30, Math.max(1, Math.ceil(windowH / 24) + 1));
  const chunks: FirmsChunk[] = [];
  let covered = 0;
  while (covered < needed) {
    const days = Math.min(MAX_DAY_RANGE, needed - covered);
    if (covered === 0) {
      chunks.push({ days, date: null });
    } else {
      // Startdatum = ältester Tag dieses Blocks, also heute − (covered+days−1).
      const startOffset = covered + days - 1;
      chunks.push({ days, date: isoUtcDate(nowMs - startOffset * 86_400_000) });
    }
    covered += days;
  }
  return chunks;
}

/** `YYYY-MM-DD` in UTC. Lokale Zeitzone würde am Tageswechsel danebenliegen. */
export function isoUtcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Die Proxy-URL für einen Abruf. Enthält **keinen** Schlüssel. */
export function firmsUrl(source: FirmsSource, chunk: FirmsChunk): string {
  const tail = chunk.date ? `/${chunk.date}` : '';
  return `${FIRMS_PROXY}/${source}/${DACH_WSEN}/${chunk.days}${tail}`;
}

// ---------------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------------

/**
 * Entfernt Doppelnennungen derselben Detektion: **<200 m und ≤90 s auseinander**.
 *
 * ⚠️ Ehrlich zum Wirkungsgrad: In den 4.707 Detektionen der F0-Analyse fand
 * diese Regel **null** Treffer zwischen verschiedenen Satelliten — SNPP,
 * NOAA-20 und NOAA-21 überfliegen dieselbe Stelle rund 50 Minuten versetzt, nie
 * gleichzeitig. Zwei Satelliten, die dasselbe Feuer sehen, liefern damit **zwei
 * echte Beobachtungen**; genau daraus bildet F2 die Überflugzahl. Sie
 * wegzurechnen wäre falsch.
 *
 * Die Regel bleibt trotzdem: Sie kostet nichts und deckt den Fall ab, dass sich
 * zwei Teilfenster durch einen UTC-Tageswechsel doch einmal überlappen. Sie ist
 * eine **Absicherung**, keine Mengenreduktion — und darf im Steckbrief nicht als
 * solche auftreten.
 */
export function dedupe(rows: readonly FirmsRow[]): FirmsRow[] {
  const sorted = [...rows].sort((a, b) => a.acqMs - b.acqMs);
  const keep: FirmsRow[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    let dup = false;
    for (let j = keep.length - 1; j >= 0; j--) {
      const b = keep[j];
      if (a.acqMs - b.acqMs > 90_000) break; // keep ist nach Zeit sortiert
      if (metersBetween(a, b) <= 200) { dup = true; break; }
    }
    if (!dup) keep.push(a);
  }
  return keep;
}

/** Abstand in Metern, äquirektangulär genähert — auf 200 m in DACH ausreichend. */
export function metersBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = (a.lat - b.lat) * 111_320;
  const dLon = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

// ---------------------------------------------------------------------------
// Darstellungsskalen — EINE Quelle für Karte und Legende
// ---------------------------------------------------------------------------

/**
 * FRP-Farbstufen in MW.
 *
 * Die gemessene Verteilung ist stark rechtsschief (Median 3,1 MW, p90 11,9,
 * p99 68, Maximum 373). Eine **lineare** Skala würde neun von zehn Punkten
 * ununterscheidbar klein zeichnen — deshalb Stützstellen, die sich etwa
 * verdreifachen, und ein Radius über die Wurzel.
 */
export const FRP_STOPS: readonly (readonly [number, string])[] = [
  [0, '#F2CE6B'],
  [3, '#EFA13F'],
  [10, '#DD6A2B'],
  [30, '#B93C1E'],
  [100, '#7E1F12'],
];

/** Radius in px zu einer Feuerstrahlungsleistung. Wurzel, nicht linear. */
export function frpRadius(frp: number | null): number {
  if (frp == null || !(frp > 0)) return 3;
  return Math.min(15, 2.6 + Math.sqrt(frp) * 1.15);
}

/** Deckkraft zur Konfidenz. `low` ist bewusst deutlich blasser. */
export function confidenceOpacity(c: FirmsConfidence | null): number {
  return c === 'high' ? 1 : c === 'low' ? 0.45 : 0.85;
}

/** Alter in Stunden → Ringfarbe. Frisch sticht heraus, alt tritt zurück. */
export function ageStroke(ageH: number): string {
  if (ageH <= 3) return '#FFFFFF';
  if (ageH <= 24) return '#FDF6EC';
  if (ageH <= 72) return '#B9A98F';
  return '#7A6B57';
}

// ---------------------------------------------------------------------------
// GeoJSON
// ---------------------------------------------------------------------------

/** Eigenschaften, die an der Karte hängen (flach — MapLibre kann nur flach). */
export interface FirmsProps extends Record<string, unknown> {
  acqMs: number;
  frp: number | null;
  confidence: string | null;
  confOpacity: number;
  radius: number;
  stroke: string;
  brightTi4: number | null;
  dTi: number | null;
  satellite: string;
  source: string;
  day: number;
  scanKm: number | null;
  trackKm: number | null;
  /** 1 = gehört zu einem als ortsfest eingestuften Ereignis (F2, abgeleitet). */
  stat?: number;
}

function propsOf(r: FirmsRow, nowMs: number): FirmsProps {
  const ageH = (nowMs - r.acqMs) / 3_600_000;
  return {
    acqMs: r.acqMs,
    frp: r.frp,
    confidence: r.confidence,
    confOpacity: confidenceOpacity(r.confidence),
    radius: frpRadius(r.frp),
    stroke: ageStroke(ageH),
    brightTi4: r.brightTi4,
    dTi: r.brightTi4 != null && r.brightTi5 != null
      ? Math.round((r.brightTi4 - r.brightTi5) * 10) / 10
      : null,
    satellite: r.satellite,
    source: r.source,
    day: r.day ? 1 : 0,
    scanKm: r.scanKm,
    trackKm: r.trackKm,
  };
}

/**
 * Das Footprint-Rechteck einer Detektion.
 *
 * `scan` und `track` sind die **Pixelausdehnung** in km (gemessen 0,32–0,80,
 * Median 0,42) — sie wachsen zum Schwadrand hin. Das Rechteck ist damit die
 * ehrliche räumliche Unsicherheit: Das Feuer liegt **irgendwo darin**, nicht in
 * der Mitte. Ohne `scan`/`track` gibt es kein Rechteck statt eines geratenen.
 */
export function footprintRing(r: FirmsRow): number[][] | null {
  if (r.scanKm == null || r.trackKm == null) return null;
  const dLat = (r.trackKm / 2) / 110.574;
  const dLon = (r.scanKm / 2) / (111.320 * Math.cos((r.lat * Math.PI) / 180));
  const w = r.lon - dLon; const e = r.lon + dLon;
  const s = r.lat - dLat; const n = r.lat + dLat;
  return [[w, s], [e, s], [e, n], [w, n], [w, s]];
}

export interface HotspotRun {
  /** Punkte — die Pixelmitten. */
  points: GeoJSON.FeatureCollection;
  /** Footprint-Rechtecke, ab `FOOTPRINT_MIN_ZOOM` sichtbar. */
  footprints: GeoJSON.FeatureCollection;
  count: number;
  latestAcqMs: number | null;
  oldestAcqMs: number | null;
  windowH: number;
  truncated: boolean;
  /** Verworfene CSV-Zeilen über alle Abrufe. */
  skipped: number;
  /** Welche Quelle hat geantwortet? `gwis` = Rückfallebene. */
  provider: 'firms' | 'gwis';
  /** Nur bei `gwis` gesetzt: warum der Primärpfad nicht ging. */
  degradedReason?: string;
  /** Die entduplizierten Zeilen — Grundlage der Ereignisbildung (F2). */
  rows: readonly FirmsRow[];
  /** Wie viele Detektionen als ortsfest eingestuft wurden (F2). */
  staticCount: number;
  /**
   * Wie viele der geplanten Einzelabrufe (Satellit × Zeitabschnitt) NICHT
   * geantwortet haben — und wie viele es insgesamt waren.
   *
   * Warum das sichtbar sein muss: bis 2026-08-19 verwarf ein `Promise.all` den
   * GANZEN Lauf, sobald **ein** Abruf scheiterte; die Ansicht fiel dann auf die
   * ärmere GWIS-Ebene zurück und meldete „NASA FIRMS nicht erreichbar",
   * obwohl acht von neun Abrufen Daten geliefert hatten. Jetzt zählt der Lauf,
   * was fehlt, statt alles wegzuwerfen — und die Statuszeile sagt es, denn
   * eine Teilmenge ohne Hinweis wäre eine Falschaussage über den Bestand (D-04).
   */
  failedFetches: number;
  plannedFetches: number;
}

export function toRun(
  rows: readonly FirmsRow[],
  windowH: number,
  nowMs: number,
  skipped: number,
  /** Detektionen, die zu einem als ortsfest eingestuften Ereignis gehören (F2). */
  staticKeys?: ReadonlySet<string>,
  /** Nicht beantwortete bzw. geplante Einzelabrufe (s. `HotspotRun`). */
  failedFetches = 0,
  plannedFetches = 0,
): HotspotRun {
  const capped = rows.length > MAX_FEATURES
    ? [...rows].sort((a, b) => b.acqMs - a.acqMs).slice(0, MAX_FEATURES)
    : [...rows];

  let latest: number | null = null;
  let oldest: number | null = null;
  const points: GeoJSON.Feature[] = [];
  const footprints: GeoJSON.Feature[] = [];

  let staticCount = 0;
  for (const r of capped) {
    if (latest == null || r.acqMs > latest) latest = r.acqMs;
    if (oldest == null || r.acqMs < oldest) oldest = r.acqMs;
    const props = propsOf(r, nowMs);
    if (staticKeys?.has(detectionKey(r))) {
      props.stat = 1;
      staticCount++;
    }
    points.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
      properties: props,
    });
    const ring = footprintRing(r);
    if (ring) {
      footprints.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring] },
        // NUR `day`, nicht der volle Eigenschaftssatz: Die Footprint-Layer
        // zeichnen unifarben und filtern einzig nach Tag/Nacht; angeklickt wird
        // der Punkt darüber. Ein 7-Tage-Fenster hat rund 6.000 Detektionen —
        // elf Felder je Rechteck wären ~66.000 Werte, die nur zur
        // Worker-Serialisierung beitragen und nie gelesen werden.
        properties: { day: props.day },
      });
    }
  }

  return {
    points: { type: 'FeatureCollection', features: points },
    footprints: { type: 'FeatureCollection', features: footprints },
    count: capped.length,
    latestAcqMs: latest,
    oldestAcqMs: oldest,
    windowH,
    truncated: rows.length > MAX_FEATURES,
    skipped,
    provider: 'firms',
    rows: capped,
    staticCount,
    failedFetches,
    plannedFetches,
  };
}

// ---------------------------------------------------------------------------
// Abruf
// ---------------------------------------------------------------------------

/** Kurzer Speicher-Cache je (Quelle, Abruf). Der Edge-Cache hält 30 min; der
 *  hier verhindert, dass Ein-/Ausschalten sofort erneut über das Netz geht. */
const _cache = new Map<string, { rows: FirmsRow[]; skipped: number; at: number }>();
const CACHE_TTL = 10 * 60_000;

export function resetFirmsCache(): void { _cache.clear(); }

async function fetchChunk(
  source: FirmsSource,
  chunk: FirmsChunk,
  signal: AbortSignal | undefined,
  nowMs: number,
): Promise<{ rows: FirmsRow[]; skipped: number }> {
  const url = firmsUrl(source, chunk);
  const hit = _cache.get(url);
  if (hit && nowMs - hit.at < CACHE_TTL) return { rows: hit.rows, skipped: hit.skipped };

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`FIRMS-Proxy: HTTP ${res.status}`);
  const { rows, skipped, header } = parseFirmsCsv(await res.text(), source);
  if (header.length && rows.length === 0 && skipped === 0 && !header.includes('latitude')) {
    throw new Error('FIRMS: unerwartetes Format');
  }
  _cache.set(url, { rows, skipped, at: nowMs });
  return { rows, skipped };
}

/**
 * Holt das Fenster über alle drei Satelliten.
 *
 * Reihenfolge der Schritte, und warum sie so ist:
 *   Abrufen → **am Zeitstempel auf das Fenster klemmen** (die API rechnet in
 *   Kalendertagen, nicht in Stunden) → DACH-Filter → Dedup → Deckel.
 */
export async function fetchFirmsHotspots(
  windowH: number,
  signal?: AbortSignal,
  nowMs: number = Date.now(),
  /**
   * Optionale Einstufung ortsfester Detektionen (F2). Wird als Rückruf
   * hereingereicht statt hier importiert: `fireEvents.ts` importiert aus diesem
   * Modul, umgekehrt entstünde ein Importzyklus. Die Ereignisbildung kostet
   * **keinen zusätzlichen Abruf** — sie rechnet auf genau diesen Zeilen.
   */
  classify?: (rows: readonly FirmsRow[]) => ReadonlySet<string> | Promise<ReadonlySet<string>>,
): Promise<HotspotRun> {
  const plan = windowPlan(windowH, nowMs);
  const jobs: Promise<{ rows: FirmsRow[]; skipped: number }>[] = [];
  for (const source of FIRMS_SOURCES) {
    for (const chunk of plan) jobs.push(fetchChunk(source, chunk, signal, nowMs));
  }
  /**
   * `allSettled`, NICHT `all`: Der Lauf besteht aus Satellit × Zeitabschnitt
   * (bei 7 Tagen neun Einzelabrufe). Mit `Promise.all` riss **ein** Ausfall —
   * eine 5xx-Antwort von FIRMS, ein Timeout, ein Netz-Aussetzer — den ganzen
   * Lauf mit, und die Seite fiel auf die keylose GWIS-Ebene zurück („NASA FIRMS
   * nicht erreichbar"), obwohl die übrigen Abrufe Daten hatten. Das traf
   * besonders die Entwicklung auf localhost: dort liegt kein Edge-Cache vor dem
   * Proxy, jeder Reload geht direkt an FIRMS.
   *
   * Jetzt gilt: **alles, was geantwortet hat, wird gezeigt** — und was fehlt,
   * wird gezählt und in der Statuszeile gesagt. Nur wenn KEIN einziger Abruf
   * durchkam, wird geworfen; dann greift der GWIS-Rückfall wie bisher.
   */
  const settled = await Promise.allSettled(jobs);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const parts = settled
    .filter((r): r is PromiseFulfilledResult<{ rows: FirmsRow[]; skipped: number }> => r.status === 'fulfilled')
    .map((r) => r.value);
  const failures = settled.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
  if (parts.length === 0) {
    const first = failures[0]?.reason;
    throw new Error(first instanceof Error ? first.message : 'FIRMS: kein Abruf beantwortet');
  }

  const cutoff = nowMs - windowH * 3_600_000;
  let skipped = 0;
  const rows: FirmsRow[] = [];
  for (const p of parts) {
    skipped += p.skipped;
    for (const r of p.rows) {
      if (r.acqMs < cutoff) continue;
      if (!inDach(r)) continue;
      rows.push(r);
    }
  }
  // Ab hier ist alles reine Rechenzeit im Hauptthread. Am 7-Tage-Fenster
  // gemessen (6.716 Detektionen): Dedup 29 ms · Ereignisbildung 170 ms ·
  // Zuordnung 31 ms · GeoJSON 46 ms — zusammen rund 280 ms und damit EIN
  // Long Task jenseits der 200-ms-Grenze aus `CLAUDE.md`. Einzeln bleibt jeder
  // Schritt darunter, deshalb wird zwischen ihnen an den Browser zurückgegeben.
  // Das macht die Arbeit nicht schneller, aber es hält die Seite bedienbar —
  // und genau darum geht es bei der Grenze.
  const deduped = dedupe(rows);
  await yieldToBrowser();
  const keys = await classify?.(deduped);
  await yieldToBrowser();
  return toRun(deduped, windowH, nowMs, skipped, keys, failures.length, jobs.length);
}

/** Gibt den Hauptthread frei, damit eine lange Rechnung in Häppchen zerfällt. */
export function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => { setTimeout(resolve, 0); });
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface FirmsCheck { name: string; ok: boolean; detail?: string }

/** Eine echte Antwortzeile aus der F0-Sonde — Kopf und Werte unverändert. */
export const FIXTURE_CSV = [
  'latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight',
  '52.15121,10.40221,321.2,0.45,0.63,2026-08-14,33,N,VIIRS,n,2.0NRT,286.51,1.6,N',
  '49.21762,16.77173,304.35,0.41,0.37,2026-08-14,52,N20,VIIRS,n,2.0NRT,288.46,0.97,N',
  '46.73582,15.57364,299.34,0.49,0.49,2026-08-14,137,N21,VIIRS,l,2.0NRT,287.4,0.64,N',
  '48.28000,14.34000,340.10,0.44,0.40,2026-08-14,1230,N,VIIRS,h,2.0NRT,290.10,42.5,D',
].join('\n');

export function verifyFirms(): { checks: FirmsCheck[]; passed: number; total: number } {
  const checks: FirmsCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // --- Fallstrick 1: acq_time ohne führende Nullen --------------------------
  add('acq_time "33" ⇒ 00:33 UTC (nicht 33 Minuten, nicht 3:30)',
    acqToUtcMs('2026-08-14', '33') === Date.UTC(2026, 7, 14, 0, 33),
    new Date(acqToUtcMs('2026-08-14', '33') ?? 0).toISOString());
  add('acq_time "7" ⇒ 00:07 UTC', acqToUtcMs('2026-08-14', '7') === Date.UTC(2026, 7, 14, 0, 7));
  add('acq_time "137" ⇒ 01:37 UTC', acqToUtcMs('2026-08-14', '137') === Date.UTC(2026, 7, 14, 1, 37));
  add('acq_time "1230" ⇒ 12:30 UTC', acqToUtcMs('2026-08-14', '1230') === Date.UTC(2026, 7, 14, 12, 30));
  add('acq_time "2358" ⇒ 23:58 UTC', acqToUtcMs('2026-08-14', '2358') === Date.UTC(2026, 7, 14, 23, 58));
  // Die aufgefüllte Schreibweise der Regions-CSV muss ebenfalls gehen.
  add('auch die aufgefüllte Form "0048" wird gelesen',
    acqToUtcMs('2026-08-14', '0048') === Date.UTC(2026, 7, 14, 0, 48));
  add('unmögliche Zeit ⇒ null statt stiller Verschiebung',
    acqToUtcMs('2026-08-14', '2599') === null && acqToUtcMs('2026-08-14', '9999') === null);
  add('kaputtes Datum/Zeit ⇒ null',
    acqToUtcMs('unsinn', '33') === null && acqToUtcMs('2026-08-14', 'abc') === null
    && acqToUtcMs(undefined, undefined) === null);
  // Ohne Z würde der Browser lokal lesen — im Sommer zwei Stunden daneben.
  add('Zeit wird als UTC gelesen, nicht lokal',
    acqToUtcMs('2026-08-14', '1200') === Date.UTC(2026, 7, 14, 12, 0));

  // --- Fallstrick 2: confidence ---------------------------------------------
  add('confidence l/n/h werden übersetzt',
    normalizeConfidence('l') === 'low' && normalizeConfidence('n') === 'nominal'
    && normalizeConfidence('h') === 'high');
  add('confidence low/nominal/high (Regions-CSV) ebenfalls',
    normalizeConfidence('low') === 'low' && normalizeConfidence('nominal') === 'nominal'
    && normalizeConfidence('high') === 'high');
  add('unbekannte Konfidenz ⇒ null, keine Erfindung',
    normalizeConfidence('80') === null && normalizeConfidence('') === null
    && normalizeConfidence(undefined) === null);

  // --- Fallstrick 3: Parsen nach Spaltennamen -------------------------------
  const p = parseFirmsCsv(FIXTURE_CSV, 'VIIRS_SNPP_NRT');
  add('Fixture: 4 Zeilen geparst, keine verworfen', p.rows.length === 4 && p.skipped === 0,
    `${p.rows.length}/${p.skipped}`);
  add('die Kopfzeile führt 14 Spalten inklusive instrument',
    p.header.length === 14 && p.header.includes('instrument'), String(p.header.length));
  // DER Anker gegen Fallstrick 3: `instrument` verschiebt alles danach um eins.
  // Läse der Parser nach Index der 13-spaltigen Regions-CSV, stünde hier 'VIIRS'.
  add('confidence ist die Konfidenz, NICHT der Instrumentenname',
    p.rows[0].confidence === 'nominal' && p.rows[2].confidence === 'low'
    && p.rows[3].confidence === 'high');
  add('frp wird gelesen', p.rows[0].frp === 1.6 && p.rows[3].frp === 42.5);
  add('bright_ti4/ti5 werden gelesen',
    p.rows[0].brightTi4 === 321.2 && p.rows[0].brightTi5 === 286.51);
  add('scan/track werden gelesen', p.rows[0].scanKm === 0.45 && p.rows[0].trackKm === 0.63);
  add('satellite wird gelesen', p.rows.map((r) => r.satellite).join(',') === 'N,N20,N21,N');
  add('daynight wird gelesen', p.rows[3].day === true && p.rows[0].day === false);

  // --- Kaputte Zeilen kippen den Abruf nicht, verschwinden aber auch nicht ---
  const broken = parseFirmsCsv(
    [FIXTURE_CSV, '1,2,3', 'a,b,c,d,e,f,g,h,i,j,k,l,m,n', '', '99999,10,1,1,1,2026-08-14,12,N,VIIRS,n,2,1,1,N'].join('\n'),
    'VIIRS_SNPP_NRT',
  );
  add('zu kurze Zeile wird gezählt und übersprungen', broken.skipped >= 1);
  add('unlesbare Werte werden übersprungen, nicht als NaN eingehängt',
    broken.rows.every((r) => Number.isFinite(r.lat) && Number.isFinite(r.acqMs)));
  add('unmögliche Koordinate (lat 99999) wird verworfen',
    !broken.rows.some((r) => r.lat > 90));
  add('leere Eingabe ⇒ leeres Ergebnis, kein Wurf',
    parseFirmsCsv('', 'VIIRS_SNPP_NRT').rows.length === 0);
  add('Antwort ohne Pflichtspalten ⇒ leer statt Fehlinterpretation',
    parseFirmsCsv('foo,bar\n1,2', 'VIIRS_SNPP_NRT').rows.length === 0);

  // --- BBox-Filter -----------------------------------------------------------
  add('DACH-Filter lässt Braunschweig durch', inDach({ lat: 52.15, lon: 10.40 }));
  add('DACH-Filter verwirft Nordschweden', !inDach({ lat: 65.75, lon: 24.53 }));
  add('DACH-Filter verwirft Portugal', !inDach({ lat: 39.5, lon: -8.0 }));

  // --- URL: kein Schlüssel, richtige BBox-Reihenfolge ------------------------
  const u = firmsUrl('VIIRS_SNPP_NRT', { days: 5, date: null });
  add('URL zeigt auf den eigenen Proxy, nicht auf NASA',
    u.startsWith('/_firms/') && !u.includes('firms.modaps'), u);
  add('URL trägt die BBox in west,south,east,north (nicht GWIS-lat,lon)',
    u.includes('/5.5,45.5,17.5,55.5/'), u);
  add('URL enthält nichts, was wie ein 32-stelliger Schlüssel aussieht',
    !/[0-9a-f]{32}/i.test(u));
  add('Startdatum wird angehängt',
    firmsUrl('VIIRS_SNPP_NRT', { days: 2, date: '2026-08-08' }).endsWith('/2/2026-08-08'));

  // --- Fensterplanung --------------------------------------------------------
  const now = Date.UTC(2026, 7, 14, 12, 0);
  const p24 = windowPlan(24, now);
  // Der Fallstrick: days=1 wäre nur der heutige UTC-Kalendertag.
  add('24-h-Fenster holt ZWEI Tage, nicht einen (UTC-Kalendertag-Falle)',
    p24.length === 1 && p24[0].days === 2 && p24[0].date === null,
    JSON.stringify(p24));
  const p7 = windowPlan(168, now);
  add('7-Tage-Fenster wird in Blöcke ≤5 Tage zerlegt',
    p7.every((c) => c.days >= 1 && c.days <= MAX_DAY_RANGE), JSON.stringify(p7));
  add('7-Tage-Fenster deckt 8 Kalendertage ab (ein Tag Reserve)',
    p7.reduce((s, c) => s + c.days, 0) === 8);
  add('erster Block ohne Datum (die jüngsten Tage)', p7[0].date === null && p7[0].days === 5);
  // Kein Loch und keine Überlappung: der zweite Block beginnt bei heute−7 und
  // reicht über 3 Tage bis heute−5, der erste beginnt bei heute−4.
  add('zweiter Block schließt lückenlos an', p7[1].days === 3 && p7[1].date === '2026-08-07',
    JSON.stringify(p7[1]));

  // --- Dedup -----------------------------------------------------------------
  const base: FirmsRow = {
    lat: 48, lon: 11, acqMs: now, frp: 5, confidence: 'nominal', brightTi4: 320,
    brightTi5: 290, scanKm: 0.4, trackKm: 0.4, satellite: 'N', day: false,
    source: 'VIIRS_SNPP_NRT',
  };
  add('identische Detektion wird entfernt', dedupe([base, { ...base }]).length === 1);
  add('gleicher Ort, 10 Minuten später ⇒ ZWEI Beobachtungen (Überflugzahl!)',
    dedupe([base, { ...base, acqMs: now + 600_000 }]).length === 2);
  add('gleiche Zeit, 5 km entfernt ⇒ zwei Detektionen',
    dedupe([base, { ...base, lat: 48.045 }]).length === 2);
  add('Dedup verträgt die leere Liste', dedupe([]).length === 0);
  add('Abstandsrechnung stimmt grob (0,01° Breite ≈ 1,1 km)',
    Math.abs(metersBetween({ lat: 48, lon: 11 }, { lat: 48.01, lon: 11 }) - 1113) < 20,
    String(Math.round(metersBetween({ lat: 48, lon: 11 }, { lat: 48.01, lon: 11 }))));

  // --- Footprint --------------------------------------------------------------
  const ring = footprintRing(base);
  add('Footprint ist ein geschlossener Ring aus 5 Punkten',
    ring != null && ring.length === 5
    && ring[0][0] === ring[4][0] && ring[0][1] === ring[4][1]);
  add('Footprint-Breite entspricht scan (0,4 km ⇒ ~400 m)',
    ring != null && Math.abs(metersBetween(
      { lat: base.lat, lon: ring[0][0] }, { lat: base.lat, lon: ring[1][0] },
    ) - 400) < 25,
    ring ? String(Math.round(metersBetween(
      { lat: base.lat, lon: ring[0][0] }, { lat: base.lat, lon: ring[1][0] }))) : 'null');
  add('ohne scan/track KEIN geratenes Rechteck',
    footprintRing({ ...base, scanKm: null }) === null
    && footprintRing({ ...base, trackKm: null }) === null);

  // --- Skalen ------------------------------------------------------------------
  add('FRP-Radius wächst mit der Wurzel, nicht linear',
    frpRadius(100) < frpRadius(10) * 4 && frpRadius(100) > frpRadius(10));
  add('FRP-Radius ist gedeckelt', frpRadius(10_000) <= 15);
  add('FRP null ⇒ kleiner Grundradius, kein NaN', Number.isFinite(frpRadius(null)));
  add('low ist deutlich blasser als high',
    confidenceOpacity('low') < confidenceOpacity('high') - 0.3);
  add('fehlende Konfidenz wird wie nominal behandelt, nicht wie high',
    confidenceOpacity(null) < confidenceOpacity('high'));
  add('frische Detektionen bekommen einen helleren Ring als alte',
    ageStroke(1) !== ageStroke(100));

  // --- Lauf-Aufbereitung --------------------------------------------------------
  const run = toRun(p.rows, 24, now, 0);
  add('Lauf liefert Punkte UND Footprints', run.points.features.length === 4
    && run.footprints.features.length === 4);
  add('Punkte tragen die Pixelmitte als Geometrie',
    (run.points.features[0].geometry as GeoJSON.Point).coordinates[1] === 52.15121);
  add('latest/oldest werden gesetzt',
    run.latestAcqMs === Date.UTC(2026, 7, 14, 12, 30)
    && run.oldestAcqMs === Date.UTC(2026, 7, 14, 0, 33));
  add('nicht abgeschnitten, solange unter dem Deckel', run.truncated === false);
  add('Deckel greift und meldet sich',
    toRun(Array.from({ length: MAX_FEATURES + 5 }, (_, i) => ({ ...base, acqMs: now - i })),
      24, now, 0).truncated === true);
  add('Deckel behält die JÜNGSTEN Detektionen',
    toRun(Array.from({ length: MAX_FEATURES + 5 }, (_, i) => ({ ...base, acqMs: now - i * 1000 })),
      24, now, 0).latestAcqMs === now);
  add('ti4−ti5 wird berechnet',
    (run.points.features[0].properties as FirmsProps).dTi === 34.7,
    String((run.points.features[0].properties as FirmsProps).dTi));
  add('Provider ist firms', run.provider === 'firms');

  // --- Ehrlichkeit: keine Fläche aus Leistung ---------------------------------
  add('Attribution nennt NASA FIRMS und LANCE',
    /NASA FIRMS/.test(FIRMS_ATTRIBUTION) && /LANCE/.test(FIRMS_ATTRIBUTION));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
