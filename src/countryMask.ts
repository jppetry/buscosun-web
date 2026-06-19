/**
 * Build an inverted country mask: a single GeoJSON polygon whose outer ring
 * is the whole world and whose inner rings are the country boundary(ies).
 *
 * Used as a MapLibre `fill` source so we can dim everything outside the
 * active country with a single semi-transparent layer — the country itself
 * shows through unscathed because it sits in the hole.
 *
 * The country GeoJSON is loaded from `/countries/<ISO>.geojson` (bundled in
 * `public/countries/`); their geometries originate from Nominatim's
 * `polygon_geojson=1&polygon_threshold=0.01` simplification.
 */

import type { Country } from './types';

interface CountryFeature {
  type: 'Feature';
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

const WORLD_RING: number[][] = [
  [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85],
];

const cache = new Map<Country, GeoJSON.Feature>();

/**
 * Load the country GeoJSON and return a MapLibre-ready mask Feature where
 * the country shape is a hole inside a world-sized outer ring.
 */
export async function loadCountryMask(country: Country): Promise<GeoJSON.Feature> {
  const cached = cache.get(country);
  if (cached) return cached;
  const holes = await loadCountryHoles(country);

  const mask: GeoJSON.Feature = {
    type: 'Feature',
    properties: { iso: country },
    geometry: {
      type: 'Polygon',
      // MapLibre's even-odd fill-rule renders rings 2..N as holes.
      coordinates: [WORLD_RING, ...holes],
    },
  };
  cache.set(country, mask);
  return mask;
}

let dachMaskPromise: Promise<GeoJSON.Feature> | null = null;

/**
 * DACH mask — union of DE + AT + CH boundaries cut out of a single world-ring.
 * Used for the map's "show all three countries" overview view: the three
 * national territories show through, everything outside DACH is dimmed.
 */
export function loadDachMask(): Promise<GeoJSON.Feature> {
  if (dachMaskPromise) return dachMaskPromise;
  dachMaskPromise = (async () => {
    const [de, at, ch] = await Promise.all([
      loadCountryHoles('DE'),
      loadCountryHoles('AT'),
      loadCountryHoles('CH'),
    ]);
    return {
      type: 'Feature',
      properties: { iso: 'DACH' },
      geometry: {
        type: 'Polygon',
        coordinates: [WORLD_RING, ...de, ...at, ...ch],
      },
    } satisfies GeoJSON.Feature;
  })();
  return dachMaskPromise;
}

async function loadCountryHoles(country: Country): Promise<number[][][]> {
  const res = await fetch(`/countries/${country}.geojson`);
  if (!res.ok) throw new Error(`country mask ${country}: HTTP ${res.status}`);
  const feat = (await res.json()) as CountryFeature;
  const holes: number[][][] = [];
  if (feat.geometry.type === 'Polygon') {
    for (const ring of feat.geometry.coordinates) holes.push(ring);
  } else {
    for (const poly of feat.geometry.coordinates) {
      for (const ring of poly) holes.push(ring);
    }
  }
  return holes;
}
