/**
 * AW-1 — Road-surface classes of Autobahnwetter: ONE rule, two consumers (producer `scripts/road/road-derive.mjs`
 * classifies every published point, the client re-derives the class as a drift check before drawing it).
 *
 * Classes (concept §3, `audit/autobahnwetter-konzept.md`):
 *   ice      Glätte gemessen — the sensor reports rime, snow, ice or glaze (code table 0 20 241 = 0 20 138: 3–6)
 *   frost    Frostgefahr     — road ≤ +1 °C (`set`) and (wet or road ≤ dew point)
 *   wet      Nass            — water film > 0 mm or condition moist / wet / not dry (1, 2, 7)
 *   dry      Trocken         — condition code 0 measured, no water film
 *   unknown  road temperature valid, surface state unknown (missing or reserved code) and no frost criterion —
 *            NEVER "dry" (plan rule "unbekannter Zustandscode")
 *   nodata   no valid road-surface measurement at all
 *
 * The thresholds are start values (`set`), calibrated in AW-6 against the backtest — not fitted yet.
 * Dependency-free on purpose: imported by the producer (Node strip-types) and by the lazy `src/road/` chunk.
 */

export type RoadClass = 'ice' | 'frost' | 'wet' | 'dry' | 'unknown' | 'nodata';

/** Severity order for "worst of" (sensors of one station, stations of one band segment). nodata/unknown rank lowest
 *  but are never drawn as dry (D-04) — the UI hatches them. */
export const ROAD_CLASS_RANK: Readonly<Record<RoadClass, number>> = Object.freeze({
  ice: 5, frost: 4, wet: 3, dry: 2, unknown: 1, nodata: 0,
});

export const ROAD_CLASSES: readonly RoadClass[] = Object.freeze(['ice', 'frost', 'wet', 'dry', 'unknown', 'nodata']);

/** Frost threshold of the road surface in °C (`set`: concept §3, "Fahrbahn ≤ +1 °C und nass"). */
export const FROST_ROAD_MAX_C = 1;

/** Code table 0 20 241 / 0 20 138 (DWD template p. 7). 8–14 reserved, 15 = missing (decoded as null). */
export const ROAD_CONDITION_LABEL: Readonly<Record<number, string>> = Object.freeze({
  0: 'trocken', 1: 'feucht', 2: 'nass', 3: 'Reif', 4: 'Schnee', 5: 'Eis', 6: 'Glätte', 7: 'nicht trocken',
});
const ICE_CODES = new Set([3, 4, 5, 6]);
const WET_CODES = new Set([1, 2, 7]);

/** Is `code` one of the defined states 0–7? Reserved 8–14 and anything else count as unknown. */
export function isKnownCondition(code: number | null | undefined): code is number {
  return typeof code === 'number' && Number.isInteger(code) && code >= 0 && code <= 7;
}

export interface RoadClassInput {
  /** Road surface temperature °C (already validated; null = none valid). */
  roadT: number | null;
  /** Dew point °C (validated) or null. */
  dewT: number | null;
  /** Water film mm (validated) or null. */
  filmMm: number | null;
  /** Condition code (validated) or null. */
  cond: number | null;
}

/** Class of ONE sensor position (one road temperature, film and condition). */
export function classifySensor(x: RoadClassInput): RoadClass {
  const known = isKnownCondition(x.cond);
  if (known && ICE_CODES.has(x.cond as number)) return 'ice';
  if (x.roadT == null) return 'nodata';
  const wet = (x.filmMm != null && x.filmMm > 0) || (known && WET_CODES.has(x.cond as number));
  const belowDew = x.dewT != null && x.roadT <= x.dewT;
  // Read as "road ≤ +1 °C AND (wet OR road ≤ dew point)": a road below the dew point at +10 °C is condensation,
  // not frost (audit/autobahnwetter.md, E-AW-9).
  if (x.roadT <= FROST_ROAD_MAX_C && (wet || belowDew)) return 'frost';
  if (wet) return 'wet';
  if (known && x.cond === 0) return 'dry';
  return 'unknown';
}

/** Severity of the defined condition codes: ice codes over wet over dry (5 Eis … 0 trocken). */
const CONDITION_SEVERITY: Readonly<Record<number, number>> = Object.freeze({ 5: 7, 6: 6, 4: 5, 3: 4, 2: 3, 7: 2, 1: 1, 0: 0 });

/** Most severe defined condition code of several sensors; null when none is defined. */
export function mostSevereCondition(codes: Iterable<number | null | undefined>): number | null {
  let best: number | null = null;
  for (const c of codes) {
    if (!isKnownCondition(c)) continue;
    if (best == null || CONDITION_SEVERITY[c] > CONDITION_SEVERITY[best]) best = c;
  }
  return best;
}

/** Worst class of several (stations of a band segment). Empty ⇒ nodata. */
export function worstClass(classes: Iterable<RoadClass>): RoadClass {
  let w: RoadClass = 'nodata';
  for (const c of classes) if (ROAD_CLASS_RANK[c] > ROAD_CLASS_RANK[w]) w = c;
  return w;
}

/** UI wording per class (design `reference/autobahnwetter-desktop.dc.html`, CLS table). */
export const ROAD_CLASS_LABEL: Readonly<Record<RoadClass, { label: string; short: string }>> = Object.freeze({
  ice: { label: 'Glätte gemessen', short: 'Glätte' },
  frost: { label: 'Frostgefahr', short: 'Frostgefahr' },
  wet: { label: 'Nass', short: 'Nass' },
  dry: { label: 'Trocken', short: 'Trocken' },
  unknown: { label: 'Zustand unbekannt', short: 'unbekannt' },
  nodata: { label: 'Keine gültige Messung', short: 'k. Messung' },
});
