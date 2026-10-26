/**
 * AW-5 — URL state of Autobahnwetter: `/autobahnwetter/<corridor>?st=<station>&t=0&dir=1&tab=strecke`
 * (plan AW-5, `roadState.ts`). The corridor is the path segment (`a8`, `a8-2` — ids of `static/corridors.json`),
 * the rest lives in the query, in a fixed order so equal states give equal URLs (share links, SH1 pattern).
 *
 * `t` is the time chip (0 = now, 1/3/6 h ahead): since AW-6.1b it selects the hour of the WEATHER forecast of buscosun
 * Fusion 8 (`road/fc/v1`) in the band row, the map dots and the readout. The road surface stays measured-only (AW-6.2,
 * Gate D). `st` is a station id or, since AW-6.1b, a forecast point of the corridor axis (`a8@70`).
 */

export type RoadTab = 'station' | 'strecke' | 'quellen' | 'gefahren' | 'autobahnen';
export const ROAD_TABS: readonly RoadTab[] = ['station', 'strecke', 'quellen', 'gefahren', 'autobahnen'];
/** Time chips of the design (now, +1, +3, +6 h). */
export const ROAD_TIMES = [0, 1, 3, 6] as const;
/** AW-8: behind the hazard switch the time is hourly, 0 … 6 (one state for map, band, matrix and detail). */
export const ROAD_HZ_TIMES = [0, 1, 2, 3, 4, 5, 6] as const;
export type RoadTime = (typeof ROAD_HZ_TIMES)[number];
/** AW-8: window of the rail — `now`, the whole window, or one hour (a matrix cell). */
export type RoadHzMode = 'now' | 'p6' | RoadTime;
/** AW-6.1b (04.10.2026): the weather forecast is selectable. `false` = chips disabled, `t` invalid in the URL again. */
export const ROAD_FORECAST_ENABLED = true;

export interface RoadUrlState {
  corridor: string | null;
  st: string | null;
  t: RoadTime;
  dir: 0 | 1;
  tab: RoadTab;
  /** AW-8: the open segment of the detail view (`seg=A8-034`) and the group filter of the rail (`hf=glaette`). */
  seg?: string | null;
  hf?: string | null;
  /** AWD: the centre stage shows the dossier (strip + segment detail) instead of the map (`ds=1`). Behind the hazard switch only. */
  ds?: boolean;
}

export const ROAD_DEFAULT_STATE: RoadUrlState = { corridor: null, st: null, t: 0, dir: 0, tab: 'station' };
/** AW-8: behind the switch the right column starts with the rail (E-AW-37) — `tab=station` stays readable and opens the detail. */
export const ROAD_HZ_DEFAULT_TAB: RoadTab = 'gefahren';
const SEG_RE = /^[AB]\d{1,3}[A-Z]?(?:\.\d{1,2})?-\d{3,4}$/;
const HF_RE = /^[a-z]{3,10}$/;

const SLUG_RE = /^[a-z][a-z0-9]{0,4}(?:-\d{1,2})?$/;
/** DWD station id, or an axis point of the route forecast (`<corridor>@<km>`, `roadFcAxisId`). */
const STATION_RE = /^(?:[A-Z0-9]{3,6}|[a-z][a-z0-9]{0,4}(?:-\d{1,2})?@\d{1,4}(?:\.\d)?)$/;

export function parseRoadUrl(slug: string | null | undefined, search: string, hz = false): { state: RoadUrlState; invalid: string[] } {
  const invalid: string[] = [];
  const q = new URLSearchParams(search);
  const state: RoadUrlState = { ...ROAD_DEFAULT_STATE, ...(hz ? { tab: ROAD_HZ_DEFAULT_TAB, seg: null, hf: null } : {}) };
  if (hz) {
    const seg = q.get('seg');
    if (seg != null) { if (SEG_RE.test(seg)) state.seg = seg; else invalid.push('seg'); }
    const hf = q.get('hf');
    if (hf != null) { if (HF_RE.test(hf)) state.hf = hf; else invalid.push('hf'); }
    // AWD: only the value 1 opens the dossier; anything else is invalid and the map stays the stage.
    const ds = q.get('ds');
    if (ds != null) { if (ds === '1') state.ds = true; else invalid.push('ds'); }
  }
  if (slug) { if (SLUG_RE.test(slug)) state.corridor = slug; else invalid.push('corridor'); }
  const st = q.get('st');
  if (st != null) { if (STATION_RE.test(st)) state.st = st; else invalid.push('st'); }
  const t = q.get('t');
  if (t != null) {
    const n = Number(t);
    const allowed: readonly number[] = hz ? ROAD_HZ_TIMES : ROAD_TIMES;
    if (allowed.includes(n) && (n === 0 || ROAD_FORECAST_ENABLED)) state.t = n as RoadTime;
    else invalid.push('t');
  }
  const dir = q.get('dir');
  if (dir != null) { if (dir === '0' || dir === '1') state.dir = dir === '1' ? 1 : 0; else invalid.push('dir'); }
  const tab = q.get('tab');
  if (tab != null) { if ((ROAD_TABS as readonly string[]).includes(tab) && (hz || tab !== 'gefahren')) state.tab = tab as RoadTab; else invalid.push('tab'); }
  return { state, invalid };
}

/** Canonical URL of a state (fixed key order, defaults omitted; the phase flag `road` is carried along). */
export function buildRoadUrl(s: RoadUrlState, extra: ReadonlyArray<[string, string]> = []): string {
  const q: Array<[string, string]> = [];
  if (s.st) q.push(['st', s.st]);
  if (s.t !== 0) q.push(['t', String(s.t)]);
  if (s.dir === 1) q.push(['dir', '1']);
  // AW-8: behind the switch `gefahren` is the default tab; without the switch `station` is (a URL of one world stays readable in the other).
  const defaultTab: RoadTab = s.seg !== undefined ? ROAD_HZ_DEFAULT_TAB : 'station';
  if (s.tab !== defaultTab) q.push(['tab', s.tab]);
  if (s.seg) q.push(['seg', s.seg]);
  if (s.hf) q.push(['hf', s.hf]);
  if (s.ds) q.push(['ds', '1']);
  q.push(...extra);
  const qs = q.length ? `?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `/autobahnwetter${s.corridor ? `/${s.corridor}` : ''}${qs}`;
}
