#!/usr/bin/env node
// Phase AM, step 0 (audit/seewetter-ausfahrt.md): what does a leg cost and what does it get?
//  (a) buscosun Fusion at water points with the client's cube path, run in Node as `sea-derive.mjs` does
//      (`country: 'DE'`, no radar): wind and gusts at 10 points between Laboe and Marstal, count and size of the
//      files fetched for all 10, behaviour north of 55.5° N.
//  (b) `sampleField` (CWAM) and `sampleUv` (BSH current) at the same points and hours.
//  (c) which areas of `loadAreas` the leg crosses.
// Usage: node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/sea/spike/trip-measure.mjs [--json=<out>] [--skip=a]
import { writeFileSync } from 'node:fs';
import { installNodeShims } from '../../punktarchiv/lib/nodeShims.mjs';
import { decodePng, toRgba } from '../../lib/png.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const H = 3_600_000, KN = 1.943844;

// --- every request of this process, counted ------------------------------------------------------------------
const log = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const range = init?.headers ? (new Headers(init.headers)).get('range') : null;
  const t0 = Date.now();
  const e = { url, range, status: 0, bytes: 0, ms: 0, tag: 'other' };
  log.push(e);
  try {
    const res = await realFetch(input, init);
    e.status = res.status;
    const len = Number(res.headers.get('content-length'));
    const clone = res.clone();
    // The body is read by the caller; the size comes from a clone so the count is the transferred body.
    clone.arrayBuffer().then((b) => { e.bytes = b.byteLength; e.ms = Date.now() - t0; }, () => { e.bytes = Number.isFinite(len) ? len : 0; });
    return res;
  } catch (err) { e.status = -1; e.ms = Date.now() - t0; throw err; }
};
const settle = () => new Promise((r) => setTimeout(r, 400));
const kindOf = (url) => {
  const m = /buscosun-data(?:@[^/]+)?\/(?:main\/)?([a-z-]+)\/([a-z0-9-]+)?/i.exec(url);
  if (m) return `data:${m[1]}${m[2] && !/^\d/.test(m[2]) ? `/${m[2]}` : ''}`;
  try { return new URL(url).host; } catch { return 'local'; }
};

installNodeShims();
const { httpStore, memoStore } = await import('../../../src/point/client/store.ts');
const { getPointForecastFromCube, clearCubeForecastCache } = await import('../../../src/pointForecast/cubeSource.ts');
const { makeIo, geoBackend } = await import('../../road/road-forecast.mjs');
const { fusionVersionOfNotes } = await import('../../../src/pointForecast/fusion/fusionRelease.ts');
const C = await import('../../../src/sea/seaContract.ts');
const V = await import('../../../src/sea/seaView.ts');
const CUR = await import('../../../src/sea/seaCurrent.ts');
const RIP = await import('../../../src/sea/seaRipples.ts');
const P = await import('../../../src/sea/seaPlanner.ts');

const raw = async (path, kind = 'json') => {
  const r = await fetch(`${C.SEA_RAW_BASE}/${path}`, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`${r.status} ${path}`);
  return kind === 'json' ? r.json() : new Uint8Array(await r.arrayBuffer());
};

const nowMs = Date.now(), nowHour = Math.floor(nowMs / H) * H;
const cat = await raw(C.SEA_SPOT_CATALOG_PATH);
const dk = await raw(C.SEA_SPOT_CATALOG_DK_PATH).catch(() => null);
const spots = C.mergeSpotCatalogs(cat.spots, dk?.spots ?? null);
const laboe = spots.find((s) => /laboe/i.test(s.id)), marstal = spots.find((s) => /marstal/i.test(s.id));
if (!laboe || !marstal) throw new Error('Laboe oder Marstal nicht im Katalog');
// Both ends in the water: the spot's own wave cell (water by the model's mask).
const A = C.seaCellCentre('cwam', laboe.cell.i, laboe.cell.j), B = C.seaCellCentre('cwam', marstal.cell.i, marstal.cell.j);
const distKm = P.planDistKm(A, B), course = P.planBearingDeg(A, B);
const N = 10;
const leg = Array.from({ length: N }, (_, k) => {
  const p = P.planDestination(A, course, (distKm * k) / (N - 1));
  return { name: k === 0 ? 'Laboe' : k === N - 1 ? 'Marstal' : `${Math.round((distKm * k) / (N - 1) / 1.852)} sm`, lat: +p.lat.toFixed(4), lon: +p.lon.toFixed(4) };
});
// North of 55.5° N: Great Belt / Kattegat along 10.85° E and the North Sea off Jutland along 7.9° E (all water in CWAM).
const north = [[55.30, 10.85], [55.45, 10.85], [55.50, 10.85], [55.55, 10.85], [55.60, 10.85], [55.80, 10.85], [56.00, 10.85], [56.30, 11.20], [55.45, 7.90], [55.55, 7.90], [55.80, 7.90], [56.20, 7.90]]
  .map(([lat, lon]) => ({ name: `${lat.toFixed(2)}N ${lon.toFixed(2)}E`, lat, lon }));

const out = { at: new Date(nowMs).toISOString(), leg: { from: laboe.id, to: marstal.id, km: +distKm.toFixed(2), nm: +(distKm / 1.852).toFixed(2), course: +course.toFixed(1), points: leg }, a: null, b: null, c: null };

// --- (a) buscosun Fusion ------------------------------------------------------------------------------------------
if (args.skip !== 'a') {
  const io = makeIo({ store: memoStore(httpStore({})), cache: geoBackend(null), nowMs });
  const one = async (p, hours = 30) => {
    clearCubeForecastCache();
    const before = log.length, t0 = Date.now();
    let row;
    try {
      const fc = await getPointForecastFromCube({ lat: p.lat, lng: p.lon, country: 'DE', hours, pointSource: 'cube', includeRadarNowcast: false }, io);
      const steps = fc.cube?.v2?.axis?.steps ?? [];
      const at = (h) => steps.find((s) => s.validAtMs === nowHour + h * H);
      const kn = (x) => (Number.isFinite(x) ? +(x * KN).toFixed(1) : null);
      const cnt = (name) => steps.filter((s) => Number.isFinite(s.vars?.[name]?.mean)).length;
      row = {
        ...p, ok: true, steps: steps.length, wind: cnt('wind'), gust: cnt('gust'), dir: cnt('windDir'), tiers: [...new Set(steps.map((s) => s.tier))],
        stage: fusionVersionOfNotes(fc.cube.notes), hTrue: fc.cube.v2.point?.hTrue ?? null, errors: fc.cube.errors?.length ?? 0, firstError: fc.cube.errors?.[0] ?? null,
        sources: fc.sourcesAvailable,
        h: [1, 3, 6, 12, 24].map((h) => { const s = at(h); return { h, windKn: kn(s?.vars?.wind?.mean), gustKn: kn(s?.vars?.gust?.mean), dir: Number.isFinite(s?.vars?.windDir?.mean) ? Math.round(s.vars.windDir.mean) : null }; }),
      };
    } catch (e) { row = { ...p, ok: false, error: String(e?.message ?? e).split('\n')[0] }; }
    await settle();
    const mine = log.slice(before);
    row.ms = Date.now() - t0 - 400;
    row.requests = mine.length; row.bytes = mine.reduce((a, e) => a + e.bytes, 0);
    row.byKind = Object.fromEntries(Object.entries(mine.reduce((m, e) => { const k = kindOf(e.url); (m[k] ??= [0, 0]); m[k][0]++; m[k][1] += e.bytes; return m; }, {})).map(([k, [n, b]]) => [k, `${n} / ${(b / 1024).toFixed(0)} KB`]));
    row.failed = mine.filter((e) => e.status !== 200 && e.status !== 206).map((e) => `${e.status} ${e.url.slice(-70)}`).slice(0, 6);
    console.log(JSON.stringify(row));
    return row;
  };
  const start = log.length, t0 = Date.now();
  const rows = [];
  for (const p of leg) rows.push(await one(p));
  const all = log.slice(start);
  const paths = new Map();
  for (const e of all) { const k = `${e.url}${e.range ? ` [${e.range}]` : ''}`; paths.set(k, (paths.get(k) ?? 0) + 1); }
  out.a = {
    leg: rows,
    total: {
      requests: all.length, distinct: paths.size, bytes: all.reduce((a, e) => a + e.bytes, 0), ms: Date.now() - t0 - 400 * leg.length,
      first: { requests: rows[0].requests, bytes: rows[0].bytes, ms: rows[0].ms },
      rest: { requests: rows.slice(1).reduce((a, r) => a + r.requests, 0), bytes: rows.slice(1).reduce((a, r) => a + r.bytes, 0), ms: rows.slice(1).reduce((a, r) => a + r.ms, 0) },
      byKind: Object.fromEntries(Object.entries(all.reduce((m, e) => { const k = kindOf(e.url); (m[k] ??= [0, 0]); m[k][0]++; m[k][1] += e.bytes; return m; }, {})).map(([k, [n, b]]) => [k, { n, kb: +(b / 1024).toFixed(0) }])),
      largest: all.slice().sort((x, y) => y.bytes - x.bytes).slice(0, 8).map((e) => `${(e.bytes / 1024).toFixed(0)} KB ${e.url.replace(/^https?:\/\/[^/]+\//, '').slice(0, 110)}${e.range ? ` [${e.range}]` : ''}`),
    },
    north: [],
  };
  for (const p of north) out.a.north.push(await one(p));
}

// --- (b) CWAM field and BSH current at the same points and hours ----------------------------------------------------
{
  const status = await raw(C.SEA_STATUS_PATH);
  const run = status.field?.lastPublishedRun, runMs = C.seaRunMs(run);
  const cp = CUR.currentPointerOf(status);
  const curDoc = cp ? await raw(cp.path) : null;
  const hours = [1, 3, 6, 12, 24];
  const b = { run, current: cp ? { run: cp.run, uv: !!curDoc?.uv, hours: curDoc?.uv?.hours ?? null, t0: curDoc ? new Date(curDoc.t0).toISOString() : null } : null, fieldBytes: [], uvBytes: [], rows: [] };
  for (const h of hours) {
    const t = nowHour + h * H, lead = Math.round((t - runMs) / H);
    const step = C.seaFieldStepAt(lead);
    const fbytes = step == null ? null : await raw(C.seaFieldPath('cwam', run, step), 'bytes');
    const fpng = fbytes ? decodePng(Buffer.from(fbytes)) : null;
    const f = fpng ? { data: toRgba(fpng), width: fpng.width } : null;
    if (fbytes) b.fieldBytes.push(fbytes.length);
    const uh = curDoc ? CUR.currentUvHour(curDoc, t) : null;
    const ubytes = uh == null ? null : await raw(C.seaCurrentUvPath(curDoc.run, uh), 'bytes').catch(() => null);
    const g = ubytes ? CUR.decodeUvField(toRgba(decodePng(Buffer.from(ubytes)))) : null;
    if (ubytes) b.uvBytes.push(ubytes.length);
    for (const p of [...leg, ...north]) {
      const w = f ? V.sampleField(f.data, f.width, 0, p.lat, p.lon) : undefined;
      let cur = null;
      if (g) {
        const { x, y } = CUR.currentUvXY(p.lat, p.lon), flow = { u: 0, v: 0 };
        if (RIP.sampleUv(g, x, y, flow)) cur = { kn: +(Math.hypot(flow.u, flow.v) * KN).toFixed(2), to: Math.round((Math.atan2(flow.u, flow.v) * 180 / Math.PI + 360) % 360) };
      }
      b.rows.push({ h, lead, step, name: p.name, wave: w === undefined ? 'land/outside' : w, cur: g ? (cur ?? 'no water point') : uh == null ? 'outside the run' : 'unreadable' });
    }
  }
  // No current file in the store (the producer step waits for the push of buscosun-web): the two real u/v images of the
  // BSH run 2026111812 recorded in phase SR (`scripts/lib/fixtures/sea/ripples/`) are sampled instead, and named as such.
  if (!cp) {
    const { readFileSync } = await import('node:fs');
    b.currentFixture = [];
    for (const hh of [6, 9]) {
      const g = CUR.decodeUvField(toRgba(decodePng(readFileSync(new URL(`../../lib/fixtures/sea/ripples/uv-2026111812-00${hh}.png`, import.meta.url)))));
      for (const p of [...leg, ...north]) {
        const { x, y } = CUR.currentUvXY(p.lat, p.lon), flow = { u: 0, v: 0 };
        const ok = !!g && RIP.sampleUv(g, x, y, flow);
        b.currentFixture.push({ hour: hh, name: p.name, cur: ok ? { kn: +(Math.hypot(flow.u, flow.v) * KN).toFixed(2), to: Math.round((Math.atan2(flow.u, flow.v) * 180 / Math.PI + 360) % 360) } : null });
      }
    }
    console.log(`(b) Strom aus den Fixtures (BSH-Lauf 2026111812, Stunden 6/9): ${b.currentFixture.filter((r) => r.cur).length}/${b.currentFixture.length} Proben mit Wert`);
  }
  out.b = b;
  const legRows = b.rows.filter((r) => leg.some((p) => p.name === r.name));
  console.log(`(b) CWAM ${run}: ${legRows.filter((r) => r.wave && r.wave !== 'land/outside' && r.wave.hs != null).length}/${legRows.length} Etappen-Proben mit Hs; Strom ${legRows.filter((r) => typeof r.cur === 'object' && r.cur).length}/${legRows.length}; Feld ${b.fieldBytes.join('/')} B, uv ${b.uvBytes.join('/')} B`);
}

// --- (c) areas the leg crosses ---------------------------------------------------------------------------------------
{
  const areas = await raw(C.SEA_AREAS_PATH);
  const inRing = (ring, lon, lat) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const inside = (f, lon, lat) => f.geometry.coordinates.some((poly) => inRing(poly[0], lon, lat) && !poly.slice(1).some((hole) => inRing(hole, lon, lat)));
  const hits = new Map();
  const stepKm = 0.5, n = Math.ceil(distKm / stepKm);
  for (let k = 0; k <= n; k++) {
    const p = P.planDestination(A, course, (distKm * k) / n);
    const here = areas.features.filter((f) => inside(f, p.lon, p.lat));
    for (const f of here) { const e = hits.get(f.properties.id) ?? { id: f.properties.id, name: f.properties.name, kind: f.properties.kind, fromKm: +(distKm * k / n).toFixed(1), toKm: 0, samples: 0 }; e.toKm = +(distKm * k / n).toFixed(1); e.samples++; hits.set(f.properties.id, e); }
    if (!here.length) { const e = hits.get('-') ?? { id: '-', name: '(kein Gebiet)', kind: '-', fromKm: +(distKm * k / n).toFixed(1), toKm: 0, samples: 0 }; e.toKm = +(distKm * k / n).toFixed(1); e.samples++; hits.set('-', e); }
  }
  out.c = { features: areas.features.map((f) => ({ id: f.properties.id, name: f.properties.name, kind: f.properties.kind, polys: f.geometry.coordinates.length })), samples: n + 1, crossed: [...hits.values()] };
  console.log(`(c) ${areas.features.length} Gebiete; Etappe quert: ${[...hits.values()].map((e) => `${e.name} [${e.kind}] ${e.fromKm}–${e.toKm} km (${e.samples})`).join(' · ')}`);
}

await settle();
if (args.json) writeFileSync(String(args.json), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.a?.total ?? null));
