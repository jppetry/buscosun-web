/**
 * BD2 — Minikarte des Dossiers: die Fläche des markierten Brands auf der Basiskarte des
 * Brandradars, nicht interaktiv, Klick ⇒ Bühne Karte.
 *
 * Bewusst KEINE zweite `FireMap`: die ist EINE Instanz mit ~40 Layern und elf Quellen — eine
 * Kopie wäre ein zweiter Datenpfad, jede Quelle doppelt gebunden (Befund B2,
 * `audit/brandradar-detail-mitte.md`). Hier gibt es genau eine Quelle: das Feature des
 * markierten Brands aus dem vorhandenen `footprintFc` (oder, wenn der Brandflächen-Layer aus
 * ist, sein Bbox-Rechteck — und der Text sagt es), plus der Mittelpunkt.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import { basemapStyle, type FireBasemap } from './FireMap';
import { patchRefLengthStyle } from '../map/libertyStyle';
import { ExpandButton, setMapInteractive, useExpandedFrame, useMapHost } from '../components/ExpandButton';

/**
 * BD2f: strukturelles Ziel statt `FireRecord` — die Minikarte braucht nur Ort, Kasten und
 * Kennung; damit zeigt sie auch ein Historie-Ereignis (BH3), das kein Registry-Eintrag ist.
 */
export interface MiniMapTarget {
  id: string;
  lat: number;
  lon: number;
  bbox: readonly [number, number, number, number];
}

export interface FireMiniMapProps {
  record: MiniMapTarget;
  /** Die Flächen der Registry — dasselbe Objekt, das `FireMap` zeichnet. */
  footprintFc: GeoJSON.FeatureCollection | null;
  basemap: FireBasemap;
  onClick?: () => void;
  /** Höhe in px (Desktop 300, Tablet 250, Mobil 150). */
  height: number;
  ariaLabel: string;
}

const SRC = 'mini-fp';
const MARK = '#FFB03D'; // --br-mark
const DET = '#FF6B3D'; // --br-det

/** Umgebungskasten eines Historie-Ereignisses (±0,08°) — „Karte · markiert" und das Satellitenbild zeichnen denselben. */
export function historyAreaBbox(lat: number, lon: number): [number, number, number, number] {
  return [lon - 0.08, lat - 0.08, lon + 0.08, lat + 0.08];
}

export function bboxPolygon(b: readonly [number, number, number, number]): GeoJSON.Feature {
  const [w, s, e, n] = b;
  return { type: 'Feature', properties: { kind: 'bbox' }, geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
}

/** Das Feature des Brands — oder sein Bbox-Rechteck, wenn die Registry keins liefert. */
export function miniFeatures(r: MiniMapTarget, fc: GeoJSON.FeatureCollection | null): { fc: GeoJSON.FeatureCollection; fromRegistry: boolean } {
  const own = fc?.features.filter((f) => f.properties?.id === r.id) ?? [];
  const shape = own.length > 0 ? own : [bboxPolygon(r.bbox)];
  const center: GeoJSON.Feature = { type: 'Feature', properties: { kind: 'center' }, geometry: { type: 'Point', coordinates: [r.lon, r.lat] } };
  return { fc: { type: 'FeatureCollection', features: [...shape, center] }, fromRegistry: own.length > 0 };
}

export function FireMiniMap({ record, footprintFc, basemap, height, ariaLabel }: FireMiniMapProps) {
  const elRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const dataRef = useRef(miniFeatures(record, footprintFc).fc);
  dataRef.current = miniFeatures(record, footprintFc).fc;
  const bboxRef = useRef(record.bbox);
  bboxRef.current = record.bbox;
  // Jan 2026-11-07: the enlarge button opens THIS map over the page (dossier stays); in place it neither pans nor zooms.
  const [full, setFull] = useState(false);
  useExpandedFrame(full, () => setFull(false));
  const { slot, host } = useMapHost(full, () => mapRef.current?.resize());
  useEffect(() => { if (mapRef.current) setMapInteractive(mapRef.current, full); }, [full]);

  // Eine Instanz je Mount; der Stil wird bei Basemap-Wechsel getauscht (Layer neu gesetzt).
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = new maplibregl.Map({
      container: el,
      attributionControl: { compact: true },
      center: [record.lon, record.lat],
      zoom: 9,
    });
    mapRef.current = map;
    setMapInteractive(map, false);
    // V-RL-3: derselbe Stil-Eingriff wie Regenradar/Gelände, hier VOR dem ersten Kachel-Parse (transformStyle).
    map.setStyle(basemapStyle(basemap), { transformStyle: (_prev, next) => patchRefLengthStyle(next) });
    const install = () => {
      if (map.getSource(SRC)) return;
      map.addSource(SRC, { type: 'geojson', data: dataRef.current });
      map.addLayer({ id: `${SRC}-fill`, type: 'fill', source: SRC, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': MARK, 'fill-opacity': 0.28 } });
      map.addLayer({ id: `${SRC}-line`, type: 'line', source: SRC, filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']], paint: { 'line-color': MARK, 'line-width': 2 } });
      map.addLayer({ id: `${SRC}-mfill`, type: 'fill', source: SRC, filter: ['==', ['geometry-type'], 'MultiPolygon'], paint: { 'fill-color': MARK, 'fill-opacity': 0.28 } });
      map.addLayer({ id: `${SRC}-center`, type: 'circle', source: SRC, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': DET, 'circle-stroke-color': '#FAF6EA', 'circle-stroke-width': 1.5 } });
      map.fitBounds(bboxRef.current as [number, number, number, number], { padding: 28, maxZoom: 12, duration: 0 });
    };
    // V-BD2-2: dieselbe Regel wie die Hauptkarte (BD2e) — die beim Start ausgeklappte
    // Attribution verdeckte die 150–300-px-Minikarte fast ganz; zugeklappt bleibt der ⓘ-Knopf.
    map.once('load', () => {
      map.getContainer().querySelectorAll('details.maplibregl-ctrl-attrib[open]').forEach((d) => d.removeAttribute('open'));
    });
    map.on('style.load', install);
    // Mobile: the map is often created while its tab/card is hidden or still 0 px wide; the canvas then
    // keeps its stale size and is only CSS-stretched (pixelated). Re-measure and re-fit whenever the box changes.
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      let first = true;
      ro = new ResizeObserver(() => {
        if (first) { first = false; return; }
        map.resize();
        if (map.getSource(SRC)) map.fitBounds(bboxRef.current as [number, number, number, number], { padding: 28, maxZoom: 12, duration: 0 });
      });
      ro.observe(el);
    }
    return () => { ro?.disconnect(); map.remove(); mapRef.current = null; };
    // Basemap-Wechsel läuft über setStyle unten; der Brand über setData.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(basemapStyle(basemap), { transformStyle: (_prev, next) => patchRefLengthStyle(next) });
    // `style.load` (nicht `load`) hängt die Quelle wieder ein — s. install oben.
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(SRC) as maplibregl.GeoJSONSource | undefined;
    if (src) {
      src.setData(dataRef.current);
      map.fitBounds(record.bbox as [number, number, number, number], { padding: 28, maxZoom: 12, duration: 0 });
    }
  }, [record, footprintFc]);

  useEffect(() => { mapRef.current?.resize(); }, [height]);

  return (
    <div ref={slot} className="br-minimap" style={{ height, cursor: 'default' }}>
      {host && createPortal(
        <>
          <div ref={elRef} className="br-minimap-canvas" role="img" aria-label={ariaLabel} />
          <ExpandButton expanded={full} onClick={() => setFull((f) => !f)} label={full ? 'Kleiner machen' : 'Karte vergrößern'} />
        </>, host)}
    </div>
  );
}
