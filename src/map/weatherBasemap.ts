import type maplibregl from 'maplibre-gl';

/** Dunkler OpenFreeMap-Stil der Wetterkarte — wie Autobahnwetter (`RoadMap.tsx`), Regenradar-Profil und seit Phase BK
 *  auch die Brandkarte (`fire/FireMap.tsx`, Basiskarte „Straßen"). */
export const WEATHER_BASEMAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

/** The lowest boundary line layer of the loaded style ('boundary_state' in dark, was 'boundary_3' in the
 *  former positron style). Weather layers insert themselves right below it, so country/state outlines and
 *  every label stay on top of the heatmaps. */
export function firstBoundaryLayerId(map: maplibregl.Map): string | undefined {
  return map.getStyle()?.layers?.find((l) => l.id.startsWith('boundary'))?.id;
}

/** The dark style's place/water/road labels prefer `name_en` (so DACH country names would read "Germany" /
 *  "Austria" / "Switzerland"); same fix as `RoadMap.tsx`'s `germanLabels` — force the local name. */
export function germanBasemapLabels(map: maplibregl.Map) {
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type !== 'symbol') continue;
    const tf = map.getLayoutProperty(l.id, 'text-field');
    if (tf && JSON.stringify(tf).includes('name_en')) map.setLayoutProperty(l.id, 'text-field', ['coalesce', ['get', 'name:de'], ['get', 'name'], ['get', 'name_en']]);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Orientation under a weather layer (Jan, 2026-10-23): the dark style draws place names in grey (rgb 101) with a
// 1-px halo and keeps roads, water and built-up areas BELOW the weather layers — over a saturated heatmap the map
// turned into colour without places. Two additive parts, both only in the Wetterkarte and the Regenradar
// (`MapView`), never a shader or a WebGL layer:
//  - `weatherLabelContrast`  recolours the style's own place labels (cream on an ink halo) — nothing moves.
//  - `addOrientationLayers`  adds thin vector layers of the same tiles ABOVE the weather layers and below
//                            boundaries/labels: built-up areas as a pale veil, lake and coast outlines, rivers,
//                            motorways/trunk roads (primary from z9) and a dot per city while the labels sit
//                            beside the point (z < 9).
// `?orient=0` is the named fallback: the basemap then reads exactly as before.
// ---------------------------------------------------------------------------------------------------------------

/** `?orient=0` switches both parts off (exact match, like `?pf=live`). */
export function orientationEnabledFrom(search: string = typeof location !== 'undefined' ? location.search : ''): boolean {
  try { return new URLSearchParams(search).get('orient') !== '0'; } catch { return true; }
}

const INK = 'rgba(28,26,22,0.92)';
const CREAM = '#F7F2E6';
const SAND = '#D9D0B8';
/** Source id of the vector tiles in the OpenFreeMap styles. */
const TILES = 'openmaptiles';

export const ORIENTATION_LAYER_IDS = [
  'wx-orient-urban', 'wx-orient-water', 'wx-orient-river', 'wx-orient-road', 'wx-orient-road-primary', 'wx-orient-place',
] as const;

/** The point-place layers (settlements) — not states or countries, those label an area. */
const SETTLEMENT_LAYERS = new Set(['place_city_large', 'place_city', 'place_town', 'place_village', 'place_suburb', 'place_other']);

/** Place and water labels: cream text on an ink halo instead of grey on a thin black one. Settlement names sit to
 *  the RIGHT of their point at every zoom (the style centres them from z8/9): the city temperature of the
 *  Wetterkarte (`temp-label`, number LEFT of the point) and the name never cover each other, and the point itself
 *  is drawn by `wx-orient-place` — the style's tiny grey sprite gives way to it. Idempotent, runs on every
 *  `style.load`. */
export function weatherLabelContrast(map: maplibregl.Map) {
  for (const l of map.getStyle()?.layers ?? []) {
    if (l.type !== 'symbol') continue;
    if (l.id.startsWith('place_')) {
      const big = l.id === 'place_city_large' || l.id.startsWith('place_country');
      const minor = l.id === 'place_other' || l.id === 'place_suburb' || l.id === 'place_state';
      map.setPaintProperty(l.id, 'text-color', minor ? SAND : CREAM);
      map.setPaintProperty(l.id, 'text-halo-color', INK);
      map.setPaintProperty(l.id, 'text-halo-width', big ? 2 : minor ? 1.3 : 1.6);
      map.setPaintProperty(l.id, 'text-halo-blur', 0.5);
      if (SETTLEMENT_LAYERS.has(l.id)) {
        map.setLayoutProperty(l.id, 'text-anchor', 'left');
        map.setLayoutProperty(l.id, 'text-justify', 'left');
        map.setLayoutProperty(l.id, 'text-offset', [0.6, 0.15]);
        map.setPaintProperty(l.id, 'icon-opacity', 0);
      }
    } else if (l.id === 'water_name') {
      map.setPaintProperty(l.id, 'text-color', '#BFD4E6');
      map.setPaintProperty(l.id, 'text-halo-color', INK);
      map.setPaintProperty(l.id, 'text-halo-width', 1.4);
    }
  }
}

/** The orientation layers, inserted before `beforeId` (the first boundary layer) AFTER the weather layers went in
 *  there — so they lie above the heatmaps and below boundaries, labels and the DACH mask. Idempotent. */
export function addOrientationLayers(map: maplibregl.Map, beforeId: string | undefined) {
  if (!map.getSource(TILES)) return;
  const add = (l: maplibregl.LayerSpecification) => { if (!map.getLayer(l.id)) map.addLayer(l, beforeId); };
  const polygon: maplibregl.ExpressionSpecification = ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false];
  const line: maplibregl.ExpressionSpecification = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
  // Built-up areas as a pale veil: towns and villages stay visible as light patches through the heatmap.
  add({
    id: 'wx-orient-urban', type: 'fill', source: TILES, 'source-layer': 'landuse',
    filter: ['all', polygon, ['match', ['get', 'class'], ['residential', 'suburb', 'quarter', 'neighbourhood', 'retail', 'commercial'], true, false]],
    paint: { 'fill-color': '#FFFFFF', 'fill-antialias': false, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.1, 8, 0.16, 11, 0.22, 14, 0.14] },
  });
  // Lakes and coasts as a fine light outline (the water fill itself stays below the weather).
  add({
    id: 'wx-orient-water', type: 'line', source: TILES, 'source-layer': 'water',
    filter: ['all', polygon, ['!=', ['get', 'brunnel'], 'tunnel']],
    paint: { 'line-color': 'rgba(255,255,255,0.6)', 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.5, 9, 1, 13, 1.6] },
  });
  // Rivers from z7.
  add({
    id: 'wx-orient-river', type: 'line', source: TILES, 'source-layer': 'waterway', minzoom: 7,
    filter: ['all', line, ['==', ['get', 'class'], 'river']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': 'rgba(255,255,255,0.45)', 'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.5, 10, 1, 14, 2] },
  });
  // Motorways and trunk roads from z6, primary roads from z9 — two layers, a filter must not read the zoom.
  add({
    id: 'wx-orient-road', type: 'line', source: TILES, 'source-layer': 'transportation', minzoom: 6,
    filter: ['all', line, ['match', ['get', 'class'], ['motorway', 'trunk'], true, false]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': 'rgba(255,255,255,0.4)', 'line-width': ['interpolate', ['exponential', 1.3], ['zoom'], 6, 0.6, 10, 1.3, 14, 2.4] },
  });
  add({
    id: 'wx-orient-road-primary', type: 'line', source: TILES, 'source-layer': 'transportation', minzoom: 9,
    filter: ['all', line, ['==', ['get', 'class'], 'primary']],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': 'rgba(255,255,255,0.28)', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.6, 14, 1.6] },
  });
  // The settlement point itself: its name sits to the right of it (`weatherLabelContrast`), the city temperature
  // to the left. Cities and towns at every zoom, villages from z10 (where the style names them).
  add({
    id: 'wx-orient-place', type: 'circle', source: TILES, 'source-layer': 'place',
    filter: ['all', ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false], ['match', ['get', 'class'], ['city', 'town', 'village'], true, false]],
    paint: {
      'circle-color': CREAM, 'circle-stroke-color': INK, 'circle-stroke-width': 1.2,
      'circle-radius': ['interpolate', ['linear'], ['zoom'],
        4, ['match', ['get', 'class'], 'city', 2, 'town', 1.4, 0],
        8, ['match', ['get', 'class'], 'city', 3.4, 'town', 2.4, 0],
        10, ['match', ['get', 'class'], 'city', 3.8, 'town', 2.8, 1.8],
      ],
    },
  });
}
