#!/usr/bin/env node
/**
 * verify:obs-reader — phase OF (`audit/obs-fusion.md` §5.1): the reader of `buscosun-data/obs/v1` (`src/sources/obsStore.ts`)
 * and its switch into the measurement path (`sampleSources.ts fetchNearestStationObs`, `cubeSource.ts`), net-free on a REAL
 * excerpt of the product (`scripts/lib/fixtures/obs-v1-sample.json`, 08.10.2026) and a fake `fetch`.
 *
 *   (1) form of the product, negative controls      (6) memo: one fetch per file, TTL, failure not kept
 *   (2) one station → the point of the old adapters  (7) fetchNearestStationObs: store first, fallback, `?obs=direct`, requests per point
 *   (3) equality with BrightSky / TAWES / SMN        (8) raster-fusion grid, map features, popup values
 *   (4) nearest stations: today's semantics, dense   (9) the URL switch
 *   (5) one file, two ways: hedge, deadline, abort   (10) --live: both copies of the mirror byte-identical, the product readable
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-obs-reader.mjs [--live]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LIVE = process.argv.includes('--live');
const checks = [];
const add = (name, ok, detail = '') => { checks.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'OK  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const near = (a, b, tol = 1e-9) => a == null && b == null ? true : (a != null && b != null && Math.abs(a - b) <= tol);
const json = (o) => JSON.stringify(o);
const realFetch = globalThis.fetch;
const resp = (body, status = 200, type = 'application/json') => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });

const O = await import('../src/sources/obsStore.ts');
const { brightSkyPointsOf } = await import('../src/sources/brightSkyCurrent.ts');
const { fetchTawesCurrentGrid } = await import('../src/sources/geosphereTawes.ts');
const { fetchSmnCurrentGrid } = await import('../src/sources/meteoSwissSmn.ts');
const { fetchNearestStationObs } = await import('../src/pointForecast/sampleSources.ts');
const { cubeObsOf } = await import('../src/pointForecast/cubeSource.ts');
const { pfObsStoreFrom } = await import('../src/pointForecast/pfFlags.ts');

const FIX = JSON.parse(readFileSync(join(ROOT, 'scripts/lib/fixtures/obs-v1-sample.json'), 'utf8'));
const NOW = Date.parse(FIX.latest.builtAt);   // the clock of the excerpt: every stamp is "current"
const catalog = O.parseObsCatalog(FIX.catalog), latest = O.parseObsLatest(FIX.latest);
const store = catalog && latest ? O.obsStoreOf(catalog, latest, NOW) : null;
const stOf = (id) => store.byId.get(id);
const MUC = stOf('de:03379'), WIEN = stOf('at:11035'), SMA = stOf('ch:SMA');

// ── (1) form ────────────────────────────────────────────────────────────────────────────────────────────────────────
add('(1) Fixture = echter Auszug: Katalog und latest in Schema 1 lesbar, Kennungen mit Länderpräfix, München-Stadt/Wien/Zürich dabei',
  !!store && catalog.count >= 20 && latest.count >= 18 && !!MUC && !!WIEN && !!SMA && catalog.stations.every((s) => /^(de|at|ch|li):/.test(s.id)),
  `${catalog?.count} Stationen, ${latest?.count} mit Werten`);
add('(1) Negativkontrollen: Schema 2, falsche Art, fehlende Liste ⇒ null; ein Eintrag ohne Koordinaten fällt heraus',
  O.parseObsCatalog({ ...FIX.catalog, schema: 2 }) === null && O.parseObsLatest({ ...FIX.latest, kind: 'obs/series' }) === null && O.parseObsCatalog({ schema: 1, kind: 'obs/stations' }) === null
  && O.parseObsCatalog({ ...FIX.catalog, stations: [...FIX.catalog.stations, { id: 'de:x', country: 'DE' }] }).count === FIX.catalog.stations.length);

// ── (2) one station → point ─────────────────────────────────────────────────────────────────────────────────────────
{
  const e = latest.stations['de:03379'], p = O.obsPointOf(MUC, e);
  const rad = (e.v.dd * Math.PI) / 180;
  add('(2) obsPointOf München-Stadt: T, RH, Böe = fx (m/s), u/v = −ff·sin/cos dd, Niederschlag = rr × 6 mm/h, Stempel = t, model dwd_obs, Kennung ohne Präfix, Höhe/Lage aus dem Katalog',
    p && p.temperature === e.v.t && p.relativeHumidity === e.v.rh && p.gust === e.v.fx && near(p.u, -e.v.ff * Math.sin(rad)) && near(p.v, -e.v.ff * Math.cos(rad)) && near(p.precipitation, e.v.rr * 6)
    && p.timestamp.getTime() === Date.parse(e.t) && p.model === 'dwd_obs' && p.stationId === '03379' && p.elev === MUC.elev && p.lat === MUC.lat && p.lng === MUC.lon && p.cloudLow === null,
    p ? `${p.temperature} °C, ${e.v.ff} m/s aus ${e.v.dd}°, Böe ${p.gust}, ${p.precipitation} mm/h, ${e.t}` : 'kein Punkt');
  const daily = O.obsPointOf(stOf('de:00006'), latest.stations['de:00006']);
  const rain = O.obsPointOf(stOf('de:06288'), latest.stations['de:06288']);
  add('(2) Tagesstation (nur `day`) ⇒ kein Punkt; reine 10-min-Niederschlagsstation ⇒ Punkt mit Niederschlag, ohne T/Wind (keine „volle" Station)',
    daily === null && rain && rain.temperature === null && rain.u === null && rain.precipitation != null && !O.obsFullPoint(rain));
  add('(2) AT/CH/LI: model tawes / smn / smn, Kennung = TAWES-Kennung bzw. SMN-Kürzel; Liechtenstein liest mit dem Schweizer Netz',
    O.obsPointOf(WIEN, latest.stations['at:11035']).model === 'tawes' && O.obsPointOf(SMA, latest.stations['ch:SMA']).model === 'smn' && O.obsPointOf(SMA, latest.stations['ch:SMA']).stationId === 'SMA'
    && O.obsModelOf('LI') === 'smn' && json(O.obsCountriesOf('CH')) === json(['CH', 'LI']) && json(O.obsCountriesOf('DE')) === json(['DE']));
  add('(2) ungültiger Stempel oder fehlendes `v` ⇒ kein Punkt bzw. Punkt ohne Werte (nie 0)',
    O.obsPointOf(MUC, { t: 'gestern' }) === null && O.obsPointOf(MUC, { t: e.t }).temperature === null && O.obsPointOf(MUC, undefined) === null);
}

// ── (3) equality with the old adapters at identical physical values ─────────────────────────────────────────────────
{
  const e = latest.stations['de:03379'], v = e.v;
  // BrightSky reports wind in km/h — the adapter divides by 3,6; the product carries the DWD original in m/s
  const bs = brightSkyPointsOf({
    weather: { timestamp: e.t, source_id: 1, temperature: v.t, wind_speed_10: v.ff * 3.6, wind_direction_10: v.dd, wind_gust_speed_10: v.fx * 3.6, relative_humidity: v.rh, precipitation_10: v.rr, cloud_cover: 75 },
    sources: [{ id: 1, lat: MUC.lat, lon: MUC.lon, height: MUC.elev, station_name: MUC.name, dwd_station_id: '03379', wmo_station_id: '10865' }],
  }).own.point;
  const ob = O.obsPointOf(MUC, e);
  const same = ['temperature', 'relativeHumidity', 'precipitation', 'cloudLow', 'cloudMid', 'cloudHigh', 'model', 'lat', 'lng', 'elev'].every((k) => bs[k] === ob[k]);
  const windTol = ['u', 'v', 'gust'].every((k) => near(bs[k], ob[k], 1e-12));
  add('(3) BrightSky-Abbildung desselben Messwerts: T, RH, Niederschlag, Lage, Höhe, model byte-gleich; u/v/Böe bis auf den km/h-Rundweg (≤ 1e-12); Stempel gleich; BrightSky-Bewölkung wird in beiden Pfaden NICHT übernommen',
    same && windTol && bs.timestamp.getTime() === ob.timestamp.getTime() && bs.cloudLow === null,
    `Δu ${Math.abs(bs.u - ob.u).toExponential(1)}, Δgust ${Math.abs(bs.gust - ob.gust).toExponential(1)}`);
  // the engine's input (`cubeObsOf`) from both lists: identical up to the station id (BrightSky WMO 10865, product DWD 03379) and `via`
  const asList = (p, stationId, via) => [{ source: 'dwd_obs', name: MUC.name, stationId, byStation: true, ...(via ? { via } : {}), lat: MUC.lat, lng: MUC.lon, elevation: MUC.elev, distanceMeters: 1234, point: p }];
  const cA = cubeObsOf(asList(bs, '10865'), NOW)[0], cB = cubeObsOf(asList(ob, '03379', 'obs'), NOW)[0];
  const norm = (c) => json({ ...c, stationId: null, via: null, u: Math.round(c.u * 1e9), v: Math.round(c.v * 1e9), gust: Math.round(c.gust * 1e9) });
  add('(3) CubeObs aus beiden Abbildungen gleich bis auf Kennung (WMO ↔ DWD-id) und `via` ⇒ der Motor rechnet bei gleicher Station und gleichem Stempel byte-gleich; `via: obs` nur aus dem Produkt',
    norm(cA) === norm(cB) && cA.validAtMs === cB.validAtMs && cA.via === undefined && cB.via === 'obs' && cA.stationId === '10865' && cB.stationId === '03379');
  // the BrightSky km/h round trip at one decimal (what the API publishes): the size of the wind difference the product removes
  const kmh1 = Math.round(v.ff * 3.6 * 10) / 10 / 3.6;
  add('(3) Erklärung des einzigen Unterschieds: BrightSky veröffentlicht km/h mit einer Nachkommastelle ⇒ bis 0,014 m/s Abweichung vom DWD-Original; das Produkt trägt das Original',
    Math.abs(kmh1 - v.ff) <= 0.05 / 3.6 + 1e-12, `${v.ff} m/s → ${(v.ff * 3.6).toFixed(1)} km/h → ${kmh1.toFixed(4)} m/s`);

  // TAWES: the adapter with a fake API (metadata + current, two 10-min slots, the newest in slot 1)
  const w = latest.stations['at:11035'].v;
  const tawesMeta = { stations: [{ id: '11035', lat: WIEN.lat, lon: WIEN.lon, altitude: WIEN.elev, is_active: true, name: WIEN.name }] };
  const tawesCur = { features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [WIEN.lon, WIEN.lat] }, properties: { station: '11035', parameters: { TL: { data: [null, w.t] }, RF: { data: [null, w.rh] }, FF: { data: [null, w.ff] }, DD: { data: [null, w.dd] }, FFX: { data: [null, w.fx] }, RR: { data: [null, w.rr] } } } }] };
  globalThis.fetch = async (url) => (String(url).includes('/metadata') ? resp(tawesMeta) : String(url).includes('tawes-v1-10min') ? resp(tawesCur) : resp('', 404));
  let tp = null;
  try { tp = (await fetchTawesCurrentGrid({ near: { lat: WIEN.lat, lon: WIEN.lon }, maxStations: 1 })).points[0][0]; } finally { globalThis.fetch = realFetch; }
  const to = O.obsPointOf(WIEN, latest.stations['at:11035']);
  add('(3) TAWES-Adapter mit denselben Werten: T, RH, u, v, Böe, Niederschlag, Lage, Höhe, model, Kennung gleich; der Adapter hat KEINEN Stempel (galt als „jetzt"), das Produkt den Messstempel',
    tp && ['temperature', 'relativeHumidity', 'precipitation', 'model', 'lat', 'lng', 'elev', 'stationId'].every((k) => tp[k] === to[k]) && ['u', 'v', 'gust'].every((k) => near(tp[k], to[k], 1e-12)) && tp.timestamp === undefined && to.timestamp instanceof Date,
    tp ? `${tp.temperature} °C, ${tp.model}, ${tp.stationId}` : 'kein TAWES-Punkt');

  // SMN: the adapter with a fake OGD (station list CSV + the station's day file)
  const s = latest.stations['ch:SMA'].v;
  const stamp = new Date(latest.stations['ch:SMA'].t); const dd2 = (n) => String(n).padStart(2, '0');
  const ref = `${dd2(stamp.getUTCDate())}.${dd2(stamp.getUTCMonth() + 1)}.${stamp.getUTCFullYear()} ${dd2(stamp.getUTCHours())}:${dd2(stamp.getUTCMinutes())}`;
  const smnMeta = `station_abbr;station_name;station_coordinates_wgs84_lat;station_coordinates_wgs84_lon;station_height_masl\nSMA;Zürich / Fluntern;${SMA.lat};${SMA.lon};${SMA.elev}\n`;
  const smnRows = `station_abbr;reference_timestamp;tre200s0;fkl010z0;dkl010z0;fkl010z1;ure200s0;rre150z0;tde200s0\nSMA;${ref};${s.t};${s.ff};${s.dd};${s.fx};${s.rh};${s.rr};${s.td}\n`;
  globalThis.fetch = async (url) => (String(url).endsWith('meta_stations.csv') ? resp(smnMeta, 200, 'text/csv') : String(url).includes('_t_now.csv') ? resp(smnRows, 200, 'text/csv') : resp('', 404));
  let sp = null;
  try { sp = (await fetchSmnCurrentGrid({ near: { lat: SMA.lat, lon: SMA.lon }, maxStations: 1 })).points[0][0]; } finally { globalThis.fetch = realFetch; }
  const so = O.obsPointOf(SMA, latest.stations['ch:SMA']);
  add('(3) SMN-Adapter mit denselben Werten: T, RH, u, v, Böe, Niederschlag, Lage, Höhe, model, Kürzel gleich; der Adapter liest Td NICHT (das Produkt hat ihn), kein Stempel',
    sp && ['temperature', 'relativeHumidity', 'precipitation', 'model', 'lat', 'lng', 'elev', 'stationId'].every((k) => sp[k] === so[k]) && ['u', 'v', 'gust'].every((k) => near(sp[k], so[k], 1e-12)) && sp.timestamp === undefined && Number.isFinite(s.td),
    sp ? `${sp.temperature} °C, ${sp.stationId}` : 'kein SMN-Punkt');
}

// ── (4) nearest ─────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const q = { lat: 48.137, lon: 11.575 };   // München
  const six = O.nearestObsStations(store, q.lat, q.lon, 'DE', { max: 6, nowMs: NOW });
  const asc = six.every((x, i) => i === 0 || x.distanceMeters >= six[i - 1].distanceMeters);
  add('(4) München: die 6 nächsten DE-Stationen aufsteigend, alle `via obs`, alle voll (T/Wind/RH), die 10-min-Niederschlagsstation und die Tagesstation nicht darunter',
    six.length === 6 && asc && six.every((x) => x.via === 'obs' && x.source === 'dwd_obs' && O.obsFullPoint(x.point)) && !six.some((x) => x.stationId === '06288' || x.stationId === '00006'),
    six.map((x) => `${x.stationId} ${(x.distanceMeters / 1000).toFixed(1)} km`).join(', '));
  const dense = O.nearestObsStations(store, q.lat, q.lon, 'DE', { max: 50, nowMs: NOW, dense: true });
  add('(4) dense: die reine Niederschlagsstation kommt dazu, die Tagesstation nie; Landesfilter: ein AT-Punkt sieht nur at:, ein CH-Punkt ch: und li:',
    dense.some((x) => x.stationId === '06288') && !dense.some((x) => x.stationId === '00006')
    && O.nearestObsStations(store, 48.2, 16.37, 'AT', { max: 50, nowMs: NOW }).every((x) => x.source === 'tawes')
    && O.nearestObsStations(store, 47.37, 8.54, 'CH', { max: 50, nowMs: NOW }).every((x) => x.source === 'smn') && O.nearestObsStations(store, 47.37, 8.54, 'CH', { max: 50, nowMs: NOW }).some((x) => x.stationId === 'VAD'));
  add('(4) Altersregel: mit einer Uhr 7 h nach dem Stand ist nichts mehr aktuell (6 h); `max` deckelt; `byStation` markiert die Station am Ort des Hinweises (≤ 0,3 km), eine 2 km entfernte nicht',
    O.nearestObsStations(store, q.lat, q.lon, 'DE', { max: 6, nowMs: NOW + 7 * 3_600_000 }).length === 0 && O.nearestObsStations(store, q.lat, q.lon, 'DE', { max: 2, nowMs: NOW }).length === 2
    && O.nearestObsStations(store, q.lat, q.lon, 'DE', { max: 6, nowMs: NOW, station: { id: '10865', lat: MUC.lat, lon: MUC.lon } }).find((x) => x.stationId === '03379')?.byStation === true
    && !O.nearestObsStations(store, q.lat, q.lon, 'DE', { max: 6, nowMs: NOW, station: { id: '10865', lat: MUC.lat + 0.02, lon: MUC.lon } }).some((x) => x.byStation));
}

// ── (5) one file, two ways ──────────────────────────────────────────────────────────────────────────────────────────
{
  const calls = [];
  const fake = (plan) => async (url, init) => {
    const way = String(url).includes('raw.githubusercontent') ? 'raw' : 'cdn';
    calls.push(way);
    const p = plan[way];
    if (p.delayMs) await new Promise((r, rej) => { const t = setTimeout(r, p.delayMs); init?.signal?.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('aborted', 'AbortError')); }); });
    if (init?.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    if (p.status && p.status !== 200) return resp('', p.status);
    if (p.throw) throw new Error('netz');
    return resp({ way });
  };
  calls.length = 0;
  const a = await O.fetchObsJson('latest.json', 'raw', { fetchImpl: fake({ raw: {}, cdn: {} }), hedgeMs: 50 });
  add('(5) primärer Weg antwortet ⇒ sein Ergebnis, der zweite Weg wird nie gestartet', a.way === 'raw' && json(calls) === json(['raw']));
  calls.length = 0;
  const b = await O.fetchObsJson('latest.json', 'raw', { fetchImpl: fake({ raw: { status: 403 }, cdn: {} }), hedgeMs: 5_000 });
  add('(5) primär 403 ⇒ der zweite Weg sofort (nicht erst nach dem Hedge)', b.way === 'cdn' && json(calls) === json(['raw', 'cdn']));
  calls.length = 0;
  const notes = [];
  const c = await O.fetchObsJson('latest.json', 'cdn', { fetchImpl: fake({ cdn: { delayMs: 300 }, raw: {} }), hedgeMs: 20, onNote: (n) => notes.push(n) });
  add('(5) primär langsam ⇒ nach dem Hedge der zweite Weg, der schnellere gewinnt, der Hedge ist benannt', c.way === 'raw' && json(calls) === json(['cdn', 'raw']) && notes.some((n) => /Hedge 20 ms/.test(n)) && notes.some((n) => /über raw/.test(n)));
  let err = null;
  try { await O.fetchObsJson('latest.json', 'raw', { fetchImpl: fake({ raw: { status: 500 }, cdn: { throw: true } }), hedgeMs: 10 }); } catch (e) { err = e; }
  add('(5) beide Wege scheitern ⇒ Fehler des primären Wegs', /500 .*raw\.githubusercontent/.test(String(err?.message)));
  const ac = new AbortController(); setTimeout(() => ac.abort(), 20);
  err = null;
  try { await O.fetchObsJson('latest.json', 'raw', { fetchImpl: fake({ raw: { delayMs: 500 }, cdn: { delayMs: 500 } }), hedgeMs: 5, signal: ac.signal }); } catch (e) { err = e; }
  add('(5) Abbruch des Aufrufers ⇒ AbortError, beide Wege abgebrochen', err?.name === 'AbortError');
  err = null;
  try { await O.fetchObsJson('latest.json', 'raw', { fetchImpl: fake({ raw: { delayMs: 500 }, cdn: { delayMs: 500 } }), hedgeMs: 5, timeoutMs: 30 }); } catch (e) { err = e; }
  add('(5) Frist ⇒ Fehler „Frist … ms"', /Frist 30 ms/.test(String(err?.message)));
}

// ── (6) memo ────────────────────────────────────────────────────────────────────────────────────────────────────────
{
  const hits = { catalog: 0, latest: 0 };
  const fakeStore = (fail = false) => async (url) => { const k = String(url).endsWith('stations.json') ? 'catalog' : 'latest'; hits[k] += 1; return fail ? resp('', 500) : resp(k === 'catalog' ? FIX.catalog : FIX.latest); };
  O.resetObsMemo();
  const s1 = await O.loadObsStore({ fetchImpl: fakeStore(), nowMs: NOW, hedgeMs: 0 });
  const s2 = await O.loadObsStore({ fetchImpl: fakeStore(), nowMs: NOW + 1000, hedgeMs: 0 });
  add('(6) zwei Läufe innerhalb der Memo-Frist ⇒ je Datei EIN Abruf (Hedge 0 ⇒ beide Wege sofort, zählt je Datei 2 Anfragen)', hits.catalog === 2 && hits.latest === 2 && s1.catalog === s2.catalog && s1.latest === s2.latest);
  await O.loadObsStore({ fetchImpl: fakeStore(), nowMs: NOW + O.OBS_LATEST_MEMO_MS + 1, hedgeMs: 0 });
  add('(6) nach der Frist von latest wird latest neu geholt, der Katalog (6 h) nicht', hits.latest === 4 && hits.catalog === 2);
  O.resetObsMemo();
  let failed = false;
  try { await O.loadObsStore({ fetchImpl: fakeStore(true), nowMs: NOW, hedgeMs: 0 }); } catch { failed = true; }
  const after = await O.loadObsStore({ fetchImpl: fakeStore(), nowMs: NOW + 1, hedgeMs: 0 });
  add('(6) ein gescheiterter Abruf wird nicht gemerkt — der nächste Aufruf holt neu', failed && after.catalog.count === FIX.catalog.stations.length);
  O.resetObsMemo();
}

// ── (7) the switch in the measurement path ──────────────────────────────────────────────────────────────────────────
{
  const e = latest.stations['de:03379'], v = e.v;
  const bsResp = { weather: { timestamp: e.t, source_id: 1, temperature: v.t, wind_speed_10: v.ff * 3.6, wind_direction_10: v.dd, wind_gust_speed_10: v.fx * 3.6, relative_humidity: v.rh, precipitation_10: v.rr }, sources: [{ id: 1, lat: MUC.lat, lon: MUC.lon, height: MUC.elev, station_name: MUC.name, dwd_station_id: '03379', wmo_station_id: '10865' }] };
  const count = { obs: 0, bs: 0 };
  const mk = (storeOk) => async (url) => {
    const u = String(url);
    if (u.includes('/obs/v1/')) { count.obs += 1; if (!storeOk) return resp('', 500); return resp(u.endsWith('stations.json') ? FIX.catalog : FIX.latest); }
    if (u.includes('api.brightsky.dev/current_weather')) { count.bs += 1; return resp(bsResp); }
    return resp('', 404);
  };
  const q = { lat: 48.137, lng: 11.575 };
  const notes = [];
  O.resetObsMemo(); count.obs = 0; count.bs = 0;
  globalThis.fetch = mk(true);
  let a; try { a = await fetchNearestStationObs(q.lat, q.lng, 'DE', 6, undefined, { near: true, station: { id: '10865', lat: MUC.lat, lon: MUC.lon }, nowMs: NOW, onNote: (n) => notes.push(n) }); } finally { globalThis.fetch = realFetch; }
  add('(7) Produkt lesbar ⇒ 6 Stationen aus obs/v1 (`via obs`, München-Stadt `byStation`), 2 Anfragen (Katalog + latest; Hedge-Zeit nicht erreicht), KEINE BrightSky-Anfrage',
    a.length === 6 && a.every((x) => x.via === 'obs') && a.find((x) => x.stationId === '03379')?.byStation === true && count.obs === 2 && count.bs === 0, `obs ${count.obs}, BrightSky ${count.bs}`);
  O.resetObsMemo(); count.obs = 0; count.bs = 0; notes.length = 0;
  globalThis.fetch = mk(false);
  let b; try { b = await fetchNearestStationObs(q.lat, q.lng, 'DE', 6, undefined, { near: true, station: { id: '10865', lat: MUC.lat, lon: MUC.lon }, nowMs: NOW, onNote: (n) => notes.push(n) }); } finally { globalThis.fetch = realFetch; }
  add('(7) Produkt nicht lesbar (500 auf beiden Wegen) ⇒ benannter Rückfall auf den Direktabruf: BrightSky-Raster 20 + gezielt 2 = 22 Anfragen, Ergebnis ohne `via`',
    b.length >= 1 && b.every((x) => x.via === undefined) && count.bs === 22 && notes.some((n) => /Direktabruf/.test(n)), `obs ${count.obs}, BrightSky ${count.bs}; ${notes.find((n) => /Direktabruf/.test(n)) ?? ''}`);
  O.resetObsMemo(); count.obs = 0; count.bs = 0;
  globalThis.fetch = mk(true);
  let c; try { c = await fetchNearestStationObs(q.lat, q.lng, 'DE', 6, undefined, { near: true, station: { id: '10865', lat: MUC.lat, lon: MUC.lon }, store: false }); } finally { globalThis.fetch = realFetch; }
  add('(7) `store: false` (?obs=direct) ⇒ gar kein Produktabruf, nur der Direktabruf wie bisher', count.obs === 0 && count.bs === 22 && c.length >= 1);
  // the engine's note names the source
  const cs = cubeObsOf(a, NOW);
  add('(7) CubeObs aus dem Produkt tragen `via obs` und den Messstempel als validAtMs', cs.every((o) => o.via === 'obs' && o.validAtMs === Date.parse(e.t) || o.validAtMs < NOW));
  O.resetObsMemo();
}

// ── (8) grid, features, popup ───────────────────────────────────────────────────────────────────────────────────────
{
  const g = O.obsGridOf(store, 'DE', NOW);
  add('(8) Raster der Rasterfusion: 1 × N, jede Station mit eigener Lage/Höhe und model dwd_obs, nur volle Stationen, times = Uhr',
    g.rows === 1 && g.cols === g.points[0].length && g.points[0].length >= 6 && g.points[0].every((p) => p.lat != null && p.lng != null && p.model === 'dwd_obs' && O.obsFullPoint(p)) && g.times[0].getTime() === NOW);
  const ch = O.obsGridOf(store, 'CH', NOW);
  add('(8) CH-Raster trägt Liechtenstein (VAD) mit model smn', ch.points[0].some((p) => p.stationId === 'VAD') && ch.points[0].every((p) => p.model === 'smn'));
  const feats = O.obsStationFeatures(store, NOW);
  const de = feats.filter((f) => f.properties.source === 'dwd_obs');
  add('(8) Karten-Stationen: jede Station mit 10-min-Stempel, mit Werten, DE mit `dwdStationId`, Bewölkung null (nicht im Produkt, E-OF-1), Tagesstationen nicht',
    feats.length === Object.values(FIX.latest.stations).filter((x) => x.t).length && de.every((f) => f.properties.dwdStationId && f.properties.cloudCover === null) && feats.some((f) => f.properties.temperature != null && f.properties.windSpeed != null)
    && !feats.some((f) => f.properties.name === stOf('de:00006').name));
  const live = O.obsStationLive(store, '03379');
  add('(8) Popup-Werte einer DWD-Station: T, Wind m/s, Richtung, Niederschlag mm/h; unbekannte Kennung ⇒ null',
    live && live.temperature === latest.stations['de:03379'].v.t && live.windSpeed === latest.stations['de:03379'].v.ff && live.windDirection === latest.stations['de:03379'].v.dd && near(live.precipitation, latest.stations['de:03379'].v.rr * 6) && O.obsStationLive(store, '99999') === null);
}

// ── (9) the switch ──────────────────────────────────────────────────────────────────────────────────────────────────
add('(9) `?obs=direct` ⇒ Direktabruf; leer, `?obs=1`, `?obs=store` ⇒ Produkt', pfObsStoreFrom('?obs=direct') === false && pfObsStoreFrom('') === true && pfObsStoreFrom('?obs=1') === true && pfObsStoreFrom('?obs=store') === true);

// ── (10) live ───────────────────────────────────────────────────────────────────────────────────────────────────────
if (LIVE) {
  try {
    // line endings normalised: the checkout carries CRLF (autocrlf), the data repo LF
    const mine = readFileSync(join(ROOT, 'scripts/obs/obs-mirror.mjs'), 'utf8').replace(/\r\n/g, '\n');
    const theirs = (await (await realFetch('https://raw.githubusercontent.com/jppetry/buscosun-data/main/scripts/obs-mirror.mjs', { cache: 'no-cache' })).text()).replace(/\r\n/g, '\n');
    add('(10) --live: beide Kopien des Spiegels gleich (V-OB-4; Zeilenenden normalisiert)', mine === theirs, `${mine.length} / ${theirs.length} Zeichen`);
    O.resetObsMemo();
    const t0 = performance.now();
    const s = await O.loadObsStore();
    const ms = Math.round(performance.now() - t0);
    const six = O.nearestObsStations(s, 48.137, 11.575, 'DE', { max: 6 });
    add('(10) --live: Produkt lesbar, München hat 6 aktuelle Stationen', s.catalog.count > 3000 && six.length === 6, `${ms} ms, ${s.latest.builtAt}, ${six.map((x) => `${x.stationId} ${(x.distanceMeters / 1000).toFixed(1)} km ${x.point.timestamp.toISOString().slice(11, 16)}Z`).join(', ')}`);
  } catch (e) { add('(10) --live', false, String(e?.message ?? e)); }
}

// ── (11) the engine side of OF-2/OF-3: dense extras, the pure helpers, option off = untouched ─────────────────────
{
  const E = await import('../src/pointForecast/cubeSource.ts');
  const F = await import('../src/pointForecast/fusion/fusionRelease.ts');
  const q = { lat: 48.137, lon: 11.575 };
  const dense = O.nearestObsStations(store, q.lat, q.lon, 'DE', { max: O.OBS_DENSE_MAX, nowMs: NOW, dense: true });
  const cs = cubeObsOf(dense, NOW);
  const gauges = cs.filter((o) => o.rr10 != null);
  add('(11) dichter Satz: bis 12 Stationen, Niederschlagsstationen mit rr10/rr1h, gemessener Taupunkt als dewPoint, T-Stationen weiter mit T; ohne dense keine dieser Felder',
    dense.length > 6 && gauges.length >= 1 && cs.some((o) => o.dewPoint != null) && cs.some((o) => o.temperature != null)
    && cubeObsOf(O.nearestObsStations(store, q.lat, q.lon, 'DE', { max: 6, nowMs: NOW }), NOW).every((o) => o.rr10 === undefined && o.rr1h === undefined && o.dewPoint === undefined),
    `${dense.length} Stationen, ${gauges.length} mit rr10, ${cs.filter((o) => o.dewPoint != null).length} mit Td`);
  // anchorDenseAllow: per variable the K best by spatialWeight among those carrying it; a rain-only gauge never qualifies for T
  const hTrue = 520;
  const allow = E.anchorDenseAllow(cs, hTrue, 3);
  const rainOnly = cs.filter((o) => o.temperature == null);
  add('(11) anchorDenseAllow: je Größe höchstens K Stationen, nur solche, die die Größe messen; reine Niederschlagsstationen nie im T-Satz; K ≥ Zahl ⇒ alle',
    allow.t.size <= 3 && [...allow.t].every((o) => o.temperature != null) && !rainOnly.some((o) => allow.t.has(o)) && [...allow.wind].every((o) => o.u != null) && E.anchorDenseAllow(cs, hTrue, 99).t.size === cs.filter((o) => o.temperature != null).length);
  const ordered = [...allow.t].map((o) => o.distanceM);
  add('(11) anchorDenseAllow: bei gleicher Höhe gewinnt die Nähe (die K besten sind die nächsten T-Stationen)', ordered.every((d, i) => i === 0 || d >= ordered[i - 1]) && ordered[0] === Math.min(...cs.filter((o) => o.temperature != null).map((o) => o.distanceM)));
  // gaugeOccurrenceOf: weighted wet share, age rule, radius rule, null without gauges
  const mk = (distKm, rr10, ageMin = 10) => ({ source: 'dwd_obs', lat: 0, lon: 0, elevM: 500, distanceM: distKm * 1000, validAtMs: NOW - ageMin * 60_000, temperature: null, relativeHumidity: null, u: null, v: null, gust: null, rr10 });
  const occ = E.gaugeOccurrenceOf([mk(0, 0.2), mk(10, 0)], NOW);
  const w10 = Math.exp(-1);
  add('(11) gaugeOccurrenceOf: Anteil nass gewichtet mit e^(−(d/10 km)²): ein nasses Gerät am Punkt und ein trockenes in 10 km ⇒ 1/(1 + e^−1); Σw benannt; n = 2',
    occ && near(occ.pWet, 1 / (1 + w10), 1e-12) && near(occ.weight, 1 + w10, 1e-12) && occ.n === 2);
  add('(11) gaugeOccurrenceOf: Gerät älter als 40 min, in der Zukunft, ohne rr10 oder jenseits 15 km zählt nicht ⇒ null',
    E.gaugeOccurrenceOf([mk(1, 0.3, 41), mk(1, 0.3, -5), { ...mk(1, 0.3), rr10: null }, mk(16, 0.3)], NOW) === null && E.gaugeOccurrenceOf([], NOW) === null);
  // gaugeRadarFactorOf: gauge hour sum against the radar hour mean at the point, regularised, clipped
  const frames = (mmh) => [{ product: 'nowcast', sourceId: 'radvor_rv', stamp: 'x', slotAgeMin: 1, probes: 1, extrapolationH: 2, bytes: 0, framesInSlot: 12, framesFetched: 12, framesFailed: 0, hourMeans: 0, frames: Array.from({ length: 12 }, (_, i) => ({ lead: 0, validAtMs: NOW - i * 5 * 60_000, mmh, saturated: false, validAtSuspect: false })) }];
  const g = (distKm, mm, complete = true, ageMin = 10) => ({ ...mk(distKm, 0, ageMin), rr1h: { mm, complete } });
  const fr = E.gaugeRadarFactorOf([g(0, 2.0)], frames(1.0), NOW);
  add('(11) gaugeRadarFactorOf: Gerät 2,0 mm gegen Radar 1,0 mm/h ⇒ Faktor (2,0 + 0,2)/(1,0 + 0,2) = 1,833; n = 1',
    fr && near(fr.factor, 2.2 / 1.2, 1e-12) && fr.n === 1 && near(fr.gaugeMm, 2, 1e-12) && near(fr.radarMm, 1, 1e-12));
  add('(11) gaugeRadarFactorOf: Deckel 3 (Radar 0 bei 10 mm ⇒ 3), Boden 1/3; unter 0,3 mm beidseitig ⇒ null; unvollständige Stundensumme, kein Radar-Frame ⇒ null',
    near(E.gaugeRadarFactorOf([g(0, 10)], frames(0), NOW).factor, 3, 1e-12) && near(E.gaugeRadarFactorOf([g(0, 0)], frames(10), NOW).factor, 1 / 3, 1e-12)
    && E.gaugeRadarFactorOf([g(0, 0.1)], frames(0.1), NOW) === null && E.gaugeRadarFactorOf([g(0, 2, false)], frames(1), NOW) === null && E.gaugeRadarFactorOf([g(0, 2)], [], NOW) === null);
  // the register: Fusion 12 = obsDense with the reader switch; the gauge bundle is 0/0 until OF-4 decides
  add('(11) Register: Stand 12 = Option obsDense mit Leser-Schalter obsDense (set) und ?dense=0; Bündel nach OF-4: Auftrittsanker aus, Messgerät–Radar-Faktor an (claims.md §3), Stationswert-Minute nach Nachtrag 1; FUSION_CURRENT folgt',
    F.FUSION_RELEASES.some((r) => r.n === 12 && r.option === 'obsDense' && r.io?.key === 'obsDense' && r.io.set === true && r.io.flag === '?dense=0') && E.FUSION12_GAUGE.occurrence === 0 && E.FUSION12_GAUGE.radar === 1 && (E.FUSION12_SV_AT_OBS === 0 || E.FUSION12_SV_AT_OBS === 1)
    && (F.FUSION_CURRENT === 12) === (F.FUSION12_OBS_DENSE === 1) && F.fusionStageIo().obsDense === (F.FUSION12_OBS_DENSE === 1 ? true : undefined));
  add('(11) Schalter: ?dense=0 ⇒ aus, sonst an', (await import('../src/pointForecast/pfFlags.ts')).pfObsDenseFrom('?dense=0') === false && (await import('../src/pointForecast/pfFlags.ts')).pfObsDenseFrom('') === true);
}

const passed = checks.filter((c) => c.ok).length;
console.log(`\nverify:obs-reader ${passed}/${checks.length}`);
process.exit(passed === checks.length ? 0 : 1);
