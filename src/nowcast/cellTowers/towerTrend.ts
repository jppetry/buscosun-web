/**
 * Phase ZT (`audit/zelltuerme-3d.md`, E-ZT-4): trend of a cell from two KONRAD3D runs in the client.
 *
 * KONRAD3D's own trend block (`intensity/trends`) is in the XML but neither parsed nor in `cells.json` (V-ZT-1); Jan
 * chose the client route: compare echo top and VIL with the run 5 min earlier. The same cell is the same track id AND
 * the same first-detection time (ids are small integers and get reused).
 *
 * Thresholds per 5 min are `set` (no measurement behind them): echo top ±300 m, VIL ±2 kg/m². Pure — the verifier calls it.
 */

import type { Konrad3dCell, Konrad3dRun } from '../../radar/konrad3d';

export type CellTrend = 'grows' | 'steady' | 'weakens' | 'new' | 'unknown';

export const TREND_ECHOTOP_M_PER_5MIN = 300;
export const TREND_VIL_PER_5MIN = 2;
/** Older than this the comparison run is no trend base (two slots). */
export const TREND_MAX_GAP_MS = 10 * 60_000;

export const TREND_LABEL: Readonly<Record<CellTrend, string>> = Object.freeze({
  grows: 'wächst',
  steady: 'gleichbleibend',
  weakens: 'schwächt ab',
  new: 'neu erkannt',
  unknown: 'Trend unbekannt',
});

export interface TrendResult {
  trend: CellTrend;
  /** Change per 5 min (null = one side missing). */
  dTopM: number | null;
  dVil: number | null;
  /** Minutes between the two runs (null without a comparison run). */
  gapMin: number | null;
}

/** The predecessor of `cell` in `prev` (same id and same first detection), or null. */
export function matchPrevious(cell: Konrad3dCell, prev: Konrad3dRun | null): Konrad3dCell | null {
  if (!prev) return null;
  for (const c of prev.cells) {
    if (c.id !== cell.id) continue;
    if (cell.firstDetectedMs != null && c.firstDetectedMs != null && c.firstDetectedMs !== cell.firstDetectedMs) continue;
    return c;
  }
  return null;
}

export function cellTrend(cell: Konrad3dCell, runRefMs: number, prev: Konrad3dRun | null): TrendResult {
  if (!prev || !(runRefMs > prev.refMs) || runRefMs - prev.refMs > TREND_MAX_GAP_MS) {
    return { trend: 'unknown', dTopM: null, dVil: null, gapMin: null };
  }
  const gapMs = runRefMs - prev.refMs;
  const gapMin = Math.round(gapMs / 60_000);
  const before = matchPrevious(cell, prev);
  if (!before) {
    const firstSeenAfterPrev = cell.firstDetectedMs != null && cell.firstDetectedMs > prev.refMs;
    return { trend: firstSeenAfterPrev ? 'new' : 'unknown', dTopM: null, dVil: null, gapMin };
  }
  const per5 = 5 * 60_000 / gapMs;
  const dTop = cell.echoTopM != null && before.echoTopM != null ? (cell.echoTopM - before.echoTopM) * per5 : null;
  const dVil = cell.vil != null && before.vil != null ? (cell.vil - before.vil) * per5 : null;
  if (dTop == null && dVil == null) return { trend: 'unknown', dTopM: null, dVil: null, gapMin };
  const up = (dTop != null && dTop >= TREND_ECHOTOP_M_PER_5MIN) || (dVil != null && dVil >= TREND_VIL_PER_5MIN);
  const down = (dTop != null && dTop <= -TREND_ECHOTOP_M_PER_5MIN) || (dVil != null && dVil <= -TREND_VIL_PER_5MIN);
  // Contradicting signals (top up, VIL down or vice versa) say nothing clear ⇒ steady.
  const trend: CellTrend = up && !down ? 'grows' : down && !up ? 'weakens' : 'steady';
  return { trend, dTopM: dTop, dVil, gapMin };
}
