/**
 * Orts-Klimatologie via harmonischer Regression — der „trainieren"-Teil.
 *
 * Aus der ERA5/Meteostat-Tagesreihe eines Orts (1940/1931–heute) lernen wir die
 * glatte Jahresgang-Klimatologie: erwartete Temperatur (Mittel + Streuung je
 * Tag-des-Jahres) und Niederschlags-Wahrscheinlichkeit P(Niederschlag > τ | doy).
 * Fourier-Basis (wenige Harmonische) → robust gegen Rauschen, kein Overfitting.
 *
 * Verifiziert per **Leave-one-year-out-Kreuzvalidierung**: die Klimatologie muss
 * ungesehene Jahre besser treffen als der triviale Gesamtmittelwert/die
 * Basisrate (CRPS bzw. Brier-Skill > 0). Genau dieser Skill ist die ehrliche
 * Grundlage, auf der später die Wahrscheinlichkeiten kalibriert werden.
 *
 * Rein & headless prüfbar ({@link verifyClimatology}).
 */

import { brier, rmse } from './metrics';

export interface DayValue { doy: number; y: number }

const YEAR = 365.25;

// --- kleine lineare Algebra (Normalgleichungen lösen) -----------------------

/** Löst A·x = b (n×n) per Gauß-Elimination mit Teilpivotisierung. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) continue;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row) => row[n]);
}

/** Fourier-Designvektor für einen Tag-des-Jahres: [1, cos₁, sin₁, … cos_K, sin_K]. */
function basis(doy: number, K: number): number[] {
  const v = [1];
  const a = (2 * Math.PI * doy) / YEAR;
  for (let k = 1; k <= K; k++) { v.push(Math.cos(k * a), Math.sin(k * a)); }
  return v;
}

/** Harmonische Kleinste-Quadrate-Regression: Koeffizienten für die Fourier-Basis. */
export function fitHarmonic(data: DayValue[], K: number): number[] {
  const p = 2 * K + 1;
  const AtA: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const Atb: number[] = new Array(p).fill(0);
  for (const d of data) {
    if (!Number.isFinite(d.y)) continue;
    const x = basis(d.doy, K);
    for (let i = 0; i < p; i++) {
      Atb[i] += x[i] * d.y;
      for (let j = 0; j < p; j++) AtA[i][j] += x[i] * x[j];
    }
  }
  // leichte Ridge-Regularisierung für Stabilität bei dünnen Daten
  for (let i = 0; i < p; i++) AtA[i][i] += 1e-6;
  return solveLinear(AtA, Atb);
}

export function evalHarmonic(coeffs: number[], doy: number): number {
  const K = (coeffs.length - 1) / 2;
  const x = basis(doy, K);
  let s = 0;
  for (let i = 0; i < coeffs.length; i++) s += coeffs[i] * x[i];
  return s;
}

// --- Klimatologie-Modell ----------------------------------------------------

export interface ClimatologyModel {
  /** Erwartete Temperatur (Mittel) je doy. */
  tempCoeffs: number[];
  /** Saisonale Reststreuung (Std) je doy (Harmonische auf |Residuum|). */
  tempStdCoeffs: number[];
  /** Niederschlags-Wahrscheinlichkeit P(precip>τ) je doy (0..1). */
  wetCoeffs: number[];
  /** Jahres-Basisrate nasser Tage — physikalischer Boden gegen „0 %". */
  baseWetRate: number;
  tau: number;
  K: number;
}

export interface ClimaSkill {
  /** Temperatur: LOYO-CRPS der Klimatologie vs. RMSE-Baseline (Gesamtmittel). */
  tempRmseClim: number;
  tempRmseBaseline: number;
  /** Niederschlag: LOYO-Brier-Skill-Score vs. Basisrate. */
  precipBss: number;
  precipBaseRate: number;
  years: number;
}

export interface ClimaInput { doy: number; year: number; tMean: number | null; precipMm: number | null }

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Fittet die Klimatologie (Temperatur + Niederschlagswahrscheinlichkeit). */
export function fitClimatology(records: ClimaInput[], tau = 1, K = 3): ClimatologyModel {
  const temp = records.filter((r) => r.tMean != null).map((r) => ({ doy: r.doy, y: r.tMean as number }));
  const tempCoeffs = fitHarmonic(temp, K);
  // Reststreuung: Harmonische auf das absolute Residuum (×√(π/2) → Std-Schätzer).
  const absResid = temp.map((d) => ({ doy: d.doy, y: Math.abs(d.y - evalHarmonic(tempCoeffs, d.doy)) }));
  const stdCoeffsRaw = fitHarmonic(absResid, Math.min(2, K));
  const tempStdCoeffs = stdCoeffsRaw.map((c) => c * Math.sqrt(Math.PI / 2));

  const wet = records.filter((r) => r.precipMm != null).map((r) => ({ doy: r.doy, y: (r.precipMm as number) >= tau ? 1 : 0 }));
  const wetCoeffs = fitHarmonic(wet, Math.min(2, K));
  const baseWetRate = wet.length ? wet.reduce((s, d) => s + d.y, 0) / wet.length : 0;

  return { tempCoeffs, tempStdCoeffs, wetCoeffs, baseWetRate, tau, K };
}

/** Vorhersage der Klimatologie an einem Tag-des-Jahres. */
export function climaPredict(model: ClimatologyModel, doy: number): { tempMean: number; tempStd: number; wetProb: number } {
  const tempMean = evalHarmonic(model.tempCoeffs, doy);
  const tempStd = Math.max(0.5, evalHarmonic(model.tempStdCoeffs, doy));
  // Boden bei 20 % der Jahres-Basisrate: eine ruhige Saison ist nie „0 % nass".
  const floor = 0.2 * (model.baseWetRate ?? 0);
  const wetProb = clamp01(Math.max(floor, evalHarmonic(model.wetCoeffs, doy)));
  return { tempMean, tempStd, wetProb };
}

/**
 * Leave-one-year-out-Kreuzvalidierung: fittet auf allen Jahren außer einem und
 * misst Skill am ungesehenen Jahr. Beweist, dass die Klimatologie generalisiert.
 */
export function crossValidateClimatology(records: ClimaInput[], tau = 1, K = 3): ClimaSkill {
  const years = [...new Set(records.map((r) => r.year))];
  const tempPred: number[] = [], tempObs: number[] = [];
  const baseGlobalMean = mean(records.map((r) => r.tMean).filter((v): v is number => v != null));
  const tempBasePred: number[] = [];
  const wetFc: number[] = [], wetObs: number[] = [];

  for (const yOut of years) {
    const train = records.filter((r) => r.year !== yOut);
    const test = records.filter((r) => r.year === yOut);
    if (train.length < 60) continue;
    const m = fitClimatology(train, tau, K);
    for (const r of test) {
      if (r.tMean != null) { tempPred.push(evalHarmonic(m.tempCoeffs, r.doy)); tempObs.push(r.tMean); tempBasePred.push(baseGlobalMean); }
      if (r.precipMm != null) { wetFc.push(clamp01(evalHarmonic(m.wetCoeffs, r.doy))); wetObs.push(r.precipMm >= tau ? 1 : 0); }
    }
  }

  const b = brier(wetFc, wetObs);
  return {
    tempRmseClim: rmse(tempPred, tempObs),
    tempRmseBaseline: rmse(tempBasePred, tempObs),
    precipBss: b.bss,
    precipBaseRate: b.baseRate,
    years: years.length,
  };
}

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface ClCheck { name: string; ok: boolean; detail?: string }
export interface ClVerifyResult { checks: ClCheck[]; passed: number; failed: number }

// Deterministischer Pseudo-Zufall (kein Math.random im Verify).
function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function verifyClimatology(): ClVerifyResult {
  const checks: ClCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Linearer Solver korrekt (2x2).
  {
    const x = solveLinear([[2, 1], [1, 3]], [3, 5]); // → x=0.8, y=1.4
    add('Solver 2×2 korrekt', Math.abs(x[0] - 0.8) < 1e-9 && Math.abs(x[1] - 1.4) < 1e-9, `${x.map((v) => v.toFixed(2))}`);
  }

  // Synthetische saisonale Temperatur: Jahresgang rekonstruieren.
  const rnd = lcg(42);
  const recs: ClimaInput[] = [];
  for (let year = 2000; year < 2020; year++) {
    for (let doy = 1; doy <= 365; doy++) {
      const seasonal = 10 + 12 * Math.sin((2 * Math.PI * (doy - 110)) / YEAR); // Peak ~Sommer
      const noise = (rnd() - 0.5) * 6;
      const tMean = seasonal + noise;
      // Niederschlag häufiger im Winter (höhere Wet-Wahrscheinlichkeit).
      const pWet = 0.45 + 0.25 * Math.cos((2 * Math.PI * doy) / YEAR); // Winter hoch
      const precipMm = rnd() < pWet ? 2 + rnd() * 5 : 0;
      recs.push({ doy, year, tMean, precipMm });
    }
  }

  const model = fitClimatology(recs, 1, 3);
  // Sommer (doy ~200) wärmer als Winter (doy ~15).
  const summer = climaPredict(model, 200).tempMean;
  const winter = climaPredict(model, 15).tempMean;
  add('Sommer wärmer als Winter', summer - winter > 15, `${winter.toFixed(1)}→${summer.toFixed(1)} °C`);
  add('Amplitude ~plausibel', summer > 18 && winter < 2, `S${summer.toFixed(1)} W${winter.toFixed(1)}`);
  // Niederschlagswahrscheinlichkeit im Winter höher.
  add('Winter feuchter als Sommer', climaPredict(model, 15).wetProb > climaPredict(model, 200).wetProb);
  add('wetProb in [0,1]', [1, 100, 200, 300].every((d) => { const p = climaPredict(model, d).wetProb; return p >= 0 && p <= 1; }));
  add('tempStd positiv', climaPredict(model, 100).tempStd > 0);

  // LOYO: Klimatologie schlägt den trivialen Gesamtmittelwert + hat Niederschlags-Skill.
  const skill = crossValidateClimatology(recs, 1, 3);
  add('LOYO: Temp-RMSE < Baseline', skill.tempRmseClim < skill.tempRmseBaseline, `${skill.tempRmseClim.toFixed(2)} < ${skill.tempRmseBaseline.toFixed(2)}`);
  add('LOYO: Niederschlag-BSS > 0', skill.precipBss > 0.02, `BSS ${skill.precipBss.toFixed(3)}`);
  add('LOYO über mehrere Jahre', skill.years >= 10, `${skill.years}`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyClimatology: typeof verifyClimatology }).__verifyClimatology = verifyClimatology;
}
