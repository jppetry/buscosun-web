/**
 * index.mjs — AP10a: writes <HINDCAST_ROOT>/index.json (kind hindcast/index) from what is ON DISK (never from
 * memory): slots per day and tier with route, sources and the planes that carry values; truth days; cache files and
 * bytes per source and route; transfer totals from log\. The verification stamp (verify-hindcast.mjs) is kept.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/hindcast/index.mjs
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { HINDCAST_ROOT } from './lib/common.mjs';
import { parseHindcastSlot } from './lib/slotio.mjs';

const root = HINDCAST_ROOT;
const ls = (d) => (existsSync(d) ? readdirSync(d) : []);

/**
 * Per-slot facts (tiers, routes, sources, planes with values) are memoised in index-slots.json keyed by path + size +
 * mtime — a slot is parsed once, not on every index refresh (5 000 slots × 0,5 s would be 40 min).
 */
function slotsInventory() {
  const memoP = join(root, 'index-slots.json');
  const memo = existsSync(memoP) ? JSON.parse(readFileSync(memoP, 'utf8')) : {};
  const next = {};
  const perTier = {};
  let count = 0, bytes = 0;
  const days = [];
  for (const d of ls(join(root, 'slots')).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort()) {
    const files = ls(join(root, 'slots', d)).filter((f) => /^\d{4}\.json\.gz$/.test(f)).sort();
    if (!files.length) continue;
    days.push(d);
    for (const f of files) {
      const p = join(root, 'slots', d, f);
      const st = statSync(p);
      count++; bytes += st.size;
      const key = `${d}/${f}`, stamp = `${st.size}@${st.mtimeMs}`;
      let facts = memo[key]?.stamp === stamp ? memo[key].facts : null;
      if (!facts) {
        let s; try { s = parseHindcastSlot(readFileSync(p)); } catch { continue; }
        facts = Object.fromEntries(Object.entries(s.cube).map(([t, c]) => {
          const planes = new Set();
          for (const bp of Object.values(c.byPoint)) if (bp) for (const k of Object.keys(bp.planes)) planes.add(k);
          return [t, { route: c.route, sources: c.sources.map((x) => x.id), planes: [...planes] }];
        }));
      }
      next[key] = { stamp, facts };
      for (const [t, c] of Object.entries(facts)) {
        const a = (perTier[t] ??= { slots: 0, firstDay: d, lastDay: d, routes: {}, sources: {}, planesWithValues: new Set() });
        a.slots++; a.lastDay = d; a.routes[c.route] = (a.routes[c.route] ?? 0) + 1;
        for (const id of c.sources) a.sources[id] = (a.sources[id] ?? 0) + 1;
        for (const k of c.planes) a.planesWithValues.add(k);
      }
    }
  }
  writeFileSync(memoP, JSON.stringify(next));
  for (const a of Object.values(perTier)) a.planesWithValues = [...a.planesWithValues];
  return { count, bytes, days: { count: days.length, first: days[0] ?? null, last: days.at(-1) ?? null }, perTier };
}

/** Raw downloads of the truth side (cache/truth/<net>/…, ZIP/CSV as fetched): files and bytes per network. */
function truthCacheInventory() {
  const out = {};
  const walk = (d, key) => { for (const f of ls(d)) { const p = join(d, f); const st = statSync(p); if (st.isDirectory()) walk(p, key); else { const a = (out[key] ??= { files: 0, bytes: 0 }); a.files++; a.bytes += st.size; } } };
  for (const net of ls(join(root, 'cache', 'truth'))) { const p = join(root, 'cache', 'truth', net); if (statSync(p).isDirectory()) walk(p, net); }
  return out;
}

function cacheInventory() {
  const out = {};
  for (const src of ls(join(root, 'cache')).filter((x) => !x.includes('.') && !x.startsWith('_') && x !== 'truth')) {
    const dir = join(root, 'cache', src);
    for (const v of ls(dir)) {
      const vd = join(dir, v);
      if (!statSync(vd).isDirectory()) continue;
      const routes = src.startsWith('dyn-') ? { dyn: vd } : Object.fromEntries(ls(vd).map((r) => [r, join(vd, r)]).filter(([, p]) => statSync(p).isDirectory()));
      for (const [r, rd] of Object.entries(routes)) {
        const files = ls(rd).filter((f) => f.endsWith('.hcv.gz'));
        const k = `${src}|${r}`;
        const a = (out[k] ??= { source: src, route: r, vars: 0, files: 0, bytes: 0, first: null, last: null });
        a.vars++; a.files += files.length;
        for (const f of files) a.bytes += statSync(join(rd, f)).size;
        const keys = files.map((f) => f.replace('.hcv.gz', '')).sort();
        if (keys.length) { a.first = a.first && a.first < keys[0] ? a.first : keys[0]; a.last = a.last && a.last > keys.at(-1) ? a.last : keys.at(-1); }
      }
    }
  }
  return Object.values(out);
}

function transferFromLogs() {
  const out = {};
  for (const f of ls(join(root, 'log')).filter((x) => x.endsWith('.jsonl'))) {
    for (const line of readFileSync(join(root, 'log', f), 'utf8').split('\n')) {
      if (!line.startsWith('{')) continue;
      let r; try { r = JSON.parse(line); } catch { continue; }
      if (r.ev === 'summary' && r.net) {   // extract_truth.mjs: one summary per run, transfer per network
        for (const [net, v] of Object.entries(r.net)) {
          const a = (out[`truth ${net}`] ??= { runs: 0, read: 0, bytes: 0, requests: 0, seconds: 0 });
          a.runs++; a.read += v.requests ?? 0; a.bytes += v.bytes ?? 0; a.requests += v.requests ?? 0; a.seconds += v.seconds ?? 0;
        }
        continue;
      }
      if (r.kind !== 'summary') continue;
      const k = r.model ? `open-meteo ${r.model} ${r.route}` : r.ds ? `dynamical ${r.ds}` : r.network ? `truth ${r.network}` : 'other';
      const a = (out[k] ??= { runs: 0, read: 0, bytes: 0, requests: 0, seconds: 0 });
      a.runs++; a.read += r.read ?? 0; a.bytes += r.bytes ?? 0; a.requests += r.requests ?? 0; a.seconds += r.s ?? 0;
    }
  }
  return out;
}

const prev = existsSync(join(root, 'index.json')) ? JSON.parse(readFileSync(join(root, 'index.json'), 'utf8')) : {};
const truthDays = ls(join(root, 'truth')).filter((f) => /^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f)).sort();
const idx = {
  schema: 1, kind: 'hindcast/index', updatedAt: new Date().toISOString(),
  what: 'Lokales Hindcast-Archiv von buscosun Fusion (AP10a): Pseudo-Cube-Slots aus fremden Vorhersagearchiven + Wahrheit dreier Netze. Provenienz `hindcast`, nie `measured` (E-F-23).',
  slots: slotsInventory(),
  truth: { days: truthDays.length, first: truthDays[0]?.slice(0, 10) ?? null, last: truthDays.at(-1)?.slice(0, 10) ?? null },
  igra: ls(join(root, 'igra')).filter((f) => f.endsWith('.json.gz')).length,
  cache: cacheInventory(),
  truthCache: truthCacheInventory(),
  transfer: transferFromLogs(),
  verification: prev.verification ?? null,
};
writeFileSync(join(root, 'index.json'), `${JSON.stringify(idx, null, 1)}\n`);
console.log(`[index] ${idx.slots.count} Slots (${(idx.slots.bytes / 2 ** 30).toFixed(2)} GiB) an ${idx.slots.days.count} Tagen · Wahrheit ${idx.truth.days} Tage · Cache ${idx.cache.reduce((a, c) => a + c.files, 0)} Dateien ${(idx.cache.reduce((a, c) => a + c.bytes, 0) / 2 ** 30).toFixed(2)} GiB`);
