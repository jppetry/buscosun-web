/**
 * The words. ONE source for the panel row, the map note and the layer profile —
 * an answer that exists at only one of two places is a contradiction, not a
 * saving (Lehre VB3).
 *
 * Everything user-facing about the spread arrow is built here, including every
 * refusal. That is deliberate: the sentences that say what the product does NOT
 * know are as much a product as the sentences that state a direction, and they
 * must not drift apart between two components.
 */

import { compassLabel } from '../activity/dynamics';
import { FBP_FUEL, GRASS_CURING_PCT } from './fbp';
import type { FireSpread, SpreadGap } from './spreadForecast';
import type { ReachSpan } from './spreadReach';

/**
 * The mandatory caveat. Every surface that shows an arrow shows this, wortgleich.
 * Contains, by contract (the verifier checks each): the method with its source
 * and years, „keine Brandfront", „keine Warnung", the fuel as an assumption, the
 * lower-bound nature of the distance, and „kein amtliches Produkt".
 */
export const SPREAD_CAVEAT =
  'Modellrechnung nach dem kanadischen FBP-System (Forestry Canada 1992 / Wotton u. a. 2009) aus '
  + 'ICON-D2-Wind, dem stündlichen ISI und der Hangneigung aus dem Höhenmodell. Der Pfeil zeigt die '
  + 'Richtung, in die sich ein Feuer bei diesem Wetter und diesem Gelände am schnellsten ausbreiten '
  + 'würde — keine Brandfront, keine gefährdete Fläche, keine Warnung. Der Bewuchs ist eine Annahme, '
  + 'keine Messung: auf ebenem Grund hat er auf die Richtung keinen Einfluss, am Hang schon. Ohne '
  + 'Vortagsgedächtnis (kein BUI) ist die Reichweite eine Untergrenze. Über die Stunden dreht der '
  + 'Wind. Kein amtliches Produkt.';

/**
 * The short form for the map note. It is NOT a softened version: it carries
 * every load-bearing negation of `SPREAD_CAVEAT` (keine Brandfront, keine
 * Warnung, kein amtliches Produkt) plus the method. The long form belongs where
 * there is room to read it — layer profile and detail card — because a note
 * that covers a third of the map stops being read at all. The verifier holds
 * both to the same negations.
 */
export const SPREAD_CAVEAT_SHORT =
  'Der Pfeil zeigt die Richtung, in die sich ein Feuer bei diesem Wetter und diesem Gelände am '
  + 'schnellsten ausbreiten würde (FBP-Rechnung aus ICON-D2-Wind, ISI und Hangneigung) '
  + '— keine Brandfront, keine gefährdete Fläche, keine Warnung, kein amtliches Produkt.';

/** The fan's own sentence — a sector on a map reads as an area unless told otherwise. */
export const FAN_CAVEAT =
  'Der Fächer zeigt mögliche Richtung und Reichweite — keine Brandfläche und keine Front.';

/** Named reason for every gap. No gap may be renderable as an empty string. */
export function gapText(g: SpreadGap): string {
  switch (g) {
    case 'inactive':
      return 'kein aktuelles Satellitensignal — für diesen Brand wird nichts vorhergesagt';
    case 'capped':
      return 'über dem Deckel dieser Berechnung — kein Pfeil heißt nicht „keine Ausbreitung"';
    case 'no-terrain':
      return 'Gelände nicht geladen — ohne Hangneigung wird keine Richtung behauptet';
    case 'no-wind-frame':
      return 'kein Windfeld für diese Stunde — der geladene ICON-D2-Lauf reicht nicht so weit';
    case 'no-isi':
      return 'kein Feuerwetter-Wert an dieser Stelle — außerhalb des Modellgebiets, unter Schnee oder Lücke im Lauf';
    case 'isi-implausible':
      return 'Feuerwetter-Wert und Wind passen nicht zusammen — es wird nichts gerechnet';
    case 'calm':
      return 'windstill auf ebenem Grund — es gibt keine Vorzugsrichtung';
  }
}

const de = (n: number, digits = 0): string =>
  n.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Metres below 1 km, kilometres above — one decimal, never more precision than earned. */
export function distanceLabel(m: number): string {
  if (!Number.isFinite(m)) return '—';
  if (m < 950) return `${de(Math.round(m / 10) * 10)} m`;
  return `${de(m / 1000, 1)} km`;
}

/** „0,3–1,5 km in 3 h" — the span always names both ends. */
export function reachLabel(r: ReachSpan): string {
  const lo = distanceLabel(r.minM);
  const hi = distanceLabel(r.maxM);
  const span = lo === hi ? lo : `${lo}–${hi}`;
  return `${span} in ${r.hours} h`;
}

/** Which vegetation the two ends of a span stand for. */
export function fuelSpanLabel(r: ReachSpan): string {
  return `${FBP_FUEL[r.minFuel].label} … ${FBP_FUEL[r.maxFuel].label}`;
}

/** „nach NO (68°)" — the arrow's short label; `null` without a vector. */
export function arrowLabel(s: FireSpread): string | null {
  const v = s.shown?.vector;
  if (!v) return null;
  return `nach ${compassLabel(v.razDeg)} (${de(Math.round(v.razDeg))}°)`;
}

/** The compact chip for the fire list — direction only, or nothing. */
export function spreadChip(s: FireSpread): string | null {
  const v = s.shown?.vector;
  return v ? `→ ${compassLabel(v.razDeg)} (Modell)` : null;
}

/**
 * The plain-language line: what drives it, where it runs, how far, how sure.
 * `null` when there is no arrow — the caller then renders `gapText(s.reason)`,
 * so a fire is never silent.
 */
export function spreadHint(s: FireSpread): string | null {
  const h = s.shown;
  const v = h?.vector;
  if (!h || !v || !h.wind) return null;

  const parts: string[] = [];

  // --- Drivers.
  const drivers = [`Wind ${de(Math.round(h.wind.speedKmh))} km/h aus ${de(Math.round(h.wind.fromDeg))}° (${compassLabel(h.wind.fromDeg)})`];
  if (s.slope && s.slope.slopePct > 0) {
    drivers.push(`Hang ${de(Math.round(s.slope.slopePct))} % hinauf nach ${compassLabel(s.slope.upslopeAzDeg)}`);
  } else if (s.slope) {
    drivers.push('ebener Grund');
  }
  parts.push(`${drivers.join(', ')} ⇒ Kopffeuer ${arrowLabel(s)}.`);

  // --- How far the terrain moved the arrow — only worth saying when it did.
  if (v.terrainTurnDeg >= 5) {
    parts.push(`Der Hang dreht die Richtung um ${de(Math.round(v.terrainTurnDeg))}° vom reinen Windkurs weg.`);
  }

  // --- Reach, or the rate when no time has passed yet.
  if (h.reach) {
    parts.push(`Bis +${h.hour} h wären das ${reachLabel(h.reach)}, je nach Bewuchs (${fuelSpanLabel(h.reach)}).`);
  } else if (s.rateNow) {
    parts.push(`Der Kopf läuft derzeit mit ${de(s.rateNow.minMmin, 1)}–${de(s.rateNow.maxMmin, 1)} m/min, je nach Bewuchs.`);
  }
  if (h.hour === 0 && s.horizon) {
    parts.push(`Über den ganzen geladenen Vorlauf wären es ${reachLabel(s.horizon.reach)}.`);
  }

  // --- Uncertainty, named rather than implied.
  if (s.veerDeg != null && s.veerDeg >= 15) {
    parts.push(`Der Wind dreht über die Stunden um ${de(Math.round(s.veerDeg))}° — die Richtung ist entsprechend unsicher.`);
  }
  if (h.band && h.band.spanDeg >= 5) {
    parts.push(`Am Hang hängt die Richtung am Bewuchs: über die vier angenommenen Typen streut sie um ${de(Math.round(h.band.spanDeg))}°.`);
  }

  return parts.join(' ');
}

/** The sentence that names the observed shift next to the computed direction. */
export function observedCompareText(s: FireSpread): string | null {
  if (s.observedDeltaDeg == null || s.observedBearingDeg == null) return null;
  const d = Math.round(s.observedDeltaDeg);
  const observed = `bisher beobachtet: nach ${compassLabel(s.observedBearingDeg)}`;
  if (d <= 45) return `${observed} — das deckt sich mit der Rechnung (${de(d)}° Unterschied).`;
  if (d >= 135) return `${observed} — das läuft der Rechnung entgegen (${de(d)}° Unterschied). Beobachtung und Modell widersprechen sich hier; die Rechnung wird nicht angepasst.`;
  return `${observed} — ${de(d)}° neben der Rechnung. Die Rechnung wird dadurch nicht angepasst.`;
}

/**
 * The spoken cap — silent truncation would be a false statement (V-246) — plus
 * the usable horizon, which is the other silent truncation: the wind grid
 * regularly ends before the axis does, and an empty map at +3 h without a
 * sentence reads as „nothing spreads here".
 */
export function capNote(i: {
  computed: number; considered: number; cap: number; demCells: number;
  horizonHour?: number; maxHour?: number;
}): string {
  const head = i.considered <= i.cap
    ? `Ausbreitungsrichtung gerechnet für ${de(i.computed)} von ${de(i.considered)} aktiven Bränden · `
      + `Gelände für ${de(i.demCells)} Kartenausschnitte geladen.`
    : `Ausbreitungsrichtung gerechnet für die ${de(i.cap)} stärksten von ${de(i.considered)} aktiven Bränden `
      + `(Deckel, damit die Karte flüssig bleibt) · Gelände für ${de(i.demCells)} Kartenausschnitte geladen. `
      + 'Die übrigen tragen keinen Pfeil — das heißt nicht „keine Ausbreitung".';
  return i.horizonHour != null && i.maxHour != null && i.horizonHour < i.maxHour
    ? `${head} ${horizonNote(i.horizonHour, i.maxHour)}`
    : head;
}

/** Why the later hours of the axis are empty — always the wind, never „no fire". */
export function horizonNote(horizonHour: number, maxHour: number): string {
  if (horizonHour < 0) {
    return 'Für keine Stunde der Achse liegt ein passendes Windfeld vor — deshalb kein einziger Pfeil. '
      + 'Das ist eine Lücke im geladenen ICON-D2-Lauf, keine Aussage über die Brände.';
  }
  return `Der geladene ICON-D2-Windlauf trägt nur bis +${de(horizonHour)} h; von +${de(horizonHour + 1)} h `
    + `bis +${de(maxHour)} h wird nichts gerechnet — dort heißt „kein Pfeil" „kein Windfeld", `
    + 'nicht „keine Ausbreitung".';
}

/** The fuel assumption, spelled out wherever a number depends on it. */
export const FUEL_ASSUMPTION_NOTE =
  `Angenommene Bewuchsarten: ${Object.values(FBP_FUEL).map((f) => f.label).join(', ')} `
  + `(Gras mit ${GRASS_CURING_PCT} % Kurungsgrad, Vorgabe des cffdrs-Pakets). `
  + 'Es gibt für frische Hotspots keine Vegetationskarte im Projekt — deshalb eine Spanne statt einer Zahl.';

// ---------------------------------------------------------------------------
// Self-verification (Muster D-12; headless über verify:fire-spread)
// ---------------------------------------------------------------------------

export interface TextCheck { name: string; ok: boolean; detail?: string }

export function verifySpreadText(): { checks: TextCheck[]; passed: number; total: number } {
  const checks: TextCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const gaps: SpreadGap[] = ['inactive', 'capped', 'no-terrain', 'no-wind-frame', 'no-isi', 'isi-implausible', 'calm'];
  add('jede Lücke hat einen nicht-leeren Satz', gaps.every((g) => gapText(g).trim().length > 20));
  add('kein Lückentext behauptet eine Richtung',
    gaps.every((g) => !/\bnach (N|O|S|W|NO|SO|SW|NW)\b/.test(gapText(g))));

  // --- The caveat carries its contractual parts.
  const caveat = SPREAD_CAVEAT.toLowerCase();
  for (const needle of ['fbp', '1992', '2009', 'keine brandfront', 'keine warnung', 'annahme', 'untergrenze', 'kein amtliches produkt']) {
    add(`Pflichtsatz enthält „${needle}"`, caveat.includes(needle));
  }
  // Die Kurzform darf kürzer sein, aber keine der tragenden Verneinungen verlieren.
  const short = SPREAD_CAVEAT_SHORT.toLowerCase();
  for (const needle of ['fbp', 'keine brandfront', 'keine warnung', 'kein amtliches produkt']) {
    add(`Kurzform der Kartennotiz enthält „${needle}"`, short.includes(needle));
  }
  add('die Kurzform ist wirklich kürzer als der Pflichtsatz',
    SPREAD_CAVEAT_SHORT.length < SPREAD_CAVEAT.length * 0.55,
    `${SPREAD_CAVEAT_SHORT.length} vs. ${SPREAD_CAVEAT.length} Zeichen`);
  add('Fächer-Satz schließt Brandfläche und Front aus',
    FAN_CAVEAT.includes('keine Brandfläche') && FAN_CAVEAT.includes('keine Front'));

  // --- Forbidden vocabulary: this layer is not a warning product.
  const all = [SPREAD_CAVEAT, FAN_CAVEAT, FUEL_ASSUMPTION_NOTE, ...gaps.map(gapText)].join(' ');
  add('keine Warnsprache in den Bausteinen',
    !/Gefahr für|Evakuier|Alarm|amtliche Warnung/.test(all));
  add('„Warnung" kommt nur verneint vor',
    !/(?<!keine )Warnung/.test(all.replace(/amtliches Produkt/g, '')));

  // --- Numbers.
  add('Meter unter 1 km, Kilometer darüber',
    distanceLabel(320) === '320 m' && distanceLabel(1450) === '1,5 km' && distanceLabel(940) === '940 m');
  add('unbrauchbare Strecke wird zum Gedankenstrich, nicht zu 0', distanceLabel(NaN) === '—');
  const span = { minM: 320, maxM: 1450, minFuel: 'D1' as const, maxFuel: 'O1B' as const, hours: 3 };
  add('Reichweite nennt beide Enden und die Stundenzahl', reachLabel(span) === '320 m–1,5 km in 3 h');
  add('die Enden werden mit ihrer Bewuchsart benannt',
    fuelSpanLabel(span).includes('Laubwald') && fuelSpanLabel(span).includes('Gras'));

  // --- The cap sentence changes shape when the cap actually bites.
  const under = capNote({ computed: 7, considered: 7, cap: 25, demCells: 2 });
  const over = capNote({ computed: 25, considered: 112, cap: 25, demCells: 12 });
  add('unter dem Deckel: keine Deckelbehauptung', !under.includes('Deckel') && under.includes('7'));
  // Der Windhorizont ist die ZWEITE stille Kürzung: eine leere Karte bei +3 h
  // ohne Satz liest sich wie „hier breitet sich nichts aus".
  const shortHorizon = capNote({ computed: 12, considered: 20, cap: 25, demCells: 3, horizonHour: 0, maxHour: 6 });
  add('kurzer Windhorizont wird ausgesprochen',
    shortHorizon.includes('+0 h') && shortHorizon.includes('kein Windfeld'));
  add('voller Windhorizont hängt keinen Satz an',
    !capNote({ computed: 12, considered: 20, cap: 25, demCells: 3, horizonHour: 6, maxHour: 6 }).includes('Windlauf'));
  add('kein einziges Windfeld ⇒ der Satz nennt die Lücke im Lauf, nicht die Brände',
    horizonNote(-1, 6).includes('Lücke im geladenen') && !horizonNote(-1, 6).includes('keine Ausbreitung'));
  add('der Horizontsatz sagt ausdrücklich, was „kein Pfeil" dort NICHT heißt',
    horizonNote(2, 6).includes('nicht „keine Ausbreitung"'));
  add('über dem Deckel: Zahl, Grund und der Satz gegen die Fehllesart',
    over.includes('25') && over.includes('112') && over.includes('nicht „keine Ausbreitung"'));

  // --- The observed comparison never corrects.
  const base = {
    fireId: 'x', lat: 0, lon: 0, slope: null, slopeSource: null, fuel: 'C3' as const,
    fuelSource: 'assumed' as const, fuels: [], hours: [], shownHour: 0, shown: null, horizon: null,
    rateNow: null, fanDeg: null, veerDeg: null, reason: null,
  };
  const far = observedCompareText({ ...base, observedBearingDeg: 250, observedDeltaDeg: 180 } as unknown as FireSpread);
  add('weit abweichende Beobachtung wird als Widerspruch benannt, nicht korrigiert',
    !!far && far.includes('entgegen') && far.includes('nicht angepasst'));
  add('ohne Beobachtung kein Vergleichssatz',
    observedCompareText({ ...base, observedBearingDeg: null, observedDeltaDeg: null } as unknown as FireSpread) === null);

  add('die Brennstoff-Annahme wird als Annahme benannt',
    /angenommen|annahme/i.test(FUEL_ASSUMPTION_NOTE));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
