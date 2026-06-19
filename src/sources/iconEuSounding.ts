/**
 * DWD ICON-EU — echtes Vertikal-Sounding AM PUNKT (Skew-T + 3D-Säule, #Profi).
 *
 * Löst die bisherige GFS-Quelle ab: DWD hat die ICON-EU-Druckflächen auf
 * CCSDS-AEC-Packing (GRIB2 DRT 42) umgestellt — unser GRIB2-Decoder
 * (`gribDecode`) dekodiert das jetzt bit-genau (headless gegen eccodes
 * verifiziert, scripts/verify-aec.mjs). Damit gewinnt das Sounding gegenüber
 * GFS Auflösung: ICON-EU 7 km statt GFS ~25 km — relevant für terrain-nahe
 * Inversionen/Talkaltluft/CAPE. `gfsSounding` bleibt als Fallback/Referenz
 * erhalten (gleicher SoundingProfile-Shape).
 *
 * Ehrlicher Preis: ICON-EU publiziert je (Param, Druckfläche, Schritt) EINE
 * eigene bz2-Datei (~1 MB) — ein 10-Niveau-Profil (T/RELHUM/U/V) lädt also
 * ~40 Dateien (~40 MB) und dekodiert 40 Volleuropa-Gitter, um EINEN Punkt zu
 * sampeln. Vertretbar nur, weil das Sounding ein on-demand-Profi-Feature ist
 * (kein Default-Load) und der Decompressed-Cache (Cache API) Wiederholungen /
 * benachbarte Punkte quasi sofort macht. Bewusst kurzer Level-Satz.
 *
 * Holt T/RELHUM/U/V auf Standard-Druckflächen + echte Bodenwerte (2 m T/Td,
 * 10 m Wind, Bodendruck PS), sampelt bilinear am Punkt → Profil für soundingMath.
 */

import { fetchDecodeCached, type GribField } from './iconD2Precip';

export const ICON_EU_SOUNDING_ATTRIBUTION =
  'Sounding: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-EU</a> (Druckflächen, ~7 km) · CC BY 4.0';

const EU_BASE = '/_dwd_opendata/weather/nwp/icon-eu/grib';

/** Druckflächen des Soundings (hPa, hoch→tief). Bewusst kompakt (Fetch-Kosten). */
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

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }

function pressureUrl(run: string, step: number, level: number, param: string): string {
  const hh = run.slice(8, 10);
  const name =
    `icon-eu_europe_regular-lat-lon_pressure-level_${run}_${pad3(step)}_${level}_${param}.grib2.bz2`;
  return `${EU_BASE}/${hh}/${param.toLowerCase()}/${name}`;
}
function singleUrl(run: string, step: number, param: string): string {
  const hh = run.slice(8, 10);
  const name =
    `icon-eu_europe_regular-lat-lon_single-level_${run}_${pad3(step)}_${param}.grib2.bz2`;
  return `${EU_BASE}/${hh}/${param.toLowerCase()}/${name}`;
}

// ---------------------------------------------------------------------------
// Lauf-Auflösung: HEAD-Probe auf eine Druckflächen-Datei (T 500), „jetzt" in
// 3-h-Schritten rückwärts. Modul-Cache (TTL) deckt Refresh-Zyklen ab.
// ---------------------------------------------------------------------------
const RUN_TTL_MS = 3 * 60 * 1000;
let runCache: { run: string; runAt: Date; at: number } | null = null;

async function headOk(url: string, signal?: AbortSignal): Promise<boolean> {
  try { return (await fetch(url, { method: 'HEAD', signal })).ok; } catch { return false; }
}

async function resolveRun(signal?: AbortSignal): Promise<{ run: string; runAt: Date }> {
  const t = Date.now();
  if (runCache && t - runCache.at < RUN_TTL_MS) return runCache;
  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 8; back++) {
    if (signal?.aborted) throw new Error('aborted');
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run =
      `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${pad2(cand.getUTCHours())}`;
    if (await headOk(pressureUrl(run, 0, 500, 'T'), signal)) {
      runCache = { run, runAt: cand, at: Date.now() };
      return runCache;
    }
  }
  throw new Error('ICON-EU Sounding: kein publizierter Druckflächen-Lauf gefunden');
}

/** Bilineares Sampling eines regulären lat-lon-Felds am Punkt. NaN, wenn außerhalb
 *  der Domäne oder Bitmap-maskiert. Berücksichtigt Scanrichtung (ICON-EU: S→N). */
function sampleField(f: GribField, lat: number, lon: number): number {
  const jNorth = (f.scanMode & 64) !== 0;     // j-Richtung positiv = nach Norden
  const lat0 = jNorth ? Math.min(f.lat1, f.lat2) : Math.max(f.lat1, f.lat2);
  const dlat = Math.abs(f.dj), dlon = Math.abs(f.di);
  const lon0 = Math.min(f.lon1, f.lon2);
  let dl = lon - lon0; if (dl < -180) dl += 360; else if (dl > 180) dl -= 360;
  const fi = dl / dlon;
  const fj = jNorth ? (lat - lat0) / dlat : (lat0 - lat) / dlat;
  if (fi < 0 || fi > f.ni - 1 || fj < 0 || fj > f.nj - 1) return NaN;
  const i0 = Math.floor(fi), j0 = Math.floor(fj);
  const i1 = Math.min(i0 + 1, f.ni - 1), j1 = Math.min(j0 + 1, f.nj - 1);
  const ti = fi - i0, tj = fj - j0;
  const v = f.values;
  const a = v[j0 * f.ni + i0], b = v[j0 * f.ni + i1], c = v[j1 * f.ni + i0], d = v[j1 * f.ni + i1];
  // Bei Bitmap-Lücken auf das nächste finite Eck-Sample zurückfallen.
  const corners = [a, b, c, d].filter(Number.isFinite);
  if (corners.length < 4) return corners.length ? corners[0] : NaN;
  return a * (1 - ti) * (1 - tj) + b * ti * (1 - tj) + c * (1 - ti) * tj + d * ti * tj;
}

interface RawLevel { p: number; tC: number; dewC: number; u: number; v: number }

/** Vorlauf-Schritt (h) der ICON-EU-Felder; default „jetzt" = 0. */
function pickStep(leadHours: number): number {
  return Math.max(0, Math.min(48, Math.round(leadHours)));
}

/**
 * Lädt das Vertikal-Sounding am Punkt für die Lead-Stunde `leadHours` (default 0).
 * `surfaceM` = Terrain-Höhe am Punkt (Höhenanker + Aussortieren unterirdischer
 * Druckflächen); 0, wenn unbekannt. Signatur identisch zur GFS-Quelle.
 */
export async function fetchSoundingAtPoint(
  lat: number, lon: number, surfaceM = 0, leadHours = 0, signal?: AbortSignal,
): Promise<SoundingProfile> {
  const { run, runAt } = await resolveRun(signal);
  const step = pickStep(leadHours);

  // Echte Bodenwerte (besser als barometrische Annahme für den Boden-Parcel).
  // ICON-EU liefert Td direkt (TD_2M) → kein Magnus am Boden nötig.
  let surfacePressureHpa = pressureFromAltitude(surfaceM);
  const surf: RawLevel | null = await (async () => {
    try {
      const [t2, td2, u10, v10, ps] = await Promise.all([
        fetchDecodeCached(singleUrl(run, step, 'T_2M'), signal),
        fetchDecodeCached(singleUrl(run, step, 'TD_2M'), signal),
        fetchDecodeCached(singleUrl(run, step, 'U_10M'), signal),
        fetchDecodeCached(singleUrl(run, step, 'V_10M'), signal),
        fetchDecodeCached(singleUrl(run, step, 'PS'), signal),
      ]);
      const pHpa = sampleField(ps, lat, lon) / 100;     // Pa → hPa
      if (Number.isFinite(pHpa) && pHpa > 300) surfacePressureHpa = pHpa;
      const tC = sampleField(t2, lat, lon) - 273.15;
      const tdC = sampleField(td2, lat, lon) - 273.15;
      if (!Number.isFinite(tC) || !Number.isFinite(tdC)) return null;
      return {
        p: surfacePressureHpa, tC, dewC: Math.min(tC, tdC),
        u: sampleField(u10, lat, lon), v: sampleField(v10, lat, lon),
      };
    } catch { return null; }
  })();

  // Druckflächen oberhalb des Bodens.
  const levels = SOUNDING_LEVELS.filter((p) => p < surfacePressureHpa - 3);
  const raws: RawLevel[] = [];
  const loadLevel = async (p: number): Promise<void> => {
    try {
      const [t, rh, u, v] = await Promise.all([
        fetchDecodeCached(pressureUrl(run, step, p, 'T'), signal),
        fetchDecodeCached(pressureUrl(run, step, p, 'RELHUM'), signal),
        fetchDecodeCached(pressureUrl(run, step, p, 'U'), signal),
        fetchDecodeCached(pressureUrl(run, step, p, 'V'), signal),
      ]);
      const tC = sampleField(t, lat, lon) - 273.15;
      const rhPct = sampleField(rh, lat, lon);
      if (!Number.isFinite(tC) || !Number.isFinite(rhPct)) return;
      raws.push({ p, tC, dewC: dewPoint(tC, rhPct), u: sampleField(u, lat, lon), v: sampleField(v, lat, lon) });
    } catch { /* Niveau fehlt → überspringen */ }
  };
  // Bounded-Concurrency-Pump (bz2-Decompress läuft im Worker-Pool).
  let ptr = 0;
  await Promise.all(Array.from({ length: Math.min(6, levels.length) }, async () => {
    while (ptr < levels.length) { if (signal?.aborted) return; await loadLevel(levels[ptr++]); }
  }));

  const all = (surf ? [surf, ...raws] : raws).sort((a, b) => b.p - a.p);
  if (all.length < 3) throw new Error('ICON-EU Sounding: zu wenige Niveaus');

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

  return {
    lat, lon, runAt, validAt: new Date(runAt.getTime() + step * 3600_000),
    surfaceM, surfacePressureHpa, levels: out,
  };
}
