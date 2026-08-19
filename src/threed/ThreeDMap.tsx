/**
 * 3D-Wetter · Karten-Editor für die Schnittlinie (US-A1).
 *
 * MapLibre-Karte: Klick setzt Wegpunkte, Marker sind verschiebbar (Drag) und
 * per Klick löschbar; die Linie folgt allen Punkten in Reihenfolge und
 * aktualisiert sich unmittelbar. Gleiche Karten-Pipeline wie der Rest der App.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { GeoPoint } from './sectionGeometry';

interface Props {
  center: GeoPoint;
  points: GeoPoint[];
  onChange: (points: GeoPoint[]) => void;
}

const LINE_SRC = 'cut-line';

export default function ThreeDMap({ center, points, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [noWebgl, setNoWebgl] = useState(false);
  const pointsRef = useRef<GeoPoint[]>(points);
  const onChangeRef = useRef(onChange);
  const prevLenRef = useRef(0);
  pointsRef.current = points;
  onChangeRef.current = onChange;

  // Schnittlinie in den sichtbaren Bereich einpassen.
  function fitToLine() {
    const map = mapRef.current, pts = pointsRef.current;
    if (!map || pts.length < 2) return;
    let west = pts[0].lon, east = pts[0].lon, south = pts[0].lat, north = pts[0].lat;
    for (const p of pts) { west = Math.min(west, p.lon); east = Math.max(east, p.lon); south = Math.min(south, p.lat); north = Math.max(north, p.lat); }
    map.fitBounds([[west, south], [east, north]], { padding: 50, duration: 500, maxZoom: 13 });
  }

  // Karte einmal initialisieren.
  useEffect(() => {
    if (!containerRef.current) return;
    // US-N3 — Graceful Degradation: ohne WebGL keine 3D-Karte.
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [center.lon, center.lat],
      zoom: 10,
      // ODbL-Pflichtattribution der Kartenkacheln (V-105).
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', () => {
      map.addSource(LINE_SRC, { type: 'geojson', data: lineGeoJSON(pointsRef.current) });
      map.addLayer({ id: 'cut-line-casing', type: 'line', source: LINE_SRC, paint: { 'line-color': '#FAF6EA', 'line-width': 6 } });
      map.addLayer({ id: 'cut-line-main', type: 'line', source: LINE_SRC, paint: { 'line-color': '#C97B47', 'line-width': 3 } });
      syncMarkers();
      // Bereits vorhandene Linie (Import/Permalink) gleich einpassen.
      if (pointsRef.current.length >= 2) fitToLine();
    });

    // Klick auf die Karte hängt einen Wegpunkt an.
    map.on('click', (e) => {
      const next = [...pointsRef.current, { lat: e.lngLat.lat, lon: e.lngLat.lng }];
      onChangeRef.current(next);
    });

    return () => { markersRef.current.forEach((m) => m.remove()); markersRef.current = []; map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lon]);

  // Linie + Marker bei Punktänderung aktualisieren; bei Bulk-Änderung einpassen.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(LINE_SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(lineGeoJSON(points));
    syncMarkers();
    // Bulk: von <2 auf ≥2 ODER Sprung um >1 (Import/Permalink) → einpassen.
    // Einzelnes Anhängen/Verschieben/Löschen lässt den Ausschnitt stabil.
    const prev = prevLenRef.current;
    if (points.length >= 2 && (prev < 2 || points.length - prev > 1)) fitToLine();
    prevLenRef.current = points.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

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
        const next = pointsRef.current.map((q, j) => (j === i ? { lat: ll.lat, lon: ll.lng } : q));
        onChangeRef.current(next);
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
        <p><strong>3D-Karte nicht verfügbar</strong></p>
        <p>Dein Gerät/Browser unterstützt kein WebGL. Suche bitte einen Ort und nutze die 2D-Vorhersage — der Vertikalschnitt benötigt die Karte zum Zeichnen der Linie.</p>
      </div>
    );
  }
  return (
    <div className="td-map-shell">
      <div ref={containerRef} className="td-map" />
      {points.length >= 2 && (
        <button type="button" className="td-map-fit" onClick={fitToLine} title="Schnittlinie einpassen" aria-label="Schnittlinie einpassen">⤢</button>
      )}
    </div>
  );
}

/** Prüft, ob ein WebGL-Kontext erstellt werden kann (US-N3). */
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
