/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Confidence-Kern (pur).
 *
 * Aus den Tageswerten mehrerer unabhängiger Vorhersagemodelle (US-6.1) wird
 * abgeleitet:
 *  • ein Confidence-Score je Tag aus Modell-Streuung + Vorlaufzeit (US-6.2),
 *    gemappt auf Hoch/Mittel/Niedrig (US-1.1),
 *  • stündliche Perzentilbänder für die Unsicherheitswolke (US-1.5),
 *  • eine einheitlich definierte Regenwahrscheinlichkeit (US-1.3).
 *
 * Reine Statistik, keine IO/DOM — headless testbar.
 */

export type ConfLevel = 'high' | 'mid' | 'low';

/** Verankerte Schwellen (US-1.1): Hoch ≥ 70 %, Mittel 40–69 %, Niedrig < 40 %. */
export const CONF_THRESHOLDS = { high: 0.70, mid: 0.40 } as const;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export function mean(values: number[]): number {
  const v = values.filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN;
}

export function stddev(values: number[]): number {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / v.length);
}

export interface ConfidenceResult { score: number; level: ConfLevel; label: string; pct: number }

/**
 * Confidence eines Tages (0..1): scharfes Modell-Bündel + naher Vorlauf → hoch,
 * breite Streuung + ferner Vorlauf → niedrig. Streuung wächst real mit der
 * Vorlaufzeit, daher sinkt das Vertrauen sichtbar (US-1.1).
 */
export function dayConfidence(tMaxByModel: number[], tMinByModel: number[], leadDays: number): number {
  const usable = [...tMaxByModel, ...tMinByModel].filter(Number.isFinite);
  if (usable.length < 2) return 0.5; // zu wenig Modelle → neutral
  const spread = (stddev(tMaxByModel) + stddev(tMinByModel)) / 2; // °C
  // 0,6 °C Streuung → ~scharf (1,0); 4,0 °C → unsicher (0,12).
  const sharp = clamp(1 - (spread - 0.6) / 3.4, 0.12, 1);
  // Milder Vorlauf-Abfall, damit das Vertrauen auch bei zufällig engem Bündel sinkt.
  const lead = clamp(1 - leadDays * 0.045, 0.55, 1);
  return clamp(sharp * lead, 0.08, 0.97);
}

/** Mappt einen Score auf Stufe + Label + Prozent (US-1.1). */
export function confidenceLevel(score: number): ConfidenceResult {
  const pct = Math.round(score * 100);
  if (score >= CONF_THRESHOLDS.high) return { score, level: 'high', label: 'Hohe Sicherheit', pct };
  if (score >= CONF_THRESHOLDS.mid) return { score, level: 'mid', label: 'Mittlere Sicherheit', pct };
  return { score, level: 'low', label: 'Niedrige Sicherheit', pct };
}

export interface Percentiles { p10: number; p25: number; p50: number; p75: number; p90: number }

/** Lineare Perzentile (p10/25/50/75/90) einer Werteliste; null bei < 2 Werten. */
export function percentiles(values: number[]): Percentiles | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < 2) return null;
  const q = (p: number) => {
    const idx = p * (v.length - 1);
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    return v[lo] + (v[hi] - v[lo]) * (idx - lo);
  };
  return { p10: q(0.10), p25: q(0.25), p50: q(0.50), p75: q(0.75), p90: q(0.90) };
}

/**
 * EINE konsistente Bedeutung von „Regen" (Validierungspunkt: durchgängig
 * gleiche Schwelle + Erklärung).
 *
 * - `PRECIP_DAY_WET_MM` (Tagessumme ≥ 1 mm) = „nennenswerter Regen an dem Tag".
 *   Gilt für ALLE tagesbasierten Aussagen: Tages-Regenwahrscheinlichkeit (US-1.3),
 *   Modell-Einigkeit „X von N erwarten Regen" (EPIC 2), räumliches Raster
 *   (US-4.3) UND das Wetter-Icon — so kann es nie „20 % Regen" + Sonne zugleich
 *   heißen.
 * - `PRECIP_HOUR_WET_MM` (Stundenwert ≥ 0,2 mm) = „messbarer Niederschlag in der
 *   Stunde", ausschließlich für die stündliche Treffsicherheit (EPIC 7, andere
 *   Einheit — bewusst getrennt und dokumentiert).
 */
export const PRECIP_DAY_WET_MM = 1.0;
export const PRECIP_HOUR_WET_MM = 0.2;
/** Eine geteilte Klartext-Definition, überall identisch eingeblendet. */
export const PRECIP_WET_EXPLAIN = '„Regen" heißt hier: Tagessumme von mind. 1 mm (nennenswerter Niederschlag, nicht nur Sprühregen) — überall in der App gleich.';

/**
 * Regenwahrscheinlichkeit (US-1.3) als Anteil der Modelle mit Tagessumme ≥
 * Schwelle: „an X von 10 solchen Tagen fällt nennenswerter Regen". 0..1.
 */
export function precipProbability(precipByModel: number[], thresholdMm = PRECIP_DAY_WET_MM): number {
  const v = precipByModel.filter(Number.isFinite);
  if (!v.length) return 0;
  return v.filter((p) => p >= thresholdMm).length / v.length;
}

/** Klartext-Erklärung der Regenwahrscheinlichkeit (US-1.3). */
export function precipExplain(prob: number): string {
  const x = Math.round(prob * 10);
  return `Heißt: an ${x} von 10 solchen Tagen fällt nennenswerter Regen (mind. 1 mm).`;
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface ConfCheck { case: string; ok: boolean; detail: string }

export function verifyConfidenceModel(): { checks: ConfCheck[]; passed: number; failed: number } {
  const checks: ConfCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  add('mean', mean([10, 20, 30]) === 20);
  add('stddev 0 bei gleich', stddev([5, 5, 5]) === 0);
  add('stddev > 0 bei Streuung', stddev([10, 20]) > 0);

  // Enges Bündel, Tag 0 → hoch.
  const tight = dayConfidence([22, 22.3, 21.8, 22.1], [13, 13.1, 12.9, 13], 0);
  add('enges Bündel Tag0 = hoch', confidenceLevel(tight).level === 'high', `${(tight * 100).toFixed(0)}%`);
  // Breite Streuung → niedrig.
  const wide = dayConfidence([18, 24, 21, 26], [10, 16, 12, 14], 1);
  add('breite Streuung = niedrig', confidenceLevel(wide).level === 'low', `${(wide * 100).toFixed(0)}%`);
  // Gleiche Streuung, höherer Vorlauf → geringeres Vertrauen (US-1.1).
  const d0 = dayConfidence([20, 21, 22], [12, 13, 14], 0);
  const d6 = dayConfidence([20, 21, 22], [12, 13, 14], 6);
  add('Vertrauen sinkt mit Vorlauf', d6 < d0, `${(d0 * 100).toFixed(0)}→${(d6 * 100).toFixed(0)}`);

  // Label-Schwellen.
  add('Label Hoch ≥ 70', confidenceLevel(0.75).level === 'high');
  add('Label Mittel 40–69', confidenceLevel(0.55).level === 'mid');
  add('Label Niedrig < 40', confidenceLevel(0.30).level === 'low');
  add('Grenze 0,70 = Hoch', confidenceLevel(0.70).level === 'high');
  add('Grenze 0,40 = Mittel', confidenceLevel(0.40).level === 'mid');

  // Perzentile.
  const p = percentiles([10, 12, 14, 16, 18, 20]);
  add('Perzentile geordnet', !!p && p.p10 <= p.p25 && p.p25 <= p.p50 && p.p50 <= p.p75 && p.p75 <= p.p90);
  add('Median plausibel', !!p && Math.abs(p!.p50 - 15) < 0.01, `${p?.p50}`);
  add('Perzentile null bei 1 Wert', percentiles([5]) === null);

  // Regenwahrscheinlichkeit — kanonische Tagesschwelle 1 mm (0,5 zählt NICHT).
  add('Regen 2/4 = 50 % (≥1 mm)', precipProbability([0, 0.5, 2, 1]) === 0.5, `${precipProbability([0, 0.5, 2, 1])}`);
  add('Sprühregen 0,5 mm zählt nicht', precipProbability([0.5, 0.5, 0.9, 0]) === 0);
  add('Regen 0 ohne Daten', precipProbability([]) === 0);
  add('Regen-Erklärung Text', precipExplain(0.3).includes('3 von 10'));

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyConfidenceModel: typeof verifyConfidenceModel }).__verifyConfidenceModel = verifyConfidenceModel;
}
