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
import { rzcImgDir, parseRzcImgMeta, radarImgStamp, radarImgStampToMs, fetchImgRes, RadarImg404, radarRawUrl, pooledAll } from './radarImg';
import { loadRadarGrayPngOffMain, loadRadarGrayAlphaPngOffMain, RADAR_PAST_CONCURRENCY } from './radolan';   // Phase PF (M4)
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
 * Phase RL (29.10.2026): a mirrored slot is immutable — once read, the frame is kept per stamp (and dual switch) for the
 * session, bounded. The live reader, the 5-min refresh, the look-back seed and the point series asked for the SAME slot
 * up to four times per load (measured: `rzc/<stamp>/meta.json` + `frame.png` twice within 4 s); now one download per slot.
 */
const RZC_MEMO_MAX = 30;
const _rzcMemo = new Map<string, RadarFrame>();
const rzcMemoKey = (stamp: string) => `${stamp}|${radarDualFlagFrom() ? 'g' : 'f'}`;
function rzcMemoGet(stamp: string): RadarFrame | null { return _rzcMemo.get(rzcMemoKey(stamp)) ?? null; }
function rzcMemoPut(stamp: string, frame: RadarFrame): void {
  _rzcMemo.set(rzcMemoKey(stamp), frame);
  while (_rzcMemo.size > RZC_MEMO_MAX) { const oldest = _rzcMemo.keys().next().value; if (oldest === undefined) break; _rzcMemo.delete(oldest); }
}
/** The last frame decoded from a MeteoSwiss HDF5 asset (no log plane) — a second caller within the same slot reuses it. */
let _rzcH5Last: { stamp: string; frame: RadarFrame } | null = null;
/** Nur für Verifier/Tests. */
export function _resetRzcMemo(): void { _rzcMemo.clear(); _rzcH5Last = null; }

/**
 * One mirrored rzc slot → frame. HD-3: mit `?hdv2=1` das Dual-PNG (beide Ebenen in einem Abruf); fehlt es (404), `frame.png`
 * wie bisher. Phase PF (M4): decoded off-main. Shared by the live reader and the look-back sequence (V-RA-3).
 */
async function readRzcSlotFrame(dir: string, stamp: string, meta: NonNullable<ReturnType<typeof parseRzcImgMeta>>, signal: AbortSignal, priority?: RequestPriority): Promise<RadarFrame> {
  const memo = rzcMemoGet(stamp);
  if (memo) return memo;
  const frame = await readRzcSlotFrameFresh(dir, stamp, meta, signal, priority);
  rzcMemoPut(stamp, frame);
  return frame;
}
async function readRzcSlotFrameFresh(dir: string, stamp: string, meta: NonNullable<ReturnType<typeof parseRzcImgMeta>>, signal: AbortSignal, priority?: RequestPriority): Promise<RadarFrame> {
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
  // Look-back for every place (31.10.): the slots load side by side (`RADAR_PAST_CONCURRENCY`) instead of one after another.
  // A hard CDN error is noted once and stops the slots not yet started — as the loop before stopped at it.
  let hardFail = false;
  const got = await pooledAll(stamps, RADAR_PAST_CONCURRENCY, async (stamp): Promise<RadarFrame | null> => {
    const memo = rzcMemoGet(stamp);
    if (memo) return memo;
    if (hardFail || signal?.aborted) return null;
    const dl = radarCdnDeadline(signal);
    try {
      const dir = rzcImgDir(stamp);
      const meta = parseRzcImgMeta(await (await fetchImgRes(`${dir}/meta.json`, dl.signal)).json());
      if (!meta || meta.stamp !== stamp) return null;
      dl.touch();
      return await readRzcSlotFrame(dir, stamp, meta, dl.signal);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (err instanceof RadarImg404) return null;
      if (!hardFail) { hardFail = true; noteRadarCdnFailure(); }
      return null;
    } finally { dl.done(); }
  });
  for (const f of got) { if (f && out.length < count) out.push(f); }
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
  const fresh = guessRzcStamps(1, now, RZC_PUBLISH_LAG_MIN * 60_000)[0];
  if (!quelleWeg && guessRzcStamps(1, now)[0] !== fresh) {
    // Phase RL (29.10.2026): the mirror usually carries the fresh slot within ~2 min (poll 10 s + derive + push), i.e. for
    // most of this window — measured 15:58 local: STAC + HDF5 delivered the SAME slot 14:50 the mirror held, without the
    // log plane (so „jetzt" and +5 min were drawn from different planes). One probe on raw.githubusercontent for the fresh
    // stamp (never the CDN: an un-gated 404 would be held at the edge, V-AW-25); a miss keeps the STAC way = same freshness.
    return loadRzcMirrorSlot(fresh, priority, now);
  }
  for (const stamp of guessRzcStamps(quelleWeg ? 6 : 2, now)) {
    const r = await loadRzcMirrorSlot(stamp, priority, now, quelleWeg ? 'nicht erreichbar' : undefined);
    if (r) return r;
    if (!radarCdnUsable()) return null;   // a hard CDN error ended the way (latch) — STAC as before
  }
  return null;
}

/**
 * ONE mirrored slot by stamp: the session memo first; then the CDN for a gated stamp, raw.githubusercontent for a younger one
 * (never the CDN there: an un-gated 404 would be held at the edge, V-AW-25; `@main` lags a push by up to ~3 min). `null` =
 * not mirrored (yet), unreadable, raw way off, or a hard error (a CDN one counts against the latch, a raw one does not).
 */
async function loadRzcMirrorSlot(stamp: string, priority: RequestPriority | undefined, now: number, warnWord?: string): Promise<RadarFrame | null> {
  const say = (how: string) => {
    const line = `[buscosun] MeteoSwiss rzc → Slot ${stamp} · Quelle Daten-Repo (PNG${how}) · ${Math.round((now - radarImgStampToMs(stamp)) / 60_000)} min alt`;
    if (warnWord) console.warn(`[buscosun] MeteoSwiss rzc ${warnWord} — Daten-Repo (PNG${how}), Slot ${stamp} (${Math.round((now - radarImgStampToMs(stamp)) / 60_000)} min alt)`);
    else console.log(line);
  };
  const memo = rzcMemoGet(stamp);
  if (memo) { say(', aus dem Sitzungsspeicher'); return memo; }
  const gated = now - radarImgStampToMs(stamp) >= RZC_IMG_GATE_MS;
  const dir = gated ? rzcImgDir(stamp) : radarRawUrl(rzcImgDir(stamp));
  if (!dir) return null;
  const dl = radarCdnDeadline(undefined);
  try {
    const meta = parseRzcImgMeta(await (await fetchImgRes(`${dir}/meta.json`, dl.signal, priority)).json());
    if (!meta || meta.stamp !== stamp) return null;
    dl.touch();
    const frame = await readRzcSlotFrame(dir, stamp, meta, dl.signal, priority);
    say(gated ? '' : ', frischer Slot über raw');
    return frame;
  } catch (err) {
    if (gated && !(err instanceof RadarImg404)) noteRadarCdnFailure();
    return null;
  } finally { dl.done(); }
}

/**
 * Phase RL: the slot stamp of a STAC asset — `rzc<YY><DDD><HHMM>…` (year, day of year, UTC time; `rzc263021500rl.001.h5` =
 * 2026-10-29 15:00). NaN for any other name. Exported for the verifier.
 */
export function rzcStampFromHref(href: string): string | null {
  const m = /rzc(\d{2})(\d{3})(\d{2})(\d{2})[^/]*$/.exec(href);
  if (!m) return null;
  const ms = Date.UTC(2000 + +m[1], 0, +m[2], +m[3], +m[4]);
  return Number.isFinite(ms) ? radarImgStamp(ms) : null;
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
  // Faster full load (31.10.): the page's readers (map, deck, point sampler, NC) ask one after another within seconds; the
  // in-flight sharing below only catches simultaneous calls, so a late one ran the whole fresh-window probe again (raw
  // meta, STAC item). A result this young is handed on — far below the 5-min slot step.
  if (_rzcRecent && Date.now() - _rzcRecent.atMs < RZC_REUSE_MS) return _rzcRecent.frame;
  // Entdopplung: Karte und Punktforecast fragen beim Mount gleichzeitig (§24.3).
  // Anders als DE/AT senden beide CH-Endpunkte `max-age`, ein warmer HTTP-Cache
  // fängt die Wiederholung also ab — die Byte-Ersparnis wird hier NICHT
  // behauptet. Sicher gespart wird das zweite Dekodieren des HDF5.
  return shareInFlight('meteoswiss-rzc-latest', async () => {
    const frame = await loadRzcLatest(opts?.priority);
    _rzcRecent = { atMs: Date.now(), frame };
    return frame;
  }, signal);
}
/** How long a loaded rzc analysis is handed to the next caller without a new probe. set. */
export const RZC_REUSE_MS = 30_000;
let _rzcRecent: { atMs: number; frame: RadarFrame } | null = null;

async function loadRzcLatest(priority?: RequestPriority): Promise<RadarFrame> {
  // RD3: erst der Bild-Weg (kein STAC-Item 261 KB, kein HDF5-Parse); Fehlschlag ⇒ STAC wie bisher.
  const viaImg = await loadRzcFromImg(priority);
  if (viaImg) return viaImg;
  try {
    const hrefs = await resolveRzcHrefs(undefined, priority);
    // Phase RL (29.10.2026): the listing names the newest slot — when the mirror holds THAT slot, its PNG (with the log plane,
    // memoised) replaces the HDF5 download + parse; measured 16:08 local: STAC's newest was 15:00, the slot the mirror held.
    // The HDF5 way stays for a slot the mirror does not carry (yet) — the freshness never gets worse.
    if (radarCdnEnabled() && radarCdnUsable() && radarImgEnabled()) {
      const stamp = rzcStampFromHref(hrefs[0] ?? '');
      const viaMirror = stamp ? await loadRzcMirrorSlot(stamp, priority, Date.now()) : null;
      if (viaMirror) return viaMirror;
    }
    warmHdf5Worker();   // Isolate + jsfive laden im Download-Schatten (H3)
    let lastErr: unknown;
    for (const href of hrefs) {
      const stamp = rzcStampFromHref(href);
      const h5 = stamp ? _rzcH5Last : null;
      if (h5 && h5.stamp === stamp) return h5.frame;   // the same asset decoded moments ago by another caller
      const res = await fetch(href, priority ? { priority } : undefined);
      if (!res.ok) {                       // 403/404: noch nicht freigegeben ⇒ nächstälteres Asset
        lastErr = new Error(`MeteoSwiss rzc fetch: ${res.status}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      const r = await parseRzcOffMain(buf);
      const frame: RadarFrame = {
        values: r.values, width: r.width, height: r.height, corners: r.corners,
        validAt: r.validAtMs == null ? new Date() : new Date(r.validAtMs),   // Fallback: jetzt (wie bisher)
      };
      if (stamp) _rzcH5Last = { stamp, frame };
      console.log(`[buscosun] MeteoSwiss rzc → ${href.split('/').pop()} · Quelle MeteoSchweiz (HDF5)${stamp ? ` · Slot ${stamp} nicht im Daten-Repo` : ''}`);
      return frame;
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
