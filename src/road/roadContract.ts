/**
 * AW-1 — Contract of the Autobahnwetter data line (`buscosun-data/road/v1/`): ONE file for producer
 * (`scripts/road/road-derive.mjs`), client (`src/road/roadClient.ts`) and verifiers (`verify:road-*`) —
 * paths, schemas, builders, validators, time gates, kill switch. Pattern: `src/sources/radarImg.ts`.
 * Diagnosis and every number below: `audit/autobahnwetter.md` (AW-0 spike, Gate A).
 *
 * Layout (versioned path — a format change bumps `v1` → `v2`, old clients see clean 404s):
 *   road/v1/status.json                    producer status: job, last slot, groups, rule balance, block, kill switch
 *   road/v1/state.json                     producer-only run/jump state (never read by the client; E-AW-10)
 *   road/v1/obs/<YYMMDDHHMM>.json          every VALID point of the slot (values, class, provenance, age)
 *   road/v1/h24/<group>/<YYMMDDHHMM>.json  24-h ring of one DWD series up to that slot (immutable per slot; E-AW-10)
 *   road/v1/quarantine/<YYMMDDHHMM>.json   rejected values with rule and raw value (diagnosis only)
 *   (the AW-6.1 route forecast is its own line `road/fc/v1/` — contract `roadFc.ts`, E-AW-18)
 *   road/v1/static/stations.json           station catalogue from sws_stations_xls.xlsx (timeless)
 *   road/v1/static/corridors.json          corridors, km axis, border points, AT/CH forecast points (timeless)
 *
 * Slot files are immutable, so `@main` is safe at the CDN; the client derives the expected slot from the
 * clock (time gate) and steps back on 404 — it never reads a mutable manifest.
 *
 * Four locks (plan AW-1): value/station rules in the derive · slot lock before the push · client checks before
 * display · external watch (`npm run health`). Hard rules are active; statistical rules run in OBSERVE mode
 * (counted as "would reject", value stays) until calibrated after ≥ 14 days of shadow operation.
 */

import { classifySensor, isKnownCondition, mostSevereCondition, type RoadClass } from './roadClasses';

// --- Paths -------------------------------------------------------------------------------------

export const ROAD_VERSION = 'v1';
export const ROAD_CDN_BASE = `https://cdn.jsdelivr.net/gh/jppetry/buscosun-data@main/road/${ROAD_VERSION}`;
/** Same files on raw.githubusercontent (CORS *), hedge when jsDelivr hangs or answers 403 (pattern NL-2/V-FI-5). */
export const ROAD_RAW_BASE = `https://raw.githubusercontent.com/jppetry/buscosun-data/main/road/${ROAD_VERSION}`;
/** Repo-relative directory of the line (producer side). */
export const ROAD_REPO_DIR = `road/${ROAD_VERSION}`;

export const roadObsPath = (stamp: string) => `obs/${stamp}.json`;
export const roadQuarantinePath = (stamp: string) => `quarantine/${stamp}.json`;
export const roadH24Path = (group: string, stamp: string) => `h24/${group}/${stamp}.json`;
export const ROAD_STATUS_PATH = 'status.json';
export const ROAD_STATE_PATH = 'state.json';
export const ROAD_STATIONS_PATH = 'static/stations.json';
export const ROAD_CORRIDORS_PATH = 'static/corridors.json';

// --- Slots and stamps --------------------------------------------------------------------------

/** DWD road-weather cadence: one bulletin per series every 15 min (AW-0: 192 slots in 48 h, 0 gaps). */
export const ROAD_SLOT_MS = 900_000;

const two = (n: number) => String(n).padStart(2, '0');

/** Slot stamp `YYMMDDHHMM` (UTC) — the key of the DWD file names and of `obs/`. */
export function roadStamp(ms: number): string {
  const d = new Date(ms);
  return `${two(d.getUTCFullYear() % 100)}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}${two(d.getUTCHours())}${two(d.getUTCMinutes())}`;
}

/** Inverse of `roadStamp`; NaN for anything else. */
export function roadStampToMs(s: string): number {
  const m = /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(s);
  if (!m) return NaN;
  const ms = Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  return roadStamp(ms) === s ? ms : NaN;
}

export const roadSlotOf = (ms: number) => Math.floor(ms / ROAD_SLOT_MS) * ROAD_SLOT_MS;

// --- Producer timing ---------------------------------------------------------------------------

/** Missing groups get until slot + 12 min, then the slot is published without them (plan; AW-0: max arrival 8.1 min). */
export const ROAD_DEADLINE_MS = 12 * 60_000;
/** HEAD cadence on the expected bulletin paths (plan: every 30 s from slot start). */
export const ROAD_POLL_MS = 30_000;

// --- Client timing (time gate, staleness) ------------------------------------------------------

/**
 * The client asks for slot S only from S + 10 min on (`set`): AW-0 arrival p99 3.3 min after the slot,
 * + derive and push < 1 min, + jsDelivr `@main` resolution ≤ 3 min (CLAUDE.md), + margin. Measured in the
 * shadow run (Gate B), then narrowed — a too-early request costs a sticky edge 404 for that slot.
 */
export const ROAD_OBS_GATE_MS = 10 * 60_000;
/** On 404 the client steps back one slot at a time, at most this many (1 h). */
export const ROAD_MAX_STEP_BACK = 4;
/** Plan client rule: slot older than 45 min ⇒ points grey "veraltet". */
export const ROAD_STALE_MS = 45 * 60_000;
/** Plan client rule: slot older than 3 h (or kill switch) ⇒ "derzeit keine Messdaten". */
export const ROAD_DEAD_MS = 3 * 3_600_000;

export type RoadFreshness = 'live' | 'stale' | 'dead';
export function roadFreshness(slotMs: number, nowMs: number, killed = false): RoadFreshness {
  if (killed || !Number.isFinite(slotMs)) return 'dead';
  const age = nowMs - slotMs;
  if (age > ROAD_DEAD_MS) return 'dead';
  return age > ROAD_STALE_MS ? 'stale' : 'live';
}

/** Expected newest slot behind the time gate. */
export function roadExpectedSlot(nowMs: number): number {
  return roadSlotOf(nowMs - ROAD_OBS_GATE_MS);
}

// --- Retention (age rule of the data repo, README "Aufbewahrung") ------------------------------

export const ROAD_RETENTION = Object.freeze({
  /** obs/ and fc/: at most 3 h, at least 2 slots (plan). */
  obsMaxAgeMs: 3 * 3_600_000, obsMinKeep: 2,
  /** quarantine/: 24 h (plan). */
  quarantineMaxAgeMs: 24 * 3_600_000, quarantineMinKeep: 2,
  /** h24/<group>/: each file holds the whole ring, so 1 h and 2 files per group are enough (E-AW-10). */
  h24MaxAgeMs: 3_600_000, h24MinKeep: 2,
});

/** Slots of the 24-h ring per group (plan: 96 slots). */
export const ROAD_H24_SLOTS = 96;

// --- Kill switch -------------------------------------------------------------------------------

/**
 * Two kill switches (D-31 pattern): producer side `ROAD_KILL=1` writes slot files with `killed: true` and no
 * points (and `status.killSwitch`); client side `?road=0` / `localStorage.road='0'` hides the page's data path.
 * `?road=1` / `localStorage.road='1'` is the phase flag (default OFF until Gate C, `roadFlag.ts`).
 */
export { roadFlagFrom, ROAD_LIVE } from './roadFlag';

// --- DWD series (groups) -----------------------------------------------------------------------

export interface RoadGroup {
  /** `<folder>-<KZ>`, e.g. `FN-BY`, `FN-NB`, `HJ-HH`. */
  id: string;
  folder: string;
  /** Bulletin code after `DW` (not always the folder: HJ carries `DWKK…-HH`). */
  cc: string;
  /** Series suffix (looks like a state code; DWD names it nowhere). */
  kz: string;
  /** Spike state 03.10.2026: active every slot, or sporadic. */
  sporadic?: boolean;
}

const G = (folder: string, cc: string, kz: string, sporadic = false): RoadGroup => ({ id: `${folder}-${kz}`, folder, cc, kz, ...(sporadic ? { sporadic } : {}) });

/** The 23 series active in the AW-0 window (01.–03.10.2026) plus the sporadic SD-BW. */
export const ROAD_GROUPS: readonly RoadGroup[] = Object.freeze([
  G('DD', 'DD', 'DD'), G('ER', 'ER', 'TH'), G('FN', 'FN', 'BY'), G('FN', 'NB', 'NB'), G('HJ', 'KK', 'HH'),
  G('HL', 'HL', 'ST'), G('HV', 'HV', 'NI'), G('JA', 'JA', 'SO'), G('JO', 'JO', 'SO'), G('KA', 'KA', 'NW'),
  G('KK', 'KK', 'SH'), G('KM', 'KM', 'NW'), G('KO', 'KO', 'RP'), G('LH', 'LH', 'LH'), G('MC', 'MC', 'MV'),
  G('ND', 'ND', 'BY'), G('NI', 'NI', 'NI'), G('RB', 'RB', 'SL'), G('RH', 'RH', 'HE'), G('RP', 'RP', 'RP'),
  G('SD', 'SD', 'BW', true), G('SH', 'SH', 'SH'), G('SP', 'SP', 'BB'), G('WW', 'WW', 'SO'),
]);

export const ROAD_DWD_BASE = 'https://opendata.dwd.de/weather/weather_reports/road_weather_stations';

/** Bulletin of one slot: `swis2-ISXD70_DW<CC>_<DDHHMM>-<YYMMDDHHMM>-<KZ>---bin`. */
export function roadBulletinUrl(g: RoadGroup, slotMs: number): string {
  const s = roadStamp(slotMs);
  return `${ROAD_DWD_BASE}/${g.folder}/swis2-ISXD70_DW${g.cc}_${s.slice(4)}-${s}-${g.kz}---bin`;
}
export function roadLatestUrl(g: RoadGroup): string {
  return `${ROAD_DWD_BASE}/${g.folder}/swis2-ISXD70_DW${g.cc}_LATEST-${g.kz}---bin`;
}

// --- Rules -------------------------------------------------------------------------------------

export type RoadRuleId =
  | 'limit' | 'placeholder' | 'dewAboveAir' | 'gustBelowWind' | 'dwdSuspect' | 'stuck' | 'stateNoTemp' | 'iceWarm' | 'jump' | 'roadAir' | 'unknownCode'
  | 'fillValue' | 'dewSpread' | 'gustNoWind' | 'precipFill'
  | 'catalog' | 'outsideDE' | 'cube' | 'neighbours' | 'time' | 'spread' | 'duplicate'
  | 'slotGroups' | 'slotShare' | 'slotSchema';

export type RoadRuleMode = 'hard' | 'observe' | 'flag';

export interface RoadRule {
  id: RoadRuleId;
  level: 'value' | 'station' | 'slot';
  mode: RoadRuleMode;
  /** Short German description for status/quarantine and the audit. */
  text: string;
}

/**
 * The rule table of the plan (AW-1). `mode`: hard = rejected from day 1; observe = statistical rule, logged as
 * "would reject" until calibrated (≥ 14 days, Gate B); flag = kept, but marked.
 * E-AW-7 (Jan, 03.10.2026): `catalog` runs in OBSERVE mode — the 2020 catalogue misses 11.4 % of the measuring
 * stations, as a hard rule it would block every slot (> 10 %); position comes from the bulletin itself.
 * E-AW-11 (Jan, 03.10.2026): `stateNoTemp` and `iceWarm` are hard rules beyond the plan's table — a sensor's
 * condition and water film count only with a valid road temperature of the SAME sensor, and an ice code (3–6)
 * only at ≤ +3 °C (AW-0: 557 of 579 ice codes at air > +10 °C, all from broken sensors).
 * Data audit 06.10.2026 (`audit/autobahnwetter-datenpruefung.md` §5, Jan 07.10.: "setze M1–M5 um"): `roadAir` is hard
 * before Gate B — the neighbours decide whether the road or the air sensor is broken —, and four hard rules join:
 * `fillValue` (M1: device fill values 0.00/−1.00), `dewSpread` and `gustNoWind` (M2), `precipFill` (M3). Each was
 * measured on the archive 03.–06.10. before it was switched on; every frost/ice state of that window came from them.
 */
export const ROAD_RULES: Readonly<Record<RoadRuleId, RoadRule>> = Object.freeze({
  limit: { id: 'limit', level: 'value', mode: 'hard', text: 'außerhalb der physikalischen Grenzen' },
  placeholder: { id: 'placeholder', level: 'value', mode: 'hard', text: 'Temperatur unter −60 °C (Geräteplatzhalter)' },
  dewAboveAir: { id: 'dewAboveAir', level: 'value', mode: 'hard', text: 'Taupunkt mehr als 0,5 K über der Lufttemperatur' },
  gustBelowWind: { id: 'gustBelowWind', level: 'value', mode: 'hard', text: 'Böe kleiner als Mittelwind' },
  dwdSuspect: { id: 'dwdSuspect', level: 'value', mode: 'hard', text: 'vom DWD als zweifelhaft markiert' },
  stuck: { id: 'stuck', level: 'value', mode: 'hard', text: '24 gleiche Werte in Folge (hängender Sensor)' },
  stateNoTemp: { id: 'stateNoTemp', level: 'value', mode: 'hard', text: 'Zustand/Wasserfilm ohne gültige Fahrbahntemperatur desselben Sensors (E-AW-11)' },
  iceWarm: { id: 'iceWarm', level: 'value', mode: 'hard', text: 'Eis-/Glätte-/Reif-/Schnee-Code bei Fahrbahn über +3 °C (E-AW-11)' },
  jump: { id: 'jump', level: 'value', mode: 'observe', text: 'Sprung der Fahrbahntemperatur zum Vorslot über der Schwelle' },
  roadAir: { id: 'roadAir', level: 'value', mode: 'hard', text: 'Fahrbahn mehr als 12 K unter oder 30 K über der eigenen Lufttemperatur — verworfen wird der Fühler, der nicht zu den Nachbarn passt (M1/M2)' },
  fillValue: { id: 'fillValue', level: 'value', mode: 'hard', text: 'Gerätefüllwert: Fahrbahn genau 0,00/−1,00 °C bei mindestens 5 K wärmerer Luft, oder Fahrbahn = Luft = Taupunkt genau 0,00/−1,00 °C (M1)' },
  dewSpread: { id: 'dewSpread', level: 'value', mode: 'hard', text: 'Taupunkt mehr als 25 K (Mai–Sep. 30 K) unter der Luft — Feuchtefühler defekt (M2)' },
  gustNoWind: { id: 'gustNoWind', level: 'value', mode: 'hard', text: 'Böe über 40 m/s bei Mittelwind unter 10 m/s (M2)' },
  precipFill: { id: 'precipFill', level: 'value', mode: 'hard', text: 'Niederschlagsrate ohne Niederschlag: Intensität (0 20 024) „keine“ und keine Art (0 20 021) gemeldet (M3)' },
  unknownCode: { id: 'unknownCode', level: 'value', mode: 'flag', text: 'unbekannter Zustandscode — Zustand unbekannt, nie trocken' },
  catalog: { id: 'catalog', level: 'station', mode: 'observe', text: 'keine Zeile im Stationskatalog (E-AW-7)' },
  outsideDE: { id: 'outsideDE', level: 'station', mode: 'hard', text: 'Koordinaten fehlen oder liegen außerhalb Deutschlands' },
  cube: { id: 'cube', level: 'station', mode: 'observe', text: 'Luft weicht mehr als 8 K von T2m der buscosun Fusion ab' },
  neighbours: { id: 'neighbours', level: 'station', mode: 'observe', text: 'Fahrbahn weicht um mehr als k·MAD vom Median der Nachbarn ab' },
  time: { id: 'time', level: 'station', mode: 'hard', text: 'Messzeit in der Zukunft oder älter als 3 h' },
  spread: { id: 'spread', level: 'station', mode: 'flag', text: 'mehrere Fahrbahnsensoren mehr als 5 K uneinig' },
  duplicate: { id: 'duplicate', level: 'station', mode: 'flag', text: 'Station in zwei Reihen desselben Slots — die jüngere Messung zählt' },
  slotGroups: { id: 'slotGroups', level: 'slot', mode: 'hard', text: 'weniger aktive Reihen als die Basis minus Toleranz' },
  slotShare: { id: 'slotShare', level: 'slot', mode: 'hard', text: 'mehr als 10 % der Werte verworfen' },
  slotSchema: { id: 'slotSchema', level: 'slot', mode: 'hard', text: 'geschriebene Datei besteht den Client-Prüfer nicht' },
});

/** Physical limits (`set`, plan AW-1). */
export const ROAD_LIMITS = Object.freeze({
  rs: [-40, 75] as const,     // road surface °C
  ta: [-40, 45] as const,     // air °C
  td: [-60, 45] as const,     // dew point °C (lower bound = placeholder rule)
  rh: [0, 100] as const,      // %
  ws: [0, 60] as const,       // m/s
  wg: [0, 60] as const,       // m/s
  wf: [0, 10] as const,       // water film mm
  vis: [0, 100_000] as const, // m (descriptor maximum is 81 910 m)
});
export const ROAD_PLACEHOLDER_C = -60;
export const ROAD_DEW_ABOVE_AIR_K = 0.5;
/** Hanging sensor: 24 identical values in a row = 6 h (AW-0: working sensors ≤ 15/17/9, broken 86–96, wetterdienst). */
export const ROAD_STUCK_RUN = 24;
/** A missing value or a missing slot is neutral for the run for up to 4 slots (1 h, `set`) — AW-0: H267 alternated
 *  between −30.00 °C and "missing" and leaked 64 slots when every gap restarted the count. */
export const ROAD_STUCK_GAP_SLOTS = 4;
/** Thaw-plateau exception: road −10…0 °C while air within ±10 K of 0 °C (plan) — but only for a run shorter than
 *  `maxRun` slots (M1, `set`: 12 h). A melting surface holds near 0 °C for hours, not for days; without the cap a fill
 *  value 0.00 stayed "frost" for the whole winter. */
export const ROAD_STUCK_PLATEAU = Object.freeze({ roadMin: -10, roadMax: 0, airAbsMax: 10, maxRun: 48 });
/** M1 fill values of the road sensors (archive 03.–06.10.: exactly 0.00 or −1.00 °C at 10 stations, −25.00 at H637 is
 *  caught by `roadAir`). A road at a fill value counts as broken when the air is at least `airK` warmer (`set`; real
 *  0.0 °C at air near 0 stays: 27 cases in the archive untouched), or when road, air and dew point carry it alike. */
export const ROAD_FILL = Object.freeze({ valuesC: [0, -1] as readonly number[], airK: 5, eps: 0.005 });
/** M2 humidity sensor: air − dew point above this ⇒ dew point and humidity rejected (archive p99 15.2 K; 25 K Oct–Apr,
 *  30 K May–Sep for hot dry afternoons, `set`). */
export const ROAD_DEW_SPREAD_K = Object.freeze({ cold: 25, warm: 30, warmMonths: [5, 6, 7, 8, 9] as readonly number[] });
/** M2 gust without wind (`set`): 57.6 / 56.5 m/s at 0.4 / 0.9 m/s mean wind on 06.10. 19:00 UTC. */
export const ROAD_GUST_NO_WIND = Object.freeze({ gustMs: 40, windMs: 10 });
/** E-AW-11: an ice code (rime, snow, ice, glaze) needs a road surface at most this warm (`set`: melting surfaces stay
 *  near 0 °C; +3 K margin for sensor offset and the 15-min interval). */
export const ROAD_ICE_MAX_C = 3;
/** Road vs. own air temperature (V-AW-3, `set`; hard since M1/M2): AW-0 road − air p1 = −5.4 K, p99 = +16.2 K; below −12 K
 *  or above +30 K only broken sensors were seen (−30.00/−25.00/0.00 °C at +15…+22 °C air; N443 air +41.7 °C, M080 air
 *  −23.7 °C at a normal road). Which sensor falls is decided against the neighbours (`ROAD_NEIGHBOUR`): road normal and air
 *  off ⇒ the air (and its dew point); otherwise the road sensor — above +30 K without neighbours only observed (summer
 *  midday not measured yet). */
export const ROAD_AIR = Object.freeze({ belowK: 12, aboveK: 30 });
/** Jump rule start value (observe): AW-0 window |Δ road| over 15 min p99.9 = 4.0 K, p99.99 = 24 K (flips of broken
 *  sensors) ⇒ 8 K (2 × p99.9; 72 of 218 701 steps in 48 h above it). Calibrated after ≥ 14 days. */
export const ROAD_JUMP_K = 8;
/** Neighbour rule start values (observe): radius 25 km, elevation classes of 300 m, |road − median| > max(k·MAD, 8 K)
 *  (AW-0 hourly sample, 45 400 cases: 1.7 % would be flagged, dominated by stations already broken). */
export const ROAD_NEIGHBOUR = Object.freeze({ radiusKm: 25, elevClassM: 300, minNeighbours: 3, k: 8, minAbsK: 8, madFloorK: 0.5 });
/** Cube rule (observe, `set`, plan): |air − T2m| > 8 K. */
export const ROAD_CUBE_MAX_K = 8;
/** Station time window: obs time > slot + 5 min or older than 3 h ⇒ rejected (plan). */
export const ROAD_TIME = Object.freeze({ futureMs: 5 * 60_000, maxAgeMs: 3 * 3_600_000 });
/** Sensors disagree when their spread exceeds 5 K (plan). */
export const ROAD_SPREAD_K = 5;
/** Slot lock: baseline of active series (AW-0: 23 in 155 of 193 slots, 22 during the SH outage) minus tolerance (`set`). */
export const ROAD_SLOT_BASELINE = 23;
export const ROAD_SLOT_TOLERANCE = 3;
/** Slot lock: share of rejected values (hard rules only), `set` by the plan. */
export const ROAD_SLOT_MAX_REJECT_SHARE = 0.10;

/**
 * DWD quality flags 0 33 005 (bit n = 2^(30−n), WMO-No. 306) → our fields. Bit 1 = no automated checks
 * (⇒ provenance `unchecked`), all 30 bits = missing. Bits not listed carry no field of ours: 17 is "ice deposit"
 * (not the road state — that is 19), 11 is soil temperature depth 4, 28 reserved (AW-0: FN-BY sets 11+17+28).
 */
export const DWD_SUSPECT_BITS: Readonly<Record<number, readonly RoadField[]>> = Object.freeze({
  3: ['ws', 'wg', 'wd'], 4: ['ta'], 5: ['td'], 6: ['td', 'rh'], 7: ['rs'], 14: ['vis'], 15: ['pt'],
  18: ['pr', 'pa', 'pt'], 19: ['cond'], 21: ['wf'],
});
export const dwdBit = (q: number, bit: number) => Math.floor(q / 2 ** (30 - bit)) % 2 === 1;
export const DWD_QUALITY_MISSING = 2 ** 30 - 1;

/** German names of the bits of 0 33 005 (WMO BUFR4 `BUFRCREX_CodeFlag_en_33.csv`; bit 1 = no checks, 24–29 reserved). */
export const DWD_QUALITY_BIT_TEXT: Readonly<Record<number, string>> = Object.freeze({
  2: 'Luftdruck', 3: 'Wind', 4: 'Lufttemperatur', 5: 'Feuchttemperatur', 6: 'Feuchte', 7: 'Fahrbahn-/Bodentemperatur',
  8: 'Bodentemperatur (Tiefe 1)', 9: 'Bodentemperatur (Tiefe 2)', 10: 'Bodentemperatur (Tiefe 3)', 11: 'Bodentemperatur (Tiefe 4)',
  12: 'Bodentemperatur (Tiefe 5)', 13: 'Wolken', 14: 'Sicht', 15: 'Wetter', 16: 'Blitze', 17: 'Eisansatz', 18: 'Niederschlag',
  19: 'Fahrbahnzustand', 20: 'Schnee', 21: 'Wasserfilm', 22: 'Verdunstung', 23: 'Sonnenschein',
});

/**
 * M5 (D-7): what the DWD's own check says, from the raw flag `qf` (0 33 005) — not from the provenance, which knows only
 * "0" and "anything else". Absent flag ⇒ unknown; bit 1 ⇒ not performed; other bits ⇒ checked and flagged (named).
 */
export function dwdCheckText(qf: number | null | undefined): string {
  if (qf == null || qf === DWD_QUALITY_MISSING) return 'Prüfung des DWD: unbekannt (kein Prüf-Flag gemeldet)';
  if (qf === 0) return 'Prüfung des DWD: durchgeführt, nichts beanstandet';
  if (dwdBit(qf, 1)) return 'Prüfung des DWD: nicht durchgeführt (DWD-Flag)';
  const names: string[] = [];
  let other = false;
  for (let bit = 2; bit <= 29; bit++) {
    if (!dwdBit(qf, bit)) continue;
    if (DWD_QUALITY_BIT_TEXT[bit]) names.push(DWD_QUALITY_BIT_TEXT[bit]); else other = true;
  }
  if (other) names.push('reservierte Bits');
  return `Prüfung des DWD: durchgeführt, beanstandet: ${names.join(', ')}`;
}

// --- Values ------------------------------------------------------------------------------------

/** Published fields of a point (units: °C, %, m, m/s, mm, mm/h). */
export type RoadField = 'rs' | 'ta' | 'td' | 'rh' | 'vis' | 'wf' | 'cond' | 'ws' | 'wg' | 'wd' | 'pt' | 'pr' | 'pa';
export const ROAD_FIELDS: readonly RoadField[] = Object.freeze(['rs', 'ta', 'td', 'rh', 'vis', 'wf', 'cond', 'ws', 'wg', 'wd', 'pt', 'pr', 'pa']);

/** Provenance per point (plan): ok = DWD checked and found nothing, unchecked = DWD did not check (normal case). */
export type RoadProvenance = 'ok' | 'unchecked' | 'derived';

/** Road class of the motorway / road designator. */
export type RoadKind = 'A' | 'B' | 'L' | 'other';

export interface RoadPoint {
  id: string;
  /** DWD series (group id). */
  g: string;
  /** Station name (bulletin, Latin-1 decoded). */
  n: string;
  lat: number;
  lon: number;
  /** Elevation m a.s.l. (bulletin). */
  h: number | null;
  /** Normalised road, e.g. `A8`, `B17`, null when unknown. */
  road: string | null;
  kind: RoadKind;
  /** Direction letter from the catalogue (`A7S` ⇒ `S`), null when unknown. */
  dir: string | null;
  /** Route kilometre (bulletin, 100 m resolution) — per road and federal state, not continuous along a corridor. */
  km: number | null;
  /** Observation time (ms, UTC). */
  t: number;
  cls: RoadClass;
  q: RoadProvenance;
  /** Coldest plausible road surface temperature °C (plan: "kältester plausibler Wert"). */
  rs: number | null;
  /** Warmest plausible road surface temperature when > 1 sensor. */
  rsHi?: number;
  /** Number of plausible road sensors. */
  ns: number;
  ta: number | null;
  td: number | null;
  rh: number | null;
  vis: number | null;
  /** Largest water film of the plausible sensors, mm. */
  wf: number | null;
  /** Most severe condition code of the plausible sensors (0–7), null = unknown. */
  cond: number | null;
  ws: number | null;
  wg: number | null;
  wd: number | null;
  /** Precipitation type flags 0 20 021. */
  pt: number | null;
  /** Precipitation rate mm/h. */
  pr: number | null;
  /** Precipitation amount over the period, mm. */
  pa: number | null;
  /** Flags: `spread` (sensors disagree), `duplicate`, `unknownCode`, `noCatalog` (E-AW-7), `posCatalog` (position from the
   *  catalogue: only it lies at the station's road, M6) and `posUnverified` (neither position lies at the road). */
  f?: string[];
  /** M6: the bulletin's own position `[lat, lon]` when the point shows another one (`posCatalog`). */
  rpos?: [number, number];
  /** Fields rejected by a hard rule: field → rule id (raw value only in quarantine/). */
  x?: Partial<Record<RoadField, RoadRuleId>>;
  /** M2: fields KEPT although an observe-mode rule would reject them (`jump`, `neighbours`, `cube`, `roadAir` above
   *  without neighbours): field → rule id. The page says "auffällig" instead of "bestanden"; the route forecast does not
   *  anchor on such a station (M4). */
  o?: Partial<Record<RoadField, RoadRuleId>>;
  /** M5: the DWD quality flag 0 33 005 as delivered (absent = not delivered / missing) — the page words the DWD check from it. */
  qf?: number;
}

export interface RoadGroupState {
  state: 'ok' | 'stale' | 'missing' | 'failed';
  /** Age of the series' newest bulletin at publish, minutes. */
  ageMin: number | null;
  stations: number;
}

export interface RoadObsFile {
  schema: 1;
  product: 'road-obs';
  slot: string;
  slotMs: number;
  createdAt: string;
  killed: boolean;
  /** Rules running in observe mode while this slot was derived. */
  observe: RoadRuleId[];
  groups: Record<string, RoadGroupState>;
  catalog: { etag: string | null; state: 'ok' | 'stale' | 'missing' };
  source: string;
  points: RoadPoint[];
}

export interface RoadQuarantineEntry {
  id: string;
  g: string;
  field: RoadField | 'station';
  raw: number | string | null;
  rule: RoadRuleId;
  /** true = observe mode: the value was NOT removed ("would reject"). */
  observe?: boolean;
  detail?: string;
}

export interface RoadQuarantineFile {
  schema: 1;
  product: 'road-quarantine';
  slot: string;
  slotMs: number;
  entries: RoadQuarantineEntry[];
}

export interface RoadBalance {
  slot: string;
  values: number;
  rejected: number;
  share: number;
  byRule: Partial<Record<RoadRuleId, number>>;
  observe: Partial<Record<RoadRuleId, number>>;
  flags: Partial<Record<RoadRuleId, number>>;
  byGroup: Record<string, { values: number; rejected: number }>;
}

export interface RoadSlotGate {
  publish: boolean;
  reasons: Array<{ rule: RoadRuleId; detail: string }>;
}

export interface RoadH24File {
  schema: 1;
  product: 'road-h24';
  group: string;
  slot: string;
  /** Stamps oldest → newest (≤ 96). */
  slots: string[];
  /**
   * Per station the valid values per slot (0.1 °C; null = no valid value) and `k`, the station class per slot as one
   * character (`ROAD_CLASS_CODE`, `-` = no point in that slot) — for the backtest of AW-6 (E-AW-6). Rings written
   * before `k` existed lack it; readers treat that as all `-`.
   */
  stations: Record<string, { rs: Array<number | null>; ta: Array<number | null>; td: Array<number | null>; k?: string }>;
}

/** One character per station class in the ring (`-` = no point in the slot). */
export const ROAD_CLASS_CODE = Object.freeze({ ice: 'i', frost: 'f', wet: 'w', dry: 'd', unknown: 'u', nodata: 'n' } as const);
export const ROAD_CLASS_NONE = '-';
const RING_CODE_RE = /^[ifwdun-]*$/;

export const ROAD_SOURCE_TEXT = 'Deutscher Wetterdienst, Glättemeldeanlagen (SWIS) der Länder — opendata.dwd.de, GeoNutzV; verändert: dekodiert, geprüft, umkodiert';

// --- Producer: per-station validation ---------------------------------------------------------

/** One decoded station of a slot, as the producer hands it to the rules (fields of `SwisRecord`, units SI/°C). */
export interface RoadRawStation {
  id: string;
  group: string;
  name: string | null;
  highway: string | null;
  km: number | null;
  lat: number | null;
  lon: number | null;
  elevM: number | null;
  obsMs: number;
  airT: number | null;
  dewT: number | null;
  rh: number | null;
  visM: number | null;
  sensors: Array<{ roadT: number | null; filmMm: number | null; cond: number | null }>;
  windMs: number | null;
  gustMs: number | null;
  windDir: number | null;
  precipType: number | null;
  precipRateMmH: number | null;
  precipMm: number | null;
  /** Intensity of phenomena 0 20 024 (0 = none … 3 = heavy, null = missing) — M3. Absent in callers built before M3. */
  precipIntensity?: number | null;
  quality: number | null;
  /**
   * M6 (`scripts/road/station-positions.mjs`): how `lat`/`lon` were chosen — `posCatalog` = the catalogue position
   * replaces the bulletin's (then `reportPos` = the bulletin's), `posUnverified` = the bulletin's, but neither lies at
   * the station's road. Absent = the bulletin's position as reported.
   */
  posFlag?: 'posCatalog' | 'posUnverified' | null;
  reportPos?: [number, number] | null;
}

/** Catalogue row (static/stations.json) as far as the rules need it. */
export interface RoadCatalogEntry {
  road: string | null;
  dir: string | null;
  lat: number | null;
  lon: number | null;
}

/** Producer state per station (state.json): identical-value runs and last road temperature. */
export interface RoadStationState {
  /** Per watched field (`ta`, `td`, `rs0`, `rs1`, … = road sensor by position): last raw value, run length, stamp. */
  run: Record<string, [number, number, string]>;
  /** Slot stamp of the last observation. */
  last: string;
  /** Coldest plausible road temperature of the last slot (for the jump rule). */
  rs: number | null;
}

export interface RoadState {
  schema: 1;
  slot: string;
  stations: Record<string, RoadStationState>;
}

export interface RoadSlotInput {
  slotMs: number;
  stations: RoadRawStation[];
  catalog: Record<string, RoadCatalogEntry> | null;
  catalogEtag: string | null;
  catalogState: 'ok' | 'stale' | 'missing';
  prev: RoadState | null;
  /** Point-in-Germany test (producer-side outline, `scripts/road/de-outline.geojson`). */
  inDE: (lat: number, lon: number) => boolean;
  /** Optional reference T2m (°C) per station id from the buscosun Fusion cube; missing ⇒ cube rule skipped. */
  cubeT2m?: Record<string, number>;
  groups: Record<string, RoadGroupState>;
  killed?: boolean;
  createdAt?: string;
}

export interface RoadSlotResult {
  obs: RoadObsFile;
  quarantine: RoadQuarantineFile;
  balance: RoadBalance;
  gate: RoadSlotGate;
  state: RoadState;
}

/** Normalises a road designator: `A008` / `A 8` / `A8S` / `A095S` → `A8` / `A95`; `B017N` → `B17`. */
export function normaliseRoad(s: string | null | undefined): { road: string | null; kind: RoadKind; dir: string | null } {
  if (!s) return { road: null, kind: 'other', dir: null };
  const t = s.replace(/\s+/g, '').toUpperCase();
  const m = /^(BAB|A|B|L|S|ST|K)0*(\d{1,3})([A-Z]?)/.exec(t);
  if (!m) return { road: null, kind: 'other', dir: null };
  const pre = m[1] === 'BAB' ? 'A' : m[1];
  const kind: RoadKind = pre === 'A' ? 'A' : pre === 'B' ? 'B' : 'L';
  const dir = /^[NSOWEX]$/.test(m[3]) ? (m[3] === 'E' ? 'O' : m[3]) : null;
  return { road: `${pre}${m[2]}`, kind, dir };
}

function inRange(v: number, [lo, hi]: readonly [number, number]): boolean {
  return v >= lo && v <= hi;
}

const round = (v: number, d: number) => Number(v.toFixed(d));

/** One station as seen by the neighbour statistics (raw values for `roadAir`, valid ones for the `neighbours` rule). */
export interface RoadNeighbourCandidate { id: string; lat: number; lon: number; h: number | null; rs: number | null; ta: number | null }

/**
 * Median and spread of a field over the neighbours of `me` (`ROAD_NEIGHBOUR`: radius, same 300-m elevation class, ≥ 3
 * neighbours; `me` itself excluded). `thr` = max(k·MAD, minAbsK) — the band in which a value counts as "fits".
 */
export function roadNeighbourStat(me: RoadNeighbourCandidate, all: readonly RoadNeighbourCandidate[], field: 'rs' | 'ta'):
  { med: number; mad: number; thr: number; n: number } | null {
  const elevClass = (h: number | null) => (h == null ? -1 : Math.floor(h / ROAD_NEIGHBOUR.elevClassM));
  const cosLat = Math.cos((me.lat * Math.PI) / 180);
  const nb: number[] = [];
  for (const c of all) {
    const v = c[field];
    if (c.id === me.id || v == null || elevClass(c.h) !== elevClass(me.h)) continue;
    const dy = (c.lat - me.lat) * 111.2, dx = (c.lon - me.lon) * 111.2 * cosLat;
    if (dx * dx + dy * dy <= ROAD_NEIGHBOUR.radiusKm ** 2) nb.push(v);
  }
  if (nb.length < ROAD_NEIGHBOUR.minNeighbours) return null;
  nb.sort((a, b) => a - b);
  const med = nb[Math.floor(nb.length / 2)];
  const devs = nb.map((v) => Math.abs(v - med)).sort((a, b) => a - b);
  const mad = Math.max(devs[Math.floor(devs.length / 2)], ROAD_NEIGHBOUR.madFloorK);
  return { med, mad, thr: Math.max(ROAD_NEIGHBOUR.k * mad, ROAD_NEIGHBOUR.minAbsK), n: nb.length };
}

/**
 * The derive's rule engine for one slot: hard rules reject (value → quarantine), observe rules only count,
 * flags mark. Pure: everything it needs comes in `input`, the next producer state goes out.
 */
export function validateRoadSlot(input: RoadSlotInput): RoadSlotResult {
  const stamp = roadStamp(input.slotMs);
  const entries: RoadQuarantineEntry[] = [];
  const balance: RoadBalance = { slot: stamp, values: 0, rejected: 0, share: 0, byRule: {}, observe: {}, flags: {}, byGroup: {} };
  const bump = (o: Partial<Record<RoadRuleId, number>>, r: RoadRuleId) => { o[r] = (o[r] ?? 0) + 1; };
  const nextState: RoadState = { schema: 1, slot: stamp, stations: {} };
  const prevStations = input.prev?.stations ?? {};
  const prevSlotStamp = roadStamp(input.slotMs - ROAD_SLOT_MS);

  // Duplicates: the same station in two series of one slot — the newer observation wins, then the group id.
  const byId = new Map<string, RoadRawStation>();
  const dupFlag = new Set<string>();
  for (const s of input.stations) {
    if (!s.id) continue;
    const o = byId.get(s.id);
    if (!o) { byId.set(s.id, s); continue; }
    dupFlag.add(s.id);
    if (s.obsMs > o.obsMs || (s.obsMs === o.obsMs && s.group < o.group)) byId.set(s.id, s);
  }

  interface Work { raw: RoadRawStation; point: RoadPoint; }
  const work: Work[] = [];

  // M1/M2: the referee of `roadAir` — neighbour medians of the raw road (coldest sensor) and air values, only the
  // placeholder and limit rules applied (the median is robust against the few broken neighbours).
  const nbCands: RoadNeighbourCandidate[] = [];
  for (const s of byId.values()) {
    if (s.lat == null || s.lon == null) continue;
    const ok = (v: number | null, lim: readonly [number, number]) => v != null && v >= ROAD_PLACEHOLDER_C && inRange(v, lim);
    const roads = s.sensors.map((z) => z.roadT).filter((v): v is number => ok(v, ROAD_LIMITS.rs));
    nbCands.push({ id: s.id, lat: s.lat, lon: s.lon, h: s.elevM, rs: roads.length ? Math.min(...roads) : null, ta: ok(s.airT, ROAD_LIMITS.ta) ? s.airT : null });
  }
  const dewSpreadK = ROAD_DEW_SPREAD_K.warmMonths.includes(new Date(input.slotMs).getUTCMonth() + 1) ? ROAD_DEW_SPREAD_K.warm : ROAD_DEW_SPREAD_K.cold;
  const isFill = (v: number | null): v is number => v != null && ROAD_FILL.valuesC.some((f) => Math.abs(v - f) < ROAD_FILL.eps);
  const same = (a: number, b: number) => Math.abs(a - b) < ROAD_FILL.eps;

  for (const s of byId.values()) {
    const grp = (balance.byGroup[s.group] ??= { values: 0, rejected: 0 });
    const o: Partial<Record<RoadField, RoadRuleId>> = {};
    const reject = (field: RoadField | 'station', raw: number | string | null, rule: RoadRuleId, detail?: string) => {
      entries.push({ id: s.id, g: s.group, field, raw, rule, ...(detail ? { detail } : {}) });
      bump(balance.byRule, rule);
    };
    const wouldReject = (field: RoadField | 'station', raw: number | string | null, rule: RoadRuleId, detail?: string) => {
      entries.push({ id: s.id, g: s.group, field, raw, rule, observe: true, ...(detail ? { detail } : {}) });
      bump(balance.observe, rule);
      if (field !== 'station') o[field] ??= rule;
    };

    // Count every delivered value once (denominator of the slot share).
    const delivered: Array<[RoadField, number | null]> = [
      ['ta', s.airT], ['td', s.dewT], ['rh', s.rh], ['vis', s.visM], ['ws', s.windMs], ['wg', s.gustMs], ['wd', s.windDir],
      ['pt', s.precipType], ['pr', s.precipRateMmH], ['pa', s.precipMm],
    ];
    const nDelivered = delivered.filter(([, v]) => v != null).length
      + s.sensors.reduce((a, x) => a + (x.roadT != null ? 1 : 0) + (x.filmMm != null ? 1 : 0) + (x.cond != null ? 1 : 0), 0);
    balance.values += nDelivered;
    grp.values += nDelivered;
    const countRejected = (n: number) => { balance.rejected += n; grp.rejected += n; };

    // Station-level hard rules: position and time. A rejected station takes all its values with it.
    const cat = input.catalog?.[s.id] ?? null;
    if (s.lat == null || s.lon == null || !input.inDE(s.lat, s.lon)) {
      reject('station', s.lat != null && s.lon != null ? `${s.lat},${s.lon}` : null, 'outsideDE');
      countRejected(nDelivered);
      continue;
    }
    if (!Number.isFinite(s.obsMs) || s.obsMs > input.slotMs + ROAD_TIME.futureMs || s.obsMs < input.slotMs - ROAD_TIME.maxAgeMs) {
      reject('station', Number.isFinite(s.obsMs) ? new Date(s.obsMs).toISOString() : null, 'time');
      countRejected(nDelivered);
      continue;
    }
    if (input.catalog && !cat) wouldReject('station', null, 'catalog');

    const q = s.quality;
    const qValid = q != null && q !== DWD_QUALITY_MISSING;
    const suspect = new Set<RoadField>();
    if (qValid) for (const [bit, fields] of Object.entries(DWD_SUSPECT_BITS)) if (dwdBit(q as number, +bit)) for (const f of fields) suspect.add(f);
    // `ok` only when the DWD checked AND flagged nothing (0 33 005 = 0). AW-0: FN-BY sets bits 11+17+28 on every
    // station (no published meaning for our fields) — that is not "nothing found", so it stays `unchecked`.
    const provenance: RoadProvenance = q === 0 ? 'ok' : 'unchecked';

    const x: Partial<Record<RoadField, RoadRuleId>> = {};
    let nRejected = 0;
    const scalar = (field: RoadField, v: number | null, limit: readonly [number, number] | null, isTemp: boolean): number | null => {
      if (v == null) return null;
      if (isTemp && v < ROAD_PLACEHOLDER_C) { reject(field, v, 'placeholder'); x[field] = 'placeholder'; nRejected++; return null; }
      if (limit && !inRange(v, limit)) { reject(field, v, 'limit'); x[field] = 'limit'; nRejected++; return null; }
      if (suspect.has(field)) { reject(field, v, 'dwdSuspect', `0 33 005 = ${q}`); x[field] = 'dwdSuspect'; nRejected++; return null; }
      return v;
    };

    let ta = scalar('ta', s.airT, ROAD_LIMITS.ta, true);
    let td = scalar('td', s.dewT, ROAD_LIMITS.td, true);
    let rh = scalar('rh', s.rh, ROAD_LIMITS.rh, false);
    const vis = scalar('vis', s.visM, ROAD_LIMITS.vis, false);
    const ws = scalar('ws', s.windMs, ROAD_LIMITS.ws, false);
    let wg = scalar('wg', s.gustMs, ROAD_LIMITS.wg, false);
    const wd = scalar('wd', s.windDir, [0, 360], false);
    let pt = s.precipType;
    if (pt != null && suspect.has('pt')) { reject('pt', pt, 'dwdSuspect', `0 33 005 = ${q}`); x.pt = 'dwdSuspect'; nRejected++; pt = null; }
    let pr = scalar('pr', s.precipRateMmH, [0, 500], false);
    const pa = scalar('pa', s.precipMm, [0, 500], false);
    if (td != null && ta != null && td > ta + ROAD_DEW_ABOVE_AIR_K) { reject('td', td, 'dewAboveAir', `Luft ${ta}`); x.td = 'dewAboveAir'; nRejected++; td = null; }
    if (wg != null && ws != null && wg < ws) { reject('wg', wg, 'gustBelowWind', `Wind ${ws}`); x.wg = 'gustBelowWind'; nRejected++; wg = null; }
    // M2: a gust of a storm under a calm mean wind is a broken anemometer channel.
    if (wg != null && ws != null && wg > ROAD_GUST_NO_WIND.gustMs && ws < ROAD_GUST_NO_WIND.windMs) { reject('wg', wg, 'gustNoWind', `Wind ${ws}`); x.wg = 'gustNoWind'; nRejected++; wg = null; }
    // M3: KO-RP/RP-RP send 0.006 kg m⁻² s⁻¹ (21.6 mm/h) with intensity "no phenomena" and no type — a fill value. A rate
    // counts only with an intensity > 0 or a precipitation type. Callers without the field (before M3) are not judged.
    if (pr != null && pr > 0 && s.precipIntensity !== undefined && !(s.precipIntensity != null && s.precipIntensity > 0) && !(pt != null && pt > 0)) {
      reject('pr', pr, 'precipFill', `Intensität ${s.precipIntensity ?? 'fehlt'}, Art ${pt ?? 'fehlt'}`); x.pr = 'precipFill'; nRejected++; pr = null;
    }

    // Road sensors: placeholder, limits, DWD flag per sensor; film and condition alongside.
    const sensors: Array<{ roadT: number | null; filmMm: number | null; cond: number | null }> = [];
    let unknownCode = false;
    for (const sen of s.sensors) {
      let roadT = sen.roadT;
      if (roadT != null && roadT < ROAD_PLACEHOLDER_C) { reject('rs', roadT, 'placeholder'); x.rs = 'placeholder'; nRejected++; roadT = null; }
      else if (roadT != null && !inRange(roadT, ROAD_LIMITS.rs)) { reject('rs', roadT, 'limit'); x.rs = 'limit'; nRejected++; roadT = null; }
      else if (roadT != null && suspect.has('rs')) { reject('rs', roadT, 'dwdSuspect', `0 33 005 = ${q}`); x.rs = 'dwdSuspect'; nRejected++; roadT = null; }
      let film = sen.filmMm;
      if (film != null && !inRange(film, ROAD_LIMITS.wf)) { reject('wf', film, 'limit'); x.wf = 'limit'; nRejected++; film = null; }
      else if (film != null && suspect.has('wf')) { reject('wf', film, 'dwdSuspect'); x.wf = 'dwdSuspect'; nRejected++; film = null; }
      let cond = sen.cond;
      if (cond != null && suspect.has('cond')) { reject('cond', cond, 'dwdSuspect'); x.cond = 'dwdSuspect'; nRejected++; cond = null; }
      if (cond != null && !isKnownCondition(cond)) { unknownCode = true; bump(balance.flags, 'unknownCode'); entries.push({ id: s.id, g: s.group, field: 'cond', raw: cond, rule: 'unknownCode', observe: true }); cond = null; }
      sensors.push({ roadT, filmMm: film, cond });
    }

    // Hanging sensor (hard): run of identical raw values per field and PER ROAD SENSOR (AW-0: K677's second sensor
    // sat at −0.01 °C for the whole window while the first one moved); gaps ≤ 1 h are neutral; plateau exception.
    const prev = prevStations[s.id];
    const contiguous = prev?.last === prevSlotStamp;
    const st: RoadStationState = { run: {}, last: stamp, rs: null };
    const gapSlots = (from: string) => Math.round((input.slotMs - roadStampToMs(from)) / ROAD_SLOT_MS);
    for (const [f, r] of Object.entries(prev?.run ?? {})) if (gapSlots(r[2]) <= ROAD_STUCK_GAP_SLOTS + 1) st.run[f] = r;
    const watch: Array<[string, number | null]> = [['ta', s.airT], ['td', s.dewT], ...s.sensors.map((z, i): [string, number | null] => [`rs${i}`, z.roadT])];
    const stuck = new Set<string>();
    for (const [f, v] of watch) {
      if (v == null || v < ROAD_PLACEHOLDER_C) continue;
      const pr0 = st.run[f];
      const n = pr0 && pr0[0] === v ? pr0[1] + 1 : 1;
      st.run[f] = [v, n, stamp];
      if (n >= ROAD_STUCK_RUN) {
        const plateau = f.startsWith('rs') && v >= ROAD_STUCK_PLATEAU.roadMin && v <= ROAD_STUCK_PLATEAU.roadMax
          && s.airT != null && Math.abs(s.airT) <= ROAD_STUCK_PLATEAU.airAbsMax;
        if (!plateau || n >= ROAD_STUCK_PLATEAU.maxRun) stuck.add(f);
      }
    }
    if (stuck.has('ta') && ta != null) { reject('ta', ta, 'stuck', `${st.run.ta?.[1]} Slots`); x.ta = 'stuck'; nRejected++; ta = null; }
    if (stuck.has('td') && td != null) { reject('td', td, 'stuck', `${st.run.td?.[1]} Slots`); x.td = 'stuck'; nRejected++; td = null; }
    sensors.forEach((sen, i) => {
      if (stuck.has(`rs${i}`) && sen.roadT != null) { reject('rs', sen.roadT, 'stuck', `${st.run[`rs${i}`]?.[1]} Slots`); x.rs = 'stuck'; nRejected++; sen.roadT = null; }
    });

    // M1 fill values: road = air = dew point at exactly 0.00/−1.00 ⇒ all three (P969, P134, J909, O453); a road sensor at a
    // fill value under an air at least 5 K warmer ⇒ that sensor (K677, O932, P285 … and F461's ice code with it).
    if (ta != null && td != null && isFill(ta) && same(ta, td) && sensors.some((z) => z.roadT != null && same(z.roadT, ta as number))) {
      const fv = ta;
      for (const z of sensors) if (z.roadT != null && same(z.roadT, fv)) { reject('rs', z.roadT, 'fillValue', 'Fahrbahn = Luft = Taupunkt'); x.rs = 'fillValue'; nRejected++; z.roadT = null; }
      reject('ta', ta, 'fillValue', 'Fahrbahn = Luft = Taupunkt'); x.ta = 'fillValue'; nRejected++; ta = null;
      reject('td', td, 'fillValue', 'Fahrbahn = Luft = Taupunkt'); x.td = 'fillValue'; nRejected++; td = null;
    }
    for (const z of sensors) {
      if (ta != null && isFill(z.roadT) && ta - z.roadT >= ROAD_FILL.airK) { reject('rs', z.roadT, 'fillValue', `Luft ${ta}`); x.rs = 'fillValue'; nRejected++; z.roadT = null; }
    }

    // M1/M2 road vs. own air (hard): which sensor is broken decides the neighbourhood. Road normal for the area and air
    // not ⇒ the air and its dew point (N443 +41.7 °C); otherwise the road sensor (H637 −25.00 °C). Road far above the air
    // without neighbours to decide stays observed (summer midday not measured).
    if (ta != null) {
      const airT = ta;
      const off = sensors.filter((z) => z.roadT != null && (z.roadT < airT - ROAD_AIR.belowK || z.roadT > airT + ROAD_AIR.aboveK));
      if (off.length) {
        const me = nbCands.find((c) => c.id === s.id);
        const nbRs = me ? roadNeighbourStat(me, nbCands, 'rs') : null;
        const nbTa = me ? roadNeighbourStat(me, nbCands, 'ta') : null;
        const roadFits = (v: number) => nbRs != null && Math.abs(v - nbRs.med) <= nbRs.thr;
        const nbText = `Nachbarn Fahrbahn ${nbRs ? round(nbRs.med, 1) : '–'}, Luft ${nbTa ? round(nbTa.med, 1) : '–'}`;
        if (nbTa != null && Math.abs(airT - nbTa.med) > nbTa.thr && off.every((z) => roadFits(z.roadT as number))) {
          reject('ta', airT, 'roadAir', nbText); x.ta = 'roadAir'; nRejected++; ta = null;
          if (td != null) { reject('td', td, 'roadAir', `Taupunkt desselben Luftfühlers; ${nbText}`); x.td = 'roadAir'; nRejected++; td = null; }
        } else {
          for (const z of off) {
            const v = z.roadT as number;
            if ((nbRs != null && !roadFits(v)) || v < airT - ROAD_AIR.belowK) { reject('rs', v, 'roadAir', `Luft ${airT}; ${nbText}`); x.rs = 'roadAir'; nRejected++; z.roadT = null; }
            else wouldReject('rs', v, 'roadAir', `Luft ${airT}; ${nbText}`);
          }
        }
      }
    }
    // M2: dew point far below the air = broken humidity sensor (after `roadAir`, so a broken AIR does not take it along).
    if (ta != null && td != null && ta - td > dewSpreadK) {
      reject('td', td, 'dewSpread', `Luft ${ta}`); x.td = 'dewSpread'; nRejected++; td = null;
      if (rh != null) { reject('rh', rh, 'dewSpread', `Luft ${ta}`); x.rh = 'dewSpread'; nRejected++; rh = null; }
    }

    // E-AW-11: state and film of a sensor only together with its valid road temperature; ice codes only ≤ +3 °C.
    for (const sen of sensors) {
      if (sen.roadT == null) {
        if (sen.cond != null) { reject('cond', sen.cond, 'stateNoTemp'); x.cond = 'stateNoTemp'; nRejected++; sen.cond = null; }
        if (sen.filmMm != null) { reject('wf', sen.filmMm, 'stateNoTemp'); x.wf = 'stateNoTemp'; nRejected++; sen.filmMm = null; }
      } else if (sen.cond != null && sen.cond >= 3 && sen.cond <= 6 && sen.roadT > ROAD_ICE_MAX_C) {
        reject('cond', sen.cond, 'iceWarm', `Fahrbahn ${sen.roadT}`); x.cond = 'iceWarm'; nRejected++; sen.cond = null;
      }
    }

    // Coldest plausible road temperature, spread flag.
    const roads = sensors.map((z) => z.roadT).filter((v): v is number => v != null);
    const rs = roads.length ? Math.min(...roads) : null;
    const rsHi = roads.length > 1 ? Math.max(...roads) : undefined;
    const flags: string[] = [];
    if (roads.length > 1 && (rsHi as number) - (rs as number) > ROAD_SPREAD_K) { flags.push('spread'); bump(balance.flags, 'spread'); }
    if (dupFlag.has(s.id)) { flags.push('duplicate'); bump(balance.flags, 'duplicate'); }
    if (unknownCode) flags.push('unknownCode');
    if (input.catalog && !cat) flags.push('noCatalog');
    if (s.posFlag) flags.push(s.posFlag);

    // Jump (observe): against the coldest plausible road temperature of the previous slot.
    st.rs = rs;
    if (rs != null && contiguous && prev?.rs != null && Math.abs(rs - prev.rs) > ROAD_JUMP_K) {
      wouldReject('rs', rs, 'jump', `Vorslot ${prev.rs}`);
    }

    // Station class from the station's values (E-AW-9): coldest plausible road, largest film, most severe
    // condition code — conservative, and exactly re-derivable by the client from the published fields.
    const wfs = sensors.map((z) => z.filmMm).filter((v): v is number => v != null);
    const wf = wfs.length ? Math.max(...wfs) : null;
    const cond = mostSevereCondition(sensors.map((z) => z.cond));
    const cls = classifySensor({ roadT: rs, dewT: td, filmMm: wf, cond });

    const norm = normaliseRoad(s.highway);
    const catNorm = normaliseRoad(cat?.road ?? null);
    const road = norm.road ?? catNorm.road;
    const kind = norm.road ? norm.kind : catNorm.kind;
    const point: RoadPoint = {
      id: s.id, g: s.group, n: s.name ?? s.id, lat: round(s.lat, 5), lon: round(s.lon, 5), h: s.elevM,
      road, kind, dir: catNorm.dir ?? norm.dir, km: s.km, t: s.obsMs, cls, q: provenance,
      rs, ...(rsHi !== undefined ? { rsHi } : {}), ns: roads.length,
      ta, td, rh, vis, wf, cond, ws, wg, wd, pt, pr, pa,
      ...(flags.length ? { f: flags } : {}),
      ...(s.posFlag === 'posCatalog' && s.reportPos ? { rpos: [round(s.reportPos[0], 5), round(s.reportPos[1], 5)] as [number, number] } : {}),
      ...(Object.keys(x).length ? { x } : {}),
      ...(Object.keys(o).length ? { o } : {}),
      ...(qValid ? { qf: q as number } : {}),
    };
    countRejected(nRejected);
    nextState.stations[s.id] = st;
    work.push({ raw: s, point });
  }

  // Stations absent from this slot keep their runs for ≤ 1 h (a missing slot is neutral, see ROAD_STUCK_GAP_SLOTS).
  for (const [id, ps] of Object.entries(prevStations)) {
    if (!nextState.stations[id] && Math.round((input.slotMs - roadStampToMs(ps.last)) / ROAD_SLOT_MS) <= ROAD_STUCK_GAP_SLOTS) nextState.stations[id] = ps;
  }

  // Station rules on the whole slot (observe): neighbours and buscosun Fusion T2m. A hit marks the kept value (`o`, M2).
  const mark = (p: RoadPoint, field: RoadField, rule: RoadRuleId) => { (p.o ??= {})[field] ??= rule; };
  const withRoad = work.filter((w) => w.point.rs != null);
  const valid: RoadNeighbourCandidate[] = withRoad.map((w) => ({ id: w.point.id, lat: w.point.lat, lon: w.point.lon, h: w.point.h, rs: w.point.rs, ta: null }));
  valid.forEach((c, i) => {
    const p = withRoad[i].point;
    const nb = roadNeighbourStat(c, valid, 'rs');
    if (!nb || Math.abs((p.rs as number) - nb.med) <= nb.thr) return;
    entries.push({ id: p.id, g: p.g, field: 'rs', raw: p.rs, rule: 'neighbours', observe: true, detail: `Median ${round(nb.med, 2)}, MAD ${round(nb.mad, 2)}, n ${nb.n}` });
    bump(balance.observe, 'neighbours');
    mark(p, 'rs', 'neighbours');
  });
  if (input.cubeT2m) {
    for (const w of work) {
      const ref = input.cubeT2m[w.point.id];
      if (ref == null || w.point.ta == null) continue;
      if (Math.abs(w.point.ta - ref) > ROAD_CUBE_MAX_K) {
        entries.push({ id: w.point.id, g: w.point.g, field: 'ta', raw: w.point.ta, rule: 'cube', observe: true, detail: `T2m ${round(ref, 1)}` });
        bump(balance.observe, 'cube');
        mark(w.point, 'ta', 'cube');
      }
    }
  }

  balance.share = balance.values ? balance.rejected / balance.values : 0;
  const killed = !!input.killed;
  const points = killed ? [] : work.map((w) => w.point).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const obs: RoadObsFile = {
    schema: 1, product: 'road-obs', slot: stamp, slotMs: input.slotMs, createdAt: input.createdAt ?? new Date().toISOString(),
    killed, observe: (Object.values(ROAD_RULES) as RoadRule[]).filter((r) => r.mode === 'observe').map((r) => r.id),
    groups: input.groups,
    catalog: { etag: input.catalogEtag, state: input.catalogState },
    source: ROAD_SOURCE_TEXT,
    points,
  };

  // Slot lock (hard): active series and rejected share; the schema round trip runs in the derive after writing.
  const reasons: RoadSlotGate['reasons'] = [];
  // Only regular series count against the baseline — the sporadic SD-BW must not mask a missing state.
  const sporadic = new Set(ROAD_GROUPS.filter((g) => g.sporadic).map((g) => g.id));
  const active = Object.entries(input.groups).filter(([id, g]) => g.state === 'ok' && !sporadic.has(id)).length;
  if (active < ROAD_SLOT_BASELINE - ROAD_SLOT_TOLERANCE) reasons.push({ rule: 'slotGroups', detail: `${active} aktive Reihen < ${ROAD_SLOT_BASELINE} − ${ROAD_SLOT_TOLERANCE}` });
  if (balance.share > ROAD_SLOT_MAX_REJECT_SHARE) reasons.push({ rule: 'slotShare', detail: `${(balance.share * 100).toFixed(1)} % verworfen > ${ROAD_SLOT_MAX_REJECT_SHARE * 100} %` });

  return {
    obs,
    quarantine: { schema: 1, product: 'road-quarantine', slot: stamp, slotMs: input.slotMs, entries },
    balance,
    gate: { publish: reasons.length === 0, reasons },
    state: nextState,
  };
}

// --- Client: validators ------------------------------------------------------------------------

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || isNum(v);

/** Re-derives the class from the published values (drift guard: one rule, two consumers). */
export function roadPointClass(p: Pick<RoadPoint, 'rs' | 'td' | 'wf' | 'cond'>): RoadClass {
  return classifySensor({ roadT: p.rs, dewT: p.td, filmMm: p.wf, cond: p.cond });
}

/** Client check of ONE point: types, ranges of the hard rules, class consistency. False ⇒ the point is not shown. */
export function roadPointOk(p: unknown): p is RoadPoint {
  if (!p || typeof p !== 'object') return false;
  const o = p as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id || typeof o.g !== 'string' || typeof o.n !== 'string') return false;
  if (!isNum(o.lat) || !isNum(o.lon) || !isNum(o.t) || !numOrNull(o.h) || !numOrNull(o.km)) return false;
  if (o.q !== 'ok' && o.q !== 'unchecked') return false;
  for (const f of ROAD_FIELDS) if (!numOrNull(o[f])) return false;
  const lim = (f: keyof typeof ROAD_LIMITS) => o[f] == null || inRange(o[f] as number, ROAD_LIMITS[f]);
  if (!lim('rs') || !lim('ta') || !lim('td') || !lim('rh') || !lim('ws') || !lim('wg') || !lim('wf') || !lim('vis')) return false;
  if (o.cond != null && !isKnownCondition(o.cond as number)) return false;
  if (typeof o.cls !== 'string' || !isNum(o.ns)) return false;
  if (o.rpos !== undefined && !(Array.isArray(o.rpos) && o.rpos.length === 2 && isNum(o.rpos[0]) && isNum(o.rpos[1]))) return false;
  if (o.qf !== undefined && !(isNum(o.qf) && Number.isInteger(o.qf) && o.qf >= 0 && o.qf < 2 ** 30)) return false;
  if (o.o !== undefined) {
    if (!o.o || typeof o.o !== 'object' || Array.isArray(o.o)) return false;
    for (const [f, r] of Object.entries(o.o as Record<string, unknown>)) {
      if (!(ROAD_FIELDS as readonly string[]).includes(f) || typeof r !== 'string' || !(r in ROAD_RULES)) return false;
    }
  }
  return roadPointClass(o as unknown as RoadPoint) === o.cls;
}

/** Client check of a slot file; null ⇒ "no data" (never a half-trusted slot). Invalid points are dropped, counted. */
export function parseRoadObs(j: unknown): (RoadObsFile & { dropped: number }) | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (o.schema !== 1 || o.product !== 'road-obs' || typeof o.slot !== 'string' || !isNum(o.slotMs)) return null;
  if (roadStampToMs(o.slot) !== o.slotMs || typeof o.killed !== 'boolean' || !Array.isArray(o.points)) return null;
  if (!o.groups || typeof o.groups !== 'object') return null;
  const points = (o.points as unknown[]).filter(roadPointOk);
  return { ...(o as unknown as RoadObsFile), points, dropped: (o.points as unknown[]).length - points.length };
}

export function parseRoadH24(j: unknown): RoadH24File | null {
  if (!j || typeof j !== 'object') return null;
  const o = j as Record<string, unknown>;
  if (o.schema !== 1 || o.product !== 'road-h24' || typeof o.group !== 'string' || typeof o.slot !== 'string') return null;
  if (!Array.isArray(o.slots) || !o.stations || typeof o.stations !== 'object') return null;
  const n = (o.slots as unknown[]).length;
  if (n > ROAD_H24_SLOTS || !(o.slots as unknown[]).every((s) => typeof s === 'string' && Number.isFinite(roadStampToMs(s)))) return null;
  for (const v of Object.values(o.stations as Record<string, unknown>)) {
    const r = v as Record<string, unknown>;
    for (const f of ['rs', 'ta', 'td'] as const) {
      if (!Array.isArray(r?.[f]) || (r[f] as unknown[]).length !== n || !(r[f] as unknown[]).every(numOrNull)) return null;
    }
    if (r.k !== undefined && (typeof r.k !== 'string' || r.k.length !== n || !RING_CODE_RE.test(r.k))) return null;
  }
  return o as unknown as RoadH24File;
}

/** Exact JSON round trip of a written slot file through the client check (slot rule `slotSchema`). */
export function roadObsRoundTripOk(obs: RoadObsFile): boolean {
  const back = parseRoadObs(JSON.parse(JSON.stringify(obs)));
  return !!back && back.dropped === 0 && back.points.length === obs.points.length;
}
