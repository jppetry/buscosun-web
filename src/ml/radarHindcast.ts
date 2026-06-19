/**
 * Echtes Radar-Hindcast — nicht-zirkuläre Live-Validierung des Flow-Ensembles
 * gegen BEOBACHTETES Radar. Aus beobachteten RADOLAN-Analysen bei T−Δ wird der
 * Niederschlag vorhergesagt und gegen die SPÄTERE beobachtete Analyse bei T
 * verifiziert (Reliability/Brier/BSS). Der DWD-Forecast wird NIE als Wahrheit
 * benutzt — Eingabe und Wahrheit sind beide echte _000-Analysen aufeinander-
 * folgender RV-Läufe (5-Min-Schritte).
 *
 * `hindcastScore` ist rein & headless prüfbar; `runRadarHindcast` holt die echten
 * Beobachtungen (DEV-Hook). Ehrlichkeits-Infra im Geist von „Wetter, das seine
 * Arbeit zeigt".
 */

import { estimateFlowHS } from './opticalFlowNowcast';
import { advectEnsembleProb } from './flowEnsemble';
import { brier, reliabilityBins, expectedCalibrationError, csi, type ReliabilityBin } from './metrics';

const HINDCAST_FACTOR = 8;     // RADOLAN ~1100×1200 → ~140×150
const HINDCAST_FRAMES = 4;     // Beobachtungen: flow(0,5) + Basis@5 + Verifikation @+5,+10
const RAIN_THR = 0.02;         // Nass-Schwelle auf dem normalisierten Feld

/** Avg-Pool eines RADOLAN-u8-Frames → gröberes normalisiertes Feld [0,1]. */
function coarsen(values: Uint8Array, w: number, h: number, factor: number): { field: Float32Array; W: number; H: number } {
  const W = Math.max(1, Math.floor(w / factor)), H = Math.max(1, Math.floor(h / factor));
  const field = new Float32Array(W * H);
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      let sum = 0, n = 0;
      for (let dy = 0; dy < factor; dy++) {
        const yy = cy * factor + dy; if (yy >= h) break;
        const row = yy * w;
        for (let dx = 0; dx < factor; dx++) {
          const xx = cx * factor + dx; if (xx >= w) break;
          sum += values[row + xx]; n++;
        }
      }
      field[cy * W + cx] = n ? (sum / n) / 255 : 0;
    }
  }
  return { field, W, H };
}

export interface HindcastFrame { field: Float32Array; w: number; h: number; leadMin: number }
export interface HindcastLead { leadMin: number; brier: number; bss: number; ece: number; csi: number; n: number }
export interface HindcastResult {
  leads: HindcastLead[];
  overall: { brier: number; brierRef: number; bss: number; ece: number; csi: number; baseRate: number; n: number };
  reliability: ReliabilityBin[];
  intervalMin: number;
}

/**
 * Bewertet das Flow-Ensemble gegen beobachtete Frames (aufsteigend nach leadMin).
 * frames[0],[1] → Bewegungsfeld; Basis = frames[1]; jede spätere Beobachtung ist
 * eine echte Verifikation. Liefert Reliability/Brier/BSS je Lead + gesamt.
 */
export function hindcastScore(frames: HindcastFrame[], opts: { threshold?: number } = {}): HindcastResult | null {
  if (frames.length < 3) return null;
  const thr = opts.threshold ?? RAIN_THR;
  const { w, h } = frames[0];
  const flow = estimateFlowHS(frames[0].field, frames[1].field, w, h, { alpha: 0.5, iters: 100 });
  const intervalMin = frames[1].leadMin - frames[0].leadMin || 5;
  const base = frames[1].field;
  const baseLead = frames[1].leadMin;

  const allFc: number[] = [], allObs: number[] = [];
  const leads: HindcastLead[] = [];
  for (let j = 2; j < frames.length; j++) {
    const k = (frames[j].leadMin - baseLead) / intervalMin;
    if (k <= 0) continue;
    const { prob } = advectEnsembleProb(base, flow, k, { threshold: thr });
    const fc: number[] = [], obs: number[] = [];
    const truth = frames[j].field;
    for (let i = 0; i < w * h; i++) { fc.push(prob[i]); obs.push(truth[i] >= thr ? 1 : 0); }
    const b = brier(fc, obs);
    leads.push({ leadMin: frames[j].leadMin - baseLead, brier: b.brier, bss: b.bss, ece: expectedCalibrationError(fc, obs, 10), csi: csi(fc, obs).csi, n: b.n });
    for (let i = 0; i < fc.length; i++) { allFc.push(fc[i]); allObs.push(obs[i]); }
  }
  if (leads.length === 0) return null;
  const ob = brier(allFc, allObs);
  return {
    leads,
    overall: { brier: ob.brier, brierRef: ob.brierRef, bss: ob.bss, ece: expectedCalibrationError(allFc, allObs, 10), csi: csi(allFc, allObs).csi, baseRate: ob.baseRate, n: ob.n },
    reliability: reliabilityBins(allFc, allObs, 10).filter((bn) => bn.count > 0),
    intervalMin,
  };
}

export interface LiveHindcast extends HindcastResult { observedAt: string[]; initAt: string }

/**
 * Holt die letzten beobachteten RADOLAN-Analysen und bewertet das Ensemble dagegen.
 * Nur DE. Lädt einige RV-Tars (opt-in / on-demand) — nicht auf dem Render-Pfad.
 */
export async function runRadarHindcast(signal?: AbortSignal): Promise<LiveHindcast | null> {
  const { fetchRvAnalysisSequence } = await import('../sources/radolan');
  const { frames } = await fetchRvAnalysisSequence(HINDCAST_FRAMES, signal);
  if (frames.length < 3) return null;
  const t0 = frames[0].validAt.getTime();
  const hf: HindcastFrame[] = frames.map((f) => {
    const c = coarsen(f.values, f.width, f.height, HINDCAST_FACTOR);
    return { field: c.field, w: c.W, h: c.H, leadMin: Math.round((f.validAt.getTime() - t0) / 60000) };
  });
  const res = hindcastScore(hf);
  if (!res) return null;
  const hhmm = (d: Date) => d.toISOString().slice(11, 16);
  return { ...res, observedAt: frames.map((f) => hhmm(f.validAt)), initAt: hhmm(frames[1].validAt) };
}

// ---------------------------------------------------------------------------
// Verify (headless) — Scoring-Pipeline auf synthetischer bewegter Sequenz
// ---------------------------------------------------------------------------

export interface HcCheck { name: string; ok: boolean; detail?: string }
export interface HcVerifyResult { checks: HcCheck[]; passed: number; failed: number }

function blob(w: number, h: number, cx: number, cy: number, sigma = 6): Float32Array {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) f[y * w + x] = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma));
  return f;
}

export function verifyRadarHindcast(): HcVerifyResult {
  const checks: HcCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Synthetische BEOBACHTETE Sequenz: Blob wandert deterministisch (+3,0)/Schritt.
  const w = 70, h = 50;
  const frames: HindcastFrame[] = [0, 1, 2, 3].map((step) => ({ field: blob(w, h, 16 + step * 3, 25), w, h, leadMin: step * 5 }));

  const res = hindcastScore(frames);
  add('Ergebnis vorhanden', !!res);
  if (res) {
    add('Verifikations-Leads = N−2', res.leads.length === 2, `${res.leads.length}`);
    add('BSS > 0 (Skill über Klimatologie)', res.overall.bss > 0.1, `BSS ${res.overall.bss.toFixed(3)}`);
    add('Brier < Basisraten-Brier', res.overall.brier < res.overall.brierRef, `${res.overall.brier.toFixed(3)} < ${res.overall.brierRef.toFixed(3)}`);
    add('je Lead Skill (BSS>0)', res.leads.every((l) => l.bss > 0), res.leads.map((l) => l.bss.toFixed(2)).join(','));
  }
  // Zu wenige Frames → null.
  add('zu wenige Frames → null', hindcastScore([frames[0], frames[1]]) === null);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  const g = window as unknown as { __verifyRadarHindcast: typeof verifyRadarHindcast; __radarHindcast: typeof runRadarHindcast };
  g.__verifyRadarHindcast = verifyRadarHindcast;
  g.__radarHindcast = runRadarHindcast;
}
