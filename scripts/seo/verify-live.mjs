/**
 * Live-Prüfung eines Deploys (SEO/GEO 2026, VERIFY.md V-2 … V-5, V-9, V-13).
 *
 *   node scripts/seo/verify-live.mjs https://deploy-preview-2--weatherhub94.netlify.app
 *   node scripts/seo/verify-live.mjs https://buscosun.com --sample 40
 *
 * Holt robots.txt + sitemap.xml vom Ziel, ruft jede Sitemap-URL als Googlebot ab
 * und prüft Roh-HTML (Status, Title, Self-Canonical, H1, Description, JSON-LD,
 * kein hreflang), dazu Ebene-B-Header, Manifest-MIME, 404/301-Verhalten.
 * Reines Node ≥ 22 (globales fetch), keine Abhängigkeiten. Exit ≠ 0 bei Fehlern.
 * `--sample N` prüft nur die ersten N Sitemap-URLs (Ortsseiten sind gleichförmig).
 */

const base = (process.argv[2] || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) { console.error('Aufruf: verify-live.mjs <base-url> [--sample N]'); process.exit(2); }
const sampleArg = process.argv.indexOf('--sample');
const sample = sampleArg > 0 ? Number(process.argv[sampleArg + 1]) : 0;
const UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const CANON_ORIGIN = 'https://buscosun.com';

let checks = 0, failures = 0;
const ok = (msg) => { checks++; };
const fail = (msg) => { failures++; console.error(`  ✗ ${msg}`); };
const expect = (cond, msg) => (cond ? ok(msg) : fail(msg));

async function get(path, opts = {}) {
  const res = await fetch(base + path, { headers: { 'user-agent': UA, ...(opts.headers || {}) }, redirect: 'manual' });
  const text = opts.head ? '' : await res.text();
  return { status: res.status, headers: res.headers, text, location: res.headers.get('location') };
}

const attr = (html, re) => (html.match(re) || [])[1];

// 1) robots.txt
{
  const r = await get('/robots.txt');
  expect(r.status === 200, 'robots.txt 200');
  const t = r.text.replace(/\r\n/g, '\n');
  for (const p of ['/_dwd_opendata/', '/_meteoalarm/', '/_gfs/', '/_firms', '/params/', '/fire/', '/sw.js']) expect(t.includes(`Disallow: ${p}\n`), `robots: Disallow ${p}`);
  expect(!t.includes('Disallow: /assets'), 'robots: /assets/ nicht gesperrt');
  expect(t.includes('Sitemap: https://buscosun.com/sitemap.xml'), 'robots: Sitemap-Zeile');
}

// 2) Header (Ebene B, Cache)
{
  const home = await get('/');
  const js = attr(home.text, /src="\/(assets\/index-[\w-]+\.js)"/);
  expect(!!js, 'index.html verweist auf assets/index-*.js');
  if (js) {
    const r = await get('/' + js, { head: true });
    expect(r.status === 200, `assets/index-*.js für Googlebot abrufbar (200) — ist ${r.status}`);
    expect(/noindex/.test(r.headers.get('x-robots-tag') || ''), `assets/index-*.js X-Robots-Tag noindex — ist "${r.headers.get('x-robots-tag')}"`);
    expect(/immutable/.test(r.headers.get('cache-control') || ''), `assets/index-*.js Cache-Control immutable — ist "${r.headers.get('cache-control')}"`);
  }
  const mf = await get('/manifest.webmanifest', { head: true });
  expect(/application\/manifest\+json/.test(mf.headers.get('content-type') || ''), `manifest.webmanifest MIME — ist "${mf.headers.get('content-type')}"`);
  for (const p of ['/latest-grib.json', '/sw.js']) {
    const r = await get(p, { head: true });
    expect(/noindex/.test(r.headers.get('x-robots-tag') || ''), `${p} X-Robots-Tag noindex — ist "${r.headers.get('x-robots-tag')}"`);
  }
  const html = await get('/wetterkarte', { head: true });
  expect(/max-age=0/.test(html.headers.get('cache-control') || ''), 'HTML bleibt max-age=0');
  // Proxys: Header wirken dort nicht — nur Status dokumentieren.
  const px = await get('/_dwd_opendata/', { head: true });
  console.log(`  ℹ /_dwd_opendata/ antwortet ${px.status} (robots-gesperrt; Header-Schutz nicht möglich, s. MANUELLE-SCHRITTE Nr. 8)`);
}

// 3) 404 / 301
{
  const nf = await get('/gibt-es-nicht-' + Date.now(), { head: true });
  expect(nf.status === 404, `unbekannter Pfad → 404 (ist ${nf.status})`);
  for (const [from, to] of [['/karte', '/wetterkarte'], ['/wetterkarte/', '/wetterkarte'], ['/radar', '/regenradar'], ['/wetterkarte/warnungen', '/warnungen'], ['/route/3d', '/tourenplanung/3d']]) {
    const r = await get(from, { head: true });
    const loc = (r.location || '').replace(/^https?:\/\/[^/]+/, '');
    expect(r.status === 301 && loc === to, `${from} → 301 ${to} (ist ${r.status} ${loc || '—'})`);
  }
}

// 4) Sitemap + jede URL
const sm = await get('/sitemap.xml');
expect(sm.status === 200, 'sitemap.xml 200');
let locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
expect(locs.length > 100, `sitemap enthält ${locs.length} URLs`);
expect(locs.every((l) => l.startsWith(CANON_ORIGIN + '/')), 'alle Sitemap-URLs auf buscosun.com');
expect(!/<changefreq>/.test(sm.text), 'sitemap ohne changefreq');
const mods = new Set([...sm.text.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]));
expect(mods.size >= 2, `sitemap lastmod aus dem Inhalt (${mods.size} Daten)`);
if (sample > 0) {
  // App-Routen + Sub-Routen immer, Rest gesampelt.
  const app = locs.filter((l) => !/\/(wetter|wissen|funktionen|wetterlage|impressum|datenschutz|kontakt|lizenzen)\//.test(l));
  const rest = locs.filter((l) => !app.includes(l));
  locs = [...app, ...rest.filter((_, i) => i % Math.ceil(rest.length / sample) === 0)];
}
const parentTitle = new Map();
async function checkUrl(loc) {
  const path = loc.slice(CANON_ORIGIN.length);
  const r = await get(path);
  if (r.status !== 200) { fail(`${path}: Status ${r.status}`); return; }
  const h = r.text;
  const title = attr(h, /<title>([^<]*)<\/title>/);
  const canon = attr(h, /<link rel="canonical" href="([^"]+)"/);
  const desc = attr(h, /<meta name="description" content="([^"]*)"/);
  const problems = [];
  if (!title) problems.push('kein <title>');
  if (canon !== loc) problems.push(`canonical ${canon} ≠ ${loc}`);
  if (!/<h1[\s>]/.test(h)) problems.push('keine H1');
  if (!desc) problems.push('keine description');
  if (/hreflang=/.test(h)) problems.push('hreflang vorhanden');
  if (!/application\/ld\+json/.test(h)) problems.push('kein JSON-LD');
  if (/name="robots" content="noindex/.test(h)) problems.push('noindex in der Sitemap');
  const m = path.match(/^\/([a-z]+)\/([a-z0-9-]+)$/);
  if (m) {
    const pt = parentTitle.get(m[1]);
    if (pt && pt === title) problems.push('Title = Eltern-Shell');
  } else if (/^\/[a-z]+$/.test(path)) parentTitle.set(path.slice(1), title);
  if (problems.length) fail(`${path}: ${problems.join('; ')}`); else ok(path);
}
// Eltern zuerst (Title-Vergleich), dann parallel in Achtergruppen.
const parents = locs.filter((l) => /^https:\/\/buscosun\.com\/[a-z]+$/.test(l));
for (const l of parents) await checkUrl(l);
const others = locs.filter((l) => !parents.includes(l));
for (let i = 0; i < others.length; i += 8) await Promise.all(others.slice(i, i + 8).map(checkUrl));

// 5) llms.txt
{
  const r = await get('/llms.txt');
  expect(r.status === 200 && /^# buscosun/.test(r.text), 'llms.txt 200 mit Titel');
  expect(!/buscosun\.app/.test(r.text), 'llms.txt ohne buscosun.app');
}

console.log(`\n[verify-live] ${base}: ${checks} Checks ok, ${failures} Fehler (${locs.length} Sitemap-URLs geprüft).`);
process.exit(failures ? 1 : 0);
