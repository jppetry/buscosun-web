/**
 * Per-country data-pipeline profiles.
 *
 * Each profile binds a country to its locally best data stack:
 *   DE → DWD MOSMIX + DWD live obs + DWD RADOLAN-RV nowcast
 *   AT → GeoSphere AROME (60 h) + INCA (3 h nowcast) + TAWES live obs
 *   CH → GeoSphere AROME (CH lies inside AROME's bbox) + MeteoSwiss SMN live obs
 *
 * Cross-border bleeding happens naturally through IDW: e.g. AROME covers
 * southern DE up to ~51.5 °N, so a profile pinned to DE will *still* pull
 * AROME samples if its bounds overlap. Profiles choose the *primary* stack;
 * the FusionEngine treats every ingested source as additional information.
 */

import type { Country } from './types';
import type { ForecastBounds } from './sources/openMeteoForecast';

/**
 * Common DACH viewport — used for the map view regardless of which country
 * the user searched in, so DE/AT/CH are always all visible. The country
 * profile still drives the *point forecast* source mix (DWD vs GeoSphere
 * vs MeteoSwiss) — only the map's camera + mask + fusion-grid bbox use
 * these defaults.
 */
export const DACH_VIEW = {
  bounds: { lngMin: 5.5, lngMax: 17.5, latMin: 45.5, latMax: 55.5 } satisfies ForecastBounds,
  defaultCenter: [10.5, 50.2] as [number, number],
  defaultZoom: 5.3,
};

export interface CountryProfile {
  code: Country;
  name: string;

  /** Initial map view extent (matches the country's natural footprint). */
  bounds: ForecastBounds;
  /** [lng, lat] suggested map centre when no specific location is selected. */
  defaultCenter: [number, number];
  defaultZoom: number;

  /** Which Source adapters to fire in loadFusedForecast(). */
  useMosmix: boolean;
  useDwdObs: boolean;
  useDwdRadar: boolean;
  useArome: boolean;
  useInca: boolean;
  useTawes: boolean;
  useSmn: boolean;

  /** How many forecast hours to request (sources may cap lower). */
  forecastHours: number;

  /** Friendly source-stack label for the status badge. */
  stackLabel: string;
}

export const COUNTRY_PROFILES: Record<Country, CountryProfile> = {
  // bounds/defaultCenter/defaultZoom are kept for reference / per-country
  // future use, but the MapView now opens at DACH_VIEW so all three countries
  // are visible. The `use*` flags below are all DACH-wide on so the heatmap
  // grid has coverage everywhere — point-forecast still picks its primary
  // source set based on the search location's country.
  DE: {
    code: 'DE',
    name: 'Deutschland',
    bounds: { lngMin: 5.5, lngMax: 15.5, latMin: 47.0, latMax: 55.5 },
    defaultCenter: [10.5, 51.2],
    defaultZoom: 5.6,
    useMosmix: true,
    useDwdObs: true,
    useDwdRadar: true,
    useArome: true,     // cross-border coverage for southern DE / DACH view
    useInca: false,     // INCA bbox is AT only — would just return 400s
    useTawes: true,     // sparse AT stations help the IDW field near the border
    useSmn: true,       // ditto for CH
    forecastHours: 24,
    stackLabel: 'DWD ICON-D2 / MOSMIX + Live + RADOLAN-RV',
  },
  AT: {
    code: 'AT',
    name: 'Österreich',
    bounds: { lngMin: 9.0, lngMax: 17.5, latMin: 46.0, latMax: 49.5 },
    defaultCenter: [13.5, 47.6],
    defaultZoom: 6.8,
    useMosmix: true,     // DE-side coverage for DACH view
    useDwdObs: true,
    useDwdRadar: true,   // RADOLAN bleeds slightly into Vorarlberg / N-Tirol
    useArome: true,
    useInca: true,
    useTawes: true,
    useSmn: true,
    forecastHours: 60,   // AROME goes to +60 h
    stackLabel: 'GeoSphere AROME + INCA + TAWES',
  },
  CH: {
    code: 'CH',
    name: 'Schweiz',
    bounds: { lngMin: 5.7, lngMax: 10.7, latMin: 45.7, latMax: 47.9 },
    defaultCenter: [8.2, 46.8],
    defaultZoom: 7.2,
    useMosmix: true,     // DE-side coverage
    useDwdObs: true,
    useDwdRadar: true,
    useArome: true,
    useInca: false,
    useTawes: true,
    useSmn: true,
    forecastHours: 60,
    stackLabel: 'GeoSphere AROME + MeteoSwiss SMN',
  },
};

/** Resolve an ISO country code (Nominatim address.country_code is lowercase). */
export function parseCountry(raw: string | undefined): Country | null {
  if (!raw) return null;
  const up = raw.trim().toUpperCase();
  if (up === 'DE' || up === 'AT' || up === 'CH') return up;
  return null;
}
