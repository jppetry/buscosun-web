/**
 * fitAtoms.ts — the two cloud atoms of the learning stage (phase AX, AX-4; `audit/fusion-ausbau.md` §4; V-FV-10, V-FX-15).
 *
 * The learned cloud cover is a censored normal on [0, 100]; its mass on the bounds is what its tails reach, and the truth
 * piles up there far beyond that (57 % of the hours at 0 or 100 %; PIT edge share 0,26–0,30 in every lead bin). Here the
 * two atoms are learned directly: P(Y = 0 | x) and P(Y = 100 | x) as logistic regressions (`AT_NAMES`, `atomsDesign`) on
 * the same reservoir machinery as the precipitation hurdle (`HurdleRows`, damped Newton, exact fold β, out-of-fold Brier
 * against the censored normal's own atom probability). The engine's family is `cloudMix` (`dist.ts`): the atoms plus the
 * learned μ/σ as the truncated middle part. Same rules as the hurdle: no out-of-fold gain over the reference ⇒ `no-skill`,
 * `predict` then keeps the censored normal.
 */
import { AT_NAMES } from './design';
import { HurdleRows, irlsDamped, logisticStart, predictWet, BrierPair } from './fitPrecip';
import { STRATUM_MIN } from './strata';

export type AtomSide = 'clear' | 'overcast';
export const ATOM_SIDES: readonly AtomSide[] = Object.freeze(['clear', 'overcast']);
/** The truth counts as an atom at or beyond these covers (oktas 0 and 8 of the station's report; 12,5 % per okta). */
export const ATOM_CLEAR_MAX = 6.25, ATOM_OVERCAST_MIN = 93.75;

export interface AtomsCv { brier: number; brierRef: number; /** 1 − brier/brierRef */ skill: number | null; n: number; folds: number }
export interface AtomsEntry {
  form: 'K'; var: 'clct'; bin: number; cls: string; side: AtomSide;
  names: readonly string[]; beta: number[];
  n: number; days: number; share: number; iterations: number; llPerRow: number;
  status: 'written' | 'too-short' | 'no-skill';
  /** Out-of-fold Brier of the atom against the censored normal's own atom mass on the same rows. */
  cv?: AtomsCv | null;
  /** β per held-out fold key (exact refit without the held and purged groups). */
  folds?: Record<string, number[]>;
}

export const atomsKey = (form: 'K', bin: number, cls: string, side: AtomSide): string => `${form}|clct|${bin}|${cls}|${side}`;

/**
 * One atom of one stratum from its reservoir: pooled β (damped Newton), β per time fold, the out-of-fold Brier against the
 * reference probability stored per row (`r.pCube` = the censored normal's atom mass), the verdict.
 */
export function fitAtomsRows(form: 'K', bin: number, cls: string, side: AtomSide, r: HurdleRows, folds: Array<{ held: string[]; purged: string[] }>, min: { n: number; days: number } = STRATUM_MIN): AtomsEntry {
  const p = r.p;
  const all = new Uint8Array(r.n).fill(1);
  let ones = 0; for (let i = 0; i < r.n; i++) ones += r.ys[i];
  const base = { form, var: 'clct' as const, bin, cls, side, names: AT_NAMES, n: r.n, days: r.days.size, share: r.n ? ones / r.n : 0, iterations: 0, llPerRow: 0 };
  if (r.n < min.n || r.days.size < min.days || ones === 0 || ones === r.n) return { ...base, beta: [], status: 'too-short' };
  const pooled = irlsDamped(r, all, logisticStart(p, ones / r.n));
  const round = (b: Float64Array) => Array.from(b).map((x) => Math.round(x * 1e6) / 1e6);
  const entry: AtomsEntry = { ...base, beta: round(pooled.beta), iterations: pooled.iterations, llPerRow: Math.round(pooled.llPerRow * 1e6) / 1e6, status: 'written' };
  const foldsOut: Record<string, number[]> = {};
  const bp = new BrierPair();
  let nFolds = 0;
  for (const f of folds) {
    const heldIdx = new Set(f.held.map((m) => r.months.indexOf(m)).filter((i) => i >= 0));
    const outIdx = new Set([...heldIdx, ...f.purged.map((m) => r.months.indexOf(m)).filter((i) => i >= 0)]);
    if (!heldIdx.size) continue;
    const train = new Uint8Array(r.n); let nT = 0;
    for (let i = 0; i < r.n; i++) if (!outIdx.has(r.monthIdx[i])) { train[i] = 1; nT += 1; }
    if (nT < 2 * p) continue;
    const fb = irlsDamped(r, train, pooled.beta);
    foldsOut[f.held[0]] = round(fb.beta);
    for (let i = 0; i < r.n; i++) {
      if (!heldIdx.has(r.monthIdx[i])) continue;
      let eta = 0; const o = i * p;
      for (let j = 0; j < p; j++) eta += fb.beta[j] * r.xs[o + j];
      bp.add(1 / (1 + Math.exp(-eta)), r.pCube[i], r.ys[i] as 0 | 1);
    }
    nFolds += 1;
  }
  const cv: AtomsCv | null = bp.n ? { brier: Math.round((bp.sse / bp.n) * 1e6) / 1e6, brierRef: Math.round((bp.sseCube / bp.n) * 1e6) / 1e6, skill: null, n: bp.n, folds: nFolds } : null;
  return withAtomsCv(entry, cv, Object.keys(foldsOut).length ? foldsOut : null);
}

/** Apply the CV verdict: `no-skill` unless the out-of-fold Brier beats the censored normal's atom mass (no evidence = no skill). */
export function withAtomsCv(e: AtomsEntry, cv: AtomsCv | null, folds: Record<string, number[]> | null): AtomsEntry {
  if (e.status !== 'written') return { ...e, cv, ...(folds ? { folds } : {}) };
  const skill = cv && cv.brierRef > 0 ? 1 - cv.brier / cv.brierRef : null;
  const status: AtomsEntry['status'] = skill != null && skill > 0 ? 'written' : 'no-skill';
  return { ...e, cv: cv ? { ...cv, skill } : null, status, ...(folds ? { folds } : {}) };
}

/** P(atom | x) of a written entry. */
export const predictAtom = (x: Float64Array, beta: readonly number[]): number => predictWet(x, beta);

/**
 * The two atom masses of a stratum from written entries, jointly clipped so the middle part keeps at least 2 % —
 * `null` when either side is not written (the caller keeps the censored normal).
 */
export function atomMasses(clear: AtomsEntry | undefined, overcast: AtomsEntry | undefined, x: Float64Array): { pClear: number; pOvercast: number } | null {
  if (!clear || !overcast || clear.status !== 'written' || overcast.status !== 'written') return null;
  if (clear.beta.length !== x.length || overcast.beta.length !== x.length) return null;
  let pc = predictAtom(x, clear.beta), po = predictAtom(x, overcast.beta);
  const s = pc + po;
  if (s > 0.98) { pc *= 0.98 / s; po *= 0.98 / s; }
  return { pClear: pc, pOvercast: po };
}
