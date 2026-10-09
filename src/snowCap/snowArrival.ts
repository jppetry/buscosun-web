/**
 * Phase SK (E-SK-5 replaced 09.10.): the place sentence is the one of Phase HZS (`snowSentence`, E-HZS-6) — unchanged.
 * SK only adds what was asked for and is missing there: "Bei dir bleibt es Regen" when the line stays SAFELY above the
 * place (p10 > height at every step with a value) and precipitation is expected (some hour P(wet) ≥ HZS_DRY_P), the
 * chance as a number, and the cells of the 48-h bar. Pure.
 */
import { snowSentence, wetAround, dayClock, fmtM, HZS_DRY_P, type Column, type SnowPoint, type SnowSentence } from '../nowcast/heightTime/heightTimeModel';

const H = 3_600_000;

export type SnowCellKind = 'snow' | 'band' | 'rain' | 'gap';
export interface SnowCell { fromMs: number; toMs: number; kind: SnowCellKind }

export interface SnowArrival {
  sentence: SnowSentence;
  display: string;
  meta: string[];
  hTrue: number | null;
  cells: SnowCell[];
}

/** 5-%-steps like the chance card, never "0 %"/"100 %". */
const pct = (p: number) => (p < 0.05 ? '< 5 %' : p > 0.95 ? '> 95 %' : `${Math.round(p * 20) * 5} %`);

export function snowArrival(points: readonly SnowPoint[], hTrue: number | null, columns: readonly Column[], fromMs: number, hours: number): SnowArrival {
  const sentence = snowSentence(points, hTrue, columns);
  let display = sentence.text;
  const meta: string[] = [];
  const hOk = hTrue != null && Number.isFinite(hTrue);
  if (hOk) meta.push(`Ortshöhe ${fmtM(hTrue)} m`);
  if (sentence.kind === 'stays-above' && hOk) {
    const vals = points.filter((p) => p.p50 != null);
    const safe = vals.length > 0 && vals.every((p) => p.p10 != null && p.p10 > hTrue);
    const wetSomewhere = columns.some((c) => c.pWet != null && c.pWet >= HZS_DRY_P);
    if (safe) display = wetSomewhere ? 'Bei dir bleibt es Regen' : `Kein Schnee bei dir bis ${dayClock(fromMs + hours * H)}`;
  }
  if (sentence.kind === 'reaches' || sentence.kind === 'possible' || sentence.kind === 'already') {
    const w = wetAround(columns, sentence.atMs);
    if (w != null) meta.push(`Niederschlag dann ${pct(w)}`);
  }
  const cells: SnowCell[] = [];
  for (let k = 0; k < hours; k++) {
    const a = fromMs + k * H, b = a + H;
    // A native step inside the hour decides (null p50 there = gap, never borrowed); only hours without any step (3-h t2
    // steps) take the nearest step within 90 min.
    const inHour = points.find((q) => q.tMs >= a && q.tMs < b);
    const p = inHour ? (inHour.p50 != null ? inHour : null) : (points.find((q) => Math.abs(q.tMs - a) <= 90 * 60_000 && q.p50 != null) ?? null);
    let kind: SnowCellKind = 'gap';
    if (p && p.p50 != null && hOk) kind = p.p50 <= hTrue ? 'snow' : p.p10 != null && p.p10 <= hTrue ? 'band' : 'rain';
    cells.push({ fromMs: a, toMs: b, kind });
  }
  return { sentence, display, meta, hTrue, cells };
}

const RANK: Record<SnowCellKind, number> = { snow: 3, band: 2, rain: 1, gap: 0 };

/** Mobile: 3-h cells (44-px targets); the kind is the most snowy of the three. */
export function groupCells3h(cells: readonly SnowCell[]): SnowCell[] {
  const out: SnowCell[] = [];
  for (let i = 0; i < cells.length; i += 3) {
    const g = cells.slice(i, i + 3);
    const kind = g.reduce<SnowCellKind>((best, c) => (RANK[c.kind] > RANK[best] ? c.kind : best), 'gap');
    out.push({ fromMs: g[0].fromMs, toMs: g[g.length - 1].toMs, kind });
  }
  return out;
}
