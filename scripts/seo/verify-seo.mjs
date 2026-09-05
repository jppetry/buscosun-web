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
// Eltern-Shell (SEO-AUDIT.md §2). 37 = 18 Layer + 4 Atmosphäre + 5 Brand-Sichten + 10 Event-Anlässe (E7);
// die exakte Menge prüft verify-routing gegen die Routen-Tabelle.
console.log('\nSub-Routen-Shells:');
const subShells = readdirSync(DIST).filter((f) => /^[a-z]+--[a-z0-9-]+\.html$/.test(f)).sort();
if (subShells.length !== 37) fail('dist/', `erwartet 37 Sub-Routen-Shells, gefunden ${subShells.length}`);
else ok('dist/', '37 Sub-Routen-Shells vorhanden');
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
  const expected = ['sitemap-pages.xml', 'sitemap-orte.xml'];
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
  if (mods.length !== locs.length || mods.some((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d))) fail('sitemap.xml', 'lastmod fehlt oder ist kein ISO-Datum');
  else if (new Set(mods).size < 2) fail('sitemap.xml', 'alle lastmod identisch — Build-Datum statt Inhaltsdatum?');
  else ok('sitemap.xml', `lastmod aus dem Inhalt (${new Set(mods).size} verschiedene Daten)`);
  const subUrls = subShells.map((f) => { const [r, sl] = f.replace(/\.html$/, '').split('--'); return `https://buscosun.com/${r}/${sl}`; });
  const missing = subUrls.filter((u) => !locs.includes(u));
  if (missing.length) fail('sitemap.xml', `Sub-Routen fehlen: ${missing.join(', ')}`);
  else ok('sitemap.xml', 'alle Sub-Routen-Shells enthalten');
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
  const placeCount = readdirSync(join(DIST, 'wetter'), { withFileTypes: true }).filter((d) => d.isDirectory()).length;
  if (!llms.includes(`Übersicht aller ${placeCount} Orte`)) fail('llms.txt', `Ortszahl weicht ab (erwartet ${placeCount})`);
  else ok('llms.txt', `Ortszahl stimmt mit dem Bestand überein (${placeCount})`);
  if (!llms.includes('/atmosphaere/arbeitsfenster')) fail('llms.txt', 'Go/No-Go nicht auf dem kanonischen Pfad');
  else ok('llms.txt', 'Go/No-Go auf dem kanonischen Pfad');
  if (!/## Zitieren/.test(llms)) fail('llms.txt', 'kein Zitierhinweis');
  else ok('llms.txt', 'Zitierhinweis vorhanden');
  const full = read('llms-full.txt');
  if (full.length > 2 * 1024 * 1024) fail('llms-full.txt', `${Math.round(full.length / 1024)} KB > 2 MB`);
  else ok('llms-full.txt', 'unter 2 MB');
}

// 7a) E8: Ortsseiten v2 — Umfang, Klimatabelle, Sonnenzeiten, Lücken-Abschnitt, eigene Description.
console.log('\nOrtsseiten v2:');
{
  const words = (html) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  const dirs = existsSync(join(DIST, 'wetter')) ? readdirSync(join(DIST, 'wetter'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
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
  if (audienceDirs.length < 16) fail('fuer/', `erwartet ≥ 16 Zielgruppen-Seiten, gefunden ${audienceDirs.length}`);
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

const homeApps = jsonLdBlocks(read('index.html')).filter((b) => /"@type":"WebApplication"/.test(b)).length;
if (homeApps !== 1) fail('index.html', `erwartet genau 1× WebApplication, gefunden ${homeApps}`);
else ok('index.html', 'genau eine WebApplication');

console.log(`\n[verify-seo] ${checks} Checks ok, ${failures} Fehler.`);
process.exit(failures > 0 ? 1 : 0);
