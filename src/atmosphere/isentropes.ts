/**
 * Atmosphäre · Isentropen aus dem Vertikalschnitt (6b, pure, headless testbar).
 *
 * Rechnet aus einem CrossSection (threed/crossSection, abgeleitet aus Oberfläche
 * + DEM) die potenzielle Temperatur θ je Zelle und extrahiert Isentropen-Linien
 * (Flächen konstanter θ) über Distanz×Höhe. Im Föhn sinken die Isentropen im Lee
 * ab — genau dieses Muster macht der 2D-Schnitt sichtbar.
 *
 * Ehrlich: θ stammt aus der HEURISTISCHEN Schnitt-Temperatur (10-m + Lapse, keine
 * echten Druckflächen) → qualitatives Bild der Schichtung/Absink-Tendenz, kein
 * exaktes Isentropen-Feld.
 */

import type { CrossSection } from '../threed/crossSection';
import { pressureFromAltitude } from '../sources/iconEuSounding';

const KAPPA = 0.2857; // Rd/cp

/** Potenzielle Temperatur (K) aus T (°C) und Höhe (m ü. NN, barometrisch → Druck). */
export function thetaK(tempC: number, levelM: number): number {
  const p = pressureFromAltitude(levelM);
  return (tempC + 273.15) * Math.pow(1000 / p, KAPPA);
}

export interface ColumnTheta { distanceM: number; pts: Array<{ heightM: number; thK: number }> }
export interface IsentropeLine { thetaK: number; points: Array<{ distanceM: number; heightM: number }> }

/** θ-Profil je Spalte (nach Höhe aufsteigend). */
export function columnThetas(section: CrossSection): ColumnTheta[] {
  return section.columns.map((c) => ({
    distanceM: c.distanceM,
    pts: [...c.cells]
      .sort((a, b) => a.levelM - b.levelM)
      .map((cell) => ({ heightM: cell.levelM, thK: thetaK(cell.tempC, cell.levelM) })),
  }));
}

/** Höhe (m), bei der das θ-Profil den Zielwert kreuzt; null außerhalb des Profils. */
export function heightForTheta(pts: Array<{ heightM: number; thK: number }>, target: number): number | null {
  if (pts.length < 2) return null;
  if (target < pts[0].thK || target > pts[pts.length - 1].thK) return null;
  for (let i = 1; i < pts.length; i++) {
    if (target <= pts[i].thK) {
      const a = pts[i - 1], b = pts[i];
      const f = (target - a.thK) / (b.thK - a.thK || 1);
      return a.heightM + (b.heightM - a.heightM) * f;
    }
  }
  return pts[pts.length - 1].heightM;
}

/**
 * Extrahiert `count` Isentropen über den Schnitt. Pro θ-Wert werden die
 * Spalten-Schnittpunkte zu zusammenhängenden Linien gruppiert (Lücken trennen).
 */
export function buildIsentropes(section: CrossSection, count = 8): IsentropeLine[] {
  const cols = columnThetas(section).filter((c) => c.pts.length >= 2);
  if (cols.length < 2) return [];
  let minTh = Infinity, maxTh = -Infinity;
  for (const c of cols) {
    minTh = Math.min(minTh, c.pts[0].thK);
    maxTh = Math.max(maxTh, c.pts[c.pts.length - 1].thK);
  }
  if (!Number.isFinite(minTh) || maxTh <= minTh) return [];

  const lines: IsentropeLine[] = [];
  for (let k = 1; k <= count; k++) {
    const target = minTh + ((maxTh - minTh) * k) / (count + 1);
    let run: Array<{ distanceM: number; heightM: number }> = [];
    for (const c of cols) {
      const h = heightForTheta(c.pts, target);
      if (h == null) {
        if (run.length >= 2) lines.push({ thetaK: target, points: run });
        run = [];
      } else {
        run.push({ distanceM: c.distanceM, heightM: h });
      }
    }
    if (run.length >= 2) lines.push({ thetaK: target, points: run });
  }
  return lines;
}

// --- Verification (pure, DEV) ------------------------------------------------

export interface IsenCheck { case: string; ok: boolean; detail?: string }

/** CrossSection-Stub: gleiche Höhenlevels, je Spalte ein Temperatur-Offset. */
function mkSection(colTemps: number[][], levels: number[]): CrossSection {
  const columns = colTemps.map((temps, ci) => ({
    index: ci, distanceM: ci * 1000, terrainM: 600, lat: 47, lon: 11,
    surface: {} as never, cloudBaseM: null,
    cells: levels.map((lv, li) => ({ levelM: lv, agl: lv - 600, windKmh: 20, gustKmh: 30, tempC: temps[li], windDirDeg: 180 })),
  }));
  return {
    columns: columns as unknown as CrossSection['columns'],
    heightLevels: levels, terrainMinM: 600, terrainMaxM: 600, topM: levels[levels.length - 1],
    maxWindKmh: 20, maxGustKmh: 30,
    inversion: { present: false, heightM: null, valleyTempC: null, aboveTempC: null, diffK: null, basis: 'none', stable: false, note: '' },
    valley: { distanceM: 0, terrainM: 600, relation: 'none', label: '' },
    summit: { distanceM: 0, terrainM: 600, relation: 'none', label: '' },
  };
}

export function verifyIsentropes(): { checks: IsenCheck[]; passed: number; failed: number } {
  const checks: IsenCheck[] = [];
  const add = (c: string, ok: boolean, detail?: string) => checks.push({ case: c, ok, detail });

  const levels = [700, 1500, 2500, 3500, 4500];

  // θ steigt mit der Höhe (stabile Schichtung).
  add('θ steigt mit Höhe', thetaK(8, 700) < thetaK(2, 2500), `${thetaK(8, 700).toFixed(1)} < ${thetaK(2, 2500).toFixed(1)}`);

  // Stabile Lage, alle Spalten gleich → Isentropen ~horizontal (gleiche Höhe je θ).
  const flatTemps = [12, 6, -1, -8, -16];
  const flat = buildIsentropes(mkSection([flatTemps, flatTemps, flatTemps], levels), 4);
  add('Isentropen extrahiert', flat.length > 0, `${flat.length}`);
  const sample = flat[Math.floor(flat.length / 2)];
  const flatVar = Math.max(...sample.points.map((p) => p.heightM)) - Math.min(...sample.points.map((p) => p.heightM));
  add('flach: Isentrope ~horizontal', flatVar < 50, `${flatVar.toFixed(0)} m`);

  // Föhn: Lee-Spalte (letzte) aloft wärmer → θ höher → Isentrope sinkt ab (kleinere Höhe).
  const luv = [12, 6, -1, -8, -16];
  const lee = [12, 9, 3, -3, -11]; // aloft wärmer
  const foehn = buildIsentropes(mkSection([luv, luv, lee], levels), 6);
  // Suche eine Isentrope, die alle drei Spalten trifft, und vergleiche Luv vs Lee.
  const full = foehn.find((l) => l.points.length === 3);
  add('Föhn: durchgehende Isentrope vorhanden', !!full, `${foehn.length}`);
  if (full) add('Föhn: Isentrope sinkt im Lee ab', full.points[2].heightM < full.points[0].heightM,
    `luv ${full.points[0].heightM.toFixed(0)} → lee ${full.points[2].heightM.toFixed(0)}`);
  else add('Föhn: Isentrope sinkt im Lee ab', false, 'keine durchgehende Linie');

  // heightForTheta: außerhalb des Bereichs → null.
  add('heightForTheta außerhalb → null', heightForTheta([{ heightM: 700, thK: 300 }, { heightM: 2500, thK: 310 }], 290) === null);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyIsentropes: typeof verifyIsentropes }).__verifyIsentropes = verifyIsentropes;
}
