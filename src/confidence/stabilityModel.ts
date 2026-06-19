/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Stabilitäts-Kern (EPIC 3, pur).
 *
 * Aus der Run-Serie eines Tages (was das Modell für denselben Tag über die
 * letzten Läufe vorhergesagt hat, älteste→neueste) wird abgeleitet:
 *  • Delta „seit gestern" (US-3.1),
 *  • Stabil/Wechselhaft (US-3.2) — ein durchgehender Trend gilt NICHT als
 *    wechselhaft; nur echtes Hin-und-her-Springen (Wobble),
 *  • Sparkline-Werte (US-3.4).
 *
 * WICHTIG: Stabilität ≠ Treffsicherheit. Eine Prognose kann stabil und trotzdem
 * falsch sein (EPIC 7). Reine Statistik, headless testbar.
 */

export type Stability = 'stable' | 'volatile' | 'unknown';

/*
 * Schwellen empirisch kalibriert (Validierungspunkt) an 112 Tag-Stichproben über
 * 16 DACH-Orte (Juni 2026, Tmax-Run-Serien aus der Previous-Runs-API):
 *   Wobble °C: p50=0 · p75=0 · p90≈1,8 · p95≈3,8 · max 8,0
 *   Delta  °C: p50=0 · p90≈0,3 · p95≈0,7 · max 2,1
 * Die Run-zu-Run-Streuung ist also klein; die alten Schwellen (3,0 / 1,5) feuerten
 * praktisch nie (7 % / 3 %). Neu auf das empirisch auffällige obere Dezil gesetzt:
 *   WOBBLE 2,0 → ~10 % der Tage „wechselhaft" (oberhalb p90, klar zappelnd)
 *   DELTA  1,0 → nur klar spürbare Run-Sprünge (≥1 °C) als „verändert"
 * Bewusst konservativ: lieber selten, aber dann aussagekräftig (kein Fehlalarm).
 */
/** Schwelle: ab welchem Tages-Delta ein Tag als „verändert" gilt (US-3.1). */
export const DELTA_STABLE_C = 1.0;
/** Wobble-Schwelle (°C, kumulatives Hin-und-Her abzüglich Netto-Trend) für „wechselhaft". */
export const WOBBLE_VOLATILE_C = 2.0;
/** Mindestzahl Läufe für ein belastbares Stabilitäts-Urteil. */
export const MIN_RUNS = 3;

export interface DeltaInfo {
  /** Aktueller Wert − vorheriger Lauf (°C). null wenn kein Vorlauf vorhanden. */
  deltaC: number | null;
  /** Kleine Änderung (|Δ| < Schwelle) → als stabil markiert (US-3.1). */
  isSmall: boolean;
  direction: 'up' | 'down' | 'flat';
}

/** Delta des jüngsten Laufs gegen den vorherigen (US-3.1). runs: älteste→neueste. */
export function dayDelta(runs: number[]): DeltaInfo {
  const v = runs.filter(Number.isFinite);
  if (v.length < 2) return { deltaC: null, isSmall: true, direction: 'flat' };
  const deltaC = v[v.length - 1] - v[v.length - 2];
  const isSmall = Math.abs(deltaC) < DELTA_STABLE_C;
  const direction = deltaC > 0.05 ? 'up' : deltaC < -0.05 ? 'down' : 'flat';
  return { deltaC, isSmall, direction };
}

export interface StabilityInfo {
  level: Stability;
  label: string;
  /** Kumulatives „Zappeln" abzüglich Netto-Trend (°C). */
  wobbleC: number;
  /** Gesamte Spannweite über alle Läufe (°C). */
  rangeC: number;
  runs: number; // Anzahl verwertbarer Läufe
}

/**
 * Stabilität eines Tages (US-3.2). Wobble = Summe der Schrittbeträge minus
 * Betrag der Netto-Änderung → ein monotoner Trend ergibt Wobble 0 (= stabil),
 * Hin-und-her-Springen ergibt großen Wobble (= wechselhaft).
 */
export function dayStability(runs: number[]): StabilityInfo {
  const v = runs.filter(Number.isFinite);
  if (v.length < MIN_RUNS) return { level: 'unknown', label: 'Verlauf wird aufgebaut', wobbleC: 0, rangeC: 0, runs: v.length };
  let totalAbs = 0;
  for (let i = 1; i < v.length; i++) totalAbs += Math.abs(v[i] - v[i - 1]);
  const net = Math.abs(v[v.length - 1] - v[0]);
  const wobbleC = Math.max(0, totalAbs - net);
  const rangeC = Math.max(...v) - Math.min(...v);
  const level: Stability = wobbleC >= WOBBLE_VOLATILE_C ? 'volatile' : 'stable';
  return { level, label: level === 'stable' ? 'Stabil' : 'Wechselhaft', wobbleC: round1(wobbleC), rangeC: round1(rangeC), runs: v.length };
}

/** Sparkline-Punkte (0..1 normiert) der Run-Serie (US-3.4). null bei < 2 Läufen. */
export function sparklinePoints(runs: number[]): number[] | null {
  const v = runs.filter(Number.isFinite);
  if (v.length < 2) return null;
  const lo = Math.min(...v), hi = Math.max(...v);
  const span = hi - lo || 1;
  return v.map((x) => (x - lo) / span);
}

function round1(x: number): number { return Math.round(x * 10) / 10; }

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface StabCheck { case: string; ok: boolean; detail: string }

export function verifyStabilityModel(): { checks: StabCheck[]; passed: number; failed: number } {
  const checks: StabCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  // Delta „seit gestern".
  const up = dayDelta([20, 21, 22, 25]); // letzter Lauf +3 ggü. vorherigem
  add('Delta up = +3', up.deltaC === 3 && up.direction === 'up' && !up.isSmall, `${up.deltaC}`);
  const flat = dayDelta([20, 20.5]); // +0,5 < Schwelle → klein/stabil
  add('kleines Delta = stabil', flat.isSmall, `${flat.deltaC}`);
  add('Delta null bei 1 Lauf', dayDelta([20]).deltaC === null);

  // Stabilität: monotoner Trend → STABIL (US-3.2 Kernfall).
  const trend = dayStability([15, 16.5, 18, 19.5]); // stetig steigend, Wobble 0
  add('monotoner Trend = stabil', trend.level === 'stable' && trend.wobbleC === 0, `wobble ${trend.wobbleC}`);
  // Hin-und-her → WECHSELHAFT.
  const bounce = dayStability([18, 14, 18, 14]); // großes Zappeln
  add('Springen = wechselhaft', bounce.level === 'volatile', `wobble ${bounce.wobbleC}`);
  // Kleine Schwankung → stabil.
  const calm = dayStability([20, 20.4, 20.1, 20.3]);
  add('kleine Schwankung = stabil', calm.level === 'stable', `wobble ${calm.wobbleC}`);
  // Zu wenige Läufe → unknown.
  add('< 3 Läufe = unknown', dayStability([20, 21]).level === 'unknown');
  add('NaN gefiltert', dayStability([20, NaN, 21, NaN, 22]).runs === 3);

  // Sparkline normiert.
  const sp = sparklinePoints([10, 15, 20]);
  add('Sparkline 0..1', !!sp && sp[0] === 0 && sp[2] === 1 && Math.abs(sp[1] - 0.5) < 0.01, `${sp?.join(',')}`);
  add('Sparkline null bei 1 Wert', sparklinePoints([5]) === null);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyStabilityModel: typeof verifyStabilityModel }).__verifyStabilityModel = verifyStabilityModel;
}
