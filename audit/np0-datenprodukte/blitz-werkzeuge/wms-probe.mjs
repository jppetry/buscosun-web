// WMS-GetMap-Probe: Dauer, Bytes, Farbmenge. node wms-probe.mjs <src bd|mtg> <TIME|now> <bbox3857> <w> <h> <tag> [extra]
import { decodePng, toRgba } from 'file:///C:/dev/buscosun-web/scripts/lib/png.mjs';
import { writeFileSync } from 'node:fs';
const [src, T, bbox, w, h, tag, extra = ''] = process.argv.slice(2);
const base = src === 'bd'
  ? 'https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.1.1&request=GetMap&layers=dwd:Blitzdichte&styles='
  : 'https://view.eumetsat.int/geoserver/mtg_fd/wms?service=WMS&version=1.1.1&request=GetMap&layers=mtg_fd:li_afa&styles=';
const url = `${base}&bbox=${bbox}&width=${w}&height=${h}&srs=EPSG:3857&format=image/png&transparent=true${T === 'now' ? '' : `&time=${T}`}${extra}`;
const t0 = Date.now();
const r = await fetch(url);
const b = Buffer.from(await r.arrayBuffer());
const ms = Date.now() - t0;
const ct = r.headers.get('content-type');
if (!/png/.test(ct)) { console.log(tag, r.status, ct, b.toString('utf8', 0, 400)); process.exit(1); }
writeFileSync(`wms-${tag}.png`, b);
let info = '';
try {
  const d = decodePng(b); const px = toRgba(d);
  const cols = new Map();
  for (let i = 0; i < px.length; i += 4) { const k = `${px[i]},${px[i + 1]},${px[i + 2]},${px[i + 3]}`; cols.set(k, (cols.get(k) || 0) + 1); }
  info = `ct${d.channels} distinct=${cols.size} ` + [...cols.entries()].sort((a, c) => c[1] - a[1]).slice(0, 30).map(([k, n]) => `${k}:${n}`).join(' ');
} catch (e) { info = `decode: ${e.message} (Farbtyp ${b[25]})`; }
console.log(`${tag} ${r.status} ${b.length}B ${ms}ms ${info}`);
