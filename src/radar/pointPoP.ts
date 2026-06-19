/**
 * Ensemble-Regenwahrscheinlichkeit AM PUNKT (PoP) für den Regenradar-Streifen.
 *
 * Spiegelt exakt die kalibrierte Karten-Pipeline (`poprob`-Layer): Aus dem
 * gemessenen „jetzt"-Frame und dem +5-min-Frame wird ein Horn-Schunck-Bewegungs-
 * feld geschätzt; je Vorhersage-Lead advehieren 15 gestörte Member (±Tempo,
 * ±Richtung) das Radar — der Anteil nasser Member = Regenwahrscheinlichkeit. Statt
 * des ganzen Rasters sampeln wir nur den Standort.
 *
 * Nur DE (RADOLAN-RV); ~0–60 min belastbar (darüber divergiert das Ensemble
 * zunehmend — ehrlich abnehmende Sicherheit). Liefert [] wenn nicht möglich.
 */

import { coarsenFrameU8 } from '../ml/nowcasterInference';
import { estimateFlowHS } from '../ml/opticalFlowNowcast';
import { advectEnsembleProb } from '../ml/flowEnsemble';
import { sampleRadarQuad } from '../pointForecast/quadSampler';
import type { RadarStack } from './radarFrames';

const FLOW_FACTOR = 8;          // wie MapView: RADOLAN ~1100×1200 → ~140×150
const FLOW_INTERVAL_MIN = 5;    // Abstand der beiden Eingabe-Frames (RV-Schritt)

export interface PointPoP {
  /** Vorhersage-Vorlauf in Minuten (0,5,…). */
  leadMinutes: number;
  /** Regenwahrscheinlichkeit 0..1. */
  prob: number;
}

/**
 * Regenwahrscheinlichkeit je Vorhersage-Lead am Punkt (lat,lon). Reines Compute,
 * etwas teuer (15 Member × Advektion je Lead auf grobem Gitter) → vom Aufrufer
 * memoisieren (hängt nur an stack + Punkt, nicht am Slider).
 */
export function pointPoPSeries(stack: RadarStack, lat: number, lon: number): PointPoP[] {
  if (stack.source !== 'radolan_rv') return [];   // Ensemble-PoP nur für DE/RADOLAN
  const now = stack.frames.find((f) => f.leadMinutes === 0);
  const p5 = stack.frames.find((f) => f.leadMinutes === 5);
  if (!now || !p5) return [];

  const a = coarsenFrameU8(now.values, now.width, now.height, FLOW_FACTOR);
  const b = coarsenFrameU8(p5.values, p5.width, p5.height, FLOW_FACTOR);
  const flow = estimateFlowHS(a.data, b.data, a.W, a.H, { alpha: 0.5, iters: 100 });

  const leads = stack.frames.filter((f) => f.leadMinutes >= 0).map((f) => f.leadMinutes);
  const u8 = new Uint8Array(a.data.length);   // prob×255 → reuse des Quad-Samplers (vmax=1)
  const out: PointPoP[] = [];
  for (const lead of leads) {
    const { prob } = advectEnsembleProb(a.data, flow, lead / FLOW_INTERVAL_MIN);
    for (let i = 0; i < prob.length; i++) {
      const p = prob[i] < 0 ? 0 : prob[i] > 1 ? 1 : prob[i];
      u8[i] = Math.round(p * 255);
    }
    const v = sampleRadarQuad(u8, flow.w, flow.h, stack.corners, lat, lon, 1);
    out.push({ leadMinutes: lead, prob: v == null ? 0 : Math.max(0, Math.min(1, v)) });
  }
  return out;
}

/** Höchste PoP innerhalb der nächsten `withinMin` Minuten (für die Schlagzeile). */
export function peakPoP(pop: PointPoP[], withinMin = 60): number {
  let max = 0;
  for (const p of pop) if (p.leadMinutes <= withinMin && p.prob > max) max = p.prob;
  return max;
}

// ---------------------------------------------------------------------------
// Verify (headless, DEV) — gegen den LIVE-Stack (DWD RADOLAN-RV)
// ---------------------------------------------------------------------------
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyPointPoP: (lat?: number, lon?: number) => Promise<unknown> }).__verifyPointPoP =
    async (lat = 50.11, lon = 8.68 /* Frankfurt */) => {
      const { getRadarStack } = await import('./radarFrames');
      const stack = await getRadarStack('DE');
      const t0 = performance.now();
      const pop = pointPoPSeries(stack, lat, lon);
      const ms = Math.round(performance.now() - t0);
      const checks: { name: string; ok: boolean; detail?: string }[] = [];
      const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
      add('Quelle ist RADOLAN-RV', stack.source === 'radolan_rv', stack.source);
      add('Serie nicht leer', pop.length > 0, `${pop.length} Leads`);
      add('Leads ab 0 aufsteigend', pop.length > 0 && pop[0].leadMinutes === 0 && pop.every((p, i) => i === 0 || p.leadMinutes > pop[i - 1].leadMinutes));
      add('prob in [0,1]', pop.every((p) => p.prob >= 0 && p.prob <= 1));
      add('PoP wächst tendenziell mit Lead (Ensemble streut)', pop.length > 2 && peakPoP(pop, pop[pop.length - 1].leadMinutes) >= peakPoP(pop, 5) - 1e-6);
      add('peakPoP(60) ⊆ [0,1]', (() => { const x = peakPoP(pop, 60); return x >= 0 && x <= 1; })());
      const passed = checks.filter((c) => c.ok).length;
      return { checks, passed, failed: checks.length - passed, computeMs: ms, peak60: peakPoP(pop, 60), sample: pop.slice(0, 6) };
    };
}
