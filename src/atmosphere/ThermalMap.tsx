/**
 * Atmosphäre · Thermik-Gelände-Karte (Fliegen-Linse, P4).
 *
 * Erweitert das bestehende MapLibre-Terrain (Terrarium raster-dem + setTerrain,
 * wie threed/TerrainMap) um ein Thermik-Overlay als Raster-ImageSource: die
 * Thermiktiefe über Grund aus dem DWD-Feld HTOP_DC (ICON-D2, 0,02°, Modellhöhe,
 * `atmoThermal`). Fehlt das Feld, rechnet der Rückfall aus EINEM Umgebungsprofil
 * (am Marker) + Flächen-DEM + 3 K Überhitzung (thermalField) — beschriftet.
 * Tippen auf das Gelände verschiebt den Profil-Marker → Profil + Verdict (Store) rechnen neu.
 *
 * Nur auf der Fliegen-Linse gemountet; sauberes Unmount (map.remove) beim
 * Linsenwechsel. Mittelklasse-tauglich: grobes Feld-Gitter, CPU-Bild, ein Draw.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useAtmosphere } from './atmosphereStore';
import { loadElevationLookup } from '../fusion/elevation';
import { buildDepthImage, buildThermalImage, type EnvLevel } from './thermalField';
import { loadThermalField } from './atmoThermal';

const DEM_SRC = 'atm-dem';
const OV_SRC = 'atm-thermal';
const OV_LAYER = 'atm-thermal-layer';
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
// Bühnenoptik wie die 3D-Geländebühne des Dashboards (dashboard/TerrainStage3D): helle Basiskarte,
// sandfarbene Schummerung, Himmel. Nur Darstellung — Feld, Rückfall und Marker-Logik unverändert.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const STAGE_PITCH = 62;
const EXAGGERATION = 1.3;
const LAT_HALF = 0.32, LON_HALF = 0.5;   // Overlay-/Kamera-Ausschnitt um den Marker
const GRID_COLS = 160, GRID_ROWS = 120;  // Feld-Auflösung (CPU-Bild)

interface DemBox { grid: Float32Array; lngMin: number; lngMax: number; latMin: number; latMax: number }

function rgbaToDataUrl(rgba: Uint8ClampedArray, w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.putImageData(new ImageData(rgba, w, h), 0, 0);
  return c.toDataURL();
}

export default function ThermalMap() {
  const { marker, profile, hour, setMarker } = useAtmosphere();
  /** null = DWD-Feld; sonst der Grund des Rückfalls (Beschriftung). */
  const [fallback, setFallback] = useState<string | null>(null);
  const overlaySeq = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerObjRef = useRef<maplibregl.Marker | null>(null);
  const demRef = useRef<DemBox | null>(null);
  const readyRef = useRef(false);
  const setMarkerRef = useRef(setMarker);
  setMarkerRef.current = setMarker;
  const [noWebgl, setNoWebgl] = useState(false);

  const lat = marker?.lat ?? 47.27;
  const lon = marker?.lon ?? 11.4;
  const markerKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;

  // Karte einmal initialisieren.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      // OpenFreeMap/OpenMapTiles/OSM verlangen zwingend eine sichtbare
      // Attribution (ODbL) — compact wie in radar/RadarMap.tsx (V-105).
      center: [lon, lat], zoom: 9.5, pitch: STAGE_PITCH, bearing: -12, maxPitch: 80, fadeDuration: 0,
      ...(coarse ? { pixelRatio: Math.min(window.devicePixelRatio || 1, 1.5) } : {}),
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    // Das Sprite der Basiskarte kennt einige Symbole nicht — leeres Bild statt Konsolenwarnung je Kachel (wie TerrainStage3D).
    map.on('styleimagemissing', (e) => { if (!map.hasImage(e.id)) map.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) }); });
    map.once('load', () => { map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]').forEach((d) => d.removeAttribute('open')); });

    map.on('load', () => {
      if (!map.getSource(DEM_SRC)) {
        map.addSource(DEM_SRC, { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      }
      map.setTerrain({ source: DEM_SRC, exaggeration: EXAGGERATION });
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      map.addLayer({
        id: 'atm-hillshade', type: 'hillshade', source: DEM_SRC,
        paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#4A4234', 'hillshade-accent-color': '#6B5A45', 'hillshade-illumination-anchor': 'map', 'hillshade-illumination-direction': 335 },
      }, firstSymbol);
      try {
        map.setSky({ 'sky-color': '#DCE3EA', 'horizon-color': '#F3EEE2', 'fog-color': '#F3EEE2', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4 });
      } catch { /* setSky optional */ }
      readyRef.current = true;
      void reloadDem();
      syncMarker();
    });

    // Tippen aufs Gelände → Marker verschieben (Profil/Verdict rechnen neu).
    map.on('click', (e) => setMarkerRef.current({ lat: e.lngLat.lat, lon: e.lngLat.lng }));

    return () => {
      markerObjRef.current?.remove(); markerObjRef.current = null;
      readyRef.current = false; demRef.current = null;
      map.remove(); mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marker-Wechsel: Kamera + DEM-Ausschnitt neu, Marker-Pin sync.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.easeTo({ center: [lon, lat], duration: 600 });
    syncMarker();
    void reloadDem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerKey]);

  // Profil-/Stunden-Wechsel → Overlay aus vorhandenem DEM neu rechnen.
  useEffect(() => {
    if (readyRef.current && demRef.current) void updateOverlay();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, hour]);

  async function reloadDem() {
    const bounds = { lngMin: lon - LON_HALF, lngMax: lon + LON_HALF, latMin: lat - LAT_HALF, latMax: lat + LAT_HALF };
    try {
      const elev = await loadElevationLookup(bounds, 9);
      const grid = elev.buildGrid(bounds, GRID_COLS, GRID_ROWS);
      demRef.current = { grid, ...bounds };
      void updateOverlay();
    } catch { /* DEM optional → kein Overlay */ }
  }

  async function updateOverlay() {
    const map = mapRef.current, dem = demRef.current;
    if (!map || !readyRef.current || !dem) return;
    const seq = ++overlaySeq.current;
    const validMs = Math.floor(Date.now() / 3_600_000) * 3_600_000 + hour * 3_600_000;
    const { field, reason } = await loadThermalField({ latMin: dem.latMin, latMax: dem.latMax, lonMin: dem.lngMin, lonMax: dem.lngMax }, validMs)
      .catch(() => ({ field: null, reason: 'nicht ladbar' }));
    if (seq !== overlaySeq.current || mapRef.current !== map) return;
    let rgba: Uint8ClampedArray;
    if (field) {
      rgba = buildDepthImage((la, lo) => field.at(la, lo)?.depthM ?? null, dem, GRID_COLS, GRID_ROWS);
      setFallback(null);
    } else {
      if (!profile || profile.levels.length < 2) return;
      const levels: EnvLevel[] = profile.levels.map((l) => ({ heightM: l.heightM, tempC: l.tempC }));
      rgba = buildThermalImage(levels, dem.grid, GRID_COLS, GRID_ROWS);
      setFallback(reason ?? 'nicht verfügbar');
    }
    const url = rgbaToDataUrl(rgba, GRID_COLS, GRID_ROWS);
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [dem.lngMin, dem.latMax], [dem.lngMax, dem.latMax], [dem.lngMax, dem.latMin], [dem.lngMin, dem.latMin],
    ];
    const src = map.getSource(OV_SRC) as maplibregl.ImageSource | undefined;
    if (src) src.updateImage({ url, coordinates });
    else {
      map.addSource(OV_SRC, { type: 'image', url, coordinates });
      // Unter den Beschriftungen, damit Orts- und Gipfelnamen lesbar bleiben.
      const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
      map.addLayer({ id: OV_LAYER, type: 'raster', source: OV_SRC, paint: { 'raster-opacity': 0.75, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, firstSymbol);
    }
  }

  function syncMarker() {
    const map = mapRef.current;
    if (!map) return;
    if (!markerObjRef.current) {
      const el = document.createElement('div');
      el.className = 'atm-mark';
      markerObjRef.current = new maplibregl.Marker({ element: el });
    }
    markerObjRef.current.setLngLat([lon, lat]).addTo(map);
  }

  if (noWebgl) {
    return (
      <section className="rt-card atm-globe" aria-label="Thermik-Gelände">
        <div className="atm-globe-ph">
          <strong>Gelände nicht verfügbar</strong>
          Dein Gerät/Browser unterstützt kein WebGL — das Thermik-Gelände benötigt es.
        </div>
      </section>
    );
  }

  return (
    <section className="rt-card atm-globe atm-thermal-card" aria-label="Thermik-Gelände">
      <div ref={containerRef} className="atm-thermal-map" />
      <div className="atm-thermal-legend" aria-hidden="true">
        <span className="atm-thermal-legend-bar" />
        {fallback == null ? <><span>250 m</span><span>≥ 2 500 m über Grund</span></> : <><span>schwach</span><span>stark</span></>}
      </div>
      <p className="atm-thermal-cap">
        {fallback == null
          ? 'Thermikhöhe über Grund · Modellhöhe DWD ICON-D2 (Obergrenze Trockenkonvektion), kein Steigwert · tippen verschiebt den Marker'
          : `Thermik-Schätzung aus Profil + Gelände + 3 K Überhitzung — DWD-Feld nicht verfügbar: ${fallback} · tippen verschiebt den Marker · Richtwert`}
      </p>
    </section>
  );
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}
