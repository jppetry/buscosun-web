/**
 * Phase NS (`audit/niederschlagssummen.md` §9.2): Erwartungssumme von buscosun Fusion über ein Fenster ab „jetzt".
 *
 * Ehrlich addierbar ist nur der Erwartungswert: die Niederschlagsverteilung von buscosun Fusion ist in jedem Schritt eine
 * Hürde {pDry, μ, σ} mit geschlossenem Mittel (`meanOf`), Mittelwerte addieren sich ohne Annahme über die Abhängigkeit der
 * Stunden. Quantile einzelner Stunden addieren sich NICHT — deshalb hier keine Spanne (E-NS-8).
 *
 * Vier Regeln (aus dem Code, §9.2):
 *   1. Nur native Schritte. Der Wert eines Schritts ist die mittlere Rate über (t − Δ, t], Δ = Schrittweite der Stufe
 *      (t1 1 h, t2 3 h, t3 6 h). Die Zwischenstunden der Stundenachse sind linear zwischen zwei Raten-Mitteln interpoliert
 *      (`cubeSource.ts`, AP7) und würden Masse in die Nachbarstufe verschieben — sie zählen nie.
 *   2. Zerlegung ohne Überlapp: zuerst die Cube-Schritte (feinste Stufe zuerst), danach füllen Stunden, die die Station
 *      trägt (`tier: 'station'`, 1 h) bzw. der Klimatologie-Schwanz (`clima`, 1 h) NUR noch unbelegte Zeit. Nie beides.
 *   3. Teilstücke an den Rändern: Anteil der Stufe unter der Annahme gleichmäßiger Rate in der Stufe.
 *   4. Herkunft je Stück: Radar (der Schritt trägt ein Radar-Member mit Gewicht), Cube-Stufe, Station, Klimatologie.
 * Was kein Schritt belegt, bleibt eine Lücke (`complete: false`, `missing`) — nie 0 mm.
 *
 * Rein: kein DOM, kein Netz (`verify:precip-sums` prüft es mit Hand-Fällen und einer Negativkontrolle).
 */

import type { PointForecastV2 } from '../pointForecast/fusion/output';

const H = 3_600_000;

export type SumTier = 't1' | 't2' | 't3' | 'station' | 'clima';
export type SumKind = 'radar' | 'cube' | 'station' | 'clima';

/** Ein Schritt, auf das reduziert, was die Summe braucht. */
export interface SumStep {
  validAtMs: number;
  tier: SumTier;
  interpolated: boolean;
  /** Erwartungswert der Rate in mm/h über (t − Δ, t]; `null` = keine Verteilung. */
  mean: number | null;
  /** Der Schritt trägt ein Radar-Member mit Gewicht > 0 (Nowcast, Fusion 8: Stundenmittel). */
  radar: boolean;
  /** p10/p90 der Rate DIESES Schritts (mm/h) — nur für die Andeutung an einem Balken, der ganz in einem Schritt liegt. */
  q10?: number | null;
  q90?: number | null;
}

/** Schrittweite je Stufe (h) — dieselben Zahlen wie `TIERS[*].stepH` in `point/cubeFormat.ts`. */
export const SUM_TIER_STEP_H: Record<SumTier, number> = { t1: 1, t2: 3, t3: 6, station: 1, clima: 1 };
const CUBE_ORDER: SumTier[] = ['t1', 't2', 't3'];

export interface SumPiece {
  fromMs: number; toMs: number; mm: number; kind: SumKind; tier: SumTier;
  /** Intervall des Schritts, aus dem das Stück stammt, und seine Raten-Quantile. */
  stepFromMs: number; stepToMs: number; q10: number | null; q90: number | null;
}
/**
 * Ein Balken. `range` (mm) nur, wenn der Balken ganz in EINEM Schritt liegt: dann ist p10…p90 der Rate dieses Schritts
 * mal der Balkendauer die Spanne dieses Stücks (gleichmäßige Rate in der Stufe, wie die Summe selbst) — über mehrere
 * Schritte addieren sich Quantile nicht, dort steht keine Spanne.
 */
export interface SumBar { fromMs: number; toMs: number; mm: number | null; kinds: SumKind[]; range: [number, number] | null }

export interface FusionWindowSum {
  fromMs: number;
  toMs: number;
  /** Summe der belegten Stücke (mm). Bei `complete: false` eine Teilsumme — so benennen, nie als Fenstersumme zeigen. */
  mm: number;
  complete: boolean;
  coveredH: number;
  windowH: number;
  pieces: SumPiece[];
  /** Unbelegte Zeit im Fenster. */
  missing: Array<{ fromMs: number; toMs: number }>;
  kinds: SumKind[];
  /** Zeitpunkte, an denen die Herkunft wechselt (Radar → Cube, t1 → t2 …) — die Nähte. */
  seams: Array<{ atMs: number; from: string; to: string }>;
}

const kindOf = (s: SumStep): SumKind => (s.radar ? 'radar' : s.tier === 'station' ? 'station' : s.tier === 'clima' ? 'clima' : 'cube');

/** Freie Teile von [a, b) gegen eine sortierte, überlappungsfreie Liste belegter Intervalle. */
function freeParts(a: number, b: number, taken: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let cur = a;
  for (const [x, y] of taken) {
    if (y <= cur) continue;
    if (x >= b) break;
    if (x > cur) out.push([cur, Math.min(x, b)]);
    cur = Math.max(cur, y);
    if (cur >= b) break;
  }
  if (cur < b) out.push([cur, b]);
  return out;
}
function insertTaken(taken: Array<[number, number]>, a: number, b: number): void {
  taken.push([a, b]);
  taken.sort((p, q) => p[0] - q[0]);
  for (let i = taken.length - 1; i > 0; i--) {
    if (taken[i][0] <= taken[i - 1][1]) { taken[i - 1][1] = Math.max(taken[i - 1][1], taken[i][1]); taken.splice(i, 1); }
  }
}

/** Die Erwartungssumme über (nowMs, nowMs + windowH]. */
export function fusionWindowSum(steps: readonly SumStep[], nowMs: number, windowH: number): FusionWindowSum {
  const fromMs = nowMs, toMs = nowMs + windowH * H;
  const usable = steps.filter((s) => !s.interpolated && s.mean != null && Number.isFinite(s.mean) && (s.mean as number) >= 0);
  const taken: Array<[number, number]> = [];
  const pieces: SumPiece[] = [];
  const claim = (s: SumStep) => {
    const d = SUM_TIER_STEP_H[s.tier] * H;
    const a = Math.max(fromMs, s.validAtMs - d), b = Math.min(toMs, s.validAtMs);
    if (b <= a) return;
    for (const [x, y] of freeParts(a, b, taken)) {
      pieces.push({
        fromMs: x, toMs: y, mm: (s.mean as number) * ((y - x) / H), kind: kindOf(s), tier: s.tier,
        stepFromMs: s.validAtMs - d, stepToMs: s.validAtMs, q10: s.q10 ?? null, q90: s.q90 ?? null,
      });
      insertTaken(taken, x, y);
    }
  };
  // Regel 2: Cube-Stufen zuerst (feinste zuerst), dann Station, dann Klimatologie.
  for (const t of CUBE_ORDER) for (const s of usable) if (s.tier === t) claim(s);
  for (const s of usable) if (s.tier === 'station') claim(s);
  for (const s of usable) if (s.tier === 'clima') claim(s);
  pieces.sort((p, q) => p.fromMs - q.fromMs);
  const coveredMs = taken.reduce((n, [a, b]) => n + (b - a), 0);
  const missing = freeParts(fromMs, toMs, taken).map(([a, b]) => ({ fromMs: a, toMs: b }));
  const seams: FusionWindowSum['seams'] = [];
  const label = (p: SumPiece) => (p.kind === 'cube' ? p.tier : p.kind);
  for (let i = 1; i < pieces.length; i++) {
    if (label(pieces[i]) !== label(pieces[i - 1])) seams.push({ atMs: pieces[i].fromMs, from: label(pieces[i - 1]), to: label(pieces[i]) });
  }
  return {
    fromMs, toMs,
    mm: pieces.reduce((n, p) => n + p.mm, 0),
    // 1 min Toleranz: der Stundenboden der Achse und „jetzt" liegen nie exakt auf derselben Millisekunde.
    complete: coveredMs >= toMs - fromMs - 60_000,
    coveredH: coveredMs / H, windowH,
    pieces, missing,
    kinds: [...new Set(pieces.map((p) => p.kind))],
    seams,
  };
}

/** Balken über ein Intervall [fromMs, toMs) in `binH`-Stunden — Anteil je Stück; ein Balken ohne volle Belegung ist `null`. */
export function barsOf(pieces: readonly SumPiece[], fromMs: number, toMs: number, binH: number): SumBar[] {
  const out: SumBar[] = [];
  for (let a = fromMs; a < toMs - 1; a += binH * H) {
    const b = Math.min(toMs, a + binH * H);
    let mm = 0, cov = 0;
    const kinds = new Set<SumKind>();
    const steps = new Set<number>();
    let only: SumPiece | null = null;
    for (const p of pieces) {
      const x = Math.max(a, p.fromMs), y = Math.min(b, p.toMs);
      if (y <= x) continue;
      mm += p.mm * ((y - x) / (p.toMs - p.fromMs));
      cov += y - x;
      kinds.add(p.kind);
      steps.add(p.stepToMs);
      only = p;
    }
    const full = cov >= b - a - 60_000;
    const range: [number, number] | null = full && steps.size === 1 && only && only.q10 != null && only.q90 != null
      && a >= only.stepFromMs - 60_000 && b <= only.stepToMs + 60_000
      ? [Math.max(0, only.q10) * ((b - a) / H), Math.max(0, only.q90) * ((b - a) / H)] : null;
    out.push({ fromMs: a, toMs: b, mm: full ? mm : null, kinds: [...kinds], range });
  }
  return out;
}

/** Bin-Breite des Balkenstreifens je Fenster (Stunden) — höchstens 24 Balken je Seite. */
export function barBinH(windowH: number): number {
  return windowH <= 24 ? (windowH <= 12 ? (windowH <= 3 ? 0.25 : 0.5) : 1) : 2;
}

/**
 * `PointForecastV2` → Schritte der Summe. Radar zählt nur, wo der Schritt ein Nowcast-Member trägt UND dieses für den
 * Niederschlag ein Gewicht > 0 bekam (`vars.precip.members`).
 */
export function sumStepsFromV2(v2: PointForecastV2): SumStep[] {
  const out: SumStep[] = [];
  for (const s of v2.axis.steps) {
    const tier = s.tier as string;
    if (tier !== 't1' && tier !== 't2' && tier !== 't3' && tier !== 'station' && tier !== 'clima') continue;
    const p = s.vars.precip;
    const nowTags = new Set(s.members.filter((m) => m.product === 'nowcast').map((m) => m.tag));
    const radar = !!p && p.members.some((m) => nowTags.has(m.tag) && (m.weight ?? 0) > 0);
    out.push({ validAtMs: s.validAtMs, tier, interpolated: s.interpolated, mean: p?.mean ?? null, radar, q10: p?.p10 ?? null, q90: p?.p90 ?? null });
  }
  return out;
}

/** Klartext der Herkunft für Legende und Karte („0–2 h Radar · danach buscosun Fusion"). */
export function kindsText(sum: FusionWindowSum): string {
  const has = (k: SumKind) => sum.kinds.includes(k);
  const parts: string[] = [];
  if (has('radar')) {
    const radarEnd = Math.max(...sum.pieces.filter((p) => p.kind === 'radar').map((p) => p.toMs));
    parts.push(`bis ${Math.max(1, Math.round((radarEnd - sum.fromMs) / H))} h mit Radar`);
  }
  if (has('station')) parts.push('Stundenwerte der Station');
  if (has('clima')) parts.push('teils nur Klimatologie');
  return parts.join(' · ');
}
