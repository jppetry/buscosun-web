/**
 * profileColumn.ts — die Profilregel von buscosun Fusion für die Laufzeit (Phase FI, AP15; `audit/fusion-vollform.md`
 * §2.1, E-F-13/14).
 *
 * ── Eine Semantik mit t1 ─────────────────────────────────────────────────────
 * `profileFromColumnTs` ist eine wörtliche Portierung von `profileFromColumn` aus dem Producer
 * (`scripts/point/profile.mjs:64-100`, Modelllevel-Profil der Stufe t1). Der Producer bleibt unberührt; der Verifier
 * (`verify-pv-cube` Block 21) prüft die Gleichheit an den zehn Säulen des Producer-Selbsttests und an Zufallssäulen.
 * Γ = −∂T/∂z in K/km (Ausgleichsgerade über `gammaDepthM`), die unterste Inversion mit `dz ≥ dzMinM` und
 * `dT ≥ dTMinK`, „keine Inversion" = `zBase = zInv = z[0]`, `dTInv = 0`.
 *
 * ── Das Ersatzprofil für t2/t3 ─────────────────────────────────────────────
 * `pressureProfileFromCell` baut aus der NÄCHSTEN Zelle (PD-B5: Profile nie mitteln) eine grobe Säule:
 *   [(hModEff + 2 m, t2m)] + jede Druckfläche mit ps − p ≥ 10 hPa (darunter/daran extrapoliert das Modell — V-FI-63)
 * in HYPSOMETRISCHEN Höhen z_p = hModEff + (R_d/g)·(½(t2m + T_p) + 273,15)·ln(ps/p) (V-FI-64: die Standardatmosphäre
 * liegt im Median 100 m daneben). Trocken, ohne virtuelle Korrektur (< 0,5 % der Höhe, benannt).
 * Parameter für grobe Säulen (alle `set`): gammaDepthM 1 500 m (sonst läge meist nur der Boden im Fenster), dzMin 50 m,
 * dTMin 0,5 K (die Schichten sind 170–730 m dick, 0,2 K wäre Rauschen des Quellenmittels). Γ wird auf ≤ 9,8 K/km
 * gedeckelt (trockenadiabatisch, `physical`): t2m ist am Tag überadiabatisch, eine 10-hPa-Schicht nur ≈ 85 m dick.
 * Weniger als drei Niveaus ⇒ `null` (dieselbe Regel wie der Producer) ⇒ die Standard-Lapse gilt, wie heute.
 *
 * Rein, ohne Abhängigkeiten.
 */

export interface ColumnParams { gammaDepthM: number; dzMinM: number; dTMinK: number }
export interface ColumnProfile { gammaEff: number; zBase: number; zInv: number; dTInv: number }

/** Wörtliche Portierung von `profileFromColumn` (Producer) — Säule von unten nach oben, Höhen aufsteigend. */
export function profileFromColumnTs(t: ArrayLike<number>, z: ArrayLike<number>, p: ColumnParams): ColumnProfile {
  const n = Math.min(t.length, z.length);
  if (n < 3) return { gammaEff: NaN, zBase: NaN, zInv: NaN, dTInv: NaN };
  for (let k = 0; k < n; k++) if (!Number.isFinite(t[k]) || !Number.isFinite(z[k])) {
    return { gammaEff: NaN, zBase: NaN, zInv: NaN, dTInv: NaN };
  }
  const zTop = z[0] + p.gammaDepthM;
  let sz = 0, st = 0, szz = 0, szt = 0, m = 0;
  for (let k = 0; k < n && (z[k] <= zTop || m < 2); k++) {
    sz += z[k]; st += t[k]; szz += z[k] * z[k]; szt += z[k] * t[k]; m++;
  }
  const den = m * szz - sz * sz;
  const gammaEff = den === 0 ? NaN : -((m * szt - sz * st) / den) * 1000;
  let zBase = z[0], zInv = z[0], dTInv = 0;
  for (let k = 0; k < n - 1; k++) {
    if (t[k + 1] <= t[k]) continue;
    let e = k + 1;
    while (e < n - 1 && t[e + 1] > t[e]) e++;
    const dz = z[e] - z[k];
    const dT = t[e] - t[k];
    if (dz >= p.dzMinM && dT >= p.dTMinK) { zBase = z[k]; zInv = z[e]; dTInv = dT; break; }
    k = e - 1;
  }
  return { gammaEff, zBase, zInv, dTInv };
}

/** Setzungen des Ersatzprofils (E-F-14), `set` bis AP10 sie misst; der Γ-Deckel ist physikalisch. */
export const PRESSURE_PROFILE_SET = Object.freeze({
  gammaDepthM: 1500,
  dzMinM: 50,
  dTMinK: 0.5,
  /** Eine Fläche zählt nur, wenn sie mindestens so viele hPa über dem Modellboden liegt. */
  minAboveGroundHPa: 10,
  /** Trockenadiabatischer Deckel für Γ (K/km, `physical`). */
  gammaMaxKPerKm: 9.8,
  levelsHPa: Object.freeze([925, 850, 700]),
});
const RD_OVER_G = 287.05 / 9.80665;

export interface PressureProfile extends ColumnProfile {
  /** Die Flächen, die in der Säule stehen (über Grund). */
  usedHPa: number[];
  /** Höhen der Säule (m ü. NN), Boden zuerst. */
  heightsM: number[];
  /** Γ lag über dem Deckel und wurde gekappt. */
  gammaClamped: boolean;
}

/** Hypsometrische Höhe einer Druckfläche über der Modelloberfläche (m ü. NN). */
export function hypsometricHeight(hModEffM: number, psHPa: number, t2mC: number, tpC: number, pHPa: number): number {
  return hModEffM + RD_OVER_G * ((t2mC + tpC) / 2 + 273.15) * Math.log(psHPa / pHPa);
}

/** Das Ersatzprofil aus den Werten EINER Zelle und Stunde (t2m, ps, hModEff, t925/t850/t700). `null` ⇒ Standard-Lapse. */
export function pressureProfileFromCell(v: Readonly<Record<string, number | null | undefined>>, p = PRESSURE_PROFILE_SET): PressureProfile | null {
  const t2m = v.t2m, ps = v.ps, h = v.hModEff;
  if (t2m == null || ps == null || h == null || !Number.isFinite(t2m) || !Number.isFinite(ps) || !Number.isFinite(h)) return null;
  const col: Array<{ z: number; t: number; hPa: number | null }> = [{ z: h + 2, t: t2m, hPa: null }];
  for (const lev of p.levelsHPa) {
    const tp = v[`t${lev}`];
    if (tp == null || !Number.isFinite(tp) || ps - lev < p.minAboveGroundHPa) continue;
    col.push({ z: hypsometricHeight(h, ps, t2m, tp, lev), t: tp, hPa: lev });
  }
  if (col.length < 3) return null;
  col.sort((a, b) => a.z - b.z);
  const r = profileFromColumnTs(col.map((c) => c.t), col.map((c) => c.z), p);
  if (!Number.isFinite(r.gammaEff) || !Number.isFinite(r.zBase)) return null;
  const gammaClamped = r.gammaEff > p.gammaMaxKPerKm;
  return {
    ...r,
    gammaEff: gammaClamped ? p.gammaMaxKPerKm : r.gammaEff,
    usedHPa: col.filter((c) => c.hPa != null).map((c) => c.hPa as number),
    heightsM: col.map((c) => c.z),
    gammaClamped,
  };
}
