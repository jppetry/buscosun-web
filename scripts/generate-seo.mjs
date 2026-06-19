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
import {
  SITE, renderPlacePage, renderHomeRootContent, homeHeadExtras, escapeHtml, metaFor,
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
    <meta property="og:image" content="${SITE.url}/og.svg" />
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

// 3) sitemap.xml
function sitemap() {
  const urls = [
    { loc: `${SITE.url}/`, pri: '1.0' },
    { loc: `${SITE.url}/wetter/`, pri: '0.8' },
    ...PLACES.map((p) => ({ loc: `${SITE.url}/wetter/${p.slug}/`, pri: '0.6' })),
  ];
  const body = urls.map((u) =>
    `  <url><loc>${u.loc}</loc><lastmod>${BUILD_DATE}</lastmod><changefreq>daily</changefreq><priority>${u.pri}</priority></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}
writeFileSync(join(DIST, 'sitemap.xml'), sitemap(), 'utf8');

// 4) Home anreichern: Head-Meta/JSON-LD + crawlbarer #root-Inhalt
const indexPath = join(DIST, 'index.html');
let html = readFileSync(indexPath, 'utf8');
if (!html.includes('og:site_name')) {
  html = html.replace('</head>', `    ${homeHeadExtras()}\n  </head>`);
}
html = html.replace('<div id="root"></div>', `<div id="root">${renderHomeRootContent(PLACES)}</div>`);
writeFileSync(indexPath, html, 'utf8');

console.log(`[seo] ${pages} Geo-Seiten, /wetter/-Hub, sitemap.xml (${PLACES.length + 2} URLs), Home angereichert. Build ${BUILD_DATE}.`);
