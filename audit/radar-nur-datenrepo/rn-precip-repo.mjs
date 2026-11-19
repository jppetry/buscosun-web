// Phase RN-2 (Jan 18.11.): the ICON-D2 precipitation forecast from the data repo ONLY — page probe with a CDN that fails.
// Opens the Wetterkarte (precipitation layer, dev server) headless in four browser contexts:
//   A  default, both hosts reachable
//   B  default, jsDelivr blocked for the data repo            ⇒ expected: the images come from raw.githubusercontent, no DWD
//   C  `?precipdwd=1`, jsDelivr AND raw blocked (control)     ⇒ expected: GRIB from the DWD (the old way still works, and the
//                                                                pattern that counts DWD requests really matches)
//   D  default, jsDelivr AND raw blocked                      ⇒ expected: repeated attempts, no DWD, a named error
// Usage: node rn-precip-repo.mjs <repo> <baseUrl> <stayMs> [path]
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [repo, base, stay, pagePath = '/wetterkarte/niederschlag/muenchen'] = process.argv.slice(2);
const stayMs = Number(stay);
const { openBrowser, findHeadlessChrome } = await import(pathToFileURL(path.join(repo, 'scripts/lib/cdpBrowser.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmmss = (ms = Date.now()) => new Date(ms).toISOString().slice(11, 19);
const CDN = '*cdn.jsdelivr.net/gh/jppetry/buscosun-data*';
const RAW = '*raw.githubusercontent.com/jppetry/buscosun-data*';

const browser = await openBrowser(findHeadlessChrome(), { extraArgs: ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const consoleBy = new Map();
browser.on((msg) => {
  if (msg.method !== 'Runtime.consoleAPICalled') return;
  const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
  if (!consoleBy.has(msg.sessionId)) consoleBy.set(msg.sessionId, []);
  consoleBy.get(msg.sessionId).push({ at: hhmmss(), type: msg.params.type, text });
});

const cases = [
  { label: 'A default, both hosts reachable', search: '', block: [] },
  { label: 'B default, jsDelivr blocked', search: '', block: [CDN] },
  { label: 'C control ?precipdwd=1, jsDelivr + raw blocked', search: '?precipdwd=1', block: [CDN, RAW] },
  { label: 'D default, jsDelivr + raw blocked', search: '', block: [CDN, RAW] },
];
// one after the other: four software-rendered maps at once starve each other (requests start a minute late)
// RN_CASES=C,D runs only those cases (the forecast starts after the radars — with both hosts blocked that takes ≈ 40 s here)
const only = (process.env.RN_CASES ?? '').split(',').filter(Boolean);
for (const c of cases.filter((x) => !only.length || only.includes(x.label[0]))) {
  const ctx = await browser.newContext({ url: 'about:blank', width: 1440, height: 900 });
  if (c.block.length) await ctx.send('Network.setBlockedURLs', { urls: c.block });
  const openedAt = hhmmss();
  await ctx.send('Page.navigate', { url: `${base}${pagePath}${c.search}` });
  await sleep(stayMs);
  const reqs = ctx.requests();
  const t = (r) => new Date(r.wall0 * 1000).toISOString().slice(11, 19);
  const st = (r) => r.status ?? r.failed ?? 'pending';
  const host = (u) => (u.startsWith(base) ? 'site' : new URL(u).host.replace('cdn.jsdelivr.net', 'jsdelivr').replace('raw.githubusercontent.com', 'raw'));
  const dwdPrecip = reqs.filter((r) => /\/_dwd_(grib|opendata)\/weather\/nwp\/icon-d2\/grib\/\d\d\/tot_prec\//.test(r.url));
  const group = (list) => { const g = {}; for (const r of list) { const k = `${host(r.url)} ${st(r)}`; g[k] = (g[k] ?? 0) + 1; } return JSON.stringify(g); };
  const precipPng = reqs.filter((r) => /buscosun-data.*\/runs\/\d{10}\/precip-\d+\.png/.test(r.url));
  const index = reqs.filter((r) => /buscosun-data[^?]*\/index\.json/.test(r.url));
  console.log(`\n=== ${c.label} — opened ${openedAt} UTC, stayed ${Math.round(stayMs / 1000)} s`);
  console.log(`ICON-D2 tot_prec at the DWD: ${dwdPrecip.length}${dwdPrecip.length ? `  (first ${t(dwdPrecip[0])}: ${dwdPrecip[0].url.replace(base, '').slice(0, 110)})` : ''}`);
  console.log(`precip images of the data repo: ${precipPng.length}  ${group(precipPng)}`);
  console.log(`index / pointer of the data repo: ${index.length}  ${group(index)}  at ${index.map(t).join(' ')}`);
  for (const l of (consoleBy.get(ctx.sessionId) ?? []).filter((l) => /\[repack\]|ICON-D2|Niederschlag-Forecast/i.test(l.text)).slice(0, 10)) console.log(`  console ${l.at} [${l.type}]  ${l.text.slice(0, 240)}`);
  console.log(`  console errors: ${(consoleBy.get(ctx.sessionId) ?? []).filter((l) => l.type === 'error').length}`);
  await ctx.close();
}
await browser.close();
process.exit(0);
