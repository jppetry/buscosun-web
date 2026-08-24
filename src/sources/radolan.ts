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

const RV_DIR = '/_dwd_opendata/weather/radar/composite/rv/';
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
const RV_STEP_MIN = 5;
const RV_PUBLISH_LAG_MIN = 3.3;
/** Kandidaten, die vor dem Listing-Fallback durchprobiert werden. */
const RV_GUESS_TRIES = 3;

/** Zeitstempel `YYMMDDHHMM` (UTC) eines RV-Laufs. */
function rvStamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return p(d.getUTCFullYear() % 100) + p(d.getUTCMonth() + 1) + p(d.getUTCDate())
    + p(d.getUTCHours()) + p(d.getUTCMinutes());
}

/**
 * Die `count` jüngsten plausiblen Lauf-Zeitstempel, absteigend — GERECHNET,
 * ohne Netz. Exportiert, weil der Verifier sie gegen das echte Verzeichnis
 * prüft (`verify:radar-runs`).
 */
export function guessRvRuns(count: number, nowMs: number = Date.now()): string[] {
  const stepMs = RV_STEP_MIN * 60_000;
  const newest = Math.floor((nowMs - RV_PUBLISH_LAG_MIN * 60_000) / stepMs) * stepMs;
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(rvStamp(new Date(newest - i * stepMs)));
  return out;
}

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
const RV_TAR_CACHE = 'radolan-rv-tar-v1';
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
async function fetchRvBytesCached(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const cache = await rvCache();
  if (cache) { const hit = await cache.match(url); if (hit) return hit.arrayBuffer(); }
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`RADOLAN-RV ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  if (cache) { cache.put(url, new Response(buf.slice(0))).then(() => pruneRvCache(cache)).catch(() => {}); }
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

async function fetchRvTar(ts: string, signal?: AbortSignal): Promise<RvNowcast> {
  const url = `${RV_DIR}DE1200_RV${ts}.tar.bz2`;
  const tarBytes = await decompress(await fetchRvBytesCached(url, signal));
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
export async function fetchRvNowcast(signal?: AbortSignal): Promise<RvNowcast> {
  // Entdopplung: Karte und Punktforecast fragen beim Mount gleichzeitig (§24.3).
  return shareInFlight('radolan-rv-nowcast', () => loadRvNowcast(), signal);
}

/**
 * Der eigentliche Lauf hinter der Entdopplung. Bekommt bewusst KEIN
 * Aufrufer-Signal (s. `shareInFlight`): er gehört allen Wartenden gemeinsam,
 * also darf ihn keiner allein abbrechen. Die Kandidatenliste ist dafür kurz
 * gehalten — 3 gerechnete Läufe, dann einmal das Listing.
 */
async function loadRvNowcast(): Promise<RvNowcast> {
  let lastErr: unknown;
  const attempt = async (runs: string[]): Promise<RvNowcast | null> => {
    for (const ts of runs) {
      try {
        const result = await fetchRvTar(ts);
        _runCache = { ts, at: Date.now() };
        // Welche RADOLAN-RV-Datei wird gerade auf die Karte gerendert?
        console.log(
          `[buscosun] Niederschlag-Layer → RADOLAN-RV-Datei: DE1200_RV${ts}.tar.bz2` +
          ` · Lauf ${result.runAt.toLocaleString('de-DE')} · ${result.frames.length} Frames (0…+120 min)`,
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
