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
import { rzcImgDir, parseRzcImgMeta, radarImgStamp, radarImgStampToMs, fetchImgRes, loadRadarGrayPng, RadarImg404 } from './radarImg';

const STAC_ITEM = (day: string) =>
  `https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip/items/${day}-ch`;

export const METEOSWISS_RADAR_ATTRIBUTION =
  'Radar: <a href="https://www.meteoschweiz.admin.ch" target="_blank" rel="noopener">MeteoSchweiz</a> ' +
  'rzc (RR) · CC BY 4.0';

export interface RadarFrame {
  values: Uint8Array;
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

/** CDN-Versuch; `null` heißt: STAC + Direkt-Download wie bisher. */
async function loadRzcFromImg(priority?: RequestPriority): Promise<RadarFrame | null> {
  if (!(radarCdnEnabled() && radarCdnUsable() && radarImgEnabled())) return null;
  const now = Date.now();
  // Frische-Fenster wie beim KONRAD-Weg: aggressiver Rat ≠ gegatteter Rat ⇒ direkt.
  if (guessRzcStamps(1, now, RZC_PUBLISH_LAG_MIN * 60_000)[0] !== guessRzcStamps(1, now)[0]) return null;
  for (const stamp of guessRzcStamps(2, now)) {
    const dl = radarCdnDeadline(undefined);
    try {
      const dir = rzcImgDir(stamp);
      const meta = parseRzcImgMeta(await (await fetchImgRes(`${dir}/meta.json`, dl.signal, priority)).json());
      if (!meta || meta.stamp !== stamp) continue;
      const values = await loadRadarGrayPng(await fetchImgRes(`${dir}/frame.png`, dl.signal, priority), meta.width, meta.height);
      console.log(`[buscosun] MeteoSwiss rzc → Slot ${stamp} · Quelle Daten-Repo (PNG)`);
      return {
        values, width: meta.width, height: meta.height, corners: meta.corners as QuadCorners,
        validAt: meta.validAtMs != null ? new Date(meta.validAtMs) : new Date(radarImgStampToMs(stamp)),
      };
    } catch (err) {
      if (err instanceof RadarImg404) continue;   // Slot (noch) nicht gespiegelt ⇒ älterer Kandidat, dann STAC
      noteRadarCdnFailure();
      return null;
    } finally { dl.done(); }
  }
  return null;
}

/** Liefert die href des jüngsten rzc-Assets aus dem STAC-Tagesitem (heute, sonst gestern). */
async function resolveLatestRzcHref(signal?: AbortSignal, priority?: RequestPriority): Promise<string> {
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
    if (rzc.length) return item.assets![rzc[rzc.length - 1]].href;
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
  const href = await resolveLatestRzcHref(undefined, priority);
  warmHdf5Worker();   // Isolate + jsfive laden im Download-Schatten (H3)
  const res = await fetch(href, priority ? { priority } : undefined);
  if (!res.ok) throw new Error(`MeteoSwiss rzc fetch: ${res.status}`);
  const buf = await res.arrayBuffer();
  const r = await parseRzcOffMain(buf);
  return {
    values: r.values, width: r.width, height: r.height, corners: r.corners,
    validAt: r.validAtMs == null ? new Date() : new Date(r.validAtMs),   // Fallback: jetzt (wie bisher)
  };
}
