/**
 * perf-data-identity.mjs — proof that the data the Regenradar and buscosun Fusion compute is IDENTICAL before and after the
 * performance measures of 10.10.2026 (audit/performance-2026-10-10.md §5): two `vite dev` servers (base = the state before,
 * cur = the state after), one headless browser, both pages opened at the same moment so they read the same radar slot and
 * the same Fusion run.
 *
 *   node scripts/perf-data-identity.mjs --base=http://127.0.0.1:5401 --cur=http://127.0.0.1:5402 [--ort=muenchen --lat=48.137 --lon=11.575]
 *
 *   radar   `/regenradar/<ort>`: `window.__precipSources()` (DEV hook of MapView) once the RV stack (25 frames), INCA and rzc are
 *           loaded — FNV-1a hash of every frame plane (`values`, `values2`), run/valid times, frame order.
 *   fusion  in the same pages: `getPointForecastFromCube` (progressive, `onUpdate`) for the place — the FINAL forecast (last
 *           update after the promise, 8 s grace): per hour p10/p50/p90/σ per variable, distribution kinds, flags, notes.
 *
 * Output: equal / differing keys per part. Exit code 1 on any difference.
 */
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
const BASE = args.base ?? 'http://127.0.0.1:5401';
const CUR = args.cur ?? 'http://127.0.0.1:5402';
const ORT = args.ort ?? 'muenchen';
const LAT = Number(args.lat ?? 48.137), LON = Number(args.lon ?? 11.575);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HASH_SRC = `(() => {
  const fnv = (u8) => { let h = 0x811c9dc5 >>> 0; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0') + ':' + u8.length; };
  window.__fnv = fnv;
  window.__radarHashes = () => {
    const s = window.__precipSources?.(); if (!s) return null;
    const out = {};
    if (s.rv) out.rv = { runAt: s.rv.runAt.toISOString(), n: s.rv.frames.length, frames: s.rv.frames.map((f) => ({ lead: f.leadMinutes, validAt: f.validAt.toISOString(), w: f.width, h: f.height, v: fnv(f.values), v2: f.values2 ? fnv(f.values2) : null })) };
    // INCA: v (the values every consumer reads) per lead; v2 (log plane) depends on whether the DEV instance took the mirror slot or
    // the direct GeoSphere path (rate limit) — reported, compared separately
    if (s.inca) out.inca = { n: s.inca.frames.length, frames: s.inca.frames.map((f) => ({ lead: f.leadHours, w: f.width, h: f.height, v: fnv(f.values) })), v2: s.inca.frames.map((f) => (f.values2 ? fnv(f.values2) : null)) };
    if (s.rzc) out.rzc = { validAt: s.rzc.validAt.toISOString(), w: s.rzc.width, h: s.rzc.height, v: fnv(s.rzc.values), v2: s.rzc.values2 ? fnv(s.rzc.values2) : null, corners: JSON.stringify(s.rzc.corners) };
    if (s.masks) out.masks = Object.fromEntries(Object.entries(s.masks).sort(([a], [b]) => a.localeCompare(b)).map(([k, m]) => [k, m ? fnv(m) : null]));   // key order = arrival order, not data
    return out;
  };
})()`;

const FUSION_SRC = (lat, lon) => `(async () => {
  const m = await import('/src/pointForecast/cubeSource.ts');
  let last = null;
  const fc = await m.getPointForecastFromCube({ lat: ${lat}, lng: ${lon}, country: 'DE', hours: 48, pointSource: 'cube', includeRadarNowcast: true, onUpdate: (f) => { last = f; } }, m.defaultCubeIo());
  const t0 = Date.now();
  while (Date.now() - t0 < 9000) { await new Promise((r) => setTimeout(r, 250)); }
  const f = last ?? fc;
  const v2 = f.v2 ?? f.cube?.v2 ?? null;
  const hours = (f.hours ?? f.hourly ?? []).map((h) => ({ t: h.time ?? h.validAt ?? h.t, temp: h.temperature ?? h.temp ?? null, u: h.u ?? null, v: h.v ?? null, gust: h.gust ?? null, rh: h.relativeHumidity ?? null, p: h.precipitation ?? null, cc: h.cloudCover ?? h.cloudTotal ?? null }));
  // volatile wording (age of the SWR index copy, timings) is not data — normalised before hashing
  const norm = (n) => String(n).replace(new RegExp('[0-9]+ s alt', 'g'), 'N s alt').replace(new RegExp('[0-9]+ ms', 'g'), 'N ms');
  const hoursSer = JSON.stringify(hours);
  // the v2 block repeats the notes (index age) and carries the reader's fetch statistics (files/bytes/ms — how it was read, not what) — both normalised
  const v2Ser = v2 ? norm(JSON.stringify(v2)).replace(new RegExp('"fetched":\{[^}]*\}', 'g'), '"fetched":{}').replace(new RegExp('"timing":\{[^}]*\}', 'g'), '"timing":{}') : '';   // timing = how long, not what
  const notesSer = JSON.stringify([...(f.cube?.notes ?? []), ...(f.notes ?? [])].map(norm));
  const skipsSer = JSON.stringify([...(f.cube?.skips ?? [])].map(norm));
  window.__v2Ser = v2Ser;
  return { hoursHash: window.__fnv(new TextEncoder().encode(hoursSer)), v2Hash: window.__fnv(new TextEncoder().encode(v2Ser)), notesHash: window.__fnv(new TextEncoder().encode(notesSer)), skipsHash: window.__fnv(new TextEncoder().encode(skipsSer)), nHours: hours.length, first: hours[0] ?? null, last: hours[hours.length - 1] ?? null, cubeKeys: f.cube ? Object.keys(f.cube).sort().join(',') : null, notes: (f.cube?.notes ?? []).slice(0, 12), skips: (f.cube?.skips ?? []).slice(0, 12), fromUpdate: !!last, sources: f.sourcesAvailable ?? f.sources ?? null };
})()`;

async function main() {
  const browser = await openBrowser(findHeadlessChrome(), { timeoutMs: 180_000, extraArgs: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const open = async (base) => {
    const ctx = await browser.newContext({ width: 1440, height: 900 });
    await ctx.send('Page.addScriptToEvaluateOnNewDocument', { source: HASH_SRC });
    await ctx.send('Page.navigate', { url: `${base}/regenradar/${ORT}` });
    return ctx;
  };
  const [b, c] = await Promise.all([open(BASE), open(CUR)]);
  const ready = async (ctx) => {
    const t0 = Date.now();
    while (Date.now() - t0 < 240_000) {
      await sleep(500);
      const r = await ctx.evaluate(`(() => { const s = window.__precipSources?.(); return s ? { rv: s.rv?.frames?.length ?? 0, inca: !!s.inca, rzc: !!s.rzc, masks: Object.keys(s.masks ?? {}).length } : null; })()`).catch(() => null);
      if (r && r.rv >= 25 && r.inca && r.rzc && r.masks >= 3) return r;
    }
    return null;
  };
  const [rb, rc] = await Promise.all([ready(b), ready(c)]);
  console.log('ready base', JSON.stringify(rb), 'cur', JSON.stringify(rc));
  await sleep(2000);
  const [hb, hc] = await Promise.all([b.evaluate('window.__radarHashes()'), c.evaluate('window.__radarHashes()')]);
  let fail = 0;
  const cmp = (name, x, y) => {
    const sx = JSON.stringify(x ?? null), sy = JSON.stringify(y ?? null);
    if (sx === sy) { console.log(`OK   ${name}: identisch (${sx.length} Zeichen)`); return; }
    fail++;
    console.log(`DIFF ${name}:`);
    console.log('  base', sx.slice(0, 600));
    console.log('  cur ', sy.slice(0, 600));
  };
  cmp('radar rv (25 Frames, values + values2, Zeiten)', hb?.rv, hc?.rv);
  cmp('radar inca (values je Lead)', hb?.inca && { n: hb.inca.n, frames: hb.inca.frames }, hc?.inca && { n: hc.inca.n, frames: hc.inca.frames });
  console.log('     inca log plane present: base', JSON.stringify(hb?.inca?.v2?.map((x) => !!x)), 'cur', JSON.stringify(hc?.inca?.v2?.map((x) => !!x)), hb?.inca && hc?.inca && JSON.stringify(hb.inca.v2) === JSON.stringify(hc.inca.v2) ? '(identisch)' : '(Pfad verschieden: Spiegel-Slot gegen Direktweg)');
  cmp('radar rzc', hb?.rzc, hc?.rzc);
  cmp('radar masks', hb?.masks, hc?.masks);
  // Fusion: both calls start in the same moment (same hour window, same run, same obs stamp)
  const [fb, fc] = await Promise.all([b.evaluate(FUSION_SRC(LAT, LON)), c.evaluate(FUSION_SRC(LAT, LON))]);
  console.log('fusion base', JSON.stringify({ hours: fb.hoursHash, v2: fb.v2Hash, notes: fb.notesHash, skips: fb.skipsHash, n: fb.nHours, fromUpdate: fb.fromUpdate }));
  console.log('fusion cur ', JSON.stringify({ hours: fc.hoursHash, v2: fc.v2Hash, notes: fc.notesHash, skips: fc.skipsHash, n: fc.nHours, fromUpdate: fc.fromUpdate }));
  cmp('fusion Stunden (alle Werte je Stunde)', { hours: fb.hoursHash, n: fb.nHours, first: fb.first, last: fb.last }, { hours: fc.hoursHash, n: fc.nHours, first: fc.first, last: fc.last });
  cmp('fusion v2 (Verteilungen, Member, Konfidenz)', { v2: fb.v2Hash }, { v2: fc.v2Hash });
  cmp('fusion Notizen/Skips (ohne Alterswerte)', { notes: fb.notesHash, skips: fb.skipsHash, sources: fb.sources }, { notes: fc.notesHash, skips: fc.skipsHash, sources: fc.sources });
  if (fb.v2Hash !== fc.v2Hash) {
    const [vb, vc] = await Promise.all([b.evaluate('window.__v2Ser'), c.evaluate('window.__v2Ser')]);
    let k = 0; while (k < vb.length && k < vc.length && vb[k] === vc[k]) k++;
    console.log('  v2 first difference at', k, 'of', vb.length, '/', vc.length);
    console.log('  base …' + vb.slice(Math.max(0, k - 160), k + 120));
    console.log('  cur  …' + vc.slice(Math.max(0, k - 160), k + 120));
    let diffs = 0; for (let i = 0; i < Math.min(vb.length, vc.length); i++) if (vb[i] !== vc[i]) diffs++;
    console.log('  differing chars (aligned):', diffs);
  }
  if (fb.hoursHash !== fc.hoursHash || fb.notesHash !== fc.notesHash) { console.log('  notes base', JSON.stringify(fb.notes), '\n  notes cur ', JSON.stringify(fc.notes)); console.log('  skips base', JSON.stringify(fb.skips), '\n  skips cur ', JSON.stringify(fc.skips)); }
  await b.close(); await c.close(); await browser.close();
  console.log(fail ? `FEHLER: ${fail} Unterschied(e)` : 'alle Vergleiche identisch');
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(2); });
