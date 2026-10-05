/**
 * points-extra.mjs — the archive's INPUT points (PA5, `audit/punktarchiv-erweiterung.md`, E-PS-11): the stations of the three
 * official measurement networks that are not archive points yet. A station can only be verified later if the archive holds the
 * forecast inputs at its place — measurements can be fetched for years, cube cells cannot (`buscosun-data` keeps 9–24 h).
 *
 *   AT   TAWES stations (GeoSphere `tawes-v1-10min`) that no point of `points.json` carries as `truth.tawes`
 *   CH   SwissMetNet stations (MeteoSwiss A1) that no point carries as `truth.smn`
 *   DE   DWD CDC stations of the 10-minute service with air temperature or wind, unless a DE point of `points.json` stands
 *        at the same site (`SAME_SITE`: the co-location limits of `points.mjs`, measured there — the DE points sit on the
 *        catalog position, rounded to two decimals)
 *   Precipitation-only stations (E-PA5-4, `precipOnly: true`, sorted BEHIND the others): DWD CDC stations of the 10-minute
 *        precipitation list that measure neither temperature nor wind, and the automatic precipitation stations of
 *        MeteoSwiss (`ogd-smn-precip`, net `smnp`). Their measurements are not in the slot (`truth.cdc` / `truth.smnPrecip`
 *        name the id to fetch them later).
 *
 * An input point is NOT a catalog station: it has no MOSMIX series of its own (the collector stores the nearest catalog
 * station), no live path and — in DE — no truth in the slot (CDC is fetched later by whoever verifies). Id = `<net>:<network id>`,
 * so it can never collide with a catalog id. Materialised as `points-extra.json`; the collector reads it when it exists.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/punktarchiv/points-extra.mjs [--out=<file>] [--self-test]
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { distanceKm } from '../../src/point/client/cubePoint.ts';
import { parseSmnStations, parseTawesStations, SMN_META_URL, TAWES_META_URL } from './lib/truth.mjs';
import { COLOCATE, inCubeBox, loadPointList, terrainHeights } from './points.mjs';

export const EXTRA_FILE = new URL('./points-extra.json', import.meta.url);
export const EXTRA_KIND = 'punktarchiv/points-extra';
const CDC_10MIN = 'https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/10_minutes';
/** The CDC station lists read: air temperature, wind and precipitation. A station of the precipitation list alone is `precipOnly`. */
export const CDC_LISTS = Object.freeze({
  tu: `${CDC_10MIN}/air_temperature/now/zehn_now_tu_Beschreibung_Stationen.txt`,
  ff: `${CDC_10MIN}/wind/now/zehn_now_ff_Beschreibung_Stationen.txt`,
  rr: `${CDC_10MIN}/precipitation/now/zehn_now_rr_Beschreibung_Stationen.txt`,
});
/** MeteoSwiss automatic precipitation stations (own collection beside SwissMetNet, same metadata form). */
export const SMN_PRECIP_META_URL = 'https://data.geo.admin.ch/ch.meteoschweiz.ogd-smn-precip/ogd-smn-precip_meta_stations.csv';
/** A point is precipitation-only when its station measures neither air temperature nor wind. */
export const isPrecipOnly = (vars) => !vars.includes('tu') && !vars.includes('ff');
/** A CDC station counts as active when its list names data within this many days before the build (the lists are rewritten daily). */
export const CDC_ACTIVE_DAYS = 30;
/** Same site as an existing DE point: the co-location limits measured for PA2 (`points.mjs`, §9.3.1 (4)). */
export const SAME_SITE = Object.freeze({ maxKm: COLOCATE.maxKm, maxDzM: COLOCATE.maxDzM });

/** One CDC „Beschreibung_Stationen" list (fixed width, latin1) → `{ id, from, to, elev, lat, lon, name }`. */
export function parseCdcStationList(txt) {
  const out = [];
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*(\d{1,5})\s+(\d{8})\s+(\d{8})\s+(-?\d+)\s+(-?\d+\.\d+)\s+(-?\d+\.\d+)\s+(.+)$/.exec(line);
    if (!m) continue;
    out.push({ id: m[1].padStart(5, '0'), from: m[2], to: m[3], elev: Number(m[4]), lat: Number(m[5]), lon: Number(m[6]), name: m[7].split(/\s{2,}/)[0].trim() });
  }
  return out;
}

/**
 * Pure selection. `base` = the points of `points.json`; `network` = TAWES/SMN stations (`parseTawesStations`/`parseSmnStations`);
 * `cdc` = `{ id, to, elev, lat, lon, name, vars }` (one entry per station, `vars` ⊂ tu/ff/rr); `activeFrom` = YYYYMMDD;
 * `precipNet` = MeteoSwiss precipitation stations (`parseSmnStations` form). Order of the result: the stations with temperature
 * or wind by id, then the precipitation-only ones by id — a growing precipitation list never moves the others.
 */
export function selectExtra(base, network, cdc, activeFrom, precipNet = []) {
  const haveTawes = new Set(base.map((p) => p.truth?.tawes).filter(Boolean).map(String));
  const haveSmn = new Set(base.map((p) => p.truth?.smn).filter(Boolean).map(String));
  const de = base.filter((p) => p.country === 'DE');
  const dropped = { alreadyPoint: 0, sameSite: 0, inactive: 0, outsideBox: 0, noHeight: 0, dupPos: 0 };
  const out = [];
  const seenPos = new Set(base.map((p) => `${p.lat.toFixed(3)}/${p.lon.toFixed(3)}`));
  const push = (p) => {
    if (!inCubeBox(p.lat, p.lon)) { dropped.outsideBox++; return; }
    if (!Number.isFinite(p.elev)) { dropped.noHeight++; return; }
    const k = `${p.lat.toFixed(3)}/${p.lon.toFixed(3)}`;
    if (seenPos.has(k)) { dropped.dupPos++; return; }
    seenPos.add(k);
    out.push(p);
  };
  for (const s of network) {
    if ((s.net === 'tawes' ? haveTawes : haveSmn).has(String(s.id))) { dropped.alreadyPoint++; continue; }
    push({ id: `${s.net}:${s.id}`, role: 'input', net: s.net, name: String(s.name).trim(), lat: s.lat, lon: s.lon, elev: s.h, country: s.country, wmo: s.wmo ?? null,
      truth: { poi: false, tawes: s.net === 'tawes' ? String(s.id) : null, smn: s.net === 'smn' ? String(s.id) : null, cdc: null } });
  }
  // Stations with temperature or wind first: at a shared position (3 decimals) the precipitation-only station is the one that drops.
  for (const s of [...cdc.filter((c) => !isPrecipOnly(c.vars)), ...cdc.filter((c) => isPrecipOnly(c.vars))]) {
    if (s.to < activeFrom) { dropped.inactive++; continue; }
    if (de.some((p) => Math.abs(p.lat - s.lat) < 0.05 && Math.abs(p.lon - s.lon) < 0.08 && distanceKm(p.lat, p.lon, s.lat, s.lon) <= SAME_SITE.maxKm && Math.abs(p.elev - s.elev) <= SAME_SITE.maxDzM)) { dropped.sameSite++; continue; }
    push({ id: `cdc:${s.id}`, role: 'input', net: 'cdc', name: s.name, lat: s.lat, lon: s.lon, elev: s.elev, country: 'DE', wmo: null, vars: [...s.vars].sort(), ...(isPrecipOnly(s.vars) ? { precipOnly: true } : {}),
      truth: { poi: false, tawes: null, smn: null, cdc: s.id } });
  }
  const smnAbbr = new Set(network.filter((s) => s.net === 'smn').map((s) => String(s.id)));
  for (const s of precipNet) {
    if (smnAbbr.has(String(s.id))) { dropped.alreadyPoint++; continue; }
    push({ id: `smnp:${s.id}`, role: 'input', net: 'smnp', name: String(s.name).trim(), lat: s.lat, lon: s.lon, elev: s.h, country: s.country, wmo: null, vars: ['rr'], precipOnly: true,
      truth: { poi: false, tawes: null, smn: null, cdc: null, smnPrecip: String(s.id) } });
  }
  out.sort((a, b) => ((a.precipOnly ? 1 : 0) - (b.precipOnly ? 1 : 0)) || (a.id < b.id ? -1 : 1));
  return { points: out, dropped };
}

async function fetchText(url, encoding = 'utf-8', timeoutMs = 60_000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return new TextDecoder(encoding).decode(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}

export async function buildExtraList() {
  const t0 = Date.now();
  const base = loadPointList();
  // A source that cannot be read stops the build: a list silently short of one network would drop its points from every slot.
  const tawes = parseTawesStations(JSON.parse(await fetchText(TAWES_META_URL)));
  const smn = parseSmnStations(await fetchText(SMN_META_URL, 'windows-1252'));
  const smnPrecip = parseSmnStations(await fetchText(SMN_PRECIP_META_URL, 'windows-1252'));
  const byId = new Map();
  const listed = {};
  for (const [v, url] of Object.entries(CDC_LISTS)) {
    const rows = parseCdcStationList(await fetchText(url, 'latin1'));
    listed[v] = rows.length;
    for (const r of rows) { const e = byId.get(r.id) ?? { ...r, vars: [] }; e.vars.push(v); if (r.to > e.to) e.to = r.to; byId.set(r.id, e); }
  }
  const activeFrom = new Date(Date.now() - CDC_ACTIVE_DAYS * 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
  const sel = selectExtra(base.points, [...tawes, ...smn], [...byId.values()], activeFrom, smnPrecip);
  const { heights, tiles } = await terrainHeights(sel.points);
  const noDem = [];
  for (const p of sel.points) { const h = heights.get(p.id); p.demM = h != null && Number.isFinite(h) ? Math.round(h) : null; if (p.demM == null) noDem.push(p.id); }
  const points = sel.points.filter((p) => p.demM != null);
  const count = (f) => points.filter(f).length;
  return {
    schema: 1, kind: EXTRA_KIND, builtAt: new Date().toISOString(),
    from: { base: 'scripts/punktarchiv/points.json', baseBuiltAt: base.builtAt, basePoints: base.points.length, tawesMeta: TAWES_META_URL, smnMeta: SMN_META_URL, smnPrecipMeta: SMN_PRECIP_META_URL, cdcLists: CDC_LISTS, listed: { tawes: tawes.length, smn: smn.length, smnPrecip: smnPrecip.length, cdc: byId.size, ...listed }, cdcActiveFrom: activeFrom },
    rule: `Eingabe-Punkte (PA5, E-PS-11): TAWES- und SMN-Stationen, die kein Punkt von points.json als truth.tawes/truth.smn trägt; CDC-Stationen des 10-min-Dienstes mit Temperatur, Wind oder Niederschlag (Liste nennt Daten in den letzten ${CDC_ACTIVE_DAYS} Tagen), an denen kein DE-Punkt von points.json steht (≤ ${SAME_SITE.maxKm} km und |Δz| ≤ ${SAME_SITE.maxDzM} m). Alle: Cube-Box, eindeutig nach Position (3 Dezimalen, auch gegen points.json), Höhe und DEM (Terrarium z9) endlich. Kennung <Netz>:<Netzkennung>. Reine Niederschlagsstationen (E-PA5-4, precipOnly: true, hinter den anderen): CDC-Stationen ohne Temperatur und Wind, dazu die automatischen Niederschlagsstationen von MeteoSwiss (ogd-smn-precip, Netz smnp), die keine SwissMetNet-Station sind; ihre Messwerte stehen nicht im Slot (truth.cdc bzw. truth.smnPrecip nennt die Kennung).`,
    sameSite: SAME_SITE,
    counts: { points: points.length, byNet: { tawes: count((p) => p.net === 'tawes'), smn: count((p) => p.net === 'smn'), cdc: count((p) => p.net === 'cdc'), smnp: count((p) => p.net === 'smnp') }, precipOnly: count((p) => p.precipOnly), cdcPrecipOnly: count((p) => p.net === 'cdc' && p.precipOnly), byCountry: points.reduce((o, p) => { o[p.country] = (o[p.country] ?? 0) + 1; return o; }, {}), cdcWithTemperature: count((p) => p.vars?.includes('tu')), cdcWindOnly: count((p) => p.net === 'cdc' && !p.vars.includes('tu') && !p.precipOnly), droppedNoDem: noDem.length, ...sel.dropped, terrariumTiles: tiles },
    points,
    ms: Date.now() - t0,
  };
}

/** The list for the collector — `null` when the file is not there (the collector then runs on `points.json` alone). */
export function loadExtraList() {
  if (!existsSync(EXTRA_FILE)) return null;
  const doc = JSON.parse(readFileSync(EXTRA_FILE, 'utf8'));
  if (doc.kind !== EXTRA_KIND || doc.schema !== 1) throw new Error(`points-extra.json: kind ${doc.kind}, schema ${doc.schema} — erwartet ${EXTRA_KIND}, 1`);
  return doc;
}

export function extraSelfTest() {
  const checks = [];
  const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
  const list = parseCdcStationList([
    'Stations_id von_datum bis_datum Stationshoehe geoBreite geoLaenge Stationsname Bundesland Abgabe',
    '----------- --------- --------- ------------- --------- --------- ----------------------------------------- ---------- ------',
    '00044 20070208 20261005             44     52.9336    8.2370 Großenkneten                             Niedersachsen                            Frei',
    '03379 19970701 20261005            515     48.1632   11.5429 München-Stadt                            Bayern                                   Frei',
    '09999 19970701 20200101            100     50.0000   10.0000 Stillgelegt                              Bayern                                   Frei',
  ].join('\n'));
  add('CDC-Liste: Kennung fünfstellig, Höhe, Lage, Name ohne Bundesland; Kopfzeilen fallen weg', list.length === 3 && list[0].id === '00044' && list[0].elev === 44 && list[0].lat === 52.9336 && list[0].name === 'Großenkneten' && list[1].name === 'München-Stadt');
  const base = [
    { id: '10865', country: 'DE', lat: 48.16, lon: 11.54, elev: 515, truth: { poi: true, tawes: null, smn: null } },
    { id: '11035', country: 'AT', lat: 48.2486, lon: 16.3564, elev: 198, truth: { poi: true, tawes: '11035', smn: null } },
    { id: '06700', country: 'CH', lat: 46.2475, lon: 6.1278, elev: 411, truth: { poi: true, tawes: null, smn: 'GVE' } },
  ];
  const net = [
    { net: 'tawes', id: '11035', wmo: '11035', name: 'WIEN/HOHE WARTE', country: 'AT', lat: 48.2486, lon: 16.3564, h: 198 },
    { net: 'tawes', id: '11034', wmo: '11034', name: 'WIEN-INNERE STADT', country: 'AT', lat: 48.1983, lon: 16.3669, h: 177 },
    { net: 'smn', id: 'GVE', wmo: '06700', name: 'Genève / Cointrin', country: 'CH', lat: 46.2475, lon: 6.1278, h: 411 },
    { net: 'smn', id: 'ABO', wmo: '06735', name: 'Adelboden', country: 'CH', lat: 46.4917, lon: 7.5607, h: 1321 },
    { net: 'smn', id: 'ROM', wmo: null, name: 'Rom', country: 'CH', lat: 41.9, lon: 12.5, h: 20 },
  ];
  const cdc = list.map((s) => ({ ...s, vars: ['tu'] }));
  const sel = selectExtra(base, net, cdc, '20260905');
  const ids = sel.points.map((p) => p.id).join();
  add('Auswahl: nur Stationen, die noch kein Punkt sind — Wien-Innere Stadt, Adelboden, Großenkneten; München-Stadt steht am DE-Punkt, die stillgelegte und die außerhalb der Box fallen weg',
    ids === 'cdc:00044,smn:ABO,tawes:11034', ids);
  add('Auswahl: die Gründe sind gezählt (schon Punkt 2, gleicher Ort 1, inaktiv 1, außerhalb 1)', sel.dropped.alreadyPoint === 2 && sel.dropped.sameSite === 1 && sel.dropped.inactive === 1 && sel.dropped.outsideBox === 1, JSON.stringify(sel.dropped));
  const by = Object.fromEntries(sel.points.map((p) => [p.id, p]));
  add('Form: role input, Netz, Wahrheit nur aus dem eigenen Netz, nie POI; DE trägt die CDC-Kennung und keine Netz-Wahrheit',
    sel.points.every((p) => p.role === 'input' && p.truth.poi === false) && by['tawes:11034'].truth.tawes === '11034' && by['smn:ABO'].truth.smn === 'ABO' && by['smn:ABO'].elev === 1321
    && by['cdc:00044'].truth.cdc === '00044' && by['cdc:00044'].truth.tawes === null && by['cdc:00044'].country === 'DE');
  add('Negativkontrolle: dieselbe CDC-Station 60 m über dem DE-Punkt am selben Ort ist NICHT derselbe Ort und wird aufgenommen',
    selectExtra(base, [], [{ ...cdc[1], elev: 515 + SAME_SITE.maxDzM + 10 }], '20260905').points.length === 1);
  {
    const rr = [{ ...list[0], id: '00050', lat: 53.5, lon: 9.5, vars: ['rr'] }, { ...list[0], vars: ['rr', 'tu'] }, { ...list[0], id: '00051', vars: ['rr'] }];
    const pn = [{ net: 'smn', id: 'ABE', wmo: null, name: 'Aarberg', country: 'CH', lat: 47.04, lon: 7.27, h: 449 }, { net: 'smn', id: 'ABO', wmo: null, name: 'Adelboden', country: 'CH', lat: 46.4917, lon: 7.5607, h: 1321 }];
    const s2 = selectExtra(base, net, rr, '20260905', pn);
    const order = s2.points.map((p) => p.id).join();
    add('Niederschlagsstationen: hinter den anderen, mit precipOnly; eine Station mit Temperatur ist keine; gleiche Position und SwissMetNet-Kürzel fallen weg',
      order === 'cdc:00044,smn:ABO,tawes:11034,cdc:00050,smnp:ABE' && s2.points.slice(0, 3).every((p) => !p.precipOnly) && s2.points.slice(3).every((p) => p.precipOnly === true && p.vars.join() === 'rr')
      && s2.points[4].truth.smnPrecip === 'ABE' && s2.points[4].truth.smn === null && s2.points[3].truth.cdc === '00050', order);
    add('Negativkontrolle: ohne Niederschlagslisten ist die Auswahl dieselbe wie bisher', selectExtra(base, net, cdc, '20260905', []).points.map((p) => p.id).join() === ids);
  }
  add('Negativkontrolle: eine zweite Station an derselben Position (3 Dezimalen) fällt weg', selectExtra(base, [net[1], { ...net[1], id: '11099' }], [], '20260905').points.length === 1);
  return { checks, passed: checks.filter((c) => c.ok).length, total: checks.length };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    const r = extraSelfTest();
    for (const c of r.checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
    console.log(`${r.passed}/${r.total}`);
    process.exitCode = r.passed === r.total ? 0 : 1;
    return;
  }
  const doc = await buildExtraList();
  const out = args.find((a) => a.startsWith('--out='))?.slice(6) ?? EXTRA_FILE;
  writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  const c = doc.counts;
  console.log(`[points-extra] ${c.points} Eingabe-Punkte · TAWES ${c.byNet.tawes} · SMN ${c.byNet.smn} · CDC ${c.byNet.cdc} (mit Temperatur ${c.cdcWithTemperature}, nur Wind ${c.cdcWindOnly}, nur Niederschlag ${c.cdcPrecipOnly}) · MeteoSwiss Niederschlag ${c.byNet.smnp}`);
  console.log(`[points-extra] gelistet: ${JSON.stringify(doc.from.listed)} · verworfen: ${JSON.stringify({ alreadyPoint: c.alreadyPoint, sameSite: c.sameSite, inactive: c.inactive, outsideBox: c.outsideBox, noHeight: c.noHeight, dupPos: c.dupPos, noDem: c.droppedNoDem })}`);
  console.log(`[points-extra] ${doc.ms} ms → ${out}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
