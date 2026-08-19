/**
 * `fireDanger` — EU-Gefahrenindex aus dem Copernicus **GWIS**-WMS.
 *
 * ── Warum hier kein `fetch` steht ────────────────────────────────────────────
 * Eine MapLibre-`raster`-Source setzt ihre Kachel-Anfragen selbst ab. Dieses
 * Modul baut deshalb nur das URL-Template mit dem Platzhalter
 * `{bbox-epsg-3857}` — genau der Aufruf, der in WB0 gemessen wurde: HTTP 200,
 * PNG 512×512, 36–364 ms, `Access-Control-Allow-Origin: *`, Preflight 200
 * (`audit/waldbrand-transport.md` §2). Damit ist das Modul **pur** und ohne
 * Netz verifizierbar.
 *
 * ── Die Zeitachse ────────────────────────────────────────────────────────────
 * Der Dienst führt eine `TIME`-Dimension `2018-01-01/2099-12-31`; der Tagesschritt
 * kommt aus `fireTime.dayToIsoDate()` und ist dort gegen UTC-Tageswechsel und
 * Monats-/Jahresgrenzen verifiziert. **Keine zweite Datumsrechnung hier** — das
 * war Fallstrick L6 der Diagnose.
 *
 * ── Ehrlichkeit ──────────────────────────────────────────────────────────────
 * Der Layer liefert ein **Bild**, keine Werte: Wir bekommen die Klassengrenzen
 * nicht als Datum zurück, sondern nur eingefärbte Pixel. Deshalb gibt es hier
 * keine Punktabfrage und keinen abgeleiteten Zahlenwert — die Legende zeigt die
 * sechs Klassen aus `FIRE_SOURCE_EU`, mehr wird nicht behauptet.
 *
 * Die Referenzzeit ist der angeforderte Tag selbst, nicht der Abrufzeitpunkt.
 */

const GWIS_WMS = 'https://maps.effis.emergency.copernicus.eu/gwis';

/**
 * Attribution nach `docs/DATA_SOURCES.md` §W.7. Änderungen sind kenntlich zu
 * machen — hier ändern wir nichts am Bild, wir zeigen es unverändert.
 */
export const GWIS_FWI_ATTRIBUTION =
  '© European Union, Copernicus Emergency Management Service — '
  + '<a href="https://gwis.jrc.ec.europa.eu/" target="_blank" rel="noopener">GWIS</a> (CC BY 4.0)';

/** Die in WB0 (und E0, `audit/waldbrand-effis.md` §4) in den Capabilities
 *  bestätigten `ecmwf.*`-Layer. Alle teilen TIME 2018-01-01/2099-12-31 und
 *  den Horizont des Basislayers (E0: heute + 8 gemessen, Doku „1 to 9 days"). */
export type GwisFwiLayer =
  | 'ecmwf.fwi'      // Fire Weather Index — der Gesamtindex, 6 Klassen
  | 'ecmwf.ranking'  // Perzentil des FWI gegen ~40 Jahre Historie (E3 „Einordnung")
  | 'ecmwf.ffmc'     // Fine Fuel Moisture Code
  | 'ecmwf.dmc'      // Duff Moisture Code
  | 'ecmwf.dc'       // Drought Code
  | 'ecmwf.isi'      // Initial Spread Index
  | 'ecmwf.bui';     // Build-Up Index

export interface GwisTileOptions {
  layer?: GwisFwiLayer;
  /** Tag als `YYYY-MM-DD` in UTC — aus `fireTime.dayToIsoDate()`. */
  isoDate: string;
  /** Kachelgröße in Pixeln; MapLibre fragt 256er-Kacheln an. */
  tileSize?: number;
}

/**
 * Baut das Kachel-Template für eine MapLibre-`raster`-Source.
 *
 * `{bbox-epsg-3857}` ersetzt MapLibre je Kachel — deshalb steht der Platzhalter
 * wörtlich in der URL und darf **nicht** URL-kodiert werden. Genau daran
 * scheitert der Aufruf sonst stumm mit einer leeren Kachel.
 */
export function gwisTileUrl(opts: GwisTileOptions): string {
  const layer = opts.layer ?? 'ecmwf.fwi';
  const size = opts.tileSize ?? 256;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.isoDate)) {
    throw new Error(`gwisTileUrl: isoDate muss YYYY-MM-DD sein, war "${opts.isoDate}"`);
  }
  const q = [
    'SERVICE=WMS',
    'VERSION=1.3.0',
    'REQUEST=GetMap',
    `LAYERS=${layer}`,
    'STYLES=',
    'CRS=EPSG:3857',
    'BBOX={bbox-epsg-3857}',
    `WIDTH=${size}`,
    `HEIGHT=${size}`,
    'FORMAT=image/png',
    'TRANSPARENT=TRUE',
    `TIME=${opts.isoDate}`,
  ].join('&');
  return `${GWIS_WMS}?${q}`;
}

/** Fertige MapLibre-Source-Spezifikation (als reines Objekt, DOM-frei). */
export function gwisRasterSource(opts: GwisTileOptions) {
  return {
    type: 'raster' as const,
    tiles: [gwisTileUrl(opts)],
    tileSize: opts.tileSize ?? 256,
    attribution: GWIS_FWI_ATTRIBUTION,
    // Der Dienst deckt Europa/MENA ab; außerhalb würden nur leere Kacheln
    // angefragt. Grob auf den europäischen Ausschnitt begrenzt.
    bounds: [-26, 27, 46, 72] as [number, number, number, number],
    maxzoom: 10,
  };
}

// ---------------------------------------------------------------------------
// Prefetch (Phase WB3)
// ---------------------------------------------------------------------------

/** Halbe Erdumfangsbreite in Web-Mercator-Metern. */
const MERC_HALF = 20_037_508.342_789_244;

/**
 * Zerlegt einen Ausschnitt in die Kachel-BBoxes, die MapLibre bei diesem Zoom
 * anfragen würde.
 *
 * ── Warum das hier selbst gerechnet wird ─────────────────────────────────────
 * Prefetch über einen zweiten, unsichtbaren Layer funktioniert **nicht**: In WB2
 * gemessen fragt MapLibre für einen Layer mit `visibility: none` **null**
 * Kacheln an. Vorladen muss deshalb außerhalb der Karte passieren — über
 * `new Image()` auf die echten Kachel-URLs. Dafür braucht es die Zerlegung, und
 * die gibt MapLibre nicht heraus (`audit/waldbrand-zeit.md` §2).
 *
 * Die Rechnung ist das Standard-Schema Z/X/Y: `2^z` Kacheln je Achse über die
 * volle Mercator-Ausdehnung, Y von Norden nach Süden.
 */
export function tileBboxes(
  lonLatBounds: { west: number; south: number; east: number; north: number },
  zoom: number,
  maxTiles = 40,
): string[] {
  const z = Math.max(0, Math.min(12, Math.round(zoom)));
  const n = 2 ** z;
  const size = (2 * MERC_HALF) / n;

  const toMercX = (lon: number) => (lon * MERC_HALF) / 180;
  const toMercY = (lat: number) => {
    const clamped = Math.max(-85.05, Math.min(85.05, lat));
    return (Math.log(Math.tan(Math.PI / 4 + (clamped * Math.PI) / 360)) * MERC_HALF) / Math.PI;
  };

  const x0 = Math.floor((toMercX(lonLatBounds.west) + MERC_HALF) / size);
  const x1 = Math.floor((toMercX(lonLatBounds.east) + MERC_HALF) / size);
  const y0 = Math.floor((MERC_HALF - toMercY(lonLatBounds.north)) / size);
  const y1 = Math.floor((MERC_HALF - toMercY(lonLatBounds.south)) / size);

  const out: string[] = [];
  for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) {
      if (out.length >= maxTiles) return out;
      const minX = -MERC_HALF + x * size;
      const maxY = MERC_HALF - y * size;
      out.push([minX, maxY - size, minX + size, maxY].map((v) => v.toFixed(3)).join(','));
    }
  }
  return out;
}

/** Kachel-URLs eines Tages für einen Ausschnitt — fertig zum Vorladen. */
export function gwisPrefetchUrls(
  isoDate: string,
  lonLatBounds: { west: number; south: number; east: number; north: number },
  zoom: number,
  maxTiles = 40,
  layer: GwisFwiLayer = 'ecmwf.fwi',
): string[] {
  // E3: der Folgetag wird für die AKTIVE Sub-Ansicht vorgeladen — Kacheln des
  // Index nützen nichts, wenn gerade die Einordnung gezeigt wird.
  const template = gwisTileUrl({ isoDate, layer });
  return tileBboxes(lonLatBounds, zoom, maxTiles)
    .map((bbox) => template.replace('{bbox-epsg-3857}', bbox));
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; läuft in verify:fire-sources mit)
// ---------------------------------------------------------------------------

export interface GwisCheck { name: string; ok: boolean; detail?: string }

export function verifyGwisFwi(): { checks: GwisCheck[]; passed: number; total: number } {
  const checks: GwisCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const url = gwisTileUrl({ isoDate: '2026-08-14' });

  add('zeigt auf den GWIS-Dienst, nicht auf EFFIS',
    url.startsWith(GWIS_WMS + '?') && !url.includes('/effis?'), url.slice(0, 52));
  add('Layer ist ecmwf.fwi', url.includes('LAYERS=ecmwf.fwi'));
  add('CRS ist EPSG:3857 — der Weg, den MapLibre selbst geht',
    url.includes('CRS=EPSG:3857'));
  // Der Platzhalter MUSS unkodiert bleiben, sonst liefert der Dienst leere Kacheln.
  add('BBOX-Platzhalter steht wörtlich in der URL',
    url.includes('BBOX={bbox-epsg-3857}') && !url.includes('%7Bbbox'));
  add('TIME trägt den angefragten Tag', url.includes('TIME=2026-08-14'));
  add('PNG mit Transparenz', url.includes('FORMAT=image/png') && url.includes('TRANSPARENT=TRUE'));
  add('WMS 1.3.0 (die in WB0 gemessene Fassung)', url.includes('VERSION=1.3.0'));

  // Datumsformat wird erzwungen — ein „14.08.2026" würde sonst still eine leere
  // Kachel liefern, und niemand sähe den Fehler.
  let threw = false;
  try { gwisTileUrl({ isoDate: '14.08.2026' }); } catch { threw = true; }
  add('falsches Datumsformat wirft, statt still leere Kacheln zu liefern', threw);

  const other = gwisTileUrl({ isoDate: '2026-12-31', layer: 'ecmwf.dc' });
  add('Komponenten-Layer wählbar (ecmwf.dc)', other.includes('LAYERS=ecmwf.dc'));
  add('Tag wirkt sich aus', other.includes('TIME=2026-12-31'));

  const src = gwisRasterSource({ isoDate: '2026-08-14' });
  add('Source-Spec ist raster mit genau einer Kachel-URL',
    src.type === 'raster' && src.tiles.length === 1);
  add('Attribution nennt Copernicus EMS und CC BY 4.0',
    /Copernicus/.test(src.attribution) && /CC BY 4\.0/.test(src.attribution));
  add('Abdeckung ist auf Europa begrenzt (keine leeren Weltkacheln)',
    src.bounds[0] < 0 && src.bounds[2] > 40);

  // --- Prefetch-Zerlegung (WB3) --------------------------------------------
  const dach = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
  const t6 = tileBboxes(dach, 6);
  add('DACH bei Zoom 6 zerfällt in eine plausible Kachelzahl',
    t6.length >= 4 && t6.length <= 20, `${t6.length} Kacheln`);
  add('jede Kachel ist ein 4-Werte-BBox in Metern',
    t6.every((b) => b.split(',').length === 4 && Math.abs(Number(b.split(',')[0])) < 2.1e7));
  // Ein höherer Zoom MUSS mehr Kacheln ergeben — sonst rechnet die Zerlegung falsch.
  add('höherer Zoom ⇒ mehr Kacheln', tileBboxes(dach, 7).length > t6.length,
    `z6=${t6.length}, z7=${tileBboxes(dach, 7).length}`);
  add('der Deckel greift', tileBboxes(dach, 10, 12).length === 12);

  // Die Kachel muss den angefragten Ausschnitt tatsächlich enthalten.
  const first = t6[0].split(',').map(Number);
  add('BBox ist wohlgeformt (min < max in beiden Achsen)',
    first[0] < first[2] && first[1] < first[3]);

  const urls = gwisPrefetchUrls('2026-08-16', dach, 6);
  add('Prefetch-URLs tragen den Zieltag und KEINEN Platzhalter mehr',
    urls.length === t6.length && urls.every((u) => u.includes('TIME=2026-08-16'))
      && urls.every((u) => !u.includes('{bbox')));
  add('Prefetch-URLs zeigen auf denselben Dienst wie die Kacheln',
    urls.every((u) => u.startsWith(GWIS_WMS)));
  // E3: Prefetch folgt der Sub-Ansicht — sonst wärmt er die falschen Kacheln.
  const urlsRk = gwisPrefetchUrls('2026-08-16', dach, 6, 40, 'ecmwf.ranking');
  add('Prefetch-URLs tragen den Layer der aktiven Sub-Ansicht',
    urlsRk.every((u) => u.includes('LAYERS=ecmwf.ranking')) && urls.every((u) => u.includes('LAYERS=ecmwf.fwi')));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
