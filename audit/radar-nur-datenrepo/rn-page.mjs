// Phase RN page probe: the real page (dev server) in headless Chromium, opened in the window BEFORE the image gate of the
// newest RV slot — once with the default (repo only) and, as the negative control, once with `?rvdwd=1` (old DWD way).
// Usage: node rn-page.mjs <repo> <baseUrl> [stayMs]
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const repo = process.argv[2];
const base = process.argv[3] ?? 'http://127.0.0.1:5199';
const stayMs = Number(process.argv[4] ?? 115_000);
const { openBrowser, findHeadlessChrome } = await import(pathToFileURL(path.join(repo, 'scripts/lib/cdpBrowser.mjs')).href);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mod = () => Math.floor(Date.now() / 1000) % 300;
const hhmmss = (ms = Date.now()) => new Date(ms).toISOString().slice(11, 19);

// wait for the pre-gate window: slot age = mod 300 (slots are on the 5-min grid), newest guess from 198 s, image gate 270 s
while (!(mod() >= 203 && mod() <= 230)) await sleep(1000);

const chrome = findHeadlessChrome();
const browser = await openBrowser(chrome, { extraArgs: ['--headless=new', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const consoleBy = new Map();
browser.on((msg) => {
  if (msg.method !== 'Runtime.consoleAPICalled') return;
  const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
  if (!consoleBy.has(msg.sessionId)) consoleBy.set(msg.sessionId, []);
  consoleBy.get(msg.sessionId).push({ at: hhmmss(), type: msg.params.type, text });
});

const open = async (label, search) => {
  const openedMod = mod();
  const ctx = await browser.newContext({ url: `${base}/wetterkarte/niederschlag/muenchen${search}`, width: 1440, height: 900 });
  return { label, ctx, openedMod, openedAt: hhmmss() };
};
const pages = [await open('default (repo only)', ''), await open('negative control ?rvdwd=1', '?rvdwd=1')];
await sleep(stayMs);

for (const p of pages) {
  const reqs = p.ctx.requests();
  const dwdRv = reqs.filter((r) => /_dwd_opendata\/weather\/radar\/composite\/rv|opendata\.dwd\.de\/weather\/radar\/composite\/rv/.test(r.url));
  const repoRv = reqs.filter((r) => /buscosun-data[@/]main\/radar\/(img\/v1\/rv(-past)?|rv)\//.test(r.url));
  const slots = {};
  for (const r of repoRv) {
    const m = /\/(rv|rv-past)\/(\d{10})\//.exec(r.url); if (!m) continue;
    const k = `${m[1]}/${m[2]}`;
    const host = new URL(r.url).host.replace('cdn.jsdelivr.net', 'jsdelivr').replace('raw.githubusercontent.com', 'raw');
    const s = (slots[k] ??= { first: new Date(r.wall0 * 1000).toISOString().slice(11, 19), n: 0, hosts: {}, status: {} });
    s.n++; s.hosts[host] = (s.hosts[host] ?? 0) + 1; s.status[r.status ?? r.failed ?? '?'] = (s.status[r.status ?? r.failed ?? '?'] ?? 0) + 1;
  }
  const lines = (consoleBy.get(p.ctx.sessionId) ?? []);
  const vis = await p.ctx.evaluate('document.visibilityState').catch(() => '?');
  console.log(`\n=== ${p.label} — opened ${p.openedAt} UTC (newest slot ${p.openedMod} s old, image gate 270 s), stayed ${Math.round(stayMs / 1000)} s, visibility ${vis}`);
  console.log(`requests total ${reqs.length}; RV at the DWD: ${dwdRv.length}; RV in the data repo: ${repoRv.length}`);
  for (const r of dwdRv) console.log(`  DWD  ${new Date(r.wall0 * 1000).toISOString().slice(11, 19)}  ${r.status ?? r.failed}  ${r.bytes ?? '?'} B  ${r.url.replace(base, '')}`);
  for (const [k, s] of Object.entries(slots)) console.log(`  repo ${k}  first ${s.first}  ${s.n} requests  hosts ${JSON.stringify(s.hosts)}  status ${JSON.stringify(s.status)}`);
  for (const l of lines.filter((l) => /RADOLAN-RV|Niederschlag-Layer/.test(l.text))) console.log(`  console ${l.at}  ${l.text.slice(0, 220)}`);
  const errs = lines.filter((l) => l.type === 'error');
  console.log(`  console errors: ${errs.length}${errs.length ? ' — ' + errs.slice(0, 3).map((e) => e.text.slice(0, 160)).join(' | ') : ''}`);
  await p.ctx.close();
}
await browser.close();
process.exit(0);
