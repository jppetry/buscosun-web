/**
 * 3D-Wetter · Teilbarer Zustand (US-F5, pur).
 *
 * Kodiert Ort, Schnittlinie, Zeit und Layer kompakt in den URL-Hash und liest
 * sie zurück. Damit rekonstruiert ein Permalink genau dieselbe 3D-Ansicht.
 * Reine (De-)Serialisierung — headless testbar.
 */

import type { Country } from '../types';
import type { GeoPoint } from './sectionGeometry';

export interface ThreeDLayers {
  mean: boolean; gust: boolean; shear: boolean; inversion: boolean; cloudBase: boolean;
  cloudLayers: boolean; streamlines: boolean; foehn: boolean; temp: boolean;
}

export interface ThreeDState {
  loc: { lat: number; lon: number; name: string; country: Country } | null;
  points: GeoPoint[];
  timeMs: number | null;
  layers: ThreeDLayers;
}

export const HASH_PREFIX = '#3d=';

const r5 = (n: number) => Math.round(n * 1e5) / 1e5; // ~1 m Genauigkeit

/** Layer-Set als Bitmaske (stabile Reihenfolge). */
const LAYER_ORDER: Array<keyof ThreeDLayers> = ['mean', 'gust', 'shear', 'inversion', 'cloudBase', 'cloudLayers', 'streamlines', 'foehn', 'temp'];
function layersToBits(l: ThreeDLayers): number {
  let bits = 0;
  LAYER_ORDER.forEach((k, i) => { if (l[k]) bits |= 1 << i; });
  return bits;
}
function bitsToLayers(bits: number): ThreeDLayers {
  const out = {} as unknown as Record<string, boolean>;
  LAYER_ORDER.forEach((k, i) => { out[k] = !!(bits & (1 << i)); });
  return out as unknown as ThreeDLayers;
}

/** Kodiert den Zustand in einen Hash-String (inkl. `#3d=`-Präfix). */
export function encodeState(s: ThreeDState): string {
  const payload = {
    l: s.loc ? [r5(s.loc.lat), r5(s.loc.lon), s.loc.name, s.loc.country] : null,
    p: s.points.map((p) => [r5(p.lat), r5(p.lon)]),
    t: s.timeMs ?? null,
    b: layersToBits(s.layers),
  };
  return HASH_PREFIX + encodeURIComponent(JSON.stringify(payload));
}

/** Liest den Zustand aus einem Hash-String; null bei fehlend/ungültig. */
export function decodeState(hash: string): ThreeDState | null {
  if (!hash || !hash.startsWith(HASH_PREFIX)) return null;
  try {
    const raw = decodeURIComponent(hash.slice(HASH_PREFIX.length));
    const o = JSON.parse(raw) as { l: [number, number, string, string] | null; p: [number, number][]; t: number | null; b: number };
    const loc = o.l && o.l.length >= 4 && Number.isFinite(o.l[0]) && Number.isFinite(o.l[1])
      ? { lat: o.l[0], lon: o.l[1], name: String(o.l[2]), country: o.l[3] as Country }
      : null;
    const points = Array.isArray(o.p)
      ? o.p.filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).map((q) => ({ lat: q[0], lon: q[1] }))
      : [];
    return { loc, points, timeMs: typeof o.t === 'number' ? o.t : null, layers: bitsToLayers(typeof o.b === 'number' ? o.b : 0) };
  } catch { return null; }
}

/** Ist im aktuellen Browser-Hash ein 3D-Zustand hinterlegt? */
export function hasThreeDHash(hash: string): boolean {
  return !!hash && hash.startsWith(HASH_PREFIX);
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface StateCheck { case: string; ok: boolean; detail: string }

export function verifyThreeDState(): { checks: StateCheck[]; passed: number; failed: number } {
  const checks: StateCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  const s: ThreeDState = {
    loc: { lat: 47.49612, lon: 11.09823, name: 'Mittenwald, Bayern', country: 'DE' },
    points: [{ lat: 47.44, lon: 11.27 }, { lat: 47.42, lon: 11.27 }],
    timeMs: 1_700_000_000_000,
    layers: { mean: true, gust: false, shear: true, inversion: true, cloudBase: false, cloudLayers: true, streamlines: false, foehn: true, temp: false },
  };
  const enc = encodeState(s);
  add('Hash trägt Präfix', enc.startsWith(HASH_PREFIX));
  const dec = decodeState(enc);
  add('decode liefert Objekt', !!dec);
  add('Ort rekonstruiert', dec?.loc?.name === 'Mittenwald, Bayern' && dec?.loc?.country === 'DE');
  add('Koordinaten ~gleich', !!dec && Math.abs(dec.loc!.lat - 47.49612) < 1e-4 && Math.abs(dec.loc!.lon - 11.09823) < 1e-4);
  add('Punkte rekonstruiert', dec?.points.length === 2 && Math.abs(dec!.points[0].lat - 47.44) < 1e-4);
  add('Zeit rekonstruiert', dec?.timeMs === 1_700_000_000_000);
  add('Layer-Bits rekonstruiert', !!(dec && dec.layers.mean && !dec.layers.gust && dec.layers.shear && dec.layers.foehn && dec.layers.cloudLayers && !dec.layers.streamlines));

  add('Fremder Hash → null', decodeState('#other=1') === null);
  add('Leerer Hash → null', decodeState('') === null);
  add('Kaputtes JSON → null', decodeState(HASH_PREFIX + '%7Bnope') === null);
  add('hasThreeDHash erkennt Präfix', hasThreeDHash(enc) && !hasThreeDHash('#x'));

  // Ohne Ort/Punkte robust.
  const empty = decodeState(encodeState({ loc: null, points: [], timeMs: null, layers: { mean: true, gust: false, shear: false, inversion: false, cloudBase: false, cloudLayers: false, streamlines: false, foehn: false, temp: false } }));
  add('Leerzustand roundtrip', !!empty && empty.loc === null && empty.points.length === 0 && empty.timeMs === null && empty.layers.mean);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyThreeDState: typeof verifyThreeDState }).__verifyThreeDState = verifyThreeDState;
}
