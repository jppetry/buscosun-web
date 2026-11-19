// Phase RN, second question (Jan 18.11.): do the Regenradar and the Dashboard still ask the DWD for radar?
// Opens the given pages (dev server) in headless Chromium in the window BEFORE the image gate of the newest RV slot,
// stays, and lists EVERY request that goes to the DWD (any `/_dwd_*` rewrite or dwd.de host), grouped by product path —
// plus what was read from the data repo's radar tree.
// Usage: node rn-pages-dwd.mjs <repo> <baseUrl> <stayMs> <path1> [<path2> …]
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [repo, base, stay, ...paths] = process.argv.slice(2);
const stayMs = Number(stay);
const { openBrowser, findHeadlessChrome } = await import(pathToFileURL(path.join(repo, 'scripts/lib/cdpBrowser.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mod = () => Math.floor(Date.now() / 1000) % 300;
const hhmmss = (ms = Date.now()) => new Date(ms).toISOString().slice(11, 19);

while (!(mod() >= 203 && mod() <= 225)) await sleep(1000);

const browser = await openBrowser(findHeadlessChrome(), { extraArgs: ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const consoleBy = new Map();
browser.on((msg) => {
  if (msg.method !== 'Runtime.consoleAPICalled') return;
  const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
  if (!consoleBy.has(msg.sessionId)) consoleBy.set(msg.sessionId, []);
  consoleBy.get(msg.sessionId).push({ at: hhmmss(), type: msg.params.type, text });
});
const pages = [];
for (const p of paths) {
  const openedMod = mod(); const openedAt = hhmmss();
  pages.push({ p, openedMod, openedAt, ctx: await browser.newContext({ url: `${base}${p}`, width: 1440, height: 900 }) });
}
await sleep(stayMs);

// product key of a DWD request: the path up to (not including) the file name, digits-only run folders collapsed
const dwdKey = (u) => {
  const x = new URL(u, base);
  const dir = x.pathname.replace(/\/[^/]*$/, '/').replace(/\/\d{2,}\//g, '/<n>/');
  return (x.host === new URL(base).host ? '' : x.host) + dir;
};
for (const pg of pages) {
  const reqs = pg.ctx.requests();
  const dwd = reqs.filter((r) => /\/_dwd_[a-z]+\/|dwd\.de\//.test(r.url));
  const radarDwd = dwd.filter((r) => /\/weather\/radar\//.test(r.url));
  const repoRadar = reqs.filter((r) => /buscosun-data[@/]main\/radar\//.test(r.url));
  const vis = await pg.ctx.evaluate('document.visibilityState').catch(() => '?');
  console.log(`\n=== ${pg.p} — opened ${pg.openedAt} UTC (newest RV slot ${pg.openedMod} s old; image gate 270 s), stayed ${Math.round(stayMs / 1000)} s, visibility ${vis}`);
  console.log(`requests ${reqs.length}; to the DWD ${dwd.length}, of these radar ${radarDwd.length}; radar files from the data repo ${repoRadar.length}`);
  const groups = {};
  for (const r of dwd) { const k = dwdKey(r.url); const g = (groups[k] ??= { n: 0, bytes: 0, first: new Date(r.wall0 * 1000).toISOString().slice(11, 19), sample: r.url.replace(base, '').slice(0, 150) }); g.n++; g.bytes += r.bytes ?? 0; }
  for (const [k, g] of Object.entries(groups)) console.log(`  DWD ${/\/weather\/radar\//.test(k) ? 'RADAR ' : '      '}${k}  ×${g.n}  ${g.bytes} B  first ${g.first}  e.g. ${g.sample}`);
  const repoGroups = {};
  for (const r of repoRadar) { const m = /\/radar\/((?:img\/v1\/)?[a-z0-9-]+)\//.exec(r.url); const k = m ? m[1] : '?'; repoGroups[k] = (repoGroups[k] ?? 0) + 1; }
  console.log(`  data repo radar: ${JSON.stringify(repoGroups)}`);
  for (const l of (consoleBy.get(pg.ctx.sessionId) ?? []).filter((l) => /RADOLAN-RV|KONRAD|Zell/i.test(l.text)).slice(0, 8)) console.log(`  console ${l.at}  ${l.text.slice(0, 200)}`);
  console.log(`  console errors: ${(consoleBy.get(pg.ctx.sessionId) ?? []).filter((l) => l.type === 'error').length}`);
  await pg.ctx.close();
}
await browser.close();
process.exit(0);
