/**
 * Phase HZS (`audit/hoehen-zeit-schnitt.md`): feature flag of the height-time section — own file so the deck does not
 * pull the model (and its buscosun Fusion imports) out of the lazy chunk. Default on since Jan's go (09.10., E-HZS-10);
 * `?hzs=0` / `?hzs=false` = the deck without the section (Rule 2 fallback).
 */
export function heightTimeEnabledFrom(search: string): boolean {
  const v = new URLSearchParams(search).get('hzs');
  return !(v === '0' || v === 'false');
}
