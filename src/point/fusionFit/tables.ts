/**
 * tables.ts — the learned tables of buscosun Fusion (phase FL, `audit/fusion-lernphase.md` §5.8): what the fit
 * writes (`fusion.hindcast.json`), what the scorer and later the client read. Every entry carries its evidence
 * (n, days, period, fit version, cross-validation) and the provenance `hindcast` (E-F-23) — nothing here is
 * `measured` at the own product.
 */
import type { MeanEntry } from './fitMean';
import type { VarianceEntry } from './fitVariance';
import type { OccurrenceEntry, AmountEntry } from './fitPrecip';
import type { ClimaEntry } from './fitClima';
import type { SpeedEntry } from './fitSpeed';
import { SPEED_NAMES } from './fitSpeed';
import { Z_NAMES } from './features';
import { V_NAMES, O_NAMES, A_NAMES, K_MODS, P_MODS, INTER_NAMES } from './design';
import { C_NAMES, RHO_LAGS_H } from './fitClima';

/**
 * Bumped whenever a design column changes meaning (`design.ts`):
 *   fusionFit@1  FL-AP3 (23.09.2026) — Z, ȳ/ŷ_m modulators.
 *   fusionFit@2  FL-AP8a (25.09.2026) — plus the 14 site × diurnal/annual interactions `INTER_NAMES` after the ȳ/ŷ_m columns (V-FL-26).
 *   fusionFit@3  FL-AP8c (25.09.2026) — occurrence column `logitWetCube` (V-FL-18) with a CV verdict, σ scale per variance stratum
 *                (V-FL-15), the speed law `tables.speed` (V-FL-22, truncated normal behind the u/v model). A @2 table is rejected
 *                by name (`fitVersion fusionFit@2 ≠ fusionFit@3`); V-FL-32 (a column set per variable) is NOT in @3 and will be @4.
 */
export const FIT_VERSION = 'fusionFit@3';
export const TABLES_SCHEMA = 1;
export const TABLES_KIND = 'fusionfit/tables';

export interface FusionTables {
  schema: number; kind: string; fitVersion: string;
  provenance: 'hindcast';
  builtAt: string;
  period: { from: string; to: string } | null;
  /** What the tables were fitted from — hashes name the exact inputs. */
  inputs: { featuresHash: string | null; casesCodeHash: string | null; caseFiles: number; rows: number; months: string[]; regions: string[] };
  design: {
    z: readonly string[];
    /** The mean design's columns after Z: the ȳ modulators (form K), the ŷ_m modulators per source (form P), the interactions (both). */
    mean: { kMods: readonly string[]; pMods: readonly string[]; inter: readonly string[] };
    variance: readonly string[]; occurrence: readonly string[]; amount: readonly string[]; clima: readonly string[]; rhoLagsH: readonly number[];
    /** fusionFit@3: the parameters of the speed law (`fitSpeed.ts`). */
    speed: readonly string[];
  };
  /** Mean model per stratum key `${form}|${var}|${bin}|${cls}`. */
  mean: Record<string, MeanEntry>;
  variance: Record<string, VarianceEntry>;
  occurrence: Record<string, OccurrenceEntry>;
  amount: Record<string, AmountEntry>;
  /** fusionFit@3 (V-FL-22): the speed law per `${form}|ws|${bin}|${cls}` (cls = the u/v class) — TN(a + b·E_Rice, c·sd_Rice) at 0. */
  speed: Record<string, SpeedEntry>;
  /** Climatology per point id and variable, plus pooled fallbacks per `band|country`. */
  clima: { byPoint: Record<string, Partial<Record<string, ClimaEntry>>>; pooled: Record<string, Partial<Record<string, ClimaEntry>>>; rho: Record<string, Array<{ lagH: number; rho: number | null; n: number }>> } | null;
  /** Anchor persistence per variable (lead 1…48). */
  anchor: Record<string, { curve: Array<{ leadH: number; rho: number | null; weight: number | null; n: number }>; tauH: number | null; setTauH: number | null }> | null;
  /** Skill of the forecast anomaly per variable and bin: corr(μ_cube − μ_c, y − μ_c). */
  rhoForecast: Record<string, Array<{ bin: number; rho: number | null; n: number }>> | null;
  notes: string[];
}

export function newTables(builtAt: string): FusionTables {
  return {
    schema: TABLES_SCHEMA, kind: TABLES_KIND, fitVersion: FIT_VERSION, provenance: 'hindcast', builtAt, period: null,
    inputs: { featuresHash: null, casesCodeHash: null, caseFiles: 0, rows: 0, months: [], regions: [] },
    design: { z: Z_NAMES, mean: { kMods: K_MODS, pMods: P_MODS, inter: INTER_NAMES }, variance: V_NAMES, occurrence: O_NAMES, amount: A_NAMES, clima: C_NAMES, rhoLagsH: RHO_LAGS_H, speed: SPEED_NAMES },
    mean: {}, variance: {}, occurrence: {}, amount: {}, speed: {}, clima: null, anchor: null, rhoForecast: null, notes: [],
  };
}

/** Structural check of a tables document (the reader's admission rule). */
export function validateTables(doc: unknown): string[] {
  const errs: string[] = [];
  const d = doc as Partial<FusionTables>;
  if (!d || typeof d !== 'object') return ['kein Objekt'];
  if (d.schema !== TABLES_SCHEMA) errs.push(`schema ${String(d.schema)}`);
  if (d.kind !== TABLES_KIND) errs.push(`kind ${String(d.kind)}`);
  if (d.provenance !== 'hindcast') errs.push('provenance muss hindcast sein');
  if (d.fitVersion !== FIT_VERSION) errs.push(`fitVersion ${String(d.fitVersion)} ≠ ${FIT_VERSION}`);
  if (JSON.stringify(d.design?.z) !== JSON.stringify(Z_NAMES)) errs.push('design.z ≠ Z_NAMES');
  if (JSON.stringify(d.design?.variance) !== JSON.stringify(V_NAMES)) errs.push('design.variance ≠ V_NAMES');
  // the mean design's columns after Z must be the ones `meanDesignK/P` write (a fusionFit@1 table has no `design.mean` at all)
  if (JSON.stringify(d.design?.mean?.inter) !== JSON.stringify(INTER_NAMES)) errs.push('design.mean.inter ≠ INTER_NAMES');
  if (JSON.stringify(d.design?.mean?.kMods) !== JSON.stringify(K_MODS) || JSON.stringify(d.design?.mean?.pMods) !== JSON.stringify(P_MODS)) errs.push('design.mean.kMods/pMods ≠ K_MODS/P_MODS');
  // fusionFit@3: the occurrence design carries the cube column, the speed law its three parameters (a @2 table has neither)
  if (JSON.stringify(d.design?.occurrence) !== JSON.stringify(O_NAMES)) errs.push('design.occurrence ≠ O_NAMES');
  if (JSON.stringify(d.design?.speed) !== JSON.stringify(SPEED_NAMES)) errs.push('design.speed ≠ SPEED_NAMES');
  for (const [k, e] of Object.entries(d.mean ?? {})) {
    if (e.status === 'written' && (!Array.isArray(e.beta) || e.beta.length !== e.names.length || e.beta.some((x) => !Number.isFinite(x)))) errs.push(`mean ${k}: beta`);
  }
  for (const [k, e] of Object.entries(d.variance ?? {})) {
    if (e.status === 'written' && (!Array.isArray(e.c) || e.c.length !== V_NAMES.length || !(e.floor >= 0) || (e.scale != null && !(e.scale > 0 && e.scale < 10)))) errs.push(`variance ${k}`);
  }
  for (const [k, e] of Object.entries(d.occurrence ?? {})) {
    if (e.status === 'written' && (!Array.isArray(e.beta) || e.beta.length !== O_NAMES.length || e.beta.some((x) => !Number.isFinite(x)))) errs.push(`occurrence ${k}: beta`);
  }
  for (const [k, e] of Object.entries(d.speed ?? {})) {
    if (e.status === 'written' && !(Number.isFinite(e.a) && Number.isFinite(e.b) && e.b > 0 && Number.isFinite(e.c) && e.c > 0)) errs.push(`speed ${k}`);
  }
  return errs;
}
