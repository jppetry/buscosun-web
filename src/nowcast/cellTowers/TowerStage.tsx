/**
 * 3D stage of the Regenradar — lazy chunk; on, `?z3d=0` off. Since the cell towers were dropped it serves snow only: terrain +
 * the ICON-D2 snow area (`snow` layer, `snowDrape.ts`) + the radar picture of the slider time + the snow-line surface of Phase SK, which
 * `NowcastRadarMap` adds to this map via `onStageReady` (`snowline` layer).
 *
 * Its own MapLibre instance (the main map must stay flat: `WindLayer` assumes pitch/bearing 0). Pattern of
 * `src/event/EventTerrainMap.tsx` (Terrarium `raster-dem`, `setTerrain` ×1,3, sand hillshade, "⤢"), copied with this
 * origin note as ET did; basemap positron like the Regenradar (E-ZT-10). Built-in 3D only — no custom layer, no shader:
 *  - radar of the slider time and the snow area: CPU pictures (`radarDrape.ts`, `snowDrape.ts`) in `canvas` sources, draped by the terrain
 * Time: the slider time of the deck. Camera: centre/zoom linked both ways with the main map, rotation/pitch 3D only.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TOWER_EXAGGERATION } from './towerModel';
import { fetchIconD2Snow, type IconD2Snow, type SnowMode } from '../../sources/iconD2Snow';
import { frameAtValidTime } from '../../sources/frameAtValidTime';
import { snowImageSliced } from './snowDrape';
import { drapeCorners, drapeImageSliced, type DrapeBox, type TowerRadarPick } from './radarDrape';
import './cellTowers.css';

// Terrain constants: same values as EventTerrainMap / RouteTerrainMap (no second truth for the relief).
const DEM_SRC = 'zt-dem';
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const HILLSHADE_ID = 'zt-hillshade';
/**
 * Start- und Rücksetz-Ansicht (Jans Auftrag 2026-10-23): flacher (tiefere Kamera) und nach Süden auf die Alpen, wo der meiste
 * Schnee fällt. Das Ziel liegt am Alpennordrand, damit der Hauptkamm in der oberen Bildhälfte steht und das Vorland davor.
 */
const STAGE_PITCH = 68;
const STAGE_BEARING = 180;
const ALPS_CENTER: [number, number] = [10.8, 47.4];
const ALPS_ZOOM = { desktop: 7.4, mobile: 6.8 } as const;
const ILLUMINATION_DEG = 335;
const SRC_RADAR = 'zt-radar';
const SRC_SNOW = 'zt-snow';
/** Radar picture: max side in px (E-ZT-6; mobile half the work). */
const DRAPE_PX = { desktop: 768, mobile: 512 } as const;
/** Radar picture box: at most this span around the centre (the far horizon of a 60° view would cost pixels for nothing). */
const DRAPE_MAX_SPAN = { lon: 7, lat: 4.2 };
/** Radar grids of DACH (outside nothing to drape). */
const DRAPE_LIMIT: DrapeBox = { west: 1.5, south: 43.5, east: 19.5, north: 56.5 };

export interface TowerStageProps {
  /** Slider time of the deck (absolute validity time); null = not known yet ⇒ now. */
  timeMs: number | null;
  /** ICON-D2 snow mode of the `snow` layer; null = layer off (no snow area on the stage). */
  snow: SnowMode | null;
  /** Main map (flat) for the camera link; null = none (mobile tab without map instance yet). */
  mainMap: maplibregl.Map | null;
  /** Radar frames of the slider time from `MapView` (HD); null = none reported (e.g. `?hd=0`). */
  radar: TowerRadarPick | null;
  /** The stage map after terrain + hillshade are set; null on unmount (other modules add their layers there). */
  onStageReady?: (map: maplibregl.Map | null) => void;
  variant: 'desktop' | 'mobile';
  /** Not used any more: the stage starts on the Alps (kept so callers still compile). */
  fallbackCenter: { lat: number; lon: number };
}

const STAGE_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** Warm-up before the first 3D view: connections to the tile hosts and the style JSON (the browser keeps it for the map). */
let warmed = false;
export function warmStage(): void {
  if (warmed || typeof document === 'undefined') return;
  warmed = true;
  for (const href of ['https://tiles.openfreemap.org', 'https://elevation-tiles-prod.s3.amazonaws.com']) {
    const l = document.createElement('link');
    l.rel = 'preconnect'; l.href = href; l.crossOrigin = 'anonymous';
    document.head.appendChild(l);
  }
  void fetch(STAGE_STYLE_URL).catch(() => { /* only a warm-up */ });
}

function supportsWebGL(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
const de = (n: number, d = 0) => n.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

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

export default function TowerStage({ timeMs, snow, mainMap, radar, onStageReady, variant }: TowerStageProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const [drapeState, setDrapeState] = useState<'none' | 'ok' | 'off'>('none');
  const cbRef = useRef({ onStageReady });
  cbRef.current = { onStageReady };
  const mainRef = useRef(mainMap);
  mainRef.current = mainMap;

  // --- map, once -----------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STAGE_STYLE_URL,
      center: ALPS_CENTER,
      zoom: ALPS_ZOOM[variant],
      pitch: STAGE_PITCH,
      bearing: STAGE_BEARING,
      maxPitch: 80,
      fadeDuration: 0,
      // Same cap as the main map on touch devices (MapView.tsx: coarse pointer ⇒ ≤ 1,5) — the phone has to stay fluid.
      ...(coarse || variant === 'mobile' ? { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) } : {}),
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Probe hook for the CDP check, only with `?ztdebug=1`.
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

      // Snow area (canvas source, filled by the snow effect) — below the radar picture.
      const snowCanvas = document.createElement('canvas');
      snowCanvas.width = 2; snowCanvas.height = 2;
      map.addSource(SRC_SNOW, { type: 'canvas', canvas: snowCanvas, animate: false, coordinates: drapeCorners(DRAPE_LIMIT) });
      map.addLayer({ id: 'zt-snow', type: 'raster', source: SRC_SNOW, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstSymbol);

      // Radar picture (canvas source, filled by the drape effect).
      const canvas = document.createElement('canvas');
      canvas.width = 2; canvas.height = 2;
      map.addSource(SRC_RADAR, { type: 'canvas', canvas, animate: false, coordinates: drapeCorners(DRAPE_LIMIT) });
      map.addLayer({ id: 'zt-radar', type: 'raster', source: SRC_RADAR, paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } }, firstSymbol);
      setReady(true);
      cbRef.current.onStageReady?.(map);
    });
    return () => {
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
    // Start auf den Alpen statt am Kartenmittelpunkt; die Hauptkarte bleibt dabei stehen (die Listener hängen noch nicht).
    stage.jumpTo({ center: ALPS_CENTER, zoom: ALPS_ZOOM[variant] });
    mainMap.on('move', onMain);
    stage.on('move', onStage);
    return () => { mainMap.off('move', onMain); stage.off('move', onStage); };
  }, [ready, mainMap]);

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

  // --- snow area (ICON-D2, own load like the legacy radar map; frames are cached at the CDN) ---------------------
  const [snowData, setSnowData] = useState<IconD2Snow | null>(null);
  useEffect(() => {
    setSnowData(null);
    if (!snow) return;
    const ac = new AbortController();
    fetchIconD2Snow(snow, ac.signal, (partial) => { if (!ac.signal.aborted) setSnowData(partial); })
      .then((sd) => { if (!ac.signal.aborted) setSnowData(sd); })
      .catch(() => { /* no snow area — the stage stays usable */ });
    return () => ac.abort();
  }, [snow]);
  const snowJob = useRef(0);
  const lastSnowKey = useRef('');
  const tNowMs = timeMs ?? Date.now();
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const src = map.getSource(SRC_SNOW) as maplibregl.CanvasSource | undefined;
    if (!src) return;
    const box = snowData && snowData.frames.length > 0 ? drapeBoxOf(map) : null;
    if (!snowData || !box) { snowJob.current++; lastSnowKey.current = ''; map.setLayoutProperty('zt-snow', 'visibility', 'none'); return; }
    const frame = frameAtValidTime(snowData.frames, tNowMs, snowData.mode === 'fresh' ? 1 : 0);
    const key = `${snowData.mode}|${snowData.runAt.getTime()}|${frame.stepHours}|${boxTick}|${variant}`;
    if (key === lastSnowKey.current) return;
    const job = ++snowJob.current;
    const maxPx = DRAPE_PX[variant];
    const lonSpan = box.east - box.west;
    const latSpanMerc = Math.log(Math.tan(Math.PI / 4 + (box.north * Math.PI) / 360)) - Math.log(Math.tan(Math.PI / 4 + (box.south * Math.PI) / 360));
    const ratio = (latSpanMerc * 180 / Math.PI) / lonSpan;
    const w = ratio <= 1 ? maxPx : Math.max(32, Math.round(maxPx / ratio));
    const h = ratio <= 1 ? Math.max(32, Math.round(maxPx * ratio)) : maxPx;
    void snowImageSliced(frame, snowData.uvBounds, snowData.mode, box, w, h, () => snowJob.current !== job).then((rgba) => {
      if (!rgba || snowJob.current !== job || mapRef.current !== map) return;
      const canvas = src.getCanvas();
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.getContext('2d')?.putImageData(new ImageData(rgba, w, h), 0, 0);
      src.setCoordinates(drapeCorners(box));
      src.play(); src.pause();
      map.setLayoutProperty('zt-snow', 'visibility', 'visible');
      map.triggerRepaint();
      lastSnowKey.current = key;
    });
  }, [ready, snowData, tNowMs, boxTick, variant]);

  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ pitch: STAGE_PITCH, bearing: STAGE_BEARING, center: ALPS_CENTER, zoom: ALPS_ZOOM[variant], duration: 600 });
  };

  return (
    <div className={`zt-stage zt-stage--${variant}`} aria-label="3D-Bühne: Schnee und Schneegrenze auf Gelände">
      <div ref={containerRef} className="zt-map" />
      {noWebgl && <div className="zt-note zt-note--center">3D braucht WebGL — dieses Gerät bietet es nicht. Die Karte links bleibt vollständig.</div>}
      <button type="button" className="zt-reset" onClick={resetView} aria-label="Ansicht zurücksetzen" title="Ansicht zurücksetzen">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /><path d="M4 4v4h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span>Ansicht zurücksetzen</span>
      </button>
      <StageLegend variant={variant} drape={drapeState} snow={snow} />
    </div>
  );
}

function StageLegend({ variant, drape, snow }: { variant: 'desktop' | 'mobile'; drape: 'none' | 'ok' | 'off'; snow: SnowMode | null }) {
  const body = (
    <div className="zt-leg-foot">
      {snow ? `${snow === 'fresh' ? 'Neuschnee' : 'Schneedecke'} (ICON-D2) und Schneegrenze` : 'Schneegrenze'} auf dem Relief · Gelände {de(TOWER_EXAGGERATION, 1)}-fach überhöht{drape === 'off' ? ' · Radar auf dem Relief nur mit HD-Radar' : ''}
    </div>
  );
  if (variant === 'mobile') return <details className="zt-legend zt-legend--mobile"><summary>Legende</summary>{body}</details>;
  return <div className="zt-legend">{body}</div>;
}
