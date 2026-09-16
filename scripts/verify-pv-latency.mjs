/**
 * verify-pv-latency.mjs — Laufzeit-Harnisch der Punktabfrage (Phase FI, AP0 → §6 des Plans).
 *
 *   npm run verify:pv-latency                      volle Matrix (Profile × Orte × Szenarien)
 *   npm run verify:pv-latency -- --quick           3 Orte, Profil desktop-none
 *   npm run verify:pv-latency -- --profiles=desktop-none,mobile-4g --places=muenchen,wien --only=reader,live
 *   npm run verify:pv-latency -- --gate            Abnahme nach §6 prüfen (p50 < 2 s, p95 < 5 s, kalt-neu)
 *
 * Was gemessen wird, je Profil (Netz/CPU-Drossel über CDP) und Ort:
 *   terrain   Terrarium-Kacheln, die ein Radius wirklich braucht (z9/20 km, z10/20 km, z11/2 km) + demLive (±0,2° z9)
 *   reader    der PD-D-Cube-Leser wie `read-point.mjs`: kalt (frischer Kontext), warm (gleicher Kontext), parallel (warm)
 *   live      der Live-Pfad von heute (`getPointForecast`, distribution: true, 240 h), kalt
 *   cube      (ab AP2) der Cube-Pfad von buscosun Fusion — noch nicht vorhanden, wird übersprungen und gesagt
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

const quick = !!args.quick;
const profileIds = list(args.profiles) ?? (quick ? ['desktop-none'] : Object.keys(PROFILES));
const placeIds = list(args.places) ?? (quick ? ['muenchen', 'wien', 'zermatt'] : PLACES.map((p) => p.id));
const only = new Set(list(args.only) ?? ['terrain', 'reader', 'live']);
const repeats = Number(args.repeats ?? 1);

// ── Bündel + Laborseite ───────────────────────────────────────────────────
async function bundleLab() {
  const res = await build({
    entryPoints: [join(ROOT, 'scripts', 'pv-latency', 'lab.ts')],
    bundle: true, format: 'esm', platform: 'browser', target: 'es2022', write: false, logLevel: 'silent',
    // Vite-Umgebungswerte, die Module wie climaField.ts lesen; das Bündel läuft ohne Vite.
    define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'import.meta.env.MODE': '"production"' },
  });
  return res.outputFiles[0].text;
}

/** Statischer Ursprung + die zwei Rewrites, die der Live-Pfad relativ anspricht (netlify.toml). */
function serveLab(labJs) {
  const html = readFileSync(join(ROOT, 'scripts', 'pv-latency', 'lab.html'));
  const clima = readFileSync(join(ROOT, 'public', 'climaGrid.json'));
  const REWRITES = [['/_dwd_opendata/', 'https://opendata.dwd.de/'], ['/_gfs/', 'https://noaa-gfs-bdp-pds.s3.amazonaws.com/']];
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname === '/' || u.pathname === '/index.html') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); return res.end(html); }
    if (u.pathname === '/lab.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); return res.end(labJs); }
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
    cdnRequests: cdn.map((r) => ({ path: r.url.replace(/^https?:\/\/[^/]+\//, ''), bytes: r.bytes, ttfbMs: r.ttfbMs, ms: r.ms, xCache: r.xCache })),
  };
}
const q = (arr, p) => { const a = arr.filter(Number.isFinite).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
const ms = (v) => (v == null ? '—' : `${Math.round(v)} ms`);

// ── Der Lauf ──────────────────────────────────────────────────────────────
async function main() {
  const chrome = findHeadlessChrome();
  if (!chrome) { console.error('Kein chrome-headless-shell gefunden (OG_CHROME setzen oder Playwright-Ablage).'); process.exit(2); }
  const labJs = await bundleLab();
  const { srv, url } = await serveLab(labJs);
  const browser = await openBrowser(chrome, { timeoutMs: 120_000 });
  const startedAt = new Date().toISOString();
  const runs = [];
  console.log(`[pv-latency] Lab ${url} · Bündel ${(labJs.length / 1024).toFixed(0)} KB · Profile ${profileIds.join(',')} · Orte ${placeIds.join(',')} · Szenarien ${[...only].join(',')}`);

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
    const run = { ...base, wallMs: wall, totalMs: result?.total ?? null, result, net: netSummary(ctx.requests()) };
    runs.push(run);
    const l = run.net.largest;
    console.log(`  ${base.profile.padEnd(12)} ${base.place.padEnd(10)} ${base.scenario.padEnd(16)} ${ms(run.totalMs).padStart(9)}  req ${String(run.net.requests).padStart(3)} (${run.net.cached} cache)  ${(run.net.bytes / 1024).toFixed(0).padStart(5)} KB  HIT/MISS ${run.net.hit}/${run.net.miss}`
      + (l ? `  größte ${(l.bytes / 1024).toFixed(0)} KB ttfb ${l.ttfbMs} ms ${l.xCache ?? ''}` : '') + (result?.error ? `  ✗ ${result.error}` : ''));
    return run;
  };

  for (const profile of profileIds) {
    if (!PROFILES[profile]) { console.error(`Unbekanntes Profil: ${profile}`); continue; }
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
            for (const [z, r] of [[9, 20_000], [10, 20_000], [11, 2_000]]) await record(ctx, { ...base, scenario: `terrain-z${z}`, rep }, `pfLab.terrain(${pl.lat}, ${pl.lon}, ${z}, ${r})`);
          });
        }
        if (only.has('reader')) {
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'reader-cold', rep }, `pfLab.reader(${pl.lat}, ${pl.lon})`);
            await record(ctx, { ...base, scenario: 'reader-warm', rep }, `pfLab.reader(${pl.lat}, ${pl.lon})`);
            await record(ctx, { ...base, scenario: 'reader-parallel', rep }, `pfLab.reader(${pl.lat}, ${pl.lon}, { parallel: true })`);
          });
        }
        if (only.has('live') && profile !== 'fast-3g') {
          await withContext(profile, async (ctx) => {
            await record(ctx, { ...base, scenario: 'live-cold', rep }, `pfLab.live(${pl.lat}, ${pl.lon}, '${pl.country}', 240)`);
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
    (summary[k] ??= []).push(r.totalMs ?? r.wallMs);
  }
  console.log('\n[pv-latency] Zusammenfassung (Wandzeit in der Seite; n Läufe → p50 / p95 / max):');
  const table = [];
  for (const [k, arr] of Object.entries(summary)) {
    const [profile, scenario] = k.split('|');
    table.push({ profile, scenario, n: arr.length, p50: q(arr, 0.5), p95: q(arr, 0.95), max: Math.max(...arr) });
  }
  for (const t of table) console.log(`  ${t.profile.padEnd(12)} ${t.scenario.padEnd(16)} n=${String(t.n).padStart(2)}  ${ms(t.p50).padStart(9)} / ${ms(t.p95).padStart(9)} / ${ms(t.max).padStart(9)}`);

  // ── Gate nach §6 (nur, wenn ein Cube-Pfad-Szenario vorliegt; bis AP2 nur Bericht) ──
  let gate = null;
  if (args.gate) {
    const cubeRuns = runs.filter((r) => r.scenario === 'cube-cold');
    if (!cubeRuns.length) {
      console.log('\n[pv-latency] Gate: kein Cube-Pfad-Szenario im Lauf — Abnahme nach §6 noch nicht prüfbar (ab AP2). Bericht ohne Gate.');
    } else {
      gate = { ok: true, checks: [] };
      for (const profile of profileIds.filter((p) => PROFILES[p]?.gate)) {
        const arr = cubeRuns.filter((r) => r.profile === profile).map((r) => r.totalMs);
        const c = { profile, p50: q(arr, 0.5), p95: q(arr, 0.95), okP50: q(arr, 0.5) < 2000, okP95: q(arr, 0.95) < 5000 };
        gate.checks.push(c); gate.ok = gate.ok && c.okP50 && c.okP95;
      }
      console.log(`\n[pv-latency] Gate §6: ${gate.ok ? 'GRÜN' : 'ROT'} ` + JSON.stringify(gate.checks));
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${startedAt.replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({
    schema: 1, startedAt, finishedAt: new Date().toISOString(), host: { platform: process.platform, node: process.version, chrome },
    args: { profileIds, placeIds, only: [...only], repeats }, chunkEdgePlaces: CHUNK_EDGE_PLACES, summary: table, gate, runs,
  }, null, 1));
  console.log(`\n[pv-latency] geschrieben: ${file}`);
  if (gate && !gate.ok) process.exitCode = 1;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
