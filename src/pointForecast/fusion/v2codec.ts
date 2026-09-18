/**
 * V-FI-21 — compact, lossless-where-it-matters encoding of `PointForecastV2` (buscosun Fusion on the point cube).
 *
 * `PointForecastV2` as JSON is ≈ 1,1 MB per point (337 hourly steps); the archive (AP9) stores the cube path for
 * 405 points per slot. This codec turns it into a JSON-serialisable object of integer columns:
 *
 *   • per variable and step, p10/p50/p90/mean/σ as integers on the output scale (`OUTPUT_SCALE`, = the cube plane
 *     scale): p50 and σ delta-coded along the time axis, p10/p90/mean as their distance to p50 (delta-coded),
 *     `null` stays `null`;
 *   • the distribution family as an enum, its parameters quantised (`PARAM_STEP`: location on the output scale, spread
 *     one decimal finer, log-space parameters and probabilities on 1e-3) — the only lossy part, within half a step;
 *   • members as indices into a per-forecast member table (static part once); per step the age as the residual
 *     against its derivation (run time → valid time, else the lead), radar records as indices into a table, the
 *     anchor record as columns (its numbers on 1e-4 — the second lossy part, within half a step); per
 *     variable the ordered member set per step as an index, weights and values as one delta-coded column per source
 *     (a variable whose sets and weights equal an earlier one's stores a reference — rh/td2m, windDir/wind);
 *   • confidence (delta-coded) and codes as integers;
 *   • flags, calib keys, tiers and σ kinds as indices into per-forecast tables of the arrays that occur;
 *   • point, provenance and timing once, verbatim — the calib legend and the unit table by reference when they are
 *     the registered texts (a changed text is stored verbatim instead, never silently replaced).
 *
 * Round trip (`decodeV2(encodeV2(v))`): distribution parameters and the anchor record's numbers within half their
 * quantisation step, every other number EXACT (same double — `output.ts` already rounds them to their scale; the
 * encoder throws if one is not), flags/members/axis/provenance exact. The encoder checks the
 * exact part itself and throws if a value is not on its scale. A checksum (FNV-1a 32 over the body) makes any flipped
 * digit fail the decode. Pure: no DOM, no network, no clock. Object key order of the decoded `vars` follows
 * `VAR_IDS_V2` (JSON key order carries no meaning here; `compareV2` compares by key).
 */
import type { Dist } from './dist';
import { meanOf, quantileOf } from './dist';
import type { ConfidenceV2, MemberV2, PointForecastV2, StepV2, VarIdV2, VarMemberV2, VarV2 } from './output';
import { OUTPUT_SCALE, VAR_IDS_V2, roundTo } from './output';

export const V2C_CODEC = 'buscosun-v2c';
export const V2C_VERSION = 1;

type Col = Array<number | null>;

interface CompactVar {
  /** Per step: 0 = variable absent; else 1 + σ-kind index + 8·dist kind + 64·confidence mask (5 bits). */
  c: number[];
  /**
   * Steps WITHOUT a distribution (interpolated hours, values without σ, direction, P(snow)) — integers on the output
   * scale: p50 (delta), p50 − p10 (delta), p90 − p50 (delta), mean − p50, σ (delta); a difference falls back to the
   * raw value where p50 is `null`. `null` at steps that carry a distribution.
   */
  q: [Col, Col, Col, Col, Col];
  /**
   * Steps WITH a distribution — p10/p50/p90/mean/σ are its reading (`output.ts`): stored as the residual against the
   * same reading of the DECODED distribution (integers on the output scale, almost always 0). `null` elsewhere, and
   * where the value itself is `null`.
   */
  r: [Col, Col, Col, Col, Col];
  /** Distribution parameters, up to four columns (layout per kind in `DIST_LAYOUT`), delta-coded integers. */
  d: [Col, Col, Col, Col];
  /** Non-finite distribution parameters (e.g. an open upper bound): [step, column, +1 = ∞ / −1 = −∞ / 0 = NaN]. */
  dn: Array<[number, number, number]>;
  /**
   * Confidence on 0.001 (exact: `output.ts` rounds with `r3`): score (delta) where the factors are missing (interpolated
   * hours), score as the residual against r3(spread · agree · lage) of the decoded factors (PAP 6: the score IS that
   * product) where they are present, then spread, agree, lage (delta).
   */
  f: [Col, Col, Col, Col, Col];
  /** Per step: index into `calibSets`. */
  k: number[];
  /** Per step: index into `tables.memberSets` (the ordered tag indices of this variable's members at that step). */
  ms: number[];
  /** Per tag index: weight on 0.001, delta-coded — or `{ ref }` to a variable with identical member sets and weights. */
  mw: Record<string, Col> | { ref: VarIdV2 };
  /** Per tag index: value on the output scale, delta-coded; values off that scale (anchor terms) are in `mx`. */
  mv: Record<string, Col>;
  /** Member values off the output scale: [step, tag index, value on 0.001]. */
  mx: Array<[number, number, number]>;
}

interface CompactBody {
  point: PointForecastV2['point'];
  axis: {
    t0: number;
    /** validAtMs deltas to the previous step (first = 0). */
    dt: number[];
    leadH: number[];
    tier: number[];
    interp: number[];
    flags: number[];
    native: number[];
    /** `null` = the list of interpolated steps' valid times (as `output.ts` builds it). */
    interpolated: number[] | null;
    seams: number[];
    gaps: PointForecastV2['axis']['gaps'];
    usableToMs: number | null;
  };
  tables: {
    tiers: string[];
    sigmaKinds: string[];
    flagSets: string[][];
    calibSets: string[][];
    tags: string[];
    /** Ordered tag-index lists of the variables' members, one entry per distinct list. */
    memberSets: number[][];
    /** Distinct radar records of the members (`MemberV2.nowcast`). */
    nowcasts: Array<NonNullable<MemberV2['nowcast']>>;
    /** Distinct `sources` lists of the anchor records. */
    anchorSources: string[][];
    /** Static part of each member (without `ageH`, `nowcast`, `anchor`). */
    members: Array<Omit<MemberV2, 'ageH' | 'nowcast' | 'anchor'>>;
  };
  steps: {
    /** Members per step: count, then flat table index. */
    mn: number[];
    mi: number[];
    /** Age per flat member position on 0.01 h, as the residual against `ageBase` (null = no age). */
    ma: Col;
    /** Ages that are not on 0.01 h: [position, age verbatim]. */
    mz: Array<[number, number]>;
    /** Radar records: [position, index into `tables.nowcasts`]. */
    nc: Array<[number, number]>;
    /** Anchor records, one entry per anchored member position (positions delta-coded, numbers on 1e-4 delta-coded). */
    an: {
      pos: number[]; sources: number[]; pairs: number[];
      fraction: Col; offsetK: Col; termK: Col; termU: Col; termV: Col; termGust: Col;
    };
  };
  vars: Partial<Record<VarIdV2, CompactVar>>;
  provenance: Omit<PointForecastV2['provenance'], 'calibLegend' | 'units'> & {
    calibLegend: Record<string, string> | { ref: string };
    units: Record<string, string> | { ref: string };
  };
  timing: PointForecastV2['timing'];
}

export interface CompactV2 {
  codec: typeof V2C_CODEC;
  version: typeof V2C_VERSION;
  steps: number;
  /** FNV-1a 32 over `JSON.stringify(body)`. */
  check: number;
  body: CompactBody;
}

// ---------------------------------------------------------------------------
// Scales and tables
// ---------------------------------------------------------------------------

const DIST_KINDS = ['none', 'normal', 'censoredNormal', 'logCensored', 'hurdleLogNormal', 'rice'] as const;
type DistKind = Exclude<(typeof DIST_KINDS)[number], 'none'>;
type ParamScale = 'loc' | 'spread' | 'log' | 'prob';
/** Which parameter goes into which of the four columns, and on which scale. */
const DIST_LAYOUT: Readonly<Record<DistKind, ReadonlyArray<readonly [string, ParamScale]>>> = Object.freeze({
  normal: [['mu', 'loc'], ['sigma', 'spread']],
  censoredNormal: [['mu', 'loc'], ['sigma', 'spread'], ['lo', 'loc'], ['hi', 'loc']],
  logCensored: [['mu', 'log'], ['sigma', 'log']],
  hurdleLogNormal: [['mu', 'log'], ['sigma', 'log'], ['pDry', 'prob']],
  rice: [['nu', 'loc'], ['sigma', 'spread']],
});
const POW10 = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000];
/** Decimal digits of a scale that is a power of ten (0.01 → 2). */
const digitsOf = (step: number): number => Math.max(0, Math.round(-Math.log10(step)));
/**
 * Parameter steps (set, V-FI-21): a location parameter on the output scale (its half step is below the rounding of p50
 * itself), a spread one decimal finer (a small σ keeps its relative precision: ps σ 0,3 hPa ± 0,005), log-space
 * parameters and probabilities on 1e-3 (precipitation amount ± 0,05 % relative, P(dry) ± 0,05 %-points).
 */
export function paramStep(id: VarIdV2, s: ParamScale): number {
  const extra = PARAM_EXTRA_DIGITS[s];
  return s === 'loc' || s === 'spread' ? OUTPUT_SCALE[id] / POW10[extra] : 1 / POW10[extra];
}
/** Digits beyond the output scale (location, spread) or absolute digits (log space, probability). */
const PARAM_EXTRA_DIGITS: Readonly<Record<ParamScale, number>> = Object.freeze({ loc: 0, spread: 1, log: 4, prob: 4 });
const SIGMA_KINDS_MAX = 8;
/** The reading of a distribution as `output.ts` writes it: p10, p50, p90, mean, σ = (q84 − q16)/2, on the output scale. */
function readingOf(dist: Dist, sc: number): Array<number | null> {
  const q = (p: number) => quantileOf(dist, p);
  return [roundTo(q(0.1), sc), roundTo(q(0.5), sc), roundTo(q(0.9), sc), roundTo(meanOf(dist), sc), roundTo((q(0.8413) - q(0.1587)) / 2, sc)];
}
/** A distribution from its quantised parameters — the same object on both sides of the codec. */
function distFrom(kind: DistKind, id: VarIdV2, ints: Array<number | null>, special: (j: number) => number | undefined): Dist {
  const o: Record<string, number | string> = { kind };
  DIST_LAYOUT[kind].forEach(([name, ps], j) => {
    const kk = ints[j];
    o[name] = kk == null ? (special(j) ?? NaN) : fromInt(kk, digitsOf(paramStep(id, ps)));
  });
  return o as unknown as Dist;
}

/** r3(spread · agree · lage) as an integer on 0.001 — the confidence score from its three factors (PAP 6). */
function scoreOf(spread: number | null, agree: number | null, lage: number | null): number | null {
  if (spread == null || agree == null || lage == null) return null;
  const r = roundTo(Math.min(1, Math.max(0, spread * agree * lage)), 0.001);
  return r == null ? null : toInt(r, 3);
}

/** The anchor record's numbers (AP7) — carried on 1e-4 (K, m/s, fraction), within half a step. */
export const ANCHOR_NUM_FIELDS = ['fraction', 'offsetK', 'termK', 'termU', 'termV', 'termGust'] as const;
export const ANCHOR_STEP = 1e-4;
const HOUR_MS = 3_600_000;
/**
 * What a member's age is expected to be: from its run time to the step's valid time on 0.1 h (as `cubeSource.ts`
 * writes it for cube tiers and the station), else the step's lead (anchor, climatology). Only the residual is stored.
 */
function ageBase(m: { runAt?: string }, validAtMs: number, leadH: number): number {
  if (m.runAt) { const t = Date.parse(m.runAt); if (Number.isFinite(t)) return Math.round(((validAtMs - t) / HOUR_MS) * 10) / 10; }
  return leadH;
}

/**
 * Registered texts: the calib legend and unit table of `output.ts` as of codec version 1. A forecast whose texts equal
 * a registered one stores the reference; any other text is stored verbatim. `verify:pv-cube` (17) fails when
 * `output.ts` changes a text without registering it here — an archive must decode to the texts it was written with.
 */
const LEGEND_V1: Readonly<Record<string, string>> = Object.freeze({
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
const UNITS_V1: Readonly<Record<string, string>> = Object.freeze({
  t2m: 'degC', td2m: 'degC', rh: 'pct', wind: 'm/s', windDir: 'deg', gust: 'm/s', precip: 'mm/h',
  clct: 'pct', clcl: 'pct', clcm: 'pct', clch: 'pct', ps: 'hPa', snowline: 'm', pSnow: '1',
});
const REGISTERED_TEXTS: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({ 'legend-1': LEGEND_V1, 'units-1': UNITS_V1 });
/** For the verifier: the registered texts (to compare with the ones `output.ts` writes today). */
export const V2C_REGISTERED = Object.freeze({ legend: LEGEND_V1, units: UNITS_V1 });

// ---------------------------------------------------------------------------
// Integer helpers
// ---------------------------------------------------------------------------

function toInt(x: number, digits: number): number { return Math.round(x * POW10[digits]); }
function fromInt(k: number, digits: number): number { return digits === 0 ? k + 0 : k / POW10[digits] + 0; }

/** Encodes a column of numbers on a power-of-ten scale; `exact` = every value must come back as the same double. */
function encodeCol(vals: Array<number | null | undefined>, step: number, exact: boolean, what: string): Col {
  const d = digitsOf(step);
  if (d >= POW10.length || Math.abs(step * POW10[d] - 1) > 1e-12) throw new Error(`v2codec: Skala ${step} ist keine Zehnerpotenz (${what})`);
  return vals.map((v) => {
    if (v == null || !Number.isFinite(v)) return null;
    const k = toInt(v, d);
    if (exact && fromInt(k, d) !== v) throw new Error(`v2codec: ${what} ${v} liegt nicht auf der Skala ${step}`);
    return k;
  });
}
function decodeCol(col: Col, step: number): Array<number | null> {
  const d = digitsOf(step);
  return col.map((k) => (k == null ? null : fromInt(k, d)));
}
/** Delta coding along the axis: the first non-null value absolute, every further one as the difference to the previous non-null. */
function delta(col: Col): Col {
  let prev: number | null = null;
  return col.map((k) => { if (k == null) return null; const out = prev == null ? k : k - prev; prev = k; return out; });
}
function undelta(col: Col): Col {
  let prev: number | null = null;
  return col.map((k) => { if (k == null) return null; const v = prev == null ? k : prev + k; prev = v; return v; });
}

/** FNV-1a 32 over the UTF-16 code units of a string. */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Index of a value in a table of arrays, compared by content; appended when new. */
function setIndex(table: string[][], keyOf: Map<string, number>, arr: string[]): number {
  const key = JSON.stringify(arr);
  let i = keyOf.get(key);
  if (i === undefined) { i = table.length; table.push([...arr]); keyOf.set(key, i); }
  return i;
}
function strIndex(table: string[], keyOf: Map<string, number>, s: string): number {
  let i = keyOf.get(s);
  if (i === undefined) { i = table.length; table.push(s); keyOf.set(s, i); }
  return i;
}
function textRef(obj: Record<string, string>): Record<string, string> | { ref: string } {
  const key = JSON.stringify(obj);
  for (const [ref, t] of Object.entries(REGISTERED_TEXTS)) if (JSON.stringify(t) === key) return { ref };
  return { ...obj };
}
function textOf(x: Record<string, string> | { ref: string }): Record<string, string> {
  if (typeof (x as { ref?: unknown }).ref === 'string' && Object.keys(x).length === 1) {
    const t = REGISTERED_TEXTS[(x as { ref: string }).ref];
    if (!t) throw new Error(`v2codec: unbekannter Text-Verweis ${(x as { ref: string }).ref}`);
    return { ...t };
  }
  return { ...(x as Record<string, string>) };
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

export function encodeV2(v2: PointForecastV2): CompactV2 {
  if (v2.schema !== 2) throw new Error(`v2codec: Schema ${String((v2 as { schema?: unknown }).schema)} statt 2`);
  const steps = v2.axis.steps;
  const n = steps.length;
  const tiers: string[] = [], tierKey = new Map<string, number>();
  const sigmaKinds: string[] = [], skKey = new Map<string, number>();
  const flagSets: string[][] = [], flagKey = new Map<string, number>();
  const calibSets: string[][] = [], calibKey = new Map<string, number>();
  const tags: string[] = [], tagKey = new Map<string, number>();
  const members: CompactBody['tables']['members'] = [], memberKey = new Map<string, number>();

  // Axis
  const t0 = n ? steps[0].validAtMs : 0;
  const dt = steps.map((s, i) => (i === 0 ? 0 : s.validAtMs - steps[i - 1].validAtMs));
  const interpList = steps.filter((s) => s.interpolated).map((s) => s.validAtMs);
  const interpDerived = JSON.stringify(interpList) === JSON.stringify(v2.axis.interpolated);

  // Step members
  const smn: number[] = [], smi: number[] = [], sma: Col = [];
  const smz: CompactBody['steps']['mz'] = [], snc: CompactBody['steps']['nc'] = [];
  const nowcasts: CompactBody['tables']['nowcasts'] = [], ncKey = new Map<string, number>();
  const anchorSources: string[][] = [], asKey = new Map<string, number>();
  const anPos: number[] = [], anSrc: number[] = [], anPairs: number[] = [];
  const anNum: Record<(typeof ANCHOR_NUM_FIELDS)[number], Array<number | null>> = { fraction: [], offsetK: [], termK: [], termU: [], termV: [], termGust: [] };
  for (const s of steps) {
    smn.push(s.members.length);
    for (const m of s.members) {
      const { ageH, nowcast, anchor, ...stat } = m;
      const key = JSON.stringify(stat);
      let idx = memberKey.get(key);
      if (idx === undefined) { idx = members.length; members.push(stat); memberKey.set(key, idx); }
      const at = smi.length;
      if (nowcast) {
        const nk = JSON.stringify(nowcast);
        let ni = ncKey.get(nk);
        if (ni === undefined) { ni = nowcasts.length; nowcasts.push(nowcast); ncKey.set(nk, ni); }
        snc.push([at, ni]);
      }
      if (anchor) {
        anPos.push(at);
        anSrc.push(setIndex(anchorSources, asKey, anchor.sources));
        if (!Number.isInteger(anchor.pairs)) throw new Error(`v2codec: Anker-Paare ${anchor.pairs} nicht ganzzahlig`);
        anPairs.push(anchor.pairs);
        for (const f of ANCHOR_NUM_FIELDS) anNum[f].push(anchor[f]);
      }
      smi.push(idx);
      if (ageH == null) sma.push(null);
      else {
        const k = toInt(ageH, 2);
        if (fromInt(k, 2) !== ageH) { smz.push([at, ageH]); sma.push(null); }
        else sma.push(k - toInt(ageBase(stat, s.validAtMs, s.leadH), 2));
      }
    }
  }

  // Variables
  const vars: CompactBody['vars'] = {};
  const memberSets: number[][] = [], msKey = new Map<string, number>();
  const mwKey = new Map<string, VarIdV2>();
  for (const id of VAR_IDS_V2) {
    if (!steps.some((s) => s.vars[id] != null)) continue;
    const sc = OUTPUT_SCALE[id];
    const dOut = digitsOf(sc);
    const c: number[] = [], k: number[] = [], ms: number[] = [];
    const q: Array<Array<number | null>> = [[], [], [], [], []];
    const rr: Col[] = [[], [], [], [], []];
    const f: Array<Array<number | null>> = [[], [], [], []];
    const fScoreRaw: Col = [], fScoreRes: Col = [];
    const dInts: Col[] = [[], [], [], []];
    const dn: CompactVar['dn'] = [];
    const mwT = new Map<number, Col>(), mvT = new Map<number, Col>();
    const mx: CompactVar['mx'] = [];
    const colOf = (m: Map<number, Col>, tag: number): Col => { let col = m.get(tag); if (!col) { col = new Array(n).fill(null); m.set(tag, col); } return col; };
    for (let si = 0; si < n; si++) {
      const v = steps[si].vars[id];
      if (!v) {
        c.push(0); k.push(0); ms.push(0);
        for (const col of q) col.push(null);
        for (const col of rr) col.push(null);
        for (const col of dInts) col.push(null);
        for (const col of f) col.push(null);
        fScoreRaw.push(null); fScoreRes.push(null);
        continue;
      }
      const sk = strIndex(sigmaKinds, skKey, v.sigmaKind);
      if (sigmaKinds.length > SIGMA_KINDS_MAX) throw new Error('v2codec: mehr als acht σ-Arten');
      const dk = v.dist ? DIST_KINDS.indexOf(v.dist.kind as DistKind) : 0;
      if (dk < 0) throw new Error(`v2codec: unbekannte Verteilung ${(v.dist as { kind: string }).kind}`);
      const conf = v.confidence;
      const cm = conf ? 1 | (conf.spread != null ? 2 : 0) | (conf.agree != null ? 4 : 0) | (conf.lage != null ? 8 : 0) | (conf.score == null ? 16 : 0) : 0;
      c.push(1 + sk + 8 * dk + 64 * cm);
      const layout = v.dist ? DIST_LAYOUT[v.dist.kind as DistKind] : [];
      const stepInts: Array<number | null> = [null, null, null, null];
      const stepSpecial = new Map<number, number>();
      for (let j = 0; j < 4; j++) {
        const spec = layout[j];
        if (!spec || !v.dist) { dInts[j].push(null); continue; }
        const x = (v.dist as unknown as Record<string, number>)[spec[0]];
        if (Number.isFinite(x)) { const kk = toInt(x, digitsOf(paramStep(id, spec[1]))); dInts[j].push(kk); stepInts[j] = kk; }
        else { dInts[j].push(null); const code = x === Infinity ? 1 : x === -Infinity ? -1 : 0; dn.push([si, j, code]); stepSpecial.set(j, code === 1 ? Infinity : code === -1 ? -Infinity : NaN); }
      }
      const actual = encodeCol([v.p10, v.p50, v.p90, v.mean, v.sigma], sc, true, `${id}.q`);
      if (v.dist) {
        const reading = encodeCol(readingOf(distFrom(v.dist.kind as DistKind, id, stepInts, (j) => stepSpecial.get(j)), sc), sc, true, `${id}.reading`);
        // A value the reading cannot give (null there, a number here) would make the residual meaningless — impossible
        // for the distributions `output.ts` writes; the encoder refuses instead of guessing.
        if (actual.some((a, j) => a != null && reading[j] == null)) throw new Error(`v2codec: ${id} — Lesart der Verteilung ohne Wert`);
        actual.forEach((a, j) => { rr[j].push(a == null ? null : a - (reading[j] as number)); q[j].push(null); });
      } else {
        actual.forEach((a, j) => { q[j].push(a); rr[j].push(null); });
      }
      f[0].push(conf?.score ?? null); f[1].push(conf?.spread ?? null); f[2].push(conf?.agree ?? null); f[3].push(conf?.lage ?? null);
      {
        const [sc0] = encodeCol([conf?.score ?? null], 0.001, true, `${id}.confidence`);
        const pred = conf ? scoreOf(conf.spread, conf.agree, conf.lage) : null;
        if (sc0 != null && pred != null) { fScoreRes.push(sc0 - pred); fScoreRaw.push(null); }
        else { fScoreRes.push(null); fScoreRaw.push(sc0); }
      }
      k.push(setIndex(calibSets, calibKey, v.calib));
      const tagIdx = v.members.map((m) => strIndex(tags, tagKey, m.tag));
      if (new Set(tagIdx).size !== tagIdx.length) throw new Error(`v2codec: ${id} trägt ein Member zweimal im selben Schritt`);
      const setKey = tagIdx.join(',');
      let si2 = msKey.get(setKey);
      if (si2 === undefined) { si2 = memberSets.length; memberSets.push(tagIdx); msKey.set(setKey, si2); }
      ms.push(si2);
      v.members.forEach((m, j) => {
        const t = tagIdx[j];
        const [w] = encodeCol([m.weight], 0.001, true, `${id}.weight`);
        colOf(mwT, t)[si] = w;
        if (m.value != null && Number.isFinite(m.value)) {
          const kv = toInt(m.value, dOut);
          if (fromInt(kv, dOut) === m.value) colOf(mvT, t)[si] = kv;
          else { const [k3] = encodeCol([m.value], 0.001, true, `${id}.memberValue`); mx.push([si, t, k3 as number]); colOf(mvT, t); }
        } else colOf(mvT, t);
      });
    }
    const P = q as Col[];
    const rel = (x: Col, base: Col, sign: 1 | -1): Col => x.map((v, i) => (v == null ? null : base[i] == null ? v : sign * (v - (base[i] as number))));
    const mwObj: Record<string, Col> = {}, mvObj: Record<string, Col> = {};
    for (const [t, col] of [...mwT.entries()].sort((x, y) => x[0] - y[0])) mwObj[t] = delta(col);
    for (const [t, col] of [...mvT.entries()].sort((x, y) => x[0] - y[0])) mvObj[t] = delta(col);
    const mwSig = JSON.stringify([ms, mwObj]);
    const ref = mwKey.get(mwSig);
    if (!ref) mwKey.set(mwSig, id);
    vars[id] = {
      c,
      q: [delta(P[1]), delta(rel(P[0], P[1], -1)), delta(rel(P[2], P[1], 1)), rel(P[3], P[1], 1), delta(P[4])],
      r: rr as CompactVar['r'],
      d: dInts.map((col) => delta(col)) as CompactVar['d'],
      dn,
      f: [delta(fScoreRaw), fScoreRes, ...f.slice(1).map((col) => delta(encodeCol(col, 0.001, true, `${id}.confidence`)))] as CompactVar['f'],
      k, ms,
      mw: ref ? { ref } : mwObj,
      mv: mvObj,
      mx,
    };
  }

  const { calibLegend, units, ...provRest } = v2.provenance;
  const body: CompactBody = {
    point: v2.point,
    axis: {
      t0, dt,
      leadH: steps.map((s) => s.leadH),
      tier: steps.map((s) => strIndex(tiers, tierKey, s.tier)),
      interp: steps.map((s) => (s.interpolated ? 1 : 0)),
      flags: steps.map((s) => setIndex(flagSets, flagKey, s.flags)),
      native: v2.axis.native.map((t, i, a) => (i === 0 ? t : t - a[i - 1])),
      interpolated: interpDerived ? null : [...v2.axis.interpolated],
      seams: [...v2.axis.seams],
      gaps: v2.axis.gaps,
      usableToMs: v2.axis.usableToMs,
    },
    tables: { tiers, sigmaKinds, flagSets, calibSets, tags, memberSets, nowcasts, anchorSources, members },
    steps: {
      mn: smn, mi: smi, ma: sma, mz: smz, nc: snc,
      an: {
        pos: delta(anPos) as number[], sources: anSrc, pairs: anPairs,
        fraction: delta(encodeCol(anNum.fraction, ANCHOR_STEP, false, 'anchor')), offsetK: delta(encodeCol(anNum.offsetK, ANCHOR_STEP, false, 'anchor')),
        termK: delta(encodeCol(anNum.termK, ANCHOR_STEP, false, 'anchor')), termU: delta(encodeCol(anNum.termU, ANCHOR_STEP, false, 'anchor')),
        termV: delta(encodeCol(anNum.termV, ANCHOR_STEP, false, 'anchor')), termGust: delta(encodeCol(anNum.termGust, ANCHOR_STEP, false, 'anchor')),
      },
    },
    vars,
    provenance: { ...provRest, calibLegend: textRef(calibLegend), units: textRef(units as Record<string, string>) },
    timing: v2.timing,
  };
  return { codec: V2C_CODEC, version: V2C_VERSION, steps: n, check: fnv1a32(JSON.stringify(body)), body };
}

// ---------------------------------------------------------------------------
// Decode
// ---------------------------------------------------------------------------

export function decodeV2(c: CompactV2): PointForecastV2 {
  if (!c || c.codec !== V2C_CODEC) throw new Error('v2codec: kein buscosun-v2c-Objekt');
  if (c.version !== V2C_VERSION) throw new Error(`v2codec: Version ${String(c.version)} unbekannt (kann ${V2C_VERSION})`);
  const b = c.body;
  const sum = fnv1a32(JSON.stringify(b));
  if (sum !== c.check) throw new Error(`v2codec: Prüfsumme ${sum} ≠ ${c.check} — die Kodierung ist beschädigt`);
  const n = c.steps;
  const ax = b.axis;
  if ([ax.dt, ax.leadH, ax.tier, ax.interp, ax.flags, b.steps.mn].some((a) => a.length !== n)) throw new Error('v2codec: Achsenlängen passen nicht zur Schrittzahl');

  // Step members
  const stepMembers: MemberV2[][] = [];
  const ncAt = new Map(b.steps.nc.map(([p, ni]) => [p, b.tables.nowcasts[ni]]));
  const ageRaw = new Map(b.steps.mz);
  const an = b.steps.an;
  const anPos = undelta(an.pos) as number[];
  const anNums = Object.fromEntries(ANCHOR_NUM_FIELDS.map((f) => [f, decodeCol(undelta(an[f]), ANCHOR_STEP)])) as Record<(typeof ANCHOR_NUM_FIELDS)[number], Array<number | null>>;
  const anAt = new Map(anPos.map((p, j) => [p, {
    sources: [...b.tables.anchorSources[an.sources[j]]], pairs: an.pairs[j],
    fraction: anNums.fraction[j] as number, offsetK: anNums.offsetK[j], termK: anNums.termK[j] as number,
    termU: anNums.termU[j] as number, termV: anNums.termV[j] as number, termGust: anNums.termGust[j] as number,
  }]));
  let pos = 0, tAt = ax.t0;
  for (let i = 0; i < n; i++) {
    tAt += ax.dt[i];
    const list: MemberV2[] = [];
    for (let j = 0; j < b.steps.mn[i]; j++, pos++) {
      const stat = b.tables.members[b.steps.mi[pos]];
      if (!stat) throw new Error('v2codec: Member-Verweis außerhalb der Tabelle');
      const r = b.steps.ma[pos];
      const ageH = ageRaw.has(pos) ? ageRaw.get(pos) : r == null ? undefined : fromInt(r + toInt(ageBase(stat, tAt, ax.leadH[i]), 2), 2);
      const m: MemberV2 = { product: stat.product, tag: stat.tag };
      if (stat.run !== undefined) m.run = stat.run;
      if (stat.runAt !== undefined) m.runAt = stat.runAt;
      if (ageH != null) m.ageH = ageH;
      if (stat.models !== undefined) m.models = stat.models;
      if (stat.station !== undefined) m.station = stat.station;
      const nc = ncAt.get(pos);
      if (nc) m.nowcast = { ...nc };
      const a = anAt.get(pos);
      if (a) m.anchor = a as NonNullable<MemberV2['anchor']>;
      list.push(m);
    }
    stepMembers.push(list);
  }

  // Variables, column-wise, then per step
  const varAt: Partial<Record<VarIdV2, Array<VarV2 | null>>> = {};
  for (const id of VAR_IDS_V2) {
    const cv = b.vars[id];
    if (!cv) continue;
    const sc = OUTPUT_SCALE[id];
    const dOut = digitsOf(sc);
    const A = undelta(cv.q[0]), B = undelta(cv.q[1]), C = undelta(cv.q[2]), D = cv.q[3], E = undelta(cv.q[4]);
    const back = (x: Col, sign: 1 | -1): Col => x.map((v, i) => (v == null ? null : A[i] == null ? v : (A[i] as number) + sign * v));
    const qRaw = [back(B, -1), A, back(C, 1), back(D, 1), E];
    const dI = cv.d.map((col) => undelta(col));
    const fRaw = undelta(cv.f[0]), fRes = cv.f[1];
    const f = [null, ...cv.f.slice(2).map((col) => decodeCol(undelta(col), 0.001))] as Array<Array<number | null> | null>;
    let mwSrc = cv.mw;
    for (let hop = 0; 'ref' in mwSrc && typeof mwSrc.ref === 'string'; hop++) {
      const target = b.vars[mwSrc.ref as VarIdV2];
      if (!target || hop > VAR_IDS_V2.length) throw new Error(`v2codec: Gewichts-Verweis ${String(mwSrc.ref)} ins Leere`);
      mwSrc = target.mw;
    }
    const mw = new Map(Object.entries(mwSrc as Record<string, Col>).map(([t, col]) => [Number(t), decodeCol(undelta(col), 0.001)]));
    const mv = new Map(Object.entries(cv.mv).map(([t, col]) => [Number(t), undelta(col)]));
    const mx = new Map(cv.mx.map(([si, t, k3]) => [`${si}:${t}`, fromInt(k3, 3)]));
    const special = new Map(cv.dn.map(([si, j, v]) => [si * 4 + j, v === 1 ? Infinity : v === -1 ? -Infinity : NaN]));
    const out: Array<VarV2 | null> = [];
    for (let i = 0; i < n; i++) {
      const code = cv.c[i];
      if (code === 0) { out.push(null); continue; }
      const x = code - 1;
      const sk = x % 8, dk = Math.floor(x / 8) % 8, cm = Math.floor(x / 64);
      let dist: Dist | null = null;
      let qv: Array<number | null>;
      if (dk > 0) {
        dist = distFrom(DIST_KINDS[dk] as DistKind, id, [dI[0][i], dI[1][i], dI[2][i], dI[3][i]], (j) => special.get(i * 4 + j));
        const reading = readingOf(dist, sc).map((x) => (x == null ? null : toInt(x, dOut)));
        qv = cv.r.map((col, j) => (col[i] == null ? null : fromInt((reading[j] as number) + (col[i] as number), dOut)));
      } else qv = qRaw.map((col) => (col[i] == null ? null : fromInt(col[i] as number, dOut)));
      let confidence: ConfidenceV2 | null = null;
      if (cm & 1) {
        const spread = cm & 2 ? (f[1] as Col)[i] : null, agree = cm & 4 ? (f[2] as Col)[i] : null, lage = cm & 8 ? (f[3] as Col)[i] : null;
        let score: number | null = null;
        if (!(cm & 16)) {
          const pred = scoreOf(spread, agree, lage);
          score = fRes[i] != null && pred != null ? fromInt(pred + (fRes[i] as number), 3) : fRaw[i] == null ? null : fromInt(fRaw[i] as number, 3);
        }
        confidence = { score: score as number, spread, agree, lage };
      }
      const set = b.tables.memberSets[cv.ms[i]];
      if (!set) throw new Error('v2codec: Member-Satz außerhalb der Tabelle');
      const members: VarMemberV2[] = set.map((t) => {
        const kv = mv.get(t)?.[i] ?? null;
        const off = mx.get(`${i}:${t}`);
        return { tag: b.tables.tags[t], weight: mw.get(t)?.[i] ?? null, value: off !== undefined ? off : kv == null ? null : fromInt(kv, dOut) };
      });
      out.push({
        p10: qv[0], p50: qv[1], p90: qv[2], mean: qv[3], sigma: qv[4], dist,
        sigmaKind: b.tables.sigmaKinds[sk] as VarV2['sigmaKind'], confidence, members, calib: [...b.tables.calibSets[cv.k[i]]],
      });
    }
    varAt[id] = out;
  }

  const steps: StepV2[] = [];
  let t = ax.t0;
  for (let i = 0; i < n; i++) {
    t += ax.dt[i];
    const vars = {} as Record<VarIdV2, VarV2 | null>;
    for (const id of VAR_IDS_V2) vars[id] = varAt[id]?.[i] ?? null;
    steps.push({
      validAtMs: t, leadH: ax.leadH[i], tier: b.tables.tiers[ax.tier[i]] as StepV2['tier'], interpolated: ax.interp[i] === 1,
      members: stepMembers[i], vars, flags: [...b.tables.flagSets[ax.flags[i]]] as StepV2['flags'],
    });
  }
  let nt = 0;
  const native = ax.native.map((d, i) => (i === 0 ? (nt = d) : (nt += d)));
  const { calibLegend, units, ...provRest } = b.provenance;
  return {
    schema: 2,
    point: b.point,
    axis: {
      steps, native,
      interpolated: ax.interpolated ?? steps.filter((s) => s.interpolated).map((s) => s.validAtMs),
      seams: [...ax.seams], gaps: ax.gaps, usableToMs: ax.usableToMs,
    },
    provenance: { ...provRest, calibLegend: textOf(calibLegend), units: textOf(units) as PointForecastV2['provenance']['units'] },
    timing: b.timing,
  };
}

// ---------------------------------------------------------------------------
// Comparison (for the verifier and for AP9): exact everywhere, distribution parameters within half a step
// ---------------------------------------------------------------------------

export interface V2Diff { exact: string[]; distMaxHalfSteps: number; distCompared: number; anchorMaxHalfSteps: number; anchorCompared: number }

/**
 * Compares two forecasts field by field (object keys unordered, arrays ordered). Everything must be identical except
 * the parameters of `vars[*].dist` and the numbers of `members[*].anchor`, which may differ by up to half of their
 * codec step — `distMaxHalfSteps` reports
 * the largest deviation in units of half a step (≤ 1 = within the promise); the same for the anchor record's numbers.
 */
export function compareV2(a: PointForecastV2, b: PointForecastV2, limit = 20): V2Diff {
  const exact: string[] = [];
  let distMax = 0, distCompared = 0, anchorMax = 0, anchorCompared = 0;
  const walk = (x: unknown, y: unknown, path: string, varId: VarIdV2 | null): void => {
    if (exact.length >= limit) return;
    if (path.endsWith('.dist') && x && y && varId) {
      const dx = x as Record<string, unknown>, dy = y as Record<string, unknown>;
      if (dx.kind !== dy.kind) { exact.push(`${path}.kind ${String(dx.kind)} ≠ ${String(dy.kind)}`); return; }
      const layout = DIST_LAYOUT[dx.kind as DistKind];
      const keys = new Set([...Object.keys(dx), ...Object.keys(dy)]);
      for (const key of keys) {
        if (key === 'kind') continue;
        const spec = layout?.find(([name]) => name === key);
        if (!spec) { exact.push(`${path}.${key} nicht im Layout`); continue; }
        const vx = dx[key] as number, vy = dy[key] as number;
        const half = paramStep(varId, spec[1]) / 2;
        const dev = Math.abs(vx - vy);
        distCompared++;
        if (!(dev <= half * (1 + 1e-9) + 1e-12)) exact.push(`${path}.${key} ${vx} ↔ ${vy} (> ½ Schritt)`);
        distMax = Math.max(distMax, dev / half);
      }
      return;
    }
    if (x === y) return;
    if (typeof x === 'number' && typeof y === 'number' && Number.isNaN(x) && Number.isNaN(y)) return;
    const anchorField = /\.anchor\.(\w+)$/.exec(path)?.[1];
    if (anchorField && (ANCHOR_NUM_FIELDS as readonly string[]).includes(anchorField) && typeof x === 'number' && typeof y === 'number') {
      const half = ANCHOR_STEP / 2, dev = Math.abs(x - y);
      anchorCompared++;
      if (!(dev <= half * (1 + 1e-9) + 1e-12)) exact.push(`${path} ${x} ↔ ${y} (> ½ Schritt)`);
      anchorMax = Math.max(anchorMax, dev / half);
      return;
    }
    if (x == null || y == null || typeof x !== 'object' || typeof y !== 'object') { exact.push(`${path}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`); return; }
    if (Array.isArray(x) !== Array.isArray(y)) { exact.push(`${path}: Array ≠ Objekt`); return; }
    if (Array.isArray(x)) {
      const ya = y as unknown[];
      if (x.length !== ya.length) { exact.push(`${path}: Länge ${x.length} ≠ ${ya.length}`); return; }
      x.forEach((e, i) => walk(e, ya[i], `${path}[${i}]`, varId));
      return;
    }
    const ox = x as Record<string, unknown>, oy = y as Record<string, unknown>;
    const kx = Object.keys(ox).filter((kk) => ox[kk] !== undefined), ky = Object.keys(oy).filter((kk) => oy[kk] !== undefined);
    if (kx.length !== ky.length || kx.some((kk) => !(kk in oy))) { exact.push(`${path}: Schlüssel ${kx.sort().join(',')} ≠ ${ky.sort().join(',')}`); return; }
    for (const kk of kx) walk(ox[kk], oy[kk], `${path}.${kk}`, path.endsWith('.vars') ? (kk as VarIdV2) : varId);
  };
  walk(a, b, 'v2', null);
  return { exact, distMaxHalfSteps: distMax, distCompared, anchorMaxHalfSteps: anchorMax, anchorCompared };
}
