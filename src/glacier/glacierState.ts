/**
 * GL-1 — URL state of the glacier page: `/gletscher/<slug>?tab=saison&t=2026-08-12&v=3d&e=o,s` (concept "Zustand in der URL",
 * pattern `seaState.ts`). The glacier is the path segment — its id without the `gl_` prefix and with the first underscore turned into a hyphen
 * (`ch-grosser-aletschgletscher`, a clean lower-case URL; reversible because a country code is always two letters); the rest lives in the query in a
 * fixed order, defaults omitted, so equal states give equal URLs (share links, SH1 pattern). Dependency-free.
 *
 *   tab  heute | saison | langzeit | tour | quellen     (sheet only)
 *   t    ISO date of the time point of the sheet ("heute" = omitted)
 *   v    2d | 3d                                        (sheet only; `?gl3d=0` forces 2d)
 *   e    layers of the sheet map: o = earlier outline, s = snow line of the newest scene (comma list)
 *   land alle | ch | at | de                           (situation page)
 *   m    the metric the map is coloured by              (situation page)
 *   q    search text                                    (situation page)
 *   sel  the glacier selected on the situation map (same segment form; opening the sheet is the path `/gletscher/<segment>`)
 *   o    outline epoch year of the sheet (`o=1850`)
 */

export type GlacierTab = 'heute' | 'saison' | 'langzeit' | 'tour' | 'quellen';
export const GLACIER_TABS: readonly GlacierTab[] = ['heute', 'saison', 'langzeit', 'tour', 'quellen'];
export type GlacierLand = 'alle' | 'ch' | 'at' | 'de';
export const GLACIER_LANDS: readonly GlacierLand[] = ['alle', 'ch', 'at', 'de'];
/** Stage 1 metrics: `laenge`, `flaeche`, `bilanz` carry data; `schmelze` and `ausaperung` are shown LOCKED (GL-2/GL-3). */
export type GlacierMetric = 'laenge' | 'flaeche' | 'bilanz' | 'schmelze' | 'ausaperung';
export const GLACIER_METRICS: readonly GlacierMetric[] = ['laenge', 'flaeche', 'bilanz', 'schmelze', 'ausaperung'];
export type GlacierView = '2d' | '3d';
export type GlacierLayer = 'o' | 's';

export interface GlacierUrlState {
  /** `ch-grosser-aletschgletscher` (id without the `gl_` prefix, first underscore → hyphen) or null for the situation page. */
  glacier: string | null;
  tab: GlacierTab;
  /** ISO date `YYYY-MM-DD` or `heute`. */
  t: string;
  v: GlacierView;
  e: GlacierLayer[];
  /** Earlier outline year chosen on the sheet, 0 = the newest earlier one. */
  o: number;
  land: GlacierLand;
  m: GlacierMetric;
  q: string;
  sel: string | null;
}

export const GLACIER_DEFAULT_STATE: GlacierUrlState = { glacier: null, tab: 'heute', t: 'heute', v: '2d', e: ['o', 's'], o: 0, land: 'alle', m: 'laenge', q: '', sel: null };
const SEG_RE = /^(ch|at|de)-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const glacierSegmentOf = (id: string): string => (id.startsWith('gl_') ? id.slice(3).replace('_', '-') : id);
export const glacierIdOfSegment = (seg: string): string => `gl_${seg.replace('-', '_')}`;

export function parseGlacierUrl(segment: string | null | undefined, search: string): { state: GlacierUrlState; invalid: string[] } {
  const invalid: string[] = [];
  const q = new URLSearchParams(search);
  const state: GlacierUrlState = { ...GLACIER_DEFAULT_STATE, e: [...GLACIER_DEFAULT_STATE.e] };
  if (segment) { if (SEG_RE.test(segment) && segment.length <= 78) state.glacier = segment; else invalid.push('glacier'); }
  const tab = q.get('tab');
  if (tab != null) { if ((GLACIER_TABS as readonly string[]).includes(tab)) state.tab = tab as GlacierTab; else invalid.push('tab'); }
  const t = q.get('t');
  if (t != null) { if (t === 'heute' || (ISO_RE.test(t) && !Number.isNaN(Date.parse(t)))) state.t = t; else invalid.push('t'); }
  const v = q.get('v');
  if (v != null) { if (v === '2d' || v === '3d') state.v = v; else invalid.push('v'); }
  const e = q.get('e');
  if (e != null) {
    const parts = e === '' ? [] : e.split(',');
    if (parts.every((x) => x === 'o' || x === 's')) state.e = [...new Set(parts)] as GlacierLayer[]; else invalid.push('e');
  }
  const o = q.get('o');
  if (o != null) { const n = Number(o); if (Number.isInteger(n) && n >= 1800 && n <= 2030) state.o = n; else invalid.push('o'); }
  const land = q.get('land');
  if (land != null) { if ((GLACIER_LANDS as readonly string[]).includes(land)) state.land = land as GlacierLand; else invalid.push('land'); }
  const m = q.get('m');
  if (m != null) { if ((GLACIER_METRICS as readonly string[]).includes(m)) state.m = m as GlacierMetric; else invalid.push('m'); }
  const s = q.get('q');
  if (s != null) { if (s.length <= 60) state.q = s; else invalid.push('q'); }
  const sel = q.get('sel');
  if (sel != null) { if (SEG_RE.test(sel) && sel.length <= 78) state.sel = sel; else invalid.push('sel'); }
  return { state, invalid };
}

/** Canonical URL of a state (fixed key order, defaults omitted). */
export function buildGlacierUrl(s: GlacierUrlState, extra: ReadonlyArray<[string, string]> = []): string {
  const q: Array<[string, string]> = [];
  const d = GLACIER_DEFAULT_STATE;
  if (s.glacier) {
    if (s.tab !== d.tab) q.push(['tab', s.tab]);
    if (s.t !== d.t) q.push(['t', s.t]);
    if (s.v !== d.v) q.push(['v', s.v]);
    const e = [...s.e].sort().join(',');
    if (e !== [...d.e].sort().join(',')) q.push(['e', e]);
    if (s.o) q.push(['o', String(s.o)]);
  } else {
    if (s.land !== d.land) q.push(['land', s.land]);
    if (s.m !== d.m) q.push(['m', s.m]);
    if (s.q) q.push(['q', s.q]);
    if (s.sel) q.push(['sel', s.sel]);
  }
  q.push(...extra);
  const qs = q.length ? `?${q.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}` : '';
  return `/gletscher${s.glacier ? `/${s.glacier}` : ''}${qs}`;
}
