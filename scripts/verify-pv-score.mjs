/**
 * V-A — buscosun Fusion gegen Stationsmessungen NACHRECHNEN (0–24 h, DE).
 *
 *   npm run verify:pv-score            (alle DE-Stationen mit POI, ~111)
 *   npm run verify:pv-score -- --stations 30 --maxLead 24 --out audit/punktvorhersage-14tage/va
 *
 * Was hier passiert (FUSION_VERIFICATION.md §9.2):
 *   1. Eingaben AS-OF t₀ = Ausgabezeit eines MOSMIX_L-Laufs + 2 h Publikationsreserve:
 *      der Lauf selbst (8 Läufe, 48 h Rollfenster auf opendata.dwd.de) und die
 *      Stationsmessung zu t₀ aus DWD POI (24-h-Rollfenster) — nichts Jüngeres.
 *   2. Dieselben Samples durch den ALTPFAD (`blendVariable` + Terrainzuschlag, wie
 *      `getPointForecast`) und durch buscosun FUSION (`computeDistributions`, mit echtem
 *      DEM und echter Klimatologie) — beides die echten Module, kein Nachbau.
 *   3. Referenzen: rohes MOSMIX an der Station (Anspruch A), Persistenz, ANOMALIE-
 *      Persistenz (Klimatologie(t) + Obs(t₀) − Klimatologie(t₀)), Klimatologie, und für
 *      den Niederschlag MOSMIX' eigene PoP (R101).
 *   4. Wahrheit: POI zur Zielzeit t₀ + h. MAE/Bias/RMSE je Methode, CRPS/PIT/Spread-Skill
 *      für die Fusion, Brier + Reliability für P(nass); CRPSS gegen die BESTE Referenz,
 *      Diebold-Mariano mit HAC über die Zielstunden, Block-Bootstrap über Läufe.
 *   5. Negativkontrolle: eine absichtlich um eine Stunde in die Zukunft gestempelte
 *      Messung MUSS den h = 1-Fehler kollabieren lassen — sonst prüft der Leck-Wächter nichts.
 *
 * Grenzen dieses Schnappschusses (ehrlich): POI hält 24 h, also verifizieren alle Läufe
 * gegen DIESELBEN ≤ 24 Zielstunden — n_eff ist die Zahl der Zielstunden, nicht die Zahl der
 * Datensätze. Ein Lauf ist ein Schnappschuss; belastbar wird die Zahl erst über Tage
 * (Scorecard-JSON je Lauf im Ausgabeordner, zum Aufsummieren). Netzabhängig — kein CI-Gate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { inflateRawSync, constants as zc } from 'node:zlib';
import { decodePng } from './lib/png.mjs';
import { hourlyClimaTemp } from '../src/pointForecast/fusion/fuse.ts';
import { computeDistributions } from '../src/pointForecast/fusion/attach.ts';
import { ClimaField } from '../src/ml/climaField.ts';
import { blendVariable, anchorOffsetsFor, anchoredValues } from '../src/pointForecast/pointForecast.ts';
import { ANCHOR_HISTORY_H } from '../src/pointForecast/anchor.ts';
import { terrainContext, terrainTempDeltaC } from '../src/pointForecast/terrainPhysics.ts';
import { crpsOf, quantileOf, cdfOf, pitOf, meanOf } from '../src/pointForecast/fusion/dist.ts';
import { rhFromDewPoint, dewPointC as dewPointOf } from '../src/pointForecast/fusion/meteo.ts';
import { WET_HOURS_PER_WET_DAY } from '../src/pointForecast/fusion/priors.ts';

// ─── Parameter ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argOf = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] != null ? args[i + 1] : dflt; };
const MAX_STATIONS = Number(argOf('--stations', '999'));
const MAX_LEAD = Number(argOf('--maxLead', '24'));
const OUT_DIR = argOf('--out', 'audit/punktvorhersage-14tage/va');
const PUBLISH_LAG_H = 2;            // MOSMIX_L: gemessen +73 min nach Laufzeit (M-02); 2 h ist die sichere Seite
const OBS_LEADS = 6;                // Produktion hängt Stationen an h = 0…5 (`pointForecast.ts`)
const LAPSE = 0.0065;               // eine Station ⇒ keine Regression, Produktions-Rückfall
const DEM_ZOOM = 9;
const CACHE_DIR = '.cache/pv-score';
const CONCURRENCY = 6;
const WET_MM = 0.1;

const POI_URL = (id) => `https://opendata.dwd.de/weather/weather_reports/poi/${id}-BEOB.csv`;
const MOSMIX_DIR = (id) => `https://opendata.dwd.de/weather/local_forecasts/mos/MOSMIX_L/single_stations/${id}/kml/`;
const TERRARIUM = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;

const H = 3_600_000;
const nowMs = Date.now();
mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

// ─── Netz ──────────────────────────────────────────────────────────────────
async function fetchBuf(url, tries = 2) {
  for (let a = 0; a < tries; a++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 40_000);
    try {
      const res = await fetch(url, { signal: ac.signal });
      clearTimeout(t);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      clearTimeout(t);
      if (a === tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 500 * (a + 1)));
    }
  }
  return null;
}
async function fetchCached(url, key) {
  const p = `${CACHE_DIR}/${key}`;
  if (existsSync(p)) return readFileSync(p);
  const b = await fetchBuf(url);
  if (b) writeFileSync(p, b);
  return b;
}
async function pMap(items, fn, limit = CONCURRENCY) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// ─── DWD POI (Messungen, 24 h) ─────────────────────────────────────────────
const POI_COLS = {
  t: 'dry_bulb_temperature_at_2_meter_above_ground',
  td: 'dew_point_temperature_at_2_meter_above_ground',
  rh: 'relative_humidity',
  ff: 'mean_wind_speed_during last_10_min_at_10_meters_above_ground',
  dd: 'mean_wind_direction_during_last_10 min_at_10_meters_above_ground',
  fx: 'maximum_wind_speed_last_hour',
  rr1: 'precipitation_amount_last_hour',
  n: 'cloud_cover_total',
};
function parsePoi(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const head = lines[0].split(';');
  const col = {};
  for (const [k, name] of Object.entries(POI_COLS)) col[k] = head.indexOf(name);
  const num = (s) => { if (s == null) return null; const v = parseFloat(String(s).replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const rows = new Map();
  for (const line of lines.slice(3)) {
    const f = line.split(';');
    const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(f[0]); const hm = /^(\d{2}):(\d{2})$/.exec(f[1] ?? '');
    if (!m || !hm) continue;
    const ms = Date.UTC(2000 + +m[3], +m[2] - 1, +m[1], +hm[1], +hm[2]);
    const g = (k) => (col[k] >= 0 ? num(f[col[k]]) : null);
    const kmh = (v) => (v == null ? null : v / 3.6);
    rows.set(ms, { t: g('t'), td: g('td'), rh: g('rh'), ff: kmh(g('ff')), dd: g('dd'), fx: kmh(g('fx')), rr1: g('rr1'), n: g('n') });
  }
  return rows;
}

// ─── MOSMIX_L (KMZ → KML) ─────────────────────────────────────────────────
function kmzToKml(buf) {
  const nameLen = buf.readUInt16LE(26), extraLen = buf.readUInt16LE(28), method = buf.readUInt16LE(8);
  const start = 30 + nameLen + extraLen;
  const raw = method === 8 ? inflateRawSync(buf.subarray(start), { finishFlush: zc.Z_SYNC_FLUSH }) : buf.subarray(start);
  return raw.toString('latin1');
}
function parseMosmix(kml) {
  const issue = /<dwd:IssueTime>([^<]+)</.exec(kml);
  const steps = [...kml.matchAll(/<dwd:TimeStep>([^<]+)</g)].map((m) => Date.parse(m[1]));
  const coords = /<kml:coordinates>([^<]+)</.exec(kml) ?? /<coordinates>([^<]+)</.exec(kml);
  const [lon, lat, elev] = coords ? coords[1].trim().split(',').map(Number) : [NaN, NaN, NaN];
  const get = (el) => {
    const i = kml.indexOf(`dwd:elementName="${el}"`);
    if (i < 0) return null;
    const a = kml.indexOf('<dwd:value>', i), b = kml.indexOf('</dwd:value>', a);
    if (a < 0 || b < 0) return null;
    return kml.slice(a + 11, b).trim().split(/\s+/).map((v) => (v === '-' ? NaN : Number(v)));
  };
  const idx = new Map(steps.map((ms, i) => [ms, i]));
  return { issueMs: issue ? Date.parse(issue[1]) : NaN, steps, idx, lon, lat, elev, get };
}

// ─── DEM (Terrarium z9, wie `elevation.ts`, ±0,2° um den Punkt) ────────────
const lng2tileX = (lng, z) => ((lng + 180) / 360) * Math.pow(2, z);
const lat2tileY = (lat, z) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * Math.pow(2, z); };
async function loadDem(lat, lng) {
  const z = DEM_ZOOM;
  const x0 = Math.floor(lng2tileX(lng - 0.2, z)), x1 = Math.floor(lng2tileX(lng + 0.2, z));
  const y0 = Math.floor(lat2tileY(lat + 0.2, z)), y1 = Math.floor(lat2tileY(lat - 0.2, z));
  const tiles = new Map();
  const need = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) need.push([x, y]);
  await pMap(need, async ([x, y]) => {
    const buf = await fetchCached(TERRARIUM(z, x, y), `dem_${z}_${x}_${y}.png`);
    if (buf) tiles.set(`${x}/${y}`, decodePng(buf));
  }, 4);
  const px = (img, i, j) => { const o = (j * img.width + i) * img.channels; return img.data[o] * 256 + img.data[o + 1] + img.data[o + 2] / 256 - 32768; };
  return (lg, la) => {
    const fx = lng2tileX(lg, z), fy = lat2tileY(la, z);
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const img = tiles.get(`${tx}/${ty}`);
    if (!img) return NaN;
    const sx = (fx - tx) * 256, sy = (fy - ty) * 256;
    const i0 = Math.max(0, Math.min(255, Math.floor(sx))), j0 = Math.max(0, Math.min(255, Math.floor(sy)));
    const i1 = Math.min(255, i0 + 1), j1 = Math.min(255, j0 + 1);
    const fr = sx - i0, gr = sy - j0;
    const e0 = px(img, i0, j0) * (1 - fr) + px(img, i1, j0) * fr;
    const e1 = px(img, i0, j1) * (1 - fr) + px(img, i1, j1) * fr;
    return e0 * (1 - gr) + e1 * gr;
  };
}

// ─── Klimatologie (dieselbe Datei, dieselbe Stundenformel wie `attach.ts`) ──
const clima = new ClimaField(JSON.parse(readFileSync('public/climaGrid.json', 'utf8')));
const doyOf = (ms) => { const d = new Date(ms); return Math.floor((ms - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000) + 1; };
function climaAt(st, ms) {
  const cs = clima.sample(st.lat, st.lon, doyOf(ms), st.elev);
  const d = new Date(ms);
  const lh = (((d.getUTCHours() + d.getUTCMinutes() / 60 + st.lon / 15) % 24) + 24) % 24;
  const wetDay = Math.min(0.95, Math.max(0.02, cs.wetProb));
  return { t: hourlyClimaTemp(cs.tempMean, cs.diurnalAmp, lh), pWetHour: 1 - Math.pow(1 - wetDay, 1 / WET_HOURS_PER_WET_DAY) };
}

// ─── Samples wie in der Produktion ─────────────────────────────────────────
const uv = (ff, dd) => (ff == null || dd == null ? [null, null] : [-ff * Math.sin((dd * Math.PI) / 180), -ff * Math.cos((dd * Math.PI) / 180)]);
const fin = (v) => (v != null && Number.isFinite(v) ? v : null);
function mosmixSample(run, ms) {
  const i = run.idx.get(ms);
  if (i == null) return null;
  const v = (el) => { const a = run.get(el); return a ? fin(a[i]) : null; };
  const t = v('TTT'), td = v('Td');
  const tC = t == null ? null : t - 273.15, tdC = td == null ? null : td - 273.15;
  const [u, w] = uv(v('FF'), v('DD'));
  const n = v('N');
  return {
    source: 'mosmix', family: 'mosmix',
    temperature: tC, sourceElevation: run.elev,
    u, v: w, gust: v('FX1'),
    relativeHumidity: tC != null && tdC != null ? rhFromDewPoint(tC, tdC) : null,
    snowLine: null,
    cloudLow: n == null ? null : n * 0.55, cloudMid: n == null ? null : n * 0.30, cloudHigh: n == null ? null : n * 0.15,
    precipitation: v('RR1c'), uvIndex: null, distanceMeters: 0,
    // Referenzen, nicht Teil des Sample-Vertrags:
    _pop: v('R101') == null ? null : v('R101') / 100, _td: tdC, _ff: v('FF'), _fx: v('FX1'), _rr: v('RR1c'),
  };
}
function obsSample(o, elev, validAtMs) {
  const [u, w] = uv(o.ff, o.dd);
  return {
    source: 'dwd_obs', family: 'obs', temperature: fin(o.t), sourceElevation: elev,
    u, v: w, gust: fin(o.fx), relativeHumidity: fin(o.rh), snowLine: null,
    cloudLow: null, cloudMid: null, cloudHigh: null,        // Produktion: Stationswolken bewusst null
    precipitation: fin(o.rr1), uvIndex: null, distanceMeters: 0, validAtMs,
  };
}

// ─── Altpfad-Replikat (Schritte 4/4b aus `getPointForecast`) ───────────────
// `mode` = 'value' (alter Anker: Stationen als Wert an h = 0…5) oder 'offset'
// (Innovations-Persistenz: Stationen nur bei h = 0 im Blend, ab h = 1 der
// abklingende Versatz aus `anchorOffsetsFor`) — dieselben Funktionen wie in
// `getPointForecast`.
function altpfadHour(allSamples, h, st, terrain, tsMs, hasAnchor, mode = 'value', anchor = null) {
  const samples = mode === 'offset' && h > 0 ? allSamples.filter((s) => s.family !== 'obs') : allSamples;
  const b = (variable, pick) => blendVariable(samples, variable, h, st.elev, LAPSE, pick).value;
  const a = anchoredValues(h, mode === 'offset' ? anchor : null, {
    temperature: b('temperature'), u: b('wind', 'u'), v: b('wind', 'v'), gust: b('gust'), humidity: b('humidity'),
  });
  let temperature = a.temperature;
  const u = a.u, v = a.v;
  let windSpeed = null, windDirection = null;
  if (u != null && v != null) { windSpeed = Math.hypot(u, v); windDirection = ((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360; }
  const g = a.gust;
  const gustSpeed = g != null ? (windSpeed != null ? Math.max(g, windSpeed) : g) : (windSpeed != null ? windSpeed * 1.4 : null);
  const relativeHumidity = a.humidity;
  const cl = b('clouds', 'cloudLow') ?? 0, cm = b('clouds', 'cloudMid') ?? 0, ch = b('clouds', 'cloudHigh') ?? 0;
  const cloudCoverTotal = Math.min(100, cl + cm + ch);
  const precipitation = b('precipitation');
  if (temperature != null && (terrain.sinkDepthM > 0 || terrain.slopeRad >= 0.03)) {
    temperature += terrainTempDeltaC({ ctx: terrain, lat: st.lat, lng: st.lon, etaMs: tsMs, windMs: windSpeed, cloudPct: cloudCoverTotal, anchorAttenuation: hasAnchor ? 0.35 : 1 });
  }
  return {
    timestamp: new Date(tsMs), temperature, windSpeed, windDirection, gustSpeed, relativeHumidity,
    apparentTemperature: null, snowLineM: null, cloudCoverTotal, cloudCoverLow: cl, cloudCoverMid: cm, cloudCoverHigh: ch,
    precipitation, uvIndex: null,
    confidence: { temperature: 0, wind: 0, gust: 0, humidity: 0, precipitation: 0, clouds: 0, snowLine: 0, uvIndex: 0 },
    contributingSources: [],
  };
}

// ─── Eine Station × ein Lauf ───────────────────────────────────────────────
const records = [];          // { st, run, lead, target, var, method, value | dist, truth }
const controls = { leak: [], k1: [] };
const med = (d) => quantileOf(d, 0.5);

async function scoreRun(st, run, runs, poi, dem, terrain) {
  const t0 = run.issueMs + PUBLISH_LAG_H * H;
  if (t0 > nowMs) return;
  const obs0 = poi.get(t0) ?? null;
  const hasAnchor = !!(obs0 && obs0.t != null);
  const leads = [];
  for (let h = 1; h <= MAX_LEAD; h++) { const tg = t0 + h * H; if (tg <= nowMs && poi.has(tg) && run.idx.has(tg)) leads.push(h); }
  if (!leads.length) return;
  const Lmax = leads[leads.length - 1];

  // Anker-Historie (Schritt zwei), as-of: für die Stunde t₀ − k die Messung aus
  // POI und der Modellwert des Laufs, der zu DIESER Stunde bereits publiziert war.
  const histHours = [];
  for (let k = 1; k <= ANCHOR_HISTORY_H; k++) {
    const ms = t0 - k * H;
    const o = poi.get(ms);
    const asOf = runs.filter((r) => r.issueMs + PUBLISH_LAG_H * H <= ms && r.idx.has(ms)).sort((a, b) => b.issueMs - a.issueMs)[0];
    const m = asOf ? mosmixSample(asOf, ms) : null;
    if (o && m) histHours.push({ ageH: k, samples: [m, obsSample(o, st.elev, ms)] });
  }

  const build = (obsOverride, withMosmix = true) => {
    const unified = [];
    for (let L = 0; L <= Lmax; L++) {
      const ms = t0 + L * H;
      const s = [];
      const m = withMosmix ? mosmixSample(run, ms) : null;
      if (m) s.push(m);
      if (obs0 && L < OBS_LEADS) s.push(obsOverride ? obsOverride(L) : obsSample(obs0, st.elev, t0));
      unified.push({ timestamp: new Date(ms), samples: s });
    }
    const anchor = unified.length ? anchorOffsetsFor([{ ageH: 0, samples: unified[0].samples }, ...histHours], st.elev, LAPSE) : null;
    const blendedValue = unified.map((u, L) => altpfadHour(u.samples, L, st, terrain, u.timestamp.getTime(), hasAnchor, 'value', null));
    const blendedOffset = unified.map((u, L) => altpfadHour(u.samples, L, st, terrain, u.timestamp.getTime(), hasAnchor, 'offset', anchor));
    // Die Fusion bekommt den Produktions-Default (Versatz) als Kontext für Föhn/Terrain-Gates.
    return { unified, blended: blendedOffset, blendedValue, blendedOffset, anchor };
  };
  const common = { lat: st.lat, lng: st.lon, elevationM: st.elev, lapseRatePerM: LAPSE, terrain, demSample: dem, climaField: clima };
  const main = build(null);
  const fusion = await computeDistributions({ ...common, unified: main.unified, blended: main.blended });

  // Negativkontrolle (Leck), zweistufig. Die Messung von t₀ + 1 h wird eingespeist:
  //  (a) im vollen Mix — der Anker hat bei h = 1 nur ~50 % Gewicht, ein Leck muss
  //      den Fehler dennoch MESSBAR senken (≥ 10 %);
  //  (b) allein, mit ihrem echten Zeitstempel — dann IST die Fusion bei h = 1 die
  //      Wahrheit (bis auf die Schrumpfung 1 − ρ²), der Fehler muss kollabieren.
  let leak = null, leakAlone = null, honestAlone = null;
  if (hasAnchor && leads.includes(1)) {
    const fut = poi.get(t0 + H);
    if (fut && fut.t != null) {
      const b = build(() => obsSample({ ...obs0, t: fut.t }, st.elev, t0));
      leak = await computeDistributions({ ...common, unified: b.unified, blended: b.blended });
      const bl = build(() => obsSample({ ...obs0, t: fut.t }, st.elev, t0 + H), false);
      leakAlone = await computeDistributions({ ...common, unified: bl.unified, blended: bl.blended });
      const bh = build(null, false);
      honestAlone = await computeDistributions({ ...common, unified: bh.unified, blended: bh.blended });
    }
  }
  // K-1-Kontrolle: dieselbe Messung ohne Gültigkeitszeit (Wertpersistenz).
  let noTime = null;
  if (hasAnchor) {
    const b = build(() => obsSample(obs0, st.elev, undefined));
    noTime = await computeDistributions({ ...common, unified: b.unified, blended: b.blended });
  }

  for (const h of leads) {
    const tg = t0 + h * H;
    const truth = poi.get(tg);
    const ms = mosmixSample(run, tg);
    const alt = main.blendedValue[h];        // alter Anker (Wert)
    const altO = main.blendedOffset[h];      // neuer Anker (Versatz, Produktions-Default)
    const fu = fusion[h];
    const c = climaAt(st, tg), c0 = climaAt(st, t0);
    const push = (v, method, value, tr, extra = {}) => {
      if (tr == null || !Number.isFinite(tr)) return;
      if (value == null || (typeof value === 'number' && !Number.isFinite(value))) return;
      records.push({ st: st.id, run: run.issueMs, lead: h, target: tg, var: v, method, value, truth: tr, ...extra });
    };
    // Temperatur
    push('T', 'mosmix', ms?.temperature, truth.t);
    push('T', 'altpfad(wert)', alt?.temperature, truth.t);
    push('T', 'altpfad(versatz)', altO?.temperature, truth.t);
    if (fu?.temperature) push('T', 'fusion', med(fu.temperature.dist), truth.t, { dist: fu.temperature.dist });
    push('T', 'klimatologie', c.t, truth.t);
    if (hasAnchor) { push('T', 'persistenz', obs0.t, truth.t); push('T', 'anomaliepersistenz', c.t + (obs0.t - c0.t), truth.t); }
    // Taupunkt
    push('Td', 'mosmix', ms?._td, truth.td);
    if (fu?.dewPoint) push('Td', 'fusion', med(fu.dewPoint.dist), truth.td, { dist: fu.dewPoint.dist });
    if (hasAnchor && obs0.td != null) push('Td', 'persistenz', obs0.td, truth.td);
    // Wind
    push('Wind', 'mosmix', ms?._ff, truth.ff);
    push('Wind', 'altpfad(wert)', alt?.windSpeed, truth.ff);
    push('Wind', 'altpfad(versatz)', altO?.windSpeed, truth.ff);
    if (fu?.windSpeed) push('Wind', 'fusion', med(fu.windSpeed.dist), truth.ff, { dist: fu.windSpeed.dist });
    if (hasAnchor && obs0.ff != null) push('Wind', 'persistenz', obs0.ff, truth.ff);
    // Böe
    push('Boee', 'mosmix', ms?._fx, truth.fx);
    push('Boee', 'altpfad(wert)', alt?.gustSpeed, truth.fx);
    push('Boee', 'altpfad(versatz)', altO?.gustSpeed, truth.fx);
    // Taupunkt/Feuchte des Altpfads: RH-Blend → Td zum Vergleich mit der Fusion.
    if (truth.td != null && altO?.temperature != null && altO?.relativeHumidity != null) {
      push('Td', 'altpfad(versatz)', dewPointOf(altO.temperature, altO.relativeHumidity), truth.td);
      if (alt?.temperature != null && alt?.relativeHumidity != null) push('Td', 'altpfad(wert)', dewPointOf(alt.temperature, alt.relativeHumidity), truth.td);
    }
    if (fu?.gust) push('Boee', 'fusion', med(fu.gust.dist), truth.fx, { dist: fu.gust.dist });
    // Niederschlag: Wahrscheinlichkeit und Menge
    if (truth.rr1 != null) {
      const wet = truth.rr1 >= WET_MM ? 1 : 0;
      if (fu?.precipitation) {
        push('PoP', 'fusion', 1 - cdfOf(fu.precipitation.dist, 0), wet);
        push('RR', 'fusion', med(fu.precipitation.dist), truth.rr1, { dist: fu.precipitation.dist, mean: meanOf(fu.precipitation.dist) });
      }
      if (ms?._pop != null) push('PoP', 'mosmix R101', ms._pop, wet);
      if (ms?._rr != null) { push('PoP', 'mosmix RR1c>0', ms._rr >= WET_MM ? 1 : 0, wet); push('RR', 'mosmix', ms._rr, truth.rr1); }
      push('PoP', 'klimatologie', c.pWetHour, wet);
      push('RR', 'altpfad(wert)', alt?.precipitation, truth.rr1);
    }
    // Kontrollen
    if (h === 1 && leak?.[1]?.temperature && leakAlone?.[1]?.temperature && honestAlone?.[1]?.temperature && fu?.temperature && truth.t != null) {
      controls.leak.push({
        honest: Math.abs(med(fu.temperature.dist) - truth.t), leaked: Math.abs(med(leak[1].temperature.dist) - truth.t),
        honestAlone: Math.abs(med(honestAlone[1].temperature.dist) - truth.t), leakedAlone: Math.abs(med(leakAlone[1].temperature.dist) - truth.t),
      });
    }
    if (h <= 5 && noTime?.[h]?.temperature && fu?.temperature && truth.t != null) {
      controls.k1.push({ lead: h, hourUtc: new Date(tg).getUTCHours(), withTime: Math.abs(med(fu.temperature.dist) - truth.t), noTime: Math.abs(med(noTime[h].temperature.dist) - truth.t) });
    }
  }
}

// ─── Statistik ─────────────────────────────────────────────────────────────
const BINS = [['1–6 h', 1, 6], ['7–12 h', 7, 12], ['13–24 h', 13, 24]];
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function dmTest(diffsByTime) {
  // Diebold-Mariano auf der Zeitreihe der Score-Differenzen (je Zielstunde gemittelt), HAC (Newey-West).
  const keys = [...diffsByTime.keys()].sort((a, b) => a - b);
  const d = keys.map((k) => mean(diffsByTime.get(k)));
  const n = d.length;
  if (n < 4) return { n, stat: NaN, p: NaN };
  const m = mean(d);
  const L = Math.floor(1.5 * Math.cbrt(n));
  let v = 0;
  for (let lag = 0; lag <= L; lag++) {
    let g = 0;
    for (let t = lag; t < n; t++) g += (d[t] - m) * (d[t - lag] - m);
    g /= n;
    v += (lag === 0 ? 1 : 2 * (1 - lag / (L + 1))) * g;
  }
  const se = Math.sqrt(Math.max(v, 1e-12) / n);
  const stat = m / se;
  const p = 2 * (1 - Phi(Math.abs(stat)));
  return { n, stat, p };
}
function Phi(z) { const t = 1 / (1 + 0.3275911 * Math.abs(z)); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z); return 0.5 * (1 + (z < 0 ? -y : y)); }

function summarise() {
  // CRPS/PIT je Fusions-Datensatz EINMAL rechnen — das Rice-Quantil ist eine
  // Bisektion über eine Reihe, und der Bootstrap fragt jeden Datensatz 200-mal.
  for (const r of records) {
    if (r.method !== 'fusion' || !r.dist || r.crps != null) continue;
    r.crps = crpsOf(r.dist, r.truth);
    r.pit = pitOf(r.dist, r.truth);
    r.sigma = r.dist.sigma ?? (quantileOf(r.dist, 0.84) - quantileOf(r.dist, 0.16)) / 2;
  }
  const out = {};
  const vars = ['T', 'Td', 'Wind', 'Boee', 'RR'];
  for (const v of vars) {
    out[v] = {};
    for (const [bin, lo, hi] of BINS) {
      const recs = records.filter((r) => r.var === v && r.lead >= lo && r.lead <= hi);
      if (!recs.length) continue;
      const methods = [...new Set(recs.map((r) => r.method))];
      const row = { n: recs.filter((r) => r.method === 'fusion').length, methods: {} };
      for (const mth of methods) {
        const rs = recs.filter((r) => r.method === mth);
        const errs = rs.map((r) => r.value - r.truth);
        const abs = errs.map(Math.abs);
        const m = { n: rs.length, mae: mean(abs), bias: mean(errs), rmse: Math.sqrt(mean(errs.map((e) => e * e))) };
        if (mth === 'fusion') {
          m.crps = mean(rs.map((r) => r.crps));
          const pits = rs.map((r) => r.pit);
          const hist = new Array(10).fill(0);
          for (const p of pits) hist[Math.min(9, Math.max(0, Math.floor(p * 10)))]++;
          m.pit = hist.map((c) => c / pits.length);
          m.pitOuter = (hist[0] + hist[9]) / pits.length;                // Soll 0,2
          m.spreadSkill = v === 'RR' ? null : mean(rs.map((r) => r.sigma)) / m.rmse;   // RR: Atom + Lognormal, σ in mm ist keine Streuung
          if (v === 'RR') m.maeMean = mean(rs.map((r) => Math.abs(r.mean - r.truth)));
        }
        row.methods[mth] = m;
      }
      // beste deterministische Referenz (CRPS = MAE) und Skill dagegen
      const det = Object.entries(row.methods).filter(([k]) => k !== 'fusion');
      if (row.methods.fusion && det.length) {
        const [bestName, best] = det.reduce((a, b) => (b[1].mae < a[1].mae ? b : a));
        row.best = bestName;
        row.crpss = 1 - row.methods.fusion.crps / best.mae;
        row.maess = 1 - row.methods.fusion.mae / best.mae;
        // DM: paarweise über identische (Station, Lauf, Lead)
        const key = (r) => `${r.st}|${r.run}|${r.lead}`;
        const bm = new Map(recs.filter((r) => r.method === bestName).map((r) => [key(r), r]));
        const byTime = new Map();
        const pairs = [];                      // [run, crpsFusion, maeBest]
        for (const r of recs) {
          if (r.method !== 'fusion') continue;
          const b = bm.get(key(r)); if (!b) continue;
          const maeB = Math.abs(b.value - b.truth);
          pairs.push([r.run, r.crps, maeB]);
          if (!byTime.has(r.target)) byTime.set(r.target, []);
          byTime.get(r.target).push(r.crps - maeB);
        }
        row.dm = dmTest(byTime);
        // Block-Bootstrap über Läufe (die Blöcke, die zeitlich zusammenhängen)
        const byRun = new Map();
        for (const p of pairs) { if (!byRun.has(p[0])) byRun.set(p[0], [0, 0]); const a = byRun.get(p[0]); a[0] += p[1]; a[1] += p[2]; }
        const runs = [...byRun.keys()];
        const boots = [];
        let seed = 12345; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        for (let b = 0; b < 500 && runs.length >= 2; b++) {
          let cf = 0, cb = 0;
          for (let i = 0; i < runs.length; i++) { const a = byRun.get(runs[Math.floor(rnd() * runs.length)]); cf += a[0]; cb += a[1]; }
          if (cb > 0) boots.push(1 - cf / cb);
        }
        boots.sort((a, b) => a - b);
        row.crpssCi = boots.length ? [boots[Math.floor(0.05 * boots.length)], boots[Math.floor(0.95 * boots.length)]] : null;
      }
      out[v][bin] = row;
    }
  }
  // Niederschlagswahrscheinlichkeit: Brier + Reliability
  out.PoP = {};
  for (const [bin, lo, hi] of BINS) {
    const recs = records.filter((r) => r.var === 'PoP' && r.lead >= lo && r.lead <= hi);
    if (!recs.length) continue;
    const row = { methods: {} };
    for (const mth of [...new Set(recs.map((r) => r.method))]) {
      const rs = recs.filter((r) => r.method === mth);
      const brier = mean(rs.map((r) => (r.value - r.truth) ** 2));
      const base = mean(rs.map((r) => r.truth));
      const rel = [];
      for (let b = 0; b < 5; b++) {
        const inBin = rs.filter((r) => r.value >= b / 5 && (b === 4 ? r.value <= 1 : r.value < (b + 1) / 5));
        rel.push({ bin: `${b * 20}–${(b + 1) * 20} %`, n: inBin.length, fc: inBin.length ? mean(inBin.map((r) => r.value)) : null, obs: inBin.length ? mean(inBin.map((r) => r.truth)) : null });
      }
      row.methods[mth] = { n: rs.length, brier, baseRate: base, bss: 1 - brier / (base * (1 - base) || 1), reliability: rel };
    }
    out.PoP[bin] = row;
  }
  return out;
}

// ─── Hauptlauf ─────────────────────────────────────────────────────────────
const grid = JSON.parse(readFileSync('public/climaGrid.json', 'utf8'));
const stations = grid.stations.filter((s) => /^10\d{3}$/.test(s.id)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_STATIONS);
console.log(`V-A Nachrechnen · ${stations.length} DE-Stationen · Leads 1–${MAX_LEAD} h · t₀ = MOSMIX_L-Lauf + ${PUBLISH_LAG_H} h · jetzt ${new Date(nowMs).toISOString()}`);

const usedStations = [];
const runsSeen = new Set();
let stationsWithoutPoi = 0, stationsWithoutDem = 0;
await pMap(stations, async (st) => {
  try {
    const poiBuf = await fetchBuf(POI_URL(st.id));
    if (!poiBuf) { stationsWithoutPoi++; return; }
    const poi = parsePoi(poiBuf.toString('utf8'));
    const listing = await fetchBuf(MOSMIX_DIR(st.id));
    if (!listing) return;
    const files = [...new Set([...listing.toString('utf8').matchAll(/MOSMIX_L_(\d{10})_\d{5}\.kmz/g)].map((m) => m[0]))].sort();
    const runs = (await pMap(files, async (f) => {
      const b = await fetchCached(MOSMIX_DIR(st.id) + f, `${f}`);
      return b ? parseMosmix(kmzToKml(b)) : null;
    }, 4)).filter((r) => r && Number.isFinite(r.issueMs));
    const dem = await loadDem(st.lat, st.lon);
    if (!Number.isFinite(dem(st.lon, st.lat))) { stationsWithoutDem++; return; }
    const terrain = terrainContext(dem, st.lon, st.lat);
    // Höhe wie in der Produktion: das DEM am Punkt (nicht die Stationsangabe).
    const stFused = { ...st, elev: terrain.elevationM };
    for (const run of runs) { runsSeen.add(run.issueMs); await scoreRun(stFused, run, runs, poi, dem, terrain); }
    usedStations.push(st.id);
    console.log(`  ${String(usedStations.length).padStart(3)}/${stations.length} ${st.id} ${st.name} · Läufe ${runs.length} · Datensätze bisher ${records.length}`);
  } catch (e) {
    console.log(`  ⚠ ${st.id} ${st.name}: ${e.message}`);
  }
});

if (!records.length) { console.log('Keine Datensätze — Abbruch.'); process.exit(1); }
const summary = summarise();

// ─── Ausgabe ───────────────────────────────────────────────────────────────
const f = (x, d = 2) => (x == null || !Number.isFinite(x) ? '   —' : x.toFixed(d).padStart(5));
console.log(`\nStationen ${usedStations.length} (ohne POI ${stationsWithoutPoi}, ohne DEM ${stationsWithoutDem}) · Läufe ${runsSeen.size} · Datensätze ${records.length}\n`);
for (const v of ['T', 'Td', 'Wind', 'Boee', 'RR']) {
  const unit = v === 'T' || v === 'Td' ? 'K' : v === 'RR' ? 'mm/h' : 'm/s';
  console.log(`${v} [${unit}]`);
  for (const [bin, row] of Object.entries(summary[v] ?? {})) {
    const ms = Object.entries(row.methods).map(([k, m]) => `${k} ${f(m.mae)}${m.bias != null ? `(${m.bias >= 0 ? '+' : ''}${m.bias.toFixed(2)})` : ''}`).join(' · ');
    console.log(`  ${bin.padEnd(8)} n=${String(row.n).padStart(4)}  MAE(Bias): ${ms}`);
    if (row.methods.fusion) {
      const fu = row.methods.fusion;
      console.log(`           Fusion CRPS ${f(fu.crps)} · CRPSS vs ${row.best} ${f(row.crpss * 100, 1)} % [${row.crpssCi ? row.crpssCi.map((x) => (x * 100).toFixed(1)).join('…') : '—'}] · MAE-Skill ${f(row.maess * 100, 1)} % · DM p=${f(row.dm.p, 3)} (n_t=${row.dm.n}) · PIT-Ränder ${f(fu.pitOuter, 2)} (Soll 0,20) · Spread/Skill ${f(fu.spreadSkill)}${v === 'RR' ? ` · MAE(Mittel) ${f(fu.maeMean)}` : ''}`);
    }
  }
}
console.log('PoP [Brier / BSS gegen Basisrate]');
for (const [bin, row] of Object.entries(summary.PoP ?? {})) {
  console.log(`  ${bin.padEnd(8)} ` + Object.entries(row.methods).map(([k, m]) => `${k} ${f(m.brier, 3)}/${f(m.bss * 100, 0)} %`).join(' · ') + ` · Basisrate ${f((row.methods.fusion ?? Object.values(row.methods)[0]).baseRate, 3)}`);
  for (const k of ['fusion', 'mosmix R101']) {
    const m = row.methods[k]; if (!m) continue;
    console.log(`           Reliability ${k}: ` + m.reliability.filter((b) => b.n).map((b) => `${b.bin}: fc ${(b.fc * 100).toFixed(0)} % → obs ${(b.obs * 100).toFixed(0)} % (n ${b.n})`).join(' · '));
  }
}

// ─── Negativkontrollen ─────────────────────────────────────────────────────
console.log('\nKontrollen');
let failed = 0;
if (controls.leak.length >= 5) {
  const honest = mean(controls.leak.map((c) => c.honest)), leaked = mean(controls.leak.map((c) => c.leaked));
  const hA = mean(controls.leak.map((c) => c.honestAlone)), lA = mean(controls.leak.map((c) => c.leakedAlone));
  const okMix = honest > 0.25 ? leaked < 0.9 * honest : true;
  const okAlone = hA > 0.25 ? lA < 0.35 * hA : lA < 0.15;
  console.log(`  ${okMix ? '✓' : '✗'} Leck-Wächter (voller Mix): h = 1 MAE ehrlich ${honest.toFixed(2)} K → mit Zukunftsmessung ${leaked.toFixed(2)} K (n ${controls.leak.length}) — ein Leck muss ≥ 10 % bringen`);
  console.log(`  ${okAlone ? '✓' : '✗'} Leck-Wächter (nur Station, echter Zeitstempel): h = 1 MAE ehrlich ${hA.toFixed(2)} K → geleakt ${lA.toFixed(2)} K — muss kollabieren`);
  if (!okMix || !okAlone) failed++;
} else console.log(`  · Leck-Wächter: zu wenige Fälle (${controls.leak.length})`);
if (controls.k1.length) {
  const byLead = {};
  for (const c of controls.k1) { (byLead[c.lead] ??= { a: [], b: [] }); byLead[c.lead].a.push(c.withTime); byLead[c.lead].b.push(c.noTime); }
  console.log('  · K-1 (informativ): MAE Fusion mit Gültigkeitszeit vs. ohne — ' + Object.entries(byLead).map(([l, x]) => `h${l}: ${mean(x.a).toFixed(2)} vs ${mean(x.b).toFixed(2)} (n ${x.a.length})`).join(' · '));
}

// ─── Scorecard ─────────────────────────────────────────────────────────────
let codeHash = 'unknown';
try { codeHash = execSync('git rev-parse --short HEAD').toString().trim(); } catch { /* ohne git */ }
const stamp = new Date(nowMs).toISOString().slice(0, 13).replace(/[-:T]/g, '') + 'Z';
const scorecard = {
  kind: 'pv-score/nachrechnen', version: 1, createdAt: new Date(nowMs).toISOString(), codeHash,
  params: { maxLead: MAX_LEAD, publishLagH: PUBLISH_LAG_H, obsLeads: OBS_LEADS, wetMm: WET_MM, demZoom: DEM_ZOOM },
  stations: usedStations, runs: [...runsSeen].sort().map((ms) => new Date(ms).toISOString()),
  records: records.length, summary, controls: { leak: controls.leak.length, k1: controls.k1.length },
  caveat: 'Schnappschuss: POI hält 24 h, alle Läufe verifizieren gegen dieselben Zielstunden; n_t (Zielstunden) ist die relevante Stichprobe.',
};
const outPath = `${OUT_DIR}/${stamp}.json`;
writeFileSync(outPath, JSON.stringify(scorecard, null, 1));
console.log(`\nScorecard: ${outPath} (Code ${codeHash})`);
process.exit(failed ? 1 : 0);
