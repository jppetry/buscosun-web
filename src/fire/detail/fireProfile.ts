/**
 * BDE-E — **Brandprofil**: wie ungewöhnlich waren die treibenden Größen zur Brandstunde,
 * gemessen an genau diesem Ort?
 *
 * Ein Radar-Netz braucht für jede Achse eine 0–100-Skala, und genau da liegt die Gefahr:
 * sieben willkürlich gewählte Skalen ergeben eine Form, die bedeutsam AUSSIEHT und nichts
 * bedeutet. Deshalb hat hier jede Achse DIESELBE Bedeutung — ein Perzentilrang:
 *
 *     „Der Wert zur Brandstunde war brandförderlicher als P % der Vergleichsstunden."
 *
 * Drei Festlegungen, die das tragen:
 *
 *  1. **Ortsbezug.** Verglichen wird nur mit demselben Punkt. 22 % relative Feuchte sind im
 *     Rheinland außergewöhnlich und im Wallis ein Dienstagnachmittag — eine feste Skala
 *     („≤ 30 % = extrem") würde beides gleich malen.
 *  2. **Gleiche Tageszeit.** Verglichen wird nur mit Stunden derselben Tageszeit (± 1 h) der
 *     Referenzperiode. Ohne diese Einschränkung läge ein Brand um 14 Uhr auf der
 *     Temperaturachse IMMER weit außen — nicht weil der Tag heiß war, sondern weil die
 *     meisten Vergleichsstunden Nacht sind. Der Tagesgang würde als Ausnahmelage gelesen.
 *  3. **Eine Quelle.** Wert und Verteilung stammen aus DERSELBEN Reihe (ERA5 über das
 *     Open-Meteo-Archiv). Käme der Brandwert aus ICON und die Verteilung aus ERA5, wäre
 *     jeder Modellversatz zwischen beiden als „ungewöhnlich" sichtbar.
 *
 * Was das Netz NICHT ist: die Achsen sind **nicht unabhängig**. ISI enthält Wind und FFMC,
 * FFMC enthält Feuchte und Temperatur, Bodenfeuchte hängt am Niederschlag. Eine große Fläche
 * heißt daher nicht „sechs unabhängige Belege", sondern „eine Wetterlage, die sich in sechs
 * Größen zeigt". Dieser Satz steht auch in der Oberfläche.
 *
 * Rein und DOM-frei — der Verifier prüft ihn ohne Netz und ohne Browser.
 */
import { fireIndexSeries, indexAt } from './fireDrivers';
import type { FireWeatherHour } from './fireWeatherAtPoint';

/** Referenzperiode in Tagen vor der Brandstunde. */
export const PROFILE_REF_DAYS = 30;
/** Tageszeit-Fenster um die Brandstunde, in Stunden (± 1 h ⇒ drei Werte je Referenztag). */
export const PROFILE_HOUR_SLACK = 1;
/** Weniger Vergleichsstunden als dies ⇒ die Achse bleibt leer, statt einen Rang zu behaupten. */
export const PROFILE_MIN_N = 20;
/** Wie nah die gefundene Stunde am Anker liegen muss. */
export const PROFILE_TOLERANCE_MS = 90 * 60_000;

const H_MS = 3_600_000;

/** Eine Stunde mit den Größen, die das Profil braucht — ERA5 liefert alle in EINEM Abruf. */
export interface ProfileHour extends FireWeatherHour {
  /** Volumetrische Bodenfeuchte 0–7 cm, m³/m³ (ERA5). */
  soilM3: number | null;
}

/**
 * Richtung der Achse: `high` = große Werte sind brandförderlich (Temperatur, Wind),
 * `low` = kleine Werte sind es (Feuchte, Bodenfeuchte).
 */
export type AxisDir = 'high' | 'low';

export interface AxisSpec {
  key: string;
  /** Kurz genug für die Netzbeschriftung. */
  label: string;
  /**
   * Noch kürzer — für schmale Spalten. Das Dossier stellt die Karten in einer Spalte von
   * ~250 px auf; „rel. Feuchte" und „Bodenfeuchte" werden dort am Rand abgeschnitten, und
   * eine halb sichtbare Achsenbeschriftung ist schlimmer als eine kurze.
   */
  short: string;
  dir: AxisDir;
  unit: string;
  /** Nachkommastellen der Rohwert-Anzeige. */
  frac: number;
  /** Was diese Achse in einem Satz sagt — Tooltip und Fußtext. */
  note: string;
}

/**
 * Sechs Achsen. Bewusst NICHT dabei: das Dampfdruckdefizit (rechnerisch fast vollständig aus
 * Temperatur und Feuchte, wäre eine dritte Stimme derselben Aussage) und „Tage seit Regen"
 * (eine Tagesgröße — ein Perzentil über Tageszeit-gleiche Stunden ergibt dafür keinen Sinn;
 * die Zahl steht als Regelzeile in der Einstufung darüber).
 */
export const PROFILE_AXES: AxisSpec[] = [
  { key: 'rh', label: 'rel. Feuchte', short: 'Feuchte', dir: 'low', unit: '%', frac: 0,
    note: 'Luftfeuchte in 2 m. Trockene Luft entzieht dem Feinbrennstoff binnen Stunden Wasser.' },
  { key: 'temp', label: 'Temperatur', short: 'Temp', dir: 'high', unit: '°C', frac: 1,
    note: 'Lufttemperatur in 2 m. Wärmere Luft senkt die Zündenergie, die noch fehlt.' },
  { key: 'wind', label: 'Wind', short: 'Wind', dir: 'high', unit: 'km/h', frac: 0,
    note: 'Mittelwind in 10 m. Treibt die Front und führt Sauerstoff nach.' },
  { key: 'gust', label: 'Böen', short: 'Böen', dir: 'high', unit: 'km/h', frac: 0,
    note: 'Windspitzen in 10 m. Böen werfen Funken über Riegel und Wege.' },
  { key: 'soil', label: 'Bodenfeuchte', short: 'Boden', dir: 'low', unit: 'm³/m³', frac: 3,
    note: 'Volumetrischer Wassergehalt 0–7 cm. Absolut nur bei bekanntem Bodentyp deutbar — als Rang am selben Ort schon.' },
  { key: 'isi', label: 'ISI', short: 'ISI', dir: 'high', unit: '', frac: 1,
    note: 'Initial Spread Index, selbst gerechnet aus derselben Reihe (Wind + FFMC). Enthält Wind und Feuchte — keine unabhängige Achse.' },
];

export interface ProfileAxis extends AxisSpec {
  /** Rohwert zur Brandstunde. */
  value: number | null;
  /** Perzentilrang 0–100, oder `null` bei zu dünner Vergleichsmenge. */
  pct: number | null;
  /** Zahl der Vergleichsstunden, die den Rang tragen. */
  n: number;
}

export interface FireProfile {
  /** Die Stunde, für die das Profil gilt (nächste zur Ankerzeit). */
  atMs: number;
  axes: ProfileAxis[];
  /** Referenzfenster `[von, bis]` in ms. */
  refRange: [number, number];
  /** Tageszeit (UTC-Stunde), gegen die verglichen wurde. */
  refHourUtc: number;
  notes: string[];
}

/**
 * Perzentilrang von `v` in `ref`: der Anteil der Vergleichswerte, die WENIGER brandförderlich
 * waren. Gleichstände zählen halb (die übliche „mid-rank"-Regel) — sonst bekäme ein Wert, der
 * exakt dem Median entspricht, je nach Rundung 0 oder 100.
 */
export function percentileRank(v: number, ref: readonly number[], dir: AxisDir): number | null {
  if (ref.length === 0) return null;
  let below = 0; let equal = 0;
  for (const r of ref) {
    if (r === v) { equal++; continue; }
    // „weniger brandförderlich" heißt bei `low`-Achsen: größer.
    if (dir === 'high' ? r < v : r > v) below++;
  }
  return Math.round(((below + equal / 2) / ref.length) * 1000) / 10;
}

/** Der Rohwert einer Achse aus einer Stunde — `isi` kommt nicht aus der Stunde, sondern aus der Kette. */
function rawOf(key: string, h: ProfileHour): number | null {
  switch (key) {
    case 'rh': return h.rhPct;
    case 'temp': return h.tempC;
    case 'wind': return h.windKmh;
    case 'gust': return h.gustKmh;
    case 'soil': return h.soilM3;
    default: return null;
  }
}

/** Stundenabstand auf dem Zifferblatt (0–23), also 23 und 1 sind zwei Stunden auseinander. */
export function hourDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 24;
  return Math.min(d, 24 - d);
}

/**
 * Baut das Profil. `hours` ist die volle ERA5-Reihe (Referenzperiode **plus** Brandstunde),
 * aufsteigend oder nicht — sortiert wird hier.
 */
export function buildFireProfile(hours: readonly ProfileHour[], anchorMs: number): FireProfile | null {
  const sorted = [...hours].sort((a, b) => a.atMs - b.atMs);
  if (sorted.length === 0) return null;

  let at: ProfileHour | null = null;
  for (const h of sorted) if (!at || Math.abs(h.atMs - anchorMs) < Math.abs(at.atMs - anchorMs)) at = h;
  if (!at || Math.abs(at.atMs - anchorMs) > PROFILE_TOLERANCE_MS) return null;

  const refFrom = at.atMs - PROFILE_REF_DAYS * 24 * H_MS;
  const refHourUtc = new Date(at.atMs).getUTCHours();
  // Die Brandstunde selbst gehört NICHT in ihre eigene Vergleichsmenge.
  const ref = sorted.filter((h) => h.atMs >= refFrom && h.atMs < at.atMs
    && hourDistance(new Date(h.atMs).getUTCHours(), refHourUtc) <= PROFILE_HOUR_SLACK);

  // ISI über die GANZE Reihe rechnen — die Kette braucht ihren Vorlauf und darf nicht je
  // Vergleichsstunde neu starten (sonst stünde überall der Gleichgewichtswert).
  const series = fireIndexSeries(sorted);
  const isiAt = series ? indexAt(series, at.atMs)?.isi ?? null : null;
  const isiRef = new Map<number, number>();
  if (series) for (const h of series.hours) isiRef.set(h.atMs, h.isi);

  const notes: string[] = [];
  const axes: ProfileAxis[] = PROFILE_AXES.map((spec) => {
    const value = spec.key === 'isi' ? isiAt : rawOf(spec.key, at);
    const pool = spec.key === 'isi'
      ? ref.map((h) => isiRef.get(h.atMs) ?? null)
      : ref.map((h) => rawOf(spec.key, h));
    const usable = pool.filter((x): x is number => x != null);
    const pct = value != null && usable.length >= PROFILE_MIN_N ? percentileRank(value, usable, spec.dir) : null;
    if (value == null) notes.push(`${spec.label}: kein Wert zur Brandstunde — Achse bleibt leer.`);
    else if (usable.length < PROFILE_MIN_N) {
      notes.push(`${spec.label}: nur ${usable.length} Vergleichsstunden (nötig ${PROFILE_MIN_N}) — kein Rang, nur der Rohwert.`);
    }
    return { ...spec, value, pct, n: usable.length };
  });

  return { atMs: at.atMs, axes, refRange: [refFrom, at.atMs], refHourUtc, notes };
}

// ---------------------------------------------------------------------------
// Beschriftungen — EINE Stelle für Netz, Legende und Verifier
// ---------------------------------------------------------------------------

const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac, minimumFractionDigits: frac });

export function axisValueText(a: ProfileAxis): string {
  if (a.value == null) return '—';
  return a.unit ? `${de(a.value, a.frac)} ${a.unit}` : de(a.value, a.frac);
}

/** „brandförderlicher als 92 % der Vergleichsstunden" — die EINE Lesart aller Achsen. */
export function axisRankText(a: ProfileAxis): string {
  if (a.pct == null) return 'kein Rang (zu wenige Vergleichsstunden)';
  return `brandförderlicher als ${de(a.pct, 0)} % der ${a.n} Vergleichsstunden`;
}

export const PROFILE_NOTE =
  `Jede Achse ist ein Rang, kein Messwert: der Wert zur Brandstunde verglichen mit denselben `
  + `Tageszeiten (± ${PROFILE_HOUR_SLACK} h) der ${PROFILE_REF_DAYS} Tage davor an genau diesem Punkt. `
  + `Weit außen heißt „für diesen Ort und diese Tageszeit ungewöhnlich brandförderlich", nicht „gefährlich" — `
  + `${PROFILE_REF_DAYS} Tage sind ein Vergleich mit dem laufenden Wetter, kein Klimabezug. `
  + `Wert und Verteilung stammen aus derselben Reihe (ERA5-Reanalyse, ~25 km).`;

export const PROFILE_DEPENDENCE_NOTE =
  'Die Achsen sind nicht unabhängig: ISI enthält Wind und FFMC, FFMC enthält Feuchte und Temperatur, '
  + 'die Bodenfeuchte hängt am Niederschlag der Vortage. Eine große Fläche heißt deshalb nicht „sechs '
  + 'unabhängige Belege", sondern „eine Wetterlage, die sich in sechs Größen zeigt".';

// ---------------------------------------------------------------------------
// Selbstverifikation (netzfrei)
// ---------------------------------------------------------------------------

export interface ProfileCheck { name: string; ok: boolean; detail?: string }

/** Eine synthetische Reihe: `days` Tage stündlich, mit Tagesgang und wählbarem Endwert. */
function synthetic(days: number, endMs: number, tweak?: (h: ProfileHour) => void): ProfileHour[] {
  const out: ProfileHour[] = [];
  for (let i = days * 24; i >= 0; i--) {
    const atMs = endMs - i * H_MS;
    const hod = new Date(atMs).getUTCHours();
    // Tagesgang: mittags warm und trocken, nachts kühl und feucht.
    const diurnal = Math.cos(((hod - 14) / 24) * 2 * Math.PI);
    const h: ProfileHour = {
      atMs,
      tempC: 15 + 8 * diurnal,
      rhPct: 60 - 20 * diurnal,
      windKmh: 10,
      windFromDeg: 270,
      gustKmh: 20,
      precipMm: 0,
      soilM3: 0.25,
    };
    tweak?.(h);
    out.push(h);
  }
  return out;
}

export function verifyFireProfile(): { checks: ProfileCheck[]; passed: number; total: number } {
  const checks: ProfileCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // --- Perzentilrang -------------------------------------------------------
  add('Rang: höchster Wert einer high-Achse steht ganz außen',
    percentileRank(10, [1, 2, 3, 4], 'high') === 100);
  add('Rang: niedrigster Wert einer high-Achse steht innen',
    percentileRank(0, [1, 2, 3, 4], 'high') === 0);
  add('Rang kehrt sich bei low-Achsen um (trockene Luft = außen)',
    percentileRank(10, [20, 30, 40], 'low') === 100 && percentileRank(50, [20, 30, 40], 'low') === 0);
  add('Gleichstand zählt halb — der Median landet nicht bei 0 oder 100',
    percentileRank(2, [1, 2, 3], 'high') === 50);
  add('leere Vergleichsmenge ergibt keinen Rang, nicht 0',
    percentileRank(5, [], 'high') === null);
  add('Stundenabstand läuft über Mitternacht (23 ↔ 1 sind zwei Stunden)',
    hourDistance(23, 1) === 2 && hourDistance(0, 12) === 12 && hourDistance(5, 5) === 0);

  // --- Tagesgang: die Kernfalle -------------------------------------------
  const noonMs = Date.UTC(2026, 7, 20, 13, 0, 0);
  const base = synthetic(PROFILE_REF_DAYS + 1, noonMs);
  const pNoon = buildFireProfile(base, noonMs);
  const temp = pNoon?.axes.find((a) => a.key === 'temp') ?? null;
  add('ein ganz gewöhnlicher Mittag ist auf der Temperaturachse NICHT auffällig',
    temp?.pct != null && temp.pct > 20 && temp.pct < 80, `pct=${temp?.pct}`);
  add('verglichen wird nur mit derselben Tageszeit — nicht mit der ganzen Reihe',
    pNoon?.refHourUtc === 13 && (temp?.n ?? 0) <= (PROFILE_REF_DAYS + 1) * (2 * PROFILE_HOUR_SLACK + 1),
    `n=${temp?.n}`);
  add('die Brandstunde zählt nicht in ihrer eigenen Vergleichsmenge',
    (temp?.n ?? 0) > 0 && base.filter((h) => h.atMs === noonMs).length === 1
    && (temp?.n ?? 0) < base.length);

  // --- Richtung stimmt -----------------------------------------------------
  const hot = synthetic(PROFILE_REF_DAYS + 1, noonMs, (h) => {
    if (h.atMs === noonMs) { h.tempC = 40; h.rhPct = 12; h.windKmh = 45; h.gustKmh = 80; h.soilM3 = 0.05; }
  });
  const pHot = buildFireProfile(hot, noonMs);
  const outward = (k: string) => pHot?.axes.find((a) => a.key === k)?.pct ?? -1;
  add('heiß, trocken, windig, Boden trocken ⇒ alle fünf Achsen ganz außen',
    outward('temp') === 100 && outward('rh') === 100 && outward('wind') === 100
    && outward('gust') === 100 && outward('soil') === 100);
  add('ISI wird über die ganze Reihe gerechnet (Vorlauf) und steht mit außen',
    outward('isi') >= 90, `isi=${outward('isi')}`);

  const wet = synthetic(PROFILE_REF_DAYS + 1, noonMs, (h) => {
    if (h.atMs === noonMs) { h.tempC = 4; h.rhPct = 99; h.windKmh = 1; h.gustKmh = 2; h.soilM3 = 0.45; }
  });
  const pWet = buildFireProfile(wet, noonMs);
  const inward = (k: string) => pWet?.axes.find((a) => a.key === k)?.pct ?? -1;
  add('kühl, feucht, windstill ⇒ dieselben Achsen ganz innen',
    inward('temp') === 0 && inward('rh') === 0 && inward('wind') === 0
    && inward('gust') === 0 && inward('soil') === 0);

  // --- Lücken werden gesagt, nicht gefüllt --------------------------------
  const thin = synthetic(3, noonMs);
  const pThin = buildFireProfile(thin, noonMs);
  add('zu wenige Vergleichsstunden ⇒ kein Rang, aber der Rohwert bleibt',
    pThin != null && pThin.axes.every((a) => a.pct === null)
    && pThin.axes.find((a) => a.key === 'temp')?.value != null
    && pThin.notes.some((n) => /Vergleichsstunden/.test(n)));

  const noSoil = synthetic(PROFILE_REF_DAYS + 1, noonMs, (h) => { h.soilM3 = null; });
  const pNoSoil = buildFireProfile(noSoil, noonMs);
  add('fehlende Bodenfeuchte lässt ihre Achse leer und sagt es — die anderen bleiben',
    pNoSoil?.axes.find((a) => a.key === 'soil')?.pct === null
    && pNoSoil?.axes.find((a) => a.key === 'temp')?.pct != null
    && (pNoSoil?.notes.some((n) => /Bodenfeuchte/.test(n)) ?? false));

  add('ohne passende Stunde am Anker gibt es kein Profil, keine Notlösung',
    buildFireProfile(base, noonMs + 6 * H_MS) === null);
  add('leere Reihe ergibt null',
    buildFireProfile([], noonMs) === null);

  // --- Ehrlichkeit ---------------------------------------------------------
  add('sechs Achsen, jede mit Richtung, Einheit und Satz',
    PROFILE_AXES.length === 6 && PROFILE_AXES.every((a) => a.note.length > 20 && (a.dir === 'high' || a.dir === 'low')));
  add('jede Achse hat eine Kurzform, die in eine schmale Spalte passt',
    PROFILE_AXES.every((a) => a.short.length > 0 && a.short.length <= 7));
  add('die Legende nennt Ort, Tageszeit, Zeitraum und Quelle',
    /diesem Punkt/.test(PROFILE_NOTE) && /Tageszeiten/.test(PROFILE_NOTE)
    && new RegExp(`${PROFILE_REF_DAYS} Tage`).test(PROFILE_NOTE) && /ERA5/.test(PROFILE_NOTE));
  add('die Legende sagt ausdrücklich, dass es kein Klimabezug ist',
    /kein Klimabezug/.test(PROFILE_NOTE));
  add('die Abhängigkeit der Achsen wird ausgesprochen, nicht verschwiegen',
    /nicht unabhängig/.test(PROFILE_DEPENDENCE_NOTE) && /ISI enthält Wind/.test(PROFILE_DEPENDENCE_NOTE));
  add('Rang-Text nennt die Zahl der Vergleichsstunden',
    /92 % der 90 Vergleichsstunden/.test(axisRankText({ ...PROFILE_AXES[0], value: 20, pct: 92, n: 90 })));
  add('ohne Rang wird kein Rang behauptet',
    /kein Rang/.test(axisRankText({ ...PROFILE_AXES[0], value: 20, pct: null, n: 3 })));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
