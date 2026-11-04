/**
 * AW-5 — Dock of Autobahnwetter (design: search, country filter, motorway list with status, layers, blocked source,
 * data situation per country, gap notice). AT/CH rows are static: no open road measurement exists there, and the
 * forecast points of AW-6 are not built — the rows say so instead of showing a made-up state.
 */
import { useState } from 'react';
import type { RoadPoint } from './roadContract';
import type { RoadCorridor } from './roadClient';
import type { RoadMapLayers } from './RoadMap';
import { ROAD_CLASS_COLOR, ROAD_GAP_SHORT, corridorStatus, corridorTitle, dockEntries, dockFoldLabel, isGapCorridor, isHatched, type RoadSlotSummary } from './roadView';

export type RoadCountry = 'alle' | 'DE' | 'AT' | 'CH';

interface Props {
  corridors: readonly RoadCorridor[];
  byId: ReadonlyMap<string, RoadPoint>;
  selectedId: string | null;
  onPick: (id: string) => void;
  query: string;
  onQuery: (q: string) => void;
  country: RoadCountry;
  onCountry: (c: RoadCountry) => void;
  layers: RoadMapLayers;
  onToggle: (k: keyof RoadMapLayers) => void;
  summary: RoadSlotSummary;
  hasData: boolean;
  /** M5 (D-9): still loading — corridors and/or the measurement slot; loading must not read like an outage. */
  loading?: { corridors: boolean; obs: boolean };
  /** Desktop splits the dock: `roads` = search, countries, list (right sidebar); `layers` = layers and data per country (left). Absent = all (mobile picker). */
  part?: 'roads' | 'layers';
}

const STATIC_ROWS: ReadonlyArray<{ cc: 'AT' | 'CH'; shield: string; title: string }> = [
  { cc: 'AT', shield: 'A 10', title: 'Salzburg → Villach' },
  { cc: 'CH', shield: 'A 2', title: 'Basel → Gotthard → Chiasso' },
  { cc: 'CH', shield: 'A 13', title: 'St. Margrethen → San Bernardino' },
  { cc: 'CH', shield: 'A 1', title: 'Genf → Zürich → St. Margrethen' },
];

/** Layer groups and icons in the look of the weather map's dock (group head, icon, label + sub, switch). */
const LAYER_GROUPS: ReadonlyArray<{ id: string; label: string; keys: ReadonlyArray<keyof RoadMapLayers> }> = [
  { id: 'messung', label: 'Messung', keys: ['zust', 'temp', 'fog', 'bl'] },
  { id: 'prognose', label: 'Prognose und Radar', keys: ['fc', 'rain'] },
  { id: 'warnung', label: 'Warnungen', keys: ['warn'] },
];
const LAYER_ICON: Readonly<Record<keyof RoadMapLayers, string>> = {
  zust: 'M3 19 8 5M21 19 16 5M12 6v3M12 11.5v3M12 17v2.5',
  temp: 'M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0zM12 9.5v7',
  fog: 'M3 7h13M6 11h15M3 15h12M8 19h10',
  bl: 'M4 20c3-6 3-10 7-12s6-3 9-4M4 20h4M14 8l2 3',
  fc: 'M12 21s-6-5.6-6-10a6 6 0 0 1 12 0c0 4.4-6 10-6 10zM12 11.5a1.8 1.8 0 1 0 0-.01',
  rain: 'M7 15a4 4 0 0 1-.5-7.9A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7H7zM9 18.5l-1 2M13 18.5l-1 2M17 18.5l-1 2',
  warn: 'M12 3.5 2.8 19.5h18.4L12 3.5zM12 10v4.5M12 17.2v.1',
};
const LAYERS: ReadonlyArray<{ key: keyof RoadMapLayers; label: string; sub: string }> = [
  { key: 'zust', label: 'Fahrbahnzustand', sub: 'Farbe je Messpunkt' },
  { key: 'temp', label: 'Temperaturwerte', sub: 'Fahrbahn, sonst Luft (L)' },
  { key: 'fog', label: 'Sicht und Nebel', sub: 'GMA-Sichtweite unter 150 m' },
  { key: 'bl', label: 'Bundes- und Landesstraßen', sub: 'Glättemeldeanlagen abseits der Autobahn' },
  { key: 'fc', label: 'Prognosepunkte', sub: 'Luft alle 5 km, buscosun Fusion' },
  { key: 'rain', label: 'Niederschlag jetzt', sub: 'Radar DWD, letzte Analyse (5 min)' },
  { key: 'warn', label: 'Amtliche Warnungen', sub: 'DWD (Deutschland), wörtlich zitiert' },
];

export default function RoadDock(p: Props) {
  const showDE = p.country === 'alle' || p.country === 'DE';
  const rows = showDE ? p.corridors : [];
  // V-AW-9: short sections (< 3 stations, not the main section of their motorway) fold under one row per motorway.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const entries = dockEntries(rows, { query: p.query, selectedId: p.selectedId, open });
  const staticRows = STATIC_ROWS.filter((r) => p.country === 'alle' || r.cc === p.country);
  const roads = p.part !== 'layers', layersOn = p.part !== 'roads';
  const Tag = p.part === 'roads' ? 'div' : 'aside';
  return (
    <Tag className={p.part === 'roads' ? 'aw-roads' : `aw-dock${p.part ? ` is-${p.part}` : ''}`} aria-label={p.part === 'roads' ? 'Autobahnen' : p.part === 'layers' ? 'Ebenen' : 'Autobahnen und Ebenen'}>
      {roads && <>
      <label htmlFor="aw-search" className="aw-eyebrow aw-dock-label">Autobahn oder Messstelle</label>
      <div className="aw-search">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8B7355" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <input id="aw-search" type="search" placeholder="A 8, Irschenberg, Holzkirchen …" value={p.query} onChange={(e) => p.onQuery(e.target.value)} autoComplete="off" />
      </div>
      <div role="group" aria-label="Land" className="aw-seg aw-dock-country">
        {(['alle', 'DE', 'AT', 'CH'] as const).map((c) => (
          <button key={c} type="button" aria-pressed={p.country === c} className={p.country === c ? 'is-active' : ''} onClick={() => p.onCountry(c)}>{c === 'alle' ? 'Alle' : c}</button>
        ))}
      </div>

      <div className="aw-dock-head">
        <span className="aw-dock-h">Autobahnen</span>
        <span className="aw-count">{rows.length + staticRows.length}</span>
      </div>
      <div className="aw-dock-list">
        {entries.map((e) => {
          if (e.kind === 'fold') {
            return (
              <button key={`fold-${e.road}`} type="button" className={`aw-road-more${e.open ? ' is-open' : ''}`} aria-expanded={e.open}
                onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(e.road)) x.delete(e.road); else x.add(e.road); return x; })}
                title={e.hidden.map((c) => corridorTitle(c)).join(' · ')}>
                {dockFoldLabel(e.road, e.hidden, e.open)}
              </button>
            );
          }
          const c = e.corridor;
          const st = corridorStatus(c, p.byId);
          const on = c.id === p.selectedId;
          // AF-5: a section without a measuring station — no count of measurements, no class dot (D-04).
          const gap = isGapCorridor(c);
          const parts = [`${st.measured} gemessen`];
          if (st.critical) parts.push(`${st.critical} kritisch`);
          if (st.unknown) parts.push(`${st.unknown} ohne Zustand`);
          if (st.nodata) parts.push(`${st.nodata} ohne Messung`);
          return (
            <button key={c.id} type="button" className={`aw-road${on ? ' is-active' : ''}`} aria-pressed={on} onClick={() => p.onPick(c.id)}>
              <span className="aw-road-shields">{c.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}</span>
              <span className="aw-road-body">
                <span className="aw-road-title">{corridorTitle(c)}</span>
                <span className="aw-road-sub">{gap ? `${ROAD_GAP_SHORT} · keine Messstelle` : p.hasData ? parts.join(' · ') : p.loading?.obs ? 'Messung lädt …' : 'keine Messdaten'}</span>
              </span>
              {gap
                ? <span className="aw-road-dot is-fc" aria-hidden="true" />
                : <span className={`aw-road-dot${isHatched(st.worst) || !p.hasData ? ' is-hatched' : ''}`} style={!isHatched(st.worst) && p.hasData ? { background: ROAD_CLASS_COLOR[st.worst] } : undefined} aria-hidden="true" />}
            </button>
          );
        })}
        {!rows.length && showDE && <p className="aw-note">{p.query.trim() ? `Keine Autobahn passt zu „${p.query}“.` : p.loading?.corridors ? 'Autobahnen laden …' : 'Keine Autobahn geladen.'}</p>}
        {staticRows.map((r) => (
          <div key={r.cc + r.shield} className="aw-road is-static">
            <span className={`aw-shield${r.cc === 'CH' ? ' is-ch' : ''}`}>{r.shield}</span>
            <span className="aw-road-body">
              <span className="aw-road-title">{r.title}</span>
              <span className="aw-road-sub">keine offene Fahrbahnmessung · Prognosepunkte folgen</span>
            </span>
            <span className="aw-road-dot is-ring" aria-hidden="true" />
          </div>
        ))}
      </div>
      </>}

      {layersOn && <>
      <div className="aw-dock-head aw-dock-head-layers">
        <span className="aw-dock-h aw-dock-h-layers">Ebenen</span>
        <span className="aw-count">{LAYERS.filter((l) => p.layers[l.key]).length} von {LAYERS.length} an</span>
      </div>
      {LAYER_GROUPS.map((g) => (
        <div key={g.id} className="aw-layer-group">
          <div className="aw-layer-group-h">{g.label}</div>
          <div className="aw-dock-list">
            {g.keys.map((k) => {
              const l = LAYERS.find((x) => x.key === k)!;
              return (
                <button key={l.key} type="button" className={`aw-layer${p.layers[l.key] ? ' is-on' : ' is-off'}`} aria-pressed={p.layers[l.key]} onClick={() => p.onToggle(l.key)}>
                  <span className="aw-layer-ic" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={LAYER_ICON[l.key]} /></svg></span>
                  <span className="aw-layer-body"><span className="aw-layer-label">{l.label}</span><span className="aw-layer-sub">{l.sub}</span></span>
                  <span className="aw-switch" aria-hidden="true"><span /></span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="aw-dock-list">
        <div className="aw-layer is-blocked">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A89A7A" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
          <span className="aw-layer-body"><span className="aw-layer-label">Verkehrsmeldungen</span><span className="aw-layer-sub">blockiert · Lizenz der Autobahn-API ungeklärt</span></span>
        </div>
      </div>

      <div className="aw-dock-countries">
        <div className="aw-eyebrow">Datenlage je Land</div>
        <div className="aw-country-grid">
          <strong>DE</strong><span><b className="is-measured">gemessen</b> · Glättemeldeanlagen, 15 min · Wetterprognose 48 h je 5 km</span>
          <strong>AT</strong><span><b className="is-none">keine offene Fahrbahnmessung</b> · Prognose folgt</span>
          <strong>CH</strong><span><b className="is-none">keine offene Fahrbahnmessung</b> · Prognose folgt</span>
        </div>
        {p.summary.missingGroups.length > 0 && (
          <div className="aw-box is-frost">
            <strong>Lücke:</strong> {p.summary.missingGroups.length === 1 ? 'Die DWD-Reihe' : 'Die DWD-Reihen'} {p.summary.missingGroups.join(', ')} {p.summary.missingGroups.length === 1 ? 'liefert' : 'liefern'} in diesem Slot nicht — dort keine Fahrbahnmessung.
          </div>
        )}
      </div>
      </>}
    </Tag>
  );
}
