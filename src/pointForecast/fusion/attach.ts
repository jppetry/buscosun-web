/**
 * Adapter between `getPointForecast` and the buscosun Fusion core.
 *
 * Keeps the orchestrator readable: everything buscosun Fusion needs that is not
 * already lying around in `pointForecast.ts` — the multi-scale terrain, the sky
 * view, the hourly climatology, the solar position, the föhn score — is
 * assembled here, once per query, and then handed to `fuseHour` per hour.
 *
 * The climatology is loaded lazily and only when a caller actually asks for
 * distributions: it is a 72-KB static file that most callers (route sampling,
 * 3-D cross sections) have no use for. Without it there are NO distributions.
 * Every fused value converges to the climatological prior, and a prior made of
 * fixed constants (8 °C, 30 % wet days) is not a wider answer but a wrong one —
 * measured: MOSMIX 25 °C in July came out as 18,5 °C at lead 200 h, unmarked
 * (Audit K-3, 2026-09-07). A missing climatology is therefore handled exactly
 * like a missing DEM: `null` for every hour, visibly, and the load is retried
 * on the next query.
 *
 * Headless-checkable via {@link verifyAttach} (takes a synthetic `ClimaField`).
 */

import { ClimaField, type ClimaGrid, type ClimaSample } from '../../ml/climaField';
import { solarPosition, terrainTempDeltaC, type TerrainContext } from '../terrainPhysics';
import { detectFoehn } from '../foehnDetector';
import type { PointForecastHour, PointHourSamples, PointSourceSample } from '../types';
import { fuseHour, hourlyClimaTemp, type ClimaRef, type FusedPoint, type FusionContext } from './fuse';
import { skyViewFactor, terrainScales } from './terrainScale';

/**
 * Module-wide cache of the climatology. A FAILURE is deliberately NOT cached:
 * the fusion converges to the climatology by construction, so a single transient
 * load error would let every later 14-day forecast drift toward the flat
 * fallback for the rest of the session, silently.
 */
let climaPromise: Promise<ClimaField | null> | null = null;
function getClimaField(): Promise<ClimaField | null> {
  if (!climaPromise) {
    climaPromise = ClimaField.load().catch(() => { climaPromise = null; return null; });
  }
  return climaPromise;
}

/** Yield to the event loop every N hours so a 336-hour run is not one long task. */
const YIELD_EVERY = 32;

/** Day of year (1..366) in UTC. */
function doyOf(ms: number): number {
  const d = new Date(ms);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.floor((ms - start) / 86_400_000) + 1;
}

export interface AttachArgs {
  lat: number;
  lng: number;
  elevationM: number;
  lapseRatePerM: number;
  /**
   * Der vollständige Geländekontext aus `terrainPhysics.terrainContext` —
   * inklusive Neigung und Exposition. Wurde hier zunächst genullt, womit die
   * Hang-Einstrahlung (±1,5 K) im Fusionspfad tot war, obwohl der Altpfad sie
   * längst nutzt.
   */
  terrain: TerrainContext;
  /** The DEM sampler `getPointForecast` already resolved. `null` = no usable DEM. */
  demSample: ((lng: number, lat: number) => number) | null;
  /** Per-hour unified sample lists — the same arrays the blender consumes. */
  unified: PointHourSamples[];
  /** The blended hours, used for the föhn score and the micro-climate gates (wind, cloud). */
  blended: PointForecastHour[];
  /**
   * Climatology to use. `undefined` = load `climaGrid.json` (the production
   * path). An explicit field lets a headless verifier run the adapter without
   * the network; `null` = behave as if the load had failed.
   */
  climaField?: ClimaField | null;
  signal?: AbortSignal;
}

/**
 * Compute one `FusedPoint` per hour. Index i of the result belongs to index i
 * of `unified`; the lead time is the index itself, because the unified array is
 * built hour-by-hour from "now".
 */
export async function computeDistributions(args: AttachArgs): Promise<Array<FusedPoint | null>> {
  const { lat, lng, unified, blended, demSample } = args;

  // No DEM ⇒ no representativeness geometry ⇒ no honest distribution. This is
  // NOT hypothetical: `loadTile` swallows every error and yields an empty tile
  // map, so sampling returns NaN and the terrain silently becomes a perfect
  // plain — which makes the distributions both wrong and NARROWER. The sampler
  // is therefore validated by `getPointForecast` before it is handed over.
  if (!demSample) return unified.map(() => null);
  const scales = terrainScales(demSample, lng, lat);
  if (!scales.sampledCount) return unified.map(() => null);
  const skyView = skyViewFactor(scales);

  // No climatology ⇒ no distributions (see the module comment). Same rule as
  // for the DEM: refuse visibly rather than answer with made-up constants.
  const clima = args.climaField === undefined ? await getClimaField() : args.climaField;
  if (!clima) return unified.map(() => null);

  // The climatology depends on the day, not the hour, and one sample scans all
  // ~178 stations. Over 336 hours that would be 60 000 haversine evaluations for
  // at most 15 distinct days.
  const climaByDoy = new Map<number, ClimaSample>();
  const climaFor = (doy: number): ClimaSample => {
    let c = climaByDoy.get(doy);
    if (!c) { c = clima.sample(lat, lng, doy, args.elevationM); climaByDoy.set(doy, c); }
    return c;
  };

  // Climatological reference at ANY time — the target hour uses it, and so does
  // a station measurement that is reused for a later hour (K-1): its anomaly
  // belongs to the measurement time, not to the hour it is attached to.
  const climaAt = (ms: number): ClimaRef | null => {
    const cs = climaFor(doyOf(ms));
    if (!Number.isFinite(cs.tempMean)) return null;
    const d = new Date(ms);
    const localHour = d.getUTCHours() + d.getUTCMinutes() / 60 + lng / 15;   // solar-time proxy
    return {
      tempMeanC: hourlyClimaTemp(cs.tempMean, cs.diurnalAmp, ((localHour % 24) + 24) % 24),
      tempSigmaC: cs.tempStd,
      wetProbDaily: cs.wetProb,
    };
  };

  // Micro-climate offset at any time, UNdamped: the fusion decides per source
  // how much of it to apply (a co-located station already measures it, a 28-km
  // cell does not). That per-source decision is strictly better than the single
  // global attenuation the blender uses. The wind/cloud gates come from the
  // blended hour nearest to the requested time.
  const t0Ms = unified.length ? unified[0].timestamp.getTime() : 0;
  const blendedNear = (ms: number): PointForecastHour | undefined => {
    if (!blended.length) return undefined;
    const i = Math.round((ms - t0Ms) / 3_600_000);
    return blended[Math.max(0, Math.min(blended.length - 1, i))];
  };
  const terrainDeltaAt = (ms: number): number => {
    const b = blendedNear(ms);
    return terrainTempDeltaC({
      ctx: args.terrain,
      lat, lng, etaMs: ms,
      windMs: b?.windSpeed ?? null,
      cloudPct: b?.cloudCoverTotal ?? null,
      anchorAttenuation: 1,
    });
  };

  const out: Array<FusedPoint | null> = [];
  for (let h = 0; h < unified.length; h++) {
    if (h > 0 && h % YIELD_EVERY === 0) {
      if (args.signal?.aborted) return unified.map(() => null);
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    const tsMs = unified[h].timestamp.getTime();
    const solar = solarPosition(lat, lng, tsMs);
    const b = blended[h];

    const foehn = detectFoehn({
      temperatureC: b?.temperature ?? null,
      windSpeedMps: b?.windSpeed ?? null,
      windDirectionDeg: b?.windDirection ?? null,
      relativeHumidityPct: b?.relativeHumidity ?? null,
      gustMps: b?.gustSpeed ?? null,
      lat,
    });

    const ctx: FusionContext = {
      elevationM: args.elevationM,
      lapseRatePerM: args.lapseRatePerM,
      terrain: scales,
      skyView,
      sinkDepthM: args.terrain.sinkDepthM,
      terrainDeltaC: terrainDeltaAt(tsMs),
      solarElevDeg: solar.elevationDeg,
      foehnScore: foehn ? foehn.score : null,
      clima: climaAt(tsMs),
      climaAt,
      terrainDeltaAt,
    };

    out.push(fuseHour(unified[h].samples, h, ctx));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verification — the adapter with a synthetic climatology, no network
// ---------------------------------------------------------------------------

export interface AttachCheck { name: string; ok: boolean; detail?: string }
export interface AttachVerifyResult { checks: AttachCheck[]; passed: number; failed: number }

function blankHour(timestamp: Date): PointForecastHour {
  return {
    timestamp,
    temperature: null, windSpeed: null, windDirection: null, gustSpeed: null,
    relativeHumidity: null, apparentTemperature: null, snowLineM: null,
    cloudCoverTotal: null, cloudCoverLow: null, cloudCoverMid: null, cloudCoverHigh: null,
    precipitation: null, uvIndex: null,
    confidence: { temperature: 0, wind: 0, gust: 0, humidity: 0, precipitation: 0, clouds: 0, snowLine: 0, uvIndex: 0 },
    contributingSources: [],
  };
}

export async function verifyAttach(): Promise<AttachVerifyResult> {
  const checks: AttachCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // One station with a diurnal cycle: mean 10 °C, tmin 5 / tmax 15 ⇒ half-amplitude 5 K.
  const grid: ClimaGrid = {
    meta: { source: 'test', region: 'T', years: [2000, 2020], binDeg: 1, K: 0, tau: 1, lapsePerM: 0.0065, stationCount: 1 },
    stations: [{ id: 'A', name: 'A', lat: 48, lon: 11, elev: 300, tc: [10], sc: [4], wc: [0.3], tnc: [5], txc: [15], t50: null, base: 0.3, n: 9999 }],
  };
  const field = new ClimaField(grid);
  const terrain: TerrainContext = { elevationM: 300, sinkDepthM: 0, slopeRad: 0, aspectRad: 0 };
  const demFlat = () => 300;
  const t0 = Date.UTC(2026, 6, 1, 4, 0, 0);       // 04 UTC ≈ 04:44 solar at 11° E — before the morning rise
  const ts = (h: number) => new Date(t0 + h * 3_600_000);
  const base: Omit<PointSourceSample, 'source' | 'family'> = {
    temperature: null, sourceElevation: null, u: null, v: null, gust: null, relativeHumidity: null,
    snowLine: null, cloudLow: null, cloudMid: null, cloudHigh: null, precipitation: null, uvIndex: null, distanceMeters: 0,
  };
  const obs: PointSourceSample = { ...base, source: 'dwd_obs', family: 'obs', temperature: 12, sourceElevation: 300, distanceMeters: 500, validAtMs: t0 };
  const mos = (h: number): PointSourceSample => ({ ...base, source: 'mosmix', family: 'mosmix', temperature: 12 + 2 * h, sourceElevation: 300, distanceMeters: 4_000 });
  const hours = 6;
  const unified: PointHourSamples[] = Array.from({ length: hours }, (_, h) => ({ timestamp: ts(h), samples: [mos(h), obs] }));
  const blended = unified.map((u) => blankHour(u.timestamp));
  const common = { lat: 48, lng: 11, elevationM: 300, lapseRatePerM: 0.0065, terrain, demSample: demFlat, unified, blended };

  // --- K-3: without a climatology the adapter refuses, visibly.
  const none = await computeDistributions({ ...common, climaField: null });
  add('K-3: ohne Klimatologie liefert der Adapter für jede Stunde null', none.length === hours && none.every((x) => x === null));

  // --- with a climatology every hour carries distributions from the grid.
  const withC = await computeDistributions({ ...common, climaField: field });
  add('mit Klimatologie: jede Stunde trägt Verteilungen aus dem Grid',
    withC.length === hours && withC.every((x) => x != null && x.climaSource === 'grid' && x.temperature != null));

  // --- K-1 wiring: the station's valid time reaches the core. Without it the
  //     anomaly is taken against the climatology of the target hour; in the
  //     morning rise that reads the same 12 °C as a SMALLER anomaly and the
  //     fused value comes out colder.
  const unifiedNoTime: PointHourSamples[] = unified.map((u) => ({
    timestamp: u.timestamp,
    samples: u.samples.map((s) => (s.source === 'dwd_obs' ? { ...s, validAtMs: undefined } : s)),
  }));
  const noTime = await computeDistributions({ ...common, unified: unifiedNoTime, climaField: field });
  const muAt = (r: Array<FusedPoint | null>, h: number) => (r[h]!.temperature!.dist as { mu: number }).mu;
  if (withC[3] && noTime[3]) {
    add('K-1 verdrahtet: die Gültigkeitszeit der Station macht h = 3 im Morgenanstieg wärmer',
      muAt(withC, 3) > muAt(noTime, 3) + 0.3, `${muAt(withC, 3).toFixed(2)} vs ${muAt(noTime, 3).toFixed(2)} °C`);
    add('K-1: bei h = 0 (Messzeit = Zielstunde) sind beide identisch',
      Math.abs(muAt(withC, 0) - muAt(noTime, 0)) < 1e-9, `${muAt(withC, 0).toFixed(4)} / ${muAt(noTime, 0).toFixed(4)}`);
  } else {
    add('K-1 verdrahtet (Stunden vorhanden)', false, 'keine Verteilungen');
  }

  // --- the adapter's climatology follows the diurnal cycle — the quantity K-1
  //     depends on. Read off the climatology-only hours of a source-free run.
  {
    const empty: PointHourSamples[] = unified.map((u) => ({ timestamp: u.timestamp, samples: [] }));
    const clim = await computeDistributions({ ...common, unified: empty, climaField: field });
    const r0 = clim[0], r5 = clim[5];
    const ok = r0 != null && r5 != null && r0.temperature != null && r5.temperature != null
      && r0.temperature.climatologyOnly && r5.temperature.climatologyOnly
      && (r5.temperature.dist as { mu: number }).mu > (r0.temperature.dist as { mu: number }).mu + 1;
    add('Klimatologie des Adapters hat einen Tagesgang (h = 5 deutlich wärmer als h = 0 am Morgen)', ok,
      r0?.temperature && r5?.temperature
        ? `${(r0.temperature.dist as { mu: number }).mu.toFixed(2)} → ${(r5.temperature.dist as { mu: number }).mu.toFixed(2)} °C`
        : 'keine Verteilungen');
  }

  // --- DEM missing ⇒ null, unchanged behaviour
  const noDem = await computeDistributions({ ...common, demSample: null, climaField: field });
  add('ohne DEM: jede Stunde null (unverändert)', noDem.every((x) => x === null));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyAttach: typeof verifyAttach }).__verifyAttach = verifyAttach;
}
