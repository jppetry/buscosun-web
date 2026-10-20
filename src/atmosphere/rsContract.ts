/**
 * Radiosonde mirror `radiosonde/v1` in buscosun-data — shared by the producer (`scripts/radiosonde/rs-mirror.mjs`) and
 * the client (`radiosonde.ts`).
 *
 * Why a mirror: `opendata.dwd.de/weather/weather_reports/radiosonde/` sends no CORS header and keeps a file for ≈ 48 h.
 * Sources:
 *   `bufr/`          GTS TEMP bulletins (DWD and the neighbouring services): T, Td, wind per level (`tempBufr.ts`)
 *   `trajectories/`  GPS track per DWD ascent (JSON, 1 s): wind from the drift — only where the bulletin has no wind
 *
 * Layout:
 *   index.json                         RsIndex — mutable, read from raw.githubusercontent only
 *   state.json                         producer state (processed file names), never read by the client
 *   <YYYYMMDD>/<wmo>_<HHMM>_<hash8>.json  RsSoundingFile — immutable (a better bulletin of the same ascent gets a new
 *                                      hash ⇒ a new path), jsDelivr `@main` with raw as hedge
 *
 * Measured values only: nothing in this tree is interpolated with, corrected by or filled from a model.
 */

export const RS_DIR = 'radiosonde/v1';
export const RS_SCHEMA = 1;
export const RS_INDEX_PATH = `${RS_DIR}/index.json`;
export const RS_STATE_PATH = `${RS_DIR}/state.json`;
export const RS_SOURCE_BASE = 'https://opendata.dwd.de/weather/weather_reports/radiosonde';
export const RS_SOURCE_LABEL = 'Radiosonde · DWD Open Data (GTS-TEMP)';

/** Ascents older than this (launch time) leave the index and the tree. */
export const RS_RETAIN_H = 96;
/** Stations kept: DACH plus the neighbours whose ascents are the nearest measurement for a border region. */
export const RS_BOX = Object.freeze({ latMin: 43.5, latMax: 56, lonMin: 3, lonMax: 19 });

/** Thinning of the 1–2 s levels: at least this height step below / above RS_THIN_SPLIT_M (m). */
export const RS_THIN_LOW_M = 25;
export const RS_THIN_HIGH_M = 100;
export const RS_THIN_SPLIT_M = 5000;
/** GPS wind: centred difference over this window (s), damps the pendulum of the sonde under the balloon. */
export const RS_GPS_WINDOW_S = 30;

export type RsWindSource = 'bufr' | 'gps';

export interface RsIndexEntry {
  /** `<wmo>_<launch YYYYMMDDHHMM>` — one ascent. */
  id: string;
  wmo: string;
  name: string;
  lat: number;
  lon: number;
  elevM: number | null;
  /** Launch time, ISO UTC. */
  launch: string;
  path: string;
  /** Kept levels (after thinning) and levels of the source before thinning. */
  levels: number;
  rawLevels: number;
  /** Highest level reached (gpm) and its pressure (hPa). */
  topM: number;
  topHpa: number | null;
  /** T/Td from the bulletin present. */
  hasTemp: boolean;
  wind: RsWindSource | null;
}

export interface RsIndex {
  schema: number;
  updatedAt: string;
  source: string;
  retainH: number;
  soundings: RsIndexEntry[];
}

export interface RsSoundingFile {
  schema: number;
  id: string;
  wmo: string;
  name: string;
  lat: number;
  lon: number;
  elevM: number | null;
  launch: string;
  /** Which DWD files the values come from. */
  source: { bufr?: { file: string; centre: number; sequence: number }; gps?: { file: string } };
  wind: RsWindSource | null;
  /** Struct of arrays, one entry per kept level, ascending. null = not measured at that level. */
  z: number[];
  p: Array<number | null>;
  t: Array<number | null>;
  td: Array<number | null>;
  /** Wind direction (deg, from) and speed (m/s). */
  dd: Array<number | null>;
  ff: Array<number | null>;
  /** Position of the sonde (deg, 4 decimals) and seconds since launch. */
  lat_: Array<number | null>;
  lon_: Array<number | null>;
  dt: Array<number | null>;
}

export const rsSoundingDir = (launchMs: number) => {
  const d = new Date(launchMs);
  return `${RS_DIR}/${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
};

export const rsLaunchStamp = (launchMs: number) => new Date(launchMs).toISOString().replace(/[-:T]/g, '').slice(0, 12);

/** Station names (WMO index → name) of the stations in RS_BOX; a station missing here shows as „WMO <id>“. */
export const RS_STATION_NAMES: Readonly<Record<string, string>> = Object.freeze({
  '01400': 'Ekofisk (Plattform)',
  '06181': 'Kopenhagen', '06260': 'De Bilt', '06447': 'Uccle', '06458': 'Beauvechain', '06610': 'Payerne',
  '07145': 'Trappes', '07180': 'Nancy', '07481': 'Lyon', '07645': 'Nîmes',
  '10035': 'Schleswig', '10113': 'Norderney', '10184': 'Greifswald', '10200': 'Emden', '10238': 'Bergen',
  '10304': 'Meppen', '10393': 'Lindenberg', '10410': 'Essen', '10548': 'Meiningen', '10618': 'Idar-Oberstein',
  '10739': 'Stuttgart', '10771': 'Kümmersbruck', '10868': 'München', '10954': 'Altenstadt', '10962': 'Hohenpeißenberg',
  '11010': 'Linz', '11035': 'Wien', '11120': 'Innsbruck', '11240': 'Graz', '11520': 'Prag', '11747': 'Prostějov', '11952': 'Poprad',
  '12120': 'Łeba', '12374': 'Legionowo', '12425': 'Breslau', '12843': 'Budapest',
  '14015': 'Ljubljana', '14240': 'Zagreb',
  '16045': 'Udine', '16064': 'Novara', '16080': 'Mailand', '16113': 'Cuneo', '16144': 'San Pietro Capofiume',
});

export const rsStationName = (wmo: string) => RS_STATION_NAMES[wmo] ?? `WMO ${wmo}`;
