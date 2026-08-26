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
 * ── Die Familien sind nicht symmetrisch ────────────────────────────────────
 *   wind-NNN.png      Farbtyp 2 (RGB)          → R = u, G = v, B = 0, A = 255
 *   temp-NNN.png      Farbtyp 4 (Grau + Alpha) → R = G = B = °C, A = Maske
 *   hsurf-v1.png      Farbtyp 0 (Grau)         → R = G = B = Orographie
 *   gust/thunder/rotation/lpi/snowdepth/snowfresh-NNN.png (BW-6, §25)
 *                     Farbtyp 4 (Grau + Alpha) → R = G = B = Wert, A = Maske
 *   precip-NNN.png    Farbtyp 0 (Grau), VOLLE Auflösung → R = G = B = mm/h ÷ 20
 *
 * Wind ist damit fertig, sobald das Bild dekodiert ist. Temperatur NICHT: der
 * Browser expandiert Grau auf alle drei Farbkanäle, also stünde die Temperatur
 * auch im Grünkanal — genau dort, wo der `ScalarLayer` die Bezugshöhe liest
 * (`raw.g * u_dem_max`). Ungefiltert durchgereicht ergäbe das eine Karte, die
 * aussieht wie immer und deren Höhenkorrektur 20 °C als 2 400 m Bezugshöhe
 * rechnet. `composeTempRgba()` setzt die zwei Dateien deshalb zusammen — nach
 * derselben Regel wie der Producer (`scripts/repack-icon-d2.mjs`).
 *
 * Die Ein-Kanal-Familien lesen nur R und A (kein `demRefine`, §25.4 (1)); der
 * expandierte Grünkanal wird trotzdem genullt (`composeScalarRgba`), damit das
 * Bild BYTE-gleich zu `scalarFrameBuild.ts` ist — nicht nur „gleich genug".
 * Niederschlag ist kein Canvas, sondern das `Uint8Array`, das der Kompositor
 * liest; und er ist SEQUENZIELL: jedes Bild nennt den Schritt, gegen den es
 * deakkumuliert wurde (`ref`). Der Client nimmt den Weg nur, wenn das genau die
 * Referenz ist, die sein GRIB-Pfad wählen würde (§25.4 (3)).
 *
 * ── Fallback ist der Normalfall, nicht der Störfall ────────────────────────
 * Zwischen DWD-Veröffentlichung und Producer-Lauf nennt das Manifest einen Lauf,
 * den das Daten-Repo noch nicht führt. Dann fehlt der Abschnitt und der Aufrufer
 * lädt GRIB — mehrmals täglich der erwartete Zustand. Kein Fehler, keine Meldung.
 */

import { GRIB_MANIFEST_URL, readManifestRepack } from './gribManifest';
import {
  GUST_VMIN, GUST_VMAX, LPI_VMIN, LPI_VMAX, SNOW_DEPTH_VMAX_CM, SNOW_FRESH_VMAX_CM,
  THUNDER_VMIN, THUNDER_VMAX, ROTATION_VMIN, ROTATION_VMAX,
} from './scalarFrameBuild';
import { PRECIP_VMAX, CAPE_MAX } from '../scalar/RainLayer';

/** Schema-Version des Manifest-Abschnitts. Muss zu `scripts/lib/repackManifest.mjs` passen. */
export const REPACK_SCHEMA = 1;

/**
 * Die Familien, die dieser Client kennt — SPIEGEL von `FAMILIES` in
 * `scripts/lib/repackManifest.mjs` (`verify:repack` prüft die Gleichheit der
 * Schlüssel und Kanäle). Hier steht nur, was der Leser braucht: Kanalzahl,
 * ob das Bild in voller Auflösung liegt, ob es sequenziell ist — und die
 * Skala, gegen die der Abschnitt geprüft wird. Sie ist KEIN Zubehör: nennt
 * das Manifest eine andere Skala als der Code hier, sind Producer und Client
 * auseinandergelaufen, und der Abschnitt wird abgelehnt statt falsch gelesen.
 */
export const REPACK_FAMILIES = {
  wind:        { channels: 3 },
  temp:        { channels: 2 },
  gust:        { channels: 2, vMin: GUST_VMIN,     vMax: GUST_VMAX },
  thunder:     { channels: 2, vMin: THUNDER_VMIN,  vMax: THUNDER_VMAX },
  rotation:    { channels: 2, vMin: ROTATION_VMIN, vMax: ROTATION_VMAX },
  lightningfc: { channels: 2, vMin: LPI_VMIN,      vMax: LPI_VMAX },
  snowDepth:   { channels: 2, vMin: 0,             vMax: SNOW_DEPTH_VMAX_CM },
  snowFresh:   { channels: 2, vMin: 0,             vMax: SNOW_FRESH_VMAX_CM },
  precip:      { channels: 1, vMin: 0,             vMax: PRECIP_VMAX, fullRes: true, sequential: true },
  cape:        { channels: 1, vMin: 0,             vMax: CAPE_MAX,    fullRes: true },
} as const;
export type RepackFamily = keyof typeof REPACK_FAMILIES;
/** Die Ein-Kanal-Familien auf dem Anzeigeraster (Grau+Alpha, `ScalarLayer`). */
export type RepackScalarFamily = 'gust' | 'thunder' | 'rotation' | 'lightningfc' | 'snowDepth' | 'snowFresh';

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
/**
 * Frist für den KÖRPER einer Datei, nachdem die Kopfzeilen da sind (BW-10, §29.2).
 * Die beiden Fristen oben messen „antwortet das CDN?" — die Zeit bis zu den
 * Kopfzeilen, unabhängig von Bandbreite und Parallelität. Der Körper hängt an
 * beidem: 12 parallele Abrufe à 247 KB sind 3 MB in der Luft, und 30 s dafür
 * sind 0,8 Mbit/s — darunter hilft auch der GRIB-Weg (8× die Bytes) nicht mehr.
 * Mit EINER 6-s-Frist über beides galt der Weg schon auf 3G (≈ 2 Mbit/s) als
 * kaputt, und die Sitzung fiel ausgerechnet dort auf GRIB.
 */
export const BODY_TIMEOUT_MS = 30_000;
/**
 * Parallele Bildabrufe je Familie auf dem CDN-Weg (BW-10, §29.2): 13 Dateien
 * kalt in 1,0 s statt 4,2 s bei 6. Der GRIB-Weg behält seine 6 — dort hält der
 * bz2-Worker-Pool die Kette, nicht das Netz. Im Nur-Jetzt-Modus (2 Dateien)
 * ist die Zahl ohne Wirkung; sie zählt für Slider-Fenster, volle Listen und das
 * Nachfüllen des fernen Horizonts.
 */
export const REPACK_CONCURRENCY = 12;

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
export interface RepackScalarStep { step: number; file: string; bytes: number }
/** `ref` = der Schritt, gegen den deakkumuliert wurde; `null` = gegen 0 (erster Schritt). */
export interface RepackPrecipStep { step: number; file: string; bytes: number; ref: number | null }
export interface RepackScalarFamilySection { channels: number; vMin: number; vMax: number; steps: RepackScalarStep[] }

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
  gust?: RepackScalarFamilySection;
  thunder?: RepackScalarFamilySection;
  rotation?: RepackScalarFamilySection;
  lightningfc?: RepackScalarFamilySection;
  snowDepth?: RepackScalarFamilySection;
  snowFresh?: RepackScalarFamilySection;
  /** Volle Auflösung — eigenes Gitter (ss = 1), nicht das des Abschnitts. */
  precip?: { channels: number; vMin: number; vMax: number; grid: RepackGrid; steps: RepackPrecipStep[] };
  /** BW-7a: CAPE am Punkt, volle Auflösung, instantan (kein `ref`). */
  cape?: { channels: number; vMin: number; vMax: number; grid: RepackGrid; steps: RepackScalarStep[] };
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
  family: RepackFamily,
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
  } else if (family === 'temp') {
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
  } else if (family === 'precip') {
    // Eigenes Gitter (volle Auflösung) — das Abschnitts-Gitter ist das abgetastete.
    const grid = parseGrid(fam.grid);
    if (!grid || grid.ss !== 1) return null;
    const vMin = num(fam.vMin), vMax = num(fam.vMax);
    const want = REPACK_FAMILIES.precip;
    if (vMin !== want.vMin || vMax !== want.vMax) return null;   // Skalen-Drift → ablehnen
    const steps: RepackPrecipStep[] = [];
    for (const e of fam.steps as unknown[]) {
      if (!e || typeof e !== 'object') continue;
      const x = e as Record<string, unknown>;
      const step = num(x.step);
      if (step === null || !Number.isInteger(step) || step < 0) continue;
      if (typeof x.file !== 'string' || !FILE_RE.test(x.file)) continue;
      // `ref` MUSS genannt sein (auch als null) — ein Schritt ohne Referenz-Angabe
      // wäre eine Rate gegen einen unbekannten Vorschritt.
      if (!('ref' in x)) continue;
      const ref = x.ref === null ? null : num(x.ref);
      if (ref !== null && (!Number.isInteger(ref) || ref < 0 || ref >= step)) continue;
      steps.push({ step, file: x.file, bytes: num(x.bytes) ?? 0, ref });
    }
    if (steps.length === 0) return null;
    out.precip = { channels: num(fam.channels) ?? 1, vMin, vMax, grid, steps };
  } else if (family === 'cape') {
    const grid = parseGrid(fam.grid);
    if (!grid || grid.ss !== 1) return null;
    const vMin = num(fam.vMin), vMax = num(fam.vMax);
    const want = REPACK_FAMILIES.cape;
    if (vMin !== want.vMin || vMax !== want.vMax) return null;   // Skalen-Drift → ablehnen
    if ((num(fam.channels) ?? 1) !== 1) return null;
    const steps: RepackScalarStep[] = [];
    for (const e of fam.steps as unknown[]) {
      if (!e || typeof e !== 'object') continue;
      const x = e as Record<string, unknown>;
      const step = num(x.step);
      if (step === null || !Number.isInteger(step) || step < 0) continue;
      if (typeof x.file !== 'string' || !FILE_RE.test(x.file)) continue;
      steps.push({ step, file: x.file, bytes: num(x.bytes) ?? 0 });
    }
    if (steps.length === 0) return null;
    out.cape = { channels: 1, vMin, vMax, grid, steps };
  } else {
    const want = REPACK_FAMILIES[family] as { channels: number; vMin: number; vMax: number };
    const vMin = num(fam.vMin), vMax = num(fam.vMax);
    if (vMin !== want.vMin || vMax !== want.vMax) return null;   // Skalen-Drift → ablehnen
    const channels = num(fam.channels) ?? 2;
    if (channels !== want.channels) return null;
    const steps: RepackScalarStep[] = [];
    for (const e of fam.steps as unknown[]) {
      if (!e || typeof e !== 'object') continue;
      const x = e as Record<string, unknown>;
      const step = num(x.step);
      if (step === null || !Number.isInteger(step) || step < 0) continue;
      if (typeof x.file !== 'string' || !FILE_RE.test(x.file)) continue;
      steps.push({ step, file: x.file, bytes: num(x.bytes) ?? 0 });
    }
    if (steps.length === 0) return null;
    out[family] = { channels, vMin, vMax, steps };
  }
  return out;
}

/**
 * Ein Ein-Kanal-Bild aus dem Browser (Grau expandiert auf R = G = B, A = Maske)
 * → exakt das RGBA aus `scalarFrameBuild.ts`: R = Wert, G = B = 0, A = Maske;
 * wo die Maske 0 ist, ist der ganze Pixel 0. In place, keine Kopie.
 */
export function composeScalarRgba(rgba: Uint8ClampedArray): Uint8ClampedArray {
  for (let i = 0, n = rgba.length; i < n; i += 4) {
    if (!rgba[i + 3]) { rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; continue; }
    rgba[i + 1] = 0; rgba[i + 2] = 0;
  }
  return rgba;
}

/**
 * Darf der Niederschlag-Weg für GENAU diese Schrittfolge genommen werden?
 *
 * Der GRIB-Pfad (`iconD2Precip.ts`) baut aus dem ERSTEN Schritt seines Fensters
 * kein Frame (er ist nur Referenz) und differenziert jeden weiteren gegen den
 * zuvor geladenen. Ein PNG ist nur dann derselbe Wert, wenn sein `ref` genau
 * dieser Vorgänger ist. Sonst — Lücke in der Ablage, anderes Fenster — geht die
 * GANZE Familie über GRIB: gemischt ginge es nicht, weil der GRIB-Pfad für den
 * nächsten Schritt die Rohwerte des vorigen braucht, die ein PNG nicht hat.
 * Rückgabe: die Schritte, für die ein Frame entsteht (alle außer dem ersten).
 */
export function precipStepsUsable(section: RepackSection, wanted: number[]): number[] | null {
  const fam = section.precip;
  if (!fam || wanted.length < 2) return null;
  const byStep = new Map(fam.steps.map((s) => [s.step, s]));
  const out: number[] = [];
  for (let i = 1; i < wanted.length; i++) {
    const e = byStep.get(wanted[i]);
    if (!e || e.ref !== wanted[i - 1]) return null;
    out.push(wanted[i]);
  }
  return out;
}

/**
 * Trägt der Abschnitt JEDEN gewünschten Schritt? Reine Mengenfrage — die
 * `ref`-Kette des Niederschlags prüft `precipStepsUsable` danach wie bisher.
 * BW-10 (§29.3 Hebel 1): ein Abschnitt, der alle gewünschten Schritte deckt,
 * kann von keiner weiteren Quelle verbessert werden — dann kostet der CDN-Index
 * nur Zeit auf dem kritischen Pfad.
 */
export function sectionCovers(section: RepackSection | null, family: RepackFamily, wanted: readonly number[]): boolean {
  if (!section) return false;
  const steps = (section[family] as { steps?: { step: number }[] } | undefined)?.steps;
  if (!steps) return false;
  const have = new Set(steps.map((s) => s.step));
  return wanted.every((s) => have.has(s));
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

/** Frist + Abbruch des Aufrufers zu EINEM Signal verbinden (ohne `AbortSignal.any`).
 *  `rearm(ms)` setzt eine NEUE Frist ab jetzt — für den Körper, sobald die
 *  Kopfzeilen da sind (BW-10, §29.2); das Signal bleibt dasselbe, der Abbruch
 *  des Aufrufers wird weiter durchgereicht. */
function withDeadline(ms: number, signal?: AbortSignal): { signal: AbortSignal; rearm: (ms: number) => void; done: () => void } {
  const ac = new AbortController();
  const expire = () => ac.abort(new DOMException('Frist abgelaufen', 'TimeoutError'));
  let timer = setTimeout(expire, ms);
  const onAbort = () => ac.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ac.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: ac.signal,
    rearm: (next: number) => { clearTimeout(timer); timer = setTimeout(expire, next); },
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
  const { signal: sig, rearm, done } = withDeadline(first ? FIRST_TIMEOUT_MS : STEP_TIMEOUT_MS, signal);
  let blob: Blob;
  try {
    const res = await fetch(url, { signal: sig, cache: 'default' });
    if (!res.ok) { markBroken(`HTTP ${res.status}`); return null; }
    // BW-10: die Kopfzeilen sind da — die Frist hat ihre Frage beantwortet
    // („antwortet das CDN?"). Der Körper bekommt seine eigene, bandbreiten-
    // tolerante Frist: bei 12 parallelen Abrufen teilen sich 3 MB die Leitung,
    // und eine 6-s-Frist darauf hieße auf 3G „CDN kaputt" (§29.2).
    rearm(BODY_TIMEOUT_MS);
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
 * BW-10 (§29.3 Hebel 2): die Verbindung zum Daten-CDN aufbauen, WÄHREND das
 * Manifest noch unterwegs ist (0,55 s) — DNS + TCP + TLS fallen dann nicht mehr
 * vor das erste Bild. Einmal je Dokument, nur wenn der Weg an ist; ohne DOM
 * (Node, Verifier) ein No-op. Bewusst nicht in `index.html`: die Startseite
 * bräuchte die Verbindung nie. `crossorigin` = anonym, wie `fetch()` sie nutzt.
 */
let preconnected = false;
export function preconnectDataCdn(): void {
  if (preconnected || typeof document === 'undefined' || !repackEnabled()) return;
  preconnected = true;
  try {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = new URL(REPACK_CDN_BASE).origin;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  } catch { /* nur ein Hinweis an den Browser — ohne ihn ist nichts kaputt */ }
}

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

/**
 * Ein-Kanal-Bild eines Schritts (Böen, Gewitter, Rotation, Blitzprognose,
 * Schnee). Rückgabe ist bereits das RGBA aus `scalarFrameBuild.ts`. `null` =
 * dieser Schritt geht über GRIB.
 */
export async function loadScalarStep(
  section: RepackSection,
  family: RepackScalarFamily,
  step: number,
  signal?: AbortSignal,
): Promise<{ rgba: Uint8ClampedArray; width: number; height: number } | null> {
  const fam = section[family];
  if (state.broken || !fam) return null;
  const entry = fam.steps.find((s) => s.step === step);
  if (!entry) return null;
  const img = await loadRgba(stepUrl(section, entry.file), signal, section.grid);
  if (!img) return null;
  return { rgba: composeScalarRgba(img.data), width: img.width, height: img.height };
}

/**
 * Niederschlag eines Schritts — das `Uint8Array`, das `decodeGridStep` liefert
 * (1 Byte je Zelle, north-up, volle Auflösung). Maße gegen das EIGENE Gitter
 * der Familie. `null` = die Familie geht über GRIB.
 */
export async function loadPrecipStep(
  section: RepackSection,
  step: number,
  signal?: AbortSignal,
): Promise<{ values: Uint8Array; width: number; height: number } | null> {
  return loadGridStep(section, 'precip', step, signal);
}

/** Voll aufgelöste Familie (`precip`, `cape`) → das `Uint8Array` von `decodeGridStep`. */
export async function loadGridStep(
  section: RepackSection,
  family: 'precip' | 'cape',
  step: number,
  signal?: AbortSignal,
): Promise<{ values: Uint8Array; width: number; height: number } | null> {
  const fam = section[family];
  if (state.broken || !fam) return null;
  const entry = fam.steps.find((s) => s.step === step);
  if (!entry) return null;
  const img = await loadRgba(stepUrl(section, entry.file), signal, fam.grid);
  if (!img) return null;
  const n = img.width * img.height;
  const values = new Uint8Array(n);
  for (let i = 0; i < n; i++) values[i] = img.data[i * 4];   // Grau steht in R
  return { values, width: img.width, height: img.height };
}

// ---------------------------------------------------------------------------
// Abschnitt aus dem GRIB-Manifest (alle Familien außer Wind)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// BW-9 (§28.4/§28.5 S1): der Index des Daten-Repos, direkt vom CDN
//
// Bis BW-8 erfuhr der Browser einen neuen Repack-Lauf nur über den Abschnitt
// in `/latest-grib.json` — den ein Warm-Cron (15-min-Slot + Jitter) committet
// und Netlify baut: gemessen 5–21 min nach dem Publish, bei Lauf + 105…135 min
// insgesamt. jsDelivr löst `@main` bei einem Cache-MISS frisch auf, und der
// Publisher purgt `index.json` nach jedem Push (und prüft es nach). Der Client
// liest den Index deshalb selbst: gemessen ≈ 1 min nach dem Push.
//
// Der Manifest-Abschnitt bleibt der benannte Fallback (Rule 2): Index nicht
// lesbar, Lauf nicht drin, Schalter aus — dann gilt, was bisher galt. Und die
// Anti-Drift-Regel gilt per Konstruktion: gebaut wird nur der Eintrag für den
// Lauf, den der Aufrufer TATSÄCHLICH auflösen konnte.
//
// BW-10 (§29.3): der Index steht nicht mehr auf dem kritischen Pfad — er wird
// nur befragt, wenn Manifest-Abschnitt und Zeiger die gewünschten Schritte
// nicht decken; im Normalfall (vollständiger Abschnitt) 0 CDN-Abrufe.
// ---------------------------------------------------------------------------

/** Spiegel von `CDN_BASE` in `scripts/lib/repackManifest.mjs` — `verify:repack` prüft die Gleichheit. */
export const REPACK_CDN_BASE = 'https://cdn.jsdelivr.net/gh/jppetry/buscosun-data';
/** Spiegel von `INDEX_CDN_URL` dort. Branch-Ref, vom Publisher nach jedem Push gepurgt. */
export const REPACK_INDEX_CDN_URL = `${REPACK_CDN_BASE}@main/index.json`;
/** Sitzungs-Cache des Index: EIN geteiltes Promise je TTL-Fenster — zehn Quellen
 *  fragen denselben Lauf, nicht zehn Abrufe (dasselbe Muster wie `gribManifest.ts`). */
export const INDEX_TTL_MS = 60_000;

/**
 * Schalter NUR für den Index-Weg (`?repackidx=0` bzw. `localStorage.repackidx = '0'`),
 * dieselbe Semantik wie `repackFlagFrom`: die Query schlägt den Speicher in beide
 * Richtungen. `?repack=0` schaltet weiterhin den ganzen Repack ab.
 */
export function repackIndexFlagFrom(search: string, stored: string | null): boolean {
  const q = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search).get('repackidx');
  if (q === '1') return true;
  if (q === '0') return false;
  return stored !== '0';
}
export function repackIndexEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  let stored: string | null = null;
  try { stored = window.localStorage?.getItem('repackidx') ?? null; } catch { /* wie repackEnabled */ }
  try { return repackIndexFlagFrom(window.location.search, stored); } catch { return false; }
}

/**
 * Der Abschnitt für GENAU diesen Lauf aus dem Index — DIESELBE Regel wie
 * `sectionFor`/`pickForRun` im Cron (`repackManifest.mjs`), für EINE Familie.
 * `verify:repack` prüft beide gegeneinander am Publisher-Baum. Rein, DOM-frei;
 * die Prüfung des Ergebnisses übernimmt `parseRepackSection` — es gibt keine
 * zweite Validierung.
 */
export function sectionFromIndex(index: unknown, run: string, family: RepackFamily, base: string = REPACK_CDN_BASE): unknown {
  if (!index || typeof index !== 'object') return null;
  const ix = index as { commit?: unknown; runs?: unknown };
  if (typeof ix.commit !== 'string' || !Array.isArray(ix.runs)) return null;
  const entry = (ix.runs as unknown[]).find((r) => !!r && typeof r === 'object' && (r as { run?: unknown }).run === run) as
    Record<string, unknown> | undefined;
  if (!entry) return null;
  const fam = entry[family] as { steps?: unknown } | undefined;
  if (!fam || typeof fam !== 'object' || !Array.isArray(fam.steps) || fam.steps.length === 0) return null;
  return {
    schema: REPACK_SCHEMA,
    base,
    commit: ix.commit,
    run: entry.run,
    runAt: entry.runAt,
    path: entry.path,
    targetWidth: entry.targetWidth,
    grid: entry.grid,
    [family]: fam,
  };
}

/**
 * Zwei geprüfte Abschnitte desselben Laufs — welcher gilt? Der mit MEHR
 * Schritten der Familie (ein Re-Publish ergänzt Schritte, nimmt keine weg);
 * bei Gleichstand der Index, weil er der frischere Weg ist. Fehlt einer, der andere.
 */
export function chooseSection(
  fromIndex: RepackSection | null,
  fromManifest: RepackSection | null,
  family: RepackFamily,
): RepackSection | null {
  if (!fromIndex) return fromManifest;
  if (!fromManifest) return fromIndex;
  const n = (s: RepackSection) => (s[family] as { steps?: unknown[] } | undefined)?.steps?.length ?? 0;
  return n(fromManifest) > n(fromIndex) ? fromManifest : fromIndex;
}

/**
 * Zeiger je Lauf — Spiegel von `runPointerUrl` in `repackManifest.mjs`. Für einen
 * NEUEN Lauf ist das ein Pfad, den jsDelivr nie gesehen hat und deshalb frisch
 * holt (gemessen 35–57 s nach dem Push), während `@main/index.json` am
 * jsDelivr-Origin trotz Purge minutenlang alt bleiben kann (§28.9). Der Zeiger
 * hat dieselbe Form wie der Index (`commit` + `runs: [entry]`), also derselbe Leser.
 */
export function repackRunPointerUrl(run: string): string {
  return `${REPACK_CDN_BASE}@main/runs/${run}/index.json`;
}

let pointerCache: { at: number; run: string; p: Promise<unknown> } | null = null;
let indexCache: { at: number; p: Promise<unknown> } | null = null;
/** Nur für Tests/Verifier. */
export function resetRepackIndexCache(): void { pointerCache = null; indexCache = null; }

/**
 * Ein CDN-JSON, `null` bei JEDEM Problem — und das ist kein Defekt des
 * Repack-Wegs (`markBroken` bleibt unberührt): die Bilder können trotzdem
 * liegen, der Manifest-Abschnitt sagt dann, wo. Frist wie der erste Bildabruf.
 */
async function fetchCdnJson(url: string): Promise<unknown> {
  const { signal, done } = withDeadline(FIRST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal, cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as unknown;
  } catch {
    return null;
  } finally {
    done();
  }
}
/** Zeiger des Laufs — EIN geteiltes Promise je Lauf und TTL-Fenster. */
function cdnPointer(run: string): Promise<unknown> {
  const now = Date.now();
  if (!pointerCache || pointerCache.run !== run || now - pointerCache.at >= INDEX_TTL_MS) {
    pointerCache = { at: now, run, p: fetchCdnJson(repackRunPointerUrl(run)) };
  }
  return pointerCache.p;
}
/** Der Index — EIN geteiltes Promise je TTL-Fenster (lauf-unabhängig). */
function cdnIndex(): Promise<unknown> {
  const now = Date.now();
  if (!indexCache || now - indexCache.at >= INDEX_TTL_MS) indexCache = { at: now, p: fetchCdnJson(REPACK_INDEX_CDN_URL) };
  return indexCache.p;
}

/**
 * Der geprüfte Abschnitt für `run` und `family` aus drei Quellen — roher
 * `repack`-Abschnitt des Manifests (`manifestRaw`, den der Aufrufer schon in
 * der Hand hat — kein zweiter Manifest-Abruf), Zeiger des Laufs, CDN-Index.
 * Alle drei gehen durch DIESELBE Prüfung.
 *
 * BW-10 (§29.3 Hebel 1): die Quellen werden in Kostenreihenfolge befragt —
 * Manifest (0 Abrufe) → Zeiger (29 KB) → Index (116 KB) —, und sobald eine
 * jeden GEWÜNSCHTEN Schritt trägt, ist Schluss: mehr kann keine Quelle bieten,
 * die weiteren Abrufe stünden nur vor dem ersten Bild (gemessen 0,94 s). Ohne
 * `wanted` (Verifier, kein Aufrufer im Repo) gilt die BW-9-Regel unverändert:
 * beide CDN-Quellen parallel, es gilt der mit den meisten Schritten, bei
 * Gleichstand die frischere Quelle (Zeiger vor Index vor Manifest).
 */
export async function resolveRepackSection(
  run: string,
  family: RepackFamily,
  manifestRaw: unknown,
  wanted?: readonly number[],
): Promise<RepackSection | null> {
  if (!repackUsable()) return null;
  const fromManifest = manifestRaw ? parseRepackSection(manifestRaw, family, run) : null;
  if (!repackIndexEnabled()) return fromManifest;
  const parse = (raw: unknown): RepackSection | null =>
    (raw ? parseRepackSection(sectionFromIndex(raw, run, family), family, run) : null);
  if (!wanted) {
    const [pointer, index] = await Promise.all([cdnPointer(run), cdnIndex()]);
    return chooseSection(parse(pointer), chooseSection(parse(index), fromManifest, family), family);
  }
  if (sectionCovers(fromManifest, family, wanted)) return fromManifest;
  const fromPointer = parse(await cdnPointer(run));
  const best = chooseSection(fromPointer, fromManifest, family);
  if (sectionCovers(best, family, wanted)) return best;
  const fromIndex = parse(await cdnIndex());
  return chooseSection(fromPointer, chooseSection(fromIndex, fromManifest, family), family);
}

/**
 * Liest den `repack`-Abschnitt aus `/latest-grib.json` — über DENSELBEN
 * 60-s-Cache, den `resolveRunFromManifest` benutzt, also ohne zweiten Abruf —
 * und zieht bei Bedarf Zeiger und Index des CDN heran (`resolveRepackSection`).
 * `run` ist der Lauf, den der Aufrufer TATSÄCHLICH auflösen konnte (nicht der
 * des Manifests): passt er nicht, gibt es keinen Abschnitt. `wanted` sind die
 * Schritte, die der Aufrufer gleich laden will (BW-10).
 */
export async function resolveRepackForRun(
  run: string,
  family: RepackFamily,
  wanted?: readonly number[],
  url: string = GRIB_MANIFEST_URL,
): Promise<RepackSection | null> {
  if (!repackUsable()) return null;
  const raw = await readManifestRepack(url);
  return resolveRepackSection(run, family, raw, wanted);
}
