/**
 * R3D · Die Tour auf echtem 3D-Gelände (Sicht „Gelände").
 *
 * Anders als der axonometrische Schnitt ist das hier eine **Karte**: MapLibre
 * mit Terrarium-`raster-dem` und gekippter Kamera, die Strecke auf dem Relief,
 * und darüber die vorhandene {@link CurtainLayer} als senkrechte Wetterwand
 * entlang der Route.
 *
 * **Nichts an der WebGL-Pipeline wird geändert** (`audit/route-3d.md` §21.2,
 * E4): `CurtainLayer` wird nur benutzt — `setCurtain` und `setStreamlines` sind
 * die ganze Schnittstelle, Vertex- und Fragment-Programm bleiben unberührt.
 * Deshalb fällt für diese Phase keine STOPP-&-FRAGEN-Auflage an.
 *
 * Zwei Zahlen müssen zusammenpassen (E6): `map.setTerrain({ exaggeration })`
 * und `CurtainLayer.exaggeration`. Sonst schwebt die Wand über dem Berg oder
 * steckt darin. Es ist deshalb EINE Konstante — und ausdrücklich **nicht** die
 * Überhöhung des Schnitts (dort ein Regler, weil er eine Zeichnung streckt;
 * hier fest, weil sie Gelände streckt).
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { patchLibertyRefLength } from '../../map/libertyStyle';
import { CurtainLayer } from '../../threed/CurtainLayer';
import { buildStreamlineSegments } from '../../threed/curtainMesh';
import { buildAnnotatedCurtain } from '../../threed/sectionImage';
import type { CrossSection } from '../../threed/crossSection';
import { haversine } from '../routeModel';
import type { TourPoint } from '../tourTrack';
import {
  CURTAIN_BAND_AGL_M, interpTrack, routeCoords, wetCoords,
  type RouteSegment, type TerrainLayerFlags, type WindArrow,
} from './routeSection';

// Der Typ lebt in `routeSection.ts` (pur), weil ihn seit R3D-8 auch das
// Ergebnis braucht. Hier steht er nur noch als Durchreiche.
export type { TerrainLayerFlags } from './routeSection';

/** Geländeüberhöhung — Karte UND Vorhang tragen denselben Wert (E6). */
export const TERRAIN_EXAGGERATION = 1.3;
/** Kameraneigung der Gelände-Ansicht (Grad). */
const PITCH = 64;
/** Zoom-Zuschlag, der die Neigung ausgleicht (`cameraForBounds` kennt sie nicht). */
const PITCH_ZOOM_BONUS = 1.1;
/** Wie weit die Kamera aus der Streckenrichtung dreht (Grad, siehe `fitToRoute`). */
const VIEW_OFFSET_DEG = 42;

const DEM_SRC = 'r3-dem';
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const HILLSHADE_ID = 'r3-hillshade';
const ROUTE_SRC = 'r3-route';
const WET_SRC = 'r3-route-wet';
const TEMP_SRC = 'r3-route-temp';
const WARN_SRC = 'r3-route-warn';
const ARROW_SRC = 'r3-route-arrows';
/** Bildnamen der Windpfeile — je Relation eine feste Farbe (kein SDF nötig). */
const ARROW_IMG: Record<'head' | 'cross' | 'tail', string> = {
  head: 'r3-arrow-head', cross: 'r3-arrow-cross', tail: 'r3-arrow-tail',
};
const ARROW_COLOR: Record<'head' | 'cross' | 'tail', string> = {
  head: '#D7263D', cross: '#C97B47', tail: '#7A9466',
};
/** Kantenlänge des Pfeil-Bildes (px, bei `pixelRatio: 2` also 24 px im Bild). */
const ARROW_PX = 48;

interface Props {
  points: TourPoint[];
  section: CrossSection;
  layers: TerrainLayerFlags;
  /** Nasse Streckenabschnitte (aus `rainWindows`). */
  wet: Array<{ fromM: number; toM: number }>;
  /** Nach Temperatur eingefärbte Streckenstücke. */
  tempSegments: RouteSegment[];
  /** Streckenstücke mit amtlicher Warnung. */
  warnSegments: RouteSegment[];
  /** Windpfeile: Ort, Richtung (wohin der Wind weht) und Relation zur Fahrt. */
  arrows: WindArrow[];
  /** Gekoppelte Position entlang der Strecke (m). */
  markerM: number;
  onPickDist?: (m: number) => void;
  isMobile: boolean;
}

export default function RouteTerrainMap({
  points, section, layers, wet, tempSegments, warnSegments, arrows, markerM, onPickDist, isMobile,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const layerRef = useRef<CurtainLayer | null>(null);
  const posMarkerRef = useRef<maplibregl.Marker | null>(null);
  const endMarkersRef = useRef<maplibregl.Marker[]>([]);
  const readyRef = useRef(false);
  const [noWebgl, setNoWebgl] = useState(false);

  // Refs, damit die Karten-Callbacks nicht an alten Werten hängen.
  const pointsRef = useRef(points);
  const sectionRef = useRef(section);
  const layersRef = useRef(layers);
  const wetRef = useRef(wet);
  const tempRef = useRef(tempSegments);
  const warnRef = useRef(warnSegments);
  const arrowRef = useRef(arrows);
  const markerRef = useRef(markerM);
  const pickRef = useRef(onPickDist);
  pointsRef.current = points;
  sectionRef.current = section;
  layersRef.current = layers;
  wetRef.current = wet;
  tempRef.current = tempSegments;
  warnRef.current = warnSegments;
  arrowRef.current = arrows;
  markerRef.current = markerM;
  pickRef.current = onPickDist;

  /**
   * Startansicht: **von der tiefen Seite die Strecke hinauf**, leicht schräg.
   *
   * Der erste Versuch stellte die Kamera quer zur Strecke (Peilung − 90°) — auf
   * dem Papier der beste Blick auf eine Wand. Im Browser stand dann die Flanke
   * des Berges zwischen Kamera und Wand und schnitt sie unten ab: die
   * Tiefenprüfung arbeitete richtig, die Ansicht war trotzdem unbrauchbar.
   * Vom tiefen Ende aus läuft die Strecke ins Bild, und nichts liegt davor.
   * `VIEW_OFFSET_DEG` dreht so weit heraus, dass die Wand noch Fläche zeigt.
   */
  function fitToRoute() {
    const map = mapRef.current;
    const pts = pointsRef.current;
    if (!map || pts.length < 2) return;
    let west = pts[0].lon, east = pts[0].lon, south = pts[0].lat, north = pts[0].lat;
    for (const p of pts) {
      if (p.lon < west) west = p.lon;
      if (p.lon > east) east = p.lon;
      if (p.lat < south) south = p.lat;
      if (p.lat > north) north = p.lat;
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    const lowFirst = !(Number.isFinite(first.ele) && Number.isFinite(last.ele)) || first.ele <= last.ele;
    const a = lowFirst ? first : last;
    const b = lowFirst ? last : first;
    const brg = (Math.atan2(
      (b.lon - a.lon) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180),
      b.lat - a.lat,
    ) * 180) / Math.PI;
    const view = brg - VIEW_OFFSET_DEG;
    const cam = map.cameraForBounds([[west, south], [east, north]], {
      padding: isMobile ? 40 : 80,
      bearing: view,
    });
    if (cam?.center && cam.zoom != null) {
      // `cameraForBounds` rechnet OHNE Neigung. Gekippt deckt dasselbe Bild
      // deutlich mehr Fläche ab — im Browser gemessen lag die Strecke sonst als
      // kurzer Strich in einem 30-km-Ausschnitt. Der Zuschlag holt das zurück.
      map.easeTo({
        center: cam.center,
        zoom: Math.min(cam.zoom + PITCH_ZOOM_BONUS, 15),
        bearing: view,
        pitch: PITCH,
        duration: 700,
      });
    }
  }

  // Karte einmal aufbauen.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const start = pointsRef.current[0] ?? { lat: 47.5, lon: 11 };
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [start.lon, start.lat],
      zoom: 11,
      pitch: 60,
      maxPitch: 80,
      // ODbL-Pflichtattribution der Kartenkacheln (V-105).
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Derselbe Stil, dieselbe Warnung — geteilte Korrektur statt Kopie (V-RL-3).
    // Auf `style.load`, NICHT auf `load`: die Kacheln werden schon geparst,
    // während `load` noch auf das erste Bild wartet — im Browser gemessen kam
    // die Warnung sonst trotz Korrektur (dreimal).
    map.on('style.load', () => patchLibertyRefLength(map));

    map.on('load', () => {
      if (!map.getSource(DEM_SRC)) {
        map.addSource(DEM_SRC, { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      }
      map.setTerrain({ source: DEM_SRC, exaggeration: TERRAIN_EXAGGERATION });
      // Der Kartenstil (liberty) hat keine Schummerung; ohne sie liest sich das
      // Relief als Fläche, obwohl es dreidimensional ist. Der Layer nimmt
      // DIESELBE DEM-Quelle — es kommt keine zweite Höhenwahrheit dazu.
      if (!map.getLayer(HILLSHADE_ID)) {
        const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
        map.addLayer({
          id: HILLSHADE_ID,
          type: 'hillshade',
          source: DEM_SRC,
          paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#4A4234', 'hillshade-accent-color': '#6B5A45' },
        }, firstSymbol);
      }
      try {
        map.setSky({
          'sky-color': '#9fc4e8', 'horizon-color': '#e7ecf1', 'fog-color': '#f2efe6',
          'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4,
        });
      } catch { /* setSky ist versionsabhängig */ }

      map.addSource(ROUTE_SRC, { type: 'geojson', data: lineGeoJSON([routeCoords(pointsRef.current)]) });
      map.addLayer({ id: 'r3-route-casing', type: 'line', source: ROUTE_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#FAF6EA', 'line-width': isMobile ? 5 : 7 } });
      map.addLayer({ id: 'r3-route-main', type: 'line', source: ROUTE_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#C97B47', 'line-width': isMobile ? 2.5 : 3.5 } });

      // Reihenfolge = Aussage: die Warnung liegt unter allem als breite Spur,
      // darüber die Temperatur der Strecke, darüber der Regen als Tatsache.
      map.addSource(WARN_SRC, { type: 'geojson', data: coloredGeoJSON([]) });
      map.addLayer({
        id: 'r3-route-warn', type: 'line', source: WARN_SRC,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': isMobile ? 11 : 16, 'line-opacity': 0.5 },
      });

      map.addSource(TEMP_SRC, { type: 'geojson', data: coloredGeoJSON([]) });
      map.addLayer({
        id: 'r3-route-temp', type: 'line', source: TEMP_SRC,
        layout: { 'line-cap': 'butt', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': isMobile ? 4 : 5.5 },
      });

      map.addSource(WET_SRC, { type: 'geojson', data: lineGeoJSON([]) });
      map.addLayer({ id: 'r3-route-wet', type: 'line', source: WET_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#4F7FB5', 'line-width': isMobile ? 3 : 4 } });


      // Deckkraft: die Wand ist die Aussage, das Relief der Ort. Bei 0,88 (Wert
      // der Atmosphären-Ansicht, dort steht die Wand allein) verschwanden die
      // Berge dahinter — hier tragen beide.
      const curtain = new CurtainLayer({ id: 'r3-curtain', exaggeration: TERRAIN_EXAGGERATION, opacity: 0.72 });
      layerRef.current = curtain;
      map.addLayer(curtain);

      // Die Pfeile kommen NACH dem Vorhang. Die Bahn steht genau auf der
      // Strecke; davor gezeichnet verschwanden sie darin (im Browser gesehen).
      // Windpfeile: drei feste Bilder (je Relation eine Farbe) — `icon-color`
      // bräuchte SDF-Bilder, und SDF verlöre die weiße Kontur.
      for (const rel of ['head', 'cross', 'tail'] as const) {
        if (!map.hasImage(ARROW_IMG[rel])) {
          const img = arrowImage(ARROW_COLOR[rel], ARROW_PX);
          if (img) map.addImage(ARROW_IMG[rel], img, { pixelRatio: 2 });
        }
      }
      map.addSource(ARROW_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'r3-route-arrows', type: 'symbol', source: ARROW_SRC,
        layout: {
          'icon-image': ['get', 'img'],
          'icon-rotate': ['get', 'rot'],
          // Der Pfeil LIEGT auf dem Gelände und zeigt dorthin, wo der Wind
          // hinweht — deshalb beide Ausrichtungen an der Karte. `auto` täte
          // dasselbe, aber es soll dastehen: bei 64° Neigung wird ein flacher
          // Pfeil stark verkürzt, und genau daran war er zuerst unsichtbar
          // (12 px flach ≈ 5 px hoch, im Browser gemessen).
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': isMobile ? 1.1 : 1.4,
        },
      });

      readyRef.current = true;
      updateCurtain();
      updateGround();
      syncMarkers();
      updatePos();
      fitToRoute();
    });

    map.on('click', (e) => {
      const pick = pickRef.current;
      if (!pick) return;
      const d = nearestDist(pointsRef.current, e.lngLat.lat, e.lngLat.lng);
      if (d != null) pick(d);
    });

    return () => {
      posMarkerRef.current?.remove();
      posMarkerRef.current = null;
      endMarkersRef.current.forEach((m) => m.remove());
      endMarkersRef.current = [];
      readyRef.current = false;
      layerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // Die Karte wird EINMAL gebaut; alles Weitere läuft über die Effekte unten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Wand + Streamlines
  useEffect(() => { updateCurtain(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [section, layers]);
  // Alles, was AN der Strecke liegt.
  useEffect(() => {
    updateGround();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wet, tempSegments, warnSegments, arrows, layers.rain, layers.warn, layers.routeTemp, layers.arrows, points]);
  // Strecke
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(ROUTE_SRC) as maplibregl.GeoJSONSource | undefined)?.setData(lineGeoJSON([routeCoords(points)]));
    syncMarkers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);
  // Positionsmarke — sie trägt die geteilte Scrub-Position (E8).
  useEffect(() => {
    updatePos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markerM, points]);

  function updateCurtain() {
    const layer = layerRef.current;
    if (!layer || !readyRef.current) return;
    const s = sectionRef.current;
    const l = layersRef.current;
    const image = buildAnnotatedCurtain(s, { useGust: l.gust, temp: l.wallTemp, clouds: l.clouds });
    // Ausgeschaltet heißt: keine Spalten, also kein Dreieck — nicht eine
    // durchsichtige Wand, die weiter Tiefe schreibt.
    if (image) layer.setCurtain(l.wall ? s.columns : [], s.topM, image, CURTAIN_BAND_AGL_M);
    layer.setStreamlines(
      l.streamlines
        ? buildStreamlineSegments(s.columns, s.topM, s.terrainMinM, flowSignAlongLine(s))
        : [],
    );
  }

  /** Positionsmarke setzen oder nachführen. Wird AUCH beim Aufbau gerufen — der
   *  Effekt läuft vor `readyRef` und käme sonst erst beim ersten Scrubben. */
  function updatePos() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const p = interpTrack(pointsRef.current, markerRef.current);
    if (!posMarkerRef.current) {
      const el = document.createElement('div');
      el.className = 'r3-tmap-pos';
      posMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    } else {
      posMarkerRef.current.setLngLat([p.lon, p.lat]);
    }
  }

  function updateGround() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const l = layersRef.current;

    (map.getSource(WET_SRC) as maplibregl.GeoJSONSource | undefined)
      ?.setData(lineGeoJSON(l.rain ? wetCoords(pointsRef.current, wetRef.current) : []));
    (map.getSource(WARN_SRC) as maplibregl.GeoJSONSource | undefined)
      ?.setData(coloredGeoJSON(l.warn ? warnRef.current : []));
    (map.getSource(TEMP_SRC) as maplibregl.GeoJSONSource | undefined)
      ?.setData(coloredGeoJSON(l.routeTemp ? tempRef.current : []));
    (map.getSource(ARROW_SRC) as maplibregl.GeoJSONSource | undefined)
      ?.setData({
        type: 'FeatureCollection',
        features: (l.arrows ? arrowRef.current : []).map((a) => ({
          type: 'Feature' as const,
          properties: { rot: a.rot, img: ARROW_IMG[a.rel] },
          geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        })),
      });

    // Die schlichte Streckenlinie tritt zurück, sobald die Temperatur sie färbt.
    if (map.getLayer('r3-route-main')) {
      map.setLayoutProperty('r3-route-main', 'visibility', l.routeTemp && tempRef.current.length > 0 ? 'none' : 'visible');
    }
  }

  function syncMarkers() {
    const map = mapRef.current;
    if (!map) return;
    endMarkersRef.current.forEach((m) => m.remove());
    const pts = pointsRef.current;
    if (pts.length < 2) { endMarkersRef.current = []; return; }
    const mk = (p: TourPoint, cls: string, title: string) => {
      const el = document.createElement('div');
      el.className = `r3-tmap-end ${cls}`;
      el.title = title;
      return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
    };
    endMarkersRef.current = [
      mk(pts[0], 'is-start', 'Start'),
      mk(pts[pts.length - 1], 'is-goal', 'Ziel'),
    ];
  }

  if (noWebgl) {
    return (
      <div className="r3-tmap-fallback">
        <p><b>Die Gelände-Ansicht braucht WebGL.</b></p>
        <p>
          Dein Browser stellt es nicht bereit. Der <b>Schnitt</b> läuft ohne WebGL — er ist eine
          SVG-Zeichnung und zeigt dieselben Größen über dem Höhenprofil.
        </p>
      </div>
    );
  }

  return (
    <div className="r3-tmap-shell">
      <div ref={containerRef} className="r3-tmap" />
      <button
        type="button"
        className="r3-tmap-fit"
        onClick={fitToRoute}
        title="Strecke einpassen"
        aria-label="Strecke einpassen"
      >
        ⤢
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Helfer */

/** Eingefärbte Streckenstücke als GeoJSON — die Farbe reist als Attribut mit. */
function coloredGeoJSON(segments: RouteSegment[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: segments
      .filter((sgm) => sgm.coords.length >= 2)
      .map((sgm) => ({
        type: 'Feature',
        properties: { color: sgm.color },
        geometry: { type: 'LineString', coordinates: sgm.coords },
      })),
  };
}

/**
 * Ein Windpfeil als Bild. Er zeigt nach oben (Norden im Bild); `icon-rotate`
 * dreht ihn in die Richtung, in die der Wind weht. Weiße Kontur, damit er auf
 * hellem wie dunklem Gelände lesbar bleibt.
 */
function arrowImage(color: string, size = ARROW_PX): ImageData | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  const c = size / 2;
  ctx.beginPath();
  ctx.moveTo(c, size * 0.1);
  ctx.lineTo(size * 0.82, size * 0.86);
  ctx.lineTo(c, size * 0.66);
  ctx.lineTo(size * 0.18, size * 0.86);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.lineWidth = size * 0.09;
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.fill();
  return ctx.getImageData(0, 0, size, size);
}

function lineGeoJSON(lines: Array<Array<[number, number]>>): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: lines
      .filter((l) => l.length >= 2)
      .map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } })),
  };
}

/**
 * Streckendistanz des Trackpunktes, der einem Klick am nächsten liegt.
 * Erst grob über eine Ausdünnung, dann fein in der Nachbarschaft — ein Track
 * darf 100 000 Punkte haben.
 */
export function nearestDist(points: TourPoint[], lat: number, lon: number): number | null {
  if (points.length === 0) return null;
  const step = Math.max(1, Math.ceil(points.length / 1500));
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i += step) {
    const d = haversine(points[i].lat, points[i].lon, lat, lon);
    if (d < bestD) { bestD = d; best = i; }
  }
  const from = Math.max(0, best - step);
  const to = Math.min(points.length - 1, best + step);
  for (let i = from; i <= to; i++) {
    const d = haversine(points[i].lat, points[i].lon, lat, lon);
    if (d < bestD) { bestD = d; best = i; }
  }
  return points[best].dist;
}

/**
 * Strömungsrichtung entlang der Strecke: +1 = zum Ziel, −1 = zum Start.
 * Wortgleich zur Atmosphären-Ansicht — die Chevrons sollen in beiden Ansichten
 * dieselbe Richtung meinen.
 */
function flowSignAlongLine(section: CrossSection): number {
  const cols = section.columns;
  if (cols.length < 2) return 1;
  let meanU = 0;
  let n = 0;
  for (const c of cols) for (const cell of c.cells) { meanU += -cell.windKmh * Math.sin((cell.windDirDeg * Math.PI) / 180); n++; }
  meanU = n ? meanU / n : 0;
  const eastSign = Math.sign(cols[cols.length - 1].lon - cols[0].lon) || 1;
  return meanU * eastSign >= 0 ? 1 : -1;
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}
