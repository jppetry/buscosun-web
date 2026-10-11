#!/usr/bin/env node
/**
 * GL-2 — rebuilds the index pointer of the satellite line from a tree of `obs/` and `season/` documents (after a backfill of several windows, or to repair a pointer):
 * newest scene date per tile and the newest stand per year and region. Writes the same patch files `sat-scan.mjs` writes (`index-patch.json`, `status-patch.json`).
 *
 *   node scripts/glacier/sat-reindex.mjs --tree=<dir with obs/ and season/> --patch=<dir>
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** `{ newest: { tile: 'YYYY-MM-DD' }, seasons: { year: { region: stand } }, docs, values }` of a tree. */
export function reindex(tree) {
  const newest = {}, seasons = {};
  let docs = 0, values = 0;
  const obs = join(tree, 'obs');
  for (const y of existsSync(obs) ? readdirSync(obs) : []) for (const t of readdirSync(join(obs, y))) for (const f of readdirSync(join(obs, y, t))) {
    if (!f.endsWith('.json')) continue;
    const date = f.slice(0, -5);
    if (!newest[t] || date > newest[t]) newest[t] = date;
    docs++;
    try { values += Object.keys(JSON.parse(readFileSync(join(obs, y, t, f), 'utf8')).items ?? {}).length; } catch { /* a damaged file counts as a document without values */ }
  }
  const season = join(tree, 'season');
  for (const y of existsSync(season) ? readdirSync(season) : []) for (const r of readdirSync(join(season, y))) {
    const stands = readdirSync(join(season, y, r)).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
    if (stands.length) (seasons[y] ??= {})[r] = stands[stands.length - 1];
  }
  return { newest, seasons, docs, values };
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
if (process.argv[1] && /(^|[\\/])sat-reindex\.mjs$/.test(process.argv[1])) {
  if (!args.tree || !args.patch) { console.error('--tree=<dir> --patch=<dir> fehlen'); process.exit(2); }
  const r = reindex(resolve(args.tree));
  const at = new Date().toISOString();
  mkdirSync(resolve(args.patch), { recursive: true });
  writeFileSync(join(resolve(args.patch), 'index-patch.json'), JSON.stringify({ sat: { updatedAt: at, newest: r.newest, seasons: r.seasons } }));
  writeFileSync(join(resolve(args.patch), 'status-patch.json'), JSON.stringify({ lines: { sat: { at, docs: r.docs, values: r.values } } }));
  console.log(JSON.stringify({ docs: r.docs, values: r.values, tiles: Object.keys(r.newest).length, years: Object.keys(r.seasons) }));
}
