/**
 * In-Browser-Inferenz des Radar-Nowcasters (ML #4) — lädt die gebündelten
 * Gewichte (lazy, fetch) und läuft als reiner Forward-Pass auf den ECHTEN
 * RADOLAN-Frames. Fully-convolutional → arbeitet auf der (gröberen) Gitterauf-
 * lösung, in der wir die Frames für die Geschwindigkeit herunterrechnen.
 *
 * Kein DOM hier (headless-sicher); das Zeichnen macht die Komponente.
 */

import { buildNowcaster, predictSequence } from './radarNowcastNet';
import type { Sequential, Tensor } from './convNet';
import { zeros } from './convNet';

export interface LoadedNowcaster {
  model: Sequential;
  K: number;
  eval: { mseModel: number; msePersist: number; csiModel: number; csiPersist: number; improvementPct: number };
  note: string;
}

let modelP: Promise<LoadedNowcaster | null> | null = null;

/** Lädt die gebündelten Gewichte (einmal, lazy). null, wenn nicht verfügbar. */
export function loadNowcaster(): Promise<LoadedNowcaster | null> {
  if (!modelP) {
    modelP = (async () => {
      try {
        const res = await fetch('/nowcasterWeights.json');
        if (!res.ok) return null;
        const j = (await res.json()) as { arch: { K: number; channels: number[] }; weights: number[]; eval: LoadedNowcaster['eval']; note: string };
        const model = buildNowcaster(j.arch);
        model.loadFlatWeights(j.weights);
        return { model, K: j.arch.K, eval: j.eval, note: j.note };
      } catch { return null; }
    })();
  }
  return modelP;
}

/**
 * RADOLAN-u8-Frame → gröberes, normalisiertes Feld [1,H',W'] in [0,1] (Avg-Pool).
 *
 * `ceil`, nicht `floor` (KL5): das Ergebnis wird über die VOLLEN DE1200-Ecken
 * gezeichnet. Mit `floor` deckten 137 Spalten nur 1096 der 1100 km ab, das Bild
 * wurde aber über 1100 gespannt — eine Dehnung, die nach Osten auf 4 km anwuchs
 * (`audit/karten-layer-verortung.md` §7a). Der letzte Block ist dann teilweise
 * gefüllt; die `break`-Wächter unten und der Zähler `n` rechnen ihn korrekt.
 */
export function coarsenFrameU8(values: Uint8Array, w: number, h: number, factor: number): Tensor {
  const W = Math.max(1, Math.ceil(w / factor)), H = Math.max(1, Math.ceil(h / factor));
  const t = zeros(1, H, W);
  for (let cy = 0; cy < H; cy++) {
    for (let cx = 0; cx < W; cx++) {
      let sum = 0, n = 0;
      for (let dy = 0; dy < factor; dy++) {
        const yy = cy * factor + dy; if (yy >= h) break;
        const base = yy * w;
        for (let dx = 0; dx < factor; dx++) {
          const xx = cx * factor + dx; if (xx >= w) break;
          sum += values[base + xx]; n++;
        }
      }
      t.data[cy * W + cx] = n ? (sum / n) / 255 : 0;
    }
  }
  return t;
}

export interface NowcastInferenceInput { values: Uint8Array; width: number; height: number }

/**
 * Nimmt die letzten K (gemessenen/jüngsten) Frames und sagt `steps` Frames
 * voraus. Gibt die gröberen Eingabe- und Vorhersage-Felder zurück (für Anzeige
 * + Vergleich gegen das DWD-Frame).
 */
export function predictFromFrames(loaded: LoadedNowcaster, frames: NowcastInferenceInput[], factor: number, steps: number): { input: Tensor[]; preds: Tensor[] } | null {
  if (frames.length < loaded.K) return null;
  const lastK = frames.slice(frames.length - loaded.K).map((f) => coarsenFrameU8(f.values, f.width, f.height, factor));
  const preds = predictSequence(loaded.model, lastK, steps);
  return { input: lastK, preds };
}

// DEV-Hook: In-Browser-Inferenz unabhängig vom (langsamen) RADOLAN-Fetch prüfen.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __kiNowcastTest: () => Promise<unknown> }).__kiNowcastTest = async () => {
    const t0 = performance.now();
    const m = await loadNowcaster();
    if (!m) return { ok: false, reason: 'weights unavailable' };
    // synthetische RADOLAN-artige u8-Frames (3 × 110×120)
    const W = 110, H = 120;
    const frames = [0, 1, 2].map((s) => {
      const values = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d2 = (x - (40 + s * 4)) ** 2 + (y - 60) ** 2;
        values[y * W + x] = Math.max(0, Math.min(255, Math.round(220 * Math.exp(-d2 / 120))));
      }
      return { values, width: W, height: H };
    });
    const res = predictFromFrames(m, frames, 1, 3);
    if (!res) return { ok: false, reason: 'predict null' };
    let max = 0, sum = 0;
    for (const v of res.preds[0].data) { if (v > max) max = v; sum += v; }
    return {
      ok: true, ms: Math.round(performance.now() - t0),
      params: m.model.flatWeights().length, K: m.K,
      predShape: `${res.preds[0].C}x${res.preds[0].H}x${res.preds[0].W}`,
      predMax: Math.round(max * 1000) / 1000, predMean: Math.round((sum / res.preds[0].data.length) * 1000) / 1000,
      eval: m.eval,
    };
  };
}

/**
 * Vorhersage-Feld [1,H,W] in [0,1] → RADOLAN-u8-Grid (precipToU8-Skala). `floor`
 * schneidet sub-schwellige Werte ab (0): das Demo-Netz legt nach mehreren Schritten
 * einen schwachen Schleier über die ganze Domäne — der Boden entfernt diesen
 * Rausch-Nebel, sodass nur belastbare Niederschlagskerne stehen bleiben.
 */
export function tensorToU8(t: Tensor, floor = 0): Uint8Array {
  const u = new Uint8Array(t.data.length);
  for (let i = 0; i < t.data.length; i++) {
    const v = t.data[i];
    u[i] = v <= floor ? 0 : v >= 1 ? 255 : Math.round(v * 255);
  }
  return u;
}

export interface KiNowcastFrame { leadMin: number; values: Uint8Array; width: number; height: number }

/**
 * Karten-fertige KI-Nowcast-Frames: aus den jüngsten RADOLAN-Frames (aufsteigend,
 * 5-min-Schritte) `steps` Frames vorhersagen → u8-Grids mit Lead-Minuten. pred[0]
 * liegt 5 min nach dem letzten Eingabeframe (Eingabe 0/5/10 → 15,20,… min).
 */
export function predictKiNowcastFrames(
  loaded: LoadedNowcaster, frames: NowcastInferenceInput[], factor: number, steps: number, stepMin = 5,
): KiNowcastFrame[] | null {
  const res = predictFromFrames(loaded, frames, factor, steps);
  if (!res) return null;
  // Eingabe-Leads 0..(K−1)·step → letzter = (K−1)·step; erster Pred eine Stufe
  // später = K·step (Eingabe 0/5/10, K=3 → erster Pred +15 min).
  const firstLead = loaded.K * stepMin;
  // Rausch-Boden (~mm/h-Schwelle) gegen den Schleier des Demo-Netzes.
  const NOISE_FLOOR = 0.05;
  return res.preds.map((t, s) => ({ leadMin: firstLead + s * stepMin, values: tensorToU8(t, NOISE_FLOOR), width: t.W, height: t.H }));
}

/** Übereinstimmung zweier Felder: Pearson-Korrelation + CSI (Regen-Trefferquote). */
export function frameAgreement(a: Tensor, b: Tensor, thr = 0.15): { corr: number; csi: number } {
  const n = Math.min(a.data.length, b.data.length);
  let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  let h = 0, m = 0, f = 0;
  for (let i = 0; i < n; i++) {
    const x = a.data[i], y = b.data[i];
    sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
    const xb = x >= thr, yb = y >= thr;
    if (xb && yb) h++; else if (!xb && yb) m++; else if (xb && !yb) f++;
  }
  const cov = sab / n - (sa / n) * (sb / n);
  const va = saa / n - (sa / n) ** 2, vb = sbb / n - (sb / n) ** 2;
  const corr = va > 1e-9 && vb > 1e-9 ? cov / Math.sqrt(va * vb) : 0;
  const csi = h + m + f > 0 ? h / (h + m + f) : 0;
  return { corr: Math.round(corr * 100) / 100, csi: Math.round(csi * 100) / 100 };
}
