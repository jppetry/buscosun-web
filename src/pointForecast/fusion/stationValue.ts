/**
 * stationValue.ts — the station value of buscosun Fusion (phase FS, `audit/fusion-stationswert.md`).
 *
 * Where the point IS a station with a station forecast (MOSMIX), averaging the members cannot beat that forecast: its error is
 * about half the error of the learned member and both share their weather (measured on the archive: the leave-day-out weight of
 * MOSMIX is 0,7–0,9). What beats it is information MOSMIX does not have — the latest measurement, a younger model run, its own
 * bias. So the station forecast is the backbone and the rest are corrections:
 *
 *     value = M + b + w·I + c·(L − M)
 *
 *   M  the station forecast at the valid time, at the height of the point
 *   I  its innovation: measurement(t₀) − M(t₀) at the latest measurement of THAT station
 *   L  the point value of the learned member
 *   b, w, c  per variable and τ group (τ = hours since the measurement; without a measurement: the lead)
 *
 * The parameters come from a table fitted on the point archive (`scripts/fusionfit/stack-score.mjs`, leave-day-out scored).
 * One definition for the fit and for the engine: the forms, the groups and the value live here.
 *
 * Provenance `archive`: fitted on measurements against real inputs, but on days, not seasons — never `measured`; every
 * result names the table (`stationValue:archive`). Pure; headless-checkable ({@link verifyStationValue}).
 */
import type { Dist } from './dist';

export type StackVar = 't' | 'td' | 'ws' | 'gust';
export type StackForm = 'A' | 'AB' | 'S' | 'B' | 'S0';
export type StackCandidate = 'mosmix+anker' | 'mosmix+anker+bias' | 'stack';

export const STACK_VARS: readonly StackVar[] = Object.freeze(['t', 'td', 'ws', 'gust']);
/** AX-5: the countries an entry may be fitted for; the engine maps LI to CH (the archive's convention). */
export const STACK_COUNTRIES: readonly string[] = Object.freeze(['DE', 'AT', 'CH']);
export const stackCountryOf = (country: string | null | undefined): string | null => (country == null ? null : country === 'LI' ? 'CH' : STACK_COUNTRIES.includes(country) ? country : null);
/** τ groups in hours, inclusive. */
export const TAU_GROUPS: ReadonlyArray<readonly [number, number]> = Object.freeze([[1, 1], [2, 2], [3, 3], [4, 4], [5, 5], [6, 6], [7, 12], [13, 24], [25, 48], [49, 120], [121, 240]] as const);
export function tauGroup(tau: number | null | undefined): number {
  if (tau == null || !(tau >= 1)) return -1;
  for (let i = 0; i < TAU_GROUPS.length; i++) if (tau >= TAU_GROUPS[i][0] && tau <= TAU_GROUPS[i][1]) return i;
  return -1;
}
export const tauLabel = (g: number): string => (TAU_GROUPS[g][0] === TAU_GROUPS[g][1] ? `${TAU_GROUPS[g][0]}` : `${TAU_GROUPS[g][0]}–${TAU_GROUPS[g][1]}`);

const fin = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);

/** The design row of a form from (I, D = L − M); null = the row cannot carry the form. */
export const FORMS: Readonly<Record<StackForm, { names: readonly string[]; x: (I: number | null, D: number | null) => number[] | null }>> = Object.freeze({
  A: { names: ['w'], x: (I) => (fin(I) ? [I] : null) },
  AB: { names: ['b', 'w'], x: (I) => (fin(I) ? [1, I] : null) },
  S: { names: ['b', 'w', 'c'], x: (I, D) => (fin(I) && fin(D) ? [1, I, D] : null) },
  B: { names: ['b'], x: () => [1] },
  S0: { names: ['b', 'c'], x: (_I, D) => (fin(D) ? [1, D] : null) },
});

/** Which form a candidate takes on a row; null ⇒ the candidate is the station forecast itself (no innovation, form A). */
export function formOf(candidate: StackCandidate, I: number | null, D: number | null): StackForm | null {
  const hasI = fin(I), hasD = fin(D);
  if (candidate === 'mosmix+anker') return hasI ? 'A' : null;
  if (candidate === 'mosmix+anker+bias') return hasI ? 'AB' : 'B';
  if (candidate === 'stack') return hasI ? (hasD ? 'S' : 'AB') : (hasD ? 'S0' : 'B');
  throw new Error(`unbekannter Kandidat ${String(candidate)}`);
}

/** M plus the form's correction; wind and gust bounded at 0. */
export function stackValue(M: number, x: readonly number[], beta: readonly number[], nonNegative: boolean): number {
  let v = M;
  for (let i = 0; i < x.length; i++) v += beta[i] * x[i];
  return nonNegative ? Math.max(0, v) : v;
}

/** The predictive distribution: normal; wind and gust censored at 0 (and 90) — the median is the bounded value. */
export function stackDist(v: StackVar, mu: number, sigma: number): Dist {
  const s = Math.max(1e-3, sigma);
  return v === 'ws' || v === 'gust' ? { kind: 'censoredNormal', mu, sigma: s, lo: 0, hi: 90 } : { kind: 'normal', mu, sigma: s };
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const STACK_TABLE_KIND = 'fusionfit/stack-table';
export const STACK_FIT_VERSION = 'stack@1';

export interface StackEntry {
  /** Rows of the fit. */
  n: number;
  /** Parameters in the order of `FORMS[form].names`. */
  beta: number[];
  /** Residual rms of the fit — the σ of the predictive distribution. */
  sigma: number;
}

export interface StackTable {
  schema: 1;
  kind: typeof STACK_TABLE_KIND;
  fitVersion: typeof STACK_FIT_VERSION;
  /** Fitted on the point archive (real inputs, measured truth) over days — never `measured`. */
  provenance: 'archive';
  builtAt: string;
  period: { from: string; to: string; issueDays: number };
  rows: number;
  /**
   * Where the table is valid: the station must stand AT the point. The fit saw stations up to this distance and height
   * difference from the point; beyond it the stage does not run.
   */
  range: { maxKm: number; maxDElevM: number };
  tauGroups: ReadonlyArray<readonly [number, number]>;
  /**
   * `${variable}|${group}|${form}` → entry; only written entries (≥ the fit's minimum rows). Phase AX, AX-5 (V-FS-5): an
   * entry may carry a country as fourth part (`…|CH`) — the engine takes the country's entry where the point lies in that
   * country and one is written, else the pooled one (LI counts as CH, like the archive).
   */
  entries: Record<string, StackEntry>;
  source?: Record<string, unknown>;
  notes?: string[];
}

export function validateStackTable(x: unknown): string[] {
  const e: string[] = [];
  const t = x as Partial<StackTable> | null;
  if (!t || typeof t !== 'object') return ['kein Objekt'];
  if (t.schema !== 1) e.push(`schema ${String(t.schema)} ≠ 1`);
  if (t.kind !== STACK_TABLE_KIND) e.push(`kind ${String(t.kind)}`);
  if (t.fitVersion !== STACK_FIT_VERSION) e.push(`fitVersion ${String(t.fitVersion)}`);
  if (t.provenance !== 'archive') e.push(`provenance ${String(t.provenance)} — nur 'archive'`);
  if (!t.range || !(t.range.maxKm > 0) || !(t.range.maxDElevM > 0)) e.push('range fehlt oder ist nicht positiv');
  if (!Array.isArray(t.tauGroups) || JSON.stringify(t.tauGroups) !== JSON.stringify(TAU_GROUPS)) e.push('tauGroups weichen von der Definition ab');
  if (!t.entries || typeof t.entries !== 'object') { e.push('entries fehlt'); return e; }
  for (const [k, en] of Object.entries(t.entries)) {
    const [v, g, form, cc, extra] = k.split('|');
    const f = FORMS[form as StackForm];
    if (!STACK_VARS.includes(v as StackVar) || !f || !(Number(g) >= 0 && Number(g) < TAU_GROUPS.length) || (cc !== undefined && !STACK_COUNTRIES.includes(cc)) || extra !== undefined) { e.push(`Schlüssel ${k}`); continue; }
    if (!en || !Array.isArray(en.beta) || en.beta.length !== f.names.length || !en.beta.every((b) => Number.isFinite(b))) e.push(`${k}: beta`);
    else if (!(en.sigma > 0) || !Number.isFinite(en.sigma)) e.push(`${k}: sigma`);
    else if (!(en.n > 0)) e.push(`${k}: n`);
    if (e.length > 12) break;
  }
  return e;
}

/** Does a station at this distance and height difference stand at the point, as the table understands it? */
export function stationAtPoint(table: StackTable, distanceKm: number | null | undefined, dElevM: number | null | undefined): boolean {
  return fin(distanceKm) && fin(dElevM) && distanceKm <= table.range.maxKm && Math.abs(dElevM) <= table.range.maxDElevM;
}

export interface StationValueInput {
  /** The station forecast at the valid time, at the height of the point. */
  M: number | null;
  /** Its innovation at the latest measurement; null without one. */
  I: number | null;
  /** Hours from that measurement to the valid time; ignored without I. */
  tauH: number | null;
  /** Lead in hours — the group of a row without an innovation. */
  leadH: number;
  /** Point value of the learned member; null without the learned stage. */
  L: number | null;
  /** AX-5: the country of the point (DE/AT/CH, LI = CH) — a written country entry then wins over the pooled one. */
  country?: string | null;
}
export interface StationValue {
  value: number;
  dist: Dist;
  form: StackForm;
  group: number;
  n: number;
  /** AX-5: the country whose entry was used, null for the pooled entry. */
  country: string | null;
}

/**
 * The station value of one variable. null = the stage does not answer (no station forecast, a group outside the table, no
 * written entry for the form the row can carry) — the caller keeps what it had. A row that cannot carry the full form falls
 * back to the form it can carry, never to a guessed parameter.
 */
export function stationValueOf(table: StackTable, v: StackVar, inp: StationValueInput): StationValue | null {
  if (!fin(inp.M)) return null;
  const I = fin(inp.I) && fin(inp.tauH) ? inp.I : null;
  const group = tauGroup(I != null ? Math.round(inp.tauH as number) : Math.round(inp.leadH));
  if (group < 0) return null;
  const D = fin(inp.L) ? inp.L - inp.M : null;
  // the form the row can carry, then the forms below it
  const first = formOf('stack', I, D) as StackForm;
  const chain: StackForm[] = first === 'S' ? ['S', 'AB'] : first === 'S0' ? ['S0', 'B'] : [first];
  const cc = stackCountryOf(inp.country);
  for (const form of chain) {
    // AX-5: the country's entry first (where fitted), then the pooled one — never a mix of the two
    const enCC = cc ? table.entries[`${v}|${group}|${form}|${cc}`] : undefined;
    const en = enCC ?? table.entries[`${v}|${group}|${form}`];
    if (!en) continue;
    const x = FORMS[form].x(I, D);
    if (!x) continue;
    const nonNeg = v === 'ws' || v === 'gust';
    const value = stackValue(inp.M, x, en.beta, nonNeg);
    return { value, dist: stackDist(v, nonNeg ? stackValue(inp.M, x, en.beta, false) : value, en.sigma), form, group, n: en.n, country: enCC ? cc : null };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface StationValueCheck { name: string; ok: boolean; detail?: string }
export interface StationValueVerifyResult { checks: StationValueCheck[]; passed: number; failed: number }

export function verifyStationValue(): StationValueVerifyResult {
  const checks: StationValueCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const table: StackTable = {
    schema: 1, kind: STACK_TABLE_KIND, fitVersion: STACK_FIT_VERSION, provenance: 'archive', builtAt: '2026-09-28T00:00:00Z',
    period: { from: '2026-09-14', to: '2026-09-27', issueDays: 13 }, rows: 1000, range: { maxKm: 5, maxDElevM: 50 }, tauGroups: TAU_GROUPS,
    entries: {
      't|0|S': { n: 900, beta: [0.1, 0.8, 0.05], sigma: 0.7 }, 't|0|AB': { n: 950, beta: [0.0, 0.85], sigma: 0.75 }, 't|0|B': { n: 300, beta: [0.2], sigma: 1.1 },
      'ws|0|S': { n: 900, beta: [-0.1, 0.6, 0.2], sigma: 0.8 },
    },
  };
  add('Tabelle gültig; fremde Provenienz, fremde Gruppen und ein Eintrag mit falscher Parameterzahl werden benannt',
    validateStackTable(table).length === 0
    && validateStackTable({ ...table, provenance: 'measured' }).length === 1
    && validateStackTable({ ...table, tauGroups: [[1, 2]] }).length === 1
    && validateStackTable({ ...table, entries: { 't|0|S': { n: 9, beta: [1, 2], sigma: 1 } } }).length === 1);
  const full = stationValueOf(table, 't', { M: 10, I: 1.5, tauH: 1, leadH: 1, L: 12 });
  add('volle Form: 10 + 0,1 + 0,8·1,5 + 0,05·2 = 11,4; normal mit der σ des Eintrags',
    !!full && Math.abs(full.value - 11.4) < 1e-12 && full.form === 'S' && full.dist.kind === 'normal' && full.dist.sigma === 0.7, full ? `${full.value}` : 'null');
  const noL = stationValueOf(table, 't', { M: 10, I: 1.5, tauH: 1, leadH: 1, L: null });
  add('ohne Lernstufe: Form AB (10 + 0,85·1,5 = 11,275) — nie die Parameter der vollen Form', !!noL && noL.form === 'AB' && Math.abs(noL.value - 11.275) < 1e-12);
  const noI = stationValueOf(table, 't', { M: 10, I: null, tauH: null, leadH: 1, L: null });
  add('ohne Messung und ohne Lernstufe: Form B (10,2); mit Lernstufe, aber ohne Eintrag S0: ebenfalls B',
    !!noI && noI.form === 'B' && Math.abs(noI.value - 10.2) < 1e-12 && stationValueOf(table, 't', { M: 10, I: null, tauH: null, leadH: 1, L: 12 })?.form === 'B');
  add('keine Antwort: ohne Stationsvorhersage, in einer Gruppe ohne Eintrag (τ = 2), jenseits der Gruppen (τ = 300)',
    stationValueOf(table, 't', { M: null, I: 1, tauH: 1, leadH: 1, L: 1 }) === null
    && stationValueOf(table, 't', { M: 10, I: 1, tauH: 2, leadH: 2, L: 12 }) === null
    && stationValueOf(table, 't', { M: 10, I: 1, tauH: 300, leadH: 300, L: 12 }) === null);
  const w = stationValueOf(table, 'ws', { M: 0.3, I: -1.5, tauH: 1, leadH: 1, L: 0.2 });
  add('Wind: Wert bei 0 begrenzt, Verteilung zensiert [0, 90] mit dem unbegrenzten μ (Median = Wert); Negativkontrolle: unbegrenzt wäre er negativ',
    !!w && w.value === 0 && w.dist.kind === 'censoredNormal' && w.dist.mu < 0 && w.dist.lo === 0, w ? `${w.value} (μ ${w.dist.kind === 'censoredNormal' ? w.dist.mu.toFixed(3) : '—'})` : 'null');
  add('Station am Punkt: 1,2 km / 30 m ja; 6 km nein; 60 m nein; unbekannter Abstand nein',
    stationAtPoint(table, 1.2, 30) && !stationAtPoint(table, 6, 0) && !stationAtPoint(table, 1, -60) && !stationAtPoint(table, null, 0));
  // AX-5: country entries
  const tCC: StackTable = { ...table, entries: { ...table.entries, 'ws|0|S|CH': { n: 400, beta: [0.0, 0.4, 0.5], sigma: 0.9 } } };
  const chS = stationValueOf(tCC, 'ws', { M: 3, I: 1, tauH: 1, leadH: 1, L: 4, country: 'CH' });
  const liS = stationValueOf(tCC, 'ws', { M: 3, I: 1, tauH: 1, leadH: 1, L: 4, country: 'LI' });
  const deS = stationValueOf(tCC, 'ws', { M: 3, I: 1, tauH: 1, leadH: 1, L: 4, country: 'DE' });
  const noC = stationValueOf(tCC, 'ws', { M: 3, I: 1, tauH: 1, leadH: 1, L: 4 });
  const nearV = (a: number | undefined, b: number) => a != null && Math.abs(a - b) < 1e-12;
  add('AX-5 Landeseintrag: CH nimmt ws|0|S|CH (3 + 0,4 + 0,5 = 3,9, σ 0,9), LI zählt als CH, DE und ohne Land nehmen den gepoolten Eintrag (3 − 0,1 + 0,6 + 0,2 = 3,7); T ohne Landeseintrag bleibt gepoolt auch für CH',
    !!chS && nearV(chS.value, 3.9) && chS.country === 'CH' && chS.dist.kind === 'censoredNormal' && chS.dist.sigma === 0.9 && !!liS && nearV(liS.value, 3.9)
    && !!deS && nearV(deS.value, 3.7) && deS.country === null && !!noC && nearV(noC.value, 3.7) && stationValueOf(tCC, 't', { M: 10, I: 1.5, tauH: 1, leadH: 1, L: 12, country: 'CH' })?.country === null,
    `${chS?.value} · ${deS?.value}`);
  add('AX-5 Tabelle: ein Landeseintrag mit gültigem Land besteht; ein fremdes Land (FR) und ein fünfter Teil werden benannt',
    validateStackTable(tCC).length === 0 && validateStackTable({ ...table, entries: { 'ws|0|S|FR': { n: 400, beta: [0, 0.4, 0.5], sigma: 0.9 } } }).length === 1 && validateStackTable({ ...table, entries: { 'ws|0|S|CH|x': { n: 400, beta: [0, 0.4, 0.5], sigma: 0.9 } } }).length === 1);
  add('Formen je Zeile: S / AB / S0 / B; mosmix+anker ohne Messung ist die Stationsvorhersage selbst (null); τ-Gruppen 1…6 einzeln, 7–12 … 121–240',
    formOf('stack', 1, 1) === 'S' && formOf('stack', 1, null) === 'AB' && formOf('stack', null, 1) === 'S0' && formOf('stack', null, null) === 'B' && formOf('mosmix+anker', null, 1) === null
    && tauGroup(1) === 0 && tauGroup(6) === 5 && tauGroup(7) === 6 && tauGroup(240) === 10 && tauGroup(241) === -1 && tauGroup(0) === -1 && tauGroup(null) === -1);
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}
