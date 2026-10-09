/**
 * Phase ZO (`audit/zell-orte.md` §4, E-ZO-4): die Einschätzung von buscosun Fusion am gewählten Ort in der Stunde, in der
 * eine Zelle ihn erreicht — getrennt von den Zelldaten. buscosun Fusion wird nur gelesen: die Verteilungen der Stufe fs
 * (`v2`), die Überschreitung kommt von außen (`exceedance` des Cube-Chunks).
 *
 * Was buscosun Fusion hergibt: P(≥ 5 mm in der Stunde) aus der Niederschlagsverteilung (exakt wie die Regenchance, RC)
 * und P(Böe ≥ 60 km/h) aus der Böenverteilung. **Eine Gewittergröße rechnet buscosun Fusion nicht** — die Anzeige sagt
 * das, statt eine zu erfinden.
 */
import type { PointForecastV2 } from '../pointForecast/fusion/output';
import type { Dist } from '../pointForecast/fusion/dist';
import { chanceBars, chanceStepsFromV2 } from '../precipChance/chanceSeries';

const H = 3_600_000;
/** Böen-Schwelle der Ergänzung (km/h) — gesetzt (`set`), die Grenze des DWD zwischen Wind- und Sturmböen liegt bei 62. */
export const CELL_FUSION_GUST_KMH = 60;
/** Mengen-Schwelle „Starkregen-Nähe" (mm in der Stunde) — dieselbe wie die Regenchance „≥ 5 mm". */
export const CELL_FUSION_HEAVY_MM = 5;

export interface CellFusionValue { p: number; fromMs: number; toMs: number }
export interface CellFusionHint {
  /** P(≥ 5 mm) im Schritt, der die Ankunftsstunde enthält; `null` = keine Verteilung (Lücke, nie 0 %). */
  heavy: CellFusionValue | null;
  /** P(Böe ≥ 60 km/h) im selben Stundenschritt; `null` = keine Verteilung. */
  gust: CellFusionValue | null;
}

type Exceed = (d: Dist, x: number) => number;

/** Die Stunde, in der das Fenster beginnt (frühestens die laufende). */
export function arrivalHour(windowFromMs: number, nowMs: number): { fromMs: number; toMs: number } {
  const fromMs = Math.floor(Math.max(windowFromMs, nowMs) / H) * H;
  return { fromMs, toMs: fromMs + H };
}

export function cellFusionHint(v2: PointForecastV2, hour: { fromMs: number; toMs: number }, exceed: Exceed): CellFusionHint {
  const bars = chanceBars(chanceStepsFromV2(v2), hour.fromMs, hour.toMs, exceed);
  const bar = bars.find((b) => b.p != null) ?? null;
  const heavy = bar && bar.p ? { p: bar.p.ge5, fromMs: bar.stepFromMs, toMs: bar.stepToMs } : null;
  // Böe: derselbe native Schritt (ein Schritt bei t gilt für (t − Δ, t], wie der Niederschlag), nie ein interpolierter.
  let gust: CellFusionValue | null = null;
  const steps = v2.axis.steps;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.interpolated || s.validAtMs <= hour.fromMs) continue;
    const d = s.vars.gust?.dist;
    if (!d) continue;
    let prev = s.validAtMs - H;
    for (let j = i - 1; j >= 0; j--) if (!steps[j].interpolated) { prev = steps[j].validAtMs; break; }
    if (prev >= hour.toMs) break;
    const p = exceed(d, CELL_FUSION_GUST_KMH / 3.6);
    if (Number.isFinite(p)) gust = { p: Math.max(0, Math.min(1, p)), fromMs: prev, toMs: s.validAtMs };
    break;
  }
  return { heavy, gust };
}
