#!/usr/bin/env node
/**
 * Phase WT — builds the catalogue of the water temperature, `sea/v1/static/watertemp.json` (`seaWaterTemp.ts`), from the
 * step-0 measurement (`scripts/sea/spike/wt-probe.mjs` → `audit/seewetter-wassertemperatur/spike/wt-probe.json`). The
 * catalogue is what was measured — nothing is searched here, and the producer searches nothing either.
 *
 *   model    per spot the DKSS point the measurement picked (nearest grid point with water in every hour of the run,
 *            E-WT-3), kept when its grid point lies within `WT_MODEL_MAX_KM` of the spot
 *   station  per spot the nearest station that DELIVERED a water temperature in the measurement and measures the water
 *            the spot lies at (E-WT-4): WSV stations of the waters `WT_WSV_WATERS`, no sluice („Siel“); DMI stations as
 *            they are. Referenced by the spot within `WT_STATION_MAX_KM`; listed for the archive within `WT_ARCHIVE_KM`.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/build-watertemp.mjs
 *     [--probe=audit/seewetter-wassertemperatur/spike/wt-probe.json] [--out=scripts/lib/fixtures/sea/wt/watertemp.json]
 * Last stdout line = JSON summary.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dmiDistKm } from '../../src/sea/seaDmi.ts';
import {
  SEA_WT_CATALOG_PRODUCT, WT_MODEL_MAX_KM, WT_STATION_MAX_KM, wtCatalogProblems, wtSiteOf, wtStationKey,
} from '../../src/sea/seaWaterTemp.ts';

const SELF = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SELF), '../..');
export const WT_PROBE_FILE = 'audit/seewetter-wassertemperatur/spike/wt-probe.json';
/** WSV: the sea and the tidal streams the spots lie at (`set`) — a tributary behind a barrier is another water. */
export const WT_WSV_WATERS = Object.freeze(['NORDSEE', 'JADE', 'WESER', 'ELBE']);
/** The nearest station of a spot is archived up to this distance (`set`) — a record cannot be made up later (PEGELONLINE holds 31 days). */
export const WT_ARCHIVE_KM = 40;
/** A station counts as delivering when its newest value in the measurement was at most this old. */
const DELIVERED_MS = 3 * 3_600_000;

const SMALL = new Set(['auf', 'am', 'an', 'der', 'bei', 'im']);
const ABBR = { WHV: 'Wilhelmshaven', BHV: 'Bremerhaven', AP: 'AP', BP: 'BP', ABZ: 'ABZ', D1: 'D1', LFK: 'LFK', UP: 'UP', OW: 'OW', UW: 'UW' };
/** PEGELONLINE writes names in capitals: „LIST AUF SYLT“ → „List auf Sylt“, „WHV NEUER VORHAFEN“ → „Wilhelmshaven Neuer Vorhafen“. */
export function wsvDisplayName(raw) {
  return raw.split(' ').map((w, i) => {
    if (ABBR[w]) return ABBR[w];
    const lower = w.toLocaleLowerCase('de-DE');
    if (i > 0 && SMALL.has(lower)) return lower;
    return lower.replace(/(^|-)(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('de-DE'));
  }).join(' ');
}
const waterName = (w) => (w ? w.charAt(0) + w.slice(1).toLocaleLowerCase('de-DE') : null);

/** The usable stations of the measurement, in catalogue form. Pure. */
export function wtUsableStations(probe) {
  const out = [];
  for (const s of probe.wsv ?? []) {
    // `ageMin` = age of the station's newest value when the station list was read.
    const delivered = s.ageMin != null && s.ageMin * 60_000 <= DELIVERED_MS;
    if (!delivered || !WT_WSV_WATERS.includes(String(s.water).toUpperCase()) || /\bSIEL\b/i.test(s.name)) continue;
    out.push({ key: wtStationKey('wsv', String(s.id)), net: 'wsv', id: String(s.id), name: wsvDisplayName(s.name), water: waterName(s.water), site: wtSiteOf(s.name), lat: s.lat, lon: s.lon });
  }
  for (const s of probe.dmi ?? []) {
    if (!(s.n3h > 0)) continue;
    out.push({ key: wtStationKey('dmi', String(s.id)), net: 'dmi', id: String(s.id), name: s.name, water: null, site: wtSiteOf(s.name), lat: s.lat, lon: s.lon });
  }
  return out;
}

/** The catalogue from the measurement. Pure. */
export function buildWtCatalog(probe) {
  const usable = wtUsableStations(probe);
  const spots = {}, used = new Map();
  for (const r of probe.rows) {
    let model = null;
    if (r.pick) {
      const km = +dmiDistKm(r.lat, r.lon, r.pick.grid.lat, r.pick.grid.lon).toFixed(2);
      if (km <= WT_MODEL_MAX_KM) model = { coll: r.pick.coll, lat: r.pick.asked.lat, lon: r.pick.asked.lon, km };
    }
    const near = usable.map((s) => ({ s, km: +dmiDistKm(r.lat, r.lon, s.lat, s.lon).toFixed(1) })).sort((a, b) => a.km - b.km)[0] ?? null;
    if (near && near.km <= WT_ARCHIVE_KM) used.set(near.s.key, near.s);
    spots[r.id] = { model, station: near && near.km <= WT_STATION_MAX_KM ? { key: near.s.key, km: near.km } : null };
  }
  return {
    schema: 1, product: SEA_WT_CATALOG_PRODUCT, built: probe.at,
    from: `Messung Schritt 0 vom ${probe.at} (${WT_PROBE_FILE}): DKSS-Punkt je Spot, nächste liefernde Station je Spot`,
    stationMaxKm: WT_STATION_MAX_KM, modelMaxKm: WT_MODEL_MAX_KM,
    spots,
    stations: [...used.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const probe = JSON.parse(readFileSync(resolve(ROOT, String(args.probe ?? WT_PROBE_FILE)), 'utf8'));
  const cat = buildWtCatalog(probe);
  const problems = wtCatalogProblems(cat);
  if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
  const out = resolve(ROOT, String(args.out ?? 'scripts/lib/fixtures/sea/wt/watertemp.json'));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(cat) + '\n');
  const ids = Object.keys(cat.spots);
  console.log(JSON.stringify({ out, spots: ids.length, model: ids.filter((id) => cat.spots[id].model).length, station: ids.filter((id) => cat.spots[id].station).length, stations: cat.stations.length, bytes: Buffer.byteLength(JSON.stringify(cat)) + 1 }));
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) main();
