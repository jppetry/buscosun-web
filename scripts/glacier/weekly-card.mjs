#!/usr/bin/env node
/**
 * GL-5 — weekly card (plan §10): the three most important changes of an ISO week as a 1200 × 630 PNG, `card/<year>-W<week>.png` in the glacier data repo,
 * shareable through the existing share line. Rendered by the headless Chromium the repo already uses for its other cards (`scripts/lib/headlessShot.mjs`, `OG_CHROME`),
 * no new dependency. Every row carries its origin; nothing on the card says more than the feed document.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/glacier/weekly-card.mjs --feed=<feed/<week>.json> --out=<card/<week>.png> [--chrome=<path>]
 *   … weekly-card.mjs --feed-dir=<out/feed> --card-dir=<out/card> --week=previous   (the workflow's Monday call: the card of the week that just ended,
 *   from the feed document of its last run — the Sunday run; nothing is rebuilt, so hot-day events of that week stay in)
 *   exit 3 = no browser found (the workflow treats it as "no card this week", the feed itself is not affected)
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findHeadlessChrome, openShooter } from '../lib/headlessShot.mjs';
import { GLACIER_ORIGIN_LABEL, glacierForbiddenWords } from '../../src/glacier/glacierContract.ts';
import { previousWeekKey } from '../../src/glacier/glacierFeedContract.ts';

export const CARD_W = 1200, CARD_H = 630;
const COLOUR = { measured: ['#4F6A3D', '#EFF3E8', '#5F7A4C'], satellite: ['#4B3D96', '#EEEBF8', '#6B5BB8'], model: ['#7A5418', '#FBF3E7', '#B8862F'], official: ['#2C2A26', '#EDE6D3', '#2C2A26'] };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "2026-W41" → "Woche 41 · 2026". */
export const weekLabel = (week) => { const m = /^(\d{4})-W(\d{2})$/.exec(week); return m ? `Woche ${Number(m[2])} · ${m[1]}` : week; };

/** The card as HTML (pure): the three events named by `doc.top`, in that order. */
export function cardHtml(doc) {
  const byId = new Map(doc.events.map((e) => [e.id, e]));
  const rows = doc.top.map((id) => byId.get(id)).filter(Boolean);
  const body = rows.length ? rows.map((e) => {
    const [fg, bg, dot] = COLOUR[e.origin] ?? COLOUR.official;
    return `<div class="row"><i style="background:${dot}"></i><div class="txt"><p>${esc(e.text)}</p><small>${esc(e.source)}</small></div><span class="chip" style="color:${fg};background:${bg};border-color:${dot}55">${esc(GLACIER_ORIGIN_LABEL[e.origin] ?? e.origin)}</span></div>`;
  }).join('') : '<p class="none">In dieser Woche gab es keine Änderung, die der Feed meldet.</p>';
  return `<!doctype html><html lang="de"><meta charset="utf-8"><style>
*{box-sizing:border-box}body{margin:0;width:${CARD_W}px;height:${CARD_H}px;background:#FAF6EA;color:#2C2A26;font-family:'League Spartan','Segoe UI','Helvetica Neue',Arial,sans-serif;display:flex;flex-direction:column;padding:44px 56px 36px;border-top:10px solid #1E87A8}
h1{margin:0;font-size:54px;font-weight:700;letter-spacing:-.5px;line-height:1.05}.sub{margin:6px 0 22px;font-size:26px;color:#5C5447}
.row{display:flex;align-items:center;gap:20px;padding:16px 0;border-top:1px solid #E0D6BE}.row i{width:12px;height:56px;border-radius:6px;flex:0 0 auto}
.txt{flex:1;min-width:0}.txt p{margin:0;font-size:29px;line-height:1.25;font-weight:600}.txt small{display:block;margin-top:5px;font-size:19px;color:#6F6553}
.chip{flex:0 0 auto;font-size:20px;font-weight:700;padding:6px 16px;border-radius:20px;border:2px solid}.none{font-size:30px;color:#5C5447}
.foot{margin-top:auto;display:flex;justify-content:space-between;font-size:20px;color:#6F6553;border-top:1px solid #E0D6BE;padding-top:14px}
</style><body><h1>Gletscher DACH</h1><div class="sub">${esc(weekLabel(doc.week))} · die wichtigsten Änderungen</div>${body}
<div class="foot"><span>buscosun.com/gletscher</span><span>Herkunft an jeder Zeile: amtlich · gemessen · Satellit · Modell</span></div></body></html>`;
}

/** Problems of a card's text (tour words); an empty list = fine. */
export const cardProblems = (doc) => doc.top.flatMap((id) => { const e = doc.events.find((x) => x.id === id); return e ? glacierForbiddenWords(`${e.text} ${e.source}`) : []; });

export async function renderCard({ doc, out, chrome }) {
  const bad = cardProblems(doc);
  if (bad.length) throw new Error(`Wort auf der Karte: ${bad.join(', ')}`);
  const path = chrome ?? findHeadlessChrome();
  if (!path) { const e = new Error('kein Browser (OG_CHROME oder --chrome)'); e.code = 3; throw e; }
  const dir = mkdtempSync(join(tmpdir(), 'gl-card-'));
  const html = join(dir, 'card.html');
  writeFileSync(html, cardHtml(doc));
  mkdirSync(dirname(resolve(out)), { recursive: true });
  const shooter = await openShooter(path);
  try { await shooter.shot(pathToFileURL(html).href, resolve(out), { width: CARD_W, height: CARD_H, settleMs: 300 }); }
  finally { await shooter.close(); rmSync(dir, { recursive: true, force: true }); }
  return { out: resolve(out), bytes: readFileSync(out).length };
}

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = /^--([^=]+)(?:=(.*))?$/.exec(a); return m ? [m[1], m[2] ?? '1'] : [a, '1']; }));
if (process.argv[1] && /(^|[\\/])weekly-card\.mjs$/.test(process.argv[1])) {
  let feed = args.feed, out = args.out;
  if (args.week === 'previous' && args['feed-dir'] && args['card-dir']) {
    const wk = previousWeekKey(Date.now());
    feed = join(args['feed-dir'], `${wk}.json`); out = join(args['card-dir'], `${wk}.png`);
    if (!existsSync(feed)) { console.error(`kein Feed der Woche ${wk} — keine Karte`); process.exit(0); }
  }
  if (!feed || !out) { console.error('--feed=<feed.json> --out=<card.png> (oder --feed-dir --card-dir --week=previous) fehlen'); process.exit(2); }
  const doc = JSON.parse(readFileSync(feed, 'utf8'));
  renderCard({ doc, out, chrome: args.chrome && existsSync(args.chrome) ? args.chrome : undefined })
    .then((r) => console.log(JSON.stringify(r))).catch((e) => { console.error(e.message ?? e); process.exit(e.code === 3 ? 3 : 1); });
}
