/**
 * Räumlich + höhen-gebändertes Sample-Clustering — geteilt von der Per-Sample-
 * Wetter-Anreicherung ({@link ../pointForecast/weatherEnrichment}) UND dem
 * Wind-Sampler der Tour-Berechnung ({@link ../route/windSampling}). Beide
 * gruppieren die Tour-Samples identisch und fragen pro Cluster an einem realen
 * Repräsentanten-Punkt ab — so liefern timing-wirksamer Wind und angezeigter
 * Per-Sample-Wind denselben Wert (vereinheitlichte Wind-Pfade).
 *
 * In ein eigenes Modul gezogen, um einen Zirkulär-Import zwischen den beiden
 * Verbrauchern zu vermeiden; hängt nur von Geometrie + Länderprofilen ab.
 */

import { haversine } from '../route/routeModel';
import { COUNTRY_PROFILES } from '../countryProfiles';
import type { Country } from '../types';
import type { Terrain } from '../route/tourTrack';

export const DEFAULT_CLUSTER_RADIUS_M = 10_000;     // 10 km — ≈ DWD-Warn-Zelle
/** Höhenband pro Cluster (m): Samples liegen ≤ dieser Spanne auseinander, damit
 *  die Abfragehöhe nahe an jeder Sample-Höhe bleibt. */
export const DEFAULT_ELEV_BAND_M = 300;

/**
 * Cluster-Radius nach Gelände. Alpines Wetter variiert räumlich schnell
 * (konvektiver Regen pro Tal, Föhn-Kanten) → engerer Radius, mehr Abfragen,
 * höhere Auflösung. Flaches Gelände ist glatt → weiterer Radius, weniger Calls.
 */
export function radiusForTerrain(terrain?: Terrain): number {
  switch (terrain) {
    case 'alpin':   return 6_000;
    case 'hügelig': return 10_000;
    case 'flach':   return 14_000;
    default:        return DEFAULT_CLUSTER_RADIUS_M;
  }
}

/** Country-Auswahl heuristisch über Country-Profile-Boxen: die Box, in der der
 *  Punkt am tiefsten innerhalb liegt (max. Abstand zum Rand). */
export function pickCountry(lat: number, lng: number): Country {
  let best: Country = 'DE';
  let bestSlack = -Infinity;
  for (const c of ['DE', 'AT', 'CH'] as Country[]) {
    const b = COUNTRY_PROFILES[c].bounds;
    const slack = Math.min(lat - b.latMin, b.latMax - lat, lng - b.lngMin, b.lngMax - lng);
    if (slack > bestSlack) { bestSlack = slack; best = c; }
  }
  return best;
}

/** Minimaler Geo-Punkt — SampleETA und TourPoint erfüllen ihn strukturell. */
export interface GeoPoint {
  lat: number;
  lon: number;
  ele: number;
}

export interface SampleCluster {
  anchorLat: number;
  anchorLon: number;
  /** Höhe des Anchor-Samples (m) — Referenz für die Höhen-Bänderung. NaN möglich. */
  refEleM: number;
  sampleIndices: number[];
}

/**
 * Greedy bucketing nach Raum UND Höhe: für jeden Sample suche den nächsten
 * existierenden Cluster, dessen Anchor (a) innerhalb radiusM liegt UND (b)
 * dessen Referenzhöhe ≤ bandM von der Sample-Höhe entfernt ist; sonst neuer
 * Cluster. Die Höhen-Bedingung greift nur, wenn beide Höhen endlich sind und
 * bandM endlich ist — ohne Höhendaten verhält es sich rein räumlich.
 * Deterministisch (Eingabereihenfolge). O(N·K), für N ≤ 300 praktisch O(N).
 */
export function clusterSamples(
  points: ReadonlyArray<GeoPoint>,
  radiusM = DEFAULT_CLUSTER_RADIUS_M,
  bandM = Infinity,
): SampleCluster[] {
  const clusters: SampleCluster[] = [];
  for (let i = 0; i < points.length; i++) {
    const s = points[i];
    let best = -1, bestD = Infinity;
    for (let c = 0; c < clusters.length; c++) {
      const cl = clusters[c];
      const d = haversine(cl.anchorLat, cl.anchorLon, s.lat, s.lon);
      if (d > radiusM) continue;
      if (Number.isFinite(bandM) && Number.isFinite(s.ele) && Number.isFinite(cl.refEleM) &&
          Math.abs(s.ele - cl.refEleM) > bandM) continue;
      if (d < bestD) { bestD = d; best = c; }
    }
    if (best >= 0) {
      clusters[best].sampleIndices.push(i);
    } else {
      clusters.push({ anchorLat: s.lat, anchorLon: s.lon, refEleM: s.ele, sampleIndices: [i] });
    }
  }
  return clusters;
}

/**
 * Expositions-Speed-up des Windes von der Anker-/Abfragehöhe auf die Sample-Höhe
 * (höher/exponierter ⇒ mehr Wind; 0,15 %/m, gekappt auf [0,7; 1,8]). Geteilt von
 * der Per-Sample-Anreicherung UND dem Timing-Wind-Sampler, damit beide Pfade den
 * IDENTISCHEN Wind liefern. Gibt 1 zurück, wenn die Höhen nicht belastbar sind.
 */
export function windElevationFactor(anchorElevM: number | null, sampleElevM: number): number {
  if (anchorElevM == null || !Number.isFinite(anchorElevM) || anchorElevM <= 0 ||
      !Number.isFinite(sampleElevM) || Math.abs(anchorElevM - sampleElevM) <= 1) {
    return 1;
  }
  return Math.max(0.7, Math.min(1.8, 1 - 0.0015 * (anchorElevM - sampleElevM)));
}

/**
 * Index des Repräsentanten-Samples eines Clusters: das reale Sample, dessen Höhe
 * der Cluster-Mittelhöhe am nächsten liegt. Ein echter Routenpunkt mit passender
 * Höhe — vermeidet die Fremd-Höhe, die ein geometrischer Centroid auf steilem
 * Gelände abseits der Route bekäme.
 */
export function clusterRepIndex(sampleIndices: number[], points: ReadonlyArray<GeoPoint>): number {
  let sumEle = 0, nEle = 0;
  for (const i of sampleIndices) {
    if (Number.isFinite(points[i].ele)) { sumEle += points[i].ele; nEle++; }
  }
  let repIdx = sampleIndices[0];
  if (nEle) {
    const meanEle = sumEle / nEle;
    let bestD = Infinity;
    for (const i of sampleIndices) {
      if (!Number.isFinite(points[i].ele)) continue;
      const d = Math.abs(points[i].ele - meanEle);
      if (d < bestD) { bestD = d; repIdx = i; }
    }
  }
  return repIdx;
}
