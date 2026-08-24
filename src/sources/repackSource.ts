/**
 * Repack-Quelle (Phase BW-3, `audit/bandbreite.md` §22) — die EINE Stelle, an der
 * der Client die vorprozessierten ICON-D2-Bilder aus dem Daten-CDN liest.
 *
 * Warum es sie gibt: eine Kaltsitzung der Wetterkarte lud gemessen **6,73 MiB**
 * GRIB über Netlify, obwohl die App daraus sofort ein 608×373-Bild mit 8 bit
 * rechnet. Der Repack macht diesen Schritt einmal zentral (BW-1) und legt das
 * Ergebnis unveränderlich ab (BW-2). Hier wird es abgeholt.
 *
 * ── Was dieses Modul NICHT tut ─────────────────────────────────────────────
 * Es rechnet nichts. Die Zahlen im Bild sind das Ergebnis von `buildWindRgba` /
 * `buildTempRgba` — denselben Modulen, die der Client sonst selbst aufruft.
 * Deshalb gibt es hier keine zweite Mathematik, die driften könnte; `verify:repack`
 * prüft je Lauf, dass beide Wege byte-gleich enden.
 *
 * ── Die zwei Familien sind nicht symmetrisch ───────────────────────────────
 *   wind-NNN.png   Farbtyp 2 (RGB)          → R = u, G = v, B = 0, A = 255
 *   temp-NNN.png   Farbtyp 4 (Grau + Alpha) → R = G = B = °C, A = Maske
 *   hsurf-v1.png   Farbtyp 0 (Grau)         → R = G = B = Orographie
 *
 * Wind ist damit fertig, sobald das Bild dekodiert ist. Temperatur NICHT: der
 * Browser expandiert Grau auf alle drei Farbkanäle, also stünde die Temperatur
 * auch im Grünkanal — genau dort, wo der `ScalarLayer` die Bezugshöhe liest
 * (`raw.g * u_dem_max`). Ungefiltert durchgereicht ergäbe das eine Karte, die
 * aussieht wie immer und deren Höhenkorrektur 20 °C als 2 400 m Bezugshöhe
 * rechnet. `composeTempRgba()` setzt die zwei Dateien deshalb zusammen — nach
 * derselben Regel wie der Producer (`scripts/repack-icon-d2.mjs`).
 *
 * ── Fallback ist der Normalfall, nicht der Störfall ────────────────────────
 * Zwischen DWD-Veröffentlichung und Producer-Lauf nennt das Manifest einen Lauf,
 * den das Daten-Repo noch nicht führt. Dann fehlt der Abschnitt und der Aufrufer
 * lädt GRIB — mehrmals täglich der erwartete Zustand. Kein Fehler, keine Meldung.
 */

import { GRIB_MANIFEST_URL, readManifestRepack } from './gribManifest';

/** Schema-Version des Manifest-Abschnitts. Muss zu `scripts/lib/repackManifest.mjs` passen. */
export const REPACK_SCHEMA = 1;

/**
 * Frist des ERSTEN Abrufs einer Sitzung (ms). Er beantwortet nur eine Frage —
 * trägt der Weg überhaupt? Ein totes CDN kostet damit 3 s statt 6.
 */
export const FIRST_TIMEOUT_MS = 3_000;
/**
 * Frist jedes weiteren Abrufs (ms). Rund das Dreifache des schlechtesten
 * gemessenen p90 (§22.3) und in der Größenordnung des GRIB-Pfads, den er
 * ersetzt (1,0 MB in 1,7–2,9 s). Ohne Frist stünde die Karte bis zum
 * TCP-Timeout: ein weggedrückter Commit antwortete gemessen erst nach 19,9 s.
 */
export const STEP_TIMEOUT_MS = 6_000;

export interface RepackGrid {
  ni: number; nj: number; ss: number;
  width: number; height: number;
  corners: {
    nw: [number, number]; ne: [number, number];
    se: [number, number]; sw: [number, number];
  };
}

export interface RepackWindStep {
  step: number; file: string; bytes: number;
  uMin: number; uMax: number; vMin: number; vMax: number;
}
export interface RepackTempStep { step: number; file: string; bytes: number }
export interface RepackHsurf { url: string; scope: string; channels: number; bytes: number }

export interface RepackSection {
  schema: number;
  base: string;
  commit: string;
  run: string;
  runAt: string;
  path: string;
  targetWidth: number;
  grid: RepackGrid;
  wind?: { channels: number; steps: RepackWindStep[] };
  temp?: {
    channels: number; vMin: number; vMax: number; demMax: number;
    hsurf: RepackHsurf | null;
    steps: RepackTempStep[];
  };
}

// ---------------------------------------------------------------------------
// Prüfen — rein, DOM-frei, vom Verifier importiert
// ---------------------------------------------------------------------------

const COMMIT_RE = /^[0-9a-f]{40}$/;
/** Dateinamen kommen aus dem Manifest und gehen in eine URL. Bewusst eng: ein
 *  `../` darin würde den Abruf aus dem Lauf-Verzeichnis heraustragen. */
const FILE_RE = /^[a-z0-9][a-z0-9._-]*\.png$/;
const PATH_RE = /^[a-z0-9][a-z0-9/._-]*$/;

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function pair(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = num(v[0]), b = num(v[1]);
  return a === null || b === null ? null : [a, b];
}

function parseGrid(raw: unknown): RepackGrid | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const width = num(g.width), height = num(g.height), ss = num(g.ss);
  const ni = num(g.ni), nj = num(g.nj);
  if (width === null || height === null || ss === null || ni === null || nj === null) return null;
  if (width <= 0 || height <= 0 || ss < 1) return null;
  const c = g.corners as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object') return null;
  const nw = pair(c.nw), ne = pair(c.ne), se = pair(c.se), sw = pair(c.sw);
  if (!nw || !ne || !se || !sw) return null;
  return { ni, nj, ss, width, height, corners: { nw, ne, se, sw } };
}

/**
 * Prüft einen rohen Manifest-Abschnitt und gibt ihn nur zurück, wenn er für
 * DIESEN Lauf und DIESE Familie vollständig brauchbar ist.
 *
 * Der Lauf-Vergleich ist die Anti-Drift-Regel aus §21 — auf der Client-Seite
 * ein zweites Mal, aus einem anderen Grund: der Warm-Cron vergleicht gegen den
 * Lauf, den er selbst ins Manifest schreibt; beide Loader können aber am
 * Manifest VORBEI auflösen (Directory-Scan bei fehlendem, zu altem oder den
 * Horizont nicht mehr deckendem Manifest). Dann gehört der Abschnitt zu einem
 * anderen Lauf als die Frames — richtige Werte zur falschen Zeit, und nichts
 * an der Karte würde es zeigen.
 */
export function parseRepackSection(
  raw: unknown,
  family: 'wind' | 'temp',
  run: string,
): RepackSection | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Record<string, unknown>;
  if (s.schema !== REPACK_SCHEMA) return null;
  if (typeof s.base !== 'string' || !s.base.startsWith('https://')) return null;
  if (typeof s.commit !== 'string' || !COMMIT_RE.test(s.commit)) return null;
  if (typeof s.run !== 'string' || s.run !== run) return null;
  if (typeof s.path !== 'string' || !PATH_RE.test(s.path)) return null;
  const targetWidth = num(s.targetWidth);
  if (targetWidth === null || targetWidth <= 0) return null;
  const grid = parseGrid(s.grid);
  if (!grid) return null;

  const fam = s[family] as Record<string, unknown> | undefined;
  if (!fam || typeof fam !== 'object' || !Array.isArray(fam.steps) || fam.steps.length === 0) return null;

  const out: RepackSection = {
    schema: REPACK_SCHEMA,
    base: s.base,
    commit: s.commit,
    run,
    runAt: typeof s.runAt === 'string' ? s.runAt : '',
    path: s.path,
    targetWidth,
    grid,
  };

  if (family === 'wind') {
    const steps: RepackWindStep[] = [];
    for (const e of fam.steps as unknown[]) {
      if (!e || typeof e !== 'object') continue;
      const x = e as Record<string, unknown>;
      const step = num(x.step);
      const uMin = num(x.uMin), uMax = num(x.uMax), vMin = num(x.vMin), vMax = num(x.vMax);
      if (step === null || !Number.isInteger(step) || step < 0) continue;
      if (typeof x.file !== 'string' || !FILE_RE.test(x.file)) continue;
      // Ohne Normierung ist das Bild bedeutungslos — ein Frame ohne sie wäre
      // Windstille überall statt „Schritt fehlt".
      if (uMin === null || uMax === null || vMin === null || vMax === null) continue;
      if (!(uMax > uMin) || !(vMax > vMin)) continue;
      steps.push({ step, file: x.file, bytes: num(x.bytes) ?? 0, uMin, uMax, vMin, vMax });
    }
    if (steps.length === 0) return null;
    out.wind = { channels: num((fam as Record<string, unknown>).channels) ?? 3, steps };
  } else {
    const vMin = num(fam.vMin), vMax = num(fam.vMax), demMax = num(fam.demMax);
    if (vMin === null || vMax === null || demMax === null || !(vMax > vMin) || demMax <= 0) return null;
    const steps: RepackTempStep[] = [];
    for (const e of fam.steps as unknown[]) {
      if (!e || typeof e !== 'object') continue;
      const x = e as Record<string, unknown>;
      const step = num(x.step);
      if (step === null || !Number.isInteger(step) || step < 0) continue;
      if (typeof x.file !== 'string' || !FILE_RE.test(x.file)) continue;
      steps.push({ step, file: x.file, bytes: num(x.bytes) ?? 0 });
    }
    if (steps.length === 0) return null;
    let hsurf: RepackHsurf | null = null;
    const h = fam.hsurf as Record<string, unknown> | null | undefined;
    if (h && typeof h === 'object' && typeof h.url === 'string' && FILE_RE.test(h.url)) {
      hsurf = { url: h.url, scope: String(h.scope ?? 'repo'), channels: num(h.channels) ?? 1, bytes: num(h.bytes) ?? 0 };
    }
    out.temp = { channels: num(fam.channels) ?? 2, vMin, vMax, demMax, hsurf, steps };
  }
  return out;
}

/** URL einer Schritt-Datei. DIE Regel — Spiegel von `scripts/lib/repackManifest.mjs`. */
export function stepUrl(section: RepackSection, file: string): string {
  return `${section.base}@${section.commit}/${section.path}/${file}`;
}
/** URL einer lauf-unabhängigen Datei (`hsurf`): ohne Lauf-Pfad. */
export function repoUrl(section: RepackSection, file: string): string {
  return `${section.base}@${section.commit}/${file}`;
}

function lngToEquiX(lng: number): number { return (lng + 180) / 360; }
function latToEquiY(lat: number): number { return (90 - lat) / 180; }

/**
 * Equirect-UV-Bounds aus den Ecken des Abschnitts — dieselbe Rechnung, die
 * beide Loader sonst auf `subsampledCorners()` des dekodierten Feldes machen.
 * Der Producer hat die Ecken mit genau dieser Funktion gefüllt (BW-1), also
 * braucht der Repack-Pfad kein GRIB mehr, nur um zu wissen, wo das Bild liegt.
 */
export function uvBoundsOf(section: RepackSection): [number, number, number, number] {
  const c = section.grid.corners;
  return [lngToEquiX(c.nw[0]), latToEquiY(c.nw[1]), lngToEquiX(c.ne[0]), latToEquiY(c.se[1])];
}

/**
 * Setzt Zeitschritt-Bild und Orographie zum Client-Bild zusammen.
 *
 * Eingang ist, was der Browser aus `temp-NNN.png` liefert: Grau auf R=G=B
 * expandiert, Alpha = Maske. Ausgang ist exakt `buildTempRgba`:
 *   R = norm. °C · G = norm. hsurf · B = 0 · A = Maske
 * Die Maske gewinnt — wo Alpha 0 ist, ist der ganze Pixel 0. Das entspricht
 * `composeTempRgba` im Producer (dort mit Kanalabstand 2 statt 4) und wird von
 * `verify:repack` gegen beide geprüft.
 */
export function composeTempRgba(
  tempRgba: Uint8ClampedArray,
  hsurfGrey: Uint8Array | null,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0, n = width * height; i < n; i++) {
    const a = tempRgba[i * 4 + 3];
    if (!a) continue;
    out[i * 4] = tempRgba[i * 4];
    out[i * 4 + 1] = hsurfGrey ? hsurfGrey[i] : 0;
    out[i * 4 + 3] = a;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schalter
// ---------------------------------------------------------------------------

/**
 * Die Schalterregel, rein — damit der Verifier sie prüfen kann, statt sie aus
 * dem Quelltext zu lesen.
 *
 * **BW-4 (2026-08-24): default-ON.** Gedreht wurde genau die letzte Zeile, und
 * zwar nach der Messung, nicht davor („Rule 2": ein neuer Rechenpfad kommt
 * default-off und wird erst scharf, wenn er belegt ist — Gate GBW3).
 *
 * Der Ladeweg selbst ist unverändert der aus BW-3, samt Fristen und benanntem
 * Fallback auf GRIB. Die Umkehr ist die EINZIGE Verhaltensänderung der Phase.
 *
 * Damit wird der Kill-Switch zur eigentlichen Zusage:
 *   `?repack=0`                  schaltet für diesen Aufruf ab,
 *   `localStorage.repack = '0'`  dauerhaft für dieses Gerät,
 *   `?repack=1` bzw. `'1'`       der Weg zurück.
 * Die Query schlägt den Speicher in BEIDE Richtungen — sonst käme ein einmal
 * abgeschaltetes Gerät nicht ohne Umweg über die Konsole wieder zurück.
 *
 * Auf der Wetterkarte überlebt `?repack=0` das Umschreiben der URL: `repack`
 * ist kein bekannter Key, landet deshalb in `parseMapSearch(…).extra` und wird
 * von `WetterkarteRoute.tsx:105` unverändert wieder angehängt.
 */
export function repackFlagFrom(search: string, stored: string | null): boolean {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('repack');
  if (q === '1') return true;
  if (q === '0') return false;
  return stored !== '0';
}

/**
 * Der Schalter im Browser. Ohne `window` (Node, Verifier) immer aus.
 *
 * Der Speicherzugriff hat seinen EIGENEN Fang: `localStorage` wirft in manchen
 * Datenschutz-Einstellungen schon beim Lesen. Läge er im selben `try` wie der
 * Rest, wären genau diese Besucher seit BW-4 still vom neuen Weg ausgenommen —
 * nicht kaputt, aber ohne die Ersparnis, und niemand sähe es. Ein unlesbarer
 * Speicher heißt hier „kein gespeicherter Wunsch", also gilt die Vorgabe.
 */
export function repackEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  let stored: string | null = null;
  try { stored = window.localStorage?.getItem('repack') ?? null; } catch { /* siehe oben */ }
  try {
    return repackFlagFrom(window.location.search, stored);
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------

interface RepackState { broken: boolean; reason: string; firstDone: boolean; loaded: number }
const state: RepackState = { broken: false, reason: '', firstDone: false, loaded: 0 };

/** Zustand für Verifier/Diagnose. Nie für Steuerung von außen gedacht. */
export function repackStatus(): Readonly<RepackState> { return { ...state }; }
/** Nur für Tests/Verifier: Sitzungsgedächtnis zurücksetzen. */
export function resetRepackState(): void {
  state.broken = false; state.reason = ''; state.firstDone = false; state.loaded = 0;
}

/**
 * Ein Fehlschlag gilt für die ganze Sitzung. Das ist keine Bequemlichkeit,
 * sondern folgt aus der Ablage: alle Dateien hängen an EINEM Commit. Ist der
 * weg (force-gepusht, Repo umbenannt, CDN aus), sind sie alle weg — jeder
 * weitere Schritt würde die Frist nur erneut bezahlen.
 */
function markBroken(reason: string): void {
  if (state.broken) return;
  state.broken = true;
  state.reason = reason;
  if (typeof console !== 'undefined') {
    // Genau EINE Zeile je Sitzung, und nur bei echter Verschlechterung: der
    // Abschnitt war da, die Bilder nicht. Ein FEHLENDER Abschnitt ist der
    // Normalfall (§22.4) und sagt hier nichts.
    console.info(`[repack] CDN nicht nutzbar (${reason}) → GRIB für diese Sitzung.`);
  }
}

/** Frist + Abbruch des Aufrufers zu EINEM Signal verbinden (ohne `AbortSignal.any`). */
function withDeadline(ms: number, signal?: AbortSignal): { signal: AbortSignal; done: () => void } {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new DOMException('Frist abgelaufen', 'TimeoutError')), ms);
  const onAbort = () => ac.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ac.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ac.signal,
    done: () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); },
  };
}

interface DecodedImage { data: Uint8ClampedArray; width: number; height: number }

/**
 * PNG → RGBA, genau wie BW-P es gemessen hat: `colorSpaceConversion: 'none'`
 * (kein Farbprofil hineinrechnen) und `premultiplyAlpha: 'none'` (das Temp-Bild
 * hat A = 0 außerhalb der Domäne — ohne die Option würden dort R/G genullt).
 * Chrome war auch ohne die Optionen exakt; sie stehen als Absicherung.
 */
async function loadRgba(url: string, signal: AbortSignal | undefined, expect: RepackGrid): Promise<DecodedImage | null> {
  const first = !state.firstDone;
  const { signal: sig, done } = withDeadline(first ? FIRST_TIMEOUT_MS : STEP_TIMEOUT_MS, signal);
  let blob: Blob;
  try {
    const res = await fetch(url, { signal: sig, cache: 'default' });
    if (!res.ok) { markBroken(`HTTP ${res.status}`); return null; }
    blob = await res.blob();
  } catch (e) {
    // Abbruch DURCH DEN AUFRUFER (Layer abgewählt, Seite verlassen) ist kein
    // Defekt des Wegs — sonst würde ein Layer-Wechsel den Rest der Sitzung
    // auf GRIB zwingen.
    if (!signal?.aborted) markBroken((e as Error)?.name === 'TimeoutError' ? 'Frist abgelaufen' : String((e as Error)?.name || e));
    return null;
  } finally {
    done();
    state.firstDone = true;
  }

  try {
    const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
    // Maße gegen das Manifest prüfen: ein Bild anderer Größe wäre ein stiller
    // Geometriefehler — jeder Wert läge dann woanders, als die Ecken sagen.
    if (bmp.width !== expect.width || bmp.height !== expect.height) {
      bmp.close();
      markBroken(`Maße ${bmp.width}×${bmp.height} statt ${expect.width}×${expect.height}`);
      return null;
    }
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width; canvas.height = bmp.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { bmp.close(); markBroken('kein 2D-Kontext'); return null; }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    state.loaded++;
    return { data: img.data, width: canvas.width, height: canvas.height };
  } catch (e) {
    markBroken(`Bild nicht dekodierbar (${(e as Error)?.name || e})`);
    return null;
  }
}

/** True, solange der Weg in dieser Sitzung nutzbar ist. */
export function repackUsable(): boolean { return repackEnabled() && !state.broken; }

/**
 * Windbild eines Schritts. Rückgabe ist bereits das, was `buildWindRgba`
 * liefern würde (R = u, G = v, B = 0, A = 255) — der Aufrufer legt es nur noch
 * per `putImageData` ins Canvas. `null` = dieser Schritt geht über GRIB.
 */
export async function loadWindStep(
  section: RepackSection,
  step: number,
  signal?: AbortSignal,
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number; uMin: number; uMax: number; vMin: number; vMax: number } | null> {
  if (state.broken || !section.wind) return null;
  const entry = section.wind.steps.find((s) => s.step === step);
  if (!entry) return null;
  const img = await loadRgba(stepUrl(section, entry.file), signal, section.grid);
  if (!img) return null;
  return {
    rgba: img.data, width: img.width, height: img.height,
    uMin: entry.uMin, uMax: entry.uMax, vMin: entry.vMin, vMax: entry.vMax,
  };
}

/** Orographie — einmal je Commit, nicht je Schritt (lauf-invariant, BW-1 §20.2). */
const hsurfCache = new Map<string, Promise<Uint8Array | null>>();

export async function loadHsurfGrey(section: RepackSection, signal?: AbortSignal): Promise<Uint8Array | null> {
  if (state.broken || !section.temp?.hsurf) return null;
  const url = repoUrl(section, section.temp.hsurf.url);
  let p = hsurfCache.get(url);
  if (!p) {
    // Bewusst OHNE das Abbruch-Signal des ersten Aufrufers: der Eintrag ist
    // geteilt, und Reacts doppelte Dev-Effekte bräche sonst der zweite Aufrufer
    // mit dem Abort des ersten ab (Lehre GBP1 (3), audit/brandflaechen-panel.md).
    p = loadRgba(url, undefined, section.grid).then((img) => {
      if (!img) return null;
      const n = img.width * img.height;
      const grey = new Uint8Array(n);
      for (let i = 0; i < n; i++) grey[i] = img.data[i * 4];   // Grau steht in R
      return grey;
    }).catch(() => null);
    hsurfCache.set(url, p);
  }
  const grey = await p;
  // Ein Fehlschlag darf nicht dauerhaft festgeschrieben werden — beim nächsten
  // Versuch (neuer Commit oder neue Sitzung) soll es wieder gehen dürfen.
  if (!grey) hsurfCache.delete(url);
  return signal?.aborted ? null : grey;
}

/**
 * Temperaturbild eines Schritts, bereits zusammengesetzt (R = °C, G = hsurf,
 * B = 0, A = Maske). `null` = dieser Schritt geht über GRIB.
 */
export async function loadTempStep(
  section: RepackSection,
  step: number,
  hsurfGrey: Uint8Array | null,
  signal?: AbortSignal,
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number } | null> {
  if (state.broken || !section.temp) return null;
  const entry = section.temp.steps.find((s) => s.step === step);
  if (!entry) return null;
  const img = await loadRgba(stepUrl(section, entry.file), signal, section.grid);
  if (!img) return null;
  return { rgba: composeTempRgba(img.data, hsurfGrey, img.width, img.height), width: img.width, height: img.height };
}

// ---------------------------------------------------------------------------
// Abschnitt aus dem GRIB-Manifest (Temperatur-Seite)
// ---------------------------------------------------------------------------

/**
 * Liest den `repack`-Abschnitt aus `/latest-grib.json` — über DENSELBEN
 * 60-s-Cache, den `resolveRunFromManifest` benutzt, also ohne zweiten Abruf.
 * `run` ist der Lauf, den der Aufrufer TATSÄCHLICH auflösen konnte (nicht der
 * des Manifests): passt er nicht, gibt es keinen Abschnitt.
 */
export async function resolveRepackForRun(
  run: string,
  family: 'wind' | 'temp',
  url: string = GRIB_MANIFEST_URL,
): Promise<RepackSection | null> {
  if (!repackUsable()) return null;
  const raw = await readManifestRepack(url);
  return raw ? parseRepackSection(raw, family, run) : null;
}
