/**
 * Phase NC (`audit/radar-nowcast-dach.md` §6) — the radar sampler of the point series with the derived products: AT from the
 * INCA run refined to 5 min, CH from the analysis plus buscosun's extrapolation — both by VALIDITY time, 5-min spacing like
 * RV. Wraps `createRadarNowcastSampler` (src/pointForecast, untouched): when a product is missing or the switch is off
 * (`?nc=0`), the sampler
 * before Phase NC is returned unchanged. DE never changes here.
 */

import { createRadarNowcastSampler, type RadarNowcastSampler } from '../pointForecast/radarNowcast';
import { sampleRadarPoint } from '../pointForecast/radarSample';
import { fetchIncaGrid } from '../sources/geosphereIncaGrid';
import { fetchRzcLatest, type RadarFrame } from '../sources/meteoSwissRadar';
import { fetchRzcNowcast, fetchInca5m, type RzcNowcast, type Inca5mGrid } from '../sources/radarNowcast';
import { radarImgStamp } from '../sources/radarImg';
import { radarNcFlagFrom } from '../sources/radarNowcastImg';
import type { Country } from '../types';

const VMAX = 20;
/** Half a 5-min step plus a little (the products are on the 5-min raster). */
const SLOT_TOLERANCE_MS_NC = 3 * 60_000;

function byValidity(stamps: number[], etaMs: number, tol: number): number {
  let best = -1, bestDelta = Infinity;
  for (let i = 0; i < stamps.length; i++) { const d = Math.abs(stamps[i] - etaMs); if (d < bestDelta) { bestDelta = d; best = i; } }
  return best >= 0 && bestDelta <= tol ? best : -1;
}

function inca5mSampler(g: Inca5mGrid): RadarNowcastSampler {
  const stamps = g.frames.map((f) => f.validAt.getTime());
  return {
    sample(lat, lon, etaMs) {
      const i = byValidity(stamps, etaMs, SLOT_TOLERANCE_MS_NC);
      if (i < 0) return null;
      const f = g.frames[i];
      return sampleRadarPoint('inca_grid', f.values, f.width, f.height, g.corners, lat, lon, VMAX);
    },
    meta: { source: 'inca_grid', country: 'AT', frameCount: g.frames.length, validFromMs: stamps[0], validUntilMs: stamps[stamps.length - 1] },
  };
}

function rzcNcSampler(rzc: RadarFrame, nc: RzcNowcast): RadarNowcastSampler {
  const frames = [{ values: rzc.values, width: rzc.width, height: rzc.height, validAt: rzc.validAt }, ...nc.frames];
  const stamps = frames.map((f) => f.validAt.getTime());
  return {
    sample(lat, lon, etaMs) {
      const i = byValidity(stamps, etaMs, SLOT_TOLERANCE_MS_NC);
      if (i < 0) return null;
      const f = frames[i];
      return sampleRadarPoint('meteoswiss_rzc', f.values, f.width, f.height, rzc.corners, lat, lon, VMAX);
    },
    meta: { source: 'meteoswiss_rzc', country: 'CH', frameCount: frames.length, validFromMs: stamps[0], validUntilMs: stamps[stamps.length - 1] },
  };
}

/** The sampler of the point series — with the derived products for AT/CH when they are there, else as before Phase NC. */
export async function createRadarNowcastSamplerNc(country: Country, signal?: AbortSignal): Promise<RadarNowcastSampler | null> {
  const ncOn = radarNcFlagFrom(typeof window !== 'undefined' ? window.location.search : '');
  if (ncOn && country === 'AT') {
    try {
      const inca = await fetchIncaGrid(signal);
      const g5 = await fetchInca5m(inca.stamp ?? null, signal);
      if (g5 && g5.frames.length) return inca5mSampler(g5);
    } catch { /* the sampler before Phase NC decides below */ }
  }
  if (ncOn && country === 'CH') {
    try {
      const rzc = await fetchRzcLatest(signal);
      const nc = await fetchRzcNowcast(radarImgStamp(rzc.validAt.getTime()), signal);
      if (nc && nc.frames.length) return rzcNcSampler(rzc, nc);
    } catch { /* the sampler before Phase NC decides below */ }
  }
  return createRadarNowcastSampler(country, signal);
}
