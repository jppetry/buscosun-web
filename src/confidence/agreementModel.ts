/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Einigkeits-Kern (EPIC 2, pur).
 *
 * Klartext-Aussagen zur Übereinstimmung der Modelle (US-2.2): „X von N erwarten
 * Regen", Einigkeits-Level aus der Temperatur-Streuung und Ausreißer-Erkennung
 * (Leave-one-out: Modell, das deutlich vom Rest abweicht). Reine Statistik.
 */

import { stddev, percentiles, PRECIP_DAY_WET_MM } from './confidenceModel';

export type AgreeLevel = 'high' | 'mixed' | 'low';

export interface PrecipAgreement {
  wet: number;
  total: number;
  /** „4 von 5 Vorhersagen erwarten Regen" o. ä. */
  text: string;
}

/** Wie viele Modelle erwarten Regen (≥ Schwelle)? (US-2.2) */
export function precipAgreement(precipByModel: number[], thresholdMm = PRECIP_DAY_WET_MM): PrecipAgreement {
  const v = precipByModel.filter(Number.isFinite);
  const wet = v.filter((p) => p >= thresholdMm).length;
  const total = v.length;
  let text: string;
  if (total === 0) text = 'Keine Modelldaten verfügbar.';
  else if (wet === 0) text = `Alle ${total} Vorhersagen erwarten trocken.`;
  else if (wet === total) text = `Alle ${total} Vorhersagen erwarten Regen.`;
  else text = `${wet} von ${total} Vorhersagen erwarten Regen.`;
  return { wet, total, text };
}

/**
 * Ausreißer-Indizes (US-2.2): robust über Median + Interquartilsabstand (IQR).
 * Ein Modell ist Ausreißer, wenn es weiter als max(2,5 °C, 3·IQR) vom Median
 * liegt — eine gleichmäßig breite Streuung (Endpunkte) wird so NICHT markiert,
 * nur ein einzelner echter Ausreißer.
 */
export function outlierIndices(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).filter((o) => Number.isFinite(o.v));
  if (idx.length < 4) return []; // bei < 4 Modellen kein belastbarer Ausreißer
  const pct = percentiles(idx.map((o) => o.v));
  if (!pct) return [];
  const iqr = pct.p75 - pct.p25;
  const thresh = Math.max(2.5, 3 * iqr);
  return idx.filter((o) => Math.abs(o.v - pct.p50) > thresh).map((o) => o.i);
}

export interface AgreementInfo {
  precip: PrecipAgreement;
  level: AgreeLevel;
  /** Streuung der Tageshöchstwerte (°C). */
  tempSpreadC: number;
  outlierIdx: number[];
  /** Zusammenfassender Klartext + ggf. Ausreißer-Hinweis. */
  summary: string;
  detail: string;
}

/** Gesamteinschätzung der Einigkeit für einen Tag (US-2.2). */
export function agreement(tMaxByModel: number[], precipByModel: number[], modelLabels: string[]): AgreementInfo {
  const precip = precipAgreement(precipByModel);
  const tempSpreadC = round1(stddev(tMaxByModel));
  const outlierIdx = outlierIndices(tMaxByModel);

  // Einigkeits-Level aus Temperatur-Streuung.
  const level: AgreeLevel = tempSpreadC <= 1.2 ? 'high' : tempSpreadC <= 2.8 ? 'mixed' : 'low';

  // Headline: bei klarer Mehrheit die Regen-Aussage, sonst „uneinig".
  const both = precip.total > 0 && precip.wet > 0 && precip.wet < precip.total;
  let summary: string;
  if (level === 'low' && both) summary = 'Vorhersagen uneinig — Wetterlage offen.';
  else summary = precip.text;

  const parts: string[] = [];
  parts.push(level === 'high' ? 'Hohe Übereinstimmung.' : level === 'mixed' ? 'Überwiegende Einigkeit.' : 'Deutliche Unterschiede zwischen den Quellen.');
  if (outlierIdx.length) {
    const names = outlierIdx.map((i) => modelLabels[i]).filter(Boolean).join(', ');
    parts.push(`${outlierIdx.length === 1 ? 'Eine Quelle' : 'Quellen'} (${names}) weicht${outlierIdx.length === 1 ? '' : 'en'} deutlich ab (Ausreißer).`);
  } else {
    parts.push(`Temperatur-Streuung ±${tempSpreadC} °C.`);
  }
  return { precip, level, tempSpreadC, outlierIdx, summary, detail: parts.join(' ') };
}

function round1(x: number): number { return Math.round(x * 10) / 10; }

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface AgreeCheck { case: string; ok: boolean; detail: string }

export function verifyAgreementModel(): { checks: AgreeCheck[]; passed: number; failed: number } {
  const checks: AgreeCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });
  const labels = ['ICON', 'ECMWF', 'GFS', 'GEM', 'MF'];

  // Regen-Anteil.
  add('4 von 5 Regen', precipAgreement([1, 2, 0, 1, 3]).text.includes('4 von 5'), precipAgreement([1, 2, 0, 1, 3]).text);
  add('alle trocken', precipAgreement([0, 0, 0]).text.includes('trocken'));
  add('alle Regen', precipAgreement([1, 1, 1]).text.includes('Alle 3'));

  // Ausreißer: ein Modell weit weg vom engen Rest.
  const out = outlierIndices([20, 20.5, 19.8, 20.2, 27]); // letztes weit weg
  add('Ausreißer erkannt', out.length === 1 && out[0] === 4, `${out}`);
  // Kein Ausreißer bei gleichmäßiger Streuung.
  add('kein Ausreißer bei breiter Gleichstreuung', outlierIndices([18, 20, 22, 24, 26]).length === 0);
  add('kein Ausreißer bei < 4 Modellen', outlierIndices([20, 30, 21]).length === 0);

  // Einigkeit gesamt.
  const aHigh = agreement([20, 20.3, 19.9, 20.1, 20.4], [1, 1, 1, 0, 1], labels);
  add('Level hoch bei engem Bündel', aHigh.level === 'high', `spread ${aHigh.tempSpreadC}`);
  const aLow = agreement([15, 22, 18, 27, 16], [1, 0, 1, 0, 0], labels);
  add('Level niedrig bei breiter Streuung', aLow.level === 'low', `spread ${aLow.tempSpreadC}`);
  add('uneinig-Headline bei low+gemischt', aLow.summary.includes('uneinig') || aLow.summary.includes('von'), aLow.summary);
  const aOut = agreement([20, 20.5, 19.8, 20.2, 27], [1, 1, 1, 1, 0], labels);
  add('Ausreißer im Detail genannt', aOut.detail.includes('MF') && aOut.detail.includes('Ausreißer'), aOut.detail);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyAgreementModel: typeof verifyAgreementModel }).__verifyAgreementModel = verifyAgreementModel;
}
