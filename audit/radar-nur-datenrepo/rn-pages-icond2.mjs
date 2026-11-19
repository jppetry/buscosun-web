// Jan 18.11.: why does the ICON-D2 precipitation go through the DWD on the Regenradar?
// Opens the given pages (dev server) headless and lists, per page: every ICON-D2 request to the DWD (listing, GRIB),
// every request to the data repo outside `radar/` (index, pointers, repack images) with status, and the console lines
// of the repack way. No timing window needed.
// Usage: node rn-pages-icond2.mjs <repo> <baseUrl> <stayMs> <path1> [<path2> …]
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [repo, base, stay, ...paths] = process.argv.slice(2);
const stayMs = Number(stay);
const { openBrowser, findHeadlessChrome } = await import(pathToFileURL(path.join(repo, 'scripts/lib/cdpBrowser.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmmss = (ms = Date.now()) => new Date(ms).toISOString().slice(11, 19);

const browser = await openBrowser(findHeadlessChrome(), { extraArgs: ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const consoleBy = new Map();
browser.on((msg) => {
  if (msg.method !== 'Runtime.consoleAPICalled') return;
  const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
  if (!consoleBy.has(msg.sessionId)) consoleBy.set(msg.sessionId, []);
  consoleBy.get(msg.sessionId).push({ at: hhmmss(), type: msg.params.type, text });
});
const pages = [];
for (const p of paths) pages.push({ p, openedAt: hhmmss(), ctx: await browser.newContext({ url: `${base}${p}`, width: 1440, height: 900 }) });
await sleep(stayMs);

const t = (r) => new Date(r.wall0 * 1000).toISOString().slice(11, 19);
for (const pg of pages) {
  const reqs = pg.ctx.requests();
  const d2 = reqs.filter((r) => /\/_dwd_(grib|opendata|wind)\/weather\/nwp\//.test(r.url));
  const repo = reqs.filter((r) => /buscosun-data/.test(r.url) && !/\/radar\//.test(r.url) && !/\/(point|obs|road|sea|precipsum|ruc|glacier)\//.test(r.url));
  console.log(`\n=== ${pg.p} — opened ${pg.openedAt} UTC, stayed ${Math.round(stayMs / 1000)} s`);
  console.log(`ICON requests to the DWD: ${d2.length}`);
  for (const r of d2.slice(0, 12)) console.log(`  ${t(r)}  ${r.status ?? r.failed}  ${r.bytes ?? '?'} B  ${r.url.replace(base, '').slice(0, 150)}`);
  const groups = {};
  for (const r of repo) {
    const u = new URL(r.url);
    const k = u.pathname.replace(/^\/gh\/jppetry\/buscosun-data(@[^/]+)?/, (m, ref) => `[cdn${ref ?? ''}]`).replace(/^\/jppetry\/buscosun-data\/([^/]+)/, '[raw $1]').replace(/\/[^/]*$/, '/').replace(/@[0-9a-f]{7,40}/, '@<commit>');
    const g = (groups[k] ??= { n: 0, status: {}, first: t(r), sample: u.pathname.split('/').pop() });
    g.n++; const s = r.status ?? r.failed ?? 'pending'; g.status[s] = (g.status[s] ?? 0) + 1;
  }
  console.log(`data repo (outside radar/): ${repo.length} requests`);
  for (const [k, g] of Object.entries(groups)) console.log(`  ${k}  ×${g.n}  ${JSON.stringify(g.status)}  first ${g.first}  e.g. ${g.sample}`);
  for (const l of (consoleBy.get(pg.ctx.sessionId) ?? []).filter((l) => /repack|Repack|ICON-D2|GRIB|Daten-CDN|Index/i.test(l.text)).slice(0, 14)) console.log(`  console ${l.at} [${l.type}]  ${l.text.slice(0, 260)}`);
  const flags = await pg.ctx.evaluate(`JSON.stringify({ search: location.search, path: location.pathname, repack: localStorage.getItem('repack'), repackidx: localStorage.getItem('repackidx'), repackrun: localStorage.getItem('repackrun') })`).catch((e) => String(e));
  console.log(`  page: ${flags}`);
  await pg.ctx.close();
}
await browser.close();
process.exit(0);
