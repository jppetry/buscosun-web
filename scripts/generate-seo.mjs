/**
 * Post-Build-SEO/GEO-Generator (läuft nach `vite build`, schreibt nach dist/).
 *
 * Erzeugt: programmatische Geo-Seiten /wetter/<slug>/, einen /wetter/-Hub, eine
 * sitemap.xml und reichert dist/index.html (Home) um crawlbaren Inhalt + Meta +
 * JSON-LD an. Reines Node-ESM, kein App-Import → kann den App-Bundle nicht brechen.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLACES, PLACES_ALL, PLACES_NEW } from './seo/places.mjs';
import { COUNTRIES, COUNTRY_SLUGS, REGIONS, regionsOf, countryPath } from './seo/regions.mjs';
import { renderRegionPage, renderCountryPage } from './seo/regionPages.mjs';
import { EXPLAINERS, EXPLAINERS_BY_SLUG } from './seo/explainers.mjs';
import { TOOLS } from './seo/tools.mjs';
import { EVENTS } from './seo/events.mjs';
import { LEGAL_PAGES, operatorIncomplete } from './seo/legal.mjs';
import { buildLicensePage } from './seo/licenses.mjs';
import { allMethodikPages, buildUeberPage, buildOhneTrackerPage, buildFaqPage, METHODIK_UPDATED } from './seo/methodik.mjs';
import { GLOSSARY, GLOSSARY_UPDATED, renderGlossaryPage } from './seo/glossary.mjs';
import { buildLlmsTxt, buildLlmsFullTxt } from './seo/llms.mjs';
import { ogImageOr } from './seo/content.mjs';
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
import { seaSpotSeoTexts } from '../src/sea/seaSeoText.ts';
const SEA_SPOT_TEXTS = seaSpotSeoTexts();
import { DASH_VIEW_KEY, DASH_VIEW_DASHBOARD } from '../src/dashboard/viewKey.ts';
import { ROAD_LIVE } from '../src/road/roadFlag.ts';
import { SEA_LIVE } from '../src/sea/seaFlag.ts';
import { GLACIER_LIVE } from '../src/glacier/glacierFlag.ts';
import { FUSION_EXPLAINER_LIVE } from '../src/fusionExplainer/fxFlag.ts';
import { flagGateScript } from './seo/flagGate.mjs';
import { PLACES_UPDATED } from './seo/places.mjs';
import { gitLastmod, maxLastmod } from './seo/gitDate.mjs';
// Phase WBS (audit/seo-waldbrand.md): Waldbrandgefahr nach Land und Region aus dem Saison-Index des Brandarchivs.
import { writeFireRegionPages, fireRegionsLlms } from './seo/fireRegionPages.mjs';
import { FIRE_REGION_SOURCES, FIRE_BASE } from './seo/fireRegions.mjs';
// Phase GLS (audit/gletscher-seo.md): statische Gletscherseiten und Gletscher-Atlas aus `seo/data/glacier-pages.json`.
import {
  GLACIER_PAGES, GLACIER_DATA, PAGE_GLACIERS, renderGlacierShell, glacierShellFile, glacierRedirectLines,
  atlasPages, glacierSitemapUrls, glacierRouteLinksHtml,
} from './seo/glacierPages.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const BUILD_DATE = new Date().toISOString().slice(0, 10);

if (!existsSync(DIST)) {
  console.error('[seo] dist/ fehlt — bitte zuerst `vite build` ausführen.');
  process.exit(1);
}

let pages = 0;

// 1) Geo-Seiten (erste und zweite Welle). Ein Ort darf nicht heißen wie eine Länderseite (/wetter/deutschland/ …).
for (const p of PLACES_ALL) if (COUNTRY_SLUGS.has(p.slug)) throw new Error(`Ortsslug ${p.slug} kollidiert mit einer Länderseite`);
if (new Set(PLACES_ALL.map((p) => p.slug)).size !== PLACES_ALL.length) throw new Error('doppelte Ortsslugs');
for (const place of PLACES_ALL) {
  const dir = join(DIST, 'wetter', place.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderPlacePage(place), 'utf8');
  pages++;
}

// 2) /wetter/-Hub (Index aller Orte, gruppiert nach Land)
function hubPage() {
  const byCountry = (c, label, flag) => {
    const items = PLACES_ALL.filter((p) => p.country === c)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((p) => `<a href="/wetter/${p.slug}/">${escapeHtml(p.name)}</a>`).join('\n        ');
    const regs = regionsOf(c).filter((r) => r.hasPage).map((r) => `<a href="${r.path}">${escapeHtml(r.name)} <span>(${r.places.length})</span></a>`).join('\n        ');
    return `<section><h2>${flag} ${label}</h2>\n      <p><a href="${countryPath(c)}">Alle ${COUNTRIES[c].regions} in ${label}</a></p>\n      <div class="links">\n        ${regs}\n      </div>\n      <h3>Alle Orte</h3><div class="links">\n        ${items}\n      </div></section>`;
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
    ${collectionPageScripts('Wetter in DACH-Orten', '/wetter/', `Höhenkorrigierte Wetter-Landingpages für ${PLACES_ALL.length} Orte in Deutschland, Österreich und der Schweiz.`, PLACES_UPDATED)}
    <style>:root{--sand:#FAF6EA;--ink:#2C2A26;--stone:#5C5447;--terra:#C97B47;--border:#E0D6BE}
body{margin:0;font-family:system-ui,sans-serif;background:var(--sand);color:var(--ink);line-height:1.6}
.wrap{max-width:820px;margin:0 auto;padding:2rem 1.25rem 4rem}h1{font-size:2rem}h2{font-size:1.15rem;border-bottom:1px solid var(--border);padding-bottom:.3rem;margin-top:2rem}
.links{display:flex;flex-wrap:wrap;gap:.5rem}.links a{background:#fff;border:1px solid var(--border);border-radius:999px;padding:.35rem .8rem;text-decoration:none;color:var(--ink);font-size:.9rem}
a{color:var(--terra)}</style>
  </head>
  <body>
    <main class="wrap">
      <nav style="font-size:.85rem;color:var(--stone);margin-bottom:1rem"><a href="/" style="color:var(--stone)">Start</a> › Wetter</nav>
      <h1>Wetter in DACH-Orten</h1>
      <p>Höhenkorrigierte Vorhersage aus amtlichen Quellen (DWD · GeoSphere · MeteoSwiss) für ${PLACES_ALL.length} Orte in Deutschland, Österreich und der Schweiz.</p>
      ${byCountry('DE', 'Deutschland', '🇩🇪')}
      ${byCountry('AT', 'Österreich', '🇦🇹')}
      ${byCountry('CH', 'Schweiz', '🇨🇭')}
    </main>
  </body>
</html>
`;
}
mkdirSync(join(DIST, 'wetter'), { recursive: true });
writeFileSync(join(DIST, 'wetter', 'index.html'), hubPage(), 'utf8');

// 2b) Länder- und Regionsseiten (/wetter/<land>/ und /wetter/<land>/<region>/); Regionen unter MIN_REGION_PLACES Orten haben keine eigene Seite.
let regionPages = 0;
for (const code of Object.keys(COUNTRIES)) {
  const cdir = join(DIST, 'wetter', COUNTRIES[code].slug);
  mkdirSync(cdir, { recursive: true });
  writeFileSync(join(cdir, 'index.html'), renderCountryPage(code), 'utf8');
  regionPages++;
}
for (const r of REGIONS.filter((x) => x.hasPage)) {
  const rdir = join(DIST, 'wetter', COUNTRIES[r.country].slug, r.slug);
  mkdirSync(rdir, { recursive: true });
  writeFileSync(join(rdir, 'index.html'), renderRegionPage(r), 'utf8');
  regionPages++;
}

// 2c) Explainer (/wissen/<slug>/) + /wissen/-Hub
let explainerPages = 0;
for (const ex of EXPLAINERS) {
  const dir = join(DIST, 'wissen', ex.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderExplainerPage(ex, EXPLAINERS_BY_SLUG, AUDIENCES), 'utf8');
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
  writeFileSync(join(dir, 'index.html'), renderArticlePage(pg, { hub: { path: '/methodik/', name: 'Methodik' }, updated: METHODIK_UPDATED, ogImage: ogImageOr(`methodik-${pg.slug}`, undefined) }), 'utf8');
}
mkdirSync(join(DIST, 'methodik'), { recursive: true });
writeFileSync(join(DIST, 'methodik', 'index.html'), renderMethodikHub(METHODIK, METHODIK_UPDATED), 'utf8');
const TRUST_PAGES = [buildUeberPage(), buildOhneTrackerPage(), buildFaqPage()];
for (const pg of TRUST_PAGES) {
  const dir = join(DIST, pg.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderArticlePage(pg, { updated: METHODIK_UPDATED, ogImage: ogImageOr(pg.slug, undefined) }), 'utf8');
}

// 2h) SEO/GEO 2026 (E5/E6): /glossar/ (ein Nachschlagewerk, Anker je Begriff) und
// /fuer/<gruppe>/ (Zielgruppen-Seiten inkl. „Was buscosun hier nicht kann") + Hub.
mkdirSync(join(DIST, 'glossar'), { recursive: true });
writeFileSync(join(DIST, 'glossar', 'index.html'), renderGlossaryPage(GLOSSARY, GLOSSARY_UPDATED), 'utf8');
for (const pg of AUDIENCES) {
  const dir = join(DIST, 'fuer', pg.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), renderAudiencePage(pg, pg.updated ?? AUDIENCES_UPDATED), 'utf8');
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
    <main class="wrap">
      <h1>404 — Seite nicht gefunden</h1>
      <p>Diese Seite gibt es nicht (mehr). Vielleicht suchst du das Wetter für einen Ort oder eine der Funktionen von ${SITE.name}.</p>
      <a class="cta" href="/">Zur Startseite</a>
      <a class="cta" href="/wetter/">Wetter nach Ort</a>
    </main>
  </body>
</html>
`;
}
writeFileSync(join(DIST, '404.html'), notFoundPage(), 'utf8');

// 2i) Phase WBS: /waldbrandgefahr/ (Übersicht, drei Länder, Regionen ab 5 Brandereignissen oder einer EFFIS-Kartierung).
// Ohne Saison-Index fällt nur dieser Teil weg (leere Liste).
const FIRE_REGION_PATHS = writeFireRegionPages(DIST);

// 3) sitemap.xml — lastmod je URL aus GIT: Datum des letzten Commits auf den Quelldateien
// der Seitengruppe (`seo/gitDate.mjs`). Ohne belastbares Datum (flacher Clone, kein Git,
// Datei nicht versioniert) steht KEIN lastmod in der Sitemap — nie ein Platzhalter und
// nie das Build-Datum (SEO-AUDIT.md §6: jeder Rebuild meldete 189 „geänderte" Seiten).
// Granularität = Datendatei: ein Commit an `places.mjs` setzt alle Ortsseiten neu, weil
// die Orte in EINER Datei stehen. Die redaktionellen `dateModified`-Felder je Eintrag
// bleiben für JSON-LD und Feed; die Sitemap liest sie nicht mehr.
// `changefreq`/`priority` bleiben weg bzw. minimal: Google ignoriert changefreq seit Jahren.
const LM = {
  routes: gitLastmod(['src/router/routes.ts', 'src/seo/subRouteTexts.ts']),
  // Phase SA: die Autobahnwetter-Seiten haben eigene Quelldateien (Texte, erzeugte Zahlen) — ein Commit dort soll nur sie
  // als geändert melden, nicht alle App-Routen; und ein Commit an routes.ts betrifft sie mit.
  road: gitLastmod(['src/router/routes.ts', 'src/seo/routeTexts.ts', 'src/road/roadSeo.ts', 'src/road/roadSeoTexts.ts', 'src/road/roadSeoFacts.ts']),
  places: gitLastmod(['scripts/seo/places.mjs', 'scripts/seo/placeContent.mjs', 'scripts/seo/data/place-climate.json', 'scripts/seo/data/place-terrain.json', 'scripts/seo/data/place-modules.json']),
  explainers: gitLastmod(['scripts/seo/explainers.mjs', 'scripts/seo/explainers-extra.mjs']),
  tools: gitLastmod(['scripts/seo/tools.mjs']),
  events: gitLastmod(['scripts/seo/events.mjs']),
  legal: gitLastmod(['scripts/seo/legal.mjs', 'scripts/seo/licenses.mjs']),
  methodik: gitLastmod(['scripts/seo/methodik.mjs']),
  glossary: gitLastmod(['scripts/seo/glossary.mjs']),
  audiences: gitLastmod(['scripts/seo/audiences.mjs']),
  // Phase SS: Seewetter-Hub und Spot-Seiten — Tabelle, Steckbriefe, Texte (nicht die Prognose, die erst die App zeigt).
  sea: gitLastmod(['src/router/routes.ts', 'src/sea/seaSeo.ts', 'src/sea/seaSeoText.ts', 'src/sea/seaSpotFacts.ts', 'src/seo/routeTexts.ts']),
};
/**
 * SEO/GEO 2026 (E9): `sitemap.xml` ist jetzt ein **Sitemap-Index** auf zwei Teillisten —
 * `sitemap-pages.xml` (App-Routen, Hubs, Erklärungen, Methodik, Zielgruppen, Werkzeuge,
 * Rechtsseiten) und `sitemap-orte.xml` (die Ortsseiten). Die URL bleibt dieselbe, damit
 * eine bereits eingereichte Sitemap weiter funktioniert; in der Search Console lässt sich
 * die Indexierung dadurch getrennt nach Seitentyp lesen statt als eine Zahl über alles.
 */
function sitemap() {
  const fullEx = EXPLAINERS.filter((e) => e.status === 'full');
  const fullTools = TOOLS.filter((t) => t.status === 'full');
  const fullEvents = EVENTS.filter((e) => e.status === 'full');
  const urls = [
    { loc: `${SITE.url}/`, pri: '1.0', mod: LM.routes },
    // Phase SS: Seewetter (Hub + Spots) in einer eigenen Teilliste, damit Search Console und Bing ihre Indexierung getrennt zeigen.
    ...sitemapPaths().map((p) => (p.path === '/seewetter' || p.path.startsWith('/seewetter/')
      ? { loc: `${SITE.url}${p.path}`, pri: p.priority, mod: LM.sea, kind: 'sea' }
      : { loc: `${SITE.url}${p.path}`, pri: p.priority, mod: p.path.startsWith('/autobahnwetter') ? LM.road : LM.routes })),
    { loc: `${SITE.url}/wetter/`, pri: '0.8', mod: LM.places },
    ...PLACES.map((p) => ({ loc: `${SITE.url}/wetter/${p.slug}/`, pri: '0.6', mod: LM.places, kind: 'orte' })),
    ...PLACES_NEW.map((p) => ({ loc: `${SITE.url}/wetter/${p.slug}/`, pri: '0.6', mod: LM.places, kind: 'orte2' })),
    // Phase 3: Länder- und Regionsseiten gehören zu den Seiten, nicht zu den Orten.
    ...Object.keys(COUNTRIES).map((c) => ({ loc: SITE.url + countryPath(c), pri: '0.7', mod: LM.places })),
    ...REGIONS.filter((r) => r.hasPage).map((r) => ({ loc: SITE.url + r.path, pri: '0.6', mod: LM.places })),
    { loc: `${SITE.url}/wissen/`, pri: '0.7', mod: LM.explainers },
    ...fullEx.map((e) => ({ loc: `${SITE.url}/wissen/${e.slug}/`, pri: '0.6', mod: LM.explainers })),
    { loc: `${SITE.url}/funktionen/`, pri: '0.7', mod: LM.tools },
    ...fullTools.map((t) => ({ loc: `${SITE.url}/funktionen/${t.slug}/`, pri: '0.6', mod: LM.tools })),
    { loc: `${SITE.url}/wetterlage/`, pri: '0.6', mod: LM.events },
    ...fullEvents.map((e) => ({ loc: `${SITE.url}/wetterlage/${e.slug}/`, pri: '0.7', mod: LM.events })),
    ...[...LEGAL_PAGES, LICENSE_PAGE].map((l) => ({ loc: `${SITE.url}/${l.slug}/`, pri: '0.3', mod: LM.legal })),
    // E3: Methodik + Vertrauensseiten
    { loc: `${SITE.url}/methodik/`, pri: '0.7', mod: LM.methodik },
    ...METHODIK.map((pg) => ({ loc: `${SITE.url}/methodik/${pg.slug}/`, pri: '0.6', mod: LM.methodik })),
    ...TRUST_PAGES.map((pg) => ({ loc: `${SITE.url}/${pg.slug}/`, pri: '0.5', mod: LM.methodik })),
    // E5/E6: Glossar + Zielgruppen-Seiten
    { loc: `${SITE.url}/glossar/`, pri: '0.6', mod: LM.glossary },
    { loc: `${SITE.url}/fuer/`, pri: '0.7', mod: LM.audiences },
    ...AUDIENCES.map((pg) => ({ loc: `${SITE.url}/fuer/${pg.slug}/`, pri: '0.6', mod: LM.audiences })),
  ];
  return urls;
}
const urlSet = (urls) => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${
  urls.map((u) => `  <url><loc>${u.loc}</loc>${u.mod ? `<lastmod>${u.mod}</lastmod>` : ''}<priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`;
const ALL_URLS = sitemap();
// Die ersten 198 Orte bleiben in sitemap-orte.xml, die zweite Welle steht getrennt in sitemap-orte-2.xml
// (Indexierungsrate je Welle in der Search Console getrennt lesbar).
const placeUrls = ALL_URLS.filter((u) => u.kind === 'orte');
const placeUrls2 = ALL_URLS.filter((u) => u.kind === 'orte2');
const seaUrls = ALL_URLS.filter((u) => u.kind === 'sea');
const pageUrls = ALL_URLS.filter((u) => !u.kind);
writeFileSync(join(DIST, 'sitemap-orte.xml'), urlSet(placeUrls), 'utf8');
writeFileSync(join(DIST, 'sitemap-orte-2.xml'), urlSet(placeUrls2), 'utf8');
writeFileSync(join(DIST, 'sitemap-seewetter.xml'), urlSet(seaUrls), 'utf8');
writeFileSync(join(DIST, 'sitemap-pages.xml'), urlSet(pageUrls), 'utf8');
// Phase WBS: eigene Teilliste der Waldbrand-Regionsseiten; lastmod aus Git (Saison-Index, Grenzen, Generator), nie das Build-Datum.
const fireMod = gitLastmod(FIRE_REGION_SOURCES);
const fireUrls = FIRE_REGION_PATHS.map((p) => ({ loc: SITE.url + p, pri: p === FIRE_BASE ? '0.7' : '0.6', mod: fireMod }));
if (fireUrls.length) writeFileSync(join(DIST, 'sitemap-waldbrand.xml'), urlSet(fireUrls), 'utf8');
const lastmodTag = (d) => (d ? `<lastmod>${d}</lastmod>` : '');
const sitemapLastmod = lastmodTag(maxLastmod(pageUrls.map((u) => u.mod)));
const orteLastmod = lastmodTag(maxLastmod(placeUrls.map((u) => u.mod)));
const orte2Lastmod = lastmodTag(maxLastmod(placeUrls2.map((u) => u.mod)));
// Phase GLS: Gletscherseiten und Atlas in einer eigenen Teilliste — lastmod je Gletscher aus dem Datenstand
// (`glacier-pages.json`: Datum der letzten inhaltlichen Änderung des Datensatzes, nie das Build-Datum).
const glacierUrls = glacierSitemapUrls();
if (glacierUrls.length) writeFileSync(join(DIST, 'sitemap-gletscher.xml'), urlSet(glacierUrls), 'utf8');
const glacierLastmod = lastmodTag(maxLastmod(glacierUrls.map((u) => u.mod)));
const seaLastmod = lastmodTag(maxLastmod(seaUrls.map((u) => u.mod)));
writeFileSync(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>${SITE.url}/sitemap-pages.xml</loc>${sitemapLastmod}</sitemap>
  <sitemap><loc>${SITE.url}/sitemap-orte.xml</loc>${orteLastmod}</sitemap>
  <sitemap><loc>${SITE.url}/sitemap-orte-2.xml</loc>${orte2Lastmod}</sitemap>
  <sitemap><loc>${SITE.url}/sitemap-seewetter.xml</loc>${seaLastmod}</sitemap>
${glacierUrls.length ? `  <sitemap><loc>${SITE.url}/sitemap-gletscher.xml</loc>${glacierLastmod}</sitemap>\n` : ''}${fireUrls.length ? `  <sitemap><loc>${SITE.url}/sitemap-waldbrand.xml</loc>${lastmodTag(fireMod)}</sitemap>\n` : ''}</sitemapindex>
`, 'utf8');

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
    // E9: Methodik und Zielgruppen-Seiten gehören in den Feed — sie sind die zitierfähigsten Texte.
    ...METHODIK.map((m) => ({
      title: m.title, link: `${SITE.url}/methodik/${m.slug}/`, desc: m.answer, date: METHODIK_UPDATED, cat: 'Methodik',
    })),
    ...AUDIENCES.map((a) => ({
      title: a.title, link: `${SITE.url}/fuer/${a.slug}/`, desc: a.answer, date: a.updated ?? AUDIENCES_UPDATED, cat: 'Für wen',
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

// 3d) SEO/GEO 2026 (E9): llms.txt und llms-full.txt werden ERZEUGT, nicht gepflegt.
// Die handgeschriebene Fassung war an drei Stellen veraltet (Ortszahl, Go/No-Go-Link,
// Globus-Datenlage) — jede Zahl kommt jetzt aus derselben Liste wie die Seiten.
const llmsArgs = {
  site: SITE, updated: CONTENT_UPDATED, places: PLACES_ALL,
  explainers: EXPLAINERS.filter((e) => e.status === 'full'),
  tools: TOOLS.filter((t) => t.status === 'full'),
  methodik: METHODIK, audiences: AUDIENCES, glossary: GLOSSARY,
  events: EVENTS.filter((e) => e.status === 'full'),
  subRoutes: indexableSubRoutes(),
  fireRegions: fireRegionsLlms(SITE.url),
  glacierAtlas: GLACIER_PAGES && !!GLACIER_DATA ? { pages: PAGE_GLACIERS.length } : null,
};
writeFileSync(join(DIST, 'llms.txt'), buildLlmsTxt(llmsArgs), 'utf8');
writeFileSync(join(DIST, 'llms-full.txt'), buildLlmsFullTxt(llmsArgs), 'utf8');

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
  // Brandradar (Jan 06.11.): Basiskarte + EFFIS (Brandflächen der Woche). Der Eintrag schaltet auch die Vorladeliste frei —
  // der FireRoute-Import steht in der `.then(…)`-Form (s. `routePreloadFiles`), bisher lud die Shell deshalb nichts vor.
  waldbrand: ['https://tiles.openfreemap.org', 'https://maps.effis.emergency.copernicus.eu'],
  // Gletscher (Jan 06.11.): Zeiger (raw), statische Dokumente (jsDelivr), Basiskarte, Gelände der 3D-Karte.
  gletscher: ['https://raw.githubusercontent.com', 'https://cdn.jsdelivr.net', 'https://tiles.openfreemap.org', 'https://elevation-tiles-prod.s3.amazonaws.com'],
  // Autobahnwetter (Jan 06.11.): Messwerte/Gefahren (jsDelivr, raw als Ausweichweg und für den Prognose-Zeiger), Basiskarte.
  // Der Eintrag schaltet auch die Vorladeliste frei (RoadRoute-Import in der `.then(…)`-Form).
  autobahnwetter: ['https://cdn.jsdelivr.net', 'https://raw.githubusercontent.com', 'https://tiles.openfreemap.org'],
};
// Routen, deren Seite ein eigener Lazy-Chunk HINTER dem Route-Chunk ist (`lazy(() => import('…Page'))` im Wrapper): ohne diese
// Liste lädt die Shell nur den kleinen Wrapper vor, Seite und MapLibre kämen erst in einer dritten Runde.
const PAGE_CHUNKS_BY_ROUTE = {
  gletscher: ['GlacierPage'],
  // Autobahnwetter: die Seite und die Gefahren-Leiste (lazy in der Seite, `ROAD_HZ_LIVE` ist an).
  autobahnwetter: ['RoadPage', 'RoadHazardPanel'],
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
  // Phase DB (30.09.): exportiert der Route-Chunk mehr als seinen Standard (das Dashboard nutzt Module daraus mit),
  // schreibt Rollup `import("./X.js").then(c=>c.d)` — die Vorladeliste folgt dann erst nach dem `.then(…)`. Die Toleranz
  // gilt nur für die Kartenrouten, für die LE1/H2 die Hinweise vorsieht; bei den übrigen Routen bleibt das Verhalten wie
  // auf HEAD (dort griff die Suche schon vorher nicht — Befund V-DB-12, Jans Entscheidung).
  const thenForm = routeId in PRECONNECT_BY_ROUTE ? '(?:\\.then\\(\\w+=>\\w+\\.\\w+\\))?' : '';
  const m = new RegExp(`import\\("\\./${chunk}-[\\w-]+\\.js"\\)${thenForm},__vite__mapDeps\\(\\[([\\d,]*)\\]\\)`).exec(indexJs);
  if (!m) return [];
  return m[1].split(',').filter(Boolean).map((i) => depFiles[Number(i)]).filter(Boolean);
}

// E-DB-20 (audit/dashboard.md §11): `MapView` is a lazy chunk of its own (`src/router/mapViewLoader.ts`, imported by
// the router ⇒ its preload list sits in `index-*.js`). The Wetterkarte shells serve map AND dashboard links
// (`/wetterkarte/*` ⇒ `wetterkarte.html`, the query never reaches the file), so their view-specific hints are chosen by a
// tiny inline script at parse time: without `ansicht=dashboard` the map chunks (as before), with it the dashboard and
// the fusion chunks instead — the map's JS then follows in the background (WetterkarteRoute). `/warnungen` is always a
// map ⇒ static hints as before.
const ASSETS = join(DIST, 'assets');
// The start chunk first: its list is the one the app uses (the router's `loadMapView`); other importers come after.
const assetJs = existsSync(ASSETS) ? readdirSync(ASSETS).filter((f) => f.endsWith('.js')).sort((a, b) => Number(!a.startsWith('index-')) - Number(!b.startsWith('index-'))) : [];
const depsCache = new Map();
/** Preload list Vite wrote for `import("./<chunk>-<hash>.js")` in any built chunk (each chunk carries its own file list). */
export function dynamicImportDeps(chunk) {
  if (depsCache.has(chunk)) return depsCache.get(chunk);
  const re = new RegExp(String.raw`import\("\./${chunk}-[\w-]+\.js"\)(?:\.then\(\w+=>\w+\.\w+\))?,__vite__mapDeps\(\[([\d,]*)\]\)`);
  let out = [];
  for (const f of assetJs) {
    const src = readFileSync(join(ASSETS, f), 'utf8');
    const m = re.exec(src);
    if (!m) continue;
    const list = (src.match(/m\.f=\[((?:"[^"]*",?)*)\]/) || [])[1];
    const files = list ? list.split(',').filter(Boolean).map((x) => x.replace(/^"|"$/g, '')) : [];
    out = m[1].split(',').filter(Boolean).map((i) => files[Number(i)]).filter(Boolean);
    break;
  }
  depsCache.set(chunk, out);
  return out;
}
/** The view-specific preload lists of the Wetterkarte shells (without what the shell loads anyway). */
export function wetterkarteViewPreloads() {
  const route = new Set(routePreloadFiles('wetterkarte'));
  const pick = (chunks) => [...new Set(chunks.flatMap((c) => dynamicImportDeps(c)))]
    .filter((f) => !route.has(f) && !rawShell.includes(`/${f}"`) && (f.endsWith('.js') || f.endsWith('.css')));
  // Dashboard (Jan 06.11.): das Dekodier-Skript des Cube-Lesers ist ein Worker (`new Worker(new URL(…))`) und steht in keiner
  // Vorladeliste von Vite — es ging erst raus, wenn der erste Chunk zu dekodieren war (eine Runde auf dem Weg zur ersten
  // Ausgabe). Als Hinweis liegt es im HTTP-Cache (`/assets/*` ist immutable), wenn der Worker startet.
  const workers = assetJs.filter((f) => /^decodeWorker-[\w-]+\.js$/.test(f)).map((f) => `assets/${f}`);
  return { map: pick(['MapView']), dashboard: [...pick(['DashboardView', 'forecastStore', 'cubeSource']), ...workers.filter((f) => !route.has(f))] };
}
/** Inline script (ES5, no dependencies): same rule as `isDashboardSearch` in `src/dashboard/viewKey.ts`. */
export function viewPreloadScript({ map, dashboard }) {
  const arr = (xs) => `[${xs.map((f) => JSON.stringify(`/${f}`)).join(',')}]`;
  return `<script>(function(){try{var d=new URLSearchParams(location.search).get(${JSON.stringify(DASH_VIEW_KEY)})===${JSON.stringify(DASH_VIEW_DASHBOARD)},`
    + `f=d?${arr(dashboard)}:${arr(map)},h=document.head;for(var i=0;i<f.length;i++){var l=document.createElement("link"),c=f[i].slice(-4)===".css";`
    + `l.rel=c?"preload":"modulepreload";if(c)l.as="style";l.crossOrigin="";l.href=f[i];h.appendChild(l)}}catch(e){}})()</script>`;
}
function routePreloadLinks(routeId, extraChunks = []) {
  const seen = new Set();
  const links = [];
  for (const origin of PRECONNECT_BY_ROUTE[routeId] ?? []) links.push(`<link rel="preconnect" href="${origin}" crossorigin />`);
  // `/warnungen` shows the map only ⇒ the MapView chunks stay static hints there.
  const files = routeId === 'warnungen' ? [...routePreloadFiles(routeId), ...dynamicImportDeps('MapView')]
    : [...routePreloadFiles(routeId), ...[...(PAGE_CHUNKS_BY_ROUTE[routeId] ?? []), ...extraChunks].flatMap((c) => dynamicImportDeps(c))];
  for (const f of files) {
    const href = `/${f}`;
    if (seen.has(href) || rawShell.includes(`href="${href}"`)) continue;   // index.html lädt ihn schon vor
    seen.add(href);
    // `crossorigin` auf BEIDEN: Vites Helfer setzt `link.crossOrigin = ''` auch auf
    // die Stylesheet-Links — ohne gleiche Credentials-Art ignoriert der Browser den
    // Preload und lädt doppelt (Konsole: „preloaded … but not used").
    if (f.endsWith('.js')) links.push(`<link rel="modulepreload" crossorigin href="${href}" />`);
    else if (f.endsWith('.css')) links.push(`<link rel="preload" as="style" crossorigin href="${href}" />`);
  }
  let script = null;
  if (routeId === 'wetterkarte' && links.length) {
    const v = wetterkarteViewPreloads();
    if (v.map.length) script = viewPreloadScript(v);
  }
  return { links, script };
}
/**
 * Hints into a shell: links before `</head>`; the view script (E-DB-20) right before the module script — above the
 * stylesheet, because a parser-inserted script waits for every stylesheet above it (the map preloads would otherwise
 * start one CSS download later than the static links did before).
 */
function withPreloads(html, { links, script }) {
  let out = links.length ? html.replace('</head>', `    ${links.join('\n    ')}\n  </head>`) : html;
  if (script) {
    if (!/\n\s*<script type="module"/.test(out)) { console.error('[seo] Shell ohne Modul-Skript — Ansichts-Skript nicht platzierbar'); process.exit(1); }
    out = out.replace(/(\n\s*)<script type="module"/, (m, ws) => `${ws}${script}${ws}<script type="module"`);
  }
  return out;
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
  shell = withPreloads(shell, preload);
  // V-AW-12: a flag-gated route empties its lead at parse time for visitors with the flag off (no flash before "404").
  const gate = route.id === 'autobahnwetter' ? flagGateScript('road', ROAD_LIVE) : route.id === 'seewetter' ? flagGateScript('sea', SEA_LIVE) : route.id === 'gletscher' ? flagGateScript('gl', GLACIER_LIVE) : route.id === 'buscosun-fusion' ? flagGateScript('fx', FUSION_EXPLAINER_LIVE) : '';
  shell = shell.replace('<div id="root"></div>', `<div id="root">${renderRouteRootContent(route, route.id === 'gletscher' ? glacierRouteLinksHtml() : '')}</div>${gate}`);
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
    const text = subRouteText(x.path) ?? SEA_SPOT_TEXTS[x.path] ?? null;
    if (!text) { console.error(`[seo] Sub-Route ${x.path} ohne Text (src/seo/subRouteTexts.ts)`); process.exit(1); }
    let sh = rawShell
      .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(x.sub.title)} | ${SITE.name}</title>`)
      .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(x.sub.description)}" />`);
    sh = sh.replace('</head>', `    ${subRouteHeadExtras(route, x.sub, text)}\n  </head>`);
    sh = withPreloads(sh, preload);
    sh = sh.replace('<div id="root"></div>', `<div id="root">${renderSubRouteRootContent(route, x.sub, text, subs.map((y) => y.sub), explainerOk)}</div>`);
    writeFileSync(join(DIST, x.shell.slice(1)), sh, 'utf8');
    subShells++;
  }
}

// 4d) Phase GLS (audit/gletscher-seo.md): je Gletscher der Stufen A/B eine eigene App-Shell `dist/_gl/<segment>.html`
// (eigener Title/Description/Canonical/JSON-LD, Faktenblock im #root), dazu der Gletscher-Atlas als statische Seiten.
// Netlify liest `dist/_redirects` VOR netlify.toml: `/gletscher/<segment>` → eigene Shell (200); alle übrigen Gletscher
// bleiben bei `/gletscher/*` → `/gletscher.html`. Ohne Datenstand (`seo/data/glacier-pages.json`) fällt nur dieser Teil weg.
let glacierShells = 0;
const atlas = atlasPages();
if (GLACIER_PAGES && GLACIER_DATA) {
  const glRoute = ROUTES.find((r) => r.id === 'gletscher');
  // Die Steckbrief-Seiten öffnen zusätzlich den Steckbrief-Chunk (`GlacierBrief`, lazy in der Seite).
  const glPreload = routePreloadLinks('gletscher', ['GlacierBrief']);
  const glGate = flagGateScript('gl', GLACIER_LIVE);
  mkdirSync(join(DIST, '_gl'), { recursive: true });
  for (const g of PAGE_GLACIERS) {
    if (!glRoute) break;
    writeFileSync(join(DIST, glacierShellFile(g)), renderGlacierShell(rawShell, g, { withPreloads: (h) => withPreloads(h, glPreload), gate: glGate }), 'utf8');
    glacierShells++;
  }
  for (const [path, html] of atlas) {
    const dir = join(DIST, ...path.split('/').filter(Boolean));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
  }
  writeFileSync(join(DIST, '_redirects'), `# Erzeugt von scripts/generate-seo.mjs (Phase GLS) — nicht von Hand ändern.
# Netlify wertet diese Datei VOR netlify.toml aus: eigene Shell je Gletscher mit Steckbrief-Seite.
${glacierRedirectLines().join('\n')}
`, 'utf8');
} else {
  console.warn('[seo] Gletscherseiten übersprungen: ' + (GLACIER_PAGES ? 'scripts/seo/data/glacier-pages.json fehlt (node scripts/seo/refresh-glacier-pages.mjs)' : 'GLACIER_PAGES = false'));
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
console.log(`[seo] llms.txt + llms-full.txt, ${GLOSSARY.length} Glossar-Begriffe, ${AUDIENCES.length} Zielgruppen-Seiten, ${pages} Geo (${PLACES.length} + ${PLACES_NEW.length}), ${regionPages} Länder-/Regionsseiten, ${explainerPages} Explainer (${fullExplainers} idx), ${toolPages} Tools (${fullTools} idx), ${eventPages} Wetterlage (${fullEvents} idx), ${LEGAL_PAGES.length} Rechtsseiten + Hubs, ${METHODIK.length} Methodik + ${TRUST_PAGES.length} Vertrauensseiten, ${routeShells} App-Routen-Shells + ${subShells} Sub-Routen-Shells (${appUrls} URLs), sitemap-index + ${pageUrls.length} Seiten / ${placeUrls.length} + ${placeUrls2.length} Orte / ${seaUrls.length} Seewetter / ${glacierUrls.length} Gletscher (${glacierShells} Steckbrief-Shells, ${atlas.length} Atlas-Seiten), ${FIRE_REGION_PATHS.length} Waldbrand-Regionsseiten, feed.xml, sitemap-news.xml, Home angereichert. Build ${BUILD_DATE}.`);
