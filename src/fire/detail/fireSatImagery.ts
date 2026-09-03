/**
 * SAT1 — Satellitenbilder „Vorher | Während | Nachher" je Brand (`audit/brandradar-satellitenbilder.md`).
 *
 * Drei fremdgehostete, anonym erreichbare Dienste, alle mit CORS `*` gemessen (SAT0 §2),
 * 0 Netlify-Bytes, kein Schlüssel:
 *   - Earth Search STAC (AWS): Aufnahmetage + Wolkenanteil je Szene (Sentinel-2 + Landsat).
 *   - Worldview Snapshot API (NASA): fertiges JPEG je BBox/Datum aus den GIBS-HLS-Layern (30 m);
 *     der Header `Data-Present: false` sagt „an diesem Tag kein Bild", ohne zu dekodieren.
 *   - Copernicus Browser: Deep-Link für die 10-m-Begutachtung (kein eigener Abruf).
 *
 * Der gemessene Kern der Auswahllogik (SAT0 §2 K3): die WOLKE ist das Problem, nicht die
 * Verfügbarkeit — „der Tag davor" wäre der falsche Algorithmus. Gewählt wird die letzte
 * ausreichend wolkenarme Szene vor Brandbeginn bzw. die erste danach; jede Lücke wird ein Satz
 * in `notes`, nie ein stilles Loch (dieselbe Regel wie `fireWeatherAtPoint.ts`).
 *
 * Der Sitzungs-Cache hängt an keinem Abbruchsignal (Lehre GBP1 (3)): der erste Aufrufer darf
 * verschwinden, ohne den zweiten zu vergiften.
 */

export const SAT_SOURCE_LABEL = 'Sentinel-2/Landsat (HLS, 30 m), Echtfarbe';
/** Von NASA erbetene Anerkennung (SAT0 §2 K1) — Plaintext, Muster FIRE_WEATHER_ATTRIBUTION. */
export const SAT_ATTRIBUTION =
  'Bilder: NASA Global Imagery Browse Services (GIBS) / Worldview · Szenenliste: Element84 Earth Search (AWS Open Data)';

const STAC_URL = 'https://earth-search.aws.element84.com/v1/search';
const SNAPSHOT_URL = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot';
const BROWSER_URL = 'https://browser.dataspace.copernicus.eu/';
/** GIBS-Layer je Satellit — HLS harmonisiert beide auf 30 m Echtfarbe (SAT0 §2 K1). */
const LAYER: Record<SatKind, string> = {
  s2: 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance',
  landsat: 'HLS_L30_Nadir_BRDF_Adjusted_Reflectance',
};

export const SAT_TTL_MS = 30 * 60_000;
/** Bis hierhin gilt eine Szene als „wolkenarm" — darüber wird sie gewählt, aber gesagt. */
export const CLOUD_OK_PCT = 40;
/** Suchfenster um den Brandzeitraum: so weit zurück/voraus, dass eine wolkenarme Szene Platz hat. */
export const SEARCH_PAD_DAYS = 30;
export const SNAP_W = 600;
export const SNAP_H = 480;
/**
 * SAT1a (Jans "warum so undeutlich?"): GIBS haelt auf DACH-Breite ~25 m/px vor; 600 px ueber
 * ~22 km waeren ~37 m/px und wuerfen Detail weg. Angefordert wird deshalb 2x (1200x960, gemessen
 * 158 statt 50 KB, sichtbar schaerfer), angezeigt bei 600 CSS-px - auch auf Retina scharf.
 */
export const SNAP_SCALE = 2;
/** Mindest-Ausdehnung des Bildausschnitts in Breitengrad (~18 km) — SAT0 maß damit 47–59 KB. */
const MIN_LAT_SPAN = 0.16;

export type SatKind = 's2' | 'landsat';
export type SatPhase = 'before' | 'during' | 'after';

export interface SatScene {
  /** Kalendertag (UTC) der Aufnahme, `YYYY-MM-DD` — der Schlüssel für GIBS/Snapshot. */
  dayIso: string;
  /** Aufnahmezeitpunkt (ms UTC). */
  ms: number;
  sat: SatKind;
  /** `eo:cloud_cover` der Szene in Prozent — gilt je 110-km-Granulat, NICHT am Brandort (V-SAT-2). */
  cloudPct: number | null;
  /** Lage zum Brandzeitraum; `null`, wenn der Zeitraum unbekannt ist (reine EFFIS-Einträge). */
  phase: SatPhase | null;
}

export interface SatImagery {
  /** Alle Aufnahmetage im Fenster, aufsteigend, je Kalendertag genau eine Szene. */
  scenes: SatScene[];
  /** Auto-Wahl je Phase — `null` heißt „keine Szene", der Grund steht in `notes`. */
  pick: { before: SatScene | null; during: SatScene | null; after: SatScene | null };
  /** Jede Lücke, jeder Vorbehalt als Satz — nie ein stilles Loch. */
  notes: string[];
  /** Bildausschnitt [S, W, N, O] — die Achsenreihenfolge der Snapshot-API (SAT0 §2 K2). */
  bbox: [number, number, number, number];
}

// --- Kill-Switch (Rule 2; Muster `estimate.ts:areaEstEnabled`) --------------------------------

/** Kill-Switch `?sat=0` bzw. `localStorage.sat = '0'` — die Query schlägt den Speicher. */
export function satEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const q = new URLSearchParams(window.location.search).get('sat');
    if (q === '0') return false;
    if (q === '1') return true;
    return window.localStorage?.getItem('sat') !== '0';
  } catch {
    return true;
  }
}

/**
 * Kill-Switch der 10-m-Ansicht (SAT2a): `?sat10=0` bzw. `localStorage.sat10 = '0'`. Injektierbar
 * wie `hdf5WorkerEnabled` (LE2), damit die Wahrheitstafel headless prüfbar ist.
 */
export function sat10Enabled(search?: string, stored?: string | null): boolean {
  const s = search ?? (typeof window !== 'undefined' ? window.location.search : undefined);
  if (s === undefined) return false;
  try {
    const q = new URLSearchParams(s).get('sat10');
    if (q === '0') return false;
    if (q === '1') return true;
    const st = stored !== undefined ? stored : window.localStorage?.getItem('sat10');
    return st !== '0';
  } catch {
    return true;
  }
}

// --- URL-/Body-Builder (pur) ------------------------------------------------------------------

const DAY_MS = 86_400_000;
const isoDayUtc = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * EINE STAC-Anfrage für beide Collections (SAT0 §2 K3 + Landsat-Nachmessung). Die Landsat-
 * Collection kann Tage nennen, die HLS (noch) nicht trägt — der `Data-Present`-Wächter der
 * Snapshot-API fängt das ab. Absichtlich `sentinel-2-l2a` (gemessener Client-Kontrakt), nicht
 * das `sentinel-2-c1-l2a` aus `docs/API.md` §8.6a (Batch-Empfehlung, anderer Verbraucher).
 */
export function stacSearchBody(lat: number, lon: number, fromMs: number, toMs: number): unknown {
  return {
    collections: ['sentinel-2-l2a', 'landsat-c2-l2'],
    intersects: { type: 'Point', coordinates: [Number(lon.toFixed(4)), Number(lat.toFixed(4))] },
    datetime: `${new Date(fromMs).toISOString()}/${new Date(toMs).toISOString()}`,
    limit: 100,
    fields: {
      include: ['collection', 'properties.datetime', 'properties.eo:cloud_cover'],
      exclude: ['geometry', 'links', 'assets'],
    },
  };
}

/**
 * Bildausschnitt um den Brand: die Brand-BBox ([W, S, O, N] wie `FireRecord.bbox`) gepolstert,
 * mindestens ~18 km hoch, Breite metrisch im 5:4-Verhältnis des Bildes (Längengrad-Stauchung
 * mit cos φ ausgeglichen). Rückgabe in Snapshot-Ordnung [S, W, N, O].
 */
export function snapshotBbox(
  lat: number, lon: number, bbox: readonly [number, number, number, number] | null,
): [number, number, number, number] {
  const cLat = bbox ? (bbox[1] + bbox[3]) / 2 : lat;
  const cLon = bbox ? (bbox[0] + bbox[2]) / 2 : lon;
  const fireLatSpan = bbox ? Math.abs(bbox[3] - bbox[1]) : 0;
  const latSpan = Math.max(fireLatSpan * 1.6, MIN_LAT_SPAN);
  const lonSpan = (latSpan * (SNAP_W / SNAP_H)) / Math.max(0.2, Math.cos((cLat * Math.PI) / 180));
  const r = (n: number) => Number(n.toFixed(4));
  return [r(cLat - latSpan / 2), r(cLon - lonSpan / 2), r(cLat + latSpan / 2), r(cLon + lonSpan / 2)];
}

export function snapshotUrl(
  bbox: readonly [number, number, number, number], dayIso: string, sat: SatKind,
  w: number = SNAP_W * SNAP_SCALE, h: number = SNAP_H * SNAP_SCALE,
): string {
  const u = new URL(SNAPSHOT_URL);
  u.searchParams.set('REQUEST', 'GetSnapshot');
  u.searchParams.set('TIME', dayIso);
  u.searchParams.set('BBOX', bbox.join(','));
  u.searchParams.set('CRS', 'EPSG:4326');
  u.searchParams.set('LAYERS', LAYER[sat]);
  u.searchParams.set('FORMAT', 'image/jpeg');
  u.searchParams.set('WIDTH', String(w));
  u.searchParams.set('HEIGHT', String(h));
  return u.toString();
}

/** Deep-Link zur 10-m-Begutachtung (SAT0 §2 K5) — vorbelegt mit Ort und gewähltem Aufnahmetag. */
export function copernicusBrowserUrl(lat: number, lon: number, dayIso: string): string {
  const u = new URL(BROWSER_URL);
  u.searchParams.set('zoom', '13');
  u.searchParams.set('lat', lat.toFixed(4));
  u.searchParams.set('lng', lon.toFixed(4));
  u.searchParams.set('themeId', 'DEFAULT-THEME');
  u.searchParams.set('datasetId', 'S2_L2A_CDAS');
  u.searchParams.set('fromTime', `${dayIso}T00:00:00.000Z`);
  u.searchParams.set('toTime', `${dayIso}T23:59:59.999Z`);
  u.searchParams.set('dateMode', 'SINGLE');
  return u.toString();
}

// --- Reiner Kern ------------------------------------------------------------------------------

export interface RawScene { ms: number; sat: SatKind; cloudPct: number | null }

/**
 * Aus rohen Szenen die Tagesliste + Auto-Wahl. Regeln (SAT0 §2/§4):
 *   - je Kalendertag genau eine Szene: Sentinel-2 schlägt Landsat, sonst der kleinere Wolkenwert
 *     (zwei S2-Granulate desselben Passes sind der Normalfall);
 *   - Phase am UTC-Kalendertag von `firstMs`/`lastMs`; unbekannter Zeitraum ⇒ `phase: null` + Satz;
 *   - Wahl: letzte Szene ≤ CLOUD_OK_PCT vor dem Brand / erste danach / wolkenärmste währenddessen;
 *     gibt es nur wolkige, gewinnt die beste UND ein Satz sagt es;
 *   - jede leere Phase bekommt ihren Grund (Latenz ≠ Wolken ≠ kein Überflug).
 */
export function classifyScenes(
  raw: readonly RawScene[], firstMs: number | null, lastMs: number | null, nowMs: number,
): Pick<SatImagery, 'scenes' | 'pick' | 'notes'> {
  const notes: string[] = [];
  const byDay = new Map<string, RawScene>();
  for (const s of raw) {
    if (!Number.isFinite(s.ms)) continue;
    const day = isoDayUtc(s.ms);
    const prev = byDay.get(day);
    if (!prev) { byDay.set(day, s); continue; }
    if (prev.sat !== s.sat) { if (s.sat === 's2') byDay.set(day, s); continue; }
    if ((s.cloudPct ?? 101) < (prev.cloudPct ?? 101)) byDay.set(day, s);
  }

  const firstDay = firstMs != null ? isoDayUtc(firstMs) : null;
  const lastDay = lastMs != null ? isoDayUtc(lastMs) : firstDay;
  const phaseOf = (day: string): SatPhase | null => {
    if (firstDay == null || lastDay == null) return null;
    if (day < firstDay) return 'before';
    if (day > lastDay) return 'after';
    return 'during';
  };

  const scenes: SatScene[] = [...byDay.entries()]
    .map(([dayIso, s]) => ({ dayIso, ms: s.ms, sat: s.sat, cloudPct: s.cloudPct, phase: phaseOf(dayIso) }))
    .sort((a, b) => a.ms - b.ms);

  const inPhase = (p: SatPhase) => scenes.filter((s) => s.phase === p);
  const clear = (list: SatScene[]) => list.filter((s) => s.cloudPct != null && s.cloudPct <= CLOUD_OK_PCT);
  const best = (list: SatScene[]) =>
    list.length === 0 ? null : list.reduce((a, b) => ((b.cloudPct ?? 101) < (a.cloudPct ?? 101) ? b : a));
  const cloudy = (s: SatScene, word: string) => {
    if (s.cloudPct != null && s.cloudPct > CLOUD_OK_PCT) {
      notes.push(`${word} zu ~${Math.round(s.cloudPct)} % bewölkt — eine bessere Szene gibt es im Fenster nicht.`);
    }
    return s;
  };

  let before: SatScene | null = null;
  let during: SatScene | null = null;
  let after: SatScene | null = null;

  if (firstDay == null) {
    notes.push('Brandzeitraum unbekannt (Eintrag ohne Detektionszeiten) — die Aufnahmetage stehen ohne Einordnung.');
  } else {
    const b = inPhase('before');
    before = clear(b).at(-1) ?? (best(b) ? cloudy(best(b) as SatScene, 'Das Vorher-Bild ist') : null);
    if (!before) notes.push(`Keine Szene im ${SEARCH_PAD_DAYS}-Tage-Fenster vor dem Brand.`);

    const d = inPhase('during');
    during = best(clear(d)) ?? (best(d) ? cloudy(best(d) as SatScene, 'Das Bild während des Brandes ist') : null);
    if (!during) notes.push('Kein Überflug während des Brandes — die Satelliten fotografieren nicht auf Zuruf.');

    const a = inPhase('after');
    after = clear(a)[0] ?? (best(a) ? cloudy(best(a) as SatScene, 'Das Nachher-Bild ist') : null);
    if (!after) {
      const recent = lastMs != null && nowMs - lastMs < 6 * DAY_MS;
      notes.push(recent
        ? 'Noch kein Nachher-Bild — es entsteht mit dem nächsten wolkenarmen Überflug, plus 2–3 Tage Verarbeitung.'
        : 'Kein Nachher-Bild im Suchfenster.');
    }
  }

  if (scenes.length === 0) notes.push('Keine Satellitenszene im Suchfenster gefunden.');
  return { scenes, pick: { before, during, after }, notes };
}

// --- Abruf mit Sitzungs-Cache -----------------------------------------------------------------

interface StacFeature { collection?: string; properties?: { datetime?: string; 'eo:cloud_cover'?: number } }

export function parseStacScenes(json: unknown): RawScene[] {
  const feats = (json as { features?: StacFeature[] } | null)?.features;
  if (!Array.isArray(feats)) return [];
  const out: RawScene[] = [];
  for (const f of feats) {
    const ms = Date.parse(f?.properties?.datetime ?? '');
    if (!Number.isFinite(ms)) continue;
    const cc = f?.properties?.['eo:cloud_cover'];
    out.push({
      ms,
      sat: String(f?.collection ?? '').startsWith('landsat') ? 'landsat' : 's2',
      cloudPct: typeof cc === 'number' && Number.isFinite(cc) ? cc : null,
    });
  }
  return out;
}

const _cache = new Map<string, { at: number; p: Promise<SatImagery> }>();

export function fetchSatImagery(
  lat: number, lon: number, bbox: readonly [number, number, number, number] | null,
  firstMs: number | null, lastMs: number | null, nowMs: number = Date.now(),
): Promise<SatImagery> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}|${firstMs ?? 0}|${lastMs ?? 0}`;
  const hit = _cache.get(key);
  if (hit && nowMs - hit.at < SAT_TTL_MS) return hit.p;

  const from = (firstMs ?? nowMs) - SEARCH_PAD_DAYS * DAY_MS;
  const to = Math.min(nowMs, (lastMs ?? firstMs ?? nowMs) + SEARCH_PAD_DAYS * DAY_MS);
  const box = snapshotBbox(lat, lon, bbox);

  const p = (async (): Promise<SatImagery> => {
    let raw: RawScene[] | null = null;
    try {
      const r = await fetch(STAC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stacSearchBody(lat, lon, from, to)),
      });
      if (r.ok) raw = parseStacScenes(await r.json());
    } catch { /* Ausfall wird unten ein Satz, kein stilles Loch */ }
    if (raw == null) {
      _cache.delete(key); // Totalausfall nicht für die Sitzung merken
      return {
        scenes: [], pick: { before: null, during: null, after: null },
        notes: ['Die Szenenliste (Earth Search STAC) ist gerade nicht erreichbar — keine Bilder verfügbar, kein Wert erfunden.'],
        bbox: box,
      };
    }
    const c = classifyScenes(raw, firstMs, lastMs, nowMs);
    return { ...c, bbox: box };
  })();

  _cache.set(key, { at: nowMs, p });
  return p;
}

export function resetSatImageryCache(): void {
  _cache.clear();
  _cogRefCache.clear();
  _preRefCache.clear();
}

// --- SAT2a: COG-Referenz je Sentinel-2-Szene (10-m-Viewer) ------------------------------------

/**
 * Referenz auf das 10-m-Original einer Szene: das `visual`-Asset (TCI) des STAC-Items samt der
 * Georeferenz, die STAC gratis mitliefert (`proj:transform`/`proj:epsg`/`proj:shape` — gemessen
 * 2026-09-01, der Leser braucht dadurch KEINE GeoTIFF-Geo-Tags). Der Bucket
 * `sentinel-cogs.s3.us-west-2.amazonaws.com` ist CORS-offen inkl. Range-Preflight — NICHT zu
 * verwechseln mit dem CORS-losen Batch-Bucket der Collection `sentinel-2-c1-l2a` (API.md §8.6a).
 */
export interface S2CogRef {
  href: string;
  epsg: number;
  /** [scaleX, 0, X0, 0, −scaleY, Y0] — äußere NW-Ecke, 10 m/px (s. `sentinelGeo.ts`). */
  transform: number[];
  /** [Zeilen, Spalten] des Vollrasters (10980²). */
  shape: [number, number];
  cloudPct: number | null;
  /** Randabstand des Brandpunkts in Vollauflösungs-Pixeln — die Grundlage der Granulat-Wahl. */
  marginPx: number;
  /** MGRS-Granulat (z. B. „31UGS") aus dem Asset-Pfad — der Schlüssel der Vorher-Suche (§10.1 (3)). */
  square: string | null;
  /**
   * SAT2b: die Band-COGs für SWIR/dNBR (`swir22` = B12 20 m, `nir08` = B8A 20 m, `red` = B04
   * 10 m) samt Reflektanz-Skala aus `raster:bands` — JE SZENE, weil ältere Archiv-Szenen
   * (Baseline < 04.00) offset 0 tragen (§10.1 (2)). `null`, wenn ein Band fehlt.
   * `scl` (SAT2c, §11) ist die Szenenklassifikation fürs dNBR-Overlay — OPTIONAL: ihr Fehlen
   * darf SWIR/dNBR nie abschalten, das Overlay läuft dann ohne Maske und der Satz sagt es.
   */
  bands: { swir22: string; nir08: string; red: string; scl: string | null; scale: number; offset: number } | null;
}

/** MGRS-Granulat aus dem COG-Pfad (`…/sentinel-s2-l2a-cogs/31/U/GS/…` → „31UGS"). */
export function granuleSquareOf(href: string): string | null {
  const m = /sentinel-s2-l2a-cogs\/(\d{1,2})\/([A-Z])\/([A-Z]{2})\//.exec(href);
  return m ? `${m[1]}${m[2]}${m[3]}` : null;
}

/**
 * SAT1s Suche schneidet `assets` bewusst weg (und Earth Search projiziert verschachtelte
 * Asset-Felder nicht — gemessen kam trotz `assets.visual.href`-Include die volle Liste).
 * Die COG-Referenz holt deshalb eine ZWEITE, on-demand Tages-Suche ohne fields-Beschnitt.
 */
export function stacDayBody(lat: number, lon: number, dayIso: string): unknown {
  return {
    collections: ['sentinel-2-l2a'],
    intersects: { type: 'Point', coordinates: [Number(lon.toFixed(4)), Number(lat.toFixed(4))] },
    datetime: `${dayIso}T00:00:00Z/${dayIso}T23:59:59Z`,
    limit: 4,
  };
}

interface StacCogFeature {
  properties?: { 'eo:cloud_cover'?: number; 'proj:epsg'?: number };
  assets?: Record<string, {
    href?: string; 'proj:transform'?: number[]; 'proj:shape'?: number[];
    'raster:bands'?: Array<{ scale?: number; offset?: number } | undefined>;
  } | undefined>;
}

/** Band-Referenzen (SAT2b) aus den Assets — nur vollständig oder gar nicht. */
function bandsOf(f: StacCogFeature): S2CogRef['bands'] {
  const h = (k: string): string | null => {
    const href = f.assets?.[k]?.href;
    return typeof href === 'string' && href.startsWith('https://') ? href : null;
  };
  const swir22 = h('swir22');
  const nir08 = h('nir08');
  const red = h('red');
  if (!swir22 || !nir08 || !red) return null;
  const rb = f.assets?.['swir22']?.['raster:bands']?.[0];
  return {
    swir22, nir08, red, scl: h('scl'),
    scale: typeof rb?.scale === 'number' ? rb.scale : 1e-4,
    offset: typeof rb?.offset === 'number' ? rb.offset : 0,
  };
}

/** Kandidaten aus der Tages-Antwort — nur vollständige (Href + EPSG + Transform + Shape). */
export function parseS2CogCandidates(
  json: unknown, lat: number, lon: number,
  pixelOfFn: (lat: number, lon: number, epsg: number, transform: readonly number[]) => { px: number; py: number } | null,
): S2CogRef[] {
  const feats = (json as { features?: StacCogFeature[] } | null)?.features;
  if (!Array.isArray(feats)) return [];
  const out: S2CogRef[] = [];
  for (const f of feats) {
    const a = f?.assets?.['visual'];
    const href = a?.href;
    const epsg = f?.properties?.['proj:epsg'];
    const transform = a?.['proj:transform'];
    const shape = a?.['proj:shape'];
    if (typeof href !== 'string' || !href.startsWith('https://')) continue;
    if (typeof epsg !== 'number' || !Array.isArray(transform) || transform.length < 6) continue;
    if (!Array.isArray(shape) || shape.length < 2) continue;
    const p = pixelOfFn(lat, lon, epsg, transform);
    if (!p) continue;
    const cc = f?.properties?.['eo:cloud_cover'];
    const margin = Math.min(p.px, p.py, shape[1] - p.px, shape[0] - p.py);
    if (margin <= 0) continue; // Punkt außerhalb des Granulats
    out.push({
      href, epsg, transform: [...transform], shape: [shape[0], shape[1]],
      cloudPct: typeof cc === 'number' && Number.isFinite(cc) ? cc : null,
      marginPx: margin,
      square: granuleSquareOf(href),
      bands: bandsOf(f),
    });
  }
  return out;
}

/** Ein 18-km-Fenster braucht ~900 px Randabstand — mit Zoom-Reserve. */
export const GRANULE_WINDOW_PX = 1200;

/**
 * Granulat-Wahl bei überlappenden Kandidaten (am Messpunkt lagen 31UGS UND 32ULB): deckt der
 * Randabstand das Fenster, entscheidet die WOLKE; sonst gewinnt der größere Randabstand —
 * ein wolkenfreies Granulat nützt nichts, wenn der Brand an seiner Schnittkante klebt.
 */
export function pickGranule(cands: readonly S2CogRef[]): S2CogRef | null {
  if (cands.length === 0) return null;
  const fits = cands.filter((c) => c.marginPx >= GRANULE_WINDOW_PX);
  if (fits.length > 0) {
    return fits.reduce((a, b) => ((b.cloudPct ?? 101) < (a.cloudPct ?? 101) ? b : a));
  }
  return cands.reduce((a, b) => (b.marginPx > a.marginPx ? b : a));
}

const _cogRefCache = new Map<string, { at: number; p: Promise<S2CogRef | null> }>();

/** On-demand (erst mit dem Klick auf „In 10 m ansehen"); Sitzungs-Cache ohne AbortSignal (GBP1 (3)). */
export function fetchS2CogRef(
  lat: number, lon: number, dayIso: string,
  pixelOfFn: (lat: number, lon: number, epsg: number, transform: readonly number[]) => { px: number; py: number } | null,
  nowMs: number = Date.now(),
): Promise<S2CogRef | null> {
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}|${dayIso}`;
  const hit = _cogRefCache.get(key);
  if (hit && nowMs - hit.at < SAT_TTL_MS) return hit.p;
  const p = (async (): Promise<S2CogRef | null> => {
    try {
      const r = await fetch(STAC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stacDayBody(lat, lon, dayIso)),
      });
      if (!r.ok) throw new Error(String(r.status));
      return pickGranule(parseS2CogCandidates(await r.json(), lat, lon, pixelOfFn));
    } catch {
      _cogRefCache.delete(key); // Totalausfall nicht für die Sitzung merken
      return null;
    }
  })();
  _cogRefCache.set(key, { at: nowMs, p });
  return p;
}

// --- SAT2b: Vorher-Szene desselben Granulats (dNBR-Vergleich) ---------------------------------

/**
 * Rückschau der Vorher-Suche. Gemessen (§10.1 (3)): am Hürtgenwald lag die letzte wolkenarme
 * Vorher-Szene 20 Tage vor dem Brand (25.07., 0,2 % — dazwischen nur 73–95 % Wolken).
 */
export const PRE_LOOKBACK_DAYS = 35;

/** Listen-Suche für die Vorher-Szene: NUR Sentinel-2, mit fields-Beschnitt (die Assets holt die Tages-Suche). */
export function stacPreListBody(lat: number, lon: number, postDayIso: string): unknown {
  const end = Date.parse(`${postDayIso}T00:00:00Z`) - 1;
  return {
    collections: ['sentinel-2-l2a'],
    intersects: { type: 'Point', coordinates: [Number(lon.toFixed(4)), Number(lat.toFixed(4))] },
    datetime: `${new Date(end - PRE_LOOKBACK_DAYS * DAY_MS + 1).toISOString()}/${new Date(end).toISOString()}`,
    limit: 40,
    fields: {
      include: ['id', 'properties.datetime', 'properties.eo:cloud_cover'],
      exclude: ['geometry', 'links', 'assets'],
    },
  };
}

/**
 * Der Vergleichstag: die LETZTE Szene ≤ CLOUD_OK_PCT DESSELBEN Granulats (die Kennung steht im
 * Item-Namen, z. B. `S2C_31UGS_20260725…`). Gleiches Granulat heißt identisches Pixelgitter und
 * identische Kachel-Struktur — kein Resampling (§10.1 (3)); ein anderes Granulat wäre ein
 * stiller Versatz. `null` ist die benannte Absage des Aufrufers.
 */
export function pickPreDay(json: unknown, square: string): string | null {
  const feats = (json as { features?: Array<{ id?: string; properties?: { datetime?: string; 'eo:cloud_cover'?: number } }> } | null)?.features;
  if (!Array.isArray(feats)) return null;
  let best: string | null = null;
  for (const f of feats) {
    if (typeof f?.id !== 'string' || !f.id.includes(`_${square}_`)) continue;
    const cc = f.properties?.['eo:cloud_cover'];
    if (typeof cc !== 'number' || cc > CLOUD_OK_PCT) continue;
    const ms = Date.parse(f.properties?.datetime ?? '');
    if (!Number.isFinite(ms)) continue;
    const dayIso = isoDayUtc(ms);
    if (best == null || dayIso > best) best = dayIso;
  }
  return best;
}

export interface S2PreRef { ref: S2CogRef; dayIso: string }

const _preRefCache = new Map<string, { at: number; p: Promise<S2PreRef | null> }>();

/**
 * Vorher-Referenz für den dNBR-Vergleich: Listen-Suche (35 Tage zurück) → letzter wolkenarmer
 * Tag desselben Granulats → Tages-Suche mit Assets. Zwei STAC-Anfragen, on-demand erst im
 * dNBR-Modus; `null` heißt „keine wolkenarme Vorher-Szene dieses Granulats" (der Viewer sagt es).
 */
export function fetchS2PreCogRef(
  lat: number, lon: number, postDayIso: string, square: string,
  pixelOfFn: (lat: number, lon: number, epsg: number, transform: readonly number[]) => { px: number; py: number } | null,
  nowMs: number = Date.now(),
): Promise<S2PreRef | null> {
  const key = `${square}|${postDayIso}`;
  const hit = _preRefCache.get(key);
  if (hit && nowMs - hit.at < SAT_TTL_MS) return hit.p;
  const p = (async (): Promise<S2PreRef | null> => {
    try {
      const r = await fetch(STAC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stacPreListBody(lat, lon, postDayIso)),
      });
      if (!r.ok) throw new Error(String(r.status));
      const dayIso = pickPreDay(await r.json(), square);
      if (dayIso == null) return null; // fachliche Absage — memoieren ist richtig
      const cands = await (async () => {
        const rd = await fetch(STAC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stacDayBody(lat, lon, dayIso)),
        });
        if (!rd.ok) throw new Error(String(rd.status));
        return parseS2CogCandidates(await rd.json(), lat, lon, pixelOfFn);
      })();
      const ref = cands.find((c) => c.square === square) ?? null;
      return ref ? { ref, dayIso } : null;
    } catch {
      _preRefCache.delete(key); // Totalausfall nicht für die Sitzung merken
      return null;
    }
  })();
  _preRefCache.set(key, { at: nowMs, p });
  return p;
}

// --- Beschriftung -----------------------------------------------------------------------------

export const satLabel = (sat: SatKind): string => (sat === 's2' ? 'Sentinel-2' : 'Landsat');
export const PHASE_LABEL: Record<SatPhase, string> = { before: 'Vorher', during: 'Während', after: 'Nachher' };

export function cloudLabel(cloudPct: number | null): string {
  return cloudPct == null ? 'Wolkenanteil unbekannt' : `~${Math.round(cloudPct)} % Wolken`;
}

// --- Selbstverifikation -----------------------------------------------------------------------

export interface SatCheck { name: string; ok: boolean; detail?: string }

export function verifyFireSatImagery(): { checks: SatCheck[]; passed: number; total: number } {
  const checks: SatCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const day = (d: string, h = 10) => Date.parse(`${d}T${String(h).padStart(2, '0')}:46:00Z`);
  const S = (d: string, cloud: number | null, sat: SatKind = 's2'): RawScene => ({ ms: day(d), sat, cloudPct: cloud });

  // Nachbau des gemessenen Hürtgenwald-Falls (SAT0 §2/§3): Brand 14.–15.08.
  const first = day('2026-08-14', 4);
  const last = day('2026-08-15', 12);
  const now = day('2026-08-31');
  const c1 = classifyScenes([
    S('2026-08-04', 85), S('2026-08-06', 90), S('2026-08-09', 73), S('2026-08-10', 1, 'landsat'),
    S('2026-08-14', 0), S('2026-08-16', 40), S('2026-08-19', 100), S('2026-08-24', 58),
  ], first, last, now);
  add('Vorher = letzte WOLKENARME Szene, nicht der letzte Tag', c1.pick.before?.dayIso === '2026-08-10');
  add('Während = Szene am Brandtag', c1.pick.during?.dayIso === '2026-08-14');
  add('Nachher = erste wolkenarme Szene nach dem Brand', c1.pick.after?.dayIso === '2026-08-16');
  add('Phasen je Kalendertag korrekt', c1.scenes.filter((s) => s.phase === 'during').length === 1
    && c1.scenes.filter((s) => s.phase === 'before').length === 4);

  // Nur wolkige Kandidaten: der beste gewinnt UND wird gesagt.
  const c2 = classifyScenes([S('2026-08-09', 73), S('2026-08-06', 90), S('2026-08-16', 95)], first, last, now);
  add('nur-wolkig ⇒ bester Kandidat + Satz (vorher)', c2.pick.before?.dayIso === '2026-08-09'
    && c2.notes.some((n) => n.includes('Vorher-Bild') && n.includes('73')));
  add('nur-wolkig ⇒ Satz auch für das Nachher-Bild', c2.pick.after?.dayIso === '2026-08-16'
    && c2.notes.some((n) => n.includes('Nachher-Bild ist') && n.includes('95')));
  add('kein Überflug während des Brandes wird gesagt', c2.notes.some((n) => n.includes('Kein Überflug während')));

  // Dedupe: S2 schlägt Landsat am selben Tag; zwei S2-Granulate ⇒ kleinerer Wolkenwert.
  const c3 = classifyScenes([S('2026-08-10', 50), S('2026-08-10', 1, 'landsat'), S('2026-08-16', 60), S('2026-08-16', 40)],
    first, last, now);
  add('Dedupe: Sentinel-2 schlägt Landsat am selben Tag', c3.scenes.find((s) => s.dayIso === '2026-08-10')?.sat === 's2');
  add('Dedupe: kleinster Wolkenwert je Tag', c3.scenes.find((s) => s.dayIso === '2026-08-16')?.cloudPct === 40);

  // Latenzfall: Brandende nah an jetzt ⇒ der Grund heißt Latenz, nicht Fenster.
  const c4 = classifyScenes([S('2026-08-28', 10)], day('2026-08-29'), day('2026-08-30'), day('2026-08-31'));
  add('fehlendes Nachher-Bild nennt die Latenz', c4.pick.after === null
    && c4.notes.some((n) => n.includes('Noch kein Nachher-Bild')));

  // Unbekannter Zeitraum: keine Phasen, ein Satz.
  const c5 = classifyScenes([S('2026-08-10', 5)], null, null, now);
  add('firstMs null ⇒ phase null + Satz', c5.scenes[0]?.phase === null
    && c5.notes.some((n) => n.includes('Brandzeitraum unbekannt')));

  // BBox: Snapshot-Achsenreihenfolge S,W,N,O + Mindestgröße + 5:4 metrisch.
  const bb = snapshotBbox(50.7, 6.35, [6.3, 50.65, 6.4, 50.75]);
  add('snapshotBbox liefert S<N und W<O', bb[0] < bb[2] && bb[1] < bb[3]);
  add('snapshotBbox hält die Mindest-Ausdehnung', bb[2] - bb[0] >= MIN_LAT_SPAN - 1e-9);
  add('snapshotBbox: Breite metrisch im Bildverhältnis', (() => {
    const latSpan = bb[2] - bb[0];
    const lonSpan = bb[3] - bb[1];
    const metric = (lonSpan * Math.cos((50.7 * Math.PI) / 180)) / latSpan;
    return Math.abs(metric - SNAP_W / SNAP_H) < 0.02;
  })());
  const bigger = snapshotBbox(50.7, 6.35, [6.0, 50.4, 6.8, 51.0]);
  add('große Brand-BBox weitet den Ausschnitt', bigger[2] - bigger[0] > bb[2] - bb[0]);

  // URLs: Layer je Satellit, BBox in Snapshot-Ordnung, Deep-Link mit Tagesfenster.
  const su = snapshotUrl(bb, '2026-08-24', 's2');
  add('snapshotUrl trägt den S30-Layer + Tag', su.includes(LAYER.s2) && su.includes('TIME=2026-08-24'));
  add('snapshotUrl fordert 2× an (SAT1a: 25-m/px-Datenlage nicht unterabtasten)', su.includes('WIDTH=1200') && su.includes('HEIGHT=960'));
  add('snapshotUrl (Landsat) trägt den L30-Layer', snapshotUrl(bb, '2026-08-10', 'landsat').includes(LAYER.landsat));
  const cu = copernicusBrowserUrl(50.7, 6.35, '2026-08-24');
  add('Deep-Link: S2_L2A_CDAS + dateMode SINGLE + Tagesfenster', cu.includes('S2_L2A_CDAS')
    && cu.includes('dateMode=SINGLE') && cu.includes('2026-08-24T00') && cu.includes('2026-08-24T23'));
  const body = stacSearchBody(50.7, 6.35, day('2026-07-15'), now) as { collections: string[]; limit: number };
  add('STAC: beide Collections in EINER Anfrage', body.collections.includes('sentinel-2-l2a')
    && body.collections.includes('landsat-c2-l2') && body.limit === 100);

  // Parser: kaputte Einträge fallen heraus, Landsat wird erkannt.
  const parsed = parseStacScenes({ features: [
    { collection: 'sentinel-2-l2a', properties: { datetime: '2026-08-14T10:46:50Z', 'eo:cloud_cover': 0.4 } },
    { collection: 'landsat-c2-l2', properties: { datetime: '2026-08-10T10:27:44Z', 'eo:cloud_cover': 1 } },
    { collection: 'sentinel-2-l2a', properties: { datetime: 'kaputt' } },
  ] });
  add('parseStacScenes: 2 gültige, Landsat erkannt, kaputtes Datum fällt', parsed.length === 2
    && parsed.some((s) => s.sat === 'landsat'));

  // --- SAT2a: Tages-Suche, Kandidaten-Parser, Granulat-Wahl, Kill-Switch ----------------------
  const dayBody = stacDayBody(50.7, 6.35, '2026-08-24') as {
    collections: string[]; limit: number; datetime: string; fields?: unknown;
  };
  add('[10m] Tages-Suche: EINE Collection, Tagesfenster, ohne fields-Beschnitt (assets nötig)',
    dayBody.collections.length === 1 && dayBody.collections[0] === 'sentinel-2-l2a'
    && dayBody.limit === 4 && dayBody.datetime.startsWith('2026-08-24T00')
    && dayBody.datetime.includes('/2026-08-24T23') && dayBody.fields === undefined);

  // Kandidaten-Parser mit gestubbter Pixelrechnung (die echte prüft `verifySentinelGeo`).
  const stubPx = (_la: number, _lo: number, epsg: number) =>
    epsg === 32631 ? { px: 3600, py: 800 } : epsg === 32632 ? { px: 1300, py: 5000 } : null;
  const mkFeat = (epsg: number, cloud: number, href = `https://sentinel-cogs.s3.us-west-2.amazonaws.com/x-${epsg}/TCI.tif`) => ({
    properties: { 'eo:cloud_cover': cloud, 'proj:epsg': epsg },
    assets: { visual: { href, 'proj:transform': [10, 0, 699960, 0, -10, 5700000], 'proj:shape': [10980, 10980] } },
  });
  const cands = parseS2CogCandidates({ features: [
    mkFeat(32631, 0.1), mkFeat(32632, 5),
    { properties: { 'proj:epsg': 32631 }, assets: {} }, // ohne visual-Asset ⇒ fällt
    mkFeat(32631, 1, 's3://kein-http-pfad/TCI.tif'), // s3-Schema ⇒ fällt
  ] }, 50.7, 6.35, stubPx);
  add('[10m] Kandidaten-Parser: nur vollständige https-Assets, Randabstand gerechnet',
    cands.length === 2 && cands[0].marginPx === 800 && cands[1].marginPx === 1300);

  // Granulat-Wahl in beide Richtungen: passt das Fenster, entscheidet die Wolke — sonst der Rand.
  const near = { ...cands[0], marginPx: 300, cloudPct: 0 };
  const far = { ...cands[1], marginPx: 5000, cloudPct: 60 };
  add('[10m] pickGranule: Fenster-Deckung schlägt Wolkenfreiheit', pickGranule([near, far])?.marginPx === 5000);
  const fitA = { ...cands[0], marginPx: 2000, cloudPct: 40 };
  const fitB = { ...cands[1], marginPx: 1500, cloudPct: 2 };
  add('[10m] pickGranule: decken beide das Fenster, gewinnt die kleinere Wolke', pickGranule([fitA, fitB])?.cloudPct === 2);
  add('[10m] pickGranule: kein Kandidat ⇒ null', pickGranule([]) === null);

  // Kill-Switch-Wahrheitstafel (injektierbar, Muster hdf5WorkerEnabled).
  add('[10m] sat10Enabled: Query schlägt Speicher in beide Richtungen',
    sat10Enabled('?sat10=0', null) === false && sat10Enabled('?sat10=1', '0') === true
    && sat10Enabled('', '0') === false && sat10Enabled('', null) === true);

  // --- SAT2b: Band-Referenzen, Granulat-Kennung, Vorher-Suche ---------------------------------
  add('[dnbr] granuleSquareOf liest die MGRS-Kennung aus dem COG-Pfad',
    granuleSquareOf('https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/S2C_31UGS_20260814_0_L2A/TCI.tif') === '31UGS'
    && granuleSquareOf('https://beispiel/anderer/pfad.tif') === null);
  const withBands = parseS2CogCandidates({ features: [{
    properties: { 'eo:cloud_cover': 1, 'proj:epsg': 32631 },
    assets: {
      visual: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/TCI.tif', 'proj:transform': [10, 0, 699960, 0, -10, 5700000], 'proj:shape': [10980, 10980] },
      swir22: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/B12.tif', 'raster:bands': [{ scale: 0.0001, offset: -0.1 }] },
      nir08: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/B8A.tif' },
      red: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/B04.tif' },
    },
  }] }, 50.7, 6.35, stubPx);
  add('[dnbr] Kandidat trägt Bänder + Skala aus raster:bands + Granulat',
    withBands[0]?.bands?.swir22.endsWith('B12.tif') === true && withBands[0]?.bands?.offset === -0.1
    && withBands[0]?.square === '31UGS');
  add('[dnbr] fehlt ein Band, ist bands null (nie ein Teilsatz) — SAT2a-Kandidaten unverändert',
    cands[0].bands === null && cands[0].square === null);
  add('[scl] SCL ist OPTIONAL: ohne scl-Asset bleiben die Bänder nutzbar (scl null, bands nicht null)',
    withBands[0]?.bands !== null && withBands[0]?.bands?.scl === null);
  const withScl = parseS2CogCandidates({ features: [{
    properties: { 'eo:cloud_cover': 1, 'proj:epsg': 32631 },
    assets: {
      visual: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/TCI.tif', 'proj:transform': [10, 0, 699960, 0, -10, 5700000], 'proj:shape': [10980, 10980] },
      swir22: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/B12.tif' },
      nir08: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/B8A.tif' },
      red: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/B04.tif' },
      scl: { href: 'https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs/31/U/GS/2026/8/X/SCL.tif' },
    },
  }] }, 50.7, 6.35, stubPx);
  add('[scl] mit scl-Asset trägt bands den Pfad', withScl[0]?.bands?.scl?.endsWith('SCL.tif') === true);

  const preBody = stacPreListBody(50.7, 6.35, '2026-08-24') as { collections: string[]; datetime: string; limit: number; fields: unknown };
  add('[dnbr] Vorher-Listen-Suche: nur S2, 35 Tage RÜCKSCHAU, endet vor dem Vergleichstag, mit fields-Beschnitt',
    preBody.collections.length === 1 && preBody.limit === 40 && preBody.fields !== undefined
    && preBody.datetime.startsWith('2026-07-20T00:00:00.000Z') && preBody.datetime.includes('/2026-08-23T23:59:59'));

  // Nachbau des gemessenen Falls: 09.08. 78 % · 25.07. 0,2 % · fremdes Granulat 32ULB wolkenfrei.
  const preJson = { features: [
    { id: 'S2B_31UGS_20260809_0_L2A', properties: { datetime: '2026-08-09T10:46:00Z', 'eo:cloud_cover': 78.2 } },
    { id: 'S2C_31UGS_20260725_0_L2A', properties: { datetime: '2026-07-25T10:46:00Z', 'eo:cloud_cover': 0.2 } },
    { id: 'S2C_31UGS_20260715_0_L2A', properties: { datetime: '2026-07-15T10:46:00Z', 'eo:cloud_cover': 13 } },
    { id: 'S2C_32ULB_20260812_0_L2A', properties: { datetime: '2026-08-12T10:46:00Z', 'eo:cloud_cover': 0 } },
  ] };
  add('[dnbr] pickPreDay: LETZTE wolkenarme Szene DESSELBEN Granulats (Wolke schlägt Nähe, fremdes Granulat nie)',
    pickPreDay(preJson, '31UGS') === '2026-07-25' && pickPreDay(preJson, '32ULB') === '2026-08-12');
  add('[dnbr] pickPreDay: nur wolkige Kandidaten ⇒ null (benannte Absage, kein bester Rest)',
    pickPreDay({ features: [preJson.features[0]] }, '31UGS') === null && pickPreDay(null, '31UGS') === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
