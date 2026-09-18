/**
 * verify-pv-latency.mjs — Laufzeit-Harnisch der Punktabfrage (Phase FI, AP0/AP1 → §6 des Plans).
 *
 *   npm run verify:pv-latency                      volle Matrix (Profile × Orte × Szenarien)
 *   npm run verify:pv-latency -- --quick           3 Orte, Profil desktop-none
 *   npm run verify:pv-latency -- --profiles=desktop-none,mobile-4g --places=muenchen,wien --only=bundle,live
 *   npm run verify:pv-latency -- --gate            Abnahme prüfen: AP1 (cube-read-warm) und §6 (cube-cold, ab AP2)
 *
 * Was gemessen wird, je Profil (Netz/CPU-Drossel über CDP) und Ort:
 *   terrain   Terrarium-Kacheln je Radius (z8/20 km, z9/20 km, z11/2 km), das Zwei-Skalen-DEM (terrain-2scale) und demLive (±0,2° z9)
 *   reader    der PD-D-Cube-Leser wie `read-point.mjs` (Basislinie): kalt, warm, parallel
 *   bundle    AP1: der parallele Leseweg `readPointBundle` — cube-read-cold (frischer Kontext), cube-read-warm
 *             (IndexedDB), cube-read-main (warm, Dekodierung im Hauptthread), cube-read-nocache (warm, ohne IndexedDB)
 *   live      der Live-Pfad von heute (`getPointForecast`, distribution: true, 240 h), kalt
 *   cube      AP2: der Cube-Pfad Ende-zu-Ende (`getPointForecast({ pointSource: 'cube' })`) — cube-cold (frischer
 *             Kontext), cube-warm (IndexedDB + Rechnung, Ergebnis-Cache geleert); `--gate` prüft §6 daran
 *   compare   AP2-Abnahme: cube-vs-live — beide Pfade im selben Kontext, Zeitreihen im Ergebnis, Tabelle der
 *             Abweichungen an festen Vorläufen (T 0,5 K · Wind 1 m/s · RR 0,2 mm/h · clct 10 %; Größeres = Befund)
 *   cubez     V-FI-17: progressiv mit z0 (WorldCover, Voreinstellung) gegen ohne — je Variante ein frischer Kontext,
 *             kalt und warm (derselbe Ort erneut; z0 dann aus dem Cache in der ersten Ausgabe)
 *   cubep     AP12: progressive Ausgabe (`onUpdate`) — cube-cold-prog / cube-warm-prog / cube-cold-prog-24h; je Lauf
 *             `total` = erste Antwort (bei 336 h die erste Stufe, E-F-3), `fullMs` = ganzes Fenster, `finalMs` = letzte Ausgabe
 *   cubex     AP12-Diagnose: cube-cold-24h, -noradar, -noradar-noobs (was welcher Posten auf der Leitung kostet)
 *   cuber     AP12 (c): Ebenen-Bereiche gegen die ganze Datei im selben Lauf (erster und zweiter Nutzer am Edge)
 *   cubecc    AP14: Nachbar-Chunk für den 2×2-Block (`crossChunk`) gegen ohne — je Variante ein Isolat, kalt dann warm;
 *             die Ausgaben tragen `border` (Schritte mit chunkBorderTruncated) und `cc` (Nachbar-Chunk in dieser Ausgabe)
 *   cubelc    AP16: Landbedeckung (`landCover` + `kappa` + `z0CellBox`) gegen ohne — je Variante ein Isolat, kalt dann warm;
 *             die Ausgaben tragen `lc` (d_water/κ in dieser Ausgabe); gemessen wird, ob die erste Darstellung gleich bleibt
 *             und wann die z0-/Landbedeckungs-Ausgabe kommt
 *
 * `--gate` prüft §6: kalt das GANZE Fenster (bei `cubep` daneben die erste Darstellung), warm p50 < 0,5 s.
 *
 * Netzmitschnitt je Lauf über CDP: Anzahl Abrufe, Draht-Bytes, x-cache HIT/MISS getrennt (Chunks sind
 * nicht purgebar — ein kalter Edge ist Zufall, deshalb beide Populationen). Ergebnis als JSON unter
 * `audit/fusion-implementierung/latency/<Zeit>.json` plus Tabelle auf der Konsole.
 *
 * Kein Test-Framework (D-10), keine neue Abhängigkeit: esbuild liegt im Baum (Vite), der Browser ist der
 * lokale chrome-headless-shell, das CDP spricht Node 22 selbst (`scripts/lib/cdpBrowser.mjs`).
 * Netzabhängig — kein CI-Gate. Ein Leistungsanker misst immer auch die Maschine und die Leitung mit:
 * Vergleiche nur innerhalb eines Laufs oder mit genannter Last (SAT2h-Lehre).
 */

import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findHeadlessChrome, openBrowser, NET_PROFILES } from './lib/cdpBrowser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'audit', 'fusion-implementierung', 'latency');

// ── Argumente ─────────────────────────────────────────────────────────────
const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

/** Die zehn Orte aus §6: Flachland, Ostösterreich (nur INCA), Alpen, Chunk-Rand. */
export const PLACES = [
  { id: 'hamburg',   lat: 53.5511, lon: 9.9937,  country: 'DE' },
  { id: 'berlin',    lat: 52.5200, lon: 13.4050, country: 'DE' },
  { id: 'muenchen',  lat: 48.1372, lon: 11.5755, country: 'DE' },
  { id: 'wien',      lat: 48.2082, lon: 16.3738, country: 'AT' },
  { id: 'graz',      lat: 47.0707, lon: 15.4395, country: 'AT' },
  { id: 'innsbruck', lat: 47.2692, lon: 11.4041, country: 'AT' },
  { id: 'zuerich',   lat: 47.3769, lon: 8.5417,  country: 'CH' },
  { id: 'genf',      lat: 46.2044, lon: 6.1432,  country: 'CH' },
  { id: 'zermatt',   lat: 46.0207, lon: 7.7491,  country: 'CH' },
  { id: 'zugspitze', lat: 47.4210, lon: 10.9863, country: 'DE' },
];
/** Chunk-Rand-Probe: Zelle am Rand eines 16×16-Blocks. Ausgezählt, nicht geraten (cellOf: round((lat−45.5)/0.05)). */
export const CHUNK_EDGE_PLACES = PLACES.filter((p) => {
  const iy = Math.round((p.lat - 45.5) / 0.05), ix = Math.round((p.lon - 5.5) / 0.05);
  return iy % 16 === 0 || iy % 16 === 15 || ix % 16 === 0 || ix % 16 === 15;
}).map((p) => p.id);

/** Profile aus §6. `fast-3g` nur berichtet, nicht gate-blockierend. */
export const PROFILES = {
  'desktop-none': { width: 1440, height: 900, mobile: false, net: NET_PROFILES.none, cpu: 1, gate: true },
  'desktop-4g':   { width: 1440, height: 900, mobile: false, net: NET_PROFILES.fast4g, cpu: 1, gate: true },
  'mobile-4g':    { width: 390, height: 844, mobile: true, net: NET_PROFILES.fast4g, cpu: 4, gate: true },
  'fast-3g':      { width: 390, height: 844, mobile: true, net: NET_PROFILES.fast3g, cpu: 4, gate: false },
};

/** AP1-Abnahme (Plan §4): Lesephase warm ≤ 400 ms Desktop, ≤ 1,0 s Mobil-4G (p50). */
export const AP1_READ_GATE_MS = { 'desktop-none': 400, 'mobile-4g': 1000 };

const quick = !!args.quick;
const profileIds = list(args.profiles) ?? (quick ? ['desktop-none'] : Object.keys(PROFILES));
const placeIds = list(args.places) ?? (quick ? ['muenchen', 'wien', 'zermatt'] : PLACES.map((p) => p.id));
const only = new Set(list(args.only) ?? ['terrain', 'reader', 'bundle', 'live', 'cube']);
const repeats = Number(args.repeats ?? 1);

/** AP2-Abnahme: Toleranzen des Zehn-Orte-Vergleichs (Plan §4) und die Vorläufe, an denen verglichen wird. */
export const COMPARE_TOL = { T: 0.5, ws: 1.0, rr: 0.2, clct: 10 };
export const COMPARE_LEADS_H = [0, 3, 6, 12, 24, 36, 48, 51, 72, 96, 120, 126, 168, 240];

// ── Bündel + Laborseite ───────────────────────────────────────────────────
const DEFINE = { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' };
async function bundleLab() {
  const res = await build({
    entryPoints: [join(ROOT, 'scripts', 'pv-latency', 'lab.ts')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent',
    // Vite-Umgebungswerte, die Module wie climaField.ts lesen; das Bündel läuft ohne Vite.
    define: DEFINE,
  });
  return res.outputFiles[0].text;
}
/** Der Dekodier-Worker als eigenes Bündel — die Seite löst `new URL('./decodeWorker.ts', import.meta.url)` auf `/decodeWorker.ts` auf. */
async function bundleWorker() {
  const res = await build({
    entryPoints: [join(ROOT, 'src', 'point', 'client', 'decodeWorker.ts')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent', define: DEFINE,
  });
  return res.outputFiles[0].text;
}

/** Statischer Ursprung + die zwei Rewrites, die der Live-Pfad relativ anspricht (netlify.toml). */
function serveLab(labJs, workerJs) {
  const html = readFileSync(join(ROOT, 'scripts', 'pv-latency', 'lab.html'));
  const clima = readFileSync(join(ROOT, 'public', 'climaGrid.json'));
  const REWRITES = [['/_dwd_opendata/', 'https://opendata.dwd.de/'], ['/_gfs/', 'https://noaa-gfs-bdp-pds.s3.amazonaws.com/']];
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' || u.pathname === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html); }
    if (u.pathname === '/lab.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(labJs); }
    // Der Worker ist in der App ein gehashter, unveränderlicher Chunk — hier entsprechend cachebar,
    // sonst lädt jeder Pool-Aufbau ihn neu (3G: 3 s, gemessen 16.09.).
    if (u.pathname === '/decodeWorker.ts') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'public, max-age=3600' }); return res.end(workerJs); }
    if (u.pathname === '/climaGrid.json') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' }); return res.end(clima); }
    const rw = REWRITES.find(([from]) => u.pathname.startsWith(from));
    if (rw) {
      try {
        const up = await fetch(rw[1] + u.pathname.slice(rw[0].length) + u.search, { headers: req.headers.range ? { range: req.headers.range } : {} });
        res.writeHead(up.status, { 'content-type': up.headers.get('content-type') ?? 'application/octet-stream' });
        return res.end(Buffer.from(await up.arrayBuffer()));
      } catch (e) { res.writeHead(502); return res.end(String(e)); }
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, url: `http://127.0.0.1:${srv.address().port}/` })));
}

// ── Auswertung des Netzmitschnitts ────────────────────────────────────────
function netSummary(reqs) {
  const done = reqs.filter((r) => r.t1 != null);
  const t0min = done.length ? Math.min(...done.map((r) => r.t0)) : 0;
  const cached = done.filter((r) => r.fromCache).length;           // Browser-Cache: kein Byte auf dem Draht
  const cdn = done.filter((r) => r.url.includes('cdn.jsdelivr.net') && !r.fromCache);
  const hit = cdn.filter((r) => /HIT/.test(r.xCache ?? '')).length;
  const miss = cdn.filter((r) => /MISS/.test(r.xCache ?? '')).length;
  const bytes = done.reduce((a, r) => a + (r.bytes ?? 0), 0);
  const largest = done.slice().sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0))[0];
  const hosts = {};
  for (const r of done) { const h = new URL(r.url).host; hosts[h] = (hosts[h] ?? 0) + 1; }
  return {
    requests: done.length, cached, failed: reqs.filter((r) => r.failed).length, bytes, cdn: cdn.length, hit, miss,
    largest: largest ? { url: largest.url.replace(/^https?:\/\/[^/]+\//, ''), bytes: largest.bytes, ttfbMs: largest.ttfbMs, ms: largest.ms, xCache: largest.xCache } : null,
    hosts,
    // Alle CDN-Abrufe einzeln: für die TTFB-Populationen (HIT/MISS) und die Größenabhängigkeit.
    cdnRequests: cdn.map((r) => ({ path: r.url.replace(/^https?:\/\/[^/]+\//, ''), bytes: r.bytes, ttfbMs: r.ttfbMs, ms: r.ms, xCache: r.xCache, startMs: Math.round((r.t0 - t0min) * 1000), status: r.status, ...(r.method && r.method !== 'GET' ? { method: r.method } : {}), ...(r.range ? { range: r.range } : {}), ...(r.enc ? { enc: r.enc } : {}) })),
    // Fremd-Hosts (S3-Kacheln, Live-Pfad) ebenfalls mit Startzeit — für den kritischen Pfad.
    otherRequests: done.filter((r) => !r.url.includes('cdn.jsdelivr.net')).map((r) => ({ url: r.url.replace(/^https?:\/\//, '').slice(0, 90), bytes: r.bytes, ttfbMs: r.ttfbMs, ms: r.ms, startMs: Math.round((r.t0 - t0min) * 1000), status: r.status, fromCache: !!r.fromCache })),
  };
}
const q = (arr, p) => { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
const ms = (v) => (v == null ? '—' : `${Math.round(v)} ms`);

// ── Der Lauf ──────────────────────────────────────────────────────────────
async function main() {
  const chrome = findHeadlessChrome();
  if (!chrome) { console.error('Kein chrome-headless-shell gefunden (OG_CHROME setzen oder Playwright-Ablage).'); process.exit(2); }
  const [labJs, workerJs] = await Promise.all([bundleLab(), bundleWorker()]);
  const { srv, url } = await serveLab(labJs, workerJs);
  const browser = await openBrowser(chrome, { timeoutMs: 120_000 });
  const startedAt = new Date().toISOString();
  const runs = [];
  const compareRuns = [];
  console.log(`[pv-latency] Lab ${url} · Bündel ${(labJs.length / 1024).toFixed(0)} KB + Worker ${(workerJs.length / 1024).toFixed(0)} KB · Profile ${profileIds.join(',')} · Orte ${placeIds.join(',')} · Szenarien ${[...only].join(',')}`);

  const withContext = async (prof, fn) => {
    const p = PROFILES[prof];
    const ctx = await browser.newContext({ url, width: p.width, height: p.height, mobile: p.mobile, net: p.net, cpu: p.cpu });
    try {
      await ctx.evaluate('new Promise((r, j) => { let n = 0; const t = setInterval(() => { if (window.pfLab && window.pfLab.ready) { clearInterval(t); r(true); } else if (++n > 200) { clearInterval(t); j(new Error("lab nicht bereit")); } }, 50); })');
      ctx.resetRequests();
      return await fn(ctx);
    } finally { await ctx.close(); }
  };
  const record = async (ctx, base, expr) => {
    ctx.resetRequests();
    const t0 = Date.now();
    let result;
    try { result = await ctx.evaluate(expr); } catch (e) { result = { error: String(e.message ?? e) }; }
    const wall = Date.now() - t0;
    await new Promise((r) => setTimeout(r, 150)); // loadingFinished-Ereignisse nachlaufen lassen
    const run = {
      ...base, wallMs: wall, totalMs: result?.total ?? null, fullMs: result?.fullMs ?? null, finalMs: result?.finalMs ?? null,
      coreMs: result?.timing?.coreMs ?? null, readMs: result?.timing?.readMs ?? null, firstMs: result?.timing?.firstMs ?? null,
      result, net: netSummary(ctx.requests()),
    };
    runs.push(run);
    const l = run.net.largest;
    const extra = (run.coreMs != null ? `  core ${ms(run.coreMs)} first ${ms(run.firstMs)} all ${ms(run.readMs)}` : '')
      + (run.fullMs != null && run.fullMs !== run.totalMs ? `  full ${ms(run.fullMs)} (erste ${result?.firstHours} h)` : '')
      + (run.finalMs != null ? `  final ${ms(run.finalMs)}${result?.pending?.length ? ` (${result.pending.join('+')})` : ''}` : '');
    const errs = (result?.errors?.length ? `  ⚠ ${result.errors.length} Fehler: ${result.errors[0]}` : '') + (result?.error ? `  ✗ ${result.error}` : '');
    console.log(`  ${base.profile.padEnd(12)} ${base.place.padEnd(10)} ${base.scenario.padEnd(18)} ${ms(run.totalMs).padStart(9)}${extra}  req ${String(run.net.requests).padStart(3)} (${run.net.cached} cache)  ${(run.net.bytes / 1024).toFixed(0).padStart(5)} KB  HIT/MISS ${run.net.hit}/${run.net.miss}`
      + (l ? `  größte ${(l.bytes / 1024).toFixed(0)} KB ttfb ${l.ttfbMs} ms ${l.xCache ?? ''}` : '') + errs);
    return run;
  };

  for (const profile of profileIds) {
    if (!PROFILES[profile]) { console.error(`Unbekanntes Profil: ${profile}`); continue; }
    // Verbindungen wärmen (DNS/TLS des Browser-Prozesses), in einem eigenen Kontext, nicht gemessen.
    if (!args.noprime) await withContext(profile, async (ctx) => { const p = await ctx.evaluate('pfLab.prime()'); console.log(`  ${profile.padEnd(12)} prime ${ms(p.total)}`); });
    for (const placeId of placeIds) {
      const pl = PLACES.find((p) => p.id === placeId);
      if (!pl) { console.error(`Unbekannter Ort: ${placeId}`); continue; }
      const base = { profile, place: pl.id, lat: pl.lat, lon: pl.lon, country: pl.country, chunkEdge: CHUNK_EDGE_PLACES.includes(pl.id) };
      for (let rep = 0; rep < repeats; rep++) {
        if (only.has('terrain')) {
          // Eigener Kontext je Messung: der DEM-Sampler des Live-Pfads und die z9-Kacheln teilen
          // sich Dateien — im selben Kontext wäre der zweite Lauf aus dem Browser-Cache warm.
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'dem-live-z9', rep }, `pfLab.demLive(${pl.lat}, ${pl.lon})`);
          });
          await withContext(profile, async (ctx) => {
            for (const [z, r] of [[8, 20_000], [9, 20_000], [11, 2_000]]) await record(ctx, { ...base, scenario: `terrain-z${z}`, rep }, `pfLab.terrain(${pl.lat}, ${pl.lon}, ${z}, ${r})`);
          });
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'terrain-2scale', rep }, `pfLab.terrain2(${pl.lat}, ${pl.lon})`);
          });
        }
        if (only.has('reader')) {
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'reader-cold', rep }, `pfLab.reader(${pl.lat}, ${pl.lon})`);
            await record(ctx, { ...base, scenario: 'reader-warm', rep }, `pfLab.reader(${pl.lat}, ${pl.lon})`);
            await record(ctx, { ...base, scenario: 'reader-parallel', rep }, `pfLab.reader(${pl.lat}, ${pl.lon}, { parallel: true })`);
          });
        }
        if (only.has('bundle')) {
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'cube-read-cold', rep }, `pfLab.bundle(${pl.lat}, ${pl.lon})`);
            await record(ctx, { ...base, scenario: 'cube-read-warm', rep }, `pfLab.bundle(${pl.lat}, ${pl.lon})`);
            await record(ctx, { ...base, scenario: 'cube-read-main', rep }, `pfLab.bundle(${pl.lat}, ${pl.lon}, { decode: 'main' })`);
            await record(ctx, { ...base, scenario: 'cube-read-nocache', rep }, `pfLab.bundle(${pl.lat}, ${pl.lon}, { cache: false })`);
          });
        }
        if (only.has('live') && profile !== 'fast-3g') {
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'live-cold', rep }, `pfLab.live(${pl.lat}, ${pl.lon}, '${pl.country}', 240)`);
          });
        }
        if (only.has('cube')) {
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'cube-cold', rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}')`);
            await record(ctx, { ...base, scenario: 'cube-warm', rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { fresh: true })`);
          });
        }
        if (only.has('cubep')) {
          // AP12: progressive Ausgabe — erste Antwort ab dem Kern (`total`), Nachlieferung (`finalMs`); warm = derselbe Ort erneut.
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'cube-cold-prog', rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true })`);
            await record(ctx, { ...base, scenario: 'cube-warm-prog', rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true, fresh: true })`);
          });
          // Das Panel fragt heute 24 h an (PointForecastPanel, `hours = 24`) — dieselbe Messung für dieses Fenster.
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'cube-cold-prog-24h', rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true, hours: 24 })`);
          });
        }
        if (only.has('cubez')) {
          // V-FI-17: z0 aus WorldCover gegen ohne — ein Isolat je Variante, kalt dann warm im selben Kontext.
          for (const [cold, warm, o] of [['cube-cold-prog-noz0', 'cube-warm-prog-noz0', 'z0: false'], ['cube-cold-prog-z0', 'cube-warm-prog-z0', 'z0: true']]) {
            await withContext(profile, async (ctx) => {
              await record(ctx, { ...base, scenario: cold, rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true, ${o} })`);
              await record(ctx, { ...base, scenario: warm, rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true, fresh: true, ${o} })`);
            });
          }
        }
        if (only.has('cubecc')) {
          // AP14: Nachbar-Chunk gegen ohne — ein Isolat je Variante, kalt dann warm im selben Kontext (Graz/Berlin am Rand,
          // ein Innenort als Gegenprobe: dort darf sich nichts ändern).
          for (const [cold, warm, o] of [['cube-cold-prog-nocc', 'cube-warm-prog-nocc', 'cc: false'], ['cube-cold-prog-cc', 'cube-warm-prog-cc', 'cc: true']]) {
            await withContext(profile, async (ctx) => {
              await record(ctx, { ...base, scenario: cold, rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true, ${o} })`);
              await record(ctx, { ...base, scenario: warm, rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true, fresh: true, ${o} })`);
            });
          }
        }
        if (only.has('cubelc')) {
          // AP16: Landbedeckung gegen ohne — ein Isolat je Variante, kalt dann warm im selben Kontext.
          for (const [cold, warm, o] of [['cube-cold-prog-nolc', 'cube-warm-prog-nolc', 'lc: false'], ['cube-cold-prog-lc', 'cube-warm-prog-lc', 'lc: true']]) {
            await withContext(profile, async (ctx) => {
              await record(ctx, { ...base, scenario: cold, rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true, ${o} })`);
              await record(ctx, { ...base, scenario: warm, rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { progressive: true, fresh: true, ${o} })`);
            });
          }
        }
        if (only.has('cuber')) {
          // AP12 (c): Ebenen-Bereiche gegen die ganze Datei im selben Lauf. Der erste Bereichs-Lauf je Ort ist der
          // erste Nutzer am Edge (identity-Variante kalt, §9.14.1), der zweite ein weiterer Nutzer (identity warm).
          for (const [scenario, o] of [['cube-cold-prog', '{ progressive: true }'], ['cube-cold-prog-ranges', '{ progressive: true, ranges: true }'], ['cube-cold-prog-ranges-2nd', '{ progressive: true, ranges: true }']]) {
            await withContext(profile, async (ctx) => {
              await record(ctx, { ...base, scenario, rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', ${o})`);
            });
          }
        }
        if (only.has('cubex')) {
          // AP12-Diagnose: welche Posten die Leitung vor dem Kern belegen — je Variante ein frischer Kontext (ein Isolat je Variante).
          for (const [scenario, o] of [['cube-cold-24h', '{ hours: 24 }'], ['cube-cold-noradar', '{ nowcast: false }'], ['cube-cold-noradar-noobs', '{ nowcast: false, obs: false }']]) {
            await withContext(profile, async (ctx) => {
              await record(ctx, { ...base, scenario, rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', ${o})`);
            });
          }
        }
        if (only.has('compare') && profile !== 'fast-3g') {
          // Beide Pfade im SELBEN Kontext, nacheinander: erst der Cube (kalt), dann der Live-Pfad (kalt) —
          // die Zeitreihen kommen mit, die Tabelle rechnet der Harnisch unten.
          await withContext(profile, async (ctx) => {
            const c = await record(ctx, { ...base, scenario: 'cmp-cube', rep }, `pfLab.cube(${pl.lat}, ${pl.lon}, '${pl.country}', { series: true })`);
            const l = await record(ctx, { ...base, scenario: 'cmp-live', rep }, `pfLab.live(${pl.lat}, ${pl.lon}, '${pl.country}', 336, { series: true, radar: true })`);
            compareRuns.push({ place: pl.id, profile, cube: c.result, live: l.result });
          });
        }
      }
    }
  }

  await browser.close();
  srv.close();

  // ── Zusammenfassung je Profil × Szenario ──────────────────────────────
  const summary = {};
  for (const r of runs) {
    const k = `${r.profile}|${r.scenario}`;
    (summary[k] ??= { total: [], core: [], read: [], first: [], final: [], full: [] });
    summary[k].total.push(r.totalMs ?? r.wallMs);
    if (r.finalMs != null) summary[k].final.push(r.finalMs);
    if (r.fullMs != null) summary[k].full.push(r.fullMs);
    if (r.coreMs != null) summary[k].core.push(r.coreMs);
    if (r.readMs != null) summary[k].read.push(r.readMs);
    if (r.firstMs != null) summary[k].first.push(r.firstMs);
  }
  console.log('\n[pv-latency] Zusammenfassung (Wandzeit in der Seite; n Läufe → p50 / p95 / max; für bundle zusätzlich Kern-Lesephase p50/p95, erste Darstellung p50, alles p50):');
  const table = [];
  for (const [k, v] of Object.entries(summary)) {
    const [profile, scenario] = k.split('|');
    table.push({ profile, scenario, n: v.total.length, p50: q(v.total, 0.5), p95: q(v.total, 0.95), max: Math.max(...v.total),
      coreP50: q(v.core, 0.5), coreP95: q(v.core, 0.95), readP50: q(v.read, 0.5), readP95: q(v.read, 0.95), firstP50: q(v.first, 0.5), firstP95: q(v.first, 0.95),
      finalP50: q(v.final, 0.5), finalP95: q(v.final, 0.95), fullP50: q(v.full, 0.5), fullP95: q(v.full, 0.95) });
  }
  for (const t of table) {
    console.log(`  ${t.profile.padEnd(12)} ${t.scenario.padEnd(18)} n=${String(t.n).padStart(2)}  ${ms(t.p50).padStart(9)} / ${ms(t.p95).padStart(9)} / ${ms(t.max).padStart(9)}`
      + (t.coreP50 != null ? `   core ${ms(t.coreP50).padStart(8)} (p95 ${ms(t.coreP95)})  first ${ms(t.firstP50).padStart(8)}  all ${ms(t.readP50).padStart(8)}` : '')
      + (t.fullP50 != null && t.fullP50 !== t.p50 ? `  full ${ms(t.fullP50)} (p95 ${ms(t.fullP95)})` : '')
      + (t.finalP50 != null ? `  final ${ms(t.finalP50)} (p95 ${ms(t.finalP95)})` : ''));
  }

  // ── AP2-Abnahme: Cube ↔ Live an festen Vorläufen ────────────────────────
  let compare = null;
  if (compareRuns.length) {
    compare = [];
    console.log(`\n[pv-latency] Vergleich Cube ↔ Live je Ort und Vorlauf (Δ = Cube − Live; Toleranz T ${COMPARE_TOL.T} K · Wind ${COMPARE_TOL.ws} m/s · RR ${COMPARE_TOL.rr} mm/h · clct ${COMPARE_TOL.clct} %; ⚠ = Befund):`);
    for (const cr of compareRuns) {
      const cs = cr.cube?.series ?? null, ls = cr.live?.series ?? null;
      if (!cs || !ls) { console.log(`  ${cr.place.padEnd(10)} — kein Vergleich: ${cr.cube?.error ?? cr.live?.error ?? 'keine Zeitreihe'}`); compare.push({ place: cr.place, profile: cr.profile, error: cr.cube?.error ?? cr.live?.error ?? 'keine Zeitreihe' }); continue; }
      const t0 = Math.min(cs[0]?.t ?? Infinity, ls[0]?.t ?? Infinity);
      const rows = [];
      for (const h of COMPARE_LEADS_H) {
        const t = t0 + h * 3_600_000;
        const a = cs.find((x) => x.t === t), b = ls.find((x) => x.t === t);
        if (!a || !b) continue;
        const d = (k) => (a[k] == null || b[k] == null ? null : Math.round((a[k] - b[k]) * 100) / 100);
        const row = { leadH: h, cube: { T: a.T, ws: a.ws, rr: a.rr, clct: a.clct, src: a.src, Tq10: a.Tq10, Tq90: a.Tq90 }, live: { T: b.T, ws: b.ws, rr: b.rr, clct: b.clct, src: b.src, Tq10: b.Tq10, Tq90: b.Tq90 },
          dT: d('T'), dWs: d('ws'), dRr: d('rr'), dClct: d('clct') };
        row.over = [row.dT != null && Math.abs(row.dT) > COMPARE_TOL.T ? 'T' : null, row.dWs != null && Math.abs(row.dWs) > COMPARE_TOL.ws ? 'ws' : null,
          row.dRr != null && Math.abs(row.dRr) > COMPARE_TOL.rr ? 'rr' : null, row.dClct != null && Math.abs(row.dClct) > COMPARE_TOL.clct ? 'clct' : null].filter(Boolean);
        rows.push(row);
      }
      const f = (v, w = 6) => (v == null ? '—'.padStart(w) : (v >= 0 ? '+' : '') + v.toFixed(2)).padStart(w);
      console.log(`  ${cr.place} (${cr.profile}) — Cube ${cr.cube.hours} Schritte in ${Math.round(cr.cube.total)} ms, Live ${cr.live.hours} h in ${Math.round(cr.live.total)} ms, Höhe Cube ${cr.cube.elevation} / Live ${cr.live.elevation} m`);
      console.log('     +h   ΔT      Δws     ΔRR     Δclct   Cube T/ws/rr/clct           Live T/ws/rr/clct           Quellen Cube | Live');
      for (const r of rows) {
        console.log(`    ${String(r.leadH).padStart(3)}  ${f(r.dT)}  ${f(r.dWs)}  ${f(r.dRr)}  ${f(r.dClct)}   ${[r.cube.T, r.cube.ws, r.cube.rr, r.cube.clct].map((v) => (v == null ? '—' : v)).join('/').padEnd(27)} ${[r.live.T, r.live.ws, r.live.rr, r.live.clct].map((v) => (v == null ? '—' : v)).join('/').padEnd(27)} ${(r.cube.src ?? []).join('+')} | ${(r.live.src ?? []).join('+')}${r.over.length ? '  ⚠ ' + r.over.join(',') : ''}`);
      }
      compare.push({ place: cr.place, profile: cr.profile, cubeMs: cr.cube.total, liveMs: cr.live.total, cubeHours: cr.cube.hours, liveHours: cr.live.hours,
        cubeElevation: cr.cube.elevation, liveElevation: cr.live.elevation, cubeNotes: cr.cube.notes, cubeSkips: cr.cube.skips, cubeErrors: cr.cube.errors, rows });
    }
  }

  // ── Gates ───────────────────────────────────────────────────────────────
  let gate = null;
  if (args.gate) {
    gate = { ok: true, checks: [] };
    // AP1 (Plan §4): Kern-Lesephase warm (Cube + Station + Gelände; Nowcast und statische Produkte kommen progressiv).
    const warm = runs.filter((r) => r.scenario === 'cube-read-warm' && r.coreMs != null);
    for (const [profile, limit] of Object.entries(AP1_READ_GATE_MS)) {
      const arr = warm.filter((r) => r.profile === profile).map((r) => r.coreMs);
      if (!arr.length) continue;
      const c = { gate: 'AP1 core read warm', profile, n: arr.length, p50: q(arr, 0.5), limit, ok: q(arr, 0.5) <= limit };
      gate.checks.push(c); gate.ok = gate.ok && c.ok;
    }
    // §6 (ab AP2): Ende-zu-Ende kalt-neu. AP12: gibt es das progressive Szenario, zählt dessen ERSTE Antwort
    // (vollständige 0–336-h-Vorhersage aus dem Kern; Radar/Anker/`static` kommen als Nachlieferung, deren p50
    // steht daneben) — sonst wie bisher `cube-cold`. Dazu warm (§6: p50 < 0,5 s).
    const coldScenario = runs.some((r) => r.scenario === 'cube-cold-prog') ? 'cube-cold-prog' : 'cube-cold';
    const warmScenario = runs.some((r) => r.scenario === 'cube-warm-prog') ? 'cube-warm-prog' : 'cube-warm';
    const cubeRuns = runs.filter((r) => r.scenario === coldScenario);
    if (!cubeRuns.length) {
      console.log('\n[pv-latency] Gate §6: kein Cube-Pfad-Szenario (`cube-cold`) im Lauf — Ende-zu-Ende-Abnahme erst ab AP2.');
    } else {
      for (const profile of profileIds.filter((p) => PROFILES[p]?.gate)) {
        // Gezählt wird das GANZE Fenster (Kern, `fullMs`) — die erste Darstellung aus t1 (E-F-3) steht daneben (`firstP50`).
        const arr = cubeRuns.filter((r) => r.profile === profile).map((r) => r.fullMs ?? r.totalMs);
        const firsts = cubeRuns.filter((r) => r.profile === profile).map((r) => r.totalMs);
        const fin = cubeRuns.filter((r) => r.profile === profile && r.finalMs != null).map((r) => r.finalMs);
        const c = { gate: `§6 end-to-end cold (${coldScenario}, ganzes Fenster)`, profile, p50: q(arr, 0.5), p95: q(arr, 0.95), firstP50: q(firsts, 0.5), firstP95: q(firsts, 0.95), ...(fin.length ? { finalP50: q(fin, 0.5), finalP95: q(fin, 0.95) } : {}), ok: q(arr, 0.5) < 2000 && q(arr, 0.95) < 5000 };
        gate.checks.push(c); gate.ok = gate.ok && c.ok;
        const warmArr = runs.filter((r) => r.scenario === warmScenario && r.profile === profile).map((r) => r.totalMs);
        if (warmArr.length) {
          const w = { gate: `§6 warm (${warmScenario})`, profile, p50: q(warmArr, 0.5), p95: q(warmArr, 0.95), ok: q(warmArr, 0.5) < 500 };
          gate.checks.push(w); gate.ok = gate.ok && w.ok;
        }
      }
    }
    if (!gate.checks.length) { console.log('\n[pv-latency] Gate: kein Abnahme-Szenario im Lauf.'); gate = null; }
    else console.log(`\n[pv-latency] Gate: ${gate.ok ? 'GRÜN' : 'ROT'} ` + JSON.stringify(gate.checks));
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({
    schema: 2, startedAt, finishedAt: new Date().toISOString(), host: { platform: process.platform, node: process.version, chrome },
    args: { profileIds, placeIds, only: [...only], repeats }, chunkEdgePlaces: CHUNK_EDGE_PLACES, summary: table, gate, compare, runs,
  }, null, 1));
  console.log(`\n[pv-latency] geschrieben: ${file}`);
  if (gate && !gate.ok) process.exitCode = 1;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
