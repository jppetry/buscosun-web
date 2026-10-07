/**
 * fusionRelease.ts — the ONE register of the stands of buscosun Fusion (stage `fs`). Import-free on purpose: the engine
 * (`cubeSource.ts`), the producers (`scripts/road/road-forecast.mjs`, `scripts/point/build-point-fields.mjs`), the pages
 * and the verifiers read the same list, so a new stand is ONE entry here (plus the engine option it switches) and every
 * part of the platform follows by itself. Diagnosis and rules: `audit/fusion-release.md`.
 *
 * Naming rule (Jan 05.10.2026): one number everywhere — every part that computes the stage is named after the newest
 * stand; where an input of a stand is missing at a part (no measurement, no radar) the part says so in its own words.
 * A data product names the stand it was BUILT with (`engine.name` / `engine.version` in the file), never the stand of
 * the code that reads it. `verify:fusion-release` fails on a fixed number or a hand-copied option list outside this file.
 */

/**
 * buscosun Fusion 7 (E-AX-14, Jan 01.10.2026): the stage `fs` damps the wind anchor over the distance of the measurement with
 * e^(−(d / 10 km)²) (`FuseCubeOptions.anchorWindKm`). Measured against buscosun Fusion 6 on the archive 16.–30.09.2026 (405 810
 * rows, 14 issue days, 389 station points; `audit/fusion-ausbau.md` §6i): nowhere significantly worse, wind/gust 0–6 h without a
 * station +0,5/+0,6 %*, with a station byte-identical. Fusion 7 = Fusion 6 (tables of data-repo commit 1aaec969 unchanged) + this.
 */
export const FUSION7_ANCHOR_WIND_KM = 10;
/**
 * buscosun Fusion 8 (E-AX-17, Jan 02.10.2026 22:30 UTC: „sofort aktiv schalten … diesen Stand ab jetzt buscosun Fusion 8 nennen"): the stage `fs`
 * takes the radar member of an hour as the HOUR MEAN of the 5-min frames in (t − 60 min, t] (`FuseCubeOptions.nowcastHourMean`, V-AX-23),
 * read with ONE fetch per hour from the mirror product `m<lead>.png` (E-AX-16, `CubeIo.nowcastHourMean`). Measured against buscosun
 * Fusion 7 on the archive 16.09.–01.10.2026 (446 141 rows, 15 issue days, 389 station points; `audit/fusion-ausbau.md` §6l.4/§6m.3, rule
 * frozen before the build): Brier at 1–2 h +9,8 %* (station) / +11,8 %* (no station), 0–6 h +2,7/+3,1 %*, DE hits 0,33 → 0,52, nowhere
 * worse, every other variable and lead byte-identical (K11/K14). Fusion 8 = Fusion 7 (tables of data-repo commit 1aaec969 unchanged) + this.
 * Until the mirror carries `m<lead>.png` for a slot the engine sees one frame per hour and computes exactly Fusion 7. `?hm=0` = Fusion 7.
 */
export const FUSION8_NOWCAST_HOUR_MEAN = true;
/**
 * buscosun Fusion 9 (V-AW-33, Jan 04.10.2026: „ja schalte es default mäßig ein"): the stage `fs` compares a measurement with the model
 * value at the MINUTE of the measurement (`FuseCubeOptions.anchorAtObsTime`, linear between the two axis steps around it) instead of
 * the value of the first step within ±30 min. Not measured on the archive (it carries hourly values); measured at the road stations
 * (anchor gain +30 % with a measurement of 16:00 against +1 % with one of 16:30). A measurement on the full hour and every point
 * without a measurement compute exactly Fusion 8. Fusion 9 = Fusion 8 (tables of data-repo commit 1aaec969 unchanged) + this.
 * `CubeIo.anchorAtObsTime: false` (`?anc=0`) = Fusion 8.
 */
export const FUSION9_ANCHOR_AT_OBS_TIME = true;
/**
 * buscosun Fusion 10 (phase F10, autonomous session 07.10.2026, `audit/fusion-10.md`; status KANDIDAT until Jan's champion
 * decision after ≥ 4 mature track-P days): the stage `fs` leads the long range back to the climatology — for leads > 48 h the
 * fused distributions of T, Td, wind speed and gust are blended moment-true towards the engine's own climatology with weights
 * and a σ scale per variable × lead bin (`FuseCubeOptions.longRange`, module `longRange.ts`), FITTED on hindcast slots outside
 * the vault (2025-09-08 … 2026-09-21, 00 UTC, every third day; the development set of the bench was not used for the fit).
 * Evidence (development set, role B, CRPS skill vs station climatology before Fusion 10): wind 120–240 h −17 %, 240–336 h −54 %,
 * T 240–336 h +9,6 % with coverage 63 %. Measured on the bench: see the register entry `scripts/pruefstand/register/fusion-10.json`
 * and `audit/fusion-10.md` §3. Fusion 10 = Fusion 9 (tables of data-repo commit 1aaec969 unchanged) + this. Value 0 = Fusion 9.
 */
export const FUSION10_LONG_RANGE: 0 | 1 = 1;

/** The `CubeIo` fields a stand can be taken back with (`false` = the named fallback to the stand before). */
export type FusionIoSwitch = 'nowcastHourMean' | 'anchorAtObsTime';

export interface FusionRelease {
  /** The number of the stand: „buscosun Fusion <n>". Ascending, without gaps. */
  n: number;
  /** Jan's ruling (ISO date) and where it is written down. */
  date: string;
  ref: string;
  /** The `FuseCubeOptions` entry this stand adds to the stage. A `false`/`0` value = the stand is defined but not switched. */
  option: string;
  value: number | boolean;
  /** What the stage note says when the stand is on. */
  note: string;
  /**
   * The `CubeIo` field that takes this stand back (`io[key] === false`) and, with `set`, the value a caller of the stage
   * must put into its `CubeIo` so the READER fetches what the stand needs (the hour-mean product of the mirror).
   */
  io?: { key: FusionIoSwitch; set?: true; flag: string };
  /** Words behind the number of the stand before when this one is switched off (kept from the wording of 02.10.). */
  offLabel?: string;
  /** The input without which this stand computes exactly the stand before — named by parts that lack it. */
  needs?: 'measurement' | 'radar';
}

/** The stands since the frozen „buscosun Fusion 6" (data-repo commit 1aaec969), oldest first. A new stand = a new entry at the end. */
export const FUSION_RELEASES: readonly FusionRelease[] = Object.freeze([
  {
    n: 7, date: '2026-10-01', ref: 'E-AX-14, audit/fusion-ausbau.md §6i',
    option: 'anchorWindKm', value: FUSION7_ANCHOR_WIND_KM,
    note: `Wind-Anker über die Messdistanz gedämpft (${FUSION7_ANCHOR_WIND_KM} km, E-AX-14)`, needs: 'measurement',
  },
  {
    n: 8, date: '2026-10-02', ref: 'E-AX-17, audit/fusion-ausbau.md §6l.4/§6m',
    option: 'nowcastHourMean', value: FUSION8_NOWCAST_HOUR_MEAN,
    note: 'Radar-Stundenmittel (E-AX-17)', io: { key: 'nowcastHourMean', set: true, flag: '?hm=0' },
    offLabel: 'Stundenmittel per Schalter aus', needs: 'radar',
  },
  {
    n: 9, date: '2026-10-04', ref: 'V-AW-33, audit/autobahnwetter.md',
    option: 'anchorAtObsTime', value: FUSION9_ANCHOR_AT_OBS_TIME,
    note: 'Anker am Messzeitpunkt (V-AW-33)', io: { key: 'anchorAtObsTime', flag: '?anc=0' }, needs: 'measurement',
  },
  {
    n: 10, date: '2026-10-07', ref: 'Phase F10, audit/fusion-10.md (Kandidat, Champion-Entscheidung = Jan)',
    option: 'longRange', value: FUSION10_LONG_RANGE,
    note: 'Langfrist zur Klimatologie zurückgeführt (> 48 h, gefittete Gewichte je Größe und Vorlauf-Bin, F10)',
  },
] as const);

/** The stand the stage rests on: buscosun Fusion 6 — its options, set by the stage with the learned tables. */
export const FUSION_BASE = 6;
export const FUSION_BASE_OPTIONS = Object.freeze({ learnedSpeed: true, learnedPrecip: true, learnedAtPoint: true, learnedClouds: true, priorShrink: false } as const);
export const FUSION_BASE_NOTE = 'Lernstufe mit learnedSpeed, learnedPrecip, learnedAtPoint, learnedClouds, ohne Klimatologie-Schritt';

const isOn = (r: FusionRelease): boolean => r.value !== false && r.value !== 0;

export const FUSION_BRAND = 'buscosun Fusion';
/** The newest stand that is switched on in the code — the number every part of the platform is named after. */
export const FUSION_CURRENT: number = FUSION_RELEASES.reduce((n, r) => (isOn(r) && r.n === n + 1 ? r.n : n), FUSION_BASE);
export const fusionName = (n: number): string => `${FUSION_BRAND} ${n}`;
export const FUSION_NAME = fusionName(FUSION_CURRENT);

export interface FusionStage {
  /** The stand actually computed: the newest one below which nothing is switched off. */
  version: number;
  /** „buscosun Fusion 9", or „buscosun Fusion 7 (Stundenmittel per Schalter aus)" behind a switch. */
  label: string;
  /** The `FuseCubeOptions` of the stage: base (Fusion 6) plus every stand that is on, in the order of the stands. */
  options: Record<string, number | boolean>;
  /** The stage note behind the label (base, then one fragment per stand that is on). */
  note: string;
  current: boolean;
}

/**
 * The stage `fs` as it is computed. `off(r)` = this stand is taken back by the caller (the engine asks its `CubeIo`:
 * `io[r.io.key] === false`). A stand that is off does not hide the later ones (their options still apply — the wording
 * and behaviour of `?hm=0` since 04.10.), but the label is the number below the first one that is off.
 */
export function fusionStage(off: (r: FusionRelease) => boolean = () => false): FusionStage {
  const options: Record<string, number | boolean> = { ...FUSION_BASE_OPTIONS };
  const notes: string[] = [FUSION_BASE_NOTE];
  let version = FUSION_BASE, firstOff: FusionRelease | null = null;
  for (const r of FUSION_RELEASES) {
    const on = isOn(r) && !off(r);
    if (on) { options[r.option] = r.value; notes.push(r.note); if (!firstOff && r.n === version + 1) version = r.n; }
    else firstOff ??= r;
  }
  const label = `${fusionName(version)}${firstOff?.offLabel ? ` (${firstOff.offLabel})` : ''}`;
  return { version, label, options, note: notes.join(', '), current: version === FUSION_CURRENT };
}

/** The `CubeIo` entries of the newest stage for a caller outside the browser default (producers): tables, stage, reader switches. */
export function fusionStageIo(): { learnedSource: 'json'; climaSource: 'json'; stackSource: 'json'; stage: 'fs' } & Partial<Record<FusionIoSwitch, true>> {
  const io: { learnedSource: 'json'; climaSource: 'json'; stackSource: 'json'; stage: 'fs' } & Partial<Record<FusionIoSwitch, true>> = { learnedSource: 'json', climaSource: 'json', stackSource: 'json', stage: 'fs' };
  for (const r of FUSION_RELEASES) if (isOn(r) && r.io?.set) io[r.io.key] = true;
  return io;
}

/** The stage note of the engine starts with this; `fusionStageNote` writes it, `fusionVersionOfNotes` reads it. */
export const FUSION_STAGE_NOTE_PREFIX = 'stage:fs — neueste Stufe (';
export const fusionStageNote = (s: FusionStage, tail: string): string => `${FUSION_STAGE_NOTE_PREFIX}${s.label}): ${s.note}${tail}`;

/** The stand a forecast was computed with, read from its notes — `null`: computed without the stage (no learned tables). */
export function fusionVersionOfNotes(notes: readonly string[]): number | null {
  for (const n of notes) {
    if (!n.startsWith(FUSION_STAGE_NOTE_PREFIX + FUSION_BRAND + ' ')) continue;
    const v = parseInt(n.slice(FUSION_STAGE_NOTE_PREFIX.length + FUSION_BRAND.length + 1), 10);
    if (Number.isInteger(v)) return v;
  }
  return null;
}

/** The stand of a data product from its engine block (`version`, else the number in `name`) — `null` when it names none. */
export function fusionVersionOfEngine(engine: { name?: unknown; version?: unknown } | null | undefined): number | null {
  if (typeof engine?.version === 'number' && Number.isInteger(engine.version)) return engine.version;
  const m = typeof engine?.name === 'string' ? /^buscosun Fusion (\d+)$/.exec(engine.name) : null;
  return m ? Number(m[1]) : null;
}

/** Is a published product behind the code? `true` ⇒ the next producer run must not be skipped as a repeat. */
export const fusionProductBehind = (engine: { name?: unknown; version?: unknown } | null | undefined): boolean => fusionVersionOfEngine(engine) !== FUSION_CURRENT;

/**
 * The parts of the platform that used to call the live path and reach buscosun Fusion through the entry
 * `getFusionForecast(opts, part)` (`fusionForecast.ts`, phase FR-2, `audit/fusion-release.md` §8). A part that is `on` computes
 * the newest stand of the stage `fs` (cube, radar, measurement, DWD UV in DE); a part that is off calls the live path exactly as
 * before. E-FR-3 (Jan 06.10.2026): every part is switched on after its measurement (§8.4), not before. A new stand needs nothing
 * here — every part that is on follows it by itself; a new part is a new line. `?pf=cube` / `?pf=live` force all parts.
 */
export type FusionPartId = 'route' | 'event' | 'section' | 'notify';
export interface FusionPart { id: FusionPartId; name: string; on: boolean; ref: string }
export const FUSION_PARTS: readonly FusionPart[] = Object.freeze([
  // E-FR-7 (Jan 06.10.2026: „nutze es einfach, die Zeit ist erstmal nicht so wichtig"): on despite K2 cold (+0,7 s, §8.6).
  // E-FR-5 (Jan 07.10.2026, option a): an hour without a wind direction (V-FR-5) stays without one in every part — no arrow,
  // „keine Richtung", no head-/tailwind in the tour time; never read as 0° = north (§8.11).
  // E-FR-6 (Jan 07.10.2026: load time irrelevant as long as it does not get extreme): event and notifications on together, so
  // that a notification and the event page rate the days from the same forecast.
  { id: 'route', name: 'Routenplaner', on: true, ref: 'audit/fusion-release.md §8.10' },
  { id: 'event', name: 'Eventplaner', on: true, ref: 'audit/fusion-release.md §8.11' },
  { id: 'section', name: 'Vertikalschnitt / 3D / Föhn', on: true, ref: 'audit/fusion-release.md §8.11' },
  { id: 'notify', name: 'Benachrichtigungen', on: true, ref: 'audit/fusion-release.md §8.11' },
] as const);
export const fusionPartOn = (id: FusionPartId): boolean => FUSION_PARTS.find((p) => p.id === id)?.on === true;

/** Which path actually delivered a set of forecasts of a part: the cube (`fc.cube` set), the live path (off, `?pf=live` or
 *  its fallback after an error) or both. null when none arrived. Read by the texts that name the origin (V-FR-10). */
export type FusionSource = 'fusion' | 'live' | 'mixed';
export function fusionSourceOf(fcs: ReadonlyArray<{ cube?: unknown } | null | undefined>): FusionSource | null {
  const got = fcs.filter((f): f is { cube?: unknown } => f != null);
  if (!got.length) return null;
  const cube = got.filter((f) => f.cube != null).length;
  return cube === got.length ? 'fusion' : cube === 0 ? 'live' : 'mixed';
}

/** The origin as the page says it: the stand of buscosun Fusion the client computed, or the live path that stood in for it. */
export function fusionSourceText(src: FusionSource | null | undefined): string {
  if (src === 'fusion') return FUSION_NAME;
  if (src === 'live') return 'Live-Punktvorhersage';
  if (src === 'mixed') return `${FUSION_NAME} + Live-Punktvorhersage (Rückfall)`;
  return FUSION_BRAND;
}
