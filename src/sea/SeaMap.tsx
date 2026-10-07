/**
 * SW-5 — Map of Seewetter: real MapLibre on the dark OpenFreeMap style (like `RoadMap.tsx`). The sea state is a CWAM
 * field coloured on the CPU (`seaView.colourField`, mercator rows) and handed to MapLibre as an IMAGE source — no
 * shader of our own (plan SW-5). On top: wave arrows (where the waves go), DWD sea areas/coast sections with the
 * warning status, the spots as dots in the class colour of the chosen profile (hatched = no data, never like "passt"),
 * DWD POI stations as rings, and — switch — buscosun Fusion wind arrows at the spots (the WAM model wind is never shown).
 * Without a usable run (dead/killed) there is no surface at all.
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SEA_FIELD_COORDS, SEA_OUT_ROWS, CLASS_COLOR } from './seaView';
import { SEA_MODELS } from './seaContract';
import type { SeaClass } from './seaProfiles';
import type { SeaAreaFeature } from './seaClient';

const STYLE = 'https://tiles.openfreemap.org/styles/dark';
/** CWAM domain (plus a little margin). */
export const SEA_VIEW_BOUNDS: [number, number, number, number] = [6.1, 53.2, 14.95, 56.5];
/** First view: German Bight and western Baltic (design map: Esbjerg … Lübeck). */
export const SEA_START_BOUNDS: [number, number, number, number] = [6.4, 53.4, 11.6, 55.9];
const CLASSES: SeaClass[] = ['passt', 'knapp', 'ausserhalb', 'keine'];

export interface SeaMapSpot { id: string; name: string; lon: number; lat: number; cls: SeaClass; windTo: number | null; windKn: number | null }
export interface SeaMapStation { id: string; name: string; lon: number; lat: number }
export interface SeaMapArea { feature: SeaAreaFeature; status: 'none' | 'unknown' | 'nostatus' }

interface Props {
  /** Coloured field (`colourField`) or null (no surface). */
  field: Uint8ClampedArray | null;
  arrows: GeoJSON.FeatureCollection | null;
  spots: readonly SeaMapSpot[];
  selectedId: string | null;
  stations: readonly SeaMapStation[] | null;
  areas: readonly SeaMapArea[] | null;
  showWind: boolean;
  padding: { top: number; bottom: number; left: number; right: number };
  onSelect: (id: string) => void;
  onMap?: (map: maplibregl.Map | null) => void;
  callout?: { lon: number; lat: number; name: string; line: string; color: string | null } | null;
}

function dotImage(cls: SeaClass, big: boolean): ImageData {
  const px = big ? 40 : 28, r = big ? 15 : 10;
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d')!;
  g.beginPath(); g.arc(px / 2, px / 2, r, 0, Math.PI * 2); g.closePath();
  if (cls === 'keine') {
    g.save(); g.clip(); g.fillStyle = '#3A3833'; g.fillRect(0, 0, px, px);
    g.strokeStyle = '#8B8474'; g.lineWidth = 2;
    for (let k = -px; k < px * 2; k += 5) { g.beginPath(); g.moveTo(k, px); g.lineTo(k + px, 0); g.stroke(); }
    g.restore();
  } else { g.fillStyle = CLASS_COLOR[cls]; g.fill(); }
  g.beginPath(); g.arc(px / 2, px / 2, r, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = '#0B0E12'; g.stroke();
  if (big) { g.beginPath(); g.arc(px / 2, px / 2, r + 3, 0, Math.PI * 2); g.lineWidth = 2.5; g.strokeStyle = '#FAF6EA'; g.stroke(); }
  return g.getImageData(0, 0, px, px);
}
function ringImage(): ImageData {
  const px = 22, c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d')!;
  g.beginPath(); g.arc(px / 2, px / 2, 7, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = '#FAF6EA'; g.stroke();
  g.beginPath(); g.arc(px / 2, px / 2, 7, 0, Math.PI * 2); g.lineWidth = 1; g.strokeStyle = '#0B0E12'; g.stroke();
  return g.getImageData(0, 0, px, px);
}
function arrowImage(color: string, w = 2.2): ImageData {
  const px = 24, c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d')!;
  g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(12, 20); g.lineTo(12, 4); g.moveTo(7, 9); g.lineTo(12, 4); g.lineTo(17, 9); g.stroke();
  return g.getImageData(0, 0, px, px);
}

/** The canvas the field is drawn into once per change; MapLibre gets it as an object URL. */
async function fieldUrl(field: Uint8ClampedArray): Promise<string> {
  const w = SEA_MODELS.cwam.grid.ni, h = SEA_OUT_ROWS;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(field as unknown as Uint8ClampedArray<ArrayBuffer>, w, h), 0, 0);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  return blob ? URL.createObjectURL(blob) : c.toDataURL('image/png');
}
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const TRANSPARENT_PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4AWMAAQAABQABNtCI3QAAAABJRU5ErkJggg==';

export default function SeaMap({ field, arrows, spots, selectedId, stations, areas, showWind, padding, onSelect, onMap, callout }: Props) {
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const urlRef = useRef<string | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const latest = useRef({ field, arrows, spots, selectedId, stations, areas, showWind });
  latest.current = { field, arrows, spots, selectedId, stations, areas, showWind };

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current, style: STYLE, bounds: SEA_START_BOUNDS, fitBoundsOptions: { padding: 10 }, maxBounds: [[SEA_VIEW_BOUNDS[0] - 6, SEA_VIEW_BOUNDS[1] - 4], [SEA_VIEW_BOUNDS[2] + 6, SEA_VIEW_BOUNDS[3] + 4]],
      attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, maxZoom: 12, minZoom: 4,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      if (mapRef.current !== map) return;
      for (const k of CLASSES) { map.addImage(`sw-dot-${k}`, dotImage(k, false), { pixelRatio: 2 }); map.addImage(`sw-dot-${k}-sel`, dotImage(k, true), { pixelRatio: 2 }); }
      map.addImage('sw-ring', ringImage(), { pixelRatio: 2 });
      map.addImage('sw-wave', arrowImage('#F3EDDF', 2), { pixelRatio: 2 });
      map.addImage('sw-wind', arrowImage('#FAF6EA', 2.8), { pixelRatio: 2 });
      const labels = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
      map.addSource('sw-field', { type: 'image', url: TRANSPARENT_PX, coordinates: SEA_FIELD_COORDS });
      map.addLayer({ id: 'sw-field', type: 'raster', source: 'sw-field', paint: { 'raster-opacity': 1, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, labels);
      map.addSource('sw-areas', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-areas-fill', type: 'fill', source: 'sw-areas', paint: { 'fill-color': ['match', ['get', 'status'], 'unknown', '#E39A3B', '#7FC4CC'], 'fill-opacity': ['match', ['get', 'status'], 'unknown', 0.16, 0] } }, labels);
      map.addLayer({ id: 'sw-areas-line', type: 'line', source: 'sw-areas', paint: { 'line-color': ['match', ['get', 'status'], 'unknown', '#E39A3B', '#7FC4CC'], 'line-width': ['match', ['get', 'kind'], 'coast', 1.6, 1], 'line-opacity': 0.75, 'line-dasharray': [3, 2] } });
      map.addSource('sw-arrows', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-arrows', type: 'symbol', source: 'sw-arrows', layout: { 'icon-image': 'sw-wave', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-size': ['*', 0.85, ['get', 's']], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': 0.7 } });
      map.addSource('sw-stations', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-stations', type: 'symbol', source: 'sw-stations', layout: { 'icon-image': 'sw-ring', 'icon-allow-overlap': true } });
      map.addSource('sw-wind', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-wind', type: 'symbol', source: 'sw-wind', layout: { 'icon-image': 'sw-wind', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-size': 1.15, 'icon-offset': [0, -16], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      map.addSource('sw-spots', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-spots', type: 'symbol', source: 'sw-spots', layout: { 'icon-image': ['concat', 'sw-dot-', ['get', 'cls'], ['case', ['==', ['get', 'sel'], 1], '-sel', '']], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sel'] } });
      map.on('click', 'sw-spots', (e) => { const id = e.features?.[0]?.properties?.id; if (id) onSelectRef.current(String(id)); });
      map.on('mouseenter', 'sw-spots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sw-spots', () => { map.getCanvas().style.cursor = ''; });
      ready.current = true;
      sync();
    });
    onMap?.(map);
    return () => {
      ready.current = false;
      if (urlRef.current?.startsWith('blob:')) URL.revokeObjectURL(urlRef.current);
      markerRef.current?.remove();
      if (mapRef.current === map) mapRef.current = null;
      onMap?.(null);
      map.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function sync() {
    const map = mapRef.current;
    if (!map || !ready.current) return;
    const s = latest.current;
    (map.getSource('sw-arrows') as maplibregl.GeoJSONSource | undefined)?.setData(s.field && s.arrows ? s.arrows : EMPTY);
    (map.getSource('sw-spots') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: s.spots.map((p) => ({ type: 'Feature', properties: { id: p.id, cls: p.cls, sel: p.id === s.selectedId ? 1 : 0 }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
    });
    (map.getSource('sw-wind') as maplibregl.GeoJSONSource | undefined)?.setData(!s.showWind ? EMPTY : {
      type: 'FeatureCollection',
      features: s.spots.filter((p) => p.windTo != null).map((p) => ({ type: 'Feature', properties: { rot: p.windTo }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
    });
    (map.getSource('sw-stations') as maplibregl.GeoJSONSource | undefined)?.setData(!s.stations ? EMPTY : {
      type: 'FeatureCollection', features: s.stations.map((p) => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
    });
    (map.getSource('sw-areas') as maplibregl.GeoJSONSource | undefined)?.setData(!s.areas ? EMPTY : {
      type: 'FeatureCollection', features: s.areas.map((a) => ({ ...a.feature, properties: { ...a.feature.properties, status: a.status } })),
    });
  }

  useEffect(sync, [arrows, spots, selectedId, stations, areas, showWind, field]);

  // Field image: redrawn only when the coloured field changes.
  useEffect(() => {
    let alive = true;
    const map = mapRef.current;
    const apply = (url: string) => {
      const src = mapRef.current?.getSource('sw-field') as maplibregl.ImageSource | undefined;
      if (!src) return;
      src.updateImage({ url, coordinates: SEA_FIELD_COORDS });
      if (urlRef.current?.startsWith('blob:')) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
    };
    if (!field) { const t = window.setTimeout(() => apply(TRANSPARENT_PX), 0); return () => { alive = false; window.clearTimeout(t); }; }
    fieldUrl(field).then((url) => {
      if (!alive || mapRef.current !== map) { if (url.startsWith('blob:')) URL.revokeObjectURL(url); return; }
      const go = () => apply(url);
      if (ready.current) go(); else map?.once('load', go);
    });
    return () => { alive = false; };
  }, [field]);

  useEffect(() => { mapRef.current?.setPadding(padding); }, [padding.top, padding.bottom, padding.left, padding.right]); // eslint-disable-line react-hooks/exhaustive-deps

  // Callout above the selected spot (design: name + one line).
  useEffect(() => {
    const map = mapRef.current;
    markerRef.current?.remove();
    markerRef.current = null;
    if (!map || !callout) return;
    const el = document.createElement('div');
    el.className = 'sw-callout';
    const b = document.createElement('b'); b.textContent = callout.name;
    const line = document.createElement('span');
    const dot = document.createElement('i');
    if (callout.color) dot.style.background = callout.color; else dot.className = 'is-hatched';
    line.append(dot, document.createTextNode(callout.line));
    el.append(b, line);
    markerRef.current = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -16] }).setLngLat([callout.lon, callout.lat]).addTo(map);
  }, [callout?.lon, callout?.lat, callout?.name, callout?.line, callout?.color]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={box} className="sw-map-canvas" />;
}
