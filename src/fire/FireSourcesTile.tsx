import { useEffect, useRef, useState } from 'react';
import type { FireBasemap } from './FireMap';
import type { FireLayerId } from './fireModel';

/**
 * Info-Kachel „Quellen" unten rechts auf der Brandradar-Karte (Jan 06.11.).
 *
 * Nennt genau die Quellen, die der aktuelle Kartenzustand benutzt: Basiskarte, Ortssuche und je
 * eingeschalteter Layer. Die Zeile der MapLibre-Attribution bleibt die Pflichtnennung ohne Klick;
 * diese Kachel ist die Ausführung (Anbieter, Datensatz, Lizenz mit Link, Art der Veränderung).
 *
 * Lizenz und Vermerk stammen aus den Attributions-Konstanten der Quellmodule und aus `/lizenzen/`
 * (`scripts/seo/licenses.mjs`) — nicht bei jedem Anbieter neu gegen die Lizenzseite gelesen.
 */

interface Src {
  name: string;
  url?: string;
  /** Was die Karte daraus zeigt. */
  what: string;
  licence?: string;
  licenceUrl?: string;
  /** Art der Veränderung durch buscosun. */
  changed?: string;
}

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/deed.de';
const DL_BY = 'https://www.govdata.de/dl-de/by-2-0';
const OSM = 'https://www.openstreetmap.org/copyright';

const OSM_SRC: Src = {
  name: '© OpenStreetMap-Mitwirkende', url: OSM, what: 'Basiskarte (über OpenFreeMap und OpenMapTiles)',
  licence: 'ODbL 1.0', licenceUrl: OSM,
};
const DWD_BASE = 'https://www.dwd.de/DE/leistungen/opendata/opendata.html';

/** Quellen für den aktuellen Zustand; die Reihenfolge ist die Anzeigereihenfolge. */
export function sourcesFor(basemap: FireBasemap, active: ReadonlySet<FireLayerId>, provider: 'firms' | 'gwis'): { map: Src[]; layers: Src[]; search: Src[] } {
  const map: Src[] = basemap === 'satellite'
    ? [{ name: 'Esri World Imagery', what: 'Satelliten-Basiskarte', licence: 'Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' }]
    : basemap === 'terrain'
      ? [{ name: 'Esri World Topo', what: 'Gelände-Basiskarte' }]
      : [
        OSM_SRC,
        { name: 'OpenFreeMap', url: 'https://openfreemap.org/', what: 'Kachel-Dienst der Basiskarte' },
        { name: '© OpenMapTiles', url: 'https://openmaptiles.org/', what: 'Kartenschema der Basiskarte' },
      ];

  const layers: Src[] = [];
  if (active.has('fireHotspots') || active.has('fireFootprints')) {
    layers.push(provider === 'gwis'
      ? { name: 'Copernicus GWIS', url: 'https://gwis.jrc.ec.europa.eu/', what: 'Satelliten-Detektionen (Ersatzquelle)', licence: 'CC BY 4.0', licenceUrl: CC_BY, changed: 'Cluster, Zonen und Pixelrechtecke berechnet' }
      : { name: 'NASA FIRMS / LANCE', url: 'https://firms.modaps.eosdis.nasa.gov/', what: 'VIIRS 375 m, Detektionen (NRT)', licence: 'frei nutzbar, Nennung erbeten', changed: 'Cluster, Zonen und Pixelrechtecke berechnet' });
    layers.push({ name: 'Copernicus EMS Rapid Mapping', url: 'https://mapping.emergency.copernicus.eu/', what: 'Aktivierungen als Hinweis beim Klick', licence: '© Europäische Union' });
    layers.push({ name: 'GeoSphere Austria', url: 'https://www.geosphere.at/', what: 'Warnkontext zu Bränden in Österreich (zitiert)', licence: 'CC BY 4.0', licenceUrl: CC_BY });
    layers.push({ name: 'Copernicus Land Monitoring (CORINE 2018) · © EEA', url: 'https://www.eea.europa.eu/', what: 'Landbedeckung am Detektionspunkt', changed: 'Maske für Industrie, abgeleitet' });
  }
  if (active.has('fireBurnt') || active.has('fireFootprints')) {
    layers.push({ name: 'Copernicus EFFIS', url: 'https://effis.jrc.ec.europa.eu/', what: 'Kartierte Brandflächen', licence: 'CC BY 4.0', licenceUrl: CC_BY, changed: 'Darstellung; Zuordnung zu Detektionen berechnet' });
  }
  if (active.has('fireDanger')) {
    layers.push({ name: 'Copernicus GWIS (ECMWF-Familie)', url: 'https://gwis.jrc.ec.europa.eu/', what: 'EU-Gefahrenindex', licence: 'CC BY 4.0', licenceUrl: CC_BY, changed: 'unverändert' });
  }
  if (active.has('fireFuel')) {
    layers.push({ name: 'Copernicus EFFIS', url: 'https://effis.jrc.ec.europa.eu/', what: 'Brennmaterial-Karte (Stand 2017)', licence: 'CC BY 4.0', licenceUrl: CC_BY, changed: 'unverändert' });
  }
  if (active.has('fireContext')) {
    layers.push({ name: 'EEA — Natura 2000 · © EEA', url: 'https://www.eea.europa.eu/', what: 'Schutzgebiete (ohne Schweiz)', licence: 'EEA-Nutzungsbedingungen' });
  }
  if (active.has('fireWeather')) {
    layers.push({ name: 'Deutscher Wetterdienst', url: DWD_BASE, what: 'ICON-D2, relative Feuchte 2 m', licence: 'GeoNutzV / CC BY 4.0', licenceUrl: CC_BY, changed: 'Rasterdaten bildlich wiedergegeben' });
  }
  if (active.has('fireSoilDryness')) {
    layers.push({ name: 'Deutscher Wetterdienst', url: DWD_BASE, what: 'ICON-D2, Bodenfeuchte-Index (smi)', licence: 'GeoNutzV / CC BY 4.0', licenceUrl: CC_BY, changed: 'Rasterdaten bildlich wiedergegeben' });
  }
  if (active.has('fireAnomalies')) {
    layers.push({ name: 'NASA FIRMS (Archiv 2020–2026)', url: 'https://firms.modaps.eosdis.nasa.gov/', what: 'Standorte dauerhafter Wärmequellen', changed: 'eigene Ableitung' });
    layers.push({ name: 'EEA Industrial Reporting', url: 'https://www.eea.europa.eu/', what: 'Industriestandorte', licence: 'CC BY 4.0', licenceUrl: CC_BY });
    layers.push({ name: 'Marktstammdatenregister (BNetzA)', url: 'https://www.marktstammdatenregister.de/', what: 'Kraftwerke und Anlagen', licence: 'Datenlizenz Deutschland – Namensnennung – 2.0', licenceUrl: DL_BY });
    layers.push({ name: 'Bundesamt für Energie BFE', url: 'https://www.bfe.admin.ch/', what: 'Anlagen in der Schweiz', licence: 'OPEN BY' });
  }
  const search: Src[] = [{ name: 'Nominatim · © OpenStreetMap-Mitwirkende', url: OSM, what: 'Ortssuche in der Europa-Box', licence: 'ODbL 1.0', licenceUrl: OSM }];
  return { map, layers, search };
}

function Row({ s }: { s: Src }) {
  return (
    <li className="br-src-row">
      <span className="br-src-name">{s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}</span>
      <span className="br-src-what">{s.what}</span>
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

export function FireSourcesTile({ basemap, active, provider }: { basemap: FireBasemap; active: ReadonlySet<FireLayerId>; provider: 'firms' | 'gwis' }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onDown = (e: PointerEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onDown); };
  }, [open]);
  const { map, layers, search } = sourcesFor(basemap, active, provider);
  return (
    <div className="br-src" ref={root}>
      {open && (
        <div className="br-src-tile" role="dialog" aria-label="Quellen dieser Karte">
          <div className="br-src-head"><strong>Quellen dieser Ansicht</strong><button type="button" className="br-src-x" onClick={() => setOpen(false)} aria-label="Schließen">×</button></div>
          <div className="br-src-sec">Karte</div><ul>{map.map((s, i) => <Row key={`m${i}`} s={s} />)}</ul>
          {layers.length > 0 && <><div className="br-src-sec">Eingeschaltete Ebenen</div><ul>{layers.map((s, i) => <Row key={`l${i}`} s={s} />)}</ul></>}
          <div className="br-src-sec">Suche</div><ul>{search.map((s, i) => <Row key={`s${i}`} s={s} />)}</ul>
          <p className="br-src-foot">Gefahrenstufen und Brandangaben sind keine amtliche Bestätigung; berechnete Werte sind „Datenbasis, bearbeitet“. <a href="/lizenzen/" target="_blank" rel="noopener">Alle Quellen &amp; Lizenzen</a></p>
        </div>
      )}
      <button type="button" className="br-src-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} aria-label="Quellen dieser Karte">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7.2v.1" /></svg>
        <span>Quellen</span>
      </button>
    </div>
  );
}
