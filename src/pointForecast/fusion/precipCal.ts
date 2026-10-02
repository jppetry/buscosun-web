/**
 * precipCal.ts — buscosun Fusion 8 (phase AX §6l, V-AX-22): the recalibration of the wet probability of the precipitation
 * hurdle. On the archive (16.–30.09.2026, 405 810 rows) the hurdle of Fusion 7 was reliable above 20 % but too DRY at the low
 * end — half of all wet hours fell where it said "< 10 %". The map is a probit-linear one,
 *
 *     p′_wet = Φ(a + b · Φ⁻¹(p_wet)),   p_wet = 1 − pDry,
 *
 * with (a, b) per SITUATION (`station`: a station member carries precipitation — the K-2 chain; `none`: no station member —
 * the learned hurdle) and LEAD GROUP (1–3 h = the radar horizon, 4–6, 7–24, 25–48, 51–120, 126–336 h), fitted by probit
 * regression on the archive (`scripts/fusionfit/lib/precipCalFit.mjs`, leave-day-out for the card, in-sample for the table).
 * The amount (μ, σ | wet) is untouched, as is every other variable. Identity entries (a = 0, b = 1) are written where the
 * fit had too few rows or wet hours. Pure module, no imports beyond the distribution type: the scorer and the engine share it.
 */
import { Phi, PhiInv, type Dist } from './dist';

export const PRECIP_CAL_KIND = 'buscosun-fusion/precip-cal';
export const PRECIP_CAL_VERSION = 1;
/** Lead groups [from, to] in hours; the first is the radar horizon (`NOWCAST_HORIZON_H` = 3). */
export const PRECIP_CAL_GROUPS: ReadonlyArray<readonly [number, number]> = Object.freeze([[1, 3], [4, 6], [7, 24], [25, 48], [51, 120], [126, 336]] as const);
export const PRECIP_CAL_GROUP_LABEL: ReadonlyArray<string> = Object.freeze(PRECIP_CAL_GROUPS.map(([a, b]) => `${a}–${b}`));
/** Probabilities are clamped to this band before the probit (Φ⁻¹(0) is −∞). */
export const PRECIP_CAL_P_EPS = 1e-4;
/** Minimum rows and wet hours for a written entry (else identity). */
export const PRECIP_CAL_MIN_ROWS = 200;
export const PRECIP_CAL_MIN_WET = 20;

/**
 * The situation of the hurdle the map is applied to — `k2`: the engine's K-2 chain (a station member and/or radar frames
 * carry precipitation; `fuseCubePoint` keeps K-2 there), `learned`: the learned hurdle (no station member, no radar frame).
 * The scorer labels a row `k2` when the point is the station (mode S), a neighbour member was accepted (mode L, mem = 1) or
 * the lead lies within the radar horizon (PRECIP_CAL_RADAR_H — the first lead group).
 */
export type PrecipCalSituation = 'k2' | 'learned';
export const PRECIP_CAL_SITUATIONS: ReadonlyArray<PrecipCalSituation> = Object.freeze(['k2', 'learned']);
export const PRECIP_CAL_RADAR_H = 3;
export interface PrecipCalEntry { n: number; wet: number; a: number; b: number; written: boolean }
export interface PrecipCalTable {
  schema: 1;
  kind: typeof PRECIP_CAL_KIND;
  fitVersion: number;
  provenance: 'archive';
  builtAt: string;
  period: { from: string | null; to: string | null; issueDays: number };
  rows: number;
  entries: Record<string, PrecipCalEntry>;
  notes: string[];
  source?: Record<string, unknown>;
}

export function precipCalGroup(leadH: number): number {
  for (let i = 0; i < PRECIP_CAL_GROUPS.length; i++) { const [a, b] = PRECIP_CAL_GROUPS[i]; if (leadH >= a && leadH <= b) return i; }
  return -1;
}
export const precipCalKey = (situation: PrecipCalSituation, group: number): string => `${situation}|${group}`;
export const PRECIP_CAL_IDENTITY: PrecipCalEntry = Object.freeze({ n: 0, wet: 0, a: 0, b: 1, written: false });

const clampP = (p: number): number => Math.min(1 - PRECIP_CAL_P_EPS, Math.max(PRECIP_CAL_P_EPS, p));
/** The probit of a (clamped) wet probability — the regressor of the fit and of the map. */
export const zOfPWet = (pWet: number): number => PhiInv(clampP(pWet));

/** p′_wet = Φ(a + b·Φ⁻¹(p_wet)); identity for an unwritten entry. */
export function recalPWet(pWet: number, entry: PrecipCalEntry | null | undefined): number {
  if (!entry || !entry.written || !Number.isFinite(pWet)) return pWet;
  return Math.min(1, Math.max(0, Phi(entry.a + entry.b * zOfPWet(pWet))));
}

/** The hurdle with the recalibrated dry mass; every other distribution kind passes through unchanged. */
export function applyPrecipCal(dist: Dist, entry: PrecipCalEntry | null | undefined): Dist {
  if (dist.kind !== 'hurdleLogNormal' || !entry || !entry.written) return dist;
  const pWet = recalPWet(1 - Math.max(0, Math.min(1, dist.pDry)), entry);
  return { ...dist, pDry: 1 - pWet };
}

/** The entry for a situation and lead; null without a table or group. */
export function precipCalEntry(table: PrecipCalTable | null | undefined, situation: PrecipCalSituation, leadH: number): PrecipCalEntry | null {
  if (!table) return null;
  const g = precipCalGroup(leadH);
  if (g < 0) return null;
  return table.entries[precipCalKey(situation, g)] ?? null;
}

/** Structural check of a table (the reader refuses an invalid one and names why). */
export function validatePrecipCalTable(t: unknown): string[] {
  const errs: string[] = [];
  const x = t as Partial<PrecipCalTable> | null;
  if (!x || typeof x !== 'object') return ['kein Objekt'];
  if (x.schema !== 1) errs.push(`schema ${String(x.schema)} ≠ 1`);
  if (x.kind !== PRECIP_CAL_KIND) errs.push(`kind ${String(x.kind)} ≠ ${PRECIP_CAL_KIND}`);
  if (x.fitVersion !== PRECIP_CAL_VERSION) errs.push(`fitVersion ${String(x.fitVersion)} ≠ ${PRECIP_CAL_VERSION}`);
  if (x.provenance !== 'archive') errs.push(`provenance ${String(x.provenance)} ≠ archive`);
  if (!x.entries || typeof x.entries !== 'object') errs.push('entries fehlen');
  else {
    for (const [k, e] of Object.entries(x.entries)) {
      const m = /^(k2|learned)\|(\d)$/.exec(k);
      if (!m || +m[2] >= PRECIP_CAL_GROUPS.length) { errs.push(`Schlüssel ${k}`); continue; }
      if (!e || typeof e !== 'object' || !Number.isFinite(e.a) || !Number.isFinite(e.b) || !(e.b > 0) || !Number.isInteger(e.n) || !Number.isInteger(e.wet) || typeof e.written !== 'boolean') errs.push(`Eintrag ${k}`);
      else if (e.written && (e.n < PRECIP_CAL_MIN_ROWS || e.wet < PRECIP_CAL_MIN_WET)) errs.push(`Eintrag ${k} geschrieben mit n ${e.n} / nass ${e.wet}`);
      else if (!e.written && (e.a !== 0 || e.b !== 1)) errs.push(`Eintrag ${k} ungeschrieben, aber nicht Identität`);
    }
  }
  return errs;
}
