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

import { CROSS_ALIASES, ROUTES, ROUTE_BY_ID, SITE_URL, routeForPath, verifyRoutes, aliasTarget } from '../src/router/routes.ts';
import { verifyUrlState, mapPathForPlace } from '../src/router/urlState.ts';
import { verifyLegacyHash } from '../src/router/legacyHash.ts';
import { verifyFireRouteView } from '../src/fire/fireRouteView.ts';
import { SITE, mapPermalink } from './seo/content.mjs';
import { TOOLS } from './seo/tools.mjs';
// LE1/H2 — Frühstart der Datenabrufe + Shell-Preloads (audit/layer-erstbild.md §4)
import { warmPlanFor, GRIB_MANIFEST_PATH } from '../src/router/prefetch.ts';
import { warmLiveManifest, takeWarmManifest, liveManifestUrl, MANIFEST_TTL_MS, _warmManifestCount, _resetWarmManifests } from '../src/sources/liveManifest.ts';
import { warmRvTar, takeWarmRvTar, rvTarUrlFor, rvTarCdnUrl, guessRvRuns, RV_WARM_TTL_MS, _warmRvCount, _resetWarmRv, rvImgDir, radarImgFrameFile } from '../src/sources/radolanRuns.ts';
import { guessRvRuns as guessViaRadolan } from '../src/sources/radolan.ts';
import { existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok, detail });

// --- (1) Eingebettete Selbstverifikation ------------------------------------
for (const c of verifyRoutes().checks) add(`[routes] ${c.name}`, c.ok, c.detail);
for (const c of verifyUrlState().checks) add(`[urlState] ${c.name}`, c.ok, c.detail);
for (const c of verifyLegacyHash().checks) add(`[legacy] ${c.name}`, c.ok, c.detail);
for (const c of verifyFireRouteView().checks) add(`[fireView] ${c.name}`, c.ok);

// --- (2) Build-Seite: dieselben Tabellen --------------------------------------
add('[seo] SITE_URL ≡ content.mjs SITE.url', SITE_URL === SITE.url, `${SITE_URL} vs ${SITE.url}`);
const muc = { name: 'München', lat: 48.13743, lon: 11.57549, country: 'DE', slug: 'muenchen' };
add('[seo] mapPermalink (Geo-Seiten) ≡ mapPathForPlace (App)', mapPermalink(muc) === mapPathForPlace(muc, 'temp'), `${mapPermalink(muc)} vs ${mapPathForPlace(muc, 'temp')}`);
const badLinks = TOOLS.filter((t) => !routeForPath(t.deepLink.split('?')[0]));
add('[seo] jeder tools.mjs-deepLink zeigt auf eine Route (kein Hash mehr)', badLinks.length === 0 && TOOLS.every((t) => !t.deepLink.includes('#')), badLinks.map((t) => `${t.slug}→${t.deepLink}`).join(', '));

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
  if (r.subParam) {
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
    // Frühstart wärmt meta.json + f000.png des Bild-Slots (2 Abrufe) statt des Tars.
    add('[warm] RV: bei T Bild-berechtigt ⇒ meta.json + f000.png vorgestartet, `priority: high`',
      url === `${rvImgDir(ts0)}/meta.json` && calls.length === 2
      && calls[0].url === `${rvImgDir(ts0)}/meta.json` && calls[1].url === `${rvImgDir(ts0)}/${radarImgFrameFile(0)}`
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
    add('[warm] RV: zweiter Aufruf im Fenster ist No-op', warmRvTar(T + 1000) === url2 && calls.length === 2);
    const w = takeWarmRvTar(url2, T + 2000);
    const wf = takeWarmRvTar(`${rvImgDir(ts0)}/${radarImgFrameFile(0)}`, T + 2000);
    add('[warm] RV: `take` je URL genau einmal, Antwort samt `fromCache=false`', !!w && !!wf && (await w).fromCache === false && (await w).res.ok && takeWarmRvTar(url2, T + 2000) === null && _warmRvCount() === 0);
    add('[warm] RV: nach 5 min liefert `take` null', (warmRvTar(T), takeWarmRvTar(url2, T + RV_WARM_TTL_MS + 1) === null));
    add('[warm] RV-Tar: Fehlschlag des Frühstarts wird nicht als unbehandelt gemeldet', await (async () => { globalThis.fetch = async () => { throw new Error('offline'); }; _resetWarmRv(); const u = warmRvTar(T); const p = takeWarmRvTar(u, T); return await p.then(() => false, (e) => e.message === 'offline'); })());
  } finally {
    globalThis.fetch = realFetch; _resetWarmManifests(); _resetWarmRv();
  }
}
add('[warm] radolan.ts exportiert dieselbe `guessRvRuns` (Re-Export, kein Nachbau)', guessViaRadolan === guessRvRuns);
add('[router] Frühstart an Wetterkarte, Warnungen und Regenradar verdrahtet', ['wetterkarte', 'warnungen', 'regenradar'].every((id) => new RegExp(`sub\\('${id}'\\)[^\\n]*'${id}'\\)`).test(routerSrc)) && !/sub\('vorhersage'\)[^\n]*'vorhersage'\)/.test(routerSrc));

// Route-Shells (nur wenn `dist/` gebaut ist — sonst übersprungen, nicht rot).
const shellOf = (id) => { const p = join(ROOT, 'dist', `${id}.html`); return existsSync(p) ? readFileSync(p, 'utf8') : null; };
const wkShell = shellOf('wetterkarte'), rrShell = shellOf('regenradar'), fcShell = shellOf('vorhersage');
if (wkShell && rrShell) {
  const pre = (s, re) => new RegExp(`<link rel="modulepreload" crossorigin href="/assets/${re}-[\\w-]+\\.js" />`).test(s);
  add('[shell] wetterkarte.html lädt Route-Chunk, MapView und maplibre vor', pre(wkShell, 'WetterkarteRoute') && pre(wkShell, 'MapView') && pre(wkShell, 'maplibre'));
  add('[shell] wetterkarte.html lädt die Karten-CSS vor (mit `crossorigin`, wie Vites Stylesheet-Link)', /<link rel="preload" as="style" crossorigin href="\/assets\/maplibre-[\w-]+\.css" \/>/.test(wkShell));
  add('[shell] regenradar.html lädt NowcastRoute und maplibre vor, nicht MapView', pre(rrShell, 'NowcastRoute') && pre(rrShell, 'maplibre') && !pre(rrShell, 'MapView'));
  add('[shell] preconnect: Wetterkarte → openfreemap/jsDelivr/S3, Regenradar → GeoSphere + geo.admin', ['tiles.openfreemap.org', 'cdn.jsdelivr.net', 's3.amazonaws.com'].every((h) => wkShell.includes(`<link rel="preconnect" href="https://${h}" crossorigin />`)) && ['dataset.api.hub.geosphere.at', 'data.geo.admin.ch'].every((h) => rrShell.includes(`<link rel="preconnect" href="https://${h}" crossorigin />`)) && !rrShell.includes('s3.amazonaws.com'));
  const dup = (s) => { const hs = [...s.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith('/assets/')); return hs.length !== new Set(hs).size; };
  add('[shell] kein Asset zweimal verlinkt (index.html-Preloads werden nicht wiederholt)', !dup(wkShell) && !dup(rrShell));
  add('[shell] vorhersage.html trägt keine Karten-Preconnects', !fcShell || !fcShell.includes('rel="preconnect"'));
} else {
  add('[shell] Route-Shells nicht geprüft — `dist/` fehlt (erst `npm run build`)', true, 'übersprungen');
}

// --- Ausgabe ----------------------------------------------------------------------
console.log('\nPfad-Routing (Phase RT1):\n');
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok || !c.detail ? '' : `  — ${c.detail}`}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n  ${checks.length - failed}/${checks.length} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
