/**
 * E0 — EFFIS/GWIS als Sekundär- und Kontextquelle (Gate GWBE1, tests.md §V-WALDBRAND-EFFIS).
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs \
 *        scripts/l0/probe-waldbrand-effis.mjs --part wfs|wms|ba|all [--json audit/l0/waldbrand-effis-<part>.json]
 *
 * Sechs Fragen, die E1–E4 entscheiden (Kickoff Jan, 2026-08-14):
 *   1  Satelliten-Parität   — welche VIIRS-Plattformen führen `ms:viirs.hs.today/.week`?
 *   2  Fenster-Parität      — wo überlappen GWIS-Fenster und FIRMS 5+2?
 *   3  Match-Toleranz       — Koordinatendelta derselben Pixel in beiden Quellen, gemessen
 *   4  Index-Layer          — rendern ecmwf.ranking/.dc/.isi/.ffmc/.anomaly für DACH? Zeitachse, Horizont, Legende
 *   5  Live-Brandflächen    — irgendein `*.ba*`-Layer mit FIREDATE aus der laufenden Saison?
 *   6  Reiche Attribute     — trägt ein LIVE-Layer ndvi/cci_class/flag_lc/mask_flag/checked?
 *
 * FIRMS-Seite: läuft über den ECHTEN Edge-Handler (`netlify/edge-functions/firms.ts`)
 * mit `FIRMS_MAP_KEY` aus `.env.local` — der Schlüssel wird nie ausgegeben.
 *
 * Netzabhängig ⇒ KEIN Gate-Verifier (D-12). Exit-Code immer 0; das Urteil steht
 * in der Ausgabe und im JSON.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname } from 'node:path';

const ORIGIN = 'https://buscosun.com';
const EFFIS = 'https://maps.effis.emergency.copernicus.eu';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PART = argVal('--part') ?? 'all';
const JSON_OUT = argVal('--json');
const TIMEOUT_MS = Number(process.env.PROBE_TIMEOUT_MS ?? 120_000);
const LONG_TIMEOUT_MS = Number(process.env.PROBE_LONG_TIMEOUT_MS ?? 240_000);

// DACH-Ausschnitt — identisch zu firmsHotspots.ts (west,south,east,north) und
// gwisHotspots.ts (WFS 1.1.0: lat,lon).
const DACH = { west: 5.5, south: 45.5, east: 17.5, north: 55.5 };
const DACH_WFS = `${DACH.south},${DACH.west},${DACH.north},${DACH.east},EPSG:4326`;

const out = { at: new Date().toISOString(), part: PART, steps: {} };
const say = (s = '') => console.log(s);
const head = (t) => { say(''); say(t); say('-'.repeat(t.length)); };

async function get(url, { timeout = TIMEOUT_MS, raw = false } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeout);
  const t0 = Date.now();
  try {
    const res = await fetch(url, { headers: { Origin: ORIGIN }, signal: ac.signal, redirect: 'follow' });
    const buf = new Uint8Array(await res.arrayBuffer());
    return {
      ok: res.ok, status: res.status, ms: Date.now() - t0, bytes: buf.byteLength,
      acao: res.headers.get('access-control-allow-origin'),
      contentType: res.headers.get('content-type'),
      body: raw ? null : new TextDecoder().decode(buf), raw: buf,
    };
  } catch (err) {
    return { ok: false, status: null, ms: Date.now() - t0, bytes: 0, error: String(err?.message ?? err) };
  } finally { clearTimeout(timer); }
}
const stamp = (r) => `HTTP ${r.status ?? 'ERR'} · ${(r.ms / 1000).toFixed(1)} s · ${r.bytes} B`
  + (r.error ? ` · ${r.error}` : '');
const meta = (r) => ({ status: r.status ?? null, ms: r.ms, bytes: r.bytes, acao: r.acao ?? null,
  contentType: r.contentType ?? null, error: r.error ?? null });

const wfsUrl = (svc, typename, extra = '') =>
  `${EFFIS}/${svc}?service=WFS&request=GetFeature&version=1.1.0&typename=${typename}`
  + `&outputformat=geojson${extra}`;

function metersBetween(lat1, lon1, lat2, lon2) {
  const R = 6371008.8, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
const acqAtMs = (s) => (typeof s === 'string' ? Date.parse(`${s.trim().replace(' ', 'T')}Z`) : NaN);
const iso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString().replace('.000Z', 'Z') : '—');
const quant = (arr, q) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

// ===========================================================================
// FIRMS-Seite über den echten Edge-Handler (Schlüssel aus .env.local)
// ===========================================================================
function loadEnvLocal() {
  try {
    // Regex enthält ein wörtliches U+FEFF — die Datei kam mit BOM (F1-Lehre).
    const txt = readFileSync('.env.local', 'utf8').replace(/^﻿/, '');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* keine .env.local — FIRMS-Seite bleibt leer */ }
}

async function fetchFirmsRows() {
  loadEnvLocal();
  const { default: handler } = await import('../../netlify/edge-functions/firms.ts');
  const { parseFirmsCsv, windowPlan, firmsUrl, FIRMS_SOURCES } = await import('../../src/fire/sources/firmsHotspots.ts');
  const now = Date.now();
  const rows = [];
  const calls = [];
  for (const src of FIRMS_SOURCES) {
    for (const chunk of windowPlan(168, now)) {
      const path = firmsUrl(src, chunk);
      const t0 = Date.now();
      const res = await handler(new Request(`http://localhost${path}`));
      const text = await res.text();
      const call = { path, status: res.status, ms: Date.now() - t0, bytes: text.length };
      if (res.ok) {
        const parsed = parseFirmsCsv(text, src);
        call.rows = parsed.rows.length;
        call.skipped = parsed.skipped;
        rows.push(...parsed.rows);
      } else call.body = text.slice(0, 120);
      calls.push(call);
    }
  }
  return { rows, calls };
}

// ===========================================================================
// TEIL wfs — Fragen 1, 2, 3, 6 (Hotspots)
// ===========================================================================
async function partWfs() {
  head('E0-1/2/3  GWIS-Hotspots: Satelliten-Parität, Fenster, Match-Toleranz');
  const nowMs = Date.now();
  say(`Jetzt (UTC): ${iso(nowMs)}`);

  // -- (a) Kandidaten-Typenamen je Plattform ---------------------------------
  const candidates = [
    'ms:viirs.hs.today', 'ms:viirs.hs.week',
    'ms:viirs.suomi.hs.today', 'ms:viirs.n20.hs.today', 'ms:viirs.n21.hs.today',
    'ms:viirs.hs.suomi.today', 'ms:viirs.hs.n20.today', 'ms:viirs.hs.n21.today',
    'ms:viirs.suomi.hs.week', 'ms:viirs.n20.hs.week', 'ms:viirs.n21.hs.week',
    'ms:modis.hs.today', 'ms:all.hs.today', 'ms:s3.hs.today',
  ];
  const gwis = {};
  for (const tn of candidates) {
    // maxfeatures HOCH: der erste Lauf mit 5000 schnitt .week ab (7352 Features)
    // und täuschte eine 20–40-%-Lücke vor, die es nicht gibt (Lehre E0-1b).
    const r = await get(wfsUrl('gwis', tn, `&maxfeatures=20000&bbox=${DACH_WFS}`));
    const step = { typename: tn, ...meta(r) };
    if (r.ok) {
      try {
        const fc = JSON.parse(r.body);
        const feats = Array.isArray(fc.features) ? fc.features : [];
        step.count = feats.length;
        step.properties = Object.keys(feats[0]?.properties ?? {});
        const t = feats.map((f) => acqAtMs(f.properties?.acq_at)).filter(Number.isFinite);
        step.acqMin = iso(Math.min(...t)); step.acqMax = iso(Math.max(...t));
        step.features = feats.map((f) => ({
          id: f.properties?.id ?? f.id ?? null,
          lon: f.geometry?.coordinates?.[0], lat: f.geometry?.coordinates?.[1],
          ms: acqAtMs(f.properties?.acq_at), cls: f.properties?.CLASS ?? null,
        }));
        say(`${tn.padEnd(28)} ${stamp(r)} · ${feats.length} Features · ${step.acqMin} … ${step.acqMax}`
          + ` · props ${step.properties.join(',')}`);
      } catch (e) { step.parseError = String(e?.message ?? e); say(`${tn.padEnd(28)} ${stamp(r)} · ⚠ kein GeoJSON: ${(r.body ?? '').slice(0, 100)}`); }
    } else say(`${tn.padEnd(28)} ${stamp(r)}${r.body ? ` · ${r.body.slice(0, 100).replace(/\s+/g, ' ')}` : ''}`);
    gwis[tn] = step;
  }
  out.steps.gwisLayers = Object.fromEntries(Object.entries(gwis).map(([k, v]) => [k, { ...v, features: undefined, featureSample: v.features?.slice(0, 3) }]));

  // -- (b) Plattform-Zerlegung: ist viirs.hs.today == suomi ∪ n20 ∪ n21? -------
  const pick = (a, b) => gwis[a]?.count != null ? a : gwis[b]?.count != null ? b : null;
  const platTn = {
    suomi: pick('ms:viirs.suomi.hs.today', 'ms:viirs.hs.suomi.today'),
    n20: pick('ms:viirs.n20.hs.today', 'ms:viirs.hs.n20.today'),
    n21: pick('ms:viirs.n21.hs.today', 'ms:viirs.hs.n21.today'),
  };
  const all = gwis['ms:viirs.hs.today'];
  const decomposition = { platformTypenames: platTn };
  if (all?.features) {
    const key = (f) => `${f.lat.toFixed(5)},${f.lon.toFixed(5)},${f.ms}`;
    const allKeys = new Set(all.features.map(key));
    for (const [p, tn] of Object.entries(platTn)) {
      if (!tn) { decomposition[p] = { typename: null }; continue; }
      const feats = gwis[tn].features ?? [];
      const inAll = feats.filter((f) => allKeys.has(key(f))).length;
      decomposition[p] = { typename: tn, count: feats.length, containedInViirsHs: inAll };
    }
    const sum = Object.values(platTn).filter(Boolean).reduce((s, tn) => s + (gwis[tn].count ?? 0), 0);
    decomposition.sumOfPlatforms = sum;
    decomposition.viirsHsCount = all.count;
    say('');
    say(`Zerlegung ms:viirs.hs.today (${all.count}) vs. Plattformlayer: `
      + Object.entries(decomposition).filter(([k]) => ['suomi', 'n20', 'n21'].includes(k))
        .map(([k, v]) => `${k}=${v.count ?? '—'}${v.containedInViirsHs != null ? ` (davon in viirs.hs: ${v.containedInViirsHs})` : ''}`).join(' · ')
      + ` · Summe ${sum}`);
  }
  out.steps.decomposition = decomposition;

  // -- (c) FIRMS-Seite ---------------------------------------------------------
  head('FIRMS-Seite (5+2 über den Edge-Handler, DACH)');
  const firms = await fetchFirmsRows();
  for (const c of firms.calls) say(`${c.path.padEnd(52)} HTTP ${c.status} · ${c.ms} ms · ${c.rows ?? '—'} Zeilen${c.body ? ` · ${c.body}` : ''}`);
  const bySat = {};
  for (const r of firms.rows) (bySat[r.satellite] ??= []).push(r);
  const firmsT = firms.rows.map((r) => r.acqMs);
  say(`FIRMS gesamt ${firms.rows.length} · je Satellit ${Object.entries(bySat).map(([k, v]) => `${k}=${v.length}`).join(' ')}`
    + ` · ${iso(Math.min(...firmsT))} … ${iso(Math.max(...firmsT))}`);
  out.steps.firms = { calls: firms.calls, total: firms.rows.length,
    bySatellite: Object.fromEntries(Object.entries(bySat).map(([k, v]) => [k, v.length])),
    acqMin: iso(Math.min(...firmsT)), acqMax: iso(Math.max(...firmsT)) };

  // -- (d) Match: FIRMS → GWIS je Satellit (today und week) --------------------
  head('E0-3  Match FIRMS → GWIS (Zeit ±2 min, nächster Nachbar)');
  const matchReport = {};
  for (const tn of ['ms:viirs.hs.today', 'ms:viirs.hs.week']) {
    const g = gwis[tn]?.features ?? [];
    if (!g.length) { say(`${tn}: keine GWIS-Features`); continue; }
    const gMin = Math.min(...g.map((f) => f.ms)), gMax = Math.max(...g.map((f) => f.ms));
    // Zeit-Index: Minute → Features
    const byMin = new Map();
    for (const f of g) { const k = Math.round(f.ms / 60000); (byMin.get(k) ?? byMin.set(k, []).get(k)).push(f); }
    const rep = { gwisWindow: [iso(gMin), iso(gMax)], gwisCount: g.length, perSatellite: {}, deltas: [] };
    const gwisMatched = new Set();
    for (const [sat, rows] of Object.entries(bySat)) {
      const inWin = rows.filter((r) => r.acqMs >= gMin - 120000 && r.acqMs <= gMax + 120000);
      let matched = 0, exactMin = 0; const dists = [], dts = [];
      for (const r of inWin) {
        const k0 = Math.round(r.acqMs / 60000);
        let best = null;
        for (let dk = -2; dk <= 2; dk++) {
          for (const f of byMin.get(k0 + dk) ?? []) {
            const d = metersBetween(r.lat, r.lon, f.lat, f.lon);
            if (d < 1500 && (!best || d < best.d)) best = { d, f, dt: Math.abs(f.ms - r.acqMs) };
          }
        }
        if (best) { matched++; dists.push(best.d); dts.push(best.dt); if (best.dt === 0) exactMin++; gwisMatched.add(best.f); }
      }
      rep.perSatellite[sat] = { firmsInWindow: inWin.length, matched, matchRate: inWin.length ? +(matched / inWin.length).toFixed(3) : null,
        sameMinute: exactMin, distP50: quant(dists, 0.5)?.toFixed(0), distP90: quant(dists, 0.9)?.toFixed(0), distP99: quant(dists, 0.99)?.toFixed(0), distMax: dists.length ? Math.max(...dists).toFixed(0) : null,
        dtP90s: dts.length ? (quant(dts, 0.9) / 1000).toFixed(0) : null, dtMaxS: dts.length ? (Math.max(...dts) / 1000).toFixed(0) : null };
      rep.deltas.push(...dists);
      say(`${tn} · ${sat.padEnd(4)} FIRMS im Fenster ${String(inWin.length).padStart(5)} · Treffer ${String(matched).padStart(5)}`
        + ` (${rep.perSatellite[sat].matchRate ?? '—'}) · gleiche Minute ${exactMin}`
        + ` · Distanz p50/p90/p99/max ${rep.perSatellite[sat].distP50}/${rep.perSatellite[sat].distP90}/${rep.perSatellite[sat].distP99}/${rep.perSatellite[sat].distMax} m`
        + ` · Δt p90/max ${rep.perSatellite[sat].dtP90s}/${rep.perSatellite[sat].dtMaxS} s`);
    }
    // Rückrichtung: GWIS-Features ohne FIRMS-Partner (im FIRMS-Fenster) — Artefakte?
    const fMin = Math.min(...firmsT), fMax = Math.max(...firmsT);
    const gInFirms = g.filter((f) => f.ms >= fMin && f.ms <= fMax);
    rep.gwisInFirmsWindow = gInFirms.length;
    rep.gwisUnmatched = gInFirms.filter((f) => !gwisMatched.has(f)).length;
    rep.gwisUnmatchedSample = gInFirms.filter((f) => !gwisMatched.has(f)).slice(0, 5)
      .map((f) => ({ id: f.id, lat: f.lat, lon: f.lon, at: iso(f.ms), cls: f.cls }));
    say(`${tn} · GWIS-Features im FIRMS-Fenster ${gInFirms.length} · ohne FIRMS-Partner ${rep.gwisUnmatched}`);
    // Zeitliche Kanten: Stunden-Histogramm beider Seiten im GWIS-Fenster
    const hist = {};
    for (const f of g) { const h = iso(f.ms).slice(0, 13); hist[h] = hist[h] ?? { gwis: 0, firms: 0 }; hist[h].gwis++; }
    for (const r of firms.rows) { if (r.acqMs < gMin - 3.6e6 || r.acqMs > gMax + 3.6e6) continue; const h = iso(r.acqMs).slice(0, 13); hist[h] = hist[h] ?? { gwis: 0, firms: 0 }; hist[h].firms++; }
    rep.hourly = Object.fromEntries(Object.entries(hist).sort());
    rep.deltaP50 = quant(rep.deltas, 0.5); rep.deltaP90 = quant(rep.deltas, 0.9); rep.deltaP99 = quant(rep.deltas, 0.99);
    delete rep.deltas;
    matchReport[tn] = rep;
  }
  out.steps.match = matchReport;

  // -- (e) Fenster-Kanten: was heißt „today"? ---------------------------------
  const t = gwis['ms:viirs.hs.today'];
  if (t?.acqMin) {
    say('');
    say(`„today": ${t.acqMin} … ${t.acqMax} — Abstand zum Jetzt: ${((nowMs - Date.parse(t.acqMax)) / 3.6e6).toFixed(1)} h; Länge ${((Date.parse(t.acqMax) - Date.parse(t.acqMin)) / 3.6e6).toFixed(1)} h`);
    const w = gwis['ms:viirs.hs.week'];
    say(`„week":  ${w.acqMin} … ${w.acqMax} — Länge ${((Date.parse(w.acqMax) - Date.parse(w.acqMin)) / 3.6e6).toFixed(1)} h · Enthält „today"-Zeitraum: ${Date.parse(w.acqMax) >= Date.parse(t.acqMin) ? 'JA' : 'NEIN'}`);
  }

  // -- (f) Reiche Attribute an LIVE-Hotspot-Layern? ---------------------------
  head('E0-6  Reiche Attribute (ndvi, cci_class, flag_lc, mask_flag, checked) an Live-Layern');
  const rich = ['ndvi', 'cci_class', 'flag_lc', 'mask_flag', 'checked', 'frp', 'confidence', 'satellite'];
  const richReport = {};
  for (const [tn, s] of Object.entries(gwis)) {
    if (!s.properties) continue;
    richReport[tn] = Object.fromEntries(rich.map((k) => [k, s.properties.includes(k)]));
  }
  // zusätzlich: die .query-Varianten und ein Zeitfilter auf ms:viirs.hs (langsam) — nur Kopf mit maxfeatures=3
  for (const tn of ['ms:viirs.hs.today.query', 'ms:viirs.hs.week.query']) {
    const r = await get(wfsUrl('gwis', tn, `&maxfeatures=3&bbox=${DACH_WFS}`), { timeout: 60_000 });
    let props = null;
    try { props = Object.keys(JSON.parse(r.body).features?.[0]?.properties ?? {}); } catch { /* */ }
    richReport[tn] = { status: r.status, error: r.error ?? null, properties: props };
    say(`${tn.padEnd(28)} ${stamp(r)} · props ${props?.join(',') ?? '—'}`);
  }
  for (const [tn, v] of Object.entries(richReport)) if (v.ndvi !== undefined) say(`${tn.padEnd(28)} ${Object.entries(v).map(([k, b]) => `${k}:${b ? 'JA' : 'nein'}`).join(' ')}`);
  out.steps.richAttributes = richReport;
}

// ===========================================================================
// TEIL wfs2 — Nachfragen aus dem ersten Lauf: Deckel, CLASS-Suffix, die 0,5 %
// ===========================================================================
async function partWfs2() {
  head('E0-1b  Deckel des .week-Layers, CLASS-Suffix ↔ Plattform, die nicht übernommenen 0,5 %');
  const rep = {};
  // (a) Wie viele Features gibt .week wirklich her? maxfeatures hoch, resulttype=hits (WFS 2.0)
  for (const [label, url] of [
    ['week maxfeatures=20000', wfsUrl('gwis', 'ms:viirs.hs.week', `&maxfeatures=20000&bbox=${DACH_WFS}`)],
    ['week ohne maxfeatures', wfsUrl('gwis', 'ms:viirs.hs.week', `&bbox=${DACH_WFS}`)],
    ['week hits (WFS 2.0)', `${EFFIS}/gwis?service=WFS&request=GetFeature&version=2.0.0&typenames=ms:viirs.hs.week&resulttype=hits&bbox=${DACH_WFS}`],
    ['week Nordhälfte (lat 50.5–55.5)', wfsUrl('gwis', 'ms:viirs.hs.week', `&maxfeatures=20000&bbox=50.5,5.5,55.5,17.5,EPSG:4326`)],
    ['week Südhälfte (lat 45.5–50.5)', wfsUrl('gwis', 'ms:viirs.hs.week', `&maxfeatures=20000&bbox=45.5,5.5,50.5,17.5,EPSG:4326`)],
    ['today maxfeatures=20000', wfsUrl('gwis', 'ms:viirs.hs.today', `&maxfeatures=20000&bbox=${DACH_WFS}`)],
  ]) {
    const r = await get(url);
    let n = null, hits = null, cls = {}, hours = {};
    try {
      if (/resulttype=hits/.test(url)) hits = r.body.match(/numberMatched="(\d+)"|numberOfFeatures="(\d+)"/)?.slice(1).find(Boolean) ?? r.body.slice(0, 200);
      else {
        const fc = JSON.parse(r.body); n = fc.features?.length;
        for (const f of fc.features ?? []) { const c = f.properties?.CLASS ?? '?'; cls[c] = (cls[c] ?? 0) + 1; const h = iso(acqAtMs(f.properties?.acq_at)).slice(0, 13); hours[h] = (hours[h] ?? 0) + 1; }
      }
    } catch { /* */ }
    rep[label] = { ...meta(r), count: n, hits, classes: cls, hours };
    say(`${label.padEnd(34)} ${stamp(r)} · ${n ?? hits ?? '—'} Features · CLASS ${JSON.stringify(cls)}`);
  }
  // (b) CLASS-Suffix je Plattform-Layer über ALLE Features
  say('');
  for (const tn of ['ms:viirs.hs.suomi.today', 'ms:viirs.hs.n20.today', 'ms:viirs.hs.n21.today', 'ms:viirs.hs.today', 'ms:viirs.hs.week']) {
    const r = await get(wfsUrl('gwis', tn, `&maxfeatures=20000&bbox=${DACH_WFS}`));
    const cls = {};
    try { for (const f of JSON.parse(r.body).features ?? []) { const c = f.properties?.CLASS ?? '?'; cls[c] = (cls[c] ?? 0) + 1; } } catch { /* */ }
    rep[`classes:${tn}`] = cls;
    say(`CLASS in ${tn.padEnd(26)} ${JSON.stringify(cls)}`);
  }
  // (c) Die FIRMS-Detektionen OHNE GWIS-Partner im .today-Fenster: wer sind sie?
  say('');
  const firms = await fetchFirmsRows();
  const rT = await get(wfsUrl('gwis', 'ms:viirs.hs.today', `&maxfeatures=20000&bbox=${DACH_WFS}`));
  const g = (JSON.parse(rT.body).features ?? []).map((f) => ({ lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], ms: acqAtMs(f.properties?.acq_at), cls: f.properties?.CLASS }));
  const gMin = Math.min(...g.map((f) => f.ms)), gMax = Math.max(...g.map((f) => f.ms));
  const byMin = new Map();
  for (const f of g) { const k = Math.round(f.ms / 60000); (byMin.get(k) ?? byMin.set(k, []).get(k)).push(f); }
  const unmatched = [];
  let inWin = 0;
  for (const r of firms.rows) {
    if (r.acqMs < gMin || r.acqMs > gMax) continue;
    inWin++;
    const k0 = Math.round(r.acqMs / 60000);
    let best = Infinity;
    for (let dk = -2; dk <= 2; dk++) for (const f of byMin.get(k0 + dk) ?? []) best = Math.min(best, metersBetween(r.lat, r.lon, f.lat, f.lon));
    if (best > 700) unmatched.push({ lat: r.lat, lon: r.lon, at: iso(r.acqMs), sat: r.satellite, frp: r.frp, conf: r.confidence, day: r.day, ti4: r.brightTi4, nearestGwisM: Number.isFinite(best) ? Math.round(best) : null });
  }
  rep.unmatchedToday = { firmsInWindow: inWin, unmatched: unmatched.length, list: unmatched };
  say(`FIRMS im .today-Fenster ${inWin} · ohne GWIS-Partner (>700 m) ${unmatched.length}:`);
  for (const u of unmatched) say(`  ${u.at} ${u.sat.padEnd(3)} ${u.lat.toFixed(4)},${u.lon.toFixed(4)} frp=${u.frp} conf=${u.conf} ${u.day ? 'Tag' : 'Nacht'} ti4=${u.ti4} nächster GWIS ${u.nearestGwisM ?? '—'} m`);
  // (d) Bekannte Dauerquellen: sind sie in GWIS? (Duisburg ThyssenKrupp, Linz voestalpine, Eisenhüttenstadt, Salzgitter, Dillingen)
  say('');
  const sites = { 'Duisburg (ThyssenKrupp)': [51.487, 6.735], 'Linz (voestalpine)': [48.283, 14.33], 'Salzgitter': [52.155, 10.41], 'Dillingen (Saar)': [49.35, 6.73], 'Eisenhüttenstadt': [52.16, 14.63], 'Bremen (Stahlwerk)': [53.13, 8.68] };
  rep.staticSites = {};
  for (const [name, [lat, lon]] of Object.entries(sites)) {
    const gw = g.filter((f) => metersBetween(lat, lon, f.lat, f.lon) < 2500).length;
    const fi = firms.rows.filter((r) => r.acqMs >= gMin && r.acqMs <= gMax && metersBetween(lat, lon, r.lat, r.lon) < 2500).length;
    rep.staticSites[name] = { gwisToday: gw, firmsInWindow: fi };
    say(`${name.padEnd(26)} GWIS today ${String(gw).padStart(3)} · FIRMS im selben Fenster ${String(fi).padStart(3)}`);
  }
  out.steps.wfs2 = rep;
}

// ===========================================================================
// Minimaler PNG-Decoder (8 bit, Farbtypen 0/2/3/4/6) — zählt sichtbare Pixel
// ===========================================================================
function readU32(b, o) { return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0; }
function pngStats(buf) {
  if (!(buf?.length > 24 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)) return { isPng: false };
  const w = readU32(buf, 16), h = readU32(buf, 20), depth = buf[24], ctype = buf[25];
  const idat = []; let pal = null, trns = null; let o = 8;
  while (o < buf.length) {
    const len = readU32(buf, o); const type = String.fromCharCode(...buf.subarray(o + 4, o + 8));
    const data = buf.subarray(o + 8, o + 8 + len);
    if (type === 'IDAT') idat.push(data); else if (type === 'PLTE') pal = data; else if (type === 'tRNS') trns = data;
    o += 12 + len; if (type === 'IEND') break;
  }
  if (depth !== 8) return { isPng: true, width: w, height: h, colorType: ctype, depth, note: 'Bittiefe ≠ 8 — nicht dekodiert' };
  const bpp = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ctype];
  const raw = inflateSync(Buffer.concat(idat.map((d) => Buffer.from(d))));
  const stride = w * bpp; const px = new Uint8Array(w * h * bpp);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)]; const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (ft === 1) v += a; else if (ft === 2) v += b; else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[i] = v & 255;
    }
    px.set(cur, y * stride); prev = cur;
  }
  let visible = 0; const colors = new Map();
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    if (ctype === 6) { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; a = px[i * 4 + 3]; }
    else if (ctype === 2) { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else if (ctype === 3) { const idx = px[i]; r = pal[idx * 3]; g = pal[idx * 3 + 1]; b = pal[idx * 3 + 2]; a = trns && idx < trns.length ? trns[idx] : 255; }
    else if (ctype === 4) { r = g = b = px[i * 2]; a = px[i * 2 + 1]; }
    else { r = g = b = px[i]; }
    if (a === 0) continue;
    visible++;
    const key = `${r},${g},${b}`; colors.set(key, (colors.get(key) ?? 0) + 1);
  }
  const top = [...colors.entries()].sort((x, y) => y[1] - x[1]).slice(0, 8);
  return { isPng: true, width: w, height: h, colorType: ctype, visible, visibleShare: +(visible / (w * h)).toFixed(3), distinctColors: colors.size, topColors: top };
}

// ===========================================================================
// TEIL wms — Frage 4 (Index-Layer), plus E4 (GetFeatureInfo fuel_map)
// ===========================================================================
function mercBbox(d) {
  const m = (lon, lat) => [Math.round((6378137 * lon * Math.PI) / 180), Math.round(6378137 * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)))];
  return [...m(d.west, d.south), ...m(d.east, d.north)].join(',');
}
const isoDay = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

async function partWms() {
  head('E0-4  WMS-Capabilities gwis + effis (Layerliste, TIME, Legenden, queryable)');
  const capsReport = {};
  for (const svc of ['gwis', 'effis']) {
    const r = await get(`${EFFIS}/${svc}?service=WMS&request=GetCapabilities&version=1.3.0`, { timeout: LONG_TIMEOUT_MS });
    say(`${svc} GetCapabilities: ${stamp(r)}`);
    const step = { ...meta(r), layers: {} };
    if (r.ok) {
      // Layer-Blöcke grob zerlegen: <Layer ...> ... </Layer> (verschachtelt — wir nehmen die innersten mit <Name>)
      const blocks = r.body.split(/<Layer\b/).slice(1);
      for (const b of blocks) {
        const name = b.match(/<Name>([^<]+)<\/Name>/)?.[1];
        if (!name) continue;
        const queryable = /^[^>]*queryable="1"/.test(b);
        const title = b.match(/<Title>([^<]*)<\/Title>/)?.[1] ?? null;
        const abstract = b.match(/<Abstract>([\s\S]*?)<\/Abstract>/)?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
        const dim = b.match(/<Dimension name="time"[^>]*>([^<]*)</i);
        const dimDefault = b.match(/<Dimension name="time"[^>]*default="([^"]*)"/i)?.[1] ?? null;
        const legend = b.match(/<LegendURL[\s\S]*?xlink:href="([^"]+)"/)?.[1]?.replace(/&amp;/g, '&') ?? null;
        step.layers[name] = { title, abstract: abstract?.slice(0, 400) ?? null, queryable, time: dim?.[1]?.trim() ?? null, timeDefault: dimDefault, legend };
      }
      const names = Object.keys(step.layers);
      step.layerCount = names.length;
      step.baLayers = names.filter((n) => /\bba\b|\.ba\.|\.ba$|burnt|burned|nrt\.ba/i.test(n));
      step.hsLayers = names.filter((n) => /\.hs\b|\.hs\./.test(n));
      step.indexLayers = names.filter((n) => /^(ecmwf|mf025|mf010|nasa_geos5)\./.test(n));
      say(`  Layer: ${names.length} · Index-Layer: ${step.indexLayers.length} · Hotspot-Layer: ${step.hsLayers.length} · Brandflächen-Kandidaten: ${step.baLayers.join(', ') || '—'}`);
      say(`  Hotspot-Layer: ${step.hsLayers.join(', ')}`);
      say(`  fuel_map queryable: ${step.layers.fuel_map?.queryable ?? '(kein Layer fuel_map)'}`);
      for (const n of ['ecmwf.fwi', 'ecmwf.ranking', 'ecmwf.dc', 'ecmwf.isi', 'ecmwf.ffmc', 'ecmwf.anomaly', 'ecmwf.anomaly_sigm', 'ecmwf.anomaly_day', 'mf025.fwi', 'nasa_geos5.fwi', 'mf010.fwi', 'mf010.ranking']) {
        const l = step.layers[n];
        if (l) say(`  ${n.padEnd(20)} title="${l.title}" time=${l.time} default=${l.timeDefault} queryable=${l.queryable} legend=${l.legend ? 'ja' : 'nein'}\n${' '.repeat(22)}abstract: ${l.abstract ?? '—'}`);
      }
    }
    capsReport[svc] = step;
  }
  out.steps.capabilities = capsReport;

  // -- Rendering-Probe je Index-Layer, TIME=heute, DACH 512×512 -----------------
  head('E0-4  GetMap je Index-Layer (DACH, EPSG:3857, TIME=heute) + Legenden + Horizont');
  const layers = ['ecmwf.fwi', 'ecmwf.ranking', 'ecmwf.dc', 'ecmwf.isi', 'ecmwf.ffmc', 'ecmwf.anomaly', 'ecmwf.anomaly_sigm', 'ecmwf.anomaly_day', 'mf025.fwi', 'nasa_geos5.fwi', 'ecmwf.dmc', 'ecmwf.bui'];
  const bbox = mercBbox(DACH);
  const getMap = (layer, day, size = 512) =>
    `${EFFIS}/gwis?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=${layer}&STYLES=&CRS=EPSG:3857&BBOX=${bbox}`
    + `&WIDTH=${size}&HEIGHT=${size}&FORMAT=image/png&TRANSPARENT=TRUE&TIME=${day}`;
  const render = {};
  mkdirSync('audit/l0/effis', { recursive: true });
  for (const layer of layers) {
    const r = await get(getMap(layer, isoDay(0)), { raw: true });
    const st = r.ok ? pngStats(r.raw) : { isPng: false };
    render[layer] = { today: { ...meta(r), ...st } };
    if (r.ok && st.isPng) writeFileSync(`audit/l0/effis/getmap-${layer}-${isoDay(0)}.png`, r.raw);
    say(`${layer.padEnd(20)} ${stamp(r)} · PNG ${st.isPng ? `${st.width}×${st.height} ct${st.colorType} · sichtbar ${st.visible} px (${(st.visibleShare * 100).toFixed(0)} %) · ${st.distinctColors} Farben` : 'NEIN'}`);
    if (!st.isPng && r.raw) say(`   ⚠ ${new TextDecoder().decode(r.raw).slice(0, 200).replace(/\s+/g, ' ')}`);
  }
  // Legenden
  for (const layer of layers) {
    const cap = capsReport.gwis?.layers?.[layer];
    const url = cap?.legend ?? `${EFFIS}/gwis?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetLegendGraphic&LAYER=${layer}&FORMAT=image/png&SLD_VERSION=1.1.0`;
    const r = await get(url, { raw: true });
    const st = r.ok ? pngStats(r.raw) : { isPng: false };
    render[layer].legend = { url, ...meta(r), width: st.width, height: st.height };
    if (r.ok && st.isPng) writeFileSync(`audit/l0/effis/legend-${layer}.png`, r.raw);
    say(`Legende ${layer.padEnd(20)} ${stamp(r)} · ${st.isPng ? `${st.width}×${st.height}` : (r.raw ? new TextDecoder().decode(r.raw).slice(0, 120).replace(/\s+/g, ' ') : '')}`);
  }
  // Horizont: −2 … +10 Tage, sichtbare Pixel je Tag (kleine Kacheln 128×128)
  say('');
  say('Horizont (sichtbare Pixel je TIME, 128×128):');
  const horizonLayers = ['ecmwf.fwi', 'ecmwf.ranking', 'ecmwf.dc', 'ecmwf.isi', 'ecmwf.ffmc', 'ecmwf.anomaly', 'mf025.fwi', 'nasa_geos5.fwi'];
  for (const layer of horizonLayers) {
    const row = {};
    for (let d = -2; d <= 10; d++) {
      const r = await get(getMap(layer, isoDay(d), 128), { raw: true });
      const st = r.ok ? pngStats(r.raw) : { isPng: false };
      row[isoDay(d)] = st.isPng ? st.visible : `HTTP ${r.status}`;
    }
    render[layer].horizon = row;
    say(`  ${layer.padEnd(16)} ${Object.entries(row).map(([d, v]) => `${d.slice(5)}:${v}`).join(' ')}`);
  }
  // GetFeatureInfo — Wert am Punkt (Mitte DACH ≈ 11.5E 50.5N)
  say('');
  say('GetFeatureInfo (Punkt 11.5E/50.5N, TIME=heute):');
  const gfi = {};
  for (const layer of ['ecmwf.fwi', 'ecmwf.ranking', 'ecmwf.dc', 'ecmwf.isi', 'ecmwf.ffmc', 'ecmwf.anomaly', 'fuel_map']) {
    gfi[layer] = {};
    for (const fmt of ['text/plain', 'application/json', 'text/html', 'application/vnd.ogc.gml']) {
      const url = `${EFFIS}/gwis?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=${layer}&QUERY_LAYERS=${layer}&STYLES=&CRS=EPSG:3857&BBOX=${bbox}`
        + `&WIDTH=512&HEIGHT=512&I=256&J=256&INFO_FORMAT=${encodeURIComponent(fmt)}&TIME=${isoDay(0)}`;
      const r = await get(url);
      gfi[layer][fmt] = { ...meta(r), body: (r.body ?? '').slice(0, 300).replace(/\s+/g, ' ') };
      say(`  ${layer.padEnd(14)} ${fmt.padEnd(24)} ${stamp(r)} · ${gfi[layer][fmt].body.slice(0, 160)}`);
    }
  }
  out.steps.render = render;
  out.steps.getFeatureInfo = gfi;
}

// ===========================================================================
// TEIL ba — Frage 5 (Live-Brandflächen) + Attributliste modis.ba.poly
// ===========================================================================
async function partBa() {
  head('E0-5  Brandflächen-Jagd (lange Timeouts) auf /effis und /gwis');
  const typenames = ['ms:modis.ba', 'ms:modis.ba.poly', 'ms:modis.ba.today', 'ms:modis.ba.week', 'ms:modis.ba.month', 'ms:modis.ba.season',
    'ms:effis.nrt.ba', 'ms:nrt.ba', 'ms:modis.ba.poly.today', 'ms:modis.ba.poly.week', 'ms:modis.ba.poly.season', 'ms:effis.ba', 'ms:ba.poly', 'ms:viirs.ba', 'ms:s2.ba', 'ms:sentinel2.ba'];
  const hunt = {};
  const seasonYear = new Date().getUTCFullYear();
  for (const svc of ['effis', 'gwis']) {
    for (const tn of typenames) {
      const key = `${svc}:${tn}`;
      // Erst europaweit ohne BBox mit kleinem Deckel — Statusfrage; sortby DESC per WFS 2.0 versuchen wir zusätzlich.
      const r = await get(wfsUrl(svc, tn, '&maxfeatures=5'), { timeout: LONG_TIMEOUT_MS });
      const step = { ...meta(r) };
      let feats = [];
      if (r.ok) {
        try { const fc = JSON.parse(r.body); feats = Array.isArray(fc.features) ? fc.features : []; step.count = feats.length; step.properties = Object.keys(feats[0]?.properties ?? {}); }
        catch { step.parseError = (r.body ?? '').slice(0, 160).replace(/\s+/g, ' '); }
      } else step.bodyHead = (r.body ?? '').slice(0, 160).replace(/\s+/g, ' ');
      const dates = feats.map((f) => String(f.properties?.FIREDATE ?? f.properties?.firedate ?? f.properties?.LASTUPDATE ?? '').slice(0, 10)).filter(Boolean).sort();
      step.firedateSample = dates.length ? [dates[0], dates[dates.length - 1]] : null;
      say(`${key.padEnd(34)} ${stamp(r)}${step.count != null ? ` · ${step.count} Feat. · FIREDATE ${step.firedateSample?.join('…') ?? '—'}` : ''}${step.parseError ? ` · ⚠ ${step.parseError.slice(0, 80)}` : ''}${step.bodyHead ? ` · ${step.bodyHead.slice(0, 80)}` : ''}`);
      // Wenn es den Layer gibt: WFS 2.0 sortby FIREDATE DESC — jüngstes Datum
      if (r.ok && step.count > 0) {
        const u2 = `${EFFIS}/${svc}?service=WFS&request=GetFeature&version=2.0.0&typenames=${tn}&outputformat=geojson&count=5&sortby=FIREDATE%20DESC`;
        const r2 = await get(u2, { timeout: LONG_TIMEOUT_MS });
        let newest = null; let n2 = null; let lastupd = null;
        try { const fc = JSON.parse(r2.body); n2 = fc.features?.length; const ds = (fc.features ?? []).map((f) => String(f.properties?.FIREDATE ?? '').slice(0, 10)).filter(Boolean).sort(); newest = ds[ds.length - 1] ?? null; lastupd = fc.features?.[0]?.properties?.LASTUPDATE ?? null; } catch { /* */ }
        step.sorted = { ...meta(r2), count: n2, newestFiredate: newest, lastupdate: lastupd };
        say(`   sortby FIREDATE DESC (WFS 2.0): ${stamp(r2)} · ${n2 ?? '—'} Feat. · jüngstes FIREDATE ${newest ?? '—'} · LASTUPDATE ${lastupd ?? '—'}`);
        // Und der DACH-Ausschnitt mit Attributliste (für E2)
        const r3 = await get(wfsUrl(svc, tn, `&maxfeatures=800&bbox=${DACH_WFS}`), { timeout: LONG_TIMEOUT_MS });
        try {
          const fc = JSON.parse(r3.body); const fs = fc.features ?? [];
          const ds = fs.map((f) => String(f.properties?.FIREDATE ?? '').slice(0, 10)).filter(Boolean).sort();
          const props = Object.keys(fs[0]?.properties ?? {});
          const lc = ['CONIFER', 'BROADLEA', 'MIXED', 'SCLEROPH', 'AGRIAREAS', 'ARTIFSURF', 'OTHERNATLC', 'PERCNA2K', 'AREA_HA', 'FIREDATE', 'LASTUPDATE'];
          const sample = fs[0]?.properties ?? null;
          step.dach = { ...meta(r3), count: fs.length, firedate: ds.length ? [ds[0], ds[ds.length - 1]] : null, properties: props,
            landcoverFields: Object.fromEntries(lc.map((k) => [k, props.includes(k)])), sample,
            areaHa: { min: Math.min(...fs.map((f) => Number(f.properties?.AREA_HA)).filter(Number.isFinite)), max: Math.max(...fs.map((f) => Number(f.properties?.AREA_HA)).filter(Number.isFinite)) },
            byYear: Object.fromEntries(Object.entries(ds.reduce((m, d) => (m[d.slice(0, 4)] = (m[d.slice(0, 4)] ?? 0) + 1, m), {})).sort()) };
          say(`   DACH: ${stamp(r3)} · ${fs.length} Feat. · FIREDATE ${step.dach.firedate?.join('…') ?? '—'} · Jahre ${JSON.stringify(step.dach.byYear)}`);
          say(`   Attribute: ${props.join(', ')}`);
          say(`   Landbedeckungsfelder: ${Object.entries(step.dach.landcoverFields).map(([k, b]) => `${k}:${b ? 'JA' : 'nein'}`).join(' ')} · AREA_HA ${step.dach.areaHa.min}…${step.dach.areaHa.max}`);
          if (sample) say(`   Beispiel: ${JSON.stringify(sample).slice(0, 400)}`);
        } catch (e) { step.dach = { ...meta(r3), parseError: String(e?.message ?? e) }; say(`   DACH: ${stamp(r3)} · ⚠ ${(r3.body ?? '').slice(0, 100)}`); }
      }
      step.liveSeason = step.sorted?.newestFiredate?.startsWith(String(seasonYear)) ?? (step.firedateSample?.[1]?.startsWith(String(seasonYear)) ?? false);
      hunt[key] = step;
    }
  }
  out.steps.burntHunt = hunt;
  const live = Object.entries(hunt).filter(([, v]) => v.liveSeason).map(([k]) => k);
  say('');
  say(`Live (FIREDATE ${seasonYear}): ${live.length ? live.join(', ') : 'KEINER'}`);
}

// ===========================================================================
if (PART === 'wfs' || PART === 'all') await partWfs();
if (PART === 'wfs2' || PART === 'all') await partWfs2();
if (PART === 'wms' || PART === 'all') await partWms();
if (PART === 'ba' || PART === 'all') await partBa();

if (JSON_OUT) {
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, JSON.stringify(out, null, 2));
  say(`\nJSON geschrieben: ${JSON_OUT}`);
}
process.exit(0);
