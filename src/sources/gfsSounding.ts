/**
 * NOAA GFS — Vertikal-Sounding AM PUNKT (FALLBACK/Referenz).
 *
 * HINWEIS: Die Live-Quelle ist seit dem AEC-Decoder (`gribDecode`, bit-genau
 * gegen eccodes verifiziert) `iconEuSounding` (ICON-EU 7 km). Der frühere Grund
 * für GFS — „unser Decoder kann ICON-EU-AEC (DRT 42) nicht" — ist überholt.
 * Dieses Modul bleibt als Fallback/Referenz erhalten: GFS nutzt Complex Packing
 * (DRT 3) via `globe/gfs.ts`, ist global (deckt DACH), Public-Domain, kein
 * Key/Rate-Limit, und braucht je Sounding nur wenige günstige Byte-Range-Reads
 * (statt ~40 voller ICON-EU-Druckflächen-Dateien). Ehrlicher Nachteil: 1°-Gitter
 * (~25 km), gröber als ICON-EU. Gleicher SoundingProfile-Shape wie iconEuSounding.
 *
 * Holt T/RH/U/V auf Standard-Druckflächen + echte Bodenwerte (2 m T/RH, 10 m
 * Wind, Bodendruck), sampelt am Punkt und liefert ein Profil für soundingMath.
 */

import { resolveLatestGfsRun, fetchGfsGrid, sampleGfs, type GfsRun } from '../globe/gfs';

export const GFS_SOUNDING_ATTRIBUTION =
  'Sounding: <a href="https://www.nco.ncep.noaa.gov/pmb/products/gfs/" ' +
  'target="_blank" rel="noopener">NOAA GFS</a> (0,25°→1° Druckflächen) · Public Domain';

/** Druckflächen des Soundings (hPa, hoch→tief). */
export const SOUNDING_LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200] as const;

export interface SoundingLevel {
  pressureHpa: number;
  /** Geometrische Höhe (m ü. NN), hypsometrisch ab Terrain-Anker integriert. */
  heightM: number;
  tempC: number;
  dewC: number;
  /** Wind-Komponenten (m/s). */
  windU: number;
  windV: number;
}

export interface SoundingProfile {
  lat: number;
  lon: number;
  runAt: Date;
  validAt: Date;
  /** Terrain-Höhe am Punkt (m ü. NN), Anker der Höhenintegration. */
  surfaceM: number;
  surfacePressureHpa: number;
  /** Niveaus Boden→oben (Druck absteigend). */
  levels: SoundingLevel[];
}

/** Taupunkt (°C) aus T (°C) und RH (%), Magnus. */
function dewPoint(tC: number, rhPct: number): number {
  const rh = Math.max(1, Math.min(100, rhPct)) / 100;
  const a = 17.62, b = 243.12;
  const gamma = Math.log(rh) + (a * tC) / (b + tC);
  return (b * gamma) / (a - gamma);
}

/** Bodendruck (hPa) aus Höhe (m) — Standardatmosphäre (Fallback). */
export function pressureFromAltitude(altM: number): number {
  return 1013.25 * Math.pow(1 - 2.25577e-5 * altM, 5.25588);
}

/** GFS-Vorlauf (fhour) zur gewünschten Lead-Stunde (1°-Lauf: stündlich bis 120). */
function pickFhour(leadHours: number): number {
  return Math.max(0, Math.min(120, Math.round(leadHours)));
}

interface RawLevel { p: number; tC: number; dewC: number; u: number; v: number }

/**
 * Lädt das Vertikal-Sounding am Punkt für die Lead-Stunde `leadHours` (default 0).
 * `surfaceM` = Terrain-Höhe am Punkt (Höhenanker + Aussortieren unterirdischer
 * Druckflächen); 0, wenn unbekannt.
 */
export async function fetchSoundingAtPoint(
  lat: number, lon: number, surfaceM = 0, leadHours = 0, signal?: AbortSignal,
): Promise<SoundingProfile> {
  const run = await resolveLatestGfsRun(signal);
  const fhour = pickFhour(leadHours);

  // Echte Bodenwerte (besser als barometrische Annahme für den Boden-Parcel).
  let surfacePressureHpa = pressureFromAltitude(surfaceM);
  const surf: RawLevel | null = await (async () => {
    try {
      const [pres, t2, rh2, u10, v10] = await Promise.all([
        fetchGfsGrid(run, fhour, ':PRES:surface:', signal),
        fetchGfsGrid(run, fhour, ':TMP:2 m above ground:', signal),
        fetchGfsGrid(run, fhour, ':RH:2 m above ground:', signal),
        fetchGfsGrid(run, fhour, ':UGRD:10 m above ground:', signal),
        fetchGfsGrid(run, fhour, ':VGRD:10 m above ground:', signal),
      ]);
      const pHpa = sampleGfs(pres, lon, lat) / 100;
      if (Number.isFinite(pHpa) && pHpa > 300) surfacePressureHpa = pHpa;
      const tC = sampleGfs(t2, lon, lat) - 273.15;
      const rh = sampleGfs(rh2, lon, lat);
      if (!Number.isFinite(tC) || !Number.isFinite(rh)) return null;
      return { p: surfacePressureHpa, tC, dewC: dewPoint(tC, rh), u: sampleGfs(u10, lon, lat), v: sampleGfs(v10, lon, lat) };
    } catch { return null; }
  })();

  // Druckflächen oberhalb des Bodens.
  const levels = SOUNDING_LEVELS.filter((p) => p < surfacePressureHpa - 3);
  const raws: RawLevel[] = [];
  const loadLevel = async (p: number): Promise<void> => {
    try {
      const [t, rh, u, v] = await Promise.all([
        fetchGfsGrid(run, fhour, `:TMP:${p} mb:`, signal),
        fetchGfsGrid(run, fhour, `:RH:${p} mb:`, signal),
        fetchGfsGrid(run, fhour, `:UGRD:${p} mb:`, signal),
        fetchGfsGrid(run, fhour, `:VGRD:${p} mb:`, signal),
      ]);
      const tC = sampleGfs(t, lon, lat) - 273.15;
      const rhPct = sampleGfs(rh, lon, lat);
      if (!Number.isFinite(tC) || !Number.isFinite(rhPct)) return;
      raws.push({ p, tC, dewC: dewPoint(tC, rhPct), u: sampleGfs(u, lon, lat), v: sampleGfs(v, lon, lat) });
    } catch { /* Niveau fehlt → überspringen */ }
  };
  // GFS-Range-Fetches sind klein → moderate Parallelität genügt.
  let ptr = 0;
  await Promise.all(Array.from({ length: Math.min(6, levels.length) }, async () => {
    while (ptr < levels.length) { if (signal?.aborted) return; await loadLevel(levels[ptr++]); }
  }));

  const all = (surf ? [surf, ...raws] : raws).sort((a, b) => b.p - a.p);
  if (all.length < 3) throw new Error('GFS Sounding: zu wenige Niveaus');

  // Geometrische Höhe hypsometrisch ab surfaceM (Rd·Tv̄/g · ln(p1/p2)).
  const Rd = 287.05, g = 9.80665;
  const tvK = (tC: number, dewC: number, p: number) => {
    const e = 6.112 * Math.exp((17.62 * dewC) / (243.12 + dewC));
    const w = (0.622 * e) / Math.max(1e-3, p - e);
    return (tC + 273.15) * (1 + 0.61 * w);
  };
  const out: SoundingLevel[] = [];
  let zPrev = surfaceM, pPrev = all[0].p, tvPrev = tvK(all[0].tC, all[0].dewC, all[0].p);
  for (const r of all) {
    const tvCur = tvK(r.tC, r.dewC, r.p);
    const z = zPrev + (Rd * (tvPrev + tvCur) / 2 / g) * Math.log(pPrev / r.p);
    out.push({ pressureHpa: r.p, heightM: z, tempC: r.tC, dewC: Math.min(r.tC, r.dewC), windU: r.u, windV: r.v });
    zPrev = z; pPrev = r.p; tvPrev = tvCur;
  }

  const base = Date.UTC(+run.date.slice(0, 4), +run.date.slice(4, 6) - 1, +run.date.slice(6, 8), +run.hour);
  return {
    lat, lon, runAt: new Date(base), validAt: new Date(base + fhour * 3600_000),
    surfaceM, surfacePressureHpa, levels: out,
  };
}

export type { GfsRun };
