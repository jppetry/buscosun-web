/**
 * **Wetterführung im Brandzeitfenster** (Phase BDE-C) — die Ableitungen zur Stundenreihe,
 * die `fireWeatherAtPoint.ts` ohnehin holt. Vier Dinge, alle rein und netzfrei:
 *
 *   `windRose`      Verteilung der Windrichtungen über das Fenster, nach Stärkeklassen.
 *   `dominantWind`  vorherrschende Richtung als geschwindigkeitsgewichteter Vektormittelwert,
 *                   dazu die **Beständigkeit** — der einzige ehrliche Weg, eine „vorherrschende
 *                   Richtung" zu nennen, ohne zu verschweigen, wie sehr sie geschwankt hat.
 *   `spreadVsWind`  Winkeldifferenz zwischen beobachteter Ausbreitung und Windrichtung.
 *   `driverRating`  die Einstufung „brandtreibend / neutral / dämpfend".
 *
 * ── Warum ein Vektormittel und keine Mittelung der Grade ─────────────────────
 * 350° und 10° mitteln sich arithmetisch zu 180° — genau der Gegenrichtung. Richtungen
 * werden deshalb als Einheitsvektoren addiert, mit der Windgeschwindigkeit gewichtet
 * (eine Stunde mit 3 km/h soll die Richtung nicht so stark bestimmen wie eine mit 30).
 * Die Länge der Summe geteilt durch die Summe der Geschwindigkeiten ist die
 * **Beständigkeit** (0 = dreht ständig, 1 = konstant) — in der Meteorologie die
 * „wind constancy". Unter `STEADY_MIN` sagt die Oberfläche: keine vorherrschende Richtung.
 *
 * ── Die Einstufung ist eine Heuristik, kein Messwert ─────────────────────────
 * `driverRating` addiert Punkte aus fünf Größen. Jede Schwelle steht als benannte
 * Konstante hier und wird in der Oberfläche **mitgeliefert** (`reasons`, `RULE_TEXT`) —
 * der Auftrag verlangt ausdrücklich, die Heuristik offenzulegen. Die Punkte sind
 * gesetzt, nicht kalibriert: es gibt keinen Datensatz „Wetter → Feuerverhalten" für
 * DACH, an dem wir sie prüfen könnten. Genau das sagt `RULE_TEXT`.
 *
 * ── FFMC/ISI: was wir rechnen dürfen und was nicht ───────────────────────────
 * Aus derselben Stundenreihe lässt sich der **stündliche FFMC** (Feinbrennstoff-Feuchte)
 * und daraus der **ISI** (Ausbreitungsindex) rechnen — beides reagiert in Stunden bis
 * Tagen und ist mit 24 h Vorlauf tragfähig. **DC, BUI und der Gesamt-FWI nicht**: DC hat
 * eine Zeitkonstante von ~52 Tagen, unsere Reihe ist 7 Tage lang. Der Gesamt-FWI wird
 * deshalb **nicht** ausgegeben — weder gerechnet noch von GWIS übernommen (dessen WMS ist
 * nicht `queryable`, `audit/waldbrand-effis.md` §4.1). Die Oberfläche verlinkt für den
 * FWI die GWIS-Karte und zeigt selbst nur FFMC und ISI, ausdrücklich als eigene Rechnung.
 *
 * Pur, DOM-frei, ohne `Date.now()` (D-12) — geprüft in `npm run verify:fire-detail`.
 */

import type { FireWeatherHour } from './fireWeatherAtPoint';
import { ffmcEquilibrium, hffmcChain, isi } from '../fwi/fwi';
import { angleDiff, compassLabel } from '../activity/dynamics';

// ---------------------------------------------------------------------------
// Windrose
// ---------------------------------------------------------------------------

/** Stärkeklassen der Rose (km/h, untere Grenze). Vier Ringe — mehr wird bei 30 Stunden Rauschen. */
export const WIND_CLASSES: readonly number[] = [0, 10, 20, 30];
export const WIND_CLASS_LABEL: readonly string[] = ['unter 10 km/h', '10–20 km/h', '20–30 km/h', 'ab 30 km/h'];
/** Unter dieser Geschwindigkeit hat eine Stunde keine brauchbare Richtung (Windstille). */
export const CALM_KMH = 2;
/** Sektorzahl: 16 wie die Windrose der Seefahrt — 8 wäre für eine Ausbreitungsfrage zu grob. */
export const ROSE_SECTORS = 16;

export interface RoseSector {
  /** Mitte des Sektors in Grad („kommt aus"). */
  centerDeg: number;
  /** Stundenzahl je Stärkeklasse, gleiche Reihenfolge wie `WIND_CLASSES`. */
  counts: number[];
  total: number;
}

export interface WindRose {
  sectors: RoseSector[];
  /** Stunden mit Richtung und Stärke. */
  hours: number;
  /** Stunden unter `CALM_KMH` — sie stehen in der Mitte, nicht in einem Sektor. */
  calm: number;
  /** Stunden ohne Wind- oder Richtungswert — als Zahl genannt, nie stillschweigend weggelassen. */
  missing: number;
  /** Größte Sektorsumme — die Achsenbeschriftung der Rose. */
  maxSector: number;
}

export function classOf(kmh: number): number {
  let k = 0;
  for (let i = 0; i < WIND_CLASSES.length; i++) if (kmh >= WIND_CLASSES[i]) k = i;
  return k;
}

export function windRose(hours: readonly FireWeatherHour[], sectors = ROSE_SECTORS): WindRose {
  const width = 360 / sectors;
  const out: RoseSector[] = [];
  for (let i = 0; i < sectors; i++) out.push({ centerDeg: i * width, counts: WIND_CLASSES.map(() => 0), total: 0 });
  let calm = 0; let missing = 0; let used = 0;
  for (const h of hours) {
    if (h.windKmh == null || h.windFromDeg == null) { missing++; continue; }
    if (h.windKmh < CALM_KMH) { calm++; continue; }
    // Sektor 0 ist um 0° zentriert, deshalb die halbe Breite als Versatz.
    const idx = Math.floor((((h.windFromDeg + width / 2) % 360) + 360) % 360 / width) % sectors;
    out[idx].counts[classOf(h.windKmh)]++;
    out[idx].total++;
    used++;
  }
  return { sectors: out, hours: used, calm, missing, maxSector: out.reduce((m, s) => Math.max(m, s.total), 0) };
}

// ---------------------------------------------------------------------------
// Vorherrschende Richtung
// ---------------------------------------------------------------------------

/** Unter dieser Beständigkeit gibt es keine „vorherrschende Richtung" — der Wind drehte zu sehr. */
export const STEADY_MIN = 0.5;

export interface DominantWind {
  /** Geschwindigkeitsgewichtete mittlere Richtung („kommt aus", Grad) — `null` unter `STEADY_MIN`. */
  fromDeg: number | null;
  /** 0…1, „wind constancy": Betrag der Vektorsumme / Summe der Beträge. */
  steadiness: number | null;
  meanKmh: number | null;
  maxGustKmh: number | null;
  hours: number;
}

export function dominantWind(hours: readonly FireWeatherHour[]): DominantWind {
  let x = 0, y = 0, sum = 0, n = 0, gust: number | null = null;
  for (const h of hours) {
    if (h.windKmh == null || h.windFromDeg == null) continue;
    const rad = (h.windFromDeg * Math.PI) / 180;
    x += Math.sin(rad) * h.windKmh;
    y += Math.cos(rad) * h.windKmh;
    sum += h.windKmh; n++;
    if (h.gustKmh != null && (gust == null || h.gustKmh > gust)) gust = h.gustKmh;
  }
  if (n === 0 || sum === 0) return { fromDeg: null, steadiness: null, meanKmh: null, maxGustKmh: gust, hours: 0 };
  const len = Math.hypot(x, y);
  const steadiness = len / sum;
  const deg = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return {
    fromDeg: steadiness >= STEADY_MIN ? Math.round(deg) : null,
    steadiness: Math.round(steadiness * 100) / 100,
    meanKmh: Math.round((sum / n) * 10) / 10,
    maxGustKmh: gust,
    hours: n,
  };
}

// ---------------------------------------------------------------------------
// Ausbreitung gegen Wind
// ---------------------------------------------------------------------------

export interface SpreadVsWind {
  /** Winkel zwischen beobachteter Ausbreitung und der Richtung, in die der Wind weht (0…180). */
  diffDeg: number;
  /** Richtung, in die der Wind weht (Grad) — die Vergleichsgröße, ausgeschrieben. */
  downwindDeg: number;
  spreadDeg: number;
}

/**
 * Winkeldifferenz zwischen beobachteter Ausbreitung und Wind. `windFromDeg` ist
 * meteorologisch („kommt aus"), das Feuer läuft nach `windFromDeg + 180` — die
 * Umrechnung steht hier EINMAL, wie in `windAgreement`.
 */
export function spreadVsWind(spreadBearingDeg: number | null, windFromDeg: number | null): SpreadVsWind | null {
  if (spreadBearingDeg == null || windFromDeg == null) return null;
  const downwindDeg = (windFromDeg + 180) % 360;
  return { diffDeg: Math.round(angleDiff(spreadBearingDeg, downwindDeg)), downwindDeg, spreadDeg: spreadBearingDeg };
}

/** Worte zur Zahl — die Grenzen sind dieselben wie beim Flag `windAgreement` (60°/120°). */
export function spreadVsWindLabel(s: SpreadVsWind): string {
  if (s.diffDeg <= 60) return `läuft mit dem Wind (${s.diffDeg}° Abweichung)`;
  if (s.diffDeg >= 120) return `läuft gegen den Wind (${s.diffDeg}° Abweichung)`;
  return `quer zum Wind (${s.diffDeg}° Abweichung)`;
}

// ---------------------------------------------------------------------------
// Einstufung
// ---------------------------------------------------------------------------

export type DriverLevel = 'driving' | 'neutral' | 'damping';

export const DRIVER_LABEL: Record<DriverLevel, string> = {
  driving: 'brandtreibend', neutral: 'neutral', damping: 'dämpfend',
};

/** Alle Schwellen der Heuristik an EINER Stelle — die Oberfläche zeigt sie mit an. */
export const DRIVER_RULES = {
  rhVeryDry: 30, rhDry: 40, rhMoist: 60, rhWet: 75,
  windStrong: 20, windFresh: 12, windCalm: 6, gustStrong: 40,
  tempHot: 32, tempWarm: 28, tempCold: 10,
  rainInWindowMm: 1, rainBeforeWetMm: 5, rainBeforeMm: 1,
  dryDaysLong: 7, dryDaysSome: 3,
  drivingFrom: 3, dampingFrom: -2,
} as const;

export const DRIVER_RULE_TEXT =
  'Abgeleitete Einstufung, kein Messwert und keine amtliche Aussage: Punkte aus fünf Größen '
  + '(relative Feuchte, Wind und Böen, Temperatur, Niederschlag im Fenster und davor, Tage seit Regen), '
  + `Summe ab +${DRIVER_RULES.drivingFrom} „brandtreibend", ab ${DRIVER_RULES.dampingFrom} „dämpfend", dazwischen „neutral". `
  + 'Die Gewichte sind gesetzt, nicht kalibriert — es gibt für DACH keinen Datensatz „Wetter → Feuerverhalten", '
  + 'an dem sie zu prüfen wären. Sie beschreiben die Umgebung des Brandorts, nicht das Feuer.';

export interface DriverReason {
  text: string;
  /** Beitrag zur Summe — Vorzeichen ist die Aussage. */
  points: number;
}

export interface DriverRating {
  level: DriverLevel;
  score: number;
  reasons: DriverReason[];
  /** Woraus gerechnet wurde — Stundenzahl im Detektionszeitraum. */
  hours: number;
}

export interface DriverInput {
  /** Stunden des Detektionszeitraums (nicht das ganze Fenster). */
  hours: readonly FireWeatherHour[];
  precip24hBeforeMm: number | null;
  daysSinceRain: number | null;
}

const mean = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const max = (xs: (number | null)[]): number | null =>
  xs.reduce<number | null>((m, x) => (x == null ? m : m == null || x > m ? x : m), null);

/**
 * Die Einstufung. Jede Größe, die fehlt, trägt **nichts** bei und wird als fehlend genannt —
 * eine fehlende Größe darf nie wie „unauffällig" aussehen.
 */
export function driverRating(inp: DriverInput): DriverRating | null {
  const hs = inp.hours;
  if (hs.length === 0) return null;
  const R = DRIVER_RULES;
  const reasons: DriverReason[] = [];
  const add = (points: number, text: string) => reasons.push({ points, text });

  const rh = mean(hs.map((h) => h.rhPct));
  if (rh == null) add(0, 'Relative Feuchte fehlt in der Reihe — kein Beitrag');
  else if (rh <= R.rhVeryDry) add(2, `Luft sehr trocken: ${Math.round(rh)} % im Mittel (≤ ${R.rhVeryDry} %)`);
  else if (rh <= R.rhDry) add(1, `Luft trocken: ${Math.round(rh)} % im Mittel (≤ ${R.rhDry} %)`);
  else if (rh >= R.rhWet) add(-2, `Luft feucht: ${Math.round(rh)} % im Mittel (≥ ${R.rhWet} %)`);
  else if (rh >= R.rhMoist) add(-1, `Luft eher feucht: ${Math.round(rh)} % im Mittel (≥ ${R.rhMoist} %)`);
  else add(0, `Relative Feuchte ${Math.round(rh)} % — zwischen den Schwellen, kein Beitrag`);

  const wind = mean(hs.map((h) => h.windKmh));
  if (wind == null) add(0, 'Windgeschwindigkeit fehlt in der Reihe — kein Beitrag');
  else if (wind >= R.windStrong) add(2, `Wind stark: ${Math.round(wind)} km/h im Mittel (≥ ${R.windStrong})`);
  else if (wind >= R.windFresh) add(1, `Wind frisch: ${Math.round(wind)} km/h im Mittel (≥ ${R.windFresh})`);
  else if (wind <= R.windCalm) add(-1, `Wind schwach: ${Math.round(wind)} km/h im Mittel (≤ ${R.windCalm})`);
  else add(0, `Wind ${Math.round(wind)} km/h — zwischen den Schwellen, kein Beitrag`);

  const gust = max(hs.map((h) => h.gustKmh));
  if (gust != null && gust >= R.gustStrong) add(1, `Böen bis ${Math.round(gust)} km/h (≥ ${R.gustStrong})`);

  const tmax = max(hs.map((h) => h.tempC));
  if (tmax == null) add(0, 'Temperatur fehlt in der Reihe — kein Beitrag');
  else if (tmax >= R.tempHot) add(2, `heiß: bis ${Math.round(tmax)} °C (≥ ${R.tempHot})`);
  else if (tmax >= R.tempWarm) add(1, `warm: bis ${Math.round(tmax)} °C (≥ ${R.tempWarm})`);
  else if (tmax <= R.tempCold) add(-1, `kühl: höchstens ${Math.round(tmax)} °C (≤ ${R.tempCold})`);
  else add(0, `Höchsttemperatur ${Math.round(tmax)} °C — zwischen den Schwellen, kein Beitrag`);

  const rainIn = hs.every((h) => h.precipMm == null) ? null : hs.reduce((s, h) => s + (h.precipMm ?? 0), 0);
  if (rainIn == null) add(0, 'Niederschlag im Zeitraum fehlt in der Reihe — kein Beitrag');
  else if (rainIn >= R.rainInWindowMm) add(-2, `Regen während der Detektionen: ${rainIn.toFixed(1)} mm (≥ ${R.rainInWindowMm})`);

  if (inp.precip24hBeforeMm == null) add(0, 'Niederschlag der 24 h davor nicht bestimmbar — kein Beitrag');
  else if (inp.precip24hBeforeMm >= R.rainBeforeWetMm) add(-2, `${inp.precip24hBeforeMm.toFixed(1)} mm in den 24 h davor (≥ ${R.rainBeforeWetMm})`);
  else if (inp.precip24hBeforeMm >= R.rainBeforeMm) add(-1, `${inp.precip24hBeforeMm.toFixed(1)} mm in den 24 h davor (≥ ${R.rainBeforeMm})`);

  if (inp.daysSinceRain == null) add(0, '„Tage seit Regen" nicht bestimmbar — kein Beitrag');
  else if (inp.daysSinceRain >= R.dryDaysLong) add(2, `seit ${inp.daysSinceRain} Tagen kein Regen (≥ ${R.dryDaysLong})`);
  else if (inp.daysSinceRain >= R.dryDaysSome) add(1, `seit ${inp.daysSinceRain} Tagen kein Regen (≥ ${R.dryDaysSome})`);
  else if (inp.daysSinceRain === 0) add(-1, 'am Vortag hat es geregnet');

  const score = reasons.reduce((s, r) => s + r.points, 0);
  const level: DriverLevel = score >= R.drivingFrom ? 'driving' : score <= R.dampingFrom ? 'damping' : 'neutral';
  return { level, score, reasons, hours: hs.length };
}

// ---------------------------------------------------------------------------
// FFMC / ISI — eigene Rechnung, ausdrücklich benannt
// ---------------------------------------------------------------------------

/** So viele Stunden Vorlauf, bevor ein FFMC-Wert gezeigt wird — darunter trägt ihn nur der Startwert. */
export const FFMC_SPINUP_H = 12;

export interface FireIndexHour {
  atMs: number;
  ffmc: number;
  isi: number;
  /** Noch im Vorlauf: der Wert hängt am Startwert, nicht am Wetter. */
  spinup: boolean;
}

export interface FireIndexSeries {
  hours: FireIndexHour[];
  /** Zahl der Stunden, die wegen fehlender Werte übersprungen wurden. */
  skipped: number;
  note: string;
}

export const FIRE_INDEX_NOTE =
  'FFMC und ISI aus derselben Modell-Stundenreihe selbst gerechnet (Van Wagner 1977, cffdrs) — '
  + 'abgeleitet, nicht gemessen und nicht von GWIS übernommen. Die Kette startet ohne Vortagsgedächtnis '
  + `im Gleichgewicht der ersten Stunde; die ersten ${FFMC_SPINUP_H} Stunden sind Vorlauf. `
  + 'Gesamt-FWI wird bewusst NICHT ausgegeben: sein Trockenheitsanteil (DC) braucht Monate Vorlauf, '
  + 'unsere Reihe hat sieben Tage.';

/**
 * Stündlicher FFMC und ISI über die Reihe. Stunden ohne T/RH/Wind werden übersprungen
 * (die Kette läuft mit dem letzten Wert weiter) und gezählt — nicht mit 0 gefüllt.
 */
export function fireIndexSeries(hours: readonly FireWeatherHour[]): FireIndexSeries | null {
  const usable = hours.filter((h) => h.tempC != null && h.rhPct != null && h.windKmh != null);
  const skipped = hours.length - usable.length;
  if (usable.length === 0) return null;
  const first = usable[0];
  const start = ffmcEquilibrium(first.tempC as number, first.rhPct as number);
  const chain = hffmcChain(start, usable.map((h) => ({
    t: h.tempC as number, rh: h.rhPct as number, w: h.windKmh as number, r1h: h.precipMm ?? 0,
  })));
  const out: FireIndexHour[] = [];
  for (let i = 0; i < usable.length; i++) {
    const f = chain[i];
    if (!Number.isFinite(f)) continue;
    out.push({ atMs: usable[i].atMs, ffmc: f, isi: isi(f, usable[i].windKmh as number), spinup: i < FFMC_SPINUP_H });
  }
  return { hours: out, skipped, note: FIRE_INDEX_NOTE };
}

/** Der Wert zur Stunde `atMs` (nächste, höchstens 90 min entfernt) — sonst `null`. */
export function indexAt(series: FireIndexSeries | null, atMs: number): FireIndexHour | null {
  if (!series) return null;
  let best: FireIndexHour | null = null;
  for (const h of series.hours) if (!best || Math.abs(h.atMs - atMs) < Math.abs(best.atMs - atMs)) best = h;
  return best && Math.abs(best.atMs - atMs) <= 90 * 60_000 ? best : null;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface DriverCheck { name: string; ok: boolean; detail?: string }

function hour(atMs: number, o: Partial<FireWeatherHour> = {}): FireWeatherHour {
  return { atMs, tempC: 20, rhPct: 50, windKmh: 10, windFromDeg: 270, gustKmh: 15, precipMm: 0, ...o };
}

export function verifyFireDrivers(): { checks: DriverCheck[]; passed: number; total: number } {
  const checks: DriverCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const H = 3_600_000; const t0 = Date.UTC(2026, 7, 15, 6, 0);
  const series = (n: number, o: Partial<FireWeatherHour> = {}) =>
    Array.from({ length: n }, (_, i) => hour(t0 + i * H, o));

  // --- Rose ---------------------------------------------------------------
  const rose = windRose([...series(3, { windFromDeg: 0 }), ...series(2, { windFromDeg: 90, windKmh: 25 })]);
  add('Rose: Sektor 0 ist um 0° zentriert (350° und 10° fallen hinein)',
    windRose([hour(t0, { windFromDeg: 350 }), hour(t0 + H, { windFromDeg: 10 })]).sectors[0].total === 2);
  add('Rose: Stärkeklasse nach Geschwindigkeit (25 km/h ⇒ Klasse 2)', classOf(25) === 2 && classOf(9) === 0 && classOf(35) === 3);
  add('Rose zählt Sektoren und Klassen getrennt', rose.sectors[0].total === 3 && rose.sectors[4].counts[2] === 2, `${rose.maxSector}`);
  add('Rose: Windstille steht in der Mitte, nicht in einem Sektor',
    windRose([hour(t0, { windKmh: 1 })]).calm === 1 && windRose([hour(t0, { windKmh: 1 })]).hours === 0);
  add('Rose: fehlende Werte werden gezählt, nicht verschwiegen',
    windRose([hour(t0, { windKmh: null }), hour(t0 + H, { windFromDeg: null })]).missing === 2);

  // --- Vorherrschende Richtung -------------------------------------------
  add('Vektormittel: 350° und 10° ergeben ~0°, nicht 180° (die Falle des arithmetischen Mittels)', (() => {
    const d = dominantWind([hour(t0, { windFromDeg: 350 }), hour(t0 + H, { windFromDeg: 10 })]);
    return d.fromDeg != null && (d.fromDeg <= 1 || d.fromDeg >= 359);
  })());
  add('Gewichtung nach Geschwindigkeit: 30 km/h aus Nord schlägt 3 km/h aus Süd', (() => {
    const d = dominantWind([hour(t0, { windFromDeg: 0, windKmh: 30 }), hour(t0 + H, { windFromDeg: 180, windKmh: 3 })]);
    return d.fromDeg != null && angleDiff(d.fromDeg, 0) < 5;
  })());
  add('Gegenläufiger Wind ⇒ Beständigkeit ~0 und KEINE vorherrschende Richtung', (() => {
    const d = dominantWind([hour(t0, { windFromDeg: 0 }), hour(t0 + H, { windFromDeg: 180 })]);
    return d.fromDeg === null && (d.steadiness ?? 1) < 0.1;
  })());
  add('konstanter Wind ⇒ Beständigkeit 1', dominantWind(series(5)).steadiness === 1);
  add('ohne Windwerte: alles null, aber die Stundenzahl ist 0 (keine erfundene Richtung)', (() => {
    const d = dominantWind([hour(t0, { windKmh: null })]);
    return d.fromDeg === null && d.meanKmh === null && d.hours === 0;
  })());

  // --- Ausbreitung gegen Wind --------------------------------------------
  add('Wind aus West (270°) und Feuer nach Osten (90°) ⇒ 0° Abweichung, „mit dem Wind"', (() => {
    const s = spreadVsWind(90, 270);
    return s != null && s.diffDeg === 0 && s.downwindDeg === 90 && /mit dem Wind/.test(spreadVsWindLabel(s));
  })());
  add('Feuer gegen den Wind ⇒ 180°', (() => {
    const s = spreadVsWind(270, 270);
    return s != null && s.diffDeg === 180 && /gegen den Wind/.test(spreadVsWindLabel(s));
  })());
  add('quer: 90° Abweichung heißt weder dafür noch dagegen', (() => {
    const s = spreadVsWind(180, 270);
    return s != null && s.diffDeg === 90 && /quer/.test(spreadVsWindLabel(s));
  })());
  add('ohne Richtung oder ohne Wind: null (nichts wird interpoliert)',
    spreadVsWind(null, 270) === null && spreadVsWind(90, null) === null);

  // --- Einstufung ---------------------------------------------------------
  const hot = driverRating({ hours: series(6, { rhPct: 25, windKmh: 25, tempC: 33 }), precip24hBeforeMm: 0, daysSinceRain: 12 });
  add('heiß, trocken, windig, lange kein Regen ⇒ brandtreibend',
    hot?.level === 'driving' && hot.score >= 3, `${hot?.score}`);
  const wet = driverRating({ hours: series(6, { rhPct: 85, windKmh: 4, tempC: 8, precipMm: 0.5 }), precip24hBeforeMm: 9, daysSinceRain: 0 });
  add('feucht, kühl, windstill, Regen davor ⇒ dämpfend', wet?.level === 'damping' && wet.score <= -2, `${wet?.score}`);
  const mid = driverRating({ hours: series(6, { rhPct: 50, windKmh: 9, tempC: 20 }), precip24hBeforeMm: 0, daysSinceRain: 1 });
  add('dazwischen ⇒ neutral', mid?.level === 'neutral', `${mid?.score}`);
  add('jede Zeile nennt ihre Schwelle (die Heuristik ist offengelegt)',
    (hot?.reasons.length ?? 0) >= 4 && hot!.reasons.every((r) => r.text.length > 0)
    && hot!.reasons.some((r) => /≥|≤/.test(r.text)));
  add('fehlende Größen tragen 0 und werden als fehlend benannt — nie wie „unauffällig"', (() => {
    const d = driverRating({ hours: series(3, { rhPct: null }), precip24hBeforeMm: null, daysSinceRain: null });
    const miss = d?.reasons.filter((r) => /fehlt|nicht bestimmbar/.test(r.text)) ?? [];
    return miss.length === 3 && miss.every((r) => r.points === 0);
  })());
  add('ohne Stunden keine Einstufung (null, nicht „neutral")',
    driverRating({ hours: [], precip24hBeforeMm: 0, daysSinceRain: 9 }) === null);
  add('Regeltext nennt Schwellen und sagt, dass die Gewichte gesetzt sind',
    /nicht kalibriert/.test(DRIVER_RULE_TEXT) && /kein Messwert/.test(DRIVER_RULE_TEXT)
    && DRIVER_RULE_TEXT.includes(`+${DRIVER_RULES.drivingFrom}`));

  // --- FFMC / ISI ---------------------------------------------------------
  const dry = fireIndexSeries(series(30, { rhPct: 20, tempC: 30, windKmh: 15 }));
  const moist = fireIndexSeries(series(30, { rhPct: 90, tempC: 12, windKmh: 15 }));
  add('FFMC: trocken-heiß ergibt einen höheren Code als feucht-kühl', (() => {
    const a = dry?.hours[dry.hours.length - 1].ffmc ?? 0;
    const b = moist?.hours[moist.hours.length - 1].ffmc ?? 0;
    return a > b + 10;
  })(), `${dry?.hours[dry.hours.length - 1].ffmc.toFixed(1)} vs ${moist?.hours[moist.hours.length - 1].ffmc.toFixed(1)}`);
  add('ISI steigt mit dem Wind bei gleichem FFMC', (() => {
    const a = fireIndexSeries(series(20, { rhPct: 20, tempC: 30, windKmh: 5 }));
    const b = fireIndexSeries(series(20, { rhPct: 20, tempC: 30, windKmh: 30 }));
    return (b?.hours[19].isi ?? 0) > (a?.hours[19].isi ?? 0);
  })());
  add(`die ersten ${FFMC_SPINUP_H} Stunden sind als Vorlauf markiert`,
    dry?.hours[0].spinup === true && dry?.hours[FFMC_SPINUP_H].spinup === false);
  add('Stunden ohne Werte werden übersprungen UND gezählt, nicht mit 0 gefüllt', (() => {
    const s = fireIndexSeries([...series(5), hour(t0 + 5 * H, { rhPct: null }), ...series(3)]);
    return s != null && s.skipped === 1 && s.hours.length === 8;
  })());
  add('ohne brauchbare Stunde: null', fireIndexSeries([hour(t0, { tempC: null })]) === null);
  add('der Hinweistext sagt, dass der Gesamt-FWI NICHT ausgegeben wird und warum',
    /NICHT ausgegeben/.test(FIRE_INDEX_NOTE) && /DC/.test(FIRE_INDEX_NOTE) && /abgeleitet/.test(FIRE_INDEX_NOTE));
  add('indexAt trifft die Stunde und gibt außerhalb der Toleranz null',
    indexAt(dry, t0 + 3 * H)?.atMs === t0 + 3 * H && indexAt(dry, t0 + 100 * H) === null);
  add('Kompass-Beschriftung kommt aus DERSELBEN Funktion wie die Ausbreitung (keine zweite Tabelle)',
    compassLabel(90) === 'O');

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
