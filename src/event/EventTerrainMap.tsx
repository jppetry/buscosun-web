/**
 * ET1 — Die Event-Fläche auf echtem 3D-Gelände.
 *
 * MapLibre mit Terrarium-`raster-dem`, gekippter Kamera und Schummerung aus
 * DERSELBEN Höhenquelle — das 1:1-Muster von `RouteTerrainMap` (R3D), nur ohne
 * dessen Strecken-Instrumente: eine Fläche hat keine Distanzachse. Die Zone
 * liegt als drapiertes Rechteck auf dem Relief, die fünf Messpunkte des
 * Zonen-Scans stehen als Chips mit ihrem Score darauf, die Windpfeile (ET2)
 * und die Extrempunkte (ET3) kommen als eigene Ebenen dazu.
 *
 * Kein Shader, keine WebGL-Pipeline-Änderung: MapLibre-Kern-Terrain und
 * -Hillshade werden nur benutzt (`audit/event-terrain.md` §2.4).
 *
 * Kamera: BEARING ist fest 0 — Norden bleibt oben, denn die Messpunkte heißen
 * „Nordwest-Ecke" usw.; eine gedrehte Karte widerspräche ihren eigenen Namen.
 */

import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { patchLibertyRefLength } from '../map/libertyStyle';
import { zoneCenter, zoneRing, type EventZone, type ZoneCornerId } from './eventZone';

/** Ein Messpunkt auf der Karte (Scan-Ergebnis oder nackter Vorschau-Punkt). */
export interface TerrainChipPoint {
  id: 'center' | ZoneCornerId;
  label: string;
  lat: number;
  lon: number;
  /** null = Scan läuft noch / Vorschau — der Chip zeigt dann nur das Kürzel. */
  score: number | null;
  /** Nur true, wenn die Spanne nicht `uniform` ist (Uniform-Regel, §4.1). */
  worst: boolean;
  /** Windrichtung (woher, Grad) für den Pfeil — null = kein Pfeil (ET2). */
  windDirDeg: number | null;
}

/** Tiefster/höchster Rasterpunkt der Zone (ET3). */
export interface TerrainExtremePoint {
  kind: 'lowest' | 'highest';
  lat: number;
  lon: number;
  elevM: number;
}

interface Props {
  zone: EventZone;
  points: TerrainChipPoint[];
  extremes?: TerrainExtremePoint[];
  /** ET4/E5: Hillshade-Beleuchtung auf den Sonnenazimut der gewählten Phase. */
  illuminationAzimuthDeg?: number | null;
  /** 'preview' (Wizard): nur Zone + Punkte, keine Pfeile, keine Beleuchtungssteuerung. */
  mode: 'result' | 'preview';
  isMobile: boolean;
}

const DEM_SRC = 'evt-dem';
const DEM_TILES = 'https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png';
const HILLSHADE_ID = 'evt-hillshade';
const ZONE_SRC = 'evt-zone';
const ARROW_SRC = 'evt-arrows';
const ARROW_IMG = 'evt-arrow';
/** EIN neutrales Pfeilbild: die Kopf/Quer/Rücken-Relation der Route gibt es an einer Fläche nicht. */
const ARROW_COLOR = '#1C1917';
const ARROW_PX = 48;
/** Wie R3D (E6-Wert) — Karte und Schummerung teilen die Quelle, es gibt keine zweite Höhe. */
export const TERRAIN_EXAGGERATION = 1.3;
const PITCH = 64;
/** `cameraForBounds` rechnet ohne Neigung — gekippt deckt dasselbe Bild mehr Fläche ab (R3D-Messung). */
const PITCH_ZOOM_BONUS = 1.1;
/** Fest Nord oben — die Ecken-Namen (NW/NO/SO/SW) müssen zur Karte passen. */
const BEARING = 0;
const TERRACOTTA = '#C97B47';
/** MapLibre-Default der Hillshade-Beleuchtung (NW) — gilt, solange ET4 keine Phase wählt. */
const DEFAULT_ILLUMINATION_DEG = 335;

const CHIP_SHORT: Record<TerrainChipPoint['id'], string> = {
  center: 'Mitte', nw: 'NW', ne: 'NO', se: 'SO', sw: 'SW',
};

export default function EventTerrainMap({
  zone, points, extremes, illuminationAzimuthDeg, mode, isMobile,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const chipMarkersRef = useRef<maplibregl.Marker[]>([]);
  const extremeMarkersRef = useRef<maplibregl.Marker[]>([]);
  const readyRef = useRef(false);
  const [noWebgl, setNoWebgl] = useState(false);

  // Refs je Prop (RouteTerrainMap-Muster): die Karte wird EINMAL gebaut, ihre
  // Callbacks lesen immer den aktuellen Stand.
  const zoneRef = useRef(zone);
  const pointsRef = useRef(points);
  const extremesRef = useRef(extremes ?? []);
  const illumRef = useRef(illuminationAzimuthDeg ?? null);
  const modeRef = useRef(mode);
  zoneRef.current = zone;
  pointsRef.current = points;
  extremesRef.current = extremes ?? [];
  illumRef.current = illuminationAzimuthDeg ?? null;
  modeRef.current = mode;

  function fitToZone() {
    const map = mapRef.current;
    if (!map) return;
    const z = zoneRef.current;
    const cam = map.cameraForBounds([[z.west, z.south], [z.east, z.north]], {
      padding: isMobile ? 40 : 80,
      bearing: BEARING,
    });
    if (cam?.center && cam.zoom != null) {
      map.easeTo({
        center: cam.center,
        zoom: Math.min(cam.zoom + PITCH_ZOOM_BONUS, 15),
        bearing: BEARING,
        pitch: PITCH,
        duration: 700,
      });
    }
  }

  // Karte einmal aufbauen.
  useEffect(() => {
    if (!containerRef.current) return;
    if (!supportsWebGL()) { setNoWebgl(true); return; }
    const c = zoneCenter(zoneRef.current);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [c.lon, c.lat],
      zoom: 11,
      pitch: 60,
      maxPitch: 80,
      // ODbL-Pflichtattribution der Kartenkacheln (V-105).
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

    // Derselbe Stil, dieselbe Warnung — geteilte Korrektur statt Kopie (V-RL-3).
    // Auf `style.load`, NICHT auf `load` (R3D-Messung: auf `load` kam die
    // Warnung trotz Korrektur, dreimal).
    map.on('style.load', () => patchLibertyRefLength(map));

    // MapLibre öffnet die kompakte Attribution beim Start AUSGEKLAPPT — der
    // Block verdeckt die untere Kartenhälfte samt Chips (BD2e, gemessen an der
    // Brandkarte; Dreizeiler aus FireMap). ⓘ bleibt.
    map.once('load', () => {
      map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]')
        .forEach((d) => d.removeAttribute('open'));
    });

    map.on('load', () => {
      if (!map.getSource(DEM_SRC)) {
        map.addSource(DEM_SRC, { type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14 });
      }
      map.setTerrain({ source: DEM_SRC, exaggeration: TERRAIN_EXAGGERATION });
      // liberty hat keine Schummerung; ohne sie liest sich das Relief als
      // Fläche. DIESELBE DEM-Quelle — keine zweite Höhenwahrheit.
      if (!map.getLayer(HILLSHADE_ID)) {
        const firstSymbol = map.getStyle().layers?.find((l) => l.type === 'symbol')?.id;
        map.addLayer({
          id: HILLSHADE_ID,
          type: 'hillshade',
          source: DEM_SRC,
          paint: {
            'hillshade-exaggeration': 0.45,
            'hillshade-shadow-color': '#4A4234',
            'hillshade-accent-color': '#6B5A45',
            // ET4 stellt die Beleuchtung auf den Sonnenazimut — eine
            // Kompassrichtung gehört an die Karte, nicht an den Viewport
            // (Default 'viewport' drehte sie mit der Kamera mit).
            'hillshade-illumination-anchor': 'map',
            'hillshade-illumination-direction': illumRef.current ?? DEFAULT_ILLUMINATION_DEG,
          },
        }, firstSymbol);
      }
      try {
        map.setSky({
          'sky-color': '#9fc4e8', 'horizon-color': '#e7ecf1', 'fog-color': '#f2efe6',
          'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.4,
        });
      } catch { /* setSky ist versionsabhängig */ }

      // Die Zone als drapiertes Rechteck — fill/line legt MapLibre-Terrain
      // aufs Relief (Repo-Beleg: die Streckenlinien der Route liegen so).
      map.addSource(ZONE_SRC, { type: 'geojson', data: zoneGeoJSON(zoneRef.current) });
      map.addLayer({ id: 'evt-zone-fill', type: 'fill', source: ZONE_SRC, paint: { 'fill-color': TERRACOTTA, 'fill-opacity': 0.14 } });
      map.addLayer({ id: 'evt-zone-line', type: 'line', source: ZONE_SRC, paint: { 'line-color': TERRACOTTA, 'line-width': 2 } });

      // Windpfeile (ET2). Der Pfeil LIEGT auf dem Gelände und zeigt dorthin,
      // wo der Wind hinweht — beide Ausrichtungen an der Karte: bei 64°
      // Neigung wird ein flacher Pfeil sonst fast unsichtbar (R3D-6, gemessen).
      if (!map.hasImage(ARROW_IMG)) {
        const img = arrowImage(ARROW_COLOR, ARROW_PX);
        if (img) map.addImage(ARROW_IMG, img, { pixelRatio: 2 });
      }
      map.addSource(ARROW_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'evt-arrow-layer', type: 'symbol', source: ARROW_SRC,
        layout: {
          'icon-image': ARROW_IMG,
          'icon-rotate': ['get', 'rot'],
          'icon-rotation-alignment': 'map',
          'icon-pitch-alignment': 'map',
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-size': isMobile ? 1.1 : 1.4,
        },
      });

      readyRef.current = true;
      syncChips();
      syncExtremes();
      updateArrows();
      fitToZone();
    });

    return () => {
      chipMarkersRef.current.forEach((m) => m.remove());
      chipMarkersRef.current = [];
      extremeMarkersRef.current.forEach((m) => m.remove());
      extremeMarkersRef.current = [];
      readyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // Die Karte wird EINMAL gebaut; alles Weitere läuft über die Effekte unten.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zone nachführen (Vorschau im Wizard kann mit anderer Fläche wiederkommen).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    (map.getSource(ZONE_SRC) as maplibregl.GeoJSONSource | undefined)?.setData(zoneGeoJSON(zone));
    fitToZone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zone.west, zone.south, zone.east, zone.north]);

  // Messpunkte + Pfeile
  useEffect(() => {
    syncChips();
    updateArrows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);
  // Extrempunkte (ET3)
  useEffect(() => {
    syncExtremes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extremes]);
  // Beleuchtung (ET4)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current || !map.getLayer(HILLSHADE_ID)) return;
    map.setPaintProperty(HILLSHADE_ID, 'hillshade-illumination-direction', illuminationAzimuthDeg ?? DEFAULT_ILLUMINATION_DEG);
  }, [illuminationAzimuthDeg]);

  /** Messpunkt-Chips als HTML-Marker — MapLibre stellt Marker auf Terrain auf Bodenhöhe. */
  function syncChips() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    chipMarkersRef.current.forEach((m) => m.remove());
    chipMarkersRef.current = pointsRef.current.map((p) => {
      const el = document.createElement('div');
      el.className = `evd-tmap-chip${p.worst ? ' evd-tmap-chip--worst' : ''}`;
      el.title = p.label;
      const short = document.createElement('span');
      short.textContent = CHIP_SHORT[p.id];
      el.appendChild(short);
      if (p.score != null) {
        const score = document.createElement('b');
        score.textContent = String(Math.round(p.score));
        el.appendChild(score);
      }
      // Leicht über den Punkt gehoben: Chip und Windpfeil teilen die Koordinate —
      // mittig verankert läge der Chip GENAU auf dem Pfeil (im Browser gesehen).
      return new maplibregl.Marker({ element: el, offset: [0, -22] }).setLngLat([p.lon, p.lat]).addTo(map);
    });
  }

  /** Tiefster/höchster Rasterpunkt (ET3). */
  function syncExtremes() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    extremeMarkersRef.current.forEach((m) => m.remove());
    extremeMarkersRef.current = extremesRef.current.map((e) => {
      const el = document.createElement('div');
      el.className = `evd-tmap-extreme is-${e.kind}`;
      el.title = e.kind === 'lowest'
        ? `Tiefster Rasterpunkt (${Math.round(e.elevM)} m) — bei Regen zuerst nass`
        : `Höchster Rasterpunkt (${Math.round(e.elevM)} m) — exponierteste Stelle`;
      return new maplibregl.Marker({ element: el }).setLngLat([e.lon, e.lat]).addTo(map);
    });
  }

  /** Windpfeile aus den Messpunkten (ET2) — nur im Ergebnis, nie in der Vorschau. */
  function updateArrows() {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const pts = modeRef.current === 'result' ? pointsRef.current : [];
    (map.getSource(ARROW_SRC) as maplibregl.GeoJSONSource | undefined)?.setData({
      type: 'FeatureCollection',
      features: pts
        .filter((p) => p.windDirDeg != null)
        .map((p) => ({
          type: 'Feature' as const,
          // Pfeil zeigt, WOHIN der Wind weht — Richtungsangabe ist „woher".
          properties: { rot: (((p.windDirDeg! + 180) % 360) + 360) % 360 },
          geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        })),
    });
  }

  if (noWebgl) {
    return (
      <div className="evd-tmap-fallback">
        <p><b>Die Gelände-Ansicht braucht WebGL.</b></p>
        <p>
          Dein Browser stellt es nicht bereit. Die Zahlen darunter (Spanne, Messpunkte,
          Kennzahlen) gelten unabhängig davon — nur das Relief-Bild entfällt.
        </p>
      </div>
    );
  }

  return (
    <div className="evd-tmap-shell">
      <div ref={containerRef} className="evd-tmap" />
      <button
        type="button"
        className="evd-tmap-fit"
        onClick={fitToZone}
        title="Fläche einpassen"
        aria-label="Fläche einpassen"
      >
        ⤢
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ Helfer */

function zoneGeoJSON(z: EventZone): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [zoneRing(z)] } }],
  };
}

/**
 * Ein Windpfeil als Bild (Kopie aus RouteTerrainMap, Herkunftskommentar dort:
 * `icon-color` bräuchte SDF, und SDF verlöre die weiße Kontur). Zeigt nach
 * oben; `icon-rotate` dreht ihn in die Richtung, in die der Wind weht.
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

/** Kopie aus RouteTerrainMap (Darstellungs-Utility, kein Aussagecharakter). */
function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}
