/*
 * buscosun · Service Worker — Offline-Shell + Runtime-Cache (backend-frei).
 *
 * Strategie:
 *  - Navigationen: network-first → bei Offline gecachte index.html (App lädt
 *    auch ohne Empfang, z. B. am Berg, sofern einmal online geladen).
 *  - Same-Origin gehashte Assets (js/css/wasm/…): cache-first /
 *    stale-while-revalidate (Vite-Hashes sind immutable). AUSGENOMMEN das
 *    Live-Manifest `/latest-grib.json` (`LIVE_RE`, BW-10) — es ist nicht
 *    gehasht, sein Inhalt ist die Frische → network-first wie Wetterdaten.
 *  - Übriges GET (Wetter-APIs, Kartenkacheln): network-first → Cache-Fallback,
 *    Cache gedeckelt (FIFO), damit zuletzt geladene Daten offline verfügbar sind.
 *
 * Kein Precache der Build-Assets (Hashes zur Build-Zeit unbekannt ohne Plugin):
 * Es wird gecacht, was beim ersten Online-Besuch tatsächlich geladen wurde.
 */

// v4 + Ladezeit (2026-11-10): (1) Nur `/assets/*` und `/fonts/*` sind wirklich gehasht bzw.
// unveränderlich — sie kommen cache-first (vorher stale-while-revalidate: JEDES Laden holte jeden
// Chunk ein zweites Mal und schrieb ihn neu in den Cache). (2) Die übrigen Dateien der Herkunft
// (`/fire/effis-season-europe-v1.json`, `/countries/*`, `/params/*` …) tragen keinen Hash: sie
// liefen bisher ebenfalls durch den nie ablaufenden Asset-Cache und zeigten nach einem Deploy
// die ALTE Fassung zuerst — jetzt network-first (der HTTP-Cache revalidiert, 304), Cache nur
// offline. (3) Der Offline-Rückfall für Daten hat eine Gültigkeitsdauer je Datenart (`maxAgeOf`):
// ältere Einträge werden nicht mehr ausgeliefert, die Seite zeigt dann ihren Fehlerzustand statt
// alter Wetter-, Brand- oder Verkehrsdaten.
// v4 (2026-08-26, Phase BW-10): die Live-Manifeste `/latest-{grib,wind}.json`
// gehen am Asset-Zweig VORBEI (network-first) — unter `ASSET_RE` bekamen sie
// stale-while-revalidate aus einem Cache, der nie abläuft, und jede Sitzung sah
// den Lauf der VORIGEN (gemessen 12z statt 21z, 9 h alt; audit/bandbreite.md §29).
// Der Bump löscht den vergifteten `bsc-assets-v3` in jedem Bestandsbrowser.
// v3 (2026-08-24, Phase BW-3): das Daten-CDN wird DURCHGEREICHT, s. u.
// v2 (2026-08-22, Phase RT1): Pfad-Routing — die Navigations-Antwort wird nur
// noch dann als Offline-Shell gespeichert, wenn sie die App-Shell IST (enthält
// `id="root"`); vorher überschrieb jede statische SEO-Seite (/wetter/…) die Shell.
const VERSION = 'v4';
const SHELL = `bsc-shell-${VERSION}`;
const ASSETS = `bsc-assets-${VERSION}`;
const DATA = `bsc-data-${VERSION}`;
/** Abrufzeit je Eintrag in `DATA` (Schlüssel = URL, Inhalt = ms seit Epoche) — auch für opake Antworten, deren Kopfzeilen
 *  nicht lesbar sind. Ein Eintrag ohne Zeit (aus der Zeit vor 10.11.) gilt als unbekannt alt und wird nicht ausgeliefert. */
const META = `bsc-meta-${VERSION}`;
const DATA_MAX = 350; // max. Einträge im Daten-/Kachel-Cache

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['/', '/index.html']).catch(() => {})),
  );
});

// Übernahme auf Zuruf (BW-11). `skipWaiting()` im `install` allein genügt in der
// Praxis NICHT: gemessen am 2026-08-26 stand der v4-Worker in einem
// Bestandsbrowser als `installed` (waiting), während der ALTE Worker weiter
// bediente — mitsamt seiner `bsc-assets-v2`-Einträge für
// `/latest-{grib,wind}.json`. Die BW-10-Korrektur erreichte solche Browser damit
// nie. `main.tsx` schickt diese Nachricht, sobald ein neuer Worker bereitsteht.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => ![SHELL, ASSETS, DATA, META].includes(k)).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/** Host des Daten-CDNs (Phase BW-3). Seine URLs tragen einen Commit-SHA und
 *  antworten mit `immutable, max-age=31536000` — der HTTP-Cache des Browsers
 *  macht die Arbeit besser als wir. Würden wir sie zusätzlich in `bsc-data`
 *  legen, lägen dieselben ~5 MB je Lauf ein zweites Mal im Speicher und
 *  verdrängten per FIFO (350 Einträge) genau die Wetterdaten, für die der
 *  Cache gedacht ist — dieselbe Falle wie V-BW-7 bei den GRIB-Dateien. */
const DATA_CDN_HOST = 'cdn.jsdelivr.net';

const ASSET_RE = /\.(?:js|mjs|css|woff2?|ttf|otf|wasm|png|svg|jpe?g|webp|gif|json|geojson)$/i;
/** Live-Manifest des Warm-Crons: same-origin und `.json`, aber NICHT gehasht —
 *  sein Inhalt IST die Frische. Es gehört in den network-first-Zweig unten; ein
 *  `cache: 'no-store'` der App hilft hier nicht, der Worker greift VOR dem
 *  HTTP-Cache (BW-10, audit/bandbreite.md §29.1 B).
 *
 *  BW-13 (§32): `/latest-wind.json` ist entfallen — der Windlayer liest Lauf und
 *  Bilder aus dem Index des Daten-Repos, und dessen Host (`DATA_CDN_HOST`) wird
 *  oben ohnehin unangetastet ans Netz durchgereicht. Bleibt das Grib-Manifest. */
const LIVE_RE = /^\/latest-grib\.json$/;
/** Gehasht (Vite) oder unveränderlich (Schriften): netlify.toml liefert beide `immutable` aus. */
const IMMUTABLE_RE = /^\/(?:assets|fonts)\//;
function isImmutable(url) {
  return url.origin === self.location.origin && IMMUTABLE_RE.test(url.pathname);
}
/** Übrige statische Dateien der Herkunft — ohne Hash, ihr Inhalt wechselt mit dem Deploy. */
function isStaticFile(url) {
  return url.origin === self.location.origin && ASSET_RE.test(url.pathname) && !LIVE_RE.test(url.pathname);
}

/**
 * Gültigkeitsdauer des Offline-Rückfalls je Datenart. Basiskarte, Gelände, Satellitenszenen und Ortssuche ändern sich nicht
 * mit dem Wetter: 30 Tage. Alles Übrige (Wetter, Warnungen, Brände, Verkehr, Seegang, Pegel) ist Live-Information: 1 Stunde —
 * älter wird es offline nicht mehr gezeigt, die Seite meldet dann „nicht erreichbar".
 */
const STABLE_HOST_RE = /(?:^|\.)(?:tiles\.openfreemap\.org|elevation-tiles-prod\.s3\.amazonaws\.com|server\.arcgisonline\.com|sentinel-cogs\.s3\.us-west-2\.amazonaws\.com|nominatim\.openstreetmap\.org)$/;
const DAY_MS = 24 * 3600 * 1000;
function maxAgeOf(url) {
  return STABLE_HOST_RE.test(url.hostname) ? 30 * DAY_MS : 3600 * 1000;
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  const meta = cacheName === DATA ? await caches.open(META) : null;
  for (let i = 0; i < keys.length - max; i++) {
    await cache.delete(keys[i]);
    if (meta) await meta.delete(keys[i].url);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  // Daten-CDN: unangetastet an das Netz durchreichen (kein respondWith).
  if (url.hostname === DATA_CDN_HOST) return;

  // App-Navigation → network-first, Offline-Fallback auf gecachte Shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const net = await fetch(req);
        // Nur die App-Shell (index.html bzw. die Route-Shells /<route>.html, alle
        // mit `id="root"`) als Offline-Fallback merken — nicht die statischen
        // SEO-Seiten, die sonst jede App-Route offline ersetzen würden.
        if (net && net.ok) {
          net.clone().text().then(async (html) => {
            if (!html.includes('id="root"')) return;
            const cache = await caches.open(SHELL);
            await cache.put('/index.html', new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }));
          }).catch(() => {});
        }
        return net;
      } catch {
        const cache = await caches.open(SHELL);
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Gehashte / unveränderliche Assets → cache-first (der Name wechselt mit dem Inhalt).
  if (isImmutable(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
      return res;
    })());
    return;
  }

  // Ungehashte Dateien der Herkunft → network-first (HTTP-Revalidierung), Cache nur offline.
  if (isStaticFile(url)) {
    event.respondWith((async () => {
      const cache = await caches.open(ASSETS);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // Wetterdaten / Kacheln → network-first, Cache-Fallback nur innerhalb der Gültigkeitsdauer.
  event.respondWith((async () => {
    const cache = await caches.open(DATA);
    try {
      const net = await fetch(req);
      if (net && (net.ok || net.type === 'opaque')) {
        const at = String(Date.now());
        cache.put(req, net.clone())
          .then(() => caches.open(META)).then((meta) => meta.put(req.url, new Response(at)))
          .then(() => trim(DATA, DATA_MAX)).catch(() => {});
      }
      return net;
    } catch {
      const hit = await cache.match(req);
      if (!hit) return Response.error();
      const stamp = await (await caches.open(META)).match(req.url);
      const at = stamp ? Number(await stamp.text()) : NaN;
      return Number.isFinite(at) && Date.now() - at <= maxAgeOf(url) ? hit : Response.error();
    }
  })());
});
