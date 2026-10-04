/**
 * NP-0a — Vertrag des Blitz-Spiegels (audit/np0-datenprodukte.md §8, E-NP0-2/-3). EINE Datei für Producer
 * (`scripts/lightning/lightning-derive.mjs`, Kindprozess des Radar-Spiegels), Client (NP-1) und Verifier
 * (`verify:np0-radar`): Quellen, festes Raster, Kodierung mit Kodierer UND Dekodierer, Meta mit Bauer und Prüfer,
 * Gate, Kill-Switch. Abhängigkeitsfrei bis auf `radolanRuns.ts` (Pfadbasis, Schalter) — der Router-Frühstart und der
 * Node-Kindprozess laden ihn gleichermaßen.
 *
 * Ablage (im Radar-Spiegel, derselbe Push, Prune und CDN-Weg wie die Radarbilder):
 *   radar/img/v1/lightning-de/<YYYYMMDDTHHMM>/frame.png + meta.json    DWD `dwd:Blitzdichte` (NowCastMIX), nur DE-Verbund
 *   radar/img/v1/lightning-mtg/<YYYYMMDDTHHMM>/frame.png + meta.json   EUMETSAT MTG-LI `mtg_fd:li_afa`, ganz DACH
 * Der Stempel ist das **Fensterende** (`validAtMs`) — bei MTG ist der Quell-Zeitstempel der Fensterbeginn (+5 min).
 *
 * Werte, keine Farben (E-NP0-3, gemessen D-NP0-5): beide Quellen werden über WCS im nativen Gitter (EPSG:4326)
 * geholt und mit nächstem Nachbarn auf DASSELBE feste EPSG:3857-Raster abgebildet (`LIGHTNING_GRID`). Die serverseitige
 * Umprojektion rastet die Ränder am nativen Gitter ein — ein festes Raster ist so nicht anforderbar (diag-b §1.2).
 *
 * Ehrlichkeit (Meta-Texte unten): Blitzdichte-Fenster sind 15 min lang und kommen alle 5 min — **sie überlappen, nie
 * aufsummieren**. MTG zählt optische Gesamtblitze (Wolke-Wolke + Wolke-Boden) aus 36 000 km Höhe: Parallaxe nach Norden
 * um einige km. AT und CH haben keine offenen Bodennetz-Blitze — dort trägt nur MTG. MTG-Nil heißt „keine Blitze" ODER
 * „keine Messung" (die Quelle trennt das nicht). „Fehlt" ist nie 0: ein Slot, der nicht erschien, hat kein Verzeichnis.
 */

import { RADAR_IMG_BASE, radarCdnEnabled, radarCdnUsable } from './radolanRuns';

// --- Raster ------------------------------------------------------------------------------------

const R_EARTH = 6_378_137;

/**
 * Festes Ziel-Raster: DACH 5,5–17,5 °E × 45,5–55,5 °N in EPSG:3857, 2 000 m Mercator-Pixel (≈ 1,29 km am Boden bei
 * 50 °N), 668 × 880, Norden oben. Pixel (col, row) deckt x ∈ [x0 + col·px, x0 + (col+1)·px), y ∈ (y1 − (row+1)·px, y1 − row·px].
 */
export const LIGHTNING_GRID = Object.freeze({ epsg: 3857, x0: 612_257, y1: 7_459_517, px: 2_000, width: 668, height: 880 });

/** Mercator-x/y → Länge/Breite in Grad. */
export function mercToLonLat(x: number, y: number): [number, number] {
  return [(x / R_EARTH) * 180 / Math.PI, (2 * Math.atan(Math.exp(y / R_EARTH)) - Math.PI / 2) * 180 / Math.PI];
}

/** Vier Ecken (lon, lat) im Uhrzeigersinn ab oben links — für eine MapLibre-`image`-Source (reguläres Mercator-Gitter, kein Mesh). */
export function lightningGridCorners(): [[number, number], [number, number], [number, number], [number, number]] {
  const g = LIGHTNING_GRID;
  const x1 = g.x0 + g.width * g.px, y0 = g.y1 - g.height * g.px;
  return [mercToLonLat(g.x0, g.y1), mercToLonLat(x1, g.y1), mercToLonLat(x1, y0), mercToLonLat(g.x0, y0)];
}

// --- Quellen -----------------------------------------------------------------------------------

export type LightningSourceId = 'de' | 'mtg';

export interface LightningSourceSpec {
  readonly id: LightningSourceId;
  /** Verzeichnis unter `radar/img/v1/`. */
  readonly dir: string;
  readonly title: string;
  readonly layer: string;
  readonly capsUrl: string;
  readonly coverageId: string;
  readonly wcsBase: string;
  /** Länge des Zählfensters in Minuten. */
  readonly windowMin: number;
  /** Lage des Quell-Zeitstempels im Fenster: `end` (BD) oder `start` (MTG, Katalog EO:EUM:DAT:0687). */
  readonly timePos: 'end' | 'start';
  /** Überlappen aufeinanderfolgende Slots? (BD: 15-min-Fenster alle 5 min ⇒ ja — nie aufsummieren.) */
  readonly overlapping: boolean;
  readonly encoding: 'bd-value-x100-rg' | 'mtg-class-r';
  readonly coverage: string;
  readonly license: string;
  readonly notes: readonly string[];
}

export const LIGHTNING_STEP_MIN = 5;
/** Slots je Quelle im Spiegel (2 h, Altersregel wie `RADAR_IMG_KEEP`). */
export const LIGHTNING_KEEP = 24;
/** Wie weit der Producer beim Start nachholt (2 h; BD hält an der Quelle nur ≈ 24 h, V-NP0-6). */
export const LIGHTNING_BACKFILL_MS = 2 * 60 * 60_000;

export const LIGHTNING_SOURCES: Readonly<Record<LightningSourceId, LightningSourceSpec>> = Object.freeze({
  de: Object.freeze({
    id: 'de' as const, dir: 'lightning-de', title: 'DWD Blitzdichte (NowCastMIX)', layer: 'dwd:Blitzdichte',
    capsUrl: 'https://maps.dwd.de/geoserver/dwd/Blitzdichte/wms?service=WMS&version=1.3.0&request=GetCapabilities',
    coverageId: 'dwd__Blitzdichte', wcsBase: 'https://maps.dwd.de/geoserver/dwd/wcs',
    windowMin: 15, timePos: 'end' as const, overlapping: true, encoding: 'bd-value-x100-rg' as const,
    coverage: 'Nur der deutsche Verbund (46,95–54,91 °N, 1,74–18,49 °E); außerhalb A = 0 (keine Messung). Österreich und die Schweiz haben keine offenen Bodennetz-Blitze.',
    license: 'Datenbasis: Deutscher Wetterdienst (NowCastMIX-Blitzdichte), Werte auf eigenes Raster umgesetzt · CC BY 4.0',
    notes: Object.freeze([
      'Blitze der letzten 15 Minuten, alle 5 Minuten neu: aufeinanderfolgende Slots ÜBERLAPPEN — nie aufsummieren.',
      'Wert = generischer Index 0…127 der Quelle (nichtlinear abgebildet aus 0…3 000 Blitzen je Zeiteinheit und 100 km²), keine physikalische Rate.',
      'Die Einzelblitze (LINET, nowcast GmbH) sind kommerziell und nicht Teil des Produkts; das NowCastMIX-Raster ist ein frei zugänglicher DWD-Geodatendienst.',
    ]),
  }),
  mtg: Object.freeze({
    id: 'mtg' as const, dir: 'lightning-mtg', title: 'EUMETSAT MTG Lightning Imager (Accumulated Flash Area)', layer: 'mtg_fd:li_afa',
    capsUrl: 'https://view.eumetsat.int/geoserver/mtg_fd/li_afa/wms?service=WMS&version=1.3.0&request=GetCapabilities',
    coverageId: 'mtg_fd__li_afa', wcsBase: 'https://view.eumetsat.int/geoserver/mtg_fd/wcs',
    windowMin: 5, timePos: 'start' as const, overlapping: false, encoding: 'mtg-class-r' as const,
    coverage: 'Ganz DACH (geostationär, ±70°).',
    license: 'Contains modified EUMETSAT Meteosat data 2026 (MTG-I1 Lightning Imager, Accumulated Flash Area) · CC BY 4.0',
    notes: Object.freeze([
      'Optische Gesamtblitze (Wolke-Wolke und Wolke-Boden) aus dem geostationären Orbit — nicht deckungsgleich mit Bodennetz-Erdblitzen.',
      'Parallaxe: über Mitteleuropa um einige Kilometer nach Norden versetzt (je nach Wolkenhöhe), gegenüber dem Radar systematisch.',
      'Klasse 0 heißt „keine Blitze" ODER „keine Messung" — die Quelle trennt das nicht. Klasse k ≈ k Blitze je 5 min und Pixel (±1 laut Legende), 20 = „20 und mehr".',
      'Der Quell-Zeitstempel ist der Fensterbeginn; Stempel und validAtMs hier sind das Fensterende.',
    ]),
  }),
});

/** Gültigkeitszeit (Fensterende) aus dem Quell-Zeitstempel. */
export function lightningValidAtMs(id: LightningSourceId, timeIso: string): number {
  const t = Date.parse(timeIso);
  return LIGHTNING_SOURCES[id].timePos === 'start' ? t + LIGHTNING_SOURCES[id].windowMin * 60_000 : t;
}

/** Quell-Zeitstempel (ISO, wie die Quelle ihn nennt) aus dem Fensterende. */
export function lightningSourceTimeIso(id: LightningSourceId, validAtMs: number): string {
  const t = LIGHTNING_SOURCES[id].timePos === 'start' ? validAtMs - LIGHTNING_SOURCES[id].windowMin * 60_000 : validAtMs;
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

/**
 * WCS-Abruf im nativen Gitter (keine Umprojektion, keine Skalierung), Deflate Pflicht (ohne: 12,6 MB Float64, Falle g).
 * Der Ausschnitt ist eine Zelle größer als das Ziel-Raster, damit der nächste Nachbar am Rand immer trifft.
 */
export function lightningWcsUrl(id: LightningSourceId, timeIso: string): string {
  const s = LIGHTNING_SOURCES[id];
  return `${s.wcsBase}?service=WCS&version=2.0.1&request=GetCoverage&coverageId=${s.coverageId}`
    + `&format=image/tiff&geotiff:compression=Deflate&subset=time("${timeIso}")`
    + '&subset=Lat(45.4,55.6)&subset=Long(5.4,17.6)';
}

/**
 * Ende der TIME-Dimension aus den Per-Layer-Capabilities (WMS 1.3.0, `<Dimension name="time">start/end/PT5M</Dimension>`
 * oder eine Werteliste). **Der einzige Existenzbeweis eines Slots** — das DWD-WCS liefert für jede Zeit 200 mit einem
 * erfundenen Null-Frame (Falle a). null, wenn nichts Lesbares gefunden wurde.
 */
export function capsTimeEnd(capsXml: string): string | null {
  const m = /<Dimension[^>]*name="time"[^>]*>([^<]+)<\/Dimension>/i.exec(capsXml);
  if (!m) return null;
  const parts = m[1].trim().split(',');
  const last = parts[parts.length - 1].trim();
  const iso = last.includes('/') ? last.split('/')[1] : last;
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

// --- Klassen -----------------------------------------------------------------------------------

/**
 * BD-Klassen aus dem SLD der Quelle (wörtlich, `fixtures/bd-sld-blitzdichte.xml`), GeoServer-`intervals`: Eintrag k färbt
 * Werte v < q_k (und ≥ q_{k−1}). `bdClassOf` gibt genau den Eintrag zurück, mit dem der DWD selbst färbt; ein Wert ≥ 127
 * fällt aus der Tabelle (−1) — im DWD-WMS wäre er transparent (Sättigung dort unsichtbar).
 */
export const BD_CLASSES: readonly { q: number; color: string; label: string }[] = Object.freeze([
  { q: 0, color: '#7d7d7d', label: '1/min * 100km²' },
  { q: 1e-16, color: '#ffffff', label: '0' },
  { q: 0.1, color: '#fcffc1', label: '0,1' },
  { q: 0.2, color: '#fbff5c', label: '0,2 - 0,4' },
  { q: 0.5, color: '#dffc26', label: '0,5 - 0,9' },
  { q: 1.0, color: '#a0d626', label: '1,0 - 1,9' },
  { q: 2.0, color: '#45c379', label: '2,0 - 4,9' },
  { q: 5.0, color: '#00d6d8', label: '5,0 - 9,9' },
  { q: 10, color: '#11a1d6', label: '10,0 - 14,9' },
  { q: 15, color: '#0702fc', label: '15,0 - 24,9' },
  { q: 25, color: '#9232b7', label: '25,0 - 39,9' },
  { q: 40, color: '#da28c6', label: '40,0 - 59,9' },
  { q: 60, color: '#e70d0c', label: '60,0 - 79,0' },
  { q: 80, color: '#880e0d', label: '80,0 - 99,9' },
  { q: 127, color: '#4f0e0d', label: '> 100 < 3000' },
].map((c) => Object.freeze(c)));

export function bdClassOf(v: number): number {
  for (let k = 0; k < BD_CLASSES.length; k++) if (v < BD_CLASSES[k].q) return k;
  return -1;
}

/** Größter Index der Quelle (Abstract: 0…127). Werte darüber ⇒ Frame verworfen (Palette/Skala geändert). */
export const BD_MAX = 127;
/** Nodata der Quelle (außerhalb des Verbunds). */
export const BD_NODATA = 9999;

/** MTG-Mosaikfarben k = 1…20 (aus den Daten, Grünkanal streng fallend; diag-b §2.2). Schwarz = Nil = Klasse 0. */
export const MTG_COLORS: readonly (readonly [number, number, number])[] = Object.freeze([
  [254, 249, 189], [254, 243, 173], [255, 236, 158], [254, 229, 143], [254, 222, 128],
  [254, 213, 113], [254, 200, 98], [254, 186, 83], [254, 173, 73], [254, 160, 66],
  [253, 147, 62], [253, 130, 54], [253, 110, 47], [252, 86, 42], [246, 68, 38],
  [237, 51, 33], [228, 30, 29], [212, 16, 33], [195, 6, 36], [177, 0, 38],
].map((c) => Object.freeze(c as [number, number, number])));

/** Exakte Rückabbildung Farbe → Klasse; −1 = Farbe gehört nicht zur Palette (Frame verwerfen). */
export function mtgClassOf(r: number, g: number, b: number): number {
  if (r === 0 && g === 0 && b === 0) return 0;
  for (let k = 0; k < MTG_COLORS.length; k++) {
    const c = MTG_COLORS[k];
    if (c[0] === r && c[1] === g && c[2] === b) return k + 1;
  }
  return -1;
}

// --- Kodierung (RGBA-PNG, Alpha nur 0/255 — Canvas liest vormultipliziert) ----------------------

/** Festkomma der BD-Werte: v·100 als 16 bit über R (hoch) und G (tief) — exakt für zwei Nachkommastellen. */
export const BD_SCALE = 100;

/** Kodierer je Pixel. `v` = BD-Wert (NaN = außerhalb) bzw. MTG-Klasse 0…20. */
export function encodeLightningPixel(id: LightningSourceId, v: number, out: Uint8Array, o: number): void {
  if (!Number.isFinite(v)) { out[o] = 0; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 0; return; }
  if (id === 'de') {
    const q = Math.max(0, Math.min(65_535, Math.round(v * BD_SCALE)));
    out[o] = q >> 8; out[o + 1] = q & 255; out[o + 2] = 0; out[o + 3] = 255;
  } else {
    out[o] = v; out[o + 1] = 0; out[o + 2] = 0; out[o + 3] = 255;
  }
}

/** Dekodierer je Pixel: BD-Wert bzw. MTG-Klasse; NaN = keine Messung (A = 0). Umkehrung von `encodeLightningPixel`. */
export function decodeLightningPixel(id: LightningSourceId, r: number, g: number, _b: number, a: number): number {
  if (a !== 255) return NaN;
  return id === 'de' ? ((r << 8) | g) / BD_SCALE : r;
}

export interface NativeRaster {
  /** Breite, Höhe, Bänder des nativen WCS-Ausschnitts (EPSG:4326, x = Länge). */
  W: number; H: number; spp: number;
  data: Float64Array;
  /** Ursprung (Pixelkante oben links) und Schritt in Grad; `sy` < 0 bei Norden oben. */
  ox: number; oy: number; sx: number; sy: number;
}

export interface LightningRasterStats {
  /** Pixel mit Messung (A = 255). */
  covered: number;
  /** Pixel ohne Messung (A = 0): außerhalb des nativen Ausschnitts oder BD-Nodata. */
  outside: number;
  /** BD-Nodata-Pixel im Ausschnitt — Existenzprobe gegen den erfundenen Null-Frame (Falle a). */
  nodata: number;
  /** Pixel, die keiner Klasse/keinem gültigen Wert entsprechen — > 0 ⇒ Frame verwerfen. */
  unknown: number;
  /** Pixel mit Blitzaktivität (> 0). */
  active: number;
  /** BD: Pixel mit gebrochenem Wert (offene Frage, ob die Quelle ganzzahlig liefert; V-NP0-7). */
  fractionalPx: number;
  /** BD: größte Abweichung durch das Festkomma (0 bei ≤ 2 Nachkommastellen). */
  maxQuantErr: number;
  /** Größter Wert (BD) bzw. größte Klasse (MTG). */
  max: number;
}

/**
 * Nächster Nachbar vom nativen Gitter auf `LIGHTNING_GRID`: Pixelmitte des Ziels → (lon, lat) → nativer Pixel
 * `floor((lon − ox)/sx)`, `floor((lat − oy)/sy)` (GeoTIFF `PixelIsArea`). Liefert RGBA + Kennzahlen; der Prüfer
 * entscheidet mit `lightningFrameProblem`, ob der Frame gespeichert wird.
 */
export function rasterizeLightning(id: LightningSourceId, n: NativeRaster): { rgba: Uint8Array; stats: LightningRasterStats } {
  const g = LIGHTNING_GRID;
  const rgba = new Uint8Array(g.width * g.height * 4);
  const st: LightningRasterStats = { covered: 0, outside: 0, nodata: 0, unknown: 0, active: 0, fractionalPx: 0, maxQuantErr: 0, max: 0 };
  const cols = new Int32Array(g.width);
  for (let c = 0; c < g.width; c++) {
    const lon = mercToLonLat(g.x0 + (c + 0.5) * g.px, 0)[0];
    cols[c] = Math.floor((lon - n.ox) / n.sx);
  }
  for (let r = 0; r < g.height; r++) {
    const lat = mercToLonLat(0, g.y1 - (r + 0.5) * g.px)[1];
    const j = Math.floor((lat - n.oy) / n.sy);
    for (let c = 0; c < g.width; c++) {
      const o = (r * g.width + c) * 4;
      const i = cols[c];
      if (i < 0 || j < 0 || i >= n.W || j >= n.H) { st.outside++; encodeLightningPixel(id, NaN, rgba, o); continue; }
      const p = (j * n.W + i) * n.spp;
      if (id === 'de') {
        const v = n.data[p];
        if (v === BD_NODATA) { st.nodata++; st.outside++; encodeLightningPixel(id, NaN, rgba, o); continue; }
        if (!(v >= 0 && v <= BD_MAX)) { st.unknown++; encodeLightningPixel(id, NaN, rgba, o); continue; }
        if (v !== Math.round(v)) st.fractionalPx++;
        st.maxQuantErr = Math.max(st.maxQuantErr, Math.abs(Math.round(v * BD_SCALE) / BD_SCALE - v));
        if (v > 0) st.active++;
        st.max = Math.max(st.max, v);
        st.covered++;
        encodeLightningPixel(id, v, rgba, o);
      } else {
        const k = mtgClassOf(n.data[p], n.data[p + 1], n.data[p + 2]);
        if (k < 0) { st.unknown++; encodeLightningPixel(id, NaN, rgba, o); continue; }
        if (k > 0) st.active++;
        st.max = Math.max(st.max, k);
        st.covered++;
        encodeLightningPixel(id, k, rgba, o);
      }
    }
  }
  return { rgba, stats: st };
}

/**
 * Darf der Frame gespeichert werden? null = ja, sonst der Grund. BD: mindestens ein Nodata-Pixel (sonst erfundener
 * Null-Frame, Falle a), kein unbekannter Wert. MTG: jedes Pixel in Palette ∪ Nil (sonst Palettenwechsel der Quelle).
 */
export function lightningFrameProblem(id: LightningSourceId, st: LightningRasterStats): string | null {
  if (st.unknown > 0) return `${st.unknown} Pixel ohne gültigen Wert/Klasse`;
  if (st.covered === 0) return 'kein Pixel mit Messung';
  if (id === 'de' && st.nodata === 0) return 'kein Nodata-Pixel — erfundener Null-Frame der Quelle (Zeit nicht veröffentlicht)';
  return null;
}

// --- Stempel, Pfade, Gate, Schalter -------------------------------------------------------------

const two = (n: number) => String(n).padStart(2, '0');

/** Slot-Stempel `YYYYMMDDTHHMM` (UTC) des Fensterendes. */
export function lightningStamp(validAtMs: number): string {
  const d = new Date(validAtMs);
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
}

export function lightningStampToMs(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : NaN;
}

export const LIGHTNING_FRAME_FILE = 'frame.png';
export const LIGHTNING_META_FILE = 'meta.json';

export function lightningImgDir(id: LightningSourceId, stamp: string): string {
  return `${RADAR_IMG_BASE}/${LIGHTNING_SOURCES[id].dir}/${stamp}`;
}

/**
 * Anfrage-Gate ab Fensterende: Quelle höchstens 11,7 (BD) / 14,7 min (MTG) + Capabilities-Drossel ≤ 1 + Mitfahrt im
 * nächsten Produkt-Push ≤ 5 + Push 0,5 + jsDelivr `@main` ≤ 3 min (D-NP0-4/-7). Jünger angefragt riskiert eine am Edge
 * hängende 404 (RD2-Regel). Nach dem Live-Lauf nachschärfen.
 */
export const LIGHTNING_GATE_MS = 25 * 60_000;
/** Lese-Fenster: 24 Slots, der jüngste liegt an der Quelle ≥ 6,6 min hinter der Uhr ⇒ 120 min sicher im Bestand. */
export const LIGHTNING_WINDOW_MS = 120 * 60_000;

/** Kill-Switch nur für den Blitz-Spiegel: `?ltg=0|1` schlägt `localStorage.ltg` (Muster `radarImgFlagFrom`). */
export function lightningImgFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('ltg'); } catch { /* kaputte Query = kein Votum */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('ltg') : null; } catch { s = null; }
  }
  return s !== '0';
}

export function lightningImgEligible(stamp: string, nowMs: number = Date.now()): boolean {
  if (!radarCdnUsable() || !radarCdnEnabled() || !lightningImgFlagFrom()) return false;
  const age = nowMs - lightningStampToMs(stamp);
  return age >= LIGHTNING_GATE_MS && age <= LIGHTNING_WINDOW_MS;
}

// --- Meta (schema 1) ---------------------------------------------------------------------------

export interface LightningImgMeta {
  schema: 1;
  product: 'lightning';
  source: LightningSourceId;
  title: string;
  /** Quell-Zeitstempel, wie die Quelle ihn nennt (BD: Fensterende, MTG: Fensterbeginn). */
  timeIso: string;
  /** Fensterende = Slot-Stempel. */
  validAtMs: number;
  windowMin: number;
  timePos: 'end' | 'start';
  overlapping: boolean;
  fetchedAtMs: number;
  grid: typeof LIGHTNING_GRID;
  encoding: LightningSourceSpec['encoding'];
  /** Wie man ein Pixel liest — Klartext zum Dekodierer. */
  decode: string;
  classes: unknown;
  stats: LightningRasterStats;
  source_url: string;
  coverage: string;
  license: string;
  notes: readonly string[];
}

export function makeLightningMeta(id: LightningSourceId, timeIso: string, fetchedAtMs: number, stats: LightningRasterStats): LightningImgMeta {
  const s = LIGHTNING_SOURCES[id];
  return {
    schema: 1, product: 'lightning', source: id, title: s.title, timeIso,
    validAtMs: lightningValidAtMs(id, timeIso), windowMin: s.windowMin, timePos: s.timePos, overlapping: s.overlapping,
    fetchedAtMs, grid: LIGHTNING_GRID, encoding: s.encoding,
    decode: id === 'de'
      ? 'A = 255: Wert = (R·256 + G) / 100 (Index 0…127 der Quelle, 0 = gemessen, keine Blitze); A = 0: keine Messung (außerhalb des Verbunds). Klasse wie im DWD-WMS: bdClassOf(Wert).'
      : 'A = 255: R = Klasse 0…20 (0 = keine Blitze oder keine Messung, k ≈ k Blitze je 5 min ±1, 20 = 20+); A = 0: außerhalb.',
    classes: id === 'de' ? BD_CLASSES : MTG_COLORS.map((c, k) => ({ k: k + 1, rgb: c, label: k + 1 === 20 ? '≈ 20 und mehr Blitze / 5 min' : `≈ ${k + 1} Blitze / 5 min (±1 laut Legende)` })),
    stats, source_url: lightningWcsUrl(id, timeIso), coverage: s.coverage, license: s.license, notes: s.notes,
  };
}

/** Prüfer: null bei fremdem/kaputtem Meta (Client lehnt den Slot ab, Verifier zählt ihn als Fehler). */
export function parseLightningMeta(j: unknown): LightningImgMeta | null {
  if (!j || typeof j !== 'object') return null;
  const m = j as Partial<LightningImgMeta>;
  if (m.schema !== 1 || m.product !== 'lightning' || (m.source !== 'de' && m.source !== 'mtg')) return null;
  const s = LIGHTNING_SOURCES[m.source];
  if (typeof m.timeIso !== 'string' || !Number.isFinite(Date.parse(m.timeIso))) return null;
  if (m.validAtMs !== lightningValidAtMs(m.source, m.timeIso)) return null;
  if (m.validAtMs % (LIGHTNING_STEP_MIN * 60_000) !== 0) return null;
  if (m.windowMin !== s.windowMin || m.timePos !== s.timePos || m.overlapping !== s.overlapping || m.encoding !== s.encoding) return null;
  const g = m.grid as Partial<typeof LIGHTNING_GRID> | undefined;
  if (!g || g.epsg !== LIGHTNING_GRID.epsg || g.x0 !== LIGHTNING_GRID.x0 || g.y1 !== LIGHTNING_GRID.y1
    || g.px !== LIGHTNING_GRID.px || g.width !== LIGHTNING_GRID.width || g.height !== LIGHTNING_GRID.height) return null;
  const st = m.stats as Partial<LightningRasterStats> | undefined;
  if (!st || typeof st.covered !== 'number' || st.unknown !== 0) return null;
  if (typeof m.license !== 'string' || !m.license || !Array.isArray(m.notes) || m.notes.length === 0) return null;
  return m as LightningImgMeta;
}
