/**
 * dwdRuc.mjs — thin reader of ICON-D2-RUC on the DWD new path (`/weather/nwp/v1/m/icon-d2-ruc/p/TOT_PREC/r/<run>/s/PT…`),
 * over `scripts/glacier/lib/dwdNew.mjs` (one URL rule, one decoder). Hourly runs; a run is complete when its last step
 * `PT027H00M` answers HEAD 200 (measured 23.10.2026: run + 41 min).
 */
import { getBytes, fieldUrl, cellCoords, net } from '../../glacier/lib/dwdNew.mjs';
import { decodeGrib2 } from '../../../src/sources/gribDecode.ts';
import { RUC_MODEL, RUC_PARAM, RUC_STEP_MIN, RUC_STEPS } from '../../../src/point/rucFormat.ts';

const UA = 'buscosun-ruc/0.1 (+https://buscosun.com; jppetry94@gmail.com)';
const H = 3_600_000;

export { net };

export const rucStepUrl = (runMs, k) => fieldUrl(RUC_MODEL, RUC_PARAM, runMs, k * RUC_STEP_MIN);

export async function headOk(url) {
  try {
    const r = await fetch(url, { method: 'HEAD', headers: { 'user-agent': UA } });
    return r.status === 200;
  } catch {
    return false;
  }
}

/** Newest hourly run whose last step exists; `null` when none of the last `back` hours is complete. */
export async function newestCompleteRun(nowMs = Date.now(), { back = 4, probe = headOk } = {}) {
  let t = Math.floor(nowMs / H) * H;
  for (let i = 0; i < back; i++, t -= H) if (await probe(rucStepUrl(t, RUC_STEPS))) return t;
  return null;
}

/** Cell centres (degrees) of the RUC grid from the run's CLAT/CLON. */
export const fetchRucCoords = (runMs) => cellCoords(RUC_MODEL, runMs);

/**
 * Fetches the step files `ks` in batches of `concurrency` and hands the decoded fields to `onField(k, field)` IN ORDER of
 * `ks` (so the consumer keeps one previous accumulation only). A missing file (404) is passed as `null`.
 * Returns the timing and byte count.
 */
export async function fetchRucSteps(runMs, ks, onField, { concurrency = 8 } = {}) {
  const timing = { fetchMs: 0, decodeMs: 0, bytes: 0, missing: [] };
  for (let i = 0; i < ks.length; i += concurrency) {
    const batch = ks.slice(i, i + concurrency);
    const t0 = performance.now();
    const raws = await Promise.all(batch.map((k) => getBytes(rucStepUrl(runMs, k))));
    timing.fetchMs += performance.now() - t0;
    for (let b = 0; b < batch.length; b++) {
      const raw = raws[b];
      if (!raw) { timing.missing.push(batch[b]); await onField(batch[b], null); continue; }
      timing.bytes += raw.length;
      const t1 = performance.now();
      const field = decodeGrib2(raw);
      timing.decodeMs += performance.now() - t1;
      await onField(batch[b], field);
    }
  }
  return timing;
}
