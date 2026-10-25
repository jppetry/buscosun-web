/**
 * AW-7.2 — Contract of the HAZARDS per motorway segment of Autobahnwetter (`buscosun-data/road/v1/hz/<slot>.json`):
 * ONE file for the derive (`scripts/road/road-hazards.mjs`, child process of the radar mirror), the client
 * (`src/road/RoadHazard*.tsx`) and the verifier (`verify:road-hazards`). Specification: `audit/autobahnwetter-gefahren.md`
 * (catalogue, rules, four locks, E-AW-32…37); diagnosis and rulings: `audit/autobahnwetter.md` §19.
 *
 * Six principles (gefahren §Ziel): every level is a rule over named inputs; level and evidence are separate (`m` measured,
 * `d` derived from measurements, `p` forecast — the future is never `m`); a missing mandatory input is `null` (unknown),
 * never 0 (D-04); site features never trigger a level alone; what nobody measures is said so; no warning language.
 * E-AW-34: every level with evidence `p` is capped at 2 until Gate F (road-dependent Glätte: until Gate D).
 *
 * Every `set` threshold below is a named constant with its origin. Importfree apart from the road contracts and the sun
 * (no `src/pointForecast`, V-AW-35); runs unchanged in Node and in the browser.
 */
import type { RoadSegment } from './roadSegments';
import { stretchBearings } from './roadSegments';
import { sunPosition, sunInEyes } from './roadSun';

// --- Files, timing -------------------------------------------------------------------------------

export const ROAD_HZ_DIR = 'hz';
export const roadHzPath = (stamp: string) => `${ROAD_HZ_DIR}/${stamp}.json`;
export const ROAD_HZ_SCHEMA = 1;
export const ROAD_HZ_PRODUCT = 'road-hz';
/** now, +1 … +6 h. */
export const ROAD_HZ_HOURS = 7;
/** Client freshness: like the measurements (> 45 min grey, > 3 h "Gefahrenlage derzeit nicht verfügbar"). */
export const ROAD_HZ_STALE_MS = 45 * 60_000;
export const ROAD_HZ_DEAD_MS = 3 * 3_600_000;
/** Maximum age of the inputs (gefahren §Validierung): obs ≤ 45 min, RV and KONRAD3D ≤ 15 min, `road/fc` run ≤ 3 h; the
 *  ICON-D2 map products of `runs/` (thunder, LPI, CAPE, fresh snow) ≤ 6 h (`set`: ICON-D2 runs every 3 h, repack ≈ 1 h later). */
export const ROAD_HZ_INPUT_AGE_MS = Object.freeze({ obs: 45 * 60_000, radar: 15 * 60_000, konrad: 15 * 60_000, fc: 3 * 3_600_000, runs: 6 * 3_600_000 });
/** E-AW-34: forecast levels are capped at 2 until Gate F. */
export const ROAD_HZ_CAP_P = 2;
/** A segment counts as measured when a GMA with a valid road value lies inside it or within this reach (km). */
export const ROAD_HZ_GMA_REACH_KM = 10;
/** Site features lower the Tf threshold of Stufe 1 of `reif`/`nass` by this (K): bridges and shaded stretches cool first. */
export const ROAD_HZ_FEATURE_TF_K = 1;
/** Shaded stretch: forest share in the 50-m band at least this, or a cutting share at least this (`set`). */
export const ROAD_HZ_SHADE = Object.freeze({ forest: 0.3, cutting: 0.2 });
/** `quer`: on bridges, embankments and forest clearings the thresholds are lower by this (km/h, gefahren). */
export const ROAD_HZ_QUER_FEATURE_KMH = 10;
/** Statistical observe-mode gates (gefahren §Validierung): share of segments with a level, jump against the slot before. */
export const ROAD_HZ_OBSERVE = Object.freeze({ maxShareWithLevel: 0.6, maxJumpFactor: 3 });
/** Season of `frost1`: first frost since 1 August (gefahren). */
export const ROAD_HZ_SEASON_START = Object.freeze({ month: 8, day: 1 });

// --- Catalogue -----------------------------------------------------------------------------------

export type RoadHazardId = 'reif' | 'nass' | 'glatteis' | 'schnee' | 'aqua' | 'nebel' | 'gischt' | 'sonne' | 'quer' | 'baum' | 'staub'
  | 'gewitter' | 'hagel' | 'blowup' | 'frost1' | 'sturz';
export type RoadHazardGroup = 'glaette' | 'aqua' | 'sicht' | 'wind' | 'gewitter' | 'hitze' | 'wechsel';
export type RoadLevel = 0 | 1 | 2 | 3;
export type RoadEvidence = 'm' | 'd' | 'p';

export interface RoadHazardDef {
  id: RoadHazardId;
  group: RoadHazardGroup;
  label: string;
  /** Highest level the rule can reach (`gischt`, `sonne`, `baum` never 3; `staub` 1). */
  max: RoadLevel;
  /** Needs a road measurement for `m`/`d` at hour 0 — a measurement gap makes it unknown now (gefahren §Messlücke). */
  roadDependent: boolean;
  /** E-AW-36: computed, counted in the balance, never in the rail. */
  observeOnly?: true;
  /** Evaluated per driving direction (`sonne`). */
  perDirection?: true;
}

export const ROAD_HAZARD_GROUPS: ReadonlyArray<{ id: RoadHazardGroup; label: string }> = Object.freeze([
  { id: 'glaette', label: 'Glätte' }, { id: 'aqua', label: 'Aquaplaning' }, { id: 'sicht', label: 'Sicht' }, { id: 'wind', label: 'Wind' },
  { id: 'gewitter', label: 'Gewitter, Hagel' }, { id: 'hitze', label: 'Hitze' }, { id: 'wechsel', label: 'Wetterwechsel' },
]);

/** Fixed order = rank within a group (gefahren §Lage). */
export const ROAD_HAZARDS: ReadonlyArray<RoadHazardDef> = Object.freeze([
  { id: 'reif', group: 'glaette', label: 'Reifglätte', max: 3, roadDependent: true },
  { id: 'nass', group: 'glaette', label: 'Überfrierende Nässe', max: 3, roadDependent: true },
  { id: 'glatteis', group: 'glaette', label: 'Gefrierender Regen', max: 3, roadDependent: false },
  { id: 'schnee', group: 'glaette', label: 'Schneeglätte', max: 3, roadDependent: false },
  { id: 'aqua', group: 'aqua', label: 'Aquaplaning', max: 3, roadDependent: true },
  { id: 'nebel', group: 'sicht', label: 'Nebel', max: 3, roadDependent: false },
  { id: 'gischt', group: 'sicht', label: 'Gischt', max: 2, roadDependent: true },
  { id: 'sonne', group: 'sicht', label: 'Tiefstehende Sonne', max: 2, roadDependent: false, perDirection: true },
  { id: 'quer', group: 'wind', label: 'Seitenwind, Sturmböen', max: 3, roadDependent: false },
  { id: 'baum', group: 'wind', label: 'Bäume, umherfliegende Teile', max: 2, roadDependent: false },
  { id: 'staub', group: 'wind', label: 'Staub, Sand', max: 1, roadDependent: false, observeOnly: true },
  { id: 'gewitter', group: 'gewitter', label: 'Gewitter', max: 3, roadDependent: false },
  { id: 'hagel', group: 'gewitter', label: 'Hagel', max: 3, roadDependent: false },
  { id: 'blowup', group: 'hitze', label: 'Aufwölbung Betonplatten', max: 3, roadDependent: false },
  { id: 'frost1', group: 'wechsel', label: 'Erster Frost', max: 2, roadDependent: false },
  { id: 'sturz', group: 'wechsel', label: 'Temperatursturz', max: 3, roadDependent: false },
]);
export const ROAD_HAZARD_BY_ID: Readonly<Record<RoadHazardId, RoadHazardDef>> = Object.freeze(Object.fromEntries(ROAD_HAZARDS.map((h) => [h.id, h])) as Record<RoadHazardId, RoadHazardDef>);
export const ROAD_HAZARD_IDS: readonly RoadHazardId[] = Object.freeze(ROAD_HAZARDS.map((h) => h.id));
export const ROAD_HAZARD_RANK: Readonly<Record<RoadHazardId, number>> = Object.freeze(Object.fromEntries(ROAD_HAZARDS.map((h, i) => [h.id, i])) as Record<RoadHazardId, number>);

export const ROAD_LEVEL_LABEL: Readonly<Record<RoadLevel, string>> = Object.freeze({ 0: 'keine Stufe', 1: 'Stufe 1 · Anzeichen', 2: 'Stufe 2 · Bedingungen erfüllt', 3: 'Stufe 3 · ausgeprägt' });
export const ROAD_EVIDENCE_LABEL: Readonly<Record<RoadEvidence, string>> = Object.freeze({ m: 'gemessen', d: 'aus Messwerten abgeleitet', p: 'Prognose' });
export const ROAD_HZ_CAP_TEXT = 'Prognose-Stufen in Erprobung, höchstens Stufe 2 (E-AW-34)';
export const ROAD_HZ_NO_LEVEL_TEXT = 'Keine Abschnitte erkannt. Das ist keine Entwarnung.';

// --- Thresholds (`set`: reasoned start values from `audit/autobahnwetter-gefahren.md`, observe mode until Gate E/F) --

export const ROAD_HZ_T = Object.freeze({
  /** Reifglätte: Tf ≤ +1 °C and Tf − Td ≤ 1 K (L1); Tf ≤ 0 and Tf < Td (L2); code Reif/Eis, or L2 for ≥ 2 slots at rF ≥ 90 % (L3). */
  reif: Object.freeze({ l1Tf: 1, l1Spread: 1, l2Tf: 0, l3Rh: 90, l3Slots: 2 }),
  /** Überfrierende Nässe: Tf ≤ +2 °C, wet, trend ≤ −0,5 K/h (L1); Tf ≤ +1 and wet (L2); code Eis/Glätte, or Tf ≤ 0 at film ≥ 0,05 mm (L3). */
  nass: Object.freeze({ l1Tf: 2, l1TrendKh: -0.5, l2Tf: 1, l3Tf: 0, l3FilmMm: 0.05 }),
  /** Gefrierender Regen: precip ≥ 0,1 mm/h, T2m ≤ +1, T850 ≥ +1 (L1); liquid precipitation at Tf ≤ 0, or forecast T2m ≤ 0 and ≥ 0,5 mm/h (L2); bit 3 or code Eis with liquid precipitation (L3). */
  glatteis: Object.freeze({ rr: 0.1, t2m: 1, t850: 1, l2Tf: 0, l2T2m: 0, l2Rr: 0.5 }),
  /** Schneeglätte: snow line ≤ segment height + 200 m at precip ≥ 0,1 mm/h (L1); snowfall measured at Tf ≤ +1, or fresh snow ≥ 1 cm/h (L2); code Schnee, or ≥ 5 cm in 6 h at T2m ≤ 0 (L3). */
  schnee: Object.freeze({ snowlineMarginM: 200, rr: 0.1, l2Tf: 1, l2FreshCmH: 1, l3Fresh6hCm: 5, l3T2m: 0 }),
  /** Aquaplaning: water film ≥ 0,5 / 1,0 / 2,0 mm or rain rate ≥ 5 / 15 / 25 mm/h. */
  aqua: Object.freeze({ filmMm: [0.5, 1.0, 2.0] as const, rateMmH: [5, 15, 25] as const }),
  /** Nebel: visibility < 300 / 150 / 50 m without precipitation at rF ≥ 95 %; forecast: MOSMIX vis < 1 000 m (station ≤ 20 km) or T2m − Td2m ≤ 1 K at wind < 3 m/s. */
  nebel: Object.freeze({ visM: [300, 150, 50] as const, rh: 95, mosVisM: 1000, mosKm: 20, spreadK: 1, windMs: 3 }),
  /** Gischt: film ≥ 0,2 mm or ≥ 2 mm/h (L1); ≥ 0,5 mm or ≥ 5 mm/h (L2); never 3 — traffic is unknown. */
  gischt: Object.freeze({ filmMm: [0.2, 0.5] as const, rateMmH: [2, 5] as const }),
  /** Tiefstehende Sonne: elevation 0–15°, ≤ 25° beside the heading, clouds ≤ 50 % (L1); plus wet road (L2). Forecast hours: rain in the hour counts as wet. */
  sonne: Object.freeze({ elevMaxDeg: 15, offAxisDeg: 25, clctMax: 50, wetRrMmH: 0.1, wetPp: 50 }),
  /** Seitenwind: cross component c = gust · |sin(dir − axis)| ≥ 45 / 60 / 75 km/h, or gust ≥ 90 (L2) / 100 (L3) from any direction. */
  quer: Object.freeze({ crossKmh: [45, 60, 75] as const, gustKmh: [Infinity, 90, 100] as const }),
  /** Bäume: gust ≥ 75 km/h with forest ≥ 30 % in the 50-m band (L1); gust ≥ 90 (L2); never 3. */
  baum: Object.freeze({ gustKmh: [75, 90] as const, forest: 0.3 }),
  /** Staub (observe only, E-AW-36): gust ≥ 55 km/h, cropland ≥ 50 % in the 1-km band, 72 h without precipitation. */
  staub: Object.freeze({ gustKmh: 55, crop: 0.5, dryH: 72 }),
  /** Gewitter: thunder potential ≥ 40 or LPI ≥ 1 J/kg (L1); KONRAD3D cell ≤ 20 km with track crossing within 60 min (L2); cell over the segment or RV rate ≥ 25 mm/h (L3). */
  gewitter: Object.freeze({ thunder: 40, lpi: 1, cellKm: 20, crossMin: 60, rateMmH: 25 }),
  /** Hagel: thunder ≥ 60 and CAPE ≥ 1 000 J/kg (L1); KONRAD3D cell with hail flag ≤ 20 km (L2); solid precipitation measured at air ≥ +5 °C (L3). */
  hagel: Object.freeze({ thunder: 60, capeJkg: 1000, cellKm: 20, airC: 5 }),
  /** Aufwölbung: only with concrete surface (OSM share ≥ 20 %): Tmax ≥ 30 °C today (L1); second day in a row (L2); ≥ 3 days or Tf measured ≥ 50 °C (L3). */
  blowup: Object.freeze({ concrete: 0.2, tmaxC: 30, l2Days: 2, l3Days: 3, rsC: 50 }),
  /** Erster Frost: road ≤ 0 °C measured (L2) or air ≤ 0 °C forecast (L1), the first time since 1 August (`ROAD_HZ_SEASON_START`). */
  frost1: Object.freeze({ tfC: 0, t2mC: 0 }),
  /** Temperatursturz: ΔT2m ≤ −8 K within 6 h (window −3 … +6 h) (L1); with zero crossing (L2); ≤ −12 K with zero crossing on a wet road (L3). */
  sturz: Object.freeze({ dropK: -8, dropL3K: -12, windowH: 6, backH: 3, maxRateKh: 10 }),
});

/** Precipitation type flags 0 20 021 (bit n = 2^(30−n)): 1 unknown, 2 liquid, 3 liquid freezing, 4 drizzle, 5 rain, 6 solid, 7 snow. */
export const precipBit = (pt: number | null | undefined, bit: number): boolean => pt != null && Math.floor(pt / 2 ** (30 - bit)) % 2 === 1;
export const precipLiquid = (pt: number | null | undefined) => precipBit(pt, 2) || precipBit(pt, 4) || precipBit(pt, 5);
export const precipFreezing = (pt: number | null | undefined) => precipBit(pt, 3);
export const precipSolid = (pt: number | null | undefined) => precipBit(pt, 6);
export const precipSnow = (pt: number | null | undefined) => precipBit(pt, 7);

/** Condition codes (`ROAD_CONDITION_LABEL`): 0 trocken, 1 feucht, 2 nass, 3 Reif, 4 Schnee, 5 Eis, 6 Glätte, 7 nicht trocken. */
export const COND = Object.freeze({ dry: 0, damp: 1, wet: 2, frost: 3, snow: 4, ice: 5, slippery: 6, notDry: 7 });
export const condWet = (c: number | null | undefined) => c === COND.damp || c === COND.wet || c === COND.notDry;

// --- Inputs (assembled by the derive, consumed by `evaluateSegment`; the verifier builds them from fixtures) ----------

export interface HzStation {
  id: string;
  name: string;
  /** Measurement time (ms). */
  t: number;
  /** Valid road temperature / air temperature of the slot (`null` = missing or rejected). */
  rs: number | null; ta: number | null; td: number | null; rh: number | null; vis: number | null; wf: number | null;
  cond: number | null; ws: number | null; wg: number | null; wd: number | null; pt: number | null; pr: number | null;
  /** Trend of the road temperature over the last hour (K/h) from the ring; `null` without history. */
  rsTrendKh: number | null;
  /** Air temperature up to 3 h back `[ms, °C]` (ring) — `sturz`. */
  taHist: Array<[number, number]>;
  /** Highest road temperature of the ring (today, UTC) — `blowup` L3. */
  rsMax: number | null;
  /** The road value was rejected by a rule (gap: the sensor must stay visible as a gap, not be filled by the model). */
  roadRejected: boolean;
  /**
   * An observe-mode rule hit this station in the slot (`o`: neighbours, jump, cube, roadAir) or its air value was rejected —
   * the station still shows, but a level is never built on its history alone (`sturz`, `frost1`, `blowup`).
   */
  suspect: boolean;
  /** Inside the segment (true) or within reach before/after it (false). */
  inside: boolean;
  /**
   * V-AW-67: the water film is reported in whole millimetres (`wfr` of the obs point, DWD template of 2015) — a film
   * of "2 mm" may be 1.5 mm; `aqua` never builds Stufe 3 on it. Absent = 0.1 mm resolution.
   */
  wfCoarse?: boolean;
}

export interface HzHour {
  t2m: number | null; td2m: number | null; rr: number | null; pp: number | null; sn: number | null;
  ff: number | null; fx: number | null; dd: number | null; n: number | null;
  /** Additive quantities of AW-7.1 (`sl`, `t85`, `vs`) and the `runs/` products (`th`, `lpi`, `cape`, `ns`); `null` = not carried. */
  sl: number | null; t85: number | null; vis: number | null; th: number | null; lpi: number | null; cape: number | null; ns: number | null;
}

export interface HzPoint {
  id: string;
  lat: number; lon: number;
  /** Terrain height (m). */
  h: number | null;
  /** MOSMIX station of the point within `nebel.mosKm` — `vis` counts only then. */
  mosKm: number | null;
  /** One entry per hour of the window (`ROAD_HZ_HOURS`); `null` = no forecast value for that hour. */
  hours: Array<HzHour | null>;
  /** Highest forecast T2m of the calendar day (UTC) of the slot — `blowup`. */
  tmaxToday: number | null;
}

export interface HzRadar {
  /** Highest RV rate (mm/h) over the support points: the analysis, and the nowcast frames of hour +1 and +2. */
  rateNow: number | null;
  rateH1: number | null;
  rateH2: number | null;
}

export interface HzCell {
  id: number;
  /** Distance of the cell centre to the nearest support point (km). */
  distKm: number;
  /** The cell (hull) covers a support point now. */
  over: boolean;
  /** Minutes until the forecast track comes within `gewitter.cellKm`-reach of the segment; `null` = never within 120 min. */
  crossMin: number | null;
  hail: boolean;
}

export interface HzSegState {
  /** Consecutive slots at Stufe ≥ 2 per hazard (reif L3 rule). */
  lv2Since?: Partial<Record<RoadHazardId, number>>;
  /** First frost of the season (ISO, UTC): forecast and measured. */
  frostFcAt?: string | null;
  frostObsAt?: string | null;
  /** Calendar days (UTC `YYYY-MM-DD`) in a row with Tmax ≥ 30 °C, newest last. */
  hotDays?: string[];
  /** Hours without measured precipitation at the stations of the segment (`staub`). */
  dryH?: number;
}

export interface HzSegmentInput {
  seg: RoadSegment;
  slotMs: number;
  /** `ROAD_HZ_HOURS` instants (ms): the slot and the full hours +1 … +6. */
  hours: number[];
  stations: HzStation[];
  points: HzPoint[];
  radar: HzRadar | null;
  cells: HzCell[] | null;
  state: HzSegState | null;
  /** Inputs that are missing or too old for this slot (`obs`, `radar`, `konrad`, `fc`, `runs`). */
  missing: ReadonlySet<string>;
}

export type HzLevels = Array<RoadLevel | null>;
export interface HzEntry {
  lv: Partial<Record<RoadHazardId, HzLevels>>;
  /** Evidence per hour as one string of `ROAD_HZ_HOURS` characters (`m`/`d`/`p`; `-` where the level is 0 or unknown). */
  ev: Partial<Record<RoadHazardId, string>>;
  why: Partial<Record<RoadHazardId, string[]>>;
  /** Direction-dependent hazards: 0 = increasing km, 1 = decreasing km. */
  dir?: Partial<Record<RoadHazardId, 0 | 1>>;
  /** E-AW-36: observe-only results, never shown. */
  ob?: Partial<Record<RoadHazardId, HzLevels>>;
}

export interface HzSegResult {
  entry: HzEntry | null;
  state: HzSegState;
  /** Entries dropped by the entry lock, with the reason (balance). */
  dropped: string[];
}

// --- Helpers -------------------------------------------------------------------------------------

type Cand = { lv: RoadLevel; ev: RoadEvidence; why: string[] } | null;
const EV_RANK: Record<RoadEvidence, number> = { m: 3, d: 2, p: 1 };
/** Highest level wins; on a tie measured before derived before forecast. */
function best(cands: Cand[]): Cand {
  let b: Cand = null;
  for (const c of cands) if (c && (!b || c.lv > b.lv || (c.lv === b.lv && EV_RANK[c.ev] > EV_RANK[b.ev]))) b = c;
  return b;
}
const w = (key: string, value: number | string | null | undefined, src: string) => `${key}:${value == null ? '—' : typeof value === 'number' ? Math.round(value * 100) / 100 : value}@${src}`;
const kmh = (ms: number | null) => (ms == null ? null : ms * 3.6);
const capP = (c: NonNullable<Cand>): NonNullable<Cand> => (c.ev === 'p' && c.lv > ROAD_HZ_CAP_P ? { ...c, lv: ROAD_HZ_CAP_P as RoadLevel } : c);
const maxOf = (xs: Array<number | null | undefined>): number | null => { let m: number | null = null; for (const x of xs) if (x != null && (m == null || x > m)) m = x; return m; };
const minOf = (xs: Array<number | null | undefined>): number | null => { let m: number | null = null; for (const x of xs) if (x != null && (m == null || x < m)) m = x; return m; };
export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** The segment is shaded (forest or cutting) or carries a bridge: Stufe-1 thresholds of `reif`/`nass` rise by 1 K. */
export const segShadedOrBridged = (seg: RoadSegment) => (seg.f.forest ?? 0) >= ROAD_HZ_SHADE.forest || (seg.f.cutting ?? 0) >= ROAD_HZ_SHADE.cutting || seg.f.bridges.length > 0;
/** `quer`: the thresholds drop by 10 km/h on bridges, embankments and forest clearings (forest ≥ 30 % — a gap in it is a clearing). */
export const segWindExposed = (seg: RoadSegment) => seg.f.bridges.length > 0 || (seg.f.embankment ?? 0) > 0.05 || (seg.f.forest ?? 0) >= ROAD_HZ_SHADE.forest;

/** The segment has a valid road measurement now (inside or within reach). */
export const hasValidGma = (st: readonly HzStation[]) => st.some((s) => s.rs != null);
/** Measurement gap (gefahren §Messlücke): a GMA of the segment is rejected and no valid one is in reach. */
export const measurementGap = (st: readonly HzStation[]) => st.some((s) => s.inside && s.roadRejected) && !hasValidGma(st);

// --- The rules: hour 0 from the stations (m/d) and the points (p), hours 1…6 from the points (p) --------------------

function hourVals(points: readonly HzPoint[], i: number): HzHour[] { return points.map((p) => p.hours[i]).filter((h): h is HzHour => !!h); }

function reifNow(seg: RoadSegment, st: readonly HzStation[]): Cand {
  const l1Tf = ROAD_HZ_T.reif.l1Tf + (segShadedOrBridged(seg) ? ROAD_HZ_FEATURE_TF_K : 0);
  return best(st.map((s): Cand => {
    if (s.rs == null) return null;
    if (s.cond === COND.frost || s.cond === COND.ice) return { lv: 3, ev: 'm', why: [w('code', s.cond === COND.frost ? 'Reif' : 'Eis', s.id), w('Tf', s.rs, s.id), ...(s.td != null ? [w('Td', s.td, s.id)] : []), ...(s.rh != null ? [w('rF', s.rh, s.id)] : [])] };
    if (s.td != null && s.rs <= ROAD_HZ_T.reif.l2Tf && s.rs < s.td) return { lv: 2, ev: 'd', why: [w('Tf', s.rs, s.id), w('Td', s.td, s.id), ...(s.rh != null ? [w('rF', s.rh, s.id)] : [])] };
    if (s.td != null && s.rs <= l1Tf && s.rs - s.td <= ROAD_HZ_T.reif.l1Spread) return { lv: 1, ev: 'd', why: [w('Tf', s.rs, s.id), w('Td', s.td, s.id), ...(l1Tf !== ROAD_HZ_T.reif.l1Tf ? ['feature:bridge/shade'] : [])] };
    return { lv: 0, ev: 'd', why: [] };
  }));
}
/** Forecast proxy of `reif` (gefahren): T2m ≤ +1, T2m − Td2m ≤ 1 K, clouds ≤ 30 %, wind < 3 m/s ⇒ Stufe 1. */
function reifProxy(hs: readonly HzHour[], src: string): Cand {
  for (const h of hs) if (h.t2m != null && h.td2m != null && h.t2m <= ROAD_HZ_T.reif.l1Tf && h.t2m - h.td2m <= ROAD_HZ_T.reif.l1Spread && (h.n ?? 100) <= 30 && (h.ff ?? 99) < 3) return { lv: 1, ev: 'p', why: [w('T2m', h.t2m, src), w('Td2m', h.td2m, src), w('clct', h.n, src), w('ff', h.ff, src)] };
  return hs.length ? { lv: 0, ev: 'p', why: [] } : null;
}

function nassNow(seg: RoadSegment, st: readonly HzStation[]): Cand {
  const l1Tf = ROAD_HZ_T.nass.l1Tf + (segShadedOrBridged(seg) ? ROAD_HZ_FEATURE_TF_K : 0);
  return best(st.map((s): Cand => {
    if (s.rs == null) return null;
    const wet = condWet(s.cond) || (s.wf != null && s.wf > 0);
    if (s.cond === COND.ice || s.cond === COND.slippery) return { lv: 3, ev: 'm', why: [w('code', s.cond === COND.ice ? 'Eis' : 'Glätte', s.id), w('Tf', s.rs, s.id)] };
    if (s.rs <= ROAD_HZ_T.nass.l3Tf && s.wf != null && s.wf >= ROAD_HZ_T.nass.l3FilmMm) return { lv: 3, ev: 'd', why: [w('Tf', s.rs, s.id), w('film', s.wf, s.id)] };
    if (s.rs <= ROAD_HZ_T.nass.l2Tf && wet) return { lv: 2, ev: 'd', why: [w('Tf', s.rs, s.id), w('wet', s.cond != null ? `code${s.cond}` : `film${s.wf}`, s.id)] };
    if (s.rs <= l1Tf && wet && s.rsTrendKh != null && s.rsTrendKh <= ROAD_HZ_T.nass.l1TrendKh) return { lv: 1, ev: 'd', why: [w('Tf', s.rs, s.id), w('trend', s.rsTrendKh, s.id), ...(l1Tf !== ROAD_HZ_T.nass.l1Tf ? ['feature:bridge/shade'] : [])] };
    return { lv: 0, ev: 'd', why: [] };
  }));
}
/** Forecast proxy of `nass`: T2m ≤ +1 and (wet now measured, or precipitation ≥ 0,1 mm in the next 3 h) ⇒ Stufe 1. */
function nassProxy(hs: readonly HzHour[], wetNow: boolean, rrNext3: number | null, src: string): Cand {
  for (const h of hs) if (h.t2m != null && h.t2m <= ROAD_HZ_T.nass.l2Tf && (wetNow || (rrNext3 != null && rrNext3 >= 0.1))) return { lv: 1, ev: 'p', why: [w('T2m', h.t2m, src), wetNow ? 'wet:now' : w('rr3h', rrNext3, src)] };
  return hs.length ? { lv: 0, ev: 'p', why: [] } : null;
}

function glatteisNow(st: readonly HzStation[]): Cand {
  return best(st.map((s): Cand => {
    if (s.rs == null) return null;
    if (precipFreezing(s.pt) || (s.cond === COND.ice && precipLiquid(s.pt))) return { lv: 3, ev: 'm', why: [precipFreezing(s.pt) ? w('bit3', 'flüssig gefrierend', s.id) : w('code', 'Eis', s.id), w('Tf', s.rs, s.id)] };
    if (precipLiquid(s.pt) && s.rs <= ROAD_HZ_T.glatteis.l2Tf) return { lv: 2, ev: 'd', why: [w('precip', 'flüssig', s.id), w('Tf', s.rs, s.id)] };
    return { lv: 0, ev: 'd', why: [] };
  }));
}
function glatteisFc(hs: readonly HzHour[], src: string): Cand {
  let out: Cand = hs.length ? { lv: 0, ev: 'p', why: [] } : null;
  for (const h of hs) {
    if (h.rr == null || h.t2m == null) continue;
    if (h.rr >= ROAD_HZ_T.glatteis.l2Rr && h.t2m <= ROAD_HZ_T.glatteis.l2T2m && h.t85 != null && h.t85 >= ROAD_HZ_T.glatteis.t850) out = best([out, { lv: 2, ev: 'p', why: [w('rr', h.rr, src), w('T2m', h.t2m, src), w('T850', h.t85, src)] }]);
    else if (h.rr >= ROAD_HZ_T.glatteis.rr && h.t2m <= ROAD_HZ_T.glatteis.t2m && h.t85 != null && h.t85 >= ROAD_HZ_T.glatteis.t850) out = best([out, { lv: 1, ev: 'p', why: [w('rr', h.rr, src), w('T2m', h.t2m, src), w('T850', h.t85, src)] }]);
  }
  return out;
}

function schneeNow(st: readonly HzStation[]): Cand {
  return best(st.map((s): Cand => {
    if (s.rs == null && s.cond == null) return null;
    if (s.cond === COND.snow) return { lv: 3, ev: 'm', why: [w('code', 'Schnee', s.id), ...(s.rs != null ? [w('Tf', s.rs, s.id)] : [])] };
    if ((precipSnow(s.pt) || precipSolid(s.pt)) && s.rs != null && s.rs <= ROAD_HZ_T.schnee.l2Tf) return { lv: 2, ev: 'd', why: [w('precip', precipSnow(s.pt) ? 'Schnee' : 'fest', s.id), w('Tf', s.rs, s.id)] };
    return { lv: 0, ev: 'd', why: [] };
  }));
}
function schneeFc(points: readonly HzPoint[], i: number, fresh6h: number | null): Cand {
  let out: Cand = null;
  for (const p of points) {
    const h = p.hours[i];
    if (!h) continue;
    out = out ?? { lv: 0, ev: 'p', why: [] };
    if (fresh6h != null && fresh6h >= ROAD_HZ_T.schnee.l3Fresh6hCm && h.t2m != null && h.t2m <= ROAD_HZ_T.schnee.l3T2m) out = best([out, { lv: 3, ev: 'p', why: [w('fresh6h', fresh6h, p.id), w('T2m', h.t2m, p.id)] }]);
    else if (h.ns != null && h.ns >= ROAD_HZ_T.schnee.l2FreshCmH) out = best([out, { lv: 2, ev: 'p', why: [w('fresh', h.ns, p.id)] }]);
    else if (h.sl != null && p.h != null && h.rr != null && h.rr >= ROAD_HZ_T.schnee.rr && h.sl <= p.h + ROAD_HZ_T.schnee.snowlineMarginM) out = best([out, { lv: 1, ev: 'p', why: [w('snowline', h.sl, p.id), w('h', p.h, p.id), w('rr', h.rr, p.id)] }]);
    else if (h.sn != null && h.sn >= 50 && h.rr != null && h.rr >= ROAD_HZ_T.schnee.rr) out = best([out, { lv: 1, ev: 'p', why: [w('snowShare', h.sn, p.id), w('rr', h.rr, p.id)] }]);
  }
  return out;
}

const stepLevel = (x: number | null, th: readonly number[]): RoadLevel => { if (x == null) return 0; let l: RoadLevel = 0; th.forEach((t, k) => { if (x >= t) l = (k + 1) as RoadLevel; }); return l; };

function aquaNow(st: readonly HzStation[], radar: HzRadar | null): Cand {
  const cands: Cand[] = st.map((s): Cand => {
    if (s.rs == null && s.wf == null) return null;
    let lv = stepLevel(s.wf, ROAD_HZ_T.aqua.filmMm);
    const why = s.wf != null ? [w('film', s.wf, s.id)] : [];
    // V-AW-67: whole-millimetre film (template of 2015) carries no Stufe 3 — "2 mm" may be 1.5 mm; the detail names it.
    if (s.wfCoarse && lv === 3) { lv = 2; why.push(w('filmRes', 1, s.id)); }
    return { lv, ev: 'd', why };
  });
  if (radar?.rateNow != null) cands.push({ lv: stepLevel(radar.rateNow, ROAD_HZ_T.aqua.rateMmH), ev: 'd', why: [w('rate', radar.rateNow, 'RV')] });
  return best(cands);
}
function rateFc(hs: readonly HzHour[], th: readonly number[], src: string): Cand {
  const rr = maxOf(hs.map((h) => h.rr));
  return rr == null ? null : { lv: stepLevel(rr, th), ev: 'p', why: rr > 0 ? [w('rr', rr, src)] : [] };
}

function nebelNow(st: readonly HzStation[]): Cand {
  return best(st.map((s): Cand => {
    if (s.vis == null) return null;
    const precip = (s.pr != null && s.pr > 0) || precipLiquid(s.pt) || precipSolid(s.pt) || precipSnow(s.pt);
    if (precip || s.rh == null || s.rh < ROAD_HZ_T.nebel.rh) return { lv: 0, ev: 'd', why: [] };
    const lv: RoadLevel = s.vis < ROAD_HZ_T.nebel.visM[2] ? 3 : s.vis < ROAD_HZ_T.nebel.visM[1] ? 2 : s.vis < ROAD_HZ_T.nebel.visM[0] ? 1 : 0;
    return { lv, ev: 'd', why: lv ? [w('vis', s.vis, s.id), w('rF', s.rh, s.id)] : [] };
  }));
}
function nebelFc(points: readonly HzPoint[], i: number): Cand {
  let out: Cand = null;
  for (const p of points) {
    const h = p.hours[i];
    if (!h) continue;
    out = out ?? { lv: 0, ev: 'p', why: [] };
    if (h.vis != null && p.mosKm != null && p.mosKm <= ROAD_HZ_T.nebel.mosKm && h.vis < ROAD_HZ_T.nebel.mosVisM) out = best([out, { lv: 1, ev: 'p', why: [w('visMOS', h.vis, p.id), w('mosKm', p.mosKm, p.id)] }]);
    else if (h.t2m != null && h.td2m != null && h.t2m - h.td2m <= ROAD_HZ_T.nebel.spreadK && h.ff != null && h.ff < ROAD_HZ_T.nebel.windMs && (h.rr ?? 0) < 0.1) out = best([out, { lv: 1, ev: 'p', why: [w('T2m', h.t2m, p.id), w('Td2m', h.td2m, p.id), w('ff', h.ff, p.id)] }]);
  }
  return out;
}

function gischtNow(st: readonly HzStation[], radar: HzRadar | null): Cand {
  const cands: Cand[] = st.map((s): Cand => (s.rs == null && s.wf == null ? null : { lv: stepLevel(s.wf, ROAD_HZ_T.gischt.filmMm), ev: 'd', why: s.wf != null ? [w('film', s.wf, s.id)] : [] }));
  if (radar?.rateNow != null) cands.push({ lv: stepLevel(radar.rateNow, ROAD_HZ_T.gischt.rateMmH), ev: 'd', why: [w('rate', radar.rateNow, 'RV')] });
  return best(cands);
}

/** `sonne` per hour: for both directions, any 1-km piece with the sun in the driver's eyes; the direction with the sun is reported. */
function sonneAt(seg: RoadSegment, ms: number, p: HzPoint | null, clct: number | null, wet: boolean): { cand: Cand; dir: 0 | 1 } {
  if (!p || clct == null || clct > ROAD_HZ_T.sonne.clctMax) return { cand: p ? { lv: 0, ev: 'p', why: [] } : null, dir: 0 };
  const sun = sunPosition(ms, p.lat, p.lon);
  if (sun.elevationDeg < 0 || sun.elevationDeg > ROAD_HZ_T.sonne.elevMaxDeg) return { cand: { lv: 0, ev: 'p', why: [] }, dir: 0 };
  const bearings = seg.bearings.length ? seg.bearings : stretchBearings([[p.lon, p.lat], [p.lon + 0.01, p.lat]], 0, 1);
  const hit0 = bearings.some((b) => sunInEyes(sun, b, ROAD_HZ_T.sonne.elevMaxDeg, ROAD_HZ_T.sonne.offAxisDeg));
  const hit1 = bearings.some((b) => sunInEyes(sun, (b + 180) % 360, ROAD_HZ_T.sonne.elevMaxDeg, ROAD_HZ_T.sonne.offAxisDeg));
  if (!hit0 && !hit1) return { cand: { lv: 0, ev: 'p', why: [] }, dir: 0 };
  const dir: 0 | 1 = hit0 ? 0 : 1;
  const why = [w('elev', sun.elevationDeg, 'sun'), w('az', sun.azimuthDeg, 'sun'), w('clct', clct, p.id), ...(wet ? ['wet:1'] : [])];
  return { cand: { lv: wet ? 2 : 1, ev: 'p', why }, dir };
}

function crossKmh(gustKmh: number, dirDeg: number, bearings: readonly number[]): number {
  let m = 0;
  for (const b of bearings) m = Math.max(m, gustKmh * Math.abs(Math.sin(((dirDeg - b) * Math.PI) / 180)));
  return m;
}
function querOf(gust: number | null, dir: number | null, seg: RoadSegment, src: string, ev: RoadEvidence): Cand {
  if (gust == null) return null;
  const minus = segWindExposed(seg) ? ROAD_HZ_QUER_FEATURE_KMH : 0;
  const c = dir != null && seg.bearings.length ? crossKmh(gust, dir, seg.bearings) : null;
  let lv: RoadLevel = 0;
  const T = ROAD_HZ_T.quer;
  for (let k = 2; k >= 0; k--) if ((c != null && c >= T.crossKmh[k] - minus) || gust >= T.gustKmh[k] - minus) { lv = (k + 1) as RoadLevel; break; }
  return { lv, ev, why: lv ? [w('gust', gust, src), ...(c != null ? [w('cross', c, src), w('dir', dir, src)] : []), ...(minus ? ['feature:bridge/dam/clearing'] : [])] : [] };
}
function baumOf(gust: number | null, seg: RoadSegment, src: string, ev: RoadEvidence): Cand {
  if (gust == null) return null;
  if ((seg.f.forest ?? 0) < ROAD_HZ_T.baum.forest) return { lv: 0, ev, why: [] };
  const lv: RoadLevel = gust >= ROAD_HZ_T.baum.gustKmh[1] ? 2 : gust >= ROAD_HZ_T.baum.gustKmh[0] ? 1 : 0;
  return { lv, ev, why: lv ? [w('gust', gust, src), w('forest', seg.f.forest, 'seg')] : [] };
}
function staubOf(gust: number | null, seg: RoadSegment, dryH: number | null, src: string, ev: RoadEvidence): Cand {
  if (gust == null) return null;
  const lv: RoadLevel = gust >= ROAD_HZ_T.staub.gustKmh && (seg.f.crop ?? 0) >= ROAD_HZ_T.staub.crop && dryH != null && dryH >= ROAD_HZ_T.staub.dryH ? 1 : 0;
  return { lv, ev, why: lv ? [w('gust', gust, src), w('crop', seg.f.crop, 'seg'), w('dryH', dryH, 'seg')] : [] };
}

function gewitterNow(radar: HzRadar | null, cells: readonly HzCell[] | null, hs: readonly HzHour[]): Cand {
  const cands: Cand[] = [];
  if (cells) {
    const over = cells.find((c) => c.over);
    const near = cells.filter((c) => c.distKm <= ROAD_HZ_T.gewitter.cellKm && c.crossMin != null && c.crossMin <= ROAD_HZ_T.gewitter.crossMin).sort((a, b) => a.distKm - b.distKm)[0];
    if (over) cands.push({ lv: 3, ev: 'd', why: [w('cell', over.id, 'KONRAD3D'), 'over:1'] });
    else if (near) cands.push({ lv: 2, ev: 'd', why: [w('cell', near.id, 'KONRAD3D'), w('distKm', near.distKm, 'KONRAD3D'), w('crossMin', near.crossMin, 'KONRAD3D')] });
    else cands.push({ lv: 0, ev: 'd', why: [] });
  }
  if (radar?.rateNow != null) cands.push({ lv: radar.rateNow >= ROAD_HZ_T.gewitter.rateMmH ? 3 : 0, ev: 'd', why: radar.rateNow >= ROAD_HZ_T.gewitter.rateMmH ? [w('rate', radar.rateNow, 'RV')] : [] });
  cands.push(gewitterFc(hs, 'fc'));
  return best(cands);
}
function gewitterFc(hs: readonly HzHour[], src: string): Cand {
  const th = maxOf(hs.map((h) => h.th)), lpi = maxOf(hs.map((h) => h.lpi));
  if (th == null && lpi == null) return null;
  const lv: RoadLevel = (th != null && th >= ROAD_HZ_T.gewitter.thunder) || (lpi != null && lpi >= ROAD_HZ_T.gewitter.lpi) ? 1 : 0;
  return { lv, ev: 'p', why: lv ? [w('thunder', th, src), w('lpi', lpi, src)] : [] };
}
function gewitterTrack(cells: readonly HzCell[] | null, hourIdx: number): Cand {
  if (!cells) return null;
  const minFrom = (hourIdx - 1) * 60, minTo = hourIdx * 60;
  const hit = cells.find((c) => c.crossMin != null && c.crossMin > minFrom && c.crossMin <= minTo);
  return hit ? { lv: 2, ev: 'p', why: [w('cell', hit.id, 'KONRAD3D'), w('crossMin', hit.crossMin, 'KONRAD3D')] } : { lv: 0, ev: 'p', why: [] };
}
function hagelNow(st: readonly HzStation[], cells: readonly HzCell[] | null, hs: readonly HzHour[]): Cand {
  const cands: Cand[] = st.map((s): Cand => (s.ta == null ? null : precipSolid(s.pt) && !precipSnow(s.pt) && s.ta >= ROAD_HZ_T.hagel.airC ? { lv: 3, ev: 'd', why: [w('precip', 'fest', s.id), w('Luft', s.ta, s.id)] } : { lv: 0, ev: 'd', why: [] }));
  if (cells) {
    const hail = cells.filter((c) => c.hail && c.distKm <= ROAD_HZ_T.hagel.cellKm).sort((a, b) => a.distKm - b.distKm)[0];
    cands.push(hail ? { lv: 2, ev: 'd', why: [w('cell', hail.id, 'KONRAD3D'), 'hail:1', w('distKm', hail.distKm, 'KONRAD3D')] } : { lv: 0, ev: 'd', why: [] });
  }
  cands.push(hagelFc(hs, 'fc'));
  return best(cands);
}
function hagelFc(hs: readonly HzHour[], src: string): Cand {
  const th = maxOf(hs.map((h) => h.th)), cape = maxOf(hs.map((h) => h.cape));
  if (th == null || cape == null) return null;
  const lv: RoadLevel = th >= ROAD_HZ_T.hagel.thunder && cape >= ROAD_HZ_T.hagel.capeJkg ? 1 : 0;
  return { lv, ev: 'p', why: lv ? [w('thunder', th, src), w('cape', cape, src)] : [] };
}

function blowupOf(seg: RoadSegment, st: readonly HzStation[], points: readonly HzPoint[], hotDays: number): Cand | undefined {
  if ((seg.f.concrete ?? 0) < ROAD_HZ_T.blowup.concrete) return undefined;   // no concrete known ⇒ the hazard does not apply, the detail says so
  const rsMax = maxOf(st.filter((s) => !s.suspect).map((s) => s.rsMax));
  if (rsMax != null && rsMax >= ROAD_HZ_T.blowup.rsC) return { lv: 3, ev: 'd', why: [w('TfMax', rsMax, 'GMA'), w('concrete', seg.f.concrete, 'seg')] };
  const tmax = maxOf(points.map((p) => p.tmaxToday));
  // V-AW-63: a suspect station (observe hit, air rejected) never builds a level on its history — like `rsMax` above
  // (N443 Irxleben, 16.10.2026: +41 °C under `cube(o)` made "Hitze" on two concrete segments for three hours).
  const taMax = maxOf(st.filter((s) => !s.suspect).flatMap((s) => s.taHist.map((x) => x[1])));
  const hot = (tmax != null && tmax >= ROAD_HZ_T.blowup.tmaxC) || (taMax != null && taMax >= ROAD_HZ_T.blowup.tmaxC);
  if (!hot) return { lv: 0, ev: 'p', why: [] };
  const days = hotDays + 1;
  const lv: RoadLevel = days >= ROAD_HZ_T.blowup.l3Days ? 3 : days >= ROAD_HZ_T.blowup.l2Days ? 2 : 1;
  const ev: RoadEvidence = taMax != null && taMax >= ROAD_HZ_T.blowup.tmaxC ? 'd' : 'p';
  return { lv, ev, why: [w('Tmax', tmax ?? taMax, ev === 'd' ? 'GMA' : 'fc'), w('days', days, 'state'), w('concrete', seg.f.concrete, 'seg')] };
}

function sturzOf(st: readonly HzStation[], points: readonly HzPoint[], hours: readonly number[], slotMs: number): Cand {
  // Series: measured air up to 3 h back, then the forecast T2m of the window; the drop = min over any 6-h span of (later − earlier).
  const series: Array<[number, number, 'd' | 'p', string]> = [];
  for (const s of st) {
    if (s.suspect) continue;
    // A sensor that cools faster than any weather can (`maxRateKh`) is a fault — its history counts for nothing here.
    const hist = s.taHist.filter(([ms]) => slotMs - ms <= ROAD_HZ_T.sturz.backH * 3_600_000).sort((a, b) => a[0] - b[0]);
    let faulty = false;
    for (let i = 1; i < hist.length; i++) if (Math.abs(hist[i][1] - hist[i - 1][1]) / ((hist[i][0] - hist[i - 1][0]) / 3_600_000) > ROAD_HZ_T.sturz.maxRateKh) faulty = true;
    if (!faulty) for (const [ms, ta] of hist) series.push([ms, ta, 'd', s.id]);
  }
  for (const p of points) p.hours.forEach((h, i) => { if (h?.t2m != null) series.push([hours[i], h.t2m, 'p', p.id]); });
  if (series.length < 2) return null;
  series.sort((a, b) => a[0] - b[0]);
  let worst: { drop: number; a: typeof series[number]; b: typeof series[number] } | null = null;
  for (let i = 0; i < series.length; i++) for (let j = i + 1; j < series.length; j++) {
    if (series[j][0] - series[i][0] > ROAD_HZ_T.sturz.windowH * 3_600_000) break;
    // Measured pairs only within one station, forecast pairs only within one point — never a drop between two places.
    if (series[i][3] !== series[j][3] && series[i][2] === series[j][2]) continue;
    const drop = series[j][1] - series[i][1];
    if (!worst || drop < worst.drop) worst = { drop, a: series[i], b: series[j] };
  }
  if (!worst || worst.drop > ROAD_HZ_T.sturz.dropK) return { lv: 0, ev: 'p', why: [] };
  const zero = worst.a[1] > 0 && worst.b[1] <= 0;
  const wet = st.some((s) => condWet(s.cond) || (s.wf != null && s.wf > 0));
  const lv: RoadLevel = worst.drop <= ROAD_HZ_T.sturz.dropL3K && zero && wet ? 3 : zero ? 2 : 1;
  const ev: RoadEvidence = worst.a[2] === 'd' && worst.b[2] === 'd' ? 'd' : 'p';
  return { lv, ev, why: [w('dT', worst.drop, ev === 'd' ? worst.b[3] : 'fc'), w('fromMs', worst.a[0], 'ms'), w('toMs', worst.b[0], 'ms'), ...(zero ? ['zero:1'] : []), ...(wet ? ['wet:1'] : [])] };
}

// --- One segment -----------------------------------------------------------------------------------

/** Season key (UTC) of an instant: `YYYY` of the season that started on 1 August. */
export function seasonOf(ms: number): string {
  const d = new Date(ms);
  const y = d.getUTCMonth() + 1 > ROAD_HZ_SEASON_START.month || (d.getUTCMonth() + 1 === ROAD_HZ_SEASON_START.month && d.getUTCDate() >= ROAD_HZ_SEASON_START.day) ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return String(y);
}

/**
 * Hazards of one segment for the window: `entry` (null when nothing is ≥ 1 and nothing is unknown), the next state and
 * the entries the lock dropped. Pure: the derive feeds it, the verifier feeds it fixtures.
 */
export function evaluateSegment(input: HzSegmentInput): HzSegResult {
  const { seg, stations: st, points, radar, cells, hours, slotMs } = input;
  const state: HzSegState = { ...(input.state ?? {}) };
  const lv2Since: Partial<Record<RoadHazardId, number>> = { ...(state.lv2Since ?? {}) };
  const obsMissing = input.missing.has('obs');
  const fcMissing = input.missing.has('fc');
  const gap = !obsMissing && measurementGap(st);
  const validGma = !obsMissing && hasValidGma(st);
  const entry: HzEntry = { lv: {}, ev: {}, why: {} };
  const dropped: string[] = [];
  const h0 = hourVals(points, 0);
  const wetNow = st.some((s) => condWet(s.cond) || (s.wf != null && s.wf > 0));
  const rrNext3 = fcMissing ? null : maxOf(points.flatMap((p) => p.hours.slice(1, 4).map((h) => h?.rr ?? null)));
  const fresh6h = fcMissing ? null : (() => { let sum = 0, n = 0; for (const p of points) { let s = 0, k = 0; p.hours.slice(1).forEach((h) => { if (h?.ns != null) { s += h.ns; k++; } }); if (k) { sum = Math.max(sum, s); n++; } } return n ? sum : null; })();

  /** `undefined` = the hazard does not apply here (e.g. no concrete surface) — nothing is written; `null` = input missing (unknown). */
  const gapIds = st.filter((s) => s.inside && s.roadRejected).map((s) => s.id);
  const put = (id: RoadHazardId, cands: Array<Cand | 'unknown' | undefined>, dir?: 0 | 1) => {
    const def = ROAD_HAZARD_BY_ID[id];
    if (cands.every((c) => c === undefined)) return;
    const lv: HzLevels = [], ev: string[] = [], why: string[] = [];
    for (let i = 0; i < ROAD_HZ_HOURS; i++) {
      const c = cands[i];
      if (c === 'unknown' || c === null || c === undefined) { lv.push(null); ev.push('-'); continue; }
      const capped = capP(c);
      const l = Math.min(capped.lv, def.max) as RoadLevel;
      lv.push(l);
      ev.push(l ? capped.ev : '-');
      if (l && why.length < 8) for (const x of capped.why) if (!why.includes(x)) why.push(x);
    }
    if (!lv.some((l) => l === null || (l ?? 0) >= 1)) return;
    if (def.observeOnly) { if (lv.some((l) => (l ?? 0) >= 1)) (entry.ob ??= {})[id] = lv; return; }
    if (lv.some((l) => (l ?? 0) >= 1) && !why.length) { dropped.push(`${seg.id}:${id}: Stufe ohne why`); return; }
    if (lv[0] === null && gap && def.roadDependent) why.push(`gap:${gapIds.join(',')}`);
    entry.lv[id] = lv; entry.ev[id] = ev.join(''); entry.why[id] = why;
    if (dir !== undefined) (entry.dir ??= {})[id] = dir;
    const l2 = (lv[0] ?? 0) >= 2;
    lv2Since[id] = l2 ? (lv2Since[id] ?? 0) + 1 : 0;
  };
  const hasGmaAtAll = seg.stations.length > 0 || seg.near.length > 0;
  const unknownIfGap = (c: Cand): Cand | 'unknown' => (gap ? 'unknown' : obsMissing && hasGmaAtAll ? 'unknown' : c);
  /** Road-dependent Glätte for hours 1…6 (until Gate D): persistence of the now-level while T2m ≤ +1 °C, else the proxy. */
  const persist = (now: Cand | 'unknown', proxy: (hs: HzHour[], i: number) => Cand): Array<Cand | 'unknown'> => {
    const out: Array<Cand | 'unknown'> = [now];
    for (let i = 1; i < ROAD_HZ_HOURS; i++) {
      const hs = hourVals(points, i);
      if (fcMissing || !hs.length) { out.push('unknown'); continue; }
      const t2m = minOf(hs.map((h) => h.t2m));
      const nowLv = now !== 'unknown' && now ? now.lv : 0;
      if (nowLv >= 1 && t2m != null && t2m <= ROAD_HZ_T.reif.l1Tf) out.push({ lv: nowLv, ev: 'p', why: ['persist:now', w('T2m', t2m, 'fc')] });
      else out.push(proxy(hs, i));
    }
    return out;
  };

  // Glätte
  {
    const reifNowC = unknownIfGap(validGma ? reifNow(seg, st) : reifProxy(h0, 'fc'));
    let now = reifNowC;
    if (now !== 'unknown' && now && now.lv === 2 && (lv2Since.reif ?? 0) + 1 >= ROAD_HZ_T.reif.l3Slots && st.some((s) => s.rh != null && s.rh >= ROAD_HZ_T.reif.l3Rh)) now = { lv: 3, ev: 'd', why: [...now.why, w('slotsL2', (lv2Since.reif ?? 0) + 1, 'state')] };
    put('reif', persist(now, (hs) => reifProxy(hs, 'fc')));
    put('nass', persist(unknownIfGap(validGma ? nassNow(seg, st) : nassProxy(h0, wetNow, rrNext3, 'fc')), (hs) => nassProxy(hs, wetNow, rrNext3, 'fc')));
    const g: Array<Cand | 'unknown'> = [validGma ? best([glatteisNow(st), glatteisFc(h0, 'fc')]) : gap ? 'unknown' : glatteisFc(h0, 'fc')];
    for (let i = 1; i < ROAD_HZ_HOURS; i++) g.push(fcMissing ? 'unknown' : glatteisFc(hourVals(points, i), 'fc'));
    put('glatteis', g);
    const sn: Array<Cand | 'unknown'> = [validGma ? best([schneeNow(st), schneeFc(points, 0, null)]) : gap ? 'unknown' : schneeFc(points, 0, null)];
    for (let i = 1; i < ROAD_HZ_HOURS; i++) sn.push(fcMissing ? 'unknown' : schneeFc(points, i, fresh6h));
    put('schnee', sn);
  }
  // Aquaplaning, Gischt
  {
    const radarMissing = input.missing.has('radar');
    const a: Array<Cand | 'unknown'> = [unknownIfGap(best([validGma ? aquaNow(st, radarMissing ? null : radar) : radarMissing ? null : aquaNow([], radar), rateFc(h0, ROAD_HZ_T.aqua.rateMmH, 'fc')]))];
    const gi: Array<Cand | 'unknown'> = [unknownIfGap(best([validGma ? gischtNow(st, radarMissing ? null : radar) : radarMissing ? null : gischtNow([], radar), rateFc(h0, ROAD_HZ_T.gischt.rateMmH, 'fc')]))];
    for (let i = 1; i < ROAD_HZ_HOURS; i++) {
      const hs = hourVals(points, i);
      const rvH = !radarMissing && radar ? (i === 1 ? radar.rateH1 : i === 2 ? radar.rateH2 : null) : null;
      const rv: Cand = rvH == null ? null : { lv: stepLevel(rvH, ROAD_HZ_T.aqua.rateMmH), ev: 'p', why: rvH > 0 ? [w('rateRV', rvH, `+${i}h`)] : [] };
      const rvG: Cand = rvH == null ? null : { lv: stepLevel(rvH, ROAD_HZ_T.gischt.rateMmH), ev: 'p', why: rvH > 0 ? [w('rateRV', rvH, `+${i}h`)] : [] };
      a.push(fcMissing && !rv ? 'unknown' : best([rv, rateFc(hs, ROAD_HZ_T.aqua.rateMmH, 'fc')]));
      gi.push(fcMissing && !rvG ? 'unknown' : best([rvG, rateFc(hs, ROAD_HZ_T.gischt.rateMmH, 'fc')]));
    }
    put('aqua', a);
    put('gischt', gi);
  }
  // Sicht: Nebel, Sonne
  {
    const n: Array<Cand | 'unknown'> = [obsMissing && fcMissing ? 'unknown' : best([obsMissing ? null : nebelNow(st), nebelFc(points, 0)])];
    for (let i = 1; i < ROAD_HZ_HOURS; i++) n.push(fcMissing ? 'unknown' : nebelFc(points, i));
    put('nebel', n);
    const p0 = points[0] ?? null;
    const so: Array<Cand | 'unknown'> = [];
    let dirOut: 0 | 1 = 0;
    for (let i = 0; i < ROAD_HZ_HOURS; i++) {
      const hs = hourVals(points, i);
      if (fcMissing || !hs.length) { so.push('unknown'); continue; }
      const clct = minOf(hs.map((h) => h.n));
      const wet = wetNow || (i > 0 && hs.some((h) => (h.rr != null && h.rr >= ROAD_HZ_T.sonne.wetRrMmH) || (h.pp != null && h.pp >= ROAD_HZ_T.sonne.wetPp)));
      const r = sonneAt(seg, hours[i], p0, clct, wet);
      if (r.cand && r.cand.lv) dirOut = r.dir;
      so.push(r.cand);
    }
    put('sonne', so, dirOut);
  }
  // Wind
  {
    const gustNow = obsMissing ? null : maxOf(st.map((s) => kmh(s.wg)));
    const gustSt = obsMissing ? null : st.find((s) => s.wg != null && kmh(s.wg) === gustNow) ?? null;
    const dirNow = gustSt?.wd ?? null;
    const gustSrc = gustSt?.id ?? 'GMA';
    const fx0 = maxOf(h0.map((h) => kmh(h.fx)));
    const dd0 = h0.find((h) => h.fx != null && kmh(h.fx) === fx0)?.dd ?? null;
    const q: Array<Cand | 'unknown'> = [best([querOf(gustNow, dirNow, seg, gustSrc, 'd'), querOf(fx0, dd0, seg, 'fc', 'p')])];
    const b: Array<Cand | 'unknown'> = [best([baumOf(gustNow, seg, gustSrc, 'd'), baumOf(fx0, seg, 'fc', 'p')])];
    const sb: Array<Cand | 'unknown'> = [best([staubOf(gustNow, seg, state.dryH ?? null, gustSrc, 'd'), staubOf(fx0, seg, state.dryH ?? null, 'fc', 'p')])];
    for (let i = 1; i < ROAD_HZ_HOURS; i++) {
      const hs = hourVals(points, i);
      const fx = maxOf(hs.map((h) => kmh(h.fx)));
      const dd = hs.find((h) => h.fx != null && kmh(h.fx) === fx)?.dd ?? null;
      q.push(fcMissing ? 'unknown' : querOf(fx, dd, seg, 'fc', 'p'));
      b.push(fcMissing ? 'unknown' : baumOf(fx, seg, 'fc', 'p'));
      sb.push(fcMissing ? 'unknown' : staubOf(fx, seg, state.dryH ?? null, 'fc', 'p'));
    }
    if (q[0] === null && obsMissing) q[0] = 'unknown';
    put('quer', q); put('baum', b); put('staub', sb);
  }
  // Gewitter, Hagel
  {
    const konradMissing = input.missing.has('konrad'), radarMissing = input.missing.has('radar');
    const cellsIn = konradMissing ? null : cells;
    const ge: Array<Cand | 'unknown'> = [gewitterNow(radarMissing ? null : radar, cellsIn, h0)];
    const ha: Array<Cand | 'unknown'> = [hagelNow(obsMissing ? [] : st, cellsIn, h0)];
    for (let i = 1; i < ROAD_HZ_HOURS; i++) {
      const hs = hourVals(points, i);
      ge.push(best([i <= 2 ? gewitterTrack(cellsIn, i) : null, gewitterFc(hs, 'fc')]));
      ha.push(hagelFc(hs, 'fc'));
    }
    put('gewitter', ge.map((c) => (c === null && input.missing.has('runs') ? 'unknown' : c)));
    put('hagel', ha.map((c) => (c === null && input.missing.has('runs') ? 'unknown' : c)));
  }
  // Hitze
  {
    const today = utcDay(slotMs);
    const hot = (state.hotDays ?? []).filter((d) => d < today);
    // Days in a row ending yesterday.
    let run = 0;
    for (let i = hot.length - 1; i >= 0; i--) { const d = new Date(today + 'T00:00Z'); d.setUTCDate(d.getUTCDate() - (run + 1)); if (hot[i] === d.toISOString().slice(0, 10)) run++; else break; }
    const c = blowupOf(seg, obsMissing ? [] : st, fcMissing ? [] : points, run);
    put('blowup', Array.from({ length: ROAD_HZ_HOURS }, () => c));
    if (c && c.lv >= 1) state.hotDays = [...hot.slice(-5), today];
  }
  // Wetterwechsel
  {
    const season = seasonOf(slotMs);
    const fcAt = state.frostFcAt && seasonOf(Date.parse(state.frostFcAt)) === season ? state.frostFcAt : null;
    const obsAt = state.frostObsAt && seasonOf(Date.parse(state.frostObsAt)) === season ? state.frostObsAt : null;
    const coldest = obsMissing ? null : st.filter((s) => !s.suspect && s.rs != null).sort((a, b) => (a.rs as number) - (b.rs as number))[0] ?? null;
    const rsMin = coldest?.rs ?? null;
    const fr: Array<Cand | 'unknown'> = [];
    let newFc = fcAt, newObs = obsAt;
    for (let i = 0; i < ROAD_HZ_HOURS; i++) {
      const hs = hourVals(points, i);
      const t2m = fcMissing ? null : minOf(hs.map((h) => h.t2m));
      if (i === 0 && rsMin != null && rsMin <= ROAD_HZ_T.frost1.tfC && !obsAt) { newObs = new Date(slotMs).toISOString(); fr.push({ lv: 2, ev: 'd', why: [w('Tf', rsMin, coldest!.id), 'first:season'] }); continue; }
      if (t2m != null && t2m <= ROAD_HZ_T.frost1.t2mC && !newFc && !obsAt) { newFc = new Date(hours[i]).toISOString(); fr.push({ lv: 1, ev: 'p', why: [w('T2m', t2m, 'fc'), 'first:season'] }); continue; }
      fr.push(fcMissing && obsMissing ? 'unknown' : { lv: 0, ev: 'p', why: [] });
    }
    put('frost1', fr);
    state.frostFcAt = newFc; state.frostObsAt = newObs;
    const sc = sturzOf(obsMissing ? [] : st, fcMissing ? [] : points, hours, slotMs);
    put('sturz', Array.from({ length: ROAD_HZ_HOURS }, () => sc));
  }
  // Dry hours for `staub` (observe only): counted from the stations' precipitation.
  {
    const anyPrecip = st.some((s) => (s.pr != null && s.pr > 0) || precipLiquid(s.pt) || precipSolid(s.pt) || precipSnow(s.pt));
    state.dryH = obsMissing ? state.dryH : anyPrecip ? 0 : (state.dryH ?? 0) + 0.25;
  }
  state.lv2Since = lv2Since;
  const has = Object.keys(entry.lv).length || Object.keys(entry.ob ?? {}).length;
  return { entry: has ? entry : null, state, dropped };
}

// --- The file and its locks ------------------------------------------------------------------------

export interface RoadHzFile {
  schema: 1;
  product: 'road-hz';
  slot: string;
  slotMs: number;
  made: string;
  /** The seven instants (ms): slot, then the full hours +1 … +6. */
  hours: number[];
  inputs: { obs: string | null; fc: { run: string; fusion: string | null } | null; rv: string | null; konrad: string | null; runs: string | null; segments: string };
  /** Inputs missing or too old in this slot (`obs`, `radar`, `konrad`, `fc`, `runs`). */
  missing: string[];
  killed: boolean;
  /** E-AW-34: forecast levels capped at `ROAD_HZ_CAP_P`. */
  capP: number;
  /** Segments with at least one level ≥ 1 or an unknown hazard. */
  seg: Record<string, HzEntry>;
}

const LEVELS = new Set([0, 1, 2, 3, null]);

/** Entry lock (gefahren §Validierung, "Programmfehler" rows): a violation makes the SLOT unpublishable. */
export function roadHzEntryProblems(id: string, e: unknown, seg: RoadSegment | null): string[] {
  const out: string[] = [];
  if (!e || typeof e !== 'object') return [`${id}: kein Objekt`];
  const x = e as HzEntry;
  if (!x.lv || typeof x.lv !== 'object' || !x.ev || typeof x.ev !== 'object' || !x.why || typeof x.why !== 'object') return [`${id}: lv/ev/why fehlen`];
  for (const [hid, lv] of Object.entries(x.lv)) {
    const def = ROAD_HAZARD_BY_ID[hid as RoadHazardId];
    if (!def) { out.push(`${id}/${hid}: unbekannte Gefahr`); continue; }
    if (def.observeOnly) out.push(`${id}/${hid}: Beobachtungsgefahr in lv`);
    if (!Array.isArray(lv) || lv.length !== ROAD_HZ_HOURS || !lv.every((l) => LEVELS.has(l as number))) { out.push(`${id}/${hid}: lv-Form`); continue; }
    const ev = x.ev[hid as RoadHazardId];
    if (typeof ev !== 'string' || ev.length !== ROAD_HZ_HOURS || !/^[mdp-]+$/.test(ev)) { out.push(`${id}/${hid}: ev-Form`); continue; }
    for (let i = 0; i < ROAD_HZ_HOURS; i++) {
      const l = lv[i], c = ev[i];
      if ((l ?? 0) >= 1 && c === '-') out.push(`${id}/${hid}[${i}]: Stufe ohne Nachweis`);
      if (c === 'm' && i > 0) out.push(`${id}/${hid}[${i}]: gemessen in der Zukunft`);
      if ((l ?? 0) > def.max) out.push(`${id}/${hid}[${i}]: Stufe ${l} über ${def.max}`);
      if (c === 'p' && (l ?? 0) > ROAD_HZ_CAP_P) out.push(`${id}/${hid}[${i}]: Prognose über der Deckelung`);
    }
    const why = x.why[hid as RoadHazardId];
    if (lv.some((l) => (l ?? 0) >= 1) && (!Array.isArray(why) || !why.length)) out.push(`${id}/${hid}: Stufe ohne why`);
    if (seg && def.group === 'glaette' && (ev[0] === 'm' || ev[0] === 'd') && !seg.stations.length && !seg.near.length) out.push(`${id}/${hid}: Glätte gemessen ohne GMA im Abschnitt`);
  }
  if (x.dir) for (const [hid, d] of Object.entries(x.dir)) if (!ROAD_HAZARD_BY_ID[hid as RoadHazardId]?.perDirection || (d !== 0 && d !== 1)) out.push(`${id}/${hid}: dir`);
  return out;
}

/** Consistency lock over the inputs (gefahren §Validierung): a violation makes the slot unpublishable. */
export function roadHzConsistencyProblems(id: string, e: HzEntry, points: readonly HzPoint[], stations: readonly HzStation[]): string[] {
  const out: string[] = [];
  const t2mAt = (i: number) => minOf(points.map((p) => p.hours[i]?.t2m ?? null));
  e.lv.blowup?.forEach((l, i) => { const t = t2mAt(i); if ((l ?? 0) >= 1 && t != null && t < 25 && !stations.some((s) => (s.rsMax ?? -99) >= ROAD_HZ_T.blowup.rsC)) out.push(`${id}/blowup[${i}]: Hitze bei T2m ${t}`); });
  e.lv.schnee?.forEach((l, i) => { const t = t2mAt(i); if (l === 3 && t != null && t > 6 && e.ev.schnee?.[i] !== 'm') out.push(`${id}/schnee[${i}]: Stufe 3 bei T2m ${t} ohne Messcode`); });
  e.lv.nebel?.forEach((l, i) => { if (l === 3 && !(e.why.nebel ?? []).some((s) => /^vis:(\d+(\.\d+)?)@/.test(s) && Number(/^vis:([\d.]+)@/.exec(s)![1]) < ROAD_HZ_T.nebel.visM[2])) out.push(`${id}/nebel[${i}]: Stufe 3 ohne Sicht < 50 m`); });
  return out;
}

export function parseRoadHz(j: unknown): RoadHzFile | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (o.schema !== ROAD_HZ_SCHEMA || o.product !== ROAD_HZ_PRODUCT || typeof o.slot !== 'string' || typeof o.slotMs !== 'number') return null;
  if (!Array.isArray(o.hours) || o.hours.length !== ROAD_HZ_HOURS || !o.hours.every((h) => typeof h === 'number')) return null;
  if (!o.seg || typeof o.seg !== 'object' || !Array.isArray(o.missing)) return null;
  for (const [id, e] of Object.entries(o.seg as Record<string, unknown>)) if (roadHzEntryProblems(id, e, null).length) return null;
  return { ...(o as unknown as RoadHzFile), killed: o.killed === true, capP: typeof o.capP === 'number' ? o.capP : ROAD_HZ_CAP_P };
}

export type RoadHzFreshness = 'live' | 'stale' | 'dead';
export function roadHzFreshness(slotMs: number, nowMs: number, killed = false): RoadHzFreshness {
  if (killed || !Number.isFinite(slotMs)) return 'dead';
  const age = nowMs - slotMs;
  if (age > ROAD_HZ_DEAD_MS) return 'dead';
  return age > ROAD_HZ_STALE_MS ? 'stale' : 'live';
}

// --- Summaries shared by the rail (matrix, chips) and the balance of status.json -------------------

export interface HzCell7 { n: number; max: RoadLevel; unknown: number }
export interface HzSummary {
  /** Per group × hour: segments with a level ≥ 1, the highest level, segments unknown. */
  matrix: Record<RoadHazardGroup, HzCell7[]>;
  /** Per hazard: segments with a level ≥ 1 in any hour of the window, and now. */
  byHazard: Record<RoadHazardId, { window: number; now: number; unknown: number }>;
  /** Segments with any level ≥ 1 in the window / now. */
  segments: { window: number; now: number; unknown: number };
}
export function roadHzSummary(file: Pick<RoadHzFile, 'seg'>): HzSummary {
  const matrix = Object.fromEntries(ROAD_HAZARD_GROUPS.map((g) => [g.id, Array.from({ length: ROAD_HZ_HOURS }, () => ({ n: 0, max: 0, unknown: 0 }))])) as HzSummary['matrix'];
  const byHazard = Object.fromEntries(ROAD_HAZARD_IDS.map((id) => [id, { window: 0, now: 0, unknown: 0 }])) as HzSummary['byHazard'];
  let win = 0, now = 0, unk = 0;
  for (const e of Object.values(file.seg)) {
    let anyWin = false, anyNow = false, anyUnk = false;
    const groupHour = new Map<string, { n: boolean; max: RoadLevel; unknown: boolean }>();
    for (const [hid, lv] of Object.entries(e.lv)) {
      const def = ROAD_HAZARD_BY_ID[hid as RoadHazardId];
      if (!def) continue;
      const bh = byHazard[def.id];
      if (lv.some((l) => (l ?? 0) >= 1)) { bh.window++; anyWin = true; }
      if ((lv[0] ?? 0) >= 1) { bh.now++; anyNow = true; }
      if (lv.some((l) => l === null)) { bh.unknown++; anyUnk = true; }
      lv.forEach((l, i) => {
        const k = `${def.group}/${i}`;
        const c = groupHour.get(k) ?? { n: false, max: 0, unknown: false };
        if ((l ?? 0) >= 1) { c.n = true; if ((l as RoadLevel) > c.max) c.max = l as RoadLevel; }
        if (l === null) c.unknown = true;
        groupHour.set(k, c);
      });
    }
    for (const [k, c] of groupHour) {
      const [g, i] = k.split('/');
      const cell = matrix[g as RoadHazardGroup][+i];
      if (c.n) { cell.n++; if (c.max > cell.max) cell.max = c.max; }
      if (c.unknown) cell.unknown++;
    }
    if (anyWin) win++; if (anyNow) now++; if (anyUnk) unk++;
  }
  return { matrix, byHazard, segments: { window: win, now, unknown: unk } };
}

/** Highest level of an entry over the window and the hazard that carries it (rail sorting). */
export function hzEntryMax(e: HzEntry): { lv: RoadLevel; id: RoadHazardId | null; ev: RoadEvidence | null } {
  let out: { lv: RoadLevel; id: RoadHazardId | null; ev: RoadEvidence | null } = { lv: 0, id: null, ev: null };
  for (const [hid, lv] of Object.entries(e.lv)) lv.forEach((l, i) => {
    const ev = (e.ev[hid as RoadHazardId]?.[i] ?? '-') as RoadEvidence | '-';
    if ((l ?? 0) > out.lv || ((l ?? 0) === out.lv && out.lv > 0 && ev !== '-' && out.ev && EV_RANK[ev] > EV_RANK[out.ev])) out = { lv: l as RoadLevel, id: hid as RoadHazardId, ev: ev === '-' ? null : ev };
  });
  return out;
}
