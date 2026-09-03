/**
 * Wind-Effekt auf Segment-Geschwindigkeit.
 *
 * Wind kommt aus dem Wetter als (Geschwindigkeit, Richtung-FROM) — also der
 * meteorologischen Konvention, aus der der Wind weht. Für ein Strecken-Segment
 * berechnen wir:
 *
 *   1. Travel-Peilung (Kompass-Bearing von A nach B)
 *   2. Head-/Tailwind-Komponente entlang der Travel-Richtung:
 *        comp = -W · cos(θ_FROM − θ_travel)
 *        comp > 0 → Rückenwind (positiv = schiebt)
 *        comp < 0 → Gegenwind
 *   3. Geschwindigkeits-Faktor je Bewegungskategorie:
 *        Rad:  f = 1 + 0,04 · comp,  begrenzt auf [0,5 ; 1,4]
 *        Fuß:  f = 1 + 0,012 · comp, begrenzt auf [0,7 ; 1,2]
 *
 * `windFactor > 1` macht das Segment schneller (Rückenwind), `< 1` langsamer.
 */

import type { MovementCategory } from './speedModel';

/** Kompass-Peilung (0 = Nord, 90 = Ost) von A nach B. */
export function bearingDeg(latA: number, lonA: number, latB: number, lonB: number): number {
  const rad = Math.PI / 180;
  const φ1 = latA * rad;
  const φ2 = latB * rad;
  const dλ = (lonB - lonA) * rad;
  const y = Math.sin(dλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(dλ);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/**
 * Kompass-Peilung des Segments, das die Distanz `dist` (m) enthält. Geteilt von
 * der Ergebnis-Karte (Wind-Marker) und der 3D-Ansicht — beide müssen dieselbe
 * Fahrtrichtung annehmen, sonst widersprechen sich „Gegenwind" und Pfeilrichtung.
 */
export function bearingAtDist(points: Array<{ lat: number; lon: number; dist: number }>, dist: number): number {
  if (points.length < 2) return 0;
  let i = 1;
  while (i < points.length - 1 && points[i].dist < dist) i++;
  return bearingDeg(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
}

/**
 * Komponente des Winds entlang der Travel-Richtung (m/s).
 * Positiv = Rückenwind (schiebt), Negativ = Gegenwind.
 */
export function headwindComponentMps(travelBearingDeg: number, windFromDeg: number, windSpeedMps: number): number {
  const rad = Math.PI / 180;
  return -windSpeedMps * Math.cos((windFromDeg - travelBearingDeg) * rad);
}

/** Geschwindigkeits-Faktor (Multiplikator) aus der Wind-Komponente, je Kategorie. */
export function windSpeedFactor(componentMps: number, category: MovementCategory): number {
  if (category === 'bike') {
    return clamp(1 + 0.04 * componentMps, 0.5, 1.4);
  }
  return clamp(1 + 0.012 * componentMps, 0.7, 1.2);
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

// ---------------------------------------------------------------------------
// Verifikation
// ---------------------------------------------------------------------------
export interface WindMathCheck {
  case: string;
  componentMps: number;
  factorBike: number;
  factorFoot: number;
  expected: 'tailwind' | 'headwind' | 'crosswind';
  ok: boolean;
}

export interface WindMathResult {
  checks: WindMathCheck[];
  passed: number;
  failed: number;
}

export function verifyWindMath(): WindMathResult {
  // Fester Wind: 10 m/s aus Westen (270°). Travel-Peilungen variieren.
  const W = 10;
  const wFrom = 270;
  type Case = { name: string; travel: number; expected: 'tailwind' | 'headwind' | 'crosswind' };
  const cases: Case[] = [
    { name: 'Travel nach Osten (90°) bei Westwind',  travel: 90,  expected: 'tailwind' },
    { name: 'Travel nach Westen (270°) bei Westwind', travel: 270, expected: 'headwind' },
    { name: 'Travel nach Norden (0°) bei Westwind',  travel: 0,   expected: 'crosswind' },
    { name: 'Travel nach Süden (180°) bei Westwind', travel: 180, expected: 'crosswind' },
  ];

  const checks: WindMathCheck[] = cases.map((c) => {
    const comp = headwindComponentMps(c.travel, wFrom, W);
    const fb = windSpeedFactor(comp, 'bike');
    const ff = windSpeedFactor(comp, 'foot');

    let ok = false;
    if (c.expected === 'tailwind') ok = comp > 1 && fb > 1.05 && ff > 1.02;
    else if (c.expected === 'headwind') ok = comp < -1 && fb < 0.95 && ff < 0.98;
    else /* crosswind */ ok = Math.abs(comp) < 0.5 && Math.abs(fb - 1) < 0.05 && Math.abs(ff - 1) < 0.02;

    return {
      case: c.name,
      componentMps: Math.round(comp * 10) / 10,
      factorBike: Math.round(fb * 100) / 100,
      factorFoot: Math.round(ff * 100) / 100,
      expected: c.expected,
      ok,
    };
  });

  // Zusätzlich: Bearings-Korrektheit (zwei Punkte mit bekanntem Bearing).
  const bearingChecks: WindMathCheck[] = [
    // Von (50,10) nach (50,11): genau Osten → ~90°.
    { case: 'Bearing E', componentMps: bearingDeg(50, 10, 50, 11), factorBike: 0, factorFoot: 0, expected: 'tailwind', ok: Math.abs(bearingDeg(50, 10, 50, 11) - 90) < 1 },
    // Von (50,10) nach (51,10): genau Norden → ~0°.
    { case: 'Bearing N', componentMps: bearingDeg(50, 10, 51, 10), factorBike: 0, factorFoot: 0, expected: 'tailwind', ok: Math.abs(bearingDeg(50, 10, 51, 10)) < 1 || Math.abs(bearingDeg(50, 10, 51, 10) - 360) < 1 },
  ];

  const all = [...checks, ...bearingChecks];
  const passed = all.filter((c) => c.ok).length;
  return { checks: all, passed, failed: all.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyWindMath: typeof verifyWindMath }).__verifyWindMath = verifyWindMath;
}
