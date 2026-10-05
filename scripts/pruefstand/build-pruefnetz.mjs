#!/usr/bin/env node
/**
 * build-pruefnetz.mjs — builds the frozen station network of protocol P1 ONCE (`protokoll/p1/pruefnetz.json`).
 * Re-running it with the same inputs writes the same bytes; the file is part of the protocol hash, so a change is P2.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/pruefstand/build-pruefnetz.mjs [--check]
 *
 * Inputs (read-only): the feature table of the hindcast (`features/points.v1.json`: position, measured station height,
 * terrain scales), `scripts/punktarchiv/points.json` (truth network ids), the hindcast's `truth/stations.json`
 * (TAWES → klima-v2 station, proven on an overlap window), the DWD Stationslexikon and the CDC 10-min station lists
 * (cached under `<PS_ROOT>/quellen/meta/`).
 *
 * Roles (E-PS-2, Jan 05.10.2026): 25 % of the stations WITH a W1 truth are role B (held out: masked in the replay),
 * drawn per stratum country × height band × terrain class with a fixed seed. Every station of today was in the fit of
 * every existing version (D-PS-9) — `seenInFit` says so; B is "masked in the replay", not "never seen".
 */
import { existsSync, readFileSync } from 'node:fs';
import { PS_DIR, PS_ROOT, HINDCAST_ROOT, REPO, cachedGet, distKm, hashOf, p, parseArgs, readJson, writeJson } from './lib/common.mjs';
import { lcg } from '../../src/point/calibFit.ts';

const args = parseArgs();
const META = p(PS_ROOT, 'quellen/meta');
const SEED = 20261005;          // set: the date of Jan's decision E-PS-2
const SHARE_B = 0.25;           // E-PS-2
const PAIR_MAX_KM = 15, PAIR_MIN_DH_M = 300;   // Konzept §4 (pairs under 15 km); 300 m = D-PS-9 (36 pairs)
const CDC = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes';
const CDC_LISTS = { tu: `${CDC}/air_temperature/now/zehn_now_tu_Beschreibung_Stationen.txt`, ff: `${CDC}/wind/now/zehn_now_ff_Beschreibung_Stationen.txt`, fx: `${CDC}/extreme_wind/now/zehn_now_fx_Beschreibung_Stationen.txt`, rr: `${CDC}/precipitation/now/zehn_now_rr_Beschreibung_Stationen.txt` };
const STATLEX = 'https://www.dwd.de/DE/leistungen/klimadatendeutschland/statliste/statlex_html.html?view=nasPublication&nn=16102';

const feat = readJson(p(HINDCAST_ROOT, 'features/points.v1.json')).byPoint;
const points = new Map(readJson(p(REPO, 'scripts/punktarchiv/points.json')).points.map((x) => [x.id, x]));
const hcStations = readJson(p(HINDCAST_ROOT, 'truth/stations.json')).points;

// ── DE: archive point (WMO id) → CDC Stations_id over the Stationslexikon (D-PS-2: 203 of 203 unique)
const cdc = new Map();
for (const [k, u] of Object.entries(CDC_LISTS)) {
  const txt = (await cachedGet(u, p(META, `zehn_now_${k}_stationen.txt`))).toString('latin1');
  for (const l of txt.split(/\r?\n/).slice(2)) {
    const m = l.match(/^\s*(\d+)\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(.*)$/);
    if (!m) continue;
    const id = m[1].padStart(5, '0');
    const rec = cdc.get(id) ?? { id, elev: +m[4], lat: +m[5], lon: +m[6], vars: [] };
    rec.vars.push(k);
    cdc.set(id, rec);
  }
}
const lexHtml = (await cachedGet(STATLEX, p(META, 'statlex.html'))).toString('latin1');
const lex = [];
for (const m of lexHtml.matchAll(/<tr><td>(.*?)<\/td><td[^>]*>(\d+)<\/td><td[^>]*>(\w+)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>([^<]*)<\/td><td[^>]*>[^<]*<\/td><td[^>]*>[^<]*<\/td><td>([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g)) {
  const d = (s) => { const x = /(\d{2})\.(\d{2})\.(\d{4})/.exec(s); return x ? `${x[3]}${x[2]}${x[1]}` : ''; };
  lex.push({ sid: m[2].padStart(5, '0'), kind: m[3], kenn: m[4].trim(), to: d(m[9]) });
}
const lexNewest = lex.reduce((a, r) => (r.to > a ? r.to : a), '');
const lexOpenFrom = String(Number(lexNewest) - 100);   // open = end within about a month of the newest end date in the list
function cdcOf(id) {
  const sids = [...new Set(lex.filter((r) => r.kenn === id && ['SY', 'MN', 'TU', 'FF'].includes(r.kind) && r.to >= lexOpenFrom).map((r) => r.sid))];
  if (sids.length !== 1) return { sid: null, why: sids.length ? `Stationslexikon nennt ${sids.length} offene Stationen` : 'keine offene Station im Stationslexikon' };
  const c = cdc.get(sids[0]);
  if (!c) return { sid: sids[0], why: 'keine 10-min-Daten in CDC (Flugplatz-Station)' };
  return { sid: sids[0], vars: c.vars };
}

// ── terrain class (D-PS-9; thresholds are a setting of P1, not fitted) and height band
const band = (e) => (e < 300 ? '<300' : e < 800 ? '300-800' : e < 1500 ? '800-1500' : '>1500');
function terrainClass(f) {
  const s = f?.terrain?.scales; if (!s) return 'unknown';
  const tpi2 = s.tpiM[2], tpi8 = s.tpiM[4], rel4 = s.spreadM[3], rel8 = s.spreadM[4], slope = f.terrain.slopeDeg ?? 0;
  if (tpi2 >= 150 && tpi8 >= 300) return 'summit';
  if (rel8 < 40 && Math.abs(tpi2) < 20) return 'flat';
  if ((tpi2 <= -40 && rel4 >= 80) || tpi8 <= -200) return 'valley';
  if (tpi2 >= 40 || slope >= 8) return 'slope-ridge';
  return 'hill';
}

const stations = [];
for (const id of Object.keys(feat).sort()) {
  const f = feat[id];
  if (!['DE', 'AT', 'CH', 'LI'].includes(f.country) || f.flags.includes('noTerrain')) continue;
  const land = f.country === 'LI' ? 'CH' : f.country;
  const pt = points.get(id);
  let w1 = null, w1Why = null;
  if (land === 'DE') { const c = cdcOf(id); if (c.vars) w1 = { net: 'cdc', id: c.sid, vars: c.vars }; else w1Why = c.why; }
  else if (land === 'AT') { const k = hcStations[id]?.tawes?.klima; if (k?.id) w1 = { net: 'klima', id: String(k.id), tawes: pt?.truth?.tawes ?? id }; else w1Why = 'keine klima-v2-Station zugeordnet'; }
  else { const a = pt?.truth?.smn; if (a) w1 = { net: 'smn', id: a }; else w1Why = 'keine SMN-Kennung'; }
  const cls = terrainClass(f);
  stations.push({ id, name: f.name, land, country: f.country, lat: f.lat, lon: f.lon, elevM: f.elevM, band: band(f.elevM), cls, stratum: `${land}|${band(f.elevM)}|${cls}`, role: 'A', seenInFit: true, w1, ...(w1Why ? { w1Why } : {}) });
}

// ── role B: per stratum, among the stations with a W1 truth, a seeded draw
const rnd = lcg(SEED);
const strata = new Map();
for (const s of stations) if (s.w1) { if (!strata.has(s.stratum)) strata.set(s.stratum, []); strata.get(s.stratum).push(s); }
const strataOut = [];
for (const key of [...strata.keys()].sort()) {
  const list = strata.get(key);
  const x = SHARE_B * list.length;
  const nB = x >= 0.5 ? Math.max(1, Math.round(x)) : 0;
  const order = list.map((s) => [rnd(), s]).sort((a, b) => a[0] - b[0] || (a[1].id < b[1].id ? -1 : 1));
  for (let i = 0; i < nB; i++) order[i][1].role = 'B';
  strataOut.push({ stratum: key, n: list.length, b: nB });
}
// ── nearest anchor (role A) for every station: the neighbour whose measurement and station product a B point gets
const A = stations.filter((s) => s.role === 'A');
for (const s of stations) {
  let best = null;
  for (const a of A) { if (a.id === s.id) continue; const d = distKm(s, a); if (d > 0 && (!best || d < best.km)) best = { id: a.id, km: Math.round(d * 1000) / 1000, dElevM: Math.round(a.elevM - s.elevM) }; }
  s.anchor = best;
}
// ── valley/mountain pairs
const pairs = [];
for (let i = 0; i < stations.length; i++) for (let j = i + 1; j < stations.length; j++) {
  const a = stations[i], b = stations[j];
  if (!a.w1 || !b.w1 || Math.abs(a.lat - b.lat) > 0.2) continue;
  const d = distKm(a, b), dh = Math.abs(a.elevM - b.elevM);
  if (d <= PAIR_MAX_KM && dh >= PAIR_MIN_DH_M) pairs.push({ valley: a.elevM < b.elevM ? a.id : b.id, mountain: a.elevM < b.elevM ? b.id : a.id, km: Math.round(d * 100) / 100, dhM: Math.round(dh) });
}
pairs.sort((x, y) => y.dhM - x.dhM || (x.valley < y.valley ? -1 : 1));

const count = (f) => Object.fromEntries(['DE', 'AT', 'CH'].map((c) => [c, stations.filter((s) => s.land === c && f(s)).length]));
const doc = {
  schema: 1, kind: 'pruefstand/pruefnetz', protocol: 'P1', frozenAt: '2026-10-05',
  rule: {
    pool: 'Archivpunkte DE/AT/CH/LI mit Merkmalszeile (LI zählt als CH); W1-Wahrheit: DE DWD CDC 10 min über das Stationslexikon, AT GeoSphere klima-v2-10min (Zuordnung des Hindcast mit Überlappungsbeweis), CH MeteoSwiss SwissMetNet',
    roleB: `je Schicht Land × Höhenstufe × Geländeklasse round(${SHARE_B}·n), mindestens 1 ab n·${SHARE_B} ≥ 0,5; gezogen unter den Stationen mit W1-Wahrheit; LCG mit Seed ${SEED}`,
    seed: SEED, shareB: SHARE_B, provenance: { shareB: 'Jan E-PS-2', seed: 'set', terrainClass: 'set (D-PS-9, nicht gefittet)', pairs: `≤ ${PAIR_MAX_KM} km (Konzept §4), Δh ≥ ${PAIR_MIN_DH_M} m (set, D-PS-9)` },
    seenInFit: 'Alle Stationen waren im Fit jeder Bestandsversion (D-PS-9); Rolle B heißt hier: im Replay ohne eigene Station und ohne eigene Messung.',
  },
  counts: { stations: count(() => true), withW1: count((s) => !!s.w1), roleB: count((s) => s.role === 'B'), pairs: pairs.length, strata: strataOut.length, strataWithoutB: strataOut.filter((s) => !s.b).length },
  strata: strataOut, stations, pairs,
};
doc.hash = hashOf({ ...doc, hash: undefined });
const out = p(PS_DIR, 'protokoll/p1/pruefnetz.json');
if (args.check) {
  const old = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : null;
  console.log(old?.hash === doc.hash ? `unverändert (${doc.hash.slice(0, 12)})` : `ABWEICHUNG: Datei ${old?.hash?.slice(0, 12)} gegen Neubau ${doc.hash.slice(0, 12)}`);
  process.exit(old?.hash === doc.hash ? 0 : 1);
}
writeJson(out, doc);
console.log(JSON.stringify(doc.counts), doc.hash.slice(0, 12));
console.log('ohne W1:', stations.filter((s) => !s.w1).map((s) => `${s.id} ${s.name} (${s.w1Why})`).join('; '));
