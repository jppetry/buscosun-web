// Phase SE — collector for the truth data of the non-precipitation echo filter (`audit/radar-stoerecho.md` §3).
// The DWD keeps site sweeps, px250, RV and HymecNG for 48 h; this script copies, per RV slot, into
// `<store>/<YYYYMMDD_HHMM>/`:
//   rv.tar                 composite_rv_<slot>.tar            (analysis + 24 leads, ODIM-HDF5)
//   hymec.h5               composite_HymecNG_<slot>_000-hd5    (DWD hydrometeor class, same 1-km grid)
//   px250-<site>.h5        sites/px250/<site>/…                (Cartesian 250-m DBZH of the precipitation scan)
//   rhohv-<site>.h5        sites/sweep_pcp_rhohv/<site>/unfiltered/…urhohv_00-<slot>SSss…   (polar, 360 × 600 × 250 m)
//   dbzh-<site>.h5         sites/sweep_pcp_z/<site>/hdf5/filter_polarimetric/…dbzh_00-<slot>SSss…
//   zdr-<site>.h5          sites/sweep_pcp_zdr/<site>/unfiltered/…   (only with --zdr)
// The sweep names carry the scan seconds (…223534 00), so each site directory is listed once per run (and again per
// slot in --follow). A file that exists is not fetched again; a 404 is written to `<slot>/missing.txt`.
// Usage: node audit/radar-stoerecho/collect.mjs <store> --from=YYYYMMDDHHMM --to=YYYYMMDDHHMM [--step=10] [--parallel=6]
//        [--order=asc|desc] [--zdr] [--follow]      (--follow: after the range, keep taking every new slot of the step)
import { existsSync, mkdirSync, writeFileSync, appendFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [store, ...rest] = process.argv.slice(2);
if (!store) { console.error('usage: collect.mjs <store> --from=… --to=… [--step=10] [--parallel=6] [--order=asc|desc] [--zdr] [--follow]'); process.exit(2); }
const opt = Object.fromEntries(rest.map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? '1']; }));
const STEP = +(opt.step ?? 10), PAR = +(opt.parallel ?? 6);
const BASE = 'https://opendata.dwd.de/weather/radar';
const UA = { 'user-agent': 'buscosun-radar-truth (buscosun-web/audit/radar-stoerecho.md)' };
const SITES = [['asb', 10103], ['boo', 10132], ['drs', 10488], ['eis', 10780], ['ess', 10410], ['fbg', 10908], ['fld', 10440], ['hnr', 10339], ['isn', 10873], ['mem', 10950], ['neu', 10557], ['nhb', 10605], ['oft', 10629], ['pro', 10392], ['ros', 10169], ['tur', 10832], ['umd', 10356]];
const SWEEPS = [['rhohv', (s) => `sites/sweep_pcp_rhohv/${s}/unfiltered/`, 'urhohv'], ['dbzh', (s) => `sites/sweep_pcp_z/${s}/hdf5/filter_polarimetric/`, 'dbzh']];
if (opt.zdr) SWEEPS.push(['zdr', (s) => `sites/sweep_pcp_zdr/${s}/unfiltered/`, 'uzdr']);

const parse = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10), +s.slice(10, 12));
const fmt = (ms) => new Date(ms).toISOString().replace(/[-:T]/g, '').slice(0, 12);
const mkdirp = (p) => mkdirSync(p, { recursive: true });
mkdirp(store);

async function get(url, tries = 3) {
  for (let t = 1; ; t++) {
    try {
      const r = await fetch(url, { headers: UA });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    } catch (e) { if (t >= tries) throw new Error(`${url}: ${e.message}`); await new Promise((res) => setTimeout(res, 1500 * t)); }
  }
}
async function pool(jobs, n) {
  let i = 0; const out = [];
  await Promise.all(Array.from({ length: n }, async () => { while (i < jobs.length) { const k = i++; try { out[k] = await jobs[k](); } catch (e) { out[k] = { error: e.message }; } } }));
  return out;
}

/** listing cache: dir → Map(minuteStamp YYYYMMDDHHMM → file name) */
const listings = new Map();
async function listDir(dir, key) {
  const html = (await get(`${BASE}/${dir}`))?.toString('latin1') ?? '';
  const m = new Map();
  for (const x of html.matchAll(new RegExp(`href="([^"]*_${key}_00-(\\d{12})\\d{4}-[a-z]{3}-\\d+-hd5)"`, 'g'))) m.set(x[2], x[1]);
  listings.set(dir, m);
  return m;
}
async function refreshListings() {
  const jobs = [];
  for (const [site] of SITES) for (const [, dirOf, key] of SWEEPS) jobs.push(() => listDir(dirOf(site), key));
  await pool(jobs, PAR);
}

async function takeSlot(ms) {
  const stamp = fmt(ms), day = stamp.slice(0, 8), hm = stamp.slice(8);
  const dir = join(store, `${day}_${hm}`); mkdirp(dir);
  const want = [['rv.tar', `${BASE}/composite/rv/composite_rv_${day}_${hm}.tar`], ['hymec.h5', `${BASE}/composite/hymecng/composite_HymecNG_${day}_${hm}_000-hd5`]];
  for (const [site, wmo] of SITES) {
    want.push([`px250-${site}.h5`, `${BASE}/sites/px250/${site}/rab02-tt_${wmo}-${stamp}00-de${site}-hd5`]);
    for (const [tag, dirOf, key] of SWEEPS) {
      const d = dirOf(site); const name = listings.get(d)?.get(stamp);
      want.push([`${tag}-${site}.h5`, name ? `${BASE}/${d}${name}` : null, `${key} ${site}: kein Eintrag für ${stamp} im Listing`]);
    }
  }
  let got = 0, had = 0, miss = 0, bytes = 0; const missing = [];
  await pool(want.map(([file, url, why]) => async () => {
    const p = join(dir, file);
    if (existsSync(p) && statSync(p).size > 0) { had++; return; }
    if (!url) { miss++; missing.push(`${file}\t${why}`); return; }
    const buf = await get(url).catch((e) => { missing.push(`${file}\t${e.message}`); return undefined; });
    if (buf === undefined) { miss++; return; }
    if (buf === null) { miss++; missing.push(`${file}\t404 ${url}`); return; }
    writeFileSync(p, buf); got++; bytes += buf.length;
  }), PAR);
  if (missing.length) appendFileSync(join(dir, 'missing.txt'), `# ${new Date().toISOString()}\n${missing.join('\n')}\n`);
  console.log(`${new Date().toISOString().slice(11, 19)} ${day}_${hm}: neu ${got} (${(bytes / 1048576).toFixed(1)} MB) · schon da ${had} · fehlt ${miss}`);
  return { got, miss };
}

const from = parse(opt.from), to = parse(opt.to);
const slots = []; for (let t = from; t <= to; t += STEP * 60000) slots.push(t);
if (opt.order === 'desc') slots.reverse();
console.log(`Sammler: ${slots.length} Slots ${fmt(from)} … ${fmt(to)} alle ${STEP} min, ${opt.order ?? 'asc'}, → ${store}`);
await refreshListings();
for (const t of slots) await takeSlot(t);
if (opt.follow) {
  let next = to + STEP * 60000;
  for (;;) {
    // the RV tar of a slot is on the server ≈ 3–4 min after the slot; the sweeps ≈ 1 min after
    const wait = next + 5 * 60000 - Date.now();
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    await refreshListings();
    const r = await takeSlot(next).catch((e) => { console.log(`Slot ${fmt(next)}: ${e.message}`); return null; });
    if (r && r.miss > 0) { await new Promise((res) => setTimeout(res, 90000)); await refreshListings(); await takeSlot(next).catch(() => null); }
    next += STEP * 60000;
  }
}
