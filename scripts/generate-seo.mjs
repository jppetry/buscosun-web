/**
 * Post-Build-SEO/GEO-Generator (läuft nach `vite build`, schreibt nach dist/).
 *
 * Erzeugt: programmatische Geo-Seiten /wetter/<slug>/, einen /wetter/-Hub, eine
 * sitemap.xml und reichert dist/index.html (Home) um crawlbaren Inhalt + Meta +
 * JSON-LD an. Reines Node-ESM, kein App-Import → kann den App-Bundle nicht brechen.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES } from './seo/places.mjs';
import { EXPLAINERS, EXPLAINERS_BY_SLUG } from './seo/explainers.mjs';
import { TOOLS } from './seo/tools.mjs';
import { EVENTS } from './seo/events.mjs';
import { LEGAL_PAGES, operatorIncomplete } from './seo/legal.mjs';
import { buildLicensePage } from './seo/licenses.mjs';
import {
  SITE, renderPlacePage, renderHomeRootContent, homeHeadExtras, escapeHtml, metaFor,
  renderExplainerPage, renderWissenHub, renderToolPage, renderFunktionenHub,
  renderEventPage, renderWetterlageHub, renderLegalPage,
} from './seo/content.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BUILD_DATE = new Date().toISOString().slice(0, 10);

if (!existsSync(DIST)) {
  console.error('[seo] dist/ fehlt — bitte zuerst `vite build` ausführen.');
  process.exit(1);
}

let pages = 0;

// 1) Geo-Seiten
for (const place of PLACES) {
  const dir = join(DIST, 'wetter', place.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderPlacePage(place), 'utf8');
  pages++;
}

// 2) /wetter/-Hub (Index aller Orte, gruppiert nach Land)
function hubPage() {
  const byCountry = (c, label, flag) => {
    const items = PLACES.filter((p) => p.country === c)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((p) => `<a href="/wetter/${p.slug}/">${escapeHtml(p.name)}</a>`).join('\n        ');
    return `<section><h2>${flag} ${label}</h2><div class="links">\n        ${items}\n      </div></section>`;
  };
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wetter in DACH-Orten | ${SITE.name}</title>
    <meta name="description" content="Wetter-Übersicht für Orte in Deutschland, Österreich und der Schweiz — höhenkorrigiert, aus amtlichen Quellen, ohne Tracker." />
    <link rel="canonical" href="${SITE.url}/wetter/" />
    <link rel="alternate" hreflang="de-DE" href="${SITE.url}/wetter/" />
    <link rel="alternate" hreflang="de-AT" href="${SITE.url}/wetter/" />
    <link rel="alternate" hreflang="de-CH" href="${SITE.url}/wetter/" />
    <link rel="alternate" hreflang="x-default" href="${SITE.url}/wetter/" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta name="theme-color" content="#2C2A26" />
    <meta property="og:title" content="Wetter in DACH-Orten | ${SITE.name}" />
    <meta property="og:image" content="${SITE.url}/og/wetter.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE.url}/og/wetter.png" />
    <style>:root{--sand:#FAF6EA;--ink:#2C2A26;--stone:#5C5447;--terra:#C97B47;--border:#E0D6BE}
body{margin:0;font-family:system-ui,sans-serif;background:var(--sand);color:var(--ink);line-height:1.6}
.wrap{max-width:820px;margin:0 auto;padding:2rem 1.25rem 4rem}h1{font-size:2rem}h2{font-size:1.15rem;border-bottom:1px solid var(--border);padding-bottom:.3rem;margin-top:2rem}
.links{display:flex;flex-wrap:wrap;gap:.5rem}.links a{background:#fff;border:1px solid var(--border);border-radius:999px;padding:.35rem .8rem;text-decoration:none;color:var(--ink);font-size:.9rem}
a{color:var(--terra)}</style>
  </head>
  <body>
    <div class="wrap">
      <nav style="font-size:.85rem;color:var(--stone);margin-bottom:1rem"><a href="/" style="color:var(--stone)">Start</a> › Wetter</nav>
      <h1>Wetter in DACH-Orten</h1>
      <p>Höhenkorrigierte Vorhersage aus amtlichen Quellen (DWD · GeoSphere · MeteoSwiss) für ${PLACES.length} Orte in Deutschland, Österreich und der Schweiz.</p>
      ${byCountry('DE', 'Deutschland', '🇩🇪')}
      ${byCountry('AT', 'Österreich', '🇦🇹')}
      ${byCountry('CH', 'Schweiz', '🇨🇭')}
    </div>
  </body>
</html>
`;
}
mkdirSync(join(DIST, 'wetter'), { recursive: true });
writeFileSync(join(DIST, 'wetter', 'index.html'), hubPage(), 'utf8');

// 2c) Explainer (/wissen/<slug>/) + /wissen/-Hub
let explainerPages = 0;
for (const ex of EXPLAINERS) {
  const dir = join(DIST, 'wissen', ex.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderExplainerPage(ex, EXPLAINERS_BY_SLUG), 'utf8');
  explainerPages++;
}
mkdirSync(join(DIST, 'wissen'), { recursive: true });
writeFileSync(join(DIST, 'wissen', 'index.html'), renderWissenHub(EXPLAINERS), 'utf8');

// 2d) Tool-Landingpages (/funktionen/<slug>/) + /funktionen/-Hub
let toolPages = 0;
for (const tool of TOOLS) {
  const dir = join(DIST, 'funktionen', tool.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderToolPage(tool), 'utf8');
  toolPages++;
}
mkdirSync(join(DIST, 'funktionen'), { recursive: true });
writeFileSync(join(DIST, 'funktionen', 'index.html'), renderFunktionenHub(TOOLS), 'utf8');

// 2e) Event-/Wetterlage-Artikel (/wetterlage/<slug>/) + Hub
let eventPages = 0;
for (const ev of EVENTS) {
  const dir = join(DIST, 'wetterlage', ev.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderEventPage(ev), 'utf8');
  eventPages++;
}
mkdirSync(join(DIST, 'wetterlage'), { recursive: true });
writeFileSync(join(DIST, 'wetterlage', 'index.html'), renderWetterlageHub(EVENTS), 'utf8');

// 2f) Rechtsseiten (/impressum/, /datenschutz/, /kontakt/) — V-103. Indexierbar:
// ein Impressum muss auffindbar sein.
// V-104: /lizenzen/ nutzt dieselbe Hülle, zieht seine Modelltabelle aber
// build-seitig aus src/fusion/modelCatalog.ts — eine abgetippte Zweitliste
// würde driften (die Lehre aus V-80).
const LICENSE_PAGE = buildLicensePage();
for (const page of [...LEGAL_PAGES, LICENSE_PAGE]) {
  const dir = join(DIST, page.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderLegalPage(page), 'utf8');
}
if (operatorIncomplete()) {
  console.warn(
    '[seo] ⚠️  Impressum UNVOLLSTÄNDIG — in scripts/seo/legal.mjs stehen noch\n' +
    '        TODO-Platzhalter (Name, Anschrift). Die Seite markiert die Lücken\n' +
    '        sichtbar, statt Daten zu erfinden. Vor dem produktiven Deploy füllen.',
  );
}

// 2b) 404.html — echte Fehlerseite (Host muss sie mit HTTP 404 ausliefern,
// siehe docs/seo-geo/your-actions.md). noindex, aber crawlbar verlinkt.
function notFoundPage() {
  return `<!doctype html>
<html lang="de">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Seite nicht gefunden (404) | ${SITE.name}</title>
    <meta name="robots" content="noindex, follow" />
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta name="theme-color" content="#2C2A26" />
    <style>:root{--sand:#FAF6EA;--ink:#2C2A26;--stone:#5C5447;--terra:#C97B47;--border:#E0D6BE}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--sand);color:var(--ink);line-height:1.6}
.wrap{max-width:640px;margin:0 auto;padding:4rem 1.25rem;text-align:center}h1{font-size:2.2rem;margin:.2rem 0}
.cta{display:inline-block;background:var(--ink);color:#fff;text-decoration:none;font-weight:600;padding:.7rem 1.2rem;border-radius:999px;margin:1rem .3rem}
.cta:hover{background:var(--terra)}a{color:var(--terra)}</style>
  </head>
  <body>
    <div class="wrap">
      <h1>404 — Seite nicht gefunden</h1>
      <p>Diese Seite gibt es nicht (mehr). Vielleicht suchst du das Wetter für einen Ort oder eine der Funktionen von ${SITE.name}.</p>
      <a class="cta" href="/">Zur Startseite</a>
      <a class="cta" href="/wetter/">Wetter nach Ort</a>
    </div>
  </body>
</html>
`;
}
writeFileSync(join(DIST, '404.html'), notFoundPage(), 'utf8');

// 3) sitemap.xml
function sitemap() {
  const urls = [
    { loc: `${SITE.url}/`, pri: '1.0' },
    { loc: `${SITE.url}/wetter/`, pri: '0.8' },
    ...PLACES.map((p) => ({ loc: `${SITE.url}/wetter/${p.slug}/`, pri: '0.6' })),
    { loc: `${SITE.url}/wissen/`, pri: '0.7' },
    // Nur vollständige Explainer indexieren (Scaffolds sind noindex).
    ...EXPLAINERS.filter((e) => e.status === 'full').map((e) => ({ loc: `${SITE.url}/wissen/${e.slug}/`, pri: '0.6' })),
    { loc: `${SITE.url}/funktionen/`, pri: '0.7' },
    ...TOOLS.filter((t) => t.status === 'full').map((t) => ({ loc: `${SITE.url}/funktionen/${t.slug}/`, pri: '0.6' })),
    { loc: `${SITE.url}/wetterlage/`, pri: '0.6' },
    ...EVENTS.filter((e) => e.status === 'full').map((e) => ({ loc: `${SITE.url}/wetterlage/${e.slug}/`, pri: '0.7' })),
    // Pflichtseiten: niedrige Priorität, aber indexierbar und auffindbar.
    ...[...LEGAL_PAGES, LICENSE_PAGE].map((l) => ({ loc: `${SITE.url}/${l.slug}/`, pri: '0.3' })),
  ];
  const body = urls.map((u) =>
    `  <url><loc>${u.loc}</loc><lastmod>${BUILD_DATE}</lastmod><changefreq>daily</changefreq><priority>${u.pri}</priority></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
writeFileSync(join(DIST, 'sitemap.xml'), sitemap(), 'utf8');

// 3b) RSS-2.0-Feed (/feed.xml) — neueste Inhalte für Discover/Reader. Enthält
// Event-Artikel + vollständige Explainer, neueste zuerst. Nicht in robots blockiert.
function rssFeed() {
  const items = [
    ...EVENTS.filter((e) => e.status === 'full').map((e) => ({
      title: e.title, link: `${SITE.url}/wetterlage/${e.slug}/`, desc: e.dek, date: e.dateModified, cat: 'Wetterlage',
    })),
    ...EXPLAINERS.filter((e) => e.status === 'full').map((e) => ({
      title: e.title, link: `${SITE.url}/wissen/${e.slug}/`, desc: e.answer, date: e.dateModified, cat: 'Wetterwissen',
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));
  const rfc822 = (iso) => new Date(iso + 'T08:00:00Z').toUTCString();
  const body = items.map((it) => `    <item>
      <title>${escapeHtml(it.title)}</title>
      <link>${it.link}</link>
      <guid isPermaLink="true">${it.link}</guid>
      <category>${escapeHtml(it.cat)}</category>
      <description>${escapeHtml(it.desc)}</description>
      <pubDate>${rfc822(it.date)}</pubDate>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(SITE.name)} — Wetterwissen &amp; Wetterlagen</title>
    <link>${SITE.url}/</link>
    <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${escapeHtml(SITE.tagline)} — Erklärungen und Einordnungen aktueller Wetterlagen in der DACH-Region.</description>
    <language>de</language>
    <lastBuildDate>${rfc822(BUILD_DATE)}</lastBuildDate>
${body}
  </channel>
</rss>
`;
}
writeFileSync(join(DIST, 'feed.xml'), rssFeed(), 'utf8');

// 3c) News-Sitemap (/sitemap-news.xml) — Google-News-Format. Nur Artikel der
// letzten 2 Tage (Google-News-Vorgabe); ältere werden ausgelassen.
function newsSitemap() {
  const cutoff = new Date(BUILD_DATE + 'T00:00:00Z').getTime() - 2 * 86400000;
  const recent = EVENTS.filter((e) => e.status === 'full' && new Date(e.datePublished + 'T00:00:00Z').getTime() >= cutoff);
  const body = recent.map((e) => `  <url>
    <loc>${SITE.url}/wetterlage/${e.slug}/</loc>
    <news:news>
      <news:publication>
        <news:name>${escapeHtml(SITE.name)}</news:name>
        <news:language>de</news:language>
      </news:publication>
      <news:publication_date>${e.datePublished}</news:publication_date>
      <news:title>${escapeHtml(e.title)}</news:title>
    </news:news>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${body}
</urlset>
`;
}
writeFileSync(join(DIST, 'sitemap-news.xml'), newsSitemap(), 'utf8');

// 4) Home anreichern: Head-Meta/JSON-LD + crawlbarer #root-Inhalt
const indexPath = join(DIST, 'index.html');
let html = readFileSync(indexPath, 'utf8');
if (!html.includes('og:site_name')) {
  html = html.replace('</head>', `    ${homeHeadExtras()}\n  </head>`);
}
html = html.replace('<div id="root"></div>', `<div id="root">${renderHomeRootContent(PLACES)}</div>`);
writeFileSync(indexPath, html, 'utf8');

const fullExplainers = EXPLAINERS.filter((e) => e.status === 'full').length;
const fullTools = TOOLS.filter((t) => t.status === 'full').length;
const fullEvents = EVENTS.filter((e) => e.status === 'full').length;
const urlCount = PLACES.length + 5 + fullExplainers + fullTools + fullEvents + LEGAL_PAGES.length + 1; // +1 = /lizenzen/ (V-104)
console.log(`[seo] ${pages} Geo, ${explainerPages} Explainer (${fullExplainers} idx), ${toolPages} Tools (${fullTools} idx), ${eventPages} Wetterlage (${fullEvents} idx), ${LEGAL_PAGES.length} Rechtsseiten + Hubs, sitemap.xml (${urlCount} URLs), feed.xml, sitemap-news.xml, Home angereichert. Build ${BUILD_DATE}.`);
