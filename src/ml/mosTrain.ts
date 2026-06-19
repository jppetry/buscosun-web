/**
 * Trainings-Orchestrator — lädt die ERA5/Meteostat-Tagesreihe eines Orts und
 * trainiert das Klima-MOS-Modell IM BROWSER, mit ehrlicher Out-of-sample-
 * Verifikation (Leave-one-year-out → Reliability + Skill). Keine neue Quelle:
 * nutzt `history/historySource` (dieselbe ERA5-Archive-API wie das Historie-
 * Feature).
 */

import type { DailyRecord } from '../history/historyModel';
import type { HistorySource } from '../history/historySource';
import { MeteostatSource } from '../history/meteostatSource';
import { fitClimatology, evalHarmonic, climaPredict, type ClimaInput, type ClimatologyModel } from './climatology';
import { fitIsotonic, type IsotonicModel } from './isotonic';
import { brier, rmse, reliabilityBins, expectedCalibrationError, type ReliabilityBin } from './metrics';
import { mosForecast, type MosForecast } from './mosModel';
import { fitSnowCurve, snowProb, transitionTemp, type SnowModel, type SnowSample } from './snowModel';
import { buildAnalogIndex, crossValidateAnalog, queryAnalogs, type AnalogDay, type AnalogIndex, type AnalogSkill, type AnalogResult } from './analogEnsemble';

export interface MosSkill {
  tempRmseClim: number;
  tempRmseBaseline: number;
  /** Verbesserung der Temperatur gegenüber dem trivialen Gesamtmittel (%). */
  tempImprovementPct: number;
  precipBss: number;
  precipBaseRate: number;
  /** Erwartete Kalibrierungs-Abweichung roh vs. kalibriert (kleiner = besser). */
  eceRaw: number;
  eceCal: number;
  years: number;
  nDays: number;
}

export interface SnowResult {
  model: SnowModel;
  /** Gelernte Übergangstemperatur (50-%-Schnee-Punkt, °C). */
  t50: number;
  /** Out-of-sample-Brier der gelernten Kurve vs. der festen 0,5-°C-Schwelle. */
  brierModel: number;
  brierThresh: number;
  reliable: boolean;
  nSnow: number;
}

export interface TrainedMos {
  model: ClimatologyModel;
  calibration: IsotonicModel;
  skill: MosSkill;
  reliabilityRaw: ReliabilityBin[];
  reliabilityCal: ReliabilityBin[];
  /** Gelernte Schnee/Regen-Grenze (ML #2) — null, wenn zu wenig Schneetage. */
  snow: SnowResult | null;
  /** Analog-Ensemble (ML #3) — Index + Out-of-sample-Skill. */
  analog: { index: AnalogIndex; skill: AnalogSkill; tau: number } | null;
  source: { id: string; label: string; kind: string };
  range: { startYear: number; endYear: number };
  tau: number;
}

export interface TrainOptions {
  /** Jahre Historie (Default 30). */
  years?: number;
  /** Nass-Schwelle in mm (Default 1). */
  tau?: number;
  /** Harmonische (Default 3). */
  K?: number;
  source?: HistorySource;
  signal?: AbortSignal;
}

function toClimaInput(r: DailyRecord): ClimaInput {
  const tMean = r.tMeanC ?? (r.tMaxC != null && r.tMinC != null ? (r.tMaxC + r.tMinC) / 2 : null);
  return { doy: r.doy, year: r.year, tMean, precipMm: r.precipMm };
}

/**
 * Trainiert das MOS-Modell für einen Ort und misst seinen Skill out-of-sample.
 * Der Reliability-Teil (forecast↔beobachtete Häufigkeit) ist der ehrliche
 * Beweis, dass die Wahrscheinlichkeiten kalibriert sind.
 */
export async function trainLocationMos(lat: number, lon: number, opts: TrainOptions = {}): Promise<TrainedMos> {
  // Default = Meteostat (DWD-Stationen, frei, OHNE Rate-Limit). ERA5/Open-Meteo
  // ist rate-limited (429) → bewusst NICHT als Default (siehe Lastenheft/Memory).
  // FRISCHE Instanz je Aufruf: der Singleton cached die Fetch-PROMISE pro Station;
  // unter React-StrictMode würde eine vom Cleanup abgebrochene Promise sonst beim
  // Remount erneut (abgebrochen) geliefert → Training hinge. Eigene Instanz =
  // eigener Cache, sauberer Neustart.
  const source = opts.source ?? new MeteostatSource();
  const tau = opts.tau ?? 1;
  const K = opts.K ?? 3;
  const nYears = opts.years ?? 30;
  const endYear = new Date().getUTCFullYear();
  const startYear = Math.max(source.minYear, endYear - nYears);

  const records = await source.fetchDailyRange(lat, lon, startYear, endYear, opts.signal);
  const recs = records.map(toClimaInput).filter((r) => r.tMean != null || r.precipMm != null);

  // Vollmodell (für den Runtime-Einsatz).
  const model = fitClimatology(recs, tau, K);

  // --- Out-of-sample-Verifikation: Leave-one-year-out ---
  // UI atmen lassen, bevor der (synchrone) Rechenblock startet.
  await new Promise<void>((r) => setTimeout(r));
  const allYears = [...new Set(recs.map((r) => r.year))].sort((a, b) => a - b);
  // Höchstens ~22 gleichmäßig verteilte Folds — bei langen (alpinen) Reihen
  // bliebe die Hauptthread-Schleife sonst sekundenlang hängen. 22 Folds reichen
  // für eine belastbare Skill-Schätzung; das Voll-Modell nutzt alle Jahre.
  const stepY = Math.max(1, Math.ceil(allYears.length / 22));
  const years = allYears.filter((_, i) => i % stepY === 0);
  const tempPred: number[] = [], tempObs: number[] = [], tempBase: number[] = [];
  const oosPop: number[] = [], oosWet: number[] = [];
  const baseMean = mean(recs.map((r) => r.tMean).filter((v): v is number => v != null));

  for (const yOut of years) {
    const train = recs.filter((r) => r.year !== yOut);
    const test = recs.filter((r) => r.year === yOut);
    if (train.length < 120) continue;
    const m = fitClimatology(train, tau, K);
    for (const r of test) {
      if (r.tMean != null) { tempPred.push(evalHarmonic(m.tempCoeffs, r.doy)); tempObs.push(r.tMean); tempBase.push(baseMean); }
      if (r.precipMm != null) { oosPop.push(clamp01(evalHarmonic(m.wetCoeffs, r.doy))); oosWet.push(r.precipMm >= tau ? 1 : 0); }
    }
  }

  // Kalibrierung auf den OOS-Paaren fitten (verhindert Selbst-Überanpassung).
  const calibration = fitIsotonic(oosPop.map((x, i) => ({ x, y: oosWet[i] })));
  const oosCal = oosPop.map((p) => clamp01(applyCal(calibration, p)));

  const tRmseClim = rmse(tempPred, tempObs);
  const tRmseBase = rmse(tempBase, tempObs);
  const b = brier(oosPop, oosWet);
  const skill: MosSkill = {
    tempRmseClim: round2(tRmseClim),
    tempRmseBaseline: round2(tRmseBase),
    tempImprovementPct: tRmseBase > 0 ? Math.round((1 - tRmseClim / tRmseBase) * 100) : 0,
    precipBss: round3(b.bss),
    precipBaseRate: round3(b.baseRate),
    eceRaw: round3(expectedCalibrationError(oosPop, oosWet, 10)),
    eceCal: round3(expectedCalibrationError(oosCal, oosWet, 10)),
    years: allYears.length,
    nDays: recs.length,
  };

  // Auf das angefragte Fenster beschränken (Meteostat fetcht die volle Stations-
  // abdeckung ~90 J. → sonst rechnen ML #2/#3 unnötig über alles).
  const windowRecords = records.filter((r) => r.year >= startYear);

  // --- ML #2: gelernte Schnee/Regen-Grenze (aus denselben Records, kein Extra-Fetch) ---
  await new Promise<void>((r) => setTimeout(r)); // UI atmen lassen
  const snow = trainSnow(windowRecords, tau);

  // --- ML #3: Analog-Ensemble (Niederschlag bedingt auf Temperatur-Regime + Saison) ---
  await new Promise<void>((r) => setTimeout(r));
  const analog = trainAnalog(windowRecords, tau);

  return {
    model, calibration, skill,
    reliabilityRaw: reliabilityBins(oosPop, oosWet, 10),
    reliabilityCal: reliabilityBins(oosCal, oosWet, 10),
    snow, analog,
    source: { id: source.id, label: source.label, kind: source.kind },
    range: { startYear, endYear }, tau,
  };
}

const ANALOG_WINDOW = 12; // ± Tage Saisonfenster
const ANALOG_K = 80;

/** Baut die Analog-Tage (Prädiktor = Tagesmitteltemperatur, Outcome = Niederschlag). */
function analogDaysFrom(records: DailyRecord[]): AnalogDay[] {
  const out: AnalogDay[] = [];
  for (const r of records) {
    const t = r.tMeanC ?? (r.tMaxC != null && r.tMinC != null ? (r.tMaxC + r.tMinC) / 2 : null);
    if (t == null || r.precipMm == null) continue;
    out.push({ doy: r.doy, year: r.year, dateISO: r.dateISO, predictors: [t], outcome: r.precipMm });
  }
  return out;
}

function trainAnalog(records: DailyRecord[], tau: number): TrainedMos['analog'] {
  const days = analogDaysFrom(records);
  if (days.length < 400) return null;
  const index = buildAnalogIndex(days, { windowDays: ANALOG_WINDOW });
  const skill = crossValidateAnalog(days, { k: ANALOG_K, windowDays: ANALOG_WINDOW, maxFolds: 18 });
  return { index, skill, tau };
}

/**
 * Runtime: empirische Niederschlags-Verteilung für einen Tag aus den ähnlichsten
 * historischen Tagen zum (vom Modell vorhergesagten) Temperatur-Regime.
 */
export function forecastAnalog(trained: TrainedMos, doy: number, predictedTMeanC: number): AnalogResult | null {
  if (!trained.analog) return null;
  return queryAnalogs(trained.analog.index, { doy, predictors: [predictedTMeanC] }, { k: ANALOG_K, threshold: trained.analog.tau });
}

/** Schnee-Label an einem Niederschlagstag: Schneefall registriert (snowCm > 0). */
function snowSamplesFrom(records: DailyRecord[], tau: number): SnowSample[] {
  const out: SnowSample[] = [];
  for (const r of records) {
    const t = r.tMeanC ?? (r.tMaxC != null && r.tMinC != null ? (r.tMaxC + r.tMinC) / 2 : null);
    if (t == null || r.precipMm == null || r.precipMm < tau) continue;
    out.push({ tempC: t, rh: r.humidityPct ?? null, isSnow: (r.snowCm != null && r.snowCm > 0) ? 1 : 0 });
  }
  return out;
}

/** Fittet die Schnee-Kurve + misst sie out-of-sample (LOYO) gegen die 0,5-°C-Schwelle. */
function trainSnow(records: DailyRecord[], tau: number): SnowResult | null {
  const all = snowSamplesFrom(records, tau);
  // Belastbarkeit: genug Schneetage (Meteostat liefert nur Schneehöhe → an milden
  // Tieflandstationen zu dünn besetzt) UND eine PHYSIKALISCH plausible
  // Übergangstemperatur. Sonst lieber NICHTS zeigen als eine erfundene Kurve.
  const full = fitSnowCurve(all, { minSnow: 50 });
  const t50full = transitionTemp(full);
  if (!full.reliable || !(t50full >= -6 && t50full <= 6)) return null;

  // LOYO: pro Jahr trainieren, am ungesehenen Jahr Brier vergleichen. Für die
  // Skill-Schätzung höchstens ~20 gleichmäßig verteilte Folds mit reduzierten
  // GD-Iterationen — sonst friert die Hauptthread-Schleife bei langen (alpinen)
  // Reihen ein. Das Voll-Modell oben nutzt die vollen Iterationen.
  const byYear = new Map<number, DailyRecord[]>();
  for (const r of records) { const a = byYear.get(r.year) ?? []; a.push(r); byYear.set(r.year, a); }
  const allYears = [...byYear.keys()].sort((a, b) => a - b);
  const stepY = Math.max(1, Math.ceil(allYears.length / 20));
  const foldYears = allYears.filter((_, i) => i % stepY === 0);
  let bModel = 0, bThresh = 0, nTest = 0;
  for (const yOut of foldYears) {
    const trainRecs = records.filter((r) => r.year !== yOut);
    const testS = snowSamplesFrom(byYear.get(yOut)!, tau);
    if (testS.length === 0) continue;
    const m = fitSnowCurve(snowSamplesFrom(trainRecs, tau), { iters: 700 });
    if (!m.reliable) continue;
    for (const s of testS) {
      const pm = snowProb(m, s.tempC, s.rh);
      const pt = s.tempC < 0.5 ? 1 : 0;
      bModel += (pm - s.isSnow) ** 2; bThresh += (pt - s.isSnow) ** 2; nTest++;
    }
  }
  return {
    model: full,
    t50: round2(transitionTemp(full)),
    brierModel: nTest ? round3(bModel / nTest) : 0,
    brierThresh: nTest ? round3(bThresh / nTest) : 0,
    reliable: full.reliable,
    nSnow: full.nSnow,
  };
}

/** Bequeme Runtime-Vorhersage aus dem trainierten Modell. */
export function forecastWithMos(
  trained: TrainedMos,
  doy: number,
  leadDays: number,
  ensembleTempC?: number[],
  rawPoP?: number,
): MosForecast {
  const clima = climaPredict(trained.model, doy);
  return mosForecast(clima, trained.calibration, { leadDays, ensembleTempC, rawPoP });
}

// kleine Helfer
function applyCal(model: IsotonicModel, x: number): number {
  // lokale Kopie von applyIsotonic, um den Import schlank zu halten
  const { xs, ys } = model;
  if (xs.length === 0) return x;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[xs.length - 1]) return ys[ys.length - 1];
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  const t = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * t;
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;
