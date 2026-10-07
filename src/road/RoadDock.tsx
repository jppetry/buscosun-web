/**
 * AW-5 — Dock of Autobahnwetter (design: search, country filter, motorway list with status, layers, blocked source,
 * data situation per country, gap notice). AT/CH rows are static: no open road measurement exists there, and the
 * forecast points of AW-6 are not built — the rows say so instead of showing a made-up state.
 */
import { useState } from 'react';
import type { RoadPoint } from './roadContract';
import type { RoadCorridor } from './roadClient';
import type { RoadMapLayers } from './RoadMap';
import { ROAD_CLASS_COLOR, ROAD_DOCK_FOLD_BELOW, corridorStatus, corridorTitle, dockEntries, isHatched, shieldText, type RoadSlotSummary } from './roadView';

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
}

const STATIC_ROWS: ReadonlyArray<{ cc: 'AT' | 'CH'; shield: string; title: string }> = [
  { cc: 'AT', shield: 'A 10', title: 'Salzburg → Villach' },
  { cc: 'CH', shield: 'A 2', title: 'Basel → Gotthard → Chiasso' },
  { cc: 'CH', shield: 'A 13', title: 'St. Margrethen → San Bernardino' },
  { cc: 'CH', shield: 'A 1', title: 'Genf → Zürich → St. Margrethen' },
];

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
  return (
    <aside className="aw-dock" aria-label="Autobahnen und Ebenen">
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
            const n = e.hidden.length;
            return (
              <button key={`fold-${e.road}`} type="button" className={`aw-road-more${e.open ? ' is-open' : ''}`} aria-expanded={e.open}
                onClick={() => setOpen((s) => { const x = new Set(s); if (x.has(e.road)) x.delete(e.road); else x.add(e.road); return x; })}
                title={e.hidden.map((c) => corridorTitle(c)).join(' · ')}>
                {e.open ? `${shieldText(e.road)}: kurze Abschnitte einklappen` : `${shieldText(e.road)}: ${n} ${n === 1 ? 'kurzer Abschnitt' : 'kurze Abschnitte'} mit weniger als ${ROAD_DOCK_FOLD_BELOW} Messpunkten`}
              </button>
            );
          }
          const c = e.corridor;
          const st = corridorStatus(c, p.byId);
          const on = c.id === p.selectedId;
          const parts = [`${st.measured} gemessen`];
          if (st.critical) parts.push(`${st.critical} kritisch`);
          if (st.unknown) parts.push(`${st.unknown} ohne Zustand`);
          if (st.nodata) parts.push(`${st.nodata} ohne Messung`);
          return (
            <button key={c.id} type="button" className={`aw-road${on ? ' is-active' : ''}`} aria-pressed={on} onClick={() => p.onPick(c.id)}>
              <span className="aw-road-shields">{c.shields.map((s) => <span key={s} className="aw-shield">{s}</span>)}</span>
              <span className="aw-road-body">
                <span className="aw-road-title">{corridorTitle(c)}</span>
                <span className="aw-road-sub">{p.hasData ? parts.join(' · ') : p.loading?.obs ? 'Messung lädt …' : 'keine Messdaten'}</span>
              </span>
              <span className={`aw-road-dot${isHatched(st.worst) || !p.hasData ? ' is-hatched' : ''}`} style={!isHatched(st.worst) && p.hasData ? { background: ROAD_CLASS_COLOR[st.worst] } : undefined} aria-hidden="true" />
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

      <div className="aw-dock-h aw-dock-h-layers">Ebenen</div>
      <div className="aw-dock-list">
        {LAYERS.map((l) => (
          <button key={l.key} type="button" className={`aw-layer${p.layers[l.key] ? ' is-on' : ''}`} aria-pressed={p.layers[l.key]} onClick={() => p.onToggle(l.key)}>
            <span className="aw-layer-body"><span className="aw-layer-label">{l.label}</span><span className="aw-layer-sub">{l.sub}</span></span>
            <span className="aw-switch" aria-hidden="true"><span /></span>
          </button>
        ))}
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
    </aside>
  );
}
