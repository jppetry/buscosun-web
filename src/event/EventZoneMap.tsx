/**
 * EZ2 — Event-Fläche auf der Karte aufziehen (drücken · ziehen · loslassen).
 *
 * Bewusst KEIN Draw-Plugin (D-06: keine neue Abhängigkeit): der Zeichenmodus
 * ist ein Zustandsflag, das Panning/BoxZoom für die Dauer des Zuges abschaltet
 * und aus Start- und aktuellem Punkt ein Rechteck baut. Maus und Finger laufen
 * über dieselben zwei Handler, weil MapLibre für beide `lngLat` liefert.
 *
 * Das Modul wird `lazy` geladen (EventPage) — maplibre bleibt aus dem
 * Wizard-Chunk, bis der Nutzer den Flächen-Schritt erreicht.
 *
 * Die Fläche ist Pflicht (Schritt 2 von 5). Weil „drücken · ziehen · loslassen"
 * kein Bedienmuster ist, das man errät, führt das Modul eine dreistufige
 * Anleitung mit, die den gerade fälligen Handgriff hervorhebt, und sagt es
 * ausdrücklich, wenn ein Zug zu kurz war (= Klick, keine Fläche).
 */

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Location } from '../types';
import {
  clampZone, isDrawnZone, zoneFromDrag, zoneRing, zoneSamplePoints, zoneSizeText, ZONE_MAX_EDGE_KM,
  type EventZone,
} from './eventZone';
import { useIsMobile } from '../mobile/useIsMobile';

/** ET5: Gelände-Vorschau der gezeichneten Fläche — geteilter Lazy-Chunk mit dem Ergebnis. */
const EventTerrainMap = lazy(() => import('./EventTerrainMap'));

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
  const isMobile = useIsMobile();
  const [drawing, setDrawing] = useState(false);
  // ET5: „Karte | Gelände". Die flache Karte bleibt MONTIERT und wird nur per
  // CSS versteckt — kein Remount der Zeichenkarte (V-R3D-16: Auf-/Abbau einer
  // MapLibre-Instanz kostet ~184 ms und hier zusätzlich den Zeichenzustand);
  // nur die Gelände-Instanz wird je Umschalt auf- und abgebaut. Bewusst
  // komponentenlokal, nicht persistiert (Konvention: kein Scheinzustand).
  const [view, setView] = useState<'map' | 'terrain'>('map');
  // Der laufende Zug: Startpunkt + das Rechteck, das gerade unter dem Zeiger
  // entsteht. Beides in einem Ref, damit die Karten-Handler stabil bleiben.
  const dragRef = useRef<{ start: { lat: number; lon: number } | null; last: EventZone | null; raf: number }>({ start: null, last: null, raf: 0 });
  const drawingRef = useRef(false);
  const [preview, setPreview] = useState<EventZone | null>(null);
  // Ein Zug unter der Mindestkante ist ein Klick — ohne Rückmeldung sähe der
  // Nutzer nur, dass „nichts passiert".
  const [tooShort, setTooShort] = useState(false);

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

    // MapLibre öffnet die kompakte Attribution beim Start AUSGEKLAPPT — auf einer
    // Karte, deren untere Hälfte Zeichenfläche ist, schluckt der Block den Zug
    // (BD2e-Falle, Dreizeiler aus FireMap). ⓘ bleibt.
    map.once('load', () => {
      map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]')
        .forEach((d) => d.removeAttribute('open'));
    });

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
      dragRef.current.last = null;
      setPreview(null);
    };
    // Ein Zeigerlauf feuert mehrere `mousemove` je Bild. Das Rechteck wird
    // deshalb sofort im Ref fortgeschrieben (das Loslassen liest es), die
    // Neuzeichnung aber auf EIN Bild zusammengefasst — sonst hängt an jedem
    // Ereignis ein React-Rendering samt `setData` auf der Karte.
    const move = (lngLat: maplibregl.LngLat) => {
      const s = dragRef.current.start;
      if (!drawingRef.current || !s) return;
      dragRef.current.last = clampZone(zoneFromDrag(s, { lat: lngLat.lat, lon: lngLat.lng }));
      if (dragRef.current.raf) return;
      dragRef.current.raf = requestAnimationFrame(() => {
        dragRef.current.raf = 0;
        if (dragRef.current.start) setPreview(dragRef.current.last);
      });
    };
    const end = (lngLat: maplibregl.LngLat | null) => {
      const s = dragRef.current.start;
      const last = dragRef.current.last;
      if (dragRef.current.raf) { cancelAnimationFrame(dragRef.current.raf); dragRef.current.raf = 0; }
      dragRef.current.start = null;
      dragRef.current.last = null;
      if (!drawingRef.current || !s) return;
      // Übernommen wird die zuletzt GEZEICHNETE Fläche, nicht eine aus dem
      // Loslass-Ereignis neu gerechnete: `touchend` trägt keinen Finger mehr,
      // seine Position ist nicht die, die der Nutzer zuletzt gesehen hat
      // (gemessen 2026-08-25: Vorschau 2,4 × 1,7 km, Ereignis 3,7 × 2,6 km).
      const z = last ?? (lngLat ? clampZone(zoneFromDrag(s, { lat: lngLat.lat, lon: lngLat.lng })) : null);
      setPreview(null);
      exitDraw();
      // Ein zu kleiner Zug war ein Klick, keine Fläche — dann bleibt alles, wie
      // es war, und der Nutzer erfährt warum.
      if (isDrawnZone(z)) { setTooShort(false); onChange(z); }
      else setTooShort(true);
    };

    const onDown = (e: maplibregl.MapMouseEvent) => { if (drawingRef.current) { e.preventDefault(); begin(e.lngLat); } };
    const onMove = (e: maplibregl.MapMouseEvent) => move(e.lngLat);
    const onUp = (e: maplibregl.MapMouseEvent) => end(e.lngLat);
    const onTDown = (e: maplibregl.MapTouchEvent) => { if (drawingRef.current) { e.preventDefault(); begin(e.lngLat); } };
    const onTMove = (e: maplibregl.MapTouchEvent) => { if (drawingRef.current) { e.preventDefault(); move(e.lngLat); } };
    const onTUp = () => end(null);

    map.on('mousedown', onDown);
    map.on('mousemove', onMove);
    map.on('mouseup', onUp);
    map.on('touchstart', onTDown);
    map.on('touchmove', onTMove);
    map.on('touchend', onTUp);

    return () => {
      readyRef.current = false;
      if (dragRef.current.raf) cancelAnimationFrame(dragRef.current.raf);
      dragRef.current = { start: null, last: null, raf: 0 };
      map.remove();
      mapRef.current = null;
    };
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

  // Zurück zur flachen Karte: der versteckte Container maß 0 × 0 — MapLibre
  // muss die Maße neu lesen, sonst bleibt das Bild ein Streifen.
  useEffect(() => {
    if (view === 'map') mapRef.current?.resize();
  }, [view]);

  function enterDraw() {
    const map = mapRef.current;
    if (!map) return;
    setTooShort(false);
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
    setTooShort(false);
    onChange(null);
  }

  const shown = preview ?? zone;
  // Welcher Handgriff ist gerade dran? Genau einer ist hervorgehoben.
  const activeHint = drawing ? 2 : zone ? 3 : 1;

  return (
    <div className="evd-zone">
      <ol className="evd-zone-steps">
        <li className={activeHint === 1 ? 'is-now' : undefined}>
          <span className="evd-zone-step-no">1</span>
          <span>Karte schieben und zoomen, bis dein Gelände im Bild ist.</span>
        </li>
        <li className={activeHint === 2 ? 'is-now' : undefined}>
          <span className="evd-zone-step-no">2</span>
          <span><b>Fläche aufziehen</b> drücken — die Karte steht dann fest.</span>
        </li>
        <li className={activeHint === 3 ? 'is-now' : undefined}>
          <span className="evd-zone-step-no">3</span>
          <span>Gedrückt halten, über das Gelände ziehen, loslassen.</span>
        </li>
      </ol>
      <div className="evd-zone-viewtabs" role="tablist" aria-label="Kartenansicht">
        <button
          type="button" role="tab" aria-selected={view === 'map'}
          className={`evd-zone-viewtab${view === 'map' ? ' is-active' : ''}`}
          onClick={() => setView('map')}
        >
          Karte
        </button>
        <button
          type="button" role="tab" aria-selected={view === 'terrain'}
          className={`evd-zone-viewtab${view === 'terrain' ? ' is-active' : ''}`}
          disabled={!zone || drawing}
          title={!zone ? 'Zieh zuerst eine Fläche auf' : undefined}
          onClick={() => { if (zone) setView('terrain'); }}
        >
          Gelände
        </button>
      </div>
      <div className="evd-zone-mapwrap">
        <div ref={boxRef} className={`evd-zone-map${view === 'terrain' ? ' is-hidden' : ''}`} />
        {view === 'terrain' && zone && (
          <Suspense fallback={<div className="evd-zone-loading">Gelände wird geladen …</div>}>
            <EventTerrainMap
              zone={zone}
              mode="preview"
              isMobile={isMobile}
              points={zoneSamplePoints(zone).map((p) => ({ ...p, score: null, worst: false, windDirDeg: null }))}
            />
          </Suspense>
        )}
        {view === 'map' && drawing && (
          <div className="evd-zone-hintbar" role="status">
            {preview
              ? `Ziehen … ${zoneSizeText(preview)} — loslassen setzt die Fläche.`
              : 'Jetzt an einer Ecke gedrückt halten und über das Gelände ziehen.'}
          </div>
        )}
        {view === 'map' && !drawing && !zone && (
          <div className="evd-zone-hintbar evd-zone-hintbar--idle" role="status">
            Noch keine Fläche — drück „Fläche aufziehen“, um sie einzuzeichnen.
          </div>
        )}
      </div>
      <div className="evd-zone-bar">
        <span className={zone ? 'evd-zone-size evd-zone-size--set' : 'evd-zone-size evd-zone-size--todo'}>
          {shown ? zoneSizeText(shown) : 'Fläche erforderlich — ohne sie geht es nicht weiter.'}
        </span>
        <span className="evd-zone-btns">
          {drawing ? (
            <button type="button" className="evd-zone-btn" onClick={exitDraw}>Abbrechen</button>
          ) : (
            <button type="button" className="evd-zone-btn evd-zone-btn--go" onClick={enterDraw} disabled={view === 'terrain'}>
              {zone ? 'Neu aufziehen' : 'Fläche aufziehen'}
            </button>
          )}
          {zone && !drawing && <button type="button" className="evd-zone-btn" onClick={clear} disabled={view === 'terrain'}>Entfernen</button>}
        </span>
      </div>
      {view === 'terrain' && (
        <p className="evd-zone-note">
          Zeichnen geht nur auf der flachen Karte — auf gekipptem Gelände ist ein Rechteck-Zug nicht
          kontrollierbar. Wechsle zu „Karte“, um die Fläche zu ändern.
        </p>
      )}
      {tooShort && (
        <p className="evd-zone-err" role="alert">
          Der Zug war zu kurz — das zählt als Klick. Halte gedrückt und zieh über das Gelände, bis das Rechteck zu sehen ist.
        </p>
      )}
      <div className="evd-zone-note">
        Die Fläche ersetzt den Ort nicht: bewertet wird weiter der gewählte Punkt, die Fläche ergänzt im
        Ergebnis die Spanne über das Gelände (max. {ZONE_MAX_EDGE_KM} km Kante).
      </div>
    </div>
  );
}

function fitZone(map: MapLibreMap, z: EventZone) {
  map.fitBounds([[z.west, z.south], [z.east, z.north]], { padding: 40, duration: 0, maxZoom: 14 });
}
