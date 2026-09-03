/**
 * DWD RADOLAN — 0–2 h Niederschlags-Nowcast aus den OpenData-Binärprodukten.
 *
 * Quellen (opendata.dwd.de, CC BY 4.0, keine Rate-Limits, kommerziell ok):
 *   - composite/rv/DE1200_RV<YYMMDDHHMM>.tar.bz2
 *       RV = "Radar-Vorhersage" Nowcast. EIN tar.bz2 pro 5-Min-Lauf, das ALLE
 *       25 Frames von +0 bis +120 min (5-Min-Schritte) enthält. Gitter DE1200
 *       (1100 Spalten × 1200 Zeilen, 1 km). Frame _000 ist die Analyse ("jetzt").
 *   - radar/radolan/ry/…-latest…bin.bz2
 *       RY = ungeeichte 5-Min-Analyse (Echtzeit). Legacy-900×900-Gitter im
 *       Binärformat. Hier optional als Live-Frame nutzbar — der RV-_000-Frame
 *       liefert dieselbe Live-Analyse aber bereits auf dem DE1200-Gitter, daher
 *       speist der Slider die Nowcast-Anzeige aus dem RV-Tar (ein Gitter, keine
 *       Naht). `fetchRyLatest` bleibt exportiert für eine spätere Live-Variante.
 *
 * **Quantitatives Feld (verifiziert 2026-05 gegen echte Bytes).** Frühere
 * Annahme, OpenData liefere nur eine Binär-Maske, war falsch. Jedes Zelle ist
 * ein little-endian uint16:
 *   - Flag-Bit 0x2000 gesetzt (Wert 0x29C4 = 2500+Flag) → außerhalb der
 *     Radarabdeckung / kein Messwert → transparent.
 *   - sonst: die unteren Bits sind der Niederschlag in PR-Einheiten
 *     (Header `PR E-02` ⇒ 0,01 mm) über das Messintervall (Header `INT 5` ⇒
 *     5 min). mm/h = Wert · 0,01 · (60/5) = Wert · 0,12.
 */

import { decompress } from './decompress';
import { shareInFlight } from './shareInFlight';
import type { QuadCorners } from '../scalar/RainLayer';
import { decodeRadolanRaw, decodeRvTar, type RadolanGrid, type DecodedRvFrame } from './radolanDecode';
// LE1/H2: Lauf-Zeitstempel, Tar-URL, Cache-Name und der Frühstart des Tar-Abrufs
// leben abhängigkeitsfrei in `radolanRuns.ts` (der Router stößt ihn aus dem
// index-Chunk an). Re-Export, damit `verify:radar-runs` und andere Importeure
// unverändert bleiben.
import {
  RV_DIR, RV_TAR_CACHE, guessRvRuns, rvTarUrl, takeWarmRvTar,
  // RD2 (audit/radar-datenrepo.md §13): CDN-Weg über das Daten-Repo
  rvTarCdnUrl, rvCdnEligible, noteRadarCdnFailure, radarCdnDeadline,
  // RD3 (audit §14): fertig aufbereitete Frame-PNGs vom Daten-Repo
  rvImgEligible, rvImgDir, rvStampToMs,
} from './radolanRuns';
import { parseRvImgMeta, RadarImg404, fetchImgRes, loadRadarGrayPng } from './radarImg';
import { decodeGrayPng } from './grayPng';
export { guessRvRuns } from './radolanRuns';

const RY_LATEST =
  '/_dwd_opendata/weather/radar/radolan/ry/raa01-ry_10000-latest-dwd---bin.bz2';

export const RADOLAN_RV_ATTRIBUTION =
  'Nowcast: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD RADOLAN-RV</a> · CC BY 4.0';

/**
 * Gitter-Geometrie (Eckkoordinaten, polar-stereografische Projektion, Warp-Mesh)
 * liegt seit RP1 in `radolanGeo.ts` — reine Mathematik ohne DOM/Worker/Netz,
 * damit Rendering (`de1200WarpMesh`), Karten-Komposit (`buildIndexMap`, ps=true)
 * und Punktabfrage (`sampleRadarQuad`, s. `pointForecast/radarSample.ts`)
 * dieselben Formeln benutzen. Re-Export: bestehende Importpfade bleiben gültig.
 */
import { DE1200_CORNERS } from './radolanGeo';
export {
  DE1200_CORNERS, DE1200_WARP_N, de1200WarpMesh, psFwd, psInv,
} from './radolanGeo';

// RadolanGrid, TarEntry/untar, RadolanHeader/parseHeader, decodeRadolanRaw und
// ratesToValues sind nach radolanDecode.ts ausgelagert (DOM-frei, läuft off-main
// im radolanWorker — s. decodeRvTarOffMain unten). decodeRadolanRaw bleibt hier
// re-importiert für fetchRyLatest (Einzelframe, kein Tar, kein Worker nötig).

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export interface RvFrame {
  /** Vorlaufzeit in Minuten (0,5,…,120). */
  leadMinutes: number;
  /** Gültigkeitszeit (Lauf-Zeit + Lead). */
  validAt: Date;
  /** Kompaktes Werte-Grid (1 Byte/Zelle, north-up) für RainLayer.setFrame. */
  values: Uint8Array;
  width: number;
  height: number;
}

export interface RvNowcast {
  /** Lauf-/Analysezeitpunkt ("jetzt"). */
  runAt: Date;
  /** Frames nach Vorlaufzeit aufsteigend (0…120 min). */
  frames: RvFrame[];
  /** Geo-Ecken (DE1200) für RainLayer. */
  corners: QuadCorners;
}

let _runCache: { ts: string; at: number } | null = null;
const RUN_CACHE_TTL = 60_000;

// ---------------------------------------------------------------------------
// Lauf-Zeitstempel: gerechnet statt gelistet (BW-5)
// ---------------------------------------------------------------------------
// Das RV-Verzeichnis ist ein lückenloses 5-Minuten-Raster — gemessen am
// 2026-08-24: 577 Läufe über 48 h, keine einzige Abweichung vom Takt. Für diese
// Auskunft lud die App ein 154-KiB-HTML, und zwar ohne jeden Cache-Header
// (§14.4), dreimal je DE-Kaltsitzung plus einmal je 5-Minuten-Refresh.
//
// Der Veröffentlichungsverzug ist die Größe, an der ein Rat scheitert oder
// gelingt. Über zwölf aufeinanderfolgende Läufe (Last-Modified gegen Slot-Zeit):
// 3,28 / 3,33 / 3,43 min als min/median/max — 9 Sekunden Streuung in einer
// Stunde.
//
// Wir raten deshalb AGGRESSIV, beim frühestmöglichen Slot, und lassen einen 404
// den Rest erledigen. Der umgekehrte Weg (sicherheitshalber 4 min zurück) träfe
// immer, zeigte aber in ~11 % der Aufrufe still einen 5 Minuten alten Stand.
// Ein Fehlgriff, der sich selbst korrigiert, ist besser als ein stiller
// Rückstand — und er kostet nur einen leeren Rundlauf.
//
// Das Listing bleibt der benannte Fallback (Muster „Rule 2"): schlagen alle
// gerechneten Kandidaten fehl, wird es geladen. Ändert der DWD Takt oder
// Namensschema, funktioniert die Seite weiter, nur wieder mit 154 KB.
// (Takt, Verzug und `guessRvRuns` selbst: `radolanRuns.ts`.)
/** Kandidaten, die vor dem Listing-Fallback durchprobiert werden. */
const RV_GUESS_TRIES = 3;

/** Listet das RV-Verzeichnis und liefert die Zeitstempel (absteigend). */
async function listRvRuns(signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(RV_DIR, { signal });
  if (!res.ok) throw new Error(`RADOLAN-RV Verzeichnis: ${res.status}`);
  const html = await res.text();
  const set = new Set<string>();
  const re = /DE1200_RV(\d{10})\.tar\.bz2/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) set.add(m[1]);
  return [...set].sort().reverse();
}

// ---------------------------------------------------------------------------
// Cache der KOMPRIMIERTEN RV-Tars (Cache API). Der DWD-Download des ~1,6-MB-Tars
// ist über den Proxy spürbar langsam; pro Lauf ist die URL unveränderlich (Lauf-
// Zeitstempel im Namen). Treffer überspringt den Netz-Download → Warm-Reload
// lädt nur noch das (mit WASM-bzip2 schnelle) Entpacken. Wenige MB je Lauf.
// ---------------------------------------------------------------------------
// (`RV_TAR_CACHE` = 'radolan-rv-tar-v1', in `radolanRuns.ts` — der Frühstart prüft denselben Cache.)
// Hält neben dem aktuellen Lauf auch die jüngsten Vergangenheits-Läufe warm
// (Regenradar-Rückblick-Loop seedet ~45 min gemessene Analysen) → Warm-Reload
// ohne erneuten Netz-Download.
const RV_TAR_CACHE_MAX = 14;
let rvCacheP: Promise<Cache | null> | null = null;
function rvCache(): Promise<Cache | null> {
  if (!rvCacheP) {
    rvCacheP = typeof caches !== 'undefined' ? caches.open(RV_TAR_CACHE).catch(() => null) : Promise.resolve(null);
  }
  return rvCacheP;
}
async function pruneRvCache(cache: Cache): Promise<void> {
  try { const keys = await cache.keys(); for (let i = 0; i < keys.length - RV_TAR_CACHE_MAX; i++) await cache.delete(keys[i]); } catch { /* ignore */ }
}
/** Woher kam der letzte Tar? Nur fürs Log in `loadRvNowcast` (synchron danach gelesen). */
let _lastRvVia: 'img' | 'cdn' | 'dwd' = 'dwd';

async function fetchRvBytesCached(ts: string, signal?: AbortSignal, priority: RequestPriority = 'high'): Promise<ArrayBuffer> {
  const netlifyUrl = rvTarUrl(ts);
  const cdnUrl = rvTarCdnUrl(ts);
  const cache = await rvCache();
  // LE1/H2: hat der Router den Tar schon vorgestartet (beim Laden des Seiten-
  // Chunks), nehmen wir dessen Antwort — sie hat die Cache-API selbst befragt.
  // RD2: der Frühstart nimmt denselben Resolver; zwischen seinem und unserem
  // `Date.now()` kann der Slot das Gate passiert haben ⇒ beide Schlüssel probieren.
  let warmWasCdn = true;
  let warm = takeWarmRvTar(cdnUrl);
  if (!warm) { warmWasCdn = false; warm = takeWarmRvTar(netlifyUrl); }
  if (warm) {
    const { res, fromCache } = await warm;
    if (res.ok) {
      const buf = await res.arrayBuffer();
      if (cache && !fromCache) { cache.put(warmWasCdn ? cdnUrl : netlifyUrl, new Response(buf.slice(0))).then(() => pruneRvCache(cache)).catch(() => {}); }
      _lastRvVia = warmWasCdn ? 'cdn' : 'dwd';
      return buf;
    }
    // Ein vorgestarteter CDN-Fehlgriff (Spiegel noch nicht so weit) ist kein
    // Urteil über den Lauf — unten regulär weiter. Der Netlify-Fehlgriff bleibt
    // wie bisher das Urteil (404 = Lauf liegt noch nicht beim DWD).
    if (!warmWasCdn) throw new Error(`RADOLAN-RV ${netlifyUrl}: ${res.status}`);
  }
  if (cache) {
    const cdnHit = await cache.match(cdnUrl);
    const hit = cdnHit ?? (await cache.match(netlifyUrl));
    if (hit) { _lastRvVia = cdnHit ? 'cdn' : 'dwd'; return hit.arrayBuffer(); }
  }
  // RD2: CDN zuerst — aber nur, wenn der Slot das Zeit-Gate passiert hat
  // (sonst hielte jsDelivr unser 404 fest und der Slot würde für alle spät).
  // 404/5xx ⇒ benannter Fallback auf den DWD-Weg; Netz/Timeout zählt auf den
  // Sitzungs-Latch (`noteRadarCdnFailure`).
  if (rvCdnEligible(ts)) {
    const dl = radarCdnDeadline(signal);
    try {
      const res = await fetch(cdnUrl, { signal: dl.signal, priority });
      if (res.ok) {
        const buf = await res.arrayBuffer();
        if (cache) { cache.put(cdnUrl, new Response(buf.slice(0))).then(() => pruneRvCache(cache)).catch(() => {}); }
        _lastRvVia = 'cdn';
        return buf;
      }
    } catch (err) {
      if (signal?.aborted) throw err;
      noteRadarCdnFailure();
    } finally { dl.done(); }
  }
  // LE2/H7: der Tar ist das Erstbild (DE) ⇒ `'high'` wie im Frühstart; als
  // Nachbarquelle (AT/CH-Ort) reicht der Aufrufer `'low'` durch.
  const res = await fetch(netlifyUrl, { signal, priority });
  if (!res.ok) throw new Error(`RADOLAN-RV ${netlifyUrl}: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (cache) { cache.put(netlifyUrl, new Response(buf.slice(0))).then(() => pruneRvCache(cache)).catch(() => {}); }
  _lastRvVia = 'dwd';
  return buf;
}

// ---------------------------------------------------------------------------
// RV-Tar-Decode-Pool: untar + decodeRadolanRaw + ratesToValues (25 Frames ×
// 1,32-Mio.-Zellen DE1200-Gitter) laufen off-main im radolanWorker — vorher ein
// einziger unyielded Main-Thread-Loop (gemessen ~2-3 s blockiert, 4×-Throttle,
// beim ersten Zuschalten von Niederschlag/Flow-Nowcast/Regen-Chance, die alle
// auf denselben RV-Frames aufbauen). Fällt transparent auf denselben
// Main-Thread-Code zurück, wenn der Worker nicht verfügbar ist (gleiches Muster
// wie decompress.ts/windFrameWorker).
// ---------------------------------------------------------------------------
interface RwMsg {
  id: number; ok: boolean; error?: string;
  runAtMs?: number;
  frames?: { leadMinutes: number; validAtMs: number; width: number; height: number; valuesBuf: ArrayBuffer }[];
}
let rwWorker: Worker | null = null;
let rwUsable = true, rwInited = false, rwNextId = 1;
const rwPending = new Map<number, { resolve: (r: { runAtMs: number; frames: DecodedRvFrame[] }) => void; reject: (e: Error) => void }>();

function rwInit(): void {
  if (rwInited) return;
  rwInited = true;
  try {
    const w = new Worker(new URL('./radolanWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<RwMsg>) => {
      const d = e.data;
      const p = rwPending.get(d.id);
      if (!p) return;
      rwPending.delete(d.id);
      if (d.ok && d.frames) {
        p.resolve({
          runAtMs: d.runAtMs!,
          frames: d.frames.map((f) => ({
            leadMinutes: f.leadMinutes, validAtMs: f.validAtMs,
            width: f.width, height: f.height, values: new Uint8Array(f.valuesBuf),
          })),
        });
      } else {
        p.reject(new Error(d.error || 'radolan worker error'));
      }
    };
    w.onerror = () => {
      rwUsable = false;
      for (const [id, p] of rwPending) { rwPending.delete(id); p.reject(new Error('radolan worker crashed')); }
    };
    rwWorker = w;
  } catch {
    rwUsable = false;
  }
}

/** Entpackt+dekodiert den Tar off-main; fällt bei Worker-Problemen auf den
 *  identischen Main-Thread-Code (decodeRvTar) zurück. */
async function decodeRvTarOffMain(tarBytes: Uint8Array): Promise<{ runAtMs: number; frames: DecodedRvFrame[] }> {
  rwInit();
  if (!rwUsable || !rwWorker) return decodeRvTar(tarBytes);
  const w = rwWorker;
  const id = rwNextId++;
  try {
    return await new Promise((resolve, reject) => {
      rwPending.set(id, { resolve, reject });
      // Exakt zugeschnittene Kopie transferieren (tarBytes kann eine Teilsicht
      // eines größeren Buffers sein) — der Aufrufer braucht tarBytes danach
      // nicht mehr.
      const buf = tarBytes.buffer.slice(tarBytes.byteOffset, tarBytes.byteOffset + tarBytes.byteLength);
      w.postMessage({ id, tarBuf: buf }, [buf]);
    });
  } catch (err) {
    rwPending.delete(id);
    if (tarBytes.buffer.byteLength === 0) throw err; // s. windBlendWorker: nach echtem Transfer kein Fallback möglich
    return decodeRvTar(tarBytes);
  }
}

// ── RD3: der Bild-Weg — Frames als fertige Graustufen-PNGs vom Daten-Repo (audit §14) ──

/** RD3-Leseweg: geteilte Helfer in `radarImg.ts`; hier nur die Warm-Entgegennahme dazu. */
async function imgRes(url: string, signal: AbortSignal, priority?: RequestPriority): Promise<Response> {
  const wf = takeWarmRvTar(url);
  if (wf) {
    const res = (await wf).res;
    if (res.status === 404 || res.status === 403) throw new RadarImg404(`${res.status} ${url}`);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res;
  }
  return fetchImgRes(url, signal, priority);
}

/**
 * Ganzer Slot vom Bild-Weg — ALLES-ODER-NICHTS: fehlt ein Frame oder reißt die
 * CDN-Frist, übernimmt der Tar-Weg (Verbraucher brauchen den kompletten
 * 25-Frame-Stapel). `null` = Rückfall; harte Fehler zählen in den Sitzungs-Latch.
 */
async function fetchRvFromImg(ts: string, signal?: AbortSignal, priority?: RequestPriority): Promise<RvNowcast | null> {
  const dir = rvImgDir(ts);
  const dl = radarCdnDeadline(signal);
  try {
    const metaRes = await imgRes(`${dir}/meta.json`, dl.signal, priority);
    const meta = parseRvImgMeta(await metaRes.json());
    if (!meta || meta.stamp !== ts) return null; // Drift/fremder Slot ⇒ benannter Rohweg
    // Erst alle Bytes holen (das Netz ist der schnelle Teil: 26 Dateien ≈ 1,4 s
    // gemessen), dann in EINEM Zug off-main dekodieren — 33 MPixel gehören nicht
    // auf den Hauptthread (§14.7). Ohne Worker läuft derselbe Code hier.
    const bytes = await Promise.all(meta.frames.map(async (f) => ({
      leadMinutes: f.lead,
      validAtMs: f.validAtMs ?? meta.runAtMs + f.lead * 60_000,
      buf: await (await imgRes(`${dir}/${f.file}`, dl.signal, priority)).arrayBuffer(),
    })));
    const decoded = await decodeGrayPngsOffMain(bytes, meta.width, meta.height);
    const frames: RvFrame[] = decoded.map((f) => ({
      leadMinutes: f.leadMinutes,
      validAt: new Date(f.validAtMs),
      values: f.values,
      width: f.width,
      height: f.height,
    }));
    return { runAt: new Date(meta.runAtMs), frames, corners: DE1200_CORNERS };
  } catch (err) {
    if (signal?.aborted) throw err;             // Abbruch des Aufrufers bleibt ein Abbruch
    if (!(err instanceof RadarImg404)) noteRadarCdnFailure();
    return null;
  } finally { dl.done(); }
}

/** Rückblick/Hindcast: NUR der Analyse-Frame (f000.png ≈ 30 KB statt Voll-Tar ≈ 1,4 MB). */
async function fetchRvAnalysisFromImg(ts: string, signal?: AbortSignal): Promise<RvAnalysisFrame | null> {
  const dl = radarCdnDeadline(signal);
  try {
    const values = await loadRadarGrayPng(await imgRes(`${rvImgDir(ts)}/f000.png`, dl.signal), 1100, 1200);
    return { validAt: new Date(rvStampToMs(ts)), values, width: 1100, height: 1200 };
  } catch (err) {
    if (signal?.aborted) throw err;
    if (!(err instanceof RadarImg404)) noteRadarCdnFailure();
    return null;
  } finally { dl.done(); }
}

/**
 * Frame-PNGs → Werte-Grids, off-main im vorhandenen RADOLAN-Worker; bei
 * Worker-Problemen derselbe Code auf dem Hauptthread (Muster `decodeRvTarOffMain`).
 */
async function decodeGrayPngsOffMain(
  pngs: { leadMinutes: number; validAtMs: number; buf: ArrayBuffer }[], width: number, height: number,
): Promise<DecodedRvFrame[]> {
  const onMain = async (): Promise<DecodedRvFrame[]> => {
    const out: DecodedRvFrame[] = [];
    for (const p of pngs) {
      const g = await decodeGrayPng(new Uint8Array(p.buf));
      if (g.width !== width || g.height !== height) throw new Error(`PNG-Maße ${g.width}×${g.height} statt ${width}×${height}`);
      out.push({ leadMinutes: p.leadMinutes, validAtMs: p.validAtMs, width: g.width, height: g.height, values: g.values });
    }
    return out;
  };
  rwInit();
  if (!rwUsable || !rwWorker) return onMain();
  const w = rwWorker;
  const id = rwNextId++;
  try {
    const res = await new Promise<{ runAtMs: number; frames: DecodedRvFrame[] }>((resolve, reject) => {
      rwPending.set(id, { resolve, reject });
      w.postMessage({ id, pngs }, pngs.map((p) => p.buf));
    });
    for (const f of res.frames) {
      if (f.width !== width || f.height !== height) throw new Error(`PNG-Maße ${f.width}×${f.height} statt ${width}×${height}`);
    }
    return res.frames;
  } catch (err) {
    rwPending.delete(id);
    if (pngs.length && pngs[0].buf.byteLength === 0) throw err;   // nach echtem Transfer kein Rückfall
    return onMain();
  }
}

async function fetchRvTar(ts: string, signal?: AbortSignal, priority?: RequestPriority): Promise<RvNowcast> {
  // RD3: gegatterte Slots zuerst als fertige Frames (kein bz2, kein Tar-Dekode);
  // jeder Fehlschlag fällt still auf den Tar-Weg zurück.
  if (rvImgEligible(ts)) {
    const viaImg = await fetchRvFromImg(ts, signal, priority);
    if (viaImg) { _lastRvVia = 'img'; return viaImg; }
  }
  // RD2: die Wegwahl (CDN vs. Netlify) liegt in `fetchRvBytesCached`/`rvTarUrlFor`
  // — der Frühstart in `radolanRuns.ts` nimmt denselben Resolver.
  const tarBytes = await decompress(await fetchRvBytesCached(ts, signal, priority));
  const { runAtMs, frames: decoded } = await decodeRvTarOffMain(tarBytes);
  const frames: RvFrame[] = decoded.map((f) => ({
    leadMinutes: f.leadMinutes,
    validAt: new Date(f.validAtMs),
    values: f.values,
    width: f.width,
    height: f.height,
  }));
  return { runAt: new Date(runAtMs), frames, corners: DE1200_CORNERS };
}

/**
 * Lädt den jüngsten kompletten RV-Lauf und rendert alle 25 Frames vor.
 * Robust gegen einen noch hochladenden jüngsten Lauf: bei Fehler wird der
 * vorherige Zeitstempel versucht.
 */
export async function fetchRvNowcast(signal?: AbortSignal, opts?: RvFetchOptions): Promise<RvNowcast> {
  // Entdopplung: Karte und Punktforecast fragen beim Mount gleichzeitig (§24.3).
  return shareInFlight('radolan-rv-nowcast', () => loadRvNowcast(opts?.priority), signal);
}

/** LE2/H7: Netzpriorität des Tar-Abrufs — `'low'` für die Nachbarquelle (AT/CH-Ort). */
export interface RvFetchOptions { priority?: RequestPriority }

/**
 * Der eigentliche Lauf hinter der Entdopplung. Bekommt bewusst KEIN
 * Aufrufer-Signal (s. `shareInFlight`): er gehört allen Wartenden gemeinsam,
 * also darf ihn keiner allein abbrechen. Die Kandidatenliste ist dafür kurz
 * gehalten — 3 gerechnete Läufe, dann einmal das Listing.
 */
async function loadRvNowcast(priority?: RequestPriority): Promise<RvNowcast> {
  let lastErr: unknown;
  const attempt = async (runs: string[]): Promise<RvNowcast | null> => {
    for (const ts of runs) {
      try {
        const result = await fetchRvTar(ts, undefined, priority);
        _runCache = { ts, at: Date.now() };
        // Welche RADOLAN-RV-Datei wird gerade auf die Karte gerendert?
        console.log(
          `[buscosun] Niederschlag-Layer → RADOLAN-RV-Datei: DE1200_RV${ts}.tar.bz2` +
          ` · Lauf ${result.runAt.toLocaleString('de-DE')} · ${result.frames.length} Frames (0…+120 min)` +
          ` · Quelle ${_lastRvVia === 'img' ? 'Daten-Repo (PNG)' : _lastRvVia === 'cdn' ? 'Daten-Repo (jsDelivr)' : 'DWD (Netlify)'}`,
        );
        return result;
      } catch (err) {
        lastErr = err;
      }
    }
    return null;
  };

  // 1) bekannter Lauf aus der letzten Minute · 2) gerechnete Kandidaten ·
  // 3) das Verzeichnis-Listing als benannter Fallback.
  const known = _runCache && Date.now() - _runCache.at < RUN_CACHE_TTL ? [_runCache.ts] : [];
  const result = (known.length ? await attempt(known) : null)
    ?? await attempt(guessRvRuns(RV_GUESS_TRIES))
    ?? await attempt((await listRvRuns()).slice(0, 2));
  if (result) return result;
  throw lastErr ?? new Error('RADOLAN-RV: Lauf konnte nicht geladen werden');
}

/** Eine beobachtete RADOLAN-Analyse (der _000-Frame eines RV-Laufs). */
export interface RvAnalysisFrame { validAt: Date; values: Uint8Array; width: number; height: number }

/**
 * Lädt die letzten `count` BEOBACHTETEN Analysen (je der _000-Frame der jüngsten
 * RV-Läufe, 5-Min-Abstand), aufsteigend nach Zeit. Grundlage für ein echtes,
 * nicht-zirkuläres Radar-Hindcast (aus vergangenen Beobachtungen vorhersagen und
 * gegen die spätere Beobachtung verifizieren — DWD-Forecast wird NICHT als
 * Wahrheit genutzt). Reuset den RV-Tar-Cache.
 */
export async function fetchRvAnalysisSequence(count: number, signal?: AbortSignal): Promise<{ frames: RvAnalysisFrame[]; corners: QuadCorners }> {
  const frames: RvAnalysisFrame[] = [];
  const take = async (runs: string[]): Promise<void> => {
    for (const ts of runs) {
      if (frames.length >= count) return;
      // RD3: für den Rückblick reicht der Analyse-Frame — 8–9 × f000.png (~30 KB)
      // statt 8 Voll-Tars (2,28 MiB gemessen); je Stempel Tar-Fallback.
      if (rvImgEligible(ts)) {
        const viaImg = await fetchRvAnalysisFromImg(ts, signal);
        if (viaImg) { frames.push(viaImg); continue; }
      }
      try {
        const nc = await fetchRvTar(ts, signal); // Tar-Cache greift; _000 = Analyse
        const a = nc.frames.find((f) => f.leadMinutes === 0);
        if (a) frames.push({ validAt: a.validAt, values: a.values, width: a.width, height: a.height });
      } catch (err) {
        if (signal?.aborted) throw err;         // Abbruch beendet die Reihe sofort
        /* Lauf evtl. noch im Upload → überspringen */
      }
    }
  };

  // Gerechnete Zeitstempel statt Listing (BW-5, s. `guessRvRuns`); ein Kandidat
  // mehr als gebraucht, damit ein noch nicht veröffentlichter jüngster Lauf die
  // Reihe nicht verkürzt. Das Listing bleibt der benannte Fallback.
  await take(guessRvRuns(count + 1));
  if (frames.length < 3) await take((await listRvRuns(signal)).slice(0, count + 1));
  if (frames.length < 3) throw new Error('RADOLAN-RV: zu wenige Analysen für ein Hindcast');
  frames.sort((a, b) => a.validAt.getTime() - b.validAt.getTime()); // aufsteigend
  return { frames, corners: DE1200_CORNERS };
}

/**
 * Lädt den jüngsten RY-Live-Frame (ungeeichte 5-Min-Analyse, Legacy-900×900).
 * Aktuell nicht im Slider verdrahtet — der RV-_000-Frame liefert die Live-
 * Analyse bereits auf dem DE1200-Gitter. Exportiert für eine spätere
 * eigenständige Live-Radar-Variante.
 */
export async function fetchRyLatest(signal?: AbortSignal): Promise<RadolanGrid> {
  const res = await fetch(RY_LATEST, { signal });
  if (!res.ok) throw new Error(`RADOLAN-RY: ${res.status}`);
  return decodeRadolanRaw(await decompress(await res.arrayBuffer()));
}
