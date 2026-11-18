/**
 * Phase SU — the band of wind and gust on /seewetter (`audit/seewetter-bandbreite.md`). Pure: no React, no fetch.
 *
 * The spot file carries five quantiles per hour (q10, q25, q50, q75, q90) of the distribution buscosun Fusion computes
 * for that hour. From them the page says two things, per hour and never for a time window:
 *   "meist a–b"      the span q10–q90 (8 of 10 cases by construction of the quantiles)
 *   "über Grenze"    how often gusts lie above the profile's gust limit: the share above the limit, read off the five
 *                    quantiles by linear interpolation and rounded to tenths. Outside q10–q90 the quantiles say nothing
 *                    about the tail, so there the answer is only "seltener als 1 von 10" / "häufiger als 9 von 10".
 * No percent values, no traffic light, no "sicher". The classes passt/knapp/außerhalb stay on the mean.
 */
import { SEA_Q_KEYS, SEA_Q_PROBS, type SeaQColumns } from './seaContract';
import { MS_TO_KN, fmtWind, unitLabel, type SeaUnit } from './seaProfiles';

/** The five quantiles of one hour, in the unit of the caller (the page keeps m/s, the limit is in knots). */
export interface SeaQ5 { q10: number; q25: number; q50: number; q75: number; q90: number }

/** The quantiles of hour `i` of a spot's columns — `null` when the hour carries none (or the columns are absent). */
export function q5At(cols: SeaQColumns | null | undefined, i: number): SeaQ5 | null {
  if (!cols) return null;
  const out = {} as SeaQ5;
  for (const k of SEA_Q_KEYS) {
    const x = cols[k]?.[i];
    if (x == null || !Number.isFinite(x)) return null;
    out[k] = x;
  }
  return out;
}

/** How often a value lies above a limit: tenths 1–9 inside the band, else only the side. */
export type SeaOver = { kind: 'tenths'; tenths: number } | { kind: 'rare' } | { kind: 'often' };

/**
 * Share above `limit` (same unit as `q`). P(Y ≤ limit) is the piecewise-linear curve through the five quantiles; a limit
 * above q90 ⇒ `rare` (fewer than 1 of 10), below q10 ⇒ `often` (more than 9 of 10). On equal neighbours (a flat piece)
 * the upper probability counts, as P(Y ≤ limit) includes the limit itself.
 */
export function overLimit(q: SeaQ5, limit: number): SeaOver | null {
  if (!Number.isFinite(limit)) return null;
  const xs = SEA_Q_KEYS.map((k) => q[k]), ps = SEA_Q_KEYS.map((k) => SEA_Q_PROBS[k]);
  if (xs.some((x) => !Number.isFinite(x)) || xs.some((x, j) => j > 0 && x < xs[j - 1])) return null;
  if (limit > xs[xs.length - 1]) return { kind: 'rare' };
  if (limit < xs[0]) return { kind: 'often' };
  let below = ps[0];
  for (let j = xs.length - 1; j >= 0; j--) {
    if (limit >= xs[j]) {
      const next = j + 1 < xs.length ? xs[j + 1] : null;
      below = next == null || next === xs[j] ? ps[j] : ps[j] + ((limit - xs[j]) / (next - xs[j])) * (ps[j + 1] - ps[j]);
      break;
    }
  }
  // 1e-9: a share of exactly 0.25 must not fall to 2 tenths through a float tail.
  const tenths = Math.round((1 - below) * 10 + 1e-9);
  return { kind: 'tenths', tenths: Math.min(9, Math.max(1, tenths)) };
}

/** Gusts (m/s quantiles) against a limit in knots. */
export const gustOverLimit = (q: SeaQ5 | null | undefined, limitKn: number | null | undefined): SeaOver | null =>
  (q && limitKn != null ? overLimit({ q10: q.q10 * MS_TO_KN, q25: q.q25 * MS_TO_KN, q50: q.q50 * MS_TO_KN, q75: q.q75 * MS_TO_KN, q90: q.q90 * MS_TO_KN }, limitKn) : null);

/** Opacity of the cell in the hourly band (= tenths; the two tails sit just outside the scale). */
export const overOpacity = (o: SeaOver): number => (o.kind === 'rare' ? 0 : o.kind === 'often' ? 1 : o.tenths / 10);
/** Filled dots of ten: `rare` none, `often` nine and a tenth marked "more than". */
export const overDots = (o: SeaOver): number => (o.kind === 'rare' ? 0 : o.kind === 'often' ? 9 : o.tenths);

const kn = (limitKn: number) => String(Math.round(limitKn * 10) / 10).replace('.', ',');
/** "in etwa 3 von 10 vergleichbaren Lagen" — the part after the colon. */
export function overWords(o: SeaOver): string {
  if (o.kind === 'rare') return 'seltener als 1 von 10 vergleichbaren Lagen';
  if (o.kind === 'often') return 'häufiger als 9 von 10 vergleichbaren Lagen';
  return `in etwa ${o.tenths} von 10 vergleichbaren Lagen`;
}
/** The readout's sentence: "Böen über 33 kn: in etwa 3 von 10 vergleichbaren Lagen". */
export const overSentence = (o: SeaOver, limitKn: number): string => `Böen über ${kn(limitKn)} kn: ${overWords(o)}`;

/** "meist 14–19 kn" in the page's unit (q10–q90); one number when both ends round to the same. */
export function mostText(q: SeaQ5 | null | undefined, unit: SeaUnit): string | null {
  if (!q) return null;
  const a = fmtWind(q.q10, unit), b = fmtWind(q.q90, unit);
  return `meist ${a === b ? a : `${a}–${b}`} ${unitLabel(unit)}`;
}

/** The legend the task sets, word for word. */
export const BAND_LEGEND = 'meist = 8 von 10 Fällen';
/**
 * Step 0 of the phase (`audit/seewetter-bandbreite/coverage-coast.json`, measured 18.11.2026): at 14 coastal stations the
 * measurement lay inside q10–q90 in 74–78 of 100 cases (autumn 2026, 1–78 h) — the span is a little too narrow there.
 * Said next to the legend, without a percent value.
 */
export const BAND_MEASURED = 'so ist die Spanne gerechnet; an 14 Küstenstationen lag die Messung im Herbst 2026 in rund 3 von 4 Fällen darin';
export const BAND_NOTE = `${BAND_LEGEND} — ${BAND_MEASURED}. Je Stunde, nicht für ein Zeitfenster. Die Einordnung passt, knapp, außerhalb bleibt beim Mittelwert.`;
