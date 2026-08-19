/**
 * KONRAD3D-Parser — DWD-Objektprodukt „Detection and tracking of convective
 * cells" (`opendata.dwd.de/weather/radar/konrad3d/`).
 *
 * Warum ein eigener Pull-Parser statt `DOMParser` (D-06/D-12, Vorbild
 * `gribDecode`/`jsfive`):
 *  - **headless prüfbar** — derselbe Code läuft im Browser und im Node-Verifier
 *    (`scripts/verify-cells.mjs`), ohne DOM-Shim.
 *  - **sparsam** — eine Datei ist ~0,6 MB mit ~38 Zellen à ~17 KB, von denen
 *    nur ~25 Felder gebraucht werden; ein voller Baum wäre reine Verschwendung.
 *
 * Zwei Eigenheiten des Formats, an denen eine naive Implementierung scheitert
 * (beide an einer echten Datei belegt, s. `audit/zellbahnen.md` §2):
 *  1. **Sentinel `-1000000000`** (in allen Nachkommastellen-Varianten) und
 *     **`not-a-date-time`** stehen für „nicht verfügbar" — 567 bzw. 117 Mal in
 *     EINER Datei. Ungefiltert entstehen Unsicherheits-Trichter mit −1 Mrd. m.
 *     Derselbe Fehlertyp wie der −999,9-Füllwert beim CIN-Gate (Phase F1).
 *  2. **Es gibt kein Richtungsfeld.** `tracking/cell_speed` ist nur ein Betrag;
 *     die Zugrichtung wird aus Schwerpunkt → erstem Prognosepunkt gepeilt.
 *
 * Alle Koordinaten liegen bereits in WGS84-Grad vor — keine Reprojektion.
 */

import { bearingDeg, compass8 } from './gridGeo';

/** Werte ≤ diesem Betrag sind der „nicht verfügbar"-Sentinel des Produkts. */
const SENTINEL_LIMIT = -9e8;
const NOT_A_DATE = 'not-a-date-time';

export interface CellForecastPoint {
  /** Vorlaufzeit gegenüber der Referenzzeit der Zelle, in Minuten (+5 … +60). */
  leadMin: number;
  /** Absolute Gültigkeitszeit (ms). */
  validMs: number;
  lon: number;
  lat: number;
  /** Amtliche Unsicherheitsellipse dieser Stützstelle (km/km/° meteo). */
  majorKm: number | null;
  minorKm: number | null;
  ellipseAngleDeg: number | null;
}

export interface Konrad3dCell {
  /** Laufzeitstabile Track-ID (bleibt über die Lebensdauer der Zelle gleich). */
  id: number;
  /** Referenzzeit der Zelle (ms) — der Messzeitpunkt, NICHT die Abrufzeit. */
  refMs: number;
  /** Schwerpunkt (3D-Zentroid) in WGS84-Grad. */
  lon: number;
  lat: number;
  heightMslM: number | null;
  /** Umriss-Polygon als [lon,lat]-Ring (NICHT geschlossen — das macht die Geometrie). */
  hull: Array<[number, number]>;
  areaKm2: number | null;
  volumeKm3: number | null;
  echoTopM: number | null;
  echoBottomM: number | null;
  /** Zuggeschwindigkeit als Betrag (km/h) — Richtung s. `bearing`. */
  speedKmh: number | null;
  firstDetectedMs: number | null;
  detections: number | null;
  merged: boolean;
  split: boolean;
  /** 12 Prognosepositionen (+5 … +60 min) mit amtlicher Unsicherheitsellipse. */
  forecast: CellForecastPoint[];
  dbzMax: number | null;
  dbzMean: number | null;
  severity: number | null;
  severityDecimal: number | null;
  /** Beobachtungs-Flags (0/1/2). Warnungsnahe Größen → konservative Wortwahl (D-19). */
  hailFlag: number | null;
  gustFlag: number | null;
  heavyRainFlag: number | null;
  /** Geschätzte maximale Bö (km/h) bzw. Starkregen-Potenzial (mm / min). */
  gustKmh: number | null;
  heavyRainMm: number | null;
  heavyRainMinutes: number | null;
  vil: number | null;
  vii: number | null;
  lightningRate: number | null;
  mesocyclones: number | null;
  /** HyMeC-Hydrometeorklassifikation der Zelle (Phase HA1, Hagel-Layer).
   *  `largeHailAreaKm2 > 0` ist die Großhagel-Aussage; die zugehörigen
   *  Echotop-Felder stehen bei fehlendem Großhagel auf dem Sentinel. */
  hailAreaKm2: number | null;
  largeHailAreaKm2: number | null;
  hailEchoTopM: number | null;
  hailVolumeKm3: number | null;
  /** Häufigste Hydrometeorklasse in Bodennähe (Codes = HyMeC-Legende, F-13). */
  nearGroundClass: number | null;
  /** Abgeleitet: Peilung Schwerpunkt → erster Prognosepunkt (° meteo, 0 = N). */
  bearing: number | null;
  /** Abgeleitet: Himmelsrichtungs-Kürzel zu `bearing` (de). */
  compass: string | null;
}

export interface Konrad3dRun {
  /** Referenzzeit des Laufs (ms). */
  refMs: number;
  /** Dateiname, aus dem der Lauf stammt (für Statuszeile/Debug). */
  file: string;
  cells: Konrad3dCell[];
}

// ---------------------------------------------------------------------------
// Pull-Parser-Primitive (index-basiert, kein Regex über den ganzen Text)
// ---------------------------------------------------------------------------

/** Position des Öffnungs-Tags `<tag` — nur exakte Tag-Namen (`<latitude` darf
 *  NICHT auf `<latitudes>` matchen). */
function findOpen(src: string, tag: string, from: number): number {
  const needle = `<${tag}`;
  let i = src.indexOf(needle, from);
  while (i >= 0) {
    const next = src.charCodeAt(i + needle.length);
    // '>' | ' ' | '/' | '\t' | '\n' | '\r'
    if (next === 62 || next === 32 || next === 47 || next === 9 || next === 10 || next === 13) return i;
    i = src.indexOf(needle, i + needle.length);
  }
  return -1;
}

interface Block { inner: string; open: string; end: number }

/** Inhalt des ersten `<tag …>…</tag>` ab `from`. `open` ist das Öffnungs-Tag
 *  (für Attribute), `end` der Index hinter dem Schluss-Tag. */
function block(src: string, tag: string, from = 0): Block | null {
  const open = findOpen(src, tag, from);
  if (open < 0) return null;
  const openEnd = src.indexOf('>', open);
  if (openEnd < 0) return null;
  const openTag = src.slice(open, openEnd + 1);
  if (src.charCodeAt(openEnd - 1) === 47) return { inner: '', open: openTag, end: openEnd + 1 }; // <tag/>
  const close = src.indexOf(`</${tag}>`, openEnd);
  if (close < 0) return null;
  return { inner: src.slice(openEnd + 1, close), open: openTag, end: close + tag.length + 3 };
}

/** Textinhalt eines Blatt-Tags innerhalb von `src`. */
function leaf(src: string, tag: string): string | null {
  const b = block(src, tag);
  return b ? b.inner.trim() : null;
}

/** Attributwert aus einem Öffnungs-Tag. */
function attr(openTag: string, name: string): string | null {
  const m = openTag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : null;
}

/** Zahl aus einem Blatt-Tag — Sentinel und Unfug werden zu `null`. */
export function num(src: string, tag: string): number | null {
  const raw = leaf(src, tag);
  if (raw == null || raw === '') return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= SENTINEL_LIMIT) return null;
  return v;
}

/** ISO-Zeitstempel aus einem Blatt-Tag — `not-a-date-time` wird zu `null`. */
export function isoMs(src: string, tag: string): number | null {
  const raw = leaf(src, tag);
  if (raw == null || raw === '' || raw === NOT_A_DATE) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

/** Whitespace-getrennte Zahlenliste (z. B. `<latitudes>`). */
function numList(raw: string | null): number[] {
  if (!raw) return [];
  const out: number[] = [];
  for (const part of raw.trim().split(/\s+/)) {
    const v = Number(part);
    if (Number.isFinite(v) && v > SENTINEL_LIMIT) out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Feature → Zelle
// ---------------------------------------------------------------------------

function parseForecast(featureSrc: string, refMs: number): CellForecastPoint[] {
  const fc = block(featureSrc, 'forecast');
  if (!fc) return [];
  const list = block(fc.inner, 'centroid_forecasts');
  if (!list) return [];
  const out: CellForecastPoint[] = [];
  let cursor = 0;
  for (;;) {
    const cfBlock = block(list.inner, 'centroid_forecast', cursor);
    if (!cfBlock) break;
    cursor = cfBlock.end;
    const coord = block(cfBlock.inner, 'geodetic_coordinate');
    if (!coord) continue;
    const lat = num(coord.inner, 'latitude');
    const lon = num(coord.inner, 'longitude');
    if (lat == null || lon == null) continue;
    const tRaw = attr(cfBlock.open, 'forecast_time');
    const validMs = tRaw && tRaw !== NOT_A_DATE ? Date.parse(tRaw) : NaN;
    if (!Number.isFinite(validMs)) continue;
    const ell = block(cfBlock.inner, 'uncertainty_ellipse');
    out.push({
      leadMin: Math.round((validMs - refMs) / 60_000),
      validMs,
      lon,
      lat,
      majorKm: ell ? num(ell.inner, 'major_axis') : null,
      minorKm: ell ? num(ell.inner, 'minor_axis') : null,
      ellipseAngleDeg: ell ? num(ell.inner, 'angle') : null,
    });
  }
  out.sort((a, b) => a.leadMin - b.leadMin);
  return out;
}

function parseHull(geometrySrc: string): Array<[number, number]> {
  const proj = block(geometrySrc, 'polygons_projected');
  if (!proj) return [];
  const geo = block(proj.inner, 'geodetic_coordinates');
  if (!geo) return [];
  const poly = block(geo.inner, 'polygon');
  if (!poly) return [];
  const lats = numList(leaf(poly.inner, 'latitudes'));
  const lons = numList(leaf(poly.inner, 'longitudes'));
  const n = Math.min(lats.length, lons.length);
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) ring.push([lons[i], lats[i]]);
  return ring;
}

function parseFeature(featureSrc: string, openTag: string, runRefMs: number): Konrad3dCell | null {
  const meta = block(featureSrc, 'metadata');
  const idRaw = attr(openTag, 'identifier') ?? (meta ? leaf(meta.inner, 'identifier') : null);
  const id = idRaw != null ? Number(idRaw) : NaN;
  if (!Number.isFinite(id)) return null;

  const refMs = (meta ? isoMs(meta.inner, 'reference_time') : null) ?? runRefMs;

  const geometry = block(featureSrc, 'geometry');
  if (!geometry) return null;
  const c3d = block(geometry.inner, 'centroid_3d');
  const coord = c3d ? block(c3d.inner, 'geodetic_coordinate') : null;
  const lat = coord ? num(coord.inner, 'latitude') : null;
  const lon = coord ? num(coord.inner, 'longitude') : null;
  if (lat == null || lon == null) return null;

  const tracking = block(featureSrc, 'tracking');
  const mergers = tracking ? block(tracking.inner, 'mergers') : null;
  const splits = tracking ? block(tracking.inner, 'splits') : null;
  const intensity = block(featureSrc, 'intensity');
  const lightning = block(featureSrc, 'lightning');
  const meso = block(featureSrc, 'mesocyclone');
  const hymec = block(featureSrc, 'hymec');

  const forecast = parseForecast(featureSrc, refMs);
  const first = forecast[0];
  // Richtung ist NICHT im Produkt enthalten — sie wird gepeilt. Ohne Prognosespur
  // bleibt sie leer (D-04: lieber keine Angabe als eine geratene).
  const bearing = first ? bearingDeg([lon, lat], [first.lon, first.lat]) : null;

  return {
    id,
    refMs,
    lon,
    lat,
    heightMslM: coord ? num(coord.inner, 'height_msl') : null,
    hull: parseHull(geometry.inner),
    areaKm2: num(geometry.inner, 'covered_area'),
    volumeKm3: num(geometry.inner, 'volume'),
    echoTopM: num(geometry.inner, 'echo_top_msl'),
    echoBottomM: num(geometry.inner, 'echo_bottom_msl'),
    speedKmh: tracking ? num(tracking.inner, 'cell_speed') : null,
    firstDetectedMs: tracking ? isoMs(tracking.inner, 'reference_time_first_detection') : null,
    detections: tracking ? num(tracking.inner, 'number_detections') : null,
    merged: mergers ? leaf(mergers.inner, 'merge_event') === 'true' : false,
    split: splits ? leaf(splits.inner, 'split_event') === 'true' : false,
    forecast,
    dbzMax: intensity ? num(intensity.inner, 'max_value') : null,
    dbzMean: intensity ? num(intensity.inner, 'average_value') : null,
    severity: intensity ? num(intensity.inner, 'severity') : null,
    severityDecimal: intensity ? num(intensity.inner, 'severity_decimal') : null,
    hailFlag: intensity ? num(intensity.inner, 'hail_flag') : null,
    gustFlag: intensity ? num(intensity.inner, 'gust_flag') : null,
    heavyRainFlag: intensity ? num(intensity.inner, 'heavy_rain_flag') : null,
    gustKmh: intensity ? num(intensity.inner, 'maximum_estimated_wind_gust') : null,
    heavyRainMm: intensity ? num(intensity.inner, 'heavy_rain_potential') : null,
    heavyRainMinutes: intensity ? num(intensity.inner, 'heavy_rain_potential_accumulation_time') : null,
    vil: intensity ? num(intensity.inner, 'cell_based_VIL') : null,
    vii: intensity ? num(intensity.inner, 'cell_based_VII') : null,
    lightningRate: lightning ? num(lightning.inner, 'lightning_rate') : null,
    mesocyclones: meso ? num(meso.inner, 'number_assigned_mesocyclones') : null,
    hailAreaKm2: hymec ? num(hymec.inner, 'area_hail') : null,
    largeHailAreaKm2: hymec ? num(hymec.inner, 'area_large_hail') : null,
    hailEchoTopM: hymec ? num(hymec.inner, 'echo_top_hail') : null,
    hailVolumeKm3: hymec ? num(hymec.inner, 'volume_hail') : null,
    nearGroundClass: hymec ? num(hymec.inner, 'maximum_near_ground_class') : null,
    bearing,
    compass: bearing != null ? compass8(bearing) : null,
  };
}

/**
 * Eine KONRAD3D-XML → Lauf mit Zellen. Rein: gleiche Eingabe ⇒ gleiche Ausgabe,
 * keine Uhr, kein DOM, kein Netz.
 */
export function parseKonrad3d(xml: string, file = ''): Konrad3dRun {
  const head = block(xml, 'head');
  const metadata = head ? block(head.inner, 'metadata') : null;
  const runRefMs = (metadata ? isoMs(metadata.inner, 'reference_time') : null) ?? 0;

  const cellsBlock = block(xml, 'cells');
  const src = cellsBlock ? cellsBlock.inner : xml;

  const cells: Konrad3dCell[] = [];
  let cursor = 0;
  for (;;) {
    const feat = block(src, 'feature', cursor);
    if (!feat) break;
    cursor = feat.end;
    const cell = parseFeature(feat.inner, feat.open, runRefMs);
    if (cell) cells.push(cell);
  }
  // Stärkste zuerst — die Reihenfolge bestimmt, was bei Überlappung oben liegt.
  cells.sort((a, b) => (b.severityDecimal ?? b.severity ?? 0) - (a.severityDecimal ?? a.severity ?? 0));
  return { refMs: runRefMs, file, cells };
}

/** Referenzzeit aus einem KONRAD3D-Dateinamen (`KONRAD3D_20260805T204000.xml`). */
export function refMsFromFileName(name: string): number | null {
  const m = name.match(/KONRAD3D_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.xml/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}
