#!/usr/bin/env node
/**
 * GM-11 (V-GM-139, bridge until the archive carries the forcing) — copies every glacier melt run that buscosun-data still holds and the local cache
 * does not into `<cache>/runs/<run>/`: the weather document and hourly chunks (`melt/wx/<run>[.json]`), the snowpack rows (`snowpack/<run>.json`), the
 * pairs (`snowpack/pairs/<run>.json`) and the status line as it stands at that commit. Read only against GitHub: one commit is fixed first (the head of
 * `main`), every file is read through raw.githubusercontent at that commit and checked against its blob hash; a file that fails is not kept.
 * Nothing is written anywhere but the cache. Unauthenticated GitHub API: about 6 calls per run listed (60 per hour).
 *
 *   node audit/gletscher-schneemodell/gm11-save-runs.mjs [--cache=C:\dev\buscosun-glacier-cache\gm11] [--from=2026112417]
 *
 * Also copies `precipsum/v1/<dir>/sum-024h.png` + `latest.json` of the newest precipsum run (the product keeps three runs = 3 h) into
 * `<cache>/precipsum/<dir>/` when it ends at 17 UTC, so that every 17-UTC window keeps its independent precipitation.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '1']; }));
const cache = args.cache ?? 'C:\\dev\\buscosun-glacier-cache\\gm11';
const from = args.from ?? '2026112417';
const REPO = 'jppetry/buscosun-data';
const api = async (p) => { const r = await fetch(`https://api.github.com/repos/${REPO}/${p}`, { headers: { 'User-Agent': 'buscosun-cache' } }); if (!r.ok) throw new Error(`API ${p}: ${r.status}`); return r.json(); };
const blobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const log = [];
const head = (await api('commits/main')).sha;
const list = async (path) => { try { return await api(`contents/${path}?ref=${head}`); } catch (e) { if (/404/.test(e.message)) return []; throw e; } };
async function save(entry, dst) {
  if (existsSync(dst) && blobSha(readFileSync(dst)) === entry.sha) return 'held';
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${head}/${entry.path}`);
  if (!r.ok) return `raw ${r.status}`;
  const buf = Buffer.from(await r.arrayBuffer());
  if (blobSha(buf) !== entry.sha) return 'hash';
  mkdirSync(dirname(dst), { recursive: true }); writeFileSync(dst, buf); return 'saved';
}
const wx = await list('glacier/v1/melt/wx'), sp = await list('glacier/v1/snowpack'), pr = await list('glacier/v1/snowpack/pairs');
const runs = [...new Set(wx.filter((e) => e.type === 'dir' && /^\d{10}$/.test(e.name)).map((e) => e.name))].filter((r) => r >= from).sort();
const status = (await list('glacier/v1/status.json'));
let bytes = 0;
for (const run of runs) {
  const dir = join(cache, 'runs', run);
  const files = [];
  const chunks = await list(`glacier/v1/melt/wx/${run}`);
  for (const c of chunks) files.push([c, join(dir, 'wx', c.name)]);
  const day = wx.find((e) => e.name === `${run}.json`); if (day) files.push([day, join(dir, 'wx.json')]);
  const s = sp.find((e) => e.name === `${run}.json`); if (s) files.push([s, join(dir, 'snowpack.json')]);
  const p = pr.find((e) => e.name === `${run}.json`); if (p) files.push([p, join(dir, 'pairs.json')]);
  const out = {};
  for (const [e, dst] of files) { const k = await save(e, dst); out[k] = (out[k] ?? 0) + 1; if (k === 'saved') bytes += e.size; }
  log.push({ run, files: files.length, ...out });
}
// the station mapping each pairs file names (for the positions of the stations)
for (const run of runs) {
  const pf = join(cache, 'runs', run, 'pairs.json'); if (!existsSync(pf)) continue;
  const ver = JSON.parse(readFileSync(pf, 'utf8')).stations?.map; if (!ver) continue;
  const e = (await list('glacier/v1/stn/map')).find((x) => x.name === `${ver}.json`);
  if (e) log.push({ map: ver, result: await save(e, join(cache, 'map', `${ver}.json`)) });
  break;
}
// the status line at this commit (one file under a fixed path: kept per commit)
if (status?.sha) { const k = await save(status, join(cache, 'status', `${head.slice(0, 8)}.json`)); log.push({ status: head.slice(0, 8), result: k }); }
// precipsum: the newest run, if it ends at 17 UTC
const latest = await list('precipsum/v1/latest.json');
if (latest?.sha) {
  const r = await fetch(`https://raw.githubusercontent.com/${REPO}/${head}/precipsum/v1/latest.json`); const lj = await r.json();
  if (/T17:00:00/.test(lj.end)) {
    const dirE = (await list(`precipsum/v1/${lj.dir}`)).find((e) => e.name === 'sum-024h.png');
    if (dirE) { const k = await save(dirE, join(cache, 'precipsum', lj.dir, 'sum-024h.png')); writeFileSync(join(cache, 'precipsum', lj.dir, 'latest.json'), JSON.stringify(lj, null, 1)); log.push({ precipsum: lj.dir, result: k }); }
  } else log.push({ precipsum: lj.dir, result: 'not a 17-UTC end, skipped' });
}
const manifest = join(cache, 'saves.jsonl');
mkdirSync(cache, { recursive: true });
writeFileSync(manifest, (existsSync(manifest) ? readFileSync(manifest, 'utf8') : '') + JSON.stringify({ at: new Date().toISOString(), commit: head, bytes, log }) + '\n');
console.log(JSON.stringify({ commit: head, runs: runs.length, bytes, log }, null, 1));
