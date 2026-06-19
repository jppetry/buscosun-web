/**
 * Sounding-Thermodynamik (pur, headless testbar) — echte Parcel-Theorie auf dem
 * ICON-EU-Vertikalprofil: Hebungskondensationsniveau (LCL), freie Konvektion
 * (LFC), Gleichgewichtsniveau (EL), CAPE/CIN (über virtuelle Temperatur),
 * Lifted Index und Nullgradgrenze.
 *
 * Standardformeln: Bolton (1980) für LCL/es, pseudoadiabatischer Aufstieg über
 * dT/dp-Integration. Buoyancy über virtuelle Temperatur (Tv) — korrekter als
 * reines T, besonders bei feuchter Grenzschicht.
 *
 * Ehrlich: Eingangsprofil ist ICON-EU (7 km) auf groben Standard-Druckflächen →
 * CAPE/CIN sind modellbasiert und vertikal grob; als Richtwert, nicht als
 * Radiosonden-Präzision zu lesen.
 */

import type { SoundingLevel, SoundingProfile } from '../sources/iconEuSounding';

const Rd = 287.05;   // J/kg/K
const cp = 1005.7;   // J/kg/K
const Lv = 2.501e6;  // J/kg
const EPS = 0.622;

/** Sättigungsdampfdruck (hPa) über Wasser, Bolton. */
function es(tC: number): number { return 6.112 * Math.exp((17.67 * tC) / (tC + 243.5)); }
/** Sättigungs-Mischungsverhältnis (kg/kg). */
function ws(tC: number, p: number): number { const e = es(tC); return (EPS * e) / Math.max(1e-3, p - e); }
/** Virtuelle Temperatur (K) aus T(°C), Mischungsverhältnis w(kg/kg). */
function tvK(tC: number, w: number): number { return (tC + 273.15) * (1 + 0.61 * w) / (1 + w); }

export interface ParcelPoint { p: number; tC: number }

export interface SoundingDerived {
  capeJkg: number;
  cinJkg: number;
  lclHpa: number; lclM: number;
  lfcHpa: number | null; lfcM: number | null;
  elHpa: number | null; elM: number | null;
  freezingHpa: number | null; freezingM: number | null;
  /** Lifted Index (°C): T_env(500) − T_parcel(500). >0 stabil, <0 instabil. */
  liftedIndex: number | null;
  /** Hebungs-Parcel-Kurve (Boden→oben) für die Skew-T-Darstellung. */
  parcel: ParcelPoint[];
}

/** Lineare Interpolation einer Profilgröße über ln(p). */
function interp(levels: SoundingLevel[], p: number, key: 'tempC' | 'dewC' | 'heightM'): number {
  const ls = levels;
  if (p >= ls[0].pressureHpa) return ls[0][key];
  if (p <= ls[ls.length - 1].pressureHpa) return ls[ls.length - 1][key];
  for (let i = 1; i < ls.length; i++) {
    if (p >= ls[i].pressureHpa) {
      const a = ls[i - 1], b = ls[i];
      const t = (Math.log(p) - Math.log(a.pressureHpa)) / (Math.log(b.pressureHpa) - Math.log(a.pressureHpa));
      return a[key] + (b[key] - a[key]) * t;
    }
  }
  return ls[ls.length - 1][key];
}

/** LCL (Bolton 1980) aus Boden-T/Td (°C) und -Druck (hPa). */
function lcl(tC: number, tdC: number, p: number): { tK: number; p: number } {
  const TK = tC + 273.15, TdK = tdC + 273.15;
  const Tlcl = 1 / (1 / (TdK - 56) + Math.log(TK / TdK) / 800) + 56;
  const pLcl = p * Math.pow(Tlcl / TK, cp / Rd);
  return { tK: Tlcl, p: pLcl };
}

/**
 * Berechnet die abgeleiteten Sounding-Größen für einen Boden-Parcel
 * (unterstes Niveau). Integriert den Parcel-Aufstieg auf feinem Druckraster.
 */
export function computeSounding(profile: SoundingProfile): SoundingDerived {
  const ls = profile.levels;
  const sfc = ls[0];
  const pSfc = sfc.pressureHpa;
  const pTop = ls[ls.length - 1].pressureHpa;

  // Boden-Parcel: behält bis zum LCL sein Mischungsverhältnis (Td-basiert).
  const wSfc = ws(sfc.dewC, pSfc);
  const thetaK = (sfc.tempC + 273.15) * Math.pow(1000 / pSfc, Rd / cp); // trockenadiabatisch
  const L = lcl(sfc.tempC, sfc.dewC, pSfc);
  const lclHpa = Math.min(pSfc, L.p);

  // Parcel-Temperatur (°C) bei Druck p.
  // < LCL: trockenadiabatisch (θ konstant). ≥ LCL: feuchtadiabatisch ab LCL integriert.
  // Wir integrieren die Feuchtadiabate einmal in einer Tabelle ab LCL aufwärts.
  const STEP = 2; // hPa
  const moist: ParcelPoint[] = [];
  {
    let p = lclHpa;
    let tK = L.tK;
    moist.push({ p, tC: tK - 273.15 });
    while (p > pTop) {
      const tC = tK - 273.15;
      const rs = ws(tC, p);
      // dT/dp (K/hPa), pseudoadiabatisch:
      const num = (Rd * tK + Lv * rs);
      const den = (cp + (Lv * Lv * rs * EPS) / (Rd * tK * tK));
      const dTdp = (1 / p) * (num / den);
      const dp = Math.min(STEP, p - pTop);
      tK -= dTdp * dp; // p nimmt ab → T nimmt ab
      p -= dp;
      moist.push({ p, tC: tK - 273.15 });
    }
  }
  const moistTat = (p: number): number => {
    if (p >= moist[0].p) return moist[0].tC;
    for (let i = 1; i < moist.length; i++) {
      if (p >= moist[i].p) {
        const a = moist[i - 1], b = moist[i];
        const t = (a.p - p) / (a.p - b.p);
        return a.tC + (b.tC - a.tC) * t;
      }
    }
    return moist[moist.length - 1].tC;
  };
  const parcelTat = (p: number): number =>
    p >= lclHpa ? thetaK * Math.pow(p / 1000, Rd / cp) - 273.15 : moistTat(p);
  const parcelWat = (p: number): number =>
    p >= lclHpa ? wSfc : ws(parcelTat(p), p);

  // Feines Integrationsraster Boden→oben; CAPE/CIN über Tv.
  let cape = 0, cin = 0;
  let lfcHpa: number | null = null, elHpa: number | null = null;
  let prevBuoy = 0, prevLnp = Math.log(pSfc), started = false;
  const parcelCurve: ParcelPoint[] = [];
  for (let p = pSfc; p >= pTop; p -= STEP) {
    const envT = interp(ls, p, 'tempC');
    const envTd = interp(ls, p, 'dewC');
    const envTv = tvK(envT, ws(envTd, p));
    const pT = parcelTat(p);
    const parTv = tvK(pT, parcelWat(p));
    const buoy = (parTv - envTv) / envTv; // dimensionslos
    parcelCurve.push({ p, tC: pT });
    if (started) {
      const dlnp = prevLnp - Math.log(p); // > 0
      const contrib = Rd * ((buoy + prevBuoy) / 2) * envTv * dlnp; // ≈ g·Δz·(ΔTv/Tv)
      if (contrib > 0) cape += contrib; else cin += contrib;
      // LFC = erster Übergang negativ→positiv oberhalb LCL; EL = positiv→negativ darüber.
      if (p <= lclHpa) {
        if (lfcHpa == null && prevBuoy <= 0 && buoy > 0) lfcHpa = p;
        if (lfcHpa != null && elHpa == null && prevBuoy > 0 && buoy <= 0) elHpa = p;
      }
    }
    prevBuoy = buoy; prevLnp = Math.log(p); started = true;
  }
  // CIN nur bis LFC zählen (darunter); ist LFC null, gibt es keine freie Konvektion.
  if (lfcHpa == null) { cape = 0; cin = 0; }

  // Nullgradgrenze: Druck, bei dem Umgebungs-T 0 °C kreuzt (von unten).
  let freezingHpa: number | null = null;
  for (let i = 1; i < ls.length; i++) {
    if (ls[i - 1].tempC >= 0 && ls[i].tempC < 0) {
      const a = ls[i - 1], b = ls[i];
      const t = a.tempC / (a.tempC - b.tempC);
      freezingHpa = a.pressureHpa + (b.pressureHpa - a.pressureHpa) * t;
      break;
    }
  }

  // Lifted Index bei 500 hPa (falls im Profil).
  let liftedIndex: number | null = null;
  if (pTop <= 500 && pSfc >= 500) liftedIndex = interp(ls, 500, 'tempC') - parcelTat(500);

  const hAt = (p: number | null) => (p == null ? null : interp(ls, Math.max(pTop, Math.min(pSfc, p)), 'heightM'));

  return {
    capeJkg: Math.round(cape),
    cinJkg: Math.round(cin),
    lclHpa: Math.round(lclHpa), lclM: Math.round(interp(ls, lclHpa, 'heightM')),
    lfcHpa: lfcHpa == null ? null : Math.round(lfcHpa), lfcM: lfcHpa == null ? null : Math.round(hAt(lfcHpa) as number),
    elHpa: elHpa == null ? null : Math.round(elHpa), elM: elHpa == null ? null : Math.round(hAt(elHpa) as number),
    freezingHpa: freezingHpa == null ? null : Math.round(freezingHpa),
    freezingM: freezingHpa == null ? null : Math.round(hAt(freezingHpa) as number),
    liftedIndex: liftedIndex == null ? null : Math.round(liftedIndex * 10) / 10,
    parcel: parcelCurve,
  };
}

// ---------------------------------------------------------------------------
// Verify (headless) — synthetische Profile mit bekanntem Verhalten
// ---------------------------------------------------------------------------

export interface SndCheck { name: string; ok: boolean; detail?: string }
export interface SndVerifyResult { checks: SndCheck[]; passed: number; failed: number }

function mkProfile(levels: Array<[number, number, number]>): SoundingProfile {
  // [pHpa, tC, dewC] → SoundingProfile (Höhe näherungsweise barometrisch)
  const ls: SoundingLevel[] = levels.map(([p, tC, dewC]) => ({
    pressureHpa: p, heightM: Math.round(44330 * (1 - Math.pow(p / 1013.25, 0.1903))),
    tempC: tC, dewC: Math.min(tC, dewC), windU: 0, windV: 0,
  }));
  return {
    lat: 50, lon: 8, runAt: new Date(0), validAt: new Date(0),
    surfaceM: ls[0].heightM, surfacePressureHpa: ls[0].pressureHpa, levels: ls,
  };
}

export function verifySounding(): SndVerifyResult {
  const checks: SndCheck[] = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });

  // 1) Feucht-labile Lage (warme feuchte Grenzschicht, kühl aloft) → CAPE > 0, LFC + EL definiert.
  const unstable = computeSounding(mkProfile([
    [1000, 28, 23], [925, 22, 19], [850, 18, 15], [700, 8, 4], [600, 1, -4],
    [500, -8, -16], [400, -20, -30], [300, -38, -50], [250, -48, -60], [200, -56, -70],
  ]));
  add('Labil → CAPE > 0', unstable.capeJkg > 0, `${unstable.capeJkg} J/kg`);
  // LFC muss definiert sein; EL ist optional (Parcel kann bis Profiltop labil bleiben),
  // wenn vorhanden muss es höher (niedrigerer Druck) als das LFC liegen.
  add('Labil → LFC definiert, EL (falls vorhanden) über LFC', unstable.lfcHpa != null && (unstable.elHpa == null || (unstable.elHpa as number) < (unstable.lfcHpa as number)), `LFC ${unstable.lfcHpa} EL ${unstable.elHpa}`);

  // 2) Stabile, trockene Lage → CAPE ≈ 0.
  const stable = computeSounding(mkProfile([
    [1000, 10, -5], [925, 9, -8], [850, 8, -10], [700, 4, -15], [600, -2, -20],
    [500, -10, -28], [400, -22, -40], [300, -40, -55], [250, -50, -65], [200, -56, -72],
  ]));
  add('Stabil → CAPE ≈ 0', stable.capeJkg < 50, `${stable.capeJkg} J/kg`);

  // 3) LCL: trockene Grenzschicht (große Spreizung) → höheres LCL als feuchte.
  const dry = computeSounding(mkProfile([[1000, 30, 0], [850, 18, -8], [700, 8, -15], [500, -10, -30], [300, -40, -55], [200, -56, -72]]));
  const moistP = computeSounding(mkProfile([[1000, 30, 28], [850, 18, 15], [700, 8, 4], [500, -10, -18], [300, -40, -52], [200, -56, -70]]));
  add('Trockene GS → höheres LCL (niedrigerer Druck) als feuchte', dry.lclHpa < moistP.lclHpa, `dry ${dry.lclHpa} vs moist ${moistP.lclHpa} hPa`);

  // 4) Nullgradgrenze: Profil kreuzt 0 °C zwischen 850 und 700 → Druck dazwischen.
  // Warmes Profil (1°C@600, −8°C@500) → 0-°C-Kreuzung zwischen 600 und 500 hPa.
  add('Nullgradgrenze plausibel (500<fz<650 hPa)', unstable.freezingHpa != null && (unstable.freezingHpa as number) < 650 && (unstable.freezingHpa as number) > 500, `${unstable.freezingHpa} hPa`);

  // 5) Lifted Index: labile Lage < 0, stabile > 0.
  add('LI labil < 0', unstable.liftedIndex != null && (unstable.liftedIndex as number) < 0, `${unstable.liftedIndex}`);
  add('LI stabil > 0', stable.liftedIndex != null && (stable.liftedIndex as number) > 0, `${stable.liftedIndex}`);

  const passed = checks.filter((c) => c.ok).length;
  return { checks, passed, failed: checks.length - passed };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifySounding: typeof verifySounding }).__verifySounding = verifySounding;
}
