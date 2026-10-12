// Local static server for the glacier data repo (verification only): `node scripts/glacier/serve-data.mjs <dir> [port]`.
// Serves <dir> (a root that contains `glacier/v1/` — static builds and the refreshed lines in ONE tree, like the assembled view of the workflows)
// at http://127.0.0.1:<port>/ with CORS * and no caching — the page reads it through `?glbase=http://127.0.0.1:<port>/glacier/v1`
// (loopback only, src/glacier/glacierClient.ts).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, normalize, extname } from 'node:path';

const root = normalize(process.argv[2] ?? 'C:/dev/buscosun-glacier-cache/view');
const port = Number(process.argv[3] ?? 5192);
const TYPES = { '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const file = normalize(join(root, decodeURIComponent(url.pathname)));
  const head = { 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
  if (!file.startsWith(root)) { res.writeHead(403, head).end(); return; }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    const buf = await readFile(file);
    res.writeHead(200, { ...head, 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'content-length': buf.length }).end(buf);
  } catch { res.writeHead(404, head).end('not found'); }
}).listen(port, '127.0.0.1', () => console.log(`serving ${root} on http://127.0.0.1:${port}/`));
