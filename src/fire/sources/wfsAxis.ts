/**
 * Achsen-Anker für die EFFIS/GWIS-WFS-Antworten (Phase A0-1, Gate GWBA1).
 *
 * ── Der gemessene Fallstrick ────────────────────────────────────────────────
 * Der MapServer hinter `maps.effis.emergency.copernicus.eu` **spiegelt die
 * Achsenreihenfolge der Eingabe-BBox in die Ausgabe-Geometrie**
 * (`audit/waldbrand-behoerden.md` §1, `audit/l0/waldbrand-behoerden-axis.json`):
 *
 *   /gwis  bbox=45.5,5.5,55.5,17.5  → `[10.589, 49.547]`  = [lon,lat] ✅ (heutiger Code)
 *   /gwis  bbox=5.5,45.5,17.5,55.5  → `[49.131, 15.594]`  = [lat,lon] ⚠️ — 5 statt 2.736 Features,
 *                                      HTTP 200, kein Fehler; MapLibre zeichnete sie vor Somalia
 *   /effis bbox=5.5,45.5,17.5,55.5  → 0 Features, HTTP 200
 *
 * Zwei Endpunkte, zwei Verhalten, beide ohne Fehlermeldung. Ein Anker auf die
 * URL-Form allein bemerkt das nicht. Deshalb prüft dieses Modul die
 * **zurückgegebenen Koordinaten**: erster Wert im DACH-Längengradband, zweiter
 * im Breitengradband. Eine gespiegelte Antwort wird als Fehler behandelt —
 * lieber „Quelle nicht lesbar" als eine Karte mit Punkten im Indischen Ozean.
 *
 * Pur, DOM-frei; Verifier `verify:fire-sources` prüft mit den echten Stichproben
 * beider Reihenfolgen aus der A0-1-Sonde.
 */

/** DACH-Bänder — dieselbe Hülle wie die BBox der Abrufe (firmsHotspots/gwisHotspots). */
export const DACH_LON = { min: 5.5, max: 17.5 } as const;
export const DACH_LAT = { min: 45.5, max: 55.5 } as const;

export type AxisVerdict = 'lonlat' | 'latlon' | 'empty' | 'unknown';

const inLon = (v: number) => v >= DACH_LON.min && v <= DACH_LON.max;
const inLat = (v: number) => v >= DACH_LAT.min && v <= DACH_LAT.max;

/** Erste Stützstelle einer Geometrie (Point/Polygon/MultiPolygon/…), sonst null. */
export function firstPosition(g: GeoJSON.Geometry | null | undefined): number[] | null {
  if (!g) return null;
  switch (g.type) {
    case 'Point': return g.coordinates as number[];
    case 'MultiPoint': case 'LineString': return (g.coordinates as number[][])[0] ?? null;
    case 'Polygon': case 'MultiLineString': return (g.coordinates as number[][][])[0]?.[0] ?? null;
    case 'MultiPolygon': return (g.coordinates as number[][][][])[0]?.[0]?.[0] ?? null;
    default: return null;
  }
}

/**
 * Urteil über die Achsenreihenfolge einer Feature-Menge — aus bis zu `sample`
 * Stichproben. `lonlat` = RFC 7946, `latlon` = gespiegelt.
 */
export function axisVerdict(features: readonly GeoJSON.Feature[], sample = 50): AxisVerdict {
  const pts: number[][] = [];
  for (const f of features) {
    const p = firstPosition(f.geometry);
    if (p && Number.isFinite(p[0]) && Number.isFinite(p[1])) pts.push(p);
    if (pts.length >= sample) break;
  }
  if (!pts.length) return 'empty';
  const lonlat = pts.filter((p) => inLon(p[0]) && inLat(p[1])).length / pts.length;
  const latlon = pts.filter((p) => inLat(p[0]) && inLon(p[1])).length / pts.length;
  if (lonlat > 0.9) return 'lonlat';
  if (latlon > 0.9) return 'latlon';
  return 'unknown';
}

/**
 * Wirft, wenn die Antwort gespiegelt ist. Leere Antworten sind erlaubt (kein
 * Brand ist ein gültiger Zustand); `unknown` wird durchgelassen, aber vom
 * Aufrufer als Warnung protokolliert — außerhalb DACH liegende Daten sind bei
 * einer DACH-BBox nicht zu erwarten.
 */
export function assertDachAxis(features: readonly GeoJSON.Feature[], source: string): AxisVerdict {
  const v = axisVerdict(features);
  if (v === 'latlon') {
    throw new Error(`${source}: Achsen gespiegelt ([lat,lon] statt [lon,lat]) — Antwort verworfen`);
  }
  return v;
}

/**
 * Anker auf die BBox-Form der Abruf-URLs: WFS 1.1.0 + EPSG:4326 verlangt
 * **lat,lon** — der erste Wert muss im Breitengradband liegen. Wer die
 * Reihenfolge „korrigiert", macht diesen Test rot.
 */
export function bboxIsLatLon(url: string): boolean {
  const m = url.match(/[?&]bbox=([-\d.]+),([-\d.]+),([-\d.]+),([-\d.]+)/i);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return inLat(a) && inLon(b);
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei) — Stichproben aus der A0-1-Sonde
// ---------------------------------------------------------------------------

/** Echte erste Koordinaten aus audit/l0/waldbrand-behoerden-axis.json. */
export const AXIS_FIXTURE = {
  gwisTodayLatLonBbox: [[10.58873, 49.54728], [12.62606, 45.50718]],  // → lonlat ✅
  gwisTodayLonLatBbox: [[49.13099, 15.59377], [47.71354, 10.01703]],  // → latlon ⚠️
  gwisWeekLatLonBbox: [[11.4779, 50.12543]],
  gwisWeekLonLatBbox: [[47.27874, 14.42028]],
  effisBaWeekLatLonBbox: [[12.0470653, 49.7092455]],
} as const;

const pointFc = (pts: readonly (readonly number[])[]): GeoJSON.Feature[] =>
  pts.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [...c] } }));

export interface AxisCheck { name: string; ok: boolean; detail?: string }

export function verifyWfsAxis(): { checks: AxisCheck[]; passed: number; total: number } {
  const checks: AxisCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const F = AXIS_FIXTURE;

  add('/gwis heutige BBox (lat,lon) ⇒ Ausgabe [lon,lat] ✅', axisVerdict(pointFc(F.gwisTodayLatLonBbox)) === 'lonlat');
  add('/gwis vertauschte BBox (lon,lat) ⇒ Ausgabe GESPIEGELT [lat,lon]', axisVerdict(pointFc(F.gwisTodayLonLatBbox)) === 'latlon');
  add('/gwis week: gleiches Bild', axisVerdict(pointFc(F.gwisWeekLatLonBbox)) === 'lonlat' && axisVerdict(pointFc(F.gwisWeekLonLatBbox)) === 'latlon');
  add('/effis Brandflächen (lat,lon-BBox) ⇒ [lon,lat]', axisVerdict(pointFc(F.effisBaWeekLatLonBbox)) === 'lonlat');
  add('gespiegelte Antwort wird VERWORFEN (wirft)', (() => {
    try { assertDachAxis(pointFc(F.gwisTodayLonLatBbox), 'test'); return false; } catch { return true; }
  })());
  add('leere Antwort ist gültig (kein Brand ist ein Zustand)', assertDachAxis([], 'test') === 'empty');
  add('RFC-7946-Antwort passiert', assertDachAxis(pointFc(F.gwisTodayLatLonBbox), 'test') === 'lonlat');
  add('Polygon/MultiPolygon: erste Stützstelle wird gefunden',
    firstPosition({ type: 'Polygon', coordinates: [[[12.0, 49.7], [12.1, 49.7], [12.1, 49.8], [12.0, 49.7]]] })?.[0] === 12.0
    && firstPosition({ type: 'MultiPolygon', coordinates: [[[[13.0, 50.0], [13.1, 50.0], [13.1, 50.1], [13.0, 50.0]]]] })?.[1] === 50.0);
  add('URL-Anker: lat,lon-BBox erkannt', bboxIsLatLon('https://x/gwis?bbox=45.5,5.5,55.5,17.5,EPSG:4326'));
  add('URL-Anker: vertauschte BBox macht den Test ROT', !bboxIsLatLon('https://x/gwis?bbox=5.5,45.5,17.5,55.5,EPSG:4326'));
  add('URL-Anker: keine BBox ⇒ rot', !bboxIsLatLon('https://x/gwis?typename=ms:viirs.hs.today'));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
