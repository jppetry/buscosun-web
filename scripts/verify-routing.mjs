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

import { ROUTES, ROUTE_BY_ID, SITE_URL, routeForPath, verifyRoutes, aliasTarget } from '../src/router/routes.ts';
import { verifyUrlState, mapPathForPlace } from '../src/router/urlState.ts';
import { verifyLegacyHash } from '../src/router/legacyHash.ts';
import { verifyFireRouteView } from '../src/fire/fireRouteView.ts';
import { SITE, mapPermalink } from './seo/content.mjs';
import { TOOLS } from './seo/tools.mjs';

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
add('[netlify] keine Regel mit from ≡ to (Loop-Schutz)', !rules.some((x) => x.from && x.to && x.from.replace(/\/$/, '') === x.to.replace(/\/$/, '')));
add('[netlify] Proxy-Rewrites unverändert vorhanden', ['/_dwd_opendata/*', '/_meteoalarm/*', '/_gfs/*', '/_cscs/*', '/_mf/*', '/_ecmwf/*'].every((p) => rules.some((x) => x.from === p && x.status === 200 && x.force)));
add('[netlify] Proxys stehen VOR den App-Regeln', idx((x) => x.from === '/_ecmwf/*') < idx((x) => x.to && x.to.endsWith('.html') && x.status === 200));

// --- (4) Service Worker ---------------------------------------------------------
const sw = readFileSync(join(ROOT, 'public', 'sw.js'), 'utf8');
add('[sw] VERSION ist v2 (Caches der Hash-Ära werden verworfen)', /const VERSION = 'v2'/.test(sw));
add('[sw] Shell-Cache nur für App-HTML (id="root"), nicht für statische SEO-Seiten', sw.includes('id="root"'));

// --- (5) Router-Datei deckt alle Routen ab (Textsonde auf Werte, nicht Zeilen) -------
const routerSrc = readFileSync(join(ROOT, 'src', 'router', 'router.tsx'), 'utf8');
const notRouted = ROUTES.filter((r) => r.id !== 'home' && !routerSrc.includes(`sub('${r.id}')`)).map((r) => r.id);
add('[router] jede Route der Tabelle ist im Router verdrahtet', notRouted.length === 0, notRouted.join(', '));
add('[router] Alias-Auflösung ist bijektiv zur Tabelle', ROUTES.every((r) => r.aliases.every((a) => aliasTarget(a) === r.path)) && ROUTE_BY_ID.warnungen.aliases.length === 2);

// --- Ausgabe ----------------------------------------------------------------------
console.log('\nPfad-Routing (Phase RT1):\n');
for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name}${c.ok || !c.detail ? '' : `  — ${c.detail}`}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n  ${checks.length - failed}/${checks.length} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
