/**
 * AW-6.2.1 — the GMA quality chain of the virtual road sensor (VS, `audit/autobahnwetter.md` §20): which measured road and
 * air temperatures the VS may COUPLE to or LEARN from. ONE module for the derive (coupling, residual tables), the client
 * (the words „Sensor aus seit …") and the verifier (`verify:road-vs`). Dependency-free apart from the contract's constants.
 *
 * It sits ON TOP of the measurement line (`roadContract.ts` `validateRoadSlot`), it does not change it: steps 1–2 are the
 * hard rules and observe hits the slot already carries (`x`, `o`), steps 3–9 are the chain the Startprompt names. The page
 * keeps showing what the measurement line shows; the VS is stricter (M4 pattern: an observe hit is a rejection here).
 * Thresholds are `set` (reasoned start values, calibrated on the archive in 6.2.4/6.2.8) unless a source is named.
 */
import {
  ROAD_JUMP_K, ROAD_SPREAD_K, ROAD_STUCK_GAP_SLOTS, ROAD_SLOT_MS, ROAD_NEIGHBOUR, type RoadPoint, type RoadRuleId,
} from '../roadContract';

/** Step 4: road AND air unchanged for at least this long ⇒ a frozen logger, not a calm night (Startprompt). */
export const VS_QC_CONSTANT_H = 4;
export const VS_QC_CONSTANT_SLOTS = (VS_QC_CONSTANT_H * 3_600_000) / ROAD_SLOT_MS;
/** Equal within the device resolution (0.01 K, same eps as the fill-value rule). */
export const VS_QC_EQUAL_K = 0.011;
/** Step 6: road − air in winter months outside this band is a WEAK value (`set`: a clear night cools the road 6–8 K below
 *  the air at a 4-m sensor, sun on dark asphalt warms it +10…+15 K; AW-0 p1/p99 −5,4 / +16,2 K over all seasons). */
export const VS_QC_WINTER = Object.freeze({ months: [11, 12, 1, 2, 3] as readonly number[], belowK: -10, aboveK: 15 });
/** Step 7: Tukey fence on the residuals (measurement − model) of the neighbours in the elevation band: k = 1,5 (Tukey 1977),
 *  at least `minN` residuals, IQR floored (`set`) so a very uniform neighbourhood does not reject a 1-K difference. */
export const VS_QC_IQR = Object.freeze({ k: 1.5, minN: 5, floorK: 1.0, radiusKm: ROAD_NEIGHBOUR.radiusKm, elevBandM: ROAD_NEIGHBOUR.elevClassM });
/** Step 8: |measurement − virtual sensor| > k·σ of the weather class ⇒ rejected; k `set`, σ floored. */
export const VS_QC_MODEL = Object.freeze({ k: 4, sigmaFloorK: 1.0 });
/** Step 9: state codes rime/snow/ice/glaze (0 20 138: 3–6) are weak information only. */
export const VS_QC_WEAK_CODES: readonly number[] = Object.freeze([3, 4, 5, 6]);
/** Coupling window of 6.2.4: a valid measurement older than this does not couple (Startprompt). */
export const VS_QC_COUPLE_MAX_AGE_MS = 6 * 3_600_000;

export type VsQcReason =
  | `hard:${RoadRuleId}` | `observe:${RoadRuleId}`
  | 'constant' | 'jump' | 'iqr' | 'model' | 'missing';
export type VsQcWeak = 'winterDiff' | 'spread' | 'code' | 'observe';

export interface VsQcVerdict {
  /** The value the VS may use (null = none). */
  value: number | null;
  ok: boolean;
  reasons: VsQcReason[];
}

export interface VsQcHistory {
  /** Slot stamps as ms, oldest → newest, the LAST one is the slot under test (from the 24-h ring, gaps allowed). */
  slotsMs: readonly number[];
  rs: ReadonlyArray<number | null>;
  ta: ReadonlyArray<number | null>;
}

export interface VsQcNeighbour {
  id: string;
  lat: number;
  lon: number;
  h: number | null;
  /** Valid road temperature of the neighbour (after its own steps 1–6) and the model value at its place and time. */
  rs: number;
  model: number;
}

export interface VsQcInput {
  id: string;
  lat: number;
  lon: number;
  h: number | null;
  slotMs: number;
  point: Pick<RoadPoint, 'rs' | 'rsHi' | 'ta' | 'td' | 'cond' | 'x' | 'o' | 'f'>;
  /** Ring history including the slot (optional: without it steps 3/4 cannot run and are skipped, named in `skipped`). */
  history?: VsQcHistory | null;
  /** Neighbours with valid road values and model values (step 7; optional). */
  neighbours?: readonly VsQcNeighbour[] | null;
  /** The virtual sensor at this station and slot (step 7 needs `rs`, step 8 needs `rs` and `sigma`); `coldStart` skips 8. */
  model?: { rs: number | null; sigma: number | null; coldStart?: boolean } | null;
}

export interface VsQcResult {
  rs: VsQcVerdict;
  ta: VsQcVerdict;
  weak: VsQcWeak[];
  /** Steps that could not run for lack of input (named, never silently passed). */
  skipped: Array<'constant' | 'jump' | 'iqr' | 'model'>;
}

const near = (a: number, b: number) => Math.abs(a - b) <= VS_QC_EQUAL_K;

/**
 * Step 4: both series unchanged over the last `VS_QC_CONSTANT_SLOTS` slots. Missing values or missing slots are neutral for
 * up to `ROAD_STUCK_GAP_SLOTS` in a row (the measurement line's rule); the newest value must be present.
 */
export function vsQcConstant(h: VsQcHistory, slotsNeeded = VS_QC_CONSTANT_SLOTS): boolean {
  const n = h.slotsMs.length;
  if (!n) return false;
  const rs0 = h.rs[n - 1], ta0 = h.ta[n - 1];
  if (rs0 == null || ta0 == null) return false;
  let covered = 0, gap = 0;
  for (let i = n - 1; i >= 0 && covered < slotsNeeded; i--) {
    const r = h.rs[i], a = h.ta[i];
    if (r == null || a == null) { if (++gap > ROAD_STUCK_GAP_SLOTS) return false; continue; }
    if (!near(r, rs0) || !near(a, ta0)) return false;
    gap = 0;
    // Count the slots this value covers (a gap of missing slots between two equal values counts as equal).
    covered = i === n - 1 ? 1 : covered + Math.max(1, Math.round((h.slotsMs[i + 1] - h.slotsMs[i]) / ROAD_SLOT_MS));
  }
  return covered >= slotsNeeded;
}

/** Step 3: jump of the road temperature against the previous valid value, scaled to 15 min (`ROAD_JUMP_K` per slot). */
export function vsQcJump(h: VsQcHistory): boolean {
  const n = h.slotsMs.length;
  if (n < 2 || h.rs[n - 1] == null) return false;
  for (let i = n - 2; i >= 0 && h.slotsMs[n - 1] - h.slotsMs[i] <= 4 * ROAD_SLOT_MS; i--) {
    if (h.rs[i] == null) continue;
    const slots = Math.max(1, Math.round((h.slotsMs[n - 1] - h.slotsMs[i]) / ROAD_SLOT_MS));
    return Math.abs((h.rs[n - 1] as number) - (h.rs[i] as number)) > ROAD_JUMP_K * slots;
  }
  return false;
}

/** Step 7: Tukey fence of the neighbours' residuals; `null` = not enough neighbours (skipped). */
export function vsQcIqr(me: { lat: number; lon: number; h: number | null; rs: number; model: number }, nb: readonly VsQcNeighbour[]): boolean | null {
  const band = (h: number | null) => (h == null ? -1 : Math.floor(h / VS_QC_IQR.elevBandM));
  const cosLat = Math.cos((me.lat * Math.PI) / 180);
  const res: number[] = [];
  for (const c of nb) {
    if (band(c.h) !== band(me.h)) continue;
    const dy = (c.lat - me.lat) * 111.2, dx = (c.lon - me.lon) * 111.2 * cosLat;
    if (dx * dx + dy * dy <= VS_QC_IQR.radiusKm ** 2) res.push(c.rs - c.model);
  }
  if (res.length < VS_QC_IQR.minN) return null;
  res.sort((a, b) => a - b);
  const q = (p: number) => { const i = (res.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return res[lo] + (res[hi] - res[lo]) * (i - lo); };
  const q1 = q(0.25), q3 = q(0.75), iqr = Math.max(q3 - q1, VS_QC_IQR.floorK);
  const r = me.rs - me.model;
  return r < q1 - VS_QC_IQR.k * iqr || r > q3 + VS_QC_IQR.k * iqr;
}

/** Step 8: the measurement against the virtual sensor; `null` = no model (skipped). */
export function vsQcModel(rs: number, model: { rs: number | null; sigma: number | null; coldStart?: boolean } | null | undefined): boolean | null {
  if (!model || model.rs == null || model.coldStart) return null;
  const s = Math.max(VS_QC_MODEL.sigmaFloorK, model.sigma ?? VS_QC_MODEL.sigmaFloorK);
  return Math.abs(rs - model.rs) > VS_QC_MODEL.k * s;
}

export const vsQcIsWinter = (ms: number): boolean => VS_QC_WINTER.months.includes(new Date(ms).getUTCMonth() + 1);

/** The whole chain for one station and slot. Pure. */
export function vsQcStation(input: VsQcInput): VsQcResult {
  const { point, history, neighbours, model, slotMs } = input;
  const weak: VsQcWeak[] = [];
  const skipped: VsQcResult['skipped'] = [];
  const verdict = (field: 'rs' | 'ta'): VsQcVerdict => {
    const reasons: VsQcReason[] = [];
    const v = point[field];
    if (v == null) reasons.push(point.x?.[field] ? `hard:${point.x[field] as RoadRuleId}` : 'missing');
    // Steps 1–2: an observe hit of the measurement line (`cube`, `neighbours`, `jump`, `roadAir` without neighbours) is a
    // rejection for the VS, as it is for the anchor of the route forecast (M4).
    if (v != null && point.o?.[field]) reasons.push(`observe:${point.o[field] as RoadRuleId}`);
    return { value: reasons.length ? null : v, ok: reasons.length === 0, reasons };
  };
  const rs = verdict('rs'), ta = verdict('ta');

  // Steps 3 and 4 need the ring.
  if (history && history.slotsMs.length) {
    if (vsQcConstant(history)) { for (const f of [rs, ta]) { f.reasons.push('constant'); f.ok = false; f.value = null; } }
    if (rs.ok && vsQcJump(history)) { rs.reasons.push('jump'); rs.ok = false; rs.value = null; }
  } else skipped.push('constant', 'jump');

  // Step 5: like sensors at the same site disagree ⇒ weak (the coldest plausible value stays the value).
  if (rs.ok && ((point.f ?? []).includes('spread') || (point.rsHi != null && point.rs != null && point.rsHi - point.rs > ROAD_SPREAD_K))) weak.push('spread');

  // Step 6: road − air in winter.
  if (rs.ok && ta.ok && vsQcIsWinter(slotMs)) {
    const d = (point.rs as number) - (point.ta as number);
    if (d < VS_QC_WINTER.belowK || d > VS_QC_WINTER.aboveK) weak.push('winterDiff');
  }

  // Step 7: spatial fence on residuals against the model.
  if (rs.ok && model?.rs != null && neighbours) {
    const r = vsQcIqr({ lat: input.lat, lon: input.lon, h: input.h, rs: point.rs as number, model: model.rs }, neighbours);
    if (r === null) skipped.push('iqr');
    else if (r) { rs.reasons.push('iqr'); rs.ok = false; rs.value = null; }
  } else if (rs.ok) skipped.push('iqr');

  // Step 8: consistency with the virtual sensor.
  if (rs.ok) {
    const m = vsQcModel(point.rs as number, model);
    if (m === null) skipped.push('model');
    else if (m) { rs.reasons.push('model'); rs.ok = false; rs.value = null; }
  }

  // Step 9: state codes.
  if (point.cond != null && VS_QC_WEAK_CODES.includes(point.cond)) weak.push('code');
  if (point.o && Object.keys(point.o).some((k) => k !== 'rs' && k !== 'ta')) weak.push('observe');

  return { rs, ta, weak: [...new Set(weak)], skipped: [...new Set(skipped)] };
}

/** German words for the page and the shadow log. */
export const VS_QC_REASON_TEXT: Readonly<Record<Exclude<VsQcReason, `hard:${string}` | `observe:${string}`>, string>> = Object.freeze({
  constant: `Fahrbahn und Luft seit ≥ ${VS_QC_CONSTANT_H} h unverändert (eingefrorener Logger)`,
  jump: `Sprung über ${ROAD_JUMP_K} K je 15 min`,
  iqr: 'Residuum gegen das Modell außerhalb des Nachbarbands (Tukey)',
  model: `mehr als ${VS_QC_MODEL.k} σ vom virtuellen Sensor entfernt`,
  missing: 'kein Wert',
});
