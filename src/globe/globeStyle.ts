/**
 * 3D-Globus · selbst­enthaltener Style im nullschool-Look.
 *
 * Schwarzer Hintergrund, KEINE Landfüllung (das Temperatur-Overlay ist die
 * Oberfläche). Darüber gut sichtbare, fein aufgelöste Küstenlinien (Natural
 * Earth 1:50 m) — weiß mit dezentem dunklem Saum für Kontrast über hellen
 * Temperaturfarben — plus dezente Ländergrenzen und ein zartes Gradnetz.
 * Polkappen-Füllung schließt die Lücke jenseits der Mercator-Grenze (±85°).
 */

import type { StyleSpecification } from 'maplibre-gl';

const SPACE = '#000000';
const OCEAN = '#1b3a5c';            // tiefes Ozeanblau — die Kugel, wenn kein Temp-Overlay läuft
const COAST = '#ffffff';            // kräftige weiße Küstenlinie
const COAST_CASING = 'rgba(8,12,20,0.55)'; // dunkler Saum für Kontrast
const BORDER = '#f3eee0';           // dezente Ländergrenzen
const GRATICULE = '#9fb0c0';
const POLE_COLD = '#5566a6';

export function graticuleGeoJSON(stepDeg = 30): GeoJSON.FeatureCollection<GeoJSON.MultiLineString> {
  const lines: number[][][] = [];
  for (let lon = -180; lon <= 180; lon += stepDeg) {
    const seg: number[][] = [];
    for (let lat = -85; lat <= 85; lat += 5) seg.push([lon, lat]);
    lines.push(seg);
  }
  for (let lat = -60; lat <= 60; lat += stepDeg) {
    const seg: number[][] = [];
    for (let lon = -180; lon <= 180; lon += 5) seg.push([lon, lat]);
    lines.push(seg);
  }
  return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } }] };
}

/** Welt-Polygon (Mercator-Bereich ±85°) — füllt die Kugel als Ozeanblau, wenn
 *  kein Temperatur-Overlay läuft. Die Polkappen schließen den Rest jenseits ±85°. */
function oceanGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]]] },
    }],
  };
}

function polarCapsGeoJSON(): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const cap = (latInner: number, latOuter: number): GeoJSON.Feature<GeoJSON.Polygon> => ({
    type: 'Feature', properties: {},
    geometry: { type: 'Polygon', coordinates: [[[-180, latInner], [180, latInner], [180, latOuter], [-180, latOuter], [-180, latInner]]] },
  });
  return { type: 'FeatureCollection', features: [cap(84.5, 90), cap(-84.5, -90)] };
}

export function globeStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {
      coastline: { type: 'geojson', data: '/globe/coastline-50m.geojson' },
      borders: { type: 'geojson', data: '/globe/borders-50m.geojson' },
      graticule: { type: 'geojson', data: graticuleGeoJSON(30) },
      poles: { type: 'geojson', data: polarCapsGeoJSON() },
      ocean: { type: 'geojson', data: oceanGeoJSON() },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': SPACE } },
      // Ozeanblaue Kugel-Füllung: scheint durch, wenn nur Wind aktiv ist; wird vom
      // Temperatur-Overlay (deckend) verdeckt, sobald Temp eingeblendet wird.
      { id: 'ocean', type: 'fill', source: 'ocean', paint: { 'fill-color': OCEAN, 'fill-opacity': 1 } },
      // Das Temperatur-Overlay wird zur Laufzeit VOR 'poles' eingefügt.
      { id: 'poles', type: 'fill', source: 'poles', paint: { 'fill-color': POLE_COLD, 'fill-opacity': 0.92 } },
      { id: 'graticule', type: 'line', source: 'graticule', paint: { 'line-color': GRATICULE, 'line-width': 0.5, 'line-opacity': 0.16 } },
      { id: 'borders', type: 'line', source: 'borders', paint: { 'line-color': BORDER, 'line-width': 0.7, 'line-opacity': 0.62, 'line-dasharray': [2, 1.6] } },
      // Küstenlinie: dunkler Saum + kräftiger weißer Kern.
      { id: 'coast-casing', type: 'line', source: 'coastline', paint: { 'line-color': COAST_CASING, 'line-width': 2.1, 'line-blur': 0.6, 'line-opacity': 0.85 } },
      { id: 'coast', type: 'line', source: 'coastline', paint: { 'line-color': COAST, 'line-width': 1.0, 'line-opacity': 0.95 } },
    ],
  };
}

/** Layer-ID, VOR der das Temperatur-Overlay eingefügt wird (unter Kappen/Linien). */
export const TEMP_BEFORE_ID = 'poles';
