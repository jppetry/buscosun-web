/**
 * GeoSphere Austria — INCA Nowcast als GITTER für den Niederschlags-Layer (AT).
 *
 * INCA ist das offizielle alpine Nowcasting-System: 1 km / 15 min, Horizont
 * 0–3 h, Update alle 15 min. CC BY 4.0, kein API-Key.
 *
 * Quelle (Grid-API, NetCDF):
 *   https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km
 *     ?parameters=rr&output_format=netcdf&bbox=<lat,lon,lat,lon>
 *   - `bbox` ist Pflicht (sonst HTTP 422). Wir verwenden die INCA-Extent knapp
 *     innen (Boundary-Rejection-Quirk wie beim timeseries-Endpoint).
 *   - Antwort = EIN NetCDF-4 (HDF5) mit allen 12 Lead-Frames (+0.25…+3 h).
 *
 * Das Parsen (Format-Eigenheiten, Zellmitten → Außenkanten, Süd→Nord-Flip)
 * steht seit LE2/H3 in `incaParse.ts` und läuft im `hdf5Worker` — gemessen
 * 2,5 s Hauptthread je Abruf (LE0 §2.4), hinter denen jeder fertige
 * Radar-Frame wartete. Rückfall = derselbe Code auf dem Hauptthread.
 */

import type { QuadCorners } from '../scalar/RainLayer';
import { parseIncaOffMain, warmHdf5Worker } from './hdf5OffMain';
import { shareInFlight } from './shareInFlight';
// RD3 (audit/radar-datenrepo.md §14): fertig aufbereitete Frames vom Daten-Repo-CDN
import { radarCdnEnabled, radarCdnUsable, radarImgEnabled, noteRadarCdnFailure, radarCdnDeadline } from './radolanRuns';
import { incaImgDir, parseIncaImgMeta, radarImgStamp, radarImgStampToMs, fetchImgRes, loadRadarGrayPng, RadarImg404 } from './radarImg';

const GRID_URL =
  'https://dataset.api.hub.geosphere.at/v1/grid/forecast/nowcast-v1-15min-1km';
// INCA-Extent [45.503..49.478, 8.098..17.742], ein paar Hundertstel innen.
const BBOX = '45.51,8.11,49.47,17.73';

export interface IncaFrame {
  /** Vorlaufzeit in Stunden (0.25 … 3.0). */
  leadHours: number;
  /** Kompaktes Werte-Grid (1 Byte/Zelle, north-up) für RainLayer.setFrame. */
  values: Uint8Array;
  width: number;
  height: number;
}

export interface IncaGrid {
  frames: IncaFrame[];
  corners: QuadCorners;
  /** V-RL-2: gesetzt, wenn dies der letzte gute Lauf ist, weil der frische
   *  Abruf fehlschlug (Zeitpunkt des guten Abrufs, ms). */
  staleFromMs?: number;
}

/** LE2/H7: Netzpriorität des Abrufs — `'low'` für die Nachbarquelle. */
export interface IncaFetchOptions { priority?: RequestPriority }

export const GEOSPHERE_INCA_ATTRIBUTION =
  'Nowcast: <a href="https://www.geosphere.at" target="_blank" rel="noopener">GeoSphere Austria</a> ' +
  'INCA (RR) · CC BY 4.0';

/**
 * V-RL-2 (2026-08-25): die Grid-API antwortet zeitweise mit HTTP 200 und NULL
 * Lead-Frames (gemessen 2026-08-25 00:20 lokal, „keine Frames"). Der letzte gute
 * Lauf dieser Sitzung wird deshalb vorgehalten und für höchstens
 * `INCA_STALE_MAX_MS` als benannter Rückfall geliefert — laut in der Konsole,
 * mit `staleFromMs` am Ergebnis, damit ein Aufrufer das Alter zeigen kann.
 * Danach fällt die Quelle wie bisher aus (kein stilles Uraltbild).
 */
export const INCA_STALE_MAX_MS = 45 * 60_000;
let lastGood: { grid: IncaGrid; atMs: number } | null = null;

/** Lädt den jüngsten INCA-Nowcast-Lauf und baut Uint8-Werte-Grids (0.25–3 h). */
export async function fetchIncaGrid(signal?: AbortSignal, opts?: IncaFetchOptions): Promise<IncaGrid> {
  // Entdopplung: Karte und Punktforecast fragen beim Mount gleichzeitig, und die
  // GeoSphere-API sendet keinen Cache-Header — gemessen 2 × 721 713 B, also 34 %
  // der gesamten AT-Kaltsitzung (`audit/bandbreite.md` §24.3).
  return shareInFlight('geosphere-inca-grid', async () => {
    try {
      const grid = await loadIncaGrid(opts?.priority);
      lastGood = { grid, atMs: Date.now() };
      return grid;
    } catch (err) {
      const age = lastGood ? Date.now() - lastGood.atMs : Infinity;
      if (lastGood && age <= INCA_STALE_MAX_MS) {
        console.warn(`[buscosun] GeoSphere INCA: ${err instanceof Error ? err.message : err} — letzter guter Lauf dieser Sitzung (${Math.round(age / 60_000)} min alt) wird weiterverwendet`);
        return { ...lastGood.grid, staleFromMs: lastGood.atMs };
      }
      throw err;
    }
  }, signal);
}

/** Leichter GeoSphere-Metadaten-Endpunkt: nennt die Referenzzeit des aktuellen Laufs
 *  (derselbe, den der Spiegel pollt; Rate-Limit 240/h — ein Abruf je Ladevorgang). */
const META_URL = `${GRID_URL}/metadata`;

/**
 * Gate für GERECHNETE Bild-Stempel (RD3c-Nachtrag): der Spiegel pusht einen Lauf
 * 16,7–22,8 min nach seiner Referenzzeit (Telemetrie 2026-09-03) — plus CDN und
 * Reserve. Nur für den Ausfall-Rückfall; im Normalbetrieb kommt der Stempel
 * deterministisch aus `/metadata`, dann gibt es kein 404-Risiko.
 */
export const INCA_IMG_GATE_MS = 28 * 60_000;
const INCA_STEP_MS = 15 * 60_000;

/** Die `count` jüngsten 15-min-Referenzzeiten, die bei `INCA_IMG_GATE_MS` sicher gespiegelt sind. */
export function guessIncaStamps(count: number, nowMs: number = Date.now()): string[] {
  const newest = Math.floor((nowMs - INCA_IMG_GATE_MS) / INCA_STEP_MS) * INCA_STEP_MS;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(radarImgStamp(newest - i * INCA_STEP_MS));
  return out;
}

/**
 * RD3: der aktuelle Lauf als fertige PNGs vom Daten-Repo — deterministisch über die
 * Referenzzeit aus `/metadata` (kein Stempel-Raten: die GeoSphere-reftime hinkt dem
 * Slot ~15–30 min hinterher, gemessen §14.2). Der Spiegel pusht denselben Lauf
 * Sekunden nach dem reftime-Wechsel; nur in diesem kurzen Fenster (und bei
 * Spiegel-Ausfall) antwortet das CDN 404 ⇒ Direkt-API wie bisher — die Frische
 * der App ändert sich NICHT (beide Wege liefern denselben Lauf).
 */
async function loadIncaFromImg(priority?: RequestPriority): Promise<IncaGrid | null> {
  if (!(radarCdnEnabled() && radarCdnUsable() && radarImgEnabled())) return null;
  const dl = radarCdnDeadline(undefined);
  try {
    // Der Stempel kommt von GEOSPHERE, die Bilder vom CDN — zwei Hosts, zwei
    // Fehlerkonten. Das `/metadata` flattert gemessen mit 502/503; solche Fehler
    // dürfen NICHT den geteilten CDN-Sitzungs-Latch belasten (der schaltet sonst
    // auch RV/KONRAD/rzc ab). Deshalb hat der Fremd-Abruf sein eigenes catch.
    let ref = NaN;
    try {
      const mr = await fetch(META_URL, { signal: dl.signal, ...(priority ? { priority } : {}) } as RequestInit);
      if (!mr.ok) return null;
      ref = Date.parse(String((await mr.json() as { last_forecast_reftime?: string }).last_forecast_reftime ?? ''));
    } catch {
      return null;                               // GeoSphere weg ⇒ Direktweg, danach der geratene Bild-Weg
    }
    if (!Number.isFinite(ref)) return null;
    const grid = await loadIncaSlot(radarImgStamp(ref), dl.signal, priority);
    if (grid) console.log(`[buscosun] GeoSphere INCA → Lauf ${radarImgStamp(ref)} · ${grid.frames.length} Frames · Quelle Daten-Repo (PNG)`);
    return grid;
  } catch (err) {
    if (!(err instanceof RadarImg404)) noteRadarCdnFailure();
    return null;
  } finally { dl.done(); }
}

/** EIN Bild-Slot vom CDN — meta.json (Ecken!) + alle darin genannten Frames. */
async function loadIncaSlot(stamp: string, signal: AbortSignal, priority?: RequestPriority): Promise<IncaGrid | null> {
  const dir = incaImgDir(stamp);
  const meta = parseIncaImgMeta(await (await fetchImgRes(`${dir}/meta.json`, signal, priority)).json());
  if (!meta || meta.stamp !== stamp) return null;
  const frames: IncaFrame[] = await Promise.all(meta.frames.map(async (f) => ({
    leadHours: f.lead / 60,
    values: await loadRadarGrayPng(await fetchImgRes(`${dir}/${f.file}`, signal, priority), meta.width, meta.height),
    width: meta.width,
    height: meta.height,
  })));
  return { frames, corners: meta.corners as QuadCorners };
}

/**
 * Ausfall-Rückfall (RD3c-Nachtrag): GeoSphere ist GANZ weg (das `/metadata` flattert
 * gemessen mit 502/503, und dann liefert oft auch das Grid nichts) — dann trägt der
 * Spiegel die Lage noch bis zu 3 h (Retention 12 × 15 min). Stempel gerechnet statt
 * gelesen; NUR gegatterte Slots, damit keine zu frühe Anfrage einen 404 festhält.
 * Läuft ausdrücklich NACH dem Direktweg, damit die Frische nie schlechter wird.
 */
async function loadIncaFromImgGuessed(priority?: RequestPriority): Promise<IncaGrid | null> {
  if (!(radarCdnEnabled() && radarCdnUsable() && radarImgEnabled())) return null;
  for (const stamp of guessIncaStamps(2)) {
    const dl = radarCdnDeadline(undefined);
    try {
      const grid = await loadIncaSlot(stamp, dl.signal, priority);
      if (!grid) continue;
      const alterMin = Math.round((Date.now() - radarImgStampToMs(stamp)) / 60_000);
      console.warn(`[buscosun] GeoSphere INCA nicht erreichbar — Daten-Repo (PNG), Lauf ${stamp} (${alterMin} min alt)`);
      return { ...grid, staleFromMs: radarImgStampToMs(stamp) };
    } catch (err) {
      if (err instanceof RadarImg404) continue;   // Slot nicht gespiegelt ⇒ älterer Kandidat
      noteRadarCdnFailure();
      return null;
    } finally { dl.done(); }
  }
  return null;
}

async function loadIncaGrid(priority?: RequestPriority): Promise<IncaGrid> {
  // RD3: erst der Bild-Weg (kein NetCDF-Download 722 KB → ~65 KB, kein HDF5-Parse);
  // jeder Fehlschlag fällt still auf die Direkt-API zurück (benannter Weg wie bisher).
  const viaImg = await loadIncaFromImg(priority);
  if (viaImg) return viaImg;
  try {
    const url = `${GRID_URL}?parameters=rr&output_format=netcdf&bbox=${BBOX}`;
    warmHdf5Worker();   // Isolate + jsfive laden im Download-Schatten (H3)
    const res = await fetch(url, priority ? { priority } : undefined);
    if (!res.ok) throw new Error(`GeoSphere INCA grid: ${res.status}`);
    const buf = await res.arrayBuffer();
    const { frames, corners } = await parseIncaOffMain(buf);
    if (frames.length === 0) throw new Error('GeoSphere INCA: keine Frames');
    return { frames, corners };
  } catch (err) {
    // Quelle ganz weg: der Spiegel trägt die Lage noch (gerechnete Stempel, gegattert).
    const viaGuess = await loadIncaFromImgGuessed(priority);
    if (viaGuess) return viaGuess;
    throw err;
  }
}
