import { useEffect, useRef, useState } from 'react';
import './mapSources.css';

/**
 * Source line + „Quellen" tile of a full map page — the Brandradar concept (`fire/FireSourcesTile.tsx`, Jan 06.11.)
 * as one shared piece for Wetterkarte, Seewetter, Autobahnwetter and Gletscher (Jan 07.11.).
 *
 * - The MapLibre attribution (`attributionControl: { compact: false, customAttribution }`) is a dark strip over the
 *   full map width at the bottom edge; it lies over the „Quellen" button (clicks pass through, links stay clickable).
 * - 5 s after the page is fully loaded (`ready` = start cover gone) the strip fades out; the button stays.
 * - The button opens a tile with every source of the view, licence and link.
 *
 * The map's wrapper carries the class `msl-host`; its CSS variable `--msl-bottom` lifts strip and button above
 * bottom bars of the page (time deck, forecast band). See `mapSources.css`.
 */
export interface MapSource {
  name: string;
  url?: string;
  what?: string;
  licence?: string;
  licenceUrl?: string;
  /** Wording the provider prescribes, shown in quotes. */
  credit?: string;
  /** What buscosun changes (e.g. „eigene Farbskala"). */
  changed?: string;
  /** Switched on in this view. */
  on?: boolean;
}
export interface MapSourceGroup { title: string; note?: string; items: readonly MapSource[] }

/** How long the source line stays visible after the page has fully loaded (Jan 06.11., `set`). */
export const MAP_SOURCE_LINE_VISIBLE_MS = 5000;

export const OSM_COPYRIGHT_URL = 'https://www.openstreetmap.org/copyright';
export const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/deed.de';

/** The OpenFreeMap base map, used by all four pages. */
export const BASEMAP_SOURCE: MapSource = {
  name: 'OpenFreeMap · © OpenMapTiles · Daten © OpenStreetMap-Mitwirkende', url: OSM_COPYRIGHT_URL,
  what: 'Basiskarte', licence: 'ODbL 1.0', licenceUrl: ODBL_URL,
};

/** Terrarium relief (hillshade, 3D terrain) of the glacier, road, dashboard and cut maps. */
export const TERRAIN_SOURCE: MapSource = {
  name: 'Mapzen / AWS Terrain Tiles', url: 'https://registry.opendata.aws/terrain-tiles/', what: 'Relief für Schummerung und 3D-Gelände',
};
export const DWD_OPEN_DATA_URL = 'https://opendata.dwd.de/';
/** GeoSphere Austria prescribes this wording (see /lizenzen/). */
export const GEOSPHERE_CREDIT = 'Datenquelle: GeoSphere Austria - https://data.hub.geosphere.at';

/** Leading part of `customAttribution`: the link to the central list (stays in front so it is always visible). */
export const MAP_SOURCES_LINK = '<a href="/lizenzen/" target="_blank" rel="noopener">Quellen &amp; Lizenzen</a>';

function Row({ s }: { s: MapSource }) {
  return (
    <li className={`msl-row${s.on ? ' is-on' : ''}`}>
      <span className="msl-name">
        {s.url ? <a href={s.url} target="_blank" rel="noopener noreferrer">{s.name}</a> : s.name}
        {s.on && <span className="msl-on">aktiv</span>}
      </span>
      {s.what && <span className="msl-what">{s.what}</span>}
      {s.credit && <span className="msl-credit">„{s.credit}"</span>}
      {(s.licence || s.changed) && (
        <span className="msl-meta">
          {s.licence && (s.licenceUrl ? <a href={s.licenceUrl} target="_blank" rel="noopener noreferrer">{s.licence}</a> : s.licence)}
          {s.licence && s.changed ? ' · ' : ''}
          {s.changed}
        </span>
      )}
    </li>
  );
}

export function MapSourcesTile({ title, groups, ready, foot }: {
  /** e.g. „Quellen der Wetterkarte" — heading and accessible name. */
  title: string;
  groups: readonly MapSourceGroup[];
  /** Page fully loaded (start cover gone): starts the 5-s clock of the source line. */
  ready: boolean;
  /** Replaces the default closing note. */
  foot?: string;
}) {
  const [open, setOpen] = useState(false);
  const [folded, setFolded] = useState(false);
  useEffect(() => {
    if (!ready || folded) return;
    const t = window.setTimeout(() => setFolded(true), MAP_SOURCE_LINE_VISIBLE_MS);
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
  const anyOn = groups.some((g) => g.items.some((s) => s.on));
  return (
    <div className={`msl${folded ? ' is-folded' : ''}`} ref={root}>
      {open && (
        <div className="msl-tile" role="dialog" aria-label={title}>
          <div className="msl-head"><strong>{title}</strong><button type="button" className="msl-x" onClick={() => setOpen(false)} aria-label="Schließen">×</button></div>
          {anyOn && <p className="msl-hint"><span className="msl-on">aktiv</span> = in dieser Ansicht eingeschaltet</p>}
          {groups.filter((g) => g.items.length || g.note).map((g) => (
            <section key={g.title}>
              <div className="msl-sec">{g.title}{g.note && <span className="msl-secnote"> · {g.note}</span>}</div>
              <ul>{g.items.map((s, i) => <Row key={`${g.title}${i}`} s={s} />)}</ul>
            </section>
          ))}
          <p className="msl-foot">
            {foot ?? 'buscosun bereitet die Daten auf (Berechnung, Zusammenführung, eigene Farbskalen); berechnete Werte sind „Datenbasis, bearbeitet".'}{' '}
            <a href="/lizenzen/" target="_blank" rel="noopener">Alle Quellen &amp; Lizenzen von buscosun</a>
          </p>
        </div>
      )}
      <button type="button" className="msl-btn" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)} aria-label={title}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 11v6M12 7.2v.1" /></svg>
        <span>Quellen</span>
      </button>
    </div>
  );
}
