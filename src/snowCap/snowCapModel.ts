/**
 * Phase SK (audit/schneefallgrenze-flaeche.md): the snowfall line of buscosun Fusion as a surface on the terrain — model
 * constants and pure helpers. Import-FREE on purpose: the deck and the map read the flag/constants without pulling any
 * buscosun Fusion module into their chunks (the phase word lives in `snowPhase.ts`, loaded only by the lazy part).
 */
export type SkPhase = 'snow' | 'sleet' | 'rain';

/** E-SK-7, switched on by Jan 09.10.2026: on by default; `?sk=0` (or `false`) = the ICON-D2 line as before (fallback). */
export function snowCapEnabledFrom(search: string): boolean {
  const v = new URLSearchParams(search).get('sk');
  return v !== '0' && v !== 'false';
}

/** Cap opacity where it is dry / where it precipitates (E-SK-3) — set, tuned on the device. */
export const SK_ALPHA_DRY = 0.16; // set
export const SK_ALPHA_WET = 0.55; // set
/** Band hatch: period and line width in image pixels, opacity — set. */
export const SK_HATCH_PERIOD = 6; // set
export const SK_HATCH_WIDTH = 1.4; // set
export const SK_HATCH_ALPHA = 0.5; // set
/** Radar weight: wet from 0.1 mm/h (the radar's drizzle floor), full from 0.5 mm/h — set. */
export const SK_RADAR_WET_MMH = 0.1; // set
export const SK_RADAR_FULL_MMH = 0.5; // set
/** Snowline colour of the Regenradar 2.0 sign language (`--np-snowline`). */
export const SK_LINE_COLOR = '#4F5FB8';
/** Hours the place bar offers as map time (E-SK-2). */
export const SK_PICK_HOURS = 48;

export interface CapPalette { cap: [number, number, number]; hatch: [number, number, number]; alphaScale: number }
/** 2D: the radar map lies under `basemap-dim` (dark) — white cap and white hatch. */
export const SK_PALETTE_2D: CapPalette = { cap: [250, 252, 255], hatch: [250, 252, 255], alphaScale: 1 };
/** 3D: light positron relief with hill shading — white cap a bit stronger, hatch in snowline blue. */
export const SK_PALETTE_3D: CapPalette = { cap: [255, 255, 255], hatch: [79, 95, 184], alphaScale: 1.35 };

const Z90 = 1.2815515655446004;

function erf(x: number): number {
  const s = Math.sign(x); const a = Math.abs(x); const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
}

/** P(snow at height h) = P(snowline ≤ h) for the field's normal band (mid ∓ 1.2816 σ = p10…p90); without band a step. */
export function snowProbAt(h: number, mid: number, half: number): number {
  if (!(half > 0)) return h >= mid ? 1 : 0;
  const sigma = half / Z90;
  return 0.5 * (1 + erf((h - mid) / (sigma * Math.SQRT2)));
}

export const PHASE_WORD_SK: Record<SkPhase, string> = { snow: 'Schnee', sleet: 'Schneeregen', rain: 'Regen' };

export const round50 = (m: number) => Math.round(m / 50) * 50;
export const fmtMeters = (m: number) => Math.round(m).toLocaleString('de-DE').replace(/\./g, ' ');

/** "Schneefallgrenze 1 400 m (1 200–1 650 m)" — values on a 50 m grid. */
export function fmtSnowLine(mid: number, half: number): string {
  const head = `Schneefallgrenze ${fmtMeters(round50(mid))} m`;
  if (!(half > 0)) return `${head} (ohne Spanne)`;
  return `${head} (${fmtMeters(round50(mid - half))}–${fmtMeters(round50(mid + half))} m)`;
}

/** Radar intensity → wet weight 0…1 (E-SK-3); `null` = no radar value there. */
export function radarWeight(mmh: number | null): number | null {
  if (mmh == null || !Number.isFinite(mmh)) return null;
  if (mmh < SK_RADAR_WET_MMH) return 0;
  return Math.min(1, mmh / SK_RADAR_FULL_MMH);
}
