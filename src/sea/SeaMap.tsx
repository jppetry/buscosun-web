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
import { tripArrowLayout, type TripArrow, type TripRect } from './seaTrip';
import type { SeaUvGrid } from './seaCurrent';
import type { RippleKeepOut, SeaRippleLayer } from './SeaRippleLayer';
import type { SeaParticleLayer } from './SeaParticleLayer';
import type { SeaParticleState } from './seaParticles';
import { SEA_PAN_SOUTH } from './seaLakes';

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
  /** Wind of the chosen hour — not drawn on the map (the boat carries no label), only read out with the boat. */
  badge: string;
  /** Label of the return line for the current boat, and for any position while it is dragged. */
  lineLabel: string;
  labelAt: (lat: number, lon: number) => string;
  /** The boat's new position after a drag or an arrow key — already inside the radius. */
  onBoat: (lat: number, lon: number) => void;
}

/**
 * Phase AM — a leg on the map (`seaTrip.ts`): the route as line layers (ink inside your limits, red above, dashed where a
 * value is missing), its points as draggable HTML markers, the boat at the chosen hour. Markers and line layers only.
 */
export interface SeaMapTrip {
  /** The route in pieces of one status; before the values are in, one piece `missing`. */
  pieces: readonly { status: 'in' | 'over' | 'missing'; coords: [number, number][] }[];
  points: readonly { lat: number; lon: number; role: 'start' | 'way' | 'end'; label: string | null }[];
  /** The boat at the chosen hour: position, course of its stretch, label ("11:00 · 15 sm"). */
  boat: { lat: number; lon: number; course: number; label: string } | null;
  /** V-AM-9: the arrows beside the route (`tripArrows`) and the chosen column — the map thins them to what fits. */
  arrows: readonly TripArrow[];
  arrowSel: number;
  /** The next click on the map sets a point. */
  armed: boolean;
  /** A click on the map while armed; `spotId` = the catalogue spot under the click. */
  onClick: (lat: number, lon: number, spotId: string | null) => void;
  /** A point was dropped at a new position (on a spot: `spotId`), or removed (Delete / Backspace on the marker). */
  onMove: (index: number, lat: number, lon: number, spotId: string | null) => void;
  onRemove: (index: number) => void;
}
/** Phase AM, Strand: the side the wind comes from at each spot (`null` = no direction) — the spot marker carries its colour. */
export type SeaMapShore = Readonly<Record<string, DriftSide | null>>;
const SHORE_COLOR: Readonly<Record<DriftSide, string>> = { see: '#7FC4CC', quer: '#F3EDDF', land: '#E39A3B' };

const PLAN_HULL ='<svg class="sw-pl-hull" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true"><path d="M13 1.5c5.2 5.6 8 11.4 8 17.6V29a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 5 29v-9.9C5 12.9 7.8 7.1 13 1.5z"/><path class="sw-pl-hull-deck" d="M9 21h8M13 9v8"/></svg>';
const PLAN_DRIFT = '<svg class="sw-pl-drift" width="96" height="96" viewBox="-48 -48 96 96" aria-hidden="true"><path d="M-7 -24l7 -7 7 7"/><path d="M-7 -33l7 -7 7 7"/><path d="M-7 -42l7 -7 7 7"/></svg>';
/** V-AM-9: an arrow beside the route, drawn pointing north and turned by the marker — a mantle and a core, shaft and head apart (the current's shaft is dashed). */
const TRIP_ARROW ='<svg class="sw-am-arr-g" width="34" height="34" viewBox="-17 -17 34 34" fill="none" stroke-linecap="round" stroke-linejoin="round"><path class="sw-am-arr-case" d="M0 14V-11M-6.5 -5.5 0 -13 6.5 -5.5"/><path class="sw-am-arr-core is-shaft" d="M0 14V-9"/><path class="sw-am-arr-core" d="M-6.5 -5.5 0 -13 6.5 -5.5"/></svg>';
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
  /** Phase BS: the lake outlines of the catalogue (GeoJSON) — drawn as a quiet water area; a lake has no wave field. */
  lakes?: { type: 'FeatureCollection'; features: unknown[] } | null;
  showWind: boolean;
  padding: { top: number; bottom: number; left: number; right: number };
  onSelect: (id: string) => void;
  onMap?: (map: maplibregl.Map | null) => void;
  callout?: { lon: number; lat: number; name: string; line: string; color: string | null } | null;
  /** Phase SP: the open trip planner; null/absent = closed (no marker, empty source). */
  plan?: SeaMapPlan | null;
  /** Phase AM: the leg of the trip planner; null/absent = none. */
  trip?: SeaMapTrip | null;
  /** Phase AM: Strand — spot markers in the colour of the wind's side to the shore instead of the profile class. */
  shore?: SeaMapShore | null;
  /** Phase ST: arrows of the surface current (`seaCurrent.currentArrows`), or null (layer off, no field for this hour). */
  currents?: GeoJSON.FeatureCollection | null;
  /**
   * Phase SR: the u/v field of the chosen hour while the main layer „Strömung“ is chosen — drawn as moving ripples on
   * a 2D canvas above the map canvas (`SeaRippleLayer`, its own lazy chunk). null = layer off or no data: no canvas work.
   */
  ripple?: SeaUvGrid | null;
  /** The map is on stage; off stage the ripple loop stops. */
  rippleOn?: boolean;
  /** SR: the field image is a smooth colour area (the current), not a field of cells — it is resampled linearly. */
  fieldSmooth?: boolean;
  /** Planner „Vor Ort“, page „Startort“: while armed, a click on the map (not on a spot) sets the user's own start point. */
  pick?: { armed: boolean; onPick: (lat: number, lon: number) => void } | null;
  /**
   * Phase BS-P: wind particles for the chosen hour (`SeaParticleLayer`, its own lazy chunk — the Wetterkarte's `WindLayer`
   * with the ICON-D2 wind field of the data repo). null/absent = off: no chunk, no layer, nothing fetched.
   */
  particles?: { tMs: number; onState: (s: SeaParticleState) => void } | null;
}

/** Phase AM, Strand: a spot dot in the colour of the wind's side (hatched without a direction). */
function shoreImage(side: DriftSide | null, big: boolean): ImageData {
  const px = big ? 40 : 28, r = big ? 14 : 9.5;
  const c = document.createElement('canvas');
  c.width = px; c.height = px;
  const g = c.getContext('2d')!;
  g.beginPath(); g.arc(px / 2, px / 2, r, 0, Math.PI * 2); g.closePath();
  if (!side) {
    g.save(); g.clip(); g.fillStyle = '#3A3833'; g.fillRect(0, 0, px, px);
    g.strokeStyle = '#8B8474'; g.lineWidth = 2;
    for (let k = -px; k < px * 2; k += 5) { g.beginPath(); g.moveTo(k, px); g.lineTo(k + px, 0); g.stroke(); }
    g.restore();
  } else { g.fillStyle = SHORE_COLOR[side]; g.fill(); }
  g.beginPath(); g.arc(px / 2, px / 2, r, 0, Math.PI * 2); g.lineWidth = 3; g.strokeStyle = '#0B0E12'; g.stroke();
  if (big) { g.beginPath(); g.arc(px / 2, px / 2, r + 3.5, 0, Math.PI * 2); g.lineWidth = 2.5; g.strokeStyle = '#FAF6EA'; g.stroke(); }
  return g.getImageData(0, 0, px, px);
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

export default function SeaMap({ field, arrows, spots, selectedId, stations, gauges, selectedGaugeId, onGauge, areas, lakes = null, showWind, padding, onSelect, onMap, callout, plan = null, trip = null, shore = null, currents = null, ripple = null, rippleOn = true, fieldSmooth = false, pick = null, particles = null }: Props) {
  const tripRef = useRef<SeaMapTrip | null>(trip);
  const pickRef = useRef(pick);
  pickRef.current = pick;
  tripRef.current = trip;
  const tripMarks = useRef<{ pts: maplibregl.Marker[]; boat: maplibregl.Marker | null; arr: maplibregl.Marker[] }>({ pts: [], boat: null, arr: [] });
  const tripDrag = useRef(false);
  const rippleLayer = useRef<SeaRippleLayer | null>(null);
  const rippleWant = useRef<{ grid: SeaUvGrid | null; on: boolean; keep: RippleKeepOut[] }>({ grid: null, on: true, keep: [] });
  const particleLayer = useRef<SeaParticleLayer | null>(null);
  const particleWant = useRef<{ tMs: number; on: boolean; onState: (s: SeaParticleState) => void } | null>(null);
  const planRef = useRef<SeaMapPlan | null>(plan);
  planRef.current = plan;
  const planMarks = useRef<{ boat: maplibregl.Marker; label: maplibregl.Marker; launch: maplibregl.Marker; drift: HTMLElement; hull: HTMLElement } | null>(null);
  const box = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const ready = useRef(false);
  const urlRef = useRef<string | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onGaugeRef = useRef(onGauge);
  onGaugeRef.current = onGauge;
  const latest = useRef({ field, arrows, spots, selectedId, stations, gauges, selectedGaugeId, areas, lakes, showWind, currents, fieldSmooth, shore });
  latest.current = { field, arrows, spots, selectedId, stations, gauges, selectedGaugeId, areas, lakes, showWind, currents, fieldSmooth, shore };

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current, style: STYLE, bounds: SEA_START_BOUNDS, fitBoundsOptions: { padding: 10 }, maxBounds: [[SEA_VIEW_BOUNDS[0] - 6, Math.min(SEA_VIEW_BOUNDS[1] - 4, SEA_PAN_SOUTH)], [SEA_VIEW_BOUNDS[2] + 6, SEA_VIEW_BOUNDS[3] + 4]],
      attributionControl: { compact: false, customAttribution: `${MAP_SOURCES_LINK} · Seegang, Wind, Warnungen: DWD · Wasserstand, Strömung: BSH · bearbeitet` },
      dragRotate: false, pitchWithRotate: false, maxZoom: 12, minZoom: 4,
    });
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.on('load', () => {
      if (mapRef.current !== map) return;
      for (const k of CLASSES) { map.addImage(`sw-dot-${k}`, dotImage(k, false), { pixelRatio: 2 }); map.addImage(`sw-dot-${k}-sel`, dotImage(k, true), { pixelRatio: 2 }); }
      for (const k of ['see', 'quer', 'land', 'none'] as const) { const side = k === 'none' ? null : k; map.addImage(`sw-shore-${k}`, shoreImage(side, false), { pixelRatio: 2 }); map.addImage(`sw-shore-${k}-sel`, shoreImage(side, true), { pixelRatio: 2 }); }
      map.addImage('sw-ring', ringImage(), { pixelRatio: 2 });
      map.addImage('sw-gauge', gaugeImage(false), { pixelRatio: 2 });
      map.addImage('sw-gauge-sel', gaugeImage(true), { pixelRatio: 2 });
      map.addImage('sw-wave', arrowImage('#F3EDDF', 2), { pixelRatio: 2 });
      map.addImage('sw-wind', arrowImage('#FAF6EA', 2.8), { pixelRatio: 2 });
      map.addImage('sw-drift', driftImage(), { pixelRatio: 2 });
      const labels = map.getStyle()?.layers?.find((l) => l.type === 'symbol')?.id;
      map.addSource('sw-field', { type: 'image', url: TRANSPARENT_PX, coordinates: SEA_FIELD_COORDS });
      map.addLayer({ id: 'sw-field', type: 'raster', source: 'sw-field', paint: { 'raster-opacity': 1, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 } }, labels);
      // Phase BS: lake areas from the catalogue's outlines, below everything that carries a value.
      map.addSource('sw-lakes', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-lakes-fill', type: 'fill', source: 'sw-lakes', paint: { 'fill-color': '#7FC4CC', 'fill-opacity': 0.45 } });
      map.addLayer({ id: 'sw-lakes-line', type: 'line', source: 'sw-lakes', paint: { 'line-color': '#0F6E7A', 'line-width': 1, 'line-opacity': 0.75 } });
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
      map.on('click', 'sw-gauges', (e) => { if (tripRef.current) return; const id = e.features?.[0]?.properties?.id; if (id) onGaugeRef.current?.(String(id)); });
      map.on('mouseenter', 'sw-gauges', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sw-gauges', () => { map.getCanvas().style.cursor = ''; });
      // Phase SP: radius ring and return line of the trip planner (line layers; empty while the planner is closed).
      map.addSource('sw-plan', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-plan-ring', type: 'line', source: 'sw-plan', filter: ['==', ['get', 'kind'], 'ring'], paint: { 'line-color': '#FAF6EA', 'line-width': 1.2, 'line-opacity': 0.55, 'line-dasharray': [1, 3] } });
      map.addLayer({ id: 'sw-plan-line-case', type: 'line', source: 'sw-plan', filter: ['==', ['get', 'kind'], 'line'], layout: { 'line-cap': 'round' }, paint: { 'line-color': '#0B0E12', 'line-width': 5, 'line-opacity': 0.55 } });
      map.addLayer({ id: 'sw-plan-line', type: 'line', source: 'sw-plan', filter: ['==', ['get', 'kind'], 'line'], paint: { 'line-color': '#FAF6EA', 'line-width': 2.2, 'line-dasharray': [2.2, 2] } });
      // Phase AM: the leg (line layers; empty without one). A cream casing carries the line over the dark sea field.
      map.addSource('sw-trip', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-trip-case', type: 'line', source: 'sw-trip', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FAF6EA', 'line-width': 9 } });
      map.addLayer({ id: 'sw-trip-in', type: 'line', source: 'sw-trip', filter: ['==', ['get', 'status'], 'in'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#2C2A26', 'line-width': 4 } });
      map.addLayer({ id: 'sw-trip-over', type: 'line', source: 'sw-trip', filter: ['==', ['get', 'status'], 'over'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#B5482E', 'line-width': 4 } });
      map.addLayer({ id: 'sw-trip-missing', type: 'line', source: 'sw-trip', filter: ['==', ['get', 'status'], 'missing'], paint: { 'line-color': '#2C2A26', 'line-width': 3, 'line-dasharray': [1.2, 1.6] } });
      map.addSource('sw-wind', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-wind', type: 'symbol', source: 'sw-wind', layout: { 'icon-image': 'sw-wind', 'icon-rotate': ['get', 'rot'], 'icon-rotation-alignment': 'map', 'icon-size': 1.15, 'icon-offset': [0, -16], 'icon-allow-overlap': true, 'icon-ignore-placement': true } });
      map.addSource('sw-spots', { type: 'geojson', data: EMPTY });
      map.addLayer({ id: 'sw-spots', type: 'symbol', source: 'sw-spots', layout: { 'icon-image': ['concat', ['case', ['has', 'shore'], ['concat', 'sw-shore-', ['get', 'shore']], ['concat', 'sw-dot-', ['get', 'cls']]], ['case', ['==', ['get', 'sel'], 1], '-sel', '']], 'icon-allow-overlap': true, 'icon-ignore-placement': true, 'symbol-sort-key': ['get', 'sel'] } });
      // Phase AM: with a leg open a click belongs to the leg (a point on the map, snapped on a spot), not to the spot picker.
      map.on('click', 'sw-spots', (e) => { if (tripRef.current) return; const id = e.features?.[0]?.properties?.id; if (id) onSelectRef.current(String(id)); });
      map.on('click', (e) => {
        const t = tripRef.current; if (t?.armed) t.onClick(e.lngLat.lat, e.lngLat.lng, spotAt(e.point));
        // A click on a spot stays the spot's (it is picked as start); anywhere else it is the own point.
        const pk = pickRef.current; if (!t && pk?.armed && !spotAt(e.point)) pk.onPick(e.lngLat.lat, e.lngLat.lng);
      });
      // V-AM-9: how many arrows fit beside the route depends on the zoom.
      map.on('zoomend', syncArrows);
      // The line label's length on screen changes with the zoom.
      map.on('zoomend', () => { const mk = planMarks.current; if (mk && planRef.current) { const ll = mk.boat.getLngLat(); drawPlan(ll.lat, ll.lng); } });
      // Right click (or long press on touch) on a spot opens the same info card as a left click — with the way to the dossier.
      map.on('contextmenu', 'sw-spots', (e) => { e.originalEvent.preventDefault(); const id = e.features?.[0]?.properties?.id; if (id) onSelectRef.current(String(id)); });
      map.on('mouseenter', 'sw-spots', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sw-spots', () => { map.getCanvas().style.cursor = ''; });
      ready.current = true;
      sync();
      syncPlan();
      syncTrip();
    });
    onMap?.(map);
    return () => {
      ready.current = false;
      if (urlRef.current?.startsWith('blob:')) URL.revokeObjectURL(urlRef.current);
      markerRef.current?.remove();
      if (planMarks.current) { planMarks.current.boat.remove(); planMarks.current.label.remove(); planMarks.current.launch.remove(); planMarks.current = null; }
      for (const m of tripMarks.current.pts) m.remove();
      tripMarks.current.boat?.remove();
      for (const m of tripMarks.current.arr) m.remove();
      tripMarks.current = { pts: [], boat: null, arr: [] };
      rippleLayer.current?.destroy();
      rippleLayer.current = null;
      particleLayer.current?.destroy();
      particleLayer.current = null;
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
    if (map.getLayer('sw-field')) map.setPaintProperty('sw-field', 'raster-resampling', s.fieldSmooth ? 'linear' : 'nearest');
    (map.getSource('sw-arrows') as maplibregl.GeoJSONSource | undefined)?.setData(s.field && s.arrows ? s.arrows : EMPTY);
    (map.getSource('sw-current') as maplibregl.GeoJSONSource | undefined)?.setData(s.currents ?? EMPTY);
    (map.getSource('sw-spots') as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: s.spots.map((p) => ({ type: 'Feature', properties: { id: p.id, cls: p.cls, sel: p.id === s.selectedId ? 1 : 0, ...(s.shore ? { shore: s.shore[p.id] ?? 'none' } : {}) }, geometry: { type: 'Point', coordinates: [p.lon, p.lat] } })),
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
    (map.getSource('sw-lakes') as maplibregl.GeoJSONSource | undefined)?.setData((s.lakes ?? EMPTY) as Parameters<maplibregl.GeoJSONSource['setData']>[0]);
    (map.getSource('sw-areas') as maplibregl.GeoJSONSource | undefined)?.setData(!s.areas ? EMPTY : {
      type: 'FeatureCollection', features: s.areas.map((a) => ({ ...a.feature, properties: { ...a.feature.properties, status: a.status } })),
    });
  }

  useEffect(sync, [arrows, spots, selectedId, stations, gauges, selectedGaugeId, areas, lakes, showWind, field, currents, fieldSmooth, shore]);

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
    // The label rides along the line, just above it, always upright; too short a line on screen carries none.
    const a = map.project([lon, lat]), b = map.project([p.launch.lon, p.launch.lat]);
    let ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;
    const [head, ...rest] = p.labelAt(lat, lon).split(', ');
    const span = m.label.getElement().firstElementChild as HTMLElement;
    span.replaceChildren(Object.assign(document.createElement('strong'), { textContent: head }), ...(rest.length ? [` · ${rest.join(', ')}`] : []));
    span.style.transform = `rotate(${ang.toFixed(1)}deg) translateY(-13px)`;
    m.label.getElement().classList.toggle('is-short', Math.hypot(b.x - a.x, b.y - a.y) < 150);

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
      const boatEl = planEl('sw-pl-boat', `${PLAN_DRIFT}<span class="sw-pl-hullbox">${PLAN_HULL}</span>`);
      boatEl.tabIndex = 0;
      boatEl.setAttribute('role', 'button');
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
      const label = new maplibregl.Marker({ element: planEl('sw-pl-linelabel', '<span></span>'), anchor: 'center' }).setLngLat([p.boat.lon, p.boat.lat]).addTo(map);
      const launch = new maplibregl.Marker({ element: planEl('sw-pl-launch', '<span>Startort</span>'), anchor: 'bottom', offset: [0, -14] }).setLngLat([p.launch.lon, p.launch.lat]).addTo(map);
      planMarks.current = { boat, label, launch, drift: boatEl.querySelector('.sw-pl-drift') as HTMLElement, hull: boatEl.querySelector('.sw-pl-hullbox') as HTMLElement };
    }
    const m = planMarks.current;
    m.boat.setLngLat([p.boat.lon, p.boat.lat]);
    m.launch.setLngLat([p.launch.lon, p.launch.lat]);
    // No label at the boat: the wind of the hour stands in the hour band and the findings; here it is only read out.
    m.boat.getElement().setAttribute('aria-label', `Boot, ${p.badge}. Ziehen oder mit den Pfeiltasten verschieben, 100 Meter je Schritt.`);
    m.boat.getElement().className = `${m.boat.getElement().className.replace(/ is-(see|land|quer|calm)/g, '')} is-${p.driftTo == null || !p.side ? 'calm' : p.side}`;
    m.drift.style.transform = `rotate(${p.driftTo == null ? 0 : Math.round(p.driftTo)}deg)`;
    drawPlan(p.boat.lat, p.boat.lon);
  }
  useEffect(syncPlan, [plan?.launch.lon, plan?.launch.lat, plan?.boat.lon, plan?.boat.lat, plan?.radiusKm, plan?.driftTo, plan?.side, plan?.badge, plan?.lineLabel, !plan]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Phase AM: the leg ------------------------------------------------------------------------------------------
  /** The catalogue spot under a screen point (a little slack around it), or null. */
  function spotAt(pt: { x: number; y: number }): string | null {
    const map = mapRef.current;
    if (!map || !ready.current || !map.getLayer('sw-spots')) return null;
    const f = map.queryRenderedFeatures([[pt.x - 10, pt.y - 10], [pt.x + 10, pt.y + 10]], { layers: ['sw-spots'] })[0];
    return f?.properties?.id != null ? String(f.properties.id) : null;
  }
  /** V-AM-9: the arrows beside the route as markers without pointer events — rebuilt with the leg and after a zoom, gone while a point is dragged. */
  function syncArrows() {
    const map = mapRef.current, t = tripRef.current, marks = tripMarks.current;
    for (const m of marks.arr) m.remove();
    marks.arr = [];
    if (!map || !t || tripDrag.current || !t.arrows.length) return;
    // Labels already on the map (names of the points, the boat's label): an arrow gives way to them.
    const box = map.getContainer().getBoundingClientRect(), blocked: TripRect[] = [];
    for (const el of [...marks.pts.map((m) => m.getElement().querySelector('span')), marks.boat && t.boat ? marks.boat.getElement().querySelector('.sw-am-boatlabel') : null]) {
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0) blocked.push({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
    }
    for (const p of tripArrowLayout(t.arrows, t.arrows.map((a) => map.project([a.lon, a.lat])), t.arrowSel, blocked)) {
      const i = p.i;
      const a = t.arrows[i], el = planEl(`sw-am-arr is-${a.kind}${a.over ? ' is-over' : ''}`, TRIP_ARROW);
      (el.firstElementChild as SVGElement).style.transform = `rotate(${Math.round(a.to)}deg)`;
      const label = document.createElement('span');
      label.className = 'sw-am-arr-l';
      label.textContent = a.label;
      if (p.align) label.classList.add(p.align === 1 ? 'is-from' : 'is-to');
      label.style.top = `calc(50% + ${p.labelDy}px)`;
      el.append(label);
      marks.arr.push(new maplibregl.Marker({ element: el, anchor: 'center', offset: [p.dx, p.dy] }).setLngLat([a.lon, a.lat]).addTo(map));
      // The table says the same in words; the picture is not read out a second time.
      el.setAttribute('aria-hidden', 'true');
    }
  }
  /** Route, points and boat first; the arrows last, because they give way to the labels of both. */
  function syncTrip() { syncRoute(); syncArrows(); }
  function syncRoute() {
    const map = mapRef.current, t = tripRef.current, marks = tripMarks.current;
    if (!map) return;
    // A point is being dragged: nothing is rebuilt under the finger (a wind answer arriving meanwhile waits for the drop).
    if (tripDrag.current) return;
    const src = ready.current ? map.getSource('sw-trip') as maplibregl.GeoJSONSource | undefined : undefined;
    for (const m of marks.pts) m.remove();
    marks.pts = [];
    map.getCanvas().style.cursor = t?.armed ? 'crosshair' : '';
    if (!t) { marks.boat?.remove(); marks.boat = null; src?.setData(EMPTY); return; }
    src?.setData({ type: 'FeatureCollection', features: t.pieces.filter((p) => p.coords.length > 1).map((p) => ({ type: 'Feature', properties: { status: p.status }, geometry: { type: 'LineString', coordinates: p.coords } })) });
    t.points.forEach((p, i) => {
      const el = planEl(`sw-am-pt is-${p.role}`, '<i></i>');
      if (p.label) { const b = document.createElement('span'); b.textContent = p.label; el.append(b); }
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${p.role === 'start' ? 'Start' : p.role === 'end' ? 'Ziel' : `Wegpunkt ${i}`}${p.label ? ` ${p.label}` : ''}. Ziehen verschiebt, Entf löscht.`);
      const m = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(map);
      // While a point is dragged the line follows as one dashed stretch; the values come back when it is dropped.
      m.on('drag', () => { src?.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { status: 'missing' }, geometry: { type: 'LineString', coordinates: marks.pts.map((x) => { const ll = x.getLngLat(); return [ll.lng, ll.lat]; }) } }] }); });
      m.on('dragstart', () => { tripDrag.current = true; syncArrows(); });
      m.on('dragend', () => { tripDrag.current = false; const ll = m.getLngLat(); tripRef.current?.onMove(i, ll.lat, ll.lng, spotAt(map.project(ll))); syncTrip(); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); tripRef.current?.onRemove(i); } });
      marks.pts.push(m);
    });
    if (!t.boat) { marks.boat?.remove(); marks.boat = null; return; }
    if (!marks.boat) marks.boat = new maplibregl.Marker({ element: planEl('sw-am-boat', `<span class="sw-pl-hullbox">${PLAN_HULL}</span><span class="sw-am-boatlabel"></span>`), anchor: 'center' }).setLngLat([t.boat.lon, t.boat.lat]).addTo(map);
    marks.boat.setLngLat([t.boat.lon, t.boat.lat]);
    const el = marks.boat.getElement();
    (el.querySelector('.sw-pl-hullbox') as HTMLElement).style.transform = `rotate(${Math.round(t.boat.course)}deg)`;
    (el.querySelector('.sw-am-boatlabel') as HTMLElement).textContent = t.boat.label;
  }
  // The own point: a crosshair while the next click sets it (a leg sets its own cursor in `syncRoute`).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || tripRef.current) return;
    map.getCanvas().style.cursor = pick?.armed ? 'crosshair' : '';
  }, [pick?.armed]);
  useEffect(syncTrip, [trip?.pieces, trip?.points, trip?.boat?.lat, trip?.boat?.lon, trip?.boat?.course, trip?.boat?.label, trip?.armed, trip?.arrows, trip?.arrowSel, !trip]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- Phase SR: ripples of the surface current ----------------------------------------------------------------
  // Spots, gauges and stations lie in the map canvas below the ripple canvas: the layer leaves a circle free around each.
  const keepOut: RippleKeepOut[] = ripple ? [
    ...spots.map((p) => ({ lon: p.lon, lat: p.lat, r: p.id === selectedId ? 13 : 9 })),
    ...(gauges ?? []).map((p) => ({ lon: p.lon, lat: p.lat, r: 8 })),
    ...(stations ?? []).map((p) => ({ lon: p.lon, lat: p.lat, r: 7 })),
  ] : [];
  rippleWant.current = { grid: ripple, on: rippleOn, keep: keepOut };
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const l = rippleLayer.current, w = rippleWant.current;
      if (!l) return;
      l.setKeepOut(w.keep); l.setActive(w.on); l.setField(w.grid);
    };
    if (rippleLayer.current || !ripple) { apply(); return; }
    // The canvas layer is loaded when the layer is first chosen — nobody else pays for it.
    let alive = true;
    void import('./SeaRippleLayer').then((m) => {
      if (!alive || mapRef.current !== map) return;
      rippleLayer.current ??= new m.SeaRippleLayer(map, SEA_START_BOUNDS);
      apply();
    }, () => {});
    return () => { alive = false; };
  }, [ripple, rippleOn, spots, selectedId, gauges, stations]);

  // Phase BS-P: the wind particles. Off = the layer is taken out of the map again; the chunk is loaded when they are first
  // wanted, and the layer goes in only after the map's own layers exist (it lies right below the arrows).
  const particleT = particles?.tMs ?? null;
  particleWant.current = particles ? { tMs: particles.tMs, on: rippleOn, onState: particles.onState } : null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (particleT == null) { particleLayer.current?.destroy(); particleLayer.current = null; return; }
    const l = particleLayer.current;
    if (l) { l.setTime(particleT); l.setActive(rippleOn); return; }
    let alive = true;
    const start = () => {
      void import('./SeaParticleLayer').then((m) => {
        const w = particleWant.current;
        if (!alive || mapRef.current !== map || particleLayer.current || !w) return;
        particleLayer.current = new m.SeaParticleLayer(map, w.tMs, (s) => particleWant.current?.onState(s));
        particleLayer.current.setActive(w.on);
      }, () => { if (alive) particleWant.current?.onState({ kind: 'na' }); });
    };
    if (ready.current) start(); else map.once('load', () => { if (alive) start(); });
    return () => { alive = false; };
  }, [particleT, rippleOn]);

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
