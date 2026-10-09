/**
 * Phase RC (`audit/regenchance.md` §3): die Chance am Ort aus der vollen buscosun Fusion (`PointForecastV2`) — je nativem
 * Schritt die Wahrscheinlichkeit für „> 0", „≥ 1 mm", „≥ 5 mm" im Intervall des Schritts, nur gelesen (`exceedance`).
 *
 * Regeln (dieselben wie die Erwartungssumme, `precipSums/fusionWindowSum.ts`, aber ohne Aufteilen):
 *   1. Nur Schritte mit Verteilung. Interpolierte Stunden der Stundenachse haben keine (`dist: null`) ⇒ Lücke.
 *   2. Zerlegung ohne Überlapp: Cube-Stufen zuerst (t1, dann t2, t3), danach füllen Stunden der Station (`tier: 'station'`)
 *      bzw. der Klimatologie-Schwanz (`clima`) nur noch unbelegte Zeit. Nie zwei Werte für dieselbe Zeit.
 *   3. Eine Wahrscheinlichkeit gilt für das GANZE Intervall ihres Schritts — ein 3-h-Wert wird nie auf Stunden verteilt.
 *      Liegt nur ein Teil des Intervalls frei, steht der Balken über dem freien Teil und nennt sein ganzes Intervall.
 *   4. Herkunft je Balken: Radar (der Schritt trägt ein Nowcast-Member mit Gewicht), Cube, Station, nur Klimatologie.
 *
 * Rein: kein DOM, kein Netz; `exceedance` wird übergeben (lebt im Lazy-Chunk von buscosun Fusion).
 */

import type { PointForecastV2 } from '../pointForecast/fusion/output';
import type { Dist } from '../pointForecast/fusion/dist';
import { CHANCE_THRESHOLD_MM, type ChanceThreshold } from './chanceModel';

const H = 3_600_000;

export type ChanceTier = 't1' | 't2' | 't3' | 'station' | 'clima';
export type ChanceKind = 'radar' | 'cube' | 'station' | 'clima';
export const CHANCE_TIER_STEP_H: Record<ChanceTier, number> = { t1: 1, t2: 3, t3: 6, station: 1, clima: 1 };

export interface ChanceStep {
  validAtMs: number;
  tier: ChanceTier;
  interpolated: boolean;
  dist: Dist | null;
  radar: boolean;
  /** Die Verteilung ist reine Klimatologie (`calib` `climatologyOnly`) — benannt, kein Modellwert. */
  climaOnly: boolean;
}

export type ChanceTriple = Record<ChanceThreshold, number>;

export interface ChanceBar {
  /** Freier Teil, über dem der Balken steht. */
  fromMs: number;
  toMs: number;
  /** Intervall des Schritts, für das die Wahrscheinlichkeit gilt. */
  stepFromMs: number;
  stepToMs: number;
  /** `null` = Lücke (kein Schritt mit Verteilung) — nie 0 %. */
  p: ChanceTriple | null;
  kind: ChanceKind | null;
  tier: ChanceTier | null;
}

type Exceed = (d: Dist, x: number) => number;

/** `PointForecastV2` → Schritte der Chance. */
export function chanceStepsFromV2(v2: PointForecastV2): ChanceStep[] {
  const out: ChanceStep[] = [];
  for (const s of v2.axis.steps) {
    const tier = s.tier as string;
    if (tier !== 't1' && tier !== 't2' && tier !== 't3' && tier !== 'station' && tier !== 'clima') continue;
    const p = s.vars.precip;
    const nowTags = new Set(s.members.filter((m) => m.product === 'nowcast').map((m) => m.tag));
    const radar = !!p && p.members.some((m) => nowTags.has(m.tag) && (m.weight ?? 0) > 0);
    out.push({
      validAtMs: s.validAtMs, tier, interpolated: s.interpolated, dist: p?.dist ?? null, radar,
      climaOnly: tier === 'clima' || (p?.calib ?? []).includes('climatologyOnly'),
    });
  }
  return out;
}

/** Wahrscheinlichkeiten eines Schritts; Mengen-Schwellen auf die mittlere Rate des Intervalls (x mm / Δ h). */
export function chanceOfStep(d: Dist, stepH: number, exceed: Exceed): ChanceTriple | null {
  const clamp = (p: number) => Math.max(0, Math.min(1, p));
  const any = exceed(d, 0), ge1 = exceed(d, CHANCE_THRESHOLD_MM.ge1 / stepH), ge5 = exceed(d, CHANCE_THRESHOLD_MM.ge5 / stepH);
  if (![any, ge1, ge5].every(Number.isFinite)) return null;
  return { any: clamp(any), ge1: clamp(ge1), ge5: clamp(ge5) };
}

const kindOf = (s: ChanceStep): ChanceKind => (s.climaOnly ? 'clima' : s.radar ? 'radar' : s.tier === 'station' ? 'station' : 'cube');

/** Die Balken über [fromMs, toMs) — lückenlos, Lücken als `p: null`. */
export function chanceBars(steps: readonly ChanceStep[], fromMs: number, toMs: number, exceed: Exceed): ChanceBar[] {
  const usable = steps.filter((s) => !s.interpolated && s.dist);
  const taken: Array<[number, number]> = [];
  const bars: ChanceBar[] = [];
  const free = (a: number, b: number): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let cur = a;
    for (const [x, y] of [...taken].sort((p, q) => p[0] - q[0])) {
      if (y <= cur) continue;
      if (x >= b) break;
      if (x > cur) out.push([cur, Math.min(x, b)]);
      cur = Math.max(cur, y);
      if (cur >= b) break;
    }
    if (cur < b) out.push([cur, b]);
    return out;
  };
  const claim = (s: ChanceStep) => {
    const stepH = CHANCE_TIER_STEP_H[s.tier];
    const sa = s.validAtMs - stepH * H, sb = s.validAtMs;
    const a = Math.max(fromMs, sa), b = Math.min(toMs, sb);
    if (b <= a) return;
    const parts = free(a, b);
    if (!parts.length) return;
    const p = chanceOfStep(s.dist as Dist, stepH, exceed);
    if (!p) return;
    for (const [x, y] of parts) {
      bars.push({ fromMs: x, toMs: y, stepFromMs: sa, stepToMs: sb, p, kind: kindOf(s), tier: s.tier });
      taken.push([x, y]);
    }
  };
  for (const t of ['t1', 't2', 't3'] as const) for (const s of usable) if (s.tier === t) claim(s);
  for (const s of usable) if (s.tier === 'station') claim(s);
  for (const s of usable) if (s.tier === 'clima') claim(s);
  for (const [x, y] of free(fromMs, toMs)) bars.push({ fromMs: x, toMs: y, stepFromMs: x, stepToMs: y, p: null, kind: null, tier: null });
  bars.sort((a, b) => a.fromMs - b.fromMs);
  return bars;
}

/** Der Balken, in dem `tMs` liegt (`null` außerhalb). */
export function barAt(bars: readonly ChanceBar[], tMs: number): ChanceBar | null {
  return bars.find((b) => tMs >= b.fromMs && tMs < b.toMs) ?? null;
}

/** Klartext der Herkunft eines Balkens. */
export function chanceKindText(b: ChanceBar): string {
  if (!b.kind) return 'keine Vorhersage';
  const span = Math.round((b.stepToMs - b.stepFromMs) / H);
  const base = b.kind === 'radar' ? 'mit Radar' : b.kind === 'station' ? 'Stundenwert der Station' : b.kind === 'clima' ? 'nur Klimatologie' : null;
  const interval = span > 1 ? `${span}-h-Intervall` : null;
  return [base, interval].filter(Boolean).join(' · ');
}
