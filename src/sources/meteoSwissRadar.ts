/**
 * MeteoSwiss — Radar-Niederschlag `RR` (rzc, Regenrate) für die Schweiz.
 *
 * Das offene MeteoSwiss-Nowcasting (INCA, 0–6 h Vorhersage) ist in der OGD
 * (Collection `ch.meteoschweiz.ogd-nowcasting`) aktuell NICHT als Grid
 * publiziert. Verfügbar ist das Radar-Analyseprodukt `rzc` (Produktcode `RR`,
 * Regenrate, 1 km / 5 min) — das CH-Pendant zur DE-RADOLAN-RY-Analyse. Es
 * liefert nur „jetzt"/Vergangenheit, KEINEN Forecast; die 0–6 h-Vorhersage über
 * der Schweiz kommt daher aus ICON-D2 (deckt CH geografisch ab).
 *
 * Quelle (CC BY 4.0, kein Key, CORS-frei):
 *   STAC-Tagesitem `…/ogd-radar-precip/items/<YYYYMMDD>-ch` listet alle
 *   5-Min-Assets; die rzc-Dateien liegen direkt unter
 *   `data.geo.admin.ch/ch.meteoschweiz.ogd-radar-precip/<YYYYMMDD>-ch/rzc….h5`.
 *
 * Das ODIM-HDF5-Parsen steht seit LE2/H3 in `rzcParse.ts` und läuft im
 * `hdf5Worker` (Rückfall = derselbe Code auf dem Hauptthread).
 */

import type { QuadCorners } from '../scalar/RainLayer';
import { parseRzcOffMain, warmHdf5Worker } from './hdf5OffMain';
import { shareInFlight } from './shareInFlight';
// RD3 (audit/radar-datenrepo.md §14): fertiger Frame vom Daten-Repo-CDN
import { radarCdnEnabled, radarCdnUsable, radarImgEnabled, noteRadarCdnFailure, radarCdnDeadline } from './radolanRuns';
import { rzcImgDir, parseRzcImgMeta, radarImgStamp, radarImgStampToMs, fetchImgRes, RadarImg404 } from './radarImg';
import { loadRadarGrayPngOffMain, loadRadarGrayAlphaPngOffMain } from './radolan';   // Phase PF (M4)
import { radarDualFlagFrom } from '../scalar/radarHd';

const STAC_ITEM = (day: string) =>
  `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`;

export const METEOSWISS_RADAR_ATTRIBUTION =
  'Radar: <a href="https://www.meteoschweiz.admin.ch" target="_blank" rel="noopener">MeteoSchweiz</a> ' +
  'rzc (RR) · CC BY 4.0';

export interface RadarFrame {
  values: Uint8Array;
  /** Phase HD-3: Log-Ebene (0,06 … 200 mm/h) aus dem Dual-PNG des Spiegels — nur mit `?hdv2=1` und wenn der Slot sie trägt. */
  values2?: Uint8Array;
  width: number;
  height: number;
  corners: QuadCorners;
  validAt: Date;
}

/** LE2/H7: Netzpriorität des Abrufs — `'low'` für die Nachbarquelle. */
export interface RzcFetchOptions { priority?: RequestPriority }

function pad2(n: number) { return String(n).padStart(2, '0'); }
function utcDay(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
}

// RD3: gerechnete 5-min-Slot-Stempel statt STAC-Item (261 KB je Abruf). Der
// Publikationsverzug ist mit ~1,3 min gemessen (Spiegel-Telemetrie §14.2); das
// Bild-Gate trägt Spiegel-Poll (30 s) + Derive + Push + CDN mit Reserve. Im
// Frische-Fenster (Quelle hat vermutlich schon einen jüngeren Snapshot, den das
// Gate noch sperrt) übernimmt der STAC-Weg — die Karte bleibt exakt so frisch
// wie bisher.
export const RZC_PUBLISH_LAG_MIN = 1.5;
export const RZC_IMG_GATE_MS = 240_000;

/** Die `count` jüngsten Slot-Stempel (`YYYYMMDDTHHMM`), die bei `lagMs` Verzug sicher vorliegen. */
export function guessRzcStamps(count: number, nowMs: number = Date.now(), lagMs: number = RZC_IMG_GATE_MS): string[] {
  const stepMs = 5 * 60_000;
  const newest = Math.floor((nowMs - lagMs) / stepMs) * stepMs;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(radarImgStamp(newest - i * stepMs));
  return out;
}

/**
 * One mirrored rzc slot → frame. HD-3: mit `?hdv2=1` das Dual-PNG (beide Ebenen in einem Abruf); fehlt es (404), `frame.png`
 * wie bisher. Phase PF (M4): decoded off-main. Shared by the live reader and the look-back sequence (V-RA-3).
 */
async function readRzcSlotFrame(dir: string, stamp: string, meta: NonNullable<ReturnType<typeof parseRzcImgMeta>>, signal: AbortSignal, priority?: RequestPriority): Promise<RadarFrame> {
  let values: Uint8Array | null = null, values2: Uint8Array | undefined;
  const g = radarDualFlagFrom() && meta.dual ? meta.dual.frames[0]?.file : null;
  if (g) {
    try {
      const d = await loadRadarGrayAlphaPngOffMain(await fetchImgRes(`${dir}/${g}`, signal, priority), meta.width, meta.height);
      values = d.values; values2 = d.values2;
    } catch (err) { if (!(err instanceof RadarImg404)) throw err; }
  }
  if (!values) values = await loadRadarGrayPngOffMain(await fetchImgRes(`${dir}/frame.png`, signal, priority), meta.width, meta.height);
  return {
    values, ...(values2 ? { values2 } : {}), width: meta.width, height: meta.height, corners: meta.corners as QuadCorners,
    validAt: meta.validAtMs != null ? new Date(meta.validAtMs) : new Date(radarImgStampToMs(stamp)),
  };
}

/**
 * Phase RA (V-RA-3, `audit/radar-aufloesung.md`): the last `count` MEASURED rzc analyses from the mirror (`rzc/<stamp>/`,
 * 24 slots = 2 h), ascending in time — the look-back of the Regenradar for a Swiss place, which until now only grew
 * over the session (no archive seed like DE). A slot the mirror does not carry (404) is skipped; a hard CDN error ends
 * the series (what is there is returned). Only the image way — there is no cheap raw way for an old rzc slot.
 */
export async function fetchRzcAnalysisSequence(count: number, signal?: AbortSignal): Promise<RadarFrame[]> {
  const out: RadarFrame[] = [];
  if (!(radarCdnEnabled() && radarCdnUsable() && radarImgEnabled())) return out;
  const stamps = guessRzcStamps(Math.min(24, count + 1), Date.now());
  for (const stamp of stamps) {
    if (out.length >= count || signal?.aborted) break;
    const dl = radarCdnDeadline(signal);
    try {
      const dir = rzcImgDir(stamp);
      const meta = parseRzcImgMeta(await (await fetchImgRes(`${dir}/meta.json`, dl.signal)).json());
      if (!meta || meta.stamp !== stamp) continue;
      dl.touch();
      out.push(await readRzcSlotFrame(dir, stamp, meta, dl.signal));
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err instanceof RadarImg404) continue;
      noteRadarCdnFailure();
      break;
    } finally { dl.done(); }
  }
  out.sort((a, b) => a.validAt.getTime() - b.validAt.getTime());
  return out;
}

/** CDN-Versuch; `null` heißt: STAC + Direkt-Download wie bisher. */
async function loadRzcFromImg(priority?: RequestPriority, quelleWeg = false): Promise<RadarFrame | null> {
  if (!(radarCdnEnabled() && radarCdnUsable() && radarImgEnabled())) return null;
  const now = Date.now();
  // Frische-Fenster wie beim KONRAD-Weg: aggressiver Rat ≠ gegatteter Rat ⇒ direkt.
  // Ist die QUELLE weg, gibt es nichts Frischeres — dann gilt das Fenster nicht und
  // der Spiegel darf tiefer zurückreichen (Retention 12 Slots = 1 h).
  if (!quelleWeg && guessRzcStamps(1, now, RZC_PUBLISH_LAG_MIN * 60_000)[0] !== guessRzcStamps(1, now)[0]) return null;
  for (const stamp of guessRzcStamps(quelleWeg ? 6 : 2, now)) {
    const dl = radarCdnDeadline(undefined);
    try {
      const dir = rzcImgDir(stamp);
      const meta = parseRzcImgMeta(await (await fetchImgRes(`${dir}/meta.json`, dl.signal, priority)).json());
      if (!meta || meta.stamp !== stamp) continue;
      const frame = await readRzcSlotFrame(dir, stamp, meta, dl.signal, priority);
      if (quelleWeg) console.warn(`[buscosun] MeteoSwiss rzc nicht erreichbar — Daten-Repo (PNG), Slot ${stamp} (${Math.round((now - radarImgStampToMs(stamp)) / 60_000)} min alt)`);
      else console.log(`[buscosun] MeteoSwiss rzc → Slot ${stamp} · Quelle Daten-Repo (PNG)`);
      return frame;
    } catch (err) {
      if (err instanceof RadarImg404) continue;   // Slot (noch) nicht gespiegelt ⇒ älterer Kandidat, dann STAC
      noteRadarCdnFailure();
      return null;
    } finally { dl.done(); }
  }
  return null;
}

/**
 * Die jüngsten rzc-Assets aus dem STAC-Tagesitem (heute, sonst gestern), JÜNGSTES ZUERST.
 *
 * Mehrere Kandidaten, weil MeteoSwiss ein Asset im Item listet, BEVOR die Datei
 * abrufbar ist: am 2026-09-03 gemessen lieferte das jüngste gelistete Asset **403**,
 * die drei älteren 200 (Publikations-Race). Vorher nahm der Leser nur das letzte und
 * warf bei 403 — das CH-Radar fiel in diesem Fenster ganz aus (Altbestand, durch die
 * RD3-Verifikation aufgedeckt; `audit/radar-datenrepo.md` §14.5).
 */
async function resolveRzcHrefs(signal?: AbortSignal, priority?: RequestPriority, count = 3): Promise<string[]> {
  const now = new Date();
  for (const day of [utcDay(now), utcDay(new Date(now.getTime() - 24 * 3600_000))]) {
    let res: Response;
    try {
      res = await fetch(STAC_ITEM(day), priority ? { signal, priority } : { signal });
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const item = (await res.json()) as { assets?: Record<string, { href: string }> };
    const rzc = Object.keys(item.assets ?? {}).filter((k) => k.startsWith('rzc')).sort();
    if (rzc.length) return rzc.slice(-count).reverse().map((k) => item.assets![k].href);
  }
  throw new Error('MeteoSwiss rzc: kein Asset gefunden');
}

/** Lädt den jüngsten rzc-Frame, dekodiert das HDF5 und baut das Uint8-Werte-Grid. */
export async function fetchRzcLatest(signal?: AbortSignal, opts?: RzcFetchOptions): Promise<RadarFrame> {
  // Entdopplung: Karte und Punktforecast fragen beim Mount gleichzeitig (§24.3).
  // Anders als DE/AT senden beide CH-Endpunkte `max-age`, ein warmer HTTP-Cache
  // fängt die Wiederholung also ab — die Byte-Ersparnis wird hier NICHT
  // behauptet. Sicher gespart wird das zweite Dekodieren des HDF5.
  return shareInFlight('meteoswiss-rzc-latest', () => loadRzcLatest(opts?.priority), signal);
}

async function loadRzcLatest(priority?: RequestPriority): Promise<RadarFrame> {
  // RD3: erst der Bild-Weg (kein STAC-Item 261 KB, kein HDF5-Parse); Fehlschlag ⇒ STAC wie bisher.
  const viaImg = await loadRzcFromImg(priority);
  if (viaImg) return viaImg;
  try {
    const hrefs = await resolveRzcHrefs(undefined, priority);
    warmHdf5Worker();   // Isolate + jsfive laden im Download-Schatten (H3)
    let lastErr: unknown;
    for (const href of hrefs) {
      const res = await fetch(href, priority ? { priority } : undefined);
      if (!res.ok) {                       // 403/404: noch nicht freigegeben ⇒ nächstälteres Asset
        lastErr = new Error(`MeteoSwiss rzc fetch: ${res.status}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      const r = await parseRzcOffMain(buf);
      return {
        values: r.values, width: r.width, height: r.height, corners: r.corners,
        validAt: r.validAtMs == null ? new Date() : new Date(r.validAtMs),   // Fallback: jetzt (wie bisher)
      };
    }
    throw lastErr ?? new Error('MeteoSwiss rzc: kein abrufbares Asset');
  } catch (err) {
    // Quelle ganz weg: der Spiegel trägt die Lage noch (gerechnete Stempel, gegattert) —
    // ausdrücklich NACH dem Direktweg, damit die Frische nie schlechter wird.
    const viaGuess = await loadRzcFromImg(priority, true);
    if (viaGuess) return viaGuess;
    throw err;
  }
}
