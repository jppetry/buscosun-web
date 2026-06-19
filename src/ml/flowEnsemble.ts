/**
 * Stochastischer Lagrange-Ensemble-Nowcast → ECHTER Ensemble-Spread für den
 * Vertrauens-Schleier (PoP-Modus). Statt einer Entropie-Heuristik auf einem
 * Einzelfeld werden N Member erzeugt, indem das aktuelle Radar mit GESTÖRTEN
 * Bewegungsfeldern advehiert wird (±Tempo, ±Richtung — die dominante Nowcast-
 * Fehlerquelle: Verlagerungs-Unsicherheit). Die Ensemble-Regenwahrscheinlichkeit
 * je Zelle = Anteil der Member, die die Zelle benetzen.
 *
 * Das ist das operationelle Verfahren (pysteps/STEPS-artig). Die Unsicherheit
 * wächst INTRINSISCH mit der Lead-Zeit (Member divergieren ∝ k) — genau das, was
 * dem flachen `leadWeight` fehlte. Übereinstimmung der Member = ehrliche Sicherheit:
 * scharfe/schnelle Niederschlagskanten streuen → unsicher; solider/stationärer
 * Regen oder klar trocken → sicher.
 *
 * Rein & headless prüfbar ({@link verifyFlowEnsemble}).
 */

import { advect, type Flow } from './opticalFlowNowcast';
import { brier, reliabilityBins, expectedCalibrationError } from './metrics';

export interface EnsMember { scale: number; theta: number }

/**
 * Deterministisches Member-Design (kein Zufall): Kreuzprodukt aus Tempo-Skalen
 * und Richtungs-Rotationen — repräsentiert ±30 % Geschwindigkeits- und ±12°
 * Richtungs-Unsicherheit des Bewegungsfeldes. 5×3 = 15 Member.
 */
export function ensembleMembers(): EnsMember[] {
  const scales = [0.7, 0.85, 1.0, 1.15, 1.3];
  const degs = [-12, 0, 12];
  const out: EnsMember[] = [];
  for (const s of scales) for (const d of degs) out.push({ scale: s, theta: (d * Math.PI) / 180 });
  return out;
}

/** Fluss rotieren (theta) + skalieren (scale) → gestörtes Bewegungsfeld. */
export function perturbFlow(flow: Flow, scale: number, theta: number): Flow {
  const c = Math.cos(theta), s = Math.sin(theta);
  const n = flow.u.length;
  const u = new Float32Array(n), v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const uu = flow.u[i], vv = flow.v[i];
    u[i] = scale * (uu * c - vv * s);
    v[i] = scale * (uu * s + vv * c);
  }
  return { u, v, w: flow.w, h: flow.h };
}

export interface EnsembleResult { prob: Float32Array; mean: Float32Array; members: number }

/**
 * Ensemble-Regenwahrscheinlichkeit + -Mittel bei Lead `k` (Frame-Intervalle).
 * `threshold` = Nass-Schwelle auf dem normalisierten Feld (≈ precipToU8-Schwelle).
 */
export function advectEnsembleProb(
  base: Float32Array, flow: Flow, k: number,
  opts: { members?: EnsMember[]; threshold?: number } = {},
): EnsembleResult {
  const members = opts.members ?? ensembleMembers();
  const thr = opts.threshold ?? 0.02;
  const n = base.length;
  const prob = new Float32Array(n), mean = new Float32Array(n);
  for (const m of members) {
    const adv = advect(base, perturbFlow(flow, m.scale, m.theta), k);
    for (let i = 0; i < n; i++) { if (adv[i] >= thr) prob[i] += 1; mean[i] += adv[i]; }
  }
  const inv = 1 / members.length;
  for (let i = 0; i < n; i++) { prob[i] *= inv; mean[i] *= inv; }
  return { prob, mean, members: members.length };
}

// ---------------------------------------------------------------------------
// Verify (headless)
// ---------------------------------------------------------------------------

export interface FeCheck { name: string; ok: boolean; detail?: string }
export interface FeVerifyResult { checks: FeCheck[]; passed: number; failed: number }

function blob(w: number, h: number, cx: number, cy: number, sigma = 5): Float32Array {
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    f[y * w + x] = Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * sigma * sigma));
  }
  return f;
}

export function verifyFlowEnsemble(): FeVerifyResult {
  const checks: FeCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const w = 80, h = 60;
  const base = blob(w, h, 25, 30);
  // Einheitliches Bewegungsfeld nach rechts (3 px / Intervall).
  const flow: Flow = { u: new Float32Array(w * h).fill(3), v: new Float32Array(w * h).fill(0), w, h };

  const ens = advectEnsembleProb(base, flow, 4, { threshold: 0.1 });
  add('15 Member', ens.members === 15);
  add('prob in [0,1]', ens.prob.every((p) => p >= 0 && p <= 1));

  // Kern (wohin ALLE Member den Blob tragen, ~x=25+4*3=37) → prob hoch.
  let maxProb = 0; for (const p of ens.prob) maxProb = Math.max(maxProb, p);
  add('Kern: hohe Übereinstimmung (prob ~1)', maxProb > 0.9, maxProb.toFixed(2));

  // Es gibt Zellen mit Teil-Übereinstimmung (0<prob<1) → echter Spread an Rändern.
  const partial = ens.prob.filter((p) => p > 0.1 && p < 0.9).length;
  add('Rand-Spread vorhanden (0<prob<1)', partial > 10, `${partial}`);

  // Trockene Ferne (weit hinter dem Blob) → prob 0.
  add('weit trocken → prob 0', ens.prob[10 * w + 70] === 0);

  // Längere Lead-Zeit → MEHR Streuung (mehr Teil-Übereinstimmungs-Zellen).
  const near = advectEnsembleProb(base, flow, 2, { threshold: 0.1 });
  const far = advectEnsembleProb(base, flow, 8, { threshold: 0.1 });
  const spread = (e: EnsembleResult) => e.prob.filter((p) => p > 0.1 && p < 0.9).length;
  add('Spread wächst mit Lead-Zeit', spread(far) > spread(near), `${spread(near)} → ${spread(far)}`);

  // Kein Niederschlag → prob überall 0 (keine Phantom-Unsicherheit).
  {
    const dry = advectEnsembleProb(new Float32Array(w * h), flow, 4);
    add('kein Regen → prob überall 0', dry.prob.every((p) => p === 0));
  }

  // perturbFlow: Rotation um 90° dreht (u,v)=(1,0) → ~(0,1).
  {
    const f1: Flow = { u: new Float32Array([1]), v: new Float32Array([0]), w: 1, h: 1 };
    const r = perturbFlow(f1, 1, Math.PI / 2);
    add('perturbFlow: 90°-Drehung (1,0)→(0,1)', Math.abs(r.u[0]) < 1e-6 && Math.abs(r.v[0] - 1) < 1e-6, `(${r.u[0].toFixed(2)},${r.v[0].toFixed(2)})`);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyFlowEnsemble: typeof verifyFlowEnsemble }).__verifyFlowEnsemble = verifyFlowEnsemble;
}

// ---------------------------------------------------------------------------
// Kalibrierungs-Validierung (Ehrlichkeits-Infra): Reliability / Brier / BSS
// ---------------------------------------------------------------------------
//
// Monte-Carlo-Replay mit UNABHÄNGIGER Wahrheit: die „echte" Bewegung wird je
// Szenario KONTINUIERLich aus genau der Unsicherheitsverteilung gezogen, die die
// 15 Member approximieren (Tempo ~U(0,7..1,3), Richtung ~U(±12°)). Das Ensemble
// sieht die Wahrheit nicht. Wenn die Ensemble-PoP korrekt berechnet ist, MUSS sie
// kalibriert sein (vorhergesagte 70 % → ~70 % beobachtet) und Skill gegenüber der
// Klimatologie (Basisrate) haben — sonst steckt ein Fehler im Apparat.
//
// (Ein LIVE-Test „gegen DWD-RV" wäre zirkulär: RV extrapoliert dieselbe Analyse
// wie wir. Echte Live-Wahrheit bräuchte beobachtete Radar-Composites mehrerer
// vergangener Zeitpunkte — separates Produkt, hier bewusst nicht gemacht.)

function lcg(seed: number): () => number { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function verifyEnsembleCalibration(): FeVerifyResult {
  const checks: FeCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  const w = 44, h = 44;
  // Weicher Niederschlags-Blob → reichlich Rand-Zellen mit Zwischen-Wahrscheinlichkeit.
  const base = blob(w, h, 16, 22, 7);
  const V0 = 3; // Grund-Geschwindigkeit (px/Intervall) nach rechts
  const flow: Flow = { u: new Float32Array(w * h).fill(V0), v: new Float32Array(w * h).fill(0), w, h };
  const k = 3;
  const thr = 0.1;
  const members = ensembleMembers();

  // Ensemble-PoP (fest; hängt nur von base/flow/k/Membern ab).
  const { prob } = advectEnsembleProb(base, flow, k, { members, threshold: thr });

  // Member-Spannen (für die kontinuierliche Wahrheits-Ziehung).
  const scales = members.map((m) => m.scale);
  const sMin = Math.min(...scales), sMax = Math.max(...scales);
  const thetas = members.map((m) => m.theta);
  const tMin = Math.min(...thetas), tMax = Math.max(...thetas);

  const rnd = lcg(12345);
  const N = 300;
  const fc: number[] = [], obs: number[] = [];
  for (let n = 0; n < N; n++) {
    const sTrue = sMin + rnd() * (sMax - sMin);
    const thTrue = tMin + rnd() * (tMax - tMin);
    const truth = advect(base, perturbFlow(flow, sTrue, thTrue), k);
    for (let i = 0; i < w * h; i++) { fc.push(prob[i]); obs.push(truth[i] >= thr ? 1 : 0); }
  }

  const b = brier(fc, obs);
  const ece = expectedCalibrationError(fc, obs, 10);
  const bins = reliabilityBins(fc, obs, 10).filter((bn) => bn.count > 0);

  // Skill über die Klimatologie (Basisrate).
  add('BSS > 0 (Skill über Klimatologie)', b.bss > 0.1, `BSS ${b.bss.toFixed(3)}`);
  add('Brier < Basisraten-Brier', b.brier < b.brierRef, `${b.brier.toFixed(3)} < ${b.brierRef.toFixed(3)}`);
  // Kalibrierung: vorhergesagt ≈ beobachtet.
  add('gut kalibriert (ECE < 0,08)', ece < 0.08, `ECE ${ece.toFixed(3)}`);
  // Reliability monoton: höhere Vorhersage → höhere beobachtete Häufigkeit.
  {
    const lo = bins[0], hi = bins[bins.length - 1];
    add('Reliability monoton steigend', hi.observed > lo.observed, `${lo.observed.toFixed(2)} … ${hi.observed.toFixed(2)}`);
    const maxErr = Math.max(...bins.map((bn) => Math.abs(bn.forecast - bn.observed)));
    add('jeder Bin nahe der Diagonale (<0,15)', maxErr < 0.15, `maxΔ ${maxErr.toFixed(3)}`);
  }
  // Sicheres-trockenes-/Kern-Verhalten: PoP 0 → nie beobachtet, PoP 1 → immer.
  {
    let dryFc0 = 0, dryObs0 = 0, wetFc1 = 0, wetObs1 = 0;
    for (let i = 0; i < fc.length; i++) {
      if (fc[i] === 0) { dryFc0++; dryObs0 += obs[i]; }
      else if (fc[i] === 1) { wetFc1++; wetObs1 += obs[i]; }
    }
    add('PoP 0 → ~nie Regen', dryFc0 > 0 && dryObs0 / dryFc0 < 0.02, `${(dryObs0 / Math.max(1, dryFc0)).toFixed(3)}`);
    add('PoP 1 → ~immer Regen', wetFc1 > 0 && wetObs1 / wetFc1 > 0.98, `${(wetObs1 / Math.max(1, wetFc1)).toFixed(3)}`);
  }

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyEnsembleCalibration: typeof verifyEnsembleCalibration }).__verifyEnsembleCalibration = verifyEnsembleCalibration;
}
