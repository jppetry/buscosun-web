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
  const holes = await loadCountryRings(country);

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
      loadCountryRings('DE'),
      loadCountryRings('AT'),
      loadCountryRings('CH'),
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

let dachRingsPromise: Promise<number[][][]> | null = null;

/**
 * Raw DE + AT + CH boundary rings ([lng,lat] vertices), for point-in-DACH
 * tests (e.g. clipping the temperature grid-fill labels to the three national
 * territories so they never spill over the dimmed area outside DACH). Reuses
 * the same cached country GeoJSON as the mask, so it is essentially free once
 * the mask has loaded.
 */
export function loadDachRings(): Promise<number[][][]> {
  if (dachRingsPromise) return dachRingsPromise;
  dachRingsPromise = (async () => {
    const [de, at, ch] = await Promise.all([
      loadCountryRings('DE'),
      loadCountryRings('AT'),
      loadCountryRings('CH'),
    ]);
    return [...de, ...at, ...ch];
  })();
  return dachRingsPromise;
}

/**
 * Even-odd point-in-polygon over a set of rings. Returns true when (lng,lat)
 * lies inside an odd number of rings — i.e. inside the DACH union. Tiny
 * enclaves/exclaves (Büsingen, Campione) may flip but are negligible here.
 */
export function pointInRings(rings: number[][][], lng: number, lat: number): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      if (((yi > lat) !== (yj > lat)) && (lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
  }
  return inside;
}

const ringsCache = new Map<Country, Promise<number[][][]>>();

/**
 * Raw boundary rings of a single country ([lng,lat] vertices) for point-in-country
 * tests — e.g. labelling a wildfire cluster with the country it sits in
 * (`fire/fireClusters.ts`). Cached per country, so the mask, the DACH rings and
 * this share one fetch each (DE 866 + AT 484 + CH 366 vertices in total).
 */
export function loadCountryRings(country: Country): Promise<number[][][]> {
  const cached = ringsCache.get(country);
  if (cached) return cached;
  const p = loadCountryHoles(country);
  ringsCache.set(country, p);
  // A failed load must not be remembered as "no rings" forever.
  p.catch(() => ringsCache.delete(country));
  return p;
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
