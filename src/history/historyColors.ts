/**
 * Feature „Wetterhistorie" — Farbskalen (E6/E14).
 *
 * Divergierende Blau→Weiß→Rot-Skala für Temperatur-Anomalien (Warming Stripes,
 * Heatmap) und sequenzielle Skalen für Niederschlag/Sonne. Blau↔Rot ist
 * rot-grün-blind-sicher; zusätzlich gibt es immer Beschriftung/Legende (US-14.1).
 */

import type { VariableKey } from './historyModel';

type RGB = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (c1: RGB, c2: RGB, t: number): RGB => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgb = (c: RGB) => `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`;

/** Stützstellen einer Skala (Position 0..1 → Farbe). */
function rampColor(stops: [number, RGB][], t: number): RGB {
  const x = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    if (x >= stops[i][0] && x <= stops[i + 1][0]) {
      const span = stops[i + 1][0] - stops[i][0] || 1;
      return mix(stops[i][1], stops[i + 1][1], (x - stops[i][0]) / span);
    }
  }
  return stops[x <= 0 ? 0 : stops.length - 1][1];
}

// Sand-zentrierte Warming-Stripes-Skala (exakt wie die Mockups): tiefes Blau →
// Stahlblau → Sand (#ede6d3) → Terracotta → tiefes Rot.
const DIVERGING: [number, RGB][] = [
  [0.0, [26, 58, 92]],    // #1a3a5c
  [0.25, [58, 111, 168]], // #3a6fa8
  [0.5, [237, 230, 211]], // #ede6d3 (Sand-Mitte)
  [0.75, [201, 123, 71]], // #c97b47
  [1.0, [158, 43, 37]],   // #9e2b25
];
const PRECIP_SEQ: [number, RGB][] = [[0, [247, 247, 245]], [0.4, [158, 202, 225]], [0.7, [66, 146, 198]], [1, [8, 64, 129]]];
const SUN_SEQ: [number, RGB][] = [[0, [60, 64, 72]], [0.4, [232, 201, 122]], [0.75, [240, 166, 70]], [1, [217, 110, 40]]];
const WIND_SEQ: [number, RGB][] = [[0, [240, 238, 232]], [0.5, [158, 178, 168]], [1, [70, 110, 95]]];

/** Anomalie (−span..+span °C) → divergierende Farbe (Warming Stripes). */
export function divergingColor(anomaly: number, span: number): string {
  const t = 0.5 + anomaly / (2 * (span || 1));
  return rgb(rampColor(DIVERGING, t));
}

/** Absolute Temperatur (°C) → Farbe (fixe Skala, Zentrum 12 °C) für Erkunden-Ansichten. */
export function absTempColor(t: number): string {
  return divergingColor(t - 12, 18);
}

/** Sequenzielle Farbe (0..1) je Variable (für absolute Werte). */
export function sequentialColor(t: number, variable: VariableKey): string {
  const ramp = variable === 'precip' ? PRECIP_SEQ : variable === 'sunshine' ? SUN_SEQ : variable === 'wind' || variable === 'humidity' ? WIND_SEQ : PRECIP_SEQ;
  return rgb(rampColor(ramp, t));
}

/** Symmetrische Anomalie-Spanne aus Werten (robust gegen Ausreißer: 95-Perzentil). */
export function anomalySpan(anoms: number[]): number {
  if (!anoms.length) return 1;
  const abs = anoms.map(Math.abs).sort((a, b) => a - b);
  const p95 = abs[Math.min(abs.length - 1, Math.floor(abs.length * 0.95))];
  return Math.max(0.5, p95);
}

/** Legenden-Stufen für eine divergierende Skala. */
export function divergingLegend(span: number, steps = 5): { label: string; color: string }[] {
  const out: { label: string; color: string }[] = [];
  for (let i = 0; i < steps; i++) {
    const a = -span + (2 * span * i) / (steps - 1);
    out.push({ label: `${a > 0 ? '+' : ''}${a.toFixed(1)}`, color: divergingColor(a, span) });
  }
  return out;
}
