/**
 * Atmosphäre · Zustand in der QUERY (Phase SH3, pur).
 *
 * Löst den Fragment-Codec `#atm=` ab (`atmosphereState.ts`, bleibt als Leser
 * für Alt-Links erhalten). Der Grund ist nicht Kosmetik:
 *
 *   Ein `#…`-Fragment wird vom Browser **nie an den Server gesendet**. Solange
 *   der Zustand dort steht, kann kein Vorschaubild und kein zustandsbezogener
 *   `og:title` entstehen — weder aus der Shell noch aus einer Edge Function
 *   (`audit/teilen-share.md` §1.2). Der Umzug ist die Voraussetzung für Teil 4.
 *
 * Zweitens war die Zeit **relativ** (`h` = Stunden ab jetzt). Wer einen Link
 * mit „+12 h" verschickt, zeigt dem Empfänger zwei Stunden später eine andere
 * Stunde. Hier steht sie absolut (`t=2026-09-13T00:00Z`).
 *
 * Die Linse (`/atmosphaere/<linse>`) und die Unterlinse (`ansicht=`) bleiben,
 * wo sie sind — sie gehören dem Router-Wrapper. Diese Datei kennt nur das,
 * was bisher im Fragment lag: Ort, Zeit, Nerd-Modus, Marker, Schnittlinie.
 */

import type { Location } from '../types';
import type { GeoPoint } from '../threed/sectionGeometry';
import { encodeShareQuery, fmtCoord, formatValidTime, parseValidTime, roundTo } from '../share/shareSchema';
import { HOUR_MAX, HOUR_MIN, clampHour } from './atmosphereState';

/** Höchstzahl der Stützpunkte einer Schnittlinie (`simplifyToCutLine`, `maxPoints`). */
export const CUT_MAX_POINTS = 24;

export interface AtmosphereUrlState {
  place: Location | null;
  /** Absolute Gültigkeitszeit in ms; `null` = jetzt. */
  validAtMs: number | null;
  nerd: boolean;
  /** Profil-Marker; `null` **oder gleich dem Ort** ⇒ steht nicht in der URL. */
  marker: { lat: number; lon: number } | null;
  cut: GeoPoint[];
}

/** Feste Schlüsselreihenfolge — byte-stabile Links, brauchbarer Cache-Schlüssel. */
export const ATMOSPHERE_QUERY_ORDER = ['t', 'nerd', 'marker', 'schnitt', 'ort', 'olat', 'olon', 'land'] as const;
const KNOWN: ReadonlySet<string> = new Set([...ATMOSPHERE_QUERY_ORDER, 'ansicht']);

/** Weicht der Marker so weit vom Ort ab, dass er in die URL gehört? (≈ 11 m) */
function markerDiffers(m: { lat: number; lon: number } | null, place: Location | null): boolean {
  if (!m) return false;
  if (!place) return true;
  return Math.abs(roundTo(m.lat, 4) - roundTo(place.lat, 4)) > 1e-9
    || Math.abs(roundTo(m.lon, 4) - roundTo(place.lon, 4)) > 1e-9;
}

const pt = (p: { lat: number; lon: number }) => `${fmtCoord(p.lat)},${fmtCoord(p.lon)}`;

/**
 * Zustand → Query-Paare. Standardwerte werden weggelassen; `slug`/`inTable`
 * kommen vom Aufrufer (`slugForPlace`, `src/share/placeTable.ts`), damit dieses
 * Modul die Ortstabelle nicht mitzieht.
 */
export function atmospherePairs(
  s: AtmosphereUrlState,
  slug: { slug: string; inTable: boolean } | null,
  extra: ReadonlyArray<[string, string]> = [],
): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (s.validAtMs != null) out.push(['t', formatValidTime(s.validAtMs)]);
  if (s.nerd) out.push(['nerd', '1']);
  if (markerDiffers(s.marker, s.place)) out.push(['marker', pt(s.marker!)]);
  if (s.cut.length >= 2) out.push(['schnitt', s.cut.slice(0, CUT_MAX_POINTS).map(pt).join(';')]);
  if (s.place) {
    if (slug?.inTable) {
      // Der Slug im Pfad trägt Name, Punkt und Land; nur ein abweichendes Land
      // bleibt sichtbar (dieselbe Regel wie auf der Wetterkarte, SH1).
      if (s.place.country !== 'DE') out.push(['land', s.place.country.toLowerCase()]);
    } else {
      out.push(['ort', s.place.name], ['olat', fmtCoord(s.place.lat)], ['olon', fmtCoord(s.place.lon)], ['land', s.place.country.toLowerCase()]);
    }
  }
  const ordered = ATMOSPHERE_QUERY_ORDER.flatMap((k) => out.filter(([ok]) => ok === k));
  for (const [k, v] of extra) if (!KNOWN.has(k)) ordered.push([k, v]);
  return ordered;
}

export function buildAtmosphereSearch(
  s: AtmosphereUrlState,
  slug: { slug: string; inTable: boolean } | null,
  extra: ReadonlyArray<[string, string]> = [],
): string {
  return encodeShareQuery(atmospherePairs(s, slug, extra));
}

export interface ParsedAtmosphereQuery {
  /** Ort aus der Query (der Pfad-Slug kommt getrennt dazu). */
  place: Location | null;
  validAtMs: number | null;
  /** `t` lag in der Vergangenheit und wurde auf „jetzt" geklemmt (V-SH-2). */
  timePast: boolean;
  /** Welcher Zeitpunkt im Link stand (ms); `timePast` sagt, ob er vorbei war. */
  wantedAtMs: number | null;
  nerd: boolean;
  marker: { lat: number; lon: number } | null;
  cut: GeoPoint[];
  /** Bekannte Schlüssel mit unbrauchbarem Wert — der Aufrufer entfernt sie. */
  invalid: string[];
  /** Fremde Schlüssel (`ansicht` gehört dem Wrapper und bleibt hier draußen). */
  extra: Array<[string, string]>;
}

const num = (s: string | undefined) => {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function parsePoint(raw: string): { lat: number; lon: number } | null {
  const [a, b] = raw.split(',');
  const lat = num(a), lon = num(b);
  if (lat == null || lon == null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat: roundTo(lat, 4), lon: roundTo(lon, 4) };
}

/** Query → Zustand. Nie ein Wurf: Unbrauchbares fällt auf den Standard zurück. */
export function parseAtmosphereQuery(search: string, nowMs: number): ParsedAtmosphereQuery {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const invalid: string[] = [];
  const extra: Array<[string, string]> = [];
  for (const [k, v] of p.entries()) if (!KNOWN.has(k)) extra.push([k, v]);

  let validAtMs: number | null = null;
  let timePast = false;
  let wantedAtMs: number | null = null;
  if (p.has('t')) {
    const ms = parseValidTime(p.get('t'));
    if (ms == null) invalid.push('t');
    else {
      wantedAtMs = ms;                          // was der Link verlangt hat
      if (ms < nowMs) timePast = true;          // ⇒ „jetzt", aber benannt
      else validAtMs = ms;
    }
  }

  const nerd = p.get('nerd') === '1';
  if (p.has('nerd') && p.get('nerd') !== '1') invalid.push('nerd');

  let marker: { lat: number; lon: number } | null = null;
  if (p.has('marker')) {
    marker = parsePoint(p.get('marker') ?? '');
    if (!marker) invalid.push('marker');
  }

  let cut: GeoPoint[] = [];
  if (p.has('schnitt')) {
    const pts = (p.get('schnitt') ?? '').split(';').map(parsePoint).filter((x): x is GeoPoint => !!x);
    // Eine Linie braucht zwei Punkte; alles darunter ist keine Schnittlinie.
    if (pts.length >= 2) cut = pts.slice(0, CUT_MAX_POINTS); else invalid.push('schnitt');
  }

  let place: Location | null = null;
  const landRaw = (p.get('land') ?? '').toUpperCase();
  const country = landRaw === 'AT' || landRaw === 'CH' ? landRaw : landRaw === 'DE' ? 'DE' : null;
  if (p.has('land') && !country) invalid.push('land');
  if (p.has('ort') || p.has('olat') || p.has('olon')) {
    const name = (p.get('ort') ?? '').trim();
    const olat = num(p.get('olat') ?? undefined), olon = num(p.get('olon') ?? undefined);
    if (olat != null && olon != null && Math.abs(olat) <= 90 && Math.abs(olon) <= 180) {
      place = { name, lat: roundTo(olat, 4), lon: roundTo(olon, 4), country: country ?? 'DE' };
    } else {
      for (const k of ['ort', 'olat', 'olon']) if (p.has(k)) invalid.push(k);
    }
  }

  return { place, validAtMs, timePast, wantedAtMs, nerd, marker, cut, invalid, extra };
}

/** Absolute Zeit → Scrubber-Stunde (0…48). `null` ⇒ 0 („jetzt"). */
export function hourFromValidAt(validAtMs: number | null, nowMs: number): number {
  if (validAtMs == null) return HOUR_MIN;
  return clampHour(Math.round((validAtMs - nowMs) / 3_600_000));
}

/** Scrubber-Stunde → absolute Zeit. Stunde 0 ⇒ `null` (kein `t` in der URL). */
export function validAtFromHour(hour: number, nowMs: number): number | null {
  const h = clampHour(hour);
  return h <= 0 ? null : nowMs + h * 3_600_000;
}

// --- Selbstverifikation (Muster D-12) ---------------------------------------

export interface AtmUrlCheck { name: string; ok: boolean; detail?: string }

export function verifyAtmosphereUrl(): { checks: AtmUrlCheck[]; passed: number; failed: number } {
  const checks: AtmUrlCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const now = Date.UTC(2026, 8, 12, 12, 0);
  const ibk: Location = { name: 'Innsbruck', lat: 47.2692, lon: 11.4041, country: 'AT' };

  add('Standardzustand schreibt nichts',
    buildAtmosphereSearch({ place: null, validAtMs: null, nerd: false, marker: null, cut: [] }, null) === '');

  const tableSlug = { slug: 'innsbruck', inTable: true };
  const s1: AtmosphereUrlState = { place: ibk, validAtMs: Date.UTC(2026, 8, 13, 0, 0), nerd: false, marker: null, cut: [] };
  add('Tabellenort: nur Zeit und ein abweichendes Land',
    buildAtmosphereSearch(s1, tableSlug) === '?t=2026-09-13T00:00Z&land=at', buildAtmosphereSearch(s1, tableSlug));
  add('Zeit steht absolut und roh (kein %3A)', !buildAtmosphereSearch(s1, tableSlug).includes('%3A'));

  const free: Location = { name: 'Nordkette', lat: 47.3125, lon: 11.3831, country: 'AT' };
  const s2: AtmosphereUrlState = {
    place: free, validAtMs: null, nerd: true,
    marker: { lat: 47.32, lon: 11.39 },
    cut: [{ lat: 47.2, lon: 11.3 }, { lat: 47.4, lon: 11.5 }],
  };
  const q2 = buildAtmosphereSearch(s2, { slug: 'nordkette', inTable: false });
  add('freier Ort: Koordinate, Marker und Schnittlinie stehen lesbar da',
    q2 === '?nerd=1&marker=47.32,11.39&schnitt=47.2,11.3;47.4,11.5&ort=Nordkette&olat=47.3125&olon=11.3831&land=at', q2);

  // Rundlauf
  const back = parseAtmosphereQuery(q2, now);
  add('Rundlauf: Ort', back.place?.name === 'Nordkette' && back.place.lat === 47.3125 && back.place.country === 'AT');
  add('Rundlauf: Nerd, Marker, Schnittlinie',
    back.nerd && back.marker?.lat === 47.32 && back.cut.length === 2 && back.cut[1].lon === 11.5);
  add('Rundlauf: kein Invalid, kein Extra', back.invalid.length === 0 && back.extra.length === 0);
  add('Rundlauf ist ein Fixpunkt',
    buildAtmosphereSearch({ ...s2, place: back.place, marker: back.marker, cut: back.cut }, { slug: 'nordkette', inTable: false }) === q2);

  // Marker == Ort ⇒ keine Dublette in der URL
  add('Marker gleich dem Ort steht NICHT in der URL',
    !buildAtmosphereSearch({ place: ibk, validAtMs: null, nerd: false, marker: { lat: ibk.lat, lon: ibk.lon }, cut: [] }, tableSlug).includes('marker='));

  // Zeit
  add('Stunde ⇄ absolute Zeit', hourFromValidAt(validAtFromHour(12, now), now) === 12 && validAtFromHour(0, now) === null);
  add('Stunde wird geklemmt', hourFromValidAt(now + 99 * 3_600_000, now) === HOUR_MAX);
  add('vergangene Zeit ⇒ jetzt, aber gemeldet (V-SH-2)',
    (() => { const r = parseAtmosphereQuery('?t=2026-09-12T09:00Z', now); return r.validAtMs === null && r.timePast; })());
  add('V-SH-2: der vergangene Zeitpunkt wird benannt',
    (() => { const r = parseAtmosphereQuery('?t=2026-09-12T09:00Z', now); return r.wantedAtMs === Date.UTC(2026, 8, 12, 9, 0); })());
  add('ein künftiger Zeitpunkt wird ebenfalls benannt, gilt aber nicht als vorbei',
    (() => { const r = parseAtmosphereQuery('?t=2026-09-12T15:00Z', now); return r.timePast === false && r.wantedAtMs === Date.UTC(2026, 8, 12, 15, 0); })());
  add('ohne `t` gibt es keinen verlangten Zeitpunkt',
    parseAtmosphereQuery('?nerd=1', now).wantedAtMs === null);

  // Robustheit
  const bad = parseAtmosphereQuery('?t=gestern&nerd=2&marker=abc&schnitt=47.2,11.3&ort=&olat=999&olon=1&land=fr&ansicht=inversion&fremd=1', now);
  add('Unbrauchbares wird gemeldet, nicht geworfen',
    ['t', 'nerd', 'marker', 'schnitt', 'ort', 'olat', 'olon', 'land'].every((k) => bad.invalid.includes(k)), bad.invalid.join(','));
  add('Einzelpunkt ist keine Schnittlinie', bad.cut.length === 0);
  add('`ansicht` gehört dem Wrapper und wird nicht als fremd gemeldet', !bad.extra.some(([k]) => k === 'ansicht'));
  add('echte Fremdschlüssel bleiben erhalten', bad.extra.some(([k]) => k === 'fremd'));
  add('leere Query ⇒ Standard', (() => { const r = parseAtmosphereQuery('', now); return !r.place && r.validAtMs === null && !r.nerd && !r.cut.length; })());

  // Deckel: eine importierte Tour bringt bis zu 24 Punkte mit.
  const many = Array.from({ length: 40 }, (_, i) => ({ lat: 47 + i * 0.01, lon: 11 + i * 0.01 }));
  const capped = parseAtmosphereQuery(buildAtmosphereSearch({ place: null, validAtMs: null, nerd: false, marker: null, cut: many }, null), now);
  add('Schnittlinie ist auf 24 Punkte gedeckelt', capped.cut.length === CUT_MAX_POINTS, String(capped.cut.length));

  const failed = checks.filter((c) => !c.ok).length;
  return { checks, passed: checks.length - failed, failed };
}
