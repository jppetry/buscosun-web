/**
 * Atmosphäre · Thermik-Feld über dem Gelände (pure, headless testbar).
 *
 * Honest aus BESTEHENDEN Daten abgeleitet: EIN ICON-EU-Umgebungsprofil (am
 * Marker, repräsentativ für die ~7-km-Umgebung) + das Terrarium-DEM über die
 * Fläche. Für jede Geländezelle wird ein trockener Boden-Parcel (Bodentemperatur
 * = Umgebungstemperatur auf Zellenhöhe + fester Tages-Überhitzung) bis zum
 * Schnitt mit dem Umgebungsprofil gehoben → Grenzschichttiefe → Thermik-Stärke.
 * Tiefer/wärmer gelegenes Gelände → tiefere Grenzschicht → stärkere Thermik.
 *
 * Ehrlich: SCHÄTZUNG (ein Profil über die Fläche gehalten, feste Überhitzung,
 * ICON-EU ~7 km) — kein gemessener Steigwert, keine Hangwind-/Einstrahlungsphysik.
 */

const DRY_LAPSE_PER_M = 9.8 / 1000;      // K/m
const DEFAULT_SUPERHEAT_K = 3;            // Tages-Überhitzung des Boden-Parcels
const STRENGTH_FULL_DEPTH_M = 2500;       // Grenzschichttiefe für „volle" Stärke (~5 m/s)

export interface EnvLevel { heightM: number; tempC: number }

/** Umgebungstemperatur (°C) auf Höhe z, linear in der Höhe interpoliert. */
function envTempAtHeight(levels: EnvLevel[], z: number): number {
  if (z <= levels[0].heightM) return levels[0].tempC;
  for (let i = 1; i < levels.length; i++) {
    if (z <= levels[i].heightM) {
      const a = levels[i - 1], b = levels[i];
      const t = (z - a.heightM) / (b.heightM - a.heightM || 1);
      return a.tempC + (b.tempC - a.tempC) * t;
    }
  }
  return levels[levels.length - 1].tempC;
}

/** Thermik-/Grenzschicht-Obergrenze (m ü. NN) für einen Start auf `cellElevM`. */
export function thermalTopM(levels: EnvLevel[], cellElevM: number, superheatK = DEFAULT_SUPERHEAT_K): number {
  const t0 = envTempAtHeight(levels, cellElevM) + superheatK;
  const parcelAt = (z: number) => t0 - DRY_LAPSE_PER_M * (z - cellElevM);
  let prevZ = cellElevM;
  for (const l of levels) {
    if (l.heightM <= cellElevM) continue;
    const diff = parcelAt(l.heightM) - l.tempC; // > 0: Parcel wärmer
    if (diff <= 0) {
      const f0 = parcelAt(prevZ) - envTempAtHeight(levels, prevZ); // > 0
      const t = f0 === diff ? 0 : f0 / (f0 - diff);
      return prevZ + (l.heightM - prevZ) * Math.max(0, Math.min(1, t));
    }
    prevZ = l.heightM;
  }
  return levels[levels.length - 1].heightM;
}

/** Thermik-Stärke-Schätzung (0..5 m/s) auf Geländehöhe `cellElevM`. */
export function thermalStrengthAtElevation(levels: EnvLevel[], cellElevM: number, superheatK = DEFAULT_SUPERHEAT_K): number {
  const depth = Math.max(0, thermalTopM(levels, cellElevM, superheatK) - cellElevM);
  return Math.max(0, Math.min(5, (depth / STRENGTH_FULL_DEPTH_M) * 5));
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Stärke (0..5) → RGBA (sage→amber→terracotta, Alpha mit Stärke; schwach = transparent). */
export function strengthColor(strength: number): [number, number, number, number] {
  if (strength < 0.5) return [0, 0, 0, 0];
  const t = Math.max(0, Math.min(1, (strength - 0.5) / 4.5));
  // sage(122,148,102) → amber(212,163,115) → terracotta(201,123,71)
  let r: number, g: number, b: number;
  if (t < 0.5) { const u = t / 0.5; r = lerp(122, 212, u); g = lerp(148, 163, u); b = lerp(102, 115, u); }
  else { const u = (t - 0.5) / 0.5; r = lerp(212, 201, u); g = lerp(163, 123, u); b = lerp(115, 71, u); }
  const a = Math.round(70 + t * 120); // 0,27 .. 0,74
  return [Math.round(r), Math.round(g), Math.round(b), a];
}

/**
 * Baut die RGBA-Bilddaten des Thermik-Overlays aus dem Umgebungsprofil + dem
 * DEM-Gitter. `dem` ist row-major mit Zeile 0 = latMin (unten); das Bild wird
 * vertikal gespiegelt, sodass Zeile 0 = latMax (oben) für die MapLibre-ImageSource.
 */
export function buildThermalImage(
  levels: EnvLevel[], dem: Float32Array, cols: number, rows: number, superheatK = DEFAULT_SUPERHEAT_K,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(cols * rows * 4);
  // Stärke je einzigartiger Höhe ist teuer → wir rechnen pro Zelle (cols*rows klein).
  for (let r = 0; r < rows; r++) {
    const j = rows - 1 - r; // Bildzeile (oben=latMax) ↔ DEM-Zeile (unten=latMin)
    for (let i = 0; i < cols; i++) {
      const elev = dem[j * cols + i];
      const s = thermalStrengthAtElevation(levels, elev, superheatK);
      const [cr, cg, cb, ca] = strengthColor(s);
      const o = (r * cols + i) * 4;
      out[o] = cr; out[o + 1] = cg; out[o + 2] = cb; out[o + 3] = ca;
    }
  }
  return out;
}

// --- Verification (pure, DEV) ------------------------------------------------

export interface TfCheck { case: string; ok: boolean; detail?: string }

export function verifyThermalField(): { checks: TfCheck[]; passed: number; failed: number } {
  const checks: TfCheck[] = [];
  const add = (c: string, ok: boolean, detail?: string) => checks.push({ case: c, ok, detail });

  // Gut durchmischtes Profil (nahe trockenadiabatisch): tiefe Grenzschicht.
  const mixed: EnvLevel[] = [
    { heightM: 200, tempC: 28 }, { heightM: 1000, tempC: 20 }, { heightM: 2000, tempC: 11 },
    { heightM: 3000, tempC: 2 }, { heightM: 4000, tempC: -7 }, { heightM: 6000, tempC: -24 },
  ];
  const sLow = thermalStrengthAtElevation(mixed, 300);
  const sHigh = thermalStrengthAtElevation(mixed, 2500);
  add('Thermik > 0 über durchmischtem Profil', sLow > 0, `${sLow.toFixed(2)} m/s`);
  add('Tieferes Gelände ≥ höheres Gelände', sLow >= sHigh, `tief ${sLow.toFixed(2)} vs hoch ${sHigh.toFixed(2)}`);

  // Stark stabile Schicht (Inversion am Boden): kaum/keine Thermik.
  const stable: EnvLevel[] = [
    { heightM: 200, tempC: 5 }, { heightM: 600, tempC: 9 }, { heightM: 1500, tempC: 6 },
    { heightM: 3000, tempC: -6 }, { heightM: 6000, tempC: -28 },
  ];
  const sStable = thermalStrengthAtElevation(stable, 250);
  add('Stabil → schwache Thermik (<1,5 m/s)', sStable < 1.5, `${sStable.toFixed(2)} m/s`);

  // Farbe: schwach → transparent; stark → sichtbar + Richtung terracotta.
  add('Stärke <0,5 → transparent', strengthColor(0.2)[3] === 0);
  const strong = strengthColor(5);
  add('Stärke 5 → sichtbar', strong[3] > 120 && strong[0] > 150);

  // Bild: korrekte Größe + vertikale Spiegelung (unten warm → Bildunterkante).
  const cols = 4, rows = 3;
  const dem = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) dem[j * cols + i] = j === 0 ? 300 : 2800; // Zeile0(latMin)=tief
  const img = buildThermalImage(mixed, dem, cols, rows);
  add('Bildgröße cols*rows*4', img.length === cols * rows * 4);
  const aBottom = img[((rows - 1) * cols + 0) * 4 + 3]; // Bildunterkante = latMin = tief = stark
  const aTop = img[(0 * cols + 0) * 4 + 3];             // Bildoberkante = latMax = hoch = schwächer
  add('Spiegelung: tiefes Gelände unten stärker', aBottom >= aTop, `unten ${aBottom} oben ${aTop}`);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyThermalField: typeof verifyThermalField }).__verifyThermalField = verifyThermalField;
}
