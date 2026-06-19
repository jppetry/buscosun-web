/**
 * DWD ICON-EU — Höhenwind (u/v) auf DRUCKFLÄCHEN (850/700/500 hPa …) als
 * reguläres lat-lon-Gitter (~7 km, Europa) für den Wind-Partikel-Layer.
 *
 * Warum ICON-EU und nicht ICON-D2? ICON-D2 liefert u/v auf Druck-/Modellflächen
 * auf opendata.dwd.de NUR als icosahedral-Gitter — unser GRIB2-Decoder kann
 * ausschließlich reguläres lat-lon (GDT 0). ICON-EU dagegen publiziert
 * `regular-lat-lon_pressure-level`-Felder, die unser bestehender Decoder direkt
 * liest. ICON-EU (7 km) deckt DACH vollständig ab; Höhenwind ist großräumig
 * glatt, die gröbere Auflösung fällt visuell kaum ins Gewicht. Surface-Wind
 * bleibt das native ICON-D2-2,2-km-Gitter (iconD2WindSource).
 *
 * Dateischema (verifiziert auf opendata.dwd.de):
 *   weather/nwp/icon-eu/grib/<HH>/<u|v>/
 *     icon-eu_europe_regular-lat-lon_pressure-level_<YYYYMMDDHH>_<SSS>_<LEVEL>_<U|V>.grib2.bz2
 *   Druckflächen u. a.: 1000,950,925,900,875,850,825,800,775,700,600,500,400,300,250,200,150,100,70,50 hPa.
 *   CC BY 4.0, kein API-Key. Lauf alle 3 h.
 */

import { fetchDecodeCached, gribCorners, type GribField } from '../sources/iconD2Precip';
import { buildWindFrame, type IconD2Wind, type IconD2WindFrame } from './iconD2WindSource';

export const ICON_EU_PRESSURE_ATTRIBUTION =
  'Höhenwind: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-EU</a> · CC BY 4.0';

const EU_BASE = '/_dwd_opendata/weather/nwp/icon-eu/grib';
/** Horizont-Cap (h) — wie Surface bewusst kurz (u+v verdoppeln die Fetch-Last). */
const MAX_STEP = 12;
/** Parallele Fetches (bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 6;

/** Im UI angebotene Druckflächen (≈ Standard-Niveaus). */
export type WindPressureLevel = 850 | 700 | 500;
export const WIND_PRESSURE_LEVELS: readonly WindPressureLevel[] = [850, 700, 500] as const;

function pad2(n: number) { return String(n).padStart(2, '0'); }
function pad3(n: number) { return String(n).padStart(3, '0'); }
function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }

function euUrl(run: string, step: number, level: number, param: 'U' | 'V'): string {
  const hh = run.slice(8, 10);
  const name =
    `icon-eu_europe_regular-lat-lon_pressure-level_${run}_${pad3(step)}_${level}_${param}.grib2.bz2`;
  return `${EU_BASE}/${hh}/${param.toLowerCase()}/${name}`;
}

// ---------------------------------------------------------------------------
// Lauf-Auflösung: leichtgewichtig per HEAD-Probe (das ICON-EU-`/u/`-Listing ist
// ~1,6 MB groß — ein voller Directory-Fetch wäre teuer). Wir probieren „jetzt"
// in 3-h-Schritten rückwärts und nehmen den ersten Lauf, dessen Schritt-0-Datei
// existiert. Modul-Cache (TTL) deckt Refresh-Zyklen / Level-Wechsel ab.
// ---------------------------------------------------------------------------
const RUN_TTL_MS = 3 * 60 * 1000;
let euRunCache: { run: string; runAt: Date; at: number } | null = null;

async function runExists(run: string, level: number, signal?: AbortSignal): Promise<boolean> {
  try {
    const r = await fetch(euUrl(run, 0, level, 'U'), { method: 'HEAD', signal });
    return r.ok;
  } catch {
    return false;
  }
}

async function resolveEuRun(level: number, signal?: AbortSignal): Promise<{ run: string; runAt: Date }> {
  const t = Date.now();
  if (euRunCache && t - euRunCache.at < RUN_TTL_MS) return euRunCache;

  const now = new Date();
  now.setUTCMinutes(0, 0, 0);
  now.setUTCHours(now.getUTCHours() - (now.getUTCHours() % 3));
  for (let back = 0; back < 8; back++) {
    if (signal?.aborted) throw new Error('aborted');
    const cand = new Date(now.getTime() - back * 3 * 3600_000);
    const run =
      `${cand.getUTCFullYear()}${pad2(cand.getUTCMonth() + 1)}${pad2(cand.getUTCDate())}${pad2(cand.getUTCHours())}`;
    if (await runExists(run, level, signal)) {
      euRunCache = { run, runAt: cand, at: Date.now() };
      return euRunCache;
    }
  }
  throw new Error('ICON-EU: kein publizierter Druckflächen-Lauf gefunden');
}

/**
 * Lädt ICON-EU-u/v auf der gewünschten Druckfläche (0–MAX_STEP h) des jüngsten
 * Laufs. Progressiv: `onProgress` feuert pro fertigem Frame. Ergebnis-Shape ist
 * identisch zur Surface-Quelle (IconD2Wind) → der WindLayer/Slider nutzt es ohne
 * Sonderbehandlung; `windFrameInterpolated` interpoliert genauso.
 */
export async function fetchIconEuPressureWind(
  level: WindPressureLevel,
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Wind) => void,
): Promise<IconD2Wind> {
  const { run, runAt } = await resolveEuRun(level, signal);
  const wanted = Array.from({ length: MAX_STEP + 1 }, (_, s) => s);

  const frames: IconD2WindFrame[] = [];
  let uvBounds: [number, number, number, number] | null = null;

  const loadStep = async (step: number): Promise<void> => {
    try {
      const [u, v] = await Promise.all([
        fetchDecodeCached(euUrl(run, step, level, 'U'), signal),
        fetchDecodeCached(euUrl(run, step, level, 'V'), signal),
      ]);
      if (!uvBounds) {
        const c = gribCorners(u);             // [NW, NE, SE, SW] in [lon,lat]
        uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
      }
      const built = buildWindFrame(u as GribField, v as GribField);
      frames.push({ validAt: new Date(runAt.getTime() + step * 3600_000), stepHours: step, ...built });
      frames.sort((a, b) => a.stepHours - b.stepHours);
      if (onProgress && uvBounds) onProgress({ runAt, frames: [...frames], uvBounds });
    } catch {
      // Einzelner Schritt fehlt (Lauf partiell / Level fehlt) → überspringen.
    }
  };

  let ptr = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, wanted.length) }, async () => {
    while (ptr < wanted.length) {
      if (signal?.aborted) return;
      await loadStep(wanted[ptr++]);
    }
  });
  await Promise.all(workers);

  if (!uvBounds || frames.length === 0) throw new Error(`ICON-EU Wind ${level} hPa: keine Frames erzeugt`);
  return { runAt, frames, uvBounds };
}
