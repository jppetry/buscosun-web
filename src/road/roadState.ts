/**
 * AW-5 — URL state of Autobahnwetter: `/autobahnwetter/<corridor>?st=<station>&t=0&dir=1&tab=strecke`
 * (plan AW-5, `roadState.ts`). The corridor is the path segment (`a8`, `a8-2` — ids of `static/corridors.json`),
 * the rest lives in the query, in a fixed order so equal states give equal URLs (share links, SH1 pattern).
 *
 * `t` is the time chip (0 = measurement, 1/3/6 h = derivation of AW-6). Until Gate D only 0 is valid; other values
 * are read, reported as invalid and dropped — a shared link from the future never shows a forecast early.
 */

export type RoadTab = 'station' | 'strecke' | 'quellen';
export const ROAD_TABS: readonly RoadTab[] = ['station', 'strecke', 'quellen'];
/** Time chips of the design (now, +1, +3, +6 h). */
export const ROAD_TIMES = [0, 1, 3, 6] as const;
export type RoadTime = (typeof ROAD_TIMES)[number];
/** AW-6 is not built: only the measurement is selectable. */
export const ROAD_FORECAST_ENABLED = false;

export interface RoadUrlState {
  corridor: string | null;
  st: string | null;
  t: RoadTime;
  dir: 0 | 1;
  tab: RoadTab;
}

export const ROAD_DEFAULT_STATE: RoadUrlState = { corridor: null, st: null, t: 0, dir: 0, tab: 'station' };

const SLUG_RE = /^[a-z][a-z0-9]{0,4}(?:-\d{1,2})?$/;
const STATION_RE = /^[A-Z0-9]{3,6}$/;

export function parseRoadUrl(slug: string | null | undefined, search: string): { state: RoadUrlState; invalid: string[] } {
  const invalid: string[] = [];
  const q = new URLSearchParams(search);
  const state: RoadUrlState = { ...ROAD_DEFAULT_STATE };
  if (slug) { if (SLUG_RE.test(slug)) state.corridor = slug; else invalid.push('corridor'); }
  const st = q.get('st');
  if (st != null) { if (STATION_RE.test(st)) state.st = st; else invalid.push('st'); }
  const t = q.get('t');
  if (t != null) {
    const n = Number(t);
    if ((ROAD_TIMES as readonly number[]).includes(n) && (n === 0 || ROAD_FORECAST_ENABLED)) state.t = n as RoadTime;
    else invalid.push('t');
  }
  const dir = q.get('dir');
  if (dir != null) { if (dir === '0' || dir === '1') state.dir = dir === '1' ? 1 : 0; else invalid.push('dir'); }
  const tab = q.get('tab');
  if (tab != null) { if ((ROAD_TABS as readonly string[]).includes(tab)) state.tab = tab as RoadTab; else invalid.push('tab'); }
  return { state, invalid };
}

/** Canonical URL of a state (fixed key order, defaults omitted; the phase flag `road` is carried along). */
export function buildRoadUrl(s: RoadUrlState, extra: ReadonlyArray<[string, string]> = []): string {
  const q: Array<[string, string]> = [];
  if (s.st) q.push(['st', s.st]);
  if (s.t !== 0) q.push(['t', String(s.t)]);
  if (s.dir === 1) q.push(['dir', '1']);
  if (s.tab !== 'station') q.push(['tab', s.tab]);
  q.push(...extra);
  const qs = q.length ? `?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `/autobahnwetter${s.corridor ? `/${s.corridor}` : ''}${qs}`;
}
