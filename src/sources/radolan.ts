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
import type { QuadCorners } from '../scalar/RainLayer';
import { decodeRadolanRaw, decodeRvTar, type RadolanGrid, type DecodedRvFrame } from './radolanDecode';

const RV_DIR = '/_dwd_opendata/weather/radar/composite/rv/';
const RY_LATEST =
  '/_dwd_opendata/weather/radar/radolan/ry/raa01-ry_10000-latest-dwd---bin.bz2';

export const RADOLAN_RV_ATTRIBUTION =
  'Nowcast: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD RADOLAN-RV</a> · CC BY 4.0';

/**
 * Exakte WGS84-Eckkoordinaten des DE1200-Gitters (aus den ODIM-`/where`-
 * Attributen der RY-HDF5, die auf demselben Gitter wie RV liegt). Reihenfolge
 * für MapLibres `image`-Source: [top-left, top-right, bottom-right, bottom-left]
 * = [NW, NE, SE, SW]. Norden ist oben (wir flippen die Zeilen beim Dekodieren).
 *
 * Das Gitter ist polar-stereografisch (lat_0=90, lat_ts=60, lon_0=10, WGS84);
 * MapLibre warpt linear zwischen den Ecken, was eine minimale Scherung im
 * Inneren erzeugt — bei DACH-Zoom Sub-Pixel.
 */
export const DE1200_CORNERS: [
  [number, number], [number, number], [number, number], [number, number],
] = [
  [1.46330151, 55.86208711],   // NW / top-left
  [18.73161645, 55.84543856],  // NE / top-right
  [16.58086935, 45.68460578],  // SE / bottom-right
  [3.566994635, 45.69642538],  // SW / bottom-left
];

// ---------------------------------------------------------------------------
// Polar-stereografische Verortung des DE1200-Gitters (WGS84, lat_ts=60, lon_0=10).
//
// Das Gitter wird sonst nur über die 4 Geo-Ecken linear in Web-Mercator gezogen.
// Die Breitenkreise des PS-Gitters sind aber gekrümmt → der naive 4-Eck-Warp
// verschiebt Zellen im Inneren um bis zu ~40 km (Mittel ~15 km), wachsend von 0
// an den Ecken zu den Kantenmitten. `de1200WarpMesh` liefert ein fein unterteiltes
// Stützpunkt-Gitter, dessen Knoten EXAKT polar-stereografisch verortet sind; der
// RainLayer rendert damit ein gekrümmtes Mesh statt eines Quads (Restfehler ~40 m).
// ---------------------------------------------------------------------------
const PS_A = 6378137, PS_E = 0.081819190842622;
const PS_LON0 = 10 * Math.PI / 180, PS_PHIC = 60 * Math.PI / 180;
const psT = (phi: number) => { const es = PS_E * Math.sin(phi); return Math.tan(Math.PI / 4 - phi / 2) * Math.pow((1 + es) / (1 - es), PS_E / 2); };
const psM = (phi: number) => Math.cos(phi) / Math.sqrt(1 - PS_E * PS_E * Math.sin(phi) * Math.sin(phi));
const PS_TC = psT(PS_PHIC), PS_MC = psM(PS_PHIC);
export function psFwd(lonDeg: number, latDeg: number): [number, number] {
  const phi = latDeg * Math.PI / 180, lam = lonDeg * Math.PI / 180;
  const rho = PS_A * PS_MC * psT(phi) / PS_TC;
  return [rho * Math.sin(lam - PS_LON0), -rho * Math.cos(lam - PS_LON0)];
}
function psInv(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y), t = rho * PS_TC / (PS_A * PS_MC);
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) { const es = PS_E * Math.sin(phi); phi = Math.PI / 2 - 2 * Math.atan(t * Math.pow((1 - es) / (1 + es), PS_E / 2)); }
  return [(PS_LON0 + Math.atan2(x, -y)) * 180 / Math.PI, phi * 180 / Math.PI];
}

/** Unterteilungen des Warp-Mesh je Achse ((N+1)² Knoten). 32 → Restfehler < ~50 m. */
export const DE1200_WARP_N = 32;
let _de1200Mesh: Float32Array | null = null;
/**
 * Fein unterteiltes Warp-Mesh des DE1200-Gitters: (N+1)² lon/lat-Paare, Index
 * `(j*(N+1)+i)*2`, mit i = u (0 = West … 1 = Ost) und j = v (0 = Nord … 1 = Süd) —
 * passend zur uv-Konvention des RainLayer (uv(0,0)=NW). Knoten exakt polar-
 * stereografisch verortet. Memoisiert (Gitter ist konstant).
 */
export function de1200WarpMesh(): Float32Array {
  if (_de1200Mesh) return _de1200Mesh;
  const N = DE1200_WARP_N;
  const [NW, NE, SE, SW] = DE1200_CORNERS;
  const pNW = psFwd(NW[0], NW[1]), pNE = psFwd(NE[0], NE[1]), pSE = psFwd(SE[0], SE[1]), pSW = psFwd(SW[0], SW[1]);
  const out = new Float32Array((N + 1) * (N + 1) * 2);
  for (let j = 0; j <= N; j++) {
    const v = j / N;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      // Gitter ist in PS regulär → Knoten = bilineare Mischung der Eck-PS-Koordinaten.
      const x = (1 - u) * (1 - v) * pNW[0] + u * (1 - v) * pNE[0] + (1 - u) * v * pSW[0] + u * v * pSE[0];
      const y = (1 - u) * (1 - v) * pNW[1] + u * (1 - v) * pNE[1] + (1 - u) * v * pSW[1] + u * v * pSE[1];
      const ll = psInv(x, y);
      const k = (j * (N + 1) + i) * 2;
      out[k] = ll[0]; out[k + 1] = ll[1];
    }
  }
  _de1200Mesh = out;
  return out;
}

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
  let runs: string[];
  if (_runCache && Date.now() - _runCache.at < RUN_CACHE_TTL) {
    runs = [_runCache.ts];
  } else {
    runs = await listRvRuns(signal);
  }
  if (!runs.length) throw new Error('RADOLAN-RV: keine Läufe gefunden');

  let lastErr: unknown;
  for (const ts of runs.slice(0, 2)) {
    try {
      const result = await fetchRvTar(ts, signal);
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
  const runs = await listRvRuns(signal);
  if (runs.length < count) throw new Error(`RADOLAN-RV: nur ${runs.length} Läufe verfügbar (brauche ${count})`);
  const chosen = runs.slice(0, count); // jüngste zuerst
  const frames: RvAnalysisFrame[] = [];
  for (const ts of chosen) {
    try {
      const nc = await fetchRvTar(ts, signal); // Tar-Cache greift; _000 = Analyse
      const a = nc.frames.find((f) => f.leadMinutes === 0);
      if (a) frames.push({ validAt: a.validAt, values: a.values, width: a.width, height: a.height });
    } catch { /* Lauf evtl. noch im Upload → überspringen */ }
  }
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
