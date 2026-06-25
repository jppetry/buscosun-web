/**
 * Atmosphäre · Himmel-Linse — Card-Ableitungen (pure, headless testbar).
 *
 * Leitet aus dem bereits geladenen ICON-EU-Vertikalprofil (profile-derivations)
 * drei PROBABILISTISCHE Himmels-Signale ab: Sonnenuntergangs-Qualität, Nebelmeer/
 * Hochnebel und Himmelsoptik (Halo/Nebensonnen). KEINE neue Datenquelle.
 *
 * Saharastaub (CAMS/AOD/PM) ist im Repo über keine bestehende Pipeline verfügbar
 * → Entscheidungs-Gate: die Staub-Card entfällt bewusst (siehe DUST_NOTE), statt
 * eine neue Quelle anzubinden.
 *
 * Ehrlich: Wolken werden über die Taupunktspreizung (RH-Proxy) auf 10 groben
 * ICON-EU-Druckflächen erkannt — Richtwerte, keine exakten Bedeckungsgrade. Alle
 * Aussagen sind als Wahrscheinlichkeit formuliert, nie als Versprechen.
 */

import type { DerivedProfile } from './profile-derivations';

export type SkyLevel = 'good' | 'fair' | 'poor' | 'none';
export interface SkyCard {
  key: 'sunset' | 'fogsea' | 'optics';
  title: string;
  level: SkyLevel;
  text: string;
}

export const DUST_NOTE =
  'Saharastaub: keine Aerosol-/Staub-Datenquelle im Projekt — Card ausgeblendet.';

const de0 = (n: number) => Math.round(n).toString();

interface CloudCover { low: boolean; mid: boolean; high: boolean; highColdM: number | null }

/** Wolken nach Höhe über Grund klassifizieren (tief <2 km, mittel 2–6 km, hoch >6 km). */
function cover(p: DerivedProfile): CloudCover {
  let low = false, mid = false, high = false, highColdM: number | null = null;
  for (const c of p.cloudLayers) {
    const agl = c.baseM - p.surfaceM;
    if (agl < 2000) low = true;
    else if (agl < 6000) mid = true;
    else {
      high = true;
      // Cirrus = Eiskristalle: Temperatur an der Wolkenbasis kälter als −20 °C?
      const t = tempAtHeight(p, c.baseM);
      if (t != null && t < -20) highColdM = c.baseM;
    }
  }
  return { low, mid, high, highColdM };
}

function tempAtHeight(p: DerivedProfile, z: number): number | null {
  const ls = p.levels;
  if (!ls.length) return null;
  if (z <= ls[0].heightM) return ls[0].tempC;
  for (let i = 1; i < ls.length; i++) {
    if (z <= ls[i].heightM) {
      const a = ls[i - 1], b = ls[i];
      const t = (z - a.heightM) / (b.heightM - a.heightM || 1);
      return a.tempC + (b.tempC - a.tempC) * t;
    }
  }
  return ls[ls.length - 1].tempC;
}

const lowInversion = (p: DerivedProfile) =>
  p.inversions.find((iv) => iv.baseM <= p.surfaceM + 400) ?? null;
const lowCloud = (p: DerivedProfile) =>
  p.cloudLayers.find((c) => c.baseM <= p.surfaceM + 600) ?? null;

/** Sonnenuntergangs-/-aufgangs-Qualität aus der Wolkenstruktur. */
export function sunsetCard(p: DerivedProfile): SkyCard {
  const c = cover(p);
  let level: SkyLevel, text: string;
  if (c.low) {
    level = 'poor';
    text = 'Tiefe Bewölkung blockiert wahrscheinlich das flache Abend-/Morgenlicht — eher farbarm.';
  } else if (c.mid || c.high) {
    level = 'good';
    text = 'Hohe oder mittelhohe Wolken bei freiem Westhimmel können sich zur Dämmerung kräftig färben.';
  } else {
    level = 'fair';
    text = 'Weitgehend klar — sauberer, aber meist farbarmer Sonnenuntergang ohne Wolken zum Anstrahlen.';
  }
  return { key: 'sunset', title: 'Sonnenuntergang', level, text };
}

/** Nebelmeer / Hochnebel: bodennahe Inversion + gesättigte tiefe Schicht. */
export function fogSeaCard(p: DerivedProfile): SkyCard {
  const inv = lowInversion(p);
  const lc = lowCloud(p);
  if (inv && lc) {
    return {
      key: 'fogsea', title: 'Nebelmeer', level: 'good',
      text: `Nebelmeer/Hochnebel wahrscheinlich, Obergrenze etwa ${de0(inv.topM)} m — darüber (z. B. auf Gipfeln) voraussichtlich frei und sonnig.`,
    };
  }
  if (inv) {
    return {
      key: 'fogsea', title: 'Nebelmeer', level: 'fair',
      text: `Bodennahe Inversion bis ${de0(inv.topM)} m vorhanden, aber zu trocken für ein geschlossenes Nebelmeer.`,
    };
  }
  return { key: 'fogsea', title: 'Nebelmeer', level: 'none', text: 'Kein Nebelmeer-Signal — keine bodennahe Inversion erkennbar.' };
}

/** Himmelsoptik (Halo/Nebensonnen) aus hohem, kaltem Cirrus. */
export function opticsCard(p: DerivedProfile): SkyCard {
  const c = cover(p);
  if (c.high && c.highColdM != null) {
    return {
      key: 'optics', title: 'Himmelsoptik', level: 'good',
      text: `Hoher, eiskalter Cirrus in ~${de0(c.highColdM)} m — Halo oder Nebensonnen möglich. Schau bei Sonnenschein nach oben.`,
    };
  }
  return { key: 'optics', title: 'Himmelsoptik', level: 'none', text: 'Kein Cirrus mit Eiskristallen in der Höhe — Halo/Nebensonnen unwahrscheinlich.' };
}

export function skyCards(p: DerivedProfile): SkyCard[] {
  return [sunsetCard(p), fogSeaCard(p), opticsCard(p)];
}

// --- Verification (pure, DEV) ------------------------------------------------

export interface SkyCheck { case: string; ok: boolean; detail?: string }

/** DerivedProfile-Stub mit nur den fürs Himmel-Modul genutzten Feldern. */
function mk(over: Partial<DerivedProfile>): DerivedProfile {
  return {
    surfaceM: 600, topM: 12000,
    levels: [
      { heightM: 600, tempC: 12, dewC: 4, windKmh: 8, windDirDeg: 270 },
      { heightM: 3000, tempC: -2, dewC: -10, windKmh: 20, windDirDeg: 270 },
      { heightM: 8000, tempC: -34, dewC: -45, windKmh: 60, windDirDeg: 270 },
    ],
    parcel: [], boundaryLayerTopM: 1500, thermalStrengthMs: 1, cloudBaseM: null,
    cloudLayers: [], inversions: [], shearZones: [], freezingLevelM: 2800, lclM: 1500, capeJkg: 0, cinJkg: 0,
    ...over,
  };
}

export function verifySkyCards(): { checks: SkyCheck[]; passed: number; failed: number } {
  const checks: SkyCheck[] = [];
  const add = (c: string, ok: boolean, detail?: string) => checks.push({ case: c, ok, detail });

  // Tiefe Wolke → Sonnenuntergang poor.
  const lowCl = sunsetCard(mk({ cloudLayers: [{ baseM: 1200, topM: 2000 }] }));
  add('Sonnenuntergang: tiefe Wolke → poor', lowCl.level === 'poor', lowCl.level);

  // Hohe Wolke, tief frei → Sonnenuntergang good.
  const highCl = sunsetCard(mk({ cloudLayers: [{ baseM: 9000, topM: 10000 }] }));
  add('Sonnenuntergang: hohe Wolke → good', highCl.level === 'good', highCl.level);

  // Klar → fair.
  add('Sonnenuntergang: klar → fair', sunsetCard(mk({})).level === 'fair');

  // Nebelmeer: Inversion + tiefe Wolke → good (wahrscheinlich) + Obergrenze.
  const fog = fogSeaCard(mk({ inversions: [{ baseM: 650, topM: 1200, deltaC: 4 }], cloudLayers: [{ baseM: 700, topM: 1100 }] }));
  add('Nebelmeer: Inversion+Wolke → good', fog.level === 'good' && /Obergrenze etwa 1200 m/.test(fog.text), fog.text);

  // Nebelmeer: Inversion ohne Wolke → fair (zu trocken).
  add('Nebelmeer: nur Inversion → fair', fogSeaCard(mk({ inversions: [{ baseM: 650, topM: 1100, deltaC: 3 }] })).level === 'fair');

  // Nebelmeer: nichts → none.
  add('Nebelmeer: keins → none', fogSeaCard(mk({})).level === 'none');

  // Optik: hoher kalter Cirrus → good.
  const opt = opticsCard(mk({ cloudLayers: [{ baseM: 8000, topM: 9000 }] }));
  add('Optik: kalter Cirrus → good', opt.level === 'good', opt.text);

  // Optik: keine hohe Wolke → none.
  add('Optik: keine → none', opticsCard(mk({})).level === 'none');

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifySkyCards: typeof verifySkyCards }).__verifySkyCards = verifySkyCards;
}
