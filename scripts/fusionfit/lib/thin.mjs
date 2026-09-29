/**
 * thin.mjs — the row thinning of the fit and the scorer (phase FV, `audit/fusion-validierung.md` §3.1; V-FX-44).
 *
 * `fit.mjs` and `score.mjs` keep every `stride`-th row. The rule up to phase FX, `(validAtH + pointIdx) % stride`, is a
 * POINT selection on the coarse tiers: t3 valid hours are 6-hourly (validAtH ≡ 0 mod 6), t2 3-hourly — at stride 6 only
 * the points with a matching residue survive (measured 2026-05: t3 65 of 389 points, t2 130, t1 259; the row share is
 * right, the area is not). `--thin=hash` keeps the row when `mix32(validAtH, pointIdx) % stride === 0` — every bit of both
 * keys reaches the residue, so every point keeps ≈ 1/stride of its rows in every tier. A plain product or XOR with odd
 * factors is NOT enough (it keeps the parity — measured in `diag-fx5-a3.mjs`); the mixer below is the one A3 used.
 *
 * `thinSelect(mode, stride)` → (validAtH, pointIdx) → boolean. `mode` `legacy` (default, byte-identical to the rule up to
 * phase FX) or `hash`; anything else throws.
 */

/** 32-bit mixer of two integer keys (murmur3-style finaliser on a golden-ratio combination) — `diag-fx5-a3.mjs` since FX-5. */
export const mix32 = (a, b) => { let h = Math.imul(a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b), 0xc2b2ae35); h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13; return h >>> 0; };

export const THIN_MODES = Object.freeze(['legacy', 'hash']);

/** The row filter of a thinning mode: true = the row is used. */
export function thinSelect(mode = 'legacy', stride = 1) {
  const s = Math.max(1, stride | 0);
  if (mode === 'legacy') return (validAtH, pointIdx) => (validAtH + pointIdx) % s === 0;
  if (mode === 'hash') return (validAtH, pointIdx) => mix32(validAtH, pointIdx) % s === 0;
  throw new Error(`--thin=${mode}: erwartet ${THIN_MODES.join(' oder ')}`);
}

/** Parse the `--thin` flag (absent ⇒ legacy). */
export const parseThin = (v) => (v == null || v === true ? 'legacy' : String(v));
