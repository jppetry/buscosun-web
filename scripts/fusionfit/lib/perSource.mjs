/**
 * perSource.mjs — the per-source values behind a hindcast slot (phase FL; `audit/fusion-lernphase.md` §2.5, §3.2 Form P).
 *
 * A slot carries only the equal-weight mean over the sources (and σ_div). The case builder needs each source at the
 * point's nearest cell and block cells, raw at the source's own model height. This module rebuilds the slot's source
 * plan from what the slot says it used (`cube[t].route`, `run`, `runAt`, `sources[].run`, `ensemble.init`) and reads
 * the values through the SAME readers the slot builder used (`build-slots.mjs`: `planFromRuns`, `planDay0`,
 * `accessorsFor` — E-FL-8, additive exports). V-FF-1 in the verifier recombines them and demands the slot plane.
 *
 * Cost per slot step: one accessor per (source, step), then a getter call per (cell, variable) — the same hot loop
 * as the slot builder, without the quantisation.
 */
import { planFromRuns, planDay0, accessorsFor } from '../../hindcast/build-slots.mjs';
import { loadTierCells, loadExtract } from '../../hindcast/lib/cellsio.mjs';
import { TIER_BY_ID } from '../../../src/point/cubeFormat.ts';
import { FL_SOURCES, FL_SRC_VARS } from './casesio.mjs';
import { runToMs } from './slotAdapter.mjs';

const H = 3_600_000;

/** Cells and extracts of the three tiers, loaded once per worker. */
export function loadRecipes(root) {
  const cells = {}, extracts = {};
  for (const t of ['t1', 't2', 't3']) {
    cells[t] = loadTierCells(t, root);
    for (const c of Object.values(cells[t].cells)) for (const [sid, rec] of Object.entries(c.sources ?? {})) {
      if (!rec?.covered || !rec.store?.length) continue;
      const grid = gridOf(t, sid);
      if (grid && !extracts[grid]) extracts[grid] = loadExtract(grid, root);
    }
  }
  return { cells, extracts };
}
const GRIDS = { icon_d2: 'icon_d2', icon_ch1_eps: 'icon_ch1_om', icon_eu: 'icon_eu', ifs_hres: 'ecmwf025', aifs_single: 'ecmwf025', icon_ch2_eps: 'icon_ch2_om', icon_global: 'icon_global_om', ifs_ens: 'ecmwf025' };
const gridOf = (_tier, sid) => GRIDS[sid] ?? null;

/** The source plan a slot tier was built from; `null` when the tier is absent. */
export function planFromSlotTier(slot, tierId) {
  const c = slot.cube?.[tierId];
  if (!c) return null;
  if (c.route === 'day0') {
    const dayMs = Date.UTC(...(() => { const d = new Date(slot.slotAtMs); return [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()]; })());
    const plan = planDay0(dayMs);
    return plan ? { ...plan, tierId, slotRoute: 'day0' } : null;
  }
  const runs = {};
  for (const s of c.sources ?? []) { const ms = runToMs(s.run); if (Number.isFinite(ms)) runs[s.id] = ms; }
  if (c.ensemble?.init) runs.ifs_ens = Date.parse(c.ensemble.init);
  const publishMs = c.runAt ? Date.parse(c.runAt) : slot.slotAtMs;
  const plan = planFromRuns(tierId, publishMs, runs, c.route === 'dyn' ? 'dyn' : 'run');
  return plan ? { ...plan, tierId, slotRoute: c.route } : null;
}

/**
 * Per-source reader of one slot tier. `at(it, cellKey)` → { [sourceId]: { t2m, td2m, u10, v10, gust, precip, clct, ps } }
 * for the step index `it` of the plan's valid-time axis (which must equal the slot's axis — checked by the caller).
 */
export function perSourceReader(plan, recipes) {
  const tc = recipes.cells[plan.tierId];
  const dtH = TIER_BY_ID[plan.tierId].stepH;
  const kMemo = new Map();   // `${cellKey}|${sid}` → K indices
  const stepMemo = new Map();   // it → accessors per source (or null)
  const kOf = (cellKey, s) => {
    const key = `${cellKey}|${s.id}`;
    if (kMemo.has(key)) return kMemo.get(key);
    const rec = tc.cells[cellKey]?.sources?.[s.id];
    let K = null;
    if (rec?.covered && rec.store?.length) {
      const ex = recipes.extracts[s.grid];
      if (ex) K = rec.store.map(([r, c]) => ex.idx.get(`${r}_${c}`)).filter((k) => k != null);
      if (K && !K.length) K = null;
    }
    kMemo.set(key, K);
    return K;
  };
  const accsAt = (it) => {
    if (stepMemo.has(it)) return stepMemo.get(it);
    const t = plan.validAtMs[it];
    const accs = plan.sources.map((s) => (s.carries(t) ? accessorsFor(s, t, dtH) : null));
    stepMemo.set(it, accs);
    if (stepMemo.size > 8) stepMemo.delete(stepMemo.keys().next().value);
    return accs;
  };
  return {
    validAtMs: plan.validAtMs,
    sourceIds: plan.sources.map((s) => s.id),
    at(it, cellKey) {
      const accs = accsAt(it);
      const out = {};
      for (let si = 0; si < plan.sources.length; si++) {
        const acc = accs[si]; if (!acc) continue;
        const s = plan.sources[si];
        const K = kOf(cellKey, s); if (!K) continue;
        const vals = {};
        let any = false;
        for (const v of FL_SRC_VARS) {
          if (!s.vars.includes(v)) continue;
          const q = acc.value(v, K);
          if (q == null || !Number.isFinite(q)) continue;
          vals[v] = q; any = true;
        }
        if (any) out[s.id] = vals;
      }
      return out;
    },
  };
}

/** Bit mask of the sources present in a per-source record (order `FL_SOURCES`). */
export function srcMaskOf(rec) {
  let m = 0;
  for (let k = 0; k < FL_SOURCES.length; k++) if (rec[FL_SOURCES[k]]) m |= 1 << k;
  return m;
}

/**
 * Equal-weight mean of the per-source values of one variable — what the slot plane holds before quantisation: the
 * producer averages the float32 source values in DOUBLE and rounds (`quantize(sum / n)`), so the check must not
 * round to float32 again (a tie like 84.05 % flips otherwise — measured 444 of 503 964 on 2026-08-01, all cloud cover).
 */
export function recombine(rec, v) {
  let s = 0, n = 0;
  for (const sid of Object.keys(rec)) { const x = rec[sid]?.[v]; if (x == null || !Number.isFinite(x)) continue; s += x; n++; }
  return n ? s / n : null;
}
export const H_MS = H;
