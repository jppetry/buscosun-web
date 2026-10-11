#!/usr/bin/env node
/**
 * GL-5 — change feed of the glacier line (plan §10): events with a stable id, origin, source and time, one document per ISO week.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/feed.mjs \
 *        --data=<v1 dir of the glacier data repo> --out=<dir> [--patch=<dir>] [--now=<iso>]
 *
 * Event types (each with the origin of its source, never another):
 *   snowline  a new clear scene moved the snow line by ≥ 100 m against the scene before (class A, satellite)
 *   newsnow   a scene carries the new-snow flag (satellite)
 *   heat      hot day by the model: freezing level above the glacier's median elevation AND melt index p50 ≥ 60 (model, index without unit)
 *   official  a curated official report from `official.json`, its sentence VERBATIM with the link (official)
 *   status    the authority's own "vanished"-type statement, with its criterion (official)
 * The `out` tree is everything that stays in `v1/feed/` and `v1/card/` (the last 12 weeks), ready for `glacier-publish --line=feed`.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { glacierStaticPath } from '../../src/glacier/glacierContract.ts';
import { glacierFlagsOfMask, glacierSatClass } from '../../src/glacier/glacierSatContract.ts';
import {
  GLACIER_FEED_KEEP_WEEKS, GLACIER_FEED_SNOWLINE_STEP_M, GLACIER_FEED_HEAT_INDEX, GLACIER_FEED_MAX_HEAT, GLACIER_FEED_ORIGIN, glacierFeedPath, glacierCardPath, feedProblems, isoWeekOf, isoWeekKey,
} from '../../src/glacier/glacierFeedContract.ts';

const J = (p) => JSON.parse(readFileSync(p, 'utf8'));
const readJson = (p) => { try { return J(p); } catch { return null; } };
const DAY = 86_400_000;
const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const fmt0 = (v) => Math.round(v).toLocaleString('de-DE').replace(/\./g, ' ');
const slug = (id) => id.replace(/^gl_/, '').replace('_', '-');
/** As the page names it: the inventory name, or "namenlos · <inventory id>" for a nameless glacier. */
const nameOf = (g) => g.name ?? `namenlos · ${g.inv?.sgi ?? g.inv?.agi5 ?? g.inv?.rgi6 ?? g.id}`;

/** Snow-line events of one season: consecutive scenes of class A with a line, not flagged as new snow, ≥ 100 m apart; the event belongs to the newer scene. */
export function snowlineEvents(rowsById, byId, fromIso, toIso) {
  const out = [];
  for (const [id, rows] of Object.entries(rowsById)) {
    const g = byId.get(id);
    if (!g || glacierSatClass(g) !== 'A') continue;
    const scenes = rows.filter((r) => r[3] === 1 && r[4] != null && !glacierFlagsOfMask(r[8] ?? 0).includes('neuschnee')).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (let i = 1; i < scenes.length; i++) {
      const d = scenes[i][4] - scenes[i - 1][4];
      const at = scenes[i][0];
      if (Math.abs(d) < GLACIER_FEED_SNOWLINE_STEP_M || at < fromIso || at > toIso) continue;
      out.push({
        id: `ev_snowline_${slug(id)}_${at}`, type: 'snowline', at, glacier: id, origin: GLACIER_FEED_ORIGIN.snowline, w: 30 + Math.min(40, Math.abs(d) / 20),
        text: `${nameOf(g)}: Schneegrenze am ${dm(at)} bei ${fmt0(scenes[i][4])} m, ${d > 0 ? '+' : '−'}${fmt0(Math.abs(d))} m gegen die Szene vom ${dm(scenes[i - 1][0])}`,
        source: 'Sentinel-2 L2A (Copernicus), Maske ≥ 70 % klar',
      });
    }
  }
  return out;
}

/** New-snow events: a scene of class A/B carrying the flag. */
export function newsnowEvents(rowsById, byId, fromIso, toIso) {
  const out = [];
  for (const [id, rows] of Object.entries(rowsById)) {
    const g = byId.get(id);
    if (!g || !glacierSatClass(g)) continue;
    for (const r of rows) {
      if (r[0] < fromIso || r[0] > toIso || !glacierFlagsOfMask(r[8] ?? 0).includes('neuschnee')) continue;
      out.push({
        id: `ev_newsnow_${slug(id)}_${r[0]}`, type: 'newsnow', at: r[0], glacier: id, origin: GLACIER_FEED_ORIGIN.newsnow, w: 20,
        text: `${nameOf(g)}: Szene vom ${dm(r[0])} zeigt frischen Schnee${r[3] === 1 && r[4] != null ? `, Schneegrenze bei ${fmt0(r[4])} m` : ''}`,
        source: 'Sentinel-2 L2A (Copernicus), Neuschnee aus dem Vergleich zweier Szenen',
      });
    }
  }
  return out;
}

/** Hot days by the model: the strongest `GLACIER_FEED_MAX_HEAT` of the run (freezing level above the median elevation AND index p50 of day 0 ≥ 60). Index, never a unit. */
export function heatEvents(meltDoc, byId, fromIso, toIso) {
  if (!meltDoc) return [];
  const at = meltDoc.runAt.slice(0, 10);
  if (at < fromIso || at > toIso) return [];
  const rows = [];
  for (const r of meltDoc.glaciers) {
    const g = byId.get(r.id);
    if (!g || r.zf?.[0] == null || r.zf[0] <= g.z[1] || r.idx[0][1] < GLACIER_FEED_HEAT_INDEX) continue;
    rows.push({ r, g });
  }
  rows.sort((a, b) => b.r.idx[0][1] - a.r.idx[0][1]);
  return rows.slice(0, GLACIER_FEED_MAX_HEAT).map(({ r, g }) => ({
    id: `ev_heat_${slug(g.id)}_${at}`, type: 'heat', at, glacier: g.id, origin: GLACIER_FEED_ORIGIN.heat, w: 25 + r.idx[0][1] / 4,
    text: `${nameOf(g)}: Hitzetag nach Modell — Nullgradgrenze bis ${fmt0(r.zf[0])} m, über der Medianhöhe ${fmt0(g.z[1])} m; Schmelzindex ${r.idx[0][1]} von 100 (ohne Einheit)`,
    source: `${meltDoc.engine.name}, Temperaturindex-Modell, Lauf ${dm(at)} ${meltDoc.runAt.slice(11, 16)} UTC`,
  }));
}

/** Curated official items of the window: the authority's sentence verbatim with its link; "status" items only with the criterion. */
export function officialEvents(items, fromIso, toIso) {
  const out = [];
  for (const it of items) {
    if (it.date < fromIso || it.date > toIso) continue;
    const status = it.kind === 'status';
    if (status && !it.criterion) continue;
    out.push({
      id: `ev_${status ? 'status' : 'official'}_${it.id}_${it.date}`, type: status ? 'status' : 'official', at: it.date, glacier: null, origin: 'official', w: status ? 90 : 80,
      text: `${it.title}${it.period ? ` (${it.period})` : ''}`, source: it.source, url: it.url, quote: it.quote,
    });
  }
  return out;
}

/** Order for the weekly card: weight, then newer first, then id — deterministic. */
export const rankEvents = (events) => [...events].sort((a, b) => b.w - a.w || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0) || (a.id < b.id ? -1 : 1));

/** The feed document of one ISO week from the sources; `top` = the three most important events, at most one per glacier. */
export function buildFeed({ weekKey, fromIso, toIso, nowMs, rowsById, byId, meltDoc, official }) {
  const events = [...officialEvents(official, fromIso, toIso), ...snowlineEvents(rowsById, byId, fromIso, toIso), ...newsnowEvents(rowsById, byId, fromIso, toIso), ...heatEvents(meltDoc, byId, fromIso, toIso)];
  const seen = new Set();
  const uniq = rankEvents(events).filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  // the three most important: one per KIND first (report, hot day, snow line, new snow — in the order of their best weight), then the rest by weight; one glacier once
  const kind = (e) => (e.type === 'status' ? 'official' : e.type);
  const top = [], gl = new Set();
  const take = (e) => { if (top.length >= 3 || top.includes(e.id) || (e.glacier && gl.has(e.glacier))) return; if (e.glacier) gl.add(e.glacier); top.push(e.id); };
  const firstOf = new Map();
  for (const e of uniq) if (!firstOf.has(kind(e))) firstOf.set(kind(e), e);
  for (const e of rankEvents([...firstOf.values()])) take(e);
  for (const e of uniq) take(e);
  return { schema: 1, kind: 'glacier/feed', week: weekKey, builtAt: new Date(nowMs).toISOString(), events: uniq, top };
}

export async function main(opts) {
  const dataDir = resolve(opts.data), outDir = resolve(opts.out);
  const patchDir = resolve(opts.patch ?? join(dirname(outDir), 'patch'));
  const nowMs = opts.now ? Date.parse(opts.now) : Date.now();
  const log = opts.log ?? (() => {});
  const index = J(join(dataDir, 'index.json'));
  const build = index.static.build;
  const cat = J(join(dataDir, glacierStaticPath(build, 'catalog.json'))).glaciers;
  const byId = new Map(cat.map((g) => [g.id, g]));
  const official = J(join(dataDir, glacierStaticPath(build, 'official.json'))).items;
  // season rows of the newest year per glacier (all regions the index names)
  const rowsById = {};
  const years = Object.keys(index.sat?.seasons ?? {}).sort();
  for (const y of years.slice(-1)) for (const [region, stand] of Object.entries(index.sat.seasons[y])) {
    const d = readJson(join(dataDir, 'season', y, region, `${stand}.json`));
    for (const [id, rows] of Object.entries(d?.glaciers ?? {})) rowsById[id] = rows;
  }
  const meltDoc = index.melt?.run ? readJson(join(dataDir, 'melt', `${index.melt.run}.json`)) : null;
  const w = isoWeekOf(nowMs);
  const weekKey = isoWeekKey(nowMs);
  const fromIso = new Date(w.monday).toISOString().slice(0, 10), toIso = new Date(nowMs).toISOString().slice(0, 10);
  // official reports of the last 30 days also stand in the current week's list — a report is news for a month, not for a day
  const officialFrom = new Date(nowMs - 30 * DAY).toISOString().slice(0, 10);
  const doc = buildFeed({ weekKey, fromIso, toIso, nowMs, rowsById, byId, meltDoc, official });
  doc.events.push(...officialEvents(official, officialFrom, fromIso).filter((e) => e.at < fromIso).map((e) => ({ ...e })));
  const seen = new Set();
  doc.events = rankEvents(doc.events).filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true)));
  const problems = feedProblems(doc, official, new Set(byId.keys()));
  if (problems.length) throw new Error(`Vertrag verletzt: ${problems.slice(0, 5).join('; ')}`);
  mkdirSync(join(outDir, 'feed'), { recursive: true });
  mkdirSync(join(outDir, 'card'), { recursive: true });
  // keep the last weeks (feed documents and cards) already in the data repo
  const keepWeeks = new Set([weekKey]);
  const have = (sub, ext) => (existsSync(join(dataDir, sub)) ? readdirSync(join(dataDir, sub)).filter((f) => new RegExp(`^\\d{4}-W\\d{2}\\.${ext}$`).test(f)).map((f) => f.replace(`.${ext}`, '')) : []);
  for (const wk of [...new Set([...have('feed', 'json'), ...have('card', 'png')])].sort().slice(-GLACIER_FEED_KEEP_WEEKS)) keepWeeks.add(wk);
  for (const wk of [...keepWeeks].sort().slice(-GLACIER_FEED_KEEP_WEEKS)) {
    if (wk !== weekKey && existsSync(join(dataDir, glacierFeedPath(wk)))) copyFileSync(join(dataDir, glacierFeedPath(wk)), join(outDir, glacierFeedPath(wk)));
    if (existsSync(join(dataDir, glacierCardPath(wk)))) copyFileSync(join(dataDir, glacierCardPath(wk)), join(outDir, glacierCardPath(wk)));
  }
  writeFileSync(join(outDir, glacierFeedPath(weekKey)), JSON.stringify(doc));
  mkdirSync(patchDir, { recursive: true });
  // the newest weekly card that exists (the Monday step renders the card of the week that just ended; the pointer follows with the next run)
  const cards = readdirSync(join(outDir, 'card')).filter((f) => /^\d{4}-W\d{2}\.png$/.test(f)).map((f) => f.slice(0, -4)).sort();
  // the weeks that have a feed document, newest first (the page reads the first two — it never asks for a week that does not exist)
  const weeks = readdirSync(join(outDir, 'feed')).filter((f) => /^\d{4}-W\d{2}\.json$/.test(f)).map((f) => f.slice(0, -5)).sort().reverse();
  writeFileSync(join(patchDir, 'index-patch.json'), JSON.stringify({ feed: { week: weekKey, builtAt: doc.builtAt, n: doc.events.length, card: cards.length ? cards[cards.length - 1] : null, weeks } }));
  writeFileSync(join(patchDir, 'status-patch.json'), JSON.stringify({ lines: { feed: { at: doc.builtAt, week: weekKey, events: doc.events.length } } }));
  log(`${weekKey}: ${doc.events.length} Ereignisse, Spitze ${doc.top.length}`);
  return { week: weekKey, events: doc.events.length, top: doc.top, outDir, patchDir };
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
if (process.argv[1] && /(^|[\\/])feed\.mjs$/.test(process.argv[1])) {
  if (!args.data || !args.out) { console.error('--data=<v1> --out=<Ordner> fehlen'); process.exit(2); }
  main({ data: args.data, out: args.out, patch: args.patch, now: args.now, log: (m) => console.error(m) }).then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.message ?? e); process.exit(1); });
}
