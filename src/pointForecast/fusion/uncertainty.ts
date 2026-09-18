/**
 * uncertainty.ts — PAP 6, Unsicherheit und Konfidenz des Cube-Members (Phase FI, AP6).
 *
 * ── Die Verzweigung aus PAP 6, je Größe und Stunde ──────────────────────────
 *   Ensemble trägt die Stunde     σ = c(p,f) · σ_ens                 (`ensemble`)
 *   sonst, ≥ 2 Quellen            σ² = σ_div² + σ_sys²               (`divergence`)
 *   sonst (eine Quelle)           σ² = σ_sys²                        (`sys-only`)
 *   dazu immer                    σ_quant² = Δ²/12 (Ebenenskala), der Restfehler der
 *                                 Höhenkorrektur und die Aufweitung in Fall B/C (AP4)
 *
 * σ_div und σ_ens werden NIE addiert (Doppelzählung, cubeFormat.ts); Quantile einer Quelle
 * werden NIE mit σ verrechnet (PD-B7). Niederschlag bleibt beim Motor (K-2, Probit/lognormal —
 * `precip_sd` in mm/h ist in keinem der beiden Räume eine σ).
 *
 * ── Status der Zahlen ───────────────────────────────────────────────────────
 * Alles hier ist `set` (Plan §2.3): c = 1; σ_sys als Boden aus der V-A₁-Scorecard (Fusion an
 * 111 DE-Stationen, 1–24 h, `implementierung-pv3.md` §11) und darüber der Skill-Prior des
 * Motors σ_c·√(1−ρ_Familie(τ)²) — keine neue Kurve, dieselbe, die `fuse.ts` heute für jedes
 * Modell-Member nimmt. AP10 misst σ_sys(v, τ) und c(p,f) aus dem Archiv und ersetzt beides;
 * bis dahin steht jeder Wert mit `calib: …:set` im Ergebnis.
 *
 * ── Konfidenz-Score (Plan §2.2) ─────────────────────────────────────────────
 * conf = spread · agree · lage — ein Index 0…1, ausdrücklich KEINE Wahrscheinlichkeit; jede
 * der drei Größen ist eine monotone Abbildung gemessener Größen, die Abschläge in `lage` sind
 * Setzungen, im Backtest (AP9) gegen die CRPS-Dezile zu prüfen.
 *
 * Rein. Headless-prüfbar ({@link verifyUncertainty}).
 */

import type { PointSourceSample, SourceFamily } from '../types';
import { ACC, accAt, CLIMA_SIGMA_FALLBACK, REP, type FusionVariable } from './priors';
import { CUBE_PLANES, quantStep } from '../../point/cubeFormat';
import type { VerticalResult } from './vertical';

/** Die Größen, für die das Cube-Member eine explizite σ bekommt (Einheit wie im Cube). */
export type UncVar = 'temperature' | 'dewpoint' | 'wind' | 'gust' | 'clouds';
export type SigmaKind = 'ensemble' | 'divergence' | 'sys-only' | 'set';

/** Cube-Ebene(n) je Größe. Wind: zwei Komponenten, σ als quadratisches Mittel. */
export const UNC_CUBE_IDS: Readonly<Record<UncVar, readonly string[]>> = Object.freeze({
  temperature: ['t2m'], dewpoint: ['td2m'], wind: ['u10', 'v10'], gust: ['gust'], clouds: ['clct'],
});
const FUSION_VAR: Readonly<Record<UncVar, FusionVariable>> = Object.freeze({
  temperature: 'temperature', dewpoint: 'dewpoint', wind: 'wind', gust: 'gust', clouds: 'clouds',
});

/** c(p,f) — Spread-Skill-Faktor. `set` = 1, bis AP10 ihn misst. */
export const C_SPREAD = 1;

/**
 * σ_sys-Boden aus V-A₁ (RMSE ≈ 1,25 · MAE, 1–24 h): T 0,91–1,00 K ⇒ 1,2; Td 0,74–0,83 ⇒ 1,0;
 * Wind 0,69–0,85 ⇒ 1,0 m/s; Böe 0,96–1,00 ⇒ 1,3. Bewölkung wurde nicht gemessen — kein Boden,
 * nur der Skill-Prior. `set`.
 */
export const SIGMA_SYS_FLOOR_A1: Readonly<Partial<Record<UncVar, number>>> = Object.freeze({
  temperature: 1.2, dewpoint: 1.0, wind: 1.0, gust: 1.3,
});

/** Restfehler der Höhenkorrektur je Meter |Δh| — derselbe Prior wie `REP.lapseResidualPerM` (T) bzw. 0,4× (Td, wie `representativeness`). */
export const VERT_RESIDUAL_PER_M: Readonly<Partial<Record<UncVar, number>>> = Object.freeze({
  temperature: REP.lapseResidualPerM, dewpoint: 0.4 * REP.lapseResidualPerM,
});

/** Abschläge des `lage`-Faktors (Plan §2.2), `set`. */
export const CONF_DISCOUNT = Object.freeze({
  caseC: 0.7,
  caseB: 0.9,
  dhOver300: 0.8,
  chunkBorder: 0.9,
  interpolated: 0.9,
  nowcastFallback: 0.9,
  stationFar: 0.9,
});
export const CONF_DH_M = 300;

/** σ_sys(v, τ): Boden aus V-A₁, darüber der Skill-Prior des Motors für die Familie des Members. */
export function sigmaSysAt(v: UncVar, family: SourceFamily, leadH: number, sigmaClima: number): number {
  const curve = ACC[FUSION_VAR[v]][family];
  const rho = curve ? accAt(curve, leadH, false) : 0;
  const skill = sigmaClima * Math.sqrt(Math.max(0, 1 - rho * rho));
  return Math.max(SIGMA_SYS_FLOOR_A1[v] ?? 0, skill);
}

/** Δ²/12 der Ebene(n) einer Größe — die Auslieferung führt selbst einen Fehler ein (PAP 6). */
export function sigmaQuantOf(v: UncVar): number {
  const ids = UNC_CUBE_IDS[v];
  let acc = 0;
  for (const id of ids) {
    const pl = CUBE_PLANES.find((p) => p.id === id);
    if (pl) acc += (quantStep(pl) ** 2) / 12;
  }
  return Math.sqrt(acc / ids.length);
}

export interface MemberSigmaInput {
  v: UncVar;
  sample: PointSourceSample;
  /** Vorlauf in Stunden (ab jetzt, wie `fuseHour`). */
  leadH: number;
  /** Klimatologische Streuung der Größe am Ort (K, m/s, %). */
  sigmaClima: number;
  /** AP4-Ergebnis des Schritts (Δh, Fall) — `null` ohne Höhen. */
  vertical: VerticalResult | null;
  /** AP13: gemessenes σ_sys (calib.json, `measured`) — ersetzt max(Boden, Skill-Prior) ganz; fehlt es, gilt die Setzung. */
  sysOverride?: number | null;
  /** AP13: gemessenes c(p,f) — ersetzt `C_SPREAD`; fehlt es, gilt die Setzung. */
  cSpread?: number | null;
}

export interface MemberSigma {
  sigma: number;
  kind: SigmaKind;
  parts: { ens: number | null; div: number | null; sys: number; quant: number; vert: number; widen: number };
}

const rms = (xs: number[]) => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / xs.length);
const pick = (rec: Readonly<Record<string, number | null>> | undefined, ids: readonly string[]): number | null => {
  if (!rec) return null;
  const vals: number[] = [];
  for (const id of ids) { const x = rec[id]; if (x == null || !Number.isFinite(x)) return null; vals.push(x); }
  return vals.length ? rms(vals) : null;
};

/** σ des Cube-Members für eine Größe an einem Schritt — die PAP-6-Verzweigung. */
export function memberSigma(inp: MemberSigmaInput): MemberSigma {
  const { v, sample } = inp;
  const ids = UNC_CUBE_IDS[v];
  const ens = pick(sample.sigmaEns, ids);
  const div = pick(sample.sigmaDiv, ids);
  const nEns = sample.ensCount ?? null;
  const src = sample.srcCount ?? null;
  const sys = inp.sysOverride ?? sigmaSysAt(v, sample.family, inp.leadH, inp.sigmaClima);
  const c = inp.cSpread ?? C_SPREAD;
  const quant = sigmaQuantOf(v);
  const dh = inp.vertical ? Math.abs(inp.vertical.dhM) : 0;
  const vert = (VERT_RESIDUAL_PER_M[v] ?? 0) * dh;
  let widen = 0;
  if (v === 'temperature' && inp.vertical) {
    if (inp.vertical.case === 'C' && inp.vertical.flags.includes('extrapolatedBelowModel')) widen = Math.abs(inp.vertical.deltaK);
    else if (inp.vertical.case === 'B') widen = 0.25 * (sample.profile?.dTInv ?? 0);
  }
  let kind: SigmaKind;
  let core2: number;
  if (ens != null && nEns != null && nEns > 0 && ens > 0) { kind = 'ensemble'; core2 = (c * ens) ** 2; }
  else if (div != null && src != null && src >= 2) { kind = 'divergence'; core2 = div * div + sys * sys; }
  else { kind = 'sys-only'; core2 = sys * sys; }
  return {
    sigma: Math.sqrt(core2 + quant * quant + vert * vert + widen * widen),
    kind,
    parts: { ens, div, sys, quant, vert, widen },
  };
}

/** PAP 6 O1 für die Bewölkung: `clct := max(clct, clcl, clcm, clch)` — auf dem Sample, vor dem Motor. */
export function consistentCloudTotal(values: { clct?: number | null; clcl?: number | null; clcm?: number | null; clch?: number | null }): number | null {
  const xs = [values.clct, values.clcl, values.clcm, values.clch].filter((x): x is number => x != null && Number.isFinite(x));
  if (values.clct == null || !Number.isFinite(values.clct)) return null;   // ohne Gesamtbedeckung wird nichts erfunden
  return Math.min(100, Math.max(...xs));
}

export interface ConfidenceInput {
  /** Streuung der AUSGABE (posterior) in der Einheit der Größe. */
  sigmaPost: number;
  sigmaClima: number;
  member: MemberSigma;
  srcCount: number | null;
  flags: readonly string[];
  /** |Δh| in m (Zelle gegen Punkt), für den Lage-Abschlag. */
  dhM: number | null;
  /** Station > 15 km (heute nie — die Regel lässt sie nicht zu), für Vollständigkeit. */
  stationFar?: boolean;
  /** AP13: gemessene Abschläge je Flag (calib.json `confDiscount`); fehlende Flags behalten die Setzung. */
  discount?: Partial<Record<keyof typeof CONF_DISCOUNT, number>>;
}

export interface Confidence { score: number; spread: number; agree: number; lage: number }

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function confidenceOf(inp: ConfidenceInput): Confidence {
  const spread = inp.sigmaClima > 0 ? clamp01(1 - Math.min(1, inp.sigmaPost / inp.sigmaClima)) : 0;
  const { parts, kind } = inp.member;
  let agreeRaw: number;
  if (kind === 'ensemble' && parts.ens != null && parts.div != null) agreeRaw = (parts.ens ** 2) / (parts.ens ** 2 + parts.div ** 2);
  else if (parts.div != null && inp.member.sigma > 0) agreeRaw = clamp01(1 - (parts.div ** 2) / (inp.member.sigma ** 2));
  else agreeRaw = 1;   // nichts widerspricht — aber auch nichts bestätigt: der srcCount-Faktor drückt es
  const agree = clamp01(agreeRaw * Math.min(1, (inp.srcCount ?? 1) / 3));
  const D = inp.discount ? { ...CONF_DISCOUNT, ...inp.discount } : CONF_DISCOUNT;
  let lage = 1;
  if (inp.flags.includes('extrapolatedBelowModel')) lage *= D.caseC;
  else if (inp.flags.includes('inversionBody')) lage *= D.caseB;
  if (inp.dhM != null && inp.dhM > CONF_DH_M) lage *= D.dhOver300;
  if (inp.flags.includes('chunkBorderTruncated')) lage *= D.chunkBorder;
  if (inp.flags.includes('interpolated')) lage *= D.interpolated;
  if (inp.flags.includes('nowcastFallbackModel')) lage *= D.nowcastFallback;
  if (inp.stationFar) lage *= D.stationFar;
  return { score: clamp01(spread * agree * lage), spread, agree, lage };
}

/** Klimatologische Streuung je Größe, wo der Motor keine ortsabhängige führt (`CLIMA_SIGMA_FALLBACK`). */
export function sigmaClimaFallback(v: UncVar): number {
  return CLIMA_SIGMA_FALLBACK[FUSION_VAR[v]];
}

// ---------------------------------------------------------------------------
// Verifikation
// ---------------------------------------------------------------------------

export interface UncCheck { name: string; ok: boolean; detail?: string }

export function verifyUncertainty(): { checks: UncCheck[]; passed: number; failed: number } {
  const checks: UncCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
  const base: PointSourceSample = {
    source: 'cube-t1', family: 'highres', temperature: 10, sourceElevation: 500, u: 2, v: 1, gust: 5, relativeHumidity: null,
    snowLine: null, cloudLow: null, cloudMid: null, cloudHigh: null, precipitation: 0, uvIndex: null, distanceMeters: 0,
    sigmaDiv: { t2m: 0.8, u10: 0.6, v10: 0.6 }, sigmaEns: { t2m: 1.5, u10: null, v10: null }, srcCount: 5, ensCount: 20,
  };

  // Verzweigung: Ensemble gewinnt, wenn es die Stunde trägt.
  const e = memberSigma({ v: 'temperature', sample: base, leadH: 6, sigmaClima: 5, vertical: null });
  add('Ensemble trägt ⇒ kind ensemble, σ = c·σ_ens (⊕ Δ²/12 unmessbar): 1,5 K', e.kind === 'ensemble' && near(e.sigma, 1.5, 1e-4), `${e.sigma.toFixed(4)}`);
  // Ohne Ensemble: Divergenz plus Sockel.
  const d = memberSigma({ v: 'temperature', sample: { ...base, sigmaEns: {}, ensCount: null }, leadH: 6, sigmaClima: 5, vertical: null });
  add('kein Ensemble, 5 Quellen ⇒ divergence, σ² = σ_div² + σ_sys² (0,8 ⊕ 1,2 = 1,44 K)', d.kind === 'divergence' && near(d.sigma, Math.hypot(0.8, 1.2), 1e-3), `${d.sigma.toFixed(4)} (sys ${d.parts.sys.toFixed(3)})`);
  // Eine Quelle: nur der Sockel.
  const s1 = memberSigma({ v: 'temperature', sample: { ...base, sigmaDiv: {}, sigmaEns: {}, ensCount: null, srcCount: 1 }, leadH: 6, sigmaClima: 5, vertical: null });
  add('eine Quelle ⇒ sys-only, σ = σ_sys (1,2 K bei +6 h)', s1.kind === 'sys-only' && near(s1.sigma, 1.2, 1e-3), `${s1.sigma.toFixed(4)}`);
  // NEGATIVKONTROLLE: σ_div und σ_ens werden nie addiert — mit beiden ist σ nicht größer als mit σ_ens allein.
  const both = memberSigma({ v: 'temperature', sample: base, leadH: 6, sigmaClima: 5, vertical: null });
  const ensOnly = memberSigma({ v: 'temperature', sample: { ...base, sigmaDiv: {} }, leadH: 6, sigmaClima: 5, vertical: null });
  add('Negativkontrolle: σ_div wird NICHT zu σ_ens addiert (Doppelzählung)', near(both.sigma, ensOnly.sigma, 1e-12));
  // σ_sys wächst mit dem Vorlauf über den Boden hinaus (Skill-Prior), der Boden hält kurz.
  const sysShort = sigmaSysAt('temperature', 'highres', 3, 5), sysLong = sigmaSysAt('temperature', 'global', 300, 5);
  add('σ_sys: Boden 1,2 K bei +3 h, Skill-Prior darüber bei +300 h (> 4 K)', near(sysShort, 1.2, 1e-9) && sysLong > 4 && sysLong < 5, `${sysShort.toFixed(2)} → ${sysLong.toFixed(2)} K`);
  add('Bewölkung ohne V-A₁-Boden: reiner Skill-Prior (34 % · √(1−0,8²) ≈ 20 % bei +0 h)', near(sigmaSysAt('clouds', 'highres', 0, 34), 34 * Math.sqrt(1 - 0.8 * 0.8), 1e-6));
  // Wind: RMS der beiden Komponenten.
  const w = memberSigma({ v: 'wind', sample: { ...base, sigmaEns: {}, ensCount: null }, leadH: 6, sigmaClima: 3.2, vertical: null });
  const wSys = sigmaSysAt('wind', 'highres', 6, 3.2);
  add('Wind: σ_div als quadratisches Mittel der Komponenten ⊕ σ_sys (Skill-Prior 1,25 > Boden 1,0 bei +6 h)', w.kind === 'divergence' && near(w.sigma, Math.hypot(0.6, wSys), 1e-3) && wSys > 1.0, `${w.sigma.toFixed(4)} (sys ${wSys.toFixed(3)})`);
  // Quantisierung: bei T 0,003 K — ehrlich, nicht spürbar; bei clct 0,03 %.
  add('σ_quant: T 0,0029 K, clct 0,029 %', near(sigmaQuantOf('temperature'), 0.01 / Math.sqrt(12), 1e-9) && near(sigmaQuantOf('clouds'), 0.1 / Math.sqrt(12), 1e-9));
  // AP4-Terme: Restfehler der Höhe und Fall-C-Aufweitung.
  const vC = { t: 8, ps: null, case: 'C' as const, dhM: -929, deltaK: 1.25, gammaPerM: 0.01, u: 0, uMod: 0, surfaceBased: true, poolDepthM: 300, flags: ['extrapolatedBelowModel' as const] };
  const c = memberSigma({ v: 'temperature', sample: { ...base, sigmaEns: {}, ensCount: null }, leadH: 6, sigmaClima: 5, vertical: vC });
  add('Fall C: Restfehler 0,0035·929 = 3,25 K und Aufweitung |ΔT_C| = 1,25 K gehen quadratisch dazu',
    near(c.parts.vert, 0.0035 * 929, 1e-9) && c.parts.widen === 1.25 && near(c.sigma, Math.sqrt(0.8 ** 2 + 1.2 ** 2 + (0.01 ** 2) / 12 + (0.0035 * 929) ** 2 + 1.25 ** 2), 1e-6), `${c.sigma.toFixed(3)} K`);
  const vB = { ...vC, case: 'B' as const, flags: ['inversionBody' as const], deltaK: 0.15, dhM: 15 };
  const b = memberSigma({ v: 'temperature', sample: { ...base, sigmaEns: {}, ensCount: null, profile: { gammaEff: 4, zBase: 520, zInv: 820, dTInv: 3 } }, leadH: 6, sigmaClima: 5, vertical: vB });
  add('Fall B: Aufweitung dT_inv/4 = 0,75 K (φ linear gesetzt)', b.parts.widen === 0.75 && near(b.parts.vert, 0.0035 * 15, 1e-12));
  add('Taupunkt: Restfehler 0,4× (Gradient dreimal flacher, wie im Motor)', near(memberSigma({ v: 'dewpoint', sample: { ...base, sigmaEns: {}, ensCount: null, sigmaDiv: { td2m: 0.9 } }, leadH: 6, sigmaClima: 5, vertical: vC }).parts.vert, 0.4 * 0.0035 * 929, 1e-9));

  // Konsistenz: clct := max(...)
  add('clct := max(clct, clcl, clcm, clch): 30/95/15/5 ⇒ 95; ohne clct ⇒ null (nichts erfinden)',
    consistentCloudTotal({ clct: 30, clcl: 95, clcm: 15, clch: 5 }) === 95 && consistentCloudTotal({ clct: 30, clcl: 10, clcm: 15, clch: 5 }) === 30 && consistentCloudTotal({ clct: null, clcl: 95 }) === null);

  // Konfidenz: monoton, geklemmt, keine Wahrscheinlichkeit.
  const mk = (sigmaPost: number, flags: string[] = [], src = 5, dh: number | null = 0) =>
    confidenceOf({ sigmaPost, sigmaClima: 5, member: d, srcCount: src, flags, dhM: dh });
  add('spread: σ_post 1 K gegen σ_clima 5 K ⇒ 0,8; σ_post ≥ σ_clima ⇒ 0', near(mk(1).spread, 0.8, 1e-12) && mk(5).spread === 0 && mk(9).spread === 0);
  add('agree (divergence): 1 − σ_div²/σ² = 1 − 0,64/2,08 ≈ 0,69; mit einer Quelle ⅓', near(mk(1).agree, 1 - 0.64 / (0.8 ** 2 + 1.2 ** 2), 1e-3) && near(confidenceOf({ sigmaPost: 1, sigmaClima: 5, member: s1, srcCount: 1, flags: [], dhM: 0 }).agree, 1 / 3, 1e-12));
  add('agree (ensemble): σ_ens²/(σ_ens²+σ_div²) = 2,25/(2,25+0,64) ≈ 0,78', near(confidenceOf({ sigmaPost: 1, sigmaClima: 5, member: e, srcCount: 5, flags: [], dhM: 0 }).agree, 2.25 / 2.89, 1e-9));
  add('lage: Fall C 0,7 · Chunk-Rand 0,9 · |Δh| > 300 m 0,8 ⇒ 0,504; ohne Flags 1',
    near(mk(1, ['extrapolatedBelowModel', 'chunkBorderTruncated'], 5, 900).lage, 0.7 * 0.9 * 0.8, 1e-12) && mk(1).lage === 1);
  add('score = spread · agree · lage, in [0,1], sinkt mit σ_post', mk(1).score > mk(2).score && mk(2).score > mk(4).score && mk(1).score <= 1 && mk(1).score >= 0 && near(mk(1).score, mk(1).spread * mk(1).agree * mk(1).lage, 1e-12));
  // NEGATIVKONTROLLE: ein Flag, das nicht in der Liste steht, ändert nichts.
  add('Negativkontrolle: unbekannte Flags ändern den Score nicht', mk(1, ['seam', 'belowGround925']).score === mk(1).score);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}
