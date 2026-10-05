/**
 * AW-5 — Map of Autobahnwetter: real MapLibre (basemap/steering like `FireMap.tsx`), dark style of the same provider
 * the app already uses (OpenFreeMap). Corridors from `static/corridors.json`, points from `obs/<slot>.json`.
 *
 * Marker language (design `reference/autobahnwetter-desktop.dc.html`): filled dot = DWD road measurement, hatched =
 * no valid measurement / unknown state (never like "dry", D-04), selected = larger with a light ring. Ring markers for
 * AT/CH forecast points come with AW-6. Small plain dots on the selected corridor = forecast points of the weather
 * forecast (AW-6.1b, air temperature class — other colours than the measured road classes). No WebGL of our own:
 * plain GeoJSON layers and canvas-drawn icons.
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { RoadPoint } from './roadContract';
import type { RoadClass } from './roadClasses';
import type { RoadCorridor } from './roadClient';
import { ROAD_CLASS_COLOR, f1 } from './roadView';

const STYLE = 'https://tiles.openfreemap.org/styles/dark';
const DACH_BOUNDS: [number, number, number, number] = [5.5, 46.8, 15.5, 55.2];
const CLASSES: RoadClass[] = ['ice', 'frost', 'wet', 'dry', 'unknown', 'nodata'];

export interface RoadMapLayers { zust: boolean; temp: boolean; fog: boolean; warn: boolean; bl: boolean; fc: boolean }

/** Forecast point of the corridor axis (AW-6.1b): a small dot in the colour of the forecast AIR class. */
export interface RoadFcDot { id: string; lon: number; lat: number; color: string | null }

interface Props {
  corridors: readonly RoadCorridor[];
  corridor: RoadCorridor | null;
  points: readonly RoadPoint[];
  inCorridor: ReadonlySet<string>;
  selectedId: string | null;
  stale: boolean;
  layers: RoadMapLayers;
  warnAreas: GeoJSON.FeatureCollection | null;
  /** Map padding for overlays (band at the bottom, pill/legend on top). */
  padding: { top: number; bottom: number; left: number; right: number };
  onSelect: (id: string) => void;
  onMap?: (map: maplibregl.Map | null) => void;
  /** Callout above the selected station (design): name and one line. */
  callout?: { lon: number; lat: number; name: string; line: string; color: string | null } | null;
  /** Forecast points of the selected corridor (weather forecast of buscosun Fusion, layer `fc`). */
  fcDots?: readonly RoadFcDot[];
}

function dotFc(dots: readonly RoadFcDot[], sel: string | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: dots.map((d) => ({
      type: 'Feature', properties: { id: d.id, color: d.color ?? '#8B8474', sel: d.id === sel ? 1 : 0 },
      geometry: { type: 'Point', coordinates: [d.lon, d.lat] },
    })),
  };
}
const NO_DOTS: readonly RoadFcDot[] = [];

/** One marker icon per class (+ grey "stale" variant): canvas, device pixel ratio 2. */
function markerImage(cls: RoadClass, stale: boolean): ImageData {
  const px = 30, r = 13;
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d')!;
  g.beginPath(); g.arc(px / 2, px / 2, r, 0, Math.PI * 2); g.closePath();
  if (cls === 'nodata' || cls === 'unknown') {
    g.save(); g.clip();
    g.fillStyle = '#3A3833'; g.fillRect(0, 0, px, px);
    g.strokeStyle = '#8B8474'; g.lineWidth = 3;
    for (let x = -px; x < px * 2; x += 6) { g.beginPath(); g.moveTo(x, px); g.lineTo(x + px, 0); g.stroke(); }
    g.restore();
  } else {
    g.fillStyle = stale ? '#8B95A3' : ROAD_CLASS_COLOR[cls];
    g.fill();
  }
  g.beginPath(); g.arc(px / 2, px / 2, r, 0, Math.PI * 2);
  g.lineWidth = 3; g.strokeStyle = '#0B0E12'; g.stroke();
  return g.getImageData(0, 0, px, px);
}

function installImages(map: maplibregl.Map) {
  for (const cls of CLASSES) for (const stale of [false, true]) {
    const id = `aw-${cls}${stale ? '-stale' : ''}`;
    if (!map.hasImage(id)) map.addImage(id, markerImage(cls, stale), { pixelRatio: 2 });
  }
}

function corridorFc(corridors: readonly RoadCorridor[], sel: string | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: corridors.map((c) => ({
      type: 'Feature', properties: { id: c.id, sel: c.id === sel ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: c.line },
    })),
  };
}

function pointFc(points: readonly RoadPoint[], inC: ReadonlySet<string>, sel: string | null, stale: boolean, zust: boolean): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => {
      const cls = zust ? p.cls : (p.cls === 'nodata' || p.cls === 'unknown' ? p.cls : 'dry');
      const neutral = !zust && cls === 'dry';
      return {
        type: 'Feature',
        properties: {
          id: p.id, cls, icon: `aw-${cls}${stale || neutral ? '-stale' : ''}`,
          inC: inC.has(p.id) ? 1 : 0, sel: p.id === sel ? 1 : 0,
          label: p.rs != null ? `${f1(p.rs)}°` : p.ta != null ? `L ${f1(p.ta)}°` : '—',
          fog: p.vis != null && p.vis < 150 ? 1 : 0,
        },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      };
    }),
  };
}

/** The dark style labels in English (`name_en`); the deck is German ⇒ `name:de`, else the local name. */
function germanLabels(map: maplibregl.Map) {
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type !== 'symbol') continue;
    const tf = map.getLayoutProperty(l.id, 'text-field');
    if (tf && JSON.stringify(tf).includes('name_en')) map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:de'], ['get', 'name'], ['get', 'name_en']]);
  }
}

function boundsOf(c: RoadCorridor): maplibregl.LngLatBoundsLike {
  let w = 180, s = 90, e = -180, n = -90;
  for (const [x, y] of c.line) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
  return [w, s, e, n];
}

export default function RoadMap(props: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const calloutRef = useRef<maplibregl.Marker | null>(null);
  /** Set once on `load`. NOT `map.loaded()`: a `setData` in the same render marks the source busy, so `loaded()` is
   *  false exactly when a corridor change needs the fit (review finding #5). */
  const readyRef = useRef(false);
  /** Inputs of the last setData per source — only changed references are written (CLAUDE.md: setData loops). */
  const lastRef = useRef<{ corr?: unknown; pts?: unknown[]; warn?: unknown; fc?: unknown[] }>({});

  function apply(map: maplibregl.Map) {
    if (!map.isStyleLoaded()) return;
    const p = propsRef.current;
    installImages(map);
    const last = lastRef.current;
    const set = (id: string, make: () => GeoJSON.FeatureCollection, changed: boolean) => {
      const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
      if (!src) map.addSource(id, { type: 'geojson', data: make() });
      else if (changed) src.setData(make());
    };
    const corrKey = [p.corridors, p.corridor?.id ?? null];
    const ptsKey = [p.points, p.inCorridor, p.selectedId, p.stale, p.layers.zust];
    const warnKey = p.layers.warn ? p.warnAreas : null;
    const same = (a: unknown[] | undefined, b: unknown[]) => !!a && a.length === b.length && a.every((v, i) => v === b[i]);
    set('aw-corridors', () => corridorFc(p.corridors, p.corridor?.id ?? null), !same(last.corr as unknown[] | undefined, corrKey));
    set('aw-points', () => pointFc(p.points, p.inCorridor, p.selectedId, p.stale, p.layers.zust), !same(last.pts, ptsKey));
    set('aw-warn', () => (warnKey ?? { type: 'FeatureCollection', features: [] }) as GeoJSON.FeatureCollection, last.warn !== warnKey);
    const dots = p.layers.fc ? (p.fcDots ?? NO_DOTS) : NO_DOTS;
    const fcKey = [dots, p.selectedId];
    set('aw-fc', () => dotFc(dots, p.selectedId), !same(last.fc, fcKey));
    lastRef.current = { corr: corrKey, pts: ptsKey, warn: warnKey, fc: fcKey };
    if (!map.getLayer('aw-warn-fill')) {
      map.addLayer({ id: 'aw-warn-fill', type: 'fill', source: 'aw-warn', paint: { 'fill-color': '#E39A3B', 'fill-opacity': 0.12 } });
      map.addLayer({ id: 'aw-warn-line', type: 'line', source: 'aw-warn', paint: { 'line-color': '#E39A3B', 'line-width': 1.2, 'line-dasharray': [4, 3] } });
      map.addLayer({ id: 'aw-corr-base', type: 'line', source: 'aw-corridors', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#39414D', 'line-width': 2.4 } });
      map.addLayer({ id: 'aw-corr-glow', type: 'line', source: 'aw-corridors', filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FAF6EA', 'line-width': 11, 'line-opacity': 0.16 } });
      map.addLayer({ id: 'aw-corr-sel', type: 'line', source: 'aw-corridors', filter: ['==', ['get', 'sel'], 1], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#F3EDDF', 'line-width': 3.6 } });
      map.addLayer({
        id: 'aw-fc', type: 'circle', source: 'aw-fc',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'sel'], 1], 8, 4.5], 'circle-color': ['get', 'color'],
          'circle-stroke-color': ['case', ['==', ['get', 'sel'], 1], '#FAF6EA', '#0B0E12'], 'circle-stroke-width': ['case', ['==', ['get', 'sel'], 1], 2.5, 1.2],
        },
      });
      map.addLayer({ id: 'aw-sel-halo', type: 'circle', source: 'aw-points', filter: ['==', ['get', 'sel'], 1], paint: { 'circle-radius': 16, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#FAF6EA', 'circle-stroke-width': 3, 'circle-stroke-opacity': 0.9 } });
      map.addLayer({
        id: 'aw-points', type: 'symbol', source: 'aw-points',
        layout: {
          'icon-image': ['get', 'icon'], 'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'icon-size': ['case', ['==', ['get', 'sel'], 1], 1.47, ['==', ['get', 'inC'], 1], 1, 0.67],
          'symbol-sort-key': ['+', ['get', 'inC'], ['*', 2, ['get', 'sel']]],
        },
        paint: { 'icon-opacity': ['case', ['==', ['get', 'inC'], 1], 1, 0.55] },
      });
      map.addLayer({
        id: 'aw-labels', type: 'symbol', source: 'aw-points', filter: ['all', ['==', ['get', 'inC'], 1], ['==', ['get', 'sel'], 0]],
        layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0.9, -1.1], 'text-anchor': 'left', 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': false },
        paint: { 'text-color': '#E9E4D6', 'text-halo-color': '#0B0E12', 'text-halo-width': 1.6 },
      });
      map.addLayer({
        id: 'aw-fog', type: 'symbol', source: 'aw-points', filter: ['==', ['get', 'fog'], 1],
        layout: { 'text-field': '≡', 'text-size': 16, 'text-offset': [-1.2, -0.2], 'text-font': ['Noto Sans Regular'], 'text-allow-overlap': true },
        paint: { 'text-color': '#C9D2DC', 'text-halo-color': '#0B0E12', 'text-halo-width': 1 },
      });
    }
    const vis = (id: string, on: boolean) => { if (map.getLayoutProperty(id, 'visibility') !== (on ? 'visible' : 'none')) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('aw-labels', p.layers.temp);
    vis('aw-fog', p.layers.fog);
  }

  useEffect(() => {
    if (!hostRef.current || mapRef.current) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const map = new maplibregl.Map({
      container: hostRef.current, style: STYLE, bounds: DACH_BOUNDS, fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true }, pitchWithRotate: false, dragRotate: false, fadeDuration: reduce ? 0 : 300,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) (window as unknown as { __roadMap?: maplibregl.Map }).__roadMap = map;
    map.on('style.load', () => germanLabels(map));
    // Test hooks (no behaviour): time of the last idle frame and the visible bounds (verify:road-ui M3).
    map.on('idle', () => {
      if (!hostRef.current) return;
      hostRef.current.dataset.idle = String(Date.now());
      hostRef.current.dataset.bounds = map.getBounds().toArray().flat().map((v) => v.toFixed(4)).join(',');
    });
    map.on('load', () => {
      readyRef.current = true;
      apply(map);
      map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]').forEach((d) => d.removeAttribute('open'));
      const c = propsRef.current.corridor;
      if (c) map.fitBounds(boundsOf(c), { padding: propsRef.current.padding, duration: 0 });
    });
    // After a style (re)load our layers are gone ⇒ re-install; any other styledata event is ignored.
    map.on('styledata', () => { if (!map.getLayer('aw-points')) { lastRef.current = {}; apply(map); } });
    map.on('click', (ev) => {
      // A station wins over a forecast dot under the same pixel.
      const hits = map.getLayer('aw-points') ? map.queryRenderedFeatures(ev.point, { layers: ['aw-points'] }) : [];
      const dots = !hits.length && map.getLayer('aw-fc') ? map.queryRenderedFeatures(ev.point, { layers: ['aw-fc'] }) : [];
      const id = (hits[0] ?? dots[0])?.properties?.id;
      if (typeof id === 'string') propsRef.current.onSelect(id);
    });
    map.on('mousemove', (ev) => {
      const hit = map.getLayer('aw-points') && map.queryRenderedFeatures(ev.point, { layers: map.getLayer('aw-fc') ? ['aw-points', 'aw-fc'] : ['aw-points'] }).length > 0;
      map.getCanvas().style.cursor = hit ? 'pointer' : '';
    });
    props.onMap?.(map);
    return () => { props.onMap?.(null); map.remove(); mapRef.current = null; readyRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Data / selection / layers ⇒ sources (idempotent).
  useEffect(() => {
    const map = mapRef.current;
    if (map) apply(map);
  });

  // Callout: one DOM marker, moved and refilled (no React portal into the map).
  const co = props.callout;
  const coKey = co ? `${co.lon},${co.lat},${co.name},${co.line},${co.color}` : '';
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!co) { calloutRef.current?.remove(); calloutRef.current = null; return; }
    const el = calloutRef.current?.getElement() ?? document.createElement('div');
    el.className = 'aw-callout';
    el.replaceChildren();
    const b = document.createElement('b'); b.textContent = co.name;
    const line = document.createElement('span');
    const dot = document.createElement('i');
    if (co.color) dot.style.background = co.color; else dot.className = 'is-hatched';
    line.append(dot, document.createTextNode(co.line));
    el.append(b, line);
    // Design: near the right edge the callout sits LEFT of the station (else it is clipped).
    const place = () => {
      const x = map.project([co.lon, co.lat]).x;
      const left = x > map.getContainer().clientWidth - 210;
      const cur = calloutRef.current;
      if (cur && (cur as unknown as { _awLeft?: boolean })._awLeft === left) { cur.setLngLat([co.lon, co.lat]); return; }
      cur?.remove();
      const m = new maplibregl.Marker({ element: el, anchor: left ? 'bottom-right' : 'bottom-left', offset: left ? [-14, -14] : [14, -14] }).setLngLat([co.lon, co.lat]).addTo(map);
      (m as unknown as { _awLeft?: boolean })._awLeft = left;
      calloutRef.current = m;
    };
    place();
    map.on('moveend', place);
    return () => { map.off('moveend', place); };
  }, [coKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Corridor change ⇒ fit to it. Before `load` the load handler fits to the corridor of that moment.
  const corrId = props.corridor?.id ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const c = propsRef.current.corridor;
    if (!map || !c || !readyRef.current) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    map.fitBounds(boundsOf(c), { padding: propsRef.current.padding, duration: reduce ? 0 : 600 });
  }, [corrId]);

  return <div ref={hostRef} className="aw-map-canvas" />;
}
