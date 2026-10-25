/**
 * rainGate.ts — the ONE rule for "this hour of buscosun Fusion shows rain" (phase RUC, E-RUC-11, 24.10.2026).
 *
 * An hour shows rain when its hourly mean is at least `WET_MMH` AND its P(wet) is at least `RAIN_GATE_P`; without a P(wet)
 * (live fallback) the mean decides alone. Everything else is a TRACE hour: the minute chart draws no rain there (a hint
 * "16 % · 0,05 mm" instead), first rain / peak / events skip it, the engine's model side falls back to the hourly value.
 * The threshold is SET (= `RB_P_EDGE` of the rain window); the measurement of 23./24.10. (V-RUC-23) saw 3–17 % wet hours
 * below 30 % and 39 % and more above it, with 35 % as the best separation — T9 re-measures it. Pure; no DOM.
 *
 * Switch: `?mvgate=0` = no gate, every output byte-identical to the stand before (Rule 2).
 */
import { WET_MMH } from './nowcastModel';

/** P(wet) from which an hour of buscosun Fusion counts as rain to show (set; = `RB_P_EDGE`). */
export const RAIN_GATE_P = 0.3;
export const RAIN_GATE_QUERY_KEY = 'mvgate';

export function rainGateEnabledFrom(search: string): boolean {
  try { return new URLSearchParams(search).get(RAIN_GATE_QUERY_KEY) !== '0'; } catch { return true; }
}

/** True when an hour with mean `mmH` and probability `pWet` (null = unknown) is rain the displays may show. */
export function hourShowsRain(mmH: number, pWet: number | null | undefined): boolean {
  return mmH >= WET_MMH && (pWet == null || pWet >= RAIN_GATE_P);
}

/** The hint text of a trace span: highest chance and expected amount ("16 % · 0,05 mm"). */
export function traceHintText(pMax: number | null, mm: number): string {
  const amount = `${(Math.round(mm * 100) / 100).toFixed(2).replace('.', ',')} mm`;
  return pMax == null ? `Spur · ${amount}` : `${Math.round(pMax * 100)} % · ${amount}`;
}
