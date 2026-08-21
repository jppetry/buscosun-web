/**
 * Radar-Nowcast-Sampler für die Tour-Sample-Pipeline.
 *
 * Lädt **einmal pro Tour** das passende Radar-Produkt (DACH-spezifisch) und
 * exponiert eine reine Lookup-Schnittstelle `sample(lat, lon, etaMs)`, die
 * pro Streckenpunkt die mm/h-Rate für den Sample-Zeitpunkt liefert.
 *
 * Quellen je Land:
 *   – DE: DWD RADOLAN-RV (5-min-Frames, 0–120 min Extrapolation, 1 km)
 *   – AT: GeoSphere INCA (15-min-Frames, 0–180 min Extrapolation, 1 km)
 *   – CH: MeteoSwiss rzc (1 Snapshot, h=0, 5-min-Aktualisierung, 1 km)
 *
 * Ergebnis:
 *   – mm/h, wenn ETA innerhalb des Nowcast-Horizonts UND Position im Quad
 *   – null, sonst (Aufrufer behält dann den NWP-Wert)
 *
 * Räumliches Sampling: inverse bilineare Interpolation der 4 WGS84-
 * Quad-Ecken (siehe quadSampler.ts) — vermeidet drei verschiedene
 * Projektions-Inversionen bei <1 Pixel Fehler.
 */

import { fetchRvNowcast, type RvNowcast } from '../sources/radolan';
import { fetchIncaGrid, type IncaGrid } from '../sources/geosphereIncaGrid';
import { fetchRzcLatest, type RadarFrame } from '../sources/meteoSwissRadar';
import { sampleRadarPoint } from './radarSample';
import type { Country } from '../types';

export interface RadarNowcastSampler {
  /** Niederschlag (mm/h) am Punkt zur ETA; null außerhalb Horizont/Quad. */
  sample(lat: number, lon: number, etaMs: number): number | null;
  /** Beschreibende Meta-Information (für Debug/UI/Status). */
  readonly meta: {
    source: 'radolan_rv' | 'inca_grid' | 'meteoswiss_rzc';
    country: Country;
    frameCount: number;
    /** Erstes/letztes Frame im Stack (validFromMs/validUntilMs sind UTC-ms). */
    validFromMs: number;
    validUntilMs: number;
  };
}

const VMAX = 20;                              // Konvention u8/255·vMax = mm/h
const SLOT_TOLERANCE_MS_DE = 4 * 60_000;      // bis 4 min Versatz zum nächsten Frame
const SLOT_TOLERANCE_MS_AT = 10 * 60_000;     // 15-min-Raster → 10 min OK
const SLOT_TOLERANCE_MS_CH = 5 * 60_000;      // einzelner Snapshot, ±5 min gültig

/**
 * Baut den passenden Sampler für das Land. Liefert `null` bei Fehler oder
 * wenn das Land keinen verwendbaren Nowcast hat (jenseits DACH).
 */
export async function createRadarNowcastSampler(
  country: Country,
  signal?: AbortSignal,
): Promise<RadarNowcastSampler | null> {
  try {
    if (country === 'DE') {
      const rv = await fetchRvNowcast(signal);
      return makeRvSampler(rv);
    }
    if (country === 'AT') {
      const inca = await fetchIncaGrid(signal);
      return makeIncaSampler(inca);
    }
    if (country === 'CH') {
      const rzc = await fetchRzcLatest(signal);
      return makeRzcSampler(rzc);
    }
    return null;
  } catch {
    // Network/decode-Fehler verschluckt: der Aufrufer fällt sauber auf NWP zurück.
    return null;
  }
}

// ---------------------------------------------------------------------------
// DE — RADOLAN-RV (25 Frames, 0–120 min, 5-min-Schritte)
// ---------------------------------------------------------------------------

function makeRvSampler(rv: RvNowcast): RadarNowcastSampler {
  const frames = rv.frames;
  if (frames.length === 0) {
    return emptySampler('radolan_rv', 'DE');
  }
  // Hinweis: der bestehende RV-Decoder setzt `validAt` für alle Frames identisch
  // (gleicher Header-Wert) und liefert die korrekte Vorlaufzeit ausschließlich
  // über `leadMinutes`. Wir leiten den effektiven Frame-Zeitstempel daher hier
  // aus `runAt + leadMinutes` ab.
  const runAtMs = rv.runAt.getTime();
  const stamps = frames.map((f) => runAtMs + f.leadMinutes * 60_000);
  const validFromMs = stamps[0];
  const validUntilMs = stamps[stamps.length - 1];

  return {
    sample(lat, lon, etaMs) {
      let best = -1;
      let bestDelta = Infinity;
      for (let i = 0; i < stamps.length; i++) {
        const d = Math.abs(stamps[i] - etaMs);
        if (d < bestDelta) { bestDelta = d; best = i; }
      }
      if (best < 0 || bestDelta > SLOT_TOLERANCE_MS_DE) return null;
      const f = frames[best];
      return sampleRadarPoint('radolan_rv', f.values, f.width, f.height, rv.corners, lat, lon, VMAX);
    },
    meta: { source: 'radolan_rv', country: 'DE', frameCount: frames.length, validFromMs, validUntilMs },
  };
}

// ---------------------------------------------------------------------------
// AT — GeoSphere INCA-Grid (12 Frames, 0.25–3 h, 15-min-Schritte)
// ---------------------------------------------------------------------------

function makeIncaSampler(grid: IncaGrid): RadarNowcastSampler {
  if (grid.frames.length === 0) return emptySampler('inca_grid', 'AT');

  // INCA-API liefert keine expliziten Lauf-/Validitätszeiten — wir verankern
  // am current minute-floor und addieren leadHours. Bei einem aktuellen Lauf
  // ist die Drift ≤ 5 min (Lauf-Update läuft selbst alle 15 min), was im
  // 15-min-Frame-Raster vernachlässigbar ist.
  const anchor = Date.now() - (Date.now() % 60_000);
  const stamps = grid.frames.map((f) => anchor + f.leadHours * 3_600_000);
  const validFromMs = stamps[0];
  const validUntilMs = stamps[stamps.length - 1];

  return {
    sample(lat, lon, etaMs) {
      let best = -1;
      let bestDelta = Infinity;
      for (let i = 0; i < stamps.length; i++) {
        const d = Math.abs(stamps[i] - etaMs);
        if (d < bestDelta) { bestDelta = d; best = i; }
      }
      if (best < 0 || bestDelta > SLOT_TOLERANCE_MS_AT) return null;
      const f = grid.frames[best];
      return sampleRadarPoint('inca_grid', f.values, f.width, f.height, grid.corners, lat, lon, VMAX);
    },
    meta: { source: 'inca_grid', country: 'AT', frameCount: grid.frames.length, validFromMs, validUntilMs },
  };
}

// ---------------------------------------------------------------------------
// CH — MeteoSwiss rzc (1 Snapshot, h=0 only)
// ---------------------------------------------------------------------------

function makeRzcSampler(rzc: RadarFrame): RadarNowcastSampler {
  const t = rzc.validAt.getTime();
  return {
    sample(lat, lon, etaMs) {
      if (Math.abs(etaMs - t) > SLOT_TOLERANCE_MS_CH) return null;
      return sampleRadarPoint('meteoswiss_rzc', rzc.values, rzc.width, rzc.height, rzc.corners, lat, lon, VMAX);
    },
    meta: { source: 'meteoswiss_rzc', country: 'CH', frameCount: 1, validFromMs: t, validUntilMs: t },
  };
}

// ---------------------------------------------------------------------------

function emptySampler(source: RadarNowcastSampler['meta']['source'], country: Country): RadarNowcastSampler {
  return {
    sample: () => null,
    meta: { source, country, frameCount: 0, validFromMs: 0, validUntilMs: 0 },
  };
}

// ---------------------------------------------------------------------------
// Dev-Hook: Sampler von der Browser-Konsole erreichbar machen.
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __createRadarNowcastSampler: typeof createRadarNowcastSampler })
    .__createRadarNowcastSampler = createRadarNowcastSampler;
}
