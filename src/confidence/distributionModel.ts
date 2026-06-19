/**
 * Feature „Mehrere Modelle, ehrlicher Spread" — Verteilungs-Kern (EPIC 4, pur).
 *
 * Aus den stündlichen Ensemble-Temperaturen werden je Stunde die Bandbreiten
 * (mittlere 50 % = p25–p75, mittlere 80 % = p10–p90, Median p50; US-4.1) und für
 * den Tag ein Streuungs-Klartext (enges Bündel ↔ breite Streuung; US-4.2)
 * berechnet. Reine Statistik, headless prüfbar.
 */

import { percentiles, type Percentiles } from './confidenceModel';

export interface HourBand {
  tMs: number;
  p10: number; p25: number; p50: number; p75: number; p90: number;
}

/** Bandbreiten je Stunde (US-4.1). Stunden ohne Daten werden ausgelassen. */
export function ensembleBands(hours: { tMs: number; temps: number[] }[]): HourBand[] {
  const out: HourBand[] = [];
  for (const h of hours) {
    const p: Percentiles | null = percentiles(h.temps);
    if (!p) continue;
    out.push({ tMs: h.tMs, p10: p.p10, p25: p.p25, p50: p.p50, p75: p.p75, p90: p.p90 });
  }
  return out;
}

/** Breiteste 80 %-Spannweite über den Tag (°C) — Maß für die Streuung. */
export function daySpreadC(hours: { temps: number[] }[]): number {
  let max = 0;
  for (const h of hours) {
    const p = percentiles(h.temps);
    if (p) max = Math.max(max, p.p90 - p.p10);
  }
  return Math.round(max * 10) / 10;
}

export interface SpreadSummary { spreadC: number; tight: boolean; text: string }

const TIGHT_SPREAD_C = 4; // 80 %-Band ≤ 4 °C gilt als enges Bündel

/** Klartext zur Streuung (US-4.2). */
export function spreadSummary(hours: { temps: number[] }[]): SpreadSummary {
  const spreadC = daySpreadC(hours);
  const tight = spreadC <= TIGHT_SPREAD_C;
  const text = tight
    ? `Enges Bündel (±${(spreadC / 2).toFixed(1)} °C) — die Szenarien sind sich weitgehend einig, hohe Sicherheit.`
    : `Breite Streuung (±${(spreadC / 2).toFixed(1)} °C) — die Szenarien gehen auseinander, unsicher.`;
  return { spreadC, tight, text };
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface DistCheck { case: string; ok: boolean; detail: string }

export function verifyDistributionModel(): { checks: DistCheck[]; passed: number; failed: number } {
  const checks: DistCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  const mk = (vals: number[][]) => vals.map((temps, i) => ({ tMs: i * 3600_000, temps }));

  // Bänder: monoton p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90.
  const bands = ensembleBands(mk([[10, 12, 14, 16, 18, 20, 22]]));
  const b = bands[0];
  add('Band vorhanden', bands.length === 1, `${bands.length}`);
  add('Perzentile monoton', !!b && b.p10 <= b.p25 && b.p25 <= b.p50 && b.p50 <= b.p75 && b.p75 <= b.p90, b ? `${b.p10}/${b.p50}/${b.p90}` : '—');

  // Leere Stunde übersprungen.
  add('leere Stunde übersprungen', ensembleBands(mk([[]])).length === 0);

  // Enges Bündel → tight true.
  const tight = spreadSummary(mk([[20, 20.5, 21, 21.2, 20.8]]));
  add('enges Bündel erkannt', tight.tight && tight.text.includes('Enges'), `${tight.spreadC}`);
  // Breite Streuung → tight false.
  const wide = spreadSummary(mk([[10, 14, 18, 22, 26, 30]]));
  add('breite Streuung erkannt', !wide.tight && wide.text.includes('Breite'), `${wide.spreadC}`);

  // daySpreadC nimmt das Maximum über die Stunden (Stunde 2 breiter als Stunde 1).
  const ds = daySpreadC(mk([[20, 21], [10, 30]]));
  add('daySpread = Maximum', ds > daySpreadC(mk([[20, 21]])) && ds >= 15, `${ds}`);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyDistributionModel: typeof verifyDistributionModel }).__verifyDistributionModel = verifyDistributionModel;
}
