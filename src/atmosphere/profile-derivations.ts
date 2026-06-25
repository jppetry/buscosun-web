/**
 * Atmosphäre · Vertikalprofil-Ableitungen (pure, headless testbar).
 *
 * Trennt die Meteorologie vom Rendering: aus einem ICON-EU-SoundingProfile (+
 * den thermodynamischen Größen aus soundingMath) werden die anzeige-relevanten
 * Merkmale abgeleitet — Grenzschicht-/Thermik-Obergrenze, Wolkenschichten,
 * Inversionsbänder, Nullgradgrenze und das Höhenwindprofil. Höhen in METERN,
 * Wind in km/h, Temperatur in °C.
 *
 * Ehrlich: Eingang ist ICON-EU (~7 km, grobe Standard-Druckflächen). Die
 * Thermik-Stärke ist eine grenzschichttiefen-basierte SCHÄTZUNG, kein gemessener
 * Steigwert. Dünne Strukturen (<200 m) sind durch den groben Levelsatz nicht
 * sicher aufgelöst.
 */

import type { SoundingLevel, SoundingProfile } from '../sources/iconEuSounding';
import { computeSounding, type SoundingDerived } from '../threed/soundingMath';

const DRY_LAPSE_PER_M = 9.8 / 1000; // trockenadiabatisch, K/m
/** Taupunktspreizung (°C), unter der ein Niveau als wolkig gilt (RH-Proxy). */
const CLOUD_DEPRESSION_C = 3;

export interface RenderLevel {
  heightM: number;
  tempC: number;
  dewC: number;
  windKmh: number;
  /** Meteorologische Windrichtung (Grad, woher der Wind weht). */
  windDirDeg: number;
}
export interface CloudLayer { baseM: number; topM: number }
export interface Inversion { baseM: number; topM: number; deltaC: number }

export interface DerivedProfile {
  surfaceM: number;
  topM: number;
  levels: RenderLevel[];
  /** Hebungs-Parcel-Kurve in Höhenkoordinaten (für die Skew-T-/Profil-Darstellung). */
  parcel: Array<{ heightM: number; tempC: number }>;
  /** Konvektive Grenzschicht-/Thermik-Obergrenze (m ü. NN). */
  boundaryLayerTopM: number;
  /** Thermik-Stärke-Schätzung 0..~5 m/s aus der Grenzschichttiefe. */
  thermalStrengthMs: number;
  cloudBaseM: number | null;
  cloudLayers: CloudLayer[];
  inversions: Inversion[];
  freezingLevelM: number | null;
  lclM: number;
  capeJkg: number;
  cinJkg: number;
}

const windKmh = (u: number, v: number) => Math.hypot(u, v) * 3.6;
/** Meteorologische Richtung (woher). */
const windDir = (u: number, v: number) => (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360;

/** Konvektive Grenzschicht-Obergrenze: trockener Boden-Parcel bis zum Schnitt mit der Umgebung. */
function dryParcelTopM(ls: SoundingLevel[], surfaceM: number): number {
  const sfcT = ls[0].tempC;
  const parcelAt = (z: number) => sfcT - DRY_LAPSE_PER_M * (z - surfaceM);
  for (let i = 1; i < ls.length; i++) {
    const z = ls[i].heightM;
    if (ls[i].tempC >= parcelAt(z)) {
      // Schnittpunkt linear zwischen i-1 und i interpolieren.
      const z0 = ls[i - 1].heightM;
      const f0 = parcelAt(z0) - ls[i - 1].tempC; // > 0: Parcel wärmer
      const f1 = parcelAt(z) - ls[i].tempC;      // <= 0
      const t = f0 === f1 ? 0 : f0 / (f0 - f1);
      return z0 + (z - z0) * Math.max(0, Math.min(1, t));
    }
  }
  return ls[ls.length - 1].heightM;
}

/** Inversionsbänder: zusammenhängende Abschnitte mit dT/dz > 0. */
function findInversions(ls: SoundingLevel[]): Inversion[] {
  const out: Inversion[] = [];
  let cur: Inversion | null = null;
  for (let i = 1; i < ls.length; i++) {
    const a = ls[i - 1], b = ls[i];
    if (b.tempC > a.tempC + 0.1) {
      if (!cur) cur = { baseM: a.heightM, topM: b.heightM, deltaC: b.tempC - a.tempC };
      else { cur.topM = b.heightM; cur.deltaC += b.tempC - a.tempC; }
    } else if (cur) { out.push(roundInv(cur)); cur = null; }
  }
  if (cur) out.push(roundInv(cur));
  return out;
}
const roundInv = (i: Inversion): Inversion => ({ baseM: Math.round(i.baseM), topM: Math.round(i.topM), deltaC: Math.round(i.deltaC * 10) / 10 });

/** Wolkenschichten aus der Taupunktspreizung (grober RH-Proxy auf 10 Levels). */
function findCloudLayers(ls: SoundingLevel[]): CloudLayer[] {
  const out: CloudLayer[] = [];
  let cur: CloudLayer | null = null;
  for (const l of ls) {
    if (l.tempC - l.dewC < CLOUD_DEPRESSION_C) {
      if (!cur) cur = { baseM: l.heightM, topM: l.heightM };
      else cur.topM = l.heightM;
    } else if (cur) { out.push(roundCloud(cur)); cur = null; }
  }
  if (cur) out.push(roundCloud(cur));
  return out;
}
const roundCloud = (c: CloudLayer): CloudLayer => ({ baseM: Math.round(c.baseM), topM: Math.round(c.topM) });

/** Höhe (m) bei Druck p über ln(p)-Interpolation der Levels. */
function pressureToHeight(ls: SoundingLevel[], p: number): number {
  if (p >= ls[0].pressureHpa) return ls[0].heightM;
  if (p <= ls[ls.length - 1].pressureHpa) return ls[ls.length - 1].heightM;
  for (let i = 1; i < ls.length; i++) {
    if (p >= ls[i].pressureHpa) {
      const a = ls[i - 1], b = ls[i];
      const t = (Math.log(p) - Math.log(a.pressureHpa)) / (Math.log(b.pressureHpa) - Math.log(a.pressureHpa));
      return a.heightM + (b.heightM - a.heightM) * t;
    }
  }
  return ls[ls.length - 1].heightM;
}

/** Leitet aus einem SoundingProfile die anzeige-relevanten Profilmerkmale ab. */
export function deriveProfile(profile: SoundingProfile, derived?: SoundingDerived): DerivedProfile {
  const d = derived ?? computeSounding(profile);
  const ls = profile.levels;
  const surfaceM = profile.surfaceM;
  const topM = ls[ls.length - 1].heightM;

  const levels: RenderLevel[] = ls.map((l) => ({
    heightM: l.heightM, tempC: l.tempC, dewC: l.dewC,
    windKmh: windKmh(l.windU, l.windV), windDirDeg: windDir(l.windU, l.windV),
  }));

  const boundaryLayerTopM = dryParcelTopM(ls, surfaceM);
  const blDepth = Math.max(0, boundaryLayerTopM - surfaceM);
  const sfcDepression = ls[0].tempC - ls[0].dewC;
  // Gesättigter Boden (Nebel/Regen) → keine Thermik; sonst tiefen-skaliert.
  const thermalStrengthMs = sfcDepression < 1 ? 0 : Math.max(0, Math.min(5, (blDepth / 2500) * 5));

  const inversions = findInversions(ls);
  const cloudLayers = findCloudLayers(ls);
  const cloudBaseM = cloudLayers.length ? cloudLayers[0].baseM : (Number.isFinite(d.lclM) ? d.lclM : null);

  const parcel = d.parcel
    .map((pt) => ({ heightM: pressureToHeight(ls, pt.p), tempC: pt.tC }))
    .filter((p) => Number.isFinite(p.heightM));

  return {
    surfaceM, topM, levels, parcel,
    boundaryLayerTopM: Math.round(boundaryLayerTopM),
    thermalStrengthMs: Math.round(thermalStrengthMs * 10) / 10,
    cloudBaseM: cloudBaseM == null ? null : Math.round(cloudBaseM),
    cloudLayers, inversions,
    freezingLevelM: d.freezingM, lclM: d.lclM, capeJkg: d.capeJkg, cinJkg: d.cinJkg,
  };
}

// --- Verification (pure, DEV) ------------------------------------------------

export interface ProfCheck { case: string; ok: boolean; detail?: string }

/** Baut ein SoundingProfile aus [pHpa, tC, dewC]-Tripeln (Höhe barometrisch). */
function mkProfile(levels: Array<[number, number, number]>, windU = 0, windV = 0): SoundingProfile {
  const ls: SoundingLevel[] = levels.map(([p, tC, dewC]) => ({
    pressureHpa: p, heightM: Math.round(44330 * (1 - Math.pow(p / 1013.25, 0.1903))),
    tempC: tC, dewC: Math.min(tC, dewC), windU, windV,
  }));
  return { lat: 47, lon: 11, runAt: new Date(0), validAt: new Date(0), surfaceM: ls[0].heightM, surfacePressureHpa: ls[0].pressureHpa, levels: ls };
}

export function verifyProfileDerivations(): { checks: ProfCheck[]; passed: number; failed: number } {
  const checks: ProfCheck[] = [];
  const add = (c: string, ok: boolean, detail?: string) => checks.push({ case: c, ok, detail });

  // 1) Starke Thermik: heißer, trockener, gut durchmischter Boden (nahezu
  //    trockenadiabatisch bis ~600 hPa) → tiefe Grenzschicht, blauer Tag.
  const thermal = deriveProfile(mkProfile([
    [1000, 30, 4], [925, 23, 2], [850, 16, 0], [700, 1, -12], [600, -9, -20], [500, -20, -30], [300, -44, -58], [200, -58, -72],
  ]));
  add('Thermik: tiefe Grenzschicht (>2000 m AGL)', thermal.boundaryLayerTopM - thermal.surfaceM > 2000, `${thermal.boundaryLayerTopM - thermal.surfaceM} m`);
  add('Thermik: Stärke > 2 m/s', thermal.thermalStrengthMs > 2, `${thermal.thermalStrengthMs} m/s`);
  add('Thermik/blauer Tag: keine Wolkenschicht', thermal.cloudLayers.length === 0, `${thermal.cloudLayers.length}`);

  // 2) Stabil mit Bodeninversion: T steigt 1000→925 → flache Grenzschicht, Inversion erkannt.
  const stable = deriveProfile(mkProfile([
    [1000, 8, 6], [925, 11, 4], [850, 9, 2], [700, 3, -6], [600, -3, -14], [500, -12, -26], [300, -40, -55], [200, -56, -72],
  ]));
  add('Stabil: flache Grenzschicht (<500 m AGL)', stable.boundaryLayerTopM - stable.surfaceM < 500, `${stable.boundaryLayerTopM - stable.surfaceM} m`);
  add('Stabil: schwache Thermik (<1 m/s)', stable.thermalStrengthMs < 1, `${stable.thermalStrengthMs} m/s`);
  add('Stabil: Bodeninversion erkannt', stable.inversions.length >= 1, `${stable.inversions.length}`);

  // 3) Deckelinversion in der Höhe: T steigt 700→600.
  const capped = deriveProfile(mkProfile([
    [1000, 20, 12], [925, 15, 9], [850, 11, 6], [700, 5, -2], [600, 8, -4], [500, -4, -18], [300, -38, -52], [200, -54, -70],
  ]));
  add('Deckel: erhöhte Inversion (Basis > 2500 m)', capped.inversions.some((i) => i.baseM > 2500), JSON.stringify(capped.inversions));

  // 4) Feuchte Schicht aloft → Wolkenschicht erkannt, Wolkenbasis endlich.
  const cloudy = deriveProfile(mkProfile([
    [1000, 16, 9], [925, 12, 6], [850, 9, 8], [700, 4, 3], [600, -2, -10], [500, -12, -26], [300, -40, -55], [200, -56, -72],
  ]));
  add('Wolken: mindestens eine Schicht', cloudy.cloudLayers.length >= 1, `${cloudy.cloudLayers.length}`);
  add('Wolken: Wolkenbasis endlich', cloudy.cloudBaseM != null, `${cloudy.cloudBaseM}`);

  // 5) Windumrechnung: Westwind (u>0) → ~270°, km/h korrekt.
  const wind = deriveProfile(mkProfile([[1000, 15, 5], [850, 8, 0], [700, 2, -8], [500, -12, -28], [300, -40, -55]], 10, 0));
  add('Wind: km/h aus m/s', Math.abs(wind.levels[0].windKmh - 36) < 0.5, `${wind.levels[0].windKmh}`);
  add('Wind: Westwind ~270°', Math.abs(wind.levels[0].windDirDeg - 270) < 1, `${wind.levels[0].windDirDeg}`);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyProfileDerivations: typeof verifyProfileDerivations }).__verifyProfileDerivations = verifyProfileDerivations;
}
