/**
 * 3D-Wetter · Vertikalschnitt-Assembly (US-A2/A3/A4/B1, pur).
 *
 * Aus Oberflächen-Ankerwerten (aus `getPointForecast` — derselbe Multi-Quellen-
 * Blend wie der Rest der App) + dem DEM-Geländeprofil wird ein Höhen×Distanz-
 * Gitter abgeleitet:
 *  • Wind auf Höhe über Grund (AGL) via **logarithmisch-ähnlichem Potenzprofil**
 *    v(z) = v10 · (z/10)^α  (DA-2: Druckfläche/10-m + DEM → AGL).
 *  • Böen analog skaliert, getrennt vom Mittelwind (US-A4).
 *  • Temperatur höhenkorrigiert (Lapse-Rate), inversionsbewusst (US-B1).
 *  • Inversionshöhe + Tal/oberhalb-Temperatur (US-B1/B2/B4).
 *  • Wolkenbasis als LCL-Näherung (US-C1).
 *
 * BEWUSST EHRLICH (US-N7): die Vertikalstruktur ist aus 10-m-Werten + Standard-
 * profilen abgeleitet, nicht aus echten Druckflächen — die Genauigkeit ist durch
 * Modellauflösung und Profilannahme begrenzt. Das kennzeichnet die UI.
 */

import type { SectionColumn } from './sectionGeometry';

/** Standard-Lapse-Rate (°C/m). */
const LAPSE = 0.0065;
/** Referenzhöhe der Oberflächen-Windangabe (m AGL). */
const REF_AGL = 10;
/** Grenzschicht-Obergrenze (m AGL): darüber sättigt das Potenzprofil (freie
 *  Atmosphäre ≈ geostrophisch konstant) — verhindert unrealistisches Weiterwachsen. */
const BOUNDARY_LAYER_M = 1500;
/** Potenzprofil-Exponent (Alpen/raues Gelände zwischen offen 0,14 und Stadt 0,28). */
export const DEFAULT_ALPHA = 0.2;
/** km/h je Windband-Grenze (US-N5: benannte Bänder, nicht reine Farbe). */
export const WIND_BANDS_KMH = [15, 30, 45, 60] as const;
/** Schwelle für Wind-Shear-Hervorhebung (US-A6): km/h Änderung je 300 m Höhe. */
export const SHEAR_THRESHOLD_KMH_PER_300M = 25;

export interface AnchorSurface {
  distanceM: number;
  elevM: number;
  windKmh: number;
  windDirDeg: number; // meteorologisch (woher der Wind weht)
  gustKmh: number;
  tempC: number;
  cloudPct: number;
  humidityPct: number;
  /** Bedeckungsgrad tiefe/mittlere/hohe Bewölkung (%) — US-C2; optional. */
  cloudLowPct?: number;
  cloudMidPct?: number;
  cloudHighPct?: number;
}

/** Typische Höhenbänder der Wolkenstockwerke (m ü. Grund, US-C2). */
export const CLOUD_LAYER_BANDS = {
  low: { minAgl: 200, maxAgl: 2000 },
  mid: { minAgl: 2000, maxAgl: 7000 },
  high: { minAgl: 5000, maxAgl: 13000 },
} as const;

export interface SectionColumnTerrain extends SectionColumn { terrainM: number }

export interface SectionCell {
  levelM: number; // m ü. NN
  agl: number;    // m über Grund
  windKmh: number;
  gustKmh: number;
  tempC: number;
  windDirDeg: number;
}

export interface ColumnProfile {
  index: number;
  distanceM: number;
  terrainM: number;
  lat: number;
  lon: number;
  surface: AnchorSurface;
  /** Wolkenbasis (m ü. NN) oder null, wenn keine relevante Bewölkung. */
  cloudBaseM: number | null;
  cells: SectionCell[];
}

export interface InversionInfo {
  present: boolean;
  /** Obergrenze des Kaltluftsees (m ü. NN). */
  heightM: number | null;
  valleyTempC: number | null;
  aboveTempC: number | null;
  /** Differenz oberhalb − Tal (K); positiv = lohnender Aufstieg. */
  diffK: number | null;
  basis: 'observed' | 'heuristic' | 'none';
  /** Stabilität (für Luftqualitäts-/Frosthinweis, US-B5). */
  stable: boolean;
  note: string;
}

export interface PeakMark {
  distanceM: number;
  terrainM: number;
  /** 'above' = über Inversion (sonnig), 'below' = im Kaltluftsee. */
  relation: 'above' | 'below' | 'none';
  label: string;
}

export interface CrossSection {
  columns: ColumnProfile[];
  heightLevels: number[];
  terrainMinM: number;
  terrainMaxM: number;
  topM: number;
  maxWindKmh: number;
  maxGustKmh: number;
  inversion: InversionInfo;
  valley: PeakMark;
  summit: PeakMark;
}

export interface CrossSectionInput {
  columns: SectionColumnTerrain[];
  anchors: AnchorSurface[]; // ≥ 1, nach distanceM sortiert
  heightLevels?: number[];
  alpha?: number;
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Windband-Index 0..4 für eine km/h-Geschwindigkeit (US-N5). */
export function windBandIndex(kmh: number): number {
  let i = 0;
  for (const b of WIND_BANDS_KMH) { if (kmh >= b) i++; else break; }
  return i; // 0:<15 1:15–30 2:30–45 3:45–60 4:>60
}

/**
 * Kontinuierliche Wind-Farbrampe (km/h → RGB). Stützstellen an den Band-Grenzen,
 * dazwischen linear gemischt → glatter Verlauf statt diskreter Stufen. Die
 * benannten Bänder bleiben für die Legende (US-N5) die Referenz.
 */
const RAMP_STOPS: Array<[number, [number, number, number]]> = [
  [0, [182, 200, 214]],   // < 15  blassblau
  [15, [122, 148, 102]],  // 15–30 salbeigrün
  [30, [212, 163, 115]],  // 30–45 sand
  [45, [201, 123, 71]],   // 45–60 terracotta
  [60, [215, 38, 61]],    // > 60  rot
  [85, [150, 24, 40]],    // sehr stark — tiefes Rot
];

export function windRampRGB(kmh: number): [number, number, number] {
  const v = Math.max(0, kmh);
  if (v <= RAMP_STOPS[0][0]) return RAMP_STOPS[0][1];
  const last = RAMP_STOPS[RAMP_STOPS.length - 1];
  if (v >= last[0]) return last[1];
  for (let i = 0; i < RAMP_STOPS.length - 1; i++) {
    const [v0, c0] = RAMP_STOPS[i], [v1, c1] = RAMP_STOPS[i + 1];
    if (v >= v0 && v <= v1) {
      const t = (v - v0) / (v1 - v0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return last[1];
}

/**
 * Kontinuierliche Temperatur-Farbrampe (°C → RGB) für die Temperaturschichten
 * im 3D-Vorhang. Kalt (violett-blau) → mild (grün/gelb) → warm (rot). Inversionen
 * zeigen sich als wärmeres Band über kühlem Tal.
 */
const TEMP_RAMP_STOPS: Array<[number, [number, number, number]]> = [
  [-20, [78, 96, 162]],
  [-10, [96, 142, 196]],
  [-2, [126, 188, 206]],
  [3, [150, 196, 150]],
  [10, [214, 204, 130]],
  [18, [224, 168, 96]],
  [26, [210, 110, 72]],
  [34, [186, 60, 56]],
];

export function tempRampRGB(tempC: number): [number, number, number] {
  const first = TEMP_RAMP_STOPS[0], last = TEMP_RAMP_STOPS[TEMP_RAMP_STOPS.length - 1];
  if (tempC <= first[0]) return first[1];
  if (tempC >= last[0]) return last[1];
  for (let i = 0; i < TEMP_RAMP_STOPS.length - 1; i++) {
    const [v0, c0] = TEMP_RAMP_STOPS[i], [v1, c1] = TEMP_RAMP_STOPS[i + 1];
    if (tempC >= v0 && tempC <= v1) {
      const t = (tempC - v0) / (v1 - v0);
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ];
    }
  }
  return last[1];
}

/** Lineare Interpolation der Oberflächen-Anker auf eine Distanz (Wind via u/v). */
export function interpAnchor(anchors: AnchorSurface[], distanceM: number): AnchorSurface {
  if (anchors.length === 1) return { ...anchors[0], distanceM };
  if (distanceM <= anchors[0].distanceM) return { ...anchors[0], distanceM };
  const last = anchors[anchors.length - 1];
  if (distanceM >= last.distanceM) return { ...last, distanceM };
  let a = anchors[0], b = anchors[1];
  for (let i = 0; i < anchors.length - 1; i++) {
    if (distanceM >= anchors[i].distanceM && distanceM <= anchors[i + 1].distanceM) { a = anchors[i]; b = anchors[i + 1]; break; }
  }
  const span = b.distanceM - a.distanceM;
  const t = span > 0 ? (distanceM - a.distanceM) / span : 0;
  const lerp = (x: number, y: number) => x + (y - x) * t;
  // Wind als Vektor interpolieren (Richtungs-Wrap vermeiden).
  const toUV = (spd: number, dir: number) => ({ u: -spd * Math.sin((dir * Math.PI) / 180), v: -spd * Math.cos((dir * Math.PI) / 180) });
  const ua = toUV(a.windKmh, a.windDirDeg), ub = toUV(b.windKmh, b.windDirDeg);
  const u = lerp(ua.u, ub.u), v = lerp(ua.v, ub.v);
  const windKmh = Math.hypot(u, v);
  const windDirDeg = (Math.atan2(-u, -v) * 180) / Math.PI + (windKmh < 0.1 ? a.windDirDeg : 0);
  const lerpOpt = (x: number | undefined, y: number | undefined) => lerp(x ?? 0, y ?? 0);
  return {
    distanceM,
    elevM: lerp(a.elevM, b.elevM),
    windKmh,
    windDirDeg: ((windDirDeg % 360) + 360) % 360,
    gustKmh: lerp(a.gustKmh, b.gustKmh),
    tempC: lerp(a.tempC, b.tempC),
    cloudPct: lerp(a.cloudPct, b.cloudPct),
    humidityPct: lerp(a.humidityPct, b.humidityPct),
    cloudLowPct: lerpOpt(a.cloudLowPct, b.cloudLowPct),
    cloudMidPct: lerpOpt(a.cloudMidPct, b.cloudMidPct),
    cloudHighPct: lerpOpt(a.cloudHighPct, b.cloudHighPct),
  };
}

/** Wind auf AGL via Potenzprofil, gesättigt an der Grenzschicht-Obergrenze. */
export function windAtAGL(surfaceKmh: number, agl: number, alpha: number): number {
  const z = Math.min(Math.max(2, agl), BOUNDARY_LAYER_M);
  return surfaceKmh * Math.pow(z / REF_AGL, alpha);
}

/** Hebungskondensationsniveau (LCL) über Grund (m) — Espy-Näherung aus T und RH. */
export function lclAgl(tempC: number, humidityPct: number): number {
  const rh = clamp(humidityPct, 1, 100);
  // Taupunkt-Näherung (Magnus, vereinfacht).
  const a = 17.27, b = 237.7;
  const gamma = (a * tempC) / (b + tempC) + Math.log(rh / 100);
  const dew = (b * gamma) / (a - gamma);
  return Math.max(0, 125 * (tempC - dew)); // ~125 m je °C Spread
}

/** Schätzt die Inversion aus den Ankerwerten (US-B1). */
export function estimateInversion(anchors: AnchorSurface[]): InversionInfo {
  if (anchors.length < 1) return { present: false, heightM: null, valleyTempC: null, aboveTempC: null, diffK: null, basis: 'none', stable: false, note: 'keine Daten' };
  const sorted = [...anchors].sort((a, b) => a.elevM - b.elevM);
  const low = sorted[0], high = sorted[sorted.length - 1];
  const relief = high.elevM - low.elevM;
  const avgCloud = anchors.reduce((s, a) => s + a.cloudPct, 0) / anchors.length;
  const avgWind = anchors.reduce((s, a) => s + a.windKmh, 0) / anchors.length;

  // 1) Beobachtet: höherer Punkt wärmer als tieferer → echte Warmluft aufliegend.
  if (relief > 150 && high.tempC > low.tempC + 0.5) {
    const heightM = low.elevM + relief * 0.5;
    const diffK = high.tempC - low.tempC;
    return {
      present: true, heightM, valleyTempC: low.tempC, aboveTempC: high.tempC, diffK,
      basis: 'observed', stable: avgWind < 12 && avgCloud < 50,
      note: 'Beobachtete Warmluft aufliegend (höhere Lage wärmer als Tal).',
    };
  }
  // 2) Heuristik: klar + windschwach + Relief → Kaltluftsee modelliert.
  if (relief > 200 && avgCloud < 40 && avgWind < 12) {
    const poolDepth = Math.min(relief * 0.55, 400);
    const heightM = low.elevM + poolDepth;
    const strengthK = clamp(2 + relief / 250, 2, 9);
    const valleyTempC = low.tempC;
    const aboveTempC = valleyTempC + strengthK;
    return {
      present: true, heightM, valleyTempC, aboveTempC, diffK: strengthK,
      basis: 'heuristic', stable: avgWind < 8 && avgCloud < 25,
      note: 'Modelliert aus klarer, windschwacher Lage + Talkessel — keine direkte Messung.',
    };
  }
  return { present: false, heightM: null, valleyTempC: low.tempC, aboveTempC: high.tempC, diffK: null, basis: 'none', stable: false, note: 'Keine Inversion prognostiziert.' };
}

/** Baut den kompletten Vertikalschnitt (pur). */
export function assembleCrossSection(input: CrossSectionInput): CrossSection {
  const { columns, anchors } = input;
  const alpha = input.alpha ?? DEFAULT_ALPHA;
  const terrainMin = Math.min(...columns.map((c) => c.terrainM));
  const terrainMax = Math.max(...columns.map((c) => c.terrainM));
  // Schnitt-Decke: höchster Berg + ~1500 m, auf 500 gerundet, min 3000.
  const topM = Math.max(3000, Math.ceil((terrainMax + 1500) / 500) * 500);
  const heightLevels = input.heightLevels ?? defaultLevels(topM);

  const inversion = estimateInversion(anchors);

  let maxWindKmh = 0, maxGustKmh = 0;
  const cols: ColumnProfile[] = columns.map((col) => {
    const surface = interpAnchor(anchors, col.distanceM);
    const cells: SectionCell[] = [];
    for (const levelM of heightLevels) {
      const agl = levelM - col.terrainM;
      if (agl < 0) continue; // unter Grund
      const windKmh = windAtAGL(surface.windKmh, agl, alpha);
      const gustKmh = windAtAGL(surface.gustKmh, agl, alpha);
      // Temperatur: inversionsbewusst.
      let tempC: number;
      if (inversion.present && inversion.heightM != null && levelM <= inversion.heightM && inversion.valleyTempC != null) {
        // Im Kaltluftsee: nahezu isotherm auf Talniveau.
        tempC = inversion.valleyTempC - LAPSE * 0.2 * Math.max(0, levelM - col.terrainM);
      } else {
        tempC = surface.tempC - LAPSE * agl;
      }
      if (windKmh > maxWindKmh) maxWindKmh = windKmh;
      if (gustKmh > maxGustKmh) maxGustKmh = gustKmh;
      cells.push({ levelM, agl, windKmh, gustKmh, tempC, windDirDeg: surface.windDirDeg });
    }
    // Wolkenbasis: nur wenn nennenswerte Bewölkung.
    const cloudBaseM = surface.cloudPct >= 35 ? col.terrainM + lclAgl(surface.tempC, surface.humidityPct) : null;
    return { index: col.index, distanceM: col.distanceM, terrainM: col.terrainM, lat: col.lat, lon: col.lon, surface, cloudBaseM, cells };
  });

  // Tal- und Gipfel-Markierung relativ zur Inversion (US-B2).
  const valleyCol = columns.reduce((a, b) => (b.terrainM < a.terrainM ? b : a), columns[0]);
  const summitCol = columns.reduce((a, b) => (b.terrainM > a.terrainM ? b : a), columns[0]);
  const rel = (terrainM: number): PeakMark['relation'] =>
    inversion.present && inversion.heightM != null ? (terrainM >= inversion.heightM ? 'above' : 'below') : 'none';
  const valley: PeakMark = { distanceM: valleyCol.distanceM, terrainM: valleyCol.terrainM, relation: rel(valleyCol.terrainM), label: 'Tal' };
  const summit: PeakMark = { distanceM: summitCol.distanceM, terrainM: summitCol.terrainM, relation: rel(summitCol.terrainM), label: 'Gipfel' };

  return { columns: cols, heightLevels, terrainMinM: terrainMin, terrainMaxM: terrainMax, topM, maxWindKmh, maxGustKmh, inversion, valley, summit };
}

/**
 * Vertikaler Wind-Shear je Zelle (km/h pro 300 m), aus der Differenz zur Zelle
 * ~300 m darüber (US-A6). Liefert pro Zelle den Betrag; letzte Zellen = 0.
 */
export function columnShear(cells: SectionCell[]): number[] {
  const out = new Array(cells.length).fill(0);
  for (let i = 0; i < cells.length; i++) {
    // Nächsthöhere Zelle ≥ 300 m über dieser finden.
    let j = i + 1;
    while (j < cells.length && cells[j].levelM - cells[i].levelM < 300) j++;
    if (j >= cells.length) break;
    const dz = cells[j].levelM - cells[i].levelM;
    const dv = Math.abs(cells[j].windKmh - cells[i].windKmh);
    out[i] = (dv / dz) * 300;
  }
  return out;
}

/** Indizes der Zellen einer Spalte, die über der Shear-Schwelle liegen. */
export function shearCellFlags(cells: SectionCell[]): boolean[] {
  return columnShear(cells).map((s) => s >= SHEAR_THRESHOLD_KMH_PER_300M);
}

function defaultLevels(topM: number): number[] {
  const step = 150;
  const out: number[] = [];
  for (let z = 0; z <= topM; z += step) out.push(z);
  return out;
}

// --- Verifikation (pur, DEV) -------------------------------------------------

export interface CsCheck { case: string; ok: boolean; detail: string }

function mkCols(terrains: number[]): SectionColumnTerrain[] {
  const N = terrains.length;
  return terrains.map((terrainM, i) => ({ index: i, lat: 47 + i * 0.001, lon: 11 + i * 0.01, distanceM: (i / (N - 1)) * 20000, terrainM }));
}

export function verifyCrossSection(): { checks: CsCheck[]; passed: number; failed: number } {
  const checks: CsCheck[] = [];
  const add = (c: string, ok: boolean, d = '') => checks.push({ case: c, ok, detail: d });

  // Potenzprofil: Wind nimmt mit Höhe zu.
  const v10 = windAtAGL(20, 10, DEFAULT_ALPHA), v100 = windAtAGL(20, 100, DEFAULT_ALPHA), v500 = windAtAGL(20, 500, DEFAULT_ALPHA);
  add('Wind @10m = Oberflächenwert', Math.abs(v10 - 20) < 0.1, v10.toFixed(1));
  add('Wind nimmt mit Höhe zu', v100 > v10 && v500 > v100, `${v10.toFixed(0)}/${v100.toFixed(0)}/${v500.toFixed(0)}`);

  // Windband-Index.
  add('Band <15 → 0', windBandIndex(10) === 0);
  add('Band 45–60 → 3', windBandIndex(50) === 3);
  add('Band >60 → 4', windBandIndex(80) === 4);

  // Interpolation: Mittelpunkt zwischen zwei Ankern.
  const an: AnchorSurface[] = [
    { distanceM: 0, elevM: 600, windKmh: 10, windDirDeg: 270, gustKmh: 15, tempC: 10, cloudPct: 10, humidityPct: 60 },
    { distanceM: 20000, elevM: 2000, windKmh: 30, windDirDeg: 270, gustKmh: 45, tempC: 2, cloudPct: 10, humidityPct: 60 },
  ];
  const mid = interpAnchor(an, 10000);
  add('Interp Wind Mitte ≈ 20', Math.abs(mid.windKmh - 20) < 1, mid.windKmh.toFixed(1));
  add('Interp Temp Mitte ≈ 6', Math.abs(mid.tempC - 6) < 0.5, mid.tempC.toFixed(1));

  // Assembly: keine Zellen unter Grund.
  const cs = assembleCrossSection({ columns: mkCols([600, 900, 1400, 2000, 1400, 900, 600]), anchors: an });
  const allAbove = cs.columns.every((c) => c.cells.every((cell) => cell.levelM >= c.terrainM));
  add('keine Zellen unter Grund', allAbove);
  add('Top ≥ 3000', cs.topM >= 3000, String(cs.topM));
  add('maxWind > Oberfläche (Höhenzunahme)', cs.maxWindKmh > 30, cs.maxWindKmh.toFixed(0));

  // Inversion: beobachtet (höher wärmer).
  const invObs = estimateInversion([
    { distanceM: 0, elevM: 500, windKmh: 5, windDirDeg: 0, gustKmh: 8, tempC: -2, cloudPct: 10, humidityPct: 90 },
    { distanceM: 1, elevM: 1700, windKmh: 6, windDirDeg: 0, gustKmh: 9, tempC: 9, cloudPct: 10, humidityPct: 40 },
  ]);
  add('Inversion beobachtet erkannt', invObs.present && invObs.basis === 'observed', invObs.basis);
  add('Inversion diffK > 0', (invObs.diffK ?? 0) > 0, String(invObs.diffK));
  add('Inversionshöhe zwischen Tal und Gipfel', invObs.heightM! > 500 && invObs.heightM! < 1700, String(Math.round(invObs.heightM!)));

  // Keine Inversion: bewölkt/windig.
  const invNone = estimateInversion([
    { distanceM: 0, elevM: 500, windKmh: 30, windDirDeg: 0, gustKmh: 45, tempC: 8, cloudPct: 90, humidityPct: 80 },
    { distanceM: 1, elevM: 1700, windKmh: 40, windDirDeg: 0, gustKmh: 60, tempC: 0, cloudPct: 90, humidityPct: 80 },
  ]);
  add('keine Inversion bei Wind/Wolken', !invNone.present, invNone.basis);

  // Peaks above/below.
  const csInv = assembleCrossSection({
    columns: mkCols([500, 800, 1200, 1700, 1200, 800, 500]),
    anchors: [
      { distanceM: 0, elevM: 500, windKmh: 4, windDirDeg: 0, gustKmh: 6, tempC: -2, cloudPct: 5, humidityPct: 90 },
      { distanceM: 20000, elevM: 1700, windKmh: 5, windDirDeg: 0, gustKmh: 7, tempC: 8, cloudPct: 5, humidityPct: 40 },
    ],
  });
  add('Gipfel über Inversion', csInv.summit.relation === 'above', csInv.summit.relation);
  add('Tal unter Inversion', csInv.valley.relation === 'below', csInv.valley.relation);

  // Shear: starker Höhengradient → Shear-Zellen; gleichförmig → keine.
  const mkCells = (winds: number[]): SectionCell[] => winds.map((w, i) => ({ levelM: i * 150, agl: i * 150, windKmh: w, gustKmh: w * 1.4, tempC: 0, windDirDeg: 270 }));
  const sheary = shearCellFlags(mkCells([10, 20, 35, 55, 80, 80, 80])); // steiler Anstieg unten
  add('Shear-Zone erkannt', sheary.some(Boolean));
  const calm = shearCellFlags(mkCells([20, 21, 22, 23, 24, 25, 26]));
  add('keine Shear bei gleichförmig', !calm.some(Boolean));

  // Farbrampe: Endpunkte + Zwischenwert kontinuierlich.
  const c0 = windRampRGB(0), c100 = windRampRGB(100);
  add('Rampe 0 = blassblau', c0[0] === 182 && c0[2] === 214);
  add('Rampe >85 = tiefes Rot', c100[0] === 150 && c100[1] === 24);
  const cMid = windRampRGB(22.5); // Mitte zwischen Stützstellen 15 und 30
  add('Rampe Zwischenwert interpoliert', cMid[0] > 122 && cMid[0] < 212 && cMid[2] > 102 && cMid[2] < 115, `${cMid.join(',')}`);

  return { checks, passed: checks.filter((c) => c.ok).length, failed: checks.filter((c) => !c.ok).length };
}

if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as unknown as { __verifyCrossSection: typeof verifyCrossSection }).__verifyCrossSection = verifyCrossSection;
}
