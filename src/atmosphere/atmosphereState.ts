/**
 * Atmosphäre · shareable state (pure codec).
 *
 * Encodes the lens, active forecast hour (+0..+48h), location, marker and the
 * Nerd-Mode flag compactly into the URL hash and reads it back. Mirrors the
 * threedState.ts pattern (`#3d=`) so a permalink reconstructs the same view.
 * Pure (de)serialisation — headless testable.
 */

import type { Country } from '../types';
import type { GeoPoint } from '../threed/sectionGeometry';

export type Lens = 'fly' | 'mountain' | 'sky' | 'section';
/** Stable order — used for the compact lens index in the hash. */
export const LENSES: Lens[] = ['fly', 'mountain', 'sky', 'section'];
export const LENS_LABEL: Record<Lens, string> = {
  fly: 'Fliegen & Thermik',
  mountain: 'Berg & Tour',
  sky: 'Himmelsschauspiel',
  section: 'Querschnitt',
};

export const HOUR_MIN = 0;
export const HOUR_MAX = 48;

export interface AtmosphereLoc { lat: number; lon: number; name: string; country: Country }
export interface AtmosphereMarker { lat: number; lon: number }

export interface AtmosphereState {
  loc: AtmosphereLoc | null;
  /** Forecast hour offset from "now", clamped to [HOUR_MIN, HOUR_MAX]. */
  hour: number;
  lens: Lens;
  nerd: boolean;
  marker: AtmosphereMarker | null;
  /** Schnittlinie der Schnitt-Linse (teilbar im Permalink). */
  cut: GeoPoint[];
}

export const HASH_PREFIX = '#atm=';

const r5 = (n: number) => Math.round(n * 1e5) / 1e5; // ~1 m precision
export const clampHour = (h: number) => Math.min(HOUR_MAX, Math.max(HOUR_MIN, Math.round(h)));

/** Encode the state into a hash string (incl. `#atm=` prefix). */
export function encodeState(s: AtmosphereState): string {
  const payload = {
    l: s.loc ? [r5(s.loc.lat), r5(s.loc.lon), s.loc.name, s.loc.country] : null,
    h: clampHour(s.hour),
    le: Math.max(0, LENSES.indexOf(s.lens)),
    n: s.nerd ? 1 : 0,
    m: s.marker ? [r5(s.marker.lat), r5(s.marker.lon)] : null,
    c: s.cut.length ? s.cut.map((p) => [r5(p.lat), r5(p.lon)]) : undefined,
  };
  return HASH_PREFIX + encodeURIComponent(JSON.stringify(payload));
}

/** Read the state from a hash string; null when missing/invalid. */
export function decodeState(hash: string): AtmosphereState | null {
  if (!hash || !hash.startsWith(HASH_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(hash.slice(HASH_PREFIX.length))) as {
      l: [number, number, string, string] | null; h: number; le: number; n: number; m: [number, number] | null; c?: [number, number][];
    };
    const loc = o.l && o.l.length >= 4 && Number.isFinite(o.l[0]) && Number.isFinite(o.l[1])
      ? { lat: o.l[0], lon: o.l[1], name: String(o.l[2]), country: o.l[3] as Country }
      : null;
    const marker = Array.isArray(o.m) && Number.isFinite(o.m[0]) && Number.isFinite(o.m[1])
      ? { lat: o.m[0], lon: o.m[1] }
      : null;
    const lens = LENSES[o.le] ?? 'sky';
    const cut = Array.isArray(o.c)
      ? o.c.filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).map((q) => ({ lat: q[0], lon: q[1] }))
      : [];
    return { loc, hour: clampHour(typeof o.h === 'number' ? o.h : 0), lens, nerd: o.n === 1, marker, cut };
  } catch { return null; }
}

/** Is an atmosphere state stored in the current browser hash? */
export function hasAtmosphereHash(hash: string): boolean {
  return !!hash && hash.startsWith(HASH_PREFIX);
}

// --- Verification (pure, DEV) ------------------------------------------------

export interface AtmCheck { case: string; ok: boolean }

export function verifyAtmosphereState(): { checks: AtmCheck[]; passed: number; failed: number } {
  const checks: AtmCheck[] = [];
  const add = (c: string, ok: boolean) => checks.push({ case: c, ok });

  const s: AtmosphereState = {
    loc: { lat: 47.2692, lon: 11.4041, name: 'Innsbruck', country: 'AT' },
    hour: 12, lens: 'mountain', nerd: true, marker: { lat: 47.3, lon: 11.4 },
    cut: [{ lat: 47.2, lon: 11.3 }, { lat: 47.4, lon: 11.5 }],
  };
  const enc = encodeState(s);
  add('hash carries prefix', enc.startsWith(HASH_PREFIX));
  const dec = decodeState(enc);
  add('decode returns object', !!dec);
  add('lens round-trips', dec?.lens === 'mountain');
  add('hour round-trips', dec?.hour === 12);
  add('nerd round-trips', dec?.nerd === true);
  add('loc round-trips', dec?.loc?.name === 'Innsbruck' && dec?.loc?.country === 'AT');
  add('coords ~equal', !!dec && Math.abs(dec.loc!.lat - 47.2692) < 1e-4);
  add('marker round-trips', !!dec?.marker && Math.abs(dec!.marker!.lat - 47.3) < 1e-4);
  add('cut round-trips', dec?.cut.length === 2 && Math.abs(dec!.cut[1].lon - 11.5) < 1e-4);

  add('hour clamps high', clampHour(99) === HOUR_MAX);
  add('hour clamps low', clampHour(-5) === HOUR_MIN);
  add('foreign hash → null', decodeState('#3d=1') === null);
  add('empty hash → null', decodeState('') === null);
  add('broken JSON → null', decodeState(HASH_PREFIX + '%7Bnope') === null);
  add('hasAtmosphereHash detects prefix', hasAtmosphereHash(enc) && !hasAtmosphereHash('#x'));

  const empty = decodeState(encodeState({ loc: null, hour: 0, lens: 'sky', nerd: false, marker: null, cut: [] }));
  add('empty round-trip', !!empty && empty.loc === null && empty.lens === 'sky' && empty.hour === 0);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyAtmosphereState: typeof verifyAtmosphereState }).__verifyAtmosphereState = verifyAtmosphereState;
}
