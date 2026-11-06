import { useEffect, useRef, useState } from 'react';
import type { FireBasemap } from './FireMap';
import type { FireLayerId } from './fireModel';
import { CLC_ATTRIBUTION } from './clcMask';

/**
 * Info-Kachel „Quellen" unten rechts auf der Brandradar-Karte (Jan 06.11.).
 *
 * Nennt ALLE Quellen, die der Brandradar benutzt (Jan 06.11., zweiter Auftrag): Basiskarten,
 * Kartenebenen, die Daten der Brand-Details/des Dossiers/der Historie sowie Suche und Ortsnamen.
 * Was der aktuelle Kartenzustand gerade benutzt, trägt die Marke „aktiv". Die Zeile der
 * MapLibre-Attribution bleibt die Pflichtnennung ohne Klick; diese Kachel ist die Ausführung
 * (Anbieter, Datensatz, Lizenz mit Link, Art der Veränderung).
 *
 * Lizenz und Vermerk stammen aus den Attributions-Konstanten der Quellmodule und aus `/lizenzen/`
 * (`scripts/seo/licenses.mjs`); die beiden Esri-Texte sind die `copyrightText` der MapServer
 * (gelesen 06.11.). Nicht bei jedem Anbieter neu gegen die Lizenzseite gelesen.
 */

interface Src {
  name: string;
  url?: string;
  /** Was die Seite daraus zeigt. */
  what: string;
  licence?: string;
  licenceUrl?: string;
  /** Vom Anbieter vorgegebener Nennungstext (wörtlich). */
  credit?: string;
  /** Art der Veränderung durch buscosun. */
  changed?: string;
  /** Wird vom aktuellen Kartenzustand benutzt (nur Basiskarte und Kartenebenen). */
  on?: boolean;
}

interface Group {
  title: string;
  note?: string;
  items: Src[];
}

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/deed.de';
const CC_BY_NC = 'https://creativecommons.org/licenses/by-nc/4.0/deed.de';
const DL_BY = 'https://www.govdata.de/dl-de/by-2-0';
const OSM = 'https://www.openstreetmap.org/copyright';
const DWD_BASE = 'https://www.dwd.de/DE/leistungen/opendata/opendata.html';
const DWD_CHANGED = 'Rasterdaten bildlich wiedergegeben';

/** = `WC_ATTRIBUTION` in `detail/worldCover.ts` — als Text, damit das Modul des 10-m-Viewers nicht ins Brandradar-Bundle wandert. */
const WC_CREDIT = '© ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021), CC BY 4.0';

/** Esri-Nennungstexte = `copyrightText` der beiden MapServer (06.11. gelesen). */
export const ESRI_IMAGERY_CREDIT = 'Source: Esri, Vantor, Earthstar Geographics, and the GIS User Community';
export const ESRI_TOPO_CREDIT =
  'Sources: Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, '
  + 'Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), (c) OpenStreetMap contributors, and the GIS User Community';

/** Alle Quellen des Brandradars; die Reihenfolge ist die Anzeigereihenfolge. */
export function sourcesFor(basemap: FireBasemap, active: ReadonlySet<FireLayerId>, provider: 'firms' | 'gwis'): Group[] {
  const fires = active.has('fireHotspots') || active.has('fireFootprints');
  const burnt = active.has('fireBurnt') || active.has('fireFootprints');

  const map: Src[] = [
    { name: '© OpenStreetMap-Mitwirkende', url: OSM, what: 'Basiskarte „Straßen" (Kartendaten)', licence: 'ODbL 1.0', licenceUrl: OSM, on: basemap === 'streets' },
    { name: 'OpenFreeMap', url: 'https://openfreemap.org/', what: 'Kachel-Dienst der Basiskarte „Straßen"', on: basemap === 'streets' },
    { name: '© OpenMapTiles', url: 'https://openmaptiles.org/', what: 'Kartenschema der Basiskarte „Straßen"', on: basemap === 'streets' },
    { name: 'Esri World Imagery', url: 'https://www.esri.com/', what: 'Basiskarte „Satellit"', credit: ESRI_IMAGERY_CREDIT, on: basemap === 'satellite' },
    { name: 'Esri World Topo', url: 'https://www.esri.com/', what: 'Basiskarte „Gelände"', credit: ESRI_TOPO_CREDIT, on: basemap === 'terrain' },
  ];

  const layers: Src[] = [
    { name: 'NASA FIRMS / LANCE', url: 'https://firms.modaps.eosdis.nasa.gov/', what: 'Aktive Brände: VIIRS 375 m, Detektionen (NRT)', licence: 'frei nutzbar, Nennung erbeten', changed: 'Cluster, Zonen und Pixelrechtecke berechnet', on: fires && provider === 'firms' },
    { name: 'Copernicus GWIS', url: 'https://gwis.jrc.ec.europa.eu/', what: 'Aktive Brände: Satelliten-Detektionen (Ersatzquelle, wenn FIRMS ausfällt)', licence: 'CC BY 4.0', licenceUrl: CC_BY, credit: '© European Union, Copernicus Emergency Management Service — GWIS (CC BY 4.0)', changed: 'Cluster, Zonen und Pixelrechtecke berechnet', on: fires && provider === 'gwis' },
    { name: 'Copernicus EFFIS', url: 'https://effis.jrc.ec.europa.eu/', what: 'Kartierte Brandflächen (laufende Saison und Archiv)', licence: 'CC BY 4.0', licenceUrl: CC_BY, credit: '© European Union, Copernicus Emergency Management Service — EFFIS (CC BY 4.0)', changed: 'Darstellung; Zuordnung zu Detektionen berechnet', on: burnt },
    { name: 'Copernicus EMS Rapid Mapping', url: 'https://mapping.emergency.copernicus.eu/', what: 'Aktivierungen als Hinweis zu Bränden', licence: '© Europäische Union', credit: '© European Union, Copernicus Emergency Management Service — Rapid Mapping', on: fires },
    { name: 'GeoSphere Austria', url: 'https://www.geosphere.at/', what: 'Warnkontext zu Bränden in Österreich (wörtlich zitiert)', licence: 'CC BY 4.0', licenceUrl: CC_BY, on: fires },
    { name: 'Copernicus Land Monitoring Service (CORINE 2018) · © EEA', url: 'https://land.copernicus.eu/', what: 'Landbedeckung am Detektionspunkt', credit: CLC_ATTRIBUTION, changed: 'Maske für Industrie, abgeleitet', on: fires || active.has('fireAnomalies') },
    { name: 'Copernicus GWIS (ECMWF-Familie)', url: 'https://gwis.jrc.ec.europa.eu/', what: 'Ebene „Gefahrenindex" (FWI und Teilindizes, bis +9 Tage)', licence: 'CC BY 4.0', licenceUrl: CC_BY, credit: '© European Union, Copernicus Emergency Management Service — GWIS (CC BY 4.0)', changed: 'unverändert', on: active.has('fireDanger') },
    { name: 'Copernicus EFFIS', url: 'https://effis.jrc.ec.europa.eu/', what: 'Ebene „Brennmaterial" (European Fuel Map, Stand 2017)', licence: 'CC BY 4.0', licenceUrl: CC_BY, credit: '© European Union, Copernicus Emergency Management Service — EFFIS (CC BY 4.0)', changed: 'unverändert', on: active.has('fireFuel') },
    { name: 'EEA — Natura 2000 · © EEA', url: 'https://www.eea.europa.eu/', what: 'Ebene „Schutzgebiete" (ohne Schweiz)', licence: 'EEA-Nutzungsbedingungen', on: active.has('fireContext') },
    { name: 'Deutscher Wetterdienst', url: DWD_BASE, what: 'Ebene „Feuerwetter": relative Feuchte 2 m aus ICON-EU (Europa-Blick) bzw. ICON-D2 (DACH-Blick)', licence: 'GeoNutzV / CC BY 4.0', licenceUrl: CC_BY, changed: DWD_CHANGED, on: active.has('fireWeather') },
    { name: 'Deutscher Wetterdienst', url: DWD_BASE, what: 'Ebene „Bodentrockenheit": ICON-D2, Bodenfeuchte-Index (smi)', licence: 'GeoNutzV / CC BY 4.0', licenceUrl: CC_BY, changed: DWD_CHANGED, on: active.has('fireSoilDryness') },
    { name: 'NASA FIRMS (Archiv 2020–2026)', url: 'https://firms.modaps.eosdis.nasa.gov/', what: 'Ebene „Thermalanomalien": Standorte dauerhafter Wärmequellen', changed: 'eigene Ableitung', on: active.has('fireAnomalies') },
    { name: 'EEA Industrial Reporting', url: 'https://www.eea.europa.eu/', what: 'Ebene „Thermalanomalien": Industriestandorte', licence: 'CC BY 4.0', licenceUrl: CC_BY, on: active.has('fireAnomalies') },
    { name: 'Marktstammdatenregister (BNetzA)', url: 'https://www.marktstammdatenregister.de/', what: 'Ebene „Thermalanomalien": Kraftwerke und Anlagen', licence: 'Datenlizenz Deutschland – Namensnennung – 2.0', licenceUrl: DL_BY, on: active.has('fireAnomalies') },
    { name: 'Bundesamt für Energie BFE', url: 'https://www.bfe.admin.ch/', what: 'Ebene „Thermalanomalien": Anlagen in der Schweiz', licence: 'OPEN BY', on: active.has('fireAnomalies') },
  ];

  const detail: Src[] = [
    { name: 'Open-Meteo.com · Modell DWD ICON', url: 'https://open-meteo.com/', what: 'Wetter am Brandort (Verlauf und Vorhersage)', licence: 'CC BY 4.0', licenceUrl: CC_BY, changed: 'Treiber und Feuerwetter-Indizes berechnet' },
    { name: 'Open-Meteo.com · ERA5-Reanalyse (Copernicus/ECMWF)', url: 'https://open-meteo.com/', what: 'Wetter zur Stunde der Erstdetektion und Klimaprofil am Brandort', licence: 'CC BY 4.0', licenceUrl: CC_BY },
    { name: 'Meteostat', url: 'https://meteostat.net/', what: 'Brand-Historie: Wetterlage am Brandtag (nächste Station, Daten u. a. DWD)', licence: 'CC BY-NC 4.0', licenceUrl: CC_BY_NC },
    { name: 'NASA GIBS / Worldview', url: 'https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs', what: 'Satellitenbilder „Vorher | Während | Nachher" (HLS: Landsat und Sentinel-2 harmonisiert, 30 m)', licence: 'frei nutzbar, Anerkennung erbeten' },
    { name: 'Element84 Earth Search (AWS Open Data)', url: 'https://element84.com/earth-search/', what: 'Szenenliste und Wolkenanteil der Aufnahmetage', licence: 'frei mit Nennung' },
    { name: 'Copernicus Sentinel-2 (ESA, über AWS Open Data)', url: 'https://registry.opendata.aws/sentinel-2-l2a-cogs/', what: '10-m-Ansicht: Echtfarbe, SWIR und Verbrannt (dNBR)', licence: 'Copernicus-Sentinel-Datenpolitik, frei mit Nennung', credit: 'Contains modified Copernicus Sentinel data (Jahr der Aufnahme)', changed: 'SWIR-Darstellung und dNBR berechnet' },
    { name: 'ESA WorldCover 2021 (über Microsoft Planetary Computer)', url: 'https://esa-worldcover.org/', what: '10-m-Ansicht: Dämpfung des dNBR auf Acker und Siedlung (Ersatz: eigener Spiegel)', licence: 'CC BY 4.0', licenceUrl: CC_BY, credit: WC_CREDIT, changed: 'Maske abgeleitet' },
    { name: 'NASA FIRMS (VIIRS-Archiv) · Copernicus EFFIS', url: 'https://firms.modaps.eosdis.nasa.gov/', what: 'Brand-Historie: Ereignisse früherer Monate und Saisons', changed: 'Ereignisse aus Detektionen und Kartierungen abgeleitet' },
  ];

  const search: Src[] = [
    { name: 'Nominatim · © OpenStreetMap-Mitwirkende', url: OSM, what: 'Ortssuche in der Europa-Box', licence: 'ODbL 1.0', licenceUrl: OSM },
    { name: 'GeoNames', url: 'https://www.geonames.org/', what: 'Nächster Ort zu einem Brand (Ortsverzeichnis DE/AT/CH)', licence: 'CC BY 4.0', licenceUrl: CC_BY, credit: 'Ortsnamen: GeoNames (CC BY 4.0)' },
  ];

  return [
    { title: 'Basiskarte', items: map },
    { title: 'Kartenebenen', items: layers },
    { title: 'Brand-Details, Dossier und Historie', note: 'geladen beim Öffnen eines Brands', items: detail },
    { title: 'Suche und Ortsnamen', items: search },
  ];
}

function Row({ s }: { s: Src }) {
  return (
    <li className={`br-src-row${s.on ? ' is-on' : ''}`}>
      <span className="br-src-name">
        {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}
        {s.on && <span className="br-src-on">aktiv</span>}
      </span>
      <span className="br-src-what">{s.what}</span>
      {s.credit && <span className="br-src-credit">„{s.credit}"</span>}
      {(s.licence || s.changed) && (
        <span className="br-src-meta">
          {s.licence && (s.licenceUrl ? <a href={s.licenceUrl} target="_blank" rel="noopener noreferrer">{s.licence}</a> : s.licence)}
          {s.licence && s.changed ? ' · ' : ''}
          {s.changed}
        </span>
      )}
    </li>
  );
}

/** How long the source line stays visible after the page has fully loaded, then it folds into „Quellen" (Jan 06.11., `set`). */
export const SOURCE_LINE_VISIBLE_MS = 5000;

export function FireSourcesTile({ basemap, active, provider, ready }: {
  basemap: FireBasemap; active: ReadonlySet<FireLayerId>; provider: 'firms' | 'gwis';
  /** Page fully loaded (start cover gone): starts the 5-s clock of the source line. */
  ready: boolean;
}) {
  const [open, setOpen] = useState(false);
  // The source line (MapLibre attribution) folds via CSS `:has(.br-src.is-folded)` — see fireDeck.css.
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!ready || folded) return;
    const t = window.setTimeout(() => setFolded(true), SOURCE_LINE_VISIBLE_MS);
    return () => window.clearTimeout(t);
  }, [ready, folded]);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);
  const groups = sourcesFor(basemap, active, provider);
  return (
    <div className={`br-src${folded ? ' is-folded' : ''}`} ref={root}>
      {open && (
        <div className="br-src-tile" role="dialog" aria-label="Quellen des Brandradars">
          <div className="br-src-head"><strong>Quellen des Brandradars</strong><button type="button" className="br-src-x" onClick={() => setOpen(false)} aria-label="Schließen">×</button></div>
          <p className="br-src-hint"><span className="br-src-on">aktiv</span> = in dieser Ansicht eingeschaltet</p>
          {groups.map((g) => (
            <section key={g.title}>
              <div className="br-src-sec">{g.title}{g.note && <span className="br-src-secnote"> · {g.note}</span>}</div>
              <ul>{g.items.map((s, i) => <Row key={`${g.title}${i}`} s={s} />)}</ul>
            </section>
          ))}
          <p className="br-src-foot">buscosun bereitet die Daten auf (Berechnung, Zusammenführung, eigene Farbskalen); berechnete Werte sind „Datenbasis, bearbeitet“. Gefahrenstufen und Brandangaben sind keine amtliche Bestätigung. <a href="/lizenzen/" target="_blank" rel="noopener">Alle Quellen &amp; Lizenzen von buscosun</a></p>
        </div>
      )}
      <button type="button" className="br-src-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} aria-label="Quellen des Brandradars">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7.2v.1" /></svg>
        <span>Quellen</span>
      </button>
    </div>
  );
}
