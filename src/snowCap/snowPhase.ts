/**
 * Phase SK: phase word at a height with the thresholds buscosun Fusion uses at the point (`phaseLabel`: ≥ 0.75 snow,
 * ≤ 0.25 rain) — read, never changed. Imported only by the lazy part (it pulls `fusion/meteo.ts`).
 */
import { phaseLabel } from '../pointForecast/fusion/meteo';
import { snowProbAt, type SkPhase } from './snowCapModel';

export function phaseAt(h: number, mid: number, half: number): SkPhase {
  return phaseLabel(snowProbAt(h, mid, half));
}
