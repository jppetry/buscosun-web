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
