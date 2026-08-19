/**
 * `fireHotspots` — Satelliten-Thermalanomalien aus dem Copernicus **GWIS**-WFS.
 *
 * ⚠️ **NICHT der EFFIS-Endpunkt.** `plan.md` §WB2 nannte ursprünglich
 * `maps.effis…/effis?…typename=ms:viirs.hs`. In WB0 gemessen liefert der einen
 * bei **Oktober 2021 eingefrorenen Archivstand** — Antworten vom 2019-11-13, und
 * ein OGC-Filter `acq_at > 2021-11-01` gibt null Features zurück. Live sind die
 * Fensterlayer auf dem **GWIS**-Zweig (V-198, `audit/waldbrand-transport.md` §3).
 *
 * ⚠️ **Kein `frp`.** Die attributreiche Fassung (`frp`, `confidence`, `satellite`,
 * `bright_mir`, …) hängt am eingefrorenen EFFIS-Bestand. Live kommen nur
 * `id`, `acq_at` und `CLASS` — gemessen sowohl auf `.today`/`.week` als auch auf
 * `ms:viirs.hs` mit Zeitfilter. Deshalb einheitliche Punktgröße statt eines
 * Radius nach Feuerstrahlungsleistung, und der Steckbrief sagt das (V-199).
 *
 * Gemessene Antwortzeiten: Fensterlayer 0,6–1,9 s · derselbe Layer **ohne**
 * Fenster 14–48 s · `GetCapabilities` 80 s bis Timeout. Nur die Fensterlayer
 * sind produktionstauglich, und Typenamen werden **fest verdrahtet** statt zur
 * Laufzeit entdeckt (V-202).
 */

import { assertDachAxis, bboxIsLatLon } from './wfsAxis';

const GWIS_WFS = 'https://maps.effis.emergency.copernicus.eu/gwis';

/** DACH-Ausschnitt. WFS 1.1.0 mit EPSG:4326 erwartet **lat,lon** — in WB0 an
 *  200 Features belegt, die alle geometrisch in DACH lagen. Nicht „korrigieren". */
const DACH_BBOX_LATLON = '45.5,5.5,55.5,17.5,EPSG:4326';

/**
 * **Kein serverseitiger Deckel mehr** (Jan, GWBA1, 2026-08-15). Gemessen an
 * `ms:viirs.hs.week` auf `/gwis` (audit/waldbrand-behoerden.md §9): mit
 * `maxfeatures=1500` kommen 1 500 Features, **alle in DACH** — aber die
 * **ältesten** (acq bis 14.08. 12:04 statt 15.08. 13:44); mit 200 endet der
 * Bestand am 12.08. Der Deckel wirkt hier also nach dem BBox-Filter, schneidet
 * aber die jüngsten Detektionen ab — still und genau im Fallback-Pfad, der
 * greift, wenn FIRMS ausfällt. Ein „größerer" Deckel (12 000) wäre an das
 * heutige Aufkommen gebunden und in einer schweren Saison wieder falsch.
 *
 * Deshalb: **alles holen** (Wochenlayer ~1,4 MB, 1,2 s) und im Client nach
 * Zeit deckeln — jüngste zuerst. `GWIS_CLIENT_CAP` ist der Hauptthread-Schutz
 * beim Zeichnen; greift er, meldet der Lauf `truncated` und der Steckbrief
 * sagt, dass die ÄLTESTEN fehlen (nicht die jüngsten).
 */
export const GWIS_CLIENT_CAP = 12_000;

export const GWIS_HOTSPOT_ATTRIBUTION =
  '© European Union, Copernicus Emergency Management Service — '
  + '<a href="https://gwis.jrc.ec.europa.eu/" target="_blank" rel="noopener">GWIS</a> (CC BY 4.0)';

/** Die beiden Rückblickfenster, die `fireTime` anbietet (24 h / 7 d). */
export function hotspotTypename(windowH: number): string {
  return windowH >= 168 ? 'ms:viirs.hs.week' : 'ms:viirs.hs.today';
}

export function hotspotUrl(windowH: number): string {
  const q = [
    'service=WFS',
    'request=GetFeature',
    'version=1.1.0',
    `typename=${hotspotTypename(windowH)}`,
    'outputformat=geojson',
    `bbox=${DACH_BBOX_LATLON}`,
  ].join('&');
  return `${GWIS_WFS}?${q}`;
}

export interface HotspotRun {
  /** GeoJSON, direkt an eine `geojson`-Source übergebbar. */
  features: GeoJSON.FeatureCollection;
  count: number;
  /** Jüngste Erfassungszeit (ms) — die **Referenzzeit** des Layers. */
  latestAcqMs: number | null;
  /** Älteste Erfassungszeit im Fenster — für „Fenster reicht von … bis …". */
  oldestAcqMs: number | null;
  windowH: number;
  /** Wurde der Deckel erreicht? Dann ist die Anzeige unvollständig und sagt es. */
  truncated: boolean;
}

/** Kurzer Cache: der Layer wird beim Ein-/Ausschalten und beim Fensterwechsel
 *  neu abgefragt — ohne Cache wäre jedes Umschalten ein 1–2-s-Abruf. */
const _cache = new Map<number, { run: HotspotRun; at: number }>();
const CACHE_TTL = 5 * 60_000;

/**
 * `acq_at` kommt als `"2026-08-13 00:07:00"` — ohne Zeitzone. Der Dienst führt
 * UTC (Satellitenüberflüge werden in UTC gestempelt); ohne das `Z` würde der
 * Browser lokal interpretieren und die Zeit im Sommer um zwei Stunden verschieben.
 */
export function parseAcqAt(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const ms = Date.parse(`${raw.trim().replace(' ', 'T')}Z`);
  return Number.isFinite(ms) ? ms : null;
}

export async function fetchHotspots(windowH: number, signal?: AbortSignal): Promise<HotspotRun> {
  const cached = _cache.get(windowH);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.run;

  const res = await fetch(hotspotUrl(windowH), { signal });
  if (!res.ok) throw new Error(`GWIS Hotspots: HTTP ${res.status}`);
  const fc = (await res.json()) as GeoJSON.FeatureCollection;
  const raw = Array.isArray(fc?.features) ? fc.features : [];
  // A0-1: gespiegelte Achsen ([lat,lon]) sind kein Datenzustand, sondern ein
  // Abruf-Fehler — verwerfen statt vor Somalia zeichnen (wfsAxis.ts).
  assertDachAxis(raw, 'GWIS Hotspots');
  const { features: feats, truncated, latest, oldest } = capNewest(raw, GWIS_CLIENT_CAP);

  const run: HotspotRun = {
    features: { type: 'FeatureCollection', features: feats },
    count: feats.length,
    latestAcqMs: latest,
    oldestAcqMs: oldest,
    windowH,
    truncated,
  };
  _cache.set(windowH, { run, at: Date.now() });
  return run;
}

/** Für Tests und den Sitzungswechsel. */
export function resetHotspotCache(): void { _cache.clear(); }

/**
 * Client-Deckel NACH dem (serverseitigen) BBox-Filter: bei Überschreitung
 * bleiben die **jüngsten** `cap` Detektionen — die ältesten fallen weg, nicht
 * umgekehrt wie beim serverseitigen `maxfeatures`. Zeitlose Features (ohne
 * lesbares `acq_at`) werden zuerst geopfert.
 */
export function capNewest(features: readonly GeoJSON.Feature[], cap: number): {
  features: GeoJSON.Feature[]; truncated: boolean; latest: number | null; oldest: number | null;
} {
  const stamped = features.map((f) => ({ f, ms: parseAcqAt((f.properties as Record<string, unknown> | null)?.acq_at) }));
  let kept = stamped;
  const truncated = stamped.length > cap;
  if (truncated) {
    kept = [...stamped].sort((a, b) => (b.ms ?? -Infinity) - (a.ms ?? -Infinity)).slice(0, cap);
  }
  let latest: number | null = null, oldest: number | null = null;
  for (const { ms } of kept) {
    if (ms == null) continue;
    if (latest == null || ms > latest) latest = ms;
    if (oldest == null || ms < oldest) oldest = ms;
  }
  return { features: kept.map((k) => k.f), truncated, latest, oldest };
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface HotspotCheck { name: string; ok: boolean; detail?: string }

export function verifyHotspots(): { checks: HotspotCheck[]; passed: number; total: number } {
  const checks: HotspotCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const u24 = hotspotUrl(24);
  const u7d = hotspotUrl(168);

  // DER Regressionsanker dieser Quelle: nie wieder der EFFIS-Endpunkt.
  add('nutzt den GWIS-Dienst, NICHT den eingefrorenen EFFIS-Bestand (V-198)',
    u24.includes('/gwis?') && !u24.includes('/effis?'));
  add('24 h ⇒ ms:viirs.hs.today', u24.includes('typename=ms:viirs.hs.today'));
  add('7 d ⇒ ms:viirs.hs.week', u7d.includes('typename=ms:viirs.hs.week'));
  add('nie der ungefensterte Layer (gemessen 14–48 s)',
    !/typename=ms:viirs\.hs(&|$)/.test(u24) && !/typename=ms:viirs\.hs(&|$)/.test(u7d));
  add('GeoJSON angefordert', u24.includes('outputformat=geojson'));
  add('WFS 1.1.0 mit lat,lon-BBOX (in WB0 belegt)',
    u24.includes('version=1.1.0') && u24.includes('bbox=45.5,5.5,55.5,17.5,EPSG:4326'));
  add('KEIN serverseitiger Deckel: die URL trägt kein maxfeatures (Jan, GWBA1 — der Server schnitt die jüngsten ab)',
    !/maxfeatures/i.test(u24) && !/maxfeatures/i.test(u7d));
  // Client-Deckel: jüngste bleiben, älteste fallen.
  const mk = (i: number, acq: string): GeoJSON.Feature =>
    ({ type: 'Feature', properties: { id: i, acq_at: acq }, geometry: { type: 'Point', coordinates: [10, 50] } });
  const capped = capNewest([mk(1, '2026-08-08 00:00:00'), mk(2, '2026-08-15 12:00:00'), mk(3, '2026-08-12 06:00:00')], 2);
  add('Client-Deckel behält die JÜNGSTEN (älteste fällt)',
    capped.truncated && capped.features.length === 2 && capped.features.every((f) => (f.properties as { id: number }).id !== 1));
  add('unter dem Deckel bleibt alles in Originalreihenfolge',
    !capNewest([mk(1, '2026-08-08 00:00:00'), mk(2, '2026-08-15 12:00:00')], 12_000).truncated);
  add('BBox-Anker: erster Wert im Breitengradband (eine vertauschte BBox macht dies rot)',
    bboxIsLatLon(u24) && bboxIsLatLon(u7d));
  add('Fensterwahl unterscheidet die URLs', u24 !== u7d);
  add('Zwischenwerte fallen auf 24 h zurück, nicht ins Leere',
    hotspotTypename(48) === 'ms:viirs.hs.today' && hotspotTypename(999) === 'ms:viirs.hs.week');

  // Zeitstempel: ohne UTC-Annahme läge der Punkt im Sommer zwei Stunden falsch.
  const ms = parseAcqAt('2026-08-13 00:07:00');
  add('acq_at wird als UTC gelesen',
    ms === Date.UTC(2026, 7, 13, 0, 7, 0), new Date(ms ?? 0).toISOString());
  add('kaputter acq_at ⇒ null statt NaN',
    parseAcqAt('unsinn') === null && parseAcqAt(undefined) === null && parseAcqAt(42) === null);

  add('Attribution nennt Copernicus EMS und CC BY 4.0',
    /Copernicus/.test(GWIS_HOTSPOT_ATTRIBUTION) && /CC BY 4\.0/.test(GWIS_HOTSPOT_ATTRIBUTION));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
