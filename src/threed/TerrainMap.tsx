/**
 * 3D-Wetter · Gelände-Karte mit Atmosphären-Vorhang (3. Modus).
 *
 * Wie `ThreeDMap`, aber mit echtem 3D-Relief (`raster-dem` + `setTerrain`,
 * gekippte Kamera) und einer `CurtainLayer`, die den Wetter-Schnitt als
 * senkrechte Wand entlang der Schnittlinie auf das Gelände stellt. Die Wand-
 * Textur ist dieselbe Wind-/Wolken-Heatmap wie im 2D-Schnitt (`sectionImage`).
 *
 * Terrain-DEM: AWS „Terrarium"-Kacheln (frei, ohne API-Key) — passt zur
 * Projekt-Regel, keine rate-limitierten/kostenpflichtigen Default-Quellen.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoPoint } from './sectionGeometry';
import type { CrossSection } from './crossSection';
import type { LayerState } from './ThreeDPage';
import { CurtainLayer } from './CurtainLayer';
import { buildStreamlineSegments } from './curtainMesh';
import { buildAnnotatedCurtain } from './sectionImage';
import { bearingDeg } from './dynamics';

interface Props {
  center: GeoPoint;
  points: GeoPoint[];
  section: CrossSection;
  layers: LayerState;
  onChange: (points: GeoPoint[]) => void;
}

const LINE_SRC = 'td-cut-line';
const DEM_SRC = 'td-dem';
/** Geländeüberhöhung — Vorhang spiegelt denselben Faktor (siehe CurtainLayer). */
const EXAGGERATION = 1.3;
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';

export default function TerrainMap({ center, points, section, layers, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layerRef = useRef<CurtainLayer | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const readyRef = useRef(false);
  const [noWebgl, setNoWebgl] = useState(false);
  const pointsRef = useRef<GeoPoint[]>(points);
  const onChangeRef = useRef(onChange);
  pointsRef.current = points;
  onChangeRef.current = onChange;

  // Kamera so setzen, dass man seitlich auf die Vorhang-Wand schaut.
  function fitToLine() {
    const map = mapRef.current, pts = pointsRef.current;
    if (!map || pts.length < 2) return;
    let west = pts[0].lon, east = pts[0].lon, south = pts[0].lat, north = pts[0].lat;
    for (const p of pts) { west = Math.min(west, p.lon); east = Math.max(east, p.lon); south = Math.min(south, p.lat); north = Math.max(north, p.lat); }
    const lineBearing = bearingDeg(pts[0], pts[pts.length - 1]);
    const viewBearing = lineBearing - 90; // senkrecht zur Linie → Wand zeigt zur Kamera
    const cam = map.cameraForBounds([[west, south], [east, north]], { padding: 70, bearing: viewBearing });
    if (cam && cam.center && cam.zoom != null) {
      map.easeTo({ center: cam.center, zoom: Math.min(cam.zoom, 13), bearing: viewBearing, pitch: 62, duration: 700 });
    }
  }

  // Karte einmal initialisieren.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [center.lon, center.lat],
      zoom: 10,
      pitch: 60,
      maxPitch: 80,
      // ODbL-Pflichtattribution der Kartenkacheln (V-105).
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    map.on('load', () => {
      // 3D-Relief.
      if (!map.getSource(DEM_SRC)) {
        map.addSource(DEM_SRC, { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      }
      map.setTerrain({ source: DEM_SRC, exaggeration: EXAGGERATION });
      try {
        map.setSky({ 'sky-color': '#9fc4e8', 'horizon-color': '#e7ecf1', 'fog-color': '#f2efe6', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4 });
      } catch { /* setSky optional je nach Version */ }

      // Schnittlinie.
      map.addSource(LINE_SRC, { type: 'geojson', data: lineGeoJSON(pointsRef.current) });
      map.addLayer({ id: 'td-cut-line-casing', type: 'line', source: LINE_SRC, paint: { 'line-color': '#FAF6EA', 'line-width': 6 } });
      map.addLayer({ id: 'td-cut-line-main', type: 'line', source: LINE_SRC, paint: { 'line-color': '#C97B47', 'line-width': 3 } });

      // Vorhang-Layer.
      const layer = new CurtainLayer({ exaggeration: EXAGGERATION, opacity: 0.9 });
      layerRef.current = layer;
      map.addLayer(layer);
      readyRef.current = true;
      updateCurtain();
      syncMarkers();
      if (pointsRef.current.length >= 2) fitToLine();
    });

    map.on('click', (e) => {
      const next = [...pointsRef.current, { lat: e.lngLat.lat, lon: e.lngLat.lng }];
      onChangeRef.current(next);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove()); markersRef.current = [];
      readyRef.current = false; layerRef.current = null;
      map.remove(); mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lon]);

  // Linie + Marker bei Punktänderung aktualisieren.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource(LINE_SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(lineGeoJSON(points));
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Vorhang-Textur/-Geometrie bei Schnitt- oder Layer-Änderung aktualisieren.
  useEffect(() => {
    updateCurtain();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, layers]);

  function updateCurtain() {
    const layer = layerRef.current;
    if (!layer || !readyRef.current) return;
    const image = buildCurtainTexture(section, layers);
    if (image) layer.setCurtain(section.columns, section.topM, image);
    // Windlinien (Streamlines) ein-/ausblenden.
    if (layers.streamlines) {
      layer.setStreamlines(buildStreamlineSegments(section.columns, section.topM, section.terrainMinM, flowSignAlongLine(section)));
    } else {
      layer.setStreamlines([]);
    }
  }

  function syncMarkers() {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    const arr = pointsRef.current;
    markersRef.current = arr.map((p, i) => {
      const isStart = i === 0;
      const isEnd = i === arr.length - 1 && arr.length > 1;
      const el = document.createElement('div');
      el.className = `td-wp${isStart ? ' is-start' : ''}${isEnd ? ' is-end' : ''}`;
      el.textContent = isStart ? 'S' : isEnd ? 'Z' : String(i + 1);
      el.title = `${isStart ? 'Start' : isEnd ? 'Ziel' : 'Wegpunkt ' + (i + 1)} · ziehen zum Verschieben · Klick zum Löschen`;
      const marker = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([p.lon, p.lat]).addTo(map);
      marker.on('dragend', () => {
        const ll = marker.getLngLat();
        onChangeRef.current(pointsRef.current.map((q, j) => (j === i ? { lat: ll.lat, lon: ll.lng } : q)));
      });
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        onChangeRef.current(pointsRef.current.filter((_, j) => j !== i));
      });
      return marker;
    });
  }

  if (noWebgl) {
    return (
      <div className="td-map td-map-fallback">
        <p><strong>3D-Gelände nicht verfügbar</strong></p>
        <p>Dein Gerät/Browser unterstützt kein WebGL. Nutze den 2D-Schnitt — die Gelände-Ansicht benötigt WebGL für Relief und Vorhang.</p>
      </div>
    );
  }
  return (
    <div className="td-map-shell td-map-shell-3d">
      <div ref={containerRef} className="td-map td-map-3d" />
      {points.length >= 2 && (
        <button type="button" className="td-map-fit" onClick={fitToLine} title="Schnittlinie einpassen" aria-label="Schnittlinie einpassen">⤢</button>
      )}
    </div>
  );
}

/**
 * Baut die Vorhang-Textur: Temperaturschichten (wenn „Temperatur" aktiv), sonst
 * das Windfeld (Böe, wenn nur Böen aktiv). Wolkenschichten werden optional
 * darüber komponiert — eine Textur, ein Draw.
 */
function buildCurtainTexture(section: CrossSection, layers: LayerState): HTMLCanvasElement | null {
  return buildAnnotatedCurtain(section, { useGust: layers.gust && !layers.mean, temp: layers.temp, clouds: layers.cloudLayers });
}

/**
 * Strömungsrichtung entlang der Linie: +1 = zum Linienende (wachsende Distanz),
 * −1 = zum Anfang. Aus der mittleren Ost-Windkomponente × Ost-Richtung der Linie
 * (gleiche Logik wie die 2D-Streamlines).
 */
function flowSignAlongLine(section: CrossSection): number {
  const cols = section.columns;
  let meanU = 0, n = 0;
  for (const c of cols) for (const cell of c.cells) { meanU += -cell.windKmh * Math.sin((cell.windDirDeg * Math.PI) / 180); n++; }
  meanU = n ? meanU / n : 0;
  const eastSign = Math.sign(cols[cols.length - 1].lon - cols[0].lon) || 1;
  return meanU * eastSign >= 0 ? 1 : -1;
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch { return false; }
}

function lineGeoJSON(points: GeoPoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: points.map((p) => [p.lon, p.lat]) },
  };
}
