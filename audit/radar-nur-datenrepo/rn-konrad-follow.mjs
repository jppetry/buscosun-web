// Phase RN-4 (Jan 18.11.): KONRAD3D from the data repo only — page probe of the window in which the reader used to go to the
// DWD: the page is opened `phase` seconds after a 5-min slot boundary (default 288 s: the DWD has the new slot, the gate of
// the repo way, 330 s, still holds it back). Expected: the slot before it from the data repo, nothing at the DWD, and ≈ 50 s
// later the new slot (follow-up at gate + 10 s). With `control` the same window is opened with `?konraddwd=1` — the old way
// (listing + XML through `/_dwd_opendata`), so the pattern that counts DWD requests is shown to match.
// Usage: node rn-konrad-follow.mjs <repo> <baseUrl> <stayMs> [phaseSeconds] [control]
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [repo, base, stay, phaseArg = '288', mode = ''] = process.argv.slice(2);
const stayMs = Number(stay);
const phase = Number(phaseArg);
const { openBrowser, findHeadlessChrome } = await import(pathToFileURL(path.join(repo, 'scripts/lib/cdpBrowser.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const hhmmss = (ms = Date.now()) => new Date(ms).toISOString().slice(11, 19);

const STEP = 300_000;
const now = Date.now();
let openAt = Math.floor(now / STEP) * STEP + phase * 1000;
if (openAt < now + 3000) openAt += STEP;
console.log(`waiting ${Math.round((openAt - now) / 1000)} s — opening at ${hhmmss(openAt)} UTC (slot boundary + ${phase} s)`);
await sleep(openAt - Date.now());

const browser = await openBrowser(findHeadlessChrome(), { extraArgs: ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const lines = [];
browser.on((msg) => {
  if (msg.method !== 'Runtime.consoleAPICalled') return;
  const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
  lines.push({ at: hhmmss(), type: msg.params.type, text });
});
const ctx = await browser.newContext({ url: 'about:blank', width: 1440, height: 900 });
const search = mode === 'control' ? '?konraddwd=1' : '';
await ctx.send('Page.navigate', { url: `${base}/wetterkarte/zellbahnen/muenchen${search}` });
await sleep(stayMs);
const reqs = ctx.requests();
const t = (r) => new Date(r.wall0 * 1000).toISOString().slice(11, 19);
const st = (r) => r.status ?? r.failed ?? 'pending';
const konrad = reqs.filter((r) => /konrad3d/i.test(r.url));
const atDwd = konrad.filter((r) => /\/_dwd_opendata\//.test(r.url));
console.log(`\n=== ${mode === 'control' ? 'control ?konraddwd=1' : 'default'} — opened ${hhmmss(openAt)} UTC, stayed ${Math.round(stayMs / 1000)} s`);
console.log(`KONRAD3D at the DWD: ${atDwd.length}`);
for (const r of konrad) console.log(`  ${t(r)}  ${String(st(r)).padEnd(4)} ${r.url.replace(base, '').replace('https://', '').slice(0, 120)}`);
for (const l of lines.filter((l) => /KONRAD3D-Datei|Zellbahnen.*nicht/.test(l.text))) console.log(`  console ${l.at}  ${l.text.slice(0, 150)}`);
console.log(`  console errors: ${lines.filter((l) => l.type === 'error').length}`);
await ctx.close();
await browser.close();
process.exit(0);
