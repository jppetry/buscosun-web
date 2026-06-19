/**
 * Event-Bewertung: aus dem stündlichen Punktforecast je Kandidatentag eine
 * Tages-Zusammenfassung aggregieren, anlass-bewusst zu einem Score 0..100
 * bewerten und den besten Tag bestimmen.
 *
 * Datenquelle unverändert: `getPointForecast` (DWD/GeoSphere/MeteoSwiss, höhen-
 * korrigiert). Tage ohne ausreichende Vorhersage (z. B. AT/CH jenseits ~60 h)
 * werden ehrlich als „keine Vorhersage" markiert und nicht bewertet.
 */

import type { PointForecast, PointForecastHour } from '../pointForecast/types';
import {
  toISODate, todayISO, planBMetricDef, planBVenueDef,
  type EventQuery, type EventPhase, type TimeWindow, type PresetTuning,
  type PlanBConfig, type PlanBMetric,
} from './eventModel';

export interface DaySummary {
  tMaxC: number; tMinC: number; tMeanC: number;
  /** Niederschlagssumme im Tagfenster (≈ mm). */
  precipSumMm: number;
  /** Stunden mit nennenswertem Regen (> 0,1 mm/h). */
  precipHours: number;
  windMaxMs: number;
  gustMaxMs: number;
  cloudMeanPct: number;
  uvMax: number;
  /** Max./min. gefühlte Temperatur (Heat-Index/Wind-Chill) + mittlere Luftfeuchte (PRE-HOCH-US3/US4). */
  apparentMaxC: number;
  apparentMinC: number;
  humidityMeanPct: number;
  /** Intra-Fenster-Spitzen (WIN-US3): schlimmste einzelne Stunde, nicht das Mittel. */
  precipPeakMmH: number;
  precipPeakHour: number | null;
  gustPeakHour: number | null;
  /** Anzahl Forecast-Stunden, die ins Tagfenster fielen (Daten-Deckung). */
  hoursCount: number;
  /** Mittlere Quellen-Konfidenz 0..1 je relevanter Variable (aus pointForecast). */
  conf: { temperature: number; precipitation: number; wind: number; clouds: number };
}

/** Eine im Eventfenster auffällige Schlechtwetter-Spitze (WIN-US3). */
export interface WindowRisk {
  kind: 'rain' | 'wind';
  label: string;       // „Schauer", „Böen"
  detail: string;      // „0,7 mm/h gegen 16 Uhr"
  severity: 'watch' | 'alert';
}

export type FactorKey = 'precip' | 'temp' | 'wind' | 'cloud';

/** Ein bewertungsrelevanter Wetterfaktor — transparent fürs Vertrauen. */
export interface Factor {
  key: FactorKey;
  label: string;
  /** Anzeigewert, z. B. „0 mm", „22 °C", „57 %". */
  valueText: string;
  /** 0..1 Teilscore (anlass-bezogen). */
  subScore: number;
  /** Gewicht dieses Faktors für den Anlass (höher = wichtiger). */
  weight: number;
  assessment: 'good' | 'ok' | 'bad';
  /** Natürlichsprachiger Baustein für den Begründungssatz. */
  phrase: string;
}

export interface DayResult {
  date: string;                 // ISO yyyy-mm-dd
  summary: DaySummary | null;   // null = keine (ausreichende) Vorhersage
  score: number;                // 0..100 (0 ohne Daten)
  reason: string;               // kurze Einzeiler-Begründung (Bedingungen)
  /** Die einzeln bewerteten Faktoren (leer ohne Daten). */
  factors: Factor[];
  /** Verständlicher Begründungssatz der ausschlaggebenden Faktoren. */
  rationale: string;
  /** Kurzer entscheidender Negativfaktor (leer, wenn kein nennenswerter). */
  downside: string;
  /** Verlässlichkeit der Empfehlung 0..1 (Quellen-Einigkeit × Vorlauf). 0 ohne Daten. */
  confidence: number;
  /** Kurzbegründung der Konfidenz, z. B. „Quellen einig · 1 Tag Vorlauf". */
  confidenceNote: string;
  /** Lead-unabhängige Quellen-Einigkeit 0..1 (für Frist-Berechnung, PLANB-US4). */
  forecastConf: number;
  /** Jenseits des verlässlichen Horizonts → als Tendenz lesen, nicht als feste Prognose (KONF-US3). */
  isTendency: boolean;
  /** Einzelbewertung je Phase (WIN-US2). Bei einer Phase == Tagesaggregat. */
  phases: PhaseResult[];
  /** Im Eventfenster hervorzuhebende Schlechtwetter-Spitzen (WIN-US3). */
  risks: WindowRisk[];
  isBest: boolean;
}

/** Bewertung einer einzelnen Phase (eigenes Zeitfenster). */
export interface PhaseResult {
  label: string;
  hours: [number, number];
  summary: DaySummary | null;
  score: number;
  reason: string;
  factors: Factor[];
  downside: string;
  rationale: string;
  confidence: number;
  confidenceNote: string;
  /** Lead-unabhängige Quellen-Einigkeit 0..1 (PLANB-US4). */
  forecastConf: number;
  isTendency: boolean;
  /** Intra-Fenster-Risiken dieser Phase (WIN-US3). */
  risks: WindowRisk[];
}

export interface EventRecommendation {
  days: DayResult[];
  /** Index des besten Tags in `days`, oder -1 wenn keiner bewertbar war. */
  bestIndex: number;
  scorableCount: number;
}

// --- Anlass-Profile (Wetter-Präferenzen) --------------------------------------

interface ActivityProfile {
  idealTemp: [number, number];
  weights: { precip: number; temp: number; wind: number; cloud: number };
  /** 'low' = Sonne erwünscht (Bewölkung straft), 'any' = Bewölkung kaum relevant,
   *  'soft' = Lichtstimmung (weiches/dramatisches Wolkenlicht > wolkenlos, Foto). */
  cloudPref: 'low' | 'any' | 'soft';
  /** Tag (8–20 Uhr) oder Abend/Nacht (18–23 Uhr, z. B. Sterne schauen). */
  window: 'day' | 'night';
}

const PROFILES: Record<string, ActivityProfile> = {
  hiking:     { idealTemp: [12, 22], weights: { precip: 1.0, temp: 0.6, wind: 0.4, cloud: 0.25 }, cloudPref: 'any', window: 'day' },
  cycling:    { idealTemp: [12, 24], weights: { precip: 1.0, temp: 0.5, wind: 0.7, cloud: 0.2 }, cloudPref: 'any', window: 'day' },
  bbq:        { idealTemp: [19, 30], weights: { precip: 1.0, temp: 0.7, wind: 0.5, cloud: 0.5 }, cloudPref: 'low', window: 'day' },
  photo:      { idealTemp: [2, 28], weights: { precip: 0.7, temp: 0.15, wind: 0.25, cloud: 1.0 }, cloudPref: 'soft', window: 'day' },
  picnic:     { idealTemp: [17, 28], weights: { precip: 1.0, temp: 0.7, wind: 0.5, cloud: 0.45 }, cloudPref: 'low', window: 'day' },
  running:    { idealTemp: [5, 17], weights: { precip: 0.8, temp: 0.6, wind: 0.4, cloud: 0.15 }, cloudPref: 'any', window: 'day' },
  swimming:   { idealTemp: [24, 34], weights: { precip: 0.8, temp: 1.0, wind: 0.4, cloud: 0.6 }, cloudPref: 'low', window: 'day' },
  stargazing: { idealTemp: [0, 30], weights: { precip: 0.9, temp: 0.15, wind: 0.2, cloud: 1.0 }, cloudPref: 'low', window: 'night' },
};
const DEFAULT_PROFILE: ActivityProfile = { idealTemp: [14, 26], weights: { precip: 1.0, temp: 0.5, wind: 0.4, cloud: 0.3 }, cloudPref: 'any', window: 'day' };

function profileFor(activityId: string): ActivityProfile {
  return PROFILES[activityId] ?? DEFAULT_PROFILE;
}

/** Standard-Tuning eines Anlasses (PRE-US2): die unveränderten Preset-Vorgaben. */
export function defaultTuningFor(activityId: string): PresetTuning {
  const p = profileFor(activityId);
  return { idealTemp: [p.idealTemp[0], p.idealTemp[1]], weights: { ...p.weights } };
}

/** Effektives Profil = Preset-Basis (cloudPref/window) mit ggf. justierten Schwellwerten. */
function effectiveProfile(activityId: string, tuning?: PresetTuning): ActivityProfile {
  const base = profileFor(activityId);
  if (!tuning) return base;
  return { ...base, idealTemp: tuning.idealTemp, weights: tuning.weights };
}

/** Ein für den Anlass automatisch berücksichtigter Faktor (PRE-US1). */
export interface FactorPriority {
  key: FactorKey;
  label: string;
  weight: number;
}

function tempPriorityLabel(idealTemp: [number, number]): string {
  const [lo, hi] = idealTemp;
  if (lo >= 18) return 'Wärme';
  if (hi <= 17) return 'kühle Luft';
  return 'milde Temperatur';
}

/**
 * Die für einen Anlass typischen Faktoren — direkt aus seinem Scoring-Profil
 * abgeleitet (NICHT handgepflegt), nach Wichtigkeit sortiert. So sieht der Nutzer,
 * was das Preset automatisch bewertet, ohne etwas einstellen zu müssen.
 */
export function activityFactorPriorities(activityId: string, tuning?: PresetTuning): FactorPriority[] {
  const base = profileFor(activityId);
  const weights = tuning?.weights ?? base.weights;
  const idealTemp = tuning?.idealTemp ?? base.idealTemp;
  const cloudLabel = base.cloudPref === 'soft'
    ? 'reizvolle Lichtstimmung'
    : base.cloudPref === 'low'
    ? (base.window === 'night' ? 'klarer Himmel' : 'Sonne')
    : 'gute Sicht';
  const items: FactorPriority[] = [
    { key: 'precip', label: 'Trockenheit', weight: weights.precip },
    { key: 'temp', label: tempPriorityLabel(idealTemp), weight: weights.temp },
    { key: 'wind', label: 'wenig Wind', weight: weights.wind },
    { key: 'cloud', label: cloudLabel, weight: weights.cloud },
  ];
  return items.filter((f) => f.weight >= 0.3).sort((a, b) => b.weight - a.weight);
}

// --- Kandidatentage ------------------------------------------------------------

/** Expandiert das Zeitfenster zu einer sortierten Liste konkreter Tage (ISO). */
export function candidateDays(w: TimeWindow): string[] {
  if (w.mode === 'dates') return [...w.dates].sort();
  const out: string[] = [];
  const end = new Date(`${w.to}T00:00:00`);
  for (let d = new Date(`${w.from}T00:00:00`); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(toISODate(d));
  }
  return out;
}

/** Wie viele Forecast-Stunden braucht es, um den letzten Kandidatentag (inkl. spätester Phase) abzudecken? */
export function hoursNeededFor(dates: string[], latestHour = 20): number {
  if (dates.length === 0) return 24;
  const end = new Date(`${dates[dates.length - 1]}T00:00:00`).getTime() + latestHour * 3_600_000;
  const h = Math.ceil((end - Date.now()) / 3_600_000) + 2;
  return Math.max(24, Math.min(180, h));
}

// --- Aggregation + Scoring -----------------------------------------------------

const isNum = (x: number | null | undefined): x is number => x != null && Number.isFinite(x);
const avg = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;

function aggregateDay(hours: PointForecastHour[], date: string, win: [number, number]): DaySummary | null {
  // Über-Mitternacht-Fenster (Kernnacht): Stunden ≥ start an `date` PLUS Stunden
  // < end am Folgetag zählen zum selben Event-Fenster.
  const wrap = win[0] >= win[1];
  const nextDate = wrap ? toISODate(new Date(new Date(`${date}T00:00:00`).getTime() + 86_400_000)) : '';
  const inDay = hours.filter((h) => {
    const hr = h.timestamp.getHours();
    const d = toISODate(h.timestamp);
    if (!wrap) return d === date && hr >= win[0] && hr < win[1];
    return (d === date && hr >= win[0]) || (d === nextDate && hr < win[1]);
  });
  const temps = inDay.map((h) => h.temperature).filter(isNum);
  if (temps.length < 2) return null; // zu wenig Daten → nicht bewertbar

  const precipVals = inDay.map((h) => h.precipitation ?? 0);
  const gusts = inDay.map((h) => h.gustSpeed ?? h.windSpeed).filter(isNum);
  const winds = inDay.map((h) => h.windSpeed).filter(isNum);
  const clouds = inDay.map((h) => h.cloudCoverTotal).filter(isNum);
  const uvs = inDay.map((h) => h.uvIndex).filter(isNum);
  const apps = inDay.map((h) => h.apparentTemperature ?? h.temperature).filter(isNum);
  const hums = inDay.map((h) => h.relativeHumidity).filter(isNum);

  // Intra-Fenster-Spitzen: die schlimmste einzelne Stunde (WIN-US3) — auch wenn
  // das Fenster-Mittel harmlos aussieht.
  let precipPeakMmH = 0, precipPeakHour: number | null = null;
  let gustPeak = 0, gustPeakHour: number | null = null;
  for (const h of inDay) {
    const p = h.precipitation ?? 0;
    if (p > precipPeakMmH) { precipPeakMmH = p; precipPeakHour = h.timestamp.getHours(); }
    const g = h.gustSpeed ?? h.windSpeed;
    if (isNum(g) && g > gustPeak) { gustPeak = g; gustPeakHour = h.timestamp.getHours(); }
  }

  return {
    tMaxC: Math.max(...temps), tMinC: Math.min(...temps), tMeanC: avg(temps),
    precipSumMm: precipVals.reduce((s, v) => s + v, 0),
    precipHours: precipVals.filter((p) => p > 0.1).length,
    windMaxMs: winds.length ? Math.max(...winds) : 0,
    gustMaxMs: gusts.length ? Math.max(...gusts) : 0,
    cloudMeanPct: clouds.length ? avg(clouds) : 50,
    uvMax: uvs.length ? Math.max(...uvs) : 0,
    apparentMaxC: apps.length ? Math.max(...apps) : Math.max(...temps),
    apparentMinC: apps.length ? Math.min(...apps) : Math.min(...temps),
    humidityMeanPct: hums.length ? avg(hums) : 50,
    precipPeakMmH, precipPeakHour, gustPeakHour,
    hoursCount: inDay.length,
    conf: {
      temperature: avg(inDay.map((h) => h.confidence.temperature)),
      precipitation: avg(inDay.map((h) => h.confidence.precipitation)),
      wind: avg(inDay.map((h) => h.confidence.wind)),
      clouds: avg(inDay.map((h) => h.confidence.clouds)),
    },
  };
}

const assess = (sub: number): 'good' | 'ok' | 'bad' => (sub >= 0.72 ? 'good' : sub >= 0.45 ? 'ok' : 'bad');

/**
 * Lichtqualität für die Fotografie (PRE-FOTO-US1): wolkenloser Himmel liefert
 * hartes, kontrastreiches Licht (mäßig), teils bewölkt reizvolles/dramatisches
 * Licht (top), Bedeckung weiches Porträtlicht (sehr gut). Reine Sonne ≠ bestes Licht.
 */
function lightQuality(cloud: number): number {
  if (cloud <= 15) return 0.5;                                  // wolkenlos — hartes Licht
  if (cloud <= 35) return 0.5 + ((cloud - 15) / 20) * 0.5;      // 0.5 → 1.0
  if (cloud <= 75) return 1.0;                                  // teils/überwiegend bewölkt — Top-Licht
  return 1.0 - ((cloud - 75) / 25) * 0.2;                       // 1.0 → 0.8 (flau bedeckt)
}

/**
 * Bewertet einen Tag anlass-bewusst und legt dabei die einzelnen Faktoren offen.
 * Score = gewichteter Mittelwert der Teilscores (0..100). Die `phrase`-Bausteine
 * beschreiben die Werte natürlichsprachig für die Begründung (US4).
 */
function evaluateDay(s: DaySummary, p: ActivityProfile): { score: number; factors: Factor[]; downside: string; forecastConf: number } {
  // Trockenheit: Niederschlagssumme + Regenstunden gaußförmig/exp abstrafen.
  const precipSub = Math.exp(-s.precipSumMm / 5) * Math.exp(-s.precipHours / 6);
  // Temperatur-Komfort: 1 im Wohlfühlbereich, sanft abfallend (σ ≈ 6 °C).
  const [lo, hi] = p.idealTemp;
  const off = s.tMeanC < lo ? lo - s.tMeanC : s.tMeanC > hi ? s.tMeanC - hi : 0;
  const tempSub = Math.exp(-(off * off) / (2 * 36));
  // Wind: Böen bis ~6 m/s unproblematisch, darüber abfallend.
  const windSub = Math.exp(-Math.max(0, s.gustMaxMs - 6) / 8);
  // Bewölkung: 'low' = Sonne erwünscht; 'any' = milde Vorliebe; 'soft' = Lichtstimmung
  // (weiches/dramatisches Wolkenlicht schlägt wolkenlosen Himmel — PRE-FOTO-US1).
  const clear = (100 - s.cloudMeanPct) / 100;
  const cloudSub = p.cloudPref === 'low' ? clear
    : p.cloudPref === 'soft' ? lightQuality(s.cloudMeanPct)
    : 0.5 + 0.5 * clear;

  const tMax = Math.round(s.tMaxC);
  const mm = s.precipSumMm.toFixed(1).replace('.', ',');
  // Foto-Lichtfaktor: Wert + Phrase beschreiben die Lichtstimmung statt „Sonne".
  const soft = p.cloudPref === 'soft';
  const cloudValue = soft ? (s.cloudMeanPct < 20 ? 'hart' : s.cloudMeanPct < 75 ? 'dramatisch' : 'weich') : `${Math.round(s.cloudMeanPct)} %`;
  const cloudPhrase = soft
    ? (s.cloudMeanPct < 20 ? 'hartes Licht (wolkenlos)' : s.cloudMeanPct < 75 ? 'reizvolle Lichtstimmung' : 'weiches Licht (bedeckt)')
    : (s.cloudMeanPct < 25 ? 'viel Sonne' : s.cloudMeanPct < 50 ? 'überwiegend sonnig' : s.cloudMeanPct < 70 ? 'wechselnd bewölkt' : 'stark bewölkt');
  const factors: Factor[] = [
    {
      key: 'precip', label: 'Niederschlag', weight: p.weights.precip, subScore: precipSub, assessment: assess(precipSub),
      valueText: s.precipSumMm < 0.1 ? '0 mm' : `${mm} mm`,
      phrase: s.precipSumMm < 0.1 ? 'durchgehend trocken' : s.precipSumMm < 1 ? 'nahezu trocken' : s.precipSumMm < 4 ? `etwas Regen (${mm} mm)` : `viel Regen (${mm} mm)`,
    },
    {
      key: 'temp', label: 'Temperatur', weight: p.weights.temp, subScore: tempSub, assessment: assess(tempSub),
      valueText: `${tMax} °C`,
      phrase: tempSub >= 0.72 ? `angenehme ${tMax} °C` : s.tMeanC < lo ? `frische ${tMax} °C` : `warme ${tMax} °C`,
    },
    {
      key: 'wind', label: 'Wind', weight: p.weights.wind, subScore: windSub, assessment: assess(windSub),
      valueText: `${Math.round(s.windMaxMs)} m/s`,
      phrase: s.gustMaxMs < 8 ? 'kaum Wind' : s.gustMaxMs < 14 ? 'mäßiger Wind' : `kräftiger Wind (Böen ${Math.round(s.gustMaxMs)})`,
    },
    {
      key: 'cloud', label: soft ? 'Licht' : 'Bewölkung', weight: p.weights.cloud, subScore: cloudSub, assessment: assess(cloudSub),
      valueText: cloudValue,
      phrase: cloudPhrase,
    },
  ];

  // Entscheidender Negativfaktor (US5): das größte gewichtete Defizit unter den
  // nennenswert gewichteten, nicht-guten Faktoren — negativ formuliert.
  const neg = factors
    .filter((f) => f.weight >= 0.2 && f.assessment !== 'good')
    .sort((a, b) => b.weight * (1 - b.subScore) - a.weight * (1 - a.subScore))[0];
  const downside = neg ? negText(neg.key, s, p, tMax, mm) : '';

  const w = p.weights;
  const total = w.precip * precipSub + w.temp * tempSub + w.wind * windSub + w.cloud * cloudSub;
  const wsum = w.precip + w.temp + w.wind + w.cloud;
  const score = Math.max(0, Math.min(100, Math.round((100 * total) / wsum)));

  // Anlass-gewichtete Quellen-Konfidenz (gleiche Gewichte wie der Score).
  const c = s.conf;
  const forecastConf = (w.precip * c.precipitation + w.temp * c.temperature + w.wind * c.wind + w.cloud * c.clouds) / wsum;
  return { score, factors, downside, forecastConf };
}

/** Kurzer, klar negativ formulierter Bremsfaktor (richtungs-/wertebewusst). */
function negText(key: FactorKey, s: DaySummary, p: ActivityProfile, tMax: number, mm: string): string {
  switch (key) {
    case 'precip': return s.precipSumMm >= 4 ? `viel Regen (${mm} mm)` : `etwas Regen (${mm} mm)`;
    case 'temp': return s.tMeanC < p.idealTemp[0] ? `zu kühl (${tMax}°)` : `zu warm (${tMax}°)`;
    case 'wind': return `windig (Böen ${Math.round(s.gustMaxMs)} m/s)`;
    case 'cloud': return p.cloudPref === 'soft'
      ? (s.cloudMeanPct < 20 ? 'hartes Klarlicht' : 'flau bedeckt')
      : (s.cloudMeanPct >= 70 ? 'stark bewölkt' : 'oft bewölkt');
  }
}

/** Reiht deutsche Aufzählungsglieder: „a", „a und b", „a, b und c". */
function joinDE(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} und ${parts[parts.length - 1]}`;
}

/**
 * Verständlicher Begründungssatz (US4): nennt die ausschlaggebenden (stark
 * gewichteten, gut bewerteten) Faktoren und benennt ehrlich den größten Abzug.
 */
export function explainDay(factors: Factor[], activityLabel: string): string {
  const relevant = factors.filter((f) => f.weight >= 0.2);
  const positives = relevant.filter((f) => f.assessment === 'good').sort((a, b) => b.weight - a.weight);
  const weakest = [...relevant].sort((a, b) => a.subScore - b.subScore)[0];

  let text: string;
  if (positives.length) {
    text = `${capFirst(joinDE(positives.slice(0, 3).map((f) => f.phrase)))} — passt zu ${activityLabel}.`;
  } else {
    // Kein Faktor klar „gut" → ehrlich die beste verfügbare Eigenschaft nennen.
    const best = [...relevant].sort((a, b) => b.subScore - a.subScore)[0];
    text = `${capFirst(best ? best.phrase : 'durchwachsene Bedingungen')}, aber kein idealer Tag für ${activityLabel}.`;
  }
  if (weakest && weakest.assessment !== 'good' && !positives.includes(weakest)) {
    const lead = weakest.assessment === 'bad' ? 'Schwachpunkt' : 'Kleiner Abzug';
    text += ` ${lead}: ${weakest.phrase}.`;
  }
  return text;
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

// --- Konfidenz (KONF-US1) ------------------------------------------------------

/** Tage seit heute (0 = heute) für ein ISO-Datum. */
function daysAhead(date: string): number {
  const today = new Date(`${todayISO()}T00:00:00`).getTime();
  const d = new Date(`${date}T00:00:00`).getTime();
  return Math.round((d - today) / 86_400_000);
}

/**
 * Vorhersage-Skill nach Vorlauf — der dominante, intuitive Verlässlichkeits-
 * faktor: morgen ist verlässlicher als in 7 Tagen. Sanfter Abfall, Floor 0.35.
 */
function leadSkill(days: number): number {
  return Math.max(0.35, Math.min(0.97, 1 - Math.max(0, days) * 0.085));
}

/** Datenabdeckung des Tagfensters: weniger Stunden → unsicherer Tagesschnitt. */
function coverageFactor(hoursCount: number, windowHours: number): number {
  return 0.7 + 0.3 * Math.min(1, hoursCount / Math.max(1, windowHours));
}

/**
 * Quellen-Einigkeits-Modifikator (±15 %) aus der internen pointForecast-
 * Konfidenz — die intern bereits lead-gedämpft ist, daher hier nur als milder,
 * gedeckelter Faktor (kein Doppelzählen des Vorlaufs).
 */
function agreementMod(forecastConf: number): number {
  return 0.85 + 0.15 * Math.max(0, Math.min(1, forecastConf / 0.5));
}

/** Verlässlichkeit 0..1 = Vorlauf-Skill × Abdeckung × Quellen-Einigkeit. */
function dayConfidence(forecastConf: number, date: string, hoursCount: number, windowHours: number): number {
  const c = leadSkill(daysAhead(date)) * coverageFactor(hoursCount, windowHours) * agreementMod(forecastConf);
  return Math.max(0, Math.min(1, c));
}

/** Kurzbegründung der Konfidenz aus Vorlauf + Quellen-Lage. */
function confidenceNoteFor(forecastConf: number, date: string): string {
  const d = daysAhead(date);
  const lead = d <= 0 ? 'für heute' : d === 1 ? '1 Tag Vorlauf' : `${d} Tage Vorlauf`;
  const agree = forecastConf >= 0.4 ? 'Quellen einig' : forecastConf >= 0.28 ? 'Quellen weitgehend einig' : 'Modell noch unsicher';
  return `${lead} · ${agree}`;
}

/**
 * Wettersicherheit (PRE-HOCH-US5): Bewertung × Verlässlichkeit. Demotet unsichere
 * Tage, damit beim Termin-Vergleich der robusteste statt des riskantesten gewinnt.
 */
export function safetyScore(score: number, confidence: number): number {
  return Math.round(score * (0.55 + 0.45 * Math.max(0, Math.min(1, confidence))));
}

/** Konfidenz-Stufe + Label für die Anzeige. */
export function confidenceTier(c: number): { band: 'high' | 'medium' | 'low'; label: string } {
  if (c >= 0.7) return { band: 'high', label: 'Hoch' };
  if (c >= 0.45) return { band: 'medium', label: 'Mittel' };
  return { band: 'low', label: 'Gering' };
}

/**
 * Verlässlicher Horizont (KONF-US3): unterhalb dieser Konfidenz ist eine Aussage
 * keine belastbare Prognose mehr, sondern nur noch grobe Tendenz. Schützt vor
 * Scheingenauigkeit für weit entfernte Tage.
 */
export const RELIABLE_CONFIDENCE = 0.55;
export function isTendencyConfidence(c: number): boolean {
  return c < RELIABLE_CONFIDENCE;
}

/**
 * Intra-Fenster-Risiken (WIN-US3): hebt ungünstige Bedingungen GENAU im Fenster
 * hervor, auch wenn das Fenster-Mittel harmlos ist (kurzer Schauer, einzelne
 * Böe). Bewusst peak-basiert — nicht vom Mittel geglättet.
 */
export function windowRisks(s: DaySummary): WindowRisk[] {
  const risks: WindowRisk[] = [];
  if (s.precipPeakMmH >= 0.4 && s.precipPeakHour != null) {
    const mm = s.precipPeakMmH.toFixed(1).replace('.', ',');
    risks.push({
      kind: 'rain', label: 'Schauer',
      detail: `${mm} mm/h gegen ${s.precipPeakHour} Uhr`,
      severity: s.precipPeakMmH >= 1.5 ? 'alert' : 'watch',
    });
  }
  if (s.gustMaxMs >= 12 && s.gustPeakHour != null) {
    risks.push({
      kind: 'wind', label: 'Böen',
      detail: `bis ${Math.round(s.gustMaxMs)} m/s gegen ${s.gustPeakHour} Uhr`,
      severity: s.gustMaxMs >= 18 ? 'alert' : 'watch',
    });
  }
  return risks;
}

/** Gesondertes Regenrisiko für ein Fenster (PRE-HOCH-US1) — z. B. die Trauung. */
export interface RainRisk {
  level: 'none' | 'low' | 'moderate' | 'high';
  label: string;
  detail: string;
}

/** Bewertet das Regenrisiko genau in einem Fenster (peak- + summenbasiert). */
export function rainRiskFor(s: DaySummary): RainRisk {
  const sum = s.precipSumMm, peak = s.precipPeakMmH, wet = s.precipHours;
  if (sum < 0.1 && peak < 0.1) {
    return { level: 'none', label: 'Kein Regen erwartet', detail: 'durchgehend trocken im Fenster' };
  }
  const level: RainRisk['level'] =
    peak >= 1.5 || sum >= 4 ? 'high' :
    peak >= 0.5 || sum >= 1.5 ? 'moderate' : 'low';
  const mm = sum.toFixed(1).replace('.', ',');
  const parts = [sum < 0.1 ? 'Tröpfeln möglich' : `${mm} mm erwartet`];
  if (peak >= 0.3 && s.precipPeakHour != null) parts.push(`Spitze ${peak.toFixed(1).replace('.', ',')} mm/h gegen ${s.precipPeakHour} Uhr`);
  if (wet > 0) parts.push(`${wet} h nass`);
  const label = level === 'high' ? 'Hohes Regenrisiko' : level === 'moderate' ? 'Erhöhtes Regenrisiko' : 'Geringes Regenrisiko';
  return { level, label, detail: parts.join(' · ') };
}

/** Wind-Gefahr fürs Eventfenster (PRE-HOCH-US2) — Deko/Zelt/Frisur. */
export interface WindHazard {
  level: 'fresh' | 'strong' | 'storm';
  label: string;
  gust: number;
  /** Was bedroht ist. */
  affects: string[];
  /** Konkreter Tipp. */
  tip: string;
}

/**
 * Bewertet kritischen Wind im Fenster mit hochzeits-sensiblen Schwellen:
 * schon eine frische Brise (~8 m/s) gefährdet Frisur und lose Deko.
 */
export function windHazardFor(s: DaySummary): WindHazard | null {
  const g = s.gustMaxMs;
  if (g < 8) return null;
  if (g < 13) return { level: 'fresh', label: 'Auffrischender Wind', gust: g, affects: ['Frisur', 'lose Deko'], tip: 'Haarspray & beschwerte Tischdeko einplanen.' };
  if (g < 18) return { level: 'strong', label: 'Kräftiger Wind', gust: g, affects: ['Frisur', 'Deko', 'Pavillon'], tip: 'Pavillon verankern, Deko beschweren, Frisur fixieren.' };
  return { level: 'storm', label: 'Sturmböen', gust: g, affects: ['Zelt/Pavillon', 'Deko', 'Frisur'], tip: 'Zelt-/Pavillon-Aufbau kritisch — Plan B (innen) bereithalten.' };
}

/** Hitze-/Schwüle-Gefahr fürs Eventfenster (PRE-HOCH-US3) — Gäste & Catering. */
export interface HeatHazard {
  level: 'warm' | 'hot' | 'severe';
  /** Schwül = hohe Luftfeuchte bei Wärme. */
  muggy: boolean;
  label: string;
  /** Gefühlte Spitzentemperatur. */
  feels: number;
  affects: string[];
  tip: string;
}

/**
 * Bewertet kritische Hitze im Fenster über die GEFÜHLTE Temperatur (Heat-Index,
 * der die Luftfeuchte/Schwüle bereits einbezieht). Ab „warm" relevant für Gäste
 * in festlicher Kleidung und temperaturempfindliches Catering.
 */
export function heatHazardFor(s: DaySummary): HeatHazard | null {
  const feels = s.apparentMaxC;
  if (feels < 28) return null;
  const muggy = s.humidityMeanPct >= 60 && s.tMaxC >= 24;
  const level: HeatHazard['level'] = feels >= 36 ? 'severe' : feels >= 32 ? 'hot' : 'warm';
  const base = level === 'severe' ? 'Sehr heiß' : level === 'hot' ? 'Heiß' : 'Warm';
  const label = muggy ? `${base} & schwül` : base;
  const tip = level === 'severe'
    ? 'Schattenzelt & viel Wasser bereitstellen, empfindliche Speisen durchgehend kühlen.'
    : level === 'hot'
    ? 'Schattenplätze, reichlich Getränke und gekühltes Catering einplanen.'
    : 'Schatten und Wasser für die Gäste bereithalten.';
  return { level, muggy, label, feels, affects: ['Gäste', 'Catering'], tip };
}

/** Kälte-Gefahr fürs Abendfenster (PRE-HOCH-US4) — Heizpilze/Decken. */
export interface ColdHazard {
  level: 'cool' | 'cold' | 'frosty';
  label: string;
  /** Niedrigste gefühlte Temperatur (Wind-Chill). */
  feels: number;
  tip: string;
}

/** Bewertet niedrige gefühlte Abendtemperatur (ab < 14 °C gefühlt relevant). */
export function coldHazardFor(s: DaySummary): ColdHazard | null {
  const feels = s.apparentMinC;
  if (feels >= 14) return null;
  const level: ColdHazard['level'] = feels < 5 ? 'frosty' : feels < 10 ? 'cold' : 'cool';
  const label = level === 'frosty' ? 'Sehr kalt' : level === 'cold' ? 'Kalt' : 'Kühl';
  const tip = level === 'frosty'
    ? 'Heizpilze und warme Decken einplanen, Innenbereich bereithalten.'
    : level === 'cold'
    ? 'Heizpilze oder Decken für die Gäste bereitstellen.'
    : 'An Decken für kältefühlige Gäste denken.';
  return { level, label, feels, tip };
}

/** Kurze, auf-einen-Blick-Begründung aus der Tages-Zusammenfassung. */
export function reasonFor(s: DaySummary): string {
  const parts: string[] = [];
  parts.push(s.precipSumMm < 0.3 ? 'trocken' : s.precipSumMm < 3 ? 'meist trocken' : `${s.precipSumMm.toFixed(1)} mm Regen`);
  parts.push(`${Math.round(s.tMaxC)}°`);
  parts.push(s.cloudMeanPct < 30 ? 'sonnig' : s.cloudMeanPct < 65 ? 'heiter' : 'bewölkt');
  if (s.gustMaxMs >= 12) parts.push('windig');
  return parts.join(' · ');
}

/** Bewertet eine einzelne Phase (nur ihr Stundenfenster). */
function evaluatePhase(forecast: PointForecast, date: string, phase: EventPhase, profile: ActivityProfile, activityLabel: string): PhaseResult {
  const win = phase.hours;
  const summary = aggregateDay(forecast.hours, date, win);
  if (!summary) {
    return { label: phase.label, hours: win, summary: null, score: 0, reason: 'keine Vorhersage', factors: [], downside: '', rationale: '', confidence: 0, confidenceNote: '', forecastConf: 0, isTendency: false, risks: [] };
  }
  const { score, factors, downside, forecastConf } = evaluateDay(summary, profile);
  const windowHours = win[0] >= win[1] ? 24 - win[0] + win[1] : win[1] - win[0];
  const confidence = dayConfidence(forecastConf, date, summary.hoursCount, windowHours);
  return {
    label: phase.label, hours: win, summary, score, reason: reasonFor(summary), factors,
    downside, rationale: explainDay(factors, activityLabel),
    confidence, confidenceNote: confidenceNoteFor(forecastConf, date), forecastConf,
    isTendency: isTendencyConfidence(confidence),
    risks: windowRisks(summary),
  };
}

/** Fasst Risiken mehrerer Phasen zusammen (je Art die schwerste). */
function mergeRisks(lists: WindowRisk[][]): WindowRisk[] {
  const byKind = new Map<string, WindowRisk>();
  for (const r of lists.flat()) {
    const cur = byKind.get(r.kind);
    if (!cur || (r.severity === 'alert' && cur.severity !== 'alert')) byKind.set(r.kind, r);
  }
  return [...byKind.values()];
}

/** Tages-Begründung, die die Phasen zusammenfasst (Engpass benennen). */
function dayRationaleFor(scorable: PhaseResult[], activityLabel: string): string {
  if (scorable.length === 1) return scorable[0].rationale;
  const bn = scorable.reduce((a, b) => (b.score < a.score ? b : a));
  if (bn.score >= 70) return `Alle ${scorable.length} Phasen passen zu ${activityLabel} — am knappsten: ${bn.label}.`;
  const why = bn.downside || lowerFirst(reasonFor(bn.summary!));
  return `Engpass ${bn.label}: ${why}. Andere Phasen besser.`;
}

/** Bewertet alle Kandidatentage und kürt genau einen besten. */
export function recommendBestDay(query: EventQuery, forecast: PointForecast): EventRecommendation {
  const dates = candidateDays(query.window);
  // PRE-US2: ggf. feinjustierte Schwellwerte statt der reinen Preset-Vorgaben.
  const profile = effectiveProfile(query.activity.id, query.tuning);

  const days: DayResult[] = dates.map((date) => {
    // WIN-US2: jede Phase einzeln bewerten …
    const phases = query.phases.map((p) => evaluatePhase(forecast, date, p, profile, query.activity.label));
    const scorable = phases.filter((p) => p.summary);
    if (!scorable.length) {
      return { date, summary: null, score: 0, reason: 'keine Vorhersage', factors: [], rationale: '', downside: '', confidence: 0, confidenceNote: '', forecastConf: 0, isTendency: false, phases, risks: [], isBest: false };
    }
    // … der Tag fasst zusammen: nur so gut wie die schwächste Phase (Engpass).
    const bottleneck = scorable.reduce((a, b) => (b.score < a.score ? b : a));
    const leastConf = scorable.reduce((a, b) => (b.confidence < a.confidence ? b : a));
    const confidence = leastConf.confidence;
    return {
      date,
      summary: bottleneck.summary,
      score: bottleneck.score,
      reason: bottleneck.reason,
      factors: bottleneck.factors,
      rationale: dayRationaleFor(scorable, query.activity.label),
      downside: bottleneck.downside,
      confidence,
      confidenceNote: leastConf.confidenceNote,
      forecastConf: leastConf.forecastConf,
      isTendency: isTendencyConfidence(confidence),
      phases,
      risks: mergeRisks(scorable.map((p) => p.risks)),
      isBest: false,
    };
  });

  let bestIndex = -1, bestScore = -1;
  days.forEach((d, i) => { if (d.summary && d.score > bestScore) { bestScore = d.score; bestIndex = i; } });
  if (bestIndex >= 0) days[bestIndex].isBest = true;

  return { days, bestIndex, scorableCount: days.filter((d) => d.summary).length };
}

// --- Plan B / Ausweich-Logik (Epic PLANB) -------------------------------------

const MS_DAY = 86_400_000;
function addDaysISO(iso: string, n: number): string {
  return toISODate(new Date(new Date(`${iso}T00:00:00`).getTime() + n * MS_DAY));
}
function formatDayShort(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Aktueller Wert der Plan-B-Metrik für einen Tag. */
export function planBMetricValue(day: DayResult, metric: PlanBMetric): number {
  if (!day.summary) return metric === 'score' ? 0 : 0;
  switch (metric) {
    case 'rain': return day.summary.precipSumMm;
    case 'wind': return day.summary.gustMaxMs;
    case 'score': return day.score;
  }
}

/** Überschreitet ein Tag die Plan-B-Schwelle? (PLANB-US1) */
export function dayBreachesThreshold(day: DayResult, planB: PlanBConfig): boolean {
  if (!day.summary) return false;
  const def = planBMetricDef(planB.metric);
  const v = planBMetricValue(day, planB.metric);
  return def.direction === 'above' ? v >= planB.threshold : v < planB.threshold;
}

/** Entscheidungsfenster für eine Plan-B-Entscheidung (PLANB-US4). */
export interface DecisionWindow {
  /** Ist die Prognose für den Zieltag JETZT schon belastbar? */
  reliableNow: boolean;
  /** Datum (ISO), ab dem die Prognose belastbar wird (≥ heute). */
  reliableFrom: string;
  /** Späteste sinnvolle Entscheidung (ISO) — Tag vor dem Zieltag (bzw. Zieltag selbst). */
  decideBy: string;
  /** Vorlauf des Zieltags in Tagen ab heute. */
  daysAhead: number;
  /** Lesbarer Hinweis. */
  note: string;
}

/**
 * Bestimmt, ab wann die Prognose für den Zieltag belastbar genug für eine
 * Plan-B-Entscheidung ist (PLANB-US4). Modelliert die Tages-Konfidenz bei
 * abnehmendem Vorlauf (gleicher Kern wie KONF) und sucht den größten Vorlauf,
 * bei dem `RELIABLE_CONFIDENCE` noch erreicht wird.
 */
export function decisionWindow(targetDate: string, forecastConf: number, windowHours: number): DecisionWindow {
  const dAhead = daysAhead(targetDate);
  const cov = coverageFactor(Math.max(1, windowHours), Math.max(1, windowHours)); // volle Deckung
  const confAtLead = (lead: number) => leadSkill(lead) * cov * agreementMod(forecastConf);
  let reliableLead = 0;
  for (let lead = 0; lead <= Math.max(dAhead, 1); lead++) {
    if (confAtLead(lead) >= RELIABLE_CONFIDENCE) reliableLead = lead;
  }
  const today = todayISO();
  const fromCandidate = addDaysISO(targetDate, -reliableLead);
  const reliableFrom = fromCandidate < today ? today : fromCandidate;
  const reliableNow = dAhead <= reliableLead;
  const decideBy = dAhead >= 1 ? addDaysISO(targetDate, -1) : targetDate;
  const note = reliableNow
    ? `Die Prognose für ${formatDayShort(targetDate)} ist bereits belastbar — Plan A/B kann jetzt entschieden werden.`
    : `Belastbar voraussichtlich ab ${formatDayShort(reliableFrom)} · entscheide spätestens am ${formatDayShort(decideBy)}.`;
  return { reliableNow, reliableFrom, decideBy, daysAhead: dAhead, note };
}

/** Ergebnis der Plan-B-Prüfung für einen Bezugstag. */
export interface PlanBAssessment {
  metric: PlanBMetric;
  metricLabel: string;
  /** Schwelle als Text, z. B. „über 3 mm". */
  thresholdText: string;
  /** Bezugstag (ISO). */
  targetDate: string;
  /** Bezugstag-Bewertung (für die UI). */
  targetDay: DayResult;
  /** War es der explizite Wunschtag (sonst der beste Tag)? */
  targetIsWish: boolean;
  /** Aktueller Metrik-Wert + Anzeigetext. */
  value: number;
  valueText: string;
  /** Schwelle überschritten → Plan B empfehlen (US2). */
  triggered: boolean;
  /** Konkrete Handlungsempfehlung (US2), venue-spezifisch. */
  recommendation: string;
  /** Besser bewerteter Ausweichtag (US3) oder null. */
  alternative: DayResult | null;
  /** Entscheidungsfrist (US4). */
  decision: DecisionWindow;
}

/** Venue-spezifische Handlungsempfehlung bei Schwellenüberschreitung (US2). */
function planBRecommendation(planB: PlanBConfig, day: DayResult): string {
  const venue = planBVenueDef(planB.venue);
  const s = day.summary!;
  let cause: string;
  switch (planB.metric) {
    case 'rain': cause = `${s.precipSumMm.toFixed(1).replace('.', ',')} mm Regen erwartet`; break;
    case 'wind': cause = `Böen bis ${Math.round(s.gustMaxMs)} m/s`; break;
    case 'score': cause = `Bewertung nur ${day.score}`; break;
  }
  switch (planB.venue) {
    case 'tent': return `${cause} — Plan B: Zelt/Pavillon einplanen und wetterfest verankern.`;
    case 'indoor': return `${cause} — Plan B: nach drinnen verlegen / Halle oder Raum reservieren.`;
    case 'shelter': return `${cause} — Plan B: überdachten Bereich, Schirme oder Unterstand bereitstellen.`;
    case 'none': return `${cause} — Schwelle überschritten: Plan B prüfen (${venue.label}).`;
  }
}

/**
 * Prüft den Wunsch-/Bezugstag gegen die Plan-B-Schwelle und stellt — bei
 * Überschreitung — eine Handlungsempfehlung (US2), einen Ausweichtag (US3) und
 * die Entscheidungsfrist (US4) zusammen. Null, wenn Plan B aus ist oder für den
 * Bezugstag keine Vorhersage vorliegt.
 */
export function assessPlanB(query: EventQuery, rec: EventRecommendation): PlanBAssessment | null {
  const planB = query.planB;
  if (!planB?.enabled || rec.bestIndex < 0) return null;

  // Bezugstag: expliziter Wunschtag (falls im Fenster & bewertbar), sonst bester Tag.
  const wish = planB.wishDate ? rec.days.find((d) => d.date === planB.wishDate && d.summary) : null;
  const targetDay = wish ?? rec.days[rec.bestIndex];
  if (!targetDay.summary) return null;
  const targetIsWish = !!wish;

  const def = planBMetricDef(planB.metric);
  const value = planBMetricValue(targetDay, planB.metric);
  const triggered = dayBreachesThreshold(targetDay, planB);

  const valueText = planB.metric === 'rain'
    ? `${value.toFixed(1).replace('.', ',')} mm`
    : planB.metric === 'wind'
    ? `${Math.round(value)} m/s`
    : `${value} Punkte`;
  const thr = planB.metric === 'rain' ? `${planB.threshold} mm` : planB.metric === 'wind' ? `${planB.threshold} m/s` : `${planB.threshold} Punkte`;
  const thresholdText = `${def.direction === 'above' ? 'über' : 'unter'} ${thr}`;

  // US3: besser bewerteter Ausweichtag, der die Schwelle NICHT reißt.
  const alternative = triggered
    ? [...rec.days]
        .filter((d) => d.summary && d.date !== targetDay.date && !dayBreachesThreshold(d, planB) && d.score > targetDay.score)
        .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))[0] ?? null
    : null;

  // US4: Entscheidungsfrist für den Bezugstag.
  const span = query.phases.reduce((mx, p) => Math.max(mx, p.hours[0] >= p.hours[1] ? 24 - p.hours[0] + p.hours[1] : p.hours[1] - p.hours[0]), 1);
  const decision = decisionWindow(targetDay.date, targetDay.forecastConf, span);

  return {
    metric: planB.metric,
    metricLabel: def.label,
    thresholdText,
    targetDate: targetDay.date,
    targetDay,
    targetIsWish,
    value,
    valueText,
    triggered,
    recommendation: triggered ? planBRecommendation(planB, targetDay) : '',
    alternative,
    decision,
  };
}
