/**
 * GL-3 — contract of the melt line: one document per run (`melt/<run>.json`, run = `yyyymmddhh` UTC of the run hour) and the carried snow
 * state (`melt/state.json`). DOM-free and import-light: the producer (`scripts/glacier/melt.mjs`), the verifiers and the page share it.
 *
 * Honesty rules encoded here (plan §6 "Einheit", §8):
 *  - the unit "mm w. e." appears ONLY when the calibration gate released it (`gate.unit`); otherwise a document carries the unitless melt index
 *    (0–100, relative to a very hot summer day) and no millimetre field at all — a client cannot show what is not in the file;
 *  - every spread of a sum is the quantile of the sums of K scenarios (`sums: 'scenarios'`) — never a sum of hourly quantiles;
 *  - the origin of the whole document is `model` (never `measured`), the parameters name theirs (`measured` = fitted, `set`, `literature`).
 */
import type { GlacierParamOrigin } from './glacierContract';

export const GLACIER_MELT_DAYS = 14;
export const GLACIER_MELT_HOURS = 336;
/** Scenarios of the sums (`set`): the quantile of K sums is a quantile of sums, not a sum of quantiles. */
export const GLACIER_MELT_SCENARIOS = 40;
/** Hourly correlation of the scenario temperature noise (`set`). */
export const GLACIER_MELT_RHO = 0.9;
/** Index 100 = this melt (mm w. e. per day, glacier-wide) — a very hot summer day, `set`; the index has no unit. */
export const GLACIER_MELT_REF_DAILY_MM = 30;
export const GLACIER_MELT_PER_DAY_MAX = 4;
export const GLACIER_MELT_RUN_RE = /^\d{10}$/;
export const glacierMeltRunPath = (run: string) => `melt/${run}.json`;
export const GLACIER_MELT_STATE_PATH = 'melt/state.json';
export const GLACIER_MELT_REASONS = Object.freeze(['no-forcing', 'few-hours', 'no-hypsometry', 'error'] as const);

/** [p10, p50, p90]. */
export type Triple = [number, number, number];

export interface GlacierMeltRow {
  id: string;
  /** Daily melt INDEX (0–100, unitless) for the 14 days from the run hour, [p10, p50, p90] over the scenarios. */
  idx: Triple[];
  /** Mean daily index over the first 7 and 14 days, quantile of the scenario means. */
  ix7: Triple;
  ix14: Triple;
  /** Only with a released unit: glacier-wide melt per day (mm w. e.), the 7- and 14-day sums (quantile of the scenario sums). */
  mm?: Triple[];
  s7?: Triple;
  s14?: Triple;
  /** Share (0–100) of the glacier area with an ice surface at the run hour (snow water < 5 mm and below the equilibrium line). */
  ice: number;
  /** Daily maximum of the freezing level (m), `null` where the chain had none. */
  zf: (number | null)[];
  /** Where the freezing level came from: the cube's pressure levels (`cells`), the standard lapse from the temperature at the glacier (`lapse`, glaciers above ≈ 3 000 m), or both. */
  zs?: 'cells' | 'lapse' | 'mixed';
  /** Nights (of 14) in which the temperature at the tongue stays above 0 °C. */
  nf: number;
  /** Forcing: own Fusion point at the median elevation (`own`) or the neighbour's (`from` = its id). */
  f: 'own' | string;
}

export interface GlacierMeltDoc {
  schema: 1;
  kind: 'glacier/melt';
  run: string;
  runAt: string;
  origin: 'model';
  engine: { name: string; version: number | null; stageCurrent: boolean };
  cube: { t1: string | null; t2: string | null; t3: string | null; stations: string | null };
  params: { pf: number; TF: number; SRF: number; origin: { pf: GlacierParamOrigin; TF: GlacierParamOrigin; SRF: GlacierParamOrigin }; report: string };
  gate: { unit: boolean; reason: string };
  scenarios: { k: number; rho: number; origin: 'set'; sums: 'scenarios' };
  ref: { dailyMm: number; origin: 'set' };
  state: { source: 'carried' | 'cold'; ageH: number | null; nudged: number };
  build: string;
  glaciers: GlacierMeltRow[];
  skipped: { id: string; reason: string }[];
}

export interface GlacierMeltState {
  schema: 1;
  kind: 'glacier/melt-state';
  /** Time the snapshots belong to (ms UTC of the run hour they follow). */
  atMs: number;
  /** id → [swe per band (mm), snow albedo ×1000 per band]. */
  g: Record<string, [number[], number[]]>;
}

const isTriple = (t: unknown): t is Triple => Array.isArray(t) && t.length === 3 && t.every((v) => typeof v === 'number' && Number.isFinite(v)) && t[0] <= t[1] && t[1] <= t[2];

export function meltProblems(doc: GlacierMeltDoc, catalogIds?: ReadonlySet<string>): string[] {
  const p: string[] = [];
  if (doc?.kind !== 'glacier/melt' || doc.schema !== 1) return ['kind/schema'];
  if (!GLACIER_MELT_RUN_RE.test(doc.run)) p.push(`Lauf ${doc.run}`);
  if (doc.origin !== 'model') p.push(`Herkunft ${doc.origin}`);
  if (doc.scenarios?.sums !== 'scenarios') p.push('Summen nicht aus Szenarien');
  if (!(doc.scenarios?.k >= 20)) p.push(`Szenarien ${doc.scenarios?.k}`);
  for (const k of ['pf', 'TF', 'SRF'] as const) if (!(Number.isFinite(doc.params?.[k]) && doc.params[k] >= 0)) p.push(`Parameter ${k}`);
  const unit = doc.gate?.unit === true;
  if (typeof doc.gate?.reason !== 'string' || !doc.gate.reason) p.push('Eich-Gate ohne Grund');
  const seen = new Set<string>();
  for (const r of doc.glaciers ?? []) {
    if (seen.has(r.id)) p.push(`${r.id}: doppelt`);
    seen.add(r.id);
    if (catalogIds && !catalogIds.has(r.id)) p.push(`${r.id}: nicht im Katalog`);
    if (!Array.isArray(r.idx) || r.idx.length !== GLACIER_MELT_DAYS || !r.idx.every(isTriple)) p.push(`${r.id}: Tagesindex`);
    else if (r.idx.some((t) => t[0] < 0 || t[2] > 100)) p.push(`${r.id}: Index außerhalb 0–100`);
    if (!isTriple(r.ix7) || !isTriple(r.ix14)) p.push(`${r.id}: Mittelindex`);
    if (!(r.ice >= 0 && r.ice <= 100)) p.push(`${r.id}: Eisanteil ${r.ice}`);
    if (!Array.isArray(r.zf) || r.zf.length !== GLACIER_MELT_DAYS) p.push(`${r.id}: Nullgradgrenze`);
    if (r.zs != null && !['cells', 'lapse', 'mixed'].includes(r.zs)) p.push(`${r.id}: Herkunft der Nullgradgrenze ${r.zs}`);
    if (!(Number.isInteger(r.nf) && r.nf >= 0 && r.nf <= GLACIER_MELT_DAYS)) p.push(`${r.id}: frostfreie Nächte ${r.nf}`);
    const hasMm = r.mm != null || r.s7 != null || r.s14 != null;
    if (hasMm && !unit) p.push(`${r.id}: Millimeter ohne freigegebene Einheit`);
    if (unit) {
      if (!r.mm || r.mm.length !== GLACIER_MELT_DAYS || !r.mm.every(isTriple) || !isTriple(r.s7) || !isTriple(r.s14)) p.push(`${r.id}: Einheit freigegeben, aber Millimeter fehlen`);
      else if (r.s14[1] + 0.5 < r.s7[1]) p.push(`${r.id}: 14-Tage-Summe kleiner als die 7-Tage-Summe`);
    }
  }
  for (const s of doc.skipped ?? []) if (!s.reason) p.push(`${s.id}: übersprungen ohne Grund`);
  return p;
}

export function meltStateProblems(s: GlacierMeltState): string[] {
  if (s?.kind !== 'glacier/melt-state' || s.schema !== 1) return ['kind/schema'];
  const p: string[] = [];
  if (!Number.isFinite(s.atMs)) p.push('Zeit');
  for (const [id, v] of Object.entries(s.g ?? {})) {
    if (!Array.isArray(v) || v.length !== 2 || v[0].length !== v[1].length) p.push(`${id}: Bänder`);
    else if (v[0].some((x) => !(x >= 0))) p.push(`${id}: negatives Schneewasser`);
  }
  return p;
}

/** Index of a daily melt (mm w. e., glacier-wide): 100 = `GLACIER_MELT_REF_DAILY_MM`, clipped, whole numbers. */
/**
 * The lead glaciers' rows of ONE run — what the day archive keeps (Gate E: model against measurement; the runs themselves stay in the
 * data repo for 72 h only). One definition for `melt.mjs --archive-out` and `glacier-archive.mjs`, so the two cannot drift apart.
 */
export function meltLeadDoc(doc: GlacierMeltDoc, leadIds: ReadonlySet<string>) {
  return { schema: 1 as const, kind: 'glacier/melt-lead' as const, run: doc.run, runAt: doc.runAt, engine: doc.engine, cube: doc.cube, gate: doc.gate, glaciers: doc.glaciers.filter((r) => leadIds.has(r.id)) };
}

export const meltIndexOf = (mmPerDay: number): number => Math.max(0, Math.min(100, Math.round((100 * mmPerDay) / GLACIER_MELT_REF_DAILY_MM)));
