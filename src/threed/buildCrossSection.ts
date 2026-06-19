/**
 * 3D-Wetter · Daten-Builder (US-A2/A3, async).
 *
 * `prepareCrossSection` holt EINMAL die teuren Daten:
 *  • DEM-Geländeprofil entlang der Schnittlinie (`loadElevationLookup`, feiner
 *    Zoom) — dieselbe Höhenquelle wie der Rest der App.
 *  • Oberflächen-Wetter an wenigen Ankerpunkten über die Zeit
 *    (`getPointForecast` — Multi-Quellen-Blend wie überall in der App).
 *
 * `sectionAtTime` rechnet daraus synchron den Vertikalschnitt für einen
 * Zeitpunkt — so bleibt der Zeit-Slider (US-A5) flüssig, ohne neu zu laden.
 */

import { loadElevationLookup } from '../fusion/elevation';
import { getPointForecast } from '../pointForecast/pointForecast';
import { pickCountry } from '../pointForecast/clustering';
import { resampleLine, lineBounds, type GeoPoint, type SectionColumn } from './sectionGeometry';
import {
  assembleCrossSection, type AnchorSurface, type CrossSection, type SectionColumnTerrain,
} from './crossSection';

const COLUMNS = 64;
const ANCHORS = 5;            // wenige Ankerpunkte → rate-limitierte Quellen (GeoSphere) schonen
const ANCHOR_CONCURRENCY = 3; // nicht alle gleichzeitig (vermeidet 429-Bursts)
const DEM_ZOOM = 11; // ~76 m/px — fein genug für ein Talschnittprofil
const FORECAST_HOURS = 36;

const MS_PER_S = 3.6; // m/s → km/h

export interface TimeSample {
  tMs: number;
  windKmh: number;
  windDirDeg: number;
  gustKmh: number;
  tempC: number;
  cloudPct: number;
  humidityPct: number;
  cloudLowPct: number;
  cloudMidPct: number;
  cloudHighPct: number;
}

export interface PreparedAnchor {
  distanceM: number;
  lat: number;
  lon: number;
  elevM: number;
  hours: TimeSample[];
}

export interface PreparedSection {
  columns: SectionColumnTerrain[];
  anchors: PreparedAnchor[];
  /** Verfügbares Zeitfenster (ms). */
  startMs: number;
  endMs: number;
  /** Jüngster Modelllauf-/Abrufzeitpunkt (ms) — Aktualität (US-N6). */
  runAtMs: number;
  points: GeoPoint[];
}

/** Lineare Interpolation der Stunden-Serie eines Ankers auf einen Zeitpunkt. */
export function sampleAnchorAt(anchor: PreparedAnchor, tMs: number): AnchorSurface {
  const h = anchor.hours;
  const base = { distanceM: anchor.distanceM, elevM: anchor.elevM };
  if (!h.length) return { ...base, windKmh: 0, windDirDeg: 0, gustKmh: 0, tempC: 0, cloudPct: 0, humidityPct: 0 };
  if (tMs <= h[0].tMs) return surf(base, h[0]);
  const last = h[h.length - 1];
  if (tMs >= last.tMs) return surf(base, last);
  for (let i = 0; i < h.length - 1; i++) {
    const a = h[i], b = h[i + 1];
    if (tMs >= a.tMs && tMs <= b.tMs) {
      const t = (tMs - a.tMs) / (b.tMs - a.tMs);
      const lerp = (x: number, y: number) => x + (y - x) * t;
      // Wind als Vektor mitteln (Richtungs-Wrap vermeiden).
      const toUV = (s: number, d: number) => ({ u: -s * Math.sin((d * Math.PI) / 180), v: -s * Math.cos((d * Math.PI) / 180) });
      const ua = toUV(a.windKmh, a.windDirDeg), ub = toUV(b.windKmh, b.windDirDeg);
      const u = lerp(ua.u, ub.u), v = lerp(ua.v, ub.v);
      const windKmh = Math.hypot(u, v);
      return {
        ...base, windKmh,
        windDirDeg: ((((Math.atan2(-u, -v) * 180) / Math.PI) % 360) + 360) % 360,
        gustKmh: lerp(a.gustKmh, b.gustKmh),
        tempC: lerp(a.tempC, b.tempC),
        cloudPct: lerp(a.cloudPct, b.cloudPct),
        humidityPct: lerp(a.humidityPct, b.humidityPct),
        cloudLowPct: lerp(a.cloudLowPct, b.cloudLowPct),
        cloudMidPct: lerp(a.cloudMidPct, b.cloudMidPct),
        cloudHighPct: lerp(a.cloudHighPct, b.cloudHighPct),
      };
    }
  }
  return surf(base, last);
}

function surf(base: { distanceM: number; elevM: number }, s: TimeSample): AnchorSurface {
  return {
    ...base, windKmh: s.windKmh, windDirDeg: s.windDirDeg, gustKmh: s.gustKmh, tempC: s.tempC, cloudPct: s.cloudPct, humidityPct: s.humidityPct,
    cloudLowPct: s.cloudLowPct, cloudMidPct: s.cloudMidPct, cloudHighPct: s.cloudHighPct,
  };
}

/** Baut den Schnitt für einen Zeitpunkt (synchron, aus vorbereiteten Daten). */
export function sectionAtTime(prepared: PreparedSection, tMs: number, alpha?: number): CrossSection {
  const anchors: AnchorSurface[] = prepared.anchors.map((a) => sampleAnchorAt(a, tMs)).sort((x, y) => x.distanceM - y.distanceM);
  return assembleCrossSection({ columns: prepared.columns, anchors, alpha });
}

/** Holt Gelände + Anker-Forecasts für die Schnittlinie (einmalig, teuer). */
export interface PrepareProgress { phase: string; done: number; total: number }

export async function prepareCrossSection(
  points: GeoPoint[],
  signal?: AbortSignal,
  onProgress?: (p: PrepareProgress) => void,
): Promise<PreparedSection> {
  if (points.length < 2) throw new Error('Schnittlinie braucht mindestens 2 Punkte.');
  const columns0 = resampleLine(points, COLUMNS);
  const bounds = lineBounds(points, 0.05);

  const total = 1 + ANCHORS; // DEM + Ankerpunkte
  let done = 0;
  onProgress?.({ phase: 'Geländeprofil wird geladen …', done, total });

  // DEM laden + Gelände je Spalte sampeln.
  const elev = await loadElevationLookup(
    { lngMin: bounds.lonMin, lngMax: bounds.lonMax, latMin: bounds.latMin, latMax: bounds.latMax },
    DEM_ZOOM, signal,
  );
  const columns: SectionColumnTerrain[] = columns0.map((c: SectionColumn) => {
    const e = elev.sample(c.lon, c.lat);
    return { ...c, terrainM: Number.isFinite(e) ? Math.max(0, e) : 0 };
  });
  done = 1;
  onProgress?.({ phase: 'Wetterdaten an Ankerpunkten …', done, total });

  // Ankerpunkte gleichmäßig über die Spalten wählen; mit begrenzter Parallelität
  // laden, um rate-limitierte Quellen (GeoSphere AT) nicht zu überlasten.
  const anchorCols = pickAnchorColumns(columns, ANCHORS);
  const forecasts = await mapLimit(anchorCols, ANCHOR_CONCURRENCY, (col) =>
    getPointForecast({ lat: col.lat, lng: col.lon, country: pickCountry(col.lat, col.lon), hours: FORECAST_HOURS, signal })
      .then((fc) => ({ col, fc }))
      .catch(() => null)
      .finally(() => { done++; onProgress?.({ phase: `Wetterdaten ${Math.min(done - 1, ANCHORS)}/${ANCHORS} …`, done, total }); }),
  );

  const anchors: PreparedAnchor[] = [];
  let startMs = Infinity, endMs = -Infinity, runAtMs = 0;
  for (const item of forecasts) {
    if (!item) continue;
    const { col, fc } = item;
    const hours: TimeSample[] = fc.hours.map((hr) => ({
      tMs: hr.timestamp.getTime(),
      windKmh: (hr.windSpeed ?? 0) * MS_PER_S,
      windDirDeg: hr.windDirection ?? 0,
      gustKmh: (hr.gustSpeed ?? hr.windSpeed ?? 0) * MS_PER_S,
      tempC: hr.temperature ?? 0,
      cloudPct: hr.cloudCoverTotal ?? 0,
      humidityPct: hr.relativeHumidity ?? 60,
      cloudLowPct: hr.cloudCoverLow ?? 0,
      cloudMidPct: hr.cloudCoverMid ?? 0,
      cloudHighPct: hr.cloudCoverHigh ?? 0,
    }));
    if (!hours.length) continue;
    anchors.push({ distanceM: col.distanceM, lat: col.lat, lon: col.lon, elevM: fc.query?.elevation ?? col.terrainM, hours });
    startMs = Math.min(startMs, hours[0].tMs);
    endMs = Math.max(endMs, hours[hours.length - 1].tMs);
    runAtMs = Math.max(runAtMs, fc.fetchedAt);
  }
  if (!anchors.length) throw new Error('Keine Wetterdaten für die Schnittlinie verfügbar.');

  return { columns, anchors, startMs, endMs, runAtMs: runAtMs || Date.now(), points };
}

/** map mit begrenzter Parallelität (Reihenfolge des Ergebnisses bleibt erhalten). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let ptr = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (ptr < items.length) {
      const i = ptr++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

function pickAnchorColumns(columns: SectionColumnTerrain[], n: number): SectionColumnTerrain[] {
  if (columns.length <= n) return columns;
  const out: SectionColumnTerrain[] = [];
  for (let i = 0; i < n; i++) out.push(columns[Math.round((i / (n - 1)) * (columns.length - 1))]);
  return out;
}
