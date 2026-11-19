// Phase RN-3 + RN-4 (Jan 18.11.): the ICON-D2 layers with images in the data repo and the cell tracks (KONRAD3D) from the
// data repo ONLY — page probe with a CDN that fails. Opens the Wetterkarte with ALL of these layers switched on (dev server),
// headless, one browser context per case, one after the other:
//   A  default, both hosts reachable                           ⇒ expected: 0 requests for these products at the DWD
//   B  default, jsDelivr blocked for the data repo             ⇒ expected: everything over raw.githubusercontent, 0 DWD
//   C  control `?d2dwd=1&konraddwd=1&precipdwd=1`, both blocked ⇒ expected: GRIB / listing at the DWD (the old way still
//                                                                 works, and the pattern that counts DWD requests matches)
//   D  default, both blocked                                   ⇒ expected: repeated attempts, 0 DWD, named console lines
// Usage: node rn-layers-repo.mjs <repo> <baseUrl> <stayMs>      (RN_CASES=A,B runs only those cases)
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [repo, base, stay] = process.argv.slice(2);
const stayMs = Number(stay);
const { openBrowser, findHeadlessChrome } = await import(pathToFileURL(path.join(repo, 'scripts/lib/cdpBrowser.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmmss = (ms = Date.now()) => new Date(ms).toISOString().slice(11, 19);
const CDN = '*cdn.jsdelivr.net/gh/jppetry/buscosun-data*';
const RAW = '*raw.githubusercontent.com/jppetry/buscosun-data*';
const PAGE = process.env.RN_PAGE ?? '/wetterkarte/temperatur/muenchen';
const LAYERS = process.env.RN_LAYERS ?? 'l=wind,boeen,gewitter,blitzprognose,schnee,rotation,zellbahnen,niederschlag';

// What "at the DWD" means, per product (the params the old chain lists and loads).
const D2 = {
  wind: /icon-d2\/grib\/\d\d\/(u_10m|v_10m)\//,
  temp: /icon-d2\/grib\/\d\d\/(t_2m|hsurf)\//,
  gust: /icon-d2\/grib\/\d\d\/vmax_10m\//,
  thunder: /icon-d2\/grib\/\d\d\/(cape_ml|cin_ml|lpi)\//,
  lightningfc: /icon-d2\/grib\/\d\d\/lpi_max\//,
  snow: /icon-d2\/grib\/\d\d\/(h_snow|snow_gsp|snow_con|rho_snow)\//,
  rotation: /icon-d2\/grib\/\d\d\/(uh_max|uh_max_low|sdi_2)\//,
  precip: /icon-d2\/grib\/\d\d\/tot_prec\//,
  konrad3d: /\/_dwd_opendata\/weather\/radar\/konrad3d\//,
};
const REPO = {
  wind: /\/runs\/\d{10}\/wind-\d+\.png/, temp: /\/runs\/\d{10}\/temp-\d+\.png|\/hsurf-v1\.png/, gust: /\/runs\/\d{10}\/gust-\d+\.png/,
  thunder: /\/runs\/\d{10}\/thunder-\d+\.png/, lightningfc: /\/runs\/\d{10}\/(lpi|lightningfc)-\d+\.png/,
  snow: /\/runs\/\d{10}\/snow(depth|fresh)-\d+\.png/, rotation: /\/runs\/\d{10}\/rotation-\d+\.png/, precip: /\/runs\/\d{10}\/precip-\d+\.png/,
  konrad3d: /\/radar\/(img\/v1\/konrad3d\/|konrad3d\/KONRAD3D_)/,
};

const browser = await openBrowser(findHeadlessChrome(), { extraArgs: ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const consoleBy = new Map();
browser.on((msg) => {
  if (msg.method !== 'Runtime.consoleAPICalled') return;
  const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
  if (!consoleBy.has(msg.sessionId)) consoleBy.set(msg.sessionId, []);
  consoleBy.get(msg.sessionId).push({ at: hhmmss(), type: msg.params.type, text });
});

const cases = [
  { label: 'A default, both hosts reachable', search: `?${LAYERS}`, block: [] },
  { label: 'B default, jsDelivr blocked', search: `?${LAYERS}`, block: [CDN] },
  { label: 'C control d2dwd=1 konraddwd=1 precipdwd=1, jsDelivr + raw blocked', search: `?${LAYERS}&d2dwd=1&konraddwd=1&precipdwd=1`, block: [CDN, RAW] },
  { label: 'D default, jsDelivr + raw blocked', search: `?${LAYERS}`, block: [CDN, RAW] },
];
const only = (process.env.RN_CASES ?? '').split(',').filter(Boolean);
for (const c of cases.filter((x) => !only.length || only.includes(x.label[0]))) {
  const ctx = await browser.newContext({ url: 'about:blank', width: 1440, height: 900 });
  if (c.block.length) await ctx.send('Network.setBlockedURLs', { urls: c.block });
  const openedAt = hhmmss();
  await ctx.send('Page.navigate', { url: `${base}${PAGE}${c.search}` });
  await sleep(stayMs);
  const reqs = ctx.requests();
  const st = (r) => r.status ?? r.failed ?? 'pending';
  const hostOf = (u) => (u.startsWith(base) ? 'site' : new URL(u).host.replace('cdn.jsdelivr.net', 'jsdelivr').replace('raw.githubusercontent.com', 'raw'));
  const group = (list) => { const g = {}; for (const r of list) { const k = `${hostOf(r.url)} ${st(r)}`; g[k] = (g[k] ?? 0) + 1; } return JSON.stringify(g); };
  const dwdAll = reqs.filter((r) => /\/_dwd_(grib|opendata|wind)\//.test(r.url));
  console.log(`\n=== ${c.label} — opened ${openedAt} UTC, stayed ${Math.round(stayMs / 1000)} s`);
  let dwdSum = 0;
  for (const k of Object.keys(D2)) {
    const atDwd = dwdAll.filter((r) => D2[k].test(r.url));
    const atRepo = reqs.filter((r) => /buscosun-data/.test(r.url) && REPO[k].test(r.url));
    dwdSum += atDwd.length;
    console.log(`  ${k.padEnd(12)} at the DWD: ${String(atDwd.length).padStart(3)}   data repo: ${String(atRepo.length).padStart(3)} ${group(atRepo)}`);
  }
  const other = dwdAll.filter((r) => !Object.values(D2).some((re) => re.test(r.url)));
  const otherKinds = [...new Set(other.map((r) => r.url.replace(base, '').replace(/\d{10}_\d{3}.*$/, '…').slice(0, 70)))].slice(0, 6);
  console.log(`  these products at the DWD in total: ${dwdSum}; other requests through the DWD proxies: ${other.length}${other.length ? `  (${otherKinds.join(' · ')})` : ''}`);
  const index = reqs.filter((r) => /buscosun-data[^?]*\/index\.json/.test(r.url));
  console.log(`  index / pointer of the data repo: ${index.length}  ${group(index)}`);
  const t = (r) => new Date(r.wall0 * 1000).toISOString().slice(11, 19);
  console.log(`    asked at: ${[...new Set(index.map(t))].join(' ')}`);
  const lines = (consoleBy.get(ctx.sessionId) ?? []);
  for (const l of lines.filter((l) => /\[repack\]|nicht aus dem Daten-Repo|KONRAD3D-Datei|nicht erreichbar|konnten nicht geladen/i.test(l.text)).slice(0, Number(process.env.RN_LINES ?? 14))) console.log(`  console ${l.at} [${l.type}]  ${l.text.slice(0, 220)}`);
  console.log(`  console errors: ${lines.filter((l) => l.type === 'error').length}`);
  for (const l of lines.filter((l) => l.type === 'error').slice(0, 4)) console.log(`    error ${l.at}  ${l.text.slice(0, 200)}`);
  await ctx.close();
}
await browser.close();
process.exit(0);
