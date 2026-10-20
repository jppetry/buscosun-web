/**
 * Measured ascents from the radiosonde mirror `radiosonde/v1` (contract `rsContract.ts`) for the emagram and the section.
 * Shown as their own „gemessen“ line with station, distance and age — never blended with, corrected by or used to fill
 * the model profile. `?rs=0` switches the overlay off.
 *
 * Choice: the nearest station within RS_MAX_KM whose newest ascent is at most RS_MAX_AGE_H old (launch time); the
 * ascent itself is that station's newest one. `null` + reason otherwise (shown in the caption).
 */
import { RS_INDEX_PATH, type RsIndex, type RsIndexEntry, type RsSoundingFile, type RsWindSource } from './rsContract';
import { fetchTileBytes } from './atmoSounding';

const DATA_RAW = 'https://raw.githubusercontent.com/jppetry/buscosun-data/main';
const INDEX_TTL_MS = 5 * 60_000;

/** Farthest station still offered for a point (km) and for a section line (km beside the line). */
export const RS_MAX_KM = 200;
export const RS_SECTION_MAX_KM = 40;
/** Oldest ascent still shown (h since launch). */
export const RS_MAX_AGE_H = 30;

export interface MeasuredLevel {
  zM: number;
  pHpa: number | null;
  tC: number | null;
  tdC: number | null;
  windKmh: number | null;
  windDirDeg: number | null;
}

export interface MeasuredSounding {
  id: string;
  wmo: string;
  name: string;
  lat: number;
  lon: number;
  launchMs: number;
  /** Distance of the launch site from the point (km). */
  distanceKm: number;
  wind: RsWindSource | null;
  hasTemp: boolean;
  levels: MeasuredLevel[];
}

function overlayOff(): boolean {
  try { return new URLSearchParams(window.location.search).get('rs') === '0'; } catch { return false; }
}

let indexCache: { at: number; p: Promise<RsIndex> } | null = null;
function loadRsIndex(signal?: AbortSignal): Promise<RsIndex> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.p;
  const p = fetch(`${DATA_RAW}/${RS_INDEX_PATH}`, { signal, cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`Radiosonden-Index HTTP ${r.status}`);
    return r.json() as Promise<RsIndex>;
  });
  p.catch(() => { if (indexCache?.p === p) indexCache = null; });
  indexCache = { at: Date.now(), p };
  return p;
}

const fileCache = new Map<string, Promise<RsSoundingFile>>();
function loadRsFile(path: string, signal?: AbortSignal): Promise<RsSoundingFile> {
  let p = fileCache.get(path);
  if (!p) {
    p = fetchTileBytes(path, signal).then((b) => JSON.parse(new TextDecoder().decode(b)) as RsSoundingFile);
    p.catch(() => fileCache.delete(path));
    fileCache.set(path, p);
    while (fileCache.size > 12) fileCache.delete(fileCache.keys().next().value!);
  }
  return p;
}

export function kmBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const a = Math.sin(((lat2 - lat1) * r) / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Newest usable ascent per station (age window), nearest station first, by a distance function. */
function rankStations(index: RsIndex, dist: (e: RsIndexEntry) => number, maxKm: number, nowMs: number): Array<{ e: RsIndexEntry; km: number }> {
  const newest = new Map<string, RsIndexEntry>();
  for (const e of index.soundings) {
    const age = (nowMs - Date.parse(e.launch)) / 3_600_000;
    if (age < 0 || age > RS_MAX_AGE_H) continue;
    const cur = newest.get(e.wmo);
    if (!cur || Date.parse(e.launch) > Date.parse(cur.launch)) newest.set(e.wmo, e);
  }
  return [...newest.values()].map((e) => ({ e, km: dist(e) })).filter((x) => x.km <= maxKm).sort((a, b) => a.km - b.km);
}

function toMeasured(f: RsSoundingFile, distanceKm: number): MeasuredSounding {
  const levels: MeasuredLevel[] = f.z.map((z, i) => ({
    zM: z, pHpa: f.p[i], tC: f.t[i], tdC: f.td[i],
    windKmh: f.ff[i] == null ? null : f.ff[i]! * 3.6, windDirDeg: f.dd[i],
  }));
  return {
    id: f.id, wmo: f.wmo, name: f.name, lat: f.lat, lon: f.lon, launchMs: Date.parse(f.launch), distanceKm,
    wind: f.wind, hasTemp: f.t.some((t) => t != null), levels,
  };
}

/** The measured ascent for a point. Throws only on abort. */
export async function fetchMeasuredAtPoint(lat: number, lon: number, signal?: AbortSignal): Promise<{ sounding: MeasuredSounding | null; reason: string | null }> {
  if (overlayOff()) return { sounding: null, reason: 'abgeschaltet (?rs=0)' };
  try {
    const index = await loadRsIndex(signal);
    const ranked = rankStations(index, (e) => kmBetween(lat, lon, e.lat, e.lon), RS_MAX_KM, Date.now()).filter((x) => x.e.hasTemp);
    if (!ranked.length) return { sounding: null, reason: `kein Aufstieg der letzten ${RS_MAX_AGE_H} h im Umkreis von ${RS_MAX_KM} km` };
    const { e, km } = ranked[0];
    return { sounding: toMeasured(await loadRsFile(e.path, signal), km), reason: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { sounding: null, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** A measured ascent beside a section line: nearest station within RS_SECTION_MAX_KM of a column, with wind. */
export interface SectionMeasured extends MeasuredSounding {
  /** Position along the line (m) of the nearest column. */
  distanceM: number;
}

export async function fetchMeasuredForLine(
  columns: ReadonlyArray<{ lat: number; lon: number; distanceM: number }>, signal?: AbortSignal,
): Promise<{ measured: SectionMeasured | null; reason: string | null }> {
  if (overlayOff()) return { measured: null, reason: 'abgeschaltet (?rs=0)' };
  if (!columns.length) return { measured: null, reason: null };
  try {
    const index = await loadRsIndex(signal);
    const nearestCol = (e: RsIndexEntry) => {
      let best = { km: Infinity, distanceM: 0 };
      for (const c of columns) { const km = kmBetween(c.lat, c.lon, e.lat, e.lon); if (km < best.km) best = { km, distanceM: c.distanceM }; }
      return best;
    };
    const ranked = rankStations(index, (e) => nearestCol(e).km, RS_SECTION_MAX_KM, Date.now()).filter((x) => x.e.wind);
    if (!ranked.length) return { measured: null, reason: `kein Aufstieg der letzten ${RS_MAX_AGE_H} h näher als ${RS_SECTION_MAX_KM} km an der Linie` };
    const { e, km } = ranked[0];
    const m = toMeasured(await loadRsFile(e.path, signal), km);
    return { measured: { ...m, distanceM: nearestCol(e).distanceM }, reason: null };
  } catch (err) {
    if (signal?.aborted) throw err;
    return { measured: null, reason: err instanceof Error ? err.message : String(err) };
  }
}

/** Caption: „Radiosonde Stuttgart (10739) · 42 km · Start 20.10. 11:45 UTC, vor 8 h“. */
export function measuredCaption(m: MeasuredSounding, nowMs = Date.now()): string {
  const d = new Date(m.launchMs);
  const hh = (n: number) => String(n).padStart(2, '0');
  const ageH = Math.max(0, Math.round((nowMs - m.launchMs) / 3_600_000));
  return `Radiosonde ${m.name} (${m.wmo}) · ${Math.round(m.distanceKm)} km · Start ${hh(d.getUTCDate())}.${hh(d.getUTCMonth() + 1)}. ${hh(d.getUTCHours())}:${hh(d.getUTCMinutes())} UTC, vor ${ageH} h`;
}
