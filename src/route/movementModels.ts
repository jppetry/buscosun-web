/**
 * Spezialisierte Geschwindigkeitsmodelle je Bewegungsart.
 *
 *  – Wandern (T1–T2):    DIN 33466 / SAC-Gehzeit
 *  – Bergwandern (T3):   DIN/SAC + Steilstufen-Aufschlag (>25 % Hang)
 *  – Jogging:            Lauf-Pace mit linearer Grad-Penalty (Asphalt)
 *  – Trail-Running:      Lauf-Pace + Trail-Overhead, gradtoleranter
 *  – Rennrad / Gravel / MTB: Steigungsmodell mit modusspezifischer Härte
 *  – E-Bike Trekking:    Motor halbiert Steigungsverlust, Flach-Cap 25 km/h
 *
 * Alle Modelle nehmen Länge (m), Höhendifferenz (m) und das Profil; sie liefern
 * die Reisedauer in Sekunden. Die Wahl des Modells erfolgt über die
 * Bewegungsart-ID. `verifyModels()` prüft jedes Modell gegen realistische
 * Erwartungsbereiche bei typischen Steigungen.
 */

import { MOVEMENT_TYPES, type MovementId } from './movementTypes';
import type { DurationModel, SpeedProfile } from './speedModel';

// ---------------------------------------------------------------------------
// Geteilte Primitive
// ---------------------------------------------------------------------------

/** DIN 33466 / SAC-Gehzeit: größere von Horizontal-/Vertikalzeit voll, kleinere halb. */
function dinDuration(d: number, dEle: number, flatKmh: number, ascentMh: number, descentMh: number): number {
  if (d <= 0) return 0;
  const flatMs = Math.max(1, flatKmh) * 1000 / 3600;
  const tFlat = d / flatMs;
  const tUp = dEle > 0 ? dEle / (ascentMh / 3600) : 0;
  const tDown = dEle < 0 ? -dEle / (descentMh / 3600) : 0;
  const tVert = tUp + tDown;
  return Math.max(tFlat, tVert) + 0.5 * Math.min(tFlat, tVert);
}

/** Steigungsabhängiges Radmodell: v = v_flach / (1 + Steigung% · k) bzw. Abfahrts-Boost. */
function bikeGradeDuration(
  d: number, dEle: number, profile: SpeedProfile,
  opts: { climbKBase: number; descBoost: number; minKmh?: number },
): number {
  if (d <= 0) return 0;
  const gradePct = (dEle / d) * 100;
  let v: number;
  if (gradePct >= 0) {
    const k = opts.climbKBase / Math.max(1, profile.climbStrength);
    v = Math.max(profile.flatSpeedKmh / (1 + gradePct * k), opts.minKmh ?? 3.5);
  } else {
    v = Math.min(profile.flatSpeedKmh * (1 + -gradePct * opts.descBoost), profile.maxDownhillKmh);
  }
  return d / (v * 1000 / 3600);
}

/** Lauf-Pace-Modell: Flachpace + Sekunden je %-Grad bergauf bzw. -ab. */
function runDuration(
  d: number, dEle: number, flatKmh: number,
  opts: {
    upPenSecPerKm: number;
    downSweetSpotPct: number;      // bis hierhin gibt's Tempo geschenkt
    downGainSecPerKm: number;
    downPenSecPerKm: number;       // jenseits des Sweet-Spots bremsen die Knie
    terrainOverhead: number;       // multiplikativer Overhead (Trail >1, Asphalt 1)
    minPaceSecPerKm: number;       // unterer Pace-Floor
  },
): number {
  if (d <= 0) return 0;
  const g = (dEle / d) * 100;
  const flatPace = 3600 / Math.max(3, flatKmh);
  let pace = flatPace;
  if (g > 0) {
    pace += g * opts.upPenSecPerKm;
  } else {
    const dh = -g;
    if (dh <= opts.downSweetSpotPct) pace -= dh * opts.downGainSecPerKm;
    else pace -= opts.downSweetSpotPct * opts.downGainSecPerKm - (dh - opts.downSweetSpotPct) * opts.downPenSecPerKm;
  }
  pace *= opts.terrainOverhead;
  pace = Math.max(pace, opts.minPaceSecPerKm);
  const speedKmh = 3600 / pace;
  return d / (speedKmh * 1000 / 3600);
}

// ---------------------------------------------------------------------------
// Modelle je Bewegungsart
// ---------------------------------------------------------------------------

const wandern: DurationModel = (d, dE, p) =>
  dinDuration(d, dE, p.flatSpeedKmh, p.ascentRateMh, p.descentRateMh);

const bergwandern: DurationModel = (d, dE, p) => {
  let t = dinDuration(d, dE, p.flatSpeedKmh, p.ascentRateMh, p.descentRateMh);
  if (d > 0) {
    const g = Math.abs((dE / d) * 100);
    // Steilstufen-Aufschlag für technisches T3-Gelände — moderat und gedeckelt,
    // damit die Gesamtzeit nahe der DIN/SAC-Referenz bleibt (der Standard, den
    // DAV/SAC selbst nutzen) und einzelne sehr steile Segmente bzw. DEM-Rausch-
    // Spikes nicht überintegrieren (früher kompoundete +60 %/Segment zu absurden
    // Gesamtzeiten). Trigger erst ab 30 %: reale Steige switchbacken, anhaltend
    // > 30 % ist selten — > 25 % traf dagegen schon Rauschen und Geraden-GPX.
    if (g > 30) t *= 1 + Math.min(0.25, (g - 30) * 0.012);
    if (dE < 0 && g > 30) t *= 1.08;                     // technischer Abstieg
  }
  return t;
};

const jogging: DurationModel = (d, dE, p) => runDuration(d, dE, p.flatSpeedKmh, {
  upPenSecPerKm: 12, downSweetSpotPct: 10, downGainSecPerKm: 6, downPenSecPerKm: 8,
  terrainOverhead: 1.0, minPaceSecPerKm: 180,
});

const trail: DurationModel = (d, dE, p) => runDuration(d, dE, p.flatSpeedKmh, {
  upPenSecPerKm: 16, downSweetSpotPct: 12, downGainSecPerKm: 4, downPenSecPerKm: 10,
  terrainOverhead: 1.05, minPaceSecPerKm: 200,
});

const rennrad: DurationModel = (d, dE, p) =>
  bikeGradeDuration(d, dE, p, { climbKBase: 0.45, descBoost: 0.045 });

const gravel: DurationModel = (d, dE, p) =>
  bikeGradeDuration(d, dE, p, { climbKBase: 0.50, descBoost: 0.035 });

const mtb: DurationModel = (d, dE, p) =>
  bikeGradeDuration(d, dE, p, { climbKBase: 0.55, descBoost: 0.025 });

const ebike: DurationModel = (d, dE, p) => {
  if (d <= 0) return 0;
  const g = (dE / d) * 100;
  const flatMax = Math.min(p.flatSpeedKmh, 25); // Motor-Unterstützungs-Grenze
  let v: number;
  if (g >= 0) {
    // Motor halbiert den Steigungsverlust.
    const k = (0.45 / Math.max(1, p.climbStrength)) * 0.5;
    v = Math.max(flatMax / (1 + g * k), 4);
  } else {
    v = Math.min(flatMax * (1 + -g * 0.04), p.maxDownhillKmh);
  }
  return d / (v * 1000 / 3600);
};

export const MODELS: Record<MovementId, DurationModel> = {
  wandern, bergwandern, jogging, trail, rennrad, gravel, mtb, ebike,
};

export interface ModelDescription {
  id: MovementId;
  family: 'din' | 'din-alpin' | 'run' | 'bike' | 'ebike';
  description: string;
}
export const MODEL_DESCRIPTIONS: Record<MovementId, ModelDescription> = {
  wandern:     { id: 'wandern',     family: 'din',       description: 'DIN 33466 / SAC-Gehzeit (Horizontal + halbe Vertikale)' },
  bergwandern: { id: 'bergwandern', family: 'din-alpin', description: 'DIN/SAC + Steilstufen-Aufschlag (>25 %), technische Abstiege' },
  jogging:     { id: 'jogging',     family: 'run',       description: 'Lauf-Pace +12 s/km je %-Steigung, sanftes Bergab' },
  trail:       { id: 'trail',       family: 'run',       description: 'Lauf-Pace +16 s/km je %-Steigung, Trail-Overhead +5 %' },
  rennrad:     { id: 'rennrad',     family: 'bike',      description: 'v = v_flach / (1 + Steigung·k), schnelle Abfahrt (cap)' },
  gravel:      { id: 'gravel',      family: 'bike',      description: 'Wie Rad, höhere k (Rollwiderstand), moderate Abfahrt' },
  mtb:         { id: 'mtb',         family: 'bike',      description: 'Wie Rad, höchstes k, gedrosselte technische Abfahrt' },
  ebike:       { id: 'ebike',       family: 'ebike',     description: 'Motor halbiert Steigungsverlust, Flach-Cap 25 km/h' },
};

// ---------------------------------------------------------------------------
// Verifikation: für jede Bewegungsart Geschwindigkeit bei diversen Steigungen
// prüfen und gegen einen plausiblen Bereich abgleichen.
// ---------------------------------------------------------------------------
export interface VerifyCheck {
  modelId: MovementId;
  slopePct: number;
  speedKmh: number;
  expected: [number, number];
  ok: boolean;
}

export interface VerifyResult {
  checks: VerifyCheck[];
  passed: number;
  failed: number;
}

/** Erwartete Geschwindigkeit (km/h) je Bewegungsart bei festen Test-Steigungen. */
const EXPECTATIONS: Record<MovementId, Partial<Record<number, [number, number]>>> = {
  // DIN/SAC: sanftes Bergab liefert kaum Tempogewinn — Vertikalzeit wird halb addiert.
  wandern:     { 0: [4.2, 5.0],   5: [3.0, 4.2],   10: [2.0, 3.0],   20: [1.0, 2.0],   '-5': [3.5, 4.6] as [number, number], '-10': [3.0, 4.5] as [number, number], '-20': [1.5, 3.0] as [number, number] },
  bergwandern: { 0: [3.2, 3.8],   5: [2.4, 3.4],   10: [1.7, 2.6],   20: [0.9, 1.7],   '-5': [2.7, 3.7] as [number, number], '-10': [2.4, 3.6] as [number, number], '-20': [1.2, 2.5] as [number, number] },
  jogging:     { 0: [8.5, 9.5],   5: [7.0, 8.5],   10: [6.0, 7.5],   20: [4.5, 6.2],   '-5': [9.0, 11.0] as [number, number], '-10': [9.5, 12.0] as [number, number], '-20': [7.5, 10.5] as [number, number] },
  trail:       { 0: [7.0, 8.5],   5: [5.5, 7.5],   10: [4.5, 6.0],   20: [3.0, 4.7],   '-5': [7.5, 9.5] as [number, number], '-10': [8.0, 10.0] as [number, number], '-20': [5.0, 8.5] as [number, number] },
  rennrad:     { 0: [25, 27],     5: [13, 17],     10: [9, 12],      20: [5.5, 7.5],   '-5': [29, 35] as [number, number],   '-10': [33, 42] as [number, number],   '-20': [45, 55] as [number, number] },
  gravel:      { 0: [19, 21],     5: [10, 13],     10: [6.5, 9],     20: [4, 6],       '-5': [21, 26] as [number, number],   '-10': [24, 30] as [number, number],   '-20': [32, 42] as [number, number] },
  mtb:         { 0: [14, 16],     5: [7, 10],      10: [4.5, 7],     20: [3, 4.5],     '-5': [15, 19] as [number, number],   '-10': [16, 22] as [number, number],   '-20': [21, 30] as [number, number] },
  ebike:       { 0: [22, 24],     5: [17, 19.5],   10: [13.5, 16],   20: [9.5, 12.5],  '-5': [25, 30] as [number, number],   '-10': [28, 34] as [number, number],   '-20': [36, 46] as [number, number] },
};

const TEST_SLOPES = [0, 5, 10, 20, -5, -10, -20];

export function verifyModels(): VerifyResult {
  const profiles: Record<MovementId, SpeedProfile> = Object.fromEntries(
    MOVEMENT_TYPES.map((t) => [t.id, { ...t.defaults }]),
  ) as Record<MovementId, SpeedProfile>;

  const checks: VerifyCheck[] = [];
  const ids = Object.keys(MODELS) as MovementId[];

  for (const id of ids) {
    const model = MODELS[id];
    const profile = profiles[id];
    for (const slope of TEST_SLOPES) {
      const lengthM = 1000;
      const dEle = lengthM * (slope / 100);
      const dur = model(lengthM, dEle, profile);
      const speedKmh = dur > 0 ? (lengthM / 1000) / (dur / 3600) : 0;
      const expected = EXPECTATIONS[id][slope as keyof typeof EXPECTATIONS[typeof id]] ?? [0, Infinity];
      const ok = speedKmh >= expected[0] && speedKmh <= expected[1];
      checks.push({ modelId: id, slopePct: slope, speedKmh: Math.round(speedKmh * 10) / 10, expected, ok });
    }
  }
  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

// ---------------------------------------------------------------------------
// Whole-Route-Verifikation des Bergwander-Timings gegen die DIN/SAC-Referenz.
// Prüft, dass die Steilstufe realistische Steige nicht aufbläht, gegen Rausch-
// Spikes robust ist und auch sehr steiles Gelände gedeckelt bleibt.
// ---------------------------------------------------------------------------
export interface BergCheck { name: string; expected: string; ratio: number; ok: boolean }
export interface BergVerifyResult { checks: BergCheck[]; passed: number; failed: number }

export function verifyBergwandern(): BergVerifyResult {
  const p = MOVEMENT_TYPES.find((t) => t.id === 'bergwandern')!.defaults;
  // DIN/SAC-Gehzeit pro Segment (Formel repliziert — unabhängig vom Modell).
  const din = (d: number, dE: number): number => {
    const tFlat = d / (p.flatSpeedKmh * 1000 / 3600);
    const tUp = dE > 0 ? dE / (p.ascentRateMh / 3600) : 0;
    const tDown = dE < 0 ? -dE / (p.descentRateMh / 3600) : 0;
    const tVert = tUp + tDown;
    return Math.max(tFlat, tVert) + 0.5 * Math.min(tFlat, tVert);
  };
  const ratio = (segs: Array<[number, number]>): number => {
    let m = 0, b = 0;
    for (const [d, dE] of segs) { m += bergwandern(d, dE, p); b += din(d, dE); }
    return b > 0 ? m / b : 0;
  };
  const rep = (d: number, dE: number, n: number): Array<[number, number]> =>
    Array.from({ length: n }, () => [d, dE] as [number, number]);

  const checks: BergCheck[] = [];
  const push = (name: string, expected: string, r: number, ok: boolean) =>
    checks.push({ name, expected, ratio: Math.round(r * 1000) / 1000, ok });

  // (1) Realistische 22-%-Steige (unter Trigger) → exakt DIN.
  let r = ratio(rep(100, 22, 50));
  push('Realistische 22-%-Steige → ≈ DIN', '1.00', r, Math.abs(r - 1) < 1e-6);
  // (2) Ein 100-%-DEM-Spike unter 49 realistischen Segmenten → kaum Effekt.
  r = ratio([...rep(100, 22, 49), [50, 50]]);
  push('Rausch-Spike → Ratio ≤ 1,03', '≤1.03', r, r <= 1.03);
  // (3) Anhaltend 35 % → Penalty greift moderat.
  r = ratio(rep(100, 35, 50));
  push('Sustained 35 % → Ratio in [1,0; 1,10]', '1.0–1.10', r, r >= 1 && r <= 1.10);
  // (4) Sehr steil 55 % → gedeckelt.
  r = ratio(rep(100, 55, 50));
  push('Sustained 55 % → Ratio ≤ 1,30 (gedeckelt)', '≤1.30', r, r <= 1.30);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

// Dev-Hook: macht die Verifikation in der Browser-Konsole aufrufbar.
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyMovementModels: typeof verifyModels }).__verifyMovementModels = verifyModels;
  (window as unknown as { __verifyBergwandern: typeof verifyBergwandern }).__verifyBergwandern = verifyBergwandern;
}
