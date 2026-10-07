/**
 * SW-5 — URL state of Seewetter: `/seewetter/<spot>?p=kite&t=24&l=hs&u=kn&tab=spot&rv=ostsee`
 * (plan SW-5 `seaState.ts`, concept "Teilen und Favorit"). The spot is the path segment (ids of
 * `sea/v1/static/spots.json`), the rest lives in the query in a fixed order, defaults omitted, so equal states give
 * equal URLs (share links, SH1 pattern).
 *
 * `t` = hours from NOW (0–78, the band's hour), like the road page's chips — a shared link opens on the same offset.
 */
import { isProfileId, type SeaProfileId, type SeaUnit } from './seaProfiles';

export type SeaTab = 'spot' | 'gebiet' | 'quellen';
export const SEA_TABS: readonly SeaTab[] = ['spot', 'gebiet', 'quellen'];
export type SeaLayer = 'hs' | 'ws' | 'sw' | 'per';
export const SEA_LAYERS: readonly SeaLayer[] = ['hs', 'ws', 'sw', 'per'];
export type SeaRevier = 'alle' | 'nordsee' | 'ostsee';
export const SEA_REVIERE: readonly SeaRevier[] = ['alle', 'nordsee', 'ostsee'];
/** Time chips of the design: now, +6, +12, +24, +48, +72 h. */
export const SEA_TIME_CHIPS = [0, 6, 12, 24, 48, 72] as const;
export const SEA_MAX_T = 78;

export interface SeaUrlState {
  spot: string | null;
  p: SeaProfileId;
  t: number;
  l: SeaLayer;
  u: SeaUnit;
  tab: SeaTab;
  rv: SeaRevier;
}

export const SEA_DEFAULT_STATE: SeaUrlState = { spot: null, p: 'kite', t: 0, l: 'hs', u: 'kn', tab: 'spot', rv: 'alle' };
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseSeaUrl(slug: string | null | undefined, search: string): { state: SeaUrlState; invalid: string[] } {
  const invalid: string[] = [];
  const q = new URLSearchParams(search);
  const state: SeaUrlState = { ...SEA_DEFAULT_STATE };
  if (slug) { if (SLUG_RE.test(slug) && slug.length <= 40) state.spot = slug; else invalid.push('spot'); }
  const p = q.get('p');
  if (p != null) { if (isProfileId(p)) state.p = p; else invalid.push('p'); }
  const t = q.get('t');
  if (t != null) { const n = Number(t); if (Number.isInteger(n) && n >= 0 && n <= SEA_MAX_T) state.t = n; else invalid.push('t'); }
  const l = q.get('l');
  if (l != null) { if ((SEA_LAYERS as readonly string[]).includes(l)) state.l = l as SeaLayer; else invalid.push('l'); }
  const u = q.get('u');
  if (u != null) { if (u === 'kn' || u === 'bft' || u === 'kmh') state.u = u; else invalid.push('u'); }
  const tab = q.get('tab');
  if (tab != null) { if ((SEA_TABS as readonly string[]).includes(tab)) state.tab = tab as SeaTab; else invalid.push('tab'); }
  const rv = q.get('rv');
  if (rv != null) { if ((SEA_REVIERE as readonly string[]).includes(rv)) state.rv = rv as SeaRevier; else invalid.push('rv'); }
  return { state, invalid };
}

/** Canonical URL of a state (fixed key order, defaults omitted). */
export function buildSeaUrl(s: SeaUrlState, extra: ReadonlyArray<[string, string]> = []): string {
  const q: Array<[string, string]> = [];
  if (s.p !== SEA_DEFAULT_STATE.p) q.push(['p', s.p]);
  if (s.t !== 0) q.push(['t', String(s.t)]);
  if (s.l !== 'hs') q.push(['l', s.l]);
  if (s.u !== 'kn') q.push(['u', s.u]);
  if (s.tab !== 'spot') q.push(['tab', s.tab]);
  if (s.rv !== 'alle') q.push(['rv', s.rv]);
  q.push(...extra);
  const qs = q.length ? `?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `/seewetter${s.spot ? `/${s.spot}` : ''}${qs}`;
}
