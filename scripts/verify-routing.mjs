/**
 * Headless-Verifikation „Pfad-Routing" (Phase RT1, Gate GRT1).
 *
 *   npm run verify:routing
 *
 * Importiert die ECHTEN Module (`src/router/routes.ts`, `urlState.ts`,
 * `legacyHash.ts`, `src/fire/fireRouteView.ts`) — kein Nachbau. Dazu Kontrollen
 * gegen die Build-/Betriebsseite, die mit denselben Tabellen arbeiten muss:
 * `scripts/seo/content.mjs` (Origin + `mapPermalink`), `scripts/seo/tools.mjs`
 * (deepLinks), `netlify.toml` (200-Rewrites je Route VOR dem 404, 301 je Alias,
 * kein /*-Catch-all) und `public/sw.js` (Shell-Guard + Version).
 *
 * Netzfrei, dependency-frei.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { CROSS_ALIASES, ROUTES, ROUTE_BY_ID, SITE_URL, routeForPath, verifyRoutes, aliasTarget, indexableSubRoutes } from '../src/router/routes.ts';
// SEO/GEO 2026 (E1): Layer-Katalog = eine Quelle für Dock, Sub-Routen-Shells, gerenderten Inhalt.
import { verifyLayerCatalog, LAYER_CATALOG } from '../src/map/layerCatalog.ts';
import { ALL_LAYER_KEYS } from '../src/map/layerTypes.ts';
import { verifySubRouteTexts, subRouteText } from '../src/seo/subRouteTexts.ts';
import { verifyUrlState, mapPathForPlace } from '../src/router/urlState.ts';
// SH1 (Teilen): Ort-Slug im Pfad — reine Regel + Tabelle.
import { verifyPlaceSlug, toSlug } from '../src/share/placeSlug.ts';
import { verifyShareSchema } from '../src/share/shareSchema.ts';
import { placeBySlug, slugForPlace, PLACE_TABLE_SIZE } from '../src/share/placeTable.ts';
import { verifyLegacyHash } from '../src/router/legacyHash.ts';
import { verifyFireRouteView } from '../src/fire/fireRouteView.ts';
import { SITE, mapPermalink } from './seo/content.mjs';
import { TOOLS } from './seo/tools.mjs';
import { PLACES } from './seo/places.mjs';
// LE1/H2 — Frühstart der Datenabrufe + Shell-Preloads (audit/layer-erstbild.md §4)
import { warmPlanFor, GRIB_MANIFEST_PATH } from '../src/router/prefetch.ts';
import { warmLiveManifest, takeWarmManifest, liveManifestUrl, MANIFEST_TTL_MS, _warmManifestCount, _resetWarmManifests } from '../src/sources/liveManifest.ts';
import { warmRvTar, takeWarmRvTar, rvTarUrlFor, rvTarCdnUrl, guessRvRuns, RV_WARM_TTL_MS, _warmRvCount, _resetWarmRv, rvImgDir, radarImgFrameFile, radarImgDualFile } from '../src/sources/radolanRuns.ts';
import { guessRvRuns as guessViaRadolan } from '../src/sources/radolan.ts';
import { existsSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { isDashboardSearch } from '../src/dashboard/viewKey.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Eingebettete Selbstverifikation ------------------------------------
for (const c of verifyRoutes().checks) add(`[routes] ${c.name}`, c.ok, c.detail);
for (const c of verifyUrlState().checks) add(`[urlState] ${c.name}`, c.ok, c.detail);
for (const c of verifyLegacyHash().checks) add(`[legacy] ${c.name}`, c.ok, c.detail);
for (const c of verifyPlaceSlug().checks) add(`[placeSlug] ${c.name}`, c.ok, c.detail);
for (const c of verifyShareSchema().checks) add(`[shareSchema] ${c.name}`, c.ok, c.detail);
for (const c of verifyFireRouteView().checks) add(`[fireView] ${c.name}`, c.ok);
for (const c of verifyLayerCatalog(ALL_LAYER_KEYS).checks) add(`[layerCatalog] ${c.name}`, c.ok, c.detail);
for (const c of verifySubRouteTexts(indexableSubRoutes().map((x) => x.path)).checks) add(`[subTexts] ${c.name}`, c.ok, c.detail);
// Die Tooltips im Dock kommen seit E1 aus dem Katalog — MapView darf keine eigene Liste mehr führen.
const mapViewSrc = readFileSync(join(ROOT, 'src', 'MapView.tsx'), 'utf8');
add('[layerCatalog] MapView leitet LAYER_OPTIONS aus LAYER_OPTION_ORDER/LAYER_CATALOG ab (keine Zweitliste)', /LAYER_OPTIONS[^\n]*= LAYER_OPTION_ORDER\.map/.test(mapViewSrc) && !/\{ key: 'wind', label: 'Wind', title: 'Wind \(DWD ICON-D2/.test(mapViewSrc));
add('[layerCatalog] Tooltip des Warn-Layers unverändert (Zitatregel-Text erhalten)', LAYER_CATALOG.warnings.title.includes('wortwörtlich übernommen') && LAYER_CATALOG.warnings.title.includes('ÖSTERREICH fehlt weiterhin'));

// --- (2) Build-Seite: dieselben Tabellen --------------------------------------
add('[seo] SITE_URL ≡ content.mjs SITE.url', SITE_URL === SITE.url, `${SITE_URL} vs ${SITE.url}`);
const muc = { name: 'München', lat: 48.13743, lon: 11.57549, country: 'DE', slug: 'muenchen' };
// SH1: beide Seiten schreiben jetzt den Ort als Pfad-Slug. Die App bekommt die
// Ortstabelle injiziert (eager-Budget), der Generator kennt sie per Konstruktion.
add('[seo] mapPermalink (Geo-Seiten) ≡ mapPathForPlace (App)',
  mapPermalink(muc) === mapPathForPlace(muc, 'temp', slugForPlace(muc)),
  `${mapPermalink(muc)} vs ${mapPathForPlace(muc, 'temp', slugForPlace(muc))}`);
add('[seo] und zwar in der kurzen Slug-Form', mapPermalink(muc) === '/wetterkarte/temperatur/muenchen', mapPermalink(muc));
{
  const bad = PLACES.filter((p) => mapPermalink(p) !== mapPathForPlace(p, 'temp', slugForPlace(p)));
  add('[seo] mapPermalink ≡ mapPathForPlace für ALLE Orte der Liste', bad.length === 0, bad.slice(0, 3).map((p) => p.slug).join(', '));
}
const badLinks = TOOLS.filter((t) => !routeForPath(t.deepLink.split('?')[0]));
add('[seo] jeder tools.mjs-deepLink zeigt auf eine Route (kein Hash mehr)', badLinks.length === 0 && TOOLS.every((t) => !t.deepLink.includes('#')), badLinks.map((t) => `${t.slug}→${t.deepLink}`).join(', '));

// SEO/GEO 2026 (E2): die App verlinkt Ortsseiten über src/router/placeSlugs.json (npm run seo:places).
{
  const rows = JSON.parse(readFileSync(join(ROOT, 'src', 'router', 'placeSlugs.json'), 'utf8'));
  const want = PLACES.map((p) => [p.slug, p.name, +p.lat.toFixed(3), +p.lon.toFixed(3), p.country]);
  add('[seo] placeSlugs.json ≡ places.mjs (npm run seo:places nach jeder Ortsänderung)', JSON.stringify(rows) === JSON.stringify(want), rows.length + ' vs ' + want.length);
  // SH1: Die Slug-Regel steht zweimal im Repo — als `toSlug` in places.mjs (JS, weil
  // verify:seo ohne --experimental-strip-types läuft) und in src/share/placeSlug.ts.
  // Hier wird die Gleichheit über die ECHTE Liste bewiesen, nicht behauptet.
  {
    const mismatch = PLACES.filter((p) => toSlug(p.name) !== p.slug);
    add('[SH1] Slug-Regel TS ≡ places.mjs über alle Orte', mismatch.length === 0, mismatch.slice(0, 3).map((p) => `${p.name}->${toSlug(p.name)}!=${p.slug}`).join(', '));
    add('[SH1] Ortstabelle im Client hat dieselbe Größe', PLACE_TABLE_SIZE === PLACES.length, `${PLACE_TABLE_SIZE} vs ${PLACES.length}`);
    const wrong = PLACES.filter((p) => { const r = placeBySlug(p.slug); return !r || r.country !== p.country || Math.abs(r.lat - +p.lat.toFixed(3)) > 1e-9; });
    add('[SH1] placeBySlug löst jeden Ort mit Land und Koordinate auf', wrong.length === 0, wrong.slice(0, 3).map((p) => p.slug).join(', '));
    const notInTable = PLACES.filter((p) => !slugForPlace(p)?.inTable);
    add('[SH1] slugForPlace erkennt jeden Listenort als Tabellenort', notInTable.length === 0, notInTable.slice(0, 3).map((p) => p.slug).join(', '));
    const off = slugForPlace({ ...PLACES[0], lat: PLACES[0].lat + 0.07 });
    add('[SH1] 7 km neben dem Ortszentrum ⇒ Koordinate muss mit in die URL', off !== null && off.inTable === false);
  }
  const railSrc = readFileSync(join(ROOT, 'src', 'nav', 'featureRail.tsx'), 'utf8');
  add('[seo] FeatureRail rendert Links (crawlbar), keine Buttons', /<Link\b/.test(railSrc) && !/<button\b/.test(railSrc) && railSrc.includes('pathForFeature(it.id)'));
  const routerSrc2 = readFileSync(join(ROOT, 'src', 'router', 'router.tsx'), 'utf8');
  add('[seo] jede Seite bekommt RouteSeoBlock (withSeo im page()-Wrapper)', routerSrc2.includes('withSeo((await load()).default)') && routerSrc2.includes('<RouteSeoBlock />') && routerSrc2.includes("lazy(() => import('./RouteSeoBlock'))"));
}

// --- (3) netlify.toml: Reihenfolge + Vollständigkeit ------------------------------
const toml = readFileSync(join(ROOT, 'netlify.toml'), 'utf8');
const rules = [];
{
  let cur = null;
  for (const raw of toml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '[[redirects]]') { cur = {}; rules.push(cur); continue; }
    if (!cur) continue;
    const m = line.match(/^(from|to|status|force)\s*=\s*(.+)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^"|"$/g, '');
    cur[m[1]] = m[1] === 'status' ? Number(v) : m[1] === 'force' ? v === 'true' : v;
  }
}
const idx = (pred) => rules.findIndex(pred);
const last = rules[rules.length - 1];
add('[netlify] letzte Regel ist /* → /404.html 404 (V-101, kein SPA-Catch-all)', !!last && last.from === '/*' && last.to === '/404.html' && last.status === 404 && !last.force);
add('[netlify] kein /* → /index.html 200', !rules.some((r) => r.from === '/*' && r.status === 200));
const notFoundIdx = rules.length - 1;
let missing = [];
for (const r of ROUTES) {
  if (r.id === 'home') continue;
  const want = `/${r.id}.html`;
  const i1 = idx((x) => x.from === r.path && x.to === want && x.status === 200 && !x.force);
  if (i1 < 0 || i1 > notFoundIdx) missing.push(r.path);
  // SH1: auch Routen mit Ort-Slug (`place: true`) brauchen das Wildcard-Rewrite —
  // sonst liefert `/regenradar/muenchen` in Produktion die 404-Shell.
  if (r.subParam || r.place) {
    const i2 = idx((x) => x.from === `${r.path}/*` && x.to === want && x.status === 200 && !x.force);
    if (i2 < 0 || i2 > notFoundIdx) missing.push(`${r.path}/*`);
  }
}
add('[netlify] jede App-Route hat ein unforced 200-Rewrite auf ihre Shell VOR dem 404', missing.length === 0, missing.join(', '));
missing = [];
for (const r of ROUTES) {
  for (const a of r.aliases) {
    const dec = decodeURIComponent(a);
    const ok = rules.some((x) => (x.from === a || x.from === dec) && x.to === r.path && x.status === 301);
    if (!ok) missing.push(a);
  }
}
add('[netlify] jeder Alias hat eine 301 auf die kanonische Route', missing.length === 0, missing.join(', '));
const iCross = idx((x) => x.from === '/wetterkarte/warnungen' && x.to === '/warnungen' && x.status === 301);
const iWild = idx((x) => x.from === '/wetterkarte/*');
add('[netlify] /wetterkarte/warnungen → /warnungen (301) steht VOR /wetterkarte/*', iCross >= 0 && iWild >= 0 && iCross < iWild);
missing = CROSS_ALIASES.filter(([from, to]) => !rules.some((x) => x.from === from && x.to === to && x.status === 301)).map(([from]) => from);
add('[netlify] jeder Cross-Alias hat eine 301 auf sein Ziel (nicht auf die Top-Route)', missing.length === 0, missing.join(', '));
add('[netlify] keine Regel mit from ≡ to (Loop-Schutz)', !rules.some((x) => x.from && x.to && x.from.replace(/\/$/, '') === x.to.replace(/\/$/, '')));
add('[netlify] Proxy-Rewrites unverändert vorhanden', ['/_dwd_opendata/*', '/_meteoalarm/*', '/_gfs/*', '/_cscs/*', '/_mf/*', '/_ecmwf/*'].every((p) => rules.some((x) => x.from === p && x.status === 200 && x.force)));
add('[netlify] Proxys stehen VOR den App-Regeln', idx((x) => x.from === '/_ecmwf/*') < idx((x) => x.to && x.to.endsWith('.html') && x.status === 200));

// --- (3b) SEO/GEO 2026 E1: Sub-Routen-Shells, Ebene B (robots + Header) ------------------
{
  const subs = indexableSubRoutes();
  const bad = subs.filter((x) => {
    const i = idx((r) => r.from === x.path && r.to === x.shell && r.status === 200 && !r.force);
    const w = idx((r) => r.from === `${x.route.path}/*`);
    return i < 0 || w < 0 || i > w;
  }).map((x) => x.path);
  add('[netlify] jede indexierbare Sub-Route hat ein 200-Rewrite auf ihre EIGENE Shell VOR der Wildcard-Regel', bad.length === 0, bad.join(', '));
  add('[netlify] keine Sub-Routen-Regel für den Cross-Alias /wetterkarte/warnungen', !rules.some((r) => r.from === '/wetterkarte/warnungen' && r.status === 200));
  const robots = readFileSync(join(ROOT, 'public', 'robots.txt'), 'utf8').replace(/\r\n/g, '\n');
  const mustDisallow = ['/_dwd_opendata/', '/_meteoalarm/', '/_gfs/', '/_cscs/', '/_mf/', '/_ecmwf/', '/_firms', '/_dwd_wind', '/_dwd_grib', '/params/', '/fire/', '/countries/', '/latest-grib.json', '/sw.js'];
  add('[robots] Ebene B: Proxys, Edge Functions und Datenartefakte sind disallowed', mustDisallow.every((p) => robots.includes(`Disallow: ${p}\n`)), mustDisallow.filter((p) => !robots.includes(`Disallow: ${p}\n`)).join(', '));
  add('[robots] /assets/ ist NICHT disallowed (Googlebot muss die App rendern können)', !/Disallow: \/assets/.test(robots));
  add('[robots] eine gemeinsame UA-Gruppe: Googlebot, GPTBot, ClaudeBot, PerplexityBot stehen VOR dem einzigen Allow', (() => { const allow = robots.indexOf('\nAllow: /\n'); return allow > 0 && ['Googlebot', 'GPTBot', 'ClaudeBot', 'PerplexityBot', 'Bingbot'].every((ua) => { const i = robots.indexOf(`User-agent: ${ua}\n`); return i > 0 && i < allow; }) && robots.indexOf('User-agent:', allow) < 0; })());
  add('[robots] Sitemap-Zeile vorhanden', robots.includes('Sitemap: https://buscosun.com/sitemap.xml'));
  const hdr = (p, re) => new RegExp(`for = "${p.replace(/[*.]/g, (m) => '\\' + m)}"[\\s\\S]{0,400}?${re}`).test(toml);
  add('[headers] /assets/* trägt immutable-Cache UND X-Robots-Tag noindex', hdr('/assets/*', 'Cache-Control = "public, max-age=31536000, immutable"') && hdr('/assets/*', 'X-Robots-Tag\\s+= "noindex, nofollow"'));
  add('[headers] manifest.webmanifest mit application/manifest+json', hdr('/manifest.webmanifest', 'Content-Type = "application/manifest\\+json'));
  add('[headers] Datenpfade und Service Worker noindex', ['/params/*', '/fire/*', '/countries/*', '/latest-grib.json', '/sw.js'].every((p) => hdr(p, 'X-Robots-Tag = "noindex, nofollow"')));
  add('[headers] Header-Block steht VOR den Redirects (Parser-Sicherheit)', toml.indexOf('[[headers]]') >= 0 && toml.indexOf('[[headers]]') < toml.indexOf('[[redirects]]'));
}

// --- (4) Service Worker ---------------------------------------------------------
const sw = readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8');
// Die Zahl selbst ist nicht die Zusage — sie steigt bei jeder SW-Änderung (BW-3 hat
// auf v3 gebumpt, weil `cdn.jsdelivr.net` durchgereicht wird). Zugesagt ist zweierlei:
// sie liegt HINTER der Hash-Ära (v1), und ALLE drei Cache-Namen hängen an ihr — sonst
// verwirft ein Bump nichts, und genau das ist der Zweck des Bumps.
const swVersion = /const VERSION = '(v\d+)'/.exec(sw)?.[1] ?? null;
add('[sw] VERSION liegt hinter der Hash-Ära (≥ v2) und trägt alle drei Cache-Namen',
  !!swVersion && Number(swVersion.slice(1)) >= 2
  && ['shell', 'assets', 'data'].every((n) => sw.includes('`bsc-' + n + '-${VERSION}`')), swVersion ?? '—');
add('[sw] Shell-Cache nur für App-HTML (id="root"), nicht für statische SEO-Seiten', sw.includes('id="root"'));

// --- (5) Router-Datei deckt alle Routen ab (Textsonde auf Werte, nicht Zeilen) -------
const routerSrc = readFileSync(join(ROOT, 'src', 'router', 'router.tsx'), 'utf8');
const notRouted = ROUTES.filter((r) => r.id !== 'home' && !routerSrc.includes(`sub('${r.id}')`)).map((r) => r.id);
add('[router] jede Route der Tabelle ist im Router verdrahtet', notRouted.length === 0, notRouted.join(', '));
add('[router] Alias-Auflösung ist bijektiv zur Tabelle', ROUTES.every((r) => r.aliases.every((a) => aliasTarget(a) === r.path)) && ROUTE_BY_ID.warnungen.aliases.length === 2);
// Cross-Aliase, die keinen echten Pfad verdecken, brauchen auch clientseitig einen
// Redirect (Dev/Preview kennen die Netlify-301 nicht) — `/wetterkarte/warnungen`
// dagegen ist eine echte Sub-Route und darf NICHT clientseitig umgeleitet werden.
add('[router] Cross-Aliase clientseitig verdrahtet, echte Sub-Routen ausgenommen',
  routerSrc.includes('crossAliasRoutes') && routerSrc.includes('routeForPath(from, false)')
  && CROSS_ALIASES.every(([from]) => (routeForPath(from, false) === null) === (from === '/route/3d')));

// --- (6) LE1/H2 — Frühstart der Datenabrufe + Shell-Preloads -------------------------
// Plan je Route (reine Entscheidung, netzfrei).
const plan = (id, p, s = '') => warmPlanFor(id, p, s);
// BW-13 (§32): das Wind-Manifest ist entfallen — der Windlayer holt Lauf und
// Bilder aus dem Index des Daten-Repos. Vorgewärmt wird nur noch das Grib-Manifest.
add('[warm] /wetterkarte: nur das Grib-Manifest, kein RV-Tar', JSON.stringify(plan('wetterkarte', '/wetterkarte')) === JSON.stringify({ manifests: [GRIB_MANIFEST_PATH], rvTar: false }));
add('[warm] /wetterkarte/niederschlag: RV-Tar dazu', plan('wetterkarte', '/wetterkarte/niederschlag').rvTar === true);
add('[warm] /wetterkarte/wind?l=niederschlag: RV-Tar über `l=`', plan('wetterkarte', '/wetterkarte/wind', '?lat=1&l=niederschlag').rvTar === true);
add('[warm] /wetterkarte/wind?l=temp: kein RV-Tar', plan('wetterkarte', '/wetterkarte/wind', '?l=temp').rvTar === false);
add('[warm] /warnungen: wie die Wetterkarte', plan('warnungen', '/warnungen').manifests.length === 1);
add('[warm] /regenradar?ort=…&land=de: GRIB-Manifest (cape) + RV-Tar, kein Wind-Manifest', JSON.stringify(plan('regenradar', '/regenradar', '?ort=Kassel&olat=51.3&olon=9.5&land=de')) === JSON.stringify({ manifests: [GRIB_MANIFEST_PATH], rvTar: true }));
add('[warm] /regenradar ohne Ort (Suchformular): kein RV-Tar (V-LE-12)', plan('regenradar', '/regenradar', '').rvTar === false && plan('regenradar', '/regenradar', '').manifests.length === 1);
add('[warm] /regenradar?ort=Wien&land=at: kein RV-Tar (Nachbarquelle kommt mit low)', plan('regenradar', '/regenradar', '?ort=Wien&olat=48.2&olon=16.4&land=at').rvTar === false);
add('[warm] /regenradar?olat&olon ohne land: DE angenommen ⇒ RV-Tar', plan('regenradar', '/regenradar', '?olat=51.3&olon=9.5').rvTar === true);
add('[warm] andere Routen starten nichts vor', ['vorhersage', 'home', 'waldbrand', 'globus'].every((id) => { const p = plan(id, '/' + id); return p.manifests.length === 0 && !p.rvTar; }));
// E-DB-20: das Dashboard zeigt zuerst keine Karte ⇒ keine Kartendaten vorab (Gegenprobe: derselbe Pfad ohne Schlüssel,
// ungültiger Wert, /warnungen mit dem Schlüssel — dort gibt es kein Dashboard).
add('[warm] E-DB-20: /wetterkarte/niederschlag/<ort>?ansicht=dashboard startet nichts vor (Gegenprobe ohne Schlüssel: Manifest + RV-Tar)',
  JSON.stringify(plan('wetterkarte', '/wetterkarte/niederschlag/muenchen', '?ansicht=dashboard')) === JSON.stringify({ manifests: [], rvTar: false })
  && JSON.stringify(plan('wetterkarte', '/wetterkarte/niederschlag/muenchen', '')) === JSON.stringify({ manifests: [GRIB_MANIFEST_PATH], rvTar: true })
  && plan('wetterkarte', '/wetterkarte/wind/muenchen', '?ansicht=Dashboard').manifests.length === 1
  && plan('warnungen', '/warnungen', '?ansicht=dashboard').manifests.length === 1);

// Frühstart-Mechanik mit gezähltem `fetch` (Node 22: fetch/Response global).
{
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response('{"run":"2026082809"}', { status: 200 }); };
  try {
    _resetWarmManifests(); _resetWarmRv();
    const T = Date.UTC(2026, 7, 28, 12, 30, 0);
    add('[warm] Manifest: erster Aufruf startet, zweiter im TTL ist No-op', warmLiveManifest('/latest-grib.json', T) === true && warmLiveManifest('/latest-grib.json', T + 1000) === false && calls.length === 1);
    add('[warm] Manifest: Abruf-URL trägt den Minutenstempel (BW-11) und `no-store`', calls[0].url === liveManifestUrl('/latest-grib.json', T) && calls[0].init?.cache === 'no-store');
    const taken = takeWarmManifest('/latest-grib.json', T + 2000);
    add('[warm] Manifest: `take` liefert das Promise genau EINMAL', !!taken && typeof taken.then === 'function' && takeWarmManifest('/latest-grib.json', T + 2000) === null && _warmManifestCount() === 0);
    add('[warm] Manifest: nach dem TTL liefert `take` null (Verbraucher holt selbst)', (warmLiveManifest('/latest-grib.json', T + 5000), takeWarmManifest('/latest-grib.json', T + 5000 + MANIFEST_TTL_MS + 1) === null));
    add('[warm] Manifest: vorgestartete Antwort ist lesbar', (await taken).ok === true && (await (await taken).json()).run === '2026082809');
    calls.length = 0;
    const ts0 = guessRvRuns(1, T)[0];
    const url = warmRvTar(T);
    // RD3: bei T ist der jüngste Rat 5 min alt — über dem BILD-Gate (4:30) ⇒ der
    // Frühstart wärmt meta.json + g000.png (Phase PF, Dual-Analyse) + f000.png des Bild-Slots (3 Abrufe) statt des Tars.
    add('[warm] RV: bei T Bild-berechtigt ⇒ meta.json + g000.png + f000.png vorgestartet, `priority: high`',
      url === `${rvImgDir(ts0)}/meta.json` && calls.length === 3
      && calls[0].url === `${rvImgDir(ts0)}/meta.json` && calls[1].url === `${rvImgDir(ts0)}/${radarImgDualFile(0)}` && calls[2].url === `${rvImgDir(ts0)}/${radarImgFrameFile(0)}`
      && calls.every((c) => c.init?.priority === 'high'));
    // Vor dem Bild-Gate (Rat 3,5 min alt) bleibt es der Tar mit der Resolver-URL (RD2) —
    // bei T2 unter BEIDEN Gates ⇒ die Netlify-URL, exakt wie bisher.
    add('[warm] RV: vor dem Bild-Gate wärmt der Frühstart den Tar (Resolver-URL, Netlify bei T2)', await (async () => {
      _resetWarmRv(); const c0 = calls.length;
      const T2 = Date.UTC(2026, 7, 28, 12, 28, 30);
      const u2 = warmRvTar(T2);
      return u2 === rvTarUrlFor(guessRvRuns(1, T2)[0], T2) && !u2.includes('/img/') && calls.length === c0 + 1;
    })());
    _resetWarmRv(); calls.length = 0;
    const url2 = warmRvTar(T);
    add('[warm] RV: zweiter Aufruf im Fenster ist No-op', warmRvTar(T + 1000) === url2 && calls.length === 3);
    const w = takeWarmRvTar(url2, T + 2000);
    const wf = takeWarmRvTar(`${rvImgDir(ts0)}/${radarImgFrameFile(0)}`, T + 2000);
    const wg = takeWarmRvTar(`${rvImgDir(ts0)}/${radarImgDualFile(0)}`, T + 2000);
    add('[warm] RV: `take` je URL genau einmal, Antwort samt `fromCache=false`', !!w && !!wf && !!wg && (await w).fromCache === false && (await w).res.ok && takeWarmRvTar(url2, T + 2000) === null && _warmRvCount() === 0);
    add('[warm] RV: nach 5 min liefert `take` null', (warmRvTar(T), takeWarmRvTar(url2, T + RV_WARM_TTL_MS + 1) === null));
    add('[warm] RV-Tar: Fehlschlag des Frühstarts wird nicht als unbehandelt gemeldet', await (async () => { globalThis.fetch = async () => { throw new Error('offline'); }; _resetWarmRv(); const u = warmRvTar(T); const p = takeWarmRvTar(u, T); return await p.then(() => false, (e) => e.message === 'offline'); })());
  } finally {
    globalThis.fetch = realFetch; _resetWarmManifests(); _resetWarmRv();
  }
}
add('[warm] radolan.ts exportiert dieselbe `guessRvRuns` (Re-Export, kein Nachbau)', guessViaRadolan === guessRvRuns);
add('[router] Frühstart an Wetterkarte, Warnungen und Regenradar verdrahtet', ['wetterkarte', 'warnungen', 'regenradar'].every((id) => new RegExp(`sub\\('${id}'\\)[^\\n]*'${id}'\\)`).test(routerSrc)) && !/sub\('vorhersage'\)[^\n]*'vorhersage'\)/.test(routerSrc));
// E-DB-20: Karte und Warnungen warten im Loader auf MapView (parallel zum Route-Chunk); nur die Wetterkarte nimmt das
// Dashboard aus. Der Route-Chunk selbst importiert MapView nicht mehr statisch (Gegenprobe am Bau unten).
add('[router] E-DB-20: Wetterkarte (Dashboard ausgenommen) und Warnungen laden MapView im Loader',
  /sub\('wetterkarte'\)[^\n]*mapFirst\(true\)/.test(routerSrc) && /sub\('warnungen'\)[^\n]*mapFirst\(false\)/.test(routerSrc)
  && ROUTES.filter((r) => r.id !== 'wetterkarte' && r.id !== 'warnungen').every((r) => !new RegExp(`sub\\('${r.id}'\\)[^\\n]*mapFirst`).test(routerSrc)));

// Route-Shells (nur wenn `dist/` gebaut ist — sonst übersprungen, nicht rot).
const shellOf = (id) => { const p = join(ROOT, 'dist', `${id}.html`); return existsSync(p) ? readFileSync(p, 'utf8') : null; };
const wkShell = shellOf('wetterkarte'), rrShell = shellOf('regenradar'), fcShell = shellOf('vorhersage'), wnShell = shellOf('warnungen');
// E-DB-20: das Ansichts-Skript einer Shell im Stub-DOM ausführen ⇒ die Links, die es für eine Query anlegt.
const viewScript = (shell) => (/<script>(\(function\(\)\{try\{var d=[\s\S]*?)<\/script>/.exec(shell) || [])[1] ?? null;
const viewLinks = (shell, search) => {
  const code = viewScript(shell);
  if (!code) return null;
  const links = [];
  vm.runInNewContext(code, { location: { search }, URLSearchParams, document: { head: { appendChild: (l) => links.push(l) }, createElement: () => ({}) } });
  return links;
};
const hasLink = (links, name, ext = 'js') => links.some((l) => new RegExp(`^/assets/${name}-[\\w-]+\\.${ext}$`).test(l.href)
  && l.crossOrigin === '' && (ext === 'js' ? l.rel === 'modulepreload' : l.rel === 'preload' && l.as === 'style'));
if (wkShell && rrShell) {
  const pre = (s, re) => new RegExp(`<link rel="modulepreload" crossorigin href="/assets/${re}-[\\w-]+\\.js" />`).test(s);
  add('[shell] E-DB-20: wetterkarte.html lädt den Route-Chunk fest vor, MapView und maplibre NICHT fest (die Shell dient Karte und Dashboard)',
    pre(wkShell, 'WetterkarteRoute') && !pre(wkShell, 'MapView') && !pre(wkShell, 'maplibre'));
  const mapQ = ['', '?radar=0&z=9', '?ansicht=Dashboard', '?ansicht=karte&ansicht=dashboard'];
  const dashQ = ['?ansicht=dashboard', '?radar=0&ansicht=dashboard&zeitraum=7-tage'];
  const mapOk = (ls) => !!ls && hasLink(ls, 'MapView') && hasLink(ls, 'maplibre') && hasLink(ls, 'maplibre', 'css') && !hasLink(ls, 'DashboardView') && !hasLink(ls, 'cubeSource');
  const dashOk = (ls) => !!ls && hasLink(ls, 'DashboardView') && hasLink(ls, 'forecastStore') && hasLink(ls, 'cubeSource') && hasLink(ls, 'DashboardView', 'css') && !hasLink(ls, 'MapView') && !hasLink(ls, 'maplibre');
  add('[shell] E-DB-20: Ansichts-Skript ohne ansicht=dashboard ⇒ MapView + maplibre (JS modulepreload, Karten-CSS preload as=style, crossOrigin wie Vite)',
    mapQ.every((q) => mapOk(viewLinks(wkShell, q))), mapQ.filter((q) => !mapOk(viewLinks(wkShell, q))).join(' '));
  add('[shell] E-DB-20: mit ansicht=dashboard ⇒ DashboardView, forecastStore, cubeSource — kein MapView/maplibre',
    dashQ.every((q) => dashOk(viewLinks(wkShell, q))), dashQ.filter((q) => !dashOk(viewLinks(wkShell, q))).join(' '));
  // Ein Parser-Skript wartet auf jedes Stylesheet darüber — über dem Stylesheet startet die Vorladung so früh wie
  // die festen Hinweise vorher (Gegenprobe: das Stylesheet steht in der Shell).
  const posScript = wkShell.indexOf('<script>(function(){try{var d='), posCss = wkShell.indexOf('<link rel="stylesheet"'), posModule = wkShell.indexOf('<script type="module"');
  add('[shell] E-DB-20: das Ansichts-Skript steht vor Modul-Skript und Stylesheet (kein Warten auf das CSS)', posScript > 0 && posCss > 0 && posModule > 0 && posScript < posModule && posScript < posCss, JSON.stringify({ posScript, posModule, posCss }));
  add('[shell] E-DB-20: das Skript entscheidet wie `isDashboardSearch` (viewKey.ts) für jede geprüfte Query',
    [...mapQ, ...dashQ].every((q) => isDashboardSearch(q) === dashQ.includes(q)));
  // Funktionserhalt der Kartenvorladung: jede Datei, die Vite für `import(MapView)` im Start-Chunk nennt, lädt die
  // Kartenansicht weiterhin vor (fest oder per Skript) — nichts fällt gegenüber dem Stand vor E-DB-20 heraus.
  const idxName = (readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8').match(/src="\/(assets\/index-[\w-]+\.js)"/) || [])[1];
  const idxJs = idxName ? readFileSync(join(ROOT, 'dist', idxName), 'utf8') : '';
  const idxFiles = ((idxJs.match(/m\.f=\[((?:"[^"]*",?)*)\]/) || [])[1] ?? '').split(',').filter(Boolean).map((x) => x.replace(/^"|"$/g, ''));
  const mvIdx = (/import\("\.\/MapView-[\w-]+\.js"\)(?:\.then\(\w+=>\w+\.\w+\))?,__vite__mapDeps\(\[([\d,]*)\]\)/.exec(idxJs) || [])[1];
  const mvFiles = (mvIdx ?? '').split(',').filter(Boolean).map((i) => `/${idxFiles[Number(i)]}`);
  const mapHave = new Set([...[...wkShell.matchAll(/href="(\/assets\/[^"]+)"/g)].map((m) => m[1]), ...(viewLinks(wkShell, '') ?? []).map((l) => l.href)]);
  const missing = mvFiles.filter((f) => !mapHave.has(f) && !readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8').includes(`${f}"`));
  add('[shell] E-DB-20: der Start-Chunk lädt MapView über EINEN Import; jede seiner Dateien lädt die Kartenansicht vor', mvFiles.length > 5 && missing.length === 0, missing.slice(0, 4).join(' ') || `${mvFiles.length} Dateien`);
  // Am Bau: der Route-Chunk importiert MapView/maplibre nicht statisch (Gegenprobe: WarnungenRoute importiert WetterkarteRoute statisch).
  const assetJs = readdirSync(join(ROOT, 'dist', 'assets')).filter((f) => f.endsWith('.js'));
  const chunkSrc = (name) => { const f = assetJs.find((x) => new RegExp(`^${name}-[\\w-]+\\.js$`).test(x)); return f ? readFileSync(join(ROOT, 'dist', 'assets', f), 'utf8') : ''; };
  const staticFrom = (src, name) => new RegExp(`(?:^|[;}\\s])import[^;()]*?from\\s*"\\./${name}-[\\w-]+\\.js"`).test(src);
  const wkRoute = chunkSrc('WetterkarteRoute'), wnRoute = chunkSrc('WarnungenRoute');
  add('[shell] E-DB-20: WetterkarteRoute-Chunk importiert MapView und maplibre nicht statisch (Gegenprobe: WarnungenRoute → WetterkarteRoute statisch)',
    !!wkRoute && !staticFrom(wkRoute, 'MapView') && !staticFrom(wkRoute, 'maplibre') && staticFrom(wnRoute, 'WetterkarteRoute'));
  if (wnShell) add('[shell] warnungen.html lädt Route-Chunk, MapView, maplibre und Karten-CSS fest vor (nur Karte), kein Ansichts-Skript',
    pre(wnShell, 'WarnungenRoute') && pre(wnShell, 'MapView') && pre(wnShell, 'maplibre') && /<link rel="preload" as="style" crossorigin href="\/assets\/maplibre-[\w-]+\.css" \/>/.test(wnShell) && !viewScript(wnShell));
  add('[shell] regenradar.html lädt NowcastRoute und maplibre vor, nicht MapView', pre(rrShell, 'NowcastRoute') && pre(rrShell, 'maplibre') && !pre(rrShell, 'MapView') && !viewScript(rrShell));
  add('[shell] preconnect: Wetterkarte → openfreemap/jsDelivr/S3, Regenradar → GeoSphere + geo.admin', ['tiles.openfreemap.org', 'cdn.jsdelivr.net', 's3.amazonaws.com'].every((h) => wkShell.includes(`<link rel="preconnect" href="https://${h}" crossorigin />`)) && ['dataset.api.hub.geosphere.at', 'data.geo.admin.ch'].every((h) => rrShell.includes(`<link rel="preconnect" href="https://${h}" crossorigin />`)) && !rrShell.includes('s3.amazonaws.com'));
  const dup = (s) => { const hs = [...s.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith('/assets/')); return hs.length !== new Set(hs).size; };
  const dupView = (s) => { const hs = [...s.matchAll(/href="([^"]+)"/g)].map((m) => m[1]); return [...(viewLinks(s, '') ?? []), ...(viewLinks(s, '?ansicht=dashboard') ?? [])].some((l) => hs.includes(l.href)); };
  add('[shell] kein Asset zweimal verlinkt (index.html-Preloads werden nicht wiederholt, das Ansichts-Skript wiederholt keinen festen Hinweis)', !dup(wkShell) && !dup(rrShell) && (!wnShell || !dup(wnShell)) && !dupView(wkShell));
  add('[shell] vorhersage.html trägt keine Karten-Preconnects', !fcShell || !fcShell.includes('rel="preconnect"'));
  // E1: Sub-Routen-Shells tragen eigenen Canonical + dieselben Preloads wie die Eltern-Shell.
  const subShell = (id, slug) => { const p = join(ROOT, 'dist', `${id}--${slug}.html`); return existsSync(p) ? readFileSync(p, 'utf8') : null; };
  const tempShell = subShell('wetterkarte', 'temperatur'), flyShell = subShell('atmosphaere', 'fliegen'), fireShell = subShell('waldbrand', 'aktive-braende');
  add('[shell] Sub-Routen-Shells existieren (wetterkarte--temperatur, atmosphaere--fliegen, waldbrand--aktive-braende)', !!tempShell && !!flyShell && !!fireShell);
  if (tempShell) {
    add('[shell] wetterkarte--temperatur.html: eigener Canonical, eigener Title, H1 aus dem Katalog', tempShell.includes('<link rel="canonical" href="https://buscosun.com/wetterkarte/temperatur" />') && tempShell.includes('<title>Temperaturkarte DACH | buscosun</title>') && tempShell.includes(`<h1>${subRouteText('/wetterkarte/temperatur').h1}</h1>`));
    add('[shell] wetterkarte--temperatur.html lädt den Route-Chunk fest vor und trägt dasselbe Ansichts-Skript wie die Eltern-Shell (E-DB-20)',
      pre(tempShell, 'WetterkarteRoute') && !pre(tempShell, 'MapView') && !!viewScript(tempShell) && viewScript(tempShell) === viewScript(wkShell));
    add('[shell] Sub-Shell verlinkt Eltern-Route und Geschwister-Ansichten', tempShell.includes('href="/wetterkarte"') && tempShell.includes('href="/wetterkarte/wind"') && !tempShell.includes('href="/wetterkarte/temperatur"><') );
    add('[shell] keine hreflang-Tags mehr', !/hreflang=/.test(tempShell) && !/hreflang=/.test(wkShell));
  }
} else {
  add('[shell] Route-Shells nicht geprüft — `dist/` fehlt (erst `npm run build`)', true, 'übersprungen');
}

// --- Ausgabe ----------------------------------------------------------------------
console.log('\nPfad-Routing (Phase RT1):\n');
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok || !c.detail ? '' : `  — ${c.detail}`}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n  ${checks.length - failed}/${checks.length} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
