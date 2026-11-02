/**
 * Prüfungen der Waldbrand-Regionsseiten (Phase WBS, `audit/seo-waldbrand.md`) — aufgerufen von `verify-seo.mjs` nach dem Build.
 * Prüft Listen gegen die Datenquelle (`fireRegions.mjs`), nicht fortgeschriebene Zahlen.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fireData, FIRE_BASE, FIRE_COUNTRIES, fireCountryPath } from './fireRegions.mjs';

const SITE = 'https://buscosun.com';
const visible = (html) => html.split('<body>')[1]?.split('<script>')[0]
  .replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim() ?? '';
const words = (t) => (t ? t.split(' ').length : 0);
/** Eigene Werte heißen nie Warnung oder Alarm (D4, Ehrlichkeitsregel); der Verweis auf eine „amtliche Warnung" ist erlaubt. */
const FORBIDDEN = /\b(?:Warnstufe|Alarmstufe|Waldbrandwarnung|Alarm)\b|(?<!amtliche )\bWarnung\b/;

export function verifyFireRegions({ DIST, read, ok, fail, jsonLdBlocks }) {
  const D = fireData();
  if (!D) { fail('waldbrandgefahr/', 'Saison-Index oder Grenzen fehlen — keine Waldbrand-Regionsseiten'); return; }

  // Gegenprobe der Sprachregel: das Muster muss einen gepflanzten Verstoß finden und den erlaubten Hinweis durchlassen.
  if (!FORBIDDEN.test('heute gilt Warnstufe 3') || !FORBIDDEN.test('eine Warnung für Brandenburg') || FORBIDDEN.test('Keine amtliche Warnung. Maßgeblich'))
    fail('verifyFireRegions', 'Gegenprobe der Sprachregel schlägt fehl');
  else ok('verifyFireRegions', 'Gegenprobe der Sprachregel greift');

  const want = [FIRE_BASE, ...Object.keys(FIRE_COUNTRIES).map(fireCountryPath), ...D.regions.filter((r) => r.hasPage).map((r) => r.path)];
  const noPage = D.regions.filter((r) => !r.hasPage);
  const file = (p) => join(DIST, ...p.split('/').filter(Boolean), 'index.html');
  const missing = want.filter((p) => !existsSync(file(p)));
  if (missing.length) fail('waldbrandgefahr/', `${missing.length} Seiten fehlen: ${missing.slice(0, 3).join(', ')}`);
  else ok('waldbrandgefahr/', `${want.length} Seiten (Übersicht, 3 Länder, ${want.length - 4} Regionen)`);
  const stray = noPage.filter((r) => existsSync(file(r.path)));
  if (stray.length) fail('waldbrandgefahr/', `Seite trotz zu weniger Daten: ${stray.map((r) => r.name).join(', ')}`);
  else ok('waldbrandgefahr/', `keine Seite für ${noPage.length} Regionen unter der Schwelle (z. B. ${noPage.slice(0, 2).map((r) => r.name).join(', ')})`);
  // Nichts anderes unter /waldbrandgefahr/ als die erwarteten Seiten.
  const found = [];
  const walk = (dir, rel) => { for (const e of readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) walk(join(dir, e.name), `${rel}${e.name}/`); else if (e.name === 'index.html') found.push(rel); } };
  if (existsSync(join(DIST, 'waldbrandgefahr'))) walk(join(DIST, 'waldbrandgefahr'), FIRE_BASE);
  const extra = found.filter((p) => !want.includes(p));
  if (extra.length) fail('waldbrandgefahr/', `unerwartete Seiten: ${extra.join(', ')}`); else ok('waldbrandgefahr/', 'keine unerwarteten Seiten');

  const titles = new Map(), descs = new Map(), leads = new Map();
  let thin = [], bad = [];
  for (const p of want.filter((x) => !missing.includes(x))) {
    const rel = file(p).slice(DIST.length + 1);
    const html = read(rel);
    const t = visible(html);
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '';
    const lead = (html.match(/<p class="lead">([^<]*)<\/p>/) || [])[1] || '';
    const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    const errs = [];
    if ((html.match(/<h1[\s>]/g) || []).length !== 1) errs.push('nicht genau eine H1');
    if (!/Waldbrandgefahr/.test(title)) errs.push('Title ohne „Waldbrandgefahr"');
    if (canon !== SITE + p) errs.push(`canonical ${canon}`);
    if (desc.length < 70 || desc.length > 200) errs.push(`Description ${desc.length} Zeichen`);
    if (words(lead) < 40) errs.push(`Lead ${words(lead)} Wörter`);
    if (!/Keine amtliche Warnung\./.test(html) || !/112/.test(t)) errs.push('Hinweis „Keine amtliche Warnung" oder Notruf fehlt');
    if (FORBIDDEN.test(t)) errs.push(`Sprachregel: „${(t.match(FORBIDDEN) || [])[0]}"`);
    const fig = html.match(/<figure class="fwi" data-bbox="(-?\d+),(-?\d+),(-?\d+),(-?\d+)" data-w="(\d+)" data-h="(\d+)"/);
    if (!fig || +fig[1] >= +fig[3] || +fig[2] >= +fig[4]) errs.push('Feuerwetter-Bild ohne gültigen Ausschnitt');
    if (!/maps\.effis\.emergency\.copernicus\.eu\/gwis/.test(html) || !/CC BY 4\.0/.test(html)) errs.push('GWIS-Quelle oder Lizenz fehlt');
    if (!/href="\/methodik\/brandradar-detektion-und-brandnarben\/"/.test(html)) errs.push('kein Link auf die Methodik');
    const blocks = jsonLdBlocks(html);
    let types = [];
    try { types = blocks.map((b) => JSON.parse(b)['@type']); } catch { errs.push('JSON-LD nicht parsebar'); }
    if (!types.includes('BreadcrumbList')) errs.push('keine BreadcrumbList');
    if (types.includes('FAQPage') || types.includes('SpecialAnnouncement')) errs.push('FAQPage/SpecialAnnouncement-Markup (D7)');
    if (/hreflang=/.test(html)) errs.push('hreflang');
    // Interne Ordner-Links müssen existieren.
    const deadLinks = [...html.matchAll(/href="(\/[^"#?]*\/)"/g)].map((m) => m[1]).filter((h) => !existsSync(file(h)));
    if (deadLinks.length) errs.push(`tote Links: ${[...new Set(deadLinks)].slice(0, 3).join(', ')}`);
    const n = words(t);
    if (n < (p === FIRE_BASE || p.split('/').filter(Boolean).length === 2 ? 600 : 450)) thin.push(`${p} (${n})`);
    if (titles.has(title)) errs.push(`Title doppelt mit ${titles.get(title)}`); else titles.set(title, p);
    if (descs.has(desc)) errs.push(`Description doppelt mit ${descs.get(desc)}`); else descs.set(desc, p);
    if (leads.has(lead)) errs.push(`Lead doppelt mit ${leads.get(lead)}`); else leads.set(lead, p);
    if (errs.length) bad.push(`${p}: ${errs.join('; ')}`);
  }
  if (bad.length) for (const b of bad.slice(0, 8)) fail('waldbrandgefahr/', b);
  else ok('waldbrandgefahr/', 'jede Seite: eine H1, eigener Title/Description/Lead, Canonical, Hinweis + Notruf, Sprachregel, FWI-Bild mit Lizenz, Breadcrumb, keine toten Ordner-Links');
  if (thin.length) fail('waldbrandgefahr/', `zu wenig Text: ${thin.slice(0, 4).join(', ')}`);
  else ok('waldbrandgefahr/', 'Mindesttext je Seitentyp (Übersicht/Land ≥ 600, Region ≥ 450 Wörter)');

  // Summen: Land = Regionen + nicht zugeordnet; Übersicht = Länder.
  const sums = Object.keys(FIRE_COUNTRIES).map((c) => {
    const C = D.countries[c];
    return C.stats.events === C.regions.reduce((s, r) => s + r.stats.events, 0) + C.unassigned;
  });
  if (sums.every(Boolean)) ok('waldbrandgefahr/', 'Summen je Land = Regionen + nicht zugeordnete Ereignisse');
  else fail('waldbrandgefahr/', 'Summen je Land weichen von den Regionen ab');

  // Sitemap, robots, llms
  const index = read('sitemap.xml');
  if (!index.includes(`${SITE}/sitemap-waldbrand.xml`)) fail('sitemap.xml', 'Teilliste sitemap-waldbrand.xml fehlt im Index');
  else ok('sitemap.xml', 'nennt sitemap-waldbrand.xml');
  const part = existsSync(join(DIST, 'sitemap-waldbrand.xml')) ? read('sitemap-waldbrand.xml') : '';
  const locs = [...part.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const wantLocs = want.map((p) => SITE + p);
  const all = readdirSync(DIST).filter((f) => /^sitemap-.*\.xml$/.test(f) && f !== 'sitemap-news.xml').flatMap((f) => [...read(f).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  if (locs.length !== wantLocs.length || wantLocs.some((u) => !locs.includes(u))) fail('sitemap-waldbrand.xml', `${locs.length} URLs, erwartet ${wantLocs.length}`);
  else if (new Set(all).size !== all.length) fail('sitemap', 'URL in mehreren Teillisten');
  else ok('sitemap-waldbrand.xml', `${locs.length} URLs, keine Doppelung über die Teillisten`);
  if (!read('robots.txt').includes(`Sitemap: ${SITE}/sitemap-waldbrand.xml`)) fail('robots.txt', 'Sitemap-Zeile sitemap-waldbrand.xml fehlt');
  else ok('robots.txt', 'nennt sitemap-waldbrand.xml');
  if (!read('llms.txt').includes(`${SITE}${FIRE_BASE}`)) fail('llms.txt', 'Waldbrandgefahr nach Region fehlt');
  else ok('llms.txt', 'nennt /waldbrandgefahr/');

  // Route-Shell /waldbrand (D8) und Querverweise
  const shell = read('waldbrand.html');
  const shellTitle = (shell.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const shellWords = words(visible(shell));
  if (!/Waldbrand aktuell/.test(shellTitle) || !/Karte/.test(shellTitle)) fail('waldbrand.html', `Title ohne „Waldbrand aktuell"/„Karte": ${shellTitle}`);
  else if (!shell.includes(`href="${FIRE_BASE}"`)) fail('waldbrand.html', 'kein Link auf /waldbrandgefahr/');
  else if (shellWords < 450) fail('waldbrand.html', `nur ${shellWords} Wörter ohne JavaScript`);
  else ok('waldbrand.html', `Title mit „Waldbrand aktuell" und „Karte", Link auf die Regionen, ${shellWords} Wörter`);
  const bb = D.regions.find((r) => r.iso === 'DE-BB');
  const potsdam = existsSync(join(DIST, 'wetter', 'potsdam', 'index.html')) ? read('wetter/potsdam/index.html') : '';
  const bremen = existsSync(join(DIST, 'wetter', 'bremen', 'index.html')) ? read('wetter/bremen/index.html') : null;
  if (bb?.hasPage && !potsdam.includes(`href="${bb.path}"`)) fail('wetter/potsdam/', 'Ortsseite verlinkt die Waldbrand-Seite ihres Bundeslands nicht');
  else if (bremen !== null && /href="\/waldbrandgefahr\/deutschland\/bremen\/"/.test(bremen)) fail('wetter/bremen/', 'Link auf eine Regionsseite, die es nicht gibt');
  else ok('wetter/', 'Ortsseite verlinkt ihr Bundesland (Potsdam → Brandenburg); Gegenprobe Bremen ohne Seite, ohne Link');
}
