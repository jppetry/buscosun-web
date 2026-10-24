/**
 * GL-1 — Map of the glacier situation page: real MapLibre on the light OpenFreeMap style. All glaciers are circles sized by area
 * and coloured by the chosen metric's bucket (ramp light → dark); a glacier WITHOUT a value is a dashed ring, never a faint
 * colour (README-gletscher.md "Zeichensprache"). From zoom 9 the outlines of the regions in view replace the circles
 * (levels L1/L2/L3 by zoom, loaded lazily per region, each outline coloured like its circle). No shader, no custom layer.
 * `view = '3d'` (default of the page) lays the same map on Terrarium terrain with hillshade and a tilted camera — built-in
 * MapLibre means like the sheet map (`GlacierSheetMap.tsx`); a terrain failure falls back to 2D via `onView3dFailed`.
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GlacierOutlineFC } from './glacierClient';
import { GLACIER_RAMPS } from './glacierView';

const STYLE = 'https://tiles.openfreemap.org/styles/positron';
/** DACH glacier area with a margin (the first view fits the Alps). */
export const GLACIER_START_BOUNDS: [number, number, number, number] = [6.0, 45.7, 13.9, 47.9];
export const GLACIER_MAX_BOUNDS: [[number, number], [number, number]] = [[2.5, 43.5], [17.5, 49.8]];
const OUTLINE_MIN_ZOOM = 9;
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
/** The overview starts at zoom ≈ 6.5, where the Alps need more lift than the sheet's 1.3 to read as relief. */
const OVERVIEW_EXAGGERATION = 1.8;
const PITCH_3D = 50, BEARING_3D = -12;
const levelOf = (z: number): 1 | 2 | 3 => (z >= 13 ? 3 : z >= 11 ? 2 : 1);

export interface GlacierMapFeature { id: string; lon: number; lat: number; km2: number; k: 'A' | 'B' | 'C'; b: number; name: string | null }
export type RegionBoxes = Record<string, [number, number, number, number]>;

interface Props {
  features: readonly GlacierMapFeature[];
  ramp: 'loss' | 'snow';
  selectedId: string | null;
  onSelect: (id: string) => void;
  regionBoxes: RegionBoxes;
  /** Loads one outline file of a region (memoised by the client); `null` = not there. */
  loadOutline: (region: string, level: 1 | 2 | 3) => Promise<GlacierOutlineFC | null>;
  /** id → bucket for the outline colour (same buckets as the circles). */
  bucketOf: (id: string) => number;
  padding?: { top: number; bottom: number; left: number; right: number };
  onMap?: (m: maplibregl.Map | null) => void;
  view?: '2d' | '3d';
  onView3dFailed?: () => void;
}

function dashedRing(): ImageData {
  const px = 64, c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d')!;
  g.beginPath(); g.arc(px / 2, px / 2, px / 2 - 5, 0, Math.PI * 2);
  g.fillStyle = 'rgba(214,236,248,0.92)'; g.fill();
  g.setLineDash([7, 6]); g.lineWidth = 3.5; g.strokeStyle = '#4F93BE'; g.stroke();
  return g.getImageData(0, 0, px, px);
}
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const colorExpr = (ramp: 'loss' | 'snow'): maplibregl.ExpressionSpecification => {
  const r = GLACIER_RAMPS[ramp];
  return ['match', ['get', 'b'], 0, r[0], 1, r[1], 2, r[2], 3, r[3], 4, r[4], '#D6ECF8'];
};

export default function GlacierMap({ features, ramp, selectedId, onSelect, regionBoxes, loadOutline, bucketOf, padding, onMap, view = '2d', onView3dFailed }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const latest = useRef({ features, ramp, selectedId, regionBoxes, loadOutline, bucketOf });
  latest.current = { features, ramp, selectedId, regionBoxes, loadOutline, bucketOf };
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const viewRef = useRef(view);
  viewRef.current = view;
  const onFailRef = useRef(onView3dFailed);
  onFailRef.current = onView3dFailed;

  const apply3d = (on: boolean, animate: boolean, first = false) => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    try {
      if (on) {
        map.setTerrain({ source: 'gl-dem', exaggeration: OVERVIEW_EXAGGERATION });
        map.setLayoutProperty('gl-hill', 'visibility', 'visible');
        map.dragRotate.enable(); map.touchZoomRotate.enableRotation(); map.touchPitch.enable();
        // first view: tilted, closer and centred on the glacier belt (a tilted fit of the 2D bounds shows mostly lowland)
        if (first) map.easeTo({ center: [10.0, 46.5], zoom: map.getZoom() + 0.3, pitch: PITCH_3D, bearing: BEARING_3D, duration: 1200 });
        else map.easeTo({ pitch: PITCH_3D, bearing: BEARING_3D, duration: animate ? 700 : 0 });
      } else {
        map.setTerrain(null);
        map.setLayoutProperty('gl-hill', 'visibility', 'none');
        map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); map.touchPitch.disable();
        map.easeTo({ pitch: 0, bearing: 0, duration: animate ? 500 : 0 });
      }
    } catch { onFailRef.current?.(); }
  };
  const loaded = useRef(new Map<string, GlacierOutlineFC | null>());
  const wanted = useRef('');

  const pointsFC = (): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features: latest.current.features.map((f) => ({ type: 'Feature', id: undefined, properties: { id: f.id, km2: f.km2, k: f.k, b: f.b, n: f.name ?? '' }, geometry: { type: 'Point', coordinates: [f.lon, f.lat] } })),
  });

  /** Outlines of the regions in view at the zoom's level; re-run after a move, a zoom or a metric change. */
  const refreshOutlines = () => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const z = map.getZoom();
    const src = map.getSource('gl-outlines') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    if (z < OUTLINE_MIN_ZOOM) { src.setData(EMPTY); wanted.current = ''; return; }
    const lv = levelOf(z);
    const b = map.getBounds();
    const regions = Object.entries(latest.current.regionBoxes).filter(([, [w, s, e, n]]) => w <= b.getEast() && e >= b.getWest() && s <= b.getNorth() && n >= b.getSouth()).map(([r]) => r);
    const key = `${lv}|${regions.join(',')}|${latest.current.ramp}|${latest.current.features.length ? latest.current.features[0].b : ''}`;
    const draw = () => {
      const feats: GeoJSON.Feature[] = [];
      for (const r of regions) {
        const fc = loaded.current.get(`${r}|${lv}`);
        if (!fc) continue;
        for (const f of fc.features) feats.push({ type: 'Feature', properties: { id: f.properties.id, b: latest.current.bucketOf(f.properties.id ?? '') }, geometry: f.geometry });
      }
      (map.getSource('gl-outlines') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: feats });
    };
    wanted.current = key;
    draw();
    for (const r of regions) {
      const k = `${r}|${lv}`;
      if (loaded.current.has(k)) continue;
      loaded.current.set(k, null);
      latest.current.loadOutline(r, lv).then((fc) => { loaded.current.set(k, fc); if (mapRef.current === map) draw(); }, () => { loaded.current.delete(k); });
    }
  };

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current, style: STYLE, bounds: GLACIER_START_BOUNDS, fitBoundsOptions: { padding: 8 }, maxBounds: GLACIER_MAX_BOUNDS,
      attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, maxZoom: 15, minZoom: 4,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    onMap?.(map);
    map.on('load', () => {
      if (mapRef.current !== map) return;
      map.addImage('gl-novalue', dashedRing(), { pixelRatio: 2 });
      try {
        map.addSource('gl-dem', { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
        const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
        map.addLayer({ id: 'gl-hill', type: 'hillshade', source: 'gl-dem', layout: { visibility: 'none' }, paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#4A4234', 'hillshade-accent-color': '#6B5A45', 'hillshade-illumination-anchor': 'map', 'hillshade-illumination-direction': 315 } }, firstSymbol);
      } catch { onFailRef.current?.(); }
      map.addSource('gl-points', { type: 'geojson', data: pointsFC() });
      map.addSource('gl-outlines', { type: 'geojson', data: EMPTY });
      map.addSource('gl-selected', { type: 'geojson', data: EMPTY });
      const r = latest.current.ramp;
      map.addLayer({ id: 'gl-out-fill', type: 'fill', source: 'gl-outlines', minzoom: OUTLINE_MIN_ZOOM, paint: { 'fill-color': colorExpr(r), 'fill-opacity': 0.82 } });
      map.addLayer({ id: 'gl-out-line', type: 'line', source: 'gl-outlines', minzoom: OUTLINE_MIN_ZOOM, paint: { 'line-color': '#2C2A26', 'line-width': 0.8, 'line-opacity': 0.7 } });
      map.addLayer({
        id: 'gl-value', type: 'circle', source: 'gl-points', filter: ['>=', ['get', 'b'], 0],
        paint: {
          'circle-color': colorExpr(r),
          'circle-radius': ['interpolate', ['exponential', 1.6], ['zoom'], 4, ['max', 2.2, ['*', ['sqrt', ['get', 'km2']], 0.9]], 12, ['max', 4.5, ['*', ['sqrt', ['get', 'km2']], 9]]],
          'circle-stroke-color': '#FAF6EA', 'circle-stroke-width': 1.2,
          'circle-opacity': ['interpolate', ['linear'], ['zoom'], 8.5, 0.95, 10.5, 0],
          'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 8.5, 1, 10.5, 0],
        },
      });
      map.addLayer({
        id: 'gl-none', type: 'symbol', source: 'gl-points', filter: ['<', ['get', 'b'], 0],
        layout: {
          'icon-image': 'gl-novalue', 'icon-allow-overlap': true, 'icon-ignore-placement': true,
          'icon-size': ['interpolate', ['linear'], ['zoom'], 4, ['max', 0.13, ['min', 0.7, ['*', ['sqrt', ['get', 'km2']], 0.05]]], 12, ['max', 0.3, ['min', 2, ['*', ['sqrt', ['get', 'km2']], 0.3]]]],
        },
        paint: { 'icon-opacity': ['interpolate', ['linear'], ['zoom'], 8.5, 1, 10.5, 0] },
      });
      map.addLayer({
        id: 'gl-label', type: 'symbol', source: 'gl-points', minzoom: 7.5, filter: ['all', ['==', ['get', 'k'], 'A'], ['!=', ['get', 'n'], '']],
        layout: { 'text-field': ['get', 'n'], 'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
        paint: { 'text-color': '#2C2A26', 'text-halo-color': '#F3EEE1', 'text-halo-width': 1.6 },
      });
      map.addLayer({ id: 'gl-sel', type: 'circle', source: 'gl-selected', paint: { 'circle-radius': 12, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#2C2A26', 'circle-stroke-width': 2.5 } });
      const pick = (e: maplibregl.MapLayerMouseEvent) => {
        const f = e.features?.[0];
        const id = f?.properties?.id as string | undefined;
        if (id) onSelectRef.current(id);
      };
      for (const l of ['gl-value', 'gl-none', 'gl-out-fill']) {
        map.on('click', l, pick);
        map.on('mouseenter', l, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', l, () => { map.getCanvas().style.cursor = ''; });
      }
      ready.current = true;
      map.on('moveend', refreshOutlines);
      refreshOutlines();
      syncSelected();
      // 3D start: the flat map with its circles comes first (terrain holds back the whole frame until its DEM tiles are
      // there); the hillshade fetches the DEM in 2D, and once it is loaded the camera tilts into the terrain view
      if (viewRef.current === '3d') {
        try { map.setLayoutProperty('gl-hill', 'visibility', 'visible'); } catch { /* no DEM layer — stays 2D */ }
        const tilt = () => {
          if (mapRef.current !== map || !map.getSource('gl-dem') || !map.isSourceLoaded('gl-dem')) return;
          map.off('sourcedata', tilt);
          if (viewRef.current === '3d' && !map.getTerrain()) apply3d(true, true, true);
        };
        map.on('sourcedata', tilt);
      }
    });
    return () => { ready.current = false; onMap?.(null); map.remove(); if (mapRef.current === map) mapRef.current = null; loaded.current.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncSelected = () => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const f = latest.current.features.find((x) => x.id === latest.current.selectedId);
    (map.getSource('gl-selected') as maplibregl.GeoJSONSource | undefined)?.setData(f
      ? { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [f.lon, f.lat] } }] } : EMPTY);
  };

  // metric / data change: points, colours, outlines
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    (map.getSource('gl-points') as maplibregl.GeoJSONSource | undefined)?.setData(pointsFC());
    for (const l of ['gl-value', 'gl-out-fill']) map.setPaintProperty(l, l === 'gl-value' ? 'circle-color' : 'fill-color', colorExpr(ramp));
    refreshOutlines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, ramp]);

  useEffect(() => {
    syncSelected();
    const map = mapRef.current;
    const f = features.find((x) => x.id === selectedId);
    if (map && ready.current && f) {
      const z = map.getZoom();
      // bring a selected glacier into view without zooming out; centre it in the free part of the map
      map.easeTo({ center: [f.lon, f.lat], zoom: Math.max(z, f.km2 >= 1 ? 9 : 10), padding: padding ?? { top: 0, bottom: 0, left: 0, right: 0 }, duration: 600 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useEffect(() => { apply3d(view === '3d', true); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  return <div ref={box} className="gl-map-canvas" role="img" aria-label={`Karte aller Gletscher in Deutschland, Österreich und der Schweiz${view === '3d' ? ', 3D-Ansicht' : ''}`} />;
}
