/**
 * Phase ZT (`audit/zelltuerme-3d.md` §6a): 3D stage "Zelltürme auf Gelände" of the Regenradar — lazy chunk; on, `?z3d=0` off.
 *
 * Its own MapLibre instance (the main map must stay flat: `WindLayer` assumes pitch/bearing 0). Pattern of
 * `src/event/EventTerrainMap.tsx` (Terrarium `raster-dem`, `setTerrain` ×1,3, sand hillshade, "⤢"), copied with this
 * origin note as ET did; basemap positron like the Regenradar (E-ZT-10). Built-in 3D only — no custom layer, no shader:
 *  - towers + hail core: `fill-extrusion` from `towerModel.ts` (GeoJSON source with `maxzoom: 7`, so a cell is not cut
 *    at tile borders — MapLibre lifts each tile piece to its own centroid, spike `audit/zelltuerme-3d/`)
 *  - track and ellipses up to +60 min: `buildCellFeatures` unchanged, as draped `fill`/`line`
 *  - radar of the slider time: CPU picture (`radarDrape.ts`) in a `canvas` source, draped by the terrain
 * Time: the slider time of the deck. Camera: centre/zoom linked both ways with the main map, rotation/pitch 3D only.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Konrad3dCell, Konrad3dRun } from '../../radar/konrad3d';
import { buildCellFeatures } from '../../radar/cellPolygons';
import { inKonradReach } from '../../radar/cellPlaces';
import {
  buildTowerFeatures, DBZ_COLOR_STOPS, HAIL_CORE_COLOR, hasHail, TOWER_EXAGGERATION, TOWER_OPACITY, type TowerHeights,
} from './towerModel';
import { cellTrend, TREND_LABEL, type TrendResult } from './towerTrend';
import { konradSlotFor, loadTowerRuns, type TowerRuns } from './konradAt';
import { drapeCorners, drapeImageSliced, type DrapeBox, type TowerRadarPick } from './radarDrape';
import './cellTowers.css';

// Terrain constants: same values as EventTerrainMap / RouteTerrainMap (no second truth for the relief).
const DEM_SRC = 'zt-dem';
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const HILLSHADE_ID = 'zt-hillshade';
const STAGE_PITCH = 60;
const ILLUMINATION_DEG = 335;
const SRC_RADAR = 'zt-radar';
const SRC_TRACKS = 'zt-tracks';
const SRC_TOWERS = 'zt-towers';
/** First draped layer of the stage — other modules (SK snow cap) insert below it. */
export const ZT_FIRST_DRAPED_LAYER = 'zt-cone';
/** Track and ellipse colour (terracotta of the deck). */
const TRACK_COLOR = '#A85E2E';
const INK = '#2C2A26';
/** The cell forecast ends at +60 min (KONRAD3D, 12 steps). */
const CELL_HORIZON_MS = 60 * 60_000;
/** Radar picture: max side in px (E-ZT-6; mobile half the work). */
const DRAPE_PX = { desktop: 768, mobile: 512 } as const;
/** Radar picture box: at most this span around the centre (the far horizon of a 60° view would cost pixels for nothing). */
const DRAPE_MAX_SPAN = { lon: 7, lat: 4.2 };
/** Radar grids of DACH (outside nothing to drape). */
const DRAPE_LIMIT: DrapeBox = { west: 1.5, south: 43.5, east: 19.5, north: 56.5 };

export interface TowerInfo {
  id: number;
  runRefMs: number;
  cell: Konrad3dCell;
  heights: TowerHeights | null;
  trend: TrendResult;
}
export interface TowerSnapshot { runRefMs: number | null; infos: TowerInfo[] }

export interface TowerStageProps {
  /** Slider time of the deck (absolute validity time); null = not known yet ⇒ now. */
  timeMs: number | null;
  /** Main map (flat) for the camera link; null = none (mobile tab without map instance yet). */
  mainMap: maplibregl.Map | null;
  /** Radar frames of the slider time from `MapView` (HD); null = none reported (e.g. `?hd=0`). */
  radar: TowerRadarPick | null;
  selectedId: number | null;
  onTowerPick: (id: number) => void;
  /** Towers of the shown run (for the Steckbrief). */
  onTowers?: (s: TowerSnapshot) => void;
  /** The stage map after terrain + hillshade are set; null on unmount (other modules add their layers there). */
  onStageReady?: (map: maplibregl.Map | null) => void;
  variant: 'desktop' | 'mobile';
  /** Start centre when there is no main map. */
  fallbackCenter: { lat: number; lon: number };
}

function supportsWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
const hm = (ms: number) => new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

function emptyFc(): GeoJSON.FeatureCollection { return { type: 'FeatureCollection', features: [] }; }

/** Box of the radar picture: visible bounds clipped to a span around the centre and to DACH. */
function drapeBoxOf(map: maplibregl.Map): DrapeBox | null {
  const b = map.getBounds(), c = map.getCenter();
  const box = {
    west: Math.max(b.getWest(), c.lng - DRAPE_MAX_SPAN.lon, DRAPE_LIMIT.west),
    east: Math.min(b.getEast(), c.lng + DRAPE_MAX_SPAN.lon, DRAPE_LIMIT.east),
    south: Math.max(b.getSouth(), c.lat - DRAPE_MAX_SPAN.lat, DRAPE_LIMIT.south),
    north: Math.min(b.getNorth(), c.lat + DRAPE_MAX_SPAN.lat, DRAPE_LIMIT.north),
  };
  return box.east > box.west && box.north > box.south ? box : null;
}

export default function TowerStage({ timeMs, mainMap, radar, selectedId, onTowerPick, onTowers, onStageReady, variant, fallbackCenter }: TowerStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const [runs, setRuns] = useState<TowerRuns | null>(null);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [centerInReach, setCenterInReach] = useState(true);
  const [terrainTick, setTerrainTick] = useState(0);
  const [drapeState, setDrapeState] = useState<'none' | 'ok' | 'off'>('none');
  const cbRef = useRef({ onTowerPick, onTowers, onStageReady });
  cbRef.current = { onTowerPick, onTowers, onStageReady };
  const mainRef = useRef(mainMap);
  mainRef.current = mainMap;

  // Clock for the newest slot (a new KONRAD3D run every 5 min).
  useEffect(() => { const t = setInterval(() => setNowMs(Date.now()), 60_000); return () => clearInterval(t); }, []);

  // --- map, once -----------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const main = mainRef.current;
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/positron',
      center: main ? main.getCenter() : [fallbackCenter.lon, fallbackCenter.lat],
      zoom: main ? main.getZoom() : 8,
      pitch: STAGE_PITCH,
      bearing: 0,
      maxPitch: 80,
      fadeDuration: 0,
      // Same cap as the main map on touch devices (MapView.tsx: coarse pointer ⇒ ≤ 1,5) — the phone has to stay fluid.
      ...(coarse || variant === 'mobile' ? { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) } : {}),
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Probe hook for the CDP check (`scripts/cell-towers-probe.mjs`), only with `?ztdebug=1`.
    if (/[?&]ztdebug=1/.test(window.location.search)) (window as unknown as { __ztStage?: maplibregl.Map }).__ztStage = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.once('load', () => {
      map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]').forEach((d) => d.removeAttribute('open'));
    });
    map.on('load', () => {
      map.addSource(DEM_SRC, { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      map.setTerrain({ source: DEM_SRC, exaggeration: TOWER_EXAGGERATION });
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      map.addLayer({
        id: HILLSHADE_ID, type: 'hillshade', source: DEM_SRC,
        paint: {
          'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#4A4234', 'hillshade-accent-color': '#6B5A45',
          'hillshade-illumination-anchor': 'map', 'hillshade-illumination-direction': ILLUMINATION_DEG,
        },
      }, firstSymbol);
      try {
        map.setSky({
          'sky-color': '#DCE3EA', 'horizon-color': '#F3EEE2', 'fog-color': '#F3EEE2',
          'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4,
        });
      } catch { /* setSky depends on the version */ }

      // Radar picture (canvas source, filled by the drape effect).
      const canvas = document.createElement('canvas');
      canvas.width = 2; canvas.height = 2;
      map.addSource(SRC_RADAR, { type: 'canvas', canvas, animate: false, coordinates: drapeCorners(DRAPE_LIMIT) });
      map.addLayer({ id: 'zt-radar', type: 'raster', source: SRC_RADAR, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstSymbol);

      // Track and ellipses (2D geometry of the cell layer, draped).
      map.addSource(SRC_TRACKS, { type: 'geojson', data: emptyFc() });
      map.addLayer({ id: ZT_FIRST_DRAPED_LAYER, type: 'fill', source: SRC_TRACKS, filter: ['==', ['get', 'kind'], 'cone'], paint: { 'fill-color': TRACK_COLOR, 'fill-opacity': 0.07 } }, firstSymbol);
      map.addLayer({
        id: 'zt-cone-step', type: 'fill', source: SRC_TRACKS, filter: ['==', ['get', 'kind'], 'cone-step'],
        paint: { 'fill-color': TRACK_COLOR, 'fill-opacity': ['interpolate', ['linear'], ['get', 'leadMin'], 5, 0.16, 60, 0.04] },
      }, firstSymbol);
      map.addLayer({ id: 'zt-cone-now', type: 'fill', source: SRC_TRACKS, filter: ['==', ['get', 'leadMin'], -1], paint: { 'fill-color': TRACK_COLOR, 'fill-opacity': 0.26 } }, firstSymbol);
      map.addLayer({ id: 'zt-cone-now-line', type: 'line', source: SRC_TRACKS, filter: ['==', ['get', 'leadMin'], -1], paint: { 'line-color': TRACK_COLOR, 'line-width': 1.6 } }, firstSymbol);
      map.addLayer({
        id: 'zt-path', type: 'line', source: SRC_TRACKS, filter: ['==', ['get', 'kind'], 'path'],
        layout: { 'line-cap': 'round' }, paint: { 'line-color': TRACK_COLOR, 'line-width': 2.2, 'line-dasharray': [2, 1.5] },
      }, firstSymbol);
      map.addLayer({ id: 'zt-hull-line', type: 'line', source: SRC_TRACKS, filter: ['==', ['get', 'kind'], 'hull'], paint: { 'line-color': INK, 'line-width': 1.1, 'line-opacity': 0.7 } }, firstSymbol);
      map.addLayer({ id: 'zt-hull-sel', type: 'line', source: SRC_TRACKS, filter: ['all', ['==', ['get', 'kind'], 'hull'], ['==', ['get', 'id'], -1]], paint: { 'line-color': INK, 'line-width': 3 } }, firstSymbol);

      // Towers: core BELOW tower (the core shows through the translucent walls), both on top of the style.
      map.addSource(SRC_TOWERS, { type: 'geojson', data: emptyFc(), maxzoom: 7 });
      map.addLayer({
        id: 'zt-tower-core', type: 'fill-extrusion', source: SRC_TOWERS, filter: ['==', ['get', 'kind'], 'core'],
        paint: { 'fill-extrusion-color': HAIL_CORE_COLOR, 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 1 },
      });
      map.addLayer({
        id: 'zt-tower', type: 'fill-extrusion', source: SRC_TOWERS, filter: ['==', ['get', 'kind'], 'tower'],
        paint: {
          'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-base': ['get', 'base'], 'fill-extrusion-height': ['get', 'height'],
          'fill-extrusion-opacity': TOWER_OPACITY, 'fill-extrusion-vertical-gradient': true,
        },
      });

      map.on('click', 'zt-tower', (e) => {
        const id = Number(e.features?.[0]?.properties?.id);
        if (Number.isFinite(id)) cbRef.current.onTowerPick(id);
      });
      map.on('mouseenter', 'zt-tower', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'zt-tower', () => { map.getCanvas().style.cursor = ''; });
      setReady(true);
      cbRef.current.onStageReady?.(map);
    });
    // Ground heights come from the loaded DEM tiles ⇒ rebuild the towers when terrain tiles arrive (debounced).
    let demTimer: ReturnType<typeof setTimeout> | null = null;
    map.on('sourcedata', (e) => {
      if (e.sourceId !== DEM_SRC || !e.isSourceLoaded) return;
      if (demTimer) clearTimeout(demTimer);
      demTimer = setTimeout(() => setTerrainTick((t) => t + 1), 300);
    });
    const onMoveEnd = () => { const c = map.getCenter(); setCenterInReach(inKonradReach(c.lat, c.lng)); };
    map.on('moveend', onMoveEnd);
    onMoveEnd();
    return () => {
      if (demTimer) clearTimeout(demTimer);
      cbRef.current.onStageReady?.(null);
      setReady(false);
      map.remove();
      mapRef.current = null;
    };
    // The map is built once; everything else runs in the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- camera link (centre/zoom both ways; rotation/pitch stay in 3D) ----------------------------------------
  useEffect(() => {
    const stage = mapRef.current;
    if (!ready || !stage || !mainMap) return;
    let fromMain = false, fromStage = false;
    const onMain = () => {
      if (fromStage) return;
      fromMain = true;
      stage.jumpTo({ center: mainMap.getCenter(), zoom: mainMap.getZoom() });
      fromMain = false;
    };
    const onStage = () => {
      if (fromMain) return;
      fromStage = true;
      mainMap.jumpTo({ center: stage.getCenter(), zoom: stage.getZoom() });
      fromStage = false;
    };
    stage.jumpTo({ center: mainMap.getCenter(), zoom: mainMap.getZoom() });
    mainMap.on('move', onMain);
    stage.on('move', onStage);
    return () => { mainMap.off('move', onMain); stage.off('move', onStage); };
  }, [ready, mainMap]);

  // --- runs for the slider time --------------------------------------------------------------------------------
  const tMs = timeMs ?? nowMs;
  const slotPick = konradSlotFor(tMs, nowMs);
  const slotKey = slotPick.kind === 'slot' ? `s${slotPick.slotMs}` : 'old';
  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadTowerRuns(tMs, Date.now()).then((r) => { if (alive) { setRuns(r); setLoading(false); } }, () => { if (alive) { setRuns(null); setLoading(false); } });
    return () => { alive = false; };
    // Reload only when the slot changes, not on every slider frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotKey]);

  const run: Konrad3dRun | null = runs?.run ?? null;
  const beyondHorizon = run != null && tMs > run.refMs + CELL_HORIZON_MS;
  const showCells = run != null && !beyondHorizon;

  // --- towers + tracks -------------------------------------------------------------------------------------------
  const lastTowerKey = useRef('');
  const [infos, setInfos] = useState<TowerInfo[]>([]);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const towersSrc = map.getSource(SRC_TOWERS) as maplibregl.GeoJSONSource | undefined;
    const tracksSrc = map.getSource(SRC_TRACKS) as maplibregl.GeoJSONSource | undefined;
    if (!towersSrc || !tracksSrc) return;
    if (!run || !showCells) {
      if (lastTowerKey.current !== 'empty') { towersSrc.setData(emptyFc()); tracksSrc.setData(emptyFc()); lastTowerKey.current = 'empty'; }
      setInfos([]);
      cbRef.current.onTowers?.({ runRefMs: run?.refMs ?? null, infos: [] });
      return;
    }
    const demReady = map.isSourceLoaded(DEM_SRC);
    const groundAt = (lon: number, lat: number): number | null => {
      const e = map.queryTerrainElevation([lon, lat]);
      if (e == null || (!demReady && e === 0)) return null;
      return e / TOWER_EXAGGERATION;
    };
    const built = buildTowerFeatures(run, groundAt);
    // Only set new data when something changed (setData on terrain events must not loop — lesson 3 of the fire line).
    const key = `${run.refMs}|${built.fc.features.map((f) => `${f.properties.id}:${Math.round(f.properties.base)}:${Math.round(f.properties.height)}`).join(',')}`;
    if (key !== lastTowerKey.current) {
      towersSrc.setData(built.fc);
      tracksSrc.setData(buildCellFeatures(run));
      lastTowerKey.current = key;
    }
    const next: TowerInfo[] = run.cells.map((cell) => ({
      id: cell.id, runRefMs: run.refMs, cell, heights: built.heights.get(cell.id) ?? null, trend: cellTrend(cell, run.refMs, runs?.prev ?? null),
    }));
    setInfos(next);
    cbRef.current.onTowers?.({ runRefMs: run.refMs, infos: next });
  }, [ready, run, runs, showCells, terrainTick]);

  // Highlight: selected footprint and the ellipse of the slider time (future only, E-ZT-5).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.setFilter('zt-hull-sel', ['all', ['==', ['get', 'kind'], 'hull'], ['==', ['get', 'id'], selectedId ?? -1]]);
    let lead = -1;
    if (run && showCells && tMs > run.refMs) lead = Math.min(60, Math.max(5, Math.round((tMs - run.refMs) / 300_000) * 5));
    const f: maplibregl.FilterSpecification = ['all', ['==', ['get', 'kind'], 'cone-step'], ['==', ['get', 'leadMin'], lead]];
    map.setFilter('zt-cone-now', f);
    map.setFilter('zt-cone-now-line', f);
  }, [ready, selectedId, run, showCells, tMs]);

  // --- radar picture --------------------------------------------------------------------------------------------
  const [boxTick, setBoxTick] = useState(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onEnd = () => { if (t) clearTimeout(t); t = setTimeout(() => setBoxTick((n) => n + 1), 250); };
    map.on('moveend', onEnd);
    return () => { if (t) clearTimeout(t); map.off('moveend', onEnd); };
  }, [ready]);
  const drapeJob = useRef(0);
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = map.getSource(SRC_RADAR) as maplibregl.CanvasSource | undefined;
    if (!src) return;
    if (!radar) { map.setLayoutProperty('zt-radar', 'visibility', 'none'); setDrapeState('off'); return; }
    const box = drapeBoxOf(map);
    if (!box) { map.setLayoutProperty('zt-radar', 'visibility', 'none'); return; }
    const job = ++drapeJob.current;
    const maxPx = DRAPE_PX[variant];
    const lonSpan = box.east - box.west;
    const latSpanMerc = Math.log(Math.tan(Math.PI / 4 + (box.north * Math.PI) / 360)) - Math.log(Math.tan(Math.PI / 4 + (box.south * Math.PI) / 360));
    const ratio = (latSpanMerc * 180 / Math.PI) / lonSpan;
    const w = ratio <= 1 ? maxPx : Math.max(32, Math.round(maxPx / ratio));
    const h = ratio <= 1 ? Math.max(32, Math.round(maxPx * ratio)) : maxPx;
    void drapeImageSliced(radar, box, w, h, () => drapeJob.current !== job).then((rgba) => {
      if (!rgba || drapeJob.current !== job || mapRef.current !== map) return;
      const canvas = src.getCanvas();
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.getContext('2d')?.putImageData(new ImageData(rgba, w, h), 0, 0);
      src.setCoordinates(drapeCorners(box));
      src.play(); src.pause();               // uploads the texture once (CanvasSource.prepare with _playing)
      map.setLayoutProperty('zt-radar', 'visibility', 'visible');
      map.triggerRepaint();
      setDrapeState('ok');
    });
  }, [ready, radar, boxTick, variant]);

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    const main = mainRef.current;
    map.easeTo({ pitch: STAGE_PITCH, bearing: 0, ...(main ? { center: main.getCenter(), zoom: main.getZoom() } : {}), duration: 600 });
  };

  // --- notes (no empty air, Auftrag) ------------------------------------------------------------------------------
  const note = useMemo(() => {
    if (!centerInReach) return 'Keine Zelldaten: der deutsche Radarverbund reicht hier nicht hin (Österreich und Schweiz ohne Zellprodukt).';
    if (loading && !run) return 'Zelldaten werden geladen …';
    if (slotPick.kind === 'too-old') return `Für diese Zeit liegen keine Zelldaten mehr vor (Rückblick bis ${hm(slotPick.oldestMs)}).`;
    if (!run) return `Für ${hm(slotPick.slotMs)} fehlt der Zell-Lauf im Spiegel — keine Türme statt alter Zellen.`;
    if (beyondHorizon) return `Die Zellvorhersage reicht bis ${hm(run.refMs + CELL_HORIZON_MS)} (+60 min) — danach keine Türme.`;
    if (run.cells.length === 0) return 'KONRAD3D: zu dieser Zeit keine konvektiven Zellen erkannt (DE).';
    return null;
  }, [centerInReach, loading, run, slotPick, beyondHorizon]);

  const stamp = run && showCells
    ? `Zellen: Messung ${hm(run.refMs)}${tMs > run.refMs + 2 * 60_000 ? ' · Türme am Messort, Zukunft als Bahn' : ''}`
    : null;
  const hailInView = infos.some((i) => hasHail(i.cell));

  return (
    <div className={`zt-stage zt-stage--${variant}`} aria-label="3D-Bühne: Zelltürme auf Gelände">
      <div ref={containerRef} className="zt-map" />
      {noWebgl && <div className="zt-note zt-note--center">3D braucht WebGL — dieses Gerät bietet es nicht. Die Karte links bleibt vollständig.</div>}
      {stamp && <div className="zt-stamp">{stamp}</div>}
      {note && !noWebgl && <div className="zt-note" role="status">{note}</div>}
      <button type="button" className="zt-reset" onClick={resetView} aria-label="Ansicht zurücksetzen" title="Ansicht zurücksetzen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Ansicht zurücksetzen</span>
      </button>
      <TowerLegend variant={variant} hail={hailInView} drape={drapeState} />
    </div>
  );
}

function TowerLegend({ variant, hail, drape }: { variant: 'desktop' | 'mobile'; hail: boolean; drape: 'none' | 'ok' | 'off' }) {
  const body = (
    <>
      <div className="zt-leg-title">Zelltürme · max. Reflektivität (dBZ)</div>
      <div className="zt-leg-scale">
        {DBZ_COLOR_STOPS.map((s) => <span key={s.label} className="zt-leg-item"><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <div className="zt-leg-row"><i className="zt-leg-core" style={{ background: HAIL_CORE_COLOR }} />Hagelkern · Fläche gemessen, Lage schematisch{hail ? '' : ' (keine im Lauf)'}</div>
      <div className="zt-leg-row"><i className="zt-leg-track" />Zugbahn und Unsicherheit bis +60 min</div>
      <div className="zt-leg-foot">
        Höhen über Grund (Echohöhen ü. NN minus Gelände am Zellmittelpunkt) · Gelände und Türme {de(TOWER_EXAGGERATION, 1)}-fach überhöht ·
        Zellen nur im DE-Radarverbund (DWD KONRAD3D){drape === 'off' ? ' · Radar auf dem Relief nur mit HD-Radar' : ''}
      </div>
    </>
  );
  if (variant === 'mobile') return <details className="zt-legend zt-legend--mobile"><summary>Legende</summary>{body}</details>;
  return <div className="zt-legend">{body}</div>;
}

/** Steckbrief block of a tower (readout desktop, under the stage mobile). */
export function TowerFacts({ info, variant }: { info: TowerInfo; variant: 'desktop' | 'mobile' }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => { if (variant === 'desktop') ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [info.id, variant]);
  const { cell, heights: h, trend } = info;
  const km = (m: number) => `${de(m / 1000, 1)} km`;
  const base = h == null || h.baseMslM == null ? 'n. v.'
    : h.baseBelowGround ? 'unter Geländehöhe' : `${de(Math.round(h.baseAglM / 10) * 10)} m über Grund`;
  const top = h?.topAglM != null ? `${km(h.topAglM)} über Grund` : 'n. v.';
  const trendSub = trend.dTopM != null || trend.dVil != null
    ? [trend.dTopM != null ? `Echotop ${trend.dTopM >= 0 ? '+' : '−'}${de(Math.abs(Math.round(trend.dTopM)))} m` : null,
      trend.dVil != null ? `VIL ${trend.dVil >= 0 ? '+' : '−'}${de(Math.abs(trend.dVil), 1)} kg/m²` : null].filter(Boolean).join(' · ') + ' je 5 min'
    : trend.trend === 'new' ? 'erst seit diesem Lauf erkannt' : 'kein Vergleichslauf';
  return (
    <section ref={ref} className={`zt-facts zt-facts--${variant}`} aria-label={`Zelle ${cell.id} im 3D`}>
      <div className="zt-facts-head">
        <span className="zt-facts-eyebrow">Zelle {cell.id} · Turm im 3D</span>
        <span className={`zt-trend zt-trend--${trend.trend}`}>{TREND_LABEL[trend.trend]}</span>
      </div>
      <dl className="zt-facts-grid">
        <div><dt>Echobasis</dt><dd>{base}</dd>{h?.baseMslM != null && <dd className="zt-sub">{de(h.baseMslM)} m ü. NN</dd>}</div>
        <div><dt>Echotop</dt><dd>{top}</dd>{h?.topMslM != null && <dd className="zt-sub">{de(h.topMslM)} m ü. NN</dd>}</div>
        <div><dt>Blitzrate</dt><dd>{cell.lightningRate != null ? (cell.lightningRate > 0 ? `${de(cell.lightningRate)} / 5 min` : 'keine') : 'n. v.'}</dd></div>
        <div><dt>Trend</dt><dd>{TREND_LABEL[trend.trend]}</dd><dd className="zt-sub">{trendSub}</dd></div>
        <div><dt>Reflektivität</dt><dd>{cell.dbzMax != null ? `${de(cell.dbzMax, 1)} dBZ max.` : 'n. v.'}</dd></div>
        {hasHail(cell) && (
          <div><dt>Hagel</dt><dd>{cell.hailAreaKm2 != null && cell.hailAreaKm2 > 0 ? `${de(cell.hailAreaKm2, 1)} km²` : 'Hinweis'}</dd>
            {h?.hailTopAglM != null && <dd className="zt-sub">bis {km(Math.max(0, h.hailTopAglM))} über Grund</dd>}</div>
        )}
      </dl>
      <p className="zt-facts-foot">
        Messzeit {hm(info.runRefMs)} · Höhen über Grund am Zellmittelpunkt
        {h?.groundM != null ? ` (Gelände ${de(Math.round(h.groundM))} m ü. NN, Terrarium)` : ' (Gelände nicht geladen — auf 0 m gerechnet)'}
        {' · '}Trend gegen den Lauf 5 min davor · Hinweis aus dem Radar, keine Warnung · maßgeblich sind die DWD-Warnungen
      </p>
    </section>
  );
}
