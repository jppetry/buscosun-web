/**
 * One fire ⇒ one statement (or a named reason why there is none).
 *
 * This module owns the rule that makes the feature honest: **a missing input
 * produces a gap, never a direction.** There is no default bearing, no zero that
 * could read as „no spread", no silently shortened distance. Every `FireSpread`
 * either carries a vector for the selected hour or a `reason` naming what is
 * missing — the UI renders one or the other, never neither.
 *
 * The observed spread (AF2, `../activity/dynamics.ts`) stays strictly separate:
 * it is carried along as `observedBearingDeg` and compared as a FLAG
 * (`observedDeltaDeg`), exactly the way `windAgreement` reports its
 * disagreement. It never corrects the computed direction, and the computed
 * direction never overwrites it.
 */

import { angleDiff } from '../activity/dynamics';
import { FBP_FUELS, REFERENCE_FUEL, type FbpFuel } from './fbp';
import {
  fanWidthDeg, razBand, spreadVector,
  type SlopeInput, type SpreadVector, type WindInput,
} from './spreadVector';
import { rateSpanMmin, reachSpanM, type ReachHour, type ReachSpan } from './spreadReach';

/** Why a fire carries no arrow. Every value has a sentence in `spreadText.ts`. */
export type SpreadGap =
  | 'inactive'
  | 'capped'
  | 'no-terrain'
  | 'no-wind-frame'
  | 'no-isi'
  | 'isi-implausible'
  | 'calm';

/** ISZ = 0.208·f(F) and f(F) ≤ 91.9, so anything above this is not an ISZ. */
export const ISZ_MAX_PLAUSIBLE = 0.208 * 91.9;

/** One sampled hour at the fire, as the run hands it over. */
export interface SpreadSample {
  atMs: number;
  /** Hours from now: 0 = the running hour. */
  hour: number;
  /** Zero-wind ISI sampled from the fire-weather raster; `null` = no value here. */
  iszValue: number | null;
  /** Wind sampled from the ICON-D2 wind grid; `null` = no frame close enough. */
  wind: WindInput | null;
}

export interface SpreadHour {
  atMs: number;
  hour: number;
  vector: SpreadVector | null;
  /** Direction span across the fuel set; `null` on flat ground (fuel is irrelevant there). */
  band: { minDeg: number; maxDeg: number; spanDeg: number } | null;
  /** Cumulative reach from now to this hour; `null` at hour 0 and on any gap. */
  reach: ReachSpan | null;
  iszValue: number | null;
  wind: WindInput | null;
  gaps: SpreadGap[];
}

export interface FireSpread {
  fireId: string;
  lat: number;
  lon: number;
  /** `null` means NOT LOADED — never "flat". */
  slope: SlopeInput | null;
  slopeSource: 'dem' | null;
  /** The named single fuel; the span uses `fuels`. */
  fuel: FbpFuel;
  fuelSource: 'assumed';
  fuels: readonly FbpFuel[];
  hours: SpreadHour[];
  /** The hour the time slider selects. */
  shownHour: number;
  shown: SpreadHour | null;
  /** Reach over the whole available horizon — the "next hours" answer at a glance. */
  horizon: { hour: number; reach: ReachSpan } | null;
  /** Head-fire rate right now, as a span (m/min). */
  rateNow: { minMmin: number; maxMmin: number; minFuel: FbpFuel; maxFuel: FbpFuel } | null;
  /** Angular width of the uncertainty fan up to `shownHour`; `null` = no fan. */
  fanDeg: number | null;
  /** How far the direction turns between now and the last available hour. */
  veerDeg: number | null;
  observedBearingDeg: number | null;
  /** Flag only: how far the observed shift differs from the computed direction. */
  observedDeltaDeg: number | null;
  /** `null` ⇔ there IS an arrow. */
  reason: SpreadGap | null;
}

export interface SpreadForFireInput {
  fireId: string;
  lat: number;
  lon: number;
  /** Status "active" — a fire without a current signal gets no prediction. */
  active: boolean;
  /** `true` when the fire is beyond the computation cap. */
  capped?: boolean;
  slope: SlopeInput | null;
  fuels?: readonly FbpFuel[];
  fuel?: FbpFuel;
  observedBearingDeg: number | null;
  samples: readonly SpreadSample[];
  shownHour: number;
}

function gapsFor(s: SpreadSample, slope: SlopeInput | null): SpreadGap[] {
  const gaps: SpreadGap[] = [];
  if (!slope) gaps.push('no-terrain');
  if (!s.wind) gaps.push('no-wind-frame');
  if (s.iszValue == null) gaps.push('no-isi');
  else if (!(s.iszValue > 0) || s.iszValue > ISZ_MAX_PLAUSIBLE) gaps.push('isi-implausible');
  return gaps;
}

export function spreadForFire(input: SpreadForFireInput): FireSpread {
  const fuels = input.fuels ?? FBP_FUELS;
  const fuel = input.fuel ?? REFERENCE_FUEL;
  const slope = input.slope;
  const shownHour = Math.max(0, Math.trunc(input.shownHour));

  const base = {
    fireId: input.fireId, lat: input.lat, lon: input.lon,
    slope, slopeSource: slope ? ('dem' as const) : null,
    fuel, fuelSource: 'assumed' as const, fuels,
    shownHour,
    observedBearingDeg: input.observedBearingDeg,
  };

  // --- Two refusals that precede any arithmetic.
  if (!input.active) {
    return { ...base, hours: [], shown: null, horizon: null, rateNow: null, fanDeg: null,
      veerDeg: null, observedDeltaDeg: null, reason: 'inactive' };
  }
  if (input.capped) {
    return { ...base, hours: [], shown: null, horizon: null, rateNow: null, fanDeg: null,
      veerDeg: null, observedDeltaDeg: null, reason: 'capped' };
  }

  const reachHours: ReachHour[] = input.samples.map((s) => ({ iszValue: s.iszValue, wind: s.wind }));

  const hours: SpreadHour[] = input.samples.map((s, idx) => {
    const gaps = gapsFor(s, slope);
    let vector: SpreadVector | null = null;
    let band: SpreadHour['band'] = null;
    if (gaps.length === 0 && slope && s.wind && s.iszValue != null) {
      vector = spreadVector({ iszValue: s.iszValue, wind: s.wind, slope, fuel });
      if (!vector) gaps.push('calm');
      else band = razBand({ iszValue: s.iszValue, wind: s.wind, slope, fuels });
    }
    const reach = slope ? reachSpanM(reachHours, slope, fuels, idx) : null;
    return { atMs: s.atMs, hour: s.hour, vector, band, reach, iszValue: s.iszValue, wind: s.wind, gaps };
  });

  const shown = hours.find((h) => h.hour === shownHour) ?? null;

  // --- Horizon: the furthest hour that still has an unbroken chain behind it.
  let horizon: FireSpread['horizon'] = null;
  if (slope) {
    for (let h = hours.length - 1; h >= 1; h--) {
      const reach = reachSpanM(reachHours, slope, fuels, h);
      if (reach) { horizon = { hour: h, reach }; break; }
    }
  }

  const rateNow = slope && reachHours.length > 0 ? rateSpanMmin(reachHours[0], slope, fuels) : null;

  // --- Fan and veer read only the hours up to the selected one.
  const upto = hours.filter((h) => h.hour <= shownHour && h.vector).map((h) => h.vector!.razDeg);
  const fanDeg = fanWidthDeg(upto, shown?.band?.spanDeg ?? 0);

  const withVector = hours.filter((h) => h.vector);
  const veerDeg = withVector.length >= 2
    ? angleDiff(withVector[0].vector!.razDeg, withVector[withVector.length - 1].vector!.razDeg)
    : null;

  const observedDeltaDeg = input.observedBearingDeg != null && shown?.vector
    ? angleDiff(input.observedBearingDeg, shown.vector.razDeg)
    : null;

  // --- The reason is the FIRST gap of the shown hour; no arrow ⇒ always a reason.
  const reason: SpreadGap | null = shown?.vector
    ? null
    : (shown?.gaps[0] ?? (slope ? 'no-wind-frame' : 'no-terrain'));

  return { ...base, hours, shown, horizon, rateNow, fanDeg, veerDeg, observedDeltaDeg, reason };
}

/** Every gap value — the verifier walks this so a new gap cannot stay untested. */
export const SPREAD_GAPS: readonly SpreadGap[] = [
  'inactive', 'capped', 'no-terrain', 'no-wind-frame', 'no-isi', 'isi-implausible', 'calm',
] as const;

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread)
// ---------------------------------------------------------------------------

export interface ForecastCheck { name: string; ok: boolean; detail?: string }

export function verifySpreadForecast(): { checks: ForecastCheck[]; passed: number; total: number } {
  const checks: ForecastCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const T0 = 1_760_000_000_000;
  const wind: WindInput = { speedKmh: 18, fromDeg: 250 };
  const flat: SlopeInput = { slopePct: 0, upslopeAzDeg: 0 };
  const samples = (over: Partial<SpreadSample> = {}, n = 7): SpreadSample[] =>
    Array.from({ length: n }, (_, h) => ({ atMs: T0 + h * 3_600_000, hour: h, iszValue: 3.5, wind, ...over }));
  const call = (over: Partial<SpreadForFireInput> = {}): FireSpread => spreadForFire({
    fireId: 'fire:test', lat: 48, lon: 11, active: true, slope: flat,
    observedBearingDeg: null, samples: samples(), shownHour: 3, ...over,
  });

  const ok = call();
  add('vollständige Eingaben ⇒ Pfeil und kein Grund',
    ok.reason === null && !!ok.shown?.vector, ok.shown?.vector ? `${ok.shown.vector.razDeg.toFixed(0)}°` : 'null');
  add('eben ⇒ Richtung ist die Windrichtung, Brennstoff spielt keine Rolle',
    ok.shown!.vector!.razDeg === 70 && ok.shown!.band === null);
  add('Reichweite ist eine Spanne mit zwei genannten Enden',
    !!ok.shown?.reach && ok.shown.reach.minM < ok.shown.reach.maxM
    && ok.shown.reach.minFuel !== ok.shown.reach.maxFuel);
  add('Horizont nennt die weiteste durchgerechnete Stunde',
    ok.horizon?.hour === 6 && !!ok.horizon.reach);
  add('Tempo jetzt liegt als Spanne vor', !!ok.rateNow && ok.rateNow.maxMmin > ok.rateNow.minMmin);
  add('Stunde 0 hat keine Strecke, aber einen Pfeil',
    ok.hours[0].reach === null && !!ok.hours[0].vector);

  // --- The honesty rule, walked over EVERY gap value.
  const gapCases: Record<SpreadGap, FireSpread> = {
    inactive: call({ active: false }),
    capped: call({ capped: true }),
    'no-terrain': call({ slope: null }),
    'no-wind-frame': call({ samples: samples({ wind: null }) }),
    'no-isi': call({ samples: samples({ iszValue: null }) }),
    'isi-implausible': call({ samples: samples({ iszValue: 99 }) }),
    calm: call({ samples: samples({ wind: { speedKmh: 0, fromDeg: 0 } }) }),
  };
  for (const g of SPREAD_GAPS) {
    const r = gapCases[g];
    add(`Lücke „${g}": kein Pfeil, aber ein benannter Grund`,
      r.reason === g && r.shown?.vector == null, `reason = ${r.reason}`);
  }
  add('jede Lücke aus SPREAD_GAPS ist abgedeckt', SPREAD_GAPS.length === Object.keys(gapCases).length);
  add('ohne Gelände wird keine Reichweite behauptet',
    gapCases['no-terrain'].horizon === null && gapCases['no-terrain'].rateNow === null
    && gapCases['no-terrain'].hours.every((h) => h.reach === null));
  add('„kein Gelände" ist nicht „eben": slope bleibt null, slopeSource null',
    gapCases['no-terrain'].slope === null && gapCases['no-terrain'].slopeSource === null);

  // --- A hole in one hour does not silently shorten the reach of later hours.
  const holed = call({ samples: samples().map((s) => (s.hour === 2 ? { ...s, wind: null } : s)) });
  add('Lücke in Stunde 2 ⇒ ab dort keine Reichweite, Stunde 1 bleibt',
    holed.hours[1].reach !== null && holed.hours[3].reach === null && holed.hours[6].reach === null);
  // Stunde 2 fehlt ⇒ das Intervall 2→3 ist unbekannt; die Strecke BIS Stunde 2
  // (Intervalle 0→1 und 1→2) bleibt lückenlos und ist der Horizont.
  add('Horizont weicht auf die letzte lückenlose Stunde zurück', holed.horizon?.hour === 2);

  // --- Veer and fan.
  const veering = call({
    samples: samples().map((s) => ({ ...s, wind: { speedKmh: 18, fromDeg: 250 + s.hour * 5 } })),
  });
  add('Winddrehung über die Stunden erscheint als veerDeg',
    (veering.veerDeg ?? 0) > 25 && (veering.veerDeg ?? 0) < 35, `${veering.veerDeg?.toFixed(1)}°`);
  add('Fächer wächst mit der Drehung', (veering.fanDeg ?? 0) > 0);
  add('konstanter Wind auf ebenem Grund ⇒ kein Fächer', ok.fanDeg === null && ok.veerDeg === 0);

  // --- Observed vs. computed: a flag, never a correction.
  const withObs = call({ observedBearingDeg: 100 });
  add('beobachtete Richtung wird nur verglichen, nie übernommen',
    withObs.observedDeltaDeg === 30 && withObs.shown!.vector!.razDeg === 70);
  add('ohne Beobachtung kein Vergleichswert', ok.observedDeltaDeg === null);

  // --- The fuel stays declared as an assumption.
  add('Brennstoff ist als Annahme gekennzeichnet und benannt',
    ok.fuelSource === 'assumed' && ok.fuels.length === 4 && ok.fuel === REFERENCE_FUEL);

  // --- Slope turns the arrow and opens the fuel band.
  const onSlope = call({ slope: { slopePct: 40, upslopeAzDeg: 340 } });
  add('am Hang dreht der Pfeil weg vom Wind und der Brennstoff öffnet ein Band',
    !!onSlope.shown?.vector && onSlope.shown.vector.terrainTurnDeg > 1 && (onSlope.shown.band?.spanDeg ?? 0) > 0,
    onSlope.shown?.vector ? `Drehung ${onSlope.shown.vector.terrainTurnDeg.toFixed(1)}°` : 'null');

  // --- Deterministic: no clock inside.
  add('zweimal dieselbe Eingabe ⇒ byte-gleiches Ergebnis',
    JSON.stringify(call()) === JSON.stringify(call()));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
