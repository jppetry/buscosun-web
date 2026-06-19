/**
 * Schnee-Wahrscheinlichkeits-Kurve — gelernte Regen/Schnee-Grenze (DACH-kritisch).
 *
 * Ersetzt die harten Schwellen aus `pointForecast/precipType.ts` (T<0,5 °C →
 * Schnee, <2,5 → Schneeregen) durch eine pro Ort aus der Stations-Historie
 * GELERNTE logistische Kurve P(Schnee | T, RH). Label aus dem Archiv: an einem
 * Niederschlagstag (precip ≥ τ) ist es „Schnee", wenn Schneefall registriert
 * wurde (snowCm > 0). Temperatur ist der Haupttreiber; relative Feuchte als
 * Wet-Bulb-Proxy (trockene Luft → Schnee bis in höhere Temperaturen).
 *
 * Die gelernte Übergangstemperatur **T50** (50-%-Punkt) variiert real je Ort/
 * Höhe — eine feste 0,5-°C-Schwelle liegt nahe 0–2 °C oft daneben. Rein &
 * headless prüfbar ({@link verifySnowModel}).
 */

export interface SnowSample { tempC: number; rh: number | null; isSnow: 0 | 1 }

export interface SnowModel {
  wBias: number;
  wT: number;
  wRH: number;
  hasRH: boolean;
  muT: number; sdT: number;
  muRH: number; sdRH: number;
  /** Zahl der Trainings-Niederschlagstage / davon Schnee. */
  n: number;
  nSnow: number;
  /** true, wenn genug Schneetage für eine belastbare Kurve da waren. */
  reliable: boolean;
}

const sigmoid = (z: number): number => 1 / (1 + Math.exp(-z));
const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

function meanStd(xs: number[]): { mu: number; sd: number } {
  if (xs.length === 0) return { mu: 0, sd: 1 };
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  let v = 0; for (const x of xs) v += (x - mu) * (x - mu);
  const sd = Math.sqrt(v / xs.length) || 1;
  return { mu, sd };
}

/**
 * Fittet die logistische Schnee-Kurve per Gradientenabstieg (standardisierte
 * Features, L2-Regularisierung). Klein & deterministisch.
 */
export function fitSnowCurve(samples: SnowSample[], opts: { iters?: number; lr?: number; l2?: number; minSnow?: number } = {}): SnowModel {
  const iters = opts.iters ?? 4000;
  const lr = opts.lr ?? 0.1;
  const l2 = opts.l2 ?? 1e-3;
  const minSnow = opts.minSnow ?? 15;

  const data = samples.filter((s) => Number.isFinite(s.tempC));
  const hasRH = data.length > 0 && data.every((s) => s.rh != null && Number.isFinite(s.rh as number)) && data.some((s) => s.rh !== data[0].rh);

  const { mu: muT, sd: sdT } = meanStd(data.map((s) => s.tempC));
  const rhVals = data.map((s) => (s.rh ?? 0));
  const { mu: muRH, sd: sdRH } = meanStd(rhVals);

  const nSnow = data.reduce((s, d) => s + d.isSnow, 0);
  const reliable = nSnow >= minSnow && data.length - nSnow >= minSnow;

  // Standardisierte Designzeilen.
  const X = data.map((s) => [1, (s.tempC - muT) / sdT, hasRH ? ((s.rh as number) - muRH) / sdRH : 0]);
  const y = data.map((s) => s.isSnow);
  let w = [0, 0, 0];
  const n = data.length || 1;
  for (let it = 0; it < iters && data.length > 0; it++) {
    const g = [0, 0, 0];
    for (let i = 0; i < data.length; i++) {
      const z = w[0] * X[i][0] + w[1] * X[i][1] + w[2] * X[i][2];
      const e = sigmoid(z) - y[i];
      g[0] += e * X[i][0]; g[1] += e * X[i][1]; g[2] += e * X[i][2];
    }
    w[0] -= lr * (g[0] / n);
    w[1] -= lr * (g[1] / n + l2 * w[1]);
    w[2] -= lr * (g[2] / n + l2 * w[2]);
  }

  return { wBias: w[0], wT: w[1], wRH: hasRH ? w[2] : 0, hasRH, muT, sdT, muRH, sdRH, n: data.length, nSnow, reliable };
}

/** P(Schnee) für eine Temperatur (+ optional rel. Feuchte). */
export function snowProb(model: SnowModel, tempC: number, rh: number | null = null): number {
  const zT = ((tempC - model.muT) / model.sdT) * model.wT;
  const zR = model.hasRH && rh != null ? (((rh - model.muRH) / model.sdRH) * model.wRH) : 0;
  return clamp01(sigmoid(model.wBias + zT + zR));
}

/** Übergangstemperatur T50 (P=0,5) bei mittlerer Feuchte. */
export function transitionTemp(model: SnowModel): number {
  if (Math.abs(model.wT) < 1e-6) return model.muT;
  // wBias + wT·((T−muT)/sdT) = 0  →  T = muT − sdT·wBias/wT
  return model.muT - (model.sdT * model.wBias) / model.wT;
}

export type SnowPhase = 'snow' | 'sleet' | 'rain';

/** Phase aus der gelernten Wahrscheinlichkeit (Schneeregen-Band um 33–66 %). */
export function snowPhase(p: number): SnowPhase {
  if (p >= 0.66) return 'snow';
  if (p >= 0.33) return 'sleet';
  return 'rain';
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface SnCheck { name: string; ok: boolean; detail?: string }
export interface SnVerifyResult { checks: SnCheck[]; passed: number; failed: number }

function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function verifySnowModel(): SnVerifyResult {
  const checks: SnCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Synthetische Wahrheit: P(Schnee) = sigmoid(-(T-1)/0.8) → echte Grenze T≈1 °C.
  const rnd = lcg(7);
  const samples: SnowSample[] = [];
  for (let i = 0; i < 4000; i++) {
    const T = -8 + rnd() * 20; // −8..+12 °C
    const pTrue = 1 / (1 + Math.exp((T - 1) / 0.8));
    samples.push({ tempC: T, rh: null, isSnow: rnd() < pTrue ? 1 : 0 });
  }
  const m = fitSnowCurve(samples, { iters: 3000 });

  add('snowProb monoton fallend in T', snowProb(m, -5) > snowProb(m, 0) && snowProb(m, 0) > snowProb(m, 5));
  add('kalt → Schnee (P>0,8)', snowProb(m, -4) > 0.8, `${snowProb(m, -4).toFixed(2)}`);
  add('warm → Regen (P<0,2)', snowProb(m, 6) < 0.2, `${snowProb(m, 6).toFixed(2)}`);
  const t50 = transitionTemp(m);
  add('T50 ≈ 1 °C rekonstruiert', Math.abs(t50 - 1) < 0.8, `${t50.toFixed(2)} °C`);
  add('Modell reliable', m.reliable && m.nSnow > 100);

  // Schlägt die feste 0,5-°C-Schwelle (Brier out-of-sample auf neuem Sample).
  const test: SnowSample[] = [];
  for (let i = 0; i < 2000; i++) { const T = -8 + rnd() * 20; const pTrue = 1 / (1 + Math.exp((T - 1) / 0.8)); test.push({ tempC: T, rh: null, isSnow: rnd() < pTrue ? 1 : 0 }); }
  let brierModel = 0, brierThresh = 0;
  for (const s of test) {
    const pm = snowProb(m, s.tempC);
    const pt = s.tempC < 0.5 ? 1 : 0; // harte Schwelle als Wahrscheinlichkeit
    brierModel += (pm - s.isSnow) ** 2;
    brierThresh += (pt - s.isSnow) ** 2;
  }
  brierModel /= test.length; brierThresh /= test.length;
  add('Kurve schlägt Fix-Schwelle (Brier)', brierModel < brierThresh, `${brierModel.toFixed(3)} < ${brierThresh.toFixed(3)}`);

  // Phase-Mapping.
  add('Phase: P 0,9 → snow', snowPhase(0.9) === 'snow');
  add('Phase: P 0,5 → sleet', snowPhase(0.5) === 'sleet');
  add('Phase: P 0,1 → rain', snowPhase(0.1) === 'rain');

  // Wenig Schnee → nicht reliable.
  const few = fitSnowCurve([...Array(200)].map(() => ({ tempC: 10, rh: null, isSnow: 0 as const })));
  add('keine Schneetage → nicht reliable', !few.reliable);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifySnowModel: typeof verifySnowModel }).__verifySnowModel = verifySnowModel;
}
