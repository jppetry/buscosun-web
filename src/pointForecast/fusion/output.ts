/**
 * AP8 — die Ausgabe von buscosun Fusion auf dem Punkt-Cube: `PointForecastV2` (Plan §2).
 *
 * Reine Abbildung des `CubeFusionResult` (AP2–AP7) auf ein serialisierbares Produkt: je Schritt je
 * Größe p10/p50/p90/Mittel/σ, die Verteilung, die Art der σ (PAP 6), der Konfidenz-Score (§2.2),
 * die Member mit Gewicht („Quelle + Gewicht", AP8-Hook `onWeights`) und die Setzungen, die wirken.
 * Kein Fetch, keine Uhr, keine Konstante, die nicht aus dem Ergebnis kommt — replaybar wie die
 * Rechnung selbst.
 *
 * Zahlen werden auf die Skala der Cube-Ebene gerundet (V-FI-8: `0.7000000000000001` aus
 * `dequantize`), die Verteilungsparameter bleiben roh — sie SIND die Antwort, die Zahlen daneben
 * sind ihre Lesart.
 */
import type { Dist } from './dist';
import { meanOf, quantileOf } from './dist';
import type { FusedVariable } from './fuse';
import type { FusionVariable } from './priors';
import type { SigmaKind, UncVar, Confidence } from './uncertainty';
import type { PointSourceSample } from '../types';
import type { DWater } from '../../point/client/landCover';
import type {
  CubeFusionResult, CubeStep, CubeMemberInfo, CubeProduct, StepFlag, StepTier, InterpQ, InterpVar, VarUncertainty,
} from '../cubeSource';

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

export type VarIdV2 = 't2m' | 'td2m' | 'rh' | 'wind' | 'windDir' | 'gust' | 'precip' | 'clct' | 'clcl' | 'clcm' | 'clch' | 'ps' | 'snowline' | 'pSnow';
export const VAR_IDS_V2: readonly VarIdV2[] = Object.freeze(['t2m', 'td2m', 'rh', 'wind', 'windDir', 'gust', 'precip', 'clct', 'clcl', 'clcm', 'clch', 'ps', 'snowline', 'pSnow']);

/** Skala der Ausgabe je Größe = Skala der Cube-Ebene (`CUBE_VARS`), abgeleitete Größen auf ihrer natürlichen Stelle. */
export const OUTPUT_SCALE: Readonly<Record<VarIdV2, number>> = Object.freeze({
  t2m: 0.01, td2m: 0.01, rh: 0.1, wind: 0.01, windDir: 1, gust: 0.01, precip: 0.01,
  clct: 0.1, clcl: 0.1, clcm: 0.1, clch: 0.1, ps: 0.1, snowline: 1, pSnow: 0.001,
});
export const UNIT_V2: Readonly<Record<VarIdV2, string>> = Object.freeze({
  t2m: 'degC', td2m: 'degC', rh: 'pct', wind: 'm/s', windDir: 'deg', gust: 'm/s', precip: 'mm/h',
  clct: 'pct', clcl: 'pct', clcm: 'pct', clch: 'pct', ps: 'hPa', snowline: 'm', pSnow: '1',
});

export interface ConfidenceV2 { score: number; spread: number | null; agree: number | null; lage: number | null }

/** Ein Member des Schritts — einmal je Schritt (Details), je Größe nur Gewicht und Wert (`VarMemberV2`). */
export interface MemberV2 {
  product: CubeProduct;
  tag: string;
  run?: string;
  runAt?: string;
  ageH?: number;
  models?: string[];
  station?: CubeMemberInfo['station'];
  nowcast?: CubeMemberInfo['nowcast'];
  anchor?: CubeMemberInfo['anchor'];
}

/** „Quelle + Gewicht" je Größe: `tag` verweist auf `StepV2.members`. */
export interface VarMemberV2 {
  tag: string;
  /** Normiertes Gewicht in der Kombination (Σ über Modell-/Stations-/Radar-Member = 1); `null` = kein Kombinations-Member (Anker). */
  weight: number | null;
  /** Der Wert, mit dem das Member in die Kombination ging (Einheit der Größe), nach PAP 3–5 und Anker; beim Anker der Zuschlag; `null` = trägt diese Größe nicht. */
  value: number | null;
}

export interface VarV2 {
  p10: number | null;
  p50: number | null;
  p90: number | null;
  mean: number | null;
  /** Streuung in der Einheit der Größe: (q84 − q16)/2 der Verteilung — bei Normalverteilung exakt σ. */
  sigma: number | null;
  dist: Dist | null;
  /** PAP 6: woher die σ des Cube-Members kam; `derived` = aus anderen Größen abgeleitet (RH); `none` = ohne Verteilung. */
  sigmaKind: SigmaKind | 'derived' | 'none';
  confidence: ConfidenceV2 | null;
  members: VarMemberV2[];
  /** Schlüssel der Setzungen, die NUR an diesem Schritt für diese Größe wirken (Klartext in `provenance.calibLegend`); die für jede Stunde gleichen stehen einmal in `provenance.calibByVar`. */
  calib: string[];
}

export interface StepV2 {
  validAtMs: number;
  leadH: number;
  tier: StepTier;
  interpolated: boolean;
  /** Die Member des Schritts mit Details (Lauf, Alter, Station, Radar, Anker) — je Größe verweisen `vars[*].members` per `tag` hierher. */
  members: MemberV2[];
  vars: Record<VarIdV2, VarV2 | null>;
  flags: StepFlag[];
}

export interface PointForecastV2 {
  schema: 2;
  point: {
    lat: number; lon: number; hTrue: number | null;
    terrain: { tpi500: number | null; tpi2000: number | null; svf: number | null; slope: number | null; aspect: number | null; sinkDepth: number | null; z0: number | null; imperv: number | null; d0: number | null } | null;
    terrainSource: 'terrarium-z11+z8' | 'override' | 'none';
    /**
     * AP16 (E-F-17): Abstand zum nächsten Gewässer ≥ A_min (WorldCover), zensiert statt Platzhalter — nur mit
     * `CubeIo.landCover` (Feld sonst abwesend ⇒ byte-gleich); `null` = Landbedeckung da, aber ohne Fenster.
     */
    dWater?: DWater | null;
  };
  axis: {
    steps: StepV2[];
    /** Gültigzeiten der nativen Cube-Schritte. */
    native: number[];
    /** Gültigzeiten der interpolierten Schritte (Flag `interpolated`, `fused` fehlt). */
    interpolated: number[];
    seams: number[];
    gaps: Array<[number, number]> | null;
    usableToMs: number | null;
  };
  provenance: {
    indexCommit: string | null;
    runs: {
      t1?: RunV2; t2?: RunV2; t3?: RunV2;
      stations: (CubeFusionResult['provenance']['station'] & { runAt: string }) | null;
      nowcast: CubeFusionResult['provenance']['nowcast'];
    };
    stationReason: string | null;
    clima: CubeFusionResult['provenance']['clima'];
    /** Alle Setzungen der Rechnung mit Grund (Plan §2.3), wie `CubeFusionResult.calib`. */
    calib: string[];
    /** Klartext zu den Schlüsseln in `vars[*].calib`, die die Ausgabe selbst setzt. */
    calibLegend: Record<string, string>;
    /** Je Größe die Schlüssel der Setzungen der Rechnung, die in jeder Stunde wirken (Klartext in `calib`). */
    calibByVar: Partial<Record<VarIdV2, string[]>>;
    /** Einheit je Größe (wie im Cube-Manifest; abgeleitete Größen auf ihrer natürlichen Einheit). */
    units: Record<VarIdV2, string>;
    notes: string[];
    fetched: { files: number | null; bytes: number | null; ms: number | null };
    /**
     * AP13: mit welcher `calib.json` gerechnet wurde (nur mit `CubeIo.calibSource: 'json'`) — Pfad, Schema, sha256
     * der Bytes und die geltenden `measured`-Pfade. Fehlt, wenn die Konstanten galten (Negativkontrolle byte-gleich).
     */
    calibFile?: { path: string; schema: number | null; hash: string | null; measured: string[] };
  };
  timing: { readMs: number | null; terrainMs: number | null; decodeMs: number | null; algoMs: number; outputMs: number; totalMs: number | null };
}

export interface RunV2 { run: string; runAt: string; ageH: number | null; models: string[]; manifestFrom: string | null }

// ---------------------------------------------------------------------------
// Rundung (V-FI-8)
// ---------------------------------------------------------------------------

/**
 * AP12 (V-FI-20): die Ausgabe rundet ≈ 50 000 Zahlen je Punkt; `toFixed` + `Number` (Zeichenkette hin und
 * zurück) war die Hälfte der Ausgabezeit (Profil 18.09.). Für Zehnerpotenz-Schritte ist `k / 10^d` DIESELBE
 * Zahl: `(k·step).toFixed(d)` ist die exakte Dezimaldarstellung von k/10^d, und `Number` davon ist ihr
 * nächster Double — genau das, was die IEEE-Division k/10^d liefert (k ganz, |k| < 2^53). `+ 0` macht aus
 * −0 eine +0 wie `toFixed`. Andere Schritte nehmen weiter den alten Weg. Belegt in `verify:pv-cube` (14).
 */
const POW10: Readonly<Record<number, number>> = Object.freeze({ 0: 1, 1: 10, 2: 100, 3: 1_000, 4: 10_000, 5: 100_000, 6: 1_000_000 });
export function roundTo(x: number | null | undefined, step: number): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const digits = Math.max(0, Math.round(-Math.log10(step)));
  const k = Math.round(x / step);
  const p = POW10[digits];
  if (p !== undefined && step * p === 1 && Math.abs(k) < 2 ** 52) return k / p + 0;
  return Number((k * step).toFixed(digits));
}
/** Der bisherige Weg, unverändert — nur für die Gleichheitsprüfung in `verify:pv-cube` (14). */
export function roundToReference(x: number | null | undefined, step: number): number | null {
  if (x == null || !Number.isFinite(x)) return null;
  const digits = Math.max(0, Math.round(-Math.log10(step)));
  return Number((Math.round(x / step) * step).toFixed(digits));
}
const r3 = (x: number | null | undefined) => roundTo(x, 0.001);

/**
 * AP12 (V-FI-20): Quantile einer Verteilung EINMAL rechnen. Eine Rice-Verteilung kostet je Quantil 60
 * Bisektionsschritte über eine Reihe; dieselbe Verteilung wird für die Ausgabe (p10/p50/p90/q16/q84), die
 * Altfelder (Median) und die Interpolation der Nachbarschritte (bis zu 10-mal) gefragt. Der Speicher hängt
 * am Verteilungsobjekt (`WeakMap`): der Motor gibt jede Verteilung neu heraus und ändert sie danach nicht —
 * dieselbe Zahl, nur einmal gerechnet (`verify:pv-cube` (14) vergleicht jede mit `quantileOf`).
 */
const QMEMO = new WeakMap<Dist, Map<number, number>>();
export function quantileMemo(d: Dist, p: number): number {
  let m = QMEMO.get(d);
  if (!m) { m = new Map(); QMEMO.set(d, m); }
  let v = m.get(p);
  if (v === undefined) { v = quantileOf(d, p); m.set(p, v); }
  return v;
}

// ---------------------------------------------------------------------------
// Abbildungen
// ---------------------------------------------------------------------------

/** Welche Motor-Größe die Gewichte einer Ausgabegröße trägt (AP8-Hook). */
const FUSION_VAR_OF: Partial<Record<VarIdV2, FusionVariable>> = {
  t2m: 'temperature', td2m: 'dewpoint', rh: 'dewpoint', wind: 'wind', gust: 'gust', precip: 'precipitation', clct: 'clouds',
};
/** Welche PAP-6-Größe σ-Art und Konfidenz einer Ausgabegröße trägt. */
const UNC_VAR_OF: Partial<Record<VarIdV2, UncVar>> = {
  t2m: 'temperature', td2m: 'dewpoint', rh: 'dewpoint', wind: 'wind', gust: 'gust', clct: 'clouds',
};
const INTERP_VAR_OF: Partial<Record<VarIdV2, InterpVar>> = {
  t2m: 'temperature', td2m: 'dewPoint', rh: 'humidity', wind: 'windSpeed', gust: 'gust', precip: 'precipitation', clct: 'clouds',
};

/** Der Wert eines Samples für eine Ausgabegröße — wie der Motor ihn liest (`fuse.ts`-Extraktoren). */
function sampleValue(s: PointSourceSample, id: VarIdV2): number | null {
  const f = (x: number | null | undefined) => (x == null || !Number.isFinite(x) ? null : x);
  switch (id) {
    case 't2m': return f(s.temperature);
    case 'wind': return s.u != null && s.v != null && Number.isFinite(s.u) && Number.isFinite(s.v) ? Math.hypot(s.u, s.v) : null;
    case 'gust': return f(s.gust);
    case 'precip': return f(s.precipitation);
    case 'clct': return f(s.cloudTotal) ?? (s.cloudLow != null || s.cloudMid != null || s.cloudHigh != null ? Math.max(s.cloudLow ?? 0, s.cloudMid ?? 0, s.cloudHigh ?? 0) : null);
    case 'clcl': return f(s.cloudLow);
    case 'clcm': return f(s.cloudMid);
    case 'clch': return f(s.cloudHigh);
    case 'ps': return f(s.pressure);
    case 'snowline': return f(s.snowLine);
    case 'rh': return f(s.relativeHumidity);
    default: return null;
  }
}

function confidenceV2(c: Confidence | null | undefined): ConfidenceV2 | null {
  if (!c) return null;
  return { score: r3(c.score) as number, spread: r3(c.spread), agree: r3(c.agree), lage: r3(c.lage) };
}

/** Die Member des Schritts mit Details — einmal je Schritt; der Prior ist immer dabei (K-3). */
function stepMembers(step: CubeStep): MemberV2[] {
  const out: MemberV2[] = step.members.map((m) => {
    const base: MemberV2 = { product: m.product, tag: m.tag };
    if (m.run != null) base.run = m.run;
    if (m.runAtMs != null) base.runAt = new Date(m.runAtMs).toISOString();
    if (m.ageH != null) base.ageH = m.ageH;
    if (m.models) base.models = m.models;
    if (m.station) base.station = m.station;
    if (m.nowcast) base.nowcast = m.nowcast;
    if (m.anchor) base.anchor = m.anchor;
    return base;
  });
  if (!step.interpolated && !out.some((m) => m.product === 'climatology')) out.push({ product: 'climatology', tag: 'climatology' });
  return out;
}

function membersFor(step: CubeStep, id: VarIdV2, fusionVar: FusionVariable | undefined): VarMemberV2[] {
  const w = fusionVar ? step.weights?.[fusionVar] : undefined;
  const weightOf = (tag: string): number | null => {
    if (!w) return null;
    const hit = w.members.find((m) => m.tag === tag);
    return hit ? r3(hit.w) : null;
  };
  const samples = step.samples ?? [];
  const out: VarMemberV2[] = step.members.map((m) => {
    const s = samples.find((x) => x.source === m.tag) ?? null;
    return {
      tag: m.tag,
      weight: m.product === 'anchor' ? null : m.product === 'climatology' ? 1 : weightOf(m.tag),
      value: m.product === 'anchor' ? (id === 't2m' ? r3(m.anchor?.termK) : id === 'gust' ? r3(m.anchor?.termGust) : null)
        : s ? roundTo(sampleValue(s, id), OUTPUT_SCALE[id]) : null,
    };
  });
  // Der Prior ist ein Member der Antwort (K-3): sein Anteil ist 1 − β, gemessen im Motor, nicht gesetzt.
  if (w && Number.isFinite(w.beta) && !out.some((m) => m.tag === 'climatology')) out.push({ tag: 'climatology', weight: r3(1 - w.beta), value: null });
  return out;
}

function fromFused(fv: FusedVariable | null | undefined, id: VarIdV2, step: CubeStep, unc: VarUncertainty | undefined, calib: string[]): VarV2 | null {
  if (!fv) return null;
  const sc = OUTPUT_SCALE[id];
  const q = (p: number) => quantileMemo(fv.dist, p);
  const sigma = (q(0.8413) - q(0.1587)) / 2;
  return {
    p10: roundTo(q(0.1), sc), p50: roundTo(q(0.5), sc), p90: roundTo(q(0.9), sc), mean: roundTo(meanOf(fv.dist), sc),
    sigma: roundTo(sigma, sc), dist: fv.dist,
    sigmaKind: fv.climatologyOnly ? 'none' : (unc?.sigmaKind ?? (id === 'rh' ? 'derived' : 'set')),
    confidence: confidenceV2(unc?.confidence),
    members: membersFor(step, id, FUSION_VAR_OF[id]),
    calib: [...calib, ...(fv.climatologyOnly ? ['climatologyOnly'] : [])],
  };
}

/** Eine Größe ohne Motor-Verteilung: der Wert der tragenden Quelle, mit σ aus dem Cube, wenn es sie gibt. */
function fromCell(step: CubeStep, id: VarIdV2, cellId: string, calib: string[], override?: number | null): VarV2 | null {
  const sc = OUTPUT_SCALE[id];
  const cubeSample = (step.samples ?? []).find((s) => s.source.startsWith('cube-')) ?? null;
  const anySample = (step.samples ?? []).find((s) => sampleValue(s, id) != null) ?? null;
  const value = override ?? (cubeSample ? sampleValue(cubeSample, id) : null) ?? (anySample ? sampleValue(anySample, id) : null) ?? step.cell[cellId] ?? null;
  if (value == null || !Number.isFinite(value)) return null;
  const sdDiv = step.cell[`${cellId}_sd`], sdEns = step.cell[`${cellId}_sd_ens`];
  const sd = sdEns != null && Number.isFinite(sdEns) ? sdEns : sdDiv != null && Number.isFinite(sdDiv) ? sdDiv : null;
  const kind: VarV2['sigmaKind'] = sd == null ? 'none' : sdEns != null && Number.isFinite(sdEns) ? 'ensemble' : 'divergence';
  return {
    p10: sd == null ? null : roundTo(value - 1.2816 * sd, sc), p50: roundTo(value, sc), p90: sd == null ? null : roundTo(value + 1.2816 * sd, sc),
    mean: roundTo(value, sc), sigma: sd == null ? null : roundTo(sd, sc),
    dist: sd == null ? null : { kind: 'normal', mu: value, sigma: sd },
    sigmaKind: kind, confidence: null, members: membersFor(step, id, undefined),
    calib: [...calib, sd == null ? 'noSigmaPlane' : 'sigmaCubeOnly'],
  };
}

function fromInterp(q: InterpQ | undefined, id: VarIdV2, score: number | undefined): VarV2 | null {
  if (!q) return null;
  const sc = OUTPUT_SCALE[id];
  return {
    p10: roundTo(q.p10, sc), p50: roundTo(q.p50, sc), p90: roundTo(q.p90, sc), mean: roundTo(q.mean, sc),
    sigma: roundTo((q.p90 - q.p10) / 2.5631, sc), dist: null, sigmaKind: 'set',
    confidence: score == null ? null : { score: r3(score) as number, spread: null, agree: null, lage: null },
    members: [],
    calib: ['interpolated'],
  };
}

/**
 * Welche Setzungen der Rechnung (`CubeFusionResult.calib`, Schlüssel vor dem Doppelpunkt) je Größe wirken.
 * AP13 (V-FI-68): nur Schlüssel, die `fuseCubePoint` wirklich ausgibt — vorher standen hier fünf, die niemand
 * emittiert (`vertResidual/lapse/gammaCap/lapseTd/clct`), und elf emittierte fehlten; `calibByVar` verlor sie stumm.
 * Allgemeine Schlüssel (`footprint`, `lead`, `hTrue`, `tail`, `interpolation`) stehen in `provenance.calib`, nicht je Größe.
 */
const CALIB_KEYS_OF: Partial<Record<VarIdV2, readonly string[]>> = {
  t2m: ['sigmaSys', 'cSpread', 'sigmaQuant', 'sigmaVert', 'standardLapse', 'phi', 'dzSurface', 'Ld', 'Lh', 'kappa', 'anchor', 'A', 'Auhi', 'fRad', 'fSaison', 'tpiSigma', 'stationSigma', 'confidence'],
  td2m: ['sigmaSys', 'cSpread', 'sigmaQuant', 'sigmaVert', 'Ld', 'Lh', 'kappa', 'stationSigma', 'confidence'],
  rh: ['sigmaSys', 'cSpread', 'sigmaVert'],
  wind: ['sigmaSys', 'cSpread', 'sigmaQuant', 'Ld', 'Lh', 'kappa', 'anchor', 'z0', 'z0Mod', 'zBlend', 'stationSigma', 'confidence'],
  gust: ['sigmaSys', 'cSpread', 'sigmaQuant', 'Ld', 'Lh', 'kappa', 'anchor', 'z0', 'z0Mod', 'zBlend', 'stationSigma', 'confidence'],
  precip: ['precipSigma', 'nowcastStale', 'Ld', 'Lh', 'kappa'],
  clct: ['sigmaSys', 'cSpread', 'sigmaQuant', 'Ld', 'Lh', 'kappa', 'stationSigma', 'confidence'],
  snowline: ['meltOffset', 'Ld', 'Lh', 'kappa'],
};
/** Klartext zu den Schlüsseln, die die Ausgabe selbst setzt (die der Rechnung stehen mit Grund in `provenance.calib`). */
export const CALIB_LEGEND_V2: Readonly<Record<string, string>> = Object.freeze({
  interpolated: 'set — lineare Interpolation der Quantile der Nachbarschritte; σ aus p10/p90 unter Normalannahme; kein Member',
  climatologyOnly: 'kein Member trägt mehr — die Verteilung IST der Prior',
  rhDerived: 'rh abgeleitet aus T und Td (linearisiert, korrelierte Fehler), keine eigene Fusion',
  precipPriors: 'set — ACC.precipOcc, PRECIP_WET_CLIMA, PRECIP_OCC_TAIL ungemessen (V-PV-17)',
  windDirGate: 'Richtung des kombinierten Mittelvektors, Konzentrations-Gate ν/σ ≥ 1 (kein Quantil)',
  noSigmaPlane: 'keine σ-Ebene im Cube für diese Größe — Wert der tragenden Quelle ohne Verteilung',
  sigmaCubeOnly: 'σ nur aus dem Cube (σ_div oder σ_ens), ohne σ_sys — PAP 6 gilt für t2m/td2m/Wind/Böe/clct (set)',
  psHydrostatic: 'ps hydrostatisch von h_mod_eff auf h_true gebracht (PAP 4)',
  pSnowWetBulb: 'Feuchtkugel-Phase (meteo.ts) aus der T-Verteilung und RH',
});

/** Je Größe die Schlüssel (vor dem Doppelpunkt) der Setzungen, die wirklich in der Rechnung stehen — einmal je Produkt. */
export function calibByVar(globalCalib: string[]): Partial<Record<VarIdV2, string[]>> {
  const globalKeys = globalCalib.map((c) => c.split(':')[0]);
  const out: Partial<Record<VarIdV2, string[]>> = {};
  for (const id of VAR_IDS_V2) { const keys = CALIB_KEYS_OF[id]; if (keys) out[id] = globalKeys.filter((k) => keys.includes(k)); }
  return out;
}

function stepToV2(step: CubeStep): StepV2 {
  // Je Größe nur, was an DIESEM Schritt gilt; die stundenunabhängigen Schlüssel stehen in `provenance.calibByVar`.
  const calibOf = (_id: VarIdV2): string[] => [];
  const vars = {} as Record<VarIdV2, VarV2 | null>;
  if (step.interpolated) {
    for (const id of VAR_IDS_V2) {
      const iv = INTERP_VAR_OF[id];
      const uv = UNC_VAR_OF[id];
      vars[id] = iv ? fromInterp(step.interp?.[iv], id, uv ? step.interp?.confidence?.[uv] : undefined) : null;
    }
    return { validAtMs: step.validAtMs, leadH: step.leadH, tier: step.tier, interpolated: true, members: [], vars, flags: step.flags };
  }
  const f = step.fused;
  vars.t2m = fromFused(f?.temperature, 't2m', step, step.uncertainty.temperature, calibOf('t2m'));
  vars.td2m = fromFused(f?.dewPoint, 'td2m', step, step.uncertainty.dewpoint, calibOf('td2m'));
  vars.rh = fromFused(f?.humidity, 'rh', step, step.uncertainty.dewpoint, [...calibOf('rh'), 'rhDerived']);
  vars.wind = fromFused(f?.windSpeed, 'wind', step, step.uncertainty.wind, calibOf('wind'));
  vars.gust = fromFused(f?.gust, 'gust', step, step.uncertainty.gust, calibOf('gust'));
  vars.precip = fromFused(f?.precipitation, 'precip', step, undefined, [...calibOf('precip'), 'precipPriors']);
  vars.clct = fromFused(f?.clouds, 'clct', step, step.uncertainty.clouds, calibOf('clct'));
  const dir = f?.windDirectionDeg ?? null;
  vars.windDir = dir == null ? null : {
    p10: null, p50: roundTo(dir, 1), p90: null, mean: roundTo(dir, 1), sigma: null, dist: null, sigmaKind: 'none',
    confidence: null, members: membersFor(step, 'windDir', 'wind'), calib: ['windDirGate'],
  };
  vars.clcl = fromCell(step, 'clcl', 'clcl', []);
  vars.clcm = fromCell(step, 'clcm', 'clcm', []);
  vars.clch = fromCell(step, 'clch', 'clch', []);
  vars.ps = fromCell(step, 'ps', 'ps', step.vertical?.ps != null ? ['psHydrostatic'] : [], step.vertical?.ps ?? undefined);
  vars.snowline = fromCell(step, 'snowline', 'snowlmt', []);
  const pSnow = f?.pSnow ?? null;
  vars.pSnow = pSnow == null ? null : {
    p10: null, p50: roundTo(pSnow, OUTPUT_SCALE.pSnow), p90: null, mean: roundTo(pSnow, OUTPUT_SCALE.pSnow), sigma: null, dist: null,
    sigmaKind: 'derived', confidence: null, members: [], calib: ['pSnowWetBulb'],
  };
  return { validAtMs: step.validAtMs, leadH: step.leadH, tier: step.tier, interpolated: false, members: stepMembers(step), vars, flags: step.flags };
}

// ---------------------------------------------------------------------------
// Der Einstieg
// ---------------------------------------------------------------------------

export interface OutputExtra {
  nowMs: number;
  terrainSource: PointForecastV2['point']['terrainSource'];
  urban?: Record<string, number | null> | null;
  /** V-FI-17: z0 am Punkt (WorldCover, log-Mittel im 500-m-Kreis), m — fehlt ⇒ `point.terrain.z0` bleibt `null`. */
  z0?: number | null;
  fetched?: { files: number | null; bytes: number | null; ms: number | null };
  timing?: { readMs?: number | null; terrainMs?: number | null; decodeMs?: number | null; totalMs?: number | null };
  /** AP13: die gelesene `calib.json` (s. `provenance.calibFile`). */
  calibFile?: PointForecastV2['provenance']['calibFile'];
  /** AP16: d_water aus der Landbedeckung — fehlt das Feld, fehlt `point.dWater`. */
  dWater?: DWater | null;
}

export function toPointForecastV2(r: CubeFusionResult, extra: OutputExtra): PointForecastV2 {
  const T0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const H = 3_600_000;
  const runOf = (t: 't1' | 't2' | 't3'): RunV2 | undefined => {
    const x = r.provenance.runs[t];
    if (!x) return undefined;
    return { run: x.run, runAt: new Date(x.sourceRunAtMs).toISOString(), ageH: roundTo((extra.nowMs - x.sourceRunAtMs) / H, 0.1), models: x.models, manifestFrom: x.manifestFrom };
  };
  const steps = r.steps.map((s) => stepToV2(s));
  const t = r.point.terrain;
  const out: PointForecastV2 = {
    schema: 2,
    point: {
      lat: r.point.lat, lon: r.point.lon, hTrue: r.point.hTrue,
      terrain: t ? {
        tpi500: roundTo(t.tpi500M, 0.1), tpi2000: roundTo(t.tpi2000M, 0.1), svf: r3(t.svf), slope: roundTo(t.slopeDeg, 0.1), aspect: roundTo(t.aspectDeg, 1),
        sinkDepth: roundTo(t.sinkDepthM, 1), z0: roundTo(extra.z0, 0.00001), imperv: roundTo(extra.urban?.imperv, 0.1), d0: roundTo(extra.urban?.d0, 0.1),
      } : null,
      terrainSource: extra.terrainSource,
      ...(extra.dWater !== undefined ? { dWater: extra.dWater } : {}),
    },
    axis: {
      steps,
      native: r.axis.native,
      interpolated: r.steps.filter((s) => s.interpolated).map((s) => s.validAtMs),
      seams: r.axis.seams,
      gaps: r.axis.gaps ? r.axis.gaps.map((g) => [g.fromH, g.toH] as [number, number]) : null,
      usableToMs: r.axis.usableToMs,
    },
    provenance: {
      indexCommit: r.provenance.indexCommit,
      runs: {
        ...(runOf('t1') ? { t1: runOf('t1') } : {}), ...(runOf('t2') ? { t2: runOf('t2') } : {}), ...(runOf('t3') ? { t3: runOf('t3') } : {}),
        stations: r.provenance.station ? { ...r.provenance.station, runAt: new Date(r.provenance.station.runAtMs).toISOString() } : null,
        nowcast: r.provenance.nowcast,
      },
      stationReason: r.provenance.stationReason,
      clima: r.provenance.clima,
      calib: r.calib,
      calibLegend: { ...CALIB_LEGEND_V2 },
      calibByVar: calibByVar(r.calib),
      units: { ...UNIT_V2 },
      notes: r.notes,
      fetched: extra.fetched ?? { files: null, bytes: null, ms: null },
      ...(extra.calibFile ? { calibFile: extra.calibFile } : {}),
    },
    timing: {
      readMs: extra.timing?.readMs ?? null, terrainMs: extra.timing?.terrainMs ?? null, decodeMs: extra.timing?.decodeMs ?? null,
      algoMs: r.timing.algoMs, outputMs: 0, totalMs: extra.timing?.totalMs ?? null,
    },
  };
  out.timing.outputMs = Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - T0) * 10) / 10;
  return out;
}

// ---------------------------------------------------------------------------
// Verifikation (netzfrei) — die Abbildung selbst
// ---------------------------------------------------------------------------

export function verifyOutput(): { ok: boolean; checks: Array<{ name: string; ok: boolean; detail?: string }> } {
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const add = (name: string, ok: boolean, detail?: string) => checks.push({ name, ok, detail });
  add('roundTo: 0,7000000000000001 auf 0,1 ⇒ 0,7 (V-FI-8); 12,3456 auf 0,01 ⇒ 12,35; 1013,26 auf 0,1 ⇒ 1013,3', roundTo(0.7000000000000001, 0.1) === 0.7 && roundTo(12.3456, 0.01) === 12.35 && roundTo(1013.26, 0.1) === 1013.3);
  add('roundTo: null/NaN ⇒ null, Skala 1 ⇒ ganzzahlig', roundTo(null, 0.1) === null && roundTo(NaN, 0.1) === null && roundTo(2431.6, 1) === 2432);
  const n: Dist = { kind: 'normal', mu: 10, sigma: 2 };
  const sig = (quantileOf(n, 0.8413) - quantileOf(n, 0.1587)) / 2;
  add('σ-Lesart (q84 − q16)/2 = σ bei Normalverteilung (±1e-3)', Math.abs(sig - 2) < 1e-3, sig.toFixed(4));
  add('OUTPUT_SCALE deckt alle 14 Größen, Einheiten benannt', VAR_IDS_V2.every((id) => OUTPUT_SCALE[id] > 0 && UNIT_V2[id].length > 0) && VAR_IDS_V2.length === 14);
  return { ok: checks.every((c) => c.ok), checks };
}
