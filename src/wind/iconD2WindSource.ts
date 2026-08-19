/**
 * DWD ICON-D2 — 10-m-Wind (u_10m / v_10m) als natives 2,2-km-Gitter für den
 * Wind-Partikel-Layer der Kartenansicht.
 *
 * Ersetzt die bisherige Open-Meteo-Punktgrid-Quelle (20×16, ratenlimitiert,
 * nicht-kommerziell) durch das native DWD-ICON-D2-Gitter (reguläres lat-lon
 * 0,02°, ~2,2 km, DE + Umfeld) direkt aus den GRIB2-Rohdaten — dieselbe
 * Pipeline wie Niederschlag/Bewölkung (`iconD2Precip`/`iconD2Clouds`):
 * resolveLatestRun → fetchStepField (bz2 im Worker) → decodeGrib2.
 *
 * Wind braucht ZWEI Parameter (u + v) → wir kombinieren sie pro Schritt zu
 * einem RG-Canvas (R = u, G = v, north-up), den der WindLayer direkt als
 * Textur nutzt. Pro Frame eigene u/v-Normierung (wie die bisherige Quelle).
 * CC BY 4.0, kein API-Key.
 */

import { resolveLatestRun, fetchStepBytes, gribCorners, decodeGrib2, type GribField } from '../sources/iconD2Precip';
import { reportManifest, stateFromUpdatedAt } from '../sources/manifestHealth';
import { stepsForNowWindow } from '../sources/frameAtValidTime';
import { buildWindRgba } from './windFrameBuild';
import { blendAndRefine, type FrameNorm } from './windBlendRefine';
import type { DataTextureFormat, PackedTexture } from './glUtil';

export const ICON_D2_WIND_ATTRIBUTION =
  'Wind: <a href="https://www.dwd.de/EN/ourservices/opendata/opendata.html" ' +
  'target="_blank" rel="noopener">DWD ICON-D2</a> · CC BY 4.0';

/** Horizont-Cap (h). Wind = primär „aktuell"; naher Bereich reicht (Slider clamp).
 *  u+v verdoppeln die Fetch-Last ggü. Precip → bewusst kürzerer Horizont. */
const MAX_STEP = 12;
/** Naher Horizont, der auf dem KRITISCHEN Pfad geladen wird (0…NEAR_STEP h). Der
 *  Slider startet bei 0; diese Frames machen den Wind sofort nutzbar. Die fernen
 *  Schritte (NEAR_STEP+1…MAX_STEP) füllen danach im Hintergrund nach, ohne den
 *  Erstpaint zu blockieren. */
const NEAR_STEP = 4;
/** Schritte, die SPEKULATIV (mit dem geratenen Lauf) parallel zur ~1,9-s-
 *  Directory-Auflösung geladen werden — so ist der nahe Horizont da, ohne auf das
 *  Listing zu warten. Bei Fehlgriff (nur am Zyklusrand) werden sie verworfen. */
const SPEC_STEPS = 3;
/** Ziel-Breite nach Subsampling (das 1215er-Nativgitter ist für Partikel-Viz Overkill). */
const TARGET_WIDTH = 700;
/** Parallele Fetches (bz2-Decompress läuft im Worker-Pool). */
const CONCURRENCY = 6;

// --- Phase T1: Transportschicht (nur Wind) --------------------------------
/** Durable-gecachter Edge-Pfad für die immutablen Wind-(Lauf,Step)-Dateien.
 *  In Prod/`netlify dev` bedient die Edge Function `netlify/edge-functions/
 *  dwd-wind.ts` diesen Pfad (durable Edge-Cache); in `vite dev` ein dünner
 *  Pass-Through-Proxy. Precip/Clouds/Temp bleiben unberührt auf `/_dwd_opendata`. */
const WIND_GRIB_BASE = '/_dwd_wind/weather/nwp/icon-d2/grib';
/** Warm-Manifest (winzig, same-origin, vom Warm-Cron umgelegt). Nennt den zuletzt
 *  vollständig gewärmten Lauf + dessen Schritte → der Client fragt AUSSCHLIESSLICH
 *  gewärmte Läufe an (kein Directory-Scan, kein spekulativer Fehl-Rat). */
const WIND_MANIFEST_URL = '/latest-wind.json';
/** Max. Alter des Manifest-Laufs (Referenzzeit). Jenseits davon sind die GRIB-
 *  Dateien i. d. R. auch von opendata.dwd.de verschwunden → das Manifest ist
 *  „kaputt statt stale": wir überspringen es günstig (kein 404-Sturm) und der
 *  Directory-Scan holt den AKTUELLEN Lauf (frischerer Wind statt tage-alter). Ein
 *  gesundes Manifest ist ~3,5–6,5 h alt (Publikationslag + 3-h-Rotation), 24 h
 *  lässt reichlich Luft für einen kurz ausgefallenen Warmer (stale, nie kalt). */
const MAX_MANIFEST_RUN_AGE_H = 24;

/** Rückgabeform der Lauf-Auflösung — deckungsgleich mit `resolveLatestRun`. */
interface WindRunInfo { runStr: string; runAt: Date; steps: number[]; }

/** `YYYYMMDDHH` → UTC-Date. */
function parseRunStr(run: string): Date {
  return new Date(Date.UTC(
    +run.slice(0, 4), +run.slice(4, 6) - 1, +run.slice(6, 8), +run.slice(8, 10), 0, 0, 0,
  ));
}

/**
 * Liest das Warm-Manifest (`/latest-wind.json`) und liefert den gewärmten Lauf.
 * Gibt `null` zurück, wenn kein/ungültiges Manifest vorliegt — dann fällt der
 * Aufrufer auf den bestehenden Directory-Scan-Pfad (`resolveLatestRun` +
 * Spekulation) zurück. Das ist die Graceful-Degrade-Naht in beide Richtungen:
 *  • kein Manifest (Dev vor dem ersten Warm-Lauf / Netz-Fehler) → alter Pfad;
 *  • eingefrorenes Manifest (Warmer aus) → letzter gewärmter Lauf (stale, nie kalt).
 * `cache: 'no-store'` hält den HTTP-Layer frisch; ein evtl. Service-Worker
 * (stale-while-revalidate für `.json`) serviert höchstens den letzten Lauf und
 * revalidiert — konsistent mit „stale statt slow".
 */
async function resolveWindRunFromManifest(signal?: AbortSignal): Promise<WindRunInfo | null> {
  // V-20: jeder Rückgabepfad `null` bedeutet „Manifest unbrauchbar → Directory-Scan";
  // genau das meldet `absent`. Rein additiv: die Auflösungslogik bleibt unverändert.
  const absent = (): null => { reportManifest(WIND_MANIFEST_URL, 'absent'); return null; };
  try {
    const res = await fetch(WIND_MANIFEST_URL, { signal, cache: 'no-store' });
    if (!res.ok) return absent();
    const m = await res.json() as { run?: unknown; runAt?: unknown; updatedAt?: unknown; steps?: unknown };
    if (typeof m.run !== 'string' || !/^\d{10}$/.test(m.run)) return absent();
    if (!Array.isArray(m.steps)) return absent();
    const steps = (m.steps as unknown[])
      .filter((s): s is number => Number.isInteger(s) && (s as number) >= 0)
      .sort((a, b) => a - b);
    if (steps.length === 0) return absent();
    const runAt = typeof m.runAt === 'string' ? new Date(m.runAt) : parseRunStr(m.run);
    if (Number.isNaN(runAt.getTime())) return absent();
    // Staleness-Guard: zu alter (Files-weg) oder unplausibel zukünftiger Lauf →
    // Manifest verwerfen, Directory-Scan holt den aktuellen Lauf (kein 404-Sturm
    // auf einen toten Lauf, u. a. gegen ein versehentlich committetes Altmanifest).
    const ageH = (Date.now() - runAt.getTime()) / 3_600_000;
    if (ageH > MAX_MANIFEST_RUN_AGE_H || ageH < -2) return absent();
    const upd = typeof m.updatedAt === 'string' ? new Date(m.updatedAt) : null;
    const updatedAtMs = upd && !Number.isNaN(upd.getTime()) ? upd.getTime() : null;
    reportManifest(WIND_MANIFEST_URL, stateFromUpdatedAt(updatedAtMs, Date.now()), updatedAtMs);
    return { runStr: m.run, runAt, steps };
  } catch {
    return absent();   // Netzfehler / JSON-Parse → Fallback auf Directory-Scan
  }
}

export interface IconD2WindFrame {
  validAt: Date;
  stepHours: number;
  /** RG-Canvas (R = u, G = v, north-up) als Textur-Quelle. */
  image: HTMLCanvasElement;
  width: number;
  height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
}

export interface IconD2Wind {
  runAt: Date;
  frames: IconD2WindFrame[];
  /** Equirect-UV-Bounds (x0,y0,x1,y1) der Gitterregion im globalen [0,1]². */
  uvBounds: [number, number, number, number];
}

function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }

/** RGBA-Bytes in ein 2D-Canvas übertragen (billiger Main-Thread-Schritt).
 *  willReadFrequently: jeder Frame wird potenziell mehrfach per getImageData
 *  zurückgelesen (Blend-Interpolation, decodeAndRefine) — ohne das Flag wählt
 *  Chrome eine GPU-backed Surface, die bei wiederholtem Readback stallt. */
function rgbaToCanvas(rgba: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d', { willReadFrequently: true })!.putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas;
}

/** Kombiniert ein u- und v-Feld zu einem subsampelten, north-up RG-Canvas + Normierung.
 *  Modell-unabhängig (ICON-D2-Surface wie ICON-EU-Druckfläche) → exportiert. Der
 *  teure Kern (`buildWindRgba`) ist DOM-frei und läuft für Wind off-main im Worker;
 *  hier wird das Ergebnis nur noch ins Canvas gelegt (z. B. ICON-EU-Druckwind). */
export function buildWindFrame(u: GribField, v: GribField): Omit<IconD2WindFrame, 'validAt' | 'stepHours'> {
  const b = buildWindRgba(u, v, TARGET_WIDTH);
  return { image: rgbaToCanvas(b.rgba, b.width, b.height), width: b.width, height: b.height, uMin: b.uMin, uMax: b.uMax, vMin: b.vMin, vMax: b.vMax };
}

// ---------------------------------------------------------------------------
// Wind-Frame-Decode-Pool: decodeGrib2 (u+v) + RGBA-Bau laufen off-main im Worker
// (`windFrameWorker`) — bisher pro geladenem Frame (×~26 am Kaltstart) auf dem
// Main-Thread (~2×18 ms Decode + Subsample/Encode). Fetch + bz2 bleiben beim
// bz2-Worker-Pool; hier gehen nur die ENTPACKTEN Bytes rein, ein RGBA-Puffer raus.
// Fällt transparent auf Main-Thread-Decode zurück, wenn Worker nicht verfügbar.
// ---------------------------------------------------------------------------
export interface WindBuilt {
  rgba: Uint8ClampedArray;
  width: number; height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
  corners: [[number, number], [number, number], [number, number], [number, number]];
}
interface WfMsg {
  id: number; ok: boolean; error?: string;
  rgba?: ArrayBuffer; width?: number; height?: number;
  uMin?: number; uMax?: number; vMin?: number; vMax?: number;
  corners?: WindBuilt['corners'];
}
const WF_POOL_SIZE = Math.max(1, Math.min((navigator.hardwareConcurrency || 2) - 1, 3));
let wfWorkers: Worker[] = [];
let wfUsable = true, wfInited = false, wfRr = 0, wfNextId = 1;
const wfPending = new Map<number, { resolve: (b: WindBuilt) => void; reject: (e: Error) => void }>();

function wfInit(): void {
  if (wfInited) return;
  wfInited = true;
  try {
    for (let i = 0; i < WF_POOL_SIZE; i++) {
      const w = new Worker(new URL('./windFrameWorker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<WfMsg>) => {
        const d = e.data;
        const p = wfPending.get(d.id);
        if (!p) return;
        wfPending.delete(d.id);
        if (d.ok && d.rgba) {
          p.resolve({
            rgba: new Uint8ClampedArray(d.rgba), width: d.width!, height: d.height!,
            uMin: d.uMin!, uMax: d.uMax!, vMin: d.vMin!, vMax: d.vMax!, corners: d.corners!,
          });
        } else {
          p.reject(new Error(d.error || 'wind frame worker error'));
        }
      };
      w.onerror = () => {
        // Worker-Crash (Script-/Load-Fehler): künftige Frames gehen auf den
        // Main-Thread-Fallback (wfUsable=false). In-flight-Anfragen NICHT hängen
        // lassen — ihre Bytes sind bereits transferiert (nicht rückholbar), also
        // ablehnen; loadStep überspringt den Frame dann sauber.
        wfUsable = false;
        for (const [id, p] of wfPending) { wfPending.delete(id); p.reject(new Error('wind frame worker crashed')); }
      };
      wfWorkers.push(w);
    }
  } catch {
    wfUsable = false;
    wfWorkers = [];
  }
}

/** Main-Thread-Fallback: decodiert u+v + baut RGBA lokal (wie zuvor). */
function buildWindOnMain(uBytes: Uint8Array, vBytes: Uint8Array): WindBuilt {
  const u = decodeGrib2(uBytes);
  const v = decodeGrib2(vBytes);
  const b = buildWindRgba(u, v, TARGET_WIDTH);
  return { ...b, corners: gribCorners(u) };
}

/** Decodiert u+v (entpackte GRIB-Bytes) + baut den RGBA-Frame OFF-MAIN. Die
 *  übergebenen Puffer werden an den Worker TRANSFERIERT (danach nicht mehr nutzen). */
function decodeWindFrameOffMain(uBytes: Uint8Array, vBytes: Uint8Array): Promise<WindBuilt> {
  wfInit();
  if (!wfUsable || wfWorkers.length === 0) return Promise.resolve(buildWindOnMain(uBytes, vBytes));
  const w = wfWorkers[wfRr++ % wfWorkers.length];
  const id = wfNextId++;
  return new Promise<WindBuilt>((resolve, reject) => {
    wfPending.set(id, { resolve, reject });
    try {
      w.postMessage(
        { id, uBuf: uBytes.buffer, vBuf: vBytes.buffer, targetWidth: TARGET_WIDTH },
        [uBytes.buffer, vBytes.buffer],
      );
    } catch {
      wfPending.delete(id);
      // Transfer/Worker-Post fehlgeschlagen → Main-Thread. (Puffer ggf. schon
      // detached; buildWindOnMain nutzt sie dann leer → daher hier NICHT nutzen,
      // sondern nur ablehnen, falls Bytes weg sind.)
      try { resolve(buildWindOnMain(uBytes, vBytes)); }
      catch (e) { reject(e as Error); }
    }
  });
}

/**
 * Lädt das native ICON-D2-10-m-Windgitter (u+v) des jüngsten Laufs.
 *
 * Staged/dynamisch: Der NAHE Horizont (0…NEAR_STEP h) lädt auf dem kritischen
 * Pfad und macht den Wind sofort nutzbar; die Promise löst danach auf. Die
 * FERNEN Schritte (…MAX_STEP h) füllen im HINTERGRUND nach (via `onProgress`,
 * ohne Erstpaint/Basemap zu verdrängen). Zusätzlich werden die ersten Schritte
 * SPEKULATIV parallel zur ~1,9-s-Lauf-Auflösung geladen. `onProgress` feuert pro
 * fertigem Frame; das übergebene Objekt teilt sich das wachsende `frames`-Array.
 */
export async function fetchIconD2Wind(
  signal?: AbortSignal,
  onProgress?: (partial: IconD2Wind) => void,
  /** Einmal aufgerufen, wenn AUCH der ferne Horizont im Hintergrund fertig ist —
   *  der Aufrufer kann damit genau ein Repaint auslösen (Slider-Parkposition). */
  onSettled?: () => void,
  /** `nowOnly` (Testmodus „startnow", MapView): lädt statt des vollen Horizonts
   *  NUR das Fenster von „jetzt" bis „jetzt + aheadHours" (`stepsForNowWindow`) —
   *  keine Spekulation, kein Hintergrund-Nachfüllen. `aheadHours` (Default 0)
   *  begrenzt das Vorhersagefenster; 0 = nur der Jetzt-Bracket. */
  opts?: { nowOnly?: boolean; aheadHours?: number },
): Promise<IconD2Wind> {
  const nowOnly = opts?.nowOnly === true;
  const aheadH = opts?.aheadHours ?? 0;
  const frames: IconD2WindFrame[] = [];
  let uvBounds: [number, number, number, number] | null = null;

  const loadStep = async (rs: string, ra: Date, step: number): Promise<boolean> => {
    try {
      // Nur fetch + bz2 (bz2-Worker-Pool) auf dem Aufrufer-Pfad; decodeGrib2 + der
      // RGBA-Bau laufen off-main im Wind-Frame-Worker.
      const [uBytes, vBytes] = await Promise.all([
        fetchStepBytes(rs, 'u_10m', step, signal, WIND_GRIB_BASE),
        fetchStepBytes(rs, 'v_10m', step, signal, WIND_GRIB_BASE),
      ]);
      const b = await decodeWindFrameOffMain(uBytes, vBytes);
      if (!uvBounds) {
        const c = b.corners;                    // [NW, NE, SE, SW] in [lon,lat]
        uvBounds = [lngToEquiX(c[0][0]), latToEquiY(c[0][1]), lngToEquiX(c[1][0]), latToEquiY(c[2][1])];
      }
      const image = rgbaToCanvas(b.rgba, b.width, b.height);
      frames.push({
        validAt: new Date(ra.getTime() + step * 3_600_000), stepHours: step,
        image, width: b.width, height: b.height, uMin: b.uMin, uMax: b.uMax, vMin: b.vMin, vMax: b.vMax,
      });
      frames.sort((a, b2) => a.stepHours - b2.stepHours);
      if (onProgress && uvBounds) onProgress({ runAt: ra, frames: [...frames], uvBounds });
      return true;
    } catch {
      // Einzelner Schritt fehlt (z. B. v noch nicht publiziert) → überspringen.
      return false;
    }
  };

  // Bounded-Concurrency-Pump über eine Schrittliste (bereits spekulativ geladene
  // Schritte überspringen).
  const pump = async (list: number[], rs: string, ra: Date, conc: number, skip: Set<number>) => {
    let ptr = 0;
    const workers = Array.from({ length: Math.min(conc, list.length) }, async () => {
      while (ptr < list.length) {
        if (signal?.aborted) return;
        const step = list[ptr++];
        if (skip.has(step)) continue;
        await loadStep(rs, ra, step);
      }
    });
    await Promise.all(workers);
  };

  // FALLBACK-Auflösung (kein/ungültiges/leeres Manifest): bestehender spekulativer
  // Kaltstart + Directory-Scan, UNVERÄNDERT. SPECULATIVE near-step fetch
  // (0…SPEC_STEPS-1): Dateinamen sind für einen 3-h-Zyklus deterministisch, also
  // parallel zur (~1,9 s) Directory-Auflösung statt danach. Rat = aktueller
  // 3h-Bucket MINUS ein Zyklus (voriger Bucket): ICON-D2 braucht ~3–3,5 h von der
  // Referenzzeit bis zur Publikation. Bei Fehlrat werden die spekulativen Frames
  // verworfen und aus dem aufgelösten Lauf neu geladen — nie schlechter als zuvor.
  const resolveViaScan = async (): Promise<{ runStr: string; runAt: Date; wanted: number[]; specLoaded: Set<number> }> => {
    const p2 = (n: number) => String(n).padStart(2, '0');
    const g = new Date(); g.setUTCMinutes(0, 0, 0); g.setUTCHours(g.getUTCHours() - (g.getUTCHours() % 3) - 3);
    const guessRunStr = `${g.getUTCFullYear()}${p2(g.getUTCMonth() + 1)}${p2(g.getUTCDate())}${p2(g.getUTCHours())}`;
    // Nur-Jetzt-Modus: keine spekulativen Vorab-Fetches — es sollen exakt die
    // Bracket-Schritte des AUFGELÖSTEN Laufs geladen werden, sonst nichts.
    const specSteps = nowOnly ? [] : Array.from({ length: SPEC_STEPS }, (_, i) => i);
    const specDone = Promise.all(specSteps.map((s) => loadStep(guessRunStr, g, s)));

    const resolved = await resolveLatestRun('u_10m', signal);
    const specResults = await specDone;
    const guessHit = resolved.runStr === guessRunStr;
    if (!guessHit) { frames.length = 0; uvBounds = null; }     // guess missed → drop, load normally
    // Nur ERFOLGREICH spekulierte Schritte überspringen (ein fehlender Schritt darf
    // nicht als „geladen" gelten, sonst bliebe er im nahen Horizont leer).
    const specLoaded = new Set<number>(guessHit ? specSteps.filter((_, i) => specResults[i]) : []);
    return { runStr: resolved.runStr, runAt: resolved.runAt, wanted: resolved.steps.filter((s) => s <= MAX_STEP), specLoaded };
  };

  // MANIFEST-GATE (T1.3): den zuletzt GEWÄRMTEN Lauf same-origin aus
  // `/latest-wind.json` lesen. Das ersetzt für Wind den ~1,9-s-Directory-Scan UND
  // die spekulative Lauf-Raterei: das Manifest nennt den Lauf sofort + korrekt,
  // der Client fragt ausschließlich gewärmte (Lauf,Step)-URLs an.
  const manifest = await resolveWindRunFromManifest(signal);
  let usedManifest = manifest != null;
  let { runStr, runAt, wanted, specLoaded } = manifest
    ? { runStr: manifest.runStr, runAt: manifest.runAt, wanted: manifest.steps.filter((s) => s <= MAX_STEP), specLoaded: new Set<number>() }
    : await resolveViaScan();

  // Nahen Horizont auf dem kritischen Pfad laden → Wind sofort nutzbar.
  // Nur-Jetzt-Modus: ausschließlich die zwei Schritte um die aktuelle Uhrzeit.
  if (nowOnly) wanted = stepsForNowWindow(wanted, runAt, aheadH);
  let near = nowOnly ? wanted : wanted.filter((s) => s <= NEAR_STEP);
  let far = nowOnly ? [] : wanted.filter((s) => s > NEAR_STEP);
  await pump(near, runStr, runAt, CONCURRENCY, specLoaded);

  // Robustheit / Graceful-Degrade: liefert ein (veraltetes/aus dem Cache
  // evakuiertes/auf DWD gelöschtes) Manifest KEINE Frames, ist das Manifest nur
  // eine Optimierung — einmalig transparent auf den Directory-Scan zurückfallen,
  // damit der Kaltstart NIE schlechter ist als vor T1 (auch bei einem eingefroren-
  // veralteten committeten Manifest).
  if (usedManifest && (frames.length === 0 || !uvBounds)) {
    frames.length = 0; uvBounds = null;
    usedManifest = false;
    ({ runStr, runAt, wanted, specLoaded } = await resolveViaScan());
    if (nowOnly) wanted = stepsForNowWindow(wanted, runAt, aheadH);
    near = nowOnly ? wanted : wanted.filter((s) => s <= NEAR_STEP);
    far = nowOnly ? [] : wanted.filter((s) => s > NEAR_STEP);
    await pump(near, runStr, runAt, CONCURRENCY, specLoaded);
  }

  if (!uvBounds || frames.length === 0) throw new Error('ICON-D2 Wind: keine Frames erzeugt');

  // Fernen Horizont im Hintergrund nachfüllen (reduzierte Concurrency, damit er
  // nicht mit Erstpaint/Basemap konkurriert). Aktualisiert die Ref via onProgress;
  // die Promise wartet NICHT darauf. `frames` ist geteilt → das zurückgegebene
  // Objekt wächst mit, der Slider findet ferne Frames sobald sie da sind.
  if (far.length && !signal?.aborted) {
    void pump(far, runStr, runAt, Math.min(CONCURRENCY, 3), specLoaded)
      .then(() => { if (!signal?.aborted) onSettled?.(); })
      .catch(() => {});
  } else {
    onSettled?.();
  }

  return { runAt, frames, uvBounds };
}

/** Nächster Frame zur Vorlauf-Stunde (clamp). */
export function windFrameAtHour(wind: IconD2Wind, hour: number): IconD2WindFrame {
  let best = wind.frames[0], bd = Infinity;
  for (const f of wind.frames) { const d = Math.abs(f.stepHours - hour); if (d < bd) { bd = d; best = f; } }
  return best;
}

// ---------------------------------------------------------------------------
// Zeit-Interpolation zwischen Stunden-Frames (wie Windy: „smooth scrubbing").
// Die u/v-Normierung unterscheidet sich PRO Frame → ein naives Byte-Lerp der
// RG-Canvas wäre falsch. Korrekt: beide Frames in echte m/s dekodieren, die
// Geschwindigkeiten lerpen, neu normieren+kodieren. Ergebnis-Frame wird gecacht
// (gleiche Slider-Position → kein Neuaufbau).
// ---------------------------------------------------------------------------

// Kleiner LRU statt eines Einzel-Slots: eine echte Scrub-Geste besucht beim
// Vor-/Zurück-Wischen (touch) oder minimalen Nachjustieren oft dieselben
// Bruch-Positionen erneut — ein Einzel-Slot trifft dann fast nie, ein kleiner
// LRU (8 Einträge, ~ein paar 100 KB je Eintrag) dagegen häufig.
const BLEND_LRU_MAX = 8;
const _blendCache = new Map<string, IconD2WindFrame>();
function blendCacheGet(key: string): IconD2WindFrame | undefined {
  const v = _blendCache.get(key);
  if (v) { _blendCache.delete(key); _blendCache.set(key, v); } // Recency auffrischen
  return v;
}
function blendCacheSet(key: string, frame: IconD2WindFrame): void {
  _blendCache.delete(key);
  _blendCache.set(key, frame);
  if (_blendCache.size > BLEND_LRU_MAX) {
    const oldest = _blendCache.keys().next().value;
    if (oldest !== undefined) _blendCache.delete(oldest);
  }
}

function blendWindFrames(a: IconD2WindFrame, b: IconD2WindFrame, t: number): IconD2WindFrame {
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const da = a.image.getContext('2d')!.getImageData(0, 0, a.width, a.height).data;
  const db = b.image.getContext('2d')!.getImageData(0, 0, b.width, b.height).data;
  const aUs = a.uMax - a.uMin, aVs = a.vMax - a.vMin, bUs = b.uMax - b.uMin, bVs = b.vMax - b.vMin;
  const us = new Float32Array(w * h), vs = new Float32Array(w * h);
  let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity;
  for (let jj = 0; jj < h; jj++) {
    for (let ii = 0; ii < w; ii++) {
      const ia = (jj * a.width + ii) * 4, ib = (jj * b.width + ii) * 4;
      const uA = a.uMin + (da[ia] / 255) * aUs, vA = a.vMin + (da[ia + 1] / 255) * aVs;
      const uB = b.uMin + (db[ib] / 255) * bUs, vB = b.vMin + (db[ib + 1] / 255) * bVs;
      const u = uA + (uB - uA) * t, v = vA + (vB - vA) * t;
      const o = jj * w + ii;
      us[o] = u; vs[o] = v;
      if (u < uMin) uMin = u; if (u > uMax) uMax = u; if (v < vMin) vMin = v; if (v > vMax) vMax = v;
    }
  }
  if (uMax - uMin < 0.5) { const c = (uMax + uMin) / 2; uMin = c - 0.5; uMax = c + 0.5; }
  if (vMax - vMin < 0.5) { const c = (vMax + vMin) / 2; vMin = c - 0.5; vMax = c + 0.5; }
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let o = 0; o < w * h; o++) {
    const idx = o * 4;
    img.data[idx + 0] = Math.round(((us[o] - uMin) / (uMax - uMin)) * 255);
    img.data[idx + 1] = Math.round(((vs[o] - vMin) / (vMax - vMin)) * 255);
    img.data[idx + 2] = 0;
    img.data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const validAt = new Date(a.validAt.getTime() + (b.validAt.getTime() - a.validAt.getTime()) * t);
  return { validAt, stepHours: a.stepHours + (b.stepHours - a.stepHours) * t, image: canvas, width: w, height: h, uMin, uMax, vMin, vMax };
}

/**
 * Geschwindigkeitsraum-interpolierter Frame zur (gebrochenen) Vorlaufstunde —
 * smooth Scrubbing wie Windy, konsistent mit Niederschlag/Temperatur. Auf einer
 * exakten Stunde (oder am Rand) wird der Originalframe ohne Neuaufbau geliefert.
 */
export function windFrameInterpolated(wind: IconD2Wind, hour: number): IconD2WindFrame {
  const frames = wind.frames;
  if (frames.length < 2) return frames[0];
  const minH = frames[0].stepHours, maxH = frames[frames.length - 1].stepHours;
  const hr = Math.max(minH, Math.min(maxH, hour));
  let a = frames[0], b = frames[frames.length - 1];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].stepHours <= hr) a = frames[i];
    if (frames[i].stepHours >= hr) { b = frames[i]; break; }
  }
  const span = b.stepHours - a.stepHours;
  const frac = span > 0 ? (hr - a.stepHours) / span : 0;
  if (frac < 0.02) return a;
  if (frac > 0.98) return b;
  const key = `${a.stepHours}|${b.stepHours}|${frac.toFixed(2)}`;
  const cached = blendCacheGet(key);
  if (cached) return cached;
  const frame = blendWindFrames(a, b, frac);
  blendCacheSet(key, frame);
  return frame;
}

/**
 * Wie `windFrameInterpolated`, aber NACH GÜLTIGKEITSZEIT (now-indexiert) statt
 * nach Vorlauf-Schritt — behebt den Valid-Time-Versatz (QA-Befund D1). Die
 * Zielzeit (Date.now() + Slider-Stunde·3600s) wird relativ zum Lauf in eine
 * gebrochene Vorlaufstunde umgerechnet; die Geschwindigkeitsraum-Interpolation
 * (smooth Scrubbing) bleibt unverändert.
 */
export function windFrameAtValidTime(wind: IconD2Wind, targetMs: number): IconD2WindFrame {
  const hour = (targetMs - wind.runAt.getTime()) / 3600_000;
  return windFrameInterpolated(wind, hour);
}

// ---------------------------------------------------------------------------
// Off-main Slider-Scrub: dieselbe Geschwindigkeitsraum-Interpolation wie oben,
// aber Blend + Upsample/Glätten + GPU-Format-Pack laufen in EINEM
// Worker-Roundtrip (windBlendWorker) statt als drei synchrone Main-Thread-
// Schritte (blendWindFrames → WindLayer.decodeAndRefine → createDataTexture).
// Live-Messung vorher: 34 Long Tasks / 23,2 s blockierter Main Thread über
// 25 Slider-Ticks (4×-CPU-Throttle). Fällt bei fehlendem/abgestürztem Worker
// transparent auf denselben Main-Thread-Pfad zurück (s. wfUsable-Muster oben)
// — nie schlechter als vorher. windFrameAtValidTime (sync) bleibt UNVERÄNDERT
// bestehen (u. a. für scripts/qa: `layerSampler.ts` braucht synchron).
// ---------------------------------------------------------------------------

interface PackedFrame {
  packed: PackedTexture; width: number; height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
}

export type WindFrameAsyncResult =
  | { kind: 'image'; frame: IconD2WindFrame }
  | ({ kind: 'packed'; key: string } & PackedFrame);

interface BwMsg {
  id: number; ok: boolean; error?: string;
  dataBuf?: ArrayBuffer; packedKind?: DataTextureFormat['kind'];
  width?: number; height?: number;
  uMin?: number; uMax?: number; vMin?: number; vMax?: number;
}
// Ein Worker reicht: Blend-Anfragen sind ohnehin durch die Drag-Geschwindigkeit
// des Nutzers serialisiert (kein Kaltstart-Fan-out wie beim Grib-Decode-Pool).
const bwWorkers: Worker[] = [];
let bwUsable = true, bwInited = false, bwRr = 0, bwNextId = 1;
const bwPending = new Map<number, { resolve: (r: PackedFrame) => void; reject: (e: Error) => void }>();

function bwInit(): void {
  if (bwInited) return;
  bwInited = true;
  try {
    const w = new Worker(new URL('./windBlendWorker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<BwMsg>) => {
      const d = e.data;
      const p = bwPending.get(d.id);
      if (!p) return;
      bwPending.delete(d.id);
      if (d.ok && d.dataBuf && d.packedKind) {
        p.resolve({
          packed: unpackTyped(d.packedKind, d.dataBuf),
          width: d.width!, height: d.height!,
          uMin: d.uMin!, uMax: d.uMax!, vMin: d.vMin!, vMax: d.vMax!,
        });
      } else {
        p.reject(new Error(d.error || 'wind blend worker error'));
      }
    };
    w.onerror = () => {
      // Worker-Crash: künftige Ticks gehen auf den Main-Thread-Fallback. In-
      // flight-Anfragen NICHT hängen lassen — ihre Puffer sind bereits
      // transferiert (nicht rückholbar), also ablehnen.
      bwUsable = false;
      for (const [id, p] of bwPending) { bwPending.delete(id); p.reject(new Error('wind blend worker crashed')); }
    };
    bwWorkers.push(w);
  } catch {
    bwUsable = false;
  }
}

function unpackTyped(kind: DataTextureFormat['kind'], buf: ArrayBuffer): PackedTexture {
  if (kind === 'half-float') return { kind, data: new Uint16Array(buf) };
  if (kind === 'float') return { kind, data: new Float32Array(buf) };
  return { kind: 'byte', data: new Uint8Array(buf) };
}

/** Normierte RG-Bytes eines Frames auslesen. Canvas-Readback bleibt zwingend
 *  Main-Thread, ist aber (anders als Blend/Upsample) ein billiger, linearer
 *  Speicher-Kopiervorgang — nicht der Teil, den dieser Fix adressiert. */
function framePixels(f: IconD2WindFrame): Uint8ClampedArray {
  return f.image.getContext('2d')!.getImageData(0, 0, f.width, f.height).data;
}
function frameNorm(f: IconD2WindFrame): FrameNorm {
  return { uMin: f.uMin, uMax: f.uMax, vMin: f.vMin, vMax: f.vMax };
}

const PACKED_LRU_MAX = 8;
const _packedCache = new Map<string, WindFrameAsyncResult>();
function packedCacheGet(key: string): WindFrameAsyncResult | undefined {
  const v = _packedCache.get(key);
  if (v) { _packedCache.delete(key); _packedCache.set(key, v); }
  return v;
}
function packedCacheSet(key: string, v: WindFrameAsyncResult): void {
  _packedCache.delete(key);
  _packedCache.set(key, v);
  if (_packedCache.size > PACKED_LRU_MAX) {
    const oldest = _packedCache.keys().next().value;
    if (oldest !== undefined) _packedCache.delete(oldest);
  }
}

/**
 * Off-main Gegenstück zu `windFrameAtValidTime` für den Live-Slider im
 * MapView-Wind-Effekt. Bei einem exakten Stunden-Frame (kein Blend nötig)
 * identisch zu vorher: `{kind:'image', frame}` → `WindLayer.setWindData`. Bei
 * einer echten Zwischen-Position läuft Blend+Upsample+Pack im Worker
 * (`{kind:'packed', ...}` → `WindLayer.setWindDataPacked`), der Main Thread
 * bleibt frei. `windTexKind` kommt von `WindLayer.windTextureKind` (einmalig
 * in onAdd bestimmt — ein Worker hat keinen GL-Context zum Selbst-Prüfen).
 */
export async function windFrameAtValidTimeAsync(
  wind: IconD2Wind,
  targetMs: number,
  upsample: number,
  windTexKind: DataTextureFormat['kind'],
): Promise<WindFrameAsyncResult> {
  const hour = (targetMs - wind.runAt.getTime()) / 3600_000;
  const frames = wind.frames;
  if (frames.length < 2) return { kind: 'image', frame: frames[0] };
  const minH = frames[0].stepHours, maxH = frames[frames.length - 1].stepHours;
  const hr = Math.max(minH, Math.min(maxH, hour));
  let a = frames[0], b = frames[frames.length - 1];
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].stepHours <= hr) a = frames[i];
    if (frames[i].stepHours >= hr) { b = frames[i]; break; }
  }
  const span = b.stepHours - a.stepHours;
  const frac = span > 0 ? (hr - a.stepHours) / span : 0;
  if (frac < 0.02) return { kind: 'image', frame: a };
  if (frac > 0.98) return { kind: 'image', frame: b };

  const key = `${a.stepHours}|${b.stepHours}|${frac.toFixed(2)}|${upsample}|${windTexKind}`;
  const cached = packedCacheGet(key);
  if (cached) return cached;

  const aPx = framePixels(a), bPx = framePixels(b);
  const blendInput = {
    aPx, aWidth: a.width, aHeight: a.height, aNorm: frameNorm(a),
    bPx, bWidth: b.width, bHeight: b.height, bNorm: frameNorm(b),
    t: frac, upsample, kind: windTexKind,
  };

  bwInit();
  let packedFrame: PackedFrame;
  if (bwUsable && bwWorkers.length > 0) {
    const w = bwWorkers[bwRr++ % bwWorkers.length];
    const id = bwNextId++;
    try {
      packedFrame = await new Promise<PackedFrame>((resolve, reject) => {
        bwPending.set(id, { resolve, reject });
        w.postMessage(
          { id, aBuf: aPx.buffer, aWidth: a.width, aHeight: a.height, aNorm: frameNorm(a),
            bBuf: bPx.buffer, bWidth: b.width, bHeight: b.height, bNorm: frameNorm(b),
            t: frac, upsample, kind: windTexKind },
          [aPx.buffer, bPx.buffer],
        );
      });
    } catch (err) {
      bwPending.delete(id);
      // aPx/bPx sind nach einem ERFOLGREICHEN Transfer detached (Länge 0) —
      // das passiert nur, wenn der Worker NACH der Übernahme abstürzt/ablehnt.
      // Dann gibt es keinen sicheren Main-Thread-Fallback: diesen einen Tick
      // überspringen (voriger Frame bleibt sichtbar), der nächste Tick landet
      // wegen bwUsable=false direkt im synchronen Pfad unten.
      if (aPx.buffer.byteLength === 0 || bPx.buffer.byteLength === 0) throw err;
      packedFrame = blendAndRefine(blendInput);
    }
  } else {
    packedFrame = blendAndRefine(blendInput);
  }
  const result: WindFrameAsyncResult = { kind: 'packed', key, ...packedFrame };
  packedCacheSet(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Sofort-Erstpaint-Cache: den „jetzt"-Frame (Schritt 0) des letzten Laufs
// persistieren, damit der Wind-Layer beim nächsten Seitenaufruf SOFORT rendert
// (statt ~2 s auf den Netz-Fetch zu warten). Wird vom frischen nativen Gitter
// ersetzt, sobald es geladen ist. Das Gitter ist standort-unabhängig (immer
// dieselbe ICON-D2-DACH-Domäne), darum ein einziger globaler Key.
//
// Speicher = IndexedDB mit ROHEN RGBA-Bytes (kein PNG-Codec): Speichern liest die
// Bytes per getImageData, Laden baut mit `rgbaToCanvas` direkt ein Canvas — kein
// `toDataURL`-Encode, kein async `Image`-Decode. IndexedDB (statt localStorage)
// hält die ~886-KB-RGBA per Structured-Clone nativ, ohne Base64-Inflation/Quota-
// Risiko. `WindLayer.setWindData` akzeptiert Canvas wie Image → kein Layer-Eingriff.
// ---------------------------------------------------------------------------

const WIND_DB = 'buscosun-wind';
const WIND_STORE = 'now';
const WIND_CACHE_ID = 'v3';
/** Alter localStorage-Key (PNG-DataURL) — wird beim Speichern best-effort aufgeräumt. */
const LEGACY_WIND_CACHE_KEY = 'bc_wind_now_v2';
/** Cache ignorieren, wenn älter (paar h alter Wind als 2-s-Platzhalter ist ok). */
const WIND_CACHE_MAX_AGE_MS = 24 * 3_600_000;

export interface CachedWindNow {
  image: HTMLImageElement | HTMLCanvasElement;
  width: number; height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
  uvBounds: [number, number, number, number];
}

interface WindCacheRecord {
  rgba: Uint8ClampedArray;
  width: number; height: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
  uvBounds: [number, number, number, number];
  savedMs: number;
}

/** IndexedDB öffnen (Objektstore einmalig anlegen). Null, wenn IDB nicht verfügbar. */
function openWindDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(WIND_DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(WIND_STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Den „jetzt"-Frame als ROH-RGBA (+ Normierung/Bounds) in IndexedDB ablegen. */
export function saveWindNowCache(frame: IconD2WindFrame, uvBounds: [number, number, number, number]): void {
  void (async () => {
    try {
      const ctx = frame.image.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      const rgba = ctx.getImageData(0, 0, frame.width, frame.height).data;
      const record: WindCacheRecord = {
        rgba, width: frame.width, height: frame.height,
        uMin: frame.uMin, uMax: frame.uMax, vMin: frame.vMin, vMax: frame.vMax,
        uvBounds, savedMs: Date.now(),
      };
      const db = await openWindDb();
      if (!db) return;
      const tx = db.transaction(WIND_STORE, 'readwrite');
      tx.objectStore(WIND_STORE).put(record, WIND_CACHE_ID);
      tx.oncomplete = () => db.close();
      // Altlast (PNG-DataURL, ~0,5 MB localStorage-Quota) best-effort entfernen.
      try { localStorage.removeItem(LEGACY_WIND_CACHE_KEY); } catch { /* ignore */ }
    } catch {
      // IDB voll/nicht verfügbar (Private Mode) → still ignorieren.
    }
  })();
}

/** Gecachten „jetzt"-Frame laden (Canvas aus Roh-RGBA, kein Netz, kein PNG-Decode). */
export async function loadWindNowCache(): Promise<CachedWindNow | null> {
  try {
    const db = await openWindDb();
    if (!db) return null;
    const record = await new Promise<WindCacheRecord | null>((resolve) => {
      const tx = db.transaction(WIND_STORE, 'readonly');
      const req = tx.objectStore(WIND_STORE).get(WIND_CACHE_ID);
      req.onsuccess = () => resolve((req.result as WindCacheRecord) ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
    if (!record || Date.now() - (record.savedMs ?? 0) > WIND_CACHE_MAX_AGE_MS) return null;
    const rgba = record.rgba instanceof Uint8ClampedArray
      ? record.rgba
      : new Uint8ClampedArray(record.rgba as ArrayBufferLike);
    const image = rgbaToCanvas(rgba, record.width, record.height);
    return {
      image, width: record.width, height: record.height,
      uMin: record.uMin, uMax: record.uMax, vMin: record.vMin, vMax: record.vMax, uvBounds: record.uvBounds,
    };
  } catch {
    return null;
  }
}
