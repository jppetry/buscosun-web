/**
 * Feature „Wetterhistorie" — abgeleitete Profi-Indizes (E12, pur).
 *
 * Heizgradtage (HDD), Wachstumsgradtage (GDD, kumuliert), Trocken-/Hitzewellen-
 * Erkennung und frostfreie Periode / Wachstumsperiode je Jahr. Alles aus den
 * Tagesbeobachtungen, headless-testbar, mit konfigurierbaren Schwellen.
 */

import type { DailyRecord } from './historyModel';

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);

// --- Gradtage (E12.1 / E12.2) ------------------------------------------------

export const HDD_BASE_C = 15; // Heizgradtage: Standard-Basis 15 °C
export const GDD_BASE_C = 10; // Wachstumsgradtage: Standard-Basis 10 °C

/** Heizgradtage je Jahr: Σ max(0, Basis − Tagesmittel) (E12.1). */
export function heatingDegreeDaysByYear(days: DailyRecord[], base = HDD_BASE_C): { year: number; value: number; n: number }[] {
  const by = new Map<number, { value: number; n: number }>();
  for (const d of days) {
    if (!isNum(d.tMeanC)) continue;
    const s = by.get(d.year) ?? { value: 0, n: 0 };
    s.value += Math.max(0, base - d.tMeanC); s.n++;
    by.set(d.year, s);
  }
  return [...by.entries()].map(([year, s]) => ({ year, value: Math.round(s.value), n: s.n })).sort((a, b) => a.year - b.year);
}

/** Wachstumsgradtage je Jahr: Σ max(0, Tagesmittel − Basis) (E12.2). */
export function growingDegreeDaysByYear(days: DailyRecord[], base = GDD_BASE_C): { year: number; value: number; n: number }[] {
  const by = new Map<number, { value: number; n: number }>();
  for (const d of days) {
    if (!isNum(d.tMeanC)) continue;
    const s = by.get(d.year) ?? { value: 0, n: 0 };
    s.value += Math.max(0, d.tMeanC - base); s.n++;
    by.set(d.year, s);
  }
  return [...by.entries()].map(([year, s]) => ({ year, value: Math.round(s.value), n: s.n })).sort((a, b) => a.year - b.year);
}

/** Kumulierter GDD-Verlauf über ein Jahr (für die kumulierte Kurve, E12.2). */
export function gddCumulative(days: DailyRecord[], year: number, base = GDD_BASE_C): { doy: number; cum: number }[] {
  const yd = days.filter((d) => d.year === year && isNum(d.tMeanC)).sort((a, b) => a.doy - b.doy);
  let cum = 0;
  return yd.map((d) => { cum += Math.max(0, (d.tMeanC as number) - base); return { doy: d.doy, cum: Math.round(cum) }; });
}

// --- Perioden-Erkennung (E12.3) ----------------------------------------------

export interface Spell { startISO: string; endISO: string; length: number; peak: number }

/** Generische Lauf-Erkennung: aufeinanderfolgende Tage, die `pred` erfüllen. */
function detectSpells(days: DailyRecord[], pred: (d: DailyRecord) => boolean, value: (d: DailyRecord) => number, minLen: number): Spell[] {
  const sorted = [...days].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const out: Spell[] = [];
  let run: DailyRecord[] = [];
  const flush = () => {
    if (run.length >= minLen) {
      const peak = Math.max(...run.map(value));
      out.push({ startISO: run[0].dateISO, endISO: run[run.length - 1].dateISO, length: run.length, peak });
    }
    run = [];
  };
  for (const d of sorted) { if (pred(d)) run.push(d); else flush(); }
  flush();
  return out;
}

/** Hitzewellen: ≥ minLen aufeinanderfolgende Tage mit Tmax ≥ Schwelle (E12.3). */
export function heatWaves(days: DailyRecord[], thresholdC = 28, minLen = 3): Spell[] {
  return detectSpells(days, (d) => isNum(d.tMaxC) && d.tMaxC >= thresholdC, (d) => d.tMaxC as number, minLen);
}

/** Trockenperioden: ≥ minLen aufeinanderfolgende Tage mit Niederschlag < Schwelle (E12.3). */
export function drySpells(days: DailyRecord[], wetMm = 1, minLen = 10): Spell[] {
  return detectSpells(days, (d) => isNum(d.precipMm) && d.precipMm < wetMm, (d) => -(d.precipMm as number), minLen)
    .map((s) => ({ ...s, peak: s.length })); // peak = Dauer (Tage) ist hier aussagekräftiger
}

// --- Frostfreie Periode / Wachstumsperiode (E12.4) ---------------------------

export interface FrostFreeYear {
  year: number;
  lastSpringFrostISO: string | null; // letzter Frost vor der Jahresmitte
  firstAutumnFrostISO: string | null; // erster Frost nach der Jahresmitte
  lengthDays: number | null;          // frostfreie Tage dazwischen
}

const MID_DOY = 183;

/** Frostfreie Periode je Jahr: letzter Frühjahrsfrost → erster Herbstfrost (E12.4). */
export function frostFreeByYear(days: DailyRecord[]): FrostFreeYear[] {
  const byYear = new Map<number, DailyRecord[]>();
  for (const d of days) if (isNum(d.tMinC)) (byYear.get(d.year) ?? byYear.set(d.year, []).get(d.year)!).push(d);
  const out: FrostFreeYear[] = [];
  for (const [year, yd] of byYear) {
    const frosts = yd.filter((d) => (d.tMinC as number) < 0);
    const spring = frosts.filter((d) => d.doy <= MID_DOY).sort((a, b) => b.doy - a.doy)[0] ?? null;
    const autumn = frosts.filter((d) => d.doy > MID_DOY).sort((a, b) => a.doy - b.doy)[0] ?? null;
    const length = spring && autumn ? autumn.doy - spring.doy : null;
    out.push({ year, lastSpringFrostISO: spring?.dateISO ?? null, firstAutumnFrostISO: autumn?.dateISO ?? null, lengthDays: length });
  }
  return out.sort((a, b) => a.year - b.year);
}

export interface FrostSummary {
  meanLengthDays: number | null;
  /** Mittleres Datum des letzten Frühjahrsfrosts (Monat/Tag) + Schwankung (±Tage). */
  meanLastFrost: { month: number; day: number; spreadDays: number } | null;
}

/** Zusammenfassung der frostfreien Periode über die Jahre (E12.4 / E2.2). */
export function frostSummary(rows: FrostFreeYear[]): FrostSummary {
  const lengths = rows.map((r) => r.lengthDays).filter(isNum);
  const springDoys = rows.map((r) => (r.lastSpringFrostISO ? doyFromISO(r.lastSpringFrostISO) : null)).filter(isNum);
  let meanLastFrost: FrostSummary['meanLastFrost'] = null;
  if (springDoys.length) {
    const m = springDoys.reduce((s, v) => s + v, 0) / springDoys.length;
    const sd = Math.sqrt(springDoys.reduce((s, v) => s + (v - m) ** 2, 0) / springDoys.length);
    const { month, day } = monthDayFromDoy(Math.round(m));
    meanLastFrost = { month, day, spreadDays: Math.round(sd) };
  }
  return { meanLengthDays: lengths.length ? Math.round(mean(lengths) as number) : null, meanLastFrost };
}

// --- Hilfen ------------------------------------------------------------------

function doyFromISO(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86_400_000);
}

/** Monat/Tag aus einem mittleren DOY (Nicht-Schaltjahr-Referenz 2001). */
export function monthDayFromDoy(doy: number): { month: number; day: number } {
  const d = new Date(Date.UTC(2001, 0, doy));
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}
