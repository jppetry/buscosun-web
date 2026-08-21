/**
 * How far the head of the fire could run — as a SPAN over the fuel types, never
 * as one number.
 *
 * Why a span: there is no vegetation map for a fresh hotspot (see
 * audit/waldbrand-ausbreitung.md §3). Rather than pick a fuel and present its
 * result as knowledge, the product states the range the four published types
 * produce and names both ends. The span is the honest form of the gap.
 *
 * Integration: the equilibrium head-fire rate of each hour, held over that hour.
 * The acceleration term of Eqs. 71/72 is deliberately NOT applied — it describes
 * a point ignition, and an already-burning fire has that phase behind it.
 *
 * A gap in the middle of the range makes the sum a lie, so a missing hour
 * returns `null` for the whole span instead of a shorter distance.
 */

import type { FbpFuel } from './fbp';
import { spreadVector, type SlopeInput, type WindInput } from './spreadVector';

/** One hour's inputs at the fire. */
export interface ReachHour {
  /** Zero-wind ISI at the point, `null` when the raster has no value here. */
  iszValue: number | null;
  /** Wind at the point, `null` when no frame covers this hour. */
  wind: WindInput | null;
}

export interface ReachSpan {
  minM: number;
  maxM: number;
  minFuel: FbpFuel;
  maxFuel: FbpFuel;
  /** Hours the span covers — `hours` of elapsed time from now. */
  hours: number;
}

/** Minutes one forecast step covers. */
export const STEP_MINUTES = 60;

/**
 * Cumulative head-fire distance from now to `uptoHour`, per fuel, reduced to
 * its extremes. `uptoHour === 0` yields `null` — no time has passed, so there is
 * no distance to state (the caller shows the rate instead).
 */
export function reachSpanM(
  hours: readonly ReachHour[],
  slope: SlopeInput,
  fuels: readonly FbpFuel[],
  uptoHour: number,
): ReachSpan | null {
  if (!Number.isInteger(uptoHour) || uptoHour <= 0) return null;
  if (hours.length < uptoHour || fuels.length === 0) return null;

  let minM = Infinity, maxM = -Infinity;
  let minFuel: FbpFuel | null = null, maxFuel: FbpFuel | null = null;

  for (const fuel of fuels) {
    let sum = 0;
    for (let h = 0; h < uptoHour; h++) {
      const step = hours[h];
      if (!step || step.iszValue == null || !step.wind) return null;
      const v = spreadVector({ iszValue: step.iszValue, wind: step.wind, slope, fuel });
      if (!v) return null;
      sum += v.rosMmin * STEP_MINUTES;
    }
    if (sum < minM) { minM = sum; minFuel = fuel; }
    if (sum > maxM) { maxM = sum; maxFuel = fuel; }
  }

  if (!minFuel || !maxFuel || !Number.isFinite(minM) || !Number.isFinite(maxM)) return null;
  return { minM, maxM, minFuel, maxFuel, hours: uptoHour };
}

/** The current head-fire rate span (m/min) — what the fire does right now. */
export function rateSpanMmin(
  hour: ReachHour,
  slope: SlopeInput,
  fuels: readonly FbpFuel[],
): { minMmin: number; maxMmin: number; minFuel: FbpFuel; maxFuel: FbpFuel } | null {
  if (hour.iszValue == null || !hour.wind || fuels.length === 0) return null;
  let lo = Infinity, hi = -Infinity;
  let loF: FbpFuel | null = null, hiF: FbpFuel | null = null;
  for (const fuel of fuels) {
    const v = spreadVector({ iszValue: hour.iszValue, wind: hour.wind, slope, fuel });
    if (!v) return null;
    if (v.rosMmin < lo) { lo = v.rosMmin; loF = fuel; }
    if (v.rosMmin > hi) { hi = v.rosMmin; hiF = fuel; }
  }
  if (!loF || !hiF) return null;
  return { minMmin: lo, maxMmin: hi, minFuel: loF, maxFuel: hiF };
}

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread)
// ---------------------------------------------------------------------------

export interface ReachCheck { name: string; ok: boolean; detail?: string }

export function verifySpreadReach(): { checks: ReachCheck[]; passed: number; total: number } {
  const checks: ReachCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const flat: SlopeInput = { slopePct: 0, upslopeAzDeg: 0 };
  const wind: WindInput = { speedKmh: 18, fromDeg: 250 };
  const hour: ReachHour = { iszValue: 3.5, wind };
  const hours: ReachHour[] = Array.from({ length: 7 }, () => hour);
  const fuels: FbpFuel[] = ['D1', 'C2', 'C3', 'O1B'];

  const s3 = reachSpanM(hours, flat, fuels, 3);
  add('Spanne über drei Stunden existiert und ist echt eine Spanne',
    !!s3 && s3.minM > 0 && s3.maxM > s3.minM, s3 ? `${Math.round(s3.minM)}–${Math.round(s3.maxM)} m` : 'null');
  add('das langsame Ende ist Laubwald, das schnelle Gras',
    !!s3 && s3.minFuel === 'D1' && s3.maxFuel === 'O1B');
  add('Stunde 0 liefert keine Strecke (keine Zeit vergangen)', reachSpanM(hours, flat, fuels, 0) === null);
  const s6 = reachSpanM(hours, flat, fuels, 6);
  add('mehr Stunden ⇒ mehr Strecke', !!s3 && !!s6 && s6.minM > s3.minM && s6.maxM > s3.maxM);
  add('bei konstanten Bedingungen ist die Strecke proportional zur Zeit',
    !!s3 && !!s6 && Math.abs(s6.minM / s3.minM - 2) < 1e-9);

  // A hole in the middle must void the whole span, not shorten it.
  const holed = [hour, { iszValue: null, wind }, hour, hour];
  add('Lücke mitten in der Reihe ⇒ keine Spanne, keine kürzere Strecke',
    reachSpanM(holed, flat, fuels, 3) === null);
  add('zu wenige Stunden vorhanden ⇒ null', reachSpanM([hour], flat, fuels, 3) === null);

  // Rate span.
  const r = rateSpanMmin(hour, flat, fuels);
  add('Tempo-Spanne jetzt: Laubwald langsam, Gras schnell',
    !!r && r.minFuel === 'D1' && r.maxFuel === 'O1B' && r.maxMmin > r.minMmin,
    r ? `${r.minMmin.toFixed(1)}–${r.maxMmin.toFixed(1)} m/min` : 'null');
  add('Tempo ohne Wind-/ISZ-Wert ⇒ null',
    rateSpanMmin({ iszValue: null, wind }, flat, fuels) === null
    && rateSpanMmin({ iszValue: 3.5, wind: null }, flat, fuels) === null);

  // A slope lengthens the run for the same weather.
  const onSlope = reachSpanM(hours, { slopePct: 35, upslopeAzDeg: 70 }, fuels, 3);
  add('derselbe Wind am Hang trägt weiter als in der Ebene',
    !!onSlope && !!s3 && onSlope.maxM > s3.maxM,
    onSlope && s3 ? `${Math.round(s3.maxM)} → ${Math.round(onSlope.maxM)} m` : 'null');

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
