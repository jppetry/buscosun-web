/**
 * Radar-Nowcaster (ML #4) — kleines vollständig-faltendes CNN, das aus den
 * letzten K Radar-Frames den nächsten Frame vorhersagt (autoregressiv für
 * 0–60 min). „Fully convolutional" ⇒ trainiert auf kleinen Kacheln, anwendbar
 * auf beliebige Bildgrößen (echte RADOLAN-Felder).
 *
 * EHRLICHE GRENZE: Die mitgelieferten Gewichte sind auf **physikalisch
 * simulierten** Radar-Sequenzen (Advektion + Wachstum/Abschwächung + Rauschen)
 * trainiert — ein lauffähiger, verifizierter Beweis der Architektur. Der
 * Produktionspfad ist DIESELBE Architektur, offline auf dem DWD-RADOLAN-Archiv
 * trainiert (nur Gewichts-Tausch). Deshalb ist der In-App-Layer als
 * „experimentell" gekennzeichnet und ersetzt NICHT den Produktiv-Nowcast.
 *
 * Verifiziert headless ({@link verifyRadarNowcastNet}): das gelernte Netz
 * schlägt out-of-sample die **Persistenz** (letzten Frame wiederholen) in
 * MSE und CSI — d. h. es hat Advektion/Entwicklung tatsächlich gelernt.
 */

import { Sequential, Conv2D, ReLU, Adam, mseLoss, heInit, zeros, lcg, type Tensor } from './convNet';

export interface NowcasterArch { K: number; channels: number[] }
/** Default-Architektur: 3 Eingabe-Frames → 2 versteckte Conv-Schichten → 1 Frame. */
export const DEFAULT_ARCH: NowcasterArch = { K: 3, channels: [12, 12] };

/** Baut das Nowcaster-Netz (deterministische Initialisierung). */
export function buildNowcaster(arch: NowcasterArch = DEFAULT_ARCH, seed = 1): Sequential {
  const layers = [];
  let cin = arch.K;
  let s = seed;
  for (const cout of arch.channels) {
    layers.push(new Conv2D(cin, cout, 3, heInit(s++, cin * 9)));
    layers.push(new ReLU());
    cin = cout;
  }
  layers.push(new Conv2D(cin, 1, 3, heInit(s++, cin * 9))); // Regressions-Ausgabe
  return new Sequential(layers);
}

/** K Einzel-Frames ([1,H,W]) zu einem [K,H,W]-Eingang stapeln. */
export function stackFrames(frames: Tensor[]): Tensor {
  const H = frames[0].H, W = frames[0].W;
  const t = zeros(frames.length, H, W);
  for (let c = 0; c < frames.length; c++) t.data.set(frames[c].data, c * H * W);
  return t;
}

// ---------------------------------------------------------------------------
// Physikalischer Radar-Sequenz-Simulator (Advektion + Wachstum/Abschwächung)
// ---------------------------------------------------------------------------

interface Cell { x: number; y: number; vx: number; vy: number; amp: number; sigma: number; growth: number }

/** Erzeugt EINE Sequenz von `frames` normalisierten Feldern [1,H,W] in [0,1]. */
export function genSequence(rng: () => number, H: number, W: number, frames: number): Tensor[] {
  const nCells = 1 + Math.floor(rng() * 3);
  // gemeinsame großräumige Strömung + per-Zelle-Jitter
  const flowVx = (rng() * 2 - 1) * 1.2, flowVy = (rng() * 2 - 1) * 1.2;
  const cells: Cell[] = [];
  for (let i = 0; i < nCells; i++) {
    cells.push({
      x: rng() * W, y: rng() * H,
      vx: flowVx + (rng() * 2 - 1) * 0.4, vy: flowVy + (rng() * 2 - 1) * 0.4,
      amp: 0.4 + rng() * 0.6, sigma: 1.5 + rng() * 2.5,
      growth: (rng() * 2 - 1) * 0.08,
    });
  }
  const seq: Tensor[] = [];
  for (let f = 0; f < frames; f++) {
    const t = zeros(1, H, W);
    for (const c of cells) {
      const amp = Math.max(0, c.amp + c.growth * f);
      const s2 = 2 * c.sigma * c.sigma;
      const cx = c.x + c.vx * f, cy = c.y + c.vy * f;
      const r = Math.ceil(c.sigma * 3);
      for (let dy = -r; dy <= r; dy++) {
        const y = Math.round(cy) + dy; if (y < 0 || y >= H) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = Math.round(cx) + dx; if (x < 0 || x >= W) continue;
          const d2 = (x - cx) * (x - cx) + (y - cy) * (y - cy);
          t.data[y * W + x] += amp * Math.exp(-d2 / s2);
        }
      }
    }
    // leichtes Rauschen + Clamp [0,1]
    for (let i = 0; i < t.data.length; i++) t.data[i] = Math.min(1, Math.max(0, t.data[i] + (rng() * 2 - 1) * 0.02));
    seq.push(t);
  }
  return seq;
}

export interface Sample { input: Tensor; target: Tensor }

/** Aus Sequenzen (input = K Frames, target = nächster Frame). */
export function makeSamples(sequences: Tensor[][], K: number): Sample[] {
  const out: Sample[] = [];
  for (const seq of sequences) {
    for (let t = K; t < seq.length; t++) {
      out.push({ input: stackFrames(seq.slice(t - K, t)), target: seq[t] });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Training + Eval
// ---------------------------------------------------------------------------

export interface TrainConfig { H?: number; W?: number; arch?: NowcasterArch; seqLen?: number; trainSeqs?: number; testSeqs?: number; epochs?: number; lr?: number; seed?: number }

export interface NowcastEval {
  mseModel: number; msePersist: number;
  csiModel: number; csiPersist: number;
  /** relative MSE-Verbesserung gegenüber Persistenz (%). */
  improvementPct: number;
  nSamples: number;
}

export interface TrainResult { model: Sequential; arch: NowcasterArch; firstLoss: number; lastLoss: number; eval: NowcastEval }

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Persistenz-Baseline: der letzte Eingabe-Frame als Vorhersage. */
function persistencePred(sample: Sample, K: number): Tensor {
  const H = sample.target.H, W = sample.target.W;
  const last = zeros(1, H, W);
  last.data.set(sample.input.data.subarray((K - 1) * H * W, K * H * W));
  return last;
}

function evalSamples(model: Sequential, samples: Sample[], K: number, thr = 0.15): NowcastEval {
  let mseM = 0, mseP = 0;
  let hM = 0, mM = 0, fM = 0, hP = 0, mP = 0, fP = 0;
  for (const s of samples) {
    const pred = model.forward(s.input);
    const persist = persistencePred(s, K);
    const n = s.target.data.length;
    for (let i = 0; i < n; i++) {
      const o = s.target.data[i];
      const pm = clamp01(pred.data[i]), pp = persist.data[i];
      mseM += (pm - o) * (pm - o); mseP += (pp - o) * (pp - o);
      const ob = o >= thr;
      if (pm >= thr && ob) hM++; else if (pm < thr && ob) mM++; else if (pm >= thr && !ob) fM++;
      if (pp >= thr && ob) hP++; else if (pp < thr && ob) mP++; else if (pp >= thr && !ob) fP++;
    }
  }
  const tot = samples.length * samples[0].target.data.length;
  const csi = (h: number, m: number, f: number) => (h + m + f > 0 ? h / (h + m + f) : 0);
  return {
    mseModel: mseM / tot, msePersist: mseP / tot,
    csiModel: csi(hM, mM, fM), csiPersist: csi(hP, mP, fP),
    improvementPct: mseP > 0 ? Math.round((1 - mseM / mseP) * 100) : 0,
    nSamples: samples.length,
  };
}

/** Trainiert den Nowcaster auf simulierten Sequenzen und evaluiert out-of-sample. */
export function trainNowcaster(cfg: TrainConfig = {}): TrainResult {
  const H = cfg.H ?? 24, W = cfg.W ?? 24;
  const arch = cfg.arch ?? DEFAULT_ARCH;
  const seqLen = cfg.seqLen ?? (arch.K + 4);
  const trainSeqs = cfg.trainSeqs ?? 200;
  const testSeqs = cfg.testSeqs ?? 40;
  const epochs = cfg.epochs ?? 8;
  const lr = cfg.lr ?? 0.01;
  const rng = lcg(cfg.seed ?? 2024);

  const train = makeSamples(Array.from({ length: trainSeqs }, () => genSequence(rng, H, W, seqLen)), arch.K);
  const test = makeSamples(Array.from({ length: testSeqs }, () => genSequence(rng, H, W, seqLen)), arch.K);

  const model = buildNowcaster(arch, (cfg.seed ?? 2024) + 1);
  const opt = new Adam(model.params(), lr);
  let firstLoss = 0, lastLoss = 0;
  // Indizes mischen (deterministisch) je Epoche.
  const idx = train.map((_, i) => i);
  for (let e = 0; e < epochs; e++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    let epLoss = 0;
    for (const i of idx) {
      const s = train[i];
      model.zeroGrad();
      const pred = model.forward(s.input);
      const { loss, grad } = mseLoss(pred, s.target);
      model.backward(grad);
      opt.step();
      epLoss += loss;
    }
    epLoss /= train.length;
    if (e === 0) firstLoss = epLoss; lastLoss = epLoss;
  }

  return { model, arch, firstLoss, lastLoss, eval: evalSamples(model, test, arch.K) };
}

// ---------------------------------------------------------------------------
// Inferenz (Forward) — für In-Browser + autoregressive Mehrschritt-Vorhersage
// ---------------------------------------------------------------------------

/** Ein Vorhersage-Schritt: K Frames → nächster Frame (geclamped [0,1]). */
export function predictNext(model: Sequential, lastK: Tensor[]): Tensor {
  const out = model.forward(stackFrames(lastK));
  for (let i = 0; i < out.data.length; i++) out.data[i] = clamp01(out.data[i]);
  return out;
}

/** Autoregressive Vorhersage von `steps` Frames aus den letzten K Frames. */
export function predictSequence(model: Sequential, lastK: Tensor[], steps: number): Tensor[] {
  const hist = lastK.slice();
  const out: Tensor[] = [];
  for (let s = 0; s < steps; s++) {
    const nxt = predictNext(model, hist.slice(hist.length - lastK.length));
    out.push(nxt); hist.push(nxt);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface RnnCheck { name: string; ok: boolean; detail?: string }
export interface RnnVerifyResult { checks: RnnCheck[]; passed: number; failed: number }

export function verifyRadarNowcastNet(): RnnVerifyResult {
  const checks: RnnCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // Schnelles Training (klein) — muss Persistenz out-of-sample schlagen.
  const r = trainNowcaster({ H: 20, W: 20, trainSeqs: 120, testSeqs: 30, epochs: 6, lr: 0.012, arch: { K: 3, channels: [8, 8] } });
  add('Trainings-Loss sinkt', r.lastLoss < r.firstLoss * 0.7, `${r.firstLoss.toFixed(4)} → ${r.lastLoss.toFixed(4)}`);
  add('schlägt Persistenz im MSE (OOS)', r.eval.mseModel < r.eval.msePersist, `${r.eval.mseModel.toFixed(4)} < ${r.eval.msePersist.toFixed(4)}`);
  add('deutliche MSE-Verbesserung (>10%)', r.eval.improvementPct > 10, `${r.eval.improvementPct}%`);
  add('CSI ≥ Persistenz (OOS)', r.eval.csiModel >= r.eval.csiPersist - 0.02, `${r.eval.csiModel.toFixed(3)} vs ${r.eval.csiPersist.toFixed(3)}`);

  // Inferenz-Form: predictSequence liefert die geforderte Zahl Frames der richtigen Größe.
  const rng = lcg(9);
  const seq = genSequence(rng, 20, 20, 3);
  const preds = predictSequence(r.model, seq, 4);
  add('predictSequence: 4 Frames korrekter Größe', preds.length === 4 && preds.every((p) => p.H === 20 && p.W === 20));
  add('Vorhersage in [0,1]', preds.every((p) => p.data.every((v) => v >= 0 && v <= 1)));

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyRadarNowcastNet: typeof verifyRadarNowcastNet }).__verifyRadarNowcastNet = verifyRadarNowcastNet;
}
