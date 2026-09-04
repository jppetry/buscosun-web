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
// Eltern-Shell (SEO-AUDIT.md §2). 24 = 18 Layer + 3 Atmosphäre-Linsen + 3 Brand-Sichten;
// die exakte Menge prüft verify-routing gegen die Routen-Tabelle.
console.log('\nSub-Routen-Shells:');
const subShells = readdirSync(DIST).filter((f) => /^[a-z]+--[a-z0-9-]+\.html$/.test(f)).sort();
if (subShells.length !== 24) fail('dist/', `erwartet 24 Sub-Routen-Shells, gefunden ${subShells.length}`);
else ok('dist/', '24 Sub-Routen-Shells vorhanden');
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

// 6) Sitemap (E1): lastmod je URL aus dem Inhalt, kein changefreq, alle URLs kanonisch.
console.log('\nSitemap:');
{
  const sm = read('sitemap.xml');
  const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const mods = [...sm.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  if (locs.length === 0) fail('sitemap.xml', 'keine URLs');
  else ok('sitemap.xml', `${locs.length} URLs`);
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

const homeApps = jsonLdBlocks(read('index.html')).filter((b) => /"@type":"WebApplication"/.test(b)).length;
if (homeApps !== 1) fail('index.html', `erwartet genau 1× WebApplication, gefunden ${homeApps}`);
else ok('index.html', 'genau eine WebApplication');

console.log(`\n[verify-seo] ${checks} Checks ok, ${failures} Fehler.`);
process.exit(failures > 0 ? 1 : 0);
