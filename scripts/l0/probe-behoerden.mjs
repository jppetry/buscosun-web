/**
 * A0 — Behördendaten DACH: Messungen vor jeder Zeile Code (Gate GWBA1,
 * tests.md §V-WALDBRAND-BEHOERDEN, Diagnose audit/waldbrand-behoerden.md).
 *
 *   node scripts/l0/probe-behoerden.mjs --part axis|nina|geosphere|ems|vg250|geocat|all
 *        [--json audit/l0/waldbrand-behoerden-<part>.json]
 *
 * Fragen (Kickoff Jan, 2026-08-15):
 *   axis      A0-1  Spiegelt der MapServer die Achsenreihenfolge der Eingabe-BBox in die
 *                   Ausgabe-Geometrie? Je Endpunkt (/gwis UND /effis) — vertauschte BBox
 *                   liefert dann [lat,lon] mit voller Feature-Zahl und ohne Fehler.
 *   nina      A0-3  Struktur von warnung.bund.de/api31/mowas/mapData.json + je eine
 *                   /warnings/{id}.json und .geojson: Felder, Eventcodes, ARS-Format,
 *                   Geometrie ja/nein, Anteil brandbezogener Warnungen, ACAO.
 *   geosphere A0-4  Welcher Warn-API-Host lebt, Rate-Limit-Header, Bezugssystem der
 *                   zurückgegebenen Koordinaten (Bereichsprüfung gegen Österreich).
 *   ems       A2    Copernicus-EMS-Aktivierungs-JSON: Schema, DACH-Treffer, Brand-Kategorie.
 *   vg250     A1    BKG VG250-WFS: Capabilities, Gemeinde-Layer, ARS-Feld, eine Probe-Gemeinde.
 *   geocat    A3    BAFU-Waldbrand-Records auf geocat: Lizenzangabe (gegen STAC „proprietary").
 *
 * Netzabhängig ⇒ KEIN Gate-Verifier (D-12). Exit-Code immer 0; das Urteil steht
 * in der Ausgabe und im JSON. Es wird NIE `maxfeatures` klein gesetzt (V-224).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const ORIGIN = 'https://buscosun.com';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PART = argVal('--part') ?? 'all';
const JSON_OUT = argVal('--json');
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 90_000);

const out = { at: new Date().toISOString(), part: PART, steps: {} };
const say = (s = '') => console.log(s);
const head = (t) => { say(''); say(t); say('-'.repeat(t.length)); };

async function get(url, { timeout = TIMEOUT_MS, headers = {} } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN, ...headers }, signal: ac.signal, redirect: 'follow' });
    const buf = new Uint8Array(await res.arrayBuffer());
    const h = {};
    res.headers.forEach((v, k) => { h[k] = v; });
    return {
      ok: res.ok, status: res.status, ms: Date.now() - t0, bytes: buf.byteLength,
      acao: res.headers.get('access-control-allow-origin'),
      contentType: res.headers.get('content-type'),
      headers: h,
      body: new TextDecoder().decode(buf),
    };
  } catch (err) {
    return { ok: false, status: null, ms: Date.now() - t0, bytes: 0, error: String(err?.message ?? err), headers: {} };
  } finally { clearTimeout(timer); }
}
const stamp = (r) => `HTTP ${r.status ?? 'ERR'} · ${(r.ms / 1000).toFixed(1)} s · ${r.bytes} B · ACAO ${r.acao ?? '—'}`;
const tryJson = (s) => { try { return JSON.parse(s); } catch { return null; } };

const DACH = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
const inLonBand = (v) => v >= DACH.west && v <= DACH.east;
const inLatBand = (v) => v >= DACH.south && v <= DACH.north;

// ---------------------------------------------------------------------------
// A0-1 — Achsen-Spiegelung
// ---------------------------------------------------------------------------
async function partAxis() {
  head('A0-1 · Achsenreihenfolge der BBox → Ausgabe-Geometrie (je Endpunkt)');
  const EFFIS = 'https://maps.effis.emergency.copernicus.eu';
  const cases = [
    { ep: 'gwis', typename: 'ms:viirs.hs.today' },
    { ep: 'gwis', typename: 'ms:viirs.hs.week' },
    { ep: 'effis', typename: 'ms:modis.ba.poly.week' },
    { ep: 'effis', typename: 'ms:modis.ba.poly.season' },
  ];
  const res = [];
  for (const c of cases) {
    for (const order of ['latlon', 'lonlat']) {
      const bbox = order === 'latlon'
        ? `${DACH.south},${DACH.west},${DACH.north},${DACH.east},EPSG:4326`
        : `${DACH.west},${DACH.south},${DACH.east},${DACH.north},EPSG:4326`;
      const url = `${EFFIS}/${c.ep}?service=WFS&request=GetFeature&version=1.1.0&typename=${c.typename}&outputformat=geojson&bbox=${bbox}`;
      const r = await get(url);
      const j = r.ok ? tryJson(r.body) : null;
      const feats = j?.features ?? [];
      const firstCoord = (f) => {
        const g = f?.geometry; if (!g) return null;
        if (g.type === 'Point') return g.coordinates;
        if (g.type === 'Polygon') return g.coordinates?.[0]?.[0] ?? null;
        if (g.type === 'MultiPolygon') return g.coordinates?.[0]?.[0]?.[0] ?? null;
        return null;
      };
      const sample = feats.slice(0, 50).map(firstCoord).filter(Boolean);
      const firstIsLon = sample.length ? sample.filter((p) => inLonBand(p[0]) && inLatBand(p[1])).length / sample.length : null;
      const firstIsLat = sample.length ? sample.filter((p) => inLatBand(p[0]) && inLonBand(p[1])).length / sample.length : null;
      const row = {
        endpoint: c.ep, typename: c.typename, order, status: r.status, ms: r.ms, count: feats.length,
        first: sample[0] ?? null, shareLonLat: firstIsLon, shareLatLon: firstIsLat,
        verdict: !sample.length ? 'leer/fehler' : firstIsLon > 0.9 ? '[lon,lat] ✅ RFC 7946' : firstIsLat > 0.9 ? '[lat,lon] ⚠️ GESPIEGELT' : 'gemischt/unklar',
        error: r.error ?? null,
      };
      res.push(row);
      say(`  /${c.ep} ${c.typename} bbox=${order}: ${stamp(r)} · ${feats.length} Features · erstes ${JSON.stringify(row.first)} → ${row.verdict}`);
    }
  }
  out.steps.axis = res;
}

// ---------------------------------------------------------------------------
// A0-3 — NINA / MoWaS
// ---------------------------------------------------------------------------
const FIRE_CODES = new Set(['BBK-EVC-077', 'BBK-EVC-034', 'BBK-EVC-030', 'BBK-EVC-011', 'BBK-EVC-010']);
const FIRE_RX = /Waldbrand|Vegetationsbrand|Flächenbrand|Rauch|Brand/i;

async function partNina() {
  head('A0-3 · NINA/MoWaS-Struktur');
  const BASE = 'https://warnung.bund.de/api31';
  const step = { base: BASE, channels: {} };
  for (const ch of ['mowas', 'katwarn', 'biwapp', 'dwd', 'lhp', 'police']) {
    const r = await get(`${BASE}/${ch}/mapData.json`);
    const j = r.ok ? tryJson(r.body) : null;
    const arr = Array.isArray(j) ? j : [];
    const info = { status: r.status, ms: r.ms, bytes: r.bytes, acao: r.acao, count: arr.length, error: r.error ?? null };
    if (arr.length) {
      info.fields = Object.keys(arr[0]);
      info.sample = arr[0];
      const codes = new Map();
      for (const w of arr) {
        const c = w?.payload?.data?.eventCodes ?? w?.eventCodes ?? null;
        const codeList = Array.isArray(c) ? c : c ? [c] : [];
        for (const code of codeList) codes.set(String(code), (codes.get(String(code)) ?? 0) + 1);
      }
      info.eventCodes = Object.fromEntries(codes);
      info.severities = Object.fromEntries(arr.reduce((m, w) => m.set(w.severity, (m.get(w.severity) ?? 0) + 1), new Map()));
    }
    step.channels[ch] = info;
    say(`  ${ch}/mapData.json: ${stamp(r)} · ${arr.length} Warnungen · Felder ${info.fields?.join(',') ?? '—'}`);
  }
  // Details je MoWaS-Warnung (max. 40), Brandanteil bestimmen.
  const mow = step.channels.mowas;
  const list = mow?.count ? tryJson((await get(`${BASE}/mowas/mapData.json`)).body) : [];
  const details = [];
  let fireByCode = 0, fireByRx = 0, withGeom = 0, geomTypes = new Map(), arsShapes = new Set(), senders = new Map();
  for (const w of list.slice(0, 40)) {
    const id = w.id;
    const dj = await get(`${BASE}/warnings/${id}.json`);
    const dg = await get(`${BASE}/warnings/${id}.geojson`);
    const j = dj.ok ? tryJson(dj.body) : null;
    const g = dg.ok ? tryJson(dg.body) : null;
    const infos = j?.info ?? [];
    const codes = infos.flatMap((i) => (i.eventCode ?? []).map((e) => `${e.valueName}:${e.value}`));
    const evcs = infos.flatMap((i) => (i.eventCode ?? []).filter((e) => /BBK-EVC/.test(String(e.valueName))).map((e) => `BBK-EVC-${String(e.value).padStart(3, '0')}`));
    const text = infos.map((i) => `${i.headline ?? ''} ${i.description ?? ''} ${i.event ?? ''}`).join(' ');
    const byCode = evcs.some((c) => FIRE_CODES.has(c));
    const byRx = FIRE_RX.test(text);
    if (byCode) fireByCode++;
    if (byRx) fireByRx++;
    const geoc = infos.flatMap((i) => i.area ?? []).flatMap((a) => a.geocode ?? []);
    for (const gc of geoc) arsShapes.add(`${gc.valueName}:${String(gc.value).length}`);
    if (g?.features?.length) { withGeom++; for (const f of g.features) geomTypes.set(f.geometry?.type, (geomTypes.get(f.geometry?.type) ?? 0) + 1); }
    senders.set(j?.sender ?? '?', (senders.get(j?.sender ?? '?') ?? 0) + 1);
    details.push({
      id, statusJson: dj.status, statusGeo: dg.status, acaoJson: dj.acao, acaoGeo: dg.acao,
      sender: j?.sender ?? null, sent: j?.sent ?? null, msgType: j?.msgType ?? null, status: j?.status ?? null,
      headline: infos[0]?.headline ?? null, event: infos[0]?.event ?? null, severity: infos[0]?.severity ?? null,
      eventCodes: codes, evcs, fireByCode: byCode, fireByRx: byRx,
      areaDesc: infos[0]?.area?.[0]?.areaDesc ?? null, geocodeSample: geoc.slice(0, 3),
      geomFeatures: g?.features?.length ?? 0, geomTypes: [...new Set((g?.features ?? []).map((f) => f.geometry?.type))],
      geomBbox: (() => {
        const pts = [];
        const walk = (c) => { if (typeof c[0] === 'number') pts.push(c); else c.forEach(walk); };
        for (const f of g?.features ?? []) if (f.geometry?.coordinates) walk(f.geometry.coordinates);
        if (!pts.length) return null;
        return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
      })(),
    });
    say(`  ${id}: json ${dj.status} geo ${dg.status} · ${j?.sender ?? '?'} · ${infos[0]?.event ?? '?'} · ${evcs.join('/') || 'kein EVC'} · brand(code=${byCode},rx=${byRx}) · geom ${g?.features?.length ?? 0}`);
  }
  step.detailsProbed = details.length;
  step.fireByCode = fireByCode; step.fireByRx = fireByRx; step.withGeometry = withGeom;
  step.geometryTypes = Object.fromEntries(geomTypes); step.geocodeShapes = [...arsShapes]; step.senders = Object.fromEntries(senders);
  step.details = details;
  // Ein Detail-JSON komplett ablegen (Struktur-Referenz).
  if (list[0]) {
    const full = tryJson((await get(`${BASE}/warnings/${list[0].id}.json`)).body);
    step.detailSample = full;
  }
  say(`  Brand-Anteil unter ${details.length} MoWaS-Details: per Code ${fireByCode}, per Regex ${fireByRx}; mit Geometrie ${withGeom}`);
  out.steps.nina = step;
}

// ---------------------------------------------------------------------------
// A0-4 — GeoSphere Warn-API
// ---------------------------------------------------------------------------
async function partGeosphere() {
  head('A0-4 · GeoSphere Warn-API: Host, Rate-Limit-Header, Bezugssystem');
  const step = { hosts: {} };
  const spec = await get('https://openapi.hub.geosphere.at/warnapi/v1/openapi.json');
  const specJ = spec.ok ? tryJson(spec.body) : null;
  step.openapi = { status: spec.status, acao: spec.acao, servers: specJ?.servers ?? null, paths: specJ ? Object.keys(specJ.paths ?? {}) : null, security: specJ?.components?.securitySchemes ?? null };
  say(`  openapi.json: ${stamp(spec)} · servers ${JSON.stringify(specJ?.servers)} · paths ${step.openapi.paths?.join(' ')}`);
  const candidates = [
    'https://warnungen.zamg.at/wsapp/api/getWarnstatus',
    'https://warnungen.zamg.at/wsapp/api/getWarningsForCoords?lon=13.04&lat=47.80&lang=de',
    'https://warnungen.zamg.at/wsapp/api/getBBoxForCoords?lon=13.04&lat=47.80&lang=de',
    'https://warnapi.hub.geosphere.at/warnapi/v1/getWarnstatus',
    'https://openapi.hub.geosphere.at/warnapi/v1/getWarnstatus',
    'https://warnungen.geosphere.at/wsapp/api/getWarnstatus',
  ];
  for (const url of candidates) {
    const r = await get(url);
    const j = r.ok ? tryJson(r.body) : null;
    const rl = Object.fromEntries(Object.entries(r.headers).filter(([k]) => /ratelimit|retry-after|x-rate/i.test(k)));
    const info = { status: r.status, ms: r.ms, bytes: r.bytes, acao: r.acao, contentType: r.contentType, rateLimitHeaders: rl, error: r.error ?? null };
    if (j) {
      info.topKeys = Array.isArray(j) ? ['<array>', j.length] : Object.keys(j);
      // Koordinatenbereich einsammeln
      const pts = [];
      const walk = (c, depth = 0) => { if (depth > 12 || !c) return; if (Array.isArray(c)) { if (c.length >= 2 && typeof c[0] === 'number' && typeof c[1] === 'number') pts.push([c[0], c[1]]); else c.forEach((x) => walk(x, depth + 1)); } else if (typeof c === 'object') Object.values(c).forEach((x) => walk(x, depth + 1)); };
      walk(j?.features ?? j?.warnings ?? j);
      if (pts.length) {
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        info.coordRange = { n: pts.length, x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] };
        const atLon = (v) => v >= 9.4 && v <= 17.3, atLat = (v) => v >= 46.3 && v <= 49.1;
        info.crsGuess = pts.filter((p) => atLon(p[0]) && atLat(p[1])).length / pts.length > 0.9 ? 'WGS84 [lon,lat] ✅'
          : pts.filter((p) => atLat(p[0]) && atLon(p[1])).length / pts.length > 0.9 ? 'WGS84 [lat,lon] ⚠️'
            : Math.abs(xs[0]) > 1000 ? 'projiziert (EPSG:31287?) ⚠️' : 'unklar';
      }
      info.sample = JSON.stringify(j).slice(0, 1200);
    }
    step.hosts[url] = info;
    say(`  ${url}: ${stamp(r)} · RL ${JSON.stringify(rl)} · ${info.crsGuess ?? ''} ${info.coordRange ? JSON.stringify(info.coordRange) : ''}`);
  }
  out.steps.geosphere = step;
}

// ---------------------------------------------------------------------------
// A2 — Copernicus EMS Aktivierungen
// ---------------------------------------------------------------------------
async function partEms() {
  head('A2 · Copernicus-EMS-Aktivierungen (interne Dashboard-API)');
  const url = 'https://rapidmapping.emergency.copernicus.eu/backend/dashboard-api/public-activations-info/';
  const r = await get(url);
  const j = r.ok ? tryJson(r.body) : null;
  const arr = Array.isArray(j) ? j : Array.isArray(j?.results) ? j.results : Array.isArray(j?.data) ? j.data : [];
  const step = { url, status: r.status, ms: r.ms, bytes: r.bytes, acao: r.acao, contentType: r.contentType, count: arr.length, error: r.error ?? null };
  if (arr.length) {
    step.fields = Object.keys(arr[0]);
    step.sample = arr[0];
    step.categories = Object.fromEntries(arr.reduce((m, a) => m.set(String(a.category ?? a.categoryName ?? '?'), (m.get(String(a.category ?? a.categoryName ?? '?')) ?? 0) + 1), new Map()));
    const dach = arr.filter((a) => JSON.stringify(a.countries ?? a.country ?? '').match(/Germany|Austria|Switzerland|\bDE\b|\bAT\b|\bCH\b|Deutschland|Österreich|Schweiz/i));
    step.dachCount = dach.length;
    step.dach = dach.slice(0, 40).map((a) => ({ code: a.code, countries: a.countries ?? a.country, eventTime: a.eventTime ?? a.event_time, category: a.category ?? a.categoryName, centroid: a.centroid, closed: a.closed, name: a.name ?? a.title ?? null }));
    const fireDach = dach.filter((a) => /fire|brand|feuer|wildfire/i.test(JSON.stringify(a)));
    step.fireDachCount = fireDach.length;
    step.fireDach = fireDach.slice(0, 20);
  }
  say(`  ${stamp(r)} · ${arr.length} Aktivierungen · Felder ${step.fields?.join(',') ?? '—'} · DACH ${step.dachCount ?? '?'} · Brand-DACH ${step.fireDachCount ?? '?'}`);
  out.steps.ems = step;
}

// ---------------------------------------------------------------------------
// A1 — BKG VG250 WFS
// ---------------------------------------------------------------------------
async function partVg250() {
  head('A1 · BKG VG250 WFS (Gemeindegeometrie über ARS)');
  const BASE = 'https://sgx.geodatenzentrum.de/wfs_vg250';
  const step = { base: BASE };
  const cap = await get(`${BASE}?service=WFS&request=GetCapabilities&version=2.0.0`);
  step.capabilities = { status: cap.status, ms: cap.ms, bytes: cap.bytes, acao: cap.acao };
  const names = [...(cap.body ?? '').matchAll(/<(?:wfs:)?Name>([^<]+)<\/(?:wfs:)?Name>/g)].map((m) => m[1]);
  step.featureTypes = names;
  const formats = [...(cap.body ?? '').matchAll(/<(?:ows:)?Value>([^<]*json[^<]*)<\/(?:ows:)?Value>/gi)].map((m) => m[1]);
  step.jsonFormats = [...new Set(formats)];
  const fees = (cap.body ?? '').match(/<(?:ows:)?Fees>([^<]*)<\/(?:ows:)?Fees>/)?.[1] ?? null;
  const access = (cap.body ?? '').match(/<(?:ows:)?AccessConstraints>([\s\S]*?)<\/(?:ows:)?AccessConstraints>/)?.[1]?.trim().slice(0, 300) ?? null;
  step.fees = fees; step.accessConstraints = access;
  say(`  GetCapabilities: ${stamp(cap)} · FeatureTypes ${names.join(', ')} · JSON-Formate ${step.jsonFormats.join(' | ')} · Fees ${fees}`);
  const gem = names.find((n) => /gem/i.test(n)) ?? names[0];
  if (gem) {
    const dft = await get(`${BASE}?service=WFS&request=DescribeFeatureType&version=2.0.0&typeNames=${gem}`);
    step.gemFields = [...(dft.body ?? '').matchAll(/name="([A-Za-z_0-9]+)"/g)].map((m) => m[1]);
    say(`  DescribeFeatureType ${gem}: ${stamp(dft)} · Felder ${step.gemFields.join(',')}`);
    // Probe: eine Gemeinde per ARS (Hürtgenwald, Kreis Düren: ARS 053580020020? — wir filtern per CQL/Filter auf ARS beginnend mit 05358)
    for (const fmt of step.jsonFormats.length ? step.jsonFormats : ['application/json']) {
      const url = `${BASE}?service=WFS&request=GetFeature&version=2.0.0&typeNames=${gem}&outputFormat=${encodeURIComponent(fmt)}&count=3&bbox=50.65,6.30,50.75,6.45,urn:ogc:def:crs:EPSG::4326`;
      const r = await get(url);
      const j = r.ok ? tryJson(r.body) : null;
      step.sampleQuery = { url, status: r.status, ms: r.ms, bytes: r.bytes, acao: r.acao, count: j?.features?.length ?? null, contentType: r.contentType };
      if (j?.features?.length) {
        const f = j.features[0];
        step.sampleQuery.props = f.properties;
        step.sampleQuery.geomType = f.geometry?.type;
        step.sampleQuery.firstCoord = f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates[0][0][0] : f.geometry?.coordinates?.[0]?.[0];
        step.sampleQuery.crs = j.crs ?? null;
        say(`  GetFeature ${gem} bbox Hürtgenwald: ${stamp(r)} · ${j.features.length} · ${f.properties?.GEN ?? f.properties?.gen} ARS=${f.properties?.ARS ?? f.properties?.ars} · erste Koordinate ${JSON.stringify(step.sampleQuery.firstCoord)}`);
        break;
      } else {
        say(`  GetFeature ${gem} (${fmt}): ${stamp(r)} · ${(r.body ?? '').slice(0, 200).replace(/\s+/g, ' ')}`);
      }
    }
    // Größe der vollen Gemeindeschicht (HEAD/erste Bytes)? Nur zählen: resultType=hits
    const hits = await get(`${BASE}?service=WFS&request=GetFeature&version=2.0.0&typeNames=${gem}&resultType=hits`);
    step.gemCount = Number((hits.body ?? '').match(/numberMatched="(\d+)"/)?.[1] ?? NaN);
    say(`  Gemeinden gesamt (numberMatched): ${step.gemCount}`);
  }
  out.steps.vg250 = step;
}

// ---------------------------------------------------------------------------
// A3 — geocat Lizenz BAFU
// ---------------------------------------------------------------------------
async function partGeocat() {
  head('A3 · geocat.ch: Lizenzangabe der BAFU-Waldbrand-Records');
  const step = { records: {} };
  const ids = ['ch.bafu.gefahren-waldbrand_warnung', 'ch.bafu.gefahren-waldbrand_massnahmen', 'ch.bafu.gefahren-waldbrand-warnung', 'ch.bafu.gefahren-waldbrand-massnahmen'];
  for (const id of ids) {
    const stac = await get(`https://data.geo.admin.ch/api/stac/v1/collections/${id}`);
    const sj = stac.ok ? tryJson(stac.body) : null;
    const rec = { stac: { status: stac.status, license: sj?.license ?? null, links: (sj?.links ?? []).filter((l) => /license|describedby|geocat/i.test(`${l.rel} ${l.href}`)).map((l) => ({ rel: l.rel, href: l.href })) } };
    // geocat-Suche über die CSW/Elastic-API des Portals
    const q = await get(`https://www.geocat.ch/geonetwork/srv/api/search/records/_search?bucket=metadata`, { headers: { 'Content-Type': 'application/json' } });
    rec.geocatSearchStatus = q.status;
    step.records[id] = rec;
    say(`  ${id}: STAC ${stac.status} license=${sj?.license ?? '—'} · Links ${JSON.stringify(rec.stac.links)}`);
  }
  // geocat-Suche per POST (Elasticsearch-Proxy) nach „Waldbrand"
  const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://www.geocat.ch/geonetwork/srv/api/search/records/_search?bucket=metadata', {
      method: 'POST', signal: ac.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ query: { query_string: { query: 'Waldbrand gefahren warnung' } }, size: 20, _source: ['resourceTitleObject', 'uuid', 'MD_LegalConstraintsUseLimitationObject', 'licenseObject', 'MD_LegalConstraintsOtherConstraintsObject', 'link', 'resourceIdentifier'] }),
    });
    const j = await res.json().catch(() => null);
    const hits = j?.hits?.hits ?? [];
    step.geocatSearch = { status: res.status, hits: hits.map((h) => ({ uuid: h._id, title: h._source?.resourceTitleObject?.default, use: h._source?.MD_LegalConstraintsUseLimitationObject, other: h._source?.MD_LegalConstraintsOtherConstraintsObject, license: h._source?.licenseObject, ids: h._source?.resourceIdentifier })) };
    for (const h of step.geocatSearch.hits) say(`  geocat: ${h.uuid} · ${h.title} · use=${JSON.stringify(h.use)?.slice(0, 200)} other=${JSON.stringify(h.other)?.slice(0, 300)} license=${JSON.stringify(h.license)?.slice(0, 200)}`);
  } catch (e) { step.geocatSearch = { error: String(e?.message ?? e) }; say(`  geocat-Suche: ${step.geocatSearch.error}`); }
  finally { clearTimeout(timer); }
  out.steps.geocat = step;
}

const parts = { axis: partAxis, nina: partNina, geosphere: partGeosphere, ems: partEms, vg250: partVg250, geocat: partGeocat };
const run = PART === 'all' ? Object.keys(parts) : PART.split(',');
for (const p of run) {
  if (!parts[p]) { say(`unbekannter Teil: ${p}`); continue; }
  try { await parts[p](); } catch (e) { say(`  ✗ ${p}: ${e?.message ?? e}`); out.steps[p] = { error: String(e?.message ?? e) }; }
}
if (JSON_OUT) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
  say(`\n→ ${JSON_OUT}`);
}
