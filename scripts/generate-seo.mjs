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
import { allMethodikPages, buildUeberPage, buildOhneTrackerPage, METHODIK_UPDATED } from './seo/methodik.mjs';
import { GLOSSARY, GLOSSARY_UPDATED, renderGlossaryPage } from './seo/glossary.mjs';
import { AUDIENCES, AUDIENCES_UPDATED, renderAudiencePage, renderAudienceHub } from './seo/audiences.mjs';
import {
  SITE, renderPlacePage, renderHomeRootContent, homeHeadExtras, escapeHtml, metaFor,
  renderExplainerPage, renderWissenHub, renderToolPage, renderFunktionenHub,
  renderEventPage, renderWetterlageHub, renderLegalPage, routeHeadExtras, renderRouteRootContent,
  subRouteHeadExtras, renderSubRouteRootContent, renderArticlePage, renderMethodikHub, collectionPageScripts,
} from './seo/content.mjs';
// Phase RT1: die App-Routen-Tabelle (echtes TS-Modul, via --experimental-strip-types
// + register-ts.mjs wie die Verifier) — Route-Shells + Sitemap aus EINER Quelle.
import { ROUTES, sitemapPaths, indexableSubRoutes, CONTENT_UPDATED } from '../src/router/routes.ts';
import { subRouteText } from '../src/seo/subRouteTexts.ts';
import { PLACES_UPDATED } from './seo/places.mjs';
import { LEGAL_UPDATED } from './seo/legal.mjs';

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
    <link rel="icon" type="image/svg+xml" href="/icon.svg" />
    <meta name="theme-color" content="#2C2A26" />
    <meta property="og:title" content="Wetter in DACH-Orten | ${SITE.name}" />
    <meta property="og:image" content="${SITE.url}/og/wetter.png" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${SITE.url}/og/wetter.png" />
    ${collectionPageScripts('Wetter in DACH-Orten', '/wetter/', `Höhenkorrigierte Wetter-Landingpages für ${PLACES.length} Orte in Deutschland, Österreich und der Schweiz.`, PLACES_UPDATED)}
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

// 2g) SEO/GEO 2026 (E3): /methodik/<slug>/ + Hub, /ueber/, /ohne-tracker/.
const METHODIK = allMethodikPages();
for (const pg of METHODIK) {
  const dir = join(DIST, 'methodik', pg.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderArticlePage(pg, { hub: { path: '/methodik/', name: 'Methodik' }, updated: METHODIK_UPDATED }), 'utf8');
}
mkdirSync(join(DIST, 'methodik'), { recursive: true });
writeFileSync(join(DIST, 'methodik', 'index.html'), renderMethodikHub(METHODIK, METHODIK_UPDATED), 'utf8');
const TRUST_PAGES = [buildUeberPage(), buildOhneTrackerPage()];
for (const pg of TRUST_PAGES) {
  const dir = join(DIST, pg.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderArticlePage(pg, { updated: METHODIK_UPDATED }), 'utf8');
}

// 2h) SEO/GEO 2026 (E5/E6): /glossar/ (ein Nachschlagewerk, Anker je Begriff) und
// /fuer/<gruppe>/ (Zielgruppen-Seiten inkl. „Was buscosun hier nicht kann") + Hub.
mkdirSync(join(DIST, 'glossar'), { recursive: true });
writeFileSync(join(DIST, 'glossar', 'index.html'), renderGlossaryPage(GLOSSARY, GLOSSARY_UPDATED), 'utf8');
for (const pg of AUDIENCES) {
  const dir = join(DIST, 'fuer', pg.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderAudiencePage(pg, AUDIENCES_UPDATED), 'utf8');
}
mkdirSync(join(DIST, 'fuer'), { recursive: true });
writeFileSync(join(DIST, 'fuer', 'index.html'), renderAudienceHub(AUDIENCES, AUDIENCES_UPDATED), 'utf8');

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

// 3) sitemap.xml — lastmod je URL aus dem INHALT (Explainer/Tool/Event: dateModified;
// Orte: PLACES_UPDATED; Rechtsseiten: LEGAL_UPDATED; App-Routen: CONTENT_UPDATED bzw.
// `updated` je Route). Vorher stand das Build-Datum an jeder URL — jeder Cron-Rebuild
// meldete 189 „geänderte" Seiten (SEO-AUDIT.md §6). `changefreq`/`priority` bleiben
// weg bzw. minimal: Google ignoriert changefreq seit Jahren.
const maxDate = (arr, fallback) => arr.reduce((m, d) => (d && d > m ? d : m), fallback);
function sitemap() {
  const fullEx = EXPLAINERS.filter((e) => e.status === 'full');
  const fullTools = TOOLS.filter((t) => t.status === 'full');
  const fullEvents = EVENTS.filter((e) => e.status === 'full');
  const urls = [
    { loc: `${SITE.url}/`, pri: '1.0', mod: CONTENT_UPDATED },
    ...sitemapPaths().map((p) => ({ loc: `${SITE.url}${p.path}`, pri: p.priority, mod: p.lastmod })),
    { loc: `${SITE.url}/wetter/`, pri: '0.8', mod: PLACES_UPDATED },
    ...PLACES.map((p) => ({ loc: `${SITE.url}/wetter/${p.slug}/`, pri: '0.6', mod: PLACES_UPDATED })),
    { loc: `${SITE.url}/wissen/`, pri: '0.7', mod: maxDate(fullEx.map((e) => e.dateModified), CONTENT_UPDATED) },
    ...fullEx.map((e) => ({ loc: `${SITE.url}/wissen/${e.slug}/`, pri: '0.6', mod: e.dateModified || CONTENT_UPDATED })),
    { loc: `${SITE.url}/funktionen/`, pri: '0.7', mod: maxDate(fullTools.map((t) => t.dateModified), CONTENT_UPDATED) },
    ...fullTools.map((t) => ({ loc: `${SITE.url}/funktionen/${t.slug}/`, pri: '0.6', mod: t.dateModified || CONTENT_UPDATED })),
    { loc: `${SITE.url}/wetterlage/`, pri: '0.6', mod: maxDate(fullEvents.map((e) => e.dateModified), CONTENT_UPDATED) },
    ...fullEvents.map((e) => ({ loc: `${SITE.url}/wetterlage/${e.slug}/`, pri: '0.7', mod: e.dateModified || CONTENT_UPDATED })),
    ...[...LEGAL_PAGES, LICENSE_PAGE].map((l) => ({ loc: `${SITE.url}/${l.slug}/`, pri: '0.3', mod: l.dateModified || LEGAL_UPDATED })),
    // E3: Methodik + Vertrauensseiten
    { loc: `${SITE.url}/methodik/`, pri: '0.7', mod: METHODIK_UPDATED },
    ...METHODIK.map((pg) => ({ loc: `${SITE.url}/methodik/${pg.slug}/`, pri: '0.6', mod: METHODIK_UPDATED })),
    ...TRUST_PAGES.map((pg) => ({ loc: `${SITE.url}/${pg.slug}/`, pri: '0.5', mod: METHODIK_UPDATED })),
    // E5/E6: Glossar + Zielgruppen-Seiten
    { loc: `${SITE.url}/glossar/`, pri: '0.6', mod: GLOSSARY_UPDATED },
    { loc: `${SITE.url}/fuer/`, pri: '0.7', mod: AUDIENCES_UPDATED },
    ...AUDIENCES.map((pg) => ({ loc: `${SITE.url}/fuer/${pg.slug}/`, pri: '0.6', mod: AUDIENCES_UPDATED })),
  ];
  const body = urls.map((u) =>
    `  <url><loc>${u.loc}</loc><lastmod>${u.mod}</lastmod><priority>${u.pri}</priority></url>`).join('\n');
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

// 4a) App-Routen-Shells (Phase RT1): je Pfad-Route eine FLACHE Datei
// dist/<route>.html aus der unangereicherten Vite-Shell, mit eigenem Title/
// Description/Canonical/OG/JSON-LD und crawlbarem #root-Inhalt. netlify.toml
// schreibt /<route> und /<route>/* darauf um (200). Flach statt <route>/index.html,
// weil „Pretty URLs" sonst auf den End-Slash umleiten würde.
const indexPath = join(DIST, 'index.html');
const rawShell = readFileSync(indexPath, 'utf8');

// 4b) LE1/H2 (audit/layer-erstbild.md §4): Vorlade-Hinweise je Route-Shell.
// Gemessen: nach `index.js` holt der Browser Route-Chunk, MapView/NowcastRoute
// und maplibre erst in einer ZWEITEN Runde, und die erste Datenanfrage ging
// 2,4 s nach dem Aufruf raus. Vite legt die Abhängigkeiten jedes dynamischen
// Imports in `index-*.js` ab (`__vite__mapDeps`: Dateiliste + Indizes je
// `import()`) — genau diese Liste wird hier zu `<link rel="modulepreload">`
// (JS) und `<link rel="preload" as="style">` (CSS), sodass alles parallel zum
// index-Chunk lädt. Vites Laufzeithelfer erkennt vorhandene Links (JS: jeder
// `link[href]`, CSS: nur `rel="stylesheet"`) und legt nichts doppelt an.
// Dazu `preconnect` zu den Origins, die die Seite beim Start sicher braucht.
// Kein Treffer ⇒ Shell ohne Hinweise — nie ein Fehler, die Seite lädt dann
// wie bisher. Der Verifier (`verify:routing` §6) prüft die erzeugten Shells.
const PRECONNECT_BY_ROUTE = {
  wetterkarte: ['https://tiles.openfreemap.org', 'https://cdn.jsdelivr.net', 'https://s3.amazonaws.com'],
  warnungen: ['https://tiles.openfreemap.org', 'https://cdn.jsdelivr.net', 'https://s3.amazonaws.com'],
  regenradar: ['https://tiles.openfreemap.org', 'https://dataset.api.hub.geosphere.at', 'https://data.geo.admin.ch', 'https://cdn.jsdelivr.net'],
};
const routerSrc = readFileSync(join(ROOT, 'src', 'router', 'router.tsx'), 'utf8');
const indexJsName = (rawShell.match(/src="\/(assets\/index-[\w-]+\.js)"/) || [])[1];
const indexJs = indexJsName && existsSync(join(DIST, indexJsName)) ? readFileSync(join(DIST, indexJsName), 'utf8') : '';
const depFiles = (() => {
  const m = indexJs.match(/m\.f=\[((?:"[^"]*",?)*)\]/);
  return m ? m[1].split(',').filter(Boolean).map((s) => s.replace(/^"|"$/g, '')) : [];
})();
export function routePreloadFiles(routeId) {
  const chunk = (new RegExp(`sub\\('${routeId}'\\)[^\\n]*?import\\('\\./pages/(\\w+)'\\)`).exec(routerSrc) || [])[1];
  if (!chunk || depFiles.length === 0) return [];
  const m = new RegExp(`import\\("\\./${chunk}-[\\w-]+\\.js"\\),__vite__mapDeps\\(\\[([\\d,]*)\\]\\)`).exec(indexJs);
  if (!m) return [];
  return m[1].split(',').filter(Boolean).map((i) => depFiles[Number(i)]).filter(Boolean);
}
function routePreloadLinks(routeId) {
  const seen = new Set();
  const links = [];
  for (const origin of PRECONNECT_BY_ROUTE[routeId] ?? []) links.push(`<link rel="preconnect" href="${origin}" crossorigin />`);
  for (const f of routePreloadFiles(routeId)) {
    const href = `/${f}`;
    if (seen.has(href) || rawShell.includes(`href="${href}"`)) continue;   // index.html lädt ihn schon vor
    seen.add(href);
    // `crossorigin` auf BEIDEN: Vites Helfer setzt `link.crossOrigin = ''` auch auf
    // die Stylesheet-Links — ohne gleiche Credentials-Art ignoriert der Browser den
    // Preload und lädt doppelt (Konsole: „preloaded … but not used").
    if (f.endsWith('.js')) links.push(`<link rel="modulepreload" crossorigin href="${href}" />`);
    else if (f.endsWith('.css')) links.push(`<link rel="preload" as="style" crossorigin href="${href}" />`);
  }
  return links;
}

let routeShells = 0;
let subShells = 0;
for (const route of ROUTES) {
  if (route.id === 'home') continue;
  let shell = rawShell
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(route.meta.title)} | ${SITE.name}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(route.meta.description)}" />`);
  if (!shell.includes('og:site_name')) shell = shell.replace('</head>', `    ${routeHeadExtras(route)}\n  </head>`);
  const preload = routePreloadLinks(route.id);
  if (preload.length) shell = shell.replace('</head>', `    ${preload.join('\n    ')}\n  </head>`);
  shell = shell.replace('<div id="root"></div>', `<div id="root">${renderRouteRootContent(route)}</div>`);
  writeFileSync(join(DIST, `${route.id}.html`), shell, 'utf8');
  routeShells++;

  // 4c) SEO/GEO 2026 (E1): eigene flache Shell je indexierbarer Sub-Route
  // (`dist/<route>--<slug>.html`), auf die netlify.toml den Pfad umschreibt —
  // eigener Title/Description/Canonical/OG/JSON-LD und der Katalogtext als
  // crawlbarer #root-Inhalt. Vorher lieferten alle Sub-Routen die Eltern-Shell
  // samt Eltern-Canonical (SEO-AUDIT.md §2).
  const subs = indexableSubRoutes(route);
  const explainerOk = (slug) => EXPLAINERS_BY_SLUG[slug]?.status === 'full';
  for (const x of subs) {
    const text = subRouteText(x.path);
    if (!text) { console.error(`[seo] Sub-Route ${x.path} ohne Text (src/seo/subRouteTexts.ts)`); process.exit(1); }
    let sh = rawShell
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(x.sub.title)} | ${SITE.name}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(x.sub.description)}" />`);
    sh = sh.replace('</head>', `    ${subRouteHeadExtras(route, x.sub)}\n  </head>`);
    if (preload.length) sh = sh.replace('</head>', `    ${preload.join('\n    ')}\n  </head>`);
    sh = sh.replace('<div id="root"></div>', `<div id="root">${renderSubRouteRootContent(route, x.sub, text, subs.map((y) => y.sub), explainerOk)}</div>`);
    writeFileSync(join(DIST, x.shell.slice(1)), sh, 'utf8');
    subShells++;
  }
}

// 4) Home anreichern: Head-Meta/JSON-LD + crawlbarer #root-Inhalt
let html = rawShell;
if (!html.includes('og:site_name')) {
  html = html.replace('</head>', `    ${homeHeadExtras()}\n  </head>`);
}
html = html.replace('<div id="root"></div>', `<div id="root">${renderHomeRootContent(PLACES)}</div>`);
writeFileSync(indexPath, html, 'utf8');

const fullExplainers = EXPLAINERS.filter((e) => e.status === 'full').length;
const fullTools = TOOLS.filter((t) => t.status === 'full').length;
const fullEvents = EVENTS.filter((e) => e.status === 'full').length;
const appUrls = sitemapPaths().length;
const urlCount = PLACES.length + 5 + appUrls + fullExplainers + fullTools + fullEvents + LEGAL_PAGES.length + 1; // +1 = /lizenzen/ (V-104)
console.log(`[seo] ${GLOSSARY.length} Glossar-Begriffe, ${AUDIENCES.length} Zielgruppen-Seiten, ${pages} Geo, ${explainerPages} Explainer (${fullExplainers} idx), ${toolPages} Tools (${fullTools} idx), ${eventPages} Wetterlage (${fullEvents} idx), ${LEGAL_PAGES.length} Rechtsseiten + Hubs, ${METHODIK.length} Methodik + ${TRUST_PAGES.length} Vertrauensseiten, ${routeShells} App-Routen-Shells + ${subShells} Sub-Routen-Shells (${appUrls} URLs), sitemap.xml (${urlCount} URLs), feed.xml, sitemap-news.xml, Home angereichert. Build ${BUILD_DATE}.`);
