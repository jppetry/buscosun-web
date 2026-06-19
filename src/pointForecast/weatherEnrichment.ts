/**
 * Per-Sample-Wetter-Anreicherung — der Integrations-Schritt, der Tier-A
 * (Punkt-Forecast + Radar-Nowcast + Warnungen) zu einem einzigen Aufruf
 * verheiratet.
 *
 * Pipeline:
 *   1. **Cluster**: Samples gruppieren — räumlich (greedy bucketing, ~10 km
 *      Radius) UND nach Höhenband (~300 m). Ein pointForecast-Call pro Cluster.
 *      Die Höhen-Bänderung ist entscheidend in alpinem Gelände: ein einzelner
 *      Cluster, der 1000 m Höhe überspannt, würde sonst an EINER Höhe abgefragt
 *      und der Rest linear re-lapst — was den echten, höhenaufgelösten Quellen-
 *      Blend von getPointForecast nicht reproduziert (Talwerte liefen so bis zu
 *      4 °C zu kalt). Mit Bändern bleibt die Abfragehöhe nah an den Samples.
 *   2. **Land** pro Cluster bestimmen (Repräsentanten-Punkt → pickCountry).
 *   3. **Vorab-Loader** pro eindeutigem Land:
 *        – `createRadarNowcastSampler(country)`
 *        – `createWarningChecker(country)`
 *   4. **Parallele pointForecast-Calls** mit Semaphore (max 4) pro Cluster.
 *      Pro Cluster: hours so dimensioniert, dass die größte Sample-ETA noch
 *      passt; Horizont-Überschreitung wird per Flag markiert, nicht silently
 *      Null gesetzt.
 *   5. **Per Sample**: Stunden-Bracket im Cluster-Forecast finden + linear
 *      interpolieren (Wind-Dir auf kürzestem Bogen, Precip "hour-bin"-aligned
 *      ohne Lerp). Radar überschreibt precip im Nowcast-Horizont. Warnungen
 *      per check(lat, lon, eta).
 *   6. **Failure-Isolation**: Cluster-Fehler markiert die zugehörigen Samples
 *      mit `validityFlag='fusion_failed'`, die Tour läuft weiter.
 *
 * Output: Samples mit befülltem `weather` plus eine Meta-Statistik der Calls.
 */

import { getPointForecast } from './pointForecast';
import { createRadarNowcastSampler, type RadarNowcastSampler } from './radarNowcast';
import { createWarningChecker, type WarningChecker } from './warningsCrossCheck';
import { classifyPrecipitation, type PrecipitationType } from './precipType';
import { apparentTemperatureC } from './apparentTemperature';
import { uvClearSky } from './uvClearSky';
import { detectFoehn } from './foehnDetector';
import {
  pickCountry, radiusForTerrain, clusterSamples, clusterRepIndex, windElevationFactor,
  DEFAULT_ELEV_BAND_M,
} from './clustering';
import type { Country } from '../types';
import type { Terrain } from '../route/tourTrack';
import type { PointForecast, PointForecastHour, SampleWeather } from './types';
import type { SampleETA } from '../route/tourTiming';

const DEFAULT_CONCURRENCY = 4;
const HOUR_MS = 3_600_000;
/** Standard-Lapse-Rate (°C/m) als Fallback, wenn der Forecast keine liefert. */
const STD_LAPSE_PER_M = 0.0065;

export interface EnrichmentMeta {
  clusterCount: number;
  pointForecastCalls: number;
  pointForecastFailed: number;
  radarOverrides: number;
  warningHits: number;
  beyondHorizonCount: number;
  /** Anzahl Samples, deren Temperatur per Lapse-Rate auf die Sample-Höhe korrigiert wurde. */
  elevationCorrected: number;
  /** Anzahl Samples mit per Klarhimmel-Modell geschätztem UV-Index (AT/CH, DE-Lücken). */
  uvEstimated: number;
  /** Länder, die entlang der Route abgefragt wurden (für Abdeckungs-Hinweise). */
  countries: Country[];
  /**
   * Strukturelle Variablen-Abdeckung — unabhängig vom Fetch-Erfolg. Trennt
   * „Datenlücke" (Quelle ausgefallen) von „im Land gar nicht verfügbar":
   *   – snowLine: nur AROME (AT/CH) liefert eine Schneefallgrenze.
   *   – uvIndex:  nur die DWD-UV-Quelle (DE) liefert einen UV-Index.
   */
  coverage: { snowLine: boolean; uvIndex: boolean };
  elapsedMs: number;
}

export interface EnrichmentOptions {
  signal?: AbortSignal;
  concurrency?: number;
  /** Expliziter Cluster-Radius (m). Hat Vorrang vor `terrain`. */
  clusterRadiusM?: number;
  /** Gelände der Tour — bestimmt den Cluster-Radius, wenn `clusterRadiusM` fehlt. */
  terrain?: Terrain;
}

/** Hauptzugang: nimmt Samples (mit ETA) entgegen, liefert sie mit weather angereichert. */
export async function enrichSampleWeather(
  samples: SampleETA[],
  opts: EnrichmentOptions = {},
): Promise<{ samples: SampleETA[]; meta: EnrichmentMeta }> {
  const t0 = performance.now();
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const radius = opts.clusterRadiusM ?? radiusForTerrain(opts.terrain);

  if (samples.length === 0) {
    return { samples, meta: emptyMeta(0) };
  }

  // 1) Clustern — räumlich UND nach Höhenband.
  const clusters = clusterSamples(samples, radius, DEFAULT_ELEV_BAND_M);

  // 2) Repräsentanten-Punkt + Land + ETA-Range pro Cluster.
  // Wir fragen NICHT am geometrischen Centroid ab (der auf steilem Gelände
  // abseits der Route eine fremde DEM-Höhe bekäme), sondern am REALEN Sample,
  // dessen Höhe der Cluster-Mittelhöhe am nächsten liegt — ein echter Routen-
  // punkt mit passender Höhe. So ist die von getPointForecast intern aus dem
  // DEM bestimmte Abfragehöhe nah an allen Cluster-Samples.
  const clusterMeta = clusters.map((c, idx) => {
    const repIdx = clusterRepIndex(c.sampleIndices, samples);
    const queryLat = samples[repIdx].lat;
    const queryLon = samples[repIdx].lon;
    const country = pickCountry(queryLat, queryLon);
    const maxEta = Math.max(...c.sampleIndices.map((i) => samples[i].etaMs));
    return { id: idx, country, maxEta, queryLat, queryLon, sampleIndices: c.sampleIndices };
  });

  // 3) Sampler/Checker pro Land vorab (parallel).
  const countries = Array.from(new Set(clusterMeta.map((c) => c.country)));
  const radarByCountry = new Map<Country, RadarNowcastSampler | null>();
  const warnByCountry = new Map<Country, WarningChecker>();
  await Promise.all(countries.map(async (c) => {
    const [radar] = await Promise.all([
      createRadarNowcastSampler(c, opts.signal).catch(() => null),
    ]);
    radarByCountry.set(c, radar);
    warnByCountry.set(c, createWarningChecker(c, opts.signal));
  }));

  // 4) pointForecast pro Cluster mit Bounded Concurrency.
  let pfCalls = 0;
  let pfFailed = 0;
  let beyondHorizon = 0;
  const forecasts = new Array<PointForecast | null>(clusterMeta.length);
  const horizonHrs = new Array<number>(clusterMeta.length);

  await runBounded(concurrency, clusterMeta, async (c, i) => {
    const now = Date.now();
    const neededHours = Math.max(1, Math.ceil((c.maxEta - now) / HOUR_MS) + 2);
    horizonHrs[i] = neededHours;
    pfCalls++;
    try {
      forecasts[i] = await getPointForecast({
        lat: c.queryLat, lng: c.queryLon, country: c.country,
        hours: neededHours, signal: opts.signal,
      });
    } catch {
      pfFailed++;
      forecasts[i] = null;
    }
  });

  // 5) Pro Sample: Interpolation + Höhenkorrektur + Radar-Override + Warnungen.
  let radarOverrides = 0;
  let warningHits = 0;
  let elevationCorrected = 0;
  let uvEstimated = 0;
  const out: SampleETA[] = samples.map((s) => ({ ...s }));

  await Promise.all(clusterMeta.map(async (c, cIdx) => {
    const pf = forecasts[cIdx];
    const radar = radarByCountry.get(c.country) ?? null;
    const warner = warnByCountry.get(c.country)!;

    for (const sIdx of c.sampleIndices) {
      const s = out[sIdx];
      const flags: string[] = [];

      // Zeit-Interpolation aus dem pointForecast.
      let interp = pf ? interpolateForecastAt(pf, s.etaMs) : null;
      if (!pf) flags.push('fusion_failed');
      if (pf && !interp) { flags.push('beyond_horizon'); beyondHorizon++; }

      // Radar-Override.
      let precipSource: 'radar' | 'nwp' | null = interp?.precipitationMmH != null ? 'nwp' : null;
      let precipMmH = interp?.precipitationMmH ?? null;
      const radarMmH = radar?.sample(s.lat, s.lon, s.etaMs) ?? null;
      if (radarMmH != null) {
        precipMmH = radarMmH;
        precipSource = 'radar';
        radarOverrides++;
        flags.push('radar_override');
      }

      // Warnungen (Cell-Dedup-Cache macht das hier billig).
      const warnings = await warner.check(s.lat, s.lon, s.etaMs);
      if (warnings.length > 0) warningHits++;

      // Höhenkorrektur: der Cluster-Forecast gilt für die DEM-Höhe des Centroids
      // (pf.query.elevation). Temperatur, gefühlte Temperatur und Niederschlags-
      // art bringen wir auf die echte Sample-Höhe (s.ele) — entscheidend bei
      // Touren, die innerhalb eines 10-km-Clusters vom Tal auf den Grat steigen.
      const corr = correctForElevation(
        interp?.windSpeedMps ?? null,
        interp?.gustMps ?? null,
        interp?.relativeHumidityPct ?? null,
        interp?.temperatureC ?? null,
        precipMmH,
        pf?.query.elevation ?? null,
        s.ele,
        pf?.lapseRatePerM ?? STD_LAPSE_PER_M,
      );
      if (corr.corrected) { elevationCorrected++; flags.push('elevation_corrected'); }

      // UV-Fallback: liegt ein Forecast vor, aber keine gemessene UV-Quelle
      // (AT/CH bzw. DE-Lücken), schätzen wir den UV-Index per Klarhimmel-Modell
      // (Sonnenstand + Höhe + Bewölkungsdämpfung).
      const uvIndex = interp
        ? (interp.uvIndex ?? uvClearSky(s.lat, s.lon, s.etaMs, s.ele, interp.cloudCoverPct ?? null))
        : null;
      if (interp && interp.uvIndex == null && uvIndex != null && uvIndex > 0) {
        uvEstimated++;
        flags.push('uv_estimated');
      }

      if (flags.length === 0) flags.push('ok');

      const baseConf = interp?.confidence ?? {
        temperature: 0, wind: 0, gust: 0, humidity: 0, precipitation: 0, clouds: 0, snowLine: 0, uvIndex: 0,
      };

      const weather: SampleWeather = {
        temperatureC: corr.temperatureC,
        apparentTempC: corr.apparentTempC,
        windSpeedMps: corr.windSpeedMps,
        windDirectionDeg: interp?.windDirectionDeg ?? null,
        gustMps: corr.gustMps,
        relativeHumidityPct: interp?.relativeHumidityPct ?? null,
        cloudCoverPct: interp?.cloudCoverPct ?? null,
        uvIndex,
        precipitationMmH: precipMmH,
        precipitationSource: precipSource,
        // Phase schneefallgrenzen-bewusst (konsistent mit snowLineM): liegt eine
        // Schneefallgrenze vor, entscheidet die Sample-Höhe relativ zu ihr; sonst
        // greift die T-Heuristik (auf der höhenkorrigierten Temperatur).
        precipitationType: classifyPrecipitation(corr.temperatureC, precipMmH, {
          sampleElevM: s.ele,
          snowLineM: interp?.snowLineM ?? null,
        }),
        // Schneefallgrenze ist eine absolute Höhe (m ü. M.) und gilt clusterweit —
        // sie wird NICHT pro Sample höhenkorrigiert; die Sample-Höhe vergleicht
        // die UI direkt mit diesem Wert.
        snowLineM: interp?.snowLineM ?? null,
        foehn: detectFoehn({
          temperatureC: corr.temperatureC,
          windSpeedMps: corr.windSpeedMps,
          windDirectionDeg: interp?.windDirectionDeg ?? null,
          gustMps: corr.gustMps,
          relativeHumidityPct: interp?.relativeHumidityPct ?? null,
          lat: s.lat,
        }),
        warnings,
        // Lapse-Extrapolation erhöht die T-Unsicherheit: Konfidenz mit dem
        // Höhen-Abstand abschlagen (Boden 0,5), übrige Variablen unverändert.
        confidence: {
          ...baseConf,
          temperature: elevationTempConfidence(baseConf.temperature, corr.dhM),
        },
        cellId: cIdx,
        sourcesUsed: pf?.sourcesAvailable ?? [],
        isInterpolated: interp?.isInterpolated ?? false,
        validityFlags: flags,
      };
      s.weather = weather;
    }
  }));

  return {
    samples: out,
    meta: {
      clusterCount: clusters.length,
      pointForecastCalls: pfCalls,
      pointForecastFailed: pfFailed,
      radarOverrides,
      warningHits,
      beyondHorizonCount: beyondHorizon,
      elevationCorrected,
      uvEstimated,
      countries,
      coverage: {
        snowLine: countries.some((c) => c === 'AT' || c === 'CH'),
        uvIndex: countries.includes('DE'),
      },
      elapsedMs: Math.round(performance.now() - t0),
    },
  };
}

// ---------------------------------------------------------------------------
// Zeit-Interpolation
// ---------------------------------------------------------------------------

interface InterpolatedHour {
  temperatureC: number | null;
  apparentTempC: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;
  gustMps: number | null;
  relativeHumidityPct: number | null;
  cloudCoverPct: number | null;
  uvIndex: number | null;
  precipitationMmH: number | null;
  snowLineM: number | null;
  confidence: PointForecastHour['confidence'];
  isInterpolated: boolean;
}

/**
 * Linear-interpoliert die skalare Wetter-Stundenreihe auf einen Sample-ETA-
 * Zeitpunkt. Wind-Richtung läuft auf dem kürzeren Bogen, Niederschlag wird
 * als „in der Stunde des etaMs gültige Rate" übernommen (kein Lerp, weil
 * Stunden-mm/h bereits ein Mittel über die Stunde ist).
 * Liefert null wenn etaMs außerhalb des Forecast-Horizonts.
 */
export function interpolateForecastAt(pf: PointForecast, etaMs: number): InterpolatedHour | null {
  const hrs = pf.hours;
  if (hrs.length === 0) return null;
  const t0 = hrs[0].timestamp.getTime();
  const tN = hrs[hrs.length - 1].timestamp.getTime();
  // 30 min Toleranz an den Rändern.
  if (etaMs < t0 - 30 * 60_000 || etaMs > tN + 30 * 60_000) return null;

  // Bracket suchen.
  let i = 0;
  while (i < hrs.length - 1 && hrs[i + 1].timestamp.getTime() <= etaMs) i++;
  const lo = hrs[i];
  const hi = hrs[Math.min(i + 1, hrs.length - 1)] ?? lo;
  const tLo = lo.timestamp.getTime();
  const tHi = hi.timestamp.getTime();
  const f = tHi > tLo ? (etaMs - tLo) / (tHi - tLo) : 0;
  const clampedF = Math.max(0, Math.min(1, f));
  const isInterp = clampedF > 0.01 && clampedF < 0.99 && hi !== lo;

  return {
    temperatureC: lerp(lo.temperature, hi.temperature, clampedF),
    apparentTempC: lerp(lo.apparentTemperature, hi.apparentTemperature, clampedF),
    windSpeedMps: lerp(lo.windSpeed, hi.windSpeed, clampedF),
    windDirectionDeg: lerpAngle(lo.windDirection, hi.windDirection, clampedF),
    gustMps: lerp(lo.gustSpeed, hi.gustSpeed, clampedF),
    relativeHumidityPct: lerp(lo.relativeHumidity, hi.relativeHumidity, clampedF),
    cloudCoverPct: lerp(lo.cloudCoverTotal, hi.cloudCoverTotal, clampedF),
    // UV ist über den Tag glatt → lineare Interpolation ist sinnvoll.
    uvIndex: lerp(lo.uvIndex, hi.uvIndex, clampedF),
    // Precip: keine Interpolation. Niederschlag ist previous-hour-Akkumulation
    // (AROME rr_acc-Differenz, MOSMIX „letzte 60 min") — der Wert mit Stempel T
    // deckt das Intervall (T−1h, T] ab. Die Stunde, die die ETA enthält, endet
    // daher an der nächsten Stunde ≥ ETA = `hi`. Nur wenn die ETA exakt auf bzw.
    // (in der Randtoleranz) vor `lo` liegt, ist `lo` die enthaltende Stunde.
    precipitationMmH: (etaMs <= tLo ? lo : hi).precipitation ?? null,
    snowLineM: lerp(lo.snowLineM, hi.snowLineM, clampedF),
    confidence: lo.confidence,
    isInterpolated: isInterp,
  };
}

function lerp(a: number | null, b: number | null, f: number): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  return a + (b - a) * f;
}
function lerpAngle(a: number | null, b: number | null, f: number): number | null {
  if (a == null) return b ?? null;
  if (b == null) return a;
  let diff = b - a;
  if (diff > 180) diff -= 360;
  else if (diff < -180) diff += 360;
  return ((a + diff * f) % 360 + 360) % 360;
}

// ---------------------------------------------------------------------------
// Höhenkorrektur (per-Sample)
// ---------------------------------------------------------------------------

export interface ElevationCorrected {
  temperatureC: number | null;
  apparentTempC: number | null;
  precipitationType: PrecipitationType;
  /** Wind auf die Sample-Höhe expositions-korrigiert (m/s). */
  windSpeedMps: number | null;
  /** Böen mit demselben Faktor skaliert (m/s). */
  gustMps: number | null;
  /** Angewandter Wind-Speed-up-Faktor (1 = unverändert, >1 = höher/exponierter). */
  windFactor: number;
  /** Angewandter Höhen-Abstand Anchor → Sample (m); 0, wenn nicht korrigiert. */
  dhM: number;
  /** Wurde tatsächlich korrigiert? */
  corrected: boolean;
}

/**
 * Bringt die am Cluster-Repräsentanten berechneten Werte auf die Sample-Höhe.
 *
 * Der Forecast gilt für `anchorElevM` (DEM-Höhe des Abfragepunkts). Korrigiert
 * werden:
 *   • Temperatur — folgt der Lapse-Rate auf `sampleElevM` (Konvention wie im
 *     Blend: T(ziel) = T(quelle) + (elev_quelle − elev_ziel) · lapse).
 *   • Wind + Böen — Expositions-Speed-up: höher gelegene/exponiertere Samples
 *     bekommen mehr Wind. Spiegelt den Stations-Speed-up im Blend (0,15 %/m,
 *     gekappt auf [0,7; 1,8]). Mit der Höhen-Bänderung der Cluster bleibt der
 *     Faktor klein (≤ ~±45 % je Band) — ein Konsistenz-Feinschliff, kein Sprung.
 *   • Gefühlte Temperatur + Niederschlagsart — aus den korrigierten Werten neu
 *     abgeleitet (gefühlte Temp nutzt den korrigierten Wind; Phasen-Wechsel
 *     Regen↔Schnee folgt der korrigierten Temperatur).
 *
 * Korrigiert wird nur bei belastbaren Höhen (anchor > 0, sample endlich,
 * Abstand > 1 m); andernfalls bleiben die Werte unverändert. Ein anchorElev von
 * 0 signalisiert einen DEM-Ausfall und wird übersprungen.
 */
export function correctForElevation(
  windSpeedMps: number | null,
  gustMps: number | null,
  relHumidityPct: number | null,
  baseTempC: number | null,
  precipMmH: number | null,
  anchorElevM: number | null,
  sampleElevM: number,
  lapseRatePerM: number,
): ElevationCorrected {
  // Höhen-Daten brauchbar? (unabhängig davon, ob ein Temperaturwert vorliegt).
  const elevOk =
    Number.isFinite(sampleElevM) &&
    anchorElevM != null && Number.isFinite(anchorElevM) && anchorElevM > 0 &&
    Math.abs(anchorElevM - sampleElevM) > 1;

  const dh = elevOk ? (anchorElevM as number) - sampleElevM : 0;   // anchor − sample
  const tempC = (elevOk && baseTempC != null && Number.isFinite(baseTempC))
    ? baseTempC + dh * lapseRatePerM
    : (baseTempC ?? null);

  // Wind-Speed-up (geteilt mit dem Timing-Wind-Sampler → identische Werte).
  const windFactor = windElevationFactor(anchorElevM, sampleElevM);
  const windOut = windSpeedMps != null ? windSpeedMps * windFactor : null;
  const gustOut = gustMps != null ? gustMps * windFactor : null;

  return {
    temperatureC: tempC,
    apparentTempC: apparentTemperatureC(tempC, windOut, relHumidityPct),
    precipitationType: classifyPrecipitation(tempC, precipMmH),
    windSpeedMps: windOut,
    gustMps: gustOut,
    windFactor,
    dhM: dh,
    corrected: elevOk,
  };
}

/** Temp-Konfidenz mit dem Höhen-Abstand abschlagen: lineare Abnahme bis Boden 0,5
 *  bei 1500 m Extrapolation (jenseits davon konstant). */
export function elevationTempConfidence(base: number, dhM: number): number {
  const factor = Math.max(0.5, 1 - Math.abs(dhM) / 3000);
  return base * factor;
}

// ---------------------------------------------------------------------------
// Bounded Concurrency
// ---------------------------------------------------------------------------

async function runBounded<T>(
  limit: number, items: T[],
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
}

function emptyMeta(elapsedMs: number): EnrichmentMeta {
  return {
    clusterCount: 0, pointForecastCalls: 0, pointForecastFailed: 0,
    radarOverrides: 0, warningHits: 0, beyondHorizonCount: 0,
    elevationCorrected: 0, uvEstimated: 0, countries: [], coverage: { snowLine: false, uvIndex: false },
    elapsedMs,
  };
}

// ---------------------------------------------------------------------------
// Verifikation der Höhenkorrektur — exakte, kalkulierbare Erwartungswerte.
// ---------------------------------------------------------------------------
export interface ElevCheck { name: string; expected: unknown; got: unknown; ok: boolean }
export interface ElevVerifyResult { checks: ElevCheck[]; passed: number; failed: number }

export function verifyElevationCorrection(): ElevVerifyResult {
  const checks: ElevCheck[] = [];
  const approx = (a: number | null, b: number) => a != null && Math.abs(a - b) < 1e-6;
  const push = (name: string, expected: unknown, got: unknown, ok: boolean) =>
    checks.push({ name, expected, got, ok });

  // Signatur: (wind, gust, relHum, baseTemp, precip, anchorElev, sampleElev, lapse).
  // Sample 1000 m HÖHER als Anchor (500 → 1500 m), 10 °C, Lapse 0,0065.
  // dh = 500 − 1500 = −1000 → T = 10 + (−1000)·0,0065 = 3,5 °C.
  let c = correctForElevation(2, 4, 60, 10, 0, 500, 1500, 0.0065);
  push('Aufstieg 1000 m: 10 °C → 3,5 °C', 3.5, c.temperatureC, approx(c.temperatureC, 3.5));
  push('Aufstieg: corrected=true', true, c.corrected, c.corrected === true);
  push('Aufstieg: dhM = −1000', -1000, c.dhM, c.dhM === -1000);

  // Phasen-Flip: Anchor 500 m, 4 °C (Regen) → Sample 1500 m, T = −2,5 °C → Schnee.
  c = correctForElevation(2, 4, 80, 4, 1.0, 500, 1500, 0.0065);
  push('Phasen-Flip Regen→Schnee', 'snow', c.precipitationType, c.precipitationType === 'snow');

  // Sample TIEFER als Anchor (1500 → 500 m), −2 °C → T = 4,5 °C → Regen.
  c = correctForElevation(2, 4, 80, -2, 1.0, 1500, 500, 0.0065);
  push('Abstieg 1000 m: −2 °C → 4,5 °C', 4.5, c.temperatureC, approx(c.temperatureC, 4.5));
  push('Abstieg: Schnee→Regen', 'rain', c.precipitationType, c.precipitationType === 'rain');

  // --- Wind-/Böen-Expositions-Speed-up ---
  // Sample +300 m (anchor 500 → 800): Faktor 1 − 0,0015·(−300) = 1,45.
  c = correctForElevation(2, 4, 60, 10, 0, 500, 800, 0.0065);
  push('windFactor +300 m = 1,45', 1.45, c.windFactor, approx(c.windFactor, 1.45));
  push('Wind +300 m: 2 → 2,9 m/s', 2.9, c.windSpeedMps, approx(c.windSpeedMps, 2.9));
  push('Böen mit gleichem Faktor: 4 → 5,8 m/s', 5.8, c.gustMps, approx(c.gustMps, 5.8));
  // Sample −1000 m: Faktor 1 − 1,5 = −0,5 → unten auf 0,7 gekappt.
  c = correctForElevation(3, 6, 60, 10, 0, 1500, 500, 0.0065);
  push('windFactor unten auf 0,7 gekappt', 0.7, c.windFactor, approx(c.windFactor, 0.7));
  push('Wind 3 → 2,1 m/s (gekappt)', 2.1, c.windSpeedMps, approx(c.windSpeedMps, 2.1));
  // Kein Windwert → null (kein Speed-up auf null).
  c = correctForElevation(null, null, 60, 10, 0, 500, 800, 0.0065);
  push('Wind null → null', null, c.windSpeedMps, c.windSpeedMps === null);

  // Keine Sample-Höhe (NaN) → unverändert, nicht korrigiert.
  c = correctForElevation(2, 4, 60, 10, 0, 500, NaN, 0.0065);
  push('NaN-Höhe → unverändert', 10, c.temperatureC, c.temperatureC === 10);
  push('NaN-Höhe → corrected=false', false, c.corrected, c.corrected === false);
  push('NaN-Höhe → windFactor = 1', 1, c.windFactor, c.windFactor === 1);

  // DEM-Ausfall (anchorElev = 0) → keine Korrektur gegen Schein-Höhe.
  c = correctForElevation(2, 4, 60, 10, 0, 0, 1500, 0.0065);
  push('Anchor 0 m (DEM-Ausfall) → unverändert', 10, c.temperatureC, c.temperatureC === 10);

  // Konfidenz-Abschlag: 1000 m → Faktor 1 − 1000/3000 = 0,6667.
  const conf = elevationTempConfidence(0.9, -1000);
  push('Konfidenz-Abschlag 1000 m', 0.6, conf, Math.abs(conf - 0.9 * (1 - 1000 / 3000)) < 1e-9);
  // Boden 0,5 bei großer Extrapolation (2000 m).
  push('Konfidenz-Boden 0,5', 0.5, elevationTempConfidence(1, -2000), Math.abs(elevationTempConfidence(1, -2000) - 0.5) < 1e-9);

  return {
    checks,
    passed: checks.filter((c) => c.ok).length,
    failed: checks.filter((c) => !c.ok).length,
  };
}

/** Deterministische Checks für das räumlich+höhen-gebänderte Clustering. */
export function verifyClustering(): ElevVerifyResult {
  const checks: ElevCheck[] = [];
  const push = (name: string, expected: unknown, got: unknown, ok: boolean) =>
    checks.push({ name, expected, got, ok });
  const S = (lat: number, lon: number, ele: number): SampleETA =>
    ({ index: 0, dist: 0, lat, lon, ele, etaMs: 0, arrivalOffsetMin: 0, segmentSpeedKmh: 0 });

  // Gleicher Ort, Höhen 0 / 350 / 700 m.
  const spot = [S(47, 11, 0), S(47, 11, 350), S(47, 11, 700)];
  let n = clusterSamples(spot, 10_000, 300).length;
  push('Band 300 m, gleicher Ort → 3 Cluster', 3, n, n === 3);
  n = clusterSamples(spot, 10_000, Infinity).length;
  push('Band ∞ → 1 Cluster (rein räumlich, Alt-Verhalten)', 1, n, n === 1);

  // Innerhalb eines Bands (0 / 250 m bei Band 300) → 1 Cluster.
  n = clusterSamples([S(47, 11, 0), S(47, 11, 250)], 10_000, 300).length;
  push('Höhen innerhalb des Bands → 1 Cluster', 1, n, n === 1);

  // Ohne Höhe (NaN) → Bänderung inaktiv → 1 Cluster.
  n = clusterSamples([S(47, 11, NaN), S(47, 11, NaN)], 10_000, 300).length;
  push('NaN-Höhe → Bänderung inaktiv → 1 Cluster', 1, n, n === 1);

  // Räumlich >Radius getrennt (0,3° Länge ≈ 22 km bei 47°N) → 2 Cluster trotz gleicher Höhe.
  n = clusterSamples([S(47, 11, 500), S(47, 11.3, 500)], 10_000, 300).length;
  push('>Radius entfernt → 2 Cluster', 2, n, n === 2);

  // Terrain-abhängiger Radius: alpin enger, flach weiter.
  push('Radius alpin = 6 km', 6_000, radiusForTerrain('alpin'), radiusForTerrain('alpin') === 6_000);
  push('Radius hügelig = 10 km', 10_000, radiusForTerrain('hügelig'), radiusForTerrain('hügelig') === 10_000);
  push('Radius flach = 14 km', 14_000, radiusForTerrain('flach'), radiusForTerrain('flach') === 14_000);
  push('Radius ohne Terrain = 10 km (Default)', 10_000, radiusForTerrain(undefined), radiusForTerrain(undefined) === 10_000);
  // alpin < flach (engere Cluster im Gebirge).
  push('alpin < flach', true, radiusForTerrain('alpin') < radiusForTerrain('flach'), radiusForTerrain('alpin') < radiusForTerrain('flach'));

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

/** Deterministische Checks der Precip-Stundenwahl (previous-hour-Akkumulation). */
export function verifyPrecipHourSelection(): ElevVerifyResult {
  const checks: ElevCheck[] = [];
  const push = (name: string, expected: unknown, got: unknown, ok: boolean) =>
    checks.push({ name, expected, got, ok });
  const zeroConf = { temperature: 0, wind: 0, gust: 0, humidity: 0, precipitation: 0, clouds: 0, snowLine: 0, uvIndex: 0 };
  const H = (tsMs: number, precip: number): PointForecastHour => ({
    timestamp: new Date(tsMs), temperature: null, windSpeed: null, windDirection: null,
    gustSpeed: null, relativeHumidity: null, apparentTemperature: null, snowLineM: null,
    cloudCoverTotal: null, cloudCoverLow: null, cloudCoverMid: null, cloudCoverHigh: null,
    precipitation: precip, uvIndex: null, confidence: zeroConf, contributingSources: [],
  });
  const base = 1_700_000_000_000;          // fester Anker (kein Date.now nötig)
  const HOUR = 3_600_000;
  const t14 = base, t15 = base + HOUR, t16 = base + 2 * HOUR;
  // Stempel 14:00/15:00/16:00 mit precip 1/2/3; Stempel T deckt (T−1h, T].
  const pf: PointForecast = {
    query: { lat: 47, lng: 11, elevation: 1000, country: 'AT' },
    hours: [H(t14, 1), H(t15, 2), H(t16, 3)],
    fetchedAt: 0, lapseRatePerM: 0.0065, nearestStations: [], sourcesAvailable: [],
  };
  const p = (etaMs: number) => interpolateForecastAt(pf, etaMs)?.precipitationMmH ?? null;
  push('ETA 14:30 → enthaltende Stunde (14,15] = 2', 2, p(t14 + HOUR / 2), p(t14 + HOUR / 2) === 2);
  push('ETA 14:05 → (14,15] = 2 (nicht Vorstunde 1)', 2, p(t14 + 5 * 60_000), p(t14 + 5 * 60_000) === 2);
  push('ETA 15:30 → (15,16] = 3', 3, p(t15 + HOUR / 2), p(t15 + HOUR / 2) === 3);
  push('ETA exakt 15:00 → abgeschlossene Stunde (14,15] = 2', 2, p(t15), p(t15) === 2);
  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __enrichSampleWeather: typeof enrichSampleWeather })
    .__enrichSampleWeather = enrichSampleWeather;
  (window as unknown as { __verifyPrecipHourSelection: typeof verifyPrecipHourSelection })
    .__verifyPrecipHourSelection = verifyPrecipHourSelection;
  (window as unknown as { __verifyClustering: typeof verifyClustering })
    .__verifyClustering = verifyClustering;
  (window as unknown as { __clusterSamples: typeof clusterSamples })
    .__clusterSamples = clusterSamples;
  (window as unknown as { __interpolateForecastAt: typeof interpolateForecastAt })
    .__interpolateForecastAt = interpolateForecastAt;
  (window as unknown as { __verifyElevationCorrection: typeof verifyElevationCorrection })
    .__verifyElevationCorrection = verifyElevationCorrection;
}
