/**
 * Phase GO — contract of the station measurements next to "Wetter am Gletscher" (`audit/gletscher-stationen.md`): the networks of
 * Land Tirol (LWD Tirol, HD Tirol; CC BY 4.0) and of the Province of Bolzano (CC0), plus the already mirrored 10-min stations of
 * `obs/v1` (DWD, TAWES, SwissMetNet) for the glaciers they stand next to. DOM-free and import-light: producer
 * (`scripts/glacier/stations.mjs`), verifier and page share it.
 *
 * Where it lives — a line of its own inside the glacier store, NOT in `obs/v1`:
 *   glacier/v1/stn/stations.json        catalogue of the two networks (shape of `obs/v1/stations.json`)
 *   glacier/v1/stn/h/<slot>.json        the values of one run, every 30 min (shape of `obs/v1/latest.json` per station; slot =
 *                                       `yyyymmddhh` or `yyyymmddhh30`); written once, kept 72 h
 *   glacier/v1/stn/map/<file>.json      glacier → nearest station per quantity, with distance and elevation difference
 * and the pointer `index.stations` of `glacier/v1/index.json`.
 *
 * buscosun Fusion reads measurements from `obs/v1/` only (`src/sources/obsStore.ts`). Nothing below `stn/` is read by it, and this
 * module is imported by nothing in `src/pointForecast`, `src/point` or `src/sources` (`verify:glacier-stations` proves both, with a
 * negative control).
 *
 * Honesty rules encoded here:
 *  - the raw data of both networks is unvalidated: every value passes named limits, a jump check and a stuck check against the
 *    station's own previous readings, and a maximum age. A value that fails is NOT in the document (it is listed under `rejected`);
 *  - only the licensed operators are read: the OGD file of Land Tirol, or — as a fallback — the Euregio feed filtered to the
 *    operators `HD Tirol` and `LWD Tirol…`. Any other operator is dropped before anything is stored;
 *  - units are the fixed units of `obs/v1` (°C, %, m/s, °, cm, W/m², mm); the Tirol file's km/h are converted, nothing else is changed;
 *  - a station stands on rock or on a ridge, not on the ice (`GLACIER_STN_SITE_NOTE`); a measurement never replaces a model value.
 *
 * Phase GI (`audit/gletscher-imis.md`) — a further network and two rules:
 *  - `imis:` = the IMIS stations of the WSL Institute for Snow and Avalanche Research SLF (CC BY 4.0), read by the pipeline only
 *    (two requests per run, `IMIS_MAX_REQUESTS_PER_RUN`), never by the page. Half-hour means, rounded to the product's resolution.
 *    Not taken: precipitation (unheated gauges) and new snow (`HN_1D` is modelled by SNOWPACK, not measured);
 *  - the distance of the mapping is measured to the glacier's OUTLINE (0 on the ice), not to its single catalogue point;
 *  - `hsd` = the change of the snow depth over 24/48/72 h as a network delivers it (Land Tirol) — a measured difference, never a
 *    model value and never derived here.
 * Everything added since phase GO lives in a section `ext` of the same three documents (catalogue, slot document, mapping). The
 * sections of phase GO keep exactly the networks and quantities of phase GO: a page or a producer from before phase GI validates
 * and reads only those (its validator rejects an unknown network or quantity there) and stays correct.
 */
import { GLACIER_BUILD_RE } from './glacierContract';

const MIN = 60_000, HOUR = 3_600_000;

// --- Paths ---------------------------------------------------------------------------------------------------------------------------------

export const GLACIER_STN_DIR = 'stn';
export const GLACIER_STN_CATALOG_PATH = `${GLACIER_STN_DIR}/stations.json`;
/**
 * One run every 30 minutes (Jan 21.11.2026). A slot is a full hour or its second half; a document is named after its slot:
 * `yyyymmddhh` for the full hour — the name every file has had since the first run, and the only one a page from before the
 * half-hour step reads — and `yyyymmddhh30` for the half. As strings the keys sort by time.
 */
export const GLACIER_STN_SLOT_MIN = 30;
export const GLACIER_STN_HOUR_RE = /^\d{10}$/;
export const GLACIER_STN_SLOT_RE = /^\d{10}(30)?$/;
export const glacierStnHourPath = (slot: string) => `${GLACIER_STN_DIR}/h/${slot}.json`;
/** `<static build>.<revision>` — a new revision is a new file name, so a published map never changes under its name. */
export const GLACIER_STN_MAP_RE = /^(\d{8}-\d+)\.(\d+)$/;
export const glacierStnMapPath = (file: string) => `${GLACIER_STN_DIR}/map/${file}.json`;
/** Slot files stay this long in the data repo (the archive in `buscosun-archiv` keeps one per hour for good). */
export const GLACIER_STN_KEEP_MS = 72 * HOUR;
/** Slot key of a time (UTC): `yyyymmddhh` in the first half of the hour, `yyyymmddhh30` in the second. */
export const stnSlotOf = (ms: number): string => {
  const d = new Date(Math.floor(ms / (GLACIER_STN_SLOT_MIN * MIN)) * GLACIER_STN_SLOT_MIN * MIN);
  const hour = d.toISOString().slice(0, 13).replace(/[-T]/g, '');
  return d.getUTCMinutes() ? `${hour}${GLACIER_STN_SLOT_MIN}` : hour;
};
/** Start of a slot (ms). */
export const stnSlotMs = (slot: string): number => Date.UTC(+slot.slice(0, 4), +slot.slice(4, 6) - 1, +slot.slice(6, 8), +slot.slice(8, 10), slot.length > 10 ? +slot.slice(10) : 0);
/** The full hour a slot belongs to (`yyyymmddhh`). */
export const stnSlotHour = (slot: string): string => slot.slice(0, 10);

// --- Networks and sources ------------------------------------------------------------------------------------------------------------------

export const TIROL_OGD_URL = 'https://lawine.tirol.gv.at/data/produkte/ogd.geojson';
export const TIROL_FEED_URL = 'https://static.avalanche.report/weather_stations/stations.geojson';
export const BZ_BASE_URL = 'https://geoservices.buergernetz.bz.it/services/meteo/v1';

/** Phase GI: the SLF service (terms: https://www.slf.ch/en/services-and-products/slf-data-service/). Never called by the page. */
export const IMIS_BASE_URL = 'https://measurement-api.slf.ch/public/api/imis';
/** All active IMIS stations (31 KB). */
export const IMIS_STATIONS_URL = `${IMIS_BASE_URL}/stations`;
/** The last 24 h of EVERY station in one answer, one row per station and half hour (3.3 MB, 0.4 MB on the wire). */
export const IMIS_MEASUREMENTS_URL = `${IMIS_BASE_URL}/measurements`;
/** What one run asks the SLF service for when nothing fails. */
export const IMIS_REQUESTS_PER_RUN = 2;
/** Hard cap of requests to the SLF service per run, retries included (set; the service is not built to feed customer systems). */
export const IMIS_MAX_REQUESTS_PER_RUN = 4;
/** Pause before the ONE retry of a failed SLF request (set). */
export const IMIS_RETRY_PAUSE_MS = 20_000;
export const IMIS_OPERATOR = 'WSL-Institut für Schnee- und Lawinenforschung SLF';

export type StnNet = 'tirol' | 'bz' | 'obs' | 'imis';
export interface GlacierStnSource {
  id: StnNet; label: string; note: string; licence: string; licenceUrl: string; url: string; changes: string;
  /** Link the operator's name carries in the card (SLF asks for a clearly visible reference, online as a link to www.slf.ch). */
  operatorUrl?: string;
}
/** The source notes of the feature. `note` is the fixed wording shown on the page. */
export const GLACIER_STN_SOURCES: readonly GlacierStnSource[] = Object.freeze([
  {
    id: 'tirol', label: 'Wetterstationsdaten Tirol (Lawinenwarndienst Tirol, Hydrographischer Dienst Tirol)', note: 'Datenquelle: Land Tirol - data.tirol.gv.at',
    licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', url: 'https://www.data.gv.at/datasets/bb43170b-30fb-48aa-893f-51c60d27056f',
    changes: 'Wind und Böen von km/h in m/s umgerechnet; Werte außerhalb benannter Grenzen, mit Sprung oder Stillstand und Werte älter als drei Stunden weggelassen',
  },
  {
    id: 'bz', label: 'Wetterdaten der Messstationen Südtirols', note: 'Autonome Provinz Bozen – Südtirol',
    licence: 'CC0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', url: 'https://data.civis.bz.it/de/dataset/misure-meteo-e-idrografiche',
    changes: 'Niederschlag der 5-min-Werte zu Summen addiert; Werte außerhalb benannter Grenzen, mit Sprung oder Stillstand und Werte älter als drei Stunden weggelassen',
  },
  {
    id: 'obs', label: 'Messnetze DWD, GeoSphere Austria (TAWES) und MeteoSchweiz (SwissMetNet)', note: 'DWD · GeoSphere Austria · MeteoSchweiz',
    licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', url: 'https://github.com/jppetry/buscosun-data/tree/main/obs/v1',
    changes: 'aus dem Messspiegel von buscosun übernommen, Werte unverändert',
  },
  {
    id: 'imis', label: 'IMIS-Messstationen (Interkantonales Mess- und Informationssystem)', note: IMIS_OPERATOR,
    licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', url: 'https://www.slf.ch', operatorUrl: 'https://www.slf.ch',
    changes: 'Halbstundenmittel auf die Auflösung des Produkts gerundet (0,1 °C, 0,1 %, 0,01 m/s, 0,1 cm); Werte außerhalb benannter Grenzen, mit Sprung oder Stillstand und Werte älter als drei Stunden weggelassen; Niederschlag (unbeheizte Regenmesser) und der modellierte Neuschnee nicht übernommen',
  },
] as const);
/** Networks of phase GO — the only ones the GO sections of the documents carry (a page from before phase GI knows no other). */
export const STN_GO_NETS: readonly StnNet[] = ['tirol', 'bz', 'obs'];
/** Station ids of the GO sections, and of the section `ext`. */
export const STN_GO_ID_RE = /^(tirol|bz|at|ch|de):/;
export const STN_EXT_ID_RE = /^imis:/;
export const glacierStnSource = (id: string): GlacierStnSource | undefined => GLACIER_STN_SOURCES.find((s) => s.id === id);
/** The sources as rows of the brief's licence list (shape of a `sources.json` row). */
export const glacierStnSourceRows = (): Array<{ id: string; label: string; licence: string; attribution: string; url: string; refYear: string; used: string; licenceUrl: string; changes: string }> =>
  GLACIER_STN_SOURCES.map((s) => ({
    id: `stn-${s.id}`, label: s.label, licence: s.licence, attribution: s.note, url: s.url, refYear: 'laufend',
    used: 'neueste Messung je Größe an der nächsten Station (Karte „Gemessen in der Nähe“)', licenceUrl: s.licenceUrl, changes: `Von buscosun bearbeitet: ${s.changes}.`,
  }));
/** Fixed sentence of the page: where the instruments stand. */
export const GLACIER_STN_SITE_NOTE = 'Station auf Fels oder Grat, nicht auf dem Eis';

/** Only these operators of the Tirol file / the Euregio feed are licensed (CC BY 4.0 of Land Tirol). */
export const tirolOperatorAllowed = (operator: unknown): boolean => typeof operator === 'string' && (operator === 'HD Tirol' || operator === 'LWD Tirol' || operator.startsWith('LWD Tirol/'));

// --- Variables, limits and checks -------------------------------------------------------------------------------------------------------

/** Variables of an hour entry (`v`), units as in `obs/v1`. */
export const STN_VARS = Object.freeze({
  t: '°C Lufttemperatur', td: '°C Taupunkt', rh: '% relative Feuchte', ff: 'm/s Wind (Mittel)', dd: '° Windrichtung', fx: 'm/s Böe',
  snow: 'cm Schneehöhe', gr: 'W/m² Globalstrahlung',
} as const);
export type StnVar = keyof typeof STN_VARS;
export const STN_VAR_KEYS = Object.keys(STN_VARS) as StnVar[];
export type StnSumKey = 'rr1h' | 'rr6h' | 'rr24h';
export const STN_SUM_KEYS: readonly StnSumKey[] = ['rr1h', 'rr6h', 'rr24h'];
/**
 * Phase GI — change of the snow depth over 24/48/72 h in cm, as the network delivers it (Land Tirol: `HSD24/48/72`). A measured
 * difference with a sign (settling and melt are negative); not "new snow", never a model value, never computed here.
 */
export const STN_HSD_KEYS = ['h24', 'h48', 'h72'] as const;
export type StnHsdKey = (typeof STN_HSD_KEYS)[number];
export type StnHsd = Partial<Record<StnHsdKey, number>>;
/** Name of a difference in `rejected` (`hsd24`, `hsd48`, `hsd72`). */
export const stnHsdName = (k: StnHsdKey): string => `hsd${k.slice(1)}`;
/** Plausible range of the differences (cm, set). */
export const STN_HSD_LIMITS: Readonly<Record<StnHsdKey, readonly [number, number]>> = Object.freeze({ h24: [-100, 250], h48: [-150, 350], h72: [-200, 450] });
/** A rise of the snow depth cannot exceed the depth itself by more than this (cm, set). */
export const STN_HSD_ABOVE_DEPTH = 5;

/** A value older than this (against the clock of whoever reads it) is not a current measurement. set. */
export const STN_MAX_AGE_MS = 3 * HOUR;
/** A stamp further in the future than this is a broken clock. set. */
export const STN_FUTURE_MS = 15 * MIN;
/**
 * Plausible range per variable for stations between valley floor and 3 400 m (set — wide enough for an alpine record, narrow enough
 * for a broken sensor). `rh` up to 105 %: capacitive sensors read slightly above saturation in cloud. `snow` down to −5 cm:
 * ultrasonic sensors scatter around bare ground.
 */
export const STN_LIMITS: Readonly<Record<StnVar | StnSumKey, readonly [number, number]>> = Object.freeze({
  t: [-45, 40], td: [-60, 30], rh: [1, 105], ff: [0, 75], dd: [0, 360], fx: [0, 90], snow: [-5, 1000], gr: [-10, 1500],
  rr1h: [0, 150], rr6h: [0, 400], rr24h: [0, 700],
});
/** Largest believable change per hour against the station's previous accepted value (set). No entry = no jump check. */
export const STN_JUMP_PER_H: Readonly<Partial<Record<StnVar, number>>> = Object.freeze({ t: 15, td: 20, snow: 60 });
/** A previous value older than this is no reference for the jump check. */
export const STN_JUMP_REF_MS = 3 * HOUR;
/**
 * Stuck check: the current reading and EVERY earlier reading of the last `STN_STUCK_HOURS` hours carry the same value — at least
 * `STN_STUCK_HOURS` of them with different stamps, the oldest that far back (less `STN_STUCK_SLACK_MS`). Counted in time, not in
 * documents: three hours of the same value in half-hour documents are not six hours. set.
 */
export const STN_STUCK_HOURS = 6;
/** Tolerance at both ends of the stuck window (stations report every 10 min, a run comes every 30). set. */
export const STN_STUCK_SLACK_MS = 30 * MIN;
/** Variables with a stuck check. Temperature: the same tenth for seven readings. Wind and gust: the same non-zero value, or zero below `STN_RIME_T`. */
export const STN_STUCK_VARS: readonly StnVar[] = ['t', 'ff', 'fx'];
/** Calm for hours at or below this temperature is treated as a rimed anemometer (°C, set). Above it a calm stays a calm. */
export const STN_RIME_T = 0;
/** A gust this far below the mean wind is inconsistent (m/s, set). */
export const STN_GUST_BELOW_MEAN = 0.5;
/** A dew point this far above the temperature is inconsistent (K, set). */
export const STN_TD_ABOVE_T = 1;
/** Share of the 5-min values a precipitation sum of South Tyrol needs to count as complete (set). */
export const STN_SUM_MIN_SHARE = 0.9;

export type StnRejectReason = 'stale' | 'future' | 'range' | 'jump' | 'stuck' | 'inconsistent' | 'incomplete';
export const STN_REJECT_TEXT: Readonly<Record<StnRejectReason, string>> = Object.freeze({
  stale: 'älter als drei Stunden', future: 'Zeitstempel in der Zukunft', range: 'außerhalb der plausiblen Spanne', jump: 'unplausibler Sprung',
  stuck: 'Fühler steht seit Stunden auf demselben Wert', inconsistent: 'widerspricht einem zweiten Fühler der Station', incomplete: 'Summe unvollständig',
});

// --- Shapes --------------------------------------------------------------------------------------------------------------------------------

/** Catalogue entry — the fields of an `obs/v1` station plus the operator. */
export interface StnStation {
  id: string; name: string; lat: number; lon: number; elev: number; country: string; region?: string;
  networks: string[]; vars: string[];
  /** Operator as the source names it (`LWD Tirol`, `HD Tirol`, `LWD Tirol/TIWAG` …; South Tyrol: the province). */
  operator: string;
  /** The source's own key (Tirol: the feature's UUID). */
  ref?: string;
}
export interface StnCatalog {
  schema: 1; kind: 'glacier/stations'; builtAt: string; count: number; idRule: string;
  /** Networks of phase GO (Tirol, South Tyrol). */
  stations: StnStation[];
  /** Phase GI: networks added since (IMIS). A producer from before phase GI reads only `stations`. */
  ext?: { count: number; stations: StnStation[] };
}
export const STN_ID_RULE = 'tirol:<UUID der Station in der OGD-Datei> · bz:<SCODE des Dienstes der Provinz Bozen> · at:/ch:/de: wie obs/v1 · imis:<Kennung der IMIS-Station> (Abschnitt ext)';

export interface StnSum { mm: number; n?: number; of?: number; complete?: boolean }
/** One station's reading before the checks. Stamps are ms UTC. */
export interface StnReading {
  id: string;
  ms: number;
  v: Partial<Record<StnVar, number>>;
  /** A variable whose own stamp is older than the station's. */
  older?: Partial<Record<StnVar, { v: number; ms: number }>>;
  sums?: Partial<Record<StnSumKey, StnSum>>;
  hsd?: StnHsd;
}
/** Hour entry — the shape of an `obs/v1/latest.json` entry. */
export interface StnEntry {
  t: string;
  src: string;
  v: Partial<Record<StnVar, number>>;
  older?: Partial<Record<StnVar, { v: number; t: string }>>;
  rr1h?: StnSum; rr6h?: StnSum; rr24h?: StnSum;
  /** Phase GI: change of the snow depth (cm). A page from before phase GI does not read the key. */
  hsd?: StnHsd;
}
export type StnRejected = [id: string, what: string, reason: StnRejectReason];
export interface StnHourSource { id: string; label: string; licence: string; note: string; fetchedAt: string | null; via: string; stations: number; error?: string; /** Requests sent to the source in this run (IMIS). */ requests?: number }
export interface StnHourDoc {
  schema: 1; kind: 'glacier/stations-hour';
  /** The slot key of the document (`yyyymmddhh` or `yyyymmddhh30`); the field keeps its first name. */
  hour: string; builtAt: string;
  sources: StnHourSource[];
  rules: { maxAgeMin: number; limits: typeof STN_LIMITS; jumpPerH: typeof STN_JUMP_PER_H; stuckHours: number; history: number; hsdLimits?: typeof STN_HSD_LIMITS };
  /** Number of entries under `stations`. */
  count: number;
  /** Networks of phase GO (`tirol:`, `bz:`, `at:`/`ch:`/`de:`) — the only ids a page from before phase GI accepts here. */
  stations: Record<string, StnEntry>;
  /** Phase GI: stations of networks added since (`imis:`), same entry shape. */
  ext?: { count: number; stations: Record<string, StnEntry> };
  rejected: StnRejected[];
}
/** Every entry of a slot document: the GO section and the section `ext`. */
export const stnHourEntries = (d: Pick<StnHourDoc, 'stations' | 'ext'>): Record<string, StnEntry> => (d.ext?.stations ? { ...d.stations, ...d.ext.stations } : d.stations);

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r5 = (x: number) => Math.round(x * 1e5) / 1e5;
const iso = (ms: number) => new Date(ms).toISOString();

// --- Reader: Tirol (OGD file or filtered feed) ----------------------------------------------------------------------------------------

export interface TirolParse { stations: StnStation[]; readings: StnReading[]; foreign: Array<{ name: string; operator: string }>; skipped: string[] }
/**
 * Id of a Tirol station: the feature's whole UUID. Not a prefix — the file carries sequential UUIDs that share their first 8 digits
 * (measured 21.11.2026: Kapall Schneestation / Windstation, Krinnenalpe / Krinnenspitze), and `plot` is shared by several stations.
 */
export const TIROL_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const tirolIdOf = (uuid: string): string => `tirol:${uuid}`;

/**
 * Reads the GeoJSON of Land Tirol (the OGD file, or the Euregio feed — same shape). Features of any operator that is not licensed are
 * dropped and listed in `foreign` (name and operator only — never their values). Throws when two stations share an id.
 */
export function parseTirol(doc: unknown): TirolParse {
  const feats = (doc as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(feats)) throw new Error('Tirol: keine FeatureCollection');
  const out: TirolParse = { stations: [], readings: [], foreign: [], skipped: [] };
  const seen = new Set<string>();
  for (const f of feats as Array<{ id?: unknown; geometry?: { coordinates?: unknown[] }; properties?: Record<string, unknown> }>) {
    const p = f?.properties ?? {};
    const name = typeof p.name === 'string' ? p.name : '?';
    if (!tirolOperatorAllowed(p.operator)) { out.foreign.push({ name, operator: String(p.operator ?? '') }); continue; }
    const c = f.geometry?.coordinates;
    if (typeof f.id !== 'string' || !TIROL_UUID_RE.test(f.id) || !Array.isArray(c) || !isNum(c[0]) || !isNum(c[1]) || !isNum(c[2])) { out.skipped.push(`${name}: ohne Kennung oder Lage`); continue; }
    const id = tirolIdOf(f.id);
    if (seen.has(id)) throw new Error(`Tirol: Kennung ${id} doppelt`);
    seen.add(id);
    const v: Partial<Record<StnVar, number>> = {};
    if (isNum(p.LT)) v.t = p.LT;
    if (isNum(p.TD)) v.td = r1(p.TD);
    if (isNum(p.RH)) v.rh = p.RH;
    if (isNum(p.WG)) v.ff = r2(p.WG / 3.6);
    if (isNum(p.WR)) v.dd = Math.round(p.WR);
    if (isNum(p.WG_BOE)) v.fx = r2(p.WG_BOE / 3.6);
    if (isNum(p.HS)) v.snow = p.HS;
    if (isNum(p.GS_O)) v.gr = p.GS_O;
    const sums: Partial<Record<StnSumKey, StnSum>> = {};
    if (isNum(p.N6)) sums.rr6h = { mm: p.N6 };
    if (isNum(p.N24)) sums.rr24h = { mm: p.N24 };
    // phase GI: the differences of the snow depth the file delivers (cm)
    const hsd: StnHsd = {};
    if (isNum(p.HSD24)) hsd.h24 = r1(p.HSD24);
    if (isNum(p.HSD48)) hsd.h48 = r1(p.HSD48);
    if (isNum(p.HSD72)) hsd.h72 = r1(p.HSD72);
    const hasHsd = Object.keys(hsd).length > 0;
    const vars = [...Object.keys(v), ...(sums.rr24h || sums.rr6h ? ['rr'] : []), ...(hasHsd ? ['hsd'] : [])].sort();
    out.stations.push({
      id, name, lat: c[1] as number, lon: c[0] as number, elev: Math.round(c[2] as number), country: 'AT',
      ...(typeof p['LWD-Region'] === 'string' ? { region: p['LWD-Region'] as string } : {}), networks: ['tirol'], vars, operator: p.operator as string, ref: f.id,
    });
    const ms = typeof p.date === 'string' ? Date.parse(p.date) : NaN;
    if (!Number.isFinite(ms)) { if (vars.length) out.skipped.push(`${name}: Werte ohne Zeitstempel`); continue; }
    if (vars.length) out.readings.push({ id, ms, v, ...(Object.keys(sums).length ? { sums } : {}), ...(hasHsd ? { hsd } : {}) });
  }
  return out;
}

// --- Reader: IMIS (SLF) ----------------------------------------------------------------------------------------------------------------------

/** Field of an IMIS measurement row → variable of the product. Units as the service states them: °C, %, m/s, °, cm. */
export const IMIS_FIELD_VAR: Readonly<Record<string, StnVar>> = Object.freeze({
  TA_30MIN_MEAN: 't', RH_30MIN_MEAN: 'rh', VW_30MIN_MEAN: 'ff', DW_30MIN_MEAN: 'dd', VW_30MIN_MAX: 'fx', HS: 'snow',
});
export const IMIS_CODE_RE = /^[A-Z0-9]{3,8}$/;
/** `2026-11-21T22:30:00Z` → ms UTC. The measurement rows carry UTC with `Z`; anything else is no stamp. */
export function parseImisTime(s: unknown): number | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(s)) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}
/** Resolution of the product per variable (the service sends three decimals of a half-hour mean). */
const IMIS_ROUND: Readonly<Record<StnVar, (x: number) => number>> = { t: r1, td: r1, rh: r1, ff: r2, fx: r2, dd: Math.round, snow: r1, gr: Math.round };

export interface ImisParse { stations: StnStation[]; readings: StnReading[]; skipped: string[]; /** Rows of a station the list does not name, or without a readable stamp. */ strayRows: number }
/**
 * Reads `/stations` and `/measurements` of the SLF service. Per station and variable the NEWEST row that carries a value; a variable
 * whose newest value is older than the station's newest row goes to `older` with its own stamp (the age check is per stamp).
 * Reflected radiation, snow and surface temperatures are not read. Throws when two stations share a code.
 */
export function parseImis(stationsDoc: unknown, measurementsDoc: unknown): ImisParse {
  if (!Array.isArray(stationsDoc) || !Array.isArray(measurementsDoc)) throw new Error('IMIS: Antwort ohne Stationen oder Messzeilen');
  const out: ImisParse = { stations: [], readings: [], skipped: [], strayRows: 0 };
  const meta = new Map<string, Record<string, unknown>>();
  for (const s of stationsDoc as Array<Record<string, unknown>>) {
    const code = s?.code;
    const name = typeof s?.label === 'string' ? s.label : String(code ?? '?');
    if (typeof code !== 'string' || !IMIS_CODE_RE.test(code) || !isNum(s.lat) || !isNum(s.lon) || !isNum(s.elevation) || typeof s.country_code !== 'string' || !/^[A-Z]{2}$/.test(s.country_code)) { out.skipped.push(`${name}: ohne Kennung, Lage oder Land`); continue; }
    if (meta.has(code)) throw new Error(`IMIS: Kennung ${code} doppelt`);
    meta.set(code, s);
  }
  // newest value per station and variable
  const newest = new Map<string, Partial<Record<StnVar, { v: number; ms: number }>>>();
  for (const row of measurementsDoc as Array<Record<string, unknown>>) {
    const code = row?.station_code, ms = parseImisTime(row?.measure_date);
    if (typeof code !== 'string' || !meta.has(code) || ms == null) { out.strayRows++; continue; }
    let cur = newest.get(code);
    if (!cur) { cur = {}; newest.set(code, cur); }
    for (const [field, k] of Object.entries(IMIS_FIELD_VAR)) {
      const x = row[field];
      if (isNum(x) && (!cur[k] || cur[k]!.ms < ms)) cur[k] = { v: IMIS_ROUND[k](x), ms };
    }
  }
  for (const [code, s] of meta) {
    const id = `imis:${code}`, vals = newest.get(code) ?? {};
    const keys = (Object.keys(vals) as StnVar[]).sort();
    out.stations.push({
      // ten decimals of a degree in the answer; five are a metre
      id, name: s.label as string, lat: r5(s.lat as number), lon: r5(s.lon as number), elev: Math.round(s.elevation as number), country: s.country_code as string,
      ...(typeof s.canton_code === 'string' ? { region: s.canton_code } : {}), networks: ['imis'], vars: keys, operator: IMIS_OPERATOR, ref: code,
    });
    if (!keys.length) { out.skipped.push(`${s.label as string}: kein Wert in der Antwort`); continue; }
    const ms = Math.max(...keys.map((k) => vals[k]!.ms));
    const v: Partial<Record<StnVar, number>> = {}, older: Partial<Record<StnVar, { v: number; ms: number }>> = {};
    for (const k of keys) { if (vals[k]!.ms === ms) v[k] = vals[k]!.v; else older[k] = vals[k]!; }
    out.readings.push({ id, ms, v, ...(Object.keys(older).length ? { older } : {}) });
  }
  return out;
}

// --- Reader: South Tyrol -------------------------------------------------------------------------------------------------------------------

/** `2026-11-21T08:10:00CET` / `…CEST` → ms UTC; anything else → `null`. */
export function parseBzTime(s: unknown): number | null {
  const m = typeof s === 'string' ? /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(CET|CEST)$/.exec(s) : null;
  if (!m) return null;
  const ms = Date.parse(`${m[1]}${m[2] === 'CEST' ? '+02:00' : '+01:00'}`);
  return Number.isFinite(ms) ? ms : null;
}
/** Sensor type of the service → variable of the product. `N` (5-min precipitation) is summed, not listed here. */
export const BZ_SENSOR_VAR: Readonly<Record<string, StnVar>> = Object.freeze({ LT: 't', LF: 'rh', WG: 'ff', WR: 'dd', 'WG.BOE': 'fx', HS: 'snow', GS: 'gr' });
export const BZ_PRECIP_SENSOR = 'N';
export const BZ_OPERATOR = 'Autonome Provinz Bozen – Südtirol';

export interface BzParse { stations: StnStation[]; readings: StnReading[]; precip: string[]; skipped: string[] }
/** Reads `/stations` and `/sensors`. A station without any weather sensor (a river gauge) is not part of the product. `precip` = SCODEs with a rain gauge. */
export function parseBz(stationsDoc: unknown, sensorsDoc: unknown): BzParse {
  const feats = (stationsDoc as { features?: Array<{ properties?: Record<string, unknown> }> } | null)?.features;
  if (!Array.isArray(feats) || !Array.isArray(sensorsDoc)) throw new Error('Südtirol: Antwort ohne Stationen oder Sensoren');
  const by = new Map<string, Array<Record<string, unknown>>>();
  for (const s of sensorsDoc as Array<Record<string, unknown>>) {
    if (typeof s?.SCODE !== 'string' || typeof s.TYPE !== 'string') continue;
    if (!(s.TYPE in BZ_SENSOR_VAR) && s.TYPE !== BZ_PRECIP_SENSOR) continue;
    if (!by.has(s.SCODE)) by.set(s.SCODE, []);
    by.get(s.SCODE)!.push(s);
  }
  const out: BzParse = { stations: [], readings: [], precip: [], skipped: [] };
  for (const f of feats) {
    const p = f?.properties ?? {};
    const code = p.SCODE;
    if (typeof code !== 'string') continue;
    const sensors = by.get(code);
    if (!sensors) continue;
    const name = typeof p.NAME_D === 'string' ? p.NAME_D : code;
    if (!isNum(p.LAT) || !isNum(p.LONG) || !isNum(p.ALT)) { out.skipped.push(`${name}: ohne Lage`); continue; }
    const id = `bz:${code}`;
    const vals: Array<{ k: StnVar; v: number; ms: number }> = [];
    for (const s of sensors) {
      if (s.TYPE === BZ_PRECIP_SENSOR) continue;
      const ms = parseBzTime(s.DATE);
      if (ms == null || !isNum(s.VALUE)) continue;
      vals.push({ k: BZ_SENSOR_VAR[s.TYPE as string], v: s.TYPE === 'WR' ? Math.round(s.VALUE) : s.VALUE, ms });
    }
    const hasRain = sensors.some((s) => s.TYPE === BZ_PRECIP_SENSOR);
    if (hasRain) out.precip.push(code);
    const vars = [...new Set([...sensors.filter((s) => s.TYPE !== BZ_PRECIP_SENSOR).map((s) => BZ_SENSOR_VAR[s.TYPE as string]), ...(hasRain ? ['rr'] : [])])].sort();
    out.stations.push({ id, name, lat: p.LAT, lon: p.LONG, elev: Math.round(p.ALT), country: 'IT', region: 'Südtirol', networks: ['bz'], vars, operator: BZ_OPERATOR, ref: code });
    if (!vals.length) { out.skipped.push(`${name}: kein Sensor mit Wert und Zeitstempel`); continue; }
    const ms = Math.max(...vals.map((x) => x.ms));
    const v: Partial<Record<StnVar, number>> = {}, older: Partial<Record<StnVar, { v: number; ms: number }>> = {};
    for (const x of vals) { if (x.ms === ms) v[x.k] = x.v; else older[x.k] = { v: x.v, ms: x.ms }; }
    out.readings.push({ id, ms, v, ...(Object.keys(older).length ? { older } : {}) });
  }
  return out;
}

/**
 * Precipitation sums of one South Tyrol gauge from its 5-min series (`/timeseries`, newest first): the 1 h and 24 h before `endMs`
 * (the station's newest stamp). A sum with fewer than `STN_SUM_MIN_SHARE` of its 5-min values is marked incomplete.
 */
export function bzPrecipSums(series: unknown, endMs: number): Partial<Record<'rr1h' | 'rr24h', StnSum>> {
  if (!Array.isArray(series)) return {};
  const rows: Array<{ ms: number; v: number }> = [];
  for (const r of series as Array<Record<string, unknown>>) { const ms = parseBzTime(r?.DATE); if (ms != null && isNum(r.VALUE) && r.VALUE >= 0) rows.push({ ms, v: r.VALUE }); }
  const sum = (hours: number): StnSum | null => {
    const of = hours * 12, inWin = rows.filter((r) => r.ms > endMs - hours * HOUR && r.ms <= endMs);
    if (!inWin.length) return null;
    return { mm: r1(inWin.reduce((a, r) => a + r.v, 0)), n: inWin.length, of, complete: inWin.length >= of * STN_SUM_MIN_SHARE };
  };
  const a = sum(1), b = sum(24);
  return { ...(a ? { rr1h: a } : {}), ...(b ? { rr24h: b } : {}) };
}

// --- Reader: the mapped stations of obs/v1 ----------------------------------------------------------------------------------------------

/** 10-min networks of `obs/v1` whose stations can stand next to a glacier (daily gauges carry no current value). */
export const STN_OBS_NETWORKS: readonly string[] = ['dwd10', 'tawes', 'smn', 'smnp'];
/** An `obs/v1/latest.json` entry as a reading (values unchanged; `rr1h`/`rr24h` as the mirror computed them). */
export function obsReadingOf(id: string, e: unknown): StnReading | null {
  const o = e as { t?: unknown; v?: Record<string, unknown>; older?: Record<string, { v?: unknown; t?: unknown }>; rr1h?: StnSum; rr24h?: StnSum } | null;
  const ms = typeof o?.t === 'string' ? Date.parse(o.t) : NaN;
  if (!o || !Number.isFinite(ms)) return null;
  const v: Partial<Record<StnVar, number>> = {}, older: Partial<Record<StnVar, { v: number; ms: number }>> = {};
  for (const k of STN_VAR_KEYS) {
    if (isNum(o.v?.[k])) v[k] = o.v![k] as number;
    else { const x = o.older?.[k]; const xm = typeof x?.t === 'string' ? Date.parse(x.t) : NaN; if (x && isNum(x.v) && Number.isFinite(xm)) older[k] = { v: x.v, ms: xm }; }
  }
  const sums: Partial<Record<StnSumKey, StnSum>> = {};
  for (const k of ['rr1h', 'rr24h'] as const) { const s = o[k]; if (s && isNum(s.mm)) sums[k] = { mm: s.mm, ...(isNum(s.n) ? { n: s.n } : {}), ...(isNum(s.of) ? { of: s.of } : {}), ...(typeof s.complete === 'boolean' ? { complete: s.complete } : {}) }; }
  return { id, ms, v, ...(Object.keys(older).length ? { older } : {}), ...(Object.keys(sums).length ? { sums } : {}) };
}

// --- Plausibility ------------------------------------------------------------------------------------------------------------------------

/** Previous accepted values of one station, newest first (from the slot files before this one). */
export type StnHistory = ReadonlyArray<{ ms: number; v: Partial<Record<StnVar, number>> }>;

const inRange = (k: StnVar | StnSumKey, x: number) => x >= STN_LIMITS[k][0] && x <= STN_LIMITS[k][1];

/**
 * The checks of one reading: age, range, consistency, jump, stuck — per variable. Returns the entry with the values that passed
 * (`null` when nothing is left) and the list of what was dropped and why. Pure; `history` = the station's earlier accepted values.
 */
export function checkReading(r: StnReading, src: string, nowMs: number, history: StnHistory = []): { entry: StnEntry | null; rejected: StnRejected[] } {
  const rejected: StnRejected[] = [];
  const drop = (what: string, why: StnRejectReason) => { rejected.push([r.id, what, why]); };
  const ageBad = (ms: number): StnRejectReason | null => (ms - nowMs > STN_FUTURE_MS ? 'future' : nowMs - ms > STN_MAX_AGE_MS ? 'stale' : null);
  const stationAge = ageBad(r.ms);
  const cand: Array<{ k: StnVar; v: number; ms: number; own: boolean }> = [];
  for (const k of STN_VAR_KEYS) {
    if (isNum(r.v[k])) cand.push({ k, v: r.v[k] as number, ms: r.ms, own: true });
    else if (r.older?.[k] && isNum(r.older[k]!.v)) cand.push({ k, v: r.older[k]!.v, ms: r.older[k]!.ms, own: false });
  }
  const ok = new Map<StnVar, { v: number; ms: number; own: boolean }>();
  for (const c of cand) {
    const age = c.own ? stationAge : ageBad(c.ms);
    if (age) { drop(c.k, age); continue; }
    if (!inRange(c.k, c.v)) { drop(c.k, 'range'); continue; }
    const perH = STN_JUMP_PER_H[c.k];
    if (perH != null) {
      const prev = history.find((h) => isNum(h.v[c.k]) && h.ms < c.ms);
      if (prev && c.ms - prev.ms <= STN_JUMP_REF_MS && Math.abs(c.v - (prev.v[c.k] as number)) > perH * Math.max(1, (c.ms - prev.ms) / HOUR)) { drop(c.k, 'jump'); continue; }
    }
    ok.set(c.k, c);
  }
  // consistency between two sensors of the station
  const t = ok.get('t'), td = ok.get('td'), ff = ok.get('ff'), fx = ok.get('fx');
  if (t && td && td.v > t.v + STN_TD_ABOVE_T) { ok.delete('td'); drop('td', 'inconsistent'); }
  if (ff && fx && fx.v < ff.v - STN_GUST_BELOW_MEAN) { ok.delete('fx'); drop('fx', 'inconsistent'); }
  // stuck: the same value in this reading and in every earlier reading (one per stamp) of the last STN_STUCK_HOURS hours
  const stamps = new Set<number>();
  const past = history.filter((h) => h.ms < r.ms && r.ms - h.ms <= STN_STUCK_HOURS * HOUR + STN_STUCK_SLACK_MS && !stamps.has(h.ms) && !!stamps.add(h.ms));
  if (past.length >= STN_STUCK_HOURS && r.ms - Math.min(...past.map((h) => h.ms)) >= STN_STUCK_HOURS * HOUR - STN_STUCK_SLACK_MS) {
    const same = (k: StnVar, v: number) => past.every((h) => h.v[k] === v);
    const cur = ok.get('t');
    if (cur && same('t', cur.v)) { ok.delete('t'); drop('t', 'stuck'); }
    const f = ok.get('ff'), g = ok.get('fx');
    const cold = (cur ?? t)?.v != null && (cur ?? t)!.v <= STN_RIME_T;
    const calm = !!f && f.v === 0 && same('ff', 0) && (!g || (g.v === 0 && same('fx', 0)));
    if (f && ((f.v > 0 && same('ff', f.v)) || (calm && cold))) { ok.delete('ff'); drop('ff', 'stuck'); if (ok.delete('dd')) drop('dd', 'stuck'); }
    if (g && ((g.v > 0 && same('fx', g.v)) || (calm && cold))) { ok.delete('fx'); drop('fx', 'stuck'); }
  }
  // a direction without a wind speed says nothing
  if (ok.has('dd') && !ok.has('ff')) ok.delete('dd');
  const sums: Partial<Record<StnSumKey, StnSum>> = {};
  for (const k of STN_SUM_KEYS) {
    const s = r.sums?.[k];
    if (!s) continue;
    if (stationAge) { drop(k, stationAge); continue; }
    if (!isNum(s.mm) || !inRange(k, s.mm)) { drop(k, 'range'); continue; }
    if (s.complete === false) { drop(k, 'incomplete'); continue; }
    sums[k] = s;
  }
  // change of the snow depth: the station's stamp, a named range, and never without a believable depth next to it
  const hsd: StnHsd = {};
  const depthSent = cand.some((c) => c.k === 'snow'), depth = ok.get('snow');
  for (const k of STN_HSD_KEYS) {
    const x = r.hsd?.[k];
    if (x == null) continue;
    const what = stnHsdName(k);
    if (stationAge) { drop(what, stationAge); continue; }
    if (!isNum(x) || x < STN_HSD_LIMITS[k][0] || x > STN_HSD_LIMITS[k][1]) { drop(what, 'range'); continue; }
    if ((depthSent && !depth) || (depth && x > depth.v + STN_HSD_ABOVE_DEPTH)) { drop(what, 'inconsistent'); continue; }
    hsd[k] = x;
  }
  const hasHsd = Object.keys(hsd).length > 0;
  if (!ok.size && !Object.keys(sums).length && !hasHsd) return { entry: null, rejected };
  const v: Partial<Record<StnVar, number>> = {}, older: Partial<Record<StnVar, { v: number; t: string }>> = {};
  for (const k of STN_VAR_KEYS) { const x = ok.get(k); if (!x) continue; if (x.own) v[k] = x.v; else older[k] = { v: x.v, t: iso(x.ms) }; }
  return { entry: { t: iso(r.ms), src, v, ...(Object.keys(older).length ? { older } : {}), ...sums, ...(hasHsd ? { hsd } : {}) }, rejected };
}

/** The accepted values of one station in earlier slot documents, newest first — the history `checkReading` needs. */
export function stnHistoryOf(id: string, earlier: readonly StnHourDoc[]): StnHistory {
  const out: Array<{ ms: number; v: Partial<Record<StnVar, number>> }> = [];
  for (const d of earlier) { const e = d.stations?.[id] ?? d.ext?.stations?.[id]; const ms = e ? Date.parse(e.t) : NaN; if (e && Number.isFinite(ms) && !out.some((x) => x.ms === ms)) out.push({ ms, v: e.v ?? {} }); }
  return out.sort((a, b) => b.ms - a.ms);
}

// --- Mapping glacier → stations --------------------------------------------------------------------------------------------------------

/** The quantities of the page, the variable (or sum) that carries each and the catalogue variable a station must list. */
export const STN_QUANTITIES_GO = Object.freeze([
  { key: 't', label: 'Temperatur', has: 't' },
  { key: 'wind', label: 'Wind', has: 'ff' },
  { key: 'gust', label: 'Böe', has: 'fx' },
  { key: 'snow', label: 'Schneehöhe', has: 'snow' },
  { key: 'precip', label: 'Niederschlag', has: 'rr' },
  { key: 'rad', label: 'Globalstrahlung', has: 'gr' },
] as const);
/** All quantities: those of phase GO (the only ones the GO section of a mapping names) plus the change of the snow depth (phase GI). */
export const STN_QUANTITIES = Object.freeze([
  ...STN_QUANTITIES_GO,
  { key: 'dsnow', label: 'Änderung der Schneehöhe', has: 'hsd' },
] as const);
export type StnQuantity = (typeof STN_QUANTITIES)[number]['key'];
export type StnQuantityDef = { readonly key: StnQuantity; readonly label: string; readonly has: string };
/** Window of the mapping (set, Jan 21.11.2026: "start with 5 km and ±300 m"). */
export const STN_MAP_KM = 5;
/** Station elevation must lie within the glacier's elevation range widened by this (m). */
export const STN_MAP_DZ = 300;

/** Great-circle distance in km. */
export function stnDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180, a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(a));
}

/** Outline of a glacier as the static build stores it: polygons → rings → `[lon, lat]` (first ring = outer edge, the rest = holes). */
export type StnOutline = ReadonlyArray<ReadonlyArray<ReadonlyArray<readonly number[]>>>;
/** Simplification level of the outlines the mapping reads (`outline/<region>-L1.json`, tolerance 60 m — enough for 0.1 km). */
export const STN_OUTLINE_LEVEL = 1;
export interface StnMapGlacier { id: string; country: string; region: string; lat: number; lon: number; z: readonly [number, number, number]; outline?: StnOutline }
/** `[station id, distance km (0.1), station elevation − median elevation of the glacier (m)]` */
export type StnMapHit = [id: string, km: number, dz: number];
export interface StnMapStation { name: string; elev: number; lat: number; lon: number; net: StnNet; op: string }
export interface StnMapReportRow { glaciers: number; withStation: number; q: Partial<Record<StnQuantity, number>> }
export type StnMapFrom = 'catalogue point' | 'outline';
export interface StnMapRule { km: number; dz: number; from: StnMapFrom; elevation: 'range ± dz'; dzShown: 'station − median' }
export interface StnMapReport { all: StnMapReportRow; byCountry: Record<string, StnMapReportRow>; byRegion: Record<string, StnMapReportRow>; byNet: Record<string, number> }
/** One mapping: rule, the stations it names and the hits per glacier. */
export interface StnMapSection { rule: StnMapRule; stations: Record<string, StnMapStation>; glaciers: Record<string, Partial<Record<StnQuantity, StnMapHit>>> }
export interface StnMapDoc extends StnMapSection {
  schema: 1; kind: 'glacier/station-map';
  file: string; build: string; builtAt: string;
  report: StnMapReport;
  /**
   * Phase GI: the mapping over ALL networks and quantities. The top level stays the mapping over the networks and quantities of
   * phase GO — the only one a page from before phase GI reads (and its validator rejects an unknown quantity there).
   */
  ext?: StnMapSection & { report: StnMapReport };
}
/** The mapping a page shows: the section `ext` when the document has one, else the GO section. */
export const stnMapSection = (d: StnMapDoc): StnMapSection => d.ext ?? d;
export interface StnMapCandidate { id: string; name: string; lat: number; lon: number; elev: number; vars: readonly string[]; net: StnNet; op: string }

/**
 * Distance of a point to an outline in km: 0 on the ice (inside an outer ring and in none of its holes), else to the nearest edge
 * of any ring. Computed in a local plane around the point — exact enough within a few kilometres.
 */
export function stnOutlineKm(polys: StnOutline, lat: number, lon: number): number {
  const rad = Math.PI / 180, kx = 111.195 * Math.cos(lat * rad), ky = 111.195;
  let best = Infinity, inside = false;
  for (const poly of polys) {
    let inPoly = false;
    poly.forEach((ring, ri) => {
      let c = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const ax = (ring[j][0] - lon) * kx, ay = (ring[j][1] - lat) * ky, bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
        if ((ay > 0) !== (by > 0) && 0 < ((bx - ax) * (0 - ay)) / (by - ay) + ax) c = !c;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / l2)) : 0;
        best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
      }
      if (ri === 0) inPoly = c; else if (c) inPoly = false;
    });
    if (inPoly) inside = true;
  }
  return inside ? 0 : best;
}

/** Operator words of the `obs/v1` networks, as the page names them. */
export const STN_OBS_OPERATOR: Readonly<Record<string, string>> = Object.freeze({ DE: 'Deutscher Wetterdienst', AT: 'GeoSphere Austria', CH: 'MeteoSchweiz', LI: 'MeteoSchweiz' });

/**
 * What an `obs/v1` station delivers NOW, as catalogue variables: the 10-min values of its newest entry and `rr` when a sum is there.
 * The catalogue of `obs/v1` lists every variable a station ever sent in any product (the Zugspitze lists `snow` and `rr` from daily
 * files, measured 21.11.2026) — mapped by that list, the page would promise a value that never comes.
 */
export function obsVarsNow(e: unknown): string[] {
  const r = obsReadingOf('x', e);
  if (!r) return [];
  return [...new Set([...Object.keys(r.v), ...Object.keys(r.older ?? {}), ...(r.sums?.rr1h || r.sums?.rr24h ? ['rr'] : [])])].sort();
}
/** The mapping is rebuilt when it is older than this (a station of `obs/v1` that was down at build time comes back within a day). set. */
export const STN_MAP_REFRESH_MS = 24 * HOUR;

/**
 * Candidates of the mapping: every station of the product with the variables of its catalogue entry, and the 10-min stations of
 * `obs/v1` with the variables they deliver now (`obsLatest` = the `stations` of `obs/v1/latest.json`).
 */
export function stnCandidates(
  own: readonly StnStation[],
  obs: ReadonlyArray<{ id: string; name: string; lat: number; lon: number; elev: number; country: string; networks?: string[]; vars?: string[] }>,
  obsLatest: Readonly<Record<string, unknown>>,
): StnMapCandidate[] {
  return [
    ...own.map((s): StnMapCandidate => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, vars: s.vars, net: s.networks[0] === 'bz' ? 'bz' : s.networks[0] === 'imis' ? 'imis' : 'tirol', op: s.operator })),
    ...obs.filter((s) => (s.networks ?? []).some((n) => STN_OBS_NETWORKS.includes(n)))
      .map((s): StnMapCandidate => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, vars: obsVarsNow(obsLatest[s.id]), net: 'obs', op: STN_OBS_OPERATOR[s.country] ?? s.country }))
      .filter((c) => c.vars.length > 0),
  ];
}

export interface StnMapOpts {
  file: string; build: string; builtAt: string; km?: number; dz?: number;
  /** Where the distance counts from. Default = the rule of phase GO (the catalogue point). `outline` needs an outline on EVERY glacier. */
  from?: StnMapFrom;
  /** Quantities of the mapping. Default = those of phase GO. */
  quantities?: readonly StnQuantityDef[];
}
/**
 * One mapping: per glacier and quantity the nearest station that lists the quantity, within `km` of the glacier — of its outline
 * (`from: 'outline'`, 0 on the ice) or of its catalogue point — and with an elevation inside the glacier's range ± `dz`. Ties go to
 * the lower id. A glacier without any station has no entry. Pure. Throws when `outline` is asked for and a glacier has none: a
 * mapping that silently mixes the two rules would state a distance without saying from where.
 */
export function buildStnMap(glaciers: readonly StnMapGlacier[], cands: readonly StnMapCandidate[], opts: StnMapOpts): StnMapDoc {
  const km = opts.km ?? STN_MAP_KM, dz = opts.dz ?? STN_MAP_DZ, from = opts.from ?? 'catalogue point', quantities = opts.quantities ?? STN_QUANTITIES_GO;
  const zero = (): StnMapReportRow => ({ glaciers: 0, withStation: 0, q: Object.fromEntries(quantities.map((q) => [q.key, 0])) as Partial<Record<StnQuantity, number>> });
  const doc: StnMapDoc = {
    schema: 1, kind: 'glacier/station-map', file: opts.file, build: opts.build, builtAt: opts.builtAt,
    rule: { km, dz, from, elevation: 'range ± dz', dzShown: 'station − median' },
    stations: {}, glaciers: {}, report: { all: zero(), byCountry: {}, byRegion: {}, byNet: {} },
  };
  const rad = Math.PI / 180;
  for (const g of glaciers) {
    let dist: (s: StnMapCandidate) => number;
    if (from === 'outline') {
      const polys = g.outline;
      if (!polys || !polys.length) throw new Error(`Umriss fehlt: ${g.id}`);
      // bounding box of the outline widened by the window: everything outside is further than `km`
      let w = Infinity, e = -Infinity, s0 = Infinity, n = -Infinity;
      for (const poly of polys) for (const p of poly[0] ?? []) { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s0) s0 = p[1]; if (p[1] > n) n = p[1]; }
      const dLat = km / 111.195, dLon = km / (111.195 * Math.cos(((s0 + n) / 2) * rad));
      dist = (s) => (s.lat < s0 - dLat || s.lat > n + dLat || s.lon < w - dLon || s.lon > e + dLon ? Infinity : stnOutlineKm(polys, s.lat, s.lon));
    } else dist = (s) => stnDistanceKm(g.lat, g.lon, s.lat, s.lon);
    const near = cands.filter((s) => s.elev >= g.z[0] - dz && s.elev <= g.z[2] + dz)
      .map((s) => ({ s, km: dist(s) })).filter((x) => x.km <= km)
      .sort((a, b) => a.km - b.km || (a.s.id < b.s.id ? -1 : 1));
    const hits: Partial<Record<StnQuantity, StnMapHit>> = {};
    for (const q of quantities) {
      const x = near.find((c) => c.s.vars.includes(q.has));
      if (!x) continue;
      hits[q.key] = [x.s.id, r1(x.km), Math.round(x.s.elev - g.z[1])];
      doc.stations[x.s.id] = { name: x.s.name, elev: x.s.elev, lat: x.s.lat, lon: x.s.lon, net: x.s.net, op: x.s.op };
      doc.report.byNet[x.s.net] = (doc.report.byNet[x.s.net] ?? 0) + 1;
    }
    const any = Object.keys(hits).length > 0;
    if (any) doc.glaciers[g.id] = hits;
    for (const row of [doc.report.all, (doc.report.byCountry[g.country] ??= zero()), (doc.report.byRegion[g.region] ??= zero())]) {
      row.glaciers++; if (any) row.withStation++;
      for (const q of quantities) if (hits[q.key]) row.q[q.key] = (row.q[q.key] ?? 0) + 1;
    }
  }
  return doc;
}

/**
 * The mapping document of phase GI: distance to the outline in both sections. Top level = networks and quantities of phase GO
 * (what a page from before phase GI reads); `ext` = every network and quantity.
 */
export function buildStnMapDoc(glaciers: readonly StnMapGlacier[], cands: readonly StnMapCandidate[], opts: Pick<StnMapOpts, 'file' | 'build' | 'builtAt' | 'km' | 'dz'>): StnMapDoc {
  const base = buildStnMap(glaciers, cands.filter((c) => STN_GO_NETS.includes(c.net)), { ...opts, from: 'outline', quantities: STN_QUANTITIES_GO });
  const all = buildStnMap(glaciers, cands, { ...opts, from: 'outline', quantities: STN_QUANTITIES });
  return { ...base, ext: { rule: all.rule, stations: all.stations, glaciers: all.glaciers, report: all.report } };
}

// --- Documents: checks the client and the verifier share ---------------------------------------------------------------------------

/** `mapAt` = when the mapping was last recomputed (the producer does it once a day; the file changes only when the result does). */
export interface GlacierStnPointer {
  /** Newest FULL hour the store holds — what a page from before the half-hour step reads. */
  hour: string;
  /** Newest slot (full or half hour); `builtAt` and `n` belong to its document. Absent in a pointer from before the half-hour step. */
  slot?: string;
  builtAt: string; n: number; map: string | null; mapAt?: string | null;
}
/** The document a page reads: the newest slot, or — pointer from before the half-hour step — the hour. */
export const stnPointerKey = (p: Pick<GlacierStnPointer, 'hour' | 'slot'>): string => (typeof p.slot === 'string' && GLACIER_STN_SLOT_RE.test(p.slot) ? p.slot : p.hour);

/** Problems of an hour document (empty = fine). */
export function stnHourProblems(d: unknown): string[] {
  const o = d as Partial<StnHourDoc> | null, bad: string[] = [];
  if (!o || o.schema !== 1 || o.kind !== 'glacier/stations-hour') return ['kein Stundendokument der Stationen'];
  if (typeof o.hour !== 'string' || !GLACIER_STN_SLOT_RE.test(o.hour)) bad.push('Stunde fehlt');
  if (!o.stations || typeof o.stations !== 'object') return [...bad, 'ohne Stationen'];
  if (!Array.isArray(o.sources) || !o.sources.length) bad.push('ohne Quellen');
  const entries = (stations: Record<string, StnEntry>, idRe: RegExp) => {
    for (const [id, e] of Object.entries(stations)) {
      if (!idRe.test(id)) bad.push(`${id}: unbekanntes Netz`);
      if (!e || typeof e.t !== 'string' || !Number.isFinite(Date.parse(e.t)) || !e.v || typeof e.v !== 'object') { bad.push(`${id}: ohne Stempel oder Werte`); continue; }
      for (const [k, x] of Object.entries(e.v)) if (!(k in STN_VARS) || !isNum(x) || !inRange(k as StnVar, x)) bad.push(`${id}.${k}: außerhalb der Grenzen`);
      for (const k of STN_SUM_KEYS) { const s = e[k]; if (s && (!isNum(s.mm) || !inRange(k, s.mm) || s.complete === false)) bad.push(`${id}.${k}: Summe unzulässig`); }
      if (e.hsd != null) for (const [k, x] of Object.entries(e.hsd)) { const lim = STN_HSD_LIMITS[k as StnHsdKey]; if (!lim || !isNum(x) || x < lim[0] || x > lim[1]) bad.push(`${id}.hsd.${k}: außerhalb der Grenzen`); }
    }
  };
  // the GO section carries the networks of phase GO only; a later network belongs to `ext` (a page from before phase GI rejects it here)
  entries(o.stations, STN_GO_ID_RE);
  if (o.ext != null) {
    if (!o.ext.stations || typeof o.ext.stations !== 'object') bad.push('ext ohne Stationen');
    else entries(o.ext.stations, STN_EXT_ID_RE);
  }
  return bad;
}

/** Problems of a map document (empty = fine); `glacierIds` = the catalogue it must fit. */
export function stnMapProblems(d: unknown, glacierIds?: ReadonlySet<string>): string[] {
  const o = d as Partial<StnMapDoc> | null, bad: string[] = [];
  if (!o || o.schema !== 1 || o.kind !== 'glacier/station-map') return ['keine Zuordnung der Stationen'];
  if (typeof o.file !== 'string' || !GLACIER_STN_MAP_RE.test(o.file) || typeof o.build !== 'string' || !GLACIER_BUILD_RE.test(o.build) || !o.file.startsWith(`${o.build}.`)) bad.push('Dateiname passt nicht zum Build');
  if (!o.stations || !o.glaciers || !o.rule) return [...bad, 'ohne Stationen, Gletscher oder Regel'];
  const section = (s: StnMapSection, quantities: readonly StnQuantityDef[], goOnly: boolean, tag: string) => {
    const keys = new Set<string>(quantities.map((q) => q.key));
    for (const [gid, hits] of Object.entries(s.glaciers)) {
      if (glacierIds && !glacierIds.has(gid)) bad.push(`${tag}${gid}: nicht im Katalog`);
      for (const [q, h] of Object.entries(hits ?? {})) {
        if (!keys.has(q) || !Array.isArray(h) || typeof h[0] !== 'string' || !isNum(h[1]) || !isNum(h[2])) { bad.push(`${tag}${gid}.${q}: Form`); continue; }
        if (!s.stations[h[0]]) bad.push(`${tag}${gid}.${q}: Station ${h[0]} fehlt`);
        else if (goOnly && !STN_GO_NETS.includes(s.stations[h[0]].net)) bad.push(`${tag}${gid}.${q}: Netz ${s.stations[h[0]].net} gehört in den Abschnitt ext`);
        if (h[1] > s.rule.km + 0.05) bad.push(`${tag}${gid}.${q}: ${h[1]} km über dem Fenster`);
      }
    }
  };
  // the GO section: quantities and networks of phase GO only (a page from before phase GI rejects an unknown quantity and has no source note for a later network)
  section(o as StnMapSection, STN_QUANTITIES_GO, true, '');
  if (o.ext != null) {
    if (!o.ext.stations || !o.ext.glaciers || !o.ext.rule) bad.push('ext ohne Stationen, Gletscher oder Regel');
    else section(o.ext, STN_QUANTITIES, false, 'ext.');
  }
  return bad;
}
