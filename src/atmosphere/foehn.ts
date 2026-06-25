/**
 * Atmosphäre · Föhn-Index (6a, pure, headless testbar).
 *
 * Drei-stufiger Index (kein / tendenziell / aktiv) aus dem geladenen ICON-EU-
 * Vertikalprofil: kräftiger, kammnaher Süd-Wind (klassischer Alpen-Südföhn) +
 * trockene/abgetrocknete Bodenschicht. Ergänzt den oberflächenbasierten
 * `pointForecast/foehnDetector` (FoehnAssessment), arbeitet hier aber direkt auf
 * dem Höhenprofil.
 *
 * ENTSCHEIDUNGS-GATE (P0/D4): Eine echte Cross-Barrier-Druckdifferenz (z. B.
 * Lugano–Zürich, Innsbruck–Bozen) ist über keine bestehende Pipeline verfügbar
 * (kein Stationsdruck-Ingest). Statt eine neue Quelle anzubinden, beschränkt sich
 * der Index auf die aus ICON-EU ableitbaren Indikatoren; die Drucklücke wird in
 * der UI ehrlich benannt (PRESSURE_GATE_NOTE).
 *
 * Ehrlich: ICON-EU (~7 km, grobe Druckflächen), Südföhn-Fokus (Alpen). Richtwert,
 * keine amtliche Föhn-Warnung.
 */

import type { DerivedProfile } from './profile-derivations';

export type FoehnLevel = 'none' | 'tendency' | 'active';

export interface FoehnIndex {
  level: FoehnLevel;
  /** Maximaler Wind (km/h) im kammnahen Band (~1200–3500 m über Grund). */
  crestWindKmh: number;
  /** Windrichtung (Grad, woher) auf Kammniveau. */
  crestDirDeg: number;
  southerly: boolean;
  drivers: string[];
  text: string;
}

export const PRESSURE_GATE_NOTE =
  'Cross-Barrier-Druckdifferenz (Luv–Lee) nicht verfügbar — keine Stationsdruck-Pipeline im Projekt. Index aus ICON-EU-Höhenwind + Bodentrockenheit.';

const CREST_AGL_MIN = 1200, CREST_AGL_MAX = 3500;
const ACTIVE_KMH = 45, TENDENCY_KMH = 30;
const SOUTH_MIN = 120, SOUTH_MAX = 240;   // Südsektor (woher der Wind weht)
const DRY_DEPRESSION_C = 6;               // Bodentrockenheit (T − Td)

const de0 = (n: number) => Math.round(n).toString();
const compass = (deg: number) => ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];

export function foehnIndex(p: DerivedProfile): FoehnIndex {
  const lo = p.surfaceM + CREST_AGL_MIN, hi = p.surfaceM + CREST_AGL_MAX;
  const band = p.levels.filter((l) => l.heightM >= lo && l.heightM <= hi);
  const pool = band.length ? band : p.levels.slice(1);

  let crestWindKmh = 0, crestDirDeg = 0;
  for (const l of pool) if (l.windKmh > crestWindKmh) { crestWindKmh = l.windKmh; crestDirDeg = l.windDirDeg; }

  const southerly = crestDirDeg >= SOUTH_MIN && crestDirDeg <= SOUTH_MAX;
  const sfc = p.levels[0];
  const dry = sfc ? (sfc.tempC - sfc.dewC) >= DRY_DEPRESSION_C : false;

  const drivers: string[] = [];
  if (southerly) drivers.push('südlicher Höhenwind');
  if (crestWindKmh >= TENDENCY_KMH) drivers.push(`Kammwind ${de0(crestWindKmh)} km/h`);
  if (dry) drivers.push('trockene Bodenschicht');

  let level: FoehnLevel = 'none';
  if (southerly && crestWindKmh >= ACTIVE_KMH) level = 'active';
  else if (southerly && crestWindKmh >= TENDENCY_KMH) level = 'tendency';

  let text: string;
  if (level === 'active')
    text = `Aktiver Föhn wahrscheinlich: kräftiger Süd-Kammwind ${de0(crestWindKmh)} km/h aus ${de0(crestDirDeg)}° (${compass(crestDirDeg)})${dry ? ', Bodenschicht trocken' : ''}. Im Lee warm, trocken, böig — kein Niederschlag im Föhngebiet.`;
  else if (level === 'tendency')
    text = `Föhn-Tendenz: mäßiger Süd-Kammwind ${de0(crestWindKmh)} km/h aus ${de0(crestDirDeg)}° (${compass(crestDirDeg)}). Ob sich der Föhn bodennah durchsetzt, ist offen.`;
  else if (crestWindKmh >= TENDENCY_KMH)
    text = `Kein Südföhn: kräftiger Kammwind ${de0(crestWindKmh)} km/h, aber aus ${de0(crestDirDeg)}° (${compass(crestDirDeg)}) — nicht aus dem Südsektor.`;
  else
    text = `Kein Föhn-Signal: schwacher Kammwind ${de0(crestWindKmh)} km/h.`;

  return { level, crestWindKmh: Math.round(crestWindKmh), crestDirDeg: Math.round(crestDirDeg), southerly, drivers, text };
}

// --- Verification (pure, DEV) ------------------------------------------------

export interface FoehnCheck { case: string; ok: boolean; detail?: string }

function mk(levels: Array<{ heightM: number; windKmh: number; windDirDeg: number }>, sfcDd = 8): DerivedProfile {
  const ls = levels.map((l) => ({ heightM: l.heightM, tempC: 10, dewC: 10 - sfcDd, windKmh: l.windKmh, windDirDeg: l.windDirDeg }));
  return {
    surfaceM: 600, topM: 12000, levels: ls, parcel: [],
    boundaryLayerTopM: 1500, thermalStrengthMs: 1, cloudBaseM: null,
    cloudLayers: [], inversions: [], freezingLevelM: 3000, lclM: 1500, capeJkg: 0, cinJkg: 0,
  };
}

export function verifyFoehn(): { checks: FoehnCheck[]; passed: number; failed: number } {
  const checks: FoehnCheck[] = [];
  const add = (c: string, ok: boolean, detail?: string) => checks.push({ case: c, ok, detail });

  // Kräftiger Süd-Kammwind + trocken → aktiv.
  const active = foehnIndex(mk([{ heightM: 600, windKmh: 20, windDirDeg: 180 }, { heightM: 2500, windKmh: 55, windDirDeg: 190 }], 9));
  add('Aktiv: starker Südwind → active', active.level === 'active', `${active.level}/${active.crestWindKmh}`);

  // Mäßiger Süd-Kammwind → Tendenz.
  const tend = foehnIndex(mk([{ heightM: 600, windKmh: 15, windDirDeg: 170 }, { heightM: 2500, windKmh: 34, windDirDeg: 185 }]));
  add('Tendenz: mäßiger Südwind → tendency', tend.level === 'tendency', `${tend.level}/${tend.crestWindKmh}`);

  // Starker Wind, aber Nordwest → kein Südföhn.
  const nw = foehnIndex(mk([{ heightM: 600, windKmh: 20, windDirDeg: 300 }, { heightM: 2500, windKmh: 60, windDirDeg: 310 }]));
  add('Nordwest stark → none', nw.level === 'none', `${nw.level}/${nw.crestDirDeg}`);

  // Schwacher Wind → kein Föhn.
  const calm = foehnIndex(mk([{ heightM: 600, windKmh: 8, windDirDeg: 180 }, { heightM: 2500, windKmh: 14, windDirDeg: 185 }]));
  add('Schwach → none', calm.level === 'none', `${calm.crestWindKmh}`);

  // Kammwind wird im richtigen Band gemessen (nicht der Bodenwert).
  add('Kammwind aus Höhenband', active.crestWindKmh === 55, `${active.crestWindKmh}`);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyFoehn: typeof verifyFoehn }).__verifyFoehn = verifyFoehn;
}
