/**
 * Positions-bewusster Wind-Sampler für die iterative Tour-Berechnung.
 *
 * Gruppiert die Tour-Samples mit **demselben** räumlich+höhen-gebänderten
 * Clustering wie die Per-Sample-Anreicherung ({@link ../pointForecast/weatherEnrichment})
 * und holt pro Cluster einen Punkt-Forecast am realen Repräsentanten-Punkt.
 * `sample(lat, lon, etaMs)` wählt den nächsten Cluster und interpoliert dessen
 * Stundenreihe zeitlich. Dadurch nutzt der **timing-wirksame** Wind dieselben
 * Abfragepunkte wie der **angezeigte** Per-Sample-Wind — beide Pfade liefern
 * denselben Wert (vereinheitlicht). Der {@link getPointForecast}-Memo-Cache
 * dedupliziert die geteilten Cluster-Abfragen, sodass kein doppelter Netz-
 * verkehr entsteht.
 *
 * Verfügbarkeit ist nicht garantiert (offline, jenseits DACH …) — der Sampler
 * meldet das (null), die Tour-Berechnung degradiert dann sauber (kein Wind).
 */

import { getPointForecast } from '../pointForecast/pointForecast';
import {
  clusterSamples, clusterRepIndex, radiusForTerrain, pickCountry, windElevationFactor,
  DEFAULT_ELEV_BAND_M,
} from '../pointForecast/clustering';
import { COUNTRY_PROFILES } from '../countryProfiles';
import { haversine } from './routeModel';
import type { Country } from '../types';
import type { Terrain, TourTrack } from './tourTrack';

export interface WindAt {
  speedMps: number;
  /** Meteorologische Richtung (Grad), aus der der Wind kommt. */
  dirFromDeg: number;
}

export interface WindSampler {
  /** Dominantes Land (erster Cluster) — nur für die Status-Anzeige. */
  readonly country: Country;
  /** Anzahl Cluster mit nutzbarem Wind. */
  readonly clusterCount: number;
  /** Stützstellen des längsten Cluster-Stundenreihe — für die Status-Anzeige. */
  readonly hourCount: number;
  /** Interpoliert Wind am Ort (lat, lon, Höhe ele) zur Zeit etaMs; null wenn nicht
   *  verfügbar. Die Höhe steuert denselben Expositions-Speed-up wie die Anzeige. */
  sample(lat: number, lon: number, ele: number, etaMs: number): WindAt | null;
}

interface ClusterWind {
  repLat: number;
  repLon: number;
  /** DEM-Abfragehöhe des Clusters (für den Expositions-Speed-up). */
  repElev: number;
  country: Country;
  ts: number[];
  speeds: number[];
  dirs: number[];
}

export async function createWindSampler(
  track: TourTrack,
  opts: { terrain?: Terrain; signal?: AbortSignal } = {},
): Promise<WindSampler | null> {
  const pts = track.samples;
  if (pts.length === 0) return null;

  const radius = radiusForTerrain(opts.terrain ?? track.meta.terrain);
  const clusters = clusterSamples(pts, radius, DEFAULT_ELEV_BAND_M);

  const built: ClusterWind[] = [];
  await Promise.all(clusters.map(async (c) => {
    const rep = pts[clusterRepIndex(c.sampleIndices, pts)];
    const country = pickCountry(rep.lat, rep.lon);
    const hours = COUNTRY_PROFILES[country].forecastHours ?? 24;
    let fc;
    try {
      fc = await getPointForecast({ lat: rep.lat, lng: rep.lon, country, hours, signal: opts.signal });
    } catch {
      return;
    }
    const hourly = fc.hours.filter((h) => h.windSpeed != null && h.windDirection != null);
    if (hourly.length < 2) return;
    built.push({
      repLat: rep.lat, repLon: rep.lon, repElev: fc.query.elevation, country,
      ts: hourly.map((h) => h.timestamp.getTime()),
      speeds: hourly.map((h) => h.windSpeed as number),
      dirs: hourly.map((h) => h.windDirection as number),
    });
  }));
  if (built.length === 0) return null;

  const sample = (lat: number, lon: number, ele: number, etaMs: number): WindAt | null => {
    let best = built[0], bestD = Infinity;
    for (const cw of built) {
      const d = haversine(cw.repLat, cw.repLon, lat, lon);
      if (d < bestD) { bestD = d; best = cw; }
    }
    const w = interpWind(best, etaMs);
    if (!w) return null;
    // Gleicher Expositions-Speed-up wie die Anzeige: Anker = Cluster-Abfragehöhe.
    const f = windElevationFactor(best.repElev, ele);
    return f === 1 ? w : { speedMps: w.speedMps * f, dirFromDeg: w.dirFromDeg };
  };

  return {
    country: built[0].country,
    clusterCount: built.length,
    hourCount: built.reduce((m, cw) => Math.max(m, cw.ts.length), 0),
    sample,
  };
}

/** Zeit-Interpolation der Wind-Stundenreihe eines Clusters (Richtung kürzester Bogen). */
function interpWind(cw: ClusterWind, etaMs: number): WindAt | null {
  const { ts, speeds, dirs } = cw;
  if (etaMs <= ts[0]) return { speedMps: speeds[0], dirFromDeg: dirs[0] };
  const last = ts.length - 1;
  if (etaMs >= ts[last]) return { speedMps: speeds[last], dirFromDeg: dirs[last] };
  for (let i = 1; i <= last; i++) {
    if (etaMs <= ts[i]) {
      const t = (etaMs - ts[i - 1]) / (ts[i] - ts[i - 1]);
      return {
        speedMps: speeds[i - 1] + (speeds[i] - speeds[i - 1]) * t,
        dirFromDeg: lerpAngle(dirs[i - 1], dirs[i], t),
      };
    }
  }
  return null;
}

/** Winkel-Interpolation entlang des kürzeren Bogens (0..360°). */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;
  return ((a + diff * t) % 360 + 360) % 360;
}
