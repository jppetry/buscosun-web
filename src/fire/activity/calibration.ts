/**
 * **Kalibrierung „Detektionen/FRE → Fläche"** — die Mathematik hinter Modell und
 * Schätzung (Phase AF4, Gate GAF4; Konzept §6, `audit/aktivfeuer.md` §13/§15).
 *
 * Regression in log-log-Koordinaten mit **Prädiktionsintervall** (nicht
 * Konfidenzintervall — gefragt ist die Streuung einer Einzelvorhersage):
 *
 *   ln(areaHa) = β₀ + β₁·ln x [+ β₂·(ln x)²]
 *   ŷ ± t(df, 1−α/2) · σ · sqrt(1 + hₓ),   hₓ = xᵥ′ (X′X)⁻¹ xᵥ,  df = n − k
 *
 * Bei Grad 1 ist `hₓ` genau `1/n + (ln x − mean)²/Sxx`, die Schulformel; die
 * Leverage-Schreibweise verallgemeinert sie auf das quadratische Glied.
 *
 * ── Warum ein Grad zur Wahl steht ────────────────────────────────────────────
 * Am Archiv-Datensatz (519 Paare EFFIS × VIIRS 2020–2025, GAF4) ist die Gerade
 * **zu flach für große Brände**: sie unterschätzte ab 40 Detektionen systematisch
 * (mittleres ln-Residuum +0,64 bzw. +1,25 über 100 Detektionen), und die
 * Abdeckung des 80-%-Intervalls fiel dort auf 67 %. Mit quadratischem Glied
 * verschwindet der Bias (+0,30 / +0,22) und LOO sinkt (1,347 → 1,331). Der Grad
 * wird deshalb **gemessen, nicht angenommen**: `fitLogLog` rechnet beide und
 * nimmt Grad 2 nur, wenn das quadratische Glied **signifikant** ist
 * (|t| ≥ `MIN_ABS_T_FOR_DEGREE2`), der Leave-one-out-Fehler nicht steigt und die
 * Vorhersage monoton bleibt — ab `MIN_PAIRS_FOR_DEGREE2` Paaren. Kubisch brachte
 * nichts (LOO 1,332 gegen 1,331) und ist nicht drin.
 *
 * Zusätzlich gilt eine **fachliche Nebenbedingung**: die Vorhersage muss im
 * Trainingsbereich monoton steigen — mehr Detektionen bzw. mehr Strahlungsenergie
 * dürfen nie weniger Fläche bedeuten (`isMonotoneIncreasing`). Am Archiv war das
 * FRE-Modell mit quadratischem Glied statistisch minimal besser, aber zwischen
 * 2 208 und 63 000 MJ **fallend** — verworfen, es bleibt dort bei der Geraden.
 *
 * Zwei Prädiktoren stehen im Modell (Konzept §6): `fre` (FRE in MJ) und `det`
 * (Zahl der Detektionen). Kein Fit unter `MIN_PAIRS_FOR_FIT`; **keine Vorhersage
 * außerhalb des Prädiktorbereichs** des Trainings — auf ln-Skalen läuft
 * Extrapolation sofort in Größenordnungen, und mit quadratischem Glied noch
 * schneller. Stichprobenbias steht im Modell (`caveats`): es gilt nur für
 * **detektierte** Brände und nie für die Gesamtheit.
 *
 * Diese Datei ist die EINE Implementierung: `scripts/fire/calibrate.mjs`
 * (Modell rechnen) und `estimate.ts` (Client-Schätzung) importieren sie —
 * Parität per Konstruktion. Pur, deterministisch, kein `Date.now()`.
 * `npm run verify:fire-activity` (Abschnitt h).
 */

import { FEATURE_VERSION, INTERVAL_LEVEL, MIN_PAIRS_FOR_FIT, type LabelSource } from './features';

export const MODEL_VERSION = 1 as const;
/** Ab so vielen Paaren darf das quadratische Glied überhaupt antreten. */
export const MIN_PAIRS_FOR_DEGREE2 = 60;
/**
 * Ab welchem |t| gilt die Krümmung als real? Ein LOO-Schwellenwert wäre
 * willkürlich: am Archiv 2020–2026 ist β₂ hoch signifikant (t = 3,5, F = 12,1)
 * und beseitigt den Bias bei großen Bränden (+1,23 → +0,29 ln), bringt im LOO
 * aber nur 0,9 %. Entschieden wird deshalb wie in der Statistik üblich über den
 * t-Test des Zusatzglieds — plus zwei Wächter: LOO darf nicht schlechter werden
 * (Overfitting) und die Vorhersage muss monoton bleiben (Fachlichkeit).
 */
export const MIN_ABS_T_FOR_DEGREE2 = 2;

export interface LogLogFit {
  /** ln(y) = coeffs[0] + coeffs[1]·ln x [+ coeffs[2]·(ln x)²] */
  coeffs: number[];
  degree: 1 | 2;
  n: number;
  r2: number;
  /** Residual-Standardabweichung in ln-Einheiten (df = n − k). */
  sigma: number;
  /** (X′X)⁻¹ — für die Leverage im Prädiktionsintervall. */
  xtxInv: number[][];
  /** Prädiktorbereich des Trainings (Originaleinheit) — außerhalb keine Vorhersage. */
  xMin: number;
  xMax: number;
  /** t-Quantil zweiseitig für `INTERVAL_LEVEL` bei df = n − k. */
  tCrit: number;
  /** Leave-one-out: RMSE in ln-Einheiten und Anteil der Ziele im Intervall. */
  looRmseLn: number;
  looCoverage: number;
}

export interface AreaModel {
  modelVersion: typeof MODEL_VERSION;
  featureVersion: typeof FEATURE_VERSION;
  labelSource: LabelSource;
  intervalLevel: number;
  /** Zeitpunkt der Kalibrierung (hereingereicht) und Trainingsjahre. */
  trainedAtMs: number;
  years: number[];
  pairsTotal: number;
  pairsEligible: number;
  models: { fre: LogLogFit | null; det: LogLogFit | null };
  caveats: string[];
}

export interface Pair { x: number; y: number }

// ---------------------------------------------------------------------------
// Student-t: regularisierte unvollständige Betafunktion (Lentz-Kettenbruch) + Bisektion
// ---------------------------------------------------------------------------

function lnGamma(z: number): number {
  // Lanczos (g = 7, n = 9)
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < 9; i++) x += c[i] / (z + i);
  const t = z + 7.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200; const EPS = 3e-14; const FPMIN = 1e-300;
  const qab = a + b; const qap = a + 1; const qam = a - 1;
  let c = 1; let d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

/** Regularisierte unvollständige Betafunktion I_x(a, b). */
export function betaInc(a: number, b: number, x: number): number {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** Verteilungsfunktion der Student-t-Verteilung. */
export function tCdf(t: number, df: number): number {
  const x = df / (df + t * t);
  const tail = 0.5 * betaInc(df / 2, 0.5, x);
  return t >= 0 ? 1 - tail : tail;
}

/** Quantil der Student-t-Verteilung (Bisektion; p ∈ (0,1)). */
export function tQuantile(p: number, df: number): number {
  if (!(p > 0 && p < 1) || !(df > 0)) return NaN;
  let lo = -50; let hi = 50;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return (lo + hi) / 2;
}

/** Zweiseitiges Quantil für das Intervallniveau (0,8 ⇒ p = 0,9). */
export const tCritFor = (level: number, df: number): number => tQuantile(1 - (1 - level) / 2, df);

// ---------------------------------------------------------------------------
// Lineare Algebra (klein: k ≤ 3)
// ---------------------------------------------------------------------------

/** Inverse per Gauß-Jordan mit Teilpivotisierung; `null` bei singulärer Matrix. */
export function inverse(A: readonly (readonly number[])[]): number[][] | null {
  const n = A.length;
  const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-14) return null;
    const d = M[c][c];
    for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (f === 0) continue;
      for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r) => r.slice(n));
}

/** Entwurfsvektor zu ln x für den gegebenen Grad. */
const designRow = (lnX: number, degree: 1 | 2): number[] => (degree === 1 ? [1, lnX] : [1, lnX, lnX * lnX]);

/**
 * Fachliche Nebenbedingung: **mehr Feuer darf nie weniger Fläche bedeuten.**
 * Die Ableitung β₁ + 2β₂·ln x muss über den ganzen Trainingsbereich ≥ 0 sein.
 * Gemessen am Archiv: das FRE-Modell mit quadratischem Glied fiel zwischen
 * 2 208 und 63 000 MJ (β₁ = −1,80) — statistisch minimal besser, fachlich
 * Unsinn. Solche Fits werden verworfen, nicht angezeigt.
 */
export function isMonotoneIncreasing(coeffs: readonly number[], degree: 1 | 2, xMin: number, xMax: number): boolean {
  if (degree === 1) return coeffs[1] > 0;
  const lo = Math.log(xMin); const hi = Math.log(xMax);
  const slopeAt = (l: number) => coeffs[1] + 2 * coeffs[2] * l;
  return slopeAt(lo) >= 0 && slopeAt(hi) >= 0;
}

interface Ols { coeffs: number[]; xtxInv: number[][]; sigma: number; r2: number; looRmseLn: number; tLast: number }

/** Kleinste Quadrate in ln-Koordinaten; LOO exakt über die Hut-Diagonale (PRESS). */
function olsLn(pairs: readonly Pair[], degree: 1 | 2): Ols | null {
  const n = pairs.length; const k = degree + 1;
  if (n <= k + 1) return null;
  const X = pairs.map((p) => designRow(Math.log(p.x), degree));
  const y = pairs.map((p) => Math.log(p.y));
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) => X.reduce((s, xi) => s + xi[i] * xi[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => X.reduce((s, xi, r) => s + xi[i] * y[r], 0));
  const xtxInv = inverse(XtX);
  if (!xtxInv) return null;
  const coeffs = Array.from({ length: k }, (_, i) => xtxInv[i].reduce((s, v, j) => s + v * Xty[j], 0));
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sse = 0; let sst = 0; let press = 0;
  for (let r = 0; r < n; r++) {
    const pred = X[r].reduce((s, v, i) => s + v * coeffs[i], 0);
    const e = y[r] - pred;
    sse += e * e; sst += (y[r] - my) ** 2;
    const h = X[r].reduce((s, v, i) => s + v * xtxInv[i].reduce((s2, w, j) => s2 + w * X[r][j], 0), 0);
    press += (e / Math.max(1e-9, 1 - h)) ** 2;
  }
  const sigma = Math.sqrt(sse / (n - k));
  // t-Wert des letzten Koeffizienten (bei Grad 2 das quadratische Glied).
  const seLast = sigma * Math.sqrt(Math.max(0, xtxInv[k - 1][k - 1]));
  return {
    coeffs, xtxInv, sigma, r2: sst > 0 ? 1 - sse / sst : 0, looRmseLn: Math.sqrt(press / n),
    tLast: seLast > 0 ? coeffs[k - 1] / seLast : 0,
  };
}

/** Anteil der Ziele im Prädiktionsintervall, jeweils ohne den eigenen Punkt gerechnet. */
function looCoverage(pairs: readonly Pair[], degree: 1 | 2, level: number): number {
  const n = pairs.length; let covered = 0;
  for (let i = 0; i < n; i++) {
    const rest = pairs.filter((_, j) => j !== i);
    const g = olsLn(rest, degree);
    if (!g) continue;
    const k = degree + 1;
    const v = designRow(Math.log(pairs[i].x), degree);
    const mu = v.reduce((s, w, a) => s + w * g.coeffs[a], 0);
    const lev = v.reduce((s, w, a) => s + w * g.xtxInv[a].reduce((s2, u, b) => s2 + u * v[b], 0), 0);
    const half = tCritFor(level, rest.length - k) * g.sigma * Math.sqrt(1 + lev);
    const ly = Math.log(pairs[i].y);
    if (ly >= mu - half && ly <= mu + half) covered++;
  }
  return covered / n;
}

/**
 * Fit mit Prädiktionsintervall und Leave-one-out. Grad **gemessen**: quadratisch
 * nur, wenn es den LOO-Fehler senkt und genug Paare da sind. `null`, wenn weniger
 * als `minPairs` gültige Paare (x > 0, y > 0) vorliegen — es wird nichts erfunden.
 */
export function fitLogLog(input: readonly Pair[], level = INTERVAL_LEVEL, minPairs = MIN_PAIRS_FOR_FIT): LogLogFit | null {
  const pairs = input.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.y > 0);
  if (pairs.length < minPairs) return null;
  const lin = olsLn(pairs, 1);
  if (!lin) return null;
  const n = pairs.length;
  const xs = pairs.map((p) => p.x);
  const xMin = Math.min(...xs); const xMax = Math.max(...xs);
  const quad = pairs.length >= MIN_PAIRS_FOR_DEGREE2 ? olsLn(pairs, 2) : null;
  const quadUsable = !!quad
    && Math.abs(quad.tLast) >= MIN_ABS_T_FOR_DEGREE2      // Krümmung ist real, nicht Zufall
    && quad.looRmseLn <= lin.looRmseLn                     // und kostet keine Vorhersagegüte
    && isMonotoneIncreasing(quad.coeffs, 2, xMin, xMax);   // und bleibt fachlich sinnvoll
  const degree: 1 | 2 = quadUsable ? 2 : 1;
  const f = degree === 2 ? quad! : lin;
  // Auch die Gerade muss steigen — ein fallender Zusammenhang wäre kein Modell, sondern ein Artefakt.
  if (!isMonotoneIncreasing(f.coeffs, degree, xMin, xMax)) return null;
  return {
    coeffs: f.coeffs, degree, n, r2: f.r2, sigma: f.sigma, xtxInv: f.xtxInv,
    xMin, xMax,
    tCrit: tCritFor(level, n - (degree + 1)),
    looRmseLn: f.looRmseLn,
    looCoverage: looCoverage(pairs, degree, level),
  };
}

export interface Prediction { ha: number; lowHa: number; highHa: number }

/** Vorhersage mit Prädiktionsintervall in Originaleinheit; `null` außerhalb des Trainingsbereichs. */
export function predictInterval(fit: LogLogFit, x: number): Prediction | null {
  if (!(x > 0) || x < fit.xMin || x > fit.xMax) return null;
  const v = designRow(Math.log(x), fit.degree);
  const mu = v.reduce((s, w, i) => s + w * fit.coeffs[i], 0);
  const lev = v.reduce((s, w, i) => s + w * fit.xtxInv[i].reduce((s2, u, j) => s2 + u * v[j], 0), 0);
  const half = fit.tCrit * fit.sigma * Math.sqrt(1 + Math.max(0, lev));
  return { ha: Math.exp(mu), lowHa: Math.exp(mu - half), highHa: Math.exp(mu + half) };
}

/** Rundung fürs Anzeigen: drei signifikante Stellen reichen für ein Intervall dieser Breite. */
export function round3s(v: number): number {
  if (!(v > 0)) return 0;
  const e = 2 - Math.floor(Math.log10(v));
  if (e >= 0) { const p = Math.pow(10, e); return Math.round(v * p) / p; }
  const p = Math.pow(10, -e); return Math.round(v / p) * p;
}

// ---------------------------------------------------------------------------
// Selbst-Verifikation (D-12; netzfrei)
// ---------------------------------------------------------------------------

export interface CalibrationCheck { name: string; ok: boolean; detail?: string }

/** Deterministischer Pseudozufall (LCG) — kein Math.random, damit die Anker stabil sind. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 4294967296; };
}
/** Näherung normalverteilt (Summe von 12 Gleichverteilten). */
function gauss(rnd: () => number): number { let t = 0; for (let i = 0; i < 12; i++) t += rnd(); return t - 6; }

export function verifyCalibration(): { checks: CalibrationCheck[]; passed: number; total: number } {
  const checks: CalibrationCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // t-Quantile gegen Tabellenwerte
  add('t-Quantil zweiseitig 80 %: df=23 ⇒ 1,3195; df=1000 ⇒ 1,2824; df=5 ⇒ 1,4759',
    Math.abs(tCritFor(0.8, 23) - 1.3195) < 2e-3 && Math.abs(tCritFor(0.8, 1000) - 1.2824) < 2e-3 && Math.abs(tCritFor(0.8, 5) - 1.4759) < 2e-3,
    `${tCritFor(0.8, 23).toFixed(4)} / ${tCritFor(0.8, 1000).toFixed(4)} / ${tCritFor(0.8, 5).toFixed(4)}`);
  add('t-Quantil 95 % zweiseitig df=10 ⇒ 2,228', Math.abs(tCritFor(0.95, 10) - 2.228) < 2e-3, tCritFor(0.95, 10).toFixed(4));
  add('Inverse: A·A⁻¹ = I; singuläre Matrix ⇒ null',
    (() => { const A = [[4, 2, 1], [2, 5, 3], [1, 3, 6]]; const I = inverse(A); if (!I) return false;
      let ok = true; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const v = A[i].reduce((s, a, k) => s + a * I[k][j], 0); if (Math.abs(v - (i === j ? 1 : 0)) > 1e-9) ok = false; }
      return ok && inverse([[1, 2], [2, 4]]) === null; })());

  // Gerade Daten: area = 0,05 · x^0,8 · Rauschen(σ = 0,3) ⇒ Grad 1 reicht, Koeffizienten wiedergefunden
  const rnd = lcg(42);
  const linear: Pair[] = [];
  for (let i = 0; i < 200; i++) { const x = Math.exp(Math.log(2) + rnd() * (Math.log(5000) - Math.log(2))); linear.push({ x, y: 0.05 * Math.pow(x, 0.8) * Math.exp(0.3 * gauss(rnd)) }); }
  const fit = fitLogLog(linear);
  add('gerade Daten: Steigung 0,8 (±0,05) und Achsenabschnitt ln 0,05 (±0,15) wiedergefunden',
    !!fit && Math.abs(fit.coeffs[1] - 0.8) < 0.05 && Math.abs(fit.coeffs[0] - Math.log(0.05)) < 0.15,
    fit ? `Grad ${fit.degree} β=[${fit.coeffs.map((c) => c.toFixed(3)).join(', ')}] σ=${fit.sigma.toFixed(3)} R²=${fit.r2.toFixed(3)}` : 'null');
  add('σ ≈ 0,3, R² hoch', !!fit && Math.abs(fit.sigma - 0.3) < 0.06 && fit.r2 > 0.9);
  add('80-%-Prädiktionsintervall deckt im Leave-one-out ≈ 80 % (0,72…0,88)', !!fit && fit.looCoverage > 0.72 && fit.looCoverage < 0.88, fit ? `${(fit.looCoverage * 100).toFixed(1)} %` : 'null');
  add('Prädiktorbereich = Trainingsbereich, außerhalb null', !!fit && predictInterval(fit, fit.xMin) != null && predictInterval(fit, fit.xMax) != null && predictInterval(fit, fit.xMax * 1.01) === null && predictInterval(fit, 0) === null);
  const p100 = fit ? predictInterval(fit, 100) : null;
  add('Vorhersage bei x=100: ≈ 0,05·100^0,8 = 1,99 ha, Intervall asymmetrisch um den Punktwert',
    !!p100 && Math.abs(p100.ha - 1.99) < 0.35 && p100.lowHa < p100.ha && p100.highHa > p100.ha && (p100.highHa - p100.ha) > (p100.ha - p100.lowHa),
    p100 ? `${p100.ha.toFixed(2)} (${p100.lowHa.toFixed(2)}–${p100.highHa.toFixed(2)})` : 'null');

  // Gekrümmte Daten: ln y = 1 + 0,3·ln x + 0,12·(ln x)² ⇒ Grad 2 muss gewinnen und die Krümmung finden
  const rnd2 = lcg(7);
  const curved: Pair[] = [];
  for (let i = 0; i < 300; i++) { const x = Math.exp(rnd2() * Math.log(400)); const l = Math.log(x); curved.push({ x, y: Math.exp(1 + 0.3 * l + 0.12 * l * l + 0.4 * gauss(rnd2)) }); }
  const fq = fitLogLog(curved);
  add('gekrümmte Daten: Grad 2 gewinnt und findet das quadratische Glied (0,12 ± 0,04)',
    !!fq && fq.degree === 2 && Math.abs(fq.coeffs[2] - 0.12) < 0.04,
    fq ? `Grad ${fq.degree} β=[${fq.coeffs.map((c) => c.toFixed(3)).join(', ')}] LOO=${fq.looRmseLn.toFixed(3)}` : 'null');
  add('bei geraden Daten bleibt Grad 1 (β₂ nicht signifikant — kein blindes Aufrüsten)', fit?.degree === 1,
    (() => { const q = olsLn(linear, 2); return q ? `β₂=${q.coeffs[2].toFixed(4)} t=${q.tLast.toFixed(2)}` : ''; })());
  add('gekrümmte Daten: β₂ ist deutlich signifikant', (() => { const q = olsLn(curved, 2); return !!q && Math.abs(q.tLast) > 4; })(),
    (() => { const q = olsLn(curved, 2); return q ? `t=${q.tLast.toFixed(2)}` : ''; })());
  add('Grad 2 tritt erst ab 60 Paaren an', fitLogLog(curved.slice(0, 59))?.degree === 1 && MIN_PAIRS_FOR_DEGREE2 === 60);
  add('gekrümmte Daten: Grad 2 hat den kleineren LOO-Fehler als die Gerade an denselben Daten',
    (() => { const q = fitLogLog(curved); const l = olsLn(curved.filter((p) => p.x > 0 && p.y > 0), 1); return !!q && !!l && q.looRmseLn < l.looRmseLn; })());

  // Monotonie: ein fallender bzw. nicht monotoner Fit wird verworfen
  add('Monotonie-Prüfung: fallende Gerade ⇒ unbrauchbar; U-Form im Bereich ⇒ unbrauchbar; steigend ⇒ brauchbar',
    !isMonotoneIncreasing([1, -0.5], 1, 1, 100) && isMonotoneIncreasing([1, 0.5], 1, 1, 100)
    && !isMonotoneIncreasing([12, -1.8, 0.08], 2, 2208, 138595341) && isMonotoneIncreasing([1.5, 0.31, 0.12], 2, 1, 462));
  add('fallende Daten ⇒ kein Modell (Artefakt statt Zusammenhang)',
    (() => { const r = lcg(3); const falling: Pair[] = []; for (let i = 0; i < 120; i++) { const x = 1 + r() * 100; falling.push({ x, y: 50 / x * Math.exp(0.2 * gauss(r)) }); } return fitLogLog(falling) === null; })());
  add('unter 25 Paaren kein Modell (nichts wird erfunden)', fitLogLog(linear.slice(0, 24)) === null && fitLogLog(linear.slice(0, 25)) !== null);
  add('Paare mit x ≤ 0 oder y ≤ 0 werden verworfen, nicht logarithmiert',
    fitLogLog([...linear.slice(0, 30), { x: 0, y: 5 }, { x: 5, y: 0 }])?.n === 30);
  add('deterministisch: derselbe Datensatz ⇒ identische Koeffizienten',
    JSON.stringify(fitLogLog(linear)) === JSON.stringify(fitLogLog([...linear])));
  add('round3s: 1234,5 → 1230, 3,456 → 3,46, 0,0123 → 0,0123', round3s(1234.5) === 1230 && round3s(3.456) === 3.46 && round3s(0.0123) === 0.0123);
  add('MODEL_VERSION 1', MODEL_VERSION === 1);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, total: checks.length };
}
