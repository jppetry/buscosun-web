/**
 * Verifikationsmetriken — der „verifizieren"-Teil. Ohne diese Zahlen ist jede
 * Wahrscheinlichkeit nur Behauptung. Alles pur & headless prüfbar
 * ({@link verifyMetrics}).
 *
 *  - Brier-Score + Brier-Skill-Score (BSS): misst Wahrscheinlichkeits-Güte
 *    gegen die Klimatologie-Basisrate. BSS > 0 ⇒ besser als „immer Basisrate".
 *  - Reliability-Diagramm-Bins: vorhergesagte vs. tatsächlich eingetretene
 *    Häufigkeit — der ehrliche Beweis, dass „70 %" wirklich 70 % heißt.
 *  - CRPS: Güte einer Ensemble-/Verteilungsprognose gegen die Beobachtung.
 *  - RMSE/MAE: deterministischer Fehler (Temperatur-Bias).
 */

export interface BrierResult {
  brier: number;
  /** Referenz-Brier der Klimatologie (immer Basisrate vorhersagen). */
  brierRef: number;
  /** Brier-Skill-Score = 1 − brier/brierRef. >0 = skillvoll. */
  bss: number;
  baseRate: number;
  n: number;
}

/** Brier-Score + Brier-Skill-Score gegen die Basisrate. y ∈ {0,1}. */
export function brier(forecasts: number[], outcomes: number[]): BrierResult {
  const n = Math.min(forecasts.length, outcomes.length);
  if (n === 0) return { brier: 0, brierRef: 0, bss: 0, baseRate: 0, n: 0 };
  let sum = 0, pos = 0;
  for (let i = 0; i < n; i++) { const p = clamp01(forecasts[i]); const y = outcomes[i] ? 1 : 0; sum += (p - y) * (p - y); pos += y; }
  const b = sum / n;
  const base = pos / n;
  const bRef = base * (1 - base); // Brier der konstanten Basisraten-Prognose
  const bss = bRef > 1e-9 ? 1 - b / bRef : (b < 1e-9 ? 1 : 0);
  return { brier: b, brierRef: bRef, bss, baseRate: base, n };
}

export interface ReliabilityBin {
  /** Mittlere vorhergesagte Wahrscheinlichkeit im Bin. */
  forecast: number;
  /** Tatsächlich eingetretene Häufigkeit im Bin. */
  observed: number;
  count: number;
}

/** Reliability-Diagramm-Bins (gleichbreite Wahrscheinlichkeits-Bins). */
export function reliabilityBins(forecasts: number[], outcomes: number[], nbins = 10): ReliabilityBin[] {
  const n = Math.min(forecasts.length, outcomes.length);
  const sumP = new Array(nbins).fill(0);
  const sumY = new Array(nbins).fill(0);
  const cnt = new Array(nbins).fill(0);
  for (let i = 0; i < n; i++) {
    const p = clamp01(forecasts[i]);
    let b = Math.floor(p * nbins);
    if (b >= nbins) b = nbins - 1;
    sumP[b] += p; sumY[b] += outcomes[i] ? 1 : 0; cnt[b]++;
  }
  const out: ReliabilityBin[] = [];
  for (let b = 0; b < nbins; b++) {
    if (cnt[b] === 0) continue;
    out.push({ forecast: sumP[b] / cnt[b], observed: sumY[b] / cnt[b], count: cnt[b] });
  }
  return out;
}

/**
 * Erwartete Kalibrierungs-Abweichung (ECE): gewichtete mittlere |forecast −
 * observed| über die Reliability-Bins. 0 = perfekt kalibriert.
 */
export function expectedCalibrationError(forecasts: number[], outcomes: number[], nbins = 10): number {
  const bins = reliabilityBins(forecasts, outcomes, nbins);
  const total = bins.reduce((s, b) => s + b.count, 0);
  if (total === 0) return 0;
  return bins.reduce((s, b) => s + (b.count / total) * Math.abs(b.forecast - b.observed), 0);
}

/**
 * CRPS einer Ensemble-Prognose (Members) gegen eine Beobachtung.
 * CRPS = (1/m)Σ|xᵢ−obs| − 1/(2m²)ΣΣ|xᵢ−xⱼ|.  Kleiner = besser.
 */
export function crpsEnsemble(members: number[], obs: number[] | number): number {
  if (Array.isArray(obs)) {
    // Mittel über mehrere (Member-Set, obs)-Paare nicht sinnvoll hier — Fehler.
    throw new Error('crpsEnsemble: obs muss eine Zahl sein');
  }
  const m = members.length;
  if (m === 0) return Math.abs(obs);
  let term1 = 0;
  for (let i = 0; i < m; i++) term1 += Math.abs(members[i] - obs);
  term1 /= m;
  let term2 = 0;
  for (let i = 0; i < m; i++) for (let j = 0; j < m; j++) term2 += Math.abs(members[i] - members[j]);
  term2 /= 2 * m * m;
  return term1 - term2;
}

/** Mittlerer CRPS über viele (Ensemble, Beobachtung)-Paare. */
export function meanCrps(ensembles: number[][], observations: number[]): number {
  const n = Math.min(ensembles.length, observations.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += crpsEnsemble(ensembles[i], observations[i]);
  return s / n;
}

export function rmse(pred: number[], obs: number[]): number {
  const n = Math.min(pred.length, obs.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) { const d = pred[i] - obs[i]; s += d * d; }
  return Math.sqrt(s / n);
}

export function mae(pred: number[], obs: number[]): number {
  const n = Math.min(pred.length, obs.length);
  if (n === 0) return 0;
  let s = 0;
  for (let i = 0; i < n; i++) s += Math.abs(pred[i] - obs[i]);
  return s / n;
}

export interface CsiResult {
  /** Critical Success Index = hits / (hits + misses + false alarms). 1 = perfekt. */
  csi: number;
  /** Probability of Detection = hits / (hits + misses). */
  pod: number;
  /** False Alarm Ratio = false alarms / (hits + false alarms). */
  far: number;
  hits: number; misses: number; falseAlarms: number; n: number;
}

/**
 * Critical Success Index (deterministisch). Schwellt die Wahrscheinlichkeit bei
 * `threshold` zu Ja/Nein und vergleicht mit der binären Beobachtung — die
 * klassische Radar-Nowcast-Trefferkennzahl (ergänzt das probabilistische Brier).
 */
export function csi(forecasts: number[], outcomes: number[], threshold = 0.5): CsiResult {
  const n = Math.min(forecasts.length, outcomes.length);
  let hits = 0, misses = 0, fa = 0;
  for (let i = 0; i < n; i++) {
    const p = clamp01(forecasts[i]) >= threshold ? 1 : 0;
    const y = outcomes[i] ? 1 : 0;
    if (p && y) hits++; else if (!p && y) misses++; else if (p && !y) fa++;
  }
  const denom = hits + misses + fa;
  return {
    csi: denom > 0 ? hits / denom : 1,
    pod: hits + misses > 0 ? hits / (hits + misses) : 0,
    far: hits + fa > 0 ? fa / (hits + fa) : 0,
    hits, misses, falseAlarms: fa, n,
  };
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface MetCheck { name: string; ok: boolean; detail?: string }
export interface MetVerifyResult { checks: MetCheck[]; passed: number; failed: number }

export function verifyMetrics(): MetVerifyResult {
  const checks: MetCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Perfekte Prognose → Brier 0, BSS 1.
  {
    const f = [1, 0, 1, 0, 1], y = [1, 0, 1, 0, 1];
    const r = brier(f, y);
    add('perfekt → Brier 0', Math.abs(r.brier) < 1e-9, `${r.brier}`);
    add('perfekt → BSS 1', Math.abs(r.bss - 1) < 1e-9, `${r.bss.toFixed(3)}`);
  }

  // Konstante Basisraten-Prognose → BSS ≈ 0.
  {
    const y = [1, 0, 0, 1, 0, 0, 1, 0]; // base = 3/8
    const base = 3 / 8;
    const f = y.map(() => base);
    const r = brier(f, y);
    add('Klimatologie-Prognose → BSS ≈ 0', Math.abs(r.bss) < 1e-6, `${r.bss.toFixed(4)}`);
  }

  // Skillvolle Prognose schlägt schlechte (höherer BSS).
  {
    const y = [1, 1, 0, 0, 1, 0, 1, 0];
    const good = y.map((v) => (v ? 0.8 : 0.2));
    const bad = y.map((v) => (v ? 0.4 : 0.6)); // invers/schwach
    add('gute Prognose hat höheren BSS', brier(good, y).bss > brier(bad, y).bss);
  }

  // Reliability: perfekt kalibrierte synthetische Daten → ECE klein.
  {
    const f: number[] = [], y: number[] = [];
    for (let s = 0; s <= 10; s++) {
      const p = s / 10; const hits = Math.round(p * 20);
      for (let k = 0; k < 20; k++) { f.push(p); y.push(k < hits ? 1 : 0); }
    }
    const ece = expectedCalibrationError(f, y, 10);
    add('kalibriert → ECE < 0,05', ece < 0.05, `${ece.toFixed(3)}`);
    const bins = reliabilityBins(f, y, 10);
    add('Reliability-Bins ~ Diagonale', bins.every((b) => Math.abs(b.forecast - b.observed) < 0.08));
  }

  // Fehlkalibriert (überzuversichtlich) → hohe ECE.
  {
    const f: number[] = [], y: number[] = [];
    for (let s = 0; s <= 10; s++) { const p = s / 10; const hits = Math.round(p / 2 * 20); for (let k = 0; k < 20; k++) { f.push(p); y.push(k < hits ? 1 : 0); } }
    add('überzuversichtlich → ECE > 0,1', expectedCalibrationError(f, y, 10) > 0.1);
  }

  // CRPS: zentriertes Ensemble besser als verschobenes.
  {
    const centered = [-1, 0, 1], shifted = [4, 5, 6];
    add('CRPS zentriert < verschoben', crpsEnsemble(centered, 0) < crpsEnsemble(shifted, 0), `${crpsEnsemble(centered, 0).toFixed(2)} vs ${crpsEnsemble(shifted, 0).toFixed(2)}`);
    // Deterministische "Ensemble" = exakte Beobachtung → CRPS 0.
    add('CRPS exakt → 0', Math.abs(crpsEnsemble([5, 5, 5], 5)) < 1e-9);
  }

  // RMSE/MAE.
  {
    add('RMSE korrekt', Math.abs(rmse([1, 2, 3], [1, 2, 5]) - Math.sqrt(4 / 3)) < 1e-9);
    add('MAE korrekt', Math.abs(mae([1, 2, 3], [1, 2, 5]) - 2 / 3) < 1e-9);
  }

  // CSI: perfekt → 1; 1 Hit + 1 Fehlalarm → 0,5.
  {
    add('CSI perfekt → 1', Math.abs(csi([1, 0, 1, 0], [1, 0, 1, 0]).csi - 1) < 1e-9);
    const r = csi([1, 1, 0], [1, 0, 0]);
    add('CSI 1 Hit + 1 Fehlalarm → 0,5', Math.abs(r.csi - 0.5) < 1e-9, `${r.csi.toFixed(2)}`);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyMetrics: typeof verifyMetrics }).__verifyMetrics = verifyMetrics;
}
