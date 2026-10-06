/**
 * V-AW-1 (audit/autobahnwetter.md §18) — the reference of the observe-only rule `cube` (|air − T2m| > 8 K,
 * `ROAD_RULES.cube`): the route forecast of buscosun Fusion at the station itself (`road/fc/v1`, the station points of the
 * newest run that was issued before the slot). The radar mirror runs on a full clone of buscosun-data, so the derive
 * of a slot reads it from there (`groups.json` `_fcDir`) — no cube decoding in the mirror, no extra download.
 *
 * Since E-AW-30 a station's forecast is anchored on its own measurement; the reference must not be: the model value is
 * the series value minus the anchor's offset (`anc` = [offset measurement − model in 0.1 K, representativity %, own]).
 * Within the first hours the engine applies the offset with weight 1 (`cubeSource.ts`: τ ≤ 1 h ⇒ 1), so only steps up
 * to `ROAD_FC_REF_MAX_LEAD_H` are used — a later slot has no reference (the next run comes within the hour).
 * Pure apart from reading files; `null` = no usable run (the rule is then skipped, as before).
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROAD_FC_INDEX_PATH, parseRoadFcIndex, parseRoadFcFile, roadFcDecode } from '../../src/road/roadFc.ts';

/** Steps after the run's first hour that may serve as reference (`set`, see above). */
export const ROAD_FC_REF_MAX_LEAD_H = 1;
/** A run counts for a slot when it was issued no later than one slot length after it (catch-up never uses a later anchor). */
export const ROAD_FC_REF_ISSUE_SLACK_MS = 15 * 60_000;

const readJson = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };

/** Model T2m (°C) of one station point at step `i`, the anchor taken out. */
export function unanchoredT(p, i) {
  const t = roadFcDecode('t', p.v.t[i]);
  if (t == null) return null;
  const a = p.anc;
  return a ? t - (a[0] / 10) * (a[1] / 100) : t;
}

/** `{ run, step, cubeT2m: {stationId: °C} }` for the slot, or `null`. */
export function roadFcReference(fcDir, slotMs) {
  const index = parseRoadFcIndex(readJson(join(fcDir, ROAD_FC_INDEX_PATH)));
  if (!index || index.killed) return null;
  const run = index.runs.find((r) => Date.parse(r.issuedAt) <= slotMs + ROAD_FC_REF_ISSUE_SLACK_MS && r.t0Ms <= slotMs);
  if (!run) return null;
  const step = Math.round((slotMs - run.t0Ms) / 3_600_000);
  if (step < 0 || step > ROAD_FC_REF_MAX_LEAD_H) return null;
  const cubeT2m = {};
  for (const sub of ['c', 's']) {
    const d = join(fcDir, run.run, sub);
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const doc = parseRoadFcFile(readJson(join(d, f)));
      if (!doc || doc.run !== run.run) continue;
      for (const p of doc.points) {
        if (p.kind !== 'station') continue;
        const v = unanchoredT(p, step);
        if (v != null) cubeT2m[p.id] = Math.round(v * 10) / 10;
      }
    }
  }
  return Object.keys(cubeT2m).length ? { run: run.run, step, cubeT2m } : null;
}
