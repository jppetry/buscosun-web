/**
 * /lizenzen/ — zentrales Quellen- und Attributionsverzeichnis (V-104, build-only).
 *
 * ⚠️ KEINE RECHTSBERATUNG. Hier stehen ausschließlich die Angaben, die die
 * Anbieter selbst machen bzw. die im Code hinterlegt sind.
 *
 * ── Warum die Seite nötig ist ────────────────────────────────────────────────
 * buscosun nutzt ~20 externe Datenquellen und Karten-Assets mit teils klar
 * formulierter Attributionspflicht — ein zentrales Verzeichnis gab es nicht.
 * Der DWD erwartet bei VERÄNDERTER Nutzung (und buscosun verändert massiv:
 * Höhenkorrektur, OI-Fusion, Optical-Flow-Nowcast, eigene Farbrampen)
 * „mindestens eine Nennung des DWD in zentralen Quellenverzeichnissen oder im
 * Impressum". GeoSphere Austria gibt sogar einen WÖRTLICHEN Text vor.
 *
 * ── Warum aus modelCatalog.ts gelesen und nicht abgetippt ────────────────────
 * `src/fusion/modelCatalog.ts` führt `operator`, `license` und `attribution` je
 * Modell bereits gepflegt. Eine abgetippte Zweitliste würde driften — genau der
 * Fehler, den V-80 beim Warm-Budget aufgedeckt hat. Deshalb wird der Katalog
 * beim Build geparst; findet der Parser weniger Einträge als erwartet, bricht
 * er ab, statt eine unvollständige Seite auszuliefern.
 */
import { readFileSync } from 'node:fs';

const CATALOG_PATH = 'src/fusion/modelCatalog.ts';
/** Untergrenze als Bruch-Sicherung: der Katalog hatte am 2026-08-03 19 Modelle. */
const MIN_EXPECTED_MODELS = 15;

/** Ein Feld aus einem Katalog-Eintrag ziehen (einfache Stringliterale). */
const field = (entry, key) => (entry.match(new RegExp(`\\b${key}:\\s*'([^']*)'`)) ?? [])[1] ?? null;

export function readModelCatalog() {
  const src = readFileSync(CATALOG_PATH, 'utf8');
  // Der Katalog endet mit `] as const;` — nicht mit `];`.
  const block = (src.match(/export const MODEL_CATALOG[^=]*=\s*\[([\s\S]*?)\n\](?:\s+as\s+const)?\s*;/) ?? [])[1];
  if (!block) throw new Error(`[licenses] MODEL_CATALOG in ${CATALOG_PATH} nicht gefunden — Struktur geändert?`);

  // Einträge auf oberster Ebene: jeder beginnt mit "  {" und endet mit "  },".
  const entries = block.split(/\n  \},?/).filter((e) => /\bid:\s*'/.test(e));
  // SEO/GEO 2026 (E3): Zahlen, Flags und Abdeckung für /methodik/wettermodelle/.
  const num = (entry, key) => { const m = entry.match(new RegExp(`\\b${key}:\\s*([0-9.]+)`)); return m ? Number(m[1]) : null; };
  const flag = (entry, key) => new RegExp(`\\b${key}:\\s*true\\b`).test(entry) ? true : new RegExp(`\\b${key}:\\s*false\\b`).test(entry) ? false : null;
  const covConsts = Object.fromEntries([...src.matchAll(/const (\w+)\s*(?::[^=]+)?=\s*(\{[^}]*DE:[^}]*\})/g)].map((m) => [m[1], m[2]]));
  const parseCov = (txt) => { if (!txt) return null; const o = {}; for (const c of ['DE', 'AT', 'CH']) { const m = txt.match(new RegExp(`${c}:\\s*'([a-z]+)'`)); if (m) o[c] = m[1]; } return Object.keys(o).length ? o : null; };
  const coverage = (entry) => { const m = entry.match(/\bcoverage:\s*(\w+|\{[^}]*\})/); if (!m) return null; return parseCov(m[1].startsWith('{') ? m[1] : covConsts[m[1]]); };
  const models = entries.map((e) => ({
    id: field(e, 'id'),
    name: field(e, 'name'),
    operator: field(e, 'operator'),
    license: field(e, 'license'),
    attribution: field(e, 'attribution'),
    special: field(e, 'special'),
    resolutionKm: num(e, 'resolutionKm'),
    horizonH: num(e, 'horizonH'),
    ensemble: flag(e, 'ensemble') === true,
    ai: flag(e, 'ai') === true,
    ingested: flag(e, 'ingested'),
    group: field(e, 'group'),
    coverage: coverage(e),
  })).filter((m) => m.id && m.name);

  if (models.length < MIN_EXPECTED_MODELS) {
    throw new Error(
      `[licenses] Nur ${models.length} Modelle aus ${CATALOG_PATH} gelesen (erwartet ≥ ${MIN_EXPECTED_MODELS}). ` +
      'Der Parser passt nicht mehr zur Datei — die Seite würde Quellen VERSCHWEIGEN. Build abgebrochen.',
    );
  }
  return models;
}

/**
 * Quellen, die NICHT im Modellkatalog stehen: Karten, Geodaten, Ortssuche,
 * Messnetze, Satellit, Schriften. Handgepflegt — mit Belegstelle im Code, damit
 * jede Zeile nachprüfbar bleibt.
 */
export const NON_MODEL_SOURCES = [
  {
    group: 'Karten & Geodaten',
    items: [
      { name: 'OpenFreeMap', operator: 'OpenFreeMap', license: 'Kachel-Dienst, Attribution verpflichtend',
        note: 'Basiskarten-Kacheln. Pflichttext: „OpenFreeMap © OpenMapTiles Data from OpenStreetMap".', ref: 'src/MapView.tsx, src/atmosphere/ThermalMap.tsx u. a.' },
      { name: 'OpenStreetMap', operator: 'OpenStreetMap-Mitwirkende', license: 'ODbL 1.0',
        note: 'Grundlage der OpenFreeMap-Kacheln, der Ortssuche und der Länderpolygone.', ref: 'src/geocode.ts, public/countries/*.geojson' },
      { name: 'OpenMapTiles', operator: 'OpenMapTiles', license: 'siehe OpenFreeMap',
        note: 'Kachel-Schema der Basiskarten.', ref: 'Basemap-Style' },
      { name: 'Nominatim', operator: 'OpenStreetMap Foundation', license: 'ODbL 1.0',
        note: 'Ortssuche (Geocoding). Nutzungsbedingungen der OSMF gelten.', ref: 'src/geocode.ts:24,42' },
      { name: 'Esri World Imagery / World Topo', operator: 'Esri und Datenpartner', license: '🔴 in Klärung',
        note: 'Satelliten- und Gelände-Basiskarte der Radar-Ansicht. Die Nutzungsberechtigung ohne ArcGIS-Lizenz ist offen (V-106); geforderte Nennung: „Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community".', ref: 'src/radar/RadarMap.tsx:37,40' },
    ],
  },
  {
    group: 'Messnetze, Radar & Satellit',
    items: [
      { name: 'DWD Open Data', operator: 'Deutscher Wetterdienst', license: 'GeoNutzV / CC BY 4.0',
        note: 'ICON-D2, ICON-D2-EPS, ICON-EU, RADOLAN-RV-Radarkomposit, Warnungen, Stationsmesswerte. buscosun verändert diese Daten (Höhenkorrektur, Fusion, Nowcast, eigene Rampen).', ref: 'src/sources/*' },
      { name: 'GeoSphere Austria Data Hub', operator: 'GeoSphere Austria', license: 'CC BY 4.0',
        note: 'INCA-Nowcast und TAWES-Stationen. Vorgegebener Wortlaut: „Datenquelle: GeoSphere Austria - https://data.hub.geosphere.at".', ref: 'src/sources/geosphereInca.ts, geosphereTawes.ts' },
      { name: 'MeteoSchweiz Open Data', operator: 'Bundesamt für Meteorologie und Klimatologie MeteoSchweiz', license: 'CC BY 4.0',
        note: 'ICON-CH1/CH2-EPS, RZC-Radar, SMN-Stationen.', ref: 'src/sources/meteoSwissSmn.ts u. a.' },
      { name: 'BrightSky', operator: 'BrightSky (Jakob Bräuer)', license: 'MIT (Dienst) · Daten: DWD',
        note: 'Zugriffsschicht auf DWD-Stationsdaten und -Warnungen.', ref: 'src/sources/brightSkyCurrent.ts, dwdAlerts.ts' },
      { name: 'EUMETSAT / Meteosat', operator: 'EUMETSAT', license: 'siehe EUMETSAT-Datenpolitik',
        note: 'Satellitenbild-Layer (WMS).', ref: 'Satelliten-Layer der Karte' },
      { name: 'Meteostat', operator: 'Meteostat', license: 'CC BY-NC 4.0',
        note: 'Historische Stationsreihen im Klima-Rückblick.', ref: 'src/history/meteostatSource.ts' },
      { name: 'Open-Meteo', operator: 'Open-Meteo', license: 'CC BY 4.0, nicht-kommerzielle Nutzung',
        note: 'Zusatzquelle für Punkt-Vorhersage, Ensemble und Pollen (CAMS); seit BD1 auch Wetterlage am Brandort (DWD ICON, past_days). Nutzung siehe D-18 bzw. V-28.', ref: 'src/sources/openMeteo*.ts, src/fire/detail/fireWeatherAtPoint.ts' },
    ],
  },
  {
    group: 'Gletscher-Monitor',
    items: [
      { name: 'GLIMS Glacier Database (NSIDC-0272)', operator: 'GLIMS Consortium / National Snow and Ice Data Center', license: 'Quellenangabe Pflicht (NSIDC: „As a condition of using these data, you must cite the use of this data set.")',
        note: 'Schweizer Inventare und frühere Umrisse. GLIMS Consortium, doi:10.7265/N5V98602; die Einreichungen stammen von den Inventar-Autoren. Eine ausdrückliche CC-BY-Angabe steht auf der Datensatzseite nicht; deshalb nennt buscosun die Zitierpflicht.', ref: 'audit/gletscher/licences.md' },
      { name: 'WGMS Fluctuations of Glaciers', operator: 'World Glacier Monitoring Service', license: 'CC BY 4.0 (laut WGMS: Open Access mit korrekter Zitierung)',
        note: 'Längen- und Massenreihen, Version 2026-02-10.', ref: 'audit/gletscher/licences.md' },
      { name: 'AGI 5 und GI4', operator: 'PANGAEA (Buckel & Otto u. a.)', license: 'CC BY 4.0 / CC BY 3.0',
        note: 'Österreichische Gletscherinventare.', ref: 'audit/gletscher/licences.md' },
      { name: 'RGI 6.2', operator: 'RGI Consortium', license: 'CC BY 4.0',
        note: 'Brücke zwischen Inventaren und die vier deutschen Umrisse.', ref: 'audit/gletscher/licences.md' },
      { name: 'Copernicus Sentinel-2 L2A', operator: 'ESA / Europäische Kommission (Earth Search, AWS Open Data)', license: 'freier und offener Zugang',
        note: 'Szenenwerte für Schneegrenze und Albedo. Enthält modifizierte Copernicus-Sentinel-Daten.', ref: 'scripts/glacier/sat-scan.mjs' },
    ],
  },
  {
    group: 'Seewetter und Autobahnwetter',
    items: [
      { name: 'BSH Wasserstandsvorhersage', operator: 'Bundesamt für Seeschifffahrt und Hydrographie', license: 'CC BY 4.0',
        note: 'Pegel und Vorhersagekurven über die OGC API; die Warnkategorie wird nur zitiert.', ref: 'src/sea/waterLevelClient.ts' },
      { name: 'DWD CWAM und Seewetterbericht', operator: 'Deutscher Wetterdienst', license: 'GeoNutzV / CC BY 4.0',
        note: 'Seegang im Küstenmodell, Bericht und Warnstatus im Wortlaut.', ref: 'src/sea/seaContract.ts' },
      { name: 'DWD Glättemeldeanlagen (SWIS)', operator: 'Deutscher Wetterdienst und Straßenbauverwaltungen der Länder', license: 'GeoNutzV',
        note: 'Fahrbahnmessungen im 15-Minuten-Takt, von buscosun dekodiert, geprüft und umkodiert.', ref: 'src/road/roadContract.ts' },
    ],
  },
  {
    group: 'Waldbrand DACH',
    items: [
      { name: 'NASA FIRMS / LANCE', operator: 'NASA (Fire Information for Resource Management System, LANCE)', license: 'NASA: „no restrictions on subsequent use or redistribution"',
        note: 'Primärquelle der aktiven Brände: VIIRS-375-m-Thermalanomalien (NRT) von Suomi-NPP, NOAA-20 und NOAA-21 mit Feuerstrahlungsleistung, Konfidenz, Pixelgeometrie und Tag/Nacht. Nennung: „NASA FIRMS / LANCE". Zugriff über die Area API mit MAP_KEY — der Schlüssel steht ausschließlich serverseitig in der Edge Function und nie im Bundle (docs/DATA_SOURCES.md §W.2.1). Am 2026-08-14 am eigenen Schlüssel geprüft.', ref: 'src/fire/sources/firmsHotspots.ts, netlify/edge-functions/firms.ts' },
      { name: 'Copernicus GWIS (Global Wildfire Information System)', operator: 'Europäische Kommission / JRC', license: 'CC BY 4.0',
        note: 'EU-Gefahrenindex der ECMWF-Familie als WMS-Fläche in fünf Sub-Ansichten (FWI, Perzentil-Einordnung gegenüber ~40 Jahren Historie, Drought Code, ISI, FFMC; bis +9 Tage) und — als keylose Rückfallebene für die aktiven Brände — Satelliten-Thermalanomalien (VIIRS) als Punkte ohne Intensität. Pflichttext: „© European Union, Copernicus Emergency Management Service — GWIS (CC BY 4.0)". Kein Schlüssel, keine Abrufgrenze; in WB0/E0 (2026-08-14/15) selbst geprüft.', ref: 'src/fire/sources/gwisFwi.ts, dangerViews.ts, gwisHotspots.ts' },
      { name: 'DWD Waldbrandgefahrenindex (WBI) und Graslandfeuerindex (GLFI)', operator: 'Deutscher Wetterdienst', license: 'GeoNutzV / CC BY 4.0',
        note: 'Amtliche Stufe 1–5 für Deutschland, 484 Stationen, Tag 0…+6. buscosun gibt die Stationswerte wieder; eine Fläche daraus wäre eigene Interpolation und ist als solche zu kennzeichnen. Ein offenes 1-km-Raster gibt es nicht (Pfad liefert 404).', ref: 'src/fire/sources/dwdFireIndex.ts' },
      { name: 'DWD ICON-D2 relhum_2m', operator: 'Deutscher Wetterdienst', license: 'GeoNutzV / CC BY 4.0',
        note: 'Relative Feuchte 2 m als Feuerwetter-Treiber (Europa-Ansicht: ICON-EU, ≈ 7 km, gleiche Lizenz). Abgeleitete Darstellung ⇒ Pflichtform „Datenbasis: Deutscher Wetterdienst, Rasterdaten bildlich wiedergegeben".', ref: 'src/sources/iconD2Relhum.ts' },
      { name: 'DWD ICON-D2 smi (Bodenfeuchte-Index)', operator: 'Deutscher Wetterdienst', license: 'GeoNutzV / CC BY 4.0',
        note: 'Bodentrockenheit als Waldbrand-Treiber. Abgeleitete Darstellung ⇒ „Datenbasis: Deutscher Wetterdienst, Rasterdaten bildlich wiedergegeben".', ref: 'src/sources/iconD2Smi.ts' },
      { name: 'Copernicus EMS Rapid Mapping', operator: 'Europäische Union, Copernicus Emergency Management Service', license: 'klären',
        note: 'Aktivierungen als Hinweis zu Bränden (Name, Land, Datum, Link). Im Code steht nur der Vermerk „© European Union, Copernicus Emergency Management Service — Rapid Mapping"; die Lizenzfassung wurde nicht gegen die Anbieterseite geprüft.', ref: 'src/fire/sources/emsActivations.ts' },
      { name: 'Industrie- und Anlagenstandorte der Thermalanomalie-Liste', operator: 'EEA (Industrial Reporting), BNetzA (MaStR), BFE', license: 'CC BY 4.0 · DL-DE/BY-2.0 · BFE OPEN BY (laut Code, nicht gegen Anbieterseiten geprüft ⇒ klären)',
        note: 'Ortsfeste Wärmequellen (Industrie, Fackeln, Kraftwerke), die nicht als Brand gezählt werden. Standorte sind eine eigene Ableitung aus NASA-FIRMS-Archiv 2020–2026 und diesen Registern. Vermerk an der Karte: „Standorte: NASA FIRMS (Archiv 2020–2026, eigene Ableitung) · © EEA Industrial Reporting CC-BY 4.0 · MaStR (BNetzA) DL-DE/BY-2.0 · BFE OPEN BY".', ref: 'src/fire/anomaly/anomalyLayer.ts' },
      { name: 'Copernicus EFFIS', operator: 'Europäische Kommission / JRC', license: 'CC BY 4.0',
        note: 'European Fuel Map (Brennmaterial, Stand 2017) und die kartierten Brandflächen des Rapid Damage Assessment (laufende Saison live, Archiv früherer Saisons; mit Fläche, Branddatum und Landbedeckungsanteilen). Eine Detektion in einer solchen Fläche wird als „von EFFIS kartiert (bestätigt)" ausgewiesen — mit Fläche, Datum und Stand. Pflichttext: „© European Union, Copernicus Emergency Management Service — EFFIS (CC BY 4.0)". ⚠️ Der Hotspot-Bestand desselben Dienstes endet Okt 2021 und wird NICHT verwendet — aktive Brände kommen von NASA FIRMS (Rückfall GWIS).', ref: 'src/fire/sources/euContext.ts, src/fire/fireCorroboration.ts' },
      { name: 'EEA — Natura 2000 und CORINE Land Cover 2018', operator: 'Europäische Umweltagentur (EEA)', license: 'EEA-Reuse: frei, auch kommerziell',
        note: 'Schutzgebiete und Landbedeckung als Brandkontext. Pflichttext: „Generated using European Union\'s Copernicus Land Monitoring Service information" bzw. „© EEA". ⚠️ Natura 2000 deckt die SCHWEIZ nicht ab — sie ist kein EU-Mitglied; eine leere Fläche heißt dort „nicht erfasst", nicht „keine Schutzgebiete".', ref: 'src/fire/sources/euContext.ts' },
      { name: 'Copernicus EDO/GDO', operator: 'Europäische Kommission / JRC', license: 'CC BY 4.0',
        note: '🔴 Vorgesehen für Trockenheit und Vegetationsstress, aber NICHT eingebunden: Der Dienst sendet `access-control-allow-origin` doppelt, was ungültiges CORS ist — MapLibre lädt daran null Kacheln. Am 2026-08-14 im Browser belegt. Eine Einbindung bräuchte einen server-seitigen Umweg.', ref: 'audit/waldbrand-ausbau.md §1' },
      { name: 'BAFU Waldbrandgefahr und Feuerverbote', operator: 'Bundesamt für Umwelt BAFU / swisstopo', license: 'Opendata OPEN: Freie Nutzung (geocat.ch, opendata.swiss terms_open)',
        note: 'Amtliche Schweizer Gefahrenstufe je Warnregion und kantonale Präventionsmassnahmen. Autoritativ ist der geocat-Metadatensatz je Layer (Waldbrandgefahrenwarnung 3f8bc20d-…, Waldbrandpräventionsmassnahmen der Kantone 5deca805-…): MD_LegalConstraints.otherConstraints = „Opendata OPEN: Freie Nutzung." mit Verweis auf opendata.swiss/terms-of-use#terms_open (A0-6, 2026-08-15). Das STAC-Feld „proprietary" ist ein Platzhalter (docs/DATA_SOURCES.md §W.6). Auflage Fair Use: ein Abruf je Sitzung, TTL ≥ 1 h, kein Polling. Vermerk: „© BAFU · © Data: swisstopo".', ref: 'src/fire/sources/bafuFire.ts' },
      { name: 'NASA GIBS / Worldview Snapshots', operator: 'NASA ESDIS', license: 'frei („no restrictions"), Anerkennung erbeten',
        note: 'Satellitenbilder „Vorher | Während | Nachher" je Brand im Dossier: HLS-Echtfarbe (Sentinel-2 + Landsat harmonisiert, 30 m) als fertige Einzelbilder der Worldview-Snapshot-API, kein Schlüssel, CORS *, strikt on-demand (eine Handvoll Bilder je Dossier-Klick, Sitzungs-Cache). Erbetener Text steht als SAT_ATTRIBUTION an der Karte. Am 2026-08-31/09-01 an den Endpunkten gemessen (audit/brandradar-satellitenbilder.md).', ref: 'src/fire/detail/fireSatImagery.ts, src/fire/FireSatImagery.tsx' },
      { name: 'Element84 Earth Search (AWS Open Data)', operator: 'Element 84 / AWS Open Data Program', license: 'Copernicus-Sentinel- bzw. USGS-Landsat-Daten: frei mit Attribution',
        note: 'STAC-Katalog für die Aufnahmetage samt Wolkenanteil je Szene (Collections sentinel-2-l2a und landsat-c2-l2). Anonym, CORS *, eine Anfrage je Brand und Sitzung. Der Wolkenwert gilt je 110-km-Granulat, nicht am Brandort — er ist Vorauswahl, die Tagesleiste die Korrektur. Seit SAT2a liest der 10-m-Viewer zusätzlich die Sentinel-2-TCI-Originale (COGs) per Range-Request vom CORS-offenen Bucket sentinel-cogs.s3.us-west-2.amazonaws.com (AWS Open Data, Copernicus-Sentinel-Lizenz: frei mit Attribution) — on-demand nach Klick, 1–10 MB je Sitzung.', ref: 'src/fire/detail/fireSatImagery.ts' },
      { name: 'ESA WorldCover 2021', operator: 'ESA / VITO (Bereitstellung: Microsoft Planetary Computer)', license: 'CC BY 4.0',
        note: 'Landbedeckung 10 m (v200, Stand 2021) für die Ernte-Sprenkel-Dämpfung des dNBR-Overlays im 10-m-Viewer (SAT2d): auf Acker/Siedlung/vegetationsarmen Flächen wird das Verbrannt-Signal halbtransparent gedämpft — nie gelöscht. Abruf on-demand per Range-Request (COG) über einen anonymen SAS-Token des Microsoft Planetary Computer (beide CORS *, kein Schlüssel im Repo, ~0,1–0,3 MB je Dossier-Sitzung); der ESA-eigene AWS-Bucket ist CORS-los (gemessen 2026-09-02, audit/brandradar-satellitenbilder.md §12). Benannter Ersatzweg (V-SAT-15): fällt der Planetary Computer aus, liest die Dämpfung dieselben Daten (9000-px-Ebene ≈ 37 m, Kachel-Nutzlasten byte-identisch remuxt) vom eigenen statischen Spiegel-Repo buscosun-worldcover über jsDelivr am gepinnten Commit-SHA; die CC-BY-4.0-Attribution steht auch im Spiegel-README. Pflichttext: „© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021), CC BY 4.0" — steht als WC_ATTRIBUTION im Modul, der Viewer-Satz nennt Quelle und Lizenz.', ref: 'src/fire/detail/worldCover.ts, src/fire/FireCogViewer.tsx' },
      { name: 'GeoNames', operator: 'GeoNames (Marc Wick, Unxos GmbH)', license: 'CC BY 4.0',
        note: 'Statisches Ortsverzeichnis DE/AT/CH (bewohnte Orte ab 1 500 Einwohnern mit Kreis/Bezirk/Kanton) für die Angabe „nächster Ort" im Brandflächen-Panel — als Datei im Repo, kein Abruf einer Web-API (die GeoNames-API braucht ein Konto mit Limit, Nominatim erlaubt 1 Anfrage/s; beides ist ausgeschlossen). Pflichttext: „Ortsnamen: GeoNames (CC BY 4.0)". Erzeugt aus den Länderdumps mit scripts/build-places-dach.mjs.', ref: 'public/fire/places-dach.json, src/fire/footprint/places.ts' },
    ],
  },
  {
    group: 'Schriften & Software',
    items: [
      { name: 'League Spartan, Space Grotesk, IBM Plex Mono', operator: 'League of Movable Type, Florian Karsten, IBM', license: 'SIL Open Font License 1.1',
        note: 'Seit V-102 selbst gehostet — beim Seitenaufruf geht keine Verbindung zu einem Schrift-CDN.', ref: 'public/fonts/' },
      { name: 'MapLibre GL JS', operator: 'MapLibre-Projekt', license: 'BSD-3-Clause', note: 'Kartendarstellung (WebGL).', ref: 'package.json' },
      { name: 'React', operator: 'Meta und Mitwirkende', license: 'MIT', note: 'UI-Bibliothek.', ref: 'package.json' },
      { name: 'bz2 / bzip2-wasm / jsfive', operator: 'jeweilige Autoren', license: 'MIT bzw. BSD', note: 'Dekompression der GRIB2- und HDF5-Rohdaten im Browser.', ref: 'package.json' },
    ],
  },
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function modelRows(models) {
  return models.map((m) => {
    const kind = m.special ? ' <em>(hauseigen)</em>' : '';
    return `<tr><td><strong>${esc(m.name)}</strong>${kind}</td><td>${esc(m.operator ?? '—')}</td>` +
      `<td>${esc(m.license ?? '—')}</td><td>${esc(m.attribution ?? '—')}</td></tr>`;
  }).join('\n            ');
}

function sourceGroup(g) {
  const items = g.items.map((i) =>
    `<li><strong>${esc(i.name)}</strong> — ${esc(i.operator)} · <em>${esc(i.license)}</em><br>` +
    `${esc(i.note)}<br><small>Im Code: <code>${esc(i.ref)}</code></small></li>`).join('\n            ');
  return `<h3>${esc(g.group)}</h3>\n          <ul>\n            ${items}\n          </ul>`;
}

export function buildLicensePage() {
  const models = readModelCatalog();
  return {
    slug: 'lizenzen',
    title: 'Quellen & Lizenzen',
    h1: 'Quellen & Lizenzen',
    description: 'Alle Wetterdaten, Karten und Schriften, die buscosun benutzt — mit Betreiber, Lizenz und dem geforderten Nennungstext.',
    lead: 'Woher die Daten kommen, wem sie gehören und was buscosun daraus macht.',
    extraJsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: 'Quellen- und Lizenzverzeichnis von buscosun',
      inLanguage: 'de',
      license: 'https://creativecommons.org/licenses/by/4.0/',
      sourceOrganization: [
        { '@type': 'Organization', name: 'Deutscher Wetterdienst', url: 'https://opendata.dwd.de/' },
        { '@type': 'Organization', name: 'GeoSphere Austria', url: 'https://data.hub.geosphere.at/' },
        { '@type': 'Organization', name: 'MeteoSchweiz', url: 'https://www.meteoschweiz.admin.ch/' },
        { '@type': 'Organization', name: 'ECMWF', url: 'https://www.ecmwf.int/' },
        { '@type': 'Organization', name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright' },
      ],
    },
    sections: [
      {
        h2: 'Kurz gesagt',
        html: `<p>buscosun rechnet nicht selbst Wetter — es holt die Daten der amtlichen Wetterdienste,
          rechnet sie um und stellt sie dar. Diese Seite nennt jede Quelle, ihren Betreiber und ihre Lizenz.</p>
          <p><strong>Wichtig für die Einordnung:</strong> buscosun <em>verändert</em> die Daten erheblich —
          Höhenkorrektur der Temperatur, Verschmelzung mehrerer Modelle, Radar-Extrapolation und eigene
          Farbskalen. Was Sie hier sehen, ist deshalb nicht identisch mit dem, was der jeweilige Wetterdienst
          veröffentlicht. Für amtliche Warnungen gilt immer die Quelle selbst.</p>`,
      },
      {
        h2: `Wettermodelle (${models.length}, direkt aus dem Modellkatalog der App)`,
        html: `<p>Diese Tabelle wird beim Bauen der Seite aus <code>src/fusion/modelCatalog.ts</code> erzeugt —
          derselben Datei, aus der die App ihre Modellauswahl speist. Sie kann deshalb nicht veralten.</p>
          <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Modell</th><th>Betreiber</th><th>Lizenz</th><th>Nennung</th></tr></thead>
            <tbody>
            ${modelRows(models)}
            </tbody>
          </table></div>`,
      },
      {
        h2: 'Weitere Quellen',
        html: NON_MODEL_SOURCES.map(sourceGroup).join('\n          '),
      },
      {
        h2: 'Was buscosun daraus macht',
        html: `<ul>
            <li><strong>Höhenkorrektur:</strong> Modelltemperaturen werden mit einer aus den Daten
              geschätzten Temperaturabnahme auf die echte Geländehöhe gerechnet.</li>
            <li><strong>Fusion mehrerer Modelle:</strong> Mehrere Wettermodelle und Live-Stationsmesswerte
              werden zu einem Feld verschmolzen.</li>
            <li><strong>Radar-Nowcast:</strong> Aus aufeinanderfolgenden Radarbildern wird die Zugrichtung
              bestimmt und fortgeschrieben.</li>
            <li><strong>Eigene Farbskalen und Schwellen</strong> für alle Kartenlayer.</li>
          </ul>
          <p>Fehler in der Darstellung sind deshalb <em>unsere</em> Fehler, nicht die der Wetterdienste.</p>`,
      },
      {
        h2: 'Fehler gefunden?',
        html: `<p>Wenn eine Nennung fehlt, falsch ist oder eine Lizenz sich geändert hat:
          <a href="/kontakt/">Kontakt</a>. Wir korrigieren das.</p>`,
      },
    ],
  };
}
