/**
 * SW-5 — Map of Seewetter: real MapLibre on the dark OpenFreeMap style (like `RoadMap.tsx`). The sea state is a CWAM
 * field coloured on the CPU (`seaView.colourField`, mercator rows) and handed to MapLibre as an IMAGE source — no
 * shader of our own (plan SW-5). On top: wave arrows (where the waves go), DWD sea areas/coast sections with the
 * warning status, the spots as dots in the class colour of the chosen profile (hatched = no data, never like "passt"),
 * DWD POI stations as rings, the BSH water level gauges as diamonds (WL-4, switch, on by default), and —
 * switch — buscosun Fusion wind arrows at the spots (the WAM model wind is never shown).
 * Without a usable run (dead/killed) there is no surface at all.
 */
import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SEA_FIELD_COORDS, SEA_OUT_ROWS, CLASS_COLOR } from './seaView';
import { SEA_MODELS } from './seaContract';
import { MAP_SOURCES_LINK } from '../map/MapSourcesTile';
import type { SeaClass } from './seaProfiles';
import type { SeaAreaFeature } from './seaClient';
import { clampToRadius, planBearingDeg, planDestination, radiusRing, type DriftSide } from './seaPlanner';

const STYLE = 'https://tiles.openfreemap.org/styles/dark';
/** CWAM domain (plus a little margin). */
export const SEA_VIEW_BOUNDS: [number, number, number, number] = [6.1, 53.2, 14.95, 56.5];
/** First view: German Bight and western Baltic (design map: Esbjerg … Lübeck). */
/** Phase DK: widened only as far as the Danish spots need (Hvide Sande 56.00° N, Gedser 11.93° E; before: 11.6 / 55.9). */
export const SEA_START_BOUNDS: [number, number, number, number] = [6.4, 53.4, 12.0, 56.08];
const CLASSES: SeaClass[] = ['passt', 'knapp', 'ausserhalb', 'keine'];

export interface SeaMapSpot { id: string; name: string; lon: number; lat: number; cls: SeaClass; windTo: number | null; windKn: number | null }
export interface SeaMapStation { id: string; name: string; lon: number; lat: number }
/** WL-4: a BSH gauge of `sea/v1/static/gauges.json`; `sel` marks the one the readout shows. */
export interface SeaMapGauge { id: string; name: string; lon: number; lat: number }
export interface SeaMapArea { feature: SeaAreaFeature; status: 'none' | 'unknown' | 'nostatus' }
/**
 * Phase SP — the trip planner on the map (`seaPlanner.ts`): a draggable boat (HTML marker) inside the radius around the
 * launch point, the dashed straight line back with its label, the radius as a dashed ring. Markers and line layers
 * only — no layer of our own in the GL pipeline. The chevrons at the boat show where the wind pushes, nothing else.
 */
export interface SeaMapPlan {
  launch: { lon: number; lat: number };
  boat: { lon: number; lat: number };
  radiusKm: number;
  /** Where the wind pushes at the chosen hour (map bearing) and the side it comes from; null = no direction. */
  driftTo: number | null;
  side: DriftSide | null;
  /** Wind badge at the boat. */
  badge: string;
  /** Label of the return line for the current boat, and for any position while it is dragged. */
  lineLabel: string;
  labelAt: (lat: number, lon: number) => string;
  /** The boat's new position after a drag or an arrow key — already inside the radius. */
  onBoat: (lat: number, lon: number) => void;
}

const PLAN_HULL = '<svg class="sw-pl-hull" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 1.5c5.2 5.6 8 11.4 8 17.6V29a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 5 29v-9.9C5 12.9 7.8 7.1 13 1.5z"/><path class="sw-pl-hull-deck" d="M9 21h8M13 9v8"/></svg>';
const PLAN_DRIFT = '<svg class="sw-pl-drift" width="96" height="96" viewBox="-48 -48 96 96" aria-hidden="true"><path d="M-7 -24l7 -7 7 7"/><path d="M-7 -33l7 -7 7 7"/><path d="M-7 -42l7 -7 7 7"/></svg>';
const planEl = (cls: string, html = '') => { const el = document.createElement('div'); el.className = cls; el.innerHTML = html; return el; };

interface Props {
  /** Coloured field (`colourField`) or null (no surface). */
  field: Uint8ClampedArray | null;
  arrows: GeoJSON.FeatureCollection | null;
  spots: readonly SeaMapSpot[];
  selectedId: string | null;
  stations: readonly SeaMapStation[] | null;
  gauges: readonly SeaMapGauge[] | null;
  selectedGaugeId: string | null;
  onGauge?: (id: string) => void;
  areas: readonly SeaMapArea[] | null;
  showWind: boolean;
  padding: { top: number; bottom: number; left: number; right: number };
  onSelect: (id: string) => void;
  onMap?: (map: maplibregl.Map | null) => void;
  callout?: { lon: number; lat: number; name: string; line: string; color: string | null } | null;
  /** Phase SP: the open trip planner; null/absent = closed (no marker, empty source). */
  plan?: SeaMapPlan | null;
  /** Phase ST: arrows of the surface current (`seaCurrent.currentArrows`), or null (layer off, no field for this hour). */
  currents?: GeoJSON.FeatureCollection | null;
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
/**
 * WL-4: a gauge is a diamond, so it is never mistaken for a spot (dot) or a DWD station (ring) — the three
 * live on the same map. Teal like every BSH value on this page.
 */
function gaugeImage(sel: boolean): ImageData {
  const px = sel ? 26 : 20, c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d')!;
  const r = sel ? 8.5 : 6.5, m = px / 2;
  g.beginPath(); g.moveTo(m, m - r); g.lineTo(m + r, m); g.lineTo(m, m + r); g.lineTo(m - r, m); g.closePath();
  g.fillStyle = '#0F6E7A'; g.fill();
  g.lineWidth = sel ? 2.5 : 1.8; g.strokeStyle = sel ? '#FAF6EA' : '#0B0E12'; g.stroke();
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

/** Phase ST: the drift arrow — a float (dot) and where it goes; aqua, so it is never read as a wave or wind arrow. */
function driftImage(): ImageData {
  const px = 28, c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d')!;
  const draw = (color: string, w: number, r: number) => {
    g.strokeStyle = color; g.fillStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(14, 18); g.lineTo(14, 4); g.moveTo(9, 9); g.lineTo(14, 4); g.lineTo(19, 9); g.stroke();
    g.beginPath(); g.arc(14, 22.5, r, 0, Math.PI * 2); g.fill();
  };
  draw('#0B0E12', 4.6, 3.6);
  draw('#6FD3DC', 2.2, 2.6);
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

export default function SeaMap({ field, arrows, spots, selectedId, stations, gauges, selectedGaugeId, onGauge, areas, showWind, padding, onSelect, onMap, callout, plan = null, currents = null }: Props) {
  const planRef = useRef<SeaMapPlan | null>(plan);
  planRef.current = plan;
  const planMarks = useRef<{ boat: maplibregl.Marker; label: maplibregl.Marker; launch: maplibregl.Marker; badge: HTMLElement; drift: HTMLElement; hull: HTMLElement } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const urlRef = useRef<string | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onGaugeRef = useRef(onGauge);
  onGaugeRef.current = onGauge;
  const latest = useRef({ field, arrows, spots, selectedId, stations, gauges, selectedGaugeId, areas, showWind, currents });
  latest.current = { field, arrows, spots, selectedId, stations, gauges, selectedGaugeId, areas, showWind, currents };

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current, style: STYLE, bounds: SEA_START_BOUNDS, fitBoundsOptions: { padding: 10 }, maxBounds: [[SEA_VIEW_BOUNDS[0] - 6, SEA_VIEW_BOUNDS[1] - 4], [SEA_VIEW_BOUNDS[2] + 6, SEA_VIEW_BOUNDS[3] + 4]],
      attributionControl: { compact: false, customAttribution: `${MAP_SOURCES_LINK} · Seegang, Wind, Warnungen: DWD · Wasserstand, Strömung: BSH · bearbeitet` },
      dragRotate: false, pitchWithRotate: false, maxZoom: 12, minZoom: 4,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      if (mapRef.current !== map) return;
      for (const k of CLASSES) { map.addImage(`sw-dot-${k}`, dotImage(k, false), { pixelRatio: 2 }); map.addImage(`sw-dot-${k}-sel`, dotImage(k, true), { pixelRatio: 2 }); }
      map.addImage('sw-ring', ringImage(), { pixelRatio: 2 });
      map.addImage('sw-gauge', gaugeImage(false), { pixelRatio: 2 });
      map.addImage('sw-gauge-sel', gaugeImage(true), { pixelRatio: 2 });
      map.addImage('sw-wave', arrowImage('#F3EDDF', 2), { pixelRatio: 2 });
      map.addImage('sw-wind', arrowImage('#FAF6EA', 2.8), { pixelRatio: 2 });
      map.addImage('sw-drift', driftImage(), { pixelRatio: 2 });
      const labels = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
      map.addSource('sw-field', { type: 'image', url: TRANSPARENT_PX, coordinates: SEA_FIELD_COORDS });
      map.addLayer({ id: 'sw-field', type: 'raster', source: 'sw-field', paint: { 'raster-opacity': 1, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, labels);
      map.addSource('sw-areas', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-areas-fill', type: 'fill', source: 'sw-areas', paint: { 'fill-color': ['match', ['get', 'status'], 'unknown', '#E39A3B', '#7FC4CC'], 'fill-opacity': ['match', ['get', 'status'], 'unknown', 0.16, 0] } }, labels);
      map.addLayer({ id: 'sw-areas-line', type: 'line', source: 'sw-areas', paint: { 'line-color': ['match', ['get', 'status'], 'unknown', '#E39A3B', '#7FC4CC'], 'line-width': ['match', ['get', 'kind'], 'coast', 1.6, 1], 'line-opacity': 0.75, 'line-dasharray': [3, 2] } });
      map.addSource('sw-arrows', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-arrows', type: 'symbol', source: 'sw-arrows', layout: { 'icon-image': 'sw-wave', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-size': ['*', 0.85, ['get', 's']], 'icon-allow-overlap': true, 'icon-ignore-placement': true }, paint: { 'icon-opacity': 0.7 } });
      // Phase ST: surface current as a symbol layer like `sw-arrows` (no particles, no shader). Every second cell from zoom 7.5 on.
      map.addSource('sw-current', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'sw-current', type: 'symbol', source: 'sw-current', filter: ['any', ['==', ['get', 'lod'], 0], ['>=', ['zoom'], 7.5]],
        layout: { 'icon-image': 'sw-drift', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-size': ['get', 's'], 'icon-allow-overlap': true, 'icon-ignore-placement': true },
        paint: { 'icon-opacity': 0.92 },
      });
      map.addSource('sw-stations', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-stations', type: 'symbol', source: 'sw-stations', layout: { 'icon-image': 'sw-ring', 'icon-allow-overlap': true } });
      map.addSource('sw-gauges', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'sw-gauges', type: 'symbol', source: 'sw-gauges',
        layout: { 'icon-image': ['case', ['==', ['get', 'sel'], 1], 'sw-gauge-sel', 'sw-gauge'], 'icon-allow-overlap': true, 'symbol-sort-key': ['get', 'sel'] },
      });
      map.on('click', 'sw-gauges', (e) => { const id = e.features?.[0]?.properties?.id; if (id) onGaugeRef.current?.(String(id)); });
      map.on('mouseenter', 'sw-gauges', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sw-gauges', () => { map.getCanvas().style.cursor = ''; });
      // Phase SP: radius ring and return line of the trip planner (line layers; empty while the planner is closed).
      map.addSource('sw-plan', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-plan-ring', type: 'line', source: 'sw-plan', filter: ['==', ['get', 'kind'], 'ring'], paint: { 'line-color': '#FAF6EA', 'line-width': 1.2, 'line-opacity': 0.55, 'line-dasharray': [1, 3] } });
      map.addLayer({ id: 'sw-plan-line-case', type: 'line', source: 'sw-plan', filter: ['==', ['get', 'kind'], 'line'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#0B0E12', 'line-width': 5, 'line-opacity': 0.55 } });
      map.addLayer({ id: 'sw-plan-line', type: 'line', source: 'sw-plan', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#FAF6EA', 'line-width': 2.2, 'line-dasharray': [2.2, 2] } });
      map.addSource('sw-wind', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-wind', type: 'symbol', source: 'sw-wind', layout: { 'icon-image': 'sw-wind', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-size': 1.15, 'icon-offset': [0, -16], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      map.addSource('sw-spots', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-spots', type: 'symbol', source: 'sw-spots', layout: { 'icon-image': ['concat', 'sw-dot-', ['get', 'cls'], ['case', ['==', ['get', 'sel'], 1], '-sel', '']], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sel'] } });
      map.on('click', 'sw-spots', (e) => { const id = e.features?.[0]?.properties?.id; if (id) onSelectRef.current(String(id)); });
      // Right click (or long press on touch) on a spot opens the same info card as a left click — with the way to the dossier.
      map.on('contextmenu', 'sw-spots', (e) => { e.originalEvent.preventDefault(); const id = e.features?.[0]?.properties?.id; if (id) onSelectRef.current(String(id)); });
      map.on('mouseenter', 'sw-spots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sw-spots', () => { map.getCanvas().style.cursor = ''; });
      ready.current = true;
      sync();
      syncPlan();
    });
    onMap?.(map);
    return () => {
      ready.current = false;
      if (urlRef.current?.startsWith('blob:')) URL.revokeObjectURL(urlRef.current);
      markerRef.current?.remove();
      if (planMarks.current) { planMarks.current.boat.remove(); planMarks.current.label.remove(); planMarks.current.launch.remove(); planMarks.current = null; }
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
    (map.getSource('sw-current') as maplibregl.GeoJSONSource | undefined)?.setData(s.currents ?? EMPTY);
    (map.getSource('sw-spots') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: s.spots.map((p) => ({ type: 'Feature', properties: { id: p.id, cls: p.cls, sel: p.id === s.selectedId ? 1 : 0 }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
    });
    (map.getSource('sw-wind') as maplibregl.GeoJSONSource | undefined)?.setData(!s.showWind ? EMPTY : {
      type: 'FeatureCollection',
      features: s.spots.filter((p) => p.windTo != null).map((p) => ({ type: 'Feature', properties: { rot: p.windTo }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
    });
    (map.getSource('sw-gauges') as maplibregl.GeoJSONSource | undefined)?.setData(!s.gauges ? EMPTY : {
      type: 'FeatureCollection', features: s.gauges.map((p) => ({ type: 'Feature', properties: { id: p.id, sel: p.id === s.selectedGaugeId ? 1 : 0 }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
    });
    (map.getSource('sw-stations') as maplibregl.GeoJSONSource | undefined)?.setData(!s.stations ? EMPTY : {
      type: 'FeatureCollection', features: s.stations.map((p) => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
    });
    (map.getSource('sw-areas') as maplibregl.GeoJSONSource | undefined)?.setData(!s.areas ? EMPTY : {
      type: 'FeatureCollection', features: s.areas.map((a) => ({ ...a.feature, properties: { ...a.feature.properties, status: a.status } })),
    });
  }

  useEffect(sync, [arrows, spots, selectedId, stations, gauges, selectedGaugeId, areas, showWind, field, currents]);

  // --- Phase SP: trip planner --------------------------------------------------------------------------------
  /** Ring, line, label and hull for a boat position — also while the boat is dragged (no React state per move). */
  function drawPlan(lat: number, lon: number) {
    const p = planRef.current, m = planMarks.current, map = mapRef.current;
    if (!p || !map) return;
    if (ready.current) {
      (map.getSource('sw-plan') as maplibregl.GeoJSONSource | undefined)?.setData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', properties: { kind: 'ring' }, geometry: { type: 'LineString', coordinates: radiusRing(p.launch, p.radiusKm) } },
          { type: 'Feature', properties: { kind: 'line' }, geometry: { type: 'LineString', coordinates: [[lon, lat], [p.launch.lon, p.launch.lat]] } },
        ],
      });
    }
    if (!m) return;
    m.label.setLngLat([(lon + p.launch.lon) / 2, (lat + p.launch.lat) / 2]);
    m.label.getElement().textContent = p.labelAt(lat, lon);
    // The bow points along the return line (the map never rotates, so a CSS turn is a map bearing).
    m.hull.style.transform = `rotate(${Math.round(planBearingDeg({ lat, lon }, p.launch))}deg)`;
  }
  function syncPlan() {
    const map = mapRef.current, p = planRef.current;
    if (!map) return;
    if (!p) {
      if (planMarks.current) { planMarks.current.boat.remove(); planMarks.current.label.remove(); planMarks.current.launch.remove(); planMarks.current = null; }
      if (ready.current) (map.getSource('sw-plan') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY);
      return;
    }
    if (!planMarks.current) {
      const boatEl = planEl('sw-pl-boat', `${PLAN_DRIFT}<span class="sw-pl-hullbox">${PLAN_HULL}</span><span class="sw-pl-badge"></span>`);
      boatEl.tabIndex = 0;
      boatEl.setAttribute('role', 'button');
      boatEl.setAttribute('aria-label', 'Boot. Ziehen oder mit den Pfeiltasten verschieben, 100 Meter je Schritt.');
      const boat = new maplibregl.Marker({ element: boatEl, draggable: true, anchor: 'center' }).setLngLat([p.boat.lon, p.boat.lat]).addTo(map);
      const held = () => { const pl = planRef.current, ll = boat.getLngLat(); return pl ? clampToRadius(pl.launch, { lat: ll.lat, lon: ll.lng }, pl.radiusKm) : null; };
      boat.on('drag', () => { const c = held(); if (!c) return; if (c.clamped) boat.setLngLat([c.lon, c.lat]); drawPlan(c.lat, c.lon); });
      boat.on('dragend', () => { const c = held(); if (c) planRef.current?.onBoat(c.lat, c.lon); });
      boatEl.addEventListener('keydown', (e) => {
        const br = ({ ArrowUp: 0, ArrowRight: 90, ArrowDown: 180, ArrowLeft: 270 } as Record<string, number>)[e.key];
        const pl = planRef.current;
        if (br == null || !pl) return;
        e.preventDefault();
        const ll = boat.getLngLat();
        const c = clampToRadius(pl.launch, planDestination({ lat: ll.lat, lon: ll.lng }, br, e.shiftKey ? 0.5 : 0.1), pl.radiusKm);
        boat.setLngLat([c.lon, c.lat]);
        drawPlan(c.lat, c.lon);
        pl.onBoat(c.lat, c.lon);
      });
      const label = new maplibregl.Marker({ element: planEl('sw-pl-linelabel'), anchor: 'center' }).setLngLat([p.boat.lon, p.boat.lat]).addTo(map);
      const launch = new maplibregl.Marker({ element: planEl('sw-pl-launch', '<span>Startort</span>'), anchor: 'bottom', offset: [0, -14] }).setLngLat([p.launch.lon, p.launch.lat]).addTo(map);
      planMarks.current = { boat, label, launch, badge: boatEl.querySelector('.sw-pl-badge') as HTMLElement, drift: boatEl.querySelector('.sw-pl-drift') as HTMLElement, hull: boatEl.querySelector('.sw-pl-hullbox') as HTMLElement };
    }
    const m = planMarks.current;
    m.boat.setLngLat([p.boat.lon, p.boat.lat]);
    m.launch.setLngLat([p.launch.lon, p.launch.lat]);
    m.badge.textContent = p.badge;
    m.boat.getElement().className = `${m.boat.getElement().className.replace(/ is-(see|land|quer|calm)/g, '')} is-${p.driftTo == null || !p.side ? 'calm' : p.side}`;
    m.drift.style.transform = `rotate(${p.driftTo == null ? 0 : Math.round(p.driftTo)}deg)`;
    drawPlan(p.boat.lat, p.boat.lon);
  }
  useEffect(syncPlan, [plan?.launch.lon, plan?.launch.lat, plan?.boat.lon, plan?.boat.lat, plan?.radiusKm, plan?.driftTo, plan?.side, plan?.badge, plan?.lineLabel, !plan]); // eslint-disable-line react-hooks/exhaustive-deps

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
