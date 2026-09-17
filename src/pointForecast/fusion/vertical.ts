/**
 * vertical.ts — PAP 4, die vertikale Korrektur (Phase FI, AP4).
 *
 * „Der Kern des Verfahrens und die einzige Stelle mit einer echten Fallunterscheidung"
 * (`ABLAUFPLAENE.md`). Der Cube liefert je Zelle den fusionierten Wert T̄ an der
 * effektiven Modellhöhe h_mod_eff und — nur in Stufe t1 — das Profil aus PAP 2:
 * gamma_eff (Γ = −∂T/∂z, K/km), z_base, z_inv, dT_inv (alle Höhen absolut ü. NN). Hier
 * wird T̄ auf die echte Höhe h_true gebracht:
 *
 *   Fall A   keine Inversion (z_inv ≤ z_base)     T = T̄ − Γ_eff · (h_true − h_mod_eff)
 *   Fall B   im Inversionskörper (h_true ≥ z_base) T = T̄ + dT_inv · (φ(u) − φ(u_mod))
 *   Fall C   unter dem Modellniveau (h_true < z_base) T = T̄ − Γ_inv · (z_base − h_true), extrapoliert
 *   std      kein Profil (t2/t3, R6)              wie A mit der Standard-Lapse 6,5 K/km, Flag
 *
 * ── Was hier ANDERS ist als in der Skizze, und warum ────────────────────────
 * PAP 4 schreibt T̄ und die Formeln so, als läge die Modelloberfläche AN der
 * Inversionsbasis (Bodeninversion). Der Producer bestimmt z_base aus den Modellleveln —
 * eine Inversion kann auch ABGEHOBEN sein (z_base > h_mod_eff), und dann ist die Schicht
 * zwischen Modellboden und Basis vom Modell aufgelöst und normal geschichtet. Deshalb
 * rechnet dieses Modul die Korrektur als DIFFERENZ eines stückweisen Profils
 * P(z) zwischen h_true und h_mod_eff: T = T̄ + P(h_true) − P(h_mod_eff). Liegt die
 * Modelloberfläche an der Basis (P(h_mod_eff) = 0), sind das exakt die PAP-4-Formeln;
 * liegt sie darunter, wird die aufgelöste Schicht mit Γ_eff gerechnet, nicht mit Γ_inv.
 * Unter der Basis extrapoliert PAP 4 das Inversionsgefälle nach unten (Fall C: die Mulde,
 * die das Modell nicht kennt) — hier nur, wenn die Inversion am Boden aufsitzt
 * (`DZ_SURFACE_M`, Setzung); unter einer abgehobenen Inversion gilt Γ_eff.
 *
 * ── V-FI-15: die Extrapolation ist nach unten BEGRENZT ─────────────────────
 * Am lebenden Datum (16.09., §9.6.1) liegt Zermatt 929 m unter seiner t1-Zelle. Trägt die
 * Zelle eine Bodeninversion von 3 K über 300 m, ergäbe PAP 4 wörtlich −Γ_inv · 929 m =
 * −9,3 K statt der +6 K aus Fall A — ein 15-K-Sprung je nachdem, ob das Modell an SEINER
 * Oberfläche gerade eine Inversion sieht. Eine Modellinversion von dT_inv sagt nichts über
 * eine Mulde, die tiefer ist als die Inversion mächtig. Deshalb wird das Gefälle höchstens
 * über die eigene Mächtigkeit der Inversion (z_inv − z_base) nach unten fortgesetzt; darunter
 * gilt wieder Γ_eff (die Mulde ist dann so kalt wie der Kaltluftsee tief, nicht kälter).
 * Strukturregel, keine Zahl — als `set` geführt (`calib: poolDepth:set`), AP10 kalibriert.
 *
 * φ ist linear — die Startform aus PAP 4, in `calib.json` als `set` geführt; die
 * Stützstellen (`phi.knots`) kommen aus AP10.
 *
 * Rein, headless-prüfbar ({@link verifyVertical}). Alle Höhen in m ü. NN, Γ in K/m.
 */

/** Standard-Lapse (ICAO), `calib.fixed.standardLapse` — Literatur, keine Kalibrierung. */
export const STANDARD_LAPSE_PER_M = 0.0065;
/**
 * Taupunkt-Lapse (K/m): der Taupunkt fällt mit der Höhe rund dreimal langsamer als die
 * Temperatur (Prior des Motors, `priors.ts`: DEWPOINT_LAPSE_PER_M). Hier nur als Auskunft —
 * die Taupunkt-Korrektur macht der Motor selbst über `sourceElevation` (AP4, §9.6).
 */
export const DEWPOINT_LAPSE_PER_M = 0.0018;
/**
 * Ab welchem Abstand der Inversionsbasis über der Modelloberfläche die Inversion als
 * ABGEHOBEN gilt (m). Setzung: die unterste ICON-Modellfläche liegt 10–20 m über Grund,
 * eine Bodeninversion beginnt dort. Erklärungspflichtig (`calib: dzSurface:set`).
 */
export const DZ_SURFACE_M = 50;
/** Plausibilitätsdeckel für Γ_eff aus dem Profil (K/m) — außerhalb gilt die Standard-Lapse mit Flag. */
export const GAMMA_ABS_MAX_PER_M = 0.02;

export interface VerticalProfile {
  /** Γ_eff in K/km, Vorzeichen Γ = −∂T/∂z (normal > 0). `null` = MISSING. */
  gammaEff: number | null;
  zBase: number | null;
  zInv: number | null;
  dTInv: number | null;
}

export type VerticalCase = 'A' | 'B' | 'C' | 'std';

export interface VerticalInput {
  /** T̄ der Zelle (°C) an h_mod_eff. */
  tMean: number;
  hModEff: number;
  hTrue: number;
  profile: VerticalProfile | null;
  /** Bodendruck der Zelle (hPa) an h_mod_eff — wird hydrostatisch mitgeführt. */
  ps?: number | null;
}

export interface VerticalResult {
  /** Temperatur an h_true (°C). */
  t: number;
  /** Bodendruck an h_true (hPa); `null`, wenn keiner übergeben wurde. */
  ps: number | null;
  case: VerticalCase;
  /** h_true − h_mod_eff (m) — das Δh-Protokoll aus PAP 4 O1. */
  dhM: number;
  /** Die Korrektur T − T̄ (K). */
  deltaK: number;
  /** Γ, das in Fall A/std wirkte (K/m); in B/C das Gefälle des Inversionskörpers Γ_inv (K/m, > 0 = wärmer nach oben). */
  gammaPerM: number;
  /** Relative Lage im Inversionskörper (Fall B/C): u = (h − z_base)/(z_inv − z_base), geklemmt auf 0…1. */
  u: number | null;
  uMod: number | null;
  /** Die Inversion sitzt am Boden auf (z_base ≤ h_mod_eff + DZ_SURFACE_M). */
  surfaceBased: boolean | null;
  /** Fall C: über welche Tiefe unter der Basis das Inversionsgefälle wirklich fortgesetzt wurde (m; V-FI-15). */
  poolDepthM: number | null;
  flags: Array<'extrapolatedBelowModel' | 'inversionBody' | 'stdLapseFallback' | 'gammaImplausible'>;
}

/** φ — Startform linear, φ(0) = 0, φ(1) = 1, monoton (PAP 4). Außerhalb geklemmt. */
export function phiLinear(u: number): number {
  return u <= 0 ? 0 : u >= 1 ? 1 : u;
}

/** Hydrostatische Übertragung des Bodendrucks auf eine andere Höhe (physikalisch, keine Kalibrierung). */
export function pressureAt(psHPa: number, tMeanC: number, tTargetC: number, dhM: number): number {
  const g = 9.80665, R = 287.05;
  const tK = 0.5 * (tMeanC + tTargetC) + 273.15;
  return psHPa * Math.exp((-g * dhM) / (R * Math.max(150, tK)));
}

export function verticalCorrection(inp: VerticalInput): VerticalResult {
  const { tMean, hModEff, hTrue } = inp;
  const dhM = hTrue - hModEff;
  const flags: VerticalResult['flags'] = [];
  const p = inp.profile;
  const gammaRaw = p?.gammaEff != null && Number.isFinite(p.gammaEff) ? p.gammaEff / 1000 : null;
  let gammaEff = gammaRaw;
  if (gammaEff != null && Math.abs(gammaEff) > GAMMA_ABS_MAX_PER_M) { gammaEff = null; flags.push('gammaImplausible'); }

  const inversion = p != null && p.zBase != null && p.zInv != null && p.dTInv != null
    && Number.isFinite(p.zBase) && Number.isFinite(p.zInv) && p.zInv > p.zBase && p.dTInv > 0;

  const finish = (t: number, kase: VerticalCase, gammaPerM: number, u: number | null, uMod: number | null, surfaceBased: boolean | null, poolDepthM: number | null = null): VerticalResult => ({
    t, ps: inp.ps != null && Number.isFinite(inp.ps) ? pressureAt(inp.ps, tMean, t, dhM) : null,
    case: kase, dhM, deltaK: t - tMean, gammaPerM, u, uMod, surfaceBased, poolDepthM, flags,
  });

  if (!inversion) {
    // Fall A — oder der Rückfall ohne Profil (t2/t3) bzw. ohne brauchbares Γ.
    if (gammaEff == null) {
      flags.push('stdLapseFallback');
      return finish(tMean - STANDARD_LAPSE_PER_M * dhM, p == null ? 'std' : 'A', STANDARD_LAPSE_PER_M, null, null, null);
    }
    return finish(tMean - gammaEff * dhM, 'A', gammaEff, null, null, null);
  }

  // Inversion: das stückweise Profil P(z) relativ zur Basis.
  const zBase = p!.zBase as number, zInv = p!.zInv as number, dTInv = p!.dTInv as number;
  const gamma = gammaEff ?? STANDARD_LAPSE_PER_M;
  if (gammaEff == null) flags.push('stdLapseFallback');
  const thickness = zInv - zBase;
  const gInv = dTInv / thickness;                            // Γ_inv, K/m, > 0: wärmer nach oben
  const surfaceBased = zBase <= hModEff + DZ_SURFACE_M;
  const P = (z: number): number => {
    if (z >= zInv) return dTInv - gamma * (z - zInv);        // über der Obergrenze: normale Schichtung
    if (z >= zBase) return dTInv * phiLinear((z - zBase) / thickness);
    // unter der Basis: abgehobene Inversion ⇒ die aufgelöste Schicht darunter ist normal.
    if (!surfaceBased) return gamma * (zBase - z);
    // Bodeninversion ⇒ PAP 4 Fall C: das Gefälle geht in die Mulde weiter (kälter nach unten),
    // aber höchstens über die eigene Mächtigkeit der Inversion (V-FI-15); darunter wieder Γ_eff.
    const depth = zBase - z;
    const pool = Math.min(depth, thickness);
    return -gInv * pool + gamma * (depth - pool);
  };
  const t = tMean + P(hTrue) - P(hModEff);
  const uOf = (z: number) => Math.max(0, Math.min(1, (z - zBase) / thickness));
  if (hTrue >= zBase) {
    flags.push('inversionBody');
    return finish(t, 'B', gInv, uOf(hTrue), uOf(hModEff), surfaceBased);
  }
  if (surfaceBased) flags.push('extrapolatedBelowModel');
  return finish(t, 'C', gInv, uOf(hTrue), uOf(hModEff), surfaceBased, surfaceBased ? Math.min(zBase - hTrue, thickness) : 0);
}

// ---------------------------------------------------------------------------
// Verifikation — die vier Fälle mit Vorzeichen, plus Negativkontrollen
// ---------------------------------------------------------------------------

export interface VerticalCheck { name: string; ok: boolean; detail?: string }

export function verifyVertical(): { checks: VerticalCheck[]; passed: number; failed: number } {
  const checks: VerticalCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

  // Fall A: Zermatt-Lage — die Zelle liegt 929 m ÜBER dem Punkt (§9.5.1), der Punkt ist wärmer.
  const noInv = { gammaEff: 6.5, zBase: 0, zInv: 0, dTInv: 0 };
  const zermatt = verticalCorrection({ tMean: 7.06, hModEff: 2537, hTrue: 1608, profile: noInv, ps: 752 });
  add('A: Zelle 929 m über dem Punkt ⇒ Punkt um 6,04 K wärmer (Γ 6,5 K/km)',
    zermatt.case === 'A' && near(zermatt.deltaK, 0.929 * 6.5, 1e-9) && zermatt.dhM === -929, `${zermatt.deltaK.toFixed(3)} K`);
  add('A: der Bodendruck steigt hydrostatisch nach unten (752 → ≈ 843 hPa)',
    zermatt.ps != null && zermatt.ps > 835 && zermatt.ps < 850, `${zermatt.ps?.toFixed(1)} hPa`);
  // Zugspitze: die Zelle liegt 1 216 m UNTER dem Punkt, der Punkt ist kälter.
  const zug = verticalCorrection({ tMean: 9.68, hModEff: 1690, hTrue: 2906, profile: noInv });
  add('A: Zelle 1 216 m unter dem Punkt ⇒ Punkt um 7,9 K kälter', zug.case === 'A' && near(zug.deltaK, -1.216 * 6.5, 1e-9), `${zug.deltaK.toFixed(3)} K`);
  // Γ aus dem Profil wirkt — nicht die Standard-Lapse.
  const steep = verticalCorrection({ tMean: 10, hModEff: 500, hTrue: 1000, profile: { ...noInv, gammaEff: 9 } });
  add('A: Γ_eff aus dem Profil (9 K/km) wirkt, nicht 6,5', near(steep.deltaK, -4.5, 1e-9) && steep.flags.length === 0, `${steep.deltaK}`);

  // std: ohne Profil (t2/t3) die Standard-Lapse, MIT Flag.
  const std = verticalCorrection({ tMean: 10, hModEff: 500, hTrue: 1000, profile: null });
  add('std: ohne Profil Standard-Lapse 6,5 K/km und Flag stdLapseFallback',
    std.case === 'std' && near(std.deltaK, -3.25, 1e-9) && std.flags.includes('stdLapseFallback'));
  // Negativkontrolle: std und A mit Γ = 6,5 sind zahlengleich — nur das Flag unterscheidet sie.
  add('Negativkontrolle: std ≡ A(6,5) in der Zahl, verschieden im Flag',
    std.t === verticalCorrection({ tMean: 10, hModEff: 500, hTrue: 1000, profile: noInv }).t && !verticalCorrection({ tMean: 10, hModEff: 500, hTrue: 1000, profile: noInv }).flags.includes('stdLapseFallback'));

  // Fall B: Bodeninversion 600…900 m, +3 K; Modellboden 600 m; Punkt 750 m (u = ½) ⇒ +1,5 K.
  const inv = { gammaEff: 6.5, zBase: 600, zInv: 900, dTInv: 3 };
  const b = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 750, profile: inv });
  add('B: im Inversionskörper ist es OBEN wärmer — u = ½ ⇒ +1,5 K, Flag inversionBody',
    b.case === 'B' && near(b.deltaK, 1.5, 1e-9) && b.u === 0.5 && b.uMod === 0 && b.flags.includes('inversionBody') && b.surfaceBased === true, `${b.deltaK} K`);
  // Über der Obergrenze: +3 K minus normale Lapse darüber.
  const above = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 1100, profile: inv });
  add('B: über der Obergrenze: +3 K der Inversion minus 6,5 K/km für die 200 m darüber = +1,7 K',
    above.case === 'B' && near(above.deltaK, 3 - 0.0065 * 200, 1e-9), `${above.deltaK.toFixed(3)} K`);
  // Negativkontrolle: dieselbe Geometrie OHNE Inversion (zInv = zBase) wäre KÄLTER oben (−0,975 K).
  const bNo = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 750, profile: { ...inv, zInv: 600, dTInv: 0 } });
  add('Negativkontrolle: zInv = zBase heißt „keine Inversion" ⇒ Fall A, oben kälter (−0,975 K)',
    bNo.case === 'A' && near(bNo.deltaK, -0.975, 1e-9), `${bNo.deltaK} K`);

  // Fall C: Bodeninversion, Punkt 100 m UNTER der Basis (die Mulde, die das Modell nicht kennt) ⇒ kälter, extrapoliert.
  const c = verticalCorrection({ tMean: 2, hModEff: 610, hTrue: 500, profile: inv });
  add('C: 100 m unter der Basis einer Bodeninversion ⇒ Γ_inv = 10 K/km nach unten ⇒ −1 K (−0,1 K für die 10 m Modellboden → Basis), Flag extrapolatedBelowModel',
    c.case === 'C' && near(c.deltaK, -(3 / 300) * 100 - (3 / 300) * 10, 1e-9) && c.flags.includes('extrapolatedBelowModel') && c.surfaceBased === true, `${c.deltaK.toFixed(3)} K`);
  // V-FI-15: Zermatt-Geometrie — Zelle 2 537 m mit Bodeninversion 3 K über 300 m, Punkt 929 m tiefer. Wörtlich
  // wäre das −Γ_inv · 939 m ≈ −9,4 K; begrenzt auf die Mächtigkeit: P(1608) = −3 K + 6,5 K/km · 639 m = +1,15 K,
  // P(2537) = −Γ_inv · 10 m = −0,1 K ⇒ ΔT = +1,25 K. Und die Tiefe der Fortsetzung steht im Ergebnis.
  const zerInv = { gammaEff: 6.5, zBase: 2547, zInv: 2847, dTInv: 3 };
  const zerC = verticalCorrection({ tMean: 6.41, hModEff: 2537, hTrue: 1608, profile: zerInv });
  add('C (V-FI-15): die Extrapolation endet nach der Mächtigkeit der Inversion — Zermatt +1,25 K statt −9,4 K, poolDepthM 300',
    zerC.case === 'C' && near(zerC.deltaK, -3 + 0.0065 * 639 + 0.01 * 10, 1e-6) && zerC.poolDepthM === 300 && zerC.flags.includes('extrapolatedBelowModel'),
    `${zerC.deltaK.toFixed(3)} K, pool ${zerC.poolDepthM} m`);
  // Negativkontrolle: eine flache Mulde (100 m unter der Basis, Inversion 300 m mächtig) bleibt voll extrapoliert.
  add('C (V-FI-15) Negativkontrolle: unter der Mächtigkeit wirkt das volle Gefälle (100 m ⇒ −1 K)',
    near(verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 500, profile: { gammaEff: 6.5, zBase: 600, zInv: 900, dTInv: 3 } }).deltaK, -1, 1e-9));
  // Abgehobene Inversion (Basis 200 m über dem Modellboden): darunter normale Schichtung, KEINE Extrapolation.
  const elevated = { gammaEff: 6.5, zBase: 800, zInv: 1100, dTInv: 3 };
  const cEl = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 700, profile: elevated });
  add('C (abgehoben): 100 m höher unter einer abgehobenen Basis ⇒ normale Lapse −0,65 K, kein Extrapolations-Flag',
    cEl.case === 'C' && near(cEl.deltaK, -0.65, 1e-9) && !cEl.flags.includes('extrapolatedBelowModel') && cEl.surfaceBased === false, `${cEl.deltaK} K`);
  const bEl = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 950, profile: elevated });
  add('B (abgehoben): Punkt in der Mitte der abgehobenen Inversion ⇒ −6,5 K/km bis zur Basis, dann +1,5 K',
    bEl.case === 'B' && near(bEl.deltaK, -0.0065 * 200 + 1.5, 1e-9), `${bEl.deltaK.toFixed(3)} K`);

  // Stetigkeit: an Basis und Obergrenze springt das Profil nicht.
  const eps = 1e-6;
  const atBase = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 600 - eps, profile: inv }).t;
  const inBase = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 600 + eps, profile: inv }).t;
  const atTop = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 900 - eps, profile: inv }).t;
  const overTop = verticalCorrection({ tMean: 2, hModEff: 600, hTrue: 900 + eps, profile: inv }).t;
  add('Profil ist stetig an Basis und Obergrenze', near(atBase, inBase, 1e-4) && near(atTop, overTop, 1e-4));
  // Identität: h_true = h_mod_eff ⇒ keine Korrektur, in jedem Fall.
  add('h_true = h_mod_eff ⇒ ΔT = 0 (A, B, std)',
    verticalCorrection({ tMean: 5, hModEff: 700, hTrue: 700, profile: inv }).deltaK === 0
    && verticalCorrection({ tMean: 5, hModEff: 700, hTrue: 700, profile: noInv }).deltaK === 0
    && verticalCorrection({ tMean: 5, hModEff: 700, hTrue: 700, profile: null }).deltaK === 0);
  // Unplausibles Γ (±40 K/km — der Bereich der Ebene) fällt auf die Standard-Lapse, mit zwei Flags.
  const imp = verticalCorrection({ tMean: 10, hModEff: 500, hTrue: 1000, profile: { ...noInv, gammaEff: 35 } });
  add('unplausibles Γ (35 K/km) ⇒ Standard-Lapse, Flags gammaImplausible + stdLapseFallback',
    near(imp.deltaK, -3.25, 1e-9) && imp.flags.includes('gammaImplausible') && imp.flags.includes('stdLapseFallback'));
  // φ: linear, monoton, Ränder.
  add('φ linear: φ(0) = 0, φ(½) = ½, φ(1) = 1, außerhalb geklemmt', phiLinear(0) === 0 && phiLinear(0.5) === 0.5 && phiLinear(1) === 1 && phiLinear(-1) === 0 && phiLinear(2) === 1);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}
