/**
 * Phase DK-H — the stations of a glacier in the dossier map (level "Heute"), lazy chunk of `GlacierBrief`.
 *
 * On the map (layer "Stationen"): a numbered marker per station (filled = best match, ring = the others), a dashed line from the
 * nearest point of the outline to the station with the distance of the mapping, and a white card at the station (name, elevation,
 * one to three values). MapLibre means only: one GeoJSON line layer and DOM markers (`maplibregl.Marker`) — no shader, no custom
 * layer. With terrain on (3D), MapLibre sets each marker on the ground; a vertical line then carries the number above its point.
 *
 * Beside the map (desktop): the list with every value of the old card "Gemessen in der Nähe", the three meters and an elevation strip.
 * On the phone (media query of the dossier): the map shows number and one value; a tap opens the station as a sheet below the map,
 * the others stay rows. Selecting in the list marks the marker and back.
 *
 * Every value is a measurement (`data-origin="measured"`); the fixed sentence says where the instruments stand; no word about
 * conditions, no comparison with the model.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import './glacierStations.css';
import type { GlacierCatalogEntry } from './glacierContract';
import { GLACIER_STN_SITE_NOTE } from './glacierStationContract';
import { ageText, dzText, whereText, type StnView, type StnViewStation } from './glacierStationView';
import { StnFinePrint, StnOperator, StnSources } from './GlacierStationCard';
import { fmt0, fmt1 } from './glacierView';
import {
  dzShort, stnBest, stnLines, stnLinesGeoJson, stnMainValues, stnMatch, STN_MATCH_KEYS, STN_MATCH_NEAR_KM, STN_MATCH_DZ_M, type StnMatch,
} from './glacierStationMap';

const SRC = 'glsn-lines', LAY_CASE = 'glsn-lines-case', LAY = 'glsn-lines-l';
/** The sheet map's own top layer: the station layer waits for it (the style and the outline layers are in). */
const READY_LAYER = 'gls-now-line-l';

function Num({ n, best, small = false }: { n: number; best: boolean; small?: boolean }) {
  return <span className={`gl-sn${best ? ' is-best' : ''}${small ? ' is-small' : ''}`} aria-hidden="true">{n}</span>;
}

function Meters({ m }: { m: StnMatch }) {
  return (
    <span className="gl-sl-meters">
      {STN_MATCH_KEYS.map(([k, label]) => (
        <span key={k} className="gl-sl-meter" role="img" aria-label={`${label} ${m[k]} von 3`}>
          <span aria-hidden="true">{label}</span>
          <span className="gl-sl-bars" aria-hidden="true">{[1, 2, 3].map((i) => <i key={i} className={i <= m[k] ? 'is-on' : ''} />)}</span>
        </span>
      ))}
    </span>
  );
}

/** Elevation strip: the glacier's range as a band with its median, each station as a numbered dot at its elevation. */
function Strip({ z, stations, best }: { z: readonly [number, number, number]; stations: readonly StnViewStation[]; best: string | null }) {
  const W = 300, X0 = 12, X1 = 288;
  const elevs = stations.map((s) => s.elev);
  const lo = Math.floor((Math.min(z[0], ...elevs) - 60) / 100) * 100, hi = Math.ceil((Math.max(z[2], ...elevs) + 60) / 100) * 100;
  const x = (m: number) => X0 + ((m - lo) * (X1 - X0)) / Math.max(1, hi - lo);
  const label = `Höhe von ${fmt0(lo)} bis ${fmt0(hi)} m: Gletscher ${fmt0(z[0])} bis ${fmt0(z[2])} m, Mitte ${fmt0(z[1])} m; ${stations.map((s, i) => `Station ${i + 1} ${s.name} auf ${fmt0(s.elev)} m`).join(', ')}`;
  return (
    <figure className="gl-sl-strip">
      <figcaption>Höhe der Stationen</figcaption>
      <svg viewBox={`0 0 ${W} 60`} role="img" aria-label={label}>
        <line x1={X0} x2={X1} y1="28" y2="28" className="gl-sl-strip-rail" />
        <rect x={x(z[0])} y="20" width={Math.max(2, x(z[2]) - x(z[0]))} height="16" rx="8" className="gl-sl-strip-ice" />
        <line x1={x(z[1])} x2={x(z[1])} y1="16" y2="40" className="gl-sl-strip-mid" />
        <text x={(x(z[0]) + x(z[2])) / 2} y="11" textAnchor="middle" className="gl-sl-strip-t">Gletscher</text>
        {stations.map((s, i) => (
          <g key={s.id} className={`gl-sl-strip-dot${s.id === best ? ' is-best' : ''}`}>
            <circle cx={x(s.elev)} cy="28" r="8" />
            <text x={x(s.elev)} y="31.5" textAnchor="middle">{i + 1}</text>
          </g>
        ))}
        <text x={X0} y="56" className="gl-sl-strip-t">{fmt0(lo)} m</text>
        <text x={X1} y="56" textAnchor="end" className="gl-sl-strip-t">{fmt0(hi)} m</text>
      </svg>
    </figure>
  );
}

/** What a marker shows: the number, on the desktop a card above it, on the phone one value. */
function MarkerBody({ s, n, best, sel, onSelect }: { s: StnViewStation; n: number; best: boolean; sel: boolean; onSelect: () => void }) {
  const vals = stnMainValues(s);
  return (
    <>
      <span className="gl-sm-card" aria-hidden="true">
        <b>{s.name} <span>{fmt0(s.elev)} m</span></b>
        {vals.length ? (
          <span className="gl-sm-vals">{vals.map((v, i) => <span key={v.q} className={i === 0 ? 'is-lead' : ''}><small>{v.label}</small>{v.text}</span>)}</span>
        ) : <span className="gl-sm-none">Keine Daten</span>}
        <small className="gl-sm-dz">{dzShort(s.dz)}</small>
      </span>
      <span className="gl-sm-pill" aria-hidden="true">{vals[0]?.text ?? '—'}</span>
      <i className="gl-sm-stem" aria-hidden="true" />
      <button type="button" className={`gl-sm-pin${best ? ' is-best' : ''}`} aria-pressed={sel} onClick={onSelect}
        aria-label={`Station ${n}: ${s.name}, ${fmt0(s.elev)} m, ${fmt1(s.km)} km vom Rand${vals.length ? `, ${vals.map((v) => `${v.label} ${v.text}`).join(', ')}` : ', keine Daten'}`}>
        {n}
      </button>
    </>
  );
}

export interface StationsHeuteProps {
  g: GlacierCatalogEntry;
  view: StnView;
  map: maplibregl.Map | null;
  geometry: GeoJSON.Geometry | null;
  /** Layer "Stationen" on. */
  show: boolean;
  view3d: boolean;
  nowMs: number;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export default function GlacierStationsHeute({ g, view, map, geometry, show, view3d, nowMs, selected, onSelect }: StationsHeuteProps) {
  const stations = view.stations;
  const best = useMemo(() => stnBest(stations, g.z, nowMs), [stations, g.z, nowMs]);
  const lines = useMemo(() => stnLines(stations, geometry), [stations, geometry]);
  const stationsKey = stations.map((s) => `${s.id}@${s.lon},${s.lat}`).join('|');

  // --- the dashed lines: one GeoJSON source, a dark casing under a white dash (readable on imagery and on the light map) ---
  useEffect(() => {
    if (!map || !show) return;
    let added = false;
    const add = () => {
      if (added || !map.getLayer(READY_LAYER)) return;
      added = true;
      const data = stnLinesGeoJson(lines);
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      if (src) src.setData(data);
      else {
        map.addSource(SRC, { type: 'geojson', data });
        map.addLayer({ id: LAY_CASE, type: 'line', source: SRC, layout: { 'line-cap': 'round' }, paint: { 'line-color': '#2C2A26', 'line-width': 4.5, 'line-opacity': 0.35 } });
        map.addLayer({ id: LAY, type: 'line', source: SRC, paint: { 'line-color': '#FFFFFF', 'line-width': 2.2, 'line-dasharray': [2.5, 2] } });
      }
    };
    add();
    if (!added) map.on('idle', add);
    return () => {
      map.off('idle', add);
      try {
        if (map.getLayer(LAY)) map.removeLayer(LAY);
        if (map.getLayer(LAY_CASE)) map.removeLayer(LAY_CASE);
        if (map.getSource(SRC)) map.removeSource(SRC);
      } catch { /* the map is already gone */ }
    };
  }, [map, show, lines]);

  // --- DOM markers: one per station (content via portal) and one distance label per line ---
  const [els, setEls] = useState<Array<{ id: string; el: HTMLElement }>>([]);
  const markers = useRef(new Map<string, maplibregl.Marker>());
  useEffect(() => {
    if (!map || !show) { setEls([]); return; }
    const made: maplibregl.Marker[] = [];
    const out: Array<{ id: string; el: HTMLElement }> = [];
    for (const s of stations) {
      const el = document.createElement('div');
      el.className = 'gl-sm';
      el.dataset.station = s.id;
      const mk = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([s.lon, s.lat]).addTo(map);
      markers.current.set(s.id, mk); made.push(mk); out.push({ id: s.id, el });
    }
    for (const l of lines) {
      const el = document.createElement('div');
      el.className = 'gl-sm-km';
      el.textContent = `${fmt1(l.km)} km`;
      el.setAttribute('aria-hidden', 'true');
      made.push(new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(l.mid).addTo(map));
    }
    setEls(out);
    return () => { for (const m of made) m.remove(); markers.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, show, stationsKey, lines]);
  useEffect(() => {
    for (const { id, el } of els) {
      el.classList.toggle('is-3d', view3d);
      el.classList.toggle('is-sel', id === selected);
      el.style.zIndex = id === selected ? '3' : id === best ? '2' : '1';
    }
  }, [els, view3d, selected, best]);

  // a tap on a marker on the phone brings its sheet into view
  const sheetRef = useRef<HTMLLIElement | null>(null);
  const fromMap = useRef(false);
  useEffect(() => {
    if (!fromMap.current || !selected) return;
    fromMap.current = false;
    sheetRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const byId = new Map(stations.map((s, i) => [s.id, { s, n: i + 1 }]));
  return (
    <section className="gl-sp" aria-label="Stationen am Gletscher">
      <p className="gl-sp-head">Stationen <span>antippen hebt sie in der Karte hervor</span></p>
      <p className="gl-honest gl-sp-note">{GLACIER_STN_SITE_NOTE}.</p>
      <ul className="gl-sl">
        {stations.map((s, i) => {
          const m = stnMatch(s, g.z, nowMs), isBest = s.id === best, isSel = s.id === selected, vals = stnMainValues(s);
          return (
            <li key={s.id} ref={isSel ? sheetRef : undefined} className={`gl-sl-item${isSel ? ' is-sel' : ''}${isBest ? ' is-best' : ''}`} data-station={s.id} data-origin="measured">
              <span className="gl-sl-grip" aria-hidden="true" />
              <button type="button" className="gl-sl-head" aria-pressed={isSel} onClick={() => onSelect(isSel ? null : s.id)}>
                <Num n={i + 1} best={isBest} />
                <span className="gl-sl-name">
                  <b>{s.name}</b>
                  <small>{fmt0(s.elev)} m{s.ms != null ? ` · ${ageText(nowMs - s.ms)}` : ''}</small>
                </span>
                <span className="gl-sl-row" aria-hidden="true">{vals[0]?.text ?? 'Keine Daten'}<small>{fmt1(s.km)} km ›</small></span>
              </button>
              <div className="gl-sl-body">
                <dl className="gl-stn-values">
                  {s.values.map((v) => (
                    <div key={v.q}>
                      <dt>{v.label}</dt>
                      {v.text != null
                        ? <dd><b className="gl-num" data-origin="measured">{v.text}</b></dd>
                        : <dd className="gl-stn-none"><strong>Keine Daten.</strong> {v.why ? `${v.why[0].toUpperCase()}${v.why.slice(1)}.` : ''}</dd>}
                    </div>
                  ))}
                </dl>
                <Meters m={m} />
                <p className="gl-stn-where">{(() => { const w = whereText(s.km, view.from); return `${w[0].toUpperCase()}${w.slice(1)}, ${dzText(s.dz)}.`; })()}</p>
                <StnOperator s={s} />
                <button type="button" className="gl-sl-close" onClick={() => onSelect(null)}>Schließen</button>
              </div>
            </li>
          );
        })}
      </ul>
      <Strip z={g.z} stations={stations} best={best} />
      <p className="gl-fine">
        Striche: Nähe voll bis {fmt0(STN_MATCH_NEAR_KM[0])} km, zwei bis {fmt0(STN_MATCH_NEAR_KM[1])} km, einer bis {fmt0(STN_MATCH_NEAR_KM[2])} km vom Rand;
        Höhe voll innerhalb der Höhenspanne des Gletschers, zwei bis {fmt0(STN_MATCH_DZ_M)} m darüber oder darunter, sonst einer; aktuell voll unter
        einer Stunde, zwei unter drei Stunden. Der gefüllte Kreis ist die Station, die nach diesen Strichen am besten passt.
      </p>
      <StnFinePrint view={view} lead="Der Streifen zeigt die Höhenspanne des Gletschers, der Strich seine mittlere Höhe, die Kreise die Stationen." />
      <StnSources view={view} />
      {els.map(({ id, el }) => {
        const it = byId.get(id);
        return it ? createPortal(<MarkerBody s={it.s} n={it.n} best={id === best} sel={id === selected} onSelect={() => { fromMap.current = true; onSelect(id === selected ? null : id); }} />, el, id) : null;
      })}
    </section>
  );
}
