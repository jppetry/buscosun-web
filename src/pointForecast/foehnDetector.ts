/**
 * Föhn-Detektor (heuristisch, Tier-C).
 *
 * Föhn ist kein direkt vorhergesagtes Feld — wir leiten ihn aus mehreren
 * schwachen, aber zusammen aussagekräftigen Indikatoren ab. Klassischer
 * **Südföhn** im Alpennordrand zeigt sich durch:
 *
 *   1. **Lee-Sektor-Wind** — Wind aus dem Südsektor (≈ 135°–225°), wenn die
 *      Luft über den Alpenhauptkamm absteigt.
 *   2. **Kräftiger Wind** — Föhn ist windig (anhaltend ≳ 5 m/s).
 *   3. **Böigkeit** — stark schwankend (Böen/Mittelwind-Verhältnis hoch).
 *   4. **Trockene Luft** — absteigende Luft erwärmt sich trockenadiabatisch →
 *      sehr niedrige relative Luftfeuchte (oft < 40 %).
 *
 * Jeder Indikator wird auf 0..1 normiert, gewichtet summiert (Σ Gewichte = 1)
 * und mit einem **geografischen Relevanz-Faktor** multipliziert: Föhn ist ein
 * Alpen-Phänomen, nördlich von ~49,2° N ist die Einschätzung 0. Ab Score
 * ≥ {@link FOEHN_THRESHOLD} markieren wir den Sample als Föhn.
 *
 * Bewusst Tier-C: kein Modell-„foehn flag", keine Querprofil-Analyse — nur
 * eine transparente, erklärbare Heuristik auf den ohnehin geblendeten
 * Punkt-Forecast-Variablen.
 */

import type { FoehnAssessment } from './types';

export const FOEHN_THRESHOLD = 0.6;

export interface FoehnInput {
  temperatureC: number | null;
  windSpeedMps: number | null;
  windDirectionDeg: number | null;   // meteorologisch (woher der Wind weht)
  gustMps: number | null;
  relativeHumidityPct: number | null;
  /** Breitengrad — steuert den geografischen Relevanz-Faktor. */
  lat: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Kürzester Winkelabstand (0..180°) zwischen zwei Kompass-Richtungen. */
function angularDistance(a: number, b: number): number {
  let d = Math.abs(((a - b) % 360 + 360) % 360);
  if (d > 180) d = 360 - d;
  return d;
}

/**
 * Geografischer Relevanz-Faktor (0..1): voll im Alpenraum/-vorland
 * (lat ≤ 48,2°), linear auslaufend bis 0 bei lat ≥ 49,2°.
 */
export function foehnGeoFactor(lat: number): number {
  if (lat <= 48.2) return 1;
  if (lat >= 49.2) return 0;
  return clamp01((49.2 - lat) / 1.0);
}

/**
 * Bewertet die Föhn-Wahrscheinlichkeit. Liefert `null`, wenn die drei
 * Kern-Eingaben (Windstärke, Windrichtung, Luftfeuchte) nicht alle vorliegen
 * — ohne sie ist die Heuristik nicht belastbar.
 */
export function detectFoehn(input: FoehnInput): FoehnAssessment | null {
  const { windSpeedMps: ws, windDirectionDeg: dir, relativeHumidityPct: rh, gustMps, lat } = input;
  if (ws == null || dir == null || rh == null) return null;

  // 1) Südsektor-Wind: voll innerhalb ±45° um 180°, 0 ab ±90°.
  const dDir = angularDistance(dir, 180);
  const fDir = dDir <= 45 ? 1 : dDir >= 90 ? 0 : (90 - dDir) / 45;

  // 2) Windstärke: 0 bei 3 m/s, 1 ab 10 m/s.
  const fWind = clamp01((ws - 3) / 7);

  // 3) Böigkeit: Böen/Mittelwind. 0 bei Ratio 1,3, 1 ab 2,0.
  const ratio = gustMps != null && ws > 0.5 ? gustMps / ws : 1;
  const fGust = clamp01((ratio - 1.3) / 0.7);

  // 4) Trockenheit: 1 bei RH ≤ 30 %, 0 ab RH ≥ 60 %.
  const fDry = clamp01((60 - rh) / 30);

  const W_DIR = 0.30, W_WIND = 0.20, W_GUST = 0.20, W_DRY = 0.30;
  const raw = W_DIR * fDir + W_WIND * fWind + W_GUST * fGust + W_DRY * fDry;
  const geo = foehnGeoFactor(lat);
  const score = Math.round(geo * raw * 1000) / 1000;

  const reasons: string[] = [];
  if (fDir >= 0.5) reasons.push(`Südwind ${Math.round(dir)}°`);
  if (fWind >= 0.5) reasons.push(`kräftiger Wind ${ws.toFixed(1)} m/s`);
  if (fGust >= 0.5) reasons.push(`böig (Böen/Wind ${ratio.toFixed(1)})`);
  if (fDry >= 0.5) reasons.push(`trockene Luft ${Math.round(rh)} %`);
  if (geo === 0) reasons.length = 0;

  return { isFoehn: score >= FOEHN_THRESHOLD, score, reasons };
}

// ---------------------------------------------------------------------------
// Verifikation — synthetische Szenarien mit exakt kalkulierbaren Scores.
// ---------------------------------------------------------------------------
export interface FoehnCheck { name: string; ok: boolean; detail: string }
export interface FoehnVerifyResult { checks: FoehnCheck[]; passed: number; failed: number }

export function verifyFoehnDetector(): FoehnVerifyResult {
  const checks: FoehnCheck[] = [];
  const add = (name: string, ok: boolean, detail = '') => checks.push({ name, ok, detail });

  // Klassischer Innsbruck-Südföhn: S-Wind, kräftig, böig, sehr trocken.
  const innsbruck = detectFoehn({
    temperatureC: 18, windSpeedMps: 11, windDirectionDeg: 185, gustMps: 22,
    relativeHumidityPct: 25, lat: 47.27,
  });
  add('Innsbruck-Südföhn → isFoehn', !!innsbruck?.isFoehn, `score=${innsbruck?.score}`);
  add('… alle vier Gründe genannt', (innsbruck?.reasons.length ?? 0) === 4, `reasons=${JSON.stringify(innsbruck?.reasons)}`);

  // Ruhiger, feuchter Nordwind im selben Tal → kein Föhn.
  const calm = detectFoehn({
    temperatureC: 8, windSpeedMps: 2, windDirectionDeg: 10, gustMps: 3,
    relativeHumidityPct: 85, lat: 47.27,
  });
  add('Feuchter Schwachwind → kein Föhn', calm?.isFoehn === false, `score=${calm?.score}`);

  // Gleiche Föhn-Signatur, aber in Hamburg (lat 53,5) → Geo-Faktor 0.
  const hamburg = detectFoehn({
    temperatureC: 18, windSpeedMps: 11, windDirectionDeg: 185, gustMps: 22,
    relativeHumidityPct: 25, lat: 53.55,
  });
  add('Föhn-Signatur in Hamburg → score 0', hamburg?.score === 0, `score=${hamburg?.score}`);
  add('… und keine Gründe (außer Region)', (hamburg?.reasons.length ?? -1) === 0);

  // München (48,14) bekommt fast vollen Geo-Faktor.
  add('Geo-Faktor München ≈ 1', foehnGeoFactor(48.14) === 1, `geo=${foehnGeoFactor(48.14)}`);
  add('Geo-Faktor Hamburg = 0', foehnGeoFactor(53.55) === 0);
  add('Geo-Faktor 48,7° zwischen 0 und 1', foehnGeoFactor(48.7) > 0 && foehnGeoFactor(48.7) < 1, `geo=${foehnGeoFactor(48.7).toFixed(2)}`);

  // Fehlende Kern-Daten → null.
  add('Ohne Luftfeuchte → null', detectFoehn({
    temperatureC: 18, windSpeedMps: 11, windDirectionDeg: 185, gustMps: 22,
    relativeHumidityPct: null, lat: 47.27,
  }) === null);

  // Borderline: Südwind + trocken aber schwach/wenig böig → unter Schwelle.
  const border = detectFoehn({
    temperatureC: 14, windSpeedMps: 4, windDirectionDeg: 180, gustMps: 5,
    relativeHumidityPct: 45, lat: 47.27,
  });
  // fDir=1(0.30) + fWind=(4-3)/7≈0.143(0.029) + fGust=(1.25-1.3)<0→0 + fDry=(60-45)/30=0.5(0.15) = ~0.479
  add('Borderline-Fall unter Schwelle', border?.isFoehn === false && (border?.score ?? 1) < FOEHN_THRESHOLD, `score=${border?.score}`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyFoehnDetector: typeof verifyFoehnDetector })
    .__verifyFoehnDetector = verifyFoehnDetector;
  (window as unknown as { __detectFoehn: typeof detectFoehn }).__detectFoehn = detectFoehn;
}
