/**
 * Roh-HTML-Regressionstest für das SEO/GEO-Paket (HARD GATE 0.2).
 *
 * Läuft NACH `npm run build` gegen dist/. Beweist, dass aller indexierbare
 * Inhalt (H1, Lead, Meta, JSON-LD) im rohen HTML steht — ohne JS-Ausführung.
 * Reines Node-ESM, kein App-Import. Exit-Code != 0 ⇒ Fail-Stop.
 *
 *   node scripts/seo/verify-seo.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// Phase WBS (audit/seo-waldbrand.md): Prüfungen der Waldbrand-Regionsseiten.
import { verifyFireRegions } from './verifyFireRegions.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');

let failures = 0;
let checks = 0;

function fail(file, msg) {
  failures++;
  console.error(`  ✗ [${file}] ${msg}`);
}
function ok(file, msg) {
  checks++;
  console.log(`  ✓ [${file}] ${msg}`);
}

/** Alle <script type="application/ld+json">…</script>-Blöcke extrahieren + parsen. */
function jsonLdBlocks(html) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) out.push(m[1].trim());
  return out;
}

/** Wortzahl des längsten Absatzes (Direktantwort-Lead, robust gg. Reihenfolge). */
function leadWordCount(html) {
  const re = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m, max = 0;
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const n = text ? text.split(' ').length : 0;
    if (n > max) max = n;
  }
  return max;
}

function checkCommon(file, html, { type }) {
  if (!/<h1[\s>]/i.test(html)) fail(file, 'kein <h1>');
  else ok(file, 'H1 vorhanden');

  if (!/<title[\s>]/i.test(html)) fail(file, 'kein <title>');
  else ok(file, '<title> vorhanden');

  if (!/<meta[^>]+name=["']description["']/i.test(html)) fail(file, 'keine meta description');
  else ok(file, 'meta description vorhanden');

  if (!/property=["']og:/i.test(html)) fail(file, 'keine og:-Tags');
  else ok(file, 'OG-Tags vorhanden');

  // og:image muss ein Raster (PNG/JPG/WebP) sein — SVG wird von Social/Discover
  // nicht gerendert.
  const ogImg = html.match(/property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
  if (!ogImg) fail(file, 'kein og:image');
  else if (/\.svg(\?|$)/i.test(ogImg[1])) fail(file, `og:image ist SVG (${ogImg[1]}) — Social rendert kein SVG`);
  else ok(file, `og:image Raster (${ogImg[1].split('/').pop()})`);

  if (!/rel=["']canonical["']/i.test(html)) fail(file, 'kein canonical');
  else ok(file, 'canonical vorhanden');

  const lead = leadWordCount(html);
  if (lead < 25) fail(file, `Direktantwort-Lead zu kurz (max ${lead} Wörter)`);
  else ok(file, `Direktantwort-Lead (${lead} Wörter)`);

  const blocks = jsonLdBlocks(html);
  if (blocks.length === 0) {
    fail(file, 'kein JSON-LD');
  } else {
    let allValid = true;
    const types = [];
    for (const b of blocks) {
      try {
        const obj = JSON.parse(b);
        if (!obj['@context'] || !obj['@type']) { allValid = false; fail(file, 'JSON-LD ohne @context/@type'); }
        types.push(obj['@type']);
      } catch {
        allValid = false;
        fail(file, 'JSON-LD nicht parsebar');
      }
    }
    if (allValid) ok(file, `JSON-LD valide (${types.join(', ')})`);
    if (type && !types.flat().includes(type)) fail(file, `JSON-LD-Typ ${type} fehlt`);
    else if (type) ok(file, `JSON-LD-Typ ${type} vorhanden`);
  }
}

function read(rel) {
  return readFileSync(join(DIST, rel), 'utf8');
}
function firstChildDir(rel) {
  const dir = join(DIST, rel);
  if (!existsSync(dir)) return null;
  const sub = readdirSync(dir, { withFileTypes: true }).find((d) => d.isDirectory());
  return sub ? `${rel}/${sub.name}/index.html` : null;
}

console.log('[verify-seo] Roh-HTML-Prüfung gegen dist/ …');

if (!existsSync(DIST)) {
  console.error('[verify-seo] dist/ fehlt — zuerst `npm run build`.');
  process.exit(1);
}

// 1) Home (Pflicht)
console.log('\nHome:');
checkCommon('index.html', read('index.html'), { type: 'WebApplication' });

// 2) Ort (Pflicht — Stichproben)
console.log('\nOrtsseiten:');
for (const rel of ['wetter/muenchen/index.html', 'wetter/innsbruck/index.html', 'wetter/zermatt/index.html']) {
  if (existsSync(join(DIST, rel))) checkCommon(rel, read(rel), { type: 'FAQPage' });
  else fail(rel, 'erwartete Ortsseite fehlt');
}

// 3) Optional, aber erzwungen sobald vorhanden: Explainer / Tools / Events
for (const [label, prefix, type] of [
  ['Explainer', 'wissen', 'FAQPage'],
  ['Tool-Landingpages', 'funktionen', 'SoftwareApplication'],
  ['Event-Artikel', 'wetterlage', 'NewsArticle'],
]) {
  const sample = firstChildDir(prefix);
  if (sample) {
    console.log(`\n${label}:`);
    checkCommon(sample, read(sample), { type });
  }
}

// 4) App-Routen-Shells (Phase RT1): eigener Canonical/Title/WebPage je Route;
// Home behält GENAU eine WebApplication (kein doppeltes JSON-LD durch den Client).
console.log('\nApp-Routen-Shells:');
for (const rel of ['wetterkarte.html', 'regenradar.html', 'waldbrand.html', 'atmosphaere.html', 'warnungen.html']) {
  if (!existsSync(join(DIST, rel))) { fail(rel, 'Route-Shell fehlt (generate-seo.mjs 4a)'); continue; }
  const html = read(rel);
  checkCommon(rel, html, { type: 'WebPage' });
  const canon = html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const want = `https://buscosun.com/${rel.replace(/\.html$/, '')}`;
  if (!canon || canon[1] !== want) fail(rel, `canonical ist ${canon ? canon[1] : 'leer'}, erwartet ${want}`);
  else ok(rel, 'canonical = eigener Pfad (ohne Query)');
}
// 5) Sub-Routen-Shells (SEO/GEO 2026, E1): jede indexierbare Sub-Route hat eine
// EIGENE flache Shell mit eigenem Title/Canonical/H1/Lead — vorher teilten sie die
// Eltern-Shell (SEO-AUDIT.md §2). 24 = 18 Layer + 1 Atmosphäre + 5 Brand-Sichten (die 10 Event-Anlässe sind seit Jan 11.11. gelöscht);
// die exakte Menge prüft verify-routing gegen die Routen-Tabelle. Nach der Autobahn-Freischaltung (ROAD_INDEXABLE) kommen 20 Unterseiten dazu.
// Phase SS: dazu je Seewetter-Spot eine Shell (die Zahl liest die Prüfung aus der Namenstabelle, nicht aus dist/).
console.log('\nSub-Routen-Shells:');
const subShells = readdirSync(DIST).filter((f) => /^[a-z]+--[a-z0-9-]+\.html$/.test(f)).sort();
const seaSpotCount = (readFileSync(join(ROOT, 'src', 'sea', 'seaSpotNames.ts'), 'utf8').match(/^ {2}"[a-z0-9-]+": \[/gm) || []).length;
const subShellsWanted = (subShells.some((f) => f.startsWith('autobahnwetter--')) ? 44 : 24) + seaSpotCount;
if (seaSpotCount < 50) fail('src/sea/seaSpotNames.ts', `nur ${seaSpotCount} Spots gelesen — Format der Namenstabelle geändert?`);
if (subShells.length !== subShellsWanted) fail('dist/', `erwartet ${subShellsWanted} Sub-Routen-Shells, gefunden ${subShells.length}`);
else ok('dist/', `${subShellsWanted} Sub-Routen-Shells vorhanden`);
const parentTitle = (id) => (read(`${id}.html`).match(/<title>([^<]*)<\/title>/) || [])[1];
const seenLeads = new Set();
for (const f of subShells) {
  const html = read(f);
  const [routeId, slug] = f.replace(/\.html$/, '').split('--');
  checkCommon(f, html, { type: 'WebPage' });
  const canon = html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
  const want = `https://buscosun.com/${routeId}/${slug}`;
  if (!canon || canon[1] !== want) fail(f, `canonical ist ${canon ? canon[1] : 'leer'}, erwartet ${want}`);
  else ok(f, 'canonical = eigener Sub-Pfad');
  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!title || title === parentTitle(routeId)) fail(f, 'Title ist der der Eltern-Shell');
  else ok(f, 'eigener Title');
  const lead = leadWordCount(html);
  if (lead < 60) fail(f, `Lead zu kurz (${lead} Wörter, erwartet ≥ 60)`);
  const leadText = (html.match(/<h1>[^<]*<\/h1>\s*<p>([^<]*)<\/p>/) || [])[1];
  if (leadText && seenLeads.has(leadText)) fail(f, 'Lead ist wortgleich zu einer anderen Sub-Shell');
  if (leadText) seenLeads.add(leadText);
  if (!html.includes('<h2>Daten und Grenzen</h2>')) fail(f, 'Faktenliste „Daten und Grenzen" fehlt');
  if (!new RegExp(`href="/${routeId}"`).test(html)) fail(f, 'kein Link auf die Eltern-Route');
  if (/hreflang=/.test(html)) fail(f, 'hreflang vorhanden (seit E1 entfernt)');
}

// 6) Sitemap (E1, seit E9 ein Index auf zwei Teillisten): lastmod je URL aus dem Inhalt,
// kein changefreq, alle URLs kanonisch.
console.log('\nSitemap:');
{
  const index = read('sitemap.xml');
  if (!/<sitemapindex/.test(index)) fail('sitemap.xml', 'kein Sitemap-Index (E9)');
  else ok('sitemap.xml', 'Sitemap-Index');
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace('https://buscosun.com/', ''));
  const expected = ['sitemap-pages.xml', 'sitemap-orte.xml', 'sitemap-orte-2.xml', 'sitemap-seewetter.xml'];
  if (expected.some((f) => !children.includes(f))) fail('sitemap.xml', `Teilliste fehlt: ${expected.filter((f) => !children.includes(f)).join(', ')}`);
  else ok('sitemap.xml', `verweist auf ${children.length} Teillisten`);
  const sm = expected.map((f) => read(f)).join('\n');
  for (const f of expected) {
    const part = read(f);
    if (!/<urlset/.test(part)) fail(f, 'kein urlset');
    else ok(f, `${[...part.matchAll(/<loc>/g)].length} URLs`);
  }
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const mods = [...sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  if (locs.length === 0) fail('sitemap', 'keine URLs');
  else ok('sitemap', `${locs.length} URLs über beide Teillisten`);
  if (new Set(locs).size !== locs.length) fail('sitemap', 'URL in beiden Teillisten (Doppelung)');
  else ok('sitemap', 'keine URL doppelt');
  if (locs.some((l) => !l.startsWith('https://buscosun.com/'))) fail('sitemap.xml', 'URL außerhalb der kanonischen Origin');
  if (locs.some((l) => l.includes('?') || l.includes('#'))) fail('sitemap.xml', 'URL mit Query/Hash');
  if (/<changefreq>/.test(sm)) fail('sitemap.xml', 'changefreq vorhanden (seit E1 entfernt — Google ignoriert es)');
  else ok('sitemap.xml', 'kein changefreq');
  // lastmod kommt aus Git (seo/gitDate.mjs). Ohne belastbaren Verlauf (flacher Clone) fehlt
  // das Feld überall — das ist erlaubt, ein Platzhalter oder das Build-Datum nicht.
  if (mods.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) fail('sitemap.xml', 'lastmod ist kein ISO-Datum');
  else if (mods.length === 0) ok('sitemap.xml', 'kein lastmod (Git-Verlauf nicht belastbar) — erlaubt');
  else if (mods.length > locs.length) fail('sitemap.xml', 'mehr lastmod als URLs');
  else if (new Set(mods).size < 2) fail('sitemap.xml', 'alle lastmod identisch — Build-Datum statt Git-Datum?');
  else ok('sitemap.xml', `lastmod aus Git (${mods.length} von ${locs.length} URLs, ${new Set(mods).size} verschiedene Daten)`);
  const subUrls = subShells.map((f) => { const [r, sl] = f.replace(/\.html$/, '').split('--'); return `https://buscosun.com/${r}/${sl}`; });
  const missing = subUrls.filter((u) => !locs.includes(u));
  if (missing.length) fail('sitemap.xml', `Sub-Routen fehlen: ${missing.join(', ')}`);
  else ok('sitemap.xml', 'alle Sub-Routen-Shells enthalten');
}

// 6b) Phase SA (audit/seo-autobahnwetter.md): Autobahnwetter-Seiten. Nur wenn sie gebaut sind (ROAD_INDEXABLE).
// FAQPage nur mit sichtbaren Fragen, Gegenstand = die Autobahn mit Wikipedia-Eintrag, H1 mit dem Suchwort, keine Warnsprache.
{
  const roadShells = readdirSync(DIST).filter((f) => /^autobahnwetter--a\d+\.html$/.test(f));
  if (roadShells.length) {
    console.log('\nAutobahnwetter (Phase SA):');
    const visibleFaqOk = (html) => {
      const faq = jsonLdBlocks(html).map((b) => { try { return JSON.parse(b); } catch { return null; } }).find((o) => o && o['@type'] === 'FAQPage');
      if (!faq) return 'kein FAQPage';
      const missing = faq.mainEntity.filter((q) => !html.includes(`<h3>${q.name}</h3>`));
      return missing.length ? `Frage nicht sichtbar: ${missing[0].name}` : null;
    };
    for (const f of roadShells) {
      const html = read(f);
      const n = f.match(/--a(\d+)\.html$/)[1];
      const h1 = (html.match(/<h1>([^<]*)<\/h1>/) || [])[1] ?? '';
      if (!h1.startsWith(`Autobahnwetter A${n}`)) fail(f, `H1 ohne „Autobahnwetter A${n}": ${h1}`);
      const faqErr = visibleFaqOk(html);
      if (faqErr) fail(f, faqErr);
      const page = jsonLdBlocks(html).map((b) => { try { return JSON.parse(b); } catch { return null; } }).find((o) => o && o['@type'] === 'WebPage');
      if (page?.about?.sameAs !== `https://de.wikipedia.org/wiki/Bundesautobahn_${n}`) fail(f, `WebPage.about.sameAs ist ${page?.about?.sameAs}`);
      const text = html.slice(html.indexOf('<div id="root">')).replace(/<[^>]+>/g, ' ');
      if (/Achtung|Gefahr!|unbedingt|Entwarnung/.test(text)) fail(f, 'Warnsprache im Text');
      if (!faqErr && h1.startsWith(`Autobahnwetter A${n}`)) ok(f, 'H1, FAQ sichtbar = FAQPage, about = Wikipedia, keine Warnsprache');
    }
    const hub = read('autobahnwetter.html');
    const hubLinks = new Set([...hub.matchAll(/href="\/autobahnwetter\/(a\d+)"/g)].map((m) => m[1]));
    if (hubLinks.size !== roadShells.length) fail('autobahnwetter.html', `verlinkt ${hubLinks.size} von ${roadShells.length} Autobahn-Seiten`);
    else ok('autobahnwetter.html', `verlinkt alle ${roadShells.length} Autobahn-Seiten`);
    const hubFaq = visibleFaqOk(hub);
    if (hubFaq) fail('autobahnwetter.html', hubFaq); else ok('autobahnwetter.html', 'FAQ sichtbar = FAQPage');
    if (/noindex/.test(hub)) fail('autobahnwetter.html', 'noindex trotz Freischaltung');
  }
}

// 7) E3: Methodik-/Vertrauensseiten — Wortzahl, Typ, FAQ.
console.log('\nMethodik & Vertrauen:');
{
  const words = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const pages = existsSync(join(DIST, 'methodik')) ? readdirSync(join(DIST, 'methodik'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => `methodik/${d.name}/index.html`) : [];
  if (pages.length < 9) fail('methodik/', `erwartet ≥ 9 Methodik-Seiten, gefunden ${pages.length}`); else ok('methodik/', `${pages.length} Methodik-Seiten`);
  for (const rel of [...pages, 'ueber/index.html', 'ohne-tracker/index.html', 'methodik/index.html']) {
    if (!existsSync(join(DIST, rel))) { fail(rel, 'fehlt'); continue; }
    const html = read(rel);
    checkCommon(rel, html, { type: rel === 'methodik/index.html' ? 'CollectionPage' : rel.startsWith('ueber') ? 'AboutPage' : 'TechArticle' });
    const n = words(html);
    if (rel !== 'methodik/index.html' && n < 500) fail(rel, `nur ${n} Wörter (erwartet ≥ 500)`);
    if (/@@TODO_JAN@@/.test(html)) fail(rel, 'Platzhalter @@TODO_JAN@@ im HTML');
  }
}

// 6b) E9: GEO-Dateien — erzeugt statt gepflegt, Zahlen dürfen nicht driften.
console.log('\nGEO-Dateien:');
{
  for (const f of ['llms.txt', 'llms-full.txt']) {
    if (!existsSync(join(DIST, f))) { fail(f, 'fehlt'); continue; }
    const t = read(f);
    if (!/^# buscosun/.test(t)) fail(f, 'kein Titel'); else ok(f, `${Math.round(t.length / 1024)} KB`);
    if (/buscosun\.app/.test(t)) fail(f, 'nennt buscosun.app');
    const rel = [...t.matchAll(/\]\((\/[^)]*)\)/g)].map((m) => m[1]);
    if (rel.length) fail(f, `relative Links (absolut erwartet): ${rel.slice(0, 3).join(', ')}`);
  }
  const llms = read('llms.txt');
  // Länderseiten (/wetter/deutschland/ …) sind keine Orte.
  const COUNTRY_DIRS = new Set(['deutschland', 'oesterreich', 'schweiz']);
  const placeCount = readdirSync(join(DIST, 'wetter'), { withFileTypes: true }).filter((d) => d.isDirectory() && !COUNTRY_DIRS.has(d.name)).length;
  if (!llms.includes(`Übersicht aller ${placeCount} Orte`)) fail('llms.txt', `Ortszahl weicht ab (erwartet ${placeCount})`);
  else ok('llms.txt', `Ortszahl stimmt mit dem Bestand überein (${placeCount})`);
  if (!llms.includes('/atmosphaere/querschnitt')) fail('llms.txt', 'Vertikalschnitt nicht auf dem kanonischen Pfad');
  else ok('llms.txt', 'Vertikalschnitt auf dem kanonischen Pfad');
  if (!/## Zitieren/.test(llms)) fail('llms.txt', 'kein Zitierhinweis');
  else ok('llms.txt', 'Zitierhinweis vorhanden');
  const full = read('llms-full.txt');
  if (full.length > 2 * 1024 * 1024) fail('llms-full.txt', `${Math.round(full.length / 1024)} KB > 2 MB`);
  else ok('llms-full.txt', 'unter 2 MB');
}

// 6c) Zurückgezogene Atmosphäre-Ansichten (Jan 01.11.2026): kein generierter Text führt noch dorthin oder verspricht sie.
console.log('\nZurückgezogene Atmosphäre-Ansichten:');
{
  const OLD_PATH = /atmosphaere(?:\/|--)(?:fliegen|berg-und-weg|arbeitsfenster)\b|funktionen\/arbeitsfenster|ansicht=gonogo/;
  // Nur Ansprüche, die auch verneint nie gebraucht werden. „Föhn-Index" und „Go/No-Go" dürfen verneint stehen, die Tourenansicht hat ein eigenes Go/No-Go.
  const OLD_CLAIM = /Arbeitsfenster|GO\/NO-GO|Föhn-Linse|Flieger-Linse|Thermik-Karte|Profi-Panel|Nerd-Modus/;
  // Gegenprobe: beide Muster schlagen an, der Querschnitt und die Tourenansicht nicht.
  if (!OLD_PATH.test('<a href="/atmosphaere/fliegen/innsbruck">') || !OLD_PATH.test('/funktionen/arbeitsfenster/') || !OLD_CLAIM.test('Das Arbeitsfenster') || OLD_PATH.test('<a href="/atmosphaere/querschnitt">') || OLD_CLAIM.test('Go/No-Go der Tourenansicht')) {
    fail('Gegenprobe', 'Prüfmuster erkennt die alten Pfade nicht');
  } else ok('Gegenprobe', 'Prüfmuster schlägt an');
  const files = [];
  const walk = (rel) => {
    for (const d of readdirSync(join(DIST, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${d.name}` : d.name;
      if (d.isDirectory()) { if (!/^(?:assets|fire|params|countries|data|og)$/.test(r)) walk(r); }
      // `_`-Dateien sind Vorlagen des OG-Renderers, kein ausgelieferter Inhalt.
      else if (/\.(?:html|xml|txt)$/.test(d.name) && !d.name.startsWith('_')) files.push(r);
    }
  };
  walk('');
  const paths = files.filter((r) => OLD_PATH.test(read(r)));
  const claims = files.filter((r) => OLD_CLAIM.test(read(r)));
  if (files.length < 100) fail('dist/', `nur ${files.length} Dateien geprüft`);
  if (paths.length) fail('dist/', `führt noch auf eine alte Ansicht: ${paths.slice(0, 5).join(', ')}`);
  else ok('dist/', `${files.length} Seiten ohne Link auf eine alte Ansicht (auch Sitemap, llms.txt)`);
  if (claims.length) fail('dist/', `verspricht noch eine alte Ansicht: ${claims.slice(0, 5).join(', ')}`);
  else ok('dist/', `${files.length} Seiten ohne Versprechen einer alten Ansicht`);
  // Der Schnitt zeichnet keine 0-°C-Linie (SectionChart.tsx, LAYER_ROWS): die Hauptseite dieser Nische darf sie nicht behaupten.
  const heading = (html, re) => (html.match(re) || [])[1] ?? '';
  for (const [rel, want] of [['atmosphaere--querschnitt.html', /Vertikalschnitt/], ['funktionen/atmosphaere/index.html', /Vertikalschnitt/]]) {
    const html = read(rel);
    const title = heading(html, /<title>([^<]*)<\/title>/), h1 = heading(html, /<h1[^>]*>([^<]*)<\/h1>/);
    if (!want.test(title) || !want.test(h1)) fail(rel, `Title/H1 ohne „Vertikalschnitt": ${title} / ${h1}`);
    else ok(rel, 'Title und H1 nennen den Vertikalschnitt');
    if (/Nullgrad/.test(html)) fail(rel, 'behauptet eine Nullgradgrenze, die der Schnitt nicht zeigt');
    else ok(rel, 'keine Nullgradgrenze behauptet');
    if (!/kein amtliches (?:Produkt|Flugwetter)/i.test(html) || !/dwd\.de\/DE\/fachnutzer\/luftfahrt/.test(html)) fail(rel, 'kein Hinweis „kein amtliches Produkt" mit Link zum DWD');
    else ok(rel, 'nennt „kein amtliches Produkt" und verlinkt den DWD');
  }
  if (heading(read('atmosphaere.html'), /<h1[^>]*>([^<]*)<\/h1>/) === heading(read('atmosphaere--querschnitt.html'), /<h1[^>]*>([^<]*)<\/h1>/)) fail('atmosphaere.html', 'gleiche H1 wie der Querschnitt');
  else ok('atmosphaere.html', 'Hub trägt eine andere H1 als der Querschnitt');
  for (const rel of ['atmosphaere--fliegen.html', 'atmosphaere--berg-und-weg.html', 'atmosphaere--arbeitsfenster.html', 'funktionen/arbeitsfenster/index.html']) {
    if (existsSync(join(DIST, rel))) fail(rel, 'Datei am Pfad verhindert die ungezwungene 301');
  }
}

// 7a) E8: Ortsseiten v2 — Umfang, Klimatabelle, Sonnenzeiten, Lücken-Abschnitt, eigene Description.
console.log('\nOrtsseiten v2:');
{
  const words = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const dirs = existsSync(join(DIST, 'wetter')) ? readdirSync(join(DIST, 'wetter'), { withFileTypes: true }).filter((d) => d.isDirectory() && !['deutschland', 'oesterreich', 'schweiz'].includes(d.name)).map((d) => d.name) : [];
  if (dirs.length < 100) fail('wetter/', `erwartet ≥ 100 Ortsseiten, gefunden ${dirs.length}`);
  else ok('wetter/', `${dirs.length} Ortsseiten`);
  const descs = new Map();
  let thin = [], noClimate = [], noSun = [], noUnknown = [], noCoverage = [];
  for (const slug of dirs) {
    const rel = `wetter/${slug}/index.html`;
    const html = read(rel);
    if (words(html) < 650) thin.push(`${slug} (${words(html)})`);
    if (!/Klima in .* im Jahresverlauf/.test(html) || !/<table>/.test(html)) noClimate.push(slug);
    if (!/Sonnenzeiten in /.test(html)) noSun.push(slug);
    if (!/Was wir für .* nicht wissen/.test(html)) noUnknown.push(slug);
    if (!/"temporalCoverage"/.test(html)) noCoverage.push(slug);
    const d = (html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
    if (descs.has(d)) descs.set(d, [...descs.get(d), slug]); else descs.set(d, [slug]);
  }
  const dupes = [...descs.values()].filter((v) => v.length > 1);
  if (thin.length) fail('wetter/', `${thin.length} Ortsseiten unter 650 Wörtern: ${thin.slice(0, 3).join(', ')}`);
  else ok('wetter/', 'jede Ortsseite ≥ 650 Wörter');
  if (noClimate.length) fail('wetter/', `ohne Klimatabelle: ${noClimate.slice(0, 3).join(', ')}`); else ok('wetter/', 'Klimatabelle auf jeder Ortsseite');
  if (noSun.length) fail('wetter/', `ohne Sonnenzeiten: ${noSun.slice(0, 3).join(', ')}`); else ok('wetter/', 'Sonnenzeiten auf jeder Ortsseite');
  if (noUnknown.length) fail('wetter/', `ohne „Was wir nicht wissen": ${noUnknown.slice(0, 3).join(', ')}`); else ok('wetter/', 'Lücken-Abschnitt auf jeder Ortsseite');
  if (noCoverage.length) fail('wetter/', `Dataset ohne temporalCoverage: ${noCoverage.slice(0, 3).join(', ')}`); else ok('wetter/', 'Dataset nennt den Klimazeitraum');
  if (dupes.length) fail('wetter/', `${dupes.length} Description-Gruppen mehrfach vergeben (z. B. ${dupes[0].slice(0, 3).join(', ')})`);
  else ok('wetter/', 'jede Ortsseite hat eine eigene Description');
}

// 7b) E5/E6: Glossar und Zielgruppen-Seiten — Umfang, Negativ-Abschnitt, Typ.
console.log('\nZielgruppen & Glossar:');
{
  const words = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (!existsSync(join(DIST, 'glossar', 'index.html'))) fail('glossar/', 'fehlt');
  else {
    const html = read('glossar/index.html');
    checkCommon('glossar/index.html', html, {});
    const terms = (html.match(/<dt[ >]/g) || []).length;
    if (terms < 60) fail('glossar/', `nur ${terms} Begriffe (erwartet ≥ 60)`); else ok('glossar/', `${terms} Begriffe mit Anker`);
    if (!/DefinedTermSet/.test(html)) fail('glossar/', 'kein DefinedTermSet in den strukturierten Daten');
    else ok('glossar/', 'DefinedTermSet vorhanden');
  }
  const audienceDirs = existsSync(join(DIST, 'fuer')) ? readdirSync(join(DIST, 'fuer'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
  // 16 until Jan 11.11.: Veranstalter, Hochzeit, Fotografen and Astronomie went with the event planner.
  if (audienceDirs.length < 12) fail('fuer/', `erwartet ≥ 12 Zielgruppen-Seiten, gefunden ${audienceDirs.length}`);
  else ok('fuer/', `${audienceDirs.length} Zielgruppen-Seiten`);
  const descs = new Map();
  for (const name of audienceDirs) {
    const rel = `fuer/${name}/index.html`;
    const html = read(rel);
    checkCommon(rel, html, {});
    const n = words(html);
    if (n < 500) fail(rel, `nur ${n} Wörter (erwartet ≥ 500)`);
    // Jede Zielgruppen-Seite muss sagen, was buscosun für sie NICHT kann (Z5, D-04).
    if (!/<h2[^>]*>[^<]*nicht[^<]*<\/h2>/i.test(html)) fail(rel, 'kein Abschnitt „Was buscosun hier nicht kann"');
    const d = (html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
    if (descs.has(d)) fail(rel, `Description identisch mit ${descs.get(d)}`); else descs.set(d, rel);
  }
  if (audienceDirs.length && !existsSync(join(DIST, 'fuer', 'index.html'))) fail('fuer/', 'Hub fehlt');
}

// 8) E3: Entitäten-Graph — Organization/WebSite je Seite genau einmal definiert, jede @id-Referenz auflösbar;
// DWD-Etikett GeoNutzV statt CC BY 4.0.
console.log('\nEntitäten-Graph:');
{
  const ORG = 'https://buscosun.com/#organization', WEB = 'https://buscosun.com/#website';
  const files = ['index.html', 'wetterkarte.html', 'wetterkarte--temperatur.html', 'wetter/muenchen/index.html', 'wissen/foehn/index.html', 'funktionen/wetterkarte/index.html', 'wetterlage/omega-lage-mitteleuropa/index.html', 'lizenzen/index.html', 'impressum/index.html', 'methodik/hoehenkorrektur/index.html', 'ueber/index.html'];
  // Phase GLS: ein Steckbrief und der Atlas, sobald es sie gibt (ohne Datenstand fehlen beide absichtlich).
  for (const rel of ['_gl/ch-grosser-aletschgletscher.html', 'gletscher-atlas/index.html', 'gletscher-atlas/deutschland/index.html']) if (existsSync(join(DIST, rel))) files.push(rel);
  for (const rel of files) {
    if (!existsSync(join(DIST, rel))) { fail(rel, 'fehlt (Entitäten-Prüfung)'); continue; }
    const html = read(rel);
    const defs = new Map(); const refs = new Set(); let inlineOrg = 0;
    const walk = (o, top) => {
      if (Array.isArray(o)) return o.forEach((x) => walk(x, false));
      if (!o || typeof o !== 'object') return;
      if (o['@id'] && Object.keys(o).filter((k) => k !== '@context').length <= 2) refs.add(o['@id']);
      else if (o['@id']) defs.set(o['@id'], (defs.get(o['@id']) || 0) + 1);
      if (!top && o['@type'] === 'Organization' && o.name === 'buscosun' && !o['@id']) inlineOrg++;
      for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v, false);
    };
    for (const b of jsonLdBlocks(html)) { try { walk(JSON.parse(b), true); } catch { /* bereits oben gemeldet */ } }
    if (defs.get(ORG) !== 1) fail(rel, `Organization @id ${defs.get(ORG) ?? 0}× definiert (erwartet 1)`);
    if (defs.get(WEB) !== 1) fail(rel, `WebSite @id ${defs.get(WEB) ?? 0}× definiert (erwartet 1)`);
    const dangling = [...refs].filter((id) => !defs.has(id));
    if (dangling.length) fail(rel, `@id-Referenz ohne Definition: ${dangling.join(', ')}`);
    if (inlineOrg) fail(rel, `${inlineOrg} eingebettete Organization ohne @id (linkEntities greift nicht)`);
    if (!defs.get(ORG) || !defs.get(WEB) || dangling.length || inlineOrg) continue;
    ok(rel, `Entitäten: ${defs.size} Definitionen, ${refs.size} Referenzen, alle auflösbar`);
    if (/DWD, CC BY 4\.0/.test(html)) fail(rel, 'Footer nennt „DWD, CC BY 4.0" — DWD-Open-Data steht unter GeoNutzV');
  }
}

// 9) Phase GLS (audit/gletscher-seo.md): Gletscher-Steckbriefe und Gletscher-Atlas.
// Jede Seite der Stufen A/B hat eine eigene Shell (dist/_gl/<segment>.html), eine Zeile in dist/_redirects, einen
// Self-Canonical auf /gletscher/<segment>, eigenen Title und eigene Description, den Faktenblock mit `data-static-page`
// (für `src/seo/staticPage.ts`) und genug eigenen Text; Atlas-Seiten sind statisch und indexierbar.
console.log('\nGletscherseiten (Phase GLS):');
{
  const dataFile = join(ROOT, 'scripts', 'seo', 'data', 'glacier-pages.json');
  const data = existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : null;
  const want = data ? data.glaciers.filter((g) => g.tier).map((g) => g.seg) : [];
  const glDir = join(DIST, '_gl');
  const shells = existsSync(glDir) ? readdirSync(glDir).filter((f) => f.endsWith('.html')).map((f) => f.replace(/\.html$/, '')).sort() : [];
  const words = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  if (!data) fail('glacier-pages.json', 'Datenstand fehlt (node scripts/seo/refresh-glacier-pages.mjs)');
  else if (shells.length !== want.length || want.some((sg) => !shells.includes(sg))) fail('_gl/', `erwartet ${want.length} Steckbrief-Shells, gefunden ${shells.length}`);
  else ok('_gl/', `${shells.length} Steckbrief-Shells (Stufe A/B laut Datenstand ${data.build})`);
  const red = existsSync(join(DIST, '_redirects')) ? read('_redirects') : '';
  const rules = red.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.trim().split(/\s+/));
  const bad = rules.filter(([from, to, st]) => st !== '200' || !/^\/gletscher\/(ch|at|de)-[a-z0-9-]+$/.test(from) || to !== `/_gl/${from.slice('/gletscher/'.length)}.html` || !existsSync(join(DIST, to.slice(1))));
  if (rules.length !== shells.length || bad.length) fail('_redirects', `${rules.length} Regeln für ${shells.length} Shells, ${bad.length} fehlerhaft (${bad.slice(0, 2).map((r) => r.join(' ')).join('; ')})`);
  else ok('_redirects', `${rules.length} Regeln /gletscher/<segment> → /_gl/<segment>.html (200)`);
  // Gegenprobe der Regelprüfung: eine falsche Zielzeile muss auffallen.
  const probe = [['/gletscher/ch-x', '/_gl/ch-y.html', '200']].filter(([from, to]) => to !== `/_gl/${from.slice('/gletscher/'.length)}.html`).length;
  if (probe !== 1) fail('_redirects', 'Gegenprobe: falsche Zielzeile nicht erkannt'); else ok('_redirects', 'Gegenprobe greift');
  const titles = new Map(), descs = new Map();
  const problems = [];
  for (const sg of shells) {
    const rel = `_gl/${sg}.html`;
    const html = read(rel);
    const p = [];
    const canon = (html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1];
    if (canon !== `https://buscosun.com/gletscher/${sg}`) p.push(`canonical ${canon}`);
    if (!/<meta name="robots" content="index, follow/.test(html) || /noindex/.test(html)) p.push('robots nicht index');
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
    const desc = (html.match(/name=["']description["'][^>]*content=["']([^"']+)["']/i) || [])[1] || '';
    if ((html.match(/<title>/g) || []).length !== 1) p.push('Title mehrfach');
    if ((html.match(/name="description"/g) || []).length !== 1) p.push('Description mehrfach');
    if ((html.match(/rel="canonical"/g) || []).length !== 1) p.push('Canonical mehrfach');
    if (titles.has(title)) p.push(`Title wie ${titles.get(title)}`); else titles.set(title, sg);
    if (descs.has(desc)) p.push(`Description wie ${descs.get(desc)}`); else descs.set(desc, sg);
    if (desc.length > 160) p.push(`Description ${desc.length} Zeichen`);
    if (!html.includes(`data-static-page="/gletscher/${sg}"`)) p.push('Faktenblock ohne data-static-page');
    if (!/<script type="module"/.test(html) || !html.includes('<div id="root">')) p.push('keine App-Shell');
    if ((html.match(/<h1[\s>]/g) || []).length !== 1) p.push('nicht genau eine H1');
    if (!html.includes('<h2>Steckbrief</h2>')) p.push('Steckbrief fehlt');
    if (!/"@type":"Landform"/.test(html)) p.push('kein Landform');
    if (!/"@type":"BreadcrumbList"/.test(html)) p.push('keine BreadcrumbList');
    if (/"value":0[,}]/.test(html)) p.push('Platzhalterwert 0 im JSON-LD');
    if (leadWordCount(html) < 40) p.push(`Lead ${leadWordCount(html)} Wörter`);
    const n = words(html.slice(html.indexOf('<div id="root">')));
    if (n < 250) p.push(`nur ${n} Wörter`);
    const glLinks = new Set([...html.matchAll(/href="\/gletscher\/((?:ch|at|de)-[a-z0-9-]+)"/g)].map((m) => m[1]).filter((x) => x !== sg));
    if (glLinks.size < 3) p.push(`nur ${glLinks.size} Links auf andere Steckbriefe`);
    if (!html.includes('href="/gletscher-atlas/"')) p.push('kein Link auf den Atlas');
    if (/hreflang=/.test(html)) p.push('hreflang');
    if (p.length) problems.push(`${sg}: ${p.join(', ')}`);
  }
  if (problems.length) { for (const x of problems.slice(0, 10)) fail('_gl/', x); if (problems.length > 10) fail('_gl/', `… und ${problems.length - 10} weitere`); }
  else if (shells.length) ok('_gl/', `jede Shell: Self-Canonical, index, eigener Title/Description (≤ 160), eine H1, Landform + BreadcrumbList, ≥ 250 Wörter, ≥ 3 Steckbrief-Links, Atlas-Link`);
  if (shells.includes('ch-grosser-aletschgletscher')) {
    const html = read('_gl/ch-grosser-aletschgletscher.html');
    checkCommon('_gl/ch-grosser-aletschgletscher.html', html, { type: 'Landform' });
  }
  // Atlas
  const atlasDir = join(DIST, 'gletscher-atlas');
  const atlasPages = [];
  const walkAtlas = (rel) => { for (const d of readdirSync(join(DIST, rel), { withFileTypes: true })) { if (d.isDirectory()) walkAtlas(`${rel}/${d.name}`); else if (d.name === 'index.html') atlasPages.push(`${rel}/index.html`); } };
  if (existsSync(atlasDir)) walkAtlas('gletscher-atlas');
  if (data && atlasPages.length < 4) fail('gletscher-atlas/', `nur ${atlasPages.length} Atlas-Seiten (Hub + 3 Länder erwartet)`);
  else if (atlasPages.length) ok('gletscher-atlas/', `${atlasPages.length} Atlas-Seiten`);
  for (const rel of atlasPages) {
    const html = read(rel);
    checkCommon(rel, html, { type: 'CollectionPage' });
    const canon = (html.match(/rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) || [])[1];
    if (canon !== `https://buscosun.com/${rel.replace(/index\.html$/, '')}`) fail(rel, `canonical ${canon}`);
    if (words(html) < 200) fail(rel, `nur ${words(html)} Wörter`);
  }
  if (atlasPages.includes('gletscher-atlas/index.html') && !/"@type":"Dataset"/.test(read('gletscher-atlas/index.html'))) fail('gletscher-atlas/index.html', 'kein Dataset');
  if (existsSync(join(DIST, 'gletscher-atlas', 'deutschland', 'index.html'))) {
    const de = read('gletscher-atlas/deutschland/index.html');
    const names = ['Höllentalferner', 'Nördlicher Schneeferner', 'Blaueis', 'Watzmanngletscher'];
    if (!names.every((n) => de.includes(n)) || !/vier Gletscher/.test(de)) fail('gletscher-atlas/deutschland/', 'nennt nicht die vier deutschen Gletscher');
    else ok('gletscher-atlas/deutschland/', 'nennt die vier deutschen Gletscher');
  }
  // Sitemap, robots, Route-Shell
  if (data) {
    const index = read('sitemap.xml');
    if (!index.includes('https://buscosun.com/sitemap-gletscher.xml')) fail('sitemap.xml', 'Teilliste sitemap-gletscher.xml fehlt im Index');
    const part = existsSync(join(DIST, 'sitemap-gletscher.xml')) ? read('sitemap-gletscher.xml') : '';
    const locs = [...part.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const wantLocs = [...shells.map((sg) => `https://buscosun.com/gletscher/${sg}`), ...atlasPages.map((r) => `https://buscosun.com/${r.replace(/index\.html$/, '')}`)];
    const missing = wantLocs.filter((u) => !locs.includes(u));
    const all = ['sitemap-pages.xml', 'sitemap-orte.xml', 'sitemap-orte-2.xml', 'sitemap-gletscher.xml'].flatMap((f) => [...read(f).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    if (missing.length || locs.length !== wantLocs.length) fail('sitemap-gletscher.xml', `${locs.length} URLs, ${missing.length} fehlen (${missing.slice(0, 2).join(', ')})`);
    else if (new Set(all).size !== all.length) fail('sitemap', 'URL in mehreren Teillisten');
    else if ([...part.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].length !== locs.length) fail('sitemap-gletscher.xml', 'lastmod fehlt');
    else ok('sitemap-gletscher.xml', `${locs.length} URLs, alle mit lastmod aus dem Datenstand, keine Doppelung über die Teillisten`);
    const robots = read('robots.txt').replace(/\r/g, '');
    if (!/\nDisallow: \/_gl\/\n/.test(robots) || !robots.includes('Sitemap: https://buscosun.com/sitemap-gletscher.xml')) fail('robots.txt', 'Disallow /_gl/ oder Sitemap-Zeile der Gletscher fehlt');
    else ok('robots.txt', 'sperrt /_gl/ und nennt sitemap-gletscher.xml');
    const shell = read('gletscher.html');
    if (!shell.includes('href="/gletscher-atlas/"') || !/href="\/gletscher\/(ch|at|de)-/.test(shell)) fail('gletscher.html', 'Route-Shell verlinkt Atlas oder Steckbriefe nicht');
    else ok('gletscher.html', 'Route-Shell verlinkt Atlas und Steckbriefe');
  }
}

// Phase WBS: Waldbrandgefahr nach Land und Region (Liste aus scripts/seo/fireRegions.mjs).
console.log('\nWaldbrandgefahr nach Region:');
verifyFireRegions({ DIST, read, ok, fail, jsonLdBlocks });

const homeApps = jsonLdBlocks(read('index.html')).filter((b) => /"@type":"WebApplication"/.test(b)).length;
if (homeApps !== 1) fail('index.html', `erwartet genau 1× WebApplication, gefunden ${homeApps}`);
else ok('index.html', 'genau eine WebApplication');

console.log(`\n[verify-seo] ${checks} Checks ok, ${failures} Fehler.`);
process.exit(failures > 0 ? 1 : 0);
