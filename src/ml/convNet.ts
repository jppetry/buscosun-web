/**
 * Differenzierbares Mini-CNN (ML #4) — von Grund auf, ohne Tensor-Lib.
 *
 * Genau so viel, wie ein kleiner Radar-Nowcaster braucht: 2D-Faltung (same-
 * padding, stride 1) mit Vorwärts- UND Rückwärtspfad, ReLU, MSE-Loss und Adam.
 * Pure TypeScript/Float32Array — läuft headless in Node (Training) wie im
 * Browser (nur Forward, Inferenz).
 *
 * Der ehrliche Beweis, dass das „Training" echt und korrekt ist, ist der
 * **numerische Gradient-Check** in {@link verifyConvNet}: analytische Gradienten
 * (Backprop) vs. finite Differenzen müssen übereinstimmen.
 */

export interface Tensor { data: Float32Array; C: number; H: number; W: number }

export function zeros(C: number, H: number, W: number): Tensor {
  return { data: new Float32Array(C * H * W), C, H, W };
}

/** Parameter + zugehöriger Gradient (für den Optimizer). */
export interface Param { value: Float32Array; grad: Float32Array }

export interface Layer {
  forward(x: Tensor): Tensor;
  backward(dOut: Tensor): Tensor;
  params(): Param[];
}

// ---------------------------------------------------------------------------
// 2D-Faltung (same padding, stride 1)
// ---------------------------------------------------------------------------

export class Conv2D implements Layer {
  readonly cin: number; readonly cout: number; readonly k: number; readonly pad: number;
  W: Float32Array; b: Float32Array;
  dW: Float32Array; db: Float32Array;
  private last: Tensor | null = null;

  constructor(cin: number, cout: number, k: number, init?: (n: number) => Float32Array) {
    this.cin = cin; this.cout = cout; this.k = k; this.pad = (k - 1) >> 1;
    const wlen = cout * cin * k * k;
    this.W = init ? init(wlen) : new Float32Array(wlen);
    this.b = new Float32Array(cout);
    this.dW = new Float32Array(wlen);
    this.db = new Float32Array(cout);
  }

  forward(x: Tensor): Tensor {
    this.last = x;
    const { cin, cout, k, pad } = this;
    const H = x.H, W = x.W;
    const out = zeros(cout, H, W);
    const xd = x.data, od = out.data, Wt = this.W, b = this.b;
    const kk = k * k, cinkk = cin * kk;
    for (let co = 0; co < cout; co++) {
      const wbase = co * cinkk;
      for (let y = 0; y < H; y++) {
        for (let xx = 0; xx < W; xx++) {
          let s = b[co];
          for (let ci = 0; ci < cin; ci++) {
            const xcb = ci * H * W, wcb = wbase + ci * kk;
            for (let ky = 0; ky < k; ky++) {
              const iy = y + ky - pad; if (iy < 0 || iy >= H) continue;
              const xrow = xcb + iy * W, wrow = wcb + ky * k;
              for (let kx = 0; kx < k; kx++) {
                const ix = xx + kx - pad; if (ix < 0 || ix >= W) continue;
                s += xd[xrow + ix] * Wt[wrow + kx];
              }
            }
          }
          od[co * H * W + y * W + xx] = s;
        }
      }
    }
    return out;
  }

  backward(dOut: Tensor): Tensor {
    const x = this.last!;
    const { cin, cout, k, pad } = this;
    const H = x.H, W = x.W;
    const din = zeros(cin, H, W);
    const xd = x.data, dod = dOut.data, did = din.data, Wt = this.W;
    const kk = k * k, cinkk = cin * kk, hw = H * W;
    for (let co = 0; co < cout; co++) {
      const wbase = co * cinkk;
      let dbco = 0;
      for (let y = 0; y < H; y++) {
        for (let xx = 0; xx < W; xx++) {
          const go = dod[co * hw + y * W + xx];
          if (go === 0) continue;
          dbco += go;
          for (let ci = 0; ci < cin; ci++) {
            const xcb = ci * hw, wcb = wbase + ci * kk;
            for (let ky = 0; ky < k; ky++) {
              const iy = y + ky - pad; if (iy < 0 || iy >= H) continue;
              const xrow = xcb + iy * W, wrow = wcb + ky * k;
              for (let kx = 0; kx < k; kx++) {
                const ix = xx + kx - pad; if (ix < 0 || ix >= W) continue;
                const xi = xrow + ix;
                this.dW[wrow + kx] += go * xd[xi];
                did[xi] += go * Wt[wrow + kx];
              }
            }
          }
        }
      }
      this.db[co] += dbco;
    }
    return din;
  }

  params(): Param[] { return [{ value: this.W, grad: this.dW }, { value: this.b, grad: this.db }]; }
}

// ---------------------------------------------------------------------------
// ReLU
// ---------------------------------------------------------------------------

export class ReLU implements Layer {
  private mask: Uint8Array | null = null;
  forward(x: Tensor): Tensor {
    const out = zeros(x.C, x.H, x.W);
    this.mask = new Uint8Array(x.data.length);
    for (let i = 0; i < x.data.length; i++) { const v = x.data[i]; if (v > 0) { out.data[i] = v; this.mask[i] = 1; } }
    return out;
  }
  backward(dOut: Tensor): Tensor {
    const din = zeros(dOut.C, dOut.H, dOut.W);
    const m = this.mask!;
    for (let i = 0; i < dOut.data.length; i++) if (m[i]) din.data[i] = dOut.data[i];
    return din;
  }
  params(): Param[] { return []; }
}

// ---------------------------------------------------------------------------
// Sequentielles Modell
// ---------------------------------------------------------------------------

export class Sequential {
  constructor(public layers: Layer[]) {}
  forward(x: Tensor): Tensor { let t = x; for (const l of this.layers) t = l.forward(t); return t; }
  backward(dOut: Tensor): Tensor { let g = dOut; for (let i = this.layers.length - 1; i >= 0; i--) g = this.layers[i].backward(g); return g; }
  params(): Param[] { return this.layers.flatMap((l) => l.params()); }
  zeroGrad(): void { for (const p of this.params()) p.grad.fill(0); }
  /** Alle Gewichte als flaches Array (für Export). */
  flatWeights(): number[] { const out: number[] = []; for (const p of this.params()) for (let i = 0; i < p.value.length; i++) out.push(p.value[i]); return out; }
  /** Gewichte aus flachem Array laden (für Import gebündelter Gewichte). */
  loadFlatWeights(flat: number[]): void { let o = 0; for (const p of this.params()) for (let i = 0; i < p.value.length; i++) p.value[i] = flat[o++]; }
}

// ---------------------------------------------------------------------------
// Loss + Adam
// ---------------------------------------------------------------------------

/** MSE-Loss + Gradient bzgl. der Vorhersage. */
export function mseLoss(pred: Tensor, target: Tensor): { loss: number; grad: Tensor } {
  const n = pred.data.length;
  const grad = zeros(pred.C, pred.H, pred.W);
  let loss = 0;
  for (let i = 0; i < n; i++) { const d = pred.data[i] - target.data[i]; loss += d * d; grad.data[i] = (2 * d) / n; }
  return { loss: loss / n, grad };
}

export class Adam {
  private m: Float32Array[] = []; private v: Float32Array[] = []; private t = 0;
  constructor(private params: Param[], private lr = 0.01, private b1 = 0.9, private b2 = 0.999, private eps = 1e-8) {
    for (const p of params) { this.m.push(new Float32Array(p.value.length)); this.v.push(new Float32Array(p.value.length)); }
  }
  step(): void {
    this.t++;
    const bc1 = 1 - Math.pow(this.b1, this.t), bc2 = 1 - Math.pow(this.b2, this.t);
    for (let j = 0; j < this.params.length; j++) {
      const p = this.params[j], m = this.m[j], v = this.v[j];
      for (let i = 0; i < p.value.length; i++) {
        const g = p.grad[i];
        m[i] = this.b1 * m[i] + (1 - this.b1) * g;
        v[i] = this.b2 * v[i] + (1 - this.b2) * g * g;
        p.value[i] -= this.lr * (m[i] / bc1) / (Math.sqrt(v[i] / bc2) + this.eps);
      }
    }
  }
}

/** He-artige Initialisierung (deterministisch via LCG). */
export function heInit(seed: number, fanIn: number): (n: number) => Float32Array {
  const rng = lcg(seed);
  const scale = Math.sqrt(2 / Math.max(1, fanIn));
  return (n: number) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = (rng() * 2 - 1) * scale; return a; };
}

export function lcg(seed: number): () => number { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// ---------------------------------------------------------------------------
// Verify (headless) — der Beweis, dass Backprop korrekt ist
// ---------------------------------------------------------------------------

export interface CnCheck { name: string; ok: boolean; detail?: string }
export interface CnVerifyResult { checks: CnCheck[]; passed: number; failed: number }

function tensorFrom(rng: () => number, C: number, H: number, W: number): Tensor {
  const t = zeros(C, H, W);
  for (let i = 0; i < t.data.length; i++) t.data[i] = rng() * 2 - 1;
  return t;
}

export function verifyConvNet(): CnVerifyResult {
  const checks: CnCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // --- Numerischer Gradient-Check ---
  const rng = lcg(123);
  const model = new Sequential([
    new Conv2D(2, 3, 3, heInit(1, 18)),
    new ReLU(),
    new Conv2D(3, 1, 3, heInit(2, 27)),
  ]);
  const x = tensorFrom(rng, 2, 5, 5);
  const target = tensorFrom(rng, 1, 5, 5);

  const computeLoss = (): number => mseLoss(model.forward(x), target).loss;

  // analytisch
  model.zeroGrad();
  const pred = model.forward(x);
  const { grad } = mseLoss(pred, target);
  model.backward(grad);

  const eps = 1e-3;
  let maxRel = 0;
  for (const p of model.params()) {
    const n = Math.min(p.value.length, 12); // Stichprobe je Param-Tensor
    for (let i = 0; i < n; i++) {
      const orig = p.value[i];
      p.value[i] = orig + eps; const lp = computeLoss();
      p.value[i] = orig - eps; const lm = computeLoss();
      p.value[i] = orig;
      const numeric = (lp - lm) / (2 * eps);
      const analytic = p.grad[i];
      const rel = Math.abs(numeric - analytic) / (Math.abs(numeric) + Math.abs(analytic) + 1e-8);
      if (rel > maxRel) maxRel = rel;
    }
  }
  add('Gradient-Check: analytisch ≈ numerisch', maxRel < 1e-2, `maxRel ${maxRel.toExponential(2)}`);

  // --- Lern-Test: Netz lernt eine 1-px-Verschiebung (Advektion) ---
  const learn = new Sequential([
    new Conv2D(1, 4, 3, heInit(7, 9)),
    new ReLU(),
    new Conv2D(4, 1, 3, heInit(8, 36)),
  ]);
  const opt = new Adam(learn.params(), 0.02);
  // Trainingsdaten: zufällige Blob-Felder; Ziel = um 1 px nach rechts verschoben.
  const rng2 = lcg(55);
  const makePair = (): { inp: Tensor; tgt: Tensor } => {
    const inp = zeros(1, 8, 8);
    for (let y = 0; y < 8; y++) for (let xx = 0; xx < 8; xx++) inp.data[y * 8 + xx] = rng2() < 0.5 ? rng2() : 0;
    const tgt = zeros(1, 8, 8);
    for (let y = 0; y < 8; y++) for (let xx = 1; xx < 8; xx++) tgt.data[y * 8 + xx] = inp.data[y * 8 + (xx - 1)];
    return { inp, tgt };
  };
  let firstLoss = 0, lastLoss = 0;
  for (let it = 0; it < 400; it++) {
    const { inp, tgt } = makePair();
    learn.zeroGrad();
    const pr = learn.forward(inp);
    const { loss, grad: g } = mseLoss(pr, tgt);
    learn.backward(g);
    opt.step();
    if (it === 0) firstLoss = loss; lastLoss = loss;
  }
  add('Lern-Test: Loss sinkt deutlich', lastLoss < firstLoss * 0.4, `${firstLoss.toFixed(4)} → ${lastLoss.toFixed(4)}`);

  // --- Export/Import-Roundtrip ---
  const flat = learn.flatWeights();
  const clone = new Sequential([new Conv2D(1, 4, 3), new ReLU(), new Conv2D(4, 1, 3)]);
  clone.loadFlatWeights(flat);
  const a = makePair();
  const e1 = learn.forward(a.inp).data[20], e2 = clone.forward(a.inp).data[20];
  add('Gewichte-Roundtrip identisch', Math.abs(e1 - e2) < 1e-6);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyConvNet: typeof verifyConvNet }).__verifyConvNet = verifyConvNet;
}
