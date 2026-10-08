// Seewetter — class verdicts per spot and hour, cached (V-SW-10).
//
// The page shows the class of every spot (dock list, map dots) at the chosen hour and the next window of every
// spot. Without a cache each hour/layer change recomputed 56 spots × ~67 hours of `classify` (sun altitude per
// hour included). A `SeaVerdictCache` belongs to one set of inputs — spots document (identity), limits (the
// profile's or the user's), first run index, current hour, hour count — and computes each spot's row once, on
// first use. The page builds a new cache only when one of those changes; hour, layer, revier, query, unit and
// tab do not enter the verdicts (the unit only formats numbers: `classify` works in kn) and reuse the rows.
//
// `verdictRow` is the uncached reference; the verifier checks that both are deep-equal.

import { classify, windows, type SeaHour, type SeaLimits, type SeaVerdict, type SeaWindow } from './seaProfiles';

const H = 3_600_000;

/** The fields `classify` reads, per spot; the page's `SeaSeries` fits. */
export type SeaVerdictSeries = Record<'wind' | 'gust' | 'windDir' | 'hs' | 'ws' | 'wsPer', (number | null)[]>;
export interface SeaVerdictSpot { id: string; normal: number; lat: number; lon: number }
export interface SeaVerdictInputs {
  /** `null` = no usable data: every hour is classified without values (as the page does then). */
  series: Readonly<Record<string, SeaVerdictSeries>> | null;
  limits: SeaLimits;
  /** Run index of hour 0 of the page's axis. */
  firstIdx: number;
  /** UTC ms of hour 0. */
  nowHour: number;
  /** Hours on the axis (0 without usable data). */
  nHours: number;
}

/** The hour as the page builds it: values from the series if the spot has one, else an empty hour at its time. */
export function seaHourOf(inp: SeaVerdictInputs, id: string, kk: number): SeaHour {
  const t = inp.nowHour + kk * H;
  const s = inp.series?.[id];
  if (!s) return { t, windMs: null, gustMs: null, windDir: null, hs: null, ws: null, wsPer: null };
  const i = inp.firstIdx + kk;
  return { t, windMs: s.wind[i], gustMs: s.gust[i], windDir: s.windDir[i], hs: s.hs[i], ws: s.ws[i], wsPer: s.wsPer[i] };
}

/** Uncached reference: the verdict of one spot at one hour. */
export const verdictOf = (inp: SeaVerdictInputs, sp: SeaVerdictSpot, kk: number): SeaVerdict =>
  classify(seaHourOf(inp, sp.id, kk), inp.limits, sp.normal, sp.lat, sp.lon);

/** Uncached reference: the whole row of one spot. */
export const verdictRow = (inp: SeaVerdictInputs, sp: SeaVerdictSpot): SeaVerdict[] =>
  Array.from({ length: inp.nHours }, (_, kk) => verdictOf(inp, sp, kk));

export class SeaVerdictCache {
  readonly inputs: SeaVerdictInputs;
  private readonly rows = new Map<string, SeaVerdict[]>();
  private readonly wins = new Map<string, SeaWindow[]>();
  /** Rows computed so far (for the measurement and the verifier). */
  computed = 0;
  constructor(inputs: SeaVerdictInputs) { this.inputs = inputs; }

  /** The spot's verdicts for hours 0 … nHours − 1, computed once. */
  row(sp: SeaVerdictSpot): SeaVerdict[] {
    let r = this.rows.get(sp.id);
    if (!r) { r = verdictRow(this.inputs, sp); this.rows.set(sp.id, r); this.computed++; }
    return r;
  }
  /** One hour; outside the axis (no usable data) it is computed directly, exactly like the reference. */
  at(sp: SeaVerdictSpot, kk: number): SeaVerdict {
    return kk >= 0 && kk < this.inputs.nHours ? this.row(sp)[kk] : verdictOf(this.inputs, sp, kk);
  }
  /** The spot's windows over the axis (`windows` of the row); `nextAndLongest` stays per call (depends on now). */
  windows(sp: SeaVerdictSpot): SeaWindow[] {
    let w = this.wins.get(sp.id);
    if (!w) { const r = this.row(sp); w = windows(r, r.map((_, kk) => this.inputs.nowHour + kk * H)); this.wins.set(sp.id, w); }
    return w;
  }
}
