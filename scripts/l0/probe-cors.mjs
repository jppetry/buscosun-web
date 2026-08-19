/**
 * L0-A — CORS- und Erreichbarkeits-Bestandsaufnahme aller Zielendpunkte der
 * 2D-Layer-Erweiterung **und** der Waldbrand-Ansicht (Phase WB, Gate GWB0).
 *
 *   node scripts/l0/probe-cors.mjs
 *   node scripts/l0/probe-cors.mjs --json audit/l0/cors.json
 *   node scripts/l0/probe-cors.mjs --group fire --json audit/l0/cors-waldbrand.json
 *
 * GRUPPEN: jeder Endpunkt trägt ein `group`-Feld (Vorgabe `'l0'`). `--group <name>`
 * läuft nur diese Gruppe — damit bleibt der ursprüngliche L0-Lauf unverändert
 * abrufbar, während Gate GWB0 seine eigene, getrennt belegbare Messung bekommt
 * (`plan.md` §WB0 Schritt 1, `tests.md` §WB-T0-1).
 *
 * WARUM DAS DER ERSTE SCHRITT IST: Ob eine Quelle `Access-Control-Allow-Origin`
 * sendet, entscheidet über den halben Umsetzungsaufwand jedes Layers — direkt
 * abrufbar (Aufwand S) oder Edge-Proxy nötig (Aufwand M **und** STOPP-&-FRAGEN,
 * weil `netlify.toml`/Edge-Functions Sperrzone sind, s. CLAUDE.md). Alle
 * CORS-Angaben in `docs/DATA_SOURCES.md` sind mit ⚠️ markiert, weil sie aus
 * einem Fremd-Prüfdienst bzw. aus dem Verhalten produktiver Clients stammen —
 * dieses Skript ersetzt sie durch eigene Messungen.
 *
 * WICHTIG — was dieses Skript NICHT beweist: Node erzwingt kein CORS. Es liest
 * die Header, die der Server schickt; ob der Browser die Antwort am Ende
 * durchlässt, hängt zusätzlich am Preflight (bei Nicht-Simple-Requests) und an
 * `Vary: Origin`-Caching. Deshalb wird zu jedem Endpunkt zusätzlich ein
 * OPTIONS-Preflight geschickt und beides ausgegeben. Ein grünes Ergebnis hier
 * ist ein **starker** Hinweis, kein Beweis — der Beweis ist ein `fetch()` von
 * der echten Seite (s. scripts/l0/README.md §3).
 *
 * Netzabhängig ⇒ KEIN Gate-Verifier. Exit-Code ist immer 0, außer bei
 * `--strict` (dann Exit 1, sobald ein als kritisch markierter Endpunkt nicht
 * erreichbar ist). Das folgt der Harness-Regel: netzabhängige Skripte dürfen
 * kein Gate blockieren.
 */

const ORIGIN = process.env.BUSCOSUN_ORIGIN ?? 'https://buscosun.com';
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 20_000);
const STRICT = process.argv.includes('--strict');
const jsonIdx = process.argv.indexOf('--json');
const JSON_OUT = jsonIdx >= 0 ? process.argv[jsonIdx + 1] : null;
const groupIdx = process.argv.indexOf('--group');
const GROUP = groupIdx >= 0 ? process.argv[groupIdx + 1] : null;

// --- Testgeometrie für die Waldbrand-Gruppe ---------------------------------
// DACH-Ausschnitt, einmal definiert und in beiden WMS-Achsenreihenfolgen
// ausgegeben. Der Unterschied ist kein Detail: WMS 1.3.0 dreht bei EPSG:4326 die
// Achsen auf lat,lon — wer das in WB2 verwechselt, bekommt eine leere Kachel
// statt eines Fehlers. Deshalb wird beides gemessen, nicht angenommen.
const DACH = { minLon: 5.5, minLat: 45.5, maxLon: 17.5, maxLat: 55.5 };
const BBOX_LONLAT = `${DACH.minLon},${DACH.minLat},${DACH.maxLon},${DACH.maxLat}`;   // WMS 1.1.1
const BBOX_LATLON = `${DACH.minLat},${DACH.minLon},${DACH.maxLat},${DACH.maxLon}`;   // WMS 1.3.0 + EPSG:4326
const merc = (lon, lat) => {
  const R = 6378137;
  const x = (R * lon * Math.PI) / 180;
  const y = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [Math.round(x), Math.round(y)];
};
// Das ist die Reihenfolge, die MapLibre selbst einsetzt (`{bbox-epsg-3857}`) —
// also der Aufruf, der in WB2 tatsächlich fliegt.
const BBOX_3857 = [...merc(DACH.minLon, DACH.minLat), ...merc(DACH.maxLon, DACH.maxLat)].join(',');
// Tagesschritt für die WMS-`TIME`-Dimension. Bewusst „heute" in UTC, damit der
// Lauf zeigt, ob der aktuelle Tag schon publiziert ist.
const TODAY = new Date().toISOString().slice(0, 10);

/**
 * `expect`: was `docs/DATA_SOURCES.md` behauptet — damit der Lauf die Doku
 * bestätigt oder widerlegt, statt nur Zahlen auszugeben.
 *   'cors'     → sollte ACAO senden (direkt nutzbar)
 *   'no-cors'  → sollte KEIN ACAO senden (Proxy nötig; opendata.dwd.de ist die
 *                Kontrolle, an der man erkennt, dass die Messung überhaupt
 *                unterscheidet)
 *   'unknown'  → in der Recherche nicht ermittelt
 *
 * `group`: 'l0' (Vorgabe, 2D-Layer-Erweiterung) oder 'fire' (Waldbrand, Gate GWB0).
 * `control: true`: MUSS ohne ACAO antworten — die Trennschärfe-Kontrolle der Gruppe.
 */
const ALL_ENDPOINTS = [
  {
    id: 'dwd-wfs-caps', layer: 'Warnungen DE', critical: true, expect: 'cors',
    url: 'https://maps.dwd.de/geoserver/dwd/wfs?service=WFS&version=2.0.0&request=GetCapabilities',
  },
  {
    id: 'dwd-wfs-warnungen', layer: 'Warnungen DE (L3)', critical: true, expect: 'cors',
    url: 'https://maps.dwd.de/geoserver/dwd/ows?version=2.0.0&SERVICE=WFS&outputFormat=application/json'
       + '&REQUEST=GetFeature&typeName=dwd:Warnungen_Gemeinden&CRS=CRS:84&count=1',
    note: 'liefert nebenbei die echte Property-Liste → F-4',
  },
  {
    id: 'dwd-wms-blitzdichte', layer: 'Blitz DE (L7)', critical: true, expect: 'cors',
    url: 'https://maps.dwd.de/geoserver/dwd/Blitzdichte/wms?service=WMS&version=1.3.0&request=GetCapabilities',
  },
  {
    id: 'dwd-wms-flasharea', layer: 'Blitz DE (Bestand)', critical: false, expect: 'cors',
    url: 'https://maps.dwd.de/geoserver/dwd/Accumulated_Flash_Area/wms?service=WMS&version=1.3.0&request=GetCapabilities',
    note: 'klärt F-5: hat der heute genutzte Layer eine TIME-Dimension?',
  },
  {
    id: 'dwd-wms-ncew', layer: 'Gewitterzellen (L10)', critical: false, expect: 'cors',
    url: 'https://maps.dwd.de/geoserver/dwd/NCEW_EU/wms?service=WMS&version=1.3.0&request=GetCapabilities',
  },
  {
    id: 'zamg-warnstatus', layer: 'Warnungen AT (L4)', critical: true, expect: 'cors',
    url: 'https://warnungen.zamg.at/wsapp/api/getWarnstatus',
  },
  {
    id: 'zamg-coords', layer: 'Warnungen AT Detail (L4)', critical: true, expect: 'cors',
    url: 'https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon=16.37&lat=48.21&lang=de',
  },
  {
    id: 'geosphere-datasets', layer: 'GeoSphere (Registry)', critical: false, expect: 'no-cors',
    url: 'https://dataset.api.hub.geosphere.at/v1/datasets',
    note: 'Recherche fand hier KEIN ACAO — Gegenprobe zu /metadata',
  },
  {
    id: 'geosphere-metadata', layer: 'GeoSphere (Metadaten)', critical: false, expect: 'cors',
    url: 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km/metadata',
  },
  {
    id: 'geosphere-grid', layer: 'INCA / SNOWGRID (Datenroute)', critical: true, expect: 'unknown',
    url: 'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km'
       + '?parameters=rr&output_format=geojson&bbox=47.0,11.0,47.2,11.2',
    note: 'die eigentlich offene Frage F-12. ACHTUNG Rate-Limit 240/h — sparsam laufen lassen',
  },
  {
    id: 'meteoswiss-stac-hail', layer: 'Hagel CH (L8)', critical: true, expect: 'cors',
    url: 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-hail',
  },
  {
    id: 'meteoswiss-stac-precip', layer: 'Radar CH (Bestand)', critical: false, expect: 'cors',
    url: 'https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip',
  },
  {
    id: 'geoadmin-wmts', layer: 'Hagelklimatologie CH', critical: false, expect: 'unknown',
    url: 'https://wmts.geo.admin.ch/EPSG/3857/1.0.0/WMTSCapabilities.xml?lang=de',
  },
  {
    id: 'eumetsat-view', layer: 'Blitz DACH (L7) / Satellit', critical: true, expect: 'unknown',
    url: 'https://view.eumetsat.int/geoserver/wms?service=WMS&version=1.3.0&request=GetCapabilities&namespace=mtg_fd',
  },
  {
    id: 'cams-eccharts', layer: 'Pollen/UV/Luft (L15)', critical: false, expect: 'unknown',
    url: 'https://eccharts.ecmwf.int/wms/?token=public&service=WMS&version=1.3.0&request=GetCapabilities',
    note: 'in der Recherche NICHT live geprüft (robots) — hier zum ersten Mal gemessen',
  },
  {
    id: 'effis-gwis', layer: 'Waldbrand (L15)', critical: false, expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetCapabilities&version=1.3.0',
  },
  {
    id: 'slf-caaml', layer: 'Lawinen CH (L12)', critical: false, expect: 'unknown',
    url: 'https://aws.slf.ch/api/bulletin/caaml',
  },
  {
    id: 'eaws-regions', layer: 'Lawinen-Regionen (L12)', critical: false, expect: 'unknown',
    url: 'https://eaws.gitlab.io/eaws-regions/micro-regions/AT-07_micro-regions.geojson.json',
  },
  {
    id: 'opera-s3', layer: 'Europa-Radar (L14)', critical: false, expect: 'unknown',
    url: 'https://s3.waw3-1.cloudferro.com/openradar-24h/?list-type=2&max-keys=1',
  },
  // --- Kontrolle: MUSS ohne ACAO antworten. Zeigt an, dass die Messung trennt. ---
  {
    id: 'opendata-dwd-control', layer: 'KONTROLLE (Proxy-Pflicht)', critical: false, expect: 'no-cors',
    control: true,
    url: 'https://opendata.dwd.de/weather/radar/composite/rv/',
    note: 'Wenn hier ACAO auftaucht, ist die Messung kaputt ODER der DWD hat CORS aktiviert '
        + '(dann könnte /_dwd_opendata perspektivisch entfallen — wäre ein eigener Befund)',
  },

  // =========================================================================
  // Gruppe `fire` — Waldbrand DACH, Gate GWB0 (plan.md §WB0, tests.md §WB-T0)
  // =========================================================================
  // Die eine Frage, an der das ganze Konzept hängt: schickt
  // maps.effis.emergency.copernicus.eu `Access-Control-Allow-Origin`? MapLibre
  // lädt Raster-Kacheln als WebGL-Textur — ohne ACAO gibt es kein Bild, sondern
  // einen Security-Error. Fällt das negativ aus, braucht der EU-Index einen
  // neuen Rewrite in netlify.toml ⇒ STOPP & FRAGEN (CLAUDE.md, Transportzone).
  {
    id: 'gwis-wms-caps', group: 'fire', layer: 'GWIS FWI (fireDanger)', critical: true, expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/gwis?service=WMS&request=GetCapabilities&version=1.3.0',
    note: 'Rückgrat des Layers fireDanger — ECMWF-FWI bis +9 Tage',
  },
  {
    id: 'gwis-getmap-3857', group: 'fire', layer: 'GWIS GetMap (MapLibre-Weg)', critical: true, expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/gwis?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
       + '&LAYERS=ecmwf.fwi&STYLES=&CRS=EPSG:3857&BBOX=' + BBOX_3857
       + `&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${TODAY}`,
    note: 'genau der Aufruf, den eine MapLibre raster-Source über {bbox-epsg-3857} absetzt — der entscheidende Test',
  },
  {
    id: 'gwis-getmap-4326-130', group: 'fire', layer: 'GWIS GetMap 1.3.0 (lat,lon)', critical: false, expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/gwis?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap'
       + '&LAYERS=ecmwf.fwi&STYLES=&CRS=EPSG:4326&BBOX=' + BBOX_LATLON
       + `&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${TODAY}`,
    note: 'Achsenreihenfolge-Gegenprobe: 1.3.0 + EPSG:4326 = lat,lon',
  },
  {
    id: 'gwis-getmap-4326-111', group: 'fire', layer: 'GWIS GetMap 1.1.1 (lon,lat)', critical: false, expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/gwis?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
       + '&LAYERS=ecmwf.fwi&STYLES=&SRS=EPSG:4326&BBOX=' + BBOX_LONLAT
       + `&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${TODAY}`,
    note: 'Achsenreihenfolge-Gegenprobe: 1.1.1 + EPSG:4326 = lon,lat',
  },
  {
    id: 'effis-wms-caps', group: 'fire', layer: 'EFFIS WMS (Météo-France FWI)', critical: false, expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/effis?service=WMS&request=GetCapabilities&version=1.3.0',
  },
  {
    id: 'effis-wfs-caps', group: 'fire', layer: 'EFFIS WFS Capabilities', critical: false, expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetCapabilities&version=1.1.0',
    note: 'GEMESSEN 80 s bzw. Abbruch nach 150 s — im Produktivpfad NIE aufrufen (WB0-Befund)',
  },
  {
    id: 'gwis-wfs-viirs-today', group: 'fire', layer: 'GWIS Hotspots 24 h (fireHotspots)', critical: true,
    expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/gwis?service=WFS&request=GetFeature'
       + '&typename=ms:viirs.hs.today&version=1.1.0&outputformat=geojson&maxfeatures=5',
    note: 'KORREKTUR aus WB0: der in plan.md/§W.2 genannte EFFIS-Endpunkt mit blankem `ms:viirs.hs` liefert '
        + 'einen bei Okt 2021 eingefrorenen Archivstand. Live ist der GWIS-Dienst mit .today/.week',
  },
  {
    id: 'gwis-wfs-viirs-week', group: 'fire', layer: 'GWIS Hotspots 7 d (fireHotspots)', critical: true,
    expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/gwis?service=WFS&request=GetFeature'
       + '&typename=ms:viirs.hs.week&version=1.1.0&outputformat=geojson&maxfeatures=5',
  },
  {
    id: 'effis-wfs-viirs-stale', group: 'fire', layer: 'EFFIS Hotspots (VERALTET)', critical: false,
    expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetFeature'
       + '&typename=ms:viirs.hs&version=1.1.0&outputformat=geojson&maxfeatures=5',
    note: 'nur noch als Beleg des Befunds mitgeführt — NICHT als Quelle verwenden',
  },
  {
    id: 'effis-wfs-ba', group: 'fire', layer: 'EFFIS Burnt Areas (WB4)', critical: false, expect: 'unknown',
    url: 'https://maps.effis.emergency.copernicus.eu/effis?service=WFS&request=GetFeature'
       + '&typename=ms:modis.ba.poly&version=1.1.0&outputformat=geojson&maxfeatures=2',
  },
  {
    id: 'edo-wms-caps', group: 'fire', layer: 'EDO Dürre (WB4)', critical: false, expect: 'unknown',
    url: 'https://drought.emergency.copernicus.eu/api/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities',
  },
  {
    id: 'edo-getmap-smian', group: 'fire', layer: 'EDO smian GetMap (WB4)', critical: false, expect: 'unknown',
    url: 'https://drought.emergency.copernicus.eu/api/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap'
       + '&LAYERS=smian&STYLES=&SRS=EPSG:4326&BBOX=' + BBOX_LONLAT
       + '&WIDTH=512&HEIGHT=512&FORMAT=image/png&TRANSPARENT=TRUE',
  },
  {
    id: 'eea-clc2018-caps', group: 'fire', layer: 'EEA CLC2018 (WB4)', critical: false, expect: 'unknown',
    url: 'https://image.discomap.eea.europa.eu/arcgis/services/Corine/CLC2018_WM/MapServer/WMSServer'
       + '?service=WMS&request=GetCapabilities&version=1.3.0',
  },
  {
    id: 'eea-natura2000-caps', group: 'fire', layer: 'EEA Natura 2000 (WB4)', critical: false, expect: 'unknown',
    url: 'https://bio.discomap.eea.europa.eu/arcgis/services/ProtectedSites/Natura2000Sites/MapServer/WMSServer'
       + '?service=WMS&request=GetCapabilities&version=1.3.0',
  },
  {
    id: 'dlr-eoc-land-wms', group: 'fire', layer: 'DLR Tree Species DE (WB4)', critical: false, expect: 'unknown',
    url: 'https://geoservice.dlr.de/eoc/land/wms?service=WMS&request=GetCapabilities&version=1.3.0',
  },
  {
    id: 'geoadmin-stac-fire', group: 'fire', layer: 'BAFU Gefahrenstufe CH (STAC)', critical: true, expect: 'cors',
    url: 'https://data.geo.admin.ch/api/stac/v1/collections/ch.bafu.gefahren-waldbrand_warnung',
    note: 'geo.admin.ch ist im Repo bereits produktiv (meteoSwissHail.ts) — Gegenprobe, kein neuer Befund erwartet',
  },
  {
    id: 'geoadmin-bafu-geojson', group: 'fire', layer: 'BAFU Gefahrenstufe CH (Asset)', critical: true, expect: 'cors',
    url: 'https://data.geo.admin.ch/ch.bafu.gefahren-waldbrand_warnung/gefahren-waldbrand_warnung/'
       + 'gefahren-waldbrand_warnung_2056.geojson',
  },
  {
    id: 'geoadmin-stac-bans', group: 'fire', layer: 'BAFU Feuerverbote CH (STAC)', critical: false, expect: 'cors',
    url: 'https://data.geo.admin.ch/api/stac/v1/collections/'
       + 'ch.bafu.gefahren-waldbrand_praeventionsmassnahmen_kantone',
    note: 'Collection-Id aus docs/DATA_SOURCES.md §W abgeleitet — hier zum ersten Mal geprüft',
  },
  {
    id: 'dwd-wbi-proxy', group: 'fire', layer: 'DWD WBI über /_dwd_opendata', critical: true, expect: 'unknown',
    url: 'https://buscosun.com/_dwd_opendata/climate_environment/CDC/derived_germany/'
       + 'fire_danger_index/woodland/forecast/recent/',
    note: 'same-origin-Rewrite: ACAO ist hier NICHT erforderlich, Status 200 ist der Beleg (netlify.toml:27-31)',
  },
  {
    id: 'dwd-icon-relhum', group: 'fire', layer: 'ICON-D2 relhum_2m (fireWeather)', critical: false, expect: 'no-cors',
    url: 'https://opendata.dwd.de/weather/nwp/icon-d2/grib/00/relhum_2m/',
    note: 'läuft in WB2 über die BESTEHENDE Edge Function /_dwd_grib — Warm-Cron wäre STOPP & FRAGEN',
  },
  {
    id: 'dwd-fire-grid-404', group: 'fire', layer: 'DWD WBI 1-km-Raster', critical: false, expect: 'no-cors',
    url: 'https://opendata.dwd.de/climate_environment/CDC/grids_germany/daily/fire_danger_index/',
    note: 'ERWARTUNG 404 (tests.md WB-T0-6). Liefert der DWD das Raster inzwischen aus, ändert sich der Plan '
        + 'materiell zum Besseren — dann STOPP und Jan informieren',
  },
  // --- Kontrolle der Gruppe `fire`: MUSS ohne ACAO antworten (WB-T0-7). ------
  {
    id: 'dwd-wbi-listing-control', group: 'fire', layer: 'KONTROLLE (WBI direkt)', critical: false,
    expect: 'no-cors', control: true,
    url: 'https://opendata.dwd.de/climate_environment/CDC/derived_germany/fire_danger_index/'
       + 'woodland/forecast/recent/',
    note: 'Doppelrolle: Negativkontrolle der Messung UND Nachweis, dass das WBI-Listing existiert',
  },
];

const ENDPOINTS = GROUP ? ALL_ENDPOINTS.filter((e) => (e.group ?? 'l0') === GROUP) : ALL_ENDPOINTS;
if (GROUP && ENDPOINTS.length === 0) {
  console.error(`Keine Endpunkte in Gruppe "${GROUP}". Vorhanden: `
    + [...new Set(ALL_ENDPOINTS.map((e) => e.group ?? 'l0'))].join(', '));
  process.exit(1);
}

const CORS_HEADERS = [
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-allow-credentials',
  'access-control-max-age',
  'access-control-expose-headers',
  'vary',
];

async function timedFetch(url, init) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...init, signal: ac.signal, redirect: 'follow' });
    return { res, ms: Date.now() - t0 };
  } finally {
    clearTimeout(t);
  }
}

function pickHeaders(res) {
  const out = {};
  for (const h of CORS_HEADERS) {
    const v = res.headers.get(h);
    if (v != null) out[h] = v;
  }
  return out;
}

/**
 * Was ist da wirklich zurückgekommen? WMS-Server antworten auf einen fehlerhaften
 * GetMap gern mit HTTP 200 und einem `ServiceExceptionReport` im Körper. Wer nur
 * den Statuscode protokolliert, hakt ein Gate ab, das in Wahrheit rot ist.
 */
function classifyBody(buf, contentType) {
  if (buf.byteLength >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf.byteLength >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) return 'gzip';
  const head = new TextDecoder().decode(buf.subarray(0, 900));
  if (/ServiceException|<ows:Exception|<ExceptionReport/i.test(head)) return 'wms-exception';
  if (/^\s*[[{]/.test(head)) {
    return /"type"\s*:\s*"Feature/i.test(head) ? 'geojson' : 'json';
  }
  if (/^\s*</.test(head)) return 'xml';
  if ((contentType ?? '').includes('text/html')) return 'html';
  return 'other';
}

function verdict(acao) {
  if (acao === '*') return 'OFFEN';
  if (acao === ORIGIN) return 'OFFEN (nur diese Origin)';
  if (acao) return `OFFEN (${acao})`;
  return 'KEIN CORS';
}

async function probe(ep) {
  const row = {
    id: ep.id, group: ep.group ?? 'l0', layer: ep.layer, url: ep.url, critical: !!ep.critical,
    expect: ep.expect, note: ep.note ?? null,
  };

  // 1) GET mit Origin — das, was der Browser bei einem Simple Request tut.
  try {
    const { res, ms } = await timedFetch(ep.url, { method: 'GET', headers: { Origin: ORIGIN } });
    row.status = res.status;
    row.ms = ms;
    row.finalUrl = res.url;
    row.redirected = res.url !== ep.url;
    row.contentType = res.headers.get('content-type');
    row.cacheControl = res.headers.get('cache-control');
    row.get = pickHeaders(res);
    row.acao = row.get['access-control-allow-origin'] ?? null;
    // Antwortgröße und ein kurzer Blick in den Körper (plan.md §WB0 Schritt 2:
    // „Antwortzeit und Antwortgröße protokollieren"). Ein 200er mit einem
    // ServiceException-XML im Körper ist KEIN Erfolg — genau das fängt `bodyKind`.
    try {
      const buf = new Uint8Array(await res.arrayBuffer());
      row.bytes = buf.byteLength;
      row.bodyKind = classifyBody(buf, row.contentType);
      if (row.bodyKind !== 'png' && row.bodyKind !== 'gzip' && buf.byteLength) {
        row.sample = new TextDecoder().decode(buf.subarray(0, 220)).replace(/\s+/g, ' ').trim();
      }
    } catch { /* egal */ }
  } catch (err) {
    row.status = null;
    row.error = String(err?.message ?? err);
  }

  // 2) OPTIONS-Preflight — relevant, sobald ein Request eigene Header setzt
  //    (z. B. If-None-Match beim MeteoSchweiz-304-Pfad) und damit kein Simple
  //    Request mehr ist.
  try {
    const { res } = await timedFetch(ep.url, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'if-none-match',
      },
    });
    row.preflight = { status: res.status, ...pickHeaders(res) };
    try { await res.arrayBuffer(); } catch { /* egal */ }
  } catch (err) {
    row.preflight = { error: String(err?.message ?? err) };
  }

  row.verdict = row.error ? 'NICHT ERREICHBAR' : verdict(row.acao);

  // Stimmt die Messung mit dem überein, was docs/DATA_SOURCES.md behauptet?
  if (row.error) row.matchesDocs = null;
  else if (ep.expect === 'cors') row.matchesDocs = !!row.acao;
  else if (ep.expect === 'no-cors') row.matchesDocs = !row.acao;
  else row.matchesDocs = null; // 'unknown' — hier entsteht das Wissen gerade erst

  return row;
}

const results = [];
for (const ep of ENDPOINTS) {
  process.stdout.write(`  … ${ep.id.padEnd(26)}`);
  const row = await probe(ep);
  results.push(row);
  const flag = row.matchesDocs === false ? '  ⚠ WIDERSPRICHT DER DOKU'
    : row.matchesDocs === null && !row.error ? '  (neu)'
    : '';
  process.stdout.write(`${String(row.status ?? '—').padStart(4)}  ${row.verdict}${flag}\n`);
}

// ---------------------------------------------------------------------------
// Plausibilitätssperre — verhindert 20 Falschbefunde hinter einem Proxy
// ---------------------------------------------------------------------------
// Ein Firmen-Proxy, ein VPN-Filter oder eine Sandbox beantwortet ALLE Anfragen
// mit demselben Statuscode (typisch 403 oder 407) und ohne CORS-Header. Ohne
// diese Prüfung läse sich das Ergebnis wie „keine einzige Quelle sendet CORS" —
// und würde ~20 Layer fälschlich als proxypflichtig einstufen. Genau ein solcher
// stiller Falschbefund ist das, was `docs/DATA_SOURCES.md` §12 als RK-1 führt.
const ok2xx = results.filter((r) => r.status >= 200 && r.status < 300);
const statusSet = new Set(results.filter((r) => r.status != null).map((r) => r.status));
const blocked = ok2xx.length === 0 && results.some((r) => r.status != null);

if (blocked) {
  console.log('\n\n' + '!'.repeat(78));
  console.log('LAUF NICHT VERWERTBAR — vermutlich blockiert eine lokale Instanz den Ausgang.');
  console.log('!'.repeat(78));
  console.log(`\n  Kein einziger Endpunkt antwortete mit 2xx.`);
  console.log(`  Aufgetretene Statuscodes: ${[...statusSet].join(', ')}`);
  console.log(`  ${results.filter((r) => r.error).length} Anfragen liefen in einen Fehler.`);
  console.log('\n  Typische Ursachen: Firmen-Proxy, VPN-Filter, Container-Sandbox, fehlende');
  console.log('  Netzfreigabe. Ein einheitlicher 403/407 über ALLE Hosts ist praktisch nie');
  console.log('  das Verhalten von zwanzig unabhängigen Behördenservern.');
  console.log('\n  → Von einem Rechner mit direktem Internetzugang erneut laufen lassen.');
  console.log('    Erst dann darf das Ergebnis in docs/DATA_SOURCES.md §13 (F-1) eingetragen');
  console.log('    werden. Bis dahin bleiben die CORS-Angaben dort mit ⚠️ markiert.\n');
  if (JSON_OUT) {
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    mkdirSync(dirname(JSON_OUT), { recursive: true });
    writeFileSync(JSON_OUT, JSON.stringify(
      { origin: ORIGIN, at: new Date().toISOString(), blocked: true, results }, null, 2));
    console.log(`  JSON trotzdem geschrieben (mit "blocked": true): ${JSON_OUT}\n`);
  }
  process.exit(2);
}

// Schwächere Variante derselben Sorge: die Kontrolle MUSS „kein CORS" melden.
// Tut sie es nicht, unterscheidet die Messung nicht zwischen „offen" und „zu".
const controlIds = new Set(ENDPOINTS.filter((e) => e.control).map((e) => e.id));
const controls = results.filter((r) => controlIds.has(r.id));
const controlSane = controls.length > 0 && controls.every((r) => !r.error && !r.acao);

// ---------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------
const pad = (s, n) => String(s ?? '').padEnd(n);
const kb = (n) => (n == null ? '—' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(0)} KB`);
console.log('\n\nCORS-Bestandsaufnahme  ·  Origin: ' + ORIGIN
  + (GROUP ? `  ·  Gruppe: ${GROUP}` : '') + '  ·  ' + new Date().toISOString());
console.log('='.repeat(140));
console.log(`${pad('ID', 26)}${pad('Layer', 28)}${pad('HTTP', 6)}${pad('ACAO', 16)}${pad('Preflight', 10)}`
  + `${pad('ms', 7)}${pad('Größe', 9)}${pad('Inhalt', 15)}Doku`);
console.log('-'.repeat(140));
for (const r of results) {
  const doc = r.matchesDocs === true ? 'bestätigt'
    : r.matchesDocs === false ? 'WIDERSPRUCH'
    : r.error ? '—' : 'neu';
  console.log(
    pad(r.id, 26) + pad(r.layer, 28) + pad(r.status ?? 'ERR', 6)
    + pad(r.acao ?? '(keins)', 16) + pad(r.preflight?.status ?? '—', 10)
    + pad(r.ms ?? '—', 7) + pad(kb(r.bytes), 9) + pad(r.bodyKind ?? '—', 15) + doc,
  );
}
console.log('-'.repeat(140));

// Ein 200er mit ServiceException-XML ist ein Fehlschlag, der wie ein Erfolg aussieht.
const fakeOk = results.filter((r) => r.bodyKind === 'wms-exception');
if (fakeOk.length) {
  console.log('\n⚠  HTTP 200, aber ServiceException im Körper — das ist KEIN Erfolg:');
  for (const r of fakeOk) console.log(`  · ${r.id}: ${r.sample?.slice(0, 180)}`);
}

const unreachable = results.filter((r) => r.error);
const contradictions = results.filter((r) => r.matchesDocs === false);
const redirects = results.filter((r) => r.redirected);

if (redirects.length) {
  console.log('\nUmleitungen (für einen Browser-Fetch relevant — CORS muss auf der ZIELantwort stehen):');
  for (const r of redirects) console.log(`  · ${r.id}: ${r.url}\n      → ${r.finalUrl}`);
}
if (unreachable.length) {
  console.log('\nNicht erreichbar:');
  for (const r of unreachable) console.log(`  · ${r.id}: ${r.error}`);
}
if (contradictions.length) {
  console.log('\n⚠  WIDERSPRÜCHE ZUR RECHERCHE — docs/DATA_SOURCES.md korrigieren:');
  for (const r of contradictions) {
    console.log(`  · ${r.id} (${r.layer}): erwartet "${r.expect}", gemessen "${r.verdict}"`);
  }
}

if (!controlSane) {
  console.log('\n⚠  KONTROLLE AUFFÄLLIG: opendata.dwd.de hätte OHNE CORS antworten müssen.');
  console.log('   Entweder trennt die Messung nicht sauber (Proxy dazwischen?) — oder der DWD');
  console.log('   hat CORS aktiviert. Das wäre ein eigener, wertvoller Befund: dann könnte der');
  console.log('   /_dwd_opendata-Rewrite perspektivisch entfallen. Vor dem Feiern zweimal messen.');
}

console.log('\nAbleitung für den Umsetzungsplan:');
const needProxy = results.filter((r) => !r.error && !r.acao);
const direct = results.filter((r) => !r.error && r.acao);
console.log(`  · direkt nutzbar (Aufwand S):        ${direct.length}  → ${direct.map((r) => r.id).join(', ') || '—'}`);
console.log(`  · Proxy nötig (Aufwand M + STOPP):   ${needProxy.length}  → ${needProxy.map((r) => r.id).join(', ') || '—'}`);
console.log(`  · ungeklärt (nicht erreichbar):      ${unreachable.length}`);
console.log('\nErinnerung: GeoSphere braucht wegen 240 req/h ohnehin einen Edge-Proxy — unabhängig vom CORS-Ergebnis.');

if (JSON_OUT) {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const { dirname } = await import('node:path');
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(
    { origin: ORIGIN, group: GROUP ?? 'all', at: new Date().toISOString(), results }, null, 2));
  console.log(`\nJSON geschrieben: ${JSON_OUT}`);
}

if (STRICT && unreachable.some((r) => r.critical)) {
  console.log('\n--strict: mindestens ein KRITISCHER Endpunkt ist nicht erreichbar.');
  process.exit(1);
}
process.exit(0);
