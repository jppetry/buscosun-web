/**
 * EZ2 — Event-Fläche auf der Karte aufziehen (drücken · ziehen · loslassen).
 *
 * Bewusst KEIN Draw-Plugin (D-06: keine neue Abhängigkeit): der Zeichenmodus
 * ist ein Zustandsflag, das Panning/BoxZoom für die Dauer des Zuges abschaltet
 * und aus Start- und aktuellem Punkt ein Rechteck baut. Maus und Finger laufen
 * über dieselben zwei Handler, weil MapLibre für beide `lngLat` liefert.
 *
 * Das Modul wird `lazy` geladen (EventPage) — maplibre bleibt aus dem
 * Wizard-Chunk, bis der Nutzer die Karte tatsächlich öffnet.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Location } from '../types';
import {
  clampZone, isDrawnZone, zoneFromDrag, zoneRing, zoneSizeText, ZONE_MAX_EDGE_KM,
  type EventZone,
} from './eventZone';

const SRC = 'ev-zone-src';
const FILL = 'ev-zone-fill';
const LINE = 'ev-zone-line';
const TERRACOTTA = '#C97B47';

interface Props {
  location: Location;
  zone: EventZone | null;
  onChange: (z: EventZone | null) => void;
}

function ringFeature(z: EventZone | null) {
  return {
    type: 'FeatureCollection' as const,
    features: z
      ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [zoneRing(z)] } }]
      : [],
  };
}

export default function EventZoneMap({ location, zone, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const [drawing, setDrawing] = useState(false);
  // Der laufende Zug: Startpunkt + das Rechteck, das gerade unter dem Zeiger
  // entsteht. Beides in einem Ref, damit die Karten-Handler stabil bleiben.
  const dragRef = useRef<{ start: { lat: number; lon: number } | null }>({ start: null });
  const drawingRef = useRef(false);
  const [preview, setPreview] = useState<EventZone | null>(null);

  // Karte einmal aufbauen.
  useEffect(() => {
    if (!boxRef.current) return;
    const map = new maplibregl.Map({
      container: boxRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [location.lon, location.lat],
      zoom: 11,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current = map;

    new Marker({ color: TERRACOTTA }).setLngLat([location.lon, location.lat]).addTo(map);

    map.on('load', () => {
      map.addSource(SRC, { type: 'geojson', data: ringFeature(null) });
      map.addLayer({ id: FILL, type: 'fill', source: SRC, paint: { 'fill-color': TERRACOTTA, 'fill-opacity': 0.22 } });
      map.addLayer({ id: LINE, type: 'line', source: SRC, paint: { 'line-color': TERRACOTTA, 'line-width': 2 } });
      readyRef.current = true;
      // Zustand, der vor `load` gesetzt war, jetzt nachziehen.
      const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
      src?.setData(ringFeature(zone));
      if (zone) fitZone(map, zone);
    });

    // --- Zeichnen: dieselbe Logik für Maus und Finger ---------------------
    const begin = (lngLat: maplibregl.LngLat) => {
      if (!drawingRef.current) return;
      dragRef.current.start = { lat: lngLat.lat, lon: lngLat.lng };
      setPreview(null);
    };
    const move = (lngLat: maplibregl.LngLat) => {
      const s = dragRef.current.start;
      if (!drawingRef.current || !s) return;
      setPreview(clampZone(zoneFromDrag(s, { lat: lngLat.lat, lon: lngLat.lng })));
    };
    const end = (lngLat: maplibregl.LngLat) => {
      const s = dragRef.current.start;
      dragRef.current.start = null;
      if (!drawingRef.current || !s) return;
      const z = clampZone(zoneFromDrag(s, { lat: lngLat.lat, lon: lngLat.lng }));
      setPreview(null);
      exitDraw();
      // Ein zu kleiner Zug war ein Klick, keine Fläche — dann bleibt alles, wie es war.
      if (isDrawnZone(z)) onChange(z);
    };

    const onDown = (e: maplibregl.MapMouseEvent) => { if (drawingRef.current) { e.preventDefault(); begin(e.lngLat); } };
    const onMove = (e: maplibregl.MapMouseEvent) => move(e.lngLat);
    const onUp = (e: maplibregl.MapMouseEvent) => end(e.lngLat);
    const onTDown = (e: maplibregl.MapTouchEvent) => { if (drawingRef.current) { e.preventDefault(); begin(e.lngLat); } };
    const onTMove = (e: maplibregl.MapTouchEvent) => { if (drawingRef.current) { e.preventDefault(); move(e.lngLat); } };
    const onTUp = (e: maplibregl.MapTouchEvent) => end(e.lngLat);

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    map.on('touchstart', onTDown);
    map.on('touchmove', onTMove);
    map.on('touchend', onTUp);

    return () => { readyRef.current = false; map.remove(); mapRef.current = null; };
    // Ort/Zone bewusst nicht in den Deps: die Karte wird nicht neu gebaut,
    // beides wird unten nachgeführt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ortswechsel nachführen (der Nutzer kann im Schritt „Ort" den Ort ändern).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    if (!zone) map.easeTo({ center: [location.lon, location.lat], duration: 400 });
  }, [location.lat, location.lon, zone]);

  // Gezeichnete Fläche bzw. laufende Vorschau in die Karte schreiben.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    src?.setData(ringFeature(preview ?? zone));
  }, [preview, zone]);

  function enterDraw() {
    const map = mapRef.current;
    if (!map) return;
    drawingRef.current = true;
    setDrawing(true);
    map.dragPan.disable();
    map.boxZoom.disable();
    map.dragRotate.disable();
    map.touchZoomRotate.disable();
    map.getCanvas().style.cursor = 'crosshair';
  }

  function exitDraw() {
    const map = mapRef.current;
    drawingRef.current = false;
    setDrawing(false);
    if (!map) return;
    map.dragPan.enable();
    map.boxZoom.enable();
    map.dragRotate.enable();
    map.touchZoomRotate.enable();
    map.getCanvas().style.cursor = '';
  }

  function clear() {
    exitDraw();
    setPreview(null);
    onChange(null);
  }

  const shown = preview ?? zone;

  return (
    <div className="evd-zone">
      <div className="evd-zone-mapwrap">
        <div ref={boxRef} className="evd-zone-map" />
        {drawing && (
          <div className="evd-zone-hintbar" role="status">
            Halte gedrückt und ziehe über das Gelände — loslassen setzt die Fläche.
          </div>
        )}
      </div>
      <div className="evd-zone-bar">
        <span className="evd-zone-size">
          {shown ? zoneSizeText(shown) : 'Keine Zone — bewertet wird der Punkt am gewählten Ort.'}
        </span>
        <span className="evd-zone-btns">
          {drawing ? (
            <button type="button" className="evd-zone-btn" onClick={exitDraw}>Abbrechen</button>
          ) : (
            <button type="button" className="evd-zone-btn evd-zone-btn--go" onClick={enterDraw}>
              {zone ? 'Neu aufziehen' : 'Fläche aufziehen'}
            </button>
          )}
          {zone && !drawing && <button type="button" className="evd-zone-btn" onClick={clear}>Entfernen</button>}
        </span>
      </div>
      <div className="evd-zone-note">
        Die Zone ist optional und ersetzt den Ort nicht: bewertet wird weiter der gewählte Punkt,
        die Fläche ergänzt im Ergebnis die Spanne über das Gelände (max. {ZONE_MAX_EDGE_KM} km Kante).
      </div>
    </div>
  );
}

function fitZone(map: MapLibreMap, z: EventZone) {
  map.fitBounds([[z.west, z.south], [z.east, z.north]], { padding: 40, duration: 0, maxZoom: 14 });
}
