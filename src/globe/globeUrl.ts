/**
 * 3D-Globus · Zustand in der QUERY (Phase SH4, pur).
 *
 * Löst den Fragment-Permalink `#g=` ab, der bisher direkt in `GlobePage.tsx`
 * gebaut wurde (prozentkodiertes JSON). Drei Dinge ändern sich dabei, alle drei
 * inhaltlich:
 *
 *  1. **Pfad + Query statt Fragment** — ein `#…` erreicht den Server nie, also
 *     kann daraus kein Vorschaubild und kein `og:title` entstehen
 *     (`audit/teilen-share.md` §1.2).
 *  2. **Absolute Zeit statt Vorhersagestunde.** `fh` zählte Stunden ab dem
 *     GFS-Lauf. Der Lauf wechselt alle sechs Stunden — ein geteilter Link zeigte
 *     dem Empfänger danach einen anderen Zeitpunkt. Jetzt steht die
 *     Gültigkeitszeit da; die Stunde rechnet die Seite aus, sobald sie den Lauf
 *     kennt (der kommt asynchron, s. `GlobePage`).
 *  3. **Die Achsenreihenfolge wird gerade gezogen.** `#g=` speicherte
 *     `pin: [lon, lat]` und `c: [lon, lat]` — überall sonst im Repo steht
 *     `lat, lon` (repo-weite Lehre 2 der Waldbrand-Linie). Der neue Parameter
 *     ist `pin=lat,lon`; der **Leser für Alt-Links behält die alte Reihenfolge**,
 *     sonst spränge jeder bestehende Link nach Asien.
 */

import { encodeShareQuery, fmtCoord, fmtNum, formatValidTime, parseValidTime, roundTo } from '../share/shareSchema';
import type { Height, OverlayKind } from './gfs';
import type { Projection } from './GlobeMap';

/** Vorhersagestunden-Raster des Globus (`GlobePage`: FH_STEP / FH_MAX). */
export const GLOBE_FH_STEP = 3;
export const GLOBE_FH_MAX = 120;

export const GLOBE_DEFAULTS = {
  overlay: 'temp' as OverlayKind,
  height: 'sfc' as Height,
  projection: 'globe' as Projection,
  particles: true,
  hd: false,
};

const OVERLAY_SLUGS: ReadonlyArray<readonly [OverlayKind, string]> = [
  ['none', 'keins'], ['wind', 'wind'], ['temp', 'temperatur'], ['rh', 'feuchte'], ['mslp', 'druck'],
] as const;
const HEIGHT_SLUGS: ReadonlyArray<readonly [Height, string]> = [
  ['sfc', 'boden'], ['850', '850'], ['500', '500'], ['250', '250'],
] as const;

export interface GlobePoint { lat: number; lon: number }

export interface GlobeUrlState {
  overlay: OverlayKind;
  height: Height;
  /** Absolute Gültigkeitszeit; `null` = der erste Schritt des laufenden Laufs. */
  validAtMs: number | null;
  /** Kameramitte; `null` = Standardblick. */
  center: GlobePoint | null;
  zoom: number | null;
  /** Gesetzter Punkt (Ablesepunkt); `null` = keiner. */
  pin: GlobePoint | null;
  projection: Projection;
  particles: boolean;
  hd: boolean;
}

export const GLOBE_QUERY_ORDER = ['feld', 'hoehe', 't', 'c', 'z', 'pin', 'flach', 'partikel', 'hd'] as const;
const KNOWN: ReadonlySet<string> = new Set(GLOBE_QUERY_ORDER);

const pt = (p: GlobePoint) => `${fmtCoord(p.lat)},${fmtCoord(p.lon)}`;

/** Zustand → Query-Paare, Standardwerte weggelassen, feste Reihenfolge. */
export function globePairs(s: GlobeUrlState, extra: ReadonlyArray<[string, string]> = []): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (s.overlay !== GLOBE_DEFAULTS.overlay) out.push(['feld', OVERLAY_SLUGS.find(([k]) => k === s.overlay)?.[1] ?? 'temperatur']);
  if (s.height !== GLOBE_DEFAULTS.height) out.push(['hoehe', HEIGHT_SLUGS.find(([k]) => k === s.height)?.[1] ?? 'boden']);
  if (s.validAtMs != null) out.push(['t', formatValidTime(s.validAtMs)]);
  if (s.center) out.push(['c', pt(s.center)]);
  if (s.zoom != null) out.push(['z', fmtNum(s.zoom, 1)]);
  if (s.pin) out.push(['pin', pt(s.pin)]);
  if (s.projection !== GLOBE_DEFAULTS.projection) out.push(['flach', '1']);
  if (s.particles !== GLOBE_DEFAULTS.particles) out.push(['partikel', '0']);
  if (s.hd !== GLOBE_DEFAULTS.hd) out.push(['hd', '1']);
  const ordered = GLOBE_QUERY_ORDER.flatMap((k) => out.filter(([ok]) => ok === k));
  for (const [k, v] of extra) if (!KNOWN.has(k)) ordered.push([k, v]);
  return ordered;
}

export function buildGlobeSearch(s: GlobeUrlState, extra: ReadonlyArray<[string, string]> = []): string {
  return encodeShareQuery(globePairs(s, extra));
}

export interface ParsedGlobeQuery extends GlobeUrlState {
  /** `t` lag in der Vergangenheit und wurde verworfen (V-SH-2). */
  timePast: boolean;
  /** Welcher Zeitpunkt im Link stand (ms); `timePast` sagt, ob er vorbei war. */
  wantedAtMs: number | null;
  invalid: string[];
  extra: Array<[string, string]>;
}

function parsePoint(raw: string | null): GlobePoint | null {
  if (!raw) return null;
  const [a, b] = raw.split(',');
  const lat = Number(a), lon = Number(b);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: roundTo(lat, 4), lon: roundTo(lon, 4) };
}

/** Query → Zustand. Nie ein Wurf: Unbrauchbares fällt auf den Standard zurück. */
export function parseGlobeQuery(search: string, nowMs: number): ParsedGlobeQuery {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const invalid: string[] = [];
  const extra: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (!KNOWN.has(k)) extra.push([k, v]);

  let overlay = GLOBE_DEFAULTS.overlay;
  if (p.has('feld')) {
    const hit = OVERLAY_SLUGS.find(([, sl]) => sl === p.get('feld'));
    if (hit) overlay = hit[0]; else invalid.push('feld');
  }
  let height = GLOBE_DEFAULTS.height;
  if (p.has('hoehe')) {
    const hit = HEIGHT_SLUGS.find(([, sl]) => sl === p.get('hoehe'));
    if (hit) height = hit[0]; else invalid.push('hoehe');
  }

  let validAtMs: number | null = null;
  let timePast = false;
  let wantedAtMs: number | null = null;
  if (p.has('t')) {
    const ms = parseValidTime(p.get('t'));
    if (ms == null) invalid.push('t');
    else {
      wantedAtMs = ms;
      // Eine Stunde Kulanz: der Lauf liegt zurück, der Zeitpunkt ist noch gemeint.
      if (ms < nowMs - 3_600_000) timePast = true;
      else validAtMs = ms;
    }
  }

  let center: GlobePoint | null = null;
  if (p.has('c')) { center = parsePoint(p.get('c')); if (!center) invalid.push('c'); }
  let zoom: number | null = null;
  if (p.has('z')) {
    const z = Number(p.get('z'));
    if (Number.isFinite(z) && z > 0 && z < 24) zoom = roundTo(z, 1); else invalid.push('z');
  }
  let pin: GlobePoint | null = null;
  if (p.has('pin')) { pin = parsePoint(p.get('pin')); if (!pin) invalid.push('pin'); }

  const projection: Projection = p.get('flach') === '1' ? 'flat' : GLOBE_DEFAULTS.projection;
  if (p.has('flach') && p.get('flach') !== '1') invalid.push('flach');
  const particles = p.has('partikel') ? p.get('partikel') !== '0' : GLOBE_DEFAULTS.particles;
  if (p.has('partikel') && p.get('partikel') !== '0') invalid.push('partikel');
  const hd = p.get('hd') === '1';
  if (p.has('hd') && p.get('hd') !== '1') invalid.push('hd');

  return { overlay, height, validAtMs, center, zoom, pin, projection, particles, hd, timePast, wantedAtMs, invalid, extra };
}

// --- Vorhersagestunde ⇄ absolute Zeit ----------------------------------------

/**
 * Gewünschte Gültigkeitszeit → Vorhersagestunde des laufenden Laufs.
 *
 * `runStartMs` kennt die Seite erst, wenn der erste Frame geladen ist
 * (`RunInfo.validMs − fhour·1 h`) — deshalb ist das eine eigene Funktion und
 * kein Teil des Parsers.
 */
export function fhourForValidAt(validAtMs: number, runStartMs: number): number {
  const raw = Math.round((validAtMs - runStartMs) / 3_600_000 / GLOBE_FH_STEP) * GLOBE_FH_STEP;
  return Math.min(GLOBE_FH_MAX, Math.max(0, raw));
}

export const validAtForFhour = (fhour: number, runStartMs: number) => runStartMs + fhour * 3_600_000;

// --- Alt-Link `#g=` ----------------------------------------------------------

/** Der alte Permalink — **`c` und `pin` in der Reihenfolge `[lon, lat]`**. */
interface LegacyGlobeState {
  ov?: OverlayKind; ht?: Height; fh?: number; pj?: Projection;
  pa?: boolean; hd?: boolean; c?: [number, number]; z?: number; pin?: [number, number];
}

/**
 * `#g=…` → Zustand. Die Zeit bleibt hier eine **Vorhersagestunde** (`fhour`) —
 * der Lauf ist beim Ankommen noch nicht bekannt, also kann sie nicht in eine
 * absolute Zeit übersetzt werden, ohne etwas zu erfinden.
 */
export function decodeGlobeHash(hash: string): { state: GlobeUrlState; fhour: number } | null {
  const m = /[#&]g=([^&]+)/.exec(hash);
  if (!m) return null;
  let o: LegacyGlobeState;
  try { o = JSON.parse(decodeURIComponent(m[1])) as LegacyGlobeState; } catch { return null; }
  // ⚠ Achsen: [lon, lat] — die alte Reihenfolge, die genau hier stehen bleiben muss.
  const flip = (a: [number, number] | undefined): GlobePoint | null =>
    Array.isArray(a) && Number.isFinite(a[0]) && Number.isFinite(a[1]) && Math.abs(a[1]) <= 90 && Math.abs(a[0]) <= 180
      ? { lat: roundTo(a[1], 4), lon: roundTo(a[0], 4) } : null;
  return {
    state: {
      overlay: OVERLAY_SLUGS.some(([k]) => k === o.ov) ? (o.ov as OverlayKind) : GLOBE_DEFAULTS.overlay,
      height: HEIGHT_SLUGS.some(([k]) => k === o.ht) ? (o.ht as Height) : GLOBE_DEFAULTS.height,
      validAtMs: null,
      center: flip(o.c),
      zoom: typeof o.z === 'number' && Number.isFinite(o.z) ? roundTo(o.z, 1) : null,
      pin: flip(o.pin),
      projection: o.pj === 'flat' ? 'flat' : GLOBE_DEFAULTS.projection,
      particles: o.pa !== false,
      hd: o.hd === true,
    },
    fhour: typeof o.fh === 'number' && Number.isFinite(o.fh) ? fhourForValidAt(o.fh * 3_600_000, 0) : 0,
  };
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface GlobeUrlCheck { name: string; ok: boolean; detail?: string }

const base = (over: Partial<GlobeUrlState> = {}): GlobeUrlState => ({
  overlay: 'temp', height: 'sfc', validAtMs: null, center: null, zoom: null,
  pin: null, projection: 'globe', particles: true, hd: false, ...over,
});

export function verifyGlobeUrl(): { checks: GlobeUrlCheck[]; passed: number; failed: number } {
  const checks: GlobeUrlCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 8, 12, 12, 0);

  add('Standardzustand schreibt nichts', buildGlobeSearch(base()) === '', buildGlobeSearch(base()));

  const s = base({
    overlay: 'wind', height: '500', validAtMs: Date.UTC(2026, 8, 13, 12, 0),
    center: { lat: 51.2, lon: 10.4 }, zoom: 2.6, pin: { lat: 48.14, lon: 11.58 },
    projection: 'flat', particles: false, hd: true,
  });
  const q = buildGlobeSearch(s);
  add('voller Zustand bleibt lesbar',
    q === '?feld=wind&hoehe=500&t=2026-09-13T12:00Z&c=51.2,10.4&z=2.6&pin=48.14,11.58&flach=1&partikel=0&hd=1', q);
  add('keine unnötige Prozentkodierung', !/%3A|%2C/i.test(q));

  const back = parseGlobeQuery(q, now);
  add('Rundlauf: Feld, Höhe, Projektion, Partikel, HD',
    back.overlay === 'wind' && back.height === '500' && back.projection === 'flat' && !back.particles && back.hd);
  add('Rundlauf: Zeit, Kamera, Pin', back.validAtMs === Date.UTC(2026, 8, 13, 12, 0)
    && back.center?.lat === 51.2 && back.zoom === 2.6 && back.pin?.lat === 48.14 && back.pin.lon === 11.58);
  add('Rundlauf ist ein Fixpunkt', buildGlobeSearch(back) === q);
  add('Rundlauf: kein Invalid, kein Extra', back.invalid.length === 0 && back.extra.length === 0);

  // --- V-SH-3: die Achsen werden gerade gezogen, ohne Alt-Links zu brechen.
  const legacyHash = '#g=' + encodeURIComponent(JSON.stringify({ ov: 'temp', ht: 'sfc', fh: 24, pj: 'globe', pa: true, hd: false, c: [10.4, 51.2], z: 2.6, pin: [11.58, 48.14] }));
  const legacy = decodeGlobeHash(legacyHash);
  add('Alt-Link `#g=` wird gelesen', !!legacy);
  add('Alt-Link: [lon, lat] wird korrekt gedreht (V-SH-3)',
    legacy?.state.pin?.lat === 48.14 && legacy.state.pin.lon === 11.58
    && legacy.state.center?.lat === 51.2 && legacy.state.center.lon === 10.4,
    JSON.stringify(legacy?.state.pin));
  add('Alt-Link: die Vorhersagestunde bleibt eine Stunde (der Lauf ist noch unbekannt)', legacy?.fhour === 24);
  add('Alt-Link: Standardwerte bleiben Standard', buildGlobeSearch({ ...legacy!.state, center: null, zoom: null, pin: null }) === '');
  add('Kein `#g=` ⇒ null', decodeGlobeHash('#atm=x') === null && decodeGlobeHash('') === null);
  add('kaputtes `#g=` ⇒ null, kein Wurf', decodeGlobeHash('#g=%7Bnope') === null);

  // --- Stunde ⇄ Zeit
  const runStart = Date.UTC(2026, 8, 12, 6, 0);
  add('Stunde ⇄ Zeit im 3-h-Raster',
    fhourForValidAt(validAtForFhour(24, runStart), runStart) === 24
    && fhourForValidAt(runStart + 25 * 3_600_000, runStart) === 24);
  add('Stunde wird auf 0…120 geklemmt',
    fhourForValidAt(runStart - 5 * 3_600_000, runStart) === 0 && fhourForValidAt(runStart + 999 * 3_600_000, runStart) === GLOBE_FH_MAX);

  // --- Robustheit
  const bad = parseGlobeQuery('?feld=quatsch&hoehe=999&t=gestern&c=abc&z=99&pin=200,0&flach=2&partikel=7&hd=9&fremd=1', now);
  add('jeder unbrauchbare Wert wird gemeldet',
    ['feld', 'hoehe', 't', 'c', 'z', 'pin', 'flach', 'partikel', 'hd'].every((k) => bad.invalid.includes(k)), bad.invalid.join(','));
  add('und fällt auf den Standard zurück', bad.overlay === 'temp' && bad.height === 'sfc' && bad.center === null && bad.pin === null && bad.projection === 'globe');
  add('Fremdschlüssel bleiben erhalten', bad.extra.some(([k]) => k === 'fremd'));
  add('vergangene Zeit wird gemeldet und verworfen (V-SH-2)',
    (() => { const r = parseGlobeQuery('?t=2026-09-11T12:00Z', now); return r.timePast && r.validAtMs === null; })());
  add('V-SH-2: der vergangene Zeitpunkt wird benannt',
    (() => { const r = parseGlobeQuery('?t=2026-09-11T12:00Z', now); return r.wantedAtMs === Date.UTC(2026, 8, 11, 12, 0); })());

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
