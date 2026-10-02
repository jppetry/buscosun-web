/**
 * RD3 — Vertrag des Bild-Spiegels: Radar als fertig aufbereitete Dateien im Daten-Repo
 * (`audit/radar-datenrepo.md` §14). EINE Datei für Client, Producer (`scripts/radar-mirror/
 * radar-derive.mjs`) und Verifier (`verify:radar-repack`): Pfade, Meta-Schema samt Bauern
 * und Prüfern, Zeit-Gates, Kill-Switch.
 *
 * Ablage (versionierter Pfad — eine Format-Änderung bumpt `v1` → `v2`, alte Clients sehen
 * saubere 404 und fallen auf den Rohweg zurück):
 *   radar/img/v1/rv/<YYMMDDHHMM>/f000.png … f120.png + meta.json   (25 Graustufen-PNG 1100×1200)
 *                                 + m<lead>.png je volle Stunde nach dem Slot (E-AX-16, seit 02.10.2026: RGB-Summenbild der
 *                                   Frames in (t − 60 min, t], `meta.hourMeans`; Vertrag `RvImgHourMean`, Producer-Seite
 *                                   `radarImgHourMean.ts`, Umkehrung `point/nowcastFormat.ts`)
 *   radar/img/v1/inca/<YYYYMMDDTHHMM>/f015.png … f180.png + meta.json (12 PNG 701×431)
 *   radar/img/v1/rzc/<YYYYMMDDTHHMM>/frame.png + meta.json            (1 PNG 710×640)
 *   radar/img/v1/konrad3d/<YYYYMMDDTHHMM00>/cells.json                (Konrad3dRun, schema-versioniert)
 *
 * Die PNGs tragen exakt die `precipToU8`-Bytes des jeweiligen Decoders (byte-verlustfrei für
 * alle Verbraucher, §14: die App hält Niederschlag nirgends feiner als u8/vMax 20). Meta trägt
 * `vMax` als Drift-Wächter: weicht es von `PRECIP_VMAX` ab, lehnt der Client den Slot ab.
 *
 * Gates (Sticky-404-Regel wie RD2): die abgeleiteten Dateien erscheinen NACH dem Rohspiegel
 * (Derive ≈ 2 s, gemessen §14.1) — das RV-Bild-Gate liegt deshalb über dem Tar-Gate.
 */

import { PRECIP_VMAX, type QuadCorners } from '../scalar/RainLayer';
import { decodeGrayPng, GrayPngUnsupported } from './grayPng';
import {
  RADAR_CDN_BASE, RADAR_IMG_BASE, RADAR_IMG_VERSION, RV_IMG_GATE_MS,
  radarImgFrameFile, radarImgFlagFrom, radarImgEnabled, rvImgDir, rvImgEligible,
} from './radolanRuns';

// Die RV-/Schalter-/Gate-Primitiven leben in `radolanRuns.ts` (abhängigkeitsfrei,
// Router-Frühstart) — hier nur re-exportiert, damit Producer und Verifier EINE
// Vertragsadresse haben.
export {
  RADAR_IMG_BASE, RADAR_IMG_VERSION, RV_IMG_GATE_MS,
  radarImgFrameFile, radarImgFlagFrom, radarImgEnabled, rvImgDir, rvImgEligible,
};

export const RV_IMG_WIDTH = 1100;
export const RV_IMG_HEIGHT = 1200;
/** RV-Leads in Minuten: 0…120 je 5 (25 Frames — der +2-h-Horizont bleibt). */
export const RV_IMG_LEADS: readonly number[] = Object.freeze(Array.from({ length: 25 }, (_, i) => i * 5));

export const INCA_IMG_WIDTH = 701;
export const INCA_IMG_HEIGHT = 431;
/**
 * INCA-Leads in Minuten: 15…180 je 15 — NOMINELL 12 Frames, aber die API liefert je nach
 * Lauf-Alter auch weniger (11 gemessen, 0 ist der V-RL-2-Ausfall). Das Meta trägt deshalb
 * die TATSÄCHLICHEN Leads; der Prüfer verlangt nur das 15-min-Raster, aufsteigend, ≥ 1.
 */
export const INCA_IMG_LEADS: readonly number[] = Object.freeze(Array.from({ length: 12 }, (_, i) => (i + 1) * 15));

export const RZC_IMG_WIDTH = 710;
export const RZC_IMG_HEIGHT = 640;

// --- Zeit-Gates (Client) -----------------------------------------------------------------------
/** KONRAD-JSON liegt im selben Push wie das XML (Derive < 10 ms) — dasselbe Gate wie RD2. */
export const KONRAD_IMG_GATE_MS = 330_000;

// --- Stempel -----------------------------------------------------------------------------------

const two = (n: number) => String(n).padStart(2, '0');

/** INCA/rzc-Slot-Stempel `YYYYMMDDTHHMM` (UTC). */
export function radarImgStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
}

/** Umkehrung von `radarImgStamp`; NaN bei fremdem Format. */
export function radarImgStampToMs(s: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/.exec(s);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

// --- Pfade -------------------------------------------------------------------------------------

export function incaImgDir(stamp: string): string {
  return `${RADAR_IMG_BASE}/inca/${stamp}`;
}

export function rzcImgDir(stamp: string): string {
  return `${RADAR_IMG_BASE}/rzc/${stamp}`;
}

/** KONRAD-JSON; `stamp` ist der XML-Stempel `YYYYMMDDTHHMM00`. */
export function konradImgUrl(stamp: string): string {
  return `${RADAR_IMG_BASE}/konrad3d/${stamp}/cells.json`;
}

// --- Meta-Schema (schema 1) --------------------------------------------------------------------

export interface RadarImgFrame {
  lead: number; file: string; bytes: number;
  /** RV: Gültigkeitszeit des Frames aus dem Tar (die Verbraucher rechnen ohnehin runAt + lead). */
  validAtMs?: number;
}

/**
 * E-AX-16 (`audit/fusion-ausbau.md` §6m): das Stundenmittel als eigene Datei je voller Stunde t nach dem Slot.
 * `lead` = Minuten Slot → t, `leadFrom…leadTo` = die gemittelten Frame-Leads (Fenster (lead − 60, lead] ∩ Slot),
 * `frames` = ihre Zahl (≥ 6, sonst gibt es die Datei nicht). RGB-PNG: R·256 + G = Summe der Rohbytes, B = Zahl der
 * gesättigten Frames — exakt, keine zweite Quantisierung (Umkehrung `nowcastHourMeanFromSum`, `point/nowcastFormat.ts`).
 */
export interface RvImgHourMean {
  lead: number; file: string; bytes: number; frames: number; leadFrom: number; leadTo: number;
}

export interface RvImgMeta {
  schema: 1; source: 'rv'; stamp: string; runAtMs: number;
  width: number; height: number; vMax: number;
  frames: RadarImgFrame[];
  /** E-AX-16: Zusatzfeld seit 02.10.2026 — Slots davor haben es nicht; alte Clients ignorieren es. */
  hourMeans?: RvImgHourMean[];
}

export interface IncaImgMeta {
  schema: 1; source: 'inca'; stamp: string; fetchedAtMs: number;
  width: number; height: number; vMax: number;
  corners: QuadCorners;
  frames: RadarImgFrame[]; // lead in Minuten (15…180)
}

export interface RzcImgMeta {
  schema: 1; source: 'rzc'; stamp: string; validAtMs: number | null;
  width: number; height: number; vMax: number;
  corners: QuadCorners;
  frames: RadarImgFrame[]; // genau eines, lead 0, file 'frame.png'
}

export function makeRvImgMeta(stamp: string, runAtMs: number, frames: RadarImgFrame[], hourMeans?: RvImgHourMean[]): RvImgMeta {
  return {
    schema: 1, source: 'rv', stamp, runAtMs, width: RV_IMG_WIDTH, height: RV_IMG_HEIGHT, vMax: PRECIP_VMAX, frames,
    ...(hourMeans ? { hourMeans } : {}),
  };
}

/** E-AX-16: Form der Stundenmittel-Einträge — Datei = `m<lead>.png`, Fenster und Zahl stimmig, Leads im Slot (0…180). */
function hourMeansOk(v: unknown): v is RvImgHourMean[] {
  if (!Array.isArray(v)) return false;
  let prev = -1;
  return v.every((x) => {
    const h = x as RvImgHourMean;
    const ok = h && typeof h === 'object'
      && Number.isInteger(h.lead) && h.lead > prev && h.lead > 0 && h.lead <= 180
      && h.file === `m${String(h.lead).padStart(3, '0')}.png`
      && Number.isFinite(h.bytes) && h.bytes > 0
      && Number.isInteger(h.frames) && h.frames >= 1 && h.frames <= 25
      && Number.isInteger(h.leadFrom) && Number.isInteger(h.leadTo) && h.leadFrom >= 0 && h.leadTo <= 120
      && h.leadFrom <= h.leadTo && h.leadTo <= h.lead && h.leadFrom > h.lead - 60
      && (h.leadTo - h.leadFrom) / 5 + 1 === h.frames;
    prev = h?.lead ?? prev;
    return ok;
  });
}

export function makeIncaImgMeta(stamp: string, fetchedAtMs: number, corners: QuadCorners, frames: RadarImgFrame[]): IncaImgMeta {
  return { schema: 1, source: 'inca', stamp, fetchedAtMs, width: INCA_IMG_WIDTH, height: INCA_IMG_HEIGHT, vMax: PRECIP_VMAX, corners, frames };
}

export function makeRzcImgMeta(stamp: string, validAtMs: number | null, corners: QuadCorners, bytes: number): RzcImgMeta {
  return {
    schema: 1, source: 'rzc', stamp, validAtMs, width: RZC_IMG_WIDTH, height: RZC_IMG_HEIGHT, vMax: PRECIP_VMAX,
    corners, frames: [{ lead: 0, file: 'frame.png', bytes }],
  };
}

function framesOk(v: unknown, leads: readonly number[]): v is RadarImgFrame[] {
  if (!Array.isArray(v) || v.length !== leads.length) return false;
  return v.every((f, i) => f && typeof f === 'object'
    && (f as RadarImgFrame).lead === leads[i]
    && typeof (f as RadarImgFrame).file === 'string' && /^[a-z0-9_.-]+\.png$/.test((f as RadarImgFrame).file)
    && Number.isFinite((f as RadarImgFrame).bytes) && (f as RadarImgFrame).bytes > 0);
}

/** INCA: 1…12 Frames auf dem 15-min-Raster, streng aufsteigend, Datei = Lead. */
function incaFramesOk(v: unknown): v is RadarImgFrame[] {
  if (!Array.isArray(v) || v.length < 1 || v.length > INCA_IMG_LEADS.length) return false;
  let prev = 0;
  return v.every((f) => {
    const x = f as RadarImgFrame;
    const ok = x && typeof x === 'object'
      && Number.isFinite(x.lead) && x.lead > prev && x.lead % 15 === 0 && x.lead <= 180
      && x.file === `f${String(x.lead).padStart(3, '0')}.png`
      && Number.isFinite(x.bytes) && x.bytes > 0;
    prev = (x as RadarImgFrame)?.lead ?? prev;
    return ok;
  });
}

function cornersOk(v: unknown): v is QuadCorners {
  return Array.isArray(v) && v.length === 4
    && v.every((c) => Array.isArray(c) && c.length === 2 && c.every((x) => Number.isFinite(x)));
}

/**
 * Strenger Prüfer je Quelle — die EINE Ablehnungsstelle des Clients (Drift-Wächter:
 * `vMax`/Maße müssen den Client-Konstanten entsprechen, sonst gilt der Slot als unlesbar
 * und der benannte Rohweg übernimmt).
 */
export function parseRvImgMeta(j: unknown): RvImgMeta | null {
  const m = j as RvImgMeta | null;
  if (!m || m.schema !== 1 || m.source !== 'rv') return null;
  if (m.width !== RV_IMG_WIDTH || m.height !== RV_IMG_HEIGHT || m.vMax !== PRECIP_VMAX) return null;
  if (typeof m.stamp !== 'string' || !Number.isFinite(m.runAtMs)) return null;
  if (!framesOk(m.frames, RV_IMG_LEADS)) return null;
  // E-AX-16: das Zusatzfeld ist optional (Slots vor dem 02.10.2026 haben es nicht) — ist es da, muss es stimmen.
  if (m.hourMeans !== undefined && !hourMeansOk(m.hourMeans)) return null;
  return m;
}

export function parseIncaImgMeta(j: unknown): IncaImgMeta | null {
  const m = j as IncaImgMeta | null;
  if (!m || m.schema !== 1 || m.source !== 'inca') return null;
  if (m.width !== INCA_IMG_WIDTH || m.height !== INCA_IMG_HEIGHT || m.vMax !== PRECIP_VMAX) return null;
  if (typeof m.stamp !== 'string' || !Number.isFinite(m.fetchedAtMs) || !cornersOk(m.corners)) return null;
  if (!incaFramesOk(m.frames)) return null;
  return m;
}

export function parseRzcImgMeta(j: unknown): RzcImgMeta | null {
  const m = j as RzcImgMeta | null;
  if (!m || m.schema !== 1 || m.source !== 'rzc') return null;
  if (m.width !== RZC_IMG_WIDTH || m.height !== RZC_IMG_HEIGHT || m.vMax !== PRECIP_VMAX) return null;
  if (typeof m.stamp !== 'string' || !cornersOk(m.corners)) return null;
  if (m.validAtMs !== null && !Number.isFinite(m.validAtMs)) return null;
  if (!framesOk(m.frames, [0]) || m.frames[0].file !== 'frame.png') return null;
  return m;
}

/** KONRAD-Umschlag: `{ schema: 1, run: Konrad3dRun }` — jede Parser-Ausgabe-Änderung bumpt schema. */
export function parseKonradImgJson(j: unknown): { refMs: number; file: string; cells: unknown[] } | null {
  const env = j as { schema?: unknown; run?: { refMs?: unknown; file?: unknown; cells?: unknown } } | null;
  if (!env || env.schema !== 1 || !env.run) return null;
  const run = env.run;
  if (!Number.isFinite(run.refMs) || typeof run.file !== 'string' || !Array.isArray(run.cells)) return null;
  return run as { refMs: number; file: string; cells: unknown[] };
}

// --- Geteilte Browser-Helfer (Client-Leseweg) --------------------------------------------------

/** Markierter 404/403 — „noch nicht gespiegelt/schon gepruned" ist eine Antwort, kein harter Fehler. */
export class RadarImg404 extends Error {}

// --- NL-2: Ausweichweg raw.githubusercontent (audit/niederschlag-ladezeit.md) ------------------
// jsDelivr liefert frische Radar-Dateien kalt manchmal gar nicht: Abrufe hängen > 8 s oder kommen
// als 403 (am 01.10. gemessen, festgehalten am Edge). Weil der Bild-Weg alle 26 Dateien eines
// Slots braucht, verwarf EINE solche Datei den Slot, und der rohe Tar (seit HDF5 9,6 MB) kam.
// Dasselbe Muster wie der Punkt-Leser seit V-FI-5 (`fallbackStore`, point/client/store.ts):
// dieselbe Datei von raw.githubusercontent.com (CORS *, gemessen 0,27–0,35 s TTFB) — als Hedge,
// wenn das CDN nach 2,5 s keine Kopfzeilen geschickt hat, sofort bei 403/5xx/Netzfehler.
// Ein 404 heißt „gibt es nicht" und bleibt eins. Schalter `?radarraw=0|1` / `localStorage.radarraw`.
export const RADAR_RAW_BASE = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main/radar';
/** p95 der gemessenen MISS-TTFB (AP0/AP1) — wie `RAW_FALLBACK_HEDGE_MS` des Punkt-Lesers. */
export const RADAR_RAW_HEDGE_MS = 2_500;

/** Kill-Switch des Ausweichwegs: `?radarraw=0|1` schlägt `localStorage.radarraw` (D-31). */
export function radarRawFlagFrom(
  search: string = typeof location !== 'undefined' ? location.search : '',
  stored?: string | null,
): boolean {
  let q: string | null = null;
  try { q = new URLSearchParams(search).get('radarraw'); } catch { /* kaputte Query = kein Votum */ }
  if (q === '0') return false;
  if (q === '1') return true;
  let s = stored;
  if (s === undefined) {
    try { s = typeof localStorage !== 'undefined' ? localStorage.getItem('radarraw') : null; } catch { s = null; }
  }
  return s !== '0';
}

/** Dieselbe Datei auf raw.githubusercontent — `null` für jede andere Basis oder mit Schalter aus. */
export function radarRawUrl(url: string): string | null {
  if (!url.startsWith(`${RADAR_CDN_BASE}/`) || !radarRawFlagFrom()) return null;
  return RADAR_RAW_BASE + url.slice(RADAR_CDN_BASE.length);
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

/**
 * CDN-Abruf mit 404-Markierung und Ausweichweg (NL-2); harte Fehler auf BEIDEN Wegen werfen normal
 * (⇒ Sitzungs-Latch beim Aufrufer), „nicht da" (404/403 überall) wirft `RadarImg404`.
 * `started` = eine schon laufende Antwort desselben URL (Router-Frühstart, `takeWarmRvTar`) — sie
 * steht unter derselben Frist (`signal`) und demselben Hedge wie ein eigener Abruf (NL-1).
 * Die Antwort ist gepuffert: auch ihr Körper ist innerhalb der Frist gelesen.
 */
export function fetchImgRes(url: string, signal?: AbortSignal, priority?: RequestPriority, started?: Promise<Response>): Promise<Response> {
  const raw = radarRawUrl(url);
  const init = (s: AbortSignal): RequestInit => ({ signal: s, ...(priority ? { priority } : {}) } as RequestInit);
  const acP = new AbortController();
  const acF = new AbortController();
  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let won = false;          // ein Weg hat geantwortet; sein Körper wird gerade gelesen
    let fbStarted = false;
    let pErr: unknown = null;
    let fErr: unknown = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onAbort = () => {
      acP.abort(signal?.reason); acF.abort(signal?.reason);
      finish(() => reject(abortReason(signal!)));
    };
    function finish(fn: () => void): void {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn();
    }
    const notThere = (e: unknown) => e instanceof RadarImg404;
    // Beide Wege gescheitert (oder der Ausweichweg gar nicht möglich) ⇒ entscheiden, was gemeldet wird.
    const settleFailure = () => {
      if (!pErr || (fbStarted && !fErr)) return;
      if (!fbStarted || (notThere(pErr) && notThere(fErr))) { finish(() => reject(pErr)); return; }
      // Ein Weg „nicht da", der andere hart gescheitert ⇒ der harte Fehler zählt (Latch wie bisher).
      finish(() => reject(notThere(pErr) ? fErr : pErr));
    };
    // Gewinner puffern (der Körper liegt dann innerhalb der Frist), Verlierer abbrechen.
    const win = (res: Response, loser: AbortController) => {
      if (settled || won) return;
      won = true;
      loser.abort(new Error(`hedge: anderer Weg war schneller: ${url}`));
      res.arrayBuffer().then(
        (buf) => finish(() => resolve(new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers }))),
        (e) => finish(() => reject(e)),
      );
    };
    const startFallback = (): boolean => {
      if (!raw || fbStarted || settled) return false;
      fbStarted = true;
      fetch(raw, init(acF.signal)).then(
        (res) => {
          if (settled || won) return;
          if (res.ok) { win(res, acP); return; }
          fErr = res.status === 404 || res.status === 403 ? new RadarImg404(`${res.status} ${raw}`) : new Error(`${res.status} ${raw}`);
          settleFailure();
        },
        (e) => { if (settled || won) return; fErr = e; settleFailure(); },
      );
      return true;
    };

    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }
    if (raw) timer = setTimeout(() => { timer = null; startFallback(); }, RADAR_RAW_HEDGE_MS);
    (started ?? fetch(url, init(acP.signal))).then(
      (res) => {
        if (settled || won) return;
        if (timer) { clearTimeout(timer); timer = null; }   // Kopfzeilen da: kein Hedge mehr
        if (res.ok) { win(res, acF); return; }
        if (res.status === 404) {                          // gibt es nicht ⇒ sofort, ohne Ausweichweg
          acF.abort(new Error(`404 am CDN: ${url}`));
          finish(() => reject(new RadarImg404(`404 ${url}`)));
          return;
        }
        pErr = res.status === 403 ? new RadarImg404(`403 ${url}`) : new Error(`${res.status} ${url}`);
        startFallback();   // ohne Ausweichweg (Schalter/fremde Basis) entscheidet settleFailure sofort
        settleFailure();
      },
      (e) => {
        if (settled || won) return;
        if (timer) { clearTimeout(timer); timer = null; }
        pErr = e;
        startFallback();   // ohne Ausweichweg (Schalter/fremde Basis) entscheidet settleFailure sofort
        settleFailure();
      },
    );
  });
}

/**
 * Graustufen-PNG des Spiegels → exakt die `precipToU8`-Bytes des jeweiligen Decoders
 * (byte-verlustfrei, `verify:radar-repack` B).
 *
 * Zuerst der DIREKTE Dekoder (`grayPng.ts`): er liefert 1 Byte je Pixel, ohne den
 * RGBA-Umweg des Canvas — am echten 1100×1200-Frame gemessen **206 ms statt 627 ms**
 * (Faktor 3; über 25 Frames 1,8 s statt 5,4 s Hauptthread). Kann er die Datei nicht
 * (fremde Bauart), übernimmt der Canvas-Weg als benannter Rückfall — dieselbe
 * `colorSpaceConversion/premultiplyAlpha: 'none'`-Regel wie im Repack-Leser, weil
 * eine Farbraum-Konversion still Werte verschöbe.
 */
export async function loadRadarGrayPng(res: Response, width: number, height: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(await res.arrayBuffer());
  try {
    const g = await decodeGrayPng(bytes);
    if (g.width !== width || g.height !== height) throw new Error(`PNG-Maße ${g.width}×${g.height} statt ${width}×${height}`);
    return g.values;
  } catch (err) {
    if (!(err instanceof GrayPngUnsupported)) throw err;   // Maß-/Datenfehler bleiben Fehler
  }
  return loadRadarGrayPngViaCanvas(bytes, width, height);
}

/** Benannter Rückfall (Rule 2): der Canvas-Weg des ICON-Repacks. */
async function loadRadarGrayPngViaCanvas(bytes: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([bytes as BlobPart]), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  try {
    if (bmp.width !== width || bmp.height !== height) throw new Error(`PNG-Maße ${bmp.width}×${bmp.height} statt ${width}×${height}`);
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('kein 2d-Kontext');
    ctx.drawImage(bmp, 0, 0);
    const img = ctx.getImageData(0, 0, width, height);
    const out = new Uint8Array(width * height);
    for (let i = 0; i < out.length; i++) out[i] = img.data[i * 4];
    return out;
  } finally { bmp.close(); }
}
