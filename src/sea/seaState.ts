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
/** `daenemark` (phase DK) filters by the spot's country; `nordsee`/`ostsee` by its sea — a Danish spot is in both lists. */
export type SeaRevier = 'alle' | 'nordsee' | 'ostsee' | 'daenemark';
export const SEA_REVIERE: readonly SeaRevier[] = ['alle', 'nordsee', 'ostsee', 'daenemark'];
/** Is a spot of the catalogue in the chosen Revier? */
export const seaInRevier = (s: { region: string; country?: string }, rv: SeaRevier): boolean =>
  rv === 'alle' || (rv === 'daenemark' ? s.country === 'DK' : s.region === rv);
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
  /** Phase TF: the tide threshold as written in the link (`tw=min.550.pnp.<gauge>`, `tideWindow.ts`); null = none. */
  tw: string | null;
  /** Phase TF: `tf=1` stays in the address while the tide window is not live, so a shared link shows what was shared. */
  tf: boolean;
  /** Phase SP: the trip planner as written in the link (`pl=<start>_<return>_<lat>_<lon>`, `seaPlanner.ts`); null = planner closed. */
  pl: string | null;
  /** Phase WT: the user's water temperature threshold as written in the link (`wt=over.18` / `wt=under.12.5`, `waterTemp.ts`); null = none. */
  wt: string | null;
}

export const SEA_DEFAULT_STATE: SeaUrlState = { spot: null, p: 'kite', t: 0, l: 'hs', u: 'kn', tab: 'spot', rv: 'alle', tw: null, tf: false, pl: null, wt: null };
/** Phase TF: form of `tw` — mode, whole cm, reference, gauge id (read by `parseTideParam` in `tideWindow.ts`; kept here so the route wrapper stays free of the tide module). */
export const SEA_TW_RE = /^(min|max)\.(-?\d{1,4})\.(pnp|nhn|skn|mhw)\.([a-z0-9][a-z0-9_-]{0,63})$/;
/** Phase SP: form of `pl` — start and return as full UTC hours (YYYYMMDDHH), boat position in degrees (read by `parsePlanParam` in `seaPlanner.ts`). */
export const SEA_PL_RE = /^(\d{10})_(\d{10})_(\d{1,2}\.\d{1,5})_(\d{1,3}\.\d{1,5})$/;
/** Phase WT: form of `wt` — side and degrees Celsius with at most one decimal (read by `parseWtParam` in `waterTemp.ts`). */
export const SEA_WT_RE = /^(over|under)\.(-?\d{1,2}(?:\.\d)?)$/;
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
  const tw = q.get('tw');
  if (tw != null) { if (SEA_TW_RE.test(tw)) state.tw = tw; else invalid.push('tw'); }
  if (q.get('tf') === '1') state.tf = true;
  const pl = q.get('pl');
  if (pl != null) { if (SEA_PL_RE.test(pl)) state.pl = pl; else invalid.push('pl'); }
  const wt = q.get('wt');
  if (wt != null) { if (SEA_WT_RE.test(wt)) state.wt = wt; else invalid.push('wt'); }
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
  if (s.tw) q.push(['tw', s.tw]);
  if (s.tf) q.push(['tf', '1']);
  if (s.pl) q.push(['pl', s.pl]);
  if (s.wt) q.push(['wt', s.wt]);
  q.push(...extra);
  const qs = q.length ? `?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `/seewetter${s.spot ? `/${s.spot}` : ''}${qs}`;
}
