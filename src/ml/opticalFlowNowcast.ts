/**
 * Optical-Flow-Nowcast („Weg A") — der ehrliche, trainingsfreie Radar-Nowcast:
 * aus zwei aufeinanderfolgenden Radar-Frames wird per **Horn-Schunck** ein dichtes
 * Bewegungsfeld geschätzt, und der jüngste Frame wird **semi-Lagrange** entlang
 * dieses Feldes vorwärts advehiert (Lagrange-Persistenz). Anders als das Demo-CNN
 * (ML #4) bleibt die Niederschlagsintensität erhalten — Regen WANDERT, statt zu
 * verschwinden — und jede Lead-Zeit ist stufenlos (Advektion ∝ leadMin).
 *
 * Rein & headless prüfbar ({@link verifyOpticalFlow}); kein DOM/Netzwerk.
 */

export interface Flow { u: Float32Array; v: Float32Array; w: number; h: number }

const clampIdx = (x: number, n: number) => (x < 0 ? 0 : x >= n ? n - 1 : x);

/**
 * Horn-Schunck-Fluss zwischen zwei Feldern a→b (px pro Frame-Intervall). `alpha`
 * gewichtet die Glättung (größer = glatter), `iters` die Jacobi-Iterationen.
 */
export function estimateFlowHS(
  a: Float32Array, b: Float32Array, w: number, h: number,
  opts: { alpha?: number; iters?: number } = {},
): Flow {
  const alpha = opts.alpha ?? 1;
  const iters = opts.iters ?? 80;
  const n = w * h;
  const Ix = new Float32Array(n), Iy = new Float32Array(n), It = new Float32Array(n);
  const at = (f: Float32Array, x: number, y: number) => f[clampIdx(y, h) * w + clampIdx(x, w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Zentrale Differenzen auf dem Mittel beider Frames (robuster).
      Ix[i] = 0.25 * ((at(a, x + 1, y) - at(a, x - 1, y)) + (at(b, x + 1, y) - at(b, x - 1, y)));
      Iy[i] = 0.25 * ((at(a, x, y + 1) - at(a, x, y - 1)) + (at(b, x, y + 1) - at(b, x, y - 1)));
      It[i] = b[i] - a[i];
    }
  }
  const u = new Float32Array(n), v = new Float32Array(n);
  const a2 = alpha * alpha;
  const ubar = new Float32Array(n), vbar = new Float32Array(n);
  for (let it = 0; it < iters; it++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        ubar[i] = 0.25 * (at(u, x - 1, y) + at(u, x + 1, y) + at(u, x, y - 1) + at(u, x, y + 1));
        vbar[i] = 0.25 * (at(v, x - 1, y) + at(v, x + 1, y) + at(v, x, y - 1) + at(v, x, y + 1));
      }
    }
    for (let i = 0; i < n; i++) {
      const num = Ix[i] * ubar[i] + Iy[i] * vbar[i] + It[i];
      const den = a2 + Ix[i] * Ix[i] + Iy[i] * Iy[i];
      const f = num / den;
      u[i] = ubar[i] - Ix[i] * f;
      v[i] = vbar[i] - Iy[i] * f;
    }
  }
  return { u, v, w, h };
}

/** Bilineare Abtastung mit Rand-Klemmung. */
function sampleBilinear(field: Float32Array, w: number, h: number, x: number, y: number): number {
  if (x <= -1 || y <= -1 || x >= w || y >= h) return 0; // klar außerhalb → trocken
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const g = (xx: number, yy: number) => field[clampIdx(yy, h) * w + clampIdx(xx, w)];
  const top = g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx;
  const bot = g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bot * fy;
}

/**
 * Semi-Lagrange-Advektion: verschiebt `field` um `k`·Fluss vorwärts (Backtrace
 * vom Zielpixel). Intensitätserhaltend. `k` = leadMin / Frame-Intervall.
 */
export function advect(field: Float32Array, flow: Flow, k: number): Float32Array {
  const { u, v, w, h } = flow;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      out[i] = sampleBilinear(field, w, h, x - k * u[i], y - k * v[i]);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface OfCheck { name: string; ok: boolean; detail?: string }
export interface OfVerifyResult { checks: OfCheck[]; passed: number; failed: number }

/** Gauß-Blob bei (cx,cy) in ein w×h-Feld. */
function blob(w: number, h: number, cx: number, cy: number, sigma = 6): Float32Array {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    f[y * w + x] = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma));
  }
  return f;
}

export function verifyOpticalFlow(): OfVerifyResult {
  const checks: OfCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const w = 60, h = 60;
  // Blob wandert um (+3,+1) px zwischen a und b.
  const a = blob(w, h, 28, 30);
  const b = blob(w, h, 31, 31);
  const flow = estimateFlowHS(a, b, w, h, { alpha: 0.5, iters: 200 });

  // Fluss im Blob-Zentrum ≈ (3,1).
  const ci = 30 * w + 30;
  add('Fluss u ≈ 3 im Zentrum', Math.abs(flow.u[ci] - 3) < 1.2, flow.u[ci].toFixed(2));
  add('Fluss v ≈ 1 im Zentrum', Math.abs(flow.v[ci] - 1) < 1.2, flow.v[ci].toFixed(2));

  // Advektion von a um 1 Schritt ≈ b (kleinerer Fehler als ohne Advektion).
  const adv = advect(a, flow, 1);
  let mseAdv = 0, mseNone = 0;
  for (let i = 0; i < w * h; i++) { mseAdv += (adv[i] - b[i]) ** 2; mseNone += (a[i] - b[i]) ** 2; }
  mseAdv /= w * h; mseNone /= w * h;
  add('Advektion senkt MSE vs. Persistenz', mseAdv < mseNone * 0.5, `${mseAdv.toExponential(1)} < ${mseNone.toExponential(1)}`);

  // Intensität bleibt erhalten (kein Dämpfen): Maximum ~gleich.
  let maxA = 0, maxAdv = 0;
  for (let i = 0; i < w * h; i++) { if (a[i] > maxA) maxA = a[i]; if (adv[i] > maxAdv) maxAdv = adv[i]; }
  add('Intensität erhalten (Max ~gleich)', maxAdv > 0.9 * maxA, `${maxAdv.toFixed(2)} vs ${maxA.toFixed(2)}`);

  // Mehrschritt advehiert weiter (Blob-Schwerpunkt wandert mit k).
  const adv3 = advect(a, flow, 3);
  let sx1 = 0, s1 = 0, sx3 = 0, s3 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const p1 = adv[y * w + x], p3 = adv3[y * w + x]; sx1 += x * p1; s1 += p1; sx3 += x * p3; s3 += p3; }
  add('Mehrschritt wandert weiter (cx steigt)', (sx3 / s3) > (sx1 / s1), `${(sx1 / s1).toFixed(1)} → ${(sx3 / s3).toFixed(1)}`);

  // Null-Bewegung (a==b) → Fluss ~0, Advektion ~Identität.
  {
    const z = estimateFlowHS(a, a, w, h, { alpha: 1, iters: 50 });
    let maxAbs = 0; for (let i = 0; i < w * h; i++) maxAbs = Math.max(maxAbs, Math.abs(z.u[i]), Math.abs(z.v[i]));
    add('keine Bewegung → Fluss ≈ 0', maxAbs < 0.05, maxAbs.toFixed(3));
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyOpticalFlow: typeof verifyOpticalFlow }).__verifyOpticalFlow = verifyOpticalFlow;
}
