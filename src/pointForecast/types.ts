/**
 * Point-forecast — exact-location forecast for a single (lat, lng) query.
 *
 * Built on top of the existing data adapters but bypasses the IDW grid: each
 * source is sampled directly at the query point (model grids: native nearest
 * cell; station obs: distance + elevation weighted blend of the nearest
 * sensors). Lead-time-dependent source weights then blend the per-hour
 * samples into one time series, with the live stations dominating at h=0
 * and the high-res NWP taking over from h~2.
 */

export type SourceFamily =
  | 'obs'           // live station observations (DWD_OBS, TAWES, SMN)
  | 'nowcast'       // very-short range analysis/nowcast (INCA, RADOLAN)
  | 'highres'       // 1-3 km NWP (ICON-D2, ICON-CH1, AROME)
  | 'mosmix'        // DWD MOSMIX station forecast (~30 km)
  | 'global';       // ECMWF IFS / Open-Meteo best_match catch-all

export interface PointSourceSample {
  /** Source model tag (e.g. 'dwd_obs', 'inca', 'icon_d2', 'mosmix'). */
  source: string;
  family: SourceFamily;
  /** Variables at this hour — null = source doesn't carry the variable. */
  temperature: number | null;       // °C at *source* elevation (before lapse correction)
  /** Source elevation if known (station height, model topography m). */
  sourceElevation: number | null;
  u: number | null;                  // m/s east-component @10m
  v: number | null;                  // m/s north-component @10m
  /** Max wind gust during the hour, m/s. Optional — many sources don't carry it. */
  gust: number | null;
  /** Relative humidity at 2 m, %. Optional — not every source provides it. */
  relativeHumidity: number | null;
  /** Schneefallgrenze in m ü. M. (AROME snowlmt). Null wenn Quelle das nicht liefert. */
  snowLine: number | null;
  cloudLow: number | null;           // %
  cloudMid: number | null;           // %
  cloudHigh: number | null;          // %
  precipitation: number | null;      // mm/h
  /** UV-Index (0..11+). Aktuell nur die dwd_uv-Quelle (DE) trägt das. */
  uvIndex: number | null;
  /** Distance from query point in metres (0 for native grid samples). */
  distanceMeters?: number;
}

export interface PointHourSamples {
  /** Forecast validity time. */
  timestamp: Date;
  samples: PointSourceSample[];
}

export interface PointForecastHour {
  timestamp: Date;
  /** Temperature (°C) at the query-point elevation. */
  temperature: number | null;
  /** Wind speed (m/s) at 10 m. */
  windSpeed: number | null;
  /** Wind direction in meteorological degrees (where wind comes FROM). */
  windDirection: number | null;
  /** Max wind gust (m/s) during the hour — always ≥ windSpeed when both present. */
  gustSpeed: number | null;
  /** Relative humidity at 2 m, %. */
  relativeHumidity: number | null;
  /** Apparent ("felt") temperature in °C — Wind-Chill (cold) / Heat-Index (hot)
   *  derived from temperature + windSpeed + relativeHumidity. */
  apparentTemperature: number | null;
  /** Schneefallgrenze in m ü. M. — aktuell nur AROME (AT/CH). */
  snowLineM: number | null;
  /** Total cloud cover 0..100 (synthetic combination of low/mid/high). */
  cloudCoverTotal: number | null;
  cloudCoverLow: number | null;
  cloudCoverMid: number | null;
  cloudCoverHigh: number | null;
  /** Precipitation in mm/h. */
  precipitation: number | null;
  /** UV-Index (0..11+) — DWD-Tagespeak, per Sonnenstand auf die Stunde verteilt. */
  uvIndex: number | null;
  /** Per-variable confidence 0..1 — higher = sources agree + close stations. */
  confidence: {
    temperature: number;
    wind: number;
    gust: number;
    humidity: number;
    precipitation: number;
    clouds: number;
    snowLine: number;
    uvIndex: number;
  };
  /** Source tags that contributed > 5 % weight to this hour's blend. */
  contributingSources: string[];
}

/**
 * Wetter eines einzelnen Wetter-Samples — Ergebnis der Anreicherungs-
 * Pipeline (siehe weatherEnrichment.ts). Skalare sind auf die Sample-ETA
 * zeitlich interpoliert; Niederschlag stammt entweder aus dem NWP oder —
 * im Nowcast-Horizont — aus dem Radar (precipitationSource zeigt's an).
 */
export interface SampleWeather {
  temperatureC: number | null;
  apparentTempC: number | null;
  windSpeedMps: number | null;
  /** Meteorologische Richtung (Grad), aus der der Wind weht. */
  windDirectionDeg: number | null;
  gustMps: number | null;
  relativeHumidityPct: number | null;
  cloudCoverPct: number | null;
  /** UV-Index (0..11+) am Sample. Null außerhalb DE/DWD-Horizont. */
  uvIndex: number | null;
  precipitationMmH: number | null;
  precipitationSource: 'radar' | 'nwp' | null;
  /** Aus T+Precip heuristisch klassifiziert; ICON-D2/AROME-Upgrade in B2-Pro. */
  precipitationType: 'none' | 'rain' | 'sleet' | 'snow';
  /** Schneefallgrenze in m ü. M. (AROME snowlmt, AT/CH). Null wenn unbekannt. */
  snowLineM: number | null;
  /** Föhn-Einschätzung (heuristisch, Tier-C) — siehe foehnDetector.ts. Null bei zu wenig Daten. */
  foehn: FoehnAssessment | null;
  warnings: TourWarning[];
  confidence: {
    temperature: number;
    wind: number;
    gust: number;
    humidity: number;
    precipitation: number;
    clouds: number;
    snowLine: number;
    uvIndex: number;
  };
  /** ID des räumlichen Clusters, dessen pointForecast diesen Sample speist. */
  cellId: number;
  /** Quellen-Tags, die zu den Werten beigetragen haben. */
  sourcesUsed: string[];
  /** ETA fällt zwischen zwei Stundenwerten (statt exakt auf einer Stunde). */
  isInterpolated: boolean;
  /** Status-Flags: 'ok' | 'beyond_horizon' | 'fusion_failed' | 'radar_override' | … */
  validityFlags: string[];
}

/**
 * Eine zur Route + Zeit aktive Wetterwarnung. Aktuell von BrightSky/DWD
 * (DE-only) gespeist — AT/CH benötigen eigene Adapter (GeoSphere /
 * MeteoSwiss CAP).
 */
export interface TourWarning {
  source: 'dwd_cap';
  alertId: string;
  event: string;                       // z. B. "Sturmböen"
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme';
  /** DWD-Skalen-Level 1..5. Höher = gefährlicher. */
  level: number;
  headline: string;
  description?: string;
  onsetMs: number;
  expiresMs: number;
}

/**
 * Föhn-Einschätzung für einen Sample (heuristisch, Tier-C). Aggregiert mehrere
 * schwache Indikatoren (Windrichtung aus dem Leesektor, Windstärke, niedrige
 * Luftfeuchte, Böigkeit, Wärme) zu einem Score 0..1.
 */
export interface FoehnAssessment {
  /** Score ≥ Schwellwert ⇒ als Föhn markiert. */
  isFoehn: boolean;
  /** 0..1 — Summe der gewichteten Indikatoren, normiert. */
  score: number;
  /** Kurztexte der erfüllten Indikatoren (für UI-Tooltip). */
  reasons: string[];
}

export interface PointForecast {
  query: {
    lat: number;
    lng: number;
    /** DEM elevation in metres at the query point (0 if DEM unavailable). */
    elevation: number;
    country: 'DE' | 'AT' | 'CH';
  };
  hours: PointForecastHour[];
  /** Wall-clock fetch time. */
  fetchedAt: number;
  /** Estimated lapse rate (°C/m) used for temperature elevation correction. */
  lapseRatePerM: number;
  /** Nearest live stations actually used in the blend (sorted by distance). */
  nearestStations: Array<{
    name?: string;
    source: string;
    distanceMeters: number;
    elevation: number | null;
  }>;
  /** Sources that responded successfully (regardless of weight). */
  sourcesAvailable: string[];
}
