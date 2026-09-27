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
import { FIT_VARS, type FitVar, type FoldScheme } from './strata';
import { SPEED_NAMES } from './fitSpeed';
import { Z_NAMES } from './features';
import { V_NAMES, O_NAMES, A_NAMES, K_MODS, P_MODS, INTER_NAMES, CLIMA_NAMES, type ClimaColumns } from './design';
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

/**
 * Phase FX-5 (E-FX-8): the climatology column of ONE variable's mean design under a table — `station` only when the table is a
 * station table AND the variable is in `design.mean.climaVars` (or the list is absent = all). ONE definition for `predict.ts`,
 * the fit and the verifier.
 */
export function climaColumnsFor(design: { clima?: ClimaColumns; climaVars?: readonly string[] } | undefined, v: string): ClimaColumns {
  if (!design || design.clima !== 'station') return 'none';
  return design.climaVars == null || design.climaVars.includes(v) ? 'station' : 'none';
}
/** `--climaVars=t,td,gust` → the checked list (FIT_VARS only, no duplicates, non-empty); throws named. */
export function parseClimaVars(spec: string): FitVar[] {
  const vars = spec.split(',').map((x) => x.trim()).filter(Boolean);
  if (!vars.length) throw new Error('--climaVars: leer');
  for (const v of vars) if (!(FIT_VARS as readonly string[]).includes(v)) throw new Error(`--climaVars: unbekannte Größe ${v} (erlaubt ${FIT_VARS.join(',')})`);
  if (new Set(vars).size !== vars.length) throw new Error('--climaVars: doppelte Größe');
  return vars as FitVar[];
}

export interface FusionTables {
  schema: number; kind: string; fitVersion: string;
  provenance: 'hindcast';
  builtAt: string;
  period: { from: string; to: string } | null;
  /**
   * What the tables were fitted from — hashes name the exact inputs. `foldScheme` (phase FX, C8): `half` = the time folds,
   * the fold β and the out-of-fold verdicts are on half-month groups (`strata.ts FoldScheme`); absent = `month` (the fit
   * writes the field only under `--folds=half`, so a month fit stays byte-identical to fusionFit@3).
   */
  inputs: {
    featuresHash: string | null; casesCodeHash: string | null; caseFiles: number; rows: number; months: string[]; regions: string[]; foldScheme?: FoldScheme;
    /** Phase FX (C1), written only under the flags: the ρ_f ridge target per `${var}|${bin}` (clipped to [0,05; 1]), the rows per variable whose μ_c came from the pooled band|country climatology, the shuffled-μ_c control. */
    rhoTarget?: Record<string, number>; climaFallback?: Record<string, number>; climaShuffle?: boolean;
    /** `--rhoTarget=cv`: per `${form}|${bin}` how many strata the CV gave the ρ_f target and how many today's. */
    rhoChosen?: Record<string, { rho: number; one: number }>;
    /** Phase FX (V-FX-7), written only under `--scaleVars`: the variables the σ-scale rule may write a scale ≠ 1 for. */
    scaleVars?: string[];
  };
  design: {
    z: readonly string[];
    /**
     * The mean design's columns after Z: the ȳ modulators (form K), the ŷ_m modulators per source (form P), the interactions
     * (both); `clima` (phase FX, C1): `station` = one more column μ_c at the end (`CLIMA_NAMES`), absent = `none`.
     */
    mean: { kMods: readonly string[]; pMods: readonly string[]; inter: readonly string[]; clima?: ClimaColumns;
      /**
       * Phase FX-5 (E-FX-8, `fit.mjs --climaVars`): the variables whose mean design carries the μ_c column; absent = every
       * variable of a `station` table (the Fit-5b/5c tables stay readable). Only with `clima: 'station'`; the other variables
       * keep the `none` design (byte-identical to a fit without the column — the negative control of the flag).
       */
      climaVars?: readonly string[] };
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
  /**
   * Phase FX-4 (`fit.mjs --climaMu`, §6.4): the ESTIMATED μ_c coefficients per station and variable that fed the μ_c column
   * and ρ_f — a leave-station-out document (`diag-fx4.mjs`), so the scorer reads the same definition as the fit. Absent
   * (the default) = the μ_c column read `clima.byPoint` (the station's own series). The client tables drop it.
   */
  climaMu?: { estimator: unknown; candidate: string | null; trendSet: string | null; source: { path: string; sha256: string }; byPoint: Record<string, Partial<Record<string, number[]>>> } | null;
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
  // phase FX (C1): the climatology column is declared, or absent (= none); a station table's written mean entries end with μ_c
  const clima = d.design?.mean?.clima;
  if (clima !== undefined && clima !== 'none' && clima !== 'station') errs.push(`design.mean.clima ${String(clima)} (erwartet none oder station)`);
  // phase FX-5 (E-FX-8): a per-variable column list is a non-empty FIT_VARS subset and needs a station table
  const cv = d.design?.mean?.climaVars;
  if (cv !== undefined) {
    if (!Array.isArray(cv) || !cv.length || cv.some((v) => !(FIT_VARS as readonly string[]).includes(v)) || new Set(cv).size !== cv.length) errs.push('design.mean.climaVars: erwartet nichtleere Teilmenge von FIT_VARS ohne Dublette');
    else if (clima !== 'station') errs.push('design.mean.climaVars ohne design.mean.clima = station');
  }
  // fusionFit@3: the occurrence design carries the cube column, the speed law its three parameters (a @2 table has neither)
  if (JSON.stringify(d.design?.occurrence) !== JSON.stringify(O_NAMES)) errs.push('design.occurrence ≠ O_NAMES');
  if (JSON.stringify(d.design?.speed) !== JSON.stringify(SPEED_NAMES)) errs.push('design.speed ≠ SPEED_NAMES');
  for (const [k, e] of Object.entries(d.mean ?? {})) {
    if (e.status === 'written' && (!Array.isArray(e.beta) || e.beta.length !== e.names.length || e.beta.some((x) => !Number.isFinite(x)))) errs.push(`mean ${k}: beta`);
    // the μ_c column exactly where the table declares it: a station table ends every (listed) variable's design with μ_c, the others never
    if (e.status === 'written' && Array.isArray(e.names) && e.names.length) {
      const wantsMu = climaColumnsFor(d.design?.mean, k.split('|')[1]) === 'station', hasMu = e.names[e.names.length - 1] === CLIMA_NAMES[CLIMA_NAMES.length - 1];
      if (wantsMu && !hasMu) errs.push(`mean ${k}: ohne μ_c-Spalte in einer station-Tabelle`);
      if (!wantsMu && hasMu) errs.push(`mean ${k}: μ_c-Spalte, obwohl die Tabelle sie für diese Größe nicht erklärt`);
    }
  }
  for (const [k, e] of Object.entries(d.variance ?? {})) {
    if (e.status === 'written' && (!Array.isArray(e.c) || e.c.length !== V_NAMES.length || !(e.floor >= 0) || (e.scale != null && !(e.scale > 0 && e.scale < 10)))) errs.push(`variance ${k}`);
  }
  for (const [k, e] of Object.entries(d.occurrence ?? {})) {
    if (e.status === 'written' && (!Array.isArray(e.beta) || e.beta.length !== O_NAMES.length || e.beta.some((x) => !Number.isFinite(x)))) errs.push(`occurrence ${k}: beta`);
  }
  // phase FX-4: an estimated-μ_c block, when present, carries C_DIM coefficients per station and variable
  if (d.climaMu != null) {
    const bp = d.climaMu.byPoint;
    if (!bp || typeof bp !== 'object') errs.push('climaMu ohne byPoint');
    else for (const [id, byVar] of Object.entries(bp)) { for (const [v, m] of Object.entries(byVar ?? {})) if (!Array.isArray(m) || m.length !== C_NAMES.length || m.some((x) => !Number.isFinite(x))) { errs.push(`climaMu ${id} ${v}`); break; } if (errs.length && errs[errs.length - 1].startsWith('climaMu ')) break; }
  }
  for (const [k, e] of Object.entries(d.speed ?? {})) {
    if (e.status === 'written' && !(Number.isFinite(e.a) && Number.isFinite(e.b) && e.b > 0 && Number.isFinite(e.c) && e.c > 0)) errs.push(`speed ${k}`);
    // phase FX (A1): the key is `${form}|ws|${bin}|${cls}` with an optional band suffix, the family `add` (absent) or `sd`
    if (!/^[KP]\|ws\|\d+\|[^|]+(\|(lt800|ge800))?$/.test(k)) errs.push(`speed ${k}: Schlüssel`);
    if (e.law !== undefined && e.law !== 'add' && e.law !== 'sd') errs.push(`speed ${k}: law ${String(e.law)}`);
  }
  return errs;
}
