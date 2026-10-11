/**
 * verify:glacier-feed — Phase GL, package GL-5 (audit/gletscher.md §GL-5): the change feed and the weekly card against REAL documents (the nine official items,
 * the satellite season rows of the first scan window, the rows of a real melt run): event types with their own origin, stable ids, the authority's sentence
 * verbatim, "status" only with the criterion, hot days as an index without a unit, ISO weeks, retention of 12 weeks, the card's HTML and — where a browser
 * exists — the rendered PNG. Every rule with a negative control.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs scripts/verify-glacier-feed.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snowlineEvents, newsnowEvents, heatEvents, officialEvents, buildFeed, rankEvents, main } from './glacier/feed.mjs';
import { cardHtml, cardProblems, renderCard, weekLabel, CARD_W, CARD_H } from './glacier/weekly-card.mjs';
import { feedProblems, isoWeekKey, isoWeekOf, previousWeekKey, GLACIER_FEED_ORIGIN, GLACIER_FEED_KEEP_WEEKS } from '../src/glacier/glacierFeedContract.ts';
import { glacierFlagsMask } from '../src/glacier/glacierSatContract.ts';
import { findHeadlessChrome } from './lib/headlessShot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FXD = join(HERE, 'lib', 'fixtures', 'glacier');
const STATIC = JSON.parse(readFileSync(join(FXD, 'static-extract.json'), 'utf8'));
const SAT = JSON.parse(readFileSync(join(FXD, 'sat-extract.json'), 'utf8'));
const SHEET = JSON.parse(readFileSync(join(FXD, 'sheet-extract.json'), 'utf8'));
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });
const clone = (x) => JSON.parse(JSON.stringify(x));

const cat = Object.values(STATIC.catalogRows);
const byId = new Map(cat.map((g) => [g.id, g]));
const official = STATIC.official.items;
const NOW = Date.parse('2026-10-11T12:00:00Z');
const rowsById = { ...Object.fromEntries(Object.values(SAT.seasons).flatMap((d) => Object.entries(d.glaciers))) };
const hefId = STATIC.catalogRows.hef.id;
const WEEK = { from: '2026-09-28', to: '2026-10-11' };   // two ISO weeks of the fixture's scenes

// W — ISO weeks
add('W1 ISO-Wochen: 11.10.2026 (Sonntag) = 2026-W41, 12.10. = W42; 01.01.2026 = W01; 30.12.2024 = 2025-W01; 03.01.2027 = 2026-W53; Montag der Woche stimmt', isoWeekKey(NOW) === '2026-W41' && isoWeekKey(Date.parse('2026-10-12T00:00:00Z')) === '2026-W42' && isoWeekKey(Date.parse('2026-01-01T12:00:00Z')) === '2026-W01' && isoWeekKey(Date.parse('2024-12-30T12:00:00Z')) === '2025-W01' && isoWeekKey(Date.parse('2027-01-03T12:00:00Z')) === '2026-W53' && new Date(isoWeekOf(NOW).monday).toISOString().slice(0, 10) === '2026-10-05', `${isoWeekKey(NOW)}`);
add('W2 vorige Woche: am Montag 12.10.2026 ist es 2026-W41, am 01.01.2026 die Woche 2025-W52', previousWeekKey(Date.parse('2026-10-12T05:00:00Z')) === '2026-W41' && previousWeekKey(Date.parse('2026-01-01T05:00:00Z')) === '2025-W52', previousWeekKey(Date.parse('2026-01-01T05:00:00Z')));

// S — snow-line and new-snow events
{
  // independent expectation from the real rows of Hintereisferner / Aletsch / Rhone (class A): consecutive scenes with a line, ≥ 100 m
  const want = [];
  for (const [id, rows] of Object.entries(rowsById)) {
    const g = byId.get(id);
    if (!g || g.klass !== 'A' || g.country === 'DE') continue;
    const sc = rows.filter((r) => r[3] === 1 && r[4] != null && ((r[8] ?? 0) & 1) === 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    for (let i = 1; i < sc.length; i++) if (Math.abs(sc[i][4] - sc[i - 1][4]) >= 100 && sc[i][0] >= WEEK.from && sc[i][0] <= WEEK.to) want.push(`${id}|${sc[i][0]}`);
  }
  const got = snowlineEvents(rowsById, byId, WEEK.from, WEEK.to);
  add('S1 Schneegrenzen-Ereignisse: genau die Szenenpaare mit ≥ 100 m Unterschied in der Woche (unabhängig nachgerechnet), Herkunft Satellit, Kennung stabil aus Gletscher und Szenendatum', want.length > 0 && got.length === want.length && got.every((e) => want.includes(`${e.glacier}|${e.at}`) && e.origin === 'satellite' && e.id === `ev_snowline_${e.glacier.replace(/^gl_/, '').replace('_', '-')}_${e.at}`), JSON.stringify({ want: want.length, got: got.length }));
  const small = clone(rowsById);
  small[hefId] = small[hefId].map((r, i) => [r[0], r[1], r[2], 1, 3100 + (i % 2) * 50, r[5], r[6], r[7], 0]);
  add('S1b Gegenprobe: Unterschiede unter 100 m (50 m) erzeugen kein Ereignis; Klasse B und C auch nicht', snowlineEvents(small, byId, WEEK.from, WEEK.to).filter((e) => e.glacier === hefId).length === 0 && snowlineEvents({ [STATIC.catalogRows.bAt.id]: [['2026-10-05', 0.9, 0.5, 1, 2500, 0.3, null, null, 0], ['2026-10-09', 0.9, 0.5, 1, 2900, 0.3, null, null, 0]] }, byId, WEEK.from, WEEK.to).length === 0, '');
  const flagged = clone(rowsById);
  const last = flagged[hefId][flagged[hefId].length - 1];
  last[8] = glacierFlagsMask(['neuschnee']);
  const ns = newsnowEvents(flagged, byId, WEEK.from, WEEK.to);
  const noSl = snowlineEvents(flagged, byId, WEEK.from, WEEK.to).filter((e) => e.glacier === hefId && e.at === last[0]);
  add('S2 Neuschnee: eine Szene mit der Marke wird ein Ereignis (Satellit, mit Szenendatum); dieselbe Szene zählt NICHT als Schneegrenzen-Ereignis (die Grenze der frischen Decke ist keine Saisonlinie)', ns.some((e) => e.glacier === hefId && e.at === last[0] && e.origin === 'satellite') && noSl.length === 0, JSON.stringify(ns.map((e) => e.id)));
}

// H — hot days
{
  const doc = clone(SHEET.melt);
  const g = byId.get(hefId);
  const hot = clone(doc);
  const row = hot.glaciers.find((r) => r.id === hefId);
  row.idx[0] = [60, 72, 80]; row.zf[0] = g.z[1] + 400;
  const ev = heatEvents(hot, byId, '2026-10-05', '2026-10-11');
  const cold = clone(hot); cold.glaciers.find((r) => r.id === hefId).zf[0] = g.z[1] - 100;
  const weak = clone(hot); weak.glaciers.find((r) => r.id === hefId).idx[0] = [30, 40, 50];
  add('H1 Hitzetag: Nullgradgrenze über der Medianhöhe UND Schmelzindex ≥ 60 ⇒ Ereignis mit Herkunft „Modell“ und dem Index (nie in mm, cm Eis oder m³); Gegenproben: Nullgrad darunter ⇒ keins, Index 40 ⇒ keins', ev.length === 1 && ev[0].origin === 'model' && /Schmelzindex 72 von 100 \(ohne Einheit\)/.test(ev[0].text) && !/\bmm\b|cm Eis|m³/.test(ev[0].text) && heatEvents(cold, byId, '2026-10-05', '2026-10-11').length === 0 && heatEvents(weak, byId, '2026-10-05', '2026-10-11').length === 0, ev[0]?.text);
  add('H1b ohne Lauf oder ein Lauf außerhalb der Woche: keine Hitzeereignisse', heatEvents(null, byId, WEEK.from, WEEK.to).length === 0 && heatEvents(hot, byId, '2026-09-28', '2026-10-04').length === 0, '');
  const many = clone(hot);
  const ids = cat.map((x) => x.id);
  many.glaciers = Array.from({ length: 30 }, (_, i) => ({ ...clone(row), id: ids[i % ids.length] }));
  add('H2 höchstens 5 Hitzeereignisse je Lauf, die stärksten (Index absteigend)', (() => { const e = heatEvents(many, byId, '2026-10-05', '2026-10-11'); return e.length <= 5 && e.every((x, i, a) => i === 0 || a[i - 1].w >= x.w); })(), '');
}

// O — official
{
  const all = officialEvents(official, '2026-01-01', '2026-12-31');
  const status = official.filter((i) => i.kind === 'status');
  add('O1 amtliche Ereignisse: jede kuratierte Meldung wörtlich (Satz gleich dem in official.json) mit Link und Quelle, Herkunft „amtlich“; Status-Meldungen nur, wenn sie das Kriterium der Behörde tragen', all.length === official.length - status.filter((i) => !i.criterion).length && all.every((e) => official.some((o) => o.quote === e.quote && o.url === e.url && o.source === e.source) && e.origin === 'official') && all.filter((e) => e.type === 'status').every((e) => official.find((o) => o.quote === e.quote).criterion), `${all.length} von ${official.length}`);
  const noCrit = clone(official).map((i) => (i.kind === 'status' ? { ...i, criterion: undefined } : i));
  add('O1b Gegenprobe: ein Status ohne Kriterium wird NICHT gemeldet („verschwunden“ nur mit der Aussage der Behörde)', officialEvents(noCrit, '2026-01-01', '2026-12-31').every((e) => e.type !== 'status') && status.length > 0, '');
  add('O2 Fenster: eine Meldung vom 01.10.2026 steht in der Woche 2026-W40, nicht in W41', officialEvents(official, '2026-09-28', '2026-10-04').some((e) => e.at === '2026-10-01') && officialEvents(official, '2026-10-05', '2026-10-11').every((e) => e.at >= '2026-10-05'), '');
}

// B — the feed document, contract rules with negative controls
const WIDE = WEEK;
const doc = buildFeed({ weekKey: '2026-W41', fromIso: WIDE.from, toIso: WIDE.to, nowMs: NOW, rowsById, byId, meltDoc: (() => { const d = clone(SHEET.melt); const r = d.glaciers.find((x) => x.id === hefId); r.idx[0] = [62, 70, 78]; r.zf[0] = byId.get(hefId).z[1] + 300; return d; })(), official });
{
  const p = feedProblems(doc, official, new Set(byId.keys()));
  add('B1 Wochen-Feed: 0 Vertragsverstöße; Ereignisse nach Gewicht sortiert, doppelte Kennungen entfernt, höchstens drei in der Spitze und nicht zwei zum selben Gletscher', p.length === 0 && doc.events.length >= 2 && doc.top.length >= 1 && doc.top.length <= 3 && new Set(doc.events.map((e) => e.id)).size === doc.events.length && (() => { const gl = doc.top.map((id) => doc.events.find((e) => e.id === id).glacier).filter(Boolean); return new Set(gl).size === gl.length; })() && doc.events.every((e, i, a) => i === 0 || a[i - 1].w >= e.w), `${doc.events.length} Ereignisse; ${p.slice(0, 3).join('; ')}`);
  const again = buildFeed({ weekKey: '2026-W41', fromIso: WIDE.from, toIso: WIDE.to, nowMs: NOW + 5 * 3_600_000, rowsById, byId, meltDoc: null, official });
  add('B2 stabile Kennungen: ein späterer Neubau derselben Woche gibt jedem unveränderten Ereignis dieselbe Kennung (Schneegrenze, Neuschnee, amtlich)', again.events.filter((e) => e.type !== 'heat').every((e) => doc.events.some((d) => d.id === e.id)) && doc.events.filter((e) => e.type !== 'heat').length === again.events.length, '');
  const neg = (mut, rx, name) => { const d = clone(doc); mut(d); const pr = feedProblems(d, official, new Set(byId.keys())); return { name, ok: pr.some((x) => rx.test(x)), pr }; };
  const neg1 = neg((d) => { const e = d.events.find((x) => x.type === 'official'); e.quote = e.quote.slice(1); }, /nicht wörtlich/, 'Satz verändert');
  const neg2 = neg((d) => { const e = d.events.find((x) => x.type === 'snowline') ?? d.events.find((x) => x.type === 'heat'); e.origin = 'measured'; }, /Herkunft measured bei Typ/, 'Modell/Satellit als gemessen');
  const neg3 = neg((d) => { d.events.push({ ...d.events[0] }); }, /doppelt/, 'doppelte Kennung');
  const neg4 = neg((d) => { d.events[d.events.length - 1].text = 'Der Gletscher ist sicher begehbar'; }, /Wort/, 'Tourwort');
  const neg5 = neg((d) => { const e = d.events.find((x) => x.type === 'official'); delete e.url; }, /ohne Link/, 'ohne Link');
  const neg6 = neg((d) => { d.top = [...d.events.map((e) => e.id), 'x'].slice(0, 4); }, /mehr als drei|kein Ereignis/, 'vier in der Spitze');
  const neg7 = neg((d) => { const e = d.events.find((x) => x.type === 'heat'); if (e) e.text += ' — 12 mm Schmelze'; else d.events.push({ id: 'ev_heat_x_2026-10-11', type: 'heat', at: '2026-10-11', glacier: null, origin: 'model', text: 'x 12 mm', source: 's', w: 1 }); }, /Schmelze mit Einheit/, 'Schmelze mit Einheit');
  const neg8 = neg((d) => { const e = d.events.find((x) => x.type === 'snowline'); if (e) e.quote = 'x'; }, /Zitat bei Typ/, 'Zitat an einem Satellitenereignis');
  const neg9 = neg((d) => { const e = d.events.find((x) => x.type === 'status'); if (e) { const o = official.find((i) => i.quote === e.quote); e.quote = 'Verschwunden: ' + o.quote; } else d.events.push({ id: 'ev_status_x_2026-10-01', type: 'status', at: '2026-10-01', glacier: null, origin: 'official', text: 'x', source: 's', url: 'https://x', quote: 'nicht in der Liste', w: 1 }); }, /nicht wörtlich/, 'Statussatz erfunden');
  const negs = [neg1, neg2, neg3, neg4, neg5, neg6, neg7, neg8, neg9];
  add('B3 Gegenproben des Vertrags: ein veränderter amtlicher Satz, ein Satellit-/Modell-Ereignis als „gemessen“, eine doppelte Kennung, ein Tourwort, ein amtliches Ereignis ohne Link, vier Spitzenereignisse, Schmelze mit Einheit, ein Zitat am Satellitenereignis und ein erfundener Statussatz werden je gefunden', negs.every((n) => n.ok), negs.filter((n) => !n.ok).map((n) => `${n.name}: ${n.pr.slice(0, 2).join('|')}`).join(' // '));
  add('B4 Herkunft je Typ gesperrt: Schneegrenze und Neuschnee = Satellit, Hitzetag = Modell, Meldung und Status = amtlich', GLACIER_FEED_ORIGIN.snowline === 'satellite' && GLACIER_FEED_ORIGIN.newsnow === 'satellite' && GLACIER_FEED_ORIGIN.heat === 'model' && GLACIER_FEED_ORIGIN.official === 'official' && GLACIER_FEED_ORIGIN.status === 'official', '');
  add('B6 Spitze der Woche: eine Zeile je Art (amtlich, Hitzetag, Schneegrenze, Neuschnee) vor einer zweiten derselben Art, höchstens drei, nie zwei zum selben Gletscher', (() => { const kinds = doc.top.map((id) => { const e = doc.events.find((x) => x.id === id); return e.type === 'status' ? 'official' : e.type; }); const present = new Set(doc.events.map((e) => (e.type === 'status' ? 'official' : e.type))); return doc.top.length === Math.min(3, doc.events.length) && new Set(kinds).size === Math.min(3, present.size); })(), JSON.stringify(doc.top.map((id) => id.split('_')[1])));
  add('B5 Rangfolge: nach Gewicht, bei Gleichstand das neuere Datum, dann die Kennung — dieselbe Eingabe, dieselbe Folge', JSON.stringify(rankEvents(doc.events).map((e) => e.id)) === JSON.stringify(rankEvents([...doc.events].reverse()).map((e) => e.id)), '');
}

// M — main end to end on a temp tree, retention
{
  const root = mkdtempSync(join(tmpdir(), 'glacier-feed-'));
  const data = join(root, 'data');
  const build = '20261011-9';
  mkdirSync(join(data, 'static', build), { recursive: true });
  writeFileSync(join(data, 'static', build, 'catalog.json'), JSON.stringify({ build, glaciers: cat }));
  writeFileSync(join(data, 'static', build, 'official.json'), JSON.stringify(STATIC.official));
  const seasons = {};
  for (const [key, d] of Object.entries(SAT.seasons)) { const [y, r] = key.split('/'); mkdirSync(join(data, 'season', y, r), { recursive: true }); writeFileSync(join(data, 'season', y, r, `${d.stand}.json`), JSON.stringify(d)); (seasons[y] ??= {})[r] = d.stand; }
  mkdirSync(join(data, 'melt'), { recursive: true });
  const melt = clone(SHEET.melt);
  writeFileSync(join(data, 'melt', `${melt.run}.json`), JSON.stringify(melt));
  writeFileSync(join(data, 'index.json'), JSON.stringify({ schema: 1, static: { build }, sat: { updatedAt: '2026-10-11T00:00:00Z', newest: {}, seasons }, melt: { run: melt.run, runAt: melt.runAt } }));
  mkdirSync(join(data, 'feed'), { recursive: true }); mkdirSync(join(data, 'card'), { recursive: true });
  for (let w = 1; w <= 14; w++) { const k = `2026-W${String(w).padStart(2, '0')}`; writeFileSync(join(data, 'feed', `${k}.json`), '{}'); writeFileSync(join(data, 'card', `${k}.png`), 'x'); }
  const r = await main({ data, out: join(root, 'out'), now: new Date(NOW).toISOString() });
  const outDoc = JSON.parse(readFileSync(join(root, 'out', 'feed', '2026-W41.json'), 'utf8'));
  const files = readdirSync(join(root, 'out', 'feed')).sort();
  const patch = JSON.parse(readFileSync(join(root, 'patch', 'index-patch.json'), 'utf8'));
  add('M1 Lauf Ende zu Ende: Feed der Woche 2026-W41 besteht den Vertrag, meldet auch die amtlichen Meldungen der letzten 30 Tage (CH 01.10.) neben denen der Woche, schreibt den Zeiger `feed` (Woche, Stand, Zahl, jüngste Wochenkarte) für den Index', r.week === '2026-W41' && feedProblems(outDoc, official, new Set(byId.keys())).length === 0 && outDoc.events.some((e) => e.type === 'official' && e.at === '2026-10-01') && patch.feed.week === '2026-W41' && patch.feed.n === outDoc.events.length && patch.feed.card === '2026-W14' && patch.feed.weeks[0] === '2026-W41' && patch.feed.weeks.length === 12 && patch.feed.weeks.every((w, i, a) => i === 0 || a[i - 1] > w), JSON.stringify({ n: outDoc.events.length, patch: patch.feed }));
  add('M2 Aufbewahrung: von 14 alten Wochen bleiben die letzten 12 (mit der neuen Woche), Karten im selben Zug; ältere fallen heraus (Gegenprobe: W01, W02 fehlen)', files.length === GLACIER_FEED_KEEP_WEEKS && !files.includes('2026-W01.json') && !files.includes('2026-W02.json') && files.includes('2026-W41.json') && files.includes('2026-W14.json'), files.join(' '));
  rmSync(root, { recursive: true, force: true });
}

// C — card
{
  const html = cardHtml(doc);
  const bad = clone(doc); bad.events[0].text = '<script>alert(1)</script> & "x"';
  bad.top = [bad.events[0].id];
  const html2 = cardHtml(bad);
  add('C1 Karten-HTML: die drei wichtigsten Ereignisse in der Reihenfolge der Spitze, je mit Herkunftsmarke und Quelle; Text wird maskiert (kein Script durch einen Ereignistext); Wochenbezeichnung „Woche 41 · 2026“', doc.top.every((id) => html.includes(doc.events.find((e) => e.id === id).source.replace(/&/g, '&amp;'))) && /Woche 41 · 2026/.test(html) && !html2.includes('<script>alert') && html2.includes('&lt;script&gt;') && weekLabel('2026-W41') === 'Woche 41 · 2026', '');
  add('C2 Karten-Prüfer: ein Tourwort im Ereignistext wird gefunden (Karte wird nicht gerendert)', cardProblems(doc).length === 0 && cardProblems({ ...doc, events: doc.events.map((e, i) => (i === 0 ? { ...e, text: 'sicher begehbar' } : e)), top: [doc.events[0].id] }).length >= 2, '');
  const chrome = process.env.OG_CHROME && existsSync(process.env.OG_CHROME) ? process.env.OG_CHROME : findHeadlessChrome();
  if (chrome) {
    const out = join(tmpdir(), `gl-card-${process.pid}.png`);
    const r = await renderCard({ doc, out, chrome });
    const b = readFileSync(out);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    add('C3 gerenderte Karte: PNG (Kennung 89 50 4E 47), 1200 × 630, unter 400 KB, nicht leer (mehr als eine Farbe im Byte-Strom)', b.subarray(1, 4).toString() === 'PNG' && w === CARD_W && h === CARD_H && r.bytes < 400_000 && r.bytes > 8_000, `${w}×${h}, ${r.bytes} Bytes`);
    rmSync(out, { force: true });
  } else add('C3 gerenderte Karte: übersprungen (kein Browser; OG_CHROME setzen) — HTML-Prüfungen C1/C2 laufen immer', true, 'kein Browser');
}

const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}${c.ok ? '' : `\n       ${c.detail}`}`);
console.log(`\nverify:glacier-feed ${checks.length - failed.length}/${checks.length}`);
process.exit(failed.length ? 1 : 0);
