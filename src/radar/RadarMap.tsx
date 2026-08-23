/**
 * RadarMap — die GPU-Karte des High-End-Regenradars.
 *
 * Rendert das Niederschlags-Raster als WebGL-`RainLayer` (Textur-Upload statt
 * DOM-Tiles → Recoloring & Frame-Wechsel ohne Re-Fetch), plus Overlays:
 * Sturmzellen + ETA-Trichter (GeoJSON), Blitze (DWD-WMS-Tile), Coverage-
 * Maske und die Punkt-Marker. Frame-Morphing zwischen 5-min-Frames per
 * Werte-Lerp (nur während des Abspielens, sonst idle — §12 RepaintScheduler).
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RainLayer } from '../scalar/RainLayer';
import { lightningTileTemplate } from '../sources/dwdLightning';
import { sampleRadarPoint } from '../pointForecast/radarSample';
import { PALETTES, type PaletteId, type RadarLayerId, RADAR_VMAX } from './radarModel';
import { accumRamp } from './accumulation';
import { coverageRamp } from './coverageMask';
import { snowRamp, graupelRamp, hailRamp, classifyPhases, type PhaseBuffers } from './precipPhase';
import type { RadarStack } from './radarFrames';
import type { StormCell } from './cellTracking';
import type { Basemap } from './radarState';
import { loadDachMask } from '../countryMask';

const STREETS = 'https://tiles.openfreemap.org/styles/liberty';

/** Minimaler Raster-Style (Esri-Basemaps, Attribution sichtbar). */
function rasterStyle(url: string, attribution: string): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: 'raster', tiles: [url], tileSize: 256, attribution } },
    layers: [{ id: 'base', type: 'raster', source: 'base' }],
  };
}
function basemapStyle(b: Basemap): string | maplibregl.StyleSpecification {
  if (b === 'satellite') return rasterStyle(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    'Esri World Imagery');
  if (b === 'terrain') return rasterStyle(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    'Esri World Topo');
  return STREETS;
}

export interface RadarMapHandle { map: maplibregl.Map | null }

interface Props {
  stack: RadarStack;
  /** Float-Frameposition: Ganzteil = Frame, Nachkomma = Morph zum nächsten. */
  framePos: number;
  palette: PaletteId;
  opacity: number;
  basemap: Basemap;
  layers: Set<RadarLayerId>;
  accumValues: Uint8Array | null;   // wenn 'accum' aktiv
  cells: StormCell[];
  coverageValues: Uint8Array | null;
  /** Geländehöhe je Radar-Pixel (full-res) — für die Phasen-Aufteilung. */
  elevFull: Float32Array | null;
  /** Regionale Schneefallgrenze (m) — Regen/Schnee/Graupel-Trennung. */
  snowLineM: number | null;
  /** Schneefallgrenzen-Höhenlinie (GeoJSON) — wenn 'snowline' aktiv. */
  snowLineFeatures: GeoJSON.Feature[];
  point: { lat: number; lon: number };
  comparePoint: { lat: number; lon: number } | null;
  onPick: (lat: number, lon: number) => void;
  onHover: (mmH: number | null, lat: number, lon: number) => void;
  onMapRef?: (map: maplibregl.Map | null) => void;
  /** Router (RT1): Startkamera (statt Ort + Zoom 8) und Kamera-Meldung nach `moveend`. Additiv. */
  initialView?: { lat: number; lon: number; zoom: number } | null;
  onViewChange?: (v: { lat: number; lon: number; zoom: number }) => void;
}

/** Lineare Interpolation zweier u8-Werte-Grids (Frame-Morphing). */
function lerpU8(a: Uint8Array, b: Uint8Array, frac: number, out: Uint8Array): Uint8Array {
  const f = Math.max(0, Math.min(1, frac));
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) out[i] = (a[i] + (b[i] - a[i]) * f) | 0;
  return out;
}

export default function RadarMap(props: Props) {
  const {
    stack, framePos, palette, opacity, basemap, layers,
    accumValues, cells, coverageValues, elevFull, snowLineM, snowLineFeatures, point, comparePoint, onPick, onHover, onMapRef,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const rainRef = useRef<RainLayer | null>(null);
  const covRef = useRef<RainLayer | null>(null);
  // Phasen-Layer (Regen/Schnee/Graupel/Hagel) — je ein RainLayer + Wertepuffer.
  const phaseRefs = useRef<Record<'rain' | 'snow' | 'graupel' | 'hail', RainLayer | null>>({ rain: null, snow: null, graupel: null, hail: null });
  const phaseBuf = useRef<PhaseBuffers | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const cmpMarkerRef = useRef<maplibregl.Marker | null>(null);
  const morphBuf = useRef<Uint8Array | null>(null);
  const styleReady = useRef(false);
  const dachMaskRef = useRef<GeoJSON.Feature | null>(null);

  // Letzte Props in Refs, damit der einmalige Map-Init-Effect sie ohne Re-Init liest.
  const latest = useRef(props);
  latest.current = props;

  // --- Map-Init (einmal) ----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: basemapStyle(latest.current.basemap),
      center: latest.current.initialView ? [latest.current.initialView.lon, latest.current.initialView.lat] : [point.lon, point.lat],
      zoom: latest.current.initialView ? latest.current.initialView.zoom : 8,
      attributionControl: { compact: true },
      canvasContextAttributes: { preserveDrawingBuffer: true }, // PNG-Export des Frames (§6)
    });
    mapRef.current = map;
    onMapRef?.(map);
    // Router (RT1): Kamera melden (Wrapper schreibt sie debounced in die Query).
    map.on('moveend', () => {
      const c = map.getCenter();
      latest.current.onViewChange?.({ lat: c.lat, lon: c.lng, zoom: map.getZoom() });
    });
    if (import.meta.env.DEV) (window as unknown as { __radarMap: maplibregl.Map }).__radarMap = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false }), 'bottom-right');

    const marker = new maplibregl.Marker({ color: '#2E6CC4', draggable: true }).setLngLat([point.lon, point.lat]).addTo(map);
    marker.on('dragend', () => { const ll = marker.getLngLat(); onPick(ll.lat, ll.lng); });
    markerRef.current = marker;

    map.on('click', (e) => onPick(e.lngLat.lat, e.lngLat.lng));
    map.on('mousemove', (e) => {
      const st = latest.current.stack;
      const idx = Math.round(latest.current.framePos);
      const fr = st.frames[Math.max(0, Math.min(st.frames.length - 1, idx))];
      if (!fr) { onHover(null, e.lngLat.lat, e.lngLat.lng); return; }
      const v = sampleRadarPoint(st.source, fr.values, fr.width, fr.height, st.corners, e.lngLat.lat, e.lngLat.lng, RADAR_VMAX);
      onHover(v, e.lngLat.lat, e.lngLat.lng);
    });

    map.on('style.load', () => { styleReady.current = true; addRadarLayers(map); });

    return () => { onMapRef?.(null); map.remove(); mapRef.current = null; rainRef.current = null; covRef.current = null; phaseRefs.current = { rain: null, snow: null, graupel: null, hail: null }; styleReady.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fügt RainLayer + Overlay-Quellen nach (Re-)Style hinzu. */
  function addRadarLayers(map: maplibregl.Map) {
    // Niederschlags-Layer
    if (!rainRef.current) rainRef.current = new RainLayer({ id: 'radar-precip', colorRamp: PALETTES[latest.current.palette].ramp, opacity: latest.current.opacity });
    if (!map.getLayer('radar-precip')) map.addLayer(rainRef.current);
    // Phasen-Layer (Niederschlagsart) über dem Basis-Raster.
    const phaseRamps = { rain: PALETTES[latest.current.palette].ramp, snow: snowRamp, graupel: graupelRamp, hail: hailRamp } as const;
    for (const key of ['rain', 'snow', 'graupel', 'hail'] as const) {
      if (!phaseRefs.current[key]) phaseRefs.current[key] = new RainLayer({ id: `radar-${key}`, colorRamp: phaseRamps[key], opacity: latest.current.opacity });
      if (!map.getLayer(`radar-${key}`)) map.addLayer(phaseRefs.current[key]!);
    }
    // Coverage-Layer (über dem Regen, halbtransparent)
    if (!covRef.current) covRef.current = new RainLayer({ id: 'radar-coverage', colorRamp: coverageRamp, opacity: 1 });
    if (!map.getLayer('radar-coverage')) map.addLayer(covRef.current);

    // Lightning-WMS (Raster)
    if (!map.getSource('radar-lightning-src')) {
      map.addSource('radar-lightning-src', { type: 'raster', tiles: [lightningTileTemplate()], tileSize: 512, minzoom: 0, maxzoom: 10 });
    }
    if (!map.getLayer('radar-lightning')) {
      map.addLayer({ id: 'radar-lightning', type: 'raster', source: 'radar-lightning-src', paint: { 'raster-opacity': 0.75 }, layout: { visibility: 'none' } });
    }

    // Zellen-Quellen (Hülle, Bewegungspfeil, ETA-Trichter)
    for (const id of ['radar-cone', 'radar-cells', 'radar-vectors']) {
      if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    if (!map.getLayer('radar-cone-fill')) {
      map.addLayer({ id: 'radar-cone-fill', type: 'fill', source: 'radar-cone', paint: { 'fill-color': '#e0451c', 'fill-opacity': 0.12 } });
    }
    if (!map.getLayer('radar-cells-line')) {
      map.addLayer({ id: 'radar-cells-line', type: 'line', source: 'radar-cells', paint: { 'line-color': '#e0451c', 'line-width': 2 } });
    }
    if (!map.getLayer('radar-cells-label')) {
      map.addLayer({ id: 'radar-cells-label', type: 'symbol', source: 'radar-cells',
        layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, -1.4], 'text-anchor': 'bottom' },
        paint: { 'text-color': '#7e0028', 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
    }
    if (!map.getLayer('radar-vectors-line')) {
      map.addLayer({ id: 'radar-vectors-line', type: 'line', source: 'radar-vectors', paint: { 'line-color': '#7e0028', 'line-width': 2.5 } });
    }

    // Schneefallgrenzen-Höhenlinie
    if (!map.getSource('radar-snowline')) map.addSource('radar-snowline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('radar-snowline-line')) {
      map.addLayer({ id: 'radar-snowline-line', type: 'line', source: 'radar-snowline',
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: { 'line-color': '#5a78dc', 'line-width': 1.6, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } });
    }

    addDimAndMask(map);

    syncFrame();
    syncPhases();
    syncSnowline();
    syncOverlays();
    syncCoverage();
  }

  /**
   * Dunkles Kartenfeld + DACH-Ausschnitt — identisch zur Wetterkarte
   * (`MapView.tsx`): ein Ink-Schleier ÜBER der Basemap, aber UNTER dem
   * Niederschlag, damit die Radar-Farben auf dunklem Grund stehen; darüber
   * eine invertierte Weltfläche (Welt − DACH) in Sand, die alles außerhalb
   * DE/AT/CH abdeckt — inklusive der Radar-Textur, die sonst rechteckig
   * über die Nachbarländer laufen würde.
   */
  function addDimAndMask(map: maplibregl.Map) {
    if (!map.getSource('radar-world')) {
      map.addSource('radar-world', {
        type: 'geojson',
        data: {
          type: 'Feature', properties: {},
          geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
        },
      });
    }
    if (!map.getLayer('radar-dim')) {
      map.addLayer({
        id: 'radar-dim', type: 'fill', source: 'radar-world',
        paint: { 'fill-color': '#2C2A26', 'fill-opacity': 0.8 },
      }, map.getLayer('radar-precip') ? 'radar-precip' : undefined);
    }
    const applyMask = (data: GeoJSON.Feature) => {
      if (!mapRef.current || mapRef.current !== map || !styleReady.current) return;
      if (!map.getSource('radar-dach-mask')) {
        map.addSource('radar-dach-mask', { type: 'geojson', data });
      } else {
        (map.getSource('radar-dach-mask') as maplibregl.GeoJSONSource).setData(data);
      }
      if (!map.getLayer('radar-dach-mask-fill')) {
        map.addLayer({
          id: 'radar-dach-mask-fill', type: 'fill', source: 'radar-dach-mask',
          paint: { 'fill-color': '#E0D6BE', 'fill-opacity': 1 },
        });
      } else {
        map.moveLayer('radar-dach-mask-fill'); // stets oberhalb der Radar-Layer
      }
    };
    if (dachMaskRef.current) applyMask(dachMaskRef.current);
    else void loadDachMask().then((m) => { dachMaskRef.current = m; applyMask(m); }).catch(() => {});
  }

  // --- Basemap-Wechsel ------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    styleReady.current = false;
    rainRef.current = null; covRef.current = null; // werden nach style.load neu erzeugt
    phaseRefs.current = { rain: null, snow: null, graupel: null, hail: null };
    map.setStyle(basemapStyle(basemap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // --- Frame setzen (mit Morph) --------------------------------------------
  function syncFrame() {
    const map = mapRef.current; const layer = rainRef.current;
    if (!map || !layer || !styleReady.current) return;
    const accum = latest.current.accumValues;
    const st = latest.current.stack;
    if (accum) {
      layer.setFrame({ values: accum, width: st.frames[st.nowIndex]?.width ?? 1, height: st.frames[st.nowIndex]?.height ?? 1, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN });
      return;
    }
    const pos = latest.current.framePos;
    const i0 = Math.max(0, Math.min(st.frames.length - 1, Math.floor(pos)));
    const i1 = Math.min(st.frames.length - 1, i0 + 1);
    const frac = pos - i0;
    const a = st.frames[i0];
    if (!a) return;
    if (frac > 0.01 && i1 !== i0 && st.frames[i1] && st.frames[i1].width === a.width) {
      if (!morphBuf.current || morphBuf.current.length !== a.values.length) morphBuf.current = new Uint8Array(a.values.length);
      const m = lerpU8(a.values, st.frames[i1].values, frac, morphBuf.current);
      layer.setFrame({ values: m, width: a.width, height: a.height, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN });
    } else {
      layer.setFrame({ values: a.values, width: a.width, height: a.height, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN });
    }
  }
  useEffect(() => { syncFrame(); /* eslint-disable-next-line */ }, [framePos, accumValues, stack]);

  // --- Palette / Opazität ---------------------------------------------------
  useEffect(() => {
    const layer = rainRef.current; if (!layer) return;
    layer.setColorRamp(accumValues ? accumRamp : PALETTES[palette].ramp);
  }, [palette, accumValues]);
  useEffect(() => {
    const layer = rainRef.current; if (!layer) return;
    layer.opacity = opacity; mapRef.current?.triggerRepaint();
  }, [opacity]);

  // --- Coverage-Maske -------------------------------------------------------
  function syncCoverage() {
    const map = mapRef.current; const layer = covRef.current; if (!map || !layer || !styleReady.current) return;
    const cov = latest.current.coverageValues; const st = latest.current.stack;
    const show = latest.current.layers.has('coverage') && cov;
    if (show && cov) {
      const fr = st.frames[st.nowIndex] ?? st.frames[0];
      layer.opacity = 1;
      layer.setFrame({ values: cov, width: fr.width, height: fr.height, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN });
    } else {
      layer.opacity = 0; map.triggerRepaint();
    }
  }
  useEffect(() => { syncCoverage(); /* eslint-disable-next-line */ }, [coverageValues, layers]);

  // --- Phasen (Regen/Schnee/Graupel/Hagel) ---------------------------------
  function syncPhases() {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const refs = phaseRefs.current; const ls = latest.current.layers; const st = latest.current.stack;
    const anyOn = ls.has('rain') || ls.has('snow') || ls.has('graupel') || ls.has('hail');
    const hide = () => { for (const k of ['rain', 'snow', 'graupel', 'hail'] as const) { if (refs[k]) refs[k]!.opacity = 0; } map.triggerRepaint(); };
    if (!anyOn) return hide();
    const i = Math.max(0, Math.min(st.frames.length - 1, Math.round(latest.current.framePos)));
    const fr = st.frames[i] ?? st.frames[st.nowIndex];
    if (!fr) return hide();
    const N = fr.values.length;
    if (!phaseBuf.current || phaseBuf.current.rain.length !== N) {
      phaseBuf.current = { rain: new Uint8Array(N), snow: new Uint8Array(N), graupel: new Uint8Array(N), hail: new Uint8Array(N) };
    }
    const buf = phaseBuf.current;
    classifyPhases(fr.values, latest.current.elevFull, latest.current.snowLineM, RADAR_VMAX, buf);
    for (const k of ['rain', 'snow', 'graupel', 'hail'] as const) {
      const layer = refs[k]; if (!layer) continue;
      if (ls.has(k)) { layer.opacity = latest.current.opacity; layer.setFrame({ values: buf[k], width: fr.width, height: fr.height, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN }); }
      else layer.opacity = 0;
    }
    map.triggerRepaint();
  }
  useEffect(() => { syncPhases(); /* eslint-disable-next-line */ }, [elevFull, snowLineM, framePos, layers, opacity, stack]);
  // Regen-Phase folgt der gewählten Palette (wie das Basis-Raster).
  useEffect(() => { phaseRefs.current.rain?.setColorRamp(PALETTES[palette].ramp); }, [palette]);

  // --- Schneefallgrenzen-Linie ---------------------------------------------
  function syncSnowline() {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const on = latest.current.layers.has('snowline');
    if (map.getLayer('radar-snowline-line')) map.setLayoutProperty('radar-snowline-line', 'visibility', on ? 'visible' : 'none');
    (map.getSource('radar-snowline') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: on ? latest.current.snowLineFeatures : [] });
  }
  useEffect(() => { syncSnowline(); /* eslint-disable-next-line */ }, [snowLineFeatures, layers]);

  // --- Overlays (Layer-Sichtbarkeit + Zellen-GeoJSON) -----------------------
  function syncOverlays() {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const ls = latest.current.layers;
    const vis = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('radar-lightning', ls.has('lightning'));
    const showCells = ls.has('cells');
    for (const id of ['radar-cone-fill', 'radar-cells-line', 'radar-cells-label', 'radar-vectors-line']) vis(id, showCells);

    // Zellen-Geometrie aktualisieren.
    const cs = latest.current.cells;
    const cellFeats: GeoJSON.Feature[] = [];
    const coneFeats: GeoJSON.Feature[] = [];
    const vecFeats: GeoJSON.Feature[] = [];
    for (const c of cs) {
      cellFeats.push({ type: 'Feature', properties: { label: `${Math.round(c.peakMmH)} mm/h · ${Math.round(c.speedKmh)} km/h ${c.compass}` }, geometry: circlePolygon(c.lon, c.lat, c.radiusKm) });
      // Trichter: Polygon um die prognostizierten Schwerpunkte (Hüllkreise verbunden).
      coneFeats.push({ type: 'Feature', properties: {}, geometry: conePolygon(c) });
      // Bewegungsvektor.
      if (c.speedKmh > 1) {
        const tip = c.cone[1] ?? c.cone[0];
        vecFeats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[c.lon, c.lat], [tip.lon, tip.lat]] } });
      }
    }
    (map.getSource('radar-cells') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: cellFeats });
    (map.getSource('radar-cone') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: coneFeats });
    (map.getSource('radar-vectors') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: vecFeats });
  }
  useEffect(() => { syncOverlays(); /* eslint-disable-next-line */ }, [layers, cells]);

  // --- Punkt-Marker ---------------------------------------------------------
  useEffect(() => {
    markerRef.current?.setLngLat([point.lon, point.lat]);
  }, [point.lat, point.lon]);
  useEffect(() => {
    const map = mapRef.current; if (!map) return;
    if (comparePoint) {
      if (!cmpMarkerRef.current) cmpMarkerRef.current = new maplibregl.Marker({ color: '#C97B47' }).setLngLat([comparePoint.lon, comparePoint.lat]).addTo(map);
      else cmpMarkerRef.current.setLngLat([comparePoint.lon, comparePoint.lat]);
    } else { cmpMarkerRef.current?.remove(); cmpMarkerRef.current = null; }
  }, [comparePoint]);

  return <div ref={containerRef} className="rdr-map" />;
}

// --- Geometrie-Helfer (GeoJSON) ---------------------------------------------

function circlePolygon(lon: number, lat: number, radiusKm: number, steps = 48): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  const latR = lat * Math.PI / 180;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    const dLat = (radiusKm * Math.cos(a)) / 110.57;
    const dLon = (radiusKm * Math.sin(a)) / (111.32 * Math.cos(latR) || 1e-6);
    coords.push([lon + dLon, lat + dLat]);
  }
  return { type: 'Polygon', coordinates: [coords] };
}

/** Trichter: konvexe-ish Hülle aus jetzt-Kreis + den Prognosekreisen. */
function conePolygon(c: StormCell): GeoJSON.Polygon {
  const last = c.cone[c.cone.length - 1];
  return circlePolygon(last.lon, last.lat, last.radiusKm);
}
