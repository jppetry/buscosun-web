/**
 * MOS-Combiner — verbindet die gelernte Orts-Klimatologie mit dem Live-Modell
 * zu einer EHRLICHEN, kalibrierten Vorhersage.
 *
 *  - Regenwahrscheinlichkeit: roher Ensemble-Anteil wird lead-zeit-gewichtet
 *    auf die Orts-Klimatologie überblendet (kurzer Vorlauf → Modell dominiert,
 *    langer Vorlauf → Klimatologie) und dann isoton kalibriert.
 *  - Temperatur: Mittel blendet Modell→Klimatologie; das Unsicherheitsband
 *    wird NIE schmaler als die Klimatologie hergibt — am Skill-Horizont weitet
 *    es sich automatisch auf, statt falsche Präzision vorzutäuschen.
 *
 * Rein & headless prüfbar ({@link verifyMosModel}).
 */

import { applyIsotonic, type IsotonicModel } from './isotonic';

/** Klimatologie-Vorhersage an einem Tag (aus climatology.climaPredict). */
export interface ClimaPoint { tempMean: number; tempStd: number; wetProb: number }

export interface MosInput {
  /** Vorlauf in Tagen (0 = heute). Steuert das Modell↔Klima-Gewicht. */
  leadDays: number;
  /** Ensemble-Member für die Zieltemperatur (°C), optional. */
  ensembleTempC?: number[];
  /** Roh-Regenwahrscheinlichkeit (Anteil nasser Member, 0..1), optional. */
  rawPoP?: number;
}

export interface MosForecast {
  /** Kalibrierte Regenwahrscheinlichkeit (0..1). */
  pop: number;
  popRaw: number;
  popClim: number;
  /** Modell↔Klima-Gewicht (1 = nur Modell). */
  leadWeight: number;
  tempMean: number;
  /** ~80 %-Unsicherheitsband. */
  tempLow: number;
  tempHigh: number;
  tempStd: number;
  /** Ehrlichkeits-Flag: Band durch die Klimatologie aufgeweitet (Modell zu eng). */
  bandWidenedToClima: boolean;
}

/** NWP-Vertrauensgewicht nach Vorlaufzeit (exponentieller Skill-Abfall). */
export function leadWeight(leadDays: number, skillDays = 4): number {
  const w = Math.exp(-Math.max(0, leadDays - 1) / skillDays);
  return Math.max(0.05, Math.min(1, w));
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  let v = 0; for (const x of xs) v += (x - m) * (x - m);
  return Math.sqrt(v / (xs.length - 1));
}
function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Erzeugt die kalibrierte MOS-Vorhersage. `clima` ist die Klimatologie-Vorhersage
 * für den Tag, `calibration` die auf der Klimatologie-Hindcast gefittete
 * Reliability-Korrektur.
 */
export function mosForecast(clima: ClimaPoint, calibration: IsotonicModel | null, input: MosInput): MosForecast {
  const w = leadWeight(input.leadDays);

  // --- Regenwahrscheinlichkeit ---
  const popClim = clamp01(clima.wetProb);
  const popRaw = input.rawPoP != null ? clamp01(input.rawPoP) : popClim;
  const blended = w * popRaw + (1 - w) * popClim;
  const pop = calibration ? clamp01(applyIsotonic(calibration, blended)) : clamp01(blended);

  // --- Temperatur ---
  const hasEns = input.ensembleTempC && input.ensembleTempC.length > 0;
  const ensMean = hasEns ? mean(input.ensembleTempC!) : clima.tempMean;
  const ensStd = hasEns ? std(input.ensembleTempC!) : 0;
  const tempMean = w * ensMean + (1 - w) * clima.tempMean;
  // Band nie schmaler als die Klimatologie (lead-skaliert) → keine Schein-Präzision.
  const climaFloor = clima.tempStd * (0.5 + 0.5 * (1 - w)); // wächst zum Klima-Ende
  const tempStd = Math.max(ensStd, climaFloor, 0.5);
  const z = 1.2816; // ~80 %-Intervall
  return {
    pop, popRaw, popClim, leadWeight: w,
    tempMean,
    tempLow: tempMean - z * tempStd,
    tempHigh: tempMean + z * tempStd,
    tempStd,
    bandWidenedToClima: tempStd > ensStd + 1e-9,
  };
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface MmCheck { name: string; ok: boolean; detail?: string }
export interface MmVerifyResult { checks: MmCheck[]; passed: number; failed: number }

export function verifyMosModel(): MmVerifyResult {
  const checks: MmCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const clima: ClimaPoint = { tempMean: 5, tempStd: 4, wetProb: 0.3 };
  const idCal: IsotonicModel = { xs: [0, 1], ys: [0, 1] };

  // Lead-Gewicht: kurz → ~1, lang → klein.
  add('leadWeight(0) ≈ 1', Math.abs(leadWeight(0) - 1) < 1e-9, `${leadWeight(0).toFixed(2)}`);
  add('leadWeight fällt mit Vorlauf', leadWeight(9) < leadWeight(3) && leadWeight(3) < leadWeight(0));

  // Kurzer Vorlauf: PoP folgt dem Modell.
  {
    const f = mosForecast(clima, idCal, { leadDays: 0, rawPoP: 0.9 });
    add('kurz: PoP ~ Modell (0,9)', Math.abs(f.pop - 0.9) < 0.05, `${f.pop.toFixed(2)}`);
  }
  // Langer Vorlauf: PoP zieht zur Klimatologie.
  {
    const f = mosForecast(clima, idCal, { leadDays: 14, rawPoP: 0.9 });
    add('lang: PoP zieht zur Klima (0,3)', f.pop < 0.5 && f.pop > 0.28, `${f.pop.toFixed(2)}`);
  }
  // Kalibrierung wirkt: überzuversichtliche Kurve zieht zurück.
  {
    const cal: IsotonicModel = { xs: [0, 0.5, 1], ys: [0, 0.25, 0.5] }; // halbiert
    const f = mosForecast(clima, cal, { leadDays: 0, rawPoP: 1 });
    add('Kalibrierung zieht 1,0 → 0,5', Math.abs(f.pop - 0.5) < 0.05, `${f.pop.toFixed(2)}`);
  }

  // Temperatur-Band weitet sich mit dem Vorlauf.
  {
    const ens = [4, 5, 6]; // enges Ensemble (Std ~1)
    const near = mosForecast(clima, idCal, { leadDays: 0, ensembleTempC: ens });
    const far = mosForecast(clima, idCal, { leadDays: 12, ensembleTempC: ens });
    add('Band weitet sich mit Vorlauf', (far.tempHigh - far.tempLow) > (near.tempHigh - near.tempLow), `${(near.tempHigh - near.tempLow).toFixed(1)} → ${(far.tempHigh - far.tempLow).toFixed(1)}`);
    add('enges Ensemble → Band auf Klima aufgeweitet', near.bandWidenedToClima);
    add('Bandmitte plausibel', near.tempMean > 4 && near.tempMean < 6);
  }

  // Ohne Ensemble: fällt sauber auf Klimatologie zurück.
  {
    const f = mosForecast(clima, idCal, { leadDays: 0 });
    add('ohne Ensemble: Mittel = Klima', Math.abs(f.tempMean - clima.tempMean) < 1e-9);
    add('ohne Ensemble: PoP = Klima', Math.abs(f.popRaw - clima.wetProb) < 1e-9);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyMosModel: typeof verifyMosModel }).__verifyMosModel = verifyMosModel;
}
