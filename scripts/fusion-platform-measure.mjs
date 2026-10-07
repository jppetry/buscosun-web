/**
 * fusion-platform-measure.mjs — the measurement of phase FR-2 (`audit/fusion-release.md` §8.4, rule frozen before the run):
 * per part of the platform that reaches buscosun Fusion through `getFusionForecast`, the call of the part (hours and options
 * as in the code) over the live path and over the cube path of the entry, at six places, desktop without throttling.
 * Per measurement a fresh browser context (cold), then in the same context a point 3 km beside it (warm).
 *
 *   K1 fields: share of filled hours in the window of the part, per field it reads — cube ≥ live − 2 points
 *   K2 load time: median cold and median warm — cube ≤ 1,25 × live or ≤ live + 300 ms
 *   context: median |Δ| of temperature, wind, precipitation, cloud cover between the paths (no gate)
 *
 * Needs a Vite dev server of this tree (default http://127.0.0.1:5231). Writes audit/fusion-release/platform-measure.{json,md}.
 *   node scripts/fusion-platform-measure.mjs [--base=http://127.0.0.1:5231] [--parts=route,event]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, findHeadlessChrome } from './lib/cdpBrowser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const BASE = arg('base', 'http://127.0.0.1:5231');

const LOCS = [
  { name: 'München', lat: 48.137, lng: 11.575, country: 'DE' },
  { name: 'Hamburg', lat: 53.551, lng: 9.993, country: 'DE' },
  { name: 'Garmisch-Partenkirchen', lat: 47.492, lng: 11.095, country: 'DE' },
  { name: 'Innsbruck', lat: 47.269, lng: 11.404, country: 'AT' },
  { name: 'Zürich', lat: 47.377, lng: 8.540, country: 'CH' },
  { name: 'Davos', lat: 46.802, lng: 9.836, country: 'CH' },
];
const WIND = ['windSpeed', 'windDirection', 'gustSpeed'];
// Calls and fields as in the code (§8.1): hours, radar flag, the fields each part reads.
const PARTS = [
  { id: 'route', hours: (c) => (c === 'DE' ? 24 : 60), radar: false, fields: ['temperature', 'apparentTemperature', ...WIND, 'relativeHumidity', 'cloudCoverTotal', 'precipitation', 'uvIndex', 'snowLineM'] },
  { id: 'event', hours: () => 180, radar: true, fields: ['temperature', 'apparentTemperature', ...WIND, 'relativeHumidity', 'cloudCoverTotal', 'precipitation', 'uvIndex'] },
  { id: 'section', hours: () => 36, radar: false, fields: ['temperature', ...WIND, 'relativeHumidity', 'cloudCoverTotal', 'cloudCoverLow', 'cloudCoverMid', 'cloudCoverHigh'] },
  // notify: recommendBestDay + notificationEngine read no wind direction (corrected after the first run, §8.5).
  { id: 'notify', hours: () => 180, radar: false, fields: ['temperature', 'apparentTemperature', 'windSpeed', 'gustSpeed', 'relativeHumidity', 'cloudCoverTotal', 'precipitation', 'uvIndex'] },
].filter((p) => arg('parts', '') === '' || arg('parts', '').split(',').includes(p.id));

const median = (a) => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

/** In the page: load the modules (not timed), then the call of the part cold and 3 km beside it warm. */
const pageRun = (opts, warm, part, path, fields) => `(async () => {
  const m = await import('/src/pointForecast/fusionForecast.ts');
  await import('/src/pointForecast/cubeSource.ts');
  const H = 3600000, t0h = Math.floor(Date.now() / H) * H, fields = ${JSON.stringify(fields)};
  const run = async (o) => { const t = performance.now(); const fc = await m.getFusionForecast(o, '${part}', { path: '${path}' }); return { ms: performance.now() - t, fc }; };
  const a = await run(${JSON.stringify(opts)});
  const b = await run(${JSON.stringify(warm)});
  const win = a.fc.hours.filter((h) => h.timestamp.getTime() >= t0h && h.timestamp.getTime() < t0h + ${opts.hours} * H);
  const cov = Object.fromEntries(fields.map((f) => [f, win.filter((h) => h[f] != null && Number.isFinite(h[f])).length]));
  const series = win.map((h) => ({ t: h.timestamp.getTime(), T: h.temperature, W: h.windSpeed, P: h.precipitation, C: h.cloudCoverTotal }));
  return { cold: a.ms, warm: b.ms, n: win.length, cov, series, cube: !!a.fc.cube, uv: a.fc.cube?.uv?.hours ?? 0 };
})()`;

const chrome = findHeadlessChrome();
const browser = await openBrowser(chrome, { timeoutMs: 180_000 });
const results = [];
try {
  // Prime: the dev server transforms the module graph once (not part of any measurement).
  { const ctx = await browser.newContext({ url: `${BASE}/robots.txt` }); await ctx.evaluate(`import('/src/pointForecast/fusionForecast.ts').then(() => import('/src/pointForecast/cubeSource.ts')).then(() => 1)`); await ctx.close(); }
  for (const part of PARTS) {
    for (const loc of LOCS) {
      const hours = part.hours(loc.country);
      const opts = { lat: loc.lat, lng: loc.lng, country: loc.country, hours, ...(part.radar ? { includeRadarNowcast: true } : {}) };
      const warm = { ...opts, lat: +(loc.lat + 0.027).toFixed(3) };
      const row = { part: part.id, loc: loc.name, hours };
      for (const path of ['live', 'cube']) {
        const ctx = await browser.newContext({ url: `${BASE}/robots.txt` });
        try { row[path] = await ctx.evaluate(pageRun(opts, warm, part.id, path, part.fields)); }
        catch (e) { row[path] = { error: String(e.message ?? e).slice(0, 200) }; }
        await ctx.close();
      }
      results.push(row);
      const f = (x) => (x?.error ? `FEHLER ${x.error.slice(0, 60)}` : `${Math.round(x.cold)}/${Math.round(x.warm)} ms`);
      console.log(`${part.id.padEnd(8)} ${loc.name.padEnd(24)} live ${f(row.live)} · cube ${f(row.cube)}${row.cube?.cube === false ? ' (RÜCKFALL)' : ''}`);
    }
  }
} finally { await browser.close(); }

// ── evaluation by the frozen rule ──
const report = [];
const lines = ['# FR-2 — Messung je Plattformteil (Regel §8.4, eingefroren vor dem Lauf)', '', `Lauf ${new Date().toISOString()}, Dev-Server ${BASE}, Desktop ohne Drossel, je Messung frischer Kontext.`, ''];
for (const part of PARTS) {
  const rows = results.filter((r) => r.part === part.id && !r.live?.error && !r.cube?.error);
  const failed = results.filter((r) => r.part === part.id).length - rows.length;
  const fallback = rows.filter((r) => r.cube.cube === false).length;
  const denom = rows.reduce((s, r) => s + r.hours, 0);
  const k1 = part.fields.map((f) => {
    const live = rows.reduce((s, r) => s + r.live.cov[f], 0) / denom * 100, cube = rows.reduce((s, r) => s + r.cube.cov[f], 0) / denom * 100;
    return { f, live, cube, ok: cube >= live - 2 };
  });
  const med = (path, k) => median(rows.map((r) => r[path][k]));
  const k2 = ['cold', 'warm'].map((k) => { const l = med('live', k), c = med('cube', k); return { k, live: l, cube: c, ok: c <= 1.25 * l || c <= l + 300 }; });
  const delta = (key) => median(rows.flatMap((r) => { const m = new Map(r.live.series.map((s) => [s.t, s[key]])); return r.cube.series.map((s) => (s[key] != null && m.get(s.t) != null ? Math.abs(s[key] - m.get(s.t)) : NaN)); }));
  const ctx = { T: delta('T'), W: delta('W'), P: delta('P'), C: delta('C') };
  const pass = rows.length === LOCS.length && fallback === 0 && k1.every((x) => x.ok) && k2.every((x) => x.ok);
  report.push({ part: part.id, pass, failed, fallback, k1, k2, ctx, uvHours: rows.map((r) => r.cube.uv) });
  lines.push(`## ${part.id} — ${pass ? 'BESTANDEN' : 'NICHT bestanden'}`, '', `Orte ausgewertet ${rows.length}/${LOCS.length}${failed ? ` (${failed} mit Fehler)` : ''}, Rückfall des Cube-Pfads ${fallback}×, UV-Stunden aus dem DWD je Ort ${rows.map((r) => r.cube.uv).join('/')}.`, '',
    '| Feld | live % | Cube % | K1 |', '|---|---|---|---|', ...k1.map((x) => `| ${x.f} | ${x.live.toFixed(1)} | ${x.cube.toFixed(1)} | ${x.ok ? '✓' : '✗'} |`), '',
    '| Ladezeit (Median) | live ms | Cube ms | K2 |', '|---|---|---|---|', ...k2.map((x) => `| ${x.k} | ${Math.round(x.live)} | ${Math.round(x.cube)} | ${x.ok ? '✓' : '✗'} |`), '',
    `Kontext (Median |Δ| Cube − live): T ${ctx.T.toFixed(2)} K · Wind ${ctx.W.toFixed(2)} m/s · Niederschlag ${ctx.P.toFixed(2)} mm/h · Bewölkung ${ctx.C.toFixed(1)} %`, '',
    '| Ort | live kalt/warm ms | Cube kalt/warm ms |', '|---|---|---|', ...results.filter((r) => r.part === part.id).map((r) => `| ${r.loc} | ${r.live?.error ? 'Fehler' : `${Math.round(r.live.cold)} / ${Math.round(r.live.warm)}`} | ${r.cube?.error ? 'Fehler' : `${Math.round(r.cube.cold)} / ${Math.round(r.cube.warm)}`} |`), '');
}
const dir = join(ROOT, 'audit', 'fusion-release');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'platform-measure.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, report, results }, null, 1));
writeFileSync(join(dir, 'platform-measure.md'), lines.join('\n'));
for (const r of report) console.log(`${r.part}: ${r.pass ? 'BESTANDEN' : 'NICHT bestanden'} — K1 ${r.k1.filter((x) => !x.ok).map((x) => x.f).join(',') || 'ok'} · K2 ${r.k2.map((x) => `${x.k} ${Math.round(x.live)}→${Math.round(x.cube)}`).join(', ')}`);
