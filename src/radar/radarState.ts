/**
 * Regenradar — teilbarer Zustand (Permalink #r=) + „letzte Ansicht merken".
 *
 * Kodiert Ort, aktive Layer, Palette, Basemap und Lead-Minuten kompakt in den
 * URL-Hash, sodass ein Link genau dieselbe Radaransicht rekonstruiert (§6
 * „Deep-link to exact view"). Reine (De-)Serialisierung — headless prüfbar.
 */

import type { Country, Location } from '../types';
import type { RadarLayerId, PaletteId } from './radarModel';
import { PALETTES, RADAR_PRESETS } from './radarModel';

export const RADAR_HASH_PREFIX = '#r=';

export type Basemap = 'streets' | 'terrain' | 'satellite';

export interface RadarViewState {
  location: Location;
  layers: RadarLayerId[];
  palette: PaletteId;
  basemap: Basemap;
  /** Lead-Minuten des angezeigten Frames (0 = jetzt; negativ = Vergangenheit). */
  leadMin: number;
  opacity: number;
}

// Reihenfolge ist Bit-Position der persistierten Layer-Maske → neue IDs ANHÄNGEN,
// nicht einfügen (sonst verschieben sich gespeicherte Zustände).
const ALL_LAYERS: RadarLayerId[] = ['precip', 'rain', 'snowline', 'lightning', 'cells', 'accum', 'wind', 'warnings', 'coverage', 'snow', 'graupel', 'hail'];
function layersToBits(ls: RadarLayerId[]): number {
  let b = 0; for (const l of ls) { const i = ALL_LAYERS.indexOf(l); if (i >= 0) b |= 1 << i; } return b;
}
function bitsToLayers(b: number): RadarLayerId[] {
  return ALL_LAYERS.filter((_, i) => !!(b & (1 << i)));
}
const PAL_IDX: PaletteId[] = ['classic', 'viridis', 'mono'];
const BASE_IDX: Basemap[] = ['streets', 'terrain', 'satellite'];
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function encodeRadarState(s: RadarViewState): string {
  const payload = {
    l: [r5(s.location.lat), r5(s.location.lon), s.location.name, s.location.country],
    y: layersToBits(s.layers),
    p: PAL_IDX.indexOf(s.palette),
    b: BASE_IDX.indexOf(s.basemap),
    t: Math.round(s.leadMin),
    o: Math.round(s.opacity * 100),
  };
  return RADAR_HASH_PREFIX + encodeURIComponent(JSON.stringify(payload));
}

export function decodeRadarState(hash: string): RadarViewState | null {
  if (!hash || !hash.startsWith(RADAR_HASH_PREFIX)) return null;
  try {
    const o = JSON.parse(decodeURIComponent(hash.slice(RADAR_HASH_PREFIX.length))) as {
      l: [number, number, string, string]; y: number; p: number; b: number; t: number; o: number;
    };
    if (!Array.isArray(o.l) || !Number.isFinite(o.l[0]) || !Number.isFinite(o.l[1])) return null;
    const location: Location = { lat: o.l[0], lon: o.l[1], name: String(o.l[2] ?? ''), country: o.l[3] as Country };
    const layers = bitsToLayers(typeof o.y === 'number' ? o.y : 1);
    return {
      location,
      layers: layers.length ? layers : ['precip'],
      palette: PAL_IDX[o.p] ?? 'classic',
      basemap: BASE_IDX[o.b] ?? 'streets',
      leadMin: typeof o.t === 'number' ? o.t : 0,
      opacity: typeof o.o === 'number' ? Math.min(1, Math.max(0.2, o.o / 100)) : 0.85,
    };
  } catch { return null; }
}

export function hasRadarHash(hash: string): boolean {
  return !!hash && hash.startsWith(RADAR_HASH_PREFIX);
}

// --- „Letzte Ansicht merken" (§6 Remember last view) ------------------------

const LAST_KEY = 'buscosun.radar.lastview.v1';

export function saveLastView(s: Pick<RadarViewState, 'layers' | 'palette' | 'basemap' | 'opacity'> & { location?: Location }): void {
  try { localStorage.setItem(LAST_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
export function loadLastView(): Partial<RadarViewState> | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Partial<RadarViewState>) : null;
  } catch { return null; }
}

// --- Verify -----------------------------------------------------------------

export interface RsCheck { name: string; ok: boolean; detail?: string }
export interface RsVerifyResult { checks: RsCheck[]; passed: number; failed: number }

export function verifyRadarState(): RsVerifyResult {
  const checks: RsCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const s: RadarViewState = {
    location: { lat: 50.7374, lon: 8.2913, name: 'Wetzlar', country: 'DE' },
    layers: ['precip', 'cells', 'lightning'],
    palette: 'viridis', basemap: 'terrain', leadMin: 35, opacity: 0.7,
  };
  const round = decodeRadarState(encodeRadarState(s));
  add('roundtrip vorhanden', round != null);
  if (round) {
    add('Ort erhalten', Math.abs(round.location.lat - s.location.lat) < 1e-4 && round.location.country === 'DE');
    add('Layer erhalten', [...round.layers].sort().join(',') === [...s.layers].sort().join(','), round.layers.join(','));
    add('Palette erhalten', round.palette === 'viridis');
    add('Basemap erhalten', round.basemap === 'terrain');
    add('Lead erhalten', round.leadMin === 35);
    add('Opacity erhalten (~0.7)', Math.abs(round.opacity - 0.7) < 0.02, `${round.opacity}`);
  }
  add('Fremd-Hash → null', decodeRadarState('#m=foo') === null);
  add('hasRadarHash', hasRadarHash('#r=abc') && !hasRadarHash('#x='));
  // sanity: Modelldaten konsistent
  add('PALETTES vollständig', PAL_IDX.every((p) => !!PALETTES[p]));
  // Absicht statt eingefrorener Zahl (Familie V-BW-19): die Sonde verlangte
  // `>= 4`, seit einem Preset-Rückbau gibt es 3 — sie meldete damit einen
  // planmäßigen Schritt als Fehler. Geprüft wird jetzt, was das Modell zusagt:
  // es gibt Presets, jedes hat eine eindeutige id und ein nicht leeres Layer-Set.
  add('Presets vorhanden und wohlgeformt',
    RADAR_PRESETS.length > 0
    && RADAR_PRESETS.every((p) => !!p.id && !!p.label && p.layers.length > 0)
    && new Set(RADAR_PRESETS.map((p) => p.id)).size === RADAR_PRESETS.length,
    `${RADAR_PRESETS.length} Presets`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyRadarState: typeof verifyRadarState }).__verifyRadarState = verifyRadarState;
}
