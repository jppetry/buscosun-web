/**
 * RadarMap — die GPU-Karte des High-End-Regenradars.
 *
 * Rendert das Niederschlags-Raster als WebGL-`RainLayer` (Textur-Upload statt
 * DOM-Tiles → Recoloring & Frame-Wechsel ohne Re-Fetch), plus Overlays:
 * Zellbahnen (DWD KONRAD3D, geteilte Layer-Definition mit der Wetterkarte),
 * ICON-D2-Schnee (`ScalarLayer`), Blitze (DWD-WMS-Tile), Coverage-Maske und
 * die Punkt-Marker. Frame-Morphing zwischen 5-min-Frames per Werte-Lerp (nur
 * während des Abspielens, sonst idle — §12 RepaintScheduler).
 *
 * RL1 (`audit/regenradar-layer-angleich.md`): Niederschlag, Zellbahnen und
 * Schnee sind seitdem DIESELBEN Layer wie in der Wetterkarte —
 *   • Niederschlag: `PrecipCompositor` (DACH-Komposit, je Zelle die landesrichtige
 *     Quelle). Das eigene Land liefert der Frame-Stack der Seite (inkl. Rückblick
 *     und Morph), die Nachbarländer der zeitnächste Frame ihrer Quelle. Fehlen die
 *     Nachbarquellen (`composite == null`), bleibt der bisherige Einzelland-Weg
 *     mit Warp-Mesh der benannte Fallback.
 *   • Zellbahnen: `installCellLayers()` aus `cellLayers.ts` (byte-gleiche Specs).
 *   • Schnee: `ScalarLayer` mit `snowRamp`, dieselben Optionen wie `MapView.tsx`.
 */

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { patchLibertyRefLength } from '../map/libertyStyle';
import 'maplibre-gl/dist/maplibre-gl.css';
import { RainLayer } from '../scalar/RainLayer';
import { ScalarLayer } from '../scalar/ScalarLayer';
import { PrecipCompositor, type CompositeSources } from '../scalar/precipComposite';
import { lightningTileTemplate } from '../sources/dwdLightning';
import { sampleRadarPoint } from '../pointForecast/radarSample';
import { PALETTES, type PaletteId, type RadarLayerId, RADAR_VMAX } from './radarModel';
import { accumRamp } from './accumulation';
import { coverageRamp } from './coverageMask';
import { snowRamp, graupelRamp, hailRamp, classifyPhases, type PhaseBuffers } from './precipPhase';
import type { RadarStack } from './radarFrames';
import type { Basemap } from './radarState';
import { loadDachMask } from '../countryMask';
import { installCellLayers, setCellLayersVisible, bindCellPopup, CELLS_SOURCE_ID, CELLS_HORIZON_MIN } from './cellLayers';
import type { IconD2Snow, SnowMode } from '../sources/iconD2Snow';
import { bracketAtValidTime } from '../sources/frameAtValidTime';
import { lerpFrameImage } from '../fusion/frameInterp';

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

/** Schnee-Layer: Sichtbarkeits-Fade je Modus — identisch zu `MapView.tsx`
 *  (`SNOW_VIS_RANGE`): < ~1 cm transparent, „kein Schnee" nicht einfärben. */
const SNOW_VIS_RANGE: Record<SnowMode, { start: number; end: number }> = {
  depth: { start: 0.007, end: 0.02 },
  fresh: { start: 0.02, end: 0.05 },
};
const SNOW_LAYER_ID = 'radar-snow-amount';
const SNOW_OPACITY = 0.9;
/** Nachbarquellen nur für Zeitpunkte ab „jetzt" (halber 5-min-Schritt Toleranz):
 *  für den Rückblick hält nur der eigene Stack gemessene Vergangenheit; die
 *  Nachbarländer würden sonst still ihre Analyse für eine frühere Zeit zeigen. */
const NEIGHBOR_PAST_TOL_H = 2.5 / 60;

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
  coverageValues: Uint8Array | null;
  /** RL1: Nachbarquellen des DACH-Komposits (das eigene Land kommt aus `stack`).
   *  `null` = Einzelland-Fallback mit Warp-Mesh. */
  composite: CompositeSources | null;
  /** RL1: Zellbahnen (DWD KONRAD3D) als fertige FeatureCollection — gebaut in
   *  `NowcastRadarMap` mit Standortbezug; `null` = nichts zu zeichnen. */
  cellFeatures: GeoJSON.FeatureCollection | null;
  /** RL1: ICON-D2 Schneedecke/Neuschnee — wenn 'snow' aktiv. */
  snow: IconD2Snow | null;
  /** Geländehöhe je Radar-Pixel (full-res) — für die Phasen-Aufteilung. */
  elevFull: Float32Array | null;
  /** Regionale Schneefallgrenze (m) — Regen/Graupel-Trennung. */
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

/** Der sichtbare Frame des Stacks (ggf. gemorpht) samt interpolierter Gültigkeitszeit. */
function shownFrame(st: RadarStack, pos: number, morphBuf: { current: Uint8Array | null }):
  { values: Uint8Array; width: number; height: number; timeMs: number } | null {
  const i0 = Math.max(0, Math.min(st.frames.length - 1, Math.floor(pos)));
  const i1 = Math.min(st.frames.length - 1, i0 + 1);
  const frac = pos - i0;
  const a = st.frames[i0];
  if (!a) return null;
  const b = st.frames[i1];
  if (frac > 0.01 && i1 !== i0 && b && b.width === a.width) {
    if (!morphBuf.current || morphBuf.current.length !== a.values.length) morphBuf.current = new Uint8Array(a.values.length);
    const m = lerpU8(a.values, b.values, frac, morphBuf.current);
    return { values: m, width: a.width, height: a.height, timeMs: a.timeMs + frac * (b.timeMs - a.timeMs) };
  }
  return { values: a.values, width: a.width, height: a.height, timeMs: a.timeMs };
}

/**
 * Komposit-Quellen für EINEN Zeitpunkt: das eigene Land als Ein-Frame-Quelle
 * aus dem Stack (so trifft `nearestBy` im Compositor genau diesen Frame —
 * Rückblick und Morph inklusive), die Nachbarn aus den geladenen Läufen.
 */
function sourcesFor(st: RadarStack, fr: { values: Uint8Array; width: number; height: number; timeMs: number },
  h: number, neighbors: CompositeSources): CompositeSources {
  const own: CompositeSources = {};
  if (st.source === 'radolan_rv') {
    own.rv = { runAt: new Date(st.runAtMs), corners: st.corners,
      frames: [{ leadMinutes: h * 60, validAt: new Date(fr.timeMs), values: fr.values, width: fr.width, height: fr.height }] };
  } else if (st.source === 'inca_grid') {
    own.inca = { corners: st.corners, frames: [{ leadHours: h, values: fr.values, width: fr.width, height: fr.height }] };
  } else {
    own.rzc = { corners: st.corners, validAt: new Date(fr.timeMs), values: fr.values, width: fr.width, height: fr.height };
  }
  const past = h < -NEIGHBOR_PAST_TOL_H;
  return {
    rv: own.rv ?? (past ? null : neighbors.rv ?? null),
    inca: own.inca ?? (past ? null : neighbors.inca ?? null),
    rzc: own.rzc ?? (past ? null : neighbors.rzc ?? null),
  };
}

export default function RadarMap(props: Props) {
  const {
    stack, framePos, palette, opacity, basemap, layers,
    accumValues, coverageValues, composite, cellFeatures, snow,
    elevFull, snowLineM, snowLineFeatures, point, comparePoint, onPick, onHover, onMapRef,
  } = props;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const rainRef = useRef<RainLayer | null>(null);
  const covRef = useRef<RainLayer | null>(null);
  const snowRef = useRef<ScalarLayer | null>(null);
  // Phasen-Layer (Regen/Graupel/Hagel) — je ein RainLayer + Wertepuffer. Die
  // Phase „Schnee" ist seit RL1 der ICON-D2-Layer (s. o.), nicht mehr die Heuristik.
  const phaseRefs = useRef<Record<'rain' | 'graupel' | 'hail', RainLayer | null>>({ rain: null, graupel: null, hail: null });
  const phaseBuf = useRef<PhaseBuffers | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const cmpMarkerRef = useRef<maplibregl.Marker | null>(null);
  const morphBuf = useRef<Uint8Array | null>(null);
  const styleReady = useRef(false);
  const dachMaskRef = useRef<GeoJSON.Feature | null>(null);
  const compositorRef = useRef<PrecipCompositor | null>(null);
  const unbindCellsRef = useRef<(() => void) | null>(null);
  const cellFcRef = useRef<GeoJSON.FeatureCollection | null | undefined>(undefined);
  const snowKeyRef = useRef('');

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

    map.on('style.load', () => { styleReady.current = true; patchLibertyRefLength(map); addRadarLayers(map); });

    return () => {
      onMapRef?.(null); unbindCellsRef.current?.(); unbindCellsRef.current = null;
      map.remove(); mapRef.current = null; rainRef.current = null; covRef.current = null; snowRef.current = null;
      phaseRefs.current = { rain: null, graupel: null, hail: null }; styleReady.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Fügt RainLayer + Overlay-Quellen nach (Re-)Style hinzu. */
  function addRadarLayers(map: maplibregl.Map) {
    // Niederschlags-Layer
    if (!rainRef.current) rainRef.current = new RainLayer({ id: 'radar-precip', colorRamp: PALETTES[latest.current.palette].ramp, opacity: latest.current.opacity });
    if (!map.getLayer('radar-precip')) map.addLayer(rainRef.current);
    // Phasen-Layer (Niederschlagsart) über dem Basis-Raster.
    const phaseRamps = { rain: PALETTES[latest.current.palette].ramp, graupel: graupelRamp, hail: hailRamp } as const;
    for (const key of ['rain', 'graupel', 'hail'] as const) {
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

    // Zellbahnen (DWD KONRAD3D) — dieselben acht Layer wie die Wetterkarte.
    installCellLayers(map);
    unbindCellsRef.current?.();
    unbindCellsRef.current = bindCellPopup(map);

    // Schneefallgrenzen-Höhenlinie
    if (!map.getSource('radar-snowline')) map.addSource('radar-snowline', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    if (!map.getLayer('radar-snowline-line')) {
      map.addLayer({ id: 'radar-snowline-line', type: 'line', source: 'radar-snowline',
        layout: { 'line-cap': 'round', 'line-join': 'round', visibility: 'none' },
        paint: { 'line-color': '#5a78dc', 'line-width': 1.6, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } });
    }

    addDimAndMask(map);

    // ICON-D2-Schnee UNTER dem Regen (Reihenfolge wie `MapView.tsx`: snow vor
    // nowcast), über dem Ink-Schleier. Optionen 1:1 aus MapView.
    if (!snowRef.current) {
      snowRef.current = new ScalarLayer({
        id: SNOW_LAYER_ID, colorRamp: snowRamp, visRange: SNOW_VIS_RANGE.depth, opacity: SNOW_OPACITY,
        zoomAttenuation: { from: 10, perStep: 0.08, floor: 0.6 },
      });
    }
    if (!map.getLayer(SNOW_LAYER_ID)) map.addLayer(snowRef.current, 'radar-precip');

    syncFrame();
    syncPhases();
    syncSnow();
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
    unbindCellsRef.current?.(); unbindCellsRef.current = null;
    cellFcRef.current = undefined; snowKeyRef.current = '';
    rainRef.current = null; covRef.current = null; snowRef.current = null; // werden nach style.load neu erzeugt
    phaseRefs.current = { rain: null, graupel: null, hail: null };
    map.setStyle(basemapStyle(basemap));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basemap]);

  // --- Frame setzen (mit Morph; Komposit oder Einzelland) --------------------
  function syncFrame() {
    const map = mapRef.current; const layer = rainRef.current;
    if (!map || !layer || !styleReady.current) return;
    const accum = latest.current.accumValues;
    const st = latest.current.stack;
    if (accum) {
      layer.setFrame({ values: accum, width: st.frames[st.nowIndex]?.width ?? 1, height: st.frames[st.nowIndex]?.height ?? 1, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN, warpRows: st.warpRows });
      return;
    }
    const fr = shownFrame(st, latest.current.framePos, morphBuf);
    if (!fr) return;
    const neighbors = latest.current.composite;
    if (neighbors) {
      // DACH-Komposit (RL1): genau der Frame, den auch die Wetterkarte zeichnet
      // (`MapView.tsx` Frame-Effekt) — MIT dem Warp-Mesh des Komposits: ohne es
      // interpoliert der RainLayer das Quad linear in Mercator, der Regen lag
      // bis 30 km zu weit nördlich (§14 `audit/karten-layer-verortung.md`).
      const now = Date.now();
      const h = (fr.timeMs - now) / 3_600_000;
      const compositor = (compositorRef.current ??= new PrecipCompositor());
      const cf = compositor.build(h, sourcesFor(st, fr, h, neighbors), now);
      layer.setFrame({
        values: cf.values, width: cf.width, height: cf.height, corners: cf.corners,
        warpLnglat: cf.warpLnglat, warpN: cf.warpN, warpRows: cf.warpRows,
      });
      return;
    }
    // Benannter Fallback: nur das Landesradar auf seinem nativen Gitter.
    layer.setFrame({ values: fr.values, width: fr.width, height: fr.height, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN, warpRows: st.warpRows });
  }
  useEffect(() => { syncFrame(); /* eslint-disable-next-line */ }, [framePos, accumValues, stack, composite]);

  // Index-Maps der Nachbarquellen off-main vorwärmen (Muster `primeXx` in MapView),
  // damit `build()` im Frame-Pfad nur den warmen Cache trifft.
  useEffect(() => {
    if (!composite) return;
    const compositor = (compositorRef.current ??= new PrecipCompositor());
    const jobs: Promise<void>[] = [];
    if (composite.rv) jobs.push(compositor.primeDe(composite.rv));
    if (composite.inca) jobs.push(compositor.primeAt(composite.inca));
    if (composite.rzc) jobs.push(compositor.primeCh(composite.rzc));
    const fr = stack.frames[stack.nowIndex] ?? stack.frames[0];
    if (fr) {
      if (stack.source === 'radolan_rv') jobs.push(compositor.primeDe({ runAt: new Date(stack.runAtMs), corners: stack.corners, frames: [{ leadMinutes: 0, validAt: new Date(fr.timeMs), values: fr.values, width: fr.width, height: fr.height }] }));
      else if (stack.source === 'inca_grid') jobs.push(compositor.primeAt({ corners: stack.corners, frames: [{ leadHours: 0, values: fr.values, width: fr.width, height: fr.height }] }));
      else jobs.push(compositor.primeCh({ corners: stack.corners, validAt: new Date(fr.timeMs), values: fr.values, width: fr.width, height: fr.height }));
    }
    let alive = true;
    void Promise.all(jobs).then(() => { if (alive) syncFrame(); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [composite, stack]);

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
      layer.setFrame({ values: cov, width: fr.width, height: fr.height, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN, warpRows: st.warpRows });
    } else {
      layer.opacity = 0; map.triggerRepaint();
    }
  }
  useEffect(() => { syncCoverage(); /* eslint-disable-next-line */ }, [coverageValues, layers]);

  // --- Phasen (Regen/Graupel/Hagel — Heuristik auf dem Landesradar) ----------
  function syncPhases() {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const refs = phaseRefs.current; const ls = latest.current.layers; const st = latest.current.stack;
    const anyOn = ls.has('rain') || ls.has('graupel') || ls.has('hail');
    const hide = () => { for (const k of ['rain', 'graupel', 'hail'] as const) { if (refs[k]) refs[k]!.opacity = 0; } map.triggerRepaint(); };
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
    for (const k of ['rain', 'graupel', 'hail'] as const) {
      const layer = refs[k]; if (!layer) continue;
      if (ls.has(k)) { layer.opacity = latest.current.opacity; layer.setFrame({ values: buf[k], width: fr.width, height: fr.height, corners: st.corners, warpLnglat: st.warpLnglat, warpN: st.warpN, warpRows: st.warpRows }); }
      else layer.opacity = 0;
    }
    map.triggerRepaint();
  }
  useEffect(() => { syncPhases(); /* eslint-disable-next-line */ }, [elevFull, snowLineM, framePos, layers, opacity, stack]);
  // Regen-Phase folgt der gewählten Palette (wie das Basis-Raster).
  useEffect(() => { phaseRefs.current.rain?.setColorRamp(PALETTES[palette].ramp); }, [palette]);

  // --- Schnee (ICON-D2, RL1) — Frame zur Gültigkeitszeit des Radarframes -----
  function syncSnow() {
    const map = mapRef.current; const layer = snowRef.current; if (!map || !layer || !styleReady.current) return;
    const sd = latest.current.snow;
    const on = latest.current.layers.has('snow') && sd && sd.frames.length > 0;
    if (!on || !sd) { layer.opacity = 0; snowKeyRef.current = ''; map.triggerRepaint(); return; }
    const fr = shownFrame(latest.current.stack, latest.current.framePos, morphBuf);
    const targetMs = fr ? fr.timeMs : Date.now();
    // Schneedecke (h_snow) ist instantan → t+0 gültig; Neuschnee (snow_gsp) ist
    // akkumuliert → am Analyse-Schritt strukturell 0 → minStepHours = 1 (wie MapView).
    layer.visRange = SNOW_VIS_RANGE[sd.mode];
    layer.opacity = SNOW_OPACITY;
    const minStep = sd.mode === 'fresh' ? 1 : 0;
    const { a, b, frac } = bracketAtValidTime(sd.frames, targetMs, minStep);
    // Der Pixel-Lerp liest zwei Canvases (~700×450) zurück — im Abspielen läuft
    // dieser Effekt je rAF. Auf 5-%-Schritte quantisiert (ICON-D2-Frames liegen
    // 1 h auseinander, das Radar schreitet 5 min = 8 % je Frame) genügen wenige
    // Lerps je Sekunde; gleiche Stützen + gleicher Schritt = kein Upload.
    const q = Math.round(frac * 20) / 20;
    const key = `${sd.mode}|${a.validAt.getTime()}|${b.validAt.getTime()}|${q}`;
    if (key === snowKeyRef.current) return;
    snowKeyRef.current = key;
    const image = q > 0.001 && a !== b ? lerpFrameImage(a.image, b.image, q, 'radar-snow') : a.image;
    layer.setData(image, { width: a.width, height: a.height, vMin: sd.vMin, vMax: sd.vMax, uvBounds: sd.uvBounds });
  }
  useEffect(() => { syncSnow(); /* eslint-disable-next-line */ }, [snow, layers, framePos, stack]);

  // --- Schneefallgrenzen-Linie ---------------------------------------------
  function syncSnowline() {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const on = latest.current.layers.has('snowline');
    if (map.getLayer('radar-snowline-line')) map.setLayoutProperty('radar-snowline-line', 'visibility', on ? 'visible' : 'none');
    (map.getSource('radar-snowline') as maplibregl.GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: on ? latest.current.snowLineFeatures : [] });
  }
  useEffect(() => { syncSnowline(); /* eslint-disable-next-line */ }, [snowLineFeatures, layers]);

  // --- Overlays (Blitze + Zellbahnen) ----------------------------------------
  function syncOverlays() {
    const map = mapRef.current; if (!map || !styleReady.current) return;
    const ls = latest.current.layers;
    if (map.getLayer('radar-lightning')) map.setLayoutProperty('radar-lightning', 'visibility', ls.has('lightning') ? 'visible' : 'none');
    // Zellbahnen: Prognosehorizont wie in der Wetterkarte — jenseits von +60 min
    // ist der Layer AUS statt eine Zelle zu zeigen, die für diese Zeit nichts
    // aussagt (`CELLS_HORIZON_MIN`).
    const fr = shownFrame(latest.current.stack, latest.current.framePos, morphBuf);
    const leadMin = fr ? (fr.timeMs - Date.now()) / 60_000 : 0;
    const fc = latest.current.cellFeatures;
    setCellLayersVisible(map, ls.has('cells') && !!fc && leadMin <= CELLS_HORIZON_MIN);
    // setData nur bei geänderter Referenz — der Effekt läuft je rAF mit (V-220-Muster).
    if (cellFcRef.current !== fc) {
      cellFcRef.current = fc;
      (map.getSource(CELLS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined)
        ?.setData(fc ?? { type: 'FeatureCollection', features: [] });
    }
  }
  useEffect(() => { syncOverlays(); /* eslint-disable-next-line */ }, [layers, cellFeatures, framePos]);

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
