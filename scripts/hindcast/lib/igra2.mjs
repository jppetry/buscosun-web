/**
 * igra2.mjs — NOAA/NCEI IGRA v2.2 radiosonde soundings of the 19 active DACH stations (for the
 * inversion shape φ of AP10a). Format: doc/igra2-data-format.txt (header record `#…` + NUMLEV fixed-width
 * level records). Files: access/data-y2d/<ID>-data-beg<YYYY>.txt.zip (current year) and
 * access/data-por/<ID>-data.txt.zip (period of record, up to 76 MB zipped) — the por archive is
 * stream-inflated and filtered line by line, never held as one string.
 */
import { createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT, CACHE_TRUTH, H, RUN, httpGet, atomicWrite, fileAgeMs, zipEntries, zipRawSlice, readJsonGz, writeJsonGz } from './truthHist.mjs';

export const IGRA_BASE = 'https://www.ncei.noaa.gov/data/integrated-global-radiosonde-archive';
export const IGRA_DIR = join(HINDCAST_ROOT, 'igra');
const IGRA_CACHE = join(CACHE_TRUTH, 'igra');
/** The 19 active DACH stations (ids checked against doc/igra2-station-list.txt and access/data-y2d, 2026-09-19). */
export const IGRA_STATIONS = Object.freeze([
  ['AUM00011010', 'Linz'], ['AUM00011035', 'Wien'], ['AUM00011120', 'Innsbruck'], ['AUM00011240', 'Graz'],
  ['GMM00010035', 'Schleswig'], ['GMM00010113', 'Norderney'], ['GMM00010184', 'Greifswald'], ['GMM00010238', 'Bergen'],
  ['GMM00010304', 'Meppen'], ['GMM00010393', 'Lindenberg'], ['GMM00010410', 'Essen'], ['GMM00010548', 'Meiningen'],
  ['GMM00010618', 'Idar-Oberstein'], ['GMM00010739', 'Stuttgart'], ['GMM00010771', 'Kuemmersbruck'], ['GMM00010868', 'Oberschleissheim'],
  ['GMM00010954', 'Altenstadt'], ['GMM00010962', 'Hohenpeissenberg'], ['SZM00006610', 'Payerne'],
]);
export const IGRA_FLAGS_FORMAT = 'flags = LVLTYP1 LVLTYP2 PFLAG ZFLAG TFLAG (IGRA v2.2; LVLTYP1 1 Standarddruckflaeche, 2 andere Druckflaeche, 3 ohne Druck; LVLTYP2 1 Boden, 2 Tropopause, 0 sonst; Flags A/B = Klimatologie-Pruefung Stufe 1/2, "-" = leer)';

export async function igraStationList() {
  const p = join(IGRA_CACHE, 'igra2-station-list.txt');
  if (fileAgeMs(p) > 7 * 24 * H) { const { buf } = await httpGet(`${IGRA_BASE}/doc/igra2-station-list.txt`, { net: 'igra' }); atomicWrite(p, buf); } else RUN.net('igra').cacheHits++;
  const out = new Map();
  for (const l of readFileSync(p, 'latin1').split(/\r?\n/)) {
    if (l.length < 70) continue;
    out.set(l.slice(0, 11), { id: l.slice(0, 11), lat: Number(l.slice(12, 20)), lon: Number(l.slice(21, 30)), elev: Number(l.slice(31, 37)), name: l.slice(41, 71).trim(), firstYear: Number(l.slice(72, 76)), lastYear: Number(l.slice(77, 81)), nobs: Number(l.slice(82, 88)) });
  }
  return out;
}

/** y2d when the whole window lies in the current year (it starts Jan 1 of that year), else por. */
export async function igraFetch(id, fromMs) {
  const year = new Date().getUTCFullYear();
  const useY2d = new Date(fromMs).getUTCFullYear() >= year;
  const file = useY2d ? `${id}-data-beg${year}.txt.zip` : `${id}-data.txt.zip`;
  const url = `${IGRA_BASE}/access/${useY2d ? 'data-y2d' : 'data-por'}/${file}`;
  const p = join(IGRA_CACHE, file);
  if (fileAgeMs(p) > (useY2d ? 12 : 7 * 24) * H) {
    const { buf, headers } = await httpGet(url, { net: 'igra', timeoutMs: 900_000 });
    atomicWrite(p, buf);
    atomicWrite(`${p}.meta.json`, JSON.stringify({ url, fetchedAtMs: Date.now(), lastModified: headers.get('last-modified'), bytes: buf.length }));
  } else RUN.net('igra').cacheHits++;
  return { path: p, url, file };
}

const num = (s) => { const v = Number(s); return Number.isFinite(v) ? v : null; };
const val = (s, scale = 1) => { const v = num(s.trim()); return v == null || v === -9999 || v === -8888 ? null : v * scale; };
const flag = (c) => (c && c.trim() ? c : '-');
export function parseIgraHeader(l) {
  const hour = Number(l.slice(24, 26)), rel = l.slice(27, 31);
  const y = Number(l.slice(13, 17)), m = Number(l.slice(18, 20)), d = Number(l.slice(21, 23));
  const relH = Number(rel.slice(0, 2)), relM = Number(rel.slice(2, 4));
  const relMs = rel === '9999' || relH > 23 ? null : Date.UTC(y, m - 1, d, relH, relM > 59 ? 0 : relM);
  return {
    id: l.slice(1, 12), y, m, d, hour, relTime: rel,
    launchMs: hour <= 23 ? Date.UTC(y, m - 1, d, hour) : null,
    releaseMs: relMs, releaseMinuteKnown: relMs != null && relM <= 59,
    numLev: Number(l.slice(32, 36)), pSrc: l.slice(37, 45).trim(), npSrc: l.slice(46, 54).trim(),
    lat: Number(l.slice(55, 62)) / 10000, lon: Number(l.slice(63, 71)) / 10000,
  };
}
export function parseIgraLevel(l) {
  const et = val(l.slice(3, 8));
  return {
    p: val(l.slice(9, 15), 0.01), z: val(l.slice(16, 21)), t: val(l.slice(22, 27), 0.1), rh: val(l.slice(28, 33), 0.1),
    dpd: val(l.slice(34, 39), 0.1), wdir: val(l.slice(40, 45)), wspd: val(l.slice(46, 51), 0.1),
    etimeS: et == null ? null : Math.floor(et / 100) * 60 + (et % 100),
    flags: `${l[0]}${l[1]}${flag(l[15])}${flag(l[21])}${flag(l[27])}`,
  };
}
const round = (v, d) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);

/** Stream the single text member of an IGRA zip and keep the soundings with nominal (or release) time in [fromMs, toMs]. */
export async function parseIgraZip(path, fromMs, toMs) {
  const buf = readFileSync(path);
  const e = zipEntries(buf)[0];
  const src = e.method === 0 ? Readable.from([zipRawSlice(buf, e)]) : Readable.from([zipRawSlice(buf, e)]).pipe(createInflateRaw());
  const out = [];
  let cur = null, keep = false, carry = '', lines = 0;
  const onLine = (l) => {
    lines++;
    if (l[0] === '#') {
      const h = parseIgraHeader(l);
      const t = h.launchMs ?? h.releaseMs;
      keep = t != null && t >= fromMs && t <= toMs;
      cur = keep ? { launchMs: h.launchMs, nominalHour: h.hour, relTime: h.relTime, releaseMs: h.releaseMs, numLev: h.numLev, pSrc: h.pSrc, npSrc: h.npSrc, levels: [] } : null;
      if (cur) out.push(cur);
      return;
    }
    if (!keep || !cur || l.length < 51) return;
    const v = parseIgraLevel(l);
    cur.levels.push({ p: round(v.p, 2), z: v.z, t: round(v.t, 1), rh: round(v.rh, 1), dpd: round(v.dpd, 1), wdir: v.wdir, wspd: round(v.wspd, 1), etimeS: v.etimeS, flags: v.flags });
  };
  for await (const chunk of src) {
    const s = carry + chunk.toString('latin1');
    const parts = s.split('\n');
    carry = parts.pop();
    for (const l of parts) onLine(l.replace(/\r$/, ''));
  }
  if (carry) onLine(carry.replace(/\r$/, ''));
  return { soundings: out, lines };
}

/** Parse + merge into igra/<id>.json.gz (union by launch/release time; a re-parse replaces the same sounding). */
export async function igraStation(id, name, fromMs, toMs, list) {
  const src = await igraFetch(id, fromMs);
  const { soundings, lines } = await parseIgraZip(src.path, fromMs, toMs);
  const meta = list.get(id) ?? {};
  const outP = join(IGRA_DIR, `${id}.json.gz`);
  const old = existsSync(outP) ? readJsonGz(outP) : null;
  const key = (s) => `${s.launchMs ?? 'x'}|${s.relTime}`;
  const merged = new Map((old?.soundings ?? []).map((s) => [key(s), s]));
  for (const s of soundings) merged.set(key(s), s);
  const all = [...merged.values()].sort((a, b) => (a.launchMs ?? a.releaseMs) - (b.launchMs ?? b.releaseMs));
  const windows = [...(old?.windows ?? []), { fromMs, toMs, file: src.file, parsedAt: new Date().toISOString(), soundings: soundings.length }];
  const doc = {
    schema: 1, kind: 'hindcast/igra2', station: id, name: meta.name ?? name, label: name, lat: meta.lat ?? null, lon: meta.lon ?? null, elev: meta.elev ?? null,
    source: { base: IGRA_BASE, lastFile: src.url, licence: 'NOAA/NCEI IGRA v2.2 — public domain (U.S. Government work)', format: `${IGRA_BASE}/doc/igra2-data-format.txt` },
    units: { p: 'hPa (PRESS/100)', z: 'm gpm (GPH)', t: 'degC (TEMP/10)', rh: 'pct (RH/10)', dpd: 'K (DPDP/10)', wdir: 'deg', wspd: 'm/s (WSPD/10)', etimeS: 's seit Start (ETIME MMMSS)' },
    missing: '-9999 (fehlt) und -8888 (von der IGRA-QS entfernt) ⇒ null',
    launchNote: 'launchMs = nominale Stunde (HOUR) am Datum des Kopfes; relTime = RELTIME (HHMM, "…99" = nur Stunde, 9999 = fehlt); releaseMs daraus, sonst null.',
    flagsFormat: IGRA_FLAGS_FORMAT,
    windows, soundings: all,
  };
  writeJsonGz(outP, doc);
  return { id, soundings: soundings.length, total: all.length, levels: soundings.reduce((n, s) => n + s.levels.length, 0), lines, file: src.file };
}
