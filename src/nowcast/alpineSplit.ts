/**
 * NC-US-F1 / US-B2 — Alpine Tal-/Grat-Trennung.
 *
 * Für alpine Standorte liefert die Prognose getrennt einen **Tal-Wert** und
 * einen repräsentativen **Grat-/Gipfel-Wert** (Phase + Rate + 6-h-Summe), damit
 * ein Gitterpunkt nicht zwei sehr unterschiedliche Lagen vermischt. Die
 * Schneefallgrenze (US-B2) wird zu beiden Höhen in Beziehung gesetzt.
 *
 * Der Grat-Wert ist eine **physikalische Hochrechnung**: gleiche Niederschlags-
 * menge, aber höhenkorrigierte Temperatur (Lapse-Rate) → die Phase kann von
 * Regen (Tal) zu Schnee (Grat) kippen. Bewusst als Heuristik gekennzeichnet.
 */

import { classifyPrecipitation } from '../pointForecast/precipType';
import { NOWCAST_STEP_MIN, WET_MMH, type Nowcast, type StepPhase } from './nowcastModel';

/** Höhe (m), ab der ein DACH-Standort als „alpin" gilt. */
export const ALPINE_MIN_ELEV_M = 700;
/** Repräsentatives Relief Tal→Grat (m), wenn keine lokale Gipfelhöhe vorliegt. */
export const RIDGE_RELIEF_M = 1000;
/** Standard-Lapse-Rate (°C/m), falls die Quelle keine liefert. */
const DEFAULT_LAPSE = -0.0065;
/** Schnee-Wasser-Äquivalent: cm Neuschnee je mm Wasser (≈ 10:1). */
const SNOW_RATIO_CM_PER_MM = 1.0;

/**
 * Schnee-Wasser-Äquivalent (mm) → Neuschnee (cm). Reiner, **additiver** Export
 * für den Schnee-Karten-Layer (Feature F4, `iconD2Snow.ts`, Neuschnee-Modus) —
 * ändert **kein** bestehendes Verhalten dieses Moduls und nutzt dieselbe
 * {@link SNOW_RATIO_CM_PER_MM}-Konstante (10:1) wie die Punkt-Ableitung.
 *
 * `rho_snow` (kg/m³) wird **bevorzugt**, ABER nur in einem plausiblen
 * **Frischschnee**-Dichtebereich (~30–250 kg/m³): dann physikalisch
 * `cm = 100 · SWE_mm / ρ` (SWE_mm = kg/m² → Tiefe m = SWE/ρ → ×100 = cm). Ein
 * gemeldeter alter/dichter Pack (ρ ≥ 250) oder fehlendes ρ würde den *frischen*
 * Zuwachs unterschätzen → dann die konservative 10:1-Näherung. Das Verhältnis ist
 * wetterabhängig und bleibt eine **Näherung** (Legende/Tooltip labeln das). ≤ 0 → 0.
 */
export function freshSnowCmFromSwe(sweMm: number, rhoSnowKgM3?: number | null): number {
  if (!(sweMm > 0)) return 0;
  if (rhoSnowKgM3 != null && Number.isFinite(rhoSnowKgM3) && rhoSnowKgM3 >= 30 && rhoSnowKgM3 <= 250) {
    return (100 * sweMm) / rhoSnowKgM3;
  }
  return sweMm * SNOW_RATIO_CM_PER_MM;
}

export interface AlpineLevel {
  elevM: number;
  /** Dominante Niederschlagsphase über die 6 h. */
  phase: StepPhase;
  phaseLabel: string;
  /** Repräsentative (max.) Rate mm/h. */
  peakMmH: number;
  /** 6-h-Niederschlagssumme (mm Wasser). */
  sumMm: number;
  /** Geschätzter Neuschnee (cm) — nur wenn Phase Schnee/Schneeregen. */
  freshSnowCm: number | null;
}

export interface AlpineProfile {
  isAlpine: boolean;
  valley: AlpineLevel;
  ridge: AlpineLevel;
  snowLineM: number | null;
  /** Lesbarer Bezug der Schneefallgrenze zu den Höhen. */
  relation: string;
}

function dominantPhase(phases: StepPhase[]): StepPhase {
  const wet = phases.filter((p) => p !== 'dry');
  if (!wet.length) return 'dry';
  if (wet.includes('freezing')) return 'freezing';
  const count = new Map<StepPhase, number>();
  for (const p of wet) count.set(p, (count.get(p) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function phaseLabel(p: StepPhase): string {
  return p === 'rain' ? 'Regen' : p === 'snow' ? 'Schnee' : p === 'sleet' ? 'Schneeregen' : p === 'freezing' ? 'gefrierender Regen' : 'trocken';
}

function levelAt(nc: Nowcast, elevM: number, tempOffset: number): AlpineLevel {
  const h = NOWCAST_STEP_MIN / 60;
  const phases: StepPhase[] = [];
  let sum = 0, snowSum = 0, peak = 0;
  for (const s of nc.steps) {
    sum += s.mmH * h;
    peak = Math.max(peak, s.mmH);
    const t = s.tempC != null ? s.tempC + tempOffset : null;
    let phase: StepPhase = 'dry';
    if (s.mmH >= WET_MMH) {
      const cls = classifyPrecipitation(t, s.mmH, { snowLineM: s.snowLineM, sampleElevM: elevM });
      phase = cls === 'none' ? 'dry' : cls;
      if (phase === 'snow' || phase === 'sleet') snowSum += s.mmH * h;
    }
    phases.push(phase);
  }
  const dom = dominantPhase(phases);
  const freshSnowCm = snowSum > 0 ? Math.round(snowSum * SNOW_RATIO_CM_PER_MM * 10) / 10 : null;
  return { elevM: Math.round(elevM), phase: dom, phaseLabel: phaseLabel(dom), peakMmH: Math.round(peak * 10) / 10, sumMm: Math.round(sum * 10) / 10, freshSnowCm };
}

/** Berechnet das alpine Tal/Grat-Profil (US-F1). `isAlpine=false`, wenn die Höhe zu gering ist. */
export function alpineProfile(nc: Nowcast): AlpineProfile {
  const valleyElev = nc.elevationM ?? 0;
  const lapse = nc.lapseRatePerM != null && Number.isFinite(nc.lapseRatePerM) ? nc.lapseRatePerM : DEFAULT_LAPSE;
  const ridgeElev = valleyElev + RIDGE_RELIEF_M;

  const valley = levelAt(nc, valleyElev, 0);
  // Grat: höhenkorrigierte Temperatur (lapse ist °C/m, i. d. R. negativ → kälter).
  const ridge = levelAt(nc, ridgeElev, lapse * RIDGE_RELIEF_M);

  const snowLineM = nc.summary.snowLineM;
  const vE = Math.round(valleyElev), rE = Math.round(ridgeElev);
  let relation: string;
  if (snowLineM == null) {
    relation = 'Schneefallgrenze nicht modelliert (DE-Radar) — Phase aus Höhe + Temperatur abgeleitet.';
  } else if (snowLineM >= ridgeElev) {
    relation = `Schneefallgrenze ${snowLineM} m liegt über dem Grat (${rE} m) — überall Regen.`;
  } else if (snowLineM <= valleyElev) {
    relation = `Schneefallgrenze ${snowLineM} m liegt unter dem Tal (${vE} m) — bis ins Tal Schnee.`;
  } else {
    relation = `Schneefallgrenze ${snowLineM} m: zwischen Tal (${vE} m) und Grat (${rE} m) — oben Schnee, unten Regen.`;
  }

  const isAlpine = nc.elevationM != null && valleyElev >= ALPINE_MIN_ELEV_M;
  return { isAlpine, valley, ridge, snowLineM, relation };
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface AlpineCheck { case: string; ok: boolean; detail: string }
export function verifyAlpineSplit(): { checks: AlpineCheck[]; passed: number; failed: number } {
  const checks: AlpineCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });
  const now = 1_700_000_000_000;
  const mkNc = (elev: number, tempC: number, mmH: number): Nowcast => ({
    steps: Array.from({ length: 9 }, (_, i) => ({
      index: i, minutes: i * 45, timestamp: new Date(now + i * 45 * 60000),
      mmH, mmHMin: mmH * 0.7, mmHMax: mmH * 1.3, source: 'nwp', confidence: 0.4,
      phase: 'rain', character: 'steady', tempC, snowLineM: null, heavy: false,
    })),
    summary: { snowLineM: null } as Nowcast['summary'],
    elevationM: elev, lapseRatePerM: -0.0065, nowMs: now,
  } as unknown as Nowcast);

  // Tal warm (Regen), Grat 1000 m höher → ~6,5 °C kälter → Schnee.
  const p = alpineProfile(mkNc(900, 4, 1.5));
  add('alpin erkannt (900 m)', p.isAlpine);
  add('Tal = Regen', p.valley.phase === 'rain', p.valley.phase);
  add('Grat = Schnee', p.ridge.phase === 'snow', p.ridge.phase);
  add('Grat Neuschnee > 0', (p.ridge.freshSnowCm ?? 0) > 0, String(p.ridge.freshSnowCm));
  add('Grat höher als Tal', p.ridge.elevM > p.valley.elevM);

  // Flachland → nicht alpin.
  const flat = alpineProfile(mkNc(200, 10, 1));
  add('Flachland nicht alpin (200 m)', !flat.isAlpine);

  // Sehr kalt überall → Tal auch Schnee.
  const cold = alpineProfile(mkNc(1500, -3, 1.5));
  add('Hochtal kalt = Schnee', cold.valley.phase === 'snow', cold.valley.phase);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyAlpineSplit: typeof verifyAlpineSplit }).__verifyAlpineSplit = verifyAlpineSplit;
}
