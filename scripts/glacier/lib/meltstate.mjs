/**
 * meltstate.mjs — phase GM (GM-3d, V-GM-32): where the carried snow state of the melt run stands in time. Pure, no I/O.
 *
 * `ahead` (the default and the named fall back): the state is stored 6 h AFTER the run hour and taken by the next run when it is 0–30 h old. A run that
 * comes 3 h after its predecessor finds it in the future and starts cold (20 of 152 transitions between 12.10. and 23.11.2026); a run that comes 9–15 h
 * later takes it and loses the hours in between.
 *
 * `run-hour`: the state is stored AT the run hour (what the run itself started from), and the file carries the forcing of the next
 * `GLACIER_MELT_STATE_PEND_H` hours per forcing owner. The next run advances the state with that forcing to its own hour, whatever the distance; only hours
 * beyond the stored forcing are missing, and the document names them (`state.ageH`, as before).
 *
 * The stored forcing is what `meltOfForcing` reads: temperature at the owner's reference elevation, freezing level, radiation, precipitation. A glacier of
 * class C runs on a neighbour's forcing: `pend.o` names the owner, the bands and the parameters are its own.
 */
import { GLACIER_MELT_STATE_PEND_H } from '../../../src/glacier/glacierMeltContract.ts';

export const MELT_STATE_MODES = Object.freeze(['ahead', 'run-hour']);
/** The mode of a run without the switch — the fall back. */
export const MELT_STATE_DEFAULT = 'ahead';

/** The switch `--melt-state` / `GLACIER_MELT_STATE`: empty = the default, an unknown word throws (the run stops before it reads or writes anything). */
export function meltStateModeOf(word) {
  if (word == null || word === '') return MELT_STATE_DEFAULT;
  if (!MELT_STATE_MODES.includes(word)) throw new Error(`--melt-state=${word}: unbekannt (erlaubt: ${MELT_STATE_MODES.join(', ')})`);
  return word;
}

const q = (v, f) => (Number.isFinite(v) ? Math.round(v * f) / f : null);
/** The first `hours` of a forcing in the form the state file carries: `[zRef, t (0.01 K), fz (1 m), g (1 W/m²), p (0.01 mm)]`, a missing value is `null`. */
export function pendOfForcing(f, hours = GLACIER_MELT_STATE_PEND_H) {
  const col = (a, fac) => Array.from({ length: hours }, (_, i) => q(a?.[i], fac));
  return [f.zRef, col(f.t, 100), col(f.fz, 1), col(f.g, 1), col(f.p, 100)];
}
/** The stored forcing back in the form `meltOfForcing` reads (`null` = NaN, as a gap in the forecast is). `null` when the row is not usable. */
export function forcingOfPend(row) {
  if (!Array.isArray(row) || row.length !== 5 || !Number.isFinite(row[0])) return null;
  const [zRef, t, fz, g, p] = row;
  if (![t, fz, g, p].every((a) => Array.isArray(a) && a.length === t.length)) return null;
  const col = (a) => Float64Array.from(a, (v) => (v == null ? NaN : v));
  return { zRef, t: col(t), fz: col(fz), g: col(g), p: col(p) };
}

/**
 * What a run does with the state file it finds: `{ carry, ageH, replayH, form }`.
 *   carry    the state is taken (`false` = cold start)
 *   ageH     hours the taken state lags behind the run hour (hours without forcing); `null` when nothing is taken
 *   replayH  hours to advance with the stored forcing (0 in mode `ahead` and for a file without forcing)
 *   form     `pend` (file with forcing, read as such), `plain` (the rule of `ahead`), `none` (no usable file)
 */
export function meltStateVerdict(state, mode, t0Ms, maxAgeH) {
  const H = 3_600_000;
  if (!state || !Number.isFinite(state.atMs)) return { carry: false, ageH: null, replayH: 0, form: 'none' };
  const gapH = (t0Ms - state.atMs) / H;
  if (mode === 'run-hour' && state.pend && Number.isInteger(state.pend.h) && state.pend.h >= 0) {
    if (!(gapH >= 0) || !Number.isInteger(gapH)) return { carry: false, ageH: null, replayH: 0, form: 'pend' };
    const replayH = Math.min(gapH, state.pend.h), ageH = gapH - replayH;
    return ageH <= maxAgeH ? { carry: true, ageH, replayH, form: 'pend' } : { carry: false, ageH: null, replayH: 0, form: 'pend' };
  }
  // the rule as it always was (mode `ahead`, and a file without forcing in mode `run-hour`: the first run after the switch)
  const carry = gapH >= 0 && gapH <= maxAgeH;
  return { carry, ageH: carry ? gapH : null, replayH: 0, form: 'plain' };
}

/** The state of one glacier in the resolution of the file: `[swe (0.1 mm) per band, snow albedo × 1000 per band]`. */
export const stateRowOf = (st) => [Array.from(st.swe, (v) => Math.round(v * 10) / 10), Array.from(st.aS, (v) => Math.round(v * 1000))];
/** …and back, as the run reads it. */
export const stateOfRow = (row) => ({ swe: Float64Array.from(row[0]), aS: Float64Array.from(row[1], (v) => v / 1000) });
