/**
 * shellServer.mjs — serves a production build (`dist/`) the way Netlify does, in its OWN process (the measuring process is busy
 * with the DevTools stream; a proxy inside it delayed local chunks by up to 4 s and made every number noisy):
 *
 *   - document requests ⇒ the route shell (`<route>--<sub>.html`, `<route>.html`, else `index.html`), `max-age=0, must-revalidate`
 *   - files from `dist/` with Netlify's cache headers (`/assets/*`, `/fonts/*` immutable for a year, `/og/*` a day, else revalidate)
 *     and an ETag (304 on `If-None-Match`, as Netlify answers a revalidation)
 *   - brotli when the browser accepts it (compressed once per file, kept in memory) — Netlify compresses text the same way
 *   - HTTP/2 over TLS when a certificate is given (Netlify's transport), else HTTP/1.1
 *
 *   node scripts/lib/shellServer.mjs <dist> [--cert=cert.pem --key=key.pem]      prints `READY <url>` on stdout
 */
import http from 'node:http';
import http2 from 'node:http2';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { brotliCompressSync, constants as zc } from 'node:zlib';

const [dist, ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a, '1']; }));
if (!dist || !existsSync(join(dist, 'index.html'))) { console.error(`dist fehlt: ${dist}`); process.exit(2); }

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.bin': 'application/octet-stream',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.ico': 'image/x-icon' };
const COMPRESS = /^(text\/|application\/(json|geo\+json|javascript|xml|manifest\+json|wasm)|image\/svg)/;

function shellFor(pathname) {
  const seg = pathname.split('/').filter(Boolean);
  if (!seg.length) return join(dist, 'index.html');
  if (seg.length >= 2 && existsSync(join(dist, `${seg[0]}--${seg[1]}.html`))) return join(dist, `${seg[0]}--${seg[1]}.html`);
  if (existsSync(join(dist, `${seg[0]}.html`))) return join(dist, `${seg[0]}.html`);
  return join(dist, 'index.html');
}
function cacheControl(pathname) {
  if (/^\/(assets|fonts)\//.test(pathname)) return 'public, max-age=31536000, immutable';
  if (/^\/og\//.test(pathname)) return 'public, max-age=86400';
  return 'public, max-age=0, must-revalidate';
}
const memo = new Map();
function load(file) {
  const st = statSync(file);
  const key = `${file}:${st.mtimeMs}:${st.size}`;
  let m = memo.get(file);
  if (!m || m.key !== key) {
    const raw = readFileSync(file);
    const type = TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
    m = { key, raw, type, etag: `"${createHash('sha1').update(raw).digest('hex').slice(0, 16)}"`, br: null };
    memo.set(file, m);
  }
  if (!m.br && COMPRESS.test(m.type) && m.raw.length > 512) m.br = brotliCompressSync(m.raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 5 } });
  return m;
}

function handler(req, res) {
  let u;
  try { u = new URL(req.url, 'http://x'); } catch { res.writeHead(400); res.end(); return; }
  const pathname = decodeURIComponent(u.pathname);
  const accept = String(req.headers.accept ?? '');
  let file = null;
  if (req.method === 'GET' && /text\/html/.test(accept) && !/\.[a-z0-9]{2,12}$/i.test(pathname)) file = shellFor(pathname);
  else {
    const p = normalize(join(dist, pathname));
    if (!p.startsWith(normalize(dist))) { res.writeHead(403); res.end(); return; }
    if (existsSync(p) && statSync(p).isFile()) file = p;
    else if (existsSync(join(p, 'index.html'))) file = join(p, 'index.html');
  }
  if (!file) { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found'); return; }
  const m = load(file);
  const isDoc = file.endsWith('.html');
  const headers = { 'content-type': m.type, 'cache-control': isDoc ? 'public, max-age=0, must-revalidate' : cacheControl(pathname), etag: m.etag, vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === m.etag) { res.writeHead(304, headers); res.end(); return; }
  const br = m.br && /\bbr\b/.test(String(req.headers['accept-encoding'] ?? ''));
  const body = br ? m.br : m.raw;
  if (br) headers['content-encoding'] = 'br';
  headers['content-length'] = String(body.length);
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const srv = opt.cert ? http2.createSecureServer({ cert: readFileSync(opt.cert), key: readFileSync(opt.key), allowHTTP1: true }, handler) : http.createServer(handler);
srv.listen(Number(opt.port ?? 0), '127.0.0.1', () => console.log(`READY ${opt.cert ? 'https' : 'http'}://127.0.0.1:${srv.address().port}`));
