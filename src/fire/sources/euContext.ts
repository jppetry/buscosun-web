/**
 * Ausbaustufe 2 (WB4) — Brennmaterial, Kontext-Geometrien und frühere Brandflächen.
 *
 * Drei Layer, drei Betreiber, ein gemeinsamer Nenner: Alle drei sagen etwas über
 * die **Vorbedingungen** eines Brandes, keiner etwas über die heutige Lage.
 * Genau das muss die Beschriftung tragen.
 *
 * ── Was hier NICHT steht, und warum ─────────────────────────────────────────
 * `fireDrought` (EDO `smian`/`smand`) und `fireVegetation` (EDO `fpanv`) fehlen.
 * Sie sind nicht vergessen, sondern **blockiert**: `drought.emergency.copernicus.eu`
 * sendet `access-control-allow-origin` **doppelt** (`*, *`), was nach Spezifikation
 * ungültig ist. In Node fiel das nicht auf (dort kam HTTP 200), im Browser
 * scheitert MapLibre mit `AJAXError: Failed to fetch (0)` und lädt null Kacheln.
 * Gegengeprüft: `mode:'no-cors'` liefert eine *opaque* Antwort, der Server läuft
 * also — nur die Freigabe ist unbrauchbar. Ein `<img>` lädt die Kachel sogar,
 * weil Bilder keiner CORS-**Lese**prüfung unterliegen; MapLibre braucht sie aber,
 * um die Kachel als WebGL-Textur hochzuladen.
 *
 * Die Lösung wäre ein Rewrite in `netlify.toml` — **STOPP-&-FRAGEN-Zone**
 * (`audit/waldbrand-ausbau.md` §4). Vorgeschlagen, nicht eingetragen.
 */

import { assertDachAxis, bboxIsLatLon } from './wfsAxis';
import {
  parseBurntFeature, dominantLandcover, squarePolygon, type BurntPolygon,
} from '../fireCorroboration';

const EFFIS = 'https://maps.effis.emergency.copernicus.eu';
const EEA_IMAGE = 'https://image.discomap.eea.europa.eu/arcgis/services';
const EEA_BIO = 'https://bio.discomap.eea.europa.eu/arcgis/services';

export const EFFIS_FUEL_ATTRIBUTION =
  '© European Union, Copernicus Emergency Management Service — '
  + '<a href="https://effis.jrc.ec.europa.eu/" target="_blank" rel="noopener">EFFIS</a> (CC BY 4.0)';

export const EEA_ATTRIBUTION =
  'Generated using European Union&rsquo;s Copernicus Land Monitoring Service information · '
  + '© <a href="https://www.eea.europa.eu/" target="_blank" rel="noopener">EEA</a>';

/** Gemeinsamer Bau einer WMS-Kachel-URL mit MapLibres `{bbox-epsg-3857}`.
 *  Der Platzhalter darf **nicht** kodiert werden — sonst liefert der Dienst
 *  stumm leere Kacheln (dieselbe Falle wie bei `gwisTileUrl`). */
function wmsTiles(base: string, layer: string, version = '1.3.0'): string {
  const crsKey = version === '1.1.1' ? 'SRS' : 'CRS';
  return `${base}?SERVICE=WMS&VERSION=${version}&REQUEST=GetMap&LAYERS=${layer}`
    + `&STYLES=&${crsKey}=EPSG:3857&BBOX={bbox-epsg-3857}`
    + '&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=TRUE';
}

/**
 * `fireFuel` — Europäische Brennmaterial-Karte (EFFIS `fuel_map`).
 * 42 Vegetationskomplexe, auf 13 NFFL-Klassen nach Anderson (1982) abgebildet.
 * **Stand 2017** — eine Bestandsaufnahme, keine Beobachtung.
 */
export function fuelMapSource() {
  return {
    type: 'raster' as const,
    tiles: [wmsTiles(`${EFFIS}/gwis`, 'fuel_map')],
    tileSize: 256,
    attribution: EFFIS_FUEL_ATTRIBUTION,
    bounds: [-26, 27, 46, 72] as [number, number, number, number],
    maxzoom: 11,
  };
}

/**
 * `fireContext` — Natura-2000-Schutzgebiete (EEA).
 *
 * ⚠️ **Die Schweiz ist nicht enthalten**, weil sie nicht in der EU ist. Ohne
 * Hinweis läse sich die leere Fläche als „keine Schutzgebiete" — dieselbe Sorte
 * stiller Falschaussage wie eine leere Warnkarte. Der Steckbrief sagt es, und
 * das Readout wiederholt es.
 */
export function natura2000Source() {
  return {
    type: 'raster' as const,
    tiles: [wmsTiles(`${EEA_BIO}/ProtectedSites/Natura2000Sites/MapServer/WMSServer`, '0')],
    tileSize: 256,
    attribution: EEA_ATTRIBUTION,
    maxzoom: 12,
  };
}

/** CORINE Land Cover 2018 — Landbedeckung als grober Brennmaterial-Kontext. */
export function clc2018Source() {
  return {
    type: 'raster' as const,
    tiles: [wmsTiles(`${EEA_IMAGE}/Corine/CLC2018_WM/MapServer/WMSServer`, '1')],
    tileSize: 256,
    attribution: EEA_ATTRIBUTION,
    maxzoom: 12,
  };
}

// ---------------------------------------------------------------------------
// `fireBurnt` — Brandflächen der EFFIS-Kartierung (Rapid Damage Assessment)
// ---------------------------------------------------------------------------

export const EFFIS_BURNT_ATTRIBUTION = EFFIS_FUEL_ATTRIBUTION;

/**
 * ── Die Korrektur aus Phase E0 (V-224) — bitte lesen, bevor hier ein Deckel
 *    gesetzt wird ────────────────────────────────────────────────────────────
 * Die erste Fassung fragte `ms:modis.ba.poly` mit `maxfeatures=800` ab und las
 * daraus „der Bestand endet 2018". Das war **falsch, und zwar durch den
 * Deckel selbst**: MapServer wendet `maxfeatures` **vor** dem BBox-Filter an
 * und liefert die 800 kleinsten `id`s europaweit — die ältesten. In DACH blieben
 * davon 46 (WB4) bzw. 716 (E0) übrig, alle alt; die jüngsten Flächen wurden
 * **zuerst** abgeschnitten. Ohne Deckel: 1.270 Polygone in DACH von 2016 bis
 * gestern, `LASTUPDATE` vom Vortag (`audit/waldbrand-effis.md` §0 B2, §5).
 * Der Layer zeigte also die ältesten statt der jüngsten Narben und nannte das
 * „Rückblick" — genau die stille Falschaussage, die V-198 an der Quelle
 * bemängelt hat, diesmal selbst gebaut.
 *
 * ── Zwei Zeitkörbe, nie gemischt ─────────────────────────────────────────────
 *  • **Saison** — `ms:modis.ba.poly.season`: die laufende Saison (Kalenderjahr),
 *    live, ~1,4 MB, DACH 293 Flächen am 2026-08-15. Der Standardkorb.
 *  • **Archiv** — `ms:modis.ba.poly` ohne Kleindeckel, clientseitig auf die
 *    **Vorjahre** gefiltert (die Saison ist darin auch enthalten und würde sonst
 *    doppelt gezeichnet). ~4,8 MB unkomprimiert — der Server sendet keine
 *    `content-encoding` (V-226). Deshalb **nur auf Wunsch** geladen.
 *  Beide haben eigene Quellen und eigene Darstellung in `FireMap.tsx`.
 *
 * ── Alles aus den Daten ──────────────────────────────────────────────────────
 * Zeitspanne (`FIREDATE`), Stand (`LASTUPDATE`) und die **untere Flächengrenze**
 * (`min AREA_HA`) werden je Korb gelesen. Fest eingetragen wäre jede dieser
 * Zahlen bald falsch: die Kartierschwelle ist 2019/2020 von ~20–50 ha auf
 * 0–2 ha gefallen (Sentinel-2-Ära, §5.3 der Diagnose).
 */

/**
 * Die eingeblendeten Zeitkörbe. Sie **überlappen sich nie**: `archive` ist das
 * Komplement von `season` in den Vorjahren, und `week` (BF4) ist das Komplement
 * innerhalb der laufenden Saison — ist er an, zeigt `season` nur die älteren
 * Flächen. Sonst läge jede frische Fläche doppelt übereinander.
 */
export type BurntBucket = 'week' | 'season' | 'archive';

/**
 * Körbe, die wirklich **abgerufen** werden. `week` gehört nicht dazu: BF0 hat
 * `week ⊂ season` vollständig belegt (0 von 23 Kennungen fehlten), also ist die
 * Historie ein Filter auf den Saison-Korb und kein zweiter Abruf
 * (`audit/brandflaechen-echtzeit.md` §6, `src/fire/footprint/history.ts`).
 */
export type BurntFetchBucket = 'season' | 'archive';

/** Welcher Abruf einen eingeblendeten Korb bedient. */
export const fetchBucketOf = (b: BurntBucket): BurntFetchBucket => (b === 'week' ? 'season' : b);

const WFS_11 = `${EFFIS}/effis?service=WFS&request=GetFeature&version=1.1.0&outputformat=geojson`
  + '&bbox=45.5,5.5,55.5,17.5,EPSG:4326';

/**
 * Deckel als **Notbremse**, nicht als Mengensteuerung: weit über dem gemessenen
 * Bestand (DACH-Archiv 1.270 am 2026-08-15, ~+300/Jahr). Greift er doch,
 * meldet der Lauf `truncated`, und der Steckbrief sagt, dass die JÜNGSTEN
 * fehlen — denn genau die schneidet der Server zuerst ab.
 */
export const BURNT_MAX_FEATURES = 6000;

export const BURNT_TYPENAME: Record<BurntBucket, string> = {
  season: 'ms:modis.ba.poly.season',
  archive: 'ms:modis.ba.poly',
  week: 'ms:modis.ba.poly.week',
};

export function burntUrl(which: BurntBucket): string {
  return `${WFS_11}&typename=${BURNT_TYPENAME[which]}&maxfeatures=${BURNT_MAX_FEATURES}`;
}

export interface BurntRun {
  bucket: BurntFetchBucket;
  /** GeoJSON für die Karte — mit `lc` (dominante Landbedeckung) je Feature. */
  features: GeoJSON.FeatureCollection;
  /** Dieselben Flächen als Geometrie-Modell (für Popup und Bestätigung). */
  polygons: BurntPolygon[];
  count: number;
  /** Zeitspanne der Brände — **aus den Daten gelesen** (`YYYY-MM-DD`). */
  from: string | null;
  to: string | null;
  /** Jüngste Bearbeitung durch EFFIS — der „Stand" des Korbs. */
  lastUpdateMs: number | null;
  /** Kleinste und größte kartierte Fläche in Hektar — die Kartierschwelle aus den Daten. */
  minAreaHa: number | null;
  maxAreaHa: number | null;
  /** Wurde der Notbremsen-Deckel erreicht? Dann fehlen die JÜNGSTEN Flächen. */
  truncated: boolean;
}

const _cache = new Map<BurntFetchBucket, { run: BurntRun; at: number }>();
const TTL = 6 * 3_600_000;

const isoDay = (ms: number | null): string | null =>
  ms == null ? null : new Date(ms).toISOString().slice(0, 10);

/**
 * Antwort → Lauf. Der Archiv-Korb wird auf `FIREDATE < 1. Januar des laufenden
 * Jahres` gefiltert, damit sich die beiden Körbe nicht überlappen; `nowMs`
 * kommt herein (D-12: kein `Date.now()` in der Auswertung).
 */
export function buildBurntRun(
  fc: GeoJSON.FeatureCollection, bucket: BurntFetchBucket, nowMs: number, rawCount?: number,
): BurntRun {
  const seasonStart = Date.UTC(new Date(nowMs).getUTCFullYear(), 0, 1);
  const feats = Array.isArray(fc?.features) ? fc.features : [];
  const polygons: BurntPolygon[] = [];
  const outFeats: GeoJSON.Feature[] = [];
  let from: number | null = null, to: number | null = null, upd: number | null = null;
  let minHa: number | null = null, maxHa: number | null = null;

  for (const f of feats) {
    const p = parseBurntFeature(f);
    if (!p) continue;
    if (bucket === 'archive' && p.firedateMs != null && p.firedateMs >= seasonStart) continue;
    polygons.push(p);
    outFeats.push({
      type: 'Feature',
      geometry: f.geometry,
      // Nur, was die Karte zum Zeichnen braucht: die dominante Klasse und die
      // Kennung fürs Popup. Die vollen Anteile liegen im Polygon-Modell.
      properties: { id: p.id, lc: dominantLandcover(p) ?? 'OTHERLC' },
    });
    if (p.firedateMs != null) {
      if (from == null || p.firedateMs < from) from = p.firedateMs;
      if (to == null || p.firedateMs > to) to = p.firedateMs;
    }
    if (p.lastUpdateMs != null && (upd == null || p.lastUpdateMs > upd)) upd = p.lastUpdateMs;
    if (p.areaHa != null) {
      if (minHa == null || p.areaHa < minHa) minHa = p.areaHa;
      if (maxHa == null || p.areaHa > maxHa) maxHa = p.areaHa;
    }
  }

  return {
    bucket,
    features: { type: 'FeatureCollection', features: outFeats },
    polygons,
    count: polygons.length,
    from: isoDay(from),
    to: isoDay(to),
    lastUpdateMs: upd,
    minAreaHa: minHa,
    maxAreaHa: maxHa,
    truncated: (rawCount ?? feats.length) >= BURNT_MAX_FEATURES,
  };
}

/** Lädt einen Korb (Saison oder Archiv). */
export async function fetchBurntAreas(bucket: BurntFetchBucket, signal?: AbortSignal): Promise<BurntRun> {
  const cached = _cache.get(bucket);
  if (cached && Date.now() - cached.at < TTL) return cached.run;

  const res = await fetch(burntUrl(bucket), { signal });
  if (!res.ok) throw new Error(`EFFIS Brandflächen: HTTP ${res.status}`);
  const fc = (await res.json()) as GeoJSON.FeatureCollection;
  // A0-1: gespiegelte Achsen verwerfen (wfsAxis.ts) — /effis liefert bei
  // vertauschter BBox zwar 0 Features, der Anker gilt trotzdem für beide Endpunkte.
  assertDachAxis(Array.isArray(fc?.features) ? fc.features : [], 'EFFIS Brandflächen');
  const run = buildBurntRun(fc, bucket, Date.now(), fc?.features?.length ?? 0);
  _cache.set(bucket, { run, at: Date.now() });
  return run;
}

/**
 * Die Flächen der letzten sieben Tage — für die **Bestätigung** einer
 * Detektion (`fireCorroboration.ts`), unabhängig davon, ob der Brandflächen-
 * Layer eingeschaltet ist. Klein (~100 KB in DACH), TTL 30 min. Das ist der
 * eine zusätzliche Abruf dieser Phase, und er ist ausgewiesen (V-225).
 */
let _week: { polygons: BurntPolygon[]; at: number } | null = null;
const WEEK_TTL = 30 * 60_000;

export async function fetchBurntWeek(signal?: AbortSignal): Promise<BurntPolygon[]> {
  if (_week && Date.now() - _week.at < WEEK_TTL) return _week.polygons;
  const res = await fetch(burntUrl('week'), { signal });
  if (!res.ok) throw new Error(`EFFIS Brandflächen (7 Tage): HTTP ${res.status}`);
  const fc = (await res.json()) as GeoJSON.FeatureCollection;
  assertDachAxis(Array.isArray(fc?.features) ? fc.features : [], 'EFFIS Brandflächen (7 Tage)');
  const polygons = (Array.isArray(fc?.features) ? fc.features : [])
    .map(parseBurntFeature).filter((p): p is BurntPolygon => p != null);
  _week = { polygons, at: Date.now() };
  return polygons;
}

export function resetBurntCache(): void { _cache.clear(); _week = null; }

/**
 * Die Beschriftung der Zeitspanne — **die Ehrlichkeitsstelle des Layers**.
 *
 * Der Saison-Korb ist eine laufende Kartierung mit Stand; der Archiv-Korb ist
 * ein Rückblick und heißt so. Liegt der jüngste Brand eines Korbs mehr als
 * 18 Monate zurück, sagt die Zeile ausdrücklich, dass das KEINE aktuelle Lage ist
 * — die Regel aus WB4 bleibt, sie trifft jetzt nur den richtigen Korb.
 */
export function burntPeriodLabel(run: BurntRun, nowMs: number): string {
  if (!run.from || !run.to) return 'Zeitraum unbekannt — die Quelle nennt kein Branddatum';
  const jahrVon = run.from.slice(0, 4);
  const jahrBis = run.to.slice(0, 4);
  const spanne = jahrVon === jahrBis ? jahrVon : `${jahrVon}–${jahrBis}`;
  const alterMonate = (nowMs - Date.parse(`${run.to}T00:00:00Z`)) / 2.6298e9;
  if (run.bucket === 'archive') {
    return `Archiv ${spanne} — frühere Saisons, KEINE aktuelle Lage`;
  }
  return alterMonate > 18
    ? `Rückblick ${spanne} — der Bestand endet ${jahrBis}, das ist KEINE aktuelle Lage`
    : `Saison ${spanne}, Brände bis ${run.to.slice(8, 10)}.${run.to.slice(5, 7)}.`;
}

/**
 * Die Kartierschwelle — aus den Daten, nie fest eingetragen. Und der Zusatz,
 * dass auch oberhalb nicht jede Fläche kartiert wird: Wolken, Kartierverzug,
 * Prüfung. Sonst läse sich „kleinste 2 ha" als „alles ab 2 ha ist drin".
 */
export function burntThresholdNote(run: BurntRun): string {
  if (run.minAreaHa == null) return 'Die Quelle nennt keine Flächengrößen.';
  const kleinste = run.minAreaHa < 1 ? 'unter 1 ha' : `${run.minAreaHa.toLocaleString('de-DE')} ha`;
  return `Kleinste kartierte Fläche in diesem Korb: ${kleinste} — kleinere Brände fehlen, und auch größere `
    + 'werden nicht lückenlos kartiert (Satellitenbild, Wolken, Kartierverzug). Fehlen heißt nicht „kein Brand".';
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface ContextCheck { name: string; ok: boolean; detail?: string }

export function verifyEuContext(): { checks: ContextCheck[]; passed: number; total: number } {
  const checks: ContextCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  for (const [name, src] of [
    ['fuel_map', fuelMapSource()], ['Natura 2000', natura2000Source()], ['CLC2018', clc2018Source()],
  ] as const) {
    add(`${name}: BBox-Platzhalter unkodiert`, src.tiles[0].includes('BBOX={bbox-epsg-3857}'));
    add(`${name}: EPSG:3857 (MapLibre-Weg)`, /CRS=EPSG:3857|SRS=EPSG:3857/.test(src.tiles[0]));
    add(`${name}: PNG mit Transparenz`,
      src.tiles[0].includes('FORMAT=image/png') && src.tiles[0].includes('TRANSPARENT=TRUE'));
    add(`${name}: Attribution vorhanden`, !!src.attribution && src.attribution.length > 20);
  }
  add('die drei Quellen sind wirklich verschieden',
    new Set([fuelMapSource().tiles[0], natura2000Source().tiles[0], clc2018Source().tiles[0]]).size === 3);

  // EDO darf hier nirgends auftauchen — es ist blockiert, nicht vergessen.
  add('kein EDO-Endpunkt in den Quellen',
    ![fuelMapSource(), natura2000Source(), clc2018Source()]
      .some((s) => /drought\.emergency/.test(s.tiles[0])));

  // --- Die Ehrlichkeitsstelle: die Zeitspanne kommt aus den DATEN ----------
  const now = Date.UTC(2026, 7, 15);
  const leer: BurntRun = {
    bucket: 'season', features: { type: 'FeatureCollection', features: [] }, polygons: [], count: 46,
    from: '2016-04-21', to: '2018-09-20', lastUpdateMs: null, minAreaHa: 22, maxAreaHa: 1200, truncated: false,
  };
  const label = burntPeriodLabel(leer, now);
  add('alter Bestand wird als RÜCKBLICK beschriftet, nicht als Lage',
    label.includes('Rückblick') && label.includes('2016–2018')
      && label.includes('KEINE aktuelle Lage'), label);

  const frisch: BurntRun = { ...leer, from: '2026-01-04', to: '2026-08-13' };
  add('Saison-Korb heißt Saison und nennt das jüngste Branddatum',
    burntPeriodLabel(frisch, now) === 'Saison 2026, Brände bis 13.08.', burntPeriodLabel(frisch, now));

  const archiv: BurntRun = { ...leer, bucket: 'archive', from: '2016-04-21', to: '2025-09-30' };
  add('Archiv-Korb heißt Archiv und sagt KEINE aktuelle Lage',
    /^Archiv 2016–2025/.test(burntPeriodLabel(archiv, now)) && /KEINE aktuelle Lage/.test(burntPeriodLabel(archiv, now)));

  add('ohne Datum wird KEINE Spanne behauptet',
    burntPeriodLabel({ ...leer, from: null, to: null }, now).includes('unbekannt'));

  // --- Kartierschwelle aus den Daten -----------------------------------------
  add('Kartierschwelle nennt die kleinste Fläche UND dass Fehlen nicht „kein Brand" heißt',
    /22 ha/.test(burntThresholdNote(leer)) && /Fehlen heißt nicht/.test(burntThresholdNote(leer)));
  add('unter 1 ha wird als „unter 1 ha" gesagt, nicht als „0 ha"',
    /unter 1 ha/.test(burntThresholdNote({ ...leer, minAreaHa: 0 })));

  // --- URLs: DACH, kein Kleindeckel, zwei Körbe + Wochenlayer -----------------
  for (const w of ['season', 'archive', 'week'] as const) {
    const u = burntUrl(w);
    add(`${w}: URL zielt auf den DACH-Ausschnitt und den richtigen Typnamen`,
      u.includes('bbox=45.5,5.5,55.5,17.5,EPSG:4326') && u.includes(`typename=${BURNT_TYPENAME[w]}`)
        && u.includes('/effis?'), u);
  }
  add('der Deckel ist eine Notbremse (≥ 5000), kein Kleindeckel wie die 800 aus WB4 (V-224)',
    BURNT_MAX_FEATURES >= 5000);
  add('Brandflächen-BBox: erster Wert im Breitengradband (Achsen-Anker A0-1)',
    (['season', 'archive', 'week'] as const).every((w) => bboxIsLatLon(burntUrl(w))));
  add('Saison- und Archiv-Typname sind verschieden',
    BURNT_TYPENAME.season !== BURNT_TYPENAME.archive && BURNT_TYPENAME.season.endsWith('.season'));

  // --- buildBurntRun: Körbe trennen sich, Werte kommen aus den Daten ---------
  const mk = (id: string, fd: string, ha: string, upd: string, extra: Record<string, unknown> = {}) =>
    squarePolygon(11 + Number(id) * 0.01, 50, 800, {
      id, FIREDATE: fd, LASTUPDATE: upd, AREA_HA: ha, CONIFER: '100', BROADLEA: '0', MIXED: '0', SCLEROPH: '0',
      TRANSIT: '0', OTHERNATLC: '0', AGRIAREAS: '0', ARTIFSURF: '0', OTHERLC: '0', PERCNA2K: '0', ...extra,
    });
  const fc: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [
    mk('1', '2016-08-07 00:00:00', '170', '2022-01-26 11:57:54.973474'),
    mk('2', '2025-09-30 12:00:00', '3', '2025-10-02 08:00:00'),
    mk('3', '2026-08-13 10:41:00', '2', '2026-08-14 14:38:36.282953', { AGRIAREAS: '60', CONIFER: '40' }),
  ] };
  const season = buildBurntRun(fc, 'season', now);
  const archive = buildBurntRun(fc, 'archive', now);
  add('Archiv-Korb enthält NUR Vorjahre (die Saison wird herausgefiltert)',
    archive.count === 2 && archive.to === '2025-09-30', `${archive.count}, bis ${archive.to}`);
  add('Saison-Korb nimmt, was der Saison-Layer liefert (keine zweite Filterung)', season.count === 3);
  add('Stand = jüngstes LASTUPDATE', season.lastUpdateMs === Date.UTC(2026, 7, 14, 14, 38, 36));
  add('min/max AREA_HA aus den Daten', season.minAreaHa === 2 && season.maxAreaHa === 170);
  add('Feature trägt die dominante Landbedeckung als `lc`',
    (season.features.features[2].properties as { lc: string }).lc === 'AGRIAREAS'
      && (season.features.features[0].properties as { lc: string }).lc === 'CONIFER');
  add('nicht abgeschnitten, solange der Deckel nicht erreicht ist', season.truncated === false);
  add('Deckel erreicht ⇒ truncated', buildBurntRun(fc, 'season', now, BURNT_MAX_FEATURES).truncated === true);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
